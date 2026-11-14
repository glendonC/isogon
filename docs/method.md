# Method and evaluation

This document explains Isogon's active-fire sensor physics, monthly archive harmonization, simulated and real-archive reconstruction models, blind evaluation protocol, and experimental learned extensions. Researchers and engineers read it to audit modeling assumptions, check positive and negative validation outcomes, and reproduce benchmark scores from tracked files.

## Sensor physics and orbital differences

Raw active-fire time series from NASA FIRMS change sharply in January 2012 when `VIIRS` on Suomi NPP joins `MODIS` on Terra and Aqua. A jump in detection counts does not imply a jump in landscape burning. The two instrument families observe the ground from different sun-synchronous orbits, aggregate off-nadir detector elements differently, and trigger contextual fire flags at different radiative power floors.

### Satellite platforms and overpass cadence

Isogon models five polar-orbiting platforms defined in `backend/model/platforms.py` and `backend/model/sensor_physics.py`. For dataset ingestion details and FIRMS source codes, see [docs/data.md](data.md).

| Platform code | Satellite and instrument | Nominal altitude and inclination | Nominal local crossing (day / night) | Archive span and orbital notes |
| --- | --- | --- | --- | --- |
| `MODIS_TERRA` | Terra MODIS | 705.0 km, 98.5 deg (99.0 min period) | 10:30 descending / 22:30 ascending | Starts 2000-11-01. Mean local crossing drifts earlier after February 2020 following the final inclination maneuver. |
| `MODIS_AQUA` | Aqua MODIS | 705.0 km, 98.2 deg (98.8 min period) | 13:30 ascending / 01:30 descending | Starts 2002-07-04. Mean local crossing drifts later after fuel depletion in December 2021. |
| `VIIRS_SNPP` | Suomi NPP VIIRS (375 m I-band) | 825.2 km simulator (824 km WMO OSCAR), 98.70 deg (101.4 min period) | 13:25 ascending / 01:25 descending | Starts 2012-01-20; science archive ends 2026-11-02 (`backend/firms/real_calendar.py`). |
| `VIIRS_NOAA20` | NOAA-20 / JPSS-1 VIIRS (375 m I-band) | 825.2 km simulator (824 km WMO OSCAR), 98.7 deg (101.4 min period) | 13:30 ascending / 01:30 descending | Starts 2018-04-01; flies half an orbit offset from Suomi NPP. |
| `VIIRS_NOAA21` | NOAA-21 / JPSS-2 VIIRS (375 m I-band) | 825.2 km simulator (824 km WMO OSCAR), 98.7 deg (101.4 min period) | 13:30 ascending / 01:30 descending | Starts 2023-03-01 via near-real-time Area API extracts (`VIIRS_NOAA21_NRT`). |

### Scan geometry, bow-tie overlap, and detection floors

`backend/model/sensor_physics.py` implements clean-room scan geometry from Wolfe et al. (2013) and logistic detection curves from Sofiev and Kouznetsov (2026, Tables 1 and 2). Full analytical scan curves are exported in `website/public/generated/fields/sensor_model_diagnostics.json`.

