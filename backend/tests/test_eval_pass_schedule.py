"""The schedule from a pass list (unit M9a): where a box lies in a swath polygon, which passes are slots, which rows
belong to a slot, and a blind test in which every pass is scored, fire or no fire. SYNTHETIC rows and a made-up pass
list; no test reads NASA's.
"""

from __future__ import annotations

import math
from pathlib import Path
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import schedule as S  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.baselines import painted_modis_factory  # noqa: E402
from backend.eval.blind_test import blind_test_sealed, run_blind_test  # noqa: E402
from backend.eval.holdout import seal  # noqa: E402
from backend.eval.rows import detections_from_rows, parse_acq_time_s, read_csv_rows  # noqa: E402
from backend.model import platforms as P  # noqa: E402
from backend.model.occupancy import OccupancyParams  # noqa: E402
from backend.model.real_blind import reconstruction_factory  # noqa: E402

ROWS = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
READER = fx.fixture_pass_reader()
T0 = parse_acq_time_s("2099-07-01", "0000")
DAY = 86400.0
VIIRS = ("VIIRS_SNPP", "VIIRS_NOAA20", "VIIRS_NOAA21")


def _offset(lon: float, lat: float, bearing_deg: float, km: float) -> tuple[float, float]:
    """The point `km` from (lon, lat) along a bearing, on the sphere."""
    d, b = km / S.EARTH_RADIUS_KM, math.radians(bearing_deg)
    la1, lo1 = math.radians(lat), math.radians(lon)
    la2 = math.asin(math.sin(la1) * math.cos(d) + math.cos(la1) * math.sin(d) * math.cos(b))
    lo2 = lo1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(la1), math.cos(d) - math.sin(la1) * math.sin(la2))
    return math.degrees(lo2), math.degrees(la2)


def _granule_ring(platform: str, is_day: bool, lon: float, lat: float, east_km: float, behind_km: float,
                  half_swath_km: float = 1500.0, length_km: float = 2000.0) -> list[list[float]]:
    """A four-cornered swath polygon whose ground track passes `east_km` from the point on its eastern side
    (negative: western), measured across the track, and whose first scan line lies `behind_km` behind the point
    along the track."""
    heading = P.track_heading_deg(platform, is_day, lat)
    # of the two bearings across the track, the one that points east
    across = heading + 90.0 if math.sin(math.radians(heading + 90.0)) > 0.0 else heading - 90.0
    on_track = _offset(lon, lat, across, east_km)
    # the track's heading where the point's scan line meets it: square to the way back to the point
    if east_km != 0.0:
        back = S._bearing(on_track, (lon, lat))
        heading = min((back + 90.0, back - 90.0), key=lambda h: abs(((h - heading + 180.0) % 360.0) - 180.0))
    first = _offset(*on_track, heading + 180.0, behind_km)
    last = _offset(*on_track, heading, length_km - behind_km)
    corners = [_offset(*first, heading - 90.0, half_swath_km), _offset(*first, heading + 90.0, half_swath_km),
               _offset(*last, heading + 90.0, half_swath_km), _offset(*last, heading - 90.0, half_swath_km)]
    return [[c[0], c[1]] for c in corners] + [[corners[0][0], corners[0][1]]]


class SwathPositionTests(unittest.TestCase):
    """A point's place in a granule polygon: the minute the scan crossed it, its distance from the track, the side."""

    def test_time_distance_and_side_for_each_platform_by_day_and_by_night(self) -> None:
        start = parse_acq_time_s("2023-08-18", "1000")            # 10:00 UTC is night at 121 W, 20:00 UTC is day
        for platform in ("MODIS_TERRA", "MODIS_AQUA", "VIIRS_SNPP", "VIIRS_NOAA20"):
            for hour, is_day in ((0.0, False), (10.0, True)):
                for east_km, behind_km in ((400.0, 500.0), (-900.0, 1500.0), (60.0, 1000.0)):
                    for lon, lat in ((-121.2, 40.0), (23.3, 38.9)):
                        t0 = start + hour * 3600.0 - (lon + 121.2) / 15.0 * 3600.0     # the same local time at both
                        self.assertEqual(S.is_day_at(t0, lon), is_day)
                        ring = _granule_ring(platform, is_day, lon, lat, east_km, behind_km)
                        self.assertTrue(S.ring_holds(ring, lon, lat))
                        got = S.swath_position(ring, lon, lat, platform, t0, t0 + 300.0)
                        name = f"{platform} day={is_day} track {east_km} km east, {behind_km} km in, at {lon},{lat}"
                        self.assertAlmostEqual(got["cross_track_km"], abs(east_km), delta=12.0, msg=name)
                        self.assertEqual(got["satellite_side"], "east" if east_km > 0 else "west", name)
                        self.assertAlmostEqual(got["swath_width_km"], 3000.0, delta=40.0, msg=name)
                        self.assertAlmostEqual(got["time_s"] - t0, 300.0 * behind_km / 2000.0, delta=12.0, msg=name)

    def test_a_point_outside_the_polygon_is_not_held(self) -> None:
        ring = _granule_ring("VIIRS_SNPP", True, -121.2, 40.0, 0.0, 1000.0)
        self.assertTrue(S.ring_holds(ring, -121.2, 40.0))
        self.assertFalse(S.ring_holds(ring, *_offset(-121.2, 40.0, 90.0, 1700.0)))
        self.assertFalse(S.ring_holds(ring, *_offset(-121.2, 40.0, 0.0, 1300.0)))


