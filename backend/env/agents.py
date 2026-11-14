"""Reference players for the next-look environment, and a runner.

A player chooses a tile, and may also choose when to look (`looks_now`). A player that does not say when spends
the budget on the same looks as every other such player, spread evenly over the episode, so those players differ
only in which tile they choose. Players that choose when are named for it (`least_sure_at_night`,
`least_sure_when_unsure`, `least_sure_when_sharp`, and the learned player when its look score is in use). Three
kinds:

  no observation   `random`, a constant tile, the centre tiles in turn. They read nothing about the fire. Episodes
                   are framed around a fire, so a tile near the middle holds fire more often than not: what these
                   players gain is the geometry of the framing, and a player has skill only beyond it.
  observation      `latest_modis`, `least_sure`, `expected_new` and the learned policy of `backend/env/policy.py`.
                   They decide from the observation alone and are given no environment to ask.
  hidden rows      `oracle`. It tries every tile against the hidden data and takes the best one at each look. It is
                   reported only as the ceiling.
"""

from __future__ import annotations

from typing import Any, Protocol

import numpy as np
from numpy.typing import NDArray

from backend.env.next_look import NO_LOOK, NextLookEnv, Observation
from backend.model.occupancy import expected_count_cells


def spend_now(decision: int, n_looks: int, budget: int) -> bool:
    """True on the looks an evenly spread budget is spent on: look i when floor((i + 1) b / n) exceeds floor(i b / n)."""
    if budget <= 0 or n_looks <= 0:
        return False
    return ((decision + 1) * budget) // n_looks > (decision * budget) // n_looks


def top_share_rule(score: float, seen: list[float], budget_left: int, looks_left: int) -> tuple[bool, float | None]:
    """An online rule for when to look, from a score of the look: (whether to look, the bar the score had to reach).

    `seen` holds the scores of this round's looks so far, this one included. With b looks left to spend and n looks
    left to come, the player looks when the score is at least the (1 - b / n) quantile of what the round has shown:
    in the top b / n share. When the looks left are no more than the budget left it always looks, so the budget is
    never left unspent. At the round's first look it has nothing to compare with and waits unless it must look.
    """
    if budget_left <= 0:
        return False, None
    if looks_left <= budget_left:
        return True, None
    if len(seen) < 2:
        return False, None
    bar = float(np.quantile(np.asarray(seen, dtype=np.float64), 1.0 - budget_left / looks_left))
    return bool(score >= bar), bar


def stretch_of(decision: int, n_looks: int, budget: int) -> int:
    """The stretch a look lies in when an episode's looks are cut into `budget` equal stretches. The evenly spread
    looks of `spend_now` are the last look of each stretch."""
    return (decision * budget) // n_looks if n_looks > 0 and budget > 0 else 0


class StretchClock:
    """One look per stretch of the episode, taken at a look the player's own score picks.

    Looks taken close together repeat each other, so a player that only follows a score bunches its looks and
    loses to the evenly spread ones. This keeps the spacing of the evenly spread looks and lets the score choose
    inside each stretch: the player looks as soon as its score is in the top share of what the stretch has shown
    so far (`top_share_rule` with one look to spend over the looks left in the stretch), and at the stretch's last
    look if it has not looked yet. A player that always waits for the last look is the evenly spread player.
    """

    def __init__(self) -> None:
        self.stretch = -1
        self.seen: list[float] = []
        self.looked = False

    def decide(self, obs: Observation, score: float) -> dict[str, Any]:
        """Whether to look (`looks`), the bar the score had to reach (`bar`, None where no bar applied), the
        stretch this look lies in and the reason in words."""
        n = int(obs.look_times_s.size)
        budget = obs.budget_left + len(obs.revealed_tiles)             # the round's whole budget
        k = int(obs.decision)
        s = stretch_of(k, n, budget)
        if k == 0 or s != self.stretch:
            self.stretch, self.seen, self.looked = s, [], False
        self.seen.append(float(score))
        out: dict[str, Any] = {"looks": False, "bar": None, "stretch": s, "score": float(score)}
        if self.looked or obs.budget_left <= 0:
            return {**out, "reason": "it has looked in this stretch already"}
        left = sum(1 for j in range(k, n) if stretch_of(j, n, budget) == s)
        look, bar = top_share_rule(float(score), self.seen, 1, left)
        self.looked = look
        if bar is not None:
            reason = "its score reached the bar" if look else "its score did not reach the bar"
        else:
            reason = "the last look of the stretch" if look else "the first look of the stretch: nothing to compare its score with"
        return {**out, "looks": look, "bar": bar, "reason": reason}


