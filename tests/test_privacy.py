"""数据层面的隐私边界：data.js 里根本没有不该有的东西（页面层面的检查见 test_browser.py）。"""
import json

from p9 import config as C


def test_no_individual_risk_scores_in_page_data(app_data):
    for s in app_data["focal"]["students"]:
        assert s["psych_flag"] in ("建议关注", "普通")
        assert not ({"left_behind", "boarding", "sleep_short", "ses_low", "bullied", "rr"} & set(s))


def test_region_view_has_no_psych_and_no_people(app_data):
    txt = json.dumps(app_data["region"], ensure_ascii=False)
    for w in ("psych", "depression", "anxiety", "抑郁", "焦虑", "关注"):
        assert w not in txt
    names = [s["name"] for s in app_data["focal"]["students"]]
    assert not any(n in txt for n in names)


def test_school_aggregates_have_no_names_and_respect_small_cells(app_data):
    txt = json.dumps(app_data["school"], ensure_ascii=False)
    names = [s["name"] for s in app_data["focal"]["students"]]
    assert not any(n in txt for n in names)
    for c in app_data["school"]["classes"] + app_data["school"]["grades"]:
        assert c["suppressed"] or c["n"] >= C.SMALL_CELL_MIN
    for g in app_data["school"]["psych"]["by_grade"]:
        assert g["suppressed"] or g["n"] >= C.SMALL_CELL_MIN


def test_attention_share_matches_rule(result):
    s = result["psych"]["school"]["attention_share"]
    assert abs(s - C.ATTENTION_TOP_SHARE) < 0.02


def test_synthetic_label_present(app_data):
    html = (C.APP_DIR / "index.html").read_text(encoding="utf-8")
    assert "演示数据 · 合成" in html
    assert "虚构" in app_data["meta"]["school"]


def test_p4_consent_gate_carried_over(app_data):
    liu = [s for s in app_data["focal"]["students"] if s["name"] == "刘洋"][0]
    assert liu["from_p4"] and "basic" not in liu["p4_consent"]
    assert all(r["status"] == "no_consent" for r in liu["homework"])
    assert liu["radar"]["homework"] is None
