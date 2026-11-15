"""The page's entry point when the backend runs in the visitor's browser (Python compiled to WebAssembly, with numpy
and Pillow), with no server, no HTTP and no store.

It calls the functions the server's routes call, unchanged. A held-out run is `load_region_terrain` with no
network, then `solve_real_reconstruction` and `real_response`, its first answer withheld by `withhold_scorer_keys`
as the route withholds it. The reveal is the same answer whole, from the run kept here.

What is not computed here is read from files made at build time. Nothing here fetches, starts a thread or reads a
key. Neither a run nor a round imports the server's HTTP module (`backend/server.py`): both ask the server's own
closed rule and words (`backend.server_next_look.refuse_if_closed`), and a round uses its round store there. Every import is made inside the function that needs it, so loading
this module costs nothing.

The hidden rows are in the visitor's files. They are kept from the estimate and from the first answer by the same
code path as on the server, the sealed box opened by the scorer alone, not by their absence. The leak check is the
backend's own tests.
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Any

# How the reveal is asked for here
REVEAL_HERE: str = "backend.browser.reveal(run_id), with the run_id of the first answer"
# What an answer made here says of its digests: they are this build's, and a seal the server made is not checked here
DIGESTS_HERE: dict[str, Any] = {
    "made_by": "this build of the numbers (numbers_built_by)",
    "a_server_seal_checked_here": False,
    "why": ("a digest is of the bytes one build of numpy gives, and the server's build is not this one; its seals are "
            "checked where they were made. An answer made here is compared with the server's figure by figure within "
            "0.08 percent, its classes, flags and words exactly (compare_with)"),
}
# Solved runs kept for their reveal and their pictures, the least recently asked dropped first
MAX_RUNS: int = 4
_RUNS: "OrderedDict[str, Any]" = OrderedDict()


def _keep(solved: Any) -> None:
    _RUNS[solved.run_id] = solved
    _RUNS.move_to_end(solved.run_id)
    while len(_RUNS) > MAX_RUNS:
        _RUNS.popitem(last=False)


def _solved(run_id: str) -> Any:
    try:
        solved = _RUNS[run_id]
    except KeyError:
        raise LookupError(f"no run {run_id} is kept here: ask held_out_run again") from None
    _RUNS.move_to_end(run_id)
    return solved


# The days a run's frames may take after its first overpass when its window is not known: the server's route's own
# figure (`backend/server.py`, RUN_TAIL_S), named here so that the server is not imported
RUN_TAIL_S: float = 15.0 * 86400.0


def refuse_if_closed_here(region_id: str, start: str) -> None:
    """Refuse a run or a round here before anything is read, by the server's own rule and words.

    - A start whose reach meets a closed window is refused by `backend.server_next_look.refuse_if_closed` (over
      `backend.model.training.closed_for`). The reach is the whole span a run from `start` may take: the 30 days of
      its search and the days its frames may take after it. The server's route asks the same span where it cannot
      find the run's window, and here it never can, since no row of a closed window is packed.
    - A place the page replays only (`backend.browser_pack.REPLAY_ONLY`: its fire on the page is a closed test fire)
      is refused whatever the start, since none of its files is packed.

    Raises `ClosedWindow`."""
    from backend.browser_pack import REPLAY_ONLY
    from backend.model.real_run import SEARCH_S, parse_start_s
    from backend.server_next_look import ClosedWindow, refuse_if_closed
    from backend.terrain.live_region import PRESET_BY_ID

    t0 = parse_start_s(str(start))
    b = PRESET_BY_ID[region_id].bbox
    refuse_if_closed((float(b.west), float(b.south), float(b.east), float(b.north)), t0, t0 + SEARCH_S + RUN_TAIL_S)
    if region_id in REPLAY_ONLY:
        raise ClosedWindow(f"{region_id} is replayed only on this page, not computed here: {REPLAY_ONLY[region_id]}")

def held_out_run(region_id: str, start: str, estimate: str | None = "challenger", **solve: Any) -> dict[str, Any]:
    """The first answer of a held-out run of a place from a date, as `POST /api/reconstruct` gives it with
    `{"source": "firms", "region_id", "start", "holdout_viirs": true}`: the scorer's keys withheld until the reveal.

    - `estimate`: who answers the held-out passes, `"challenger"` (the second model, the default here) or `"in_use"`.
    - `solve`: passed on to `solve_real_reconstruction` (the page passes none).

    A start whose reach meets a closed window, and a place replayed only, are refused before anything is read
    (`refuse_if_closed_here`, `ClosedWindow`). The run's assets are not routes here: `pictures(run_id)` gives
    their bytes."""
    from backend.model.real_run import real_response, solve_real_reconstruction
    from backend.model.withhold import withhold_scorer_keys
    from backend.terrain.live_region import load_region_terrain, resolve_region_request

    refuse_if_closed_here(region_id, start)
    # the calendar the second baseline's ratio reads answers from the place's calendar file where the place's yearly
    # extracts are not all there, as here (backend/firms/calendar_pack.py)
    terrain = load_region_terrain(resolve_region_request(region_id=region_id), allow_network=False)
    solved = solve_real_reconstruction(terrain, str(start), holdout_viirs=True, estimate=estimate, **solve)
    _keep(solved)
    return {**withhold_scorer_keys(real_response(solved, {}), reveal_with=REVEAL_HERE), "digests": DIGESTS_HERE}


def reveal(run_id: str) -> dict[str, Any]:
    """The whole answer of a held-out run asked for here, with what the scorer wrote: the route's answer with
    `"reveal": true`."""
    from backend.model.real_run import real_response

    return {**real_response(_solved(run_id), {}), "digests": DIGESTS_HERE}


def compare_with(other: dict[str, Any], answer: dict[str, Any]) -> dict[str, Any]:
    """Whether an answer made here and another made by another build of the numbers (the server's, a recording's)
    agree as two builds can: figures within 0.08 percent, words, flags and counts exactly, digests not compared
    (`backend.model.numbers_build.agree_within`). What differs by design is left out: the build itself, the note on
    digests, how the reveal is asked for, and the wall clock times. A digest made elsewhere is never claimed as
    checked here."""
    import copy

    from backend.model.numbers_build import agree_within

    def comparable(doc: dict[str, Any]) -> dict[str, Any]:
        doc = copy.deepcopy({k: v for k, v in doc.items() if k not in ("numbers_built_by", "digests")})
        (doc.get("hidden_rows") or {}).pop("reveal_with", None)
        for stage in doc.get("pipeline_stages") or []:
            stage.pop("duration_ms", None)
        return doc

    return agree_within(comparable(other), comparable(answer))


def pictures(run_id: str) -> dict[str, bytes]:
    """The bytes the server serves as a run's assets: the 24 frames of the estimate (`reconstruction_u8.bin`), the
    belief between passes (`belief_u8.bin`), and the GeoJSON and CSV exports. Their layouts are in the answer's
    `encoding` and `belief_frames` blocks."""
    solved = _solved(run_id)
    return {"reconstruction_u8.bin": solved.reconstruction_u8_bytes, "belief_u8.bin": solved.belief_u8_bytes,
            "export.geojson": solved.export_geojson_bytes, "export.csv": solved.export_csv_bytes}



# ----------------------------------------------------------------------------------------------------------------
# A round of the game: the server's own rounds (`backend.server_next_look.NextLookRounds`), the reference players read
# from a file made at build time, since they cannot be played here in time (tens of seconds, in threads)
# ----------------------------------------------------------------------------------------------------------------

_ROUNDS: Any = None


def rounds() -> Any:
    """The rounds held here: the server's round store, with no reference players computed and no disk cache, so
    nothing starts a thread. Replace it (`set_rounds`) to change its settings."""
    global _ROUNDS
    if _ROUNDS is None:
        from backend.server_next_look import NextLookRounds

        _ROUNDS = NextLookRounds(reference=False, reference_cache_dir=None)
    return _ROUNDS


def set_rounds(store: Any) -> None:
    global _ROUNDS
    _ROUNDS = store


def reference_dir() -> "Any":
    """Where the build writes the reference players' file of each round the page offers (not tracked)."""
    from backend.firms.archive import FIRMS_CACHE_DIR

    return FIRMS_CACHE_DIR.parent / "next_look_reference" / "browser"


