"""The blind test: hide one instrument, predict it from the other, score against what was hidden.

Protocol:
  1. Take every row in the region's context box for a time window.
  2. `backend.eval.holdout.seal` parts the rows: methods are built from the visible rows only, and the hidden rows
     stay in a sealed box until every prediction is fixed.
  3. Predictions are published on a schedule that does not come from the hidden rows (`backend.eval.schedule`).
     Version 3: one slot per pass of a hidden platform whose swath held the box, from NASA's CMR granule list,
     with the minute the scan crossed the box and the pixel size there. Version 2, the fallback when no pass list
     is cached: one slot per hidden platform and half day at its nominal time, with a typical pixel size.
     A method is told the slot (`Target`): platform, time, day or night, pixel size. Nothing else.
  4. Each method answers with a probability of detection and an expected FRP per 375 m cell of the test box, a total
     FRP, and optionally an interval for the total and a pixel count.
  5. Only then is the box opened. Version 3 scores every slot: the hidden rows of that pass are its truth, and a
     pass that left no hidden detection is a look that flagged nothing. Version 2 scores each hidden overpass
     seen anywhere in the context box against its platform's nearest slot. Scores are the ones defined in
     `backend.eval.metrics`, pooled over the scored looks.

So the report has two halves. `schedule` and `published` are fixed before the box is opened and are byte for byte
the same whatever the hidden rows hold. `targets`, `methods` and the row counts come from the scorer.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Any, Callable, Protocol

import numpy as np
from numpy.typing import NDArray

from backend.eval import metrics as M
from backend.eval import schedule as S
from backend.eval.grid import CELL_KM, EvalGrid, paint
from backend.eval.holdout import Sealed, seal
from backend.eval.overpass import group_overpasses
from backend.eval.rows import Detections
from backend.eval.schedule import Slot

PREDICTED_CELL_PROBABILITY: float = 0.5
# Slots are laid out this far beyond either end of the scored window, so an overpass just inside the window finds
# its slot even when the nominal time lies just outside (a real pass is within about 100 minutes of its slot).
SLOT_MARGIN_S: float = 2.0 * 3600.0
# With no window given, hidden overpasses are scored from one day before the first visible row to one day after the last.
DEFAULT_WINDOW_PAD_S: float = 86400.0

_RULE: str = (
    "with an instrument hidden, the window, the estimate, the declared cells, the intervals, the belief frames, "
    "the exports and an agent's observation are built from the visible rows only; the hidden rows are opened by "
    "the scorer alone, after every prediction is fixed"
)
PROTOCOLS: dict[str, dict[str, Any]] = {
    S.SOURCE_CMR: {
        "version": 3,
        "name": "sealed hidden rows, schedule from the pass list, empty passes scored",
        "rule": _RULE,
        "replaces": (
            "version 2, in which predictions were published at nominal half-day slots with a typical pixel size "
            "and only hidden overpasses that left a detection were scored"
        ),
    },
    S.SOURCE_NOMINAL: {
        "version": 2,
        "name": "sealed hidden rows, published schedule",
        "rule": _RULE,
        "replaces": (
            "version 1, in which the 24 overpass window counted hidden overpasses and each prediction was made at the "
            "hidden overpass's own time and pixel size"
        ),
    },
}
PROTOCOLS[S.SOURCE_HIDDEN_TIMES] = {**PROTOCOLS[S.SOURCE_NOMINAL], "name": "DIAGNOSTIC: slots read from the hidden overpasses; not blind"}
# The protocol a blind test runs under when the pass list answers for its window (version 3).
PROTOCOL_PASS_LIST: dict[str, Any] = PROTOCOLS[S.SOURCE_CMR]
# The protocol of the nominal schedule (version 2): what a blind test falls back to where no pass list is cached,
# and what the next-look environment plays under, since its default looks are the nominal slots. The round routes
# read this name for the environment's protocol; `backend.env.next_look.PROTOCOL` is the same dict under the
# environment's own name.
PROTOCOL: dict[str, Any] = PROTOCOLS[S.SOURCE_NOMINAL]

# What a method may know about one scheduled look of the hidden instrument.
Target = Slot


@dataclass(frozen=True)
class Prediction:
    p_detect: NDArray[np.float64]        # (ny, nx) probability the hidden instrument flags this cell
    frp_mw: NDArray[np.float64]          # (ny, nx) expected FRP per cell, MW
    frp_total_mw: float                  # expected total FRP in the box, MW
    frp_total_lo: float | None = None    # stated interval for the total, or None
    frp_total_hi: float | None = None
    level: float | None = None           # the level the interval claims, for example 0.9
    cells: NDArray[np.bool_] | None = None   # the cells the method declares; None means p_detect >= 0.5
    pixels: float | None = None          # expected number of pixels the hidden instrument flags in the box
    pixels_lo: float | None = None       # stated interval for that number, or None
    pixels_hi: float | None = None
    pixels_level: float | None = None


class Method(Protocol):
    name: str
    label: str

    def predict(self, target: Target) -> Prediction: ...


MethodFactory = Callable[[Detections, EvalGrid], Method]


def top_cells(p_detect: NDArray[np.float64], frp_mw: NDArray[np.float64], n: int) -> NDArray[np.bool_]:
    """The n most probable cells; ties go to the larger expected FRP, then to grid order. Cells with zero
    probability are never taken, so fewer than n cells come back when the field is smaller than n."""
    out = np.zeros(p_detect.shape, dtype=bool)
    if n <= 0:
        return out
    p = p_detect.ravel()
    order = np.lexsort((np.arange(p.size), -frp_mw.ravel(), -p))
    order = order[p[order] > 0][:n]
    out.ravel()[order] = True
    return out


def split_hidden(det: Detections, hidden: str = "VIIRS") -> tuple[Detections, Detections]:
    """(visible, hidden) by instrument family, for fitting on training rows where nothing is a test. A blind test
    uses `backend.eval.holdout.seal` instead."""
    if hidden not in ("VIIRS", "MODIS"):
        raise ValueError("hidden must be 'VIIRS' or 'MODIS'")
    hid = det.is_viirs if hidden == "VIIRS" else det.is_modis
    return det.select(~hid), det.select(hid)


def _iso(t: float) -> str:
    return str(np.datetime64(int(round(t)), "s")) + "Z"


def declared(pred: Prediction) -> NDArray[np.bool_]:
    """The cells a prediction declares: its own, or every cell at 0.5 or more when it names none."""
    return pred.cells if pred.cells is not None else pred.p_detect >= PREDICTED_CELL_PROBABILITY


def cells_digest(mask: NDArray[np.bool_]) -> str:
    """sha256 of a set of declared cells: one byte per cell of the grid, row by row, 1 where the cell is declared."""
    return hashlib.sha256(np.ascontiguousarray(mask, dtype=np.uint8).tobytes()).hexdigest()


def declared_cells(grid: EvalGrid, slots: list[Slot], masks: list[dict[str, NDArray[np.bool_]]], method: str) -> dict[str, Any]:
    """The cells one method declares at each scheduled look, as plain lists, for a page that draws what is scored.

    `masks` are the masks the scorer compares with the hidden detections (`declared` of each published
    prediction), so what is listed here and what is scored are the same arrays. They are fixed before the sealed
    rows are opened: nothing here depends on a hidden row. Each look carries the digest its published entry
    carries (`cells_sha256`), so the two can be checked against each other once the scorer's part is shown.
    """
    return {
        "what": (
            f"the cells the {method} declares as burning at each scheduled look of the hidden instrument: the cells "
            "the blind test compares with the hidden detections of that look, fixed before those are opened"
        ),
        "method": method,
        "grid": {
            "box": [round(v, 6) for v in grid.bbox],
            "cell_km": grid.cell_km,
            "nx": grid.nx,
            "ny": grid.ny,
            "index": "row * nx + column",
            "rows_run": "north to south",
            "cell_deg": [grid.cell_km / grid.km_per_deg_lon, grid.cell_km / grid.km_per_deg_lat],
            "centre_of_a_cell": (
                "longitude: box[0] + (column + 0.5) * cell_deg[0]; latitude: box[1] + (ny - row - 0.5) * cell_deg[1]. "
                "The grid starts at the south-west corner of the box and may reach a part of a cell past its east and north edges"
            ),
        },
        "looks": [
            {"slot": s.index, "frame": None, "platform": s.platform, "time_utc": _iso(s.time_s), "is_day": s.is_day,
             "cells": [int(i) for i in np.flatnonzero(row[method])], "cells_sha256": cells_digest(row[method])}
            for s, row in zip(slots, masks)
        ],
        "frame_note": "looks[i].frame is the frame of a run that the look is, when the run's frames come from the pass list; null otherwise",
    }


def _published_entry(slot: Slot, pred: Prediction) -> dict[str, Any]:
    """What a method fixed for one slot, with a digest of its fields so two runs can be compared byte for byte."""
    mask = declared(pred)
    h = hashlib.sha256()
    h.update(np.ascontiguousarray(pred.p_detect, dtype=np.float64).tobytes())
    h.update(np.ascontiguousarray(pred.frp_mw, dtype=np.float64).tobytes())
    h.update(np.ascontiguousarray(mask, dtype=np.uint8).tobytes())
    return {
        "slot": slot.index,
        "predicted_cells": int(mask.sum()),
        "predicted_frp_mw": round(float(pred.frp_total_mw), 3),
        "predicted_pixels": None if pred.pixels is None else round(float(pred.pixels), 2),
        "pixel_interval": None if pred.pixels_lo is None else [round(float(pred.pixels_lo), 2), round(float(pred.pixels_hi), 2)],
        "interval_mw": None if pred.frp_total_lo is None else [round(float(pred.frp_total_lo), 3), round(float(pred.frp_total_hi), 3)],
        "fields_sha256": h.hexdigest(),
        "cells_sha256": cells_digest(mask),
    }


def publish(methods: list[Method], slots: list[Slot], grid: EvalGrid) -> list[dict[str, Prediction]]:
    """Every method's prediction for every slot. This runs before the sealed rows are opened."""
    out: list[dict[str, Prediction]] = []
    for slot in slots:
        row: dict[str, Prediction] = {}
        for m in methods:
            pred = m.predict(slot)
            if pred.p_detect.shape != grid.shape or pred.frp_mw.shape != grid.shape:
                raise ValueError(f"method {m.name} returned a grid of the wrong shape")
            row[m.name] = pred
        out.append(row)
    return out


