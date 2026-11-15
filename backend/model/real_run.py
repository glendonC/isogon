"""A reconstruct run on real FIRMS rows, in the shape `/api/reconstruct` returns.

`solve_real_reconstruction(region_terrain, start, holdout_viirs)` returns a `SolvedRealRun`: every field the
simulated `SolvedReconstructionRun` has (so the server stores and serves it the same way), plus `extras`, a dict
of additive top-level keys for the response (`source`, `window`, `blind_test`, `model`, `encoding`).

  frames      24, each one pass of a satellite over the region box, from NASA's CMR granule list: the
              first 24 passes whose swath held the box, of every platform, counted from the first MODIS overpass
              with a detection at or after `start`. A pass that flagged nothing is a frame all the same. With VIIRS
              hidden the VIIRS passes are frames too (`epistemic_regime` viirs_overpass_held_out): they carry the
              estimate and nothing observed, so both kinds of run play the same passes. Where no pass list is
              cached the frames are the first 24 overpasses of the visible rows with a detection.
  channels    R reconstructed FRP density, G its standard deviation, B MODIS as observed, A VIIRS as observed, each
              a 375 m field shown on the 256 by 256 tensor grid (nearest cell, nothing interpolated or invented).
              With VIIRS hidden, A is empty: the hidden pixels are under `blind_test.reveal`, from the scorer.
  footprints  one per real detection of a frame in the box, with its real `scan` and `track`
  geometry    from where the box lies in the pass's swath polygon (backend/eval/schedule.py); derived from the
              visible rows (backend/model/real_geometry.py) where no pass list is cached. Labelled either way.

Hidden rows. With `holdout_viirs` the rows part ways at `backend.eval.holdout.seal`, the first thing
done with them. From there on this module holds the visible rows and a sealed box it cannot read; the box goes
to `backend.eval.blind_test`, which opens it after every prediction is fixed. So the window, the tensor, the
belief frames, both exports and every payload key outside `blind_test` and the metrics named in
`metrics.from_hidden_rows` are byte for byte the same whatever the hidden rows hold.

Nothing simulated enters a real run and nothing here is used by a simulated run. Rows are read only through
`backend.firms.read_firms`; tests pass their own reader.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
import io
import json
import math
import os
import time
from typing import Any, Callable

import numpy as np
from numpy.typing import NDArray

from backend.eval.baselines import OverlapRatioFit, baseline_factories, overlap_ratio_factory, painted_modis_factory
from backend.eval.blind_test import blind_test_sealed, reveal, run_blind_test, verdict
from backend.eval.grid import CELL_KM, EvalGrid, paint
from backend.eval.holdout import seal
from backend.eval.overpass import group_overpasses
from backend.eval import schedule as S
from backend.eval.rows import Detections, detections_from_rows, local_solar_time_hr
from backend.eval.schedule import hidden_platforms_in
from backend.model import platforms as P
from backend.model.belief import belief_frames
from backend.model import encoding as ENC
from backend.model.grid import GRID_H, GRID_W
from backend.model.occupancy import OccupancyParams, OccupancyReconstruction
from backend.model.real_blind import FRAMES, Frame, Window, in_box_overpasses, reconstruction_factory, run_frames
from backend.model.real_geometry import crossing_offsets, pass_geometry, slot_geometry
from backend.model.sensor_physics import orbit_node_rule_payload
from backend.model.solver import SolvedReconstructionRun, build_any_region_grid
from backend.model.training import ClosedWindow, closed_window_error
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


# Which estimate answers the held-out passes of a run with the sharp satellite held out. Off by default: the
# estimate in use answers everything. With "challenger" the default challenger (backend/model/challenger, chosen on
# the fresh test's validation fires) answers the held-out passes and their declared cells, and is scored beside the
# estimate in use; the visible passes, the spread, the belief frames and the exports stay with the estimate in use.
# Nothing on the page changes until the owner says yes.
RUN_ESTIMATE_ENV: str = "ISOGON_RUN_ESTIMATE"
ESTIMATE_IN_USE: str = "in_use"
ESTIMATE_CHALLENGER: str = "challenger"


def run_estimate(given: str | None = None) -> str:
    """The estimate a held-out run answers with: the one given, else the environment's, else the estimate in use."""
    value = (given or os.environ.get(RUN_ESTIMATE_ENV, "") or ESTIMATE_IN_USE).strip()
    if value not in (ESTIMATE_IN_USE, ESTIMATE_CHALLENGER):
        raise ValueError(f"{RUN_ESTIMATE_ENV} is {ESTIMATE_IN_USE!r} or {ESTIMATE_CHALLENGER!r}, not {value!r}")
    return value


# The kind of model each challenger is, in words a page can say.
CHALLENGER_WORDS: dict[str, str] = {
    "gbdt": "boosted decision trees", "mlp": "a small neural network", "logistic": "a logistic model",
}
# The order in which a blend combines the other challengers (backend/model/challenger/methods.py).
BLEND_ORDER: tuple[str, ...] = ("logistic", "mlp", "gbdt")


def challenger_words(variant: str) -> str:
    """What kind of model a challenger is, in words a page can say. A blend is named by the models it gives
    weight to (any weight but zero), read from its bundle, so a part weighted zero is not said."""
    if variant != "blend":
        return CHALLENGER_WORDS.get(variant, "a challenger model")
    from backend.model.challenger import FITTED_DIR as CHALLENGER_DIR, VARIANT_FILES

    doc = json.loads((CHALLENGER_DIR / VARIANT_FILES["blend"]).read_text(encoding="utf-8"))
    weights = [float(w) for w in doc["stacker"]["weights"]]
    parts = [CHALLENGER_WORDS[v] for v, w in zip(BLEND_ORDER, weights) if w != 0.0]
    if not parts:
        return "a blend of models"
    return "a blend of " + (parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1])


