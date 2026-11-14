"""Rounds of the next-look environment for the page, over `backend/env/next_look.py`. Wired into
`backend/server.py`:

  POST /api/env/next_look/reset   {region_id, episode | start, tiles, budget, seed}
  POST /api/env/next_look/step    {round_id, decision, action}
  GET  /api/env/next_look/state?round_id=<id>

A round is one episode of the environment. The MODIS detections of a real run are shown and VIIRS is hidden; at each
scheduled VIIRS look a person may spend one unit of a budget to reveal the VIIRS detections of that look inside one
tile. `episode` names an episode of the environment's catalogue (`backend.env.episodes`, for example
`plumas_ca:22:2021-07-22T05`); `start` asks for the first twelve MODIS overpasses with a detection in the region's box
at or after a UTC date, the window rule of a real run (`backend.model.real_blind.window_from_start`).

Rounds live in server memory: at most `MAX_ROUNDS`, the least recently used dropped first, and none kept after
`ROUND_IDLE_S` without a request.

Hidden rows. No response holds a hidden row, or a count taken from hidden rows, before the look that reveals it.
Three kinds of figure are computed against the hidden detections because the environment is built that way:
the starting score of the reconstruction (`score_start`), the score after each step (`info.score`,
`info.score_detail`) and the reward. They are scores, not rows. The reveal (every hidden detection of the episode)
and the reference agents' results (computed with the hidden rows; the oracle reads them) are served only once the
round is over. `backend/tests/test_server_next_look.py` plays a round twice, the second time with every hidden row
the round did not reveal deleted, and requires every other field of every response before the end to be equal.
"""

from __future__ import annotations

import base64
import concurrent.futures as cf
from dataclasses import dataclass, field
import math
import re
import secrets
import threading
import time
from typing import Any, Callable

import numpy as np

MAX_ROUNDS: int = 16
ROUND_IDLE_S: float = 6 * 3600.0
MAX_TILES_SIDE: int = 8
MAX_BUDGET: int = 24
DEFAULT_TILES: tuple[int, int] = (4, 4)
DEFAULT_BUDGET: int = 4
REFERENCE_RANDOM_SEEDS: int = 10        # as the environment's own reference table
REFERENCE_WAIT_S: float = 90.0          # the step that ends a round waits this long for the reference agents
REFERENCE_WORKERS: int = 2
EPISODE_KEY = re.compile(r"^(?P<region>[a-z_]+):(?P<tile>[0-9]{2}):(?P<hour>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2})$")
ROW_COLUMNS: tuple[str, ...] = ("lon", "lat", "scan_km", "track_km", "frp_mw", "time_utc", "platform")
SPENDING: str = (
    "every reference agent spends its budget on the same looks, spread evenly over the round "
    "(backend.env.agents.spend_now); only the tile differs. A person may spend a look whenever they choose."
)


class RoundNotFound(LookupError):
    """An unknown region, episode or round (HTTP 404)."""


class RoundConflict(RuntimeError):
    """A step that does not fit the round's state (HTTP 409)."""


# ---- small helpers ---------------------------------------------------------------------------------------------------


def _iso(t: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(round(float(t)))))


def _num(x: Any) -> float | None:
    v = float(x)
    return v if math.isfinite(v) else None


def _whole(body: dict[str, Any], key: str, default: int | None, lo: int, hi: int) -> int | None:
    v = body.get(key, default)
    if v is None:
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float)) or (isinstance(v, float) and (not math.isfinite(v) or v != int(v))):
        raise ValueError(f"{key} must be a whole number")
    v = int(v)
    if not lo <= v <= hi:
        raise ValueError(f"{key} must be between {lo} and {hi}")
    return v


def _text(body: dict[str, Any], key: str) -> str | None:
    v = body.get(key)
    if v is None:
        return None
    if not isinstance(v, str) or not v.strip():
        raise ValueError(f"{key} must be a non-empty string")
    return v.strip()