def run_blind_test(
    context_det: Detections,
    bbox: tuple[float, float, float, float],
    factories: list[MethodFactory],
    hidden: str = "VIIRS",
    cell_km: float = CELL_KM,
    window: tuple[float, float] | None = None,
    tolerance_cells: int = 1,
    reference_method: str = "painted_modis",
    target_filter: Callable[[Slot], bool] | None = None,
    hidden_platforms: tuple[str, ...] | None = None,
    schedule: str = S.SOURCE_AUTO,
    read_passes: S.PassReader | None = None,
) -> dict[str, Any]:
    """Seal the hidden rows of `context_det`, then run `blind_test_sealed`. `context_det` holds rows of both
    instruments from the wider context box; `bbox` is the test box that is gridded and scored."""
    visible, sealed = seal(context_det, hidden, hidden_platforms)
    del context_det
    return blind_test_sealed(
        visible, sealed, bbox, factories, cell_km=cell_km, window=window, tolerance_cells=tolerance_cells,
        reference_method=reference_method, target_filter=target_filter, schedule=schedule, read_passes=read_passes,
    )


class _Tally:
    """Scores of one method over a set of scored looks."""

    def __init__(self, label: str) -> None:
        self.label = label
        self.strict = M.Counts(0, 0, 0, 0)
        self.tolerant = M.Counts(0, 0, 0, 0)
        self.equal_area = M.Counts(0, 0, 0, 0)
        self.sq_err, self.sq_n, self.brier_sum, self.n = 0.0, 0, 0.0, 0
        self.pred_totals: list[float] = []
        self.truth_totals: list[float] = []
        self.pixel_totals: list[float] = []
        self.lo: list[float | None] = []
        self.hi: list[float | None] = []
        self.pix: list[float | None] = []
        self.pix_lo: list[float | None] = []
        self.pix_hi: list[float | None] = []
        self.level: float | None = None
        self.pix_level: float | None = None
        self.per_overpass: list[dict[str, Any]] = []

    def add(self, pred: Prediction, pmask: NDArray[np.bool_], truth: Any, n_pixels: int, n_ref: int | None,
            tolerance_cells: int, cell_area_km2: float, row: dict[str, Any] | None) -> None:
        if n_ref is not None:
            self.equal_area = self.equal_area + M.contingency(top_cells(pred.p_detect, pred.frp_mw, n_ref), truth.mask)
        c = M.contingency(pmask, truth.mask)
        self.strict = self.strict + c
        self.tolerant = self.tolerant + M.contingency_tolerant(pmask, truth.mask, tolerance_cells)
        self.brier_sum += M.brier(pred.p_detect, truth.mask)
        support = (truth.frp_mw > 0) | (pred.frp_mw > 0)
        self.sq_err += float((((pred.frp_mw - truth.frp_mw)[support]) ** 2).sum()) / cell_area_km2 ** 2
        self.sq_n += int(support.sum())
        self.pred_totals.append(float(pred.frp_total_mw))
        self.truth_totals.append(float(truth.frp_total_mw))
        self.pixel_totals.append(float(n_pixels))
        self.lo.append(pred.frp_total_lo)
        self.hi.append(pred.frp_total_hi)
        if pred.level is not None:
            self.level = pred.level
        self.pix.append(pred.pixels)
        self.pix_lo.append(pred.pixels_lo)
        self.pix_hi.append(pred.pixels_hi)
        if pred.pixels_level is not None:
            self.pix_level = pred.pixels_level
        self.n += 1
        if row is not None:
            self.per_overpass.append({**row, **c.as_dict(),
                                      "frp_relative_error": M.frp_relative_error(pred.frp_total_mw, truth.frp_total_mw)})

    def result(self, reference_method: str | None, with_rows: bool = True) -> dict[str, Any]:
        out = {
            "label": self.label,
            "strict_375m": {**self.strict.as_dict(), **M.scores(self.strict)},
            "tolerant_1_cell": {**self.tolerant.as_dict(), **M.scores(self.tolerant)},
            "equal_area": (
                {"reference": reference_method, **self.equal_area.as_dict(), **M.scores(self.equal_area)}
                if reference_method is not None else None
            ),
            "brier": (self.brier_sum / self.n) if self.n else None,
            "cell_rmse_mw_km2": (self.sq_err / self.sq_n) ** 0.5 if self.sq_n else None,
            "cell_sq_err_sum": self.sq_err,
            "cell_sq_n": self.sq_n,
            "interval_level": self.level,
            "pixel_interval_level": self.pix_level,
            "frp_total": M.summarise_frp(self.pred_totals, self.truth_totals),
            "interval": M.interval_coverage(self.lo, self.hi, self.truth_totals, self.level),
            "pixel_count": M.summarise_counts(self.pix, self.pixel_totals, self.pix_lo, self.pix_hi, self.pix_level),
        }
        if with_rows:
            out["per_overpass"] = self.per_overpass
        return out


