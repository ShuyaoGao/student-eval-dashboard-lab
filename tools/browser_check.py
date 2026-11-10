"""浏览器验收：本机 Edge 无头（Playwright 的 channel="msedge"，不下载任何浏览器）。

python tools/browser_check.py [--shots <目录>] [--sizes 1920x1080,1366x768] [--browser msedge|chrome]

对每个尺寸、每个路由：打开 file:// 页面，收集 JS 报错（pageerror + console.error），检查横向溢出，
并对五个角色视图做隐私断言（教育局视图不出现心理健康词汇和学生姓名；家长视图只出现自己孩子的名字……）。
结果打印成 JSON；有失败时退出码为 1。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app" / "index.html"

ROUTES = ["screen", "cockpit", "student", "student/{sid}/cdm", "student/{sid}/cat", "student/{sid}/guide", "student/{sid}/comment",
          "homework", "psych", "reports/student", "reports/teacher", "reports/parent", "reports/leader", "reports/bureau",
          "methods", "methods/mm_emotion", "methods/mm_gaze", "methods/mm_engagement", "methods/mm_speech", "methods/cat", "compliance"]
SHOTS = {"screen": "00_screen", "cockpit": "01_cockpit", "student": "02_student", "methods": "03_methods", "compliance": "04_compliance",
         "reports/parent": "05_parent", "student/{sid}/cat": "06_student_cat", "homework": "07_homework", "psych": "08_psych",
         "reports/teacher": "09_teacher", "reports/bureau": "10_bureau", "reports/leader": "11_leader", "methods/mm_emotion": "12_emotion"}
PSYCH_WORDS = ["抑郁", "焦虑", "建议关注", "阳性", "自杀"]  # 指向心理数据本身的词；“不含心理健康信息”这类声明允许出现


def page_text(page) -> str:
    return page.evaluate("document.getElementById('view').innerText")


def screen_checks(page, url0, names, shots, size, errors) -> dict:
    """数据大屏的验收。打开时不带 hash：默认就应该进入大屏。"""
    n0 = len(errors)
    page.goto(url0)
    page.wait_for_timeout(6000)
    r = {}
    r["default_route_ok"] = page.evaluate("document.body.classList.contains('screen-mode') && !!document.getElementById('scr-stage')")
    r["entered_ok"] = page.evaluate("window.P9_SCREEN.entered === true")
    op = page.evaluate("Array.from(document.querySelectorAll('#scr-stage .sp')).map(e => +getComputedStyle(e).opacity)")
    r["panels_visible_ok"] = len(op) == 9 and all(o > 0.99 for o in op)
    r["panels_visible_detail"] = op
    kpis = page.evaluate("Array.from(document.querySelectorAll('#sp-kpi .v')).map(e => e.childNodes[0].textContent)")
    r["kpi_final_ok"] = kpis[:2] == ["486", "34,162"]
    r["kpi_final_detail"] = kpis
    fit = page.evaluate("(() => { const b = document.getElementById('scr-stage').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom, innerWidth, innerHeight]; })()")
    r["fits_window_ok"] = fit[0] >= -1 and fit[1] >= -1 and fit[2] <= fit[4] + 1 and fit[3] <= fit[5] + 1
    r["fits_window_detail"] = fit
    ov = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    r["no_overflow_ok"] = ov[0] <= ov[1]
    if shots:
        page.screenshot(path=str(shots / f"20_screen_full_{size}.png"))
    big = size == "1920x1080"
    # 轮播前进
    i0 = page.evaluate("window.P9_SCREEN.idx")
    page.wait_for_timeout(5600)
    i1 = page.evaluate("window.P9_SCREEN.idx")
    r["carousel_advances_ok"] = i1 != i0
    r["carousel_advances_detail"] = [i0, i1]
    # 打码：逐张切换所有卡片，大屏 DOM（HTML 源码，不只是可见文字）里不得出现任何完整姓名
    n_cards = page.evaluate("window.P9_DATA.screen.carousel.length")
    leaks = set()
    for i in range(n_cards):
        page.evaluate(f"window.P9_SCREEN.show({i})")
        html = page.evaluate("document.getElementById('view').innerHTML")
        leaks |= {n for n in names if n in html}
    r["no_full_names_ok"] = not leaks
    r["no_full_names_detail"] = sorted(leaks)[:5]
    txt = page.evaluate("document.getElementById('sp-car').innerText")
    r["no_psych_in_carousel_ok"] = not any(w in txt for w in ("心理", "抑郁", "焦虑", "建议关注"))
    # 悬停暂停
    page.hover("#sp-car")
    j0 = page.evaluate("window.P9_SCREEN.idx")
    page.wait_for_timeout(5800)
    r["hover_pauses_ok"] = page.evaluate("window.P9_SCREEN.idx") == j0
    if shots and big:
        page.locator("#sp-car").screenshot(path=str(shots / "20_carousel_card.png"))
        page.locator("#sp-priv").screenshot(path=str(shots / "20_privacy_panel.png"))
    # 授权查看
    page.click("#car-auth")
    page.wait_for_timeout(300)
    if shots and big:
        page.screenshot(path=str(shots / "20_authorize_dialog_before.png"))
    page.click("#auth-ok")
    page.wait_for_timeout(1400)
    if shots and big:
        page.screenshot(path=str(shots / "20_authorize_dialog.png"))
    audit = page.evaluate("document.getElementById('pv-audit').innerText")
    r["audit_logged_ok"] = "的学业档案 · 已记录" in audit.split(chr(10))[0]
    r["audit_logged_detail"] = audit.split(chr(10))[0]
    html = page.evaluate("document.getElementById('view').innerHTML")
    r["still_masked_after_auth_ok"] = not any(n in html for n in names)
    page.click("#auth-cancel")
    page.mouse.move(5, 5)
    # 静态模式：切换后重新渲染，不报错
    page.keyboard.press("s")
    page.wait_for_timeout(500)
    r["static_mode_ok"] = page.evaluate("document.body.classList.contains('static') && window.P9_SCREEN.entered === true")
    page.keyboard.press("s")
    page.wait_for_timeout(300)
    r["errors"] = errors[n0:]
    r["no_js_errors_ok"] = not errors[n0:]
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots")
    ap.add_argument("--sizes", default="1920x1080,1366x768")
    ap.add_argument("--browser", default="msedge")
    args = ap.parse_args()
    from playwright.sync_api import sync_playwright

    data = json.loads((ROOT / "app" / "data.js").read_text(encoding="utf-8").split("=", 1)[1].rstrip().rstrip(";"))
    names = [s["name"] for s in data["focal"]["students"]]
    child = "张小明"
    sid = data["focal"]["students"][0]["sid"]
    url0 = APP.resolve().as_uri() + "?nohelp"
    report = {"browser": args.browser, "pages": [], "failures": []}
    shots = Path(args.shots) if args.shots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        br = p.chromium.launch(channel=args.browser, headless=True)
        for size in args.sizes.split(","):
            w, hgt = map(int, size.split("x"))
            ctx = br.new_context(viewport={"width": w, "height": hgt}, device_scale_factor=1)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
            page.goto(url0 + "#/cockpit")
            page.wait_for_timeout(600)
            for r in ROUTES:
                route = r.format(sid=sid)
                n0 = len(errors)
                page.evaluate(f"location.hash = '#/{route}'")
                page.wait_for_timeout(1400 if ("cat" in route or "methods/mm" in route) else 1100)
                ov = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
                rec = {"size": size, "route": route, "errors": errors[n0:], "scrollWidth": ov[0], "clientWidth": ov[1],
                       "overflow_x": ov[0] > ov[1]}
                txt = page_text(page)
                if route.startswith("reports/"):
                    role = route.split("/")[1]
                    others = [n for n in names if n != child and n in txt]
                    if role == "bureau":
                        rec["psych_words"] = [w_ for w_ in PSYCH_WORDS if w_ in txt.split("这个视图能看到什么")[0]]
                        rec["names_found"] = [n for n in names if n in txt]
                        if rec["psych_words"] or rec["names_found"]:
                            report["failures"].append(f"{size} {route}: 教育局视图出现 {rec['psych_words']} {rec['names_found']}")
                    if role == "leader":
                        rec["names_found"] = [n for n in names if n in txt]
                        if rec["names_found"]:
                            report["failures"].append(f"{size} {route}: 学校领导视图出现学生姓名 {rec['names_found'][:3]}")
                    if role in ("parent", "student"):
                        rep = txt.split("这个视图能看到什么")[0]
                        rec["other_names"] = [n for n in names if n != child and n in rep]
                        rec["psych_flag_shown"] = "建议关注" in rep
                        if rec["other_names"] or rec["psych_flag_shown"]:
                            report["failures"].append(f"{size} {route}: 出现其他学生 {rec['other_names'][:3]} 或心理标记")
                if rec["errors"]:
                    report["failures"].append(f"{size} {route}: JS 报错 {rec['errors'][:2]}")
                if rec["overflow_x"]:
                    report["failures"].append(f"{size} {route}: 横向溢出 {ov}")
                if shots and r in SHOTS and size == "1920x1080":
                    page.screenshot(path=str(shots / f"{SHOTS[r]}_{size}.png"), full_page=False)
                if shots and r in ("cockpit", "student", "reports/parent") and size == "1366x768":
                    page.screenshot(path=str(shots / f"{SHOTS[r]}_{size}.png"), full_page=False)
                report["pages"].append(rec)
            # 数据大屏：入场、轮播、打码、悬停暂停、授权查看
            report.setdefault("screen", {})[size] = rec_s = screen_checks(page, url0, names, shots, size, errors)
            for k, v in rec_s.items():
                if k.endswith("_ok") and not v:
                    report["failures"].append(f"{size} 大屏检查失败：{k} {rec_s.get(k.replace('_ok', '_detail'), '')}")
            # 交互：导出报告、投影比例、帮助、CAT 手动作答、退出
            n0 = len(errors)
            page.evaluate("location.hash = '#/reports/teacher'")
            page.wait_for_timeout(400)
            page.click("#export-btn")
            page.wait_for_timeout(300)
            modal_ok = page.evaluate("document.getElementById('report-modal').classList.contains('show') && document.querySelector('#report-body .paper') !== null")
            if shots and size == "1920x1080":
                page.screenshot(path=str(shots / f"13_export_report_{size}.png"))
            page.keyboard.press("Escape")
            page.keyboard.press("b")
            big_ok = page.evaluate("document.body.classList.contains('big')")
            page.keyboard.press("b")
            page.keyboard.press("h")
            help_ok = page.evaluate("document.getElementById('help-modal').classList.contains('show')")
            page.keyboard.press("Escape")
            page.evaluate(f"location.hash = '#/student/{sid}/cat'")
            page.wait_for_timeout(400)
            page.click("[data-preset=manual]")
            for _ in range(10):
                page.click("[data-ans='1']")
            cat_ok = page.evaluate("document.querySelectorAll('.cat-items .r1').length") == 10
            report["interactions"] = report.get("interactions", {})
            report["interactions"][size] = {"export_modal": modal_ok, "big_mode": big_ok, "help": help_ok, "cat_manual_10": cat_ok,
                                            "errors": errors[n0:]}
            for k, v in report["interactions"][size].items():
                if k != "errors" and not v:
                    report["failures"].append(f"{size} 交互失败：{k}")
            if errors[n0:]:
                report["failures"].append(f"{size} 交互时 JS 报错 {errors[n0:][:2]}")
            ctx.close()
        # 退出按钮（单独一页）
        ctx = br.new_context(viewport={"width": 1366, "height": 768})
        page = ctx.new_page()
        page.goto(url0 + "#/methods/mm_gaze")
        page.wait_for_timeout(500)
        page.click("#exit-btn")
        page.wait_for_timeout(300)
        report["exit_ok"] = page.evaluate("document.getElementById('ended').classList.contains('show') && window.P9_DATA === null")
        if not report["exit_ok"]:
            report["failures"].append("退出按钮没有显示结束页")
        ctx.close()
        br.close()
    report["n_pages"] = len(report["pages"])
    report["n_js_errors"] = sum(len(p["errors"]) for p in report["pages"])
    report["n_overflow"] = sum(1 for p in report["pages"] if p["overflow_x"])
    print(json.dumps({k: v for k, v in report.items() if k != "pages"}, ensure_ascii=False, indent=1))
    if shots:
        (shots / "browser_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
