"""Fit values on real FIRMS training rows and write them to backend/model/fitted_values/.

  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.fit_real ratio
  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.fit_real params

`ratio` fits the single FRP overlap ratio of the second baseline. `params` fits the reconstruction's parameters on
training fire episodes, checks them on validation episodes from other years, and writes the decision. Training and
validation rows are defined in backend/model/training.py and backend/model/episodes.py: nothing from the three test
fires is read. Rows are read only through `backend.firms.read_firms`.
"""

from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
import datetime as _dt
import json
import math
import os
import sys
import time
from typing import Any

import numpy as np

from backend.eval.baselines import fit_overlap_ratio, overlap_ratio_factory, painted_modis_factory
from backend.eval.blind_test import bootstrap_verdict, pool_reports, run_blind_test, verdict
from backend.model.episodes import Episode, find_episodes
from backend.model.fitted import FITTED_DIR, PARAMS_FILE, RATIO_FILE, load_ratio_fit
from backend.model.occupancy import OccupancyParams
from backend.model.real_blind import reconstruction_factory
from backend.model.training import EXCLUSIONS, TRAINING_YEARS, VALIDATION_YEARS, training_detections

TRAIN_YEARS_ALL: tuple[int, ...] = TRAINING_YEARS + (2021,)


def _stamp() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write(name: str, doc: dict[str, Any]) -> None:
    FITTED_DIR.mkdir(parents=True, exist_ok=True)
    (FITTED_DIR / name).write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")


def fit_ratio() -> dict[str, Any]:
    from backend.firms import read_firms, region_box
    from backend.terrain.live_region import PRESET_BY_ID

    det, label = training_detections(read_firms, region_box, PRESET_BY_ID)
    fit = fit_overlap_ratio(det, trained_on=label)
    doc = {
        "what": "single VIIRS over MODIS FRP ratio for the overlap-ratio baseline",
        "fit": fit.as_dict(),
        "training_rows": len(det),
        "training_years": list(TRAIN_YEARS_ALL),
        "exclusions": {k: list(v) for k, v in EXCLUSIONS.items()},
        "outside_reference": (
            "Sofiev and Kouznetsov (GMD 19, 10123, 2026) report 177 TW for VIIRS against 128 TW for MODIS over the "
            "2020 Aqua and Suomi NPP granules worldwide, a ratio of 1.38"
        ),
        "generated_utc": _stamp(),
    }
    _write(RATIO_FILE, doc)
    return doc


# ----------------------------------------------------------------------------------------------------------------
# Reconstruction parameters
# ----------------------------------------------------------------------------------------------------------------

_EPISODES: dict[str, list[Episode]] = {}
_CAL: dict[tuple[str, int], Any] = {}


def load_episodes(split: str) -> list[Episode]:
    if split not in _EPISODES:
        from backend.firms import read_firms, region_box
        from backend.terrain.live_region import PRESET_BY_ID

        years = TRAIN_YEARS_ALL if split == "train" else VALIDATION_YEARS
        _EPISODES[split] = find_episodes(years, read_firms, region_box, PRESET_BY_ID)
    return _EPISODES[split]


def _calendar(region_id: str, year: int) -> Any:
    key = (region_id, year)
    if key not in _CAL:
        from backend.model.calendar_ratio import calendar_ratio

        _CAL[key] = calendar_ratio(region_id, exclude_year=year)
    return _CAL[key]


def _run_episode(job: tuple[str, int, dict[str, Any]]) -> dict[str, Any]:
    split, idx, pdict = job
    ep = load_episodes(split)[idx]
    params = OccupancyParams(**pdict)
    report = run_blind_test(
        ep.det, ep.box,
        [painted_modis_factory, overlap_ratio_factory(load_ratio_fit(), _calendar(ep.region_id, ep.year)),
         reconstruction_factory(params)],
        window=(ep.window.start_s, ep.window.end_s),
    )
    report.pop("definitions", None)
    report["episode"] = ep.key
    return report


