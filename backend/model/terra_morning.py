"""What would Terra report at its morning pass, estimated from the VIIRS passes around it? Experimental.

Terra is the only morning overpass (about 10:30 local solar time) and its science data are projected to end in
February 2027. After that the record has a night pass near 01:30 and an afternoon pass near 13:30 from VIIRS and
nothing in between. This module hides every MODIS detection, reconstructs from VIIRS alone with the same occupancy
filter, and asks what Terra's 1 km pixels would have flagged at each real Terra day overpass. It is scored against
the real Terra detections with the harness of `backend/eval`, beside two baselines:

  painted_viirs   the VIIRS detections of the overpass nearest in time (within 12 h), painted on their cells, FRP
                  and count as retrieved
  viirs_ratio     the same cells; pixel count and FRP each times one ratio (Terra over nearest VIIRS overpass),
                  fitted on training rows, with a 5th to 95th percentile interval

The fire dynamics are the fitted values of the reconstruction (`fitted.py`). Three numbers belong to this direction
and are fitted here on training episodes: the FRP scale, the scale on the probability that a Terra pixel is flagged, and the intervals.
Nothing from the three test fires is read in fitting.

Protocol. The tracked result of this direction, `fitted_values/terra_morning.json`, is fitted and validated under
protocol version 1 and is not measured under a later version. Two things in it are not blind: each prediction is
made at the hidden Terra overpass's own time and pixel size, and the episodes are chosen counting both instruments,
which in this direction includes the hidden one. The harness publishes on a schedule that reads no hidden row for
Terra as for VIIRS, so a new run is blind in the first respect; for the second, the episodes must be chosen with
`hidden="MODIS"` before `fit_terra` is run again. The file says so, the direction is experimental, and no route
serves it.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
import datetime as _dt
import json
import math
from typing import Any

import numpy as np

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
from backend.model.fitted import FITTED_DIR, load_params
from backend.model.occupancy import OccupancyParams
from backend.model.real_blind import reconstruction_factory

TERRA_FILE: str = "terra_morning.json"
BASELINES: tuple[str, ...] = ("painted_viirs", "viirs_ratio")
PAIR_MAX_GAP_S: float = 12.0 * 3600.0


def is_terra_morning(op: Overpass) -> bool:
    """Terra's day-side overpass (it descends at about 10:30 local solar time)."""
    return op.platform == "MODIS_TERRA" and op.is_day


class PaintedViirs(PaintedModis):
    name = "painted_viirs"
    label = "VIIRS detections of the overpass nearest in time (within 12 h) painted on the cells they cover"


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

    def as_dict(self) -> dict[str, Any]:
        d = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in self.__dict__.items()}
        d["definition"] = (
            "pairs are one Terra day overpass and the VIIRS overpass nearest in time, at most 12 h apart, both with "
            "detections in the box; each ratio is the sum over Terra divided by the sum over VIIRS across all pairs, "
            "and the percentiles are of the per pair ratios"
        )
        return d


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
    """Ratios over every (Terra morning pass, nearest VIIRS pass) pair of the training episodes' boxes."""
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


def run_terra_test(
    det: Detections, box: tuple[float, float, float, float], window: tuple[float, float], params: OccupancyParams,
    ratios: TerraRatios,
) -> dict[str, Any]:
    """Blind test with MODIS hidden, scored at Terra's morning overpasses inside `window`."""

    def painted(visible: Detections, grid: EvalGrid) -> Method:
        return PaintedViirs(visible, grid)

    def ratio(visible: Detections, grid: EvalGrid) -> Method:
        return ViirsRatio(visible, grid, ratios)

    report = run_blind_test(
        det, box,
        [painted, ratio, reconstruction_factory(params, label="occupancy filter on the 375 m grid from VIIRS only; fire dynamics from the reconstruction's fitted values")],
        hidden="MODIS", window=window, reference_method="painted_viirs", target_filter=is_terra_morning,
    )
    report["hidden_platforms"] = ["MODIS_TERRA", "MODIS_AQUA"]
    report["scored_platform"] = "MODIS_TERRA, day side (the morning pass)"
    return report


def _ratio_of(reps: list[dict[str, Any]], key_pred: str, key_truth: str) -> float | None:
    num = den = 0.0
    for r in reps:
        for po, tg in zip(r["methods"]["reconstruction"]["per_overpass"], r["targets"]):
            if po[key_pred] is not None:
                num += float(tg[key_truth])
                den += float(po[key_pred])
    return num / den if den > 0 else None


def _logs(reps: list[dict[str, Any]], key_pred: str, key_truth: str) -> np.ndarray:
    out = []
    for r in reps:
        for po, tg in zip(r["methods"]["reconstruction"]["per_overpass"], r["targets"]):
            p, t = po[key_pred], tg[key_truth]
            if p is not None and p > 0 and t > 0:
                out.append(math.log(float(t) / float(p)))
    return np.array(out)


