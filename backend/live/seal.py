"""One sealed prediction: the three methods' answers for one coming pass, from the MODIS rows published so far.

The visible rows are every MODIS row of the fire's context box (five times the box on each side, as a run reads
it) acquired in the two days before the seal, from the replies fetched up to the seal. Pixels outside the box still
prove that a pass looked, as in a run. The methods are the blind test's own: `painted_modis`, `overlap_ratio` (with
no calendar pixel count, since a new box has no calendar) and the estimate. Each answer is fixed as the blind test
fixes it (`_published_entry`), and its arrays are kept in a file named by their digest so the scorer can read the
very prediction back.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import numpy as np

from backend.eval.baselines import OverlapRatioFit, overlap_ratio_factory, painted_modis_factory
from backend.eval.blind_test import Prediction, _published_entry, declared, publish
from backend.eval.grid import CELL_KM, EvalGrid
from backend.eval.rows import Detections, detections_from_rows, parse_acq_time_s
from backend.eval.schedule import Slot
from backend.firms.archive import DEDUP_FIELDS
from backend.live import protocol as PR
from backend.live.fetch import csv_rows
from backend.model.occupancy import OccupancyParams
from backend.model.real_blind import reconstruction_factory

ROW_SOURCE: str = "NASA FIRMS near real time rows (MODIS_NRT), read through the area API at the time of the seal"
CONTEXT_SCALE: int = 5


def context_box(box: tuple[float, float, float, float] | list[float]) -> tuple[float, float, float, float]:
    w, s, e, n = (float(v) for v in box)
    cx, cy, hx, hy = 0.5 * (w + e), 0.5 * (s + n), 0.5 * (e - w) * CONTEXT_SCALE, 0.5 * (n - s) * CONTEXT_SCALE
    return (round(cx - hx, 6), round(max(-90.0, cy - hy), 6), round(cx + hx, 6), round(min(90.0, cy + hy), 6))


def visible_rows(texts: list[str], ctx: tuple[float, float, float, float], until_s: float) -> tuple[Detections, dict[str, Any]]:
    """MODIS rows inside `ctx` acquired in the window before `until_s`, exact duplicates dropped (first kept).
    Replies are given oldest first. A row of any other instrument stops the seal."""
    seen: set[tuple[str, ...]] = set()
    keep: list[dict[str, str]] = []
    dups = 0
    w, s, e, n = ctx
    for text in texts:
        for r in csv_rows(text):
            if str(r.get("instrument", "")).strip().upper() != "MODIS":
                raise ValueError("a reply of the sealing path held a row that is not MODIS")
            lon, lat = float(r["longitude"]), float(r["latitude"])
            if not (w <= lon <= e and s <= lat <= n):
                continue
            t = parse_acq_time_s(r["acq_date"], r["acq_time"])
            if not (until_s - PR.VISIBLE_WITHIN_S <= t <= until_s):
                continue
            k = tuple(str(r[f]) for f in DEDUP_FIELDS)
            if k in seen:
                dups += 1
                continue
            seen.add(k)
            keep.append(r)
    det = detections_from_rows(keep, ROW_SOURCE)
    info = {
        "rows": len(det),
        "duplicates_dropped": dups,
        "latest_row_utc": None if len(det) == 0 else str(np.datetime64(int(det.time_s.max()), "s")) + "Z",
        "earliest_row_utc": None if len(det) == 0 else str(np.datetime64(int(det.time_s.min()), "s")) + "Z",
        "window_s": [until_s - PR.VISIBLE_WITHIN_S, until_s],
        "rows_sha256": hashlib.sha256(PR.canonical(sorted(k for k in seen))).hexdigest(),
    }
    return det, info


def factories(params: OccupancyParams, ratio_fit: OverlapRatioFit) -> list[Any]:
    return [painted_modis_factory, overlap_ratio_factory(ratio_fit, None), reconstruction_factory(params)]


def predict(visible: Detections, box: tuple[float, float, float, float], slot: Slot, params: OccupancyParams,
            ratio_fit: OverlapRatioFit) -> tuple[EvalGrid, dict[str, Prediction], dict[str, str]]:
    grid = EvalGrid.from_bbox(tuple(box), CELL_KM)
    methods = [f(visible, grid) for f in factories(params, ratio_fit)]
    if tuple(m.name for m in methods) != PR.METHODS:
        raise RuntimeError("the methods are not the ones the protocol names")
    row = publish(methods, [slot], grid)[0]
    return grid, row, {m.name: m.label for m in methods}


def _f(v: float | None) -> float | None:
    return None if v is None else float(v)


def scalars(pred: Prediction) -> dict[str, Any]:
    """Every number of a prediction outside its arrays, exactly (JSON keeps a float's every digit)."""
    return {
        "frp_total_mw": float(pred.frp_total_mw), "frp_total_lo": _f(pred.frp_total_lo), "frp_total_hi": _f(pred.frp_total_hi),
        "level": _f(pred.level), "cells_given": pred.cells is not None, "pixels": _f(pred.pixels),
        "pixels_lo": _f(pred.pixels_lo), "pixels_hi": _f(pred.pixels_hi), "pixels_level": _f(pred.pixels_level),
    }


def arrays_bytes(preds: dict[str, Prediction]) -> bytes:
    """For each method in the protocol's order: p_detect (float64), frp_mw (float64), declared cells (uint8), row by row."""
    parts = []
    for name in PR.METHODS:
        p = preds[name]
        parts += [np.ascontiguousarray(p.p_detect, dtype="<f8").tobytes(), np.ascontiguousarray(p.frp_mw, dtype="<f8").tobytes(),
                  np.ascontiguousarray(declared(p), dtype=np.uint8).tobytes()]
    return b"".join(parts)


def read_predictions(raw: bytes, shape: tuple[int, int], sc: dict[str, dict[str, Any]]) -> dict[str, Prediction]:
    ny, nx = shape
    n = ny * nx
    per = 8 * n + 8 * n + n
    if len(raw) != per * len(PR.METHODS):
        raise ValueError("the arrays file has the wrong size")
    out = {}
    for k, name in enumerate(PR.METHODS):
        o = k * per
        pd = np.frombuffer(raw[o:o + 8 * n], dtype="<f8").reshape(ny, nx).astype(np.float64)
        fm = np.frombuffer(raw[o + 8 * n:o + 16 * n], dtype="<f8").reshape(ny, nx).astype(np.float64)
        ce = np.frombuffer(raw[o + 16 * n:o + per], dtype=np.uint8).reshape(ny, nx).astype(bool)
        s = sc[name]
        out[name] = Prediction(
            p_detect=pd, frp_mw=fm, frp_total_mw=s["frp_total_mw"], frp_total_lo=s["frp_total_lo"],
            frp_total_hi=s["frp_total_hi"], level=s["level"], cells=ce if s["cells_given"] else None,
            pixels=s["pixels"], pixels_lo=s["pixels_lo"], pixels_hi=s["pixels_hi"], pixels_level=s["pixels_level"],
        )
    return out


def write_arrays(arrays_dir: Path, raw: bytes) -> dict[str, Any]:
    sha = hashlib.sha256(raw).hexdigest()
    dest = Path(arrays_dir) / f"{sha}.bin"
    if not dest.is_file():
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(".tmp")
        tmp.write_bytes(raw)
        tmp.replace(dest)
    return {"file": dest.name, "sha256": sha, "bytes": len(raw)}


def published(slot: Slot, preds: dict[str, Prediction]) -> dict[str, dict[str, Any]]:
    return {name: _published_entry(slot, preds[name]) for name in PR.METHODS}
