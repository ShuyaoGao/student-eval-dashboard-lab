"""一条命令生成 app/：导出 p3/p4 → 跑合成数据上的全部模型 → 写 results/ → 组装 app/。

python -m p9 build              # 默认
python -m p9 build --offline    # 不读 p3/p4 目录，只用 data/sources/ 里的快照
"""
from __future__ import annotations

import datetime as dt
import html
import json
import platform
import re
import shutil
import sys
from pathlib import Path

import numpy as np

from . import __version__, analysis, legal, methods, sources_p3, sources_p4
from . import config as C

FOOTER = {"author": "Shuyao Gao", "university_en": "aSSIST University (Seoul School of Integrated Sciences and Technologies)",
          "university_ko": "서울과학종합대학원대학교", "license": "代码 MIT · 文档与素材 CC BY 4.0"}


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(type(o))


def _dump(obj, path: Path, indent=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=indent, default=_json_default), encoding="utf-8")


def load_sources(offline: bool, log=print) -> tuple[dict, dict]:
    C.SOURCES_DIR.mkdir(parents=True, exist_ok=True)
    out = []
    for name, mod, root in (("p3", sources_p3, C.P3_DIR), ("p4", sources_p4, C.P4_DIR)):
        snap = C.SOURCES_DIR / f"{name}_export.json"
        if not offline and root.exists():
            d = mod.export(root)
            _dump(d, snap, indent=None)
            log(f"{name}：从 {root.name} 导出，快照写入 {snap.relative_to(C.ROOT)}")
        else:
            d = json.loads(snap.read_text(encoding="utf-8"))
            log(f"{name}：使用快照 {snap.relative_to(C.ROOT)}")
        out.append(d)
    return out[0], out[1]


def _fmt_ref(key: str, refs: dict) -> dict:
    r = refs.get(key)
    if not r or not r.get("verified"):
        return {"key": key, "text": f"{key} [未核实]", "verified": False}
    d = r["display"]
    au = d["authors"]
    first = au[0].split()[0] if au else ""
    first = first.title() if first.isupper() else first
    who = first if len(au) == 1 else (f"{first} & {au[1].split()[0]}" if len(au) == 2 else f"{first} et al.")
    venue = html.unescape(d["venue"] or "")
    title = html.unescape(re.sub(r"<[^>]+>", "", d["title"]))
    return {"key": key, "text": f"{who} ({d['year']}). {title}. {venue}", "url": d["url"], "verified": True,
            "links": d.get("links", [])}


def _p3_view(p3: dict) -> dict:
    keep = ("evidence", "prevalence", "forest", "sim_models", "real_auc", "real_screening", "real_prep",
            "calculator_examples", "calculator_source")
    v = {k: p3[k] for k in keep}
    v["calc_disclaimer"] = p3["calc_model"]["disclaimer"]
    return v


def _p4_view(p4: dict) -> dict:
    demo = p4["demo"]
    names = {s["id"]: s["name"] for s in demo["students"]}
    per_a = []
    for a in demo["assignments"]:
        subs = [s for s in demo["submissions"] if s["assignment_id"] == a["id"]]
        rev = [s for s in subs if s["status"] == "reviewed" and s["ai_total"] is not None]
        changed = [s for s in rev if abs(s["ai_total"] - s["total"]) > 1e-6]
        bands = {}
        for s in subs:
            bands[s["band"]] = bands.get(s["band"], 0) + 1
        per_a.append({"id": a["id"], "title": a["title"], "subject": a["subject"], "rubric_key": a["rubric_key"],
                      "date": min((s["submitted_at"] for s in subs), default=a["created_at"][:10]),  # 与学生页一致：用提交日期
                      "n": len(subs), "n_reviewed": len(rev), "n_changed": len(changed),
                      "mean_ratio": round(float(np.mean([s["total"] / s["max"] for s in subs])), 3) if subs else None,
                      "mean_abs_change": round(float(np.mean([abs(s["ai_total"] - s["total"]) for s in rev])), 2) if rev else None,
                      "bands": bands})
    # 示例：张小明（p4 学生 id=1）一篇有错误标注的已复核作文 + 一份数学作业
    ex = []
    for s in demo["submissions"]:
        if names.get(s["student_id"]) == "张小明" and s["errors"] and s["ocr_text"]:
            ex.append(s)
    examples = []
    for s in ex[:3]:
        a = next(x for x in demo["assignments"] if x["id"] == s["assignment_id"])
        examples.append({**{k: s[k] for k in ("status", "total", "max", "band", "ai_total", "criteria", "errors", "comment",
                                              "confidence", "needs_review", "review_reasons", "ocr_text", "submitted_at",
                                              "knowledge_points")},
                         "title": a["title"], "rubric_key": a["rubric_key"], "student": "张小明"})
    flow = next((s for s in demo["submissions"] if s["status"] == "reviewed" and s["ai_total"] is not None
                 and abs(s["ai_total"] - s["total"]) > 1e-6 and names.get(s["student_id"]) == "张小明"), None)
    return {"rubrics": p4["rubrics"], "assignments": per_a, "examples": examples,
            "flow_example": {"ai_total": flow["ai_total"], "teacher_total": flow["total"], "max": flow["max"],
                             "title": next(x["title"] for x in demo["assignments"] if x["id"] == flow["assignment_id"])} if flow else None,
            "n_submissions": len(demo["submissions"]), "n_reviewed": sum(1 for s in demo["submissions"] if s["status"] == "reviewed"),
            "n_students": len(demo["students"]),
            "no_consent": [names[sid] for sid in names if "basic" not in demo["consents"].get(str(sid), demo["consents"].get(sid, []))],
            "cloud_ai": [names[sid] for sid in names if "cloud_ai" in demo["consents"].get(str(sid), demo["consents"].get(sid, []))],
            "eval_baselines": p4["eval_baselines"], "screenshots": p4["screenshots"], "flow_gif": p4["flow_gif"]}


