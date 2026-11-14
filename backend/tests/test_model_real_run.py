"""A reconstruct run built from FIRMS-schema rows keeps the `/api/reconstruct` payload shape (backend/model/real_run.py).

The rows here are the SYNTHETIC fixture, fed through a stand-in reader. No real NASA row is used by any test.
Runs use the fixture repeated over six made-up days (`fx.extended_rows`): a run with VIIRS hidden plays 24 MODIS
overpasses, and three days hold only twelve.
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
ROWS6 = fx.extended_rows()
SOURCE = fx.SOURCE_LABEL
NOT_LEARNED = [{"name": "reconstruction parameters", "status": "not learned"}]


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


def _solve(holdout, rows=ROWS6, start="2099-07-01", learned_parts=NOT_LEARNED, read_passes=fx.no_pass_list):
    fit = fit_overlap_ratio(detections_from_rows(ROWS, SOURCE), trained_on="the synthetic fixture (test only)")
    return solve_real_reconstruction(
        _terrain(), start, holdout_viirs=holdout == "viirs", read_firms=_reader(rows), context_box=fx.CONTEXT_BOX,
        ratio_fit=fit, row_source=SOURCE, params=OccupancyParams(), learned_parts=learned_parts,
        count_ratio=CalendarRatio("plumas_ca", 4.0, 3.0, 5.0, 2099, (2098,), "test_ratio"),
        read_passes=read_passes,
    )


class RealRunShapeTests(unittest.TestCase):
    """A run where no pass list answers (the made-up year has none): frames are overpasses of the visible rows."""

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

    def test_metrics_are_numbers_and_simulated_names_are_null_with_their_reason(self) -> None:
        from backend.model.real_run import SIMULATED_METRIC_NAMES_NOT_USED

        for run in (self.held, self.both):
            for key in ("raw_modis_rmse_mw_km2", "reconstructed_rmse_mw_km2", "rmse_reduction_pct",
                        "empirical_90_coverage_pct", "cells_gained_over_painted_modis_pct",
                        "total_reconstructed_frp_peak_mw", "mean_cell_q90_halfwidth_mw_km2"):
                self.assertIsInstance(run.metrics[key], float, key)
                self.assertIn(key, run.metrics["definitions"])
            # the simulated engine's metric names mean nothing on a real run: null, listed, and explained
            self.assertEqual(run.metrics["simulated_names_not_used"], sorted(SIMULATED_METRIC_NAMES_NOT_USED))
            for key in SIMULATED_METRIC_NAMES_NOT_USED:
                self.assertIsNone(run.metrics[key], key)
                self.assertIn(key, run.metrics["definitions"])
            for key in ("step_2012_raw_ratio", "step_2012_harmonized_ratio", "step_2012_coobs_frames",
                        "conformal_q90_radius_mw_km2", "subpixel_viirs_fires_recovered_pct", "cloud_override"):
                self.assertIn(key, SIMULATED_METRIC_NAMES_NOT_USED)
            # every key a simulated run has is still there, so a consumer that lists them finds them
            self.assertEqual([k for k in self.sim.metrics if k not in run.metrics], [])
            json.dumps(run.metrics)

    def test_a_real_run_never_feeds_a_simulated_benchmark_gate(self) -> None:
        from backend.model.gates import build_benchmark_gates

        paired = {"raw_overall_rmse_dex": 0.12, "harmonized_overall_rmse_dex": 0.09, "n_pairs": 96}
        by = {g["gate_id"]: g for g in build_benchmark_gates(paired, self.held.metrics, self.held.run_id)}
        for gate in ("G1_2012_CONTINUITY", "G3_PAIRED_RESIDUAL", "G5_CONFORMAL_COVERAGE"):
            self.assertEqual(by[gate]["status"], "NOT_EVALUATED")
            self.assertIn("a real FIRMS run", by[gate]["metric"])
        sim = {g["gate_id"]: g for g in build_benchmark_gates(paired, self.sim.metrics, self.sim.run_id)}
        self.assertIn(sim["G5_CONFORMAL_COVERAGE"]["status"], ("PASSED", "FAILED"))    # a simulated run still is

    def test_the_blind_test_says_what_its_visible_row_count_holds(self) -> None:
        bt = self.held.extras["blind_test"]
        inside = bt["visible_rows_in_test_box_inside_window"]
        self.assertEqual(inside, self.held.extras["window"]["modis_pixels_in_box"])      # the MODIS pixels of the frames
        self.assertGreaterEqual(bt["visible_rows_in_test_box"], inside)                   # plus the days kept either side
        self.assertIn("two days either side", bt["visible_rows_note"])
        for key in ("visible_rows_in_test_box_inside_window", "visible_rows_note"):
            self.assertIn(key, bt["built_without_hidden_rows"])
        # scored over one day of the three: the methods are still given every MODIS row, and the report says both
        from backend.eval.baselines import painted_modis_factory
        from backend.eval.blind_test import run_blind_test

        det = detections_from_rows(ROWS, SOURCE)
        t0 = parse_start_s("2099-07-02")
        r = run_blind_test(det, fx.TEST_BOX, [painted_modis_factory], window=(t0, t0 + 86400.0), read_passes=fx.no_pass_list)
        self.assertEqual(r["visible_rows_in_test_box"], 44)
        in_day = sum(1 for row in ROWS if row["instrument"] == "MODIS" and row["acq_date"] == "2099-07-02")
        self.assertEqual(r["visible_rows_in_test_box_inside_window"], in_day)
        self.assertLess(in_day, 44)
        self.assertTrue(self.held.metrics["holdout_viirs"])
        self.assertFalse(self.both.metrics["holdout_viirs"])
        self.assertIn("blind test", self.held.metrics["definitions"]["reference"])
        self.assertIn("not a test", self.both.metrics["definitions"]["reference"])

    def test_each_frame_is_one_real_overpass_with_its_real_footprints(self) -> None:
        frames = self.held.observer_passes["frames"]
        times = [f["timestamp_utc"] for f in frames]
        self.assertEqual(times, sorted(times))
        self.assertEqual({f["sensor"][:5] for f in frames}, {"MODIS"})          # VIIRS is hidden: no frame is a VIIRS pass
        self.assertEqual({f["sensor"][:5] for f in self.both.observer_passes["frames"]}, {"MODIS", "VIIRS"})
        by_pass: dict[tuple[str, str], list[dict[str, str]]] = {}
        for r in ROWS6:
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
        snpp = [f for f in self.both.observer_passes["frames"] if f["sensor"] == "VIIRS_SNPP"]
        self.assertGreater(len(snpp), 0)
        self.assertEqual(snpp[0]["passes"][0]["sensor_code"], 4)

    def test_observed_channels_hold_only_the_instrument_of_the_frame(self) -> None:
        t = self.both.tensor_u8
        for k, f in enumerate(self.both.observer_passes["frames"]):
            if f["sensor"].startswith("MODIS"):
                self.assertGreater(int(t[k, :, :, 2].max()), 0)
                self.assertEqual(int(t[k, :, :, 3].max()), 0)
                self.assertEqual(f["epistemic_regime"], "modis_overpass")
            else:
                self.assertGreater(int(t[k, :, :, 3].max()), 0)
                self.assertEqual(int(t[k, :, :, 2].max()), 0)
                self.assertEqual(f["epistemic_regime"], "viirs_overpass")

    def test_with_viirs_hidden_the_viirs_channel_is_empty_and_the_scorer_carries_the_hidden_pixels(self) -> None:
        self.assertEqual(int(self.held.tensor_u8[..., 3].max()), 0)
        self.assertGreater(int(self.held.tensor_u8[..., 2].max()), 0)
        rv = self.held.extras["blind_test"]["reveal"]
        self.assertEqual(rv["footprint_schema"], self.held.observer_passes["footprint_schema"])
        self.assertEqual(sum(o["pixels_in_box"] for o in rv["overpasses"]), self.held.extras["blind_test"]["hidden_rows_in_test_box"])
        for o in rv["overpasses"]:
            self.assertTrue(o["platform"].startswith("VIIRS"))
            self.assertTrue(0 <= o["nearest_frame"] < 24)
            self.assertEqual(len(o["footprints"][0]), 8)
        self.assertIn("reveal", self.held.extras["blind_test"]["from_the_scorer"])
        # with no holdout the VIIRS rows do change the estimate
        self.assertNotEqual(self.both.extras["window"], self.held.extras["window"])

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
        # every VIIRS platform the archive holds in the window's year, whether or not it left a row
        self.assertEqual(x["hidden_platforms"], ["VIIRS_NOAA20", "VIIRS_NOAA21", "VIIRS_SNPP"])
        self.assertEqual(self.both.extras["hidden_platforms"], [])
        self.assertEqual(x["blind_test"]["hidden_platforms"], ["VIIRS_NOAA20", "VIIRS_NOAA21", "VIIRS_SNPP"])
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
        # the status is what validation on other fires decided (the learned parts), never this run's own score
        self.assertEqual(x["model"]["status"], "experimental")
        self.assertIn("no part of the estimate has been validated", x["model"]["status_reason"])
        mixed = _solve("viirs", learned_parts=[{"name": "a", "status": "on"}, {"name": "b", "status": "experimental"}, {"name": "ratio", "status": "baseline only"}])
        self.assertEqual(mixed.extras["model"]["status"], "experimental")
        self.assertIn("1 of 2 parts", mixed.extras["model"]["status_reason"])
        self.assertEqual(self.both.extras["model"]["status"], "experimental")
        on = _solve("viirs", learned_parts=[{"name": "a part", "status": "on"}])
        self.assertEqual(on.extras["model"]["status"], "on")
        self.assertEqual(x["window"]["viirs_overpasses"], 0)
        self.assertIn("MODIS rows only", x["window"]["chosen_from"])
        self.assertEqual(bt["protocol"]["version"], 2)
        self.assertNotIn("test_fire", bt["protocol"])                  # the synthetic rows are dated 2099
        self.assertEqual(bt["schedule"]["source"], "nominal")
        self.assertIn("no pass list", bt["schedule"]["why_nominal"])
        self.assertTrue(x["window"]["frames_from"].startswith("detections"))
        self.assertTrue(bt["schedule"]["blind"])
        self.assertEqual(self.held.metrics["from_hidden_rows"][0], "raw_modis_rmse_mw_km2")
        self.assertEqual(self.both.metrics["from_hidden_rows"], [])
        self.assertIn("firms", self.held.run_id)
        self.assertIn("holdoutviirs", self.held.run_id)
        self.assertGreater(self.held.observer_passes["downloaded_firms_rows"], 0)
        self.assertNotIn("Zero Downloaded", self.held.provenance)

    def test_belief_frames_spread_between_passes_and_tighten_at_each_one(self) -> None:
        d = self.held.extras["belief_frames"]
        g = d["grid"]
        self.assertEqual(len(self.held.belief_u8_bytes), d["steps"] * g["ny"] * g["nx"] * 2)
        self.assertEqual(d["bytes"], len(self.held.belief_u8_bytes))
        self.assertEqual(d["step_minutes"], 30.0)
        self.assertEqual([c["name"] for c in d["channels"]], ["p_burning", "expected_frp_density"])
        self.assertIn("hidden: VIIRS_NOAA20, VIIRS_NOAA21, VIIRS_SNPP", d["assimilated"])
        self.assertTrue(d["url"].endswith("/belief_u8.bin"))
        arr = np.frombuffer(self.held.belief_u8_bytes, dtype=np.uint8).reshape(d["steps"], g["ny"], g["nx"], 2)
        self.assertGreater(int(arr[..., 0].max()), 0)
        # only MODIS passes are assimilated in a holdout run
        self.assertEqual({p["sensor"][:5] for p in d["assimilated_passes"]}, {"MODIS"})
        steps = d["per_step"]
        # between two passes the belief covers more cells and is less sure of each; the next pass sharpens it
        tightened = spread = 0
        marks = sorted({p["first_step_after"] for p in d["assimilated_passes"] if 0 < p["first_step_after"] < d["steps"]})
        for a, b in zip(marks, marks[1:]):
            if b - a >= 3 and steps[a]["sharpness"] and steps[b - 1]["sharpness"]:
                spread += int(steps[b - 1]["cells_that_may_burn"] >= steps[a]["cells_that_may_burn"])
                tightened += int(steps[b]["sharpness"] >= steps[b - 1]["sharpness"])
        self.assertGreater(spread, 0)
        self.assertGreater(tightened, 0)
        # hidden VIIRS rows never reach the belief frames
        self.assertEqual(self.held.extras["belief_frames"]["per_step"][5]["hours_since_last_assimilated_pass"] is not None, True)

    def test_too_few_overpasses_is_an_error_not_a_padded_run(self) -> None:
        with self.assertRaises(ValueError):
            _solve("viirs", start="2099-07-02")
        with self.assertRaises(ValueError):
            _solve("viirs", rows=ROWS)                                  # three days hold only twelve MODIS overpasses
        self.assertEqual(_solve(None, rows=ROWS).extras["window"]["overpasses"], 24)


class WindowAndTrainingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.det = detections_from_rows(ROWS, SOURCE)

    def test_window_from_start_takes_the_first_24_in_box_overpasses_of_the_visible_rows(self) -> None:
        # nothing hidden: both instruments count
        win = window_from_start(self.det, fx.TEST_BOX, parse_start_s("2099-07-01"), n=24, hidden=None)
        self.assertEqual(len(win.passes), 24)
        self.assertEqual((win.n_modis, win.n_viirs), (12, 12))
        self.assertEqual(win.modis_pixels_in_box, 44)
        self.assertEqual(win.viirs_pixels_in_box, 228)
        self.assertEqual(parse_start_s("2099-07-01T06:35:00Z"), win.start_s)
        # VIIRS hidden (the default): only MODIS overpasses count, and three days hold twelve of them
        with self.assertRaises(ValueError):
            window_from_start(self.det, fx.TEST_BOX, parse_start_s("2099-07-01"), n=24)
        blind = window_from_start(self.det, fx.TEST_BOX, parse_start_s("2099-07-01"))
        self.assertEqual((blind.n_modis, blind.n_viirs, blind.viirs_pixels_in_box), (12, 0, 0))
        self.assertIn("VIIRS is hidden", blind.chosen_from)

    def test_pick_window_reads_the_visible_rows_only(self) -> None:
        t0, t1 = parse_start_s("2099-07-01"), parse_start_s("2099-07-05")
        a = pick_window(self.det, fx.TEST_BOX, t0, t1)
        self.assertEqual((len(a.passes), a.n_viirs), (12, 0))
        self.assertIn("MODIS rows only", a.as_dict()["chosen_from"])
        self.assertEqual(a.as_dict(), pick_window(self.det.select(self.det.is_modis), fx.TEST_BOX, t0, t1).as_dict())

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
        # the test box is closed for the whole of the test year, before and after the fire's own dates
        rows.append(dict(rows[0], acq_date="2021-03-10"))            # in the test box, months before the fire
        rows.append(dict(rows[0], acq_date="2021-11-20"))            # in the test box, after the exclusion dates
        rows.append(dict(rows[1], acq_date="2021-03-10"))            # away from the test box, same early day
        mask = excluded_mask(detections_from_rows(rows, "typed test rows"), "lytton_bc", box)
        self.assertEqual(mask.tolist(), [True, False, False, True, True, False])
        self.assertEqual(set(EXCLUSIONS), {"plumas_ca", "lytton_bc", "evia_greece"})


class StartDateTests(unittest.TestCase):
    def test_start_dates_say_which_days_are_worth_showing_and_why_not(self) -> None:
        from backend.model.real_run import real_start_dates

        out = real_start_dates(PRESET_BY_ID["plumas_ca"], "2099-06-30", "2099-07-03", read_firms=_reader(ROWS6),
                               context_box=fx.CONTEXT_BOX, row_source=SOURCE)
        self.assertEqual([e["start"] for e in out["starts"]], ["2099-06-30", "2099-07-01", "2099-07-02", "2099-07-03"])
        by = {e["start"]: e for e in out["starts"]}
        # the six synthetic days hold exactly 24 MODIS overpasses from 2099-07-01 06:35, flagging only 88 pixels
        self.assertEqual(by["2099-07-01"]["first_overpass_utc"], "2099-07-01T06:35:00Z")
        self.assertEqual(by["2099-07-01"]["modis_overpasses"], 24)
        self.assertNotIn("viirs_overpasses", by["2099-07-01"])
        # nothing about a start is counted from VIIRS rows: the sealed rows are not opened for the list
        self.assertEqual(out["labels_from_hidden_rows"], [])
        for e in out["starts"]:
            self.assertNotIn("viirs_pixels_in_box", e)
        self.assertFalse(by["2099-07-01"]["worth_showing"])
        self.assertIn("MODIS flags only 88 pixels", by["2099-07-01"]["why_not"])
        self.assertIn("at most 192 h", out["rule"])
        self.assertFalse(by["2099-07-02"]["worth_showing"])
        self.assertIn("fewer than 24 MODIS overpasses", by["2099-07-02"]["why_not"])
        self.assertEqual(out["worth_showing"], [])
        self.assertIn("at least 100 pixels", out["rule"])
        self.assertIn("no VIIRS row is read to choose", out["chosen_from"])
        from backend.model import real_run as RR

        self.assertEqual(RR.START_MIN_PASSES_EACH, 0)                   # no rule asks for overpasses of each instrument
        json.dumps(out)


class EncodingTests(unittest.TestCase):
    def test_log_bytes_hold_the_real_range_and_zero_stays_zero(self) -> None:
        from backend.model import encoding as ENC

        v = np.array([0.0, 0.004, 0.01, 0.5, 80.0, 81.0, 7132.0, 10000.0, 50000.0])
        b = ENC.encode_u8(v)
        self.assertEqual(int(b[0]), 0)
        self.assertEqual((int(b[1]), int(b[2]), int(b[-2]), int(b[-1])), (1, 1, 255, 255))
        self.assertTrue(np.all(np.diff(b[2:].astype(int)) >= 0))
        self.assertGreater(int(b[5]), 0)                             # 81 MW/km2 is inside the scale, not clipped to the top
        self.assertLess(int(b[5]), 255)
        back = ENC.decode_u8(b)
        self.assertEqual(float(back[0]), 0.0)
        inside = (v >= 0.01) & (v <= 10000.0)
        np.testing.assert_allclose(back[inside], v[inside], rtol=0.029)   # one step is a factor of 1.056
        self.assertEqual(len(ENC.lookup_table()), 256)
        self.assertEqual(ENC.lookup_table()[0], 0.0)
        d = ENC.describe()
        self.assertEqual((d["scale"], d["min_mw_km2"], d["max_mw_km2"], d["version"]), ("log10", 0.01, 10000.0, 2))
        self.assertEqual([t["mw_km2"] for t in d["legend_ticks"]], [0.01, 0.1, 1.0, 10.0, 100.0, 1000.0, 10000.0])
        self.assertEqual((d["legend_ticks"][0]["byte"], d["legend_ticks"][-1]["byte"]), (1, 255))

    def test_a_real_run_describes_its_bytes_and_a_route_can_decode_either_kind(self) -> None:
        from backend.model import encoding as ENC

        run = _solve("viirs")
        enc = run.extras["encoding"]
        for key in ("scale", "decode", "lookup_mw_km2", "legend_ticks", "channels", "cells_above_scale", "cells_below_floor", "cells_with_fire"):
            self.assertIn(key, enc)
        self.assertNotIn("z_hat_max_mw_km2", enc)                      # nothing invites a linear reading
        self.assertEqual(set(enc["channels"]), {"r", "g", "b", "a"})
        # the bytes decode back to the frame's own stated maximum, within one step of the scale
        k = 3
        frame = run.observer_passes["frames"][k]
        z = ENC.decode_tensor_channel(run.tensor_u8[k], 0, real_run=True)
        self.assertAlmostEqual(float(z.max()), frame["max_z_hat_mw_km2"], delta=0.03 * frame["max_z_hat_mw_km2"] + 0.01)
        sim = solve_region_reconstruction(_terrain(), holdout_viirs=False, calibrator=get_pretrained_calibrator())
        z_sim = ENC.decode_tensor_channel(sim.tensor_u8[k], 0, real_run=False)
        self.assertLessEqual(float(z_sim.max()), 80.0)
        self.assertEqual(run.extras["belief_frames"]["channels"][1]["scale"], "log10")

    def test_run_starts_for_the_calendar(self) -> None:
        from backend.model.real_run import DEFAULT_STARTS, START_PERIODS, real_run_starts

        self.assertEqual(set(DEFAULT_STARTS), {"plumas_ca", "lytton_bc", "evia_greece"})
        self.assertEqual(set(START_PERIODS), set(DEFAULT_STARTS))
        out = real_run_starts(PRESET_BY_ID["plumas_ca"], read_firms=_reader(ROWS), context_box=fx.CONTEXT_BOX)
        self.assertEqual(out["starts"], [])                            # the synthetic rows are dated 2099, not 2021
        self.assertIsNone(out["default_start"])
        other = real_run_starts(PRESET_BY_ID["blue_mountains_au"])
        self.assertEqual((other["starts"], other["default_start"]), ([], None))
        self.assertIn("no real FIRMS rows", other["note"])


class CalendarRatioAndProvenanceTests(unittest.TestCase):
    def _calendar(self, region_id: str) -> dict:
        def month(ym: str, snpp: int, terra: int, aqua: int) -> dict:
            return {"year": int(ym[:4]), "year_month": ym, "raw_counts": {
                "Terra": {"total": terra}, "Aqua": {"total": aqua}, "Suomi NPP": {"total": snpp}, "NOAA-20": None}}

        return {
            "harmonization_method": {"id": "overlap_ratio_v1", "overlap_months_excluded_for_outages": ["2020-08"]},
            "records": [
                month("2019-07", 300, 60, 40), month("2019-08", 0, 0, 0),
                month("2020-07", 400, 50, 50), month("2020-08", 9999, 1, 1),      # an outage month: left out
                month("2021-07", 6000, 500, 500),                                 # the year of the test fire
                month("2022-07", 500, 60, 40),
                month("2024-07", 900, 100, 100),
                {"year": 2011, "year_month": "2011-07", "raw_counts": {"Terra": {"total": 5}, "Aqua": {"total": 5}, "Suomi NPP": None}},
            ],
        }

    def test_the_run_year_and_the_test_fire_year_are_left_out_of_the_baseline_ratio(self) -> None:
        from backend.model.calendar_ratio import calendar_ratio, years_of_test_fires

        self.assertEqual(years_of_test_fires("plumas_ca"), (2021,))
        self.assertEqual(years_of_test_fires("lytton_bc"), (2021,))
        self.assertEqual(years_of_test_fires("blue_mountains_au"), ())
        # a validation year: 2024 is left out because it is the run's year, 2021 because it holds a test fire
        c = calendar_ratio("plumas_ca", 2024, firms_calendar=self._calendar)
        self.assertEqual(c.years, (2019, 2020, 2022))
        self.assertEqual(c.dropped_years, (2021, 2024))
        self.assertAlmostEqual(c.ratio, (300 + 400 + 500) / (100 + 100 + 100))
        self.assertAlmostEqual(c.p10, float(np.percentile([3.0, 4.0, 5.0], 10)))
        self.assertAlmostEqual(c.p90, float(np.percentile([3.0, 4.0, 5.0], 90)))
        self.assertEqual(c.as_dict()["excluded_year"], 2024)
        self.assertNotIn("ratio_all_years", c.as_dict())
        # the test year itself, and no year named: 2021 never enters
        self.assertEqual(calendar_ratio("plumas_ca", 2021, firms_calendar=self._calendar).years, (2019, 2020, 2022, 2024))
        self.assertEqual(calendar_ratio("plumas_ca", None, firms_calendar=self._calendar).dropped_years, (2021,))
        # a run over New Year touches two years and both are left out
        from backend.model.real_run import years_touched

        self.assertEqual(years_touched(parse_start_s("2022-12-29T21:00:00"), parse_start_s("2023-01-04T15:00:00")), (2022, 2023))
        self.assertEqual(years_touched(parse_start_s("2024-07-10"), parse_start_s("2024-07-12")), (2024,))
        self.assertEqual(years_touched(parse_start_s("2024-01-01T12:00:00"), parse_start_s("2024-01-02")), (2023, 2024))   # the days given before the first frame
        two = calendar_ratio("plumas_ca", (2022, 2024), firms_calendar=self._calendar)
        self.assertEqual((two.years, two.dropped_years, two.excluded_years), ((2019, 2020), (2021, 2022, 2024), (2022, 2024)))
        self.assertEqual(two.as_dict()["excluded_years"], [2022, 2024])
        self.assertEqual(c.excluded_years, (2024,))
        # a region with no test fire keeps every year but the run's
        self.assertEqual(calendar_ratio("blue_mountains_au", 2024, firms_calendar=self._calendar).years, (2019, 2020, 2021, 2022))

    def test_the_fit_and_validation_path_asks_for_that_clean_ratio(self) -> None:
        from backend.model import calendar_ratio as CR, fit_real

        seen = []
        real = CR.calendar_ratio
        try:
            CR.calendar_ratio = lambda region, exclude_year, **kw: seen.append((region, exclude_year, kw)) or real(region, exclude_year, firms_calendar=self._calendar)
            fit_real._CAL.clear()
            c = fit_real._calendar("evia_greece", 2025)
        finally:
            CR.calendar_ratio = real
            fit_real._CAL.clear()
        self.assertEqual(seen, [("evia_greece", 2025, {})])            # no flag that would keep the test year
        self.assertNotIn(2021, c.years)
        self.assertNotIn(2025, c.years)

    def test_simulated_provenance_describes_the_run_not_the_cache(self) -> None:
        from backend.model import PROVENANCE_NOTE

        sim = solve_region_reconstruction(_terrain(), holdout_viirs=False, calibrator=get_pretrained_calibrator())
        for text in (PROVENANCE_NOTE, sim.provenance, sim.observer_passes["provenance"]):
            self.assertNotIn("Zero Downloaded", text)
            self.assertIn("Simulated run", text)
            self.assertIn("no NASA FIRMS row is used in this run", text.replace("No NASA", "no NASA"))


if __name__ == "__main__":
    unittest.main()
