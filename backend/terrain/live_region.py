"""Dynamic global region resolver, AWS Terrarium DEM + Esri World Imagery loader, and fallback."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
import hashlib
import io
import json
import math
from pathlib import Path
import re
import struct
import tempfile
import threading
import time
from typing import Any
import zlib

import numpy as np
from numpy.typing import NDArray

from backend.terrain.projections import (
    BoundingBox,
    TileGridBounds,
    decode_terrarium_rgb,
    reproject_mercator_dem_grid,
    reproject_mercator_rgb_raster,
    tile_bounds_for_bbox,
    wgs84_bbox_dimensions_m,
)

try:
    from PIL import Image
    from backend.terrain.tile_fetcher import decode_tile_rgb, fetch_tile_bytes, fetch_xyz_mosaic_rgb

    _HAS_PIL = True
except ImportError:  # pragma: no cover
    Image = None  # type: ignore[assignment]
    decode_tile_rgb = None  # type: ignore[assignment]
    fetch_tile_bytes = None  # type: ignore[assignment]
    fetch_xyz_mosaic_rgb = None  # type: ignore[assignment]
    _HAS_PIL = False

REPO_ROOT: Path = Path(__file__).resolve().parents[2]
STATIC_TERRAIN_DIR: Path = REPO_ROOT / "website" / "public" / "generated" / "terrain"
HIRES_REGION_CACHE_DIR: Path = REPO_ROOT / "data" / "cache" / "hires_regions"
REGION_CACHE_DIR: Path = HIRES_REGION_CACHE_DIR
TILE_TEMP_CACHE_DIR: Path = Path(tempfile.gettempdir()) / "isogon_terrain_tile_cache"

AWS_TERRARIUM_URL: str = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ESRI_WORLD_IMAGERY_URL: str = (
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
)
EOX_S2_2020_URL: str = (
    "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"
)

DEM_GRID_SIZE: int = 256
DEM_HIRES_SIZE: int = 512
SAT_HIRES_SIZE: int = 2048
SAT_IMAGE_SIZE: int = SAT_HIRES_SIZE

EXPECTED_DEM_BYTES: int = DEM_GRID_SIZE * DEM_GRID_SIZE * 4          # 262,144 bytes
EXPECTED_DEM_HIRES_BYTES: int = DEM_HIRES_SIZE * DEM_HIRES_SIZE * 4  # 1,048,576 bytes

DEFAULT_SPAN_LON_DEG: float = 0.52
DEFAULT_SPAN_LAT_DEG: float = 0.38

MIN_VALID_LAT: float = -60.0
MAX_VALID_LAT: float = 72.0


@dataclass(frozen=True)
class RegionSpec:
    """Resolved geographic theater specification."""

    id: str
    name: str
    subtitle: str
    biome: str
    bbox: BoundingBox
    span_lon_deg: float
    span_lat_deg: float
    is_preset: bool = False

    @property
    def center_lat(self) -> float:
        return round(self.bbox.center_lat, 5)

    @property
    def center_lon(self) -> float:
        return round(self.bbox.center_lon, 5)

    @property
    def width_km(self) -> float:
        w_m, _ = wgs84_bbox_dimensions_m(self.bbox)
        return round(w_m / 1000.0, 2)

    @property
    def depth_km(self) -> float:
        _, h_m = wgs84_bbox_dimensions_m(self.bbox)
        return round(h_m / 1000.0, 2)

    def to_summary_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "subtitle": self.subtitle,
            "biome": self.biome,
            "bbox": [
                round(self.bbox.west, 5),
                round(self.bbox.south, 5),
                round(self.bbox.east, 5),
                round(self.bbox.north, 5),
            ],
            "center_lat": self.center_lat,
            "center_lon": self.center_lon,
            "span_lon_deg": round(self.span_lon_deg, 4),
            "span_lat_deg": round(self.span_lat_deg, 4),
            "width_km": self.width_km,
            "depth_km": self.depth_km,
            "is_preset": self.is_preset,
        }


@dataclass(frozen=True)
class LoadedRegionTerrain:
    """Loaded 256x256 + 512x512 Float32 DEM and 2048x2048 RGB orthoimagery bundle."""

    spec: RegionSpec
    dem_m: NDArray[np.float32]
    dem_f32_bytes: bytes
    dem_hires_f32_bytes: bytes
    satellite_bytes: bytes
    satellite_content_type: str
    terrain_source: str
    min_elev_m: float
    max_elev_m: float
    mean_elev_m: float
    duration_ms: float

    def to_region_metadata(self) -> dict[str, Any]:
        return {
            "id": self.spec.id,
            "name": self.spec.name,
            "subtitle": self.spec.subtitle,
            "biome": self.spec.biome,
            "bbox": [
                round(self.spec.bbox.west, 5),
                round(self.spec.bbox.south, 5),
                round(self.spec.bbox.east, 5),
                round(self.spec.bbox.north, 5),
            ],
            "center_lat": self.spec.center_lat,
            "center_lon": self.spec.center_lon,
            "width_km": round(self.spec.width_km, 1),
            "depth_km": round(self.spec.depth_km, 1),
            "min_elev_m": round(self.min_elev_m, 1),
            "max_elev_m": round(self.max_elev_m, 1),
            "mean_elev_m": round(self.mean_elev_m, 1),
            "terrain_source": self.terrain_source,
            "ortho_resolution": f"{SAT_HIRES_SIZE}x{SAT_HIRES_SIZE}",
            "dem_resolution": f"{DEM_HIRES_SIZE}x{DEM_HIRES_SIZE}",
        }


def _make_bbox_from_center(
    center_lat: float,
    center_lon: float,
    span_lon_deg: float = DEFAULT_SPAN_LON_DEG,
    span_lat_deg: float = DEFAULT_SPAN_LAT_DEG,
) -> tuple[BoundingBox, float, float]:
    span_lon = float(np.clip(span_lon_deg, 0.20, 2.20))
    span_lat = float(np.clip(span_lat_deg, 0.20, 1.80))

    c_lat = float(np.clip(center_lat, MIN_VALID_LAT, MAX_VALID_LAT))
    # Wrap longitude into [-180, 180] and keep bbox away from antimeridian seam
    c_lon = ((float(center_lon) + 180.0) % 360.0) - 180.0
    half_lon = 0.5 * span_lon
    half_lat = 0.5 * span_lat

    c_lon = float(np.clip(c_lon, -179.95 + half_lon, 179.95 - half_lon))
    c_lat = float(np.clip(c_lat, -64.0 + half_lat, 74.0 - half_lat))

    bbox = BoundingBox(
        west=round(c_lon - half_lon, 6),
        south=round(c_lat - half_lat, 6),
        east=round(c_lon + half_lon, 6),
        north=round(c_lat + half_lat, 6),
    )
    bbox.validate()
    return bbox, span_lon, span_lat


PRESET_REGIONS: list[RegionSpec] = [
    RegionSpec(
        id="plumas_ca",
        name="Feather River & Plumas, CA",
        subtitle="Sierra Nevada Mixed Conifer Canyon",
        biome="temperate_conifer",
        bbox=_make_bbox_from_center(40.05, -121.18, 0.52, 0.38)[0],
        span_lon_deg=0.52,
        span_lat_deg=0.38,
        is_preset=True,
    ),
    RegionSpec(
        id="lytton_bc",
        name="Lytton & Thompson Canyon, BC",
        subtitle="Steep Coast-Interior Boreal Gorge",
        biome="boreal_montane",
        bbox=_make_bbox_from_center(50.23, -121.58, 0.54, 0.38)[0],
        span_lon_deg=0.54,
        span_lat_deg=0.38,
        is_preset=True,
    ),
    RegionSpec(
        id="novo_progresso_br",
        name="Serra do Cachimbo, Amazonia",
        subtitle="Tropical Frontier Sub-Pixel Ignition Belt",
        biome="tropical_moist",
        bbox=_make_bbox_from_center(-7.15, -55.35, 0.52, 0.38)[0],
        span_lon_deg=0.52,
        span_lat_deg=0.38,
        is_preset=True,
    ),
    RegionSpec(
        id="evia_greece",
        name="Northern Evia Island, Greece",
        subtitle="Coastal Mediterranean Pine & Marine Relief",
        biome="mediterranean",
        bbox=_make_bbox_from_center(38.86, 23.30, 0.50, 0.36)[0],
        span_lon_deg=0.50,
        span_lat_deg=0.36,
        is_preset=True,
    ),
    RegionSpec(
        id="blue_mountains_au",
        name="Grose Valley & Blue Mountains, NSW",
        subtitle="Sandstone Plateau Eucalyptus Escarpment",
        biome="temperate_broadleaf",
        bbox=_make_bbox_from_center(-33.60, 150.36, 0.52, 0.38)[0],
        span_lon_deg=0.52,
        span_lat_deg=0.38,
        is_preset=True,
    ),
]

PRESET_BY_ID: dict[str, RegionSpec] = {r.id: r for r in PRESET_REGIONS}

# Gazetteer keywords -> either preset_id (str) or (lat, lon, name, subtitle, biome)
_KEYWORD_GAZETTEER: list[tuple[tuple[str, ...], str | tuple[float, float, str, str, str]]] = [
    (("plumas", "feather river", "almanor", "dixie", "paradise", "norcal"), "plumas_ca"),
    (("lytton", "thompson", "british columbia", "fraser", "bc", "canada"), "lytton_bc"),
    (("novo progresso", "progresso", "cachimbo", "amazon", "amazonia", "brazil", "para"), "novo_progresso_br"),
    (("evia", "euboea", "greece", "aegean", "attica", "athens", "hellas"), "evia_greece"),
    (("blue mountains", "grose", "katoomba", "nsw", "sydney", "australia", "eucalyptus"), "blue_mountains_au"),
    (
        ("yosemite", "stanislaus", "tuolumne"),
        (37.74, -119.59, "Yosemite & Stanislaus Rim, CA", "Sierra Granite Gorge & Mixed Conifer", "temperate_conifer"),
    ),
    (
        ("angeles", "los angeles", "san gabriel", "eaton", "palisades", "malibu"),
        (34.22, -118.06, "San Gabriel & Angeles Crest, CA", "Steep Chaparral Front Country", "mediterranean"),
    ),
    (
        ("redding", "shasta", "whiskeytown", "trinity"),
        (40.62, -122.48, "Whiskeytown & Shasta-Trinity, CA", "Klamath-Cascade Foothill Canyon", "temperate_conifer"),
    ),
    (
        ("tahoe", "eldorado", "caldor"),
        (38.82, -120.12, "Lake Tahoe & Eldorado Crest, CA", "High Sierra Subalpine Basin", "temperate_conifer"),
    ),
    (
        ("yellowknife", "slave lake", "northwest territories", "nwt", "boreal"),
        (62.45, -114.37, "Great Slave & Yellowknife Taiga, NWT", "Precambrian Shield Boreal Forest", "boreal_montane"),
    ),
    (
        ("jasper", "banff", "athabasca", "alberta"),
        (52.87, -118.08, "Athabasca Valley & Jasper, AB", "Canadian Rockies Montane Corridor", "boreal_montane"),
    ),
    (
        ("maui", "lahaina", "hawaii"),
        (20.88, -156.65, "West Maui Mountains & Lahaina, HI", "Leeward Volcanic Grass & Ridge", "tropical_moist"),
    ),
    (
        ("chile", "valparaiso", "biobio", "vina del mar"),
        (-33.05, -71.52, "Coastal Cordillera & Valparaiso, Chile", "Mediterranean Ravine & Plantation Belt", "mediterranean"),
    ),
    (
        ("portugal", "pedrogao", "iberian", "spain", "galicia"),
        (39.95, -8.22, "Pinhal Interior & Zezere Gorge, Portugal", "Atlantic-Mediterranean Maritime Pine", "mediterranean"),
    ),
    (
        ("mediterranean", "sardinia", "corsica", "sicily"),
        (40.15, 9.35, "Gennargentu & Ogliastra, Sardinia", "Mediterranean Maquis & Limestone Relief", "mediterranean"),
    ),
    (
        ("siberia", "yakutia", "sakha", "lena"),
        (62.10, 129.70, "Central Yakutian Taiga, Sakha", "Permafrost Larch Boreal Basin", "boreal_montane"),
    ),
    (
        ("pantanal", "cerrado", "mato grosso"),
        (-17.80, -57.45, "Serra do Amolar & Upper Pantanal", "Seasonal Tropical Wetland-Savanna", "tropical_moist"),
    ),
    (
        ("angola", "zambezi", "miombo", "congo", "africa"),
        (-11.85, 20.40, "Upper Zambezi Miombo Woodlands", "Southern Hemisphere Savanna Mosaic", "tropical_moist"),
    ),
]


def infer_biome_from_coords(lat: float, lon: float) -> str:
    """Infer representative wildfire biome from WGS84 latitude and longitude."""
    abs_lat = abs(lat)
    if abs_lat < 23.5:
        return "tropical_moist"
    if abs_lat >= 48.0:
        return "boreal_montane"
    # Classic Mediterranean climate belts
    if (30.0 <= lat <= 45.0 and -10.5 <= lon <= 38.0) or (
        31.5 <= lat <= 37.0 and -123.5 <= lon <= -116.5
    ) or (-38.0 <= lat <= -30.0 and (-74.0 <= lon <= -69.5 or 114.5 <= lon <= 122.0 or 17.5 <= lon <= 25.0)):
        return "mediterranean"
    if lat < -23.5 and lon > 138.0:
        return "temperate_broadleaf"
    if -130.0 <= lon <= -104.0 and 35.0 <= lat < 48.0:
        return "temperate_conifer"
    return "temperate_broadleaf"


def _format_coord_label(lat: float, lon: float) -> str:
    ns = "N" if lat >= 0.0 else "S"
    ew = "E" if lon >= 0.0 else "W"
    return f"{abs(lat):.2f}{ns}, {abs(lon):.2f}{ew}"


def _build_custom_spec(
    lat: float,
    lon: float,
    span_lon_deg: float = DEFAULT_SPAN_LON_DEG,
    span_lat_deg: float = DEFAULT_SPAN_LAT_DEG,
    name: str | None = None,
    subtitle: str | None = None,
    biome: str | None = None,
) -> RegionSpec:
    bbox, s_lon, s_lat = _make_bbox_from_center(lat, lon, span_lon_deg, span_lat_deg)
    c_lat = bbox.center_lat
    c_lon = bbox.center_lon
    lat_tag = f"{'n' if c_lat >= 0 else 's'}{abs(c_lat):.2f}".replace(".", "p")
    lon_tag = f"{'e' if c_lon >= 0 else 'w'}{abs(c_lon):.2f}".replace(".", "p")
    resolved_biome = biome or infer_biome_from_coords(c_lat, c_lon)
    coord_str = _format_coord_label(c_lat, c_lon)
    return RegionSpec(
        id=f"custom_{lat_tag}_{lon_tag}",
        name=name or f"Custom Theater ({coord_str})",
        subtitle=subtitle or f"Dynamic Global Window / {resolved_biome.replace('_', ' ').title()}",
        biome=resolved_biome,
        bbox=bbox,
        span_lon_deg=s_lon,
        span_lat_deg=s_lat,
        is_preset=False,
    )


_COORD_TOKEN_RE = re.compile(
    r"(?P<prefix>[NSEWnsew])?\s*(?P<num>[+-]?\d+(?:\.\d+)?)\s*(?:°|deg)?\s*(?P<suffix>[NSEWnsew])?"
)


def parse_coordinates_from_text(query_text: str) -> tuple[float, float] | None:
    """Extract (lat, lon) from coordinate strings like '34.22, -118.06' or '40.05N 121.18W'."""
    cleaned = query_text.strip()
    if not cleaned:
        return None

    # Avoid misinterpreting plain single numbers or years
    matches = list(_COORD_TOKEN_RE.finditer(cleaned))
    if len(matches) < 2:
        return None

    # Require that the string looks predominantly like coordinates (or explicit lat/lon labels)
    alpha_stripped = re.sub(r"(?i)\b(lat|latitude|lon|lng|longitude|deg|custom|coords?)\b", "", cleaned)
    alpha_stripped = re.sub(r"[NSEWnsew0-9.,:;°+\-\s/()\[\]]", "", alpha_stripped)
    if len(alpha_stripped) > 3:
        return None

    t1, t2 = matches[0], matches[1]
    v1 = float(t1.group("num"))
    v2 = float(t2.group("num"))
    d1 = (t1.group("prefix") or t1.group("suffix") or "").upper()
    d2 = (t2.group("prefix") or t2.group("suffix") or "").upper()

    if d1 in ("S", "W") and v1 > 0:
        v1 = -v1
    elif d1 in ("N", "E"):
        v1 = abs(v1)

    if d2 in ("S", "W") and v2 > 0:
        v2 = -v2
    elif d2 in ("N", "E"):
        v2 = abs(v2)

    if d1 in ("E", "W") and d2 in ("N", "S"):
        lat, lon = v2, v1
    elif d1 in ("N", "S") and d2 in ("E", "W"):
        lat, lon = v1, v2
    elif abs(v1) > 90.0 and abs(v2) <= 90.0:
        lat, lon = v2, v1
    else:
        lat, lon = v1, v2

    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return None
    return lat, lon


def resolve_region_request(
    region_id: str | None = None,
    center_lat: float | None = None,
    center_lon: float | None = None,
    span_lon_deg: float | None = None,
    span_lat_deg: float | None = None,
    query_text: str | None = None,
) -> RegionSpec:
    """Resolve preset ID, free-text place/coordinate query, or explicit [lat, lon] into RegionSpec."""
    s_lon = float(span_lon_deg) if span_lon_deg is not None else DEFAULT_SPAN_LON_DEG
    s_lat = float(span_lat_deg) if span_lat_deg is not None else DEFAULT_SPAN_LAT_DEG

    if query_text is not None and query_text.strip():
        q = query_text.strip()
        q_lower = q.lower()
        if q_lower in PRESET_BY_ID and span_lon_deg is None and span_lat_deg is None:
            return PRESET_BY_ID[q_lower]

        coords = parse_coordinates_from_text(q)
        if coords is not None:
            return _build_custom_spec(coords[0], coords[1], span_lon_deg=s_lon, span_lat_deg=s_lat)

        for keywords, target in _KEYWORD_GAZETTEER:
            if any(kw in q_lower for kw in keywords):
                if isinstance(target, str):
                    preset = PRESET_BY_ID[target]
                    if span_lon_deg is None and span_lat_deg is None:
                        return preset
                    return _build_custom_spec(
                        preset.center_lat,
                        preset.center_lon,
                        span_lon_deg=s_lon,
                        span_lat_deg=s_lat,
                        name=preset.name,
                        subtitle=preset.subtitle,
                        biome=preset.biome,
                    )
                t_lat, t_lon, t_name, t_sub, t_biome = target
                return _build_custom_spec(
                    t_lat,
                    t_lon,
                    span_lon_deg=s_lon,
                    span_lat_deg=s_lat,
                    name=t_name,
                    subtitle=t_sub,
                    biome=t_biome,
                )

        raise ValueError(
            f"Could not resolve region query '{q}'. Enter coordinates like '38.86, 23.30' "
            "or '40.05N 121.18W', or a wildfire theater keyword (e.g., Lytton, Amazon, Evia, Blue Mountains, Tahoe)."
        )

    if center_lat is not None and center_lon is not None:
        if region_id and region_id in PRESET_BY_ID:
            preset = PRESET_BY_ID[region_id]
            if (
                abs(float(center_lat) - preset.center_lat) < 1e-3
                and abs(float(center_lon) - preset.center_lon) < 1e-3
                and span_lon_deg is None
                and span_lat_deg is None
            ):
                return preset
        return _build_custom_spec(float(center_lat), float(center_lon), span_lon_deg=s_lon, span_lat_deg=s_lat)

    if region_id is not None and region_id.strip():
        rid = region_id.strip().lower()
        if rid in PRESET_BY_ID:
            preset = PRESET_BY_ID[rid]
            if span_lon_deg is None and span_lat_deg is None:
                return preset
            return _build_custom_spec(
                preset.center_lat,
                preset.center_lon,
                span_lon_deg=s_lon,
                span_lat_deg=s_lat,
                name=preset.name,
                subtitle=preset.subtitle,
                biome=preset.biome,
            )
        raise ValueError(
            f"Unknown region_id '{region_id}'. Available presets: {', '.join(PRESET_BY_ID.keys())}"
        )

    return PRESET_BY_ID["plumas_ca"]


def list_preset_regions_payload() -> dict[str, Any]:
    """Return metadata payload for GET /api/regions."""
    return {
        "schema_version": "1.0.0",
        "default_region_id": "plumas_ca",
        "supports_custom_coordinates": True,
        "supports_query_text": True,
        "regions": [r.to_summary_dict() for r in PRESET_REGIONS],
    }


def _apply_gamma_rgb(
    rgb: NDArray[np.uint8],
    gamma: float = 0.95,
    contrast: float = 1.04,
) -> NDArray[np.uint8]:
    norm = rgb.astype(np.float32) / 255.0
    lifted = np.power(np.clip(norm, 0.0, 1.0), np.float32(gamma))
    if abs(contrast - 1.0) > 1e-4:
        lifted = np.float32(0.5) + (lifted - np.float32(0.5)) * np.float32(contrast)
    return np.clip(np.rint(lifted * 255.0), 0, 255).astype(np.uint8)


def _encode_png_rgb_stdlib(rgb: NDArray[np.uint8]) -> bytes:
    """Encode an (H, W, 3) uint8 array as a valid PNG image using Python stdlib only."""
    height, width, _ = rgb.shape
    filter_col = np.zeros((height, 1), dtype=np.uint8)
    scanlines = np.hstack([filter_col, rgb.reshape(height, width * 3)])
    raw_idat = zlib.compress(scanlines.tobytes(order="C"), level=6)

    def _chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", raw_idat)
        + _chunk(b"IEND", b"")
    )


def _encode_rgb_image(rgb: NDArray[np.uint8], quality: int = 92) -> tuple[bytes, str]:
    """Encode (H, W, 3) uint8 array as 4:4:4 JPEG via Pillow (or stdlib PNG fallback)."""
    if _HAS_PIL and Image is not None:
        buf = io.BytesIO()
        Image.fromarray(rgb, mode="RGB").save(
            buf,
            format="JPEG",
            quality=quality,
            subsampling=0,
            optimize=False,
        )
        return buf.getvalue(), "image/jpeg"
    return _encode_png_rgb_stdlib(rgb), "image/png"


def _synthesize_procedural_region(
    spec: RegionSpec,
) -> tuple[NDArray[np.float32], NDArray[np.float32], NDArray[np.uint8]]:
    """Deterministic multi-scale ridged relief (256 + 512) + 2048x2048 hillshaded ortho fallback."""
    seed_bytes = hashlib.sha256(
        f"{spec.bbox.west:.4f}:{spec.bbox.south:.4f}:{spec.bbox.east:.4f}:{spec.bbox.north:.4f}:{spec.biome}".encode(
            "utf-8"
        )
    ).digest()
    p0 = (int.from_bytes(seed_bytes[0:4], "little") % 6283) / 1000.0
    p1 = (int.from_bytes(seed_bytes[4:8], "little") % 6283) / 1000.0
    p2 = (int.from_bytes(seed_bytes[8:12], "little") % 6283) / 1000.0

    def _eval_relief(rows: int, cols: int) -> NDArray[np.float32]:
        u = np.linspace(0.0, 1.0, cols, dtype=np.float32)
        v = np.linspace(1.0, 0.0, rows, dtype=np.float32)  # row 0 = North (v=1), row -1 = South (v=0)
        uu, vv = np.meshgrid(u, v)

        r1 = 1.0 - np.abs(np.sin(np.float32(2.8 * math.pi) * uu + np.float32(1.9 * math.pi) * vv + np.float32(p0)))
        r2 = 1.0 - np.abs(np.cos(np.float32(5.4 * math.pi) * uu - np.float32(4.1 * math.pi) * vv + np.float32(p1)))
        r3 = 0.5 + 0.5 * np.sin(np.float32(11.2 * math.pi) * uu + np.float32(8.7 * math.pi) * vv + np.float32(p2))
        r4 = 0.5 + 0.5 * np.cos(np.float32(21.5 * math.pi) * uu - np.float32(16.3 * math.pi) * vv - np.float32(p0))

        t_c = np.clip(0.65 * uu + 0.55 * vv - 0.10, 0.0, 1.0)
        c_u = 0.12 + 0.76 * t_c + 0.06 * np.sin(np.float32(3.0 * math.pi) * t_c + np.float32(p1))
        c_v = 0.15 + 0.70 * t_c - 0.05 * np.cos(np.float32(2.5 * math.pi) * t_c + np.float32(p2))
        dist_canyon = np.hypot(uu - c_u, vv - c_v)
        incision = np.exp(-((dist_canyon / np.float32(0.11)) ** np.float32(1.7)))

        if spec.biome == "boreal_montane":
            base_m, amp_m, canyon_cut = 280.0, 2150.0, 760.0
        elif spec.biome == "tropical_moist":
            base_m, amp_m, canyon_cut = 140.0, 520.0, 145.0
        elif spec.biome == "mediterranean":
            base_m, amp_m, canyon_cut = -140.0, 1380.0, 340.0
        elif spec.biome == "temperate_broadleaf":
            base_m, amp_m, canyon_cut = 110.0, 1180.0, 490.0
        else:
            base_m, amp_m, canyon_cut = 220.0, 1950.0, 650.0

        raw = (
            np.float32(base_m)
            + np.float32(amp_m) * (0.50 * (r1 ** np.float32(1.35)) + 0.30 * (r2 ** np.float32(1.45)) + 0.13 * r3 + 0.07 * r4)
            - np.float32(canyon_cut) * incision
        )
        return np.maximum(raw, np.float32(0.0)).astype("<f4")

    dem_256 = _eval_relief(DEM_GRID_SIZE, DEM_GRID_SIZE)
    dem_512 = _eval_relief(DEM_HIRES_SIZE, DEM_HIRES_SIZE)
    dem_sat = _eval_relief(SAT_HIRES_SIZE, SAT_HIRES_SIZE)

    dy_m = np.float32(max(spec.depth_km * 1000.0 / SAT_HIRES_SIZE, 5.0))
    dx_m = np.float32(max(spec.width_km * 1000.0 / SAT_HIRES_SIZE, 5.0))
    dz_drow, dz_dcol = np.gradient(dem_sat, dy_m, dx_m)
    nx = -dz_dcol
    ny = dz_drow
    nz = np.ones_like(dem_sat)
    inv_n = np.float32(1.0) / np.sqrt(nx * nx + ny * ny + nz * nz)
    nx *= inv_n
    ny *= inv_n
    nz *= inv_n

    sun_x, sun_y, sun_z = np.float32(-0.509), np.float32(0.509), np.float32(0.695)
    shade = np.clip(0.42 + 0.68 * (nx * sun_x + ny * sun_y + nz * sun_z), 0.24, 1.18)

    max_h = np.float32(max(float(np.max(dem_sat)), 100.0))
    h_norm = np.clip(dem_sat / max_h, 0.0, 1.0)
    slope = np.sqrt(dz_dcol * dz_dcol + dz_drow * dz_drow)

    palettes: dict[str, tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]] = {
        "temperate_conifer": ((76.0, 94.0, 62.0), (38.0, 66.0, 44.0), (146.0, 141.0, 132.0)),
        "boreal_montane": ((64.0, 86.0, 58.0), (32.0, 58.0, 45.0), (168.0, 170.0, 174.0)),
        "tropical_moist": ((54.0, 96.0, 48.0), (29.0, 74.0, 36.0), (118.0, 108.0, 82.0)),
        "mediterranean": ((124.0, 118.0, 78.0), (68.0, 88.0, 54.0), (178.0, 168.0, 150.0)),
        "temperate_broadleaf": ((82.0, 102.0, 58.0), (44.0, 78.0, 48.0), (152.0, 138.0, 118.0)),
    }
    low_c, mid_c, high_c = palettes.get(spec.biome, palettes["temperate_conifer"])

    rgb_f = np.zeros((SAT_HIRES_SIZE, SAT_HIRES_SIZE, 3), dtype=np.float32)
    w_mid = np.sin(np.clip(h_norm * np.float32(1.15), 0.0, 1.0) * np.float32(math.pi))
    w_high = np.clip((h_norm - np.float32(0.58)) / np.float32(0.42), 0.0, 1.0) ** np.float32(1.4)
    rock_mask = np.clip((slope - np.float32(0.35)) / np.float32(0.45), 0.0, 0.75)

    for ch in range(3):
        lc = np.float32(low_c[ch])
        mc = np.float32(mid_c[ch])
        hc = np.float32(high_c[ch])
        col = (np.float32(1.0) - w_mid) * lc + w_mid * mc
        col = (np.float32(1.0) - w_high) * col + w_high * hc
        col = (np.float32(1.0) - rock_mask) * col + rock_mask * hc
        rgb_f[:, :, ch] = col * shade

    if spec.biome == "boreal_montane":
        snow = np.clip((dem_sat - np.float32(2050.0)) / np.float32(380.0), 0.0, 0.92)[..., np.newaxis]
        rgb_f = (np.float32(1.0) - snow) * rgb_f + snow * np.array([232.0, 238.0, 245.0], dtype=np.float32)

    water = (dem_sat <= np.float32(0.5))[..., np.newaxis]
    coastal_glow = np.exp(-dem_sat / np.float32(8.0)) * (dem_sat <= np.float32(12.0))
    marine_rgb = np.stack(
        [
            np.float32(22.0) + np.float32(34.0) * coastal_glow,
            np.float32(58.0) + np.float32(56.0) * coastal_glow,
            np.float32(96.0) + np.float32(48.0) * coastal_glow,
        ],
        axis=-1,
    )
    rgb_f = np.where(water, marine_rgb, rgb_f)
    sat_u8 = np.clip(np.rint(rgb_f), 0, 255).astype(np.uint8)
    return dem_256, dem_512, sat_u8


def _fetch_mosaic_with_timeout(
    url_template: str,
    bounds: TileGridBounds,
    tile_cache_dir: Path,
    timeout_s: float = 6.5,
    max_retries: int = 2,
) -> NDArray[np.uint8]:
    """Fetch XYZ/ArcGIS/WMTS mosaic concurrently with strict per-tile timeout & retry limits."""
    if not _HAS_PIL or fetch_tile_bytes is None or decode_tile_rgb is None:
        raise RuntimeError("Pillow unavailable for live tile decoding")

    tile_size = 256
    mosaic = np.zeros((bounds.height_tiles * tile_size, bounds.width_tiles * tile_size, 3), dtype=np.uint8)
    tasks: list[tuple[int, int, str]] = []
    for dy, ty in enumerate(range(bounds.ty_min, bounds.ty_max + 1)):
        for dx, tx in enumerate(range(bounds.tx_min, bounds.tx_max + 1)):
            tasks.append((dy, dx, url_template.format(z=bounds.zoom, x=tx, y=ty)))

    expected = (tile_size, tile_size)
    workers = min(24, max(1, len(tasks)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {
            pool.submit(
                fetch_tile_bytes,
                url,
                cache_dir=tile_cache_dir,
                timeout_s=timeout_s,
                max_retries=max_retries,
            ): (dy, dx)
            for dy, dx, url in tasks
        }
        for fut in as_completed(futs):
            dy, dx = futs[fut]
            raw = fut.result()
            tile_rgb = decode_tile_rgb(raw, expected_size=expected)
            y0, x0 = dy * tile_size, dx * tile_size
            mosaic[y0 : y0 + tile_size, x0 : x0 + tile_size, :] = tile_rgb

    return mosaic


def _select_dem_bounds(bbox: BoundingBox) -> TileGridBounds:
    """Select AWS Terrarium tile grid zoom (12 -> 11 -> 10) targeting <= 64 tiles."""
    for zoom in (12, 11):
        bounds = tile_bounds_for_bbox(bbox, zoom=zoom, tile_size=256, margin_px=2.0)
        if bounds.total_tiles <= 64:
            return bounds
    return tile_bounds_for_bbox(bbox, zoom=10, tile_size=256, margin_px=2.0)


def _select_sat_bounds(bbox: BoundingBox) -> TileGridBounds:
    """Select Esri World Imagery tile grid zoom (13 -> 12 -> 11) targeting <= 165 tiles."""
    for zoom in (13, 12):
        bounds = tile_bounds_for_bbox(bbox, zoom=zoom, tile_size=256, margin_px=2.0)
        if bounds.total_tiles <= 165:
            return bounds
    return tile_bounds_for_bbox(bbox, zoom=11, tile_size=256, margin_px=2.0)


def _fetch_satellite_with_fallback(
    bbox: BoundingBox,
    tile_cache_dir: Path,
    timeout_s: float = 6.5,
    max_retries: int = 2,
) -> tuple[NDArray[np.uint8], TileGridBounds, str]:
    """Fetch Esri World Imagery mosaic first, falling back to EOX Sentinel-2 Cloudless."""
    primary_bounds = _select_sat_bounds(bbox)
    try:
        mosaic_rgb = _fetch_mosaic_with_timeout(
            url_template=ESRI_WORLD_IMAGERY_URL,
            bounds=primary_bounds,
            tile_cache_dir=tile_cache_dir,
            timeout_s=timeout_s,
            max_retries=max_retries,
        )
        return mosaic_rgb, primary_bounds, "aws_terrarium_esri_world_imagery"
    except Exception:
        eox_zoom = min(primary_bounds.zoom, 12)
        eox_bounds = (
            primary_bounds
            if eox_zoom == primary_bounds.zoom
            else tile_bounds_for_bbox(bbox, zoom=eox_zoom, tile_size=256, margin_px=2.0)
        )
        mosaic_rgb = _fetch_mosaic_with_timeout(
            url_template=EOX_S2_2020_URL,
            bounds=eox_bounds,
            tile_cache_dir=tile_cache_dir,
            timeout_s=timeout_s,
            max_retries=max_retries,
        )
        return mosaic_rgb, eox_bounds, "aws_terrarium_eox_s2"


def _write_atomic_bytes(dest: Path, payload: bytes) -> None:
    tmp = dest.with_name(f".{dest.name}.{threading.get_ident()}.tmp")
    tmp.write_bytes(payload)
    tmp.replace(dest)


def region_cache_stem(spec: RegionSpec) -> str:
    """Cache file stem shared by every raster of a region: '<safe id>_<12 hex of the bbox hash>'."""
    safe_id = re.sub(r"[^a-z0-9_]+", "_", spec.id.lower()).strip("_") or "region"
    bbox_hash = hashlib.sha256(
        f"v2_hires:{spec.bbox.west:.5f}:{spec.bbox.south:.5f}:{spec.bbox.east:.5f}:{spec.bbox.north:.5f}".encode(
            "utf-8"
        )
    ).hexdigest()[:12]
    return f"{safe_id}_{bbox_hash}"


def load_region_terrain(
    spec: RegionSpec,
    static_terrain_dir: Path = STATIC_TERRAIN_DIR,
    cache_dir: Path = HIRES_REGION_CACHE_DIR,
    allow_network: bool = True,
) -> LoadedRegionTerrain:
    """Load 256x256 + 512x512 Float32 DEM and 2048x2048 RGB orthoimagery for any RegionSpec."""
    del static_terrain_dir  # accepted so that callers may pass it; not used
    t0 = time.perf_counter()

    cache_dir.mkdir(parents=True, exist_ok=True)
    stem = region_cache_stem(spec)

    dem_256_path = cache_dir / f"{stem}_dem_256_f32.bin"
    dem_512_path = cache_dir / f"{stem}_dem_512_f32.bin"
    sat_2048_path = cache_dir / f"{stem}_sat_2048.jpg"
    meta_path = cache_dir / f"{stem}_meta.json"

    # 1. Persistent high-res disk cache check (`data/cache/hires_regions/`)
    if (
        dem_256_path.is_file()
        and dem_256_path.stat().st_size == EXPECTED_DEM_BYTES
        and dem_512_path.is_file()
        and dem_512_path.stat().st_size == EXPECTED_DEM_HIRES_BYTES
        and sat_2048_path.is_file()
        and sat_2048_path.stat().st_size > 1024
        and meta_path.is_file()
    ):
        try:
            cached_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            dem_256_bytes = dem_256_path.read_bytes()
            dem_512_bytes = dem_512_path.read_bytes()
            sat_bytes = sat_2048_path.read_bytes()
            dem_256_arr = np.frombuffer(dem_256_bytes, dtype="<f4").reshape(DEM_GRID_SIZE, DEM_GRID_SIZE).copy()
            dem_512_arr = np.frombuffer(dem_512_bytes, dtype="<f4").reshape(DEM_HIRES_SIZE, DEM_HIRES_SIZE)
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            return LoadedRegionTerrain(
                spec=spec,
                dem_m=dem_256_arr,
                dem_f32_bytes=dem_256_bytes,
                dem_hires_f32_bytes=dem_512_bytes,
                satellite_bytes=sat_bytes,
                satellite_content_type=str(cached_meta.get("content_type", "image/jpeg")),
                terrain_source=str(cached_meta.get("terrain_source", "aws_terrarium_esri_world_imagery")),
                min_elev_m=float(np.min(dem_512_arr)),
                max_elev_m=float(np.max(dem_512_arr)),
                mean_elev_m=float(np.mean(dem_512_arr)),
                duration_ms=elapsed_ms,
            )
        except (OSError, ValueError, json.JSONDecodeError):
            pass

    # 2. Live download from AWS Terrarium (z=12/11) + Esri World Imagery (z=13/12, fallback EOX S2)
    if allow_network and _HAS_PIL:
        try:
            dem_bounds = _select_dem_bounds(spec.bbox)
            TILE_TEMP_CACHE_DIR.mkdir(parents=True, exist_ok=True)

            with ThreadPoolExecutor(max_workers=2) as outer_pool:
                fut_dem = outer_pool.submit(
                    _fetch_mosaic_with_timeout,
                    AWS_TERRARIUM_URL,
                    dem_bounds,
                    TILE_TEMP_CACHE_DIR,
                    6.5,
                    2,
                )
                fut_sat = outer_pool.submit(
                    _fetch_satellite_with_fallback,
                    spec.bbox,
                    TILE_TEMP_CACHE_DIR,
                    6.5,
                    2,
                )
                dem_mosaic_rgb = fut_dem.result()
                sat_mosaic_rgb, sat_bounds, terrain_source = fut_sat.result()

            mosaic_elev_m = decode_terrarium_rgb(dem_mosaic_rgb)
            dem_256_f64 = reproject_mercator_dem_grid(
                mosaic_elev_m=mosaic_elev_m,
                bounds=dem_bounds,
                bbox=spec.bbox,
                out_rows=DEM_GRID_SIZE,
                out_cols=DEM_GRID_SIZE,
            )
            dem_512_f64 = reproject_mercator_dem_grid(
                mosaic_elev_m=mosaic_elev_m,
                bounds=dem_bounds,
                bbox=spec.bbox,
                out_rows=DEM_HIRES_SIZE,
                out_cols=DEM_HIRES_SIZE,
            )
            if not (np.all(np.isfinite(dem_256_f64)) and np.all(np.isfinite(dem_512_f64))):
                raise RuntimeError("Non-finite DEM values encountered during Mercator reprojection")

            # Clamp ocean bathymetry (< 0 m) to sea surface (0.0 m) so coastal 3D relief aligns cleanly
            dem_256_arr = np.clip(dem_256_f64, 0.0, 8850.0).astype("<f4")
            dem_512_arr = np.clip(dem_512_f64, 0.0, 8850.0).astype("<f4")
            dem_256_bytes = dem_256_arr.tobytes(order="C")
            dem_512_bytes = dem_512_arr.tobytes(order="C")

            reproj_rgb = reproject_mercator_rgb_raster(
                mosaic_rgb=sat_mosaic_rgb,
                bounds=sat_bounds,
                bbox=spec.bbox,
                out_height=SAT_HIRES_SIZE,
                out_width=SAT_HIRES_SIZE,
                supersample=2,
            )
            balanced_rgb = _apply_gamma_rgb(reproj_rgb, gamma=0.95, contrast=1.04)
            sat_bytes, sat_ctype = _encode_rgb_image(balanced_rgb, quality=92)

            _write_atomic_bytes(dem_256_path, dem_256_bytes)
            _write_atomic_bytes(dem_512_path, dem_512_bytes)
            _write_atomic_bytes(sat_2048_path, sat_bytes)
            meta_payload = {
                "region_id": spec.id,
                "bbox": [spec.bbox.west, spec.bbox.south, spec.bbox.east, spec.bbox.north],
                "terrain_source": terrain_source,
                "content_type": sat_ctype,
                "dem_zoom": dem_bounds.zoom,
                "sat_zoom": sat_bounds.zoom,
                "ortho_resolution": f"{SAT_HIRES_SIZE}x{SAT_HIRES_SIZE}",
                "dem_resolution": f"{DEM_HIRES_SIZE}x{DEM_HIRES_SIZE}",
            }
            _write_atomic_bytes(
                meta_path,
                (json.dumps(meta_payload, indent=2) + "\n").encode("utf-8"),
            )

            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            return LoadedRegionTerrain(
                spec=spec,
                dem_m=dem_256_arr,
                dem_f32_bytes=dem_256_bytes,
                dem_hires_f32_bytes=dem_512_bytes,
                satellite_bytes=sat_bytes,
                satellite_content_type=sat_ctype,
                terrain_source=terrain_source,
                min_elev_m=float(np.min(dem_512_arr)),
                max_elev_m=float(np.max(dem_512_arr)),
                mean_elev_m=float(np.mean(dem_512_arr)),
                duration_ms=elapsed_ms,
            )
        except Exception:
            # Fall through cleanly to deterministic procedural relief + biome ortho fallback
            pass

    # 3. Deterministic procedural orographic relief + true-color 2048x2048 biome ortho fallback
    dem_256_arr, dem_512_arr, sat_u8 = _synthesize_procedural_region(spec)
    dem_256_bytes = dem_256_arr.tobytes(order="C")
    dem_512_bytes = dem_512_arr.tobytes(order="C")
    sat_bytes, sat_ctype = _encode_rgb_image(sat_u8, quality=92)
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    return LoadedRegionTerrain(
        spec=spec,
        dem_m=dem_256_arr,
        dem_f32_bytes=dem_256_bytes,
        dem_hires_f32_bytes=dem_512_bytes,
        satellite_bytes=sat_bytes,
        satellite_content_type=sat_ctype,
        terrain_source="procedural_orographic_fallback",
        min_elev_m=float(np.min(dem_512_arr)),
        max_elev_m=float(np.max(dem_512_arr)),
        mean_elev_m=float(np.mean(dem_512_arr)),
        duration_ms=elapsed_ms,
    )
