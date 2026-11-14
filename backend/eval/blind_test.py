"""The blind test: hide one instrument, predict it from the other, score against what was hidden.

Protocol (CONTRACT amendment 8):
  1. Take every row in the region's context box for a time window.
  2. Hidden rows are those of the hidden instrument (VIIRS by default). Methods are built from the visible rows only;
     this module never hands a method a hidden row.
  3. The scored overpasses are the hidden instrument's overpasses seen anywhere in the context box. For each one a
     method is told when the hidden satellite passed and its pixel size there (`Target`), never what it saw.
  4. Each method answers with a probability of detection and an expected FRP per 375 m cell of the test box, a total
     FRP, and optionally an interval for the total.
  5. Scores are the ones defined in `backend.eval.metrics`, pooled over the scored overpasses.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol

import numpy as np
from numpy.typing import NDArray

from backend.eval import metrics as M
from backend.eval.grid import CELL_KM, EvalGrid, paint
from backend.eval.overpass import Overpass, group_overpasses
from backend.eval.rows import Detections

PREDICTED_CELL_PROBABILITY: float = 0.5


@dataclass(frozen=True)
class Target:
    """What a method may know about one hidden overpass: the pass, not its detections."""

    index: int
    platform: str
    time_s: float
    is_day: bool
    scan_km: float      # median pixel size of the hidden pass over the context box (pass geometry, not fire)
    track_km: float


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
    """(visible, hidden) by instrument family."""
    if hidden not in ("VIIRS", "MODIS"):
        raise ValueError("hidden must be 'VIIRS' or 'MODIS'")
    hid = det.is_viirs if hidden == "VIIRS" else det.is_modis
    return det.select(~hid), det.select(hid)


def _iso(t: float) -> str:
    return str(np.datetime64(int(round(t)), "s")) + "Z"


def run_blind_test(
    context_det: Detections,
    bbox: tuple[float, float, float, float],
    factories: list[MethodFactory],
    hidden: str = "VIIRS",
    cell_km: float = CELL_KM,
    window: tuple[float, float] | None = None,
    tolerance_cells: int = 1,
    reference_method: str = "painted_modis",
) -> dict[str, Any]:
    """Run the protocol above and return a report dict (JSON serialisable).

    `context_det` holds rows of both instruments from the wider context box; `bbox` is the test box that is gridded
    and scored. `window` (UTC seconds, start inclusive, end exclusive) limits the scored overpasses; visible rows
    outside it stay available to the methods only if the caller left them in `context_det`.
    """
    grid = EvalGrid.from_bbox(bbox, cell_km)
    visible, hid = split_hidden(context_det, hidden)
    methods = [f(visible, grid) for f in factories]
    names = [m.name for m in methods]
    if len(set(names)) != len(names):
        raise ValueError("method names must be unique")

    passes: list[Overpass] = group_overpasses(hid)
    if window is not None:
        passes = [p for p in passes if window[0] <= p.time_s < window[1]]
    in_box_hid = hid.in_box(bbox)

    per_method: dict[str, dict[str, Any]] = {
        m.name: {
            "label": m.label,
            "strict": M.Counts(0, 0, 0, 0),
            "tolerant": M.Counts(0, 0, 0, 0),
            "equal_area": M.Counts(0, 0, 0, 0),
            "sq_err": 0.0,
            "sq_n": 0,
            "pix": [],
            "pix_lo": [],
            "pix_hi": [],
            "pix_level": None,
            "brier_sum": 0.0,
            "pred_totals": [],
            "lo": [],
            "hi": [],
            "level": None,
            "per_overpass": [],
        }
        for m in methods
    }
    targets_out: list[dict[str, Any]] = []
    truth_totals: list[float] = []
    pixel_totals: list[float] = []

    for k, op in enumerate(passes):
        inside = op.index[in_box_hid[op.index]]
        truth = paint(grid, hid.select(inside))
        truth_totals.append(truth.frp_total_mw)
        pixel_totals.append(float(inside.size))
        target = Target(index=k, platform=op.platform, time_s=op.time_s, is_day=op.is_day, scan_km=op.scan_km, track_km=op.track_km)
        targets_out.append(
            {
                "index": k,
                "platform": op.platform,
                "time_utc": _iso(op.time_s),
                "is_day": op.is_day,
                "hidden_pixels_in_context_box": op.n,
                "hidden_pixels_in_test_box": int(inside.size),
                "hidden_frp_mw": round(truth.frp_total_mw, 3),
                "truth_cells": int(truth.mask.sum()),
            }
        )
        preds = {m.name: m.predict(target) for m in methods}
        masks: dict[str, NDArray[np.bool_]] = {}
        for m in methods:
            pred = preds[m.name]
            if pred.p_detect.shape != grid.shape or pred.frp_mw.shape != grid.shape:
                raise ValueError(f"method {m.name} returned a grid of the wrong shape")
            masks[m.name] = pred.cells if pred.cells is not None else pred.p_detect >= PREDICTED_CELL_PROBABILITY
        n_ref = int(masks[reference_method].sum()) if reference_method in masks else None
        for m in methods:
            pred = preds[m.name]
            acc = per_method[m.name]
            pmask = masks[m.name]
            if n_ref is not None:
                acc["equal_area"] = acc["equal_area"] + M.contingency(top_cells(pred.p_detect, pred.frp_mw, n_ref), truth.mask)
            c = M.contingency(pmask, truth.mask)
            ct = M.contingency_tolerant(pmask, truth.mask, tolerance_cells)
            acc["strict"] = acc["strict"] + c
            acc["tolerant"] = acc["tolerant"] + ct
            acc["brier_sum"] += M.brier(pred.p_detect, truth.mask)
            support = (truth.frp_mw > 0) | (pred.frp_mw > 0)
            acc["sq_err"] += float((((pred.frp_mw - truth.frp_mw)[support]) ** 2).sum()) / grid.cell_area_km2 ** 2
            acc["sq_n"] += int(support.sum())
            acc["pred_totals"].append(float(pred.frp_total_mw))
            acc["lo"].append(pred.frp_total_lo)
            acc["hi"].append(pred.frp_total_hi)
            if pred.level is not None:
                acc["level"] = pred.level
            acc["pix"].append(pred.pixels)
            acc["pix_lo"].append(pred.pixels_lo)
            acc["pix_hi"].append(pred.pixels_hi)
            if pred.pixels_level is not None:
                acc["pix_level"] = pred.pixels_level
            acc["per_overpass"].append(
                {
                    "index": k,
                    "predicted_cells": int(pmask.sum()),
                    **c.as_dict(),
                    "predicted_frp_mw": round(float(pred.frp_total_mw), 3),
                    "predicted_pixels": None if pred.pixels is None else round(float(pred.pixels), 2),
                    "frp_relative_error": M.frp_relative_error(pred.frp_total_mw, truth.frp_total_mw),
                    "interval_mw": None if pred.frp_total_lo is None else [round(float(pred.frp_total_lo), 3), round(float(pred.frp_total_hi), 3)],
                }
            )

    n = len(passes)
    methods_out: dict[str, Any] = {}
    for name, acc in per_method.items():
        methods_out[name] = {
            "label": acc["label"],
            "strict_375m": {**acc["strict"].as_dict(), **M.scores(acc["strict"])},
            "tolerant_1_cell": {**acc["tolerant"].as_dict(), **M.scores(acc["tolerant"])},
            "equal_area": (
                {"reference": reference_method, **acc["equal_area"].as_dict(), **M.scores(acc["equal_area"])}
                if reference_method in per_method else None
            ),
            "brier": (acc["brier_sum"] / n) if n else None,
            "cell_rmse_mw_km2": (acc["sq_err"] / acc["sq_n"]) ** 0.5 if acc["sq_n"] else None,
            "frp_total": M.summarise_frp(acc["pred_totals"], truth_totals),
            "interval": M.interval_coverage(acc["lo"], acc["hi"], truth_totals, acc["level"]),
            "pixel_count": M.summarise_counts(acc["pix"], pixel_totals, acc["pix_lo"], acc["pix_hi"], acc["pix_level"]),
            "per_overpass": acc["per_overpass"],
        }

    vis_in = visible.select(visible.in_box(bbox))
    return {
        "source": context_det.source,
        "hidden_instrument": hidden,
        "visible_instrument": "MODIS" if hidden == "VIIRS" else "VIIRS",
        "test_box": [round(v, 6) for v in bbox],
        "grid": {"cell_km": grid.cell_km, "nx": grid.nx, "ny": grid.ny, "cells": grid.nx * grid.ny},
        "window_utc": None if window is None else [_iso(window[0]), _iso(window[1])],
        "visible_rows_in_test_box": len(vis_in),   # every visible row the methods were given, inside the test box
        "hidden_rows_in_test_box": int(sum(t["hidden_pixels_in_test_box"] for t in targets_out)),
        "scored_overpasses": n,
        "scored_overpasses_with_hidden_detections_in_test_box": int(sum(1 for t in targets_out if t["hidden_pixels_in_test_box"] > 0)),
        "predicted_cell_probability": PREDICTED_CELL_PROBABILITY,
        "tolerance_cells": tolerance_cells,
        "equal_area_reference": reference_method if reference_method in per_method else None,
        "definitions": dict(M.DEFINITIONS),
        "targets": targets_out,
        "methods": methods_out,
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
        "interval": {"stated_level": iv["stated_level"], "observed_coverage": iv["coverage"], "overpasses": iv["n"]},
        "beats_every_baseline_on_every_score": judged > 0 and wins == judged,
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
    # Demonstration on the SYNTHETIC fixture only. Real runs are driven from backend/model (unit M1).
    from backend.eval import synthetic_fixture as _fx
    from backend.eval.baselines import fit_overlap_ratio, overlap_ratio_factory, painted_modis_factory
    from backend.eval.rows import detections_from_rows, read_csv_rows

    _rows = read_csv_rows(_fx.FIXTURE_DIR / _fx.MODIS_FILE) + read_csv_rows(_fx.FIXTURE_DIR / _fx.VIIRS_FILE)
    _det = detections_from_rows(_rows, _fx.SOURCE_LABEL)
    _fit = fit_overlap_ratio(_det, trained_on="the synthetic fixture itself (demonstration only)")
    print(format_report(run_blind_test(_det, _fx.TEST_BOX, [painted_modis_factory, overlap_ratio_factory(_fit)])))
    print("overlap ratio fit:", _fit.as_dict())
