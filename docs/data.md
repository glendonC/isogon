# Data

This document describes the outside data Isogon reads: where each set comes from, how it is fetched, what is kept on disk and what the rows can and cannot say. It is for anyone who fills the local cache, reads the readers in `backend/firms/` and `backend/terrain/`, or needs to know which number came from which file.

Nothing here is needed to start the application. A fresh clone runs on the tracked files under `website/public/generated/` and serves simulated runs only. Real runs, the real calendar, the pass timeline and the next-look rounds need the local cache described below. Its folder layout is in [`data/README.md`](../data/README.md); licences and credits are in [sources.md](sources.md).

## What is read

| Data | From | Key needed | Read by | Kept under |
| --- | --- | --- | --- | --- |
| Fire detections, 2000 to the last full year | NASA FIRMS country yearly summary files | No | `backend/firms/archive.py` | `data/cache/firms/raw/`, `extract/` |
| Fire detections the yearly files lack (NOAA-21, and days after the last yearly file) | NASA FIRMS area API | `FIRMS_MAP_KEY` | `backend/firms/area_api.py` | `data/cache/firms/area/`, `extract/` |
| Every satellite pass, fire or no fire | NASA CMR granule search | No | `backend/firms/cmr_passes.py` | `data/cache/cmr/` |
| Elevation | Terrain Tiles on AWS Open Data (Terrarium encoding) | No | `backend/terrain/tile_store.py` | `data/cache/tiles/terrarium/` |
| Imagery | Esri World Imagery, USGS NAIP, EOX Sentinel-2 cloudless 2016 and 2020 | No | `backend/terrain/tile_store.py` | `data/cache/tiles/<source>/` |

