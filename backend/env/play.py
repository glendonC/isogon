"""One player's play of an episode, step by step, as plain numbers and lists.

`play_steps(env, agent)` plays the episode once and returns one step per scheduled look: what the player knew
before deciding, the score it gave each tile, the tile it chose, what the look revealed, the reward, and the score
so far. It is what a page needs to show a player choosing.

Hidden rows. A step is written from the observation the player was given before it decided, and that observation
is built from the visible rows and from the rows of the tiles already looked at. Beside it a step carries what the
environment computes against the hidden detections by design, named in `computed_against_hidden_rows`: the reward,
the score after the step, and `revealed`, the rows this very look handed over inside its tile. So no step holds a
hidden row before the look that reveals it, and a row no look revealed is in no step at all. The oracle is the
exception and is refused unless asked for as what it is, the player that sees the answer: its tile scores are
true rewards, read from hidden rows.
"""

from __future__ import annotations

import base64
import math
import time
from typing import Any

import numpy as np

from backend.env.agents import (
    CentreTileAgent,
    ConstantTileAgent,
    ExpectedNewAgent,
    LatestModisAgent,
    LeastSureAgent,
    NightLeastSureAgent,
    OracleAgent,
    RandomAgent,
    SharpLeastSureAgent,
    WhenUnsureAgent,
    centre_tiles,
    looks_now,
    reads_hidden_rows,
    tile_scores,
)
from backend.env.next_look import NO_LOOK, REWARD, NextLookEnv, Observation
from backend.env.policy import LinearPolicyAgent
from backend.model.platforms import PLATFORMS

_ARGMAX_CHOOSE = (
    LeastSureAgent.choose,
    LatestModisAgent.choose,
    ExpectedNewAgent.choose,
    OracleAgent.choose,
    LinearPolicyAgent.choose,
)

ROW_COLUMNS: tuple[str, ...] = ("lon", "lat", "scan_km", "track_km", "frp_mw", "time_utc", "platform")
# What a player is, in words a page can print: (label, what it does, what it reads).
PLAYERS: dict[str, tuple[str, str, str]] = {
    "random": ("Random", "a tile at random", "nothing"),
    "constant": ("Constant tile", "always the same tile", "nothing"),
    "centre": ("Centre tiles", "the tiles around the middle of the box, in turn", "nothing"),
    "latest_modis": ("Latest MODIS", "the tile with the strongest recent MODIS fire power", "the observation"),
    "least_sure": ("Least sure", "the tile where the model is least sure", "the observation"),
    "expected_new": ("Most expected new detections", "the tile where the model expects the most hidden detections its map does not already hold", "the observation"),
    "least_sure_at_night": ("Least sure, at night", "the tile where the model is least sure, on night passes", "the observation"),
    "least_sure_when_unsure": ("Least sure, when most unsure", "the tile where the model is least sure, in each stretch at the look where it is most unsure", "the observation"),
    "least_sure_when_sharp": ("Least sure, at a sharp pass", "the tile where the model is least sure; one look in each stretch of the episode, at the first pass sharper than the passes seen so far in that stretch, by a bar that eases as the stretch runs out, and at the stretch's last pass if none is", "the observation"),
    "learned": ("Learned", "the tile with the highest learned score", "the observation"),
    "learned_tiles_only": ("Learned, tiles only", "the tile with the highest learned score, on the evenly spread looks", "the observation"),
    "oracle": ("Sees the answer", "reads the hidden data and takes the tile with the largest reward at each of the evenly spread "
               "looks; it chooses where, not when, so a player that also chooses when can gain more", "the hidden rows"),
}
COMPUTED_AGAINST_HIDDEN_ROWS: tuple[str, ...] = (
    "score_start", "steps[].reward", "steps[].score", "steps[].revealed", "score_end", "gain", "taught_elsewhere",
)


def _iso(t: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(round(float(t)))))


def _num(x: Any, digits: int | None = None) -> float | None:
    v = float(x)
    if not math.isfinite(v):
        return None
    return v if digits is None else round(v, digits)


