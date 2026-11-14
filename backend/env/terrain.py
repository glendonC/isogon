"""Elevation on an episode's 375 m grid, read from the region's context terrain DEM.

The context DEM covers the region's context box with 1024 by 1024 samples, row 0 north and column 0 west, like every
raster of the project. When the file is not in the cache the answer is None and the terrain feature stays zero.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from backend.eval.grid import EvalGrid

CACHE_DIR: Path = Path(__file__).resolve().parents[2] / "data" / "cache" / "hires_regions"
CONTEXT_SIZE: int = 1024


def context_elevation(region_id: str, context_box: tuple[float, float, float, float], grid: EvalGrid,
                      cache_dir: Path = CACHE_DIR) -> NDArray[np.float64] | None:
    """Elevation in metres at every cell centre of `grid` (nearest sample), or None when no context DEM is cached."""
    files = sorted(cache_dir.glob(f"{region_id}_*_context_dem_{CONTEXT_SIZE}_f32.bin")) if cache_dir.is_dir() else []
    if not files:
        return None
    dem = np.fromfile(files[0], dtype="<f4")
    if dem.size != CONTEXT_SIZE * CONTEXT_SIZE:
        return None
    dem = dem.reshape(CONTEXT_SIZE, CONTEXT_SIZE)
    w, s, e, n = context_box
    lon, lat = grid.cell_lonlat()
    col = np.clip(np.rint((lon - w) / (e - w) * (CONTEXT_SIZE - 1)).astype(np.int64), 0, CONTEXT_SIZE - 1)
    row = np.clip(np.rint((n - lat) / (n - s) * (CONTEXT_SIZE - 1)).astype(np.int64), 0, CONTEXT_SIZE - 1)
    return dem[row, col].astype(np.float64)
