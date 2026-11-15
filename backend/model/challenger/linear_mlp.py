"""Pure-numpy per-cell binary classification and stacking models.

Contains three lightweight, JSON-serializable model classes:
  1. InteractionLogistic: Standardized 35 base features plus smooth monotone
     log/sqrt spatial transforms and domain pairwise interactions, fitted via
     exact float64 Newton-IRLS with hierarchical L2 regularization.
  2. ResidualMLP: Pure-numpy 2-hidden-layer neural network (35 -> 48 -> 24 -> 1)
     with SiLU activations and a direct linear input-to-logit skip connection,
     trained with mini-batch AdamW, cosine LR schedule, and decoupled weight decay.
  3. LogitStacker: Exact Newton-IRLS logistic meta-learner over out-of-fold
     model log-odds.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

CELL_FEATURE_INDEX: dict[str, int] = {
    "rec_p": 0,
    "rec_logit": 1,
    "rec_p_blur3": 2,
    "rec_a": 3,
    "rec_warm": 4,
    "rec_log_frp": 5,
    "pnt_in": 6,
    "pnt_interior": 7,
    "pnt_ring1": 8,
    "near_psf": 9,
    "near_center": 10,
    "near_log_frp_dedup": 11,
    "near_pix_log_frp": 12,
    "near_ncover": 13,
    "near_blur3": 14,
    "near_blur7": 15,
    "near_psf_blur5": 16,
    "target_box_rec_a": 17,
    "target_box_near_psf": 18,
    "target_box_pnt": 19,
    "bridge_psf": 20,
    "bracket_persist": 21,
    "past_fast": 22,
    "past_slow": 23,
    "fut_fast": 24,
    "fut_slow": 25,
    "spill_in": 26,
    "is_day": 27,
    "log_dt_nearest": 28,
    "co_timed_in": 29,
    "co_timed_psf": 30,
    "target_area_ratio": 31,
    "missed_modis_decay": 32,
    "terrain_slope": 33,
    "terrain_upslope": 34,
}

DEFAULT_PAIRWISE_INTERACTIONS: tuple[tuple[str, str], ...] = (
    ("pnt_in", "log_dt_nearest"),
    ("pnt_interior", "log_dt_nearest"),
    ("rec_logit", "log_dt_nearest"),
    ("rec_p", "log_dt_nearest"),
    ("near_center", "log_dt_nearest"),
    ("bridge_psf", "log_dt_nearest"),
    ("target_box_rec_a", "target_area_ratio"),
    ("target_box_pnt", "target_area_ratio"),
    ("rec_p_blur3", "target_area_ratio"),
    ("target_box_pnt", "co_timed_in"),
    ("near_center", "co_timed_in"),
    ("past_slow", "is_day"),
    ("near_blur7", "near_pix_log_frp"),
    ("pnt_in", "near_pix_log_frp"),
    ("pnt_in", "near_ncover"),
    ("rec_p", "pnt_in"),
    ("rec_p_blur3", "near_blur3"),
)

DEFAULT_MONOTONE_TRANSFORMS: tuple[tuple[str, float], ...] = (
    ("rec_p_blur3", 1e-3),
    ("rec_a", 1e-3),
    ("target_box_rec_a", 1e-3),
    ("near_psf", 1e-2),
    ("near_center", 1e-3),
    ("near_blur3", 1e-3),
    ("near_blur7", 1e-3),
    ("near_psf_blur5", 1e-2),
    ("target_box_near_psf", 1e-2),
    ("target_box_pnt", 1e-3),
    ("bridge_psf", 1e-2),
    ("bracket_persist", 1e-2),
    ("past_slow", 1e-3),
    ("fut_slow", 1e-3),
)


def sigmoid_f64(z: NDArray[np.float64]) -> NDArray[np.float64]:
    zc = np.clip(z, -35.0, 35.0)
    return 1.0 / (1.0 + np.exp(-zc))


def logit_clip(p: NDArray[Any]) -> NDArray[np.float64]:
    pc = np.clip(np.asarray(p, dtype=np.float64), 1e-5, 1.0 - 1e-5)
    return np.log(pc / (1.0 - pc))


def _sigmoid_f32(z: NDArray[np.float32]) -> NDArray[np.float32]:
    return np.float32(0.5) * (np.float32(1.0) + np.tanh(np.float32(0.5) * np.clip(z, -30.0, 30.0)))


def select_optimal_tau(
    prob_tr: NDArray[np.float64],
    y_tr: NDArray[np.uint8] | NDArray[np.bool_],
    fp_weight: float = 1.0,
    plateau_frac: float = 1.0,
) -> float:
    """Select declaration probability threshold tau strictly on fitting data in O(N) time."""
    taus = np.linspace(0.18, 0.40, 89)
    yb = np.asarray(y_tr, dtype=bool)
    tot_pos = float(yb.sum())
    if tot_pos <= 0.0:
        return 0.28
    # Bin probabilities relative to taus via searchsorted (prob >= t <-> side="left")
    edges = taus
    pos_bins = np.bincount(np.searchsorted(edges, prob_tr[yb], side="left"), minlength=len(edges) + 1)
    neg_bins = np.bincount(np.searchsorted(edges, prob_tr[~yb], side="left"), minlength=len(edges) + 1)
    # Count >= edges[i] is suffix sum from index i+1 to end, plus exact == edges[i]
    # Exact comparison via -1e-15 shift gives exact >= taus[i]
    pos_ge = np.cumsum(pos_bins[::-1])[::-1][1:]
    neg_ge = np.cumsum(neg_bins[::-1])[::-1][1:]
    # Check exact equality edge cases with searchsorted(edges - 0, ..., side="left")
    pos_bins_r = np.bincount(np.searchsorted(edges, prob_tr[yb], side="right"), minlength=len(edges) + 1)
    neg_bins_r = np.bincount(np.searchsorted(edges, prob_tr[~yb], side="right"), minlength=len(edges) + 1)
    # prob >= t means not (prob < t); count(prob < t) = sum_{k <= i} bin_left[k] where bin_left uses side="left"
    tp = tot_pos - np.cumsum(pos_bins)[:-1]
    tot_neg = float((~yb).sum())
    fp = tot_neg - np.cumsum(neg_bins)[:-1]
    _ = (pos_ge, neg_ge, pos_bins_r, neg_bins_r)
    scores = tp / (tot_pos + fp_weight * fp + 1e-12)
    idx_best = int(np.argmax(scores))
    if plateau_frac < 1.0:
        near = np.flatnonzero(scores >= plateau_frac * scores[idx_best])
        if near.size > 0:
            return float(taus[int(near[0])])
    return float(taus[idx_best])


class InteractionLogistic:
    """Per-cell logistic regression with monotone transforms and domain pairwise interactions."""

    def __init__(
        self,
        l2_reg: float = 3e-4,
        inter_l2_mult: float = 25.0,
        include_monotone: bool = True,
        include_interactions: bool = True,
        interactions: tuple[tuple[str, str], ...] = DEFAULT_PAIRWISE_INTERACTIONS,
        monotone_specs: tuple[tuple[str, float], ...] = DEFAULT_MONOTONE_TRANSFORMS,
        z_clip: float | None = 10.0,
        max_iter: int = 16,
        tol: float = 1e-7,
        tau_fp_weight: float = 0.90,
        tau: float = 0.256,
        max_train_rows: int = 2_500_000,
        seed: int = 20261114,
    ) -> None:
        self.l2_reg = float(l2_reg)
        self.inter_l2_mult = float(inter_l2_mult)
        self.include_monotone = bool(include_monotone)
        self.include_interactions = bool(include_interactions)
        self.interactions = tuple((str(a), str(b)) for a, b in interactions)
        self.monotone_specs = tuple((str(nm), float(eps)) for nm, eps in monotone_specs)
        self.z_clip = None if z_clip is None else float(z_clip)
        self.max_iter = int(max_iter)
        self.tol = float(tol)
        self.tau_fp_weight = float(tau_fp_weight)
        self.tau = float(tau)
        self.max_train_rows = int(max_train_rows)
        self.seed = int(seed)

        self.bias_: float = 0.0
        self.weights_: NDArray[np.float64] | None = None
        self.mean_: NDArray[np.float64] | None = None
        self.std_: NDArray[np.float64] | None = None

    def _build_features(self, X: NDArray[Any]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        Xf = np.asarray(X, dtype=np.float64).copy()
        if Xf.ndim != 2 or Xf.shape[1] < 35:
            raise ValueError(f"Expected X with shape (N, >=35), got {Xf.shape}")
        b_idx = CELL_FEATURE_INDEX["bridge_psf"]
        Xf[:, b_idx] = np.log1p(np.maximum(Xf[:, b_idx], 0.0))

        cols: list[NDArray[np.float64]] = [Xf[:, :35]]
        mults: list[NDArray[np.float64]] = [np.ones(35, dtype=np.float64)]

        if self.include_monotone and len(self.monotone_specs) > 0:
            mono_cols = []
            for nm, eps in self.monotone_specs:
                v = np.maximum(Xf[:, CELL_FEATURE_INDEX[nm]], 0.0)
                mono_cols.append(np.log(v + eps))
                mono_cols.append(np.sqrt(v))
            blk_m = np.column_stack(mono_cols)
            cols.append(blk_m)
            mults.append(np.ones(blk_m.shape[1], dtype=np.float64))

        if self.include_interactions and len(self.interactions) > 0:
            inter_cols = [
                Xf[:, CELL_FEATURE_INDEX[a]] * Xf[:, CELL_FEATURE_INDEX[b]]
                for a, b in self.interactions
            ]
            blk_i = np.column_stack(inter_cols)
            cols.append(blk_i)
            mults.append(np.full(blk_i.shape[1], self.inter_l2_mult, dtype=np.float64))

        return np.hstack(cols), np.concatenate(mults)

    def _standardize(self, Phi: NDArray[np.float64]) -> NDArray[np.float64]:
        assert self.mean_ is not None and self.std_ is not None
        Z = (Phi - self.mean_) / self.std_
        if self.z_clip is not None:
            Z = self.z_clip * np.tanh(Z / self.z_clip)
        return Z

    def fit(self, X: NDArray[Any], y: NDArray[Any]) -> InteractionLogistic:
        n_total = len(X)
        y_all = np.asarray(y, dtype=np.float64).ravel()
        if y_all.shape[0] != n_total:
            raise ValueError("X and y have incompatible row counts")

        if n_total > self.max_train_rows:
            rng = np.random.default_rng(self.seed)
            sub_idx = np.sort(rng.choice(n_total, size=self.max_train_rows, replace=False))
            X_fit = X[sub_idx]
            y_f = y_all[sub_idx]
        else:
            X_fit = X
            y_f = y_all

        Phi, reg_mult = self._build_features(X_fit)
        n, d = Phi.shape

        self.mean_ = Phi.mean(axis=0)
        self.std_ = np.maximum(Phi.std(axis=0), 1e-6)
        Z = self._standardize(Phi)

        reg_diag = reg_mult * self.l2_reg
        inv_n = 1.0 / max(1, n)

        p0 = float(np.clip(y_f.mean(), 1e-5, 1.0 - 1e-5))
        theta = np.zeros(d + 1, dtype=np.float64)
        theta[0] = math.log(p0 / (1.0 - p0))

        def eval_loss(th: NDArray[np.float64]) -> tuple[float, NDArray[np.float64]]:
            logits = Z @ th[1:] + th[0]
            nll = float(np.mean(np.maximum(logits, 0.0) - logits * y_f + np.log1p(np.exp(-np.abs(logits)))))
            pen = 0.5 * float(np.sum(reg_diag * (th[1:] ** 2)))
            return nll + pen, logits

        cur_loss, logits = eval_loss(theta)
        H = np.empty((d + 1, d + 1), dtype=np.float64)

        for _ in range(self.max_iter):
            p = sigmoid_f64(logits)
            diff = p - y_f
            grad = np.empty(d + 1, dtype=np.float64)
            grad[0] = float(diff.mean())
            grad[1:] = (Z.T @ diff) * inv_n + reg_diag * theta[1:]
            if float(np.max(np.abs(grad))) < self.tol:
                break

            w = np.maximum(p * (1.0 - p), 1e-8)
            H[0, 0] = float(w.mean()) + 1e-10
            h0 = (Z.T @ w) * inv_n
            H[0, 1:] = h0
            H[1:, 0] = h0
            Zw = Z * np.sqrt(w)[:, None]
            H_sub = (Zw.T @ Zw) * inv_n
            H_sub.flat[:: d + 1] += reg_diag + 1e-10
            H[1:, 1:] = H_sub

            step = np.linalg.solve(H, grad)
            scale = 1.0
            while scale >= 1e-5:
                cand = theta - scale * step
                cand_loss, cand_logits = eval_loss(cand)
                if cand_loss <= cur_loss + 1e-11:
                    theta = cand
                    cur_loss = cand_loss
                    logits = cand_logits
                    break
                scale *= 0.5
            if float(np.max(np.abs(scale * step))) < 1e-6:
                break

        self.bias_ = float(theta[0])
        self.weights_ = theta[1:].copy()

        p_tr = sigmoid_f64(Z @ self.weights_ + self.bias_)
        self.tau = select_optimal_tau(p_tr, y_f > 0.5, fp_weight=self.tau_fp_weight)
        return self

    def predict_logit(self, X: NDArray[Any], chunk_size: int = 131072) -> NDArray[np.float64]:
        if self.weights_ is None or self.mean_ is None or self.std_ is None:
            raise RuntimeError("InteractionLogistic is not fitted")
        n = len(X)
        if n == 0:
            return np.empty(0, dtype=np.float64)
        out = np.empty(n, dtype=np.float64)
        for c0 in range(0, n, chunk_size):
            c1 = min(n, c0 + chunk_size)
            Phi, _ = self._build_features(X[c0:c1])
            Z = self._standardize(Phi)
            out[c0:c1] = Z @ self.weights_ + self.bias_
        return out

    def predict_proba(self, X: NDArray[Any]) -> NDArray[np.float64]:
        if len(X) == 0:
            return np.empty(0, dtype=np.float64)
        return sigmoid_f64(self.predict_logit(X))

    def predict(self, X: NDArray[Any], tau: float | None = None) -> NDArray[np.bool_]:
        cut = self.tau if tau is None else float(tau)
        return self.predict_proba(X) >= cut

    def to_dict(self) -> dict[str, Any]:
        if self.weights_ is None or self.mean_ is None or self.std_ is None:
            raise RuntimeError("Cannot serialize unfitted InteractionLogistic")
        return {
            "model_family": "InteractionLogistic",
            "version": 1,
            "l2_reg": self.l2_reg,
            "inter_l2_mult": self.inter_l2_mult,
            "include_monotone": self.include_monotone,
            "include_interactions": self.include_interactions,
            "interactions": [list(pair) for pair in self.interactions],
            "monotone_specs": [[nm, eps] for nm, eps in self.monotone_specs],
            "z_clip": self.z_clip,
            "max_iter": self.max_iter,
            "tol": self.tol,
            "tau_fp_weight": self.tau_fp_weight,
            "tau": self.tau,
            "max_train_rows": self.max_train_rows,
            "seed": self.seed,
            "bias": self.bias_,
            "weights": self.weights_.tolist(),
            "mean": self.mean_.tolist(),
            "std": self.std_.tolist(),
        }

    @classmethod
    def from_dict(cls, doc: dict[str, Any]) -> InteractionLogistic:
        obj = cls(
            l2_reg=doc["l2_reg"],
            inter_l2_mult=doc.get("inter_l2_mult", 25.0),
            include_monotone=doc.get("include_monotone", True),
            include_interactions=doc.get("include_interactions", True),
            interactions=tuple((p[0], p[1]) for p in doc["interactions"]),
            monotone_specs=tuple((s[0], float(s[1])) for s in doc.get("monotone_specs", [])),
            z_clip=doc.get("z_clip", 10.0),
            max_iter=doc.get("max_iter", 16),
            tol=doc.get("tol", 1e-7),
            tau_fp_weight=doc.get("tau_fp_weight", 0.90),
            tau=doc["tau"],
            max_train_rows=doc.get("max_train_rows", 2_500_000),
            seed=doc.get("seed", 20261114),
        )
        obj.bias_ = float(doc["bias"])
        obj.weights_ = np.asarray(doc["weights"], dtype=np.float64)
        obj.mean_ = np.asarray(doc["mean"], dtype=np.float64)
        obj.std_ = np.asarray(doc["std"], dtype=np.float64)
        return obj

    def save_json(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(self.to_dict()), encoding="utf-8")

    @classmethod
    def load_json(cls, path: str | Path) -> InteractionLogistic:
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


class ResidualMLP:
    """Pure-numpy 2-hidden-layer SiLU neural network with direct linear input-to-logit skip."""

    def __init__(
        self,
        hidden_dims: tuple[int, int] = (48, 24),
        epochs: int = 16,
        batch_size: int = 8192,
        lr_max: float = 3e-3,
        weight_decay: float = 0.35,
        skip_weight_decay: float = 0.01,
        dropout: float = 0.08,
        z_clip: float | None = 10.0,
        use_ema: bool = False,
        ema_decay: float = 0.992,
        tau_plateau_frac: float = 0.997,
        tau: float = 0.274,
        max_train_rows: int = 3_000_000,
        seed: int = 20261114,
    ) -> None:
        if len(hidden_dims) != 2:
            raise ValueError("ResidualMLP requires exactly 2 hidden layer sizes (H1, H2)")
        self.hidden_dims = (int(hidden_dims[0]), int(hidden_dims[1]))
        self.epochs = int(epochs)
        self.batch_size = int(batch_size)
        self.lr_max = float(lr_max)
        self.weight_decay = float(weight_decay)
        self.skip_weight_decay = float(skip_weight_decay)
        self.dropout = float(dropout)
        self.z_clip = None if z_clip is None else float(z_clip)
        self.use_ema = bool(use_ema)
        self.ema_decay = float(ema_decay)
        self.tau_plateau_frac = float(tau_plateau_frac)
        self.tau = float(tau)
        self.max_train_rows = int(max_train_rows)
        self.seed = int(seed)

        self.mean_: NDArray[np.float32] | None = None
        self.std_: NDArray[np.float32] | None = None
        self.W1_: NDArray[np.float32] | None = None
        self.b1_: NDArray[np.float32] | None = None
        self.W2_: NDArray[np.float32] | None = None
        self.b2_: NDArray[np.float32] | None = None
        self.W3_: NDArray[np.float32] | None = None
        self.W_skip_: NDArray[np.float32] | None = None
        self.b3_: float = 0.0

    @staticmethod
    def _preprocess_raw(X: NDArray[Any]) -> NDArray[np.float32]:
        Xf = np.asarray(X, dtype=np.float32).copy()
        if Xf.ndim != 2 or Xf.shape[1] < 35:
            raise ValueError(f"Expected X with shape (N, >=35), got {Xf.shape}")
        Xf = Xf[:, :35]
        b_idx = CELL_FEATURE_INDEX["bridge_psf"]
        Xf[:, b_idx] = np.log1p(np.maximum(Xf[:, b_idx], np.float32(0.0)))
        return Xf

    def _standardize(self, Xf: NDArray[np.float32]) -> NDArray[np.float32]:
        assert self.mean_ is not None and self.std_ is not None
        Z = (Xf - self.mean_) / self.std_
        if self.z_clip is not None:
            zc = np.float32(self.z_clip)
            Z = zc * np.tanh(Z / zc)
        return Z

    def fit(self, X: NDArray[Any], y: NDArray[Any]) -> ResidualMLP:
        n_total = len(X)
        y_all = np.asarray(y, dtype=np.uint8).ravel()
        if y_all.shape[0] != n_total:
            raise ValueError("X and y have incompatible row counts")

        rng = np.random.default_rng(self.seed)
        if n_total > self.max_train_rows:
            sub_idx = rng.choice(n_total, size=self.max_train_rows, replace=False)
            Xf = self._preprocess_raw(X[sub_idx])
            y_u8 = y_all[sub_idx]
        else:
            Xf = self._preprocess_raw(X)
            y_u8 = y_all

        n, d = Xf.shape
        self.mean_ = Xf.mean(axis=0, dtype=np.float64).astype(np.float32)
        self.std_ = np.maximum(Xf.std(axis=0, dtype=np.float64), 1e-6).astype(np.float32)
        Z = self._standardize(Xf)
        y_f = y_u8.astype(np.float32)

        h1, h2 = self.hidden_dims
        p0 = float(np.clip(y_f.mean(dtype=np.float64), 1e-5, 1.0 - 1e-5))

        W1 = rng.normal(0.0, math.sqrt(2.0 / d), size=(d, h1)).astype(np.float32)
        b1 = np.zeros(h1, dtype=np.float32)
        W2 = rng.normal(0.0, math.sqrt(2.0 / h1), size=(h1, h2)).astype(np.float32)
        b2 = np.zeros(h2, dtype=np.float32)
        W3 = rng.normal(0.0, 0.02 / math.sqrt(h2), size=(h2,)).astype(np.float32)
        W_skip = np.zeros(d, dtype=np.float32)
        b3 = float(math.log(p0 / (1.0 - p0)))

        perm0 = rng.permutation(n)
        Z_shuf = np.ascontiguousarray(Z[perm0])
        y_shuf = np.ascontiguousarray(y_f[perm0])

        params: dict[str, NDArray[np.float32]] = {
            "W1": W1,
            "b1": b1,
            "W2": W2,
            "b2": b2,
            "W3": W3,
            "W_skip": W_skip,
        }
        m_mom = {k: np.zeros_like(v) for k, v in params.items()}
        v_mom = {k: np.zeros_like(v) for k, v in params.items()}
        m_b3, v_b3 = 0.0, 0.0

        ema_params = {k: v.copy() for k, v in params.items()}
        ema_b3 = b3
        ema_start_ep = max(0, self.epochs - max(4, self.epochs // 3))

        beta1, beta2, eps = 0.9, 0.999, 1e-8
        lr_min = self.lr_max * 0.01
        bs = self.batch_size
        n_batches = max(1, (n - bs) // bs + 1)
        total_steps = max(1, self.epochs * n_batches)
        step = 0
        drop_p = self.dropout

        for ep in range(self.epochs):
            max_off = min(bs, max(1, n - (n_batches - 1) * bs))
            offset = int(rng.integers(0, max_off))
            for bi in rng.permutation(n_batches):
                s_i = offset + int(bi) * bs
                e_i = min(n, s_i + bs)
                if e_i <= s_i:
                    continue
                xb = Z_shuf[s_i:e_i]
                yb = y_shuf[s_i:e_i]
                inv_B = np.float32(1.0 / xb.shape[0])

                step += 1
                prog = min(1.0, (step - 1) / max(1, total_steps - 1))
                lr_t = lr_min + 0.5 * (self.lr_max - lr_min) * (1.0 + math.cos(math.pi * prog))

                z1 = xb @ params["W1"] + params["b1"]
                s1 = _sigmoid_f32(z1)
                a1 = z1 * s1
                if drop_p > 0.0:
                    keep = np.float32(1.0 - drop_p)
                    m1 = (rng.random(a1.shape, dtype=np.float32) < keep).astype(np.float32) / keep
                    a1_d = a1 * m1
                else:
                    a1_d = a1

                z2 = a1_d @ params["W2"] + params["b2"]
                s2 = _sigmoid_f32(z2)
                a2 = z2 * s2
                if drop_p > 0.0:
                    keep = np.float32(1.0 - drop_p)
                    m2 = (rng.random(a2.shape, dtype=np.float32) < keep).astype(np.float32) / keep
                    a2_d = a2 * m2
                else:
                    a2_d = a2

                logits = a2_d @ params["W3"] + xb @ params["W_skip"] + np.float32(b3)
                p = _sigmoid_f32(logits)

                g_out = (p - yb) * inv_B
                grad_b3 = float(np.sum(g_out, dtype=np.float64))
                grad_W3 = a2_d.T @ g_out
                grad_W_skip = xb.T @ g_out

                g_a2 = g_out[:, None] * params["W3"][None, :]
                if drop_p > 0.0:
                    g_a2 *= m2
                g_z2 = g_a2 * (s2 + a2 * (np.float32(1.0) - s2))
                grad_b2 = np.sum(g_z2, axis=0)
                grad_W2 = a1_d.T @ g_z2

                g_a1 = g_z2 @ params["W2"].T
                if drop_p > 0.0:
                    g_a1 *= m1
                g_z1 = g_a1 * (s1 + a1 * (np.float32(1.0) - s1))
                grad_b1 = np.sum(g_z1, axis=0)
                grad_W1 = xb.T @ g_z1

                grads = {
                    "W1": grad_W1,
                    "b1": grad_b1,
                    "W2": grad_W2,
                    "b2": grad_b2,
                    "W3": grad_W3,
                    "W_skip": grad_W_skip,
                }

                bc1 = 1.0 - (beta1 ** step)
                bc2 = 1.0 - (beta2 ** step)
                step_size = np.float32(lr_t / bc1)
                inv_bc2_sqrt = np.float32(1.0 / math.sqrt(bc2))

                for k, p_arr in params.items():
                    g = grads[k]
                    m_k = m_mom[k]
                    v_k = v_mom[k]
                    m_k *= np.float32(beta1)
                    m_k += np.float32(1.0 - beta1) * g
                    v_k *= np.float32(beta2)
                    v_k += np.float32(1.0 - beta2) * (g * g)

                    if k in ("W1", "W2", "W3") and self.weight_decay > 0.0:
                        p_arr *= np.float32(1.0 - lr_t * self.weight_decay)
                    elif k == "W_skip" and self.skip_weight_decay > 0.0:
                        p_arr *= np.float32(1.0 - lr_t * self.skip_weight_decay)

                    p_arr -= step_size * (m_k / (np.sqrt(v_k) * inv_bc2_sqrt + np.float32(eps)))

                m_b3 = beta1 * m_b3 + (1.0 - beta1) * grad_b3
                v_b3 = beta2 * v_b3 + (1.0 - beta2) * (grad_b3 * grad_b3)
                b3 -= (lr_t / bc1) * (m_b3 / (math.sqrt(v_b3) * float(inv_bc2_sqrt) + eps))

                if self.use_ema:
                    if ep < ema_start_ep:
                        for k, p_arr in params.items():
                            ema_params[k][:] = p_arr
                        ema_b3 = b3
                    else:
                        d_ema = np.float32(self.ema_decay)
                        one_m = np.float32(1.0 - self.ema_decay)
                        for k, p_arr in params.items():
                            ema_params[k] *= d_ema
                            ema_params[k] += one_m * p_arr
                        ema_b3 = self.ema_decay * ema_b3 + (1.0 - self.ema_decay) * b3

        final_p = ema_params if self.use_ema else params
        self.W1_ = final_p["W1"].copy()
        self.b1_ = final_p["b1"].copy()
        self.W2_ = final_p["W2"].copy()
        self.b2_ = final_p["b2"].copy()
        self.W3_ = final_p["W3"].copy()
        self.W_skip_ = final_p["W_skip"].copy()
        self.b3_ = float(ema_b3 if self.use_ema else b3)

        p_tr = self._predict_proba_standardized(Z)
        self.tau = select_optimal_tau(p_tr, y_u8, fp_weight=1.0, plateau_frac=self.tau_plateau_frac)
        return self

    def _predict_logit_standardized(self, Z: NDArray[np.float32]) -> NDArray[np.float64]:
        assert (
            self.W1_ is not None
            and self.b1_ is not None
            and self.W2_ is not None
            and self.b2_ is not None
            and self.W3_ is not None
            and self.W_skip_ is not None
        )
        n = Z.shape[0]
        out = np.empty(n, dtype=np.float64)
        chunk = 32768
        for i in range(0, n, chunk):
            zc = Z[i : i + chunk]
            z1 = zc @ self.W1_ + self.b1_
            a1 = z1 * _sigmoid_f32(z1)
            z2 = a1 @ self.W2_ + self.b2_
            a2 = z2 * _sigmoid_f32(z2)
            out[i : i + chunk] = (a2 @ self.W3_ + zc @ self.W_skip_).astype(np.float64) + self.b3_
        return out

    def _predict_proba_standardized(self, Z: NDArray[np.float32]) -> NDArray[np.float64]:
        return sigmoid_f64(self._predict_logit_standardized(Z))

    def predict_logit(self, X: NDArray[Any], chunk_size: int = 131072) -> NDArray[np.float64]:
        if self.W1_ is None or self.mean_ is None or self.std_ is None:
            raise RuntimeError("ResidualMLP is not fitted")
        n = len(X)
        if n == 0:
            return np.empty(0, dtype=np.float64)
        out = np.empty(n, dtype=np.float64)
        for c0 in range(0, n, chunk_size):
            c1 = min(n, c0 + chunk_size)
            Xf = self._preprocess_raw(X[c0:c1])
            Z = self._standardize(Xf)
            out[c0:c1] = self._predict_logit_standardized(Z)
        return out

    def predict_proba(self, X: NDArray[Any]) -> NDArray[np.float64]:
        if len(X) == 0:
            return np.empty(0, dtype=np.float64)
        return sigmoid_f64(self.predict_logit(X))

    def predict(self, X: NDArray[Any], tau: float | None = None) -> NDArray[np.bool_]:
        cut = self.tau if tau is None else float(tau)
        return self.predict_proba(X) >= cut

    def to_dict(self) -> dict[str, Any]:
        if self.W1_ is None or self.mean_ is None or self.std_ is None:
            raise RuntimeError("Cannot serialize unfitted ResidualMLP")
        assert self.b1_ is not None and self.W2_ is not None and self.b2_ is not None
        assert self.W3_ is not None and self.W_skip_ is not None
        return {
            "model_family": "ResidualMLP",
            "version": 1,
            "hidden_dims": list(self.hidden_dims),
            "epochs": self.epochs,
            "batch_size": self.batch_size,
            "lr_max": self.lr_max,
            "weight_decay": self.weight_decay,
            "skip_weight_decay": self.skip_weight_decay,
            "dropout": self.dropout,
            "z_clip": self.z_clip,
            "use_ema": self.use_ema,
            "ema_decay": self.ema_decay,
            "tau_plateau_frac": self.tau_plateau_frac,
            "tau": self.tau,
            "max_train_rows": self.max_train_rows,
            "seed": self.seed,
            "mean": self.mean_.tolist(),
            "std": self.std_.tolist(),
            "W1": self.W1_.tolist(),
            "b1": self.b1_.tolist(),
            "W2": self.W2_.tolist(),
            "b2": self.b2_.tolist(),
            "W3": self.W3_.tolist(),
            "W_skip": self.W_skip_.tolist(),
            "b3": self.b3_,
        }

    @classmethod
    def from_dict(cls, doc: dict[str, Any]) -> ResidualMLP:
        obj = cls(
            hidden_dims=(int(doc["hidden_dims"][0]), int(doc["hidden_dims"][1])),
            epochs=doc.get("epochs", 16),
            batch_size=doc.get("batch_size", 8192),
            lr_max=doc.get("lr_max", 3e-3),
            weight_decay=doc.get("weight_decay", 0.35),
            skip_weight_decay=doc.get("skip_weight_decay", 0.01),
            dropout=doc.get("dropout", 0.08),
            z_clip=doc.get("z_clip", 10.0),
            use_ema=doc.get("use_ema", False),
            ema_decay=doc.get("ema_decay", 0.992),
            tau_plateau_frac=doc.get("tau_plateau_frac", 0.997),
            tau=doc["tau"],
            max_train_rows=doc.get("max_train_rows", 3_000_000),
            seed=doc.get("seed", 20261114),
        )
        obj.mean_ = np.asarray(doc["mean"], dtype=np.float32)
        obj.std_ = np.asarray(doc["std"], dtype=np.float32)
        obj.W1_ = np.asarray(doc["W1"], dtype=np.float32)
        obj.b1_ = np.asarray(doc["b1"], dtype=np.float32)
        obj.W2_ = np.asarray(doc["W2"], dtype=np.float32)
        obj.b2_ = np.asarray(doc["b2"], dtype=np.float32)
        obj.W3_ = np.asarray(doc["W3"], dtype=np.float32)
        obj.W_skip_ = np.asarray(doc["W_skip"], dtype=np.float32)
        obj.b3_ = float(doc["b3"])
        return obj


class LogitStacker:
    """Logistic meta-learner over out-of-fold base-model log-odds."""

    def __init__(self, weights: list[float] | None = None, bias: float = 0.0, l2_scale: float = 1e-4) -> None:
        self.weights_ = None if weights is None else np.asarray(weights, dtype=np.float64)
        self.bias_ = float(bias)
        self.l2_scale = float(l2_scale)

    def fit_from_probs(self, probs_list: list[NDArray[Any]], y: NDArray[Any]) -> LogitStacker:
        L = np.column_stack([logit_clip(p) for p in probs_list])
        y_f = np.asarray(y, dtype=np.float64).ravel()
        n, k = L.shape
        w = np.full(k, 1.0 / k, dtype=np.float64)
        b = 0.0
        l2 = self.l2_scale * max(1, n)
        for _ in range(15):
            z = L @ w + b
            p = sigmoid_f64(z)
            diff = p - y_f
            s = np.maximum(p * (1.0 - p), 1e-7)
            gw = L.T @ diff + l2 * (w - 1.0 / k)
            gb = float(diff.sum())
            H_ww = (L * s[:, None]).T @ L + np.eye(k) * l2
            H_wb = L.T @ s
            H_bb = float(s.sum()) + 1e-6
            H = np.empty((k + 1, k + 1), dtype=np.float64)
            H[:k, :k] = H_ww
            H[:k, k] = H_wb
            H[k, :k] = H_wb
            H[k, k] = H_bb
            step = np.linalg.solve(H, np.append(gw, gb))
            w -= step[:k]
            b -= float(step[k])
            if float(np.max(np.abs(step))) < 1e-6:
                break
        self.weights_ = w
        self.bias_ = float(b)
        return self

    def predict_proba_from_probs(self, probs_list: list[NDArray[Any]]) -> NDArray[np.float64]:
        if self.weights_ is None:
            raise RuntimeError("LogitStacker is not fitted")
        if len(probs_list[0]) == 0:
            return np.empty(0, dtype=np.float64)
        z = np.full(len(probs_list[0]), self.bias_, dtype=np.float64)
        for w_k, p_k in zip(self.weights_, probs_list):
            z += float(w_k) * logit_clip(p_k)
        return sigmoid_f64(z)

    def to_dict(self) -> dict[str, Any]:
        if self.weights_ is None:
            raise RuntimeError("Cannot serialize unfitted LogitStacker")
        return {
            "weights": [float(v) for v in self.weights_],
            "bias": self.bias_,
            "l2_scale": self.l2_scale,
        }

    @classmethod
    def from_dict(cls, doc: dict[str, Any]) -> LogitStacker:
        return cls(weights=doc["weights"], bias=float(doc["bias"]), l2_scale=float(doc.get("l2_scale", 1e-4)))
