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
`index.json` and the files its entries name). With `--cube`, the public cube's three files (the monthly fire rows per
cell that the page sums a drawn box's Record from, written by `backend/firms/cube_public.py`) are copied to
`recorded/cube/public/`.

```bash
node scripts/build-public.mjs --recording <folder written by backend/server_recorder.py> --cube <the public cube's folder> --base /isogon/ --out dist/public
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
- **The workspace**: one stage, the guide's words on it, and the four steps below. The names of the landing's parts are in `src/app/names.ts`.

The workspace has no bar. Top left, the objective (one line of what the visitor is doing now), and under it a trail of
four words (Record, Estimate, Test, Play), each a way to its step, with the place and its days beside it, which open
Choose a Place. At the bottom, the guide: one or two sentences on what is on screen, and at most three actions, the next
one first; each action's key is the small mark before it. The words are read from `src/guide/script.json`, a committed
copy of the product lane's guide script (its `version` says which), so they change without code; its fields are filled
from the backend's answers in the script's formats (`src/guide/formats.ts`). Labels on things of the stage (the fire,
and later a square) are the script's too; an action that acts on a thing also shows beside it while the pointer or the
keyboard's focus is near. Every time on the workspace is by the sun at the fire, with the day and the part of the day;
UTC is written only in the document viewer. When a file of the run on show does not load, the stage puts no stand-in in
its place and the guide says first which one and what is drawn instead (`src/guide/missing.ts`).
The fire's label, with its pass and time, stands at the fire from a step's first screen; the step's sentence and its
action are the guide's alone. Labels stand clear of the fire's patches, under the trail and above the guide's words,
joined to them by a leader (`src/guide/place.ts`). The key of marks (`K` on Estimate and Test) lists each mark on show in the
script's words (`src/guide/marks.ts`).

| Step | What it does |
| --- | --- |
| Record | The fire record and Choose a Place (the compare-view lane's screens, mounted through the store); the guide says what a square is and offers the fire of the marked month, and beside the trail stands the record's span |
| Estimate | The fire close up with the sharp satellite (VIIRS) hidden: the white frames are the model's estimate from the coarse satellite (MODIS) alone. The guide speaks here; Enter reveals. A recorded test fire shows its record and every satellite; before 2012 nothing is hidden |
| Test | What the sharp satellite saw, and the verdict in the guide; `T` Side by Side, `S` the scores, `E` every test on record |
| Play | A round on the fire that is open, the whole box on its land, in the guide's words: the pass being decided on the fire, "Look here" beside the marked square, a look's finding on its square; at the end the results rows above the guide's line, then the other players and Finish. On a recorded test fire or before 2012 the guide says why no round is played |

Keys: on the landing a bare Enter opens the Record of the fire on show (`P` opens Choose a Place); where the guide
speaks, each action's key is shown beside it, a step's other actions work by their keys too (`K` the key of marks,
`L` the squares sized by chance), and `/` puts the focus in the field for asking, bottom right, whose questions are
answered from the guide's script; elsewhere `/` or Ctrl+K (Cmd+K) opens the search palette. Space plays or pauses the
passes, each held about a second and a half, and the strip of passes shows while they play, at the screen's foot or
when the fire's label is picked; the left and right arrows step through them, `M` opens the sensor reading, `C` starts
the camera tour, `N` goes to the next region, `1` opens Estimate, `2` and `3` Play, and Esc goes back. In a round the
arrows mark a square.

The Earth's years (`src/world/EarthYears.tsx`, `GET /api/cube/years`) are a screen of their own under the Record's
step (the script's step `years`): `O` opens them from Choose a Place and from the Record's view of the years as
counted, the address `?years` opens them at once (with `film`, they play once by themselves), and Esc goes back to
where they were opened from. The trail carries the step's objective and the guide its sentence and Back; the screen's
own keys are Enter and Space (play), the arrows (a year) and `Y` (the view).

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
