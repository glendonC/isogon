# Recorded NASA CMR answers

Two answers of NASA's Common Metadata Repository granule search, recorded so that `backend/tests/test_cmr_passes.py` runs without the network. Read this if you change how the pass list is fetched or parsed and need to know what the tests feed it.

Both are answers of `https://cmr.earthdata.nasa.gov/search/granules.json` for the context box of `plumas_ca` (`-122.48,39.1,-119.88,41.0`) and the day 2021-08-01, during the Dixie Fire. They are the service's own JSON, with the `links` list of each granule removed to keep the files small. The times inside them are NASA's and are left as recorded.

| File | Collection | Holds |
| --- | --- | --- |
| `MOD14_plumas_ca_2021-08-01.json` | `C2271754179-LPCLOUD`, `MOD14` 061, Terra MODIS | 2 granules: a night pass at 06:25 UTC with 5 percent cloud cover and a day pass at 18:25 UTC with 31 percent, each with its swath polygon |
| `VNP14IMG_plumas_ca_2021-08-01.json` | `C2734202914-LPCLOUD`, `VNP14IMG` 002, Suomi NPP VIIRS | 3 granules: a night pass at 10:12 UTC and day passes at 19:54 and 21:36 UTC, each with its swath polygon; no cloud cover is given |

The test hands these bytes to the fetcher in place of a request, by collection id.
