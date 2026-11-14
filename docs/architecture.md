# Architecture

This document describes how Isogon is put together: the two processes, the backend's packages, the files it keeps, the site's landing page, workspace and stage, and the rules they share. It is for engineers who read, check or extend the code.

## Overview

Isogon runs as two local processes. There is no database and no queue.

1. **The backend** (`backend/server.py`) is a Python standard library HTTP server on `127.0.0.1:8788`. It needs `numpy` and `Pillow` and nothing else. It serves JSON, CSV, GeoJSON and raw binary rasters. Every route is described in [api.md](api.md).
2. **The site** (`website/`) is a React and TypeScript single-page application built with Vite, on `127.0.0.1:5188` in development. It draws the landing page, the workspace and a three.js terrain stage.

A fresh clone runs both with no data cache: the backend serves simulated runs, and the site falls back to the tracked files under `website/public/generated/` when the backend is not running. Real runs need the local cache that [data.md](data.md) describes.

### Two kinds of run, never mixed

- **A simulated run** models a fire on real terrain and the satellite passes over it (`backend/model/solver.py`, `backend/model/world_model.py`). It uses no FIRMS row. It exists for regions without cached rows and for trying a cloud setting.
- **A real run** (`"source": "firms"`) rebuilds a fire from cached NASA FIRMS rows (`backend/model/real_run.py`) on frames that are real satellite passes.

The two share the route, the answer's outer shape and the 24 by 256 by 256 by 4 tensor, so one reader serves both. They never share observations or scores. Every answer says which kind it is, and the site refuses a simulated answer to a request for a real run instead of showing modelled numbers as observations.

## Backend

### The server

`IsogonDataStore` in `backend/server.py` holds what the routes serve:

- the tracked simulated field, read at start (and rebuilt if a file is missing);
- a store of the 24 most recently used runs, simulated and real;
- the real calendars and start lists, rebuilt when a region's rows change;
- the next-look rounds (`backend/server_next_look.py`), at most 16 in memory;
- the terrain pack manager, which builds a missing pack in the background.

At start the server builds one simulated run of `plumas_ca`, and a background thread builds the real calendars of the three regions with FIRMS rows so the first page request is fast.

The request handler keeps three guards. Browser access is limited to pages served from this machine, and a `POST` from any other origin is refused. Request bodies must be JSON objects of limited size, with no `NaN` or `Infinity`, and no type is coerced. A client may hold a socket idle for at most 60 seconds.

### Packages

| Package | What it does |
| --- | --- |
| `backend/firms/` | Reads NASA data into the local cache and out of it. `archive.py`: the FIRMS country yearly files and the one reader of rows, `read_firms`. `area_api.py`: the FIRMS area API, for NOAA-21 and recent days. `cmr_passes.py`: NASA's list of every pass, fire or no fire. `pass_timeline.py`: passes joined with what FIRMS detected on them. `real_calendar.py`: the monthly calendar and its harmonization. |
| `backend/eval/` | The blind test. `holdout.py` seals the hidden rows. `schedule.py` says when predictions are published, without reading a hidden row. `rows.py`, `overpass.py` and `grid.py` turn rows into overpasses on a 375 m grid. `baselines.py`, `metrics.py` and `blind_test.py` score the estimate beside two baselines. |
| `backend/model/` | The estimate. For real rows: `occupancy.py` (the forward and backward filter), `real_run.py` and `real_blind.py` (a run, its window and frames), `belief.py` (the forward estimate every 30 minutes), `encoding.py` (the log byte scale), `platforms.py` and `real_geometry.py` (platform facts and pass geometry), `episodes.py`, `training.py`, `fit_real.py`, `fitted.py` (what may be learned from, and the fitted values), `terra_morning.py` (the other direction, experimental), `evidence.py` (the evidence document). For simulated runs: `world_model.py`, `sensor_physics.py`, `calibrator.py`, `solver.py`, `reconstruct.py`, `gates.py`. |
| `backend/env/` | The next-look environment: `next_look.py` (reset and step over one real run), `episodes.py` (the catalogue), `agents.py` and `policy.py` (the reference players and the learned policy), `learn.py` and `report.py` (fitting and the reference tables). |
| `backend/terrain/` | Elevation and imagery: `tile_store.py` (the tile cache), `live_region.py` (a region from a preset, a place name or coordinates), `terrain_pack.py` (the higher resolution pack and the context terrain), `projections.py` and `resample.py` (Web Mercator to latitude and longitude). |
| `backend/openspace/` | The exporter that writes an OpenSpace scene from one real run. Nothing else imports it. |

