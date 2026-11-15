"""The reconstruction as a blind-test method, the choice of the overpass window, and training rows.

Nothing here reads a hidden row. `ReconstructionMethod` is built by the harness from the visible rows only and is
asked about a scheduled look (`Target`: platform, time, day or night, pixel size), never about a hidden overpass.
The window functions drop the hidden instrument's rows before they look at anything (`backend.eval.holdout`), so
a window is the same whether the hidden rows are present, altered or absent.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from backend.eval.baselines import OverlapRatioFit, fit_overlap_ratio
from backend.eval.blind_test import Method, Prediction, Target
from backend.eval.grid import EvalGrid
from backend.eval.holdout import hidden_mask, visible_rows
from backend.eval.overpass import Overpass, group_overpasses
from backend.eval import schedule as S
from backend.eval.rows import Detections
from backend.eval.schedule import Slot
from backend.model.occupancy import OccupancyParams, OccupancyReconstruction, expected_count_cells
from backend.model.platforms import archive_platforms, family

# Frames of a run: the tensor the page plays holds 24.
FRAMES: int = 24
# Overpasses of the visible instrument in a blind-test episode. Twelve MODIS overpasses span about two days, the
# length of a window of 24 overpasses counted over both instruments.
EPISODE_OVERPASSES: int = 12


class ReconstructionMethod:
    """Isogon's reconstruction from the visible instrument alone, asked what the hidden instrument will report."""

    def __init__(
        self,
        visible: Detections,
        grid: EvalGrid,
        params: OccupancyParams,
        name: str,
        label: str,
        recon: OccupancyReconstruction | None = None,
    ) -> None:
        self.name = name
        self.label = label
        self.grid = grid
        self.recon = (
            recon
            if (recon is not None and recon.grid == grid and recon.params == params)
            else OccupancyReconstruction(grid, visible, params)
        )

    def predict(self, target: Target) -> Prediction:
        pixel_area = float(target.scan_km * target.track_km)
        out = self.recon.predict_hidden(
            target.time_s, family(target.platform), target.is_day, pixel_area, track_km=float(target.track_km),
            scan_km=float(target.scan_km),
        )
        # a flagged pixel covers about pixel area / cell area cells (never fewer than one); scan overlap adds pixels
        per_pixel = max(1.0, pixel_area / self.grid.cell_area_km2) / out["overlap_factor"]
        pixels = float(out["p_detect"].sum()) / per_pixel
        prm = self.recon.params
        pix_iv = {}
        if prm.pixel_interval_lo is not None and prm.pixel_interval_hi is not None:
            pix_iv = {"pixels_lo": pixels * prm.pixel_interval_lo, "pixels_hi": pixels * prm.pixel_interval_hi, "pixels_level": 0.90}
        return Prediction(
            p_detect=out["p_detect"],
            frp_mw=out["frp_mw"],
            frp_total_mw=out["total_mw"],
            frp_total_lo=out["lo_mw"],
            frp_total_hi=out["hi_mw"],
            level=out["level"],
            cells=expected_count_cells(out["p_detect"]),
            pixels=pixels,
            **pix_iv,
        )


def reconstruction_factory(
    params: OccupancyParams,
    name: str = "reconstruction",
    label: str | None = None,
    recon: OccupancyReconstruction | None = None,
):
    text = label or (
        "occupancy filter on the 375 m grid from the visible instrument only; parameters: " + params.fitted_on
    )

    def factory(visible: Detections, grid: EvalGrid) -> Method:
        return ReconstructionMethod(visible, grid, params, name, text, recon=recon)

    return factory


@dataclass(frozen=True)
class Window:
    """Consecutive overpasses of the visible rows that flagged something inside the box."""

    passes: tuple[Overpass, ...]         # in time order; indices refer to the visible rows they were grouped from
    start_s: float
    end_s: float                         # one second after the last pass, so [start_s, end_s) holds every pass
    n_modis: int
    n_viirs: int
    modis_pixels_in_box: int
    viirs_pixels_in_box: int
    rule: str
    chosen_from: str = "every row given"
    # A run whose frames come from the pass list: every pass that covered the box is a frame, fire or no fire.
    frames_from: str = "detections"
    frames: int | None = None                # frames of the run when they are passes of the list
    passes_with_no_visible_detection: int = 0
    hidden_passes: int = 0                   # frames that are passes of a hidden platform (the estimate only)

    def as_dict(self) -> dict[str, Any]:
        iso = lambda t: str(np.datetime64(int(round(t)), "s")) + "Z"  # noqa: E731
        return {
            "first_overpass_utc": iso(self.start_s),
            "last_overpass_utc": iso(self.end_s - 1.0),
            "overpasses": len(self.passes) if self.frames is None else self.frames,
            "modis_overpasses": self.n_modis,
            "viirs_overpasses": self.n_viirs,
            "modis_pixels_in_box": self.modis_pixels_in_box,
            "viirs_pixels_in_box": self.viirs_pixels_in_box,
            "span_hours": round((self.end_s - 1.0 - self.start_s) / 3600.0, 2),
            "rule": self.rule,
            "chosen_from": self.chosen_from,
            "frames_from": self.frames_from,
            "hidden_passes": self.hidden_passes,
            "passes_with_no_visible_detection": self.passes_with_no_visible_detection,
        }


