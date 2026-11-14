"""A 375 m evaluation grid over a box, and pixel footprints painted onto it.

The grid is a local plane: x east and y north in km from the box's south-west corner, with one east-west scale taken
at the box's mid latitude (the engine's own convention, 111.132 km per degree). Row 0 is the northern row, column 0
the western column, like every raster in the project. Cells are `cell_km` on a side, 0.375 km by default: the VIIRS
I-band pixel at nadir, and the resolution the reconstruction claims.
"""

from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np
from numpy.typing import NDArray

from backend.eval.rows import Detections
from backend.model.grid import DEG_TO_KM_LAT
from backend.model.platforms import PLATFORMS, scan_axis_deg

CELL_KM: float = 0.375


@dataclass(frozen=True)
class EvalGrid:
    west: float
    south: float
    east: float
    north: float
    cell_km: float
    nx: int
    ny: int
    km_per_deg_lon: float
    km_per_deg_lat: float

    @classmethod
    def from_bbox(cls, bbox: tuple[float, float, float, float], cell_km: float = CELL_KM) -> EvalGrid:
        w, s, e, n = (float(v) for v in bbox)
        if not (e > w and n > s):
            raise ValueError(f"empty box {bbox}")
        kx = DEG_TO_KM_LAT * math.cos(math.radians(0.5 * (s + n)))
        ky = DEG_TO_KM_LAT
        nx = max(1, int(math.ceil((e - w) * kx / cell_km - 1e-9)))
        ny = max(1, int(math.ceil((n - s) * ky / cell_km - 1e-9)))
        return cls(w, s, e, n, float(cell_km), nx, ny, kx, ky)

    @property
    def shape(self) -> tuple[int, int]:
        return (self.ny, self.nx)

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        return (self.west, self.south, self.east, self.north)

    @property
    def cell_area_km2(self) -> float:
        return self.cell_km * self.cell_km

    def xy_km(self, lon: NDArray[np.float64] | float, lat: NDArray[np.float64] | float) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        """x east and y north in km from the south-west corner."""
        x = (np.asarray(lon, dtype=np.float64) - self.west) * self.km_per_deg_lon
        y = (np.asarray(lat, dtype=np.float64) - self.south) * self.km_per_deg_lat
        return x, y

    def cell_centres_km(self) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        """(x of each column centre, y of each row centre); rows run north to south."""
        xc = (np.arange(self.nx) + 0.5) * self.cell_km
        yc = (self.ny - np.arange(self.ny) - 0.5) * self.cell_km
        return xc, yc

    def cell_lonlat(self) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        """(lon, lat) of every cell centre as (ny, nx) arrays."""
        xc, yc = self.cell_centres_km()
        lon = self.west + xc / self.km_per_deg_lon
        lat = self.south + yc / self.km_per_deg_lat
        return np.meshgrid(lon, lat)

    def row_col(self, lon: NDArray[np.float64] | float, lat: NDArray[np.float64] | float) -> tuple[NDArray[np.int64], NDArray[np.int64]]:
        """Row and column of the cell holding each point; -1 for a point outside the grid."""
        x, y = self.xy_km(lon, lat)
        col = np.floor(x / self.cell_km).astype(np.int64)
        row = (self.ny - 1 - np.floor(y / self.cell_km)).astype(np.int64)
        bad = (col < 0) | (col >= self.nx) | (row < 0) | (row >= self.ny)
        return np.where(bad, -1, row), np.where(bad, -1, col)


@dataclass(frozen=True)
class Painted:
    """Footprints painted on a grid."""

    mask: NDArray[np.bool_]          # (ny, nx) cells whose centre lies inside at least one footprint
    frp_mw: NDArray[np.float64]      # (ny, nx) FRP per cell: each pixel's FRP shared equally among its cells
    frp_total_mw: float              # sum of the FRP of every pixel painted (equals frp_mw.sum())
    n_pixels: int                    # pixels painted (centre inside the grid)
    n_outside: int                   # pixels skipped because their centre lies outside the grid


