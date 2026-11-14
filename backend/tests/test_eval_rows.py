"""FIRMS rows as arrays, overpass grouping, and the synthetic fixture (backend/eval)."""

from __future__ import annotations

import calendar
from pathlib import Path
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.overpass import group_overpasses  # noqa: E402
from backend.eval.rows import (  # noqa: E402
    detections_from_rows,
    local_solar_time_hr,
    parse_acq_time_s,
    read_csv_rows,
)
from backend.model.platforms import PLATFORMS  # noqa: E402


def _fixture_rows() -> list[dict[str, str]]:
    return read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)


def _real_schema_row(**over: str) -> dict[str, str]:
    """One hand-typed row in the layout of a FIRMS VIIRS archive file (values typed for this test, not NASA data)."""
    row = {
        "latitude": "40.0", "longitude": "-121.25", "bright_ti4": "330", "scan": "0.41", "track": "0.37",
        "acq_date": "2099-07-01", "acq_time": "948", "satellite": "N20", "instrument": "VIIRS", "confidence": "n",
        "version": "SYNTHETIC", "bright_ti5": "290", "frp": "5.5", "daynight": "N", "type": "0",
    }
    row.update(over)
    return row


class SyntheticFixtureTests(unittest.TestCase):
    def test_tracked_files_equal_the_generator(self) -> None:
        m_text, v_text = fx.fixture_texts()
        self.assertEqual((fx.FIXTURE_DIR / fx.MODIS_FILE).read_text(encoding="utf-8"), m_text)
        self.assertEqual((fx.FIXTURE_DIR / fx.VIIRS_FILE).read_text(encoding="utf-8"), v_text)

    def test_every_row_is_marked_synthetic_and_dated_2099(self) -> None:
        rows = _fixture_rows()
        self.assertGreater(len(rows), 100)
        self.assertEqual({r["version"] for r in rows}, {"SYNTHETIC"})
        self.assertEqual({r["acq_date"][:4] for r in rows}, {"2099"})
        self.assertIn("synthetic", fx.SOURCE_LABEL)
        self.assertIn("not NASA", fx.SOURCE_LABEL)

    def test_files_carry_the_firms_columns(self) -> None:
        m = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE)
        v = read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
        self.assertEqual(tuple(m[0].keys()), fx.MODIS_COLUMNS)
        self.assertEqual(tuple(v[0].keys()), fx.VIIRS_COLUMNS)