def _rows(a: np.ndarray) -> dict[str, Any]:
    """Detections as the environment holds them, (n, 7): lon, lat, scan_km, track_km, frp_mw, time_s, platform code."""
    rows = [
        [round(float(r[0]), 5), round(float(r[1]), 5), round(float(r[2]), 3), round(float(r[3]), 3),
         round(float(r[4]), 2), _iso(r[5]), PLATFORMS[int(r[6])]]
        for r in np.asarray(a, dtype=np.float64).reshape(-1, 7)
    ]
    return {"columns": list(ROW_COLUMNS), "rows": rows}


def player_card(agent: Any) -> dict[str, Any]:
    """Who is playing: an id, a label, what it does and what it reads."""
    name = str(agent.name)
    kind = "constant" if name.startswith("constant_") else name
    label, does, reads = PLAYERS.get(kind, (name, "", "the hidden rows" if reads_hidden_rows(agent) else "the observation"))
    card: dict[str, Any] = {"id": name, "label": label, "does": does, "reads": reads}
    if isinstance(agent, ConstantTileAgent):
        card["tile"] = agent.tile
    return card


def tile_view(obs: Observation, revealed_before: list[int] | None = None) -> dict[str, Any]:
    """What the player knew, per tile, from the observation alone: the estimate, how unsure it is, whether the
    pass covers the tile, the MODIS detections so far, and the looks already taken there. `revealed_before` is the
    number of pixels earlier looks handed over in each tile, kept by the caller as the looks are taken."""
    n = obs.tiles_shape[0] * obs.tiles_shape[1]
    tile = obs.tile_of_cell.ravel()
    p = np.clip(np.nan_to_num(obs.p_burning), 0.0, 1.0)

    def per_tile(v: np.ndarray, digits: int) -> list[float]:
        s = np.bincount(tile, weights=np.nan_to_num(np.asarray(v, dtype=np.float64)).ravel(), minlength=n)
        return [round(float(x), digits) for x in s]

    inside = obs.modis_tile >= 0
    age_h = (obs.time_s - obs.modis[inside, 5]) / 3600.0
    recent = np.bincount(obs.modis_tile[inside], weights=obs.modis[inside, 4] * 0.5 ** (age_h / 6.0), minlength=n)
    looked = np.bincount(np.array([t for _, t in obs.revealed_tiles], dtype=np.int64), minlength=n)
    shown = revealed_before if revealed_before is not None else [0] * n
    return {
        "expected_burning_cells": per_tile(p, 3),
        "unsure": per_tile(p * (1.0 - p), 3),
        "frp_mw": per_tile(obs.frp_mw, 1),
        "sigma_mw": per_tile(obs.sigma_mw, 1),
        "covered": [bool(x) for x in np.asarray(obs.tile_covered).ravel()],
        "modis_pixels": [int(x) for x in np.bincount(obs.modis_tile[inside], minlength=n)],
        "modis_recent_frp_mw": [round(float(x), 1) for x in recent],
        "looks_before": [int(x) for x in looked],
        "revealed_pixels_before": [int(x) for x in shown],
    }


def _when(agent: Any, obs: Observation, spending: bool) -> dict[str, Any] | None:
    """How a player that chooses when to look decided about this look: its look score, the bar the score had to
    reach and, for the learned player, what made the score. None for a player on the evenly spread looks, and once
    the budget is spent."""
    if getattr(agent, "looks_now", None) is None or obs.budget_left <= 0:
        return None
    last = getattr(agent, "last_when", None)
    if last is None:                                           # a rule with no score: night passes, evenly
        return {"looks": spending, "score": None, "bar": None, "stretch": None,
                "reason": "one of the night looks its budget is spread over" if spending else "not one of the night looks its budget is spread over",
                "rule": "night passes, the budget spread evenly over them"}
    out: dict[str, Any] = {
        "looks": spending, "score": _num(last["score"], 6), "bar": None if last["bar"] is None else _num(last["bar"], 6),
        "stretch": int(last["stretch"]), "reason": str(last["reason"]),
        "rule": "one look in each of as many equal stretches of the episode as the budget has looks: as soon as the look "
                "score is in the top share of what the stretch has shown so far, and at the stretch's last look if not before",
    }
    if "parts" in last:
        out["score_parts"] = {"names": list(last["names"]), "parts": list(last["parts"])}
    if "signal" in last:
        out["signal"] = last["signal"]
    return out