def answering_estimate(headline: str) -> dict[str, Any]:
    """Which estimate answered the held-out passes of a run, in one field, with words a page can say."""
    if headline == "reconstruction":
        return {"method": "reconstruction", "words": "the estimate in use", "switch": RUN_ESTIMATE_ENV,
                "switch_is": ESTIMATE_IN_USE}
    kind = challenger_words(headline.removeprefix("challenger_"))
    return {"method": headline,
            "words": f"a challenger model ({kind}) chosen on fires it was not fitted on, in place of the estimate in use",
            "switch": RUN_ESTIMATE_ENV, "switch_is": ESTIMATE_CHALLENGER,
            "the_rest": "the passes the coarse satellite made, the spread and the frames between passes are the estimate in use"}


def _challenger() -> tuple[Any, str, dict[str, Any]]:
    """The default challenger's factory, its method name and what the payload says of it."""
    import hashlib

    from backend.model.challenger import FITTED_DIR as CHALLENGER_DIR, VARIANT_FILES, default_challenger_factory, default_variant

    variant = default_variant()
    bundle = CHALLENGER_DIR / VARIANT_FILES[variant]
    return default_challenger_factory(), f"challenger_{variant}", {
        "method": f"challenger_{variant}",
        "bundle": f"backend/model/challenger/fitted/{bundle.name}",
        "bundle_sha256": hashlib.sha256(bundle.read_bytes()).hexdigest(),
        "chosen": "on the fresh test's validation fires, by the rule written before that run (backend/model/challenger/runner.py)",
        "answers": "the held-out passes: their declared cells, their power per cell, the run's blind test headline",
        "stays_with_the_estimate_in_use": "the visible passes, the spread per cell, the belief frames, the exports",
    }


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


# Metrics of a run that are scores against the hidden rows. With a holdout they come from the scorer and are the
# only top-level metrics that may differ when the hidden rows differ; the payload names them in
# `metrics.from_hidden_rows`.
METRICS_FROM_HIDDEN_ROWS: tuple[str, ...] = (
    "raw_modis_rmse_mw_km2", "reconstructed_rmse_mw_km2", "rmse_reduction_pct", "empirical_90_coverage_pct",
    "cells_gained_over_painted_modis_pct",
)
# Names the simulated engine's metrics carry that mean nothing on a real run. They stay in a real run's `metrics`
# as null, because a route test asks a real run for every key a simulated run has; why each is null, and the key
# of the real run that holds the nearest quantity, is said in `metrics.definitions`.
SIMULATED_METRIC_NAMES_NOT_USED: dict[str, str] = {
    "cloud_override": "an input of simulated runs; a real run has no cloud setting",
    "conformal_q90_radius_mw_km2": "no conformal step is applied to a real run; the mean half width of the stated cell interval is mean_cell_q90_halfwidth_mw_km2",
    "subpixel_viirs_fires_recovered_pct": "a simulated-truth notion; the cells gained over painted MODIS against hidden detections are cells_gained_over_painted_modis_pct",
    "step_2012_raw_ratio": "one run says nothing about the 2012 step in the record; the pixel counts are window.modis_pixels_in_box and blind_test.hidden_rows_in_test_box",
    "step_2012_harmonized_ratio": "one run says nothing about the 2012 step in the record; predicted over hidden FRP is blind_test.methods.reconstruction.frp_total.ratio_of_sums",
    "step_2012_coobs_frames": "one run says nothing about the 2012 step in the record; the count is blind_test.scored_overpasses_with_hidden_detections_in_test_box",
}


def years_touched(start_s: float, end_s: float, pad_s: float = PAD_S) -> tuple[int, ...]:
    """Every calendar year a run touches: its frames and the days either side that are given to the estimate."""
    first, last = int(_iso(start_s - pad_s)[:4]), int(_iso(end_s + pad_s)[:4])
    return tuple(range(first, last + 1))


def _not_scored(closed: dict[str, Any]) -> dict[str, Any]:
    """What a run says in place of a score on a closed window, with where the recorded looks are served."""
    from backend.model.training import EVIDENCE_ADDRESS

    years = " and ".join(str(y) for y in closed["years"])
    return {
        "why": (
            f"this window lies in {years}, the year of a recorded test fire in this region. The test of that fire "
            "is closed: its looks are on record and no window of the region in that year is scored again. The "
            "estimate, the frames and the terrain are served; no blind test, no baseline and no figure made from "
            "VIIRS rows is computed"
        ),
        "evidence": EVIDENCE_ADDRESS,
        "region_id": closed["region_id"],
        "years": list(closed["years"]),
    }


