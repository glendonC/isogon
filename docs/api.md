# HTTP API reference

This document specifies every HTTP route, parameter, header, status code, and response shape served by `backend/server.py`. Frontend contributors, backend maintainers, and external script authors read it to call the local Isogon API and decode its JSON, CSV, GeoJSON, and binary raster payloads.

For system topology and frontend hydration flows, see [docs/architecture.md](architecture.md). For NASA FIRMS cache layouts and terrain tile caches, see [docs/data.md](data.md). For forward-operator equations, occupancy filtering, and blind-test scoring definitions, see [docs/method.md](method.md) and [docs/sources.md](sources.md).

## Server conventions

### Bind address, runtime, and caching

The HTTP server runs on Python `http.server.ThreadingHTTPServer` (`IsogonHTTPServer` in `backend/server.py`) with `allow_reuse_address = True` and a per-connection idle socket timeout of 60 seconds.

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/server.py --host 127.0.0.1 --port 8788
```

| Flag | Type | Default | Description |
| --- | --- | --- | --- |
| `--host` | `string` | `"127.0.0.1"` | Local interface address to bind. |
| `--port` | `integer` | `8788` | TCP port to bind. |

At startup, `IsogonDataStore` performs three initialization steps before accepting requests:

1. Verifies that the five tracked baseline artifacts exist under `website/public/generated/fields/` (`reconstruction_u8.bin` at 6,291,456 bytes, `observer_passes.json`, `calendar_2000_2026.json`, `sensor_model_diagnostics.json`, and `field_metadata.json`), regenerating them with `run_reconstruction` if any file is missing or has the wrong byte length.
2. Pre-warms the default simulated Plumas run (`plumas_ca_holdout0_cnone`) into the active run store.
3. Spawns a background daemon thread (`firms-warm`) that pre-computes real FIRMS calendars and start-date lists for the three hero regions (`plumas_ca`, `lytton_bc`, and `evia_greece`).

Solved runs (both simulated `SolvedReconstructionRun` objects and real-data `SolvedRealRun` objects) are held in a thread-safe in-memory LRU cache (`OrderedDict`) capped at `MAX_CACHED_RUNS = 24`. Reading a run refreshes its position in the cache. Once a 25th distinct run is stored, the least-recently-used `run_id` is evicted, and subsequent asset requests under `/api/runs/{run_id}/...` return `404` until `POST /api/reconstruct` is called again for that run.

### Local-origin CORS policy and common headers

Cross-origin browser access is restricted to pages served from the local machine. `origin_allowed` matches the request `Origin` header against `^https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?$`.

- On `GET`, `HEAD`, and `OPTIONS`, a matching local `Origin` receives `Access-Control-Allow-Origin: <Origin>` and `Vary: Origin`. When `Origin` is absent or non-local, `Access-Control-Allow-Origin` is omitted.
- On `POST`, a non-empty `Origin` header that does not match the local-origin pattern is rejected immediately with `403` before the request body is read. Requests with no `Origin` header (such as local CLI scripts) are allowed.
- `OPTIONS` preflight requests on any path return `204` with `Content-Length: 0` and the CORS headers below.

| Response header | Value | Sent when |
| --- | --- | --- |
| `Access-Control-Allow-Origin` | Request `Origin` value | Request `Origin` matches `localhost`, `127.0.0.1`, or `[::1]` over `http` or `https` with an optional port. |
| `Vary` | `Origin` | Sent whenever `Access-Control-Allow-Origin` is emitted. |
| `Access-Control-Allow-Methods` | `GET, HEAD, POST, OPTIONS` | Every response. |
| `Access-Control-Allow-Headers` | `Content-Type, Accept, If-None-Match` | Every response. |
| `Access-Control-Expose-Headers` | `ETag, X-Row-Count, Content-Disposition` | Every response. |
| `Cache-Control` | `no-store` (or `public, max-age=86400` on terrain pack files) | Every response. |

### Request methods, body limits, and parameter validation

- **Trailing-slash normalization**: Every request path is normalized with `urlparse(path).path.rstrip("/") or "/"` before routing, so `/api/health/` routes identically to `/api/health`. Path segments under `/api/runs/...` are percent-decoded with `urllib.parse.unquote`.
- **`HEAD` support**: `do_HEAD` sets an internal body-suppression flag and delegates to `do_GET`. Every `GET` route supports `HEAD` and returns the exact same status code and headers (including the full payload `Content-Length`, or `304` with `ETag` on a conditional terrain-pack hit) with an empty body.
- **`POST` body size limit**: `POST /api/reconstruct` inspects `Content-Length` (defaulting to 0 when omitted). Any request with `Content-Length` greater than 262,144 bytes (256 KiB) is rejected with `413` (`{"error": "Request body too large"}`). A request with `Content-Length` less than or equal to 0 is parsed as `{}`.
- **Strict JSON parsing**: `parse_request_json` decodes UTF-8 JSON with `parse_constant=_reject_constant`. Non-standard JSON tokens `NaN`, `Infinity`, and `-Infinity` raise `ValueError("<token> is not allowed in a request body")` and return `400`. Top-level JSON arrays, strings, numbers, or booleans return `400` (`{"error": "JSON body must be an object"}`). Malformed JSON raises `json.JSONDecodeError` and returns `400`.
- **Strict field and query types**: Request helpers do not coerce across types. Passing `"false"` for a boolean returns `400` (`"<key> must be true or false"`). Passing a boolean or string for a numeric field returns `400` (`"<key> must be a number"`). Out-of-range numbers return `400` (`"<key> must be between <lo> and <hi>"`). Query floats parsed by `query_number` reject non-numeric strings and non-finite literals (`nan`, `inf`, `-inf`) with `400`.
- **Credential redaction**: `FIRMS_MAP_KEY` is never echoed in any payload, header, manifest URL, or error message.

### Error envelope and status codes

All error responses use `Content-Type: application/json; charset=utf-8` and return a JSON object with an `error` string key (there is no `detail` field):

```json
{
  "error": "holdout_viirs must be true or false"
}
```

Unmatched `GET` (or `HEAD`) routes return `404` and include an `available_endpoints` list alongside `error`:

```json
{
  "error": "Unknown endpoint '/api/unknown'",
  "available_endpoints": [
    "/api/health",
    "/api/regions",
    "/api/reconstruct",
    "/api/runs/<run_id>/<asset>",
    "/api/runs/<run_id>/terrain/<name>",
    "/api/observer",
    "/api/calendar",
    "/api/sensor-model",
    "/api/field-meta"
  ]
}
```

Unmatched `POST` routes return `404` with `{"error": "Unknown POST endpoint '<route>'"}`. Note that `backend/server.py` maps missing local FIRMS archive files (`FirmsCacheMissing`) to `404` rather than `503`; `503` is never emitted by the server.

| Status | Meaning in `backend/server.py` |
| --- | --- |
| `200` | Request succeeded; payload matches the route `Content-Type`. |
| `204` | `OPTIONS` preflight succeeded; empty body. |
| `304` | Terrain pack file unchanged (`If-None-Match` matched `ETag`); empty body. |
| `400` | Malformed JSON, non-object JSON body, `NaN`/`Infinity` literal, invalid parameter type, out-of-range number, unsupported enum value, invalid ISO date order, or CSV row selection above 500,000 rows. |
| `403` | `POST` request sent a non-local `Origin` header. |
| `404` | Unknown endpoint, unknown or uncached FIRMS `region_id`, missing FIRMS cache files (`FirmsCacheMissing`), evicted or unknown `run_id`, unavailable terrain pack file, or `belief_u8.bin` requested on a simulated run. |
| `413` | `POST /api/reconstruct` `Content-Length` exceeds 262,144 bytes. |
| `500` | Unhandled server exception (`{"error": "<message>"}`). |

---

## Route summary

| Methods | Path | Response `Content-Type` | Purpose |
| --- | --- | --- | --- |
| `GET`, `HEAD` | `/api/health` | `application/json; charset=utf-8` | Service status, model version, FIRMS cache counts, Stage 2 calibrator diagnostics, LRU run count, and baseline grid metadata. |
| `GET`, `HEAD` | `/api/regions` | `application/json; charset=utf-8` | Catalog of the five preset geographic theaters. |
| `GET`, `HEAD` | `/api/calendar` | `application/json; charset=utf-8` | Monthly harmonized fire-activity calendar (`simulated` 2000-2026 fixture or `firms` archive calendar with `real_run_starts`). |
| `GET`, `HEAD` | `/api/calendar/rows.csv` | `text/csv; charset=utf-8` | Raw cached NASA FIRMS hotspot rows for a hero region and `[start, end)` UTC window as a downloadable CSV. |
| `GET`, `HEAD` | `/api/runs/starts` | `application/json; charset=utf-8` | MODIS-selected real-run start dates and `default_start` for a hero region (`source=firms`). |
| `GET`, `HEAD` | `/api/sensor-model` | `application/json; charset=utf-8` | MODIS and VIIRS scan geometry curves, detection-limit curves, paired 13:30 LST calibration residuals, and benchmark gates `G1` through `G5`. |
| `GET`, `HEAD` | `/api/field-meta` | `application/json; charset=utf-8` | Provenance, grid orientation, RGBA channel domains, and byte sizes of the baseline static field bundle. |
| `GET`, `HEAD` | `/api/observer` | `application/json; charset=utf-8` | Per-frame orbital pass metadata, filtered sensor footprints, and live flux-sensitivity diagnostics. |
| `POST` | `/api/reconstruct` | `application/json; charset=utf-8` | Solves or retrieves a 24-frame regional fire reconstruction (`source="simulated"` or `source="firms"`). |
| `GET`, `HEAD` | `/api/runs/{run_id}/terrain/{file_name}` | `application/octet-stream`, `image/jpeg`, `image/png` | Serves terrain pack v1 rasters (1024 DEM, 8192 or 4096 ortho, 2048 aux normals/AO/canopy, detail insets, 5x context) with `ETag` caching. |
| `GET`, `HEAD` | `/api/runs/{run_id}/{asset_name}` | Binary, JPEG/PNG, GeoJSON, CSV, or JSON | Serves per-run DEMs, 2048x2048 satellite orthoimage, `reconstruction_u8.bin`, `belief_u8.bin` (real runs), GeoJSON/CSV exports, and `observer_passes.json`. |

---

## Health and region catalog

### `GET /api/health`

Returns server readiness, active model version (`model_version`), local NASA FIRMS cache manifest counts (refreshed at most once every 10 seconds), Stage 2 cross-sensor calibrator training diagnostics, count of runs stored in the 24-slot LRU cache, baseline 24 x 256 x 256 x 4 grid bounds, and advertised route templates. Also accepts `HEAD`.

**Parameters**: None (any query parameters are ignored).

**Response headers**: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`.

| Status | Condition |
| --- | --- |
| `200` | Store is initialized and health diagnostics were serialized. |
| `500` | Unexpected internal error. |

**Response example** (full offline output of `IsogonDataStore.health_payload()` in `backend/server.py`; `calibrator.fit_duration_ms` is wall-clock time):

