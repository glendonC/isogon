# Harmonization of MODIS and VIIRS fire detections

This document explains how the Record puts the coarse satellites (MODIS on Terra and Aqua, 1 km at nadir, from
2000) and the sharp ones (VIIRS on Suomi NPP and NOAA-20, 375 m, from 2012) on one scale, which methods were tried,
how each was measured, which one won and by what rule, and what the stated interval means. Code:
`backend/model/harmonize.py` (methods, interval, the Record's call), `harmonize_fitted.py` (the fitted tables and
which method is served), `harmonize_cells.py` (counts per cell from the country files or the fire cube),
`harmonize_eval.py` (the measurement), `harmonize_maps.py` (world maps), `harmonize_dataset.py` (the harmonized
record per quarter degree cell), `harmonize_places.py` (regions and bands).

## The method the Record serves

The Record predicts what Suomi NPP would have counted in a place and month from what MODIS counted there. Since the
measurement on the whole world (below), it serves `pooled_month_size_v1`:

- harmonized = MODIS rows (Terra plus Aqua) x the place's ratio for that month of the year x a factor for the size
  of the month's MODIS count;
- the ratio for a month of the year is the place's Suomi NPP rows over its MODIS rows in that month of the year,
  leaning on the place's ratio over the whole year (30 MODIS rows weigh as much as the prior);
- the place's ratio over the year leans the same way on its surroundings (the place grown by 2 degrees, less the
  place, from the fire cube), and they on the 10 degree latitude band, and the band on the world;
- the factor for the size of the month's count is one curve for the world: months with one MODIS row hold about
  1.9 times the Suomi NPP rows the month's ratio predicts, months with 2 or 3 rows 1.3 times, months with 16 rows or
  more the same;