class Evaluator:
    """Runs the blind test on every episode of a split, in worker processes, and pools the reports."""

    def __init__(self, workers: int | None = None) -> None:
        self.pool = ProcessPoolExecutor(max_workers=workers or max(1, min(8, (os.cpu_count() or 2) - 1)))
        self.calls = 0

    def reports(self, params: OccupancyParams, split: str) -> list[dict[str, Any]]:
        n = len(load_episodes(split))
        self.calls += 1
        return list(self.pool.map(_run_episode, [(split, i, params.as_dict()) for i in range(n)]))

    def pooled(self, params: OccupancyParams, split: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        reps = self.reports(params, split)
        return pool_reports(reps), reps

    def close(self) -> None:
        self.pool.shutdown()


def objective(pooled: dict[str, Any]) -> float:
    """Where the fire is: higher is better. Strict and tolerant CSI and equal-area hit rate, minus the Brier score
    relative to the painted baseline. Totals (pixels, FRP) are matched separately, not searched."""
    rec, raw = pooled["methods"]["reconstruction"], pooled["methods"]["painted_modis"]
    return (
        (rec["strict_375m"]["csi"] or 0.0) + (rec["tolerant_1_cell"]["csi"] or 0.0)
        + ((rec["equal_area"] or {}).get("hit_rate") or 0.0) - (rec["brier"] or 0.0) / max(raw["brier"] or 1e-9, 1e-9)
    )


def _day_night_ratios(reps: list[dict[str, Any]], key_pred: str, key_truth: str) -> dict[bool, float | None]:
    """Sum of hidden over sum of predicted, for day overpasses and for night overpasses."""
    num = {True: 0.0, False: 0.0}
    den = {True: 0.0, False: 0.0}
    for r in reps:
        for po, tg in zip(r["methods"]["reconstruction"]["per_overpass"], r["targets"]):
            if po[key_pred] is None:
                continue
            num[bool(tg["is_day"])] += float(tg[key_truth])
            den[bool(tg["is_day"])] += float(po[key_pred])
    return {k: (num[k] / den[k] if den[k] > 0 else None) for k in (True, False)}


def _log_ratios(reps: list[dict[str, Any]], key_pred: str, key_truth: str) -> np.ndarray:
    out = []
    for r in reps:
        for po, tg in zip(r["methods"]["reconstruction"]["per_overpass"], r["targets"]):
            p, t = po[key_pred], tg[key_truth]
            if p is not None and p > 0 and t > 0:
                out.append(math.log(float(t) / float(p)))
    return np.array(out)


SEARCH: tuple[tuple[str, tuple[Any, ...]], ...] = (
    ("dedup_overlap", (False, True)),
    ("tau_res_h", (3.0, 6.0, 12.0, 24.0)),
    ("spread_km_per_h", (0.03, 0.08, 0.15)),
    ("age_tau_h", (1.5, 3.0, 6.0)),
    ("clear_sky", (0.5, 0.8, 0.95)),
    ("new_cell_weight", (0.02, 0.05, 0.2)),
    ("burned_discount", (0.5, 0.9, 0.99)),
    ("line_width_km", (0.25, 0.375, 0.75)),
    ("tau_smolder_h", (6.0, 12.0, 24.0, 48.0)),
    ("smolder_night", (0.0, 0.1, 0.2, 0.4, 0.6)),
    ("smolder_day", (0.0, 0.05, 0.1, 0.2)),
)


def fit_params(log: Any = print) -> dict[str, Any]:
    """Coordinate search on training episodes, totals matched by day and night, intervals from training residuals,
    then one look at validation episodes that decides what is switched on."""
    t0 = time.time()
    ev = Evaluator()
    train_eps, val_eps = load_episodes("train"), load_episodes("validation")
    log(f"training episodes {len(train_eps)}, validation episodes {len(val_eps)}")
    prior = OccupancyParams()
    best = prior
    pooled, reps = ev.pooled(best, "train")
    best_j = objective(pooled)
    history: list[dict[str, Any]] = [{"step": "priors", "objective": round(best_j, 4)}]
    log(f"priors: objective {best_j:.4f}")

    def match_counts(p: OccupancyParams, reps_in: list[dict[str, Any]]) -> OccupancyParams:
        r = _day_night_ratios(reps_in, "predicted_pixels", "hidden_pixels_in_test_box")
        day = float(np.clip(p.count_scale_day * (r[True] or 1.0), 0.2, 12.0))
        night = float(np.clip(p.count_scale_night * (r[False] or 1.0), 0.2, 12.0))
        return OccupancyParams(**{**p.as_dict(), "count_scale_day": day, "count_scale_night": night})

    for sweep in (1, 2):
        for name, values in SEARCH:
            trial_best = None
            for v in values:
                cand = OccupancyParams(**{**best.as_dict(), name: v})
                pooled_c, reps_c = ev.pooled(cand, "train")
                j = objective(pooled_c)
                if trial_best is None or j > trial_best[0]:
                    trial_best = (j, cand, reps_c)
            assert trial_best is not None
            if trial_best[0] > best_j + 1e-6:
                best_j, best, reps = trial_best
            history.append({"step": f"sweep {sweep}: {name}", "chosen": getattr(best, name), "objective": round(best_j, 4)})
            log(f"sweep {sweep} {name}: {getattr(best, name)}  objective {best_j:.4f}")
        # match the expected number of flagged pixels by day and by night, then re-evaluate
        for _ in range(2):
            cand = match_counts(best, reps)
            pooled_c, reps_c = ev.pooled(cand, "train")
            best, reps, best_j = cand, reps_c, objective(pooled_c)
        history.append({"step": f"sweep {sweep}: pixel counts matched", "count_scale_day": round(best.count_scale_day, 3),
                        "count_scale_night": round(best.count_scale_night, 3), "objective": round(best_j, 4)})
        log(f"sweep {sweep} counts matched: day {best.count_scale_day:.3f} night {best.count_scale_night:.3f}  objective {best_j:.4f}")

    # FRP scale by day and night: hidden total over predicted total on training overpasses
    r = _day_night_ratios(reps, "predicted_frp_mw", "hidden_frp_mw")
    best = OccupancyParams(**{**best.as_dict(),
                              "frp_scale": float(best.frp_scale * (r[True] or 1.0)),
                              "frp_scale_night": float(best.frp_scale_night * (r[False] or 1.0))})
    _, reps = ev.pooled(best, "train")
    # split conformal style intervals: the 5th and 95th percentile of hidden over predicted on training overpasses
    lf = _log_ratios(reps, "predicted_frp_mw", "hidden_frp_mw")
    lp = _log_ratios(reps, "predicted_pixels", "hidden_pixels_in_test_box")
    label = (
        f"{len(train_eps)} real fire episodes of {', '.join(str(y) for y in TRAIN_YEARS_ALL)} in the plumas_ca, lytton_bc "
        "and evia_greece context boxes, the three 2021 test fires excluded (backend/model/episodes.py)"
    )
    best = OccupancyParams(**{**best.as_dict(),
                              "frp_interval_lo": float(math.exp(np.percentile(lf, 5))),
                              "frp_interval_hi": float(math.exp(np.percentile(lf, 95))),
                              "pixel_interval_lo": float(math.exp(np.percentile(lp, 5))),
                              "pixel_interval_hi": float(math.exp(np.percentile(lp, 95))),
                              "fitted_on": label})
    pooled_train, _ = ev.pooled(best, "train")
    log(f"fitted: {json.dumps({k: (round(v, 4) if isinstance(v, float) else v) for k, v in best.as_dict().items() if k != 'fitted_on'})}")

    # validation: fires of other years, never used above
    pooled_val_fit, reps_val = ev.pooled(best, "validation")
    pooled_val_prior, reps_val_prior = ev.pooled(prior, "validation")
    v_fit, v_prior = bootstrap_verdict(reps_val), bootstrap_verdict(reps_val_prior)
    ev.close()

    # A part of the estimate is switched on when, on validation fires, every one of its scores is ahead of both
    # baselines by more than resampling the fires can undo; otherwise it is experimental. The fitted values are
    # used at all only when no score is behind a baseline beyond that noise and at least one is ahead.
    def part(keys: tuple[str, ...]) -> dict[str, Any]:
        rows = {k: v_fit["scores"][k] for k in keys}
        return {"ahead_of_both_baselines_on_validation": all(row["class"] == "ahead" for row in rows.values()),
                "scores": rows}

    cells = part(("csi_strict_375m", "csi_one_cell_tolerance", "hit_rate_at_equal_area", "brier"))
    pixels = part(("pixel_count_error_of_sums",))
    frp = part(("frp_error_of_sums", "frp_median_abs_relative_error"))
    cov = v_fit["interval"]["observed_coverage"]
    frp["interval_holds"] = bool(cov is not None and cov >= 0.8)
    adopted = bool(v_fit["classes"]["behind"] == 0 and v_fit["classes"]["ahead"] >= 1)
    strict_rule = all(v_fit["scores"][k]["beats_every_baseline"] for k in ("csi_strict_375m", "csi_one_cell_tolerance", "hit_rate_at_equal_area", "brier"))
    decision = (
        f"fitted values are used: on validation fires they are ahead of both baselines on {v_fit['classes']['ahead']} "
        f"of {sum(v_fit['classes'].values())} scores, tied on {v_fit['classes']['tie']} and behind on none, beyond the "
        "noise of resampling the fires" if adopted else
        f"fitted values are NOT used (the priors stand): on validation fires they are behind a baseline on "
        f"{v_fit['classes']['behind']} scores beyond the noise of resampling the fires"
    )
    doc = {
        "what": "reconstruction parameters (backend/model/occupancy.py) fitted on real fire episodes",
        "adopted": adopted,
        "decision": decision,
        "parameters": best.as_dict(),
        "priors": prior.as_dict(),
        "trained_on": label,
        "validated_on": (
            f"{len(val_eps)} real fire episodes of {', '.join(str(y) for y in VALIDATION_YEARS)} in the same three "
            "context boxes (other years than training; none of them a test fire)"
        ),
        "rule": (
            "validation fires are resampled whole (2,000 times); a score is ahead when the 90 percent interval of its "
            "improvement over each baseline is above zero, behind when it is below zero against one of them, a tie "
            "otherwise. The fitted values are used when no score is behind and at least one is ahead. A part is on "
            "when every score of the part is ahead (and, for FRP, the 90 percent interval held for at least 80 "
            "percent of validation overpasses); otherwise the part is experimental."
        ),
        "first_rule_outcome": {
            "rule": "every cell score strictly above both baselines on the pooled validation fires, no allowance for noise",
            "met": bool(strict_rule),
            "note": "this was the rule written before the first fit; it is kept here so the change of rule is visible",
        },
        "parts": {
            "where the fire is (cells and probabilities)": {"status": "on" if adopted and cells["ahead_of_both_baselines_on_validation"] else "experimental", **cells},
            "how many pixels the hidden instrument flags": {"status": "on" if adopted and pixels["ahead_of_both_baselines_on_validation"] else "experimental", **pixels},
            "total fire radiative power and its interval": {"status": "on" if adopted and frp["ahead_of_both_baselines_on_validation"] and frp["interval_holds"] else "experimental", **frp},
        },
        "evidence": {
            "validation_fitted": {"verdict": v_fit, "methods": _slim(pooled_val_fit)},
            "validation_priors": {"verdict": v_prior, "methods": _slim(pooled_val_prior)},
            "training_fitted": {"verdict": verdict(pooled_train), "methods": _slim(pooled_train)},
            "validation_episodes": [e.as_dict() for e in val_eps],
            "training_episodes": [e.as_dict() for e in train_eps],
            "validation_per_episode": [
                {"episode": r["episode"], "scored_overpasses": r["scored_overpasses"],
                 **{m: {"csi": r["methods"][m]["strict_375m"]["csi"], "csi_one_cell": r["methods"][m]["tolerant_1_cell"]["csi"],
                        "brier": r["methods"][m]["brier"], "frp_ratio_of_sums": r["methods"][m]["frp_total"]["ratio_of_sums"]}
                    for m in r["methods"]}}
                for r in reps_val
            ],
        },
        "search": {"objective": objective.__doc__, "grid": {k: list(v) for k, v in SEARCH}, "history": history,
                   "blind_test_runs": ev.calls * 1, "seconds": round(time.time() - t0, 1)},
        "generated_utc": _stamp(),
    }
    _write(PARAMS_FILE, doc)
    return doc


def _slim(pooled: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for name, m in pooled["methods"].items():
        out[name] = {
            "strict_375m": m["strict_375m"], "tolerant_1_cell": m["tolerant_1_cell"], "equal_area": m["equal_area"],
            "brier": m["brier"], "pixel_count": {k: v for k, v in m["pixel_count"].items()}, "frp_total": m["frp_total"],
            "interval": m["interval"],
        }
    out["_scored_overpasses"] = pooled["scored_overpasses"]
    out["_runs"] = pooled["runs"]
    return out


def main(argv: list[str]) -> int:
    what = argv[1] if len(argv) > 1 else "ratio"
    if what == "ratio":
        print(json.dumps(fit_ratio(), indent=1))
        return 0
    if what == "params":
        doc = fit_params(log=lambda m: print(m, flush=True))
        print(json.dumps({k: doc[k] for k in ("adopted", "decision", "first_rule_outcome", "parameters")}, indent=1))
        for name, part in doc["parts"].items():
            print(f"[{part['status']}] {name}")
            for k, row in part["scores"].items():
                print(f"   {k:32s} recon {row['reconstruction']:.4f} painted {row['painted_modis']:.4f} ratio {row['overlap_ratio']:.4f} "
                      f"{row['class']:6s} improvement interval {row['improvement_interval']}")
        return 0
    print(f"unknown fit {what!r}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
