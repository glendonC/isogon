"""A reconstruct run on real FIRMS rows, in the shape `/api/reconstruct` returns today (CONTRACT amendment 8).

`solve_real_reconstruction(region_terrain, start, holdout)` returns a `SolvedRealRun`: every field the simulated
`SolvedReconstructionRun` has (so the server stores and serves it the same way), plus `extras`, a dict of additive
top-level keys for the response (`source`, `window`, `blind_test`, `model`, `encoding`).

  frames      24, each one real overpass: the first 24 at or after `start` that flagged a pixel in the region box
  channels    R reconstructed FRP density, G its standard deviation, B MODIS as observed, A VIIRS as observed, each
              a 375 m field shown on the 256 by 256 tensor grid (nearest cell, nothing interpolated or invented)
  footprints  one per real detection in the box, with its real `scan` and `track`
  geometry    derived from the rows (backend/model/real_geometry.py) and labelled derived

Nothing simulated enters a real run and nothing here is used by a simulated run. Rows are read only through
`backend.firms.read_firms` (terrain-assets lane); tests pass their own reader.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
import io
import json
import math
import time
from typing import Any, Callable

import numpy as np
from numpy.typing import NDArray

from backend.eval.baselines import OverlapRatioFit, overlap_ratio_factory, painted_modis_factory
from backend.eval.blind_test import run_blind_test, verdict
from backend.eval.grid import CELL_KM, EvalGrid, paint
from backend.eval.rows import Detections, detections_from_rows
from backend.model import platforms as P
from backend.model.belief import belief_frames
from backend.model.grid import GRID_H, GRID_W
from backend.model.occupancy import OccupancyParams, OccupancyReconstruction
from backend.model.real_blind import FRAMES, Window, reconstruction_factory, window_from_start
from backend.model.real_geometry import crossing_offsets, pass_geometry
from backend.model.sensor_physics import orbit_node_rule_payload
from backend.model.solver import SolvedReconstructionRun, build_any_region_grid
from backend.model.world_model import SIGMA_MAX_MW_KM2, Z_MAX_MW_KM2
from backend.terrain.live_region import LoadedRegionTerrain

REAL_MODEL_VERSION: str = "1.0.0-real-rows"
ROW_SOURCE: str = "NASA FIRMS standard processing archive (MODIS Collection 6.1, VIIRS 375 m Collection 2), read through backend.firms"
# Rows this far either side of the 24 frames are given to the estimate (it is a reconstruction, not a forecast).
PAD_S: float = 2.0 * 86400.0
# Longest stretch searched for 24 overpasses after the requested start.
SEARCH_S: float = 30.0 * 86400.0

# VIIRS confidence is a class (low, nominal, high), MODIS a number from 0 to 100. The footprint tuple has one numeric
# slot, so VIIRS classes are written as the midpoints of the MODIS ranges FIRMS documents for the same three words
# (low under 30, nominal 30 to 80, high above 80). The class itself is kept in the frame's `viirs_confidence_classes`.
VIIRS_CLASS_NUMBER: dict[str, int] = {"l": 15, "n": 55, "h": 90, "": 0}


@dataclass(frozen=True)
class SolvedRealRun(SolvedReconstructionRun):
    """A real-rows run: the simulated run's fields, additive response keys, and the belief frames asset."""

    extras: dict[str, Any]
    belief_u8_bytes: bytes = b""       # served as /api/runs/<run_id>/belief_u8.bin; described in extras["belief_frames"]


def _iso(t: float) -> str:
    return str(np.datetime64(int(round(t)), "s")) + "Z"


def parse_start_s(start: str) -> float:
    """UTC seconds for 'YYYY-MM-DD' or an ISO date-time (a trailing Z is accepted)."""
    text = str(start).strip().replace("Z", "")
    if len(text) == 10:
        y, m, d = (int(v) for v in text.split("-"))
        return float(calendar.timegm((y, m, d, 0, 0, 0, 0, 0, 0)))
    return float(np.datetime64(text, "s").astype("int64"))


def _tensor_index(grid375: EvalGrid, bbox: tuple[float, float, float, float]) -> tuple[NDArray[np.int64], NDArray[np.int64]]:
    """For every cell of the 256 by 256 tensor grid, the 375 m cell that holds its centre."""
    west, south, east, north = bbox
    lons = np.linspace(west, east, GRID_W)
    lats = np.linspace(north, south, GRID_H)
    lon2, lat2 = np.meshgrid(lons, lats)
    x, y = grid375.xy_km(lon2, lat2)
    col = np.clip(np.floor(x / grid375.cell_km).astype(np.int64), 0, grid375.nx - 1)
    row = np.clip((grid375.ny - 1 - np.floor(y / grid375.cell_km)).astype(np.int64), 0, grid375.ny - 1)
    return row, col


