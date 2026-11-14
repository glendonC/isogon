"""Unit M4, Terra's morning pass from VIIRS alone (backend/model/terra_morning.py), on the SYNTHETIC fixture."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.grid import EvalGrid  # noqa: E402
from backend.eval.overpass import group_overpasses  # noqa: E402
from backend.eval.rows import Detections, detections_from_rows, read_csv_rows  # noqa: E402
from backend.model import fitted  # noqa: E402
from backend.model import terra_morning as T  # noqa: E402
from backend.model.occupancy import OccupancyParams, OccupancyReconstruction, _box_sum  # noqa: E402


def _det() -> Detections:
    rows = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
    return detections_from_rows(rows, fx.SOURCE_LABEL)


@dataclass
class _Episode:
    det: Detections
    box: tuple[float, float, float, float]


class TerraMorningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.det = _det()
        cls.ratios = T.fit_terra_ratios([_Episode(cls.det, fx.TEST_BOX)], "the synthetic fixture (test only)")
        window = (float(cls.det.time_s.min()), float(cls.det.time_s.max()) + 1.0)
        cls.report = T.run_terra_test(cls.det, fx.TEST_BOX, window, T.base_params(OccupancyParams()), cls.ratios)

    def test_only_terra_day_overpasses_are_scored(self) -> None:
        passes = group_overpasses(self.det)
        self.assertEqual(sum(T.is_terra_morning(p) for p in passes), 3)
        self.assertEqual(self.report["scored_overpasses"], 3)
        self.assertEqual({t["platform"] for t in self.report["targets"]}, {"MODIS_TERRA"})
        self.assertTrue(all(t["is_day"] for t in self.report["targets"]))
        self.assertEqual(self.report["hidden_instrument"], "MODIS")
        self.assertEqual(set(self.report["methods"]), {"painted_viirs", "viirs_ratio", "reconstruction"})

    def test_no_modis_row_reaches_a_method(self) -> None:
        seen: dict[str, Detections] = {}

        class Spy(T.PaintedViirs):
            name = "spy"

            def __init__(self, visible: Detections, grid: EvalGrid) -> None:
                seen["visible"] = visible
                super().__init__(visible, grid)

        from backend.eval.blind_test import run_blind_test

        run_blind_test(self.det, fx.TEST_BOX, [Spy], hidden="MODIS", target_filter=T.is_terra_morning, reference_method="spy")
        self.assertEqual(int(seen["visible"].is_modis.sum()), 0)
        self.assertGreater(len(seen["visible"]), 0)

    def test_ratios_are_terra_over_nearest_viirs(self) -> None:
        r = self.ratios
        self.assertEqual(r.n_pairs, 3)
        self.assertGreater(r.frp, 0.0)
        self.assertLess(r.pixels, 1.0)           # a 1 km pixel holds several 375 m pixels
        self.assertLessEqual(r.pixels_p05, r.pixels_p95)
        base = self.report["methods"]["painted_viirs"]["pixel_count"]["sum_predicted"]
        scaled = self.report["methods"]["viirs_ratio"]["pixel_count"]["sum_predicted"]
        self.assertAlmostEqual(scaled, r.pixels * base, delta=0.02)

    def test_direction_specific_numbers_are_reset(self) -> None:
        fitted_like = OccupancyParams(count_scale_day=0.5, count_scale_night=1.6, smolder_night=0.4, frp_scale=0.5, tau_res_h=9.0)
        p = T.base_params(fitted_like)
        self.assertEqual((p.count_scale_day, p.count_scale_night, p.smolder_night, p.frp_scale, p.hidden_pixel_scale), (1.0, 1.0, 0.0, 1.0, 1.0))
        self.assertEqual(p.tau_res_h, 9.0)       # the fire dynamics are kept

    def test_a_coarse_pixel_is_flagged_by_the_power_inside_its_footprint(self) -> None:
        grid = EvalGrid.from_bbox(fx.TEST_BOX)
        recon = OccupancyReconstruction(grid, self.det.select(self.det.is_viirs), T.base_params(OccupancyParams()))
        t = float(recon.times[5])
        out = recon.predict_hidden(t, "MODIS", True, 1.0, track_km=1.0, scan_km=1.0)
        self.assertTrue(np.all((out["p_detect"] >= 0.0) & (out["p_detect"] <= 1.0)))
        fine = recon.predict_hidden(t, "VIIRS", True, 0.14, track_km=0.375, scan_km=0.375)
        # a 1 km footprint reaches cells around the fire line that a 375 m pixel does not
        self.assertGreater(int((out["p_detect"] > 0.05).sum()), int((fine["p_detect"] > 0.05).sum()))
        # at the swath edge the detection limit is about 40 MW: the same fire is less likely to be flagged
        edge = recon.predict_hidden(t, "MODIS", True, 9.6, track_km=2.0, scan_km=4.8)
        self.assertLess(float(edge["p_detect"].max()), float(out["p_detect"].max()))
        self.assertAlmostEqual(float(_box_sum(np.ones((6, 7)), 3, 3)[2, 3]), 9.0)
        self.assertAlmostEqual(float(_box_sum(np.ones((6, 7)), 2, 4).max()), 8.0)      # an even window still holds 2 by 4 cells
        self.assertEqual(_box_sum(np.ones((6, 7)), 2, 4).shape, (6, 7))

    def test_tracked_result_says_what_it_is(self) -> None:
        doc = json.loads((fitted.FITTED_DIR / T.TERRA_FILE).read_text(encoding="utf-8"))
        for key in ("adopted", "status", "decision", "rule", "parameters", "ratios", "trained_on", "validated_on", "evidence"):
            self.assertIn(key, doc)
        self.assertIn(doc["status"], ("on", "experimental"))
        v = doc["evidence"]["validation"]["verdict"]
        self.assertEqual(v["baselines"], ["painted_viirs", "viirs_ratio"])
        if doc["status"] == "on":
            self.assertTrue(all(row["class"] == "ahead" for row in v["scores"].values()))
        self.assertIn("test fires excluded", doc["trained_on"])
        params, ratios = T.load_terra()
        self.assertEqual(params.smolder_night, 0.0)
        self.assertEqual(ratios.n_pairs, doc["ratios"]["n_pairs"])


if __name__ == "__main__":
    unittest.main()
