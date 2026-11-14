"""Terrain pack v1 (CONTRACT section 1): ortho atlas, 1024 DEM and baked aux raster per region.

Registration. Every raster in a pack covers exactly the bbox of the region's dem_hires_f32.bin with
the same row and column order:
  row 0 is the north edge and the last row the south edge;
  column 0 is the west edge and the last column the east edge.
  dem_<n>_f32.bin is node registered like dem_hires_f32.bin: sample (0, 0) sits exactly on the
  north west corner of the bbox and sample (n - 1, n - 1) exactly on the south east corner.
  ortho_<n>.jpg and aux_<n>.png are pixel registered textures: texel (0, 0) is the north west cell of
  an n x n split of the bbox, so they line up with the DEM vertices under ordinary 0..1 plane UVs,
  exactly like the existing satellite_<ext> asset.

World frame of the aux normals: x east, y up, z south (three.js plane rotated -90 degrees about x,
north toward -z). Normals are unit vectors of the true scale terrain packed as n * 0.5 + 0.5; the
consumer rebuilds y = sqrt(1 - x^2 - z^2).

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/terrain/terrain_pack.py \
      build plumas_ca lytton_bc evia_greece
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
    expand_bbox,
    resample_mosaic_to_bbox,
    source_step,
)
from backend.terrain.tile_store import (  # noqa: E402
    EOX_S2_CLOUDLESS_2020,
    ESRI_WORLD_IMAGERY,
    TERRARIUM,
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
AUX_CHANNELS: dict[str, str] = {"r": "normal_x", "g": "normal_z", "b": "sky_view_ao", "a": "canopy_index"}

ORTHO_JPEG_QUALITY: int = 88
ORTHO_COLOR_GAMMA: float = 0.95
ORTHO_COLOR_CONTRAST: float = 1.04


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


def pack_file_names(tier: TierSpec) -> tuple[str, ...]:
    return (
        f"dem_{tier.dem_size}_f32.bin",
        f"ortho_{tier.ortho_size}.jpg",
        f"ortho_{tier.fallback_size}.jpg",
        f"aux_{tier.aux_size}.png",
    )


def _file_prefix(spec: RegionSpec, tier: TierSpec) -> str:
    return f"{region_cache_stem(spec)}_{PACK_TAG}_{tier.name}_"


def pack_meta_path(spec: RegionSpec, cache_dir: Path = HIRES_REGION_CACHE_DIR) -> Path:
    return cache_dir / f"{_file_prefix(spec, tier_for(spec))}meta.json"


def _pack_file_path(spec: RegionSpec, name: str, cache_dir: Path) -> Path:
    return cache_dir / f"{_file_prefix(spec, tier_for(spec))}{name}"


def load_pack(spec: RegionSpec, cache_dir: Path = HIRES_REGION_CACHE_DIR) -> tuple[dict[str, Any], dict[str, Path]] | None:
    """Return (meta, {served name: path}) when a complete pack for ``spec`` is on disk."""
    meta_file = pack_meta_path(spec, cache_dir)
    if not meta_file.is_file():
        return None
    try:
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if meta.get("version") != PACK_VERSION or meta.get("tier") != tier_for(spec).name:
        return None
    files: dict[str, Path] = {}
    for name, info in (meta.get("files") or {}).items():
        path = _pack_file_path(spec, name, cache_dir)
        try:
            if path.stat().st_size != int(info["bytes"]):
                return None
        except (OSError, KeyError, ValueError):
            return None
        files[name] = path
    if not all(n in files for n in pack_file_names(tier_for(spec))):
        return None
    return meta, files


def resolve_pack_file(spec: RegionSpec, name: str, cache_dir: Path = HIRES_REGION_CACHE_DIR) -> Path | None:
    """Path of a served pack file, or None for anything not listed in the pack (no traversal)."""
    loaded = load_pack(spec, cache_dir)
    if loaded is None:
        return None
    return loaded[1].get(name)


def pack_descriptor(meta: dict[str, Any], run_id: str) -> dict[str, Any]:
    """The ``assets.terrain_pack`` object of CONTRACT section 1 for one run."""
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
            "attribution": o["attribution"],
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

    Correlates high passed image luminance with high passed Lambert shading of the DEM normals over
    azimuth and elevation. Azimuth is well constrained; elevation only weakly.
    """
    n = nx.shape[0]
    f = max(1, n // work)
    m = n // f

    def ds(a: NDArray[np.floating]) -> NDArray[np.float64]:
        return np.asarray(a[: m * f, : m * f], dtype=np.float64).reshape(m, f, m, f).mean(axis=(1, 3))

    def hp(a: NDArray[np.float64]) -> NDArray[np.float64]:
        x = a - _box_mean(a, 12)
        return (x - x.mean()) / (x.std() + 1e-9)

    lum = hp(ds(rgb.astype(np.float64).mean(axis=2)))
    snx, sny, snz = ds(nx), ds(ny), ds(nz)

    def corr(az: float, el: float) -> float:
        a, e = math.radians(az), math.radians(el)
        sx, sy, sz = math.sin(a) * math.cos(e), math.sin(e), -math.cos(a) * math.cos(e)
        shade = np.maximum(0.0, snx * sx + sny * sy + snz * sz)
        return float(np.mean(hp(shade) * lum))

    best = (-2.0, 0.0, 45.0)
    for el in (20.0, 30.0, 40.0, 50.0, 60.0, 70.0):
        for az in range(0, 360, 5):
            c = corr(float(az), el)
            if c > best[0]:
                best = (c, float(az), el)
    _, az0, el0 = best
    for el in np.arange(max(10.0, el0 - 8.0), min(80.0, el0 + 8.0) + 0.1, 2.0):
        for az in np.arange(az0 - 5.0, az0 + 5.1, 1.0):
            c = corr(float(az % 360.0), float(el))
            if c > best[0]:
                best = (c, float(az % 360.0), float(el))
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
) -> dict[str, Any]:
    """Fetch, resample and bake every pack raster for ``spec``; write them and return the meta."""
    tier = tier_for(spec)
    store = store or TileStore()
    cache_dir.mkdir(parents=True, exist_ok=True)
    bbox = spec.bbox
    timings: dict[str, float] = {}
    t_all = time.perf_counter()

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

    # 3. Ortho atlas.
    t0 = time.perf_counter()
    z = tier.ortho_zoom
    step_fb = source_step(bbox, z, tier.fallback_size)
    ortho_bounds = tile_bounds_for_bbox(bbox, zoom=z, margin_px=2.0 * max(1.0, step_fb) + 6.0)
    log(f"{spec.id}: imagery z{z}, {ortho_bounds.total_tiles} tiles")
    source: TileSource = ESRI_WORLD_IMAGERY
    try:
        mosaic = store.fetch_mosaic(source, ortho_bounds, placeholder_fill=True)
    except Exception as exc:  # noqa: BLE001
        log(f"{spec.id}: Esri World Imagery failed ({exc}); using EOX Sentinel-2 cloudless")
        source = EOX_S2_CLOUDLESS_2020
        mosaic = store.fetch_mosaic(source, ortho_bounds)
    timings["imagery_fetch_s"] = round(time.perf_counter() - t0, 2)

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
    names = pack_file_names(tier)
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
    _write_atomic(pack_meta_path(spec, cache_dir), (json.dumps(meta, indent=2) + "\n").encode("utf-8"))
    log(f"{spec.id}: pack written in {timings['total_s']} s")
    return meta


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

    def _key(self, spec: RegionSpec) -> str:
        return f"{region_cache_stem(spec)}_{tier_for(spec).name}"

    def _schedule(self, spec: RegionSpec) -> Future[dict[str, Any]] | None:
        key = self._key(spec)
        with self._lock:
            fut = self._futures.get(key)
            if fut is not None and not fut.done():
                return fut
            failed = self._failed_at.get(key)
            if failed is not None and time.monotonic() - failed < self.RETRY_AFTER_FAILURE_S:
                return None

            def _run() -> dict[str, Any]:
                try:
                    return build_terrain_pack(spec, self.cache_dir)
                except Exception:
                    with self._lock:
                        self._failed_at[key] = time.monotonic()
                    raise

            fut = self._pool.submit(_run)
            self._futures[key] = fut
            return fut

    def get(self, spec: RegionSpec, build_if_missing: bool = True, wait_s: float = 0.0) -> dict[str, Any] | None:
        loaded = load_pack(spec, self.cache_dir)
        if loaded is not None:
            return loaded[0]
        if not (build_if_missing and self.allow_build):
            return None
        fut = self._schedule(spec)
        if fut is not None and wait_s > 0.0:
            try:
                fut.result(timeout=wait_s)
            except Exception:  # noqa: BLE001  (timeout or build failure: serve without a pack)
                pass
        loaded = load_pack(spec, self.cache_dir)
        return loaded[0] if loaded is not None else None

    def status(self, spec: RegionSpec) -> str:
        if load_pack(spec, self.cache_dir) is not None:
            return "ready"
        key = self._key(spec)
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
    d = sub.add_parser("describe", help="print the terrain_pack JSON a run would carry")
    d.add_argument("region")
    d.add_argument("--run-id", default=None)
    args = parser.parse_args(argv)

    if args.cmd == "build":
        for r in args.regions:
            spec = PRESET_BY_ID.get(r) or resolve_region_request(query_text=r)
            if not args.force and load_pack(spec) is not None:
                _log_stderr(f"{spec.id}: pack already complete, skipping (use --force to rebuild)")
                continue
            store = TileStore(max_workers=args.workers, rate_per_s=args.rate)
            meta = build_terrain_pack(spec, store=store)
            print(json.dumps({"region": spec.id, "seconds": meta["build"]["seconds"], "tiles": meta["build"]["tiles"],
                              "files": {k: v["bytes"] for k, v in meta["files"].items()}}, indent=2))
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
