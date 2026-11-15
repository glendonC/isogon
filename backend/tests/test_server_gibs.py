"""Offline unit tests for NASA GIBS day-picture and cloud-share HTTP routes (backend/server_gibs.py)."""

from __future__ import annotations

import base64
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

import numpy as np

from backend import server_gibs as sg
from backend.firms import gibs_cloud as gc
from backend.terrain import gibs_day as gd
from backend.tests.test_gibs_cloud import (
    _SAVED_TERRA_2012_08_10_TILE_B64,
    _modis_colormap_xml,
    _viirs_colormap_xml,
)


def _seed_offline_gibs_store(root: Path) -> None:
    # Seed v1.3 XML colour maps for MODIS and VIIRS cloud/clear-sky layers.
    modis_cmap = gc.colormap_cache_path(root, "MODIS_Cloud_Fraction.xml")
    viirs_cmap = gc.colormap_cache_path(root, "VIIRS_Clear_Sky_Confidence.xml")
    modis_cmap.parent.mkdir(parents=True, exist_ok=True)
    modis_cmap.write_bytes(_modis_colormap_xml())
    viirs_cmap.write_bytes(_viirs_colormap_xml())

    # Seed saved real NASA GIBS tile for MODIS_Terra_Cloud_Fraction_Day 2012-08-10 over plumas_ca (row=5, col=6).
    terra_cloud_spec = gc.CLOUD_LAYERS[("MODIS_TERRA", "day")]
    terra_cloud_tile = gc.tile_cache_path(root, terra_cloud_spec, "2012-08-10", 5, 6)
    terra_cloud_tile.parent.mkdir(parents=True, exist_ok=True)
    terra_cloud_tile.write_bytes(base64.b64decode(_SAVED_TERRA_2012_08_10_TILE_B64))

    # Seed synthetic 512x512 RGB tiles at level 8 (row=44, col=52) covering plumas_ca for 2012-08-10.
    for kind, rgb in (("true_color", (64, 96, 52)), ("false_color", (168, 74, 48))):
        day_spec = gd.DAY_LAYERS[("MODIS_TERRA", kind)]
        day_tile = gd.day_tile_cache_path(root, day_spec, "2012-08-10", 44, 52)
        day_tile.parent.mkdir(parents=True, exist_ok=True)
        arr = np.empty((512, 512, 3), dtype=np.uint8)
        arr[:, :] = rgb
        day_tile.write_bytes(gd.encode_png_rgb(arr))