def reference_key(ep: Any, terrain: Any, tiles: tuple[int, int], budget: int, random_seeds: int) -> str:
    """The name of a reference file: the episode's rows, box and window and its terrain
    (`backend.server_next_look.episode_digest`), the tiles, the budget, the random seeds. The server's own key also
    holds the pass files' times on disk and the code's digest, which a browser's file system does not keep."""
    import hashlib
    import json

    from backend.server_next_look import REFERENCE_CACHE_VERSION, episode_digest

    parts = {"version": REFERENCE_CACHE_VERSION, "episode": episode_digest(ep, terrain), "tiles": [int(tiles[0]), int(tiles[1])],
             "budget": int(budget), "random_seeds": int(random_seeds)}
    return hashlib.sha256(json.dumps(parts, sort_keys=True).encode("utf-8")).hexdigest()


def write_round_reference(region_id: str, start: str | None = None, episode: str | None = None, tiles: Any = None,
                          budget: int | None = None, out_dir: Any = None, store: Any = None) -> "Any":
    """At build time, natively: play every reference player on the round's episode, as the server does
    (`NextLookRounds._reference`), and write them to the file the page reads when the round ends."""
    import json
    from pathlib import Path

    from backend.server_next_look import DEFAULT_BUDGET, NextLookRounds, _tiles

    st = store or NextLookRounds(reference=False, reference_cache_dir=None)
    tl, bd = _tiles(tiles), int(DEFAULT_BUDGET if budget is None else budget)
    ep, _origin = st._episode(region_id, episode, start)
    terrain = st._terrain(ep)
    key = reference_key(ep, terrain, tl, bd, st.reference_seeds)
    doc = {"key": key, "episode": ep.key, "tiles": list(tl), "budget": bd, "random_seeds": st.reference_seeds,
           "made": "at build time, natively, by the server's own reference players (backend/server_next_look.py)",
           "reference": st._reference(ep, tl, bd, terrain)}
    out = Path(out_dir) if out_dir is not None else reference_dir()
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{key}.json"
    path.write_text(json.dumps(doc, allow_nan=False) + "\n", encoding="utf-8")
    return path