def _test_fire_note(region_id: str, start_s: float, end_s: float) -> dict[str, Any] | None:
    """Says so when a window lies on one of the three 2021 test fires (backend/model/training.py)."""
    from backend.model.training import EXCLUSIONS, _day_s

    if region_id not in EXCLUSIONS:
        return None
    first, after, _ = EXCLUSIONS[region_id]
    if end_s <= _day_s(first) or start_s >= _day_s(after):
        return None
    return {
        "test_fire": True,
        "note": (
            "this is one of the three 2021 test fires. The test of them is recorded in "
            "backend/model/fitted_values/test_fire_looks.json (served by backend.model.evidence): one look under "
            "protocol version 1, which let the hidden rows move the window and the pixel size of each prediction, "
            "one under version 2, a protocol correction, and the final look under version 3, taken once with "
            "everything frozen. The score of this run is that of its own window; it is not one of the recorded "
            "looks and nothing is fitted or chosen with it."
        ),
    }


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
    read_passes: Callable[..., list[dict[str, Any]]] | None = None,
    estimate: str | None = None,
    platforms_cached: Callable[..., tuple[tuple[str, ...], dict[str, str]]] | None = None,
) -> SolvedRealRun:
    """Reconstruct a region from real rows, starting at `start` (UTC date or date-time).

    `holdout_viirs=True` hides every VIIRS detection from everything but the scorer and attaches the blind-test
    score; False assimilates both instruments. Everything else has a default the server can rely on:
    `read_firms(box, start, end)` and `context_box` are `backend.firms.read_firms` and the region's context
    box; `params` and `learned_parts` come from backend/model/fitted.py; `ratio_fit` is the tracked FRP overlap
    ratio and `count_ratio` the calendar's overlap ratio refitted without the run's year and without the year of
    a test fire (both feed the second baseline only). `read_passes` is the pass list's reader, by default
    `backend.firms.cmr_passes.cmr_passes`; when it has no list for the days of the run the frames
    fall back to overpasses of the visible rows and the payload says so (`window.frames_from`).
    """
    holdout = bool(holdout_viirs)
    t_begin = time.perf_counter()
    spec = region_terrain.spec
    bbox = (spec.bbox.west, spec.bbox.south, spec.bbox.east, spec.bbox.north)
    # Which VIIRS platforms have their rows in the cache over a window: read from the extracts' manifests when the
    # rows come from the cache; a caller that hands in its own rows has every platform it gives.
    if platforms_cached is None:
        if read_firms is None:
            from backend.model.cached_platforms import platforms_with_rows

            def platforms_cached(box: Any, family: str, t0: float, t1: float) -> tuple[tuple[str, ...], dict[str, str]]:
                return platforms_with_rows(box, family, t0, t1, region_id=spec.id)
        else:
            def platforms_cached(box: Any, family: str, t0: float, t1: float) -> tuple[tuple[str, ...], dict[str, str]]:
                return hidden_platforms_in(family, None, t0, t1), {}
    if read_firms is None or context_box is None:
        from backend.firms import read_firms as _read, region_box as _box  # the defaults

        read_firms = read_firms or _read
        context_box = context_box or _box(spec.id)
    from backend.model import fitted as _fitted

    params = params or _fitted.load_params()
    ratio_fit = ratio_fit or _fitted.load_ratio_fit()
    if learned_parts is None:
        learned_parts = _fitted.learned_parts()
    start_s = parse_start_s(start)

    # The rows part ways here and nowhere else. `rows_seen` holds visible rows only; `sealed` is opened by the
    # scorer alone (backend/eval/blind_test.py). No name below this line can reach a hidden row.
    rows_seen, sealed = seal(
        detections_from_rows(read_firms(context_box, _iso(start_s - PAD_S)[:-1], _iso(start_s + SEARCH_S)[:-1]), row_source),
        "VIIRS" if holdout else None,
    )
    # `rows_seen` already holds no hidden row; naming what is hidden again marks which passes are held-out frames
    frames: list[Frame]
    win: Window
    frames, win = run_frames(rows_seen, bbox, start_s, n=FRAMES, hidden="VIIRS" if holdout else None, read_passes=read_passes)
    # A platform whose rows the cache does not hold for the window has no pass in the run: no frame, no hidden pass,
    # no score. Its rows, had any been fetched, would still be sealed with the rest of VIIRS. Framed again until the
    # platforms left out are the same for the window the frames span.
    without_rows: dict[str, str] = {}
    for _ in range(3):
        _, missing = platforms_cached(bbox, "VIIRS", win.start_s, win.end_s)
        if set(missing) <= set(without_rows):
            break
        without_rows.update(missing)
        frames, win = run_frames(rows_seen, bbox, start_s, n=FRAMES, hidden="VIIRS" if holdout else None,
                                 read_passes=read_passes, leave_out=tuple(sorted(without_rows)))
    from_list = frames[0].slot is not None
    # The closed rule, asked with the run's box and its own window, which was found from visible rows alone. A run
    # with a satellite held out stops here, before anything is estimated. A run with every satellite goes on and
    # skips the scoring block below.
    from backend.model.training import closed_for

    def _context(region: str) -> tuple[float, float, float, float]:
        if region == spec.id:
            return tuple(context_box)             # the run's own context box, as it was given
        from backend.firms import region_box as _real_box

        return _real_box(region)

    closed = closed_for(bbox, win.start_s, win.end_s, region_box=_context)
    if closed is not None and holdout:
        raise closed_window_error(closed, "no run with a satellite held out is made there")
    not_scored = None if closed is None else _not_scored(closed)
    keep = (rows_seen.time_s >= win.start_s - PAD_S) & (rows_seen.time_s < win.end_s + PAD_S)
    visible = rows_seen.select(keep)
    t_rows = time.perf_counter()

    grid375 = EvalGrid.from_bbox(bbox, CELL_KM)
    area = grid375.cell_area_km2
    # which platforms are hidden follows from the archive's dates, not from the hidden rows
    hidden_platforms = ([p for p in hidden_platforms_in("VIIRS", None, win.start_s, win.end_s) if p not in without_rows]
                        if holdout else [])
    recon = OccupancyReconstruction(grid375, visible, params)
    # the switch: only a run with the sharp satellite held out, on visible rows alone, before anything is scored
    chal_factory, headline, chal_doc, chal_method = None, "reconstruction", None, None
    if holdout and run_estimate(estimate) == ESTIMATE_CHALLENGER:
        chal_factory, headline, chal_doc = _challenger()
        chal_method = chal_factory(visible, grid375)
    t_model = time.perf_counter()

    tensor_grid = build_any_region_grid(region_terrain.dem_m, bbox, region_terrain.terrain_source)
    idx = _tensor_index(grid375, bbox)
    # geometry: the drift of each platform's crossing time is estimated from the overpasses of the visible rows
    offsets = crossing_offsets(group_overpasses(rows_seen), spec.center_lat)

    f_all = np.zeros((FRAMES, grid375.ny, grid375.nx))
    s_all = np.zeros_like(f_all)
    tensor = np.zeros((FRAMES, GRID_H, GRID_W, 4), dtype=np.uint8)
    frames_json: list[dict[str, Any]] = []
    epochs: list[dict[str, Any]] = []
    saturated = {"reconstruction": 0, "sigma": 0, "modis": 0, "viirs": 0}
    lit = {"reconstruction": 0, "sigma": 0, "modis": 0, "viirs": 0}
    floored = {"reconstruction": 0, "sigma": 0, "modis": 0, "viirs": 0}
    peak_total = 0.0
    rows_in_frames = 0

    for k, fr in enumerate(frames):
        est = recon.estimate(fr.time_s)
        sig = _sigma_mw(est.a, est.F, est.rel_sd_log)
        f_all[k], s_all[k] = est.F, sig
        # a held-out frame holds no row: it is a pass of a hidden platform, and its rows are in the sealed box
        d = rows_seen.select(fr.rows)
        painted = paint(grid375, d)
        is_modis = P.family(fr.platform) == "MODIS"
        z = est.F / area
        answered_by = "reconstruction"
        if chal_method is not None and fr.hidden and fr.slot is not None:
            # the challenger's answer at this held-out pass; it states no spread per cell
            pred = chal_method.predict(fr.slot)
            z = np.asarray(pred.frp_mw, dtype=np.float64) / area
            sig = np.zeros_like(sig)
            answered_by = headline
        obs = painted.frp_mw / area
        tensor[k, :, :, 0] = ENC.encode_u8(z)[idx]
        tensor[k, :, :, 1] = ENC.encode_u8(sig / area)[idx]
        seen_fields = [] if fr.hidden else [("modis" if is_modis else "viirs", obs)]
        if not fr.hidden:
            tensor[k, :, :, 2 if is_modis else 3] = ENC.encode_u8(obs)[idx]
        for name, fld in [("reconstruction", z), ("sigma", sig / area)] + seen_fields:
            lit[name] += int((fld > 0).sum())
            saturated[name] += int((fld > ENC.LOG_MAX_MW_KM2).sum())
            floored[name] += int(((fld > 0) & (fld < ENC.LOG_MIN_MW_KM2)).sum())

        if fr.slot is not None:
            geom = slot_geometry(fr.slot, spec.center_lon, spec.center_lat)
        else:
            geom = pass_geometry(fr.overpass, spec.center_lon, spec.center_lat, offsets)
        lst_hr = float(local_solar_time_hr(fr.time_s, spec.center_lon))
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
        pass_entry = {**geom, "swath_fraction": 1.0, "footprint_count": len(fps), "held_out": fr.hidden,
                      "geometry_from": "swath polygon of the pass (NASA CMR)" if fr.slot is not None else "the pass's own rows"}
        recon_mw = float(est.F.sum()) if answered_by == "reconstruction" else float(z.sum() * area)
        peak_total = max(peak_total, float(est.F.sum()))     # the estimate in use's, as the exports are
        regime = ("modis_overpass" if is_modis else "viirs_overpass") + ("_held_out" if fr.hidden else "")
        frames_json.append({
            "frame": k,
            "timestamp_utc": _iso(fr.time_s),
            "local_solar_time_hr": round(lst_hr, 2),
            "is_day": bool(fr.is_day),
            "epistemic_regime": regime,
            "held_out": fr.hidden,
            "detections_in_box": None if fr.hidden else len(d),
            "granule_cloud_cover_pct": None if fr.slot is None else fr.slot.cloud_cover_pct,
            "sensor": fr.platform,
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
            **({} if chal_method is None else {"estimate_from": answered_by}),
            "viirs_confidence_classes": classes if not (is_modis or fr.hidden) else None,
            "passes": [pass_entry],
            "footprints": fps,
        })
        epochs.append({
            "frame": k,
            "timestamp_utc": _iso(fr.time_s),
            "lst_hr": round(lst_hr, 2),
            "regime": regime,
            "primary_sensor": fr.platform,
            "cloud_fraction": 0.0,
            "reconstructed_total_mw": round(recon_mw, 1),
            "raw_modis_total_mw": round(painted.frp_total_mw, 1) if is_modis else 0.0,
            "raw_viirs_total_mw": 0.0 if is_modis else round(painted.frp_total_mw, 1),
            "mean_sigma_mw_km2": round(float((sig / area).mean()), 2),
        })
    # what the model believes between the passes, at fixed steps (forward filter only)
    belief_bytes, belief_desc = belief_frames(recon, win.start_s, win.end_s - 1.0)
    t_frames = time.perf_counter()

    # Everything the estimate produced is fixed above. What follows scores it. With a holdout this is the blind
    # test: the sealed rows go to the scorer. Without one the same scoring runs with VIIRS assimilated, so the
    # figures are fit residuals and are labelled so.
    report: dict[str, Any] | None = None
    declared: dict[str, Any] | None = None       # the cells the reconstruction declares at each scored look
    count_ratio_missing: str | None = None
    if not_scored is not None:
        ratio_fit = None                      # a closed window: no baseline is built and nothing below scores
    if ratio_fit is not None and count_ratio is None:
        from backend.model.calendar_ratio import calendar_ratio

        try:
            # every year the run touches is left out, so a run over New Year keeps none of its own rows
            count_ratio = calendar_ratio(spec.id, exclude_year=years_touched(win.start_s, win.end_s))
        except (KeyError, ValueError, OSError) as exc:
            # no calendar is cached for this region, or no year is left to fit on: the second baseline then
            # states no pixel count, and the payload says why
            count_ratio_missing = f"{type(exc).__name__}: {exc}"
    span = (win.start_s, win.end_s)
    if ratio_fit is not None:
        baselines = baseline_factories(ratio_fit, count_ratio)
        if holdout:
            methods = baselines + [reconstruction_factory(params, recon=recon)] + ([chal_factory] if chal_factory else [])
            held = [(k, fr.slot) for k, fr in enumerate(frames) if fr.hidden and fr.slot is not None]
            if from_list:
                # the looks scored are the held-out frames and no other; the count of passes left out is read
                # from the list again for the hidden platforms alone
                _, left = S.pass_slots(tuple(hidden_platforms), win.start_s, win.end_s, bbox, read_passes)
                given = ([s for _, s in held], S.SOURCE_CMR, {"platforms": hidden_platforms, **left})
                report = blind_test_sealed(visible, sealed, bbox, methods, window=span, given=given, declare=headline)
                for entry, (k, _) in zip(report["schedule"]["slots"], held):
                    entry["frame"] = k
                report["schedule"]["frames_note"] = "slots[i].frame is the held-out frame of the run that slot i is; every held-out frame is a slot"
            else:
                report = blind_test_sealed(visible, sealed, bbox, methods, window=span, read_passes=read_passes,
                                           declare=headline,
                                           target_filter=(lambda s: s.platform not in without_rows) if without_rows else None)
            # The declared cells leave the report and go beside it in the answer: a server withholds the report
            # until the reveal, and these were fixed before the hidden rows were opened, so a page may draw them
            # from the first answer. Each published entry keeps their digest (`cells_sha256`).
            declared = report.pop("declared_cells")
            report["built_without_hidden_rows"].remove("declared_cells")
            if from_list:
                for look, (k, _) in zip(declared["looks"], held):
                    look["frame"] = k
            report["reveal"] = reveal(sealed, bbox, span, [fr.time_s for fr in frames], VIIRS_CLASS_NUMBER,
                                      held_out_frames=held if from_list else None)
            report["from_the_scorer"] = report["from_the_scorer"] + ["reveal", "verdict"]
        else:
            def in_sample(_visible: Detections, g: EvalGrid):  # sees every row: not a blind method
                from backend.model.real_blind import ReconstructionMethod

                return ReconstructionMethod(
                    visible, g, params, "reconstruction", "fit with VIIRS assimilated (in sample, not a test)", recon=recon
                )
            report = run_blind_test(visible, bbox, baselines + [in_sample], window=span, read_passes=read_passes)
        report["window_choice"] = win.as_dict()
        report["overlap_ratio_fit"] = ratio_fit.as_dict()
        report["calendar_overlap_ratio"] = None if count_ratio is None else count_ratio.as_dict()
        report["calendar_overlap_ratio_missing"] = count_ratio_missing
        report["verdict"] = verdict(report, method=headline)
        report["blind"] = holdout
        note = _test_fire_note(spec.id, win.start_s, win.end_s)
        if note is not None:
            report["protocol"] = {**report["protocol"], **note}
        if holdout:
            report["built_without_hidden_rows"] = report["built_without_hidden_rows"] + [
                "window_choice", "overlap_ratio_fit", "calendar_overlap_ratio", "calendar_overlap_ratio_missing", "blind",
            ]
    elif holdout:
        raise ValueError("a holdout run needs the overlap-ratio baseline's fitted ratio (backend/model/fitted_values/overlap_ratio.json)")
    if not_scored is not None and report is not None:
        raise RuntimeError("a closed window was scored")         # cannot happen; kept as a last guard
    t_score = time.perf_counter()

    metrics: dict[str, Any] = {
        "holdout_viirs": holdout,
        "total_reconstructed_frp_peak_mw": round(peak_total, 1),
        "mean_cell_q90_halfwidth_mw_km2": round(float(1.64485 * (s_all / area)[f_all > 0].mean()) if (f_all > 0).any() else 0.0, 2),
        "raw_modis_rmse_mw_km2": 0.0,
        "reconstructed_rmse_mw_km2": 0.0,
        "rmse_reduction_pct": 0.0,
        "empirical_90_coverage_pct": 0.0,
        "cells_gained_over_painted_modis_pct": 0.0,
        **{name: None for name in SIMULATED_METRIC_NAMES_NOT_USED},
        "source": "firms",
        "scored": report is not None,
        "from_hidden_rows": list(METRICS_FROM_HIDDEN_ROWS) if holdout else [],
        "simulated_names_not_used": sorted(SIMULATED_METRIC_NAMES_NOT_USED),
    }
    model_side_metrics = {k: v for k, v in metrics.items()
                          if k not in METRICS_FROM_HIDDEN_ROWS and k not in SIMULATED_METRIC_NAMES_NOT_USED
                          and k not in ("from_hidden_rows", "simulated_names_not_used")}
    if not_scored is not None:
        # no figure made from VIIRS rows: the names stay, without a number, and say why
        metrics.update({name: None for name in METRICS_FROM_HIDDEN_ROWS})
        metrics["not_scored"] = not_scored
    if report is not None:
        rec, raw = report["methods"][headline], report["methods"]["painted_modis"]
        r_rmse, m_rmse = rec["cell_rmse_mw_km2"] or 0.0, raw["cell_rmse_mw_km2"] or 0.0
        cov = rec["interval"]["coverage"]
        # hidden VIIRS cells the painted MODIS pixels miss that the reconstruction's declared cells reach
        missed_by_raw = raw["strict_375m"]["fn"]
        metrics.update(
            raw_modis_rmse_mw_km2=round(m_rmse, 2),
            reconstructed_rmse_mw_km2=round(r_rmse, 2),
            rmse_reduction_pct=round((1.0 - r_rmse / m_rmse) * 100.0, 1) if m_rmse > 0 else 0.0,
            empirical_90_coverage_pct=round(100.0 * cov, 1) if cov is not None else 0.0,
            cells_gained_over_painted_modis_pct=round(
                100.0 * max(0, rec["strict_375m"]["tp"] - raw["strict_375m"]["tp"]) / missed_by_raw, 1
            ) if missed_by_raw > 0 else 0.0,
        )
    metrics["definitions"] = {
        "reference": (
            "hidden VIIRS detections (blind test)" if holdout
            else "VIIRS detections that were assimilated: fit residuals, not a test"
        ),
        "from_hidden_rows": "the metrics computed by the scorer from the hidden rows; every other metric is fixed before they are opened",
        "simulated_names_not_used": "names a simulated run's metrics carry that mean nothing on a real run; they are null here, and each entry below says why and where the figure it used to hold is now",
        "total_reconstructed_frp_peak_mw": "the largest total FRP of the estimate over the frames",
        "mean_cell_q90_halfwidth_mw_km2": "mean of 1.645 times the stated cell standard deviation over cells with fire",
        "raw_modis_rmse_mw_km2": "cell RMSE of MODIS painted as observed against the VIIRS detections (backend/eval/metrics.py, cell_rmse)",
        "reconstructed_rmse_mw_km2": "the same for the reconstruction's predicted VIIRS field",
        "rmse_reduction_pct": "(1 - reconstructed / raw) times 100, signed: a negative value means the reconstruction is worse",
        "empirical_90_coverage_pct": "share of scored VIIRS overpasses whose total FRP lies in the stated 90 percent interval",
        "cells_gained_over_painted_modis_pct": "extra VIIRS cells the reconstruction hits beyond painted MODIS, as a share of the cells painted MODIS misses (0 when it hits fewer)",
        **SIMULATED_METRIC_NAMES_NOT_USED,
    }

    terrain_label = {
        "aws_terrarium_esri_world_imagery": "AWS Terrarium 30m DEM + Maxar 2K Ortho",
        "aws_terrarium_eox_s2": "AWS Terrarium DEM + Sentinel-2 Ortho",
        "cached_local_dem_s2": "Cached Local DEM + Sentinel-2 Ortho",
    }.get(region_terrain.terrain_source, "Procedural DEM (no real terrain cached for this region)")
    n_used = len(visible)
    provenance = (
        f"Real NASA FIRMS detections ({n_used} rows given to the estimate, {rows_in_frames} drawn in the 24 frames) on "
        f"{terrain_label}. The reconstruction is a model estimate from those detections; "
        + ("the frames are the passes NASA's CMR granule list gives over the region, with their geometry."
           if from_list else "pass geometry is derived from them.")
        + (" VIIRS detections were kept from the estimate and used only to score it." if holdout else "")
    )
    c_tag = ("holdoutviirs" if holdout else "allsensors") + ("" if chal_doc is None else f"_{headline}")
    run_id = f"{spec.id}_firms_{_iso(win.start_s)[:16].replace('-', '').replace(':', '')}_{c_tag}"

    learned = learned_parts
    hidden_text = ("MODIS only; hidden: " + ", ".join(hidden_platforms)) if holdout else "MODIS and VIIRS assimilated"
    pipeline_stages = [
        {"stage_id": "terrain_ingest", "label": terrain_label, "model_name": "terrain cache",
         "duration_ms": round(region_terrain.duration_ms, 1), "status": "completed",
         "detail": f"256x256 DEM ({region_terrain.min_elev_m:.0f}m-{region_terrain.max_elev_m:.0f}m)"},
        {"stage_id": "sensor_operator", "label": "Real FIRMS Rows and Pixel Footprints",
         "model_name": "backend.firms reader, footprints from scan and track",
         "duration_ms": round((t_rows - t_begin) * 1000.0, 1), "status": "completed",
         "detail": f"{n_used} rows, {win.n_modis} MODIS and {win.n_viirs} VIIRS passes in 24 frames"
                   + (f" ({win.hidden_passes} held out)" if holdout and from_list else "")},
        {"stage_id": "hurdle_quantile", "label": "Learned Cross-Sensor Parts",
         "model_name": "see model.learned_parts", "duration_ms": 0.0,
         "status": "completed" if any(p.get("status") == "on" for p in learned) else "experimental",
         "detail": "; ".join(f"{p['name']}: {p['status']}" for p in learned)},
        {"stage_id": "kalman_smoother", "label": "Forward and Backward Occupancy Filter (375 m)",
         "model_name": "backend/model/occupancy.py", "duration_ms": round((t_model - t_rows) * 1000.0, 1),
         "status": "completed", "detail": hidden_text},
        {"stage_id": "conformal_gate", "label": "Blind Test Against Hidden VIIRS" if holdout else "Fit Residuals (no holdout)",
         "model_name": "backend/eval/blind_test.py", "duration_ms": round((t_score - t_frames) * 1000.0, 1),
         "status": "completed" if report is not None else "skipped",
         "detail": ("not scored: this window lies in the year of a recorded test fire, which is closed" if not_scored is not None else
                    "scored against hidden detections beside two baselines" if holdout else "VIIRS was assimilated: not a test")},
    ]

    # The status of the model is what validation on other fires decided (backend/model/fitted_values), never this
    # run's own score: a label that moved with the hidden rows of the run would be a score, not a status. This
    # run's blind test is under `blind_test.verdict`.
    gated = [p for p in learned if p.get("status") in ("on", "experimental")]      # the parts validation rules on
    parts_on = [p for p in gated if p["status"] == "on"]
    own = "this run's own blind test is in blind_test.verdict" if holdout else "nothing was hidden in this run, so it holds no test"
    if gated and len(parts_on) == len(gated):
        model_status, model_reason = "on", "every part of the estimate is ahead of both baselines on validation fires (model.learned_parts)"
    elif gated:
        model_status = "experimental"
        model_reason = f"{len(parts_on)} of {len(gated)} parts of the estimate are on after validation on other fires (model.learned_parts); {own}"
    else:
        model_status, model_reason = "experimental", f"no part of the estimate has been validated on other fires (model.learned_parts); {own}"
    sensor_codes = {str(code): name for name, code in P.PLATFORM_CODES.items()}
    observer_passes: dict[str, Any] = {
        "schema_version": "1.0.0",
        "model_version": REAL_MODEL_VERSION,
        "run_id": run_id,
        "provenance": provenance,
        "downloaded_firms_rows": n_used,
        "source": "firms",
        "terrain_source": region_terrain.terrain_source,
        "bbox": [round(v, 5) for v in bbox],
        "aoi_center": [spec.center_lon, spec.center_lat],
        "sensor_codes": sensor_codes,
        "orbit_node_rule": orbit_node_rule_payload(),
        "footprint_schema": ["lon", "lat", "scan_km", "track_km", "angle_deg", "frp_mw", "confidence", "sensor_code"],
        "frames_from": win.frames_from,
        "geometry_note": (
            "FIRMS does not publish a pass's geometry. scan_angle_deg, view_zenith_deg, azimuth_deg, subsat_lon and "
            "subsat_lat are worked out from where the region box lies in the swath polygon of the pass, which NASA's "
            "CMR granule list gives; no detection is read for them, so a held-out frame has them too. "
            if from_list else
            "FIRMS does not publish a pass's geometry and no pass list is cached for these days. scan_angle_deg, "
            "view_zenith_deg, azimuth_deg, subsat_lon and subsat_lat are derived from the rows' pixel sizes and "
            "acquisition times (backend/model/real_geometry.py). "
        ) + (
            "cloud_fraction is not measured (FIRMS rows carry no cloud mask) and is written as 0; "
            "granule_cloud_cover_pct is the mean over a whole MODIS granule, about 2,000 km long, and is null for VIIRS."
        ),
        "held_out_frames_note": (
            "a frame whose epistemic_regime ends in held_out is a real pass of a hidden platform. It shows the estimate "
            "at the time of that pass and nothing observed: no footprint, channel A empty. What the satellite saw is "
            "in blind_test.reveal.overpasses, each with the frame it belongs to." if holdout and from_list else None
        ),
        "confidence_note": (
            "MODIS confidence is the source's 0 to 100 value. VIIRS confidence is a class; the numeric slot holds 15, "
            "55 or 90 for low, nominal, high and the class counts are in each frame's viirs_confidence_classes."
        ),
        "crossing_time_offsets": {f"{k[0]}_{'day' if k[1] else 'night'}": v for k, v in offsets.items()},
        "crossing_time_offsets_note": (
            "estimated from the visible rows; not used for the geometry of a frame that comes from the pass list"
            if from_list else "estimated from the visible rows and used for each frame's geometry"
        ),
        "frames": frames_json,
    }

    region_meta = region_terrain.to_region_metadata()
    geo, csv_bytes = _exports(run_id, provenance, region_meta, model_side_metrics, grid375, f_all, s_all,
                              region_terrain.dem_m, n_used, idx)

    extras: dict[str, Any] = {
        "source": "firms",
        "not_scored": not_scored,
        "start": _iso(start_s),
        "holdout_viirs": holdout,
        "hidden_platforms": hidden_platforms,
        "hidden_platforms_note": (
            "every VIIRS detection of these platforms was kept from the estimate and used only to score it; the list "
            "comes from the archive's start dates, not from the hidden rows, less any platform whose rows the cache "
            "does not hold for the window (platforms_without_rows_in_the_cache)"
            if holdout else "nothing was hidden: VIIRS detections were assimilated"
        ),
        # platforms flying in the window whose rows were never fetched for the region: no frame, no hidden pass, no score
        "platforms_without_rows_in_the_cache": dict(sorted(without_rows.items())),
        "window": win.as_dict(),
        "firms_rows_used": n_used,
        "hidden_rows": {
            "rule": (
                "the hidden rows are parted from the visible ones before anything is chosen or built "
                "(backend/eval/holdout.py) and opened by the scorer alone"
            ),
            "payload_keys_from_the_scorer": (["blind_test"] + [f"metrics.{k}" for k in METRICS_FROM_HIDDEN_ROWS]) if holdout else [],
            "everything_else": "byte for byte the same whatever the hidden rows hold (pipeline_stages durations are wall clock times)",
            "declared_cells": (
                "declared_cells holds the cells the reconstruction declares at each scored look. They are the cells "
                "the scorer compares with the hidden detections, they were fixed before the hidden rows were opened, "
                "and they are not part of what the scorer wrote" if holdout else "nothing was hidden, so no cell was declared"
            ),
        },
        "declared_cells": declared,
        # which estimate answered the held-out passes, in one field; fixed before the hidden rows are opened
        "held_out_passes_answered_by": answering_estimate(headline) if holdout else None,
        "model": {
            "version": REAL_MODEL_VERSION,
            "method": "forward and backward occupancy filter on the 375 m grid (backend/model/occupancy.py)",
            "parameters": params.as_dict(),
            "learned_parts": learned,
            "status": model_status,
            "status_reason": model_reason,
            **({} if chal_doc is None else {"held_out_passes_estimated_by": chal_doc}),
            "detection_law": "Sofiev and Kouznetsov, Geosci. Model Dev. 19, 10123, 2026, Tables 1 and 2 (re-implemented)",
        },
        "encoding": {
            **ENC.describe(),
            "grid": "375 m cells shown on the 256 by 256 tensor grid by nearest cell",
            "cells_with_fire": lit,
            "cells_above_scale": saturated,
            "cells_below_floor": floored,
            "note": (
                "counts are 375 m cells over the 24 frames; a cell above the scale is written as the maximum and one "
                "below the floor as the floor; epoch_summaries and each frame's mean and max carry the exact values"
            ),
        },
        "footprints_per_frame_max": max(len(f["footprints"]) for f in frames_json),
    }
    belief_desc["url"] = f"/api/runs/{run_id}/belief_u8.bin"
    belief_desc["assimilated"] = hidden_text if holdout else "MODIS and VIIRS"
    extras["belief_frames"] = belief_desc
    if report is not None:
        extras["blind_test" if holdout else "fit_residuals"] = report

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


