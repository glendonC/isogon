# Architecture

This document describes how Isogon is put together: the processes, the backend's route files and packages, the hidden
rows and the checks that keep them hidden, the tests fixed before their one look, the sealed live predictions, the
recording that lets the page run with no server, and the files the backend keeps. It is for engineers who read, check
or extend the code. Every box and every arrow below names the module or file it stands for.

## The data flow

```mermaid
flowchart LR
  subgraph PAGE["The page"]
    direction LR
    site(["website/src/lib/api.ts<br/>TRANSPORT: live or recorded"]):::site
    index[("recorded/index.json<br/>every answer saved, for a page with no server")]:::store
    recorder[["backend/server_recorder.py<br/>Recorder, write_index"]]:::tool
  end

  subgraph SERVER["backend/server.py and its route files"]
    direction LR
    rRecord{{"GET /api/cube/record<br/>backend/server_cube.py record_payload"}}:::route
    rRun{{"POST /api/reconstruct<br/>backend/server.py execute_real_reconstruct"}}:::route
    rEvidence{{"GET /api/evidence<br/>backend/server.py"}}:::route
    rLive{{"GET /api/live<br/>backend/server_live.py live_route"}}:::route
    rGame{{"POST /api/env/next_look/step<br/>backend/server_next_look.py NextLookRounds"}}:::route
  end

  subgraph RECORD["1. A place's fire record on one scale"]
    files[/"NASA FIRMS country yearly files<br/>238 countries, fetched by backend/firms/world_fetch.py"/]:::nasa
    build["backend/firms/cube_build.py<br/>build_part, merge"]:::module
    cubefiles[("the fire cube build<br/>records.npy, manifest.json")]:::store
    cube["backend/firms/cube.py<br/>Cube.box"]:::module
    cal["backend/firms/real_calendar.py<br/>_calendar_payload"]:::module
    hfit[("backend/model/harmonize_fitted.py<br/>FITTED: the method served")]:::store
    harm["backend/model/harmonize.py<br/>record_series"]:::module
  end

  subgraph TEST["2. The estimate, tested with VIIRS hidden"]
    rows[/"NASA FIRMS rows of a region<br/>backend/firms/archive.py read_firms"/]:::nasa
    run["backend/model/real_run.py<br/>solve_real_reconstruction"]:::module
    seal{"backend/eval/holdout.py<br/>seal"}:::wall
    vault[("backend/eval/holdout.py Sealed<br/>the VIIRS rows, unreadable")]:::sealed
    est["backend/model/occupancy.py<br/>OccupancyReconstruction<br/>the first model"]:::model
    chal["backend/model/challenger/methods.py<br/>default_challenger_factory<br/>the second model"]:::model
    bt["backend/eval/blind_test.py<br/>blind_test_sealed, verdict"]:::test
    look["backend/model/fresh_world_run.py<br/>main: one look per test"]:::test
    recs[("backend/model/fitted_values/<br/>fresh_world_test_a.json, fresh_world_test_b.json")]:::store
    ev["backend/model/evidence.py<br/>evidence"]:::module
  end

  subgraph LIVE["3. Predictions sealed before the pass"]
    modis[/"MODIS near real time rows<br/>backend/live/fetch.py ModisOnly"/]:::nasa
    passes["backend/live/passes.py<br/>coming: the next NOAA-20 and NOAA-21 passes"]:::module
    sealer["backend/live/sealer.py<br/>Sealer._seal, 30 to 10 minutes before"]:::live
    predict["backend/live/seal.py<br/>predict"]:::model
    ledger[("seals.jsonl<br/>backend/live/ledger.py: SHA-256 chained, append only")]:::store
    csv[("data/live_seals.csv<br/>backend/live/record.py sync")]:::store
    scorer["backend/live/scorer.py<br/>Scorer._step, after NASA publishes"]:::test
    answer["backend/live/answer.py<br/>build"]:::module
  end

  subgraph GAME["4. The game of where to look"]
    env["backend/env/next_look.py<br/>NextLookEnv: 4 by 4 board, 4 looks"]:::module
    players["backend/env/agents.py<br/>play_reference: the other players"]:::module
    policy[("backend/env/fitted/next_look.json<br/>the learned player, via policy.py load_policy")]:::store
  end

  site ==>|"live"| SERVER
  site -->|"recorded"| index
  recorder -->|"HTTP requests"| SERVER
  recorder -->|"writes"| index

  files -->|"each file read once"| build
  build -->|"writes"| cubefiles
  cubefiles -->|"memory-mapped"| cube
  rRecord -->|"a box"| cube
  cube -->|"monthly counts"| cal
  cube -->|"cells around the box"| harm
  hfit -->|"fitted values"| harm
  cal -->|"record_series"| harm

  rRun -->|"a held-out run"| run
  rows -->|"rows"| run
  run -->|"all rows"| seal
  seal -->|"MODIS rows"| est
  seal -->|"MODIS rows"| chal
  seal -.->|"VIIRS rows"| vault
  est -->|"predictions, published first"| bt
  chal -->|"predictions, published first"| bt
  vault -.->|"open_for_scoring, then scored"| bt
  look -->|"run_blind_test"| bt
  look -->|"writes the record once"| recs
  recs -->|"read"| ev
  rEvidence -->|"evidence"| ev

  modis -->|"MODIS rows only"| sealer
  passes -->|"coming passes"| sealer
  sealer -->|"visible rows"| predict
  sealer -->|"sealed record"| ledger
  ledger -->|"one line a seal"| csv
  ledger -->|"sealed predictions"| scorer
  scorer -->|"blind_test_sealed"| bt
  ledger -->|"seals"| answer
  scorer -->|"scores.jsonl"| answer
  rLive -->|"live_route"| answer

  rGame -->|"reset, step"| env
  rGame -->|"plays"| players
  policy -->|"load_policy"| players
  players -->|"step"| env
  seal -->|"hidden rows sealed"| env

  classDef nasa fill:#dbeafe,stroke:#1d4ed8,stroke-width:1.5px,color:#0b1b3f
  classDef module fill:#ffffff,stroke:#475569,color:#0f172a
  classDef store fill:#fef3c7,stroke:#b45309,color:#3b2405
  classDef route fill:#ede9fe,stroke:#6d28d9,color:#2e1065
  classDef model fill:#dcfce7,stroke:#15803d,color:#052e16
  classDef test fill:#ffe4e6,stroke:#be123c,color:#4c0519
  classDef live fill:#ffedd5,stroke:#c2410c,color:#431407
  classDef wall fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d
  classDef sealed fill:#f8fafc,stroke:#dc2626,stroke-width:2px,stroke-dasharray:6 4,color:#7f1d1d
  classDef site fill:#e0f2fe,stroke:#0369a1,color:#082f49
  classDef tool fill:#f1f5f9,stroke:#475569,color:#0f172a
  style PAGE fill:#f0f9ff,stroke:#7dd3fc
  style SERVER fill:#f5f3ff,stroke:#c4b5fd
  style RECORD fill:#fffbeb,stroke:#fcd34d
  style TEST fill:#fff1f2,stroke:#fda4af
  style LIVE fill:#fff7ed,stroke:#fdba74
  style GAME fill:#f0fdf4,stroke:#86efac
```

