"""Benchmark gates are computed from backend values or marked as design targets (CONTRACT, batch 2)."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.model import gates  # noqa: E402
from backend.model.sensor_physics import build_sensor_model_diagnostics  # noqa: E402

OLD_LITERALS = ("0.082 dex", "0.274 dex", "-48.2%", "-31.8%", "90.6%", "1.4%", "step_ratio = 1.02")


class GateBuilderTests(unittest.TestCase):
    def _paired(self) -> dict:
        return {"raw_overall_rmse_dex": 0.12, "harmonized_overall_rmse_dex": 0.09, "n_pairs": 96}

    def test_every_gate_has_a_kind_and_no_design_target_passes(self) -> None:
        for run_metrics in (None, {"step_2012_harmonized_ratio": 1.0, "step_2012_raw_ratio": 4.0,
                                   "empirical_90_coverage_pct": 90.0, "step_2012_coobs_frames": 6}):
            for g in gates.build_benchmark_gates(self._paired(), run_metrics):
                with self.subTest(gate=g["gate_id"], run=run_metrics is not None):
                    self.assertIn(g["kind"], ("computed", "design_target"))
                    self.assertIn(g["status"], gates.GATE_STATUS)
                    if g["kind"] == "design_target":
                        self.assertNotEqual(g["status"], "PASSED")
                    self.assertTrue(g["criterion"])
                    for lit in OLD_LITERALS:
                        self.assertNotIn(lit, g["metric"])

    def test_g3_follows_the_paired_rmses(self) -> None:
        g3 = {g["gate_id"]: g for g in gates.build_benchmark_gates(self._paired())}["G3_PAIRED_RESIDUAL"]
        self.assertEqual(g3["kind"], "computed")
        self.assertEqual(g3["status"], "PASSED")
        self.assertEqual(g3["inputs"]["raw_rmse_dex"], 0.12)
        self.assertEqual(g3["inputs"]["harmonized_rmse_dex"], 0.09)
        worse = {**self._paired(), "harmonized_overall_rmse_dex": 0.15}
        g3b = {g["gate_id"]: g for g in gates.build_benchmark_gates(worse)}["G3_PAIRED_RESIDUAL"]
        self.assertEqual(g3b["status"], "FAILED")

    def test_g1_and_g5_come_from_run_metrics(self) -> None:
        def by_id(m: dict | None) -> dict:
            return {g["gate_id"]: g for g in gates.build_benchmark_gates(self._paired(), m)}

        ok = by_id({"step_2012_harmonized_ratio": 1.04, "step_2012_raw_ratio": 4.2,
                    "empirical_90_coverage_pct": 89.9, "step_2012_coobs_frames": 5}, )
        self.assertEqual(ok["G1_2012_CONTINUITY"]["status"], "PASSED")
        self.assertEqual(ok["G5_CONFORMAL_COVERAGE"]["status"], "PASSED")
        self.assertIn("1.04", ok["G1_2012_CONTINUITY"]["metric"])
        self.assertIn("89.9", ok["G5_CONFORMAL_COVERAGE"]["metric"])
        bad = by_id({"step_2012_harmonized_ratio": 0.62, "step_2012_raw_ratio": 4.2,
                     "empirical_90_coverage_pct": 70.0, "step_2012_coobs_frames": 5})
        self.assertEqual(bad["G1_2012_CONTINUITY"]["status"], "FAILED")
        self.assertEqual(bad["G5_CONFORMAL_COVERAGE"]["status"], "FAILED")
        no_coobs = by_id({"step_2012_harmonized_ratio": 1.03, "step_2012_raw_ratio": 4.2,
                          "empirical_90_coverage_pct": 90.0, "step_2012_coobs_frames": 0})
        self.assertEqual(no_coobs["G1_2012_CONTINUITY"]["status"], "NOT_EVALUATED")
        no_run = by_id(None)
        for gid in ("G1_2012_CONTINUITY", "G5_CONFORMAL_COVERAGE"):
            self.assertEqual(no_run[gid]["kind"], "computed")
            self.assertEqual(no_run[gid]["status"], "NOT_EVALUATED")

    def test_split_conformal_coverage(self) -> None:
        rng = np.random.default_rng(1)
        res = rng.normal(0.0, 0.05, size=400)
        cov = gates.split_conformal_coverage(res, level=0.9)
        self.assertTrue(0.84 <= cov <= 0.96, cov)


class SensorModelDiagnosticsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.diag = build_sensor_model_diagnostics()

    def test_static_gates_are_honest(self) -> None:
        ids = {g["gate_id"]: g for g in self.diag["benchmark_gates"]}
        self.assertEqual(set(ids), {"G1_2012_CONTINUITY", "G2_BOWTIE_FLUX_CONSERVATION", "G3_PAIRED_RESIDUAL",
                                    "G4_SPATIOTEMPORAL_ASSIMILATION", "G5_CONFORMAL_COVERAGE"})
        self.assertEqual(ids["G2_BOWTIE_FLUX_CONSERVATION"]["kind"], "design_target")
        self.assertEqual(ids["G4_SPATIOTEMPORAL_ASSIMILATION"]["kind"], "design_target")
        self.assertEqual(ids["G3_PAIRED_RESIDUAL"]["kind"], "computed")
        self.assertNotIn("PASSED", [ids[k]["status"] for k in ("G1_2012_CONTINUITY", "G5_CONFORMAL_COVERAGE")])
        blob = json.dumps(self.diag["benchmark_gates"])
        for lit in OLD_LITERALS:
            self.assertNotIn(lit, blob)

    def test_paired_coverage_is_computed_from_the_samples(self) -> None:
        paired = self.diag["paired_1330_calibration"]
        res = np.array([s["harmonized_log10_ratio"] for s in paired["paired_samples"]])
        expect = round(gates.split_conformal_coverage(res, level=0.9), 3)
        self.assertEqual(paired["conformal_90pct_empirical_coverage"], expect)
        g3 = {g["gate_id"]: g for g in self.diag["benchmark_gates"]}["G3_PAIRED_RESIDUAL"]
        self.assertEqual(g3["inputs"]["raw_rmse_dex"], paired["raw_overall_rmse_dex"])
        self.assertEqual(g3["inputs"]["harmonized_rmse_dex"], paired["harmonized_overall_rmse_dex"])


if __name__ == "__main__":
    unittest.main()
