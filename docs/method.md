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

**The test is closed.** The looks at the three fires are on record and those fires are not scored again. The rule is one function, `closed_for(box, start_s, end_s)` in `backend/model/training.py` (the round and run routes find it as `backend.env.episodes.closed_for`): a window is closed when its box meets the context box of a region with a test fire and the window holds a moment of a year of that fire, whether or not it holds the fire itself, so a period across New Year is closed on either side. On a closed window a run with a satellite held out is refused (`ClosedWindow`), and a run with every satellite shown still gives its estimate, frames and terrain and computes no score: no blind test, no baseline, no figure made from VIIRS rows. It says so in `not_scored`, with the address of the recorded looks. Three more places ask the same rule, so that a caller that is not a route is stopped as well: the next-look environment refuses to be built on a closed window, before its hidden rows are opened; a fit refuses an episode of a closed window and is never handed a year of a test fire, so a full fit run now would train on the 17 episodes of 2018, 2019, 2020, 2022 and 2023 (the values in use were fitted earlier, on 22 that also held 2021 windows away from the test fires); and the list of start days no longer opens the hidden rows at all, on any window, where it used to count the hidden satellite's pixels for a label.

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

- **The fitted values are in use:** ahead on 2 of 7 scores, tied on 5, behind on none, judged with an interval as the rule says.
- **No part is switched on.** All three parts (where the fire is, how many pixels, total power) are `experimental`, and so is the model's status in every run.
- **The stated 90 percent interval for total power held on 143 of 153 looks (0.935).** It is the estimate times two multiples taken from the training looks. It starts at zero: 20 of 322 training looks flagged nothing, cloud is not known, and an interval that could not hold an empty pass would claim more than the record supports. An interval that starts at zero cuts nothing off below, so its upper end is the 90th percentile of the training ratios, 2.18 times the estimate. Until it was set again the upper end was the 95th percentile, 2.62 times, which held 148 of 153 looks (0.967) while stating 90 percent. The ratios were taken again on the 17 training episodes of 2018, 2019, 2020, 2022 and 2023, with every other value unchanged; the training episodes of 2021 were left out, because no window of that year is scored again. No estimate and no score depends on the interval, and none moved. The three recorded looks at the test fires state the interval of their time and keep the figures they were taken with.
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

Scores on which the estimate is ahead of both baselines, of 7. This is a plain comparison: a score counts when it is strictly better than both baselines' on that fire, with no allowance for noise, because one fire cannot be resampled. It is not the kind of count the validation makes, and the two are not to be set side by side (`count_kinds` in the evidence answer; every count there says which kind it is):

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

Both baselines paint the same cells, so their cell scores are equal. The last column is the interval the look was taken with, zero to 2.62 times the estimate, which held more than the 90 percent it stated; the interval in use is narrower (see the validation above) and these fires are not scored with it.

- On Dixie the one score not ahead is the total power summed over the looks.
- Northern Evia is the weakest: ahead on the one-cell CSI, the Brier score and the median power error, and behind the painted baseline on strict CSI. One pass there held only part of the box and was not scored (133 hidden pixels).
- On Lytton Creek, 3 of the 15 looks flagged nothing in the box.

**Look 3 is the final look. The test fires are not scored again.** It was taken once, with the protocol and the fitted values frozen before it. A fourth look would turn the test set into a tuning set, so the record is closed: no entry is to be added to it.

The next test of the estimate is on fires chosen by rule across the world. Its protocol, `fresh_world_v1` in `backend/model/fresh_test.py`, was committed before any row was read for it, and a test pins its digest. Places are squares of 2.5 degrees, each cut into 25 tiles as a region's context box is; none meets the context box of one of the three first regions. Places are split by blocks of 10 degrees into fitting, validation, test A and test B from their coordinates alone, and a place of validation or of a test that is next to a place of another role is left out. So is a place of validation or of a test that meets the context box of a region the page offers, so that the page cannot show a row of a test before its look. Episodes are found by the rule in use from MODIS rows alone, in 2018 to 2022, and taken up to a quota per role and continent, round four zones of latitude that stand in for fuel. Test A is looked at once with the fitted values in use, frozen by their sha256; then the values are refitted on the fitting set and validated, a rule written in the protocol decides which values test B is looked at with, and test B is looked at once. No score of that test exists yet.

