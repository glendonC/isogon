"""Offline unit tests for backend.firms.burned and non-network helpers in burned_fetch."""

from __future__ import annotations

import ast
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

from backend.eval.grid import EvalGrid
from backend.firms import burned, burned_fetch


class BurnedReaderTests(unittest.TestCase):
    def test_burned_module_imports_numpy_and_stdlib_only(self) -> None:
        src_path = Path(burned.__file__).resolve()
        tree = ast.parse(src_path.read_text(encoding="utf-8"), filename=str(src_path))
        allowed = set(sys.stdlib_module_names) | {"numpy", "__future__"}
        imported: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported.add(alias.name.split(".", 1)[0])
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".", 1)[0])
        disallowed = imported - allowed
        self.assertEqual(disallowed, set(), f"burned.py imported non-stdlib/non-numpy modules: {disallowed}")

    def test_burned_grid_matches_eval_grid_cell_for_cell(self) -> None:
        box = (-121.44, 39.86, -120.92, 40.24)
        bg = burned.BurnedGrid.from_bbox(box)
        eg = EvalGrid.from_bbox(box)
        self.assertEqual(bg.shape, eg.shape)
        self.assertEqual(bg.nx, eg.nx)
        self.assertEqual(bg.ny, eg.ny)
        self.assertAlmostEqual(bg.km_per_deg_lon, eg.km_per_deg_lon, places=12)
        self.assertAlmostEqual(bg.km_per_deg_lat, eg.km_per_deg_lat, places=12)
        blon, blat = bg.cell_lonlat()
        elon, elat = eg.cell_lonlat()
        np.testing.assert_allclose(blon, elon, rtol=0.0, atol=1e-12)
        np.testing.assert_allclose(blat, elat, rtol=0.0, atol=1e-12)

    def test_sinusoidal_navigation_and_plumas_tile_split(self) -> None:
        box = (-121.44, 39.86, -120.92, 40.24)
        self.assertEqual(burned.tiles_for_box(box), ["h08v04", "h08v05"])

        lon_in = np.array([-121.18, -72.19, 25.97, 150.36], dtype=np.float64)
        lat_in = np.array([40.05, -35.52, 41.03, -33.60], dtype=np.float64)
        h, v, i, j = burned.lonlat_to_sinusoidal_hvij(lon_in, lat_in)
        lon_c, lat_c = burned.sinusoidal_hvij_to_lonlat(h, v, i, j)
        h2, v2, i2, j2 = burned.lonlat_to_sinusoidal_hvij(lon_c, lat_c)
        np.testing.assert_array_equal(h, h2)
        np.testing.assert_array_equal(v, v2)
        np.testing.assert_array_equal(i, i2)
        np.testing.assert_array_equal(j, j2)
        # Cell centre must lie within half of a 463.31 m sinusoidal cell in latitude
        max_lat_deg = (0.5 * burned.SIN_CELL_M / burned.R_SINUSOIDAL_M) * (180.0 / np.pi) + 1e-9
        self.assertTrue(np.all(np.abs(lat_c - lat_in) <= max_lat_deg))

    def test_unfetched_returns_not_fetched_sentinel(self) -> None:
        box = (-121.44, 39.86, -120.92, 40.24)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(burned.mask(box, "2012-08-10", "2012-08-13", root=root), burned.NOT_FETCHED)
            self.assertEqual(burned.shares(box, "2012-08-10", "2012-08-13", root=root), "not fetched")

    def test_subwindow_slicing_and_source_dates_from_monthly_npz(self) -> None:
        box = (-121.44, 39.86, -120.92, 40.24)
        bg = burned.BurnedGrid.from_bbox(box)
        bd = np.zeros(bg.shape, dtype=np.int16)
        unc = np.zeros(bg.shape, dtype=np.uint8)
        qa = np.full(bg.shape, 3, dtype=np.uint8)
        fd = np.full(bg.shape, 214, dtype=np.int16)
        ld = np.full(bg.shape, 244, dtype=np.int16)

        # DOY 224 in leap year 2012 is 2012-08-11 (inside [2012-08-10, 2012-08-13))
        bd[0:2, 0:5] = 224
        unc[0:2, 0:5] = 4
        # DOY 218 in leap year 2012 is 2012-08-05 (burned earlier in August, outside window)
        bd[2, 0:3] = 218
        unc[2, 0:3] = 2
        # DOY 226 is 2012-08-13 (starts at window end 2012-08-13T00:00Z, so outside half-open [10, 13))
        bd[3, 0:4] = 226
        unc[3, 0:4] = 3
        # Water and unmapped cells
        bd[4, 0:6] = burned.NATIVE_WATER
        qa[4, 0:6] = 0
        bd[5, 0:2] = burned.NATIVE_UNMAPPED
        qa[5, 0:2] = 1

        granules = [
            {
                "filename": "MCD64A1.A2012214.h08v04.061.2021309005736.hdf",
                "tile": "h08v04",
                "sha256": "efae2490a4c8378675d831f1d81988f42895ce49c8b77580198d9d7f68b0f4af",
                "retrieved_utc": "2026-11-15T03:29:00Z",
            }
        ]

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mp = burned.month_path(box, 2012, 8, product="MCD64A1", root=root)
            mp.parent.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(
                mp,
                year=np.int32(2012),
                month=np.int32(8),
                product=np.str_("MCD64A1"),
                version=np.str_("061"),
                concept_id=np.str_("C2565786756-LPCLOUD"),
                retrieved_utc=np.str_("2026-11-15T03:29:00Z"),
                bbox=np.asarray(box, dtype=np.float64),
                cell_km=np.float64(bg.cell_km),
                burn_doy=bd,
                uncertainty_days=unc,
                qa=qa,
                first_day=fd,
                last_day=ld,
                granules_json=np.str_(json.dumps(granules)),
            )

            bw = burned.mask(box, "2012-08-10", "2012-08-13", product="MCD64A1", root=root)
            self.assertIsInstance(bw, burned.BurnedWindow)
            assert isinstance(bw, burned.BurnedWindow)
            self.assertEqual(bw.counts["burned_in_window"], 10)
            self.assertEqual(bw.counts["burned_other_day"], 7)
            self.assertEqual(bw.counts["water"], 6)
            self.assertEqual(bw.counts["unmapped"], 2)
            self.assertEqual(bw.counts["unburned_land"], bg.n_cells - 25)
            self.assertEqual(bw.first_burn_date, "2012-08-11")
            self.assertEqual(bw.last_burn_date, "2012-08-11")
            self.assertEqual(bw.burn_day_counts, {"2012-08-11": 10})
            self.assertEqual(bw.source["product"], "MCD64A1")
            self.assertEqual(bw.source["version"], "061")
            self.assertEqual(bw.source["concept_id"], "C2565786756-LPCLOUD")
            self.assertEqual(len(bw.source["granules"]), 1)
            self.assertTrue(np.all(bw.uncertainty_days[0:2, 0:5] == 4))

            # Extending the window by one day to 2012-08-14 includes DOY 226 (2012-08-13)
            bw2 = burned.mask(box, "2012-08-10", "2012-08-14", product="MCD64A1", root=root)
            assert isinstance(bw2, burned.BurnedWindow)
            self.assertEqual(bw2.counts["burned_in_window"], 14)
            self.assertEqual(bw2.burn_day_counts, {"2012-08-11": 10, "2012-08-13": 4})

            # VNP64A1 was not written, so querying VNP64A1 returns NOT_FETCHED
            self.assertEqual(
                burned.mask(box, "2012-08-10", "2012-08-13", product="VNP64A1", root=root),
                burned.NOT_FETCHED,
            )

    def test_cross_month_window_requires_all_months_and_saves_window_npz(self) -> None:
        box = (-121.44, 39.86, -120.92, 40.24)
        bg = burned.BurnedGrid.from_bbox(box)
        bd_sep = np.zeros(bg.shape, dtype=np.int16)
        bd_oct = np.zeros(bg.shape, dtype=np.int16)
        # Leap year 2020: 2020-09-29 is DOY 273; 2020-10-02 is DOY 276
        bd_sep[1, 1:4] = 273
        bd_oct[2, 1:6] = 276

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mp_sep = burned.month_path(box, 2020, 9, product="MCD64A1", root=root)
            mp_sep.parent.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(
                mp_sep,
                year=np.int32(2020),
                month=np.int32(9),
                product=np.str_("MCD64A1"),
                version=np.str_("061"),
                concept_id=np.str_("C2565786756-LPCLOUD"),
                retrieved_utc=np.str_("2026-11-15T03:30:00Z"),
                bbox=np.asarray(box, dtype=np.float64),
                cell_km=np.float64(bg.cell_km),
                burn_doy=bd_sep,
                uncertainty_days=np.ones(bg.shape, dtype=np.uint8),
                qa=np.full(bg.shape, 3, dtype=np.uint8),
                first_day=np.full(bg.shape, 245, dtype=np.int16),
                last_day=np.full(bg.shape, 274, dtype=np.int16),
                granules_json=np.str_("[]"),
            )

            # October is still missing -> must return NOT_FETCHED, never partial
            self.assertEqual(
                burned.mask(box, "2020-09-28", "2020-10-04", product="MCD64A1", root=root),
                burned.NOT_FETCHED,
            )

            mp_oct = burned.month_path(box, 2020, 10, product="MCD64A1", root=root)
            np.savez_compressed(
                mp_oct,
                year=np.int32(2020),
                month=np.int32(10),
                product=np.str_("MCD64A1"),
                version=np.str_("061"),
                concept_id=np.str_("C2565786756-LPCLOUD"),
                retrieved_utc=np.str_("2026-11-15T03:31:00Z"),
                bbox=np.asarray(box, dtype=np.float64),
                cell_km=np.float64(bg.cell_km),
                burn_doy=bd_oct,
                uncertainty_days=np.full(bg.shape, 2, dtype=np.uint8),
                qa=np.full(bg.shape, 3, dtype=np.uint8),
                first_day=np.full(bg.shape, 275, dtype=np.int16),
                last_day=np.full(bg.shape, 305, dtype=np.int16),
                granules_json=np.str_("[]"),
            )

            bw = burned.mask(box, "2020-09-28", "2020-10-04", product="MCD64A1", root=root)
            assert isinstance(bw, burned.BurnedWindow)
            self.assertEqual(bw.counts["burned_in_window"], 8)
            self.assertEqual(bw.burn_day_counts, {"2020-09-29": 3, "2020-10-02": 5})

            # Persist explicit window npz and sidecar manifest, then verify reload & list_windows
            wpath = burned_fetch.save_window_npz(bw, root, token="secret-tok-value")
            self.assertTrue(wpath.is_file())
            manifest = burned.read_manifest(wpath)
            self.assertIsNotNone(manifest)
            assert manifest is not None
            self.assertEqual(manifest["counts"]["burned_in_window"], 8)

            slightly_shifted_box = (-121.44002, 39.86, -120.92, 40.24)
            reloaded = burned.mask(slightly_shifted_box, "2020-09-28", "2020-10-04", product="MCD64A1", root=root)
            self.assertEqual(reloaded, bw)
            listed = burned.list_windows(box, product="MCD64A1", root=root)
            self.assertEqual(len(listed), 1)
            self.assertEqual(listed[0]["first_burn_date"], "2020-09-29")

    def test_closed_2021_windows_refused_while_open_2021_regions_allowed(self) -> None:
        closed_cases = [
            ((-121.44, 39.86, -120.92, 40.24), "2021-07-14", "2021-07-22"),
            ((-121.85, 50.04, -121.31, 50.42), "2021-06-29", "2021-07-05"),
            ((23.05, 38.68, 23.55, 39.04), "2021-08-03", "2021-08-11"),
            ((-121.44, 39.86, -120.92, 40.24), "2020-12-30", "2021-01-02"),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for box, s, e in closed_cases:
                with self.assertRaises(burned.ClosedBurnedWindow):
                    burned.mask(box, s, e, root=root)
                with self.assertRaises(burned.ClosedBurnedWindow):
                    burned.shares(box, s, e, root=root)

            # Manavgat, Turkey in July 2021 is an open featured fire, not one of the 3 closed boxes
            manavgat_box = (31.21, 36.71, 31.73, 37.09)
            self.assertEqual(
                burned.mask(manavgat_box, "2021-07-28", "2021-08-03", root=root),
                burned.NOT_FETCHED,
            )

    def test_token_redaction_and_split_markdown_priority_order(self) -> None:
        tok = "MySecretEarthdataToken_98765"
        msg = (
            f"GET https://data.lpdaac.earthdatacloud.nasa.gov/tile.hdf?sig={tok}&exp=1 "
            f"Authorization: Bearer {tok} raw={tok}"
        )
        cleaned = burned_fetch.redact_token(msg, tok)
        self.assertNotIn(tok, cleaned)
        self.assertNotIn("sig=", cleaned)
        self.assertIn("https://data.lpdaac.earthdatacloud.nasa.gov/tile.hdf", cleaned)

        sample_split = """# Worldwide Fresh Split

## Test fires (1)
| Key | Continent | Zone | Box | Window |
| :--- | :--- | :--- | :--- | :--- |
| `t_01` | Europe | Med | 15.10, 61.70, 15.60, 62.20 | 2018-07-17T00:00Z to 2018-07-20T00:00Z |
| `closed_dixie` | North America | Temp | -121.44, 39.86, -120.92, 40.24 | 2021-07-20T00:00Z to 2021-07-23T00:00Z |

## Validation fires (1)
| Key | Continent | Zone | Box | Window |
| :--- | :--- | :--- | :--- | :--- |
| `v_01` | South America | Temp | -72.45, -35.71, -71.93, -35.33 | 2017-01-22T00:00Z to 2017-01-25T00:00Z |

## Fitting fires (1)
| Key | Continent | Zone | Box | Window |
| :--- | :--- | :--- | :--- | :--- |
| `f_01` | Asia | Steppe | 80.50, 50.29, 81.02, 50.67 | 2023-06-08T00:00Z to 2023-06-11T00:00Z |
"""
        parsed = burned_fetch.parse_split_markdown(sample_split)
        self.assertEqual([r["key"] for r in parsed], ["f_01", "v_01", "t_01"])
        self.assertEqual([r["section"] for r in parsed], ["fitting", "validation", "test fires (1)"])


if __name__ == "__main__":
    unittest.main()
