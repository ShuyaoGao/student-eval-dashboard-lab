"""数字一致性：页面里的 p3 数字 = p3 的 result.json；页面里的模型指标 = 本项目 result.json；出处与条款全部核实。"""
import json
import sys

import numpy as np
import pytest

from p9 import config as C


def _get(d, path):
    for k in path.split("."):
        d = d[k]
    return d


def _walk(o):
    if isinstance(o, dict):
        if "source" in o and "locator" in o and "value" in o:
            yield o
        for v in o.values():
            yield from _walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from _walk(v)


@pytest.mark.skipif(not C.P3_DIR.exists(), reason="p3 目录不在本机")
def test_p3_numbers_match_p3_results(app_data):
    n = 0
    for rec in _walk(app_data["p3"]):
        if rec["locator"].endswith("/max"):
            continue
        src = json.loads((C.P3_DIR / rec["source"]).read_text(encoding="utf-8"))
        assert _get(src, rec["locator"]) == rec["value"], rec
        n += 1
    for f in app_data["p3"]["forest"]:
        src = json.loads((C.P3_DIR / f["source"]).read_text(encoding="utf-8"))
        pool = src["pooled"][f["id"]]["or"]
        assert (f["or"], f["lo"], f["hi"]) == (pool["value"], pool["ci_low"], pool["ci_high"])
        n += 1
    for k, v in app_data["p3"]["real_auc"].items():
        src = json.loads((C.P3_DIR / v["source"]).read_text(encoding="utf-8"))
        assert src["auc"][k]["value"] == v["value"]
        n += 1
    assert n > 30


@pytest.mark.skipif(not C.P3_DIR.exists(), reason="p3 目录不在本机")
def test_evidence_counts_match_p3_showcase(app_data):
    txt = (C.P3_DIR / "showcase" / "assets" / "data.js").read_text(encoding="utf-8")
    sd = json.loads(txt.split("=", 1)[1].rstrip().rstrip(";"))["evidence"]
    ev = app_data["p3"]["evidence"]
    assert (ev["rows"], ev["verified_counts"]["fulltext"], ev["verified_counts"]["abstract-only"], ev["distinct_sources"],
            ev["spot_checked"], ev["flagged"]) == (sd["rows"], sd["fulltext"], sd["abstract_only"], sd["sources"],
                                                    sd["spot_checked"], sd["flagged"])


@pytest.mark.skipif(not C.P3_DIR.exists(), reason="p3 目录不在本机")
def test_risk_model_matches_p3_calculator():
    """本项目把 p3 计算器向量化后用于合成学生；对完整画像，结果应与 p3 自己的 ask() 一致。"""
    sys.path.insert(0, str(C.P3_DIR / "src"))
    try:
        import risk_calculator as rc  # noqa: PLC0415
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"无法导入 p3 计算器：{e}")
    from p9 import sources_p3, synth
    model = rc.latest_model()
    exp = sources_p3.export()
    cm = exp["calc_model"]
    cols = cm["design_columns"]
    prof = {"female": 1, "grade9": 1, "rural": 0, "left_behind": "both", "boarding": 1, "academic_low": 1, "sleep_short": 1,
            "ses_low": 0, "single_parent": 0, "bullied": 1, "screen_high": 0, "pa_low": 1}
    want = rc.ask(model, prof)
    x = synth.design_row(prof, cols)
    for o in ("depression", "anxiety"):
        d = cm["outcomes"][o]["draws"]
        p = np.array([1 / (1 + np.exp(-(b0 + x @ np.array(beta)))) for b0, prev, beta in d])
        rr = p / np.array([prev for _, prev, _ in d])
        assert rr[0] == pytest.approx(want[o]["rr_point"], rel=1e-9)
        assert p[0] == pytest.approx(want[o]["abs_point"], rel=1e-9)
        assert np.percentile(rr, 2.5) == pytest.approx(want[o]["rr_ci"][0], rel=1e-9)


def test_model_metrics_on_page_match_result(app_data, result):
    for m, v in result["kt"]["auc"].items():
        assert app_data["models"]["kt"]["auc"][m] == v
    assert app_data["models"]["cdm"]["attribute_accuracy_mean"] == result["cdm"]["attribute_accuracy_mean"]
    assert app_data["models"]["cat"] == result["cat"]
    assert app_data["models"]["irt"]["corr_b"] == result["irt"]["corr_b"]
    assert app_data["school"]["psych"] == result["psych"]


def test_refs_and_clauses_verified(app_data):
    bad = [k for k, r in app_data["refs"].items() if not r["verified"]]
    assert not bad, f"未核实的出处：{bad}"
    badc = [c["id"] for c in app_data["legal"]["clauses"] if not c["verified"]]
    assert not badc, f"未核实的条款：{badc}"
    used = {k for m in app_data["methods"]["cards"] for k in m["refs"]}
    assert used <= set(app_data["refs"])


def test_maturity_labels_are_the_three_allowed(app_data):
    assert set(app_data["methods"]["maturity"]) == {"implemented", "concept", "research"}
    for m in app_data["methods"]["cards"]:
        assert m["maturity"] in app_data["methods"]["maturity"]
    mm = [m for m in app_data["methods"]["cards"] if m["group"] == "多模态学习分析"]
    assert mm and all(m["maturity"] == "concept" for m in mm), "多模态只能是概念演示"
