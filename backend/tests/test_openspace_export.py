"""The OpenSpace exporter (backend/openspace): files, geometry, and the reveal boundary.

Every payload here is written in this file to the backend's shapes; none is a NASA record. One test exports from
a running backend and runs only when ISOGON_OPENSPACE_LIVE names it (for example http://127.0.0.1:8788) and
ISOGON_OPENSPACE_CMR names the CMR cache folder.
"""

from __future__ import annotations

import copy
import gzip
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

from backend.eval.grid import EvalGrid  # noqa: E402
from backend.model.grid import DEG_TO_KM_LAT  # noqa: E402
from backend.openspace import export as ex  # noqa: E402
from backend.openspace import geo  # noqa: E402

BOX = (-121.44, 39.86, -121.40, 39.89)
CODES = {"0": "MODIS_TERRA", "1": "MODIS_AQUA", "2": "VIIRS_NOAA20", "3": "VIIRS_NOAA21", "4": "VIIRS_SNPP"}
SCHEMA = ["lon", "lat", "scan_km", "track_km", "angle_deg", "frp_mw", "confidence", "sensor_code"]
# Em dash, en dash, middle dot and their HTML entities, built here so this file holds none of them.
FORBIDDEN = (chr(0x2014), chr(0x2013), chr(0xB7)) + tuple("&" + n + ";" for n in ("mdash", "ndash", "middot"))
# Names that arrived in OpenSpace 0.22: a scene that must load in 0.21.3 may not use them.
NEW_IN_022 = ("ScreenSpaceText", "ScreenSpaceDate", '"addons"', "stopPropertyBouncing", "earth/globe")


def _grid() -> EvalGrid:
    return EvalGrid.from_bbox(BOX, 0.375)


def _ring_text(ring: list[tuple[float, float]]) -> list[list[float]]:
    return [[x, y] for x, y in ring]