| Property | MODIS (1 km thermal bands) | VIIRS (375 m I-band) | Code reference |
| --- | --- | --- | --- |
| Max scan angle and swath width | +/- 55.0 deg, 2,330 km swath (leaves low-latitude inter-orbit gaps) | +/- 56.28 deg, 3,060 km swath (closes equatorial inter-orbit gaps) | `backend/model/sensor_physics.py` |
| Cross-track aggregation | None (10 native detector rows per scan) | Zone 1 (0 to 31.72 deg): 3x1; Zone 2 (31.72 to 44.86 deg): 2x1 with 4 of 32 edge rows deleted; Zone 3 (44.86 to 56.28 deg): 1x1 native with 8 of 32 edge rows deleted | `viirs_geometry_from_scan` in `backend/model/sensor_physics.py` |
| Footprint dimensions and area | 1.0 km x 1.0 km (1.00 km2) at nadir; expands continuously to 4.8 km x 2.0 km (~9.69 km2) at 55.0 deg | 0.375 km x 0.362 km (0.136 km2) at nadir; bounded near ~0.62 km2 at swath edge by zone switching | `modis_geometry_from_scan`, `viirs_geometry_from_scan` |
| Bow-tie scan overlap | Consecutive 10-row scans overlap off-nadir with fractional overlap `(10 * track_km - 10) / 10` | Partial outer-row deletion removes most consecutive-scan overlap in Zones 2 and 3 | `backend/model/sensor_physics.py` |
| 50% detection midpoint `D_50` (`lambda * A_p + mu`) | Day: `4.44 * A_p + 0.52` MW (4.96 MW nadir, 16.73 MW at 45 deg, 43.54 MW at 55 deg), `gamma = 2.65`. Night: `4.43 * A_p + 1.01` MW, `gamma = 3.10`. | Day: `6.17 * A_p + 1.44` MW (2.28 to 2.30 MW nadir, 5.39 MW edge), `gamma = 2.35`. Night: `1.38 * A_p + 0.35` MW (0.54 MW nadir), `gamma = 2.80`. | `detection_probability` in `backend/model/sensor_physics.py` |
| Simulator contextual FRP floor | 12.0 MW day, 7.5 MW night | 1.45 MW day, 0.55 to 0.75 MW night | `backend/model/sensor_physics.py` |
| 4 um slant-path transmittance | `exp(-0.085 * (sec(vza) - 1))` | `exp(-0.085 * (sec(vza) - 1))` | `slant_path_transmittance` in `backend/model/sensor_physics.py` |

Opaque cloud decks and thick smoke plumes block 4 um thermal radiance on both sensors. When a satellite passes over a burning landscape under cloud cover, FIRMS records zero detections for that pass without distinguishing cloud occlusion from extinguished fire.

## Monthly calendar harmonization

`backend/firms/real_calendar.py` builds a continuous monthly regional fire-activity series from November 2000 through December 2025 using the `overlap_ratio_v1` method. The module aligns pre-2012 `MODIS` rates onto a Suomi NPP `VIIRS`-equivalent scale without inventing sub-pixel spatial locations.

1. **Static and offshore filtering**: Before counting detections, `is_PersistentOrSea` removes rows with FIRMS `type` equal to `2` (static industrial land sources such as flare stacks, cement kilns, and steel mills). It also removes coastal or marine rows with `type` equal to `3` whose elevation in the regional context DEM is 0.0 m or within 500.0 m (`COAST_M`) of sea level. Inland `type` `3` rows beside mountain lakes are retained.
2. **Area-rate normalization**: Monthly detection counts inside each region's 5x context bounding box are converted to daily rates per 1,000 square kilometers (`count / (area_km2 / 1000.0) / days_in_month`) so regions of different area and months of different length share common units.
3. **Clean overlap ratio and pre-Aqua ratio**: Over the overlap years 2012 through 2025, the calendar identifies clean months where Terra, Aqua, and Suomi NPP are all active and free of country-wide outage days. A platform day is flagged as an outage when that platform logs zero rows across the entire host country while the other platforms log at least 100 rows (`OUTAGE_MIN_OTHER_ROWS`). Across clean overlap months, the module fits `ratio = sum(Suomi NPP) / sum(Terra + Aqua)`. For months before Aqua enters service (November 2000 through June 2002, flagged `TERRA_ONLY`), it fits `ratio_terra_only = sum(Suomi NPP) / sum(Terra)` over the same clean overlap window.
4. **Uncertainty interval and platform scope**: Each month's harmonized `MODIS` estimate carries `[harmonized_p10, harmonized_p90]` bounds computed from the 10th and 90th percentiles of per-year overlap ratios. `NOAA-20` and `NOAA-21` counts are preserved in `raw_counts` for inspection and excluded from the fitted ratio so the reference sensor pair remains fixed from 2012 through 2025. Rows from 2026 near-real-time Area API extracts are excluded from the monthly calendar because regional extracts cannot verify country-wide outage days and omit the `type` column required to filter static industrial sources.
5. **Leave-one-year-out check**: `leave_one_year_out` holds out each clean overlap year in turn, refits `[ratio, p10, p90]` on the remaining clean overlap years, and compares annual and monthly interval coverage and median absolute relative error against unharmonized `MODIS` (`(modis_obs - viirs_obs) / viirs_obs`).

