"""Offline unit tests for NASA GIBS daily cloud cover reader (backend/firms/gibs_cloud.py)."""

from __future__ import annotations

import base64
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

# Exact 101 RGB triples (0% through 100%) from NASA GIBS v1.3 MODIS_Cloud_Fraction.xml.
_MODIS_CLOUD_RGBS: tuple[str, ...] = (
    "102,0,119", "102,1,119", "102,2,119", "102,3,119", "102,4,119", "102,5,119", "183,15,141", "183,16,141", "183,17,141", "183,18,141",
    "183,19,141", "183,20,141", "0,0,100", "0,1,100", "0,2,100", "0,3,100", "0,4,100", "0,5,100", "0,6,100", "0,0,170",
    "0,1,170", "0,2,170", "0,3,170", "0,4,170", "0,5,170", "0,0,255", "0,1,255", "0,2,255", "0,3,255", "0,4,255",
    "0,5,255", "0,136,238", "1,136,238", "2,136,238", "3,136,238", "4,136,238", "5,136,238", "6,136,238", "0,80,0", "1,80,0",
    "2,80,0", "3,80,0", "4,80,0", "5,80,0", "0,136,0", "1,136,0", "2,136,0", "3,136,0", "4,136,0", "5,136,0",
    "0,220,0", "1,220,0", "2,220,0", "3,220,0", "4,220,0", "5,220,0", "6,220,0", "255,255,0", "255,255,1", "255,255,2",
    "255,255,3", "255,255,4", "255,255,5", "240,190,64", "240,190,65", "240,190,66", "240,190,67", "240,190,68", "240,190,69", "187,136,0",
    "187,136,1", "187,136,2", "187,136,3", "187,136,4", "187,136,5", "187,136,6", "122,90,3", "122,90,4", "122,90,5", "122,90,6",
    "122,90,7", "122,90,8", "110,0,0", "110,0,1", "110,0,2", "110,0,3", "110,0,4", "110,0,5", "170,0,0", "170,0,1",
    "170,0,2", "170,0,3", "170,0,4", "170,0,5", "170,0,6", "255,0,0", "255,0,1", "255,0,2", "255,0,3", "255,0,4",
    "255,0,5",
)

# Saved NASA GIBS tile: MODIS_Terra_Cloud_Fraction_Day/default/2012-08-10/2km/5/5/6.png (6,598 bytes).
_SAVED_TERRA_2012_08_10_TILE_B64: str = (
    "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAMAAADDpiTIAAADAFBMVEXAwMBmAHdmAXdmAndmA3dmBHdmBXe3D423EI23EY23Eo23"
    "E423FI0AAGQAAWQAAmQAA2QABGQABWQABmQAAKoAAaoAAqoAA6oABKoABaoAAP8AAf8AAv8AA/8ABP8ABf8AiO4BiO4CiO4DiO4E"
    "iO4FiO4GiO4AUAABUAACUAADUAAEUAAFUAAAiAABiAACiAADiAAEiAAFiAAA3AAB3AAC3AAD3AAE3AAF3AAG3AD//wD//wH//wL/"
    "/wP//wT//wXwvkDwvkHwvkLwvkPwvkTwvkW7iAC7iAG7iAK7iAO7iAS7iAW7iAZ6WgN6WgR6WgV6WgZ6Wgd6WghuAABuAAFuAAJu"
    "AANuAARuAAWqAACqAAGqAAKqAAOqAASqAAWqAAb/AAD/AAH/AAL/AAP/AAT/AAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAv25+VAAABAHRSTlMA////"
    "////////////////////////////////////////////////////////////////////////////////////////////////////"
    "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"
)


def _modis_colormap_xml() -> bytes:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<ColorMaps>",
        '  <ColorMap title="No Data"><Entries>',
        '    <ColorMapEntry rgb="192,192,192" transparent="true" sourceValue="127" value="127" nodata="true" ref="0"/>',
        "  </Entries></ColorMap>",
        '  <ColorMap title="Cloud Fraction" units="%"><Entries>',
    ]
    for pct, rgb in enumerate(_MODIS_CLOUD_RGBS):
        lines.append(
            f'    <ColorMapEntry rgb="{rgb}" transparent="false" sourceValue="{pct}" value="{pct}" ref="1"/>'
        )
    lines.extend(["  </Entries></ColorMap>", "</ColorMaps>"])
    return "\n".join(lines).encode("utf-8")