def _payloads() -> dict:
    """A small held-out run, its pass list, its reveal and its belief bytes, in the backend's shapes."""
    g = _grid()
    steps = 10
    rng = np.random.default_rng(7)
    belief = np.zeros((steps, g.ny, g.nx, 2), dtype=np.uint8)
    belief[:, 2:6, 3:7, 0] = rng.integers(10, 255, size=(steps, 4, 4))
    belief[:, 2:6, 3:7, 1] = rng.integers(1, 255, size=(steps, 4, 4))
    belief[:, 0, 0, :] = (5, 200)                     # under the probability floor: never drawn
    modis = [
        {"frame": 0, "timestamp_utc": "2021-07-20T06:04:00Z", "sensor": "MODIS_TERRA", "epistemic_regime": "modis_overpass",
         "footprints": [[-121.43, 39.87, 1.0, 1.0, 75.9, 72.8, 100, 0], [-121.42, 39.875, 1.2, 1.1, 75.9, 10.0, 80, 0],
                        [-121.41, 39.88, 1.0, 1.0, 75.9, 3.6, 37, 0]]},
        {"frame": 1, "timestamp_utc": "2021-07-20T08:58:00Z", "sensor": "VIIRS_SNPP",
         "epistemic_regime": "viirs_overpass_held_out", "footprints": []},
        {"frame": 2, "timestamp_utc": "2021-07-20T10:20:00Z", "sensor": "MODIS_AQUA", "epistemic_regime": "modis_overpass",
         "footprints": [[-121.425, 39.872, 2.0, 1.4, 104.0, 20.0, 64, 1], [-121.415, 39.882, 2.0, 1.4, 104.0, 8.0, 50, 1]]},
    ]
    reveal = {
        "what": "the hidden detections", "footprint_schema": SCHEMA,
        "overpasses": [
            {"platform": "VIIRS_SNPP", "sensor_code": 4, "time_utc": "2021-07-20T08:58:00Z", "is_day": False,
             "footprints": [[-121.431, 39.871, 0.4, 0.5, 104.4, 5.0, 55, 4], [-121.421, 39.876, 0.4, 0.5, 104.4, 6.0, 55, 4],
                            [-121.411, 39.881, 0.4, 0.5, 104.4, 7.0, 55, 4]]},
            {"platform": "VIIRS_NOAA20", "sensor_code": 2, "time_utc": "2021-07-20T09:49:00Z", "is_day": False,
             "footprints": [[-121.428, 39.874, 0.5, 0.6, 80.0, 9.0, 55, 2], [-121.418, 39.879, 0.5, 0.6, 80.0, 2.0, 55, 2]]},
        ],
    }
    first = {
        "run_id": "test_firms_20210720T0604_holdoutviirs", "source": "firms", "holdout_viirs": True,
        "provenance": "written for this test; not NASA records",
        "region": {"id": "test_region", "name": "Test region & place, CA", "bbox": list(BOX),
                   "center_lat": 39.875, "center_lon": -121.42},
        "window": {"first_overpass_utc": "2021-07-20T06:04:00Z", "last_overpass_utc": "2021-07-20T10:20:00Z"},
        "hidden_platforms": ["VIIRS_NOAA20", "VIIRS_SNPP"],
        "hidden_rows": {"payload_keys_from_the_scorer": ["blind_test", "metrics.raw_modis_rmse_mw_km2"]},
        "metrics": {"raw_modis_rmse_mw_km2": 381.2, "from_hidden_rows": ["raw_modis_rmse_mw_km2"]},
        "observer_passes": {"sensor_codes": CODES, "footprint_schema": SCHEMA, "frames": modis},
        "belief_frames": {"url": "/api/runs/test/belief_u8.bin", "steps": steps, "step_minutes": 30.0,
                          "first_time_utc": "2021-07-20T06:04:00Z",
                          "grid": {"nx": g.nx, "ny": g.ny, "cell_km": 0.375, "bbox": list(BOX), "row_0": "north",
                                   "column_0": "west"}},
        "blind_test": {"verdict": {"scores": {"csi": 0.33}}, "reveal": reveal},
    }
    passes = {
        "region_id": "test_region", "source": "firms",
        "passes": [
            {"platform": "MODIS_TERRA", "time_start": "2021-07-20T06:00:00Z", "time_end": "2021-07-20T06:05:00Z",
             "day_night": "NIGHT", "granules": ["G-T1"], "box_share": 1.0, "firms_detection_in_box": True,
             "firms_pixels_in_box": 3, "firms_frp_mw_in_box": 86.4, "firms_overpass_utc": ["2021-07-20T06:04:00Z"]},
            {"platform": "VIIRS_SNPP", "time_start": "2021-07-20T08:54:00Z", "time_end": "2021-07-20T09:00:00Z",
             "day_night": "NIGHT", "granules": ["G-S1"], "box_share": 1.0, "firms_detection_in_box": True,
             "firms_pixels_in_box": 3, "firms_frp_mw_in_box": 18.0, "firms_overpass_utc": ["2021-07-20T08:58:00Z"]},
        ],
    }
    granules = {
        "MODIS_TERRA": [{"id": "G-T1", "time_start": "2021-07-20T06:00:00Z", "time_end": "2021-07-20T06:05:00Z",
                         "day_night": "NIGHT", "cloud_cover_pct": 17.0,
                         "rings": [[[-107.7, 42.7], [-134.9, 38.6], [-131.0, 21.0], [-108.0, 24.0], [-107.7, 42.7]]]}],
        "VIIRS_SNPP": [{"id": "G-S1", "time_start": "2021-07-20T08:54:00Z", "time_end": "2021-07-20T09:00:00Z",
                        "day_night": "NIGHT", "cloud_cover_pct": None,
                        "rings": [[[-100.0, 45.0], [-140.0, 45.0], [-140.0, 30.0], [-100.0, 30.0], [-100.0, 45.0]]]},
                       {"id": "G-OTHER", "time_start": "2021-07-21T08:54:00Z", "time_end": "2021-07-21T09:00:00Z",
                        "day_night": "NIGHT", "cloud_cover_pct": None,
                        "rings": [[[0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0], [0.0, 1.0]]]}],
    }
    return {"first": first, "passes": passes, "belief": belief.tobytes(), "granules": granules}