def footprint_cells(
    grid: EvalGrid, lon: float, lat: float, scan_km: float, track_km: float, axis_deg: float
) -> tuple[NDArray[np.int64], NDArray[np.int64]]:
    """Rows and columns of the cells a pixel covers.

    The pixel is a rectangle `scan_km` long on the scan axis (azimuth `axis_deg`, clockwise from north) and
    `track_km` across it, centred on (lon, lat). A cell is covered when its centre lies inside the rectangle; the
    cell holding the pixel centre is always covered. A pixel centred outside the grid covers nothing.
    """
    r0, c0 = grid.row_col(lon, lat)
    r0, c0 = int(r0), int(c0)
    if r0 < 0:
        return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64)
    x0, y0 = grid.xy_km(lon, lat)
    x0, y0 = float(x0), float(y0)
    half_diag = 0.5 * math.hypot(scan_km, track_km)
    reach = int(math.ceil(half_diag / grid.cell_km)) + 1
    r_lo, r_hi = max(0, r0 - reach), min(grid.ny - 1, r0 + reach)
    c_lo, c_hi = max(0, c0 - reach), min(grid.nx - 1, c0 + reach)
    rr, cc = np.meshgrid(np.arange(r_lo, r_hi + 1), np.arange(c_lo, c_hi + 1), indexing="ij")
    dx = (cc + 0.5) * grid.cell_km - x0
    dy = (grid.ny - rr - 0.5) * grid.cell_km - y0
    a = math.radians(axis_deg)
    u = dx * math.sin(a) + dy * math.cos(a)        # along scan
    v = dx * math.cos(a) - dy * math.sin(a)        # along track
    inside = (np.abs(u) <= 0.5 * scan_km + 1e-9) & (np.abs(v) <= 0.5 * track_km + 1e-9)
    inside |= (rr == r0) & (cc == c0)
    return rr[inside].astype(np.int64), cc[inside].astype(np.int64)


def paint(grid: EvalGrid, det: Detections) -> Painted:
    """Paint every detection's real footprint (its `scan` and `track`) onto the grid.

    The scan axis comes from the platform's ground track heading at the pixel's latitude
    (`backend.model.platforms.scan_axis_deg`); FIRMS does not give it.
    """
    mask = np.zeros(grid.shape, dtype=bool)
    frp = np.zeros(grid.shape, dtype=np.float64)
    total = 0.0
    n_in = 0
    n_out = 0
    for i in range(len(det)):
        name = PLATFORMS[int(det.platform_code[i])]
        axis = scan_axis_deg(name, bool(det.is_day[i]), float(det.lat[i]))
        rows, cols = footprint_cells(
            grid, float(det.lon[i]), float(det.lat[i]), float(det.scan_km[i]), float(det.track_km[i]), axis
        )
        if rows.size == 0:
            n_out += 1
            continue
        n_in += 1
        mask[rows, cols] = True
        share = float(det.frp_mw[i]) / rows.size
        np.add.at(frp, (rows, cols), share)
        total += float(det.frp_mw[i])
    return Painted(mask=mask, frp_mw=frp, frp_total_mw=total, n_pixels=n_in, n_outside=n_out)


def dilate(mask: NDArray[np.bool_], cells: int) -> NDArray[np.bool_]:
    """Cells within `cells` grid steps (Chebyshev distance) of a True cell."""
    if cells <= 0:
        return mask.copy()
    out = mask.copy()
    ny, nx = mask.shape
    for dr in range(-cells, cells + 1):
        for dc in range(-cells, cells + 1):
            if dr == 0 and dc == 0:
                continue
            src = mask[max(0, -dr) : ny - max(0, dr), max(0, -dc) : nx - max(0, dc)]
            out[max(0, dr) : ny - max(0, -dr), max(0, dc) : nx - max(0, -dc)] |= src
    return out
