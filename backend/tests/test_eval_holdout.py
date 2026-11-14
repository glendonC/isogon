"""The seal on hidden rows and the schedule of looks (backend/eval/holdout.py, backend/eval/schedule.py).

Rows are the SYNTHETIC fixture. One test reads the backend's source files to check who opens the sealed rows.
"""

from __future__ import annotations

from pathlib import Path
import re
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import schedule as S  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.baselines import painted_modis_factory  # noqa: E402
from backend.eval.blind_test import run_blind_test  # noqa: E402
from backend.eval.holdout import SCORER_ENTRY_POINTS, SCORERS, Sealed, seal, visible_rows  # noqa: E402
from backend.eval.rows import detections_from_rows, read_csv_rows  # noqa: E402
from backend.model.platforms import ARCHIVE_FIRST_DAY, archive_platforms  # noqa: E402
from backend.model.real_geometry import pixel_km_at_ground_distance, pixel_km_from_pass_time, typical_pixel_km  # noqa: E402
from backend.model.real_run import parse_start_s  # noqa: E402


def _det():
    rows = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
    return detections_from_rows(rows, fx.SOURCE_LABEL)


class SealTests(unittest.TestCase):
    def test_seal_parts_the_rows_and_the_box_shows_nothing(self) -> None:
        det = _det()
        visible, sealed = seal(det, "VIIRS")
        self.assertEqual(len(visible), int(det.is_modis.sum()))
        self.assertEqual(int(visible.is_viirs.sum()), 0)
        self.assertIsInstance(sealed, Sealed)
        self.assertEqual(repr(sealed), "Sealed(hidden: VIIRS)")
        for attempt in (lambda: len(sealed), lambda: list(sealed), lambda: sealed.lat, lambda: sealed.det):   # type: ignore[arg-type,attr-defined]
            with self.assertRaises((TypeError, AttributeError)):
                attempt()
        self.assertEqual(len(sealed.open_for_scoring()), int(det.is_viirs.sum()))
        self.assertEqual(len(visible_rows(det, "VIIRS")), len(visible))

    def test_nothing_hidden_and_named_platforms(self) -> None:
        det = _det()
        visible, sealed = seal(det, None)
        self.assertEqual((len(visible), len(sealed.open_for_scoring())), (len(det), 0))
        visible, sealed = seal(det, "VIIRS", ("VIIRS_NOAA20",))
        self.assertIn("VIIRS_SNPP", set(visible.platform_names()))
        self.assertEqual(set(sealed.open_for_scoring().platform_names()), {"VIIRS_NOAA20"})
        self.assertEqual(sealed.platforms, ("VIIRS_NOAA20",))
        with self.assertRaises(ValueError):
            seal(det, "GOES")

    def test_only_the_scorers_open_the_box(self) -> None:
        # every Python file under backend/ but the tests (the server and `backend/firms` included): who
        # calls open_for_scoring, who asks for hidden pass times, and who reaches for the box's private rows
        openers, timers, reachers = set(), set(), set()
        scanned = 0
        for path in sorted((_REPO_ROOT / "backend").rglob("*.py")):
            rel = str(path.relative_to(_REPO_ROOT))
            if rel.startswith("backend/tests/"):
                continue
            scanned += 1
            text = path.read_text(encoding="utf-8")
            if re.search(r"\.open_for_scoring\(", text):
                openers.add(rel)
            if re.search(r"\.pass_times\(", text):
                timers.add(rel)
            # an object's own `self._det` is not the sealed box's; the box's own file names the attribute in a comment
            if rel != "backend/eval/holdout.py" and re.search(r"(?<!self)\._det\b", text):
                reachers.add(rel)
        self.assertGreater(scanned, 40)
        self.assertTrue((_REPO_ROOT / "backend" / "server.py").is_file() and any((_REPO_ROOT / "backend" / "firms").glob("*.py")))
        self.assertEqual(openers, set(SCORERS))
        self.assertEqual(timers, {"backend/eval/blind_test.py"})       # the diagnostic schedule only
        self.assertEqual(reachers, set())                              # nobody reads another object's private rows
        # and the files that build a run or an episode never split rows by instrument on their own
        for rel in ("backend/model/real_run.py", "backend/model/belief.py", "backend/model/real_blind.py"):
            text = (_REPO_ROOT / rel).read_text(encoding="utf-8")
            self.assertIsNone(re.search(r"\.is_viirs\b", text), rel)


    def test_the_box_leaves_a_builder_only_through_the_named_entry_points(self) -> None:
        import ast

        # in the blind test, the functions that open the box are the named entry points and no other
        tree = ast.parse((_REPO_ROOT / "backend/eval/blind_test.py").read_text(encoding="utf-8"))
        opens = set()
        for fn in [n for n in tree.body if isinstance(n, ast.FunctionDef)]:
            for call in [n for n in ast.walk(fn) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)]:
                if call.func.attr in ("open_for_scoring", "pass_times"):
                    opens.add(fn.name)
        self.assertEqual(opens, set(SCORER_ENTRY_POINTS))
        # in the module that builds a run, the box is made by seal() and then only ever passed to one of them
        tree = ast.parse((_REPO_ROOT / "backend/model/real_run.py").read_text(encoding="utf-8"))
        handed, loose = set(), []
        ok = set()
        for call in [n for n in ast.walk(tree) if isinstance(n, ast.Call)]:
            name = call.func.id if isinstance(call.func, ast.Name) else None
            for arg in list(call.args) + [k.value for k in call.keywords]:
                if isinstance(arg, ast.Name) and arg.id == "sealed":
                    ok.add(id(arg))
                    handed.add(name)
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id == "sealed" and isinstance(node.ctx, ast.Load) and id(node) not in ok:
                loose.append(node.lineno)
        self.assertEqual(loose, [], "the sealed box is used outside a call")
        self.assertEqual(handed, set(SCORER_ENTRY_POINTS))
        self.assertIsNone(re.search(r"sealed\.", (_REPO_ROOT / "backend/model/real_run.py").read_text(encoding="utf-8")))


