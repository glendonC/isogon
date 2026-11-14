# Invented FIRMS country files

Three small CSV files in the layout of NASA FIRMS country yearly files, for `backend/tests/test_firms_archive.py` and `backend/tests/test_firms_calendar.py`. Read this if you change the FIRMS reader and need to know which cases the tests cover.

No row here was observed by a satellite. Every row's `version` column reads `synthetic`, so none can be mistaken for a NASA record. The files are named and laid out as the 2021 files for Greece, and their rows sit in and around the context box of `evia_greece`.

| File | Layout | Rows |
| --- | --- | --- |
| `modis_2021_Greece.csv` | MODIS: `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type`, with a number for `confidence` | 6: three fire rows inside the box (Terra and Aqua, 3 and 5 August), an exact duplicate of the first, one row outside the box at 25.5 E, and one `type` 2 row (a static source) on 31 December |
| `viirs-snpp_2021_Greece.csv` | VIIRS: the same with `bright_ti4` and `bright_ti5`, a class `l`, `n` or `h` for `confidence`, and `satellite` `N` | 3: a day row and a night row inside the box, and one row outside it at 40.5 N |
| `viirs-jpss1_2021_Greece.csv` | VIIRS, `satellite` `1` (NOAA-20) | 1: a day row inside the box |

The cases they cover are the extraction to a box, the removal of exact duplicates, the two confidence forms, and the static rows the calendar leaves out.

The two files beside this folder, `synthetic_firms_modis.csv` and `synthetic_firms_viirs.csv`, are a different invented set: a made-up fire in the year 2099, written by `backend/eval/synthetic_fixture.py` for the tests of the blind test and the environment. Their `version` column reads `SYNTHETIC`.