class PassSlotTests(unittest.TestCase):
    def test_a_slot_is_a_pass_whose_swath_holds_the_whole_box(self) -> None:
        slots, left = S.pass_slots(VIIRS, T0, T0 + DAY, fx.TEST_BOX, READER)
        self.assertEqual(left, {"passes_listed": 7, "partly_in_swath": 1, "not_placed": 0, "before_the_collection_is_whole": 0})
        self.assertEqual([(s.platform, s.as_dict()["time_utc"][11:16]) for s in slots], [
            ("VIIRS_SNPP", "09:48"), ("VIIRS_NOAA21", "10:12"), ("VIIRS_NOAA20", "10:36"),
            ("VIIRS_SNPP", "20:54"), ("VIIRS_NOAA21", "21:18"), ("VIIRS_NOAA20", "21:42"),
        ])
        self.assertEqual([s.index for s in slots], list(range(6)))
        self.assertEqual([s.is_day for s in slots], [False, False, False, True, True, True])
        self.assertTrue(all(s.source == S.SOURCE_CMR and s.box_share == 1.0 for s in slots))
        # only the platforms asked for, and only passes whose scan crossed the box inside the window
        only, _ = S.pass_slots(("VIIRS_SNPP",), T0 + 10 * 3600.0, T0 + DAY, fx.TEST_BOX, READER)
        self.assertEqual([(s.platform, s.as_dict()["time_utc"][11:16]) for s in only], [("VIIRS_SNPP", "20:54")])
        self.assertEqual(S.pass_slots((), T0, T0 + DAY, fx.TEST_BOX, READER)[0], [])

    def test_the_pixel_size_comes_from_where_the_box_lies_in_the_swath(self) -> None:
        det = detections_from_rows(ROWS, fx.SOURCE_LABEL)
        slots, _ = S.pass_slots(VIIRS + ("MODIS_TERRA", "MODIS_AQUA"), T0, T0 + 3 * DAY, fx.TEST_BOX, READER)
        checked = 0
        for s in slots:
            rows = S.rows_of_slot(det.time_s, det.platform_code, s)
            if rows.size == 0:
                continue
            # the fixture's rows were made at a scan angle; the slot's size is worked out from the distance alone
            self.assertAlmostEqual(s.scan_km, float(np.median(det.scan_km[rows])), delta=0.06, msg=s.as_dict())
            self.assertAlmostEqual(s.track_km, float(np.median(det.track_km[rows])), delta=0.06, msg=s.as_dict())
            self.assertTrue(np.all(det.platform_code[rows] == P.PLATFORM_CODES[s.platform]))
            checked += 1
        self.assertEqual(checked, 24)
        self.assertEqual(sum(1 for s in slots if S.rows_of_slot(det.time_s, det.platform_code, s).size == 0), 9)   # three empty passes a day
        modis = [s for s in slots if s.platform.startswith("MODIS")]
        self.assertTrue(all(s.cloud_cover_pct is not None for s in modis))
        self.assertTrue(all(s.cloud_cover_pct is None for s in slots if s.platform.startswith("VIIRS")))

    def test_rows_belong_to_the_pass_whose_granules_hold_their_time(self) -> None:
        slots, _ = S.pass_slots(VIIRS, T0, T0 + DAY, fx.TEST_BOX, READER)
        snpp = slots[0]
        t = np.array([snpp.span_s[0] - 91.0, snpp.span_s[0] - 60.0, snpp.time_s, snpp.span_s[1] + 60.0, snpp.span_s[1] + 91.0, snpp.time_s])
        code = np.array([P.PLATFORM_CODES["VIIRS_SNPP"]] * 5 + [P.PLATFORM_CODES["VIIRS_NOAA20"]])
        self.assertEqual(S.rows_of_slot(t, code, snpp).tolist(), [1, 2, 3])
        with self.assertRaises(ValueError):
            S.rows_of_slot(t, code, S.nominal_slots(("VIIRS_SNPP",), T0, T0 + DAY, -121.2, 40.0)[0])

    def test_a_platform_has_no_slot_before_its_collection_is_whole(self) -> None:
        def early(box, start, end, platforms=None, tiles=None):
            return [
                {"platform": "VIIRS_NOAA20", "time_start": "2018-06-30T10:00:00Z", "time_end": "2018-06-30T10:06:00Z", "granules": ["a"],
                 "box_inside": True, "box_share": 1.0, "cloud_cover_pct": None, "time_at_box": "2018-06-30T10:03:00Z", "cross_track_km": 100.0},
                {"platform": "VIIRS_NOAA20", "time_start": "2018-07-01T10:00:00Z", "time_end": "2018-07-01T10:06:00Z", "granules": ["b"],
                 "box_inside": True, "box_share": 1.0, "cloud_cover_pct": None, "time_at_box": "2018-07-01T10:03:00Z", "cross_track_km": 100.0},
            ]

        a = parse_acq_time_s("2018-06-30", "0000")
        slots, left = S.pass_slots(("VIIRS_NOAA20",), a, a + 2 * DAY, fx.TEST_BOX, early)
        self.assertEqual([s.as_dict()["time_utc"] for s in slots], ["2018-07-01T10:03:00Z"])
        self.assertEqual(left["before_the_collection_is_whole"], 1)

    def test_without_a_pass_list_the_nominal_schedule_stands_in_and_says_why(self) -> None:
        slots, source, info = S.schedule_for("VIIRS", None, T0, T0 + DAY, fx.TEST_BOX, read_passes=fx.no_pass_list)
        self.assertEqual(source, S.SOURCE_NOMINAL)
        self.assertIn("no pass list", info["why_nominal"])
        self.assertTrue(all(s.source == S.SOURCE_NOMINAL and s.span_s is None for s in slots))
        with self.assertRaises(LookupError):
            S.schedule_for("VIIRS", None, T0, T0 + DAY, fx.TEST_BOX, source=S.SOURCE_CMR, read_passes=fx.no_pass_list)
        listed, source, info = S.schedule_for("VIIRS", None, T0, T0 + DAY, fx.TEST_BOX, read_passes=READER)
        self.assertEqual((source, len(listed), info["partly_in_swath"]), (S.SOURCE_CMR, 6, 1))
        asked, source, _ = S.schedule_for("VIIRS", None, T0, T0 + DAY, fx.TEST_BOX, source=S.SOURCE_NOMINAL, read_passes=READER)
        self.assertEqual(source, S.SOURCE_NOMINAL)


