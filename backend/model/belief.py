"""Belief frames: what the model believes between overpasses, at fixed time steps.

A belief frame is the forward filter's state at one time: for every 375 m cell the probability that it is burning
and its expected fire radiative power, using only the overpasses assimilated up to that time. Between overpasses
the belief spreads (burning probability moves ahead of the front and thins); at each assimilated overpass it
tightens onto the pixels that pass flagged. This is the causal view, on purpose: the 24 frames of the payload hold
the smoothed estimate that also uses later passes, and a viewer should be able to see the difference.

Packing: two bytes per cell and step, row 0 north, column 0 west.
  byte 0  probability of burning, 0 to 1 as 0 to 255
  byte 1  expected FRP density in MW/km2 on the logarithmic scale of real runs (backend/model/encoding.py):
          0 is none, 1 to 255 run from 0.01 to 10,000 MW/km2

Also here: the prior placement measure, the share of the forecast's FRP that falls on cells where the
next VIIRS pass flags nothing.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.eval.grid import EvalGrid, paint
from backend.eval.overpass import group_overpasses
from backend.eval.rows import Detections
from backend.model import encoding as ENC
from backend.model.occupancy import GridState, OccupancyParams, OccupancyReconstruction, predict

STEP_S: float = 1800.0
SUPPORT_PROBABILITY: float = 0.01


def forward_state(recon: OccupancyReconstruction, time_s: float) -> tuple[GridState, float | None]:
    """The forward filter's state at `time_s` and the hours since the last assimilated pass (None before the first)."""
    i_prev = int(np.searchsorted(recon.times, time_s, side="right")) - 1
    if i_prev < 0:
        return GridState.empty(recon.grid.shape), None
    t0 = float(recon.times[i_prev])
    age = (time_s - t0) / 3600.0
    return predict(recon._fwd[i_prev], age, recon.grid.cell_km, recon.params, recon._ratio(t0, time_s)), age


def _iso(t: float) -> str:
    return str(np.datetime64(int(round(t)), "s")) + "Z"


def belief_frames(
    recon: OccupancyReconstruction, start_s: float, end_s: float, step_s: float = STEP_S
) -> tuple[bytes, dict[str, Any]]:
    """(packed bytes, descriptor) for fixed steps from `start_s` to `end_s` inclusive."""
    grid = recon.grid
    n = int(np.floor((end_s - start_s) / step_s)) + 1
    times = start_s + step_s * np.arange(n)
    out = np.zeros((n, grid.ny, grid.nx, 2), dtype=np.uint8)
    area = grid.cell_area_km2
    stats: list[dict[str, Any]] = []
    for k, t in enumerate(times):
        st, age = forward_state(recon, float(t))
        out[k, :, :, 0] = np.clip(np.rint(st.a * 255.0), 0, 255).astype(np.uint8)
        out[k, :, :, 1] = ENC.encode_u8(st.F / area)
        support = int((st.a >= SUPPORT_PROBABILITY).sum())
        expected = float(st.a.sum())
        stats.append({
            "step": k,
            "time_utc": _iso(float(t)),
            "hours_since_last_assimilated_pass": None if age is None else round(age, 2),
            "cells_that_may_burn": support,                     # cells with burning probability of 0.01 or more
            "expected_burning_cells": round(expected, 1),
            "sharpness": round(expected / support, 4) if support else None,   # mean probability over those cells
            "expected_frp_mw": round(float(st.F.sum()), 1),
        })
    passes = [
        {"time_utc": _iso(p.time_s), "sensor": p.platform, "pixels_in_box": p.n_in_grid,
         "first_step_after": int(np.searchsorted(times, p.time_s, side="left"))}
        for p in recon.passes if start_s <= p.time_s <= end_s
    ]
    descriptor = {
        "asset": "belief_u8.bin",
        "bytes": int(out.nbytes),
        "steps": n,
        "step_minutes": step_s / 60.0,
        "first_time_utc": _iso(float(times[0])),
        "last_time_utc": _iso(float(times[-1])),
        "grid": {"nx": grid.nx, "ny": grid.ny, "cell_km": grid.cell_km, "bbox": [round(v, 6) for v in grid.bbox],
                 "row_0": "north", "column_0": "west"},
        "layout": "steps x ny x nx x 2, uint8, C order",
        "channels": [
            {"name": "p_burning", "meaning": "probability the cell is burning", "decode": "value / 255"},
            {"name": "expected_frp_density", "meaning": "expected FRP density, MW/km2",
             "decode": ENC.describe()["decode"], "scale": "log10", "min_mw_km2": ENC.LOG_MIN_MW_KM2,
             "max_mw_km2": ENC.LOG_MAX_MW_KM2, "same_as": "the run's encoding block"},
        ],
        "view": (
            "forward filter only: each step uses the overpasses assimilated up to its time, so the belief spreads "
            "between passes and tightens at each one. The 24 payload frames hold the smoothed estimate instead."
        ),
        "assimilated_passes": passes,
        "per_step": stats,
    }
    return out.tobytes(order="C"), descriptor


