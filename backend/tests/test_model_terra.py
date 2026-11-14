"""Terra's morning pass from VIIRS alone (backend/model/terra_morning.py), on the SYNTHETIC fixture."""

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
        self.assertIn("2021", doc["trained_on"])                 # it says the year of the test fires is left out
        params, ratios = T.load_terra()
        self.assertEqual(params.smolder_night, 0.0)
        self.assertEqual(ratios.n_pairs, doc["ratios"]["n_pairs"])


def _reader(rows):
    from backend.eval.rows import parse_acq_time_s
    from backend.model.real_run import parse_start_s

    def read(box, start, end, platforms=None):
        t0, t1 = parse_start_s(str(start)), parse_start_s(str(end))
        w, s, e, n = box
        return [dict(r) for r in rows if t0 <= parse_acq_time_s(r["acq_date"], r["acq_time"]) < t1
                and w <= float(r["longitude"]) <= e and s <= float(r["latitude"]) <= n]

    return read


class TerraUnderThePassListTests(unittest.TestCase):
    """The direction under the protocol in use, on the synthetic fixture with its made-up pass list: MODIS is the
    hidden instrument, so MODIS rows are deleted and altered here and nothing that is fixed before scoring may move."""

    @classmethod
    def setUpClass(cls) -> None:
        from backend.model.real_blind import pick_window

        cls.reader = staticmethod(fx.fixture_pass_reader())
        cls.rows = fx.extended_rows()
        cls.cases = {
            "every MODIS row removed": [r for r in cls.rows if r["instrument"] != "MODIS"],
            "MODIS rows moved, scaled, a third deleted": fx.perturb_hidden(cls.rows, instrument="MODIS", dlon=0.02, dlat=-0.015, frp_times=3.7, drop_every=3),
            "MODIS pixel sizes changed": fx.perturb_hidden(cls.rows, instrument="MODIS", scan="2.80", track="1.60"),
        }
        cls.pick = staticmethod(lambda rows: pick_window(detections_from_rows(rows, fx.SOURCE_LABEL), fx.TEST_BOX, 0.0, 1e12, n=6, hidden="MODIS"))
        cls.window = cls.pick(cls.rows)
        cls.ratios = T.TerraRatios(1.0, 0.2, 3.0, 0.2, 0.05, 1.0, 3, "made up for the test")

        def run(rows):
            det = detections_from_rows(rows, fx.SOURCE_LABEL)
            return T.run_terra_test(det, fx.TEST_BOX, T.span_of(cls.window), T.base_params(OccupancyParams()), cls.ratios,
                                    schedule="cmr", read_passes=cls.reader)

        cls.blind = staticmethod(run)
        cls.report = run(cls.rows)

    def test_every_terra_day_pass_of_the_list_is_a_scored_look_fire_or_not(self) -> None:
        r = self.report
        self.assertEqual((r["schedule"]["source"], r["protocol"]["version"]), ("cmr", 3))
        slots = r["schedule"]["slots"]
        self.assertGreater(len(slots), 2)
        self.assertEqual({s["platform"] for s in slots}, {"MODIS_TERRA"})
        self.assertTrue(all(s["is_day"] for s in slots))
        self.assertEqual(r["scored_overpasses"], len(slots))                 # every look, also one that flagged nothing
        self.assertEqual(r["hidden_instrument"], "MODIS")
        self.assertEqual(r["scored_platform"], "MODIS_TERRA, day side (the morning pass)")

    def test_nothing_published_moves_with_the_hidden_modis_rows(self) -> None:
        want_pub, want_schedule = self.report["published"], self.report["schedule"]
        self.assertGreater(max(p["predicted_cells"] for p in want_pub["reconstruction"]), 0)
        for name, rows in self.cases.items():
            other = self.blind(rows)
            self.assertEqual(other["published"], want_pub, name)
            self.assertEqual(other["schedule"], want_schedule, name)
        gone = self.blind(self.cases["every MODIS row removed"])
        self.assertEqual(gone["hidden_rows_in_test_box"], 0)                 # and the scores do move
        self.assertGreater(self.report["hidden_rows_in_test_box"], 0)

    def test_the_window_and_the_span_come_from_viirs_rows_alone(self) -> None:
        from backend.model.episodes import PAD_S

        for name, rows in self.cases.items():
            w = self.pick(rows)
            self.assertEqual((w.start_s, w.end_s, w.viirs_pixels_in_box), (self.window.start_s, self.window.end_s, self.window.viirs_pixels_in_box), name)
        self.assertEqual(self.window.n_modis, 0)
        self.assertIn("VIIRS rows only", self.window.chosen_from)
        self.assertEqual(T.span_of(self.window), (self.window.start_s - PAD_S, self.window.end_s + PAD_S))

    def test_episodes_of_this_direction_are_chosen_with_modis_dropped(self) -> None:
        from backend.model.episodes import find_episodes
        from backend.terrain.live_region import PRESET_BY_ID

        def found(rows):
            eps = find_episodes((2099,), _reader(rows), lambda r: fx.CONTEXT_BOX, PRESET_BY_ID, regions=("plumas_ca",),
                                hidden="MODIS", min_visible_pixels=40, overpasses=6)
            return [(e.key, e.box, e.window.start_s, e.window.end_s, e.window.viirs_pixels_in_box, e.window.chosen_from) for e in eps]

        want = found(self.rows)
        self.assertGreater(len(want), 0)
        self.assertIn("MODIS is hidden and was dropped before choosing", want[0][5])
        for name, rows in self.cases.items():
            self.assertEqual(found(rows), want, name)
        # the other direction is unchanged: chosen from MODIS rows, as before
        modis = find_episodes((2099,), _reader(self.rows), lambda r: fx.CONTEXT_BOX, PRESET_BY_ID, regions=("plumas_ca",), min_modis_pixels=40)
        self.assertTrue(all("MODIS rows only" in e.window.chosen_from for e in modis))

    def test_the_baseline_s_ratios_are_fitted_on_the_looks_the_protocol_scores(self) -> None:
        """Terra over the painted VIIRS pass, summed over every scored look, the empty ones included."""
        r = T.ratios_from_reports([self.report], "the synthetic fixture (test only)")
        rows = self.report["methods"]["painted_viirs"]["per_overpass"]
        truth = self.report["targets"]
        self.assertEqual(r.n_pairs, sum(1 for po in rows if po["predicted_pixels"]))
        self.assertAlmostEqual(r.pixels, sum(t["hidden_pixels_in_test_box"] for t in truth) / sum(po["predicted_pixels"] for po in rows), places=12)
        self.assertAlmostEqual(r.frp, sum(t["hidden_frp_mw"] for t in truth) / sum(po["predicted_frp_mw"] for po in rows), places=9)
        self.assertLessEqual(r.pixels_p05, r.pixels_p95)
        self.assertIn("every scored look", r.as_dict()["definition"])

    def test_no_year_of_a_test_fire_is_fitted_or_validated_on(self) -> None:
        from backend.model.calendar_ratio import years_of_test_fires

        closed = {y for region in T.REGIONS for y in years_of_test_fires(region)}
        self.assertEqual(closed, {2021})
        for split in ("train", "validation"):
            self.assertFalse(closed & set(T.terra_years(split)), split)
        with self.assertRaises(ValueError):
            T.refuse_closed_years((2020, 2021))