The record hides nothing else: `test_fires.also_scored` lists every other time rows of these fires were scored (untuned priors, one platform hidden at a time, the other direction, runs from each default start), none of which is the test. A run of one of these fires with VIIRS hidden, asked for from the page, computes the score of its own window each time; that is a payload, not a look.

### The other direction: Terra's morning pass

`backend/model/terra_morning.py` hides MODIS instead and estimates what Terra flags on its morning pass from VIIRS alone. It is experimental and not in use (`backend/model/fitted_values/terra_morning.json`, `adopted: false`).

It is measured under the protocol in use, with the instruments exchanged. Episodes are runs of 12 VIIRS overpasses chosen from VIIRS rows alone. The looks scored are Terra's day passes in the pass list whose swath held the whole box, whether or not they flagged anything. Its two scales, its interval and the second baseline's ratios are fitted on 22 training episodes of 2018, 2019, 2020, 2022 and 2023; no window of 2021 is used.

On 9 validation episodes of 2024 and 2025, 55 Terra day passes of which 19 flagged nothing in the box, it is ahead of both baselines on 2 of 7 scores, tied on 4 and behind on 1, judged with an interval. Ahead: strict CSI, 0.2878 against 0.2559, and the Brier score. Behind: the one-cell CSI, 0.4594 against 0.5389. An estimate with a score behind is not adopted, so the direction stays out of use. Its stated 90 percent interval for total power is one-sided, from zero to 2.06 times the estimate, because 41 of 132 training looks flagged nothing; it held for 49 of 55 validation looks (0.891).

An earlier measurement under protocol version 1 said 4 of 7 ahead, 2 tied and 1 behind on 40 overpasses. It was not blind in two respects: each prediction was made at the hidden overpass's own time and pixel size, and the episodes were chosen counting both instruments. It is kept in the file as `measured_before`. The blind measurement is the weaker of the two, and it is the one that counts.

## The next-look environment

`backend/env/next_look.py` turns a real fire into a decision problem. The region box is split into tiles, 4 by 4 unless asked otherwise. MODIS is visible and VIIRS is hidden. At each scheduled VIIRS look an agent may spend one of a budget of looks, 4 unless asked otherwise, on one tile; the hidden detections of that look inside that tile are revealed and the model takes them in.

- **Episodes** are runs of 12 MODIS overpasses with a detection in a tile, chosen from MODIS rows alone, with at least 60 MODIS pixels in at most 120 hours (`backend/env/episodes.py`). The catalogue has 157. The 21 test episodes are windows of the three 2021 fires. That test is closed, so they are not played again, and neither are the 28 other windows of 2021 in the same three regions, although those lie outside the fires' own boxes and dates (`may_be_played`). Of the 108 episodes that may be played, the 95 of 2012 to 2023 train and the 13 of 2024 and 2025 validate (`fit_split`).
- **Looks** are the real passes: one look per pass of a hidden platform whose swath held the whole box, from NASA's pass list, at the minute its scan crossed the box and with its pixel size there. A pass that flagged nothing is a look and is scored like any other. This is the blind test's protocol, version 3. Where no pass list is cached for a window the environment falls back to the nominal half-day slots of each platform (version 2) and a round says so (`describe()["looks"]`, `protocol`).
- **Score.** The strict CSI at 375 m of the estimate against every real hidden detection of the episode, on every cell of the box and at every scored look. It is one fixed set: the same before the first look and after the last, whatever was looked at.
- **Reward.** The score after a look minus the score before it. So the rewards of a round add up to its final score minus its starting score, and a round cannot be paid while its score falls. Adding up is arithmetic on one score: it holds to rounding error, and the tests ask for twelve decimal places, not for equal bits. A look is paid for two things at once: the detections it hands over, which the estimate then holds, and what they teach the estimate about the rest. `taught_elsewhere` reports the second part alone, as the change in score on the cells outside every tile looked at; it is a diagnostic, not the reward.
- **An empty look.** A look that hands over no hidden pixel is unknown, on either schedule: it teaches the model nothing and earns exactly nothing. On the nominal schedule nothing says the platform flew or that its swath held the box. On the pass list the pass did cover the tile, but FIRMS has no cloud mask, so a tile with no detection may have been cloudy. The two properties of the reward meet here: rewards that add up pay every change of the estimate, so a look that is to earn nothing must not change the estimate. What is given up is a look spent to confirm that a tile is clear.

**Reference players.** A player chooses a tile, and may also choose when to look. A player that does not say when spends its budget on the same looks as every other such player, spread evenly over the episode, so those players differ only in the tile. They are of three kinds (`backend/env/agents.py`).

