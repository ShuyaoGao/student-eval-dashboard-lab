"""认知诊断：DINA 模型的边际极大似然 EM（饱和的属性模式先验）。

DINA：eta_ij = 1 当且仅当学生 i 掌握了题目 j 需要的全部属性（Q 矩阵）；
P(X_ij = 1) = (1 - s_j)^eta_ij * g_j^(1 - eta_ij)。
参考：Junker & Sijtsma 2001（Applied Psychological Measurement）；de la Torre 2009（JEBS，EM 推导）。
"""
from __future__ import annotations

import itertools

import numpy as np


def all_patterns(K: int) -> np.ndarray:
    return np.array(list(itertools.product([0, 1], repeat=K)), int)  # 2^K × K


def eta_matrix(patterns: np.ndarray, Q: np.ndarray) -> np.ndarray:
    """L×J：模式 l 是否掌握题 j 所需的全部属性。"""
    return (patterns @ Q.T == Q.sum(1)[None, :]).astype(float)


def dina_fit(X: np.ndarray, Q: np.ndarray, iters: int = 300, tol: float = 1e-7, init_sg=(0.2, 0.2)):
    """X：N×J 的 0/1 作答（可含 NaN 表示未作答）。返回 dict(slip, guess, prior, posterior(N×L), ll)。"""
    N, J = X.shape
    K = Q.shape[1]
    pats = all_patterns(K)
    E = eta_matrix(pats, Q)  # L×J
    L = len(pats)
    obs = ~np.isnan(X)
    Xf = np.nan_to_num(X)
    s = np.full(J, init_sg[0])
    g = np.full(J, init_sg[1])
    prior = np.full(L, 1 / L)
    ll_prev = -np.inf
    for it in range(iters):
        p = E * (1 - s)[None, :] + (1 - E) * g[None, :]  # L×J：各模式答对概率
        lp = np.log(np.clip(p, 1e-10, 1))
        lq = np.log(np.clip(1 - p, 1e-10, 1))
        loglik = (Xf * obs) @ lp.T + ((1 - Xf) * obs) @ lq.T  # N×L
        lj = loglik + np.log(prior)[None, :]
        mx = lj.max(1, keepdims=True)
        w = np.exp(lj - mx)
        tot = w.sum(1, keepdims=True)
        post = w / tot
        ll = float((np.log(tot) + mx).sum())
        # M 步
        prior = post.mean(0) + 1e-12
        prior /= prior.sum()
        R1 = post @ E  # N×J：后验中“应该会”的权重
        n1 = (R1 * obs).sum(0)
        n0 = ((1 - R1) * obs).sum(0)
        c1 = (R1 * obs * Xf).sum(0)
        c0 = ((1 - R1) * obs * Xf).sum(0)
        s = np.clip(1 - c1 / np.maximum(n1, 1e-9), 1e-3, 0.5)
        g = np.clip(c0 / np.maximum(n0, 1e-9), 1e-3, 0.5)
        if abs(ll - ll_prev) < tol * abs(ll):
            break
        ll_prev = ll
    attr_post = post @ pats  # N×K：各属性掌握的边际后验
    return {"slip": s, "guess": g, "prior": prior, "posterior": post, "attr_posterior": attr_post,
            "patterns": pats, "loglik": ll, "iterations": it + 1}


def make_q_matrix(K: int, J: int, rng: np.random.Generator) -> np.ndarray:
    """可识别的 Q 矩阵：先放 K 道单属性题（保证每个属性都有“纯”题），再放两属性、三属性题。"""
    rows = [np.eye(K, dtype=int)[k] for k in range(K)]
    pairs = list(itertools.combinations(range(K), 2))
    rng.shuffle(pairs)
    i = 0
    while len(rows) < J:
        q = np.zeros(K, int)
        if len(rows) < 2 * K:
            q[len(rows) - K] = 1  # 第二轮单属性题，每个属性两道
        elif len(rows) < J - 3:
            a, b = pairs[i % len(pairs)]
            q[[a, b]] = 1
            i += 1
        else:
            q[rng.choice(K, 3, replace=False)] = 1
        rows.append(q)
    return np.array(rows)