@dataclass(frozen=True)
class Frame:
    """One frame of a run. From the pass list it is a pass that covered the box (`slot`), with the visible rows of
    that pass in the box (`rows`, positions in the rows the caller gave; empty for a pass of a hidden platform or one that
    flagged nothing). From detections alone it is an overpass of the visible rows (`overpass`)."""

    time_s: float
    platform: str
    is_day: bool
    hidden: bool
    rows: Any                               # NDArray[np.int64]: positions in the rows given, pixel centre in the box
    slot: Slot | None = None
    overpass: Overpass | None = None


def in_box_overpasses(det: Detections, box: tuple[float, float, float, float]) -> list[tuple[Overpass, int]]:
    """(overpass, number of its pixels centred in the box) for every overpass with at least one pixel in the box."""
    inb = det.in_box(box)
    out = []
    for op in group_overpasses(det):
        n = int(inb[op.index].sum())
        if n > 0:
            out.append((op, n))
    return out


def _chosen_from(hidden: str | None) -> str:
    if hidden is None:
        return "every row given (nothing is hidden)"
    return f"{'MODIS' if hidden == 'VIIRS' else 'VIIRS'} rows only ({hidden} is hidden and was dropped before choosing)"


def _window_from(items: list[tuple[Overpass, int]], i0: int, rule: str, n: int = FRAMES, chosen_from: str = "every row given") -> Window:
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
        chosen_from=chosen_from,
    )


def window_from_start(
    det: Detections, box: tuple[float, float, float, float], start_s: float, n: int = EPISODE_OVERPASSES,
    hidden: str | None = "VIIRS",
) -> Window:
    """The first `n` overpasses of the visible rows at or after `start_s` that flagged a pixel inside the box.

    Rows of the `hidden` instrument are dropped first, so they cannot move the window; pass `hidden=None` only for
    a run in which nothing is hidden. `n` defaults to a blind-test episode's twelve; a run asks for its `FRAMES`.
    The window's overpass indices refer to `visible_rows(det, hidden)`.
    """
    items = in_box_overpasses(visible_rows(det, hidden), box)
    i0 = next((i for i, (o, _) in enumerate(items) if o.time_s >= start_s), len(items))
    return _window_from(
        items, i0, f"the first {n} overpasses at or after the requested start with a detection in the box", n,
        _chosen_from(hidden),
    )


FRAMES_RULE: str = (
    "from the first MODIS overpass with a detection in the box at or after the requested start, the first {n} passes "
    "whose swath held the whole box, of every platform, fire or no fire (NASA CMR granule list). MODIS is visible in "
    "every kind of run, so a run with VIIRS hidden and a run with nothing hidden play the same passes."
)