def _with_reference(round_id: str, out: dict[str, Any], ref_dir: Any = None) -> dict[str, Any]:
    """Give a round that is over its reference players from the build's file, when the file is that of this
    episode, terrain, tiles, budget and seeds; never before the round is over (they were played with the hidden
    rows: the oracle reads them)."""
    import json
    from pathlib import Path

    end = out.get("end")
    if not out.get("done", True) or not isinstance(end, dict) or end.get("reference") is not None:
        return out
    st = rounds()
    rnd = st._get(round_id)
    key = reference_key(rnd.episode, st._terrain(rnd.episode), rnd.tiles, rnd.budget, st.reference_seeds)
    path = Path(ref_dir if ref_dir is not None else reference_dir()) / f"{key}.json"
    if not path.is_file():
        end["reference_status"] = "not here: no file of the reference players was made for this round at build time"
        return out
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("key") != key:
        end["reference_status"] = "not here: the file found is of another round"
        return out
    end["reference"] = doc["reference"]
    end["reference_status"] = "ready"
    end["reference_cache"] = {"from": "a file made at build time", "key": key,
                              "keyed_on": ("the episode's rows, box and window, its terrain, the tiles, the budget and "
                                           "the random seeds")}
    return out


def round_start(region_id: str, start: str | None = None, episode: str | None = None, tiles: Any = None,
                budget: int | None = None, seed: int = 0) -> dict[str, Any]:
    """A round's start, as `POST /api/env/next_look/reset` gives it: `start` (a UTC date) or `episode` (a key of
    the catalogue), with the tiles, the budget and the seed."""
    from backend.browser_pack import REPLAY_ONLY
    from backend.server_next_look import ClosedWindow

    if start is not None:
        refuse_if_closed_here(region_id, start)
    elif region_id in REPLAY_ONLY:
        raise ClosedWindow(f"{region_id} is replayed only on this page, not computed here: {REPLAY_ONLY[region_id]}")
    body: dict[str, Any] = {"region_id": region_id, "seed": int(seed)}
    if start is not None:
        body["start"] = str(start)
    if episode is not None:
        body["episode"] = str(episode)
    if tiles is not None:
        body["tiles"] = tiles
    if budget is not None:
        body["budget"] = int(budget)
    out = rounds().reset(body)
    out["reference_status"] = "read from a file made at build time; given when the round ends"
    return out


