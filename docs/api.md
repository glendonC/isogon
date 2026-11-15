# HTTP API

This document lists every route the backend serves: its method, its parameters, the shape of its answer and its errors. It is for anyone who calls the backend from the site, from a script or from a test.

The routes are in `backend/server.py` and, for the next-look rounds, `backend/server_next_look.py`. Field names below come from that code and from answers of a running backend. Sample answers are shortened: long arrays are cut to one or two entries and long sentences to `...`, and each sample says so.

## Conventions

Start the server from the repository root. It listens on `127.0.0.1:8788`; `--host` and `--port` change that.
`--imagery-elsewhere eox_s2cloudless_2016` makes a run take the 2016 Sentinel-2 layer, which may be published, where
the public-domain imagery does not cover its box (the default there is `esri_world_imagery`); a server started to be
recorded for the public page uses it.

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.server
```

- **Answers** are JSON (`application/json; charset=utf-8`) unless a route says otherwise.
- **Errors** are a JSON object with one string, `{"error": "..."}`. `400` is a bad parameter or body, `404` an unknown route, region, run or round, or data that is not in the local cache, `409` a step that does not fit a round's state, `413` a body that is too large, `500` anything unexpected.
- **An unknown `GET` path** answers `404` with `error` and `available_endpoints`. An unknown `POST` path answers `404` with `error` only.
- **Paths** ignore a trailing slash. Every `GET` route also answers `HEAD`, and `OPTIONS` answers `204`.
- **Answers** written by the server from a value are strict JSON: a number that is not finite is written as `null`, never as `NaN` or `Infinity`.
- **Request bodies** are JSON objects. `NaN`, `Infinity` and `-Infinity` are refused. Types are not coerced: the string `"false"` is not a boolean. The limit is 262,144 bytes for `/api/reconstruct` and 65,536 bytes for the next-look routes.
- **Origins.** Only pages served from this machine may call the API from a browser: `Access-Control-Allow-Origin` is sent when `Origin` is `http` or `https` on `localhost`, `127.0.0.1` or `[::1]`. A `POST` with any other `Origin` answers `403`. A request with no `Origin`, such as one from a script, is served.
- **Caching.** Answers carry `Cache-Control: no-store`, except terrain pack files (below).
- **Two kinds of run.** A simulated run models a fire and the passes over it and uses no FIRMS row. A real run (`"source": "firms"`) reconstructs from cached NASA FIRMS rows. The two are never mixed, and every answer says which it is.
- **Regions with FIRMS data** are `plumas_ca`, `lytton_bc` and `evia_greece`. Routes that need real rows answer `404` for any other region.

## Routes

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Status, versions and row counts of the local cache |
| `GET /api/regions` | The preset regions and the places registry |
| `GET /api/field-meta` | Description of the tracked simulated field |
| `GET /api/calendar` | The burning calendar, simulated or real |
| `GET /api/calendar/current` | This month so far against the same month's median |
| `GET /api/calendar/rows.csv` | The FIRMS rows behind a calendar selection |
| `GET /api/calendar/checks` | The held-out check of the calendar's harmonization, for every place in one answer |
| `GET /api/firms/countries` | Every country file the FIRMS listing publishes, its size and whether it is cached |
| `GET /api/runs/starts` | The start dates worth showing for a real run |
| `POST /api/reconstruct` | Build or fetch a run |
| `GET /api/runs/<run_id>/<file>` | A run's files |
| `GET /api/runs/<run_id>/terrain/<name>` | A run's terrain pack files |
| `GET /api/observer` | One frame's passes and footprints, filtered |
| `GET /api/sensor-model` | Sensor curves and the simulated engine's gates |
| `GET /api/passes` | Every satellite pass over a region in a window |
| `GET /api/evidence` | The recorded tests and validation, as one document |
| `POST /api/env/next_look/reset` | Start a next-look round |
| `POST /api/env/next_look/step` | Decide one look of a round |
| `GET /api/env/next_look/state` | A round's state |
| `POST /api/env/next_look/play` | One reference player's play of an episode, step by step |
| `GET /api/env/next_look/players` | The reference players a play can be asked for |

## `GET /api/health`

No parameters. Always `200`.

```json
{
  "status": "ok",
  "service": "isogon-scientific-backend",
  "model_version": "0.9.0",
  "provenance_note": "Simulated run: a modelled fire seen by modelled satellite passes. No NASA FIRMS row is used in this run",
  "downloaded_firms_rows": 27609548,
  "firms_cache": {
    "downloaded_files": 1527,
    "rows_in_region_boxes": {"plumas_ca": {"Terra": 27884, "Aqua": 29485, "Suomi NPP": 167151, "NOAA-20": 139694, "NOAA-21": 24326}},
    "note": "real NASA FIRMS rows in the local cache; simulated runs use none of them"
  },
  "terrain_source": "real_downloaded_dem_ca_dem_f32",
  "calibrator": {"train_samples": 800, "calibration_samples": 400, "empirical_coverage_pct": 90.25},
  "cached_runs": 1,
  "grid": {"frames": 24, "height": 256, "width": 256, "channels": 4, "bbox": [-121.6, 39.75, -120.75, 40.35], "z_hat_max_mw_km2": 80.0, "sigma_max_mw_km2": 24.0},
  "endpoints": ["/api/health", "/api/regions"]
}
```

Shortened: `rows_in_region_boxes` has one entry per region, `calibrator` has 15 keys (the simulated engine's calibrator: weights, losses, coverage) and `endpoints` has 11 entries.

- `model_version` and `provenance_note` describe the simulated engine. A real run carries its own (`1.0.0-real-rows`).
- `downloaded_firms_rows` counts the rows of the downloaded FIRMS files, from their manifests. It is `0` on a machine with no cache. `rows_in_region_boxes` counts the rows inside each region's context box, after duplicates are removed.
- `grid` describes the tracked simulated field, not a run.

## `GET /api/regions`

No parameters. Always `200`. The presets of the regions with FIRMS rows and the places registry (`backend/firms/places.py`): where each region's rows come from, its featured fires, and the countries in which any box has a calendar.

```json
{
  "schema_version": "1.1.0",
  "presets": [
    {
      "id": "plumas_ca",
      "name": "Feather River & Plumas, CA",
      "subtitle": "Sierra Nevada Mixed Conifer Canyon",
      "biome": "temperate_conifer",
      "bbox": [-121.44, 39.86, -120.92, 40.24],
      "center_lat": 40.05,
      "center_lon": -121.18,
      "span_lon_deg": 0.52,
      "span_lat_deg": 0.38,
      "width_km": 44.37,
      "depth_km": 42.19,
      "is_preset": true
    }
  ],
  "places": [
    {
      "id": "plumas_ca",
      "name": "Feather River & Plumas, CA",
      "country": "United States",
      "box": [-121.44, 39.86, -120.92, 40.24],
      "context_box": [-122.48, 39.1, -119.88, 41.0],
      "rows": "firms",
      "calendar": "/api/calendar?source=firms&region_id=plumas_ca",
      "years": {"country_files": [2000, 2025], "area_api_through": "2026-11-13", "what": "..."},
      "starts": {"route": "/api/runs/starts?region_id=plumas_ca&source=firms", "count": 53, "default_start": "2012-08-10", "default_featured_fire": "plumas_ca:2012-08", "default_holdout_viirs": true, "default_rule": "..."},
      "featured_fires": [
        {
          "id": "plumas_ca:2012-08",
          "region_id": "plumas_ca",
          "label": "August 2012",
          "months": ["2012-08"],
          "first_day": "2012-08-01",
          "last_day": "2012-08-31",
          "size": {"modis_pixels_in_box": 394, "at_start": "2012-08-10", "what": "MODIS pixels inside the region's box at the period's busiest start"},
          "name": null,
          "named_fire": null,
          "named_fires": [],
          "name_source": null,
          "blind_test_fire": false,
          "to_the_world_model": "never seen",
          "to_the_learned_agent": "fitted on",
          "closed": false,
          "closed_why": null,
          "default_start": "2012-08-10",
          "default_start_rule": "the period's start with the most MODIS pixels in the box (the earliest on a tie)",
          "opens": {"holdout_viirs": true, "what": "opens held out (holdout_viirs true) at its busiest start; the reveal scores it"},
          "calendar": "/api/calendar?source=firms&region_id=plumas_ca",
          "run_starts": [{"start": "2012-08-01", "label": "...", "...": "..."}]
        }
      ],
      "named_fires": [
        {
          "id": "north_complex_2020",
          "name": "North Complex Fire",
          "first_day": "2020-08-17",
          "last_day": "2020-12-03",
          "burned_area": {"value": 318935, "unit": "acres"},
          "point": [-121.0537, 39.81113],
          "point_kind": "origin of the Bear Fire, the complex's run of 8 and 9 September 2020",
          "blind_test_fire": false,
          "source": "https://services3.arcgis.com/...",
          "area_source": "https://...",
          "box": [-121.5537, 39.3111, -120.5537, 40.3111],
          "calendar": "/api/calendar?source=firms&box=-121.5537,39.3111,-120.5537,40.3111",
          "featured_fire": "plumas_ca:2020-09"
        }
      ]
    }
  ],
  "default": {"region_id": "plumas_ca", "featured_fire": "plumas_ca:2012-08", "start": "2012-08-10", "holdout_viirs": true, "rule": "...", "chosen_by": "while the standings are not served", "to_the_world_model": null, "to_the_learned_agent": null},
  "featured_fires_rule": "...",
  "standing": "...",
  "named_fires_from": "...",
  "box_calendar": {
    "route": "/api/calendar?source=firms&box=<west>,<south>,<east>,<north>",
    "countries": ["Canada", "Greece", "United States"],
    "country_extents": {"Greece": [19.6566, 34.8557, 28.2334, 41.7491]},
    "max_span_deg": 20.0,
    "min_span_deg": 0.05,
    "what": "..."
  }
}
```

Shortened: `places` has five entries, one per preset; one featured fire and one named fire are shown, and `country_extents` is cut.

- Only regions with cached FIRMS rows are listed, in `presets` and in `places` (`rows` is `firms`): a preset without rows is kept for the tests and not offered, so no path of the page leads to a simulated fire (`not_offered`).
- `record_only`, when not null, is why a region offers its calendar and no fire: its `featured_fires` are empty and its `starts` `null` (today `ljusdal_se`).
- `years.country_files` is the first and last year of the FIRMS country files cached for the region; `years.area_api_through` the last day its area API rows cover. `starts` names the start list and how many starts it has, and the place's own default by the registry's rule: `default_start`, the `default_featured_fire` it belongs to and `default_holdout_viirs`. The rule is the one of `default` below, inside the place; a place whose only fires are recorded test fires (today `evia_greece`) opens on its largest one, on its recorded window, with every satellite shown. This replaces the model's default of the start list, which is a closed window in all three regions.
- `opens` says how a featured fire opens. A recorded test fire opens on its recorded window, the last look of `backend/model/fitted_values/test_fire_looks.json` (Dixie from 2021-07-22T21:13Z, Lytton Creek from 2021-06-30T21:52Z, northern Evia from 2021-08-05T20:53Z), with `holdout_viirs` false and `recorded_window`: its blind test is on record at `GET /api/evidence`, and a held-out run of it answers `409`. Every other fire opens held out at its busiest start.
- Featured fires are chosen by rule from the region's real run starts (`GET /api/runs/starts`, which reads MODIS rows only): the starts the start search marks busiest, grouped into periods less than 31 days apart, largest first by the MODIS pixels in the box at the busiest start. Today they are July and August 2021 (1,749), August 2012 (394) and September 2020 (175) in `plumas_ca`, June and July 2021 (514) and August 2023 (301) in `lytton_bc`, and August 2021 (714) in `evia_greece`. `run_starts` are the region's starts inside the period's months; `default_start` is the period's start with the most MODIS pixels.
- A featured fire takes its `name` from every named fire whose dates overlap it and whose point lies within 0.5 degrees of the region's box (`named_fires` lists them, `named_fire` and `name_source` give the first); one without a name is shown by place and month. Today: Dixie, Chips (August 2012) and North Complex in `plumas_ca`; Lytton Creek, and Stein Mountain, Ponderosa Creek and Kookipi Creek (August 2023) in `lytton_bc`; Northern Evia in `evia_greece`. `blind_test_fire` marks the three 2021 test fires.
- `to_the_world_model` and `to_the_learned_agent` say what the fire is to each part: fitted on, validated on, a recorded test fire, or never seen, from the model's function (`backend.model.fire_roles.fire_roles`; `null` in a build without it). `closed` and `closed_why` say whether a held-out run, round or play of the fire's window is refused, and why; a closed fire is never the default, even one the world model never saw. The two can differ: the world model was fitted on fires of 2018 to 2023 and validated on 2024 and 2025 (`backend/model/training.py`), the learned agent on episodes of 2012 to 2023 (`backend/env/learn.py`).
- `default` is chosen by the rule in `rule`, inside the registry's warm region (`warm_region` in `places.json`, `plumas_ca`): the largest featured fire the world model never saw; while the standings are null, the largest featured fire that is not a blind test fire. A larger fire in another region does not move the first screen. `chosen_by` says which reading chose it, and the default carries both standings.
- Named fires (`backend/firms/places.json`) carry the name, dates, burned area and point a fire agency gives, from the page in `source` (`point_source`, `area_source` or `last_day_source` when that fact comes from another page; [sources.md](sources.md)), a calendar `box` (the point 0.5 degrees each way) and its `calendar`, and the `featured_fire` they name, if any.
- `country_extents` is where the rows of each cached country file lie; a box calendar counts only rows of those files.

Shortened to one preset. `bbox` is `[west, south, east, north]` everywhere in this API.

## `GET /api/field-meta`

No parameters. Always `200`. Serves `website/public/generated/fields/field_metadata.json` as it is: the description of the tracked simulated field.

| Key | Holds |
| --- | --- |
| `schema_version`, `model_version`, `provenance_note` | Versions and the simulated engine's provenance sentence |
| `data_provenance_distinction` | `terrain_elevation`, `fire_activity_and_hotspots`, `downloaded_firms_rows` (0) |
| `terrain_source`, `dem_path_used` | Which elevation file the field was built on |
| `grid` | `west`, `south`, `east`, `north`, `height`, `width`, row and column orientation, `dx_km`, `dy_km`, elevation range |
| `tensor` | `file`, `dtype`, `shape` (`[24, 256, 256, 4]`), `byte_length`, `sha256`, `epoch_cadence_hours`, and four `channels` (`index`, `rgba`, `name`, `units`, `domain`, `epistemic_state`) |
| `artifacts` | Byte sizes of the four files beside it |
| `verification` | Counts and summary values written when the field was built |

## `GET /api/calendar`

| Parameter | Value |
| --- | --- |
| `source` | Omitted or `simulated`: the simulated calendar. `firms`: the real calendar of a region. |
| `region_id` | Needed with `source=firms`. |

Errors: `400` for any other `source`, and for `source=firms` with neither or both of `region_id` and `box`; `404` for a region with no FIRMS data (the error is the region id).

### Simulated calendar

Serves `website/public/generated/fields/calendar_2000_2026.json` as it is: 324 modelled months over the Feather River box. No FIRMS row is in it.

```json
{
  "schema_version": "1.0.0",
  "model_version": "0.9.0",
  "provenance": "Analytical, physics-informed simulation. No downloaded NASA FIRMS rows",
  "downloaded_firms_rows": 0,
  "region_id": "norcal_feather_plumas",
  "region_name": "Northern California, Feather River / Plumas Corridor",
  "bbox": [-121.6, 39.75, -120.75, 40.35],
  "reference_frame": "MODIS_NADIR_EQUIV_1330LST",
  "units": {"modis_raw_rate": "hotspots_per_1000km2_day", "viirs_raw_rate": "hotspots_per_1000km2_day", "harmonized_mean": "reference_activity_mw_km2_index"},
  "summary_metrics": {"total_months": 324, "years_span": [2000, 2026]},
  "regime_markers": [{"year_month": "2000-11", "label": "MODIS Terra First Light (10:30 LST)"}],
  "annual_summary": [{"year": 2000, "modis_raw_mean": 0.679, "viirs_raw_mean": null, "harmonized_mean": 1.244, "harmonized_peak_month": 3.208, "mean_coverage_fraction": 0.455}],
  "records": [
    {"index": 0, "year": 2000, "month": 1, "year_month": "2000-01", "modis_raw_rate": 0.065, "viirs_raw_rate": null, "harmonized_mean": 0.134, "harmonized_p10": 0.094, "harmonized_p90": 0.191, "coverage_fraction": 0.28, "state_label": "Harmonized", "sensor_regime": "TERRA_ONLY", "modis_orbital_drift_factor": 0.56}
  ]
}
```

Shortened: `summary_metrics` has 5 keys, `regime_markers` 7 entries, `annual_summary` 27 and `records` 324.

### Real calendar (`source=firms`)

`region_id=<id>` gives a region's calendar, built from the cached FIRMS rows of its context box by `backend/firms/real_calendar.py`. `box=<west>,<south>,<east>,<north>` (degrees) gives the calendar of any box instead, counted from every row of the cached FIRMS country files inside it (`GET /api/regions` lists the cached countries); give one or the other. It has the simulated calendar's keys with real values, and adds `source`, `box_area_km2`, `harmonization_method`, `place`, `month_climatology`, `current_month` and, for a region, `real_run_starts`.

```json
{
  "schema_version": "1.0.0",
  "source": "firms",
  "model_version": "overlap_ratio_v1",
  "provenance": "Real NASA FIRMS standard processing rows (...), counted inside the region's context box. Not simulated.",
  "downloaded_firms_rows": 388540,
  "region_id": "plumas_ca",
  "region_name": "Feather River & Plumas, CA",
  "bbox": [-122.48, 39.1, -119.88, 41.0],
  "box_area_km2": 46753.5,
  "reference_frame": "VIIRS_SNPP_375M_EQUIV",
  "units": {"modis_raw_rate": "hotspots_per_1000km2_day (Terra + Aqua)", "viirs_raw_rate": "hotspots_per_1000km2_day (Suomi NPP)", "harmonized_mean": "suomi_npp_equivalent_hotspots_per_1000km2_day"},
  "harmonization_method": {
    "id": "overlap_ratio_v1",
    "in_use": true,
    "description": "...",
    "counted_rows": "...",
    "outage_rule": "...",
    "overlap_months_excluded_for_outages": ["2012-03"],
    "platforms_in_fit": ["Suomi NPP", "Terra", "Aqua"],
    "platforms_counted_not_fitted": {"NOAA-20": "...", "NOAA-21": "..."},
    "not_in_calendar": "...",
    "ratio_terra_aqua": {"ratio": 4.1217, "per_year": {"2012": 4.2874}, "p10": 3.1213, "p90": 4.3652, "years": [2012], "viirs_rows": 160105, "modis_rows": 38844},
    "ratio_terra_only": {"ratio": 8.4757, "p10": 7.3213, "p90": 8.9392},
    "validation": {
      "held_out_years": [2012],
      "per_year": [{"year": 2012, "months": 11, "viirs_observed": 17021, "modis_observed": 3970, "ratio_fitted_without_this_year": 4.1029, "viirs_predicted": 16288.5, "relative_error": -0.043, "relative_error_without_harmonization": -0.7668, "inside_interval": true}],
      "median_abs_relative_error_annual": 0.1086,
      "median_abs_relative_error_without_harmonization": 0.7343,
      "annual_interval_coverage": 0.6429,
      "monthly_interval_coverage": 0.414,
      "months_tested": 157
    },
    "replaced_only_by": "a method that beats it on held-out overlap years"
  },
  "summary_metrics": {"total_months": 302, "years_span": [2000, 2025], "first_month": "2000-11", "last_month": "2025-12", "viirs_to_modis_overlap_ratio": 4.1217},
  "regime_markers": [{"year_month": "2000-11", "label": "MODIS Terra rows begin", "source": "first month with rows in the FIRMS country file"}],
  "annual_summary": [{"year": 2000, "months": 2, "modis_raw_mean": 0.0245, "viirs_raw_mean": null, "harmonized_mean": 0.2077, "harmonized_peak_month": 0.3686, "mean_coverage_fraction": null, "raw_counts": {"Terra": 69}}],
  "records": [
    {
      "index": 0, "year": 2000, "month": 11, "year_month": "2000-11",
      "modis_raw_rate": 0.0435, "viirs_raw_rate": null,
      "harmonized_mean": 0.3686, "harmonized_p10": 0.3184, "harmonized_p90": 0.3886,
      "coverage_fraction": null, "state_label": "Harmonized", "sensor_regime": "TERRA_ONLY",
      "modis_orbital_drift_factor": null, "ratio_used": "terra_only",
      "raw_counts": {"Terra": {"day": 57, "night": 4, "total": 61, "static_excluded": 0, "offshore_on_sea_excluded": 0, "outage_days": 0}, "Aqua": null, "Suomi NPP": null, "NOAA-20": null, "NOAA-21": null}
    }
  ],
  "real_run_starts": {"...": "the answer of GET /api/runs/starts for this region"}
}
```

Shortened: sentences cut to `...`, lists cut to one entry, `validation` (12 keys) and `summary_metrics` (16 keys) cut to their main keys; `regime_markers` has 6 entries, `annual_summary` 26, and `records` 302, one per month from November 2000 to December 2025.

- Rates are hotspots per 1,000 km2 of the context box per day. `harmonized_mean` is the MODIS rate times the overlap ratio, on the Suomi NPP scale.
- In `raw_counts`, a platform that delivered no data that month is `null`; one that delivered data and saw nothing in the box has zero counts.
- `coverage_fraction` and `modis_orbital_drift_factor` are `null`: the real calendar has no coverage product and models no drift.
- `month_climatology` has one entry per calendar month: the median, 10th and 90th percentile of `harmonized_mean` of that month over every year it is harmonized (`years`, `first_year`, `last_year`). Each record adds `month_median`, `anomaly` (`harmonized_mean` minus `month_median`), `anomaly_ratio` (`harmonized_mean` over `month_median`, `null` when the median is 0), `month_rank` (1 is the most burning of that calendar month over the years) and `month_years`.
- `current_month` names the route that reads this month so far against its median (`GET /api/calendar/current`).
- `harmonization_method.fit_rows` is how many MODIS and Suomi NPP rows the ratio was fitted on.

The answer for a box, for example `box=-121.6,39.6,-120.8,40.3` (around the Feather River canyon), differs from a region's here:

```json
{
  "downloaded_firms_rows": 108564,
  "region_id": null,
  "region_name": "39.60 N to 40.30 N, 121.60 W to 120.80 W",
  "bbox": [-121.6, 39.6, -120.8, 40.3],
  "box_area_km2": 5308.0,
  "place": {"kind": "box", "box": [-121.6, 39.6, -120.8, 40.3], "countries": ["United States"], "label": "39.60 N to 40.30 N, 121.60 W to 120.80 W"},
  "harmonization_method": {"counted_rows": "every FIRMS row except type 1 (active volcano, ...), type 2 (static land source, ...) and type 3 (offshore, ...); ...", "fit_rows": {"modis": 11742, "viirs": 49677}},
  "summary_metrics": {"viirs_to_modis_overlap_ratio": 4.2307, "held_out_median_abs_relative_error": 0.1756, "held_out_median_abs_relative_error_without_harmonization": 0.7504, "static_rows_excluded": {"Terra": 19, "Aqua": 13}, "offshore_rows_excluded": {"Suomi NPP": 101, "NOAA-20": 112}, "volcano_rows_excluded": {}},
  "month_climatology": [{"month": 11, "median": 0.2125, "p10": 0.0133, "p90": 0.4782, "years": 26, "first_year": 2000, "last_year": 2025}],
  "records": [{"year_month": "2020-09", "harmonized_mean": 70.778, "month_median": 0.0, "anomaly": 70.778, "anomaly_ratio": null, "month_rank": 1, "month_years": 25, "raw_counts": {"Terra": {"day": 477, "night": 731, "total": 1208, "static_excluded": 0, "offshore_excluded": 0, "volcano_excluded": 0, "outage_days": 0}}}],
  "current_month": {"route": "/api/calendar/current?source=firms&box=-121.6,39.6,-120.8,40.3"}
}
```

Shortened to the keys that differ, one month and one record.

- A box leaves out every row of FIRMS type 1 (active volcano), 2 (static land source) and 3 (offshore) and counts them apart. A region keeps type 3 rows on land beside lakes, which its elevation model tells from rows at sea; a box has no such model. On the context box of a region, a box counts every platform's rows of every month exactly as the region does once the left-out kinds are added back (`backend/tests/test_firms_box_calendar.py`).
- The ratio is fitted on the box's own overlap months, with the same held-out year check; a box with few rows has a wide interval and a larger held-out error, and says so.
- A box counts only the rows of the cached country files. `GET /api/regions` lists those countries and where their rows lie. Rows of NOAA-21 and of months after the last country file month come from the area API and are not in a box calendar.
- A box is counted through an index of the country files (`backend/firms/box_index.py`), which the server opens when it starts and builds there the first time (47 seconds on the machine the project was built on); a box asked during that build waits for it. Then a new box takes 0.1 to 0.4 seconds and the same box again about 2 milliseconds. Errors: `400` for a box that is not four finite numbers with west below east and south below north, or that spans more than 20 or less than 0.05 degrees; `404` when no cached country file has a row in the box. That `404` also carries `cached_countries` (each with the extent of its rows), `country_files` (the route below) and `fetch`, the command that fetches a country's files; the backend holds no country boundaries, so it cannot name the country a box lies in.

## `GET /api/calendar/current`

This month so far against the same calendar month's median. The country files end before this month, so its rows are fetched from the FIRMS area API (near real time) for the box over every full UTC day of the month so far, on the first request of a day, and cached under `data/cache/firms/area_box/`. Needs `FIRMS_MAP_KEY`.

| Parameter | Value |
| --- | --- |
| `source` | `firms`. |
| `region_id` or `box` | A region with FIRMS data (its context box), or a box as for the calendar, at most 5 degrees each way (the area API charges by area). |

```json
{
  "place": {"kind": "box", "box": [-121.6, 39.6, -120.8, 40.3], "countries": ["United States"], "label": "..."},
  "month": "2026-11",
  "status": "ready",
  "days": {"first": "2026-11-01", "last": "2026-11-13", "counted": 13, "in_month": 30},
  "modis": {"rows": 4, "by_platform": {"Terra": 0, "Aqua": 4}, "rate": 0.058},
  "viirs_rows": {"NOAA-20": 22, "NOAA-21": 19, "Suomi NPP": 1},
  "harmonized_mean": 0.2452, "harmonized_p10": 0.1879, "harmonized_p90": 0.2751,
  "month_median": 0.2125, "month_p10": 0.0133, "month_p90": 0.4782, "median_years": [2000, 2025],
  "anomaly": 0.0327, "anomaly_ratio": 1.1539,
  "units": "suomi_npp_equivalent_hotspots_per_1000km2_day",
  "caveats": ["part of a month: ...", "near real time rows ...", "near real time rows have no type column, ...", "Suomi NPP stopped delivering science data on 2 November 2026 ..."],
  "provenance": {"source": "NASA FIRMS area API, near real time: MODIS_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT, VIIRS_SNPP_NRT", "requests": ["https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/MODIS_NRT/-121.6,39.6,-120.8,40.3/5/2026-11-01"], "retrieved_utc": ["...", "..."], "cache": "data/cache/firms/area_box/...", "ratio": "...", "median": "..."}
}
```

An answer of 14 November 2026, shortened: `requests` has 12 entries and the caveats are cut.

- `harmonized_mean` is the MODIS rate over the days counted (rows per 1,000 km2 of the box per day) times the calendar's Terra and Aqua ratio, so it is on the calendar's scale; `month_median` is that calendar month's median from `month_climatology`. Today's UTC day is left out while its rows still arrive.
- The caveats are always served: part of a month; near real time rows, not standard processing; no type column, so static sources, volcanoes and offshore rows are counted; Suomi NPP stopped delivering science data on 2 November 2026. When one MODIS platform has no row while the other has 20 or more, nothing is harmonized and a caveat says why.
- `status` other than `ready`: `no key` (`FIRMS_MAP_KEY` is not set), `box too large`, `busy` (the key has used more than 60 percent of its transactions in the current window), `no full day yet` (the first of a month), `failed` (with `error`). Only a `ready` answer is kept, for the UTC day.
- Stored request URLs carry `<MAP_KEY>` in place of the key.
## `GET /api/calendar/rows.csv`

The FIRMS rows behind a calendar selection, as CSV (`text/csv; charset=utf-8`).

| Parameter | Value |
| --- | --- |
| `region_id` or `box` | A region with FIRMS data, or a box as for the calendar (rows of the cached country files inside it; at most 400 days). |
| `start`, `end` | ISO dates, UTC. Rows acquired in `[start, end)`. |
| `platforms` | Optional, comma separated: `Terra`, `Aqua`, `Suomi NPP`, `NOAA-20`, `NOAA-21`. |

Headers: `X-Row-Count` (the number of rows) and `Content-Disposition` (`isogon_firms_<region>_<start>_<end>.csv`, or `isogon_firms_box_<w>_<s>_<e>_<n>_<start>_<end>.csv`). The columns are `_acq_utc`, `_platform`, `_product`, then the source's own: `latitude`, `longitude`, `acq_date`, `acq_time`, `satellite`, `instrument`, `confidence`, `version`, `frp`, `scan`, `track`, `daynight`, `type`, `brightness`, `bright_t31`, `bright_ti4`, `bright_ti5`. MODIS-only and VIIRS-only columns are empty where a platform has none.

Errors: `400` when `start` or `end` is not a date, when `end` is not after `start`, when the selection is over 500,000 rows, for a bad box, or for a box span over 400 days; `404` for a region with no FIRMS data, a box no cached country file has rows in, and a span the cache does not hold.

## `GET /api/calendar/checks`

The held-out check of every place's calendar side by side: each region with FIRMS rows, then each place of the calendar only (`record_only_places` in `backend/firms/places.json`, counted as a box). Every figure is copied from that place's own calendar (`harmonization_method`), whose route each entry names; nothing is fitted here (`record_check` in `backend/firms/real_calendar.py`).

```json
{
  "what": "the Record's held-out check of every place side by side, ...",
  "definition": "for each overlap year: fit the ratio of sums and the 10th to 90th percentile of per-year ratios on the other overlap years; ...",
  "nominal_interval": "10th to 90th percentile of per-year ratios (80 percent if the yearly ratio spread held)",
  "places": [
    {
      "kind": "region", "id": "plumas_ca", "name": "Feather River & Plumas, CA", "countries": ["United States"],
      "calendar": "/api/calendar?source=firms&region_id=plumas_ca", "box": [-122.48, 39.1, -119.88, 41.0],
      "method": "overlap_ratio_v1", "ratio": 4.1217, "ratio_p10_p90": [3.1213, 4.3652],
      "overlap_years": [2012, 2013], "years_held_out": 14,
      "median_abs_relative_error_annual": 0.1086, "median_abs_relative_error_without_harmonization": 0.7343,
      "annual_interval_coverage": 0.6429, "monthly_interval_coverage": 0.414, "months_tested": 157,
      "monthly_interval_coverage_modis_rows_ge_10": 0.4392, "months_tested_modis_rows_ge_10": 148,
      "fit_rows": {"modis": 38844, "viirs": 160105}, "overlap_months_excluded_for_outages": 11,
      "counted_rows": "..."
    },
    {
      "kind": "box", "id": "northern_ghana", "name": "Northern Ghana savanna", "countries": ["Ghana"],
      "calendar": "/api/calendar?source=firms&box=-2.5,7.25,0.1,9.15", "record_only": "many small fires lit by day ...",
      "ratio": 4.2001, "median_abs_relative_error_annual": 0.0748, "fit_rows": {"modis": 253942, "viirs": 1066572}
    }
  ]
}
```

Shortened: `overlap_years` cut to two of 14 years, the second entry cut to a few keys, and `places` to two of 12.

- `ratio` and `ratio_p10_p90` are the Terra and Aqua ratio in use and its interval; `median_abs_relative_error_annual` and `..._without_harmonization` are the median over held-out years of the yearly error with the ratio and with MODIS counts taken as they are; the coverages are how often the observed Suomi NPP count of a held-out year, or month, lay inside the interval fitted without that year; `fit_rows` are the rows the ratio was fitted on.
- A region's entry is kept while its rows are unchanged; the first answer after a start reads every calendar, about 30 seconds while the box index is built, then tens of milliseconds. A place whose calendar cannot be built carries `error` and the others still answer.

## `GET /api/firms/countries`

Every country the FIRMS country yearly files listing publishes (`data/cache/firms/listing/`, as downloaded), for adding a country to the box calendar. `country=<name>` (as in the listing, for example `United_States`) gives one country by product and year.

```json
{
  "source": "the FIRMS country yearly summary files listing (data/cache/firms/listing), as downloaded",
  "countries": [{"country": "Portugal", "files": 48, "bytes": 18624412, "cached_files": 0, "years": [2000, 2025], "cached": false, "fetch": "uv run ... backend/firms/archive.py fetch --regions --countries Portugal --years 2000-2025"}],
  "fetch": "country files need no key; a fetch refuses to start when the cache would pass 5 GB"
}
```

Shortened to one of 238 countries. With `country=`, the entry adds `by_product`: per product a list of `{year, bytes, cached}`. Errors: `404` for a country the listing does not hold.

## `GET /api/runs/starts`

The start dates from which a real run is worth showing in a region, and the one a page opens on.

| Parameter | Value |
| --- | --- |
| `region_id` | A region with FIRMS data. |
| `source` | Optional; only `firms` is accepted. |

```json
{
  "region_id": "plumas_ca",
  "source": "firms",
  "starts": [
    {
      "start": "2012-08-01",
      "label": "2012-08-01: 344 MODIS pixels in 24 MODIS overpasses over 132 h",
      "first_overpass_utc": "2012-08-01T06:25:00Z",
      "last_overpass_utc": "2012-08-06T18:44:00Z",
      "span_hours": 132.3,
      "modis_overpasses": 24,
      "modis_pixels_in_box": 344,
      "busiest_in_month": false
    }
  ],
  "rule": "a start date is worth showing when the 24 MODIS overpasses after it span at most 192 h, begin within 24 h of the start, and flag at least 100 pixels in the region box",
  "chosen_from": "MODIS rows only; no VIIRS row is read to choose, drop or rank a start",
  "hidden_counts": "none: the list carries MODIS counts only; what the hidden satellite saw in a window comes with that run's reveal",
  "search": "months from 2012 whose region box holds at least 100 MODIS rows; 60 months searched",
  "from": "backend.model.real_run.real_start_dates",
  "default_start": "2021-07-20",
  "default_rule": "the model's default for this region (backend.model.real_run.real_run_starts)"
}
```

Shortened: `starts` has 53 entries for this region.

- Each start carries `closed`: true when its window is closed (a held-out run, round or play of it answers `409`); `closed_starts` gives the refusal's sentence, or says that none is closed.
- A start is chosen from MODIS rows alone, and the list carries MODIS counts only: no start here, in the calendar's `real_run_starts` or in `GET /api/regions` holds a count from the hidden satellite. What VIIRS saw in a window comes with that run's reveal.
- `default_start` is the model's default when it is in the list. Otherwise it is the start with the most MODIS pixels, and `default_rule` says why. It is `null` when the list is empty.
- If the search fails, `starts` is empty and `error` says why.

Errors: `400` without `region_id` or with another `source`; `404` for a region with no FIRMS data.

## `POST /api/reconstruct`

Builds a run, or returns it from the run store, and answers with its description and the addresses of its files. The store keeps the 24 most recently used runs.

### Body

| Key | Type | Meaning |
| --- | --- | --- |
| `region_id` | string | A preset id. With nothing else given, the region is `plumas_ca`. |
| `query_text` | string | A preset id, a place keyword the backend knows, or coordinates such as `38.86, 23.30` or `40.05N 121.18W`. Wins over the other region keys. |
| `center_lat`, `center_lon` | number | Centre of a custom region, within -90 to 90 and -180 to 180. The latitude is kept within -60 to 72. |
| `span_lon_deg`, `span_lat_deg` | number | Size of the region. Defaults 0.52 and 0.38; kept within 0.20 to 2.20 and 0.20 to 1.80. |
| `source` | string | `"firms"` for a real run. Omitted or `"simulated"` for a simulated run. |
| `start` | string | Real runs only, and required there: a UTC date or date-time, such as `2021-07-20` or `2021-07-22T20:34:00Z`. |
| `holdout_viirs` | boolean | Hide every VIIRS detection from the estimate. `"holdout": "viirs"` means the same. |
| `reveal` | boolean | Real runs with `holdout_viirs`: also return what the scorer wrote (below). |
| `cloud_override` | number | Simulated runs only: a cloud fraction from 0 to 1 for every frame. |
| `imagery_source` | string | Imagery of the terrain pack: `esri_world_imagery`, `usgs_naip` (public domain, conterminous United States) or `eox_s2cloudless_2016` (CC BY 4.0, global). Left out (the page leaves it out), the server chooses by coverage: `usgs_naip` where it covers the run's box, elsewhere `esri_world_imagery`, or the source given with `--imagery-elsewhere`. A named source that does not cover the box is replaced the same way. `imagery.chosen` says which. |

### Answer of a simulated run

```json
{
  "run_id": "plumas_ca_holdout0_cnone",
  "provenance": "Real AWS Terrarium 512x512 DEM + Maxar/Esri 2048x2048 World Imagery. Simulated run: a modelled fire seen by modelled satellite passes (no NASA FIRMS row is used in this run)",
  "downloaded_firms_rows": 0,
  "region": {
    "id": "plumas_ca", "name": "Feather River & Plumas, CA", "subtitle": "Sierra Nevada Mixed Conifer Canyon", "biome": "temperate_conifer",
    "bbox": [-121.44, 39.86, -120.92, 40.24], "center_lat": 40.05, "center_lon": -121.18, "width_km": 44.4, "depth_km": 42.2,
    "min_elev_m": 463.5, "max_elev_m": 2386.1, "mean_elev_m": 1494.3,
    "terrain_source": "aws_terrarium_esri_world_imagery", "ortho_resolution": "2048x2048", "dem_resolution": "512x512"
  },
  "assets": {
    "dem_f32_url": "/api/runs/plumas_ca_holdout0_cnone/dem_f32.bin",
    "dem_hires_f32_url": "/api/runs/plumas_ca_holdout0_cnone/dem_hires_f32.bin",
    "satellite_url": "/api/runs/plumas_ca_holdout0_cnone/satellite.jpg",
    "reconstruction_u8_url": "/api/runs/plumas_ca_holdout0_cnone/reconstruction_u8.bin",
    "export_geojson_url": "/api/runs/plumas_ca_holdout0_cnone/export.geojson",
    "export_csv_url": "/api/runs/plumas_ca_holdout0_cnone/export.csv",
    "terrain_pack": {"...": "see Terrain pack below"},
    "terrain_pack_status": "ready"
  },
  "pipeline_stages": [{"stage_id": "terrain_ingest", "label": "...", "model_name": "...", "duration_ms": 0.6, "status": "completed", "detail": "256x256 DEM (464m-2386m)"}],
  "metrics": {
    "holdout_viirs": false, "cloud_override": null, "total_reconstructed_frp_peak_mw": 4535.6,
    "raw_modis_rmse_mw_km2": 13.11, "reconstructed_rmse_mw_km2": 10.05, "rmse_reduction_pct": 23.3,
    "empirical_90_coverage_pct": 89.1, "conformal_q90_radius_mw_km2": 57.45, "subpixel_viirs_fires_recovered_pct": 99.9,
    "step_2012_raw_ratio": 4.83, "step_2012_harmonized_ratio": 1.07, "step_2012_coobs_frames": 15
  },
  "epoch_summaries": [{"frame": 0, "timestamp_utc": "2026-08-18T21:29:00Z", "lst_hr": 13.4, "regime": "co_observed_clear", "primary_sensor": "VIIRS_NOAA20", "cloud_fraction": 0.0, "reconstructed_total_mw": 13.1, "raw_modis_total_mw": 0.0, "raw_viirs_total_mw": 3.8, "mean_sigma_mw_km2": 0.75}],
  "observer_passes": {"...": "see Observer passes below"}
}
```

Shortened: `pipeline_stages` has 5 entries, `epoch_summaries` 24. The metrics of a simulated run compare the estimate with the simulation's own modelled fire, so they say how the engine behaves, not how well it sees a real fire.

The id of a simulated run is `<region>_holdout<0|1>_c<none|NN>`, where `NN` is the cloud override in percent. `terrain_pack_status` is `ready`, `building` (send the same request again later to receive `terrain_pack`) or `absent` (the region's terrain could not be fetched and a stand-in is served, so no pack is built).

### Answer of a real run

A real run answers with the same nine keys, so one reader serves both, and adds its own. Its id is `<region>_firms_<YYYYMMDDTHHMM>_<allsensors|holdoutviirs>`, from the time of its first frame.

Both kinds of run also carry `imagery`, which names the images the answer points at: `overview` (the image of `assets.satellite_url`, drawn when no terrain pack is given: `esri_world_imagery` for real terrain) and `terrain_pack` (the pack's imagery and its attribution, or null while the pack is building). It also says which source the pack takes and how: `chosen` (the source), `chosen_by` (`request` when the body named a source that covers the box, `coverage` otherwise), `why` (in words, for example "the public-domain source covers the box") and `asked` (the body's `imagery_source`, or null). When the pack's imagery is another than the overview's, as with `usgs_naip` on `plumas_ca`, `region.terrain_source` names the pack's (`aws_terrarium_usgs_naip`), `region.overview_source` keeps the overview's, and the provenance sentence says "USGS NAIP (public domain) imagery in the terrain pack (an Esri World Imagery (Maxar) overview is the fallback image)".

```json
{
  "run_id": "plumas_ca_firms_20200927T1856_holdoutviirs",
  "provenance": "Real NASA FIRMS detections (387 rows given to the estimate, 55 drawn in the 24 frames) on ... VIIRS detections were kept from the estimate and used only to score it.",
  "downloaded_firms_rows": 387,
  "source": "firms",
  "start": "2020-09-27T00:00:00Z",
  "holdout_viirs": true,
  "hidden_platforms": ["VIIRS_NOAA20", "VIIRS_SNPP"],
  "hidden_platforms_note": "...",
  "window": {
    "first_overpass_utc": "2020-09-27T18:56:37Z", "last_overpass_utc": "2020-09-29T20:34:07Z",
    "overpasses": 24, "modis_overpasses": 11, "viirs_overpasses": 13,
    "modis_pixels_in_box": 55, "viirs_pixels_in_box": 0, "span_hours": 49.62,
    "rule": "from the first MODIS overpass with a detection in the box at or after the requested start, the first 24 passes whose swath held the whole box, of every platform, fire or no fire (NASA CMR granule list). ...",
    "chosen_from": "MODIS rows for the start and the pass list for the frames; no row of a hidden instrument",
    "frames_from": "cmr", "hidden_passes": 13, "passes_with_no_visible_detection": 0
  },
  "firms_rows_used": 387,
  "hidden_rows": {
    "rule": "the hidden rows are parted from the visible ones before anything is chosen or built (backend/eval/holdout.py) and opened by the scorer alone",
    "payload_keys_from_the_scorer": ["blind_test", "metrics.raw_modis_rmse_mw_km2", "metrics.reconstructed_rmse_mw_km2", "metrics.rmse_reduction_pct", "metrics.empirical_90_coverage_pct", "metrics.cells_gained_over_painted_modis_pct"],
    "everything_else": "byte for byte the same whatever the hidden rows hold (pipeline_stages durations are wall clock times)",
    "withheld_until_reveal": ["blind_test", "metrics.raw_modis_rmse_mw_km2", "metrics.reconstructed_rmse_mw_km2", "metrics.rmse_reduction_pct", "metrics.empirical_90_coverage_pct", "metrics.cells_gained_over_painted_modis_pct"],
    "reveal_with": "POST /api/reconstruct again with the same body and \"reveal\": true"
  },
  "model": {
    "version": "1.0.0-real-rows",
    "method": "forward and backward occupancy filter on the 375 m grid (backend/model/occupancy.py)",
    "parameters": {"tau_res_h": 12.0, "spread_km_per_h": 0.15},
    "learned_parts": [{"name": "where the fire is (cells and probabilities)", "status": "experimental", "validation_scores": {"...": "..."}}],
    "status": "experimental",
    "status_reason": "0 of 3 parts of the estimate are on after validation on other fires (model.learned_parts); this run's own blind test is in blind_test.verdict",
    "detection_law": "Sofiev and Kouznetsov, Geosci. Model Dev. 19, 10123, 2026, Tables 1 and 2 (re-implemented)"
  },
  "encoding": {"version": 2, "scale": "log10", "unit": "MW/km2", "min_mw_km2": 0.01, "max_mw_km2": 10000.0, "byte_zero": "no fire: the value is exactly zero", "encode": "...", "decode": "...", "step_factor": 1.0559, "lookup_mw_km2": [0.0, 0.01]},
  "footprints_per_frame_max": 12,
  "belief_frames": {
    "asset": "belief_u8.bin", "url": "/api/runs/plumas_ca_firms_20200927T1856_holdoutviirs/belief_u8.bin", "bytes": 2666800,
    "steps": 100, "step_minutes": 30.0, "first_time_utc": "2020-09-27T18:56:37Z", "last_time_utc": "2020-09-29T20:26:37Z",
    "grid": {"nx": 118, "ny": 113, "cell_km": 0.375, "bbox": [-121.44, 39.86, -120.92, 40.24], "row_0": "north", "column_0": "west"},
    "layout": "steps x ny x nx x 2, uint8, C order",
    "channels": [{"name": "p_burning", "meaning": "probability the cell is burning", "decode": "value / 255"}, {"name": "expected_frp_density", "meaning": "expected FRP density, MW/km2", "decode": "..."}],
    "view": "forward filter only: ...",
    "assimilated": "MODIS only; hidden: VIIRS_NOAA20, VIIRS_SNPP",
    "assimilated_passes": [{"time_utc": "2020-09-27T20:36:00Z", "sensor": "MODIS_AQUA", "pixels_in_box": 2, "first_step_after": 4}],
    "per_step": [{"step": 0, "time_utc": "2020-09-27T18:56:37Z", "hours_since_last_assimilated_pass": 0.01, "cells_that_may_burn": 338, "expected_burning_cells": 15.3, "sharpness": 0.0453, "expected_frp_mw": 156.1}]
  }
}
```

Shortened: the keys shared with a simulated run (`region`, `assets`, `pipeline_stages`, `metrics`, `epoch_summaries`, `observer_passes`) are left out, `parameters` has 24 keys, `learned_parts` 5 entries, `lookup_mw_km2` 256 values, and `assimilated_passes` and `per_step` one entry per pass and per step.

- **Frames.** The 24 frames are real passes at their real times: from the first MODIS overpass with a detection in the box at or after `start`, the first 24 passes whose swath held the whole region box, from NASA's pass list. `window.frames_from` is `cmr` then. Where no pass list is cached it reads `detections (...)` and the frames are overpasses of the visible rows.
- **Tensor encoding.** A real run's `reconstruction_u8.bin` is on the log scale that `encoding` describes, not on the linear scale of a simulated run.
- **Metrics.** `metrics.source` is `firms`. The names a simulated run uses that mean nothing here are `null` and listed in `metrics.simulated_names_not_used`; `metrics.definitions` explains every name. `metrics.from_hidden_rows` lists the metrics the scorer computed.
- **Nothing hidden.** Without `holdout_viirs` the answer has `fit_residuals` in place of `blind_test`: the same report with `"blind": false`, because the estimate has seen the VIIRS rows it is compared with. It is not a test.

### What a held-out run withholds, and the reveal

With `"holdout_viirs": true` the first answer holds nothing the scorer computed from the hidden rows. The keys named in `hidden_rows.withheld_until_reveal` are absent: `blind_test` and the five scored metrics. Everything that is present is the same, byte for byte, whatever the hidden rows hold.

Sending the same body again with `"reveal": true` returns the full answer: the same run from the store, with `blind_test` and the scored metrics, and `hidden_rows` without `withheld_until_reveal` and `reveal_with`.

`declared_cells` (held-out runs only, null otherwise): the cells the reconstruction declares as burning at each scored look of the hidden instrument, as flat indices on the 375 m grid (`grid.index`, `grid.rows_run`, `grid.centre_of_a_cell`). They are the cells the blind test compares with the hidden detections of that look. They are fixed before the hidden rows are opened, so they are in the first answer; after the reveal, `blind_test.published.reconstruction[i].cells_sha256` equals `declared_cells.looks[i].cells_sha256`. Where the frames come from the pass list, `looks[i].frame` is the held-out frame the look is.

`blind_test` is the report of `backend/eval/blind_test.py`. It has two halves, and names them in `built_without_hidden_rows` and `from_the_scorer`.

| Key | Holds |
| --- | --- |
| `protocol` | `version`, `name`, `rule`, `replaces`. Version 3 when the schedule comes from the pass list, version 2 on the nominal schedule. |
| `source`, `hidden_instrument`, `visible_instrument`, `hidden_platforms`, `visible_platforms`, `test_box`, `grid`, `window_utc` | What was tested and where. |
| `definitions` | The meaning of every score, in words. |
| `schedule` | `source` (`cmr` or `nominal`), `blind`, counts of passes, and `slots`: one per scheduled look (`index`, `platform`, `time_utc`, `is_day`, `scan_km`, `track_km`, `cross_track_km`, `cloud_cover_pct`, `box_share`, `frame`). |
| `published` | Per method, one entry per slot, fixed before the hidden rows are opened: `predicted_cells`, `predicted_frp_mw`, `predicted_pixels`, the intervals, and a SHA-256 of the predicted fields. |
| `targets` | Per scored look, what the hidden instrument reported: `hidden_pixels_in_test_box`, `hidden_frp_mw`, `truth_cells`. |
| `scored_overpasses`, `scored_overpasses_with_no_hidden_detection`, `hidden_rows_in_test_box`, `hidden_overpasses_without_a_slot`, `hidden_rows_without_a_pass` | Counts from the scorer. |
| `methods` | For `reconstruction`, `painted_modis` and `overlap_ratio`: `strict_375m`, `tolerant_1_cell` and `equal_area` (each with `tp`, `fp`, `fn`, `tn`, `hit_rate`, `false_alarm_ratio`, `false_alarm_rate`, `csi`), `brier`, `cell_rmse_mw_km2`, `frp_total`, `interval`, `pixel_count`, `per_overpass`. |
| `subset_with_hidden_detections` | The same scores over the looks that left a hidden pixel in the box only. |
| `verdict` | Per score, the three methods' values, `better_is` and `beats_every_baseline`; then `beats_every_baseline_on`, `scores_judged` and `interval` (`stated_level`, `observed_coverage`, `overpasses`). |
| `reveal` | The hidden detections, one entry per hidden overpass: `platform`, `time_utc`, `frame`, `scored`, `pixels_in_box`, `frp_mw`, `footprints`. |
| `overlap_ratio_fit`, `calendar_overlap_ratio`, `window_choice` | The inputs of the second baseline and the window. |

```json
{
  "verdict": {
    "evaluated": true,
    "method": "reconstruction",
    "baselines": ["painted_modis", "overlap_ratio"],
    "scores": {
      "csi_strict_375m": {"reconstruction": 0.3298, "painted_modis": 0.2715, "overlap_ratio": 0.2715, "better_is": "higher", "beats_every_baseline": true}
    },
    "beats_every_baseline_on": 6,
    "scores_judged": 7,
    "interval": {"stated_level": 0.9, "observed_coverage": 1.0, "overpasses": 13},
    "beats_every_baseline_on_every_score": false
  }
}
```

Shortened: `scores` has seven entries and the values are rounded here. This is the score of one window. The recorded test of the model is in `GET /api/evidence`.

### Terrain pack

`assets.terrain_pack` describes higher resolution terrain for the stage. Every `url` is served by `GET /api/runs/<run_id>/terrain/<name>`.

```json
{
  "version": 1,
  "tier": "hero",
  "extent_km": [44.37, 42.19],
  "elev_range_m": [458.1, 2392.2],
  "dem": {"url": "/api/runs/<run_id>/terrain/dem_1024_f32.bin", "size": 1024, "format": "f32le"},
  "ortho": {"url": "/api/runs/<run_id>/terrain/ortho_8192.jpg", "size": 8192, "zoom": 14, "gsd_m": 7.31, "source": "esri_world_imagery", "attribution": "Esri, Vantor, Earthstar Geographics, and the GIS User Community"},
  "ortho_fallback": {"url": "/api/runs/<run_id>/terrain/ortho_4096.jpg", "size": 4096},
  "aux": {"url": "/api/runs/<run_id>/terrain/aux_2048.png", "size": 2048, "channels": {"r": "normal_x", "g": "normal_z", "b": "sky_view_ao", "a": "canopy_index"}},
  "sun": {"azimuth_deg": 176.0, "elevation_deg": 34.0},
  "ortho_detail": [{"url": "/api/runs/<run_id>/terrain/ortho_detail_0.jpg", "size": 8192, "zoom": 16, "gsd_m": 1.83, "uv_rect": [0.203735352, 0.330322266, 0.541259766, 0.685302734]}],
  "context": {
    "extent_km": [221.85, 210.95], "scale": 5,
    "dem": {"url": "/api/runs/<run_id>/terrain/context_dem_1024_f32.bin", "size": 1024, "format": "f32le"},
    "ortho": {"url": "/api/runs/<run_id>/terrain/context_ortho_4096.jpg", "size": 4096, "zoom": 12, "source": "esri_world_imagery", "attribution": "..."}
  }
}
```

This is the Esri World Imagery pack of `plumas_ca` (`imagery_source: esri_world_imagery`). A pack of another source names its files with the source first, context included (`usgs_naip_ortho_8192.jpg`, `usgs_naip_context_ortho_4096.jpg`), and its `ortho.source` and attribution are that source's. `ortho_detail` and `context` are present only where they have been built.

### Observer passes

`observer_passes` holds the 24 frames with their passes and footprints. It is also served as `GET /api/runs/<run_id>/observer_passes.json`.

```json
{
  "schema_version": "1.0.0",
  "model_version": "0.9.0",
  "run_id": "plumas_ca_holdout0_cnone",
  "provenance": "...",
  "downloaded_firms_rows": 0,
  "terrain_source": "aws_terrarium_esri_world_imagery",
  "bbox": [-121.44, 39.86, -120.92, 40.24],
  "aoi_center": [-121.18, 40.05],
  "sensor_codes": {"0": "MODIS_TERRA", "1": "MODIS_AQUA", "2": "VIIRS_NOAA20", "3": "VIIRS_NOAA21", "4": "VIIRS_SNPP"},
  "orbit_node_rule": {"rule": "...", "day_node": {"MODIS_TERRA": "descending", "MODIS_AQUA": "ascending"}, "sources": {"...": "..."}, "note": "..."},
  "footprint_schema": ["lon", "lat", "scan_km", "track_km", "angle_deg", "frp_mw", "confidence", "sensor_code"],
  "frames": [
    {
      "frame": 0, "timestamp_utc": "2026-08-18T21:29:00Z", "local_solar_time_hr": 13.4, "is_day": true,
      "epistemic_regime": "co_observed_clear", "sensor": "VIIRS_NOAA20",
      "subsat_lon": -119.2559, "subsat_lat": 40.4102, "altitude_km": 825.2,
      "scan_angle_deg": 11.5, "azimuth_deg": 75.6, "view_zenith_deg": 13.01, "cloud_fraction": 0.0,
      "mean_z_hat_mw_km2": 0.007, "max_z_hat_mw_km2": 18.7, "mean_sigma_mw_km2": 0.748,
      "passes": [{"sensor": "VIIRS_NOAA20", "sensor_code": 2, "orbit_node": "ascending", "subsat_lon": -119.2559, "subsat_lat": 40.4102, "altitude_km": 825.2, "scan_angle_deg": 11.5, "azimuth_deg": 75.6, "view_zenith_deg": 13.01, "swath_fraction": 1.0, "footprint_count": 1}],
      "footprints": [[-121.3112, 40.0287, 0.39, 0.37, 75.6, 2.41, 69, 2]]
    }
  ]
}
```

Shortened to one frame of a simulated run and one of its two passes. A footprint is a row in the order of `footprint_schema`.

A real run adds, at the top, `source`, `frames_from`, `geometry_note`, `held_out_frames_note`, `confidence_note`, `crossing_time_offsets` and its note; in each frame, `held_out`, `detections_in_box`, `granule_cloud_cover_pct`, `cloud_fraction_measured`, `information_age_h` and `viirs_confidence_classes`; and in each pass, `satellite_side`, `crossing_lst_hr`, `cross_track_km`, `held_out` and `geometry_from`. A frame whose `epistemic_regime` ends in `held_out` is a real pass of a hidden platform: it shows the estimate at that time and no footprint. `cloud_fraction` is written as 0 on a real run and `cloud_fraction_measured` is `false`: FIRMS rows carry no cloud mask.

### Errors

| Status | When |
| --- | --- |
| `400` | The body is not a JSON object, holds `NaN` or `Infinity`, or a key has the wrong type or is out of range. Unknown `region_id`; a `query_text` that cannot be resolved; a `source`, `holdout` or `imagery_source` that is not one of the listed values. |
| `400` | Real runs: no `start`; `cloud_override` given; a `start` that cannot be read; fewer than 24 overpasses with detections in the box from that start. |
| `409` | A held-out run (and so its reveal) on a closed window (see the next-look rounds). The rule is asked with the run's box and its own window, found as the run finds it (the first MODIS overpass with a detection in the box at or after `start`, then the frames of the pass list, from MODIS rows only), before terrain is loaded or anything is solved; where no window can be found, with the whole span the run may reach (30 days to its first overpass and 15 after). A box of its own, asked by centre and span or by `query_text`, is asked the same way. The answer names the place and its fire and has `"evidence": "/api/evidence"`. The run with every satellite shown still serves. |
| `404` | A real run on a box of its own that is not closed: a real run reads the cached rows of a region; the box has its calendar. Answered before terrain is loaded. |
| `403` | The request's `Origin` is not a local page. |
| `404` | Real runs: the region has no cached FIRMS rows, or the rows of the asked span are not cached. |
| `413` | The body is over 262,144 bytes. |

## `GET /api/runs/<run_id>/<file>`

The files of a run in the store. `404` when the run is not in the store (ask for it again with `POST /api/reconstruct`).

| File | Type | Content |
| --- | --- | --- |
| `dem_f32.bin` | `application/octet-stream` | Elevation, 256 by 256 little-endian float32, metres. Row 0 is the northern row. |
| `dem_hires_f32.bin` | `application/octet-stream` | Elevation, 512 by 512, same layout. |
| `satellite.jpg` or `satellite.png` | image | The region's image. `assets.satellite_url` names the one that exists. |
| `reconstruction_u8.bin` | `application/octet-stream` | 24 by 256 by 256 by 4 bytes (6,291,456). Channels: the estimate, its uncertainty, MODIS as observed, VIIRS as observed. Linear on a simulated run (0 to 80 MW/km2, and 0 to 24 for the uncertainty); on a real run, the log scale of the run's `encoding`. |
| `belief_u8.bin` | `application/octet-stream` | Real runs only: the forward estimate every 30 minutes on the 375 m grid, as `belief_frames` describes. `404` on a simulated run. |
| `observer_passes.json` | JSON | The run's `observer_passes`. |
| `export.geojson` | `application/geo+json` | Cells of the estimate at their peak, as point features, with the run's metadata. Sent as an attachment. |
| `export.csv` | `text/csv` | The same cells, one per line: `lon`, `lat`, `z_hat_mw_km2`, `sigma_mw_km2`, `ci90_low`, `ci90_high`, `epoch_peak`, `elevation_m`, and `slope_deg` on a simulated run. Sent as an attachment. |

Any other file name answers `404` in the shape of an unknown route.

## `GET /api/runs/<run_id>/terrain/<name>`

A terrain pack file of the run's region, by the name in `assets.terrain_pack` (`.bin`, `.jpg` or `.png`). These answers carry `Cache-Control: public, max-age=86400` and an `ETag`; a request whose `If-None-Match` equals it answers `304`.

Errors: `404` when the run is not in the store, or the pack has no such file.

## `GET /api/observer`

One frame's passes and footprints, filtered, with what the filter leaves.

| Parameter | Default | Value |
| --- | --- | --- |
| `frame` | `0` | 0 to 23. |
| `sensor` | `all` | `all`, `modis`, `viirs`, or one platform name such as `MODIS_TERRA`. |
| `min_frp` | `0.0` | Keep footprints at or above this fire radiative power, MW. |
| `max_zenith` | `90.0` | Keep footprints at or below this view zenith angle, degrees. |
| `run_id` | none | A run in the store. Without it, or when the run is not in the store, the tracked simulated field answers. |

```json
{
  "schema_version": "1.0.0",
  "run_id": null,
  "provenance": "Simulated run: a modelled fire seen by modelled satellite passes. No NASA FIRMS row is used in this run",
  "frame": 12,
  "timestamp_utc": "2026-08-24T21:35:00Z",
  "local_solar_time_hr": 13.5,
  "is_day": true,
  "epistemic_regime": "co_observed_clear",
  "sensor_filter": "viirs",
  "overpass_present": true,
  "sensor": "VIIRS_NOAA20",
  "subsat_lon": -118.4132,
  "subsat_lat": 40.5559,
  "altitude_km": 825.2,
  "scan_angle_deg": 16.2,
  "azimuth_deg": 75.6,
  "view_zenith_deg": 18.37,
  "cloud_fraction": 0.0,
  "passes": [{"sensor": "VIIRS_NOAA20", "sensor_code": 2, "orbit_node": "ascending", "subsat_lon": -118.4132, "subsat_lat": 40.5559, "altitude_km": 825.2, "scan_angle_deg": 16.2, "azimuth_deg": 75.6, "view_zenith_deg": 18.37, "swath_fraction": 1.0, "footprint_count": 92}],
  "sensitivity_diagnostics": {
    "applied_min_frp_mw": 0.0,
    "applied_max_zenith_deg": 90.0,
    "sensor_pool_footprints": 92,
    "retained_footprints": 92,
    "omitted_by_filter_footprints": 0,
    "retained_total_frp_mw": 821.35,
    "mean_footprint_area_km2": 0.158,
    "mean_local_view_zenith_deg": 18.79,
    "observable_flux_fraction": 0.8786,
    "reconstructed_field_total_frp_mw": 10301.18,
    "mean_epistemic_sigma_mw_km2": 1.262,
    "high_uncertainty_area_fraction": 0.0,
    "intensity_scale": "linear"
  },
  "footprint_schema": ["lon", "lat", "scan_km", "track_km", "angle_deg", "frp_mw", "confidence", "sensor_code"],
  "footprints": [[-121.1162, 40.0471, 0.42, 0.38, 75.6, 14.25, 94, 2]]
}
```

Shortened: `footprints` has 92 rows. This is `GET /api/observer?frame=12&sensor=viirs`.

A footprint is also dropped when the modelled probability of detecting it is under 0.25. `reconstructed_field_total_frp_mw`, `mean_epistemic_sigma_mw_km2` and `high_uncertainty_area_fraction` (the share of cells whose standard deviation is above 8 MW/km2) read the frame's tensor on the scale the run wrote it, named in `intensity_scale`: `linear` for a simulated run, `log10` for a real run (its payload's `encoding`).

Errors: `400` when `frame` is not a whole number from 0 to 23, when `sensor` is not one of the values above, or when `min_frp` or `max_zenith` is not a finite number.

## `GET /api/sensor-model`

The sensor curves of the simulated engine and its five gates.

| Parameter | Value |
| --- | --- |
| `run_id` | Optional. The run whose metrics the gates read. Without it, the default simulated run `plumas_ca_holdout0_cnone`. |

Always `200`.

```json
{
  "schema_version": "1.0.0",
  "provenance": "Analytical sensor forward operator. Sofiev & Kouznetsov (2026 GMD) + Wolfe et al. (2013)",
  "downloaded_firms_rows": 0,
  "geometry_metadata": {"modis_altitude_km": 705.0, "modis_swath_width_km": 2330, "modis_max_scan_angle_deg": 55.0, "viirs_altitude_km": 825.2, "viirs_swath_width_km": 3060, "viirs_max_scan_angle_deg": 56.28, "viirs_zone_boundaries_deg": [31.72, 44.86], "viirs_zone_labels": ["..."]},
  "thresholds_50pct_mw": {"viirs_night_nadir": 0.54, "viirs_day_nadir": 2.3, "viirs_day_edge": 5.39, "modis_day_nadir": 4.96, "modis_day_midswath_45deg": 16.73, "modis_day_edge_55deg": 43.54},
  "scan_geometry_curves": [{"scan_angle_deg": 0.0, "modis_valid": true, "modis_view_zenith_deg": 0.0, "modis_scan_km": 1.0, "modis_track_km": 1.0, "modis_area_km2": 1.0, "modis_day_d50_mw": 4.96, "viirs_zone": 1, "viirs_aggregation": "3x1", "viirs_view_zenith_deg": 0.0, "viirs_scan_km": 0.375, "viirs_track_km": 0.362, "viirs_area_km2": 0.136, "viirs_day_d50_mw": 2.28, "viirs_night_d50_mw": 0.54}],
  "detection_probability_curves": [{"frp_mw": 0.15, "viirs_night_nadir": 0.0, "viirs_day_nadir": 0.0, "viirs_day_edge": 0.0, "modis_day_nadir": 0.0, "modis_day_midswath_45deg": 0.0, "modis_day_edge_55deg": 0.0}],
  "paired_1330_calibration": {"description": "...", "raw_overall_bias_dex": -0.0673, "raw_overall_rmse_dex": 0.1203, "harmonized_overall_bias_dex": -0.0042, "harmonized_overall_rmse_dex": 0.0894, "n_pairs": 96, "conformal_90pct_empirical_coverage": 1.0, "vza_bin_summary": ["..."], "paired_samples": ["..."]},
  "benchmark_gates": [
    {
      "gate_id": "G1_2012_CONTINUITY",
      "title": "2012 S-NPP Step-Jump Removal",
      "kind": "computed",
      "criterion": "harmonized step ratio within [0.90, 1.10]",
      "source": "reconstruct run metrics step_2012_harmonized_ratio and step_2012_raw_ratio",
      "status": "PASSED",
      "metric": "run plumas_ca_holdout0_cnone: harmonized step ratio 1.07 (...)",
      "inputs": {"step_2012_harmonized_ratio": 1.07, "step_2012_raw_ratio": 4.83, "step_2012_coobs_frames": 15}
    }
  ],
  "benchmark_gates_run_id": "plumas_ca_holdout0_cnone"
}
```

Shortened: `scan_geometry_curves` has 118 entries, `detection_probability_curves` 83, `paired_samples` 96 and `benchmark_gates` 5.

The gates belong to the simulated engine. Their `status` is `PASSED`, `FAILED` or `NOT_EVALUATED`.

| Gate | Kind | On a simulated run | On a real run |
| --- | --- | --- | --- |
| `G1_2012_CONTINUITY` | `computed` | From the run's metrics | `NOT_EVALUATED` |
| `G2_BOWTIE_FLUX_CONSERVATION` | `design_target` | `NOT_EVALUATED` | `NOT_EVALUATED` |
| `G3_PAIRED_RESIDUAL` | `computed` | From the simulated pairs | `NOT_EVALUATED` |
| `G4_SPATIOTEMPORAL_ASSIMILATION` | `design_target` | `NOT_EVALUATED` | `NOT_EVALUATED` |
| `G5_CONFORMAL_COVERAGE` | `computed` | From the run's metrics | `NOT_EVALUATED` |

With the `run_id` of a real run every gate reads `NOT_EVALUATED`, and each `metric` says that the gate is defined on simulated runs and that the real run's test is its blind test. This holds also when the real run is no longer in the store: the gates of the default simulated run are never served under a real run's id. With an unknown id that is not a real run's, the default simulated run answers and `benchmark_gates_run_id` says so.

## `GET /api/passes`

Every satellite pass over a region's box in a window, fire or no fire, from the cached NASA CMR pass list, each with what FIRMS detected in the box on that pass.

| Parameter | Default | Value |
| --- | --- | --- |
| `region_id` | required | A region with FIRMS data. |
| `start`, `end` | required | UTC dates or date-times. The window is `[start, end)`, at most 366 days. |
| `box` | `pack` | `pack`: the region box, the box of the blind test. `context`: the context box, five times the span. |
| `platforms` | all | Comma separated: `MODIS_TERRA`, `MODIS_AQUA`, `VIIRS_SNPP`, `VIIRS_NOAA20`, `VIIRS_NOAA21`. |
| `hidden` | none | `VIIRS`: the list a held-out window may show. The VIIRS rows are dropped before matching, so each VIIRS pass carries its time, coverage and granules and `"firms_withheld": true` in place of every `firms_` field, its summary counts passes only, and no unmatched VIIRS overpass is listed. The answer names what was withheld. The full list, without `hidden`, belongs to the reveal. |

```json
{
  "region_id": "plumas_ca",
  "source": "firms",
  "hidden": null,
  "box": "pack",
  "box_wsen": [-121.44, 39.86, -120.92, 40.24],
  "start": "2021-07-22T00:00:00Z",
  "end": "2021-07-23T00:00:00Z",
  "passes": [
    {
      "platform": "MODIS_TERRA",
      "time_start": "2021-07-22T05:50:00Z",
      "time_end": "2021-07-22T05:55:00Z",
      "time_mid": "2021-07-22T05:52:30Z",
      "day_night": "NIGHT",
      "box_share": 1.0,
      "box_inside": true,
      "cloud_cover_pct": 21.0,
      "granules": ["G2278759782-LPCLOUD"],
      "firms_detection_in_box": true,
      "firms_pixels_in_box": 131,
      "firms_static_pixels_in_box": 0,
      "firms_frp_mw_in_box": 9205.0,
      "firms_overpass_utc": ["2021-07-22T05:52:00Z"]
    }
  ],
  "summary": {"MODIS_TERRA": {"passes": 2, "with_detection": 2, "without_detection": 0, "without_detection_whole_box": 0}},
  "firms_overpasses_without_a_pass": [],
  "known_gaps": [],
  "matching": "a pass has a FIRMS detection when a FIRMS overpass of the same platform (...) with a pixel in the box lies within 5 minutes of the pass's granule span",
  "collections": {"MODIS_TERRA": {"concept_id": "C2271754179-LPCLOUD", "short_name": "MOD14", "version": "061"}},
  "limits": "...",
  "provenance": "NASA CMR granule search (keyless metadata, cached under data/cache/cmr) and NASA FIRMS rows"
}
```

Shortened: this window has 10 passes; `summary` and `collections` have one entry per platform.

- `box_share` is the share of the box inside the swath; `box_inside` is true when the whole box is.
- `cloud_cover_pct` is the mean over a whole MODIS granule, not over the box, and is `null` for VIIRS. A pass without a detection looked at the box and flagged nothing, or the box was under cloud.
- `firms_overpasses_without_a_pass` lists FIRMS overpasses with a detection in the box that no pass matches (`platform`, `time_utc`, `pixels`), and `known_gaps` names the gaps of the NASA collections that the window meets ([data.md](data.md)).

The server keeps the 32 most recent answers while the cached rows and pass files are unchanged.

Errors: `400` without `region_id`, `start` or `end`, for a date that cannot be read, when `end` is not after `start`, when the window is over 366 days, or for an unknown `box` or platform; `404` for a region with no pass schedule, and when the pass list or the FIRMS rows of the window are not cached.

## `GET /api/evidence`

One document with everything the project has measured about the model on real fires: the recorded looks at the three 2021 test fires, the validation that decides what is switched on, and the environment's reference table. It is built on each request by `backend.model.evidence.evidence()` from three tracked files and reads no FIRMS row. No parameters.

| Key | Holds |
| --- | --- |
| `commit` | The short commit of the code that answered when it runs from a git checkout, otherwise `null`. |
| `unit` | A label of the record's last entry. |
| `test_fires` | `hidden`, `interval_level`, `note`, `values_in_use`, `scores` (the seven scores: `id`, `label`, `better`), `fires`, `looks`, `also_scored`, `also_scored_note`. |
| `test_fires.fires[]` | `region_id`, `name`, then `new` (the final look) and `old` (the first), each with `protocol_version`, `first_overpass_utc`, `last_overpass_utc`, `scored_overpasses`, `hidden_pixels`, `scores` per method, `frp_interval`, `pixel_interval`, `ahead_of_both_on`, `scores_judged`, `ahead_on`; and `looks`, the same for every look. |
| `test_fires.looks[]` | The three looks: `look`, `protocol_version`, `what`. |
| `test_fires.also_scored[]` | Every other time rows of the test fires were scored, so that the count of looks hides nothing. |
| `audit`, `audit_findings` | The ways the first protocol let hidden rows shape the test, and for each the change that answers it and the test that guards it (`id`, `found`, `answer`, `guarded_by`). |
| `validation` | `protocol_version`, `episodes`, `years`, `regions`, `scored_overpasses`, `classes` (`ahead`, `tied`, `behind`), `fitted_values`, `decision`, `rule`, `parts`, `frp_interval`, `before`, `history`, `trained_on`, `validated_on`, `empty_looks`, `intervals`. |
| `next_look` | `tiles_per_side`, `looks`, `score`, `reward`, `test_episodes`, `mean_start_score`, `agents`, `differences`, `holds_in_both`, `other_settings`, `made_with`, and the same table under earlier settings; `measured_under` (the reward the tables on record were measured under, what an empty look did then, why they are not measured again), `reward_in_use`, and `on_validation` (the reference players under the reward in use on the validation episodes: `agents`, `differences`, `plainly`, `not_a_test`). |
| `limits` | Sentences: what the figures do not show. |
| `additions` | The keys this document adds to the shape the page first asked for. |
| `sources` | `tracked_files`, `reports_sha256`, `record_built_utc`. |

```json
{
  "test_fires": {
    "fires": [
      {
        "region_id": "plumas_ca",
        "name": "Dixie",
        "new": {
          "protocol_version": 3,
          "first_overpass_utc": "2021-07-22T21:13:00Z",
          "last_overpass_utc": "2021-07-25T06:22:00Z",
          "scored_overpasses": 13,
          "hidden_pixels": 7144,
          "scores": {"reconstruction": {"csi_strict_375m": 0.3194}, "painted_modis": {"csi_strict_375m": 0.2593}, "overlap_ratio": {"csi_strict_375m": 0.2593}},
          "frp_interval": {"reconstruction": {"held": 13, "of": 13}, "painted_modis": null, "overlap_ratio": {"held": 12, "of": 13}},
          "ahead_of_both_on": 6,
          "scores_judged": 7,
          "ahead_on": ["csi_strict_375m", "..."]
        }
      }
    ]
  },
  "validation": {"protocol_version": 3, "episodes": 7, "scored_overpasses": 153, "classes": {"ahead": 2, "tied": 5, "behind": 0}, "frp_interval": {"held": 148, "of": 153, "stated": 0.9}},
  "next_look": {"test_episodes": {"new": 21, "old": 22}, "agents": [{"id": "least_sure", "label": "Least sure", "does": "the tile where the model is least sure", "new": {"mean_final": 0.2522, "mean_gain": 0.0187, "share_of_oracle_gain": 0.693}, "old": {"mean_final": 0.2531, "mean_gain": 0.0113, "share_of_oracle_gain": 0.502}}]}
}
```

Shortened to one fire, one score and one agent, with values rounded. In `next_look`, `new` is the table under the protocol in use and `old` the first table. The figures are explained in [method.md](method.md).

Errors: `404` if the build has no evidence module.

## Next-look rounds

A round is one episode of the next-look environment (`backend/env/next_look.py`). MODIS is shown and VIIRS is hidden. At each scheduled VIIRS look the player may spend one look of a budget to reveal the VIIRS detections of that look inside one tile. Rounds live in server memory: at most 16, the least recently used dropped first, and none kept after six idle hours or a restart.

No answer holds a hidden row, or a count taken from hidden rows, before the look that reveals it. Three kinds of figure are computed against the hidden detections because that is what the environment is: the starting score, the score after each step and the reward. They are scores, not rows. The score is taken on every hidden detection of the episode, looked at or not, so a step's `reward` is the score after it minus the score before it, and a round's rewards add up to `end.score_end` minus `end.score_start`. A look that reveals no pixel has a reward of exactly 0 and leaves the estimate as it was. The full reveal and the reference players' results are served only when the round is over.

No round or play is served on a closed window: one whose box meets the context box of a region with a recorded test fire and whose window meets a year of that fire's set-aside dates (2021 for `plumas_ca`, `lytton_bc` and `evia_greece`; every year a period spans, so one across New Year closes both). The rule is the model's (`backend.env.episodes.closed_for` once it is in the build; until then `backend.server_next_look.closed_for` states the same rule from the model's exclusions). Reset and play answer `409` with a sentence that names the place and its fire, and `"evidence": "/api/evidence"`: for a catalogue key before the catalogue is read, for a start once the episode's own window is found from MODIS rows. The same holds for a held-out run of `POST /api/reconstruct`. Those fires are on record and are not scored again.

### `POST /api/env/next_look/reset`

| Key | Type | Meaning |
| --- | --- | --- |
| `region_id` | string | Required. A region with FIRMS data. |
| `episode` | string | A key of the environment's catalogue, `region:tile:YYYY-MM-DDTHH`, for example `plumas_ca:22:2021-07-22T05`. |
| `start` | string | A UTC date or date-time: the round covers the first twelve MODIS overpasses with a detection in the region box at or after it. Give `episode` or `start`, not both. |
| `tiles` | `[rows, columns]` or one number | Default `[4, 4]`; each from 1 to 8. |
| `budget` | whole number | Looks the player may spend. Default 4; 0 to 24. |
| `seed` | whole number | Default 0. |

```json
{
  "round_id": "nl-89ef868194a4b0ed",
  "data": "firms",
  "source": {"environment": "...", "routes": "...", "reference_agents": "..."},
  "episode": {
    "key": "plumas_ca:22:2020-09-27T18",
    "region_id": "plumas_ca",
    "from": "start",
    "split": "fit",
    "box": [-121.44, 39.86, -120.92, 40.24],
    "first_overpass_utc": "2020-09-27T18:56:00Z",
    "last_overpass_utc": "2020-09-29T22:02:00Z",
    "span_hours": 51.1,
    "modis_overpasses": 12,
    "modis_pixels_in_box": 62,
    "rule": "the first 12 overpasses at or after the requested start with a detection in the box",
    "chosen_from": "MODIS rows only (VIIRS is hidden and was dropped before choosing)",
    "tiles": [4, 4],
    "budget": 4,
    "grid": {"nx": 118, "ny": 113, "cell_km": 0.375},
    "viirs_looks": 10,
    "viirs_platforms": ["VIIRS_NOAA20", "VIIRS_SNPP"],
    "looks_source": "nominal",
    "looks_note": "...",
    "learn_from_looks": false,
    "score": "csi",
    "reward": "the score after the look minus the score before it, on one fixed set: every real hidden detection of the episode. The rewards of a round add up to the score at the end minus the score at the start. A look that hands over no hidden pixel earns nothing.",
    "reward_target": "all"
  },
  "looks": [{"index": 0, "platform": "VIIRS_SNPP", "time_utc": "2020-09-27T21:00:10Z", "is_day": true, "scan_km": 0.46, "track_km": 0.508}],
  "score_start": 0.2813,
  "observation": {
    "decision": 0,
    "time_utc": "2020-09-27T21:00:10Z",
    "platform": "VIIRS_SNPP",
    "is_day": true,
    "budget_left": 4,
    "looks_left": 10,
    "tiles": [4, 4],
    "tile_covered": [true, true],
    "modis": {"columns": ["lon", "lat", "scan_km", "track_km", "frp_mw", "time_utc", "platform"], "rows": [[-120.9067, 39.7885, 1.1, 1.0, 12.7, "2020-09-25T19:08:00Z", "MODIS_TERRA"]]},
    "viirs_revealed": {"columns": ["lon", "lat", "scan_km", "track_km", "frp_mw", "time_utc", "platform"], "rows": []},
    "revealed_tiles": [],
    "estimate": {
      "grid": {"nx": 118, "ny": 113, "cell_km": 0.375, "box": [-121.44, 39.86, -120.92, 40.24], "order": "row-major; row 0 is the northern row, column 0 the western column"},
      "per_tile": {"expected_burning_cells": [0.0, 0.0], "unsure": [0.0, 0.0], "frp_mw": [0.0, 0.0], "sigma_mw": [0.0, 0.0]},
      "p_burning_u8": "<base64>",
      "tile_of_cell_u8": "<base64>",
      "encoding": "..."
    }
  },
  "reference": null,
  "reference_status": "computed in the background; served when the round ends",
  "test_episodes": {
    "episodes": 21,
    "mean_start_score": 0.2386,
    "mean_gain": {"random": 0.0027, "latest_modis": 0.0166, "least_sure": 0.0187, "learned": 0.0182, "oracle": 0.027},
    "mean_final": {"random": 0.2413, "latest_modis": 0.2486, "least_sure": 0.2522, "learned": 0.2508, "oracle": 0.2626},
    "plainly": "On the test episodes under protocol version 2 the learned policy does not differ from least sure by more than the noise, and it is not better.",
    "from": "backend/env/fitted/next_look.json, test_protocol_2, generated <the file's time>"
  },
  "known_limits": "...",
  "protocol": {"version": 2, "name": "...", "note": "..."},
  "rounds": {"held": 1, "max": 16}
}
```

Shortened: `looks` has one entry per scheduled look (10 here), the per-tile lists and `tile_covered` one value per tile (16 here), `modis.rows` 42 rows, and the two base64 strings one byte per cell. `score_start` is rounded.

- `observation` is what the player may know before deciding, and nothing more. `p_burning_u8` is the model's probability that a cell burns, times 255; `tile_of_cell_u8` is the tile of every cell. Tile `t` is row `t // columns` and column `t % columns`, row 0 northern.
- `looks` are the scheduled slots of the hidden platforms: platform, time and pixel size. They come from the platform and the calendar, not from a detection.
- `episode.split` is `test` when the window meets one of the three 2021 test fires, otherwise `fit`.
- `test_episodes` is the recorded reference table, read from `backend/env/fitted/next_look.json`, with the `reward` it was measured under and what an `empty_look` did then (the first reward). `validation_reference` is the table under the reward in use, on the validation episodes of 2024 and 2025, with the pass list as the looks and the learned player in use (`agents`, `differences`, `plainly`, the episodes and where it is read from).
- The looks of a round are the passes of the cached pass list over the episode's box (protocol version 3); where no pass list is cached they are nominal half-day slots (version 2). `protocol` and `known_limits` (in reset, state and a play) are the environment's own for the schedule it played.
- `source` names the files behind the environment, these routes and the reference players.

