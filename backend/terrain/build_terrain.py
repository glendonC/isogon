#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "numpy>=1.26",
#   "pillow>=10.0",
# ]
# ///
"""Build real geospatial elevation and satellite textures for Isogon."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.terrain.projections import (
    BoundingBox,
    TileGridBounds,
    compute_surface_normals_rgb,
    decode_terrarium_rgb,
    reproject_mercator_dem_grid,
    reproject_mercator_dem_raster,
    reproject_mercator_rgb_raster,
    tile_bounds_for_bbox,
    wgs84_bbox_dimensions_m,
)
from backend.terrain.tile_fetcher import fetch_xyz_mosaic_rgb

CA_BBOX = BoundingBox(
    west=-121.60,
    south=39.75,
    east=-120.75,
    north=40.35,
)
GLOBAL_BBOX = BoundingBox(
    west=-180.0,
    south=-90.0,
    east=180.0,
    north=90.0,
)

AWS_TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
EOX_S2_2020_URL = (
    "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"
)
NASA_GIBS_BLUEMARBLE_URL = (
    "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/"
    "BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/500m/{z}/{y}/{x}.jpeg"
)

CA_DEM_ZOOM = 11
CA_DEM_SIZE = 256
CA_NORMALS_SIZE = 512

CA_SAT_ZOOM = 12
CA_SAT_SIZE = 1024
CA_SAT_GAMMA = 0.88

GLOBAL_GIBS_ZOOM = 2
GLOBAL_DAY_WIDTH = 2048
GLOBAL_DAY_HEIGHT = 1024

GLOBAL_BUMP_ZOOM = 3
GLOBAL_BUMP_WIDTH = 1024
GLOBAL_BUMP_HEIGHT = 512
GLOBAL_BUMP_MAX_ELEV_M = 6000.0
GLOBAL_BUMP_GAMMA = 0.85


def sha256_file(path: Path) -> str:
    """Compute hex SHA-256 digest of a file on disk."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def apply_natural_gamma_rgb(rgb: NDArray[np.uint8], gamma: float) -> NDArray[np.uint8]:
    """Apply subtle photographic gamma lift while preserving black/white endpoints."""
    if abs(gamma - 1.0) < 1e-6:
        return rgb
    norm = rgb.astype(np.float32) / 255.0
    lifted = np.power(np.clip(norm, 0.0, 1.0), np.float32(gamma))
    return np.clip(np.rint(lifted * 255.0), 0, 255).astype(np.uint8)


def build_california_dem_and_normals(output_dir: Path) -> dict[str, Any]:
    """Fetch z=11 AWS Terrarium tiles, reproject DEM (256x256) and normals (512x512)."""
    bounds = tile_bounds_for_bbox(CA_BBOX, zoom=CA_DEM_ZOOM, tile_size=256, margin_px=4.0)
    print(
        f"[1/4] Fetching California DEM tiles (z={CA_DEM_ZOOM}, "
        f"x={bounds.tx_min}..{bounds.tx_max}, y={bounds.ty_min}..{bounds.ty_max}, "
        f"{bounds.total_tiles} tiles)..."
    )
    mosaic_rgb = fetch_xyz_mosaic_rgb(AWS_TERRARIUM_URL, bounds, tile_size=256)
    mosaic_elev_m = decode_terrarium_rgb(mosaic_rgb)

    dem_256_f64 = reproject_mercator_dem_grid(
        mosaic_elev_m=mosaic_elev_m,
        bounds=bounds,
        bbox=CA_BBOX,
        out_rows=CA_DEM_SIZE,
        out_cols=CA_DEM_SIZE,
    )
    if not np.all(np.isfinite(dem_256_f64)):
        raise RuntimeError("Non-finite values encountered in California DEM grid")

    dem_256_f32 = dem_256_f64.astype("<f4")
    dem_path = output_dir / "ca_dem_f32.bin"
    dem_path.write_bytes(dem_256_f32.tobytes(order="C"))

    dem_512_f64 = reproject_mercator_dem_raster(
        mosaic_elev_m=mosaic_elev_m,
        bounds=bounds,
        bbox=CA_BBOX,
        out_height=CA_NORMALS_SIZE,
        out_width=CA_NORMALS_SIZE,
        supersample=2,
    )
    normals_rgb = compute_surface_normals_rgb(dem_512_f64, CA_BBOX)
    normals_path = output_dir / "ca_normals.png"
    Image.fromarray(normals_rgb, mode="RGB").save(normals_path, format="PNG", optimize=True)

    min_elev = float(np.min(dem_256_f32))
    max_elev = float(np.max(dem_256_f32))
    mean_elev = float(np.mean(dem_256_f32))
    std_elev = float(np.std(dem_256_f32))
    print(
        f"      Saved {dem_path.name} ({dem_path.stat().st_size} B, "
        f"min={min_elev:.2f} m, max={max_elev:.2f} m, mean={mean_elev:.2f} m)"
    )
    print(f"      Saved {normals_path.name} ({CA_NORMALS_SIZE}x{CA_NORMALS_SIZE} RGB)")

    return {
        "dem_path": dem_path,
        "normals_path": normals_path,
        "bounds": bounds,
        "min_elev_m": round(min_elev, 3),
        "max_elev_m": round(max_elev, 3),
        "mean_elev_m": round(mean_elev, 3),
        "std_elev_m": round(std_elev, 3),
    }