- a month in which MODIS saw nothing gets the place's mean Suomi NPP count in such months, leaning on its band;
- every ratio and factor is fitted on the clean overlap months: from February 2012, months in which Suomi NPP, Terra
  and Aqua each deliver data with no outage day (the calendar's outage rule, `docs/data.md`). January 2012 is left
  out because Suomi NPP rows begin on the 20th;
- before Aqua (to June 2002) Terra alone is used, fitted the same way.

The method used before, `overlap_ratio_v1`, is one ratio per place (its Suomi NPP rows over its MODIS rows over the
clean overlap months). It still serves fire radiative power (FRP), for which no candidate won. Which method is served
is the field `serve` of `harmonize_fitted.py`. The Record also gives the ratio over the whole overlap, the one
number it speaks.

## The interval

The Record states an 80 percent interval around every month and every year. It is built from held-out errors:

1. Each overlap year from 2012 to 2025 is left out in turn, over every place of the fit at once. The method is
   fitted on the other years and predicts the year left out.
2. The error of a prediction is log((observed + 1) / (predicted + 1)), in rows.
3. Errors are grouped by the size of the prediction (under one row, 1, 2 to 3, 4 to 7, and so on, doubling) and by
   10 degree latitude band; a size class with fewer than 100 errors in a band takes the world's.
4. The interval of a new prediction is (prediction + 1) x exp(10th and 90th percentile of its group's errors) - 1,
   never below zero.

So the interval is wider, relative to the prediction, where the predicted count is small, and it follows how much
the factor wanders from year to year in that part of the world.

The interval used before (MODIS x the 10th and 90th percentile of the place's yearly ratios) described the spread of
yearly ratios, not the error of a month. Held out over the world it held 0.32 of months and 0.68 of years where it
stated 80 percent (table below).

## The rule for a better method

It was written before any method was scored, and is not changed after a table exists; the two changes made after
the first tables are listed under Limits.

- Target: Suomi NPP rows of a place in a month, counted by the box rule (FIRMS type 0 only). Input: MODIS rows of
  the same place and month. FRP the same way, scored on its own.
- Places: every 2 degree cell of the grid with a counted row (the Record's places are about that size). Smaller
  cells are reported beside and do not decide.
- Each overlap year left out in turn, everywhere at once.
- A place whose box touches the context box of `plumas_ca`, `lytton_bc` or `evia_greece` is not scored in 2021,
  the year of their recorded test fires. Its rows of that year stay in the fits of other years.
- Monthly score: the sum of absolute errors over the sum of observed rows (fire weighted). Annual score: the median
  relative error over place-years with at least 50 Suomi NPP rows (place weighted).
- A method replaces the method in use only if one score improves by 10 percent and the other loses no more than 2
  percent, worldwide; its monthly score is lower in at least two thirds of the regions and of the latitude bands
  and no more than 10 percent higher in any; it does not lose on 2012 to 2019 alone (before MODIS orbit drift);
  and it predicts every place-month, including a place with no overlap rows of its own.
- The decision was to be taken on the fire cube once every country was in it.
- The interval covers what it states when world coverage is within 3 points of 80 percent, and every region and
  band with 30 scored place-years is within 10 points.

## The candidates

Each is a small pure function of the monthly counts (`SPECS` in `harmonize.py`):

| Id | What it changes |
| --- | --- |
| `none` | no correction: MODIS rows as they are |
| `in_use` | one ratio per place (`overlap_ratio_v1`) |
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

### The whole world (the decision)

The fire cube with all 238 countries of the FIRMS listing (build `20261115T034227Z-aec5a74a`): 5,227 places of 2
degrees, 41,112 scored place-years, 156 clean overlap months.

| Candidate | rows, monthly | rows, annual | FRP, monthly | FRP, annual |
| --- | --- | --- | --- | --- |
| no correction | 0.777 | 0.770 | 0.308 | 0.358 |
| `in_use` (used before) | 0.183 | 0.135 | 0.207 | 0.211 |
| `pooled_month_size` | **0.141** | **0.127** | 0.196 | 0.202 |
| `month` | 0.142 | 0.128 | 0.198 | 0.204 |
| `combined` | 0.145 | 0.131 | 0.194 | 0.202 |
| `day_night` | 0.179 | 0.138 | 0.207 | 0.209 |
| `scan_fit` | 0.181 | 0.135 | 0.195 | 0.195 |
| `pooled` | 0.181 | 0.135 | 0.206 | 0.210 |
| `pooled_size` | 0.181 | 0.140 | 0.201 | 0.221 |
| `size` | 0.182 | 0.140 | 0.202 | 0.222 |
| `era_sharp` | 0.182 | 0.130 | 0.212 | 0.212 |
| `sharp_fit` | 0.182 | 0.134 | 0.207 | 0.211 |
| `era_drift` | 0.185 | 0.133 | 0.218 | 0.216 |
| `no_low_conf` | 0.186 | 0.138 | | |
| `terra_aqua` | 0.189 | 0.137 | 0.207 | 0.212 |
| `aqua` | 0.217 | 0.154 | 0.215 | 0.227 |

For rows, `pooled_month_size` is the only candidate that passes every test: 22.6 percent better by month and 5.9
percent by year than the method used before; lower in 15 of 16 regions and 13 of 14 bands, and at most 5.3 percent
higher in any; better on 2012 to 2019 alone (0.134 against 0.179); a prediction for every place. `month` alone is as
good but has nothing to fall back on for a place without rows; `combined` is 10.7 percent worse in one group. For
FRP no candidate passes (the best, `scan_fit`, is 6 percent better by month and 7 by year, short of 10, and 11
percent worse in one group), so FRP keeps the method used before.

By region, rows, monthly score:

| Region | place-years | used before | served | no correction |
| --- | --- | --- | --- | --- |
| Africa, south of the equator | 3,267 | 0.154 | 0.094 | 0.777 |
| Africa, equator to 20 N | 3,223 | 0.156 | 0.109 | 0.782 |
| Mexico, Central America and the Caribbean | 1,552 | 0.154 | 0.125 | 0.780 |
| South America, north of 15 S | 2,807 | 0.164 | 0.131 | 0.753 |
| Australia and Oceania | 2,785 | 0.150 | 0.146 | 0.791 |
| Southeast Asia | 3,183 | 0.180 | 0.153 | 0.801 |
| South America, south of 15 S | 2,248 | 0.179 | 0.157 | 0.726 |
| South Asia | 1,509 | 0.280 | 0.202 | 0.857 |
| North America, east of 100 W, 25 to 49 N | 1,766 | 0.269 | 0.231 | 0.649 |
| Russia and Central Asia | 6,530 | 0.243 | 0.232 | 0.755 |
| North America, north of 49 N | 2,275 | 0.222 | 0.234 | 0.799 |
| North America, west of 100 W, 25 to 49 N | 1,615 | 0.254 | 0.236 | 0.781 |
| Europe | 3,895 | 0.334 | 0.289 | 0.714 |
| East Asia | 1,895 | 0.529 | 0.389 | 0.749 |
| elsewhere | 1,093 | 0.564 | 0.551 | 0.815 |
| North Africa and the Middle East | 1,469 | 0.679 | 0.659 | 0.868 |

The month of the year matters most where burning follows a dry season (the African savannas, the tropics); in the
boreal north the served method is a little worse (0.234 against 0.222). At 1 degree places (16,594, beside) the
monthly score falls from 0.219 to 0.186 and the method passes there too.

### How the picture changed as the world filled

The candidates were designed on the United States, Canada and Greece, and frozen before the cube was read. The rule
said the decision would wait for every country. Along the way:

| Countries in the cube | places | used before, monthly | `pooled_month_size`, monthly | passes the rule |
| --- | --- | --- | --- | --- |
| 3 (country files) | 811 | 0.252 | 0.248 | no |
| 67 | 1,151 | 0.231 | 0.215 | no |
| 126 | 2,127 | 0.242 | 0.225 | no |
| 223 | 3,612 | 0.207 | 0.173 | yes |
| 238 (all) | 5,227 | 0.183 | 0.141 | yes |

With North America dominating, the month of the year was worth a few percent; with the tropics in, more than 20.

### The three countries the candidates were designed on

811 places of 2 degrees, 152 clean months, from the country files. Rows: no correction 0.765, used before 0.252,
`pooled_size` 0.244, `pooled_month_size` 0.248, `month` 0.252 by month. No candidate passed there. At half degree
places the pooled family passed: rows from 0.454 to 0.386, FRP from 0.834 to 0.498. Weighting MODIS rows up where
their pixel is wide made rows worse; for FRP the fitted weight went the other way, down for wide pixels.

### The interval, held out

80 percent stated. Coverage on years that did not set the interval, the whole world, 2 degree places:

| Interval | months | months predicted 1 row or more | years predicted 1 row or more | years predicted 50 rows or more |
| --- | --- | --- | --- | --- |
| used before, rows | 0.375 | 0.325 | 0.679 | 0.708 |
| from held-out errors by band, rows, served method | 0.817 | 0.798 | 0.792 | 0.792 |
| used before, FRP | 0.387 | 0.379 | 0.699 | 0.714 |
| from held-out errors by band, FRP | 0.846 | 0.798 | 0.787 | 0.788 |

Every month over-covers because counts are whole numbers: near zero any interval holds more than it states. For rows,
29 of 30 regions and bands with 30 place-years are within 10 points of 80 percent; North Africa and the Middle East
is not (0.72 of months, 0.70 of years). For FRP 25 of 30 are; North America north of 49 N and west of 100 W, and
the bands 40 to 60 S and 70 to 80 N are not.

The Record's three regions, each overlap year but 2021 held out, with the Record's own monthly counts and the served
method (its surroundings from the cube):

| Region | median annual error | used before | without correction | interval, months | interval, years | interval used before, months (2021 included) |
| --- | --- | --- | --- | --- | --- | --- |
| `plumas_ca` | 0.116 | 0.113 | 0.731 | 0.81 | 0.92 | 0.41 |
| `lytton_bc` | 0.080 | 0.087 | 0.733 | 0.85 | 1.00 | 0.15 |
| `evia_greece` | 0.081 | 0.058 | 0.716 | 0.90 | 0.92 | 0.20 |

Thirteen years at one place decide nothing; on two of these three the served method's annual error is a little
higher than before.

## The harmonized record as a dataset

`harmonize_dataset.py` writes, from the fire cube, every quarter degree cell with a fire row and every month from
November 2000 to December 2025: MODIS, Suomi NPP and NOAA-20 rows and FRP; MODIS on Suomi NPP's scale with the 80
percent interval; per cell the factor, the held-out error with and without the correction, and how often the
interval held. The files are numpy and CSV, with a PNG per map and a document of every column, how it was made,
what it was checked against and what it must not be used for. At a quarter degree each cell leans on its eight
neighbouring cells; rows use the served method, FRP the pooled ratio (a cell's own ratio is mostly noise at that
size), and the interval tables are fitted on the cells' own held-out errors.

Built from the whole cube: 191,187 cells, 302 months, 387 MB in all (the monthly arrays 335 MB compressed, the table
of cells 34 MB). Held out over every cell:

| Held-out monthly error | dataset's method | one own ratio per cell | no correction |
| --- | --- | --- | --- |
| rows | 0.363 | 0.413 | 0.785 |
| FRP | 0.476 | 0.624 | 0.502 |

The interval holds 0.80 of held-out months and years (predictions of one row or more). Summed over the world, the
harmonized rows are within 3 percent of Suomi NPP's own rows in every year 2013 to 2023 (6 percent above in 2024, 5
below in 2025), and stay level across Aqua's arrival: 24.0, 22.6 and 22.4 million rows in 2001, 2002 and 2003, with
Terra alone in 2001. At a quarter degree the FRP correction barely beats leaving MODIS FRP as it is.

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
  were added after the single changes were scored. The method that won is one of those combinations. A choice made
  after seeing held-out scores is weaker evidence than one made before; what counts for it is that it was frozen
  before the cube was read and won on the countries it was not designed on.
- The regions on the cube are boxes of longitude and latitude, fixed before any score; they leave Central Asia
  south of 45 N and the Caucasus in a remainder region.
- NOAA-21 and the months after the last country file are not in the fit or the measurement.
- Lava is counted as fire where FIRMS marks it type 0. The worst places of the measurement are volcanoes: Hawaii's
  Big Island, whose yearly ratio of Suomi NPP to MODIS rows runs from 5 to more than 4,000 across the eruptions of
  2018 and 2022, Piton de la Fournaise on Reunion and Fogo in Cape Verde. VIIRS sees hot lava far more often than
  MODIS, so no ratio holds there, and no correction does better there than any method. The Record of such a place
  reads lava as fire.
- The factors and interval tables are fitted on every place's Suomi NPP counts of every year. They must not be used
  to test a model that predicts Suomi NPP.
