"""Separable, antialiased Web Mercator to equirectangular resampling in NumPy.

The bbox grids used by Isogon are equirectangular (linear in longitude and latitude). Web Mercator
pixel x depends only on longitude and pixel y only on latitude, so a mosaic can be resampled exactly
with one pass over rows and one over columns, each with a Keys cubic kernel stretched by the local
downsampling factor (antialiasing). Work is done in row strips to keep memory bounded.

Grid conventions (shared by every pack raster):
  row 0 is the north edge, the last row is the south edge;
  column 0 is the west edge, the last column is the east edge.
  "pixel" registration: sample i sits at fraction (i + 0.5) / n of the span (textures).
  "node" registration: sample i sits at fraction i / (n - 1) of the span (vertex grids, like
  dem_hires_f32.bin, whose first and last samples lie exactly on the bbox edges).
"""

from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np
from numpy.typing import NDArray

from backend.terrain.projections import (
    BoundingBox,
    TileGridBounds,
    lat_to_mercator_px,
    lon_to_mercator_px,
)


def keys_cubic(x: NDArray[np.float64], a: float = -0.5) -> NDArray[np.float64]:
    """Keys cubic convolution kernel (Catmull-Rom for a = -0.5), support [-2, 2]."""
    ax = np.abs(x)
    ax2 = ax * ax
    ax3 = ax2 * ax
    near = (a + 2.0) * ax3 - (a + 3.0) * ax2 + 1.0
    far = a * ax3 - 5.0 * a * ax2 + 8.0 * a * ax - 4.0 * a
    return np.where(ax <= 1.0, near, np.where(ax < 2.0, far, 0.0))


@dataclass(frozen=True)
class AxisWeights:
    idx: NDArray[np.int64]  # (n_out, taps)
    w: NDArray[np.float32]  # (n_out, taps), rows sum to 1
    scale: float
    lo: float  # lowest source coordinate touched (before clamping)
    hi: float  # highest source coordinate touched (before clamping)


def axis_weights(coords: NDArray[np.float64], src_len: int) -> AxisWeights:
    """Kernel taps for each output sample at continuous source index ``coords``.

    ``coords`` uses array index convention (sample i centered at i). The kernel is widened by the
    mean source step per output step when that exceeds 1, which band limits downsampling.
    """
    coords = np.asarray(coords, dtype=np.float64)
    if coords.size > 1:
        step = float(np.abs(np.diff(coords)).mean())
    else:
        step = 1.0
    s = max(1.0, step)
    radius = 2.0 * s
    taps = 2 * int(math.ceil(radius)) + 1
    base = np.floor(coords - radius).astype(np.int64)
    idx = base[:, None] + np.arange(taps, dtype=np.int64)[None, :]
    dist = idx.astype(np.float64) - coords[:, None]
    w = keys_cubic(dist / s)
    w_sum = w.sum(axis=1, keepdims=True)
    w = w / np.where(np.abs(w_sum) < 1e-12, 1.0, w_sum)
    # A widened kernel sampled at unit spacing has a small first moment, which would shift each
    # sample by a fraction of a source pixel. Add (alpha + beta d) times a positive tent window so
    # the weights keep summing to 1 and get a zero first moment: linear ramps are then reproduced
    # exactly (no sub-pixel bias). The tent keeps the 2 x 2 system well conditioned.
    s1 = (w * dist).sum(axis=1, keepdims=True)
    p = np.maximum(0.0, 1.0 - np.abs(dist) / (radius + 1.0))
    p0 = p.sum(axis=1, keepdims=True)
    p1 = (p * dist).sum(axis=1, keepdims=True)
    p2 = (p * dist * dist).sum(axis=1, keepdims=True)
    det = p0 * p2 - p1 * p1
    beta = np.where(det > 1e-12, -s1 * p0 / np.where(det > 1e-12, det, 1.0), 0.0)
    alpha = -beta * p1 / p0
    w = w + (alpha + beta * dist) * p
    lo = float(idx.min())
    hi = float(idx.max())
    idx = np.clip(idx, 0, src_len - 1)
    return AxisWeights(idx=idx, w=w.astype(np.float32), scale=step, lo=lo, hi=hi)