Errors: `400` for a missing `region_id`, both or neither of `episode` and `start`, an `episode` that does not look like a key or names another region, a `start` that is not a date, `tiles`, `budget` or `seed` out of range, or an episode with no scheduled VIIRS look; `404` for a region with no cached FIRMS rows and for an `episode` that is not in the catalogue; `403` and `413` as for every `POST`.

### `POST /api/env/next_look/step`

| Key | Type | Meaning |
| --- | --- | --- |
| `round_id` | string | Required. |
| `decision` | whole number | Required. The index of the look being decided; it must equal the round's current decision. |
| `action` | whole number | Required. A tile index, or `-1` for no look. |

```json
{
  "round_id": "nl-89ef868194a4b0ed",
  "decision": 7,
  "action": 6,
  "spent": true,
  "reward": 0.0061,
  "done": false,
  "info": {
    "score": 0.2642,
    "score_name": "csi",
    "score_detail": {"csi": 0.2642, "csi_one_cell": 0.5076, "brier_skill": 0.221, "hit_rate": 0.6147, "false_alarm_ratio": 0.6834},
    "revealed_pixels": 11,
    "no_budget_left": false,
    "reward_target": "all"
  },
  "observation": {"...": "the next observation, in the shape of reset's; null when the round is over"}
}
```

