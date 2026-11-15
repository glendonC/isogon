"""Vectorized spatial and look-level feature extraction from visible coarse rows.

All features are built strictly from visible coarse detections, the evaluation
grid, the scheduled target slot, and optional offline-cached DEM tiles.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.eval import schedule as S
from backend.eval.blind_test import Target
from backend.eval.grid import EvalGrid, dilate, footprint_cells, paint
from backend.eval.overpass import Overpass, group_overpasses
from backend.eval.rows import Detections
from backend.model.challenger.guard import refuse_hidden_rows
from backend.model.challenger.terrain_features import GridTerrain, load_grid_terrain
from backend.model.fitted import FITTED_DIR, PARAMS_FILE
from backend.model.occupancy import (
    OccupancyParams,
    OccupancyReconstruction,
    diurnal_factor,
    overlap_factor,
)
from backend.model.platforms import PLATFORMS, scan_axis_deg

CELL_FEATURE_NAMES: tuple[str, ...] = (
    "rec_p",
    "rec_logit",
    "rec_p_blur3",
    "rec_a",
    "rec_warm",
    "rec_log_frp",
    "pnt_in",
    "pnt_interior",
    "pnt_ring1",
    "near_psf",
    "near_center",
    "near_log_frp_dedup",
    "near_pix_log_frp",
    "near_ncover",
    "near_blur3",
    "near_blur7",
    "near_psf_blur5",
    "target_box_rec_a",
    "target_box_near_psf",
    "target_box_pnt",
    "bridge_psf",
    "bracket_persist",
    "past_fast",
    "past_slow",
    "fut_fast",
    "fut_slow",
    "spill_in",
    "is_day",
    "log_dt_nearest",
    "co_timed_in",
    "co_timed_psf",
    "target_area_ratio",
    "missed_modis_decay",
    "terrain_slope",
    "terrain_upslope",
)

LOOK_FEATURE_NAMES: tuple[str, ...] = (
    "is_day",
    "is_snpp",
    "is_noaa20",
    "is_noaa21",
    "target_area_km2",
    "target_ovl",
    "v_cells",
    "log_dt_nearest",
    "is_co_timed",
    "has_both_sides",
    "diurnal_ratio_nearest",
    "missed_prev",
    "missed_prev_clear",
    "missed_next",
    "rec_p_sum",
    "rec_p_sq_sum",
    "rec_frp",
    "pnt_cells",
    "pnt_pix_raw",
    "pnt_pix_dedup",
    "pnt_frp_raw",
    "pnt_frp_dedup",
    "veq_interp_120",
    "veq_nearest_120",
    "pix_dedup_interp",
)


def _default_occupancy_params() -> OccupancyParams:
    path = FITTED_DIR / PARAMS_FILE
    if path.is_file():
        doc = json.loads(path.read_text(encoding="utf-8"))
        known = set(OccupancyParams.__dataclass_fields__)
        return OccupancyParams(**{k: v for k, v in doc["parameters"].items() if k in known})
    return OccupancyParams()


def lst_hours(time_s: float, lon_deg: float) -> float:
    """Local solar time in hours [0, 24)."""
    return ((time_s % 86400.0) / 3600.0 + lon_deg / 15.0) % 24.0


def box_mean_2d(field: NDArray[np.float64], r_rad: int, c_rad: int) -> NDArray[np.float64]:
    """Fast 2D window mean with zero padding via summed-area table."""
    if r_rad <= 0 and c_rad <= 0:
        return field.copy()
    ny, nx = field.shape
    h = 2 * r_rad + 1
    w = 2 * c_rad + 1
    pad = np.pad(field, ((r_rad + 1, r_rad), (c_rad + 1, c_rad)), mode="constant", constant_values=0.0)
    cs = pad.cumsum(axis=0).cumsum(axis=1)
    tot = cs[h : h + ny, w : w + nx] - cs[:ny, w : w + nx] - cs[h : h + ny, :nx] + cs[:ny, :nx]
    return tot / float(h * w)


def gaussian_deposit_2d(
    shape: tuple[int, int],
    cell_km: float,
    xs_km: NDArray[np.float64],
    ys_km: NDArray[np.float64],
    weights: NDArray[np.float64],
    sigma_km: float,
) -> NDArray[np.float64]:
    """Deposit weighted isotropic Gaussians at local plane (x_km, y_km) onto grid."""
    out = np.zeros(shape, dtype=np.float64)
    if xs_km.size == 0:
        return out
    ny, nx = shape
    reach = max(1, int(math.ceil(2.6 * sigma_km / cell_km)))
    inv2s2 = 0.5 / max(sigma_km * sigma_km, 1e-6)
    cols = np.floor(xs_km / cell_km).astype(np.int64)
    rows = (ny - 1 - np.floor(ys_km / cell_km)).astype(np.int64)
    for i in range(xs_km.size):
        r0, c0 = int(rows[i]), int(cols[i])
        if r0 < -reach or r0 >= ny + reach or c0 < -reach or c0 >= nx + reach:
            continue
        r_lo, r_hi = max(0, r0 - reach), min(ny - 1, r0 + reach)
        c_lo, c_hi = max(0, c0 - reach), min(nx - 1, c0 + reach)
        if r_lo > r_hi or c_lo > c_hi:
            continue
        rr = np.arange(r_lo, r_hi + 1, dtype=np.float64)[:, None]
        cc = np.arange(c_lo, c_hi + 1, dtype=np.float64)[None, :]
        dx = (cc + 0.5) * cell_km - float(xs_km[i])
        dy = (ny - rr - 0.5) * cell_km - float(ys_km[i])
        out[r_lo : r_hi + 1, c_lo : c_hi + 1] += float(weights[i]) * np.exp(-(dx * dx + dy * dy) * inv2s2)
    return out


def avg_target_cells(grid: EvalGrid, scan_km: float, track_km: float, platform: str, is_day: bool) -> float:
    """Mean number of 375 m cells covered by one pixel of target geometry."""
    lon_mid = 0.5 * (grid.west + grid.east)
    lat_mid = 0.5 * (grid.south + grid.north)
    axis = scan_axis_deg(platform, is_day, lat_mid)
    d_lon = grid.cell_km / grid.km_per_deg_lon
    d_lat = grid.cell_km / grid.km_per_deg_lat
    counts = []
    for ox in (-0.33, 0.0, 0.33):
        for oy in (-0.33, 0.0, 0.33):
            r, _ = footprint_cells(grid, lon_mid + ox * d_lon, lat_mid + oy * d_lat, scan_km, track_km, axis)
            counts.append(max(1, int(r.size)))
    return float(np.mean(counts))


@dataclass(frozen=True)
class PrecomputedPass:
    """Raster and summary fields for one visible coarse overpass near the grid."""

    time_s: float
    platform: str
    is_day: bool
    lst_hr: float
    in_box_mask: NDArray[np.bool_]
    spill_mask: NDArray[np.bool_]
    psf: NDArray[np.float64]
    center_prox: NDArray[np.float64]
    frp_dedup_cell: NDArray[np.float64]
    pix_log_frp: NDArray[np.float64]
    n_cover: NDArray[np.float64]
    n_raw_in: float
    n_dedup_in: float
    frp_raw_in: float
    frp_dedup_in: float
    y_dedup_in: NDArray[np.float64]
    xs_km: NDArray[np.float64]
    ys_km: NDArray[np.float64]
    pix_weights: NDArray[np.float64]


def _build_pass(grid: EvalGrid, det: Detections, op: Overpass, lon_mid: float) -> PrecomputedPass | None:
    shape = grid.shape
    ny, nx = shape
    in_box_mask = np.zeros(shape, dtype=bool)
    spill_mask = np.zeros(shape, dtype=bool)
    psf = np.zeros(shape, dtype=np.float64)
    center_prox = np.zeros(shape, dtype=np.float64)
    frp_dedup_cell = np.zeros(shape, dtype=np.float64)
    pix_log_frp = np.zeros(shape, dtype=np.float64)
    n_cover = np.zeros(shape, dtype=np.float64)

    inb = det.in_box(grid.bbox)
    y_dedup_list: list[float] = []
    n_raw_in = 0.0
    n_dedup_in = 0.0
    frp_raw_in = 0.0
    frp_dedup_in = 0.0
    xs_list: list[float] = []
    ys_list: list[float] = []
    w_list: list[float] = []
    any_touched = False

    w_km = nx * grid.cell_km
    h_km = ny * grid.cell_km

    for idx in op.index:
        lon = float(det.lon[idx])
        lat = float(det.lat[idx])
        x0_arr, y0_arr = grid.xy_km(lon, lat)
        x0, y0 = float(x0_arr), float(y0_arr)
        scan_km = float(det.scan_km[idx])
        track_km = float(det.track_km[idx])
        half_diag = 0.75 * math.hypot(scan_km, track_km) + grid.cell_km
        if x0 < -half_diag or x0 > w_km + half_diag or y0 < -half_diag or y0 > h_km + half_diag:
            continue

        ovl = overlap_factor("MODIS", track_km)
        frp = float(det.frp_mw[idx])
        y_ded = frp / ovl
        conf_raw = float(det.confidence[idx])
        conf = (conf_raw / 100.0) if np.isfinite(conf_raw) else 0.65
        conf_w = 0.55 + 0.45 * np.clip(conf, 0.0, 1.0)

        is_inside = bool(inb[idx])
        if is_inside:
            n_raw_in += 1.0
            n_dedup_in += 1.0 / ovl
            frp_raw_in += frp
            frp_dedup_in += y_ded
            y_dedup_list.append(y_ded)

        pname = PLATFORMS[int(det.platform_code[idx])]
        axis = scan_axis_deg(pname, bool(det.is_day[idx]), lat)
        a_rad = math.radians(axis)
        sin_a, cos_a = math.sin(a_rad), math.cos(a_rad)

        reach = int(math.ceil(half_diag / grid.cell_km)) + 1
        c0 = int(math.floor(x0 / grid.cell_km))
        r0 = int(ny - 1 - math.floor(y0 / grid.cell_km))
        r_lo, r_hi = max(0, r0 - reach), min(ny - 1, r0 + reach)
        c_lo, c_hi = max(0, c0 - reach), min(nx - 1, c0 + reach)
        if r_lo > r_hi or c_lo > c_hi:
            continue

        any_touched = True
        xs_list.append(x0)
        ys_list.append(y0)
        w_list.append(conf_w * math.log1p(max(y_ded, 0.5)) / math.log(20.0))

        rr, cc = np.meshgrid(
            np.arange(r_lo, r_hi + 1, dtype=np.int64),
            np.arange(c_lo, c_hi + 1, dtype=np.int64),
            indexing="ij",
        )
        dx = (cc + 0.5) * grid.cell_km - x0
        dy = (ny - rr - 0.5) * grid.cell_km - y0
        u = dx * sin_a + dy * cos_a
        v = dx * cos_a - dy * sin_a

        hs = max(0.5 * scan_km, 0.18)
        ht = max(0.5 * track_km, 0.18)
        un = u / hs
        vn = v / ht
        prox = np.exp(-1.1 * (un * un + vn * vn))
        sub_prox = center_prox[r_lo : r_hi + 1, c_lo : c_hi + 1]
        np.maximum(sub_prox, prox, out=sub_prox)

        inside_fp = (np.abs(u) <= 0.5 * scan_km + 1e-9) & (np.abs(v) <= 0.5 * track_km + 1e-9)
        if 0 <= r0 < ny and 0 <= c0 < nx:
            inside_fp |= (rr == r0) & (cc == c0)
        if not np.any(inside_fp):
            continue

        fp_r = rr[inside_fp]
        fp_c = cc[inside_fp]
        if is_inside:
            in_box_mask[fp_r, fp_c] = True
            n_cover[fp_r, fp_c] += 1.0
        else:
            spill_mask[fp_r, fp_c] = True

        # Sub-pixel tent-Gaussian PSF peaking at pixel centre
        kern = np.clip(1.0 - 0.55 * (un[inside_fp] ** 2), 0.25, 1.0) * np.clip(
            1.0 - 0.45 * (vn[inside_fp] ** 2), 0.30, 1.0
        )
        amp = conf_w * (0.45 + 0.55 * min(1.5, math.log1p(max(y_ded, 0.0)) / 4.0))
        psf[fp_r, fp_c] += amp * kern
        k_sum = float(kern.sum())
        share = kern / k_sum if k_sum > 0.0 else np.full(fp_r.size, 1.0 / fp_r.size)
        np.maximum.at(pix_log_frp, (fp_r, fp_c), math.log1p(max(y_ded, 0.0)))
        if is_inside:
            frp_dedup_cell[fp_r, fp_c] += y_ded * share

    if not any_touched:
        return None

    return PrecomputedPass(
        time_s=op.time_s,
        platform=op.platform,
        is_day=bool(op.is_day),
        lst_hr=lst_hours(op.time_s, lon_mid),
        in_box_mask=in_box_mask,
        spill_mask=spill_mask,
        psf=psf,
        center_prox=center_prox,
        frp_dedup_cell=frp_dedup_cell,
        pix_log_frp=pix_log_frp,
        n_cover=n_cover,
        n_raw_in=n_raw_in,
        n_dedup_in=n_dedup_in,
        frp_raw_in=frp_raw_in,
        frp_dedup_in=frp_dedup_in,
        y_dedup_in=np.asarray(y_dedup_list, dtype=np.float64),
        xs_km=np.asarray(xs_list, dtype=np.float64),
        ys_km=np.asarray(ys_list, dtype=np.float64),
        pix_weights=np.asarray(w_list, dtype=np.float64),
    )


def _lagrangian_bridge(
    grid: EvalGrid, p0: PrecomputedPass, p1: PrecomputedPass, time_s: float
) -> NDArray[np.float64]:
    """Interpolate active fire positions between p0 and p1 at time_s."""
    dt_tot_h = (p1.time_s - p0.time_s) / 3600.0
    if dt_tot_h <= 0.05 or dt_tot_h > 30.0 or p0.xs_km.size == 0 or p1.xs_km.size == 0:
        return np.zeros(grid.shape, dtype=np.float64)
    alpha = float(np.clip((time_s - p0.time_s) / max(p1.time_s - p0.time_s, 1.0), 0.0, 1.0))
    max_travel_km = min(8.0, 0.65 * dt_tot_h + 1.5)

    xs_out: list[float] = []
    ys_out: list[float] = []
    ws_out: list[float] = []

    # Match p0 -> nearest in p1
    dx01 = p1.xs_km[None, :] - p0.xs_km[:, None]
    dy01 = p1.ys_km[None, :] - p0.ys_km[:, None]
    d01 = np.hypot(dx01, dy01)
    j_min = np.argmin(d01, axis=1)
    for i in range(p0.xs_km.size):
        j = int(j_min[i])
        if float(d01[i, j]) <= max_travel_km:
            xs_out.append((1.0 - alpha) * float(p0.xs_km[i]) + alpha * float(p1.xs_km[j]))
            ys_out.append((1.0 - alpha) * float(p0.ys_km[i]) + alpha * float(p1.ys_km[j]))
            ws_out.append(0.5 * ((1.0 - alpha) * float(p0.pix_weights[i]) + alpha * float(p1.pix_weights[j])))

    # Symmetric match p1 -> nearest in p0
    i_min = np.argmin(d01, axis=0)
    for j in range(p1.xs_km.size):
        i = int(i_min[j])
        if float(d01[i, j]) <= max_travel_km:
            xs_out.append((1.0 - alpha) * float(p0.xs_km[i]) + alpha * float(p1.xs_km[j]))
            ys_out.append((1.0 - alpha) * float(p0.ys_km[i]) + alpha * float(p1.ys_km[j]))
            ws_out.append(0.5 * ((1.0 - alpha) * float(p0.pix_weights[i]) + alpha * float(p1.pix_weights[j])))

    if not xs_out:
        return np.zeros(grid.shape, dtype=np.float64)
    sigma_km = min(1.2, 0.45 + 0.06 * min(alpha, 1.0 - alpha) * dt_tot_h)
    return gaussian_deposit_2d(
        grid.shape,
        grid.cell_km,
        np.asarray(xs_out, dtype=np.float64),
        np.asarray(ys_out, dtype=np.float64),
        np.asarray(ws_out, dtype=np.float64),
        sigma_km=sigma_km,
    )


@dataclass(frozen=True)
class TargetFeatures:
    """Extracted cell and look features for one scheduled target slot."""

    active_idx: NDArray[np.int64]         # flat cell indices in grid where candidate support holds
    cell_x: NDArray[np.float32]           # (n_active, D_cell)
    look_x: NDArray[np.float64]           # (D_look,)
    rec_p: NDArray[np.float64]            # (ny, nx)
    rec_frp: NDArray[np.float64]          # (ny, nx)
    pnt_frp: NDArray[np.float64]          # (ny, nx)
    near_frp_dedup: NDArray[np.float64]   # (ny, nx)


class EpisodeFeatureExtractor:
    """Precomputes visible coarse pass rasters once per episode and extracts per-slot features."""

    def __init__(
        self,
        visible: Detections,
        grid: EvalGrid,
        occ_params: OccupancyParams | None = None,
        use_terrain: bool = True,
    ) -> None:
        refuse_hidden_rows(visible, "VIIRS")
        self.grid = grid
        self.lon_mid = 0.5 * (grid.west + grid.east)
        self.lat_mid = 0.5 * (grid.south + grid.north)
        self.occ_params = occ_params or _default_occupancy_params()

        vis_modis = visible.select(visible.is_modis)
        self.recon = OccupancyReconstruction(grid, vis_modis, self.occ_params)

        # Build passes touching or near the grid, and exact in-box passes matching PaintedModis
        all_ops = group_overpasses(vis_modis)
        built = [_build_pass(grid, vis_modis, op, self.lon_mid) for op in all_ops]
        self.near_passes: list[PrecomputedPass] = [p for p in built if p is not None]
        self.near_times = np.array([p.time_s for p in self.near_passes], dtype=np.float64)

        self.box_passes: list[PrecomputedPass] = [p for p in self.near_passes if p.n_raw_in > 0.0]
        self.box_times = np.array([p.time_s for p in self.box_passes], dtype=np.float64)

        # Also retain PaintedModis exact painted fields for tie-break / reference consistency
        vis_in = vis_modis.select(vis_modis.in_box(grid.bbox))
        self._pnt_ops = group_overpasses(vis_in)
        self._pnt_times = np.array([p.time_s for p in self._pnt_ops], dtype=np.float64)
        self._pnt_cache: dict[int, Any] = {}
        self._vis_in = vis_in

        # Candidate active cell mask: union of all near-box footprints dilated by 8 cells (3.0 km)
        union_fp = np.zeros(grid.shape, dtype=bool)
        for p in self.near_passes:
            union_fp |= p.in_box_mask | p.spill_mask
        self.active_mask = dilate(union_fp, 8) if np.any(union_fp) else union_fp
        self.active_idx = np.flatnonzero(self.active_mask).astype(np.int64)

        # Nominal MODIS schedule to detect missed (zero-detection) coarse passes
        if len(vis_modis) > 0:
            t_lo = float(vis_modis.time_s.min()) - 86400.0
            t_hi = float(vis_modis.time_s.max()) + 86400.0
            nom_slots = S.nominal_slots(("MODIS_TERRA", "MODIS_AQUA"), t_lo, t_hi, self.lon_mid, self.lat_mid)
            empty_t: list[float] = []
            empty_clr: list[float] = []
            for ns in nom_slots:
                has_box = any(p.platform == ns.platform and abs(p.time_s - ns.time_s) <= 6000.0 for p in self.box_passes)
                if not has_box:
                    has_ctx = any(op.platform == ns.platform and abs(op.time_s - ns.time_s) <= 6000.0 for op in all_ops)
                    empty_t.append(ns.time_s)
                    empty_clr.append(1.0 if has_ctx else 0.0)
            self.empty_nom_times = np.asarray(empty_t, dtype=np.float64)
            self.empty_nom_clear = np.asarray(empty_clr, dtype=np.float64)
        else:
            self.empty_nom_times = np.empty(0, dtype=np.float64)
            self.empty_nom_clear = np.empty(0, dtype=np.float64)

        self.terrain: GridTerrain = (
            load_grid_terrain(grid)
            if use_terrain
            else GridTerrain(
                np.zeros(grid.shape),
                np.zeros(grid.shape),
                np.zeros(grid.shape),
                np.zeros(grid.shape),
                False,
            )
        )
        self._slope_norm = (
            np.tanh(self.terrain.slope_m_per_km / 250.0)
            if self.terrain.available
            else np.full(grid.shape, 0.572, dtype=np.float64)
        )

    def _painted_nearest(self, time_s: float, max_gap_s: float = 12.0 * 3600.0) -> tuple[NDArray[np.bool_], NDArray[np.float64]]:
        if self._pnt_times.size == 0:
            return np.zeros(self.grid.shape, dtype=bool), np.zeros(self.grid.shape, dtype=np.float64)
        gaps = np.abs(self._pnt_times - time_s)
        i = int(np.argmin(gaps))
        if float(gaps[i]) > max_gap_s:
            return np.zeros(self.grid.shape, dtype=bool), np.zeros(self.grid.shape, dtype=np.float64)
        if i not in self._pnt_cache:
            self._pnt_cache[i] = paint(self.grid, self._vis_in.select(self._pnt_ops[i].index))
        p = self._pnt_cache[i]
        return p.mask, p.frp_mw

    def _count_missed(self, t_a: float, t_b: float) -> tuple[float, float]:
        if self.empty_nom_times.size == 0:
            return 0.0, 0.0
        lo_t, hi_t = min(t_a, t_b), max(t_a, t_b)
        msk = (self.empty_nom_times > lo_t + 1800.0) & (self.empty_nom_times < hi_t - 1800.0)
        return float(msk.sum()), float(self.empty_nom_clear[msk].sum())

    def extract(self, target: Target) -> TargetFeatures:
        """Compute cell and look features for one scheduled target look."""
        shape = self.grid.shape
        t_s = float(target.time_s)
        is_day = bool(target.is_day)
        scan_km = float(target.scan_km)
        track_km = float(target.track_km)
        pixel_area = scan_km * track_km
        v_ovl = overlap_factor("VIIRS", track_km)
        v_cells = avg_target_cells(self.grid, scan_km, track_km, target.platform, is_day)

        rout = self.recon.predict_hidden(
            t_s, "VIIRS", is_day, pixel_area, track_km=track_km, scan_km=scan_km
        )
        rec_p = np.asarray(rout["p_detect"], dtype=np.float64)
        rec_frp = np.asarray(rout["frp_mw"], dtype=np.float64)
        est = rout["estimate"]
        rec_a = np.asarray(est.a, dtype=np.float64)
        rec_warm = np.asarray(est.r if est.r is not None else np.zeros(shape), dtype=np.float64)

        pnt_mask, pnt_frp = self._painted_nearest(t_s)

        # Nearest, previous, and next passes
        if self.near_times.size > 0:
            gaps_h = np.abs(self.near_times - t_s) / 3600.0
            i_near = int(np.argmin(gaps_h))
            dt_nearest_h = float(gaps_h[i_near])
            p_near = self.near_passes[i_near] if dt_nearest_h <= 18.0 else None
        else:
            dt_nearest_h = 48.0
            p_near = None

        i_prev_near = int(np.searchsorted(self.near_times, t_s, side="right")) - 1
        i_next_near = int(np.searchsorted(self.near_times, t_s, side="left"))
        p_prev = self.near_passes[i_prev_near] if i_prev_near >= 0 else None
        p_next = self.near_passes[i_next_near] if i_next_near < len(self.near_passes) else None

        # Box-pass prev/next for look-level FRP and pixel totals
        i_prev_box = int(np.searchsorted(self.box_times, t_s, side="right")) - 1
        i_next_box = int(np.searchsorted(self.box_times, t_s, side="left"))
        b_prev = self.box_passes[i_prev_box] if i_prev_box >= 0 else None
        b_next = self.box_passes[i_next_box] if i_next_box < len(self.box_passes) else None
        if self.box_times.size > 0:
            bgaps_h = np.abs(self.box_times - t_s) / 3600.0
            ib_near = int(np.argmin(bgaps_h))
            dt_box_h = float(bgaps_h[ib_near])
            b_near = self.box_passes[ib_near] if dt_box_h <= 12.0 else None
        else:
            dt_box_h = 48.0
            b_near = None

        miss_prev, miss_prev_clr = self._count_missed(b_prev.time_s, t_s) if b_prev is not None else (3.0, 0.0)
        miss_next, _ = self._count_missed(t_s, b_next.time_s) if b_next is not None else (3.0, 0.0)
        miss_near = self._count_missed(b_near.time_s, t_s)[0] if b_near is not None else 3.0

        # Look-level interpolated VIIRS-equivalent FRP and deduplicated pixel count
        lst_tgt = lst_hours(t_s, self.lon_mid)
        d_tgt = diurnal_factor(lst_tgt, 0.38)
        veq_parts: list[tuple[float, float, float]] = []
        for bp, m_cnt in ((b_prev, miss_prev), (b_next, miss_next)):
            if bp is None:
                continue
            dt_h = abs(t_s - bp.time_s) / 3600.0
            if dt_h > 18.0:
                continue
            y = bp.y_dedup_in
            veq_120 = float(np.sum(y / ((1.0 + y / 120.0) ** 0.28))) if y.size else 0.0
            d_src = max(diurnal_factor(bp.lst_hr, 0.38), 0.25)
            d_mult = float(np.clip((d_tgt / d_src) ** 0.45, 0.55, 1.85))
            decay = math.exp(-0.55 * m_cnt) * math.exp(-0.035 * max(0.0, dt_h - 1.0))
            w = math.exp(-dt_h / 3.2)
            veq_parts.append((w, veq_120 * d_mult * decay, bp.n_dedup_in * decay))

        if veq_parts:
            w_tot = sum(w for w, _, _ in veq_parts)
            veq_interp = (sum(w * v for w, v, _ in veq_parts) / max(w_tot, 1e-9)) * v_ovl
            pix_dedup_interp = (sum(w * px for w, _, px in veq_parts) / max(w_tot, 1e-9)) * v_ovl
        else:
            veq_interp = 0.0
            pix_dedup_interp = 0.0

        if b_near is not None and b_near.y_dedup_in.size:
            y_n = b_near.y_dedup_in
            veq_nearest = float(np.sum(y_n / ((1.0 + y_n / 120.0) ** 0.28))) * v_ovl
            d_near = diurnal_factor(lst_tgt, 0.38) / max(diurnal_factor(b_near.lst_hr, 0.38), 0.25)
        else:
            veq_nearest = 0.0
            d_near = 1.0

        has_both = (
            1.0
            if (
                b_prev is not None
                and b_next is not None
                and (t_s - b_prev.time_s) <= 14.0 * 3600.0
                and (b_next.time_s - t_s) <= 14.0 * 3600.0
            )
            else 0.0
        )

        look_x = np.array(
            [
                1.0 if is_day else 0.0,
                1.0 if target.platform == "VIIRS_SNPP" else 0.0,
                1.0 if target.platform == "VIIRS_NOAA20" else 0.0,
                1.0 if target.platform == "VIIRS_NOAA21" else 0.0,
                pixel_area,
                v_ovl,
                v_cells,
                math.log1p(min(dt_box_h, 48.0)),
                1.0 if dt_box_h <= 1.25 else 0.0,
                has_both,
                float(np.clip(d_near, 0.4, 2.5)),
                miss_prev,
                miss_prev_clr,
                miss_next,
                float(rec_p.sum()),
                float((rec_p * rec_p).sum()),
                float(rout["total_mw"]),
                float(pnt_mask.sum()),
                b_near.n_raw_in if b_near is not None else 0.0,
                b_near.n_dedup_in if b_near is not None else 0.0,
                b_near.frp_raw_in if b_near is not None else 0.0,
                b_near.frp_dedup_in if b_near is not None else 0.0,
                veq_interp,
                veq_nearest,
                pix_dedup_interp,
            ],
            dtype=np.float64,
        )

        idx = self.active_idx
        if idx.size == 0:
            return TargetFeatures(
                active_idx=idx,
                cell_x=np.zeros((0, len(CELL_FEATURE_NAMES)), dtype=np.float32),
                look_x=look_x,
                rec_p=rec_p,
                rec_frp=rec_frp,
                pnt_frp=pnt_frp,
                near_frp_dedup=np.zeros(shape, dtype=np.float64),
            )

        # Spatial fields on full (ny, nx) grid
        pnt_f = pnt_mask.astype(np.float64)
        pnt_ring1 = (dilate(pnt_mask, 1) & ~pnt_mask).astype(np.float64)

        if p_near is not None:
            near_psf = p_near.psf
            near_center = p_near.center_prox
            near_frp_ded = p_near.frp_dedup_cell
            near_pix_lfrp = p_near.pix_log_frp
            near_ncov = np.minimum(p_near.n_cover, 4.0)
            spill_in = p_near.spill_mask.astype(np.float64)
        else:
            near_psf = np.zeros(shape, dtype=np.float64)
            near_center = np.zeros(shape, dtype=np.float64)
            near_frp_ded = np.zeros(shape, dtype=np.float64)
            near_pix_lfrp = np.zeros(shape, dtype=np.float64)
            near_ncov = np.zeros(shape, dtype=np.float64)
            spill_in = np.zeros(shape, dtype=np.float64)

        rec_p_blur3 = box_mean_2d(rec_p, 1, 1)
        near_blur3 = box_mean_2d(pnt_f, 1, 1)
        near_blur7 = box_mean_2d(pnt_f, 3, 3)
        near_psf_blur5 = box_mean_2d(near_psf, 2, 2)

        r_rad_tgt = max(0, int(round(0.5 * track_km / self.grid.cell_km)))
        c_rad_tgt = max(0, int(round(0.5 * scan_km / self.grid.cell_km)))
        target_box_rec_a = box_mean_2d(rec_a, r_rad_tgt, c_rad_tgt)
        target_box_near = box_mean_2d(near_psf, r_rad_tgt, c_rad_tgt)
        target_box_pnt = box_mean_2d(pnt_f, r_rad_tgt, c_rad_tgt)

        if p_prev is not None and p_next is not None and p_prev is not p_next:
            bridge_psf = _lagrangian_bridge(self.grid, p_prev, p_next, t_s)
            dt_span_h = (p_next.time_s - p_prev.time_s) / 3600.0
            span_w = math.exp(-max(0.0, dt_span_h - 3.0) / 18.0)
            bracket_persist = np.sqrt(p_prev.psf * p_next.psf) * span_w
        else:
            bridge_psf = near_psf
            bracket_persist = np.zeros(shape, dtype=np.float64)

        # Past and future multi-scale exponential kernels
        past_fast = np.zeros(shape, dtype=np.float64)
        past_slow = np.zeros(shape, dtype=np.float64)
        fut_fast = np.zeros(shape, dtype=np.float64)
        fut_slow = np.zeros(shape, dtype=np.float64)
        for p in self.near_passes:
            dt_h = (t_s - p.time_s) / 3600.0
            if dt_h >= -0.05:
                age = max(0.0, dt_h)
                if age <= 12.0:
                    past_fast += math.exp(-age / 2.0) * p.psf
                if age <= 48.0:
                    past_slow += math.exp(-age / 14.0) * p.psf
            if dt_h <= 0.05:
                age = max(0.0, -dt_h)
                if age <= 12.0:
                    fut_fast += math.exp(-age / 2.0) * p.psf
                if age <= 48.0:
                    fut_slow += math.exp(-age / 14.0) * p.psf

        # Upslope spread alignment: past fire spreading upslope into cell
        if self.terrain.available:
            # Gradient of blurred past_slow points toward older fire; minus gradient points away from past fire
            d_r_fire, d_c_fire = np.gradient(box_mean_2d(past_slow, 2, 2), self.grid.cell_km)
            # Fire spread vector from past fire outward: east = -d_c_fire, north = +d_r_fire
            spread_east = -d_c_fire
            spread_north = d_r_fire
            mag = np.hypot(spread_east, spread_north) + 1e-6
            upslope_raw = (
                (spread_east / mag) * self.terrain.grad_east + (spread_north / mag) * self.terrain.grad_north
            )
            terrain_upslope = np.tanh(upslope_raw / 200.0) * np.minimum(1.0, mag * 2.0)
        else:
            terrain_upslope = np.zeros(shape, dtype=np.float64)

        rec_p_flat = rec_p.ravel()[idx]
        rec_p_clip = np.clip(rec_p_flat, 1e-4, 1.0 - 1e-4)
        rec_logit = np.log(rec_p_clip / (1.0 - rec_p_clip))
        pnt_flat = pnt_f.ravel()[idx]
        log_dt = math.log1p(min(dt_nearest_h, 48.0))
        co_weight = math.exp(-dt_nearest_h / 1.0)
        area_ratio = pixel_area / self.grid.cell_area_km2
        miss_decay = math.exp(-0.5 * miss_near)

        n_act = idx.size
        near_blur3_flat = near_blur3.ravel()[idx]
        near_psf_flat = near_psf.ravel()[idx]
        cols = [
            rec_p_flat,
            rec_logit,
            rec_p_blur3.ravel()[idx],
            rec_a.ravel()[idx],
            rec_warm.ravel()[idx],
            np.log1p(np.maximum(rec_frp.ravel()[idx], 0.0)),
            pnt_flat,
            pnt_flat * near_blur3_flat,
            pnt_ring1.ravel()[idx],
            near_psf_flat,
            near_center.ravel()[idx],
            np.log1p(np.maximum(near_frp_ded.ravel()[idx], 0.0)),
            near_pix_lfrp.ravel()[idx],
            near_ncov.ravel()[idx],
            near_blur3_flat,
            near_blur7.ravel()[idx],
            near_psf_blur5.ravel()[idx],
            target_box_rec_a.ravel()[idx],
            target_box_near.ravel()[idx],
            target_box_pnt.ravel()[idx],
            bridge_psf.ravel()[idx],
            bracket_persist.ravel()[idx],
            np.tanh(past_fast.ravel()[idx] * 0.5),
            np.tanh(past_slow.ravel()[idx] * 0.35),
            np.tanh(fut_fast.ravel()[idx] * 0.5),
            np.tanh(fut_slow.ravel()[idx] * 0.35),
            spill_in.ravel()[idx],
            np.full(n_act, 1.0 if is_day else 0.0, dtype=np.float64),
            np.full(n_act, log_dt, dtype=np.float64),
            pnt_flat * co_weight,
            near_psf_flat * co_weight,
            np.full(n_act, area_ratio, dtype=np.float64),
            np.full(n_act, miss_decay, dtype=np.float64),
            self._slope_norm.ravel()[idx],
            terrain_upslope.ravel()[idx],
        ]
        cell_x = np.column_stack(cols).astype(np.float32)

        return TargetFeatures(
            active_idx=idx,
            cell_x=cell_x,
            look_x=look_x,
            rec_p=rec_p,
            rec_frp=rec_frp,
            pnt_frp=pnt_frp,
            near_frp_dedup=near_frp_ded,
        )
