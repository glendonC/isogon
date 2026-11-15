"""Each country's fire rows each year (backend/firms/cube_countries.py): the counted series from the parts, the closed
rule, the harmonized series, the match to the page's map and the route."""

from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from backend.firms import archive, cube as C, cube_build as B, cube_countries as K, cube_years as Y
from backend.tests.test_cube_build import MODIS_HEADER, VIIRS_HEADER, _write
from backend.tests.test_cube_years import MODIS_ROWS, VIIRS_ROWS

OTHER_MODIS_ROWS = [
    "45.1,10.1,320,1.0,1.0,2020-07-03,1030,Terra,MODIS,85,6.03,290,10.5,D,0",    # the cell Testland has too
    "45.1,10.1,320,1.0,1.0,2020-07-09,1030,Aqua,MODIS,85,6.03,290,10.5,D,0",
    "46.1,11.1,320,1.0,1.0,2020-09-01,1030,Terra,MODIS,85,6.03,290,1.0,D,0",
    "46.1,11.1,320,1.0,1.0,2020-09-02,1030,Terra,MODIS,85,6.03,290,1.0,D,1",     # volcano: not a fire row
]


def _make_two(d: Path) -> Path:
    store, root = d / "firms", d / "cube"
    _write(store, "modis", 2020, "Testland", MODIS_HEADER, MODIS_ROWS)
    _write(store, "viirs-snpp", 2020, "Testland", VIIRS_HEADER, VIIRS_ROWS)
    _write(store, "modis", 2020, "Otherland", MODIS_HEADER, OTHER_MODIS_ROWS)
    names = ["modis_2020_Testland.csv", "viirs-snpp_2020_Testland.csv", "modis_2020_Otherland.csv"]
    (store / "listing").mkdir(parents=True)
    (store / "listing" / archive.LISTING_NAME).write_text(
        "filename,size,updated\n" + "".join(f"{n},1,2025-01-01 00:00:00\n" for n in names))
    for c in ("Otherland", "Testland"):
        assert B.build_part((str(root), str(store), c))["ok"]
    B.merge(root, store, ["Otherland", "Testland"], log=lambda s: None)
    return root


