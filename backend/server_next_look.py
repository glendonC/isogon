"""Rounds of the next-look environment for the page, over `backend/env/next_look.py`. Wired into
`backend/server.py`:

  POST /api/env/next_look/reset   {region_id, episode | start, tiles, budget, seed}
  POST /api/env/next_look/step    {round_id, decision, action}
  GET  /api/env/next_look/state?round_id=<id>
  POST /api/env/next_look/play    {region_id, episode | start, tiles, budget, seed, player, ceiling, fields, round_id}
  GET  /api/env/next_look/players

A play is one reference player's play of one episode, step by step (`backend/env/play.py`): what it knew at each
look, how it scored the tiles, what it chose and why, what the look revealed and the score. It is a round of its
own: it holds the hidden rows its own looks revealed and scores computed against the hidden rows, so it is asked for
apart from a person's round, or after it; given the `round_id` of a person's round on the same episode that is not
over, the route answers 409. The oracle reads the hidden rows and is served only when asked as the ceiling
(`ceiling: true`). Plays are cached like the reference players, under the same kind of key plus the player, the
seed and the options.

A round is one episode of the environment. The MODIS detections of a real run are shown and VIIRS is hidden; at each
scheduled VIIRS look a person may spend one unit of a budget to reveal the VIIRS detections of that look inside one
tile. `episode` names an episode of the environment's catalogue (`backend.env.episodes`, for example
`plumas_ca:22:2021-07-22T05`); `start` asks for the first twelve MODIS overpasses with a detection in the region's box
at or after a UTC date, the window rule of a real run (`backend.model.real_blind.window_from_start`).

Rounds live in server memory: at most `MAX_ROUNDS`, the least recently used dropped first, and none kept after
`ROUND_IDLE_S` without a request.

The reference players of an episode are computed once and kept, in memory and as one JSON file per key in
`data/cache/next_look_reference/`. The key is a sha256 over everything their results follow from: the episode's
rows, box and window, the terrain the environment is given, the tiles, the budget, the number of random seeds, the
region's CMR pass files, and the content of every file of `backend/env`, `backend/eval` and `backend/model` (the
environment, its reward and schedule, the reconstruction and its fitted values, the learned policy), of
`backend/firms/cmr_passes.py` and of this file. A change to any of them gives a new key, so nothing is served from
before it. Two rounds of one episode that start at the same time share one computation.

The files are those of the code the process loaded: their digest is taken once, when the rounds are made, after the
modules the reference players run are imported, and every key of the process uses it. Files that change on disk
later do not change the key of a process that runs the old code, and such a process writes nothing more to the disk
cache, so a process with old code never writes a result under the key of the new code.

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
from collections import OrderedDict
import concurrent.futures as cf
from dataclasses import dataclass, field, fields
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import sys
import threading
import time
from typing import Any, Callable

import numpy as np

REPO_ROOT: Path = Path(__file__).resolve().parents[1]
REFERENCE_CACHE_DIR: Path = REPO_ROOT / "data" / "cache" / "next_look_reference"
REFERENCE_CACHE_VERSION: int = 2        # raised when the shape or meaning of a cached result changes (2: the pass list
                                        # default, the refit learned player and the expected_new player)
PLAY_CACHE_VERSION: int = 1
REFERENCE_MEMORY: int = 64              # results kept in memory, the least recently used dropped first
# Every file whose content can change the reference players' results (see the module docstring).
REFERENCE_INPUTS: tuple[Path, ...] = (
    REPO_ROOT / "backend" / "env",
    REPO_ROOT / "backend" / "eval",
    REPO_ROOT / "backend" / "model",
    REPO_ROOT / "backend" / "firms" / "cmr_passes.py",
    Path(__file__).resolve(),
)
_FROM_SOURCE = object()                 # default of `reference_cache_dir`: the disk cache for real rows only

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


class ClosedWindow(RoundConflict):
    """A held-out run, a reveal, a round or a play asked on a closed window (HTTP 409, with the evidence route)."""

    evidence = "/api/evidence"


# The model lane's closed rule, asked with a box and a window, when it is in the build: (module, function), answering
# None for an open window or {"region_id": ..., "years": [...]} for a closed one.
MODEL_CLOSED_RULE: tuple[str, str] = ("backend.env.episodes", "closed_for")
DAY_S: float = 86400.0


def _boxes_meet(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def _closed_here(box: tuple[float, float, float, float], start_s: float, end_s: float) -> dict[str, Any] | None:
    """The closed rule as the model states it, for builds without its function: a window is closed when the box meets
    the context box of a region with a recorded test fire and the window meets a year of that fire's set-aside dates
    (every year from the first to the last, so a period across New Year closes both)."""
    from backend.firms.archive import region_box
    from backend.model.training import EXCLUSIONS

    for region, ex in EXCLUSIONS.items():
        first = int(ex[0][:4])
        last_day = float(np.datetime64(ex[1], "s").astype(np.int64)) - DAY_S
        last = int(str(np.datetime64(int(last_day), "s"))[:4])
        years = list(range(first, last + 1))
        if not _boxes_meet(tuple(box), region_box(region)):
            continue
        y0 = float(np.datetime64(f"{years[0]}-01-01", "s").astype(np.int64))
        y1 = float(np.datetime64(f"{years[-1] + 1}-01-01", "s").astype(np.int64))
        if start_s < y1 and end_s > y0:
            return {"region_id": region, "years": years}
    return None


def closed_for(box: tuple[float, float, float, float], start_s: float, end_s: float) -> dict[str, Any] | None:
    """Whether a box and a window are closed: the model lane's function when it is in the build, else the same rule."""
    import importlib

    mod, fn = MODEL_CLOSED_RULE
    try:
        rule = getattr(importlib.import_module(mod), fn)
    except (ImportError, AttributeError):
        rule = _closed_here
    return rule(tuple(float(v) for v in box), float(start_s), float(end_s))


