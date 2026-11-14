"""Observer passes carry orbit_node from the platform and the day or night side."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.model.sensor_physics import ORBIT_DAY_NODE, ORBIT_NODE_SOURCES, orbit_node  # noqa: E402

FIELDS = REPO_ROOT / "website" / "public" / "generated" / "fields"


class OrbitNodeRuleTests(unittest.TestCase):
    def test_rule(self) -> None:
        self.assertEqual(orbit_node("MODIS_TERRA", True), "descending")
        self.assertEqual(orbit_node("MODIS_TERRA", False), "ascending")
        for s in ("MODIS_AQUA", "VIIRS_NOAA20", "VIIRS_NOAA21"):
            self.assertEqual(orbit_node(s, True), "ascending", s)
            self.assertEqual(orbit_node(s, False), "descending", s)
        self.assertIsNone(orbit_node("UNKNOWN", True))

    def test_every_platform_has_a_recorded_source(self) -> None:
        self.assertEqual(set(ORBIT_DAY_NODE), set(ORBIT_NODE_SOURCES))
        for sensor, src in ORBIT_NODE_SOURCES.items():
            self.assertTrue(src["url"].startswith("https://"), sensor)
            self.assertTrue(src["quote"], sensor)


def _check_payload(test: unittest.TestCase, payload: dict) -> int:
    rule = payload.get("orbit_node_rule")
    test.assertIsInstance(rule, dict)
    test.assertIn("sources", rule)
    n = 0
    for frame in payload["frames"]:
        for p in frame["passes"]:
            test.assertEqual(p["orbit_node"], orbit_node(p["sensor"], bool(frame["is_day"])), (frame["frame"], p["sensor"]))
            n += 1
    return n


class ObserverPayloadTests(unittest.TestCase):
    def test_static_observer_passes(self) -> None:
        payload = json.loads((FIELDS / "observer_passes.json").read_text(encoding="utf-8"))
        self.assertGreater(_check_payload(self, payload), 0)

    def test_region_run_observer_passes(self) -> None:
        from backend.model.calibrator import get_pretrained_calibrator
        from backend.model.solver import solve_region_reconstruction
        from backend.terrain.live_region import PRESET_BY_ID, load_region_terrain

        terrain = load_region_terrain(PRESET_BY_ID["plumas_ca"], allow_network=False)
        run = solve_region_reconstruction(
            region_terrain=terrain, holdout_viirs=False, cloud_override=None, calibrator=get_pretrained_calibrator()
        )
        self.assertGreater(_check_payload(self, run.observer_passes), 0)


if __name__ == "__main__":
    unittest.main()
