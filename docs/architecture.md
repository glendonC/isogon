# Architecture

This document describes the runtime processes, module boundaries, file-backed storage layout, binary tensor formats, and coordinate registration contracts of Isogon. It is written for engineers and researchers reading, auditing, or extending the backend and 3D browser workspace.

## System overview

Isogon runs as two local processes with zero database dependencies, zero message queues, and a minimal Python scientific runtime (`numpy` and `Pillow` on top of the Python 3.12 standard library):

1. **Backend HTTP server (`backend/server.py`)**: `IsogonHTTPServer` (subclassing `http.server.ThreadingHTTPServer` on `127.0.0.1:8788`) serves JSON endpoints, CSV/GeoJSON exports, raw little-endian `float32` digital elevation rasters, and `uint8` multi-frame reconstruction tensors.
2. **Frontend workspace (`website/`)**: A React 19 and TypeScript 5.7 single-page application bundled with Vite 6 (`127.0.0.1:5188` in development and preview) that renders the burning-activity calendar, blind-test score tables, and a custom WebGL2 / Three.js terrain cutaway stage (`EarthCutawayStage.tsx` with `postprocessing`).

### Strict separation of real FIRMS runs and simulated runs

Two execution pipelines share the HTTP server and the 24 x 256 x 256 x 4 `uint8` tensor container without ever mixing observations or scores:

- **Real FIRMS pipeline (`source: "firms"`)**: Reads cached NASA FIRMS CSV extracts (`backend/firms/`), seals held-out detections before window selection or modeling (`backend/eval/holdout.py`), runs the 375 m forward-backward occupancy and fire radiative power filter (`backend/model/occupancy.py`, `backend/model/real_run.py`, model version `1.0.0-real-rows`), encodes intensities on a `log10` scale (`backend/model/encoding.py`), and evaluates sealed protocol v2 blind tests (`backend/eval/blind_test.py`). In `website/src/App.tsx`, any response to a `source: "firms"` request whose payload lacks `source: "firms"` is rejected rather than displayed, and synthetic cloud overrides are disabled whenever a real run is active.
- **Simulated pipeline (`source: "simulated"` or omitted)**: Synthesizes a 24-epoch terrain-coupled fire progression over any global 256 x 256 elevation grid, applies spherical-Earth MODIS and VIIRS point-spread functions and slant-path attenuation (`backend/model/sensor_physics.py`), runs a two-part Newton-IRLS logistic hurdle and pinball-IRLS quantile calibrator (`backend/model/calibrator.py`), and smooths the state with a 2D+t Rauch-Tung-Striebel filter (`backend/model/solver.py`, `backend/model/world_model.py`). Simulated runs serve regions that have no cached FIRMS extracts (such as `blue_mountains_au`, `novo_progresso_br`, gazetteer searches, and custom coordinates) and are labeled as simulated across the API and UI.

## Backend architecture

### HTTP server and in-memory store (`backend/server.py`)

`IsogonDataStore` holds precomputed fallback byte buffers from `website/public/generated/fields/`, the startup `CrossSensorCalibrator` singleton (under 80 ms fit on 1,200 synthetic paired 13:30 samples), a `TerrainPackManager`, and a thread-safe `OrderedDict` LRU cache of up to `MAX_CACHED_RUNS = 24` solved runs. At startup, the server pre-warms a baseline `plumas_ca` run and spawns a daemon thread (`warm_firms`) to build real FIRMS calendars and start-date lists for `plumas_ca`, `lytton_bc`, and `evia_greece`.

`IsogonRequestHandler` enforces three boundary guards:

- **Localhost-only CORS**: `origin_allowed` accepts `http` or `https` origins on `localhost`, `127.0.0.1`, or `[::1]` only; `POST /api/reconstruct` rejects foreign `Origin` headers with `403 Forbidden`.
- **Strict JSON and parameter parsing**: `parse_request_json` rejects `NaN`, `Infinity`, and `-Infinity` constants with `400 Bad Request` and caps `POST` bodies at 262,144 bytes (`413 Request Entity Too Large`).
- **Idle socket timeout**: Client connections time out after 60 seconds.