```json
{
  "status": "ok",
  "service": "isogon-scientific-backend",
  "model_version": "0.9.0-preevent-cleanroom",
  "provenance_note": "Simulated run: a modelled fire seen by modelled satellite passes. No NASA FIRMS row is used in this run",
  "downloaded_firms_rows": 0,
  "firms_cache": {
    "downloaded_files": 0,
    "rows_in_region_boxes": {},
    "note": "real NASA FIRMS rows in the local cache; simulated runs use none of them"
  },
  "terrain_source": "real_downloaded_dem_ca_dem_f32",
  "calibrator": {
    "train_samples": 800,
    "calibration_samples": 400,
    "hurdle_feature_names": [
      "intercept",
      "vza_norm",
      "log1p_modis_area",
      "is_day",
      "slope_deg_norm",
      "cloud_frac",
      "modis_obs_density"
    ],
    "hurdle_weights": [
      0.94589,
      -0.83694,
      -0.77421,
      -2.65332,
      0.54458,
      0.20317,
      -0.89012
    ],
    "hurdle_brier_score": 0.0545,
    "quantile_feature_names": [
      "intercept",
      "log1p_modis_density",
      "vza_norm",
      "bow_tie_area_ratio",
      "slope_foreshortening",
      "hurdle_prob"
    ],
    "q10_weights": [
      0.22209,
      0.91721,
      -0.12184,
      0.08448,
      0.33612,
      0.26399
    ],
    "q50_weights": [
      0.72244,
      0.82669,
      -0.072,
      0.06375,
      0.38046,
      1.47232
    ],
    "q90_weights": [
      1.83792,
      0.59382,
      0.01243,
      0.01861,
      0.30887,
      1.03621
    ],
    "pinball_loss_mw_km2": {
      "q10": 0.5598,
      "q50": 1.7891,
      "q90": 1.1053
    },
    "c90_mw_km2": 1.753,
    "empirical_coverage_pct": 90.25,
    "raw_modis_rmse_mw_km2": 10.082,
    "calibrated_q50_rmse_mw_km2": 5.755,
    "fit_duration_ms": 26.02
  },
  "cached_runs": 1,
  "grid": {
    "frames": 24,
    "height": 256,
    "width": 256,
    "channels": 4,
    "bbox": [-121.6, 39.75, -120.75, 40.35],
    "z_hat_max_mw_km2": 80.0,
    "sigma_max_mw_km2": 24.0
  },
  "endpoints": [
    "/api/health",
    "/api/regions",
    "/api/reconstruct",
    "/api/runs/<run_id>/<asset>",
    "/api/runs/<run_id>/terrain/<name>",
    "/api/observer?frame=12&sensor=viirs",
    "/api/calendar",
    "/api/calendar?source=firms&region_id=plumas_ca",
    "/api/calendar/rows.csv?region_id=plumas_ca&start=2021-08-01&end=2021-09-01",
    "/api/sensor-model",
    "/api/field-meta"
  ]
}
```

When FIRMS extracts are present under `data/cache/firms/`, `downloaded_firms_rows` and `firms_cache.downloaded_files` report positive integers and `firms_cache.rows_in_region_boxes` maps each cached `region_id` (`plumas_ca`, `lytton_bc`, `evia_greece`) to per-platform row counts (`Terra`, `Aqua`, `Suomi NPP`, `NOAA-20`, `NOAA-21`).

---

### `GET /api/regions`

Returns the five built-in geographic theater presets (`PRESET_REGIONS` in `backend/terrain/live_region.py`): `plumas_ca`, `lytton_bc`, `novo_progresso_br`, `evia_greece`, and `blue_mountains_au`. Note that the top-level list key is `presets`. Real FIRMS calendar and real-run reconstruction routes cover the three hero presets (`plumas_ca`, `lytton_bc`, `evia_greece`), whereas simulated runs cover all five presets plus arbitrary global coordinates and gazetteer queries. Also accepts `HEAD`.

**Parameters**: None.

**Response headers**: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`.

| Status | Condition |
| --- | --- |
| `200` | Preset catalog returned. |
| `500` | Unexpected internal error. |

**Response example** (showing two of the five `presets` entries; remaining three are `novo_progresso_br`, `evia_greece`, and `blue_mountains_au`):

```json
{
  "schema_version": "1.0.0",
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
    },
    {
      "id": "lytton_bc",
      "name": "Lytton & Thompson Canyon, BC",
      "subtitle": "Steep Coast-Interior Boreal Gorge",
      "biome": "boreal_montane",
      "bbox": [-121.85, 50.04, -121.31, 50.42],
      "center_lat": 50.23,
      "center_lon": -121.58,
      "span_lon_deg": 0.54,
      "span_lat_deg": 0.38,
      "width_km": 38.53,
      "depth_km": 42.27,
      "is_preset": true
    }
  ]
}
```

---

## Harmonized fire calendars and row exports

### `GET /api/calendar`

Serves either the baseline simulated 2000-2026 monthly fire-activity calendar (`website/public/generated/fields/calendar_2000_2026.json`) or the cached real NASA FIRMS monthly calendar (`overlap_ratio_v1` harmonization in `backend/firms/real_calendar.py`) with MODIS-selected `real_run_starts` attached. Also accepts `HEAD`.

| Parameter | In | Type | Default | Constraints and behavior |
| --- | --- | --- | --- | --- |
| `source` | query | `string` | `""` (`"simulated"`) | Omit or pass `"simulated"` for the static 324-month simulated calendar. Pass `"firms"` for the real FIRMS calendar. Any other value returns `400`. |
| `region_id` | query | `string` | `""` | Ignored when `source` is omitted or `"simulated"`. Required when `source=firms`; must be one of `plumas_ca`, `lytton_bc`, or `evia_greece` with cached FIRMS extracts on disk. Missing `region_id` returns `400`; unknown or uncached `region_id` returns `404`. |

**Response headers**: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`.

| Status | Condition |
| --- | --- |
| `200` | Calendar JSON returned. |
| `400` | `source` is not `""`, `"simulated"`, or `"firms"`; or `source=firms` was requested without `region_id`. |
| `404` | `source=firms` and `region_id` is not in `REGION_COUNTRY` (`plumas_ca`, `lytton_bc`, `evia_greece`) or has no cached FIRMS extracts on disk (`KeyError`). |
| `500` | Unexpected internal error. |

**Response example (`GET /api/calendar`, simulated mode)** (trimmed from `website/public/generated/fields/calendar_2000_2026.json`, which contains 27 `annual_summary` entries and 324 monthly `records`):

```json
{
  "schema_version": "1.0.0",
  "model_version": "0.9.0-preevent-cleanroom",
  "provenance": "Analytical / Physics-Informed Pre-Event Simulation. Zero Downloaded NASA FIRMS Rows",
  "downloaded_firms_rows": 0,
  "region_id": "norcal_feather_plumas",
  "region_name": "Northern California, Feather River / Plumas Corridor",
  "bbox": [-121.6, 39.75, -120.75, 40.35],
  "reference_frame": "MODIS_NADIR_EQUIV_1330LST",
  "units": {
    "modis_raw_rate": "hotspots_per_1000km2_day",
    "viirs_raw_rate": "hotspots_per_1000km2_day",
    "harmonized_mean": "reference_activity_mw_km2_index"
  },
  "summary_metrics": {
    "total_months": 324,
    "years_span": [2000, 2026],
    "viirs_to_modis_raw_step_ratio_2012_2021": 3.81,
    "post_2022_aqua_max_drift_inflation": 1.38,
    "extreme_fire_years_highlighted": [2008, 2018, 2020, 2021]
  },
  "regime_markers": [
    {
      "year_month": "2000-11",
      "label": "MODIS Terra First Light (10:30 LST)"
    },
    {
      "year_month": "2012-01",
      "label": "VIIRS S-NPP 375 m Onset (~3.8x Raw Count Step-Jump)"
    }
  ],
  "annual_summary": [
    {
      "year": 2000,
      "modis_raw_mean": 0.679,
      "viirs_raw_mean": null,
      "harmonized_mean": 1.244,
      "harmonized_peak_month": 3.208,
      "mean_coverage_fraction": 0.455
    }
  ],
  "records": [
    {
      "index": 0,
      "year": 2000,
      "month": 1,
      "year_month": "2000-01",
      "modis_raw_rate": 0.065,
      "viirs_raw_rate": null,
      "harmonized_mean": 0.134,
      "harmonized_p10": 0.094,
      "harmonized_p90": 0.191,
      "coverage_fraction": 0.28,
      "state_label": "Harmonized",
      "sensor_regime": "TERRA_ONLY",
      "modis_orbital_drift_factor": 0.56
    }
  ]
}
```

**Response example (`GET /api/calendar?source=firms&region_id=evia_greece`, real FIRMS mode on `backend/tests/fixtures/synthetic_firms`)** (reproducible output of `SyntheticCalendarTests` in `backend/tests/test_firms_calendar.py` plus `real_run_starts` from `backend/server.py`; `harmonization_method` omits explanatory prose keys `description`, `counted_rows`, `outage_rule`, `overlap_months_excluded_for_outages`, `platforms_counted_not_fitted`, `not_in_calendar`, and `validation`; `regime_markers` shows 2 of 5 entries; `records` shows 2 of 5 months):

```json
{
  "schema_version": "1.0.0",
  "source": "firms",
  "model_version": "overlap_ratio_v1",
  "provenance": "Real NASA FIRMS standard processing rows (Country Yearly Summary files; MODIS version labels 6.2 for 2000 to 2017, 6.03 for 2018 to 2022 and 61.03 for 2023 to 2025; VIIRS version 2), counted inside the region's context box. Not simulated.",
  "downloaded_firms_rows": 7,
  "region_id": "evia_greece",
  "region_name": "Northern Evia Island, Greece",
  "bbox": [22.05, 37.96, 24.55, 39.76],
  "box_area_km2": 43323.7,
  "reference_frame": "VIIRS_SNPP_375M_EQUIV",
  "units": {
    "modis_raw_rate": "hotspots_per_1000km2_day (Terra + Aqua)",
    "viirs_raw_rate": "hotspots_per_1000km2_day (Suomi NPP)",
    "harmonized_mean": "suomi_npp_equivalent_hotspots_per_1000km2_day"
  },
  "harmonization_method": {
    "id": "overlap_ratio_v1",
    "in_use": true,
    "platforms_in_fit": ["Suomi NPP", "Terra", "Aqua"],
    "ratio_terra_aqua": {
      "ratio": 0.6667,
      "per_year": {"2021": 0.6667},
      "p10": 0.6667,
      "p90": 0.6667,
      "years": [2021],
      "viirs_rows": 2,
      "modis_rows": 3
    },
    "ratio_terra_only": {
      "ratio": 2.0,
      "per_year": {"2021": 2.0},
      "p10": 2.0,
      "p90": 2.0,
      "years": [2021],
      "viirs_rows": 2,
      "modis_rows": 1
    },
    "replaced_only_by": "a method that beats it on held-out overlap years"
  },
  "summary_metrics": {
    "total_months": 5,
    "years_span": [2021, 2021],
    "first_month": "2021-08",
    "last_month": "2021-12",
    "viirs_to_modis_overlap_ratio": 0.6667,
    "viirs_to_modis_ratio_p10_p90": [0.6667, 0.6667],
    "held_out_median_abs_relative_error": null,
    "held_out_median_abs_relative_error_without_harmonization": null,
    "held_out_annual_interval_coverage": null,
    "held_out_monthly_interval_coverage": null,
    "static_rows_excluded": {"Terra": 1},
    "offshore_rows_on_sea_excluded": {},
    "ignored_extracts": [],
    "outage_days": {
      "Aqua": 0,
      "NOAA-20": 0,
      "Suomi NPP": 0,
      "Terra": 0
    },
    "extreme_fire_years_highlighted": [],
    "coverage_note": "coverage_fraction is null: FIRMS rows are positive-only and no coverage product is fetched yet"
  },
  "regime_markers": [
    {
      "year_month": "2021-08",
      "label": "MODIS Terra rows begin",
      "source": "first month with rows in the FIRMS country file"
    },
    {
      "year_month": "2021-12",
      "label": "Aqua's last drag makeup maneuver; free drift to later overpass times",
      "source": "https://science.nasa.gov/mission/aqua/"
    }
  ],
  "annual_summary": [
    {
      "year": 2021,
      "months": 5,
      "modis_raw_mean": 0.0011,
      "viirs_raw_mean": 0.0015,
      "harmonized_mean": 0.0008,
      "harmonized_peak_month": 0.0015,
      "mean_coverage_fraction": null,
      "raw_counts": {
        "Terra": 1,
        "Aqua": 2,
        "Suomi NPP": 2,
        "NOAA-20": 1
      }
    }
  ],
  "records": [
    {
      "index": 0,
      "year": 2021,
      "month": 8,
      "year_month": "2021-08",
      "modis_raw_rate": 0.0022,
      "viirs_raw_rate": 0.0015,
      "harmonized_mean": 0.0015,
      "harmonized_p10": 0.0015,
      "harmonized_p90": 0.0015,
      "coverage_fraction": null,
      "state_label": "Harmonized",
      "sensor_regime": "MODIS_SNPP_NOAA20",
      "modis_orbital_drift_factor": null,
      "ratio_used": "terra_aqua",
      "raw_counts": {
        "Terra": {
          "day": 1,
          "night": 0,
          "total": 1,
          "static_excluded": 0,
          "offshore_on_sea_excluded": 0,
          "outage_days": 0
        },
        "Aqua": {
          "day": 1,
          "night": 1,
          "total": 2,
          "static_excluded": 0,
          "offshore_on_sea_excluded": 0,
          "outage_days": 0
        },
        "Suomi NPP": {
          "day": 1,
          "night": 1,
          "total": 2,
          "static_excluded": 0,
          "offshore_on_sea_excluded": 0,
          "outage_days": 0
        },
        "NOAA-20": {
          "day": 1,
          "night": 0,
          "total": 1,
          "static_excluded": 0,
          "offshore_on_sea_excluded": 0,
          "outage_days": 0
        },
        "NOAA-21": null
      }
    },
    {
      "index": 4,
      "year": 2021,
      "month": 12,
      "year_month": "2021-12",
      "modis_raw_rate": 0.0,
      "viirs_raw_rate": null,
      "harmonized_mean": 0.0,
      "harmonized_p10": 0.0,
      "harmonized_p90": 0.0,
      "coverage_fraction": null,
      "state_label": "Harmonized",
      "sensor_regime": "TERRA_ONLY",
      "modis_orbital_drift_factor": null,
      "ratio_used": "terra_only",
      "raw_counts": {
        "Terra": {
          "day": 0,
          "night": 0,
          "total": 0,
          "static_excluded": 1,
          "offshore_on_sea_excluded": 0,
          "outage_days": 0
        },
        "Aqua": null,
        "Suomi NPP": null,
        "NOAA-20": null,
        "NOAA-21": null
      }
    }
  ],
  "real_run_starts": {
    "region_id": "evia_greece",
    "source": "firms",
    "starts": [],
    "rule": null,
    "chosen_from": null,
    "labels_from_hidden_rows": ["viirs_pixels_in_box"],
    "hidden_counts": "counted after the list was made, for the reveal only; no start or default is chosen, dropped or ranked by them, and no label prints them",
    "search": "months from 2012 whose region box holds at least 100 MODIS rows; 0 months searched",
    "from": "backend.model.real_run.real_start_dates",
    "default_start": null,
    "default_rule": "no start is worth showing, so there is no default"
  }
}
```