def blind_test_sealed(
    visible: Detections,
    sealed: Sealed,
    bbox: tuple[float, float, float, float],
    factories: list[MethodFactory],
    cell_km: float = CELL_KM,
    window: tuple[float, float] | None = None,
    tolerance_cells: int = 1,
    reference_method: str = "painted_modis",
    target_filter: Callable[[Slot], bool] | None = None,
    schedule: str = S.SOURCE_AUTO,
    read_passes: S.PassReader | None = None,
    given: tuple[list[Slot], str, dict[str, Any]] | None = None,
    declare: str | None = None,
) -> dict[str, Any]:
    """Run the protocol above and return a report dict (JSON serialisable).

    `window` (UTC seconds, start inclusive, end exclusive) limits the scored looks; when it is None it is the
    span of the visible rows and one day either side (the hidden rows are not asked how far they reach). Visible
    rows outside it stay available to the methods if the caller left them in.
    `schedule` is "auto": the pass list when `read_passes` (`backend.firms.cmr_passes.cmr_passes` by default) answers for
    the window, else the nominal schedule, with the reason in the report. "nominal" and "cmr" ask for one of them;
    "hidden_pass_times" is the diagnostic. `target_filter` keeps only some slots (for example Terra's morning
    look); hidden rows that belong to no kept slot are not scored.
    `given` is a schedule the caller already holds, as `schedule.schedule_for` returns it (slots, source, what was
    left out): a run hands over the held-out passes among its frames, so the looks scored are those frames and
    no other. It must come from the pass list or the nominal schedule; nothing checks that here.
    `declare` names a method whose declared cells at every look the report then lists (`declared_cells`), for a
    page that draws what is scored. They are the masks the scorer uses, fixed before the sealed rows are opened.
    """
    grid = EvalGrid.from_bbox(bbox, cell_km)
    if window is None:
        if len(visible) == 0:
            raise ValueError("no window given and no visible row to take one from")
        window = (float(visible.time_s.min()) - DEFAULT_WINDOW_PAD_S, float(visible.time_s.max()) + DEFAULT_WINDOW_PAD_S)
    lon_mid, lat_mid = 0.5 * (bbox[0] + bbox[2]), 0.5 * (bbox[1] + bbox[3])
    if given is not None:
        slots, source, left = [s.reindexed(i) for i, s in enumerate(given[0])], given[1], dict(given[2])
        if source not in (S.SOURCE_CMR, S.SOURCE_NOMINAL):
            raise ValueError("a given schedule comes from the pass list or the nominal schedule")
    elif schedule == S.SOURCE_HIDDEN_TIMES:
        slots = S.slots_from_pass_times(sealed.pass_times(), window[0], window[1], lon_mid, lat_mid)
        source = S.SOURCE_HIDDEN_TIMES
        left: dict[str, Any] = {"platforms": list(S.hidden_platforms_in(sealed.family, sealed.platforms, window[0], window[1]))}
    else:
        slots, source, left = S.schedule_for(sealed.family, sealed.platforms, window[0], window[1], bbox, source=schedule,
                                             read_passes=read_passes, nominal_margin_s=SLOT_MARGIN_S)
    if target_filter is not None:
        slots = [s.reindexed(i) for i, s in enumerate(s for s in slots if target_filter(s))]

    methods = [f(visible, grid) for f in factories]
    names = [m.name for m in methods]
    if len(set(names)) != len(names):
        raise ValueError("method names must be unique")
    published = publish(methods, slots, grid)
    published_out = {m.name: [_published_entry(slot, row[m.name]) for slot, row in zip(slots, published)] for m in methods}
    masks = [{name: declared(pred) for name, pred in row.items()} for row in published]
    if declare is not None and declare not in names:
        raise ValueError(f"no method named {declare} declares cells here")
    declared_out = None if declare is None else declared_cells(grid, slots, masks, declare)
    vis_in = visible.select(visible.in_box(bbox))

    # ---- the scorer: with the pass list or the nominal schedule nothing above this line has read the sealed rows ---
    hid = sealed.open_for_scoring()
    in_box_hid = hid.in_box(bbox)
    in_window = (hid.time_s >= window[0]) & (hid.time_s < window[1])
    units: list[tuple[int, NDArray[np.int64], dict[str, Any]]] = []      # (slot, the look's hidden rows, what to say of it)
    without_slot = 0
    rows_without_a_pass = 0
    if source == S.SOURCE_CMR:
        # every slot is scored: its truth is the hidden rows of that pass, and none is a look that flagged nothing
        claimed = np.zeros(len(hid), dtype=bool)
        for s in slots:
            rows = S.rows_of_slot(hid.time_s, hid.platform_code, s)
            claimed[rows] = True
            units.append((s.index, rows, {"platform": s.platform, "time_utc": _iso(s.time_s), "is_day": s.is_day,
                                          "cloud_cover_pct": s.cloud_cover_pct}))
        rows_without_a_pass = int((in_window & in_box_hid & ~claimed).sum())
    else:
        for op in group_overpasses(hid):
            if not (window[0] <= op.time_s < window[1]):
                continue
            j = S.slot_of(slots, op.platform, op.time_s)
            if j is None:
                without_slot += 1
                continue
            units.append((j, op.index, {"platform": op.platform, "time_utc": _iso(op.time_s), "is_day": op.is_day,
                                        "minutes_from_slot": round((op.time_s - slots[j].time_s) / 60.0, 1)}))

    has_ref = reference_method in names
    tally = {m.name: _Tally(m.label) for m in methods}
    subset = {m.name: _Tally(m.label) for m in methods}            # looks with a hidden pixel in the test box
    targets_out: list[dict[str, Any]] = []
    for k, (j, rows, meta) in enumerate(units):
        inside = rows[in_box_hid[rows]]
        truth = paint(grid, hid.select(inside))
        targets_out.append({
            "index": k,
            **meta,
            "slot": j,
            "hidden_pixels_in_context_box": int(rows.size),
            "hidden_pixels_in_test_box": int(inside.size),
            "hidden_frp_mw": round(truth.frp_total_mw, 3),
            "truth_cells": int(truth.mask.sum()),
        })
        n_ref = int(masks[j][reference_method].sum()) if has_ref else None
        for m in methods:
            pub = published_out[m.name][j]
            row = {"index": k, "slot": j, "predicted_cells": pub["predicted_cells"], "predicted_frp_mw": pub["predicted_frp_mw"],
                   "predicted_pixels": pub["predicted_pixels"], "pixel_interval": pub["pixel_interval"], "interval_mw": pub["interval_mw"]}
            args = (published[j][m.name], masks[j][m.name], truth, int(inside.size), n_ref, tolerance_cells, grid.cell_area_km2)
            tally[m.name].add(*args, row)
            if inside.size > 0:
                subset[m.name].add(*args, None)

    n = len(units)
    n_fire = int(sum(1 for t in targets_out if t["hidden_pixels_in_test_box"] > 0))
    ref = reference_method if has_ref else None
    hidden_label = sealed.family or "named platforms"
    blind = source != S.SOURCE_HIDDEN_TIMES
    report: dict[str, Any] = {
        "source": visible.source,
        "protocol": dict(PROTOCOLS[source]),
        "hidden_instrument": hidden_label,
        "visible_instrument": {"VIIRS": "MODIS", "MODIS": "VIIRS"}.get(hidden_label, "every other platform"),
        "hidden_platforms": list(left["platforms"]),
        "hidden_platforms_from": "the archive's start dates (backend/model/platforms.py), not the hidden rows",
        "visible_platforms": sorted(set(visible.platform_names())),
        "test_box": [round(v, 6) for v in bbox],
        "grid": {"cell_km": grid.cell_km, "nx": grid.nx, "ny": grid.ny, "cells": grid.nx * grid.ny},
        "window_utc": [_iso(window[0]), _iso(window[1])],
        "visible_rows_in_test_box": len(vis_in),
        "visible_rows_in_test_box_inside_window": int(((vis_in.time_s >= window[0]) & (vis_in.time_s < window[1])).sum()),
        "visible_rows_note": (
            "visible_rows_in_test_box counts every visible row the methods were given whose pixel centre lies in the "
            "test box, whatever its time. A caller hands the methods more than the scored window (a run keeps two "
            "days either side, because the estimate is a reconstruction and not a forecast), so the count is larger "
            "than the rows of the window alone, which is visible_rows_in_test_box_inside_window."
        ),
        "predicted_cell_probability": PREDICTED_CELL_PROBABILITY,
        "tolerance_cells": tolerance_cells,
        "equal_area_reference": ref,
        "definitions": dict(M.DEFINITIONS),
        "schedule": {"source": source, "asked_for": schedule, "note": S.NOTES[source], "blind": blind,
                     **{k: v for k, v in left.items() if k != "platforms"}, "slots": [s.as_dict() for s in slots]},
        "published": published_out,
        "built_without_hidden_rows": [
            "protocol", "source", "hidden_instrument", "visible_instrument", "hidden_platforms", "hidden_platforms_from",
            "visible_platforms", "test_box", "grid", "window_utc", "visible_rows_in_test_box",
            "visible_rows_in_test_box_inside_window", "visible_rows_note",
            "predicted_cell_probability", "tolerance_cells", "equal_area_reference", "definitions", "schedule",
            "published", "built_without_hidden_rows", "from_the_scorer",
        ] if blind else [],
        "from_the_scorer": [
            "hidden_rows_in_test_box", "scored_overpasses", "scored_overpasses_with_hidden_detections_in_test_box",
            "scored_overpasses_with_no_hidden_detection", "hidden_overpasses_without_a_slot", "hidden_rows_without_a_pass",
            "targets", "methods", "subset_with_hidden_detections",
        ],
        "hidden_rows_in_test_box": int(sum(t["hidden_pixels_in_test_box"] for t in targets_out)),
        "scored_overpasses": n,
        "scored_overpasses_with_hidden_detections_in_test_box": n_fire,
        "scored_overpasses_with_no_hidden_detection": int(sum(1 for t in targets_out if t["hidden_pixels_in_context_box"] == 0)),
        "hidden_overpasses_without_a_slot": without_slot,
        "hidden_rows_without_a_pass": rows_without_a_pass,
        "targets": targets_out,
        "methods": {name: t.result(ref) for name, t in tally.items()},
        "subset_with_hidden_detections": {
            "what": "the same scores over the looks that left a hidden pixel in the test box only, to set beside protocols that scored no empty look",
            "scored_overpasses": n_fire,
            "methods": {name: t.result(ref, with_rows=False) for name, t in subset.items()},
        },
    }
    if declared_out is not None:
        report["declared_cells"] = declared_out
        if blind:
            report["built_without_hidden_rows"].append("declared_cells")
    return report