class FakeBackend:
    """Answers the exporter's four routes from the payloads above and records every call."""

    def __init__(self, p: dict, second: dict | None = None) -> None:
        self.p = p
        self.second = second
        self.calls: list[tuple[str, str, dict | None]] = []

    def get_json(self, path, query=None):
        self.calls.append(("GET", path, query))
        if path == "/api/runs/starts":
            return {"default_start": "2021-07-20", "starts": []}
        if path == "/api/passes":
            return copy.deepcopy(self.p["passes"])
        raise KeyError(path)

    def post_json(self, path, body):
        self.calls.append(("POST", path, dict(body)))
        if body.get("reveal"):
            return copy.deepcopy(self.second if self.second is not None else self.p["first"])
        return copy.deepcopy(self.p["first"])

    def get_bytes(self, path):
        self.calls.append(("GET", path, None))
        return self.p["belief"]


def _cmr_cache(root: Path, granules: dict) -> Path:
    for plat, gs in granules.items():
        f = root / "passes" / "test_region" / f"{plat}_2021.json.gz"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(gzip.compress(json.dumps({"months_fetched": ["2021-07"], "granules": gs}).encode("utf-8")))
    return root


def _export(tmp: Path, name: str, p: dict, second: dict | None = None, **kw) -> tuple[dict, Path, FakeBackend]:
    cache = _cmr_cache(tmp / f"cmr_{name}", p["granules"])
    be = FakeBackend(p, second)
    out = tmp / name
    m = ex.export_scene(be, "test_region", out, cmr_cache=cache, estimate_step_hours=1.0, scene_id="isogon_test", **kw)
    return m, out, be


def _files(m: dict, stage: str) -> dict[str, str]:
    return {r["path"]: r["sha256"] for r in m["files"] if r["stage"] == stage}


class GeometryTests(unittest.TestCase):
    def test_footprint_ring_size_orientation_and_closure(self):
        for ang in (0.0, 37.0, 90.0, 104.4):
            ring = geo.footprint_ring(-121.2, 40.0, 1.0, 2.0, ang)
            self.assertEqual(len(ring), 5)
            self.assertEqual(ring[0], ring[-1])
            kx = DEG_TO_KM_LAT * math.cos(math.radians(40.0))
            pts = [((x + 121.2) * kx, (y - 40.0) * DEG_TO_KM_LAT) for x, y in ring[:-1]]
            area = 0.5 * sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))
            self.assertAlmostEqual(area, 2.0, places=3)     # counter-clockwise, scan by track
            self.assertAlmostEqual(sum(p[0] for p in pts) / 4, 0.0, places=4)

    def test_scan_axis_is_a_bearing_from_north(self):
        ring = geo.footprint_ring(0.0, 0.0, 4.0, 0.0001, 90.0)   # a thin strip along the scan axis, due east
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        self.assertAlmostEqual((max(xs) - min(xs)) * DEG_TO_KM_LAT, 4.0, places=3)
        self.assertLess((max(ys) - min(ys)) * DEG_TO_KM_LAT, 0.001)

    def test_grid_cells_match_the_models_grid(self):
        self.assertEqual(geo.KM_PER_DEG_LAT, DEG_TO_KM_LAT)
        eg = EvalGrid.from_bbox((-121.44, 39.86, -120.92, 40.24), 0.375)
        g = geo.Grid375.from_payload({"nx": eg.nx, "ny": eg.ny, "cell_km": 0.375, "bbox": [-121.44, 39.86, -120.92, 40.24],
                                      "row_0": "north", "column_0": "west"})
        rng = np.random.default_rng(3)
        lon = rng.uniform(-121.44, -120.92, 5000)
        lat = rng.uniform(39.86, 40.24, 5000)
        row, col, ok = g.cells(lon, lat)
        x, y = eg.xy_km(lon, lat)
        ecol = np.floor(x / eg.cell_km).astype(int)
        erow = eg.ny - 1 - np.floor(y / eg.cell_km).astype(int)
        self.assertTrue(ok.all())
        np.testing.assert_array_equal(col, ecol)
        np.testing.assert_array_equal(row, erow)

    def test_vrt_places_the_png_on_a_global_raster(self):
        r = geo.Raster.covering((-121.44, 39.86, -120.92, 40.24))
        root = ET.fromstring(geo.global_vrt("x.png", r))
        self.assertEqual((root.get("rasterXSize"), root.get("rasterYSize")), ("720000", "360000"))
        gt = [float(v) for v in root.find("GeoTransform").text.split(",")]
        self.assertEqual(gt, [-180.0, 0.0005, 0.0, 90.0, 0.0, -0.0005])
        bands = root.findall("VRTRasterBand")
        self.assertEqual([b.find("ColorInterp").text for b in bands], ["Red", "Green", "Blue", "Alpha"])
        dst = bands[0].find("SimpleSource/DstRect")
        x0, y0 = int(dst.get("xOff")), int(dst.get("yOff"))
        w, s, e, n = r.box
        self.assertAlmostEqual(-180 + x0 * 0.0005, w)
        self.assertAlmostEqual(90 - y0 * 0.0005, n)
        self.assertLessEqual(w, -121.44)
        self.assertGreaterEqual(e, -120.92)
        self.assertLessEqual(s, 39.86)
        self.assertGreaterEqual(n, 40.24)

    def test_estimate_pixels_take_their_cell_and_leave_no_fire_clear(self):
        eg = _grid()
        g = geo.Grid375.from_payload({"nx": eg.nx, "ny": eg.ny, "cell_km": 0.375, "bbox": list(BOX), "row_0": "north",
                                      "column_0": "west"})
        step = np.zeros((g.ny, g.nx, 2), dtype=np.uint8)
        step[2, 3] = (255, 200)
        step[4, 5] = (2, 200)       # under the floor
        r = geo.Raster.covering(g.extent)
        rgba = geo.estimate_rgba(step, g, r)
        lon, lat = r.centres()
        row, col, ok = g.cells(lon, lat)
        hit = ok & (row == 2) & (col == 3)
        self.assertTrue(hit.any())
        self.assertTrue((rgba[hit][:, 3] == round(255 * geo.ESTIMATE_MAX_ALPHA)).all())
        self.assertTrue((rgba[hit][:, :3] == geo.ESTIMATE_LUT[200]).all())
        self.assertTrue((rgba[~hit][:, 3] == 0).all())


