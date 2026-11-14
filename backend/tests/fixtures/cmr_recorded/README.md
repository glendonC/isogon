# Recorded CMR replies

Two real NASA CMR `granules.json` replies, recorded 2026-11-14 without login, with each entry's `links` list removed
to keep the files small:

- `MOD14_plumas_ca_2021-08-01.json`: collection `C2271754179-LPCLOUD` (MOD14 061, Terra), granules over the
  `plumas_ca` context box on 2021-08-01.
- `VNP14IMG_plumas_ca_2021-08-01.json`: collection `C2734202914-LPCLOUD` (VNP14IMG 002, Suomi NPP), same box and day.

Used by `test_cmr_passes.py` through a fake opener, so no test needs the network.