Reproduce the overlap-ratio and leave-one-year-out checks on the tracked synthetic fixture with:

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m unittest backend.tests.test_firms_calendar
```

## Simulated world model and reconstruction

When running without local FIRMS caches, or when exercising controlled synthetic ablations, Isogon runs the 24-frame forward-and-inverse simulation in `backend/model/world_model.py`, `backend/model/sensor_physics.py`, `backend/model/solver.py`, `backend/model/calibrator.py`, and `backend/model/reconstruct.py`.

### Synthetic 24-frame forward model

`backend/model/world_model.py` evolves a synthetic `256 x 256` latent fire radiative flux density field (12 days at 12-hour cadence) coupled to real digital elevation data (`website/public/generated/terrain/ca_dem_f32.bin` in the static fallback bundle). At each scheduled overpass, the forward operator projects latent flux through rotated elliptical 2D Gaussian footprints determined by scan angle, terrain slope foreshortening, 4 um slant-path attenuation, synthetic cloud and smoke masks, and logistic FRP detection censoring.

`backend/model/reconstruct.py` packs the resulting 24-frame stack into `website/public/generated/fields/reconstruction_u8.bin` (`(24, 256, 256, 4)` `uint8`, 6,291,456 bytes):

- Channel `R` (`z_hat_posterior_mean`): reconstructed flux density mapped linearly onto 0.0 to 80.0 MW/km2.
- Channel `G` (`sigma_epistemic_uncertainty`): calibrated posterior standard deviation mapped linearly onto 0.0 to 24.0 MW/km2.
- Channel `B` (`modis_observed_density`): simulated `MODIS` footprint flux density on 0.0 to 80.0 MW/km2.
- Channel `A` (`viirs_observed_density`): simulated `VIIRS` footprint flux density on 0.0 to 80.0 MW/km2.

### Three-stage observation-aware solver

`backend/model/solver.py` and `backend/model/calibrator.py` invert simulated sensor observations in three stages followed by split conformal calibration:

1. **Mechanistic sensor operator**: Compensates observed footprints for view-zenith slant-path transmittance, terrain slope foreshortening, and off-nadir elliptical point-spread broadening.
2. **Hurdle-Quantile cross-sensor calibrator**: Fits a two-part calibrator on 800 deterministic paired 13:30 Aqua `MODIS` and NOAA-20 `VIIRS` cluster samples (`backend/model/calibrator.py`). A `Newton-IRLS` logistic classifier estimates sub-threshold omission probability, and three `Pinball-IRLS` quantile regression heads estimate the 0.10, 0.50, and 0.90 conditional flux quantiles.
3. **2D+t Rauch-Tung-Striebel Kalman smoother**: Assimilates calibrated `MODIS` and `VIIRS` frames forward and backward across the 24 epochs under terrain-driven upslope advection and isotropic diffusion. `viirs_observation_variance` in `backend/model/solver.py` depends only on footprint area (`1.6 + 2.8 * area_km2`) without proportional flux variance so bright fire cores are not damped during assimilation. Missing swaths and cloudy pixels carry infinite observation variance, causing posterior uncertainty `sigma` to grow across unobserved frames and contract on clear co-observed passes.
4. **Split conformalized quantile regression (CQR)**: Calibrates 90% prediction intervals on 400 held-out paired samples using split conformal residual quantiles following Romano, Patterson, and Candes (2019).

### Simulated benchmark gates

`backend/model/gates.py` exposes five benchmark gates via `/api/sensor-model` and `website/public/generated/fields/sensor_model_diagnostics.json`. Three gates (`G1`, `G3`, `G5`) carry `kind` equal to `computed`; two gates (`G2`, `G4`) carry `kind` equal to `design_target` and always return `NOT_EVALUATED`.

| Gate ID | Kind | Criterion | Static diagnostics status and caveats |
| --- | --- | --- | --- |
| `G1_2012_CONTINUITY` | `computed` | Harmonized 2012 step ratio within `[0.90, 1.10]` | `NOT_EVALUATED` in static bundle; computed per reconstruct run (`GET /api/sensor-model?run_id=...`). Measures continuity against observed `VIIRS` reference flux rather than pre-cloud latent flux (which is 1.55x to 2.29x higher), and compares against `step_2012_raw_ratio`, whose 1.42 footprint proxy weight has no published source (`backend/model/gates.py`). |
| `G2_BOWTIE_FLUX_CONSERVATION` | `design_target` | Cluster flux error under 5% with sum-before-threshold aggregation | Always `NOT_EVALUATED` (`design target, not computed by this build`). |
| `G3_PAIRED_RESIDUAL` | `computed` | `harmonized_overall_rmse_dex < raw_overall_rmse_dex` | `PASSED` in `sensor_model_diagnostics.json`: 0.0894 dex harmonized vs 0.1203 dex raw across 96 simulated Aqua/NOAA-20 pairs (modeled self-check on synthetic pairs). |
| `G4_SPATIOTEMPORAL_ASSIMILATION` | `design_target` | Lower cloud-holdout MAE than single-epoch inversion | Always `NOT_EVALUATED` (`design target, not computed by this build`). |
| `G5_CONFORMAL_COVERAGE` | `computed` | Empirical 90% interval coverage within `[85%, 95%]` | `NOT_EVALUATED` in static bundle; computed per reconstruct run (`empirical_90_coverage_pct` over spatial folds). |

Regenerate the static simulated bundle and diagnostics with:

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/model/reconstruct.py
```

