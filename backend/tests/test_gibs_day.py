"""Offline unit tests for NASA GIBS daily imagery mosaic reader (backend/terrain/gibs_day.py)."""

from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import numpy as np

from backend.firms import gibs_cloud as gc
from backend.model.training import ClosedWindow
from backend.terrain import gibs_day as gd


def _solid_tile_png(r: int, g: int, b: int) -> bytes:
    arr = np.empty((512, 512, 3), dtype=np.uint8)
    arr[:, :, 0] = r
    arr[:, :, 1] = g
    arr[:, :, 2] = b
    return gd.encode_png_rgb(arr)


class TestGibsDay(unittest.TestCase):
    def test_four_tile_mosaic_crop_orientation_and_manifest_caching(self) -> None:
        # At level 8 (250m, tile_deg = 1.125), lon -121.5 splits col 51 and col 52,
        # and lat 40.5 splits row 43 (north) and row 44 (south).
        tiles_by_rc = {
            (43, 51): _solid_tile_png(200, 10, 10),   # NW
            (43, 52): _solid_tile_png(10, 200, 10),   # NE
            (44, 51): _solid_tile_png(10, 10, 200),   # SW
            (44, 52): _solid_tile_png(220, 220, 20),  # SE
        }
        calls: list[str] = []

        def fake_opener(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
            calls.append(url)
            for (r, c), payload in tiles_by_rc.items():
                if url.endswith(f"/250m/8/{r}/{c}.jpeg"):
                    return 200, {"content-type": "image/png"}, payload
            raise AssertionError(f"unexpected tile URL: {url}")

        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = Path(tmp) / "cache"
            out_file = Path(tmp) / "plumas_false.png"
            box = (-121.6, 40.4, -121.4, 40.6)

            manifest = gd.build_day_image(
                box,
                "2012-08-11",
                platform="MODIS_TERRA",
                kind="false_color",
                out_path=out_file,
                cache_dir=cache_dir,
                opener=fake_opener,
                pause_s=0.0,
            )

            self.assertEqual(len(calls), 4)
            self.assertTrue(out_file.is_file())
            manifest_file = out_file.with_name("plumas_false.png.manifest.json")
            self.assertTrue(manifest_file.is_file())

            saved_manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
            self.assertEqual(saved_manifest["layer"], "MODIS_Terra_CorrectedReflectance_Bands721")
            self.assertEqual(saved_manifest["day"], "2012-08-11")
            self.assertEqual(saved_manifest["level"], 8)
            self.assertEqual(len(saved_manifest["source_urls"]), 4)
            self.assertEqual(len(saved_manifest["digests"]), 4)
            self.assertIsNone(saved_manifest["observation_hour_utc"])
            self.assertGreater(saved_manifest["pixel_km"], 0.2)
            self.assertLess(saved_manifest["pixel_km"], 0.25)

            written_bytes = out_file.read_bytes()
            self.assertEqual(saved_manifest["bytes"], len(written_bytes))
            self.assertEqual(saved_manifest["sha256"], hashlib.sha256(written_bytes).hexdigest())
            self.assertEqual(manifest["sha256"], saved_manifest["sha256"])

            cropped = gc._decode_png_stdlib(written_bytes)[:, :, :3]
            self.assertEqual(cropped.shape, (manifest["height"], manifest["width"], 3))
            self.assertEqual(tuple(int(v) for v in cropped[0, 0]), (200, 10, 10))       # NW
            self.assertEqual(tuple(int(v) for v in cropped[0, -1]), (10, 200, 10))      # NE
            self.assertEqual(tuple(int(v) for v in cropped[-1, 0]), (10, 10, 200))      # SW
            self.assertEqual(tuple(int(v) for v in cropped[-1, -1]), (220, 220, 20))    # SE

            # Second call reuses cached raw tiles and never touches the network.
            def forbid_network(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
                raise AssertionError(f"unexpected network call on cached tile: {url}")

            out_file_2 = Path(tmp) / "plumas_false_2.png"
            manifest_2 = gd.build_day_image(
                box,
                "2012-08-11",
                platform="MODIS_TERRA",
                kind="false_color",
                out_path=out_file_2,
                cache_dir=cache_dir,
                opener=forbid_network,
                pause_s=0.0,
            )
            self.assertEqual(manifest_2["sha256"], manifest["sha256"])

    def test_layer_coverage_dates_and_closed_2021_refusal(self) -> None:
        # VIIRS_SNPP CorrectedReflectance starts 2015-11-24 in GIBS.
        with self.assertRaises(ValueError):
            gd.build_day_image((-121.44, 39.86, -120.92, 40.24), "2012-08-10", platform="VIIRS_SNPP", kind="true_color")

        # Closed 2021 windows in the three test regions are refused.
        for box in (
            (-121.44, 39.86, -120.92, 40.24),
            (-121.85, 50.04, -121.31, 50.42),
            (23.08, 38.68, 23.56, 39.04),
        ):
            with self.assertRaises(ClosedWindow):
                gd.build_day_image(box, "2021-08-05", platform="MODIS_AQUA", kind="true_color")

    def test_jpeg_roundtrip_when_pillow_installed_and_cli(self) -> None:
        tile_png = _solid_tile_png(40, 90, 140)
        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = Path(tmp) / "cache"
            spec = gd.DAY_LAYERS[("MODIS_AQUA", "true_color")]
            # Box (-121.44, 39.86, -120.92, 40.24) lies inside single level-8 tile (row=44, col=52).
            tile_dest = gd.day_tile_cache_path(cache_dir, spec, "2012-08-10", 44, 52)
            tile_dest.parent.mkdir(parents=True, exist_ok=True)
            if gd._PILImage is not None:
                buf_jpg = io.BytesIO()
                arr = np.full((512, 512, 3), (40, 90, 140), dtype=np.uint8)
                gd._PILImage.fromarray(arr, mode="RGB").save(buf_jpg, format="JPEG", quality=95)
                tile_dest.write_bytes(buf_jpg.getvalue())
                out_ext = ".jpg"
            else:
                tile_dest.write_bytes(tile_png)
                out_ext = ".png"

            out_path = Path(tmp) / f"aqua_day{out_ext}"
            stdout_buf = io.StringIO()
            with mock.patch("sys.stdout", stdout_buf):
                rc = gd.main(
                    [
                        "--box",
                        "-121.44,39.86,-120.92,40.24",
                        "--day",
                        "2012-08-10",
                        "--platform",
                        "MODIS_AQUA",
                        "--kind",
                        "true_color",
                        "--out",
                        str(out_path),
                        "--cache-dir",
                        str(cache_dir),
                        "--pause-s",
                        "0",
                    ]
                )
            self.assertEqual(rc, 0)
            parsed = json.loads(stdout_buf.getvalue())
            self.assertEqual(parsed["layer"], "MODIS_Aqua_CorrectedReflectance_TrueColor")
            self.assertEqual(parsed["level"], 8)
            self.assertTrue(out_path.is_file())


if __name__ == "__main__":
    unittest.main()
