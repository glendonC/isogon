"""Hidden rows must not reach anything but the score, on SYNTHETIC rows.

Every row of the hidden instrument is shifted, scaled, deleted or removed altogether while every visible row stays
as it was. Whatever the run built must come out byte for byte the same; only what the scorer wrote may differ, and
it must differ, or the perturbation proved nothing.

Every run test is made twice: once where no pass list answers, so the frames are overpasses of the
visible rows and the schedule is the nominal one, and once with a made-up pass list, so the frames are its passes,
the hidden platforms' passes are held-out frames and every one of them is scored.
"""

from __future__ import annotations

import copy
import hashlib
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
from backend.model.occupancy import OccupancyParams  # noqa: E402
from backend.model.real_blind import pick_window, window_from_start  # noqa: E402
from backend.model.real_run import parse_start_s, real_response, real_start_dates, solve_real_reconstruction  # noqa: E402
from backend.terrain.live_region import PRESET_BY_ID, LoadedRegionTerrain  # noqa: E402

BASE = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
ROWS6 = fx.extended_rows()
SOURCE = fx.SOURCE_LABEL

# What the scorer writes. Everything else in the response must not move with the hidden rows.
SCORER_KEYS_OF_BLIND_TEST = (
    "hidden_rows_in_test_box", "scored_overpasses", "scored_overpasses_with_hidden_detections_in_test_box",
    "scored_overpasses_with_no_hidden_detection", "hidden_overpasses_without_a_slot", "hidden_rows_without_a_pass",
    "targets", "methods", "subset_with_hidden_detections", "reveal", "verdict",
)
SCORER_METRICS = (
    "raw_modis_rmse_mw_km2", "reconstructed_rmse_mw_km2", "rmse_reduction_pct", "empirical_90_coverage_pct",
    "cells_gained_over_painted_modis_pct",
)

CASES: dict[str, list[dict[str, str]]] = {
    name: fx.perturb_hidden(ROWS6, **kw) for name, kw in fx.HIDDEN_ROW_PERTURBATIONS.items()   # type: ignore[arg-type]
}
CASES["every hidden row removed"] = [r for r in ROWS6 if r["instrument"] != "VIIRS"]
CASES["pixel sizes of hidden rows changed"] = fx.perturb_hidden(ROWS6, scan="0.80", track="0.78")
# NOAA-20's night rows moved to 08:55, where the made-up pass list has a pass that held only part of the box
CASES["hidden rows of one pass moved to another time"] = [
    {**r, "acq_time": "0855"} if (r["instrument"] == "VIIRS" and r["satellite"] == "N20" and r["acq_time"] == "1036") else dict(r)
    for r in ROWS6
]


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


class _Ratio:
    """A stand-in for the calendar's count ratio (the real one is tested in test_model_real_run.py)."""

    ratio, p10, p90, level = 4.0, 3.0, 5.0, 0.8

    def as_dict(self) -> dict[str, float]:
        return {"ratio": self.ratio, "p10": self.p10, "p90": self.p90, "nominal_level": self.level}


def _solve(rows, read_passes=fx.no_pass_list, holdout=True):
    fit = fit_overlap_ratio(detections_from_rows(BASE, SOURCE), trained_on="the synthetic fixture (test only)")
    return solve_real_reconstruction(
        _terrain(), "2099-07-01", holdout_viirs=holdout, read_firms=_reader(rows), context_box=fx.CONTEXT_BOX,
        ratio_fit=fit, row_source=SOURCE, params=OccupancyParams(),
        learned_parts=[{"name": "reconstruction parameters", "status": "not learned"}], count_ratio=_Ratio(),
        read_passes=read_passes,
    )


def _without_the_scorer(run) -> str:
    """The run's response as JSON text with the scorer's keys and the wall clock times taken out."""
    doc = copy.deepcopy(real_response(run, {}))
    bt = doc.get("blind_test") or {}
    for key in SCORER_KEYS_OF_BLIND_TEST:
        bt.pop(key, None)
    for key in SCORER_METRICS:
        doc["metrics"].pop(key, None)
    for stage in doc["pipeline_stages"]:
        stage.pop("duration_ms", None)
    return json.dumps(doc, sort_keys=True)


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


