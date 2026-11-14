"""Geodetic coordinate transforms, Web Mercator reprojection, and DEM surface normals."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

WEB_MERCATOR_MAX_LAT: float = 85.05112877980659
WGS84_A_M: float = 6378137.0
WGS84_E2: float = 0.0066943799901413165


@dataclass(frozen=True)
class BoundingBox:
    """Geographic bounding box in WGS84 degrees (EPSG:4326)."""

    west: float
    south: float
    east: float
    north: float

    def validate(self) -> None:
        if not (-180.0 <= self.west < self.east <= 180.0):
            raise ValueError(f"Invalid longitude bounds: [{self.west}, {self.east}]")
        if not (-90.0 <= self.south < self.north <= 90.0):
            raise ValueError(f"Invalid latitude bounds: [{self.south}, {self.north}]")

    @property
    def center_lat(self) -> float:
        return 0.5 * (self.south + self.north)

    @property
    def center_lon(self) -> float:
        return 0.5 * (self.west + self.east)


@dataclass(frozen=True)
class TileGridBounds:
    """Inclusive Slippy Map XYZ tile index range at zoom z."""

    zoom: int
    tx_min: int
    tx_max: int
    ty_min: int
    ty_max: int

    @property
    def width_tiles(self) -> int:
        return self.tx_max - self.tx_min + 1

    @property
    def height_tiles(self) -> int:
        return self.ty_max - self.ty_min + 1

    @property
    def total_tiles(self) -> int:
        return self.width_tiles * self.height_tiles


def lon_to_mercator_px(
    lon_deg: NDArray[np.floating] | float, zoom: int, tile_size: int = 256
) -> NDArray[np.float64]:
    """Convert WGS84 longitude(s) in degrees to global Web Mercator pixel x."""
    n_px = float(tile_size * (1 << zoom))
    lon_arr = np.asarray(lon_deg, dtype=np.float64)
    return ((lon_arr + 180.0) / 360.0) * n_px


def lat_to_mercator_px(
    lat_deg: NDArray[np.floating] | float, zoom: int, tile_size: int = 256
) -> NDArray[np.float64]:
    """Convert WGS84 latitude(s) in degrees to global Web Mercator pixel y."""
    n_px = float(tile_size * (1 << zoom))
    lat_clamped = np.clip(
        np.asarray(lat_deg, dtype=np.float64),
        -WEB_MERCATOR_MAX_LAT,
        WEB_MERCATOR_MAX_LAT,
    )
    lat_rad = np.deg2rad(lat_clamped)
    return (1.0 - np.arcsinh(np.tan(lat_rad)) / math.pi) * 0.5 * n_px


def tile_bounds_for_bbox(
    bbox: BoundingBox, zoom: int, tile_size: int = 256, margin_px: float = 3.0
) -> TileGridBounds:
    """Compute inclusive XYZ tile bounds covering bbox with sub-pixel interpolation margin."""
    bbox.validate()
    max_index = (1 << zoom) - 1
    gx_min = float(lon_to_mercator_px(bbox.west, zoom, tile_size)) - margin_px
    gx_max = float(lon_to_mercator_px(bbox.east, zoom, tile_size)) + margin_px
    gy_min = float(lat_to_mercator_px(bbox.north, zoom, tile_size)) - margin_px
    gy_max = float(lat_to_mercator_px(bbox.south, zoom, tile_size)) + margin_px

    tx_min = max(0, min(max_index, int(math.floor(gx_min / tile_size))))
    tx_max = max(0, min(max_index, int(math.floor(gx_max / tile_size))))
    ty_min = max(0, min(max_index, int(math.floor(gy_min / tile_size))))
    ty_max = max(0, min(max_index, int(math.floor(gy_max / tile_size))))
    return TileGridBounds(
        zoom=zoom, tx_min=tx_min, tx_max=tx_max, ty_min=ty_min, ty_max=ty_max
    )


def decode_terrarium_rgb(rgb: NDArray[np.uint8]) -> NDArray[np.float64]:
    """Decode Mapzen/AWS Terrarium RGB uint8 array into elevation meters (float64).

    Formula: elevation_m = (R * 256.0 + G + B / 256.0) - 32768.0
    """
    if rgb.ndim != 3 or rgb.shape[2] < 3:
        raise ValueError(f"Expected HxWx3 uint8 array, got shape {rgb.shape}")
    r = rgb[:, :, 0].astype(np.float64)
    g = rgb[:, :, 1].astype(np.float64)
    b = rgb[:, :, 2].astype(np.float64)
    return (r * 256.0 + g + b / 256.0) - 32768.0


def _bilinear_sample_2d(
    grid: NDArray[np.float64],
    row_f: NDArray[np.float64],
    col_f: NDArray[np.float64],
    wrap_x: bool = False,
) -> NDArray[np.float64]:
    """Vectorized 2D bilinear interpolation on a float64 scalar grid."""
    h, w = grid.shape
    r_clamped = np.clip(row_f, 0.0, float(h - 1))
    r0 = np.floor(r_clamped).astype(np.int64)
    r1 = np.minimum(r0 + 1, h - 1)
    dr = r_clamped - r0

    if wrap_x:
        c_wrapped = np.mod(col_f, float(w))
        c0 = np.floor(c_wrapped).astype(np.int64)
        c1 = (c0 + 1) % w
        dc = c_wrapped - c0
    else:
        c_clamped = np.clip(col_f, 0.0, float(w - 1))
        c0 = np.floor(c_clamped).astype(np.int64)
        c1 = np.minimum(c0 + 1, w - 1)
        dc = c_clamped - c0

    v00 = grid[r0, c0]
    v01 = grid[r0, c1]
    v10 = grid[r1, c0]
    v11 = grid[r1, c1]

    top = v00 * (1.0 - dc) + v01 * dc
    bot = v10 * (1.0 - dc) + v11 * dc
    return top * (1.0 - dr) + bot * dr


def _bilinear_sample_rgb(
    img: NDArray[np.uint8],
    row_f: NDArray[np.float64],
    col_f: NDArray[np.float64],
    wrap_x: bool = False,
) -> NDArray[np.float32]:
    """Vectorized 2D bilinear interpolation on an HxWx3 uint8 RGB mosaic."""
    h, w, _ = img.shape
    r_clamped = np.clip(row_f, 0.0, float(h - 1)).astype(np.float32)
    r0 = np.floor(r_clamped).astype(np.int64)
    r1 = np.minimum(r0 + 1, h - 1)
    dr = (r_clamped - r0)[..., np.newaxis]

    if wrap_x:
        c_wrapped = np.mod(col_f, float(w)).astype(np.float32)
        c0 = np.floor(c_wrapped).astype(np.int64)
        c1 = (c0 + 1) % w
        dc = (c_wrapped - c0)[..., np.newaxis]
    else:
        c_clamped = np.clip(col_f, 0.0, float(w - 1)).astype(np.float32)
        c0 = np.floor(c_clamped).astype(np.int64)
        c1 = np.minimum(c0 + 1, w - 1)
        dc = (c_clamped - c0)[..., np.newaxis]

    v00 = img[r0, c0].astype(np.float32)
    v01 = img[r0, c1].astype(np.float32)
    v10 = img[r1, c0].astype(np.float32)
    v11 = img[r1, c1].astype(np.float32)

    top = v00 * (1.0 - dc) + v01 * dc
    bot = v10 * (1.0 - dc) + v11 * dc
    return top * (1.0 - dr) + bot * dr


def reproject_mercator_dem_grid(
    mosaic_elev_m: NDArray[np.float64],
    bounds: TileGridBounds,
    bbox: BoundingBox,
    out_rows: int,
    out_cols: int,
    tile_size: int = 256,
) -> NDArray[np.float64]:
    """Reproject Web Mercator DEM onto exact vertex-aligned equirectangular grid nodes.

    Row 0 corresponds to exact bbox.north, Row (out_rows - 1) to exact bbox.south.
    Col 0 corresponds to exact bbox.west, Col (out_cols - 1) to exact bbox.east.
    Uses a band-limited 3x3 Gaussian anti-aliasing kernel clamped to bbox boundaries
    to prevent high-frequency ridge aliasing when downsampling.
    """
    lats = np.linspace(bbox.north, bbox.south, out_rows, dtype=np.float64)
    lons = np.linspace(bbox.west, bbox.east, out_cols, dtype=np.float64)

    dlon = (bbox.east - bbox.west) / max(1, out_cols - 1)
    dlat = (bbox.north - bbox.south) / max(1, out_rows - 1)

    offsets = (-0.32, 0.0, 0.32)
    weights_1d = (0.25, 0.50, 0.25)

    origin_x = float(bounds.tx_min * tile_size)
    origin_y = float(bounds.ty_min * tile_size)

    accum = np.zeros((out_rows, out_cols), dtype=np.float64)
    for oy, wy in zip(offsets, weights_1d):
        lat_sub = np.clip(lats + oy * dlat, bbox.south, bbox.north)
        row_f_1d = lat_to_mercator_px(lat_sub, bounds.zoom, tile_size) - origin_y - 0.5
        for ox, wx in zip(offsets, weights_1d):
            lon_sub = np.clip(lons + ox * dlon, bbox.west, bbox.east)
            col_f_1d = (
                lon_to_mercator_px(lon_sub, bounds.zoom, tile_size) - origin_x - 0.5
            )
            row_grid, col_grid = np.meshgrid(row_f_1d, col_f_1d, indexing="ij")
            accum += (wy * wx) * _bilinear_sample_2d(
                mosaic_elev_m, row_grid, col_grid, wrap_x=False
            )

    return accum


def reproject_mercator_dem_raster(
    mosaic_elev_m: NDArray[np.float64],
    bounds: TileGridBounds,
    bbox: BoundingBox,
    out_height: int,
    out_width: int,
    supersample: int = 2,
    tile_size: int = 256,
    wrap_x: bool = False,
) -> NDArray[np.float64]:
    """Reproject Web Mercator DEM onto pixel-centered equirectangular raster (for normals/bump)."""
    origin_x = float(bounds.tx_min * tile_size)
    origin_y = float(bounds.ty_min * tile_size)

    lon_span = bbox.east - bbox.west
    lat_span = bbox.north - bbox.south

    accum = np.zeros((out_height, out_width), dtype=np.float64)
    sub_steps = np.arange(supersample, dtype=np.float64) + 0.5
    py = np.arange(out_height, dtype=np.float64)
    px = np.arange(out_width, dtype=np.float64)

    weight = 1.0 / float(supersample * supersample)
    for sy in sub_steps:
        v = (py + sy / supersample) / float(out_height)
        lats = bbox.north - v * lat_span
        row_f_1d = lat_to_mercator_px(lats, bounds.zoom, tile_size) - origin_y - 0.5
        for sx in sub_steps:
            u = (px + sx / supersample) / float(out_width)
            lons = bbox.west + u * lon_span
            col_f_1d = lon_to_mercator_px(lons, bounds.zoom, tile_size) - origin_x - 0.5
            row_grid, col_grid = np.meshgrid(row_f_1d, col_f_1d, indexing="ij")
            accum += weight * _bilinear_sample_2d(
                mosaic_elev_m, row_grid, col_grid, wrap_x=wrap_x
            )

    return accum


def reproject_mercator_rgb_raster(
    mosaic_rgb: NDArray[np.uint8],
    bounds: TileGridBounds,
    bbox: BoundingBox,
    out_height: int,
    out_width: int,
    supersample: int = 4,
    tile_size: int = 256,
    wrap_x: bool = False,
) -> NDArray[np.uint8]:
    """Reproject Web Mercator RGB orthoimagery onto pixel-centered equirectangular raster.

    Uses stratified supersample x supersample area quadrature in EPSG:3857 pixel space so
    that WebGL UV coordinates align 1:1 to the sub-pixel with ca_dem_f32.bin.
    """
    origin_x = float(bounds.tx_min * tile_size)
    origin_y = float(bounds.ty_min * tile_size)

    lon_span = bbox.east - bbox.west
    lat_span = bbox.north - bbox.south

    accum = np.zeros((out_height, out_width, 3), dtype=np.float32)
    sub_steps = np.arange(supersample, dtype=np.float64) + 0.5
    py = np.arange(out_height, dtype=np.float64)
    px = np.arange(out_width, dtype=np.float64)

    weight = np.float32(1.0 / float(supersample * supersample))
    for sy in sub_steps:
        v = (py + sy / supersample) / float(out_height)
        lats = bbox.north - v * lat_span
        row_f_1d = lat_to_mercator_px(lats, bounds.zoom, tile_size) - origin_y - 0.5
        for sx in sub_steps:
            u = (px + sx / supersample) / float(out_width)
            lons = bbox.west + u * lon_span
            col_f_1d = lon_to_mercator_px(lons, bounds.zoom, tile_size) - origin_x - 0.5
            row_grid, col_grid = np.meshgrid(row_f_1d, col_f_1d, indexing="ij")
            accum += weight * _bilinear_sample_rgb(
                mosaic_rgb, row_grid, col_grid, wrap_x=wrap_x
            )

    return np.clip(np.rint(accum), 0, 255).astype(np.uint8)


def wgs84_meters_per_degree(lat_deg: NDArray[np.floating] | float) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Return (meters_per_deg_lon, meters_per_deg_lat) on the WGS84 ellipsoid."""
    lat_rad = np.deg2rad(np.asarray(lat_deg, dtype=np.float64))
    sin_lat = np.sin(lat_rad)
    cos_lat = np.cos(lat_rad)
    denom = np.sqrt(1.0 - WGS84_E2 * sin_lat * sin_lat)

    # Prime vertical radius of curvature N and meridional radius M
    n_rad = WGS84_A_M / denom
    m_rad = WGS84_A_M * (1.0 - WGS84_E2) / (denom * denom * denom)

    deg_to_rad = math.pi / 180.0
    m_per_deg_lon = n_rad * cos_lat * deg_to_rad
    m_per_deg_lat = m_rad * deg_to_rad
    return m_per_deg_lon, m_per_deg_lat


