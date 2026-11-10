import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="session")
def app_data():
    p = ROOT / "app" / "data.js"
    if not p.exists():
        pytest.skip("app/data.js 不存在，先运行 python -m p9 build")
    txt = p.read_text(encoding="utf-8")
    return json.loads(txt.split("window.P9_DATA = ", 1)[1].rstrip().rstrip(";"))


@pytest.fixture(scope="session")
def result():
    from p9 import config as C
    return json.loads((C.RESULTS_DIR / C.RUN_ID / "result.json").read_text(encoding="utf-8"))
