# Method and results

This document explains what Isogon computes and how it is tested: why the two instruments disagree, how the monthly calendar is harmonized, how a real fire is rebuilt from MODIS alone, the protocol of the blind test, and what the tests found. It is for readers who want to check an assumption or a result.

Every figure below is read from a tracked file, named beside it, or from `backend.model.evidence.evidence()`, which reads the same files and is served at `GET /api/evidence`. Negative and mixed results are stated as they are.

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.evidence
```

## Why the two instruments disagree

MODIS and VIIRS watch the same fires and report different things. Counting their detections side by side shows a jump in January 2012, when VIIRS begins, that is not a change in burning.

| Platform | Instrument | Nominal equator crossing, day | First day of FIRMS rows |
| --- | --- | --- | --- |
| Terra | MODIS, 1 km | 10:30, descending | 2000-11-01 |
| Aqua | MODIS, 1 km | 13:30, ascending | 2002-07-04 |
| Suomi NPP | VIIRS, 375 m | 13:25, ascending | 2012-01-20 |
| NOAA-20 | VIIRS, 375 m | 13:30, ascending | 2018-04-01 |
| NOAA-21 | VIIRS, 375 m | 13:30, ascending | 2023-03-01 |

Crossing times and their sources are in `backend/model/sensor_physics.py` and are served with every run (`observer_passes.orbit_node_rule`); the first days are `ARCHIVE_FIRST_DAY` in `backend/model/platforms.py`. Terra and Aqua have drifted from their nominal times.

Three things separate the two families, all modelled in `backend/model/sensor_physics.py`:

- **Pixel size.** A MODIS pixel is 1 km by 1 km under the satellite and grows to about 4.8 km by 2.0 km at the edge of its swath (55 degrees). A VIIRS pixel is 0.375 km by 0.362 km under the satellite; the instrument changes how it aggregates detector samples at 31.72 and 44.86 degrees, which holds the pixel to about 0.8 km by 0.8 km at the edge, 56.28 degrees (Wolfe et al., 2013; `scan_geometry_curves` in the file named below).
- **Detection limit.** The fire radiative power at which a pixel is flagged half the time is `lambda * A + mu`, with `A` the pixel area in km2 and the coefficients of Sofiev and Kouznetsov (2026, Tables 1 and 2): 4.44 and 0.52 for MODIS by day, 4.43 and 1.01 by night, 6.17 and 1.44 for VIIRS by day, 1.38 and 0.35 by night. That is 4.96 MW for MODIS by day under the satellite and 43.54 MW at the swath edge, against 2.3 MW and 5.39 MW for VIIRS, and 0.54 MW for VIIRS at night (`thresholds_50pct_mw` in `website/public/generated/fields/sensor_model_diagnostics.json`).
- **Swath.** MODIS scans 2,330 km and leaves gaps between orbits at low latitudes; VIIRS scans 3,060 km and does not.

Cloud and thick smoke block both. FIRMS lists detections only, so a pass that flagged nothing may have looked at clear ground or at cloud.

## The burning calendar

`backend/firms/real_calendar.py` builds a monthly series per region from November 2000, on one scale, with the method `overlap_ratio_v1`.

1. **Count.** Every FIRMS row inside the region's context box counts, except `type` 2 rows (static land sources) and `type` 3 rows (offshore) on the sea or within 500 m of it. Rates are hotspots per 1,000 km2 per day.
2. **Ratio.** Over the months in which Terra, Aqua and Suomi NPP all deliver data, the ratio is the sum of Suomi NPP rows over the sum of MODIS rows. Months before Aqua use a Terra-only ratio fitted the same way. A month with an outage day of one of the three platforms is left out of the fit.
3. **Harmonize.** A month's harmonized value is its MODIS rate times the ratio, so every month from 2000 on is estimated the same way and lands on the Suomi NPP scale. The interval is the 10th to 90th percentile of the per-year ratios.
4. **Check.** Each overlap year is left out in turn; the ratio is fitted on the others and that year's Suomi NPP count is predicted from its MODIS count. The same check runs with no harmonization, so the gain is visible.

NOAA-20 and NOAA-21 are counted but not fitted, so the reference pair stays the same through the whole overlap. The calendar does not place fire inside a MODIS pixel; it rescales counts.

The ratios and the result of the check depend on the rows in the local cache and are reported by the route itself: `harmonization_method.ratio_terra_aqua` and `harmonization_method.validation` of `GET /api/calendar?source=firms&region_id=<id>`. The method and the check run on invented rows in `backend/tests/test_firms_calendar.py`.

## The simulated engine

A run without `"source": "firms"` is simulated: a modelled fire on real terrain, seen by modelled passes. No FIRMS row is used and nothing in it is a measurement of a real fire. It serves regions with no cached rows and lets the cloud cover be set by hand.

- `backend/model/world_model.py` grows a fire on a 256 by 256 grid over 24 frames, coupled to the terrain's slope.
- `backend/model/sensor_physics.py` turns it into MODIS and VIIRS pixels: footprint, slant path, cloud, and the detection limit above. It is an independent implementation of the published equations.
- `backend/model/calibrator.py` fits a two-part calibrator on simulated pairs of Aqua and NOAA-20 observations (800 for the fit, 400 for the conformal step that sets the 90 percent interval; Romano, Patterson and Candes, 2019), and `backend/model/solver.py` smooths the frames forward and backward in time.

`backend/model/gates.py` defines five gates on this engine, served by `GET /api/sensor-model`:

| Gate | Kind | What it reads |
| --- | --- | --- |
| `G1_2012_CONTINUITY` | computed | The harmonized step at 2012 within 0.90 to 1.10, from a simulated run's metrics |
| `G2_BOWTIE_FLUX_CONSERVATION` | design target | Not computed |
| `G3_PAIRED_RESIDUAL` | computed | Harmonized paired error below raw paired error: 0.0894 against 0.1203 dex on 96 simulated pairs (`paired_1330_calibration` in `sensor_model_diagnostics.json`) |
| `G4_SPATIOTEMPORAL_ASSIMILATION` | design target | Not computed |
| `G5_CONFORMAL_COVERAGE` | computed | The 90 percent interval's coverage within 85 to 95 percent, from a simulated run's metrics |

The gates check the engine against its own simulation. They say nothing about a real fire: on a real run every gate reads `NOT_EVALUATED`, and the test of a real run is the blind test below. The raw step that `G1` compares with uses a weight of 1.42 for VIIRS footprints that has no published source; the gate's own text says so.

## Rebuilding a real fire from MODIS alone

A real run (`backend/model/real_run.py`) reads the cached FIRMS rows of a region and estimates, on a 375 m grid, where the fire was burning at each pass.

**The frames.** From the first MODIS overpass with a detection in the region box at or after the requested start, the run takes the first 24 passes whose swath held the whole box, of every platform, fire or no fire. They come from NASA's pass list ([data.md](data.md)), so a frame exists whether or not the pass flagged anything.

**The estimate.** `backend/model/occupancy.py` keeps three numbers per 375 m cell: the probability that it is burning, its expected fire radiative power, and the probability that it has burned through.

- Between passes, a share of the burning cells goes out and the same expected number lights up ahead of the front, within the distance the front can travel.
- At a pass, each flagged MODIS pixel says that its footprint holds a total power somewhere inside it. The filter shares that power among the footprint's cells in proportion to what it already believed. This is where the estimate can be sharper than painting the pixel flat.
- A cell outside every flagged pixel of a pass that looked is a censored observation: its probability is multiplied down by the published probability that the instrument would have flagged it, times a clear-sky share of 0.8. That share is a stated prior, not a measurement.
- The filter runs forward and backward in time and the two are combined by the age of their newest information.

The same model, run forward only, gives the belief frames a run serves every 30 minutes (`backend/model/belief.py`): each step uses only the passes up to its time.

## The blind test

The test hides one instrument, predicts it from the other, and scores the prediction against what was hidden (`backend/eval/blind_test.py`). In the direction that matters here, VIIRS is hidden and the estimate is made from MODIS alone.

### Protocol in use (version 3)

1. **The hidden rows are sealed.** `seal` in `backend/eval/holdout.py` parts the rows once, before anything is chosen. The window, the estimate, the declared cells, the intervals, the belief frames, the exports and an agent's observation are built from the visible rows only. The sealed box has one door, `open_for_scoring`, and only `backend/eval/blind_test.py` and `backend/env/next_look.py` may use it; a test reads the source tree and fails if any other module does.
2. **The schedule comes from NASA's pass list.** Predictions are published one per pass of a hidden platform whose swath held the whole box, at the minute the scan crossed the box and with the pixel size there. Both come from the swath polygon of the pass (`backend/eval/schedule.py`); no hidden row is read. A method is told the platform, the time, day or night, and the pixel size, and nothing else.
3. **Every method answers before the box is opened.** A method gives, per 375 m cell, a probability of detection and an expected power, and a total power with a 90 percent interval and a pixel count. The answers are fixed, with a digest of each field, in the report's `published` half.
4. **Then the rows are opened and every slot is scored.** The hidden rows of a pass are its truth. A pass that flagged nothing is scored as a look that flagged nothing.

Where no pass list is cached for a window, the test falls back to version 2: one slot per hidden platform and half day at its nominal time, with a typical pixel size, and only hidden overpasses that left a detection are scored. A report names its version in `protocol`. Version 1, the first protocol, let the hidden rows shape the test: the window counted hidden overpasses, and each prediction was made at the hidden overpass's own time and pixel size. `GET /api/evidence` lists what was wrong with it and the test that guards each correction (`audit_findings`).

Tests delete hidden rows, not only change their values, and require every byte outside the scorer's keys to stay the same (`backend/tests/test_model_hidden_rows.py`, `backend/tests/test_env_hidden_rows.py`).

### Baselines

The estimate is compared with two simple methods that also see MODIS only (`backend/eval/baselines.py`):

- `painted_modis`: the detections of the nearest MODIS overpass within 12 hours, painted onto the 375 m cells their pixels cover.
- `overlap_ratio`: the same cells, with the power multiplied by one fitted ratio, 0.8136 (2,685 pairs of passes at most 90 minutes apart, `backend/model/fitted_values/overlap_ratio.json`), and the pixel count by the calendar's monthly ratio fitted without the run's year and without any year that holds a test fire.

### Scores

Seven scores, pooled over the scored looks (`backend/eval/metrics.py`):

| Score | Meaning | Better |
| --- | --- | --- |
| `csi_strict_375m` | Critical success index on the 375 m cells | higher |
| `csi_one_cell_tolerance` | The same, allowing one cell of error | higher |
| `hit_rate_at_equal_area` | Hit rate when every method declares as many cells as the painted baseline | higher |
| `brier` | Brier score of the cell probabilities | lower |
| `pixel_count_error_of_sums` | Error of the predicted number of flagged pixels, summed over the looks | lower |
| `frp_error_of_sums` | Error of the predicted total power, summed over the looks | lower |
| `frp_median_abs_relative_error` | Median error of the total power per look | lower |

Beside them, the share of looks whose hidden total lies inside the stated 90 percent interval.

### Which fires are used for what

| Set | Fires | Used for |
| --- | --- | --- |
| Training | 22 episodes of 2018 to 2023 in the three context boxes; of 2021, only rows away from the test fires | Fitting the model's values |
| Validation | 7 episodes of 2024 and 2025 | Deciding what is switched on |
| Test | The three 2021 fires: Dixie (`plumas_ca`), Lytton Creek (`lytton_bc`), northern Evia (`evia_greece`) | The recorded looks below, and nothing else |

Nothing that happened in a test box in 2021 is learned from, before or after the fire's own dates, and around each fire a wider area and span is closed as well (`backend/model/training.py`). The counts are `trained_on` and `validated_on` in `backend/model/fitted_values/occupancy_params.json`.

## Results

### Validation

The model's values were fitted from their priors and validated under protocol version 3. On the 7 validation episodes, 153 scored looks (`backend/model/fitted_values/occupancy_params.json`, `parts`):

| Part | Score | Estimate | `painted_modis` | `overlap_ratio` | Class |
| --- | --- | --- | --- | --- | --- |
| Where the fire is | `csi_strict_375m` | 0.2982 | 0.3125 | 0.3125 | tie |
| Where the fire is | `csi_one_cell_tolerance` | 0.5782 | 0.4943 | 0.4943 | ahead |
| Where the fire is | `hit_rate_at_equal_area` | 0.5669 | 0.5793 | 0.5793 | tie |
| Where the fire is | `brier` | 0.0090 | 0.0172 | 0.0172 | ahead |
| How many pixels | `pixel_count_error_of_sums` | 0.0975 | 0.8172 | 0.5134 | tie |
| Total power | `frp_error_of_sums` | 0.0569 | 0.4881 | 0.2107 | tie |
| Total power | `frp_median_abs_relative_error` | 0.5743 | 0.6003 | 0.6193 | tie |

The rule: the validation fires are resampled whole 2,000 times. A score is ahead when the 90 percent interval of its improvement over each baseline lies above zero, behind when it lies below zero against either, and a tie otherwise. The fitted values are used when no score is behind and at least one is ahead. A part of the estimate is switched on only when every score of the part is ahead.

- **The fitted values are in use:** ahead on 2 of 7 scores, tied on 5, behind on none.
- **No part is switched on.** All three parts (where the fire is, how many pixels, total power) are `experimental`, and so is the model's status in every run.
- **The stated 90 percent interval for total power held on 148 of 153 looks.** It starts at zero: 29 of the 400 training looks flagged nothing, cloud is not known, and an interval that could not hold an empty pass would claim more than the record supports.
- **6 of the 153 validation looks flagged nothing** and were scored as such.
- The validation episodes come from two of the three regions; northern Evia's has none.
- A rule written before the first fit, every cell score strictly above both baselines with no allowance for noise, was not met. It is kept in the file as `first_rule_outcome` so that the change of rule is visible.

### The three recorded looks at the test fires

The three 2021 fires have been scored as a test three times. Each look is on record with the report it came from (`backend/model/fitted_values/test_fire_looks.json`).

| Look | Protocol | What was scored |
| --- | --- | --- |
| 1 | version 1 | The first fitted values, on windows of 24 overpasses that counted the hidden ones |
| 2 | version 2 | The same values, not refitted, on windows chosen from MODIS alone, predictions published on the nominal schedule |
| 3 | version 3 | Values refitted from the priors and frozen before the look, on the windows of look 2, every pass of the pass list a scored look |

Scores on which the estimate is ahead of both baselines, of 7:

| Fire | Look 1 | Look 2 | Look 3 |
| --- | --- | --- | --- |
| Dixie | 6 | 6 | 6 |
| Lytton Creek | 7 | 7 | 7 |
| Northern Evia | 4 | 3 | 3 |

Look 3 in detail (`test_fires.fires[].new` of `evidence()`):

| Fire | Scored looks | Hidden pixels | Strict CSI: estimate, baselines | CSI within one cell: estimate, baselines | Interval for total power held |
| --- | --- | --- | --- | --- | --- |
| Dixie | 13 | 7,144 | 0.3194, 0.2593 | 0.6167, 0.4036 | 13 of 13 |
| Lytton Creek | 15 | 938 | 0.1918, 0.1278 | 0.4845, 0.2419 | 15 of 15 |
| Northern Evia | 16 | 5,940 | 0.2772, 0.2873 | 0.5232, 0.4276 | 14 of 16 |

Both baselines paint the same cells, so their cell scores are equal.

- On Dixie the one score not ahead is the total power summed over the looks.
- Northern Evia is the weakest: ahead on the one-cell CSI, the Brier score and the median power error, and behind the painted baseline on strict CSI. One pass there held only part of the box and was not scored (133 hidden pixels).
- On Lytton Creek, 3 of the 15 looks flagged nothing in the box.

**Look 3 is the final look. The test fires are not scored again.** It was taken once, with the protocol and the fitted values frozen before it. A fourth look would turn the test set into a tuning set, so the record is closed: no entry is to be added to it.

The record hides nothing else: `test_fires.also_scored` lists every other time rows of these fires were scored (untuned priors, one platform hidden at a time, the other direction, runs from each default start), none of which is the test. A run of one of these fires with VIIRS hidden, asked for from the page, computes the score of its own window each time; that is a payload, not a look.

### The other direction: Terra's morning pass

`backend/model/terra_morning.py` hides MODIS instead and estimates what Terra flags on its morning pass from VIIRS alone. It is experimental and not in use (`backend/model/fitted_values/terra_morning.json`, `adopted: false`).

On 6 validation episodes, 40 Terra overpasses, it is ahead of both baselines on 4 of 7 scores, tied on 2 and behind on 1: the one-cell CSI, 0.4458 against 0.4929. Its 90 percent interval held for 31 of 40 overpasses (0.775). These figures were measured under protocol version 1 and not again, so they are not clean, and the direction stays experimental.

## The next-look environment

`backend/env/next_look.py` turns a real fire into a decision problem. The region box is split into tiles, 4 by 4 unless asked otherwise. MODIS is visible and VIIRS is hidden. At each scheduled VIIRS look an agent may spend one of a budget of looks, 4 unless asked otherwise, on one tile; the hidden detections of that look inside that tile are revealed and the model takes them in. The reward of a look is the gain in the strict CSI of the estimate, measured on the detections still hidden.

- **Episodes** are runs of 12 MODIS overpasses with a detection in a tile, chosen from MODIS rows alone, with at least 60 MODIS pixels in at most 120 hours (`backend/env/episodes.py`). The catalogue has 157: 136 for fitting and 21 test episodes, which are windows of the three 2021 fires (`catalogue` under `test_protocol_2` in `backend/env/fitted/next_look.json`).
- **Looks** are the nominal half-day slots of the hidden platforms, taken from the platform and the calendar. The environment plays under protocol version 2: hidden rows sealed, looks on the nominal schedule. It can also take its looks from the pass list, but no tracked result was made that way.
- **Reference players.** `random` picks a tile at random; `latest_modis` the tile with the most recent MODIS power; `least_sure` the tile where the model is least sure, the sum of `p (1 - p)` over its cells; `learned` is a linear score of 15 features per tile; `oracle` reads the hidden rows and takes the best tile at each look, a ceiling and not a player. Every player spends its budget on the same looks, spread evenly; only the tile differs.

### Reference table

Mean over the 21 test episodes, 4 by 4 tiles, 4 looks (`test_protocol_2` in `backend/env/fitted/next_look.json`). The mean starting score is 0.2386.

| Player | Mean gain | Mean final score | Share of the oracle's gain |
| --- | --- | --- | --- |
| `random` (10 seeds) | +0.0027 | 0.2413 | 0.101 |
| `latest_modis` | +0.0166 | 0.2486 | 0.616 |
| `least_sure` | +0.0187 | 0.2522 | 0.693 |
| `learned` | +0.0182 | 0.2508 | 0.674 |
| `oracle` | +0.0270 | 0.2626 | 1.000 |

- **A simple rule beats chance.** `least_sure` gains 0.0160 more than `random` (90 percent interval of the difference, episodes resampled: 0.0111 to 0.0212; ahead on 20 of 21 episodes).
- **The learned policy does not beat the simple rule.** `learned` minus `least_sure` is -0.0005 (interval -0.0025 to +0.0015; ahead on 4 episodes, behind on 7). It does not differ by more than the noise, and it is not better.
- The oracle gains 0.0088 more than the learned policy (interval 0.0055 to 0.0127).

**Which values the table was measured with.** The table was measured with the reconstruction values in use, the ones refitted under protocol version 3, which are also the values a served round plays with, so a round and the table agree. The learned policy's weights were fitted earlier, under protocol version 1 and with the earlier reconstruction values, on 118 training episodes of 2012 to 2023 and 15 validation episodes of 2024 and 2025; they were not refitted. The same file keeps beside this table the two earlier measurements of it (with the earlier reconstruction values, and before a correction to which rows a look owns), and the first table under protocol version 1 (`test`: 22 episodes, `least_sure` +0.0113, `learned` +0.0106, `oracle` +0.0225). In every one of them `least_sure` gains more than `random`, and the learned policy does not beat `least_sure`.

**Learning from looks is off.** A variant in which a look also rescales the probabilities of the tiles not looked at was tried and not adopted (`learn_from_looks.adopted: false`): on 15 validation episodes the oracle's gain changed by +0.0003 (interval -0.0056 to +0.0059) and `least_sure` lost 0.0157.

**Other settings** of tiles and budget are in `other_settings` of the same block. `least_sure` stays ahead of `random` in each; with 3 by 3 tiles `latest_modis` is level with it (0.0229 against 0.0226).

## Limits

- **Cloud is not known.** FIRMS has no cloud mask and none is fetched. A pass that flagged nothing may have been cloudy; the model stands a fixed clear-sky share of 0.8 in for it, and the stated interval for total power starts at zero for the same reason.
- **Partial passes are not scored.** A pass whose swath held only part of the box is neither a frame nor a scored look.
- **Small validation set.** Seven episodes from two regions decide what is switched on, and they switch nothing on.
- **Three regions.** Real runs exist only where FIRMS rows are cached: three boxes in California, British Columbia and Greece. What holds there may not hold in other fuels or latitudes.
- **Truth is another instrument.** The hidden VIIRS detections are what VIIRS reported, with its own detection limit and misses, not the fire itself.
- **The environment's looks are nominal slots.** A real pass is up to about 90 minutes from its slot, sometimes comes twice, and its pixel size is not known in advance. On that schedule an empty look is unknown and teaches the model nothing.
- **The calendar rescales counts.** It does not correct for cloud, view angle or orbit drift, and its interval is the spread of yearly ratios, not a calibrated probability.
- **The simulated engine tests itself.** Its metrics and gates compare the estimate with the simulation's own fire.

## Running the checks

```bash
# The evidence document, from tracked files only
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.evidence

# The blind test on invented rows (no cache needed)
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.eval.blind_test

# Every test
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m unittest discover -s backend/tests
```

The fitting tools (`backend.model.fit_real`, `backend.model.terra_morning`, `backend.env.learn`) need the full local cache and rewrite the tracked files they produce. Run them only to make a new set of values, never to look at the three test fires again.