- Players that read nothing about the fire: `random`; a constant tile, always the same one; `centre`, the tiles around the middle of the box in turn. Episodes are framed around a fire, so a fixed tile holds fire more often than chance. What these players gain is the geometry of the framing, and a player shows skill only by what it gains beyond them. Two constant tiles are named in a table: the one that gains most on the training episodes, which anyone could have fielded, and the one that gains most on the table's own episodes, which is hindsight.
- Players that read the observation and nothing else: `latest_modis`, the tile with the most recent MODIS power; `least_sure`, the tile where the model is least sure, the sum of `p (1 - p)` over its cells; `expected_new`, the tile where the model expects the most hidden detections that its own map does not already declare, which is the reward's own logic used as a rule; `learned`, the fitted player described below.
- `oracle` sees the answer: it reads the hidden rows and takes the best tile at each of the evenly spread looks. It chooses where, not when, and it is greedy. So it is not an upper bound: it can be beaten over a whole round, and a player that also chooses when can gain more than it. No player is measured as a share of it.

**Choosing when.** Looks taken close together repeat each other. On the 95 training episodes a player that follows a score freely, looking whenever the model is most unsure, bunches its looks and gains 0.0045 less than the evenly spread looks (90 percent interval -0.0081 to -0.0009). So a player that chooses when takes one look in each of as many equal stretches of the episode as it has looks (`StretchClock`): as soon as its score for the look is in the top share of what the stretch has shown so far, and at the stretch's last look if not before. The evenly spread looks are the last look of each stretch. Three such players use a fixed rule on the least sure tile, with nothing fitted: `least_sure_at_night` spreads its looks over the night passes; `least_sure_when_unsure` takes the look where the model is most unsure; `least_sure_when_sharp` scores a pass by its pixel size, smaller being better, so a pass that crosses nearly overhead scores highest. A player learns a pass's pixel size only when the pass comes, so this rule takes the first pass of a stretch that is sharp against the passes seen so far, which is not always the sharpest pass of the stretch. On the training episodes only the last of these gains on the evenly spread looks: +0.0046 (interval +0.0020 to +0.0074).

**The learned player** (`backend/env/policy.py`, fitted by `backend/env/learn.py`) is fitted on the 95 training episodes, on the pass list and under the reward in use. It has two linear scores, and every number in both can be read per tile and per look (`play_steps` returns them).

- *Where.* A ridge regression of each tile's true reward, as a share of the best tile's at that decision, on 15 features of the tile read from the observation. The decisions come from two rounds of play on the training episodes, a mixed behaviour and then the fitted policy's own choices: 760 decisions, 730 of them with a tile that gains anything.
- *When.* A linear score of the look, used through the stretch rule above. Of 13 features of a look, only those that help on fires the score was not fitted on enter it.

Every choice in the fit is made with fires held out, in five folds by region and year: both ridge strengths, which look features enter, and whether the look score is used at all. The validation episodes choose nothing; they are played once, after the policy is fixed.

What the fit found is small, and it is said as it is. On held-out training fires the learned tile score pays 0.870 of the best tile, and `least_sure` on the same decisions pays 0.870. Of the 13 look features the selection kept one, the pixel size of the pass; the next best raised the held-out figure by less than one percent and was left out. So the learned player is in effect the least sure tile at a sharp pass of each stretch, the rule `least_sure_when_sharp`. Played on training fires with weights fitted without their fold, it gains 0.0042 more with its look score than without it (90 percent interval 0.0016 to 0.0069), which is why the look score is in use, and it does not differ from the one-line rule `least_sure_when_sharp` (-0.0002, interval -0.0024 to +0.0021). A look score on all 13 features at once was fitted first and gained less (+0.0023, interval -0.0006 to +0.0051); it is on record in the tracked file and not used. The first learned policy, fitted under the first reward on nominal looks, is kept in the same file as `policy_first`, beside the tables that were played with it.

### The reward was corrected

The first reward scored each look on the detections still hidden after it, so that a look was never paid for the answer it handed over. Three things were wrong with it. Each was checked on the 13 validation episodes before the correction and again after it (4 by 4 tiles, 4 looks unless said).

