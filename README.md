# Isogon

Isogon is a web application on real NASA FIRMS fire detections. Two instruments have watched the same fires: MODIS at 1 km since 2000 and VIIRS at 375 m since 2012. Isogon puts their record on one scale, rebuilds a real fire from MODIS alone, and grades the result against the VIIRS detections it was not shown. It is for people who study fire from satellites and want every estimate tested against data it has not seen.

## What it does

- **A burning calendar.** For a region, fire activity month by year from November 2000 to December 2025, with the MODIS years rescaled onto the VIIRS scale and the method checked on years left out.
- **A blind test.** A real fire is rebuilt on a 375 m grid from MODIS detections alone. The VIIRS detections are sealed away until every prediction is fixed, then the estimate is scored against them beside two simple baselines. The schedule of the test comes from NASA's list of satellite passes, so a pass that flagged nothing is scored too.
- **A next-look environment.** With VIIRS hidden, an agent chooses where to take a sharp look, tile by tile, and is scored against the hidden real detections. A person can play a round in the site.
- **A terrain stage.** The detections, the passes and the estimate are drawn on 3D terrain in the browser, at their real times and pixel sizes.
- **An OpenSpace export.** One real run can be written as a scene folder for OpenSpace, the open-source planetarium software. The scene has not been verified inside OpenSpace.

Regions without cached FIRMS rows run as a simulation, labelled as such everywhere: a modelled fire seen by modelled passes, with no real detection in it.

## What the tests found

The figures come from tracked files and are explained in [`docs/method.md`](docs/method.md). The running backend serves them as one document at `GET /api/evidence`.

| Question | Result | File |
| --- | --- | --- |
| Does the estimate beat the baselines on fires it was not fitted on? | On 7 validation fires of 2024 and 2025 it is ahead of both baselines on 2 of 7 scores, tied on 5 and behind on none. No part of the estimate is switched on by that result: the model is experimental. | `backend/model/fitted_values/occupancy_params.json` |
| How does it do on the three 2021 test fires? | On the final recorded look it is ahead of both baselines on 6, 7 and 3 of 7 scores (Dixie, Lytton Creek, northern Evia). The test fires are not scored again. | `backend/model/fitted_values/test_fire_looks.json` |
| Does choosing where to look help? | A simple rule, looking where the model is least sure, gains more than a random look on 20 of 21 test episodes. The learned agent does not beat that simple rule. | `backend/env/fitted/next_look.json` |
| Can Terra's morning pass be estimated from VIIRS? | Experimental and not in use: ahead on 4 of 7 scores, tied on 2, behind on 1, measured under the first protocol only. | `backend/model/fitted_values/terra_morning.json` |

## Quick start

You need `uv` (it supplies Python 3.12 with `numpy` and `Pillow`) and Node.js 20 or later with `npm`.

```sh
# 1. The backend, on http://127.0.0.1:8788
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.server

# 2. The site, on http://127.0.0.1:5188
cd website && npm ci && npm run dev
```

A fresh clone has no data cache. It runs: the backend serves simulated runs, and the site draws the tracked Feather River terrain. The real calendar, real runs, the blind test and the rounds need the cache below.

Tests and the production build:

```sh
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m unittest discover -s backend/tests
cd website && npm run build
```

Some backend tests need the data cache and skip themselves without it, and a few fetch map tiles from the network when the terrain cache is empty.

## Filling the data cache

Everything downloaded goes under `data/cache/`, which git ignores. The first three commands need no key.

```sh
# FIRMS detections, 2000 to 2025, for the three regions
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.archive fetch --years 2000-2025

# NASA's list of satellite passes, 2012 to 2025
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.cmr_passes fetch --first 2012-01 --last 2025-12

# Terrain packs and the context terrain around them
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.terrain.terrain_pack build plumas_ca lytton_bc evia_greece
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.terrain.terrain_pack context
```

NOAA-21 rows and recent days come from the FIRMS area API, which needs a free key: copy `.env.example` to `.env`, set `FIRMS_MAP_KEY`, and see [`docs/data.md`](docs/data.md). The site reads the backend's address from `VITE_API_BASE`.

## Regions

| Region | Place | FIRMS rows |
| --- | --- | --- |
| `plumas_ca` | Feather River and Plumas, California | Yes |
| `lytton_bc` | Lytton and the Thompson Canyon, British Columbia | Yes |
| `evia_greece` | Northern Evia, Greece | Yes |
| `novo_progresso_br` | Serra do Cachimbo, Amazonia | No: simulated only |
| `blue_mountains_au` | Blue Mountains, New South Wales | No: simulated only |

Any other place, given as coordinates or as a place name the backend knows, runs as a simulation on its real terrain.

## Limits

- **Cloud is not known.** FIRMS lists detections and has no cloud mask. A pass that flagged nothing may have looked at clear ground or at cloud, and the model stands a fixed prior in for it.
- **Three regions.** Real runs exist only for the three boxes with cached rows.
- **The model is experimental.** Validation switches no part of it on, and its validation set is seven fires from two regions.
- **Truth is another instrument.** The estimate is scored against what VIIRS reported, not against the fire itself.
- **Imagery terms.** The default imagery, Esri World Imagery, is published for viewing and not for export. Use `usgs_naip` where a terrain pack must be free to share. See [`docs/sources.md`](docs/sources.md).
- **OpenSpace.** The exported scene has not been loaded in OpenSpace by the project; [`openspace/LOAD-AND-CHECK.md`](openspace/LOAD-AND-CHECK.md) says how to check it.

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | The two processes, the backend's packages, file formats, the site's landing page, four steps and stage |
| [`docs/data.md`](docs/data.md) | Where the data comes from, how the cache is filled, what the rows can and cannot say |
| [`docs/method.md`](docs/method.md) | The method, the protocol of the blind test, the results and the limits |
| [`docs/api.md`](docs/api.md) | Every route of the backend |
| [`docs/sources.md`](docs/sources.md) | Papers, data, imagery, models, fonts and libraries, with their terms |
| [`website/README.md`](website/README.md) | The site's commands and source layout |
| [`data/README.md`](data/README.md) | The layout of the local cache |
| [`openspace/README.md`](openspace/README.md) | The OpenSpace exporter and the scene it writes |

## Origin and licence

Isogon began at the NASA Space Apps Challenge, as an answer to its challenge "Harmonization of MODIS and VIIRS Hot Spots".

The repository does not include a licence file for its own code. The data, imagery, elevation, spacecraft models, fonts and libraries it uses stay under their own terms, listed in [`docs/sources.md`](docs/sources.md).
