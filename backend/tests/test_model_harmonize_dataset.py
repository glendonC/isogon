"""The dataset leaves out of its scores exactly the cell-years the closed rule closes."""

from __future__ import annotations

import calendar
import unittest

import numpy as np

from backend.model.harmonize_dataset import closed_cells
from backend.model.training import closed_for


class DatasetTest(unittest.TestCase):
    def test_closed_cells_are_the_closed_rule(self) -> None:
        rng = np.random.default_rng(0)
        lat0 = np.concatenate([rng.uniform(35.0, 55.0, 200), np.arange(38.0, 42.0, 0.25), np.arange(37.0, 40.0, 0.25)])
        lon0 = np.concatenate([rng.uniform(-130.0, 30.0, 200), np.full(16, -122.5), np.full(12, 22.0)])
        years = np.arange(2012, 2026)
        got = closed_cells(lat0, lon0, 0.25, years)
        want = np.array([[closed_for((lo, la, lo + 0.25, la + 0.25), float(calendar.timegm((y, 1, 1, 0, 0, 0))),
                                     float(calendar.timegm((y + 1, 1, 1, 0, 0, 0)))) is not None for y in years]
                         for lo, la in zip(lon0, lat0)])
        np.testing.assert_array_equal(got, want)
        self.assertTrue(got.any())
        self.assertEqual(set(np.flatnonzero(got.any(axis=0))), {int(np.searchsorted(years, 2021))})


if __name__ == "__main__":
    unittest.main()