---

### `GET /api/calendar/rows.csv`

Exports every deduplicated NASA FIRMS row inside the hero region context box acquired in the half-open UTC interval `[start, end)` (`rows_csv` in `backend/firms/real_calendar.py`). All 20 canonical columns in `CSV_COLUMNS` are emitted first, with sensor-specific columns left empty when a row comes from the other instrument (`brightness` and `bright_t31` for MODIS; `bright_ti4` and `bright_ti5` for VIIRS), followed by any extra columns present in the cached source files in alphabetical order. Also accepts `HEAD`.

| Parameter | In | Type | Default | Constraints and behavior |
| --- | --- | --- | --- | --- |
| `region_id` | query | `string` | `""` | Required. Must be in `REGION_COUNTRY` (`plumas_ca`, `lytton_bc`, `evia_greece`). Unknown or empty `region_id` (when dates are valid) returns `404`. |
| `start` | query | `string` | `""` | Required. ISO 8601 UTC date (`YYYY-MM-DD`) or timestamp (`YYYY-MM-DDTHH:MM:SSZ`). First 10 characters must parse via `date.fromisoformat`. |
| `end` | query | `string` | `""` | Required. Exclusive upper bound ISO 8601 UTC date or timestamp. Must satisfy `start < end` lexicographically and parse via `date.fromisoformat(end[:10])`. |
| `platforms` | query | `string` | `""` (all platforms) | Optional comma-separated platform filter (`Terra`, `Aqua`, `Suomi NPP`, `NOAA-20`, `NOAA-21`), for example `platforms=Terra,Aqua`. |

**Response headers**:

| Header | Value |
| --- | --- |
| `Content-Type` | `text/csv; charset=utf-8` |
| `Content-Disposition` | `attachment; filename="isogon_firms_<region_id>_<start_date>_<end_date>.csv"` |
| `X-Row-Count` | Decimal integer count of exported data rows (excluding the header line). |
| `Cache-Control` | `no-store` |

| Status | Condition |
| --- | --- |
| `200` | CSV rows exported (`X-Row-Count` may be `0` if the cached archive covers those years and zero detections occurred). |
| `400` | `start` or `end` is missing or not a valid ISO date, `start >= end` (`"start and end must be ISO dates; end must be after start"`), or the selection exceeds `CSV_MAX_ROWS = 500000`. |
| `404` | `region_id` is not in `REGION_COUNTRY` (`KeyError`), or the required FIRMS cache files for the requested years have not been fetched (`FirmsCacheMissing`). |
| `500` | Unexpected internal error. |

**Response example** (header plus first two of six rows returned by `rows_csv("evia_greece", "2021-08-01", "2021-09-01")` on `backend/tests/fixtures/synthetic_firms` in `backend/tests/test_firms_calendar.py`):

```csv
_acq_utc,_platform,_product,latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,version,frp,scan,track,daynight,type,brightness,bright_t31,bright_ti4,bright_ti5
2021-08-03T09:15:00Z,Terra,modis,38.9000,23.3000,2021-08-03,0915,Terra,MODIS,80,synthetic,40.5,1.1,1.0,D,0,320.1,295.0,,
2021-08-03T10:50:00Z,Suomi NPP,viirs-snpp,38.90012,23.30044,2021-08-03,1050,N,VIIRS,h,synthetic,15.31,0.42,0.38,D,0,,,340.11,298.20
```

---

### `GET /api/runs/starts`

Returns the MODIS-selected list of worth-showing real-run start dates and `default_start` for a hero region. Returns the exact same JSON object attached under `real_run_starts` in `GET /api/calendar?source=firms&region_id=<id>`. Start selection reads MODIS rows only (at least 100 MODIS pixels across 24 consecutive MODIS overpasses spanning at most 192 hours, first overpass within 24 hours of `start`); `viirs_pixels_in_box` is counted from sealed VIIRS rows only after the start list and `default_start` have been fixed. Also accepts `HEAD`.

| Parameter | In | Type | Default | Constraints and behavior |
| --- | --- | --- | --- | --- |
| `region_id` | query | `string` | `""` | Required. Must be one of `plumas_ca`, `lytton_bc`, or `evia_greece`. Empty value returns `400`; unsupported or uncached region returns `404`. |
| `source` | query | `string` | `"firms"` | Optional; defaults to `"firms"`. Any value other than `"firms"` returns `400`. |

**Response headers**: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`.

| Status | Condition |
| --- | --- |
| `200` | Start list returned (if the calendar exists on disk but start-search encounters an internal error, returns `200` with `"starts": []`, `"default_start": null`, and an `"error"` explanation string). |
| `400` | `region_id` is empty or `source` is not `"firms"` (`{"error": "needs region_id and source=firms"}`). |
| `404` | `region_id` is not in `REGION_COUNTRY` (for example `blue_mountains_au`) or has no cached FIRMS extracts (`KeyError`). |
| `500` | Unexpected internal error. |

**Response example** (deterministic synthetic output of `real_start_dates` and `with_default_start` in `backend/server.py` on two copies of `backend.eval.synthetic_fixture.extended_rows()`, matching `StartDateTests` in `backend/tests/test_model_real_run.py` and `DefaultStartTests` in `backend/tests/test_server_d5.py`):

```json
{
  "region_id": "plumas_ca",
  "source": "firms",
  "starts": [
    {
      "start": "2099-07-01",
      "label": "2099-07-01: 176 MODIS pixels in 24 MODIS overpasses over 135 h",
      "first_overpass_utc": "2099-07-01T06:35:00Z",
      "last_overpass_utc": "2099-07-06T21:35:00Z",
      "span_hours": 135.0,
      "modis_overpasses": 24,
      "modis_pixels_in_box": 176,
      "viirs_pixels_in_box": 848,
      "busiest_in_month": true
    }
  ],
  "rule": "a start date is worth showing when the 24 MODIS overpasses after it span at most 192 h, begin within 24 h of the start, and flag at least 100 pixels in the region box",
  "chosen_from": "MODIS rows only; no VIIRS row is read to choose, drop or rank a start",
  "labels_from_hidden_rows": ["viirs_pixels_in_box"],
  "hidden_counts": "counted after the list was made, for the reveal only; no start or default is chosen, dropped or ranked by them, and no label prints them",
  "search": "months from 2012 whose region box holds at least 100 MODIS rows; 1 months searched",
  "from": "backend.model.real_run.real_start_dates",
  "default_start": "2099-07-01",
  "default_rule": "the fire-model lane's default for this region (backend.model.real_run.real_run_starts)"
}
```

---

## Sensor diagnostics and baseline field metadata

### `GET /api/sensor-model`

Returns forward-operator geometry metadata, 50 percent detection-limit reference points (`thresholds_50pct_mw`), 119 scan-angle geometry curves (`scan_geometry_curves`), 82 logistic detection-probability curves (`detection_probability_curves`), 96 simulated 13:30 LST Aqua MODIS and NOAA-20 VIIRS co-observed calibration pairs (`paired_1330_calibration`), and the five benchmark gates (`benchmark_gates` from `backend/model/gates.py`). Also accepts `HEAD`.

| Parameter | In | Type | Default | Constraints and behavior |
| --- | --- | --- | --- | --- |
| `run_id` | query | `string` | `null` | Optional ID of a cached reconstruction run. When `run_id` is in the 24-slot LRU cache, gates `G1_2012_CONTINUITY` and `G5_CONFORMAL_COVERAGE` are evaluated against that run's `metrics` and `benchmark_gates_run_id` is set to `run_id`. When `run_id` is omitted or not found in the cache, the server falls back to `DEFAULT_GATE_RUN_ID` (`"plumas_ca_holdout0_cnone"`). If `plumas_ca_holdout0_cnone` is also absent from the cache, the static `sensor_model_diagnostics.json` file is served as-is (`G1` and `G5` `NOT_EVALUATED`, no `benchmark_gates_run_id` key). |

**Response headers**: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`.

| Status | Condition |
| --- | --- |
| `200` | Sensor model diagnostics and gate evaluations returned (unknown `run_id` falls back rather than returning `404`). |
| `500` | Unexpected internal error. |

**Response example** (trimmed `scan_geometry_curves`, `detection_probability_curves`, `vza_bin_summary`, and `paired_samples` from `website/public/generated/fields/sensor_model_diagnostics.json`, with `benchmark_gates` evaluated on the offline `plumas_ca_holdout0_cnone` run):

