# The fire cube

The fire cube holds every row of every NASA FIRMS country yearly file as monthly counts and summed fire radiative
power on a global grid. The record of any box on Earth is read from it in milliseconds, where the box calendar
(`backend/firms/box_index.py`) reads the rows themselves. It counts and scores nothing on its own: it keeps the rows'
kinds apart, and a reader applies a rule.

Code: `backend/firms/world_fetch.py` (the country files), `backend/firms/cube_build.py` (the builder and its check),
`backend/firms/cube.py` (the grid, the code layout and the reader).

## Where it lives

The cube and its source files live outside the repository, in one folder named by the environment variable
`ISOGON_WORLD_DIR` (default `data/cache/world` under the repository, which git ignores):

| Path | What |
| --- | --- |
| `firms/listing/`, `firms/raw/<product>/<year>/<file>.csv` | the FIRMS listing and every country file as downloaded, each with the manifest `backend/firms/archive.py` writes (`satellite_day_rows` included) |
| `firms/READY.md`, `firms/READY.json` | one line per country once every one of its files is complete and verified |
| `cube/parts/<Country>/` | one country's records, built once from its files, with `part.json` |
| `cube/builds/<build id>/` | one build of the whole cube |
| `cube/current` | a link to the latest build; it moves in one step, so a reader never mixes two builds |

## The country files

`world_fetch.py fetch` downloads all 238 countries the FIRMS listing publishes (10,095 files, 43.5 GB, no key). The
six countries of `FIRST_COUNTRIES` come first, then every other country from the smallest up. At most four files
are fetched at a time, with a pause between files and a retry on errors. A file counts only when its bytes equal the
listing and its sha256 equals its manifest; a run that stops resumes where it was. Countries already in the
repository cache are cloned from it, so the cube counts the same bytes the calendar counts.

## The grid

- A quarter of a degree in latitude and longitude, 1440 columns by 720 rows, about 28 km at the equator.
- `col = floor((lon + 180) / 0.25)`, `row = 719 - floor((lat + 90) / 0.25)`; row 0 is the north, so every
  `(720, 1440)` array is a north-up image. `cell = row * 1440 + col`.
- A cell holds the rows with `west <= lon < east` and `south <= lat < north`. Longitude 180 is in the last column,
  latitude 90 in the first row.
- Months: index 0 is 2000-11, Terra's first month. Days, for the outage table: index 0 is 2000-11-01 (UTC).

## What each record holds

Each row lands in one key of cell, month and code. The code packs five fields:

| Field | Values |
| --- | --- |
| platform | 0 Terra, 1 Aqua, 2 Suomi NPP, 3 NOAA-20 |
| day or night | 0 day (`D`), 1 night |
| kind | 0 fire (type 0, or a file with no `type` column), 1 active volcano, 2 static land source, 3 offshore |
| scan class | the pixel's width across the track against edges per instrument (MODIS 1.25, 1.75, 2.5 km; VIIRS 0.47, 0.66, 0.94 km): the number of edges the row's `scan` reaches, 0 to 3. The VIIRS edges are the MODIS ones times its 375 m pixel at nadir |
| confidence class | 0 low, 1 nominal, 2 high. VIIRS `l`, `n`, `h`; MODIS below 30, 30 to 79, 80 and up |

`code = (((platform * 2 + daynight) * 4 + kind) * 4 + scan_class) * 3 + confidence_class`. Each record holds `rows`
and `frp`, the sum of the rows' fire radiative power in MW. Every marginal is a sum of records.

No row is dropped. A row whose position or date cannot be read is counted as skipped in the manifest. Before a file is
read, its sha256 must equal its manifest's, and after it, its rows must equal the rows the manifest records.

No line of the country files repeats inside one country's files. A few pairs of rows share position, day, time and
platform but differ in brightness and fire power: two detections whose positions round alike, both kept. A row can
sit in two countries' files only where their outlines meet; in the files as downloaded that is 8 rows, all in one
cell on the water at Point Roberts (United States and Canada), and the cube counts them twice, as the box route does.

## Which rows count

- The box rule, the rule of `GET /api/calendar?source=firms&box=`: fire is kind 0; kinds 1, 2 and 3 are counted
  apart.