## Real-FIRMS blind reconstruction and scoring

When cached FIRMS extracts are present under `data/cache/firms/`, `backend/model/real_run.py` reconstructs active fire on a 375 m evaluation grid from `MODIS` detections alone while holding out `VIIRS` detections for blind scoring.

### Holdout sealing and pass censoring

`backend/eval/holdout.py` seals input detections through `seal()`, returning visible `MODIS` rows while isolating hidden `VIIRS` rows inside an opaque `HoldoutVault`. Only `backend/eval/blind_test.py` and `backend/env/next_look.py` are allowed to call `open_for_scoring()`, enforced by static source checks in `backend/tests/test_eval_holdout.py`. Under protocol version 2 (`PROTOCOL_VERSION = 2` in `backend/eval/blind_test.py`), candidate fire start dates (`real_start_dates` in `backend/model/real_run.py`), 24-overpass window bounds (`select_real_window` in `backend/model/real_blind.py`), reconstruction beliefs, and nominal target slots (`backend/eval/schedule.py`) depend exclusively on visible `MODIS` rows and platform orbit parameters.

Distinguishing an observed zero from a blind unvisited frame requires overpass geometry:

- **NASA CMR granule pass envelopes**: `backend/firms/cmr_passes.py` queries keyless NASA Common Metadata Repository (`granules.json`) active-fire collections (`MOD14`, `MYD14`, `VNP14IMG`, `VJ114IMG`, `VJ214IMG`) to record exact overpass start/end times, geodetic swath polygons densified along great-circle arcs, and `MODIS` granule-level `cloud_cover` metadata. When recorded CMR pass files are absent, `backend/model/real_geometry.py` and `backend/model/platforms.py` fall back to analytical sun-synchronous orbital geometry, estimating empirical local-crossing drift offsets (`crossing_offsets`) whenever at least four passes are present.
- **Blind-test schedule and context-box censoring**: In `backend/eval/schedule.py` and `backend/env/next_look.py`, target evaluation times use nominal half-day sun-synchronous orbital slots (`SOURCE_NOMINAL`), which can differ by up to roughly 90 minutes from actual granule crossing times. Inside `OccupancyReconstruction` (`backend/model/occupancy.py`), any `MODIS` pass that flags at least one detection in the wider 5x regional context box is treated as covering the inner study box, down-weighting undetected inner cells with a clear-sky probability prior `clear_sky` equal to 0.8 because FIRMS rows carry no per-pixel cloud mask.

### Two-state forward-backward occupancy filter

`OccupancyReconstruction` in `backend/model/occupancy.py` discretizes the study box onto `EvalGrid` (375 m cells in `backend/eval/grid.py`) and tracks four quantities per cell across time: active burning probability `a`, expected radiative power `F` (MW), cumulative burned-through fraction `b`, and post-burn smoldering warmth `r`. Between visible `MODIS` passes, fire activity advances along terrain-coupled spread kernels with residence time `tau_res_h`, spread rate `spread_km_per_h`, smoldering decay `tau_smolder_h`, and diurnal modulation `diurnal_amplitude`. Forward and backward filter states combine at each target slot via exponential information-age weights `exp(-age / age_tau_h)`. Real-data reconstruction tensors encode flux density logarithmically across `[0.01, 10000.0]` MW/km2 in bytes `1..255` with byte `0` reserved for `0.0` (`backend/model/encoding.py`).

### Baselines and blind metrics