def _u8(field: NDArray[np.float64], vmax: float) -> NDArray[np.uint8]:
    return np.clip(np.rint(np.clip(field, 0.0, vmax) / vmax * 255.0), 0, 255).astype(np.uint8)


def _sigma_mw(est_a: NDArray[np.float64], est_F: NDArray[np.float64], rel_sd: float) -> NDArray[np.float64]:
    """Standard deviation of a cell's FRP: it burns or it does not, plus the stated relative uncertainty."""
    per = np.where(est_a > 1e-6, est_F / np.maximum(est_a, 1e-6), 0.0)
    occupancy_var = per ** 2 * est_a * (1.0 - est_a)
    rel = rel_sd if math.isfinite(rel_sd) else 1.0
    return np.sqrt(occupancy_var + (rel * est_F) ** 2)


def _exports(
    run_id: str, provenance: str, region_meta: dict[str, Any], metrics: dict[str, Any], grid375: EvalGrid,
    f_all: NDArray[np.float64], s_all: NDArray[np.float64], dem: NDArray[np.float32], rows_used: int,
    idx: tuple[NDArray[np.int64], NDArray[np.int64]], max_features: int = 240,
) -> tuple[bytes, bytes]:
    """GeoJSON and CSV of the cells at their peak frame, same columns as the simulated export."""
    area = grid375.cell_area_km2
    peak = np.argmax(f_all, axis=0)
    rr, cc = np.meshgrid(np.arange(grid375.ny), np.arange(grid375.nx), indexing="ij")
    z_peak = f_all[peak, rr, cc] / area
    s_peak = s_all[peak, rr, cc] / area
    flat = np.flatnonzero(z_peak.ravel() > 0)
    if flat.size > max_features:
        order = np.argsort(z_peak.ravel()[flat])[::-1]
        flat = flat[order[:max_features]]
    lon2, lat2 = grid375.cell_lonlat()
    # elevation of the tensor cell nearest each 375 m cell centre
    t_row = np.clip(np.rint((grid375.north - lat2) / max(grid375.north - grid375.south, 1e-9) * (GRID_H - 1)).astype(int), 0, GRID_H - 1)
    t_col = np.clip(np.rint((lon2 - grid375.west) / max(grid375.east - grid375.west, 1e-9) * (GRID_W - 1)).astype(int), 0, GRID_W - 1)
    del idx
    features: list[dict[str, Any]] = []
    buf = io.StringIO()
    buf.write("lon,lat,z_hat_mw_km2,sigma_mw_km2,ci90_low,ci90_high,epoch_peak,elevation_m\n")
    for f_idx in flat:
        r, c = divmod(int(f_idx), grid375.nx)
        lon, lat = round(float(lon2[r, c]), 5), round(float(lat2[r, c]), 5)
        zv, sv = round(float(z_peak[r, c]), 3), round(float(s_peak[r, c]), 3)
        lo, hi = round(max(0.0, zv - 1.64485 * sv), 3), round(zv + 1.64485 * sv, 3)
        ep = int(peak[r, c])
        el = round(float(dem[t_row[r, c], t_col[r, c]]), 1)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"z_hat_mw_km2": zv, "sigma_mw_km2": sv, "ci90_low": lo, "ci90_high": hi, "epoch_peak": ep,
                           "elevation_m": el, "epistemic_state": "Reconstructed_From_Real_FIRMS_Rows"},
        })
        buf.write(f"{lon},{lat},{zv},{sv},{lo},{hi},{ep},{el}\n")
    geo = {
        "type": "FeatureCollection",
        "metadata": {"run_id": run_id, "model_version": REAL_MODEL_VERSION, "provenance": provenance,
                     "firms_rows_used": rows_used, "region": region_meta, "metrics": metrics},
        "features": features,
    }
    return (json.dumps(geo, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8"), buf.getvalue().encode("utf-8")


def solve_real_reconstruction(
    region_terrain: LoadedRegionTerrain,
    start: str,
    holdout_viirs: bool = False,
    read_firms: Callable[..., list[dict[str, str]]] | None = None,
    context_box: tuple[float, float, float, float] | None = None,
    params: OccupancyParams | None = None,
    ratio_fit: OverlapRatioFit | None = None,
    count_ratio: Any | None = None,
    learned_parts: list[dict[str, Any]] | None = None,
    row_source: str = ROW_SOURCE,
) -> SolvedRealRun:
    """Reconstruct a region from real rows, starting at `start` (UTC date or date-time).

    `holdout_viirs=True` hides every VIIRS detection (Suomi NPP, NOAA-20, NOAA-21) from the estimate and attaches
    the blind-test score; False assimilates both instruments. Everything else has a default the server can rely
    on: `read_firms(box, start, end)` and `context_box` are the terrain-assets lane's reader and the region's
    context box; `params` and `learned_parts` come from backend/model/fitted.py; `ratio_fit` is the tracked FRP
    overlap ratio and `count_ratio` the calendar's overlap ratio refitted without the run's year (both feed the
    second baseline only).
    """
    holdout = "viirs" if holdout_viirs else None
    t_begin = time.perf_counter()
    spec = region_terrain.spec
    bbox = (spec.bbox.west, spec.bbox.south, spec.bbox.east, spec.bbox.north)
    if read_firms is None or context_box is None:
        from backend.firms import read_firms as _read, region_box as _box  # lands with terrain-assets D1

        read_firms = read_firms or _read
        context_box = context_box or _box(spec.id)
    from backend.model import fitted as _fitted

    params = params or _fitted.load_params()
    ratio_fit = ratio_fit or _fitted.load_ratio_fit()
    if learned_parts is None:
        learned_parts = _fitted.learned_parts()
    start_s = parse_start_s(start)

    rows = read_firms(context_box, _iso(start_s - PAD_S)[:-1], _iso(start_s + SEARCH_S)[:-1])
    det_all = detections_from_rows(rows, row_source)
    win: Window = window_from_start(det_all, bbox, start_s)
    keep = (det_all.time_s >= win.start_s - PAD_S) & (det_all.time_s < win.end_s + PAD_S)
    det = det_all.select(keep)
    t_rows = time.perf_counter()

    grid375 = EvalGrid.from_bbox(bbox, CELL_KM)
    area = grid375.cell_area_km2
    viirs_seen = sorted({P.PLATFORMS[int(c)] for c in det.platform_code[det.is_viirs]})
    hidden_platforms = viirs_seen if holdout == "viirs" else []
    visible = det.select(det.is_modis) if holdout == "viirs" else det
    recon = OccupancyReconstruction(grid375, visible, params)
    t_model = time.perf_counter()

    tensor_grid = build_any_region_grid(region_terrain.dem_m, bbox, region_terrain.terrain_source)
    idx = _tensor_index(grid375, bbox)
    inb = det_all.in_box(bbox)
    # geometry: the drift of each platform's crossing time is estimated from every overpass in the rows loaded
    from backend.eval.overpass import group_overpasses

    all_passes = group_overpasses(det_all)
    offsets = crossing_offsets(all_passes, spec.center_lat)

    f_all = np.zeros((FRAMES, grid375.ny, grid375.nx))
    s_all = np.zeros_like(f_all)
    tensor = np.zeros((FRAMES, GRID_H, GRID_W, 4), dtype=np.uint8)
    frames_json: list[dict[str, Any]] = []
    epochs: list[dict[str, Any]] = []
    saturated = {"reconstruction": 0, "modis": 0, "viirs": 0}
    lit = {"reconstruction": 0, "modis": 0, "viirs": 0}
    peak_total = 0.0
    rows_in_frames = 0

    for k, op in enumerate(win.passes):
        est = recon.estimate(op.time_s)
        sig = _sigma_mw(est.a, est.F, est.rel_sd_log)
        f_all[k], s_all[k] = est.F, sig
        own = op.index[inb[op.index]]
        painted = paint(grid375, det_all.select(own))
        is_modis = op.family == "MODIS"
        z = est.F / area
        obs = painted.frp_mw / area
        tensor[k, :, :, 0] = _u8(z, Z_MAX_MW_KM2)[idx]
        tensor[k, :, :, 1] = _u8(sig / area, SIGMA_MAX_MW_KM2)[idx]
        tensor[k, :, :, 2 if is_modis else 3] = _u8(obs, Z_MAX_MW_KM2)[idx]
        for name, fld in (("reconstruction", z), ("modis" if is_modis else "viirs", obs)):
            lit[name] += int((fld > 0).sum())
            saturated[name] += int((fld > Z_MAX_MW_KM2).sum())

        held_out = holdout == "viirs" and not is_modis
        geom = pass_geometry(op, spec.center_lon, spec.center_lat, offsets)
        d = det_all.select(own)
        fps: list[list[float | int]] = []
        classes = {"l": 0, "n": 0, "h": 0}
        for i in range(len(d)):
            cls = str(d.confidence_class[i])
            if cls in classes:
                classes[cls] += 1
            conf = int(round(float(d.confidence[i]))) if math.isfinite(float(d.confidence[i])) else VIIRS_CLASS_NUMBER.get(cls, 0)
            fps.append([
                round(float(d.lon[i]), 5), round(float(d.lat[i]), 5), round(float(d.scan_km[i]), 2),
                round(float(d.track_km[i]), 2), geom["azimuth_deg"], round(float(d.frp_mw[i]), 2), conf,
                geom["sensor_code"],
            ])
        rows_in_frames += len(d)
        pass_entry = {**geom, "swath_fraction": 1.0, "footprint_count": len(fps)}
        recon_mw = float(est.F.sum())
        peak_total = max(peak_total, recon_mw)
        regime = "viirs_overpass_held_out" if held_out else ("modis_overpass" if is_modis else "viirs_overpass")
        frames_json.append({
            "frame": k,
            "timestamp_utc": _iso(op.time_s),
            "local_solar_time_hr": round(op.lst_hr, 2),
            "is_day": bool(op.is_day),
            "epistemic_regime": regime,
            "sensor": op.platform,
            "subsat_lon": geom["subsat_lon"],
            "subsat_lat": geom["subsat_lat"],
            "altitude_km": geom["altitude_km"],
            "scan_angle_deg": geom["scan_angle_deg"],
            "azimuth_deg": geom["azimuth_deg"],
            "view_zenith_deg": geom["view_zenith_deg"],
            "cloud_fraction": 0.0,
            "cloud_fraction_measured": False,
            "mean_z_hat_mw_km2": round(float(z.mean()), 3),
            "max_z_hat_mw_km2": round(float(z.max()), 2),
            "mean_sigma_mw_km2": round(float((sig / area).mean()), 3),
            "information_age_h": None if not math.isfinite(est.age_h) else round(est.age_h, 2),
            "viirs_confidence_classes": classes if not is_modis else None,
            "passes": [pass_entry],
            "footprints": fps,
        })
        epochs.append({
            "frame": k,
            "timestamp_utc": _iso(op.time_s),
            "lst_hr": round(op.lst_hr, 2),
            "regime": regime,
            "primary_sensor": op.platform,
            "cloud_fraction": 0.0,
            "reconstructed_total_mw": round(recon_mw, 1),
            "raw_modis_total_mw": round(painted.frp_total_mw, 1) if is_modis else 0.0,
            "raw_viirs_total_mw": 0.0 if is_modis else round(painted.frp_total_mw, 1),
            "mean_sigma_mw_km2": round(float((sig / area).mean()), 2),
        })
    # what the model believes between the passes, at fixed steps (forward filter only)
    belief_bytes, belief_desc = belief_frames(recon, win.start_s, win.end_s - 1.0, Z_MAX_MW_KM2)
    t_frames = time.perf_counter()

    # Scores. With a holdout this is the blind test. Without one the same scoring runs with VIIRS assimilated, so
    # the figures are fit residuals and are labelled so.
    report: dict[str, Any] | None = None
    if ratio_fit is not None and count_ratio is None:
        try:
            from backend.model.calendar_ratio import calendar_ratio

            count_ratio = calendar_ratio(spec.id, exclude_year=int(_iso(win.start_s)[:4]))
        except Exception:  # no calendar for this region: the baseline then states no pixel count
            count_ratio = None
    if ratio_fit is not None:
        if holdout == "viirs":
            recon_factory = reconstruction_factory(params)
        else:
            def recon_factory(_visible: Detections, g: EvalGrid):  # sees every row: not a blind method
                from backend.model.real_blind import ReconstructionMethod

                return ReconstructionMethod(det, g, params, "reconstruction", "fit with VIIRS assimilated (in sample, not a test)")
        report = run_blind_test(
            det, bbox, [painted_modis_factory, overlap_ratio_factory(ratio_fit, count_ratio), recon_factory],
            window=(win.start_s, win.end_s),
        )
        report["window_choice"] = win.as_dict()
        report["overlap_ratio_fit"] = ratio_fit.as_dict()
        report["calendar_overlap_ratio"] = None if count_ratio is None else count_ratio.as_dict()
        report["hidden_platforms"] = hidden_platforms
        report["verdict"] = verdict(report)
        report["blind"] = holdout == "viirs"
    elif holdout == "viirs":
        raise ValueError("a holdout run needs the overlap-ratio baseline's fitted ratio (backend/model/fitted_values/overlap_ratio.json)")
    t_score = time.perf_counter()

    n_mod_px = win.modis_pixels_in_box
    n_vii_px = win.viirs_pixels_in_box
    metrics: dict[str, Any] = {
        "holdout_viirs": holdout == "viirs",
        "cloud_override": None,
        "total_reconstructed_frp_peak_mw": round(peak_total, 1),
        "raw_modis_rmse_mw_km2": 0.0,
        "reconstructed_rmse_mw_km2": 0.0,
        "rmse_reduction_pct": 0.0,
        "empirical_90_coverage_pct": 0.0,
        "conformal_q90_radius_mw_km2": round(float(1.64485 * (s_all / area)[f_all > 0].mean()) if (f_all > 0).any() else 0.0, 2),
        "subpixel_viirs_fires_recovered_pct": 0.0,
        "step_2012_raw_ratio": round((n_mod_px + n_vii_px) / max(n_mod_px, 1), 2),
        "step_2012_harmonized_ratio": 0.0,
        "step_2012_coobs_frames": 0,
        "source": "firms",
        "scored": report is not None,
    }
    if report is not None:
        rec, raw = report["methods"]["reconstruction"], report["methods"]["painted_modis"]
        r_rmse, m_rmse = rec["cell_rmse_mw_km2"] or 0.0, raw["cell_rmse_mw_km2"] or 0.0
        cov = rec["interval"]["coverage"]
        # hidden VIIRS cells the painted MODIS pixels miss that the reconstruction's declared cells reach
        missed_by_raw = raw["strict_375m"]["fn"]
        metrics.update(
            raw_modis_rmse_mw_km2=round(m_rmse, 2),
            reconstructed_rmse_mw_km2=round(r_rmse, 2),
            rmse_reduction_pct=round((1.0 - r_rmse / m_rmse) * 100.0, 1) if m_rmse > 0 else 0.0,
            empirical_90_coverage_pct=round(100.0 * cov, 1) if cov is not None else 0.0,
            subpixel_viirs_fires_recovered_pct=round(
                100.0 * max(0, rec["strict_375m"]["tp"] - raw["strict_375m"]["tp"]) / missed_by_raw, 1
            ) if missed_by_raw > 0 else 0.0,
            step_2012_harmonized_ratio=round(rec["frp_total"]["ratio_of_sums"] or 0.0, 2),
            step_2012_coobs_frames=report["scored_overpasses_with_hidden_detections_in_test_box"],
        )
    metrics["definitions"] = {
        "reference": (
            "hidden VIIRS detections (blind test)" if holdout == "viirs"
            else "VIIRS detections that were assimilated: fit residuals, not a test"
        ),
        "raw_modis_rmse_mw_km2": "cell RMSE of MODIS painted as observed against the VIIRS detections (backend/eval/metrics.py, cell_rmse)",
        "reconstructed_rmse_mw_km2": "the same for the reconstruction's predicted VIIRS field",
        "rmse_reduction_pct": "(1 - reconstructed / raw) times 100, signed: a negative value means the reconstruction is worse",
        "empirical_90_coverage_pct": "share of scored VIIRS overpasses whose total FRP lies in the stated 90 percent interval",
        "conformal_q90_radius_mw_km2": "mean of 1.645 times the stated cell standard deviation over cells with fire; no conformal step is applied to real runs",
        "subpixel_viirs_fires_recovered_pct": "extra VIIRS cells the reconstruction hits beyond painted MODIS, as a share of the cells painted MODIS misses (0 when it hits fewer)",
        "step_2012_raw_ratio": "(MODIS pixels + VIIRS pixels) / MODIS pixels in the box over the 24 frames: the jump in raw counts when VIIRS joins the record",
        "step_2012_harmonized_ratio": "reconstructed total FRP / VIIRS total FRP summed over the scored VIIRS overpasses",
        "step_2012_coobs_frames": "scored VIIRS overpasses with detections in the box",
    }

    terrain_label = {
        "aws_terrarium_esri_world_imagery": "AWS Terrarium 30m DEM + Maxar 2K Ortho",
        "aws_terrarium_eox_s2": "AWS Terrarium DEM + Sentinel-2 Ortho",
        "cached_local_dem_s2": "Cached Local DEM + Sentinel-2 Ortho",
    }.get(region_terrain.terrain_source, "Procedural DEM (no real terrain cached for this region)")
    provenance = (
        f"Real NASA FIRMS detections ({len(det)} rows read, {rows_in_frames} drawn in the 24 frames) on {terrain_label}. "
        "The reconstruction is a model estimate from those detections; pass geometry is derived from the rows."
    )
    c_tag = "holdoutviirs" if holdout == "viirs" else "allsensors"
    run_id = f"{spec.id}_firms_{_iso(win.start_s)[:16].replace('-', '').replace(':', '')}_{c_tag}"

    learned = learned_parts
    pipeline_stages = [
        {"stage_id": "terrain_ingest", "label": terrain_label, "model_name": "terrain cache",
         "duration_ms": round(region_terrain.duration_ms, 1), "status": "completed",
         "detail": f"256x256 DEM ({region_terrain.min_elev_m:.0f}m-{region_terrain.max_elev_m:.0f}m)"},
        {"stage_id": "sensor_operator", "label": "Real FIRMS Rows and Pixel Footprints",
         "model_name": "backend.firms reader, footprints from scan and track",
         "duration_ms": round((t_rows - t_begin) * 1000.0, 1), "status": "completed",
         "detail": f"{len(det)} rows, {win.n_modis} MODIS and {win.n_viirs} VIIRS overpasses in 24 frames"},
        {"stage_id": "hurdle_quantile", "label": "Learned Cross-Sensor Parts",
         "model_name": "see model.learned_parts", "duration_ms": 0.0,
         "status": "completed" if any(p.get("status") == "on" for p in learned) else "experimental",
         "detail": "; ".join(f"{p['name']}: {p['status']}" for p in learned)},
        {"stage_id": "kalman_smoother", "label": "Forward and Backward Occupancy Filter (375 m)",
         "model_name": "backend/model/occupancy.py", "duration_ms": round((t_model - t_rows) * 1000.0, 1),
         "status": "completed",
         "detail": ("MODIS only; hidden: " + ", ".join(hidden_platforms)) if holdout == "viirs" else "MODIS and VIIRS assimilated"},
        {"stage_id": "conformal_gate", "label": "Blind Test Against Hidden VIIRS" if holdout == "viirs" else "Fit Residuals (no holdout)",
         "model_name": "backend/eval/blind_test.py", "duration_ms": round((t_score - t_frames) * 1000.0, 1),
         "status": "completed" if report is not None else "skipped",
         "detail": "scored against hidden detections beside two baselines" if holdout == "viirs" else "VIIRS was assimilated: not a test"},
    ]

    # The reconstruction is shown as proven only when this run's blind test has it ahead of both baselines on every
    # score with an interval that holds; in every other case it is labelled experimental and the scores say why.
    if report is not None and holdout == "viirs":
        v = report["verdict"]
        cov = v["interval"]["observed_coverage"]
        level = v["interval"]["stated_level"]
        holds = cov is not None and level is not None and cov >= level - 0.1
        if v["beats_every_baseline_on_every_score"] and holds:
            model_status, model_reason = "on", "ahead of both baselines on every score of this run's blind test, interval holds"
        else:
            model_status = "experimental"
            model_reason = (
                f"ahead of both baselines on {v['beats_every_baseline_on']} of {v['scores_judged']} scores of this run's "
                f"blind test; its {level} interval held for {cov if cov is None else round(cov, 3)} of the scored overpasses"
            )
    else:
        model_status, model_reason = "experimental", "no blind test in this run (VIIRS was assimilated), so nothing here is a test"
    sensor_codes = {str(code): name for name, code in P.PLATFORM_CODES.items()}
    observer_passes: dict[str, Any] = {
        "schema_version": "1.0.0",
        "model_version": REAL_MODEL_VERSION,
        "run_id": run_id,
        "provenance": provenance,
        "downloaded_firms_rows": len(det),
        "source": "firms",
        "terrain_source": region_terrain.terrain_source,
        "bbox": [round(v, 5) for v in bbox],
        "aoi_center": [spec.center_lon, spec.center_lat],
        "sensor_codes": sensor_codes,
        "orbit_node_rule": orbit_node_rule_payload(),
        "footprint_schema": ["lon", "lat", "scan_km", "track_km", "angle_deg", "frp_mw", "confidence", "sensor_code"],
        "geometry_note": (
            "scan_angle_deg, view_zenith_deg, azimuth_deg, subsat_lon and subsat_lat are derived from the rows' pixel "
            "sizes and acquisition times (backend/model/real_geometry.py); FIRMS does not publish them. cloud_fraction "
            "is not measured (FIRMS rows carry no cloud mask) and is written as 0."
        ),
        "confidence_note": (
            "MODIS confidence is the source's 0 to 100 value. VIIRS confidence is a class; the numeric slot holds 15, "
            "55 or 90 for low, nominal, high and the class counts are in each frame's viirs_confidence_classes."
        ),
        "crossing_time_offsets": {f"{k[0]}_{'day' if k[1] else 'night'}": v for k, v in offsets.items()},
        "frames": frames_json,
    }

    region_meta = region_terrain.to_region_metadata()
    geo, csv_bytes = _exports(run_id, provenance, region_meta, {k: v for k, v in metrics.items() if k != "definitions"},
                              grid375, f_all, s_all, region_terrain.dem_m, len(det), idx)

    extras: dict[str, Any] = {
        "source": "firms",
        "start": _iso(start_s),
        "holdout_viirs": holdout == "viirs",
        "hidden_platforms": hidden_platforms,
        "hidden_platforms_note": (
            "every VIIRS detection of these platforms was kept from the estimate and used only to score it"
            if holdout == "viirs" else "nothing was hidden: VIIRS detections were assimilated"
        ),
        "window": win.as_dict(),
        "firms_rows_used": len(det),
        "model": {
            "version": REAL_MODEL_VERSION,
            "method": "forward and backward occupancy filter on the 375 m grid (backend/model/occupancy.py)",
            "parameters": params.as_dict(),
            "learned_parts": learned,
            "status": model_status,
            "status_reason": model_reason,
            "detection_law": "Sofiev and Kouznetsov, Geosci. Model Dev. 19, 10123, 2026, Tables 1 and 2 (re-implemented)",
        },
        "encoding": {
            "z_hat_max_mw_km2": Z_MAX_MW_KM2,
            "sigma_max_mw_km2": SIGMA_MAX_MW_KM2,
            "grid": "375 m cells shown on the 256 by 256 tensor grid by nearest cell",
            "cells_above_scale": saturated,
            "cells_with_fire": lit,
            "note": "channel values are clipped at the scale maximum; epoch_summaries carry the unclipped totals in MW",
        },
        "footprints_per_frame_max": max(len(f["footprints"]) for f in frames_json),
    }
    belief_desc["url"] = f"/api/runs/{run_id}/belief_u8.bin"
    belief_desc["assimilated"] = ("MODIS only; hidden: " + ", ".join(hidden_platforms)) if holdout == "viirs" else "MODIS and VIIRS"
    extras["belief_frames"] = belief_desc
    if report is not None:
        extras["blind_test" if holdout == "viirs" else "fit_residuals"] = report

    return SolvedRealRun(
        run_id=run_id,
        provenance=provenance,
        region_terrain=region_terrain,
        cell_area_km2=tensor_grid.cell_area_km2,
        tensor_u8=tensor,
        reconstruction_u8_bytes=tensor.tobytes(order="C"),
        observer_passes=observer_passes,
        pipeline_stages=pipeline_stages,
        metrics=metrics,
        epoch_summaries=epochs,
        export_geojson_bytes=geo,
        export_csv_bytes=csv_bytes,
        extras=extras,
        belief_u8_bytes=belief_bytes,
    )


# A start date is worth showing when its 24 overpasses make one continuous episode with enough for the blind test
# to score: the window is at most three days long, both instruments pass at least eight times, and MODIS flags at
# least 100 pixels in the box. The thresholds are stated in the answer so a caller can show them.
START_MAX_SPAN_H: float = 72.0
START_MIN_PASSES_EACH: int = 8
START_MIN_MODIS_PIXELS: int = 100


def real_start_dates(
    spec: Any,
    first: str,
    last: str,
    read_firms: Callable[..., list[dict[str, str]]] | None = None,
    context_box: tuple[float, float, float, float] | None = None,
    row_source: str = ROW_SOURCE,
) -> dict[str, Any]:
    """For every UTC day from `first` to `last` inclusive: the 24 overpass window a real run would get if it
    started that day, and whether it is worth showing. `spec` is the region (`RegionSpec`); nothing is solved."""
    bbox = (spec.bbox.west, spec.bbox.south, spec.bbox.east, spec.bbox.north)
    if read_firms is None or context_box is None:
        from backend.firms import read_firms as _read, region_box as _box

        read_firms = read_firms or _read
        context_box = context_box or _box(spec.id)
    t0, t1 = parse_start_s(first), parse_start_s(last)
    rows = read_firms(context_box, _iso(t0)[:-1], _iso(t1 + SEARCH_S)[:-1])
    det = detections_from_rows(rows, row_source)
    from backend.model.real_blind import in_box_overpasses

    items = in_box_overpasses(det, bbox)
    times = np.array([o.time_s for o, _ in items])
    starts: list[dict[str, Any]] = []
    day = t0
    while day <= t1 + 1.0:
        i0 = int(np.searchsorted(times, day, side="left"))
        entry: dict[str, Any] = {"start": _iso(day)[:10]}
        if i0 + FRAMES > len(items):
            entry.update(worth_showing=False, why_not="fewer than 24 overpasses with a detection in the box after this day")
        else:
            chunk = items[i0 : i0 + FRAMES]
            mod = [(o, k) for o, k in chunk if o.family == "MODIS"]
            vii = [(o, k) for o, k in chunk if o.family == "VIIRS"]
            span = (chunk[-1][0].time_s - chunk[0][0].time_s) / 3600.0
            wait = (chunk[0][0].time_s - day) / 3600.0
            reasons = []
            if span > START_MAX_SPAN_H:
                reasons.append(f"the 24 overpasses spread over {span:.0f} h")
            if wait > 24.0:
                reasons.append(f"the first overpass with a detection comes {wait:.0f} h after the start")
            if len(mod) < START_MIN_PASSES_EACH or len(vii) < START_MIN_PASSES_EACH:
                reasons.append(f"only {len(mod)} MODIS and {len(vii)} VIIRS overpasses")
            if sum(k for _, k in mod) < START_MIN_MODIS_PIXELS:
                reasons.append(f"MODIS flags only {sum(k for _, k in mod)} pixels in the box")
            entry.update(
                first_overpass_utc=_iso(chunk[0][0].time_s),
                last_overpass_utc=_iso(chunk[-1][0].time_s),
                span_hours=round(span, 1),
                modis_overpasses=len(mod),
                viirs_overpasses=len(vii),
                modis_pixels_in_box=int(sum(k for _, k in mod)),
                viirs_pixels_in_box=int(sum(k for _, k in vii)),
                worth_showing=not reasons,
                why_not="; ".join(reasons) if reasons else None,
            )
        starts.append(entry)
        day += 86400.0
    good = [e for e in starts if e["worth_showing"]]
    return {
        "region_id": spec.id,
        "source": "firms",
        "first": _iso(t0)[:10],
        "last": _iso(t1)[:10],
        "rule": (
            f"a start date is worth showing when its 24 overpasses span at most {START_MAX_SPAN_H:.0f} h, begin within "
            f"24 h of the start, include at least {START_MIN_PASSES_EACH} MODIS and {START_MIN_PASSES_EACH} VIIRS "
            f"overpasses, and MODIS flags at least {START_MIN_MODIS_PIXELS} pixels in the region box"
        ),
        "starts": starts,
        "worth_showing": [e["start"] for e in good],
        "busiest": [e["start"] for e in sorted(good, key=lambda e: -e["modis_pixels_in_box"])[:5]],
    }


def real_response(solved: SolvedRealRun, assets: dict[str, Any]) -> dict[str, Any]:
    """The `/api/reconstruct` response for a real run: today's keys, then the additive ones.

    `assets` is built by the server exactly as for a simulated run (terrain-assets lane owns it).
    """
    out = {
        "run_id": solved.run_id,
        "provenance": solved.provenance,
        "downloaded_firms_rows": solved.extras["firms_rows_used"],
        "region": solved.region_terrain.to_region_metadata(),
        "assets": assets,
        "pipeline_stages": solved.pipeline_stages,
        "metrics": solved.metrics,
        "epoch_summaries": solved.epoch_summaries,
        "observer_passes": solved.observer_passes,
    }
    out.update(solved.extras)
    return out