### Hidden rows

A real run with VIIRS hidden is a blind test, and the code is arranged so that the test cannot leak.

- `seal` in `backend/eval/holdout.py` parts the rows once, before the window is chosen. Everything that builds something takes the visible rows. The sealed box has one accessor, `open_for_scoring`, and only `backend/eval/blind_test.py` and `backend/env/next_look.py` may call it. `backend/tests/test_eval_holdout.py` reads the source tree and fails if any other module does.
- `backend/tests/test_model_hidden_rows.py` changes and deletes the hidden rows of a run and requires every byte the scorer did not write to stay the same. `backend/tests/test_env_hidden_rows.py` does the same for an agent's observation.
- The server adds one more step. A held-out run's first answer leaves out every key the scorer wrote and names them in `hidden_rows.withheld_until_reveal`; the same request with `"reveal": true` returns them. A page therefore cannot show a score before the person asks for the reveal.
- A next-look round answers with no hidden row, and no count taken from hidden rows, before the look that reveals it. `backend/tests/test_server_next_look.py` plays a round twice, the second time with every unrevealed hidden row deleted, and requires every other field to be equal.

## Files and formats

Isogon keeps flat files. Each downloaded file has a manifest beside it with its source and SHA-256.

| Path | Tracked | Holds |
| --- | --- | --- |
| `backend/model/fitted_values/` | Yes | The model's fitted values, the validation that decides what is switched on, and the record of every look at the test fires |
| `backend/env/fitted/` | Yes | The environment's learned policy and its reference tables |
| `website/public/generated/` | Yes | The Feather River terrain and one simulated field, for running without a backend |
| `website/public/models/spacecraft/` | Yes | Three spacecraft models with a manifest |
| `data/datasets.json` | Yes | A reference list of NASA products; no code reads it |
| `data/cache/` | No | FIRMS rows, the pass list, map tiles and built terrain ([`data/README.md`](../data/README.md)) |

### Binary formats

- **Elevation** (`dem_f32.bin`, `dem_hires_f32.bin`, `dem_1024_f32.bin`, `context_dem_1024_f32.bin`, `ca_dem_f32.bin`): little-endian float32, metres, square, row 0 at the north edge. 256, 512 or 1024 posts on a side.
- **The reconstruction tensor** (`reconstruction_u8.bin`): 24 frames by 256 by 256 cells by 4 bytes, 6,291,456 bytes. The channels are the estimate, its uncertainty, MODIS as observed and VIIRS as observed.
  - A simulated run is linear: 0 to 80 MW/km2 over bytes 0 to 255, and 0 to 24 MW/km2 for the uncertainty.
  - A real run is logarithmic (`backend/model/encoding.py`): byte 0 is exactly zero, and bytes 1 to 255 span 0.01 to 10,000 MW/km2 evenly in `log10`. The run's `encoding` object carries the rule and a lookup table.
- **Belief frames** (`belief_u8.bin`, real runs only): steps by rows by columns by 2 bytes on the 375 m grid, one step every 30 minutes. Channel 0 is the probability that the cell is burning, divided over 255; channel 1 is the expected power on the log scale above. Each step uses only the passes up to its time.
- **The auxiliary map** (`aux_2048.png`): red and green are two components of the surface normal, blue is sky view, alpha is a canopy index. The site loads it without premultiplied alpha so that a zero alpha keeps its colour bytes.

## The site

