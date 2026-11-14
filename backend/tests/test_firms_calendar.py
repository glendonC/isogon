"""The real FIRMS calendar, its overlap-ratio baseline, the held-out check and the CSV export (synthetic fixture,
no network)."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.firms import archive as fa  # noqa: E402
from backend.firms import real_calendar as rc  # noqa: E402

FIXTURE = REPO_ROOT / "backend" / "tests" / "fixtures" / "synthetic_firms"
SIMULATED_CALENDAR = REPO_ROOT / "website" / "public" / "generated" / "fields" / "calendar_2000_2026.json"


def _opener(url: str) -> io.BytesIO:
    name = url.rsplit("/", 1)[1]
    if name == fa.LISTING_NAME:
        lines = ["filename,size,updated"] + [
            f"{p.name},{p.stat().st_size},2025-06-20 14:38:18" for p in sorted(FIXTURE.glob("*.csv"))
        ]
        return io.BytesIO(("\n".join(lines) + "\n").encode())
    if name == fa.README_NAME:
        return io.BytesIO(b"synthetic")
    return io.BytesIO((FIXTURE / name).read_bytes())


class RatioTests(unittest.TestCase):
    def test_fit_ratio_is_a_ratio_of_sums_with_year_percentiles(self) -> None:
        f = rc.fit_ratio([(2012, 20, 10), (2012, 10, 5), (2013, 30, 10)])
        self.assertAlmostEqual(f["ratio"], 60 / 25)
        self.assertEqual(f["per_year"], {"2012": 2.0, "2013": 3.0})
        self.assertAlmostEqual(f["p10"], 2.1)
        self.assertAlmostEqual(f["p90"], 2.9)

    def test_leave_one_year_out_on_an_exact_ratio(self) -> None:
        pairs = [(y, 2.0 * (5 + m), 5.0 + m) for y in range(2012, 2017) for m in range(12)]
        v = rc.leave_one_year_out(pairs)
        self.assertEqual(v["held_out_years"], [2012, 2013, 2014, 2015, 2016])
        self.assertEqual(v["median_abs_relative_error_annual"], 0.0)
        self.assertEqual(v["median_abs_relative_error_without_harmonization"], 0.5)
        self.assertEqual(v["monthly_interval_coverage"], 1.0)
        self.assertEqual(v["months_tested"], 60)

    def test_held_out_year_never_fits_its_own_ratio(self) -> None:
        pairs = [(2012, 30.0, 10.0), (2013, 10.0, 10.0)]
        v = rc.leave_one_year_out(pairs)
        self.assertEqual([r["ratio_fitted_without_this_year"] for r in v["per_year"]], [1.0, 3.0])

    def test_outage_days_are_inside_the_operating_span_only(self) -> None:
        import collections

        a = collections.Counter({"2024-07-22": 200, "2024-07-23": 210, "2024-07-25": 190, "2024-07-26": 205})
        b = collections.Counter({"2024-07-21": 150, "2024-07-22": 160, "2024-07-24": 170, "2024-07-25": 40})
        gaps = rc.outage_days({"A": a, "B": b})
        # A: 07-24 has no row while B has 170; 07-21 is before A's first day, so not an outage.
        self.assertEqual(gaps["A"], {"2024-07-24"})
        # B: 07-23 has no row while A has 210; 07-26 is after B's last day.
        self.assertEqual(gaps["B"], {"2024-07-23"})
        self.assertEqual(rc.outage_days({"A": a, "B": b}, min_other=500), {"A": set(), "B": set()})

    def test_box_area(self) -> None:
        self.assertAlmostEqual(rc.box_area_km2((0.0, 0.0, 1.0, 1.0)), 12364.0, delta=12.0)


class SyntheticCalendarTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)
        fa.fetch([2021], ["evia_greece"], cache_dir=self.cache, opener=_opener, log=lambda _m: None, pause_s=0)
        self.cal = rc.firms_calendar("evia_greece", self.cache)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_schema_is_todays_plus_the_additions(self) -> None:
        sim = json.loads(SIMULATED_CALENDAR.read_text(encoding="utf-8"))
        self.assertTrue(set(sim) <= set(self.cal), set(sim) - set(self.cal))
        self.assertTrue(set(sim["records"][0]) <= set(self.cal["records"][0]))
        self.assertTrue(set(sim["annual_summary"][0]) <= set(self.cal["annual_summary"][0]))
        self.assertEqual(self.cal["source"], "firms")
        self.assertEqual(self.cal["harmonization_method"]["id"], "overlap_ratio_v1")
        self.assertIn("raw_counts", self.cal["records"][0])
        self.assertNotIn("simulat", self.cal["provenance"].lower().replace("not simulated", ""))

    def test_records(self) -> None:
        recs = {r["year_month"]: r for r in self.cal["records"]}
        self.assertEqual(sorted(recs), ["2021-08", "2021-09", "2021-10", "2021-11", "2021-12"])
        aug = recs["2021-08"]
        self.assertEqual(aug["sensor_regime"], "MODIS_SNPP_NOAA20")
        self.assertEqual(aug["raw_counts"]["Terra"], {"day": 1, "night": 0, "total": 1, "static_excluded": 0, "offshore_on_sea_excluded": 0, "outage_days": 0})
        self.assertEqual(aug["raw_counts"]["Aqua"], {"day": 1, "night": 1, "total": 2, "static_excluded": 0, "offshore_on_sea_excluded": 0, "outage_days": 0})
        self.assertEqual(aug["raw_counts"]["Suomi NPP"]["total"], 2)
        self.assertEqual(aug["raw_counts"]["NOAA-20"]["total"], 1)
        self.assertIsNone(aug["coverage_fraction"])
        # Ratio fitted on August: 2 Suomi NPP rows over 3 MODIS rows; harmonized MODIS lands on the VIIRS rate.
        self.assertAlmostEqual(self.cal["harmonization_method"]["ratio_terra_aqua"]["ratio"], round(2 / 3, 4))
        self.assertAlmostEqual(aug["harmonized_mean"], aug["viirs_raw_rate"], places=3)
        self.assertAlmostEqual(aug["modis_raw_rate"] * 2 / 3, aug["harmonized_mean"], places=3)
        sep = recs["2021-09"]
        self.assertEqual((sep["sensor_regime"], sep["state_label"]), ("NO_MODIS", "No MODIS data"))
        self.assertIsNone(sep["harmonized_mean"])
        self.assertTrue(all(v is None for v in sep["raw_counts"].values()))
        dec = recs["2021-12"]
        self.assertEqual((dec["sensor_regime"], dec["ratio_used"]), ("TERRA_ONLY", "terra_only"))
        self.assertEqual(dec["raw_counts"]["Terra"], {"day": 0, "night": 0, "total": 0, "static_excluded": 1, "offshore_on_sea_excluded": 0, "outage_days": 0})
        self.assertEqual(dec["harmonized_mean"], 0.0)
        self.assertEqual(self.cal["summary_metrics"]["static_rows_excluded"], {"Terra": 1})

    def test_csv_export_of_a_selection(self) -> None:
        body, n = rc.rows_csv("evia_greece", "2021-08-01", "2021-09-01", cache_dir=self.cache)
        rows = list(csv.DictReader(io.StringIO(body.decode())))
        self.assertEqual(n, 6)
        self.assertEqual(len(rows), 6)
        self.assertEqual(list(rows[0])[: len(rc.CSV_COLUMNS)], list(rc.CSV_COLUMNS))
        modis = next(r for r in rows if r["_platform"] == "Terra")
        self.assertEqual((modis["brightness"], modis["bright_ti4"], modis["frp"]), ("320.1", "", "40.5"))
        body, n = rc.rows_csv("evia_greece", "2021-08-01", "2021-09-01", ["Aqua"], cache_dir=self.cache)
        self.assertEqual(n, 2)
        with self.assertRaises(ValueError):
            rc.rows_csv("evia_greece", "2021-08-01", "2021-09-01", cache_dir=self.cache, max_rows=2)

    def test_unknown_products_in_the_cache_are_skipped_not_fatal(self) -> None:
        # An area API extract can reach a cache before the code that knows its product or year. A product or
        # year this code does not know must be skipped with a note, and the calendar must answer all the same.
        base = self.cache / "extract" / "evia_greece"
        (base / "viirs-noaa99_2021.csv").write_text("latitude,longitude\n38.9,23.3\n", encoding="utf-8")
        (base / "modis_notayear.csv").write_text("latitude,longitude\n38.9,23.3\n", encoding="utf-8")
        cal = rc.firms_calendar("evia_greece", self.cache)
        self.assertEqual(sorted(cal["summary_metrics"]["ignored_extracts"]),
                         ["evia_greece/modis_notayear.csv", "evia_greece/viirs-noaa99_2021.csv"])
        self.assertEqual(len(cal["records"]), 5)
        rows = fa.read_firms(fa.region_box("evia_greece"), "2021-08-01", "2021-09-01", cache_dir=self.cache)
        self.assertEqual(len(rows), 6)  # the reader never opens files of products it does not know

    def test_noaa21_is_counted_not_fitted_and_2026_stays_out(self) -> None:
        m = self.cal["harmonization_method"]
        self.assertEqual(m["platforms_in_fit"], ["Suomi NPP", "Terra", "Aqua"])
        self.assertIn("NOAA-21", m["platforms_counted_not_fitted"])
        self.assertIn("2026", m["not_in_calendar"])
        self.assertIsNone(self.cal["records"][0]["raw_counts"]["NOAA-21"])  # no NOAA-21 extract in this fixture

    def test_offshore_rows_count_inland_and_not_at_the_coast(self) -> None:
        # Type 3 (offshore) rows on the coast of Evia are fixed industrial points, while in Plumas the same type is
        # fire beside mountain lakes. Rule: leave type 3 out on sea or within 500 m of it in the context DEM.
        sea = rc.sea_lookup("evia_greece")
        if sea is None or rc.sea_lookup("plumas_ca") is None:
            self.skipTest("context terrain is not in the cache")
        self.assertTrue(sea(23.30, 38.57))       # coastal plant at Larymna, labelled offshore
        self.assertTrue(sea(24.20, 39.30))       # open Aegean
        self.assertFalse(sea(23.85, 38.62))      # inland Evia
        self.assertFalse(rc.sea_lookup("plumas_ca")(-121.30, 40.53))  # fire beside a lake in Lassen, 1,800 m up
        ext = self.cache / "extract" / "evia_greece" / "modis_2021.csv"
        with ext.open("a", encoding="utf-8") as fh:
            fh.write("38.5700,23.3000,330.0,1.0,1.0,2021-08-03,1000,Terra,MODIS,80,synthetic,295.0,9.0,D,3\n")
            fh.write("38.6200,23.8500,330.0,1.0,1.0,2021-08-03,1001,Terra,MODIS,80,synthetic,295.0,9.0,D,3\n")
        cal = rc.firms_calendar("evia_greece", self.cache)
        aug = {r["year_month"]: r for r in cal["records"]}["2021-08"]["raw_counts"]["Terra"]
        self.assertEqual((aug["total"], aug["offshore_on_sea_excluded"]), (2, 1))  # the inland one counts
        self.assertEqual(cal["summary_metrics"]["offshore_rows_on_sea_excluded"], {"Terra": 1})

    def test_unknown_region(self) -> None:
        with self.assertRaises(KeyError):
            rc.firms_calendar("blue_mountains_au", self.cache)


if __name__ == "__main__":
    unittest.main()