class LuaTests(unittest.TestCase):
    def test_strings_are_escaped(self):
        self.assertEqual(ex.lua_str('a "b" \\ c\nd'), '"a \\"b\\" \\\\ c\\nd"')

    def test_tables_and_expressions(self):
        text = ex.lua({"A": 1, "B": [1.5, 2], "C": {"D": True, "E": None}, "F": ex.LuaExpr('asset.resource("x")')})
        self.assertIn("A = 1,", text)
        self.assertIn("B = { 1.5, 2 },", text)
        self.assertIn("D = true,", text)
        self.assertIn('F = asset.resource("x"),', text)
        with self.assertRaises(ValueError):
            ex.lua({"not a name": 1})


class ExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.tmp = Path(cls._tmp.name)
        cls.p = _payloads()
        cls.m, cls.out, cls.be = _export(cls.tmp, "base", cls.p)
        cls.assets = cls.out / "user" / "data" / "assets" / "isogon_test"

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_counts_equal_the_payload(self):
        c = self.m["counts"]
        self.assertEqual(c["modis_overpasses"], 2)
        self.assertEqual(c["modis_footprints"], 5)
        self.assertEqual(c["reveal_overpasses"], 2)
        self.assertEqual(c["reveal_footprints"], 5)
        self.assertEqual(c["passes"], 2)
        self.assertEqual(c["granule_swaths"], 2)
        self.assertEqual(c["estimate_steps"], 5)       # 10 steps of 30 min, one an hour

    def test_every_footprint_traces_to_one_row(self):
        rows = {}
        for f in self.p["first"]["observer_passes"]["frames"]:
            for fp in f["footprints"]:
                rows[(f["timestamp_utc"], fp[0], fp[1])] = fp
        for o in self.p["first"]["blind_test"]["reveal"]["overpasses"]:
            for fp in o["footprints"]:
                rows[(o["time_utc"], fp[0], fp[1])] = fp
        seen = set()
        for path in list(self.assets.glob("data/modis/*.geojson")) + list(self.assets.glob("data/reveal/*.geojson")):
            for feat in json.loads(path.read_text())["features"]:
                ring = feat["geometry"]["coordinates"][0]
                cx = sum(p[0] for p in ring[:-1]) / 4
                cy = sum(p[1] for p in ring[:-1]) / 4
                key = [k for k in rows if k[0] == feat["properties"]["time_utc"] and abs(k[1] - cx) < 1e-5
                       and abs(k[2] - cy) < 1e-5]
                self.assertEqual(len(key), 1, (path.name, cx, cy))
                fp = rows[key[0]]
                self.assertEqual(feat["properties"]["frp_mw"], fp[5])
                self.assertEqual(len(ring), 5)
                self.assertTrue(all(len(pt) == 3 for pt in ring))
                seen.add(key[0])
        self.assertEqual(seen, set(rows))

    def test_pass_files_hold_swaths_and_no_firms_field(self):
        files = sorted(self.assets.glob("data/passes/*.geojson"))
        self.assertEqual(len(files), 2)
        for f in files:
            text = f.read_text()
            self.assertNotIn("firms_", text)
            feats = json.loads(text)["features"]
            self.assertEqual(len(feats), 1)
            ring = feats[0]["geometry"]["coordinates"][0]
            self.assertGreater(len(ring), 50)             # edges followed along great circles
            self.assertEqual(ring[0], ring[-1])
        self.assertNotIn("G-OTHER", "".join(f.read_text() for f in files))

    def test_reveal_is_fetched_last_and_scorer_keys_are_named(self):
        last = self.be.calls[-1]
        self.assertEqual((last[0], last[1]), ("POST", "/api/reconstruct"))
        self.assertTrue(last[2]["reveal"])
        self.assertEqual(sum(1 for c in self.be.calls if c[0] == "POST" and c[2].get("reveal")), 1)
        self.assertEqual(self.m["removed_before_writing"], ["blind_test", "metrics.raw_modis_rmse_mw_km2"])

    def test_no_pre_reveal_file_holds_a_hidden_footprint(self):
        hidden = [(fp[0], fp[1]) for o in self.p["first"]["blind_test"]["reveal"]["overpasses"] for fp in o["footprints"]]
        pre = [p for p in _files(self.m, "pre_reveal")]
        self.assertFalse([p for p in pre if "/reveal/" in p or p.endswith("schedules/reveal.lua")])
        for p in pre:
            if not p.endswith(".geojson"):
                continue
            for feat in json.loads((self.out / p).read_text())["features"]:
                ring = feat["geometry"]["coordinates"][0]
                cx = sum(q[0] for q in ring[:-1]) / (len(ring) - 1)
                cy = sum(q[1] for q in ring[:-1]) / (len(ring) - 1)
                for hx, hy in hidden:
                    self.assertFalse(abs(cx - hx) < 1e-5 and abs(cy - hy) < 1e-5, p)

    def test_profile_is_format_1_4_and_loads_the_scene_from_the_user_folder(self):
        prof = json.loads((self.out / "user/data/profiles/isogon_test.profile").read_text())
        self.assertEqual(prof["version"], {"major": 1, "minor": 4})
        self.assertNotIn("addons", prof)
        self.assertEqual(prof["assets"], ["base", "scene/solarsystem/planets/earth/earth", "${USER_ASSETS}/isogon_test/scene"])
        self.assertEqual(prof["time"], {"type": "absolute", "value": "2021-07-20T05:34:00", "is_paused": True})
        self.assertEqual(prof["camera"]["type"], "goToGeo")

    def test_schedules_switch_every_layer_on_and_off(self):
        data = (self.assets / "scene_data.asset").read_text()
        for family, n_layers in (("modis", 2), ("estimate", 5), ("reveal", 2), ("passes", 2)):
            text = (self.assets / f"schedules/{family}.lua").read_text()
            self.assertTrue(text.split("\n", 1)[1].startswith("return {"))
            times = re.findall(r'Time = "([0-9T:-]+)"', text)
            self.assertEqual(len(times), 2 * n_layers)
            self.assertEqual(times, sorted(times))
            self.assertEqual(text.count(", true)\""), 2 * n_layers)
            self.assertIn(f"loadFile(__FILE:schedules/{family}.lua__)", data)
        for uri in re.findall(r"Scene\.Earth\.Renderable\.GeographicOverlays\.(\w+)\.Enabled", data):
            self.assertTrue(uri.startswith("isogon_test_"))

    def test_keys_parts_and_layers_in_the_scene_data(self):
        data = (self.assets / "scene_data.asset").read_text()
        keys = re.findall(r'Key = "(\d)"', data)
        self.assertEqual(sorted(keys), ["0", "1", "2", "3", "4", "5"])
        self.assertEqual(data.count("openspace.navigation.flyToGeo('Earth'"), 5)
        geo_ids = re.findall(r'Id = "(isogon_test_(?:locator|modis|reveal|pass)_?\d*)"', data)
        self.assertEqual(len(geo_ids), 1 + 2 + 2 + 2)
        self.assertEqual(len(re.findall(r'Id = "isogon_test_estimate_\d+"', data)), 5)
        self.assertEqual(self.m["show_seconds"], 138.0)

    def test_scene_asset_is_the_template(self):
        self.assertEqual((self.assets / "scene.asset").read_bytes(), ex.TEMPLATE_ASSET.read_bytes())

    def test_text_is_clean_and_uses_nothing_new_in_0_22(self):
        for path in self.out.rglob("*"):
            if path.suffix in (".png",) or not path.is_file():
                continue
            text = path.read_text(encoding="utf-8")
            for ch in FORBIDDEN:
                self.assertNotIn(ch, text, path.name)
            if path.suffix in (".asset", ".lua", ".profile"):
                for name in NEW_IN_022:
                    self.assertNotIn(name, text, path.name)
        for name in NEW_IN_022:
            self.assertNotIn(name, ex.TEMPLATE_ASSET.read_text())

    def test_manifest_lists_every_file_with_its_digest(self):
        listed = {r["path"] for r in self.m["files"]}
        on_disk = {str(p.relative_to(self.out)) for p in self.out.rglob("*") if p.is_file()} - {"MANIFEST.json"}
        self.assertEqual(listed, on_disk)
        import hashlib
        for r in self.m["files"]:
            self.assertEqual(hashlib.sha256((self.out / r["path"]).read_bytes()).hexdigest(), r["sha256"])
        self.assertEqual({r["stage"] for r in self.m["files"]}, {"pre_reveal", "reveal", "static"})

    def test_estimate_images_are_pngs_with_their_vrt(self):
        pngs = sorted(self.assets.glob("data/estimate/*.png"))
        self.assertEqual(len(pngs), 5)
        for p in pngs:
            with Image.open(p) as im:
                mode, size = im.mode, im.size
            self.assertEqual(mode, "RGBA")
            root = ET.fromstring(p.with_suffix(".vrt").read_text())
            self.assertEqual(root.find("VRTRasterBand/SimpleSource/SourceFilename").text, p.name)
            src = root.find("VRTRasterBand/SimpleSource/SrcRect")
            self.assertEqual((int(src.get("xSize")), int(src.get("ySize"))), size)


