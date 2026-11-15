"""Pure-numpy Total FRP Head (FRPHead) and Pixel Count Head (PixelCountHead).

Physical laws encoded:
1. Two-sensor view-angle radiative transfer:
   - VIIRS 375 m deletes bow-tie overlap on board and suffers off-nadir threshold and
     slant-path loss on small/moderate fires, scaling as (0.140625 / v_area)^gamma_v(raw_mw).
   - MODIS 1 km suffers symmetric off-nadir slant-path and sub-threshold perimeter loss
     on unsaturated fronts, scaling as max(m_area, 1.0)^gamma_m(rho, pass_mw).
2. High-radiance saturation and platform folding:
   - Partition-of-unity radiative flux density basis over [25, 120, 450, 950] MW/km2 maps
     unsaturated perimeter gain smoothly to saturated core compression, with consistent
     Suomi NPP vs NOAA-20 high-plume scaling during both fitting and prediction.
3. Convective boundary-layer (CBL) diurnal curve and clear-sky MODIS misses:
   - Afternoon CBL fire intensification peaking near 14:18 LST plus evening shoulder.
   - Nominal MODIS slots with zero in-box detections act as fire-absence evidence only
     when context detections confirm sensor swath coverage (has_ctx > 0).
4. Concentration-adaptive pixel-packing geometry (PixelCountHead):
   - Smoothly interpolates between discrete point-source overlap (v_ovl / v_cells) at low
     cell concentration sum(p^2)/sum(p) and continuous areal packing inside dense cores,
     with off-nadir MODIS footprint bloat damping and fitting-fold day/night calibration.
5. Honest out-of-fold 90% intervals:
   - Computed from inner place-grouped out-of-fold ratios (truth / inner_oof_pred) on the
     fitting folds via backend.eval.metrics.stated_interval(ratios, level=0.90).
"""

from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np
from numpy.typing import NDArray

from backend.eval import metrics as M
from backend.eval import schedule as S
from backend.eval.grid import EvalGrid, paint
from backend.eval.overpass import group_overpasses
from backend.model.challenger.guard import refuse_hidden_rows
from backend.model.platforms import scan_axis_deg

CELL_AREA_KM2: float = 0.140625


def _grouped_kfold_masks(grp: NDArray[Any], max_folds: int = 10) -> list[tuple[NDArray[np.bool_], NDArray[np.bool_]]]:
    """Deterministic place-grouped K-fold (train_mask, val_mask) pairs."""
    uniq = sorted(set(grp.tolist()))
    if len(uniq) < 2:
        return []
    k = min(max_folds, len(uniq))
    folds: list[tuple[NDArray[np.bool_], NDArray[np.bool_]]] = []
    for f in range(k):
        val_set = set(uniq[f::k])
        va = np.array([g in val_set for g in grp.tolist()], dtype=bool)
        tr = ~va
        if np.any(tr) and np.any(va):
            folds.append((tr, va))
    return folds


def summarize_prob_map(p: NDArray[np.floating[Any]]) -> NDArray[np.float64]:
    """Summarize any 1D active-cell vector or 2D cell probability grid into an 8-element vector."""
    arr = np.clip(np.asarray(p, dtype=np.float64).ravel(), 0.0, 1.0)
    if arr.size == 0:
        return np.zeros(8, dtype=np.float64)
    p2 = arr * arr
    return np.array(
        [
            float(arr.sum()),
            float(p2.sum()),
            float((p2 * arr).sum()),
            float((arr > 0.05).sum()),
            float((arr > 0.15).sum()),
            float((arr > 0.25).sum()),
            float((arr > 0.50).sum()),
            float(arr.max()),
        ],
        dtype=np.float64,
    )


def summarize_prob_maps_by_counts(
    flat_cell_prob: NDArray[np.floating[Any]],
    n_active_per_look: Sequence[int] | NDArray[np.integer[Any]],
) -> NDArray[np.float64]:
    """Slice a flat concatenated active-cell probability vector into per-look 8-element summaries."""
    counts = np.asarray(n_active_per_look, dtype=np.int64)
    offsets = np.zeros(len(counts) + 1, dtype=np.int64)
    np.cumsum(counts, out=offsets[1:])
    out = np.zeros((len(counts), 8), dtype=np.float64)
    for i in range(len(counts)):
        a, b = int(offsets[i]), int(offsets[i + 1])
        out[i] = summarize_prob_map(flat_cell_prob[a:b])
    return out


def coerce_prob_summaries(p_maps_or_summaries: Any, n_looks: int) -> NDArray[np.float64]:
    """Accept either a precomputed (N, K>=2) summary matrix or a sequence of N 1D/2D probability arrays."""
    if isinstance(p_maps_or_summaries, np.ndarray) and p_maps_or_summaries.ndim == 2 and p_maps_or_summaries.shape[0] == n_looks:
        if p_maps_or_summaries.shape[1] >= 2 and not (
            n_looks == 1 and p_maps_or_summaries.shape[1] > 16 and np.all(p_maps_or_summaries <= 1.0)
        ):
            return np.asarray(p_maps_or_summaries, dtype=np.float64)
    if n_looks == 1 and isinstance(p_maps_or_summaries, np.ndarray):
        if p_maps_or_summaries.ndim == 1 and p_maps_or_summaries.shape[0] == 8 and p_maps_or_summaries[0] >= p_maps_or_summaries[1] - 1e-9:
            if np.any(p_maps_or_summaries > 1.0) or (
                p_maps_or_summaries[3] == round(float(p_maps_or_summaries[3]))
                and p_maps_or_summaries[5] == round(float(p_maps_or_summaries[5]))
                and p_maps_or_summaries[3] >= p_maps_or_summaries[5]
            ):
                return np.asarray(p_maps_or_summaries, dtype=np.float64)[None, :]
        return summarize_prob_map(p_maps_or_summaries)[None, :]
    out = np.zeros((n_looks, 8), dtype=np.float64)
    for i, item in enumerate(p_maps_or_summaries):
        out[i] = summarize_prob_map(item)
    return out


def slot_to_dict(slot: Any, ep_idx: int = 0) -> dict[str, Any]:
    """Convert an OverpassSlot / Target or dict into a clean slot metadata dict."""
    if isinstance(slot, dict):
        return {
            "ep_idx": int(slot.get("ep_idx", ep_idx)),
            "time_s": float(slot["time_s"]),
            "platform": str(slot["platform"]),
            "is_day": bool(slot["is_day"]),
            "scan_km": float(slot["scan_km"]),
            "track_km": float(slot["track_km"]),
        }
    return {
        "ep_idx": int(ep_idx),
        "time_s": float(slot.time_s),
        "platform": str(slot.platform),
        "is_day": bool(slot.is_day),
        "scan_km": float(slot.scan_km),
        "track_km": float(slot.track_km),
    }


