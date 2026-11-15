"""The fire cube on two invented country files: the counting rule, a box read, and "not loaded" is not zero."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from backend.firms import archive, cube as C, cube_build as B

MODIS_HEADER = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type"
VIIRS_HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type"

# Testland lies in the cells of 10 to 10.5 E, 45 to 45.5 N.
MODIS_ROWS = [
    "45.1,10.1,320,1.0,1.0,2020-07-03,1030,Terra,MODIS,85,6.03,290,10.5,D,0",   # fire, day, scan 0, high
    "45.1,10.1,320,1.3,1.1,2020-07-04,2130,Aqua,MODIS,50,6.03,290,4.5,N,0",     # fire, night, scan 1, nominal
    "45.1,10.1,320,2.9,1.6,2020-07-05,1030,Terra,MODIS,20,6.03,290,2.0,D,2",    # static land source
    "45.3,10.3,320,1.0,1.0,2020-08-01,1030,Terra,MODIS,90,6.03,290,7.0,D,3",    # offshore
    "45.25,10.25,320,1.0,1.0,2020-08-02,1030,Terra,MODIS,90,6.03,290,1.0,D,0",  # on a cell corner: goes north east
]
VIIRS_ROWS = [
    "45.1,10.1,330,0.39,0.36,2020-07-03,1000,N,VIIRS,h,2,290,3.0,D,0",
    "45.1,10.1,330,0.50,0.40,2020-07-03,1000,N,VIIRS,n,2,290,2.0,D,1",          # active volcano
    "45.4,10.4,330,0.70,0.50,2020-07-03,2200,N,VIIRS,l,2,290,1.0,N,0",
]


def _write(store: Path, product: str, year: int, country: str, header: str, rows: list[str]) -> None:
    path = archive.raw_path(product, year, country, store)
    path.parent.mkdir(parents=True, exist_ok=True)
    body = (header + "\n" + "\n".join(rows) + "\n").encode()
    path.write_bytes(body)
    days: dict[str, dict[str, int]] = {}
    for r in rows:
        f = r.split(",")
        days.setdefault(f[7], {}).setdefault(f[5], 0)
        days[f[7]][f[5]] += 1
    man = {"bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "rows": len(rows),
           "satellite_day_rows": days, "acq_date_range": [min(r.split(",")[5] for r in rows),
                                                          max(r.split(",")[5] for r in rows)]}
    path.with_name(path.name + ".manifest.json").write_text(json.dumps(man))


def _make(d: Path) -> tuple[Path, Path]:
    store, root = d / "firms", d / "cube"
    _write(store, "modis", 2020, "Testland", MODIS_HEADER, MODIS_ROWS)
    _write(store, "viirs-snpp", 2020, "Testland", VIIRS_HEADER, VIIRS_ROWS)
    (store / "listing").mkdir(parents=True)
    names = ["modis_2020_Testland.csv", "viirs-snpp_2020_Testland.csv", "modis_2020_Otherland.csv"]
    (store / "listing" / archive.LISTING_NAME).write_text(
        "filename,size,updated\n" + "".join(f"{n},1,2025-01-01 00:00:00\n" for n in names))
    res = B.build_part((str(root), str(store), "Testland"))
    assert res["ok"], res
    B.merge(root, store, ["Testland"], log=lambda s: None)
    return store, root


class CubeBuild(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.store, self.root = _make(Path(self.tmp.name))
        self.cube = C.Cube(self.root)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_every_row_goes_in_and_kinds_stay_apart(self) -> None:
        t = self.cube.box((10.0, 45.0, 10.5, 45.5))
        jul, aug = C.month_index(2020, 7), C.month_index(2020, 8)
        rows = t["rows"]
        self.assertEqual(int(rows.sum()), len(MODIS_ROWS) + len(VIIRS_ROWS))
        terra, aqua, snpp = 0, 1, 2
        self.assertEqual(int(rows[jul, terra, 0, 0]), 1)       # fire, day
        self.assertEqual(int(rows[jul, aqua, 1, 0]), 1)        # fire, night
        self.assertEqual(int(rows[jul, terra, 0, 2]), 1)       # static apart
        self.assertEqual(int(rows[aug, terra, 0, 3]), 1)       # offshore apart
        self.assertEqual(int(rows[jul, snpp, 0, 1]), 1)        # volcano apart
        self.assertAlmostEqual(float(t["frp"][jul, terra, 0, 0]), 10.5, places=4)
        # Fire rows only, by the pixel's size across the swath and by confidence.
        self.assertEqual(int(t["fire_rows_by_scan"][jul, aqua, 1, 1]), 1)
        self.assertEqual(int(t["fire_rows_by_scan"][jul, snpp, 1, 2]), 1)
        self.assertEqual(int(t["fire_rows_by_confidence"][jul, terra, 0, 2]), 1)
        self.assertEqual(int(t["fire_rows_by_confidence"][jul, snpp, 1, 0]), 1)
        counts, left, n = self.cube.calendar_counts(t)
        self.assertEqual(counts["2020-07"]["Terra"], {"day": 1, "night": 0, "volcano": 0, "static": 1, "offshore": 0})
        self.assertEqual(left["volcano"], {"Suomi NPP": 1})

    def test_a_cell_holds_its_west_and_south_edges(self) -> None:
        corner = self.cube.box((10.25, 45.25, 10.5, 45.5))
        self.assertEqual(int(corner["rows"][C.month_index(2020, 8), 0, 0, 0]), 1)
        sw = self.cube.box((10.0, 45.0, 10.25, 45.25))
        self.assertEqual(int(sw["rows"][C.month_index(2020, 8), 0, 0, 0]), 0)

    def test_a_box_off_the_grid_snaps_outward_or_inward(self) -> None:
        outer = self.cube.box((10.1, 45.05, 10.2, 45.2))
        self.assertEqual(outer["box"], [10.0, 45.0, 10.25, 45.25])
        with self.assertRaises(ValueError):
            self.cube.box((10.1, 45.05, 10.2, 45.2), "inner")

    def test_not_loaded_is_not_zero(self) -> None:
        here = self.cube.box((10.0, 45.0, 10.5, 45.5))
        self.assertEqual(here["cells_loaded"], 2)
        self.assertEqual(here["countries"], ["Testland"])
        away = self.cube.box((20.0, 45.0, 20.5, 45.5))
        self.assertEqual(away["cells_loaded"], 0)
        self.assertFalse(away["loaded"])
        countries = json.loads((C.current_build(self.root) / "countries.json").read_text())
        self.assertFalse(countries["countries"]["Otherland"]["loaded"])
        man = json.loads((C.current_build(self.root) / "manifest.json").read_text())
        self.assertFalse(man["world_complete"])

    def test_a_part_is_rebuilt_only_when_a_file_changes(self) -> None:
        self.assertIsNotNone(B.part_fresh(self.root, self.store, "Testland"))
        path = archive.raw_path("modis", 2020, "Testland", self.store)
        man = json.loads(path.with_name(path.name + ".manifest.json").read_text())
        man["sha256"] = "0" * 64
        path.with_name(path.name + ".manifest.json").write_text(json.dumps(man))
        self.assertIsNone(B.part_fresh(self.root, self.store, "Testland"))
        self.assertFalse(B.build_part((str(self.root), str(self.store), "Testland"))["ok"])

    def test_outage_rule_matches_the_calendar(self) -> None:
        from backend.firms import real_calendar as RC
        import collections

        days = {"Terra": collections.Counter({"2020-07-01": 5, "2020-07-03": 5}),
                "Aqua": collections.Counter({"2020-07-01": 200, "2020-07-02": 200, "2020-07-03": 200})}
        theirs = RC.outage_days(days)
        tab = np.zeros((4, 10), dtype=np.int64)
        for p, name in ((0, "Terra"), (1, "Aqua")):
            for d, n in days[name].items():
                tab[p, int(d[-2:]) - 1] = n
        mine = B.outage_rule(tab)
        self.assertEqual({f"2020-07-{k + 1:02d}" for k in np.flatnonzero(mine[0])}, theirs["Terra"])
        self.assertEqual(int(mine[1].sum()), len(theirs["Aqua"]))


if __name__ == "__main__":
    unittest.main()