`website/src/App.tsx` holds the application's state: which region and run are shown, the step, the time on the track, and the open sheet. Requests to `POST /api/reconstruct` are numbered and abortable, so a late answer never replaces a newer one.

### Landing page

The landing page (`src/ui/LandingComposition.tsx`) is the stage seen from far away with text over it:

- a headline, one sentence and one entry that names the first application, for example the 2021 Dixie Fire, the year read from the run's own window;
- a legend, and one line of facts about the pass in the picture (satellite, date, day or night, number of detections) read from the stage;
- below the first screen, three parts: the world model, the environment and the agent. Each has one line of what it does and one line of status. The status lines are built in `src/content/partsStatus.ts` from `GET /api/evidence`; no figure is typed in the site, and when the route does not answer the parts show no status.

Pressing Enter, or clicking the picture, enters the workspace.

### The workspace and its four steps

The workspace is a top bar, one panel, a pass track and the stage behind them. The bar (`src/components/WorkspaceBar.tsx`) holds the place, the four steps and a quiet menu for view commands. Keys `1` to `4` select a step, and Enter takes the step's one forward action.

| Step | What it shows | What it calls |
| --- | --- | --- |
| **Record** | The burning calendar of the region, month by year (`BurningCalendar.tsx`). Picking a month with a real start replays it. | `GET /api/calendar?source=firms`, `GET /api/calendar/rows.csv` |
| **Fire** | The run with every sensor: each NASA FIRMS detection at its real time, pass by pass, and the estimate. On a simulated run it says so and shows no score. | `POST /api/reconstruct`, `GET /api/observer` |
| **Test** | The blind test. VIIRS is hidden and the estimate is made from MODIS alone; the track shows when VIIRS passed, not what it saw. "Reveal VIIRS" asks for the hidden detections and the score, which opens as a debrief (`Debrief.tsx`, `BlindScoreTable.tsx`). | `POST /api/reconstruct` with `holdout_viirs`, then again with `reveal` |
| **Look** | One round of the next-look environment: the person picks a tile at a look, sees what it reveals, and at the end sees the full reveal and the reference players (`NextLookRound.tsx`). | `POST /api/env/next_look/reset` and `step`, `GET /api/env/next_look/state` |

A step that cannot be entered says why. The test needs a real run and a year in which VIIRS flew; before 2012 the Fire step says that there is nothing to hide. Leaving a step undoes what it left behind: leaving the test restores the run with every sensor.

The pass track (`PassTrack.tsx`) is the time axis: one mark per frame, played or stepped with the arrow keys and Space.

Other surfaces open over the workspace: the search palette (`CommandAskPalette.tsx`, `/`), which changes the place by preset, name or coordinates; the reading sheet (`ReadingSheet.tsx`) with the method, the sensor curves and the sources; the evidence sheet (`EvidenceSheet.tsx`); and the area sheet (`AreaSheet.tsx`), which shows the monthly record of a box drawn on a map.

### Live data and stand-in data

Some surfaces read stand-in files in `src/content/demo/` instead of a route, and say "Demo data" on screen where they do. `src/content/demo/switches.ts` holds the switches.

| Surface | Source |
| --- | --- |
| The next-look round | The live routes |
| The landing page's status lines | `GET /api/evidence`, live |
| The evidence sheet | Stand-in data in `src/content/demo/evidence.ts`, in the shape of the route's answer |
| Passes on the track that flagged nothing | Stand-in data in `src/content/demo/passes.ts`; the route `GET /api/passes` exists and the track does not read it |
| Terra's morning pass, in the debrief | Stand-in data in `src/content/demo/terraMorning.ts`; no route serves it |
| The area sheet | A box inside one of the three context boxes gets that region's real calendar. Any other box gets the real Feather River calendar as a stand-in, named as such; no route serves a calendar for an arbitrary box |

### The stage

`src/stage/EarthCutawayStage.tsx` and `src/stage/engine/` draw the terrain and everything on it with three.js.