- The region rule of `GET /api/calendar?source=firms&region_id=` keeps type 3 rows farther than 500 m from the sea
  in the region's elevation model. The cube has no elevation model, so it keeps kind 3 apart in every cell; the
  region rule's figure is kinds 0, 1 and 3 less the region's `offshore_on_sea_excluded`.
- Outages, by the calendar's rule: a day inside a platform's operating span on which it has no row in any loaded
  country file while the other platforms together have at least 100. `platform_day_rows.npy` keeps the rows per
  country, platform and day, so the rule can be applied over any set of countries; `outage_days.npy` is the rule
  over every loaded country.
- A platform delivers in a month when any loaded country file has a row of it that month (`delivering.npy`); a
  month in which it does not deliver is null for it, not zero.

## Not loaded is not zero

`loaded.npy` is 1 where some loaded country file has a row in the cell in some year. Elsewhere a cell is not loaded
and reads null. No country boundary file is held, so a cell inside a loaded country where no row ever fell also reads
not loaded, and a cell on a border holds the rows of the countries loaded so far. Every answer names the countries
that gave rows in its box (`cell_countries.npy`, ids into `countries.json`) and says whether every listed country is
loaded (`world_complete` in the manifest).

## The files of a build

All arrays are `.npy`, little endian, read with `np.load(path, mmap_mode="r")`.

| File | dtype, shape | What |
| --- | --- | --- |
| `grid.json` | | the grid, the months, the fields and the code layout |
| `records.npy` | `month <u2, code <u2, rows <u4, frp <f4`, `(R,)` | every record, sorted by cell, month and code |
| `cell_start.npy` | `<i8`, `(1036801,)` | the records of cell `c` are `records[cell_start[c]:cell_start[c + 1]]` |
| `loaded.npy` | `u1`, `(720, 1440)` | where a loaded country file has a row |
| `cell_countries_start.npy`, `cell_countries.npy` | `<i8`, `<u2` | the countries with a row in each cell |
| `platform_day_rows.npy` | `<u4`, `(countries, 4, days)` | rows per country, platform and day, from the raw manifests |
| `outage_days.npy` | `u1`, `(4, days)` | the outage rule over every loaded country |
| `delivering.npy` | `u1`, `(4, months)` | where a platform delivers |
| `countries.json` | | every listed country: id, loaded, files, rows, digest |
| `manifest.json` | | every source file with its sha256, bytes, rows in the file and rows in the cube; the sha256 of every array; the build's code |
| `layers/` | | world layers, below |

The cells of one row of the grid have consecutive ids, so a box is one slice of `records` per row of the grid. The
reader sums each slice by month and code; the code is a mixed radix number of its five fields, so that one table
reshapes into an axis per field, and the time of a read grows with the records in the box, not with its tables:

```python
from backend.firms.cube import Cube
t = Cube().box((-122.5, 39.0, -120.0, 41.0))
t["rows"]    # (months, 4 platforms, day and night, 4 kinds)
t["frp"]     # the same, MW
t["fire_rows_by_scan"], t["fire_rows_by_confidence"]
t["cells"], t["cells_loaded"], t["countries"]
```

A box is answered on whole cells. By default it takes every cell it touches (`how="outer"`), so no row of the box is
left out and rows near it come in; `how="inner"` takes only the cells wholly inside it. The answer gives the box on
the grid beside the box asked for.

## Routes

`backend/server_cube.py` answers these (`cube_route(route, query)`), mounted in the main server or run alone:

| Route | Answer |
| --- | --- |
| `GET /api/cube/record?box=w,s,e,n[&snap=outer\|inner]` | the Record of the box in the shape of `GET /api/calendar?source=firms&box=` (records with `raw_counts` per platform, the harmonization and its held-out check, the annual summary, the month medians), with `frp_mw`, `frp_mw_day` and `frp_mw_night` in each platform's counts and a `cube` block: the build, the box on the grid, the cells and how many are loaded, the countries, `world_complete`, the read time |
| `GET /api/cube/tables?box=w,s,e,n[&snap=outer\|inner]` | the box's tables as lists: rows and fire radiative power by month, platform, day and night and kind; fire rows by scan class and by confidence class; delivering months and outage days per month |
| `GET /api/cube/countries` | the countries loaded in the cube and not, and the download's progress |
| `GET /api/cube/layers`, `GET /api/cube/layers/<name>.png`, `.npy` | the world layers |

