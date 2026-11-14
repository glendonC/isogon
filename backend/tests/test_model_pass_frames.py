"""A run whose frames are the passes of a pass list, on SYNTHETIC rows and a made-up pass list.

Every pass that covered the box is a frame, fire or no fire. With VIIRS hidden the VIIRS passes are frames that
carry the estimate and nothing observed, and they are exactly the looks the blind test scores. The hidden-row
regression tests for this path are in test_model_hidden_rows.py.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.rows import detections_from_rows  # noqa: E402
from backend.model.real_blind import FRAMES, run_frames  # noqa: E402
from backend.model.real_run import parse_start_s, real_response  # noqa: E402
from backend.tests.test_model_hidden_rows import ROWS6, SOURCE, _solve  # noqa: E402

READER = fx.fixture_pass_reader()
SAT = {"MODIS_TERRA": "Terra", "MODIS_AQUA": "Aqua", "VIIRS_SNPP": "N", "VIIRS_NOAA20": "N20", "VIIRS_NOAA21": "N21"}


def _rows_of_pass() -> dict[tuple[str, str], list[dict[str, str]]]:
    out: dict[tuple[str, str], list[dict[str, str]]] = {}
    w, s, e, n = fx.TEST_BOX
    for r in ROWS6:
        if w <= float(r["longitude"]) <= e and s <= float(r["latitude"]) <= n:
            out.setdefault((r["satellite"], f"{r['acq_date']}T{r['acq_time'][:2]}:{r['acq_time'][2:]}:00Z"), []).append(r)
    return out


class PassListFramesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.held = _solve(ROWS6, READER, holdout=True)
        cls.both = _solve(ROWS6, READER, holdout=False)
        cls.frames = cls.held.observer_passes["frames"]
        cls.passes = {(p["platform"], p["time_at_box"]): p for p in fx.fixture_passes()}

    def test_the_frames_are_the_first_24_passes_that_held_the_box_from_the_first_modis_overpass(self) -> None:
        f = self.frames
        self.assertEqual(len(f), FRAMES)
        self.assertEqual(f[0]["sensor"], "MODIS_TERRA")
        self.assertEqual(f[0]["timestamp_utc"], "2099-07-01T06:35:00Z")           # Terra's 04:57 pass flagged nothing
        times = [x["timestamp_utc"] for x in f]
        self.assertEqual(times, sorted(times))
        want = [p for p in fx.fixture_passes() if p["box_inside"] and p["time_at_box"] >= "2099-07-01T06:33:00Z"][:FRAMES]
        self.assertEqual([(x["sensor"], x["timestamp_utc"]) for x in f], [(p["platform"], p["time_at_box"]) for p in want])
        self.assertFalse(any(x["timestamp_utc"][11:16] == "08:55" for x in f))    # the pass that held part of the box
        win = self.held.extras["window"]
        self.assertEqual((win["overpasses"], win["frames_from"]), (24, "cmr"))
        self.assertEqual(win["modis_overpasses"] + win["viirs_overpasses"], 24)
        self.assertEqual(win["hidden_passes"], sum(1 for x in f if x["held_out"]))
        self.assertEqual(win["viirs_pixels_in_box"], 0)
        self.assertIn("no row of a hidden instrument", win["chosen_from"])
        self.assertLess(win["span_hours"], 60.0)                                  # about two days, not the six of 24 MODIS overpasses
        self.assertEqual(self.held.observer_passes["frames_from"], "cmr")
        self.assertIn("swath polygon", self.held.observer_passes["geometry_note"])

    def test_a_held_out_frame_carries_the_estimate_and_nothing_observed(self) -> None:
        held = [x for x in self.frames if x["held_out"]]
        self.assertEqual(len(held), 12)
        self.assertEqual({x["sensor"] for x in held}, {"VIIRS_SNPP", "VIIRS_NOAA20", "VIIRS_NOAA21"})
        t = self.held.tensor_u8
        self.assertEqual(int(t[..., 3].max()), 0)                                 # no VIIRS pixel anywhere in the tensor
        some_estimate = 0
        for x in held:
            k = x["frame"]
            self.assertEqual(x["epistemic_regime"], "viirs_overpass_held_out")
            self.assertEqual(x["footprints"], [])
            self.assertIsNone(x["detections_in_box"])
            self.assertIsNone(x["viirs_confidence_classes"])
            self.assertEqual(int(t[k, :, :, 2].max()), 0)
            self.assertEqual(int(t[k, :, :, 3].max()), 0)
            some_estimate += int(t[k, :, :, 0].max() > 0)
            p = x["passes"][0]
            self.assertEqual((p["sensor"], p["held_out"], p["footprint_count"]), (x["sensor"], True, 0))
            self.assertEqual(self.held.epoch_summaries[k]["regime"], "viirs_overpass_held_out")
            self.assertEqual(self.held.epoch_summaries[k]["raw_viirs_total_mw"], 0.0)
        self.assertGreater(some_estimate, 8)
        self.assertIn("real pass of a hidden platform", self.held.observer_passes["held_out_frames_note"])
        self.assertIsNone(self.both.observer_passes["held_out_frames_note"])

    def test_a_visible_frame_holds_the_rows_of_its_pass_and_an_empty_pass_is_a_frame(self) -> None:
        by_pass = _rows_of_pass()
        seen = [x for x in self.frames if not x["held_out"]]
        self.assertEqual({x["sensor"][:5] for x in seen}, {"MODIS"})
        empty = 0
        for x in seen:
            rows = by_pass.get((SAT[x["sensor"]], x["timestamp_utc"]), [])
            self.assertEqual(x["epistemic_regime"], "modis_overpass")
            self.assertEqual(x["detections_in_box"], len(rows))
            self.assertEqual(len(x["footprints"]), len(rows))
            got = sorted((fp[0], fp[1], fp[2], fp[3], fp[5]) for fp in x["footprints"])
            want = sorted((round(float(r["longitude"]), 5), round(float(r["latitude"]), 5), round(float(r["scan"]), 2),
                           round(float(r["track"]), 2), round(float(r["frp"]), 2)) for r in rows)
            self.assertEqual(got, want)
            self.assertIsNotNone(x["granule_cloud_cover_pct"])                    # MODIS granules give a mean cloud cover
            self.assertIs(x["cloud_fraction_measured"], False)
            empty += int(not rows)
        self.assertEqual(empty, 2)                                                # Terra's second night pass, twice
        self.assertEqual(self.held.extras["window"]["passes_with_no_visible_detection"], 2)

    def test_geometry_comes_from_the_pass_and_not_from_a_detection(self) -> None:
        for x in self.frames:
            src = self.passes[(x["sensor"], x["timestamp_utc"])]
            p = x["passes"][0]
            self.assertAlmostEqual(p["cross_track_km"], round(float(src["cross_track_km"]), 1), places=1)
            self.assertEqual(p["satellite_side"], src["satellite_side"])
            self.assertIn("swath polygon", p["geometry_from"])
            self.assertGreaterEqual(p["view_zenith_deg"], p["scan_angle_deg"])
            self.assertEqual((x["scan_angle_deg"], x["subsat_lon"], x["subsat_lat"]), (p["scan_angle_deg"], p["subsat_lon"], p["subsat_lat"]))
            # the satellite stands on the side the pass says
            lon = self.held.observer_passes["aoi_center"][0]
            self.assertEqual(p["subsat_lon"] < lon, p["satellite_side"] == "west", (x["sensor"], x["timestamp_utc"]))
        text = json.dumps(real_response(self.held, {}))
        self.assertNotIn("NaN", text)

    def test_with_nothing_hidden_the_same_passes_are_played_with_their_rows(self) -> None:
        both = self.both.observer_passes["frames"]
        self.assertEqual([(x["sensor"], x["timestamp_utc"]) for x in both], [(x["sensor"], x["timestamp_utc"]) for x in self.frames])
        self.assertFalse(any(x["held_out"] for x in both))
        by_pass = _rows_of_pass()
        for x in both:
            rows = by_pass.get((SAT[x["sensor"]], x["timestamp_utc"]), [])
            self.assertEqual(len(x["footprints"]), len(rows))
            self.assertEqual(x["epistemic_regime"], "modis_overpass" if x["sensor"].startswith("MODIS") else "viirs_overpass")
        n21 = [x for x in both if x["sensor"] == "VIIRS_NOAA21"]
        self.assertEqual(len(n21), 4)
        self.assertTrue(all(x["detections_in_box"] == 0 for x in n21))            # a platform that flagged nothing still has frames
        self.assertGreater(self.both.extras["window"]["viirs_pixels_in_box"], 0)
        self.assertEqual(self.both.extras["window"]["hidden_passes"], 0)
        self.assertGreater(int(self.both.tensor_u8[..., 3].max()), 0)

    def test_the_looks_scored_are_the_held_out_frames_and_no_other(self) -> None:
        bt = self.held.extras["blind_test"]
        held = [x for x in self.frames if x["held_out"]]
        self.assertEqual(bt["protocol"]["version"], 3)
        self.assertEqual(bt["schedule"]["source"], "cmr")
        self.assertEqual([s["frame"] for s in bt["schedule"]["slots"]], [x["frame"] for x in held])
        self.assertEqual(bt["scored_overpasses"], len(held))
        self.assertEqual([(t["platform"], t["time_utc"]) for t in bt["targets"]], [(x["sensor"], x["timestamp_utc"]) for x in held])
        self.assertEqual(bt["scored_overpasses_with_no_hidden_detection"], 4)     # NOAA-21's four passes
        self.assertEqual(bt["schedule"]["partly_in_swath"], 3)                    # 08:55 on each of the three days
        self.assertIn("may have been cloudy", bt["schedule"]["note"])
        self.assertIn("frame", bt["schedule"]["frames_note"])
        self.assertIn("schedule", bt["built_without_hidden_rows"])
        # what a method was told about a look is the pass's own time and the pixel size at the box
        for s, x in zip(bt["schedule"]["slots"], held):
            self.assertEqual(s["time_utc"], x["timestamp_utc"])
            self.assertEqual(s["cross_track_km"], x["passes"][0]["cross_track_km"])

    def test_the_reveal_ties_each_hidden_overpass_to_its_frame(self) -> None:
        bt = self.held.extras["blind_test"]
        rv = bt["reveal"]["overpasses"]
        by_pass = _rows_of_pass()
        self.assertEqual(len(rv), 8)                                              # NOAA-21 flagged nothing: no entry
        self.assertEqual(sum(o["pixels_in_box"] for o in rv), bt["hidden_rows_in_test_box"])
        for o in rv:
            frame = self.frames[o["frame"]]
            self.assertTrue(frame["held_out"])
            self.assertEqual((frame["sensor"], frame["timestamp_utc"]), (o["platform"], o["time_utc"]))
            self.assertEqual(o["nearest_frame"], o["frame"])
            self.assertIs(o["scored"], True)
            self.assertEqual(o["pixels_in_box"], len(by_pass[(SAT[o["platform"]], o["time_utc"])]))
            self.assertEqual(len(o["footprints"][0]), 8)
        self.assertIn("frame", bt["reveal"]["what"])

    def test_frames_do_not_depend_on_what_is_hidden_or_on_any_hidden_row(self) -> None:
        det = detections_from_rows(ROWS6, SOURCE)
        t0 = parse_start_s("2099-07-01")
        key = lambda frames: [(f.platform, f.time_s, f.is_day) for f in frames]  # noqa: E731
        a, win_a = run_frames(det, fx.TEST_BOX, t0, hidden="VIIRS", read_passes=READER)
        b, win_b = run_frames(det, fx.TEST_BOX, t0, hidden=None, read_passes=READER)
        c, win_c = run_frames(det.select(det.is_modis), fx.TEST_BOX, t0, hidden="VIIRS", read_passes=READER)
        self.assertEqual(key(a), key(b))
        self.assertEqual(key(a), key(c))
        self.assertEqual(win_a.as_dict(), win_c.as_dict())
        self.assertEqual((win_a.start_s, win_a.end_s), (win_b.start_s, win_b.end_s))
        self.assertTrue(all(f.rows.size == 0 for f in a if f.hidden))
        self.assertEqual([f.hidden for f in a], [f.platform.startswith("VIIRS") for f in a])
        # frame rows are positions in the rows given, of the frame's own platform, inside the box
        inb = det.in_box(fx.TEST_BOX)
        for f in b:
            self.assertTrue(all(inb[i] for i in f.rows))
            self.assertEqual({det.platform_names()[i] for i in f.rows} - {f.platform}, set())

    def test_too_few_passes_is_an_error_and_no_list_falls_back(self) -> None:
        det = detections_from_rows(ROWS6, SOURCE)
        with self.assertRaises(ValueError):
            run_frames(det, fx.TEST_BOX, parse_start_s("2099-07-01"), hidden="VIIRS", read_passes=fx.fixture_pass_reader(days=2))
        frames, win = run_frames(det, fx.TEST_BOX, parse_start_s("2099-07-01"), hidden="VIIRS", read_passes=fx.no_pass_list)
        self.assertTrue(win.frames_from.startswith("detections"))
        self.assertTrue(all(f.overpass is not None and f.slot is None and not f.hidden for f in frames))
        self.assertEqual({f.platform[:5] for f in frames}, {"MODIS"})


if __name__ == "__main__":
    unittest.main()