Values rounded. The step and end samples are a round of `plumas_ca:12:2024-07-27T17` (a validation episode of 2024, 15 looks) played with the latest MODIS agent's looks; its first look, at decision 3, revealed nothing and was paid exactly 0. The step that ends the round has `"done": true`, `"observation": null` and an `end` object:

```json
{
  "end": {
    "score_start": 0.258,
    "score_end": 0.2847,
    "gain": 0.0267,
    "looks_taken": [[3, 10], [7, 6], [11, 6], [14, 6]],
    "taught_elsewhere": {"score_before_any_look": 0.258, "score_now": 0.2709, "gain": 0.0129, "score_name": "csi", "on": "the cells outside every tile looked at, at the look it was looked at"},
    "reveal": {
      "what": "...",
      "columns": ["lon", "lat", "scan_km", "track_km", "frp_mw", "time_utc", "platform", "tile", "look", "revealed"],
      "rows": [["...", "...", "...", "...", "...", "...", "VIIRS_NOAA20", 6, 7, true]],
      "pixels": 2085
    },
    "reference": {
      "random": {"seeds": [0, 1], "gains": ["...", "..."], "finals": ["...", "..."], "actions": [["..."]]},
      "constant": {"tiles": [0, 1], "gains": ["...", "..."], "finals": ["...", "..."]},
      "centre": {"tiles": [5, 6, 9, 10], "gain": 0.0061, "final": 0.2642, "actions": ["..."], "revealed_pixels": ["..."], "taught_elsewhere": "..."},
      "latest_modis": {"gain": 0.0267, "final": 0.2847, "actions": [-1, -1, -1, 10, -1, -1, -1, 6, -1, -1, -1, 6, -1, -1, 6], "revealed_pixels": [0, 11, 149, 30], "taught_elsewhere": 0.0129},
      "least_sure": {"gain": 0.0267, "final": 0.2847, "...": "..."},
      "expected_new": {"gain": 0.0267, "...": "..."},
      "learned": {"gain": 0.0267, "...": "..."},
      "oracle": {"gain": 0.0311, "final": 0.2891, "...": "..."},
      "score_start": 0.258,
      "reads_nothing": ["random", "constant", "centre"],
      "reads_hidden_rows": ["oracle"],
      "spending": "every reference agent spends its budget on the same looks, spread evenly over the round (backend.env.agents.spend_now); only the tile differs. A person may spend a look whenever they choose.",
      "oracle_note": "sees the hidden detections and takes the best tile at each look: a ceiling, not a player"
    },
    "reference_status": "ready",
    "reference_cache": {
      "from": "cache",
      "key": "e9af404a...",
      "computed_utc": "<when the result was computed>",
      "compute_s": 38.1,
      "keyed_on": "..."
    }
  }
}
```