| Method and route | Role |
| --- | --- |
| `GET /api/health` | Service status, active model version, cached run IDs, and FIRMS cache row counts |
| `GET /api/regions` | The 5 server preset regions with default bounding boxes and spans |
| `POST /api/reconstruct` | Solves or retrieves a cached real (`source: "firms"`) or simulated run and returns metadata and asset URLs |
| `GET /api/runs/starts` | Worth-showing real FIRMS start timestamps and `default_start` for a hero region |
| `GET /api/runs/<run_id>/<asset>` | Streams `dem_f32.bin`, `dem_hires_f32.bin`, `satellite.jpg`, `reconstruction_u8.bin`, `belief_u8.bin`, `observer_passes.json`, `export.geojson`, or `export.csv` |
| `GET /api/runs/<run_id>/terrain/<name>` | Streams v1 terrain pack files (`dem_1024_f32.bin`, `ortho_8192.jpg`, `ortho_4096.jpg`, `aux_2048.png`, context rasters) with `ETag` and `304 Not Modified` support |
| `GET /api/observer` | Filters per-frame footprints by `frame` (`0..23`), `sensor`, `min_frp`, `max_zenith`, and `run_id` |
| `GET /api/calendar` | Returns the real FIRMS monthly calendar (`source=firms&region_id=...`) or simulated calendar |
| `GET /api/calendar/rows.csv` | Exports normalized FIRMS CSV rows for a region, date span, and platform filter (`X-Row-Count` header) |
| `GET /api/sensor-model` | Returns sensor geometry curves, calibrator diagnostics, and simulated `G1..G5` gate evaluations |
| `GET /api/field-meta` | Returns static field tensor metadata (`field_metadata.json`) |

Full query parameters, JSON schemas, and error payloads are documented in [`docs/api.md`](api.md).

### Package responsibilities

- **`backend/firms/`**: Real observation ingestion and monthly harmonization.
  - `archive.py` downloads public FIRMS country yearly CSVs (`modis`, `viirs-snpp`, `viirs-jpss1`) for `plumas_ca` (`United_States`), `lytton_bc` (`Canada`), and `evia_greece` (`Greece`), deduplicating rows on `(satellite, instrument, acq_date, acq_time, latitude, longitude)` into regional context-box extracts (5x test-box span).
  - `area_api.py` fetches 5-day chunks from `https://firms.modaps.eosdis.nasa.gov/api/area/` for `VIIRS_NOAA21` and post-archive dates, choosing `_SP` vs `_NRT` via `/api/data_availability`, throttling at 60% of the 5,000-transaction 10-minute limit, and redacting `FIRMS_MAP_KEY` to `<MAP_KEY>` in all stored manifests, logs, and errors.
  - `cmr_passes.py` queries unauthenticated NASA CMR (`granules.json`) by LPCLOUD collection concept ID (`MOD14`, `MYD14`, `VNP14IMG`, `VJ114IMG`, `VJ214IMG`) to cache annual pass schedules, swath-box coverage fractions, and MODIS granule cloud cover.
  - `real_calendar.py` computes `overlap_ratio_v1` monthly hotspot series (2000 to 2025), excluding `type=2` static industrial rows, `type=3` offshore sea rows (at 0 m context-DEM elevation beyond 500 m from land), and country-wide platform outage days, and runs leave-one-year-out cross-validation.
- **`backend/model/`**: Real occupancy reconstruction, parameter fitting, and simulated forward/inverse operators.
  - Real path: `platforms.py` (5-platform code registry and rotating-Earth ground-track/scan-axis geometry), `occupancy.py` (`OccupancyReconstruction` forward-backward 375 m filter with `overlap_factor` scan deduplication and smoldering state), `encoding.py` (`log10` byte codec), `belief.py` (30-minute causal forward filter), `real_run.py` and `real_blind.py` (24-overpass window selection, tensor packaging, peak-epoch GeoJSON/CSV export), `terra_morning.py` (experimental VIIRS-to-Terra direction), and `episodes.py`, `training.py`, `fit_real.py`, `fitted.py` (25-tile context-box episode discovery, 2021 test-fire exclusions, coordinate search, and tracked JSON fits under `backend/model/fitted_values/`).
  - Simulated path: `grid.py` (`TerrainGrid` covariates and ray-marched canyon visibility), `sensor_physics.py` (MODIS whiskbroom growth, VIIRS 3-zone aggregation, Sofiev and Kouznetsov 2026 detection probabilities, FFT oriented PSF convolution), `calibrator.py`, `world_model.py`, `solver.py`, `reconstruct.py`, and `gates.py`.
- **`backend/eval/`**: Sealed blind-test framework.
  - `rows.py` and `overpass.py` parse FIRMS detections and group consecutive rows per platform (20-minute gap threshold). `grid.py` implements the 375 m `EvalGrid`, oriented pixel rectangle `paint()`, and Chebyshev `dilate()`. `holdout.py` enforces `Sealed` separation. `schedule.py` generates blind `nominal_slots`. `baselines.py`, `metrics.py`, and `blind_test.py` compute the 7 evaluation metrics and 2,000-resample whole-episode bootstrap verdicts.