def round_look(round_id: str, decision: int, action: int, ref_dir: Any = None) -> dict[str, Any]:
    """One look of a round, as `POST /api/env/next_look/step` gives it: the tile to look at on the current decision,
    or -1 for no look. The last look ends the round, with its reveal and its reference players."""
    out = rounds().step({"round_id": round_id, "decision": int(decision), "action": int(action)})
    return _with_reference(round_id, out, ref_dir) if out.get("done") else out


def round_state(round_id: str, ref_dir: Any = None) -> dict[str, Any]:
    """A round's state, as `GET /api/env/next_look/state` gives it."""
    out = rounds().state(round_id)
    return _with_reference(round_id, out, ref_dir) if out.get("done") else out


# ----------------------------------------------------------------------------------------------------------------
# The files a held-out run of a place reads here, from the code: what the build puts in the browser's file system
# ----------------------------------------------------------------------------------------------------------------

# Days the frames of a run may take after its search for a first pass; the years touched are those of the search,
# with this margin, so a list may hold a year more than a run reads, never less.
_TAIL_S: float = 10.0 * 86400.0


def _relative(path: Any, root: Any) -> str:
    """A path relative to the repository, without following links: a build tree may link its cache from elsewhere,
    and the path the code names is the one the browser's file system holds. A path outside the tree is refused."""
    import os

    rel = os.path.relpath(os.path.abspath(str(path)), os.path.abspath(str(root)))
    if rel == ".." or rel.startswith(".." + os.sep) or os.path.isabs(rel):
        raise ValueError(f"{path} is outside the repository {root}")
    return rel


def python_files() -> list[str]:
    """Every Python file of the backend a page may import here: all but the tests, relative to the repository."""
    from pathlib import Path

    root = Path(__file__).resolve().parent.parent
    return sorted(str(p.relative_to(root)) for p in (root / "backend").rglob("*.py") if "tests" not in p.parts)


