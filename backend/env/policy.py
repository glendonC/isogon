"""A small learned player for the next-look environment: one linear score per tile, and one linear score per look.

Where. At a look the policy describes every tile by a short list of numbers read from the observation (nothing
hidden), multiplies them by fixed weights, and looks at the tile with the highest score. The weights are fitted by
ridge regression to the true reward of looking at each tile, measured on training episodes
(`backend/env/learn.py`).

When. The policy describes the look itself by a second short list read from the observation (how unsure the model
is at its most unsure tile, how fresh and how strong the MODIS signal is, day or night, the pass's pixel size, how
close the looks around it are) and multiplies it by fixed weights. The episode's looks are cut into as many equal
stretches as the budget has looks, and the policy takes one look in each: as soon as the look score is in the top
share of what the stretch has shown so far, and at the stretch's last look if not before
(`backend.env.agents.StretchClock`). Looks taken close together repeat each other, which is why the looks stay
spread; a policy that always waited for the last look of a stretch would be on the evenly spread looks of every
reference player. The when part is used only if it gained on training fires it was not fitted on; the tracked file
says whether it is.

The whole policy is two tables of weights in `backend/env/fitted/next_look.json`. Every part of a score can be
shown: `explain` gives each feature's value times its weight, per tile and for the look.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.env.agents import StretchClock
from backend.env.next_look import NextLookEnv, Observation

FEATURES: tuple[tuple[str, str], ...] = (
    ("unsure", "sum of p (1 - p) over the tile's cells: how unsure the model is there"),
    ("burning", "sum of p: cells the model expects to burn"),
    ("power", "sum of the model's expected FRP"),
    ("spread", "sum of the model's standard deviation"),
    ("modis_recent_frp", "MODIS FRP in the tile, halved for every six hours of age"),
    ("modis_recent_pixels", "MODIS pixels in the tile, halved for every six hours of age"),
    ("modis_all_pixels", "every MODIS pixel in the tile so far"),
    ("seen_before", "earlier looks at this tile, each halved for every twelve hours of age (not rescaled)"),
    ("unsure_neighbours", "mean of `unsure` over the tiles around it"),
    ("relief", "standard deviation of elevation in the tile (0 when no terrain is given)"),
    ("unsure_by_day", "`unsure` on a day overpass, else 0"),
    ("unsure_by_night", "`unsure` on a night overpass, else 0"),
    ("modis_recent_frp_by_day", "`modis_recent_frp` on a day overpass, else 0"),
    ("unsure_when_modis_is_old", "`unsure` times the hours since the last MODIS pass, capped at twelve, over twelve"),
    ("burning_early", "`burning` times the share of the episode's looks still to come"),
)
FEATURE_NAMES: tuple[str, ...] = tuple(n for n, _ in FEATURES)


def _per_tile(obs: Observation, field: NDArray[np.float64]) -> NDArray[np.float64]:
    n = obs.tiles_shape[0] * obs.tiles_shape[1]
    return np.bincount(obs.tile_of_cell.ravel().astype(np.intp, copy=False), weights=field.ravel(), minlength=n)


def _unit(v: NDArray[np.float64]) -> NDArray[np.float64]:
    """A feature rescaled so its largest tile is 1 (all zeros stay zeros): scores do not depend on the fire's size."""
    m = float(np.max(np.abs(v))) if v.size else 0.0
    return v / m if m > 0 else np.zeros_like(v, dtype=np.float64)