def _tiles(v: Any) -> tuple[int, int]:
    if v is None:
        return DEFAULT_TILES
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        v = [v, v]
    if not isinstance(v, list) or len(v) != 2:
        raise ValueError("tiles must be [rows, columns] or one number")
    out = []
    for x in v:
        if isinstance(x, bool) or not isinstance(x, (int, float)) or x != int(x) or not 1 <= int(x) <= MAX_TILES_SIDE:
            raise ValueError(f"each tile count must be a whole number from 1 to {MAX_TILES_SIDE}")
        out.append(int(x))
    return out[0], out[1]


def _b64(a: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(a, dtype=np.uint8).tobytes()).decode("ascii")


def rows_json(a: np.ndarray) -> dict[str, Any]:
    """Detections as the environment holds them, (n, 7): lon, lat, scan_km, track_km, frp_mw, time_s, platform code."""
    from backend.model.platforms import PLATFORMS

    rows = [
        [round(float(r[0]), 5), round(float(r[1]), 5), round(float(r[2]), 3), round(float(r[3]), 3),
         round(float(r[4]), 2), _iso(r[5]), PLATFORMS[int(r[6])]]
        for r in np.asarray(a, dtype=np.float64).reshape(-1, 7)
    ]
    return {"columns": list(ROW_COLUMNS), "rows": rows}


def observation_json(obs: Any, env: Any) -> dict[str, Any]:
    """An `Observation` as JSON: what the person may know before deciding, and nothing more."""
    g = env.grid
    n = int(env.n_tiles)
    tile = np.asarray(obs.tile_of_cell, dtype=np.int64).ravel()
    p = np.clip(np.nan_to_num(np.asarray(obs.p_burning, dtype=np.float64)), 0.0, 1.0)

    def per_tile(v: np.ndarray, digits: int) -> list[float]:
        s = np.bincount(tile, weights=np.nan_to_num(np.asarray(v, dtype=np.float64)).ravel(), minlength=n)
        return [round(float(x), digits) for x in s]

    return {
        "decision": int(obs.decision),
        "time_utc": _iso(obs.time_s),
        "platform": str(obs.sensor),
        "is_day": bool(obs.is_day),
        "budget_left": int(obs.budget_left),
        "looks_left": int(obs.looks_left),
        "tiles": [int(obs.tiles_shape[0]), int(obs.tiles_shape[1])],
        "tile_covered": [bool(x) for x in np.asarray(obs.tile_covered).ravel()],
        "modis": rows_json(obs.modis),
        "viirs_revealed": rows_json(obs.viirs_revealed),
        "revealed_tiles": [[int(k), int(t)] for k, t in obs.revealed_tiles],
        "estimate": {
            "grid": {"nx": int(g.nx), "ny": int(g.ny), "cell_km": float(g.cell_km), "box": [round(float(v), 6) for v in g.bbox],
                     "order": "row-major; row 0 is the northern row, column 0 the western column"},
            "per_tile": {
                "expected_burning_cells": per_tile(p, 3),
                "unsure": per_tile(p * (1.0 - p), 3),
                "frp_mw": per_tile(obs.frp_mw, 1),
                "sigma_mw": per_tile(obs.sigma_mw, 1),
            },
            "p_burning_u8": _b64(np.rint(p * 255.0)),
            "tile_of_cell_u8": _b64(tile.reshape(g.ny, g.nx)),
            "encoding": ("p_burning_u8: the model's probability that a cell burns, times 255 and rounded, one byte per "
                         "cell, base64; tile_of_cell_u8: the tile of every cell, one byte per cell, base64. Tile t is "
                         "row t // columns and column t % columns of the split, row 0 northern"),
        },
    }


# ---- one round ---------------------------------------------------------------------------------------------------------


@dataclass
class Round:
    round_id: str
    episode: Any                       # backend.env.episodes.EnvEpisode
    env: Any                           # backend.env.next_look.NextLookEnv
    tiles: tuple[int, int]
    budget: int
    seed: int
    episode_json: dict[str, Any]
    looks: list[dict[str, Any]]
    score_start: float
    touched: float
    decision: int = 0
    done: bool = False
    history: list[dict[str, Any]] = field(default_factory=list)
    observation: dict[str, Any] | None = None
    end: dict[str, Any] | None = None
    reference: cf.Future | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


