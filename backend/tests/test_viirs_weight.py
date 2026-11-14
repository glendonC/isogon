"""T14: the Stage 3 VIIRS weight must not depend on the VIIRS value being assimilated (LEAD ANSWER 20:03).

No test here pins the 2012 step ratio inside the G1 band: that gate must stay able to fail.
"""

from __future__ import annotations

from pathlib import Path
import sys
import unittest

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.model.solver import viirs_observation_variance  # noqa: E402

# Reconstruction RMSE against the simulated truth (MW/km2) of the five default runs before T14 (commit c8d01e1,
# T13 report). T14 must not make any of them worse.
RMSE_BEFORE_T14: dict[str, float] = {
    "plumas_ca": 10.80,
    "lytton_bc": 12.56,
    "evia_greece": 10.39,
    "novo_progresso_br": 8.75,
    "blue_mountains_au": 10.26,
}


class ViirsWeightTests(unittest.TestCase):
    def test_variance_does_not_depend_on_the_assimilated_value(self) -> None:
        obs = np.array([[0.0, 0.5, 1.2, 5.0], [12.0, 30.0, 55.0, 80.0]])
        for area in (0.14, 0.4, 1.6):
            var = viirs_observation_variance(area, obs)
            self.assertEqual(var.shape, obs.shape)
            np.testing.assert_allclose(var, var.flat[0], rtol=0, atol=1e-12, err_msg=f"area {area}")

    def test_variance_still_grows_with_footprint_area(self) -> None:
        obs = np.zeros((2, 2))
        self.assertLess(float(viirs_observation_variance(0.14, obs)[0, 0]), float(viirs_observation_variance(1.6, obs)[0, 0]))


class ReconstructionRmseTests(unittest.TestCase):
    def test_rmse_against_simulated_truth_is_no_worse_than_before(self) -> None:
        from backend.model.calibrator import get_pretrained_calibrator
        from backend.model.solver import solve_region_reconstruction
        from backend.terrain.live_region import PRESET_BY_ID, load_region_terrain

        cal = get_pretrained_calibrator()
        for rid, before in RMSE_BEFORE_T14.items():
            with self.subTest(region=rid):
                terrain = load_region_terrain(PRESET_BY_ID[rid], allow_network=False)
                if not terrain.terrain_source.startswith("aws_terrarium"):
                    self.skipTest(f"real terrain for {rid} is not cached on this machine")
                run = solve_region_reconstruction(
                    region_terrain=terrain, holdout_viirs=False, cloud_override=None, calibrator=cal
                )
                self.assertLessEqual(run.metrics["reconstructed_rmse_mw_km2"], before)


if __name__ == "__main__":
    unittest.main()