class CountriesYears(unittest.TestCase):
    def test_the_store_names_meet_the_atlas(self) -> None:
        shapes = K.atlas()
        names = {s["name"] for s in shapes}
        self.assertEqual(len(shapes), 241)
        self.assertTrue(set(K.ATLAS_NAME.values()) <= names)
        self.assertTrue(set(K.ATLAS_HELD_BY) <= names)
        m = K.match_atlas(["United_States", "Bosnia_and_Herzegovina", "Democratic_Republic_of_the_Congo",
                           "Cote_d_Ivoire", "Greece", "French_Guiana", "Testland"], shapes)
        self.assertEqual((m["United_States"]["name"], m["United_States"]["id"]), ("United States of America", "840"))
        self.assertEqual(m["Bosnia_and_Herzegovina"]["name"], "Bosnia and Herz.")
        self.assertEqual(m["Democratic_Republic_of_the_Congo"]["name"], "Dem. Rep. Congo")
        self.assertEqual(m["Cote_d_Ivoire"]["name"], "Côte d'Ivoire")
        self.assertEqual(m["Greece"]["name"], "Greece")
        self.assertIsNone(m["French_Guiana"])
        self.assertIsNone(m["Testland"])

    def test_each_country_counts_its_own_files(self) -> None:
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"ISOGON_WORLD_DIR": d}):
            root = _make_two(Path(d))
            from backend.server_cube import cube_route

            cube = C.Cube(root)
            self.assertEqual(cube_route("/api/cube/years/countries", {}, cube=cube)[0], 503)
            Y.write(root=root, log=lambda s: None)
            info = K.write(root=root, log=lambda s: None)
            years = info["years"]
            self.assertEqual((years[0], years[-1]), (2000, 2020))
            i = years.index(2020)
            t, o = info["countries"]["Testland"], info["countries"]["Otherland"]
            self.assertEqual(t["modis"][i], 4)                      # four fire rows; the static row left out
            self.assertEqual(t["viirs"][i], 2)
            self.assertEqual(o["modis"][i], 3)                      # the volcano row left out
            self.assertEqual(o["viirs"][i], 0)                      # no file of Suomi NPP: 0 in a year it flew
            self.assertIsNone(t["viirs"][i - 1])                    # before Suomi NPP's first year
            self.assertIsNone(t["modis"][i - 1])                    # Terra delivers no month before 2020 here
            self.assertEqual(len(t["modis"]), len(years))
            self.assertEqual((t["name"], t["atlas"], t["harmonized"]), ("Testland", None, None))
            self.assertEqual(info["unmatched"]["store"]["Testland"], "no atlas shape of this name")
            self.assertEqual(info["unmatched"]["atlas"]["Somaliland"], "Somalia")
            self.assertTrue(info["check"]["equals_yearly_layers"])   # the two countries add up to the yearly layer
            self.assertEqual(info["check"]["world"]["modis"][i], 7)
            self.assertEqual(info["series"]["harmonized"]["state"], "not written yet")
            st, body, ctype = cube_route("/api/cube/years/countries", {}, cube=cube)
            self.assertEqual((st, ctype.split(";")[0]), (200, "application/json"))
            self.assertEqual(json.loads(body), info)
            self.assertEqual((Y.public_dir(root) / "years" / "countries.json").read_bytes(), body)

            # The closed rule leaves a closed cell out of its country's year.
            cell = C.row_of(45.4) * C.N_COLS + C.col_of(10.4)
            m0, m1 = C.month_index(2020, 1), C.month_index(2020, 12)
            closed = [{"region_id": "a_test_fire", "years": [2020], "months": [m0, m1], "cells": [cell]}]
            info = K.write(root=root, closed=closed, log=lambda s: None)
            self.assertEqual(info["countries"]["Testland"]["modis"][i], 3)
            self.assertEqual(info["countries"]["Otherland"]["modis"][i], 3)
            self.assertEqual(info["check"]["differs"], ["modis_2020"])   # years.json was written without it

            # The harmonized series, from the harmonize folder.
            hpath = K.harmonized_countries_path()
            hpath.parent.mkdir(parents=True, exist_ok=True)
            vals = [None] * (len(years) - 1) + [5.5]
            tl = info["countries"]["Testland"]
            tl_modis = tl["modis"][:i] + [4]                          # as counted without the closed cell
            detected = {"Testland": {"modis": tl_modis, "suomi_npp": tl["viirs"]},
                        "Otherland": {"modis": info["countries"]["Otherland"]["modis"], "suomi_npp": [0] * len(years)}}
            hpath.write_text(json.dumps({"years": years, "what": "on one scale", "flag": {"Testland": {"big": 1}},
                                         "detected": detected, "countries": {"Testland": vals, "Nowhere": vals}}))
            info = K.write(root=root, log=lambda s: None)
            self.assertEqual(info["series"]["harmonized"]["source"], {"what": "on one scale"})   # its tables stay out
            self.assertFalse(info["check"]["harmonized_detected_equal"])
            self.assertEqual(info["check"]["harmonized_detected_differs"], ["Otherland suomi_npp"])
            self.assertEqual(info["countries"]["Testland"]["harmonized"], vals)
            self.assertIsNone(info["countries"]["Otherland"]["harmonized"])
            h = info["series"]["harmonized"]
            self.assertEqual((h["state"], h["unknown_keys"], h["sha256"]),
                             ("drawn from the harmonize folder", ["Nowhere"], Y._sha(hpath)))
            hpath.write_text(json.dumps({"years": years[1:], "countries": {}}))
            with self.assertRaises(ValueError):
                K.write(root=root, log=lambda s: None)


if __name__ == "__main__":
    unittest.main()
