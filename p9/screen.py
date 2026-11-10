"""数据大屏需要的数据：知识图谱、学生轮播（已打码）、合成的实时动态与访问审计、隐私保护措施清单。

打码在这里（Python 端）完成：轮播卡片的数据里只有打码后的姓名和学号，不带原文，
页面上也就不可能把原文渲染进 DOM（tests/test_screen.py 与浏览器验收锁住）。
心理健康相关的任何字段都不进入轮播。
"""
from __future__ import annotations

import datetime as dt

import numpy as np

from . import config as C

# 知识点之间的先修关系：按初中数学课程的一般顺序设定（设计假设，不是从数据里学出来的）
PREREQ = [("num", "eq"), ("eq", "func"), ("num", "stat"), ("geo", "trans"), ("func", "trans"), ("num", "geo")]

# 保护措施：只列本平台里能指出具体实现的条目；离线演示版里做不到的如实标为未启用
PROTECTIONS = [
    {"name": "姓名遮挡", "on": True, "where": "大屏轮播只拿到打码后的姓名（p9/screen.py::mask_name），DOM 中没有原文"},
    {"name": "学号遮挡", "on": True, "where": "轮播只显示学号前 3 位"},
    {"name": f"汇总人数少于 {C.SMALL_CELL_MIN} 人不显示", "on": True, "where": "比“少于 5 人”更严；config.SMALL_CELL_MIN"},
    {"name": "心理信息分级可见", "on": True, "where": "个人两档只给班主任；学校只看年级汇总；教育局不可见"},
    {"name": "心理信息不进入轮播与排名", "on": True, "where": "轮播数据里没有心理字段；所有名单按学号排列"},
    {"name": "生物识别默认关闭", "on": True, "where": "不采集人脸、表情、声纹、眼动；多模态只用合成信号演示"},
    {"name": "报告按角色裁剪", "on": True, "where": "报告函数只接收 P9.scope(role) 的数据"},
    {"name": "查看个人档案需授权并留痕", "on": True, "where": "“授权查看”先确认身份，再写访问审计"},
    {"name": "未获监护人同意不做 AI 评阅", "on": True, "where": "沿用 p4 的合规闸门（演示学生“刘*”）"},
    {"name": "AI 评分须教师复核", "on": True, "where": "家长端只显示复核后的结果（p4）"},
    {"name": "传输加密（HTTPS）", "on": False, "where": "离线单机演示不涉及网络传输；正式部署前必须启用"},
    {"name": "个人信息保护影响评估报告", "on": False, "where": "个人信息保护法第五十五条要求事前评估；本演示没有做，上线前必须补做"},
]

MASK_RULES = [
    {"rule": "姓名", "example": "保留首末字，中间打码", "scope": "大屏、轮播、审计日志"},
    {"rule": "学号", "example": "只显示前 3 位", "scope": "大屏、轮播"},
    {"rule": "小组统计", "example": f"人数 < {C.SMALL_CELL_MIN} 不显示", "scope": "所有汇总"},
    {"rule": "心理信息", "example": "分级可见，不进轮播", "scope": "全平台"},
]

COLLECTED = ["年级班级", "学号（脱敏展示）", "练习作答记录", "作业量规分项", "周测成绩", "家庭与作息（只用于年级汇总）"]
NOT_COLLECTED = ["人脸图像", "表情与情绪", "声纹", "眼动", "精确定位", "电话", "家庭住址", "身份证号"]


def mask_name(name: str) -> str:
    if len(name) <= 1:
        return "*"
    if len(name) == 2:
        return name[0] + "*"
    return name[0] + "*" * (len(name) - 2) + name[-1]


def mask_sid(sid: str) -> str:
    return sid[:3] + "*" * max(2, len(sid) - 3)


