"""浏览器验收（本机 Edge 无头）与 JS/Python 的 CAT 结果对比。没有 Edge 或 playwright 时跳过。"""
import json
import os
import subprocess
import sys

import numpy as np
import pytest

from p9 import config as C, irt_cat

pw = pytest.importorskip("playwright.sync_api")


def _launch(p):
    try:
        return p.chromium.launch(channel="msedge", headless=True)
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"本机 Edge 不可用：{e}")


def test_browser_check_all_views(tmp_path):
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    r = subprocess.run([sys.executable, str(C.ROOT / "tools" / "browser_check.py"), "--shots", str(tmp_path)],
                       capture_output=True, text=True, encoding="utf-8", env=env, timeout=600)
    rep = json.loads((tmp_path / "browser_report.json").read_text(encoding="utf-8"))
    assert r.returncode == 0, rep["failures"]
    assert rep["n_js_errors"] == 0 and rep["n_overflow"] == 0
    roles = {p["route"] for p in rep["pages"] if p["route"].startswith("reports/")}
    assert roles == {f"reports/{x}" for x in ("student", "teacher", "parent", "leader", "bureau")}


def test_cat_js_matches_python(app_data):
    a = np.array(app_data["models"]["irt"]["a"])
    b = np.array(app_data["models"]["irt"]["b"])
    patterns = [[1] * 10, [0] * 10, [1, 0, 1, 1, 0, 0, 1, 0, 1, 1], [0, 0, 1, 0, 1, 1, 1, 0, 0, 1]]
    with pw.sync_playwright() as p:
        br = _launch(p)
        page = br.new_page()
        page.goto((C.APP_DIR / "index.html").resolve().as_uri() + "?nohelp#/student")
        page.wait_for_timeout(500)
        for pat in patterns:
            js = page.evaluate("(r) => window.P9_CAT.replay(r, window.P9_DATA.models.irt.a, window.P9_DATA.models.irt.b)", pat)
            it = iter(pat)
            py = irt_cat.run_cat(0.0, a, b, 10, responder=lambda j: next(it))
            for s_js, s_py in zip(js, py):
                assert s_js["item"] == s_py["item"]
                assert s_js["eap"] == pytest.approx(s_py["eap"], abs=1e-4)
                assert s_js["psd"] == pytest.approx(s_py["psd"], abs=1e-4)
        br.close()
