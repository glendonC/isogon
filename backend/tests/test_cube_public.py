"""The public cube: what a browser sums from it equals the cube's fire rows, gaps and large counts survive, closed
months read as closed, and a box with no loaded cell is not loaded."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

import numpy as np

from backend.firms import cube as C, cube_public as P
from backend.tests.test_cube_build import _make


def _reader(cell, month, rows, loaded=None, closed=(), n_months=302) -> P.PublicCube:
    cell, month, rows = np.asarray(cell, np.int64), np.asarray(month, np.int64), np.asarray(rows, np.int64)
    if loaded is None:
        loaded = np.zeros((C.N_ROWS, C.N_COLS), np.uint8)
        loaded.reshape(-1)[np.unique(cell)] = 1
    raw, sections, _ = P.encode(cell, month, rows, loaded)
    return P.PublicCube(manifest={"sections": sections, "months": {"count": n_months}, "platforms": list(C.PLATFORMS),
                                  "closed": list(closed)}, data=raw)


class PublicCube(unittest.TestCase):
    def test_a_box_sums_to_the_cubes_fire_rows(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            _store, root = _make(Path(d))
            man = P.write(root=root, log=lambda s: None)
            pub = P.PublicCube(P.public_dir(root))
            cube = C.Cube(root)
            box = (10.0, 45.0, 10.5, 45.5)
            t, p = cube.box(box), pub.box(box)
            want = t["rows"][..., 0].sum(axis=2)          # fire rows, day and night together, per month and platform
            np.testing.assert_array_equal(p["rows"], want)
            self.assertTrue(p["loaded"])
            self.assertEqual(int(p["rows"].sum()), 5)        # 3 MODIS fire rows (one on a corner) and 2 VIIRS
            self.assertEqual(man["rows_in_file"]["Terra"], 2)
            self.assertFalse(pub.box((100.0, 0.0, 101.0, 1.0))["loaded"])
            from backend.server_cube import record_payload

            route, mine = record_payload(cube, box), P.public_record(pub, box)
            self.assertEqual(len(route["records"]), len(mine["records"]))
            for a, b in zip(route["records"], mine["records"]):
                for k in ("year_month", "modis_raw_rate", "viirs_raw_rate", "harmonized_mean", "sensor_regime"):
                    self.assertEqual(a[k], b[k], (a["year_month"], k))
                for plat, c in a["raw_counts"].items():
                    self.assertEqual(None if c is None else (c["total"], c["outage_days"]),
                                     None if b["raw_counts"][plat] is None else
                                     (b["raw_counts"][plat]["total"], b["raw_counts"][plat]["outage_days"]))

    def test_long_gaps_and_large_counts_round_trip(self) -> None:
        rows = [[1, 0, 0, 0], [0, 300, 0, 0], [0, 0, 70000, 2], [5, 0, 0, 255]]
        pub = _reader([1000, 1000, 1000, 1001], [0, 280, 301, 290], rows)
        lon, lat = C.cell_box(1000)[:2]
        t = pub.box((lon, lat, lon + 0.25, lat + 0.25))
        self.assertEqual(t["rows"][0].tolist(), [1, 0, 0, 0])
        self.assertEqual(t["rows"][280].tolist(), [0, 300, 0, 0])
        self.assertEqual(t["rows"][301].tolist(), [0, 0, 70000, 2])
        self.assertEqual(int(t["rows"].sum()), 70303)
        both = pub.box((lon, lat, lon + 0.5, lat + 0.25))
        self.assertEqual(both["rows"][290].tolist(), [5, 0, 0, 255])
        filled, _, _, n = P._with_fillers(np.array([7, 7]), np.array([10, 300]), np.zeros((2, 4), np.int64))
        self.assertEqual(n, 1)

    def test_closed_months_read_closed_not_zero(self) -> None:
        pub = _reader([2000, 2001], [242, 242], [[3, 0, 0, 0], [4, 0, 0, 0]],
                      closed=[{"region_id": "x", "months": [242, 253], "cells": [2001]}])
        lon, lat = C.cell_box(2000)[:2]
        self.assertEqual(pub.box((lon, lat, lon + 0.25, lat + 0.25))["closed_months"], [])
        self.assertEqual(pub.box((lon, lat, lon + 0.5, lat + 0.25))["closed_months"], list(range(242, 254)))

    def test_the_closed_rule_closes_the_test_regions_in_2021(self) -> None:
        closed = {c["region_id"]: c for c in P.closed_cells(302)}
        self.assertEqual(sorted(closed), ["evia_greece", "lytton_bc", "plumas_ca"])
        for c in closed.values():
            self.assertEqual(c["years"], [2021])
            self.assertEqual([C.month_label(m) for m in c["months"]], ["2021-01", "2021-12"])
            self.assertGreater(len(c["cells"]), 20)
        self.assertIn(C.cell_of(-121.0, 40.0), closed["plumas_ca"]["cells"])
        self.assertNotIn(C.cell_of(-118.0, 36.0), closed["plumas_ca"]["cells"])


if __name__ == "__main__":
    unittest.main()
