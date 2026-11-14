"""Reconstruction from real detections: a forward and backward occupancy filter on the 375 m grid.

State of one 375 m cell at one time:
  a   probability the cell is actively burning
  F   expected fire radiative power of the cell, MW (so F / a is the power of the cell when it burns)
  b   probability the cell has already burned through

Between overpasses (dt hours) a share s = 1 - exp(-dt / tau_res) of the burning cells goes out and joins b, and the
same expected number of cells lights up ahead of the front: the burning field blurred over the distance the front
can travel, weighted to cells that have not burned. FRP follows the cells and is scaled by a diurnal ratio.

At an assimilated overpass each flagged pixel is a statement about its footprint: total FRP y somewhere inside
scan by track. The filter shares y and an expected number of burning cells among the footprint's cells in
proportion to prior burning probability, with burned cells weighted down. That is where a reconstruction can be
sharper than painting the pixel flat. A cell outside every flagged pixel of a pass that looked is a censored
observation: its burning probability is multiplied down by the published probability that the instrument would
have flagged it (Sofiev and Kouznetsov, GMD 19, 10123, 2026, Eqs. 5 to 7), times a clear-sky share that is a stated
prior, never a measurement. No cloud mask exists in FIRMS rows.

The same filter is run backward in time (burned then means "burns later") and the two are combined at any time by
the age of their newest information. Hidden overpasses are query times only.

Every number in `OccupancyParams` is a prior unless `fitted_on` says otherwise (unit M2 fits them on real overlap).
"""

from __future__ import annotations

from dataclasses import dataclass, replace
import math
from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.eval.grid import EvalGrid, footprint_cells
from backend.eval.overpass import Overpass, group_overpasses
from backend.eval.rows import Detections
from backend.model.platforms import PLATFORMS, family, scan_axis_deg
from backend.model.sensor_physics import detection_probability

# Per pixel relative FRP uncertainty used for the stated interval: the single-pixel MODIS figure the engine's
# docstring cites (Freeborn et al. 2014, about 27 percent).
PIXEL_FRP_REL_SD: float = 0.27
# Burning probabilities below this are treated as zero.
MIN_BURNING_PROBABILITY: float = 1e-3


@dataclass(frozen=True)
class OccupancyParams:
    tau_res_h: float = 12.0            # e-folding time a 375 m cell keeps burning
    spread_km_per_h: float = 0.08      # distance the front can advance per hour
    line_width_km: float = 0.375       # a coarse pixel holds a fire line this wide (sets how many of its cells burn)
    new_cell_weight: float = 0.05      # prior weight of a cell with no burning probability inside a flagged pixel
    burned_discount: float = 0.9       # a cell that already burned keeps (1 - this) of its weight
    clear_sky: float = 0.8             # prior share of looks that are clear; FIRMS rows carry no cloud mask
    age_tau_h: float = 3.0             # forward and backward estimates are weighted by exp(-age / this)
    diurnal_amplitude: float = 0.38    # the engine's diurnal curve (hand set for the simulator, carried over)
    process_log_sd_per_sqrt_h: float = 0.15   # growth of the FRP total's log uncertainty with information age
    frp_scale: float = 1.0             # multiplies predicted hidden-instrument FRP (1.0 means no cross calibration)
    count_scale_day: float = 1.0       # multiplies the expected number of burning cells in a flagged pixel, day
    count_scale_night: float = 1.0     # the same at night
    fitted_on: str = "nothing: every value is a prior"

    def as_dict(self) -> dict[str, Any]:
        return {k: getattr(self, k) for k in self.__dataclass_fields__}


def diurnal_factor(lst_hr: float, amplitude: float = 0.38) -> float:
    """The engine's diurnal multiplier (`world_model._diurnal_multiplier`): peak near 14:45 local solar time."""
    phase = 2.0 * math.pi * (lst_hr - 14.75) / 24.0
    return 0.84 + amplitude * math.cos(phase) + 0.06 * math.cos(2.0 * phase)


def _blur(field2d: NDArray[np.float64], sigma_cells: float) -> NDArray[np.float64]:
    """Separable Gaussian blur with zero padding (mass leaves through the box edge)."""
    if sigma_cells <= 0.05:
        return field2d.copy()
    radius = int(min(60, max(1, math.ceil(3.0 * sigma_cells))))
    xs = np.arange(-radius, radius + 1, dtype=np.float64)
    k = np.exp(-0.5 * (xs / sigma_cells) ** 2)
    k /= k.sum()
    def conv(v: NDArray[np.float64]) -> NDArray[np.float64]:
        # zero pad by the kernel radius so the result has the input's length whatever the kernel's
        return np.convolve(np.pad(v, radius), k, mode="valid")

    out = np.apply_along_axis(conv, 1, field2d)
    return np.apply_along_axis(conv, 0, out)