```json
{
  "schema_version": "1.0.0",
  "provenance": "Analytical Clean-Room Sensor Forward Operator. Sofiev & Kouznetsov (2026 GMD) + Wolfe et al. (2013)",
  "downloaded_firms_rows": 0,
  "geometry_metadata": {
    "modis_altitude_km": 705.0,
    "modis_swath_width_km": 2330,
    "modis_max_scan_angle_deg": 55.0,
    "viirs_altitude_km": 825.2,
    "viirs_swath_width_km": 3060,
    "viirs_max_scan_angle_deg": 56.28,
    "viirs_zone_boundaries_deg": [31.72, 44.86],
    "viirs_zone_labels": [
      "Zone 1 (0-31.72 deg, 3x1 agg, 0 rows deleted)",
      "Zone 2 (31.72-44.86 deg, 2x1 agg, 4/32 rows deleted)",
      "Zone 3 (44.86-56.28 deg, 1x1 native, 8/32 rows deleted)"
    ]
  },
  "thresholds_50pct_mw": {
    "viirs_night_nadir": 0.54,
    "viirs_day_nadir": 2.3,
    "viirs_day_edge": 5.39,
    "modis_day_nadir": 4.96,
    "modis_day_midswath_45deg": 16.73,
    "modis_day_edge_55deg": 43.54
  },
  "scan_geometry_curves": [
    {
      "scan_angle_deg": 0.0,
      "modis_valid": true,
      "modis_view_zenith_deg": 0.0,
      "modis_scan_km": 1.0,
      "modis_track_km": 1.0,
      "modis_area_km2": 1.0,
      "modis_day_d50_mw": 4.96,
      "viirs_zone": 1,
      "viirs_aggregation": "3x1",
      "viirs_view_zenith_deg": 0.0,
      "viirs_scan_km": 0.375,
      "viirs_track_km": 0.362,
      "viirs_area_km2": 0.136,
      "viirs_day_d50_mw": 2.28,
      "viirs_night_d50_mw": 0.54
    }
  ],
  "detection_probability_curves": [
    {
      "frp_mw": 0.505,
      "viirs_night_nadir": 0.3801,
      "viirs_day_nadir": 0.0,
      "viirs_day_edge": 0.0,
      "modis_day_nadir": 0.0,
      "modis_day_midswath_45deg": 0.0,
      "modis_day_edge_55deg": 0.0
    }
  ],
  "paired_1330_calibration": {
    "description": "Modeled paired 13:30 LST MODIS Aqua vs VIIRS NOAA-20 co-observed cluster calibration residuals",
    "raw_overall_bias_dex": -0.0673,
    "raw_overall_rmse_dex": 0.1203,
    "harmonized_overall_bias_dex": -0.0042,
    "harmonized_overall_rmse_dex": 0.0894,
    "n_pairs": 96,
    "conformal_90pct_empirical_coverage": 1.0,
    "vza_bin_summary": [
      {
        "vza_bin_label": "0-15 deg",
        "vza_midpoint_deg": 7.5,
        "sample_count": 28,
        "raw_mean_log10_bias": -0.0027,
        "raw_rmse_dex": 0.0854,
        "harmonized_mean_log10_bias": 0.0306,
        "harmonized_rmse_dex": 0.0963
      }
    ],
    "paired_samples": [
      {
        "pair_id": 95,
        "modis_view_zenith_deg": 62.53,
        "modis_area_km2": 7.58,
        "viirs_cluster_frp_mw": 22.31,
        "modis_raw_frp_mw": 12.47,
        "modis_harmonized_frp_mw": 21.48,
        "raw_log10_ratio": -0.2527,
        "harmonized_log10_ratio": -0.0164
      }
    ]
  },
  "benchmark_gates": [
    {
      "gate_id": "G1_2012_CONTINUITY",
      "title": "2012 S-NPP Step-Jump Removal",
      "kind": "computed",
      "criterion": "harmonized step ratio within [0.90, 1.10]",
      "source": "reconstruct run metrics step_2012_harmonized_ratio and step_2012_raw_ratio",
      "status": "PASSED",
      "metric": "run plumas_ca_holdout0_cnone: harmonized step ratio 1.07 (raw 4.83x; raw is a modelled proxy, (MODIS footprints + 1.42 x VIIRS footprints) / MODIS footprints, and the 1.42 weight has no published source)",
      "inputs": {
        "step_2012_harmonized_ratio": 1.07,
        "step_2012_raw_ratio": 4.83,
        "step_2012_coobs_frames": 15
      }
    },
    {
      "gate_id": "G2_BOWTIE_FLUX_CONSERVATION",
      "title": "Sum-Before-Threshold Footprint Flux Conservation",
      "kind": "design_target",
      "status": "NOT_EVALUATED",
      "criterion": "cluster flux error under 5% with sum-before-threshold aggregation",
      "metric": "design target, not computed by this build",
      "source": "none yet",
      "inputs": {}
    },
    {
      "gate_id": "G3_PAIRED_RESIDUAL",
      "title": "Harmonized vs Raw Paired Residual (Modelled Self-Check)",
      "kind": "computed",
      "status": "PASSED",
      "criterion": "harmonized paired RMSE below raw paired RMSE",
      "metric": "paired RMSE 0.0894 dex harmonized vs 0.1203 dex raw on 96 simulated pairs",
      "source": "paired_1330_calibration (simulated Aqua MODIS and NOAA-20 VIIRS cluster pairs)",
      "inputs": {
        "raw_rmse_dex": 0.1203,
        "harmonized_rmse_dex": 0.0894,
        "n_pairs": 96
      }
    },
    {
      "gate_id": "G4_SPATIOTEMPORAL_ASSIMILATION",
      "title": "Terrain-Coupled State-Space vs Single-Epoch Inversion",
      "kind": "design_target",
      "status": "NOT_EVALUATED",
      "criterion": "lower cloud-holdout MAE than a single-epoch inversion",
      "metric": "design target, not computed by this build",
      "source": "none yet",
      "inputs": {}
    },
    {
      "gate_id": "G5_CONFORMAL_COVERAGE",
      "title": "90% Epistemic Interval Calibration [85%, 95%]",
      "kind": "computed",
      "criterion": "empirical coverage within [85%, 95%]",
      "source": "reconstruct run metrics empirical_90_coverage_pct (split conformal, spatial folds)",
      "status": "PASSED",
      "metric": "run plumas_ca_holdout0_cnone: empirical coverage 89.1%",
      "inputs": {
        "empirical_90_coverage_pct": 89.1
      }
    }
  ],
  "benchmark_gates_run_id": "plumas_ca_holdout0_cnone"
}
```

---

### `GET /api/field-meta`

Serves the static metadata descriptor (`website/public/generated/fields/field_metadata.json`) for the pre-generated Plumas corridor field bundle, including grid orientation, linear RGBA channel domains, SHA-256 digest of `reconstruction_u8.bin`, and verification counters. Also accepts `HEAD`.

**Parameters**: None.

**Response headers**: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`.

| Status | Condition |
| --- | --- |
| `200` | Field metadata JSON returned. |
| `500` | Unexpected internal error. |

**Response example** (from `website/public/generated/fields/field_metadata.json`, showing two of the four `tensor.channels` entries; `index: 2` is `modis_observed_density` on `[0.0, 80.0]` and `index: 3` is `viirs_observed_density` on `[0.0, 80.0]`):

```json
{
  "schema_version": "1.0.0",
  "model_version": "0.9.0-preevent-cleanroom",
  "provenance_note": "Analytical / Physics-Informed Pre-Event Simulation. Zero Downloaded NASA FIRMS Rows",
  "data_provenance_distinction": {
    "terrain_elevation": "Real downloaded DEM raster loaded from website/public/generated/terrain/ca_dem_f32.bin",
    "fire_activity_and_hotspots": "Modeled physics-informed spatiotemporal fire-activity reconstruction and clean-room MODIS/VIIRS forward-operator simulation. Zero NASA FIRMS rows downloaded.",
    "downloaded_firms_rows": 0
  },
  "terrain_source": "real_downloaded_dem_ca_dem_f32",
  "dem_path_used": "website/public/generated/terrain/ca_dem_f32.bin",
  "grid": {
    "west": -121.6,
    "south": 39.75,
    "east": -120.75,
    "north": 40.35,
    "height": 256,
    "width": 256,
    "row_orientation": "north_to_south (row 0 = 40.35 N, row 255 = 39.75 N)",
    "col_orientation": "west_to_east (col 0 = -121.60 E, col 255 = -120.75 E)",
    "dx_km": 0.2836,
    "dy_km": 0.2615,
    "elevation_min_m": 313.4,
    "elevation_max_m": 2356.8
  },
  "tensor": {
    "file": "reconstruction_u8.bin",
    "dtype": "uint8",
    "shape": [24, 256, 256, 4],
    "byte_length": 6291456,
    "sha256": "a0b866114f8e67bf41c3011c54865c18126a2b3babb8648b44be92af01e2d7d1",
    "epoch_cadence_hours": 12,
    "channels": [
      {
        "index": 0,
        "rgba": "R",
        "name": "z_hat_posterior_mean",
        "units": "MW / km^2",
        "domain": [0.0, 80.0],
        "epistemic_state": "Harmonized / Predicted"
      },
      {
        "index": 1,
        "rgba": "G",
        "name": "sigma_epistemic_uncertainty",
        "units": "MW / km^2",
        "domain": [0.0, 24.0],
        "epistemic_state": "Calibrated Posterior SD"
      }
    ]
  },
  "artifacts": {
    "reconstruction_u8_bytes": 6291456,
    "observer_passes_bytes": 126079,
    "calendar_2000_2026_bytes": 139558,
    "sensor_model_diagnostics_bytes": 110773
  },
  "verification": {
    "tensor_shape": [24, 256, 256, 4],
    "tensor_bytes": 6291456,
    "terrain_source": "real_downloaded_dem_ca_dem_f32",
    "total_footprints_24_frames": 2310,
    "frame_3_modis_gap_mean_sigma": 19.525,
    "frame_4_clear_coobs_mean_sigma": 0.982,
    "frame_8_cloudy_mean_sigma": 9.98,
    "frame_10_clear_coobs_mean_sigma": 1.115,
    "frame_12_footprint_count": 126,
    "calendar_records": 324,
    "viirs_to_modis_step_ratio": 3.81,
    "compute_seconds": 3.982
  }
}
```

---

### `GET /api/observer`

Filters orbital overpasses and discrete sensor pixel footprints for one frame (0 to 23) and computes live radiative-sensitivity diagnostics (`query_observer` in `backend/server.py`). Footprints are retained when their sensor code matches `sensor`, `frp_mw >= min_frp`, inverted pixel `local_vza_deg <= max_zenith`, and `detection_probability >= 0.25`. Also accepts `HEAD`.

| Parameter | In | Type | Default | Constraints and behavior |
| --- | --- | --- | --- | --- |
| `frame` | query | `integer` | `"0"` | Must be an integer in `0..23` (`NUM_FRAMES = 24`). Non-integers or values outside `0..23` return `400`. |
| `sensor` | query | `string` | `"all"` | Case-insensitive. Accepts `"all"`, `"modis"`, `"viirs"`, or any platform identifier in `PLATFORM_CODES`: `"MODIS_TERRA"`, `"MODIS_AQUA"`, `"VIIRS_NOAA20"`, `"VIIRS_NOAA21"`, or `"VIIRS_SNPP"`. Any other value returns `400`. |
| `min_frp` | query | `number` | `"0.0"` | Finite floating-point minimum footprint FRP threshold in MW. Non-numeric or `nan`/`inf` values return `400`. |
| `max_zenith` | query | `number` | `"90.0"` | Finite floating-point maximum viewing zenith angle in degrees. Non-numeric or `nan`/`inf` values return `400`. |
| `run_id` | query | `string` | `null` | Optional ID of a cached reconstruction run. When `run_id` is omitted, empty, or no longer in the 24-slot LRU cache, `query_observer` falls back to the static baseline `observer_passes.json` and `reconstruction_u8.bin` while echoing the requested `run_id` value in the JSON response. |

Note that `reconstructed_field_total_frp_mw`, `mean_epistemic_sigma_mw_km2`, and `high_uncertainty_area_fraction` inside `sensitivity_diagnostics` scale `active_tensor` channel bytes linearly by `Z_MAX_MW_KM2` (`80.0`) and `SIGMA_MAX_MW_KM2` (`24.0`).

**Response headers**: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`.

| Status | Condition |
| --- | --- |
| `200` | Filtered passes, footprints, and sensitivity diagnostics returned. |
| `400` | `frame` is non-integer or outside `0..23`, `sensor` is unsupported, or `min_frp`/`max_zenith` is non-numeric or non-finite. |
| `500` | Unexpected internal error. |

**Response example** (`GET /api/observer?frame=0&sensor=viirs`, computed by `IsogonDataStore.query_observer` from frame `0` of `website/public/generated/fields/observer_passes.json` and `reconstruction_u8.bin`, showing two of the five retained VIIRS footprints):

