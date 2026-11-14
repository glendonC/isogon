# Isogon website

`website/` is the browser side of Isogon: a React and TypeScript single-page application, built with Vite, that draws the landing page, the workspace and the three.js terrain stage. Read this to install, run, build or find your way around the site's code.

## Commands

Run them inside `website/`, with Node.js 20 or later and `npm`.

```bash
npm ci            # install the exact versions in package-lock.json
npm run dev       # development server on http://127.0.0.1:5188
npm run build     # type check (tsc -b), then build into dist/
npm run preview   # serve dist/ on http://127.0.0.1:5188
```

`dev` and `preview` bind to `127.0.0.1:5188` with `--strictPort`: they stop instead of taking another port when 5188 is in use.

## The public page

The public page is the site built to replay recorded answers, with no backend, served under a path (`/isogon/` on
GitHub Pages). One command builds it: the site with the recorded transport on (`VITE_TRANSPORT=recorded`), the base
path given as an argument, and a recording made by `backend/server_recorder.py` copied inside as `recorded/` (only
`index.json` and the files its entries name).

```bash
node scripts/build-public.mjs --recording <folder written by backend/server_recorder.py> --base /isogon/ --out dist/public
```

The page lands in `dist/public/isogon/`; that folder is what is published. To try it under the same path, serve the
folder above it and open `http://127.0.0.1:5589/isogon/`:

```bash
python3 -m http.server 5589 --bind 127.0.0.1 --directory dist/public
```

The command prints the size of the recording and of the whole page. It stops when the recording's index names a
file the folder does not hold. The recording itself is made against a running backend (see `docs/architecture.md`).

## The backend

