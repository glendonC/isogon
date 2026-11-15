import json
import unittest

import numpy as np

from backend.model import harmonize_cells as C
from backend.model import harmonize_countries as HC
from backend.model import harmonize_years as Y

MONTHS = np.arange(10, 10 + 26 * 12 - 10)            # November 2000 to December 2025, from January 2000
J2013 = 13 * 12 - 10                                  # January 2013's column
J2021 = 21 * 12 - 10


def _cells(n: int) -> dict:
    z = np.zeros((n, MONTHS.size), dtype=np.float32)
    return {"months": MONTHS, "lon0": np.array([10.0, 100.0, 30.0][:n]),
            "n_T": z.copy(), "n_A": z.copy(), "n_S": z.copy(), "n_J": z.copy()}


def _part(idx, mo, plat, rows) -> dict:
    return {"idx": np.array(idx, dtype=np.int64), "mo": np.array(mo, dtype=np.int64),
            "plat": np.array(plat, dtype=np.int64), "rows": np.array(rows, dtype=np.float64)}


class SharedCellTest(unittest.TestCase):
    def setUp(self):
        # cell 0 is shared by A and B; in January 2013 MODIS saw 3 rows of A and 1 of B, in February 2013 none
        self.cells = _cells(2)
        self.cells["n_T"][0, J2013] = 3 + 1
        self.cells["n_S"][0, J2013] = 6 + 2
        self.cells["n_S"][0, J2013 + 1] = 2           # B's only: so B gets all of the month MODIS saw nothing
        self.cells["n_T"][1, J2021] = 5                # cell 1 is closed in 2021
        self.harm = np.zeros_like(self.cells["n_T"])
        self.harm[0, J2013], self.harm[0, J2013 + 1], self.harm[1, J2021] = 20.0, 7.0, 15.0
        self.parts = [("A", _part([0, 0], [J2013, J2013], [0, 2], [3, 6])),
                      ("B", _part([0, 0, 0], [J2013, J2013, J2013 + 1], [0, 2, 2], [1, 2, 2])),
                      ("C", _part([1], [J2021], [0], [5]))]
        self.closed = np.array([False, True])

    def test_each_country_takes_its_share_and_the_shares_add_up_to_the_cell(self):
        s = HC.unit_sums(self.parts, self.cells, self.harm, self.closed)
        names, g = HC.group(s, 0)
        j = HC.YEARS.index(2013)
        h = dict(zip(names, g["harmonized"][:, j]))
        # MODIS month: 20 split 3 to 1; the month MODIS saw nothing: 7 by the shares of the cell's Suomi NPP rows
        # over every month, A 6 of 10 and B 4 of 10
        self.assertAlmostEqual(h["A"], 15.0 + 7.0 * 0.6)
        self.assertAlmostEqual(h["B"], 5.0 + 7.0 * 0.4)
        self.assertAlmostEqual(h["A"] + h["B"], self.harm[0].sum())
        self.assertEqual(dict(zip(names, g["detected"]["suomi_npp"][:, j])), {"A": 6.0, "B": 4.0, "C": 0.0})

    def test_the_closed_cells_are_left_out_in_2021(self):
        s = HC.unit_sums(self.parts, self.cells, self.harm, self.closed)
        names, g = HC.group(s, 0)
        i, j = names.index("C"), HC.YEARS.index(2021)
        self.assertEqual(g["harmonized"][i, j], 0.0)
        self.assertEqual(g["detected"]["terra"][i, j], 0.0)
        self.assertEqual(s["closed_cells"], {None: {1}})

    def test_held_out_predictions_are_shared_like_the_value(self):
        ov0 = 12 * 12 - 10
        n_ov = MONTHS.size - ov0
        pred = np.zeros((2, n_ov))
        pred[0, J2013 - ov0], pred[0, J2013 + 1 - ov0] = 12.0, 5.0
        held = {"preds": {k: pred for k in HC.HELD}, "sel": np.ones((2, n_ov), dtype=bool), "ov0": ov0}
        s = HC.unit_sums(self.parts, self.cells, self.harm, self.closed, held)
        names, g = HC.group(s, 0)
        jo = HC.OVERLAP_YEARS.index(2013)
        p = dict(zip(names, g["heldout"]["method"][:, jo]))
        self.assertAlmostEqual(p["A"], 9.0 + 5.0 * 0.6)
        self.assertAlmostEqual(p["B"], 3.0 + 5.0 * 0.4)
        self.assertEqual(dict(zip(names, g["heldout_suomi_npp"][:, jo])), {"A": 6.0, "B": 4.0, "C": 0.0})

    def test_the_russian_federation_is_shared_between_two_continents_by_each_cell(self):
        cells = _cells(2)
        cells["n_T"][:, J2013] = 1
        harm = np.zeros_like(cells["n_T"])
        harm[:, J2013] = [4.0, 6.0]
        parts = [("Russian_Federation", _part([0, 1], [J2013, J2013], [0, 0], [1, 1]))]
        s = HC.unit_sums(parts, cells, harm, np.zeros(2, dtype=bool))
        names, g = HC.group(s, 1)
        j = HC.YEARS.index(2013)
        self.assertEqual(dict(zip(names, g["harmonized"][:, j])), {"Asia": 6.0, "Europe": 4.0})


