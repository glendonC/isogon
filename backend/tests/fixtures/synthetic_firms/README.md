# Synthetic FIRMS CSV fixtures

This directory contains invented active-fire CSV files that exercise regional extraction, deduplication, and source-type filtering in `backend/tests/test_firms_archive.py` and `backend/tests/test_firms_calendar.py`. Contributors modifying FIRMS CSV readers read it to see how the test fixtures mirror NASA country-archive column layouts while remaining distinguishable from real satellite records.

## Schema and test cases

Every row is synthetic and carries `version` set to `synthetic` so no test fixture row can be mistaken for a real NASA FIRMS observation. Column headers match the annual NASA FIRMS country CSV schema for `Greece` in 2021 around the `evia_greece` 5x context box:

| File | Sensor schema | Columns tested | Edge cases included |
| --- | --- | --- | --- |
| `modis_2021_Greece.csv` | `MODIS` country archive (`Terra`, `Aqua`) | `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type` (numeric `confidence`) | 6 rows total: 3 unique in-box `type=0` fire rows (2021-08-03 and 2021-08-05), 1 exact duplicate of the first Terra row, 1 out-of-box row at 25.5000 E, and 1 static industrial source row with `type=2` on 2021-12-31. |
| `viirs-snpp_2021_Greece.csv` | Suomi NPP `VIIRS` country archive (`satellite=N`) | `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type` (letter `confidence` `h`/`n`) | 3 rows total: 2 in-box `type=0` rows (2021-08-03 day and 2021-08-04 night) and 1 out-of-box row at 40.50000 N. |
| `viirs-jpss1_2021_Greece.csv` | NOAA-20 / JPSS-1 `VIIRS` country archive (`satellite=1`) | Same `VIIRS` 15-column layout (`bright_ti4`, `bright_ti5`, letter `confidence`) | 1 in-box `type=0` daytime row on 2021-08-03. |