- **`backend/env/`**: Sequential 4 x 4 tile-selection environment (`next_look.py`, `episodes.py`, `terrain.py`, `agents.py`, `policy.py`, `learn.py`, `report.py`, and `fitted/next_look.json`) benchmarking active look selection over sealed VIIRS overpasses.
- **`backend/terrain/`**: Geospatial projection, tile caching, and 3D asset preparation.
  - `projections.py` and `resample.py` reproject Web Mercator (`EPSG:3857`) Terrarium elevation and orthoimagery mosaics onto `EPSG:4326` grids. `tile_store.py` manages rate-limited (16 requests/s, 6 workers) persistent tile caching. `live_region.py` resolves preset IDs, 18 gazetteer keyword groups, and custom coordinates into 256 x 256 and 512 x 512 DEMs plus 2048 x 2048 orthoimagery. `terrain_pack.py` builds v1 terrain packs (1024 DEM, 8192 hero or 4096 standard ortho, 2048 RGBA `aux` map, and 5x-span context terrain). `glb_tools.py` strips dangling external `.tga` texture slots from NASA `Terra.glb`.

## Storage layout and binary formats

Isogon uses flat files with SHA-256 JSON manifests rather than a database.

| Path | Tracked in git | Contents |
| --- | --- | --- |
| `backend/model/fitted_values/` | Yes | `occupancy_params.json`, `overlap_ratio.json`, `terra_morning.json` |
| `backend/env/fitted/` | Yes | `next_look.json` (tile-selection benchmark weights and scores) |
| `website/public/generated/` | Yes | Offline Feather River DEM/ortho/normals, global Blue Marble, and simulated fallback field bundle |
| `website/public/models/spacecraft/` | Yes | `terra.glb`, `aqua.glb`, `suomi_npp.glb`, and `manifest.json` |
| `data/datasets.json` | Yes | Upstream NASA and reference dataset catalog and FIRMS rate-limit formula |
| `data/cache/firms/` | No (`.gitignore`) | `raw/` country CSVs, `area/` 5-day API chunks, `extract/` deduplicated regional CSVs, `derived/` cached start lists, plus `.manifest.json` sidecars |
| `data/cache/cmr/` | No (`.gitignore`) | `raw/` gzipped CMR JSON pages and `passes/` deduplicated annual pass schedules |
| `data/cache/tiles/` | No (`.gitignore`) | XYZ source tiles under `<source>/<z>/<x>/<y>.<ext>` (`terrarium`, `esri_world_imagery`, `eox_s2cloudless_2020`, `usgs_naip`) |
| `data/cache/hires_regions/` | No (`.gitignore`) | Per-region `dem256.bin`, `dem512.bin`, `sat2048.jpg`, and `tpack1` terrain pack files |

### Binary tensor and raster specifications

- **Elevation grids (`dem_f32.bin`, `dem_hires_f32.bin`, `dem_1024_f32.bin`, `context_dem_1024_f32.bin`, `ca_dem_f32.bin`)**: C-contiguous little-endian 32-bit IEEE 754 floats (`<f4`) in meters above sea level (256 x 256 = 262,144 B; 512 x 512 = 1,048,576 B; 1024 x 1024 = 4,194,304 B). Ocean bathymetry in `live_region.py` and coastal sea posts in `terrain_pack.py` are clamped to 0.0 m while inland lakes preserve their surface elevation.
- **Reconstruction tensor (`reconstruction_u8.bin`)**: C-contiguous `uint8` array of shape `(24, 256, 256, 4)` (6,291,456 B). Channel 0 (R) is reconstructed FRP density, channel 1 (G) is uncertainty `sigma`, channel 2 (B) is observed MODIS density, and channel 3 (A) is observed VIIRS density.
  - **Simulated encoding**: Linear `uint8` mapping 0 to 80 MW/km2 onto bytes 0 to 255 for R, B, A and 0 to 24 MW/km2 onto bytes 0 to 255 for G.
  - **Real FIRMS encoding (`backend/model/encoding.py`)**: Logarithmic `uint8` mapping accompanied by a JSON `encoding` descriptor (`scale: "log10"`). Byte 0 is exact zero; bytes 1 to 255 span 0.01 to 10,000.0 MW/km2 uniformly in `log10` across all four channels (254 / 6 bytes per decade).
