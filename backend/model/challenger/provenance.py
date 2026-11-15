"""Input file discovery and sha256 digest provenance for challenger runs.

Records repo-relative paths, byte sizes, and sha256 digests of every cached data
file and tracked parameter file read during fitting and validation. Never touches
closed 2021 windows or any .env file.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

from backend.eval.grid import EvalGrid
from backend.firms.archive import FIRMS_CACHE_DIR, PRODUCTS, PLACES_FILE
from backend.firms.cmr_passes import CMR_CACHE_DIR
from backend.model.challenger.guard import REPO_ROOT, refuse_closed_split_years, relative_digest_entry
from backend.model.episodes import Episode
from backend.model.fitted import FITTED_DIR, PARAMS_FILE, RATIO_FILE
from backend.terrain.projections import BoundingBox, tile_bounds_for_bbox
from backend.terrain.tile_store import TERRARIUM, TILE_SIZE, TileStore


def collect_input_digests(
    train_episodes: Iterable[Episode],
    val_episodes: Iterable[Episode],
    include_terrain: bool = True,
    terrain_zoom: int = 11,
) -> list[dict[str, Any]]:
    """Return sorted list of relative_digest_entry dicts for all files read."""
    tr_list = list(train_episodes)
    va_list = list(val_episodes)
    all_eps = tr_list + va_list

    years = sorted({ep.year for ep in all_eps})
    refuse_closed_split_years(years)

    paths: set[Path] = set()

    # Tracked configuration and baseline parameter files read
    for p in (PLACES_FILE, FITTED_DIR / PARAMS_FILE, FITTED_DIR / RATIO_FILE):
        if p.is_file():
            paths.add(p.resolve())

    # FIRMS extract CSVs for regions and open years read
    region_years = sorted({(ep.region_id, ep.year) for ep in all_eps})
    for region_id, year in region_years:
        ext_dir = FIRMS_CACHE_DIR / "extract" / region_id
        for prod_key in PRODUCTS:
            csv_path = ext_dir / f"{prod_key}_{year}.csv"
            if csv_path.is_file():
                paths.add(csv_path.resolve())
        # Calendar ratio reads clean overlap years in extract (excluding 2021 and run year);
        # record the region's CMR pass files for the episode years
        cmr_dir = CMR_CACHE_DIR / "passes" / region_id
        if cmr_dir.is_dir():
            for plat in ("VIIRS_SNPP", "VIIRS_NOAA20", "VIIRS_NOAA21"):
                for y in (year - 1, year, year + 1):
                    if y == 2021:
                        continue
                    gz = cmr_dir / f"{plat}_{y}.json.gz"
                    if gz.is_file():
                        paths.add(gz.resolve())

    # Cached Terrarium DEM tiles read for episode grids
    if include_terrain:
        store = TileStore(allow_network=False)
        for ep in all_eps:
            grid = EvalGrid.from_bbox(ep.box)
            bbox = BoundingBox(grid.west, grid.south, grid.east, grid.north)
            bounds = tile_bounds_for_bbox(bbox, zoom=terrain_zoom, tile_size=TILE_SIZE, margin_px=2.0)
            tile_paths = [
                store.tile_path(TERRARIUM, terrain_zoom, tx, ty)
                for ty in range(bounds.ty_min, bounds.ty_max + 1)
                for tx in range(bounds.tx_min, bounds.tx_max + 1)
            ]
            if all(tp.is_file() and tp.stat().st_size > 64 for tp in tile_paths):
                for tp in tile_paths:
                    paths.add(tp.resolve())

    entries = [relative_digest_entry(p, REPO_ROOT) for p in paths]
    entries.sort(key=lambda d: d["path"])
    return entries
