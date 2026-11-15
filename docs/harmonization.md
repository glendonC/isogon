# Harmonization of MODIS and VIIRS fire detections

This document explains how the Record puts the coarse satellites (MODIS on Terra and Aqua, 1 km at nadir, from
2000) and the sharp ones (VIIRS on Suomi NPP and NOAA-20, 375 m, from 2012) on one scale, which other methods were
tried, how each was measured, and what the stated interval means. Code: `backend/model/harmonize.py` (methods,
interval, the Record's call), `harmonize_cells.py` (counts per cell from the country files or the fire cube),
`harmonize_eval.py` (the measurement), `harmonize_maps.py` (world maps), `harmonize_places.py` (regions and bands).

## The method in use

The Record predicts what Suomi NPP would have counted in a place and month from what MODIS counted there:

- harmonized = MODIS rows (Terra plus Aqua) x the place's ratio;
- the ratio = the place's Suomi NPP rows over its MODIS rows, summed over its clean overlap months;
- a clean overlap month is a month from February 2012 in which Suomi NPP, Terra and Aqua each deliver data with no
  outage day (the calendar's outage rule, `docs/data.md`). January 2012 is left out because Suomi NPP rows begin
  on the 20th;
- before Aqua (to June 2002) Terra alone is used, with its own ratio fitted the same way.

The method's id is `overlap_ratio_v1`. Its fitted ratio for each place is served with the Record.

## The interval

The Record states an 80 percent interval around every month and every year. It is built from held-out errors:

1. Each overlap year from 2012 to 2025 is left out in turn, over every place of the fit at once. The ratio of each
   place is fitted on the other years and predicts the year left out.
2. The error of a prediction is log((observed + 1) / (predicted + 1)), in rows.
3. Errors are grouped by the size of the prediction (under one row, 1, 2 to 3, 4 to 7, and so on, doubling), and,
   where a 10 degree latitude band has at least 100 errors in a group, by band.
4. The interval of a new prediction is (prediction + 1) x exp(10th and 90th percentile of its group's errors) - 1,
   never below zero.

So the interval is wider, relative to the prediction, where the predicted count is small, and it follows how much
the factor wanders from year to year in that part of the world.

The interval used before (MODIS x the 10th and 90th percentile of the place's yearly ratios) described the spread of
yearly ratios, not the error of a month. Held out, it held about half of the months and about 55 percent of the
years where it stated 80 percent (table below).

## The rule for a better method

It was written before any method was scored, and is not changed after a table exists; the two changes made after
the first tables are listed under Limits.

- Target: Suomi NPP rows of a place in a month, counted by the box rule (FIRMS type 0 only). Input: MODIS rows of
  the same place and month. Fire radiative power (FRP) the same way, scored on its own.
- Places: every 2 degree cell of the grid with a counted row (the Record's places are about that size). Half
  degree cells are reported beside and do not decide.
- Each overlap year left out in turn, everywhere at once.
- A place whose box touches the context box of `plumas_ca`, `lytton_bc` or `evia_greece` is not scored in 2021,
  the year of their recorded test fires. Its rows of that year stay in the fits of other years.
- Monthly score: the sum of absolute errors over the sum of observed rows (fire weighted). Annual score: the median
  relative error over place-years with at least 50 Suomi NPP rows (place weighted).
- A method replaces the method in use only if one score improves by 10 percent and the other loses no more than 2
  percent, worldwide; its monthly score is lower in at least two thirds of the regions and of the latitude bands
  and no more than 10 percent higher in any; it does not lose on 2012 to 2019 alone (before MODIS orbit drift);
  and it predicts every place-month, including a place with no overlap rows of its own.
- The interval covers what it states when world coverage is within 3 points of 80 percent, and every region and
  band with 30 scored place-years is within 10 points.

## The candidates

Each is a small pure function of the monthly counts (`SPECS` in `harmonize.py`):

| Id | What it changes |
| --- | --- |
| `none` | no correction: MODIS rows as they are |
| `in_use` | the method in use |
| `month` | a ratio per month of the year, shrunk toward the place's ratio |
| `day_night` | Suomi NPP day rows from MODIS day rows, night rows from night rows |
| `area` | MODIS rows weighted by their pixel area (country files only; the cube keeps no pixel area) |
| `scan_fit` | MODIS rows weighted by the class of their pixel's width across the swath, the weight's power fitted |
| `terra_aqua` | Terra and Aqua as two estimates, blended by a fitted weight |
| `aqua` | Aqua alone, whose afternoon pass is closest to Suomi NPP's |
| `era_sharp` | one ratio for Suomi NPP alone (to March 2018) and one for the years with NOAA-20 |
| `sharp_fit` | the ratio fitted on the mean of Suomi NPP and NOAA-20 where both fly |
| `era_drift` | a ratio for each stretch of MODIS orbit drift (Terra from February 2020, Aqua from December 2021) |
| `size` | a factor that changes with the size of the month's MODIS count, and a value for months MODIS saw nothing |
| `no_low_conf` | low confidence MODIS rows left out |
| `pooled` | a place's ratio leans on its 8 neighbours, then its latitude band, then the world |
| `pooled_size`, `pooled_month_size`, `combined` | combinations, made after the single changes were scored |

## Results

### United States, Canada and Greece, from the country files

811 places of 2 degrees, 152 clean months. Rows:

| Candidate | monthly score | annual score |
| --- | --- | --- |
| no correction | 0.765 | 0.725 |
| method in use | 0.252 | 0.176 |
| `pooled_size` | 0.244 | 0.173 |
| `size` | 0.247 | 0.174 |
| `month` | 0.252 | 0.165 |
| `day_night` | 0.251 | 0.180 |
| `terra_aqua` | 0.254 | 0.178 |
| `aqua` | 0.288 | 0.194 |
| `area` | 0.292 | 0.201 |

No candidate replaces the method in use, for rows or for FRP. At half degree places the pooled family passes: the
monthly score falls from 0.454 to 0.386 for rows and from 0.834 to 0.498 for FRP. The smaller the place, the more its
own ratio is noise, and leaning on neighbours pays.

What the data say about the factor itself: months with 1 MODIS row hold about twice the Suomi NPP rows the ratio
predicts; months with 64 to 255 MODIS rows about 0.9 times; place-months with no MODIS row still hold Suomi NPP rows
(88,238 rows over 82,297 such place-months), which a ratio calls zero. Weighting MODIS rows up where their pixel is
wide makes rows worse; for FRP the fitted weight goes the other way, down for wide pixels.

### The world, from the fire cube

The candidates were frozen before the cube was read; the cube's countries other than the three above are their check.
The tables are given in full by `python3 -m backend.model.harmonize_eval run --source cube --deg 2`, with the digest
of the cube build it read. With 67 countries loaded (1,151 places; 2,370 scored place-years outside the three
countries above):

| Candidate | monthly, world | annual, world | monthly, outside the three | annual, outside the three |
| --- | --- | --- | --- | --- |
| no correction | 0.758 | 0.727 | 0.748 | 0.731 |
| method in use | 0.231 | 0.160 | 0.194 | 0.124 |
| `month` | 0.217 | 0.151 | 0.157 | 0.122 |
| `pooled_month_size` | 0.215 | 0.147 | 0.158 | 0.122 |

The month of the year matters most where the candidates were not designed (Africa: 0.149 to 0.101 near the equator,
0.198 to 0.153 south of it), and is worse in places outside every named region, so it does not pass the rule.

### The interval, held out

80 percent stated. Coverage on years that did not set the interval, 2 degree places, three countries:

| Interval | months | months predicted 1 row or more | years | years predicted 50 rows or more |
| --- | --- | --- | --- | --- |
| used before | 0.500 | 0.359 | 0.553 | 0.715 |
| from held-out errors | 0.872 | 0.799 | 0.830 | 0.798 |

Months predicted under one row are over-covered by any interval, because counts are whole numbers. With one world
table, coverage of months predicted one row or more runs by region from 0.69 (Alaska) to 0.90 (Greece). With one
table per latitude band the spread narrows (on the cube: Africa near the equator 0.81 of months against 0.66 with
one world table).

The Record's three regions, each overlap year but 2021 held out, with the Record's own monthly counts:

| Region | median annual error | without correction | interval, years | interval, months | interval used before, months (2021 included) |
| --- | --- | --- | --- | --- | --- |
| `plumas_ca` | 0.113 | 0.731 | 0.77 | 0.87 | 0.41 |
| `lytton_bc` | 0.087 | 0.733 | 1.00 | 0.76 | 0.15 |
| `evia_greece` | 0.058 | 0.716 | 0.92 | 0.88 | 0.20 |

## World maps

`harmonize_maps.py` writes, on the fire cube's grid (a quarter degree, north up), arrays and PNGs of: the factor;
the factor with pooling; the held-out monthly error with the factor and without it; the share of held-out months
inside the interval. Each is painted from 2 degree places; cells with no loaded country, or places with too few
rows, are transparent. Their scales and digests are in the `maps.json` written beside them.

## Limits

- The truth is Suomi NPP itself. A month Suomi NPP missed under cloud is a month the harmonized record should miss
  too; nothing here corrects either satellite toward the ground.
- The method rescales counts per place. It does not place fire inside a MODIS pixel.
- One fire gives many rows, so errors are not independent across months, and a place's own coverage over about 100
  months moves by several points from chance alone.
- Two changes were made after the first tables, and are marked so: the coverage test counts only predictions of at
  least one row (whole-number counts over-cover near zero), and the combinations and negative pixel-size weights
  were added after the single changes were scored. A choice made after seeing held-out scores is weaker evidence
  than one made before.
- The regions on the cube are boxes of longitude and latitude, fixed before any score; they leave Central Asia
  south of 45 N and the Caucasus in a remainder region.
- NOAA-21 and the months after the last country file are not in the fit or the measurement.
- Lava is counted as fire where FIRMS marks it type 0. The worst places of the measurement are volcanoes: Hawaii's
  Big Island, whose yearly ratio of Suomi NPP to MODIS rows runs from 5 to more than 4,000 across the eruptions of
  2018 and 2022, Piton de la Fournaise on Reunion and Fogo in Cape Verde. VIIRS sees hot lava far more often than
  MODIS, so no ratio holds there, and no correction does better there than any method. The Record of such a place
  reads lava as fire.
