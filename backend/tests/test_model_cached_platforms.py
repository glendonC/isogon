"""A pass of a platform whose rows were never fetched is no hidden pass: the run and the round leave it out.

From the extracts' manifests (the days each covers), never from a row. On made-up manifests, on the synthetic fixture
and on the cache of the three first regions.
"""

from __future__ import annotations

import calendar
from pathlib import Path
import sys
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.rows import detections_from_rows  # noqa: E402
from backend.model import cached_platforms as CP  # noqa: E402
from backend.tests.test_model_hidden_rows import CASES, ROWS6, _without_the_scorer  # noqa: E402
from backend.tests.test_model_run_challenger import _solve  # noqa: E402


def _t(y: int, m: int, d: int) -> float:
    return float(calendar.timegm((y, m, d, 0, 0, 0, 0, 0, 0)))


def _manifests(have: dict[str, dict | None]):
    def read(region, product, year):
        return have.get(product)
    return read


COUNTRY = {"rows": 10, "lineage": {"from": "raw/country.csv"}}


class ManifestTests(unittest.TestCase):
    def test_what_an_extract_covers(self) -> None:
        self.assertEqual(CP.covered_days(COUNTRY, 2024), ("2024-01-01", "2024-12-31"))
        self.assertEqual(CP.covered_days({"covered_days": ["2024-03-01", "2024-08-02"], "lineage": {"source": "area_api"}}, 2024),
                         ("2024-03-01", "2024-08-02"))
        self.assertIsNone(CP.covered_days({"lineage": {"source": "area_api"}}, 2024))
        self.assertIsNone(CP.covered_days(None, 2024))

    def test_noaa_21_without_an_extract_is_left_out_and_the_others_kept(self) -> None:
        read = _manifests({"modis": COUNTRY, "viirs-snpp": COUNTRY, "viirs-jpss1": COUNTRY, "viirs-noaa21": None})
        kept, left = CP.platforms_with_rows((0, 0, 1, 1), "VIIRS", _t(2025, 8, 15), _t(2025, 8, 18), read, region_id="r")
        self.assertEqual(kept, ("VIIRS_NOAA20", "VIIRS_SNPP"))
        self.assertEqual(list(left), ["VIIRS_NOAA21"])
        self.assertIn("not in the cache", left["VIIRS_NOAA21"])

    def test_an_extract_that_stops_inside_the_window_does_not_cover_it(self) -> None:
        short = {"covered_days": ["2024-01-01", "2024-08-16"], "lineage": {"source": "area_api"}}
        read = _manifests({"modis": COUNTRY, "viirs-snpp": COUNTRY, "viirs-jpss1": COUNTRY, "viirs-noaa21": short})
        _, left = CP.platforms_with_rows((0, 0, 1, 1), "VIIRS", _t(2024, 8, 15), _t(2024, 8, 18), read, region_id="r")
        self.assertEqual(list(left), ["VIIRS_NOAA21"])

    def test_before_noaa_21_flies_nothing_is_left_out(self) -> None:
        read = _manifests({"modis": COUNTRY, "viirs-snpp": COUNTRY, "viirs-jpss1": COUNTRY})
        kept, left = CP.platforms_with_rows((0, 0, 1, 1), "VIIRS", _t(2021, 8, 1), _t(2021, 8, 4), read, region_id="r")
        self.assertEqual((kept, left), (("VIIRS_NOAA20", "VIIRS_SNPP"), {}))

    def test_a_window_the_cache_holds_nothing_of_leaves_nothing_out(self) -> None:
        kept, left = CP.platforms_with_rows((0, 0, 1, 1), "VIIRS", _t(2099, 7, 1), _t(2099, 7, 4), _manifests({}), region_id="r")
        self.assertEqual(left, {})
        self.assertIn("VIIRS_NOAA21", kept)

    def test_a_box_in_no_cached_region_leaves_nothing_out(self) -> None:
        kept, left = CP.platforms_with_rows((100.0, 0.0, 100.5, 0.5), "VIIRS", _t(2025, 1, 1), _t(2025, 1, 3))
        self.assertEqual(left, {})