def reveal(
    sealed: Sealed,
    bbox: tuple[float, float, float, float],
    window: tuple[float, float],
    frame_times: list[float] | None = None,
    class_number: dict[str, int] | None = None,
    held_out_frames: list[tuple[int, Slot]] | None = None,
) -> dict[str, Any]:
    """The hidden detections themselves, for a page to draw after the score is shown. Scorer output: it changes
    with the hidden rows, as it must, and nothing that built the estimate has read it.

    One entry per hidden overpass in the window with a pixel in the box, each pixel as
    [lon, lat, scan_km, track_km, angle_deg, frp_mw, confidence, sensor_code] (the frames' footprint schema; the
    angle is the scan axis). `frame_times` adds the index of the frame nearest in time to each overpass.

    `held_out_frames` is (frame index, slot) for every held-out frame of a run whose frames are passes of the pass
    list. Each entry then says which frame the detections belong to (`frame`: the frame of that very pass) and
    that it was scored. Hidden detections of a pass that is no frame (its swath held only part of the box) come
    last, with `frame` null and `scored` false.
    """
    from backend.model import platforms as P

    hid = sealed.open_for_scoring()
    inb = hid.in_box(bbox)
    lat_mid = 0.5 * (bbox[1] + bbox[3])
    times = None if not frame_times else np.asarray(frame_times, dtype=np.float64)
    out: list[dict[str, Any]] = []
    groups: list[tuple[str, float, bool, NDArray[np.int64], int | None]] = []     # platform, time, day, rows, frame
    if held_out_frames is not None:
        claimed = np.zeros(len(hid), dtype=bool)
        for k, slot in held_out_frames:
            rows = S.rows_of_slot(hid.time_s, hid.platform_code, slot)
            claimed[rows] = True
            groups.append((slot.platform, slot.time_s, slot.is_day, rows[inb[rows]], k))
        rest = np.flatnonzero(~claimed & (hid.time_s >= window[0]) & (hid.time_s < window[1]))
        for op in group_overpasses(hid.select(rest)):
            own = rest[op.index]
            groups.append((op.platform, op.time_s, bool(op.is_day), own[inb[own]], None))
    else:
        for op in group_overpasses(hid):
            if window[0] <= op.time_s < window[1]:
                groups.append((op.platform, op.time_s, bool(op.is_day), op.index[inb[op.index]], None))
    for platform, time_s, is_day, own, frame in groups:
        if own.size == 0:
            continue
        op = _Seen(platform, time_s, is_day)
        d = hid.select(own)
        angle = round(P.scan_axis_deg(op.platform, op.is_day, lat_mid), 1)
        code = P.PLATFORM_CODES[op.platform]
        fps: list[list[float | int]] = []
        for i in range(len(d)):
            conf = float(d.confidence[i])
            number = int(round(conf)) if np.isfinite(conf) else int((class_number or {}).get(str(d.confidence_class[i]), 0))
            fps.append([
                round(float(d.lon[i]), 5), round(float(d.lat[i]), 5), round(float(d.scan_km[i]), 2),
                round(float(d.track_km[i]), 2), angle, round(float(d.frp_mw[i]), 2), number, code,
            ])
        out.append({
            "platform": op.platform,
            "sensor_code": code,
            "time_utc": _iso(op.time_s),
            "is_day": op.is_day,
            "nearest_frame": None if times is None else int(np.argmin(np.abs(times - op.time_s))),
            **({} if held_out_frames is None else {"frame": frame, "scored": frame is not None}),
            "pixels_in_box": len(fps),
            "frp_mw": round(float(d.frp_mw.sum()), 2),
            "footprints": fps,
        })
    what = "the hidden detections inside the region box, one entry per hidden overpass of the window; shown only after scoring"
    if held_out_frames is not None:
        what += (
            ". `frame` is the held-out frame of the same pass (time_utc is that frame's time); an entry with `frame` "
            "null is a pass whose swath held only part of the box: it is no frame and was not scored"
        )
    return {
        "what": what,
        "footprint_schema": ["lon", "lat", "scan_km", "track_km", "angle_deg", "frp_mw", "confidence", "sensor_code"],
        "overpasses": out,
    }