def _viirs_colormap_xml() -> bytes:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<ColorMaps>",
        '  <ColorMap title="No Data"><Entries>',
        '    <ColorMapEntry rgb="0,0,0" transparent="true" sourceValue="[0]" nodata="true" ref="0"/>',
        "  </Entries></ColorMap>",
        '  <ColorMap title="Clear Sky Confidence"><Entries>',
        '    <ColorMapEntry rgb="255,247,236" transparent="false" value="[0.0,0.01)" ref="1"/>',
        '    <ColorMapEntry rgb="253,212,158" transparent="false" value="[0.50,0.51)" ref="51"/>',
        '    <ColorMapEntry rgb="127,0,0" transparent="false" value="[1.0]" ref="101"/>',
        "  </Entries></ColorMap>",
        "</ColorMaps>",
    ]
    return "\n".join(lines).encode("utf-8")


def _modis_palette() -> tuple[list[tuple[int, int, int]], list[int]]:
    rgb_list: list[tuple[int, int, int]] = [(192, 192, 192)]
    alpha_list: list[int] = [0]
    for rgb_s in _MODIS_CLOUD_RGBS:
        r, g, b = (int(v) for v in rgb_s.split(","))
        rgb_list.append((r, g, b))
        alpha_list.append(255)
    return rgb_list, alpha_list


