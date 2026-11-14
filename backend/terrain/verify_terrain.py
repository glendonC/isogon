#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "numpy>=1.26",
#   "pillow>=10.0",
# ]
# ///
"""Verification suite for Isogon terrain and satellite imagery outputs."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
TERRAIN_OUT_DIR = REPO_ROOT / "website" / "public" / "generated" / "terrain"
BACKEND_TERRAIN_DIR = REPO_ROOT / "backend" / "terrain"

EM_DASH = "\u2014"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def verify_no_em_dashes() -> int:
    checked = 0
    for root in (BACKEND_TERRAIN_DIR, TERRAIN_OUT_DIR):
        for p in sorted(root.rglob("*")):
            if not p.is_file():
                continue
            if p.suffix.lower() in {".py", ".json", ".md", ".txt"}:
                text = p.read_text(encoding="utf-8")
                assert_true(
                    EM_DASH not in text,
                    f"Forbidden em dash (U+2014) found in {p}",
                )
                checked += 1
    return checked


def main() -> None:
    print("=== Verifying Isogon Geospatial Terrain & Satellite Pipeline ===")

    manifest_path = TERRAIN_OUT_DIR / "terrain_manifest.json"
    assert_true(manifest_path.is_file(), f"Missing {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    bbox = manifest["region"]["bbox"]
    assert_true(
        bbox == {"west": -121.60, "south": 39.75, "east": -120.75, "north": 40.35},
        f"Unexpected bbox: {bbox}",
    )

    # 1. Verify ca_dem_f32.bin
    dem_path = TERRAIN_OUT_DIR / "ca_dem_f32.bin"
    assert_true(dem_path.is_file(), f"Missing {dem_path}")
    assert_true(
        dem_path.stat().st_size == 262144,
        f"Expected 262144 bytes for ca_dem_f32.bin, got {dem_path.stat().st_size}",
    )
    dem = np.frombuffer(dem_path.read_bytes(), dtype="<f4").reshape((256, 256))
    assert_true(bool(np.all(np.isfinite(dem))), "DEM contains NaN or Inf values")

    min_m = float(np.min(dem))
    max_m = float(np.max(dem))
    mean_m = float(np.mean(dem))
    assert_true(100.0 <= min_m <= 600.0, f"Unexpected CA min elevation: {min_m:.2f} m")
    assert_true(2100.0 <= max_m <= 3200.0, f"Unexpected CA max elevation: {max_m:.2f} m")

    # Check Lake Almanor central water surface (~40.23 N, -121.16 W -> ~1368.5 m spillway)
    u_lake = (-121.16 - (-121.60)) / (-120.75 - (-121.60))
    v_lake = (40.35 - 40.23) / (40.35 - 39.75)
    lake_dem_m = float(dem[int(round(v_lake * 255)), int(round(u_lake * 255))])
    assert_true(
        1360.0 <= lake_dem_m <= 1380.0,
        f"Lake Almanor elevation {lake_dem_m:.2f} m outside expected [1360, 1380] m",
    )

    # 2. Verify ca_normals.png
    normals_path = TERRAIN_OUT_DIR / "ca_normals.png"
    assert_true(normals_path.is_file(), f"Missing {normals_path}")
    with Image.open(normals_path) as im_norm:
        assert_true(im_norm.size == (512, 512), f"Expected 512x512 normals, got {im_norm.size}")
        assert_true(im_norm.mode == "RGB", f"Expected RGB normals, got {im_norm.mode}")
        norm_arr = np.asarray(im_norm, dtype=np.float64)

    n_vec = (norm_arr / 255.0) * 2.0 - 1.0
    n_len = np.linalg.norm(n_vec, axis=-1)
    assert_true(
        float(np.min(n_len)) > 0.97 and float(np.max(n_len)) < 1.03,
        f"Normal vector lengths out of unit range: [{np.min(n_len):.3f}, {np.max(n_len):.3f}]",
    )
    assert_true(bool(np.all(n_vec[:, :, 2] > 0.1)), "Normals contain downward-pointing vectors")

    lake_norm_rgb = norm_arr[int(v_lake * 512), int(u_lake * 512)]
    assert_true(
        abs(lake_norm_rgb[0] - 128.0) <= 2.0
        and abs(lake_norm_rgb[1] - 128.0) <= 2.0
        and lake_norm_rgb[2] >= 253.0,
        f"Lake Almanor normal not flat vertical: {lake_norm_rgb}",
    )

    # 3. Verify ca_satellite.jpg
    sat_path = TERRAIN_OUT_DIR / "ca_satellite.jpg"
    assert_true(sat_path.is_file(), f"Missing {sat_path}")
    with Image.open(sat_path) as im_sat:
        assert_true(im_sat.size == (1024, 1024), f"Expected 1024x1024 sat, got {im_sat.size}")
        assert_true(im_sat.mode == "RGB", f"Expected RGB sat, got {im_sat.mode}")
        sat_arr = np.asarray(im_sat, dtype=np.float64)

    assert_true(float(np.std(sat_arr)) > 15.0, "Satellite image has suspiciously low contrast")
    lake_sat_rgb = sat_arr[int(v_lake * 1024), int(u_lake * 1024)]
    mean_sat_red = float(np.mean(sat_arr[:, :, 0]))
    assert_true(
        lake_sat_rgb[0] < mean_sat_red * 0.55,
        f"Co-registration check failed: Lake Almanor pixel RGB={lake_sat_rgb} vs mean R={mean_sat_red:.1f}",
    )

    # 4. Verify earth_day.jpg
    earth_day_path = TERRAIN_OUT_DIR / "earth_day.jpg"
    assert_true(earth_day_path.is_file(), f"Missing {earth_day_path}")
    with Image.open(earth_day_path) as im_day:
        assert_true(
            im_day.size == (2048, 1024), f"Expected 2048x1024 earth_day, got {im_day.size}"
        )
        assert_true(im_day.mode == "RGB", f"Expected RGB earth_day, got {im_day.mode}")
        day_arr = np.asarray(im_day, dtype=np.float64)

    # Ensure bottom row (Antarctica) and right column (+180 deg) have zero black WMTS tile padding
    assert_true(
        float(np.mean(day_arr[-1, :, :])) > 120.0,
        f"Bottom row of earth_day.jpg is too dark ({np.mean(day_arr[-1]):.1f}); expected Antarctica",
    )
    assert_true(
        float(np.mean(day_arr[:, -1, :])) > 10.0,
        "Right edge of earth_day.jpg appears black-padded",
    )

    # 5. Verify earth_bump.png
    bump_path = TERRAIN_OUT_DIR / "earth_bump.png"
    assert_true(bump_path.is_file(), f"Missing {bump_path}")
    with Image.open(bump_path) as im_bump:
        assert_true(
            im_bump.size == (1024, 512), f"Expected 1024x512 earth_bump, got {im_bump.size}"
        )
        bump_arr = np.asarray(im_bump, dtype=np.uint8)

    # Pacific Ocean at (0 N, -150 W) should be 0; Tibetan Plateau at (32 N, 85 E) should be > 180
    pac_val = int(bump_arr[int(0.5 * 512), int(((-150.0 + 180.0) / 360.0) * 1024)])
    tibet_val = int(bump_arr[int(((90.0 - 32.0) / 180.0) * 512), int(((85.0 + 180.0) / 360.0) * 1024)])
    assert_true(pac_val == 0, f"Expected Pacific Ocean bump == 0, got {pac_val}")
    assert_true(tibet_val >= 180, f"Expected Tibetan Plateau bump >= 180, got {tibet_val}")

    # 6. Verify manifest SHA-256 digests and sizes
    for key, asset in manifest["assets"].items():
        fpath = TERRAIN_OUT_DIR / asset["file"]
        assert_true(fpath.is_file(), f"Manifest asset missing on disk: {fpath}")
        actual_bytes = fpath.stat().st_size
        actual_sha = sha256_file(fpath)
        assert_true(
            actual_bytes == asset["bytes"],
            f"Byte size mismatch for {key}: {actual_bytes} != {asset['bytes']}",
        )
        assert_true(
            actual_sha == asset["sha256"],
            f"SHA-256 mismatch for {key}: {actual_sha} != {asset['sha256']}",
        )

    # 7. Verify zero em dashes anywhere
    text_files_checked = verify_no_em_dashes()

    print(f"[PASS] ca_dem_f32.bin: 256x256 <f4 (262,144 B), min={min_m:.2f} m, max={max_m:.2f} m, mean={mean_m:.2f} m")
    print(f"[PASS] Lake Almanor co-registration: elev={lake_dem_m:.2f} m, normal={lake_norm_rgb.astype(int).tolist()}, sat_rgb={lake_sat_rgb.astype(int).tolist()}")
    print("[PASS] ca_normals.png: 512x512 RGB unit normals verified")
    print("[PASS] ca_satellite.jpg: 1024x1024 RGB Sentinel-2 Cloudless verified")
    print("[PASS] earth_day.jpg: 2048x1024 RGB NASA Blue Marble Next Generation verified")
    print(f"[PASS] earth_bump.png: 1024x512 L global Terrarium relief verified (Pacific={pac_val}, Tibet={tibet_val})")
    print(f"[PASS] Zero U+2014 em dashes across {text_files_checked} text/code/JSON files")


if __name__ == "__main__":
    main()
