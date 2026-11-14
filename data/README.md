# Local data

This folder holds one tracked reference file, `datasets.json`, and the local cache, `data/cache/`, that Isogon's tools fill and git ignores. Read this to know what is on disk under `data/`, which tool writes each part, and how a cached file can be traced to its source.

Where the data comes from and what it can say is in [`docs/data.md`](../docs/data.md).

## The cache

Nothing under `data/cache/` is tracked. A fresh clone has no cache and still runs: the backend then serves simulated runs only.

| Path | Written by | Holds |
| --- | --- | --- |
| `cache/firms/listing/` | `backend/firms/archive.py` | NASA's list of country files and its attribute readme, as downloaded |
| `cache/firms/raw/<product>/<year>/<product>_<year>_<Country>.csv` | `backend/firms/archive.py` | Each FIRMS country yearly file exactly as downloaded |
| `cache/firms/area/<region>/<SOURCE>/<YYYY-MM-DD>_<n>d.csv` | `backend/firms/area_api.py` | Each area API reply exactly as returned (at most five days) |
| `cache/firms/extract/<region>/<product>_<year>.csv` | both | The rows inside the region's context box, every original column, duplicates removed. This is what `read_firms` reads. |
| `cache/firms/derived/` | `backend/server.py` | The start dates worth showing per region, kept until the rows or the rule change |
| `cache/cmr/raw/<region>/<platform>/<YYYY-MM>_p<n>.json.gz` | `backend/firms/cmr_passes.py` | Each NASA CMR reply, compressed |
| `cache/cmr/passes/<region>/<platform>_<year>.json.gz` | `backend/firms/cmr_passes.py` | The passes of a year, compact and deduplicated. This is what `cmr_passes` reads. |
| `cache/tiles/<source>/<z>/<x>/<y>.<ext>` | `backend/terrain/tile_store.py` | Elevation and imagery tiles: `terrarium`, `esri_world_imagery`, `usgs_naip`, `eox_s2cloudless_2020` |
| `cache/hires_regions/` | `backend/terrain/live_region.py`, `backend/terrain/terrain_pack.py` | Per region: the 256 and 512 elevation grids, a 2048 pixel image, and the terrain pack with its context terrain |

Every downloaded file and every extract has a manifest beside it, `<file>.manifest.json`, with the source URL, the query, the retrieval time, the byte count, the SHA-256, the row count, the columns and the lineage. A FIRMS key never appears in one: stored URLs carry `<MAP_KEY>` in its place.

## Filling it

Run from the repository root.

```bash
# 1. FIRMS country yearly files and the regions' extracts (no key)
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.archive fetch --years 2000-2025

# 2. NASA's list of passes (no key)
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.cmr_passes fetch --first 2012-01 --last 2025-12

# 3. Terrain packs and context terrain for the three regions with FIRMS rows
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.terrain.terrain_pack build plumas_ca lytton_bc evia_greece
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.terrain.terrain_pack context

# 4. Optional, needs FIRMS_MAP_KEY in .env: NOAA-21 and recent days from the area API
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.area_api --env-file .env status
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.area_api --env-file .env fetch --sources VIIRS_NOAA21 --start 2023-01-01
```

`archive status` and `cmr_passes status` print what the cache holds.

The cache is not meant to be shared as it is. Tiles from Esri World Imagery are published for viewing, not for export; see [`docs/sources.md`](../docs/sources.md).

## `datasets.json`

A reference list of 15 NASA and related products: the FIRMS sources with their area API codes and CMR collection ids, the CMR granule search, gridded fire products, GIBS layers and the reference paper for the detection law. It also records how FIRMS counts area API transactions. No code reads this file; the identifiers the code uses are in `backend/firms/`.