`backend/eval/blind_test.py` and `backend/eval/metrics.py` pool predictions across all hidden `VIIRS` target slots and compare `reconstruction` against two `MODIS`-only baselines implemented in `backend/eval/baselines.py`:

- `painted_modis`: Paints detections from the nearest visible `MODIS` pass within 12 hours onto 375 m cells inside each `scan x track` footprint without scaling total FRP or pixel count.
- `overlap_ratio`: Uses the same painted cells, multiplies predicted FRP by `0.8136` (fitted on 2,685 paired passes within 90 minutes across 262,125 training rows in `backend/model/fitted_values/overlap_ratio.json`), and multiplies predicted pixel count by the leave-year-and-test-year-out monthly calendar ratio (`backend/model/calendar_ratio.py`).

Seven pooled metrics plus 90% FRP interval coverage are scored across three preset landscapes (`plumas_ca`, `lytton_bc`, `evia_greece`):

- Cell placement and calibration: strict 375 m critical success index (`csi_strict_375m`), one-cell-tolerance CSI within +/- 375 m (`csi_one_cell_tolerance`), equal-area hit rate at the hidden `VIIRS` pixel count (`hit_rate_at_equal_area`), and cell-wise probability Brier score (`brier`).
- Aggregate counts and radiative power: relative error of summed pixel counts (`pixel_count_error_of_sums`), relative error of summed FRP (`frp_error_of_sums`), median per-overpass absolute relative FRP error (`frp_median_abs_relative_error`), and empirical coverage of the stated 90% FRP interval.

Run the offline synthetic blind-test check (scoring `reconstruction`, `painted_modis`, and `overlap_ratio` on `backend/tests/fixtures/synthetic_firms`) with:

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.eval.blind_test
```

## Experimental learned extensions and negative results

Isogon tracks three learned or fitted extensions on real FIRMS fire episodes: occupancy parameter fitting (`backend/model/fitted_values/occupancy_params.json`), `VIIRS`-to-Terra morning pass estimation (`backend/model/fitted_values/terra_morning.json`), and active next-look tile selection (`backend/env/fitted/next_look.json`). Every non-adopted fit, failed strict gate, and bootstrap confidence interval crossing zero is preserved in tracked JSON artifacts.

### Real-FIRMS occupancy parameter fit

`backend/model/fit_real.py` fits 19 scalar occupancy parameters by coordinate search on 21 training fire episodes (296 overpasses across 2018, 2019, 2020, 2021, 2022, and 2023 in the `plumas_ca`, `lytton_bc`, and `evia_greece` context boxes, excluding the three 2021 test fires and whole-year +/- 0.2 deg spatial buffers defined in `backend/model/training.py`). Validation runs under protocol version 2 on 7 episodes from 2024 and 2025 (152 overpasses, chosen from `MODIS` rows alone).

- **Initial strict rule fails (`first_rule_outcome.met: false`)**: The initial pre-fit rule requires every cell metric to sit strictly above both baselines on pooled validation episodes with no resampling allowance (`backend/model/fitted_values/occupancy_params.json`, lines 58 to 62). That check fails because `hit_rate_at_equal_area` scores 0.5749 against 0.5875 for both baselines.
- **Whole-episode bootstrap rule (`adopted: true` for parameters, partial `experimental` status)**: Under the 2,000-resample whole-episode bootstrap rule at the 90% confidence level (`occupancy_params.json`, lines 3 to 5 and 57), a metric is `ahead` when its 90% improvement interval over each baseline lies strictly above zero, `behind` when it lies strictly below zero against either baseline, and `tie` otherwise. Across the 7 validation metrics, the fitted parameters finish with 3 `ahead`, 4 `tie`, and 0 `behind`, with 90% FRP interval coverage at 0.8026 (122 of 152 overpasses). A model component switches to `on` only when every metric in that component is `ahead`; consequently, only pixel count (`how many pixels the hidden instrument flags`) has status `on`, while cell placement (`where the fire is (cells and probabilities)`) and radiative power (`total fire radiative power and its interval`) remain `experimental`, keeping overall `model.status` set to `experimental` (`backend/model/real_run.py`).

| Component and status | Metric | Reconstruction | `painted_modis` | `overlap_ratio` | 90% improvement CI vs `painted_modis` / `overlap_ratio` | Class |
| --- | --- | --- | --- | --- | --- | --- |
| Cells (`experimental`) | `csi_strict_375m` (higher) | 0.3037 | 0.3028 | 0.3028 | `[-0.01469, 0.02286]` / `[-0.01469, 0.02286]` | `tie` |
| Cells (`experimental`) | `csi_one_cell_tolerance` (higher) | 0.5801 | 0.4764 | 0.4764 | `[0.07340, 0.13224]` / `[0.07340, 0.13224]` | `ahead` |
| Cells (`experimental`) | `hit_rate_at_equal_area` (higher) | 0.5749 | 0.5875 | 0.5875 | `[-0.04189, 0.02619]` / `[-0.04189, 0.02619]` | `tie` |
| Cells (`experimental`) | `brier` (lower) | 0.0090 | 0.0184 | 0.0184 | `[0.00499, 0.01545]` / `[0.00499, 0.01545]` | `ahead` |
| Pixel count (`on`) | `pixel_count_error_of_sums` (lower) | 0.0550 | 0.8039 | 0.5299 | `[0.39843, 0.79759]` / `[0.03436, 0.60646]` | `ahead` |
| Total FRP (`experimental`) | `frp_error_of_sums` (lower) | 0.0691 | 0.8435 | 0.4998 | `[0.06668, 1.36452]` / `[-0.12460, 0.91672]` | `tie` |
| Total FRP (`experimental`) | `frp_median_abs_relative_error` (lower) | 0.4909 | 0.6198 | 0.6335 | `[-0.12654, 0.24436]` / `[-0.12293, 0.25992]` | `tie` |

Reproduce validation scoring of the occupancy fit with:

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.fit_real validate
```