def build_california_satellite(output_dir: Path) -> dict[str, Any]:
    """Fetch z=12 EOX Sentinel-2 Cloudless 2020 tiles and reproject to 1024x1024 EPSG:4326."""
    bounds = tile_bounds_for_bbox(CA_BBOX, zoom=CA_SAT_ZOOM, tile_size=256, margin_px=4.0)
    print(
        f"[2/4] Fetching California Sentinel-2 Cloudless tiles (z={CA_SAT_ZOOM}, "
        f"x={bounds.tx_min}..{bounds.tx_max}, y={bounds.ty_min}..{bounds.ty_max}, "
        f"{bounds.total_tiles} tiles)..."
    )
    mosaic_rgb = fetch_xyz_mosaic_rgb(EOX_S2_2020_URL, bounds, tile_size=256)
    reprojected_rgb = reproject_mercator_rgb_raster(
        mosaic_rgb=mosaic_rgb,
        bounds=bounds,
        bbox=CA_BBOX,
        out_height=CA_SAT_SIZE,
        out_width=CA_SAT_SIZE,
        supersample=4,
    )
    balanced_rgb = apply_natural_gamma_rgb(reprojected_rgb, gamma=CA_SAT_GAMMA)

    sat_path = output_dir / "ca_satellite.jpg"
    Image.fromarray(balanced_rgb, mode="RGB").save(
        sat_path, format="JPEG", quality=93, subsampling=0
    )
    print(
        f"      Saved {sat_path.name} ({CA_SAT_SIZE}x{CA_SAT_SIZE} RGB, "
        f"{sat_path.stat().st_size} B)"
    )
    return {
        "sat_path": sat_path,
        "bounds": bounds,
    }


def build_global_earth_day(output_dir: Path) -> Path:
    """Fetch z=2 NASA GIBS BlueMarble ShadedRelief Bathymetry (EPSG:4326) -> 2048x1024."""
    # At OGC 500m TMS z=2: scale gives 0.140625 deg/px, 5x3 tiles of 512x512 = 2560x1536,
    # where exact [-180..+180, +90..-90] spans the top-left 2560x1280 pixels.
    gibs_bounds = TileGridBounds(zoom=GLOBAL_GIBS_ZOOM, tx_min=0, tx_max=4, ty_min=0, ty_max=2)
    print(
        f"[3/4] Fetching global NASA Blue Marble Next Generation tiles "
        f"(z={GLOBAL_GIBS_ZOOM}, {gibs_bounds.total_tiles} tiles in EPSG:4326)..."
    )
    mosaic_rgb = fetch_xyz_mosaic_rgb(NASA_GIBS_BLUEMARBLE_URL, gibs_bounds, tile_size=512)
    valid_equirect = mosaic_rgb[:1280, :2560, :]

    img_full = Image.fromarray(valid_equirect, mode="RGB")
    img_2048 = img_full.resize(
        (GLOBAL_DAY_WIDTH, GLOBAL_DAY_HEIGHT), resample=Image.Resampling.LANCZOS
    )
    earth_day_path = output_dir / "earth_day.jpg"
    img_2048.save(earth_day_path, format="JPEG", quality=93, subsampling=0)
    print(
        f"      Saved {earth_day_path.name} ({GLOBAL_DAY_WIDTH}x{GLOBAL_DAY_HEIGHT} RGB, "
        f"{earth_day_path.stat().st_size} B)"
    )
    return earth_day_path