def looks_now(agent: Any, obs: Observation, n_looks: int, budget: int) -> bool:
    """Whether the player looks at this look. A player that decides when to look answers itself (`looks_now(obs)`);
    every other player spends on the evenly spread looks."""
    if obs.budget_left <= 0:
        return False
    own = getattr(agent, "looks_now", None)
    return bool(own(obs)) if own is not None else spend_now(obs.decision, n_looks, budget)


class Agent(Protocol):
    name: str

    def choose(self, obs: Observation, env: NextLookEnv | None) -> int: ...


def _n_tiles(obs: Observation) -> int:
    return obs.tiles_shape[0] * obs.tiles_shape[1]


def _tile_sums(obs: Observation, field: NDArray[np.float64]) -> NDArray[np.float64]:
    return np.bincount(obs.tile_of_cell.ravel(), weights=field.ravel(), minlength=_n_tiles(obs))


def centre_tiles(tiles_shape: tuple[int, int]) -> list[int]:
    """The tiles around the middle of the box: one for an odd split, two or four where a side is even."""
    rows, cols = tiles_shape
    mid_r = sorted({(rows - 1) // 2, rows // 2})
    mid_c = sorted({(cols - 1) // 2, cols // 2})
    return [r * cols + c for r in mid_r for c in mid_c]


class RandomAgent:
    name = "random"

    def __init__(self, seed: int = 0) -> None:
        self.rng = np.random.default_rng(seed)

    def choose(self, obs: Observation, env: NextLookEnv | None = None) -> int:
        return int(self.rng.integers(0, _n_tiles(obs)))


class ConstantTileAgent:
    """Always the same tile. Reads nothing from the observation."""

    def __init__(self, tile: int) -> None:
        self.tile = int(tile)
        self.name = f"constant_{self.tile}"

    def choose(self, obs: Observation, env: NextLookEnv | None = None) -> int:
        if not 0 <= self.tile < _n_tiles(obs):
            raise ValueError(f"tile {self.tile} is not in a split of {_n_tiles(obs)} tiles")
        return self.tile


class CentreTileAgent:
    """The centre tiles in turn, one per look taken. Reads from the observation only how many looks it has taken."""

    name = "centre"

    def choose(self, obs: Observation, env: NextLookEnv | None = None) -> int:
        tiles = centre_tiles(obs.tiles_shape)
        return tiles[len(obs.revealed_tiles) % len(tiles)]


class LeastSureAgent:
    """The tile where the model is least sure: the largest sum of p (1 - p) over its cells."""

    name = "least_sure"

    def scores(self, obs: Observation, env: NextLookEnv | None = None) -> NDArray[np.float64]:
        return _tile_sums(obs, obs.p_burning * (1.0 - obs.p_burning))

    def choose(self, obs: Observation, env: NextLookEnv | None = None) -> int:
        return int(np.argmax(self.scores(obs)))


class NightLeastSureAgent(LeastSureAgent):
    """Least sure, on night passes: the budget is spread evenly over the night looks of the schedule, and over all
    the looks when there are fewer night looks than the budget. A timing rule with nothing fitted."""

    name = "least_sure_at_night"

    def looks_now(self, obs: Observation) -> bool:
        budget = obs.budget_left + len(obs.revealed_tiles)             # the round's whole budget
        night = np.flatnonzero(~obs.look_is_day)
        if night.size < budget:
            return spend_now(obs.decision, obs.look_times_s.size, budget)
        if obs.is_day:
            return False
        return spend_now(int(np.searchsorted(night, obs.decision)), int(night.size), budget)


class WhenUnsureAgent(LeastSureAgent):
    """Least sure, with one look per stretch of the episode taken where the model is most unsure: the stretch rule
    (`StretchClock`) on one signal, the largest tile uncertainty. A timing rule with nothing fitted; it shows what
    a fitted look score adds beyond one signal."""

    name = "least_sure_when_unsure"

    def __init__(self) -> None:
        self._clock = StretchClock()
        self.last_when: dict[str, Any] | None = None

    def looks_now(self, obs: Observation) -> bool:
        self.last_when = {**self._clock.decide(obs, float(self.scores(obs).max())), "signal": "the largest tile sum of p (1 - p)"}
        return bool(self.last_when["looks"])


class FreeWhenUnsureAgent(LeastSureAgent):
    """Least sure, looking whenever the model is most unsure, with nothing to keep its looks apart: the top-share
    rule over the whole round. Not a reference player. It is kept to show why the players that choose when take
    one look per stretch: this one bunches its looks and loses to the evenly spread ones."""

    name = "least_sure_looking_freely"

    def __init__(self) -> None:
        self._seen: list[float] = []

    def looks_now(self, obs: Observation) -> bool:
        if obs.decision == 0:
            self._seen = []
        score = float(self.scores(obs).max())
        self._seen.append(score)
        return top_share_rule(score, self._seen, obs.budget_left, obs.looks_left)[0]


class SharpLeastSureAgent(LeastSureAgent):
    """Least sure, with one look per stretch of the episode taken at a sharp pass: the stretch rule (`StretchClock`)
    on one signal, the look's pixel area from the schedule, smaller being better. A pass that crosses nearly
    overhead has the smallest pixels. A timing rule with nothing fitted."""

    name = "least_sure_when_sharp"

    def __init__(self) -> None:
        self._clock = StretchClock()
        self.last_when: dict[str, Any] | None = None

    def looks_now(self, obs: Observation) -> bool:
        self.last_when = {**self._clock.decide(obs, -float(obs.pixel_km[0] * obs.pixel_km[1])),
                          "signal": "minus the look's pixel area in km2: the smaller the pixel, the higher the score"}
        return bool(self.last_when["looks"])


class LatestModisAgent:
    """The tile with the strongest recent MODIS signal: FRP of MODIS detections, halved for every six hours of age."""

    name = "latest_modis"

    def scores(self, obs: Observation, env: NextLookEnv | None = None) -> NDArray[np.float64]:
        n = _n_tiles(obs)
        ok = obs.modis_tile >= 0
        if not ok.any():
            return np.zeros(n)
        age_h = (obs.time_s - obs.modis[ok, 5]) / 3600.0
        return np.bincount(obs.modis_tile[ok], weights=obs.modis[ok, 4] * 0.5 ** (age_h / 6.0), minlength=n)

    def choose(self, obs: Observation, env: NextLookEnv | None = None) -> int:
        return int(np.argmax(self.scores(obs)))


class ExpectedNewAgent:
    """The tile where the model expects the most hidden detections that its own map does not already hold.

    The model's prediction for this look gives every cell a probability of being flagged, and its map declares the
    most probable cells (as many as it expects to be flagged in the whole box). A look turns a tile's prediction
    into the answer, so what it adds is what the map lacks there: the expected detections in the tile's cells the
    map does not declare. This is the reward's own logic used as a rule, with nothing fitted.
    """

    name = "expected_new"

    def scores(self, obs: Observation, env: NextLookEnv | None = None) -> NDArray[np.float64]:
        return _tile_sums(obs, np.where(expected_count_cells(obs.p_detect), 0.0, obs.p_detect))

    def choose(self, obs: Observation, env: NextLookEnv | None = None) -> int:
        return int(np.argmax(self.scores(obs)))


class OracleAgent:
    """Sees the hidden data: tries every tile and takes the one with the largest true reward. Ceiling only (greedy)."""

    name = "oracle"
    reads_hidden_rows = True

    def scores(self, obs: Observation, env: NextLookEnv | None) -> NDArray[np.float64]:
        if env is None:
            raise ValueError("the oracle asks the environment what each tile would pay")
        return np.array([env.peek(t) for t in range(env.n_tiles)])

    def choose(self, obs: Observation, env: NextLookEnv | None) -> int:
        return int(np.argmax(self.scores(obs, env)))


def reads_hidden_rows(agent: Any) -> bool:
    """True for a player whose choice is computed from the hidden rows (the oracle)."""
    return bool(getattr(agent, "reads_hidden_rows", False))


def tile_scores(agent: Any, obs: Observation, env: NextLookEnv | None) -> NDArray[np.float64] | None:
    """The score a player gives every tile at this look (its choice is the highest), or None for a player that
    does not rank tiles (random, a constant tile, the centre tiles)."""
    scores = getattr(agent, "scores", None)
    return None if scores is None else np.asarray(scores(obs, env), dtype=np.float64)


def reference_agents(tiles_shape: tuple[int, int], random_seeds: int = 10, policy: Any | None = None) -> list[Any]:
    """Every reference player for a tile split, in the order the tables list them: random once per seed, every
    constant tile, the centre tiles, latest MODIS, least sure, the most expected new detections, the three least
    sure players that choose when to look, the learned policy when one is given, the oracle."""
    out: list[Any] = [RandomAgent(seed=s) for s in range(random_seeds)]
    out += [ConstantTileAgent(t) for t in range(tiles_shape[0] * tiles_shape[1])]
    out += [CentreTileAgent(), LatestModisAgent(), LeastSureAgent(), ExpectedNewAgent(), NightLeastSureAgent(), WhenUnsureAgent(),
            SharpLeastSureAgent()]
    if policy is not None:
        out.append(policy)
    out.append(OracleAgent())
    return out


def play_reference(env: NextLookEnv, random_seeds: int = 10, policy: Any | None = None) -> dict[str, Any]:
    """Every reference player on one environment, as plain numbers and lists: for a round's debrief.

    Per player the gain (final score minus starting score), the final score, the action at every look (-1 where it
    did not look) and the pixels each of its looks revealed. `random` holds one entry per seed and `constant` one
    per tile. The oracle reads the hidden rows; the whole result is computed against them and belongs after the
    round is over.
    """
    def one(agent: Any, seed: int = 0) -> dict[str, Any]:
        r = run_episode(env, agent, seed=seed)
        return {"gain": float(r["return"]), "final": float(r["score_end"]), "actions": [int(a) for a in r["actions"]],
                "revealed_pixels": [int(p) for p in r["revealed_pixels"]], "taught_elsewhere": float(r["taught_elsewhere"])}

    rand = [one(RandomAgent(seed=s), s) for s in range(random_seeds)]
    const = [one(ConstantTileAgent(t)) for t in range(env.n_tiles)]
    out: dict[str, Any] = {
        "random": {"seeds": list(range(random_seeds)), "gains": [r["gain"] for r in rand], "finals": [r["final"] for r in rand],
                   "actions": [r["actions"] for r in rand]},
        "constant": {"tiles": list(range(env.n_tiles)), "gains": [r["gain"] for r in const], "finals": [r["final"] for r in const]},
        "centre": {"tiles": centre_tiles(env.tiles), **one(CentreTileAgent())},
        "latest_modis": one(LatestModisAgent()),
        "least_sure": one(LeastSureAgent()),
        "expected_new": one(ExpectedNewAgent()),
        "least_sure_at_night": one(NightLeastSureAgent()),
        "least_sure_when_unsure": one(WhenUnsureAgent()),
        "least_sure_when_sharp": one(SharpLeastSureAgent()),
        "learned": one(policy) if policy is not None else None,
        "oracle": one(OracleAgent()),
        "score_start": float(env.score_start),
        "reads_nothing": ["random", "constant", "centre"],
        "reads_hidden_rows": ["oracle"],
        "choose_when_to_look": ["least_sure_at_night", "least_sure_when_unsure", "least_sure_when_sharp"]
                               + (["learned"] if hasattr(policy, "looks_now") else []),
    }
    return out


def run_episode(env: NextLookEnv, agent: Agent, seed: int | None = None) -> dict[str, Any]:
    """Play one episode. The return is the sum of the rewards, which is `score_end` minus `score_start`: the score
    is taken on one fixed set, every hidden detection of the episode. `taught_elsewhere` is the part of the gain
    on cells the player was never shown (a diagnostic). Only the oracle is given the environment."""
    obs = env.reset(seed)
    start = env.score_start
    total = 0.0
    actions: list[int] = []
    rewards: list[float] = []
    pixels: list[int] = []
    done = env.n_looks == 0
    info: dict[str, Any] = {"score": start}
    ask = env if reads_hidden_rows(agent) else None
    while not done:
        assert obs is not None
        act = agent.choose(obs, ask) if looks_now(agent, obs, env.n_looks, env.budget) else NO_LOOK
        obs, reward, done, info = env.step(act)
        actions.append(int(act))
        rewards.append(reward)
        total += reward
        if info["spent"]:
            pixels.append(int(info["revealed_pixels"]))
    return {"agent": agent.name, "score_start": start, "score_end": info["score"], "return": total,
            "actions": actions, "rewards": [round(r, 6) for r in rewards], "revealed_pixels": pixels,
            "taught_elsewhere": env.taught_elsewhere()["gain"], "score_name": env.score_name}