@dataclass(frozen=True)
class _Seen:
    platform: str
    time_s: float
    is_day: bool


def hidden_pixels_in_spans(
    sealed: Sealed, bbox: tuple[float, float, float, float], spans: list[tuple[float, float]]
) -> list[int]:
    """How many hidden pixels lie in the box in each UTC span (both ends included). A count for a label a page
    shows beside a choice that was already made; nothing is chosen with it."""
    hid = sealed.open_for_scoring()
    t = np.sort(hid.time_s[hid.in_box(bbox)])
    return [int(np.searchsorted(t, b, side="right") - np.searchsorted(t, a, side="left")) for a, b in spans]


def pool_reports(reports: list[dict[str, Any]]) -> dict[str, Any]:
    """One report from several runs: cell counts are summed and per overpass values are put side by side, so every
    pooled score is the score the same definitions give on all the overpasses together. `verdict` works on it."""
    if not reports:
        raise ValueError("nothing to pool")
    names = list(reports[0]["methods"])
    methods: dict[str, Any] = {}
    n_total = sum(r["scored_overpasses"] for r in reports)
    for name in names:
        strict = M.Counts(0, 0, 0, 0)
        tol = M.Counts(0, 0, 0, 0)
        eq = M.Counts(0, 0, 0, 0)
        brier_sum = 0.0
        sq_err, sq_n = 0.0, 0
        preds: list[float] = []
        truths: list[float] = []
        lo: list[float | None] = []
        hi: list[float | None] = []
        pix: list[float | None] = []
        pix_truth: list[float] = []
        pix_lo: list[float | None] = []
        pix_hi: list[float | None] = []
        level = pix_level = None
        has_eq = True
        for r in reports:
            m = r["methods"][name]
            c = m["strict_375m"]
            strict = strict + M.Counts(c["tp"], c["fp"], c["fn"], c["tn"])
            c = m["tolerant_1_cell"]
            tol = tol + M.Counts(c["tp"], c["fp"], c["fn"], c["tn"])
            if m.get("equal_area"):
                c = m["equal_area"]
                eq = eq + M.Counts(c["tp"], c["fp"], c["fn"], c["tn"])
            else:
                has_eq = False
            brier_sum += (m["brier"] or 0.0) * r["scored_overpasses"]
            sq_err += m["cell_sq_err_sum"]
            sq_n += m["cell_sq_n"]
            level = m.get("interval_level") or level
            pix_level = m.get("pixel_interval_level") or pix_level
            for po, tg in zip(m["per_overpass"], r["targets"]):
                preds.append(po["predicted_frp_mw"])
                truths.append(tg["hidden_frp_mw"])
                iv = po["interval_mw"]
                lo.append(None if iv is None else iv[0])
                hi.append(None if iv is None else iv[1])
                pix.append(po["predicted_pixels"])
                pix_truth.append(float(tg["hidden_pixels_in_test_box"]))
                piv = po.get("pixel_interval")
                pix_lo.append(None if piv is None else piv[0])
                pix_hi.append(None if piv is None else piv[1])
        methods[name] = {
            "label": reports[0]["methods"][name]["label"],
            "strict_375m": {**strict.as_dict(), **M.scores(strict)},
            "tolerant_1_cell": {**tol.as_dict(), **M.scores(tol)},
            "equal_area": {**eq.as_dict(), **M.scores(eq)} if has_eq else None,
            "brier": brier_sum / n_total if n_total else None,
            "cell_rmse_mw_km2": (sq_err / sq_n) ** 0.5 if sq_n else None,
            "frp_total": M.summarise_frp(preds, truths),
            "interval": M.interval_coverage(lo, hi, truths, level),
            "pixel_count": M.summarise_counts(pix, pix_truth, pix_lo, pix_hi, pix_level),
        }
    return {
        "source": reports[0]["source"],
        "runs": len(reports),
        "scored_overpasses": n_total,
        "hidden_rows_in_test_box": sum(r["hidden_rows_in_test_box"] for r in reports),
        "methods": methods,
        "definitions": dict(M.DEFINITIONS),
    }


