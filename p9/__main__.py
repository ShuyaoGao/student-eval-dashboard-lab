"""python -m p9 build [--offline]"""
from __future__ import annotations

import argparse
import sys


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(prog="python -m p9", description="学生成长全景评价平台（展示版）")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="导出 p3/p4、跑模型、生成 app/")
    b.add_argument("--offline", action="store_true", help="不读 p3/p4 目录，只用 data/sources/ 快照")
    args = ap.parse_args()
    if args.cmd == "build":
        from .build import build
        build(offline=args.offline)


if __name__ == "__main__":
    main()
