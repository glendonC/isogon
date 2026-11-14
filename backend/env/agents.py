"""Reference agents for the next-look environment, and a runner.

All four spend the budget on the same looks (spread evenly over the episode), so they differ only in which tile they
choose. The oracle sees the hidden data and is reported only as the ceiling.
"""

from __future__ import annotations

from typing import Any, Protocol

import numpy as np

from backend.env.next_look import NO_LOOK, NextLookEnv, Observation


def spend_now(decision: int, n_looks: int, budget: int) -> bool:
    """True on the looks an evenly spread budget is spent on: look i when floor((i + 1) b / n) exceeds floor(i b / n)."""
    if budget <= 0 or n_looks <= 0:
        return False
    return ((decision + 1) * budget) // n_looks > (decision * budget) // n_looks


class Agent(Protocol):
    name: str

    def choose(self, obs: Observation, env: NextLookEnv) -> int: ...


def _tile_sums(obs: Observation, field: np.ndarray) -> np.ndarray:
    n = obs.tiles_shape[0] * obs.tiles_shape[1]
    return np.bincount(obs.tile_of_cell.ravel(), weights=field.ravel(), minlength=n)


class RandomAgent:
    name = "random"

    def __init__(self, seed: int = 0) -> None:
        self.rng = np.random.default_rng(seed)

    def choose(self, obs: Observation, env: NextLookEnv) -> int:
        return int(self.rng.integers(0, obs.tiles_shape[0] * obs.tiles_shape[1]))


class LeastSureAgent:
    """The tile where the model is least sure: the largest sum of p (1 - p) over its cells."""

    name = "least_sure"

    def choose(self, obs: Observation, env: NextLookEnv) -> int:
        return int(np.argmax(_tile_sums(obs, obs.p_burning * (1.0 - obs.p_burning))))


class LatestModisAgent:
    """The tile with the strongest recent MODIS signal: FRP of MODIS detections, halved for every six hours of age."""

    name = "latest_modis"

    def choose(self, obs: Observation, env: NextLookEnv) -> int:
        n = obs.tiles_shape[0] * obs.tiles_shape[1]
        if obs.modis.shape[0] == 0:
            return 0
        g = env.grid
        r, c = g.row_col(obs.modis[:, 0], obs.modis[:, 1])
        ok = r >= 0
        age_h = (obs.time_s - obs.modis[ok, 5]) / 3600.0
        w = obs.modis[ok, 4] * 0.5 ** (age_h / 6.0)
        return int(np.argmax(np.bincount(obs.tile_of_cell[r[ok], c[ok]], weights=w, minlength=n)))


class OracleAgent:
    """Sees the hidden data: tries every tile and takes the one with the largest true reward. Ceiling only (greedy)."""

    name = "oracle"

    def choose(self, obs: Observation, env: NextLookEnv) -> int:
        gains = [env.peek(t) for t in range(env.n_tiles)]
        return int(np.argmax(gains))


def run_episode(env: NextLookEnv, agent: Agent, seed: int | None = None) -> dict[str, Any]:
    """Play one episode. The return is the final score minus the score with no look at all."""
    obs = env.reset(seed)
    start = env.score_start
    total = 0.0
    actions: list[int] = []
    rewards: list[float] = []
    done = env.n_looks == 0
    info: dict[str, Any] = {"score": start}
    while not done:
        assert obs is not None
        act = agent.choose(obs, env) if (obs.budget_left > 0 and spend_now(obs.decision, env.n_looks, env.budget)) else NO_LOOK
        obs, reward, done, info = env.step(act)
        actions.append(int(act))
        rewards.append(reward)
        total += reward
    return {"agent": agent.name, "score_start": start, "score_end": info["score"], "return": total,
            "actions": actions, "rewards": [round(r, 6) for r in rewards], "score_name": env.score_name}