class RunIgnoresHiddenRowsTests(unittest.TestCase):
    """No pass list answers: frames are overpasses of the visible rows, the schedule is the nominal one."""

    READ_PASSES = staticmethod(fx.no_pass_list)
    FRAMES_FROM = "detections"

    @classmethod
    def setUpClass(cls) -> None:
        cls.real = _solve(ROWS6, cls.READ_PASSES)
        cls.other = {name: _solve(rows, cls.READ_PASSES) for name, rows in CASES.items()}

    def test_the_frames_come_from_where_the_class_says(self) -> None:
        self.assertTrue(self.real.extras["window"]["frames_from"].startswith(self.FRAMES_FROM))
        self.assertEqual(self.real.observer_passes["frames_from"], self.real.extras["window"]["frames_from"])

    def test_the_perturbations_are_real(self) -> None:
        viirs = [r for r in ROWS6 if r["instrument"] == "VIIRS"]
        for name, rows in CASES.items():
            self.assertEqual([r for r in rows if r["instrument"] != "VIIRS"], [r for r in ROWS6 if r["instrument"] != "VIIRS"], name)
            self.assertNotEqual([r for r in rows if r["instrument"] == "VIIRS"], viirs, name)

    def test_window_and_run_id_do_not_move(self) -> None:
        for name, run in self.other.items():
            self.assertEqual(run.run_id, self.real.run_id, name)
            self.assertEqual(run.extras["window"], self.real.extras["window"], name)
            self.assertEqual(run.extras["hidden_platforms"], self.real.extras["hidden_platforms"], name)

    def test_estimate_fields_are_byte_identical(self) -> None:
        self.assertGreater(int(self.real.tensor_u8[..., 0].max()), 0)
        for name, run in self.other.items():
            for ch, what in enumerate(("reconstruction", "its standard deviation", "MODIS as observed", "VIIRS as observed")):
                self.assertEqual(int(np.count_nonzero(run.tensor_u8[..., ch] != self.real.tensor_u8[..., ch])), 0, f"{name}: {what}")
            self.assertEqual(_sha(run.reconstruction_u8_bytes), _sha(self.real.reconstruction_u8_bytes), name)
            self.assertEqual(run.epoch_summaries, self.real.epoch_summaries, name)
            self.assertEqual(run.observer_passes["frames"], self.real.observer_passes["frames"], name)

    def test_belief_frames_are_byte_identical(self) -> None:
        self.assertGreater(len(self.real.belief_u8_bytes), 0)
        for name, run in self.other.items():
            self.assertEqual(_sha(run.belief_u8_bytes), _sha(self.real.belief_u8_bytes), name)
            self.assertEqual(run.extras["belief_frames"], self.real.extras["belief_frames"], name)

    def test_exports_are_byte_identical(self) -> None:
        for name, run in self.other.items():
            self.assertEqual(_sha(run.export_csv_bytes), _sha(self.real.export_csv_bytes), name)
            self.assertEqual(_sha(run.export_geojson_bytes), _sha(self.real.export_geojson_bytes), name)

    def test_geometry_status_and_model_side_metrics_do_not_move(self) -> None:
        for name, run in self.other.items():
            self.assertEqual(run.observer_passes["crossing_time_offsets"], self.real.observer_passes["crossing_time_offsets"], name)
            self.assertEqual((run.extras["model"]["status"], run.extras["model"]["status_reason"]),
                             (self.real.extras["model"]["status"], self.real.extras["model"]["status_reason"]), name)
            for key in ("total_reconstructed_frp_peak_mw", "conformal_q90_radius_mw_km2"):
                self.assertEqual(run.metrics[key], self.real.metrics[key], name)
            self.assertEqual(run.provenance, self.real.provenance, name)

    def test_declared_cells_and_intervals_are_byte_identical(self) -> None:
        # what every method fixed for every scheduled look, with a digest of its probability field, its FRP field
        # and its declared cells
        want = self.real.extras["blind_test"].get("published")
        self.assertIsNotNone(want, "the run publishes no predictions that could be compared")
        self.assertGreater(len(want["reconstruction"]), 0)
        self.assertGreater(max(p["predicted_cells"] for p in want["reconstruction"]), 0)
        self.assertIsNotNone(want["reconstruction"][0]["interval_mw"])
        self.assertIsNotNone(want["overlap_ratio"][0]["pixel_interval"])
        for name, run in self.other.items():
            self.assertEqual(run.extras["blind_test"]["published"], want, name)
            self.assertEqual(run.extras["blind_test"]["schedule"], self.real.extras["blind_test"]["schedule"], name)

    def test_every_payload_key_outside_the_scorer_is_byte_identical(self) -> None:
        want = _without_the_scorer(self.real)
        for name, run in self.other.items():
            self.assertEqual(_sha(_without_the_scorer(run).encode()), _sha(want.encode()), name)

    def test_the_payload_names_the_scorer_keys_itself(self) -> None:
        bt = self.real.extras["blind_test"]
        self.assertEqual(sorted(bt["from_the_scorer"]), sorted(SCORER_KEYS_OF_BLIND_TEST))
        self.assertEqual(sorted(self.real.metrics["from_hidden_rows"]), sorted(SCORER_METRICS))
        self.assertEqual(sorted(set(bt) - set(bt["from_the_scorer"])), sorted(bt["built_without_hidden_rows"]))

    def test_the_scores_do_change(self) -> None:
        def csi(run):
            return run.extras["blind_test"]["methods"]["reconstruction"]["strict_375m"]["csi"]

        def hidden_frp(run):
            return run.extras["blind_test"]["methods"]["reconstruction"]["frp_total"]["sum_hidden_mw"]

        for name in ("shift, scale, delete a third", "larger shift, scale, delete three in four"):
            self.assertNotEqual(csi(self.other[name]), csi(self.real), name)
        self.assertAlmostEqual(hidden_frp(self.other["scale only"]), 3.7 * hidden_frp(self.real), delta=0.02 * hidden_frp(self.real))
        self.assertEqual(csi(self.other["scale only"]), csi(self.real))       # FRP alone moves no cell
        gone = self.other["every hidden row removed"].extras["blind_test"]
        self.assertEqual((gone["scored_overpasses"], gone["hidden_rows_in_test_box"]), (0, 0))
        self.assertGreater(self.real.extras["blind_test"]["scored_overpasses"], 0)


