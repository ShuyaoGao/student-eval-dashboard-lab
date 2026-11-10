"""用本机 Edge 无头打开数据大屏，按时间抽帧，用 Pillow 合成 GIF。

python tools/record_gif.py --out <目录>/20_screen.gif [--seconds 9] [--fps 7] [--width 960]
不下载浏览器；GIF 超过 --max-mb 时自动降低帧率重试。
"""
from __future__ import annotations

import argparse
import io
import sys
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def record(seconds: float, fps: float, width: int) -> tuple[list[Image.Image], list[int]]:
    from playwright.sync_api import sync_playwright
    scale = width / 1920
    frames, stamps = [], []
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True)
        page = br.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=scale)
        page.goto((ROOT / "app" / "index.html").resolve().as_uri() + "?nohelp#/screen")
        t0 = time.perf_counter()
        nxt = t0
        while time.perf_counter() - t0 < seconds:
            now = time.perf_counter()
            if now < nxt:
                time.sleep(nxt - now)
            stamps.append(time.perf_counter())
            frames.append(Image.open(io.BytesIO(page.screenshot(type="jpeg", quality=90))).convert("RGB"))
            nxt += 1 / fps
        br.close()
    durs = [max(20, int(round(1000 * (b - a)))) for a, b in zip(stamps, stamps[1:])] + [int(1000 / fps)]
    return frames, durs


def save(frames, durs, out: Path) -> int:
    pal = frames[len(frames) // 2].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    q[0].save(out, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=True, disposal=1)
    return out.stat().st_size


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seconds", type=float, default=9.0)
    ap.add_argument("--fps", type=float, default=7.0)
    ap.add_argument("--width", type=int, default=960)
    ap.add_argument("--max-mb", type=float, default=8.0)
    a = ap.parse_args()
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fps = a.fps
    for _ in range(4):
        frames, durs = record(a.seconds, fps, a.width)
        size = save(frames, durs, out)
        print(f"{len(frames)} 帧，{sum(durs) / 1000:.1f} 秒，{size / 1e6:.2f} MB → {out}")
        if size <= a.max_mb * 1e6:
            return 0
        fps *= 0.7
    return 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
