"""Offline unit tests for backend/firms/passmask.py and pure-numpy helpers in passmask_fetch.py.

Runs without network access and without h5py or pyhdf installed, using saved .npz pass mask files.
"""

from __future__ import annotations

import ast
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval.grid import EvalGrid  # noqa: E402
from backend.firms import passmask as PM  # noqa: E402


def _write_saved_pass(
    root: Path,
    box: tuple[float, float, float, float],
    platform: str,
    time_start: str,
    time_end: str,
    mask: np.ndarray,
    role_override: str | None = None,
) -> Path:
    plat = PM.canonical_platform(platform)
    role = PM.platform_role(plat) if role_override is None else role_override
    gspec = PM.PassMaskGrid.from_bbox(box)
    ts_s = PM.parse_utc_seconds(time_start)
    te_s = PM.parse_utc_seconds(time_end)
    tmid = PM.format_utc(0.5 * (ts_s + te_s))
    counts = np.bincount(mask.ravel(), minlength=len(PM.CLASS_NAMES))[: len(PM.CLASS_NAMES)].astype(np.int64)
    sh = counts.astype(np.float64) / float(mask.size)

    dest = PM.passmask_path(box, time_start, plat, root=root)
    dest.parent.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    np.savez_compressed(
        buf,
        platform=np.asarray(plat),
        role=np.asarray(role),
        time_start=np.asarray(time_start),
        time_end=np.asarray(time_end),
        time_mid=np.asarray(tmid),
        time_start_s=np.float64(ts_s),
        time_end_s=np.float64(te_s),
        box_wsen=np.asarray(box, dtype=np.float64),
        cell_km=np.float64(gspec.cell_km),
        grid_shape=np.asarray(gspec.shape, dtype=np.int64),
        km_per_deg=np.asarray([gspec.km_per_deg_lon, gspec.km_per_deg_lat], dtype=np.float64),
        classes=np.asarray(PM.CLASS_NAMES),
        mask=mask.astype(np.uint8),
        counts=counts,
        shares=sh,
    )
    payload = buf.getvalue()
    dest.write_bytes(payload)
    manifest = {
        "platform": plat,
        "role": role,
        "time_start": time_start,
        "time_end": time_end,
        "box_wsen": list(box),
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }
    dest.with_name(dest.name + ".manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return dest


class PassMaskReaderTests(unittest.TestCase):
    PLUMAS_BOX = (-121.44, 39.86, -120.92, 40.24)

    def test_passmask_reader_imports_only_stdlib_and_numpy(self) -> None:
        source = (_REPO_ROOT / "backend" / "firms" / "passmask.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        imported_roots: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported_roots.add(alias.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported_roots.add(node.module.split(".")[0])
        forbidden = {"h5py", "pyhdf", "PIL", "scipy", "backend"}
        self.assertEqual(imported_roots & forbidden, set())
        allowed_stdlib = set(sys.stdlib_module_names) | {"numpy"}
        self.assertTrue(imported_roots.issubset(allowed_stdlib), f"unexpected imports: {imported_roots - allowed_stdlib}")

    def test_passmask_grid_matches_eval_grid_cell_for_cell(self) -> None:
        for box in (
            self.PLUMAS_BOX,
            (-121.85, 50.04, -121.31, 50.42),
            (23.05, 38.68, 23.55, 39.04),
        ):
            eg = EvalGrid.from_bbox(box)
            pg = PM.PassMaskGrid.from_bbox(box)
            self.assertEqual(pg.shape, eg.shape)
            self.assertAlmostEqual(pg.km_per_deg_lon, eg.km_per_deg_lon, places=12)
            self.assertAlmostEqual(pg.km_per_deg_lat, eg.km_per_deg_lat, places=12)
            p_lon, p_lat = pg.cell_lonlat()
            e_lon, e_lat = eg.cell_lonlat()
            np.testing.assert_allclose(p_lon, e_lon, rtol=0.0, atol=1e-12)
            np.testing.assert_allclose(p_lat, e_lat, rtol=0.0, atol=1e-12)
            pts_lon = np.array([box[0] + 0.05, 0.5 * (box[0] + box[2]), box[2] + 0.5])
            pts_lat = np.array([box[1] + 0.05, 0.5 * (box[1] + box[3]), box[3] - 0.05])
            pr, pc = pg.row_col(pts_lon, pts_lat)
            er, ec = eg.row_col(pts_lon, pts_lat)
            np.testing.assert_array_equal(pr, er)
            np.testing.assert_array_equal(pc, ec)

    def test_not_fetched_returns_distinct_marker_never_clear_or_cloud(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            s = PM.shares(self.PLUMAS_BOX, "2012-08-10T06:15:00Z", "MODIS_TERRA", root=root)
            g = PM.grid(self.PLUMAS_BOX, "2012-08-10T06:15:00Z", "MODIS_TERRA", root=root)
            self.assertEqual(s, "not fetched")
            self.assertEqual(g, "not fetched")
            self.assertIsInstance(s, str)
            self.assertIsInstance(g, str)

    def test_saved_npz_shares_and_grid_roundtrip_and_time_matching(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            gspec = PM.PassMaskGrid.from_bbox(self.PLUMAS_BOX)
            mask = np.full(gspec.shape, PM.CLASS_CLEAR_LAND, dtype=np.uint8)
            mask[0:10, :] = PM.CLASS_CLOUD
            mask[10:15, 0:20] = PM.CLASS_WATER
            mask[20:22, 30:35] = PM.CLASS_FIRE
            mask[-3:, :] = PM.CLASS_NOT_SEEN

            saved = _write_saved_pass(
                root,
                self.PLUMAS_BOX,
                "MODIS_TERRA",
                "2012-08-10T06:15:00Z",
                "2012-08-10T06:20:00Z",
                mask,
            )
            self.assertIn("/masks/coarse/", saved.as_posix())
            self.assertIsNotNone(PM.read_manifest(saved))

            # Match by exact time_start, by time_mid, and by FIRMS overpass epoch seconds.
            for query_t in (
                "2012-08-10T06:15:00Z",
                "2012-08-10T06:17:30Z",
                PM.parse_utc_seconds("2012-08-10T06:18:12Z"),
            ):
                sh = PM.shares(self.PLUMAS_BOX, query_t, "Terra", root=root)
                self.assertIsInstance(sh, dict)
                assert isinstance(sh, dict)
                total_share = sh["fire"] + sh["clear_land"] + sh["cloud"] + sh["water"] + sh["not_seen"]
                self.assertAlmostEqual(total_share, 1.0, places=12)
                self.assertEqual(sh["counts"]["cloud"], 10 * gspec.nx)
                self.assertEqual(sh["counts"]["water"], 5 * 20)
                self.assertEqual(sh["counts"]["fire"], 2 * 5)
                self.assertEqual(sh["counts"]["not_seen"], 3 * gspec.nx)
                self.assertEqual(sh["role"], "coarse")
                self.assertEqual(sh["platform"], "MODIS_TERRA")

            pm = PM.grid(self.PLUMAS_BOX, "2012-08-10T06:15:00Z", "MODIS_TERRA", root=root)
            self.assertNotEqual(pm, "not fetched")
            assert isinstance(pm, PM.PassMask)
            np.testing.assert_array_equal(np.asarray(pm), mask)
            self.assertEqual(int(pm.cloud_mask.sum()), 10 * gspec.nx)
            self.assertEqual(int(pm.fire_mask.sum()), 10)
            self.assertEqual(int(pm.water_mask.sum()), 100)
            self.assertEqual(int(pm.not_seen_mask.sum()), 3 * gspec.nx)

            # Distant timestamp on the same day with no pass stays "not fetched".
            self.assertEqual(
                PM.shares(self.PLUMAS_BOX, "2012-08-10T14:00:00Z", "MODIS_TERRA", root=root),
                "not fetched",
            )

    def test_coarse_and_sharp_masks_are_separated_and_guarded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            gspec = PM.PassMaskGrid.from_bbox(self.PLUMAS_BOX)
            coarse_mask = np.full(gspec.shape, PM.CLASS_CLOUD, dtype=np.uint8)
            sharp_mask = np.full(gspec.shape, PM.CLASS_CLEAR_LAND, dtype=np.uint8)

            c_path = _write_saved_pass(
                root, self.PLUMAS_BOX, "MODIS_AQUA", "2012-08-10T09:30:00Z", "2012-08-10T09:35:00Z", coarse_mask
            )
            s_path = _write_saved_pass(
                root, self.PLUMAS_BOX, "VIIRS_SNPP", "2012-08-10T09:30:00Z", "2012-08-10T09:36:00Z", sharp_mask
            )
            self.assertIn("/masks/coarse/", c_path.as_posix())
            self.assertIn("/masks/sharp/", s_path.as_posix())
            self.assertNotEqual(c_path, s_path)

            # Model-safe readers allow coarse MODIS and refuse sharp VIIRS even at the identical timestamp.
            c_sh = PM.coarse_shares(self.PLUMAS_BOX, "2012-08-10T09:30:00Z", "MODIS_AQUA", root=root)
            assert isinstance(c_sh, dict)
            self.assertAlmostEqual(c_sh["cloud"], 1.0, places=12)

            for sharp_plat in ("VIIRS_SNPP", "VIIRS_NOAA20", "VIIRS_NOAA21"):
                with self.assertRaises(PermissionError):
                    PM.coarse_shares(self.PLUMAS_BOX, "2012-08-10T09:30:00Z", sharp_plat, root=root)
                with self.assertRaises(PermissionError):
                    PM.coarse_grid(self.PLUMAS_BOX, "2012-08-10T09:30:00Z", sharp_plat, root=root)
                with self.assertRaises(PermissionError):
                    PM.shares(self.PLUMAS_BOX, "2012-08-10T09:30:00Z", sharp_plat, root=root, allow_sharp=False)

            # Scorer-side read (default allow_sharp=True) reads the sharp VIIRS pass cleanly.
            s_sh = PM.shares(self.PLUMAS_BOX, "2012-08-10T09:30:00Z", "VIIRS_SNPP", root=root)
            assert isinstance(s_sh, dict)
            self.assertAlmostEqual(s_sh["clear_land"], 1.0, places=12)
            self.assertEqual(s_sh["role"], "sharp")

            # list_passes with allow_sharp=False returns only coarse passes.
            only_coarse = PM.list_passes(
                self.PLUMAS_BOX, "2012-08-10", "2012-08-11", root=root, allow_sharp=False
            )
            self.assertEqual([p["platform"] for p in only_coarse], ["MODIS_AQUA"])

            # Corrupted role inside a saved .npz is rejected.
            bad_path = _write_saved_pass(
                root,
                self.PLUMAS_BOX,
                "VIIRS_SNPP",
                "2012-08-10T21:00:00Z",
                "2012-08-10T21:06:00Z",
                sharp_mask,
                role_override="coarse",
            )
            with self.assertRaises(ValueError):
                PM.load_passmask_file(bad_path)

    def test_closed_2021_windows_are_refused_in_all_three_test_regions(self) -> None:
        closed_boxes = [
            (-121.44, 39.86, -120.92, 40.24),  # plumas_ca pack
            (-122.40, 39.20, -121.90, 39.60),  # plumas_ca context tile
            (-121.85, 50.04, -121.31, 50.42),  # lytton_bc pack
            (23.05, 38.68, 23.55, 39.04),      # evia_greece pack
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for box in closed_boxes:
                with self.assertRaises(PM.ClosedPassMaskWindow):
                    PM.shares(box, "2021-07-22T09:30:00Z", "MODIS_TERRA", root=root)
                with self.assertRaises(PM.ClosedPassMaskWindow):
                    PM.grid(box, "2021-01-01T00:00:00Z", "VIIRS_SNPP", root=root)
                with self.assertRaises(PM.ClosedPassMaskWindow):
                    PM.list_passes(box, "2020-12-30", "2021-01-02", root=root)

            # Open years in the hero boxes and 2021 in an unrelated region are allowed.
            self.assertEqual(
                PM.shares(self.PLUMAS_BOX, "2020-09-28T06:00:00Z", "MODIS_TERRA", root=root),
                "not fetched",
            )
            self.assertEqual(
                PM.shares((-60.5, -15.5, -60.0, -15.0), "2021-08-15T17:00:00Z", "MODIS_TERRA", root=root),
                "not fetched",
            )


class FetchPureNumpyHelperTests(unittest.TestCase):
    def test_token_redaction_and_swath_rasterization_without_h5py_or_pyhdf(self) -> None:
        from backend.firms import passmask_fetch as PF

        secret = "super_secret_earthdata_token_value_12345"
        dirty = (
            f"GET https://example.org/bucket/file.nc?Signature={secret}&Expires=999 "
            f"Authorization: Bearer {secret}"
        )
        cleaned = PF.redact_token(dirty, secret)
        self.assertNotIn(secret, cleaned)
        self.assertNotIn("Expires=999", cleaned)
        self.assertEqual(
            PF.sanitize_url("https://data.laadsdaac.earthdatacloud.nasa.gov/prod/a.nc?sig=abc", secret),
            "https://data.laadsdaac.earthdatacloud.nasa.gov/prod/a.nc",
        )

        # Synthetic 10-line MODIS-like scan over a small box: clear land with a cloud band and one fire pixel.
        box = (-121.44, 39.86, -120.92, 40.24)
        gspec = PM.PassMaskGrid.from_bbox(box)
        lons = np.linspace(-121.55, -120.80, 90, dtype=np.float32)
        lats = np.linspace(40.32, 39.78, 70, dtype=np.float32)
        lon2d, lat2d = np.meshgrid(lons, lats)
        raw = np.full(lon2d.shape, 5, dtype=np.uint8)  # 5 = clear land
        raw[10:25, :] = 4  # 4 = cloud
        raw[40, 45] = 8    # 8 = nominal confidence fire
        out_mask, hist = PF.rasterize_swath_slice(gspec, lat2d, lon2d, raw, scan_lines=10)
        self.assertEqual(out_mask.shape, gspec.shape)
        self.assertEqual(int((out_mask == PM.CLASS_NOT_SEEN).sum()), 0)
        self.assertGreater(int((out_mask == PM.CLASS_CLOUD).sum()), 1000)
        self.assertGreater(int((out_mask == PM.CLASS_CLEAR_LAND).sum()), 5000)
        self.assertGreater(int((out_mask == PM.CLASS_FIRE).sum()), 0)
        self.assertIn("8", hist)

        # Multi-granule merge keeps fire over cloud over clear_land over not_seen.
        g1 = np.zeros((4, 4), dtype=np.uint8)
        g2 = np.zeros((4, 4), dtype=np.uint8)
        g1[0, :] = PM.CLASS_CLEAR_LAND
        g1[1, :] = PM.CLASS_CLOUD
        g2[0, 0] = PM.CLASS_FIRE
        g2[2, :] = PM.CLASS_WATER
        merged = PF.merge_granule_masks([g1, g2])
        self.assertEqual(int(merged[0, 0]), PM.CLASS_FIRE)
        self.assertEqual(int(merged[0, 1]), PM.CLASS_CLEAR_LAND)
        self.assertEqual(int(merged[1, 0]), PM.CLASS_CLOUD)
        self.assertEqual(int(merged[2, 0]), PM.CLASS_WATER)
        self.assertEqual(int(merged[3, 0]), PM.CLASS_NOT_SEEN)

        # Closed 2021 fetch is refused before checking token or touching network.
        with self.assertRaises(PM.ClosedPassMaskWindow):
            PF.fetch_box_window(box, "2021-07-20", "2021-07-23")


if __name__ == "__main__":
    unittest.main()
