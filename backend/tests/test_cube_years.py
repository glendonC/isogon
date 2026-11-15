"""Yearly layers: a year sums its months per cell per family, a year not whole at the end is left out, the first
year says it is partial, and the PNG's indices keep not loaded, no rows and closed apart from the ramp."""

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image

from backend.firms import archive, cube as C, cube_build as B, cube_years as Y
from backend.tests.test_cube_build import MODIS_HEADER, VIIRS_HEADER, _make, _write

MODIS_ROWS = [
    "45.1,10.1,320,1.0,1.0,2020-07-03,1030,Terra,MODIS,85,6.03,290,10.5,D,0",
    "45.1,10.1,320,1.3,1.1,2020-07-04,2130,Aqua,MODIS,50,6.03,290,4.5,N,0",
    "45.1,10.1,320,2.9,1.6,2020-07-05,1030,Terra,MODIS,20,6.03,290,2.0,D,2",     # static: not a fire row
    "45.1,10.1,320,1.0,1.0,2020-12-30,1030,Terra,MODIS,85,6.03,290,3.0,D,0",
    "45.4,10.4,320,1.0,1.0,2020-08-02,1030,Aqua,MODIS,90,6.03,290,1.0,D,0",
]
VIIRS_ROWS = [
    "45.1,10.1,330,0.39,0.36,2020-07-03,1000,N,VIIRS,h,2,290,3.0,D,0",
    "45.1,10.1,330,0.39,0.36,2020-12-31,1000,N,VIIRS,h,2,290,3.0,D,0",
]


def _make_whole_year(d: Path) -> Path:
    store, root = d / "firms", d / "cube"
    _write(store, "modis", 2020, "Testland", MODIS_HEADER, MODIS_ROWS)
    _write(store, "viirs-snpp", 2020, "Testland", VIIRS_HEADER, VIIRS_ROWS)
    (store / "listing").mkdir(parents=True)
    (store / "listing" / archive.LISTING_NAME).write_text(
        "filename,size,updated\n" + "".join(f"{n},1,2025-01-01 00:00:00\n"
                                              for n in ["modis_2020_Testland.csv", "viirs-snpp_2020_Testland.csv"]))
    assert B.build_part((str(root), str(store), "Testland"))["ok"]
    B.merge(root, store, ["Testland"], log=lambda s: None)
    return root


class YearlyLayers(unittest.TestCase):
    def test_the_years_of_the_archive(self) -> None:
        ys = Y.years_in(302)                      # 2000-11 to 2025-12
        self.assertEqual([y["year"] for y in ys], list(range(2000, 2026)))
        self.assertEqual((ys[0]["months"], ys[0]["partial"]), (2, True))
        self.assertFalse(any(y["partial"] for y in ys[1:]))
        self.assertEqual(Y.years_in(300)[-1]["year"], 2024)   # ends 2025-10: 2025 is not whole and is left out

    def test_a_year_sums_its_months_per_cell_and_family(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = _make_whole_year(Path(d))
            info = Y.write(root=root, log=lambda s: None)
            self.assertEqual(info["years"][-1]["year"], 2020)
            self.assertIn("modis_2020", info["layers"])
            self.assertIn("viirs_2020", info["layers"])
            self.assertNotIn("viirs_2019", info["layers"])          # VIIRS begins with its first year of rows
            out = Y.years_dir(root)
            m = np.load(out / "modis_2020.npy")
            v = np.load(out / "viirs_2020.npy")
            r, c = C.row_of(45.1), C.col_of(10.1)
            self.assertEqual(float(m[r, c]), 3.0)                    # two Terra and one Aqua fire row; static left out
            self.assertEqual(float(v[r, c]), 2.0)
            self.assertEqual(float(m[C.row_of(45.4), C.col_of(10.4)]), 1.0)
            self.assertTrue(np.isnan(m[C.row_of(0.0), C.col_of(0.0)]))  # not loaded
            png = np.array(Image.open(out / "modis_2020.png"))
            self.assertEqual(int(png[C.row_of(0.0), C.col_of(0.0)]), Y.INDEX_NOT_LOADED)
            self.assertGreaterEqual(int(png[r, c]), Y.INDEX_RAMP0)
            self.assertEqual(int(png[r, c]), 255)                    # the cell at the family's vmax
            self.assertTrue((Y.public_dir(root) / "years" / "modis_2020.png").is_file())
            self.assertEqual(json.loads((Y.public_dir(root) / "years" / "years.json").read_text())["layers"].keys(),
                             info["layers"].keys())
            from backend.server_cube import cube_route

            cube = C.Cube(root)
            st, body, _ = cube_route("/api/cube/years", {}, cube=cube)
            self.assertEqual(st, 200)
            self.assertEqual(json.loads(body)["layers"]["modis_2020"]["png_route"], "/api/cube/years/modis_2020.png")
            st, body, ctype = cube_route("/api/cube/years/viirs_2020.png", {}, cube=cube)
            self.assertEqual((st, ctype, body[:4]), (200, "image/png", b"\x89PNG"))
            self.assertEqual(cube_route("/api/cube/years/viirs_2026.png", {}, cube=cube)[0], 404)
            # MODIS drawn again on the Suomi NPP scale: the same array, a dimmer index where Suomi NPP's vmax is larger
            on = info["layers"]["modis_on_snpp_2020"]
            self.assertEqual((on["scale"], on["npy"], on["rows"]), ("suomi_npp", "modis_2020.npy", 4))
            a = np.array(Image.open(out / "modis_on_snpp_2020.png"))
            self.assertLessEqual(int(a[r, c]), int(png[r, c]))
            st, body, _ = cube_route("/api/cube/years/modis_on_snpp_2020.npy", {}, cube=cube)
            self.assertEqual(body, (out / "modis_2020.npy").read_bytes())

    def test_a_year_not_whole_at_the_end_is_left_out(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            _store, root = _make(Path(d))                # rows end in 2020-08
            info = Y.write(root=root, public=False, log=lambda s: None)
            self.assertEqual(info["years"][-1]["year"], 2019)
            self.assertFalse(any(n.endswith("_2020") for n in info["layers"]))

    def test_indices_keep_states_apart(self) -> None:
        a = np.array([[np.nan, 0.0, 1.0, 100.0, 5.0]], dtype=np.float32)
        closed = np.array([[False, False, False, False, True]])
        idx, clipped = Y.to_index(a, closed, vmax=100.0)
        self.assertEqual(idx[0, :2].tolist(), [Y.INDEX_NOT_LOADED, Y.INDEX_NO_ROWS])
        self.assertTrue(Y.INDEX_RAMP0 <= idx[0, 2] < idx[0, 3] == 255)
        self.assertEqual(int(idx[0, 4]), Y.INDEX_CLOSED)
        self.assertEqual(clipped, 0)
        pal, alpha = Y.palette()
        self.assertEqual((len(pal), len(alpha)), (768, 256))


if __name__ == "__main__":
    unittest.main()