def build_global_earth_bump(output_dir: Path) -> dict[str, Any]:
    """Fetch all 64 global z=3 AWS Terrarium tiles and reproject to 1024x512 equirectangular bump."""
    global_tile_bounds = TileGridBounds(
        zoom=GLOBAL_BUMP_ZOOM,
        tx_min=0,
        tx_max=(1 << GLOBAL_BUMP_ZOOM) - 1,
        ty_min=0,
        ty_max=(1 << GLOBAL_BUMP_ZOOM) - 1,
    )
    print(
        f"[4/4] Fetching global AWS Terrarium elevation tiles "
        f"(z={GLOBAL_BUMP_ZOOM}, {global_tile_bounds.total_tiles} tiles)..."
    )
    mosaic_rgb = fetch_xyz_mosaic_rgb(AWS_TERRARIUM_URL, global_tile_bounds, tile_size=256)
    mosaic_elev_m = decode_terrarium_rgb(mosaic_rgb)

    equirect_elev_m = reproject_mercator_dem_raster(
        mosaic_elev_m=mosaic_elev_m,
        bounds=global_tile_bounds,
        bbox=GLOBAL_BBOX,
        out_height=GLOBAL_BUMP_HEIGHT,
        out_width=GLOBAL_BUMP_WIDTH,
        supersample=2,
        tile_size=256,
        wrap_x=True,
    )
    # North of +85.0511 deg is central Arctic Ocean (sea level <= 0 m).
    # South of -85.0511 deg is the interior Antarctic Polar Plateau (~2835 m at 90 deg S);
    # smoothly blend from -85.0511 deg to constant 2835.0 m at -90 deg so the spherical
    # South Pole vertex is C1-continuous with zero Mercator clamping streaks.
    lats_1d = 90.0 - ((np.arange(GLOBAL_BUMP_HEIGHT, dtype=np.float64) + 0.5) / GLOBAL_BUMP_HEIGHT) * 180.0
    south_cap_mask = lats_1d < -85.05112878
    if np.any(south_cap_mask):
        t = np.clip((-85.05112878 - lats_1d[south_cap_mask]) / (90.0 - 85.05112878), 0.0, 1.0)
        s = (t * t * (3.0 - 2.0 * t))[:, np.newaxis]
        south_pole_elev_m = 2835.0
        equirect_elev_m[south_cap_mask, :] = (
            (1.0 - s) * equirect_elev_m[south_cap_mask, :] + s * south_pole_elev_m
        )
    north_cap_mask = lats_1d > 85.05112878
    if np.any(north_cap_mask):
        equirect_elev_m[north_cap_mask, :] = np.minimum(equirect_elev_m[north_cap_mask, :], 0.0)

    continental_m = np.clip(equirect_elev_m, 0.0, GLOBAL_BUMP_MAX_ELEV_M)
    norm_bump = np.power(continental_m / GLOBAL_BUMP_MAX_ELEV_M, GLOBAL_BUMP_GAMMA)
    bump_u8 = np.clip(np.rint(norm_bump * 255.0), 0, 255).astype(np.uint8)

    bump_path = output_dir / "earth_bump.png"
    Image.fromarray(bump_u8, mode="L").save(bump_path, format="PNG", optimize=True)
    global_min_m = float(np.min(equirect_elev_m))
    global_max_m = float(np.max(equirect_elev_m))
    print(
        f"      Saved {bump_path.name} ({GLOBAL_BUMP_WIDTH}x{GLOBAL_BUMP_HEIGHT} L, "
        f"{bump_path.stat().st_size} B, global elev range=[{global_min_m:.1f}, {global_max_m:.1f}] m)"
    )
    return {
        "bump_path": bump_path,
        "global_min_elev_m": round(global_min_m, 2),
        "global_max_elev_m": round(global_max_m, 2),
    }