def _why(agent: Any, spending: bool, budget_left: int, scores: np.ndarray | None, when: dict[str, Any] | None = None) -> str:
    if budget_left <= 0:
        return "no look left in the budget"
    if not spending:
        return "not one of the looks the budget is spread over" if when is None else str(when["reason"])
    if isinstance(agent, ConstantTileAgent):
        return "its constant tile"
    if isinstance(agent, CentreTileAgent):
        return "the next of the centre tiles"
    if isinstance(agent, RandomAgent):
        return "drawn at random"
    return "the tile with the highest score" if scores is not None else "the player's own choice"


def _b64(a: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(a, dtype=np.uint8).tobytes()).decode("ascii")


def play_steps(env: NextLookEnv, agent: Any, seed: int = 0, ceiling: bool = False, fields: bool = False,
               sees_the_answer: bool = False) -> dict[str, Any]:
    """Play one episode with `agent` and return it step by step (see the module's note on hidden rows).

    A player that reads the hidden rows is refused unless `sees_the_answer` is true; its play belongs after a
    round, and its `tile_scores` are then named as computed against the hidden rows. `ceiling` is the older name
    of the same switch and still works; the word is wrong for this player, which chooses where and not when.

    With `fields`, every step also carries the estimate the player was shown on the 375 m grid, one byte per cell
    (`knew.estimate`), and the episode carries the tile of every cell, so a page can draw the estimate changing
    as looks are taken. It is the observation's own field, so the rule on hidden rows holds for it as well.
    """
    hidden_reader = reads_hidden_rows(agent)
    if hidden_reader and not (sees_the_answer or ceiling):
        raise ValueError(f"{agent.name} reads the hidden rows; ask for it with sees_the_answer=True, after the round")
    obs = env.reset(seed)
    start = float(env.score_start)
    d = env.describe()
    steps: list[dict[str, Any]] = []
    taken: list[list[int]] = []
    shown_per_tile = [0] * env.n_tiles
    total = 0.0
    score = start
    done = env.n_looks == 0
    ask = env if hidden_reader else None
    explain = getattr(agent, "explain", None)
    argmax_choice = getattr(type(agent), "choose", None) in _ARGMAX_CHOOSE
    while not done:
        assert obs is not None
        k = int(obs.decision)
        spending = looks_now(agent, obs, env.n_looks, env.budget)
        when = _when(agent, obs, spending)
        scores = tile_scores(agent, obs, ask) if spending else None
        parts = explain(obs) if (spending and explain is not None) else None
        if not spending:
            act = NO_LOOK
        elif scores is not None and argmax_choice:
            act = int(np.argmax(scores))
        else:
            act = int(agent.choose(obs, ask))
        step: dict[str, Any] = {
            "decision": k,
            "look": {"platform": str(obs.sensor), "time_utc": _iso(obs.time_s), "is_day": bool(obs.is_day),
                     "pixel_km": [round(float(obs.pixel_km[0]), 3), round(float(obs.pixel_km[1]), 3)]},
            "budget_left": int(obs.budget_left),
            "looks_left": int(obs.looks_left),
            "spending_look": spending,
            # how the player decided whether to look now: null for a player on the evenly spread looks
            "when": when,
            "knew": {
                "tiles": tile_view(obs, list(shown_per_tile)),
                "modis_detections": int(obs.modis.shape[0]),
                "last_modis_utc": _iso(float(obs.modis[:, 5].max())) if obs.modis.shape[0] else None,
                "revealed_pixels": int(obs.viirs_revealed.shape[0]),
            },
            "tile_scores": None if scores is None else [_num(s, 6) for s in scores],
            "score_parts": parts,
            "chosen_tile": act,
            "why": _why(agent, spending, int(obs.budget_left), scores, when),
        }
        if fields:
            step["knew"]["estimate"] = {
                "p_burning_u8": _b64(np.rint(np.clip(np.nan_to_num(obs.p_burning), 0.0, 1.0) * 255.0)),
                "p_detect_u8": _b64(np.rint(np.clip(np.nan_to_num(obs.p_detect), 0.0, 1.0) * 255.0)),
            }
        before = int(obs.viirs_revealed.shape[0])
        obs, reward, done, info = env.step(act)
        handed = None
        if info["spent"]:
            # the rows this look handed over: the tail of what is revealed after it (the observation keeps the
            # order in which looks were taken); at the last look the environment gives no observation, so they are
            # asked for directly
            shown = env.revealed_rows() if obs is None else obs.viirs_revealed
            handed = {"pixels": int(info["revealed_pixels"]), **_rows(shown[before:])}
            taken.append([k, act])
            shown_per_tile[act] += int(info["revealed_pixels"])
        total += float(reward)
        score = float(info["score"])
        step.update({"spent": bool(info["spent"]), "revealed": handed, "reward": _num(reward), "score": _num(score)})
        steps.append(step)
    grids = None
    if fields:
        grids = {
            "tile_of_cell_u8": _b64(env.tile_of_cell),
            "order": "row-major; row 0 is the northern row, column 0 the western column",
            "encoding": (
                "one byte per cell, base64. steps[].knew.estimate.p_burning_u8: the model's probability that a cell "
                "burns at the look's time, times 255 and rounded; p_detect_u8: its probability that the hidden "
                "instrument flags the cell at that look, the same way; tile_of_cell_u8: the tile of every cell"
            ),
        }
    return {
        "what": "one player's play of one episode of the next-look environment, step by step",
        "player": player_card(agent),
        "seed": int(seed),
        "episode": {
            "box": d["box"], "grid": d["grid"], "tiles": d["tiles"], "budget": d["budget"], "looks": d["viirs_looks"],
            "looks_source": d["looks"]["source"], "an_empty_look_means": d["looks"]["an_empty_look_means"],
            "score": d["score"], "reward": REWARD,
            "tile_order": "tile t is row t // columns and column t % columns of the split; row 0 is the northern row",
            "centre_tiles": centre_tiles(env.tiles),
            "fields": grids,
        },
        "spending": (
            "the player chooses when to look as well as where; steps[].when says how it decided at each look"
            if getattr(agent, "looks_now", None) is not None else
            "the budget is spent on looks spread evenly over the episode; the player chooses only the tile"
        ),
        "score_start": _num(start),
        "steps": steps,
        "score_end": _num(score),
        "gain": _num(total),
        "looks_taken": taken,
        "taught_elsewhere": env.taught_elsewhere(),
        "tile_scores_are": (
            "true rewards, computed against the hidden rows" if hidden_reader else
            "the player's own score for each tile at a look it decides; null for a player that does not rank tiles"
        ),
        "computed_against_hidden_rows": list(COMPUTED_AGAINST_HIDDEN_ROWS) + (["steps[].tile_scores"] if hidden_reader else []),
        "known_limits": env.known_limits,
    }


