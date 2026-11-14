"""Terrain pack v1: ortho atlas, 1024 DEM and baked aux raster per region.

Registration. Every raster in a pack covers exactly the bbox of the region's dem_hires_f32.bin with
the same row and column order:
  row 0 is the north edge and the last row the south edge;
  column 0 is the west edge and the last column the east edge.
  dem_<n>_f32.bin is node registered like dem_hires_f32.bin: sample (0, 0) sits exactly on the
  north west corner of the bbox and sample (n - 1, n - 1) exactly on the south east corner.
  ortho_<n>.jpg and aux_<n>.png are pixel registered textures: texel (0, 0) is the north west cell of
  an n x n split of the bbox, so they line up with the DEM vertices under ordinary 0..1 plane UVs,
  exactly like the satellite_<ext> asset.

World frame of the aux normals: x east, y up, z south (three.js plane rotated -90 degrees about x,
north toward -z). Normals are unit vectors of the true scale terrain packed as n * 0.5 + 0.5; the
consumer rebuilds y = sqrt(1 - x^2 - z^2).

Context terrain: context_dem_1024_f32.bin and context_ortho_4096.jpg cover a bbox
with the pack's centre and five times its span on each axis, with the same registration rules, so the pack
is the central fifth. They are listed in the pack meta under "context"; a pack without them is served without
that key. A `build --force` writes a fresh meta, so run `detail` and `context` again after it.

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/terrain/terrain_pack.py \
      build plumas_ca lytton_bc evia_greece
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/terrain/terrain_pack.py \
      context plumas_ca lytton_bc evia_greece
"""

from __future__ import annotations

import argparse
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
import datetime as _dt
import hashlib
import json
import math
from pathlib import Path
import sys
import threading
import time
from typing import Any, Callable

import numpy as np
from numpy.typing import NDArray

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from PIL import Image, ImageFilter  # noqa: E402

from backend.terrain.live_region import (  # noqa: E402
    HIRES_REGION_CACHE_DIR,
    PRESET_BY_ID,
    RegionSpec,
    _apply_gamma_rgb,
    region_cache_stem,
    resolve_region_request,
)
from backend.terrain.projections import (  # noqa: E402
    BoundingBox,
    decode_terrarium_rgb,
    tile_bounds_for_bbox,
    wgs84_bbox_dimensions_m,
    wgs84_meters_per_degree,
)
from backend.terrain.resample import (  # noqa: E402
    axis_weights,
    expand_bbox,
    resample_mosaic_to_bbox,
    resample_separable,
    source_step,
)
from backend.terrain.tile_store import (  # noqa: E402
    EOX_S2_CLOUDLESS_2020,
    ESRI_WORLD_IMAGERY,
    SOURCES_BY_KEY,
    TERRARIUM,
    USGS_NAIP,
    TileSource,
    TileStore,
)

PACK_VERSION: int = 1
PACK_TAG: str = f"tpack{PACK_VERSION}"
HERO_REGION_IDS: tuple[str, ...] = ("plumas_ca", "lytton_bc", "evia_greece")
EARTH_CIRCUMFERENCE_M: float = 40075016.686
EARTH_RADIUS_M: float = 6371008.8

AO_RADIUS_M: float = 4800.0
AO_AZIMUTHS: int = 16
AO_STEPS: int = 24
PACK_STATUS_VALUES: tuple[str, ...] = ("ready", "building", "failed", "absent")  # the values `terrain_pack.status` takes
AUX_CHANNELS: dict[str, str] = {"r": "normal_x", "g": "normal_z", "b": "sky_view_ao", "a": "canopy_index"}

ORTHO_JPEG_QUALITY: int = 88
ORTHO_COLOR_GAMMA: float = 0.95
ORTHO_COLOR_CONTRAST: float = 1.04

# Context terrain: land and sea around a hero pack out to a horizon.
CONTEXT_SCALE: int = 5
CONTEXT_DEM_SIZE: int = 1024
CONTEXT_ORTHO_SIZE: int = 4096
# Esri World Imagery at zoom 11 and below is another mosaic. Over the Plumas pack it averages sRGB 50, 48, 8
# against 72, 82, 58 for zooms 12 to 14, and its luminance correlates with the pack at only 0.41 to 0.78
# across the three hero regions (0.996 to 0.998 at zoom 12). Zoom 12 is the lowest zoom of the pack's own
# mosaic, so the context ortho is zoom 12 downsampled.
CONTEXT_ORTHO_ZOOM: int = 12
CONTEXT_FILE_NAMES: tuple[str, ...] = (f"context_dem_{CONTEXT_DEM_SIZE}_f32.bin", f"context_ortho_{CONTEXT_ORTHO_SIZE}.jpg")
CONTEXT_MAX_TILES: int = 2000  # per region, both sources; a context build that needs more is refused


@dataclass(frozen=True)
class TierSpec:
    name: str
    ortho_size: int
    ortho_zoom: int
    fallback_size: int
    dem_size: int
    aux_size: int


HERO_TIER = TierSpec("hero", ortho_size=8192, ortho_zoom=14, fallback_size=4096, dem_size=1024, aux_size=2048)
STANDARD_TIER = TierSpec("standard", ortho_size=4096, ortho_zoom=13, fallback_size=2048, dem_size=1024, aux_size=2048)


def tier_for(spec: RegionSpec) -> TierSpec:
    return HERO_TIER if spec.id in HERO_REGION_IDS else STANDARD_TIER


# Imagery variants. The default pack's file names carry no prefix; any other imagery source builds a
# complete parallel pack whose served names start with "<source>_", so both can belong to one run.
DEFAULT_IMAGERY: str = "esri_world_imagery"
IMAGERY_SOURCES: dict[str, TileSource] = {"esri_world_imagery": ESRI_WORLD_IMAGERY, "usgs_naip": USGS_NAIP}
# Coverage boxes (west, south, east, north); a source without a box covers the globe. USGS Imagery Only
# carries NAIP for the conterminous United States.
_IMAGERY_COVERAGE: dict[str, tuple[float, float, float, float]] = {"usgs_naip": (-125.0, 24.4, -66.9, 49.4)}


def imagery_covers(imagery: str, bbox: BoundingBox) -> bool:
    if imagery not in IMAGERY_SOURCES:
        return False
    box = _IMAGERY_COVERAGE.get(imagery)
    if box is None:
        return True
    w, s, e, n = box
    return bbox.west >= w and bbox.east <= e and bbox.south >= s and bbox.north <= n


def _name_prefix(imagery: str) -> str:
    return "" if imagery == DEFAULT_IMAGERY else f"{imagery}_"


def pack_file_names(tier: TierSpec, imagery: str = DEFAULT_IMAGERY) -> tuple[str, ...]:
    p = _name_prefix(imagery)
    return (
        f"{p}dem_{tier.dem_size}_f32.bin",
        f"{p}ortho_{tier.ortho_size}.jpg",
        f"{p}ortho_{tier.fallback_size}.jpg",
        f"{p}aux_{tier.aux_size}.png",
    )


def _file_prefix(spec: RegionSpec, tier: TierSpec) -> str:
    return f"{region_cache_stem(spec)}_{PACK_TAG}_{tier.name}_"


def pack_meta_path(spec: RegionSpec, cache_dir: Path = HIRES_REGION_CACHE_DIR, imagery: str = DEFAULT_IMAGERY) -> Path:
    return cache_dir / f"{_file_prefix(spec, tier_for(spec))}{_name_prefix(imagery)}meta.json"


def _pack_file_path(spec: RegionSpec, name: str, cache_dir: Path) -> Path:
    return cache_dir / f"{_file_prefix(spec, tier_for(spec))}{name}"


def load_pack(
    spec: RegionSpec,
    cache_dir: Path = HIRES_REGION_CACHE_DIR,
    imagery: str = DEFAULT_IMAGERY,
) -> tuple[dict[str, Any], dict[str, Path]] | None:
    """Return (meta, {served name: path}) when a complete pack for ``spec`` and ``imagery`` is on disk."""
    meta_file = pack_meta_path(spec, cache_dir, imagery)
    if not meta_file.is_file():
        return None
    try:
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if meta.get("version") != PACK_VERSION or meta.get("tier") != tier_for(spec).name:
        return None
    if meta.get("imagery", DEFAULT_IMAGERY) != imagery:
        return None
    files: dict[str, Path] = {}
    for name, info in (meta.get("files") or {}).items():
        path = _pack_file_path(spec, name, cache_dir)
        try:
            ok = path.stat().st_size == int(info["bytes"])
        except (OSError, KeyError, ValueError):
            ok = False
        if not ok:
            if name in CONTEXT_FILE_NAMES:  # an incomplete context drops the context, never the pack
                continue
            return None
        files[name] = path
    if not all(n in files for n in pack_file_names(tier_for(spec), imagery)):
        return None
    if not ("context" in meta and all(n in files for n in CONTEXT_FILE_NAMES)):
        meta.pop("context", None)
        for n in CONTEXT_FILE_NAMES:
            files.pop(n, None)
    return meta, files


def resolve_pack_file(spec: RegionSpec, name: str, cache_dir: Path = HIRES_REGION_CACHE_DIR) -> Path | None:
    """Path of a served pack file in any imagery variant, or None for anything no pack lists (no traversal)."""
    for imagery in IMAGERY_SOURCES:
        if imagery != DEFAULT_IMAGERY and not name.startswith(_name_prefix(imagery)):
            continue
        loaded = load_pack(spec, cache_dir, imagery)
        if loaded is not None and name in loaded[1]:
            return loaded[1][name]
    return None