def files_for_a_run(region_id: str, start: str) -> list[str]:
    """Every data file a held-out run of `region_id` from `start` reads here, the second model answering, the
    calendar's ratio read from the place's file (relative to the repository; a file the cache lacks is left out,
    as the run does without it):

    - the tracked fitted values and the challenger's bundles;
    - the rows of the years the run's search and frames touch, and their manifests;
    - the place's calendar file, which the calendar answers from where the yearly extracts are not all there
      (`backend.firms.calendar_pack`), named whether or not the build has made it yet;
    - the pass files of those years;
    - the terrain the run loads: the place's DEMs, picture and metadata, and the zoom 11 elevation tiles the
      challenger reads for the run's box when every one of them is cached.

    `backend/tests/test_browser_files.py` runs a held-out run and fails when it opens a file this list lacks."""
    import json
    from pathlib import Path

    import numpy as np

    from backend.eval.grid import EvalGrid
    from backend.firms import cmr_passes as CP
    from backend.firms.archive import FIRMS_CACHE_DIR, LISTING_NAME
    from backend.firms.places import PLACES_FILE
    from backend.model import fitted as FT
    from backend.firms.calendar_pack import pack_path
    from backend.model.challenger import FITTED_DIR as CHALLENGER_DIR, VARIANT_FILES, default_variant
    from backend.model.challenger.methods import DEFAULT_POINTER_FILE
    from backend.model.challenger_standing import PLAN_FILE
    from backend.model.real_run import PAD_S, SEARCH_S, parse_start_s
    from backend.terrain.live_region import HIRES_REGION_CACHE_DIR, PRESET_BY_ID, region_cache_stem
    from backend.terrain.projections import BoundingBox, tile_bounds_for_bbox
    from backend.terrain.tile_store import TERRARIUM, TILE_SIZE, TileStore

    root = Path(__file__).resolve().parent.parent
    t0 = parse_start_s(str(start))
    years = sorted({int(str(np.datetime64(int(t), "s"))[:4]) for t in (t0 - PAD_S, t0 + SEARCH_S + _TAIL_S)})
    years = list(range(years[0], years[-1] + 1))
    out: list[Path] = [FT.FITTED_DIR / FT.PARAMS_FILE, FT.FITTED_DIR / FT.RATIO_FILE, PLAN_FILE, PLACES_FILE,
                       CHALLENGER_DIR / DEFAULT_POINTER_FILE]
    bundle = CHALLENGER_DIR / VARIANT_FILES[default_variant()]
    out.append(bundle)
    out += [CHALLENGER_DIR / name for name in (json.loads(bundle.read_text(encoding="utf-8")).get("component_files") or {}).values()]
    out.append(FIRMS_CACHE_DIR / "listing" / LISTING_NAME)
    extract = FIRMS_CACHE_DIR / "extract" / region_id
    for y in years:
        out += sorted(extract.glob(f"*_{y}.csv")) + sorted(extract.glob(f"*_{y}.csv.manifest.json"))
        out += sorted((CP.CMR_CACHE_DIR / "passes" / region_id).glob(f"*_{y}.json.gz"))
    spec = PRESET_BY_ID[region_id]
    stem = region_cache_stem(spec)
    out += [HIRES_REGION_CACHE_DIR / f"{stem}_{s}" for s in ("dem_256_f32.bin", "dem_512_f32.bin", "sat_2048.jpg", "meta.json")]
    b = spec.bbox
    g = EvalGrid.from_bbox((b.west, b.south, b.east, b.north))
    bounds = tile_bounds_for_bbox(BoundingBox(g.west, g.south, g.east, g.north), zoom=11, tile_size=TILE_SIZE, margin_px=2.0)
    store = TileStore(allow_network=False)
    tiles = [store.tile_path(TERRARIUM, 11, tx, ty) for ty in range(bounds.ty_min, bounds.ty_max + 1)
             for tx in range(bounds.tx_min, bounds.tx_max + 1)]
    if bounds.total_tiles <= 64 and all(p.is_file() and p.stat().st_size > 64 for p in tiles):
        out += tiles
    named = {_relative(p, root) for p in out if p.is_file()}
    named.add(_relative(pack_path(region_id), root))
    return sorted(named)