def closed_sentence(found: dict[str, Any]) -> str:
    """The refusal, naming the place and its fire (from the presets and the places registry), not an id."""
    from backend.terrain.live_region import PRESET_BY_ID

    region = found["region_id"]
    place = PRESET_BY_ID[region].name if region in PRESET_BY_ID else "this place"
    fire = None
    try:
        from backend.firms.places import load_places

        fire = next((f["name"] for f in load_places().get("regions", {}).get(region, {}).get("named_fires", [])
                     if f.get("blind_test_fire")), None)
    except (OSError, ValueError, KeyError):
        fire = None
    years = found.get("years") or []
    when = " and ".join(str(y) for y in years) or "these dates"
    return (f"{when} in {place} hold{'s' if len(years) == 1 else ''} a recorded test fire"
            f"{f', the {fire},' if fire else ''} and {'is' if len(years) == 1 else 'are'} closed: no held-out run, "
            f"reveal, round or play is served there, so the fire is never scored again. The recorded looks are at "
            f"GET /api/evidence; the run with every satellite shown still serves.")


def refuse_if_closed(box: tuple[float, float, float, float], start_s: float, end_s: float) -> None:
    found = closed_for(box, start_s, end_s)
    if found:
        raise ClosedWindow(closed_sentence(found))


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


# ---- what the reference players' results follow from ----------------------------------------------------------------

_inputs_memo: dict[tuple[str, ...], tuple[tuple[Any, ...], str]] = {}
_inputs_lock = threading.Lock()
# The modules the reference players and the plays run, imported before the digest of the loaded code is taken.
REFERENCE_MODULES: tuple[str, ...] = (
    "backend.env.agents", "backend.env.episodes", "backend.env.next_look", "backend.env.policy", "backend.env.terrain",
    "backend.eval.grid", "backend.eval.rows", "backend.model.fitted", "backend.model.real_blind",
    "backend.model.real_run", "backend.model.training", "backend.firms.cmr_passes",
)


