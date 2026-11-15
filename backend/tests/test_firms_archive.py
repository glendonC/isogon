"""The FIRMS fetcher, cache, manifests and reader, on a synthetic fixture (no network)."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.firms import archive as fa  # noqa: E402

FIXTURE = REPO_ROOT / "backend" / "tests" / "fixtures" / "synthetic_firms"
FILES = ("modis_2021_Greece.csv", "viirs-snpp_2021_Greece.csv", "viirs-jpss1_2021_Greece.csv")
FAKE_KEY = "synthetic0key0for0tests0only"


def _listing() -> bytes:
    lines = ["filename,size,updated", "AttributesReadme.txt,9,2025-06-23 13:53:50"]
    for name in FILES:
        lines.append(f"{name},{(FIXTURE / name).stat().st_size},2025-06-20 14:38:18")
    lines.append("modis_2022_Greece.csv,123,2025-06-20 14:38:18")  # listed, never fetched here
    return ("\n".join(lines) + "\n").encode()


class FakeOpener:
    """Serves the synthetic fixture for the country file URLs; records every URL asked for."""

    def __init__(self) -> None:
        self.urls: list[str] = []

    def __call__(self, url: str) -> io.BytesIO:
        self.urls.append(url)
        name = url.rsplit("/", 1)[1]
        if name == fa.LISTING_NAME:
            return io.BytesIO(_listing())
        if name == fa.README_NAME:
            return io.BytesIO(b"synthetic")
        return io.BytesIO((FIXTURE / name).read_bytes())


def _rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


class FirmsArchiveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)
        self.opener = FakeOpener()
        self.log: list[str] = []
        old = os.environ.get("FIRMS_MAP_KEY")
        os.environ["FIRMS_MAP_KEY"] = FAKE_KEY
        self.addCleanup(lambda: os.environ.__setitem__("FIRMS_MAP_KEY", old) if old is not None else os.environ.pop("FIRMS_MAP_KEY", None))
        fa.fetch([2021], ["evia_greece"], cache_dir=self.cache, opener=self.opener, log=self.log.append, pause_s=0)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_raw_files_and_manifests(self) -> None:
        for name in FILES:
            product = name.split("_")[0]
            raw = fa.raw_path(product, 2021, "Greece", self.cache)
            self.assertEqual(raw.read_bytes(), (FIXTURE / name).read_bytes(), "kept exactly as downloaded")
            m = fa.read_manifest(raw)
            self.assertEqual(m["sha256"], hashlib.sha256(raw.read_bytes()).hexdigest())
            self.assertEqual(m["bytes"], raw.stat().st_size)
            self.assertEqual(m["rows"], len(_rows(FIXTURE / name)))
            self.assertEqual(m["source_url"], fa.country_file_url(product, 2021, "Greece"))
            self.assertEqual(m["versions"], {"synthetic": m["rows"]})
            for key in ("query", "retrieved_utc", "columns", "acq_date_range", "terms"):
                self.assertIn(key, m)

    def test_extract_keeps_box_rows_unmodified_and_drops_duplicates(self) -> None:
        ext = fa.extract_path("evia_greece", "modis", 2021, self.cache)
        got = _rows(ext)
        src = _rows(FIXTURE / "modis_2021_Greece.csv")
        self.assertEqual(len(got), 4)  # 6 rows: one exact duplicate, one outside the box
        self.assertEqual(got, [src[0], src[1], src[4], src[5]])
        m = fa.read_manifest(ext)
        self.assertEqual((m["rows"], m["duplicates_dropped"]), (4, 1))
        self.assertEqual(m["platform_rows"], {"Terra": 2, "Aqua": 2})
        self.assertEqual(m["box_wsen"], list(fa.region_box("evia_greece")))
        self.assertEqual(m["lineage"]["from_sha256"], fa.read_manifest(fa.raw_path("modis", 2021, "Greece", self.cache))["sha256"])

    def test_reader_returns_every_column_for_a_box_and_window(self) -> None:
        box = fa.region_box("evia_greece")
        rows = fa.read_firms(box, "2021-08-03", "2021-08-04", cache_dir=self.cache)
        self.assertEqual([r["_platform"] for r in rows], ["Terra", "Suomi NPP", "Aqua", "NOAA-20"])
        self.assertEqual([r["_acq_utc"] for r in rows],
                         ["2021-08-03T09:15:00Z", "2021-08-03T10:50:00Z", "2021-08-03T11:05:00Z", "2021-08-03T11:40:00Z"])
        modis_cols = _rows(FIXTURE / "modis_2021_Greece.csv")[0].keys()
        viirs_cols = _rows(FIXTURE / "viirs-snpp_2021_Greece.csv")[0].keys()
        self.assertEqual(set(rows[0]) - {"_platform", "_product", "_acq_utc"}, set(modis_cols))
        self.assertEqual(set(rows[1]) - {"_platform", "_product", "_acq_utc"}, set(viirs_cols))
        for c in fa.REQUIRED_COLUMNS:
            self.assertIn(c, rows[0])
        self.assertEqual(rows[0]["frp"], "40.5")  # values as the source wrote them
        self.assertEqual(rows[1]["latitude"], "38.90012")
        # End is exclusive, start inclusive; a platform filter; a smaller box.
        self.assertEqual(len(fa.read_firms(box, "2021-08-03T09:15:00Z", "2021-08-03T11:05:00Z", cache_dir=self.cache)), 2)
        self.assertEqual([r["_platform"] for r in fa.read_firms(box, "2021-08-01", "2021-09-01", ["Aqua"], self.cache)],
                         ["Aqua", "Aqua"])
        small = (23.25, 38.85, 23.35, 38.95)
        self.assertEqual(len(fa.read_firms(small, "2021-08-03", "2021-08-04", cache_dir=self.cache)), 4)
        self.assertEqual(len(fa.read_firms(small, "2021-08-04", "2021-08-06", cache_dir=self.cache)), 0)

    def test_reader_refuses_what_the_cache_cannot_answer(self) -> None:
        with self.assertRaises(fa.FirmsCacheMissing):
            fa.read_firms((10.0, 10.0, 11.0, 11.0), "2021-08-01", "2021-08-02", cache_dir=self.cache)
        with self.assertRaises(fa.FirmsCacheMissing):  # 2022 is published but not fetched
            fa.read_firms(fa.region_box("evia_greece"), "2022-08-01", "2022-08-02", cache_dir=self.cache)
        with self.assertRaises(fa.FirmsCacheMissing):  # 2023 is not published at all: no data, not no fire
            fa.read_firms(fa.region_box("evia_greece"), "2023-08-01", "2023-08-02", cache_dir=self.cache)
        # A product the source does not publish for a year is not an error: 2021 to 2021 only.
        self.assertEqual(len(fa.read_firms(fa.region_box("evia_greece"), "2021-12-31", "2022-01-01", cache_dir=self.cache)), 1)

    def test_the_key_is_never_written_or_logged(self) -> None:
        self.assertEqual(fa.map_key_state(), "set")
        for p in self.cache.rglob("*"):
            if p.is_file():
                self.assertNotIn(FAKE_KEY.encode(), p.read_bytes(), p.name)
        self.assertNotIn(FAKE_KEY, "\n".join(self.log))
        self.assertTrue(all(FAKE_KEY not in u for u in self.opener.urls))
        self.assertEqual(fa.redact_key(f"https://x/api/area/csv/{FAKE_KEY}/MODIS_SP/1,2,3,4/5/2021-08-01", FAKE_KEY),
                         "https://x/api/area/csv/<MAP_KEY>/MODIS_SP/1,2,3,4/5/2021-08-01")

    def test_cache_summary_counts_rows(self) -> None:
        s = fa.cache_summary(self.cache)
        self.assertEqual(s["downloaded_rows"], 6 + 3 + 1)
        self.assertEqual(s["downloaded_files"], 3)
        # every region of the country file gets its extract; the fixture's rows all lie in Evia's box
        want = {r: {} for r, c in fa.REGION_COUNTRY.items() if c == "Greece"}
        want["evia_greece"] = {"Terra": 2, "Aqua": 2, "Suomi NPP": 2, "NOAA-20": 1}
        self.assertEqual(s["rows_in_region_boxes"], want)

    def test_second_fetch_downloads_nothing(self) -> None:
        before = len(self.opener.urls)
        fa.fetch([2021], ["evia_greece"], cache_dir=self.cache, opener=self.opener, log=self.log.append, pause_s=0)
        self.assertEqual(self.opener.urls[before:], [f"{fa.COUNTRY_BASE_URL}/{fa.LISTING_NAME}",
                                                     f"{fa.COUNTRY_BASE_URL}/{fa.README_NAME}"])


class DiskCapTests(unittest.TestCase):
    def test_fetch_refuses_past_the_cap(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(RuntimeError):
                fa.fetch([2021], ["evia_greece"], cache_dir=Path(tmp), opener=FakeOpener(), cap_bytes=100,
                         log=lambda _m: None, pause_s=0)
            self.assertFalse((Path(tmp) / "raw").exists())


if __name__ == "__main__":
    unittest.main()