def build(students, focal_recs: list[dict], seqs: dict, ktd: dict, final_mastery: dict, classes: list[dict],
          school: dict, p4_demo: dict | None, kt_auc: dict) -> dict:
    K = len(C.KCS)
    # ---- 知识图谱：6 个知识点 + 60 道练习题（全校正确率）
    items_kc = ktd["items_kc"]
    n_items = len(items_kc)
    cnt = np.zeros(n_items)
    cor = np.zeros(n_items)
    for s in students:
        q = seqs[s.sid]
        np.add.at(cnt, q["item"], 1)
        np.add.at(cor, q["item"], q["obs"])
    mast = np.array([final_mastery[s.sid] for s in students])
    nodes = [{"id": k["id"], "name": k["name"], "kind": "kc", "mastery": round(float(mast[:, i].mean()), 3),
              "below": int((mast[:, i] < 0.6).sum())} for i, k in enumerate(C.KCS)]
    for j in range(n_items):
        nodes.append({"id": f"q{j + 1}", "name": f"练习题 {j + 1}", "kind": "item", "kc": C.KCS[int(items_kc[j])]["id"],
                      "rate": round(float(cor[j] / cnt[j]), 3) if cnt[j] else None, "n": int(cnt[j])})
    links = [{"s": a, "t": b, "kind": "prereq"} for a, b in PREREQ]
    links += [{"s": C.KCS[int(items_kc[j])]["id"], "t": f"q{j + 1}", "kind": "item"} for j in range(n_items)]

    # ---- 学生轮播：初二(3)班，按学号；打码，不含心理字段
    carousel = []
    for i, st in enumerate(focal_recs):
        hw = [r for r in st["homework"] if r.get("ratio") is not None]
        g = next((x for x in st["guidance"] if x["category"] not in ("关怀", "合规")), None)
        carousel.append({
            "idx": i, "mask_name": mask_name(st["name"]), "surname": st["name"][0], "mask_sid": mask_sid(st["sid"]),
            "class_name": st["class_name"], "kc_mastery": [round(v, 3) for v in st["kt"]["bkt"][-1]],
            "homework": [round(100 * r["ratio"], 1) for r in hw], "homework_dates": [r["date"][5:] for r in hw],
            "growth": st["growth"]["academic"], "mastery_avg": st["radar"]["mastery"],
            "consent_ok": not (st["from_p4"] and "basic" not in st["p4_consent"]),
            "guidance": {"title": g["title"], "confidence": g["confidence"], "category": g["category"]} if g else None,
            "seed": int(st["sid"][1:]) * 7919 % 1000,
        })

    # ---- 合成的“实时动态”：全部由本数据的汇总数字生成，时间戳是模拟的
    rng = np.random.default_rng([C.SEED, 20])
    events = []
    week_practice = {}
    for s in students:
        key = (s.grade, s.class_no)
        week_practice[key] = week_practice.get(key, 0) + int(((seqs[s.sid]["day"] // C.DAYS_PER_WEEK) == C.N_WEEKS - 1).sum())
    for c in classes:
        events.append({"type": "练习", "text": f"{c['name']} · 第 {C.N_WEEKS} 周完成练习 {week_practice[(c['grade'], c['class_no'])]} 题"})
    if p4_demo:
        for a in p4_demo["assignments"]:
            events.append({"type": "AI 评阅", "text": f"{C.GRADES[C.FOCAL_CLASS[0]]}({C.FOCAL_CLASS[1]})班 · 《{a['title']}》{a['n']} 份作业完成 AI 初评"})
            if a["n_reviewed"]:
                events.append({"type": "教师复核", "text": f"《{a['title']}》{a['n_reviewed']} 份完成教师复核，{a['n_changed']} 份改分已留痕"})
    events += [
        {"type": "模型", "text": f"知识追踪模型更新 · {len(students)} 人 · 留出 AUC {kt_auc['bkt']['value']:.3f}"},
        {"type": "模型", "text": f"认知诊断完成 · {len(students)} 人 × {K} 个知识点"},
        {"type": "测验", "text": "自适应测验 · 10 题后能力估计收敛"},
        {"type": "隐私", "text": "脱敏引擎 · 大屏轮播已遮挡姓名与学号"},
        {"type": "隐私", "text": f"小组统计 · 人数少于 {C.SMALL_CELL_MIN} 的格子已隐藏"},
        {"type": "合规", "text": "监护人未同意的 1 名学生 · 作业 AI 评阅保持关闭"},
    ]
    order = rng.permutation(len(events))
    t0 = dt.datetime(2026, 10, 11, 16, 0)
    events = [{**events[i], "time": (t0 + dt.timedelta(minutes=int(7 * n + rng.integers(0, 6)))).strftime("%H:%M")}
              for n, i in enumerate(order)]

    # ---- 合成的访问审计（姓名一律打码；角色与动作一一对应）
    templates = [("王老师（班主任）", "查看了 {n} 的学业档案"), ("王老师（班主任）", "导出了 初二(3)班 班级学情报告"),
                 ("李老师（数学）", "查看了 {n} 的知识追踪曲线"), ("陈老师（语文）", "复核了 {n} 的语文作文"),
                 ("校长办公室", "查看了 学校学情汇总"), ("校长办公室", "查看了 年级层面心理支持资源规划"),
                 ("系统", "脱敏引擎拦截了 1 次未授权的个人档案访问")]
    audit = []
    for n in range(14):
        who, act = templates[int(rng.integers(len(templates)))]
        st = carousel[int(rng.integers(len(carousel)))]
        audit.append({"time": (t0 + dt.timedelta(minutes=11 * n)).strftime("%m-%d %H:%M"),
                      "text": f"{who} {act.format(n=st['mask_name'])} · 已记录"})
    on = sum(p["on"] for p in PROTECTIONS)
    return {"graph": {"nodes": nodes, "links": links, "prereq_note": "知识点之间的先修关系是按课程顺序设定的设计假设"},
            "carousel": carousel, "events": events, "audit": audit,
            "privacy": {"protections": PROTECTIONS, "enabled": on, "total": len(PROTECTIONS), "mask_rules": MASK_RULES,
                        "collected": COLLECTED, "not_collected": NOT_COLLECTED},
            "kpi": {"students": len(students), "responses": int(sum(len(v["obs"]) for v in seqs.values())),
                    "ai_graded": p4_demo["n_submissions"] if p4_demo else None, "mastery": school["mastery"],
                    "academic": school["academic"], "homework": school["homework"]}}