class VisiblePassContext:
    """Pure-visible MODIS pass and clear-sky-miss summary for one episode (zero hidden rows)."""

    def __init__(
        self,
        lon_mid: float,
        lat_mid: float,
        cell_area_km2: float,
        w_km: float,
        h_km: float,
        near_passes: list[dict[str, Any]],
        empty_noms: list[dict[str, Any]],
    ) -> None:
        self.lon_mid = float(lon_mid)
        self.lat_mid = float(lat_mid)
        self.cell_area_km2 = float(cell_area_km2)
        self.w_km = float(w_km)
        self.h_km = float(h_km)
        self.near_passes = near_passes
        self.empty_noms = empty_noms

    @classmethod
    def from_episode(cls, visible: Any, grid: EvalGrid) -> VisiblePassContext:
        """Extract pure visible-MODIS pass summaries with strict anti-leakage guard."""
        refuse_hidden_rows(visible, "VIIRS")
        vis_mod = visible.select(visible.is_modis)
        lon_mid = 0.5 * (grid.west + grid.east)
        lat_mid = 0.5 * (grid.south + grid.north)
        w_km = grid.nx * grid.cell_km
        h_km = grid.ny * grid.cell_km

        all_ops = group_overpasses(vis_mod)
        inb = vis_mod.in_box(grid.bbox)

        q1 = np.array([-0.4, -0.2, 0.0, 0.2, 0.4], dtype=np.float64)
        qu, qv = np.meshgrid(q1, q1, indexing="ij")
        qu = qu.ravel()
        qv = qv.ravel()

        passes: list[dict[str, Any]] = []
        near_passes: list[dict[str, Any]] = []
        for op in all_ops:
            idx = op.index
            lons = vis_mod.lon[idx].astype(np.float64)
            lats = vis_mod.lat[idx].astype(np.float64)
            xs, ys = grid.xy_km(lons, lats)
            xs = np.asarray(xs, dtype=np.float64)
            ys = np.asarray(ys, dtype=np.float64)
            scns = vis_mod.scan_km[idx].astype(np.float64)
            trks = vis_mod.track_km[idx].astype(np.float64)
            frps = vis_mod.frp_mw[idx].astype(np.float64)
            is_in = inb[idx].astype(bool)

            near = (xs >= -6.0) & (xs <= w_km + 6.0) & (ys >= -6.0) & (ys <= h_km + 6.0)
            lst_hr = ((float(op.time_s) % 86400.0) / 3600.0 + lon_mid / 15.0) % 24.0
            if not np.any(near) and not np.any(is_in):
                passes.append(
                    {
                        "time_s": float(op.time_s),
                        "platform": str(op.platform),
                        "is_day": bool(op.is_day),
                        "n_ctx": int(op.n),
                        "n_in": 0,
                    }
                )
                continue

            sel = near | is_in
            xs_s, ys_s = xs[sel], ys[sel]
            scns_s, trks_s = scns[sel], trks[sel]
            frps_s = frps[sel]
            in_s = is_in[sel]

            axis = scan_axis_deg(op.platform, bool(op.is_day), lat_mid)
            a_rad = math.radians(axis)
            sin_a, cos_a = math.sin(a_rad), math.cos(a_rad)

            u_pts = scns_s[:, None] * qu[None, :]
            v_pts = trks_s[:, None] * qv[None, :]
            px = xs_s[:, None] + u_pts * sin_a + v_pts * cos_a
            py = ys_s[:, None] + u_pts * cos_a - v_pts * sin_a
            inside_q = (px >= 0.0) & (px <= w_km) & (py >= 0.0) & (py <= h_km)
            in_share = inside_q.mean(axis=1)

            keep = (in_share > 0.0) | in_s
            if not np.any(keep):
                passes.append(
                    {
                        "time_s": float(op.time_s),
                        "platform": str(op.platform),
                        "is_day": bool(op.is_day),
                        "n_ctx": int(op.n),
                        "n_in": 0,
                    }
                )
                continue

            scns_k = scns_s[keep]
            trks_k = trks_s[keep]
            frps_k = frps_s[keep]
            in_k = in_s[keep]
            share_k = in_share[keep]
            ovls_k = np.maximum(1.0, trks_k)
            area_k = scns_k * trks_k
            in_orig_idx = idx[inb[idx]]
            pnt_cells = int(paint(grid, vis_mod.select(in_orig_idx)).mask.sum()) if in_orig_idx.size > 0 else 0

            p_rec = {
                "time_s": float(op.time_s),
                "platform": str(op.platform),
                "is_day": bool(op.is_day),
                "lst_hr": float(lst_hr),
                "n_ctx": int(op.n),
                "n_in": int(in_k.sum()),
                "pnt_cells": int(pnt_cells),
                "ovl": ovls_k,
                "frp": frps_k,
                "y_ded": frps_k / ovls_k,
                "area": area_k,
                "dens": frps_k / np.maximum(area_k, 1e-6),
                "is_in": in_k,
                "in_share": share_k,
            }
            passes.append(p_rec)
            near_passes.append(p_rec)

        if len(vis_mod) > 0:
            t_lo = float(vis_mod.time_s.min()) - 86400.0
            t_hi = float(vis_mod.time_s.max()) + 86400.0
            nom_slots = S.nominal_slots(("MODIS_TERRA", "MODIS_AQUA"), t_lo, t_hi, lon_mid, lat_mid)
        else:
            nom_slots = []

        box_passes = [p for p in passes if p["n_in"] > 0]
        empty_noms: list[dict[str, Any]] = []
        for ns in nom_slots:
            has_box = any(p["platform"] == ns.platform and abs(p["time_s"] - ns.time_s) <= 6000.0 for p in box_passes)
            if not has_box:
                ctx_matches = [p for p in passes if p["platform"] == ns.platform and abs(p["time_s"] - ns.time_s) <= 6000.0]
                n_ctx = max((int(p["n_ctx"]) for p in ctx_matches), default=0)
                empty_noms.append(
                    {
                        "time_s": float(ns.time_s),
                        "platform": str(ns.platform),
                        "is_day": bool(ns.is_day),
                        "has_ctx": 1.0 if n_ctx > 0 else 0.0,
                        "n_ctx": int(n_ctx),
                    }
                )

        return cls(
            lon_mid=lon_mid,
            lat_mid=lat_mid,
            cell_area_km2=grid.cell_area_km2,
            w_km=w_km,
            h_km=h_km,
            near_passes=near_passes,
            empty_noms=empty_noms,
        )

    @classmethod
    def from_raw_dict(cls, d: dict[str, Any] | VisiblePassContext) -> VisiblePassContext:
        if isinstance(d, cls):
            return d
        near_p: list[dict[str, Any]] = []
        for p in d["near_passes"]:
            near_p.append(
                {
                    "time_s": float(p["time_s"]),
                    "platform": str(p["platform"]),
                    "is_day": bool(p["is_day"]),
                    "lst_hr": float(p["lst_hr"]),
                    "n_ctx": int(p["n_ctx"]),
                    "n_in": int(p["n_in"]),
                    "pnt_cells": int(p.get("pnt_cells", 0)),
                    "ovl": np.asarray(p["ovl"], dtype=np.float64),
                    "frp": np.asarray(p["frp"], dtype=np.float64),
                    "y_ded": np.asarray(p["y_ded"], dtype=np.float64),
                    "area": np.asarray(p["area"], dtype=np.float64),
                    "dens": np.asarray(p["dens"], dtype=np.float64),
                    "is_in": np.asarray(p["is_in"], dtype=bool),
                    "in_share": np.asarray(p["in_share"], dtype=np.float64),
                }
            )
        empty_n = [
            {
                "time_s": float(e["time_s"]),
                "platform": str(e["platform"]),
                "is_day": bool(e["is_day"]),
                "has_ctx": float(e["has_ctx"]),
                "n_ctx": int(e["n_ctx"]),
            }
            for e in d["empty_noms"]
        ]
        return cls(
            lon_mid=float(d["lon_mid"]),
            lat_mid=float(d["lat_mid"]),
            cell_area_km2=float(d.get("cell_area_km2", CELL_AREA_KM2)),
            w_km=float(d.get("w_km", 0.0)),
            h_km=float(d.get("h_km", 0.0)),
            near_passes=near_p,
            empty_noms=empty_n,
        )