def tile_features(obs: Observation, env: NextLookEnv | None = None) -> NDArray[np.float64]:
    """(tiles, features) for one observation. Reads the observation and nothing else; `env` is not used."""
    rows, cols = obs.tiles_shape
    n = rows * cols
    unsure = _unit(_per_tile(obs, obs.p_burning * (1.0 - obs.p_burning)))
    burning = _unit(_per_tile(obs, obs.p_burning))
    power = _unit(_per_tile(obs, obs.frp_mw))
    spread = _unit(_per_tile(obs, obs.sigma_mw))
    recent_frp = np.zeros(n)
    recent_n = np.zeros(n)
    all_n = np.zeros(n)
    hours_since_modis = 12.0
    if obs.modis.shape[0] > 0:
        ok = obs.modis_tile >= 0
        if ok.any():
            tile = obs.modis_tile[ok]
            age_h = (obs.time_s - obs.modis[ok, 5]) / 3600.0
            w = 0.5 ** (age_h / 6.0)
            recent_frp = np.bincount(tile.astype(np.intp, copy=False), weights=obs.modis[ok, 4] * w, minlength=n)
            recent_n = np.bincount(tile.astype(np.intp, copy=False), weights=w, minlength=n)
            all_n = np.bincount(tile.astype(np.intp, copy=False), minlength=n).astype(np.float64)
        hours_since_modis = float(min(12.0, (obs.time_s - float(obs.modis[:, 5].max())) / 3600.0))
    seen = np.zeros(n)
    for k, tile in obs.revealed_tiles:
        age_h = (obs.time_s - float(obs.look_times_s[k])) / 3600.0
        seen[tile] += 0.5 ** (max(age_h, 0.0) / 12.0)
    grid_u = unsure.reshape(rows, cols)
    padded = np.pad(grid_u, 1)
    neigh = sum(padded[1 + dr : 1 + dr + rows, 1 + dc : 1 + dc + cols] for dr in (-1, 0, 1) for dc in (-1, 0, 1) if (dr, dc) != (0, 0))
    count = sum(np.pad(np.ones((rows, cols)), 1)[1 + dr : 1 + dr + rows, 1 + dc : 1 + dc + cols] for dr in (-1, 0, 1) for dc in (-1, 0, 1) if (dr, dc) != (0, 0))
    unsure_neigh = (neigh / np.maximum(count, 1.0)).ravel()
    relief = np.zeros(n)
    if obs.terrain_m is not None:
        mean = _per_tile(obs, obs.terrain_m) / np.maximum(np.bincount(obs.tile_of_cell.ravel().astype(np.intp, copy=False), minlength=n), 1)
        var = _per_tile(obs, (obs.terrain_m - mean[obs.tile_of_cell]) ** 2) / np.maximum(np.bincount(obs.tile_of_cell.ravel().astype(np.intp, copy=False), minlength=n), 1)
        relief = _unit(np.sqrt(var))
    day = 1.0 if obs.is_day else 0.0
    to_come = obs.looks_left / max(obs.decision + obs.looks_left, 1)
    recent_frp_u = _unit(recent_frp)
    return np.column_stack([
        unsure, burning, power, spread, recent_frp_u, _unit(recent_n), _unit(all_n), seen, unsure_neigh, relief,
        unsure * day, unsure * (1.0 - day), recent_frp_u * day, unsure * (hours_since_modis / 12.0), burning * to_come,
    ])


class LinearPolicyAgent:
    """Looks at the tile with the highest weighted sum of its features."""

    name = "learned"

    def __init__(self, weights: list[float] | NDArray[np.float64], feature_names: tuple[str, ...] | list[str] = FEATURE_NAMES) -> None:
        if tuple(feature_names) != FEATURE_NAMES:
            raise ValueError("the weights were fitted for a different feature list")
        self.weights = np.asarray(weights, dtype=np.float64)
        if self.weights.shape != (len(FEATURE_NAMES),):
            raise ValueError("one weight per feature is needed")

    def scores(self, obs: Observation, env: NextLookEnv | None = None) -> NDArray[np.float64]:
        return tile_features(obs) @ self.weights

    def choose(self, obs: Observation, env: NextLookEnv | None = None) -> int:
        return int(np.argmax(self.scores(obs)))

    def explain(self, obs: Observation) -> dict[str, Any]:
        """What made each tile's score: per tile, each feature's value times its weight. A tile's parts add up to
        its score."""
        parts = tile_features(obs) * self.weights
        return {"names": list(FEATURE_NAMES), "weights": [round(float(w), 6) for w in self.weights],
                "per_tile": [[round(float(v), 6) for v in row] for row in parts]}


LOOK_FEATURES: tuple[tuple[str, str], ...] = (
    ("largest_unsure", "log of one plus the largest tile sum of p (1 - p): how unsure the model is where it is least sure"),
    ("total_unsure", "log of one plus the sum of p (1 - p) over the box"),
    ("largest_burning", "log of one plus the largest tile sum of p"),
    ("total_burning", "log of one plus the sum of p over the box"),
    ("largest_recent_modis_power", "log of one plus the largest tile sum of MODIS power, halved for every six hours of age"),
    ("largest_recent_modis_pixels", "log of one plus the largest tile count of MODIS pixels, halved for every six hours of age"),
    ("modis_pixels_last_pass", "log of one plus the MODIS pixels in the box within half an hour of the newest one"),
    ("day", "1 on a day pass, 0 at night"),
    ("pixel_area_km2", "the look's pixel area, scan times track, from the schedule"),
    ("hours_since_modis", "hours since the newest MODIS detection, capped at twelve, over twelve"),
    ("hours_from_previous_look", "hours since the previous scheduled look, capped at twelve, over twelve"),
    ("hours_to_next_look", "hours to the next scheduled look, capped at twelve, over twelve"),
    ("episode_share_done", "the look's index over the number of looks less one"),
)
LOOK_FEATURE_NAMES: tuple[str, ...] = tuple(n for n, _ in LOOK_FEATURES)