| What | Before | After |
| --- | --- | --- |
| The rewards of a round against the change in its score, `least_sure`, nominal looks | Paid +0.0387, score moved +0.0318 | Both +0.0630 |
| A player built to use that gap: the first two and the last two looks, on the tile the model expects to burn most | Paid +0.0137 while its score fell by 0.0027 | Both +0.0325 |
| The largest gap in any round played | 0.0911 | 0.0000 |
| Empty looks paid other than zero, `random` on the pass list | 422 of 427, up to 0.0080 each | 0 of 427 |
| A player that looks only at night and only where MODIS has seen nothing, pass list | 49 of its 52 empty looks paid, +0.0004 a round | 0 paid, 0 a round |

The scoring set of the first reward shrank with every look, which is why its rewards did not add up. On the pass list an empty look was taken as a pass that saw clear ground and moved the score. On these episodes the mean pay of an empty look was near zero and of either sign.

The correction changes what is paid for. Under the reward in use a tile's reward follows the hidden detections it holds: over 380 decisions of the training episodes on the pass list, the rank correlation between the two inside a decision has a median of 0.997, and the tile with the most hidden detections pays 93 percent of what the best tile pays. The game is to find where the sharper instrument sees fire that the estimate does not yet hold.

### Reference table under the reward in use

Mean over the 13 validation episodes, 4 by 4 tiles, 4 looks, on the pass list (`validation_reference` in `backend/env/fitted/next_look.json`; `python3 -m backend.env.report` measures it). The mean starting score is 0.2520; an episode has 17 to 41 looks, 27 at the median. The learned player was fixed before the table was measured, and the table was measured once.

| Player | Reads | Looks at | Mean gain | Mean final score | Spread over episodes (sd) | Least and most | Episodes with a gain | Gain on cells never shown |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `random` (10 seeds) | nothing | evenly spread | +0.0060 | 0.2580 | 0.0034 | +0.0018 to +0.0119 | 13 of 13 | +0.0032 |
| constant tile, best on the training episodes (tile 5) | nothing | evenly spread | +0.0000 | 0.2520 | 0.0000 | +0.0000 to +0.0000 | 0 of 13 | +0.0000 |
| constant tile, best in hindsight (tile 14) | nothing | evenly spread | +0.0168 | 0.2688 | 0.0317 | +0.0000 to +0.0980 | 6 of 13 | +0.0111 |
| `centre` | nothing | evenly spread | +0.0048 | 0.2568 | 0.0056 | +0.0000 to +0.0177 | 10 of 13 | +0.0030 |
| `latest_modis` | the observation | evenly spread | +0.0455 | 0.2975 | 0.0262 | +0.0091 to +0.0980 | 13 of 13 | +0.0269 |
| `least_sure` | the observation | evenly spread | +0.0477 | 0.2997 | 0.0262 | +0.0091 to +0.0980 | 13 of 13 | +0.0281 |
| `expected_new` | the observation | evenly spread | +0.0471 | 0.2991 | 0.0273 | +0.0112 to +0.0980 | 13 of 13 | +0.0271 |
| `least_sure_at_night` | the observation | night passes, evenly | +0.0491 | 0.3011 | 0.0285 | +0.0067 to +0.0896 | 13 of 13 | +0.0295 |
| `least_sure_when_unsure` | the observation | a look of each stretch where the model is unsure against the looks seen so far | +0.0549 | 0.3069 | 0.0285 | +0.0166 to +0.1116 | 13 of 13 | +0.0345 |
| `least_sure_when_sharp` | the observation | a pass of each stretch that is sharp against the passes seen so far | +0.0512 | 0.3032 | 0.0229 | +0.0203 to +0.0879 | 13 of 13 | +0.0311 |
| `learned`, its tile choice alone | the observation | evenly spread | +0.0480 | 0.3000 | 0.0278 | +0.0102 to +0.0980 | 13 of 13 | +0.0285 |
| `learned` | the observation | its look score, one look per stretch | +0.0502 | 0.3022 | 0.0231 | +0.0172 to +0.0879 | 13 of 13 | +0.0302 |
| `oracle`, which sees the answer | the hidden rows | evenly spread | +0.0568 | 0.3088 | 0.0236 | +0.0198 to +0.0980 | 13 of 13 | +0.0348 |

A mean gain is the mean final score minus the mean starting score. Differences are paired by episode, with a 90 percent interval from resampling the episodes. The oracle sees the answer and chooses where at the evenly spread looks; it does not choose when. A player that also chooses when can gain more than it, and `learned` does on 4 of the 13 episodes, so no player is given as a share of it.