def _input_files(roots: tuple[Path, ...]) -> list[tuple[str, Path]]:
    """(stable name, path) of every file under `roots`, compiled files left out; the name does not hold the checkout's
    own folder, so two checkouts of one commit give one digest."""
    out: list[tuple[str, Path]] = []
    for root in roots:
        root = Path(root)
        if root.is_file():
            out.append((root.name, root))
        elif root.is_dir():
            for p in sorted(root.rglob("*")):
                if p.is_file() and "__pycache__" not in p.parts and p.suffix not in (".pyc", ".pyo"):
                    out.append((f"{root.name}/{p.relative_to(root).as_posix()}", p))
    return out


def inputs_digest(roots: tuple[Path, ...] = REFERENCE_INPUTS) -> str:
    """sha256 over the name and content of every file under `roots`. Files are read again only when the name, size
    or modification time of one of them changes."""
    files = _input_files(tuple(roots))
    sig: list[Any] = []
    for name, p in files:
        try:
            st = p.stat()
        except OSError:
            continue
        sig.append((name, st.st_size, st.st_mtime_ns))
    memo_key = tuple(str(r) for r in roots)
    with _inputs_lock:
        hit = _inputs_memo.get(memo_key)
        if hit is not None and hit[0] == tuple(sig):
            return hit[1]
    h = hashlib.sha256()
    for name, p in files:
        try:
            body = p.read_bytes()
        except OSError:
            continue
        h.update(name.encode("utf-8") + b"\0" + hashlib.sha256(body).digest())
    digest = h.hexdigest()
    with _inputs_lock:
        _inputs_memo[memo_key] = (tuple(sig), digest)
    return digest


def loaded_inputs_digest(roots: tuple[Path, ...] = REFERENCE_INPUTS) -> str:
    """The inputs digest of the code this process runs: the modules the reference players run are imported first, so
    the files hashed are the ones in memory, then the digest of `roots` is taken. The caller keeps it."""
    import importlib

    for name in REFERENCE_MODULES:
        importlib.import_module(name)
    return inputs_digest(tuple(roots))


def episode_digest(ep: Any, terrain_m: np.ndarray | None) -> str:
    """sha256 over an episode's region, split, tile, box and window, every column of its rows (the hidden ones
    included: a changed hidden row changes the reference players' scores) and the terrain the environment gets."""
    w = ep.window
    head = {"region_id": ep.region_id, "year": int(ep.year), "tile": [int(v) for v in ep.tile], "split": ep.split,
            "box": [float(v) for v in ep.box], "window": [float(w.start_s), float(w.end_s)]}
    h = hashlib.sha256(json.dumps(head, sort_keys=True).encode("utf-8"))
    for f in fields(ep.det):
        v = getattr(ep.det, f.name)
        if isinstance(v, np.ndarray):
            a = np.ascontiguousarray(v)
            h.update(f"{f.name}:{a.dtype.str}:{a.shape};".encode("utf-8") + a.tobytes())
        else:
            h.update(f"{f.name}={v!r};".encode("utf-8"))
    if terrain_m is None:
        h.update(b"terrain:none")
    else:
        a = np.ascontiguousarray(terrain_m, dtype=np.float64)
        h.update(f"terrain:{a.shape};".encode("utf-8") + a.tobytes())
    return h.hexdigest()


