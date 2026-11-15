"""The fresh test after its plan: its rows, its pass lists, the second baseline's ratio, and one episode's blind test.

On made-up files and on the synthetic fixture. The run of an episode must be the blind test in use: the same report
as `run_blind_test` gives on the same rows, box, window, pass list and methods.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import schedule as S  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.baselines import overlap_ratio_factory, painted_modis_factory  # noqa: E402
from backend.eval.blind_test import run_blind_test  # noqa: E402
from backend.eval.rows import detections_from_rows, parse_acq_time_s  # noqa: E402
from backend.model import fresh_test as F  # noqa: E402
from backend.model import fresh_world as W  # noqa: E402
from backend.model import fresh_world_run as R  # noqa: E402
from backend.model.calendar_ratio import calendar_ratio  # noqa: E402
from backend.model.fitted import load_params, load_ratio_fit  # noqa: E402
from backend.model.real_blind import reconstruction_factory  # noqa: E402

ROWS = fx.extended_rows()
T0 = min(parse_acq_time_s(r["acq_date"], r["acq_time"]) for r in ROWS)
T1 = max(parse_acq_time_s(r["acq_date"], r["acq_time"]) for r in ROWS) + 1.0
PID = F.place_id(F.place_of(-121.2, 40.0))


def _ep(**kw) -> dict:
    return {"key": f"{PID}:2099:22", "place_id": PID, "box": list(fx.TEST_BOX), "start_s": T0, "end_s": T1,
            "continent": "North America", "zone": "temperate", "first_overpass_utc": "2099-07-01T00:00:00Z", **kw}


def _rows_step(counts=None) -> dict:
    return {"counts": {PID: counts or {"2015-07": {"Terra": 10, "Aqua": 10, "Suomi NPP": 30},
                                       "2016-07": {"Terra": 5, "Aqua": 15, "Suomi NPP": 20}}},
            "deliver_months": {p: ["2015-07", "2016-07", "2099-07"] for p in ("Terra", "Aqua", "Suomi NPP")},
            "outage_days": {"Terra": [], "Aqua": [], "Suomi NPP": []}}


class PlaceIdTests(unittest.TestCase):
    def test_every_place_id_names_its_place(self) -> None:
        for i in range(0, 144, 7):
            for j in range(0, 72, 5):
                self.assertEqual(R.place_of_id(F.place_id((i, j))), (i, j))


class PlanOnRecordTests(unittest.TestCase):
    def test_a_plan_whose_digest_or_protocol_differs_is_refused(self) -> None:
        doc = {"protocol_sha256": F.protocol_sha256(), "episodes": {r: [] for r in F.ROLES}}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "plan.json"
            W.write_plan(doc, path)
            self.assertEqual(R.load_plan(path)["plan_sha256"], F.plan_sha256(doc))
            bad = json.loads(path.read_text())
            bad["episodes"]["test_a"] = [{"key": "x"}]
            path.write_text(json.dumps(bad))
            with self.assertRaises(ValueError):
                R.load_plan(path)
            W.write_plan({**doc, "protocol_sha256": "0" * 64}, path)
            with self.assertRaises(ValueError):
                R.load_plan(path)


class RowsTests(unittest.TestCase):
    def test_a_file_s_rows_are_kept_inside_the_chosen_windows_and_counted_by_month(self) -> None:
        modis = [r for r in ROWS if r["instrument"] == "MODIS"]
        typed = [{**r, "type": "2" if k == 0 else "0"} for k, r in enumerate(modis)]
        far = {**typed[1], "longitude": "10.0", "latitude": "10.0"}
        cols = list(typed[0])
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "modis_2099_X.csv"
            path.write_text(",".join(cols) + "\n" + "\n".join(",".join(r[c] for c in cols) for r in typed + [far]) + "\n")
            mid = 0.5 * (T0 + T1)
            tg = {PID: [("early", T0 - 1.0, mid), ("late", mid, T1)]}
            out = R._collect_one((str(path), "modis", 2099, "X", tmp, json.dumps(tg)))
            kept = sum(out["rows_kept"].values())
            inside = [r for r in typed[1:] if W._places_of(float(r["longitude"]), float(r["latitude"]))
                      and PID in [F.place_id(p) for p in W._places_of(float(r["longitude"]), float(r["latitude"]))]]
            self.assertEqual(kept, len(inside))
            self.assertEqual(out["counts"], {})                       # 2099 is no year the ratio counts
            early = (Path(tmp) / "rows" / "early" / "modis_2099_X.csv").read_text().splitlines()
            self.assertEqual(early[0].split(","), list(R.ROW_COLUMNS))
            self.assertTrue(all(line.split(",")[-1] in ("Terra", "Aqua") for line in early[1:]))
            moved = [dict(r, acq_date=r["acq_date"].replace("2099", "2015")) for r in typed]
            path.write_text(",".join(cols) + "\n" + "\n".join(",".join(r[c] for c in cols) for r in moved) + "\n")
            out = R._collect_one((str(path), "modis", 2015, "X", tmp, json.dumps(tg)))
            self.assertEqual(sum(sum(v.values()) for v in out["counts"][PID].values()), len(inside))


class RatioTests(unittest.TestCase):
    def test_the_place_s_ratio_is_the_record_s_rule_without_the_years_of_the_run(self) -> None:
        cal = R.place_calendar(PID, _rows_step())
        r = calendar_ratio(PID, exclude_year=(2099,), firms_calendar=lambda _r: cal)
        self.assertAlmostEqual(r.ratio, (30 + 20) / (20 + 20))
        r16 = calendar_ratio(PID, exclude_year=(2016,), firms_calendar=lambda _r: cal)
        self.assertAlmostEqual(r16.ratio, 30 / 20)

    def test_a_month_with_an_outage_day_is_left_out(self) -> None:
        step = _rows_step()
        step["outage_days"]["Aqua"] = ["2016-07-04"]
        cal = R.place_calendar(PID, step)
        self.assertIn("2016-07", cal["harmonization_method"]["overlap_months_excluded_for_outages"])
        self.assertAlmostEqual(calendar_ratio(PID, exclude_year=(2099,), firms_calendar=lambda _r: cal).ratio, 1.5)


class PassReaderTests(unittest.TestCase):
    def test_kept_granules_give_a_pass_with_its_time_at_the_box(self) -> None:
        w, s, e, n = fx.TEST_BOX
        poly = f"{s - 5} {w - 6} {s - 5} {e + 6} {n + 5} {e + 6} {n + 5} {w - 6} {s - 5} {w - 6}"
        entry = {"id": "G1", "time_start": "2099-07-01T09:40:00.000Z", "time_end": "2099-07-01T09:46:00.000Z",
                 "polygons": [[poly]], "day_night_flag": "DAY"}
        with tempfile.TemporaryDirectory() as tmp:
            dest = R._pass_file(Path(tmp), "k", "VIIRS_SNPP")
            dest.parent.mkdir(parents=True)
            dest.write_bytes(gzip.compress(json.dumps({"url": "u", "entries": [entry]}).encode()))
            read = R.pass_reader(Path(tmp), "k")
            got = read(fx.TEST_BOX, "2099-07-01T00:00:00Z", "2099-07-02T00:00:00Z", platforms=["VIIRS_SNPP"])
            self.assertEqual(len(got), 1)
            self.assertTrue(got[0]["box_inside"])
            self.assertIn("time_at_box", got[0])
            slots, left = S.pass_slots(("VIIRS_SNPP",), parse_acq_time_s("2099-07-01", "0000"),
                                       parse_acq_time_s("2099-07-02", "0000"), fx.TEST_BOX, read)
            self.assertEqual(len(slots), 1)
            with self.assertRaises(LookupError):
                read(fx.TEST_BOX, "2099-07-01T00:00:00Z", "2099-07-02T00:00:00Z", platforms=["VIIRS_NOAA20"])


class EpisodeRunTests(unittest.TestCase):
    def test_an_episode_s_run_is_the_blind_test_in_use(self) -> None:
        ep = _ep()
        cols = list(R.ROW_COLUMNS)
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            (work / "rows_step.json").write_text(json.dumps(_rows_step()))
            dest = work / "rows" / ep["key"] / "all.csv"
            dest.parent.mkdir(parents=True)
            rows = [{**r, "type": r.get("type", "0"), "_platform": ""} for r in ROWS]
            dest.write_text(",".join(cols) + "\n" + "\n".join(",".join(str(r.get(c, "")) for c in cols) for r in rows) + "\n")
            R._CACHE.clear()
            params = load_params().as_dict()
            with mock.patch.object(R, "pass_reader", lambda _w, _k: fx.fixture_pass_reader()):
                got = R.run_episode(ep, params, work)
            det = detections_from_rows(R.episode_rows(work, ep["key"]), R.ROWS_SOURCE)
            ratio = calendar_ratio(PID, exclude_year=(2099,), firms_calendar=lambda _r: R.place_calendar(PID, _rows_step()))
            from backend.model.occupancy import OccupancyParams

            want = run_blind_test(det, fx.TEST_BOX, [painted_modis_factory, overlap_ratio_factory(load_ratio_fit(), ratio),
                                                     reconstruction_factory(OccupancyParams(**params))],
                                  window=(T0, T1), schedule=S.SOURCE_CMR, read_passes=fx.fixture_pass_reader())
            want.pop("definitions", None)
            want["episode"] = ep["key"]
            self.assertEqual(json.dumps(got, sort_keys=True, default=str), json.dumps(want, sort_keys=True, default=str))
            self.assertGreater(got["scored_overpasses"], 0)

    def test_the_record_counts_both_ways_and_lists_what_was_not_scored(self) -> None:
        ep = _ep()
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            (work / "rows_step.json").write_text(json.dumps(_rows_step()))
            dest = work / "rows" / ep["key"] / "all.csv"
            dest.parent.mkdir(parents=True)
            cols = list(R.ROW_COLUMNS)
            dest.write_text(",".join(cols) + "\n" + "\n".join(",".join(str({**r, "_platform": ""}.get(c, "")) for c in cols) for r in ROWS) + "\n")
            R._CACHE.clear()
            with mock.patch.object(R, "pass_reader", lambda _w, _k: fx.fixture_pass_reader()):
                rep = R.run_episode(ep, load_params().as_dict(), work)
            other = _ep(key=f"{PID}:2099:33", continent="Europe", zone="boreal")
            plan = {"plan_sha256": "p", "episodes": {"test_a": [ep, other]}}
            doc = R.record_look(plan, "test_a", [(ep["key"], rep, None), (other["key"], None, "LookupError: no rows")],
                                {"which": "values in use"}, work)
        self.assertEqual(doc["episodes_scored"], 1)
        self.assertEqual(doc["unscored"], {other["key"]: "LookupError: no rows"})
        self.assertEqual(doc["per_episode"][0]["counted_by"], "plain comparison")
        self.assertEqual(doc["judged"]["all"]["episodes"], 1)
        self.assertIn("why_no_interval", doc["judged"]["all"])
        self.assertEqual(doc["judged"]["by_continent"]["Europe"], {"episodes": 0})
        self.assertEqual(doc["look_name"], F.LOOK_NAMES["test_a"])


if __name__ == "__main__":
    unittest.main()
