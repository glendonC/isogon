"""Daily satellite imagery mosaic and crop over a bounding box from NASA GIBS WMTS tiles (keyless).

Fetches daily true-colour and false-colour tiles from NASA Global Imagery Browse Services
(GIBS) in CRS84 (epsg4326/best) at each layer's finest resolution level, caches every raw
tile with a <tile>.manifest.json sidecar under data/cache/gibs/, mosaics and crops them to
(west, south, east, north), and writes one output image with a <image>.manifest.json sidecar.

Supported daily layers from WMTSCapabilities.xml:
  MODIS_TERRA  TrueColor, Bands721, Bands367                  250m (level 8)  from 2000-02-24
  MODIS_AQUA   TrueColor, Bands721, Bands367                  250m (level 8)  from 2002-07-03
  VIIRS_SNPP   TrueColor, BandsM11-I2-I1, BandsM3-I3-M11      250m (level 8)  from 2015-11-24
  VIIRS_SNPP   SurfaceReflectance BandsM11-M7-M5              500m (level 7)  from 2012-01-19
  VIIRS_SNPP   SurfaceReflectance BandsI1-I2-I1               250m (level 8)  from 2012-01-19
  VIIRS_NOAA20 TrueColor, BandsM11-I2-I1, BandsM3-I3-M11      250m (level 8)  from 2018-01-05
  VIIRS_NOAA21 TrueColor, BandsM11-I2-I1, BandsM3-I3-M11      250m (level 8)  from 2023-02-10

GIBS daily CorrectedReflectance layers stitch daytime swaths from that UTC calendar day and
do not expose per-pixel observation timestamps.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import sys
from typing import Any
import zlib

import numpy as np

try:
    from PIL import Image as _PILImage
except ImportError:  # pragma: no cover - exercised when Pillow is absent in bare python3
    _PILImage = None

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.gibs_cloud import (  # noqa: E402
    GIBS_CACHE_DIR,
    GIBS_WMTS_BASE,
    LEVEL0_PIXEL_DEG,
    MEAN_DEG_LAT_KM,
    PAUSE_S,
    TILE_PX,
    USER_AGENT,
    Opener,
    _TileNotAvailable,
    _check_closed_window,
    _decode_png_stdlib,
    _default_opener,
    _normalize_box_argv,
    _now_utc,
    _read_or_fetch_cached,
    _validate_box,
    _validate_day,
    _write_atomic,
    normalize_platform,
    pixel_deg_for_level,
    pixel_km_at_latitude,
)


@dataclass(frozen=True)
class DayLayerSpec:
    platform: str
    kind: str
    layer: str
    title: str
    tile_matrix_set: str
    level: int
    ext: str
    first_day: str


DAY_LAYERS: dict[tuple[str, str], DayLayerSpec] = {
    ("MODIS_TERRA", "true_color"): DayLayerSpec(
        platform="MODIS_TERRA",
        kind="true_color",
        layer="MODIS_Terra_CorrectedReflectance_TrueColor",
        title="Corrected Reflectance (True Color, MODIS, Terra)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2000-02-24",
    ),
    ("MODIS_TERRA", "false_color"): DayLayerSpec(
        platform="MODIS_TERRA",
        kind="false_color",
        layer="MODIS_Terra_CorrectedReflectance_Bands721",
        title="Corrected Reflectance (Bands 7-2-1, MODIS, Terra)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2000-02-24",
    ),
    ("MODIS_TERRA", "bands_367"): DayLayerSpec(
        platform="MODIS_TERRA",
        kind="bands_367",
        layer="MODIS_Terra_CorrectedReflectance_Bands367",
        title="Corrected Reflectance (Bands 3-6-7, MODIS, Terra)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2000-02-24",
    ),
    ("MODIS_AQUA", "true_color"): DayLayerSpec(
        platform="MODIS_AQUA",
        kind="true_color",
        layer="MODIS_Aqua_CorrectedReflectance_TrueColor",
        title="Corrected Reflectance (True Color, MODIS, Aqua)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2002-07-03",
    ),
    ("MODIS_AQUA", "false_color"): DayLayerSpec(
        platform="MODIS_AQUA",
        kind="false_color",
        layer="MODIS_Aqua_CorrectedReflectance_Bands721",
        title="Corrected Reflectance (Bands 7-2-1, MODIS, Aqua)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2002-07-03",
    ),
    ("MODIS_AQUA", "bands_367"): DayLayerSpec(
        platform="MODIS_AQUA",
        kind="bands_367",
        layer="MODIS_Aqua_CorrectedReflectance_Bands367",
        title="Corrected Reflectance (Bands 3-6-7, MODIS, Aqua)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2002-07-03",
    ),
    ("VIIRS_SNPP", "true_color"): DayLayerSpec(
        platform="VIIRS_SNPP",
        kind="true_color",
        layer="VIIRS_SNPP_CorrectedReflectance_TrueColor",
        title="Corrected Reflectance (True Color, VIIRS, Suomi NPP)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2015-11-24",
    ),
    ("VIIRS_SNPP", "false_color"): DayLayerSpec(
        platform="VIIRS_SNPP",
        kind="false_color",
        layer="VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1",
        title="Corrected Reflectance (M11-I2-I1, VIIRS, Suomi NPP)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2015-11-24",
    ),
    ("VIIRS_SNPP", "bands_m3_i3_m11"): DayLayerSpec(
        platform="VIIRS_SNPP",
        kind="bands_m3_i3_m11",
        layer="VIIRS_SNPP_CorrectedReflectance_BandsM3-I3-M11",
        title="Corrected Reflectance (M3-I3-M11, VIIRS, Suomi NPP)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2015-11-24",
    ),
    ("VIIRS_SNPP", "surface_false_color"): DayLayerSpec(
        platform="VIIRS_SNPP",
        kind="surface_false_color",
        layer="VIIRS_SNPP_SurfaceReflectance_BandsM11-M7-M5",
        title="Land Surface Reflectance (Bands M11-M7-M5, VIIRS, Suomi NPP)",
        tile_matrix_set="500m",
        level=7,
        ext="jpeg",
        first_day="2012-01-19",
    ),
    ("VIIRS_SNPP", "surface_i1_i2_i1"): DayLayerSpec(
        platform="VIIRS_SNPP",
        kind="surface_i1_i2_i1",
        layer="VIIRS_SNPP_SurfaceReflectance_BandsI1-I2-I1",
        title="Land Surface Reflectance (Bands I1-I2-I1 VIIRS, Suomi NPP)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2012-01-19",
    ),
    ("VIIRS_NOAA20", "true_color"): DayLayerSpec(
        platform="VIIRS_NOAA20",
        kind="true_color",
        layer="VIIRS_NOAA20_CorrectedReflectance_TrueColor",
        title="Corrected Reflectance (True Color, VIIRS, NOAA-20)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2018-01-05",
    ),
    ("VIIRS_NOAA20", "false_color"): DayLayerSpec(
        platform="VIIRS_NOAA20",
        kind="false_color",
        layer="VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1",
        title="Corrected Reflectance (Bands M11-I2-I1, VIIRS, NOAA-20)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2018-01-05",
    ),
    ("VIIRS_NOAA20", "bands_m3_i3_m11"): DayLayerSpec(
        platform="VIIRS_NOAA20",
        kind="bands_m3_i3_m11",
        layer="VIIRS_NOAA20_CorrectedReflectance_BandsM3-I3-M11",
        title="Corrected Reflectance (Bands M3-I3-M11, VIIRS, NOAA-20)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2018-01-05",
    ),
    ("VIIRS_NOAA21", "true_color"): DayLayerSpec(
        platform="VIIRS_NOAA21",
        kind="true_color",
        layer="VIIRS_NOAA21_CorrectedReflectance_TrueColor",
        title="Corrected Reflectance (True Color, VIIRS, NOAA-21)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2023-02-10",
    ),
    ("VIIRS_NOAA21", "false_color"): DayLayerSpec(
        platform="VIIRS_NOAA21",
        kind="false_color",
        layer="VIIRS_NOAA21_CorrectedReflectance_BandsM11-I2-I1",
        title="Corrected Reflectance (Bands M11-I2-I1, VIIRS, NOAA-21)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2023-02-10",
    ),
    ("VIIRS_NOAA21", "bands_m3_i3_m11"): DayLayerSpec(
        platform="VIIRS_NOAA21",
        kind="bands_m3_i3_m11",
        layer="VIIRS_NOAA21_CorrectedReflectance_BandsM3-I3-M11",
        title="Corrected Reflectance (Bands M3-I3-M11, VIIRS, NOAA-21)",
        tile_matrix_set="250m",
        level=8,
        ext="jpeg",
        first_day="2023-02-10",
    ),
}

DAY_LAYER_BY_NAME: dict[str, DayLayerSpec] = {spec.layer: spec for spec in DAY_LAYERS.values()}

_KIND_ALIASES: dict[str, str] = {
    "true_color": "true_color",
    "true": "true_color",
    "truecolor": "true_color",
    "false_color": "false_color",
    "false": "false_color",
    "falsecolor": "false_color",
    "721": "false_color",
    "bands721": "false_color",
    "m11-i2-i1": "false_color",
    "bands_367": "bands_367",
    "367": "bands_367",
    "bands_m3_i3_m11": "bands_m3_i3_m11",
    "surface_false_color": "surface_false_color",
    "surface_i1_i2_i1": "surface_i1_i2_i1",
}


def normalize_kind(kind: str) -> str:
    key = str(kind).strip().lower()
    if key not in _KIND_ALIASES:
        raise ValueError(f"unknown imagery kind {kind!r}")
    return _KIND_ALIASES[key]


def resolve_day_layer(
    *,
    platform: str = "MODIS_TERRA",
    kind: str = "true_color",
    layer: str | None = None,
) -> DayLayerSpec:
    if layer is not None:
        if layer not in DAY_LAYER_BY_NAME:
            raise ValueError(f"unsupported GIBS daily imagery layer {layer!r}")
        return DAY_LAYER_BY_NAME[layer]
    plat_norm = normalize_platform(platform)
    kind_norm = normalize_kind(kind)
    key = (plat_norm, kind_norm)
    if key not in DAY_LAYERS:
        raise ValueError(f"no GIBS daily imagery layer for platform={plat_norm!r}, kind={kind_norm!r}")
    return DAY_LAYERS[key]


def day_tile_url(spec: DayLayerSpec, day: str, row: int, col: int) -> str:
    return (
        f"{GIBS_WMTS_BASE}/{spec.layer}/default/{day}/"
        f"{spec.tile_matrix_set}/{spec.level}/{row}/{col}.{spec.ext}"
    )


def day_tile_cache_path(cache_dir: Path, spec: DayLayerSpec, day: str, row: int, col: int) -> Path:
    return (
        cache_dir
        / "tiles"
        / spec.layer
        / day
        / spec.tile_matrix_set
        / str(spec.level)
        / str(row)
        / f"{col}.{spec.ext}"
    )


def decode_tile_rgb(image_bytes: bytes) -> np.ndarray:
    """Decode JPEG or PNG tile bytes into (H, W, 3) uint8 RGB."""
    if _PILImage is not None:
        with _PILImage.open(io.BytesIO(image_bytes)) as img:
            return np.asarray(img.convert("RGB"), dtype=np.uint8)
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return _decode_png_stdlib(image_bytes)[:, :, :3].copy()
    raise RuntimeError("Pillow is required to decode JPEG GIBS tiles; run under an environment with Pillow installed")


def encode_png_rgb(rgb: np.ndarray) -> bytes:
    """Encode an (H, W, 3) uint8 RGB array as a valid 8-bit PNG using stdlib zlib/struct."""
    arr = np.asarray(rgb, dtype=np.uint8)
    if arr.ndim != 3 or arr.shape[2] != 3:
        raise ValueError(f"expected (H, W, 3) RGB array, got {arr.shape}")
    h, w, _ = arr.shape

    def _chunk(ctype: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(ctype + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + ctype + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    scanlines = b"".join(b"\x00" + arr[y].tobytes() for y in range(h))
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            _chunk(b"IHDR", ihdr),
            _chunk(b"IDAT", zlib.compress(scanlines, level=6)),
            _chunk(b"IEND", b""),
        ]
    )


def _encode_image_bytes(rgb: np.ndarray, dest: Path) -> bytes:
    suffix = dest.suffix.lower()
    if suffix in (".jpg", ".jpeg"):
        if _PILImage is None:
            raise RuntimeError("Pillow is required to write JPEG output; use a .png output path or install Pillow")
        buf = io.BytesIO()
        _PILImage.fromarray(np.asarray(rgb, dtype=np.uint8), mode="RGB").save(buf, format="JPEG", quality=92)
        return buf.getvalue()
    if _PILImage is not None:
        buf = io.BytesIO()
        _PILImage.fromarray(np.asarray(rgb, dtype=np.uint8), mode="RGB").save(buf, format="PNG")
        return buf.getvalue()
    return encode_png_rgb(rgb)


def _default_output_path(cache_dir: Path, spec: DayLayerSpec, day: str, box: tuple[float, float, float, float]) -> Path:
    w, s, e, n = box
    box_slug = f"{w:.4f}_{s:.4f}_{e:.4f}_{n:.4f}".replace("-", "m").replace(".", "p")
    return cache_dir / "mosaics" / spec.layer / f"{spec.layer}_{day}_{box_slug}.png"


def build_day_image(
    box: tuple[float, float, float, float] | list[float],
    day: str,
    *,
    platform: str = "MODIS_TERRA",
    kind: str = "true_color",
    layer: str | None = None,
    out_path: Path | None = None,
    cache_dir: Path = GIBS_CACHE_DIR,
    opener: Opener = _default_opener,
    pause_s: float = PAUSE_S,
) -> dict[str, Any]:
    """Fetch finest-level GIBS tiles over ``box`` on UTC ``day``, mosaic and crop them, and write image + manifest.

    Raises ValueError if ``day`` precedes the layer's start date or if no tiles exist on ``day``.
    """
    box_wsen = _validate_box(box)
    day_iso, start_s, end_s = _validate_day(day)
    _check_closed_window(box_wsen, start_s, end_s)

    spec = resolve_day_layer(platform=platform, kind=kind, layer=layer)
    if day_iso < spec.first_day:
        raise ValueError(f"layer {spec.layer} starts on {spec.first_day}; {day_iso} is earlier")

    w, s, e, n = box_wsen
    px_deg = pixel_deg_for_level(spec.level)
    total_cols = int(round(360.0 / px_deg))
    total_rows = int(round(180.0 / px_deg))

    eps = 1e-12
    gx0 = max(0, min(total_cols - 1, int(math.floor((w + 180.0) / px_deg))))
    gx1 = max(gx0, min(total_cols - 1, int(math.ceil((e + 180.0 - eps) / px_deg)) - 1))
    gy0 = max(0, min(total_rows - 1, int(math.floor((90.0 - n) / px_deg))))
    gy1 = max(gy0, min(total_rows - 1, int(math.ceil((90.0 - s - eps) / px_deg)) - 1))

    nx = gx1 - gx0 + 1
    ny = gy1 - gy0 + 1

    tcol0, tcol1 = gx0 // TILE_PX, gx1 // TILE_PX
    trow0, trow1 = gy0 // TILE_PX, gy1 // TILE_PX

    mosaic_rgb = np.zeros(((trow1 - trow0 + 1) * TILE_PX, (tcol1 - tcol0 + 1) * TILE_PX, 3), dtype=np.uint8)
    source_urls: list[str] = []
    tile_digests: list[dict[str, Any]] = []
    retrieved_times: list[str] = []

    cache_root = Path(cache_dir)
    for trow in range(trow0, trow1 + 1):
        for tcol in range(tcol0, tcol1 + 1):
            url = day_tile_url(spec, day_iso, trow, tcol)
            dest = day_tile_cache_path(cache_root, spec, day_iso, trow, tcol)
            query = {
                "kind": "gibs_wmts_tile",
                "epsg": "4326",
                "layer": spec.layer,
                "time": day_iso,
                "tile_matrix_set": spec.tile_matrix_set,
                "tile_matrix": spec.level,
                "tile_row": trow,
                "tile_col": tcol,
            }
            try:
                tile_bytes, tile_manifest = _read_or_fetch_cached(
                    dest=dest,
                    url=url,
                    query=query,
                    opener=opener,
                    pause_s=pause_s,
                )
            except _TileNotAvailable:
                continue

            source_urls.append(url)
            tile_digests.append(
                {
                    "url": url,
                    "tile_row": trow,
                    "tile_col": tcol,
                    "bytes": int(tile_manifest["bytes"]),
                    "sha256": str(tile_manifest["sha256"]),
                }
            )
            if tile_manifest.get("retrieved_utc"):
                retrieved_times.append(str(tile_manifest["retrieved_utc"]))

            tile_rgb = decode_tile_rgb(tile_bytes)
            if tile_rgb.shape != (TILE_PX, TILE_PX, 3):
                raise ValueError(f"expected {TILE_PX}x{TILE_PX} RGB tile from {url}, got {tile_rgb.shape}")

            oy = (trow - trow0) * TILE_PX
            ox = (tcol - tcol0) * TILE_PX
            mosaic_rgb[oy : oy + TILE_PX, ox : ox + TILE_PX] = tile_rgb

    if not source_urls:
        raise ValueError(f"GIBS returned no tiles for {spec.layer} on {day_iso}")

    sy0 = gy0 - trow0 * TILE_PX
    sx0 = gx0 - tcol0 * TILE_PX
    cropped_rgb = mosaic_rgb[sy0 : sy0 + ny, sx0 : sx0 + nx]

    target_path = Path(out_path) if out_path is not None else _default_output_path(cache_root, spec, day_iso, box_wsen)
    img_bytes = _encode_image_bytes(cropped_rgb, target_path)
    img_sha256 = hashlib.sha256(img_bytes).hexdigest()

    lat_mid = 0.5 * (s + n)
    ns_km = px_deg * MEAN_DEG_LAT_KM
    ew_km = ns_km * max(0.0, math.cos(math.radians(lat_mid)))
    px_km = pixel_km_at_latitude(spec.level, lat_mid)

    crop_bounds_wsen = [
        round(-180.0 + gx0 * px_deg, 9),
        round(90.0 - (gy1 + 1) * px_deg, 9),
        round(-180.0 + (gx1 + 1) * px_deg, 9),
        round(90.0 - gy0 * px_deg, 9),
    ]

    manifest: dict[str, Any] = {
        "layer": spec.layer,
        "title": spec.title,
        "platform": spec.platform,
        "kind": spec.kind,
        "day": day_iso,
        "tile_matrix_set": spec.tile_matrix_set,
        "level": spec.level,
        "box_wsen": list(box_wsen),
        "crop_bounds_wsen": crop_bounds_wsen,
        "width": int(nx),
        "height": int(ny),
        "pixel_km": px_km,
        "pixel_ns_km": round(ns_km, 4),
        "pixel_ew_km": round(ew_km, 4),
        "observation_hour_utc": None,
        "observation_hour_note": (
            "NASA GIBS daily composites stitch daytime swaths without per-pixel observation timestamps."
        ),
        "source_urls": source_urls,
        "digests": {d["url"]: d["sha256"] for d in tile_digests},
        "tile_digests": tile_digests,
        "output_file": target_path.name,
        "bytes": len(img_bytes),
        "sha256": img_sha256,
        "retrieved_utc": max(retrieved_times) if retrieved_times else _now_utc(),
    }

    _write_atomic(target_path, img_bytes)
    manifest_path = target_path.with_name(target_path.name + ".manifest.json")
    _write_atomic(manifest_path, (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    return manifest


def _parse_box_arg(raw: str) -> tuple[float, float, float, float]:
    parts = [float(x.strip()) for x in raw.split(",")]
    return _validate_box(parts)


def main(argv: list[str] | None = None) -> int:
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    parser = argparse.ArgumentParser(
        description="Fetch, mosaic, and crop daily NASA GIBS satellite imagery over a bounding box."
    )
    parser.add_argument(
        "--box",
        required=True,
        help="Bounding box as west,south,east,north in degrees (for example -121.44,39.86,-120.92,40.24).",
    )
    parser.add_argument("--day", required=True, help="UTC date as YYYY-MM-DD.")
    parser.add_argument(
        "--platform",
        default="MODIS_TERRA",
        help="Platform: MODIS_TERRA, MODIS_AQUA, VIIRS_SNPP, VIIRS_NOAA20, or VIIRS_NOAA21.",
    )
    parser.add_argument(
        "--kind",
        default="true_color",
        help="Imagery kind: true_color, false_color, bands_367, surface_false_color, etc.",
    )
    parser.add_argument("--layer", default=None, help="Explicit GIBS layer identifier (overrides --platform/--kind).")
    parser.add_argument("--out", type=Path, default=None, help="Output image path (.png or .jpg).")
    parser.add_argument("--cache-dir", type=Path, default=GIBS_CACHE_DIR, help="GIBS cache directory.")
    parser.add_argument("--pause-s", type=float, default=PAUSE_S, help="Pause between HTTP requests in seconds.")
    args = parser.parse_args(_normalize_box_argv(raw_argv))

    manifest = build_day_image(
        box=_parse_box_arg(args.box),
        day=args.day,
        platform=args.platform,
        kind=args.kind,
        layer=args.layer,
        out_path=args.out,
        cache_dir=args.cache_dir,
        pause_s=args.pause_s,
    )
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
