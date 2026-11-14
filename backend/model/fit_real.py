"""Fit values on real FIRMS training rows and write them to backend/model/fitted_values/.

  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.fit_real ratio
  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.fit_real params
  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.fit_real validate

`ratio` fits the single FRP overlap ratio of the second baseline. `params` fits the reconstruction's parameters on
training fire episodes, checks them on validation episodes from other years, and writes the decision. `validate`
fits nothing: it runs the tracked parameters on the validation episodes again and rewrites the decision, keeping
the earlier one beside it (used when the protocol changes and the gates have to be read again). Both run the
blind test on the schedule of the pass list (protocol version 3) and stop if no pass list is cached for an
episode, so a file never says version 3 over scores made on the fallback. Training and
validation rows are defined in backend/model/training.py and backend/model/episodes.py: nothing from the three test
fires is read, through any path, the calendar's ratio included (backend/model/calendar_ratio.py). Rows are read
only through `backend.firms.read_firms`.
"""

from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
import datetime as _dt
import json
import os
import sys
import time
from typing import Any

import numpy as np

from backend.eval import schedule as S
from backend.eval.baselines import fit_overlap_ratio, overlap_ratio_factory, painted_modis_factory
from backend.eval.blind_test import PROTOCOL_PASS_LIST as PROTOCOL, bootstrap_verdict, pool_reports, run_blind_test, verdict
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
        window=(ep.window.start_s, ep.window.end_s), schedule=S.SOURCE_CMR,
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


def _ratios(reps: list[dict[str, Any]], key_pred: str, key_truth: str) -> np.ndarray:
    """Hidden over predicted for every scored look with a positive prediction. A look that flagged nothing is in
    it, with a ratio of zero: protocol version 3 scores every pass."""
    out = []
    for r in reps:
        for po, tg in zip(r["methods"]["reconstruction"]["per_overpass"], r["targets"]):
            p, t = po[key_pred], tg[key_truth]
            if p is not None and p > 0:
                out.append(float(t) / float(p))
    return np.array(out)


INTERVAL_RULE: str = (
    "the 5th and the 95th percentile of hidden over predicted on the training looks, every look with a positive "
    "prediction counted. A pass that flagged nothing has a ratio of zero, so when more than one training look in "
    "twenty flagged nothing the interval starts at zero: cloud is not known, and an interval that could not hold "
    "an empty pass would claim more than the record supports."
)


def _interval(ratios: np.ndarray) -> dict[str, Any]:
    seen = ratios[ratios > 0]
    return {
        "lo": float(np.percentile(ratios, 5)),
        "hi": float(np.percentile(ratios, 95)),
        "training_looks": int(ratios.size),
        "looks_that_flagged_nothing": int((ratios == 0).sum()),
        "given_a_detection": [float(np.percentile(seen, 5)), float(np.percentile(seen, 95))] if seen.size else None,
    }


def _decision_summary(doc: dict[str, Any], protocol_text: str) -> dict[str, Any]:
    """What a fitted-values file decided, short enough to keep beside the decision that replaces it."""
    v = ((doc.get("evidence") or {}).get("validation_fitted") or {}).get("verdict", {})
    return {
        "protocol": protocol_text,
        "adopted": doc.get("adopted"),
        "decision": doc.get("decision"),
        "validated_on": doc.get("validated_on"),
        "parts": {name: p.get("status") for name, p in (doc.get("parts") or {}).items()},
        "classes": v.get("classes"),
        "scores": {k: {"reconstruction": row.get("reconstruction"), "painted_modis": row.get("painted_modis"),
                       "overlap_ratio": row.get("overlap_ratio"), "class": row.get("class"),
                       "improvement_interval": row.get("improvement_interval")}
                   for k, row in (v.get("scores") or {}).items()},
        "interval": v.get("interval"),
        "generated_utc": doc.get("revalidated_utc") or doc.get("generated_utc"),
    }


def _protocol_text(doc: dict[str, Any]) -> str:
    p = doc.get("protocol") or {}
    validated, fitted = p.get("validated_under", 1), p.get("parameters_fitted_under", 1)
    what = {
        1: "windows counted hidden overpasses, each prediction used the hidden overpass's time and pixel size, and the calendar ratio held the 2021 test fires",
        2: "hidden rows sealed, predictions published on nominal half-day slots with a typical pixel size, only hidden overpasses that left a detection scored",
        3: "hidden rows sealed, predictions published for every pass of the pass list at its real time and pixel size, passes that flagged nothing scored",
    }.get(validated, "")
    return f"version {validated}: {what}" + ("" if fitted == validated else f"; the values had been fitted under version {fitted} and were not refitted")