Shortened: `reveal.rows` cut to one entry, `random` cut to two of ten seeds and `constant` to two of 16 tiles; scores and gains are rounded, and `"..."` marks a value cut. 190 of the 2,085 hidden rows were revealed by the round's four looks. `looks_taken` has one `[decision, tile]` pair per look spent. On this episode the mean random gain is 0.0024 and the best constant tile gains 0.0267.

- `reveal` holds every VIIRS detection of the episode inside the box, each with its tile, the look it belongs to (`-1` for none) and whether the round revealed it.
- `gain` is the sum of the rewards and equals `score_end` minus `score_start`. `taught_elsewhere` is what the looks taught on cells outside every tile looked at, at the look it was looked at: `score_before_any_look`, `score_now`, their difference `gain` and the score's name (`backend.env.next_look.NextLookEnv.taught_elsewhere`); a diagnostic, not the reward.
- `reference` is the result of the reference players on this same episode (`backend.env.agents.play_reference`): random over ten seeds, the constant tile once per tile (`constant.gains` per tile), the centre tiles, latest MODIS, least sure, expected new, the learned policy and the oracle, each with its gain, final score, actions, the pixels each look revealed and what it taught elsewhere. Random, the constant tile and the centre tiles read nothing about the fire (`reads_nothing`): what they gain is the framing of the episode. The oracle reads the hidden rows and is a ceiling, not a player. The step that ends a round waits up to 90 seconds for it; if it is not ready, `reference` is `null`, `reference_status` says it is still computing, and `GET /api/env/next_look/state` returns it later.
- The reference players are played once per episode, tiles, budget and number of random seeds, and the result is kept in server memory and on disk (`data/cache/next_look_reference/`, one JSON file per key). The key is a sha256 over the episode's rows (hidden ones included), box, window and terrain, the tiles, the budget, the number of random seeds, the region's CMR pass files, and the content of every file of `backend/env`, `backend/eval` and `backend/model`, of `backend/firms/cmr_passes.py` and of `backend/server_next_look.py`. A change to the environment, its reward, the reconstruction, its fitted values or the learned policy gives a new key, so nothing computed before it is served. The files hashed are those of the code the server loaded: the digest is taken once, when the server starts, after the modules the reference players run are imported. A server still running old code after new files land keeps its old key and writes nothing more to disk, so no result of old code is ever stored under the new code's key; restart it to use the new code. The key also holds the cache's version, raised when the shape or meaning of a result changes. Rounds of one episode started while it is being computed wait on the same computation.
- `reference_cache.from` says where this round's result came from: `computed for this round`, `shared with a round started earlier` (the same key was being computed when the round started), or `cache`. `compute_s` is how long the computation took. On a September 2020 episode of the Feather River region (`plumas_ca:21:2020-09-09T09`, 4 by 4 tiles, budget 4, ten random seeds) it took 40 seconds on a laptop with other work running; a second round of it had its end, reference included, 1.4 seconds after its reset. `reference_cache` is `null` while `reference` is. It appears only in the `end` object.

