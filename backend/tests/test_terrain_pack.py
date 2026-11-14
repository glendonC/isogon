"""Terrain pack v1 tests (stdlib unittest, NumPy and Pillow only).

Synthetic tests always run. Hero region tests read the built pack from data/cache/hires_regions and
skip with a reason when a pack is not in the cache.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
import re
import sys
import unittest

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from PIL import Image  # noqa: E402

from backend.terrain import terrain_pack as tp  # noqa: E402
from backend.terrain.live_region import (  # noqa: E402
    DEM_HIRES_SIZE,
    HIRES_REGION_CACHE_DIR,
    PRESET_BY_ID,
    region_cache_stem,
)
from backend.terrain.projections import BoundingBox, TileGridBounds  # noqa: E402
from backend.terrain.resample import (  # noqa: E402
    axis_weights,
    mercator_axis_coords,
    resample_separable,
)

HERO_IDS = ("plumas_ca", "lytton_bc", "evia_greece")

# Registration tolerance for the 1024 DEM downsampled onto the 512 node grid against the base terrain's
# dem_512 (built from Terrarium zoom 12 with a narrow 3x3 kernel). The pack's grid comes from zoom 13
# with an antialiasing kernel, so canyon floors and ridge crests legitimately differ by meters; a
# half cell shift (about 40 m) would push the RMSE past this bound on these slopes and the
# phase correlation shift past 0.1 cell.
REG_RMSE_MAX_M = 15.0
REG_BIAS_MAX_M = 2.0
REG_SHIFT_MAX_CELLS = 0.1


def _plane(n: int, gx: float, gy: float, base: float = 500.0) -> np.ndarray:
    """Heightfield rising gx meters per column (east) and gy meters per row (south)."""
    r, c = np.mgrid[0:n, 0:n].astype(np.float64)
    return (base + gx * c + gy * r).astype(np.float32)


class ResampleTests(unittest.TestCase):
    def test_node_grid_first_and_last_samples_sit_on_bbox_edges(self) -> None:
        bbox = BoundingBox(west=-121.44, south=39.86, east=-120.92, north=40.24)
        bounds = TileGridBounds(zoom=12, tx_min=665, tx_max=672, ty_min=1545, ty_max=1551)
        rows, cols = mercator_axis_coords(bbox, bounds, 1024, "node")
        rows_p, cols_p = mercator_axis_coords(bbox, bounds, 2, "node")
        self.assertAlmostEqual(rows[0], rows_p[0], places=9)
        self.assertAlmostEqual(rows[-1], rows_p[-1], places=9)
        self.assertAlmostEqual(cols[0], cols_p[0], places=9)
        self.assertAlmostEqual(cols[-1], cols_p[-1], places=9)
        self.assertLess(rows[0], rows[-1], "row 0 must be the north edge (smaller mercator y)")
        self.assertLess(cols[0], cols[-1], "column 0 must be the west edge")

    def test_cubic_resampling_reproduces_a_linear_ramp(self) -> None:
        src = _plane(64, 3.0, -2.0)
        coords = np.linspace(5.3, 58.1, 40)
        rows = axis_weights(coords, 64)
        cols = axis_weights(coords, 64)
        out = resample_separable(src, rows, cols)
        expect = 500.0 + 3.0 * coords[None, :] - 2.0 * coords[:, None]
        np.testing.assert_allclose(out, expect, atol=1e-3)

    def test_downsampling_kernel_is_widened(self) -> None:
        coords = np.arange(0, 400, 4.0) + 10.0
        w = axis_weights(coords, 512)
        self.assertGreaterEqual(w.idx.shape[1], 17)
        np.testing.assert_allclose(w.w.sum(axis=1), 1.0, atol=1e-5)


class AuxSyntheticTests(unittest.TestCase):
    def test_flat_plane_normals_point_up_and_sky_is_open(self) -> None:
        dem = np.full((96, 96), 812.0, dtype=np.float32)
        nx, ny, nz = tp.world_normals(dem, dx_m=np.full(96, 20.0), dy_m=20.0)
        np.testing.assert_allclose(nx, 0.0, atol=1e-7)
        np.testing.assert_allclose(nz, 0.0, atol=1e-7)
        np.testing.assert_allclose(ny, 1.0, atol=1e-7)
        svf = tp.sky_view_factor(dem, pad=24, dx_m=20.0, dy_m=20.0, radius_m=400.0, earth_curvature=False)
        self.assertEqual(svf.shape, (48, 48))
        np.testing.assert_allclose(svf, 1.0, atol=1e-6)

    def test_tilted_plane_normal_matches_analytic(self) -> None:
        # Rises 10 m per 20 m step toward the east and 5 m per 25 m step toward the south.
        dem = _plane(32, 10.0, 5.0)
        nx, ny, nz = tp.world_normals(dem, dx_m=np.full(32, 20.0), dy_m=25.0)
        expect = np.array([-0.5, 1.0, -0.2])
        expect /= np.linalg.norm(expect)
        self.assertAlmostEqual(float(nx[16, 16]), expect[0], places=5)
        self.assertAlmostEqual(float(ny[16, 16]), expect[1], places=5)
        self.assertAlmostEqual(float(nz[16, 16]), expect[2], places=5)

    def test_normals_are_unit_length(self) -> None:
        rng = np.random.default_rng(7)
        dem = (rng.standard_normal((128, 128)) * 120.0 + 900.0).astype(np.float32)
        nx, ny, nz = tp.world_normals(dem, dx_m=np.linspace(18.0, 22.0, 128), dy_m=21.0)
        length = np.sqrt(nx * nx + ny * ny + nz * nz)
        np.testing.assert_allclose(length, 1.0, atol=1e-5)
        self.assertTrue(np.all(ny > 0.0))

    def test_sky_view_in_range_and_canyon_floor_is_more_occluded(self) -> None:
        n = 160
        c = np.arange(n, dtype=np.float64)
        profile = 600.0 * np.minimum(1.0, np.abs(c - n / 2) / 30.0)  # V canyon 600 m deep
        dem = np.tile(profile, (n, 1)).astype(np.float32)
        svf = tp.sky_view_factor(dem, pad=40, dx_m=20.0, dy_m=20.0, radius_m=800.0)
        self.assertTrue(np.all(svf >= 0.0) and np.all(svf <= 1.0))
        mid = svf.shape[0] // 2
        floor = svf[mid, svf.shape[1] // 2]
        rim = svf[mid, 2]
        self.assertLess(floor, 0.8)
        self.assertGreater(rim, floor + 0.15)

    def test_planar_slope_sky_view_matches_analytic(self) -> None:
        # Infinite 30 degree slope: horizon elevation in direction phi from upslope is
        # max(0, atan(tan(30 deg) cos phi)); with the horizon clamped at 0 the factor is the mean of
        # 1 - sin(gamma) over azimuth.
        slope = np.tan(np.deg2rad(30.0))
        dem = _plane(220, 20.0 * slope, 0.0)
        svf = tp.sky_view_factor(dem, pad=60, dx_m=20.0, dy_m=20.0, radius_m=1150.0, n_azimuths=64,
                                 earth_curvature=False)
        phi = (np.arange(4096) + 0.5) / 4096 * 2 * np.pi
        gamma = np.maximum(0.0, np.arctan(slope * np.cos(phi)))
        analytic = 1.0 - np.mean(np.sin(gamma))
        self.assertAlmostEqual(float(np.median(svf)), analytic, delta=0.01)

    def test_aux_encoding_round_trip(self) -> None:
        rng = np.random.default_rng(3)
        dem = (rng.standard_normal((64, 64)) * 40.0).astype(np.float32)
        nx, ny, nz = tp.world_normals(dem, dx_m=np.full(64, 20.0), dy_m=20.0)
        svf = rng.uniform(0.0, 1.0, (64, 64)).astype(np.float32)
        canopy = rng.uniform(0.0, 1.0, (64, 64)).astype(np.float32)
        rgba = tp.encode_aux(nx, nz, svf, canopy)
        self.assertEqual(rgba.dtype, np.uint8)
        self.assertEqual(rgba.shape, (64, 64, 4))
        dnx = rgba[..., 0] / 255.0 * 2.0 - 1.0
        dnz = rgba[..., 1] / 255.0 * 2.0 - 1.0
        np.testing.assert_allclose(dnx, nx, atol=1.0 / 255.0 + 1e-6)
        np.testing.assert_allclose(dnz, nz, atol=1.0 / 255.0 + 1e-6)
        np.testing.assert_allclose(rgba[..., 2] / 255.0, svf, atol=0.5 / 255.0 + 1e-6)


def _phase_shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """Sub-pixel (row, col) shift of b relative to a by phase correlation of gradient magnitude."""

    def prep(x: np.ndarray) -> np.ndarray:
        gy, gx = np.gradient(x.astype(np.float64))
        g = np.hypot(gx, gy)
        g -= g.mean()
        win = np.outer(np.hanning(x.shape[0]), np.hanning(x.shape[1]))
        return g * win

    fa = np.fft.fft2(prep(a))
    fb = np.fft.fft2(prep(b))
    cross = fb * np.conj(fa)
    cross /= np.maximum(np.abs(cross), 1e-12)
    corr = np.fft.ifft2(cross).real
    peak = np.unravel_index(int(np.argmax(corr)), corr.shape)
    out = []
    for axis, p in enumerate(peak):
        n = corr.shape[axis]
        idx_m = list(peak)
        idx_p = list(peak)
        idx_m[axis] = (p - 1) % n
        idx_p[axis] = (p + 1) % n
        cm, c0, cp = corr[tuple(idx_m)], corr[peak], corr[tuple(idx_p)]
        denom = cm - 2 * c0 + cp
        frac = 0.5 * (cm - cp) / denom if abs(denom) > 1e-12 else 0.0
        s = p + frac
        if s > n / 2:
            s -= n
        out.append(float(s))
    return out[0], out[1]


def _resample_nodes(dem: np.ndarray, n_out: int) -> np.ndarray:
    """Bilinear sample a node registered square grid at the nodes of a smaller node grid."""
    n_in = dem.shape[0]
    t = np.linspace(0.0, n_in - 1.0, n_out)
    i0 = np.clip(np.floor(t).astype(int), 0, n_in - 2)
    f = t - i0
    rows = dem[i0] * (1 - f)[:, None] + dem[i0 + 1] * f[:, None]
    return rows[:, i0] * (1 - f)[None, :] + rows[:, i0 + 1] * f[None, :]


class HeroPackTests(unittest.TestCase):
    def _pack(self, region_id: str) -> tuple[dict, dict[str, Path]]:
        spec = PRESET_BY_ID[region_id]
        loaded = tp.load_pack(spec, HIRES_REGION_CACHE_DIR)
        if loaded is None:
            self.skipTest(f"terrain pack for {region_id} is not built in {HIRES_REGION_CACHE_DIR}")
        return loaded

    def test_hero_regions_use_hero_tier(self) -> None:
        for rid in HERO_IDS:
            self.assertEqual(tp.tier_for(PRESET_BY_ID[rid]).name, "hero")
        self.assertEqual(tp.tier_for(PRESET_BY_ID["blue_mountains_au"]).name, "standard")

    def test_pack_schema(self) -> None:
        for rid in HERO_IDS:
            with self.subTest(region=rid):
                meta, _ = self._pack(rid)
                d = tp.pack_descriptor(meta, f"{rid}_holdout0_cnone")
                json.dumps(d)  # serializable
                for key in ("version", "tier", "extent_km", "elev_range_m", "dem", "ortho", "ortho_fallback", "aux", "sun"):
                    self.assertIn(key, d)
                self.assertEqual(d["version"], 1)
                self.assertEqual(d["tier"], "hero")
                url_re = re.compile(rf"^/api/runs/{rid}_holdout0_cnone/terrain/[a-z0-9_]+\.(bin|jpg|png)$")
                for key in ("dem", "ortho", "ortho_fallback", "aux"):
                    self.assertRegex(d[key]["url"], url_re)
                self.assertEqual(d["dem"], {**d["dem"], "size": 1024, "format": "f32le"})
                o = d["ortho"]
                self.assertEqual((o["size"], o["zoom"], o["source"]), (8192, 14, "esri_world_imagery"))
                self.assertEqual(o["attribution"], "Esri, Vantor, Earthstar Geographics, and the GIS User Community")
                self.assertTrue(4.0 < o["gsd_m"] < 9.6)
                self.assertEqual(d["ortho_fallback"]["size"], 4096)
                self.assertEqual(d["aux"]["size"], 2048)
                self.assertEqual(
                    d["aux"]["channels"],
                    {"r": "normal_x", "g": "normal_z", "b": "sky_view_ao", "a": "canopy_index"},
                )
                self.assertTrue(0.0 <= d["sun"]["azimuth_deg"] < 360.0)
                self.assertTrue(5.0 <= d["sun"]["elevation_deg"] <= 85.0)
                spec = PRESET_BY_ID[rid]
                self.assertAlmostEqual(d["extent_km"][0], spec.width_km, places=1)
                self.assertAlmostEqual(d["extent_km"][1], spec.depth_km, places=1)
                lo, hi = d["elev_range_m"]
                self.assertLess(lo, hi)
                for det in d.get("ortho_detail", []):
                    self.assertEqual(len(det["uv_rect"]), 4)
                    u0, v0, u1, v1 = det["uv_rect"]
                    self.assertTrue(0.0 <= u0 < u1 <= 1.0 and 0.0 <= v0 < v1 <= 1.0)

    def test_raster_sizes(self) -> None:
        for rid in HERO_IDS:
            with self.subTest(region=rid):
                meta, files = self._pack(rid)
                dem_bytes = files["dem_1024_f32.bin"].read_bytes()
                self.assertEqual(len(dem_bytes), 1024 * 1024 * 4)
                dem = np.frombuffer(dem_bytes, dtype="<f4")
                self.assertTrue(np.all(np.isfinite(dem)))
                lo, hi = meta["elev_range_m"]
                self.assertAlmostEqual(float(dem.min()), lo, delta=0.05)
                self.assertAlmostEqual(float(dem.max()), hi, delta=0.05)
                for name, size, mode in (
                    ("ortho_8192.jpg", 8192, "RGB"),
                    ("ortho_4096.jpg", 4096, "RGB"),
                    ("aux_2048.png", 2048, "RGBA"),
                ):
                    with Image.open(files[name]) as img:
                        self.assertEqual(img.size, (size, size), name)
                        self.assertEqual(img.mode, mode, name)

    def test_registration_against_existing_512_dem(self) -> None:
        for rid in HERO_IDS:
            with self.subTest(region=rid):
                _, files = self._pack(rid)
                spec = PRESET_BY_ID[rid]
                old_path = HIRES_REGION_CACHE_DIR / f"{region_cache_stem(spec)}_dem_512_f32.bin"
                if not old_path.is_file():
                    self.skipTest(f"existing 512 DEM missing for {rid}")
                old = np.fromfile(old_path, dtype="<f4").reshape(DEM_HIRES_SIZE, DEM_HIRES_SIZE).astype(np.float64)
                new = np.fromfile(files["dem_1024_f32.bin"], dtype="<f4").reshape(1024, 1024).astype(np.float64)
                down = _resample_nodes(new, DEM_HIRES_SIZE)
                diff = down - old
                rmse = float(np.sqrt(np.mean(diff * diff)))
                bias = float(np.mean(diff))
                shift = _phase_shift(old, down)
                self.assertLess(rmse, REG_RMSE_MAX_M, f"{rid} rmse {rmse:.2f} m")
                self.assertLess(abs(bias), REG_BIAS_MAX_M, f"{rid} bias {bias:.2f} m")
                self.assertLess(abs(shift[0]), REG_SHIFT_MAX_CELLS, f"{rid} row shift {shift[0]:.3f}")
                self.assertLess(abs(shift[1]), REG_SHIFT_MAX_CELLS, f"{rid} col shift {shift[1]:.3f}")

    def test_aux_normals_are_unit_and_ao_in_range(self) -> None:
        for rid in HERO_IDS:
            with self.subTest(region=rid):
                _, files = self._pack(rid)
                with Image.open(files["aux_2048.png"]) as img:
                    aux = np.asarray(img, dtype=np.float64) / 255.0
                nx = aux[..., 0] * 2.0 - 1.0
                nz = aux[..., 1] * 2.0 - 1.0
                horiz = nx * nx + nz * nz
                # y = sqrt(1 - x^2 - z^2) must be real after 8 bit quantization.
                self.assertLessEqual(float(horiz.max()), 1.0 + 4.0 / 255.0)
                ny = np.sqrt(np.clip(1.0 - horiz, 0.0, 1.0))
                length = np.sqrt(horiz + ny * ny)
                self.assertLess(float(np.abs(length - 1.0).max()), 4.0 / 255.0)
                ao = aux[..., 2]
                self.assertGreaterEqual(float(ao.min()), 0.0)
                self.assertLessEqual(float(ao.max()), 1.0)
                self.assertLess(float(np.percentile(ao, 5)), 0.95, "canyons should occlude some sky")
                self.assertGreater(float(np.percentile(ao, 95)), 0.9, "ridges and flats should see open sky")
                canopy = aux[..., 3]
                self.assertTrue(0.0 <= float(canopy.min()) and float(canopy.max()) <= 1.0)


STANDARD_IDS = ("novo_progresso_br", "blue_mountains_au")


class StandardTierTests(unittest.TestCase):
    def test_ortho_zoom_is_capped_for_wide_live_search_spans(self) -> None:
        plumas = PRESET_BY_ID["plumas_ca"]
        self.assertEqual(tp.select_ortho_zoom(plumas.bbox, tp.HERO_TIER), 14)
        self.assertEqual(tp.select_ortho_zoom(PRESET_BY_ID["blue_mountains_au"].bbox, tp.STANDARD_TIER), 13)
        wide = BoundingBox(west=-120.0, south=37.0, east=-117.8, north=38.8)
        z = tp.select_ortho_zoom(wide, tp.STANDARD_TIER)
        self.assertLessEqual(z, 12)
        from backend.terrain.resample import source_step
        self.assertLessEqual(source_step(wide, z, 1), 1.5 * tp.STANDARD_TIER.ortho_size)

    def test_standard_pack_schema_and_sizes(self) -> None:
        for rid in STANDARD_IDS:
            with self.subTest(region=rid):
                spec = PRESET_BY_ID[rid]
                loaded = tp.load_pack(spec, HIRES_REGION_CACHE_DIR)
                if loaded is None:
                    self.skipTest(f"standard pack for {rid} is not built")
                meta, files = loaded
                d = tp.pack_descriptor(meta, f"{rid}_holdout0_cnone")
                self.assertEqual(d["tier"], "standard")
                self.assertEqual((d["ortho"]["size"], d["ortho"]["zoom"]), (4096, 13))
                self.assertEqual(d["ortho_fallback"]["size"], 2048)
                self.assertEqual((d["dem"]["size"], d["aux"]["size"]), (1024, 2048))
                self.assertNotIn("ortho_detail", d)
                with Image.open(files["ortho_4096.jpg"]) as img:
                    self.assertEqual(img.size, (4096, 4096))
                with Image.open(files["ortho_2048.jpg"]) as img:
                    self.assertEqual(img.size, (2048, 2048))
                self.assertEqual(files["dem_1024_f32.bin"].stat().st_size, 1024 * 1024 * 4)


class DetailInsetTests(unittest.TestCase):
    def test_window_follows_the_fire_field(self) -> None:
        fire = np.zeros((256, 256), dtype=np.float32)
        r, c = np.mgrid[0:256, 0:256]
        fire += np.exp(-(((r - 60) / 12.0) ** 2 + ((c - 190) / 12.0) ** 2))  # north east blob
        fire += 0.4 * np.exp(-(((r - 200) / 10.0) ** 2 + ((c - 40) / 10.0) ** 2))  # weaker south west blob
        x0, y0, x1, y1 = tp.choose_detail_window(fire, 0.3, 0.3)
        self.assertAlmostEqual(x1 - x0, 0.3, places=6)
        self.assertAlmostEqual(y1 - y0, 0.3, places=6)
        self.assertTrue(x0 <= 190 / 255 <= x1 and y0 <= 60 / 255 <= y1, (x0, y0, x1, y1))
        self.assertTrue(0.0 <= x0 and x1 <= 1.0 and 0.0 <= y0 and y1 <= 1.0)

    def test_image_rect_to_plane_uv(self) -> None:
        # Image space (y down from the north edge) to plane UV (v up from the south edge).
        self.assertEqual(tp.image_rect_to_uv((0.25, 0.10, 0.50, 0.40)), [0.25, 0.6, 0.5, 0.9])

    def test_hero_detail_insets_register_with_the_main_ortho(self) -> None:
        for rid in HERO_IDS:
            with self.subTest(region=rid):
                loaded = tp.load_pack(PRESET_BY_ID[rid], HIRES_REGION_CACHE_DIR)
                if loaded is None or not loaded[0].get("ortho_detail"):
                    self.skipTest(f"no detail inset built for {rid}")
                meta, files = loaded
                d = tp.pack_descriptor(meta, "rid")
                for det, info in zip(d["ortho_detail"], meta["ortho_detail"]):
                    self.assertEqual((det["size"], det["zoom"]), (8192, 16))
                    self.assertTrue(1.0 < det["gsd_m"] < 2.5)
                    u0, v0, u1, v1 = det["uv_rect"]
                    self.assertTrue(0.0 <= u0 < u1 <= 1.0 and 0.0 <= v0 < v1 <= 1.0)
                    for x in det["uv_rect"]:
                        self.assertAlmostEqual(x * 8192, round(x * 8192), places=3, msg="rect snaps to main texels")
                    # Ground footprint is square, so the rect's aspect in UV follows the bbox extent.
                    w_km, h_km = d["extent_km"]
                    self.assertAlmostEqual((u1 - u0) * w_km, (v1 - v0) * h_km, delta=0.02 * (u1 - u0) * w_km)
                    # The inset is square on the ground; main texels are not, so its footprint in main
                    # texels is n_w x n_h.
                    n_w, n_h = round((u1 - u0) * 8192), round((v1 - v0) * 8192)
                    with Image.open(files[info["name"]]) as img:
                        self.assertEqual(img.size, (8192, 8192))
                        small = np.asarray(img.convert("L").resize((n_w, n_h), Image.BOX), dtype=np.float64)
                    with Image.open(files["ortho_8192.jpg"]) as img:
                        x0, y0 = round(u0 * 8192), round((1.0 - v1) * 8192)
                        crop = np.asarray(img.convert("L").crop((x0, y0, x0 + n_w, y0 + n_h)), dtype=np.float64)
                    a = (crop - crop.mean()) / crop.std()
                    b = (small - small.mean()) / small.std()
                    self.assertGreater(float(np.mean(a * b)), 0.8, "inset content matches the main ortho window")
                    sr, sc = _phase_shift(crop, small)
                    self.assertLess(abs(sr), 0.5)
                    self.assertLess(abs(sc), 0.5)


class AttributionTests(unittest.TestCase):
    def test_descriptor_carries_the_source_current_credit_even_for_old_metas(self) -> None:
        meta = {
            "version": 1, "tier": "hero", "extent_km": [1.0, 1.0], "elev_range_m": [0.0, 1.0],
            "dem": {"name": "dem_1024_f32.bin", "size": 1024},
            "ortho": {"name": "ortho_8192.jpg", "size": 8192, "zoom": 14, "gsd_m": 7.3,
                      "source": "esri_world_imagery", "attribution": "Esri, Maxar, Earthstar Geographics"},
            "ortho_fallback": {"name": "ortho_4096.jpg", "size": 4096},
            "aux": {"name": "aux_2048.png", "size": 2048},
            "sun": {"azimuth_deg": 180.0, "elevation_deg": 40.0},
        }
        d = tp.pack_descriptor(meta, "r")
        self.assertEqual(d["ortho"]["attribution"], "Esri, Vantor, Earthstar Geographics, and the GIS User Community")

    def test_pack_status_values_follow_the_contract(self) -> None:
        self.assertEqual(set(tp.PACK_STATUS_VALUES), {"ready", "building", "failed", "absent"})


class UsgsNaipVariantTests(unittest.TestCase):
    def test_source_and_credit(self) -> None:
        from backend.terrain.tile_store import SOURCES_BY_KEY

        src = SOURCES_BY_KEY["usgs_naip"]
        self.assertIn("basemap.nationalmap.gov", src.url_template)
        self.assertEqual(src.attribution, "USDA, USGS The National Map: Orthoimagery. Data refreshed June, 2024.v1.2")

    def test_coverage_is_conterminous_united_states(self) -> None:
        self.assertTrue(tp.imagery_covers("usgs_naip", PRESET_BY_ID["plumas_ca"].bbox))
        for rid in ("lytton_bc", "evia_greece", "blue_mountains_au", "novo_progresso_br"):
            self.assertFalse(tp.imagery_covers("usgs_naip", PRESET_BY_ID[rid].bbox), rid)
        self.assertTrue(tp.imagery_covers("esri_world_imagery", PRESET_BY_ID["evia_greece"].bbox))

    def test_variant_file_names_never_collide_with_the_default_pack(self) -> None:
        default = set(tp.pack_file_names(tp.HERO_TIER))
        naip = set(tp.pack_file_names(tp.HERO_TIER, "usgs_naip"))
        self.assertFalse(default & naip)
        self.assertTrue(all(n.startswith("usgs_naip_") for n in naip))

    def test_context_names_follow_the_pack_imagery(self) -> None:
        self.assertEqual(tp.context_file_names(), tp.CONTEXT_FILE_NAMES)
        for imagery in ("usgs_naip", "eox_s2cloudless_2016"):
            names = tp.context_file_names(imagery)
            self.assertTrue(all(n.startswith(f"{imagery}_context_") for n in names), names)
            self.assertFalse(set(names) & set(tp.CONTEXT_FILE_NAMES))
        # NAIP covers the Feather River context box as well as the pack's
        self.assertTrue(tp.imagery_covers("usgs_naip", tp.context_bbox(PRESET_BY_ID["plumas_ca"].bbox)))


class ImageryChoiceTests(unittest.TestCase):
    def test_the_2016_layer_is_a_source_with_its_own_credit(self) -> None:
        from backend.terrain.tile_store import SOURCES_BY_KEY

        src = SOURCES_BY_KEY["eox_s2cloudless_2016"]
        self.assertIn("/s2cloudless_3857/", src.url_template)
        self.assertEqual(src.attribution, "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH "
                                          "(Contains modified Copernicus Sentinel data 2016 & 2017)")
        self.assertIs(tp.IMAGERY_SOURCES["eox_s2cloudless_2016"], src)
        self.assertTrue(tp.imagery_covers("eox_s2cloudless_2016", PRESET_BY_ID["evia_greece"].bbox))
        self.assertEqual(set(tp.PUBLISHABLE_IMAGERY), {"usgs_naip", "eox_s2cloudless_2016"})
        self.assertNotIn(tp.DEFAULT_IMAGERY, tp.PUBLISHABLE_IMAGERY)

    def test_named_none_the_public_domain_source_where_it_covers_the_default_elsewhere(self) -> None:
        got = tp.choose_imagery(PRESET_BY_ID["plumas_ca"].bbox)
        self.assertEqual((got["source"], got["asked"], got["chosen_by"]), ("usgs_naip", None, "coverage"))
        for rid in ("lytton_bc", "evia_greece", "blue_mountains_au", "novo_progresso_br"):
            got = tp.choose_imagery(PRESET_BY_ID[rid].bbox)
            self.assertEqual((got["source"], got["chosen_by"]), ("esri_world_imagery", "coverage"), rid)
            self.assertIn("does not cover", got["why"])
        # a server started for a recording takes the publishable layer elsewhere, and still NAIP where it covers
        self.assertEqual(tp.choose_imagery(PRESET_BY_ID["lytton_bc"].bbox, elsewhere="eox_s2cloudless_2016")["source"],
                         "eox_s2cloudless_2016")
        self.assertEqual(tp.choose_imagery(PRESET_BY_ID["plumas_ca"].bbox, elsewhere="eox_s2cloudless_2016")["source"],
                         "usgs_naip")
        with self.assertRaises(ValueError):
            tp.choose_imagery(PRESET_BY_ID["plumas_ca"].bbox, elsewhere="usgs_naip")

    def test_a_named_source_is_taken_where_it_covers(self) -> None:
        got = tp.choose_imagery(PRESET_BY_ID["plumas_ca"].bbox, "esri_world_imagery")
        self.assertEqual((got["source"], got["asked"], got["chosen_by"]), ("esri_world_imagery", "esri_world_imagery", "request"))
        got = tp.choose_imagery(PRESET_BY_ID["evia_greece"].bbox, "eox_s2cloudless_2016")
        self.assertEqual((got["source"], got["chosen_by"]), ("eox_s2cloudless_2016", "request"))
        # named where it does not cover: replaced by coverage, and the answer says so
        got = tp.choose_imagery(PRESET_BY_ID["lytton_bc"].bbox, "usgs_naip")
        self.assertEqual((got["source"], got["asked"], got["chosen_by"]), ("esri_world_imagery", "usgs_naip", "coverage"))
        self.assertTrue(got["why"].startswith("usgs_naip does not cover the box"))
        with self.assertRaises(ValueError):
            tp.choose_imagery(PRESET_BY_ID["plumas_ca"].bbox, "eox_s2cloudless_2020")

    def test_plumas_naip_pack_registers_with_the_esri_pack(self) -> None:
        spec = PRESET_BY_ID["plumas_ca"]
        naip = tp.load_pack(spec, HIRES_REGION_CACHE_DIR, "usgs_naip")
        esri = tp.load_pack(spec, HIRES_REGION_CACHE_DIR)
        if naip is None or esri is None:
            self.skipTest("plumas_ca usgs_naip pack not built")
        meta, files = naip
        d = tp.pack_descriptor(meta, "plumas_ca_holdout0_cnone")
        self.assertEqual(d["ortho"]["source"], "usgs_naip")
        self.assertEqual(d["ortho"]["attribution"], "USDA, USGS The National Map: Orthoimagery. Data refreshed June, 2024.v1.2")
        self.assertEqual((d["tier"], d["ortho"]["size"], d["ortho"]["zoom"]), ("hero", 8192, 14))
        self.assertTrue(d["ortho"]["url"].endswith("/terrain/usgs_naip_ortho_8192.jpg"))
        for key in ("dem", "ortho_fallback", "aux"):
            self.assertIn("/terrain/usgs_naip_", d[key]["url"])
        for det in d.get("ortho_detail", []):
            self.assertIn("/terrain/usgs_naip_", det["url"])
        # Same ground: luminance structure of the two orthos lines up to well under a texel.
        with Image.open(files[meta["ortho"]["name"]]) as img:
            a = np.asarray(img.convert("L").resize((1024, 1024), Image.BOX), dtype=np.float64)
        with Image.open(esri[1][esri[0]["ortho"]["name"]]) as img:
            b = np.asarray(img.convert("L").resize((1024, 1024), Image.BOX), dtype=np.float64)
        sr, sc = _phase_shift(b, a)
        self.assertLess(abs(sr), 0.25)
        self.assertLess(abs(sc), 0.25)
        dem_a = np.fromfile(files[meta["dem"]["name"]], dtype="<f4")
        dem_b = np.fromfile(esri[1][esri[0]["dem"]["name"]], dtype="<f4")
        np.testing.assert_array_equal(dem_a, dem_b)


class PackRoutingTests(unittest.TestCase):
    def test_file_names_are_whitelisted(self) -> None:
        spec = PRESET_BY_ID["plumas_ca"]
        names = tp.pack_file_names(tp.tier_for(spec))
        self.assertIn("dem_1024_f32.bin", names)
        self.assertIn("ortho_8192.jpg", names)
        self.assertIn("ortho_4096.jpg", names)
        self.assertIn("aux_2048.png", names)
        self.assertIsNone(tp.resolve_pack_file(spec, "../server.py", HIRES_REGION_CACHE_DIR))
        self.assertIsNone(tp.resolve_pack_file(spec, "meta.json", HIRES_REGION_CACHE_DIR))


if __name__ == "__main__":
    unittest.main()
