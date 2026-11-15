"""The tree player of the next-look environment: boosted trees choose the tile to look at, from the observation alone.

Where. At each look the evenly spread budget is spent on (`agents.spend_now`, the looks `least_sure` takes) the
player describes every tile by numbers read from the observation, scores each tile with boosted trees
(`backend.model.challenger.gbdt.HistGBDT`), and looks at the tile with the largest score; ties go to the tile where
the model is least sure, then to the lower tile index. It does not choose when to look.

What it reads. The 15 tile features of the learned player (`policy.tile_features`); four more per tile from the same
observation (the model's expected flags of this look, sum of `p_detect`; how unsure those are, sum of
`p_detect (1 - p_detect)`, both scaled so the largest tile is 1; the tile's largest `p_burning`; the mean of
`p (1 - p)` over its cells, not rescaled); and three of the look, the same for every tile (the pass's pixel area,
day or night, the share of the round's looks still to come). A fitted player uses either the first 15 or all 22.

It is given no environment and reads no hidden row: `choose` takes the observation. The trees are fitted by
`backend/env/tree_fit.py`, which is where the true reward of each tile is read, on fitting episodes only.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.env.next_look import Observation
from backend.env.policy import FEATURE_NAMES, _per_tile, _unit, tile_features
from backend.model.challenger.gbdt import HistGBDT

EXTRA_TILE_FEATURES: tuple[tuple[str, str], ...] = (
    ("expected_flags", "sum of p_detect over the tile's cells: what the model expects this look to flag there"),
    ("unsure_flags", "sum of p_detect (1 - p_detect): how unsure the model is of what this look flags there"),
    ("peak", "the largest p_burning of the tile's cells (not rescaled)"),
    ("unsure_mean", "the mean of p (1 - p) over the tile's cells (not rescaled)"),
)
LOOK_INPUTS: tuple[tuple[str, str], ...] = (
    ("pixel_area_km2", "the pass's pixel area, along scan times along track, the same for every tile"),
    ("day", "1 on a day pass, else 0"),
    ("looks_to_come", "the share of the round's looks still to come, this one included"),
)
INPUT_NAMES: tuple[str, ...] = FEATURE_NAMES + tuple(n for n, _ in EXTRA_TILE_FEATURES) + tuple(n for n, _ in LOOK_INPUTS)
# The two forms of the player: the learned player's inputs alone, or all of them.
FORMS: dict[str, tuple[int, ...]] = {
    "record_inputs": tuple(range(len(FEATURE_NAMES))),
    "all_inputs": tuple(range(len(INPUT_NAMES))),
}


def inputs(obs: Observation) -> NDArray[np.float64]:
    """(tiles, 22) for one observation. Reads the observation and nothing else."""
    n = obs.tiles_shape[0] * obs.tiles_shape[1]
    base = tile_features(obs)
    pd = obs.p_detect
    pb = obs.p_burning
    cells = np.bincount(obs.tile_of_cell.ravel().astype(np.intp, copy=False), minlength=n).astype(np.float64)
    peak = np.zeros(n)
    np.maximum.at(peak, obs.tile_of_cell.ravel().astype(np.intp, copy=False), pb.ravel())
    extra = np.column_stack([
        _unit(_per_tile(obs, pd)),
        _unit(_per_tile(obs, pd * (1.0 - pd))),
        peak,
        _per_tile(obs, pb * (1.0 - pb)) / np.maximum(cells, 1.0),
    ])
    total = max(int(obs.look_times_s.size), 1)
    look = np.array([float(obs.pixel_km[0]) * float(obs.pixel_km[1]), 1.0 if obs.is_day else 0.0,
                     float(obs.looks_left) / float(total)])
    return np.column_stack([base, extra, np.tile(look, (n, 1))])


def pick(scores: NDArray[np.float64], unsure: NDArray[np.float64]) -> int:
    """The tile with the largest score; ties to the larger `unsure`, then to the lower tile index."""
    order = np.lexsort((np.arange(scores.size), -np.asarray(unsure, dtype=np.float64), -np.asarray(scores, dtype=np.float64)))
    return int(order[0])


class TreePlayer:
    """Boosted trees over the observation's numbers; one look in each of the evenly spread looks."""

    name = "tree"
    reads_hidden_rows = False

    def __init__(self, model: dict[str, Any], columns: tuple[int, ...] | list[int]) -> None:
        self.model = HistGBDT.from_dict(model)
        self.columns = tuple(int(c) for c in columns)

    def scores(self, obs: Observation, env: Any = None) -> NDArray[np.float64]:
        x = inputs(obs)
        return self.model.predict_raw(x[:, list(self.columns)])

    def choose(self, obs: Observation, env: Any = None) -> int:
        x = inputs(obs)
        return pick(self.model.predict_raw(x[:, list(self.columns)]), x[:, 0])
