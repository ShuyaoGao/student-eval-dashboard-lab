"""从 p3-student-mh 导出群体心理风险模块需要的数字（只读 p3，不改它）。

每个数字都记录来源文件和键路径（locator），tests/test_p3_consistency.py 会回到 p3 的 result.json 逐个比对。
p3 目录不存在时，build 使用 data/sources/p3_export.json 快照。
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

from .config import P3_DIR

FOREST_FACTORS = [  # (pooled id, 中文名)，与 p3 REPORT §2.2 的表一致
    ("dep_bullied", "受欺凌"),
    ("dep_sleep_lt8", "睡眠 <8 小时"),
    ("dep_peer_poor", "同伴关系差"),
    ("dep_academic_low", "成绩差（vs 优）"),
    ("dep_family_function_poor", "家庭关系低于平均"),
    ("dep_ses_low", "家庭经济困难"),
    ("dep_lb_any_china_meta", "留守（任一类型）"),
    ("dep_pa_low", "体育活动不足"),
    ("dep_female", "女性"),
    ("dep_rural", "农村"),
    ("dep_single_parent", "单亲"),
    ("dep_screen_high", "手机 ≥2 小时/天"),
    ("dep_boarding", "寄宿"),
    ("dep_parent_edu_low", "父亲学历低"),
]


def _latest(d: Path, suffix: str = "") -> Path:
    cands = sorted(p for p in d.iterdir() if p.is_dir() and p.name.endswith(suffix) and not p.name.endswith("_mock"))
    if suffix == "":
        cands = [p for p in cands if len(p.name) == 10]  # 纯日期目录
    return cands[-1]


def _load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def _get(d: dict, path: str):
    for k in path.split("."):
        d = d[k]
    return d


def _num(obj: dict, src: Path, locator: str, root: Path) -> dict:
    return {"value": _get(obj, locator), "source": src.relative_to(root).as_posix(), "locator": locator}


def export(p3: Path = P3_DIR) -> dict:
    res = p3 / "results"
    meta_p = _latest(res / "meta") / "result.json"
    meta = _load(meta_p)
    # 证据表：逐行读，统计规模；森林图每个因素附上各原始研究
    rows = list(csv.DictReader((p3 / "research" / "evidence_table.csv").open(encoding="utf-8-sig")))
    by_id = {r["row_id"]: r for r in rows}
    verified = {}
    for r in rows:
        verified[r["verified"]] = verified.get(r["verified"], 0) + 1
    # 与 p3 showcase/build_showcase.py 相同的口径：DOI 去重（小写），没有 DOI 的按原字符串
    import re as _re
    studies = set()
    for r in rows:
        m = _re.search(r"(10\.\d{4,}/\S+)", r["doi_or_url"] or "")
        studies.add(m.group(1).lower() if m else (r["doi_or_url"] or ""))
    spot = sum(1 for r in rows if (r.get("spot_check") or "") != "")
    flagged = sum(1 for r in rows if (r.get("flag") or "") != "")
    forest = []
    for pid, label in FOREST_FACTORS:
        pool = meta["pooled"][pid]
        studies_in = []
        for rid in pool["row_ids"]:
            r = by_id.get(rid, {})
            inp = pool.get("inputs", {}).get(rid)
            studies_in.append({"row_id": rid, "study": r.get("study", ""), "year": r.get("year", ""),
                               "doi_or_url": r.get("doi_or_url", ""), "verified": r.get("verified", ""),
                               "or": inp[0] if inp else None, "lo": inp[1] if inp else None, "hi": inp[2] if inp else None})
        forest.append({"id": pid, "label": label, "or": pool["or"]["value"], "lo": pool["or"]["ci_low"],
                       "hi": pool["or"]["ci_high"], "k": pool["k"], "I2": pool.get("I2"),
                       "description": pool.get("description", ""), "caveat": pool.get("caveat", ""),
                       "studies": studies_in,
                       "source": meta_p.relative_to(p3).as_posix(), "locator": f"pooled.{pid}.or.value"})

    sim_dir = res / "models_sim"
    sims = {}
    for name in ("depression", "anxiety", "depression_core3", "depression_n2000", "depression_fu2017_features"):
        p = _latest(sim_dir, "_" + name) / "result.json"
        d = _load(p)
        sims[name] = {"auc": _num(d, p, "model.logit.auc.value", p3), "auc_lo": _num(d, p, "model.logit.auc.ci_low", p3),
                      "auc_hi": _num(d, p, "model.logit.auc.ci_high", p3), "n_test": d["data"]["n_test"],
                      "features": d["data"]["features"]}
        if name == "depression":
            sims[name]["screening"] = {k: _num(d, p, f"screening_top_q.logit.{k}", p3) for k in
                                       ("selection_rate", "recall", "ppv", "prevalence", "false_positive_share_of_selected")}
            sims[name]["composition_lb"] = {k: _num(d, p, f"screening_top_q.logit.composition.left_behind_any.{k}", p3)
                                            for k in ("share_in_selected", "share_overall")}
            sims[name]["oracle_auc"] = _num(d, p, "model.oracle_true_p.auc.value", p3)
            sims[name]["gbm_auc"] = _num(d, p, "model.gbm.auc.value", p3)
    rvs_p = _latest(res / "real_vs_sim") / "result.json"
    rvs = _load(rvs_p)
    real = {k: {"value": rvs["auc"][k]["value"], "lo": rvs["auc"][k]["ci_low"], "hi": rvs["auc"][k]["ci_high"],
                "source": rvs_p.relative_to(p3).as_posix(), "locator": f"auc.{k}.value"}
            for k in ("real_dep_cesdc15", "real_dep_cesdc29", "real_suicidal_ideation", "sim_same_features_logit")}
    real_screen = {}
    for name in ("dep_cesdc29", "suicidal_ideation"):
        p = _latest(res / "models_real_fu2017", "_" + name) / "result.json"
        d = _load(p)
        real_screen[name] = {k: _num(d, p, f"screening_top_q.logit.composition.left_behind_any.{k}", p3)
                             for k in ("share_in_selected", "share_overall")}
        real_screen[name]["recall"] = _num(d, p, "screening_top_q.logit.recall", p3)
        real_screen[name]["ppv"] = _num(d, p, "screening_top_q.logit.ppv", p3)
    prep_p = _latest(res / "real_fu2017_prep") / "result.json"
    prep = _load(prep_p)
    calc_p = _latest(res / "calculator_build") / "result.json"
    calc = _load(calc_p)
    draws = _load(res / "calculator" / "model_draws.json")
    simp = _load(p3 / "config" / "sim_params.json")
    return {
        "_note": "由 p9/sources_p3.py 从 p3-student-mh 导出；数字以 p3 的 result.json 为准。",
        "evidence": {"rows": len(rows), "verified_counts": verified, "distinct_sources": len(studies),
                     "spot_checked": spot, "flagged": flagged,
                     "source": "research/evidence_table.csv"},
        "prevalence": {k: {"min": meta["pooled"][k]["min"], "max": meta["pooled"][k]["max"],
                           "source": meta_p.relative_to(p3).as_posix(), "locator": f"pooled.{k}.min/max"}
                       for k in ("prev_dep_junior", "prev_anx_secondary", "prev_si_secondary", "prev_dep_diagnosis")},
        "forest": forest,
        "sim_models": sims,
        "real_auc": real,
        "real_screening": real_screen,
        "real_prep": {"middle_school": prep.get("middle_school", {}), "source": prep_p.relative_to(p3).as_posix()},
        "calculator_examples": calc["examples"],
        "calculator_source": calc_p.relative_to(p3).as_posix(),
        "calc_model": {"design_columns": draws["design_columns"],
                       "outcomes": {o: {"label": om["label"], "prevalence_point": om["prevalence_point"],
                                        "prevalence_ci": om["prevalence_ci"],
                                        "draws": [[d["b0"], d["prev"], d["beta"]] for d in om["draws"]]}
                                    for o, om in draws["outcomes"].items()},
                       "disclaimer": draws.get("disclaimer", ""),
                       "source": "results/calculator/model_draws.json"},
        "sim_params": {"covariates": simp["covariates"], "latent_correlation": simp["latent_correlation"]["pairs"],
                       "source": "config/sim_params.json"},
    }


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    d = export()
    print(json.dumps({k: (v if k in ("evidence", "real_auc") else "...") for k, v in d.items()}, ensure_ascii=False, indent=1))
