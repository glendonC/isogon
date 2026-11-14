# Isogon website

`website/` is the React, TypeScript, and Three.js browser client for Isogon, providing the landing view, the monthly burning-activity calendar (2000 to 2025 on real FIRMS archives), blind-test score tables, and the 3D terrain cutaway workspace. Read this file to install, run, build, or navigate the frontend package.

## Commands and local port

Run all frontend commands from `website/` (Node.js 20+ and `npm`):

```bash
# Install exact dependencies from package-lock.json
npm ci

# Start the Vite 6 dev server on http://127.0.0.1:5188 (--strictPort)
npm run dev

# Type-check (tsc -b) and build the production bundle into dist/
npm run build

# Serve the built dist/ bundle locally on http://127.0.0.1:5188 (--strictPort)
npm run preview
```

Both `npm run dev` and `npm run preview` bind exclusively to `127.0.0.1:5188` with `--strictPort` (`package.json` and `vite.config.ts`), failing immediately rather than picking another port if `5188` is occupied.

## Backend connection and `VITE_API_BASE`

By default, `src/App.tsx` sends API requests to `http://127.0.0.1:8788`:

```ts
const API_BASE: string = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8788';
```

Start the Python backend from the repository root (`uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.server`) to enable live `POST /api/reconstruct`, `GET /api/calendar`, `GET /api/observer`, `GET /api/sensor-model`, terrain packs, and GeoJSON/CSV downloads. To point the client at a non-default local port, set `VITE_API_BASE` when running Vite:

```bash
VITE_API_BASE=http://127.0.0.1:8790 npm run dev
```

Note that `backend/server.py` restricts CORS to `localhost`, `127.0.0.1`, and `[::1]` origins. In client state (`src/content/realRuns.ts` and `src/App.tsx`), real NASA FIRMS runs (`source: "firms"`) and simulated runs (`source: "simulated"`) are kept strictly separate: if a `source: "firms"` request receives a simulated payload, the UI rejects the response rather than rendering simulated numbers as observations.

## Static assets and offline fallback

`website/public/` ships static geospatial, field, and 3D model assets so the application renders immediately before live API responses arrive and remains interactive when the Python backend is offline:

- **`public/generated/terrain/`** (documented with SHA-256 checksums in `terrain_manifest.json`):
  - `ca_dem_f32.bin`: 256 x 256 little-endian `float32` DEM (262,144 B) for Feather River Canyon, CA (-121.60 to -120.75 longitude, 39.75 to 40.35 latitude), derived from AWS Terrain Tiles / USGS 3DEP.
  - `ca_normals.png` (512 x 512 RGB normal map) and `ca_satellite.jpg` (1024 x 1024 EOX Sentinel-2 cloudless 2020 orthoimagery, CC BY 4.0).
  - `earth_day.jpg` (2048 x 1024 NASA GIBS Blue Marble Next Generation) and `earth_bump.png` (1024 x 512 global Terrarium elevation bump map), used by `src/ui/Locator.tsx` and global context views.
- **`public/generated/fields/`** (documented in `field_metadata.json`):
  - Precomputed simulated Feather River bundle (`reconstruction_u8.bin`, `observer_passes.json`, `calendar_2000_2026.json`, `sensor_model_diagnostics.json`). On startup, `EarthCutawayStage.tsx` hydrates `plumas_ca` from these files if no live `/api/reconstruct` run has arrived yet, and synthesizes deterministic procedural DEMs, ortho textures, and tensors for `lytton_bc`, `evia_greece`, and `blue_mountains_au` when offline.
- **`public/models/spacecraft/`** (documented with SHA-256 checksums and license notes in `manifest.json`):
  - NASA 3D Resources glTF 2.0 binary models: `terra.glb` (uncompressed glTF 2.0 with missing external `.tga` references stripped via `backend/terrain/glb_tools.py`), `aqua.glb` (`KHR_draco_mesh_compression` + WebP/PNG textures decoded via Three.js `DRACOLoader` WASM), and `suomi_npp.glb` (Draco + WebP/PNG). Because NASA 3D Resources publishes no distinct NOAA-20 or NOAA-21 spacecraft mesh, `src/stage/engine/spacecraft.ts` renders a procedural spacecraft rig for those platforms and while `.glb` assets load.

## Source layout

| Path | Role |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | React entrypoint, top-level state, abortable `/api/reconstruct` and `/api/observer` requests, theater switching (`plumas_ca`, `lytton_bc`, `evia_greece`, `blue_mountains_au`), and keyboard shortcuts (`1`..`4` workspace views, `Space` play/pause, `V` VIIRS holdout toggle, `M` sensor briefing, `/` or `Cmd+K` / `Ctrl+K` search palette, `C` cinema tour, `H` clean HUD, `N` next region, `U` uncertainty overlay, `Esc` return) |
| `src/components/` | Workspace panels and modal sheets: `BurningCalendar.tsx`, `BlindScoreTable.tsx`, `CommandAskPalette.tsx`, `MethodSheet.tsx`, and `StageTimelineTrack.tsx` |
| `src/stage/` | `EarthCutawayStage.tsx` WebGL2 stage component, `earthCutawayShaders.ts` heightfield/curtain/skirt shaders and tensor alignment, `orbitalDirector.ts` camera presets and slews, `SensorDiagnosticModal.tsx`, and stage TypeScript contracts (`earthCutawayTypes.ts`, `types.ts`) |
| `src/stage/engine/` | Modular Three.js rendering subsystems: `terrainShader.ts`, `terrainPack.ts`, `contextTerrain.ts`, `hdrPipeline.ts`, `atmosphere.ts`, `shadowBake.ts`, `fireField.ts`, `footprintField.ts`, `scanGeometry.ts`, `smokeVolume.ts`, `smokeNoise.ts`, `spacecraft.ts`, `slabFrame.ts`, `landingFrame.ts`, and `noiseGlsl.ts` |
| `src/ui/` | Landing view and shared UI hooks/utilities: `LandingComposition.tsx`, `IsogonMark.tsx`, `Locator.tsx`, `SplitHeadline.tsx`, `attribution.ts`, `plainText.ts`, `useCalendar.ts`, `useSensorModel.ts`, and `useDialogFocus.ts` |
| `src/content/` | Typed API parsers and region copy: `theaters.ts` (4 UI theater presets and example search places), `realRuns.ts` (real-run detection, start selection, `log10` legend ticks, and blind-test parser), and `calendar.ts` (monthly calendar views and overlap-ratio metrics) |
| `src/lib/` | `colormaps.ts` (256-stop Fabio Crameri `lipari`, `batlow`, and `roma` lookup tables) and `earthAtlas.ts` (`world-atlas` / `topojson-client` land-mask helpers) |
| `src/styles/` | CSS stylesheets: `tokens.css`, `landing.css`, `workspace.css`, `calendar.css`, `briefing.css`, and `sheets.css` |

## Related documentation

- [`../README.md`](../README.md): Project overview, quickstart, validation scores, region support, and known limits
- [`../docs/architecture.md`](../docs/architecture.md): System architecture, binary formats, caching, and coordinate registration contracts
- [`../docs/api.md`](../docs/api.md): Backend HTTP endpoints, request bodies, and response schemas
- [`../docs/sources.md`](../docs/sources.md): Upstream dataset citations, imagery attributions, and license terms
