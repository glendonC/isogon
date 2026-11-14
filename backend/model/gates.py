"""Benchmark gates for `/api/sensor-model`, built only from values the backend computes.

Every gate carries a `kind`:
  computed       the metric text, inputs and status are derived here from computed values; the status
                 is PASSED or FAILED against the stated criterion, or NOT_EVALUATED when an input is
                 missing (for example the static field file has no run to read G1 and G5 from).
  design_target  the backend does not compute this check yet; the gate states the target and is always
                 NOT_EVALUATED. It must never be shown as a measurement.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

GATE_STATUS: tuple[str, ...] = ("PASSED", "FAILED", "NOT_EVALUATED")

# Pass criteria, stated once and echoed into every gate.
G1_RATIO_BAND: tuple[float, float] = (0.90, 1.10)
G5_COVERAGE_BAND_PCT: tuple[float, float] = (85.0, 95.0)


def split_conformal_coverage(residuals: Any, level: float = 0.9) -> float:
    """Empirical coverage of a split conformal interval on residuals (even indices calibrate, odd evaluate).

    The interval half width is the ceil(level * (n_cal + 1))-th smallest absolute calibration residual.
    """
    r = np.abs(np.asarray(residuals, dtype=np.float64))
    cal, val = r[0::2], r[1::2]
    if cal.size == 0 or val.size == 0:
        raise ValueError("need at least two residuals")
    k = min(cal.size, max(1, math.ceil(level * (cal.size + 1))))
    q = float(np.sort(cal)[k - 1])
    return float(np.mean(val <= q))


def _status(ok: bool) -> str:
    return "PASSED" if ok else "FAILED"


def build_benchmark_gates(
    paired: dict[str, Any],
    run_metrics: dict[str, Any] | None = None,
    run_id: str | None = None,
) -> list[dict[str, Any]]:
    """The five gates. ``paired`` holds the paired 13:30 calibration RMSEs; ``run_metrics`` are one
    reconstruct run's `metrics` (G1 and G5 read them) and may be None."""
    run_label = f"run {run_id}" if run_id else "run"
    gates: list[dict[str, Any]] = []

    # G1: from the run's computed 2012 step ratios.
    g1: dict[str, Any] = {
        "gate_id": "G1_2012_CONTINUITY",
        "title": "2012 S-NPP Step-Jump Removal",
        "kind": "computed",
        "criterion": f"harmonized step ratio within [{G1_RATIO_BAND[0]:.2f}, {G1_RATIO_BAND[1]:.2f}]",
        "source": "reconstruct run metrics step_2012_harmonized_ratio and step_2012_raw_ratio",
    }
    coobs = (run_metrics or {}).get("step_2012_coobs_frames")
    if run_metrics is None or "step_2012_harmonized_ratio" not in run_metrics:
        g1.update(status="NOT_EVALUATED", metric="evaluated per reconstruct run (GET /api/sensor-model?run_id=...)", inputs={})
    elif coobs is not None and int(coobs) == 0:
        g1.update(status="NOT_EVALUATED", metric=f"{run_label}: no clear co-observed frames, harmonized ratio not computed",
                  inputs={"step_2012_coobs_frames": 0})
    else:
        h = float(run_metrics["step_2012_harmonized_ratio"])
        raw = float(run_metrics.get("step_2012_raw_ratio", float("nan")))
        g1.update(
            status=_status(G1_RATIO_BAND[0] <= h <= G1_RATIO_BAND[1]),
            metric=f"{run_label}: harmonized step ratio {h:.2f} (raw {raw:.2f}x)",
            inputs={"step_2012_harmonized_ratio": h, "step_2012_raw_ratio": raw, "step_2012_coobs_frames": coobs},
        )
    gates.append(g1)

    gates.append({
        "gate_id": "G2_BOWTIE_FLUX_CONSERVATION",
        "title": "Sum-Before-Threshold Footprint Flux Conservation",
        "kind": "design_target",
        "status": "NOT_EVALUATED",
        "criterion": "cluster flux error under 5% with sum-before-threshold aggregation",
        "metric": "design target, not computed by this build",
        "source": "none yet",
        "inputs": {},
    })

    # G3: from the paired 13:30 calibration residuals (a modelled self-check on synthetic pairs).
    raw_rmse = float(paired["raw_overall_rmse_dex"])
    harm_rmse = float(paired["harmonized_overall_rmse_dex"])
    n_pairs = int(paired.get("n_pairs", 0))
    gates.append({
        "gate_id": "G3_PAIRED_RESIDUAL",
        "title": "Harmonized vs Raw Paired Residual (Modelled Self-Check)",
        "kind": "computed",
        "status": _status(harm_rmse < raw_rmse),
        "criterion": "harmonized paired RMSE below raw paired RMSE",
        "metric": f"paired RMSE {harm_rmse:.4f} dex harmonized vs {raw_rmse:.4f} dex raw on {n_pairs} simulated pairs",
        "source": "paired_1330_calibration (simulated Aqua MODIS and NOAA-20 VIIRS cluster pairs)",
        "inputs": {"raw_rmse_dex": raw_rmse, "harmonized_rmse_dex": harm_rmse, "n_pairs": n_pairs},
    })

    gates.append({
        "gate_id": "G4_SPATIOTEMPORAL_ASSIMILATION",
        "title": "Terrain-Coupled State-Space vs Single-Epoch Inversion",
        "kind": "design_target",
        "status": "NOT_EVALUATED",
        "criterion": "lower cloud-holdout MAE than a single-epoch inversion",
        "metric": "design target, not computed by this build",
        "source": "none yet",
        "inputs": {},
    })

    # G5: from the run's computed split conformal coverage.
    g5: dict[str, Any] = {
        "gate_id": "G5_CONFORMAL_COVERAGE",
        "title": f"90% Epistemic Interval Calibration [{G5_COVERAGE_BAND_PCT[0]:.0f}%, {G5_COVERAGE_BAND_PCT[1]:.0f}%]",
        "kind": "computed",
        "criterion": f"empirical coverage within [{G5_COVERAGE_BAND_PCT[0]:.0f}%, {G5_COVERAGE_BAND_PCT[1]:.0f}%]",
        "source": "reconstruct run metrics empirical_90_coverage_pct (split conformal, spatial folds)",
    }
    if run_metrics is None or "empirical_90_coverage_pct" not in run_metrics:
        g5.update(status="NOT_EVALUATED", metric="evaluated per reconstruct run (GET /api/sensor-model?run_id=...)", inputs={})
    else:
        cov = float(run_metrics["empirical_90_coverage_pct"])
        g5.update(
            status=_status(G5_COVERAGE_BAND_PCT[0] <= cov <= G5_COVERAGE_BAND_PCT[1]),
            metric=f"{run_label}: empirical coverage {cov:.1f}%",
            inputs={"empirical_90_coverage_pct": cov},
        )
    gates.append(g5)
    return gates
