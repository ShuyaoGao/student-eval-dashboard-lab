"""数据大屏的数据层检查：轮播只拿到打码后的字段、不含心理信息、保护措施是可数的清单。
浏览器层面（DOM 中没有完整姓名、轮播前进、悬停暂停、授权留痕、6 秒内入场）见 tools/browser_check.py::screen_checks。"""
import json

from p9 import screen


def test_mask_functions():
    assert screen.mask_name("张小明") == "张*明"
    assert screen.mask_name("李华") == "李*"
    assert screen.mask_name("欧阳子涵") == "欧**涵"
    assert screen.mask_sid("S8301") == "S83**"


def test_carousel_has_only_masked_fields(app_data):
    names = {s["name"] for s in app_data["focal"]["students"]}
    sids = {s["sid"] for s in app_data["focal"]["students"]}
    car = app_data["screen"]["carousel"]
    assert len(car) == len(app_data["focal"]["students"])
    txt = json.dumps(car, ensure_ascii=False)
    assert not [n for n in names if n in txt], "轮播数据里出现了完整姓名"
    assert not [s for s in sids if f'"{s}"' in txt], "轮播数据里出现了完整学号"
    allowed = {"idx", "mask_name", "surname", "mask_sid", "class_name", "kc_mastery", "homework", "homework_dates", "growth",
               "mastery_avg", "consent_ok", "guidance", "seed"}
    for c in car:
        assert set(c) <= allowed, set(c) - allowed  # 数据最小化：不新增与教育无关的字段
        assert c["guidance"] is None or c["guidance"]["category"] not in ("关怀",)
    for w in ("psych", "建议关注", "抑郁", "焦虑", "心理"):
        assert w not in txt


def test_screen_text_never_shows_a_real_example_name(app_data):
    names = {s["name"] for s in app_data["focal"]["students"]}
    pv = json.dumps(app_data["screen"]["privacy"], ensure_ascii=False)
    ev = json.dumps(app_data["screen"]["events"] + app_data["screen"]["audit"], ensure_ascii=False)
    assert not [n for n in names if n in pv or n in ev]


def test_protection_count_is_a_count(app_data):
    pv = app_data["screen"]["privacy"]
    assert pv["total"] == len(pv["protections"]) == 12
    assert pv["enabled"] == sum(p["on"] for p in pv["protections"])
    assert all(p["where"] for p in pv["protections"])
    assert "人脸图像" in pv["not_collected"]


def test_graph_numbers_come_from_data(app_data, result):
    g = app_data["screen"]["graph"]
    kc = [n for n in g["nodes"] if n["kind"] == "kc"]
    items = [n for n in g["nodes"] if n["kind"] == "item"]
    assert len(kc) == 6 and len(items) == 60
    assert sum(n["n"] for n in items) == result["data"]["n_kt_responses"]
    assert app_data["screen"]["kpi"]["responses"] == result["data"]["n_kt_responses"]
