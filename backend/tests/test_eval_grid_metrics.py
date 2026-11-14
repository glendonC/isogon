"""The 375 m evaluation grid, footprint painting and the score definitions (backend/eval)."""

from __future__ import annotations

from pathlib import Path
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import metrics as M  # noqa: E402
from backend.eval.grid import EvalGrid, dilate, footprint_cells, paint  # noqa: E402
from backend.eval.rows import detections_from_rows  # noqa: E402

BOX = (-121.44, 39.86, -120.92, 40.24)


def _row(lat: float, lon: float, scan: str, track: str, frp: str, sat: str = "Aqua", inst: str = "MODIS") -> dict[str, str]:
    return {
        "latitude": repr(lat), "longitude": repr(lon), "scan": scan, "track": track, "acq_date": "2099-07-01",
        "acq_time": "2135", "satellite": sat, "instrument": inst, "frp": frp, "daynight": "D", "confidence": "80",
    }


class GridTests(unittest.TestCase):
    def setUp(self) -> None:
        self.grid = EvalGrid.from_bbox(BOX)

    def test_dimensions_are_375_m_cells_over_the_box(self) -> None:
        g = self.grid
        self.assertEqual(g.cell_km, 0.375)
        width_km = (BOX[2] - BOX[0]) * g.km_per_deg_lon
        depth_km = (BOX[3] - BOX[1]) * g.km_per_deg_lat
        self.assertEqual(g.nx, int(np.ceil(width_km / 0.375)))
        self.assertEqual(g.ny, int(np.ceil(depth_km / 0.375)))
        self.assertEqual((g.nx, g.ny), (118, 113))

    def test_row_zero_is_north_and_column_zero_is_west(self) -> None:
        g = self.grid
        r, c = g.row_col(BOX[0] + 1e-4, BOX[1] + 1e-4)       # south-west corner
        self.assertEqual((int(r), int(c)), (g.ny - 1, 0))
        lon, lat = g.cell_lonlat()
        self.assertGreater(lat[0, 0], lat[-1, 0])
        self.assertLess(lon[0, 0], lon[0, -1])
        r, c = g.row_col(BOX[0] - 0.01, 40.0)
        self.assertEqual((int(r), int(c)), (-1, -1))

    def test_a_nadir_viirs_pixel_on_a_cell_centre_covers_one_cell(self) -> None:
        g = self.grid
        lon, lat = g.cell_lonlat()
        rows, cols = footprint_cells(g, float(lon[50, 60]), float(lat[50, 60]), 0.375, 0.375, 77.0)
        self.assertEqual((rows.tolist(), cols.tolist()), ([50], [60]))

    def test_an_off_nadir_modis_pixel_covers_scan_by_track_cells_along_its_axis(self) -> None:
        g = self.grid
        lon, lat = g.cell_lonlat()
        # 1.875 km along scan (5 cells) by 1.125 km along track (3 cells), scan axis east-west
        rows, cols = footprint_cells(g, float(lon[50, 60]), float(lat[50, 60]), 1.875, 1.125, 90.0)
        self.assertEqual(rows.size, 15)
        self.assertEqual((int(cols.min()), int(cols.max()), int(rows.min()), int(rows.max())), (58, 62, 49, 51))
        # the same pixel with the scan axis north-south is 3 wide and 5 tall
        rows, cols = footprint_cells(g, float(lon[50, 60]), float(lat[50, 60]), 1.875, 1.125, 0.0)
        self.assertEqual((int(cols.min()), int(cols.max()), int(rows.min()), int(rows.max())), (59, 61, 48, 52))

    def test_painting_conserves_frp_and_counts_pixels_outside(self) -> None:
        g = self.grid
        det = detections_from_rows(
            [
                _row(40.00, -121.25, "2.4", "1.5", "120.5"),
                _row(40.01, -121.24, "1.0", "1.0", "30"),
                _row(40.10, -121.00, "0.39", "0.36", "4.2", sat="N", inst="VIIRS"),
                _row(41.50, -121.00, "1.0", "1.0", "999"),          # outside the grid
            ],
            "test rows",
        )
        p = paint(g, det)
        self.assertEqual((p.n_pixels, p.n_outside), (3, 1))
        self.assertAlmostEqual(p.frp_total_mw, 154.7, places=6)
        self.assertAlmostEqual(float(p.frp_mw.sum()), 154.7, places=6)
        self.assertEqual(int(p.mask.sum()), int((p.frp_mw > 0).sum()))
        # a 2.4 by 1.5 km pixel covers about 2.4 * 1.5 / 0.375^2 = 25.6 cells; allow the edge rule a few either way
        big = paint(g, det.select(np.array([0])))
        self.assertTrue(20 <= int(big.mask.sum()) <= 32, int(big.mask.sum()))

    def test_dilate(self) -> None:
        m = np.zeros((5, 5), dtype=bool)
        m[2, 2] = True
        self.assertEqual(int(dilate(m, 1).sum()), 9)
        self.assertEqual(int(dilate(m, 0).sum()), 1)
        m2 = np.zeros((3, 3), dtype=bool)
        m2[0, 0] = True
        self.assertEqual(int(dilate(m2, 1).sum()), 4)


