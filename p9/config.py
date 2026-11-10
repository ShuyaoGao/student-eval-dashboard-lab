"""路径与固定参数。所有随机过程都从这里的种子派生，保证 `python -m p9 build` 可复现。"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRAMS = ROOT.parent
P3_DIR = Path(os.environ.get("P9_P3_DIR", PROGRAMS / "p3-student-mh"))
P4_DIR = Path(os.environ.get("P9_P4_DIR", PROGRAMS / "p4-edu-eval"))

WEB_DIR = ROOT / "web"
APP_DIR = ROOT / "app"
DATA_DIR = ROOT / "data"
SOURCES_DIR = DATA_DIR / "sources"          # p3/p4 导出快照（进 git，p3/p4 不在时也能构建）
RESULTS_DIR = ROOT / "results"

SEED = 20261014
RUN_ID = "2026-10-14"                        # 结果目录名；改模型或种子时换一个

SCHOOL_NAME = "星海实验中学（虚构）"
REGION_NAME = "示例区（虚构）"
FOCAL_CLASS = (8, 3)                         # 初二(3)班：与 p4 演示班同名，前 12 名学生沿用 p4 的虚构姓名
GRADES = {7: "初一", 8: "初二", 9: "初三"}
CLASSES_PER_GRADE = 4
TERM_LABEL = "2026 秋季学期 · 第 1–6 周（截至 2026-10-11）"
TERM_START = "2026-09-01"
N_WEEKS = 6
DAYS_PER_WEEK = 5

# 数学知识点（知识追踪与认知诊断共用）；按初中数学“数与代数 / 图形与几何 / 统计与概率”领域取 6 个
KCS = [
    {"id": "num", "name": "数与式运算"},
    {"id": "eq", "name": "方程与不等式"},
    {"id": "func", "name": "函数"},
    {"id": "geo", "name": "图形性质与证明"},
    {"id": "trans", "name": "图形变换与坐标"},
    {"id": "stat", "name": "统计与概率"},
]

SMALL_CELL_MIN = 10        # 汇总格子人数少于此值时不显示（防止反推个人）
ATTENTION_TOP_SHARE = 0.20  # 与 p3 筛查情景一致：群体风险因素最多的 20% 标为“建议关注”