Errors: `400` for a missing `round_id`, `decision` or `action`, or an `action` that is not `-1` or a tile of the round; `404` for an unknown round; `409` when `decision` is not the round's current decision, or the round is over.

### `GET /api/env/next_look/state`

| Parameter | Value |
| --- | --- |
| `round_id` | Required. |

Answers with `round_id`, `episode`, `looks`, `score_start`, `decision` (the index of the next look to decide), `done`, `history`, `observation`, `known_limits` and, when the round is over, `end` (with `reference`, `reference_status` and `reference_cache` filled in once the reference players are ready). `history` has one entry per step:

```json
{"decision": 0, "action": 13, "spent": true, "no_budget_left": false, "revealed_pixels": 16, "reward": 0.0193, "score": 0.2992}
```

Errors: `400` without `round_id`; `404` for an unknown round.

### `POST /api/env/next_look/play`

One reference player's play of one episode, step by step, from `backend.env.play.play_steps`: at each scheduled look what the player knew per tile, the score it gave each tile, the tile it chose and why, what the look revealed, the reward and the score. Until `backend/env/play.py` is in the build the route answers `404` and says so.

| Key | Type | Meaning |
| --- | --- | --- |
| `region_id`, `episode` or `start`, `tiles`, `budget`, `seed` | as for reset | The episode, as a round would play it. |
| `player` | string | Required. An id of `GET /api/env/next_look/players`; the constant tile is asked as `constant_<tile>`. |
| `ceiling` | boolean | `true` to ask for a player that reads the hidden rows (the oracle). Without it the oracle is refused with `400`. |
| `fields` | boolean | `true` adds the estimate on the 375 m grid at every step (about 36 kB a step). |
| `round_id` | string | Optional. A person's round on the same episode that is not over gives `409`. |