def run_frames(
    det: Detections, box: tuple[float, float, float, float], start_s: float, n: int = FRAMES, hidden: str | None = "VIIRS",
    read_passes: S.PassReader | None = None, search_s: float = 30.0 * 86400.0, leave_out: tuple[str, ...] = (),
) -> tuple[list[Frame], Window]:
    """The frames of a run and the window they span.

    Rows of the `hidden` instrument are dropped first. The run starts at the first MODIS overpass with a detection
    in the box at or after `start_s`. Where a pass list answers for the days after it, the frames are the first
    `n` passes that covered the box, of every platform in the archive: a pass of a visible platform carries its
    rows, a pass of a hidden platform carries nothing but the estimate, and a pass that flagged nothing is a frame
    all the same. Neither the start nor the list depends on a hidden row, and neither depends on whether anything
    is hidden, so the two kinds of run cover the same passes.

    Without a pass list the frames are the first `n` overpasses of the visible rows with a detection in the box,
    and the window says so. `leave_out` names platforms whose passes are no frame at all: platforms whose rows the
    cache does not hold for the window (`backend.model.cached_platforms`).
    """
    back = np.flatnonzero(~hidden_mask(det, hidden))          # position in `det` of every visible row
    vis = det.select(back)
    modis = [(o, k) for o, k in in_box_overpasses(vis.select(vis.is_modis), box) if o.time_s >= start_s]
    try:
        if not modis:
            raise LookupError("no MODIS overpass with a detection in the box at or after that start")
        t0 = modis[0][0].time_s
        every = tuple(p for p in archive_platforms("MODIS", t0, t0 + search_s) + archive_platforms("VIIRS", t0, t0 + search_s)
                      if p not in leave_out)
        # the anchor's own pass crossed the box within the minute before its rows' time stamp or after it
        slots, _ = S.pass_slots(every, t0 - 120.0, t0 + search_s, box, read_passes)
    except LookupError as exc:
        return _frames_from_detections(vis, back, box, start_s, n, hidden, str(exc))
    slots = slots[:n]
    if len(slots) < n:
        raise ValueError(f"only {len(slots)} passes covered the box after that start in the pass list; {n} are needed")
    inb = vis.in_box(box)
    frames: list[Frame] = []
    for s in slots:
        is_hidden = hidden is not None and family(s.platform) == hidden
        rows = S.rows_of_slot(vis.time_s, vis.platform_code, s)
        frames.append(Frame(s.time_s, s.platform, s.is_day, is_hidden, back[rows[inb[rows]]], slot=s))
    seen = [f for f in frames if not f.hidden]
    win = Window(
        passes=(),
        start_s=frames[0].time_s,
        end_s=frames[-1].time_s + 1.0,
        n_modis=sum(1 for f in frames if family(f.platform) == "MODIS"),
        n_viirs=sum(1 for f in frames if family(f.platform) == "VIIRS"),
        modis_pixels_in_box=int(sum(f.rows.size for f in seen if family(f.platform) == "MODIS")),
        viirs_pixels_in_box=int(sum(f.rows.size for f in seen if family(f.platform) == "VIIRS")),
        rule=FRAMES_RULE.format(n=n),
        chosen_from="MODIS rows for the start and the pass list for the frames; no row of a hidden instrument",
        frames_from=S.SOURCE_CMR,
        frames=len(frames),
        passes_with_no_visible_detection=sum(1 for f in seen if f.rows.size == 0),
        hidden_passes=sum(1 for f in frames if f.hidden),
    )
    return frames, win


def _frames_from_detections(
    vis: Detections, back: Any, box: tuple[float, float, float, float], start_s: float, n: int, hidden: str | None, why: str
) -> tuple[list[Frame], Window]:
    """The frames where no pass list answers: overpasses of the visible rows with a detection in the box."""
    from dataclasses import replace

    win = window_from_start(vis, box, start_s, n=n, hidden=hidden)
    inb = vis.in_box(box)
    frames = [Frame(o.time_s, o.platform, bool(o.is_day), False, back[o.index[inb[o.index]]], overpass=o) for o in win.passes]
    return frames, replace(win, frames_from=f"detections ({why})")


def pick_window(
    det: Detections, box: tuple[float, float, float, float], earliest_s: float, latest_s: float,
    n: int = EPISODE_OVERPASSES, hidden: str | None = "VIIRS",
) -> Window:
    """Choose a blind-test window from the visible rows alone.

    Rows of the `hidden` instrument are dropped first. Among all runs of `n` consecutive in-box overpasses of
    what is left that start in [earliest_s, latest_s), take the one that flagged the most pixels inside the box;
    ties go to the earliest. So the rule picks the stretch where a method has the most to work with, and the
    result is the same whether the hidden rows are present, altered or absent.
    """
    items = in_box_overpasses(visible_rows(det, hidden), box)
    best: tuple[int, int] | None = None
    for i0 in range(0, len(items) - n + 1):
        t0 = items[i0][0].time_s
        if not (earliest_s <= t0 < latest_s):
            continue
        score = sum(k for _, k in items[i0 : i0 + n])
        if best is None or score > best[0]:
            best = (score, i0)
    if best is None:
        raise ValueError(f"no run of {n} in-box overpasses starts in the period given")
    return _window_from(
        items, best[1],
        f"of all runs of {n} consecutive overpasses with a detection in the box that start in the period, the one "
        "that flagged the most pixels in the box", n, _chosen_from(hidden),
    )


def exclude_box(det: Detections, box: tuple[float, float, float, float], margin_deg: float = 0.0) -> Detections:
    """Rows whose pixel centre lies outside the box grown by `margin_deg` on every side."""
    w, s, e, n = box
    grown = (w - margin_deg, s - margin_deg, e + margin_deg, n + margin_deg)
    return det.select(~det.in_box(grown))


def fit_ratio_on(det_train: Detections, trained_on: str) -> OverlapRatioFit:
    return fit_overlap_ratio(det_train, trained_on=trained_on)
