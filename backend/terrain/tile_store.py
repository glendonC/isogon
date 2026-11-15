"""Persistent, rate limited XYZ tile store for the terrain pack builder.

Every tile is kept on disk under ``data/cache/tiles/<source>/<z>/<x>/<y>.<ext>`` so a rebuild never
fetches the same tile twice. Requests run through a small thread pool (bounded concurrency) and a
shared token bucket (polite request rate). Tiles fetched earlier by ``tile_fetcher.fetch_tile_bytes``
into the temp cache (keyed by sha256 of the URL) are reused instead of fetched again.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import hashlib
import io
from pathlib import Path
import tempfile
import threading
import time
import urllib.error
import urllib.request

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from backend.terrain.projections import TileGridBounds

REPO_ROOT: Path = Path(__file__).resolve().parents[2]
TILE_STORE_DIR: Path = REPO_ROOT / "data" / "cache" / "tiles"
LEGACY_TEMP_TILE_DIR: Path = Path(tempfile.gettempdir()) / "isogon_terrain_tile_cache"
USER_AGENT: str = "Isogon-Geospatial-Pipeline/1.0 (+https://github.com/isogon)"
TILE_SIZE: int = 256


@dataclass(frozen=True)
class TileSource:
    """One XYZ tile service."""

    key: str
    url_template: str
    ext: str
    attribution: str


TERRARIUM = TileSource(
    key="terrarium",
    url_template="https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
    ext="png",
    attribution="Terrain Tiles on AWS Open Data (Mapzen Terrarium): USGS 3DEP, NRCan CDEM, EU-DEM, SRTM and others",
)
ESRI_WORLD_IMAGERY = TileSource(
    key="esri_world_imagery",
    url_template="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ext="jpg",
    # Credit exactly as Esri publishes it (item page and MapServer Copyright Text).
    attribution="Esri, Vantor, Earthstar Geographics, and the GIS User Community",
)
EOX_S2_CLOUDLESS_2020 = TileSource(
    key="eox_s2cloudless_2020",
    url_template="https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
    ext="jpg",
    # Credit as EOX's license page asks for it (https://cloudless.eox.at/documentation/license).
    attribution="EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)",
)

EOX_S2_CLOUDLESS_2016 = TileSource(
    key="eox_s2cloudless_2016",
    # Sentinel-2 cloudless 2016. Taken under EOX's licence page (https://cloudless.eox.at/documentation/license):
    # Creative Commons Attribution-NonCommercial-ShareAlike 4.0, free for non-commercial use, the credit visible wherever
    # the imagery is shown (docs/sources.md). Global, 10 m data; tiles answer to zoom 16, finer than the data.
    url_template="https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg",
    ext="jpg",
    # Credit in the words the same page asks for the 2016 layer.
    attribution="EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)",
)

USGS_NAIP = TileSource(
    key="usgs_naip",
    # USGS The National Map, USGS Imagery Only: NAIP orthoimagery for the conterminous United States, public
    # domain, standard 256 px Web Mercator tiles cached to level 16.
    url_template="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    ext="jpg",
    # The service's Copyright Text, verbatim.
    attribution="USDA, USGS The National Map: Orthoimagery. Data refreshed June, 2024.v1.2",
)

SOURCES_BY_KEY: dict[str, TileSource] = {
    s.key: s for s in (TERRARIUM, ESRI_WORLD_IMAGERY, EOX_S2_CLOUDLESS_2020, EOX_S2_CLOUDLESS_2016, USGS_NAIP)
}


class _RateLimiter:
    """Shared token bucket: at most ``rate_per_s`` request starts per second across threads."""

    def __init__(self, rate_per_s: float) -> None:
        self._interval = 1.0 / max(0.1, rate_per_s)
        self._lock = threading.Lock()
        self._next = time.monotonic()

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            slot = max(now, self._next)
            self._next = slot + self._interval
        delay = slot - time.monotonic()
        if delay > 0:
            time.sleep(delay)


@dataclass
class FetchStats:
    requested: int = 0
    from_store: int = 0
    from_legacy: int = 0
    downloaded: int = 0
    placeholders: int = 0
    failed: int = 0

    def to_dict(self) -> dict[str, int]:
        return dict(self.__dict__)


class TileStore:
    """Disk backed tile cache with bounded concurrency and a polite request rate per tile host."""

    def __init__(
        self,
        root: Path = TILE_STORE_DIR,
        max_workers: int = 6,
        rate_per_s: float = 16.0,
        timeout_s: float = 20.0,
        max_retries: int = 5,
        legacy_dir: Path | None = LEGACY_TEMP_TILE_DIR,
        allow_network: bool = True,
    ) -> None:
        self.root = root
        self.max_workers = max(1, int(max_workers))
        self.timeout_s = timeout_s
        self.max_retries = max(1, int(max_retries))
        self.legacy_dir = legacy_dir
        self.allow_network = allow_network
        self.rate_per_s = rate_per_s
        self._limiters: dict[str, _RateLimiter] = {}
        self._limiters_lock = threading.Lock()
        self._stats_lock = threading.Lock()
        self.stats = FetchStats()

    def _limiter(self, source: TileSource) -> _RateLimiter:
        with self._limiters_lock:
            lim = self._limiters.get(source.key)
            if lim is None:
                lim = self._limiters[source.key] = _RateLimiter(self.rate_per_s)
            return lim

    def _bump(self, field: str) -> None:
        with self._stats_lock:
            setattr(self.stats, field, getattr(self.stats, field) + 1)

    def tile_path(self, source: TileSource, z: int, x: int, y: int) -> Path:
        return self.root / source.key / str(z) / str(x) / f"{y}.{source.ext}"

    def get_bytes(self, source: TileSource, z: int, x: int, y: int) -> bytes:
        """Return the raw tile payload, reading the store first and fetching only on a miss."""
        self._bump("requested")
        path = self.tile_path(source, z, x, y)
        if path.is_file() and path.stat().st_size > 64:
            self._bump("from_store")
            return path.read_bytes()

        url = source.url_template.format(z=z, x=x, y=y)
        if self.legacy_dir is not None:
            legacy = self.legacy_dir / f"{hashlib.sha256(url.encode('utf-8')).hexdigest()}.tile"
            if legacy.is_file() and legacy.stat().st_size > 64:
                payload = legacy.read_bytes()
                self._write(path, payload)
                self._bump("from_legacy")
                return payload

        if not self.allow_network:
            self._bump("failed")
            raise RuntimeError(f"tile {source.key}/{z}/{x}/{y} not cached and network disabled")

        payload = self._download(url, self._limiter(source))
        self._write(path, payload)
        self._bump("downloaded")
        return payload

    def _download(self, url: str, limiter: _RateLimiter) -> bytes:
        last_err: Exception | None = None
        for attempt in range(self.max_retries):
            limiter.wait()
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                    payload = resp.read()
                if len(payload) < 64:
                    raise RuntimeError(f"truncated payload ({len(payload)} bytes)")
                return payload
            except urllib.error.HTTPError as exc:
                last_err = exc
                if exc.code not in (408, 429, 500, 502, 503, 504):
                    break
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                pause = float(retry_after) if retry_after and retry_after.isdigit() else 1.0 * (2**attempt)
                time.sleep(min(pause, 30.0))
            except (urllib.error.URLError, TimeoutError, OSError, RuntimeError) as exc:
                last_err = exc
                time.sleep(0.5 * (2**attempt))
        self._bump("failed")
        raise RuntimeError(f"failed to download {url}: {last_err}")

    @staticmethod
    def _write(path: Path, payload: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f".{path.name}.{threading.get_ident()}.tmp")
        tmp.write_bytes(payload)
        tmp.replace(path)

    def fetch_mosaic(
        self,
        source: TileSource,
        bounds: TileGridBounds,
        placeholder_fill: bool = False,
    ) -> NDArray[np.uint8]:
        """Fetch every tile in ``bounds`` and stitch an (H, W, 3) uint8 mosaic.

        With ``placeholder_fill`` a tile that decodes as a flat "no data" placeholder is replaced by the
        matching quadrant of its parent tile, upsampled.
        """
        mosaic = np.zeros((bounds.height_tiles * TILE_SIZE, bounds.width_tiles * TILE_SIZE, 3), dtype=np.uint8)
        jobs = [
            (dy, dx, tx, ty)
            for dy, ty in enumerate(range(bounds.ty_min, bounds.ty_max + 1))
            for dx, tx in enumerate(range(bounds.tx_min, bounds.tx_max + 1))
        ]

        def _one(job: tuple[int, int, int, int]) -> None:
            dy, dx, tx, ty = job
            rgb = decode_rgb(self.get_bytes(source, bounds.zoom, tx, ty))
            if placeholder_fill and is_placeholder_tile(rgb):
                self._bump("placeholders")
                rgb = self._parent_fill(source, bounds.zoom, tx, ty)
            mosaic[dy * TILE_SIZE : (dy + 1) * TILE_SIZE, dx * TILE_SIZE : (dx + 1) * TILE_SIZE] = rgb

        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            for fut in [pool.submit(_one, job) for job in jobs]:
                fut.result()
        return mosaic

    def _parent_fill(self, source: TileSource, z: int, x: int, y: int, depth: int = 0) -> NDArray[np.uint8]:
        if z <= 1 or depth > 3:
            return np.full((TILE_SIZE, TILE_SIZE, 3), 96, dtype=np.uint8)
        parent = decode_rgb(self.get_bytes(source, z - 1, x // 2, y // 2))
        if is_placeholder_tile(parent):
            parent = self._parent_fill(source, z - 1, x // 2, y // 2, depth + 1)
        half = TILE_SIZE // 2
        quad = parent[(y % 2) * half : (y % 2) * half + half, (x % 2) * half : (x % 2) * half + half]
        img = Image.fromarray(np.ascontiguousarray(quad), mode="RGB").resize((TILE_SIZE, TILE_SIZE), Image.BICUBIC)
        return np.asarray(img, dtype=np.uint8)


def decode_rgb(payload: bytes) -> NDArray[np.uint8]:
    with Image.open(io.BytesIO(payload)) as img:
        if img.size != (TILE_SIZE, TILE_SIZE):
            raise ValueError(f"expected {TILE_SIZE}x{TILE_SIZE} tile, got {img.size}")
        return np.asarray(img.convert("RGB"), dtype=np.uint8)


def is_placeholder_tile(rgb: NDArray[np.uint8]) -> bool:
    """True for the light, nearly flat "Map data not yet available" tile some imagery services return."""
    lum = rgb.astype(np.float32).mean(axis=2)
    flat_share = float(np.mean(np.abs(lum - np.median(lum)) < 3.0))
    return bool(flat_share > 0.92 and 180.0 < float(np.median(lum)) < 245.0)