- **The learned player does not beat the simple rule.** `learned` minus `least_sure` is +0.0025 (interval -0.0072 to +0.0125; ahead on 5, behind on 8): no difference beyond the noise. Its tile choice alone, on the evenly spread looks, is `least_sure` to the third decimal: +0.0003 (interval -0.0025 to +0.0030; ahead on 3, behind on 2). What its look score adds on these episodes is +0.0022 (interval -0.0076 to +0.0121; ahead on 5, behind on 8). On training fires it was not fitted on, the look score gained +0.0042 with an interval above zero; 13 validation episodes neither confirm that nor refute it. Against the one-line rule it amounts to, `least_sure_when_sharp`, it is -0.0010 (interval -0.0034 to +0.0013; ahead on 1, behind on 2), with the same gain on 10 of the 13 episodes. It gains more than `random` (+0.0441 (interval +0.0346 to +0.0536; ahead on 13, behind on 0)) and more than the best constant tile in hindsight (+0.0334 (interval +0.0227 to +0.0441; ahead on 12, behind on 1)), and does not differ from `latest_modis` (+0.0047 (interval -0.0051 to +0.0147; ahead on 6, behind on 7)).
- **A simple rule beats chance, and beats geometry.** `least_sure` gains 0.0417 more than `random` (interval 0.0312 to 0.0534; ahead on 13 of 13 episodes) and 0.0309 more than the best constant tile in hindsight (0.0187 to 0.0437; ahead on 10, behind on 2).
- **Geometry does not carry from one set of fires to another.** The constant tile that gains most on the 95 training episodes is tile 5 (+0.0142 there). On the validation episodes it gains exactly nothing: no validation fire shows a hidden detection in that tile on the looks spent. The best constant tile on the validation episodes, found in hindsight, is tile 14: +0.0168, which is 2.8 times `random`.
- **Choosing when is not settled by these episodes.** None of the three fixed rules for when differs from the evenly spread looks by more than the noise: a sharp pass +0.0034 (interval -0.0065 to +0.0133; ahead on 7, behind on 6), an unsure look +0.0072 (interval -0.0024 to +0.0171; ahead on 6, behind on 7), night passes +0.0014 (interval -0.0069 to +0.0092; ahead on 7, behind on 6). The rule on the model's uncertainty has the largest mean here and had none on the 95 training episodes (0.0000 to four decimals); the rule on the pixel size had +0.0046 there, with an interval above zero. Nothing is chosen from this table.
- **Which tile to look at is mostly settled by the simple rule.** On the same evenly spread looks, the player that sees the answer gains 0.0090 more than `least_sure` (0.0053 to 0.0132; ahead on 11 of 13). `expected_new` minus `least_sure` is -0.0006 (interval -0.0027 to +0.0014; ahead on 4, behind on 3), and `least_sure` minus `latest_modis` is +0.0022 (interval -0.0003 to +0.0049; ahead on 4, behind on 3).
- **Most of a gain is not the looked-at tile itself.** Of `least_sure`'s +0.0477, +0.0281 is on cells it was never shown: the same tile at other passes, and the other tiles.

With other tile splits and budgets (`other_settings`) `learned` minus `least_sure` has a positive mean and an interval through zero every time: 3 by 3 tiles and 4 looks +0.0061 (-0.0045 to +0.0166); 6 by 6 tiles and 4 looks +0.0032 (-0.0026 to +0.0086); 4 by 4 tiles and 2 looks +0.0062 (-0.0024 to +0.0145); 4 by 4 tiles and 8 looks +0.0044 (-0.0013 to +0.0104). They are the same 13 episodes, so they are not five pieces of evidence.

The same players on nominal looks, measured before the pass list became the default and with the first policy as the learned player, are kept in the file as `validation_reference_on_nominal_looks`: a mean starting score of 0.2585, `random` +0.0072, `least_sure` +0.0630, `oracle` +0.0688.

These are validation episodes: fires of 2024 and 2025 in two of the three regions. They fitted nothing and chose nothing about the learned player in use. But the reconstruction's values were validated on fires of the same years, the first policy's settings were chosen on them, and the reward's correction was checked on them. They are not fires the project has never seen.

### Tables on record, under the first reward

The tables below were measured on the 21 test episodes under the first reward, before the correction. A mean gain in them is a sum of rewards that did not add up, not a final score minus a starting score; the final scores are scores on the detections still hidden at the end. They are kept as measured and are not measured again, because the test episodes are closed (`rewards` in `backend/env/fitted/next_look.json`).