```json
{
  "schema_version": "1.0.0",
  "run_id": null,
  "provenance": "Simulated run: a modelled fire seen by modelled satellite passes. No NASA FIRMS row is used in this run",
  "frame": 0,
  "timestamp_utc": "2026-08-18T21:30:00Z",
  "local_solar_time_hr": 13.4,
  "is_day": true,
  "epistemic_regime": "co_observed_clear",
  "sensor_filter": "viirs",
  "overpass_present": true,
  "sensor": "VIIRS_NOAA20",
  "subsat_lon": -119.2509,
  "subsat_lat": 40.4102,
  "altitude_km": 825.2,
  "scan_angle_deg": 11.5,
  "azimuth_deg": 75.6,
  "view_zenith_deg": 13.01,
  "cloud_fraction": 0.0,
  "passes": [
    {
      "sensor": "VIIRS_NOAA20",
      "sensor_code": 2,
      "orbit_node": "ascending",
      "subsat_lon": -119.2509,
      "subsat_lat": 40.4102,
      "altitude_km": 825.2,
      "scan_angle_deg": 11.5,
      "azimuth_deg": 75.6,
      "view_zenith_deg": 13.01,
      "swath_fraction": 1.0,
      "footprint_count": 5
    }
  ],
  "sensitivity_diagnostics": {
    "applied_min_frp_mw": 0.0,
    "applied_max_zenith_deg": 90.0,
    "sensor_pool_footprints": 5,
    "retained_footprints": 5,
    "omitted_by_filter_footprints": 0,
    "retained_total_frp_mw": 20.81,
    "mean_footprint_area_km2": 0.144,
    "mean_local_view_zenith_deg": 12.7,
    "observable_flux_fraction": 0.8835,
    "reconstructed_field_total_frp_mw": 65.96,
    "mean_epistemic_sigma_mw_km2": 1.037,
    "high_uncertainty_area_fraction": 0.0
  },
  "footprint_schema": [
    "lon",
    "lat",
    "scan_km",
    "track_km",
    "angle_deg",
    "frp_mw",
    "confidence",
    "sensor_code"
  ],
  "footprints": [
    [-121.2957, 39.9483, 0.39, 0.37, 75.6, 2.37, 69, 2],
    [-121.3108, 39.9383, 0.39, 0.37, 75.6, 2.66, 72, 2]
  ]
}
```

---

## Regional reconstruction and run assets

### `POST /api/reconstruct`

Solves (or serves from the 24-slot LRU cache) a 24-frame regional fire reconstruction and registers its binary, image, GeoJSON, CSV, and terrain-pack assets under `/api/runs/{run_id}/...`.

- When `source` is omitted, `null`, `""`, or `"simulated"`, `execute_reconstruct` runs the 3-stage physics-informed simulated solver (`solve_region_reconstruction` in `backend/model/solver.py`) with `run_id` formatted as `<region_id>_holdout<0|1>_<cnone|c00..c100>`.
- When `source` is `"firms"`, `execute_real_reconstruct` runs the 375 m forward-backward occupancy filter on cached NASA FIRMS detections (`solve_real_reconstruction` in `backend/model/real_run.py`) starting at `start`, with `run_id` formatted as `<region_id>_firms_<YYYYMMDDTHHMM>_<allsensors|holdoutviirs>`.

**Request body parameters** (`application/json` object, max 262,144 bytes; extra unknown keys are ignored):

| Field | Type | Default | Constraints and behavior |
| --- | --- | --- | --- |
| `source` | `string \| null` | `"simulated"` | Omit, pass `null`, or pass `"simulated"` for a simulated run. Pass `"firms"` for a real FIRMS run. Any other string or non-string returns `400`. |
| `region_id` | `string \| null` | `"plumas_ca"` | Preset ID (`plumas_ca`, `lytton_bc`, `novo_progresso_br`, `evia_greece`, `blue_mountains_au`). Unknown `region_id` returns `400`. On `source="firms"`, regions outside `REGION_COUNTRY` (`plumas_ca`, `lytton_bc`, `evia_greece`) raise `FirmsCacheMissing` and return `404`. |
| `query_text` | `string \| null` | `null` | Highest-priority region selector when non-blank. Accepts a preset ID, coordinate pair (`"38.86, 23.30"` or `"40.05N 121.18W"`), or any keyword in the 18-entry `_KEYWORD_GAZETTEER` (such as `"Tahoe"`, `"Lytton"`, `"Evia"`, `"Maui"`, `"Yakutia"`). Unmatched queries return `400`. |
| `center_lat` | `number \| null` | `null` | Custom window center latitude in `[-90.0, 90.0]` (clamped internally to `[-60.0, 72.0]` when building a custom bounding box). Used only when both `center_lat` and `center_lon` are provided and `query_text` is blank. |
| `center_lon` | `number \| null` | `null` | Custom window center longitude in `[-180.0, 180.0]`. Used with `center_lat`. |
| `span_lon_deg` | `number \| null` | `0.52` | Window longitude span in `[0.0, 360.0]` (clamped to `[0.20, 2.20]` when constructing a custom bounding box). Passing `span_lon_deg` or `span_lat_deg` with a preset builds a custom-sized window centered on that preset (`custom_<lat>_<lon>`). |
| `span_lat_deg` | `number \| null` | `0.38` | Window latitude span in `[0.0, 180.0]` (clamped to `[0.20, 1.80]` when constructing a custom bounding box). |
| `holdout_viirs` | `boolean \| null` | `false` | Must be `true`, `false`, or `null` (strings like `"false"` return `400`). Withholds all VIIRS observations from assimilation; on `source="firms"`, seals VIIRS rows prior to window selection and runs the blind-test scorer. |
| `holdout` | `string \| null` | `null` | Alternative holdout selector. Accepts `"viirs"` (equivalent to `holdout_viirs: true`) or `null`/omitted. Any other value (such as `"modis"`) returns `400`. |
| `cloud_override` | `number \| null` | `null` | Simulated cloud optical intensity override in `[0.0, 1.0]` (clamped to `[0.0, 0.95]` inside the solver). Rejected with `400` when `source="firms"`. |
| `start` | `string \| null` | `null` | Required when `source="firms"` (missing or empty returns `400`); type-checked and ignored on simulated runs. Accepts a UTC date (`"2021-07-22"`) or ISO UTC timestamp (`"2021-07-22T20:34:00Z"`). If fewer than 24 visible overpasses with detections in the region box occur within 30 days of `start`, returns `400`. |
| `imagery_source` | `string \| null` | `"esri_world_imagery"` | Terrain pack imagery variant: `"esri_world_imagery"` or `"usgs_naip"` (public-domain CONUS NAIP tiles inside `[-125.0, 24.4, -66.9, 49.4]`; automatically falls back to `"esri_world_imagery"` outside CONUS). Any other value returns `400`. |

**Region resolution precedence**: `resolve_region_request` checks (1) non-blank `query_text`, then (2) `center_lat` paired with `center_lon`, then (3) non-blank `region_id`, and finally (4) defaults to `"plumas_ca"` when `{}` is posted.

**Terrain pack attachment (`assets.terrain_pack` and `assets.terrain_pack_status`)**: When base terrain uses AWS Terrarium (`terrain_source` starting with `"aws_terrarium"`) and a complete terrain pack v1 is already on disk under `data/cache/hires_regions/` for `(spec, imagery_source)`, `assets` includes `"terrain_pack_status": "ready"` together with `assets.terrain_pack` (`pack_descriptor` in `backend/terrain/terrain_pack.py`, carrying `version`, `tier`, `extent_km`, `elev_range_m`, `dem`, `ortho`, `ortho_fallback`, `aux`, `sun`, and optional `ortho_detail` and `context` descriptors). When the pack is not yet on disk, `TerrainPackManager` queues a background build on its single worker thread and returns `"terrain_pack_status": "building"` (or `"failed"` within the 600-second failure cooldown, or `"absent"` when procedural fallback terrain is in use) without blocking the response.