class MetricTests(unittest.TestCase):
    def test_counts_and_scores_on_a_hand_example(self) -> None:
        truth = np.zeros((4, 5), dtype=bool)
        pred = np.zeros((4, 5), dtype=bool)
        truth[1, 1:4] = True                 # three truth cells
        pred[1, 2:5] = True                  # two hits, one false alarm
        pred[3, 0] = True                    # one more false alarm
        c = M.contingency(pred, truth)
        self.assertEqual(c.as_dict(), {"tp": 2, "fp": 2, "fn": 1, "tn": 15})
        s = M.scores(c)
        self.assertAlmostEqual(s["hit_rate"], 2 / 3)
        self.assertAlmostEqual(s["false_alarm_ratio"], 2 / 4)
        self.assertAlmostEqual(s["false_alarm_rate"], 2 / 17)
        self.assertAlmostEqual(s["csi"], 2 / 5)

    def test_scores_are_none_not_zero_when_undefined(self) -> None:
        s = M.scores(M.Counts(0, 0, 0, 10))
        self.assertIsNone(s["hit_rate"])
        self.assertIsNone(s["false_alarm_ratio"])
        self.assertIsNone(s["csi"])
        self.assertEqual(s["false_alarm_rate"], 0.0)

    def test_one_cell_tolerance(self) -> None:
        truth = np.zeros((5, 5), dtype=bool)
        pred = np.zeros((5, 5), dtype=bool)
        truth[2, 2] = True
        pred[2, 3] = True                    # next to the truth cell: a miss when strict, a hit with tolerance
        pred[0, 0] = True                    # far away: a false alarm either way
        self.assertEqual(M.contingency(pred, truth).as_dict(), {"tp": 0, "fp": 2, "fn": 1, "tn": 22})
        ct = M.contingency_tolerant(pred, truth, 1)
        self.assertEqual((ct.tp, ct.fp, ct.fn), (1, 1, 0))

    def test_brier_and_frp_and_coverage(self) -> None:
        truth = np.array([[True, False]])
        self.assertAlmostEqual(M.brier(np.array([[0.8, 0.1]]), truth), (0.04 + 0.01) / 2)
        self.assertAlmostEqual(M.frp_relative_error(50.0, 100.0), -0.5)
        self.assertIsNone(M.frp_relative_error(5.0, 0.0))
        f = M.summarise_frp([50.0, 300.0, 5.0], [100.0, 200.0, 0.0])
        self.assertEqual(f["n_with_zero_hidden_total"], 1)
        self.assertAlmostEqual(f["median_relative_error"], 0.0)
        self.assertAlmostEqual(f["median_abs_relative_error"], 0.5)
        self.assertAlmostEqual(f["ratio_of_sums"], 355.0 / 300.0)
        iv = M.interval_coverage([40.0, 250.0, None], [120.0, 290.0, None], [100.0, 200.0, 10.0], 0.9)
        self.assertEqual((iv["n"], iv["covered"]), (2, 1))
        self.assertAlmostEqual(iv["coverage"], 0.5)
        none = M.interval_coverage([None], [None], [1.0], None)
        self.assertIsNone(none["coverage"])

    def test_every_reported_score_has_a_written_definition(self) -> None:
        for key in ("truth", "predicted_cells", "hit_rate", "false_alarm_ratio", "false_alarm_rate", "csi",
                    "tolerant_scores", "brier", "frp_total_error", "interval_coverage", "pooling"):
            self.assertIn(key, M.DEFINITIONS)
            self.assertGreater(len(M.DEFINITIONS[key]), 40)


    def test_a_stated_interval_is_one_sided_when_its_lower_end_is_zero(self) -> None:
        """Two-sided, the 5th to the 95th percentile hold 90 percent. With a lower end of zero nothing is cut off
        below, so the 95th percentile would hold 95 percent: the upper end is then the 90th percentile."""
        r = np.linspace(0.5, 1.5, 201)
        two = M.stated_interval(r, 0.90)
        self.assertEqual((two["one_sided"], round(two["lo"], 6), round(two["hi"], 6)), (False, 0.55, 1.45))
        self.assertAlmostEqual(float(np.mean((r >= two["lo"]) & (r <= two["hi"]))), 0.90, delta=0.01)
        z = np.concatenate([np.zeros(20), np.linspace(0.5, 1.5, 180)])          # one look in ten flagged nothing
        one = M.stated_interval(z, 0.90)
        self.assertTrue(one["one_sided"])
        self.assertEqual(one["lo"], 0.0)
        self.assertAlmostEqual(one["hi"], float(np.percentile(z, 90)), places=12)
        self.assertAlmostEqual(float(np.mean(z <= one["hi"])), 0.90, delta=0.01)
        self.assertGreater(float(np.mean(z <= float(np.percentile(z, 95)))), 0.94)   # what the two-sided rule would hold
        self.assertEqual((one["looks"], one["looks_that_flagged_nothing"]), (200, 20))
        self.assertEqual([round(v, 4) for v in one["given_a_detection"]], [round(float(np.percentile(z[z > 0], q)), 4) for q in (5, 95)])
        self.assertIsNone(M.stated_interval(np.array([]), 0.90))
        self.assertIn("one-sided", M.STATED_INTERVAL_RULE)


if __name__ == "__main__":
    unittest.main()
