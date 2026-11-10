"""知识追踪：BKT（EM 拟合）、PFA（逻辑回归）、DKT-lite（numpy 实现的小型循环神经网络）。

数据格式：seqs = [(kc: int[], correct: int[]) ...]，每个学生一条按时间排序的作答序列。
评价口径：对每一次作答，用它之前的历史预测“这一题答对的概率”，在留出学生上算 AUC。

参考：
- BKT：Corbett & Anderson, User Modeling and User-Adapted Interaction（Crossref 记录 1995）
- PFA：Pavlik, Cen & Koedinger, AIED 2009
- DKT：Piech et al., NeurIPS 2015（本实现是单层 tanh RNN 的小型化版本，不是原论文的 LSTM）
"""
from __future__ import annotations

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

# ----------------------------------------------------------------------------- BKT


def _bkt_forward_backward(obs: np.ndarray, p):
    """单条序列（同一知识点）的前向-后向。状态 0=未掌握，1=已掌握，无遗忘。"""
    L0, T, G, S = p
    n = len(obs)
    A = np.array([[1 - T, T], [0.0, 1.0]])
    B = np.where(obs[:, None] == 1, np.array([G, 1 - S])[None, :], np.array([1 - G, S])[None, :])  # n×2
    alpha = np.zeros((n, 2))
    c = np.zeros(n)
    a = np.array([1 - L0, L0]) * B[0]
    c[0] = a.sum()
    alpha[0] = a / c[0]
    for t in range(1, n):
        a = (alpha[t - 1] @ A) * B[t]
        c[t] = a.sum()
        alpha[t] = a / c[t]
    beta = np.ones((n, 2))
    for t in range(n - 2, -1, -1):
        beta[t] = (A @ (B[t + 1] * beta[t + 1])) / c[t + 1]
    gamma = alpha * beta
    gamma /= gamma.sum(1, keepdims=True)
    xi01 = np.zeros(n - 1)
    xi00 = np.zeros(n - 1)
    for t in range(n - 1):
        m = alpha[t][:, None] * A * (B[t + 1] * beta[t + 1])[None, :] / c[t + 1]
        xi00[t], xi01[t] = m[0, 0], m[0, 1]
    return gamma, xi00, xi01, np.log(c).sum()


def bkt_fit(seqs_kc: list[np.ndarray], iters: int = 60, init=(0.4, 0.15, 0.2, 0.1), max_gs: float = 0.4):
    """一个知识点上的 EM。seqs_kc：每个学生在该知识点上的 0/1 序列。返回 (参数, 对数似然轨迹)。"""
    p = np.array(init, float)
    ll_hist = []
    for _ in range(iters):
        n_L0 = n_seq = 0.0
        t_num = t_den = g_num = g_den = s_num = s_den = 0.0
        ll = 0.0
        for obs in seqs_kc:
            if len(obs) == 0:
                continue
            gamma, xi00, xi01, l = _bkt_forward_backward(obs, p)
            ll += l
            n_L0 += gamma[0, 1]
            n_seq += 1
            t_num += xi01.sum()
            t_den += (xi00 + xi01).sum()
            g_num += (gamma[:, 0] * obs).sum()
            g_den += gamma[:, 0].sum()
            s_num += (gamma[:, 1] * (1 - obs)).sum()
            s_den += gamma[:, 1].sum()
        p = np.array([n_L0 / max(n_seq, 1e-9), t_num / max(t_den, 1e-9),
                      min(g_num / max(g_den, 1e-9), max_gs), min(s_num / max(s_den, 1e-9), max_gs)])
        p = np.clip(p, 1e-4, 1 - 1e-4)
        ll_hist.append(ll)
        if len(ll_hist) > 2 and abs(ll_hist[-1] - ll_hist[-2]) < 1e-6:
            break
    return p, ll_hist


def bkt_trace(kcs: np.ndarray, obs: np.ndarray, params: np.ndarray):
    """按时间走一遍学生的全部作答。返回：
    pred[t]  作答 t 之前预测答对的概率；
    mastery[t, k]  作答 t 之后各知识点“已掌握”的后验概率（含本次学习机会的转移）。"""
    K = len(params)
    pL = params[:, 0].copy()
    pred = np.zeros(len(obs))
    mastery = np.zeros((len(obs), K))
    for t, (k, o) in enumerate(zip(kcs, obs)):
        L0, T, G, S = params[k]
        pc = pL[k] * (1 - S) + (1 - pL[k]) * G
        pred[t] = pc
        post = pL[k] * (1 - S) / pc if o == 1 else pL[k] * S / (1 - pc)
        pL[k] = post + (1 - post) * T
        mastery[t] = pL
    return pred, mastery


