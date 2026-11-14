# Local data directory

This directory holds a static dataset reference file (`data/datasets.json`) and the untracked local cache tree (`data/cache/`) populated by Isogon's ingestion and terrain tools. Developers and researchers read this file to understand what lives on disk under `data/`, how sidecar manifests verify cached files, and which commands populate each subdirectory.

## Cache subdirectories

All downloaded observations, granule schedules, map tiles, and baked terrain packs are written under `data/cache/` (git-ignored). Fresh clones run without `data/cache/` by falling back to tracked static bundles under `website/public/generated/`; see [docs/data.md](../docs/data.md).

- `data/cache/firms/`: Cached NASA FIRMS active-fire CSVs and JSON sidecar manifests:
  - `listing/`: Cached `yearly_summary_files.txt` and `AttributesReadme.txt` plus `.manifest.json` sidecars.
  - `raw/<product>/<year>/<product>_<year>_<Country>.csv`: Raw annual country archives fetched without an API key by `backend/firms/archive.py` (`modis`, `viirs-snpp`, `viirs-jpss1`).
  - `area/<region_id>/<source>/`: Raw 5-day Area API CSV chunks fetched with `FIRMS_MAP_KEY` by `backend/firms/area_api.py` (with the key redacted to `<MAP_KEY>` in stored metadata).
  - `extract/<region_id>/<product>_<year>.csv`: Deduplicated regional extracts clipped to each region's 5x context box, paired with `<product>_<year>.csv.manifest.json` recording source URL, byte length, SHA-256 digest, row counts, and version counts.
  - `derived/`: Cached per-region real-run start lists keyed by data count and rule digest.
- `data/cache/cmr/`: Keyless NASA Common Metadata Repository (`granules.json`) schedules written by `backend/firms/cmr_passes.py`:
  - `raw/<region_id>/<platform>/YYYY-MM_pN.json.gz` and `.json.gz.manifest.json`: Compressed paged granule responses and SHA-256 manifests for `MOD14`, `MYD14`, `VNP14IMG`, `VJ114IMG`, and `VJ214IMG`.
  - `passes/<region_id>/<platform>_<year>.json.gz`: Deduplicated annual overpass intervals, great-circle-densified swath polygons, and `MODIS` granule cloud cover.
- `data/cache/tiles/`: Raw `256 x 256` Web-Mercator elevation and imagery tiles (`<source>/<z>/<x>/<y>.<ext>`) cached by `TileStore` in `backend/terrain/tile_store.py` (`terrarium`, `esri_world_imagery`, `eox_s2cloudless_2020`, `usgs_naip`).
- `data/cache/hires_regions/`: Stitched regional terrain packs (`tpack1` tiers with manifest JSON files) built by `backend/terrain/terrain_pack.py`, plus compact per-region DEM and imagery rasters written by `backend/terrain/live_region.py`.

## Populating caches from the command line

Run commands from the repository root using Python 3.12 with `numpy` and `Pillow`:

```bash
# 1. Keyless annual FIRMS country archives and regional context extracts
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.archive fetch --years 2000-2025

# 2. Check live FIRMS Area API key status and availability (requires FIRMS_MAP_KEY in .env)
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.area_api status

# 3. Keyless NASA CMR active-fire granule pass schedules
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.cmr_passes fetch --first 2012-01 --last 2025-12

# 4. Regional elevation and orthoimagery terrain packs
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.terrain.terrain_pack build plumas_ca lytton_bc evia_greece --imagery usgs_naip
```

## Status of `data/datasets.json`

`data/datasets.json` is a static 15-entry reference catalogue summarizing upstream NASA active-fire, geolocation, cloud-mask, burned-area, elevation, and orbital specifications. No backend or frontend module reads `data/datasets.json` at runtime.