class TrackedTerraResultTests(unittest.TestCase):
    """The tracked result of the direction: measured under the protocol in use, and it says so."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.doc = json.loads((fitted.FITTED_DIR / T.TERRA_FILE).read_text(encoding="utf-8"))

    def test_it_was_measured_under_the_protocol_in_use(self) -> None:
        p = self.doc["protocol"]
        self.assertEqual((p["version"], p["looks"]), (3, "cmr"))
        self.assertIn("VIIRS rows only", p["episodes_chosen_from"])
        self.assertEqual(self.doc["training_years"], list(T.terra_years("train")))
        self.assertNotIn(2021, self.doc["training_years"] + self.doc["validation_years"])
        self.assertGreater(self.doc["evidence"]["validation"]["scored_terra_overpasses"], 0)
        self.assertGreater(self.doc["empty_looks"]["validation"]["no_hidden_pixel_in_the_box"], -1)

    def test_what_it_says_follows_from_its_own_verdict(self) -> None:
        v = self.doc["evidence"]["validation"]["verdict"]
        c = v["classes"]
        self.assertEqual(self.doc["adopted"], c["behind"] == 0 and c["ahead"] >= 1)
        self.assertIn(f"ahead of both baselines on {c['ahead']} of {sum(c.values())} scores", self.doc["decision"])
        self.assertEqual(v["classes_counted_by"], "judged with an interval")
        if self.doc["status"] == "on":
            self.assertTrue(self.doc["adopted"])

    def test_the_earlier_measurement_is_kept_and_labelled(self) -> None:
        was = self.doc["measured_before"]
        self.assertEqual(was["protocol_version"], 1)
        self.assertIn("not blind", was["note"])
        self.assertIn("4 of 7", was["decision"])

    def test_the_interval_is_one_sided_when_its_lower_end_is_zero(self) -> None:
        iv = self.doc["intervals"]
        for part in ("frp", "pixels"):
            if iv[part]["lo"] == 0.0:
                self.assertTrue(iv[part]["one_sided"])


if __name__ == "__main__":
    unittest.main()