The site calls the backend at `http://127.0.0.1:8788` through one client module, `src/lib/api.ts`. Start the backend from the repository root:

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.server
```

To use another address, set `VITE_API_BASE`:

```bash
VITE_API_BASE=http://127.0.0.1:8790 npm run dev
```

A build for a public static page reads recorded answers instead of a backend: set `VITE_TRANSPORT=recorded` and,
if the folder is not `recorded/` beside the page, `VITE_RECORDED_BASE`. The folder holds `index.json`, which maps
each request's key (its method, its path with the query sorted, and for a POST its body as JSON with sorted keys)
to a stored answer. A request with no recorded answer says so on the page in one line.

The backend accepts browser requests only from pages served on `localhost`, `127.0.0.1` or `[::1]`. Its routes are described in [`../docs/api.md`](../docs/api.md).

Without a backend the site still opens and the stage draws `plumas_ca` from the tracked files under `public/generated/`. The real calendar, real runs, the blind test and the rounds need the backend.

## What the page is

- **The landing page** (`src/ui/LandingComposition.tsx`): the stage from far away, a headline, one entry into the first application, and below it three parts (world model, environment, agent) whose status lines are read from `GET /api/evidence`.
- **The workspace**: a top bar with the place and the dates on the terrain, the Calendar and the three parts, one panel, a pass track and the stage. The names and their one line each are in `src/app/names.ts`.

| Part | Key | What it does |
| --- | --- | --- |
| Calendar | `0` | Choose a place on a map (a featured fire, a name or coordinates, or a box you draw; `P` opens it), then its fire record as the whole screen: every month since November 2000 on one log ramp, the mean of each year, the median of each month, how wrong the method is on years left out, and this month against its median. A month with a real run opens in World model. The place screen also shows the featured fires as cut-outs on one plane at one scale; a pick opens that fire |
| 1 World model | `1` | Opens close to the fire with VIIRS hidden on the run on the terrain: the estimate from MODIS alone, a label on the fire for the pass on show, what was hidden, and Reveal VIIRS. After the reveal the verdict sits beside the fire's extent (scores ahead of both simple methods, by plain comparison, the stated range, and the record of the test fires and the validation beside it); `T` shows one fire three ways in the stage's place (what MODIS saw, the estimate from MODIS alone, what VIIRS saw, at one hidden pass), `Enter` opens the seven scores, `E` every test on record. On a recorded test fire it shows the record and the run with every satellite, and is not hidden or revealed again. Before 2012 nothing can be hidden |
| 2 Test world | `2` | One round of the next-look environment on the fire that is open: the stage draws the tiles on the terrain; pick one with the mouse, or move with the arrow keys and press Space, to point VIIRS at it; Enter passes. Closed on a recorded test fire and before 2012 |
| 3 Agent | `3` | The players (chance, latest MODIS, least sure, the learned agent) play the round on the fire that is open, one block each with its looks in order and what they found; "Watch it play" lays the looks down one after another. Closed on a recorded test fire and before 2012; Esc goes back to World model |

Other keys: on the landing a bare Enter opens the place screen; in the workspace Enter takes the part's forward action, Space plays or pauses, the left and right arrows step through the passes, `V` hides or reveals VIIRS, `E` opens every test on record, `L` starts a round, `/` or Ctrl+K (Cmd+K) opens the search palette, `M` opens the sensor reading, `U` toggles the uncertainty layer on a simulated run, `H` hides the interface, `C` starts the camera tour, `N` goes to the next region, and Esc goes back.

A real run and a simulated run are kept apart. When the site asks for a real run and the answer is not one, it is refused, so modelled numbers are never shown as observations.

One surface reads a stand-in file in `src/content/demo/` instead of a route and says "Demo data" on screen: the calendar of a box outside the three regions with FIRMS rows. The Terra morning result (`src/content/demo/terraMorning.ts`) is kept but not shown until it has a clean measurement and a route. The evidence sheet reads `GET /api/evidence` and shows no figure until it answers. On the pass track, the passes that looked and flagged nothing come from the run itself when its frames are the NASA CMR pass list, and otherwise from `GET /api/passes`; where neither has them (before 2012), the track says it shows passes with fire only. [`../docs/architecture.md`](../docs/architecture.md) lists them.

## Static files

`public/` holds what the site can draw before any answer arrives.

| Path | Holds |
| --- | --- |
| `public/generated/terrain/` | The Feather River terrain: `ca_dem_f32.bin` (256 by 256 float32), `ca_normals.png`, `ca_satellite.jpg`, and two global images, `earth_day.jpg` and `earth_bump.png`. `terrain_manifest.json` records each file's source, licence and SHA-256. |
| `public/generated/fields/` | One simulated run of the same box: `reconstruction_u8.bin`, `observer_passes.json`, `calendar_2000_2026.json`, `sensor_model_diagnostics.json`, described by `field_metadata.json`. The backend serves these same files for the simulated calendar and the sensor curves. |
| `public/models/spacecraft/` | `terra.glb`, `aqua.glb` and `suomi_npp.glb` from NASA 3D Resources, with `manifest.json`. NOAA-20 and NOAA-21 have no published model and are drawn from simple shapes. |

## Source layout

| Path | Holds |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | The entry point and the application's state: region, run, step, time, open sheet, requests and keys |
| `src/ui/` | The landing page, the mark, the split headline, and small hooks (`useCalendar`, `useSensorModel`, `useDialogFocus`) |
| `src/beats/` | One folder per part: `calendar/` (the place screen, the Calendar and their reader `record.ts`), `world-model/` (the scene on the terrain and its reader `fire.ts`), `test-world/` (the round: `useRound.ts`, its routes `env.ts`, the tile labels), `agent/`; they read `app/store.tsx` |
| `src/app/` | The part names (`names.ts`), the places registry (`places.ts`), the shared store (`store.tsx`) |
| `src/components/` | The workspace: `WorkspaceBar`, `BurningCalendar`, `PassTrack`, `Debrief` and `BlindScoreTable`, `NextLookRound`, and the sheets (`ReadingSheet`, `MethodSheet`, `SourcesSheet`, `EvidenceSheet`, `AreaSheet`, `CommandAskPalette`) |
| `src/content/` | Readers of the backend's answers and the page's texts: `calendar.ts`, `realRuns.ts`, `nextLookEnv.ts`, `passTrack.ts`, `partsStatus.ts`, `sources.ts`, `theaters.ts`; stand-in data in `demo/` |
| `src/stage/` | The stage component (`EarthCutawayStage.tsx`), its shaders and types, and the camera (`orbitalDirector.ts`) |
| `src/stage/engine/` | The stage's parts: terrain and terrain packs, context terrain, light and atmosphere, shadows, fire, footprints, smoke, spacecraft, framing |
| `src/lib/` | The backend client (`api.ts`), colour scales (`colormaps.ts`) and land outlines (`earthAtlas.ts`) |
| `src/styles/` | Style sheets, with the shared values in `tokens.css` |

## Related documents

- [`../README.md`](../README.md): what Isogon is and how to run it
- [`../docs/architecture.md`](../docs/architecture.md): the site's landing page, steps and stage in more detail
- [`../docs/api.md`](../docs/api.md): the backend's routes
- [`../docs/sources.md`](../docs/sources.md): credits and licences
