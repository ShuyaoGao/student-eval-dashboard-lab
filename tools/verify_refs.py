"""核实 p9/refs.py 里的论文：Crossref（DOI）、arXiv API、Semantic Scholar（确认会议）。

用法：python tools/verify_refs.py [--raw-dir <目录>]
输出：data/refs_verified.json（进 git）。原始响应写到 --raw-dir（默认不保存）。
请求只带一个通用 User-Agent，不带任何邮箱或个人信息。
"""
from __future__ import annotations

import argparse
import datetime as dt
import difflib
import json
import re
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from p9.refs import REFS  # noqa: E402

UA = {"User-Agent": "p9-ref-check/0.1 (offline teaching demo; no contact)"}


def _get(url: str, raw_dir: Path | None, name: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            data = urllib.request.urlopen(req, timeout=25).read()
            if raw_dir:
                (raw_dir / name).write_bytes(data)
            return data
        except Exception:  # noqa: BLE001
            if attempt == 2:
                raise
            time.sleep(2 + 2 * attempt)
    raise RuntimeError("unreachable")


def _norm(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _sim(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def crossref(doi: str, raw_dir):
    d = json.loads(_get("https://api.crossref.org/works/" + urllib.parse.quote(doi), raw_dir,
                        "crossref_" + re.sub(r"\W", "_", doi) + ".json"))["message"]
    issued = (d.get("issued") or {}).get("date-parts", [[None]])[0]
    authors = [f"{a.get('family', '')} {a.get('given', '')[:1]}".strip() for a in d.get("author", [])]
    return {"source": "crossref", "title": (d.get("title") or [""])[0], "authors": authors,
            "year": issued[0] if issued else None, "venue": (d.get("container-title") or [""])[0],
            "volume": d.get("volume"), "issue": d.get("issue"), "pages": d.get("page"),
            "url": "https://doi.org/" + doi}


def arxiv(aid: str, raw_dir):
    x = _get("http://export.arxiv.org/api/query?id_list=" + aid, raw_dir, f"arxiv_{aid}.xml")
    ns = {"a": "http://www.w3.org/2005/Atom", "x": "http://arxiv.org/schemas/atom"}
    e = ET.fromstring(x).find("a:entry", ns)
    if e is None or e.find("a:title", ns) is None:
        raise ValueError("arXiv 无此条目")
    authors = [a.find("a:name", ns).text for a in e.findall("a:author", ns)]
    authors = [f"{n.split()[-1]} {n.split()[0][:1]}" for n in authors]
    jr = e.find("x:journal_ref", ns)
    cm = e.find("x:comment", ns)
    return {"source": "arxiv", "title": " ".join(e.find("a:title", ns).text.split()), "authors": authors,
            "year": int(e.find("a:published", ns).text[:4]), "journal_ref": jr.text if jr is not None else "",
            "comment": " ".join(cm.text.split()) if cm is not None else "",
            "url": "https://arxiv.org/abs/" + aid}


def s2(pid: str, raw_dir):
    """Semantic Scholar：用于确认 arXiv 论文的正式发表会议。"""
    url = ("https://api.semanticscholar.org/graph/v1/paper/" + urllib.parse.quote(pid, safe=":")
           + "?fields=title,venue,year,authors,externalIds")
    for attempt in range(5):
        try:
            d = json.loads(_get(url, raw_dir, "s2_" + re.sub(r"\W", "_", pid) + ".json"))
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 4:
                raise
            time.sleep(6 * (attempt + 1))
    names = [a.get("name", "") for a in d.get("authors", [])]
    return {"source": "semantic_scholar", "title": d.get("title", ""), "venue": d.get("venue", ""),
            "year": d.get("year"), "authors": [f"{n.split()[-1]} {n.split()[0][:1]}" for n in names if n],
            "url": "https://www.semanticscholar.org/paper/" + d.get("paperId", "")}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", default=None)
    args = ap.parse_args()
    raw = Path(args.raw_dir) if args.raw_dir else None
    if raw:
        raw.mkdir(parents=True, exist_ok=True)
    out = {"checked_at": dt.date.today().isoformat(), "method": "Crossref /works/{doi}；arXiv export API；Semantic Scholar graph API（会议名）。标题相似度 ≥0.85 记为已核实。", "refs": {}}
    for r in REFS:
        rec = {"want_title": r["title"], "checks": []}
        for kind in ("doi", "arxiv", "s2"):
            if kind not in r:
                continue
            try:
                if kind == "doi":
                    m = crossref(r["doi"], raw)
                elif kind == "arxiv":
                    m = arxiv(r["arxiv"], raw)
                else:
                    m = s2(r["s2"], raw)
                m["title_similarity"] = round(_sim(m["title"], r["title"]), 3)
                m["ok"] = m["title_similarity"] >= 0.85
                rec["checks"].append(m)
            except Exception as e:  # noqa: BLE001
                rec["checks"].append({"source": kind, "error": f"{type(e).__name__}: {e}"})
            time.sleep(1.0)
        oks = [c for c in rec["checks"] if c.get("ok")]
        rec["verified"] = bool(oks)
        if oks:
            # 发表处优先用正式发表版本（Crossref / DBLP），arXiv 只作为补充链接
            pub = next((c for c in oks if c["source"] in ("crossref", "semantic_scholar")), oks[0])
            rec["display"] = {"authors": pub["authors"], "year": pub["year"],
                              "venue": pub.get("venue") or pub.get("journal_ref") or "arXiv 预印本",
                              "url": pub["url"], "title": pub["title"],
                              "links": [c["url"] for c in oks]}
        out["refs"][r["key"]] = rec
        print(r["key"], "OK" if rec["verified"] else "未核实", [(c.get("source"), c.get("title_similarity"), c.get("error")) for c in rec["checks"]])
    p = ROOT / "data" / "refs_verified.json"
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("写入", p)


if __name__ == "__main__":
    main()