| Shape and colour | What it is |
| --- | --- |
| Blue slanted box | NASA data coming in |
| White box | A Python module and the function that does the work |
| Amber cylinder | A file kept on disk |
| Purple hexagon | An HTTP route of the backend |
| Green box | A model that makes predictions: the first model, the second model, the live predictions |
| Pink box | A scorer or a test |
| Red diamond and red dashed cylinder | The wall: `seal` parts the rows, and the sealed VIIRS rows reach nothing but the scorer |
| Thick arrow, solid arrow, dotted arrow | The page's request; a call or a read, labelled with what it carries; the sealed rows' only way out |

## Processes

Isogon runs as two local processes. There is no database and no queue.

1. **The backend** (`backend/server.py`) is a Python standard library HTTP server on `127.0.0.1:8788`. It needs two
   packages outside the standard library, `numpy` and `Pillow`. The tool that downloads NASA's burned-area files
   (`backend/firms/burned_fetch.py`) can also use `h5py` or `pyhdf` to read them when they are installed; nothing the
   server serves needs either. Every route is described in [api.md](api.md).
2. **The site** (`website/`) is a React and TypeScript application built with Vite, on `127.0.0.1:5188` in
   development. It reads either the live backend or a recording of it (see below).

A fresh clone runs both with no data cache: the backend serves simulated runs, and the site draws the tracked files
under `website/public/generated/`. Real runs, the record and the tests need the local cache that [data.md](data.md)
describes. The backend's tests are run with `python3 -m unittest discover -s backend/tests`; the suite holds 835
tests, counted by the test loader, and the tests that need the data cache skip themselves without it.

### Two kinds of run, never mixed

