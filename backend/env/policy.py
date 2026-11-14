"""A small learned policy for the next-look environment: one linear score per tile.

At a look the policy describes every tile by a short list of numbers read from the observation (nothing hidden),
multiplies them by fixed weights, and looks at the tile with the highest score. The weights are fitted by ridge
regression to the true gain of looking at each tile, measured on fit episodes (`backend/env/learn.py`). The whole
policy is the table of weights in `backend/env/fitted/next_look.json`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

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
    return np.bincount(obs.tile_of_cell.ravel(), weights=field.ravel(), minlength=n)


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
            recent_frp = np.bincount(tile, weights=obs.modis[ok, 4] * w, minlength=n)
            recent_n = np.bincount(tile, weights=w, minlength=n)
            all_n = np.bincount(tile, minlength=n).astype(np.float64)
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
        mean = _per_tile(obs, obs.terrain_m) / np.maximum(np.bincount(obs.tile_of_cell.ravel(), minlength=n), 1)
        var = _per_tile(obs, (obs.terrain_m - mean[obs.tile_of_cell]) ** 2) / np.maximum(np.bincount(obs.tile_of_cell.ravel(), minlength=n), 1)
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


def fit_ridge(features: NDArray[np.float64], target: NDArray[np.float64], strength: float) -> NDArray[np.float64]:
    """Weights that minimise squared error plus `strength` times their squared size."""
    x = np.asarray(features, dtype=np.float64)
    return np.linalg.solve(x.T @ x + strength * np.eye(x.shape[1]), x.T @ np.asarray(target, dtype=np.float64))


FITTED_FILE: Path = Path(__file__).resolve().parent / "fitted" / "next_look.json"


def load_fitted() -> dict[str, Any] | None:
    import json

    return json.loads(FITTED_FILE.read_text(encoding="utf-8")) if FITTED_FILE.is_file() else None


def load_policy() -> LinearPolicyAgent | None:
    """The tracked learned policy, or None before one has been fitted."""
    doc = load_fitted()
    if doc is None or "policy" not in doc:
        return None
    return LinearPolicyAgent(doc["policy"]["weights"], doc["policy"]["feature_names"])


def env_settings() -> dict[str, Any]:
    """Keyword arguments for `NextLookEnv` that the tracked file's validation decided (empty before it exists)."""
    doc = load_fitted()
    if doc is None:
        return {}
    teach = doc.get("learn_from_looks", {})
    if teach.get("adopted"):
        return {"learn_from_looks": True, "prior_cells": float(teach["prior_cells"])}
    return {}
