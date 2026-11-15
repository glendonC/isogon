import json
from pathlib import Path
import tempfile
import unittest

from backend.model import harmonize_figure as F


def row(area, year, *, months=12, terra=1000.0, aqua=2000.0, snpp=None, harmonized=0.0, closed=0):
    return {
        "area": area, "year": year, "months": months, "partial": months < 12,
        "months_terra": months, "months_aqua": months if aqua else 0, "months_suomi_npp": months if snpp else 0,
        "terra_rows": terra, "aqua_rows": aqua, "modis_rows": terra + (aqua or 0), "suomi_npp_rows": snpp,
        "harmonized_rows": harmonized, "closed_cells_left_out": closed,
    }


def totals():
    return {"rows": [
        row("World", 2000, months=2, aqua=None, harmonized=40.0),
        row("World", 2001, aqua=None, harmonized=800.0),
        row("World", 2002, harmonized=900.0),
        row("Africa", 2012, snpp=99999.0, harmonized=7.0),
        row("World", 2012, snpp=12000.0, harmonized=11800.0),
        row("World", 2013, terra=500.0, aqua=1500.0, snpp=9000.0, harmonized=9100.0, closed=4),
    ]}


class FigureNumbersTest(unittest.TestCase):
    def test_the_bars_are_modis_before_suomi_npp_and_suomi_npp_from_its_first_year(self):
        s = F.series(totals())
        self.assertEqual(s["sharp_from"], 2012)
        self.assertEqual(s["aqua_from"], 2002)
        self.assertEqual([y["year"] for y in s["years"]], [2000, 2001, 2002, 2012, 2013])
        self.assertEqual([y["counted"] for y in s["years"]], [1000.0, 1000.0, 3000.0, 12000.0, 9000.0])
        self.assertEqual([y["harmonized"] for y in s["years"]], [40.0, 800.0, 900.0, 11800.0, 9100.0])
        self.assertEqual([y["partial"] for y in s["years"]], [True, False, False, False, False])
        self.assertEqual(s["factor"], (12000.0 + 9000.0) / (3000.0 + 2000.0))
        self.assertEqual(s["factor_years"], [2012, 2013])

    def test_the_picture_carries_the_numbers_it_draws(self):
        s = F.series(totals())
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "f.png"
            F.draw(s, out, "0" * 64)
            payload = F.read_payload(out)
            from PIL import Image
            with Image.open(out) as im:
                self.assertEqual(im.size, (F.WIDTH, F.HEIGHT))
        self.assertEqual(payload["series"], json.loads(json.dumps(s)))
        self.assertEqual(payload["totals_sha256"], "0" * 64)

    def test_the_picture_in_docs_draws_the_world_totals_file(self):
        path = F.default_totals()
        if not path.is_file():
            self.skipTest(f"the harmonized yearly totals are not in {path.parent}")
        payload = F.read_payload(F.DEFAULT_OUT)
        self.assertEqual(payload["totals_sha256"], F.sha256_of(path))
        self.assertEqual(payload["series"], json.loads(json.dumps(F.series(json.loads(path.read_text())))))


if __name__ == "__main__":
    unittest.main()