# Start dates are chosen from MODIS alone, the instrument that is visible in every kind of run, so the list is the
# same with VIIRS hidden, altered or absent. A start is worth showing when the 24 MODIS overpasses with a detection
# after it make one continuous episode: they fit in eight days (at least three MODIS overpasses a day flag the
# fire, of the four a day Terra and Aqua make), the first comes within a day of the start, and they flag at least
# 100 pixels in the box. The thresholds are stated in the answer so a caller can show them. A run itself plays the
# first 24 passes of the pass list from the first of those overpasses, about two days; the rule that says which
# days are worth showing counts MODIS overpasses with a detection all the same.
START_MAX_SPAN_H: float = 192.0
START_MIN_MODIS_PIXELS: int = 100
# No rule asks a start for a number of overpasses of each instrument: counting VIIRS overpasses would let the
# hidden rows choose the start. The value says the rule asks nothing, and a test holds it at zero.
START_MIN_PASSES_EACH: int = 0
# What each start carries that was counted from VIIRS rows: nothing. The list used to open the sealed rows once it
# was made, to count the VIIRS pixels of each window as a label; nobody read the count, and it was made for closed
# windows too. The sealed rows are not opened here.
START_LABELS_FROM_HIDDEN_ROWS: tuple[str, ...] = ()


