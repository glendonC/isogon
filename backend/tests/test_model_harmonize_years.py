import unittest

import numpy as np

from backend.model import harmonize_places as PL
from backend.model import harmonize_years as Y


class YearlyLayerTest(unittest.TestCase):
    def test_yearly_sum_adds_the_months_of_each_year(self):
        months = np.arange(10, 10 + 14)                     # November 2000 to December 2001
        v = np.ones((2, months.size), dtype=np.float32)
        v[1, :2] = np.nan                                   # no value in 2000
        out = Y.yearly_sum(v, months, years=(2000, 2001, 2002))
        self.assertEqual(out[0].tolist()[:2], [2.0, 12.0])
        self.assertTrue(np.isnan(out[1, 0]))
        self.assertEqual(out[1, 1], 12.0)
        self.assertTrue(np.isnan(out[:, 2]).all())

    def test_grid_is_nan_where_not_loaded_and_zero_where_loaded_without_a_value(self):
        loaded = np.zeros((720, 1440), dtype=np.uint8)
        loaded[0, :3] = 1
        g = Y.grid_of(np.array([1]), np.array([5.0]), loaded)
        self.assertEqual(g.dtype, np.float32)
        self.assertEqual(g.shape, (720, 1440))
        self.assertEqual(g[0, :3].tolist(), [0.0, 5.0, 0.0])
        self.assertTrue(np.isnan(g[0, 3]) and np.isnan(g[719, 0]))


class ContinentTest(unittest.TestCase):
    def test_every_country_has_a_continent_of_the_list(self):
        self.assertTrue(set(PL.CONTINENT_OF.values()) <= set(PL.CONTINENTS))
        for c in PL.SPLIT_CONTINENT:
            self.assertNotIn(c, PL.CONTINENT_OF)

    def test_the_russian_federation_is_cut_at_60_east(self):
        self.assertEqual(PL.continent_of("Russian_Federation", 37.6), "Europe")
        self.assertEqual(PL.continent_of("Russian_Federation", 104.3), "Asia")
        self.assertEqual(PL.continent_of("Russian_Federation", -175.0), "Asia")
        self.assertEqual(PL.continent_of("Egypt", 33.8), "Africa")
        self.assertEqual(PL.continent_of("Greenland", -40.0), "North America")
        self.assertIsNone(PL.continent_of("Atlantis", 0.0))


if __name__ == "__main__":
    unittest.main()