- **Causal belief tensor (`belief_u8.bin`, real runs only)**: C-contiguous `uint8` array of shape `(steps, ny, nx, 2)` at fixed 1,800 s (30-minute) intervals across the 375 m `EvalGrid` (`backend/model/belief.py`), using the forward filter alone so no future overpass influences step `t`. Channel 0 encodes burning probability (byte 0 = 0, bytes 1 to 255 linear on (0, 1]), and channel 1 encodes expected FRP density on the same `log10` 0.01 to 10,000.0 MW/km2 scale.
- **Terrain auxiliary map (`aux_2048.png`)**: 8-bit RGBA PNG storing true-scale unit surface normal components `r = n_x * 0.5 + 0.5` (east) and `g = n_z * 0.5 + 0.5` (south, with `n_y = sqrt(max(0, 1 - n_x^2 - n_z^2))` reconstructed in GLSL), blue-channel horizon-marched sky-view ambient occlusion (4,800 m radius across 16 azimuths), and alpha-channel canopy index. The browser decodes `aux_2048.png` via `ImageBitmapLoader` with `premultiplyAlpha: 'none'` and `colorSpaceConversion: 'none'` so zero-alpha texels preserve their RGB bytes.

## Frontend architecture

### Application state and request lifecycle (`website/src/`)

`App.tsx` coordinates landing mode and the four workspace modes (`cutaway` Sensor split, `reconstruction` 375 m field, `observer` Satellite passes, and `world` True color). Overlapping `POST /api/reconstruct` calls increment `requestSeqRef` and abort the prior `AbortController` so late responses never overwrite newer region selections. When a user selects a theater tab, `useCalendar.ts` and `content/calendar.ts` fetch `/api/calendar?region_id=<id>&source=firms`; if the backend serves a real FIRMS calendar with `real_run_starts`, `App.tsx` automatically opens `default_start` on the real path (`source: "firms"`), falling back to a labeled simulated run only for regions without FIRMS rows.

### Three.js cutaway stage and HDR pipeline (`website/src/stage/`)

`EarthCutawayStage.tsx` and `website/src/stage/engine/` implement a custom WebGL2 rendering pipeline:

- **Terrain slab and horizon context**: A 512 x 512 vertex grid (`SLAB_SEGMENTS = 511`, 522,242 triangles) displaced in the vertex shader from an `R32F` `DataTexture` using explicit float32 bilinear interpolation (`createDemR32FTexture` uses `NearestFilter` so float textures work without `OES_texture_float_linear`). `computeSlabFrame` (`slabFrame.ts`) preserves each region's east-west to north-south ground aspect ratio at constant slab area and applies a uniform 2.0x vertical exaggeration (`VERTICAL_EXAGGERATION = 2.0`), surrounded by stratigraphic cliff skirts and optional 5x-span horizon context terrain (`contextTerrain.ts`).
- **Scene-referred HDR and inverse-ACES imagery mapping**: `HdrPipeline` (`hdrPipeline.ts`) renders into a multisampled `HalfFloatType` buffer with `THREE.NoToneMapping`. Orthoimagery passes through an analytical inverse ACES curve (`pictureToScene` in `terrainShader.ts`) and a smooth radiance ceiling (1.5), keeping lit ground below the 1.7 luminance threshold of the 7-level mipmap `BloomEffect` so only high-intensity active fire cores bloom before a single ACES Filmic tone-mapping and sRGB pass.
- **Sensor split, footprints, fire, smoke, and spacecraft**: Custom GLSL shaders render the draggable sensor-split curtain (`CURTAIN_FRAGMENT_SHADER`), oriented MODIS and VIIRS scan footprints (`footprintField.ts`, `scanGeometry.ts`), fire front history (`fireField.ts`), baked sun shadows (`shadowBake.ts`), sky dome and aerial perspective (`atmosphere.ts`), and ray-marched smoke (`smokeVolume.ts`). `SpacecraftFleet` (`spacecraft.ts`) loads `terra.glb`, Draco-compressed `aqua.glb`, and Draco-compressed `suomi_npp.glb` (via Three.js `DRACOLoader` WASM), substituting a procedural bus and solar array for NOAA-20 and NOAA-21 while preserving true pass azimuth, view zenith, scan strip width, and ascending/descending travel direction.
- **GPU caching and offline hydration**: `EarthCutawayStage.tsx` retains up to `RUN_CACHE_LIMIT = 4` region bundles in GPU memory and hydrates `plumas_ca` on mount from `/generated/terrain/` and `/generated/fields/` so the scene renders immediately even without a running backend.

## Determinism, sealed holdout, caching, and coordinate contracts

### Determinism