@dataclass(frozen=True)
class GridState:
    a: NDArray[np.float64]
    F: NDArray[np.float64]
    b: NDArray[np.float64]

    @classmethod
    def empty(cls, shape: tuple[int, int]) -> GridState:
        return cls(np.zeros(shape), np.zeros(shape), np.zeros(shape))


@dataclass(frozen=True)
class PassPixels:
    """One assimilated overpass, with the cells each of its flagged pixels covers in the grid."""

    time_s: float
    platform: str
    is_day: bool
    lst_hr: float
    pixel_area_km2: float                              # typical pixel area of the pass (median scan times track)
    cells: tuple[tuple[NDArray[np.int64], NDArray[np.int64]], ...]   # per pixel inside the grid
    frp_mw: tuple[float, ...]                          # per pixel inside the grid
    min_side_km: tuple[float, ...]                     # min(scan, track) per pixel
    n_context: int                                     # flagged pixels of the pass anywhere in the rows given

    @property
    def n_in_grid(self) -> int:
        return len(self.cells)

    @property
    def frp_total_mw(self) -> float:
        return float(sum(self.frp_mw))


def build_pass_pixels(grid: EvalGrid, det: Detections, passes: list[Overpass]) -> list[PassPixels]:
    """Footprint cells for every pass. Pixels centred outside the grid are left out (they still prove the look)."""
    out: list[PassPixels] = []
    for op in passes:
        cells: list[tuple[NDArray[np.int64], NDArray[np.int64]]] = []
        frp: list[float] = []
        side: list[float] = []
        for i in op.index:
            axis = scan_axis_deg(PLATFORMS[int(det.platform_code[i])], bool(det.is_day[i]), float(det.lat[i]))
            rows, cols = footprint_cells(
                grid, float(det.lon[i]), float(det.lat[i]), float(det.scan_km[i]), float(det.track_km[i]), axis
            )
            if rows.size == 0:
                continue
            cells.append((rows, cols))
            frp.append(float(det.frp_mw[i]))
            side.append(float(min(det.scan_km[i], det.track_km[i])))
        out.append(
            PassPixels(
                time_s=op.time_s, platform=op.platform, is_day=op.is_day, lst_hr=op.lst_hr,
                pixel_area_km2=float(op.scan_km * op.track_km), cells=tuple(cells), frp_mw=tuple(frp),
                min_side_km=tuple(side), n_context=op.n,
            )
        )
    return out


def predict(state: GridState, dt_h: float, cell_km: float, p: OccupancyParams, diurnal_ratio: float) -> GridState:
    """State dt_h hours on (or back, for the backward filter), before any observation."""
    if dt_h <= 0.0:
        return state
    a, F, b = state.a, state.F, state.b
    s = 1.0 - math.exp(-dt_h / p.tau_res_h)
    stay = (1.0 - s) * a
    moved = s * float(a.sum())
    new = np.zeros_like(a)
    if moved > 0.0:
        cand = _blur(a, p.spread_km_per_h * dt_h / cell_km) * np.clip(1.0 - b - a, 0.0, 1.0)
        tot = float(cand.sum())
        if tot > 0.0:
            new = moved * cand / tot
    a_new = np.clip(stay + new, 0.0, 1.0)
    per_cell = float(F.sum()) / max(float(a.sum()), 1e-9)       # mean power of a burning cell in the scene
    F_new = ((1.0 - s) * F + new * per_cell) * diurnal_ratio
    # A burning probability under one in a thousand is written as none, so the estimate never paints a faint
    # film of fire across the whole box.
    faint = a_new < MIN_BURNING_PROBABILITY
    a_new = np.where(faint, 0.0, a_new)
    F_new = np.where(faint, 0.0, F_new)
    b_new = np.clip(b + s * a, 0.0, 1.0)
    return GridState(a_new, F_new, b_new)