# A count of scores on which a method is ahead is one of two kinds, and whoever prints one says which.
COUNTED_PLAIN: str = "plain comparison"
COUNTED_INTERVAL: str = "judged with an interval"
COUNT_KINDS: dict[str, str] = {
    COUNTED_PLAIN: (
        "a score counts as ahead when it is strictly better than every baseline's on the looks scored, with no "
        "allowance for noise; the count of one fire or one run, where there is nothing to resample"
    ),
    COUNTED_INTERVAL: (
        "the fires are resampled whole; a score is ahead when the interval of its improvement over each baseline "
        "lies above zero, behind when it lies below zero against one of them, and tied otherwise; the count over "
        "a set of fires"
    ),
}


def verdict(report: dict[str, Any], method: str = "reconstruction", baselines: tuple[str, ...] = ("painted_modis", "overlap_ratio")) -> dict[str, Any]:
    """Score by score, does `method` beat every baseline? Computed from the report, never typed in.

    Higher is better for the critical success indices; lower is better for the Brier score and for the error
    figures. A tie is not a win. The interval line compares the share of overpasses covered with the level stated.
    """
    ms = report["methods"]
    if method not in ms or any(b not in ms for b in baselines):
        return {"evaluated": False}

    def off_one(v: float | None) -> float | None:
        return None if v is None else abs(v - 1.0)

    def pick(m: dict[str, Any]) -> dict[str, tuple[float | None, bool]]:
        return {
            "csi_strict_375m": (m["strict_375m"]["csi"], True),
            "csi_one_cell_tolerance": (m["tolerant_1_cell"]["csi"], True),
            "hit_rate_at_equal_area": ((m.get("equal_area") or {}).get("hit_rate"), True),
            "brier": (m["brier"], False),
            "pixel_count_error_of_sums": (off_one((m.get("pixel_count") or {}).get("ratio_of_sums")), False),
            "frp_error_of_sums": (off_one(m["frp_total"]["ratio_of_sums"]), False),
            "frp_median_abs_relative_error": (m["frp_total"]["median_abs_relative_error"], False),
        }

    mine = pick(ms[method])
    theirs = {b: pick(ms[b]) for b in baselines}
    rows: dict[str, Any] = {}
    wins = 0
    judged = 0
    for key, (val, higher) in mine.items():
        others = {b: theirs[b][key][0] for b in baselines}
        usable = val is not None and all(v is not None for v in others.values())
        beats = bool(usable and all((val > v) if higher else (val < v) for v in others.values()))
        if usable:
            judged += 1
            wins += int(beats)
        rows[key] = {method: val, **others, "better_is": "higher" if higher else "lower",
                     "beats_every_baseline": beats if usable else None}
    iv = ms[method]["interval"]
    return {
        "evaluated": True,
        "method": method,
        "baselines": list(baselines),
        "scores": rows,
        "beats_every_baseline_on": wins,
        "scores_judged": judged,
        "counted_by": COUNTED_PLAIN,
        "interval": {"stated_level": iv["stated_level"], "observed_coverage": iv["coverage"], "overpasses": iv["n"]},
        "beats_every_baseline_on_every_score": judged > 0 and wins == judged,
    }


