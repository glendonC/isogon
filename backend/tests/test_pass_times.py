"""T17: every simulated pass happens within an hour of its platform's nominal day or night overpass time."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.model.sensor_physics import (  # noqa: E402
    NOMINAL_DAY_CROSSING_HR,
    ORBIT_NODE_SOURCES,
    nominal_overpass_hr,
    orbit_node,
)

SENSORS = ("MODIS_TERRA", "MODIS_AQUA", "VIIRS_NOAA20", "VIIRS_NOAA21")
TOLERANCE_HR = 1.0
STATIC_PASSES = REPO_ROOT / "website" / "public" / "generated" / "fields" / "observer_passes.json"


def _hours_apart(a: float, b: float) -> float:
    d = abs(a - b) % 24.0
    return min(d, 24.0 - d)


def _is_day(sensor: str, node: str) -> bool:
    return orbit_node(sensor, True) == node


class NominalTimeTests(unittest.TestCase):
    def test_nominal_times_follow_their_sources(self) -> None:
        self.assertEqual(
            NOMINAL_DAY_CROSSING_HR,
            {"MODIS_TERRA": 10.5, "MODIS_AQUA": 13.5, "VIIRS_NOAA20": 13.5, "VIIRS_NOAA21": 13.5},
        )
        quotes = {"MODIS_TERRA": "10:30", "MODIS_AQUA": "1:30", "VIIRS_NOAA20": "13:30", "VIIRS_NOAA21": "13:30"}
        for s in SENSORS:
            self.assertIn(quotes[s], ORBIT_NODE_SOURCES[s]["quote"], s)

    def test_night_overpass_is_twelve_hours_after_the_day_one(self) -> None:
        for s in SENSORS:
            self.assertEqual(nominal_overpass_hr(s, True), NOMINAL_DAY_CROSSING_HR[s])
            self.assertEqual(nominal_overpass_hr(s, False), (NOMINAL_DAY_CROSSING_HR[s] + 12.0) % 24.0)
        self.assertEqual(nominal_overpass_hr("MODIS_TERRA", False), 22.5)
        self.assertEqual(nominal_overpass_hr("MODIS_AQUA", False), 1.5)
        self.assertIsNone(nominal_overpass_hr("UNKNOWN", True))


class ScheduleTimeTests(unittest.TestCase):
    def test_static_schedule(self) -> None:
        from backend.model.world_model import AOI_CENTER_LON, _build_24_frame_schedule

        for ep in _build_24_frame_schedule():
            for sensor in (ep.modis_sensor, ep.viirs_sensor):
                if sensor is None:
                    continue
                nominal = nominal_overpass_hr(sensor, ep.is_day)
                self.assertLessEqual(_hours_apart(ep.lst_hr, nominal), TOLERANCE_HR, (ep.frame, sensor, ep.lst_hr))
            # The hand written UTC time agrees with the local solar time at the field's centre longitude.
            hh, mm = (int(x) for x in ep.timestamp_utc[11:16].split(":"))
            self.assertLessEqual(_hours_apart(hh + mm / 60.0 + AOI_CENTER_LON / 15.0, ep.lst_hr), 0.1, ep.frame)

    def test_static_field_file(self) -> None:
        data = json.loads(STATIC_PASSES.read_text(encoding="utf-8"))
        n = 0
        for frame in data["frames"]:
            for p in frame["passes"]:
                nominal = nominal_overpass_hr(p["sensor"], _is_day(p["sensor"], p["orbit_node"]))
                self.assertLessEqual(
                    _hours_apart(frame["local_solar_time_hr"], nominal), TOLERANCE_HR, (frame["frame"], p["sensor"])
                )
                n += 1
        self.assertGreater(n, 24)

    def test_region_run(self) -> None:
        from backend.model.calibrator import get_pretrained_calibrator
        from backend.model.solver import solve_region_reconstruction
        from backend.terrain.live_region import PRESET_BY_ID, load_region_terrain

        spec = PRESET_BY_ID["evia_greece"]
        terrain = load_region_terrain(spec, allow_network=False)
        run = solve_region_reconstruction(
            region_terrain=terrain, holdout_viirs=False, cloud_override=None, calibrator=get_pretrained_calibrator()
        )
        n = 0
        for frame in run.observer_passes["frames"]:
            lst = frame["local_solar_time_hr"]
            hh, mm = (int(x) for x in frame["timestamp_utc"][11:16].split(":"))
            self.assertLessEqual(_hours_apart(hh + mm / 60.0 + spec.center_lon / 15.0, lst), 0.05, frame["frame"])
            for p in frame["passes"]:
                nominal = nominal_overpass_hr(p["sensor"], _is_day(p["sensor"], p["orbit_node"]))
                self.assertLessEqual(_hours_apart(lst, nominal), TOLERANCE_HR, (frame["frame"], p["sensor"], lst))
                n += 1
        self.assertGreater(n, 24)


if __name__ == "__main__":
    unittest.main()
