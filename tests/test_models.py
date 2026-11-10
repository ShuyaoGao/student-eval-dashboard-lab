"""模型实现的正确性：在已知参数的小模拟上检查能否回推，DKT 的梯度用有限差分核对。"""
import numpy as np
import pytest

from p9 import cdm, irt_cat, kt


def _bkt_sim(rng, n, T, p):
    L0, Tr, G, S = p
    seqs = []
    for _ in range(n):
        st = rng.random() < L0
        obs = []
        for _ in range(T):
            obs.append(int(rng.random() < ((1 - S) if st else G)))
            if not st and rng.random() < Tr:
                st = True
        seqs.append(np.array(obs, float))
    return seqs


def test_bkt_em_recovers_parameters():
    rng = np.random.default_rng(0)
    true = (0.3, 0.12, 0.2, 0.1)
    p, ll = kt.bkt_fit(_bkt_sim(rng, 600, 25, true), iters=200)
    assert np.allclose(p, true, atol=0.04), p
    assert all(b >= a - 1e-6 for a, b in zip(ll, ll[1:])), "EM 的对数似然应单调不减"


def test_bkt_trace_prediction_in_range():
    params = np.array([[0.3, 0.1, 0.2, 0.1], [0.5, 0.2, 0.25, 0.05]])
    pred, mast = kt.bkt_trace(np.array([0, 1, 0, 0]), np.array([1, 0, 1, 1]), params)
    assert ((pred > 0) & (pred < 1)).all()
    assert mast.shape == (4, 2)
    assert mast[-1, 0] > params[0, 0]  # 连续答对后掌握概率上升


def test_dkt_gradient_matches_finite_difference():
    rng = np.random.default_rng(1)
    K = 3
    m = kt.DKTLite(K, H=5, seed=2)
    seqs = [(rng.integers(0, K, 7), rng.integers(0, 2, 7)) for _ in range(4)]
    _, g = m.loss_and_grad(seqs)
    eps = 1e-6
    for name in ("Wx", "Wh", "bh", "Wo", "bo"):
        P = m.params[name]
        for idx in [tuple(rng.integers(0, s) for s in P.shape) for _ in range(4)]:
            old = P[idx]
            P[idx] = old + eps
            lp, _ = m.loss_and_grad(seqs)
            P[idx] = old - eps
            lm, _ = m.loss_and_grad(seqs)
            P[idx] = old
            num = (lp - lm) / (2 * eps)
            assert abs(num - g[name][idx]) < 1e-5 + 1e-3 * abs(num), (name, idx, num, g[name][idx])


def test_dina_recovers_attributes():
    rng = np.random.default_rng(3)
    K, J, N = 4, 20, 800
    Q = cdm.make_q_matrix(K, J, rng)
    A = (rng.random((N, K)) < 0.55).astype(int)
    s = rng.uniform(0.05, 0.15, J)
    g = rng.uniform(0.05, 0.2, J)
    eta = (A @ Q.T == Q.sum(1)).astype(int)
    X = (rng.random((N, J)) < np.where(eta == 1, 1 - s, g)).astype(float)
    fit = cdm.dina_fit(X, Q)
    acc = ((fit["attr_posterior"] > 0.5) == A).mean()
    assert acc > 0.9, acc
    assert np.sqrt(((fit["slip"] - s) ** 2).mean()) < 0.05


def test_q_matrix_has_pure_items():
    Q = cdm.make_q_matrix(6, 24, np.random.default_rng(0))
    assert Q.shape == (24, 6)
    for k in range(6):
        assert any((Q[j].sum() == 1 and Q[j, k] == 1) for j in range(24)), "每个属性至少一道单属性题（可识别性）"


def test_irt_calibration_and_cat():
    rng = np.random.default_rng(4)
    J, N = 60, 1500
    a = np.clip(np.exp(rng.normal(0.1, 0.3, J)), 0.5, 2.5)
    b = rng.normal(0, 1, J)
    th = rng.normal(0, 1, N)
    X = (rng.random((N, J)) < 1 / (1 + np.exp(-a * (th[:, None] - b)))).astype(float)
    X[rng.random((N, J)) < 0.5] = np.nan
    ah, bh, _ = irt_cat.calibrate(X)
    assert np.corrcoef(bh, b)[0, 1] > 0.97
    assert np.corrcoef(ah, a)[0, 1] > 0.8
    st = irt_cat.simulate_cat_study(a, b, n_sim=200, n_items=10, seed=1)
    r = st["maxinfo"]["rmse_by_step"]
    assert r[-1] < r[0]
    assert st["maxinfo"]["rmse_by_step"][-1] < st["random"]["rmse_by_step"][-1]


def test_eap_prior_only():
    m, sd = irt_cat.eap([], [], np.ones(3), np.zeros(3))
    assert abs(m) < 1e-9 and sd == pytest.approx(1.0, abs=0.01)