class NextLookRounds:
    """The round store the server holds. Every loader can be replaced (tests pass a synthetic episode source)."""

    def __init__(
        self,
        episode_source: Callable[[str, str | None, str | None], Any] | None = None,
        terrain: bool = True,
        max_rounds: int = MAX_ROUNDS,
        idle_s: float = ROUND_IDLE_S,
        reference_seeds: int = REFERENCE_RANDOM_SEEDS,
        reference_wait_s: float = REFERENCE_WAIT_S,
        clock: Callable[[], float] = time.time,
        reference: bool = True,
        source_label: str | None = None,
    ) -> None:
        self.episode_source = episode_source
        self.reference = bool(reference)
        self.source_label = source_label or ("firms" if episode_source is None else "test episode source")
        self.terrain = terrain
        self.max_rounds = int(max_rounds)
        self.idle_s = float(idle_s)
        self.reference_seeds = int(reference_seeds)
        self.reference_wait_s = float(reference_wait_s)
        self.clock = clock
        self._rounds: dict[str, Round] = {}
        self._lock = threading.Lock()
        self._catalogues: dict[tuple[str, int], list[Any]] = {}
        self._pool: cf.ThreadPoolExecutor | None = None

    # ---- episodes ------------------------------------------------------------------------------------------------

    def _catalogue(self, region_id: str, year: int) -> list[Any]:
        from backend.env.episodes import catalogue
        from backend.firms import read_firms, region_box
        from backend.firms.archive import region_rows_digest
        from backend.terrain.live_region import PRESET_BY_ID

        key = (region_id, year, region_rows_digest(region_id))   # rebuilt when any row of the region changes
        with self._lock:
            hit = self._catalogues.get(key)
        if hit is None:
            hit = catalogue(read_firms, region_box, PRESET_BY_ID, years=(year,), regions=(region_id,))
            with self._lock:
                if len(self._catalogues) >= 8:
                    self._catalogues.pop(next(iter(self._catalogues)))
                self._catalogues[key] = hit
        return hit

    def _episode(self, region_id: str, episode_key: str | None, start: str | None) -> tuple[Any, str]:
        if self.episode_source is not None:
            return self.episode_source(region_id, episode_key, start), ("catalogue" if episode_key else "start")
        from backend.firms.archive import REGION_COUNTRY

        if region_id not in REGION_COUNTRY:
            raise RoundNotFound(f"no real FIRMS rows are cached for region '{region_id}'")
        if episode_key is not None:
            m = EPISODE_KEY.match(episode_key)
            if not m:
                raise ValueError("episode must look like region:tile:YYYY-MM-DDTHH, for example plumas_ca:22:2021-07-22T05")
            if m["region"] != region_id:
                raise ValueError(f"episode {episode_key} is not in region {region_id}")
            for ep in self._catalogue(region_id, int(m["hour"][:4])):
                if ep.key == episode_key:
                    return ep, "catalogue"
            raise RoundNotFound(f"no episode {episode_key} in the environment's catalogue")
        return self._episode_from_start(region_id, str(start)), "start"

    def _episode_from_start(self, region_id: str, start: str) -> Any:
        from backend.env.episodes import PAD_S, EnvEpisode
        from backend.eval.rows import detections_from_rows
        from backend.firms import read_firms, region_box
        from backend.model.real_blind import EPISODE_OVERPASSES, window_from_start
        from backend.model.real_run import ROW_SOURCE, SEARCH_S, parse_start_s
        from backend.model.training import EXCLUSIONS
        from backend.terrain.live_region import PRESET_BY_ID

        try:
            t0 = parse_start_s(start)
        except (TypeError, ValueError) as exc:
            raise ValueError("start must be a UTC date (YYYY-MM-DD) or date-time") from exc
        b = PRESET_BY_ID[region_id].bbox
        box = (b.west, b.south, b.east, b.north)
        rows = read_firms(region_box(region_id), _iso(t0 - PAD_S)[:-1], _iso(t0 + SEARCH_S)[:-1])
        det = detections_from_rows(rows, ROW_SOURCE)
        w = window_from_start(det, box, t0, n=EPISODE_OVERPASSES, hidden="VIIRS")
        keep = (det.time_s >= w.start_s - PAD_S) & (det.time_s < w.end_s + PAD_S)
        e0, e1 = (parse_start_s(d) for d in EXCLUSIONS[region_id][:2]) if region_id in EXCLUSIONS else (0.0, 0.0)
        split = "test" if (w.start_s < e1 and w.end_s > e0) else "fit"
        year = int(_iso(w.start_s)[:4])
        return EnvEpisode(region_id, year, (2, 2), box, w, det.select(keep), split)

    # ---- the environment ---------------------------------------------------------------------------------------------

    def _make_env(self, ep: Any, tiles: tuple[int, int], budget: int) -> Any:
        from backend.env.next_look import NextLookEnv
        from backend.env.policy import env_settings
        from backend.eval.grid import EvalGrid
        from backend.model.fitted import load_params

        terrain = None
        if self.terrain:
            from backend.env.terrain import context_elevation
            from backend.firms import region_box

            terrain = context_elevation(ep.region_id, region_box(ep.region_id), EvalGrid.from_bbox(ep.box))
        return NextLookEnv(ep.det, ep.box, (ep.window.start_s, ep.window.end_s), tiles=tiles, budget=budget,
                           params=load_params(), terrain_m=terrain, **env_settings())

    @staticmethod
    def _looks(env: Any) -> list[dict[str, Any]]:
        out = []
        for k in range(env.n_looks):
            lk = env._looks[k]          # the scheduled slot (platform and calendar; no detection)
            out.append({"index": k, "platform": lk.platform, "time_utc": _iso(lk.time_s), "is_day": bool(lk.is_day),
                        "scan_km": round(float(lk.scan_km), 3), "track_km": round(float(lk.track_km), 3)})
        return out

    @staticmethod
    def _episode_json(ep: Any, env: Any, origin: str, tiles: tuple[int, int], budget: int) -> dict[str, Any]:
        d = env.describe()
        w = ep.window
        return {
            "key": ep.key,
            "region_id": ep.region_id,
            "from": origin,
            "split": ep.split,
            "box": [round(float(v), 6) for v in ep.box],
            "first_overpass_utc": _iso(w.start_s),
            "last_overpass_utc": _iso(w.end_s - 1.0),
            "span_hours": round((w.end_s - 1.0 - w.start_s) / 3600.0, 2),
            "modis_overpasses": int(w.n_modis),
            "modis_pixels_in_box": int(w.modis_pixels_in_box),
            "rule": w.rule,
            "chosen_from": w.chosen_from,
            "tiles": [tiles[0], tiles[1]],
            "budget": budget,
            "grid": d["grid"],
            "viirs_looks": d["viirs_looks"],
            "viirs_platforms": d["viirs_platforms"],
            "looks_source": d["looks"]["source"],
            "looks_note": d["looks"]["note"],
            "learn_from_looks": d["learn_from_looks"],
            "score": d["score"],
            "reward": d["reward"],
            "reward_target": d["reward_target"],
        }

    # ---- the reference agents, computed in the background, served at the end -----------------------------------------

    def _reference(self, ep: Any, tiles: tuple[int, int], budget: int) -> dict[str, Any]:
        from backend.env.agents import LatestModisAgent, LeastSureAgent, OracleAgent, RandomAgent, run_episode
        from backend.env.policy import load_policy

        env = self._make_env(ep, tiles, budget)

        def play(agent: Any, seed: int) -> dict[str, Any]:
            r = run_episode(env, agent, seed=seed)
            return {"gain": _num(r["return"]), "final": _num(r["score_end"]), "actions": [int(a) for a in r["actions"]]}

        rand = [play(RandomAgent(seed=s), s) for s in range(self.reference_seeds)]
        out: dict[str, Any] = {
            "random": {"seeds": list(range(self.reference_seeds)), "gains": [r["gain"] for r in rand],
                       "finals": [r["final"] for r in rand], "actions": [r["actions"] for r in rand]},
            "latest_modis": play(LatestModisAgent(), 0),
            "least_sure": play(LeastSureAgent(), 0),
        }
        policy = load_policy()
        out["learned"] = play(policy, 0) if policy is not None else None
        out["oracle"] = play(OracleAgent(), 0)
        out["score_start"] = _num(env.score_start)
        out["spending"] = SPENDING
        out["oracle_note"] = "sees the hidden detections and takes the best tile at each look: a ceiling, not a player"
        return out

    def _submit_reference(self, ep: Any, tiles: tuple[int, int], budget: int) -> cf.Future:
        with self._lock:
            if self._pool is None:
                self._pool = cf.ThreadPoolExecutor(max_workers=REFERENCE_WORKERS, thread_name_prefix="next-look-reference")
            pool = self._pool
        return pool.submit(self._reference, ep, tiles, budget)

    @staticmethod
    def _reference_result(rnd: Round, wait_s: float) -> tuple[dict[str, Any] | None, str]:
        fut = rnd.reference
        if fut is None:
            return None, "not computed"
        try:
            return fut.result(timeout=max(wait_s, 0.0)), "ready"
        except cf.TimeoutError:
            return None, "computing; read GET /api/env/next_look/state again"
        except Exception as exc:  # noqa: BLE001  (the round's own result stands without it)
            return None, f"failed: {exc}"

    # ---- the round store ---------------------------------------------------------------------------------------------

    def _insert(self, rnd: Round) -> None:
        with self._lock:
            now = self.clock()
            for rid in [r for r, x in self._rounds.items() if now - x.touched > self.idle_s]:
                self._drop(rid)
            while len(self._rounds) >= self.max_rounds:
                self._drop(min(self._rounds, key=lambda r: self._rounds[r].touched))
            self._rounds[rnd.round_id] = rnd

    def _drop(self, rid: str) -> None:
        old = self._rounds.pop(rid, None)
        if old is not None and old.reference is not None:
            old.reference.cancel()

    def _get(self, round_id: str | None) -> Round:
        if not round_id:
            raise ValueError("round_id is required")
        with self._lock:
            rnd = self._rounds.get(round_id)
            if rnd is None:
                raise RoundNotFound(
                    f"no round {round_id}: rounds are held in server memory, at most {self.max_rounds}, and one is "
                    "dropped after six idle hours or when the server restarts; start a new one")
            rnd.touched = self.clock()
            return rnd

    def held(self) -> int:
        with self._lock:
            return len(self._rounds)

    # ---- the three routes ----------------------------------------------------------------------------------------------

    def reset(self, body: dict[str, Any]) -> dict[str, Any]:
        region_id = _text(body, "region_id")
        if not region_id:
            raise ValueError("region_id is required")
        episode_key, start = _text(body, "episode"), _text(body, "start")
        if (episode_key is None) == (start is None):
            raise ValueError("give either episode (a catalogue key) or start (a UTC date), not both")
        tiles = _tiles(body.get("tiles"))
        budget = _whole(body, "budget", DEFAULT_BUDGET, 0, MAX_BUDGET)
        seed = _whole(body, "seed", 0, 0, 2**31 - 1)
        ep, origin = self._episode(region_id, episode_key, start)
        env = self._make_env(ep, tiles, int(budget))
        if env.n_looks == 0:
            raise ValueError("this episode has no scheduled VIIRS look")
        obs = env.reset(seed)
        rnd = Round(
            round_id="nl-" + secrets.token_hex(8), episode=ep, env=env, tiles=tiles, budget=int(budget), seed=int(seed),
            episode_json=self._episode_json(ep, env, origin, tiles, int(budget)), looks=self._looks(env),
            score_start=float(env.score_start), touched=self.clock(),
        )
        rnd.observation = observation_json(obs, env)
        rnd.reference = self._submit_reference(ep, tiles, int(budget)) if self.reference else None
        self._insert(rnd)
        return {
            "round_id": rnd.round_id,
            "data": self.source_label,
            "source": {
                "environment": "backend/env/next_look.py",
                "routes": "backend/server_next_look.py",
                "reference_agents": "backend/env/agents.py and backend/env/policy.py, played on this episode",
            },
            "episode": rnd.episode_json,
            "looks": rnd.looks,
            "score_start": _num(rnd.score_start),
            "observation": rnd.observation,
            "reference": None,
            "reference_status": "computed in the background; served when the round ends",
            "test_episodes": test_episodes(),
            "known_limits": _known_limits(),
            "protocol": _protocol(),
            "rounds": {"held": self.held(), "max": self.max_rounds},
        }

    def step(self, body: dict[str, Any]) -> dict[str, Any]:
        rnd = self._get(_text(body, "round_id"))
        decision = _whole(body, "decision", None, 0, 100_000)
        if decision is None:
            raise ValueError("decision is required: the index of the look being decided")
        if "action" not in body:
            raise ValueError("action is required: a tile index, or -1 for no look")
        action = _whole(body, "action", None, -1, MAX_TILES_SIDE * MAX_TILES_SIDE)
        with rnd.lock:
            if rnd.done:
                raise RoundConflict("the round is over; start a new one")
            if decision != rnd.decision:
                raise RoundConflict(f"decision {decision} is not the round's current decision {rnd.decision}")
            if not -1 <= int(action) < rnd.env.n_tiles:
                raise ValueError(f"action must be -1 (no look) or a tile index below {rnd.env.n_tiles}")
            obs, reward, done, info = rnd.env.step(int(action))
            entry = {
                "decision": decision, "action": int(action), "spent": bool(info["spent"]),
                "no_budget_left": bool(info["no_budget_left"]), "revealed_pixels": int(info["revealed_pixels"]),
                "reward": _num(reward), "score": _num(info["score"]),
            }
            rnd.history.append(entry)
            rnd.decision += 1
            rnd.observation = observation_json(obs, rnd.env) if obs is not None else None
            out = {
                "round_id": rnd.round_id,
                "decision": decision,
                "action": int(action),
                "spent": entry["spent"],
                "reward": entry["reward"],
                "done": bool(done),
                "info": {
                    "score": entry["score"],
                    "score_name": info["score_name"],
                    "score_detail": {k: _num(v) for k, v in info["score_detail"].items()},
                    "revealed_pixels": entry["revealed_pixels"],
                    "no_budget_left": entry["no_budget_left"],
                    "reward_target": info["reward_target"],
                },
                "observation": rnd.observation,
            }
            if done:
                rnd.done = True
                rnd.end = self._end(rnd)
                out["end"] = rnd.end
            return out

    def state(self, round_id: str | None) -> dict[str, Any]:
        rnd = self._get(round_id)
        with rnd.lock:
            if rnd.done and rnd.end is not None and rnd.end["reference"] is None:
                rnd.end["reference"], rnd.end["reference_status"] = self._reference_result(rnd, 0.0)
            out = {
                "round_id": rnd.round_id,
                "episode": rnd.episode_json,
                "looks": rnd.looks,
                "score_start": _num(rnd.score_start),
                "decision": rnd.decision,
                "done": rnd.done,
                "history": list(rnd.history),
                "observation": rnd.observation,
                "known_limits": _known_limits(),
            }
            if rnd.done:
                out["end"] = rnd.end
            return out

    # ---- the end of a round --------------------------------------------------------------------------------------------

    def _end(self, rnd: Round) -> dict[str, Any]:
        taken = [[h["decision"], h["action"]] for h in rnd.history if h["spent"]]
        ref, status = self._reference_result(rnd, self.reference_wait_s)
        last = rnd.history[-1]["score"] if rnd.history else rnd.score_start
        return {
            "score_start": _num(rnd.score_start),
            "score_end": last,
            "gain": _num(sum(h["reward"] or 0.0 for h in rnd.history)),
            "looks_taken": taken,
            "reveal": self._reveal(rnd, taken),
            "reference": ref,
            "reference_status": status,
        }

    @staticmethod
    def _reveal(rnd: Round, taken: list[list[int]]) -> dict[str, Any]:
        """Every hidden detection of the episode inside the box that lies in the window or belongs to one of its looks
        (a look owns the rows of its own pass, in the window or not, so a look near
        the window's edge can hand over rows just outside it). Served only once the round is over."""
        from backend.model.platforms import PLATFORMS

        ep, env = rnd.episode, rnd.env
        d = ep.det
        cand = d.select(d.is_viirs & d.in_box(ep.box))
        try:
            look_all = env._slot_of_rows(cand)   # the scheduled look each row belongs to (-1 for none)
        except Exception:  # noqa: BLE001
            look_all = np.full(len(cand), -1)
        in_window = (cand.time_s >= ep.window.start_s) & (cand.time_s < ep.window.end_s)
        keep = in_window | (look_all >= 0)
        hid, look = cand.select(keep), look_all[keep]
        g = env.grid
        r, c = g.row_col(hid.lon, hid.lat)
        tile = env.tile_of_cell[np.clip(r, 0, g.ny - 1), np.clip(c, 0, g.nx - 1)]
        looked = {(int(k), int(t)) for k, t in taken}
        rows = [
            [round(float(hid.lon[i]), 5), round(float(hid.lat[i]), 5), round(float(hid.scan_km[i]), 3),
             round(float(hid.track_km[i]), 3), round(float(hid.frp_mw[i]), 2), _iso(hid.time_s[i]),
             PLATFORMS[int(hid.platform_code[i])], int(tile[i]), int(look[i]), (int(look[i]), int(tile[i])) in looked]
            for i in range(len(hid))
        ]
        return {
            "what": ("every VIIRS detection inside the box from the first to the last MODIS overpass, and every one a "
                     "look owns (the rows of its own pass, in the window or not); look is the scheduled look the row "
                     "belongs to (-1: none), revealed whether the round looked at its tile on that look"),
            "columns": list(ROW_COLUMNS) + ["tile", "look", "revealed"],
            "rows": rows,
            "pixels": len(rows),
        }