Mean over the 21 test episodes, 4 by 4 tiles, 4 looks (`test_protocol_2`). The mean starting score is 0.2386.

| Player | Mean gain | Mean final score |
| --- | --- | --- |
| `random` (10 seeds) | +0.0027 | 0.2413 |
| `latest_modis` | +0.0166 | 0.2486 |
| `least_sure` | +0.0187 | 0.2522 |
| `learned` | +0.0182 | 0.2508 |
| `oracle` | +0.0270 | 0.2626 |

- Under the first reward `least_sure` was paid 0.0160 more than `random` (90 percent interval of the difference, episodes resampled: 0.0111 to 0.0212; ahead on 20 of 21 episodes).
- The learned policy did not beat the simple rule: `learned` minus `least_sure` is -0.0005 (interval -0.0025 to +0.0015; ahead on 4 episodes, behind on 7).
- The oracle was paid 0.0088 more than the learned policy (interval 0.0055 to 0.0127).

**Which values that table was measured with.** The reconstruction values in use, the ones refitted under protocol version 3. The learned policy's weights were fitted earlier, under protocol version 1, with the earlier reconstruction values and with the first reward as their target, on 118 training episodes of 2012 to 2023 and 15 validation episodes of 2024 and 2025. Those are the weights the tables on record were played with (`policy_first` in the file); the learned player in use was fitted later and has never played a test episode. The same file keeps beside this table the two earlier measurements of it (with the earlier reconstruction values, and before a correction to which rows a look owns), and the first table under protocol version 1 (`test`: 22 episodes, `least_sure` +0.0113, `learned` +0.0106, `oracle` +0.0225). Before that correction a look that revealed nothing could also be paid; each table says so in `empty_look`.

**Learning from looks is off.** A variant in which a look also rescales the probabilities of the tiles not looked at was tried under the first reward and not adopted (`learn_from_looks.adopted: false`): on 15 validation episodes the oracle's gain changed by +0.0003 (interval -0.0056 to +0.0059) and `least_sure` lost 0.0157. It has not been tried again under the reward in use, and a round cannot be built with it for now (`NextLookEnv` refuses `learn_from_looks=True` and says why): as written it counts an empty look as one that saw its tile, so an empty look would change what a later look is paid.

**Other settings** of tiles and budget are in `other_settings` of each block.

## Limits

- **Cloud is not known.** FIRMS has no cloud mask and none is fetched. A pass that flagged nothing may have been cloudy; the model stands a fixed clear-sky share of 0.8 in for it, and the stated interval for total power starts at zero for the same reason.
- **Partial passes are not scored.** A pass whose swath held only part of the box is neither a frame nor a scored look.
- **Small validation set.** Seven episodes from two regions decide what is switched on, and they switch nothing on.
- **Three regions.** Real runs exist only where FIRMS rows are cached: three boxes in California, British Columbia and Greece. What holds there may not hold in other fuels or latitudes.
- **Truth is another instrument.** The hidden VIIRS detections are what VIIRS reported, with its own detection limit and misses, not the fire itself.
- **The environment's looks are the passes of a list that is cached per window.** Where no pass list is cached the looks fall back to nominal half-day slots: a real pass is up to about 90 minutes from its slot, sometimes comes twice, and its pixel size is not known in advance. A round says which it played.- **An empty look teaches nothing.** With no cloud mask a tile that hands over no detection cannot be told from a cloudy one, so the environment takes it as unknown and pays nothing for it. A tile that hands over even one detection is taken as looked at in full.
- **The environment's reward is measured on validation fires only.** Its tables under the reward in use are from 13 episodes of 2024 and 2025 in two regions. Thirteen episodes separate a simple rule from chance and from geometry; they do not separate the learned player from the simple rule, or the rules for when to look from each other. The tables on the three 2021 fires were measured under the first reward and are not measured again, so the learned player in use has no test figure and will not get one from those fires.
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

```bash
# The environment's reference table on the validation episodes (about half an hour; needs the full local cache)
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.env.report table.json
```

The fitting tools (`backend.model.fit_real`, `backend.model.terra_morning`) need the full local cache and rewrite the tracked files they produce; `backend.env.learn` and `backend.env.report` write to the path they are given and play only the episodes that may be played. Run the fitting tools only to make a new set of values, never to look at the three test fires again.