def pack_descriptor(meta: dict[str, Any], run_id: str) -> dict[str, Any]:
    """The ``assets.terrain_pack`` object for one run."""
    base = f"/api/runs/{run_id}/terrain/"
    o = meta["ortho"]
    d: dict[str, Any] = {
        "version": meta["version"],
        "tier": meta["tier"],
        "extent_km": list(meta["extent_km"]),
        "elev_range_m": list(meta["elev_range_m"]),
        "dem": {"url": base + meta["dem"]["name"], "size": meta["dem"]["size"], "format": "f32le"},
        "ortho": {
            "url": base + o["name"],
            "size": o["size"],
            "zoom": o["zoom"],
            "gsd_m": o["gsd_m"],
            "source": o["source"],
            # The credit is read from the source table, not from the pack's meta, so a pack never carries a stale one.
            "attribution": SOURCES_BY_KEY[o["source"]].attribution if o["source"] in SOURCES_BY_KEY else o["attribution"],
        },
        "ortho_fallback": {"url": base + meta["ortho_fallback"]["name"], "size": meta["ortho_fallback"]["size"]},
        "aux": {"url": base + meta["aux"]["name"], "size": meta["aux"]["size"], "channels": dict(AUX_CHANNELS)},
        "sun": {"azimuth_deg": meta["sun"]["azimuth_deg"], "elevation_deg": meta["sun"]["elevation_deg"]},
    }
    details = meta.get("ortho_detail") or []
    if details:
        d["ortho_detail"] = [
            {"url": base + x["name"], "size": x["size"], "zoom": x["zoom"], "gsd_m": x["gsd_m"], "uv_rect": list(x["uv_rect"])}
            for x in details
        ]
    c = meta.get("context")
    if c:  # absent unless a context was built for this pack
        co = c["ortho"]
        d["context"] = {
            "extent_km": list(c["extent_km"]),
            "scale": c["scale"],
            "dem": {"url": base + c["dem"]["name"], "size": c["dem"]["size"], "format": "f32le"},
            "ortho": {
                "url": base + co["name"],
                "size": co["size"],
                "zoom": co["zoom"],
                "source": co["source"],
                "attribution": SOURCES_BY_KEY[co["source"]].attribution if co["source"] in SOURCES_BY_KEY else co["attribution"],
            },
        }
    return d


# Geometry helpers ---------------------------------------------------------------------------------


def ground_px_m(lat_deg: float, zoom: int) -> float:
    """Ground size of one 256 px Web Mercator tile pixel at ``lat_deg``."""
    return EARTH_CIRCUMFERENCE_M * math.cos(math.radians(lat_deg)) / (256.0 * (1 << zoom))


def select_dem_zoom(bbox: BoundingBox, aux_size: int, max_tiles: int = 400) -> int:
    """Lowest Terrarium zoom whose pixel is no larger than the aux grid spacing."""
    w_m, h_m = wgs84_bbox_dimensions_m(bbox)
    spacing = min(w_m, h_m) / float(aux_size)
    chosen = 14
    for z in range(9, 15):
        if ground_px_m(bbox.center_lat, z) <= spacing:
            chosen = z
            break
    while chosen > 9 and tile_bounds_for_bbox(bbox, zoom=chosen).total_tiles > max_tiles:
        chosen -= 1
    return chosen


def select_ortho_zoom(bbox: BoundingBox, tier: TierSpec, min_zoom: int = 10) -> int:
    """Tier zoom, lowered while the bbox spans more than 1.5 output widths of mosaic pixels.

    Default spans keep the tier zoom (14 for hero, 13 for standard); a wide live-search window
    (up to 2.2 degrees) drops a zoom or two instead of fetching thousands of tiles nobody can see.
    """
    z = tier.ortho_zoom
    while z > min_zoom and source_step(bbox, z, 1) > 1.5 * tier.ortho_size:
        z -= 1
    return z


def choose_detail_window(
    score: NDArray[np.floating],
    w_frac: float,
    h_frac: float,
) -> tuple[float, float, float, float]:
    """Image-space rect (x0, y0, x1, y1), fractions from the north west corner, that holds the most
    ``score``. ``score`` is a node registered grid over the bbox (row 0 north)."""
    s = np.asarray(score, dtype=np.float64)
    n_r, n_c = s.shape
    kh = max(1, min(n_r, int(round(h_frac * (n_r - 1))) + 1))
    kw = max(1, min(n_c, int(round(w_frac * (n_c - 1))) + 1))
    sat = np.zeros((n_r + 1, n_c + 1))
    sat[1:, 1:] = s.cumsum(axis=0).cumsum(axis=1)
    sums = sat[kh:, kw:] - sat[:-kh, kw:] - sat[kh:, :-kw] + sat[:-kh, :-kw]
    i, j = np.unravel_index(int(np.argmax(sums)), sums.shape)
    cy = (i + (kh - 1) / 2.0) / (n_r - 1)
    cx = (j + (kw - 1) / 2.0) / (n_c - 1)
    x0 = float(np.clip(cx - w_frac / 2.0, 0.0, 1.0 - w_frac))
    y0 = float(np.clip(cy - h_frac / 2.0, 0.0, 1.0 - h_frac))
    return x0, y0, x0 + w_frac, y0 + h_frac


def image_rect_to_uv(rect: tuple[float, float, float, float]) -> list[float]:
    """Image-space rect (y down from north) to plane UV [u0, v0, u1, v1] (v up from south, v = 1 north)."""
    x0, y0, x1, y1 = rect
    return [round(x0, 9), round(1.0 - y1, 9), round(x1, 9), round(1.0 - y0, 9)]


def row_spacing_m(bbox: BoundingBox, n: int, pad: int = 0) -> tuple[NDArray[np.float64], float]:
    """Per row east spacing and the north south spacing of an n x n pixel registered grid (+ pad)."""
    v = (np.arange(-pad, n + pad, dtype=np.float64) + 0.5) / float(n)
    lats = bbox.north - v * (bbox.north - bbox.south)
    m_lon, _ = wgs84_meters_per_degree(lats)
    _, m_lat_c = wgs84_meters_per_degree(bbox.center_lat)
    dx = np.asarray(m_lon, dtype=np.float64) * (bbox.east - bbox.west) / float(n)
    dy = float(m_lat_c) * (bbox.north - bbox.south) / float(n)
    return dx, dy


# Aux channels -------------------------------------------------------------------------------------


def world_normals(
    dem: NDArray[np.floating],
    dx_m: NDArray[np.floating] | float,
    dy_m: float,
) -> tuple[NDArray[np.float32], NDArray[np.float32], NDArray[np.float32]]:
    """Unit normals (x east, y up, z south) of a heightfield whose row 0 is north.

    ``dx_m`` is the east spacing per row (array) or a scalar, ``dy_m`` the north south spacing.
    Central differences inside, one sided differences on the border.
    """
    h = np.asarray(dem, dtype=np.float64)
    dh_dc = np.empty_like(h)
    dh_dc[:, 1:-1] = (h[:, 2:] - h[:, :-2]) * 0.5
    dh_dc[:, 0] = h[:, 1] - h[:, 0]
    dh_dc[:, -1] = h[:, -1] - h[:, -2]
    dh_dr = np.empty_like(h)
    dh_dr[1:-1, :] = (h[2:, :] - h[:-2, :]) * 0.5
    dh_dr[0, :] = h[1, :] - h[0, :]
    dh_dr[-1, :] = h[-1, :] - h[-2, :]
    dx = np.broadcast_to(np.asarray(dx_m, dtype=np.float64).reshape(-1, 1) if np.ndim(dx_m) else float(dx_m), h.shape)
    dhdx = dh_dc / dx
    dhdz = dh_dr / float(dy_m)  # rows grow southward, which is +z
    inv = 1.0 / np.sqrt(dhdx * dhdx + 1.0 + dhdz * dhdz)
    return (-dhdx * inv).astype(np.float32), inv.astype(np.float32), (-dhdz * inv).astype(np.float32)


def _shifted(h: NDArray[np.float32], pad: int, ch: int, cw: int, orow: float, ocol: float, bilinear: bool) -> NDArray[np.float32]:
    if not bilinear:
        r = int(round(orow))
        c = int(round(ocol))
        return h[pad + r : pad + r + ch, pad + c : pad + c + cw]
    r0 = int(math.floor(orow))
    c0 = int(math.floor(ocol))
    fr = np.float32(orow - r0)
    fc = np.float32(ocol - c0)
    a = h[pad + r0 : pad + r0 + ch, pad + c0 : pad + c0 + cw]
    b = h[pad + r0 : pad + r0 + ch, pad + c0 + 1 : pad + c0 + 1 + cw]
    c = h[pad + r0 + 1 : pad + r0 + 1 + ch, pad + c0 : pad + c0 + cw]
    d = h[pad + r0 + 1 : pad + r0 + 1 + ch, pad + c0 + 1 : pad + c0 + 1 + cw]
    return (a * (1 - fc) + b * fc) * (1 - fr) + (c * (1 - fc) + d * fc) * fr