def _cbl_frp_diurnal(lst_hr: float, cbl_gain: float, eve_gain: float) -> float:
    dh1 = ((lst_hr - 14.3 + 12.0) % 24.0) - 12.0
    dh2 = ((lst_hr - 19.8 + 12.0) % 24.0) - 12.0
    return 1.0 + cbl_gain * math.exp(-0.5 * (dh1 / 2.4) ** 2) + eve_gain * math.exp(-0.5 * (dh2 / 2.5) ** 2)


def _clear_misses_info(empty_noms: Sequence[dict[str, Any]], t_pass: float, t_look: float) -> tuple[float, float]:
    lo_t, hi_t = min(t_pass, t_look), max(t_pass, t_look)
    m_bet = 0.0
    m_near = 0.0
    for en in empty_noms:
        if en["has_ctx"] <= 0.0:
            continue
        te = float(en["time_s"])
        dt_lk = abs(te - t_look) / 3600.0
        if dt_lk <= 2.2 and abs(t_pass - t_look) / 3600.0 > dt_lk + 0.4:
            m_near += math.exp(-0.5 * dt_lk)
        elif lo_t + 1800.0 < te < hi_t - 1800.0:
            m_bet += 1.0
    return m_bet, m_near


def _viirs_view_factor(
    v_area: float,
    platform: str,
    raw_mw: float,
    gamma_v_small: float,
    gamma_v_large: float,
    snpp_plume_mult: float,
) -> float:
    w_large = raw_mw / (raw_mw + 6000.0)
    gamma = (1.0 - w_large) * gamma_v_small + w_large * gamma_v_large
    g = (CELL_AREA_KM2 / max(v_area, 0.12)) ** gamma
    w_plume = raw_mw / (raw_mw + 8000.0)
    if platform == "VIIRS_SNPP":
        g *= 1.0 - w_plume * (1.0 - snpp_plume_mult)
    else:
        g *= 1.0 + 0.5 * w_plume * (1.0 - snpp_plume_mult)
    return float(g)


def _pass_radiative_basis(
    p: dict[str, Any],
    gamma_m_low: float,
    gamma_m_high: float,
    pass_sat_mw: float,
) -> tuple[NDArray[np.float64], float]:
    g = np.asarray(p["is_in"], dtype=np.float64)
    y_ded = np.asarray(p["y_ded"], dtype=np.float64)
    rho = np.asarray(p["dens"], dtype=np.float64)
    area = np.asarray(p["area"], dtype=np.float64)
    ovl = np.asarray(p["ovl"], dtype=np.float64)

    ded_pass = float(np.sum(y_ded * g))
    w_pix = rho / (rho + 650.0)
    if pass_sat_mw > 0.0:
        w_pass = ded_pass / (ded_pass + pass_sat_mw)
        w_sat = 1.0 - (1.0 - w_pix) * (1.0 - w_pass)
    else:
        w_sat = w_pix
    gm = (1.0 - w_sat) * gamma_m_low + w_sat * gamma_m_high
    y = y_ded * g * (np.maximum(area, 1.0) ** gm)

    e25 = np.exp(-rho / 25.0)
    e120 = np.exp(-rho / 120.0)
    e450 = np.exp(-rho / 450.0)
    e950 = np.exp(-rho / 950.0)
    b_sym = np.array(
        [
            float(np.sum(y * e25)),
            float(np.sum(y * (e120 - e25))),
            float(np.sum(y * (e450 - e120))),
            float(np.sum(y * (e950 - e450))),
            float(np.sum(y * (1.0 - e950))),
        ],
        dtype=np.float64,
    )
    nded_sym = float(np.sum(g / ovl))
    return b_sym, nded_sym