class TestServerGibs(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "gibs"
        _seed_offline_gibs_store(self.root)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def get(self, route: str, **qs: str) -> tuple[int, bytes, str]:
        hit = sg.gibs_route(route, {k: [v] for k, v in qs.items()}, root=self.root, allow_network=False)
        self.assertIsNotNone(hit)
        assert hit is not None
        return hit

    def test_non_gibs_routes_return_none(self) -> None:
        self.assertIsNone(sg.gibs_route("/api/health", {}, root=self.root))
        self.assertIsNone(sg.gibs_route("/api/cube/record", {}, root=self.root))
        status, body, _ = self.get("/api/gibs/unknown")
        self.assertEqual(status, 404)
        self.assertIn("routes", json.loads(body))

    def test_day_picture_route_serves_cropped_png_and_manifest_offline(self) -> None:
        status, png_bytes, ctype = self.get(
            "/api/gibs/day",
            region_id="plumas_ca",
            day="2012-08-10",
            layer="MODIS_Terra_CorrectedReflectance_TrueColor",
        )
        self.assertEqual(status, 200)
        self.assertEqual(ctype, "image/png")
        self.assertEqual(png_bytes[:8], b"\x89PNG\r\n\x1a\n")

        decoded = gc._decode_png_stdlib(png_bytes)[:, :, :3]
        self.assertEqual(decoded.shape, (174, 237, 3))
        self.assertEqual(tuple(int(v) for v in decoded[0, 0]), (64, 96, 52))

        # Crop file and sidecar manifest were persisted under crops/<region_id>/<day>/.
        crop_path = sg.crop_file_path(
            self.root,
            "plumas_ca",
            "2012-08-10",
            "MODIS_Terra_CorrectedReflectance_TrueColor",
        )
        self.assertTrue(crop_path.is_file())
        self.assertTrue(crop_path.with_name(crop_path.name + ".manifest.json").is_file())

        # Platform + kind query and format=json both work offline.
        status_fc, fc_bytes, _ = self.get(
            "/api/gibs/day",
            region="plumas_ca",
            day="2012-08-10",
            platform="MODIS_TERRA",
            kind="false_color",
        )
        self.assertEqual(status_fc, 200)
        decoded_fc = gc._decode_png_stdlib(fc_bytes)[:, :, :3]
        self.assertEqual(tuple(int(v) for v in decoded_fc[10, 10]), (168, 74, 48))

        status_meta, meta_bytes, meta_ct = self.get(
            "/api/gibs/day",
            region_id="plumas_ca",
            day="2012-08-10",
            layer="MODIS_Terra_CorrectedReflectance_TrueColor",
            format="json",
        )
        self.assertEqual(status_meta, 200)
        self.assertTrue(meta_ct.startswith("application/json"))
        meta = json.loads(meta_bytes)
        self.assertEqual(meta["width"], 237)
        self.assertEqual(meta["height"], 174)
        self.assertIsNone(meta["observation_hour_utc"])

        status_list, list_bytes, _ = self.get(
            "/api/gibs/day",
            region_id="plumas_ca",
            day="2012-08-10",
            format="json",
        )
        self.assertEqual(status_list, 200)
        listed = json.loads(list_bytes)
        self.assertEqual(len(listed["layers"]), 2)

    def test_cloud_share_route_serves_multi_platform_and_single_platform_offline(self) -> None:
        status, body, ctype = self.get(
            "/api/gibs/cloud",
            region_id="plumas_ca",
            day="2012-08-10",
            when="day",
        )
        self.assertEqual(status, 200)
        self.assertTrue(ctype.startswith("application/json"))
        doc = json.loads(body)
        self.assertEqual(doc["region_id"], "plumas_ca")
        self.assertEqual(doc["day"], "2012-08-10")
        self.assertEqual(doc["when"], "day")
        self.assertEqual(doc["platform"], "MODIS_TERRA")
        self.assertEqual(doc["layer"], "MODIS_Terra_Cloud_Fraction_Day")
        self.assertAlmostEqual(doc["share"], 0.0068, places=4)
        self.assertEqual(doc["pixels"], 690)
        self.assertEqual(doc["no_data_pixels"], 0)
        self.assertIn("MODIS_AQUA", doc["platforms"])
        self.assertIsNone(doc["platforms"]["MODIS_AQUA"]["share"])
        self.assertIsNone(doc["platforms"]["VIIRS_NOAA20"]["share"])

        # NOAA-21 has no GIBS cloud layer and returns share=None without guessing.
        st_n21, body_n21, _ = self.get(
            "/api/gibs/cloud",
            region_id="plumas_ca",
            day="2024-08-02",
            when="night",
            platform="VIIRS_NOAA21",
        )
        self.assertEqual(st_n21, 200)
        doc_n21 = json.loads(body_n21)
        self.assertIsNone(doc_n21["share"])
        self.assertIsNone(doc_n21["layer"])

    def test_validation_errors_and_closed_2021_windows_refused(self) -> None:
        self.assertEqual(self.get("/api/gibs/day", region_id="plumas_ca", day="2012-08-10")[0], 400)
        self.assertEqual(
            self.get("/api/gibs/day", region_id="plumas_ca", day="bad-date", layer="MODIS_Terra_CorrectedReflectance_TrueColor")[0],
            400,
        )
        self.assertEqual(
            self.get("/api/gibs/day", region_id="plumas_ca", day="2012-08-10", layer="NO_SUCH_LAYER")[0],
            400,
        )
        self.assertEqual(
            self.get("/api/gibs/day", region_id="unknown_region", day="2012-08-10", layer="MODIS_Terra_CorrectedReflectance_TrueColor")[0],
            404,
        )
        # Pre-launch coverage date returns 404 before_coverage.
        st_pre, body_pre, _ = self.get(
            "/api/gibs/day",
            region_id="plumas_ca",
            day="2012-08-10",
            layer="VIIRS_SNPP_CorrectedReflectance_TrueColor",
        )
        self.assertEqual(st_pre, 404)
        self.assertEqual(json.loads(body_pre)["state"], "before_coverage")

        # Uncached valid date returns 404 not_cached offline.
        st_miss, body_miss, _ = self.get(
            "/api/gibs/day",
            region_id="plumas_ca",
            day="2012-08-11",
            layer="MODIS_Terra_CorrectedReflectance_TrueColor",
        )
        self.assertEqual(st_miss, 404)
        self.assertEqual(json.loads(body_miss)["state"], "not_cached")

        # Closed 2021 test windows in plumas_ca, lytton_bc, and evia_greece return 409 Conflict.
        for rid, day_2021 in (
            ("plumas_ca", "2021-07-22"),
            ("lytton_bc", "2021-06-30"),
            ("evia_greece", "2021-08-05"),
        ):
            st_d, b_d, _ = self.get(
                "/api/gibs/day",
                region_id=rid,
                day=day_2021,
                layer="MODIS_Terra_CorrectedReflectance_TrueColor",
            )
            self.assertEqual(st_d, 409)
            self.assertIn("evidence", json.loads(b_d))

            st_c, b_c, _ = self.get("/api/gibs/cloud", region_id=rid, day=day_2021, when="day")
            self.assertEqual(st_c, 409)
            self.assertIn("evidence", json.loads(b_c))

    def test_featured_fire_windows_skip_closed_2021_and_cap_workers(self) -> None:
        sample_regions = {
            "places": [
                {
                    "id": "plumas_ca",
                    "name": "Feather River & Plumas, CA",
                    "featured_fires": [
                        {
                            "id": "plumas_ca:2021-07",
                            "name": "Dixie Fire",
                            "closed": True,
                            "default_start": "2021-07-22T21:13:00Z",
                            "opens": {
                                "recorded_window": {
                                    "first_overpass_utc": "2021-07-22T21:13:00Z",
                                    "last_overpass_utc": "2021-07-25T06:22:00Z",
                                }
                            },
                            "run_starts": [],
                        },
                        {
                            "id": "plumas_ca:2012-08",
                            "name": "Chips Fire",
                            "closed": False,
                            "default_start": "2012-08-10",
                            "size": {"modis_pixels_in_box": 394},
                            "run_starts": [
                                {
                                    "start": "2012-08-10",
                                    "first_overpass_utc": "2012-08-10T06:19:00Z",
                                    "last_overpass_utc": "2012-08-11T19:02:00Z",
                                }
                            ],
                        },
                    ],
                },
                {
                    "id": "evia_greece",
                    "name": "Northern Evia Island, Greece",
                    "featured_fires": [
                        {
                            "id": "evia_greece:2021-08",
                            "name": "Northern Evia fire",
                            "closed": False,
                            "default_start": "2021-08-03",
                            "run_starts": [
                                {
                                    "start": "2021-08-03",
                                    "first_overpass_utc": "2021-08-03T21:06:00Z",
                                    "last_overpass_utc": "2021-08-09T09:24:00Z",
                                }
                            ],
                        }
                    ],
                },
            ]
        }
        windows = sg.featured_fire_windows(sample_regions)
        self.assertEqual(len(windows), 1)
        self.assertEqual(windows[0]["id"], "plumas_ca:2012-08")
        self.assertEqual(windows[0]["days"], ["2012-08-10", "2012-08-11"])

        with self.assertRaises(ValueError):
            sg.fetch_featured_fires(sample_regions, self.root, workers=5)

    def test_standalone_http_server_loopback(self) -> None:
        srv = ThreadingHTTPServer(("127.0.0.1", 0), sg.make_handler(self.root, allow_network=False))
        port = srv.server_address[1]
        thread = threading.Thread(target=srv.serve_forever, daemon=True)
        thread.start()
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/api/gibs/cloud?region_id=plumas_ca&day=2012-08-10&when=day",
                timeout=5,
            ) as resp:
                self.assertEqual(resp.status, 200)
                doc = json.loads(resp.read())
                self.assertAlmostEqual(doc["share"], 0.0068, places=4)

            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/api/gibs/day?region_id=plumas_ca&day=2012-08-10&layer=MODIS_Terra_CorrectedReflectance_TrueColor",
                timeout=5,
            ) as resp_img:
                self.assertEqual(resp_img.status, 200)
                self.assertEqual(resp_img.headers.get_content_type(), "image/png")
                self.assertEqual(resp_img.read()[:8], b"\x89PNG\r\n\x1a\n")

            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=5)
            self.assertEqual(ctx.exception.code, 404)
            ctx.exception.close()
        finally:
            srv.shutdown()
            srv.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
