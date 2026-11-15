"""Pure-numpy Histogram-Binned Gradient Boosted Decision Trees (HistGBDT) for binary log-loss.

Self-contained implementation using only Python 3.12 standard library and NumPy.
Features:
- Training-fold-only quantile binning into uint8 (up to 255 bins).
- Vectorized histogram accumulation via np.bincount with pre-allocated intp buffers
  and parent-minus-smaller-child histogram subtraction.
- Gradient-based One-Side Sampling (GOSS) or uniform row subsampling.
- Prior log-odds or calibrated/blended feature-logit base margin initialization.
- Support for max_depth, n_estimators, learning_rate, l2_reg, min_child_hessian,
  min_split_gain, max_delta_step, colsample_bytree, monotone_constraints.
- Exact JSON/dict serialization via to_dict() and from_dict().
"""

from __future__ import annotations

import math
from typing import Any
import numpy as np
from numpy.typing import NDArray


def _sigmoid(x: NDArray[np.float64]) -> NDArray[np.float64]:
    xc = np.clip(x, -36.0, 36.0)
    return 1.0 / (1.0 + np.exp(-xc))


class _CompiledTree:
    """Padded heap representation of a shallow decision tree for fast vectorized inference."""

    __slots__ = ("depth", "feat", "thresh", "leaf_values", "const_val")

    def __init__(self, tree_dict: dict[str, Any]) -> None:
        feat_list = tree_dict["feature"]
        thresh_list = tree_dict["threshold"]
        left_list = tree_dict["left"]
        right_list = tree_dict["right"]
        val_list = tree_dict["value"]

        if len(feat_list) == 1 or feat_list[0] < 0:
            self.depth = 0
            self.const_val = float(val_list[0])
            self.feat = np.zeros(1, dtype=np.int32)
            self.thresh = np.zeros(1, dtype=np.float32)
            self.leaf_values = np.array([self.const_val], dtype=np.float64)
            return

        def _get_depth(nid: int) -> int:
            if feat_list[nid] < 0:
                return 0
            return 1 + max(_get_depth(left_list[nid]), _get_depth(right_list[nid]))

        d = _get_depth(0)
        self.depth = d
        self.const_val = 0.0
        n_heap_internal = 1 << d
        n_leaves = 1 << d
        self.feat = np.zeros(n_heap_internal, dtype=np.int32)
        self.thresh = np.zeros(n_heap_internal, dtype=np.float32)
        self.leaf_values = np.zeros(n_leaves, dtype=np.float64)

        def _fill(nid: int, h_idx: int, lvl: int) -> None:
            f = feat_list[nid]
            if f < 0:
                span = 1 << (d - lvl)
                start = (h_idx << (d - lvl)) - n_leaves
                self.leaf_values[start : start + span] = float(val_list[nid])
                return
            self.feat[h_idx] = int(f)
            self.thresh[h_idx] = np.float32(thresh_list[nid])
            if lvl + 1 == d:
                l_nid = left_list[nid]
                r_nid = right_list[nid]
                base = (h_idx << 1) - n_leaves
                self.leaf_values[base] = float(val_list[l_nid])
                self.leaf_values[base + 1] = float(val_list[r_nid])
            else:
                _fill(left_list[nid], h_idx << 1, lvl + 1)
                _fill(right_list[nid], (h_idx << 1) + 1, lvl + 1)

        _fill(0, 1, 0)


