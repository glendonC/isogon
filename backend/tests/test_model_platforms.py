"""Platform facts used for real FIRMS rows (backend/model/platforms.py)."""

from __future__ import annotations

from pathlib import Path
import sys
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.model import platforms as P  # noqa: E402
from backend.model.sensor_physics import ORBIT_DAY_NODE, ORBIT_ELEMENTS, SENSOR_CODES  # noqa: E402


class PlatformTests(unittest.TestCase):
    def test_codes_extend_the_simulated_engine_codes_without_changing_them(self) -> None:
        for name, code in SENSOR_CODES.items():
            self.assertEqual(P.PLATFORM_CODES[name], code)
        self.assertEqual(P.PLATFORM_CODES["VIIRS_SNPP"], 4)
        # the stage reads a code of 2 or more as VIIRS
        for name, code in P.PLATFORM_CODES.items():
            self.assertEqual(code >= 2, P.family(name) == "VIIRS")

    def test_the_simulated_engine_tables_are_untouched(self) -> None:
        self.assertNotIn("VIIRS_SNPP", SENSOR_CODES)
        self.assertNotIn("VIIRS_SNPP", ORBIT_ELEMENTS)
        self.assertNotIn("VIIRS_SNPP", ORBIT_DAY_NODE)

    def test_firms_satellite_values_map_to_platforms(self) -> None:
        self.assertEqual(P.platform_from_firms("Terra", "MODIS"), "MODIS_TERRA")
        self.assertEqual(P.platform_from_firms("A", "MODIS"), "MODIS_AQUA")
        self.assertEqual(P.platform_from_firms("N", "VIIRS"), "VIIRS_SNPP")
        self.assertEqual(P.platform_from_firms("N20", "VIIRS"), "VIIRS_NOAA20")
        self.assertEqual(P.platform_from_firms("N21", "VIIRS"), "VIIRS_NOAA21")
        with self.assertRaises(ValueError):
            P.platform_from_firms("N", "MODIS")
        with self.assertRaises(ValueError):
            P.platform_from_firms("GOES-16", "ABI")

    def test_nodes_follow_the_day_side_crossing(self) -> None:
        self.assertEqual(P.node("MODIS_TERRA", True), "descending")
        self.assertEqual(P.node("MODIS_AQUA", True), "ascending")
        self.assertEqual(P.node("VIIRS_SNPP", True), "ascending")
        self.assertEqual(P.node("VIIRS_SNPP", False), "descending")

    def test_scan_axis_is_across_the_track_and_an_axis(self) -> None:
        for name in P.PLATFORMS:
            for day in (True, False):
                for lat in (-33.0, 0.0, 38.9, 50.2):
                    ax = P.scan_axis_deg(name, day, lat)
                    self.assertTrue(0.0 <= ax < 180.0)
                    head = P.track_heading_deg(name, day, lat)
                    diff = abs(((ax - head + 90.0) % 180.0) - 90.0)
                    self.assertAlmostEqual(diff, 90.0, places=6)
        # sun-synchronous tracks run within about 25 degrees of north to south at these latitudes, so the scan
        # axis lies within about 25 degrees of east to west
        ax = P.scan_axis_deg("MODIS_AQUA", True, 40.0)
        self.assertLess(abs(ax - 90.0), 25.0)
        self.assertEqual(P.scan_axis_deg("VIIRS_SNPP", True, 40.0), P.scan_axis_deg("VIIRS_NOAA20", True, 40.0))

    def test_altitudes(self) -> None:
        self.assertEqual(P.altitude_km("MODIS_TERRA"), 705.0)
        self.assertEqual(P.altitude_km("VIIRS_SNPP"), 825.2)


if __name__ == "__main__":
    unittest.main()