def wgs84_bbox_dimensions_m(bbox: BoundingBox) -> tuple[float, float]:
    """Return (east_west_width_m, north_south_height_m) at bbox center latitude."""
    m_lon, m_lat = wgs84_meters_per_degree(bbox.center_lat)
    width_m = float(m_lon) * (bbox.east - bbox.west)
    height_m = float(m_lat) * (bbox.north - bbox.south)
    return width_m, height_m


def compute_surface_normals_rgb(
    elev_m: NDArray[np.float64], bbox: BoundingBox
) -> NDArray[np.uint8]:
    """Compute physical WGS84 finite-difference surface normals (nx, ny, nz) encoded as RGB 0..255.

    Coordinate frame:
      +x = East (increasing column index)
      +y = North (decreasing row index)
      +z = Up (elevation in meters)
    Encoding:
      R = round((nx * 0.5 + 0.5) * 255)
      G = round((ny * 0.5 + 0.5) * 255)
      B = round((nz * 0.5 + 0.5) * 255)
    """
    rows, cols = elev_m.shape
    v = (np.arange(rows, dtype=np.float64) + 0.5) / float(rows)
    lats = bbox.north - v * (bbox.north - bbox.south)

    m_per_deg_lon, m_per_deg_lat = wgs84_meters_per_degree(lats)
    dlon_deg = (bbox.east - bbox.west) / float(cols)
    dlat_deg = (bbox.north - bbox.south) / float(rows)

    dx_m = (m_per_deg_lon * dlon_deg)[:, np.newaxis]
    dy_m = (m_per_deg_lat * dlat_deg)[:, np.newaxis]

    # Central finite differences in interior, one-sided second-order-clean differences at edges
    dh_dcol = np.empty_like(elev_m, dtype=np.float64)
    dh_dcol[:, 1:-1] = (elev_m[:, 2:] - elev_m[:, :-2]) * 0.5
    dh_dcol[:, 0] = elev_m[:, 1] - elev_m[:, 0]
    dh_dcol[:, -1] = elev_m[:, -1] - elev_m[:, -2]

    dh_drow = np.empty_like(elev_m, dtype=np.float64)
    dh_drow[1:-1, :] = (elev_m[2:, :] - elev_m[:-2, :]) * 0.5
    dh_drow[0, :] = elev_m[1, :] - elev_m[0, :]
    dh_drow[-1, :] = elev_m[-1, :] - elev_m[-2, :]

    # +x is East (+col), +y is North (-row)
    dh_dx = dh_dcol / dx_m
    dh_dy = -dh_drow / dy_m

    nx = -dh_dx
    ny = -dh_dy
    nz = np.ones_like(elev_m, dtype=np.float64)

    inv_norm = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    nx *= inv_norm
    ny *= inv_norm
    nz *= inv_norm

    rgb = np.stack([nx, ny, nz], axis=-1)
    encoded = np.clip(np.rint((rgb * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    return encoded