class RunFromThePassListIgnoresHiddenRowsTests(RunIgnoresHiddenRowsTests):
    """The same perturbations where a pass list answers: the frames are its passes, the passes of the
    hidden platforms are held-out frames, and every held-out frame is scored whether or not it left a detection."""

    READ_PASSES = staticmethod(fx.fixture_pass_reader())
    FRAMES_FROM = "cmr"

    def test_schedule_and_frames_are_identical_with_the_hidden_rows_deleted(self) -> None:
        gone = self.other["every hidden row removed"]
        frames = self.real.observer_passes["frames"]
        held = [f for f in frames if f["held_out"]]
        self.assertEqual(len(frames), 24)
        self.assertGreater(len(held), 0)
        self.assertEqual({f["sensor"][:5] for f in held}, {"VIIRS"})
        self.assertEqual(gone.observer_passes["frames"], frames)
        self.assertEqual(gone.extras["window"], self.real.extras["window"])
        schedule = self.real.extras["blind_test"]["schedule"]
        self.assertEqual(schedule["source"], "cmr")
        self.assertEqual(gone.extras["blind_test"]["schedule"], schedule)
        # every held-out frame is a slot of the schedule and no slot is anything else
        self.assertEqual([s["frame"] for s in schedule["slots"]], [f["frame"] for f in held])
        self.assertEqual([(s["platform"], s["time_utc"]) for s in schedule["slots"]], [(f["sensor"], f["timestamp_utc"]) for f in held])
        self.assertEqual(gone.extras["blind_test"]["published"], self.real.extras["blind_test"]["published"])
        self.assertEqual(_sha(gone.reconstruction_u8_bytes), _sha(self.real.reconstruction_u8_bytes))
        self.assertEqual(self.real.extras["blind_test"]["protocol"]["version"], 3)

    def test_schedule_and_frames_are_identical_under_every_perturbation(self) -> None:
        for name, run in self.other.items():
            self.assertEqual(run.observer_passes["frames"], self.real.observer_passes["frames"], name)
            self.assertEqual(run.extras["blind_test"]["schedule"], self.real.extras["blind_test"]["schedule"], name)

    def test_a_run_with_nothing_hidden_plays_the_same_passes(self) -> None:
        both = _solve(ROWS6, self.READ_PASSES, holdout=False)
        key = lambda run: [(f["sensor"], f["timestamp_utc"]) for f in run.observer_passes["frames"]]  # noqa: E731
        self.assertEqual(key(both), key(self.real))
        self.assertEqual(both.run_id.replace("allsensors", ""), self.real.run_id.replace("holdoutviirs", ""))
        self.assertFalse(any(f["held_out"] for f in both.observer_passes["frames"]))

    def test_the_scores_do_change(self) -> None:
        def csi(run):
            return run.extras["blind_test"]["methods"]["reconstruction"]["strict_375m"]["csi"]

        def hidden_frp(run):
            return run.extras["blind_test"]["methods"]["reconstruction"]["frp_total"]["sum_hidden_mw"]

        real = self.real.extras["blind_test"]
        held = sum(1 for f in self.real.observer_passes["frames"] if f["held_out"])
        for name in ("shift, scale, delete a third", "larger shift, scale, delete three in four"):
            self.assertNotEqual(csi(self.other[name]), csi(self.real), name)
        self.assertAlmostEqual(hidden_frp(self.other["scale only"]), 3.7 * hidden_frp(self.real), delta=0.02 * hidden_frp(self.real))
        self.assertEqual(csi(self.other["scale only"]), csi(self.real))       # FRP alone moves no cell
        # with the hidden rows deleted every held-out pass is still scored: as a look that flagged nothing
        gone = self.other["every hidden row removed"].extras["blind_test"]
        self.assertEqual(real["scored_overpasses"], held)
        self.assertEqual(gone["scored_overpasses"], held)
        self.assertEqual(gone["scored_overpasses_with_no_hidden_detection"], held)
        self.assertEqual(gone["hidden_rows_in_test_box"], 0)
        self.assertEqual(gone["subset_with_hidden_detections"]["scored_overpasses"], 0)
        # the made-up NOAA-21 flags nothing: its passes are scored looks even with every row in place
        n21 = sum(1 for f in self.real.observer_passes["frames"] if f["sensor"] == "VIIRS_NOAA21")
        self.assertGreater(n21, 0)
        self.assertEqual(real["scored_overpasses_with_no_hidden_detection"], n21)
        self.assertEqual(real["subset_with_hidden_detections"]["scored_overpasses"], held - n21)
        # rows moved into a pass that held only part of the box belong to no slot: counted, revealed, not scored
        moved = self.other["hidden rows of one pass moved to another time"].extras["blind_test"]
        self.assertEqual(real["hidden_rows_without_a_pass"], 0)
        self.assertGreater(moved["hidden_rows_without_a_pass"], 0)
        loose = [o for o in moved["reveal"]["overpasses"] if o["frame"] is None]
        self.assertEqual(sum(o["pixels_in_box"] for o in loose), moved["hidden_rows_without_a_pass"])
        self.assertTrue(all(o["scored"] is False for o in loose))
        self.assertLess(moved["hidden_rows_in_test_box"], real["hidden_rows_in_test_box"])


