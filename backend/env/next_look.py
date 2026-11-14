"""NextLookEnv: reset() and step(action) over one real run, in plain Python with numpy."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.env import KNOWN_LIMITS
from backend.eval import metrics as M
from backend.eval.grid import EvalGrid, Painted, paint
from backend.eval.overpass import Overpass, group_overpasses
from backend.eval.rows import Detections
from backend.model.occupancy import (
    OccupancyParams,
    OccupancyReconstruction,
    PassPixels,
    build_pass_pixels,
    expected_count_cells,
)
from backend.model.platforms import PLATFORMS

NO_LOOK: int = -1
SCORES: tuple[str, ...] = ("csi", "csi_one_cell", "brier_skill")


@dataclass(frozen=True)
class Observation:
    """Everything the agent may know, and nothing more."""

    decision: int                           # index of the VIIRS overpass about to be decided
    time_s: float                           # its time, UTC seconds
    sensor: str                             # its platform
    is_day: bool
    budget_left: int
    looks_left: int                         # VIIRS overpasses still to come, this one included
    tiles_shape: tuple[int, int]            # (rows, columns) of the tile split; tile t is row t // columns, column t % columns
    tile_of_cell: NDArray[np.int64]         # (ny, nx) tile index of every 375 m cell
    tile_covered: NDArray[np.bool_]         # (tiles,) tiles this pass covered (assumed from orbit geometry: all)
    modis: NDArray[np.float64]              # (n, 7) MODIS detections so far: lon, lat, scan_km, track_km, frp_mw, time_s, platform code
    viirs_revealed: NDArray[np.float64]     # (m, 7) VIIRS detections revealed so far, same columns
    revealed_tiles: tuple[tuple[int, int], ...]   # (decision, tile) of every look taken so far
    p_burning: NDArray[np.float64]          # (ny, nx) the model's current probability that each cell burns
    frp_mw: NDArray[np.float64]             # (ny, nx) its expected FRP per cell
    sigma_mw: NDArray[np.float64]           # (ny, nx) its standard deviation
    terrain_m: NDArray[np.float64] | None   # (ny, nx) elevation, when the caller supplied it


def _rows(det: Detections) -> NDArray[np.float64]:
    if len(det) == 0:
        return np.empty((0, 7))
    return np.column_stack([det.lon, det.lat, det.scan_km, det.track_km, det.frp_mw, det.time_s, det.platform_code.astype(np.float64)])


class NextLookEnv:
    """One real run. `det` holds MODIS and VIIRS rows of the context box; VIIRS rows are hidden from the agent."""

    def __init__(
        self,
        det: Detections,
        box: tuple[float, float, float, float],
        window: tuple[float, float],
        tiles: tuple[int, int] = (4, 4),
        budget: int = 4,
        params: OccupancyParams | None = None,
        score: str = "csi",
        terrain_m: NDArray[np.float64] | None = None,
    ) -> None:
        if score not in SCORES:
            raise ValueError(f"score must be one of {SCORES}")
        if budget < 0 or tiles[0] < 1 or tiles[1] < 1:
            raise ValueError("budget must be 0 or more and the tile split at least 1 by 1")
        self.grid = EvalGrid.from_bbox(box)
        self.box = box
        self.window = window
        self.tiles = (int(tiles[0]), int(tiles[1]))
        self.n_tiles = self.tiles[0] * self.tiles[1]
        self.budget = int(budget)
        self.params = params or OccupancyParams()
        self.score_name = score
        self.terrain_m = terrain_m
        g = self.grid
        rr, cc = np.meshgrid(np.arange(g.ny), np.arange(g.nx), indexing="ij")
        self.tile_of_cell = (np.minimum(rr * self.tiles[0] // g.ny, self.tiles[0] - 1) * self.tiles[1]
                             + np.minimum(cc * self.tiles[1] // g.nx, self.tiles[1] - 1)).astype(np.int64)

        self._modis = det.select(det.is_modis)
        self._modis_passes: list[PassPixels] = build_pass_pixels(g, self._modis, group_overpasses(self._modis))
        viirs = det.select(det.is_viirs)
        self._viirs = viirs
        self._looks: list[Overpass] = [p for p in group_overpasses(viirs) if window[0] <= p.time_s < window[1]]
        inb = viirs.in_box(box)
        self._truth: list[Painted] = []
        self._look_pixels: list[PassPixels] = []       # every pixel of the look that lies in the box
        self._pixel_tile: list[NDArray[np.int64]] = []  # tile of each of those pixels (by pixel centre)
        self._look_rows: list[NDArray[np.int64]] = []   # their positions in the VIIRS rows
        for op in self._looks:
            own = op.index[inb[op.index]]
            sub = viirs.select(own)
            self._truth.append(paint(g, sub))
            pp = build_pass_pixels(g, viirs, [replace(op, index=own)])[0]
            self._look_pixels.append(pp)
            r, c = g.row_col(sub.lon, sub.lat)
            self._pixel_tile.append(self.tile_of_cell[np.clip(r, 0, g.ny - 1), np.clip(c, 0, g.nx - 1)])
            self._look_rows.append(own)
        self._k = 0
        self._budget_left = self.budget
        self._revealed: list[tuple[int, int]] = []
        self._score = 0.0
        self._started = False
        self.rng = np.random.default_rng(0)

    # ---- the model, given what has been revealed -----------------------------------------------------------------

    def _revealed_passes(self, revealed: list[tuple[int, int]], upto_s: float | None = None) -> list[PassPixels]:
        by_look: dict[int, list[int]] = {}
        for k, t in revealed:
            by_look.setdefault(k, []).append(t)
        out: list[PassPixels] = []
        for k, tiles in by_look.items():
            pp = self._look_pixels[k]
            if upto_s is not None and pp.time_s > upto_s:
                continue
            keep = np.flatnonzero(np.isin(self._pixel_tile[k], tiles))
            out.append(replace(
                pp,
                cells=tuple(pp.cells[i] for i in keep),
                frp_mw=tuple(pp.frp_mw[i] for i in keep),
                min_side_km=tuple(pp.min_side_km[i] for i in keep),
                track_km=tuple(pp.track_km[i] for i in keep),
                looked=np.isin(self.tile_of_cell, tiles),
            ))
        return out

    def _reconstruction(self, revealed: list[tuple[int, int]], upto_s: float | None = None) -> OccupancyReconstruction:
        modis = self._modis_passes if upto_s is None else [p for p in self._modis_passes if p.time_s <= upto_s]
        return OccupancyReconstruction(self.grid, None, self.params, passes=modis + self._revealed_passes(revealed, upto_s))

    def score_of(self, revealed: list[tuple[int, int]]) -> dict[str, float]:
        """The blind-test score of the reconstruction built from all MODIS passes and the looks given, against every
        VIIRS detection of the episode (revealed or not: the target never changes, so agents are comparable)."""
        recon = self._reconstruction(revealed)
        counts = M.Counts(0, 0, 0, 0)
        tol = M.Counts(0, 0, 0, 0)
        brier = 0.0
        base = 0.0
        for op, truth in zip(self._looks, self._truth):
            out = recon.predict_hidden(op.time_s, "VIIRS", op.is_day, float(op.scan_km * op.track_km), track_km=op.track_km)
            cells = expected_count_cells(out["p_detect"])
            counts = counts + M.contingency(cells, truth.mask)
            tol = tol + M.contingency_tolerant(cells, truth.mask, 1)
            brier += M.brier(out["p_detect"], truth.mask)
            base += float(truth.mask.mean())                 # Brier score of predicting no fire anywhere
        n = max(len(self._looks), 1)
        return {
            "csi": M.scores(counts)["csi"] or 0.0,
            "csi_one_cell": M.scores(tol)["csi"] or 0.0,
            "brier_skill": 1.0 - (brier / n) / max(base / n, 1e-12),
            "hit_rate": M.scores(counts)["hit_rate"] or 0.0,
            "false_alarm_ratio": M.scores(counts)["false_alarm_ratio"] or 0.0,
        }

    # ---- the interface -------------------------------------------------------------------------------------------

    @property
    def n_looks(self) -> int:
        return len(self._looks)

    def reset(self, seed: int | None = None) -> Observation:
        self.rng = np.random.default_rng(seed)
        self._k = 0
        self._budget_left = self.budget
        self._revealed = []
        self._detail = self.score_of([])
        self._score = self._detail[self.score_name]
        self.score_start = self._score
        self._started = True
        return self._observe()

    def _observe(self) -> Observation:
        k = min(self._k, self.n_looks - 1)
        op = self._looks[k]
        recon = self._reconstruction(self._revealed, upto_s=op.time_s)
        est = recon.estimate(op.time_s)
        from backend.model.real_run import _sigma_mw

        seen_modis = self._modis.select(self._modis.time_s <= op.time_s)
        rows = [self._look_rows[kk][np.isin(self._pixel_tile[kk], [t])] for kk, t in self._revealed]
        shown = self._viirs.select(np.concatenate(rows)) if rows else self._viirs.select(np.zeros(len(self._viirs), dtype=bool))
        return Observation(
            decision=self._k,
            time_s=op.time_s,
            sensor=op.platform,
            is_day=op.is_day,
            budget_left=self._budget_left,
            looks_left=self.n_looks - self._k,
            tiles_shape=self.tiles,
            tile_of_cell=self.tile_of_cell,
            tile_covered=np.ones(self.n_tiles, dtype=bool),
            modis=_rows(seen_modis),
            viirs_revealed=_rows(shown),
            revealed_tiles=tuple(self._revealed),
            p_burning=est.a,
            frp_mw=est.F,
            sigma_mw=_sigma_mw(est.a, est.F, est.rel_sd_log),
            terrain_m=self.terrain_m,
        )

    def _apply(self, action: int) -> tuple[list[tuple[int, int]], bool]:
        if not isinstance(action, (int, np.integer)) or not (NO_LOOK <= int(action) < self.n_tiles):
            raise ValueError(f"action must be {NO_LOOK} (no look) or a tile index below {self.n_tiles}")
        if int(action) == NO_LOOK or self._budget_left <= 0:
            return list(self._revealed), False
        return self._revealed + [(self._k, int(action))], True

    def peek(self, action: int) -> float:
        """The reward `action` would give now, without taking it (used only by the oracle)."""
        revealed, spent = self._apply(action)
        return (self.score_of(revealed)[self.score_name] - self._score) if spent else 0.0

    def step(self, action: int) -> tuple[Observation | None, float, bool, dict[str, Any]]:
        if not self._started:
            raise RuntimeError("call reset() first")
        if self._k >= self.n_looks:
            raise RuntimeError("the episode is over; call reset()")
        revealed, spent = self._apply(action)
        wasted = int(action) != NO_LOOK and not spent
        reward = 0.0
        if spent:
            self._revealed = revealed
            self._budget_left -= 1
            self._detail = self.score_of(revealed)
            reward = self._detail[self.score_name] - self._score
            self._score = self._detail[self.score_name]
        look = self._looks[self._k]
        info = {
            "decision": self._k,
            "sensor": look.platform,
            "spent": spent,
            "no_budget_left": wasted,
            "score": self._score,
            "score_name": self.score_name,
            "score_detail": dict(self._detail),
            "revealed_pixels": int(np.isin(self._pixel_tile[self._k], [int(action)]).sum()) if spent else 0,
            "known_limits": KNOWN_LIMITS,
        }
        self._k += 1
        done = self._k >= self.n_looks
        return (None if done else self._observe()), float(reward), done, info

    # ---- for the oracle and for reports only ---------------------------------------------------------------------

    def hidden_pixels_per_tile(self) -> NDArray[np.int64]:
        """Hidden VIIRS pixels of the current look in each tile. Not part of the observation."""
        return np.bincount(self._pixel_tile[min(self._k, self.n_looks - 1)], minlength=self.n_tiles)

    def describe(self) -> dict[str, Any]:
        return {
            "box": [round(v, 6) for v in self.box],
            "grid": {"nx": self.grid.nx, "ny": self.grid.ny, "cell_km": self.grid.cell_km},
            "tiles": list(self.tiles),
            "budget": self.budget,
            "viirs_looks": self.n_looks,
            "viirs_platforms": sorted({p.platform for p in self._looks}),
            "modis_overpasses": len(self._modis_passes),
            "score": self.score_name,
            "reward": "gain in the blind-test score of the reconstruction against every VIIRS detection of the episode",
            "known_limits": KNOWN_LIMITS,
            "platform_codes": {str(i): n for i, n in enumerate(PLATFORMS)},
        }
