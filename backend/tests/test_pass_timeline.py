"""The pass timeline, GET /api/passes.

The first tests use the recorded CMR replies of `fixtures/cmr_recorded` and a few FIRMS rows written here (no
network, no FIRMS cache). The last class reads the real caches over HTTP and skips without them.
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
import sys
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.firms import cmr_passes as cp  # noqa: E402
from backend.firms.cmr_passes import CmrCacheMissing  # noqa: E402
from backend.firms.pass_timeline import pass_timeline  # noqa: E402
from backend.tests.test_cmr_passes import RecordedCmr  # noqa: E402

PACK = (-121.44, 39.86, -120.92, 40.24)      # plumas_ca's pack box


def _row(lat: float, lon: float, when: dt.datetime, satellite: str, instrument: str, typ: str = "0") -> dict[str, str]:
    """A FIRMS row as the archive reader returns it (written for this test; not a NASA record)."""
    return {"latitude": f"{lat}", "longitude": f"{lon}", "acq_date": when.strftime("%Y-%m-%d"),
            "acq_time": when.strftime("%H%M"), "satellite": satellite, "instrument": instrument, "frp": "12.5",
            "scan": "1.0", "track": "1.0", "daynight": "D", "confidence": "80", "type": typ, "version": "TEST"}


class BoxCloudTests(unittest.TestCase):
    """The cloud share over the box shown beside each pass: read from the store's cloud files, display only."""

    def test_each_pass_reads_its_satellite_s_share_or_says_why_it_is_not_measured(self) -> None:
        from backend.firms.pass_timeline import box_cloud, cloud_store_key

        with tempfile.TemporaryDirectory() as tmp:
            day = Path(tmp) / "cloud" / "plumas_ca" / "2012-08-10"
            day.mkdir(parents=True)
            shares = {"MODIS_TERRA": {"share": 0.006813, "pixel_km": 1.71}, "MODIS_AQUA": {"share": 0.002125},
                      "VIIRS_SNPP": {"share": 0.009252}, "VIIRS_NOAA20": {"share": None}}
            (day / "day.json").write_text(json.dumps({"box": list(PACK), "platforms": shares, "retrieved_utc": "x"}))
            other = Path(tmp) / "cloud" / "plumas_ca" / "2012-08-11"
            other.mkdir()
            (other / "day.json").write_text(json.dumps({"box": [0, 0, 1, 1], "platforms": shares}))
            p = lambda plat, t, dn="DAY": {"platform": plat, "time_mid": t, "day_night": dn}  # noqa: E731
            got = box_cloud("plumas_ca", [
                p("MODIS_TERRA", "2012-08-10T18:40:00Z"),                 # a share
                p("VIIRS_NOAA20", "2012-08-10T21:00:00Z"),                # the layer has no valid pixel
                p("VIIRS_SNPP", "2012-08-10T10:00:00Z", "NIGHT"),         # no night file
                p("VIIRS_NOAA21", "2012-08-10T20:00:00Z"),                # no layer at all
                p("MODIS_AQUA", "2012-08-11T21:00:00Z"),                  # a file of another box
                p("MODIS_TERRA", "2021-07-20T18:40:00Z"),                 # a closed window: never read
            ], Path(tmp))
            self.assertEqual((got[0]["share"], got[0]["layer"], got[0]["when"], got[0]["day"]),
                             (0.0068, "MODIS_Terra_Cloud_Fraction_Day", "day", "2012-08-10"))
            self.assertTrue(all(g["share"] is None and g["state"] == "not measured" for g in got[1:]))
            self.assertIn("no valid pixel", got[1]["why"])
            self.assertIn("no cloud share", got[2]["why"])
            self.assertIn("no cloud layer", got[3]["why"])
            self.assertIn("no cloud share", got[4]["why"])
            self.assertIn("recorded test fire", got[5]["why"])
            key = cloud_store_key("plumas_ca", Path(tmp))
            (Path(tmp) / "cloud" / "plumas_ca" / "2012-08-12").mkdir()
            self.assertNotEqual(cloud_store_key("plumas_ca", Path(tmp)), key)
            self.assertEqual(cloud_store_key("lytton_bc", Path(tmp)), ())


class FixtureTimelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.cache = Path(cls.tmp.name)
        cp.fetch("2021-08", "2021-08", ["plumas_ca"], cache_dir=cls.cache, opener=RecordedCmr(), log=lambda _m: None, pause_s=0)
        passes = cp.cmr_passes(PACK, "2021-08-01", "2021-08-02", cache_dir=cls.cache)
        cls.terra = next(p for p in passes if p["platform"] == "MODIS_TERRA" and p["day_night"] == "DAY")
        mid = dt.datetime.fromisoformat(cls.terra["time_mid"].replace("Z", "+00:00"))
        cls.rows = [
            _row(40.00, -121.20, mid, "Terra", "MODIS"),
            _row(40.01, -121.21, mid, "Terra", "MODIS", typ="2"),           # a static land source, counted apart
            _row(40.90, -120.10, mid, "Terra", "MODIS"),                    # in the context box, not the pack box
            _row(40.02, -121.22, dt.datetime(2021, 8, 1, 14, 0, tzinfo=dt.timezone.utc), "N", "VIIRS"),  # no pass then
        ]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def _timeline(self, **kw: object) -> dict:
        args = {"region_id": "plumas_ca", "start": "2021-08-01", "end": "2021-08-02", "cache_dir": self.cache,
                "read_firms": lambda box, t0, t1, platforms=None: list(self.rows)}
        args.update(kw)
        return pass_timeline(**args)

    def test_every_pass_with_what_firms_saw_on_it(self) -> None:
        tl = self._timeline()
        self.assertEqual({p["platform"] for p in tl["passes"]}, {"MODIS_TERRA", "VIIRS_SNPP"})
        hit = [p for p in tl["passes"] if p["firms_detection_in_box"]]
        self.assertEqual(len(hit), 1)
        p = hit[0]
        self.assertEqual((p["time_start"], p["platform"]), (self.terra["time_start"], "MODIS_TERRA"))
        self.assertEqual((p["firms_pixels_in_box"], p["firms_static_pixels_in_box"]), (2, 1))
        self.assertEqual(p["cloud_cover_pct"], self.terra["cloud_cover_pct"])
        for q in tl["passes"]:
            self.assertGreater(q["box_share"], 0.0)
            self.assertIn(q["day_night"], ("DAY", "NIGHT", "BOTH"))
        self.assertTrue(all(q["cloud_cover_pct"] is None for q in tl["passes"] if q["platform"] == "VIIRS_SNPP"))
        self.assertEqual(tl["firms_overpasses_without_a_pass"], [{"platform": "VIIRS_SNPP", "time_utc": "2021-08-01T14:00:00Z", "pixels": 1}])
        s = tl["summary"]["MODIS_TERRA"]
        self.assertEqual((s["passes"], s["with_detection"], s["without_detection"]), (2, 1, 1))
        self.assertEqual(tl["known_gaps"], [])

    def test_with_viirs_hidden_its_passes_carry_nothing_firms_saw(self) -> None:
        full = self._timeline()
        held = self._timeline(hidden="VIIRS")
        self.assertEqual(held["hidden"], "VIIRS")
        for p in held["passes"]:
            if p["platform"].startswith("VIIRS_"):
                self.assertEqual({k for k in p if k.startswith("firms_")}, {"firms_withheld"})
        self.assertEqual(held["firms_overpasses_without_a_pass"], [])
        self.assertEqual(held["summary"]["VIIRS_SNPP"], {"passes": full["summary"]["VIIRS_SNPP"]["passes"], "firms_withheld": True})
        modis = lambda tl: [p for p in tl["passes"] if p["platform"].startswith("MODIS_")]  # noqa: E731
        self.assertEqual(modis(held), modis(full))
        # nothing of it depends on the hidden rows: deleting every VIIRS row leaves the answer as it was
        bare = self._timeline(hidden="VIIRS", read_firms=lambda box, t0, t1, platforms=None:
                              [r for r in self.rows if r["instrument"] != "VIIRS"])
        self.assertEqual(bare, held)
        with self.assertRaises(ValueError):
            self._timeline(hidden="SAR")
        # the cloud of a hidden pass goes with its detections; on this closed window none is read for any pass
        for p in held["passes"]:
            want = "withheld" if p["platform"].startswith("VIIRS_") else "not measured"
            self.assertEqual((p["box_cloud"]["share"], p["box_cloud"]["state"]), (None, want))
        self.assertIn("display only", held["box_cloud_what"].replace("For display only", "display only"))

    def test_the_context_box_and_a_platform_filter(self) -> None:
        tl = self._timeline(box="context")
        hit = [p for p in tl["passes"] if p["firms_detection_in_box"]]
        self.assertEqual(hit[0]["firms_pixels_in_box"], 3)              # the row outside the pack box counts here
        only = self._timeline(platforms=["VIIRS_SNPP"])
        self.assertEqual({p["platform"] for p in only["passes"]}, {"VIIRS_SNPP"})
        self.assertEqual(set(only["collections"]), {"VIIRS_SNPP"})

    def test_requests_are_checked(self) -> None:
        with self.assertRaises(KeyError):
            self._timeline(region_id="blue_mountains_au")
        for bad in ({"end": "2021-08-01"}, {"start": "2021-01-01", "end": "2022-02-01"}, {"box": "tile"},
                    {"platforms": ["GOES"]}, {"start": "first of August"}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self._timeline(**bad)
        with self.assertRaises(CmrCacheMissing):
            self._timeline(start="2021-09-01", end="2021-09-03")

    def test_a_known_gap_is_named_in_its_window(self) -> None:
        from backend.firms import pass_timeline as pt

        gaps = [g for g in pt.KNOWN_GAPS if g["platform"] == "VIIRS_NOAA20"]
        self.assertEqual(gaps[0]["until"], "2018-07-01")


def _cached() -> bool:
    from backend.firms import archive as fa

    return fa.extract_path("plumas_ca", "viirs-snpp", 2021).is_file() and cp.pass_file("plumas_ca", "VIIRS_SNPP", 2021).is_file()


class RealTimelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not _cached():
            raise unittest.SkipTest("FIRMS rows or CMR passes for plumas_ca 2021 are not cached")
        from backend.tests import test_server_http as http_tests

        cls.req = staticmethod(http_tests._req)

    def _get(self, q: str) -> tuple[int, dict]:
        status, _, raw = self.req("/api/passes?" + q)
        return status, json.loads(raw)

    def test_the_dixie_window_over_http(self) -> None:
        status, tl = self._get("region_id=plumas_ca&start=2021-07-22&end=2021-07-25")
        self.assertEqual(status, 200, tl)
        self.assertGreater(len(tl["passes"]), 30)
        self.assertEqual(tl["firms_overpasses_without_a_pass"], [])   # every FIRMS overpass of 2021 has its pass
        self.assertTrue(all(p["firms_detection_in_box"] for p in tl["passes"]))    # the Dixie fire: every pass saw it
        self.assertEqual(set(tl["summary"]), {"MODIS_TERRA", "MODIS_AQUA", "VIIRS_SNPP", "VIIRS_NOAA20"})
        status, quiet = self._get("region_id=plumas_ca&start=2021-06-01&end=2021-06-04")
        self.assertEqual(status, 200)
        self.assertFalse(any(p["firms_detection_in_box"] for p in quiet["passes"]))  # before it, none did
        self.assertGreater(sum(1 for p in quiet["passes"] if p["box_inside"]), 30)

    def test_the_season_agrees_with_the_cross_check_against_firms(self) -> None:
        status, tl = self._get("region_id=plumas_ca&start=2021-06-01&end=2021-10-01")
        self.assertEqual(status, 200)
        self.assertEqual(len(tl["passes"]), 1319)
        self.assertEqual(sum(1 for p in tl["passes"] if p["firms_detection_in_box"]), 413)

    def test_a_short_collection_is_named_and_its_firms_overpasses_listed(self) -> None:
        status, tl = self._get("region_id=plumas_ca&start=2018-04-01&end=2018-06-01&box=context&platforms=VIIRS_NOAA20")
        self.assertEqual(status, 200, tl)
        self.assertEqual([g["platform"] for g in tl["known_gaps"]], ["VIIRS_NOAA20"])
        self.assertGreater(len(tl["firms_overpasses_without_a_pass"]), 30)

    def test_errors(self) -> None:
        self.assertEqual(self._get("region_id=plumas_ca&start=2026-01-01&end=2026-01-05")[0], 404)   # CMR not fetched
        self.assertEqual(self._get("region_id=blue_mountains_au&start=2021-07-22&end=2021-07-25")[0], 404)
        self.assertEqual(self._get("region_id=plumas_ca&start=2021-07-25&end=2021-07-22")[0], 400)
        self.assertEqual(self._get("region_id=plumas_ca&start=2021-07-22")[0], 400)


if __name__ == "__main__":
    unittest.main()