def look_features(obs: Observation) -> NDArray[np.float64]:
    """(features,) for the look an observation asks about. Reads the observation and nothing else."""
    unsure = _per_tile(obs, obs.p_burning * (1.0 - obs.p_burning))
    burning = _per_tile(obs, obs.p_burning)
    n = unsure.size
    recent_frp, recent_n = np.zeros(n), np.zeros(n)
    last_pass, since = 0.0, 12.0
    if obs.modis.shape[0] > 0:
        newest = float(obs.modis[:, 5].max())
        since = float(min(12.0, (obs.time_s - newest) / 3600.0))
        ok = obs.modis_tile >= 0
        if ok.any():
            w = 0.5 ** ((obs.time_s - obs.modis[ok, 5]) / 3600.0 / 6.0)
            recent_frp = np.bincount(obs.modis_tile[ok].astype(np.intp, copy=False), weights=obs.modis[ok, 4] * w, minlength=n)
            recent_n = np.bincount(obs.modis_tile[ok].astype(np.intp, copy=False), weights=w, minlength=n)
            last_pass = float((obs.modis[ok, 5] >= newest - 1800.0).sum())
    k, t = int(obs.decision), obs.look_times_s
    before = float(min(12.0, (t[k] - t[k - 1]) / 3600.0)) if k > 0 else 12.0
    after = float(min(12.0, (t[k + 1] - t[k]) / 3600.0)) if k + 1 < t.size else 12.0
    return np.array([
        np.log1p(unsure.max()), np.log1p(unsure.sum()), np.log1p(burning.max()), np.log1p(burning.sum()),
        np.log1p(recent_frp.max()), np.log1p(recent_n.max()), np.log1p(last_pass),
        1.0 if obs.is_day else 0.0, float(obs.pixel_km[0] * obs.pixel_km[1]),
        since / 12.0, before / 12.0, after / 12.0, k / max(t.size - 1, 1),
    ], dtype=np.float64)


class LearnedPlayer(LinearPolicyAgent):
    """The tile by the tile score; the moment by the look score, one look per stretch of the episode. With no look
    weights it is the tile policy alone and spends on the evenly spread looks like every reference player."""

    def __init__(
        self, weights: list[float] | NDArray[np.float64], look_weights: list[float] | NDArray[np.float64] | None = None,
        look_scales: list[float] | NDArray[np.float64] | None = None,
        feature_names: tuple[str, ...] | list[str] = FEATURE_NAMES,
        look_feature_names: tuple[str, ...] | list[str] = LOOK_FEATURE_NAMES,
    ) -> None:
        super().__init__(weights, feature_names)
        self.look_weights: NDArray[np.float64] | None = None
        self.look_scales = np.ones(len(LOOK_FEATURE_NAMES))
        self._clock = StretchClock()
        self.last_when: dict[str, Any] | None = None
        if look_weights is not None:
            if tuple(look_feature_names) != LOOK_FEATURE_NAMES:
                raise ValueError("the look weights were fitted for a different feature list")
            self.look_weights = np.asarray(look_weights, dtype=np.float64)
            if look_scales is not None:
                self.look_scales = np.asarray(look_scales, dtype=np.float64)
            if self.look_weights.shape != (len(LOOK_FEATURE_NAMES),) or self.look_scales.shape != self.look_weights.shape:
                raise ValueError("one weight and one scale per look feature are needed")
            self.looks_now = self._looks_now      # only a player with look weights says when it looks

    def look_parts(self, obs: Observation) -> NDArray[np.float64]:
        """Each look feature's value over its scale, times its weight. The parts add up to the look score."""
        assert self.look_weights is not None
        return look_features(obs) / self.look_scales * self.look_weights

    def look_score(self, obs: Observation) -> float:
        return float(self.look_parts(obs).sum())

    def _looks_now(self, obs: Observation) -> bool:
        parts = self.look_parts(obs)
        self.last_when = {**self._clock.decide(obs, float(parts.sum())), "names": list(LOOK_FEATURE_NAMES),
                          "parts": [round(float(v), 6) for v in parts]}
        return bool(self.last_when["looks"])


def fit_ridge(features: NDArray[np.float64], target: NDArray[np.float64], strength: float) -> NDArray[np.float64]:
    """Weights that minimise squared error plus `strength` times their squared size."""
    x = np.asarray(features, dtype=np.float64)
    return np.linalg.solve(x.T @ x + strength * np.eye(x.shape[1]), x.T @ np.asarray(target, dtype=np.float64))


FITTED_FILE: Path = Path(__file__).resolve().parent / "fitted" / "next_look.json"


def load_fitted() -> dict[str, Any] | None:
    import json

    return json.loads(FITTED_FILE.read_text(encoding="utf-8")) if FITTED_FILE.is_file() else None


def policy_from(block: dict[str, Any], tiles_only: bool = False) -> LinearPolicyAgent:
    """The player a `policy` block of the tracked file describes. Its when part is used only when the block says
    it was adopted, and never with `tiles_only`."""
    when = block.get("when") or {}
    if when.get("adopted") and not tiles_only:
        return LearnedPlayer(block["weights"], when["weights"], when["scales"], block["feature_names"], when["feature_names"])
    return LearnedPlayer(block["weights"], feature_names=block["feature_names"])


def load_policy() -> LinearPolicyAgent | None:
    """The tracked learned policy, or None before one has been fitted."""
    doc = load_fitted()
    if doc is None or "policy" not in doc:
        return None
    return policy_from(doc["policy"])


def env_settings() -> dict[str, Any]:
    """Keyword arguments for `NextLookEnv` that the tracked file's validation decided (empty before it exists)."""
    doc = load_fitted()
    if doc is None:
        return {}
    teach = doc.get("learn_from_looks", {})
    if teach.get("adopted"):
        return {"learn_from_looks": True, "prior_cells": float(teach["prior_cells"])}
    return {}
