"""The blind-test protocol and the two baselines, on the synthetic fixture (backend/eval)."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.baselines import (  # noqa: E402
    PaintedModis,
    fit_overlap_ratio,
    overlap_pairs,
    overlap_ratio_factory,
    painted_modis_factory,
)
from backend.eval.blind_test import (  # noqa: E402
    Prediction,
    Target,
    bootstrap_verdict,
    format_report,
    pool_reports,
    run_blind_test,
    split_hidden,
    verdict,
)
from backend.eval.grid import EvalGrid, paint  # noqa: E402
from backend.eval.overpass import group_overpasses  # noqa: E402
from backend.eval.rows import Detections, detections_from_rows, read_csv_rows  # noqa: E402


def _fixture() -> Detections:
    rows = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
    return detections_from_rows(rows, fx.SOURCE_LABEL)


class _Oracle:
    """Test-only method that is handed the hidden rows on purpose, to prove a perfect answer scores as perfect."""

    name = "oracle"
    label = "test oracle (sees the hidden rows; not a method)"

    def __init__(self, hidden: Detections, grid: EvalGrid) -> None:
        self.grid = grid
        self.hidden = hidden.select(hidden.in_box(grid.bbox))
        self.passes = group_overpasses(self.hidden)

    def predict(self, target: Target) -> Prediction:
        # the hidden overpass of the slot's platform nearest in time (a slot is a nominal time, not the pass's own)
        match = sorted((abs(p.time_s - target.time_s), i) for i, p in enumerate(self.passes) if p.platform == target.platform)
        if not match or match[0][0] > 3.0 * 3600.0:
            z = np.zeros(self.grid.shape)
            return Prediction(z, z.copy(), 0.0, 0.0, 0.0, 0.9)
        p = paint(self.grid, self.hidden.select(self.passes[match[0][1]].index))
        return Prediction(p.mask.astype(float), p.frp_mw, p.frp_total_mw, 0.9 * p.frp_total_mw, 1.1 * p.frp_total_mw, 0.9)


class BlindTestProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.det = _fixture()
        cls.fit = fit_overlap_ratio(cls.det, trained_on="the synthetic fixture itself (test only)")
        _, hidden = split_hidden(cls.det, "VIIRS")

        def oracle_factory(visible: Detections, grid: EvalGrid) -> _Oracle:
            return _Oracle(hidden, grid)

        cls.report = run_blind_test(
            cls.det, fx.TEST_BOX, [painted_modis_factory, overlap_ratio_factory(cls.fit), oracle_factory]
        )

    def test_methods_are_built_from_visible_rows_only(self) -> None:
        seen: dict[str, Detections] = {}

        class _Spy(PaintedModis):
            name = "spy"

            def __init__(self, visible: Detections, grid: EvalGrid) -> None:
                seen["visible"] = visible
                super().__init__(visible, grid)

        run_blind_test(self.det, fx.TEST_BOX, [_Spy])
        self.assertEqual(int(seen["visible"].is_viirs.sum()), 0)
        self.assertEqual(len(seen["visible"]), int(self.det.is_modis.sum()))
        run_blind_test(self.det, fx.TEST_BOX, [_Spy], hidden="MODIS")
        self.assertEqual(int(seen["visible"].is_modis.sum()), 0)

    def test_scored_overpasses_include_one_that_found_nothing_in_the_test_box(self) -> None:
        r = self.report
        self.assertEqual(r["scored_overpasses"], 13)
        self.assertEqual(r["scored_overpasses_with_hidden_detections_in_test_box"], 12)
        empty = [t for t in r["targets"] if t["hidden_pixels_in_test_box"] == 0]
        self.assertEqual(len(empty), 1)
        self.assertEqual(empty[0]["hidden_pixels_in_context_box"], 1)
        self.assertEqual(empty[0]["truth_cells"], 0)
        self.assertEqual(r["hidden_rows_in_test_box"], 228)
        self.assertEqual(r["visible_rows_in_test_box"], 44)

    def test_a_perfect_answer_scores_as_perfect(self) -> None:
        o = self.report["methods"]["oracle"]
        self.assertEqual(o["strict_375m"]["hit_rate"], 1.0)
        self.assertEqual(o["strict_375m"]["false_alarm_ratio"], 0.0)
        self.assertEqual(o["strict_375m"]["csi"], 1.0)
        self.assertAlmostEqual(o["frp_total"]["ratio_of_sums"], 1.0, places=9)
        self.assertEqual(o["frp_total"]["median_abs_relative_error"], 0.0)
        self.assertEqual(o["interval"]["coverage"], 1.0)
        self.assertEqual(o["brier"], 0.0)

    def test_painted_baseline_scores_are_pinned(self) -> None:
        # Pinned so a change to a metric definition or to the painting rule cannot pass unnoticed.
        p = self.report["methods"]["painted_modis"]
        s = p["strict_375m"]
        self.assertEqual({k: s[k] for k in ("tp", "fp", "fn", "tn")}, PINNED_PAINTED_COUNTS)
        self.assertEqual(s["tp"] + s["fp"] + s["fn"] + s["tn"], 13 * 118 * 113)
        self.assertIsNone(p["interval"]["coverage"])
        self.assertLess(s["hit_rate"], 1.0)
        self.assertGreater(s["false_alarm_ratio"], 0.0)

    def test_overlap_ratio_changes_frp_and_not_cells(self) -> None:
        p = self.report["methods"]["painted_modis"]
        q = self.report["methods"]["overlap_ratio"]
        for k in ("tp", "fp", "fn", "tn"):
            self.assertEqual(p["strict_375m"][k], q["strict_375m"][k])
        self.assertAlmostEqual(
            q["frp_total"]["sum_predicted_mw"], self.fit.ratio * p["frp_total"]["sum_predicted_mw"], delta=0.01
        )
        self.assertEqual(q["interval"]["stated_level"], 0.9)
        self.assertEqual(q["interval"]["n"], 13)

    def test_overlap_ratio_fit_is_sum_of_viirs_over_sum_of_modis_on_pairs(self) -> None:
        pairs = overlap_pairs(self.det)
        self.assertEqual(self.fit.n_pairs, len(pairs))
        self.assertGreater(len(pairs), 3)
        for m, v in pairs:
            self.assertEqual((m.family, v.family), ("MODIS", "VIIRS"))
            self.assertLessEqual(abs(m.time_s - v.time_s), 90 * 60)
        v_sum = sum(float(self.det.frp_mw[v.index].sum()) for _, v in pairs)
        m_sum = sum(float(self.det.frp_mw[m.index].sum()) for m, _ in pairs)
        self.assertAlmostEqual(self.fit.ratio, v_sum / m_sum, places=9)
        self.assertLessEqual(self.fit.ratio_p05, self.fit.ratio_p50)
        self.assertLessEqual(self.fit.ratio_p50, self.fit.ratio_p95)
        # no VIIRS pass is paired twice
        self.assertEqual(len({id(v) for _, v in pairs}), len(pairs))

    def test_baselines_do_not_react_to_the_hidden_rows(self) -> None:
        d = self.det
        scrambled = Detections(
            lat=d.lat, lon=d.lon, time_s=d.time_s,
            frp_mw=np.where(d.is_viirs, d.frp_mw * 7.0, d.frp_mw),
            scan_km=d.scan_km, track_km=d.track_km, platform_code=d.platform_code, is_day=d.is_day,
            confidence=d.confidence, confidence_class=d.confidence_class, type_code=d.type_code,
            row_index=d.row_index, source=d.source,
        )
        r2 = run_blind_test(scrambled, fx.TEST_BOX, [painted_modis_factory])
        a = [o["predicted_frp_mw"] for o in self.report["methods"]["painted_modis"]["per_overpass"]]
        b = [o["predicted_frp_mw"] for o in r2["methods"]["painted_modis"]["per_overpass"]]
        self.assertEqual(a, b)
        self.assertAlmostEqual(r2["methods"]["painted_modis"]["frp_total"]["sum_hidden_mw"],
                               7.0 * self.report["methods"]["painted_modis"]["frp_total"]["sum_hidden_mw"], delta=0.05)

    def test_report_states_its_source_and_definitions_and_is_json(self) -> None:
        r = self.report
        self.assertEqual(r["source"], fx.SOURCE_LABEL)
        self.assertEqual(r["hidden_instrument"], "VIIRS")
        for key in ("hit_rate", "false_alarm_ratio", "false_alarm_rate", "frp_total_error", "interval_coverage", "truth"):
            self.assertIn(key, r["definitions"])
        text = json.dumps(r)
        self.assertNotIn("NaN", text)
        table = format_report(r)
        self.assertIn("painted_modis", table)
        self.assertIn("synthetic fixture", table)

    def test_verdict_is_computed_score_by_score(self) -> None:
        v = verdict(self.report, method="oracle")
        self.assertTrue(v["beats_every_baseline_on_every_score"])
        self.assertEqual(v["scores"]["brier"]["better_is"], "lower")
        # a baseline against itself never "beats" (a tie is not a win)
        tie = verdict(self.report, method="painted_modis", baselines=("painted_modis",))
        self.assertEqual(tie["beats_every_baseline_on"], 0)
        self.assertFalse(verdict(self.report, method="absent")["evaluated"])
        # the count of scores ahead says what kind of count it is: one report, nothing to resample
        from backend.eval.blind_test import COUNT_KINDS, COUNTED_PLAIN

        self.assertEqual(v["counted_by"], COUNTED_PLAIN)
        self.assertEqual(COUNTED_PLAIN, "plain comparison")
        self.assertIn("no allowance for noise", COUNT_KINDS[COUNTED_PLAIN])

    def test_pooling_one_report_changes_no_score(self) -> None:
        pooled = pool_reports([self.report])
        for name in ("painted_modis", "overlap_ratio", "oracle"):
            a, b = self.report["methods"][name], pooled["methods"][name]
            for block in ("strict_375m", "tolerant_1_cell", "equal_area"):
                for k in ("tp", "fp", "fn", "tn", "hit_rate", "csi"):
                    self.assertEqual(a[block][k], b[block][k])
            self.assertAlmostEqual(a["brier"], b["brier"], places=12)
            self.assertAlmostEqual(a["frp_total"]["ratio_of_sums"], b["frp_total"]["ratio_of_sums"], places=3)
            self.assertEqual(a["interval"]["covered"], b["interval"]["covered"])
        two = pool_reports([self.report, self.report])
        self.assertEqual(two["scored_overpasses"], 2 * self.report["scored_overpasses"])
        self.assertEqual(two["methods"]["painted_modis"]["strict_375m"]["tp"], 2 * PINNED_PAINTED_COUNTS["tp"])
        self.assertAlmostEqual(two["methods"]["painted_modis"]["strict_375m"]["csi"], self.report["methods"]["painted_modis"]["strict_375m"]["csi"])

    def test_bootstrap_verdict_separates_a_lead_from_a_tie(self) -> None:
        # a method identical to a baseline can never be "ahead" however the fires are resampled
        tie = bootstrap_verdict([self.report, self.report, self.report], method="overlap_ratio", baselines=("painted_modis",), n_boot=200)
        for key in ("csi_strict_375m", "csi_one_cell_tolerance", "brier"):
            self.assertEqual(tie["scores"][key]["class"], "tie")
        lead = bootstrap_verdict([self.report, self.report, self.report], method="oracle", n_boot=200)
        for key in ("csi_strict_375m", "csi_one_cell_tolerance", "brier", "frp_median_abs_relative_error"):
            self.assertEqual(lead["scores"][key]["class"], "ahead")
        self.assertEqual(lead["classes"]["behind"], 0)
        self.assertEqual(lead["bootstrap"]["resampled"], "whole runs, with replacement")
        # two counts, two kinds: the classes are judged with an interval, the pooled count is a plain comparison
        from backend.eval.blind_test import COUNT_KINDS, COUNTED_INTERVAL, COUNTED_PLAIN

        self.assertEqual((lead["classes_counted_by"], lead["counted_by"]), (COUNTED_INTERVAL, COUNTED_PLAIN))
        self.assertEqual(COUNTED_INTERVAL, "judged with an interval")
        self.assertIn("resampled", COUNT_KINDS[COUNTED_INTERVAL])
        self.assertEqual(set(COUNT_KINDS), {COUNTED_PLAIN, COUNTED_INTERVAL})

    def test_hiding_one_viirs_platform_keeps_the_other_visible(self) -> None:
        seen: dict[str, Detections] = {}

        class _Spy(PaintedModis):
            name = "spy"

            def __init__(self, visible: Detections, grid: EvalGrid) -> None:
                seen["visible"] = visible
                super().__init__(visible, grid)

        r = run_blind_test(self.det, fx.TEST_BOX, [_Spy], hidden_platforms=("VIIRS_NOAA20",), reference_method="spy")
        names = set(seen["visible"].platform_names())
        self.assertNotIn("VIIRS_NOAA20", names)
        self.assertIn("VIIRS_SNPP", names)
        self.assertIn("MODIS_AQUA", names)
        self.assertEqual({t["platform"] for t in r["targets"]}, {"VIIRS_NOAA20"})
        self.assertEqual(r["hidden_platforms"], ["VIIRS_NOAA20"])
        self.assertEqual(r["scored_overpasses"], 6)

    def test_window_limits_the_scored_overpasses(self) -> None:
        t0 = float(self.det.time_s.min())
        r = run_blind_test(self.det, fx.TEST_BOX, [painted_modis_factory], window=(t0, t0 + 86400.0))
        self.assertEqual(r["scored_overpasses"], 4)


# strict 375 m counts of the painted MODIS baseline on the synthetic fixture
PINNED_PAINTED_COUNTS: dict[str, int] = {"tp": 180, "fp": 334, "fn": 75, "tn": 172753}


if __name__ == "__main__":
    unittest.main()