def bootstrap_verdict(
    reports: list[dict[str, Any]], method: str = "reconstruction",
    baselines: tuple[str, ...] = ("painted_modis", "overlap_ratio"), n_boot: int = 2000, seed: int = 20261114,
    level: float = 0.90,
) -> dict[str, Any]:
    """`verdict` with noise: is a lead over the baselines larger than what resampling the fires can undo?

    Whole runs (fire episodes) are resampled with replacement, because overpasses of one fire are not independent.
    For every score the improvement over each baseline is recomputed on each resample (positive means the method
    is better). A score is `ahead` when the lower end of the interval of the improvement is above zero against
    every baseline, `behind` when the upper end is below zero against some baseline, and a `tie` otherwise.
    """
    base = verdict(pool_reports(reports), method, baselines)
    if not base.get("evaluated"):
        return base
    rng = np.random.default_rng(seed)
    keys = list(base["scores"])
    diffs: dict[str, dict[str, list[float]]] = {k: {b: [] for b in baselines} for k in keys}
    n = len(reports)
    for _ in range(n_boot):
        pick = rng.integers(0, n, size=n)
        v = verdict(pool_reports([reports[i] for i in pick]), method, baselines)
        for k in keys:
            row = v["scores"][k]
            if row[method] is None:
                continue
            for b in baselines:
                if row[b] is None:
                    continue
                d = row[method] - row[b]
                diffs[k][b].append(d if row["better_is"] == "higher" else -d)
    lo_q, hi_q = 100.0 * (1.0 - level) / 2.0, 100.0 * (1.0 + level) / 2.0
    out_scores: dict[str, Any] = {}
    counts = {"ahead": 0, "tie": 0, "behind": 0}
    for k in keys:
        row = dict(base["scores"][k])
        iv: dict[str, Any] = {}
        ahead_all, behind_any, usable = True, False, True
        for b in baselines:
            arr = np.array(diffs[k][b])
            if arr.size < 10:
                usable = False
                continue
            lo, hi = float(np.percentile(arr, lo_q)), float(np.percentile(arr, hi_q))
            iv[b] = [round(lo, 5), round(hi, 5)]
            ahead_all = ahead_all and lo > 0.0
            behind_any = behind_any or hi < 0.0
        row["improvement_interval"] = iv
        row["class"] = None if not usable else ("ahead" if ahead_all else ("behind" if behind_any else "tie"))
        if row["class"]:
            counts[row["class"]] += 1
        out_scores[k] = row
    return {
        **base,
        "scores": out_scores,
        "classes": counts,
        "classes_counted_by": COUNTED_INTERVAL,
        "bootstrap": {"resampled": "whole runs, with replacement", "runs": n, "resamples": n_boot, "level": level,
                      "improvement": "method minus baseline for higher-is-better scores, baseline minus method otherwise"},
    }