```json
{
  "play_id": "play-3f2a9c1b7d4e",
  "data": "firms",
  "source": {"play": "backend/env/play.py", "routes": "backend/server_next_look.py"},
  "rule": "a round of its own: it holds the hidden rows its own looks revealed and scores computed against the hidden rows ...",
  "episode": {"...": "as in reset's episode"},
  "play": {"player": {"id": "least_sure", "label": "Least sure", "...": "..."}, "steps": [{"decision": 4, "chosen_tile": 6, "why": "the tile with the highest score", "...": "..."}], "score_start": 0.2566, "score_end": 0.3028, "gain": 0.0462, "computed_against_hidden_rows": ["score_start", "steps[].reward", "..."]},
  "play_cache": {"from": "computed for this request", "computed_utc": "...", "compute_s": 3.2},
  "known_limits": "...",
  "protocol": {"...": "..."}
}
```

Shortened; the shape of `play` is the model's (`backend/env/play.py`), with one step shown. Values from the model lane's example on a 2024 episode.

- A play is a round of its own: it holds the hidden rows its own looks revealed and scores computed against the hidden rows (`play.computed_against_hidden_rows` names them). Ask for it apart from a person's round on the same episode, or after that round.
- Plays are cached in memory and under `data/cache/next_look_reference/plays/`, keyed like the reference players plus the player, the seed, `ceiling` and `fields`. `play_cache.from` is `computed for this request` or `cache`.

Errors: `400` for a bad field, a missing `player`, or the oracle without `ceiling: true`; `404` for an unknown player, region or episode, or when the play is not in the build; `409` while the given round on the same episode is not over.

### `GET /api/env/next_look/players`

The reference players a play can be asked for: `players` with `id`, `label`, `does` and `reads` (`nothing`, `the observation` or `the hidden rows`), read from `backend/env/play.py`, keeping only those its `reference_player` builds, so every listed player plays; `not_playable` names any of its table it cannot build. `404` while that module is not in the build.

## Values described from the code only

The samples above are answers of a backend with the full local cache. These values do not occur there and are described from the code:

- `terrain_pack_status` values `building` and `absent`, and a pack of the standard tier.
- `window.frames_from` when no pass list is cached, and a blind test on the nominal schedule inside a run.
- The `error` key of `GET /api/runs/starts` when the start search fails.
- `reference_status` values other than `ready`.
- The `404` of `GET /api/evidence`.
