"""D6: the CMR pass schedule: fetch, cache, manifests, pass files and the reader, on recorded replies (no network)."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.firms import cmr_passes as cp  # noqa: E402
from backend.firms.archive import region_box  # noqa: E402

FIX = REPO_ROOT / "backend" / "tests" / "fixtures" / "cmr_recorded"
RECORDED = {
    "C2271754179-LPCLOUD": (FIX / "MOD14_plumas_ca_2021-08-01.json").read_bytes(),
    "C2734202914-LPCLOUD": (FIX / "VNP14IMG_plumas_ca_2021-08-01.json").read_bytes(),
}
EMPTY = b'{"feed": {"entry": []}}'


class RecordedCmr:
    """Serves the recorded replies (gzip, as CMR does when asked), an empty feed for other collections."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, str]]] = []

    def __call__(self, url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
        self.calls.append((url, headers))
        cid = url.split("collection_concept_id=")[1].split("&")[0]
        body = RECORDED.get(cid, EMPTY) if "2021-08" in url else EMPTY
        n = len(json.loads(body)["feed"]["entry"])
        return 200, {"cmr-hits": str(n), "content-encoding": "gzip"}, gzip.compress(body)


class FetchAndCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)
        self.api = RecordedCmr()
        self.res = cp.fetch("2021-08", "2021-08", ["plumas_ca"], cache_dir=self.cache, opener=self.api,
                            log=lambda _m: None, pause_s=0)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_one_request_per_collection_month_and_manifests(self) -> None:
        self.assertEqual(self.res["months_planned"], 4)  # NOAA-21 starts 2023
        self.assertEqual(self.res["requests"], 4)
        self.assertEqual(self.res["granules"], 5)
        url, headers = self.api.calls[0]
        self.assertIn("collection_concept_id=C2271754179-LPCLOUD", url)
        self.assertIn("bounding_box=-122.48,39.1,-119.88,41.0", url)
        self.assertIn("temporal=2021-08-01T00:00:00Z,2021-08-31T23:59:59Z", url)
        self.assertEqual(headers.get("Accept-Encoding"), "gzip")
        raw = cp.raw_dir("plumas_ca", "MODIS_TERRA", self.cache) / "2021-08_p1.json.gz"
        m = json.loads(raw.with_name(raw.name + ".manifest.json").read_text())
        body = gzip.decompress(raw.read_bytes())
        self.assertEqual(m["sha256"], hashlib.sha256(body).hexdigest())
        self.assertEqual((m["hits"], m["entries"], m["json_bytes"]), (2, 2, len(body)))
        for key in ("url", "retrieved_utc", "bytes_transferred", "stored_bytes", "query"):
            self.assertIn(key, m)

    def test_second_fetch_requests_nothing(self) -> None:
        n = len(self.api.calls)
        cp.fetch("2021-08", "2021-08", ["plumas_ca"], cache_dir=self.cache, opener=self.api, log=lambda _m: None, pause_s=0)
        self.assertEqual(len(self.api.calls), n)

    def test_reader_lists_every_pass_with_share_day_night_and_cloud(self) -> None:
        box = region_box("plumas_ca")
        passes = cp.cmr_passes(box, "2021-08-01", "2021-08-02", cache_dir=self.cache)
        self.assertEqual([(p["platform"], p["time_start"][11:16], p["day_night"]) for p in passes], [
            ("MODIS_TERRA", "06:25", "NIGHT"), ("VIIRS_SNPP", "10:12", "NIGHT"), ("MODIS_TERRA", "18:25", "DAY"),
            ("VIIRS_SNPP", "19:54", "DAY"), ("VIIRS_SNPP", "21:36", "DAY"),
        ])
        terra = [p for p in passes if p["platform"] == "MODIS_TERRA"]
        self.assertEqual([p["cloud_cover_pct"] for p in terra], [5.0, 31.0])
        self.assertTrue(all(p["cloud_cover_pct"] is None for p in passes if p["platform"] == "VIIRS_SNPP"))
        for p in passes:
            self.assertTrue(0.0 < p["box_share"] <= 1.0)
            self.assertEqual(p["box_inside"], p["box_share"] >= 1.0)
        # A smaller box and tiles, a time window, a platform filter.
        pack = (-121.44, 39.86, -120.92, 40.24)
        west, east = (-121.44, 39.86, -121.18, 40.24), (-121.18, 39.86, -120.92, 40.24)
        sub = cp.cmr_passes(pack, "2021-08-01T18:00:00Z", "2021-08-01T20:00:00Z", tiles=[west, east], cache_dir=self.cache)
        self.assertEqual([p["platform"] for p in sub], ["MODIS_TERRA", "VIIRS_SNPP"])
        self.assertTrue(all(len(p["tile_shares"]) == 2 for p in sub))
        only = cp.cmr_passes(box, "2021-08-01", "2021-08-02", platforms=["VIIRS_SNPP"], cache_dir=self.cache)
        self.assertEqual(len(only), 3)

    def test_reader_refuses_what_is_not_cached(self) -> None:
        with self.assertRaises(cp.CmrCacheMissing):
            cp.cmr_passes(region_box("plumas_ca"), "2021-09-01", "2021-09-02", cache_dir=self.cache)
        with self.assertRaises(cp.CmrCacheMissing):
            cp.cmr_passes((10.0, 10.0, 11.0, 11.0), "2021-08-01", "2021-08-02", cache_dir=self.cache)
        # NOAA-21 did not fly in 2021: not an error, simply no pass.
        self.assertEqual(cp.cmr_passes(region_box("plumas_ca"), "2021-08-01", "2021-08-02", ["VIIRS_NOAA21"],
                                       cache_dir=self.cache), [])