def real_start_dates(
    spec: Any,
    first: str,
    last: str,
    read_firms: Callable[..., list[dict[str, str]]] | None = None,
    context_box: tuple[float, float, float, float] | None = None,
    row_source: str = ROW_SOURCE,
) -> dict[str, Any]:
    """For every UTC day from `first` to `last` inclusive: the 24 MODIS overpasses with a detection in the box
    from that day on, and whether the day is worth showing. `spec` is the region (`RegionSpec`); nothing is
    solved. A run started that day begins at the first of those overpasses.

    Everything here is made from MODIS rows. The VIIRS rows are sealed first and the sealed box is never opened:
    nothing about a start is counted from them, on an open window or a closed one."""
    bbox = (spec.bbox.west, spec.bbox.south, spec.bbox.east, spec.bbox.north)
    default_reader = read_firms is None
    if read_firms is None or context_box is None:
        from backend.firms import read_firms as _read, region_box as _box

        read_firms = read_firms or _read
        context_box = context_box or _box(spec.id)
    t0, t1 = parse_start_s(first), parse_start_s(last)
    if default_reader:
        rows = read_firms(context_box, _iso(t0)[:-1], _iso(t1 + SEARCH_S)[:-1], platforms=("Terra", "Aqua"))
    else:
        rows = read_firms(context_box, _iso(t0)[:-1], _iso(t1 + SEARCH_S)[:-1])
    det, _ = seal(detections_from_rows(rows, row_source), "VIIRS")       # the sealed box is dropped unopened

    items = in_box_overpasses(det, bbox)
    times = np.array([o.time_s for o, _ in items])
    starts: list[dict[str, Any]] = []
    day = t0
    while day <= t1 + 1.0:
        i0 = int(np.searchsorted(times, day, side="left"))
        entry: dict[str, Any] = {"start": _iso(day)[:10]}
        if i0 + FRAMES > len(items):
            entry.update(worth_showing=False, why_not="fewer than 24 MODIS overpasses with a detection in the box after this day")
        else:
            chunk = items[i0 : i0 + FRAMES]
            span = (chunk[-1][0].time_s - chunk[0][0].time_s) / 3600.0
            wait = (chunk[0][0].time_s - day) / 3600.0
            pixels = int(sum(k for _, k in chunk))
            reasons = []
            if span > START_MAX_SPAN_H:
                reasons.append(f"the 24 MODIS overpasses spread over {span:.0f} h")
            if wait > 24.0:
                reasons.append(f"the first MODIS overpass with a detection comes {wait:.0f} h after the start")
            if pixels < START_MIN_MODIS_PIXELS:
                reasons.append(f"MODIS flags only {pixels} pixels in the box")
            entry.update(
                first_overpass_utc=_iso(chunk[0][0].time_s),
                last_overpass_utc=_iso(chunk[-1][0].time_s),
                span_hours=round(span, 1),
                modis_overpasses=len(chunk),
                modis_pixels_in_box=pixels,
                worth_showing=not reasons,
                why_not="; ".join(reasons) if reasons else None,
            )
        starts.append(entry)
        day += 86400.0
    good = [e for e in starts if e["worth_showing"]]
    busiest = [e["start"] for e in sorted(good, key=lambda e: -e["modis_pixels_in_box"])[:5]]
    return {
        "region_id": spec.id,
        "source": "firms",
        "first": _iso(t0)[:10],
        "last": _iso(t1)[:10],
        "rule": (
            f"a start date is worth showing when the 24 MODIS overpasses after it span at most {START_MAX_SPAN_H:.0f} h, "
            f"begin within 24 h of the start, and flag at least {START_MIN_MODIS_PIXELS} pixels in the region box"
        ),
        "chosen_from": "MODIS rows only; no VIIRS row is read to choose, drop or rank a start",
        "labels_from_hidden_rows": list(START_LABELS_FROM_HIDDEN_ROWS),
        "describes": (
            "the 24 MODIS overpasses with a detection in the box from the start day on, which the rule judges. A run "
            "begins at the first of them (first_overpass_utc) and plays 24 passes of every platform from the pass "
            "list, about two days, so span_hours and last_overpass_utc describe the rule's overpasses and not the "
            "length of a run"
        ),
        "starts": starts,
        "worth_showing": [e["start"] for e in good],
        "busiest": busiest,
    }


