"""A reconstruct run built from FIRMS-schema rows keeps today's payload shape (backend/model/real_run.py).

The rows here are the SYNTHETIC fixture, fed through a stand-in reader. No real NASA row is used by any test.
"""

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
from backend.eval.baselines import fit_overlap_ratio  # noqa: E402
from backend.eval.rows import detections_from_rows, parse_acq_time_s, read_csv_rows  # noqa: E402
from backend.model.calendar_ratio import CalendarRatio  # noqa: E402
from backend.model.calibrator import get_pretrained_calibrator  # noqa: E402
from backend.model.occupancy import OccupancyParams  # noqa: E402
from backend.model.real_blind import pick_window, window_from_start  # noqa: E402
from backend.model.real_run import SolvedRealRun, parse_start_s, real_response, solve_real_reconstruction  # noqa: E402
from backend.model.solver import SolvedReconstructionRun, solve_region_reconstruction  # noqa: E402
from backend.model.training import EXCLUSIONS, excluded_mask  # noqa: E402
from backend.terrain.live_region import PRESET_BY_ID, LoadedRegionTerrain  # noqa: E402

ROWS = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
SOURCE = fx.SOURCE_LABEL


def _terrain() -> LoadedRegionTerrain:
    dem = np.full((256, 256), 900.0, dtype=np.float32)
    return LoadedRegionTerrain(
        spec=PRESET_BY_ID["plumas_ca"], dem_m=dem, dem_f32_bytes=dem.tobytes(), dem_hires_f32_bytes=b"",
        satellite_bytes=b"", satellite_content_type="image/jpeg", terrain_source="flat_test_dem",
        min_elev_m=900.0, max_elev_m=900.0, mean_elev_m=900.0, duration_ms=0.0,
    )


def _reader(rows):
    def read(box, start, end, platforms=None):
        t0, t1 = parse_start_s(str(start)), parse_start_s(str(end))
        w, s, e, n = box
        out = []
        for r in rows:
            t = parse_acq_time_s(r["acq_date"], r["acq_time"])
            if t0 <= t < t1 and w <= float(r["longitude"]) <= e and s <= float(r["latitude"]) <= n:
                out.append(dict(r))
        return out

    return read


def _solve(holdout, rows=ROWS, start="2099-07-01"):
    fit = fit_overlap_ratio(detections_from_rows(ROWS, SOURCE), trained_on="the synthetic fixture (test only)")
    return solve_real_reconstruction(
        _terrain(), start, holdout_viirs=holdout == "viirs", read_firms=_reader(rows), context_box=fx.CONTEXT_BOX,
        ratio_fit=fit, row_source=SOURCE, params=OccupancyParams(), learned_parts=[{"name": "reconstruction parameters", "status": "not learned"}],
        count_ratio=CalendarRatio("plumas_ca", 4.0, 3.0, 5.0, 4.0, 2099, (2098,), "test_ratio"),
    )


class RealRunShapeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.held = _solve("viirs")
        cls.both = _solve(None)
        cls.sim = solve_region_reconstruction(_terrain(), holdout_viirs=True, calibrator=get_pretrained_calibrator())

    def test_it_is_a_run_the_server_can_store_like_a_simulated_one(self) -> None:
        self.assertIsInstance(self.held, SolvedReconstructionRun)
        self.assertIsInstance(self.held, SolvedRealRun)
        self.assertEqual(self.held.tensor_u8.shape, (24, 256, 256, 4))
        self.assertEqual(len(self.held.reconstruction_u8_bytes), len(self.sim.reconstruction_u8_bytes))
        self.assertEqual(self.held.cell_area_km2.shape, self.sim.cell_area_km2.shape)
        self.assertTrue(self.held.export_csv_bytes.startswith(b"lon,lat,z_hat_mw_km2,sigma_mw_km2,ci90_low,ci90_high,epoch_peak"))
        json.loads(self.held.export_geojson_bytes.decode("utf-8"))

    def test_every_key_of_the_simulated_payload_is_present(self) -> None:
        real = real_response(self.held, {})
        sim = {
            "run_id": self.sim.run_id, "provenance": self.sim.provenance, "downloaded_firms_rows": 0, "region": {},
            "assets": {}, "pipeline_stages": self.sim.pipeline_stages, "metrics": self.sim.metrics,
            "epoch_summaries": self.sim.epoch_summaries, "observer_passes": self.sim.observer_passes,
        }
        pairs = [
            (real, sim),
            (real["metrics"], sim["metrics"]),
            (real["observer_passes"], sim["observer_passes"]),
            (real["observer_passes"]["frames"][0], sim["observer_passes"]["frames"][0]),
            (real["observer_passes"]["frames"][0]["passes"][0], sim["observer_passes"]["frames"][0]["passes"][0]),
            (real["epoch_summaries"][0], sim["epoch_summaries"][0]),
            (real["pipeline_stages"][0], sim["pipeline_stages"][0]),
        ]
        for r, s in pairs:
            self.assertEqual([k for k in s if k not in r], [])
        self.assertEqual([st["stage_id"] for st in real["pipeline_stages"]], [st["stage_id"] for st in sim["pipeline_stages"]])
        self.assertEqual(real["observer_passes"]["footprint_schema"], sim["observer_passes"]["footprint_schema"])
        self.assertEqual(len(real["observer_passes"]["frames"]), 24)
        self.assertEqual(len(real["epoch_summaries"]), 24)
        text = json.dumps(real)
        self.assertNotIn("NaN", text)
        self.assertNotIn("Infinity", text)

    def test_metrics_the_page_formats_are_numbers(self) -> None:
        for run in (self.held, self.both):
            for key in ("raw_modis_rmse_mw_km2", "reconstructed_rmse_mw_km2", "rmse_reduction_pct",
                        "empirical_90_coverage_pct", "step_2012_raw_ratio", "step_2012_harmonized_ratio",
                        "total_reconstructed_frp_peak_mw", "conformal_q90_radius_mw_km2",
                        "subpixel_viirs_fires_recovered_pct"):
                self.assertIsInstance(run.metrics[key], float, key)
            self.assertIsInstance(run.metrics["step_2012_coobs_frames"], int)
        self.assertTrue(self.held.metrics["holdout_viirs"])
        self.assertFalse(self.both.metrics["holdout_viirs"])
        self.assertIn("blind test", self.held.metrics["definitions"]["reference"])
        self.assertIn("not a test", self.both.metrics["definitions"]["reference"])

    def test_each_frame_is_one_real_overpass_with_its_real_footprints(self) -> None:
        frames = self.held.observer_passes["frames"]
        times = [f["timestamp_utc"] for f in frames]
        self.assertEqual(times, sorted(times))
        by_pass: dict[tuple[str, str], list[dict[str, str]]] = {}
        for r in ROWS:
            w, s, e, n = fx.TEST_BOX
            if w <= float(r["longitude"]) <= e and s <= float(r["latitude"]) <= n:
                key = (r["satellite"], f"{r['acq_date']}T{r['acq_time'][:2]}:{r['acq_time'][2:]}:00Z")
                by_pass.setdefault(key, []).append(r)
        sat = {"MODIS_TERRA": "Terra", "MODIS_AQUA": "Aqua", "VIIRS_SNPP": "N", "VIIRS_NOAA20": "N20"}
        for f in frames:
            self.assertEqual(len(f["passes"]), 1)
            rows = by_pass[(sat[f["sensor"]], f["timestamp_utc"])]
            self.assertEqual(len(f["footprints"]), len(rows))
            self.assertEqual(f["passes"][0]["footprint_count"], len(rows))
            got = sorted((fp[0], fp[1], fp[2], fp[3], fp[5]) for fp in f["footprints"])
            want = sorted(
                (round(float(r["longitude"]), 5), round(float(r["latitude"]), 5), round(float(r["scan"]), 2),
                 round(float(r["track"]), 2), round(float(r["frp"]), 2)) for r in rows
            )
            self.assertEqual(got, want)
            for fp in f["footprints"]:
                self.assertEqual(len(fp), 8)
                self.assertEqual(fp[7], f["passes"][0]["sensor_code"])
            self.assertIs(f["cloud_fraction_measured"], False)
            self.assertEqual(f["cloud_fraction"], 0.0)

    def test_suomi_npp_has_a_sensor_code_the_stage_reads_as_viirs(self) -> None:
        codes = self.held.observer_passes["sensor_codes"]
        self.assertEqual(codes["4"], "VIIRS_SNPP")
        self.assertEqual(codes["0"], "MODIS_TERRA")
        snpp = [f for f in self.held.observer_passes["frames"] if f["sensor"] == "VIIRS_SNPP"]
        self.assertGreater(len(snpp), 0)
        self.assertEqual(snpp[0]["passes"][0]["sensor_code"], 4)

    def test_observed_channels_hold_only_the_instrument_of_the_frame(self) -> None:
        t = self.held.tensor_u8
        for k, f in enumerate(self.held.observer_passes["frames"]):
            if f["sensor"].startswith("MODIS"):
                self.assertGreater(int(t[k, :, :, 2].max()), 0)
                self.assertEqual(int(t[k, :, :, 3].max()), 0)
                self.assertEqual(f["epistemic_regime"], "modis_overpass")
            else:
                self.assertGreater(int(t[k, :, :, 3].max()), 0)
                self.assertEqual(int(t[k, :, :, 2].max()), 0)
                self.assertEqual(f["epistemic_regime"], "viirs_overpass_held_out")

    def test_held_out_viirs_does_not_reach_the_estimate(self) -> None:
        scrambled = []
        for r in ROWS:
            r2 = dict(r)
            if r["instrument"] == "VIIRS":
                r2["frp"] = str(float(r["frp"]) * 9.0)
                r2["latitude"] = str(float(r["latitude"]) + 0.02)
            scrambled.append(r2)
        other = _solve("viirs", rows=scrambled)
        np.testing.assert_array_equal(other.tensor_u8[..., 0], self.held.tensor_u8[..., 0])
        np.testing.assert_array_equal(other.tensor_u8[..., 1], self.held.tensor_u8[..., 1])
        self.assertFalse(np.array_equal(other.tensor_u8[..., 3], self.held.tensor_u8[..., 3]))
        # with no holdout the VIIRS rows do change the estimate
        self.assertFalse(np.array_equal(self.both.tensor_u8[..., 0], self.held.tensor_u8[..., 0]))

    def test_no_fire_is_drawn_far_from_every_detection(self) -> None:
        t = self.both.tensor_u8
        # the synthetic fire lives near the box centre; the box corners never hold a detection
        for sl in (np.s_[:, :30, :30, 0], np.s_[:, -30:, -30:, 0], np.s_[:, :30, -30:, 0], np.s_[:, -30:, :30, 0]):
            self.assertEqual(int(t[sl].max()), 0)
        self.assertGreater(int(t[..., 0].max()), 0)

    def test_additive_keys_say_what_the_run_is(self) -> None:
        x = self.held.extras
        self.assertEqual(x["source"], "firms")
        self.assertIs(x["holdout_viirs"], True)
        self.assertEqual(x["hidden_platforms"], ["VIIRS_NOAA20", "VIIRS_SNPP"])
        self.assertEqual(self.both.extras["hidden_platforms"], [])
        self.assertEqual(x["blind_test"]["hidden_platforms"], ["VIIRS_NOAA20", "VIIRS_SNPP"])
        self.assertEqual(x["blind_test"]["calendar_overlap_ratio"]["ratio"], 4.0)
        pc = x["blind_test"]["methods"]["overlap_ratio"]["pixel_count"]
        self.assertEqual(pc["interval"]["stated_level"], 0.8)
        self.assertGreater(pc["sum_predicted"], 0.0)
        self.assertIsNotNone(x["blind_test"]["methods"]["reconstruction"]["pixel_count"]["ratio_of_sums"])
        self.assertEqual(x["window"]["overpasses"], 24)
        bt = x["blind_test"]
        self.assertTrue(bt["blind"])
        self.assertEqual(set(bt["methods"]), {"painted_modis", "overlap_ratio", "reconstruction"})
        self.assertIn("hit_rate", bt["definitions"])
        self.assertEqual(bt["source"], SOURCE)
        self.assertNotIn("blind_test", self.both.extras)
        self.assertFalse(self.both.extras["fit_residuals"]["blind"])
        self.assertEqual(x["model"]["learned_parts"][0]["status"], "not learned")
        v = bt["verdict"]
        self.assertTrue(v["evaluated"])
        self.assertEqual(v["scores_judged"], 7)
        for row in v["scores"].values():
            self.assertIn("painted_modis", row)
            self.assertIn("overlap_ratio", row)
        # the label follows the computed verdict, never a typed-in claim
        expect = "on" if (v["beats_every_baseline_on_every_score"] and (v["interval"]["observed_coverage"] or 0) >= 0.8) else "experimental"
        self.assertEqual(x["model"]["status"], expect)
        self.assertEqual(self.both.extras["model"]["status"], "experimental")
        self.assertIn("firms", self.held.run_id)
        self.assertIn("holdoutviirs", self.held.run_id)
        self.assertGreater(self.held.observer_passes["downloaded_firms_rows"], 0)
        self.assertNotIn("Zero Downloaded", self.held.provenance)

    def test_too_few_overpasses_is_an_error_not_a_padded_run(self) -> None:
        with self.assertRaises(ValueError):
            _solve("viirs", start="2099-07-02")


class WindowAndTrainingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.det = detections_from_rows(ROWS, SOURCE)

    def test_window_from_start_takes_the_first_24_in_box_overpasses(self) -> None:
        win = window_from_start(self.det, fx.TEST_BOX, parse_start_s("2099-07-01"))
        self.assertEqual(len(win.passes), 24)
        self.assertEqual((win.n_modis, win.n_viirs), (12, 12))
        self.assertEqual(win.modis_pixels_in_box, 44)
        self.assertEqual(win.viirs_pixels_in_box, 228)
        self.assertEqual(parse_start_s("2099-07-01T06:35:00Z"), win.start_s)

    def test_pick_window_scores_on_modis_only(self) -> None:
        t0, t1 = parse_start_s("2099-07-01"), parse_start_s("2099-07-05")
        a = pick_window(self.det, fx.TEST_BOX, t0, t1)
        # scrambling the hidden instrument's values must not move the choice
        from dataclasses import replace

        b = pick_window(replace(self.det, frp_mw=np.where(self.det.is_viirs, self.det.frp_mw * 50.0, self.det.frp_mw)), fx.TEST_BOX, t0, t1)
        self.assertEqual(a.start_s, b.start_s)
        self.assertIn("hidden VIIRS values are not consulted", a.rule)

    def test_test_fires_are_excluded_from_training(self) -> None:
        box = (-121.85, 50.04, -121.31, 50.42)
        rows = [
            {"latitude": "50.2", "longitude": "-121.6", "acq_date": "2021-07-01", "acq_time": "2100", "satellite": "Aqua",
             "instrument": "MODIS", "frp": "10", "scan": "1", "track": "1", "daynight": "D"},     # the Lytton fire
            {"latitude": "50.9", "longitude": "-120.8", "acq_date": "2021-07-01", "acq_time": "2100", "satellite": "Aqua",
             "instrument": "MODIS", "frp": "10", "scan": "1", "track": "1", "daynight": "D"},     # another fire, same day
            {"latitude": "50.2", "longitude": "-121.6", "acq_date": "2019-07-01", "acq_time": "2100", "satellite": "Aqua",
             "instrument": "MODIS", "frp": "10", "scan": "1", "track": "1", "daynight": "D"},     # same place, another year
        ]
        mask = excluded_mask(detections_from_rows(rows, "typed test rows"), "lytton_bc", box)
        self.assertEqual(mask.tolist(), [True, False, False])
        self.assertEqual(set(EXCLUSIONS), {"plumas_ca", "lytton_bc", "evia_greece"})