- **A simulated run** models a fire on real terrain and the satellite passes over it (`backend/model/solver.py`,
  `backend/model/world_model.py`). It uses no FIRMS row.
- **A real run** (`"source": "firms"`) rebuilds a fire from cached NASA FIRMS rows (`backend/model/real_run.py`) on
  frames that are real satellite passes.

The two share the route, the answer's outer shape and the 24 by 256 by 256 by 4 tensor. They never share observations
or scores, and every answer says which kind it is.

## The server and its route files

`backend/server.py` holds the request handler (`do_GET`, `do_POST`) and the store, `IsogonDataStore`. The route files
are plain modules it imports; `do_GET` tries the cube's routes, then the photographs', then its own.

| File | What it answers | What it calls |
| --- | --- | --- |
| `backend/server.py` | `POST /api/reconstruct` (a run: simulated, real, held out, revealed), `GET /api/regions`, `/api/calendar` and its `checks`, `current` and `rows.csv`, `/api/evidence`, `/api/passes`, `/api/runs/starts`, the run assets under `/api/runs/<id>/`, `/api/observer`, `/api/sensor-model`, `/api/field-meta`, `/api/firms/countries`, `/api/health` | `solve_region_reconstruction` (`model/solver.py`), `solve_real_reconstruction` and `real_response` (`model/real_run.py`), `firms_calendar` and `box_calendar` (`firms/real_calendar.py`), `evidence` (`model/evidence.py`), `pass_timeline` (`firms/pass_timeline.py`) |
| `backend/server_cube.py` | `GET /api/cube/countries`, `/record`, `/tables`, `/layers`, `/years`, `/years/countries` | `Cube` (`firms/cube.py`); a box's record goes through `_calendar_payload` (`firms/real_calendar.py`) |
| `backend/server_live.py` | `GET /api/live`, also as a read-only server of its own | `build` (`live/answer.py`) |
| `backend/server_next_look.py` | `POST /api/env/next_look/reset`, `step`, `play`; `GET /api/env/next_look/state`, `players` (served by `server.py`) | `NextLookEnv` (`env/next_look.py`), `play_reference` (`env/agents.py`), `load_policy` (`env/policy.py`) |
| `backend/server_gibs.py` | `GET /api/gibs/day`, `/cloud`, `/live` | `build_day_image` (`terrain/gibs_day.py`); the main server reads the photograph cache only |
| `backend/server_burned.py` | `GET /api/burned`, NASA's burned-area map (MCD64A1) over a box and window | `mask` (`firms/burned.py`). `server.py` does not mount this route: only its test calls it |
| `backend/server_recorder.py` | no route: a tool that records the server's answers | a running backend, over HTTP |

The store holds the simulated field read at start, the 24 most recently used runs, the real calendars and start lists,
the next-look rounds (at most 16, each dropped after six idle hours), the terrain pack manager, and smaller caches of
pass timelines, box calendars and this month's counts. The cube is not in the store: `server_cube.py` keeps one reader
of the current build and its own cache of answers.

The handler keeps four guards. A `POST` from a page not served from this machine is refused. Request bodies are JSON
objects of limited size (64 KB for a round, 256 KB for a run), with no `NaN` or `Infinity`. Numbers in a query must be
finite. A client may hold a socket idle for at most 60 seconds.

## The packages

