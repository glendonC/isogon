"""Geometry and rasters for the OpenSpace scene: footprints, the 375 m grid, image layers and their VRT files.

Plain Python with numpy and Pillow. Nothing here reads the backend; the exporter hands it payload values.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Sequence

import numpy as np
from numpy.typing import NDArray
from PIL import Image, ImageDraw

# Kilometres per degree of latitude, the value the model's grids use (backend/model/grid.py).
KM_PER_DEG_LAT: float = 111.132

# Image layers are written on a global longitude and latitude grid of this pixel size (degrees), about 43 m east
# by 56 m north at 40 N. A whole number of pixels spans 360 by 180 degrees, so every box snaps to whole pixels.
PIXEL_DEG: float = 0.0005

# Classic WKT for WGS 84 longitude and latitude, without an axis order, so GDAL reads x as longitude.
WGS84_WKT: str = (
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
    'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
)


def footprint_ring(lon: float, lat: float, scan_km: float, track_km: float, angle_deg: float) -> list[list[float]]:
    """A FIRMS pixel's footprint as a closed ring of [lon, lat], counter-clockwise.

    ``angle_deg`` is the scan axis on the ground, a bearing clockwise from north, with ``scan_km`` along it and
    ``track_km`` square to it: the payload's ``footprint_schema`` and the stage's reading of it
    (website/src/stage/engine/footprintField.ts). The ring is a local flat-earth rectangle, which is exact to
    well under a metre at these sizes.
    """
    az = math.radians(angle_deg)
    sx, sy = math.sin(az), math.cos(az)          # scan axis, east and north components
    tx, ty = sy, -sx                             # track axis, square to it
    hs, ht = 0.5 * scan_km, 0.5 * track_km
    kx = KM_PER_DEG_LAT * math.cos(math.radians(lat))
    corners = []
    for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        ex = a * hs * sx + b * ht * tx
        ny = a * hs * sy + b * ht * ty
        corners.append((lon + ex / kx, lat + ny / KM_PER_DEG_LAT))
    if _signed_area(corners) < 0:
        corners.reverse()
    ring = [[round(x, 6), round(y, 6)] for x, y in corners]
    ring.append(list(ring[0]))
    return ring


def _signed_area(pts: Sequence[tuple[float, float]]) -> float:
    return 0.5 * sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, list(pts[1:]) + [pts[0]]))


@dataclass(frozen=True)
class Grid375:
    """The model's 375 m grid as the payload's ``belief_frames.grid`` states it.

    Cells are counted from the box's south-west corner (``backend/eval/grid.py``): column ``floor(x / cell)``
    east, row ``ny - 1 - floor(y / cell)`` from the north, with km per degree of longitude taken at the box's
    middle latitude. The top row and the east column may reach a little past the box.
    """

    west: float
    south: float
    east: float
    north: float
    cell_km: float
    nx: int
    ny: int

    @classmethod
    def from_payload(cls, grid: dict) -> Grid375:
        if grid.get("row_0") != "north" or grid.get("column_0") != "west":
            raise ValueError(f"unexpected grid order: {grid.get('row_0')}, {grid.get('column_0')}")
        w, s, e, n = (float(v) for v in grid["bbox"])
        return cls(w, s, e, n, float(grid["cell_km"]), int(grid["nx"]), int(grid["ny"]))

    @property
    def km_per_deg_lon(self) -> float:
        return KM_PER_DEG_LAT * math.cos(math.radians(0.5 * (self.south + self.north)))

    @property
    def extent(self) -> tuple[float, float, float, float]:
        """West, south, east, north of the cells themselves."""
        return (self.west, self.south, self.west + self.nx * self.cell_km / self.km_per_deg_lon,
                self.south + self.ny * self.cell_km / KM_PER_DEG_LAT)

    def cells(self, lon: NDArray[np.float64], lat: NDArray[np.float64]) -> tuple[NDArray[np.int64], NDArray[np.int64], NDArray[np.bool_]]:
        """Row, column and a validity mask for each point."""
        x = (lon - self.west) * self.km_per_deg_lon
        y = (lat - self.south) * KM_PER_DEG_LAT
        col = np.floor(x / self.cell_km).astype(np.int64)
        row = (self.ny - 1 - np.floor(y / self.cell_km)).astype(np.int64)
        ok = (col >= 0) & (col < self.nx) & (row >= 0) & (row < self.ny)
        return np.clip(row, 0, self.ny - 1), np.clip(col, 0, self.nx - 1), ok


@dataclass(frozen=True)
class Raster:
    """A window of the global image grid: pixel offsets from (-180, 90) and its size."""

    x0: int
    y0: int
    width: int
    height: int
    pixel_deg: float = PIXEL_DEG

    @classmethod
    def covering(cls, box: Sequence[float], pixel_deg: float = PIXEL_DEG) -> Raster:
        w, s, e, n = (float(v) for v in box)
        x0 = math.floor((w + 180.0) / pixel_deg + 1e-9)
        x1 = math.ceil((e + 180.0) / pixel_deg - 1e-9)
        y0 = math.floor((90.0 - n) / pixel_deg + 1e-9)
        y1 = math.ceil((90.0 - s) / pixel_deg - 1e-9)
        return cls(x0, y0, x1 - x0, y1 - y0, pixel_deg)

    def centres(self) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        """Longitude and latitude of every pixel centre, shape (height, width)."""
        lons = -180.0 + (self.x0 + np.arange(self.width) + 0.5) * self.pixel_deg
        lats = 90.0 - (self.y0 + np.arange(self.height) + 0.5) * self.pixel_deg
        return np.meshgrid(lons, lats)

    def to_pixel(self, lon: float, lat: float) -> tuple[float, float]:
        return ((lon + 180.0) / self.pixel_deg - self.x0, (90.0 - lat) / self.pixel_deg - self.y0)

    @property
    def box(self) -> tuple[float, float, float, float]:
        p = self.pixel_deg
        return (-180.0 + self.x0 * p, 90.0 - (self.y0 + self.height) * p,
                -180.0 + (self.x0 + self.width) * p, 90.0 - self.y0 * p)


def global_vrt(png_name: str, raster: Raster) -> str:
    """A GDAL VRT that places an RGBA PNG on a raster covering the whole globe.

    OpenSpace reads local georeferenced images only when they cover the globe in longitude and latitude
    degrees; its docs pad a local image to -180 -90 180 90 with a VRT (build-local-dem-patches). Outside the
    PNG every band reads 0, so alpha 0, transparent.
    """
    p = raster.pixel_deg
    gw, gh = round(360.0 / p), round(180.0 / p)
    bands = []
    for i, interp in enumerate(("Red", "Green", "Blue", "Alpha"), start=1):
        bands.append(
            f'  <VRTRasterBand dataType="Byte" band="{i}">\n'
            f"    <ColorInterp>{interp}</ColorInterp>\n"
            "    <SimpleSource>\n"
            f'      <SourceFilename relativeToVRT="1">{png_name}</SourceFilename>\n'
            f"      <SourceBand>{i}</SourceBand>\n"
            f'      <SrcRect xOff="0" yOff="0" xSize="{raster.width}" ySize="{raster.height}"/>\n'
            f'      <DstRect xOff="{raster.x0}" yOff="{raster.y0}" xSize="{raster.width}" ySize="{raster.height}"/>\n'
            "    </SimpleSource>\n"
            "  </VRTRasterBand>\n"
        )
    return (
        f'<VRTDataset rasterXSize="{gw}" rasterYSize="{gh}">\n'
        f"  <SRS>{WGS84_WKT}</SRS>\n"
        f"  <GeoTransform>-180.0, {p!r}, 0.0, 90.0, 0.0, {-p!r}</GeoTransform>\n"
        + "".join(bands)
        + "</VRTDataset>\n"
    )


def hex_rgb(color: str) -> tuple[int, int, int]:
    c = color.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))


# The estimate's colour ramp, low to high expected FRP density: violet to pale pink. Detections are orange
# (MODIS) and pale yellow (VIIRS) footprints, so the estimate never reads as a detection.
ESTIMATE_RAMP: tuple[tuple[float, str], ...] = (
    (0.0, "#8a5cf0"),
    (0.45, "#c45ad8"),
    (0.75, "#f07ac0"),
    (1.0, "#ffe0f2"),
)
# Cells whose probability of burning is below this are left transparent. Stated in the scene's manifest.
P_BURNING_FLOOR: float = 0.05
# Opacity rises with the probability of burning: MIN at the floor, MAX for a certain cell.
ESTIMATE_MIN_ALPHA: float = 0.30
ESTIMATE_MAX_ALPHA: float = 0.90


def _ramp_lut(stops: Sequence[tuple[float, str]]) -> NDArray[np.uint8]:
    """256 RGB entries for density bytes 0..255 (byte 0 is no fire and is never drawn)."""
    t = np.clip((np.arange(256) - 1) / 254.0, 0.0, 1.0)
    xs = [s for s, _ in stops]
    out = np.zeros((256, 3), dtype=np.uint8)
    for ch in range(3):
        ys = [hex_rgb(c)[ch] for _, c in stops]
        out[:, ch] = np.round(np.interp(t, xs, ys)).astype(np.uint8)
    return out


ESTIMATE_LUT: NDArray[np.uint8] = _ramp_lut(ESTIMATE_RAMP)


def estimate_rgba(step: NDArray[np.uint8], grid: Grid375, raster: Raster) -> NDArray[np.uint8]:
    """One belief step (ny, nx, 2 bytes: p_burning, density) drawn on ``raster`` as RGBA.

    Each pixel takes the cell that holds its centre, nearest cell, no smoothing, so the 375 m cells stay square.
    A cell is drawn only where the density byte is above 0 and the probability is at least the floor; its colour
    comes from the density on the run's own log scale and its opacity rises linearly with the probability.
    """
    if step.shape != (grid.ny, grid.nx, 2):
        raise ValueError(f"belief step has shape {step.shape}, expected {(grid.ny, grid.nx, 2)}")
    lon, lat = raster.centres()
    row, col, ok = grid.cells(lon, lat)
    p = step[row, col, 0].astype(np.float64) / 255.0
    d = step[row, col, 1]
    show = ok & (d > 0) & (p >= P_BURNING_FLOOR)
    rgba = np.zeros((raster.height, raster.width, 4), dtype=np.uint8)
    rgba[..., :3] = ESTIMATE_LUT[d]
    alpha = ESTIMATE_MIN_ALPHA + (ESTIMATE_MAX_ALPHA - ESTIMATE_MIN_ALPHA) * p
    rgba[..., 3] = np.where(show, np.round(255.0 * alpha), 0).astype(np.uint8)
    rgba[~show, :3] = 0
    return rgba


def footprints_rgba(rings: Sequence[Sequence[Sequence[float]]], raster: Raster, fill: str, fill_alpha: float,
                    outline: str | None) -> NDArray[np.uint8]:
    """Footprint rings drawn on ``raster`` as RGBA: the image-layer form of the detections (no smoothing)."""
    img = Image.new("RGBA", (raster.width, raster.height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    fr, fg, fb = hex_rgb(fill)
    for ring in rings:
        pts = [raster.to_pixel(x, y) for x, y in ring[:-1]]
        draw.polygon(pts, fill=(fr, fg, fb, round(255 * fill_alpha)),
                     outline=(hex_rgb(outline) + (255,)) if outline else None)
    return np.asarray(img, dtype=np.uint8)


def png_bytes(rgba: NDArray[np.uint8]) -> bytes:
    """RGBA as PNG bytes. Pillow writes no time stamp, so equal arrays give equal bytes."""
    import io

    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG", optimize=True)
    return buf.getvalue()
