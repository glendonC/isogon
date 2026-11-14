"""Context terrain around the hero packs, stdlib unittest.

Synthetic tests always run. Hero tests read the built context from data/cache/hires_regions and skip with a
reason when it is not in the cache.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from PIL import Image  # noqa: E402

from backend.terrain import terrain_pack as tp  # noqa: E402
from backend.terrain.live_region import HIRES_REGION_CACHE_DIR, PRESET_BY_ID  # noqa: E402
from backend.terrain.projections import BoundingBox  # noqa: E402

HERO_IDS = ("plumas_ca", "lytton_bc", "evia_greece")
CURRENT_ESRI_CREDIT = "Esri, Vantor, Earthstar Geographics, and the GIS User Community"

# Border mismatch bounds, context DEM (bilinear between its posts) against the pack DEM along the pack
# border, in metres, over the border nodes on land (a border through sea is 0 against 0). The context
# posts are 5 times coarser (188 to 217 m apart against 38 to 43 m), so on ridges and in canyons the
# context cannot follow the pack; the bounds hold for the steepest hero region (Lytton, Fraser canyon)
# with margin: the built contexts measure land medians of 6 to 11 m and a worst
# node of 112 m.
BORDER_LAND_MEDIAN_MAX_M = 15.0
BORDER_WORST_MAX_M = 160.0
# Registration of the context's central fifth against the pack resampled to the context posts with the
# builder's own kernel, by phase correlation, in context cells (0.1 cell is about 20 m).
REG_SHIFT_MAX_CELLS = 0.1
# Same mosaic check for the context ortho over the pack rectangle: Esri zoom 11, another mosaic, moves a
# channel mean by up to 50 and correlates with the pack at 0.41 to 0.78. The luminance bound is 0.95
# and not higher: Plumas measures 0.968, because at one context texel the box averaged
# pack is sharper than the cubic downsampled zoom 12 over its forest texture.
COLOUR_MEAN_DIFF_MAX = 4.0
COLOUR_LUM_CORR_MIN = 0.95


def _synthetic_meta() -> dict:
    return {
        "version": 1, "tier": "hero", "extent_km": [44.37, 42.19], "elev_range_m": [458.1, 2392.2],
        "dem": {"name": "dem_1024_f32.bin", "size": 1024},
        "ortho": {"name": "ortho_8192.jpg", "size": 8192, "zoom": 14, "gsd_m": 7.32,
                  "source": "esri_world_imagery", "attribution": "Esri, Maxar, Earthstar Geographics"},
        "ortho_fallback": {"name": "ortho_4096.jpg", "size": 4096},
        "aux": {"name": "aux_2048.png", "size": 2048},
        "sun": {"azimuth_deg": 180.0, "elevation_deg": 40.0},
    }


def _synthetic_context() -> dict:
    return {
        "scale": 5, "extent_km": [221.85, 210.95],
        "dem": {"name": "context_dem_1024_f32.bin", "size": 1024, "format": "f32le"},
        "ortho": {"name": "context_ortho_4096.jpg", "size": 4096, "zoom": 12,
                  "source": "esri_world_imagery", "attribution": "Esri, Maxar, Earthstar Geographics"},
    }


class ContextGeometryTests(unittest.TestCase):
    def test_context_bbox_is_centred_and_scale_times_the_pack(self) -> None:
        bbox = BoundingBox(west=-121.44, south=39.86, east=-120.92, north=40.24)
        ctx = tp.context_bbox(bbox)
        self.assertEqual(tp.CONTEXT_SCALE, 5)
        self.assertAlmostEqual((ctx.west + ctx.east) / 2, (bbox.west + bbox.east) / 2, places=9)
        self.assertAlmostEqual((ctx.south + ctx.north) / 2, (bbox.south + bbox.north) / 2, places=9)
        self.assertAlmostEqual(ctx.east - ctx.west, 5 * (bbox.east - bbox.west), places=9)
        self.assertAlmostEqual(ctx.north - ctx.south, 5 * (bbox.north - bbox.south), places=9)
        # The pack is the central fifth on each axis: its edges sit at 0.4 and 0.6 of the context.
        fx0 = (bbox.west - ctx.west) / (ctx.east - ctx.west)
        fx1 = (bbox.east - ctx.west) / (ctx.east - ctx.west)
        fy0 = (ctx.north - bbox.north) / (ctx.north - ctx.south)
        fy1 = (ctx.north - bbox.south) / (ctx.north - ctx.south)
        for got, want in ((fx0, 0.4), (fx1, 0.6), (fy0, 0.4), (fy1, 0.6)):
            self.assertAlmostEqual(got, want, places=9)

    def test_sea_and_missing_data_become_zero(self) -> None:
        raw = np.array([[-3200.0, -0.4, 0.0], [0.6, 1370.0, np.nan]], dtype=np.float64)
        out = tp.context_elevation(raw)
        self.assertEqual(out.dtype, np.dtype("<f4"))
        np.testing.assert_array_equal(out, np.array([[0.0, 0.0, 0.0], [0.6, 1370.0, 0.0]], dtype="<f4"))

    def test_sea_grows_from_terrarium_zero_through_near_zero_posts(self) -> None:
        # Column 0 to 2: open sea (Terrarium at or below 0), its coastal posts resampled a little above 0.
        # Column 4: a dry basin at 0.3 m that touches no sea post stays land. Column 5: real land.
        raw = np.array([
            [0.0, -2.0, 0.2, 9.0, 0.3, 40.0],
            [0.0, 0.0, 0.4, 9.0, 0.3, 40.0],
            [-1.0, 0.0, 0.1, 0.45, 9.0, 40.0],
        ])
        smooth = np.clip(raw, 0.0, None) + np.array([[0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
                                                     [0.02, 0.0, 0.0, 0.0, 0.0, 0.0],
                                                     [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]])
        sea = tp.context_sea_mask(raw, smooth)
        want = np.array([
            [True, True, True, False, False, False],
            [True, True, True, False, False, False],
            [True, True, True, True, False, False],
        ])
        np.testing.assert_array_equal(sea, want)
        self.assertEqual(tp.SEA_SNAP_M, 0.5)

    def test_pack_border_sampling_is_exact_on_a_plane(self) -> None:
        # A plane is reproduced exactly by bilinear sampling, so a plane context against the same plane
        # pack must give zero mismatch wherever the pack border falls between context posts.
        n_ctx, n_pack = 1024, 1024
        g = np.linspace(0.0, 1.0, n_ctx)
        ctx = (300.0 + 500.0 * g[None, :] + 200.0 * g[:, None]).astype("<f4")
        gp = 0.4 + 0.2 * np.linspace(0.0, 1.0, n_pack)
        pack = (300.0 + 500.0 * gp[None, :] + 200.0 * gp[:, None]).astype("<f4")
        stats = tp.context_border_mismatch(pack, ctx, tp.CONTEXT_SCALE)
        self.assertLess(stats["worst_abs_m"], 1e-3)
        self.assertEqual(stats["nodes"], 4 * (n_pack - 1))


class ContextDescriptorTests(unittest.TestCase):
    def test_descriptor_without_context_is_unchanged(self) -> None:
        d = tp.pack_descriptor(_synthetic_meta(), "r")
        self.assertNotIn("context", d)
        self.assertEqual(
            d,
            {
                "version": 1, "tier": "hero", "extent_km": [44.37, 42.19], "elev_range_m": [458.1, 2392.2],
                "dem": {"url": "/api/runs/r/terrain/dem_1024_f32.bin", "size": 1024, "format": "f32le"},
                "ortho": {"url": "/api/runs/r/terrain/ortho_8192.jpg", "size": 8192, "zoom": 14, "gsd_m": 7.32,
                          "source": "esri_world_imagery", "attribution": CURRENT_ESRI_CREDIT},
                "ortho_fallback": {"url": "/api/runs/r/terrain/ortho_4096.jpg", "size": 4096},
                "aux": {"url": "/api/runs/r/terrain/aux_2048.png", "size": 2048,
                        "channels": {"r": "normal_x", "g": "normal_z", "b": "sky_view_ao", "a": "canopy_index"}},
                "sun": {"azimuth_deg": 180.0, "elevation_deg": 40.0},
            },
        )

    def test_descriptor_with_context_follows_the_contract(self) -> None:
        meta = {**_synthetic_meta(), "context": _synthetic_context()}
        d = tp.pack_descriptor(meta, "r")
        without = tp.pack_descriptor(_synthetic_meta(), "r")
        self.assertEqual({k: v for k, v in d.items() if k != "context"}, without)
        self.assertEqual(
            d["context"],
            {
                "extent_km": [221.85, 210.95],
                "scale": 5,
                "dem": {"url": "/api/runs/r/terrain/context_dem_1024_f32.bin", "size": 1024, "format": "f32le"},
                "ortho": {"url": "/api/runs/r/terrain/context_ortho_4096.jpg", "size": 4096, "zoom": 12,
                          "source": "esri_world_imagery", "attribution": CURRENT_ESRI_CREDIT},
            },
        )

    def test_missing_context_files_drop_the_context_and_keep_the_pack(self) -> None:
        spec = PRESET_BY_ID["plumas_ca"]
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            meta = {**_synthetic_meta(), "context": _synthetic_context(), "files": {}}
            meta["imagery"] = "esri_world_imagery"
            names = list(tp.pack_file_names(tp.tier_for(spec))) + list(tp.CONTEXT_FILE_NAMES)
            for i, name in enumerate(names):
                payload = bytes([i]) * (100 + i)
                (cache / f"{tp._file_prefix(spec, tp.tier_for(spec))}{name}").write_bytes(payload)
                meta["files"][name] = {"bytes": len(payload), "sha256": "x"}
            tp.pack_meta_path(spec, cache).write_text(json.dumps(meta), encoding="utf-8")

            loaded = tp.load_pack(spec, cache)
            self.assertIsNotNone(loaded)
            self.assertIn("context", loaded[0])
            for name in tp.CONTEXT_FILE_NAMES:
                self.assertIsNotNone(tp.resolve_pack_file(spec, name, cache))

            (cache / f"{tp._file_prefix(spec, tp.tier_for(spec))}{tp.CONTEXT_FILE_NAMES[1]}").unlink()
            loaded = tp.load_pack(spec, cache)
            self.assertIsNotNone(loaded, "a missing context file must not take the pack down")
            self.assertNotIn("context", loaded[0])
            self.assertNotIn("context", tp.pack_descriptor(loaded[0], "r"))
            for name in tp.CONTEXT_FILE_NAMES:
                self.assertIsNone(tp.resolve_pack_file(spec, name, cache))


class HeroContextTests(unittest.TestCase):
    def _context(self, region_id: str) -> tuple[dict, dict[str, Path]]:
        loaded = tp.load_pack(PRESET_BY_ID[region_id], HIRES_REGION_CACHE_DIR)
        if loaded is None or "context" not in loaded[0]:
            self.skipTest(f"context terrain for {region_id} is not built in {HIRES_REGION_CACHE_DIR}")
        return loaded

    def test_hero_descriptor_and_rasters(self) -> None:
        for rid in HERO_IDS:
            with self.subTest(region=rid):
                meta, files = self._context(rid)
                d = tp.pack_descriptor(meta, f"{rid}_holdout0_cnone")["context"]
                self.assertEqual(d["scale"], 5)
                self.assertAlmostEqual(d["extent_km"][0], 5 * meta["extent_km"][0], delta=0.011)
                self.assertAlmostEqual(d["extent_km"][1], 5 * meta["extent_km"][1], delta=0.011)
                self.assertEqual((d["dem"]["size"], d["dem"]["format"]), (1024, "f32le"))
                self.assertEqual((d["ortho"]["size"], d["ortho"]["source"]), (4096, "esri_world_imagery"))
                self.assertEqual(d["ortho"]["attribution"], CURRENT_ESRI_CREDIT)
                dem = np.fromfile(files["context_dem_1024_f32.bin"], dtype="<f4")
                self.assertEqual(dem.size, 1024 * 1024)
                self.assertTrue(np.all(np.isfinite(dem)))
                self.assertGreaterEqual(float(dem.min()), 0.0)
                with Image.open(files["context_ortho_4096.jpg"]) as img:
                    self.assertEqual((img.size, img.mode), ((4096, 4096), "RGB"))
                cb = meta["context"]["bbox"]
                pb = meta["bbox"]
                self.assertAlmostEqual((cb[0] + cb[2]) / 2, (pb[0] + pb[2]) / 2, places=9)
                self.assertAlmostEqual((cb[1] + cb[3]) / 2, (pb[1] + pb[3]) / 2, places=9)
                self.assertAlmostEqual(cb[2] - cb[0], 5 * (pb[2] - pb[0]), places=9)
                self.assertAlmostEqual(cb[3] - cb[1], 5 * (pb[3] - pb[1]), places=9)

    def test_border_mismatch_and_registration(self) -> None:
        for rid in HERO_IDS:
            with self.subTest(region=rid):
                meta, files = self._context(rid)
                pack = np.fromfile(files["dem_1024_f32.bin"], dtype="<f4").reshape(1024, 1024)
                ctx = np.fromfile(files["context_dem_1024_f32.bin"], dtype="<f4").reshape(1024, 1024)
                s = tp.context_border_mismatch(pack, ctx, 5)
                self.assertGreater(s["land_nodes"], 500, s)
                self.assertLess(s["land_median_abs_m"], BORDER_LAND_MEDIAN_MAX_M, s)
                self.assertLess(s["worst_abs_m"], BORDER_WORST_MAX_M, s)
                self.assertEqual(s, meta["context"]["checks"]["border"])
                r = tp.context_registration(pack, ctx, 5)
                self.assertLess(abs(r["shift_rows_cells"]), REG_SHIFT_MAX_CELLS, r)
                self.assertLess(abs(r["shift_cols_cells"]), REG_SHIFT_MAX_CELLS, r)

    def test_context_ortho_is_the_pack_mosaic(self) -> None:
        for rid in HERO_IDS:
            with self.subTest(region=rid):
                meta, files = self._context(rid)
                c = tp.context_colour_check(files[meta["ortho"]["name"]], files["context_ortho_4096.jpg"], 5)
                diff = np.abs(np.array(c["context_mean_srgb"]) - np.array(c["pack_mean_srgb"]))
                self.assertLess(float(diff.max()), COLOUR_MEAN_DIFF_MAX, c)
                self.assertGreater(c["lum_corr"], COLOUR_LUM_CORR_MIN, c)

    def test_sea_is_exactly_zero(self) -> None:
        for rid in HERO_IDS:
            with self.subTest(region=rid):
                meta, files = self._context(rid)
                dem = np.fromfile(files["context_dem_1024_f32.bin"], dtype="<f4").reshape(1024, 1024)
                zero = dem == 0.0
                self.assertAlmostEqual(float(zero.mean()), meta["context"]["dem"]["sea_share"], places=6)
                # No near-zero fringe: a post just above 0 never touches a sea post.
                fringe = (dem > 0.0) & (dem < tp.SEA_SNAP_M)
                touch = np.zeros_like(zero)
                touch[1:, :] |= zero[:-1, :]
                touch[:-1, :] |= zero[1:, :]
                touch[:, 1:] |= zero[:, :-1]
                touch[:, :-1] |= zero[:, 1:]
                self.assertEqual(int((fringe & touch).sum()), 0)
        meta, files = self._context("evia_greece")
        self.assertGreater(meta["context"]["dem"]["sea_share"], 0.2)
        meta, files = self._context("plumas_ca")
        self.assertEqual(meta["context"]["dem"]["sea_share"], 0.0)


class NonHeroContextTests(unittest.TestCase):
    def test_standard_packs_carry_no_context(self) -> None:
        seen = 0
        for rid in ("blue_mountains_au", "novo_progresso_br"):
            loaded = tp.load_pack(PRESET_BY_ID[rid], HIRES_REGION_CACHE_DIR)
            if loaded is None:
                continue
            seen += 1
            self.assertNotIn("context", loaded[0])
            self.assertNotIn("context", tp.pack_descriptor(loaded[0], "r"))
            self.assertFalse(any(n.startswith("context_") for n in loaded[1]))
        if not seen:
            self.skipTest("no standard pack is built in the cache")

    def test_a_pack_of_another_imagery_carries_only_its_own_context(self) -> None:
        seen = 0
        for rid, imagery in (("plumas_ca", "usgs_naip"), ("lytton_bc", "eox_s2cloudless_2016")):
            loaded = tp.load_pack(PRESET_BY_ID[rid], HIRES_REGION_CACHE_DIR, imagery)
            if loaded is None:
                continue
            seen += 1
            meta, files = loaded
            # never the default pack's context, whose imagery is another
            self.assertFalse(set(files) & set(tp.CONTEXT_FILE_NAMES), rid)
            ctx = tp.pack_descriptor(meta, "r").get("context")
            if ctx is None:
                self.assertFalse(any("context" in n for n in files), rid)
                continue
            self.assertEqual(set(n for n in files if "context" in n), set(tp.context_file_names(imagery)))
            self.assertEqual(ctx["ortho"]["source"], imagery)
            self.assertTrue(ctx["ortho"]["url"].endswith(f"/{imagery}_context_ortho_{tp.CONTEXT_ORTHO_SIZE}.jpg"))
            self.assertTrue(ctx["dem"]["url"].endswith(f"/{imagery}_context_dem_{tp.CONTEXT_DEM_SIZE}_f32.bin"))
        if not seen:
            self.skipTest("no pack of another imagery is built in the cache")


if __name__ == "__main__":
    unittest.main()