class FlagTest(unittest.TestCase):
    def test_two_years_off_by_ten_times_flag_and_one_does_not(self):
        S = np.full(14, 100.0)
        P = S.copy()
        self.assertEqual(HC.flag(S, P)["verdict"], "stable")
        P[3] = 1500.0
        self.assertEqual(HC.flag(S, P)["verdict"], "stable")
        P[5] = 5.0
        f = HC.flag(S, P)
        self.assertEqual((f["verdict"], f["departing_years"]), ("not stable", [2015, 2017]))

    def test_no_year_of_fifty_rows_is_not_tested(self):
        f = HC.flag(np.full(14, 49.0), np.full(14, 1.0))
        self.assertEqual((f["verdict"], f["tested_years"]), ("not tested", 0))


class PublishedTest(unittest.TestCase):
    """The written files: each continent's totals are the sums of its country files' parts, and the continents'
    the world's."""

    def setUp(self):
        self.dir = Y.out_dir()
        self.cpath, self.tpath = self.dir / HC.FILE, self.dir / "totals.json"
        if not (self.cpath.is_file() and self.tpath.is_file()):
            self.skipTest(f"the country and yearly totals are not in {self.dir}")
        self.c = json.loads(self.cpath.read_text(encoding="utf-8"))
        self.t = json.loads(self.tpath.read_text(encoding="utf-8"))
        self.rows = {(r["area"], r["year"]): r for r in self.t["rows"]}

    def _series(self, country: str, continent: str, key: str) -> list:
        part = self.c["by_continent"].get(country)
        if part is not None:
            return part.get(continent, {}).get(key, [0] * len(HC.YEARS))
        if self.c["continents"][country] != [continent]:
            return [0] * len(HC.YEARS)
        return self.c["countries"][country] if key == "harmonized" else self.c["detected"][country][key]

    def test_every_country_file_has_26_years(self):
        self.assertEqual(self.c["years"], list(HC.YEARS))
        parts = HC.parts_dir()
        if parts.is_dir():
            self.assertEqual(sorted(self.c["countries"]), HC.country_names(parts))
        for v in self.c["countries"].values():
            self.assertEqual(len(v), len(HC.YEARS))

    def test_the_countries_sum_to_each_continent_and_the_continents_to_the_world(self):
        n = len(self.c["countries"])
        for key, col in (("harmonized", "harmonized_rows"), ("modis", "modis_rows"), ("suomi_npp", "suomi_npp_rows")):
            for j, y in enumerate(HC.YEARS):
                world = 0.0
                for k in self.t["areas"][:-1]:
                    total = self.rows[(k, y)][col]
                    if total is None:
                        continue
                    parts = sum(self._series(c, k, key)[j] or 0 for c in self.c["countries"])
                    self.assertAlmostEqual(parts, total, delta=0.05 * n + 0.05, msg=f"{key} {k} {y}")
                    world += total
                w = self.rows[(Y.WORLD, y)][col]
                if w is not None:
                    self.assertAlmostEqual(world, w, delta=0.05 * len(self.t["areas"]), msg=f"{key} world {y}")

    def test_the_held_out_totals_of_the_countries_sum_to_the_world(self):
        for j, y in enumerate(HC.OVERLAP_YEARS):
            o = sum(f["heldout_suomi_npp"][j] for f in self.c["flag"].values())
            p = sum(f["heldout_harmonized"][j] for f in self.c["flag"].values())
            r = self.rows[(Y.WORLD, y)]
            self.assertAlmostEqual(o, r["heldout_suomi_npp_rows"], delta=0.05 * len(self.c["flag"]) + 0.05)
            self.assertAlmostEqual(p, r["heldout_harmonized_rows"], delta=0.05 * len(self.c["flag"]) + 0.05)

    def test_the_manifest_holds_the_file_it_describes(self):
        m = json.loads((self.dir / "harmonized.json").read_text(encoding="utf-8"))
        self.assertEqual(m["countries"]["sha256"], HC._sha(self.cpath))


if __name__ == "__main__":
    unittest.main()
