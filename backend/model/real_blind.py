"""The reconstruction as a blind-test method, the choice of the 24 overpass window, and training rows.

Nothing here reads a hidden row to build an estimate: `ReconstructionMethod` is constructed by the harness from the
visible rows only, and a hidden overpass reaches it as a `Target` (time, platform, pixel size).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from backend.eval.baselines import OverlapRatioFit, fit_overlap_ratio
from backend.eval.blind_test import Method, Prediction, Target
from backend.eval.grid import EvalGrid
from backend.eval.overpass import Overpass, group_overpasses
from backend.eval.rows import Detections
from backend.model.occupancy import OccupancyParams, OccupancyReconstruction, expected_count_cells
from backend.model.platforms import family

FRAMES: int = 24


class ReconstructionMethod:
    """Isogon's reconstruction from the visible instrument alone, asked what the hidden instrument will report."""

    def __init__(self, visible: Detections, grid: EvalGrid, params: OccupancyParams, name: str, label: str) -> None:
        self.name = name
        self.label = label
        self.grid = grid
        self.recon = OccupancyReconstruction(grid, visible, params)

    def predict(self, target: Target) -> Prediction:
        pixel_area = float(target.scan_km * target.track_km)
        out = self.recon.predict_hidden(target.time_s, family(target.platform), target.is_day, pixel_area)
        # a flagged pixel covers about pixel area / cell area cells (never fewer than one)
        per_pixel = max(1.0, pixel_area / self.grid.cell_area_km2)
        return Prediction(
            p_detect=out["p_detect"],
            frp_mw=out["frp_mw"],
            frp_total_mw=out["total_mw"],
            frp_total_lo=out["lo_mw"],
            frp_total_hi=out["hi_mw"],
            level=out["level"],
            cells=expected_count_cells(out["p_detect"]),
            pixels=float(out["p_detect"].sum()) / per_pixel,
        )


def reconstruction_factory(params: OccupancyParams, name: str = "reconstruction", label: str | None = None):
    text = label or (
        "occupancy filter on the 375 m grid from the visible instrument only; parameters: " + params.fitted_on
    )

    def factory(visible: Detections, grid: EvalGrid) -> Method:
        return ReconstructionMethod(visible, grid, params, name, text)

    return factory


@dataclass(frozen=True)
class Window:
    """24 consecutive overpasses that flagged something inside the test box."""

    passes: tuple[Overpass, ...]         # in time order; indices refer to the Detections they were grouped from
    start_s: float
    end_s: float                         # one second after the last pass, so [start_s, end_s) holds all 24
    n_modis: int
    n_viirs: int
    modis_pixels_in_box: int
    viirs_pixels_in_box: int
    rule: str

    def as_dict(self) -> dict[str, Any]:
        iso = lambda t: str(np.datetime64(int(round(t)), "s")) + "Z"  # noqa: E731
        return {
            "first_overpass_utc": iso(self.start_s),
            "last_overpass_utc": iso(self.end_s - 1.0),
            "overpasses": len(self.passes),
            "modis_overpasses": self.n_modis,
            "viirs_overpasses": self.n_viirs,
            "modis_pixels_in_box": self.modis_pixels_in_box,
            "viirs_pixels_in_box": self.viirs_pixels_in_box,
            "span_hours": round((self.end_s - 1.0 - self.start_s) / 3600.0, 2),
            "rule": self.rule,
        }


def in_box_overpasses(det: Detections, box: tuple[float, float, float, float]) -> list[tuple[Overpass, int]]:
    """(overpass, number of its pixels centred in the box) for every overpass with at least one pixel in the box."""
    inb = det.in_box(box)
    out = []
    for op in group_overpasses(det):
        n = int(inb[op.index].sum())
        if n > 0:
            out.append((op, n))
    return out


def _window_from(items: list[tuple[Overpass, int]], i0: int, rule: str, n: int = FRAMES) -> Window:
    chunk = items[i0 : i0 + n]
    if len(chunk) < n:
        raise ValueError(f"only {len(chunk)} overpasses with detections in the box from that start; {n} are needed")
    mod = [(o, k) for o, k in chunk if o.family == "MODIS"]
    vii = [(o, k) for o, k in chunk if o.family == "VIIRS"]
    return Window(
        passes=tuple(o for o, _ in chunk),
        start_s=chunk[0][0].time_s,
        end_s=chunk[-1][0].time_s + 1.0,
        n_modis=len(mod),
        n_viirs=len(vii),
        modis_pixels_in_box=sum(k for _, k in mod),
        viirs_pixels_in_box=sum(k for _, k in vii),
        rule=rule,
    )


def window_from_start(det: Detections, box: tuple[float, float, float, float], start_s: float, n: int = FRAMES) -> Window:
    """The first `n` overpasses at or after `start_s` that flagged a pixel inside the box."""
    items = in_box_overpasses(det, box)
    i0 = next((i for i, (o, _) in enumerate(items) if o.time_s >= start_s), len(items))
    return _window_from(items, i0, "the first 24 overpasses at or after the requested start with a detection in the box", n)


def pick_window(
    det: Detections, box: tuple[float, float, float, float], earliest_s: float, latest_s: float, n: int = FRAMES
) -> Window:
    """Choose the window by a rule that never looks at the hidden instrument's values.

    Among all runs of `n` consecutive in-box overpasses that start in [earliest_s, latest_s), take the one whose
    MODIS overpasses flagged the most pixels inside the box; ties go to the earliest. MODIS is the visible
    instrument of the blind test, so the rule picks the stretch where the method has the most to work with and
    uses nothing of what it will be scored against.
    """
    items = in_box_overpasses(det, box)
    best: tuple[int, int] | None = None
    for i0 in range(0, len(items) - n + 1):
        t0 = items[i0][0].time_s
        if not (earliest_s <= t0 < latest_s):
            continue
        score = sum(k for o, k in items[i0 : i0 + n] if o.family == "MODIS")
        if best is None or score > best[0]:
            best = (score, i0)
    if best is None:
        raise ValueError("no run of 24 in-box overpasses starts in the period given")
    return _window_from(
        items, best[1],
        "of all runs of 24 consecutive overpasses with a detection in the box that start in the period, the one "
        "whose MODIS overpasses flagged the most pixels in the box (the hidden VIIRS values are not consulted)", n,
    )


def exclude_box(det: Detections, box: tuple[float, float, float, float], margin_deg: float = 0.0) -> Detections:
    """Rows whose pixel centre lies outside the box grown by `margin_deg` on every side."""
    w, s, e, n = box
    grown = (w - margin_deg, s - margin_deg, e + margin_deg, n + margin_deg)
    return det.select(~det.in_box(grown))


def fit_ratio_on(det_train: Detections, trained_on: str) -> OverlapRatioFit:
    return fit_overlap_ratio(det_train, trained_on=trained_on)
