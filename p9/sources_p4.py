"""从 p4-edu-eval 导出作业评阅模块需要的内容（只读 p4，不改它）。

- 量规：backend/rubrics/*.yaml
- 演示数据：data/edu_eval.db（先把 db 及 -wal/-shm 复制到临时目录再读，避免触碰 p4 的数据库文件）
- 公开数据集上的规则基线：eval/results/*/result.json
- 演示学生的能力设定：backend/seed.py 里的 STUDENTS 常量（用 ast 解析，不 import p4 的代码）
- 截图：showcase/assets/ 里挑选若干张，build 时复制进 app/assets/p4/
"""
from __future__ import annotations

import ast
import json
import shutil
import sqlite3
import tempfile
from pathlib import Path

import yaml

from .config import P4_DIR

SCREENSHOTS = [  # (文件名, 说明)；全部是 p4 用无头 Edge 截取的演示数据界面
    ("m_upload.jpg", "家长端：拍照上传作业"),
    ("pp_zh_before.jpg", "预处理前：手机拍摄的作文纸"),
    ("pp_zh_after.jpg", "预处理后：透视矫正、去阴影"),
    ("m_result.jpg", "AI 初评结果（mock 规则评分）"),
    ("m_result_errors.jpg", "按原文位置标注的错误"),
    ("m_review_form.jpg", "教师复核：逐项改分"),
    ("m_parent_sees_review.jpg", "家长看到教师复核后的结果"),
    ("m_profile_after.jpg", "学生画像随复核更新"),
    ("d_classboard.jpg", "教师端：班级看板"),
    ("d_rubric.jpg", "量规编辑"),
    ("m_privacy.jpg", "家长端：授权与隐私"),
]
FLOW_GIF = "flow.gif"


def _rubrics(p4: Path) -> list[dict]:
    out = []
    for f in sorted((p4 / "backend" / "rubrics").glob("*.yaml")):
        y = yaml.safe_load(f.read_text(encoding="utf-8"))
        out.append({"key": y["key"], "name": y["name"], "subject": y.get("subject"), "kind": y.get("kind"),
                    "max_score": y.get("max_score"), "source": " ".join(str(y.get("source", "")).split()),
                    "bands": [{"name": b["name"], "min": b["min"], "max": b["max"], "descriptor": b.get("descriptor", "")}
                              for b in y.get("bands", [])],
                    "criteria": [{"id": c["id"], "name": c["name"], "max": c["max"], "dimension": c.get("dimension"),
                                  "descriptor": c.get("descriptor", "")} for c in y.get("criteria", [])],
                    "deductions": [{"name": d["name"], "rule": d.get("rule", ""), "max": d.get("max")}
                                   for d in y.get("deductions", [])],
                    "file": f"backend/rubrics/{f.name}"})
    return out


def _seed_students(p4: Path) -> list[dict]:
    tree = ast.parse((p4 / "backend" / "seed.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "STUDENTS":
            rows = ast.literal_eval(node.value)
            return [{"name": n, "student_no": no, "birth_year": by, "ability": ab, "drift": dr}
                    for n, no, by, ab, dr in rows]
    raise ValueError("p4 seed.py 中没有找到 STUDENTS")


def _demo_db(p4: Path) -> dict:
    src = p4 / "data" / "edu_eval.db"
    with tempfile.TemporaryDirectory() as td:
        for suf in ("", "-wal", "-shm"):
            if Path(str(src) + suf).exists():
                shutil.copy2(str(src) + suf, Path(td) / ("edu_eval.db" + suf))
        con = sqlite3.connect(Path(td) / "edu_eval.db")
        con.row_factory = sqlite3.Row
        students = {r["id"]: dict(r) for r in con.execute("select id, name, student_no from students")}
        consents = {}
        for r in con.execute("select student_id, scope from consents where revoked_at is null"):
            consents.setdefault(r["student_id"], []).append(r["scope"])
        assignments = [dict(r) for r in con.execute("select id, title, subject, rubric_key, created_at from assignments order by created_at")]
        subs = []
        for r in con.execute("select id, assignment_id, student_id, status, ai_result, final_result, submitted_at, ocr_text "
                             "from submissions where is_demo = 1 order by submitted_at"):
            fr = json.loads(r["final_result"]) if r["final_result"] else None
            ai = json.loads(r["ai_result"]) if r["ai_result"] else None
            if not fr:
                continue
            subs.append({"id": r["id"], "assignment_id": r["assignment_id"], "student_id": r["student_id"],
                         "status": r["status"], "submitted_at": r["submitted_at"][:10],
                         "total": fr["total_score"], "max": fr["max_score"], "band": fr.get("band", ""),
                         "ai_total": ai["total_score"] if ai else None,
                         "criteria": [{"id": c["id"], "name": c["name"], "score": c["score"], "max": c["max_score"]}
                                      for c in fr.get("criteria", [])],
                         "errors": [{"type": e.get("type"), "quote": e.get("quote"), "start": e.get("start"),
                                     "end": e.get("end"), "message": e.get("message"), "suggestion": e.get("suggestion"),
                                     "severity": e.get("severity")} for e in fr.get("errors", [])],
                         "knowledge_points": fr.get("knowledge_points", []),
                         "comment": fr.get("comment", ""), "confidence": (ai or fr).get("confidence"),
                         "needs_review": (ai or {}).get("needs_review"), "review_reasons": (ai or {}).get("review_reasons", []),
                         "ocr_text": r["ocr_text"] or ""})
        con.close()
    return {"students": list(students.values()), "consents": consents, "assignments": assignments, "submissions": subs}


def _eval_baselines(p4: Path) -> list[dict]:
    out = []
    want = [("cfms34_mock_20261007_233615", "CFMS-34 train（单评分员，0–5）", "linear"),
            ("ellipse_mock_20261007_233555", "ELLIPSE Overall（1–5）", "linear"),
            ("ellipse_mock_20261007_233555", "ELLIPSE Overall（留出 70%，线性校准）", "calibrated")]
    for run, label, mode in want:
        p = p4 / "eval" / "results" / run / "result.json"
        if not p.exists():
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        o = d["overall"][mode]
        hh = d.get("human_human") or {}
        out.append({"label": label, "n": o["n"], "qwk": o["qwk"], "pearson": o["pearson"],
                    "human_human_qwk": hh.get("qwk") if isinstance(hh, dict) else None,
                    "source": f"eval/results/{run}/result.json", "locator": f"overall.{mode}.qwk"})
    return out


def export(p4: Path = P4_DIR) -> dict:
    return {"_note": "由 p9/sources_p4.py 从 p4-edu-eval 导出；演示数据为 p4 流水线在合成手写照片上的输出（mock 评分 + 模拟教师复核）。",
            "rubrics": _rubrics(p4), "seed_students": _seed_students(p4), "demo": _demo_db(p4),
            "eval_baselines": _eval_baselines(p4),
            "screenshots": [{"file": f, "caption": c} for f, c in SCREENSHOTS if (p4 / "showcase" / "assets" / f).exists()],
            "flow_gif": FLOW_GIF if (p4 / "showcase" / "assets" / FLOW_GIF).exists() else None}


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    d = export()
    print(len(d["rubrics"]), len(d["demo"]["submissions"]), d["eval_baselines"], d["demo"]["consents"])
