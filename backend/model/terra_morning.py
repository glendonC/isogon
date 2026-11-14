"""What would Terra report at its morning pass, estimated from the VIIRS passes around it? Experimental.

Terra is the only morning overpass (about 10:30 local solar time) and its science data are projected to end in
February 2027. After that the record has a night pass near 01:30 and an afternoon pass near 13:30 from VIIRS and
nothing in between. This module hides every MODIS detection, reconstructs from VIIRS alone with the same occupancy
filter, and asks what Terra's 1 km pixels would have flagged at each of its day passes. It is scored against the
real Terra detections with the harness of `backend/eval`, beside two baselines:

  painted_viirs   the VIIRS detections of the overpass nearest in time (within 12 h), painted on their cells, FRP
                  and count as retrieved
  viirs_ratio     the same cells; pixel count and FRP each times one ratio (Terra over the painted VIIRS pass),
                  fitted on the training looks, with a 5th to 95th percentile interval

The fire dynamics are the fitted values of the reconstruction (`fitted.py`). Three numbers belong to this direction
and are fitted here on training episodes: the FRP scale, the scale on the probability that a Terra pixel is flagged,
and the intervals.

Protocol. The same as the blind test's, version 3, with the instruments exchanged:

  - episodes are runs of VIIRS overpasses chosen from VIIRS rows alone: MODIS, the hidden instrument here, is
    dropped before a window is chosen (`episodes.find_episodes(hidden="MODIS")`);
  - the looks scored are Terra's day passes in NASA's pass list whose swath held the whole box, each at the minute
    its scan crossed the box and with its pixel size there, whether or not it flagged anything;
  - each episode is scored over its window and two days either side, a span that follows from the window and not
    from where the hidden rows happen to lie;
  - predictions are published before the hidden rows are opened (`backend/eval/blind_test.py`).

Years. Training episodes are of `training.TRAINING_YEARS`, validation episodes of `training.VALIDATION_YEARS`. No
episode of the year of the three test fires is used, in any region box or tile: the test of those fires is closed,
and `refuse_closed_years` stops a fit that is handed one.

The tracked result is `fitted_values/terra_morning.json`. It keeps beside it, as `measured_before`, what an earlier
measurement under protocol version 1 said; that one was not blind in two respects (each prediction was made at the
hidden overpass's own time and pixel size, and the episodes were chosen counting both instruments). The direction
is experimental and no route serves it.
"""

from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, replace
import datetime as _dt
import json
import math
import os
from typing import Any

import numpy as np

from backend.eval import metrics as M
from backend.eval import schedule as S
from backend.eval.baselines import PaintedModis
from backend.eval.blind_test import (
    Method,
    Prediction,
    Target,
    bootstrap_verdict,
    pool_reports,
    run_blind_test,
    verdict,
)
from backend.eval.grid import EvalGrid
from backend.eval.overpass import Overpass, group_overpasses
from backend.eval.rows import Detections
from backend.model.episodes import PAD_S
from backend.model.fitted import FITTED_DIR, load_params
from backend.model.occupancy import OccupancyParams
from backend.model.real_blind import EPISODE_OVERPASSES, Window, reconstruction_factory
from backend.model.training import REGIONS, TRAINING_YEARS, VALIDATION_YEARS

TERRA_FILE: str = "terra_morning.json"
BASELINES: tuple[str, ...] = ("painted_viirs", "viirs_ratio")
PAIR_MAX_GAP_S: float = 12.0 * 3600.0
# An episode of this direction is a run of this many VIIRS overpasses with a detection in the tile, holding at
# least this many VIIRS pixels. The other direction asks 60 MODIS pixels; four times that is asked of the finer
# instrument, a number set from the pixel sizes before anything was run and not from any result.
EPISODE_VIIRS_OVERPASSES: int = EPISODE_OVERPASSES
MIN_VIIRS_PIXELS: int = 240
RULE: str = (
    "the validation rule: fires resampled whole 2,000 times; ahead, tie or behind per score at 90 percent. The "
    "estimate is adopted when no score is behind and at least one is ahead, and its status is on only when every "
    "score is ahead and its stated interval held for at least 0.8 of the validation looks"
)
NOT_BLIND_BEFORE: str = (
    "measured under protocol version 1 and not blind in two respects: each prediction was made at the hidden "
    "overpass's own time and pixel size, and the episodes were chosen counting both instruments, which in this "
    "direction includes the hidden one. Kept as measured; the result above replaces it"
)