def update(state: GridState, obs: PassPixels, p: OccupancyParams) -> GridState:
    """Assimilate one overpass: share each flagged pixel among its cells, and censor the cells it did not flag."""
    a, F, b = state.a, state.F, state.b
    fam = family(obs.platform)
    covered = np.zeros(a.shape, dtype=bool)
    not_a = np.ones(a.shape)            # running product of (1 - a from pixel j), a noisy OR over pixels
    F_obs = np.zeros(a.shape)
    count_scale = p.count_scale_day if obs.is_day else p.count_scale_night
    for (rows, cols), y, side in zip(obs.cells, obs.frp_mw, obs.min_side_km):
        n_cells = rows.size
        fill = min(1.0, p.line_width_km / max(side, 1e-6))
        n_burn = float(np.clip(fill * n_cells * count_scale, 1.0, n_cells))
        w = (a[rows, cols] + p.new_cell_weight) * (1.0 - p.burned_discount * b[rows, cols])
        tot = float(w.sum())
        share = w / tot if tot > 0.0 else np.full(n_cells, 1.0 / n_cells)
        a_j = np.minimum(1.0, n_burn * share)
        not_a[rows, cols] *= 1.0 - a_j
        np.add.at(F_obs, (rows, cols), y * share)
        covered[rows, cols] = True
    # cells no flagged pixel covers: the instrument looked (it flagged something in the wider box) and said nothing
    per_cell = np.where(a > 1e-6, F / np.maximum(a, 1e-6), 0.0)
    q = p.clear_sky * detection_probability(per_cell, obs.pixel_area_km2, fam, is_day=obs.is_day)
    a_miss = a * (1.0 - q) / np.maximum(1.0 - a * q, 1e-9)
    F_miss = np.where(a > 1e-9, F * a_miss / np.maximum(a, 1e-9), 0.0)
    a_new = np.where(covered, 1.0 - not_a, a_miss)
    F_new = np.where(covered, F_obs, F_miss)
    return GridState(np.clip(a_new, 0.0, 1.0), np.maximum(F_new, 0.0), b)


@dataclass(frozen=True)
class Estimate:
    """The combined estimate at one time."""

    a: NDArray[np.float64]              # probability of burning per cell
    F: NDArray[np.float64]              # expected FRP per cell, MW
    age_h: float                        # hours to the nearest assimilated overpass (inf when there is none)
    rel_sd_log: float                   # stated log standard deviation of the FRP total