def files_for_a_round(region_id: str, start: str, tiles: Any = None, budget: int | None = None,
                      store: Any = None) -> list[str]:
    """Every data file a round of `region_id` from `start` reads here, beside a run's
    (`files_for_a_run`): the learned player's policy, the manifest of every extract of the place (the round keys its
    episodes on them, `region_rows_digest`), the round's context DEM, and the reference players' file of this
    round's episode, tiles, budget and seeds (`write_round_reference`). Making the list builds the episode, so it is
    made at build time, natively."""
    from pathlib import Path

    from backend.env.policy import FITTED_FILE
    from backend.env.terrain import CACHE_DIR, CONTEXT_SIZE
    from backend.firms.archive import FIRMS_CACHE_DIR
    from backend.server_next_look import DEFAULT_BUDGET, _tiles

    root = Path(__file__).resolve().parent.parent
    st = store or rounds()
    tl, bd = _tiles(tiles), int(DEFAULT_BUDGET if budget is None else budget)
    ep, _origin = st._episode(region_id, None, str(start))
    key = reference_key(ep, st._terrain(ep), tl, bd, st.reference_seeds)
    out = [FITTED_FILE, reference_dir() / f"{key}.json"]
    out += sorted((FIRMS_CACHE_DIR / "extract" / region_id).glob("*.csv.manifest.json"))
    out += sorted(CACHE_DIR.glob(f"{region_id}_*_context_dem_{CONTEXT_SIZE}_f32.bin"))
    extra = {_relative(p, root) for p in out if p.is_file()}
    # the reference file is named even before the build has made it
    extra.add(_relative(reference_dir() / f"{key}.json", root))
    return sorted(set(files_for_a_run(region_id, start)) | extra)

PACK_LIST_VERSION: int = 1


def prepare(region_id: str, start: str) -> list[str]:
    """At build time, natively, where the place's full extracts are: write the two files a place needs here that the
    cache does not hold, its calendar file (`backend.firms.calendar_pack.build`) and the reference players of its
    round from `start` with the default tiles and budget. A window the closed rule closes is refused, as on the
    server, and its round's file is not written."""
    from pathlib import Path

    from backend.firms.calendar_pack import build, pack_path

    refuse_if_closed_here(region_id, start)
    root = Path(__file__).resolve().parent.parent
    build(region_id)
    made = [pack_path(region_id), write_round_reference(region_id, start=start)]
    return [_relative(p, root) for p in made]


def pack_list(places: dict[str, str]) -> dict[str, Any]:
    """The list the build packs: for each
    place and its start, the Python files a page may import and every data file a held-out run and a round read
    there, relative to the repository. Files under backend/ and files every place names go in the shared pack. Each
    place says whether it is `packed` or `replay only` (a place the page replays, or a start whose reach meets a
    closed window: `refuse_if_closed_here`), and a place replayed only names no file."""
    from backend.server_next_look import ClosedWindow

    py = python_files()
    out: dict[str, Any] = {}
    for r, s in places.items():
        try:
            refuse_if_closed_here(r, s)
        except ClosedWindow as exc:
            out[r] = {"start": s, "status": "replay only", "why": str(exc), "modules": [], "files": []}
            continue
        out[r] = {"start": s, "status": "packed", "modules": py, "files": files_for_a_round(r, s)}
    return {"version": PACK_LIST_VERSION, "places": out}


if __name__ == "__main__":
    import json
    import sys

    usage = ("usage: python3 -m backend.browser files <region> <start>\n"
             "       python3 -m backend.browser prepare <region>=<start> ...\n"
             "       python3 -m backend.browser pack-list <out.json> <region>=<start> ...")
    if len(sys.argv) == 4 and sys.argv[1] == "files":
        # the data files of a held-out run, and the Python files
        print(json.dumps({"region_id": sys.argv[2], "start": sys.argv[3], "data": files_for_a_run(sys.argv[2], sys.argv[3]),
                          "python": python_files()}, indent=1))
    elif len(sys.argv) >= 3 and sys.argv[1] == "prepare":
        for arg in sys.argv[2:]:
            region, start = arg.split("=", 1)
            print(json.dumps({"region_id": region, "start": start, "written": prepare(region, start)}))
    elif len(sys.argv) >= 4 and sys.argv[1] == "pack-list":
        doc = pack_list(dict(arg.split("=", 1) for arg in sys.argv[3:]))
        from pathlib import Path

        Path(sys.argv[2]).write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {sys.argv[2]}: {len(doc['places'])} places")
    else:
        raise SystemExit(usage)