def prior_placement(
    grid: EvalGrid, det: Detections, params: OccupancyParams, window: tuple[float, float] | None = None,
    assimilate: str = "all",
) -> dict[str, Any]:
    """Where the forecast puts its FRP just before each VIIRS overpass, against what that overpass then flags.

    For every VIIRS overpass with detections in the box: take the forward state built from earlier passes only
    (`assimilate` 'all' uses MODIS and VIIRS, 'modis' uses MODIS alone), forecast it to the overpass time, and
    measure the share of its FRP on cells the overpass does not flag (`off_target`). Two reference forecasts are
    measured the same way: `persistence`, the cells flagged by the previous VIIRS overpass with nothing moved, and
    `previous_viirs_dilated`, the same cells grown by one cell, which is what a forecast that knew only "the fire
    is near where it was" could do. Shares are FRP weighted and pooled over the overpasses.
    """
    inside = det.select(det.in_box(grid.bbox))
    viirs_passes = [p for p in group_overpasses(inside) if p.family == "VIIRS"]
    if window is not None:
        viirs_passes = [p for p in viirs_passes if window[0] <= p.time_s < window[1]]
    visible = det if assimilate == "all" else det.select(det.is_modis)
    recon = OccupancyReconstruction(grid, visible, params)
    from backend.eval.grid import dilate

    tot = {"model": 0.0, "persistence": 0.0, "previous_viirs_dilated": 0.0}
    off = {"model": 0.0, "persistence": 0.0, "previous_viirs_dilated": 0.0}
    n_scored = 0
    prev_truth = None
    rows: list[dict[str, Any]] = []
    for op in viirs_passes:
        truth = paint(grid, inside.select(op.index))
        # the state strictly before this pass: predict from the last pass earlier than it
        i_prev = int(np.searchsorted(recon.times, op.time_s, side="left")) - 1
        if i_prev >= 0:
            t0 = float(recon.times[i_prev])
            st = predict(recon._fwd[i_prev], (op.time_s - t0) / 3600.0, grid.cell_km, params, recon._ratio(t0, op.time_s))
            f = st.F
            if f.sum() > 0:
                tot["model"] += float(f.sum())
                off["model"] += float(f[~truth.mask].sum())
                n_scored += 1
                row = {"time_utc": _iso(op.time_s), "sensor": op.platform, "off_target_model": round(float(f[~truth.mask].sum() / f.sum()), 4)}
                if prev_truth is not None and prev_truth.frp_mw.sum() > 0:
                    pf = prev_truth.frp_mw
                    tot["persistence"] += float(pf.sum())
                    off["persistence"] += float(pf[~truth.mask].sum())
                    grown = dilate(prev_truth.mask, 1).astype(np.float64)
                    tot["previous_viirs_dilated"] += float(grown.sum())
                    off["previous_viirs_dilated"] += float(grown[~truth.mask].sum())
                    row["off_target_persistence"] = round(float(pf[~truth.mask].sum() / pf.sum()), 4)
                rows.append(row)
        prev_truth = truth
    return {
        "assimilated": "MODIS and VIIRS" if assimilate == "all" else "MODIS only",
        "viirs_overpasses_scored": n_scored,
        "off_target_share": {k: (round(off[k] / tot[k], 4) if tot[k] > 0 else None) for k in tot},
        "definition": (
            "FRP weighted share of a forecast that lies on 375 m cells the VIIRS overpass does not flag, pooled over "
            "the VIIRS overpasses of the window. model: the forward filter forecast from earlier passes. persistence: "
            "the previous VIIRS overpass's own FRP left where it was. previous_viirs_dilated: the previous VIIRS "
            "overpass's cells grown by one cell, equal weight per cell."
        ),
        "per_overpass": rows,
    }