- **Terrain.** A slab of 512 by 512 vertices displaced from the run's elevation grid, at twice true height (`VERTICAL_EXAGGERATION` in `slabFrame.ts`), with the terrain pack's image and auxiliary map when a pack exists (`terrainPack.ts`, `terrainShader.ts`) and the wider context terrain around it (`contextTerrain.ts`).
- **Light.** Baked sun shadows (`shadowBake.ts`), a sky and aerial perspective (`atmosphere.ts`), and a scene-referred pipeline with bloom and one tone mapping pass at the end (`hdrPipeline.ts`).
- **Data.** The estimate and the fire's history (`fireField.ts`), satellite footprints at their real size and orientation (`footprintField.ts`, `scanGeometry.ts`), and smoke (`smokeVolume.ts`).
- **Spacecraft.** Terra, Aqua and Suomi NPP are NASA models; NOAA-20 and NOAA-21 are drawn from simple shapes because no separate model is published (`spacecraft.ts`).
- **Framing.** `landingFrame.ts` and `orbitalDirector.ts` place the subject in the part of the screen the interface leaves free, on the landing page and in the workspace.

The stage keeps up to four regions' textures in memory, and draws `plumas_ca` from the tracked files at once, before any answer arrives.

## The OpenSpace exporter

`backend/openspace/export.py` writes a scene folder that OpenSpace, open-source planetarium software, can load: the passes over a region, what MODIS detected, the estimate made from MODIS alone, and then what VIIRS detected. It is a client of the backend: it reads `GET /api/runs/starts`, `POST /api/reconstruct`, the run's belief frames and `GET /api/passes`, and the swath polygons from the cached pass list.

It keeps the blind test's order. Every file before the reveal is written from the held-out answer; the hidden detections are fetched last, with `"reveal": true`, and `MANIFEST.json` records which stage each file belongs to.

Nothing in the backend or the site imports the package, and `backend/tests/test_openspace_modular.py` checks that. The scene has not been verified inside OpenSpace; see [`openspace/README.md`](../openspace/README.md).

## Determinism and caches

- Rows are read in a fixed order and the real estimate has no random step. The bootstrap that classifies scores uses a fixed seed (`backend/eval/blind_test.py`).
- A simulated run derives its seed from the region's id and box, so the same request gives the same run.
- A real run is stored under what decides it: the region, the start, what is hidden, a digest of the region's rows and a digest of the fitted value files. A run built with other rows or other values is another run.
- The start search is cached on disk under `data/cache/firms/derived/`, keyed by the rows, the months searched and a digest of the source of the modules that hold the rule.
- Terrain pack files are served with an `ETag` and may be kept by the browser for a day. Everything else is `no-store`.

## Coordinates and registration

Every layer follows the same rules, so that a detection lands on the ground where it was seen.

1. **Rows and columns.** In every backend raster, row 0 is the north edge and column 0 the west edge.
2. **Posts and pixels.** Elevation grids are registered on posts: the first sample sits on the north-west corner of the box and the last on the south-east corner. Images and the auxiliary map are registered on pixels over the same box.
3. **The 375 m grid.** `EvalGrid` (`backend/eval/grid.py`) lays 375 m cells over a box with 111.132 km per degree of latitude and that times the cosine of the box's mid latitude per degree of longitude. When a real run packs its tensor, each of the 256 by 256 cells takes the value of the 375 m cell that holds its centre (`_tensor_index` in `backend/model/real_run.py`).
4. **The stage.** Before upload, rows are flipped so that texture row 0 is south (`createDemR32FTexture` and `alignReconstructionTensor` in `src/stage/earthCutawayShaders.ts`). In the scene, `+X` is east, `+Y` is up and `+Z` is south.

## Related documents

- [`../README.md`](../README.md): what Isogon is and how to run it
- [data.md](data.md): where the data comes from and how the cache is filled
- [method.md](method.md): the method, the protocol of the blind test and the results
- [api.md](api.md): every route
- [sources.md](sources.md): credits and licences
- [`../website/README.md`](../website/README.md): the site's commands and layout
