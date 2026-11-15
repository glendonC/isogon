"""The cube routes on an invented cube: the Record's shape, the tables, and a box with no loaded row."""

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from backend import server_cube as S
from backend.firms import cube as C
from backend.tests.test_cube_build import _make


class CubeRoutes(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        _, root = _make(Path(self.tmp.name))
        self.cube = C.Cube(root)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def get(self, route: str, **qs: str) -> tuple[int, dict]:
        status, body, ctype = S.cube_route(route, {k: [v] for k, v in qs.items()}, self.cube)
        return int(status), (json.loads(body) if ctype.startswith("application/json") else {})

    def test_other_routes_are_not_answered(self) -> None:
        self.assertIsNone(S.cube_route("/api/calendar", {}, self.cube))

    def test_the_record_has_the_shape_of_the_box_calendar(self) -> None:
        status, d = self.get("/api/cube/record", box="10.05,45.05,10.45,45.45")
        self.assertEqual(status, 200)
        for k in ("records", "annual_summary", "month_climatology", "harmonization_method", "summary_metrics",
                  "place", "cube"):
            self.assertIn(k, d)
        self.assertEqual(d["place"]["box"], [10.0, 45.0, 10.5, 45.5])
        self.assertEqual(d["place"]["box_asked"], [10.05, 45.05, 10.45, 45.45])
        jul = next(r for r in d["records"] if r["year_month"] == "2020-07")
        terra = jul["raw_counts"]["Terra"]
        self.assertEqual((terra["day"], terra["static_excluded"]), (1, 1))
        self.assertAlmostEqual(terra["frp_mw"], 10.5)
        self.assertIsNone(jul["raw_counts"]["NOAA-20"])  # no NOAA-20 row anywhere: null, not zero
        self.assertEqual(d["cube"]["countries"], ["Testland"])
        self.assertFalse(d["cube"]["world_complete"])

    def test_tables_keep_every_axis(self) -> None:
        status, d = self.get("/api/cube/tables", box="10,45,10.5,45.5")
        self.assertEqual(status, 200)
        self.assertEqual(len(d["rows"]), len(d["months"]))
        self.assertEqual(len(d["rows"][0]), 4)

    def test_a_box_with_no_loaded_row_is_not_loaded(self) -> None:
        status, d = self.get("/api/cube/record", box="20,45,20.5,45.5")
        self.assertEqual(status, 404)
        self.assertEqual(d["state"], "not_loaded")

    def test_a_bad_box_and_an_unknown_layer_are_refused(self) -> None:
        self.assertEqual(self.get("/api/cube/record", box="1,2,3")[0], 400)
        self.assertEqual(self.get("/api/cube/layers/..%2Fmanifest.json")[0], 404)
        self.assertEqual(self.get("/api/cube/layers/rows_viirs.png")[0], 200)


if __name__ == "__main__":
    unittest.main()