class PagingTests(unittest.TestCase):
    def test_follows_cmr_search_after(self) -> None:
        entries = json.loads(RECORDED["C2734202914-LPCLOUD"])["feed"]["entry"]
        calls: list[dict[str, str]] = []

        def opener(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
            calls.append(headers)
            if "CMR-Search-After" not in headers:
                body = {"feed": {"entry": entries[:2]}}
                return 200, {"cmr-hits": "3", "cmr-search-after": "[1,2]"}, json.dumps(body).encode()
            return 200, {"cmr-hits": "3"}, json.dumps({"feed": {"entry": entries[2:]}}).encode()

        with tempfile.TemporaryDirectory() as tmp:
            res = cp.fetch_month("plumas_ca", "VIIRS_SNPP", 2021, 8, Path(tmp), opener, pause_s=0)
            self.assertEqual((res["pages"], res["entries"], res["hits"]), (2, 3, 3))
            self.assertEqual(calls[1].get("CMR-Search-After"), "[1,2]")
            cp.build_pass_file("plumas_ca", "VIIRS_SNPP", 2021, Path(tmp))
            pf = json.loads(cp.pass_file("plumas_ca", "VIIRS_SNPP", 2021, Path(tmp)).read_text())
            self.assertEqual(len(pf["granules"]), 3)


class GeometryTests(unittest.TestCase):
    def test_edges_follow_great_circles(self) -> None:
        # The north edge from (-140, 40) to (-110, 40) bulges north to about 41.6 at -125 along its great circle.
        ring = [[-140.0, 40.0], [-110.0, 40.0], [-110.0, 20.0], [-140.0, 20.0], [-140.0, 40.0]]
        dense = cp.densify(ring)
        self.assertTrue(cp._inside(-125.0, 40.8, dense))
        straight = [tuple(p) for p in ring]
        self.assertFalse(cp._inside(-125.0, 40.8, straight))

    def test_consecutive_granules_form_one_pass(self) -> None:
        g = lambda t0, t1: {"time_start": t0, "time_end": t1}  # noqa: E731
        groups = cp._group([g("2021-08-01T06:20:00Z", "2021-08-01T06:25:00Z"), g("2021-08-01T06:25:00Z", "2021-08-01T06:30:00Z"),
                            g("2021-08-01T08:00:00Z", "2021-08-01T08:05:00Z")])
        self.assertEqual([len(x) for x in groups], [2, 1])


if __name__ == "__main__":
    unittest.main()