class OccupancyReconstruction:
    """Forward and backward filter over the assimilated overpasses of `det`, queried at any time."""

    def __init__(self, grid: EvalGrid, det: Detections, params: OccupancyParams | None = None) -> None:
        self.grid = grid
        self.params = params or OccupancyParams()
        self.lon_mid = 0.5 * (grid.west + grid.east)
        passes = group_overpasses(det)
        self.passes: list[PassPixels] = build_pass_pixels(grid, det, passes)
        self.times = np.array([q.time_s for q in self.passes], dtype=np.float64)
        self._fwd: list[GridState] = []
        self._bwd: list[GridState] = []
        self._run()

    def _lst(self, time_s: float) -> float:
        return ((time_s % 86400.0) / 3600.0 + self.lon_mid / 15.0) % 24.0

    def _ratio(self, t_from: float, t_to: float) -> float:
        amp = self.params.diurnal_amplitude
        return float(np.clip(diurnal_factor(self._lst(t_to), amp) / max(diurnal_factor(self._lst(t_from), amp), 0.25), 0.3, 3.0))

    def _run(self) -> None:
        p, cell = self.params, self.grid.cell_km
        st = GridState.empty(self.grid.shape)
        prev_t: float | None = None
        for obs in self.passes:
            if prev_t is not None:
                st = predict(st, (obs.time_s - prev_t) / 3600.0, cell, p, self._ratio(prev_t, obs.time_s))
            st = update(st, obs, p)
            self._fwd.append(st)
            prev_t = obs.time_s
        st = GridState.empty(self.grid.shape)
        prev_t = None
        back: list[GridState] = []
        for obs in reversed(self.passes):
            if prev_t is not None:
                st = predict(st, (prev_t - obs.time_s) / 3600.0, cell, p, self._ratio(prev_t, obs.time_s))
            st = update(st, obs, p)
            back.append(st)
            prev_t = obs.time_s
        self._bwd = back[::-1]

    def estimate(self, time_s: float) -> Estimate:
        """Combined forward and backward estimate at `time_s` (UTC seconds)."""
        p, cell = self.params, self.grid.cell_km
        shape = self.grid.shape
        if self.times.size == 0:
            return Estimate(np.zeros(shape), np.zeros(shape), math.inf, math.inf)
        i_prev = int(np.searchsorted(self.times, time_s, side="right")) - 1     # last pass at or before
        i_next = int(np.searchsorted(self.times, time_s, side="left"))          # first pass at or after
        parts: list[tuple[float, GridState, float, PassPixels]] = []
        if i_prev >= 0:
            t0 = float(self.times[i_prev])
            age = (time_s - t0) / 3600.0
            parts.append((math.exp(-age / p.age_tau_h), predict(self._fwd[i_prev], age, cell, p, self._ratio(t0, time_s)), age, self.passes[i_prev]))
        if i_next < self.times.size:
            t1 = float(self.times[i_next])
            age = (t1 - time_s) / 3600.0
            parts.append((math.exp(-age / p.age_tau_h), predict(self._bwd[i_next], age, cell, p, self._ratio(t1, time_s)), age, self.passes[i_next]))
        wsum = sum(w for w, _, _, _ in parts)
        if wsum <= 0.0:
            w_each = [1.0 / len(parts)] * len(parts)
        else:
            w_each = [w / wsum for w, _, _, _ in parts]
        a = sum(w * st.a for w, (_, st, _, _) in zip(w_each, parts))
        F = sum(w * st.F for w, (_, st, _, _) in zip(w_each, parts))
        age_h = min(age for _, _, age, _ in parts)
        # stated uncertainty of the total: radiometric part from the pixels of the nearest pass, plus a process part
        # that grows with the age of the information
        rad2 = 0.0
        for w, (_, _, _, obs) in zip(w_each, parts):
            y = np.asarray(obs.frp_mw, dtype=np.float64)
            if y.size and y.sum() > 0:
                rad2 += w * (PIXEL_FRP_REL_SD ** 2) * float((y ** 2).sum()) / float(y.sum()) ** 2
            else:
                rad2 += w * PIXEL_FRP_REL_SD ** 2
        rel = math.sqrt(rad2 + (p.process_log_sd_per_sqrt_h ** 2) * age_h)
        return Estimate(np.asarray(a), np.asarray(F), age_h, rel)

    def predict_hidden(self, time_s: float, hidden_family: str, is_day: bool, pixel_area_km2: float) -> dict[str, Any]:
        """What the hidden instrument is expected to report at `time_s`.

        p_detect is burning probability times the published probability that a pixel of that instrument and area
        flags a cell of that power; expected FRP is the cell's FRP times the same detection fraction (Eq. 7) and
        `frp_scale`. The interval is lognormal around the total at the stated log standard deviation.
        """
        est = self.estimate(time_s)
        per_cell = np.where(est.a > 1e-6, est.F / np.maximum(est.a, 1e-6), 0.0)
        pi = detection_probability(per_cell, pixel_area_km2, hidden_family, is_day=is_day)
        p_detect = np.clip(est.a * pi, 0.0, 1.0)
        frp = est.F * pi * self.params.frp_scale
        total = float(frp.sum())
        z = 1.6448536269514722
        if math.isfinite(est.rel_sd_log):
            lo, hi = total * math.exp(-z * est.rel_sd_log), total * math.exp(z * est.rel_sd_log)
        else:
            lo, hi = 0.0, 0.0
        return {"p_detect": p_detect, "frp_mw": frp, "total_mw": total, "lo_mw": lo, "hi_mw": hi, "level": 0.90,
                "age_h": est.age_h, "estimate": est}


def expected_count_cells(p_detect: NDArray[np.float64]) -> NDArray[np.bool_]:
    """The model's own predicted cells: the N most probable cells, N being the expected number of flagged cells.

    A calibrated probability field is rarely above 0.5 anywhere (a coarse pixel says fire is somewhere inside it),
    so a fixed 0.5 cut would predict nothing. Choosing as many cells as the field expects to be flagged keeps the
    count honest and leaves the ranking to carry the skill.
    """
    n = int(round(float(p_detect.sum())))
    out = np.zeros(p_detect.shape, dtype=bool)
    if n <= 0:
        return out
    flat = p_detect.ravel()
    n = min(n, int(np.count_nonzero(flat > 0)))
    if n <= 0:
        return out
    order = np.argsort(-flat, kind="stable")[:n]
    out.ravel()[order] = True
    return out


def with_params(base: OccupancyParams, **changes: Any) -> OccupancyParams:
    return replace(base, **changes)