FIRMS data is cached for eleven regions, listed under [Regions](#regions) below. Each region has two boxes. The region box is the box of its terrain; the context box has the same centre and five times the span (`CONTEXT_SCALE` in `backend/terrain/terrain_pack.py`). Rows are kept for the context box. The blind test scores inside the region box.

## Regions

The places registry (`backend/firms/places.json`) names each region's country file; the boxes are the presets of `backend/terrain/live_region.py`.

| Region | Country file | Region box centre (lon, lat) | Chosen for |
| --- | --- | --- | --- |
| `plumas_ca` | United States | -121.18, 40.05 | the Dixie Fire, 2021 (a recorded test fire) |
| `lytton_bc` | Canada | -121.58, 50.23 | the Lytton Creek fire, 2021 (a recorded test fire) |
| `evia_greece` | Greece | 23.30, 38.86 | the northern Evia fire, 2021 (a recorded test fire) |
| `ventura_ca` | United States | -119.22, 34.45 | the Thomas Fire, December 2017 |
| `kakisa_nt` | Canada | -116.96, 60.80 | the fires near Hay River and Enterprise, August 2023 |
| `okefenokee_ga` | United States | -82.27, 30.66 | the West Mims Fire, spring 2017 |
| `evros_greece` | Greece | 25.97, 41.03 | the Alexandroupoli and Dadia fire, August 2023 |
| `serra_acor_pt` | Portugal | -7.70, 40.19 | the fires of August 2025 in central Portugal |
| `maule_cl` | Chile | -72.19, -35.52 | the fires of January 2017 in the Maule coast range |
| `ljusdal_se` | Sweden | 15.42, 61.90 | the Kårböle and Ljusdal fires, July 2018 |
| `semey_kz` | Kazakhstan | 80.76, 50.48 | the Abai region fire, June 2023 |

The first three boxes were cut around their test fires. Each later box has the preset span, 0.52 by 0.38 degrees, and is placed where it holds the most MODIS rows in the dates of the fire it was chosen for, searched every 0.02 degrees within one to two degrees of the fire's reported point; the reported point only sets the search. Only MODIS rows place a box. A candidate becomes a region when the start rule in use (`real_start_dates` in `backend/model/real_run.py`) finds a start in the fire's dates; the rest were dropped (Smokehouse Creek in Texas, Pedrogao Grande and the October 2017 fires in Portugal, Knysna in South Africa, Kostanay in Kazakhstan, northern Ghana): fires that burned out in a day or two, or many small fires lit by day, give no 24 MODIS overpasses with a detection in eight days. No context box meets another region's, so no region holds a row of another's, and none holds a row of a recorded test fire's region.

A context box can reach past its country: `evros_greece` into Turkey, Bulgaria and the Aegean, `serra_acor_pt` into Spain, `semey_kz` perhaps into Russia. The region's rows come from its own country file only, so that ground has no rows, and the calendar's rates per area are low by that share; the ratio and its check are counts and are not affected.

A place of the Record only (`record_only_places` in the registry) has a box counted from the cached country files with the same held-out check and no run, round or play, because no start passes the rule there: northern Ghana, the hard case of many small fires. `GET /api/calendar/checks` lists the check of every region and of these places in one answer ([api.md](api.md)).

## Fire detections from NASA FIRMS

### Products and platforms

| Extract name | Area API sources | Platform | Instrument | First day of rows |
| --- | --- | --- | --- | --- |
| `modis` | `MODIS_SP`, `MODIS_NRT` | Terra, Aqua | MODIS, 1 km | Terra 2000-11-01, Aqua 2002-07-04 |
| `viirs-snpp` | `VIIRS_SNPP_SP`, `VIIRS_SNPP_NRT` | Suomi NPP | VIIRS, 375 m | 2012-01-20 |
| `viirs-jpss1` | `VIIRS_NOAA20_SP`, `VIIRS_NOAA20_NRT` | NOAA-20 | VIIRS, 375 m | 2018-04-01 |
| `viirs-noaa21` | `VIIRS_NOAA21_SP`, `VIIRS_NOAA21_NRT` | NOAA-21 | VIIRS, 375 m | 2023-03-01 |

The first days are the table `ARCHIVE_FIRST_DAY` in `backend/model/platforms.py`. The first three extract names are the names of the country files. NOAA-21 has no country file; its rows come from the area API and are stored under the name `viirs-noaa21`.

`SP` is standard processing, the science-quality archive. `NRT` is near real time. The two are never mixed without a record: the area API client takes `SP` wherever FIRMS says it covers a date and `NRT` only after it, and each extract's manifest says which source its rows came from.

### Country yearly files

`backend/firms/archive.py` downloads the FIRMS country yearly summary files. They need no key:

```
https://firms.modaps.eosdis.nasa.gov/data/country/<product>/<year>/<product>_<year>_<Country>.csv
```

The list of files is `https://firms.modaps.eosdis.nasa.gov/data/country/yearly_summary_files.txt`. The files carry standard processing rows. Their `version` column reads `6.2` for MODIS rows of 2000 to 2017, `6.03` for 2018 to 2022 and `61.03` for 2023 to 2025, and `2` for VIIRS throughout.

For each file the tool:

1. Stores the country file exactly as downloaded.
2. Extracts the rows inside each region's context box, with every original column and value.
3. Removes exact duplicates on satellite, instrument, acquisition date and time, latitude and longitude. The first is kept and the count is recorded.
4. Writes a manifest beside every file: source URL, query, retrieval time, bytes, SHA-256, rows, columns, versions, date range and lineage.

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.archive fetch --years 2000-2025
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.archive status
```

`reingest` rebuilds the manifests and extracts from the cached country files without a download.

A box calendar counts any country whose files are cached. To add a country, fetch its files by the name the FIRMS listing gives (`GET /api/firms/countries` lists all 238 with their sizes; Portugal is 48 files and 18.6 MB for 2000 to 2025, Australia 2.66 GB, which the 5 GB cache cap refuses today):

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/archive.py fetch --regions --countries Portugal --years 2000-2025
```

The next box request indexes the new files.

### Area API

`backend/firms/area_api.py` fetches what the country files lack: NOAA-21, and the days after the last country file year. A request looks like this:

```
https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/<source>/<west,south,east,north>/<days>/<YYYY-MM-DD>
```

- A free key comes from `https://firms.modaps.eosdis.nasa.gov/api/map_key/`. The client reads `FIRMS_MAP_KEY` from the environment, or from a `.env` file: the repository's own, or the one named with `--env-file`. It never prints the key, and every stored URL, manifest, log line and error message carries `<MAP_KEY>` in its place.
- NASA allows at most five days per area request (`MAX_DAYS`). The client asks in chunks of at most five days, one request at a time with a pause, and reads the key's transaction count as it goes so that it stays under the limit.
- It reads the `mapkey_status` and `data_availability` endpoints first, and uses `SP` where it covers a date and `NRT` after.
- Each reply is cached as returned, with a manifest. The replies are joined into per-year extracts in the same layout as the country file extracts, so one reader serves both.

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.area_api --env-file .env status
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.area_api --env-file .env fetch --sources VIIRS_NOAA21 --start 2023-01-01
```

### Columns

The extracts keep the source's own columns.

| Column | Meaning |
| --- | --- |
| `latitude`, `longitude` | Centre of the flagged pixel, degrees. |
| `acq_date`, `acq_time` | UTC date (`YYYY-MM-DD`) and time (`HHMM`) of the observation. |
| `satellite`, `instrument` | `Terra` or `Aqua` with `MODIS` (`T` or `A` in near real time files); `N` (Suomi NPP), `1` or `N20` (NOAA-20), `N21` (NOAA-21) with `VIIRS`. |
| `scan`, `track` | Size of the pixel on the ground across and along the track, km. It grows toward the edge of the swath. It is the size of one pixel, not a map of what the pass covered. |
| `frp` | Fire radiative power, MW. |
| `confidence` | A number from 0 to 100 for MODIS; a class `l`, `n` or `h` (low, nominal, high) for VIIRS. |
| `daynight` | `D` or `N`. |
| `version` | Collection and processing label. |
| `type` | `0` presumed vegetation fire, `1` active volcano, `2` other static land source, `3` offshore. Standard processing rows only; near real time rows have no `type` column. |
| `brightness`, `bright_t31` | MODIS brightness temperatures, K. |
| `bright_ti4`, `bright_ti5` | VIIRS brightness temperatures, K. |

### The reader

Other modules read rows through one function, `backend.firms.read_firms(box, start, end, platforms=None)`. It returns every cached row inside the box acquired in `[start, end)` UTC, sorted by time, each with its original columns plus `_platform`, `_product` and `_acq_utc`. It refuses a read it cannot answer: a box outside every cached context box, a year with no cached file, or a day past the last day an area API fetch covers raises `FirmsCacheMissing`. No data is never reported as no fire.

`GET /api/health` reports the number of rows in the downloaded files as `downloaded_firms_rows`, read from the manifests, and the rows inside each region's context box per platform.

### Which rows the calendar counts

The monthly calendar (`backend/firms/real_calendar.py`) counts every row except:

- `type` 2 rows (static land sources such as plants and refineries), and
- `type` 3 rows (offshore) on the sea or within 500 m of it in the region's context elevation. A type 3 row farther inland counts: in the Plumas box such rows are fire beside mountain lakes.

A platform has an outage day when it has no row in any cached country file on a day inside its operating span while the other platforms together have at least 100. Months with an outage day of Suomi NPP, Terra or Aqua are left out of the ratio fit and its validation. July 2024 is one: the calendar of `plumas_ca` counts 10 Suomi NPP outage days in that month (`records[].raw_counts` of `GET /api/calendar?source=firms&region_id=plumas_ca`).

The calendar ends at the last country file month, December 2025. Rows of 2026 come from the area API for the region box only, so an outage cannot be told from a quiet day, and near real time rows have no `type` column, so static sources cannot be left out.

### Any box

A box anywhere in the cached countries (United States, Canada, Greece, Portugal, Chile, Sweden, South Africa, Kazakhstan and Ghana) has a calendar too (`GET /api/calendar?source=firms&box=`). Its rows are every row of the country files inside it, read through an index built once from those files (`backend/firms/box_index.py`, `data/cache/firms/index/`: one table per country file, 431 files and 497 MB for the nine countries; the first three countries' 144 files took 47 seconds on the machine the project was built on, the other six countries' 287 files 16 seconds). A box leaves out every row of type 1 (active volcano), 2 (static land source) and 3 (offshore), since it has no elevation model to tell an inland type 3 row from one at sea; the region calendars keep their own rule above. On a region's context box the box calendar counts the same rows per platform and month as the region extracts, once those kinds are added back.

This month so far (`GET /api/calendar/current`) is read from the area API, near real time, for the box, over the full UTC days of the month, and set beside the median of the same calendar month over the years of the country files. Its rows have no `type` column, so they count what the calendar leaves out; the answer says so.

### What the rows cannot say

FIRMS lists detections. A place with no row was either not burning, not passed over, or under cloud or smoke, and the rows alone cannot tell which. The pass schedule below adds the passes that flagged nothing. A cloud mask per pixel is not fetched, so a pass that flagged nothing may have looked at clear ground or at cloud.

## Pass schedule from NASA CMR

`backend/firms/cmr_passes.py` lists every granule of the active fire products whose footprint meets a region's context box, fire or no fire, from NASA's Common Metadata Repository. The search needs no login:

```
https://cmr.earthdata.nasa.gov/search/granules.json?collection_concept_id=<id>&bounding_box=<w,s,e,n>&temporal=...
```

| Platform | Product | Version | Collection concept id | First granule day |
| --- | --- | --- | --- | --- |
| `MODIS_TERRA` | `MOD14` | 061 | `C2271754179-LPCLOUD` | 2000-02-24 |
| `MODIS_AQUA` | `MYD14` | 061 | `C2278858993-LPCLOUD` | 2002-07-04 |
| `VIIRS_SNPP` | `VNP14IMG` | 002 | `C2734202914-LPCLOUD` | 2012-01-17 |
| `VIIRS_NOAA20` | `VJ114IMG` | 002 | `C2734197957-LPCLOUD` | 2018-01-01 |
| `VIIRS_NOAA21` | `VJ214IMG` | 002 | `C2831626262-LPCLOUD` | 2023-02-10 |

Each granule gives its time span, a day or night flag, its swath polygon and, for MODIS, cloud cover. The polygon is geodetic, so its edges are followed along great circles before a box is tested against it. Consecutive granules of one platform form one pass.

This is metadata, not FIRMS rows. It is not counted in `downloaded_firms_rows`.

### Cache and reader

Each reply is stored gzip-compressed with a manifest (URL, query, retrieval time, hits, entries, bytes, SHA-256). The granules of each year are then written compact and deduplicated, and that file is what the reader reads.

`cmr_passes(box, start, end, platforms=None, tiles=None)` returns the passes with the share of the box, and of each tile when tiles are given, that lies inside the swath, whether the whole box does, the day or night flag and the cloud cover where the granules give it. It raises `CmrCacheMissing` for months that are not cached.

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.cmr_passes plan --first 2012-01 --last 2025-12
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.cmr_passes fetch --first 2012-01 --last 2025-12
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.cmr_passes status
```

`plan` prints the number of monthly requests a span needs without making one: 6,985 for 2012 to 2025 over the eleven boxes (1,905 over the first three). `status` prints the totals of the cache; with every box fetched it holds 781,143 granule entries, about 305 MB as transferred and 161 MB stored (196,082 entries and 77 MB for the first three).

### What the schedule is used for

- A real run's 24 frames are the first 24 passes whose swath held the whole region box, of every platform, fire or no fire (`run_frames` in `backend/model/real_blind.py`).
- The blind test publishes one prediction per pass of a hidden platform, at the minute the scan crossed the box and with the pixel size there, and scores a pass that flagged nothing as a look that flagged nothing ([method.md](method.md)).
- The pass timeline, `GET /api/passes`, serves the passes of a window ([api.md](api.md)).

Where no pass list is cached for a window, a run's frames fall back to the overpasses of the visible rows and the blind test to nominal half-day slots (`backend/eval/schedule.py`). The answer says which was used, in `window.frames_from` and `blind_test.schedule.source`.

### Gaps in the collections

A cross-check of the pass list against FIRMS rows over the three context boxes found these gaps. The pass timeline names them when a window meets one (`KNOWN_GAPS` in `backend/firms/pass_timeline.py`).

| Platform | When | What is missing |
| --- | --- | --- |
| NOAA-20 | March to June 2018 | `VJ114IMG` 002 holds few granules: 4 to 11 passes over a box in April 2018 and 0 or 1 in May, against about 100 in a normal month. FIRMS has NOAA-20 rows from April 2018, so 196 of its overpasses with a detection in a context box have no pass. The 750 m product of the same instrument, `VJ114` 002, has the full count for those months. |
| Terra | 13 to 15 May 2025 (12 to 15 over Evia) | `MOD14` 061 has no granule over the boxes, and none anywhere on 14 May, yet FIRMS has Terra rows on 14 and 15 May. |
| Aqua | 1 to 15 April 2022 | `MYD14` 061 has no granule over the boxes, and FIRMS has no Aqua row either. |
| Suomi NPP | Before 2012-01-17 | The collection begins on that day, so January 2012 is half a month. |

The NOAA-20 figures can be read from the pass timeline with `box=context`, `platforms=VIIRS_NOAA20` and a window over 2018: the passes per month, and the list `firms_overpasses_without_a_pass`.

### The pass timeline

`GET /api/passes?region_id=<id>&start=<date>&end=<date>` (`backend/firms/pass_timeline.py`) serves the passes over a region's box, or its context box, for a window of up to 366 days. Each pass says whether FIRMS has a detection in the box on it: a FIRMS overpass of the same platform within 5 minutes of the pass's granule span. FIRMS overpasses that no pass matches are listed apart.

## Terrain and imagery

`backend/terrain/tile_store.py` keeps Web Mercator tiles on disk under `data/cache/tiles/<source>/<z>/<x>/<y>.<ext>`.

| Source key | Service | Used for |
| --- | --- | --- |
| `terrarium` | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`; elevation in metres is `R * 256 + G + B / 256 - 32768` | Every elevation grid |
| `esri_world_imagery` | Esri World Imagery tile service | Default imagery of a run and of a terrain pack |
| `usgs_naip` | USGS The National Map, imagery only | Optional pack imagery for the conterminous United States, public domain (`"imagery_source": "usgs_naip"`) |
| `eox_s2cloudless_2016` | EOX Sentinel-2 cloudless 2016 | Pack imagery outside the conterminous United States on a server started with `--imagery-elsewhere eox_s2cloudless_2016`, licensed CC BY 4.0 ([sources.md](sources.md)) |
| `eox_s2cloudless_2020` | EOX Sentinel-2 cloudless 2020 | Fallback when the default imagery cannot be fetched, and the tracked Feather River image |

Two modules turn tiles into what a run serves:

- `backend/terrain/live_region.py` builds, for any region, a 256 by 256 and a 512 by 512 elevation grid and a 2048 by 2048 image, reprojected to latitude and longitude.
- `backend/terrain/terrain_pack.py` builds a terrain pack: a 1024 by 1024 elevation grid, an 8192 or 4096 pixel image, a 2048 pixel auxiliary map (surface normals, sky view, canopy index), an optional zoom 16 inset and, for each region with FIRMS rows, the context terrain around it (five times the span, 1024 elevation posts, 4096 pixel image).

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.terrain.terrain_pack build plumas_ca lytton_bc evia_greece
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.terrain.terrain_pack context
```

Esri publishes World Imagery for viewing, not for export. Tiles fetched from it stay in the git-ignored cache; no tracked file holds one. See [sources.md](sources.md).

## Files tracked in the repository

| Path | What |
| --- | --- |
| `website/public/generated/terrain/` | The Feather River elevation grid (`ca_dem_f32.bin`, 256 by 256 float32), its normal map, a Sentinel-2 cloudless image, a global Blue Marble image and a global bump map. `terrain_manifest.json` lists each with its source and SHA-256. |
| `website/public/generated/fields/` | One simulated run: `reconstruction_u8.bin` (6,291,456 bytes), `observer_passes.json`, `calendar_2000_2026.json`, `sensor_model_diagnostics.json` and `field_metadata.json`. Written by `backend/model/reconstruct.py`. No FIRMS row is in them. |
| `backend/model/fitted_values/`, `backend/env/fitted/` | The fitted values and recorded results the model and the environment read ([method.md](method.md)). |
| `backend/tests/fixtures/` | Invented FIRMS rows and two recorded CMR answers for the tests. |
| `data/datasets.json` | A reference list of the NASA products named here and nearby ones, with their identifiers. No code reads it. |

## What is not fetched

- No cloud mask or per-pixel coverage product (`MOD35`, `MYD35`, the VIIRS geolocation files). The MODIS cloud cover in the pass list is a mean over a whole granule, about 2,300 by 2,000 km, and the VIIRS fire granules carry none.
- No imagery of fire. NASA GIBS supplies one static Blue Marble image for the globe; it is not used as an observation.
- No Landsat fire detections, and no rows outside the cached country files.
