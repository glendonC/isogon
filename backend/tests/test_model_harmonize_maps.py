"""The world maps put a place where the cube's grid has it: north up, row 0 the northern band."""

from __future__ import annotations

import unittest

import numpy as np

from backend.model import harmonize_maps as HM


class MapsTest(unittest.TestCase):
    def test_a_place_lands_on_its_cells_north_up(self) -> None:
        tab = {"deg": 2.0, "lat0": np.array([40.0]), "lon0": np.array([-122.0])}
        grid = HM.paint(tab, np.array([3.5]), None)
        rows, cols = np.nonzero(np.isfinite(grid))
        # the cube's row of latitude 41.9 is 719 - floor((41.9 + 90) / 0.25) = 192; of 40.1, 199
        self.assertEqual((rows.min(), rows.max()), (192, 199))
        self.assertEqual((cols.min(), cols.max()), (232, 239))
        self.assertTrue(np.all(grid[192:200, 232:240] == 3.5))

    def test_png_is_one_pixel_per_cell_and_transparent_where_nan(self) -> None:
        rgba = HM.colour(np.array([[np.nan, 1.0], [4.0, 16.0]]), HM.BLUE, 1.0, 16.0, log=True)
        self.assertEqual(rgba.shape, (2, 2, 4))
        self.assertEqual(rgba[0, 0, 3], 0)
        self.assertEqual(tuple(rgba[0, 1, :3]), HM._rgb(HM.BLUE[0]))
        self.assertEqual(tuple(rgba[1, 1, :3]), HM._rgb(HM.BLUE[-1]))


if __name__ == "__main__":
    unittest.main()
