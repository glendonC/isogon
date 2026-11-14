# Loading the Isogon scene in OpenSpace, and what to check

This page is for someone who has OpenSpace installed and an exported Isogon scene ([`README.md`](README.md) says how to export one). It says how to load the scene, how to play it, and what to look at.

**The scene has not been verified inside OpenSpace.** No load and no rendered frame of it is on record. Every point in section 5 is therefore an open question, not a description of known behaviour.

The scene is written for OpenSpace 0.21.3 and 0.22. The steps below name two installations: an unofficial 0.21.3 build for Apple silicon Macs, and OpenSpace 0.22.1 on Windows.

## 1. The two scenes

Export the same run twice. Each export is a folder that holds a `user` folder. With the region `plumas_ca` and the start 2021-07-20 the scene ids are:

- `isogon_plumas_ca_20210720`: detections drawn as GeoJSON shapes.
- `isogon_plumas_ca_20210720_images`: the same scene exported with `--footprints-as images`, detections drawn as images. Try it second.

## 2. Copy them into OpenSpace

The OpenSpace folder is the folder you unzipped (on the Mac, the one that holds `bin`).

1. Copy `user/data/assets/isogon_plumas_ca_20210720` into `<OpenSpace folder>/user/data/assets/`.
2. Copy `user/data/profiles/isogon_plumas_ca_20210720.profile` into `<OpenSpace folder>/user/data/profiles/`.
3. Make `assets` or `profiles` if they are not there yet. Do the same for the `_images` scene.

## 3. Start it

- Mac (the 0.21.3 build): leave `OpenSpace.app` in `bin` and double-click `bin/Start-OpenSpace.command`.
- Windows (0.22.1): run `bin/OpenSpace.exe`.

In the launcher, choose the profile `isogon_plumas_ca_20210720` and press Start. The first start downloads OpenSpace's own data for Earth, so it may take a while and needs the internet.

## 4. Play it

Click once in the OpenSpace window, then press:

| Key | What should happen |
| --- | --- |
| `1` | Earth from far away, a white box over northern California, a caption with the title at the bottom. Time is paused. |
| `2` | The camera flies closer (12 s). Time runs. Long orange and pale yellow outlines (satellite passes) appear and go. |
| `3` | The camera flies down over the box (10 s), then time runs. Orange squares (MODIS, about 1 km) and violet to pink cells (the model's estimate) change as time runs. |
| `4` | Time starts again from the beginning. Small pale yellow squares (VIIRS, 375 m) appear over the violet cells. |
| `5` | Time stops at the end. The sources caption shows. |
| `0` | The whole show, parts 1 to 5, about 2 minutes 20 seconds. Wait for it to end before pressing another key. |

## 5. What to look at

For each line, note yes or no and take a screenshot.

1. The launcher lists `isogon_plumas_ca_20210720`.
2. OpenSpace starts with the profile and shows Earth, with no error message that names `isogon`, `scene_data`, `GeoJson`, `vrt` or `asset`. If there is one, copy its text.
3. Key `1`: the white box sits over the Feather River area of northern California, and the title caption is readable.
4. Key `2`: pass outlines appear and disappear while time runs. A date and time are shown somewhere on screen.
5. Key `3`, after the camera stops: violet to pink cells appear. Are they small sharp squares, or a blur?
6. Key `3`: orange squares appear. Do they sit on the violet cells, or are they shifted? Do they look buried in the mountains or floating above them?
7. Key `4`: pale yellow squares appear over the violet cells, and change while time runs.
8. The frame rate (the number in the top-left corner, if shown) during keys `3` and `4`.
9. Key `0`: the show plays to its end without stopping or jumping back.
10. With the `_images` profile, lines 5 to 7 again: do the squares look better, worse or the same?

A useful report of a problem also holds:

- the OpenSpace version;
- on the Mac, the version of macOS;
- the newest log file from the OpenSpace folder (a file whose name starts with `log`).

The authors of the Mac build state two limits of that build that this scene does not cause: Earth's atmosphere does not render correctly, and positions can be slightly less precise.
