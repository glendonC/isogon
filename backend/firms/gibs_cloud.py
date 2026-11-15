"""Daily cloud share over a bounding box from NASA GIBS WMTS science tiles (keyless).

Layers and colour maps come from NASA Global Imagery Browse Services (GIBS) in CRS84
(epsg4326/best):
  Capabilities: https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml
  MODIS colour map: https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Cloud_Fraction.xml
  VIIRS colour map: https://gibs.earthdata.nasa.gov/colormaps/v1.3/VIIRS_Clear_Sky_Confidence.xml

Supported daily layers (day and night separate):
  MODIS_TERRA  MODIS_Terra_Cloud_Fraction_Day / _Night          2km (level 5)  from 2000-02-24
  MODIS_AQUA   MODIS_Aqua_Cloud_Fraction_Day / _Night           2km (level 5)  from 2002-07-03
  VIIRS_SNPP   VIIRS_SNPP_Clear_Sky_Confidence_Day / _Night     1km (level 6)  from 2012-03-01
  VIIRS_NOAA20 VIIRS_NOAA20_Clear_Sky_Confidence_Day / _Night   1km (level 6)  from 2018-02-17

VIIRS_NOAA21 has no cloud or clear-sky layer in GIBS; requests for VIIRS_NOAA21 return
share=None without guessing.

Every fetched XML colour map and PNG tile is cached under data/cache/gibs/ with a
<file>.manifest.json sidecar recording source_url, query, retrieved_utc, bytes, and sha256.
Cached files are never fetched a second time.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import datetime as _dt
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import sys
import threading
import time
from typing import Any, Callable
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zlib

import numpy as np

try:
    from PIL import Image as _PILImage
except ImportError:  # pragma: no cover - exercised when Pillow is absent in bare python3
    _PILImage = None

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.model.training import closed_for, closed_window_error  # noqa: E402
from backend.terrain.live_region import PRESET_BY_ID  # noqa: E402
from backend.terrain.resample import expand_bbox  # noqa: E402

GIBS_WMTS_BASE: str = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best"
GIBS_COLORMAP_BASE: str = "https://gibs.earthdata.nasa.gov/colormaps/v1.3"
GIBS_CACHE_DIR: Path = _REPO_ROOT / "data" / "cache" / "gibs"

# Plain generic client name: no personal name, project name, company name, or address.
USER_AGENT: str = "wmts-tile-reader/1.0"
PAUSE_S: float = 0.5
BACKOFF_BASE_S: float = 2.0
RETRIES: int = 5
RETRY_AFTER_MAX_S: float = 60.0

TILE_PX: int = 512
LEVEL0_PIXEL_DEG: float = 0.5625
MEAN_DEG_LAT_KM: float = 111.1949266

Opener = Callable[[str, dict[str, str]], tuple[int, dict[str, str], bytes]]


@dataclass(frozen=True)
class CloudLayerSpec:
    platform: str
    when: str
    layer: str
    product: str
    tile_matrix_set: str
    level: int
    colormap_name: str
    value_kind: str  # "cloud_fraction_pct" or "clear_sky_confidence"
    first_day: str


CLOUD_LAYERS: dict[tuple[str, str], CloudLayerSpec] = {
    ("MODIS_TERRA", "day"): CloudLayerSpec(
        platform="MODIS_TERRA",
        when="day",
        layer="MODIS_Terra_Cloud_Fraction_Day",
        product="NASA GIBS MODIS Terra Cloud Fraction Day (MOD06_L2, 2km daily composite)",
        tile_matrix_set="2km",
        level=5,
        colormap_name="MODIS_Cloud_Fraction.xml",
        value_kind="cloud_fraction_pct",
        first_day="2000-02-24",
    ),
    ("MODIS_TERRA", "night"): CloudLayerSpec(
        platform="MODIS_TERRA",
        when="night",
        layer="MODIS_Terra_Cloud_Fraction_Night",
        product="NASA GIBS MODIS Terra Cloud Fraction Night (MOD06_L2, 2km daily composite)",
        tile_matrix_set="2km",
        level=5,
        colormap_name="MODIS_Cloud_Fraction.xml",
        value_kind="cloud_fraction_pct",
        first_day="2000-02-24",
    ),
    ("MODIS_AQUA", "day"): CloudLayerSpec(
        platform="MODIS_AQUA",
        when="day",
        layer="MODIS_Aqua_Cloud_Fraction_Day",
        product="NASA GIBS MODIS Aqua Cloud Fraction Day (MYD06_L2, 2km daily composite)",
        tile_matrix_set="2km",
        level=5,
        colormap_name="MODIS_Cloud_Fraction.xml",
        value_kind="cloud_fraction_pct",
        first_day="2002-07-03",
    ),
    ("MODIS_AQUA", "night"): CloudLayerSpec(
        platform="MODIS_AQUA",
        when="night",
        layer="MODIS_Aqua_Cloud_Fraction_Night",
        product="NASA GIBS MODIS Aqua Cloud Fraction Night (MYD06_L2, 2km daily composite)",
        tile_matrix_set="2km",
        level=5,
        colormap_name="MODIS_Cloud_Fraction.xml",
        value_kind="cloud_fraction_pct",
        first_day="2002-07-03",
    ),
    ("VIIRS_SNPP", "day"): CloudLayerSpec(
        platform="VIIRS_SNPP",
        when="day",
        layer="VIIRS_SNPP_Clear_Sky_Confidence_Day",
        product="NASA GIBS VIIRS Suomi NPP Clear Sky Confidence Day complement (1 - clear_sky_confidence, CLDMSK_L2_VIIRS_SNPP, 1km daily composite)",
        tile_matrix_set="1km",
        level=6,
        colormap_name="VIIRS_Clear_Sky_Confidence.xml",
        value_kind="clear_sky_confidence",
        first_day="2012-03-01",
    ),
    ("VIIRS_SNPP", "night"): CloudLayerSpec(
        platform="VIIRS_SNPP",
        when="night",
        layer="VIIRS_SNPP_Clear_Sky_Confidence_Night",
        product="NASA GIBS VIIRS Suomi NPP Clear Sky Confidence Night complement (1 - clear_sky_confidence, CLDMSK_L2_VIIRS_SNPP, 1km daily composite)",
        tile_matrix_set="1km",
        level=6,
        colormap_name="VIIRS_Clear_Sky_Confidence.xml",
        value_kind="clear_sky_confidence",
        first_day="2012-03-01",
    ),
    ("VIIRS_NOAA20", "day"): CloudLayerSpec(
        platform="VIIRS_NOAA20",
        when="day",
        layer="VIIRS_NOAA20_Clear_Sky_Confidence_Day",
        product="NASA GIBS VIIRS NOAA-20 Clear Sky Confidence Day complement (1 - clear_sky_confidence, CLDMSK_L2_VIIRS_NOAA20, 1km daily composite)",
        tile_matrix_set="1km",
        level=6,
        colormap_name="VIIRS_Clear_Sky_Confidence.xml",
        value_kind="clear_sky_confidence",
        first_day="2018-02-17",
    ),
    ("VIIRS_NOAA20", "night"): CloudLayerSpec(
        platform="VIIRS_NOAA20",
        when="night",
        layer="VIIRS_NOAA20_Clear_Sky_Confidence_Night",
        product="NASA GIBS VIIRS NOAA-20 Clear Sky Confidence Night complement (1 - clear_sky_confidence, CLDMSK_L2_VIIRS_NOAA20, 1km daily composite)",
        tile_matrix_set="1km",
        level=6,
        colormap_name="VIIRS_Clear_Sky_Confidence.xml",
        value_kind="clear_sky_confidence",
        first_day="2018-02-17",
    ),
}

LAYER_BY_NAME: dict[str, CloudLayerSpec] = {spec.layer: spec for spec in CLOUD_LAYERS.values()}

_PLATFORM_ALIASES: dict[str, str] = {
    "MODIS_TERRA": "MODIS_TERRA",
    "TERRA": "MODIS_TERRA",
    "MODIS_AQUA": "MODIS_AQUA",
    "AQUA": "MODIS_AQUA",
    "VIIRS_SNPP": "VIIRS_SNPP",
    "SNPP": "VIIRS_SNPP",
    "SUOMI_NPP": "VIIRS_SNPP",
    "SUOMI NPP": "VIIRS_SNPP",
    "VIIRS_NOAA20": "VIIRS_NOAA20",
    "NOAA20": "VIIRS_NOAA20",
    "NOAA-20": "VIIRS_NOAA20",
    "JPSS1": "VIIRS_NOAA20",
    "JPSS-1": "VIIRS_NOAA20",
    "VIIRS_NOAA21": "VIIRS_NOAA21",
    "NOAA21": "VIIRS_NOAA21",
    "NOAA-21": "VIIRS_NOAA21",
    "JPSS2": "VIIRS_NOAA21",
    "JPSS-2": "VIIRS_NOAA21",
}

_WHEN_ALIASES: dict[str, str] = {
    "day": "day",
    "d": "day",
    "night": "night",
    "n": "night",
}


class _ThrottleState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.last_request_monotonic: float | None = None

    def wait(self, pause_s: float) -> None:
        if pause_s <= 0.0:
            return
        with self.lock:
            now = time.monotonic()
            if self.last_request_monotonic is not None:
                elapsed = now - self.last_request_monotonic
                if elapsed < pause_s:
                    time.sleep(pause_s - elapsed)
            self.last_request_monotonic = time.monotonic()


_THROTTLE = _ThrottleState()
_COLORMAP_CACHE: dict[tuple[str, str], tuple[dict[tuple[int, int, int], float], set[tuple[int, int, int]]]] = {}


def _now_utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write_atomic(dest: Path, payload: bytes) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(f".{dest.name}.{threading.get_ident()}.tmp")
    tmp.write_bytes(payload)
    tmp.replace(dest)


def _default_opener(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **headers})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()


def _retry_after(exc: urllib.error.HTTPError) -> float | None:
    try:
        val = float((exc.headers or {}).get("Retry-After", ""))
    except (TypeError, ValueError):
        return None
    return min(max(val, 0.0), RETRY_AFTER_MAX_S)


class _TileNotAvailable(LookupError):
    """GIBS returned HTTP 404 or 400 because no imagery exists on that date."""


def _fetch_bytes(
    url: str,
    opener: Opener,
    pause_s: float = PAUSE_S,
    retries: int = RETRIES,
) -> bytes:
    last: Exception | None = None
    for attempt in range(max(1, retries)):
        _THROTTLE.wait(pause_s)
        wait = min(30.0, BACKOFF_BASE_S * (2 ** attempt))
        try:
            status, _, body = opener(url, {})
            if status == 404:
                raise _TileNotAvailable(url)
            if status >= 400:
                raise RuntimeError(f"GIBS HTTP {status} for {url}")
            return body
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise _TileNotAvailable(url) from exc
            last = exc
            if exc.code not in (408, 429, 500, 502, 503, 504):
                break
            after = _retry_after(exc)
            if after is not None:
                wait = after
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
        if attempt + 1 < retries:
            time.sleep(wait)
    raise RuntimeError(f"GIBS request failed for {url}: {last}")


def _read_or_fetch_cached(
    dest: Path,
    url: str,
    query: dict[str, Any],
    opener: Opener,
    pause_s: float,
) -> tuple[bytes, dict[str, Any]]:
    manifest_path = dest.with_name(dest.name + ".manifest.json")
    if dest.is_file() and manifest_path.is_file():
        data = dest.read_bytes()
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        return data, manifest

    if dest.is_file() and not manifest_path.is_file():
        data = dest.read_bytes()
        manifest = {
            "source_url": url,
            "query": query,
            "retrieved_utc": _now_utc(),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        _write_atomic(manifest_path, (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
        return data, manifest

    body = _fetch_bytes(url, opener=opener, pause_s=pause_s)
    manifest = {
        "source_url": url,
        "query": query,
        "retrieved_utc": _now_utc(),
        "bytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
    }
    _write_atomic(dest, body)
    _write_atomic(manifest_path, (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    return body, manifest


def _validate_box(box: tuple[float, float, float, float] | list[float]) -> tuple[float, float, float, float]:
    if len(box) != 4:
        raise ValueError("box must be (west, south, east, north)")
    w, s, e, n = (float(box[0]), float(box[1]), float(box[2]), float(box[3]))
    if not (-180.0 <= w < e <= 180.0 and -90.0 <= s < n <= 90.0):
        raise ValueError(f"invalid box (west, south, east, north): {(w, s, e, n)}")
    return (w, s, e, n)


def _validate_day(day: str) -> tuple[str, float, float]:
    try:
        dt = _dt.date.fromisoformat(str(day).strip())
    except ValueError as exc:
        raise ValueError(f"day must be YYYY-MM-DD, got {day!r}") from exc
    start_dt = _dt.datetime(dt.year, dt.month, dt.day, tzinfo=_dt.timezone.utc)
    start_s = start_dt.timestamp()
    end_s = (start_dt + _dt.timedelta(days=1)).timestamp()
    return dt.isoformat(), start_s, end_s


def _region_context_box(region_id: str) -> tuple[float, float, float, float]:
    cb = expand_bbox(PRESET_BY_ID[region_id].bbox, 2.0)
    return (cb.west, cb.south, cb.east, cb.north)


def _check_closed_window(box: tuple[float, float, float, float], start_s: float, end_s: float) -> None:
    closed = closed_for(box, start_s, end_s, region_box=_region_context_box)
    if closed is not None:
        raise closed_window_error(closed, "no GIBS cloud query is run there")


def normalize_when(when: str) -> str:
    key = str(when).strip().lower()
    if key not in _WHEN_ALIASES:
        raise ValueError(f"when must be 'day' or 'night' (or 'D'/'N'), got {when!r}")
    return _WHEN_ALIASES[key]


def pass_when(
    day_night: str,
    time_utc: str | None = None,
    lon_deg: float | None = None,
    lat_deg: float | None = None,
) -> str:
    """Resolve a pass's half-orbit ('day' or 'night') from CMR day_night ('DAY', 'NIGHT', or 'BOTH').

    When a high-latitude granule spans the solar terminator, CMR marks day_night='BOTH'. In that
    case local solar elevation at (lon_deg, lat_deg, time_utc) determines whether the box itself
    was sunlit (altitude >= 0 deg -> 'day', else 'night').
    """
    raw = str(day_night).strip().lower()
    if raw in _WHEN_ALIASES:
        return _WHEN_ALIASES[raw]
    if raw != "both":
        raise ValueError(f"unsupported day_night value {day_night!r}")
    if time_utc is None or lon_deg is None or lat_deg is None:
        raise ValueError("time_utc, lon_deg, and lat_deg are required when day_night is 'BOTH'")

    ts = str(time_utc).strip()
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    dt = _dt.datetime.fromisoformat(ts).astimezone(_dt.timezone.utc)
    doy = dt.timetuple().tm_yday
    utc_hours = dt.hour + dt.minute / 60.0 + dt.second / 3600.0
    decl_rad = math.radians(23.44 * math.sin(2.0 * math.pi * (284 + doy) / 365.25))
    solar_hours = (utc_hours + float(lon_deg) / 15.0) % 24.0
    hour_angle_rad = math.radians(15.0 * (solar_hours - 12.0))
    lat_rad = math.radians(float(lat_deg))
    sin_alt = (
        math.sin(lat_rad) * math.sin(decl_rad)
        + math.cos(lat_rad) * math.cos(decl_rad) * math.cos(hour_angle_rad)
    )
    return "day" if sin_alt >= 0.0 else "night"


def normalize_platform(platform: str) -> str:
    key = str(platform).strip().upper()
    if key not in _PLATFORM_ALIASES:
        raise ValueError(f"unknown platform {platform!r}")
    return _PLATFORM_ALIASES[key]


def pixel_deg_for_level(level: int) -> float:
    return LEVEL0_PIXEL_DEG / float(1 << int(level))


def pixel_km_at_latitude(level: int, lat_deg: float) -> float:
    px_deg = pixel_deg_for_level(level)
    ns_km = px_deg * MEAN_DEG_LAT_KM
    ew_km = ns_km * max(0.0, math.cos(math.radians(float(lat_deg))))
    return round(math.sqrt(ns_km * ew_km), 3)


def tile_url(spec: CloudLayerSpec, day: str, row: int, col: int) -> str:
    return (
        f"{GIBS_WMTS_BASE}/{spec.layer}/default/{day}/"
        f"{spec.tile_matrix_set}/{spec.level}/{row}/{col}.png"
    )


def tile_cache_path(cache_dir: Path, spec: CloudLayerSpec, day: str, row: int, col: int) -> Path:
    return (
        cache_dir
        / "tiles"
        / spec.layer
        / day
        / spec.tile_matrix_set
        / str(spec.level)
        / str(row)
        / f"{col}.png"
    )


def colormap_url(colormap_name: str) -> str:
    return f"{GIBS_COLORMAP_BASE}/{colormap_name}"


def colormap_cache_path(cache_dir: Path, colormap_name: str) -> Path:
    return cache_dir / "colormaps" / f"v1.3_{colormap_name}"


def _parse_rgb(rgb_str: str) -> tuple[int, int, int]:
    parts = [int(p.strip()) for p in rgb_str.split(",")]
    if len(parts) != 3 or any(p < 0 or p > 255 for p in parts):
        raise ValueError(f"invalid rgb attribute {rgb_str!r}")
    return (parts[0], parts[1], parts[2])


def _parse_interval_midpoint(spec_text: str) -> float:
    s = spec_text.strip()
    if not s or s[0] not in "[(" or s[-1] not in "])":
        return float(s)
    inner = s[1:-1].strip()
    if "," not in inner:
        return float(inner)
    lo_s, hi_s = inner.split(",", 1)
    return 0.5 * (float(lo_s.strip()) + float(hi_s.strip()))


def parse_colormap_xml(
    xml_bytes: bytes,
    value_kind: str,
) -> tuple[dict[tuple[int, int, int], float], set[tuple[int, int, int]]]:
    """Decode a GIBS v1.3 ColorMap XML into (rgb_to_cloud_share, nodata_rgbs)."""
    root = ET.fromstring(xml_bytes)
    rgb_to_cloud: dict[tuple[int, int, int], float] = {}
    nodata_rgbs: set[tuple[int, int, int]] = set()

    for elem in root.iter():
        tag = elem.tag.split("}", 1)[-1]
        if tag != "ColorMapEntry":
            continue
        rgb_attr = elem.attrib.get("rgb")
        if not rgb_attr:
            continue
        rgb = _parse_rgb(rgb_attr)
        is_nodata = elem.attrib.get("nodata", "false").lower() == "true"
        is_transparent = elem.attrib.get("transparent", "false").lower() == "true"
        if is_nodata or is_transparent:
            nodata_rgbs.add(rgb)
            continue

        val_attr = elem.attrib.get("value") or elem.attrib.get("sourceValue")
        if val_attr is None:
            continue
        raw_val = _parse_interval_midpoint(val_attr)
        if value_kind == "cloud_fraction_pct":
            cloud_val = raw_val / 100.0
        elif value_kind == "clear_sky_confidence":
            cloud_val = 1.0 - raw_val
        else:
            raise ValueError(f"unsupported value_kind {value_kind!r}")
        rgb_to_cloud[rgb] = min(1.0, max(0.0, float(cloud_val)))

    if not rgb_to_cloud:
        raise ValueError("GIBS colour map held no valid ColorMapEntry values")
    return rgb_to_cloud, nodata_rgbs


def _load_colormap(
    spec: CloudLayerSpec,
    cache_dir: Path,
    opener: Opener,
    pause_s: float,
) -> tuple[dict[tuple[int, int, int], float], set[tuple[int, int, int]], str]:
    url = colormap_url(spec.colormap_name)
    dest = colormap_cache_path(cache_dir, spec.colormap_name)
    cache_key = (str(dest), spec.value_kind)
    if cache_key in _COLORMAP_CACHE and dest.is_file():
        rgb_map, nodata_set = _COLORMAP_CACHE[cache_key]
        return rgb_map, nodata_set, url

    xml_bytes, _ = _read_or_fetch_cached(
        dest=dest,
        url=url,
        query={"kind": "gibs_colormap", "version": "1.3", "name": spec.colormap_name},
        opener=opener,
        pause_s=pause_s,
    )
    rgb_map, nodata_set = parse_colormap_xml(xml_bytes, spec.value_kind)
    _COLORMAP_CACHE[cache_key] = (rgb_map, nodata_set)
    return rgb_map, nodata_set, url


def _paeth_predictor(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _decode_png_stdlib(png_bytes: bytes) -> np.ndarray:
    """Decode 8-bit non-interlaced PNG (indexed, grayscale, RGB, or RGBA) into (H, W, 4) uint8 RGBA."""
    if len(png_bytes) < 8 or png_bytes[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a valid PNG file")

    pos = 8
    width = height = bit_depth = color_type = interlace = 0
    plte: bytes = b""
    trns: bytes = b""
    idat_parts: list[bytes] = []

    while pos + 8 <= len(png_bytes):
        length, ctype = struct.unpack(">I4s", png_bytes[pos : pos + 8])
        pos += 8
        if pos + length + 4 > len(png_bytes):
            raise ValueError("truncated PNG chunk")
        cdata = png_bytes[pos : pos + length]
        pos += length + 4
        if ctype == b"IHDR":
            width, height, bit_depth, color_type, comp, filt, interlace = struct.unpack(">IIBBBBB", cdata)
            if bit_depth != 8 or comp != 0 or filt != 0 or interlace != 0:
                raise ValueError(
                    f"unsupported PNG format bit_depth={bit_depth} color_type={color_type} interlace={interlace}"
                )
        elif ctype == b"PLTE":
            plte = cdata
        elif ctype == b"tRNS":
            trns = cdata
        elif ctype == b"IDAT":
            idat_parts.append(cdata)
        elif ctype == b"IEND":
            break

    channels_by_type = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
    if color_type not in channels_by_type or width <= 0 or height <= 0:
        raise ValueError(f"unsupported PNG color_type={color_type}")
    bpp = channels_by_type[color_type]
    stride = width * bpp

    raw = zlib.decompress(b"".join(idat_parts))
    expected = height * (1 + stride)
    if len(raw) < expected:
        raise ValueError("decompressed PNG data shorter than expected")

    recon = bytearray(height * stride)
    in_off = 0
    for y in range(height):
        ftype = raw[in_off]
        in_off += 1
        row_out = y * stride
        prev_out = (y - 1) * stride
        if ftype == 0:
            recon[row_out : row_out + stride] = raw[in_off : in_off + stride]
        elif ftype == 1:
            for i in range(stride):
                left = recon[row_out + i - bpp] if i >= bpp else 0
                recon[row_out + i] = (raw[in_off + i] + left) & 0xFF
        elif ftype == 2:
            if y == 0:
                recon[row_out : row_out + stride] = raw[in_off : in_off + stride]
            else:
                for i in range(stride):
                    recon[row_out + i] = (raw[in_off + i] + recon[prev_out + i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                left = recon[row_out + i - bpp] if i >= bpp else 0
                up = recon[prev_out + i] if y > 0 else 0
                recon[row_out + i] = (raw[in_off + i] + ((left + up) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                left = recon[row_out + i - bpp] if i >= bpp else 0
                up = recon[prev_out + i] if y > 0 else 0
                up_left = recon[prev_out + i - bpp] if (y > 0 and i >= bpp) else 0
                recon[row_out + i] = (raw[in_off + i] + _paeth_predictor(left, up, up_left)) & 0xFF
        else:
            raise ValueError(f"invalid PNG filter type {ftype}")
        in_off += stride

    arr = np.frombuffer(recon, dtype=np.uint8)
    if color_type == 3:
        if not plte or len(plte) % 3 != 0:
            raise ValueError("paletted PNG missing PLTE chunk")
        n_entries = len(plte) // 3
        palette_rgba = np.zeros((256, 4), dtype=np.uint8)
        palette_rgba[:, 3] = 255
        palette_rgba[:n_entries, :3] = np.frombuffer(plte, dtype=np.uint8).reshape(n_entries, 3)
        if trns:
            n_trns = min(256, len(trns))
            palette_rgba[:n_trns, 3] = np.frombuffer(trns[:n_trns], dtype=np.uint8)
        idx = arr.reshape(height, width)
        return palette_rgba[idx]
    if color_type == 6:
        return arr.reshape(height, width, 4).copy()
    if color_type == 2:
        rgb = arr.reshape(height, width, 3)
        alpha = np.full((height, width, 1), 255, dtype=np.uint8)
        if len(trns) >= 6:
            tr, tg, tb = struct.unpack(">HHH", trns[:6])
            mask = (rgb[:, :, 0] == (tr & 0xFF)) & (rgb[:, :, 1] == (tg & 0xFF)) & (rgb[:, :, 2] == (tb & 0xFF))
            alpha[mask, 0] = 0
        return np.concatenate([rgb, alpha], axis=2)
    if color_type == 0:
        g = arr.reshape(height, width, 1)
        alpha = np.full((height, width, 1), 255, dtype=np.uint8)
        if len(trns) >= 2:
            (tg,) = struct.unpack(">H", trns[:2])
            alpha[g[:, :, 0] == (tg & 0xFF), 0] = 0
        return np.concatenate([g, g, g, alpha], axis=2)
    g = arr.reshape(height, width, 2)
    return np.concatenate([g[:, :, :1], g[:, :, :1], g[:, :, :1], g[:, :, 1:2]], axis=2)


def decode_png_rgba(png_bytes: bytes) -> np.ndarray:
    """Decode PNG bytes into (H, W, 4) uint8 RGBA using Pillow when installed, or stdlib fallback."""
    if _PILImage is not None:
        with _PILImage.open(io.BytesIO(png_bytes)) as img:
            return np.asarray(img.convert("RGBA"), dtype=np.uint8)
    return _decode_png_stdlib(png_bytes)


def encode_png_paletted(
    indices: np.ndarray,
    palette_rgb: list[tuple[int, int, int]],
    palette_alpha: list[int] | None = None,
) -> bytes:
    """Encode an 8-bit paletted PNG (used by offline unit tests and synthetic fixtures)."""
    idx = np.asarray(indices, dtype=np.uint8)
    if idx.ndim != 2:
        raise ValueError("indices must be 2D (height, width)")
    h, w = idx.shape

    def _chunk(ctype: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(ctype + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + ctype + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 3, 0, 0, 0)
    plte_bytes = bytes(c for rgb in palette_rgb for c in rgb)
    chunks = [b"\x89PNG\r\n\x1a\n", _chunk(b"IHDR", ihdr), _chunk(b"PLTE", plte_bytes)]
    if palette_alpha is not None:
        chunks.append(_chunk(b"tRNS", bytes(int(a) & 0xFF for a in palette_alpha)))
    scanlines = b"".join(b"\x00" + idx[y].tobytes() for y in range(h))
    chunks.append(_chunk(b"IDAT", zlib.compress(scanlines, level=6)))
    chunks.append(_chunk(b"IEND", b""))
    return b"".join(chunks)


def _decode_rgba_to_cloud(
    rgba: np.ndarray,
    rgb_to_cloud: dict[tuple[int, int, int], float],
    nodata_rgbs: set[tuple[int, int, int]],
) -> tuple[np.ndarray, np.ndarray]:
    """Return (cloud_values float64, valid_mask bool) for an RGBA array of shape (H, W, 4)."""
    h, w, _ = rgba.shape
    packed = (
        (rgba[:, :, 0].astype(np.uint32) << 16)
        | (rgba[:, :, 1].astype(np.uint32) << 8)
        | rgba[:, :, 2].astype(np.uint32)
    )
    alpha_ok = rgba[:, :, 3] > 0

    cloud = np.full((h, w), np.nan, dtype=np.float64)
    valid = np.zeros((h, w), dtype=bool)

    nodata_packed = {((r << 16) | (g << 8) | b) for (r, g, b) in nodata_rgbs}
    code_to_val = {((r << 16) | (g << 8) | b): val for (r, g, b), val in rgb_to_cloud.items()}

    unique_codes = np.unique(packed[alpha_ok])
    for code_u32 in unique_codes:
        code = int(code_u32)
        if code in nodata_packed:
            continue
        val = code_to_val.get(code)
        if val is None:
            continue
        hit = alpha_ok & (packed == code_u32)
        cloud[hit] = val
        valid[hit] = True
    return cloud, valid


def _box_pixel_window(
    box: tuple[float, float, float, float],
    level: int,
) -> tuple[int, int, int, int, np.ndarray]:
    """Global pixel bounds (gx0, gx1, gy0, gy1) inclusive and spherical overlap weights (ny, nx)."""
    w, s, e, n = box
    px_deg = pixel_deg_for_level(level)
    total_cols = int(round(360.0 / px_deg))
    total_rows = int(round(180.0 / px_deg))

    eps = 1e-12
    gx0 = max(0, min(total_cols - 1, int(math.floor((w + 180.0) / px_deg))))
    gx1 = max(gx0, min(total_cols - 1, int(math.ceil((e + 180.0 - eps) / px_deg)) - 1))
    gy0 = max(0, min(total_rows - 1, int(math.floor((90.0 - n) / px_deg))))
    gy1 = max(gy0, min(total_rows - 1, int(math.ceil((90.0 - s - eps) / px_deg)) - 1))

    cols = np.arange(gx0, gx1 + 1, dtype=np.float64)
    rows = np.arange(gy0, gy1 + 1, dtype=np.float64)

    lon0 = np.maximum(w, -180.0 + cols * px_deg)
    lon1 = np.minimum(e, -180.0 + (cols + 1.0) * px_deg)
    dlon = np.maximum(0.0, lon1 - lon0)

    lat_hi = np.minimum(n, 90.0 - rows * px_deg)
    lat_lo = np.maximum(s, 90.0 - (rows + 1.0) * px_deg)
    dsin_lat = np.maximum(0.0, np.sin(np.radians(lat_hi)) - np.sin(np.radians(lat_lo)))

    weights = np.outer(dsin_lat, dlon)
    if not np.any(weights > 0.0):
        weights = np.ones((len(rows), len(cols)), dtype=np.float64)
    return gx0, gx1, gy0, gy1, weights


def cloud_share(
    box: tuple[float, float, float, float] | list[float],
    day: str,
    when: str = "day",
    *,
    platform: str = "MODIS_TERRA",
    layer: str | None = None,
    cache_dir: Path = GIBS_CACHE_DIR,
    opener: Opener = _default_opener,
    pause_s: float = PAUSE_S,
) -> dict[str, Any]:
    """Return daily NASA GIBS cloud share over ``box`` (west, south, east, north) on UTC ``day``.

    Returns a dictionary with keys:
      share: float in [0.0, 1.0] or None when the layer has no valid pixels over the box that day
      pixels: count of valid data pixels intersecting the box
      no_data_pixels: count of no-data pixels intersecting the box
      layer: GIBS WMTS layer identifier (or None if the platform has no GIBS cloud layer)
      product: human-readable NASA product description and units
      pixel_km: area-equivalent ground pixel side in km at the box center latitude
      source_urls: list of GIBS URLs read (colour map XML + tile PNGs)
      retrieved_utc: latest manifest retrieval timestamp among the tiles read, or None
    """
    box_wsen = _validate_box(box)
    day_iso, start_s, end_s = _validate_day(day)
    _check_closed_window(box_wsen, start_s, end_s)
    when_norm = normalize_when(when)

    if layer is not None:
        if layer not in LAYER_BY_NAME:
            raise ValueError(f"unsupported GIBS cloud layer {layer!r}")
        spec = LAYER_BY_NAME[layer]
    else:
        plat_norm = normalize_platform(platform)
        if plat_norm == "VIIRS_NOAA21":
            return {
                "share": None,
                "pixels": 0,
                "no_data_pixels": 0,
                "layer": None,
                "product": "NASA GIBS serves no cloud or clear-sky layer for VIIRS NOAA-21",
                "pixel_km": None,
                "source_urls": [],
                "retrieved_utc": None,
            }
        spec = CLOUD_LAYERS[(plat_norm, when_norm)]

    lat_mid = 0.5 * (box_wsen[1] + box_wsen[3])
    px_km = pixel_km_at_latitude(spec.level, lat_mid)

    if day_iso < spec.first_day:
        return {
            "share": None,
            "pixels": 0,
            "no_data_pixels": 0,
            "layer": spec.layer,
            "product": spec.product,
            "pixel_km": px_km,
            "source_urls": [],
            "retrieved_utc": None,
        }

    rgb_to_cloud, nodata_rgbs, cmap_url = _load_colormap(
        spec=spec,
        cache_dir=Path(cache_dir),
        opener=opener,
        pause_s=pause_s,
    )

    gx0, gx1, gy0, gy1, weights = _box_pixel_window(box_wsen, spec.level)
    ny = gy1 - gy0 + 1
    nx = gx1 - gx0 + 1
    total_box_pixels = int(ny * nx)

    tcol0, tcol1 = gx0 // TILE_PX, gx1 // TILE_PX
    trow0, trow1 = gy0 // TILE_PX, gy1 // TILE_PX

    mosaic_rgba = np.zeros(((trow1 - trow0 + 1) * TILE_PX, (tcol1 - tcol0 + 1) * TILE_PX, 4), dtype=np.uint8)
    source_urls: list[str] = [cmap_url]
    retrieved_times: list[str] = []

    for trow in range(trow0, trow1 + 1):
        for tcol in range(tcol0, tcol1 + 1):
            url = tile_url(spec, day_iso, trow, tcol)
            dest = tile_cache_path(Path(cache_dir), spec, day_iso, trow, tcol)
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
                png_bytes, manifest = _read_or_fetch_cached(
                    dest=dest,
                    url=url,
                    query=query,
                    opener=opener,
                    pause_s=pause_s,
                )
            except _TileNotAvailable:
                continue

            source_urls.append(url)
            if manifest.get("retrieved_utc"):
                retrieved_times.append(str(manifest["retrieved_utc"]))

            tile_rgba = decode_png_rgba(png_bytes)
            if tile_rgba.shape != (TILE_PX, TILE_PX, 4):
                raise ValueError(f"expected {TILE_PX}x{TILE_PX} RGBA tile from {url}, got {tile_rgba.shape}")

            oy = (trow - trow0) * TILE_PX
            ox = (tcol - tcol0) * TILE_PX
            mosaic_rgba[oy : oy + TILE_PX, ox : ox + TILE_PX] = tile_rgba

    sy0 = gy0 - trow0 * TILE_PX
    sx0 = gx0 - tcol0 * TILE_PX
    sub_rgba = mosaic_rgba[sy0 : sy0 + ny, sx0 : sx0 + nx]

    cloud_vals, valid_mask = _decode_rgba_to_cloud(sub_rgba, rgb_to_cloud, nodata_rgbs)
    valid_pixels = int(np.count_nonzero(valid_mask))
    no_data_pixels = int(total_box_pixels - valid_pixels)
    retrieved_utc = max(retrieved_times) if retrieved_times else None

    if valid_pixels == 0:
        return {
            "share": None,
            "pixels": 0,
            "no_data_pixels": no_data_pixels,
            "layer": spec.layer,
            "product": spec.product,
            "pixel_km": px_km,
            "source_urls": source_urls,
            "retrieved_utc": retrieved_utc,
        }

    valid_weights = weights[valid_mask]
    w_sum = float(np.sum(valid_weights))
    if w_sum > 0.0:
        mean_share = float(np.sum(valid_weights * cloud_vals[valid_mask]) / w_sum)
    else:
        mean_share = float(np.mean(cloud_vals[valid_mask]))

    return {
        "share": round(mean_share, 6),
        "pixels": valid_pixels,
        "no_data_pixels": no_data_pixels,
        "layer": spec.layer,
        "product": spec.product,
        "pixel_km": px_km,
        "source_urls": source_urls,
        "retrieved_utc": retrieved_utc,
    }


def _parse_box_arg(raw: str) -> tuple[float, float, float, float]:
    parts = [float(x.strip()) for x in raw.split(",")]
    return _validate_box(parts)


def _normalize_box_argv(argv: list[str]) -> list[str]:
    out: list[str] = []
    i = 0
    while i < len(argv):
        if argv[i] == "--box" and i + 1 < len(argv) and argv[i + 1].startswith("-"):
            out.append(f"--box={argv[i + 1]}")
            i += 2
        else:
            out.append(argv[i])
            i += 1
    return out


def main(argv: list[str] | None = None) -> int:
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    parser = argparse.ArgumentParser(
        description="Read daily cloud share over a bounding box from NASA GIBS WMTS tiles."
    )
    parser.add_argument(
        "--box",
        required=True,
        help="Bounding box as west,south,east,north in degrees (for example -121.44,39.86,-120.92,40.24).",
    )
    parser.add_argument("--day", required=True, help="UTC date as YYYY-MM-DD.")
    parser.add_argument(
        "--when",
        default="day",
        help="Pass half-orbit: day or night (also accepts D or N). Default: day.",
    )
    parser.add_argument(
        "--platform",
        default="MODIS_TERRA",
        help="Platform: MODIS_TERRA, MODIS_AQUA, VIIRS_SNPP, VIIRS_NOAA20, or VIIRS_NOAA21.",
    )
    parser.add_argument("--layer", default=None, help="Explicit GIBS layer identifier (overrides --platform).")
    parser.add_argument("--cache-dir", type=Path, default=GIBS_CACHE_DIR, help="GIBS cache directory.")
    parser.add_argument("--pause-s", type=float, default=PAUSE_S, help="Pause between HTTP requests in seconds.")
    args = parser.parse_args(_normalize_box_argv(raw_argv))

    result = cloud_share(
        box=_parse_box_arg(args.box),
        day=args.day,
        when=args.when,
        platform=args.platform,
        layer=args.layer,
        cache_dir=args.cache_dir,
        pause_s=args.pause_s,
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