class RevealBoundaryTests(unittest.TestCase):
    """The pre-reveal files depend on the visible run alone: whatever the scorer wrote, or the hidden rows hold,
    they are byte for byte the same."""

    def test_pre_reveal_files_ignore_what_the_scorer_wrote(self):
        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d)
            p = _payloads()
            m0, _, _ = _export(tmp, "a", p)

            q = _payloads()        # the scorer's keys and the hidden rows changed
            q["first"]["metrics"]["raw_modis_rmse_mw_km2"] = 1.0
            q["first"]["blind_test"]["verdict"]["scores"]["csi"] = 0.99
            for o in q["first"]["blind_test"]["reveal"]["overpasses"]:
                for fp in o["footprints"]:
                    fp[0] += 0.003
                    fp[5] *= 3
            m1, _, _ = _export(tmp, "b", q)

            r = _payloads()        # the first response withholds them, as after the data lane's D10
            second = copy.deepcopy(r["first"])
            del r["first"]["blind_test"]
            del r["first"]["metrics"]["raw_modis_rmse_mw_km2"]
            r["first"]["hidden_rows"]["withheld_until_reveal"] = ["blind_test", "metrics.raw_modis_rmse_mw_km2"]
            m2, _, _ = _export(tmp, "c", r, second=second)

        self.assertEqual(m0["pre_reveal_digest"], m1["pre_reveal_digest"])
        self.assertEqual(m0["pre_reveal_digest"], m2["pre_reveal_digest"])
        self.assertEqual(_files(m0, "pre_reveal"), _files(m1, "pre_reveal"))
        self.assertEqual(_files(m0, "pre_reveal"), _files(m2, "pre_reveal"))
        self.assertNotEqual(_files(m0, "reveal"), _files(m1, "reveal"))
        self.assertEqual(_files(m0, "reveal"), _files(m2, "reveal"))

    def test_a_hidden_footprint_before_the_reveal_stops_the_export(self):
        p = _payloads()
        p["first"]["observer_passes"]["frames"][1]["footprints"] = [[-121.43, 39.87, 0.4, 0.5, 104.4, 5.0, 55, 4]]
        with tempfile.TemporaryDirectory() as d, self.assertRaises(ValueError):
            _export(Path(d), "x", p)

    def test_a_run_with_nothing_hidden_is_refused(self):
        p = _payloads()
        p["first"]["holdout_viirs"] = False
        with tempfile.TemporaryDirectory() as d, self.assertRaises(ValueError):
            _export(Path(d), "x", p)