def is_terra_morning(op: Any) -> bool:
    """Terra's day-side pass (it descends at about 10:30 local solar time). `op` is an overpass or a scheduled look."""
    return op.platform == "MODIS_TERRA" and op.is_day


class PaintedViirs(PaintedModis):
    name = "painted_viirs"
    label = "VIIRS detections of the overpass nearest in time (within 12 h) painted on the cells they cover"


PAIRS: str = (
    "pairs are one Terra day overpass and the VIIRS overpass nearest in time, at most 12 h apart, both with "
    "detections in the box; each ratio is the sum over Terra divided by the sum over VIIRS across all pairs, "
    "and the percentiles are of the per pair ratios"
)
LOOKS: str = (
    "over every scored look of the training episodes, a look that flagged nothing included: each ratio is the sum "
    "of what Terra flagged divided by the sum of what the painted VIIRS pass nearest in time held, and the "
    "percentiles are of the per look ratios of the looks where that pass held a pixel"
)


@dataclass(frozen=True)
class TerraRatios:
    """Terra's morning pass against the VIIRS overpass nearest in time, on training rows."""

    frp: float
    frp_p05: float
    frp_p95: float
    pixels: float
    pixels_p05: float
    pixels_p95: float
    n_pairs: int
    trained_on: str
    definition: str = PAIRS

    def as_dict(self) -> dict[str, Any]:
        return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in self.__dict__.items()}


def terra_pairs(det: Detections, box: tuple[float, float, float, float]) -> list[tuple[Overpass, Overpass]]:
    inside = det.select(det.in_box(box))
    passes = group_overpasses(inside)
    terra = [p for p in passes if is_terra_morning(p)]
    viirs = [p for p in passes if p.family == "VIIRS"]
    if not terra or not viirs:
        return []
    vt = np.array([p.time_s for p in viirs])
    out = []
    for t in terra:
        j = int(np.argmin(np.abs(vt - t.time_s)))
        if abs(vt[j] - t.time_s) <= PAIR_MAX_GAP_S:
            out.append((t, viirs[j], inside))
    return out  # type: ignore[return-value]


def fit_terra_ratios(episodes: list[Any], trained_on: str) -> TerraRatios:
    """Ratios over every (Terra morning pass, nearest VIIRS pass) pair of the training episodes' boxes, both with
    detections. The fit under the protocol in use takes them from the scored looks instead (`ratios_from_reports`)."""
    t_frp, v_frp, t_n, v_n = [], [], [], []
    for ep in episodes:
        for t, v, inside in terra_pairs(ep.det, ep.box):  # type: ignore[misc]
            t_frp.append(float(inside.frp_mw[t.index].sum()))
            v_frp.append(float(inside.frp_mw[v.index].sum()))
            t_n.append(float(t.n))
            v_n.append(float(v.n))
    if not t_frp:
        raise ValueError("no Terra morning pass with a VIIRS pass near it in the training episodes")
    tf, vf, tn, vn = (np.array(x) for x in (t_frp, v_frp, t_n, v_n))
    rf, rn = tf / np.maximum(vf, 1e-9), tn / np.maximum(vn, 1e-9)
    return TerraRatios(
        frp=float(tf.sum() / vf.sum()), frp_p05=float(np.percentile(rf, 5)), frp_p95=float(np.percentile(rf, 95)),
        pixels=float(tn.sum() / vn.sum()), pixels_p05=float(np.percentile(rn, 5)), pixels_p95=float(np.percentile(rn, 95)),
        n_pairs=len(t_frp), trained_on=trained_on,
    )