class CalendarRatioAndProvenanceTests(unittest.TestCase):
    def _calendar(self, region_id: str) -> dict:
        return {"harmonization_method": {
            "id": "overlap_ratio_v1",
            "ratio_terra_aqua": {"ratio": 4.0, "per_year": {"2019": 3.0, "2020": 4.0, "2021": 6.0, "2022": 5.0}},
            "validation": {"per_year": [
                {"year": 2019, "ratio_fitted_without_this_year": 4.4},
                {"year": 2021, "ratio_fitted_without_this_year": 3.7},
            ]},
        }}

    def test_the_test_year_is_left_out_of_the_baseline_ratio(self) -> None:
        from backend.model.calendar_ratio import calendar_ratio

        c = calendar_ratio("plumas_ca", 2021, firms_calendar=self._calendar)
        self.assertEqual(c.ratio, 3.7)
        self.assertEqual(c.ratio_all_years, 4.0)
        self.assertEqual(c.years, (2019, 2020, 2022))
        self.assertAlmostEqual(c.p10, float(np.percentile([3.0, 4.0, 5.0], 10)))
        self.assertAlmostEqual(c.p90, float(np.percentile([3.0, 4.0, 5.0], 90)))
        self.assertEqual(c.as_dict()["excluded_year"], 2021)
        every = calendar_ratio("plumas_ca", None, firms_calendar=self._calendar)
        self.assertEqual(every.ratio, 4.0)
        self.assertIsNone(every.excluded_year)

    def test_simulated_provenance_describes_the_run_not_the_cache(self) -> None:
        from backend.model import PROVENANCE_NOTE

        sim = solve_region_reconstruction(_terrain(), holdout_viirs=False, calibrator=get_pretrained_calibrator())
        for text in (PROVENANCE_NOTE, sim.provenance, sim.observer_passes["provenance"]):
            self.assertNotIn("Zero Downloaded", text)
            self.assertIn("Simulated run", text)
            self.assertIn("no NASA FIRMS row is used in this run", text.replace("No NASA", "no NASA"))


if __name__ == "__main__":
    unittest.main()