def fit_terra(train: list[Any], validation: list[Any], log: Any = print) -> dict[str, Any]:
    """Fit this direction's three numbers on training episodes, decide on validation episodes, write the file.

    Each episode is scored over its rows' whole span (the 24 overpass window and two days either side), so that
    it holds several Terra morning passes.
    """
    label = f"{len(train)} training fire episodes (backend/model/episodes.py), the three 2021 test fires excluded"
    ratios = fit_terra_ratios(train, label)
    log(f"ratios: {json.dumps(ratios.as_dict())[:300]}")

    def span(ep: Any) -> tuple[float, float]:
        return (float(ep.det.time_s.min()), float(ep.det.time_s.max()) + 1.0)

    def run(params: OccupancyParams, eps: list[Any]) -> list[dict[str, Any]]:
        reps = [run_terra_test(ep.det, ep.box, span(ep), params, ratios) for ep in eps]
        return [r for r in reps if r["scored_overpasses"] > 0]

    params = base_params()
    for _ in range(2):
        reps = run(params, train)
        fr = _ratio_of(reps, "predicted_frp_mw", "hidden_frp_mw") or 1.0
        pr = _ratio_of(reps, "predicted_pixels", "hidden_pixels_in_test_box") or 1.0
        params = replace(params, frp_scale=params.frp_scale * fr, frp_scale_night=params.frp_scale_night * fr,
                         hidden_pixel_scale=float(np.clip(params.hidden_pixel_scale * pr, 0.05, 20.0)))
        log(f"matched: frp_scale {params.frp_scale:.4f} hidden_pixel_scale {params.hidden_pixel_scale:.4f}")
    reps = run(params, train)
    lf, lp = _logs(reps, "predicted_frp_mw", "hidden_frp_mw"), _logs(reps, "predicted_pixels", "hidden_pixels_in_test_box")
    params = replace(
        params,
        frp_interval_lo=float(math.exp(np.percentile(lf, 5))), frp_interval_hi=float(math.exp(np.percentile(lf, 95))),
        pixel_interval_lo=float(math.exp(np.percentile(lp, 5))), pixel_interval_hi=float(math.exp(np.percentile(lp, 95))),
        fitted_on="fire dynamics: " + load_params().fitted_on + "; Terra direction scales and intervals: " + label,
    )
    train_reps = run(params, train)
    val_reps = run(params, validation)
    v = bootstrap_verdict(val_reps, baselines=BASELINES)
    pooled_val, pooled_train = pool_reports(val_reps), pool_reports(train_reps)
    cov = v["interval"]["observed_coverage"]
    adopted = bool(v["classes"]["behind"] == 0 and v["classes"]["ahead"] >= 1)
    doc = {
        "what": "estimate of Terra's morning pass from VIIRS alone",
        "adopted": adopted,
        "decision": (
            f"on validation fires the estimate is ahead of both baselines on {v['classes']['ahead']} of "
            f"{sum(v['classes'].values())} scores, tied on {v['classes']['tie']} and behind on {v['classes']['behind']}, "
            "beyond the noise of resampling the fires; its 90 percent interval held for "
            f"{None if cov is None else round(cov, 3)} of the validation overpasses"
        ),
        "status": "on" if adopted and all(row["class"] == "ahead" for row in v["scores"].values()) and (cov or 0) >= 0.8 else "experimental",
        "rule": "the validation rule: fires resampled whole 2,000 times; ahead, tie or behind per score at 90 percent",
        "parameters": params.as_dict(),
        "ratios": ratios.as_dict(),
        "trained_on": label,
        "validated_on": f"{len(validation)} validation fire episodes of other years",
        "evidence": {
            "validation": {"verdict": v, "scored_terra_overpasses": pooled_val["scored_overpasses"], "runs": pooled_val["runs"],
                           "methods": {k: _slim(m) for k, m in pooled_val["methods"].items()}},
            "training": {"verdict": verdict(pooled_train, baselines=BASELINES), "scored_terra_overpasses": pooled_train["scored_overpasses"],
                         "methods": {k: _slim(m) for k, m in pooled_train["methods"].items()}},
        },
        "generated_utc": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
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
    ratios = TerraRatios(r["frp"], r["frp_p05"], r["frp_p95"], r["pixels"], r["pixels_p05"], r["pixels_p95"], r["n_pairs"], r["trained_on"])
    return params, ratios


def main() -> int:
    from backend.model.fit_real import load_episodes

    doc = fit_terra(load_episodes("train"), load_episodes("validation"), log=lambda m: print(m, flush=True))
    print(json.dumps({k: doc[k] for k in ("adopted", "status", "decision")}, indent=1))
    for k, row in doc["evidence"]["validation"]["verdict"]["scores"].items():
        print(f"   {k:32s} recon {row['reconstruction']!s:>10.10} painted_viirs {row['painted_viirs']!s:>10.10} viirs_ratio {row['viirs_ratio']!s:>10.10} {row['class']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