class HistGBDT:
    """Histogram-Binned Gradient Boosted Decision Trees binary log-loss classifier."""

    def __init__(
        self,
        n_estimators: int = 150,
        learning_rate: float = 0.06,
        max_depth: int = 4,
        n_bins: int = 128,
        l2_reg: float = 10.0,
        min_child_hessian: float = 20.0,
        min_split_gain: float = 0.0,
        max_delta_step: float | None = 2.5,
        colsample_bytree: float = 0.8,
        init_feature_idx: int | None = None,
        init_alpha: float | str = 0.0,
        use_goss: bool = False,
        goss_top_rate: float = 0.20,
        goss_other_rate: float = 0.15,
        goss_refresh: int = 10,
        subsample: float = 1.0,
        monotone_constraints: list[int] | tuple[int, ...] | None = None,
        max_bin_samples: int = 120_000,
        max_train_rows: int = 3_000_000,
        random_state: int = 42,
    ) -> None:
        if not (2 <= n_bins <= 255):
            raise ValueError("n_bins must be in [2, 255] for uint8 binning")
        if max_depth < 1 or max_depth > 10:
            raise ValueError("max_depth must be in [1, 10]")
        self.n_estimators = int(n_estimators)
        self.learning_rate = float(learning_rate)
        self.max_depth = int(max_depth)
        self.n_bins = int(n_bins)
        self.l2_reg = float(l2_reg)
        self.min_child_hessian = float(min_child_hessian)
        self.min_split_gain = float(min_split_gain)
        self.max_delta_step = None if max_delta_step is None else float(max_delta_step)
        self.colsample_bytree = float(colsample_bytree)
        self.init_feature_idx = None if init_feature_idx is None else int(init_feature_idx)
        self.init_alpha = init_alpha
        self.use_goss = bool(use_goss)
        self.goss_top_rate = float(goss_top_rate)
        self.goss_other_rate = float(goss_other_rate)
        self.goss_refresh = max(1, int(goss_refresh))
        self.subsample = float(subsample)
        self.monotone_constraints = list(monotone_constraints) if monotone_constraints is not None else None
        self.max_bin_samples = int(max_bin_samples)
        self.max_train_rows = int(max_train_rows)
        self.random_state = int(random_state)

        self.n_features_: int = 0
        self.init_bias_: float = 0.0
        self.init_slope_: float = 0.0
        self.trees_: list[dict[str, Any]] = []
        self._compiled_trees: list[_CompiledTree] = []
        self.feature_importances_gain_: NDArray[np.float64] = np.empty(0, dtype=np.float64)
        self.feature_importances_split_: NDArray[np.int64] = np.empty(0, dtype=np.int64)

    def _compute_base_margin_fit(
        self, X: NDArray[np.float32], y: NDArray[np.float64], sample_weight: NDArray[np.float64] | None
    ) -> NDArray[np.float64]:
        w = np.ones_like(y) if sample_weight is None else sample_weight
        w_sum = float(w.sum())
        y_bar = float(np.clip(np.dot(w, y) / max(w_sum, 1e-12), 1e-6, 1.0 - 1e-6))
        prior_logit = math.log(y_bar / (1.0 - y_bar))

        if self.init_feature_idx is None or (isinstance(self.init_alpha, (int, float)) and float(self.init_alpha) == 0.0):
            self.init_bias_ = prior_logit
            self.init_slope_ = 0.0
            return np.full(y.shape[0], prior_logit, dtype=np.float64)

        z = X[:, self.init_feature_idx].astype(np.float64)
        if self.init_alpha == "auto":
            b0 = 0.0
            b1 = 0.5
            for _ in range(12):
                p = _sigmoid(b0 + b1 * z)
                g = (p - y) * w
                h = np.maximum(p * (1.0 - p) * w, 1e-9)
                g0 = float(g.sum())
                g1 = float(np.dot(g, z))
                h00 = float(h.sum()) + 1.0
                h01 = float(np.dot(h, z))
                h11 = float(np.dot(h, z * z)) + 1.0
                det = h00 * h11 - h01 * h01
                if abs(det) < 1e-12:
                    break
                db0 = -(h11 * g0 - h01 * g1) / det
                db1 = -(-h01 * g0 + h00 * g1) / det
                b0 += float(np.clip(db0, -2.0, 2.0))
                b1 += float(np.clip(db1, -0.5, 0.5))
                if abs(db0) + abs(db1) < 1e-6:
                    break
            self.init_bias_ = float(b0)
            self.init_slope_ = float(np.clip(b1, 0.0, 1.5))
        else:
            slope = float(self.init_alpha)
            b0 = (1.0 - slope) * prior_logit
            for _ in range(10):
                p = _sigmoid(b0 + slope * z)
                g0 = float(np.dot(w, p - y))
                h0 = float(np.dot(w, p * (1.0 - p))) + 1e-6
                step = -g0 / h0
                b0 += float(np.clip(step, -2.0, 2.0))
                if abs(step) < 1e-7:
                    break
            self.init_bias_ = float(b0)
            self.init_slope_ = slope

        return self.init_bias_ + self.init_slope_ * z

    def _compute_base_margin_infer(self, X: NDArray[np.float32]) -> NDArray[np.float64]:
        n = X.shape[0]
        if self.init_feature_idx is None or self.init_slope_ == 0.0:
            return np.full(n, self.init_bias_, dtype=np.float64)
        return self.init_bias_ + self.init_slope_ * X[:, self.init_feature_idx].astype(np.float64)

    def _build_bins(
        self, X: NDArray[np.float32], rng: np.random.Generator
    ) -> tuple[list[NDArray[np.float32]], NDArray[np.uint8]]:
        n, d = X.shape
        if n > self.max_bin_samples:
            sub_idx = rng.choice(n, size=self.max_bin_samples, replace=False)
            X_sub = X[sub_idx]
        else:
            X_sub = X

        qs = np.linspace(0.0, 1.0, self.n_bins + 1)[1:-1]
        edges_list: list[NDArray[np.float32]] = []
        Xb_col = np.empty((d, n), dtype=np.uint8)
        for j in range(d):
            col_sub = X_sub[:, j]
            raw_q = np.quantile(col_sub, qs).astype(np.float32)
            e = np.unique(raw_q)
            c_min = col_sub.min()
            if e.size > 0 and e[-1] <= c_min:
                e = np.empty(0, dtype=np.float32)
            edges_list.append(e)
            if e.size == 0:
                Xb_col[j].fill(0)
            else:
                Xb_col[j] = np.searchsorted(e, X[:, j], side="right").astype(np.uint8)
        return edges_list, Xb_col

    def _grow_one_tree(
        self,
        Xb_col: NDArray[np.uint8],
        grad: NDArray[np.float64],
        hess: NDArray[np.float64],
        edges_list: list[NDArray[np.float32]],
        feat_sub: NDArray[np.int32],
        idx_buf: NDArray[np.intp],
    ) -> tuple[dict[str, Any], list[tuple[NDArray[np.int32] | None, float]]]:
        m_samples = grad.shape[0]
        f_count = feat_sub.shape[0]
        stride = 128 if self.n_bins <= 128 else 256

        n_edges_sub = np.array([edges_list[int(j)].size for j in feat_sub], dtype=np.int32)
        bin_grid = np.arange(stride - 1, dtype=np.int32)[None, :]
        valid_bins = bin_grid < n_edges_sub[:, None]

        mc_sub: NDArray[np.int32] | None = None
        if self.monotone_constraints is not None:
            mc_arr = np.asarray(self.monotone_constraints, dtype=np.int32)
            if np.any(mc_arr[feat_sub] != 0):
                mc_sub = mc_arr[feat_sub]

        t_feat: list[int] = [-1]
        t_thresh: list[float] = [0.0]
        t_left: list[int] = [-1]
        t_right: list[int] = [-1]
        t_val: list[float] = [0.0]

        def _calc_leaf_val(sg: float, sh: float, lo_b: float, hi_b: float) -> float:
            raw = -sg / (sh + self.l2_reg)
            if self.max_delta_step is not None:
                raw = max(-self.max_delta_step, min(self.max_delta_step, raw))
            w = self.learning_rate * raw
            if w < lo_b:
                w = lo_b
            elif w > hi_b:
                w = hi_b
            return w

        root_hg = np.zeros((f_count, stride), dtype=np.float64)
        root_hh = np.zeros((f_count, stride), dtype=np.float64)
        buf_root = idx_buf[:m_samples]
        for k in range(f_count):
            j = int(feat_sub[k])
            buf_root[:] = Xb_col[j]
            root_hg[k] = np.bincount(buf_root, weights=grad, minlength=stride)
            root_hh[k] = np.bincount(buf_root, weights=hess, minlength=stride)

        root_sg = float(grad.sum())
        root_sh = float(hess.sum())
        t_val[0] = _calc_leaf_val(root_sg, root_sh, -math.inf, math.inf)

        active: list[
            tuple[int, NDArray[np.int32] | None, float, float, NDArray[np.float64], NDArray[np.float64], float, float]
        ] = [(0, None, root_sg, root_sh, root_hg, root_hh, -math.inf, math.inf)]

        leaf_updates: list[tuple[NDArray[np.int32] | None, float]] = []

        for depth in range(self.max_depth):
            if not active:
                break

            pending_splits: list[dict[str, Any]] = []
            for nid, s_idx, sg, sh, hg, hh, lo_b, hi_b in active:
                if sh < 2.0 * self.min_child_hessian:
                    leaf_updates.append((s_idx, t_val[nid]))
                    continue

                g_left = np.cumsum(hg, axis=1)[:, :-1]
                h_left = np.cumsum(hh, axis=1)[:, :-1]
                g_right = sg - g_left
                h_right = np.maximum(0.0, sh - h_left)

                ok = valid_bins & (h_left >= self.min_child_hessian) & (h_right >= self.min_child_hessian)
                if mc_sub is not None:
                    w_l = -g_left / (h_left + self.l2_reg)
                    w_r = -g_right / (h_right + self.l2_reg)
                    inc_mask = mc_sub[:, None] > 0
                    dec_mask = mc_sub[:, None] < 0
                    ok = ok & (~inc_mask | (w_l <= w_r)) & (~dec_mask | (w_l >= w_r))

                if not np.any(ok):
                    leaf_updates.append((s_idx, t_val[nid]))
                    continue

                parent_score = (sg * sg) / (sh + self.l2_reg)
                gains = 0.5 * (
                    (g_left * g_left) / (h_left + self.l2_reg)
                    + (g_right * g_right) / (h_right + self.l2_reg)
                    - parent_score
                )
                gains = np.where(ok, gains, -math.inf)
                flat_best = int(np.argmax(gains))
                best_k, best_b = divmod(flat_best, stride - 1)
                best_gain = float(gains[best_k, best_b])

                if best_gain <= self.min_split_gain or not math.isfinite(best_gain):
                    leaf_updates.append((s_idx, t_val[nid]))
                    continue

                best_j = int(feat_sub[best_k])
                if s_idx is None:
                    mask_l = Xb_col[best_j] <= best_b
                    idx_l = np.flatnonzero(mask_l).astype(np.int32)
                    idx_r = np.flatnonzero(~mask_l).astype(np.int32)
                else:
                    mask_l = Xb_col[best_j, s_idx] <= best_b
                    idx_l = s_idx[mask_l]
                    idx_r = s_idx[~mask_l]

                if idx_l.size == 0 or idx_r.size == 0:
                    leaf_updates.append((s_idx, t_val[nid]))
                    continue

                self.feature_importances_gain_[best_j] += best_gain
                self.feature_importances_split_[best_j] += 1

                l_nid = len(t_feat)
                r_nid = l_nid + 1
                t_feat[nid] = best_j
                t_thresh[nid] = float(edges_list[best_j][best_b])
                t_left[nid] = l_nid
                t_right[nid] = r_nid

                sg_l = float(g_left[best_k, best_b])
                sh_l = float(h_left[best_k, best_b])
                sg_r = sg - sg_l
                sh_r = max(0.0, sh - sh_l)

                lo_l, hi_l, lo_r, hi_r = lo_b, hi_b, lo_b, hi_b
                if mc_sub is not None and mc_sub[best_k] != 0:
                    mid = 0.5 * (
                        _calc_leaf_val(sg_l, sh_l, lo_b, hi_b) + _calc_leaf_val(sg_r, sh_r, lo_b, hi_b)
                    )
                    if mc_sub[best_k] > 0:
                        hi_l = min(hi_l, mid)
                        lo_r = max(lo_r, mid)
                    else:
                        lo_l = max(lo_l, mid)
                        hi_r = min(hi_r, mid)

                val_l = _calc_leaf_val(sg_l, sh_l, lo_l, hi_l)
                val_r = _calc_leaf_val(sg_r, sh_r, lo_r, hi_r)

                t_feat.extend([-1, -1])
                t_thresh.extend([0.0, 0.0])
                t_left.extend([-1, -1])
                t_right.extend([-1, -1])
                t_val.extend([val_l, val_r])

                pending_splits.append(
                    {
                        "hg_parent": hg,
                        "hh_parent": hh,
                        "l_nid": l_nid,
                        "r_nid": r_nid,
                        "idx_l": idx_l,
                        "idx_r": idx_r,
                        "sg_l": sg_l,
                        "sh_l": sh_l,
                        "sg_r": sg_r,
                        "sh_r": sh_r,
                        "val_l": val_l,
                        "val_r": val_r,
                        "lo_l": lo_l,
                        "hi_l": hi_l,
                        "lo_r": lo_r,
                        "hi_r": hi_r,
                    }
                )

            if not pending_splits:
                break

            if depth + 1 == self.max_depth:
                for sp in pending_splits:
                    leaf_updates.append((sp["idx_l"], sp["val_l"]))
                    leaf_updates.append((sp["idx_r"], sp["val_r"]))
                break

            n_sp = len(pending_splits)
            small_indices_list: list[NDArray[np.int32]] = []
            nid_offsets_list: list[NDArray[np.intp]] = []
            small_is_left: list[bool] = []
            for s_i, sp in enumerate(pending_splits):
                if sp["idx_l"].size <= sp["idx_r"].size:
                    s_arr = sp["idx_l"]
                    small_is_left.append(True)
                else:
                    s_arr = sp["idx_r"]
                    small_is_left.append(False)
                small_indices_list.append(s_arr)
                nid_offsets_list.append(np.full(s_arr.size, s_i * stride, dtype=np.intp))

            cat_idx = np.concatenate(small_indices_list) if n_sp > 1 else small_indices_list[0]
            cat_off = np.concatenate(nid_offsets_list) if n_sp > 1 else nid_offsets_list[0]
            m_small = cat_idx.size
            sub_g = grad[cat_idx]
            sub_h = hess[cat_idx]
            buf_s = idx_buf[:m_small]
            tot_bins = n_sp * stride

            all_small_hg = np.empty((f_count, n_sp, stride), dtype=np.float64)
            all_small_hh = np.empty((f_count, n_sp, stride), dtype=np.float64)
            for k in range(f_count):
                j = int(feat_sub[k])
                np.add(cat_off, Xb_col[j, cat_idx], out=buf_s)
                all_small_hg[k] = np.bincount(buf_s, weights=sub_g, minlength=tot_bins).reshape(n_sp, stride)
                all_small_hh[k] = np.bincount(buf_s, weights=sub_h, minlength=tot_bins).reshape(n_sp, stride)

            next_active = []
            for s_i, sp in enumerate(pending_splits):
                sm_hg = all_small_hg[:, s_i, :]
                sm_hh = all_small_hh[:, s_i, :]
                lg_hg = sp["hg_parent"] - sm_hg
                lg_hh = np.maximum(0.0, sp["hh_parent"] - sm_hh)
                if small_is_left[s_i]:
                    hg_l, hh_l = sm_hg, sm_hh
                    hg_r, hh_r = lg_hg, lg_hh
                else:
                    hg_l, hh_l = lg_hg, lg_hh
                    hg_r, hh_r = sm_hg, sm_hh

                sg_l_ex = float(hg_l[0].sum())
                sh_l_ex = float(hh_l[0].sum())
                sg_r_ex = float(hg_r[0].sum())
                sh_r_ex = float(hh_r[0].sum())

                next_active.append(
                    (sp["l_nid"], sp["idx_l"], sg_l_ex, sh_l_ex, hg_l, hh_l, sp["lo_l"], sp["hi_l"])
                )
                next_active.append(
                    (sp["r_nid"], sp["idx_r"], sg_r_ex, sh_r_ex, hg_r, hh_r, sp["lo_r"], sp["hi_r"])
                )
            active = next_active

        tree_dict = {
            "feature": t_feat,
            "threshold": t_thresh,
            "left": t_left,
            "right": t_right,
            "value": t_val,
        }
        return tree_dict, leaf_updates

    def _predict_trees_range(
        self, X_f32: NDArray[np.float32], start_t: int, end_t: int, chunk_size: int = 32768
    ) -> NDArray[np.float64]:
        n = X_f32.shape[0]
        out = np.zeros(n, dtype=np.float64)
        if start_t >= end_t or n == 0:
            return out

        trees_slice = self._compiled_trees[start_t:end_t]
        const_sum = sum(ct.const_val for ct in trees_slice if ct.depth == 0)
        if const_sum != 0.0:
            out += const_sum
        active_cts = [ct for ct in trees_slice if ct.depth > 0]
        if not active_cts:
            return out

        for c0 in range(0, n, chunk_size):
            c1 = min(n, c0 + chunk_size)
            xc = X_f32[c0:c1]
            b_len = c1 - c0
            rows = np.arange(b_len, dtype=np.int32)
            acc = out[c0:c1]
            for ct in active_cts:
                d = ct.depth
                f_arr = ct.feat
                t_arr = ct.thresh
                go_r = ~(xc[:, f_arr[1]] < t_arr[1])
                h_idx = 2 + go_r.astype(np.int32)
                if d >= 2:
                    r2 = ~(xc[:, f_arr[2]] < t_arr[2])
                    r3 = ~(xc[:, f_arr[3]] < t_arr[3])
                    go_r1 = np.where(go_r, r3, r2)
                    h_idx = (h_idx << 1) + go_r1.astype(np.int32)
                for _ in range(2, d):
                    f_u = f_arr[h_idx]
                    t_u = t_arr[h_idx]
                    go_rk = ~(xc[rows, f_u] < t_u)
                    h_idx = (h_idx << 1) + go_rk.astype(np.int32)
                acc += ct.leaf_values[h_idx - (1 << d)]
        return out

    def fit(
        self,
        X: NDArray[np.floating[Any]],
        y: NDArray[np.integer[Any] | np.floating[Any]],
        sample_weight: NDArray[np.floating[Any]] | None = None,
    ) -> HistGBDT:
        rng = np.random.default_rng(self.random_state)
        n_total = len(X)
        if n_total > self.max_train_rows:
            sub_idx = np.sort(rng.choice(n_total, size=self.max_train_rows, replace=False))
            X_f32 = np.ascontiguousarray(X[sub_idx], dtype=np.float32)
            y_f64 = np.asarray(y[sub_idx], dtype=np.float64)
            w_f64 = None if sample_weight is None else np.asarray(sample_weight[sub_idx], dtype=np.float64)
        else:
            X_f32 = np.ascontiguousarray(X, dtype=np.float32)
            y_f64 = np.asarray(y, dtype=np.float64)
            w_f64 = None if sample_weight is None else np.asarray(sample_weight, dtype=np.float64)

        n, d = X_f32.shape
        self.n_features_ = d
        self.feature_importances_gain_ = np.zeros(d, dtype=np.float64)
        self.feature_importances_split_ = np.zeros(d, dtype=np.int64)
        self.trees_ = []
        self._compiled_trees = []

        margin = self._compute_base_margin_fit(X_f32, y_f64, w_f64)
        edges_list, Xb_col = self._build_bins(X_f32, rng)

        n_feat_sub = max(1, min(d, int(round(self.colsample_bytree * d))))

        if self.use_goss and (self.goss_top_rate + self.goss_other_rate < 0.999) and n > 2000:
            Xb_row = np.ascontiguousarray(Xb_col.T)
            top_n = max(1, int(round(self.goss_top_rate * n)))
            other_n = max(1, min(n - top_n, int(round(self.goss_other_rate * n))))
            w_other = (n - top_n) / float(other_n)
            m_goss = top_n + other_n
            idx_buf = np.empty(m_goss, dtype=np.intp)

            t_done = 0
            while t_done < self.n_estimators:
                block_len = min(self.goss_refresh, self.n_estimators - t_done)
                p_all = _sigmoid(margin)
                abs_g = np.abs(p_all - y_f64)
                if w_f64 is not None:
                    abs_g = abs_g * w_f64

                part = np.argpartition(abs_g, n - top_n)
                top_idx = part[n - top_n :]
                rest_idx = part[: n - top_n]
                pick_other = rng.choice(rest_idx.size, size=other_n, replace=False)
                other_idx = rest_idx[pick_other]

                goss_idx = np.concatenate([top_idx, other_idx])
                goss_w = np.empty(m_goss, dtype=np.float64)
                goss_w[:top_n] = 1.0
                goss_w[top_n:] = w_other
                if w_f64 is not None:
                    goss_w *= w_f64[goss_idx]

                order = np.argsort(goss_idx)
                goss_idx = goss_idx[order]
                goss_w = goss_w[order]

                Xb_sub_col = np.ascontiguousarray(Xb_row[goss_idx].T)
                m_sub = margin[goss_idx].copy()
                y_sub = y_f64[goss_idx]

                start_t = len(self.trees_)
                for _ in range(block_len):
                    p_sub = _sigmoid(m_sub)
                    g_sub = (p_sub - y_sub) * goss_w
                    h_sub = np.maximum(p_sub * (1.0 - p_sub), 1e-7) * goss_w
                    feat_sub = (
                        np.arange(d, dtype=np.int32)
                        if n_feat_sub == d
                        else np.sort(rng.choice(d, size=n_feat_sub, replace=False)).astype(np.int32)
                    )
                    t_dict, leaf_ups = self._grow_one_tree(Xb_sub_col, g_sub, h_sub, edges_list, feat_sub, idx_buf)
                    self.trees_.append(t_dict)
                    self._compiled_trees.append(_CompiledTree(t_dict))
                    for s_i, lw in leaf_ups:
                        if s_i is None:
                            m_sub += lw
                        else:
                            m_sub[s_i] += lw

                t_done += block_len
                if t_done < self.n_estimators:
                    margin += self._predict_trees_range(X_f32, start_t, len(self.trees_))
                    margin[goss_idx] = m_sub
        elif self.subsample < 0.999 and n > 2000:
            Xb_row = np.ascontiguousarray(Xb_col.T)
            m_sub_n = max(100, int(round(self.subsample * n)))
            idx_buf = np.empty(m_sub_n, dtype=np.intp)
            for _ in range(self.n_estimators):
                s_idx = np.sort(rng.choice(n, size=m_sub_n, replace=False))
                Xb_sub_col = np.ascontiguousarray(Xb_row[s_idx].T)
                p_sub = _sigmoid(margin[s_idx])
                y_sub = y_f64[s_idx]
                g_sub = p_sub - y_sub
                h_sub = np.maximum(p_sub * (1.0 - p_sub), 1e-7)
                if w_f64 is not None:
                    ws = w_f64[s_idx]
                    g_sub *= ws
                    h_sub *= ws
                feat_sub = (
                    np.arange(d, dtype=np.int32)
                    if n_feat_sub == d
                    else np.sort(rng.choice(d, size=n_feat_sub, replace=False)).astype(np.int32)
                )
                t_dict, _ = self._grow_one_tree(Xb_sub_col, g_sub, h_sub, edges_list, feat_sub, idx_buf)
                self.trees_.append(t_dict)
                self._compiled_trees.append(_CompiledTree(t_dict))
                margin += self._predict_trees_range(X_f32, len(self.trees_) - 1, len(self.trees_))
        else:
            idx_buf = np.empty(n, dtype=np.intp)
            for _ in range(self.n_estimators):
                p_all = _sigmoid(margin)
                g_all = p_all - y_f64
                h_all = np.maximum(p_all * (1.0 - p_all), 1e-7)
                if w_f64 is not None:
                    g_all *= w_f64
                    h_all *= w_f64
                feat_sub = (
                    np.arange(d, dtype=np.int32)
                    if n_feat_sub == d
                    else np.sort(rng.choice(d, size=n_feat_sub, replace=False)).astype(np.int32)
                )
                t_dict, leaf_ups = self._grow_one_tree(Xb_col, g_all, h_all, edges_list, feat_sub, idx_buf)
                self.trees_.append(t_dict)
                self._compiled_trees.append(_CompiledTree(t_dict))
                for s_i, lw in leaf_ups:
                    if s_i is None:
                        margin += lw
                    else:
                        margin[s_i] += lw

        return self

    def predict_raw(self, X: NDArray[np.floating[Any]], n_trees: int | None = None) -> NDArray[np.float64]:
        if len(X) == 0:
            return np.empty(0, dtype=np.float64)
        nf = self.n_features_ if self.n_features_ > 0 else X.shape[1]
        X_f32 = np.ascontiguousarray(X[:, :nf] if X.ndim == 2 and X.shape[1] > nf else X, dtype=np.float32)
        end_t = len(self._compiled_trees) if n_trees is None else min(int(n_trees), len(self._compiled_trees))
        raw = self._compute_base_margin_infer(X_f32)
        raw += self._predict_trees_range(X_f32, 0, end_t)
        return raw

    def predict_proba(self, X: NDArray[np.floating[Any]], n_trees: int | None = None) -> NDArray[np.float64]:
        if len(X) == 0:
            return np.empty(0, dtype=np.float64)
        return _sigmoid(self.predict_raw(X, n_trees=n_trees))

    def to_dict(self) -> dict[str, Any]:
        return {
            "model_type": "HistGBDT",
            "version": 1,
            "hyperparameters": {
                "n_estimators": self.n_estimators,
                "learning_rate": self.learning_rate,
                "max_depth": self.max_depth,
                "n_bins": self.n_bins,
                "l2_reg": self.l2_reg,
                "min_child_hessian": self.min_child_hessian,
                "min_split_gain": self.min_split_gain,
                "max_delta_step": self.max_delta_step,
                "colsample_bytree": self.colsample_bytree,
                "init_feature_idx": self.init_feature_idx,
                "init_alpha": self.init_alpha,
                "use_goss": self.use_goss,
                "goss_top_rate": self.goss_top_rate,
                "goss_other_rate": self.goss_other_rate,
                "goss_refresh": self.goss_refresh,
                "subsample": self.subsample,
                "monotone_constraints": self.monotone_constraints,
                "max_bin_samples": self.max_bin_samples,
                "max_train_rows": self.max_train_rows,
                "random_state": self.random_state,
            },
            "n_features": self.n_features_,
            "init_bias": self.init_bias_,
            "init_slope": self.init_slope_,
            "feature_importances_gain": [float(v) for v in self.feature_importances_gain_],
            "feature_importances_split": [int(v) for v in self.feature_importances_split_],
            "trees": self.trees_,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> HistGBDT:
        hp = dict(data["hyperparameters"])
        hp.setdefault("max_train_rows", 3_000_000)
        obj = cls(**hp)
        obj.n_features_ = int(data["n_features"])
        obj.init_bias_ = float(data["init_bias"])
        obj.init_slope_ = float(data["init_slope"])
        obj.feature_importances_gain_ = np.asarray(data.get("feature_importances_gain", []), dtype=np.float64)
        obj.feature_importances_split_ = np.asarray(data.get("feature_importances_split", []), dtype=np.int64)
        obj.trees_ = data["trees"]
        obj._compiled_trees = [_CompiledTree(td) for td in obj.trees_]
        return obj


class HistGBDTEnsemble:
    """Weighted probability ensemble of HistGBDT classifiers with JSON/dict serialization."""

    def __init__(self, models: list[HistGBDT], weights: list[float] | None = None) -> None:
        if not models:
            raise ValueError("models must be non-empty")
        self.models = list(models)
        if weights is None:
            w = [1.0 / len(self.models)] * len(self.models)
        else:
            if len(weights) != len(self.models):
                raise ValueError("weights length must match models length")
            s = float(sum(weights))
            if s <= 0.0:
                raise ValueError("sum of weights must be positive")
            w = [float(v) / s for v in weights]
        self.weights = w

    def fit(
        self,
        X: NDArray[np.floating[Any]],
        y: NDArray[np.integer[Any] | np.floating[Any]],
        sample_weight: NDArray[np.floating[Any]] | None = None,
    ) -> HistGBDTEnsemble:
        for m in self.models:
            m.fit(X, y, sample_weight=sample_weight)
        return self

    def predict_proba(self, X: NDArray[np.floating[Any]]) -> NDArray[np.float64]:
        if len(X) == 0:
            return np.empty(0, dtype=np.float64)
        X_f32 = np.ascontiguousarray(X, dtype=np.float32)
        out = np.zeros(X_f32.shape[0], dtype=np.float64)
        for m, w in zip(self.models, self.weights):
            out += w * m.predict_proba(X_f32)
        return out

    def to_dict(self) -> dict[str, Any]:
        return {
            "model_type": "HistGBDTEnsemble",
            "version": 1,
            "weights": [float(w) for w in self.weights],
            "models": [m.to_dict() for m in self.models],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> HistGBDTEnsemble:
        models = [HistGBDT.from_dict(md) for md in data["models"]]
        weights = [float(w) for w in data["weights"]]
        return cls(models=models, weights=weights)


def make_default_single_gbdt(random_state: int = 42, max_train_rows: int = 3_000_000) -> HistGBDT:
    """Return the selected standalone HistGBDT configuration."""
    return HistGBDT(
        n_estimators=360,
        learning_rate=0.045,
        max_depth=5,
        n_bins=255,
        l2_reg=100.0,
        min_child_hessian=120.0,
        max_delta_step=2.5,
        colsample_bytree=0.72,
        init_feature_idx=1,
        init_alpha=0.30,
        use_goss=True,
        goss_top_rate=0.22,
        goss_other_rate=0.16,
        goss_refresh=10,
        max_train_rows=max_train_rows,
        random_state=random_state,
    )


def make_default_gbdt_ensemble(random_state: int = 42, max_train_rows: int = 3_000_000) -> HistGBDTEnsemble:
    """Return a diverse two-depth HistGBDTEnsemble (depth 5 + depth 6)."""
    m5 = HistGBDT(
        n_estimators=340,
        learning_rate=0.045,
        max_depth=5,
        n_bins=255,
        l2_reg=100.0,
        min_child_hessian=120.0,
        max_delta_step=2.5,
        colsample_bytree=0.72,
        init_feature_idx=1,
        init_alpha=0.30,
        use_goss=True,
        goss_top_rate=0.22,
        goss_other_rate=0.16,
        goss_refresh=10,
        max_train_rows=max_train_rows,
        random_state=random_state,
    )
    m6 = HistGBDT(
        n_estimators=260,
        learning_rate=0.042,
        max_depth=6,
        n_bins=255,
        l2_reg=140.0,
        min_child_hessian=160.0,
        max_delta_step=2.5,
        colsample_bytree=0.68,
        init_feature_idx=1,
        init_alpha=0.35,
        use_goss=True,
        goss_top_rate=0.22,
        goss_other_rate=0.16,
        goss_refresh=10,
        max_train_rows=max_train_rows,
        random_state=random_state + 100,
    )
    return HistGBDTEnsemble(models=[m5, m6], weights=[0.55, 0.45])