def _finite(v: Any) -> Any:
    """Plain JSON numbers: a float that is not finite becomes None."""
    if isinstance(v, float):
        return v if math.isfinite(v) else None
    if isinstance(v, dict):
        return {k: _finite(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_finite(x) for x in v]
    return v


def _done_future(value: Any) -> cf.Future:
    fut: cf.Future = cf.Future()
    fut.set_result(value)
    return fut


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
    reference_key: str | None = None
    reference_origin: str | None = None   # "computed for this round", "shared with a round started earlier", "cache"
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
        reference_cache_dir: Any = _FROM_SOURCE,
        reference_inputs: tuple[Path, ...] = REFERENCE_INPUTS,
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
        # The disk cache holds results on real rows; a test's episode source keeps them in memory unless given a folder.
        if reference_cache_dir is _FROM_SOURCE:
            reference_cache_dir = REFERENCE_CACHE_DIR if episode_source is None else None
        self.reference_cache_dir: Path | None = Path(reference_cache_dir) if reference_cache_dir is not None else None
        self.reference_inputs = tuple(reference_inputs)
        # The digest of the code this process loaded, taken once: every key uses it, and nothing is written to the disk
        # cache once the files on disk are no longer these (`_write_cached`).
        self.loaded_inputs = loaded_inputs_digest(self.reference_inputs)
        self.stale_writes = 0                # results kept in memory only because the code on disk changed (for the tests)
        self.reference_computations = 0      # how many times the reference players were played (for the tests)
        self.play_computations = 0
        self._plays: dict[str, dict[str, Any]] = {}
        self._rounds: dict[str, Round] = {}
        self._lock = threading.Lock()
        self._catalogues: dict[tuple[str, int], list[Any]] = {}
        self._pool: cf.ThreadPoolExecutor | None = None
        self._ref_done: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._ref_running: dict[str, cf.Future] = {}

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
            year = int(m["hour"][:4])
            from backend.firms import region_box

            # every tile of the catalogue lies in the region's context box: asked before the catalogue is read
            refuse_if_closed(region_box(region_id), float(np.datetime64(f"{year}-01-01", "s").astype(np.int64)),
                             float(np.datetime64(f"{year + 1}-01-01", "s").astype(np.int64)))
            for ep in self._catalogue(region_id, year):
                if ep.key == episode_key:
                    return ep, "catalogue"
            raise RoundNotFound(f"no episode {episode_key} in the environment's catalogue")
        ep = self._episode_from_start(region_id, str(start))
        refuse_if_closed(ep.box, ep.window.start_s, ep.window.end_s)      # the episode's own box and window
        return ep, "start"

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

    def _terrain(self, ep: Any) -> np.ndarray | None:
        if not self.terrain:
            return None
        from backend.env.terrain import context_elevation
        from backend.eval.grid import EvalGrid
        from backend.firms import region_box

        return context_elevation(ep.region_id, region_box(ep.region_id), EvalGrid.from_bbox(ep.box))

    def _make_env(self, ep: Any, tiles: tuple[int, int], budget: int, terrain: Any = _FROM_SOURCE) -> Any:
        from backend.env.next_look import NextLookEnv
        from backend.env.policy import env_settings
        from backend.model.fitted import load_params

        if terrain is _FROM_SOURCE:
            terrain = self._terrain(ep)
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

    def _reference(self, ep: Any, tiles: tuple[int, int], budget: int, terrain: Any = _FROM_SOURCE) -> dict[str, Any]:
        """Every reference player on the episode (`backend.env.agents.play_reference`): random per seed, the constant
        tile per tile, the centre tiles, latest MODIS, least sure, expected new, learned and the oracle."""
        from backend.env.agents import play_reference
        from backend.env.policy import load_policy

        env = self._make_env(ep, tiles, budget, terrain)
        out = _finite(play_reference(env, random_seeds=self.reference_seeds, policy=load_policy()))
        out["spending"] = SPENDING
        out["oracle_note"] = "sees the hidden detections and takes the best tile at each look: a ceiling, not a player"
        out["reads_nothing_note"] = ("random, the constant tile and the centre tiles read nothing about the fire: what "
                                     "they gain is the framing of the episode, and a player shows skill by what it "
                                     "gains beyond them")
        return out

    def reference_key(self, ep: Any, terrain: np.ndarray | None, tiles: tuple[int, int], budget: int) -> str:
        """The cache key of the reference players' results on one episode (see the module docstring)."""
        passes = "none"
        if self.episode_source is None:
            from backend.firms.cmr_passes import pass_files_digest

            passes = pass_files_digest(ep.region_id)
        parts = {
            "version": REFERENCE_CACHE_VERSION,
            "episode": episode_digest(ep, terrain),
            "tiles": [int(tiles[0]), int(tiles[1])],
            "budget": int(budget),
            "random_seeds": self.reference_seeds,
            "pass_files": passes,
            "inputs": self.loaded_inputs,
        }
        return hashlib.sha256(json.dumps(parts, sort_keys=True).encode("utf-8")).hexdigest()

    def play_key(self, ep: Any, terrain: np.ndarray | None, tiles: tuple[int, int], budget: int, player: str,
                 seed: int, ceiling: bool, fields: bool) -> str:
        """The cache key of one player's play: what decides the episode's environment, and the play's own options."""
        parts = {"kind": "play", "version": PLAY_CACHE_VERSION, "episode": self.reference_key(ep, terrain, tiles, budget),
                 "player": player, "seed": int(seed), "ceiling": bool(ceiling), "fields": bool(fields)}
        return hashlib.sha256(json.dumps(parts, sort_keys=True).encode("utf-8")).hexdigest()

    def _cache_path(self, key: str, sub: str = "") -> Path | None:
        if self.reference_cache_dir is None:
            return None
        return (self.reference_cache_dir / sub if sub else self.reference_cache_dir) / f"{key}.json"

    def _read_cached(self, key: str, sub: str = "") -> dict[str, Any] | None:
        path = self._cache_path(key, sub)
        if path is None or not path.is_file():
            return None
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        body = "play" if sub == "plays" else "reference"
        if not isinstance(doc, dict) or doc.get("key") != key or not isinstance(doc.get(body), dict):
            return None
        return doc

    def _write_cached(self, doc: dict[str, Any], sub: str = "") -> None:
        path = self._cache_path(doc["key"], sub)
        if path is None:
            return
        if inputs_digest(self.reference_inputs) != self.loaded_inputs:
            # The files on disk are no longer the code this process runs: its result stays in memory, under its own key,
            # and the disk cache is left to a process started on the new code.
            with self._lock:
                self.stale_writes += 1
                first = self.stale_writes == 1
            if first:
                print("[next look] the code on disk differs from the code this process loaded; results are kept in "
                      "memory only until the server is started again", file=sys.stderr, flush=True)
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
            tmp.write_text(json.dumps(doc, allow_nan=False), encoding="utf-8")
            os.replace(tmp, path)
        except (OSError, ValueError):
            pass                                  # the result stays in memory; the next server computes it again

    def _remember(self, doc: dict[str, Any]) -> None:
        with self._lock:
            self._ref_done[doc["key"]] = doc
            self._ref_done.move_to_end(doc["key"])
            while len(self._ref_done) > REFERENCE_MEMORY:
                self._ref_done.popitem(last=False)

    def _compute_reference(self, key: str, ep: Any, tiles: tuple[int, int], budget: int, terrain: Any) -> dict[str, Any]:
        t0 = time.perf_counter()
        with self._lock:
            self.reference_computations += 1
        ref = self._reference(ep, tiles, budget, terrain)
        doc = {"key": key, "version": REFERENCE_CACHE_VERSION, "episode": ep.key, "tiles": [int(tiles[0]), int(tiles[1])],
               "budget": int(budget), "random_seeds": self.reference_seeds, "computed_utc": _iso(time.time()),
               "compute_s": round(time.perf_counter() - t0, 2), "reference": ref}
        self._remember(doc)
        self._write_cached(doc)
        return doc

    def _submit_reference(self, ep: Any, terrain: np.ndarray | None, tiles: tuple[int, int], budget: int) -> tuple[cf.Future, str, str]:
        """(future of the cached document, key, origin). A result in memory or on disk is served at once; a round
        that starts while the same key is being computed waits on that computation."""
        key = self.reference_key(ep, terrain, tiles, budget)
        with self._lock:
            if key in self._ref_done:
                self._ref_done.move_to_end(key)
                return _done_future(self._ref_done[key]), key, "cache"
            if key in self._ref_running:
                return self._ref_running[key], key, "shared with a round started earlier"
        doc = self._read_cached(key)
        if doc is not None:
            self._remember(doc)
            return _done_future(doc), key, "cache"
        with self._lock:
            if key in self._ref_done:
                return _done_future(self._ref_done[key]), key, "cache"
            if key in self._ref_running:
                return self._ref_running[key], key, "shared with a round started earlier"
            if self._pool is None:
                self._pool = cf.ThreadPoolExecutor(max_workers=REFERENCE_WORKERS, thread_name_prefix="next-look-reference")
            fut = self._pool.submit(self._compute_reference, key, ep, tiles, budget, terrain)
            self._ref_running[key] = fut

        def _finished(f: cf.Future, key: str = key) -> None:
            with self._lock:
                if self._ref_running.get(key) is f:
                    del self._ref_running[key]

        fut.add_done_callback(_finished)
        return fut, key, "computed for this round"

    @staticmethod
    def _reference_result(rnd: Round, wait_s: float) -> tuple[dict[str, Any] | None, str, dict[str, Any] | None]:
        """(reference, status, cache) for the end of a round. `cache` says where the result came from."""
        fut = rnd.reference
        if fut is None:
            return None, "not computed", None
        try:
            doc = fut.result(timeout=max(wait_s, 0.0))
        except cf.TimeoutError:
            return None, "computing; read GET /api/env/next_look/state again", None
        except cf.CancelledError:
            return None, "failed: the computation was cancelled", None
        except Exception as exc:  # noqa: BLE001  (the round's own result stands without it)
            return None, f"failed: {exc}", None
        cache = {
            "from": rnd.reference_origin,
            "key": rnd.reference_key,
            "computed_utc": doc.get("computed_utc"),
            "compute_s": doc.get("compute_s"),
            "keyed_on": ("the episode's rows, box and window, its terrain, the tiles, the budget, the random seeds, the "
                         "region's CMR pass files, and every file of backend/env, backend/eval and backend/model, "
                         "backend/firms/cmr_passes.py and backend/server_next_look.py"),
        }
        return doc["reference"], "ready", cache

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
        if old is None or old.reference is None:
            return
        # a computation still queued is cancelled when no other round waits on it (a running one carries on and is kept)
        if not any(r.reference is old.reference for r in self._rounds.values()):
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
        terrain = self._terrain(ep)
        env = self._make_env(ep, tiles, int(budget), terrain)
        if env.n_looks == 0:
            raise ValueError("this episode has no scheduled VIIRS look")
        obs = env.reset(seed)
        rnd = Round(
            round_id="nl-" + secrets.token_hex(8), episode=ep, env=env, tiles=tiles, budget=int(budget), seed=int(seed),
            episode_json=self._episode_json(ep, env, origin, tiles, int(budget)), looks=self._looks(env),
            score_start=float(env.score_start), touched=self.clock(),
        )
        rnd.observation = observation_json(obs, env)
        if self.reference:
            rnd.reference, rnd.reference_key, rnd.reference_origin = self._submit_reference(ep, terrain, tiles, int(budget))
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
            "validation_reference": validation_reference(),
            "known_limits": _known_limits(rnd.env),
            "protocol": _protocol(rnd.env),
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
                rnd.end["reference"], rnd.end["reference_status"], rnd.end["reference_cache"] = self._reference_result(rnd, 0.0)
            out = {
                "round_id": rnd.round_id,
                "episode": rnd.episode_json,
                "looks": rnd.looks,
                "score_start": _num(rnd.score_start),
                "decision": rnd.decision,
                "done": rnd.done,
                "history": list(rnd.history),
                "observation": rnd.observation,
                "known_limits": _known_limits(rnd.env),
                "protocol": _protocol(rnd.env),
            }
            if rnd.done:
                out["end"] = rnd.end
            return out

    # ---- the end of a round --------------------------------------------------------------------------------------------

    def _end(self, rnd: Round) -> dict[str, Any]:
        taken = [[h["decision"], h["action"]] for h in rnd.history if h["spent"]]
        ref, status, cache = self._reference_result(rnd, self.reference_wait_s)
        last = rnd.history[-1]["score"] if rnd.history else rnd.score_start
        try:
            taught = _finite(dict(rnd.env.taught_elsewhere()))
            taught["on"] = "the cells outside every tile looked at, at the look it was looked at"
        except (AttributeError, RuntimeError):
            taught = None
        return {
            "score_start": _num(rnd.score_start),
            "score_end": last,
            "gain": _num(sum(h["reward"] or 0.0 for h in rnd.history)),
            "looks_taken": taken,
            "taught_elsewhere": taught,
            "reveal": self._reveal(rnd, taken),
            "reference": ref,
            "reference_status": status,
            "reference_cache": cache,
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


    # ---- one player's play, step by step --------------------------------------------------------------------------

    def players(self) -> dict[str, Any]:
        """The players a play can be asked for: those of the module's table that its `reference_player` builds, so the
        list and the play route agree (one it cannot build is named in `not_playable`)."""
        play = _play_module()
        out, missing = [], []
        for pid, v in getattr(play, "PLAYERS", {}).items():
            try:
                play.reference_player("constant_0" if pid == "constant" else pid)
            except Exception:  # noqa: BLE001  (a player the module cannot build is not offered)
                missing.append(pid)
                continue
            out.append({"id": pid, "label": v[0], "does": v[1], "reads": v[2]})
        return {"players": out, "not_playable": missing,
                "ids": ("an id as listed; the constant tile is asked as constant_<tile>, a tile index; the oracle "
                        "only with ceiling: true"),
                "route": "POST /api/env/next_look/play"}

    def play(self, body: dict[str, Any]) -> dict[str, Any]:
        region_id = _text(body, "region_id")
        if not region_id:
            raise ValueError("region_id is required")
        episode_key, start = _text(body, "episode"), _text(body, "start")
        if (episode_key is None) == (start is None):
            raise ValueError("give either episode (a catalogue key) or start (a UTC date), not both")
        player = _text(body, "player")
        if not player:
            raise ValueError("player is required (GET /api/env/next_look/players lists them)")
        tiles = _tiles(body.get("tiles"))
        budget = int(_whole(body, "budget", DEFAULT_BUDGET, 0, MAX_BUDGET))
        seed = int(_whole(body, "seed", 0, 0, 2**31 - 1))
        flags = {}
        for k in ("ceiling", "fields"):
            v = body.get(k, False)
            if not isinstance(v, bool):
                raise ValueError(f"{k} must be true or false")
            flags[k] = v
        if player == "oracle" and not flags["ceiling"]:
            raise ValueError("the oracle reads the hidden rows; ask for it with ceiling: true, after the round")
        play_mod = _play_module()
        ep, origin = self._episode(region_id, episode_key, start)
        rid = _text(body, "round_id")
        if rid is not None:
            with self._lock:
                rnd = self._rounds.get(rid)
            if rnd is not None and not rnd.done and rnd.episode.key == ep.key:
                raise RoundConflict("that round on the same episode is not over; a play holds hidden rows its looks "
                                    "revealed, so it is served after the round")
        terrain = self._terrain(ep)
        key = self.play_key(ep, terrain, tiles, budget, player, seed, flags["ceiling"], flags["fields"])
        origin_cache = "cache"
        with self._lock:
            doc = self._plays.get(key)
        if doc is None:
            doc = self._read_cached(key, sub="plays")
        if doc is None:
            t0 = time.perf_counter()
            env = self._make_env(ep, tiles, budget, terrain)
            try:
                agent = play_mod.reference_player(player, seed=seed)
            except LookupError as exc:
                raise RoundNotFound(str(exc)) from exc
            with self._lock:
                self.play_computations += 1
            played = play_mod.play_steps(env, agent, seed=seed, ceiling=flags["ceiling"], fields=flags["fields"])
            doc = {"key": key, "version": PLAY_CACHE_VERSION, "episode": self._episode_json(ep, env, origin, tiles, budget),
                   "play": played, "computed_utc": _iso(time.time()), "compute_s": round(time.perf_counter() - t0, 2),
                   "known_limits": _known_limits(env), "protocol": _protocol(env)}
            self._write_cached(doc, sub="plays")
            origin_cache = "computed for this request"
        with self._lock:
            self._plays[key] = doc
            while len(self._plays) > REFERENCE_MEMORY:
                self._plays.pop(next(iter(self._plays)))
        return {
            "play_id": "play-" + key[:12],
            "data": self.source_label,
            "source": {"play": "backend/env/play.py", "routes": "backend/server_next_look.py"},
            "rule": ("a round of its own: it holds the hidden rows its own looks revealed and scores computed against "
                     "the hidden rows (play.computed_against_hidden_rows); ask for it apart from a person's round on "
                     "the same episode, or after it"),
            "episode": doc["episode"],
            "play": doc["play"],
            "play_cache": {"from": origin_cache, "computed_utc": doc.get("computed_utc"), "compute_s": doc.get("compute_s")},
            "known_limits": doc.get("known_limits") or _known_limits(),
            "protocol": doc.get("protocol") or _protocol(),
        }


def _play_module() -> Any:
    try:
        from backend.env import play
    except ImportError as exc:
        raise RoundNotFound("the step by step play (backend/env/play.py) is not in this build") from exc
    return play


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
        "reward": t.get("reward"),
        "empty_look": t.get("empty_look"),
        "episodes": t.get("episodes"),
        "mean_start_score": t.get("mean_start_score"),
        "mean_gain": {names[k]: v.get("mean_gain") for k, v in agents.items() if k in names},
        "mean_final": {names[k]: v.get("mean_final") for k, v in agents.items() if k in names},
        "plainly": t.get("plainly"),
        "from": f"{FITTED_FILE.relative_to(FITTED_FILE.parents[3])}, test_protocol_2, generated {doc.get('generated_utc')}",
    }


def validation_reference() -> dict[str, Any] | None:
    """The reference players under the reward in use on the validation episodes, from the tracked file."""
    from backend.env.policy import FITTED_FILE, load_fitted

    doc = load_fitted() or {}
    v = doc.get("validation_reference")
    if not v:
        return None
    keep = ("what", "reward", "schedule", "spending", "score", "tiles", "budget", "random_seeds", "mean_start_score",
            "looks_per_episode", "agents", "constant_tiles_mean_gain", "differences", "plainly")
    out = {k: v.get(k) for k in keep if k in v}
    out["episodes"] = {k: (v.get("episodes") or {}).get(k) for k in ("validation", "validation_keys")}
    out["from"] = f"{FITTED_FILE.relative_to(FITTED_FILE.parents[3])}, validation_reference, generated {doc.get('generated_utc')}"
    return out


def _known_limits(env: Any = None) -> str:
    """The limits of the schedule the environment played (a round on the pass list and one on nominal looks differ)."""
    if env is not None and getattr(env, "known_limits", None):
        return str(env.known_limits)
    from backend.env import KNOWN_LIMITS

    return KNOWN_LIMITS


def _protocol(env: Any = None) -> dict[str, Any]:
    """The protocol the environment played under: version 3 on a window with a cached pass list, 2 on nominal looks."""
    from backend.env.policy import load_fitted

    proto = getattr(env, "protocol", None) if env is not None else None
    if not proto:
        try:  # the environment's own name for the protocol it plays under
            from backend.env.next_look import PROTOCOL as proto
        except ImportError:  # pragma: no cover
            from backend.eval.blind_test import PROTOCOL as proto
    note = ((load_fitted() or {}).get("test_protocol_2") or {}).get("note")
    return {"version": proto["version"], "name": proto["name"], "note": note,
            "note_is_about": "the recorded table on the test episodes (test_episodes)"}
