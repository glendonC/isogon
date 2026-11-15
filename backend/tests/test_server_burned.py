import base64
import datetime as dt
import io
import json
from pathlib import Path
import tempfile
import unittest
from urllib.parse import parse_qs

import numpy as np
from PIL import Image

from backend.firms import burned as B
from backend.server_burned import CLASSES, burned_route, span_of

BOX = (10.0, 45.0, 10.2, 45.1)


def _write_month(root: Path, year: int, month: int, burn: dict[tuple[int, int], int], product: str = "MCD64A1",
                 unmapped: tuple[int, int] | None = None) -> tuple[int, int]:
    g = B.BurnedGrid.from_bbox(BOX)
    bd = np.zeros(g.shape, dtype=np.int16)
    for (r, c), day in burn.items():
        bd[r, c] = dt.date(year, month, day).timetuple().tm_yday
    if unmapped is not None:
        bd[unmapped] = B.NATIVE_UNMAPPED
    path = B.month_path(BOX, year, month, product=product, root=root)
    path.parent.mkdir(parents=True, exist_ok=True)
    z = np.zeros(g.shape, dtype=np.int16)
    np.savez_compressed(path, year=np.array(year), month=np.array(month), product=np.array(product),
                        version=np.array("061"), concept_id=np.array(B.PRODUCT_INFO[product]["concept_id"]),
                        retrieved_utc=np.array("2026-11-15T00:00:00Z"), bbox=np.array(BOX),
                        cell_km=np.array(B.CELL_KM), burn_doy=bd, uncertainty_days=np.zeros(g.shape, dtype=np.uint8),
                        qa=np.zeros(g.shape, dtype=np.uint8), first_day=z, last_day=z)
    return g.shape


def _get(qs: str, root: Path):
    return burned_route("/api/burned", parse_qs(qs), root=root)


class BurnedRouteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.shape = _write_month(self.root, 2019, 8, {(0, 0): 3, (1, 1): 10, (2, 2): 12, (3, 3): 20},
                                  unmapped=(5, 5))
        self.box = ",".join(str(v) for v in BOX)

    def tearDown(self):
        self.tmp.cleanup()

    def test_burned_cells_are_split_before_in_and_after_the_window_with_their_day(self):
        st, body, ct = _get(f"box={self.box}&start=2019-08-10&end=2019-08-13", self.root)
        self.assertEqual((st, ct), (200, "application/json"))
        a = json.loads(body)
        self.assertEqual((a["product"], a["version"]), ("MCD64A1", "061"))
        self.assertEqual(a["span"], {"start": "2019-08-01", "through": "2019-08-31", "months": ["2019-08"]})
        self.assertEqual((a["grid"]["ny"], a["grid"]["nx"]), self.shape)
        w, s, e, n = a["grid"]["bounds"]
        self.assertEqual((w, s), BOX[:2])
        dlon, dlat = a["grid"]["cell_deg"]
        self.assertTrue(BOX[2] <= e < BOX[2] + dlon + 1e-6 and BOX[3] <= n < BOX[3] + dlat + 1e-6)
        self.assertAlmostEqual(e - w, a["grid"]["nx"] * dlon, places=5)
        self.assertAlmostEqual(n - s, a["grid"]["ny"] * dlat, places=5)
        c = a["counts"]
        self.assertEqual((c["burned_before_window"], c["burned_in_window"], c["burned_after_window"], c["unmapped"]),
                         (1, 2, 1, 1))
        self.assertEqual(a["burn_days"], {"2019-08-03": 1, "2019-08-10": 1, "2019-08-12": 1, "2019-08-20": 1})
        cls = np.asarray(Image.open(io.BytesIO(base64.b64decode(a["png"].split(",", 1)[1]))))
        day = np.asarray(Image.open(io.BytesIO(base64.b64decode(a["day_png"].split(",", 1)[1]))))
        self.assertEqual(cls.shape, self.shape)
        self.assertEqual([CLASSES[cls[i, i]] for i in range(4)],
                         ["burned_before_window", "burned_in_window", "burned_in_window", "burned_after_window"])
        self.assertEqual(CLASSES[cls[5, 5]], "unmapped")
        self.assertEqual([int(day[i, i]) for i in range(5)], [3, 10, 12, 20, 0])

    def test_the_pictures_alone(self):
        st, body, ct = _get(f"box={self.box}&start=2019-08-10&end=2019-08-13&format=png", self.root)
        self.assertEqual((st, ct), (200, "image/png"))
        img = Image.open(io.BytesIO(body))
        self.assertEqual((img.mode, img.size), ("P", (self.shape[1], self.shape[0])))
        st, body, ct = _get(f"box={self.box}&start=2019-08-10&end=2019-08-13&format=day", self.root)
        self.assertEqual(Image.open(io.BytesIO(body)).mode, "L")

    def test_a_month_not_in_the_store_is_not_fetched(self):
        st, body, _ = _get(f"box={self.box}&start=2019-08-28&end=2019-09-03", self.root)
        self.assertEqual((st, json.loads(body)["state"]), (404, "not fetched"))

    def test_the_sharp_satellites_product_is_never_served(self):
        _write_month(self.root, 2019, 8, {(0, 0): 3}, product="VNP64A1")
        st, body, _ = _get(f"box={self.box}&start=2019-08-10&end=2019-08-13&product=VNP64A1", self.root)
        self.assertEqual(st, 400)

    def test_a_closed_window_is_refused_before_any_read(self):
        st, body, _ = _get("region_id=plumas_ca&start=2021-07-14&end=2021-07-20", self.root)
        self.assertEqual(st, 409)

    def test_other_routes_pass_through(self):
        self.assertIsNone(burned_route("/api/burnedx", {}))
        self.assertIsNone(burned_route("/api/cube/record", {}))

    def test_the_span_runs_to_the_end_of_the_month_holding_the_window_end(self):
        s, e = span_of(B.parse_utc_seconds("2019-12-30"), B.parse_utc_seconds("2020-01-01"))
        self.assertEqual((s.date().isoformat(), e.date().isoformat()), ("2019-12-01", "2020-01-01"))
        s, e = span_of(B.parse_utc_seconds("2019-12-30"), B.parse_utc_seconds("2020-01-02"))
        self.assertEqual(e.date().isoformat(), "2020-02-01")


if __name__ == "__main__":
    unittest.main()
