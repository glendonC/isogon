# Isogon in OpenSpace

OpenSpace is open-source planetarium software. This folder and `backend/openspace/` turn one real Isogon run
into a scene folder that OpenSpace loads: the satellites' passes over northern California, what MODIS detected,
the model's estimate made from MODIS alone, and then what VIIRS detected, which the estimate never saw.

Nothing else in Isogon imports this code. Deleting this folder, `backend/openspace/` and
`backend/tests/test_openspace_*.py` leaves the project as it was.

## Making a scene

With the backend running:

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.openspace.export --backend http://127.0.0.1:8788 --region plumas_ca --out <folder>/isogon_plumas_ca_20210720 --title "The Dixie Fire, northern California"
```

- It reads four routes: `GET /api/runs/starts`, `POST /api/reconstruct` (`source: firms`, `holdout_viirs: true`),
  the run's `belief_u8.bin`, and `GET /api/passes`. The swath polygons come from the NASA CMR pass files through
  `backend.firms.cmr_passes` (`--cmr-cache` names the folder).
- Every file before the reveal is written from the held-out run with every key the scorer wrote removed. The
  hidden VIIRS detections are fetched last, with `"reveal": true`.
- `--footprints-as images` draws the detections as image layers instead of GeoJSON (see the fallbacks below).
- `MANIFEST.json` lists every file with its digest, the stage it belongs to (`pre_reveal`, `reveal`, `static`),
  what it holds, the requests made and the counts.

Loading and playing it: `LOAD-AND-CHECK.md`.

## What the scene holds

| Layer | From | Drawn as |
| --- | --- | --- |
| Region box | `region.bbox` | white outline, at Earth scale only |
| Pass swaths | `/api/passes` times, CMR granule polygons | outline per pass, orange for MODIS, pale yellow for VIIRS |
| MODIS detections | `observer_passes.frames[*].footprints` | orange 1 km footprints, one file per overpass |
| Estimate | `belief_frames`, every 3 hours | violet to pink 375 m cells, opacity rising with the probability of burning |
| VIIRS detections | the reveal | pale yellow 375 m footprints, one file per overpass |
| Captions | the run's own fields | images on a dark band |

No spacecraft is drawn: OpenSpace's own satellite files use today's orbits, which would put 2021's satellites in
the wrong place. No score is shown.

## The show

Keys `1` to `5` set one part (time, layers, camera, caption); `0` plays all five, 138 seconds.

| Key | Part | Time | Camera |
| --- | --- | --- | --- |
| 1 | Earth and the title | paused at the window's start | 20,000 km |
| 2 | Passes | 30 hours in 31 s | 4,000 km |
| 3 | What MODIS saw, and the estimate | the window in 30 s | 120 km |
| 4 | What VIIRS saw | the window again in 34 s | 120 km |
| 5 | Sources | paused at the window's end | 120 km |

Layers switch at their own times through OpenSpace's script scheduler, so the scene stays right when time is
scrubbed backwards.

## OpenSpace 0.21.3 and 0.22

The scene is written to load in both. Each function, property and key below was read in OpenSpace's source at
both tags (`releases/v0.21.3`, `releases/v0.22.1`).

| Used | Where it is defined |
| --- | --- |
| profile format 1.4 (`version`, `meta`, `assets`, `camera` `goToGeo`, `time` with `is_paused`) | `data/profiles/default.profile` (0.21.3 writes 1.4, 0.22.1 writes 1.5) |
| `${USER_ASSETS}` in a profile's asset list | `openspace.cfg`, `src/scene/assetmanager.cpp` (`generateAssetPath`) |
| `asset.require` (returns the exports), `asset.resource(path)`, `asset.export(name, value)`, `asset.onInitialize`, `asset.onDeinitialize` | `src/scene/assetmanager.cpp` |
| `openspace.globebrowsing.addGeoJson`, `deleteGeoJson`, `addLayer`, `deleteLayer` | `modules/globebrowsing/globebrowsingmodule_lua.inl` |
| GeoJSON layers under `Scene.Earth.Renderable.GeographicOverlays.<id>`, keys `Identifier`, `Name`, `Description`, `File`, `Enabled`, `Opacity` | `geojsonmanager.cpp`, `geojsoncomponent.cpp`, `renderableglobe.cpp` |
| feature keys `stroke`, `stroke-width`, `fill`, `fill-opacity`, `altitudeMode`, `tessellate`, colours as `#rrggbb` | `modules/globebrowsing/src/geojson/geojsonproperties.cpp` |
| color layers under `Scene.Earth.Renderable.Layers.ColorLayers.<id>`, `FilePath`, default type `DefaultTileProvider` | `modules/globebrowsing/src/layer.cpp`, `layergroupid.h` |
| `ScreenSpaceImageLocal` with `TexturePath`, `Enabled`, `FaceCamera`, `CartesianPosition`, `Scale`; under `ScreenSpace.<id>` | `src/rendering/screenspacerenderable.cpp`, `src/engine/globals.cpp` |
| `openspace.addScreenSpaceRenderable`, `removeScreenSpaceRenderable` | `src/rendering/renderengine_lua.inl` |
| `openspace.scriptScheduler.loadFile` (keys `Time`, `ForwardScript`, `BackwardScript`, `Group`), `clear(group)` | `src/scripting/scriptscheduler_lua.inl`, `scriptscheduler.cpp` |
| `openspace.action.registerAction` (`Identifier`, `Command`, `Name`, `Documentation`, `GuiPath`, `IsLocal`), `triggerAction`, `removeAction` | `src/interaction/actionmanager_lua.inl` |
| `openspace.bindKey(key, action)` with key names `0` to `9`, `openspace.clearKey` | `src/interaction/keybindingmanager_lua.inl`, `include/openspace/util/keys.h` |
| `openspace.time.setTime`, `setDeltaTime`, `setPause`; `openspace.navigation.flyToGeo`; `openspace.scheduleScript`; `openspace.setPropertyValueSingle` | the scripting API reference of 0.21 and 0.22 |

Left out on purpose, because they arrived in 0.22: `ScreenSpaceText` and `ScreenSpaceDate` (captions are images
instead, and the date is OpenSpace's own), profile add-ons and format 1.5, a table for `bindKey`, property
bouncing. 0.22 moved Earth's asset to `earth/globe`; the scene names the node `Earth` and requires no Earth file
of its own, and the profile loads `scene/solarsystem/planets/earth/earth`, which both versions ship.

Arrived after 0.21.3 and not avoidable by the scene: 0.22.1 fixed GeoJSON disappearing in fisheye projection
(issue 4278), which is how a dome renders. Fallback: export with `--footprints-as images`, which draws the
detections as image layers; the swaths and the region box stay GeoJSON.

## What is not known until it runs

Placing a small image on the globe needs a GDAL VRT padded to the whole globe; whether it loads quickly and keeps
the cells square, how GeoJSON polygons sit on the canyon's terrain, the captions' size and place on screen
(flat and fisheye), and the frame rate with a pass of 1,307 footprints. `LOAD-AND-CHECK.md` asks for each.

## Tests

`backend/tests/test_openspace_export.py` (geometry, files, the reveal boundary, the image form, and a live export
when `ISOGON_OPENSPACE_LIVE` and `ISOGON_OPENSPACE_CMR` are set) and `backend/tests/test_openspace_modular.py`
(nothing else imports the package; every other backend module imports with it blocked).