def ratios_from_reports(reports: list[dict[str, Any]], trained_on: str) -> TerraRatios:
    """The second baseline's ratios under the protocol in use: Terra over the painted VIIRS pass, summed over every
    scored look of the reports given, the looks that flagged nothing included. So the baseline is fitted on the same
    looks, counted the same way, as the estimate's own scales."""
    pf, tf, pn, tn = [], [], [], []
    for r in reports:
        for po, tg in zip(r["methods"]["painted_viirs"]["per_overpass"], r["targets"]):
            if not po["predicted_pixels"]:
                continue                                      # no VIIRS pass within 12 h, or one that held no pixel
            pn.append(float(po["predicted_pixels"]))
            tn.append(float(tg["hidden_pixels_in_test_box"]))
            pf.append(float(po["predicted_frp_mw"]))
            tf.append(float(tg["hidden_frp_mw"]))
    if not pn:
        raise ValueError("no scored look with a painted VIIRS pass near it in the reports given")
    a_pf, a_tf, a_pn, a_tn = (np.array(x) for x in (pf, tf, pn, tn))
    rf, rn = a_tf / np.maximum(a_pf, 1e-9), a_tn / np.maximum(a_pn, 1e-9)
    return TerraRatios(
        frp=float(a_tf.sum() / max(a_pf.sum(), 1e-9)), frp_p05=float(np.percentile(rf, 5)), frp_p95=float(np.percentile(rf, 95)),
        pixels=float(a_tn.sum() / a_pn.sum()), pixels_p05=float(np.percentile(rn, 5)), pixels_p95=float(np.percentile(rn, 95)),
        n_pairs=len(pn), trained_on=trained_on, definition=LOOKS,
    )


class ViirsRatio:
    """Baseline 2 for this direction: painted VIIRS cells; count and FRP each times one fitted ratio."""

    name = "viirs_ratio"

    def __init__(self, visible: Detections, grid: EvalGrid, ratios: TerraRatios) -> None:
        self._painted = PaintedViirs(visible, grid)
        self.grid = grid
        self.r = ratios
        self.label = (
            f"painted VIIRS cells; Terra pixels = {ratios.pixels:.3f} and Terra FRP = {ratios.frp:.3f} times the nearest "
            f"VIIRS overpass (from {ratios.n_pairs} pairs: {ratios.trained_on}); intervals from the 5th to 95th percentile"
        )

    def predict(self, target: Target) -> Prediction:
        p = self._painted.painted_for(target.time_s)
        if p is None:
            z = np.zeros(self.grid.shape)
            return Prediction(z, z.copy(), 0.0, 0.0, 0.0, 0.90, pixels=0.0, pixels_lo=0.0, pixels_hi=0.0, pixels_level=0.90)
        r = self.r
        return Prediction(
            p_detect=p.mask.astype(np.float64), frp_mw=p.frp_mw * r.frp, frp_total_mw=r.frp * p.frp_total_mw,
            frp_total_lo=r.frp_p05 * p.frp_total_mw, frp_total_hi=r.frp_p95 * p.frp_total_mw, level=0.90,
            pixels=r.pixels * p.n_pixels, pixels_lo=r.pixels_p05 * p.n_pixels, pixels_hi=r.pixels_p95 * p.n_pixels,
            pixels_level=0.90,
        )


def base_params(fire: OccupancyParams | None = None) -> OccupancyParams:
    """The reconstruction's fire dynamics with the sensor-side numbers of the other direction switched off.

    VIIRS is the visible instrument here: one of its pixels is about one cell, so the count scales are 1. Warm
    cells are a thing VIIRS sees and MODIS does not, so their shares are 0. The FRP scale, the pixel scale and
    the intervals are then fitted for this direction.
    """
    fire = fire or load_params()
    return replace(
        fire, count_scale_day=1.0, count_scale_night=1.0, smolder_day=0.0, smolder_night=0.0, frp_scale=1.0,
        frp_scale_night=1.0, hidden_pixel_scale=1.0, frp_interval_lo=None, frp_interval_hi=None,
        pixel_interval_lo=None, pixel_interval_hi=None,
    )