def reference_player(name: str, seed: int = 0, policy: Any | None = None) -> Any:
    """A reference player by the id the tables use: random, constant_<tile>, centre, latest_modis, least_sure,
    expected_new, least_sure_at_night, least_sure_when_unsure, least_sure_when_sharp, learned (the tracked policy, or the one given),
    learned_tiles_only (the tracked policy's tile choice on the evenly spread looks) or oracle."""
    if name == "random":
        return RandomAgent(seed=seed)
    if name.startswith("constant_"):
        return ConstantTileAgent(int(name.split("_", 1)[1]))
    simple = {"centre": CentreTileAgent, "latest_modis": LatestModisAgent, "least_sure": LeastSureAgent,
              "expected_new": ExpectedNewAgent, "least_sure_at_night": NightLeastSureAgent,
              "least_sure_when_unsure": WhenUnsureAgent, "least_sure_when_sharp": SharpLeastSureAgent, "oracle": OracleAgent}
    if name in simple:
        return simple[name]()
    if name in ("learned", "learned_tiles_only"):
        if policy is None:
            from backend.env.policy import load_fitted, policy_from

            doc = load_fitted()
            if doc is None or "policy" not in doc:
                raise LookupError("no learned policy is tracked")
            policy = policy_from(doc["policy"], tiles_only=(name == "learned_tiles_only"))
        if name == "learned_tiles_only":
            policy.name = name
        return policy
    raise LookupError(f"no reference player named {name!r}")