def bkt_train(seqs, K: int, **kw) -> np.ndarray:
    params = np.zeros((K, 4))
    for k in range(K):
        per = [o[kc == k].astype(float) for kc, o in seqs]
        params[k], _ = bkt_fit(per, **kw)
    return params


# ----------------------------------------------------------------------------- PFA


def pfa_features(kcs: np.ndarray, obs: np.ndarray, K: int) -> np.ndarray:
    """每次作答的特征：知识点截距（K）+ 该知识点此前答对次数（K）+ 此前答错次数（K）。"""
    X = np.zeros((len(obs), 3 * K))
    s = np.zeros(K)
    f = np.zeros(K)
    for t, (k, o) in enumerate(zip(kcs, obs)):
        X[t, k] = 1
        X[t, K + k] = s[k]
        X[t, 2 * K + k] = f[k]
        if o:
            s[k] += 1
        else:
            f[k] += 1
    return X


def pfa_train(seqs, K: int) -> LogisticRegression:
    X = np.vstack([pfa_features(kc, o, K) for kc, o in seqs])
    y = np.concatenate([o for _, o in seqs])
    m = LogisticRegression(C=10.0, max_iter=2000, fit_intercept=False)
    m.fit(X, y)
    return m


# ----------------------------------------------------------------------------- DKT-lite