def resample_separable(
    src: NDArray,
    rows: AxisWeights,
    cols: AxisWeights,
    strip: int = 256,
    out_dtype: type = np.float32,
) -> NDArray:
    """Apply row then column kernels to ``src`` (H, W) or (H, W, C)."""
    squeeze = src.ndim == 2
    src3 = src[:, :, None] if squeeze else src
    n_r = rows.idx.shape[0]
    n_c = cols.idx.shape[0]
    channels = src3.shape[2]
    out = np.empty((n_r, n_c, channels), dtype=out_dtype)
    is_int = np.issubdtype(np.dtype(out_dtype), np.integer)
    for r0 in range(0, n_r, strip):
        r1 = min(n_r, r0 + strip)
        tmp = np.zeros((r1 - r0, src3.shape[1], channels), dtype=np.float32)
        for k in range(rows.idx.shape[1]):
            tmp += rows.w[r0:r1, k][:, None, None] * src3[rows.idx[r0:r1, k]].astype(np.float32, copy=False)
        acc = np.zeros((r1 - r0, n_c, channels), dtype=np.float32)
        for k in range(cols.idx.shape[1]):
            acc += cols.w[None, :, k, None] * tmp[:, cols.idx[:, k], :]
        if is_int:
            info = np.iinfo(out_dtype)
            out[r0:r1] = np.clip(np.rint(acc), info.min, info.max).astype(out_dtype)
        else:
            out[r0:r1] = acc.astype(out_dtype)
    return out[:, :, 0] if squeeze else out


def grid_fractions(n: int, registration: str, pad: int = 0) -> NDArray[np.float64]:
    """Fractions (0 at the north or west edge, 1 at the south or east edge) for ``n`` samples."""
    i = np.arange(-pad, n + pad, dtype=np.float64)
    if registration == "pixel":
        return (i + 0.5) / float(n)
    if registration == "node":
        return i / float(max(1, n - 1))
    raise ValueError(f"unknown registration {registration!r}")


def mercator_axis_coords(
    bbox: BoundingBox,
    bounds: TileGridBounds,
    n: int,
    registration: str,
    pad: int = 0,
    tile_size: int = 256,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Continuous mosaic indices (row coords, col coords) for an n x n bbox grid."""
    f = grid_fractions(n, registration, pad)
    lats = bbox.north - f * (bbox.north - bbox.south)
    lons = bbox.west + f * (bbox.east - bbox.west)
    row_c = lat_to_mercator_px(lats, bounds.zoom, tile_size) - bounds.ty_min * tile_size - 0.5
    col_c = lon_to_mercator_px(lons, bounds.zoom, tile_size) - bounds.tx_min * tile_size - 0.5
    return np.asarray(row_c, dtype=np.float64), np.asarray(col_c, dtype=np.float64)


def resample_mosaic_to_bbox(
    mosaic: NDArray,
    bounds: TileGridBounds,
    bbox: BoundingBox,
    n: int,
    registration: str,
    pad: int = 0,
    out_dtype: type = np.float32,
    strict: bool = True,
) -> NDArray:
    """Resample a Web Mercator mosaic onto an (n + 2 pad) square bbox grid.

    With ``strict`` the call fails if the kernel would read past the mosaic, so edge samples are never
    built from clamped (repeated) source pixels.
    """
    row_c, col_c = mercator_axis_coords(bbox, bounds, n, registration, pad)
    rows = axis_weights(row_c, mosaic.shape[0])
    cols = axis_weights(col_c, mosaic.shape[1])
    if strict and (rows.lo < 0 or cols.lo < 0 or rows.hi > mosaic.shape[0] - 1 or cols.hi > mosaic.shape[1] - 1):
        raise ValueError(
            "mosaic does not cover the kernel support: "
            f"rows [{rows.lo:.0f}, {rows.hi:.0f}] of {mosaic.shape[0]}, cols [{cols.lo:.0f}, {cols.hi:.0f}] of {mosaic.shape[1]}"
        )
    return resample_separable(mosaic, rows, cols, out_dtype=out_dtype)


def source_step(bbox: BoundingBox, zoom: int, n: int, tile_size: int = 256) -> float:
    """Mean mosaic pixels per output sample across the bbox width at ``zoom``."""
    span_px = float(lon_to_mercator_px(bbox.east, zoom, tile_size) - lon_to_mercator_px(bbox.west, zoom, tile_size))
    return span_px / float(n)


def expand_bbox(bbox: BoundingBox, frac: float) -> BoundingBox:
    """Grow a bbox by ``frac`` of its span on every side."""
    dlon = (bbox.east - bbox.west) * frac
    dlat = (bbox.north - bbox.south) * frac
    return BoundingBox(
        west=max(-180.0, bbox.west - dlon),
        south=max(-85.0, bbox.south - dlat),
        east=min(180.0, bbox.east + dlon),
        north=min(85.0, bbox.north + dlat),
    )