class ImageFormTests(unittest.TestCase):
    def test_footprints_as_images_stack_over_the_estimate(self):
        with tempfile.TemporaryDirectory() as d:
            m, out, _ = _export(Path(d), "img", _payloads(), footprints_as="images")
            data = (out / "user/data/assets/isogon_test/scene_data.asset").read_text()
            a = out / "user/data/assets/isogon_test"
            self.assertEqual(len(list(a.glob("data/modis/*.png"))), 2)
            self.assertEqual(len(list(a.glob("data/reveal/*.vrt"))), 2)
            self.assertEqual(m["counts"]["geojson_layers"], 1 + 2)       # locator and passes stay GeoJSON
            self.assertEqual(m["counts"]["image_layers"], 5 + 2 + 2)
            image_block = data.split("ImageLayers = {", 1)[1].split("Captions = {", 1)[0]
            order = re.findall(r'Id = "isogon_test_(estimate|modis|reveal)_\d+"', image_block)
            self.assertEqual(order, sorted(order, key=["estimate", "modis", "reveal"].index))
            with Image.open(sorted(a.glob("data/reveal/*.png"))[0]) as img:
                im = np.asarray(img)
            self.assertGreater(int((im[..., 3] > 0).sum()), 0)


@unittest.skipUnless(os.environ.get("ISOGON_OPENSPACE_LIVE") and os.environ.get("ISOGON_OPENSPACE_CMR"),
                     "set ISOGON_OPENSPACE_LIVE to a backend URL and ISOGON_OPENSPACE_CMR to the CMR cache")
class LiveExportTests(unittest.TestCase):
    def test_the_default_plumas_run_exports_with_the_payloads_counts(self):
        be = ex.HttpBackend(os.environ["ISOGON_OPENSPACE_LIVE"])
        with tempfile.TemporaryDirectory() as d:
            m = ex.export_scene(be, "plumas_ca", Path(d) / "s", cmr_cache=Path(os.environ["ISOGON_OPENSPACE_CMR"]))
        run = be.post_json("/api/reconstruct", {"region_id": "plumas_ca", "source": "firms", "start": m["start"],
                                                "holdout_viirs": True, "reveal": True})
        frames = run["observer_passes"]["frames"]
        self.assertEqual(m["counts"]["modis_footprints"],
                         sum(len(f["footprints"]) for f in frames if str(f["sensor"]).startswith("MODIS")))
        self.assertEqual(m["counts"]["reveal_footprints"],
                         sum(len(o["footprints"]) for o in run["blind_test"]["reveal"]["overpasses"]))


if __name__ == "__main__":
    unittest.main()