def span_of(window: Window) -> tuple[float, float]:
    """The span an episode is scored over: its window and two days either side, so that it holds several morning
    passes. It follows from the window, which is chosen from VIIRS rows alone; no hidden row moves it."""
    return (window.start_s - PAD_S, window.end_s + PAD_S)


def run_terra_test(
    det: Detections, box: tuple[float, float, float, float], window: tuple[float, float], params: OccupancyParams,
    ratios: TerraRatios, schedule: str = S.SOURCE_AUTO, read_passes: S.PassReader | None = None,
) -> dict[str, Any]:
    """Blind test with MODIS hidden, scored at Terra's day passes inside `window`. `schedule` is the blind test's:
    "cmr" asks for the pass list and fails without one, "auto" falls back to the nominal schedule."""

    def painted(visible: Detections, grid: EvalGrid) -> Method:
        return PaintedViirs(visible, grid)

    def ratio(visible: Detections, grid: EvalGrid) -> Method:
        return ViirsRatio(visible, grid, ratios)

    report = run_blind_test(
        det, box,
        [painted, ratio, reconstruction_factory(params, label="occupancy filter on the 375 m grid from VIIRS only; fire dynamics from the reconstruction's fitted values")],
        hidden="MODIS", window=window, reference_method="painted_viirs", target_filter=is_terra_morning,
        schedule=schedule, read_passes=read_passes,
    )
    report["hidden_platforms"] = ["MODIS_TERRA", "MODIS_AQUA"]
    report["scored_platform"] = "MODIS_TERRA, day side (the morning pass)"
    return report


# ---- the episodes of this direction ---------------------------------------------------------------------------------

def refuse_closed_years(years: tuple[int, ...] | list[int]) -> None:
    """Raise when a year of a test fire is among `years`: no window of such a year is scored again, for any purpose."""
    from backend.model.calendar_ratio import years_of_test_fires

    closed = sorted({y for region in REGIONS for y in years_of_test_fires(region)} & set(int(y) for y in years))
    if closed:
        raise ValueError(f"{', '.join(str(y) for y in closed)} is the year of the three test fires: its windows are closed and are not fitted or validated on")


def terra_years(split: str) -> tuple[int, ...]:
    """The years of the training or the validation episodes of this direction; never a year of a test fire."""
    years = tuple(TRAINING_YEARS if split == "train" else VALIDATION_YEARS)
    refuse_closed_years(years)
    return years


_EPISODES: dict[str, list[Any]] = {}


def terra_episodes(split: str) -> list[Any]:
    """Episodes chosen from VIIRS rows alone (MODIS, hidden here, is dropped before choosing), from real rows."""
    if split not in _EPISODES:
        from backend.firms import read_firms, region_box
        from backend.model.episodes import find_episodes
        from backend.terrain.live_region import PRESET_BY_ID

        _EPISODES[split] = find_episodes(terra_years(split), read_firms, region_box, PRESET_BY_ID, hidden="MODIS",
                                         min_visible_pixels=MIN_VIIRS_PIXELS, overpasses=EPISODE_VIIRS_OVERPASSES)
    return _EPISODES[split]


# ---- the fit ----------------------------------------------------------------------------------------------------

def _run_job(job: tuple[Any, dict[str, Any], dict[str, Any]]) -> dict[str, Any]:
    ep, pdict, rdict = job
    known = set(OccupancyParams.__dataclass_fields__)
    params = OccupancyParams(**{k: v for k, v in pdict.items() if k in known})
    report = run_terra_test(ep.det, ep.box, span_of(ep.window), params, TerraRatios(**rdict), schedule=S.SOURCE_CMR)
    report.pop("definitions", None)
    report["episode"] = ep.key
    return report


def _ratio_of(reps: list[dict[str, Any]], key_pred: str, key_truth: str) -> float | None:
    """Sum of hidden over sum of predicted, over every scored look that states a prediction."""
    num = den = 0.0
    for r in reps:
        for po, tg in zip(r["methods"]["reconstruction"]["per_overpass"], r["targets"]):
            if po[key_pred] is not None:
                num += float(tg[key_truth])
                den += float(po[key_pred])
    return num / den if den > 0 else None