# The period searched for start dates in each hero region (the 2021 fire the preset was chosen for) and the start a
# page should open on. Plumas opens on its busiest worth-showing day; Lytton and Evia on the day their fire began.
# "Busiest" is read from MODIS rows alone, over 24 MODIS overpasses: 2021-07-20.
START_PERIODS: dict[str, tuple[str, str]] = {
    "plumas_ca": ("2021-07-01", "2021-08-31"),
    "lytton_bc": ("2021-06-25", "2021-08-31"),
    "evia_greece": ("2021-08-01", "2021-08-31"),
}
DEFAULT_STARTS: dict[str, str] = {"plumas_ca": "2021-07-20", "lytton_bc": "2021-06-30", "evia_greece": "2021-08-03"}


def real_run_starts(
    spec: Any,
    read_firms: Callable[..., list[dict[str, str]]] | None = None,
    context_box: tuple[float, float, float, float] | None = None,
) -> dict[str, Any]:
    """What the calendar's `real_run_starts` and `GET /api/runs/starts` should carry for a region.

    `starts` holds only the days worth showing, each `{start, label, ...}` with `start` a UTC date the reconstruct
    route accepts as `start`. `default_start` is the one to open on. A region with no period defined answers with
    an empty list and says why.
    """
    if spec.id not in START_PERIODS:
        return {"region_id": spec.id, "source": "firms", "default_start": None, "starts": [],
                "note": "no real FIRMS rows are cached for this region"}
    first, last = START_PERIODS[spec.id]
    full = real_start_dates(spec, first, last, read_firms=read_firms, context_box=context_box)
    starts = [
        {"start": e["start"], "label": e["start"], "first_overpass_utc": e["first_overpass_utc"],
         "last_overpass_utc": e["last_overpass_utc"], "span_hours": e["span_hours"],
         "modis_overpasses": e["modis_overpasses"], "modis_pixels_in_box": e["modis_pixels_in_box"]}
        for e in full["starts"] if e["worth_showing"]
    ]
    default = DEFAULT_STARTS.get(spec.id)
    if default not in {s["start"] for s in starts}:
        default = full["busiest"][0] if full["busiest"] else None
    return {
        "region_id": spec.id,
        "source": "firms",
        "period": [first, last],
        "rule": full["rule"],
        "chosen_from": full["chosen_from"],
        "labels_from_hidden_rows": full["labels_from_hidden_rows"],
        "describes": full["describes"],
        "default_start": default,
        "busiest": full["busiest"],
        "starts": starts,
    }


def real_response(solved: SolvedRealRun, assets: dict[str, Any]) -> dict[str, Any]:
    """The `/api/reconstruct` response for a real run: a simulated run's keys, then the additive ones.

    `assets` is built by the server exactly as for a simulated run.
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