### Terra morning pass estimation

`backend/model/terra_morning.py` tests the reverse cross-sensor problem: hiding all `MODIS` detections, running the occupancy filter on afternoon/night `VIIRS` passes alone, and predicting what Terra `MODIS` flags on its ~10:30 local morning pass. Scaling ratios for the `viirs_ratio` baseline (FRP ratio 1.0255, pixel ratio 0.1905) and Terra output scales are fitted on 113 paired passes across the 21 training fire episodes (`backend/model/fitted_values/terra_morning.json`, lines 30 to 44).

Evaluated across 6 validation fire episodes (40 Terra morning overpasses under protocol version 1, 2,000 whole-episode bootstrap resamples at 90% confidence), the model is rejected (`adopted: false`, `status: "experimental"`). Although 4 of 7 metrics are `ahead` and 2 are `tie`, `csi_one_cell_tolerance` falls `behind` both `painted_viirs` and `viirs_ratio` (0.4458 vs 0.4929, 90% CI `[-0.10259, -0.01585]`), and empirical coverage of the 90% FRP interval reaches only 0.775 (31 of 40 overpasses, below the 0.80 threshold). Because it fails validation under protocol version 1, it is not re-fitted or promoted under protocol version 2.

| Metric | Reconstruction | `painted_viirs` | `viirs_ratio` | 90% improvement CI vs `painted_viirs` / `viirs_ratio` | Class |
| --- | --- | --- | --- | --- | --- |
| `csi_strict_375m` (higher) | 0.2893 | 0.2266 | 0.2266 | `[0.00690, 0.09372]` / `[0.00690, 0.09372]` | `ahead` |
| `csi_one_cell_tolerance` (higher) | 0.4458 | 0.4929 | 0.4929 | `[-0.10259, -0.01585]` / `[-0.10259, -0.01585]` | `behind` |
| `hit_rate_at_equal_area` (higher) | 0.3329 | 0.3168 | 0.3168 | `[0.01223, 0.02464]` / `[0.01223, 0.02464]` | `ahead` |
| `brier` (lower) | 0.0085 | 0.0115 | 0.0115 | `[0.00151, 0.00424]` / `[0.00151, 0.00424]` | `ahead` |
| `pixel_count_error_of_sums` (lower) | 0.1228 | 4.7451 | 0.0945 | `[3.19384, 7.93131]` / `[-0.09820, 0.53922]` | `tie` |
| `frp_error_of_sums` (lower) | 0.1891 | 0.5216 | 0.5604 | `[0.16855, 1.03127]` / `[0.22059, 1.10933]` | `ahead` |
| `frp_median_abs_relative_error` (lower) | 0.9768 | 1.2125 | 1.2688 | `[-0.06510, 0.99747]` / `[-0.02159, 1.10671]` | `tie` |