def _noaa21_out(box, family, t0, t1):
    from backend.model.platforms import archive_platforms

    flying = archive_platforms(family, t0, t1)
    return tuple(p for p in flying if p != "VIIRS_NOAA21"), ({"VIIRS_NOAA21": "made up for the test"} if "VIIRS_NOAA21" in flying else {})


class RunTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from backend.model import real_run as RR

        cls.RR = RR
        cls.plain = _solve(ROWS6)
        cls.left = cls._solve_left(ROWS6)

    @classmethod
    def _solve_left(cls, rows):
        from unittest import mock

        real = cls.RR.solve_real_reconstruction

        def solve(*a, **k):
            return real(*a, **{**k, "platforms_cached": _noaa21_out})

        with mock.patch.object(cls.RR, "solve_real_reconstruction", solve):
            return _solve(rows)

    def test_a_platform_without_rows_has_no_frame_no_hidden_pass_and_no_score(self) -> None:
        self.assertIn("VIIRS_NOAA21", [f["sensor"] for f in self.plain.observer_passes["frames"]])
        frames = self.left.observer_passes["frames"]
        self.assertNotIn("VIIRS_NOAA21", [f["sensor"] for f in frames])
        self.assertNotIn("VIIRS_NOAA21", self.left.extras["hidden_platforms"])
        slots = self.left.extras["blind_test"]["schedule"]["slots"]
        self.assertNotIn("VIIRS_NOAA21", {s["platform"] for s in slots})
        self.assertEqual(list(self.left.extras["platforms_without_rows_in_the_cache"]), ["VIIRS_NOAA21"])
        self.assertEqual(self.plain.extras["platforms_without_rows_in_the_cache"], {})

    def test_with_a_platform_left_out_the_run_is_still_blind_to_the_hidden_rows(self) -> None:
        want = _without_the_scorer(self.left)
        for case, rows in CASES.items():
            got = self._solve_left(rows)
            self.assertEqual(_without_the_scorer(got), want, case)


class RoundTests(unittest.TestCase):
    def test_a_round_has_no_look_of_a_platform_without_rows_and_says_so(self) -> None:
        from backend.env.next_look import NextLookEnv

        det = detections_from_rows(fx.extended_rows(), fx.SOURCE_LABEL)
        window = (float(det.time_s.min()), float(det.time_s.max()) + 1.0)
        plain = NextLookEnv(det, fx.TEST_BOX, window, schedule="cmr", read_passes=fx.fixture_pass_reader())
        left = NextLookEnv(det, fx.TEST_BOX, window, schedule="cmr", read_passes=fx.fixture_pass_reader(),
                           platforms_cached=_noaa21_out)
        self.assertIn("VIIRS_NOAA21", {s.platform for s in plain._slots})
        self.assertNotIn("VIIRS_NOAA21", {s.platform for s in left._slots})
        self.assertLess(left.n_looks, plain.n_looks)
        self.assertEqual(list(left.describe()["platforms_without_rows_in_the_cache"]), ["VIIRS_NOAA21"])
        self.assertEqual(plain.describe()["platforms_without_rows_in_the_cache"], {})


class CacheTests(unittest.TestCase):
    def test_the_three_first_regions_hold_noaa_21_where_the_area_api_was_fetched(self) -> None:
        from backend.firms.archive import FIRMS_CACHE_DIR

        if not (FIRMS_CACHE_DIR / "extract" / "lytton_bc" / "viirs-noaa21_2023.csv.manifest.json").is_file():
            self.skipTest("no cached NOAA-21 extract of lytton_bc")
        kept, left = CP.platforms_with_rows((0, 0, 0, 0), "VIIRS", _t(2023, 8, 18), _t(2023, 8, 21), region_id="lytton_bc")
        self.assertIn("VIIRS_NOAA21", kept)
        self.assertEqual(left, {})


if __name__ == "__main__":
    unittest.main()
