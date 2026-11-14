"""The two baselines every blind-test number stands beside.

  painted MODIS     the MODIS detections of the overpass nearest in time, painted onto the 375 m cells their real
                    footprints cover, FRP as retrieved. No model, no interval.
  overlap ratio     the same cells, with the FRP multiplied by one number: total VIIRS FRP over total MODIS FRP on
                    co-observed overpass pairs from training rows. Its interval is the 5th to 95th percentile of the
                    per pair ratios. A single number cannot move or add cells, so its cell scores equal the painted
                    baseline's by construction.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from backend.eval.blind_test import Method, Prediction, Target
from backend.eval.grid import EvalGrid, Painted, paint
from backend.eval.overpass import Overpass, group_overpasses
from backend.eval.rows import Detections

# A visible overpass further than this from the hidden one is not used: the baseline then predicts no fire.
MAX_NEAREST_GAP_S: float = 12.0 * 3600.0
# VIIRS and Aqua MODIS passes within this many seconds count as co-observed (Suomi NPP and NOAA-20 fly the same
# 13:30 orbit plane as Aqua, half an orbit apart from each other).
PAIR_MAX_GAP_S: float = 90.0 * 60.0


class PaintedModis:
    """Baseline 1. Uses the visible overpass nearest in time to the hidden one, before or after."""

    name = "painted_modis"
    label = "MODIS detections painted onto the cells they cover (nearest overpass in time, within 12 h)"

    def __init__(self, visible: Detections, grid: EvalGrid, max_gap_s: float = MAX_NEAREST_GAP_S) -> None:
        self.grid = grid
        self.max_gap_s = float(max_gap_s)
        inside = visible.select(visible.in_box(grid.bbox))
        self._det = inside
        self._passes: list[Overpass] = group_overpasses(inside)
        self._painted: dict[int, Painted] = {}

    def nearest(self, time_s: float) -> tuple[int, Overpass] | None:
        if not self._passes:
            return None
        gaps = [abs(p.time_s - time_s) for p in self._passes]
        i = int(np.argmin(gaps))
        return (i, self._passes[i]) if gaps[i] <= self.max_gap_s else None

    def painted_for(self, time_s: float) -> Painted | None:
        hit = self.nearest(time_s)
        if hit is None:
            return None
        i, op = hit
        if i not in self._painted:
            self._painted[i] = paint(self.grid, self._det.select(op.index))
        return self._painted[i]

    def predict(self, target: Target) -> Prediction:
        p = self.painted_for(target.time_s)
        if p is None:
            z = np.zeros(self.grid.shape)
            return Prediction(p_detect=z, frp_mw=z.copy(), frp_total_mw=0.0, pixels=0.0)
        return Prediction(
            p_detect=p.mask.astype(np.float64), frp_mw=p.frp_mw.copy(), frp_total_mw=p.frp_total_mw,
            pixels=float(p.n_pixels),
        )

    def platform_pixels(self, time_s: float, platform: str) -> int:
        """Pixels in the box of the nearest overpass of one platform within the gap limit (0 when there is none)."""
        best: Overpass | None = None
        for op in self._passes:
            if op.platform != platform or abs(op.time_s - time_s) > self.max_gap_s:
                continue
            if best is None or abs(op.time_s - time_s) < abs(best.time_s - time_s):
                best = op
        return 0 if best is None else best.n


@dataclass(frozen=True)
class OverlapRatioFit:
    """A single VIIRS over MODIS FRP ratio and where it came from."""

    ratio: float            # sum of VIIRS FRP / sum of MODIS FRP over the pairs
    ratio_p05: float        # 5th percentile of the per pair ratios
    ratio_p50: float
    ratio_p95: float
    n_pairs: int
    sum_viirs_mw: float
    sum_modis_mw: float
    trained_on: str         # the caller's description of the training rows

    def as_dict(self) -> dict[str, Any]:
        return {
            "ratio": round(self.ratio, 4),
            "ratio_p05": round(self.ratio_p05, 4),
            "ratio_p50": round(self.ratio_p50, 4),
            "ratio_p95": round(self.ratio_p95, 4),
            "n_pairs": self.n_pairs,
            "sum_viirs_mw": round(self.sum_viirs_mw, 1),
            "sum_modis_mw": round(self.sum_modis_mw, 1),
            "trained_on": self.trained_on,
            "definition": (
                "Pairs are one MODIS overpass and the VIIRS overpass nearest in time, at most 90 minutes apart, "
                "both with detections in the training rows given. ratio = sum of VIIRS FRP / sum of MODIS FRP over "
                "all pairs; the percentiles are of the per pair ratios."
            ),
        }


def overlap_pairs(det: Detections, max_gap_s: float = PAIR_MAX_GAP_S) -> list[tuple[Overpass, Overpass]]:
    """(MODIS overpass, nearest VIIRS overpass) pairs at most `max_gap_s` apart. A VIIRS pass may serve one MODIS pass."""
    passes = group_overpasses(det)
    mod = [p for p in passes if p.family == "MODIS"]
    vii = [p for p in passes if p.family == "VIIRS"]
    if not mod or not vii:
        return []
    vt = np.array([p.time_s for p in vii])
    used: set[int] = set()
    pairs: list[tuple[Overpass, Overpass]] = []
    for m in mod:
        order = np.argsort(np.abs(vt - m.time_s))
        for j in order:
            if abs(vt[j] - m.time_s) > max_gap_s:
                break
            if int(j) not in used:
                used.add(int(j))
                pairs.append((m, vii[int(j)]))
                break
    return pairs


def fit_overlap_ratio(det: Detections, trained_on: str, max_gap_s: float = PAIR_MAX_GAP_S) -> OverlapRatioFit:
    """Fit the single ratio on the rows given. Raises ValueError when they hold no co-observed pair."""
    pairs = overlap_pairs(det, max_gap_s)
    if not pairs:
        raise ValueError("no co-observed MODIS and VIIRS overpass pair in the training rows")
    v = np.array([float(det.frp_mw[b.index].sum()) for _, b in pairs])
    m = np.array([float(det.frp_mw[a.index].sum()) for a, _ in pairs])
    ok = m > 0
    per_pair = v[ok] / m[ok]
    return OverlapRatioFit(
        ratio=float(v.sum() / m.sum()),
        ratio_p05=float(np.percentile(per_pair, 5)),
        ratio_p50=float(np.percentile(per_pair, 50)),
        ratio_p95=float(np.percentile(per_pair, 95)),
        n_pairs=len(pairs),
        sum_viirs_mw=float(v.sum()),
        sum_modis_mw=float(m.sum()),
        trained_on=trained_on,
    )


class OverlapRatio:
    """Baseline 2. Painted MODIS cells; counts and FRP each multiplied by one fitted ratio.

    Pixel counts use the calendar's ratio when one is given (`count_ratio`, an object with `ratio`, `p10`, `p90`
    and `level`: Suomi NPP rows over Terra plus Aqua rows): the expected number of VIIRS pixels at an overpass is
    that ratio times the pixels of the nearest Terra overpass plus the pixels of the nearest Aqua overpass, which
    is the calendar's own formula applied to one half day. FRP uses the FRP ratio fitted on overpass pairs.
    """

    name = "overlap_ratio"
    level = 0.90

    def __init__(self, visible: Detections, grid: EvalGrid, fit: OverlapRatioFit, count_ratio: Any | None = None) -> None:
        self._painted = PaintedModis(visible, grid)
        self.fit = fit
        self.count_ratio = count_ratio
        self.grid = grid
        counts = "" if count_ratio is None else (
            f"pixel count = calendar overlap ratio {count_ratio.ratio:.3f} times (nearest Terra + nearest Aqua pixels); "
        )
        self.label = (
            f"painted MODIS cells; {counts}FRP times one overlap ratio {fit.ratio:.3f} "
            f"(from {fit.n_pairs} pairs: {fit.trained_on}); FRP interval from the 5th to 95th percentile of pair ratios"
        )

    def _pixels(self, target: Target) -> dict[str, float | None]:
        if self.count_ratio is None:
            return {}
        n = self._painted.platform_pixels(target.time_s, "MODIS_TERRA") + self._painted.platform_pixels(target.time_s, "MODIS_AQUA")
        c = self.count_ratio
        return {"pixels": c.ratio * n, "pixels_lo": c.p10 * n, "pixels_hi": c.p90 * n, "pixels_level": c.level}

    def predict(self, target: Target) -> Prediction:
        p = self._painted.painted_for(target.time_s)
        if p is None:
            z = np.zeros(self.grid.shape)
            return Prediction(p_detect=z, frp_mw=z.copy(), frp_total_mw=0.0, frp_total_lo=0.0, frp_total_hi=0.0,
                              level=self.level, **self._pixels(target))
        total = self.fit.ratio * p.frp_total_mw
        return Prediction(
            p_detect=p.mask.astype(np.float64),
            frp_mw=p.frp_mw * self.fit.ratio,
            frp_total_mw=total,
            frp_total_lo=self.fit.ratio_p05 * p.frp_total_mw,
            frp_total_hi=self.fit.ratio_p95 * p.frp_total_mw,
            level=self.level,
            **self._pixels(target),
        )


def painted_modis_factory(visible: Detections, grid: EvalGrid) -> Method:
    return PaintedModis(visible, grid)


def overlap_ratio_factory(fit: OverlapRatioFit, count_ratio: Any | None = None):
    def factory(visible: Detections, grid: EvalGrid) -> Method:
        return OverlapRatio(visible, grid, fit, count_ratio)

    return factory