class FRPHead:
    """Pure-numpy Total FRP Head with symmetric two-sensor VZA physics and honest OOF 90% intervals."""

    def __init__(
        self,
        gamma_m_low: float = 0.35,
        gamma_m_high: float = 0.01,
        pass_sat_mw: float = 75000.0,
        gamma_v_small: float = 0.35,
        gamma_v_large: float = 0.04,
        snpp_plume_mult: float = 0.78,
        cbl_gain: float = 2.25,
        eve_gain: float = 0.55,
        dt_pow: float = 1.35,
        q_arith: float = 0.50,
        sec_window_hr: float = 4.0,
        cal_disp: float = 120000.0,
        ridge_lam: float = 3.5,
        level: float = 0.90,
        two_regime_intervals: bool = False,
    ) -> None:
        self.gamma_m_low = float(gamma_m_low)
        self.gamma_m_high = float(gamma_m_high)
        self.pass_sat_mw = float(pass_sat_mw)
        self.gamma_v_small = float(gamma_v_small)
        self.gamma_v_large = float(gamma_v_large)
        self.snpp_plume_mult = float(snpp_plume_mult)
        self.cbl_gain = float(cbl_gain)
        self.eve_gain = float(eve_gain)
        self.dt_pow = float(dt_pow)
        self.q_arith = float(q_arith)
        self.sec_window_hr = float(sec_window_hr)
        self.cal_disp = float(cal_disp)
        self.ridge_lam = float(ridge_lam)
        self.level = float(level)
        self.two_regime_intervals = bool(two_regime_intervals)

        self.coef_: NDArray[np.float64] = np.array([1.35, 1.10, 0.98, 0.76, 0.50], dtype=np.float64)
        self.scale_: float = 1.0
        self.interval_stats_: dict[str, Any] = {"lo": 0.0, "hi": 2.1, "one_sided": True, "level": self.level}
        self.clean_interval_stats_: dict[str, Any] | None = None
        self.uncertain_interval_stats_: dict[str, Any] | None = None

        self.fallback_coef_: NDArray[np.float64] = np.array([0.45, 0.35, 0.20], dtype=np.float64)
        self.fallback_scale_: float = 1.0
        self.fallback_interval_stats_: dict[str, Any] = {"lo": 0.0, "hi": 2.3, "one_sided": True, "level": self.level}

    def _prepare_vis_list(self, vis_contexts: Sequence[Any]) -> list[VisiblePassContext]:
        return [VisiblePassContext.from_raw_dict(v) for v in vis_contexts]

    def _precompute_basis_cache(self, ctx_list: list[VisiblePassContext]) -> list[list[dict[str, Any]]]:
        cache: list[list[dict[str, Any]]] = []
        for ctx in ctx_list:
            ep_cands: list[dict[str, Any]] = []
            for p in ctx.near_passes:
                b_sym, nded_sym = _pass_radiative_basis(p, self.gamma_m_low, self.gamma_m_high, self.pass_sat_mw)
                if nded_sym > 0.02:
                    ep_cands.append(
                        {
                            "time_s": float(p["time_s"]),
                            "lst_hr": float(p["lst_hr"]),
                            "b_sym": b_sym,
                            "nded_sym": nded_sym,
                        }
                    )
            cache.append(ep_cands)
        return cache

    def _fit_core_vis(
        self,
        look_x: NDArray[np.float64],
        truth_frp: NDArray[np.float64],
        ep_ids: NDArray[np.int64],
        ctx_list: list[VisiblePassContext],
        basis_cache: list[list[dict[str, Any]]],
        slots: list[dict[str, Any]],
        mask: NDArray[np.bool_],
    ) -> tuple[NDArray[np.float64], float]:
        rows_B: list[NDArray[np.float64]] = []
        rows_y: list[float] = []
        rows_w: list[float] = []
        idx_tr = np.flatnonzero(mask)

        for i in idx_tr:
            sd = slots[i]
            cands = basis_cache[sd["ep_idx"]]
            if not cands:
                continue
            t_s = sd["time_s"]
            cands_ok = [p for p in cands if p["nded_sym"] > 0.05]
            if not cands_ok:
                continue
            gaps = [abs(p["time_s"] - t_s) / 3600.0 for p in cands_ok]
            j = int(np.argmin(gaps))
            if gaps[j] <= 1.15:
                p = cands_ok[j]
                raw_sum = float(p["b_sym"].sum())
                if raw_sum <= 1.0:
                    continue
                v_area = sd["scan_km"] * sd["track_km"]
                gf = _viirs_view_factor(
                    v_area, sd["platform"], raw_sum, self.gamma_v_small, self.gamma_v_large, self.snpp_plume_mult
                )
                rows_B.append(p["b_sym"] * gf)
                rows_y.append(float(truth_frp[i]))
                rows_w.append(1.0 / (raw_sum + 3000.0))

        prior = np.array([1.35, 1.10, 0.98, 0.76, 0.50], dtype=np.float64)
        if len(rows_B) >= 5:
            BM = np.vstack(rows_B)
            yv = np.asarray(rows_y, dtype=np.float64)
            wv = np.asarray(rows_w, dtype=np.float64)
            Bw = BM * np.sqrt(wv)[:, None]
            reg = np.eye(5, dtype=np.float64) * self.ridge_lam
            R = reg * (float(np.mean(np.diag(Bw.T @ Bw))) / 20.0)
            coef = np.linalg.solve(Bw.T @ Bw + R, Bw.T @ (yv * np.sqrt(wv)) + R @ prior)
            coef = np.clip(coef, [0.50, 0.50, 0.50, 0.35, 0.25], [3.00, 2.20, 1.60, 1.35, 0.95])
        else:
            coef = prior.copy()

        raw_tr, _, _ = self._predict_raw_vis(look_x, ctx_list, basis_cache, slots, idx_tr, coef)
        num, den = 0.0, 0.0
        for e_i in sorted(set(ep_ids[idx_tr].tolist())):
            em = ep_ids[idx_tr] == e_i
            er = float(raw_tr[em].sum())
            et = float(truth_frp[idx_tr][em].sum())
            we = 1.0 / (1.0 + er / self.cal_disp)
            num += we * et
            den += we * er
        scale = num / max(den, 1e-9)
        return coef, float(scale)

    def _predict_raw_vis(
        self,
        look_x: NDArray[np.float64],
        ctx_list: list[VisiblePassContext],
        basis_cache: list[list[dict[str, Any]]],
        slots: list[dict[str, Any]],
        indices: NDArray[np.int64],
        coef: NDArray[np.float64],
    ) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
        out_raw = np.zeros(len(indices), dtype=np.float64)
        out_dt = np.full(len(indices), 24.0, dtype=np.float64)
        out_miss = np.zeros(len(indices), dtype=np.float64)

        for k_i, l_i in enumerate(indices):
            sd = slots[int(l_i)]
            ctx = ctx_list[sd["ep_idx"]]
            cands = basis_cache[sd["ep_idx"]]
            t_s = sd["time_s"]
            lst_s = ((t_s % 86400.0) / 3600.0 + ctx.lon_mid / 15.0) % 24.0
            d_tgt = _cbl_frp_diurnal(lst_s, self.cbl_gain, self.eve_gain)

            if not cands:
                out_raw[k_i] = float(look_x[l_i, 16]) * 0.4
                continue

            ctimes = np.array([p["time_s"] for p in cands], dtype=np.float64)
            ip = int(np.searchsorted(ctimes, t_s, side="right")) - 1
            in_ = int(np.searchsorted(ctimes, t_s, side="left"))

            cand_indices: list[int] = []
            if 0 <= ip < len(cands) and abs(t_s - cands[ip]["time_s"]) / 3600.0 <= 30.0:
                cand_indices.append(ip)
                if ip - 1 >= 0 and abs(cands[ip]["time_s"] - cands[ip - 1]["time_s"]) / 3600.0 <= self.sec_window_hr:
                    cand_indices.append(ip - 1)
            if 0 <= in_ < len(cands) and in_ != ip and abs(t_s - cands[in_]["time_s"]) / 3600.0 <= 30.0:
                cand_indices.append(in_)
                if in_ + 1 < len(cands) and abs(cands[in_ + 1]["time_s"] - cands[in_]["time_s"]) / 3600.0 <= self.sec_window_hr:
                    cand_indices.append(in_ + 1)

            if not cand_indices:
                out_raw[k_i] = float(look_x[l_i, 16]) * 0.3
                continue

            v_area = sd["scan_km"] * sd["track_km"]
            out_dt[k_i] = min(abs(t_s - cands[idx_c]["time_s"]) / 3600.0 for idx_c in cand_indices)
            ests: list[tuple[float, float]] = []
            miss_max = 0.0

            for idx_c in cand_indices:
                p = cands[idx_c]
                dt = abs(t_s - p["time_s"]) / 3600.0
                raw_mw = float(p["b_sym"].sum())
                gf = _viirs_view_factor(
                    v_area, sd["platform"], raw_mw, self.gamma_v_small, self.gamma_v_large, self.snpp_plume_mult
                )
                veq = float(p["b_sym"] @ coef) * gf
                d_src = _cbl_frp_diurnal(p["lst_hr"], self.cbl_gain, self.eve_gain)
                w_diurn = min(1.0, dt / 1.4)
                d_mult = float(np.clip((d_tgt / d_src) ** w_diurn, 0.25, 4.0))

                m_bet, m_near = _clear_misses_info(ctx.empty_noms, p["time_s"], t_s)
                miss_max = max(miss_max, m_bet + m_near)
                miss_decay = math.exp(-0.65 * m_bet - 0.95 * m_near)

                nded = p["nded_sym"]
                is_secondary = (idx_c == ip - 1) or (idx_c == in_ + 1)
                obs_var = 0.008 + 0.30 / max(nded, 0.35)
                var_c = obs_var + 0.16 * (dt ** self.dt_pow) + 0.55 * (m_bet + m_near) + (0.25 if is_secondary else 0.0)
                if (ip < 0 or in_ >= len(cands)) and dt > 2.0:
                    veq *= math.exp(-0.04 * (dt - 2.0))
                ests.append((veq * d_mult * miss_decay, 1.0 / var_c))

            pis = np.array([e[1] for e in ests], dtype=np.float64)
            vs = np.array([max(e[0], 1e-3) for e in ests], dtype=np.float64)
            ws = pis / pis.sum()
            m_arith = float(np.sum(ws * vs))
            m_geom = float(np.exp(np.sum(ws * np.log(vs))))
            out_raw[k_i] = self.q_arith * m_arith + (1.0 - self.q_arith) * m_geom
            out_miss[k_i] = miss_max

        return out_raw, out_dt, out_miss

    def _build_fallback_basis(self, look_x: NDArray[np.float64]) -> NDArray[np.float64]:
        v_area = np.maximum(look_x[:, 4], 0.12)
        is_snpp = look_x[:, 1] > 0.5
        missed = np.clip(look_x[:, 13], 0.0, 2.0)
        rec_frp = np.maximum(look_x[:, 16], 0.0)
        pnt_cells = np.maximum(look_x[:, 17], 0.0)
        pnt_ded_pix = np.maximum(look_x[:, 19], 0.25)
        pnt_ded_frp = np.maximum(look_x[:, 21], 0.0)
        frp_interp = np.maximum(look_x[:, 23], 0.0)

        mod_area_proxy = np.where(look_x[:, 19] > 0.1, np.clip((pnt_cells * CELL_AREA_KM2) / pnt_ded_pix, 1.0, 8.0), 1.5)
        mean_pix_frp = pnt_ded_frp / pnt_ded_pix
        w_sat = mean_pix_frp / (mean_pix_frp + 400.0)
        m_vza = mod_area_proxy ** ((1.0 - w_sat) * 0.25)

        raw_scale = 0.5 * frp_interp + 0.5 * pnt_ded_frp
        w_large = raw_scale / (raw_scale + 6000.0)
        gamma_v = (1.0 - w_large) * self.gamma_v_small + w_large * self.gamma_v_large
        v_vza = (CELL_AREA_KM2 / v_area) ** gamma_v
        w_plume = raw_scale / (raw_scale + 8000.0)
        plat_f = np.where(
            is_snpp,
            1.0 - w_plume * (1.0 - self.snpp_plume_mult),
            1.0 + 0.5 * w_plume * (1.0 - self.snpp_plume_mult),
        )
        miss_f = np.exp(-0.55 * missed)
        mult = v_vza * plat_f * miss_f

        b0 = frp_interp * m_vza * mult * (1.0 - 0.45 * w_sat)
        b1 = pnt_ded_frp * m_vza * mult * (1.0 - 0.45 * w_sat)
        b2 = rec_frp * mult
        return np.column_stack([b0, b1, b2])

    def _fit_core_fallback(
        self,
        B_fb: NDArray[np.float64],
        truth_frp: NDArray[np.float64],
        ep_ids: NDArray[np.int64],
        mask: NDArray[np.bool_],
    ) -> tuple[NDArray[np.float64], float]:
        BM = B_fb[mask]
        yv = truth_frp[mask]
        wv = 1.0 / (BM.sum(axis=1) + 2500.0)
        Bw = BM * np.sqrt(wv)[:, None]
        prior = np.array([0.50, 0.35, 0.15], dtype=np.float64)
        R = np.eye(3, dtype=np.float64) * (float(np.mean(np.diag(Bw.T @ Bw))) / 8.0 + 1e-6)
        coef = np.linalg.solve(Bw.T @ Bw + R, Bw.T @ (yv * np.sqrt(wv)) + R @ prior)
        coef = np.clip(coef, 0.02, 1.50)
        raw_tr = np.maximum(BM @ coef, 0.0)
        num, den = 0.0, 0.0
        for e_i in sorted(set(ep_ids[mask].tolist())):
            em = ep_ids[mask] == e_i
            er = float(raw_tr[em].sum())
            et = float(yv[em].sum())
            we = 1.0 / (1.0 + er / self.cal_disp)
            num += we * et
            den += we * er
        return coef, float(num / max(den, 1e-9))

    def fit(
        self,
        look_x: NDArray[np.floating[Any]],
        truth_frp: Sequence[float] | NDArray[np.floating[Any]],
        groups: Sequence[Any] | NDArray[Any],
        ep_of_look: Sequence[int] | NDArray[np.integer[Any]] | None = None,
        vis_contexts: Sequence[Any] | None = None,
        slot_infos: Sequence[Any] | None = None,
    ) -> FRPHead:
        """Fit FRPHead and calibrate strictly out-of-fold 90% intervals via inner place-grouped K-fold."""
        lx = np.asarray(look_x, dtype=np.float64)
        y = np.asarray(truth_frp, dtype=np.float64)
        grp = np.asarray(groups)
        n = len(y)

        if slot_infos is not None:
            slots = [slot_to_dict(s, ep_idx=int(ep_of_look[i]) if ep_of_look is not None else 0) for i, s in enumerate(slot_infos)]
        else:
            slots = []

        if ep_of_look is not None:
            ep_ids = np.asarray(ep_of_look, dtype=np.int64)
        elif slots:
            ep_ids = np.array([s["ep_idx"] for s in slots], dtype=np.int64)
        else:
            uniq_g = {g: idx for idx, g in enumerate(sorted(set(grp.tolist())))}
            ep_ids = np.array([uniq_g[g] for g in grp.tolist()], dtype=np.int64)

        all_mask = np.ones(n, dtype=bool)
        folds = _grouped_kfold_masks(grp, max_folds=10)

        B_fb = self._build_fallback_basis(lx)
        self.fallback_coef_, self.fallback_scale_ = self._fit_core_fallback(B_fb, y, ep_ids, all_mask)
        if folds:
            fb_oof = np.zeros(n, dtype=np.float64)
            for itr, iva in folds:
                c_i, s_i = self._fit_core_fallback(B_fb, y, ep_ids, itr)
                fb_oof[iva] = np.maximum(B_fb[iva] @ c_i, 0.0) * s_i
        else:
            fb_oof = np.maximum(B_fb @ self.fallback_coef_, 0.0) * self.fallback_scale_
        m_fb = fb_oof > 0.0
        iv_fb = M.stated_interval((y[m_fb] / fb_oof[m_fb]).tolist(), self.level) if np.any(m_fb) else None
        if iv_fb is not None:
            self.fallback_interval_stats_ = iv_fb

        if vis_contexts is not None and len(slots) == n:
            ctx_list = self._prepare_vis_list(vis_contexts)
            basis_cache = self._precompute_basis_cache(ctx_list)
            self.coef_, self.scale_ = self._fit_core_vis(lx, y, ep_ids, ctx_list, basis_cache, slots, all_mask)

            inner_oof = np.zeros(n, dtype=np.float64)
            inner_dt = np.full(n, 24.0, dtype=np.float64)
            inner_miss = np.zeros(n, dtype=np.float64)
            if folds:
                for itr, iva in folds:
                    iva_idx = np.flatnonzero(iva)
                    c_i, s_i = self._fit_core_vis(lx, y, ep_ids, ctx_list, basis_cache, slots, itr)
                    r_va, dt_va, ms_va = self._predict_raw_vis(lx, ctx_list, basis_cache, slots, iva_idx, c_i)
                    inner_oof[iva_idx] = np.maximum(r_va * s_i, 0.0)
                    inner_dt[iva_idx] = dt_va
                    inner_miss[iva_idx] = ms_va
            else:
                all_idx = np.arange(n, dtype=np.int64)
                r_all, inner_dt, inner_miss = self._predict_raw_vis(lx, ctx_list, basis_cache, slots, all_idx, self.coef_)
                inner_oof = np.maximum(r_all * self.scale_, 0.0)

            pos_m = inner_oof > 0.0
            iv_main = M.stated_interval((y[pos_m] / inner_oof[pos_m]).tolist(), self.level) if np.any(pos_m) else None
            if iv_main is not None:
                self.interval_stats_ = iv_main

            clean_m = (inner_oof >= 350.0) & (inner_dt <= 1.5) & (inner_miss <= 0.05)
            unc_m = pos_m & (~clean_m)
            if int(clean_m.sum()) >= 15 and int(unc_m.sum()) >= 15:
                self.clean_interval_stats_ = M.stated_interval((y[clean_m] / inner_oof[clean_m]).tolist(), self.level)
                self.uncertain_interval_stats_ = M.stated_interval((y[unc_m] / inner_oof[unc_m]).tolist(), self.level)
        else:
            self.interval_stats_ = dict(self.fallback_interval_stats_)

        return self

    def predict(
        self,
        look_x: NDArray[np.floating[Any]],
        vis_contexts: Sequence[Any] | VisiblePassContext | dict[str, Any] | None = None,
        slot_infos: Sequence[Any] | Any | None = None,
    ) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
        lx_in = np.asarray(look_x, dtype=np.float64)
        single = lx_in.ndim == 1
        lx = lx_in[None, :] if single else lx_in
        n = lx.shape[0]

        if vis_contexts is not None and slot_infos is not None:
            if isinstance(vis_contexts, (VisiblePassContext, dict)):
                ctx_list = [VisiblePassContext.from_raw_dict(vis_contexts)]
                raw_slots = [slot_to_dict(slot_infos, ep_idx=0)] if single else [slot_to_dict(s, ep_idx=0) for s in slot_infos]
                slots = [{**s, "ep_idx": 0} for s in raw_slots]
            else:
                ctx_list = self._prepare_vis_list(vis_contexts)
                slots = [slot_to_dict(slot_infos, ep_idx=0)] if single else [slot_to_dict(s) for s in slot_infos]

            basis_cache = self._precompute_basis_cache(ctx_list)
            idx_all = np.arange(n, dtype=np.int64)
            raw, dt_v, miss_v = self._predict_raw_vis(lx, ctx_list, basis_cache, slots, idx_all, self.coef_)
            pred = np.maximum(raw * self.scale_, 0.0)

            if self.two_regime_intervals and self.clean_interval_stats_ is not None and self.uncertain_interval_stats_ is not None:
                is_clean = (pred >= 350.0) & (dt_v <= 1.5) & (miss_v <= 0.05)
                lo = np.where(
                    pred <= 0.0,
                    0.0,
                    np.where(is_clean, self.clean_interval_stats_["lo"] * pred, self.uncertain_interval_stats_["lo"] * pred),
                )
                hi = np.where(
                    pred <= 0.0,
                    0.0,
                    np.where(is_clean, self.clean_interval_stats_["hi"] * pred, self.uncertain_interval_stats_["hi"] * pred),
                )
            else:
                lo = np.where(pred > 0.0, float(self.interval_stats_["lo"]) * pred, 0.0)
                hi = np.where(pred > 0.0, float(self.interval_stats_["hi"]) * pred, 0.0)
        else:
            B_fb = self._build_fallback_basis(lx)
            pred = np.maximum(B_fb @ self.fallback_coef_, 0.0) * self.fallback_scale_
            lo = np.where(pred > 0.0, float(self.fallback_interval_stats_["lo"]) * pred, 0.0)
            hi = np.where(pred > 0.0, float(self.fallback_interval_stats_["hi"]) * pred, 0.0)

        return pred, lo, hi

    def predict_one(
        self,
        look_x_row: NDArray[np.floating[Any]],
        vis_context: VisiblePassContext | dict[str, Any] | None = None,
        target_slot: Any | None = None,
    ) -> tuple[float, float, float]:
        p, lo, hi = self.predict(np.asarray(look_x_row, dtype=np.float64).ravel(), vis_contexts=vis_context, slot_infos=target_slot)
        return float(p[0]), float(lo[0]), float(hi[0])

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": 1,
            "params": {
                "gamma_m_low": self.gamma_m_low,
                "gamma_m_high": self.gamma_m_high,
                "pass_sat_mw": self.pass_sat_mw,
                "gamma_v_small": self.gamma_v_small,
                "gamma_v_large": self.gamma_v_large,
                "snpp_plume_mult": self.snpp_plume_mult,
                "cbl_gain": self.cbl_gain,
                "eve_gain": self.eve_gain,
                "dt_pow": self.dt_pow,
                "q_arith": self.q_arith,
                "sec_window_hr": self.sec_window_hr,
                "cal_disp": self.cal_disp,
                "ridge_lam": self.ridge_lam,
                "level": self.level,
                "two_regime_intervals": self.two_regime_intervals,
            },
            "coef": self.coef_.tolist(),
            "scale": float(self.scale_),
            "interval_stats": dict(self.interval_stats_),
            "clean_interval_stats": None if self.clean_interval_stats_ is None else dict(self.clean_interval_stats_),
            "uncertain_interval_stats": None if self.uncertain_interval_stats_ is None else dict(self.uncertain_interval_stats_),
            "fallback_coef": self.fallback_coef_.tolist(),
            "fallback_scale": float(self.fallback_scale_),
            "fallback_interval_stats": dict(self.fallback_interval_stats_),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FRPHead:
        obj = cls(**data["params"])
        obj.coef_ = np.asarray(data["coef"], dtype=np.float64)
        obj.scale_ = float(data["scale"])
        obj.interval_stats_ = dict(data["interval_stats"])
        obj.clean_interval_stats_ = None if data.get("clean_interval_stats") is None else dict(data["clean_interval_stats"])
        obj.uncertain_interval_stats_ = None if data.get("uncertain_interval_stats") is None else dict(data["uncertain_interval_stats"])
        obj.fallback_coef_ = np.asarray(data["fallback_coef"], dtype=np.float64)
        obj.fallback_scale_ = float(data["fallback_scale"])
        obj.fallback_interval_stats_ = dict(data["fallback_interval_stats"])
        return obj