| Package | What it does |
| --- | --- |
| `backend/firms/` | NASA's fire rows and what is built from them. `world_fetch.py` downloads every country's yearly FIRMS files; `archive.py` keeps them with their manifests and holds `read_firms`, the reader of a region's rows. `cube_build.py` builds the fire cube and `cube.py` reads it (`Cube`). `real_calendar.py` makes a place's monthly record. `box_index.py` counts any box from the country files. `area_api.py` asks the FIRMS area API, `current_month.py` counts this month so far, `cmr_passes.py` lists every satellite pass from NASA CMR, `pass_timeline.py` joins passes with the detections on them, `burned.py` reads NASA's burned-area maps, `places.py` and `places.json` hold the places and their featured fires. |
| `backend/model/` | The record's harmonization (`harmonize.py`, with its fitted values in `harmonize_fitted.py`; the other `harmonize_*.py` modules build the figures and maps of [harmonization.md](harmonization.md)). The estimate for real rows: `real_run.py` (a run), `occupancy.py` (the forward and backward filter), `belief.py` (the belief every 30 minutes), `encoding.py` (the log byte scale), `platforms.py` and `real_geometry.py` (platform facts and pass geometry), `fitted.py` and `fitted_values/` (the values in use and the records of every look). The second model: `challenger/`. The tests fixed before the look: `fresh_test.py`, `fresh_world.py`, `fresh_world_run.py`. The evidence document: `evidence.py`. Simulated runs: `world_model.py`, `sensor_physics.py`, `calibrator.py`, `solver.py`, `reconstruct.py`, `gates.py`. |
| `backend/eval/` | The blind test. `holdout.py` seals the hidden rows; `schedule.py` says when predictions are published, without reading a hidden row; `rows.py`, `overpass.py` and `grid.py` turn rows into overpasses on a 375 m grid; `baselines.py`, `metrics.py` and `blind_test.py` score the estimate beside the two simple methods. |
| `backend/env/` | The game: `next_look.py` (the environment), `agents.py` and `policy.py` (the reference players and the learned player, whose weights are `fitted/next_look.json`), `play.py`, `episodes.py`, `learn.py`, `report.py`, and `fresh_world_players.py` (the players measured on the fresh test's fires). |
| `backend/live/` | The live test: `choose.py` (fires), `passes.py` (coming passes), `seal.py` and `sealer.py` (predictions and their seals), `ledger.py` (the chained logs), `scorer.py`, `answer.py` (the route's answer), `record.py` (the tracked record of seals), `protocol.py`, `run.py`, `rehearse.py`. [live.md](live.md) describes it. |
| `backend/terrain/` | Elevation and imagery: `tile_store.py` (the tile cache), `terrain_pack.py` (the higher resolution pack and the context terrain), `live_region.py` (a region from a preset, a place name or coordinates), `gibs_day.py` (the day's photograph from NASA GIBS), `projections.py` and `resample.py`. |
| `backend/openspace/` | The exporter that writes an OpenSpace scene from one held-out run. Nothing else in the backend imports it. |

## The fire record

Every country's FIRMS yearly files, 238 countries, are read once into the fire cube (`backend/firms/cube_build.py`,
shape in [cube.md](cube.md)): monthly counts and fire radiative power for each cell of a quarter-degree grid, by
platform, day or night, kind, the pixel's size across the swath and confidence. A build is a folder of memory-mapped
arrays with a `manifest.json`; `GET /api/cube/countries` serves its row count, 548,501,203 rows.

A box's record is read from the cube (`Cube.box` in `backend/firms/cube.py`) and made into months by
`_calendar_payload` in `backend/firms/real_calendar.py`. Its counts on one scale come from `record_series` in
`backend/model/harmonize.py`: the method chosen by a rule written before any table (`pooled_month_size_v1` for counts,
`overlap_ratio_v1` for fire power, as `backend/model/harmonize_fitted.py` records), using the cells around the box
(`surround_from_cube`) where the box itself has few detections, with an 80 percent interval from held-out errors.

## A run, its hidden rows and the blind test

A real run with VIIRS hidden is a blind test, and the code is arranged so that the test cannot leak.

- `solve_real_reconstruction` (`backend/model/real_run.py`) reads the region's rows (`read_firms`) and parts them at
  once with `seal` (`backend/eval/holdout.py`). The window, the frames and the estimate are made from the visible
  rows alone: the estimate is `OccupancyReconstruction` (`backend/model/occupancy.py`), asked at each frame.
- The sealed box has one accessor, `open_for_scoring`. Only `backend/eval/blind_test.py` (`blind_test_sealed`,
  `reveal`) and `backend/env/next_look.py` call it, and `backend/tests/test_eval_holdout.py` reads the source tree and
  fails if any other module does.
- `blind_test_sealed` publishes every method's predictions before it opens the box, then scores them; `verdict` says,
  score by score, whether the estimate beat both simple methods.
- The server adds one step: a held-out run's first answer leaves out every key the scorer wrote
  (`withhold_scorer_keys` in `backend/server.py`) and names them in `withheld_until_reveal`; the same request with
  `"reveal": true` returns them. A run on a window of the closed test fires is refused before anything is estimated.

### The second model

When the server runs with `ISOGON_RUN_ESTIMATE=challenger`, a held-out run's hidden passes are answered by the second
model (`backend/model/challenger/`), the variant named in `challenger/fitted/default_challenger.json` and built by
`default_challenger_factory` (`challenger/methods.py`) from the visible rows. It is scored beside the estimate in use in
the same blind test, and the run's answer names it (`held_out_passes_answered_by`). The visible passes, the spread,
the belief frames and the exports stay with the estimate in use. `challenger/guard.py` refuses a hidden row.

### The checks that delete and alter the hidden rows

No byte of an answer may depend on a hidden row until the reveal. The tests check it by comparing bytes:

- `backend/tests/test_model_hidden_rows.py` deletes and alters a run's hidden rows (the perturbations of
  `backend/eval/synthetic_fixture.py`) and requires the estimate, the belief frames, the exports, the declared cells
  and every key of the answer outside the scorer to stay byte for byte the same, while the scores do change.
- `backend/tests/test_env_hidden_rows.py` does the same for the game's observations, and
  `backend/tests/test_server_next_look.py` plays a round twice, the second time with every unrevealed hidden row
  deleted, and requires every other field to be equal.
- `backend/tests/test_model_run_challenger.py` and `backend/tests/test_model_challenger_safety.py` hold the second
  model to the same rule.

## The tests fixed before the look

The test across the world is written down before any of its fires is read ([method.md](method.md)).

- `backend/model/fresh_test.py` holds the protocol and its SHA-256 digest (`protocol_sha256`).
- `backend/model/fresh_world.py` builds the plan of fires from MODIS files alone and records the protocol's digest in
  it; `fresh_world_run.py` refuses a plan whose digest or protocol does not match.
- A look is taken once: `fresh_world_run.py` refuses to write a look whose record already exists. Each look scores its
  fires with `run_blind_test` (`backend/eval/blind_test.py`) and writes its record to
  `backend/model/fitted_values/` (`fresh_world_test_a.json`, `fresh_world_test_b.json`, with the plan, the refit and
  the players' records beside them), each naming the protocol's digest and the plan's.
- `evidence` (`backend/model/evidence.py`) reads those records and serves them at `GET /api/evidence`.

## The live test

The live test predicts passes that have not happened yet ([live.md](live.md)).

- Every 24 hours `backend/live/choose.py` picks fires from the last two days of MODIS near real time rows alone.
- `coming` (`backend/live/passes.py`) finds each fire's coming NOAA-20 and NOAA-21 passes from the same satellites'
  passes 16 days before.
- Between 30 and 10 minutes before a pass, `Sealer._seal` (`backend/live/sealer.py`) has the three methods predict
  from MODIS rows alone (`predict` in `backend/live/seal.py`), writes their arrays under their digest, and appends the
  record to `seals.jsonl` through `Ledger.append` (`backend/live/ledger.py`): the SHA-256 of the record's canonical
  JSON, chained to the line before it, in a file opened for appending only.
- `record.sync` (`backend/live/record.py`) copies each seal's time, digest, fire, satellite and predicted minute into
  the tracked `data/live_seals.csv`, whose written lines are never changed.
- After NASA publishes the pass, `Scorer._step` (`backend/live/scorer.py`) checks each sealed digest and scores the
  predictions with `blind_test_sealed`, unchanged. `build` (`backend/live/answer.py`) makes the answer of
  `GET /api/live`.

## The game

`NextLookEnv` (`backend/env/next_look.py`) plays one real run cut into a board of 4 by 4 tiles, with a budget of four
looks at the hidden satellite's scheduled passes. It seals the hidden rows as a run does, and an observation holds only
the hidden rows its looks have revealed. The reward of a look is the score after it minus the score before, both on
every hidden detection of the episode. `NextLookRounds` (`backend/server_next_look.py`) holds the rounds, and plays the reference players
(`play_reference` in `backend/env/agents.py`), the learned player among them (`load_policy` in `backend/env/policy.py`).

## The recording

A page with no backend reads a recording instead. `backend/server_recorder.py` asks a running backend for every answer
on a plan of requests (by default the demo path of the featured fires), each built with the body the page builds, and
writes the answers and assets into one folder with an `index.json` keyed by method, path with its query sorted, and
body. Imagery whose licence does not allow a copy is left out and listed as withheld. After writing, the tool checks
every file for the FIRMS key, `MAP_KEY=` and local paths, and fails if one holds any. The site reads the folder when it
is built with `VITE_TRANSPORT=recorded` (`website/src/lib/api.ts`); a request with no recorded answer says so in one
line.

## Files and formats

Isogon keeps flat files. Each downloaded file has a manifest beside it with its source and SHA-256.

| Path | Tracked | Holds |
| --- | --- | --- |
| `backend/model/fitted_values/` | Yes | The estimate's fitted values, the records of every look at the test fires, the fresh test's plan, looks, refit and players |
| `backend/model/harmonize_fitted.py` | Yes | The harmonization's fitted values and the method served |
| `backend/model/challenger/fitted/` | Yes | The second model's fitted variants and the pointer to the default one |
| `backend/env/fitted/` | Yes | The learned player and its reference tables |
| `data/live_seals.csv` | Yes | One line per live seal, never changed once written |
| `website/public/generated/` | Yes | The Feather River terrain and one simulated field, for running without a backend |
| `data/cache/` | No | FIRMS rows, the fire cube, the pass list, map tiles, built terrain and the live test's folder ([`data/README.md`](../data/README.md)) |

### Binary formats

- **Elevation** (`dem_f32.bin`, `dem_hires_f32.bin`, `dem_1024_f32.bin`, `context_dem_1024_f32.bin`, `ca_dem_f32.bin`):
  little-endian float32, metres, square, row 0 at the north edge. 256, 512 or 1024 posts on a side.
- **The reconstruction tensor** (`reconstruction_u8.bin`): 24 frames by 256 by 256 cells by 4 bytes, 6,291,456 bytes.
  The channels are the estimate, its uncertainty, MODIS as observed and VIIRS as observed.
  - A simulated run is linear: 0 to 80 MW/km2 over bytes 0 to 255, and 0 to 24 MW/km2 for the uncertainty.
  - A real run is logarithmic (`backend/model/encoding.py`): byte 0 is exactly zero, and bytes 1 to 255 span 0.01 to
    10,000 MW/km2 evenly in `log10`.
- **Belief frames** (`belief_u8.bin`, real runs only): steps by rows by columns by 2 bytes on the 375 m grid, one step
  every 30 minutes. Channel 0 is the probability that the cell is burning, divided over 255; channel 1 is the expected
  power on the log scale above. Each step uses only the passes up to its time.
- **The fire cube**: records of month, code, rows and fire power per cell, laid out in [cube.md](cube.md).

## The OpenSpace exporter

`backend/openspace/export.py` writes a scene folder that OpenSpace, open-source planetarium software, can load: the
passes over a region, what MODIS detected, the estimate made from MODIS alone, and then what VIIRS detected. It is a
client of the backend and keeps the blind test's order: every file before the reveal is written from the held-out
answer, and the hidden detections are fetched last. `backend/tests/test_openspace_modular.py` checks that nothing else
imports it.

## Determinism and caches

- Rows are read in a fixed order and the real estimate has no random step. The bootstrap that classifies scores uses a
  fixed seed (`backend/eval/blind_test.py`).
- A simulated run derives its seed from the region's id and box, so the same request gives the same run.
- A real run is stored under what decides it: the region, the start, what is hidden, a digest of the region's rows and
  a digest of the fitted value files.
- The start search is cached under `data/cache/firms/derived/`, keyed by the rows and a digest of the source of the
  rule.
- The reference players of a round are played once per episode and kept under `data/cache/next_look_reference/`, keyed
  by a digest of everything their results follow from.
- Terrain pack files are served with an `ETag` and may be kept by the browser for a day. Everything else is `no-store`.

## Coordinates and registration

1. **Rows and columns.** In every backend raster, row 0 is the north edge and column 0 the west edge.
2. **Posts and pixels.** Elevation grids are registered on posts: the first sample sits on the north-west corner of the
   box and the last on the south-east corner. Images are registered on pixels over the same box.
3. **The 375 m grid.** `EvalGrid` (`backend/eval/grid.py`) lays 375 m cells over a box with 111.132 km per degree of
   latitude and that times the cosine of the box's mid latitude per degree of longitude. When a real run packs its
   tensor, each of the 256 by 256 cells takes the value of the 375 m cell that holds its centre (`_tensor_index` in
   `backend/model/real_run.py`).
4. **The cube's grid.** A quarter of a degree, 1440 columns by 720 rows, row 0 at the north ([cube.md](cube.md)).
5. **The stage.** Before upload, rows are flipped so that texture row 0 is south (`createDemR32FTexture` and
   `alignReconstructionTensor` in `website/src/stage/earthCutawayShaders.ts`).

## Related documents

- [`../README.md`](../README.md): what Isogon is and how to run it
- [data.md](data.md): where the data comes from and how the cache is filled
- [cube.md](cube.md): the fire cube
- [harmonization.md](harmonization.md): the record on one scale
- [method.md](method.md): the method, the protocol of the blind test and the results
- [live.md](live.md): the live test
- [api.md](api.md): every route
- [sources.md](sources.md): credits and licences
- [`../website/README.md`](../website/README.md): the site's commands and layout
