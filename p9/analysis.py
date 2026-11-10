"""把合成数据跑过全部模型，产出 (result, app_data)。

result：写进 results/<RUN_ID>/result.json 的指标（STATUS / README 里的数字都以它为准）。
app_data：页面需要的数据，按角色分区（区域 / 学校 / 班级 / 学生），由 build.py 写成 app/data.js。
"""
from __future__ import annotations

import copy
import time

import numpy as np
from sklearn.metrics import roc_auc_score

from . import config as C
from . import cdm, guidance, irt_cat, kt, screen, synth

K = len(C.KCS)


def _rng(i: int) -> np.random.Generator:
    return np.random.default_rng([C.SEED, i])


def _r(x, n=3):
    return None if x is None else round(float(x), n)


def run(p3: dict, p4: dict, log=print, p4_view: dict | None = None) -> tuple[dict, dict, dict]:
    t_start = time.time()
    students = synth.roster(_rng(1), p4)
    by_sid = {s.sid: s for s in students}
    quiz = synth.weekly_quiz(_rng(2), students)
    alist, hw = synth.homework(_rng(3), students, p4)
    ktd = synth.kt_sequences(_rng(4), students)
    seqs = ktd["seqs"]
    log(f"合成学生 {len(students)} 人，作答 {sum(len(v['obs']) for v in seqs.values())} 次")

    # 学业：本学期第 6 周三科周测平均；班内后 1/3 记为 academic_low（供 p3 风险模型使用）
    acad = {s.sid: float(np.mean([quiz[s.sid][k][-1] for k, _ in synth.SUBJECTS])) for s in students}
    academic_low = {}
    for g in C.GRADES:
        for c in range(1, C.CLASSES_PER_GRADE + 1):
            ids = [s.sid for s in students if s.grade == g and s.class_no == c]
            cut = np.quantile([acad[i] for i in ids], 1 / 3)
            for i in ids:
                academic_low[i] = int(acad[i] <= cut)
    psy = synth.psych_factors(_rng(5), students, p3, academic_low)

    # ------------------------------------------------------------------ 知识追踪
    focal_ids = [s.sid for s in students if (s.grade, s.class_no) == C.FOCAL_CLASS]
    others = [s.sid for s in students if s.sid not in set(focal_ids)]
    rng = _rng(6)
    perm = rng.permutation(len(others))
    n_test = int(round(0.3 * len(others)))
    test_ids = [others[i] for i in perm[:n_test]]
    train_all = [others[i] for i in perm[n_test:]]
    n_val = int(round(0.15 * len(train_all)))
    val_ids, train_ids = train_all[:n_val], train_all[n_val:]
    S = lambda ids: [(seqs[i]["kc"], seqs[i]["obs"]) for i in ids if len(seqs[i]["obs"]) > 1]  # noqa: E731

    t0 = time.time()
    bkt_params = kt.bkt_train(S(train_all), K)
    t_bkt = time.time() - t0
    t0 = time.time()
    pfa = kt.pfa_train(S(train_all), K)
    t_pfa = time.time() - t0
    t0 = time.time()
    best, best_auc, hist = None, -1, []
    model = kt.DKTLite(K, H=32, seed=C.SEED % 1000)

    def _log(rec):
        nonlocal best, best_auc
        hist.append(rec)
        if rec["val_auc"] > best_auc:
            best_auc, best = rec["val_auc"], (rec["epoch"], copy.deepcopy(model.params))

    model.fit(S(train_ids), epochs=40, batch=32, lr=0.01, seed=7, val=S(val_ids), log=_log)
    model.params = best[1]
    t_dkt = time.time() - t0
    kc_rate = np.array([np.concatenate([o[k_ == k] for k_, o in S(train_all)]).mean() for k in range(K)])

    def preds(ids):
        out = {m: [] for m in ("baseline", "pfa", "bkt", "dkt", "oracle")}
        ys = []
        for i in ids:
            kc_, o = seqs[i]["kc"], seqs[i]["obs"]
            if len(o) < 2:
                continue
            item = seqs[i]["item"]
            truth = seqs[i]["truth"]
            p_b, _ = kt.bkt_trace(kc_, o, bkt_params)
            p_d, _ = model.predict_seq(kc_, o)
            p_p = pfa.predict_proba(kt.pfa_features(kc_, o, K))[:, 1]
            mastered = truth[np.arange(len(o)), kc_]
            p_o = np.where(mastered == 1, 1 - ktd["slip"][item], ktd["guess"][item])
            sl = slice(1, None)  # 不计每个学生的第一题（所有模型都还没有任何历史）
            out["baseline"].append(kc_rate[kc_][sl])
            out["pfa"].append(p_p[sl])
            out["bkt"].append(p_b[sl])
            out["dkt"].append(p_d[sl])
            out["oracle"].append(p_o[sl])
            ys.append(o[sl])
        return out, ys

    pt, yt = preds(test_ids)
    auc = {m: kt.auc_with_ci(v, yt, B=300, seed=11) for m, v in pt.items()}
    log("知识追踪 AUC（留出学生）：" + "，".join(f"{m} {v['value']}" for m, v in auc.items()))
    # 公平性：按性别、留守分组
    fair = {}
    for gname, fn in (("female", lambda s: by_sid[s].female == 1), ("male", lambda s: by_sid[s].female == 0),
                      ("left_behind", lambda s: psy[s]["left_behind"] != "none"),
                      ("not_left_behind", lambda s: psy[s]["left_behind"] == "none")):
        ids = [i for i in test_ids if fn(i)]
        p_, y_ = preds(ids)
        fair[gname] = {"n_students": len(ids), "bkt": _r(roc_auc_score(np.concatenate(y_), np.concatenate(p_["bkt"])), 4),
                       "dkt": _r(roc_auc_score(np.concatenate(y_), np.concatenate(p_["dkt"])), 4)}

    # 每个学生每天结束时的掌握概率（BKT）与 DKT 预测；全校只保留最终值，初二(3)班保留逐日曲线
    n_days = ktd["n_days"]
    final_mastery, kt_focal = {}, {}
    for s in students:
        q = seqs[s.sid]
        kc_, o, day = q["kc"], q["obs"], q["day"]
        if len(o) == 0:
            final_mastery[s.sid] = bkt_params[:, 0].copy()
            continue
        _, mast = kt.bkt_trace(kc_, o, bkt_params)
        final_mastery[s.sid] = mast[-1]
        if s.sid in focal_ids:
            _, probs = model.predict_seq(kc_, o)
            daily_b = np.zeros((n_days, K))
            daily_d = np.zeros((n_days, K))
            daily_t = np.zeros((n_days, K))
            cur_b, cur_d, cur_t = bkt_params[:, 0].copy(), 1 / (1 + np.exp(-model.params["bo"])), q["truth"][0].copy()
            for dd in range(n_days):
                w = np.where(day == dd)[0]
                if len(w):
                    cur_b, cur_d = mast[w[-1]], probs[w[-1]]
                    # truth[t] 是作答 t 之前的状态；当天最后一次作答后的状态见 final 或下一条
                    nxt = w[-1] + 1
                    cur_t = q["truth"][nxt] if nxt < len(o) else q["final_state"]
                daily_b[dd], daily_d[dd], daily_t[dd] = cur_b, cur_d, cur_t
            n_by_kc = np.bincount(kc_, minlength=K)
            acc_by_kc = [float(o[kc_ == k].mean()) if n_by_kc[k] else None for k in range(K)]
            kt_focal[s.sid] = {"bkt": np.round(daily_b, 3).tolist(), "dkt": np.round(daily_d, 3).tolist(),
                               "truth": daily_t.astype(int).tolist(), "n_by_kc": n_by_kc.tolist(),
                               "acc_by_kc": [_r(a) for a in acc_by_kc],
                               "recent": [{"day": int(day[t]), "kc": int(kc_[t]), "item": int(q["item"][t]),
                                           "x": int(o[t])} for t in range(max(0, len(o) - 12), len(o))]}

    # ------------------------------------------------------------------ 认知诊断（DINA）
    cd = synth.cdm_test(_rng(7), students, ktd)
    t0 = time.time()
    fit = cdm.dina_fit(cd["X"], cd["Q"])
    t_dina = time.time() - t0
    ap = fit["attr_posterior"]
    attr_acc = ((ap > 0.5).astype(int) == cd["alpha"]).mean(0)
    pat_acc = float(((ap > 0.5).astype(int) == cd["alpha"]).all(1).mean())
    bkt_final = np.array([final_mastery[s.sid] for s in students])
    agree_bkt = ((ap > 0.5) == (bkt_final > 0.5)).mean(0)
    cdm_res = {"n_students": len(students), "n_items": int(cd["Q"].shape[0]), "n_attributes": K,
               "iterations": fit["iterations"],
               "attribute_accuracy": {C.KCS[k]["id"]: _r(attr_acc[k]) for k in range(K)},
               "attribute_accuracy_mean": _r(attr_acc.mean()), "pattern_accuracy": _r(pat_acc),
               "slip_rmse": _r(np.sqrt(((fit["slip"] - cd["slip"]) ** 2).mean()), 4),
               "guess_rmse": _r(np.sqrt(((fit["guess"] - cd["guess"]) ** 2).mean()), 4),
               "agreement_with_bkt": {C.KCS[k]["id"]: _r(agree_bkt[k]) for k in range(K)},
               "agreement_with_bkt_mean": _r(agree_bkt.mean()),
               "seconds": _r(t_dina, 2)}
    log(f"DINA：属性判定准确率 {cdm_res['attribute_accuracy_mean']}，模式完全正确 {cdm_res['pattern_accuracy']}")

    # ------------------------------------------------------------------ IRT 标定 + CAT
    bank = synth.irt_bank(_rng(8), students)
    t0 = time.time()
    a_hat, b_hat, cal = irt_cat.calibrate(bank["X"])
    t_cal = time.time() - t0
    study = irt_cat.simulate_cat_study(a_hat, b_hat, n_sim=1000, n_items=10, seed=C.SEED % 997)
    # 用真实参数作答、用估计参数估计，才是“标定误差也算进去”的诚实做法：重跑一遍，作答按真实参数生成
    rng_c = _rng(9)
    cat_focal = {}
    for s in students:
        if s.sid not in focal_ids:
            continue
        th = s.g_sub["math"]
        resp = lambda j, th=th: int(rng_c.random() < 1 / (1 + np.exp(-bank["a_true"][j] * (th - bank["b_true"][j]))))  # noqa: E731
        cat_focal[s.sid] = {"trace": irt_cat.run_cat(th, a_hat, b_hat, 10, responder=resp), "theta_true": _r(th, 3)}
    irt_res = {"n_items": len(a_hat), "n_calibration_examinees": int(bank["X"].shape[0]),
               "responses_per_examinee": int((~np.isnan(bank["X"][0])).sum()),
               "corr_a": _r(np.corrcoef(a_hat, bank["a_true"])[0, 1]), "corr_b": _r(np.corrcoef(b_hat, bank["b_true"])[0, 1]),
               "rmse_b": _r(np.sqrt(((b_hat - bank["b_true"]) ** 2).mean())), "iterations": cal["iterations"],
               "seconds": _r(t_cal, 2)}
    log(f"IRT 标定：a 相关 {irt_res['corr_a']}，b 相关 {irt_res['corr_b']}；CAT 第 10 题 RMSE "
        f"{study['maxinfo']['rmse_by_step'][-1]}（随机 {study['random']['rmse_by_step'][-1]}）")

    # ------------------------------------------------------------------ 群体心理风险（p3 模型）
    cm = p3["calc_model"]
    cols = cm["design_columns"]
    Xp = np.array([synth.design_row(psy[s.sid], cols) for s in students])
    pr = {}
    for o, om in cm["outcomes"].items():
        b0 = np.array([d[0] for d in om["draws"]])
        prev = np.array([d[1] for d in om["draws"]])
        beta = np.array([d[2] for d in om["draws"]])
        p = 1 / (1 + np.exp(-(b0[None, :] + Xp @ beta.T)))  # N×draws
        pr[o] = {"p": p, "rr": p / prev[None, :]}
    rr_point = pr["depression"]["rr"][:, 0]
    cut = np.quantile(rr_point, 1 - C.ATTENTION_TOP_SHARE)
    flag = {s.sid: bool(rr_point[i] >= cut) for i, s in enumerate(students)}

    def psych_group(mask, label):
        n = int(mask.sum())
        if n < C.SMALL_CELL_MIN:
            return {"label": label, "n": n, "suppressed": True}
        rec = {"label": label, "n": n, "suppressed": False}
        for o in ("depression", "anxiety"):
            m = pr[o]["p"][mask].mean(0)
            rec[o] = {"expected_rate": _r(m[0]), "ci": [_r(np.percentile(m, 2.5)), _r(np.percentile(m, 97.5))],
                      "expected_count": [int(np.floor(np.percentile(m, 2.5) * n)), int(np.ceil(np.percentile(m, 97.5) * n))]}
        sub = [psy[s.sid] for s, mk in zip(students, mask) if mk]
        rec["factors"] = {"left_behind": _r(np.mean([x["left_behind"] != "none" for x in sub])),
                          "left_behind_both": _r(np.mean([x["left_behind"] == "both" for x in sub])),
                          "boarding": _r(np.mean([x["boarding"] for x in sub])),
                          "sleep_short": _r(np.mean([x["sleep_short"] for x in sub])),
                          "ses_low": _r(np.mean([x["ses_low"] for x in sub])),
                          "bullied": _r(np.mean([x["bullied"] for x in sub])),
                          "pa_low": _r(np.mean([x["pa_low"] for x in sub]))}
        rec["attention_share"] = _r(np.mean([flag[s.sid] for s, mk in zip(students, mask) if mk]))
        return rec

    grade_arr = np.array([s.grade for s in students])
    psych_res = {"school": psych_group(np.ones(len(students), bool), C.SCHOOL_NAME),
                 "by_grade": [psych_group(grade_arr == g, C.GRADES[g]) for g in C.GRADES],
                 "attention_rule": f"按 p3 风险计算器的抑郁相对风险（点估计），全校最高的 {int(C.ATTENTION_TOP_SHARE * 100)}% 标为“建议关注”",
                 "attention_cut_rr": _r(cut)}

    # ------------------------------------------------------------------ 行为、雷达、成长曲线
    weeks = list(range(1, C.N_WEEKS + 1))
    aw = {a["id"]: a["week"] for a in alist}

    def behavior(s):
        rng_b = np.random.default_rng([C.SEED, 10, int(s.sid[1:])])
        q = seqs[s.sid]
        practice = [int(((q["day"] // C.DAYS_PER_WEEK) == (w - 1)).sum()) for w in weeks]
        recs = hw[s.sid]
        consent_ok = not (s.p4_id is not None and "basic" not in s.p4_consent)
        on_time = []
        for w in weeks:
            rs = [r for r in recs if aw[r["aid"]] <= w]
            on_time.append(_r(np.mean([r["status"] not in ("missing",) for r in rs])) if rs and consent_ok else None)
        corr = [_r(synth.sigmoid(0.9 + 0.8 * s.consc + rng_b.normal(0, 0.3))) for _ in weeks]
        idx = []
        for i in range(len(weeks)):
            ot = on_time[i] if on_time[i] is not None else 0.9
            idx.append(_r(100 * (0.35 * ot + 0.35 * min(1.0, practice[i] / 15) + 0.30 * corr[i]), 1))
        return {"practice": practice, "on_time": on_time, "correction": corr, "index": idx}

    def hw_summary(s):
        recs = [r for r in hw[s.sid] if "ratio" in r]
        dims = {}
        for r in recs:
            for c in r["criteria"]:
                dims.setdefault(c["dimension"], []).append(c["score"] / c["max"])
        return {"mean_ratio": _r(np.mean([r["ratio"] for r in recs])) if recs else None,
                "dims": {d: _r(np.mean(v)) for d, v in dims.items()}, "n": len(recs)}

    beh = {s.sid: behavior(s) for s in students}
    hws = {s.sid: hw_summary(s) for s in students}

    def radar(s):
        h = hws[s.sid]
        return {"academic": _r(acad[s.sid], 1), "homework": _r(100 * h["mean_ratio"], 1) if h["mean_ratio"] is not None else None,
                "content": _r(100 * h["dims"]["content"], 1) if "content" in h["dims"] else None,
                "language": _r(100 * h["dims"]["language"], 1) if "language" in h["dims"] else None,
                "mastery": _r(100 * final_mastery[s.sid].mean(), 1), "behavior": beh[s.sid]["index"][-1]}

    # ------------------------------------------------------------------ 学校 / 区域汇总
    def agg(ids):
        n = len(ids)
        if n < C.SMALL_CELL_MIN:
            return {"n": n, "suppressed": True}
        hm = [hws[i]["mean_ratio"] for i in ids if hws[i]["mean_ratio"] is not None]
        return {"n": n, "suppressed": False,
                "academic": _r(np.mean([acad[i] for i in ids]), 1),
                "academic_by_subject": {k: _r(np.mean([quiz[i][k][-1] for i in ids]), 1) for k, _ in synth.SUBJECTS},
                "academic_trend": [_r(np.mean([np.mean([quiz[i][k][w] for k, _ in synth.SUBJECTS]) for i in ids]), 1)
                                   for w in range(C.N_WEEKS + 1)],
                "homework": _r(100 * np.mean(hm), 1) if hm else None,
                "homework_dims": {d: _r(100 * np.mean([hws[i]["dims"][d] for i in ids if d in hws[i]["dims"]]), 1)
                                  for d in ("content", "language", "organization", "development", "accuracy")},
                "mastery": _r(100 * np.mean([final_mastery[i].mean() for i in ids]), 1),
                "mastery_by_kc": [_r(100 * np.mean([final_mastery[i][k] for i in ids]), 1) for k in range(K)],
                "mastery_dist": np.histogram([100 * final_mastery[i].mean() for i in ids], bins=[0, 40, 60, 80, 101])[0].tolist(),
                "behavior": _r(np.mean([beh[i]["index"][-1] for i in ids]), 1),
                "practice_per_week": _r(np.mean([np.mean(beh[i]["practice"]) for i in ids]), 1)}

    eng = synth.engagement_signals(_rng(11), students)
    classes = []
    for g in C.GRADES:
        for c in range(1, C.CLASSES_PER_GRADE + 1):
            ids = [s.sid for s in students if s.grade == g and s.class_no == c]
            rec = agg(ids)
            rec.update({"grade": g, "class_no": c, "name": f"{C.GRADES[g]}({c})班",
                        "engagement_concept": eng["weekly"][f"{g}-{c}"]})
            classes.append(rec)
    grades = []
    for g in C.GRADES:
        ids = [s.sid for s in students if s.grade == g]
        rec = agg(ids)
        rec.update({"grade": g, "name": C.GRADES[g]})
        grades.append(rec)
    school = agg([s.sid for s in students])
    school.update({"name": C.SCHOOL_NAME, "n_classes": len(classes)})

    region = []
    rng_r = _rng(12)
    for i, sc in enumerate(synth.region_schools(rng_r)):
        if i == 0:
            rec = {"name": sc["name"], "n": school["n"], "academic": school["academic"], "homework": school["homework"],
                   "mastery": school["mastery"], "behavior": school["behavior"], "is_demo_school": True}
        else:
            e = sc["school_effect"]
            rec = {"name": sc["name"], "n": sc["n_students"],
                   "academic": _r(school["academic"] + 9 * e + rng_r.normal(0, 1.2), 1),
                   "homework": _r(school["homework"] + 7 * e + rng_r.normal(0, 1.5), 1),
                   "mastery": _r(school["mastery"] + 10 * e + rng_r.normal(0, 2), 1),
                   "behavior": _r(school["behavior"] + 4 * e + rng_r.normal(0, 2), 1), "is_demo_school": False}
        region.append(rec)

    # ------------------------------------------------------------------ 初二(3)班逐人详情（教师视图）
    focal = []
    class_mean = agg(focal_ids)
    for s in students:
        if s.sid not in focal_ids:
            continue
        i = students.index(s)
        rad = radar(s)
        growth = {"academic": [_r(np.mean([quiz[s.sid][k][w] for k, _ in synth.SUBJECTS]), 1) for w in range(C.N_WEEKS + 1)],
                  "by_subject": {k: quiz[s.sid][k] for k, _ in synth.SUBJECTS},
                  "mastery": [_r(100 * np.mean(kt_focal[s.sid]["bkt"][min(n_days - 1, w * C.DAYS_PER_WEEK - 1)]), 1)
                              if w > 0 else _r(100 * bkt_params[:, 0].mean(), 1) for w in range(C.N_WEEKS + 1)],
                  "behavior": [None] + beh[s.sid]["index"]}
        hw_list = []
        for r in hw[s.sid]:
            a = next(x for x in alist if x["id"] == r["aid"])
            hw_list.append({**r, "title": a["title"], "date": a["date"], "subject": a["subject"], "rubric_key": a["rubric_key"]})
        st_rec = {"sid": s.sid, "name": s.name, "female": s.female, "class_name": s.class_name,
                  "from_p4": s.p4_id is not None, "p4_consent": s.p4_consent,
                  "radar": rad, "growth": growth, "homework": hw_list, "homework_summary": hws[s.sid],
                  "behavior": beh[s.sid], "kt": kt_focal[s.sid],
                  "cdm": {"attr_posterior": [_r(v) for v in ap[i]],
                          "responses": cd["X"][i].astype(int).tolist()},
                  "cat": cat_focal[s.sid],
                  "psych_flag": "建议关注" if flag[s.sid] else "普通"}
        st_rec["guidance"] = guidance.build(st_rec, class_mean, C.KCS)
        st_rec["comment"] = guidance.teacher_comment(st_rec, C.KCS)
        focal.append(st_rec)

    result = {
        "SYNTHETIC": "【合成数据】本结果全部来自 p9/synth.py 按固定种子生成的虚构学校数据，不是任何真实学生的数据；"
                     "指标只说明方法在已知生成机制下的表现，不能当作真实场景的准确率引用。",
        "run_id": C.RUN_ID, "seed": C.SEED,
        "data": {"n_students": len(students), "n_classes": len(classes), "n_kt_responses": int(sum(len(v["obs"]) for v in seqs.values())),
                 "kt_split": {"train": len(train_ids), "val": len(val_ids), "test": len(test_ids), "focal_class_heldout": len(focal_ids)},
                 "generator": "带个体差异的 BKT 生成机制（见 p9/synth.py 文件头），BKT 与生成机制同族，AUC 偏乐观"},
        "kt": {"auc": auc, "fairness": fair,
               "bkt_params": {C.KCS[k]["id"]: dict(zip(["L0", "T", "G", "S"], [_r(v, 4) for v in bkt_params[k]])) for k in range(K)},
               "dkt": {"arch": f"输入 {2 * K}（{K} 知识点 × 对/错 one-hot）→ tanh RNN 隐藏 {model.H} → 输出 {K}（sigmoid）",
                       "n_params": model.n_params(), "best_epoch": best[0], "best_val_auc": best_auc,
                       "history": hist},
               "seconds": {"bkt": _r(t_bkt, 2), "pfa": _r(t_pfa, 2), "dkt": _r(t_dkt, 2)}},
        "cdm": cdm_res, "irt": irt_res, "cat": study, "psych": psych_res,
        "seconds_total": _r(time.time() - t_start, 1),
    }

    app = {
        "meta": {"school": C.SCHOOL_NAME, "region": C.REGION_NAME, "term": C.TERM_LABEL, "run_id": C.RUN_ID,
                 "seed": C.SEED, "kcs": C.KCS, "subjects": [{"id": k, "name": n} for k, n in synth.SUBJECTS],
                 "focal_class": f"{C.GRADES[C.FOCAL_CLASS[0]]}({C.FOCAL_CLASS[1]})班",
                 "small_cell_min": C.SMALL_CELL_MIN, "assignments": alist,
                 "n_students": len(students), "n_kt_responses": result["data"]["n_kt_responses"],
                 "n_days": n_days, "days_per_week": C.DAYS_PER_WEEK, "term_start": C.TERM_START},
        "region": {"name": C.REGION_NAME, "schools": region},
        "school": {"summary": school, "grades": grades, "classes": classes, "psych": psych_res,
                   "lesson_concept": eng["lesson"]},
        "focal": {"class_mean": class_mean, "students": focal},
        "models": {
            "kt": {"auc": {m: v for m, v in auc.items()}, "fairness": fair, "bkt_params": result["kt"]["bkt_params"],
                   "dkt": {k: v for k, v in result["kt"]["dkt"].items() if k != "history"},
                   "dkt_history": hist, "split": result["data"]["kt_split"]},
            "cdm": {**{k: v for k, v in cdm_res.items() if k != "seconds"}, "Q": cd["Q"].tolist(), "slip_hat": [_r(v) for v in fit["slip"]],
                    "guess_hat": [_r(v) for v in fit["guess"]]},
            "irt": {**{k: v for k, v in irt_res.items() if k != "seconds"}, "a": [_r(v, 4) for v in a_hat], "b": [_r(v, 4) for v in b_hat]},
            "cat": study,
        },
    }
    app["screen"] = screen.build(students, focal, seqs, ktd, final_mastery, classes, school, p4_view, auc)
    test_kept = [i for i in test_ids if len(seqs[i]["obs"]) > 1]
    raw = {"kt_test_predictions": [{"sid": sid, "t": t + 1, "y": int(yt[n][t]),
                                     **{m: round(float(pt[m][n][t]), 5) for m in pt}}
                                    for n, sid in enumerate(test_kept) for t in range(len(yt[n]))],
           "dina_attr_posterior": [{"sid": s.sid, "post": [round(float(v), 4) for v in ap[i]],
                                    "truth": cd["alpha"][i].tolist()} for i, s in enumerate(students)],
           "cat_focal": [{"sid": k, **v} for k, v in cat_focal.items()]}
    return result, app, raw