def _fmt(v: float | None, pct: bool = False, signed: bool = False, digits: int = 3) -> str:
    if v is None:
        return "n/a"
    if digits != 3:
        return f"{v:.{digits}f}"
    if pct:
        return f"{100.0 * v:+.1f}%" if signed else f"{100.0 * v:.1f}%"
    return f"{v:+.3f}" if signed else f"{v:.3f}"


def format_report(report: dict[str, Any]) -> str:
    """A fixed-width table of the pooled scores, one row per method."""
    head = (
        f"source: {report['source']}   hidden: {report['hidden_instrument']}   "
        f"test box: {report['test_box']}   grid: {report['grid']['nx']} x {report['grid']['ny']} cells of "
        f"{report['grid']['cell_km']} km\n"
        f"scored overpasses: {report['scored_overpasses']} "
        f"({report['scored_overpasses_with_hidden_detections_in_test_box']} with hidden detections in the test box)   "
        f"visible rows: {report['visible_rows_in_test_box']}   hidden rows: {report['hidden_rows_in_test_box']}\n"
    )
    cols = (
        f"{'method':<26}{'hit':>8}{'FAratio':>9}{'FArate':>9}{'CSI':>7}{'hit+1':>8}{'FAr+1':>8}{'CSI+1':>7}"
        f"{'hit=A':>8}{'Brier':>9}{'PIXsum':>8}{'FRPsum':>8}{'FRPmed':>9}{'|FRP|med':>9}{'cover':>14}\n"
    )
    lines = [head, cols]
    for name, m in report["methods"].items():
        s, t, f, iv = m["strict_375m"], m["tolerant_1_cell"], m["frp_total"], m["interval"]
        ea = m.get("equal_area") or {}
        cover = "none stated" if iv["coverage"] is None else f"{iv['covered']}/{iv['n']} at {iv['stated_level']:.2f}"
        lines.append(
            f"{name:<26}{_fmt(s['hit_rate']):>8}{_fmt(s['false_alarm_ratio']):>9}{_fmt(s['false_alarm_rate']):>9}"
            f"{_fmt(s['csi']):>7}{_fmt(t['hit_rate']):>8}{_fmt(t['false_alarm_ratio']):>8}{_fmt(t['csi']):>7}"
            f"{_fmt(ea.get('hit_rate')):>8}{_fmt(m['brier'], digits=5):>9}{_fmt((m.get('pixel_count') or {}).get('ratio_of_sums')):>8}{_fmt(f['ratio_of_sums']):>8}{_fmt(f['median_relative_error'], pct=True, signed=True):>9}"
            f"{_fmt(f['median_abs_relative_error'], pct=True):>9}{cover:>14}\n"
        )
    lines.append(
        "hit, FAratio, FArate, CSI: strict 375 m cells, each method's own declared cells. +1: one cell tolerance. "
        "hit=A: hit rate when every method is cut to the painted baseline's number of cells.\n"
        "PIXsum: predicted / hidden number of flagged pixels over the scored overpasses. FRPsum: the same for total FRP. FRPmed: median signed relative error of the total per overpass. cover: overpasses "
        "whose hidden total lies in the stated interval.\n"
    )
    return "".join(lines)


if __name__ == "__main__":
    # Demonstration on the SYNTHETIC fixture only. Real runs are driven from backend/model.
    from backend.eval import synthetic_fixture as _fx
    from backend.eval.baselines import fit_overlap_ratio, overlap_ratio_factory, painted_modis_factory
    from backend.eval.rows import detections_from_rows, read_csv_rows

    _rows = read_csv_rows(_fx.FIXTURE_DIR / _fx.MODIS_FILE) + read_csv_rows(_fx.FIXTURE_DIR / _fx.VIIRS_FILE)
    _det = detections_from_rows(_rows, _fx.SOURCE_LABEL)
    _fit = fit_overlap_ratio(_det, trained_on="the synthetic fixture itself (demonstration only)")
    print(format_report(run_blind_test(_det, _fx.TEST_BOX, [painted_modis_factory, overlap_ratio_factory(_fit)])))
    print("overlap ratio fit:", _fit.as_dict())