class ScheduleTests(unittest.TestCase):
    def test_slots_come_from_the_platform_and_the_calendar(self) -> None:
        t0, t1 = parse_start_s("2021-07-22"), parse_start_s("2021-07-24")
        slots = S.nominal_slots(("VIIRS_NOAA20", "VIIRS_SNPP"), t0, t1, -121.18, 40.05)
        self.assertEqual(len(slots), 8)                                 # two platforms, two looks a day, two days
        self.assertEqual([s.index for s in slots], list(range(8)))
        self.assertEqual(sorted(s.time_s for s in slots), [s.time_s for s in slots])
        for s in slots:
            lst = ((s.time_s % 86400.0) / 3600.0 + (-121.18) / 15.0) % 24.0
            self.assertEqual(s.is_day, 6.0 <= lst < 18.0)
            # 13:25 and 01:25 at the equator; at 40 degrees north the track crosses a little earlier by day and later by night
            self.assertAlmostEqual(lst, 13.4 if s.is_day else 1.4, delta=0.8)
            self.assertEqual((s.scan_km, s.track_km), typical_pixel_km("VIIRS"))
        self.assertEqual(S.nominal_slots((), t0, t1, 0.0, 0.0), [])

    def test_the_typical_pixel_lies_between_nadir_and_the_swath_edge(self) -> None:
        for fam, nadir in (("VIIRS", 0.375), ("MODIS", 1.0)):
            scan, track = typical_pixel_km(fam)
            n_scan, n_track = pixel_km_at_ground_distance(fam, 0.0)
            e_scan, e_track = pixel_km_at_ground_distance(fam, 1100.0)
            self.assertAlmostEqual(n_scan, nadir, delta=0.02)
            self.assertTrue(n_scan < scan and n_track < track <= e_track)
            self.assertLess(scan, 2.0 * nadir)

    def test_pixel_size_from_a_pass_time_grows_away_from_the_nominal_crossing(self) -> None:
        slot = S.nominal_slots(("VIIRS_SNPP",), parse_start_s("2021-07-22"), parse_start_s("2021-07-23"), -121.18, 40.05)[1]
        at = pixel_km_from_pass_time("VIIRS_SNPP", slot.time_s, -121.18, 40.05)
        late = pixel_km_from_pass_time("VIIRS_SNPP", slot.time_s + 2400.0, -121.18, 40.05)       # forty minutes on
        self.assertAlmostEqual(at[1], 0.362, delta=0.02)                # overhead: the nadir track size
        self.assertGreater(late[1], at[1] + 0.05)

    def test_hidden_platforms_come_from_the_archive_dates(self) -> None:
        self.assertEqual(set(ARCHIVE_FIRST_DAY), {"MODIS_TERRA", "MODIS_AQUA", "VIIRS_SNPP", "VIIRS_NOAA20", "VIIRS_NOAA21"})
        y = lambda d: parse_start_s(d)  # noqa: E731
        self.assertEqual(archive_platforms("VIIRS", y("2024-07-01"), y("2024-07-05")), ("VIIRS_NOAA20", "VIIRS_NOAA21", "VIIRS_SNPP"))
        self.assertEqual(archive_platforms("VIIRS", y("2015-07-01"), y("2015-07-05")), ("VIIRS_SNPP",))
        self.assertEqual(archive_platforms("VIIRS", y("2021-07-01"), y("2021-07-05")), ("VIIRS_NOAA20", "VIIRS_SNPP"))
        self.assertEqual(archive_platforms("VIIRS", y("2011-07-01"), y("2011-07-05")), ())
        self.assertEqual(archive_platforms("MODIS", y("2021-07-01"), y("2021-07-05")), ("MODIS_TERRA", "MODIS_AQUA"))
        self.assertEqual(S.hidden_platforms_in(None, ("VIIRS_NOAA20",), y("2021-07-01"), y("2021-07-05")), ("VIIRS_NOAA20",))
        self.assertEqual(S.hidden_platforms_in(None, None, 0.0, 1.0), ())

    def test_slot_of_takes_the_nearest_slot_of_the_same_platform(self) -> None:
        t0 = parse_start_s("2021-07-22")
        slots = S.nominal_slots(("VIIRS_NOAA20", "VIIRS_SNPP"), t0, t0 + 86400.0, -121.18, 40.05)
        day_snpp = next(s for s in slots if s.platform == "VIIRS_SNPP" and s.is_day)
        self.assertEqual(S.slot_of(slots, "VIIRS_SNPP", day_snpp.time_s + 80 * 60.0), day_snpp.index)
        self.assertNotEqual(S.slot_of(slots, "VIIRS_NOAA20", day_snpp.time_s + 80 * 60.0), day_snpp.index)
        self.assertIsNone(S.slot_of(slots, "MODIS_TERRA", day_snpp.time_s))
        self.assertIsNone(S.slot_of(slots, "VIIRS_SNPP", day_snpp.time_s + 3.0 * 86400.0))