Reproduce the Terra morning evaluation with:

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.terra_morning
```

### Next-look active tile selection

`backend/env/next_look.py`, `backend/env/policy.py`, `backend/env/agents.py`, and `backend/env/learn.py` formulate targeted high-resolution tasking as a sequential decision environment (`NextLookEnv`). A study region is partitioned into `4x4` tiles (16 tile actions plus `NO_LOOK`). Across an episode's scheduled `VIIRS` slots, an agent spends a fixed budget of 4 looks at evenly spaced decision steps, revealing hidden `VIIRS` detections inside the chosen tile while leaving the remaining 15 tiles unrevealed. Reward is the episode gain in strict 375 m CSI scored on `still_hidden` `VIIRS` slots.

Scanning 889 candidate windows across 2012 through 2025 (`backend/env/episodes.py`) under protocol version 2 yields 157 qualifying fire episodes (at least 60 `MODIS` pixels within 120 hours): 136 fit episodes across 2012 through 2025 (`plumas_ca` 60, `lytton_bc` 74, `evia_greece` 2) and 21 test episodes on the three 2021 test fires (`plumas_ca` 10, `lytton_bc` 9, `evia_greece` 2). The linear policy weights were fitted under protocol version 1 on 118 training episodes (2012 through 2023) and 15 validation episodes (2024 and 2025), alongside 22 protocol-version-1 test episodes (where episode windows counted hidden overpasses), and were not refitted under protocol version 2. All results are recorded in `backend/env/fitted/next_look.json`:

1. **Cross-tile rescaling rejected (`learn_from_looks.adopted: false`)**: A candidate belief update (`prior_cells` set to 10.0 on 30 training episodes) rescales probabilities in unvisited tiles by the ratio of detected to expected burning cells inside revealed tiles (`next_look.json`, lines 19 to 77). Across the 15 validation episodes, the oracle's paired gain difference (`on - off`) is +0.00031 with a 90% bootstrap CI of `[-0.00565, 0.00591]` (crossing zero; 9 ahead, 6 behind), while `least_sure` drops by -0.01570 (from +0.03152 to +0.01582, 90% CI `[-0.03229, -0.00098]`). Cross-tile rescaling is therefore disabled.
2. **Fitted 15-feature linear policy ties the zero-parameter uncertainty heuristic**: `backend/env/learn.py` fits a 15-feature ridge-regression linear tile scorer (`ridge = 0.01`, `round = 1`, trained on 15,104 tile samples across 472 round-0 and 472 round-1 decisions; `next_look.json`, lines 79 to 203). Comparing the learned linear policy against the zero-parameter `least_sure` heuristic (which picks the tile maximizing `sum p(1 - p)`) via 4,000 paired episode resamples shows no statistically significant gain on validation or test splits; every 90% confidence interval crosses zero.

| Split and episode count | `random` mean gain | `latest_modis` mean gain | `least_sure` mean gain | `linear` (`learned`) mean gain | `oracle` mean gain | `linear - least_sure` mean diff and 90% CI |
| --- | --- | --- | --- | --- | --- | --- |
| Validation (15 episodes, 2024 to 2025, protocol v1) | +0.0076 | +0.0307 | +0.0315 | +0.0310 | +0.0413 | -0.00054, `[-0.00303, 0.00158]` (5 ahead, 3 behind) |
| Test (22 episodes, 2021 fires, protocol v1, start CSI 0.2461) | +0.0031 (SD 0.0007) | +0.0102 | +0.0113 | +0.0106 | +0.0225 | -0.00074, `[-0.00203, 0.00052]` (3 ahead, 9 behind) |
| Test (21 episodes, 2021 fires, protocol v2, start CSI 0.2435) | +0.0028 (SD 0.0013) | +0.0163 | +0.0179 | +0.0157 | +0.0269 | -0.0022, `[-0.0074, 0.0019]` (5 ahead, 6 behind) |

Under protocol version 2 (`next_look.json`, lines 397 to 470), `least_sure` outperforms `random` by +0.0151 (90% CI `[0.0099, 0.0210]`, 20 of 21 episodes ahead), capturing 66.6% of the hindsight `oracle` gain (+0.0179 of +0.0269) without learned weights. Reproduce policy fitting and protocol-version-2 test evaluation with:

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.env.learn
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.env.report
```