**Response headers**: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`.

| Status | Condition |
| --- | --- |
| `200` | Reconstruction completed (or served from LRU cache) and run assets registered. |
| `400` | Invalid JSON, non-object JSON, `NaN`/`Infinity`, wrong field type, out-of-range coordinate/span/cloud value, unsupported `source`/`holdout`/`imagery_source`, unresolvable `query_text` or `region_id`, `cloud_override` sent with `source="firms"`, missing/invalid `start` on `source="firms"`, or fewer than 24 overpasses within 30 days of `start`. |
| `403` | Non-local `Origin` header on `POST`. |
| `404` | `source="firms"` requested for a region box outside cached FIRMS extracts (such as `blue_mountains_au`) or for years not yet fetched into `data/cache/firms/` (`FirmsCacheMissing`). |
| `413` | `Content-Length > 262144` bytes. |
| `500` | Unexpected internal solver error. |

**Response example (`POST /api/reconstruct` with `{"region_id": "plumas_ca"}`, offline simulated mode)** (deterministic output from tracked `website/public/generated/terrain/` assets with no `data/cache/` present; `epoch_summaries` shows frame 0 of 24, `observer_passes.frames` shows frame 0 of 24, and `pipeline_stages[].duration_ms` are wall-clock times):

```json
{
  "run_id": "plumas_ca_holdout0_cnone",
  "provenance": "Real AWS Terrarium 512x512 DEM + Maxar/Esri 2048x2048 World Imagery. Simulated run: a modelled fire seen by modelled satellite passes (no NASA FIRMS row is used in this run)",
  "downloaded_firms_rows": 0,
  "region": {
    "id": "plumas_ca",
    "name": "Feather River & Plumas, CA",
    "subtitle": "Sierra Nevada Mixed Conifer Canyon",
    "biome": "temperate_conifer",
    "bbox": [-121.44, 39.86, -120.92, 40.24],
    "center_lat": 40.05,
    "center_lon": -121.18,
    "width_km": 44.4,
    "depth_km": 42.2,
    "min_elev_m": 463.5,
    "max_elev_m": 2386.1,
    "mean_elev_m": 1494.3,
    "terrain_source": "aws_terrarium_esri_world_imagery",
    "ortho_resolution": "2048x2048",
    "dem_resolution": "512x512"
  },
  "assets": {
    "dem_f32_url": "/api/runs/plumas_ca_holdout0_cnone/dem_f32.bin",
    "dem_hires_f32_url": "/api/runs/plumas_ca_holdout0_cnone/dem_hires_f32.bin",
    "satellite_url": "/api/runs/plumas_ca_holdout0_cnone/satellite.jpg",
    "reconstruction_u8_url": "/api/runs/plumas_ca_holdout0_cnone/reconstruction_u8.bin",
    "export_geojson_url": "/api/runs/plumas_ca_holdout0_cnone/export.geojson",
    "export_csv_url": "/api/runs/plumas_ca_holdout0_cnone/export.csv",
    "terrain_pack_status": "building"
  },
  "pipeline_stages": [
    {
      "stage_id": "terrain_ingest",
      "label": "AWS Terrarium 30m DEM + Maxar 2K Ortho",
      "model_name": "Mercator-WGS84 High-Res Tile Stitcher",
      "duration_ms": 1.9,
      "status": "completed",
      "detail": "256x256 DEM (464m-2386m)"
    },
    {
      "stage_id": "sensor_operator",
      "label": "Orbital Scan PSF & Slope Foreshortening",
      "model_name": "Mechanistic MODIS/VIIRS Operator",
      "duration_ms": 386.5,
      "status": "completed",
      "detail": "24 epochs, bow-tie + 3-zone"
    },
    {
      "stage_id": "hurdle_quantile",
      "label": "Cross-Sensor Hurdle-Quantile Calibrator",
      "model_name": "Paired 13:30 LST Logistic + Pinball IRLS",
      "duration_ms": 155.1,
      "status": "completed",
      "detail": "800 train / 400 conformal pairs"
    },
    {
      "stage_id": "kalman_smoother",
      "label": "Terrain-Coupled Advection-Diffusion Filter",
      "model_name": "2D+t Forward-Backward State-Space",
      "duration_ms": 258.9,
      "status": "completed",
      "detail": "MODIS + VIIRS 375m joint assimilation"
    },
    {
      "stage_id": "conformal_gate",
      "label": "Split Conformal 90% Interval & Validation",
      "model_name": "Finite-Sample Conformal Wrapper",
      "duration_ms": 22.8,
      "status": "completed",
      "detail": "89.1% empirical coverage"
    }
  ],
  "metrics": {
    "holdout_viirs": false,
    "cloud_override": null,
    "total_reconstructed_frp_peak_mw": 4535.6,
    "raw_modis_rmse_mw_km2": 13.11,
    "reconstructed_rmse_mw_km2": 10.05,
    "rmse_reduction_pct": 23.3,
    "empirical_90_coverage_pct": 89.1,
    "conformal_q90_radius_mw_km2": 57.45,
    "subpixel_viirs_fires_recovered_pct": 99.9,
    "step_2012_raw_ratio": 4.83,
    "step_2012_harmonized_ratio": 1.07,
    "step_2012_coobs_frames": 15
  },
  "epoch_summaries": [
    {
      "frame": 0,
      "timestamp_utc": "2026-08-18T21:29:00Z",
      "lst_hr": 13.4,
      "regime": "co_observed_clear",
      "primary_sensor": "VIIRS_NOAA20",
      "cloud_fraction": 0.0,
      "reconstructed_total_mw": 13.1,
      "raw_modis_total_mw": 0.0,
      "raw_viirs_total_mw": 3.8,
      "mean_sigma_mw_km2": 0.75
    }
  ],
  "observer_passes": {
    "schema_version": "1.0.0",
    "model_version": "0.9.0-preevent-cleanroom",
    "run_id": "plumas_ca_holdout0_cnone",
    "provenance": "Real AWS Terrarium 512x512 DEM + Maxar/Esri 2048x2048 World Imagery. Simulated run: a modelled fire seen by modelled satellite passes (no NASA FIRMS row is used in this run)",
    "downloaded_firms_rows": 0,
    "terrain_source": "aws_terrarium_esri_world_imagery",
    "bbox": [-121.44, 39.86, -120.92, 40.24],
    "aoi_center": [-121.18, 40.05],
    "sensor_codes": {
      "0": "MODIS_TERRA",
      "1": "MODIS_AQUA",
      "2": "VIIRS_NOAA20",
      "3": "VIIRS_NOAA21",
      "4": "VIIRS_SNPP"
    },
    "orbit_node_rule": {
      "rule": "orbit_node is the platform's equator-crossing node on the day side of its sun-synchronous orbit for a day pass (is_day true) and the opposite node for a night pass",
      "day_node": {
        "MODIS_TERRA": "descending",
        "MODIS_AQUA": "ascending",
        "VIIRS_NOAA20": "ascending",
        "VIIRS_NOAA21": "ascending",
        "VIIRS_SNPP": "ascending"
      },
      "sources": {
        "MODIS_TERRA": {
          "url": "https://terra.nasa.gov/about",
          "quote": "Equatorial crossing: 10:30 a.m., descending mode"
        },
        "MODIS_AQUA": {
          "url": "https://science.nasa.gov/mission/aqua/about-aqua-spacecraft-and-instruments",
          "quote": "Equatorial crossing: 1:30 p.m. ascending node"
        },
        "VIIRS_NOAA20": {
          "url": "https://space.oscar.wmo.int/satellites/view/noaa_20",
          "quote": "ECT 13:30 asc"
        },
        "VIIRS_NOAA21": {
          "url": "https://space.oscar.wmo.int/satellites/view/noaa_21",
          "quote": "ECT 13:30 asc"
        },
        "VIIRS_SNPP": {
          "url": "https://space.oscar.wmo.int/satellites/view/snpp",
          "quote": "ECT 13:25 asc"
        }
      },
      "note": "Terra and Aqua have drifted from their design crossing times; the node direction is unchanged."
    },
    "footprint_schema": [
      "lon",
      "lat",
      "scan_km",
      "track_km",
      "angle_deg",
      "frp_mw",
      "confidence",
      "sensor_code"
    ],
    "frames": [
      {
        "frame": 0,
        "timestamp_utc": "2026-08-18T21:29:00Z",
        "local_solar_time_hr": 13.4,
        "is_day": true,
        "epistemic_regime": "co_observed_clear",
        "sensor": "VIIRS_NOAA20",
        "subsat_lon": -119.2559,
        "subsat_lat": 40.4102,
        "altitude_km": 825.2,
        "scan_angle_deg": 11.5,
        "azimuth_deg": 75.6,
        "view_zenith_deg": 13.01,
        "cloud_fraction": 0.0,
        "mean_z_hat_mw_km2": 0.007,
        "max_z_hat_mw_km2": 18.7,
        "mean_sigma_mw_km2": 0.748,
        "passes": [
          {
            "sensor": "MODIS_AQUA",
            "sensor_code": 1,
            "orbit_node": "ascending",
            "subsat_lon": -119.1805,
            "subsat_lat": 40.4032,
            "altitude_km": 696.2,
            "scan_angle_deg": 14.0,
            "azimuth_deg": 76.3,
            "view_zenith_deg": 15.58,
            "swath_fraction": 1.0,
            "footprint_count": 0
          },
          {
            "sensor": "VIIRS_NOAA20",
            "sensor_code": 2,
            "orbit_node": "ascending",
            "subsat_lon": -119.2559,
            "subsat_lat": 40.4102,
            "altitude_km": 825.2,
            "scan_angle_deg": 11.5,
            "azimuth_deg": 75.6,
            "view_zenith_deg": 13.01,
            "swath_fraction": 1.0,
            "footprint_count": 1
          }
        ],
        "footprints": [
          [-121.3112, 40.0287, 0.39, 0.37, 75.6, 2.41, 69, 2]
        ]
      }
    ]
  }
}
```

**Response example (`POST /api/reconstruct` with `source="firms"` and `holdout_viirs=true`, synthetic fixture run from `backend/tests/test_model_real_run.py`)**:

Real runs preserve all nine top-level keys of simulated runs (`run_id`, `provenance`, `downloaded_firms_rows`, `region`, `assets`, `pipeline_stages`, `metrics`, `epoch_summaries`, `observer_passes`) and append thirteen top-level keys from `SolvedRealRun.extras`: `source`, `start`, `holdout_viirs`, `hidden_platforms`, `hidden_platforms_note`, `window`, `firms_rows_used`, `hidden_rows`, `model`, `encoding`, `footprints_per_frame_max`, `belief_frames`, and `blind_test` (when `holdout_viirs` is `false`, `fit_residuals` replaces `blind_test`). The example below is the deterministic `_solve("viirs")` payload in `RealRunShapeTests` (`backend/tests/test_model_real_run.py`), trimmed as follows for readability: `epoch_summaries` shows frame 0 of 24; `observer_passes` omits `orbit_node_rule`, `crossing_time_offsets`, and frames 1 through 23; `model` omits the 24-key `parameters` dict; `encoding` omits `lookup_mw_km2` (256 floats) and trims `legend_ticks` to 2 of 7 entries; `belief_frames` trims `assimilated_passes` and `per_step` to 1 entry each; and `blind_test` omits `protocol`, `definitions`, `schedule`, `published`, `built_without_hidden_rows`, `from_the_scorer`, `targets`, `methods`, `reveal`, `window_choice`, `overlap_ratio_fit`, and `calendar_overlap_ratio` while showing the full `verdict` block.

```json
{
  "run_id": "plumas_ca_firms_20990701T0635_holdoutviirs",
  "provenance": "Real NASA FIRMS detections (88 rows given to the estimate, 88 drawn in the 24 frames) on Procedural DEM (no real terrain cached for this region). The reconstruction is a model estimate from those detections; pass geometry is derived from them. VIIRS detections were kept from the estimate and used only to score it.",
  "downloaded_firms_rows": 88,
  "region": {
    "id": "plumas_ca",
    "name": "Feather River & Plumas, CA",
    "subtitle": "Sierra Nevada Mixed Conifer Canyon",
    "biome": "temperate_conifer",
    "bbox": [-121.44, 39.86, -120.92, 40.24],
    "center_lat": 40.05,
    "center_lon": -121.18,
    "width_km": 44.4,
    "depth_km": 42.2,
    "min_elev_m": 900.0,
    "max_elev_m": 900.0,
    "mean_elev_m": 900.0,
    "terrain_source": "flat_test_dem",
    "ortho_resolution": "2048x2048",
    "dem_resolution": "512x512"
  },
  "assets": {
    "dem_f32_url": "/api/runs/plumas_ca_firms_20990701T0635_holdoutviirs/dem_f32.bin",
    "dem_hires_f32_url": "/api/runs/plumas_ca_firms_20990701T0635_holdoutviirs/dem_hires_f32.bin",
    "satellite_url": "/api/runs/plumas_ca_firms_20990701T0635_holdoutviirs/satellite.jpg",
    "reconstruction_u8_url": "/api/runs/plumas_ca_firms_20990701T0635_holdoutviirs/reconstruction_u8.bin",
    "export_geojson_url": "/api/runs/plumas_ca_firms_20990701T0635_holdoutviirs/export.geojson",
    "export_csv_url": "/api/runs/plumas_ca_firms_20990701T0635_holdoutviirs/export.csv",
    "terrain_pack_status": "absent"
  },
  "pipeline_stages": [
    {
      "stage_id": "terrain_ingest",
      "label": "Procedural DEM (no real terrain cached for this region)",
      "model_name": "terrain cache",
      "duration_ms": 0.0,
      "status": "completed",
      "detail": "256x256 DEM (900m-900m)"
    },
    {
      "stage_id": "sensor_operator",
      "label": "Real FIRMS Rows and Pixel Footprints",
      "model_name": "backend.firms reader, footprints from scan and track",
      "duration_ms": 3.6,
      "status": "completed",
      "detail": "88 rows, 24 MODIS and 0 VIIRS overpasses in 24 frames"
    },
    {
      "stage_id": "hurdle_quantile",
      "label": "Learned Cross-Sensor Parts",
      "model_name": "see model.learned_parts",
      "duration_ms": 0.0,
      "status": "experimental",
      "detail": "reconstruction parameters: not learned"
    },
    {
      "stage_id": "kalman_smoother",
      "label": "Forward and Backward Occupancy Filter (375 m)",
      "model_name": "backend/model/occupancy.py",
      "duration_ms": 119.6,
      "status": "completed",
      "detail": "MODIS only; hidden: VIIRS_NOAA20, VIIRS_NOAA21, VIIRS_SNPP"
    },
    {
      "stage_id": "conformal_gate",
      "label": "Blind Test Against Hidden VIIRS",
      "model_name": "backend/eval/blind_test.py",
      "duration_ms": 723.0,
      "status": "completed",
      "detail": "scored against hidden detections beside two baselines"
    }
  ],
  "metrics": {
    "holdout_viirs": true,
    "cloud_override": null,
    "total_reconstructed_frp_peak_mw": 380.6,
    "raw_modis_rmse_mw_km2": 19.77,
    "reconstructed_rmse_mw_km2": 4.23,
    "rmse_reduction_pct": 78.6,
    "empirical_90_coverage_pct": 8.7,
    "conformal_q90_radius_mw_km2": 7.55,
    "subpixel_viirs_fires_recovered_pct": 0.0,
    "step_2012_raw_ratio": 5.82,
    "step_2012_harmonized_ratio": 2.5,
    "step_2012_coobs_frames": 23,
    "source": "firms",
    "scored": true,
    "from_hidden_rows": [
      "raw_modis_rmse_mw_km2",
      "reconstructed_rmse_mw_km2",
      "rmse_reduction_pct",
      "empirical_90_coverage_pct",
      "subpixel_viirs_fires_recovered_pct",
      "step_2012_raw_ratio",
      "step_2012_harmonized_ratio",
      "step_2012_coobs_frames"
    ],
    "definitions": {
      "reference": "hidden VIIRS detections (blind test)",
      "from_hidden_rows": "the metrics computed by the scorer from the hidden rows; every other metric is fixed before they are opened",
      "raw_modis_rmse_mw_km2": "cell RMSE of MODIS painted as observed against the VIIRS detections (backend/eval/metrics.py, cell_rmse)",
      "reconstructed_rmse_mw_km2": "the same for the reconstruction's predicted VIIRS field",
      "rmse_reduction_pct": "(1 - reconstructed / raw) times 100, signed: a negative value means the reconstruction is worse",
      "empirical_90_coverage_pct": "share of scored VIIRS overpasses whose total FRP lies in the stated 90 percent interval",
      "conformal_q90_radius_mw_km2": "mean of 1.645 times the stated cell standard deviation over cells with fire; no conformal step is applied to real runs",
      "subpixel_viirs_fires_recovered_pct": "extra VIIRS cells the reconstruction hits beyond painted MODIS, as a share of the cells painted MODIS misses (0 when it hits fewer)",
      "step_2012_raw_ratio": "(MODIS pixels of the frames + VIIRS pixels of the scored overpasses) / MODIS pixels, in the box: the jump in raw counts when VIIRS joins the record",
      "step_2012_harmonized_ratio": "reconstructed total FRP / VIIRS total FRP summed over the scored VIIRS overpasses",
      "step_2012_coobs_frames": "scored VIIRS overpasses with detections in the box"
    }
  },
  "epoch_summaries": [
    {
      "frame": 0,
      "timestamp_utc": "2099-07-01T06:35:00Z",
      "lst_hr": 22.5,
      "regime": "modis_overpass",
      "primary_sensor": "MODIS_TERRA",
      "cloud_fraction": 0.0,
      "reconstructed_total_mw": 75.1,
      "raw_modis_total_mw": 14.2,
      "raw_viirs_total_mw": 0.0,
      "mean_sigma_mw_km2": 0.28
    }
  ],
  "observer_passes": {
    "schema_version": "1.0.0",
    "model_version": "1.0.0-real-rows",
    "run_id": "plumas_ca_firms_20990701T0635_holdoutviirs",
    "provenance": "Real NASA FIRMS detections (88 rows given to the estimate, 88 drawn in the 24 frames) on Procedural DEM (no real terrain cached for this region). The reconstruction is a model estimate from those detections; pass geometry is derived from them. VIIRS detections were kept from the estimate and used only to score it.",
    "downloaded_firms_rows": 88,
    "source": "firms",
    "terrain_source": "flat_test_dem",
    "bbox": [-121.44, 39.86, -120.92, 40.24],
    "aoi_center": [-121.18, 40.05],
    "sensor_codes": {
      "0": "MODIS_TERRA",
      "1": "MODIS_AQUA",
      "2": "VIIRS_NOAA20",
      "3": "VIIRS_NOAA21",
      "4": "VIIRS_SNPP"
    },
    "footprint_schema": [
      "lon",
      "lat",
      "scan_km",
      "track_km",
      "angle_deg",
      "frp_mw",
      "confidence",
      "sensor_code"
    ],
    "geometry_note": "scan_angle_deg, view_zenith_deg, azimuth_deg, subsat_lon and subsat_lat are derived from the rows' pixel sizes and acquisition times (backend/model/real_geometry.py); FIRMS does not publish them. cloud_fraction is not measured (FIRMS rows carry no cloud mask) and is written as 0.",
    "confidence_note": "MODIS confidence is the source's 0 to 100 value. VIIRS confidence is a class; the numeric slot holds 15, 55 or 90 for low, nominal, high and the class counts are in each frame's viirs_confidence_classes.",
    "frames": [
      {
        "frame": 0,
        "timestamp_utc": "2099-07-01T06:35:00Z",
        "local_solar_time_hr": 22.5,
        "is_day": false,
        "epistemic_regime": "modis_overpass",
        "sensor": "MODIS_TERRA",
        "subsat_lon": -122.3204,
        "subsat_lat": 39.8249,
        "altitude_km": 705.0,
        "scan_angle_deg": 8.1,
        "azimuth_deg": 255.9,
        "view_zenith_deg": 9.01,
        "cloud_fraction": 0.0,
        "cloud_fraction_measured": false,
        "mean_z_hat_mw_km2": 0.04,
        "max_z_hat_mw_km2": 16.29,
        "mean_sigma_mw_km2": 0.279,
        "information_age_h": 0.0,
        "viirs_confidence_classes": null,
        "passes": [
          {
            "sensor": "MODIS_TERRA",
            "sensor_code": 0,
            "orbit_node": "ascending",
            "subsat_lon": -122.3204,
            "subsat_lat": 39.8249,
            "altitude_km": 705.0,
            "scan_angle_deg": 8.1,
            "azimuth_deg": 255.9,
            "view_zenith_deg": 9.01,
            "satellite_side": "west",
            "crossing_lst_hr": 22.252,
            "swath_fraction": 1.0,
            "footprint_count": 1
          }
        ],
        "footprints": [
          [-121.2455, 40.0056, 1.1, 1.0, 255.9, 14.2, 82, 0]
        ]
      }
    ]
  },
  "source": "firms",
  "start": "2099-07-01T00:00:00Z",
  "holdout_viirs": true,
  "hidden_platforms": ["VIIRS_NOAA20", "VIIRS_NOAA21", "VIIRS_SNPP"],
  "hidden_platforms_note": "every VIIRS detection of these platforms was kept from the estimate and used only to score it; the list comes from the archive's start dates, not from the hidden rows",
  "window": {
    "first_overpass_utc": "2099-07-01T06:35:00Z",
    "last_overpass_utc": "2099-07-06T21:35:00Z",
    "overpasses": 24,
    "modis_overpasses": 24,
    "viirs_overpasses": 0,
    "modis_pixels_in_box": 88,
    "viirs_pixels_in_box": 0,
    "span_hours": 135.0,
    "rule": "the first 24 overpasses at or after the requested start with a detection in the box",
    "chosen_from": "MODIS rows only (VIIRS is hidden and was dropped before choosing)"
  },
  "firms_rows_used": 88,
  "hidden_rows": {
    "rule": "the hidden rows are parted from the visible ones before anything is chosen or built (backend/eval/holdout.py) and opened by the scorer alone",
    "payload_keys_from_the_scorer": [
      "blind_test",
      "metrics.raw_modis_rmse_mw_km2",
      "metrics.reconstructed_rmse_mw_km2",
      "metrics.rmse_reduction_pct",
      "metrics.empirical_90_coverage_pct",
      "metrics.subpixel_viirs_fires_recovered_pct",
      "metrics.step_2012_raw_ratio",
      "metrics.step_2012_harmonized_ratio",
      "metrics.step_2012_coobs_frames"
    ],
    "everything_else": "byte for byte the same whatever the hidden rows hold (pipeline_stages durations are wall clock times)"
  },
  "model": {
    "version": "1.0.0-real-rows",
    "method": "forward and backward occupancy filter on the 375 m grid (backend/model/occupancy.py)",
    "learned_parts": [
      {
        "name": "reconstruction parameters",
        "status": "not learned"
      }
    ],
    "status": "experimental",
    "status_reason": "no part of the estimate has been validated on other fires (model.learned_parts); this run's own blind test is in blind_test.verdict",
    "detection_law": "Sofiev and Kouznetsov, Geosci. Model Dev. 19, 10123, 2026, Tables 1 and 2 (re-implemented)"
  },
  "encoding": {
    "version": 2,
    "scale": "log10",
    "unit": "MW/km2",
    "min_mw_km2": 0.01,
    "max_mw_km2": 10000.0,
    "byte_zero": "no fire: the value is exactly zero",
    "encode": "byte = 0 when v is 0; otherwise 1 + round(254 * log10(v / min) / log10(max / min)), kept within 1 to 255",
    "decode": "v = 0 when byte is 0; otherwise min * (max / min) ** ((byte - 1) / 254)",
    "step_factor": 1.0559,
    "legend_ticks": [
      {"mw_km2": 0.01, "byte": 1},
      {"mw_km2": 10000.0, "byte": 255}
    ],
    "channels": {
      "r": "reconstructed FRP density (the estimate)",
      "g": "standard deviation of the estimate",
      "b": "MODIS FRP density as observed (only on MODIS frames)",
      "a": "VIIRS FRP density as observed (only on VIIRS frames)"
    },
    "applies_to": "all four channels of reconstruction_u8.bin and the density byte of belief_u8.bin, real runs only",
    "simulated_runs": "unchanged: linear, 0 to 80 MW/km2 for r, b and a, 0 to 24 for g",
    "why": "real FRP densities on 375 m cells span about six decades (0.003 to 7,132 MW/km2 in the nine windows measured); on the linear 0 to 80 scale 28 percent of observed cells and 4 percent of reconstructed cells were clipped",
    "grid": "375 m cells shown on the 256 by 256 tensor grid by nearest cell",
    "cells_with_fire": {
      "reconstruction": 27738,
      "sigma": 27738,
      "modis": 986,
      "viirs": 0
    },
    "cells_above_scale": {
      "reconstruction": 0,
      "sigma": 0,
      "modis": 0,
      "viirs": 0
    },
    "cells_below_floor": {
      "reconstruction": 244,
      "sigma": 0,
      "modis": 0,
      "viirs": 0
    },
    "note": "counts are 375 m cells over the 24 frames; a cell above the scale is written as the maximum and one below the floor as the floor; epoch_summaries and each frame's mean and max carry the exact values"
  },
  "footprints_per_frame_max": 10,
  "belief_frames": {
    "asset": "belief_u8.bin",
    "url": "/api/runs/plumas_ca_firms_20990701T0635_holdoutviirs/belief_u8.bin",
    "assimilated": "MODIS only; hidden: VIIRS_NOAA20, VIIRS_NOAA21, VIIRS_SNPP",
    "bytes": 7227028,
    "steps": 271,
    "step_minutes": 30.0,
    "first_time_utc": "2099-07-01T06:35:00Z",
    "last_time_utc": "2099-07-06T21:35:00Z",
    "grid": {
      "nx": 118,
      "ny": 113,
      "cell_km": 0.375,
      "bbox": [-121.44, 39.86, -120.92, 40.24],
      "row_0": "north",
      "column_0": "west"
    },
    "layout": "steps x ny x nx x 2, uint8, C order",
    "channels": [
      {
        "name": "p_burning",
        "meaning": "probability the cell is burning",
        "decode": "value / 255"
      },
      {
        "name": "expected_frp_density",
        "meaning": "expected FRP density, MW/km2",
        "decode": "v = 0 when byte is 0; otherwise min * (max / min) ** ((byte - 1) / 254)",
        "scale": "log10",
        "min_mw_km2": 0.01,
        "max_mw_km2": 10000.0,
        "same_as": "the run's encoding block"
      }
    ],
    "view": "forward filter only: each step uses the overpasses assimilated up to its time, so the belief spreads between passes and tightens at each one. The 24 payload frames hold the smoothed estimate instead.",
    "assimilated_passes": [
      {
        "time_utc": "2099-07-01T06:35:00Z",
        "sensor": "MODIS_TERRA",
        "pixels_in_box": 1,
        "first_step_after": 0
      }
    ],
    "per_step": [
      {
        "step": 0,
        "time_utc": "2099-07-01T06:35:00Z",
        "hours_since_last_assimilated_pass": 0.0,
        "cells_that_may_burn": 7,
        "expected_burning_cells": 2.6,
        "sharpness": 0.375,
        "expected_frp_mw": 14.2
      }
    ]
  },
  "blind_test": {
    "source": "synthetic fixture (not NASA data)",
    "blind": true,
    "hidden_instrument": "VIIRS",
    "visible_instrument": "MODIS",
    "hidden_platforms": ["VIIRS_NOAA20", "VIIRS_NOAA21", "VIIRS_SNPP"],
    "hidden_platforms_from": "the archive's start dates (backend/model/platforms.py), not the hidden rows",
    "visible_platforms": ["MODIS_AQUA", "MODIS_TERRA"],
    "test_box": [-121.44, 39.86, -120.92, 40.24],
    "grid": {
      "cell_km": 0.375,
      "nx": 118,
      "ny": 113,
      "cells": 13334
    },
    "window_utc": ["2099-07-01T06:35:00Z", "2099-07-06T21:35:01Z"],
    "visible_rows_in_test_box": 88,
    "hidden_rows_in_test_box": 424,
    "scored_overpasses": 23,
    "scored_overpasses_with_hidden_detections_in_test_box": 23,
    "hidden_overpasses_without_a_slot": 0,
    "verdict": {
      "evaluated": true,
      "method": "reconstruction",
      "baselines": ["painted_modis", "overlap_ratio"],
      "scores": {
        "csi_strict_375m": {
          "reconstruction": 0.2691588785046729,
          "painted_modis": 0.29491833030852993,
          "overlap_ratio": 0.29491833030852993,
          "better_is": "higher",
          "beats_every_baseline": false
        },
        "csi_one_cell_tolerance": {
          "reconstruction": 0.5561290322580645,
          "painted_modis": 0.5747126436781609,
          "overlap_ratio": 0.5747126436781609,
          "better_is": "higher",
          "beats_every_baseline": false
        },
        "hit_rate_at_equal_area": {
          "reconstruction": 0.690677966101695,
          "painted_modis": 0.6885593220338984,
          "overlap_ratio": 0.6885593220338984,
          "better_is": "higher",
          "beats_every_baseline": true
        },
        "brier": {
          "reconstruction": 0.0012025126808857364,
          "painted_modis": 0.002533568973725227,
          "overlap_ratio": 0.002533568973725227,
          "better_is": "lower",
          "beats_every_baseline": true
        },
        "pixel_count_error_of_sums": {
          "reconstruction": 0.2571966421301721,
          "painted_modis": 0.7877358490566038,
          "overlap_ratio": 0.4811320754716981,
          "better_is": "lower",
          "beats_every_baseline": true
        },
        "frp_error_of_sums": {
          "reconstruction": 1.4986579026887186,
          "painted_modis": 0.0027422201991720296,
          "overlap_ratio": 0.030469024874038686,
          "better_is": "lower",
          "beats_every_baseline": false
        },
        "frp_median_abs_relative_error": {
          "reconstruction": 1.780764090496683,
          "painted_modis": 0.13029827315541592,
          "overlap_ratio": 0.16155212764844257,
          "better_is": "lower",
          "beats_every_baseline": false
        }
      },
      "beats_every_baseline_on": 3,
      "scores_judged": 7,
      "interval": {
        "stated_level": 0.9,
        "observed_coverage": 0.08695652173913043,
        "overpasses": 23
      },
      "beats_every_baseline_on_every_score": false
    }
  }
}
```

---

### `GET /api/runs/{run_id}/terrain/{file_name}`

Serves prebuilt terrain pack v1 binary DEMs, JPEG orthoimagery mosaics, baked normal/sky-view/canopy PNG rasters, zoom-16 fire-detail insets, and 5x horizon context rasters (`resolve_pack_file` in `backend/terrain/terrain_pack.py`). Every file is resolved strictly against the filenames declared in a verified `meta.json` for that region's cache stem and imagery variant, preventing directory traversal. Also accepts `HEAD`.

| Parameter | In | Type | Default | Constraints and behavior |
| --- | --- | --- | --- | --- |
| `run_id` | path | `string` | required | Active run ID in the 24-slot LRU cache (`404` if evicted or unknown). |
| `file_name` | path | `string` | required | Exact filename listed in a complete pack `meta.json` for `run_id`'s region (`esri_world_imagery` default or `usgs_naip_` prefix). Any unlisted filename or path-traversal token returns `404`. |
| `If-None-Match` | header | `string` | `null` | Optional HTTP validator. When equal to the file's `ETag` (`"<size_hex>-<mtime_ns_hex>"`), the server returns `304` with an empty body. |

**Supported `file_name` assets and binary layouts**:

| `file_name` (or `usgs_naip_`-prefixed equivalent) | `Content-Type` | Layout and registration |
| --- | --- | --- |
| `dem_1024_f32.bin` | `application/octet-stream` | 1024 x 1024 C-order little-endian `float32` (4,194,304 bytes). Node-registered to `bbox` (row 0 north, col 0 west), elevation in meters. |
| `ortho_8192.jpg` (hero) or `ortho_4096.jpg` (standard) | `image/jpeg` | Primary pixel-registered sRGB orthoimage mosaic (8192 x 8192 zoom 14 on hero presets `plumas_ca`, `lytton_bc`, `evia_greece`; 4096 x 4096 zoom 13 on standard regions). |
| `ortho_4096.jpg` (hero) or `ortho_2048.jpg` (standard) | `image/jpeg` | Downsampled fallback orthoimage mosaic. |
| `aux_2048.png` | `image/png` | 2048 x 2048 4-channel RGBA `uint8` PNG: `R` = `normal_x` (`n_x * 0.5 + 0.5`, east +x), `G` = `normal_z` (`n_z * 0.5 + 0.5`, south +z), `B` = `sky_view_ao` (horizon ambient occlusion over 4,800 m), `A` = `canopy_index`. |
| `ortho_detail_<index>.jpg` | `image/jpeg` | Optional zoom-16 orthoimage inset over `uv_rect` (such as `ortho_detail_0.jpg`). |
| `context_dem_1024_f32.bin` | `application/octet-stream` | Optional 1024 x 1024 little-endian `float32` (4,194,304 bytes) covering 5x `bbox` span around the region center. |
| `context_ortho_4096.jpg` | `image/jpeg` | Optional 4096 x 4096 zoom-12 orthoimage mosaic registered to the 5x context `bbox`. |

**Response headers**:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/octet-stream` (`.bin`), `image/jpeg` (`.jpg`), or `image/png` (`.png`) |
| `Cache-Control` | `public, max-age=86400` |
| `ETag` | `"<st_size_hex>-<st_mtime_ns_hex>"` (for example `"400000-18f92a1c4b001200"`) |

