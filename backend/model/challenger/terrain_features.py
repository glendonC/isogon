"""Offline terrain elevation, slope, and gradient features on an evaluation grid.

Reads cached Mapzen Terrarium tiles from disk with network access disabled.
When any tile for a bounding box is absent from the local cache, returns flat
zeros so synthetic fixtures and uncached places run with no network call.
"""

from __future__ import annotations

from dataclasses import dataclass
import numpy as np
from numpy.typing import NDArray

from backend.eval.grid import EvalGrid
from backend.terrain.projections import (
    BoundingBox,
    _bilinear_sample_2d,
    decode_terrarium_rgb,
    lat_to_mercator_px,
    lon_to_mercator_px,
    tile_bounds_for_bbox,
)
from backend.terrain.tile_store import TERRARIUM, TILE_SIZE, TileStore, decode_rgb


@dataclass(frozen=True)
class GridTerrain:
    """Terrain fields aligned to an EvalGrid (row 0 north, col 0 west)."""

    elev_m: NDArray[np.float64]       # (ny, nx) elevation in meters
    grad_east: NDArray[np.float64]    # (ny, nx) d(elev_m) / dx_east_km (m per km)
    grad_north: NDArray[np.float64]   # (ny, nx) d(elev_m) / dy_north_km (m per km)
    slope_m_per_km: NDArray[np.float64]
    available: bool


_TERRAIN_CACHE: dict[tuple[float, float, float, float, int, int], GridTerrain] = {}


def load_grid_terrain(grid: EvalGrid, zoom: int = 11) -> GridTerrain:
    """Load cached DEM terrain on grid, or flat zeros when tiles are not cached."""
    key = (round(grid.west, 6), round(grid.south, 6), round(grid.east, 6), round(grid.north, 6), grid.ny, grid.nx)
    if key in _TERRAIN_CACHE:
        return _TERRAIN_CACHE[key]

    shape = grid.shape
    zeros = np.zeros(shape, dtype=np.float64)
    try:
        bbox = BoundingBox(grid.west, grid.south, grid.east, grid.north)
        bounds = tile_bounds_for_bbox(bbox, zoom=zoom, tile_size=TILE_SIZE, margin_px=2.0)
        if bounds.total_tiles > 64:
            out = GridTerrain(zeros, zeros, zeros.copy(), zeros.copy(), False)
            _TERRAIN_CACHE[key] = out
            return out
        store = TileStore(allow_network=False)
        for ty in range(bounds.ty_min, bounds.ty_max + 1):
            for tx in range(bounds.tx_min, bounds.tx_max + 1):
                p = store.tile_path(TERRARIUM, zoom, tx, ty)
                if not (p.is_file() and p.stat().st_size > 64):
                    out = GridTerrain(zeros, zeros.copy(), zeros.copy(), zeros.copy(), False)
                    _TERRAIN_CACHE[key] = out
                    return out
        mosaic = np.zeros((bounds.height_tiles * TILE_SIZE, bounds.width_tiles * TILE_SIZE, 3), dtype=np.uint8)
        for dy, ty in enumerate(range(bounds.ty_min, bounds.ty_max + 1)):
            for dx, tx in enumerate(range(bounds.tx_min, bounds.tx_max + 1)):
                rgb = decode_rgb(store.tile_path(TERRARIUM, zoom, tx, ty).read_bytes())
                mosaic[dy * TILE_SIZE : (dy + 1) * TILE_SIZE, dx * TILE_SIZE : (dx + 1) * TILE_SIZE] = rgb
        elev_mosaic = decode_terrarium_rgb(mosaic)
        lon2d, lat2d = grid.cell_lonlat()
        col_f = lon_to_mercator_px(lon2d, zoom, TILE_SIZE) - bounds.tx_min * TILE_SIZE - 0.5
        row_f = lat_to_mercator_px(lat2d, zoom, TILE_SIZE) - bounds.ty_min * TILE_SIZE - 0.5
        elev = _bilinear_sample_2d(elev_mosaic, row_f, col_f)
        # Rows run north to south: dy_north is minus gradient along axis 0
        d_row, d_col = np.gradient(elev, grid.cell_km)
        grad_east = d_col.astype(np.float64)
        grad_north = (-d_row).astype(np.float64)
        slope = np.hypot(grad_east, grad_north)
        out = GridTerrain(elev.astype(np.float64), grad_east, grad_north, slope, True)
    except Exception:
        out = GridTerrain(zeros, zeros.copy(), zeros.copy(), zeros.copy(), False)

    _TERRAIN_CACHE[key] = out
    return out