RULE: str = (
    "validation fires are resampled whole (2,000 times); a score is ahead when the 90 percent interval of its "
    "improvement over each baseline is above zero, behind when it is below zero against one of them, a tie "
    "otherwise. The fitted values are used when no score is behind and at least one is ahead. A part is on "
    "when every score of the part is ahead (and, for FRP, the 90 percent interval held for at least 80 "
    "percent of validation overpasses); otherwise the part is experimental."
)
CELL_SCORES: tuple[str, ...] = ("csi_strict_375m", "csi_one_cell_tolerance", "hit_rate_at_equal_area", "brier")


def decide(v_fit: dict[str, Any]) -> tuple[bool, str, dict[str, Any], bool]:
    """Apply `RULE` to a bootstrap verdict on validation fires: (adopted, the decision in words, the parts with
    their status, whether the first strict rule is met)."""

    def part(keys: tuple[str, ...]) -> dict[str, Any]:
        rows = {k: v_fit["scores"][k] for k in keys}
        return {"ahead_of_both_baselines_on_validation": all(row["class"] == "ahead" for row in rows.values()),
                "scores": rows}

    cells = part(CELL_SCORES)
    pixels = part(("pixel_count_error_of_sums",))
    frp = part(("frp_error_of_sums", "frp_median_abs_relative_error"))
    cov = v_fit["interval"]["observed_coverage"]
    frp["interval_holds"] = bool(cov is not None and cov >= 0.8)
    adopted = bool(v_fit["classes"]["behind"] == 0 and v_fit["classes"]["ahead"] >= 1)
    strict_rule = all(bool(v_fit["scores"][k]["beats_every_baseline"]) for k in CELL_SCORES)
    decision = (
        f"fitted values are used: on validation fires they are ahead of both baselines on {v_fit['classes']['ahead']} "
        f"of {sum(v_fit['classes'].values())} scores, tied on {v_fit['classes']['tie']} and behind on none, beyond the "
        "noise of resampling the fires" if adopted else
        f"fitted values are NOT used (the priors stand): on validation fires they are ahead of both baselines on "
        f"{v_fit['classes']['ahead']} scores, tied on {v_fit['classes']['tie']} and behind a baseline on "
        f"{v_fit['classes']['behind']}, beyond the noise of resampling the fires"
    )
    parts = {
        "where the fire is (cells and probabilities)": {"status": "on" if adopted and cells["ahead_of_both_baselines_on_validation"] else "experimental", **cells},
        "how many pixels the hidden instrument flags": {"status": "on" if adopted and pixels["ahead_of_both_baselines_on_validation"] else "experimental", **pixels},
        "total fire radiative power and its interval": {"status": "on" if adopted and frp["ahead_of_both_baselines_on_validation"] and frp["interval_holds"] else "experimental", **frp},
    }
    return adopted, decision, parts, strict_rule


def _per_episode(reps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"episode": r["episode"], "scored_overpasses": r["scored_overpasses"],
         **{m: {"csi": r["methods"][m]["strict_375m"]["csi"], "csi_one_cell": r["methods"][m]["tolerant_1_cell"]["csi"],
                "brier": r["methods"][m]["brier"], "frp_ratio_of_sums": r["methods"][m]["frp_total"]["ratio_of_sums"]}
            for m in r["methods"]}}
        for r in reps
    ]


