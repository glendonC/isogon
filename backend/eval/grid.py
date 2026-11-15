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
_EMPTY_I64: NDArray[np.int64] = np.empty(0, dtype=np.int64)


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
    x0 = (float(lon) - grid.west) * grid.km_per_deg_lon
    y0 = (float(lat) - grid.south) * grid.km_per_deg_lat
    if not (math.isfinite(x0) and math.isfinite(y0)):
        return _EMPTY_I64, _EMPTY_I64
    c0 = math.floor(x0 / grid.cell_km)
    r0 = grid.ny - 1 - math.floor(y0 / grid.cell_km)
    if c0 < 0 or c0 >= grid.nx or r0 < 0 or r0 >= grid.ny:
        return _EMPTY_I64, _EMPTY_I64
    half_diag = 0.5 * math.hypot(scan_km, track_km)
    reach = int(math.ceil(half_diag / grid.cell_km)) + 1
    r_lo, r_hi = max(0, r0 - reach), min(grid.ny - 1, r0 + reach)
    c_lo, c_hi = max(0, c0 - reach), min(grid.nx - 1, c0 + reach)
    rr = np.arange(r_lo, r_hi + 1, dtype=np.int64)[:, None]
    cc = np.arange(c_lo, c_hi + 1, dtype=np.int64)[None, :]
    dx = (cc + 0.5) * grid.cell_km - x0
    dy = (grid.ny - rr - 0.5) * grid.cell_km - y0
    a = math.radians(axis_deg)
    sin_a, cos_a = math.sin(a), math.cos(a)
    u = dx * sin_a + dy * cos_a        # along scan
    v = dx * cos_a - dy * sin_a        # along track
    inside = (np.abs(u) <= 0.5 * scan_km + 1e-9) & (np.abs(v) <= 0.5 * track_km + 1e-9)
    inside[r0 - r_lo, c0 - c_lo] = True
    nz_r, nz_c = np.nonzero(inside)
    return nz_r + r_lo, nz_c + c_lo


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
    if cells <= 0 or not mask.any():
        return mask.copy()
    horiz = mask.copy()
    ny, nx = mask.shape
    for dc in range(1, min(cells, nx - 1) + 1):
        horiz[:, dc:] |= mask[:, : nx - dc]
        horiz[:, : nx - dc] |= mask[:, dc:]
    out = horiz.copy()
    for dr in range(1, min(cells, ny - 1) + 1):
        out[dr:, :] |= horiz[: ny - dr, :]
        out[: ny - dr, :] |= horiz[dr:, :]
    return out