class DKTLite:
    """单层 tanh RNN：输入 one-hot(知识点×对错，2K 维) → 隐藏 H → 输出 K 个 sigmoid（下一题各知识点答对概率）。"""

    def __init__(self, K: int, H: int = 32, seed: int = 0):
        rng = np.random.default_rng(seed)
        self.K, self.H = K, H
        s = 1 / np.sqrt(H)
        self.params = {
            "Wx": rng.normal(0, 0.3, (2 * K, H)), "Wh": rng.normal(0, s, (H, H)) * 0.5, "bh": np.zeros(H),
            "Wo": rng.normal(0, s, (H, K)), "bo": np.zeros(K),
        }

    def n_params(self) -> int:
        return int(sum(v.size for v in self.params.values()))

    @staticmethod
    def _batch(seqs, K):
        B = len(seqs)
        Tm = max(len(o) for _, o in seqs)
        X = np.zeros((B, Tm, 2 * K))
        kc = np.zeros((B, Tm), int)
        y = np.zeros((B, Tm))
        m = np.zeros((B, Tm))
        for i, (k, o) in enumerate(seqs):
            n = len(o)
            X[i, np.arange(n), k + K * o] = 1
            kc[i, :n] = k
            y[i, :n] = o
            m[i, :n] = 1
        return X, kc, y, m

    def forward(self, X):
        P = self.params
        B, Tm, _ = X.shape
        h = np.zeros((B, Tm, self.H))
        hp = np.zeros((B, self.H))
        for t in range(Tm):
            hp = np.tanh(X[:, t] @ P["Wx"] + hp @ P["Wh"] + P["bh"])
            h[:, t] = hp
        z = h @ P["Wo"] + P["bo"]
        return h, 1 / (1 + np.exp(-z))

    def loss_and_grad(self, seqs):
        P = self.params
        K = self.K
        X, kc, y, m = self._batch(seqs, K)
        B, Tm, _ = X.shape
        h, out = self.forward(X)
        # 第 t 步的输出预测第 t+1 步的作答
        tgt_k, tgt_y, tgt_m = kc[:, 1:], y[:, 1:], m[:, 1:]
        sel = np.take_along_axis(out[:, :-1], tgt_k[..., None], 2)[..., 0]
        sel = np.clip(sel, 1e-7, 1 - 1e-7)
        nv = tgt_m.sum()
        loss = -(tgt_m * (tgt_y * np.log(sel) + (1 - tgt_y) * np.log(1 - sel))).sum() / nv
        dz = np.zeros_like(out)
        g = (sel - tgt_y) * tgt_m / nv
        np.put_along_axis(dz[:, :-1], tgt_k[..., None], g[..., None], 2)
        grads = {k: np.zeros_like(v) for k, v in P.items()}
        grads["Wo"] = np.einsum("bth,btk->hk", h, dz)
        grads["bo"] = dz.sum((0, 1))
        dh_next = np.zeros((B, self.H))
        for t in range(Tm - 1, -1, -1):
            dh = dz[:, t] @ P["Wo"].T + dh_next
            da = dh * (1 - h[:, t] ** 2)
            hprev = h[:, t - 1] if t > 0 else np.zeros((B, self.H))
            grads["Wx"] += X[:, t].T @ da
            grads["Wh"] += hprev.T @ da
            grads["bh"] += da.sum(0)
            dh_next = da @ P["Wh"].T
        return loss, grads

    def fit(self, seqs, epochs: int = 30, batch: int = 32, lr: float = 0.01, seed: int = 0, clip: float = 5.0,
            val=None, log=None):
        rng = np.random.default_rng(seed)
        mom = {k: np.zeros_like(v) for k, v in self.params.items()}
        vel = {k: np.zeros_like(v) for k, v in self.params.items()}
        b1, b2, step = 0.9, 0.999, 0
        hist = []
        for ep in range(epochs):
            idx = rng.permutation(len(seqs))
            tot = 0.0
            for s in range(0, len(idx), batch):
                part = [seqs[i] for i in idx[s:s + batch]]
                loss, g = self.loss_and_grad(part)
                tot += loss * len(part)
                norm = np.sqrt(sum((v ** 2).sum() for v in g.values()))
                if norm > clip:
                    g = {k: v * clip / norm for k, v in g.items()}
                step += 1
                for k in self.params:
                    mom[k] = b1 * mom[k] + (1 - b1) * g[k]
                    vel[k] = b2 * vel[k] + (1 - b2) * g[k] ** 2
                    mh = mom[k] / (1 - b1 ** step)
                    vh = vel[k] / (1 - b2 ** step)
                    self.params[k] -= lr * mh / (np.sqrt(vh) + 1e-8)
            rec = {"epoch": ep + 1, "train_loss": round(tot / len(seqs), 5)}
            if val is not None:
                p, yv = self.predict_flat(val)
                rec["val_auc"] = round(float(roc_auc_score(yv, p)), 4)
            hist.append(rec)
            if log:
                log(rec)
        return hist

    def predict_seq(self, kcs, obs):
        """返回 pred[t]（作答 t 之前的预测；t=0 用全零隐藏状态的输出）与 probs[t, k]（作答 t 之后对各知识点的预测）。"""
        X, _, _, _ = self._batch([(kcs, obs)], self.K)
        _, out = self.forward(X)
        out = out[0]
        h0 = 1 / (1 + np.exp(-self.params["bo"]))  # 还没有任何作答时隐藏状态为 0（评价时不计第一题）
        pred = np.empty(len(obs))
        pred[0] = h0[kcs[0]]
        pred[1:] = out[np.arange(len(obs) - 1), kcs[1:]]
        return pred, out

    def predict_flat(self, seqs):
        ps, ys = [], []
        for k, o in seqs:
            p, _ = self.predict_seq(k, o)
            ps.append(p)
            ys.append(o)
        return np.concatenate(ps), np.concatenate(ys)


# ----------------------------------------------------------------------------- 评价


def auc_with_ci(groups_pred: list[np.ndarray], groups_y: list[np.ndarray], B: int = 300, seed: int = 0) -> dict:
    """按学生做 bootstrap 的 AUC 置信区间。"""
    p = np.concatenate(groups_pred)
    y = np.concatenate(groups_y)
    rng = np.random.default_rng(seed)
    n = len(groups_pred)
    vals = []
    for _ in range(B):
        idx = rng.integers(0, n, n)
        pp = np.concatenate([groups_pred[i] for i in idx])
        yy = np.concatenate([groups_y[i] for i in idx])
        if yy.min() != yy.max():
            vals.append(roc_auc_score(yy, pp))
    return {"value": round(float(roc_auc_score(y, p)), 4), "ci_low": round(float(np.percentile(vals, 2.5)), 4),
            "ci_high": round(float(np.percentile(vals, 97.5)), 4), "n_responses": int(len(y)), "n_students": n,
            "bootstrap_B": B}