- Real FIRMS extracts sort rows deterministically by `(_acq_utc, _platform, latitude, longitude)` (`backend/firms/archive.py`). Occupancy filtering is purely deterministic over those rows, and bootstrap evaluation fixes explicit pseudorandom seeds (`seed = 20261114` in `backend/eval/blind_test.py` and `backend/env/learn.py`).
- Simulated runs hash `(region_id, bbox)` with SHA-256 to derive a repeatable `region_seed` (`backend/model/solver.py`), and the startup calibrator fixes `seed = 20261330` (`backend/model/calibrator.py`).

### Sealed holdout contract

In `backend/model/real_run.py`, `seal()` (`backend/eval/holdout.py`) splits raw detections into `(rows_seen, sealed)` before window selection, grid construction, occupancy filtering, belief-frame generation, or GeoJSON/CSV export. The `Sealed` wrapper defines no `__len__`, `__iter__`, or row attributes; its single accessor, `open_for_scoring()`, is restricted to `SCORERS = ("backend/eval/blind_test.py", "backend/env/next_look.py")`. `backend/tests/test_eval_holdout.py` scans the Python source tree to fail if any other module calls `open_for_scoring()`, and `backend/tests/test_model_hidden_rows.py` verifies that arbitrary perturbations or deletions of hidden VIIRS rows leave every non-scorer byte of a real run identical.

### Cache invalidation

- Raw downloads (`data/cache/firms/`, `data/cache/cmr/`) write atomic files paired with `.manifest.json` SHA-256 records.
- `IsogonDataStore` invalidates in-memory real calendars whenever `downloaded_rows` changes and keys `data/cache/firms/derived/real_run_starts_<region>.json` by `(rows, months, start_rule_digest())`, where `start_rule_digest()` hashes the source code of six model and evaluation modules (`backend/server.py`).
- Terrain pack endpoints emit `Cache-Control: public, max-age=86400` and an `ETag` built from file byte size and nanosecond `mtime`, answering `304 Not Modified` on `If-None-Match`.

### Coordinate and raster registration

All backend and frontend spatial layers follow one shared registration contract:

1. **Backend row and column orientation**: Every backend raster (`TerrainGrid`, `EvalGrid`, `dem_*_f32.bin`, `reconstruction_u8.bin`, `belief_u8.bin`) stores **row 0 at the north edge** (`lat = north`) and **column 0 at the west edge** (`lon = west`).
2. **Node registration vs pixel registration**: Elevation binaries (`dem_*_f32.bin`) are **node-registered**, placing sample `(0, 0)` on the exact northwest bounding-box corner and sample `(N - 1, N - 1)` on the southeast corner. Orthoimagery (`ortho_*.jpg`, `satellite.jpg`) and `aux_2048.png` are **pixel-registered** over an N x N partition of the same bounding box so standard 0 to 1 plane UVs align texels with DEM posts.
3. **WebGL2 upload row flip and world axes**: Before uploading to WebGL2 `DataTexture` (`flipY = false`), `createDemR32FTexture(..., true)` and `alignReconstructionTensor(..., true)` in `website/src/stage/earthCutawayShaders.ts` flip rows north-to-south so texture row 0 (`v = 0`) is **south** and row `N - 1` (`v = 1`) is **north**. In `TERRAIN_VERTEX_SHADER`, Three.js world coordinates map `+X` to east (`(uv.x - 0.5) * width`), `+Y` to elevation up, and `+Z` to south (`(0.5 - uv.y) * depth`, placing north along `-Z`).
4. **375 m `EvalGrid` to 256 x 256 tensor mapping**: `EvalGrid` projects `(lon, lat)` onto a local tangent plane in kilometers from `(west, south)` using 111.132 km per degree of latitude and `111.132 * cos(mid_lat)` km per degree of longitude (`backend/eval/grid.py`). When packing `reconstruction_u8.bin` for a real run, `_tensor_index` (`backend/model/real_run.py`) maps each of the 256 x 256 node-registered `(lon, lat)` posts to the 375 m `EvalGrid` cell containing that post.

## Related documentation

- [`../README.md`](../README.md): Project overview, quickstart, validation scores, region support, and known limits
- [`data.md`](data.md): FIRMS archive and area API schemas, CMR pass metadata, region bounding boxes, and cache layouts
- [`method.md`](method.md): Monthly overlap-ratio harmonization, 375 m occupancy filter, blind-test protocol v2, next-look environment, and simulated operator equations
- [`api.md`](api.md): HTTP endpoints, request parameters, response payloads, binary asset streams, and error codes
- [`sources.md`](sources.md): Upstream dataset citations, imagery attributions, spacecraft model terms, and scientific references
- [`../website/README.md`](../website/README.md): Frontend scripts, `VITE_API_BASE`, offline fallback assets, and `website/src/` layout