def build_all(output_dir: Path | None = None) -> Path:
    """Execute full terrain & orthoimagery pipeline and write terrain_manifest.json."""
    target_dir = output_dir or (REPO_ROOT / "website" / "public" / "generated" / "terrain")
    target_dir.mkdir(parents=True, exist_ok=True)

    retrieved_at_utc = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    width_m, height_m = wgs84_bbox_dimensions_m(CA_BBOX)

    dem_info = build_california_dem_and_normals(target_dir)
    sat_info = build_california_satellite(target_dir)
    earth_day_path = build_global_earth_day(target_dir)
    bump_info = build_global_earth_bump(target_dir)

    dem_path: Path = dem_info["dem_path"]
    normals_path: Path = dem_info["normals_path"]
    sat_path: Path = sat_info["sat_path"]
    bump_path: Path = bump_info["bump_path"]

    manifest: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "generatedAtUtc": retrieved_at_utc,
        "region": {
            "id": "northern_california_feather_river_almanor",
            "name": "Northern California Sierra Nevada / Feather River Canyon / Lake Almanor Corridor",
            "crs": "EPSG:4326",
            "bbox": {
                "west": CA_BBOX.west,
                "south": CA_BBOX.south,
                "east": CA_BBOX.east,
                "north": CA_BBOX.north,
            },
            "center": {
                "lon": round(CA_BBOX.center_lon, 6),
                "lat": round(CA_BBOX.center_lat, 6),
            },
            "wgs84DimensionsMeters": {
                "eastWestWidthM": round(width_m, 2),
                "northSouthHeightM": round(height_m, 2),
            },
        },
        "elevationSummary": {
            "gridWidth": CA_DEM_SIZE,
            "gridHeight": CA_DEM_SIZE,
            "dtype": "float32",
            "byteOrder": "little-endian",
            "byteLength": CA_DEM_SIZE * CA_DEM_SIZE * 4,
            "gridOrientation": {
                "row0Lat": CA_BBOX.north,
                "row255Lat": CA_BBOX.south,
                "col0Lon": CA_BBOX.west,
                "col255Lon": CA_BBOX.east,
            },
            "minElevationM": dem_info["min_elev_m"],
            "maxElevationM": dem_info["max_elev_m"],
            "meanElevationM": dem_info["mean_elev_m"],
            "stdElevationM": dem_info["std_elev_m"],
            "horizontalSpacingApproxM": {
                "dxM": round(width_m / (CA_DEM_SIZE - 1), 2),
                "dyM": round(height_m / (CA_DEM_SIZE - 1), 2),
            },
        },
        "dataProvenance": {
            "category": "real_observational_geospatial_terrain_and_imagery",
            "statement": (
                "All five assets in website/public/generated/terrain/ are derived directly "
                "from real downloaded public-domain and open-licensed satellite orthoimagery "
                "and digital elevation datasets (USGS 3DEP via AWS Terrain Tiles, Copernicus "
                "Sentinel-2 via EOX Cloudless, and NASA Visible Earth / GIBS Blue Marble Next "
                "Generation). No fire-activity detections or NASA FIRMS records are claimed "
                "in this terrain package; any fire-spread or thermal-plume layers rendered "
                "elsewhere in Isogon are separately documented as modeled reconstructions "
                "unless backed by an explicit observational manifest."
            ),
        },
        "assets": {
            "ca_dem_f32": {
                "file": dem_path.name,
                "path": f"/generated/terrain/{dem_path.name}",
                "format": "application/octet-stream (Float32Array <f4)",
                "width": CA_DEM_SIZE,
                "height": CA_DEM_SIZE,
                "bytes": dem_path.stat().st_size,
                "sha256": sha256_file(dem_path),
                "projection": "EPSG:4326 (reprojected from EPSG:3857)",
                "sourceZoom": CA_DEM_ZOOM,
                "sourceUrlTemplate": AWS_TERRARIUM_URL,
                "decodingFormula": "elevation_m = (R * 256.0 + G + B / 256.0) - 32768.0",
                "provider": "Mapzen / AWS Open Data Registry Terrain Tiles (USGS 3DEP / SRTM)",
                "license": "Public Domain (USGS 3DEP in US) / Open Data",
                "retrievedAtUtc": retrieved_at_utc,
            },
            "ca_normals": {
                "file": normals_path.name,
                "path": f"/generated/terrain/{normals_path.name}",
                "format": "image/png (RGB 8-bit)",
                "width": CA_NORMALS_SIZE,
                "height": CA_NORMALS_SIZE,
                "bytes": normals_path.stat().st_size,
                "sha256": sha256_file(normals_path),
                "projection": "EPSG:4326",
                "normalEncoding": {
                    "frame": "+X East, +Y North, +Z Up (WGS84 meters)",
                    "decodeShader": "vec3 n = normalize(tex.rgb * 2.0 - 1.0);",
                },
                "sourceZoom": CA_DEM_ZOOM,
                "sourceUrlTemplate": AWS_TERRARIUM_URL,
                "provider": "Derived via central finite differences from AWS Terrain Tiles (USGS 3DEP)",
                "license": "Public Domain (USGS 3DEP in US) / Open Data",
                "retrievedAtUtc": retrieved_at_utc,
            },
            "ca_satellite": {
                "file": sat_path.name,
                "path": f"/generated/terrain/{sat_path.name}",
                "format": "image/jpeg (RGB 4:4:4)",
                "width": CA_SAT_SIZE,
                "height": CA_SAT_SIZE,
                "bytes": sat_path.stat().st_size,
                "sha256": sha256_file(sat_path),
                "projection": "EPSG:4326 (sub-pixel 4x4 supersampled from EPSG:3857)",
                "radiometricGamma": CA_SAT_GAMMA,
                "sourceZoom": CA_SAT_ZOOM,
                "sourceUrlTemplate": EOX_S2_2020_URL,
                "provider": "Sentinel-2 cloudless 2020 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)",
                "license": "CC BY 4.0 (https://s2maps.eu)",
                "retrievedAtUtc": retrieved_at_utc,
            },
            "earth_day": {
                "file": earth_day_path.name,
                "path": f"/generated/terrain/{earth_day_path.name}",
                "format": "image/jpeg (RGB 4:4:4)",
                "width": GLOBAL_DAY_WIDTH,
                "height": GLOBAL_DAY_HEIGHT,
                "bytes": earth_day_path.stat().st_size,
                "sha256": sha256_file(earth_day_path),
                "projection": "EPSG:4326 (lon -180..+180, lat +90..-90)",
                "sourceZoom": GLOBAL_GIBS_ZOOM,
                "sourceUrlTemplate": NASA_GIBS_BLUEMARBLE_URL,
                "provider": "NASA Earth Observatory / NASA GIBS Blue Marble Next Generation (Shaded Relief and Bathymetry, August 2004)",
                "license": "US Government Public Domain (NASA Visible Earth)",
                "retrievedAtUtc": retrieved_at_utc,
            },
            "earth_bump": {
                "file": bump_path.name,
                "path": f"/generated/terrain/{bump_path.name}",
                "format": "image/png (Grayscale 8-bit)",
                "width": GLOBAL_BUMP_WIDTH,
                "height": GLOBAL_BUMP_HEIGHT,
                "bytes": bump_path.stat().st_size,
                "sha256": sha256_file(bump_path),
                "projection": "EPSG:4326 (lon -180..+180, lat +90..-90, reprojected from EPSG:3857)",
                "elevationEncoding": {
                    "seaLevelValue": 0,
                    "maxClampMeters": GLOBAL_BUMP_MAX_ELEV_M,
                    "gamma": GLOBAL_BUMP_GAMMA,
                    "rawGlobalMinM": bump_info["global_min_elev_m"],
                    "rawGlobalMaxM": bump_info["global_max_elev_m"],
                },
                "sourceZoom": GLOBAL_BUMP_ZOOM,
                "sourceUrlTemplate": AWS_TERRARIUM_URL,
                "provider": "Mapzen / AWS Open Data Registry Terrain Tiles (ETOPO1 / SRTM / GMTED2010)",
                "license": "Open Data / Public Domain",
                "retrievedAtUtc": retrieved_at_utc,
            },
        },
    }

    manifest_path = target_dir / "terrain_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"[DONE] Wrote manifest: {manifest_path}")
    return manifest_path


if __name__ == "__main__":
    build_all()