class WindowChoiceIgnoresHiddenRowsTests(unittest.TestCase):
    """The same window with the hidden instrument present, altered or removed."""

    def setUp(self) -> None:
        self.full = detections_from_rows(ROWS6, SOURCE)
        self.variants = {name: detections_from_rows(rows, SOURCE) for name, rows in CASES.items()}
        self.t0, self.t1 = parse_start_s("2099-07-01"), parse_start_s("2099-07-08")

    def test_pick_window_is_identical_with_the_hidden_instrument_removed_or_altered(self) -> None:
        want = pick_window(self.full, fx.TEST_BOX, self.t0, self.t1).as_dict()
        self.assertEqual(want["viirs_overpasses"], 0)
        for name, det in self.variants.items():
            self.assertEqual(pick_window(det, fx.TEST_BOX, self.t0, self.t1).as_dict(), want, name)

    def test_window_from_start_is_identical_with_the_hidden_instrument_removed_or_altered(self) -> None:
        want = window_from_start(self.full, fx.TEST_BOX, self.t0).as_dict()
        for name, det in self.variants.items():
            self.assertEqual(window_from_start(det, fx.TEST_BOX, self.t0).as_dict(), want, name)

    def test_start_dates_are_identical_with_the_hidden_instrument_removed_or_altered(self) -> None:
        spec = PRESET_BY_ID["plumas_ca"]

        def dates(rows, labels=False):
            out = real_start_dates(spec, "2099-06-30", "2099-07-04", read_firms=_reader(rows), context_box=fx.CONTEXT_BOX, row_source=SOURCE)
            # the labels the answer itself says were counted from hidden rows are set aside; all else must match
            named = out.get("labels_from_hidden_rows", [])
            got = [e.get("viirs_pixels_in_box") for e in out["starts"]]
            for e in out["starts"]:
                for key in named:
                    e.pop(key, None)
            return (out, got) if labels else out

        want, label = dates(ROWS6, labels=True)
        self.assertTrue(any("first_overpass_utc" in e for e in want["starts"]))
        for name, rows in CASES.items():
            self.assertEqual(dates(rows), want, name)
        # the label does follow the hidden rows, which is all it is for
        self.assertNotEqual(dates(CASES["every hidden row removed"], labels=True)[1], label)

    def test_episodes_are_identical_with_the_hidden_instrument_removed_or_altered(self) -> None:
        from backend.model.episodes import find_episodes

        def episodes(rows):
            found = find_episodes((2099,), _reader(rows), lambda r: fx.CONTEXT_BOX, PRESET_BY_ID, regions=("plumas_ca",), min_modis_pixels=40)
            return [e.as_dict() for e in found]

        want = episodes(ROWS6)
        self.assertEqual(len(want), 1)
        for name, rows in CASES.items():
            self.assertEqual(episodes(rows), want, name)


if __name__ == "__main__":
    unittest.main()
