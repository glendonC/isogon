"""Area API fetch (NOAA-21 and rows after the country files) on synthetic replies; no network, no real key."""

from __future__ import annotations

import datetime as dt
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.firms import archive as fa  # noqa: E402
from backend.firms import area_api as aa  # noqa: E402

FAKE_KEY = "synthetic0area0key0for0tests"
HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"
AVAIL = {"VIIRS_NOAA21_NRT": ("2024-01-17", "2024-01-29")}


class FakeApi:
    """Answers area requests with one synthetic row per requested day inside the evia box (version 'synthetic')."""

    def __init__(self) -> None:
        self.urls: list[str] = []

    def __call__(self, url: str) -> io.BytesIO:
        self.urls.append(url)
        assert FAKE_KEY in url
        if "/api/area/csv/" in url:
            parts = url.split("/")
            days, first = int(parts[-2]), dt.date.fromisoformat(parts[-1])
            rows = "".join(
                f"38.9000,23.3000,330.0,0.4,0.4,{(first + dt.timedelta(days=i)).isoformat()},1100,N21,VIIRS,n,synthetic,290.0,5.0,D\n"
                for i in range(days)
            )
            return io.BytesIO((HEADER + rows).encode())
        if "data_availability" in url:
            return io.BytesIO(b"data_id,min_date,max_date\nVIIRS_NOAA21_NRT,2024-01-17,2024-01-29\n")
        if "mapkey_status" in url:
            return io.BytesIO(b'{"transaction_limit": 5000, "current_transactions": 7, "transaction_interval": "10 minutes"}')
        raise AssertionError(url)


class AreaApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)
        old = os.environ.get("FIRMS_MAP_KEY")
        os.environ["FIRMS_MAP_KEY"] = FAKE_KEY
        self.addCleanup(lambda: os.environ.__setitem__("FIRMS_MAP_KEY", old) if old is not None else os.environ.pop("FIRMS_MAP_KEY", None))
        self.api = FakeApi()
        self.log: list[str] = []
        self.res = aa.fetch_area("VIIRS_NOAA21", dt.date(2024, 1, 1), ["evia_greece"], cache_dir=self.cache,
                                 opener=self.api, log=self.log.append, pause_s=0)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_chunks_are_at_most_five_days_and_cover_the_availability(self) -> None:
        reqs = aa.plan_requests("VIIRS_NOAA21", dt.date(2024, 1, 1), AVAIL)
        self.assertEqual([(s, d.isoformat(), n) for s, d, n in reqs],
                         [("VIIRS_NOAA21_NRT", "2024-01-17", 5), ("VIIRS_NOAA21_NRT", "2024-01-22", 5),
                          ("VIIRS_NOAA21_NRT", "2024-01-27", 3)])
        self.assertEqual(self.res["requests_made"], 3)
        self.assertEqual(self.res["rows_fetched"], 13)

    def test_sp_first_then_nrt(self) -> None:
        avail = {"VIIRS_SNPP_SP": ("2012-01-20", "2026-03-31"), "VIIRS_SNPP_NRT": ("2026-02-01", "2026-04-08")}
        reqs = aa.plan_requests("VIIRS_SNPP", dt.date(2026, 3, 28), avail)
        self.assertEqual([(s, d.isoformat(), n) for s, d, n in reqs],
                         [("VIIRS_SNPP_SP", "2026-03-28", 4), ("VIIRS_SNPP_NRT", "2026-04-01", 5),
                          ("VIIRS_SNPP_NRT", "2026-04-06", 3)])

    def test_the_key_is_never_written_or_logged(self) -> None:
        for p in self.cache.rglob("*"):
            if p.is_file():
                self.assertNotIn(FAKE_KEY.encode(), p.read_bytes(), p.name)
        self.assertNotIn(FAKE_KEY, "\n".join(self.log))
        m = fa.read_manifest(aa.chunk_path("evia_greece", "VIIRS_NOAA21_NRT", dt.date(2024, 1, 17), 5, self.cache))
        self.assertIn("/api/area/csv/<MAP_KEY>/VIIRS_NOAA21_NRT/", m["source_url"])
        self.assertTrue(m["key_used"])
        self.assertNotIn(FAKE_KEY, str(aa.key_status(FAKE_KEY, self.api)))

    def test_errors_never_carry_the_key(self) -> None:
        def broken(url: str) -> io.BytesIO:
            raise ValueError(f"cannot open {url}")
        with self.assertRaises(RuntimeError) as ctx:
            aa._get(f"https://x/api/area/csv/{FAKE_KEY}/X/1,2,3,4/5/2024-01-01", FAKE_KEY, broken, retries=1)
        self.assertNotIn(FAKE_KEY, str(ctx.exception))
        self.assertIn("<MAP_KEY>", str(ctx.exception))

    def test_reader_serves_noaa21_and_refuses_beyond_the_fetched_days(self) -> None:
        rows = fa.read_firms(fa.region_box("evia_greece"), "2024-01-17", "2024-01-30", cache_dir=self.cache)
        self.assertEqual(len(rows), 13)
        self.assertEqual({r["_platform"] for r in rows}, {"NOAA-21"})
        self.assertEqual(rows[0]["satellite"], "N21")
        with self.assertRaises(fa.FirmsCacheMissing):
            fa.read_firms(fa.region_box("evia_greece"), "2024-01-20", "2024-02-05", cache_dir=self.cache)

    def test_second_fetch_requests_nothing_new(self) -> None:
        before = [u for u in self.api.urls if "/api/area/" in u]
        r = aa.fetch_area("VIIRS_NOAA21", dt.date(2024, 1, 1), ["evia_greece"], cache_dir=self.cache,
                          opener=self.api, log=self.log.append, pause_s=0)
        self.assertEqual(r["requests_made"], 0)
        self.assertEqual([u for u in self.api.urls if "/api/area/" in u], before)

    def test_health_counts_area_rows(self) -> None:
        s = fa.cache_summary(self.cache)
        self.assertEqual(s["area_api_rows"], 13)
        self.assertEqual(s["downloaded_rows"], 13)
        self.assertEqual(s["rows_in_region_boxes"]["evia_greece"]["NOAA-21"], 13)


if __name__ == "__main__":
    unittest.main()
