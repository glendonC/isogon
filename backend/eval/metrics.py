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
    "predicted_cells": "The 375 m cells where the method's probability of a hidden-instrument detection is at least 0.5.",
    "hit_rate": "TP / (TP + FN): the share of truth cells that are predicted cells. Undefined when there is no truth cell.",
    "false_alarm_ratio": "FP / (TP + FP): the share of predicted cells that are not truth cells. Undefined with no predicted cell.",
    "false_alarm_rate": "FP / (FP + TN): the share of cells without a hidden detection that are predicted cells.",
    "csi": "TP / (TP + FP + FN): critical success index, one number that falls with both misses and false alarms.",
    "tolerant_scores": (
        "The same four scores with a one cell (375 m) tolerance: a truth cell is hit when a predicted cell lies "
        "within one cell of it, and a predicted cell is a false alarm only when no truth cell lies within one cell."
    ),
    "brier": "Mean over all cells of (probability minus truth as 0 or 1) squared. Lower is better.",
    "frp_total_error": (
        "Per overpass, predicted total FRP in the box minus the hidden instrument's total, divided by the hidden "
        "total (signed, so minus 0.5 means half). Summarised by its median, by the median absolute value, and by "
        "the ratio of the two totals summed over the scored overpasses. Overpasses with a hidden total of zero are "
        "left out of the relative figures and counted."
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