class PublishedBeforeScoredTests(unittest.TestCase):
    def test_the_report_keeps_what_was_published_apart_from_what_was_scored(self) -> None:
        det = _det()
        r = run_blind_test(det, fx.TEST_BOX, [painted_modis_factory])
        self.assertEqual(r["protocol"]["version"], 2)
        self.assertEqual(r["schedule"]["source"], "nominal")
        self.assertTrue(r["schedule"]["blind"])
        self.assertEqual(len(r["published"]["painted_modis"]), len(r["schedule"]["slots"]))
        self.assertEqual(set(r) - set(r["from_the_scorer"]), set(r["built_without_hidden_rows"]))
        for po, tg in zip(r["methods"]["painted_modis"]["per_overpass"], r["targets"]):
            pub = r["published"]["painted_modis"][tg["slot"]]
            self.assertEqual((po["slot"], po["predicted_cells"], po["predicted_frp_mw"]), (tg["slot"], pub["predicted_cells"], pub["predicted_frp_mw"]))
            self.assertLess(abs(tg["minutes_from_slot"]), 120.0)
            self.assertEqual(r["schedule"]["slots"][tg["slot"]]["platform"], tg["platform"])
        # with the hidden rows gone the published half is the same and nothing is scored
        bare = run_blind_test(det.select(det.is_modis), fx.TEST_BOX, [painted_modis_factory])
        self.assertEqual(bare["published"], r["published"])
        self.assertEqual(bare["schedule"], r["schedule"])
        self.assertEqual(bare["scored_overpasses"], 0)

    def test_the_diagnostic_schedule_says_it_is_not_blind(self) -> None:
        det = _det()
        r = run_blind_test(det, fx.TEST_BOX, [painted_modis_factory], schedule=S.SOURCE_HIDDEN_TIMES)
        self.assertFalse(r["schedule"]["blind"])
        self.assertIn("DIAGNOSTIC", r["schedule"]["note"])
        self.assertEqual(r["built_without_hidden_rows"], [])
        self.assertEqual(r["scored_overpasses"], 13)
        self.assertEqual({abs(t["minutes_from_slot"]) for t in r["targets"]}, {0.0})
        with self.assertRaises(ValueError):
            run_blind_test(det, fx.TEST_BOX, [painted_modis_factory], schedule="guess")

    def test_training_rows_never_hold_a_row_of_a_test_box_in_the_test_year(self) -> None:
        from backend.model.training import training_detections
        from backend.terrain.live_region import PRESET_BY_ID

        b = PRESET_BY_ID["evia_greece"].bbox
        mid = (0.5 * (b.west + b.east), 0.5 * (b.south + b.north))
        row = {"latitude": str(mid[1]), "longitude": str(mid[0]), "acq_time": "1100", "satellite": "Aqua", "instrument": "MODIS",
               "frp": "10", "scan": "1", "track": "1", "daynight": "D"}
        rows = [dict(row, acq_date=d) for d in ("2021-02-03", "2021-08-05", "2021-12-01", "2020-08-05", "2022-08-05")]
        far = dict(row, latitude=str(b.north + 0.5), acq_date="2021-02-03")

        def read(box, start, end, platforms=None):
            return [dict(r) for r in rows + [far] if start <= r["acq_date"] < end]

        det, _ = training_detections(read, lambda r: (b.west - 1.0, b.south - 1.0, b.east + 1.0, b.north + 1.0), PRESET_BY_ID, regions=("evia_greece",))
        days = sorted(str(np.datetime64(int(t), "s"))[:10] for t in det.time_s)
        self.assertEqual(days, ["2020-08-05", "2021-02-03", "2022-08-05"])       # the 2021 row kept is the far one
        self.assertAlmostEqual(float(det.lat[[str(np.datetime64(int(t), "s"))[:4] == "2021" for t in det.time_s]][0]), b.north + 0.5, places=6)


if __name__ == "__main__":
    unittest.main()