class TestGibsCloud(unittest.TestCase):
    def setUp(self) -> None:
        gc._COLORMAP_CACHE.clear()

    def test_saved_nasa_modis_tile_decodes_offline_and_caches_manifest(self) -> None:
        tile_bytes = base64.b64decode(_SAVED_TERRA_2012_08_10_TILE_B64)
        cmap_bytes = _modis_colormap_xml()
        cmap_url = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Cloud_Fraction.xml"
        tile_url = (
            "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/"
            "MODIS_Terra_Cloud_Fraction_Day/default/2012-08-10/2km/5/5/6.png"
        )
        calls: list[str] = []

        def fake_opener(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
            calls.append(url)
            if url == cmap_url:
                return 200, {"content-type": "application/xml"}, cmap_bytes
            if url == tile_url:
                return 200, {"content-type": "image/png"}, tile_bytes
            raise AssertionError(f"unexpected URL requested: {url}")

        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = Path(tmp)
            box = (-121.44, 39.86, -120.92, 40.24)
            got = gc.cloud_share(
                box,
                "2012-08-10",
                "day",
                platform="MODIS_TERRA",
                cache_dir=cache_dir,
                opener=fake_opener,
                pause_s=0.0,
            )
            self.assertAlmostEqual(got["share"], 0.006813, places=5)
            self.assertEqual(got["pixels"], 690)
            self.assertEqual(got["no_data_pixels"], 0)
            self.assertEqual(got["layer"], "MODIS_Terra_Cloud_Fraction_Day")
            self.assertEqual(got["pixel_km"], 1.71)
            self.assertEqual(got["source_urls"], [cmap_url, tile_url])
            self.assertIsNotNone(got["retrieved_utc"])
            self.assertEqual(len(calls), 2)

            # Every cached file has a manifest beside it with matching bytes and sha256.
            saved_tile = cache_dir / "tiles/MODIS_Terra_Cloud_Fraction_Day/2012-08-10/2km/5/5/6.png"
            saved_manifest = saved_tile.with_name("6.png.manifest.json")
            self.assertTrue(saved_tile.is_file())
            self.assertTrue(saved_manifest.is_file())
            manifest = json.loads(saved_manifest.read_text(encoding="utf-8"))
            self.assertEqual(manifest["source_url"], tile_url)
            self.assertEqual(manifest["bytes"], len(tile_bytes))
            self.assertEqual(manifest["sha256"], hashlib.sha256(tile_bytes).hexdigest())

            # Second call reads strictly from cache and never calls the opener again.
            def forbid_network(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
                raise AssertionError(f"cache miss on already-cached URL: {url}")

            got_cached = gc.cloud_share(
                box,
                "2012-08-10",
                "D",
                platform="terra",
                cache_dir=cache_dir,
                opener=forbid_network,
                pause_s=0.0,
            )
            self.assertEqual(got_cached["share"], got["share"])
            self.assertEqual(got_cached["pixels"], 690)

    def test_all_nodata_box_returns_none_never_a_guess(self) -> None:
        rgb_list, alpha_list = _modis_palette()
        nodata_idx = np.zeros((512, 512), dtype=np.uint8)  # index 0 is No Data (alpha=0, rgb=192,192,192)
        png_bytes = gc.encode_png_paletted(nodata_idx, rgb_list, alpha_list)
        cmap_bytes = _modis_colormap_xml()

        def fake_opener(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
            if url.endswith(".xml"):
                return 200, {}, cmap_bytes
            return 200, {}, png_bytes

        with tempfile.TemporaryDirectory() as tmp:
            got = gc.cloud_share(
                (-121.44, 39.86, -120.92, 40.24),
                "2015-08-10",
                "night",
                platform="MODIS_AQUA",
                cache_dir=Path(tmp),
                opener=fake_opener,
                pause_s=0.0,
            )
            self.assertIsNone(got["share"])
            self.assertEqual(got["pixels"], 0)
            self.assertEqual(got["no_data_pixels"], 690)
            self.assertEqual(got["layer"], "MODIS_Aqua_Cloud_Fraction_Night")

    def test_cross_tile_boundary_mosaic_and_partial_nodata(self) -> None:
        # At level 5 (tile_deg = 9.0), longitude -126.0 separates col=5 [-135,-126] and col=6 [-126,-117].
        rgb_list, alpha_list = _modis_palette()
        left_idx = np.full((512, 512), 1, dtype=np.uint8)     # palette index 1 -> 0% cloud
        right_idx = np.full((512, 512), 101, dtype=np.uint8)  # palette index 101 -> 100% cloud
        left_png = gc.encode_png_paletted(left_idx, rgb_list, alpha_list)
        right_png = gc.encode_png_paletted(right_idx, rgb_list, alpha_list)
        cmap_bytes = _modis_colormap_xml()

        def fake_opener(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
            if url.endswith(".xml"):
                return 200, {}, cmap_bytes
            if url.endswith("/5/5/5.png"):
                return 200, {}, left_png
            if url.endswith("/5/5/6.png"):
                return 200, {}, right_png
            raise AssertionError(f"unexpected URL {url}")

        with tempfile.TemporaryDirectory() as tmp:
            # Symmetric box around -126.0 inside row 5 (lat 36..45).
            got = gc.cloud_share(
                (-126.5, 40.0, -125.5, 40.5),
                "2018-07-15",
                "day",
                platform="MODIS_TERRA",
                cache_dir=Path(tmp),
                opener=fake_opener,
                pause_s=0.0,
            )
            self.assertAlmostEqual(got["share"], 0.5, places=5)
            self.assertEqual(len(got["source_urls"]), 3)

    def test_viirs_clear_sky_confidence_complement_and_noaa21_absence(self) -> None:
        # Palette: 0 -> nodata (0,0,0 alpha=0), 1 -> [0.0,0.01) cloudy (0.995), 2 -> [1.0] clear (0.0)
        palette_rgb = [(0, 0, 0), (255, 247, 236), (127, 0, 0)]
        palette_alpha = [0, 255, 255]
        idx = np.zeros((512, 512), dtype=np.uint8)
        idx[:, :256] = 1
        idx[:, 256:] = 2
        # Add a strip of nodata on top 10 rows to verify nodata exclusion
        idx[:10, :] = 0
        viirs_png = gc.encode_png_paletted(idx, palette_rgb, palette_alpha)
        cmap_bytes = _viirs_colormap_xml()

        def fake_opener(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
            if url.endswith(".xml"):
                return 200, {}, cmap_bytes
            return 200, {}, viirs_png

        with tempfile.TemporaryDirectory() as tmp:
            # Tile (row=11, col=13) at level 6 (tile_deg=4.5) covers lon [-121.5, -117.0], lat [36.0, 40.5].
            # Midpoint longitude of that tile is -119.25; box straddling -119.25 symmetrically gets half cloudy, half clear.
            got = gc.cloud_share(
                (-119.7, 38.0, -118.8, 38.5),
                "2020-08-15",
                "day",
                platform="VIIRS_NOAA20",
                cache_dir=Path(tmp),
                opener=fake_opener,
                pause_s=0.0,
            )
            self.assertAlmostEqual(got["share"], 0.5 * 0.995, places=4)
            self.assertEqual(got["layer"], "VIIRS_NOAA20_Clear_Sky_Confidence_Day")
            self.assertEqual(got["no_data_pixels"], 0)

            # VIIRS_NOAA21 has no GIBS layer and must return share=None without touching network.
            def fail_opener(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
                raise AssertionError("should not fetch for VIIRS_NOAA21")

            n21 = gc.cloud_share(
                (-119.7, 38.0, -118.8, 38.5),
                "2024-08-02",
                "day",
                platform="VIIRS_NOAA21",
                cache_dir=Path(tmp),
                opener=fail_opener,
            )
            self.assertIsNone(n21["share"])
            self.assertIsNone(n21["layer"])

            # Pre-mission date returns share=None without touching network.
            pre = gc.cloud_share(
                (-119.7, 38.0, -118.8, 38.5),
                "2012-01-15",
                "day",
                platform="VIIRS_SNPP",
                cache_dir=Path(tmp),
                opener=fail_opener,
            )
            self.assertIsNone(pre["share"])
            self.assertEqual(pre["layer"], "VIIRS_SNPP_Clear_Sky_Confidence_Day")

    def test_closed_2021_windows_are_refused(self) -> None:
        for box in (
            (-121.44, 39.86, -120.92, 40.24),  # plumas_ca
            (-121.85, 50.04, -121.31, 50.42),  # lytton_bc
            (23.08, 38.68, 23.56, 39.04),      # evia_greece
        ):
            with self.assertRaises(ClosedWindow):
                gc.cloud_share(box, "2021-07-22", "day")

    def test_stdlib_png_decoder_and_polite_user_agent_and_cli(self) -> None:
        # Generic client header must carry no project name or URL.
        ua_lower = gc.USER_AGENT.lower()
        self.assertNotIn("isogon", ua_lower)
        self.assertNotIn("http", ua_lower)

        # CMR 'BOTH' terminator granules resolve by solar altitude over the box.
        self.assertEqual(gc.pass_when("DAY"), "day")
        self.assertEqual(gc.pass_when("NIGHT"), "night")
        self.assertEqual(gc.pass_when("BOTH", "2024-08-03T09:57:00Z", -121.58, 50.23), "night")
        self.assertEqual(gc.pass_when("BOTH", "2024-08-03T04:12:30Z", -121.58, 50.23), "night")
        self.assertEqual(gc.pass_when("BOTH", "2024-08-03T20:12:00Z", -121.58, 50.23), "day")

        # Stdlib PNG decoder matches real GIBS tile bytes directly.
        raw_png = base64.b64decode(_SAVED_TERRA_2012_08_10_TILE_B64)
        decoded = gc._decode_png_stdlib(raw_png)
        self.assertEqual(decoded.shape, (512, 512, 4))
        self.assertEqual(decoded.dtype, np.uint8)

        # CLI reads from cache and prints JSON.
        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = Path(tmp)
            cmap_dest = gc.colormap_cache_path(cache_dir, "MODIS_Cloud_Fraction.xml")
            cmap_dest.parent.mkdir(parents=True, exist_ok=True)
            cmap_dest.write_bytes(_modis_colormap_xml())
            spec = gc.CLOUD_LAYERS[("MODIS_TERRA", "day")]
            tile_dest = gc.tile_cache_path(cache_dir, spec, "2012-08-10", 5, 6)
            tile_dest.parent.mkdir(parents=True, exist_ok=True)
            tile_dest.write_bytes(raw_png)

            buf = io.StringIO()
            with mock.patch("sys.stdout", buf):
                rc = gc.main(
                    [
                        "--box",
                        "-121.44,39.86,-120.92,40.24",
                        "--day",
                        "2012-08-10",
                        "--when",
                        "day",
                        "--platform",
                        "MODIS_TERRA",
                        "--cache-dir",
                        str(cache_dir),
                        "--pause-s",
                        "0",
                    ]
                )
            self.assertEqual(rc, 0)
            payload = json.loads(buf.getvalue())
            self.assertAlmostEqual(payload["share"], 0.006813, places=5)
            self.assertEqual(payload["pixels"], 690)


if __name__ == "__main__":
    unittest.main()
