"""逐条检查 p9/legal.py 的条款摘录是否原样出现在官方文本里。

用法：python tools/verify_legal.py [--raw-dir <目录>]
输出：data/legal_verified.json。请求只带通用 User-Agent，不带任何个人信息。
比较时去掉 HTML 标签、统一空白和引号；中文去掉全部空白。
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from p9.legal import CLAUSES, SOURCES  # noqa: E402

UA = "Mozilla/5.0 (compatible; p9-legal-check/0.1; offline teaching demo)"


def fetch(src: dict) -> str:
    req = urllib.request.Request(src["fetch"], headers={"User-Agent": UA, "Accept": src.get("accept", "text/html"),
                                                        "Accept-Language": "eng" if src["lang"] == "en" else "zh-CN"})
    for attempt in range(3):
        try:
            raw = urllib.request.urlopen(req, timeout=40).read()
            break
        except Exception:  # noqa: BLE001
            if attempt == 2:
                raise
            time.sleep(3)
    for enc in ("utf-8", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "ignore")


def normalize(s: str, lang: str) -> str:
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", s, flags=re.S | re.I)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("\xa0", " ")
    s = re.sub(r"\s+", " " if lang == "en" else "", s)
    return s


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir")
    args = ap.parse_args()
    texts, errors = {}, {}
    for k, src in SOURCES.items():
        try:
            t = fetch(src)
            if args.raw_dir:
                Path(args.raw_dir).mkdir(parents=True, exist_ok=True)
                (Path(args.raw_dir) / f"{k}.html").write_text(t, encoding="utf-8")
            texts[k] = normalize(t, src["lang"])
        except Exception as e:  # noqa: BLE001
            errors[k] = f"{type(e).__name__}: {e}"
        time.sleep(1)
    out = {"checked_at": dt.date.today().isoformat(), "method": "下载官方文本，去标签、统一空白后检查摘录是否原样出现",
           "source_errors": errors, "clauses": {}}
    for c in CLAUSES:
        lang = SOURCES[c["source"]]["lang"]
        q = normalize(c["quote"], lang)
        t = texts.get(c["source"], "")
        pos = t.find(q)
        ok = pos >= 0
        anchor_ok = None
        if ok and c.get("anchor"):
            # 宽松的条号检查：条号（如“第二十八条”/“Article 5”）出现在摘录之前的一个窗口内
            # （不能排除中间隔了别的条；条号的最终核对由作者人工完成）
            win = 4000 if lang == "zh" else 60000
            a = normalize(c["anchor"], lang)
            apos = t.rfind(a, max(0, pos - win), pos)
            anchor_ok = apos >= 0
        out["clauses"][c["id"]] = {"verified": bool(ok and anchor_ok is not False), "quote_found": ok,
                                   "anchor_found": anchor_ok, "source": c["source"]}
        print(c["id"], out["clauses"][c["id"]], errors.get(c["source"], ""))
    (ROOT / "data" / "legal_verified.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