def sky_view_factor(
    dem: NDArray[np.floating],
    pad: int,
    dx_m: float,
    dy_m: float,
    radius_m: float = AO_RADIUS_M,
    n_azimuths: int = AO_AZIMUTHS,
    n_steps: int = AO_STEPS,
    earth_curvature: bool = True,
) -> NDArray[np.float32]:
    """Sky view factor of the core of a padded heightfield (Zaksek et al. 2011).

    For each of ``n_azimuths`` directions the horizon elevation angle gamma is the largest elevation
    angle to terrain within ``radius_m`` (sampled at geometrically spaced distances), floored at 0.
    The factor is 1 - mean(sin gamma): the fraction of the sky hemisphere left visible, 1 on open
    flat ground. The pad must hold the search radius; the radius is clipped to fit when it does not.
    """
    h = np.asarray(dem, dtype=np.float32)
    ch, cw = h.shape[0] - 2 * pad, h.shape[1] - 2 * pad
    if ch <= 0 or cw <= 0:
        raise ValueError("pad leaves no core")
    core = h[pad : pad + ch, pad : pad + cw]
    min_sp = min(dx_m, dy_m)
    radius = min(radius_m, (pad - 1) * min_sp)
    dists = np.geomspace(min_sp, radius, n_steps)
    acc = np.zeros((ch, cw), dtype=np.float32)
    for a in range(n_azimuths):
        phi = 2.0 * math.pi * a / n_azimuths  # 0 = north, clockwise
        east, north = math.sin(phi), math.cos(phi)
        best = np.zeros((ch, cw), dtype=np.float32)
        for d in dists:
            ocol = d * east / dx_m
            orow = -d * north / dy_m
            sample = _shifted(h, pad, ch, cw, orow, ocol, bilinear=(d / min_sp) < 8.0)
            drop = (d * d / (2.0 * EARTH_RADIUS_M)) if earth_curvature else 0.0
            t = (sample - core - np.float32(drop)) * np.float32(1.0 / d)
            np.maximum(best, t, out=best)
        acc += best / np.sqrt(1.0 + best * best)
    return np.clip(1.0 - acc / np.float32(n_azimuths), 0.0, 1.0).astype(np.float32)


def encode_aux(
    nx: NDArray[np.floating],
    nz: NDArray[np.floating],
    sky_view: NDArray[np.floating],
    canopy: NDArray[np.floating],
) -> NDArray[np.uint8]:
    """Pack the four aux channels into an (H, W, 4) uint8 RGBA array."""

    def q(x: NDArray[np.floating]) -> NDArray[np.uint8]:
        return np.clip(np.rint(np.asarray(x, dtype=np.float64) * 255.0), 0, 255).astype(np.uint8)

    return np.stack([q(nx * 0.5 + 0.5), q(nz * 0.5 + 0.5), q(sky_view), q(canopy)], axis=-1)


def _box_mean(a: NDArray[np.floating], r: int) -> NDArray[np.float64]:
    """Mean over a (2r + 1) square window with edge replication (summed area table)."""
    p = np.pad(np.asarray(a, dtype=np.float64), r + 1, mode="edge")
    s = p.cumsum(axis=0).cumsum(axis=1)
    k = 2 * r + 1
    tot = s[k:, k:] - s[:-k, k:] - s[k:, :-k] + s[:-k, :-k]
    return tot[: a.shape[0], : a.shape[1]] / float(k * k)


def _sigmoid(x: NDArray[np.floating]) -> NDArray[np.float64]:
    return 1.0 / (1.0 + np.exp(-np.asarray(x, dtype=np.float64)))


def canopy_index(
    rgb: NDArray[np.uint8],
    texture: NDArray[np.floating],
    slope_deg: NDArray[np.floating],
) -> NDArray[np.float32]:
    """Heuristic 0..1 forest cover likelihood from true color imagery and slope.

    No near infrared is available, so this is a rendering aid, not a land cover product. Forest
    canopy at 5 to 10 m imagery is darker than grass, rock and bare soil, green leaning (green at
    least as strong as red) and textured by crowns and their shadows. Flat smooth dark ground is
    treated as water, bright ground as snow or rock, and cliffs steeper than about 55 degrees as bare.
    """
    f = rgb.astype(np.float64)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    lum = (r + g + b) / 3.0
    grvi = (g - r) / (g + r + 1.0)
    tex_rel = np.asarray(texture, dtype=np.float64) / (lum + 12.0)
    dark = _sigmoid((105.0 - lum) / 14.0)
    green = _sigmoid((grvi + 0.01) / 0.025)
    textured = _sigmoid((tex_rel - 0.09) / 0.03)
    flat = _sigmoid((2.0 - slope_deg) / 0.6)
    smooth = _sigmoid((0.06 - tex_rel) / 0.015)
    water = flat * smooth
    snow = _sigmoid((lum - 195.0) / 10.0)
    not_cliff = _sigmoid((55.0 - slope_deg) / 4.0)
    canopy = green * dark * textured * not_cliff * (1.0 - water) * (1.0 - snow)
    return np.clip(_box_mean(canopy, 1), 0.0, 1.0).astype(np.float32)


def ortho_texture(ortho: NDArray[np.uint8], out_size: int) -> NDArray[np.float32]:
    """RMS of fine luminance detail (crown scale) per output cell of a square ortho image."""
    lum = Image.fromarray(np.ascontiguousarray(ortho)).convert("L")
    blur = lum.filter(ImageFilter.BoxBlur(2))
    hp = np.asarray(lum, dtype=np.float32) - np.asarray(blur, dtype=np.float32)
    n = ortho.shape[0]
    f = n // out_size
    sq = (hp * hp).reshape(out_size, f, out_size, f).mean(axis=(1, 3))
    return np.sqrt(sq).astype(np.float32)


