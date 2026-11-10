"""虚构学校的合成数据生成器（固定随机种子）。

全部学生、姓名、成绩、作答序列、家庭情况都是程序生成的，不对应任何真实的人。
生成机制（写清楚，便于判断模型结果有多“乐观”）：
- 每个学生有一般能力 g ~ N(0,1)（加班级随机效应），学科能力 = g + 学科偏差；
- 知识追踪的作答序列按“带个体差异的 BKT”生成：每个学生×知识点有自己的初始掌握概率和学习率，
  题目有各自的猜对率和失误率，无遗忘。因此 BKT 与生成机制同族，AUC 会偏乐观；
- 认知诊断测验的真实属性 = 知识追踪序列结束时的真实掌握状态；
- 作业分项分按 p4 的量规结构生成；初二(3)班前 12 名学生直接使用 p4 演示数据库里的结果；
- 心理健康相关的家庭/作息变量按 p3 的边际分布和相关结构（高斯 copula）生成，
  “成绩后 1/3”由本数据里的学业成绩决定，“初三”由年级决定。
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import numpy as np
from scipy.stats import norm  # scipy 随 scikit-learn 一起安装

from . import config as C
from .cdm import make_q_matrix

SURNAMES = list("王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾萧田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢")
GIVEN_M = list("浩宇轩然泽睿博文俊杰涛磊明辰哲远航晨阳鹏宁凯峰朗诚嘉毅")
GIVEN_F = list("婷琳雨欣怡涵佳悦萱彤琪雪瑶菲倩妍宁静慧思雅可馨诗蕾")
# p4 演示学生的性别为本项目的虚构设定（p4 没有存性别）
P4_FEMALE = {"张小明": 0, "李华": 1, "陈雨": 1, "王芳": 1, "刘洋": 0, "赵子涵": 1, "孙浩": 0, "周婷": 1,
             "吴磊": 0, "郑佳怡": 1, "黄子轩": 0, "林晓": 1}
SUBJECTS = [("chinese", "语文"), ("math", "数学"), ("english", "英语")]


def sigmoid(x):
    return 1 / (1 + np.exp(-x))


@dataclass
class Student:
    sid: str
    name: str
    grade: int
    class_no: int
    female: int
    g: float
    g_sub: dict
    slope: float
    consc: float
    p4_id: int | None = None
    p4_consent: list = field(default_factory=list)
    extra: dict = field(default_factory=dict)

    @property
    def class_name(self) -> str:
        return f"{C.GRADES[self.grade]}({self.class_no})班"


def _name(rng, female: int, used: set) -> str:
    for _ in range(1000):
        s = SURNAMES[rng.integers(len(SURNAMES))]
        pool = GIVEN_F if female else GIVEN_M
        n = s + "".join(pool[i] for i in rng.choice(len(pool), rng.choice([1, 2], p=[0.35, 0.65]), replace=False))
        if n not in used:
            used.add(n)
            return n
    raise RuntimeError("姓名池不够")


def roster(rng, p4: dict) -> list[Student]:
    seed_students = {s["name"]: s for s in p4["seed_students"]}
    p4_ids = {s["name"]: s["id"] for s in p4["demo"]["students"]}
    consents = {int(k): v for k, v in p4["demo"]["consents"].items()}
    used = set(seed_students)
    out = []
    for grade in C.GRADES:
        for cno in range(1, C.CLASSES_PER_GRADE + 1):
            ce = rng.normal(0, 0.18)
            size = int(rng.integers(38, 45))
            focal = (grade, cno) == C.FOCAL_CLASS
            names = list(seed_students) if focal else []
            for i in range(size):
                if i < len(names):
                    nm = names[i]
                    female = P4_FEMALE[nm]
                    ab = seed_students[nm]["ability"]
                    g = (ab - 0.6) / 0.2           # p4 设定的能力 0–1 映射到 z 分
                    slope = seed_students[nm]["drift"] / 0.2 * 7 / 6 / 3  # p4 每次作业的能力漂移 → 每周 z 分变化（缩小到 1/3，避免过陡）
                    pid = p4_ids.get(nm)
                else:
                    female = int(rng.random() < 0.4847)  # 与 p3 采用的 CEPS 女生比例一致
                    nm = _name(rng, female, used)
                    g = rng.normal(0, 1) + ce
                    slope = rng.normal(0.02, 0.05)
                    pid = None
                consc = 0.45 * g + np.sqrt(1 - 0.45 ** 2) * rng.normal()
                g_sub = {k: g + rng.normal(0, 0.45) for k, _ in SUBJECTS}
                st = Student(sid=f"S{grade}{cno}{i + 1:02d}", name=nm, grade=grade, class_no=cno, female=female,
                             g=float(g), g_sub={k: float(v) for k, v in g_sub.items()}, slope=float(slope),
                             consc=float(consc), p4_id=pid, p4_consent=consents.get(pid, []) if pid else [])
                out.append(st)
    return out


# ----------------------------------------------------------------------------- 学业：周测


def weekly_quiz(rng, students: list[Student]) -> dict:
    """周测得分率（%）：第 0 点是上学期期末，第 1–6 点是本学期第 1–6 周。"""
    out = {}
    for st in students:
        rec = {}
        for k, _ in SUBJECTS:
            base = st.g_sub[k]
            ys = []
            for w in range(C.N_WEEKS + 1):
                z = base + st.slope * w + rng.normal(0, 0.25)
                ys.append(round(float(100 * sigmoid(0.25 + 0.95 * z) * 0.9 + 8), 1))
            rec[k] = ys
        out[st.sid] = rec
    return out


# ----------------------------------------------------------------------------- 作业：沿用 p4 量规


def _band(rub: dict, total: float, mx: float) -> str:
    val = total / mx if rub["key"] == "short_answer_math" else total
    for b in rub["bands"]:
        if b["min"] - 1e-9 <= val <= b["max"] + 1e-9:
            return b["name"]
    return rub["bands"][-1]["name"]


def homework(rng, students: list[Student], p4: dict) -> tuple[list[dict], dict]:
    rubrics = {r["key"]: r for r in p4["rubrics"]}
    assigns = p4["demo"]["assignments"]
    subs_p4 = {(s["student_id"], s["assignment_id"]): s for s in p4["demo"]["submissions"]}
    math_q = [("1", "第1题", 3.0), ("2", "第2题", 3.0), ("3", "第3题", 2.0), ("4", "第4题", 2.0)]
    t0 = dt.date.fromisoformat(C.TERM_START)
    alist = []
    for i, a in enumerate(assigns):
        d = dt.date.fromisoformat(a["created_at"][:10]) + dt.timedelta(days=1)
        alist.append({"id": a["id"], "title": a["title"], "subject": a["subject"], "rubric_key": a["rubric_key"],
                      "date": d.isoformat(), "week": min(C.N_WEEKS, max(1, (d - t0).days // 7 + 1))})
    out = {}
    for st in students:
        dims_off = {d: rng.normal(0, 0.45) for d in ("content", "language", "organization", "development", "conventions")}
        recs = []
        for a in alist:
            if st.p4_id is not None:
                s = subs_p4.get((st.p4_id, a["id"]))
                if s is None:
                    recs.append({"aid": a["id"], "status": "no_consent" if "basic" not in st.p4_consent else "missing"})
                    continue
                recs.append({"aid": a["id"], "status": s["status"], "total": s["total"], "max": s["max"],
                             "ratio": round(s["total"] / s["max"], 4), "band": s["band"], "ai_total": s["ai_total"],
                             "criteria": [{"id": c["id"], "name": c["name"], "score": c["score"], "max": c["max"],
                                           "dimension": _dim(rubrics[a["rubric_key"]], c["id"])} for c in s["criteria"]],
                             "source": "p4"})
                continue
            if rng.random() < 0.035 + 0.05 * sigmoid(-st.consc):  # 偶尔缺交，尽责性低更容易缺交
                recs.append({"aid": a["id"], "status": "missing"})
                continue
            rub = rubrics[a["rubric_key"]]
            subj = "chinese" if a["subject"] in ("chinese", "paper") else a["subject"]
            z = st.g_sub[subj] + st.slope * a["week"]
            crit = []
            if rub["key"] == "short_answer_math":
                for qid, qn, mx in math_q:
                    p = sigmoid(0.6 + 1.2 * z + rng.normal(0, 0.6))
                    sc = mx if rng.random() < p else float(rng.choice(np.arange(0, mx, 1.0)))
                    crit.append({"id": qid, "name": qn, "score": sc, "max": mx, "dimension": "accuracy"})
            else:
                for c in rub["criteria"]:
                    dim = c["dimension"] or "content"
                    r = sigmoid(0.55 + 0.9 * z + dims_off.get(dim, 0) + rng.normal(0, 0.3))
                    step = 0.5 if c["max"] <= 20 else 1.0
                    crit.append({"id": c["id"], "name": c["name"], "score": float(np.round(r * c["max"] / step) * step),
                                 "max": float(c["max"]), "dimension": dim})
            tot = float(sum(c["score"] for c in crit))
            mx = float(sum(c["max"] for c in crit))
            recs.append({"aid": a["id"], "status": "reviewed" if a["week"] <= 4 else "ai_done", "total": tot, "max": mx,
                         "ratio": round(tot / mx, 4), "band": _band(rub, tot, mx), "criteria": crit, "source": "synthetic"})
        out[st.sid] = recs
    return alist, out


def _dim(rub: dict, cid: str) -> str:
    for c in rub["criteria"]:
        if c["id"] == cid:
            return c["dimension"]
    return "accuracy"


# ----------------------------------------------------------------------------- 知识追踪作答序列


def kt_sequences(rng, students: list[Student]) -> dict:
    K = len(C.KCS)
    n_items_per_kc = 10
    items_kc = np.repeat(np.arange(K), n_items_per_kc)
    guess = rng.uniform(0.10, 0.30, len(items_kc))
    slip = rng.uniform(0.05, 0.15, len(items_kc))
    kc_off = rng.normal(0, 0.4, K)
    n_days = C.N_WEEKS * C.DAYS_PER_WEEK
    seqs = {}
    for st in students:
        gm = st.g_sub["math"]
        L0 = sigmoid(-0.35 + 1.1 * gm + kc_off + rng.normal(0, 0.6, K))
        T = sigmoid(-2.0 + 0.45 * gm + 0.4 * st.consc + rng.normal(0, 0.3, K))
        state = (rng.random(K) < L0).astype(int)
        kcs, items, obs, days, truth = [], [], [], [], []
        lam = np.clip(2.4 + 0.8 * st.consc, 0.6, 5.0)
        for day in range(n_days):
            week = day // C.DAYS_PER_WEEK
            # 教学进度：每周重点 1–2 个知识点，同时穿插复习
            focus = np.full(K, 0.6)
            focus[week % K] += 2.5
            focus[(week + 1) % K] += 1.0
            focus /= focus.sum()
            for _ in range(int(min(6, rng.poisson(lam)))):
                k = int(rng.choice(K, p=focus))
                j = int(rng.choice(np.where(items_kc == k)[0]))
                p = 1 - slip[j] if state[k] else guess[j]
                o = int(rng.random() < p)
                kcs.append(k)
                items.append(j)
                obs.append(o)
                days.append(day)
                truth.append(state.copy())
                if not state[k] and rng.random() < T[k]:
                    state[k] = 1
        seqs[st.sid] = {"kc": np.array(kcs, int), "item": np.array(items, int), "obs": np.array(obs, int),
                        "day": np.array(days, int), "truth": np.array(truth, int).reshape(-1, K),
                        "final_state": state.copy(), "L0_true": L0, "T_true": T}
    return {"seqs": seqs, "items_kc": items_kc, "guess": guess, "slip": slip, "n_days": n_days}


# ----------------------------------------------------------------------------- 认知诊断测验


def cdm_test(rng, students: list[Student], kt: dict, J: int = 24) -> dict:
    K = len(C.KCS)
    Q = make_q_matrix(K, J, rng)
    s = rng.uniform(0.05, 0.20, J)
    g = rng.uniform(0.05, 0.25, J)
    X = np.zeros((len(students), J))
    A = np.zeros((len(students), K), int)
    for i, st in enumerate(students):
        alpha = kt["seqs"][st.sid]["final_state"]
        A[i] = alpha
        eta = (Q @ alpha == Q.sum(1)).astype(int)
        p = np.where(eta == 1, 1 - s, g)
        X[i] = (rng.random(J) < p).astype(int)
    return {"Q": Q, "slip": s, "guess": g, "X": X, "alpha": A}


# ----------------------------------------------------------------------------- IRT 题库


def irt_bank(rng, students: list[Student], J: int = 120, n_extra: int = 1600, per_student: int = 40) -> dict:
    """题库：120 道数学题，真实参数随机生成；标定样本 = 本校学生每人随机 40 题 + 区域预测试 1600 名合成考生。"""
    a = np.clip(np.exp(rng.normal(0.15, 0.3, J)), 0.5, 2.5)
    b = np.clip(rng.normal(0, 1.1, J), -3, 3)
    thetas = np.concatenate([[st.g_sub["math"] for st in students], rng.normal(0, 1, n_extra)])
    X = np.full((len(thetas), J), np.nan)
    for i, th in enumerate(thetas):
        idx = rng.choice(J, per_student, replace=False)
        p = 1 / (1 + np.exp(-a[idx] * (th - b[idx])))
        X[i, idx] = (rng.random(per_student) < p).astype(float)
    return {"a_true": a, "b_true": b, "X": X, "theta_true": thetas}


# ----------------------------------------------------------------------------- p3 心理健康相关变量


def psych_factors(rng, students: list[Student], p3: dict, academic_low: dict) -> dict:
    """按 p3 的边际分布与潜在相关（高斯 copula）生成；academic_low 与 grade9 由本数据决定。"""
    cov = p3["sim_params"]["covariates"]
    names = ["female", "rural", "left_behind_any", "boarding", "sleep_short", "ses_low", "single_parent", "bullied",
             "screen_high", "pa_low"]
    idx = {n: i for i, n in enumerate(names)}
    R = np.eye(len(names))
    for a, b, r, *_ in p3["sim_params"]["latent_correlation"]:
        if a in idx and b in idx:
            R[idx[a], idx[b]] = R[idx[b], idx[a]] = r
    # 保证正定
    w, V = np.linalg.eigh(R)
    R = V @ np.diag(np.clip(w, 1e-3, None)) @ V.T
    d = np.sqrt(np.diag(R))
    R = R / d[:, None] / d[None, :]
    Z = rng.multivariate_normal(np.zeros(len(names)), R, len(students))
    lb = cov["left_behind"]
    out = {}
    for i, st in enumerate(students):
        u = norm.cdf(Z[i])
        x = {}
        for n in names:
            if n == "female":
                x[n] = st.female
            elif n == "left_behind_any":
                continue
            else:
                x[n] = int(u[idx[n]] < cov[n]["p"])
        # 留守：先按 p_any 决定是否留守，再按类型占比分配
        if u[idx["left_behind_any"]] < lb["p_any"]:
            sh = lb["type_share"]
            tot = sum(sh.values())
            r = rng.random() * tot
            x["left_behind"] = "father" if r < sh["father"] else ("mother" if r < sh["father"] + sh["mother"] else "both")
        else:
            x["left_behind"] = "none"
        x["grade9"] = int(st.grade == 9)
        x["academic_low"] = academic_low[st.sid]
        out[st.sid] = x
    return out


def design_row(x: dict, cols: list[str]) -> np.ndarray:
    v = []
    for c in cols:
        if c.startswith("lb_"):
            v.append(1.0 if x["left_behind"] == c[3:] else 0.0)
        else:
            v.append(float(x[c]))
    return np.array(v)


# ----------------------------------------------------------------------------- 课堂参与（概念演示的合成信号）


def engagement_signals(rng, students: list[Student]) -> dict:
    """班级层面的“课堂参与度指数”周序列 + 一节 45 分钟课的合成多模态信号。全部是合成曲线，不来自任何传感器。"""
    classes = sorted({(s.grade, s.class_no) for s in students})
    weekly = {}
    for g, c in classes:
        base = 68 + rng.normal(0, 4)
        weekly[f"{g}-{c}"] = [round(float(base + rng.normal(0, 2.2) - 0.6 * w), 1) for w in range(C.N_WEEKS)]
    t = np.arange(0, 45, 0.5)
    phase = [(0, 5, "导入"), (5, 20, "讲授"), (20, 32, "小组讨论"), (32, 40, "练习"), (40, 45, "总结")]
    eng = 62 + 8 * np.sin(t / 6) + rng.normal(0, 2.5, len(t))
    eng[(t >= 20) & (t < 32)] += 12
    eng[(t >= 14) & (t < 20)] -= 9
    gaze = np.clip(0.75 + 0.1 * np.cos(t / 5) + rng.normal(0, 0.04, len(t)), 0, 1)
    gaze[(t >= 20) & (t < 32)] -= 0.3
    teacher_talk = np.where((t < 20) | (t >= 40), 0.8, 0.25) + rng.normal(0, 0.05, len(t))
    student_talk = np.clip(1 - teacher_talk - 0.1 + rng.normal(0, 0.05, len(t)), 0, 1)
    return {"weekly": weekly, "lesson": {"t": t.tolist(), "phases": phase,
                                         "engagement": np.round(np.clip(eng, 0, 100), 1).tolist(),
                                         "gaze_on_task": np.round(gaze, 3).tolist(),
                                         "teacher_talk": np.round(np.clip(teacher_talk, 0, 1), 3).tolist(),
                                         "student_talk": np.round(student_talk, 3).tolist()}}


def region_schools(rng, n: int = 6) -> list[dict]:
    """区域内其他学校：只生成学校层面的汇总指标（教育局视图只看汇总）。"""
    names = ["星海实验中学（虚构）", "青松路中学（虚构）", "滨江第二中学（虚构）", "明德学校初中部（虚构）",
             "东湖中学（虚构）", "北苑实验学校（虚构）"]
    out = []
    for i in range(n):
        out.append({"name": names[i], "school_effect": float(rng.normal(0, 0.25)) if i else 0.0,
                    "n_students": int(rng.integers(380, 1400)) if i else None})
    return out