def _ratios(reps: list[dict[str, Any]], key_pred: str, key_truth: str) -> np.ndarray:
    """Hidden over predicted for every scored look with a positive prediction; a look that flagged nothing is in it
    with a ratio of zero."""
    out = []
    for r in reps:
        for po, tg in zip(r["methods"]["reconstruction"]["per_overpass"], r["targets"]):
            p, t = po[key_pred], tg[key_truth]
            if p is not None and p > 0:
                out.append(float(t) / float(p))
    return np.array(out)


def _empty(reps: list[dict[str, Any]]) -> dict[str, int]:
    scored = int(sum(r["scored_overpasses"] for r in reps))
    with_pixels = int(sum(r["scored_overpasses_with_hidden_detections_in_test_box"] for r in reps))
    return {"scored_looks": scored, "no_hidden_pixel_in_the_box": scored - with_pixels,
            "passes_that_held_part_of_the_box_not_scored": int(sum((r.get("schedule") or {}).get("partly_in_swath", 0) for r in reps))}


def _before(old: dict[str, Any] | None) -> dict[str, Any] | None:
    """What the file said before this measurement, short enough to keep beside the result that replaces it."""
    if old is None:
        return None
    if "measured_before" in old and (old.get("protocol") or {}).get("version") == 3:
        return old["measured_before"]                        # measured again under the protocol in use: keep the first
    v = ((old.get("evidence") or {}).get("validation") or {}).get("verdict") or {}
    return {
        "protocol_version": 1,
        "note": NOT_BLIND_BEFORE,
        "adopted": old.get("adopted"),
        "status": old.get("status"),
        "decision": old.get("decision"),
        "trained_on": old.get("trained_on"),
        "validated_on": old.get("validated_on"),
        "scored_terra_overpasses": ((old.get("evidence") or {}).get("validation") or {}).get("scored_terra_overpasses"),
        "classes": v.get("classes"),
        "scores": {k: {"reconstruction": row.get("reconstruction"), "painted_viirs": row.get("painted_viirs"),
                       "viirs_ratio": row.get("viirs_ratio"), "class": row.get("class")}
                   for k, row in (v.get("scores") or {}).items()},
        "interval": v.get("interval"),
    }


