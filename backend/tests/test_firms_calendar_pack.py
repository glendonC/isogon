"""A place's calendar from its small file where its extracts are not all there: the same answer, byte for byte."""

import json
from pathlib import Path
import shutil
import tempfile
import unittest

from backend.firms import archive as fa
from backend.firms import calendar_pack as P
from backend.firms.real_calendar import firms_calendar
from backend.tests.test_firms_calendar import _opener

# three places that are not the 2021 test fires, with a year of their run's window
PLACES: dict[str, str] = {"ventura_ca": "2017", "evros_greece": "2023", "maule_cl": "2017"}


def _bytes(cal: dict) -> bytes:
    return json.dumps(cal).encode("utf-8")


class PackRulesTest(unittest.TestCase):
    """On the synthetic fixture: when the file is served, when it is not, and a stale file refused."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)
        fa.fetch([2021], ["evia_greece"], cache_dir=self.cache, opener=_opener, log=lambda _m: None, pause_s=0)
        self.live = firms_calendar("evia_greece", self.cache, use_pack=False)
        P.build("evia_greece", self.cache)
        self.extracts = sorted((self.cache / "extract" / "evia_greece").glob("*.csv"))

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _mark_pack(self) -> None:
        path = P.pack_path("evia_greece", self.cache)
        doc = json.loads(path.read_text(encoding="utf-8"))
        doc["calendar"]["source"] = "from the pack"
        path.write_text(json.dumps(doc), encoding="utf-8")

    def test_with_every_extract_the_calendar_computes_as_before(self) -> None:
        self._mark_pack()
        self.assertEqual(firms_calendar("evia_greece", self.cache)["source"], "firms")

    def test_with_an_extract_missing_the_file_answers_the_same_bytes(self) -> None:
        self.extracts[0].unlink()
        self.assertEqual(_bytes(firms_calendar("evia_greece", self.cache)), _bytes(self.live))

    def test_an_extract_that_has_grown_is_read_not_the_file(self) -> None:
        self._mark_pack()
        lines = self.extracts[-1].read_text(encoding="utf-8").splitlines()
        with self.extracts[-1].open("a", encoding="utf-8") as fh:
            fh.write(lines[-1] + "\n")                     # one more row: the file has grown
        self.assertEqual(firms_calendar("evia_greece", self.cache)["source"], "firms")

    def test_with_no_extract_folder_the_file_answers(self) -> None:
        shutil.rmtree(self.cache / "extract" / "evia_greece")
        self.assertEqual(firms_calendar("evia_greece", self.cache), self.live)

    def test_a_file_for_another_method_or_version_is_refused(self) -> None:
        self.extracts[0].unlink()
        path = P.pack_path("evia_greece", self.cache)
        doc = json.loads(path.read_text(encoding="utf-8"))
        path.write_text(json.dumps({**doc, "served_method": "overlap_ratio_v1_other"}), encoding="utf-8")
        with self.assertRaises(P.CalendarPackStale):
            firms_calendar("evia_greece", self.cache)
        path.write_text(json.dumps({**doc, "pack_version": P.PACK_VERSION + 1}), encoding="utf-8")
        with self.assertRaises(P.CalendarPackStale):
            firms_calendar("evia_greece", self.cache)

    def test_without_file_or_extracts_the_calendar_fails_as_before(self) -> None:
        P.pack_path("evia_greece", self.cache).unlink()
        shutil.rmtree(self.cache / "extract" / "evia_greece")
        with self.assertRaises(KeyError):
            firms_calendar("evia_greece", self.cache)


class ThreePlacesTest(unittest.TestCase):
    """At three places of the page that are not the 2021 test fires, from the full cache: the calendar read from the
    file, with only the window's year of extracts beside it, gives today's answer byte for byte."""

    def test_the_file_gives_todays_answer(self) -> None:
        missing = [r for r in PLACES if not P.extract_files(r, fa.FIRMS_CACHE_DIR)]
        if missing:
            self.skipTest(f"no extracts cached for {missing}")
        with tempfile.TemporaryDirectory() as tmp:
            small = Path(tmp)
            for region, year in PLACES.items():
                live = firms_calendar(region, fa.FIRMS_CACHE_DIR, use_pack=False)
                P.build(region, fa.FIRMS_CACHE_DIR, out_dir=small)
                dst = small / "extract" / region
                dst.mkdir(parents=True)
                for f in (fa.FIRMS_CACHE_DIR / "extract" / region).glob(f"*_{year}.csv"):
                    shutil.copy2(f, dst / f.name)
                packed = firms_calendar(region, small)
                self.assertEqual(_bytes(packed), _bytes(live), region)
                self.assertEqual(packed, live, region)
                self.assertLess(P.pack_path(region, small).stat().st_size, 1_000_000)


if __name__ == "__main__":
    unittest.main()
