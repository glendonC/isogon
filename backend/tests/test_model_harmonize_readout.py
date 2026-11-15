"""The calendar's records carry each month's counts as counted and on one scale, so the Record's readout does no
arithmetic (synthetic fixture, no network)."""

import calendar
from pathlib import Path
import tempfile
import unittest

from backend.firms import archive as fa
from backend.firms import real_calendar as rc
from backend.tests.test_firms_calendar import _opener


class ReadoutFieldsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)
        fa.fetch([2021], ["evia_greece"], cache_dir=self.cache, opener=_opener, log=lambda _m: None, pause_s=0)
        self.cal = rc.firms_calendar("evia_greece", self.cache)
        self.recs = {r["year_month"]: r for r in self.cal["records"]}

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_a_month_gives_each_instruments_count_and_the_one_scale_count_with_its_range(self) -> None:
        aug = self.recs["2021-08"]
        self.assertEqual((aug["modis_rows"], aug["viirs_rows"]), (3, 2))
        self.assertLessEqual(aug["harmonized_rows_p10"], aug["harmonized_rows"])
        self.assertLessEqual(aug["harmonized_rows"], aug["harmonized_rows_p90"])
        # the count is the rate as a count in the box that month
        k = self.cal["box_area_km2"] / 1000.0 * calendar.monthrange(2021, 8)[1]
        self.assertAlmostEqual(aug["harmonized_rows"], aug["harmonized_mean"] * k, delta=0.0001 * k + 0.01)
        self.assertAlmostEqual(aug["harmonized_rows_p90"], aug["harmonized_p90"] * k, delta=0.0001 * k + 0.01)

    def test_a_month_without_modis_has_no_count_and_terra_alone_counts_terra(self) -> None:
        sep = self.recs["2021-09"]
        self.assertIsNone(sep["modis_rows"])
        self.assertIsNone(sep["harmonized_rows"])
        dec = self.recs["2021-12"]
        self.assertEqual(dec["modis_rows"], 0)
        self.assertGreaterEqual(dec["harmonized_rows"], 0.0)

    def test_the_year_sums_its_months(self) -> None:
        a = {y["year"]: y for y in self.cal["annual_summary"]}[2021]
        rs = [r for r in self.cal["records"] if r["year"] == 2021]
        self.assertEqual(a["modis_rows"], sum(r["modis_rows"] for r in rs if r["modis_rows"] is not None))
        self.assertEqual(a["viirs_rows"], sum(r["viirs_rows"] for r in rs if r["viirs_rows"] is not None))
        months = [r["harmonized_rows"] for r in rs if r["harmonized_rows"] is not None]
        self.assertEqual(a["harmonized_months"], len(months))
        self.assertAlmostEqual(a["harmonized_rows"], sum(months), delta=0.05 * len(months) + 0.05)
        self.assertLessEqual(a["harmonized_rows_p10"], a["harmonized_rows"])
        self.assertLessEqual(a["harmonized_rows"], a["harmonized_rows_p90"])
        self.assertIn("harmonized_rows", self.cal["units"])


if __name__ == "__main__":
    unittest.main()