# ---- the tracked results and texts the page shows beside a round -----------------------------------------------------


def test_episodes() -> dict[str, Any] | None:
    """The reference table on the test episodes under protocol version 2, read from the environment's tracked file."""
    from backend.env.policy import FITTED_FILE, load_fitted

    doc = load_fitted() or {}
    t = doc.get("test_protocol_2")
    if not t:
        return None
    names = {"random": "random", "latest_modis": "latest_modis", "least_sure": "least_sure", "linear": "learned",
             "learned": "learned", "oracle": "oracle"}
    agents = t.get("agents", {})
    return {
        "episodes": t.get("episodes"),
        "mean_start_score": t.get("mean_start_score"),
        "mean_gain": {names[k]: v.get("mean_gain") for k, v in agents.items() if k in names},
        "mean_final": {names[k]: v.get("mean_final") for k, v in agents.items() if k in names},
        "plainly": t.get("plainly"),
        "from": f"{FITTED_FILE.relative_to(FITTED_FILE.parents[3])}, test_protocol_2, generated {doc.get('generated_utc')}",
    }


def _known_limits() -> str:
    from backend.env import KNOWN_LIMITS

    return KNOWN_LIMITS


def _protocol() -> dict[str, Any]:
    from backend.env.policy import load_fitted

    try:  # the environment's own name for the protocol it plays under
        from backend.env.next_look import PROTOCOL
    except ImportError:  # pragma: no cover
        from backend.eval.blind_test import PROTOCOL

    note =((load_fitted() or {}).get("test_protocol_2") or {}).get("note")
    return {"version": PROTOCOL["version"], "name": PROTOCOL["name"], "note": note}
