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

## The backend

The site calls the backend at `http://127.0.0.1:8788` (`API_BASE` in `src/App.tsx`). Start it from the repository root:

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.server
```

To use another address, set `VITE_API_BASE`:

```bash
VITE_API_BASE=http://127.0.0.1:8790 npm run dev
```

The backend accepts browser requests only from pages served on `localhost`, `127.0.0.1` or `[::1]`. Its routes are described in [`../docs/api.md`](../docs/api.md).

Without a backend the site still opens and the stage draws `plumas_ca` from the tracked files under `public/generated/`. The real calendar, real runs, the blind test and the rounds need the backend.

## What the page is

- **The landing page** (`src/ui/LandingComposition.tsx`): the stage from far away, a headline, one entry into the first application, and below it three parts (world model, environment, agent) whose status lines are read from `GET /api/evidence`.
- **The workspace**: a top bar with the place and four steps, one panel, a pass track and the stage.

| Step | Key | What it does |
| --- | --- | --- |
| Record | `1` | The burning calendar of the region; pick a month to replay |
| Fire | `2` | The run with every sensor, pass by pass |
| Test | `3` | Hide VIIRS, see the estimate from MODIS alone, reveal VIIRS and the score |
| Look | `4` | Play one round of the next-look environment |

Other keys: Enter takes the step's forward action, Space plays or pauses, the left and right arrows step through the passes, `V` hides or reveals VIIRS, `L` starts a round, `/` or Ctrl+K (Cmd+K) opens the search palette, `M` opens the sensor reading, `U` toggles the uncertainty layer, `H` hides the interface, `C` starts the camera tour, `N` goes to the next region, and Esc goes back.

A real run and a simulated run are kept apart. When the site asks for a real run and the answer is not one, it is refused, so modelled numbers are never shown as observations.

Some surfaces read stand-in files in `src/content/demo/` instead of a route and say "Demo data" on screen: the Terra morning panel, and the calendar of a box outside the three regions with FIRMS rows. The evidence sheet reads `GET /api/evidence` and shows no figure until it answers. On the pass track, the passes that looked and flagged nothing come from the run itself when its frames are the NASA CMR pass list, and otherwise from `GET /api/passes`; where neither has them (before 2012), the track says it shows passes with fire only. [`../docs/architecture.md`](../docs/architecture.md) lists them.

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
| `src/components/` | The workspace: `WorkspaceBar`, `BurningCalendar`, `PassTrack`, `Debrief` and `BlindScoreTable`, `NextLookRound`, and the sheets (`ReadingSheet`, `MethodSheet`, `SourcesSheet`, `EvidenceSheet`, `AreaSheet`, `CommandAskPalette`) |
| `src/content/` | Readers of the backend's answers and the page's texts: `calendar.ts`, `realRuns.ts`, `nextLookEnv.ts`, `passTrack.ts`, `partsStatus.ts`, `sources.ts`, `theaters.ts`; stand-in data in `demo/` |
| `src/stage/` | The stage component (`EarthCutawayStage.tsx`), its shaders and types, and the camera (`orbitalDirector.ts`) |
| `src/stage/engine/` | The stage's parts: terrain and terrain packs, context terrain, light and atmosphere, shadows, fire, footprints, smoke, spacecraft, framing |
| `src/lib/` | Colour scales (`colormaps.ts`) and land outlines (`earthAtlas.ts`) |
| `src/styles/` | Style sheets, with the shared values in `tokens.css` |

## Related documents

- [`../README.md`](../README.md): what Isogon is and how to run it
- [`../docs/architecture.md`](../docs/architecture.md): the site's landing page, steps and stage in more detail
- [`../docs/api.md`](../docs/api.md): the backend's routes
- [`../docs/sources.md`](../docs/sources.md): credits and licences