| Status | Condition |
| --- | --- |
| `200` | Complete pack file streamed with `Cache-Control: public, max-age=86400` and `ETag`. |
| `304` | Request `If-None-Match` matches current `ETag`; empty body returned with `ETag` and `Cache-Control: public, max-age=86400`. |
| `404` | `run_id` is not in the active store (`{"error": "Run '<run_id>' not found in active store"}`), or `file_name` is not listed in a complete pack for that region (`{"error": "Terrain pack file '<file_name>' not available for run '<run_id>'"}`). |
| `500` | Unexpected internal error. |

**Response example** (`GET /api/runs/plumas_ca_holdout0_cnone/terrain/dem_1024_f32.bin`):

```text
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Length: 4194304
Cache-Control: public, max-age=86400
ETag: "400000-18f92a1c4b001200"

<4,194,304 bytes: 1024 x 1024 C-order little-endian float32 elevations in meters, row 0 = north, col 0 = west>
```

---

### `GET /api/runs/{run_id}/{asset_name}`

Serves the nine per-run raster, tensor, vector, tabular, and pass-geometry artifacts stored on a cached `SolvedReconstructionRun` or `SolvedRealRun`. Also accepts `HEAD`.

| Parameter | In | Type | Default | Constraints and behavior |
| --- | --- | --- | --- | --- |
| `run_id` | path | `string` | required | Active run ID in the 24-slot LRU cache (`404` if missing or evicted). |
| `asset_name` | path | `string` | required | Must be one of: `dem_f32.bin`, `dem_hires_f32.bin`, `satellite.jpg`, `satellite.png`, `reconstruction_u8.bin`, `belief_u8.bin`, `export.geojson`, `export.csv`, or `observer_passes.json`. |