def estimate_sun(
    nx: NDArray[np.float32],
    ny: NDArray[np.float32],
    nz: NDArray[np.float32],
    rgb: NDArray[np.uint8],
    work: int = 512,
) -> dict[str, float]:
    """Sun direction that best explains the shading baked into the imagery.

    Correlates high passed image luminance with high passed Lambert shading of the DEM normals.
    Azimuth comes from a fast search with unclamped shading n . s, which is linear in the normal
    components so their high passes are computed once; azimuth is well constrained either way.
    Elevation is then refined at that azimuth with the clamped shading max(0, n . s), whose
    self-shadowing on steep slopes is what carries the (weak) elevation signal. Elevation stays in
    20 to 80 degrees: satellite imagery is rarely taken with a lower sun.
    """
    n = nx.shape[0]
    f = max(1, n // work)
    m = n // f

    def ds(a: NDArray[np.floating]) -> NDArray[np.float64]:
        return np.asarray(a[: m * f, : m * f], dtype=np.float64).reshape(m, f, m, f).mean(axis=(1, 3))

    def hp_raw(a: NDArray[np.float64]) -> NDArray[np.float64]:
        x = a - _box_mean(a, 12)
        return x - x.mean()

    def hp(a: NDArray[np.float64]) -> NDArray[np.float64]:
        x = hp_raw(a)
        return x / (x.std() + 1e-9)

    lum = hp(ds(rgb.astype(np.float64).mean(axis=2)))
    snx, sny, snz = ds(nx), ds(ny), ds(nz)
    hx, hy, hz = hp_raw(snx), hp_raw(sny), hp_raw(snz)
    cxx, cyy, czz = float(np.mean(hx * hx)), float(np.mean(hy * hy)), float(np.mean(hz * hz))
    cxy, cxz, cyz = float(np.mean(hx * hy)), float(np.mean(hx * hz)), float(np.mean(hy * hz))
    lx, ly, lz = float(np.mean(hx * lum)), float(np.mean(hy * lum)), float(np.mean(hz * lum))

    def sun_vec(az: float, el: float) -> tuple[float, float, float]:
        a, e = math.radians(az), math.radians(el)
        return math.sin(a) * math.cos(e), math.sin(e), -math.cos(a) * math.cos(e)

    def corr_linear(az: float, el: float) -> float:
        sx, sy, sz = sun_vec(az, el)
        var = (sx * sx * cxx + sy * sy * cyy + sz * sz * czz
               + 2 * (sx * sy * cxy + sx * sz * cxz + sy * sz * cyz))
        return (sx * lx + sy * ly + sz * lz) / math.sqrt(max(var, 1e-18))

    def corr_clamped(az: float, el: float) -> float:
        sx, sy, sz = sun_vec(az, el)
        return float(np.mean(hp(np.maximum(0.0, snx * sx + sny * sy + snz * sz)) * lum))

    best_az, best_c = 0.0, -2.0
    for el in (20.0, 30.0, 40.0, 50.0, 60.0, 70.0):
        for az in range(0, 360, 5):
            c = corr_linear(float(az), el)
            if c > best_c:
                best_c, best_az = c, float(az)
    for az in np.arange(best_az - 5.0, best_az + 5.1, 1.0):
        for el in (20.0, 40.0, 60.0):
            c = corr_linear(float(az % 360.0), el)
            if c > best_c:
                best_c, best_az = c, float(az % 360.0)
    best = (-2.0, best_az, 45.0)
    for el in np.arange(20.0, 80.1, 2.0):
        c = corr_clamped(best_az, float(el))
        if c > best[0]:
            best = (c, best_az, float(el))
    return {"azimuth_deg": round(best[1], 1), "elevation_deg": round(best[2], 1), "correlation": round(best[0], 3)}


# Build -------------------------------------------------------------------------------------------


def _log_stderr(msg: str) -> None:
    sys.stderr.write(f"[terrain_pack] {msg}\n")
    sys.stderr.flush()


def _write_atomic(dest: Path, payload: bytes) -> None:
    tmp = dest.with_name(f".{dest.name}.{threading.get_ident()}.tmp")
    tmp.write_bytes(payload)
    tmp.replace(dest)


def _save_image_atomic(img: Image.Image, dest: Path, **kwargs: Any) -> None:
    tmp = dest.with_name(f".{dest.name}.{threading.get_ident()}.tmp")
    img.save(tmp, **kwargs)
    tmp.replace(dest)


def _gamma_lut() -> NDArray[np.uint8]:
    ramp = np.repeat(np.arange(256, dtype=np.uint8)[None, :, None], 3, axis=2)
    return _apply_gamma_rgb(ramp, gamma=ORTHO_COLOR_GAMMA, contrast=ORTHO_COLOR_CONTRAST)[0, :, 0]


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _hf_rms(a: NDArray[np.floating]) -> float:
    x = np.asarray(a, dtype=np.float64)
    return float(np.sqrt(np.mean((x - _box_mean(x, 2)) ** 2)))


def build_terrain_pack(
    spec: RegionSpec,
    cache_dir: Path = HIRES_REGION_CACHE_DIR,
    store: TileStore | None = None,
    log: Callable[[str], None] = _log_stderr,
    imagery: str = DEFAULT_IMAGERY,
) -> dict[str, Any]:
    """Fetch, resample and bake every pack raster for ``spec``; write them and return the meta."""
    if not imagery_covers(imagery, spec.bbox):
        raise ValueError(f"{imagery} does not cover {spec.id}")
    tier = tier_for(spec)
    store = store or TileStore()
    cache_dir.mkdir(parents=True, exist_ok=True)
    bbox = spec.bbox
    timings: dict[str, float] = {}
    t_all = time.perf_counter()

    # Imagery (Esri) downloads in the background while the DEM (AWS) stage runs; each host keeps its
    # own polite rate, so this only overlaps waiting, it does not raise the request rate to either.
    z = select_ortho_zoom(bbox, tier)
    step_fb = source_step(bbox, z, tier.fallback_size)
    ortho_bounds = tile_bounds_for_bbox(bbox, zoom=z, margin_px=2.0 * max(1.0, step_fb) + 6.0)
    log(f"{spec.id}: imagery z{z}, {ortho_bounds.total_tiles} tiles (background)")
    t_img = time.perf_counter()

    def _fetch_imagery() -> tuple[TileSource, NDArray[np.uint8], float]:
        if imagery != DEFAULT_IMAGERY:  # an explicitly chosen source never silently falls back
            src = IMAGERY_SOURCES[imagery]
            return src, store.fetch_mosaic(src, ortho_bounds, placeholder_fill=True), time.perf_counter() - t_img
        try:
            m = store.fetch_mosaic(ESRI_WORLD_IMAGERY, ortho_bounds, placeholder_fill=True)
            return ESRI_WORLD_IMAGERY, m, time.perf_counter() - t_img
        except Exception as exc:  # noqa: BLE001
            log(f"{spec.id}: Esri World Imagery failed ({exc}); using EOX Sentinel-2 cloudless")
            m = store.fetch_mosaic(EOX_S2_CLOUDLESS_2020, ortho_bounds)
            return EOX_S2_CLOUDLESS_2020, m, time.perf_counter() - t_img

    img_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pack-imagery")
    img_future = img_pool.submit(_fetch_imagery)

    # 1. DEM: one Terrarium mosaic feeds the node registered DEM and the padded aux grid.
    t0 = time.perf_counter()
    n_aux = tier.aux_size
    dx_rows, dy = row_spacing_m(bbox, n_aux)
    dx_c = float(np.mean(dx_rows))
    pad = int(math.ceil(AO_RADIUS_M / min(dx_c, dy))) + 3
    dem_zoom = select_dem_zoom(bbox, n_aux)
    step_dem = source_step(bbox, dem_zoom, tier.dem_size)
    big = expand_bbox(bbox, (pad + 2) / float(n_aux))
    dem_bounds = tile_bounds_for_bbox(big, zoom=dem_zoom, margin_px=2.0 * max(1.0, step_dem) + 6.0)
    log(f"{spec.id}: Terrarium z{dem_zoom}, {dem_bounds.total_tiles} tiles")
    elev = decode_terrarium_rgb(store.fetch_mosaic(TERRARIUM, dem_bounds)).astype(np.float32)
    dem_n = np.clip(resample_mosaic_to_bbox(elev, dem_bounds, bbox, tier.dem_size, "node"), 0.0, 8850.0).astype("<f4")
    dem_aux = np.clip(resample_mosaic_to_bbox(elev, dem_bounds, bbox, n_aux, "pixel", pad=pad), 0.0, 8850.0).astype(np.float32)
    timings["dem_s"] = round(time.perf_counter() - t0, 2)

    # Detail check: does this zoom carry more relief detail than the zoom below it?
    t0 = time.perf_counter()
    lower_z = dem_zoom - 1
    low_bounds = tile_bounds_for_bbox(bbox, zoom=lower_z, margin_px=2.0 * max(1.0, source_step(bbox, lower_z, n_aux)) + 6.0)
    elev_low = decode_terrarium_rgb(store.fetch_mosaic(TERRARIUM, low_bounds)).astype(np.float32)
    dem_low = np.clip(resample_mosaic_to_bbox(elev_low, low_bounds, bbox, n_aux, "pixel"), 0.0, 8850.0)
    core = dem_aux[pad:-pad, pad:-pad]
    detail_check = {
        "grid": n_aux,
        "zoom": dem_zoom,
        "zoom_px_m": round(ground_px_m(bbox.center_lat, dem_zoom), 2),
        "hf_rms_m": round(_hf_rms(core), 3),
        "lower_zoom": lower_z,
        "lower_zoom_px_m": round(ground_px_m(bbox.center_lat, lower_z), 2),
        "lower_hf_rms_m": round(_hf_rms(dem_low), 3),
        "rms_diff_m": round(float(np.sqrt(np.mean((core.astype(np.float64) - dem_low) ** 2))), 3),
    }
    timings["dem_detail_check_s"] = round(time.perf_counter() - t0, 2)
    log(f"{spec.id}: DEM detail {detail_check}")

    # 2. Normals and sky view on the padded aux grid (real terrain beyond the bbox, no edge clamp).
    t0 = time.perf_counter()
    dx_pad, _ = row_spacing_m(bbox, n_aux, pad)
    nx_p, ny_p, nz_p = world_normals(dem_aux, dx_pad, dy)
    nx, ny, nz = (a[pad:-pad, pad:-pad] for a in (nx_p, ny_p, nz_p))
    timings["normals_s"] = round(time.perf_counter() - t0, 2)
    t0 = time.perf_counter()
    svf = sky_view_factor(dem_aux, pad, dx_c, dy, AO_RADIUS_M)
    timings["sky_view_s"] = round(time.perf_counter() - t0, 2)

    # 3. Ortho atlas (fetched in the background since the start).
    t0 = time.perf_counter()
    try:
        source, mosaic, fetch_s = img_future.result()
    finally:
        img_pool.shutdown(wait=True)
    timings["imagery_fetch_s"] = round(fetch_s, 2)
    timings["imagery_wait_after_dem_s"] = round(time.perf_counter() - t0, 2)

    t0 = time.perf_counter()
    lut = _gamma_lut()
    ortho_full = resample_mosaic_to_bbox(mosaic, ortho_bounds, bbox, tier.ortho_size, "pixel", out_dtype=np.uint8)
    ortho_fb = resample_mosaic_to_bbox(mosaic, ortho_bounds, bbox, tier.fallback_size, "pixel", out_dtype=np.uint8)
    del mosaic
    timings["imagery_resample_s"] = round(time.perf_counter() - t0, 2)

    # 4. Canopy index and sun estimate from the imagery (before the display tone curve).
    t0 = time.perf_counter()
    aux_rgb = np.asarray(
        Image.fromarray(ortho_full).resize((n_aux, n_aux), Image.BOX), dtype=np.uint8
    )
    tex = ortho_texture(ortho_full, n_aux)
    slope_deg = np.degrees(np.arccos(np.clip(ny, 0.0, 1.0)))
    canopy = canopy_index(aux_rgb, tex, slope_deg)
    sun = estimate_sun(nx, ny, nz, aux_rgb)
    timings["canopy_sun_s"] = round(time.perf_counter() - t0, 2)
    log(f"{spec.id}: sun {sun}, canopy mean {float(canopy.mean()):.3f}")

    # 5. Encode and write. Meta goes last; its presence marks a complete pack.
    t0 = time.perf_counter()
    names = pack_file_names(tier, imagery)
    dem_name, ortho_name, fb_name, aux_name = names
    _write_atomic(_pack_file_path(spec, dem_name, cache_dir), dem_n.tobytes(order="C"))
    _save_image_atomic(
        Image.fromarray(lut[ortho_full]), _pack_file_path(spec, ortho_name, cache_dir),
        format="JPEG", quality=ORTHO_JPEG_QUALITY, subsampling=2, optimize=True,
    )
    _save_image_atomic(
        Image.fromarray(lut[ortho_fb]), _pack_file_path(spec, fb_name, cache_dir),
        format="JPEG", quality=ORTHO_JPEG_QUALITY, subsampling=2, optimize=True,
    )
    rgba = encode_aux(nx, nz, svf, canopy)
    _save_image_atomic(Image.fromarray(rgba, mode="RGBA"), _pack_file_path(spec, aux_name, cache_dir), format="PNG", compress_level=6)
    timings["encode_s"] = round(time.perf_counter() - t0, 2)

    files_info = {}
    for name in names:
        p = _pack_file_path(spec, name, cache_dir)
        files_info[name] = {"bytes": p.stat().st_size, "sha256": _sha256(p)}

    timings["total_s"] = round(time.perf_counter() - t_all, 2)
    meta: dict[str, Any] = {
        "version": PACK_VERSION,
        "tier": tier.name,
        "imagery": imagery,
        "region_id": spec.id,
        "bbox": [bbox.west, bbox.south, bbox.east, bbox.north],
        "grid": {
            "row0": "north",
            "col0": "west",
            "dem_registration": "node (sample 0 and n-1 on the bbox edges, like dem_hires_f32.bin)",
            "texture_registration": "pixel (texel centers at (i + 0.5) / n)",
            "normal_frame": "x east, y up, z south; true scale; packed n * 0.5 + 0.5",
        },
        "extent_km": [round(spec.width_km, 2), round(spec.depth_km, 2)],
        "elev_range_m": [round(float(dem_n.min()), 1), round(float(dem_n.max()), 1)],
        "dem": {
            "name": dem_name, "size": tier.dem_size, "format": "f32le", "source": "aws_terrarium",
            "zoom": dem_zoom, "detail_check": detail_check,
        },
        "ortho": {
            "name": ortho_name, "size": tier.ortho_size, "zoom": z,
            "gsd_m": round(ground_px_m(bbox.center_lat, z), 2),
            "source": source.key, "attribution": source.attribution,
            "jpeg_quality": ORTHO_JPEG_QUALITY, "chroma": "4:2:0",
            "tone": {"gamma": ORTHO_COLOR_GAMMA, "contrast": ORTHO_COLOR_CONTRAST},
        },
        "ortho_fallback": {"name": fb_name, "size": tier.fallback_size, "zoom": z},
        "aux": {
            "name": aux_name, "size": n_aux, "channels": dict(AUX_CHANNELS),
            "sky_view": {"radius_m": AO_RADIUS_M, "azimuths": AO_AZIMUTHS, "steps": AO_STEPS,
                          "definition": "1 - mean over azimuth of sin(max(0, horizon elevation))"},
            "canopy": {"method": "true color heuristic: dark, green leaning, crown textured, not water, snow or cliff"},
            "stats": {
                "sky_view_mean": round(float(svf.mean()), 4), "sky_view_min": round(float(svf.min()), 4),
                "canopy_mean": round(float(canopy.mean()), 4),
            },
        },
        "sun": {**sun, "method": "best fit of DEM Lambert shading to the shading baked into the imagery"},
        "files": files_info,
        "build": {
            "built_utc": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "seconds": timings,
            "tiles": store.stats.to_dict(),
        },
    }
    _write_atomic(pack_meta_path(spec, cache_dir, imagery), (json.dumps(meta, indent=2) + "\n").encode("utf-8"))
    log(f"{spec.id}: {imagery} pack written in {timings['total_s']} s")
    return meta


# Zoom 16 detail insets ------------------------------------------------------------------------------

DETAIL_SIZE: int = 8192
DETAIL_ZOOM: int = 16


def fire_field_for(spec: RegionSpec) -> NDArray[np.float32]:
    """Time maximum of the solver's reconstructed fire intensity (channel 0) for the default run.

    The grid is the solver's 256 x 256 node grid over the region bbox, row 0 north.
    """
    from backend.model.calibrator import get_pretrained_calibrator
    from backend.model.solver import solve_region_reconstruction
    from backend.terrain.live_region import load_region_terrain

    terrain = load_region_terrain(spec, allow_network=True)
    run = solve_region_reconstruction(
        region_terrain=terrain, holdout_viirs=False, cloud_override=None, calibrator=get_pretrained_calibrator()
    )
    return run.tensor_u8[..., 0].astype(np.float32).max(axis=0) / 255.0


def build_ortho_detail(
    spec: RegionSpec,
    fire: NDArray[np.floating],
    cache_dir: Path = HIRES_REGION_CACHE_DIR,
    store: TileStore | None = None,
    log: Callable[[str], None] = _log_stderr,
    size: int = DETAIL_SIZE,
    zoom: int = DETAIL_ZOOM,
    imagery: str = DEFAULT_IMAGERY,
    index: int = 0,
    rect_image: tuple[float, float, float, float] | None = None,
    center_lonlat: tuple[float, float] | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Add (or replace) zoom 16 inset ``index`` and update the meta.

    The window is a square on the ground, ``size`` source pixels wide, snapped to the main ortho texel
    grid so its edges fall on main texel edges. Placement, first that applies: ``rect_image`` as given
    (image-space fractions, to match another pack's inset); a window centred on ``center_lonlat``; else
    the window holding the most solver fire weighted toward enclosed terrain (low sky view):
    score = fire * (0.4 + 0.6 * canyon), canyon = clip((0.95 - sky_view) / 0.4, 0, 1).
    """
    loaded = load_pack(spec, cache_dir, imagery)
    if loaded is None:
        raise RuntimeError(f"no complete pack for {spec.id}; build it first")
    meta, files = loaded
    store = store or TileStore()
    t_all = time.perf_counter()
    bbox = spec.bbox
    main_n = int(meta["ortho"]["size"])
    w_m, h_m = wgs84_bbox_dimensions_m(bbox)
    gsd = ground_px_m(bbox.center_lat, zoom)
    side_m = size * gsd
    w_px = int(round(side_m / w_m * main_n))
    h_px = int(round(side_m / h_m * main_n))

    fire = np.asarray(fire, dtype=np.float64)
    n_f = fire.shape[0]
    if rect_image is not None:
        rect = tuple(float(v) for v in rect_image)
        w_px = int(round((rect[2] - rect[0]) * main_n))
        h_px = int(round((rect[3] - rect[1]) * main_n))
        rule = "matches the rect of another pack's inset (same ground for a like for like comparison)"
    else:
        if center_lonlat is not None:
            lon, lat = center_lonlat
            cx = (lon - bbox.west) / (bbox.east - bbox.west)
            cy = (bbox.north - lat) / (bbox.north - bbox.south)
            x0 = min(max(cx - w_px / main_n / 2.0, 0.0), 1.0 - w_px / main_n)
            y0 = min(max(cy - h_px / main_n / 2.0, 0.0), 1.0 - h_px / main_n)
            rule = f"centred on lon {lon}, lat {lat}" + (f" ({label})" if label else "")
        else:
            with Image.open(files[meta["aux"]["name"]]) as img:
                svf = np.asarray(img, dtype=np.float64)[..., 2] / 255.0
            svf_small = np.asarray(Image.fromarray((svf * 255).astype(np.uint8)).resize((n_f, n_f), Image.BOX), dtype=np.float64) / 255.0
            canyon = np.clip((0.95 - svf_small) / 0.4, 0.0, 1.0)
            score = fire * (0.4 + 0.6 * canyon)
            x0, y0, _x1, _y1 = choose_detail_window(score, w_px / main_n, h_px / main_n)
            rule = "max of solver fire (time max of channel 0, default run) x (0.4 + 0.6 x canyon from sky view)"
        px0 = min(max(int(round(x0 * main_n)), 0), main_n - w_px)
        py0 = min(max(int(round(y0 * main_n)), 0), main_n - h_px)
        rect = (px0 / main_n, py0 / main_n, (px0 + w_px) / main_n, (py0 + h_px) / main_n)
    sub = BoundingBox(
        west=bbox.west + rect[0] * (bbox.east - bbox.west),
        south=bbox.north - rect[3] * (bbox.north - bbox.south),
        east=bbox.west + rect[2] * (bbox.east - bbox.west),
        north=bbox.north - rect[1] * (bbox.north - bbox.south),
    )
    captured = float(fire[int(rect[1] * (n_f - 1)) : int(rect[3] * (n_f - 1)) + 1, int(rect[0] * (n_f - 1)) : int(rect[2] * (n_f - 1)) + 1].sum())
    log(f"{spec.id}: detail rect (image space) {rect}, {w_px} x {h_px} main texels, fire share {captured / max(fire.sum(), 1e-9):.2f}")

    bounds = tile_bounds_for_bbox(sub, zoom=zoom, margin_px=2.0 * max(1.0, source_step(sub, zoom, size)) + 6.0)
    log(f"{spec.id}: detail imagery z{zoom}, {bounds.total_tiles} tiles")
    t0 = time.perf_counter()
    mosaic = store.fetch_mosaic(IMAGERY_SOURCES[imagery], bounds, placeholder_fill=True)
    fetch_s = round(time.perf_counter() - t0, 2)
    t0 = time.perf_counter()
    detail = resample_mosaic_to_bbox(mosaic, bounds, sub, size, "pixel", out_dtype=np.uint8)
    del mosaic
    name = f"{_name_prefix(imagery)}ortho_detail_{index}.jpg"  # a rerun with the same index replaces it
    path = _pack_file_path(spec, name, cache_dir)
    _save_image_atomic(
        Image.fromarray(_gamma_lut()[detail]), path, format="JPEG", quality=ORTHO_JPEG_QUALITY, subsampling=2, optimize=True
    )
    encode_s = round(time.perf_counter() - t0, 2)

    entry = {
        "name": name,
        "size": size,
        "zoom": zoom,
        "gsd_m": round(gsd, 2),
        "uv_rect": image_rect_to_uv(rect),
        "rect_image": [round(v, 9) for v in rect],
        "bbox": [sub.west, sub.south, sub.east, sub.north],
        "main_texels": [w_px, h_px],
        "selection": {
            "rule": rule,
            "fire_share": round(captured / max(float(fire.sum()), 1e-9), 3),
        },
        "build": {"fetch_s": fetch_s, "resample_encode_s": encode_s, "total_s": round(time.perf_counter() - t_all, 2),
                  "tiles": store.stats.to_dict()},
    }
    others = [d for d in (meta.get("ortho_detail") or []) if d["name"] != name]
    meta["ortho_detail"] = sorted(others + [entry], key=lambda d: d["name"])
    meta["files"][name] = {"bytes": path.stat().st_size, "sha256": _sha256(path)}
    _write_atomic(pack_meta_path(spec, cache_dir, imagery), (json.dumps(meta, indent=2) + "\n").encode("utf-8"))
    log(f"{spec.id}: wrote {name} ({meta['files'][name]['bytes']} B) in {entry['build']['total_s']} s")
    return entry


# Context terrain ------------------------------------------------------------------------------------


def context_bbox(bbox: BoundingBox, scale: int = CONTEXT_SCALE) -> BoundingBox:
    """Same centre, each side ``scale`` times the pack's, so the pack is the central 1/scale on each axis."""
    return expand_bbox(bbox, (scale - 1) / 2.0)


def context_elevation(raw: NDArray[np.floating]) -> NDArray[np.float32]:
    """Terrarium metres to context DEM metres, the pack's encoding and datum: values at or below 0 m and
    missing data (NaN) become 0 m, land keeps its elevation, capped at 8850 m like the pack."""
    e = np.asarray(raw, dtype=np.float64)
    e = np.where(np.isfinite(e), e, 0.0)
    return np.clip(e, 0.0, 8850.0).astype("<f4")


# At the context zooms Terrarium gives open sea as exactly 0 m with noise of a few metres either way (Evia
# source: 44.6 % of pixels exactly 0, sea values from -34 m to under +0.5 m), not as bathymetry. Resampling
# leaves sea posts next to a coast a few centimetres above 0, so sea is grown from the posts Terrarium puts
# at or below 0 through posts below this height, and set to exactly 0 m.
SEA_SNAP_M: float = 0.5


def _grow(seed: NDArray[np.bool_], mask: NDArray[np.bool_]) -> NDArray[np.bool_]:
    """Cells of ``mask`` joined to ``seed & mask`` through ``mask`` (4 neighbours), by repeated dilation."""
    reach = seed & mask
    while True:
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]
        grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        grown &= mask
        if np.array_equal(grown, reach):
            return reach
        reach = grown


def _edge_connected(mask: NDArray[np.bool_]) -> NDArray[np.bool_]:
    """Cells of ``mask`` joined to the grid edge through ``mask``."""
    edge = np.zeros_like(mask)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    return _grow(edge, mask)


def context_sea_mask(raw: NDArray[np.floating], dem: NDArray[np.floating], snap_m: float = SEA_SNAP_M) -> NDArray[np.bool_]:
    """Sea posts: below ``snap_m`` and joined through posts below ``snap_m`` to a post whose resampled
    Terrarium value (``raw``, not clipped) is at or below 0 m. ``dem`` is the grid resampled from the
    source with sea at 0 m. Land is never lowered by more than ``snap_m``."""
    low = np.asarray(dem, dtype=np.float64) < snap_m
    return _grow(np.asarray(raw, dtype=np.float64) <= 0.0, low)


def _bilinear(grid: NDArray[np.floating], rows: NDArray[np.floating], cols: NDArray[np.floating]) -> NDArray[np.float64]:
    g = np.asarray(grid, dtype=np.float64)
    r = np.asarray(rows, dtype=np.float64)
    c = np.asarray(cols, dtype=np.float64)
    r0 = np.clip(np.floor(r).astype(np.int64), 0, g.shape[0] - 2)
    c0 = np.clip(np.floor(c).astype(np.int64), 0, g.shape[1] - 2)
    fr = r - r0
    fc = c - c0
    return (
        g[r0, c0] * (1 - fr) * (1 - fc) + g[r0, c0 + 1] * (1 - fr) * fc
        + g[r0 + 1, c0] * fr * (1 - fc) + g[r0 + 1, c0 + 1] * fr * fc
    )


def _pack_to_context_index(i: NDArray[np.floating], n_pack: int, n_ctx: int, scale: int) -> NDArray[np.float64]:
    """Context node coordinate of pack node coordinate ``i`` (both node registered, same axis)."""
    lo = (scale - 1) / (2.0 * scale)
    return (lo + np.asarray(i, dtype=np.float64) / (n_pack - 1) / scale) * (n_ctx - 1)


def _ring(n: int, k: int = 0) -> tuple[NDArray[np.int64], NDArray[np.int64], NDArray[np.int64]]:
    """(row, col, side) of the nodes on the square ring ``k`` nodes in from the edge of an n x n grid,
    each once, clockwise from the north west corner; side 0 north, 1 east, 2 south, 3 west."""
    m = n - 2 * k
    i = np.arange(m - 1)
    rows = np.concatenate([np.zeros(m - 1), i, np.full(m - 1, m - 1), m - 1 - i]) + k
    cols = np.concatenate([i, np.full(m - 1, m - 1), m - 1 - i, np.zeros(m - 1)]) + k
    side = np.repeat(np.arange(4), m - 1)
    return rows.astype(np.int64), cols.astype(np.int64), side.astype(np.int64)


def context_border_mismatch(
    pack_dem: NDArray[np.floating], ctx_dem: NDArray[np.floating], scale: int = CONTEXT_SCALE
) -> dict[str, Any]:
    """Context DEM (bilinear between its posts) minus pack DEM at every pack border node, in metres.

    ``land_*`` repeats the statistics over the border nodes where either DEM is above 0 m, since a border
    that runs through sea (Evia) is 0 against 0 there and would pull the median to 0.
    """
    pack = np.asarray(pack_dem, dtype=np.float64)
    ctx = np.asarray(ctx_dem, dtype=np.float64)
    n, m = pack.shape[0], ctx.shape[0]
    r, c, side = _ring(n)
    at = _bilinear(ctx, _pack_to_context_index(r, n, m, scale), _pack_to_context_index(c, n, m, scale))
    diff = at - pack[r, c]
    a = np.abs(diff)
    worst = int(np.argmax(a))
    land = (pack[r, c] > 0.0) | (at > 0.0)
    sides = ("north", "east", "south", "west")
    return {
        "nodes": int(diff.size),
        "median_abs_m": round(float(np.median(a)), 2),
        "p95_abs_m": round(float(np.percentile(a, 95)), 2),
        "worst_abs_m": round(float(a[worst]), 2),
        "worst_at": {"side": sides[int(side[worst])], "pack_row": int(r[worst]), "pack_col": int(c[worst]),
                      "context_minus_pack_m": round(float(diff[worst]), 2)},
        "median_signed_m": round(float(np.median(diff)), 2),
        "by_side_median_abs_m": {sides[s]: round(float(np.median(a[side == s])), 2) for s in range(4)},
        "land_nodes": int(land.sum()),
        "land_median_abs_m": round(float(np.median(a[land])), 2) if land.any() else 0.0,
        "land_p95_abs_m": round(float(np.percentile(a[land], 95)), 2) if land.any() else 0.0,
    }


def _phase_shift(a: NDArray[np.floating], b: NDArray[np.floating]) -> tuple[float, float]:
    """Sub-pixel (row, col) shift of ``b`` relative to ``a``, phase correlation of gradient magnitude."""

    def prep(x: NDArray[np.floating]) -> NDArray[np.float64]:
        gy, gx = np.gradient(np.asarray(x, dtype=np.float64))
        g = np.hypot(gx, gy)
        g -= g.mean()
        return g * np.outer(np.hanning(x.shape[0]), np.hanning(x.shape[1]))

    cross = np.fft.fft2(prep(b)) * np.conj(np.fft.fft2(prep(a)))
    cross /= np.maximum(np.abs(cross), 1e-12)
    corr = np.fft.ifft2(cross).real
    peak = np.unravel_index(int(np.argmax(corr)), corr.shape)
    out = []
    for axis, p in enumerate(peak):
        n = corr.shape[axis]
        im, ip = list(peak), list(peak)
        im[axis] = (p - 1) % n
        ip[axis] = (p + 1) % n
        cm, c0, cp = corr[tuple(im)], corr[peak], corr[tuple(ip)]
        den = cm - 2 * c0 + cp
        s = p + (0.5 * (cm - cp) / den if abs(den) > 1e-12 else 0.0)
        out.append(float(s - n if s > n / 2 else s))
    return out[0], out[1]


def context_registration(
    pack_dem: NDArray[np.floating], ctx_dem: NDArray[np.floating], scale: int = CONTEXT_SCALE
) -> dict[str, Any]:
    """The context posts inside the pack against the pack resampled to those posts with the same widened
    kernel the builder uses (so resolution cancels), keeping only posts whose kernel lies inside the pack.
    The shift is in context cells; the RMSE and bias are what is left of source and kernel differences."""
    pack = np.asarray(pack_dem, dtype=np.float64)
    ctx = np.asarray(ctx_dem, dtype=np.float64)
    n, m = pack.shape[0], ctx.shape[0]
    step = scale * (n - 1) / (m - 1)  # pack cells per context cell
    reach = 2.0 * step + 1.0  # kernel radius plus one tap
    lo = (scale - 1) / (2.0 * scale) * (m - 1)
    j = np.arange(int(math.ceil(lo)), int(math.floor(lo + (m - 1) / scale)) + 1)
    p = (j / (m - 1) - (scale - 1) / (2.0 * scale)) * scale * (n - 1)
    keep = (p - reach >= 0.0) & (p + reach <= n - 1)
    j, p = j[keep], p[keep]
    w = axis_weights(p, n)
    ref = resample_separable(pack.astype(np.float32), w, w).astype(np.float64)
    sub = ctx[j[0] : j[-1] + 1, j[0] : j[-1] + 1]
    sr, sc = _phase_shift(ref, sub)
    d = sub - ref
    land = (ref > 0.5) | (sub > 0.0)
    return {
        "posts": int(j.size),
        "first_post": int(j[0]),
        "shift_rows_cells": round(sr, 4),
        "shift_cols_cells": round(sc, 4),
        "rmse_m": round(float(np.sqrt(np.mean(d**2))), 2),
        "bias_m": round(float(np.mean(d)), 2),
        "land_share": round(float(land.mean()), 4),
        "land_rmse_m": round(float(np.sqrt(np.mean(d[land] ** 2))), 2) if land.any() else 0.0,
    }


def _srgb_to_lab(rgb: NDArray[np.floating]) -> NDArray[np.float64]:
    """sRGB 0..255 to CIELAB (D65)."""
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def context_colour_check(pack_ortho: Path, ctx_ortho: Path, scale: int = CONTEXT_SCALE) -> dict[str, Any]:
    """Mean sRGB of the pack ortho and of the context ortho over the pack rectangle (texels whose centres
    fall inside it), their CIELAB difference, the same over the outer tenth of the rectangle (where a
    consumer blends), and the luminance correlation of the two on the context texel grid."""
    with Image.open(ctx_ortho) as img:
        ctx = np.asarray(img.convert("RGB"), dtype=np.float64)
    n = ctx.shape[0]
    i0 = int(math.ceil((scale - 1) / (2.0 * scale) * n - 0.5))
    i1 = int(math.floor((scale + 1) / (2.0 * scale) * n - 0.5))
    crop = ctx[i0 : i1 + 1, i0 : i1 + 1]
    k = crop.shape[0]
    with Image.open(pack_ortho) as img:
        pack = np.asarray(img.convert("RGB").resize((k, k), Image.BOX), dtype=np.float64)
    band = np.zeros((k, k), dtype=bool)
    w = max(1, k // 10)
    band[:w, :] = band[-w:, :] = band[:, :w] = band[:, -w:] = True

    def mean(a: NDArray[np.float64], mask: NDArray[np.bool_] | None = None) -> list[float]:
        v = a.reshape(-1, 3) if mask is None else a[mask]
        return [round(float(x), 1) for x in v.mean(axis=0)]

    def de(a: list[float], b: list[float]) -> float:
        return round(float(np.linalg.norm(_srgb_to_lab(np.array(a)) - _srgb_to_lab(np.array(b)))), 2)

    pm, cm = mean(pack), mean(crop)
    pb, cb = mean(pack, band), mean(crop, band)
    lum_p = pack @ np.array([0.2126, 0.7152, 0.0722])
    lum_c = crop @ np.array([0.2126, 0.7152, 0.0722])
    return {
        "texels": [i0, i1 + 1],
        "pack_mean_srgb": pm,
        "context_mean_srgb": cm,
        "context_minus_pack_srgb": [round(c - p, 1) for c, p in zip(cm, pm)],
        "delta_e76_of_means": de(cm, pm),
        "edge_band_pack_mean_srgb": pb,
        "edge_band_context_mean_srgb": cb,
        "edge_band_delta_e76": de(cb, pb),
        "lum_corr": round(float(np.corrcoef(lum_p.ravel(), lum_c.ravel())[0, 1]), 4),
    }


def build_context(
    spec: RegionSpec,
    cache_dir: Path = HIRES_REGION_CACHE_DIR,
    store: TileStore | None = None,
    log: Callable[[str], None] = _log_stderr,
    max_tiles: int = CONTEXT_MAX_TILES,
) -> dict[str, Any]:
    """Build the context DEM and ortho around the default imagery pack of ``spec`` and add them to its meta.

    Same DEM source (AWS Terrarium) and imagery source (the pack's) as the pack, through the same polite
    tile store. The DEM zoom is the lowest whose pixel is a third of the context post spacing or finer.
    """
    loaded = load_pack(spec, cache_dir)
    if loaded is None:
        raise RuntimeError(f"no complete pack for {spec.id}; build it first")
    meta, files = loaded
    src = SOURCES_BY_KEY.get(meta["ortho"]["source"])
    if src is None or src.key not in IMAGERY_SOURCES:
        raise RuntimeError(f"{spec.id}: pack imagery {meta['ortho']['source']} has no context source")
    store = store or TileStore()
    t_all = time.perf_counter()
    timings: dict[str, float] = {}
    bbox = spec.bbox
    ctx = context_bbox(bbox)
    n_dem, n_ortho, z_o = CONTEXT_DEM_SIZE, CONTEXT_ORTHO_SIZE, CONTEXT_ORTHO_ZOOM
    w_m, h_m = wgs84_bbox_dimensions_m(ctx)
    post_m = min(w_m, h_m) / (n_dem - 1)
    z_d = next((z for z in range(8, 15) if ground_px_m(ctx.center_lat, z) <= post_m / 3.0), 14)
    dem_bounds = tile_bounds_for_bbox(ctx, zoom=z_d, margin_px=2.0 * max(1.0, source_step(ctx, z_d, n_dem)) + 6.0)
    ortho_bounds = tile_bounds_for_bbox(ctx, zoom=z_o, margin_px=2.0 * max(1.0, source_step(ctx, z_o, n_ortho)) + 6.0)
    planned = dem_bounds.total_tiles + ortho_bounds.total_tiles
    if planned > max_tiles:
        raise RuntimeError(f"{spec.id}: context needs {planned} tiles, over the cap of {max_tiles}")
    log(f"{spec.id}: context Terrarium z{z_d} {dem_bounds.total_tiles} tiles, {src.key} z{z_o} {ortho_bounds.total_tiles} tiles")

    t_img = time.perf_counter()
    img_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="context-imagery")
    img_future = img_pool.submit(lambda: (store.fetch_mosaic(src, ortho_bounds, placeholder_fill=True), time.perf_counter() - t_img))

    # DEM. Values at or below 0 m are set to 0 in the source before resampling, so no negative value pulls
    # a coast down; then sea posts (context_sea_mask) are set to exactly 0 m and the cubic kernel's slight
    # ringing below 0 next to a coast is clipped.
    t0 = time.perf_counter()
    elev = decode_terrarium_rgb(store.fetch_mosaic(TERRARIUM, dem_bounds)).astype(np.float32)
    timings["dem_fetch_s"] = round(time.perf_counter() - t0, 2)
    t0 = time.perf_counter()
    raw = resample_mosaic_to_bbox(elev, dem_bounds, ctx, n_dem, "node")
    smooth = resample_mosaic_to_bbox(context_elevation(elev), dem_bounds, ctx, n_dem, "node")
    sea = context_sea_mask(raw, smooth)
    dem = context_elevation(smooth)
    snapped = sea & (dem > 0.0)
    max_snap = float(dem[snapped].max()) if snapped.any() else 0.0
    dem[sea] = 0.0
    sea_open = _edge_connected(sea)
    timings["dem_resample_s"] = round(time.perf_counter() - t0, 2)

    t0 = time.perf_counter()
    try:
        mosaic, fetch_s = img_future.result()
    finally:
        img_pool.shutdown(wait=True)
    timings["imagery_fetch_s"] = round(fetch_s, 2)
    timings["imagery_wait_after_dem_s"] = round(time.perf_counter() - t0, 2)
    t0 = time.perf_counter()
    ortho = resample_mosaic_to_bbox(mosaic, ortho_bounds, ctx, n_ortho, "pixel", out_dtype=np.uint8)
    del mosaic
    timings["imagery_resample_s"] = round(time.perf_counter() - t0, 2)

    t0 = time.perf_counter()
    dem_name, ortho_name = CONTEXT_FILE_NAMES
    _write_atomic(_pack_file_path(spec, dem_name, cache_dir), dem.tobytes(order="C"))
    _save_image_atomic(
        Image.fromarray(_gamma_lut()[ortho]), _pack_file_path(spec, ortho_name, cache_dir),
        format="JPEG", quality=ORTHO_JPEG_QUALITY, subsampling=2, optimize=True,
    )
    timings["encode_s"] = round(time.perf_counter() - t0, 2)

    t0 = time.perf_counter()
    pack_dem = np.fromfile(files[meta["dem"]["name"]], dtype="<f4").reshape(meta["dem"]["size"], meta["dem"]["size"])
    checks = {
        "border": context_border_mismatch(pack_dem, dem),
        "registration": context_registration(pack_dem, dem),
        "colour": context_colour_check(files[meta["ortho"]["name"]], _pack_file_path(spec, ortho_name, cache_dir)),
    }
    timings["checks_s"] = round(time.perf_counter() - t0, 2)
    timings["total_s"] = round(time.perf_counter() - t_all, 2)

    dx_rows, dy = row_spacing_m(ctx, n_ortho)
    meta["context"] = {
        "scale": CONTEXT_SCALE,
        "bbox": [ctx.west, ctx.south, ctx.east, ctx.north],
        "extent_km": [round(CONTEXT_SCALE * float(v), 2) for v in meta["extent_km"]],
        "grid": {
            "row0": "north",
            "col0": "west",
            "dem_registration": "node (sample 0 and n-1 on the context bbox edges)",
            "texture_registration": "pixel (texel centers at (i + 0.5) / n)",
            "pack_position": "the pack bbox is the central 1/scale of the context bbox on each axis (fractions 0.4 to 0.6)",
            "projection": "linear in longitude and latitude, as the pack",
        },
        "dem": {
            "name": dem_name, "size": n_dem, "format": "f32le", "source": "aws_terrarium", "zoom": z_d,
            "zoom_px_m": round(ground_px_m(ctx.center_lat, z_d), 2),
            "post_spacing_m": [round(w_m / (n_dem - 1), 1), round(h_m / (n_dem - 1), 1)],
            "elev_range_m": [round(float(dem.min()), 1), round(float(dem.max()), 1)],
            "sea_rule": f"a post below {SEA_SNAP_M} m joined through posts below {SEA_SNAP_M} m to a post whose "
                        "Terrarium value is at or below 0 m is sea and is 0 m exactly; Terrarium gives open sea as "
                        "0 m with noise, not bathymetry, and lakes keep their surface elevation; missing data are "
                        "0 m (a tile that fails to download stops the build instead)",
            "sea_share": round(float(np.mean(dem == 0.0)), 6),
            "sea_posts": int(sea.sum()),
            "sea_posts_not_joined_to_edge": int((sea & ~sea_open).sum()),
            "snapped_posts": int(snapped.sum()),
            "max_snap_m": round(max_snap, 3),
        },
        "ortho": {
            "name": ortho_name, "size": n_ortho, "zoom": z_o,
            "gsd_m": round(ground_px_m(ctx.center_lat, z_o), 2),
            "texel_m": [round(float(np.mean(dx_rows)), 1), round(float(dy), 1)],
            "source": src.key, "attribution": src.attribution,
            "jpeg_quality": ORTHO_JPEG_QUALITY, "chroma": "4:2:0",
            "tone": {"gamma": ORTHO_COLOR_GAMMA, "contrast": ORTHO_COLOR_CONTRAST},
        },
        "checks": checks,
        "build": {
            "built_utc": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "seconds": timings,
            "tiles_planned": {"terrarium": dem_bounds.total_tiles, src.key: ortho_bounds.total_tiles},
            "tiles": store.stats.to_dict(),
        },
    }
    for name in CONTEXT_FILE_NAMES:
        p = _pack_file_path(spec, name, cache_dir)
        meta["files"][name] = {"bytes": p.stat().st_size, "sha256": _sha256(p)}
    _write_atomic(pack_meta_path(spec, cache_dir), (json.dumps(meta, indent=2) + "\n").encode("utf-8"))
    log(f"{spec.id}: context written in {timings['total_s']} s; border {checks['border']['median_abs_m']} m median")
    return meta["context"]


# Server side manager -------------------------------------------------------------------------------


class TerrainPackManager:
    """Serves cached packs and builds missing ones one at a time on a background thread."""

    RETRY_AFTER_FAILURE_S: float = 600.0

    def __init__(self, cache_dir: Path = HIRES_REGION_CACHE_DIR, allow_build: bool = True) -> None:
        self.cache_dir = cache_dir
        self.allow_build = allow_build
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="terrain-pack")
        self._futures: dict[str, Future[dict[str, Any]]] = {}
        self._failed_at: dict[str, float] = {}

    def _key(self, spec: RegionSpec, imagery: str = DEFAULT_IMAGERY) -> str:
        return f"{region_cache_stem(spec)}_{tier_for(spec).name}_{imagery}"

    def _schedule(self, spec: RegionSpec, imagery: str = DEFAULT_IMAGERY) -> Future[dict[str, Any]] | None:
        key = self._key(spec, imagery)
        with self._lock:
            fut = self._futures.get(key)
            if fut is not None and not fut.done():
                return fut
            failed = self._failed_at.get(key)
            if failed is not None and time.monotonic() - failed < self.RETRY_AFTER_FAILURE_S:
                return None

            def _run() -> dict[str, Any]:
                try:
                    return build_terrain_pack(spec, self.cache_dir, imagery=imagery)
                except Exception:
                    with self._lock:
                        self._failed_at[key] = time.monotonic()
                    raise

            fut = self._pool.submit(_run)
            self._futures[key] = fut
            return fut

    def get(
        self,
        spec: RegionSpec,
        build_if_missing: bool = True,
        wait_s: float = 0.0,
        imagery: str = DEFAULT_IMAGERY,
    ) -> dict[str, Any] | None:
        loaded = load_pack(spec, self.cache_dir, imagery)
        if loaded is not None:
            return loaded[0]
        if not (build_if_missing and self.allow_build):
            return None
        fut = self._schedule(spec, imagery)
        if fut is not None and wait_s > 0.0:
            try:
                fut.result(timeout=wait_s)
            except Exception:  # noqa: BLE001  (timeout or build failure: serve without a pack)
                pass
        loaded = load_pack(spec, self.cache_dir, imagery)
        return loaded[0] if loaded is not None else None

    def status(self, spec: RegionSpec, imagery: str = DEFAULT_IMAGERY) -> str:
        if load_pack(spec, self.cache_dir, imagery) is not None:
            return "ready"
        key = self._key(spec, imagery)
        with self._lock:
            fut = self._futures.get(key)
            if fut is not None and not fut.done():
                return "building"
            if key in self._failed_at:
                return "failed"
        return "absent"

    def resolve_file(self, spec: RegionSpec, name: str) -> Path | None:
        return resolve_pack_file(spec, name, self.cache_dir)


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build or describe Isogon terrain packs.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="build packs for region ids or free text queries")
    b.add_argument("regions", nargs="+")
    b.add_argument("--force", action="store_true", help="rebuild even when a complete pack exists")
    b.add_argument("--rate", type=float, default=16.0, help="max tile requests per second")
    b.add_argument("--workers", type=int, default=6, help="concurrent tile requests")
    b.add_argument("--imagery", default=DEFAULT_IMAGERY, choices=sorted(IMAGERY_SOURCES))
    det = sub.add_parser("detail", help="add a zoom 16 inset (default: over the solver fire field; run after build)")
    det.add_argument("regions", nargs="+")
    det.add_argument("--rate", type=float, default=16.0, help="max tile requests per second")
    det.add_argument("--workers", type=int, default=6, help="concurrent tile requests")
    det.add_argument("--imagery", default=DEFAULT_IMAGERY, choices=sorted(IMAGERY_SOURCES))
    det.add_argument("--index", type=int, default=0, help="inset number, ortho_detail_<index>")
    det.add_argument("--center", default=None, help="'lat,lon' to centre the inset there instead of on the fire")
    det.add_argument("--label", default=None, help="place name recorded with --center")
    det.add_argument("--match-default", action="store_true",
                     help="reuse the default imagery pack's inset rect with the same index (like for like)")
    ctx_p = sub.add_parser("context", help="add the 5x context DEM and ortho around a built pack")
    ctx_p.add_argument("regions", nargs="*", default=list(HERO_REGION_IDS))
    ctx_p.add_argument("--rate", type=float, default=16.0, help="max tile requests per second")
    ctx_p.add_argument("--workers", type=int, default=6, help="concurrent tile requests")
    ctx_p.add_argument("--max-tiles", type=int, default=CONTEXT_MAX_TILES, help="refuse a region that needs more tiles")
    d = sub.add_parser("describe", help="print the terrain_pack JSON a run would carry")
    d.add_argument("region")
    d.add_argument("--run-id", default=None)
    args = parser.parse_args(argv)

    if args.cmd == "build":
        for r in args.regions:
            spec = PRESET_BY_ID.get(r) or resolve_region_request(query_text=r)
            if not args.force and load_pack(spec, imagery=args.imagery) is not None:
                _log_stderr(f"{spec.id}: {args.imagery} pack already complete, skipping (use --force to rebuild)")
                continue
            store = TileStore(max_workers=args.workers, rate_per_s=args.rate)
            meta = build_terrain_pack(spec, store=store, imagery=args.imagery)
            print(json.dumps({"region": spec.id, "seconds": meta["build"]["seconds"], "tiles": meta["build"]["tiles"],
                              "files": {k: v["bytes"] for k, v in meta["files"].items()}}, indent=2))
        return 0

    if args.cmd == "detail":
        for r in args.regions:
            spec = PRESET_BY_ID.get(r) or resolve_region_request(query_text=r)
            rect = None
            if args.match_default:
                base = load_pack(spec)
                match = [d for d in ((base or ({}, {}))[0].get("ortho_detail") or []) if d["name"] == f"ortho_detail_{args.index}.jpg"]
                if not match:
                    raise SystemExit(f"{spec.id}: the default pack has no ortho_detail_{args.index} to match")
                rect = tuple(match[0]["rect_image"])
            center = None
            if args.center:
                lat_s, lon_s = args.center.split(",")
                center = (float(lon_s), float(lat_s))
            fire = fire_field_for(spec)
            entry = build_ortho_detail(
                spec, fire, store=TileStore(max_workers=args.workers, rate_per_s=args.rate), imagery=args.imagery,
                index=args.index, rect_image=rect, center_lonlat=center, label=args.label,
            )
            print(json.dumps({"region": spec.id, "name": entry["name"], "uv_rect": entry["uv_rect"], "build": entry["build"]}, indent=2))
        return 0

    if args.cmd == "context":
        for r in args.regions:
            spec = PRESET_BY_ID.get(r) or resolve_region_request(query_text=r)
            c = build_context(spec, store=TileStore(max_workers=args.workers, rate_per_s=args.rate), max_tiles=args.max_tiles)
            print(json.dumps({"region": spec.id, "build": c["build"], "checks": c["checks"],
                              "dem": {k: c["dem"][k] for k in ("zoom", "post_spacing_m", "elev_range_m", "sea_share")}}, indent=2))
        return 0

    spec = PRESET_BY_ID.get(args.region) or resolve_region_request(query_text=args.region)
    loaded = load_pack(spec)
    if loaded is None:
        print(f"no complete pack for {spec.id}", file=sys.stderr)
        return 1
    print(json.dumps(pack_descriptor(loaded[0], args.run_id or f"{spec.id}_holdout0_cnone"), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
