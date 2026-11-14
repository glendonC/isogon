"""Northern California 256 x 256 coordinate grid and terrain covariates.

Exact bounding box aligned with the terrain pipeline:
    west  = -121.60
    south =   39.75
    east  = -120.75
    north =   40.35
    H = 256 rows (row 0 = north 40.35 down to row 255 = south 39.75)
    W = 256 cols (col 0 = west -121.60 across to col 255 = east -120.75)

When `website/public/generated/terrain/ca_dem_f32.bin` exists on disk, this
module loads the real downloaded elevation raster (`dtype='<f4'`, `256 x 256`
meters) and records `"real_downloaded_dem_ca_dem_f32"` in terrain provenance.
Otherwise, it synthesizes a deterministic analytical elevation surface matching
the Feather River Canyon, Lake Almanor, Plumas National Forest, and Sacramento
Valley foothill transition so `reconstruct.py` can run standalone and cleanly
re-run whenever `ca_dem_f32.bin` becomes available.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import numpy as np
from numpy.typing import NDArray

WEST: float = -121.60
SOUTH: float = 39.75
EAST: float = -120.75
NORTH: float = 40.35
GRID_H: int = 256
GRID_W: int = 256

EARTH_RADIUS_KM: float = 6378.137
DEG_TO_KM_LAT: float = 111.132

DEFAULT_DEM_REL_PATH = Path("website/public/generated/terrain/ca_dem_f32.bin")


@dataclass(frozen=True)
class TerrainGrid:
    """Aligned 256 x 256 geospatial support and topographic covariates."""

    lons_1d: NDArray[np.float64]        # (W,) west -> east
    lats_1d: NDArray[np.float64]        # (H,) north -> south
    lon_2d: NDArray[np.float64]         # (H, W)
    lat_2d: NDArray[np.float64]         # (H, W)
    x_km_2d: NDArray[np.float64]        # (H, W) easting km from west edge
    y_km_2d: NDArray[np.float64]        # (H, W) northing km from south edge
    dx_km: float                        # mean east-west spacing in km (~0.284 km)
    dy_km: float                        # north-south spacing in km (~0.261 km)
    cell_area_km2: NDArray[np.float64]  # (H, W) cos(lat)-corrected cell area
    elevation_m: NDArray[np.float32]    # (H, W) elevation in meters
    dz_dx: NDArray[np.float64]          # (H, W) east-west slope tangent (m / m)
    dz_dy: NDArray[np.float64]          # (H, W) south-north slope tangent (m / m)
    slope_deg: NDArray[np.float64]      # (H, W) terrain slope angle in degrees
    aspect_deg: NDArray[np.float64]     # (H, W) downslope aspect clockwise from N
    ridge_tpi: NDArray[np.float64]      # (H, W) normalized topographic position [-1, 1]
    canyon_depth: NDArray[np.float64]   # (H, W) local incision depth [0, 1]
    terrain_source: str                 # provenance identifier for DEM source
    dem_path_used: str | None


def _fft_gaussian_smooth(field: NDArray[np.float64], sigma_px: float) -> NDArray[np.float64]:
    """Smooth a 2D array via reflect-padded FFT Gaussian kernel (SciPy-free)."""
    if sigma_px <= 0.05:
        return field.copy()
    pad = int(min(64, max(8, np.ceil(3.5 * sigma_px))))
    padded = np.pad(field, pad_width=pad, mode="reflect")
    ph, pw = padded.shape
    fy = np.fft.fftfreq(ph)[:, None]
    fx = np.fft.rfftfreq(pw)[None, :]
    kernel_hat = np.exp(-2.0 * (np.pi * sigma_px) ** 2 * (fx * fx + fy * fy))
    smoothed = np.fft.irfft2(np.fft.rfft2(padded) * kernel_hat, s=(ph, pw))
    return smoothed[pad : pad + field.shape[0], pad : pad + field.shape[1]]


def synthesize_norcal_dem(lon_2d: NDArray[np.float64], lat_2d: NDArray[np.float64]) -> NDArray[np.float32]:
    """Deterministic analytical Northern California DEM fallback (meters).

    Captures the key physiographic structures of [-121.60, 39.75, -120.75, 40.35]:
    - Western Sacramento Valley / Chico-Paradise volcanic foothill ramp (85-700 m)
    - Deep incised North Fork Feather River Canyon (Pulga -> Tobin -> Belden -> Almanor)
    - Middle Fork Feather River gorge in the SE quadrant
    - Lake Almanor structural basin (~1,370 m) in the north-central sector
    - Plumas / Bucks Wilderness / Dyer Mountain / Diamond Mountain crests (1,750-2,240 m)
    """
    u = (lon_2d - WEST) / (EAST - WEST)    # 0 west -> 1 east
    v = (lat_2d - SOUTH) / (NORTH - SOUTH)  # 0 south -> 1 north

    # Broad Sierra-Cascade westward-sloping orographic ramp
    ramp = 95.0 + 1880.0 * (1.0 / (1.0 + np.exp(-6.2 * (u - 0.30))))
    ramp += 210.0 * np.sin(1.4 * np.pi * v) * (0.35 + 0.65 * u)

    # Multi-scale harmonic ridge-and-spur structure (deterministic phase hierarchy)
    ridges = (
        165.0 * np.sin(5.2 * np.pi * u + 2.6 * np.pi * v + 0.4)
        + 115.0 * np.cos(7.8 * np.pi * u - 4.4 * np.pi * v + 1.1)
        + 68.0 * np.sin(13.5 * np.pi * u + 9.1 * np.pi * v - 0.7)
        + 36.0 * np.cos(23.0 * np.pi * u - 17.5 * np.pi * v + 2.0)
    )
    # Suppress ruggedness on the flat Sacramento Valley floor (u < 0.16, v < 0.45)
    foothill_mask = np.clip((u - 0.08) / 0.22, 0.05, 1.0)
    elev = ramp + foothill_mask * ridges

    # North Fork Feather River Canyon axis: SW (-121.48, 39.77) -> NE (-121.14, 40.17)
    # Parameterize curve lat_c(lon) or closest distance to canyon centerline
    t_nf = np.clip(((u - 0.14) * 0.62 + (v - 0.04) * 0.78) / 0.85, 0.0, 1.0)
    c_u = 0.14 + 0.44 * t_nf + 0.035 * np.sin(3.3 * np.pi * t_nf)
    c_v = 0.04 + 0.68 * t_nf - 0.025 * np.sin(2.7 * np.pi * t_nf)
    dist_nf_km = np.hypot((u - c_u) * 72.5, (v - c_v) * 66.7)
    nf_incision = (780.0 - 210.0 * t_nf) * np.exp(-((dist_nf_km / 3.1) ** 1.65))
    # East Branch North Fork tributary extending toward Quincy / Indian Valley
    t_eb = np.clip(((u - 0.45) * 0.78 + (v - 0.50) * 0.42) / 0.52, 0.0, 1.0)
    eb_u = 0.45 + 0.46 * t_eb
    eb_v = 0.50 + 0.18 * t_eb + 0.02 * np.cos(4.0 * np.pi * t_eb)
    dist_eb_km = np.hypot((u - eb_u) * 72.5, (v - eb_v) * 66.7)
    eb_incision = 540.0 * np.exp(-((dist_eb_km / 2.8) ** 1.7))

    # Middle Fork Feather River Canyon in SE quadrant: (-121.35, 39.75) -> (-120.82, 39.92)
    t_mf = np.clip(((u - 0.28) * 0.85 + (v - 0.01) * 0.35) / 0.65, 0.0, 1.0)
    mf_u = 0.28 + 0.64 * t_mf
    mf_v = 0.01 + 0.28 * t_mf + 0.03 * np.sin(3.5 * np.pi * t_mf)
    dist_mf_km = np.hypot((u - mf_u) * 72.5, (v - mf_v) * 66.7)
    mf_incision = 620.0 * np.exp(-((dist_mf_km / 2.7) ** 1.7))

    elev = elev - nf_incision - 0.82 * eb_incision - mf_incision

    # Lake Almanor structural basin around (-121.17, 40.23) -> flat floor ~ 1,372 m
    alm_dx = (lon_2d - (-121.17)) * 85.0
    alm_dy = (lat_2d - 40.23) * 111.1
    alm_r = np.hypot(alm_dx / 7.5, alm_dy / 9.2)
    alm_weight = np.exp(-(alm_r ** 3.2))
    elev = (1.0 - alm_weight) * elev + alm_weight * 1372.0

    # Bucks Lake / Butt Mountain / Dyer Mountain high plutonic domes
    bucks_w = np.exp(-(((lon_2d - (-121.18)) / 0.10) ** 2 + ((lat_2d - 39.89) / 0.08) ** 2))
    dyer_w = np.exp(-(((lon_2d - (-121.03)) / 0.09) ** 2 + ((lat_2d - 40.25) / 0.07) ** 2))
    elev = elev + 310.0 * bucks_w + 360.0 * dyer_w

    elev = np.clip(elev, 65.0, 2480.0)
    return elev.astype(np.float32)


def build_terrain_grid(
    repo_root: Path | None = None,
    dem_path: Path | None = None,
) -> TerrainGrid:
    """Load real `ca_dem_f32.bin` if available, else synthesize analytical NorCal DEM."""
    if repo_root is None:
        repo_root = Path(__file__).resolve().parents[2]
    resolved_dem = dem_path if dem_path is not None else (repo_root / DEFAULT_DEM_REL_PATH)

    lons_1d = np.linspace(WEST, EAST, GRID_W, dtype=np.float64)
    lats_1d = np.linspace(NORTH, SOUTH, GRID_H, dtype=np.float64)
    lon_2d, lat_2d = np.meshgrid(lons_1d, lats_1d)

    mid_lat_rad = np.deg2rad(0.5 * (NORTH + SOUTH))
    dlon_deg = (EAST - WEST) / (GRID_W - 1)
    dlat_deg = (NORTH - SOUTH) / (GRID_H - 1)
    dx_km = dlon_deg * DEG_TO_KM_LAT * float(np.cos(mid_lat_rad))
    dy_km = dlat_deg * DEG_TO_KM_LAT

    x_km_2d = (lon_2d - WEST) * DEG_TO_KM_LAT * np.cos(np.deg2rad(lat_2d))
    y_km_2d = (lat_2d - SOUTH) * DEG_TO_KM_LAT

    # Spherical cosine-latitude exact pixel area
    cell_dx_km = dlon_deg * DEG_TO_KM_LAT * np.cos(np.deg2rad(lat_2d))
    cell_area_km2 = cell_dx_km * dy_km

    expected_bytes = GRID_H * GRID_W * 4
    if resolved_dem.is_file() and resolved_dem.stat().st_size == expected_bytes:
        raw = np.fromfile(resolved_dem, dtype="<f4").reshape(GRID_H, GRID_W)
        # Sanitize any void or nodata sentinels while preserving real terrain
        valid_mask = np.isfinite(raw) & (raw > -200.0) & (raw < 6000.0)
        if np.all(valid_mask):
            elevation_m = raw.astype(np.float32)
        else:
            fallback = synthesize_norcal_dem(lon_2d, lat_2d)
            elevation_m = np.where(valid_mask, raw, fallback).astype(np.float32)
        terrain_source = "real_downloaded_dem_ca_dem_f32"
        dem_path_used: str | None = str(resolved_dem)
    else:
        elevation_m = synthesize_norcal_dem(lon_2d, lat_2d)
        terrain_source = "analytical_feather_river_fallback"
        dem_path_used = None

    elev_f64 = elevation_m.astype(np.float64)
    dx_m = dx_km * 1000.0
    dy_m = dy_km * 1000.0

    # Note row 0 = NORTH, row 255 = SOUTH, so +y (northward) is -row_axis
    dz_drow, dz_dcol = np.gradient(elev_f64, dy_m, dx_m)
    dz_dx = dz_dcol
    dz_dy = -dz_drow

    grad_mag = np.hypot(dz_dx, dz_dy)
    slope_deg = np.rad2deg(np.arctan(grad_mag))
    # Downslope direction clockwise from North: (-dz_dx, -dz_dy)
    aspect_deg = (np.rad2deg(np.arctan2(-dz_dx, -dz_dy)) + 360.0) % 360.0

    # Multi-scale Topographic Position Index (TPI) for ridge exposure & canyon sheltering
    broad_mean = _fft_gaussian_smooth(elev_f64, sigma_px=14.0)
    meso_mean = _fft_gaussian_smooth(elev_f64, sigma_px=5.0)
    tpi_raw = 0.65 * (elev_f64 - broad_mean) + 0.35 * (elev_f64 - meso_mean)
    ridge_tpi = np.tanh(tpi_raw / 220.0)
    canyon_depth = np.clip(-tpi_raw / 320.0, 0.0, 1.0)

    return TerrainGrid(
        lons_1d=lons_1d,
        lats_1d=lats_1d,
        lon_2d=lon_2d,
        lat_2d=lat_2d,
        x_km_2d=x_km_2d,
        y_km_2d=y_km_2d,
        dx_km=dx_km,
        dy_km=dy_km,
        cell_area_km2=cell_area_km2,
        elevation_m=elevation_m,
        dz_dx=dz_dx,
        dz_dy=dz_dy,
        slope_deg=slope_deg,
        aspect_deg=aspect_deg,
        ridge_tpi=ridge_tpi,
        canyon_depth=canyon_depth,
        terrain_source=terrain_source,
        dem_path_used=dem_path_used,
    )


def compute_terrain_line_of_sight(
    grid: TerrainGrid,
    azimuth_deg: float,
    view_zenith_deg: float,
) -> NDArray[np.float64]:
    """Compute directional terrain visibility [0, 1] for a satellite sightline.

    At oblique viewing zenith angles (`view_zenith_deg > 25 deg`), steep canyon
    walls tilted away from the satellite experience foreshortening, canopy
    self-shadowing, and geometric ridge-crest occlusion (scan-shadow zones).

    Args:
        grid: Aligned 256 x 256 Northern California TerrainGrid.
        azimuth_deg: Azimuth from surface target toward satellite (deg CW from N).
        view_zenith_deg: Viewing zenith angle at the surface target (0 = nadir).

    Returns:
        (256, 256) visibility weight in [0.06, 1.0], where low values identify
        steep terrain scan-shadow pockets.
    """
    if view_zenith_deg <= 2.0:
        return np.ones((GRID_H, GRID_W), dtype=np.float64)

    az_rad = np.deg2rad(azimuth_deg)
    vza_rad = np.deg2rad(min(view_zenith_deg, 74.0))

    # Unit horizontal vector pointing toward the sub-satellite direction
    look_x = float(np.sin(az_rad))
    look_y = float(np.cos(az_rad))

    # Surface normal n = (-dz_dx, -dz_dy, 1) / sqrt(1 + dz_dx^2 + dz_dy^2)
    # Sightline unit vector s = (sin(vza)*look_x, sin(vza)*look_y, cos(vza))
    sin_vza = float(np.sin(vza_rad))
    cos_vza = float(np.cos(vza_rad))
    norm_denom = np.sqrt(1.0 + grid.dz_dx ** 2 + grid.dz_dy ** 2)
    cos_incidence = (
        -grid.dz_dx * sin_vza * look_x
        - grid.dz_dy * sin_vza * look_y
        + cos_vza
    ) / norm_denom

    # Ray-marching horizon check over 1 to 6 pixels (~0.3 to 1.7 km canyon rims)
    grazing_tan = cos_vza / max(sin_vza, 1e-3)
    step_m = 0.5 * (grid.dx_km + grid.dy_km) * 1000.0
    # Convert look vector to fractional (row, col) increments: +x = +col, +y = -row
    dcol = look_x
    drow = -look_y

    elev = grid.elevation_m.astype(np.float64)
    rr, cc = np.meshgrid(
        np.arange(GRID_H, dtype=np.float64),
        np.arange(GRID_W, dtype=np.float64),
        indexing="ij",
    )

    max_excess_m = np.zeros_like(elev)
    for step in (1.5, 3.0, 5.0, 7.5):
        sr = np.clip(np.rint(rr + step * drow).astype(np.int32), 0, GRID_H - 1)
        sc = np.clip(np.rint(cc + step * dcol).astype(np.int32), 0, GRID_W - 1)
        ray_height = elev + (step * step_m) * grazing_tan
        excess = elev[sr, sc] - ray_height
        max_excess_m = np.maximum(max_excess_m, excess)

    horizon_trans = np.exp(-np.clip(max_excess_m, 0.0, 400.0) / 55.0)
    slope_self_vis = np.clip((cos_incidence - 0.08) / 0.58, 0.08, 1.0)
    canyon_oblique_penalty = 1.0 - 0.38 * grid.canyon_depth * (sin_vza ** 2)

    visibility = np.clip(horizon_trans * slope_self_vis * canyon_oblique_penalty, 0.06, 1.0)
    return visibility
