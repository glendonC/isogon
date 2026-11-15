"""The page's entry point when the backend runs in the visitor's browser (Python compiled to WebAssembly, with numpy
and Pillow), with no server, no HTTP and no store.

It calls the functions the server's routes call, unchanged. A held-out run is `load_region_terrain` with no
network, then `solve_real_reconstruction` and `real_response`, its first answer withheld by `withhold_scorer_keys`
as the route withholds it. The reveal is the same answer whole, from the run kept here.

What is not computed here is read from files made at build time. Nothing here fetches, starts a thread or reads a
key, and no module of the server is imported. Every import is made inside the function that needs it, so loading
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


def held_out_run(region_id: str, start: str, estimate: str | None = "challenger", **solve: Any) -> dict[str, Any]:
    """The first answer of a held-out run of a place from a date, as `POST /api/reconstruct` gives it with
    `{"source": "firms", "region_id", "start", "holdout_viirs": true}`: the scorer's keys withheld until the reveal.

    - `estimate`: who answers the held-out passes, `"challenger"` (the second model, the default here) or `"in_use"`.
    - `solve`: passed on to `solve_real_reconstruction` (the page passes none).

    A window the closed rule closes is refused by the run itself (`ClosedWindow`), as on the server. The run's assets
    are not routes here: `pictures(run_id)` gives their bytes."""
    from backend.model.calendar_ratio import ratio_inputs_calendar, ratio_inputs_dir
    from backend.model.real_run import real_response, solve_real_reconstruction
    from backend.model.withhold import withhold_scorer_keys
    from backend.terrain.live_region import load_region_terrain, resolve_region_request

    # the calendar's ratio from the place's small file of its inputs, made at build time, where there is one: the
    # same ratio, without the place's yearly extracts
    if "firms_calendar" not in solve and (ratio_inputs_dir() / f"{region_id}.json").is_file():
        solve["firms_calendar"] = ratio_inputs_calendar()
    terrain = load_region_terrain(resolve_region_request(region_id=region_id), allow_network=False)
    solved = solve_real_reconstruction(terrain, str(start), holdout_viirs=True, estimate=estimate, **solve)
    _keep(solved)
    return withhold_scorer_keys(real_response(solved, {}), reveal_with=REVEAL_HERE)


def reveal(run_id: str) -> dict[str, Any]:
    """The whole answer of a held-out run asked for here, with what the scorer wrote: the route's answer with
    `"reveal": true`."""
    from backend.model.real_run import real_response

    return real_response(_solved(run_id), {})


def pictures(run_id: str) -> dict[str, bytes]:
    """The bytes the server serves as a run's assets: the 24 frames of the estimate (`reconstruction_u8.bin`), the
    belief between passes (`belief_u8.bin`), and the GeoJSON and CSV exports. Their layouts are in the answer's
    `encoding` and `belief_frames` blocks."""
    solved = _solved(run_id)
    return {"reconstruction_u8.bin": solved.reconstruction_u8_bytes, "belief_u8.bin": solved.belief_u8_bytes,
            "export.geojson": solved.export_geojson_bytes, "export.csv": solved.export_csv_bytes}


# ----------------------------------------------------------------------------------------------------------------
# The files a held-out run of a place reads here, from the code: what the build puts in the browser's file system
# ----------------------------------------------------------------------------------------------------------------

# Days the frames of a run may take after its search for a first pass; the years touched are those of the search,
# with this margin, so a list may hold a year more than a run reads, never less.
_TAIL_S: float = 10.0 * 86400.0


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
    - the place's file of the calendar's monthly counts (`backend.model.calendar_ratio.write_ratio_inputs`);
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
    from backend.model.calendar_ratio import ratio_inputs_dir
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
    out.append(ratio_inputs_dir() / f"{region_id}.json")
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
    return sorted({str(p.resolve().relative_to(root)) for p in out if p.is_file()})


if __name__ == "__main__":
    import json
    import sys

    # python3 -m backend.browser files <region> <start>: the data files of a held-out run, and the Python files
    if len(sys.argv) == 4 and sys.argv[1] == "files":
        print(json.dumps({"region_id": sys.argv[2], "start": sys.argv[3], "data": files_for_a_run(sys.argv[2], sys.argv[3]),
                          "python": python_files()}, indent=1))
    else:
        raise SystemExit("usage: python3 -m backend.browser files <region> <start>")