def _report(rows, **kw):
    det = detections_from_rows(rows, fx.SOURCE_LABEL)
    return run_blind_test(det, fx.TEST_BOX, [painted_modis_factory, reconstruction_factory(OccupancyParams())],
                          window=(T0, T0 + 3 * DAY), read_passes=READER, **kw)


class BlindTestOnThePassListTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.report = _report(ROWS)

    def test_every_pass_is_scored_and_one_that_flagged_nothing_is_a_look_that_flagged_nothing(self) -> None:
        r = self.report
        self.assertEqual(r["protocol"]["version"], 3)
        self.assertEqual((r["schedule"]["source"], r["schedule"]["asked_for"], r["schedule"]["blind"]), ("cmr", "auto", True))
        self.assertEqual(len(r["schedule"]["slots"]), 18)                      # six passes a day held the box
        self.assertEqual(r["schedule"]["partly_in_swath"], 3)
        self.assertEqual(r["scored_overpasses"], 18)
        self.assertEqual(r["scored_overpasses_with_no_hidden_detection"], 6)   # the made-up NOAA-21 never flags
        self.assertEqual(r["scored_overpasses_with_hidden_detections_in_test_box"], 12)
        self.assertEqual(r["hidden_overpasses_without_a_slot"], 0)
        self.assertEqual(r["hidden_rows_without_a_pass"], 0)
        self.assertEqual([t["slot"] for t in r["targets"]], list(range(18)))
        empty = [t for t in r["targets"] if t["platform"] == "VIIRS_NOAA21"]
        self.assertEqual(len(empty), 6)
        for t in empty:
            self.assertEqual((t["hidden_pixels_in_context_box"], t["hidden_pixels_in_test_box"], t["truth_cells"], t["hidden_frp_mw"]), (0, 0, 0, 0.0))
        for m in r["methods"].values():
            self.assertEqual(len(m["per_overpass"]), 18)
            self.assertEqual(m["interval"]["n"] if m["interval"]["n"] else 18, 18)
        # a cell declared at a look that flagged nothing is a false alarm, and counts
        rec = r["methods"]["reconstruction"]
        on_empty = [po for po, t in zip(rec["per_overpass"], r["targets"]) if t["platform"] == "VIIRS_NOAA21"]
        self.assertGreater(sum(po["predicted_cells"] for po in on_empty), 0)
        self.assertEqual(sum(po["fp"] for po in on_empty), sum(po["predicted_cells"] for po in on_empty))
        self.assertEqual(sum(po["tp"] + po["fn"] for po in on_empty), 0)
        # the limit is stated where the schedule is described
        self.assertIn("may have been cloudy", r["schedule"]["note"])
        self.assertIn("no cloud information", r["schedule"]["note"])

    def test_the_subset_with_detections_is_reported_beside_it(self) -> None:
        r = self.report
        sub = r["subset_with_hidden_detections"]
        self.assertEqual(sub["scored_overpasses"], 12)
        full, part = r["methods"]["reconstruction"]["strict_375m"], sub["methods"]["reconstruction"]["strict_375m"]
        self.assertEqual(part["tp"], full["tp"])                               # an empty look holds no hit to lose
        self.assertEqual(part["fn"], full["fn"])
        self.assertLess(part["fp"], full["fp"])                                # only its false alarms
        self.assertGreater(part["csi"], full["csi"])
        self.assertNotIn("per_overpass", sub["methods"]["reconstruction"])

    def test_schedule_and_predictions_are_identical_whatever_the_hidden_rows_hold(self) -> None:
        cases = {name: fx.perturb_hidden(ROWS, **kw) for name, kw in fx.AUDIT_PERTURBATIONS.items()}   # type: ignore[arg-type]
        cases["every hidden row deleted"] = [r for r in ROWS if r["instrument"] != "VIIRS"]
        cases["pixel sizes changed"] = fx.perturb_hidden(ROWS, scan="0.80", track="0.78")
        want = self.report
        for name, rows in cases.items():
            got = _report(rows)
            for key in want["built_without_hidden_rows"]:
                self.assertEqual(got[key], want[key], f"{name}: {key}")
            self.assertEqual(sorted(set(got) - set(got["from_the_scorer"])), sorted(got["built_without_hidden_rows"]), name)
        gone = _report(cases["every hidden row deleted"])
        self.assertEqual((gone["scored_overpasses"], gone["scored_overpasses_with_no_hidden_detection"], gone["hidden_rows_in_test_box"]), (18, 18, 0))
        self.assertNotEqual(_report(cases["1A shift, scale, delete a third"])["methods"], want["methods"])

    def test_rows_of_a_pass_that_is_no_slot_are_counted_and_not_scored(self) -> None:
        moved = [{**r, "acq_time": "0855"} if (r["instrument"] == "VIIRS" and r["satellite"] == "N20" and r["acq_time"] == "1036") else dict(r) for r in ROWS]
        n = sum(1 for a, b in zip(ROWS, moved) if a != b)
        self.assertGreater(n, 0)
        r = _report(moved)
        self.assertEqual(r["hidden_rows_without_a_pass"], n)
        self.assertEqual(r["hidden_rows_in_test_box"], self.report["hidden_rows_in_test_box"] - n)
        self.assertEqual(r["schedule"], self.report["schedule"])
        self.assertEqual(r["scored_overpasses"], 18)

    def test_a_caller_may_hand_over_the_schedule_it_already_holds(self) -> None:
        det = detections_from_rows(ROWS, fx.SOURCE_LABEL)
        visible, sealed = seal(det, "VIIRS")
        slots, source, info = S.schedule_for("VIIRS", None, T0, T0 + 3 * DAY, fx.TEST_BOX, read_passes=READER)
        some = (slots[2:9], source, info)
        r = blind_test_sealed(visible, sealed, fx.TEST_BOX, [painted_modis_factory], window=(T0, T0 + 3 * DAY), given=some)
        self.assertEqual(r["scored_overpasses"], 7)
        self.assertEqual([s["index"] for s in r["schedule"]["slots"]], list(range(7)))
        self.assertEqual([s["time_utc"] for s in r["schedule"]["slots"]], [s.as_dict()["time_utc"] for s in slots[2:9]])
        # rows of the passes that were not handed over are in the window and belong to no slot of this schedule
        self.assertGreater(r["hidden_rows_without_a_pass"], 0)
        with self.assertRaises(ValueError):
            blind_test_sealed(visible, sealed, fx.TEST_BOX, [painted_modis_factory], window=(T0, T0 + DAY),
                              given=(slots, S.SOURCE_HIDDEN_TIMES, info))

    def test_the_nominal_schedule_is_still_there_when_asked_for(self) -> None:
        r = _report(ROWS, schedule=S.SOURCE_NOMINAL)
        self.assertEqual((r["protocol"]["version"], r["schedule"]["source"]), (2, "nominal"))
        self.assertEqual(r["scored_overpasses_with_no_hidden_detection"], 0)
        self.assertEqual(r["scored_overpasses"], 12)


if __name__ == "__main__":
    unittest.main()