def revalidate(log: Any = print, schedule: str | None = None) -> dict[str, Any]:
    """Run the tracked parameters on the validation episodes again and rewrite the decision. Nothing is fitted.

    The parameters, their priors and the search record stay as they are. The decision the file held is kept under
    `previous_decision`, so what changed is visible in the file itself.
    """
    t0 = time.time()
    path = FITTED_DIR / PARAMS_FILE
    doc = json.loads(path.read_text(encoding="utf-8"))
    known = set(OccupancyParams.__dataclass_fields__)
    fitted = OccupancyParams(**{k: v for k, v in doc["parameters"].items() if k in known})
    prior = OccupancyParams()
    val_eps = load_episodes("validation")
    log(f"validation episodes {len(val_eps)}: " + ", ".join(e.key for e in val_eps))
    ev = Evaluator()
    pooled_fit, reps_fit = ev.pooled(fitted, "validation")
    pooled_prior, reps_prior = ev.pooled(prior, "validation")
    ev.close()
    v_fit, v_prior = bootstrap_verdict(reps_fit), bootstrap_verdict(reps_prior)
    adopted, decision, parts, strict_rule = decide(v_fit)
    fitted_under = int((doc.get("protocol") or {}).get("parameters_fitted_under", 1))
    if (doc.get("protocol") or {}).get("validated_under") == PROTOCOL["version"]:
        previous, earlier = doc.get("previous_decision"), doc.get("earlier_decisions") or []    # the same protocol again
    else:
        previous = _decision_summary(doc, _protocol_text(doc))
        earlier = ([doc["previous_decision"]] if doc.get("previous_decision") else []) + (doc.get("earlier_decisions") or [])
    doc.update({
        "adopted": adopted,
        "decision": decision,
        "validated_on": (
            f"{len(val_eps)} real fire episodes of {', '.join(str(y) for y in VALIDATION_YEARS)} in the same three "
            "context boxes (other years than training; none of them a test fire), each chosen from MODIS rows alone"
        ),
        "rule": RULE,
        "protocol": {
            "validated_under": PROTOCOL["version"],
            "parameters_fitted_under": fitted_under,
            "name": PROTOCOL["name"],
            "note": (
                "fitted and validated under the same protocol" if fitted_under == PROTOCOL["version"] else
                f"the parameters were fitted under protocol version {fitted_under} and have not been refitted; only the "
                f"validation and the decision were recomputed under version {PROTOCOL['version']}"
            ),
        },
        "first_rule_outcome": {**(doc.get("first_rule_outcome") or {}), "met": bool(strict_rule)},
        "parts": parts,
        "previous_decision": previous,
        "earlier_decisions": earlier,
    })
    doc["evidence"] = {
        **{k: v for k, v in (doc.get("evidence") or {}).items() if k in ("training_fitted", "training_episodes")},
        "training_note": f"training_fitted and training_episodes are the record of the fit under protocol version {fitted_under}",
        "validation_fitted": {"verdict": v_fit, "methods": _slim(pooled_fit)},
        "validation_priors": {"verdict": v_prior, "methods": _slim(pooled_prior)},
        "validation_episodes": [e.as_dict() for e in val_eps],
        "validation_per_episode": _per_episode(reps_fit),
    }
    doc["revalidated_utc"] = _stamp()
    doc["revalidation_seconds"] = round(time.time() - t0, 1)
    _write(PARAMS_FILE, doc)
    return doc


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
    then one look at validation episodes that decides what is switched on. Every value starts from the priors:
    nothing of an earlier fit is read but the decision it reached, which is kept beside the new one."""
    t0 = time.time()
    path = FITTED_DIR / PARAMS_FILE
    old = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
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
    # split conformal style intervals: the 5th and 95th percentile of hidden over predicted on training looks,
    # the looks that flagged nothing included (`INTERVAL_RULE`)
    iv_frp = _interval(_ratios(reps, "predicted_frp_mw", "hidden_frp_mw"))
    iv_pix = _interval(_ratios(reps, "predicted_pixels", "hidden_pixels_in_test_box"))
    label = (
        f"{len(train_eps)} real fire episodes of {', '.join(str(y) for y in TRAIN_YEARS_ALL)} in the plumas_ca, lytton_bc "
        "and evia_greece context boxes, the three 2021 test fires excluded (backend/model/episodes.py)"
    )
    best = OccupancyParams(**{**best.as_dict(),
                              "frp_interval_lo": iv_frp["lo"], "frp_interval_hi": iv_frp["hi"],
                              "pixel_interval_lo": iv_pix["lo"], "pixel_interval_hi": iv_pix["hi"],
                              "fitted_on": label})
    pooled_train, reps_train = ev.pooled(best, "train")
    log(f"fitted: {json.dumps({k: (round(v, 4) if isinstance(v, float) else v) for k, v in best.as_dict().items() if k != 'fitted_on'})}")

    # validation: fires of other years, never used above
    pooled_val_fit, reps_val = ev.pooled(best, "validation")
    pooled_val_prior, reps_val_prior = ev.pooled(prior, "validation")
    v_fit, v_prior = bootstrap_verdict(reps_val), bootstrap_verdict(reps_val_prior)
    ev.close()

    adopted, decision, parts, strict_rule = decide(v_fit)
    sources = {r["schedule"]["source"] for r in reps_train + reps_val + reps_val_prior}
    if sources != {S.SOURCE_CMR}:
        raise RuntimeError(f"the fit ran on schedules {sorted(sources)}; it must run on the pass list alone")
    earlier = []
    if old is not None:
        earlier = ([old["previous_decision"]] if old.get("previous_decision") else []) + (old.get("earlier_decisions") or [])
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
        "rule": RULE,
        "protocol": {"validated_under": PROTOCOL["version"], "parameters_fitted_under": PROTOCOL["version"], "name": PROTOCOL["name"],
                     "note": "fitted and validated under the same protocol"},
        "intervals": {"rule": INTERVAL_RULE, "level": 0.90, "frp": iv_frp, "pixels": iv_pix},
        "empty_looks": {
            "training": {"scored_looks": int(sum(r["scored_overpasses"] for r in reps_train)),
                         "no_hidden_pixel_in_the_box": int(sum(r["scored_overpasses"] - r["scored_overpasses_with_hidden_detections_in_test_box"] for r in reps_train)),
                         "passes_that_held_part_of_the_box_not_scored": int(sum(r["schedule"]["partly_in_swath"] for r in reps_train))},
            "validation": {"scored_looks": int(sum(r["scored_overpasses"] for r in reps_val)),
                           "no_hidden_pixel_in_the_box": int(sum(r["scored_overpasses"] - r["scored_overpasses_with_hidden_detections_in_test_box"] for r in reps_val)),
                           "passes_that_held_part_of_the_box_not_scored": int(sum(r["schedule"]["partly_in_swath"] for r in reps_val))},
        },
        "previous_decision": None if old is None else {
            **_decision_summary(old, _protocol_text(old)), "parameters": old.get("parameters"),
        },
        "earlier_decisions": earlier,
        "first_rule_outcome": {
            "rule": "every cell score strictly above both baselines on the pooled validation fires, no allowance for noise",
            "met": bool(strict_rule),
            "note": "this was the rule written before the first fit; it is kept here so the change of rule is visible",
        },
        "parts": parts,
        "evidence": {
            "validation_fitted": {"verdict": v_fit, "methods": _slim(pooled_val_fit)},
            "validation_priors": {"verdict": v_prior, "methods": _slim(pooled_val_prior)},
            "training_fitted": {"verdict": verdict(pooled_train), "methods": _slim(pooled_train)},
            "validation_episodes": [e.as_dict() for e in val_eps],
            "training_episodes": [e.as_dict() for e in train_eps],
            "validation_per_episode": _per_episode(reps_val),
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


def _print_parts(doc: dict[str, Any]) -> None:
    for name, part in doc["parts"].items():
        print(f"[{part['status']}] {name}" + (f"   interval holds: {part['interval_holds']}" if "interval_holds" in part else ""))
        for k, row in part["scores"].items():
            fmt = lambda v: "n/a" if v is None else f"{v:.4f}"  # noqa: E731
            print(f"   {k:32s} recon {fmt(row['reconstruction'])} painted {fmt(row['painted_modis'])} ratio {fmt(row['overlap_ratio'])} "
                  f"{row['class']!s:6s} improvement interval {row['improvement_interval']}")
    iv = doc["evidence"]["validation_fitted"]["verdict"]["interval"]
    print(f"   FRP interval: stated {iv['stated_level']}, observed {iv['observed_coverage']} over {iv['overpasses']} overpasses")


def main(argv: list[str]) -> int:
    what = argv[1] if len(argv) > 1 else "ratio"
    if what == "ratio":
        print(json.dumps(fit_ratio(), indent=1))
        return 0
    if what == "params":
        doc = fit_params(log=lambda m: print(m, flush=True))
        print(json.dumps({k: doc[k] for k in ("adopted", "decision", "first_rule_outcome", "parameters")}, indent=1))
        _print_parts(doc)
        return 0
    if what == "validate":
        doc = revalidate(log=lambda m: print(m, flush=True))
        print(json.dumps({k: doc[k] for k in ("adopted", "decision", "protocol")}, indent=1))
        print("before:", json.dumps(doc["previous_decision"]["parts"]), doc["previous_decision"]["classes"])
        _print_parts(doc)
        return 0
    print(f"unknown fit {what!r}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
