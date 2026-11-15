"""The README's picture of the Earth: it draws each layer it names at that layer's cells on the one scale, reads the
harmonized layer from its own folder with the closed rule applied, and refuses a layer that is not
there or is on another scale."""

from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import numpy as np

from backend.firms import cube as C, cube_figure as F, cube_years as Y
from backend.tests.test_cube_years import _make_whole_year

PANELS = ({"layer": "modis_on_snpp_2020", "view": 0, "line": "Counted by the older satellites (MODIS)"},
          {"layer": "viirs_2020", "view": 0, "line": "Counted by the newer, sharper satellite (VIIRS)"},
          {"layer": "harmonized_2020", "view": 1, "line": "On the newer satellite's scale"})


def _at(im, panel: dict, lat: float, lon: float) -> tuple[int, int, int]:
    x0, y0 = panel["box"][:2]
    x = x0 + F.pixel_of(int(C.col_of(lon)), np.array(panel["col_starts"]))
    y = y0 + F.pixel_of(int(C.row_of(lat)), np.array(panel["row_starts"]))
    return im.getpixel((x, y))


def _colour(value: float, vmax: float) -> tuple[int, int, int]:
    idx, _ = Y.to_index(np.array([[value]], np.float32), np.zeros((1, 1), bool), vmax)
    return tuple(int(v) for v in F.colours()[int(idx[0, 0])])


class EarthFigure(unittest.TestCase):
    def test_the_picture_names_2011_and_2012_as_counted_and_on_one_scale(self) -> None:
        self.assertEqual([p["layer"] for p in F.PANELS],
                         ["modis_on_snpp_2011", "viirs_2012", "harmonized_2011", "harmonized_2012"])
        scale_of = {**{f: s["scale"] for f, s in Y.FAMILIES.items()},
                    **{f: s["scale"] for f, s in Y.ALSO_DRAWN.items()}, "harmonized": Y.HARMONIZED["scale"]}
        for p in F.PANELS:
            self.assertEqual(scale_of[p["layer"].rsplit("_", 1)[0]], F.SCALE)

    def test_it_draws_the_layers_it_names(self) -> None:
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"ISOGON_WORLD_DIR": str(Path(d) / "world")}):
            root = _make_whole_year(Path(d))
            hdir = Y.harmonized_dir()
            hdir.mkdir(parents=True)
            h = np.full((C.N_ROWS, C.N_COLS), np.nan, np.float32)
            r, c = C.row_of(45.1), C.col_of(10.1)
            h[r, c] = 1.0
            np.save(hdir / "harmonized_2020.npy", h)
            (hdir / "harmonized.json").write_text("{}")
            Y.write(root=root, public=False, log=lambda s: None)
            folder = Y.years_dir(root)
            vmax = json.loads((folder / "years.json").read_text())["scales"]["suomi_npp"]["vmax"]
            self.assertEqual(vmax, 2.0)

            im, what = F.draw(PANELS, years_folder=folder)
            self.assertEqual([p["layer"] for p in what["panels"]], [p["layer"] for p in PANELS])
            self.assertEqual(im.size, tuple(what["size"]))
            self.assertEqual(im.size[0], 2 * F.MARGIN + 2 * F.PANEL_W + F.GUTTER)
            on, viirs, harm = what["panels"]
            self.assertEqual((on["file"], viirs["file"], harm["file"]), ("modis_2020.npy", "viirs_2020.npy",
                                                                          "harmonized_2020.npy"))
            self.assertEqual(_at(im, on, 45.1, 10.1), _colour(3.0, vmax))       # three fire rows, above the top
            self.assertEqual(on["clipped_pixels"], 1)
            self.assertEqual(_at(im, viirs, 45.1, 10.1), _colour(2.0, vmax))
            self.assertEqual(_at(im, harm, 45.1, 10.1), _colour(1.0, vmax))
            self.assertNotEqual(_colour(1.0, vmax), _colour(2.0, vmax))
            self.assertEqual(_at(im, viirs, 45.4, 10.4), F.LAND)                  # loaded, no Suomi NPP row
            self.assertEqual(_at(im, on, 45.4, 10.4), _colour(1.0, vmax))
            self.assertEqual(_at(im, on, 0.0, 0.0), F.SEA)                        # not loaded
            self.assertTrue(harm["same_file_as_years_json"])

            # The harmonized layer is read from its own folder, not the yearly writer's copy.
            h[r, c] = 2.0
            np.save(hdir / "harmonized_2020.npy", h)
            im, what = F.draw(PANELS, years_folder=folder)
            self.assertEqual(_at(im, what["panels"][2], 45.1, 10.1), _colour(2.0, vmax))
            self.assertFalse(what["panels"][2]["same_file_as_years_json"])

            # The closed rule holds in the harmonized layer read from its folder.
            info = json.loads((folder / "years.json").read_text())
            mask = np.zeros(C.N_CELLS, bool)
            mask[C.cell_of(10.1, 45.1)] = True
            arr, _ = F.layer_array("harmonized_2020", info, folder, hdir, {2020: mask})
            self.assertTrue(np.isnan(arr[r, c]))

            with self.assertRaises(KeyError):
                F.draw(({"layer": "viirs_2019", "view": 0, "line": "x"},), years_folder=folder)
            with self.assertRaises(ValueError):                                      # on the MODIS scale
                F.draw(({"layer": "modis_2020", "view": 0, "line": "x"},), years_folder=folder)


if __name__ == "__main__":
    unittest.main()
