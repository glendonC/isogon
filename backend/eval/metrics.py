"""Score definitions for the blind test. Each one is stated here and echoed into every report (`DEFINITIONS`).

All cell scores are on the 375 m evaluation grid, at the time of one hidden overpass. "Truth" is what the hidden
instrument reported: the cells its flagged pixels cover and the FRP it retrieved. It is not the fire itself. The
hidden instrument misses fire under cloud and smoke and below its detection limit, so a predicted cell it did not
confirm counts as a false alarm even when fire was there: false alarm figures are upper bounds.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.eval.grid import dilate

DEFINITIONS: dict[str, str] = {
    "truth": (
        "At each scored overpass of the hidden instrument: the 375 m cells whose centre lies inside one of its "
        "flagged pixels (real scan by track footprint), and the sum of its FRP over pixels centred in the box. This "
        "is what the hidden instrument reported, not the fire itself."
    ),
    "predicted_cells": (
        "The 375 m cells a method declares. A method that gives only a probability field is cut at 0.5 (the "
        "baselines paint 0 or 1). The reconstruction declares its N most probable cells, N being the number of "
        "cells it expects to be flagged (the sum of its probabilities): a coarse pixel says fire is somewhere "
        "inside it, so an honest probability is rarely above 0.5 and a fixed cut would declare nothing."
    ),
    "equal_area": (
        "Every method cut to the same number of cells: its N most probable cells, N being the number of cells "
        "the painted MODIS baseline declares at that overpass (ties go to larger expected FRP, then grid order). "
        "Hit rate and false alarm ratio at equal area compare where a method puts fire, not how much it declares."
    ),
    "hit_rate": "TP / (TP + FN): the share of truth cells that are predicted cells. Undefined when there is no truth cell.",
    "false_alarm_ratio": "FP / (TP + FP): the share of predicted cells that are not truth cells. Undefined with no predicted cell.",
    "false_alarm_rate": "FP / (FP + TN): the share of cells without a hidden detection that are predicted cells.",
    "csi": "TP / (TP + FP + FN): critical success index, one number that falls with both misses and false alarms.",
    "tolerant_scores": (
        "The same four scores with a one cell (375 m) tolerance: a truth cell is hit when a predicted cell lies "
        "within one cell of it, and a predicted cell is a false alarm only when no truth cell lies within one cell."
    ),
    "brier": "Mean over all cells of (probability minus truth as 0 or 1) squared. Lower is better.",
    "cell_rmse": (
        "Root mean square difference between predicted and hidden FRP density (MW per km2 of a 375 m cell), over "
        "the cells where either is above zero, pooled over the scored overpasses."
    ),
    "frp_total_error": (
        "Per overpass, predicted total FRP in the box minus the hidden instrument's total, divided by the hidden "
        "total (signed, so minus 0.5 means half). Summarised by its median, by the median absolute value, and by "
        "the ratio of the two totals summed over the scored overpasses. Overpasses with a hidden total of zero are "
        "left out of the relative figures and counted."
    ),
    "pixel_count": (
        "The number of pixels the hidden instrument flags in the box at an overpass, against the number a method "
        "expects. Summarised like FRP: ratio of the sums over the scored overpasses, median signed and median "
        "absolute relative error, and the coverage of a stated interval. This is the currency of the calendar "
        "(hotspot counts), so it is where the overlap ratio baseline makes its own prediction."
    ),
    "interval_coverage": (
        "The share of scored overpasses whose hidden total FRP lies inside the method's stated interval, next to "
        "the level the method states (for example 0.90). A method that states no interval is reported as stating none."
    ),
    "pooling": (
        "Cell counts TP, FP, FN, TN are summed over the scored overpasses of a run before the ratios are taken, so "
        "large overpasses weigh more. Scored overpasses are those of the hidden instrument seen anywhere in the wider "
        "context box; one with no detection inside the test box contributes only false alarms and true negatives."
    ),
}


@dataclass(frozen=True)
class Counts:
    tp: int
    fp: int
    fn: int
    tn: int

    def __add__(self, other: Counts) -> Counts:
        return Counts(self.tp + other.tp, self.fp + other.fp, self.fn + other.fn, self.tn + other.tn)

    def as_dict(self) -> dict[str, int]:
        return {"tp": self.tp, "fp": self.fp, "fn": self.fn, "tn": self.tn}


def _ratio(num: float, den: float) -> float | None:
    return None if den <= 0 else float(num) / float(den)


def contingency(pred: NDArray[np.bool_], truth: NDArray[np.bool_]) -> Counts:
    """Strict cell by cell counts."""
    if pred.shape != truth.shape:
        raise ValueError("pred and truth differ in shape")
    tp = int(np.sum(pred & truth))
    fp = int(np.sum(pred & ~truth))
    fn = int(np.sum(~pred & truth))
    tn = int(pred.size - tp - fp - fn)
    return Counts(tp, fp, fn, tn)


def contingency_tolerant(pred: NDArray[np.bool_], truth: NDArray[np.bool_], cells: int = 1) -> Counts:
    """Counts with a `cells` tolerance (see DEFINITIONS['tolerant_scores']).

    TP and FN partition the truth cells; FP are predicted cells further than the tolerance from any truth cell; TN
    are the remaining cells without truth. TP + FN + FP + TN can be below the grid size (predicted cells that fall
    within tolerance of truth but are not truth cells are neither false alarms nor true negatives).
    """
    near_pred = dilate(pred, cells)
    near_truth = dilate(truth, cells)
    tp = int(np.sum(truth & near_pred))
    fn = int(np.sum(truth & ~near_pred))
    fp = int(np.sum(pred & ~near_truth))
    tn = int(np.sum(~truth & ~pred))
    return Counts(tp, fp, fn, tn)


def scores(c: Counts) -> dict[str, float | None]:
    """hit_rate, false_alarm_ratio, false_alarm_rate and csi from counts; None where the denominator is zero."""
    return {
        "hit_rate": _ratio(c.tp, c.tp + c.fn),
        "false_alarm_ratio": _ratio(c.fp, c.tp + c.fp),
        "false_alarm_rate": _ratio(c.fp, c.fp + c.tn),
        "csi": _ratio(c.tp, c.tp + c.fp + c.fn),
    }


def brier(prob: NDArray[np.float64], truth: NDArray[np.bool_]) -> float:
    p = np.clip(np.asarray(prob, dtype=np.float64), 0.0, 1.0)
    return float(np.mean((p - truth.astype(np.float64)) ** 2))


def frp_relative_error(pred_total: float, truth_total: float) -> float | None:
    """(pred minus truth) / truth; None when the hidden total is zero."""
    return None if truth_total <= 0 else (float(pred_total) - float(truth_total)) / float(truth_total)


def summarise_frp(pred_totals: list[float], truth_totals: list[float]) -> dict[str, Any]:
    rel = [frp_relative_error(p, t) for p, t in zip(pred_totals, truth_totals)]
    rel_ok = [r for r in rel if r is not None]
    sum_p = float(sum(pred_totals))
    sum_t = float(sum(truth_totals))
    return {
        "n_overpasses": len(truth_totals),
        "n_with_zero_hidden_total": len(rel) - len(rel_ok),
        "median_relative_error": float(np.median(rel_ok)) if rel_ok else None,
        "median_abs_relative_error": float(np.median(np.abs(rel_ok))) if rel_ok else None,
        "sum_predicted_mw": round(sum_p, 3),
        "sum_hidden_mw": round(sum_t, 3),
        "ratio_of_sums": _ratio(sum_p, sum_t),
    }


def interval_coverage(lo: list[float | None], hi: list[float | None], truth: list[float], level: float | None) -> dict[str, Any]:
    """Share of truths inside [lo, hi] over the overpasses where an interval was stated."""
    pairs = [(a, b, t) for a, b, t in zip(lo, hi, truth) if a is not None and b is not None]
    if not pairs or level is None:
        return {"stated_level": None, "n": 0, "covered": 0, "coverage": None, "note": "method states no interval"}
    covered = sum(1 for a, b, t in pairs if a - 1e-9 <= t <= b + 1e-9)
    n = len(pairs)
    # Binomial standard error of the observed share, so a reader sees how little a dozen overpasses can prove.
    cov = covered / n
    se = math.sqrt(max(cov * (1.0 - cov), 0.0) / n)
    return {"stated_level": float(level), "n": n, "covered": covered, "coverage": cov, "standard_error": round(se, 4)}


STATED_INTERVAL_RULE: str = (
    "the interval a prediction states is the prediction times two multiples, taken from the ratios of hidden over "
    "predicted on the training looks, every look with a positive prediction counted and a look that flagged nothing "
    "counted with a ratio of zero. Two-sided, the multiples are the 5th and the 95th percentile and hold 90 percent "
    "between them. When the 5th percentile is zero, which happens as soon as more than one training look in twenty "
    "flagged nothing, nothing is cut off below, and the 95th percentile would hold 95 percent: the interval is then "
    "one-sided, from zero to the 90th percentile. It starts at zero because cloud is not known, and an interval that "
    "could not hold an empty pass would claim more than the record supports."
)


def stated_interval(ratios: Any, level: float = 0.90) -> dict[str, Any] | None:
    """The multiples of a prediction that hold `level` of the ratios given (`STATED_INTERVAL_RULE`); None when no
    ratio is given. `given_a_detection` is the 5th and 95th percentile of the looks that flagged something, for a
    reader who wants the spread of the looks that were not empty."""
    r = np.asarray(ratios, dtype=np.float64)
    if r.size == 0:
        return None
    lo = float(np.percentile(r, 50.0 * (1.0 - level)))
    one_sided = lo <= 0.0
    hi = float(np.percentile(r, 100.0 * level if one_sided else 50.0 * (1.0 + level)))
    seen = r[r > 0]
    return {
        "lo": 0.0 if one_sided else lo,
        "hi": hi,
        "one_sided": one_sided,
        "level": float(level),
        "looks": int(r.size),
        "looks_that_flagged_nothing": int((r == 0).sum()),
        "given_a_detection": [float(np.percentile(seen, 5)), float(np.percentile(seen, 95))] if seen.size else None,
    }


def summarise_counts(
    pred: list[float | None], truth: list[float], lo: list[float | None], hi: list[float | None], level: float | None
) -> dict[str, Any]:
    """Pixel-count summary over the overpasses where the method stated a count."""
    pairs = [(p, t) for p, t in zip(pred, truth) if p is not None]
    if not pairs:
        return {"n_overpasses": 0, "ratio_of_sums": None, "note": "method states no pixel count"}
    out = summarise_frp([p for p, _ in pairs], [t for _, t in pairs])
    out["sum_predicted"] = out.pop("sum_predicted_mw")
    out["sum_hidden"] = out.pop("sum_hidden_mw")
    out["interval"] = interval_coverage(lo, hi, truth, level)
    return out