**Supported `asset_name` specifications**:

| `asset_name` | `Content-Type` | Extra headers | Exact layout and encoding |
| --- | --- | --- | --- |
| `dem_f32.bin` | `application/octet-stream` | none | 256 x 256 C-order little-endian `float32` (262,144 bytes). Node-registered elevation in meters (0.0 to 8,850.0 m), row 0 north, col 0 west. |
| `dem_hires_f32.bin` | `application/octet-stream` | none | 512 x 512 C-order little-endian `float32` (1,048,576 bytes). Node-registered elevation in meters. |
| `satellite.jpg` or `satellite.png` | `image/jpeg` (Pillow) or `image/png` (stdlib fallback) | none | 2048 x 2048 RGB orthoimage (`assets.satellite_url` advertises the matching extension, though both filenames serve `satellite_bytes` with `satellite_content_type`). |
| `reconstruction_u8.bin` | `application/octet-stream` | none | 24 x 256 x 256 x 4 C-order `uint8` tensor (6,291,456 bytes). Channels: `R` reconstructed FRP density, `G` posterior SD `sigma`, `B` MODIS observed density, `A` VIIRS observed density. Simulated runs use linear scaling (0 to 80 MW/km2 on `R`/`B`/`A`, 0 to 24 MW/km2 on `G`). Real runs (`source="firms"`) use `log10` encoding v2 across all four channels (byte 0 = 0.0, bytes 1 to 255 = 0.01 to 10,000 MW/km2). |
| `belief_u8.bin` | `application/octet-stream` | none | Real runs (`source="firms"`) only; returns `404` on simulated runs. `steps x ny x nx x 2` C-order `uint8` tensor at 30-minute (1,800 s) causal forward-filter steps on the 375 m `EvalGrid`. Byte 0 is `p_burning` (`value / 255`); byte 1 is expected FRP density on the real-run `log10` scale (0.01 to 10,000.0 MW/km2). |
| `export.geojson` | `application/geo+json; charset=utf-8` | `Content-Disposition: attachment; filename="<run_id>_harmonized.geojson"` | RFC 7946 `FeatureCollection` of up to 240 peak-epoch `Point` features (`[lon, lat]`). |
| `export.csv` | `text/csv; charset=utf-8` | `Content-Disposition: attachment; filename="<run_id>_harmonized.csv"` | Peak-epoch cells CSV. Simulated runs emit 9 columns (ending with `slope_deg`); real runs emit 8 columns (ending with `elevation_m`). |
| `observer_passes.json` | `application/json; charset=utf-8` | none | Full 24-frame observer geometry and footprint JSON identical to `observer_passes` in the `POST /api/reconstruct` response. |

**Response headers**: `Cache-Control: no-store` on all assets, plus `Content-Disposition` on `export.geojson` and `export.csv`.

| Status | Condition |
| --- | --- |
| `200` | Asset returned with its corresponding `Content-Type`. |
| `404` | `run_id` not in store (`{"error": "Run '<run_id>' not found in active store"}`), `belief_u8.bin` requested for a simulated run (`{"error": "Run '<run_id>' has no belief frames (real runs only)"}`), or `asset_name` is unrecognized (falls through to catch-all `404` `{"error": "Unknown endpoint '/api/runs/<run_id>/<asset_name>'", "available_endpoints": [...]}`). |
| `500` | Unexpected internal error. |

**Response examples** (deterministic offline `plumas_ca_holdout0_cnone` exports from `backend/model/solver.py`; `export.geojson` shows the first of 240 peak-epoch features and full `metadata`):

`GET /api/runs/plumas_ca_holdout0_cnone/export.geojson` (simulated run; real runs omit `slope_deg`, set `epistemic_state` to `"Reconstructed_From_Real_FIRMS_Rows"`, and replace `metadata.downloaded_firms_rows` with `metadata.firms_rows_used`):

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "run_id": "plumas_ca_holdout0_cnone",
    "model_version": "0.9.0-preevent-cleanroom",
    "provenance": "Real AWS Terrarium 512x512 DEM + Maxar/Esri 2048x2048 World Imagery. Simulated run: a modelled fire seen by modelled satellite passes (no NASA FIRMS row is used in this run)",
    "downloaded_firms_rows": 0,
    "region": {
      "id": "plumas_ca",
      "name": "Feather River & Plumas, CA",
      "subtitle": "Sierra Nevada Mixed Conifer Canyon",
      "biome": "temperate_conifer",
      "bbox": [-121.44, 39.86, -120.92, 40.24],
      "center_lat": 40.05,
      "center_lon": -121.18,
      "width_km": 44.4,
      "depth_km": 42.2,
      "min_elev_m": 463.5,
      "max_elev_m": 2386.1,
      "mean_elev_m": 1494.3,
      "terrain_source": "aws_terrarium_esri_world_imagery",
      "ortho_resolution": "2048x2048",
      "dem_resolution": "512x512"
    },
    "metrics": {
      "holdout_viirs": false,
      "cloud_override": null,
      "total_reconstructed_frp_peak_mw": 4535.6,
      "raw_modis_rmse_mw_km2": 13.11,
      "reconstructed_rmse_mw_km2": 10.05,
      "rmse_reduction_pct": 23.3,
      "empirical_90_coverage_pct": 89.1,
      "conformal_q90_radius_mw_km2": 57.45,
      "subpixel_viirs_fires_recovered_pct": 99.9,
      "step_2012_raw_ratio": 4.83,
      "step_2012_harmonized_ratio": 1.07,
      "step_2012_coobs_frames": 15
    }
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-121.24016, 40.04031]
      },
      "properties": {
        "z_hat_mw_km2": 66.549,
        "sigma_mw_km2": 2.925,
        "ci90_low": 49.806,
        "ci90_high": 83.292,
        "epoch_peak": 6,
        "elevation_m": 1227.6,
        "slope_deg": 33.72,
        "epistemic_state": "Harmonized_MultiSensor"
      }
    }
  ]
}
```

`GET /api/runs/plumas_ca_holdout0_cnone/export.csv` (simulated run header and first row; on real `source="firms"` runs, the final `,slope_deg` column is omitted):

```csv
lon,lat,z_hat_mw_km2,sigma_mw_km2,ci90_low,ci90_high,epoch_peak,elevation_m,slope_deg
-121.24016,40.04031,66.549,2.925,49.806,83.292,6,1227.6,33.72
```