class RowParsingTests(unittest.TestCase):
    def test_time_is_utc_seconds(self) -> None:
        self.assertEqual(parse_acq_time_s("2099-07-01", "0635"), calendar.timegm((2099, 7, 1, 6, 35, 0, 0, 0, 0)))
        self.assertEqual(parse_acq_time_s("2099-07-01", "635"), parse_acq_time_s("2099-07-01", "0635"))
        self.assertEqual(parse_acq_time_s("2099-07-01", 5), calendar.timegm((2099, 7, 1, 0, 5, 0, 0, 0, 0)))
        with self.assertRaises(ValueError):
            parse_acq_time_s("2099-07-01", "2460")

    def test_fixture_parses_to_arrays_without_dropping_rows(self) -> None:
        rows = _fixture_rows()
        det = detections_from_rows(rows, fx.SOURCE_LABEL)
        self.assertEqual(len(det), len(rows))
        self.assertEqual(det.source, fx.SOURCE_LABEL)
        self.assertEqual(set(det.platform_names()), {"MODIS_TERRA", "MODIS_AQUA", "VIIRS_SNPP", "VIIRS_NOAA20"})
        self.assertEqual(int(det.is_modis.sum()), 44)
        self.assertEqual(int(det.is_viirs.sum()), 229)
        # MODIS confidence is a number, VIIRS confidence a class
        self.assertTrue(np.all(np.isfinite(det.confidence[det.is_modis])))
        self.assertTrue(np.all(np.isnan(det.confidence[det.is_viirs])))
        self.assertEqual(set(det.confidence_class[det.is_viirs].tolist()), {"n", "h"})
        self.assertTrue(np.all(det.frp_mw > 0))

    def test_reader_platform_key_and_satellite_column_agree(self) -> None:
        a = detections_from_rows([_real_schema_row()], "test row")
        b = detections_from_rows([_real_schema_row(_platform="NOAA-20")], "test row")
        self.assertEqual(a.platform_names(), ["VIIRS_NOAA20"])
        self.assertEqual(b.platform_names(), ["VIIRS_NOAA20"])
        c = detections_from_rows([_real_schema_row(satellite="N")], "test row")
        self.assertEqual(c.platform_names(), ["VIIRS_SNPP"])
        self.assertEqual(float(a.time_s[0]), calendar.timegm((2099, 7, 1, 9, 48, 0, 0, 0, 0)))
        self.assertFalse(bool(a.is_day[0]))

    def test_unreadable_values_raise_instead_of_defaulting(self) -> None:
        with self.assertRaises(ValueError):
            detections_from_rows([_real_schema_row(satellite="Landsat")], "test row")
        with self.assertRaises(ValueError):
            detections_from_rows([_real_schema_row(daynight="X")], "test row")
        row = _real_schema_row()
        del row["scan"]
        with self.assertRaises(ValueError):
            detections_from_rows([row], "test row")

    def test_local_solar_time(self) -> None:
        t = parse_acq_time_s("2099-07-01", "2135")
        self.assertAlmostEqual(float(local_solar_time_hr(t, -121.25)), 21.0 + 35.0 / 60.0 - 121.25 / 15.0, places=6)

    def test_box_selection_keeps_edges(self) -> None:
        det = detections_from_rows(_fixture_rows(), fx.SOURCE_LABEL)
        self.assertEqual(int(det.in_box(fx.CONTEXT_BOX).sum()), len(det))
        self.assertEqual(int(det.in_box(fx.TEST_BOX).sum()), len(det) - 1)  # the day four burn lies outside


class OverpassTests(unittest.TestCase):
    def test_fixture_groups_into_one_overpass_per_platform_and_time(self) -> None:
        rows = _fixture_rows()
        det = detections_from_rows(rows, fx.SOURCE_LABEL)
        passes = group_overpasses(det)
        expected = {(r["satellite"], r["acq_date"], r["acq_time"]) for r in rows}
        self.assertEqual(len(passes), len(expected))
        covered = np.concatenate([p.index for p in passes])
        self.assertEqual(sorted(covered.tolist()), list(range(len(det))))
        times = [p.time_s for p in passes]
        self.assertEqual(times, sorted(times))
        for p in passes:
            self.assertIn(p.platform, PLATFORMS)
            self.assertEqual(len(set(det.platform_code[p.index].tolist())), 1)

    def test_successive_orbits_split_and_one_pass_stays_whole(self) -> None:
        rows = [
            _real_schema_row(acq_time="0948"),
            _real_schema_row(acq_time="0951", latitude="40.1"),
            _real_schema_row(acq_time="1128", latitude="40.2"),
        ]
        passes = group_overpasses(detections_from_rows(rows, "test rows"))
        self.assertEqual([p.n for p in passes], [2, 1])
        self.assertEqual(passes[0].family, "VIIRS")
        self.assertFalse(passes[0].is_day)

    def test_local_time_of_a_midnight_pass_is_not_averaged_to_noon(self) -> None:
        # 08:04 and 08:06 UTC at 121 W straddle local midnight (23:59 and 00:01)
        rows = [
            _real_schema_row(acq_time="0803", longitude="-121.0"),
            _real_schema_row(acq_time="0805", longitude="-121.0", latitude="40.1"),
        ]
        p = group_overpasses(detections_from_rows(rows, "test rows"))[0]
        self.assertTrue(p.lst_hr > 23.9 or p.lst_hr < 0.1, p.lst_hr)


if __name__ == "__main__":
    unittest.main()