class PixelCountHead:
    """Pure-numpy Pixel Count Head accepting any calibrated cell probability map + look_x."""

    def __init__(
        self,
        alpha_min: float = 0.20,
        alpha_slope: float = 0.75,
        alpha_max: float = 0.85,
        bloat_k: float = 0.14,
        miss_decay_k: float = 0.30,
        temp_disp: float = 12000.0,
        level: float = 0.90,
        two_regime_intervals: bool = False,
    ) -> None:
        self.alpha_min = float(alpha_min)
        self.alpha_slope = float(alpha_slope)
        self.alpha_max = float(alpha_max)
        self.bloat_k = float(bloat_k)
        self.miss_decay_k = float(miss_decay_k)
        self.temp_disp = float(temp_disp)
        self.level = float(level)
        self.two_regime_intervals = bool(two_regime_intervals)

        self.scale_day_: float = 1.0
        self.scale_night_: float = 1.0
        self.interval_stats_: dict[str, Any] = {"lo": 0.0, "hi": 2.0, "one_sided": True, "level": self.level}
        self.clean_interval_stats_: dict[str, Any] | None = None
        self.uncertain_interval_stats_: dict[str, Any] | None = None

    def _compute_raw(
        self,
        p_sum_mat: NDArray[np.float64],
        look_x: NDArray[np.float64],
        vis_contexts: Sequence[Any] | VisiblePassContext | dict[str, Any] | None = None,
        slot_infos: Sequence[Any] | Any | None = None,
    ) -> NDArray[np.float64]:
        n = look_x.shape[0]
        sp = np.maximum(p_sum_mat[:, 0], 0.0)
        sp2 = np.clip(p_sum_mat[:, 1], 0.0, sp)

        v_area = np.maximum(look_x[:, 4], 0.12)
        v_ovl = np.maximum(look_x[:, 5], 1.0)
        v_cells = np.maximum(look_x[:, 6], 1.0)
        rec_p_sum = np.maximum(look_x[:, 14], 0.0)
        pnt_cells = np.maximum(look_x[:, 17], 0.0)
        pnt_pix_ded = look_x[:, 19]

        conc = sp2 / np.maximum(sp, 0.5)
        alpha_dyn = np.clip(self.alpha_min + self.alpha_slope * conc, self.alpha_min, self.alpha_max)
        geom_dyn = v_ovl * ((1.0 - alpha_dyn) / v_cells + alpha_dyn * (CELL_AREA_KM2 / v_area))

        if vis_contexts is not None and slot_infos is not None:
            if isinstance(vis_contexts, (VisiblePassContext, dict)):
                ctx_list = [VisiblePassContext.from_raw_dict(vis_contexts)]
                raw_slots = [slot_to_dict(slot_infos, ep_idx=0)] if n == 1 else [slot_to_dict(s, ep_idx=0) for s in slot_infos]
                slots = [{**s, "ep_idx": 0} for s in raw_slots]
            else:
                ctx_list = [VisiblePassContext.from_raw_dict(v) for v in vis_contexts]
                slots = [slot_to_dict(slot_infos, ep_idx=0)] if n == 1 else [slot_to_dict(s) for s in slot_infos]

            mod_area = np.ones(n, dtype=np.float64)
            clr_miss = np.zeros(n, dtype=np.float64)
            for i in range(n):
                sd = slots[i]
                ctx = ctx_list[sd["ep_idx"]]
                t_s = sd["time_s"]
                cands = [p for p in ctx.near_passes if p["n_in"] > 0]
                if cands:
                    gaps = [abs(float(p["time_s"]) - t_s) / 3600.0 for p in cands]
                    j = int(np.argmin(gaps))
                    in_mask = np.asarray(cands[j]["is_in"], dtype=bool)
                    mod_area[i] = float(np.asarray(cands[j]["area"], dtype=np.float64)[in_mask].mean())
                    dt_best = gaps[j]
                else:
                    dt_best = 24.0
                for en in ctx.empty_noms:
                    if en["has_ctx"] > 0.0:
                        dt_e = abs(float(en["time_s"]) - t_s) / 3600.0
                        if dt_e <= 2.2 and dt_best > dt_e + 0.4:
                            clr_miss[i] += math.exp(-0.5 * dt_e)
        else:
            mod_area = np.where(
                pnt_pix_ded > 0.1,
                (pnt_cells * CELL_AREA_KM2) / np.maximum(pnt_pix_ded, 0.25),
                1.5,
            )
            clr_miss = np.zeros(n, dtype=np.float64)

        esp = np.where(
            sp > rec_p_sum,
            rec_p_sum + (sp - rec_p_sum) / (1.0 + self.bloat_k * np.maximum(0.0, mod_area - 2.0)),
            sp,
        )
        miss_mult = np.exp(-self.miss_decay_k * np.minimum(clr_miss, 2.0))
        return np.maximum(esp * geom_dyn * miss_mult, 0.0)

    def _fit_scales(
        self,
        raw: NDArray[np.float64],
        is_day: NDArray[np.bool_],
        truth_pix: NDArray[np.float64],
        mask: NDArray[np.bool_],
    ) -> tuple[float, float]:
        scales: dict[bool, float] = {}
        for d in (True, False):
            m = mask & (is_day == d)
            if int(m.sum()) == 0 or float(raw[m].sum()) <= 1e-9:
                scales[d] = 1.0
            else:
                wt = 1.0 / (1.0 + raw[m] / self.temp_disp)
                scales[d] = float(np.sum(wt * truth_pix[m])) / max(float(np.sum(wt * raw[m])), 1e-9)
        return scales[True], scales[False]

    def fit(
        self,
        p_maps_or_summaries: Any,
        look_x: NDArray[np.floating[Any]],
        truth_pix: Sequence[float] | NDArray[np.floating[Any]],
        groups: Sequence[Any] | NDArray[Any],
        vis_contexts: Sequence[Any] | None = None,
        slot_infos: Sequence[Any] | None = None,
    ) -> PixelCountHead:
        lx = np.asarray(look_x, dtype=np.float64)
        y = np.asarray(truth_pix, dtype=np.float64)
        grp = np.asarray(groups)
        n = len(y)

        p_mat = coerce_prob_summaries(p_maps_or_summaries, n)
        raw = self._compute_raw(p_mat, lx, vis_contexts=vis_contexts, slot_infos=slot_infos)
        is_day = lx[:, 0] > 0.5
        dt_near = np.minimum(lx[:, 8], lx[:, 11])

        all_mask = np.ones(n, dtype=bool)
        self.scale_day_, self.scale_night_ = self._fit_scales(raw, is_day, y, all_mask)

        folds = _grouped_kfold_masks(grp, max_folds=10)
        inner_oof = np.zeros(n, dtype=np.float64)
        if folds:
            for itr, iva in folds:
                sd_i, sn_i = self._fit_scales(raw, is_day, y, itr)
                inner_oof[iva & is_day] = raw[iva & is_day] * sd_i
                inner_oof[iva & (~is_day)] = raw[iva & (~is_day)] * sn_i
        else:
            inner_oof = np.where(is_day, raw * self.scale_day_, raw * self.scale_night_)

        pos_m = inner_oof > 0.0
        iv_main = M.stated_interval((y[pos_m] / inner_oof[pos_m]).tolist(), self.level) if np.any(pos_m) else None
        if iv_main is not None:
            self.interval_stats_ = iv_main

        clean_m = (inner_oof >= 15.0) & (dt_near <= 1.5)
        unc_m = pos_m & (~clean_m)
        if int(clean_m.sum()) >= 15 and int(unc_m.sum()) >= 15:
            self.clean_interval_stats_ = M.stated_interval((y[clean_m] / inner_oof[clean_m]).tolist(), self.level)
            self.uncertain_interval_stats_ = M.stated_interval((y[unc_m] / inner_oof[unc_m]).tolist(), self.level)

        return self

    def predict(
        self,
        p_maps_or_summaries: Any,
        look_x: NDArray[np.floating[Any]],
        vis_contexts: Sequence[Any] | VisiblePassContext | dict[str, Any] | None = None,
        slot_infos: Sequence[Any] | Any | None = None,
    ) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
        lx_in = np.asarray(look_x, dtype=np.float64)
        single = lx_in.ndim == 1
        lx = lx_in[None, :] if single else lx_in
        n = lx.shape[0]

        p_mat = coerce_prob_summaries(p_maps_or_summaries, n)
        raw = self._compute_raw(p_mat, lx, vis_contexts=vis_contexts, slot_infos=slot_infos)
        is_day = lx[:, 0] > 0.5
        dt_near = np.minimum(lx[:, 8], lx[:, 11])
        pred = np.where(is_day, raw * self.scale_day_, raw * self.scale_night_)

        if self.two_regime_intervals and self.clean_interval_stats_ is not None and self.uncertain_interval_stats_ is not None:
            is_clean = (pred >= 15.0) & (dt_near <= 1.5)
            lo = np.where(
                pred <= 0.0,
                0.0,
                np.where(is_clean, self.clean_interval_stats_["lo"] * pred, self.uncertain_interval_stats_["lo"] * pred),
            )
            hi = np.where(
                pred <= 0.0,
                0.0,
                np.where(is_clean, self.clean_interval_stats_["hi"] * pred, self.uncertain_interval_stats_["hi"] * pred),
            )
        else:
            lo = np.where(pred > 0.0, float(self.interval_stats_["lo"]) * pred, 0.0)
            hi = np.where(pred > 0.0, float(self.interval_stats_["hi"]) * pred, 0.0)

        return pred, lo, hi

    def predict_one(
        self,
        p_map_or_summary: Any,
        look_x_row: NDArray[np.floating[Any]],
        vis_context: VisiblePassContext | dict[str, Any] | None = None,
        target_slot: Any | None = None,
    ) -> tuple[float, float, float]:
        p, lo, hi = self.predict(
            p_map_or_summary,
            np.asarray(look_x_row, dtype=np.float64).ravel(),
            vis_contexts=vis_context,
            slot_infos=target_slot,
        )
        return float(p[0]), float(lo[0]), float(hi[0])

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": 1,
            "params": {
                "alpha_min": self.alpha_min,
                "alpha_slope": self.alpha_slope,
                "alpha_max": self.alpha_max,
                "bloat_k": self.bloat_k,
                "miss_decay_k": self.miss_decay_k,
                "temp_disp": self.temp_disp,
                "level": self.level,
                "two_regime_intervals": self.two_regime_intervals,
            },
            "scale_day": float(self.scale_day_),
            "scale_night": float(self.scale_night_),
            "interval_stats": dict(self.interval_stats_),
            "clean_interval_stats": None if self.clean_interval_stats_ is None else dict(self.clean_interval_stats_),
            "uncertain_interval_stats": None if self.uncertain_interval_stats_ is None else dict(self.uncertain_interval_stats_),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PixelCountHead:
        obj = cls(**data["params"])
        obj.scale_day_ = float(data["scale_day"])
        obj.scale_night_ = float(data["scale_night"])
        obj.interval_stats_ = dict(data["interval_stats"])
        obj.clean_interval_stats_ = None if data.get("clean_interval_stats") is None else dict(data["clean_interval_stats"])
        obj.uncertain_interval_stats_ = None if data.get("uncertain_interval_stats") is None else dict(data["uncertain_interval_stats"])
        return obj
