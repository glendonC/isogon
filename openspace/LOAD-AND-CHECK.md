# Loading the Isogon scene in OpenSpace, and what to report

This page is for someone who has OpenSpace installed: the unofficial 0.21.3plus build for Apple silicon Macs, or
OpenSpace 0.22.1 on a Windows PC. Nobody on the project has seen this scene render yet. What you see decides
what gets fixed.

## 1. The two folders

You get two scene folders. Each holds a `user` folder:

- `isogon_plumas_ca_20210720`: detections drawn as GeoJSON shapes.
- `isogon_plumas_ca_20210720_images`: the same scene with detections drawn as images. Try it second.

## 2. Copy them into OpenSpace

The OpenSpace folder is the folder you unzipped (on the Mac, the one that holds `bin`).

1. Copy `user/data/assets/isogon_plumas_ca_20210720` into `<OpenSpace folder>/user/data/assets/`.
2. Copy `user/data/profiles/isogon_plumas_ca_20210720.profile` into `<OpenSpace folder>/user/data/profiles/`.
3. Make `assets` or `profiles` if they are not there yet. Do the same for the `_images` folder.

## 3. Start it

- Mac (0.21.3plus): leave `OpenSpace.app` in `bin` and double-click `bin/Start-OpenSpace.command`.
- Windows (0.22.1): run `bin/OpenSpace.exe`.

In the launcher, choose the profile `isogon_plumas_ca_20210720` and press Start. The first start downloads
OpenSpace's own data for Earth, so it may take a while and needs the internet.

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

## 5. What to look at and report

For each line, answer yes or no and take one screenshot (on a Mac: Cmd+Shift+4, then Space, then click the
window).

1. The launcher lists `isogon_plumas_ca_20210720`.
2. OpenSpace starts with the profile and shows Earth, with no error message that names `isogon`, `scene_data`,
   `GeoJson`, `vrt` or `asset`. If there is one, copy its text.
3. Key `1`: the white box sits over the Feather River area of northern California, and the title caption is
   readable.
4. Key `2`: pass outlines appear and disappear while time runs. A date and time are shown somewhere on screen.
5. Key `3`, after the camera stops: violet to pink cells appear. Are they small sharp squares, or a blur?
6. Key `3`: orange squares appear. Do they sit on the violet cells, or are they shifted? Do they look buried in the
   mountains or floating above them?
7. Key `4`: pale yellow squares appear over the violet cells, and change while time runs.
8. The frame rate (the number in the top-left corner, if shown) during keys `3` and `4`.
9. Key `0`: the show plays to its end without stopping or jumping back.
10. With the `_images` profile, lines 5 to 7 again: do the squares look better, worse or the same?

Also send:

- the OpenSpace version you ran;
- on the Mac, the version of macOS;
- the newest log file from the OpenSpace folder, if you can find one (a file whose name starts with `log`).

Known on the Mac build, not caused by this scene: Earth's atmosphere does not render correctly, and positions can
be slightly less precise (its authors say so).
