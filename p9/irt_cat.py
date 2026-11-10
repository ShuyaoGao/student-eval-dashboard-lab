"""IRT 两参数模型（2PL）的题库标定（Bock–Aitkin 边际极大似然 EM）与计算机化自适应测验（CAT）。

- 标定：41 个求积点，M 步对每道题做牛顿法（斜率-截距参数化）。
- 能力估计：EAP，先验 N(0,1)，81 点网格；后验标准差给出 95% 区间（EAP ± 1.96·PSD）。
- 选题：在当前 EAP 处 Fisher 信息量最大的未用题目。
浏览器端 app.js 里的 CAT 用同样的网格与公式，tests/test_browser.py 会比对两边的结果。
"""
from __future__ import annotations

import numpy as np

GRID = np.linspace(-4, 4, 81)
PRIOR = np.exp(-0.5 * GRID ** 2)
PRIOR /= PRIOR.sum()


def p2pl(theta, a, b):
    return 1 / (1 + np.exp(-a * (np.asarray(theta)[..., None] - b)))


def calibrate(X: np.ndarray, iters: int = 80, n_quad: int = 41, tol: float = 1e-5):
    """X：N×J，0/1/NaN。返回 (a, b, 迭代信息)。"""
    N, J = X.shape
    nodes = np.linspace(-4, 4, n_quad)
    w = np.exp(-0.5 * nodes ** 2)
    w /= w.sum()
    obs = ~np.isnan(X)
    Xf = np.nan_to_num(X)
    a = np.ones(J)
    d = np.zeros(J)  # logit = a*theta + d
    # 用正确率初始化截距
    pc = np.clip((Xf * obs).sum(0) / np.maximum(obs.sum(0), 1), 0.02, 0.98)
    d = np.log(pc / (1 - pc))
    prev = None
    for it in range(iters):
        P = 1 / (1 + np.exp(-(nodes[:, None] * a[None, :] + d[None, :])))  # Q×J
        lp, lq = np.log(P), np.log(1 - P)
        ll = (Xf * obs) @ lp.T + ((1 - Xf) * obs) @ lq.T  # N×Q
        ll += np.log(w)[None, :]
        mx = ll.max(1, keepdims=True)
        post = np.exp(ll - mx)
        post /= post.sum(1, keepdims=True)
        n_q = post.T @ obs.astype(float)  # Q×J
        r_q = post.T @ (Xf * obs)  # Q×J
        for j in range(J):
            aj, dj = a[j], d[j]
            for _ in range(5):
                z = nodes * aj + dj
                p = 1 / (1 + np.exp(-z))
                res = r_q[:, j] - n_q[:, j] * p
                W = n_q[:, j] * p * (1 - p)
                g = np.array([(res * nodes).sum(), res.sum()])
                g[0] -= (np.log(aj) - 0.0) / (0.5 ** 2) / aj  # log a ~ N(0, 0.5²) 的弱先验，防止斜率发散
                H = np.array([[(W * nodes ** 2).sum() + 1 / (0.5 ** 2) / aj ** 2, (W * nodes).sum()],
                              [(W * nodes).sum(), W.sum() + 1e-6]])
                step = np.linalg.solve(H, g)
                aj = float(np.clip(aj + step[0], 0.2, 3.0))
                dj = float(np.clip(dj + step[1], -8, 8))
            a[j], d[j] = aj, dj
        cur = np.concatenate([a, d])
        if prev is not None and np.max(np.abs(cur - prev)) < tol:
            break
        prev = cur
    b = -d / a
    return a, b, {"iterations": it + 1, "n_quad": n_quad}


def eap(resp_items: list[int], resp: list[int], a, b):
    like = np.ones_like(GRID)
    for j, x in zip(resp_items, resp):
        p = 1 / (1 + np.exp(-a[j] * (GRID - b[j])))
        like *= p if x == 1 else (1 - p)
    post = like * PRIOR
    post /= post.sum()
    m = float((post * GRID).sum())
    sd = float(np.sqrt((post * (GRID - m) ** 2).sum()))
    return m, sd


def info(theta: float, a, b):
    p = 1 / (1 + np.exp(-a * (theta - b)))
    return a ** 2 * p * (1 - p)


def run_cat(true_theta: float, a, b, n_items: int = 10, rng=None, responder=None, mode: str = "maxinfo"):
    """模拟一次 CAT。responder(j) -> 0/1 可替换（浏览器里由用户作答）；默认按真实能力随机作答。"""
    rng = rng or np.random.default_rng(0)
    used: list[int] = []
    resp: list[int] = []
    est, sd = 0.0, 1.0
    trace = []
    pool = np.arange(len(a))
    for step in range(n_items):
        avail = np.setdiff1d(pool, used)
        if mode == "maxinfo":
            j = int(avail[np.argmax(info(est, a[avail], b[avail]))])
        else:
            j = int(rng.choice(avail))
        if responder is None:
            p = 1 / (1 + np.exp(-a[j] * (true_theta - b[j])))
            x = int(rng.random() < p)
        else:
            x = int(responder(j))
        used.append(j)
        resp.append(x)
        est, sd = eap(used, resp, a, b)
        trace.append({"step": step + 1, "item": j, "a": round(float(a[j]), 3), "b": round(float(b[j]), 3),
                      "x": x, "eap": round(est, 4), "psd": round(sd, 4),
                      "info": round(float(info(est, a[j], b[j])), 4)})
    return trace


def simulate_cat_study(a, b, n_sim: int = 1000, n_items: int = 10, seed: int = 0) -> dict:
    """在 N(0,1) 的模拟考生上比较“最大信息选题”与“随机抽 10 题”。"""
    rng = np.random.default_rng(seed)
    thetas = rng.normal(0, 1, n_sim)
    out = {}
    for mode in ("maxinfo", "random"):
        err = np.zeros((n_sim, n_items))
        psd = np.zeros((n_sim, n_items))
        cover = np.zeros(n_sim)
        r = np.random.default_rng(seed + (1 if mode == "random" else 2))
        for i, th in enumerate(thetas):
            tr = run_cat(th, a, b, n_items, rng=r, mode=mode)
            err[i] = [t["eap"] - th for t in tr]
            psd[i] = [t["psd"] for t in tr]
            cover[i] = abs(tr[-1]["eap"] - th) <= 1.96 * tr[-1]["psd"]
        out[mode] = {"rmse_by_step": [round(float(v), 4) for v in np.sqrt((err ** 2).mean(0))],
                     "mean_psd_by_step": [round(float(v), 4) for v in psd.mean(0)],
                     "bias_final": round(float(err[:, -1].mean()), 4),
                     "coverage95_final": round(float(cover.mean()), 4),
                     "corr_final": round(float(np.corrcoef(thetas, err[:, -1] + thetas)[0, 1]), 4)}
    out["n_sim"] = n_sim
    out["n_items"] = n_items
    return out