def fit_terra(train: list[Any], validation: list[Any], log: Any = print, workers: int | None = None,
              write: bool = True) -> dict[str, Any]:
    """Fit this direction's three numbers on training episodes, decide on validation episodes, write the file.

    Every episode is scored on the pass list, over its window and two days either side. The second baseline's
    ratios, the estimate's two scales and the intervals are all fitted on the training looks; the validation
    episodes decide and fit nothing.
    """
    for split, eps in (("train", train), ("validation", validation)):
        refuse_closed_years(sorted({int(e.year) for e in eps}))
    years = sorted({int(e.year) for e in train})
    label = (
        f"{len(train)} training fire episodes of {', '.join(str(y) for y in years)} in the {', '.join(REGIONS[:-1])} and "
        f"{REGIONS[-1]} context boxes, each a run of {EPISODE_VIIRS_OVERPASSES} VIIRS overpasses chosen from VIIRS rows alone; "
        "no window of 2021, the year of the three test fires"
    )
    pool = ProcessPoolExecutor(max_workers=workers or max(1, min(7, (os.cpu_count() or 2) - 1)))

    def run(params: OccupancyParams, eps: list[Any], ratios: TerraRatios) -> list[dict[str, Any]]:
        reps = list(pool.map(_run_job, [(ep, params.as_dict(), dict(ratios.__dict__)) for ep in eps]))
        sources = {r["schedule"]["source"] for r in reps}
        if sources - {S.SOURCE_CMR}:
            raise RuntimeError(f"the fit ran on schedules {sorted(sources)}; it must run on the pass list alone")
        return [r for r in reps if r["scored_overpasses"] > 0]

    try:
        params = base_params()
        # the second baseline first: its ratios come from the painted VIIRS pass on the training looks
        unit = TerraRatios(1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0, "not fitted yet", LOOKS)
        ratios = ratios_from_reports(run(params, train, unit), label)
        log(f"ratios: {json.dumps(ratios.as_dict())[:400]}")
        for _ in range(2):
            reps = run(params, train, ratios)
            fr = _ratio_of(reps, "predicted_frp_mw", "hidden_frp_mw") or 1.0
            pr = _ratio_of(reps, "predicted_pixels", "hidden_pixels_in_test_box") or 1.0
            params = replace(params, frp_scale=params.frp_scale * fr, frp_scale_night=params.frp_scale_night * fr,
                             hidden_pixel_scale=float(np.clip(params.hidden_pixel_scale * pr, 0.05, 20.0)))
            log(f"matched: frp_scale {params.frp_scale:.4f} hidden_pixel_scale {params.hidden_pixel_scale:.4f}")
        reps = run(params, train, ratios)
        iv_frp = M.stated_interval(_ratios(reps, "predicted_frp_mw", "hidden_frp_mw"))
        iv_pix = M.stated_interval(_ratios(reps, "predicted_pixels", "hidden_pixels_in_test_box"))
        if iv_frp is None or iv_pix is None:
            raise RuntimeError("no training look with a positive prediction: nothing to take an interval from")
        log(f"intervals: frp {iv_frp['lo']:.3f} to {iv_frp['hi']:.3f} (one-sided {iv_frp['one_sided']}), "
            f"pixels {iv_pix['lo']:.3f} to {iv_pix['hi']:.3f} (one-sided {iv_pix['one_sided']}); "
            f"{iv_frp['looks_that_flagged_nothing']} of {iv_frp['looks']} training looks flagged nothing")
        params = replace(
            params,
            frp_interval_lo=iv_frp["lo"], frp_interval_hi=iv_frp["hi"],
            pixel_interval_lo=iv_pix["lo"], pixel_interval_hi=iv_pix["hi"],
            fitted_on="fire dynamics: " + load_params().fitted_on + "; Terra direction scales and intervals: " + label,
        )
        train_reps = run(params, train, ratios)
        val_reps = run(params, validation, ratios)
    finally:
        pool.shutdown()
    v = bootstrap_verdict(val_reps, baselines=BASELINES)
    pooled_val, pooled_train = pool_reports(val_reps), pool_reports(train_reps)
    cov = v["interval"]["observed_coverage"]
    adopted = bool(v["classes"]["behind"] == 0 and v["classes"]["ahead"] >= 1)
    val_years = sorted({int(e.year) for e in validation})
    old = json.loads((FITTED_DIR / TERRA_FILE).read_text(encoding="utf-8")) if (FITTED_DIR / TERRA_FILE).is_file() else None
    doc = {
        "what": "estimate of Terra's morning pass from VIIRS alone",
        "adopted": adopted,
        "decision": (
            f"on validation fires the estimate is ahead of both baselines on {v['classes']['ahead']} of "
            f"{sum(v['classes'].values())} scores, tied on {v['classes']['tie']} and behind on {v['classes']['behind']}, "
            "beyond the noise of resampling the fires; its 90 percent interval held for "
            f"{None if cov is None else round(cov, 3)} of the validation looks"
        ),
        "status": "on" if adopted and all(row["class"] == "ahead" for row in v["scores"].values()) and (cov or 0) >= 0.8 else "experimental",
        "rule": RULE,
        "protocol": {
            "version": 3,
            "looks": S.SOURCE_CMR,
            "scored": "every day pass of Terra in the pass list whose swath held the whole box, at the minute its scan crossed the box and with its pixel size there, whether or not it flagged anything",
            "episodes_chosen_from": "VIIRS rows only (MODIS is hidden and was dropped before choosing)",
            "episode": f"the run of {EPISODE_VIIRS_OVERPASSES} consecutive VIIRS overpasses with a detection in the tile that flagged the most pixels there, at least {MIN_VIIRS_PIXELS} of them, in at most 120 hours; the three busiest tiles of each region and year",
            "span_scored": "each episode's window and two days either side",
        },
        "parameters": params.as_dict(),
        "ratios": ratios.as_dict(),
        "intervals": {"rule": M.STATED_INTERVAL_RULE, "level": 0.90, "frp": iv_frp, "pixels": iv_pix},
        "trained_on": label,
        "training_years": years,
        "validated_on": f"{len(validation)} validation fire episodes of {', '.join(str(y) for y in val_years)}, chosen the same way",
        "validation_years": val_years,
        "episodes": {"training": [e.as_dict() for e in train], "validation": [e.as_dict() for e in validation]},
        "empty_looks": {"training": _empty(train_reps), "validation": _empty(val_reps)},
        "evidence": {
            "validation": {"verdict": v, "scored_terra_overpasses": pooled_val["scored_overpasses"], "runs": pooled_val["runs"],
                           "methods": {k: _slim(m) for k, m in pooled_val["methods"].items()}},
            "training": {"verdict": verdict(pooled_train, baselines=BASELINES), "scored_terra_overpasses": pooled_train["scored_overpasses"],
                         "methods": {k: _slim(m) for k, m in pooled_train["methods"].items()}},
        },
        "measured_before": _before(old),
        "generated_utc": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if write:
        FITTED_DIR.mkdir(parents=True, exist_ok=True)
        (FITTED_DIR / TERRA_FILE).write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    return doc


def _slim(m: dict[str, Any]) -> dict[str, Any]:
    return {k: m[k] for k in ("strict_375m", "tolerant_1_cell", "equal_area", "brier", "pixel_count", "frp_total", "interval")}


def load_terra() -> tuple[OccupancyParams, TerraRatios] | None:
    """The tracked parameters and ratios of this direction, or None before they are fitted."""
    path = FITTED_DIR / TERRA_FILE
    if not path.is_file():
        return None
    doc = json.loads(path.read_text(encoding="utf-8"))
    known = set(OccupancyParams.__dataclass_fields__)
    params = OccupancyParams(**{k: v for k, v in doc["parameters"].items() if k in known})
    r = doc["ratios"]
    ratios = TerraRatios(r["frp"], r["frp_p05"], r["frp_p95"], r["pixels"], r["pixels_p05"], r["pixels_p95"], r["n_pairs"],
                         r["trained_on"], r.get("definition", PAIRS))
    return params, ratios


def main(argv: list[str] | None = None) -> int:
    """python3 -m backend.model.terra_morning [out.json] [--workers=N] [--record]

    Fits and validates the direction on real rows. Without `--record` the tracked file is left as it is and the
    result goes to `out.json` only; `--record-from=<out.json>` writes a result measured earlier into the tracked file.
    """
    import sys

    argv = list(sys.argv if argv is None else argv)
    measured = next((a.split("=", 1)[1] for a in argv[1:] if a.startswith("--record-from=")), None)
    if measured:
        with open(measured, encoding="utf-8") as fh:
            doc = json.load(fh)
        (FITTED_DIR / TERRA_FILE).write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
        print(f"recorded as {TERRA_FILE}")
        return 0
    args = [a for a in argv[1:] if not a.startswith("--")]
    workers = next((int(a.split("=", 1)[1]) for a in argv[1:] if a.startswith("--workers=")), None)
    train, val = terra_episodes("train"), terra_episodes("validation")
    print(f"episodes chosen from VIIRS rows alone: {len(train)} training ({', '.join(str(y) for y in terra_years('train'))}), "
          f"{len(val)} validation ({', '.join(str(y) for y in terra_years('validation'))})", flush=True)
    doc = fit_terra(train, val, log=lambda m: print(m, flush=True), workers=workers, write="--record" in argv)
    if args:
        with open(args[0], "w", encoding="utf-8") as fh:
            json.dump(doc, fh, indent=1)
            fh.write("\n")
    print(json.dumps({k: doc[k] for k in ("adopted", "status", "decision")}, indent=1))
    for k, row in doc["evidence"]["validation"]["verdict"]["scores"].items():
        print(f"   {k:32s} recon {row['reconstruction']!s:>10.10} painted_viirs {row['painted_viirs']!s:>10.10} viirs_ratio {row['viirs_ratio']!s:>10.10} {row['class']}")
    print(f"   empty looks: {json.dumps(doc['empty_looks'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