A box takes the same limits as the box calendar (at most 20 degrees each way). A box in which no loaded country file
has a row answers 404 with `"state": "not_loaded"`, never a record of zeros. The outage days of a cube Record are
the rule over every country loaded in the cube, so they can differ from the box calendar's, which applies it over
the countries of the repository cache.

## Building

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/world_fetch.py fetch --store <world>/firms
uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/cube_build.py build
uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/cube_build.py check
```

`build` takes every country whose every file is in the store with its manifest. A country's part is rebuilt only
when one of its files changes, so adding a country reads that country alone; the parts are then merged into a new
build. Parts are built in parallel, one process per country.

## The check against the calendar

`cube_build.py check` compares the cube with the calendar for the regions of the calendar, through the box index,
a reader of the same files separate from the cube's:

1. the calendar's `raw_counts` on a region's context box against the box index on that box, edges included;
2. the cube on the grid boxes around the region's box (every cell it touches, and the cells wholly inside) against
   the box index on those boxes with the cube's edge rule, per month, platform, day and night and kind;
3. the calendar's figure between the cube's inner and outer figures;
4. the box route (`GET /api/calendar?source=firms&box=`) on the outer grid box against the cube: they differ only by
   the rows lying exactly on the box's east or north edge, which the route includes and a cube cell does not;
5. outage days by the calendar's rule over the calendar's countries, from the cube's table, against the calendar's.

## World layers

`layers/` holds `(720, 1440)` float32 arrays on the grid and a PNG of each, north up, one pixel per cell, drawn from
the records with nothing interpolated or smoothed: fire rows of MODIS (Terra and Aqua) and of VIIRS (Suomi NPP and
NOAA-20) over every month; the same from 2012-01 for MODIS and for Suomi NPP alone; summed fire radiative power of
each family. The PNGs are on a log scale from dark red to amber, so they read on a light page and on a dark one
(`layers.json` gives the scale, the ramp and each layer's maximum); a cell that is not loaded is transparent, a
loaded cell without the layer's rows is grey.

## The public cube

A static page has no backend, so it cannot ask the routes for a drawn box. `backend/firms/cube_public.py write`
writes, from the current build, the counts a box's Record is computed from, in one file a browser sums any box from:
`<world>/cube/public/` holds `fire-cells.bin.gz`, `manifest.json` and `harmonize-fitted.json`.

- Per cell and month, the fire rows (kind 0, day and night together, the box rule) of Terra, Aqua, Suomi NPP and
  NOAA-20; cells and months with no fire row are left out. One bit per cell says whether the cell is loaded.
- The manifest gives the grid, the months, each platform's delivering months and outage days per month, the sections
  of the file, and every file's sha256 with the build it was written from.
- The cells the closed rule closes (`backend/model/training.py`, `closed_for`: a cell meeting a test fire's region's
  context box, in the years of its fire) lose those months for every platform; the manifest lists them, and a box
  holding one of them reads those months as closed, never zero.
- `harmonize-fitted.json` is `backend/model/harmonize_fitted.py`'s tables as JSON, for the served method.
- Not in it: the static, offshore and volcano rows, fire radiative power, the day and night split, the pixel width and
  confidence classes, the countries of a cell.

The file is little endian typed arrays after an 8 byte magic, every section on a multiple of 4 bytes, gzipped:

| Section | Type | Length | What |
| --- | --- | --- | --- |
| `cell_delta` | uint32 | cells with entries | each such cell as a step from the previous one (the first from 0) |
| `cell_entries` | uint16 | cells with entries | entries of each such cell |
| `month_step` | uint8 | entries | the entry's month as a step from the cell's previous entry (the first from month 0); a gap of more than 255 months holds an entry of all zeros |
| `rows_<p>` | uint8 | entries, per platform | fire rows; 255 means the count is in the escape list |
| `big_step_<p>`, `big_rows_<p>` | uint32 | escaped entries, per platform | the escaped entries' indices, each as a step from the previous, and their counts |
| `loaded` | uint8 | 129,600 | one bit per cell: byte `cell >> 3`, bit `cell & 7` |

`PublicCube` in the same module reads the file as a browser does and sums a box on the cube's grid, outer by default.

## What is not in it

- NOAA-21, and the months after the last country file: they come from the FIRMS area API, which needs a key.
- A row's position inside its cell, its time of day, brightness and track. The rows stay in the store for any
  question the cube cannot answer.
