"""Simulated pass geometry follows the orbit node (ground track heading from inclination and latitude)."""

from __future__ import annotations

import math
from pathlib import Path
import sys
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.model.sensor_physics import (  # noqa: E402
    ORBIT_ELEMENTS,
    cross_track_look_azimuth,
    ground_track_heading_deg,
    kepler_period_min,
    orbit_node,
    sun_synchronous_inclination_deg,
)

SENSORS = ("MODIS_TERRA", "MODIS_AQUA", "VIIRS_NOAA20", "VIIRS_NOAA21")


def _perpendicular_offset(az: float, heading: float) -> float:
    """Distance in degrees of (az - heading) from +/-90."""
    d = (az - heading) % 360.0
    return min(abs(d - 90.0), abs(d - 270.0))


class OrbitElementTests(unittest.TestCase):
    def test_sun_synchronous_relations(self) -> None:
        self.assertAlmostEqual(sun_synchronous_inclination_deg(824.0), 98.7, delta=0.1)
        self.assertAlmostEqual(kepler_period_min(824.0), 101.4, delta=0.2)

    def test_every_sensor_has_sourced_elements(self) -> None:
        for s in SENSORS:
            el = ORBIT_ELEMENTS[s]
            self.assertTrue(97.0 < el["inclination_deg"] < 100.0, s)
            self.assertTrue(95.0 < el["period_min"] < 105.0, s)
            self.assertTrue(el["source"], s)


class HeadingTests(unittest.TestCase):
    def test_heading_at_40n(self) -> None:
        asc = ground_track_heading_deg("MODIS_AQUA", "ascending", 40.05)
        desc = ground_track_heading_deg("MODIS_AQUA", "descending", 40.05)
        self.assertTrue(344.0 < asc < 349.0, asc)  # north, a little west of north
        self.assertTrue(191.0 < desc < 196.0, desc)  # south, a little west of south
        self.assertAlmostEqual((asc + desc) % 360.0, 180.0, delta=1e-6)

    def test_heading_moves_away_from_north_toward_high_latitude(self) -> None:
        eq = ground_track_heading_deg("VIIRS_NOAA20", "ascending", 0.0)
        mid = ground_track_heading_deg("VIIRS_NOAA20", "ascending", 50.0)
        self.assertLess(mid, eq)  # both just under 360, the higher latitude more westward

    def test_look_azimuth_is_cross_track_and_keeps_its_side(self) -> None:
        for s in SENSORS:
            for node in ("ascending", "descending"):
                h = ground_track_heading_deg(s, node, -7.15)
                east = cross_track_look_azimuth(s, node, -7.15, "east")
                west = cross_track_look_azimuth(s, node, -7.15, "west")
                self.assertLess(_perpendicular_offset(east, h), 1e-9)
                self.assertLess(_perpendicular_offset(west, h), 1e-9)
                self.assertGreater(math.sin(math.radians(east)), 0.0)
                self.assertLess(math.sin(math.radians(west)), 0.0)


class ScheduleTests(unittest.TestCase):
    def test_static_schedule_follows_the_node(self) -> None:
        from backend.model.world_model import AOI_CENTER_LAT, _build_24_frame_schedule

        for ep in _build_24_frame_schedule():
            for sensor, az in ((ep.modis_sensor, ep.modis_az_deg), (ep.viirs_sensor, ep.viirs_az_deg)):
                if sensor is None:
                    continue
                node = orbit_node(sensor, ep.is_day)
                h = ground_track_heading_deg(sensor, node, AOI_CENTER_LAT)
                # The schedule stores azimuths rounded to 3 decimals.
                self.assertLess(_perpendicular_offset(az, h), 1e-3, (ep.frame, sensor, node, az))

    def test_region_run_passes_follow_the_node(self) -> None:
        from backend.model.calibrator import get_pretrained_calibrator
        from backend.model.solver import solve_region_reconstruction
        from backend.terrain.live_region import PRESET_BY_ID, load_region_terrain

        spec = PRESET_BY_ID["lytton_bc"]
        terrain = load_region_terrain(spec, allow_network=False)
        run = solve_region_reconstruction(
            region_terrain=terrain, holdout_viirs=False, cloud_override=None, calibrator=get_pretrained_calibrator()
        )
        n = 0
        for frame in run.observer_passes["frames"]:
            for p in frame["passes"]:
                h = ground_track_heading_deg(p["sensor"], p["orbit_node"], spec.center_lat)
                self.assertLess(_perpendicular_offset(p["azimuth_deg"], h), 0.06, (frame["frame"], p["sensor"]))
                n += 1
        self.assertGreater(n, 0)


if __name__ == "__main__":
    unittest.main()