def env_stamp() -> dict:
    import sklearn
    return {"python": sys.version.split()[0], "numpy": np.__version__, "scikit_learn": sklearn.__version__,
            "platform": platform.platform(), "p9_version": __version__, "seed": C.SEED,
            "built_at": dt.datetime.now().isoformat(timespec="seconds")}


def build(offline: bool = False, log=print) -> dict:
    p3, p4 = load_sources(offline, log)
    p4v = _p4_view(p4)
    result, app, raw = analysis.run(p3, p4, log=log, p4_view=p4v)
    rdir = C.RESULTS_DIR / C.RUN_ID
    _dump(result, rdir / "result.json", indent=1)
    _dump(env_stamp(), rdir / "_env_stamp.json", indent=1)
    (rdir / "raw").mkdir(parents=True, exist_ok=True)
    for k, rows in raw.items():
        with (rdir / "raw" / f"{k}.jsonl").open("w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False, default=_json_default) + "\n")
    log(f"结果写入 {rdir.relative_to(C.ROOT)}")

    refs = json.loads((C.DATA_DIR / "refs_verified.json").read_text(encoding="utf-8"))
    legal_v = json.loads((C.DATA_DIR / "legal_verified.json").read_text(encoding="utf-8"))
    ref_keys = sorted({k for m in methods.METHODS for k in m["refs"]})
    app["refs"] = {k: _fmt_ref(k, refs["refs"]) for k in ref_keys}
    app["refs_checked_at"] = refs["checked_at"]
    app["legal"] = {"sources": {k: {"title": v["title"], "url": v["url"]} for k, v in legal.SOURCES.items()},
                    "clauses": [{**{k: c[k] for k in ("id", "source", "article", "group", "summary", "quote")},
                                 "verified": legal_v["clauses"].get(c["id"], {}).get("verified", False)} for c in legal.CLAUSES],
                    "checked_at": legal_v["checked_at"]}
    app["methods"] = {"maturity": methods.MATURITY, "cards": methods.METHODS}
    app["roles"] = methods.ROLES
    app["visibility"] = methods.VISIBILITY
    app["catalog"] = methods.DATA_CATALOG
    app["prohibited"] = methods.PROHIBITED
    app["defaults"] = methods.DEFAULTS
    app["p3"] = _p3_view(p3)
    app["p4"] = p4v
    app["footer"] = FOOTER
    app["build"] = {"version": __version__, "run_id": C.RUN_ID, "built_at": dt.date.today().isoformat(),
                    "result_path": f"results/{C.RUN_ID}/result.json"}

    # ---- 组装 app/
    C.APP_DIR.mkdir(exist_ok=True)
    js = "/* 自动生成：python -m p9 build。全部为合成数据。 */\nwindow.P9_DATA = " + json.dumps(
        app, ensure_ascii=False, separators=(",", ":"), default=_json_default) + ";\n"
    (C.APP_DIR / "data.js").write_text(js, encoding="utf-8")
    for fp in sorted(C.WEB_DIR.iterdir()):
        if fp.suffix not in (".html", ".css", ".js"):
            continue
        src = fp.read_text(encoding="utf-8").replace("{{BUILD}}", f"v{__version__} · {C.RUN_ID}")
        (C.APP_DIR / fp.name).write_text(src, encoding="utf-8")
    vend = C.WEB_DIR / "vendor"
    if vend.exists():  # 第三方库（只有 .js 与许可证文本），原样复制
        shutil.copytree(vend, C.APP_DIR / "vendor", dirs_exist_ok=True)
    shot_src = C.P4_DIR / "showcase" / "assets"
    dst = C.APP_DIR / "assets" / "p4"
    if shot_src.exists() and not offline:
        dst.mkdir(parents=True, exist_ok=True)
        for s in p4["screenshots"] + ([{"file": p4["flow_gif"]}] if p4["flow_gif"] else []):
            shutil.copy2(shot_src / s["file"], dst / s["file"])
    size = sum(p.stat().st_size for p in C.APP_DIR.rglob("*") if p.is_file())
    log(f"app/ 组装完成：{size / 1e6:.2f} MB，data.js {len(js) / 1e6:.2f} MB")
    return {"result": result, "app_bytes": size}
