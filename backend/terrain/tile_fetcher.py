"""Resilient concurrent HTTP tile downloader and mosaic stitcher."""

from __future__ import annotations

import hashlib
import io
import tempfile
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from backend.terrain.projections import TileGridBounds

USER_AGENT: str = "Isogon-Geospatial-Pipeline/1.0 (+https://github.com/isogon)"
DEFAULT_CACHE_DIR: Path = Path(tempfile.gettempdir()) / "isogon_terrain_tile_cache"


def fetch_tile_bytes(
    url: str,
    cache_dir: Path | None = DEFAULT_CACHE_DIR,
    timeout_s: float = 20.0,
    max_retries: int = 4,
) -> bytes:
    """Download raw tile bytes with deterministic SHA-256 temp caching and retries."""
    cache_path: Path | None = None
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
        cache_path = cache_dir / f"{digest}.tile"
        if cache_path.is_file() and cache_path.stat().st_size > 64:
            return cache_path.read_bytes()

    last_err: Exception | None = None
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status} for {url}")
                payload = resp.read()
            if len(payload) < 64:
                raise RuntimeError(f"Truncated payload ({len(payload)} bytes) for {url}")
            if cache_path is not None:
                tmp_path = cache_path.with_suffix(".tmp")
                tmp_path.write_bytes(payload)
                tmp_path.replace(cache_path)
            return payload
        except (urllib.error.URLError, TimeoutError, OSError, RuntimeError) as exc:
            last_err = exc
            if attempt + 1 < max_retries:
                time.sleep(0.4 * (2**attempt))

    raise RuntimeError(f"Failed to download tile {url} after {max_retries} attempts: {last_err}")


def decode_tile_rgb(payload: bytes, expected_size: tuple[int, int]) -> NDArray[np.uint8]:
    """Decode PNG/JPEG tile payload into an exact WxH RGB uint8 array."""
    with Image.open(io.BytesIO(payload)) as img:
        if img.size != expected_size:
            raise ValueError(f"Expected tile size {expected_size}, got {img.size}")
        rgb_img = img.convert("RGB")
        return np.asarray(rgb_img, dtype=np.uint8)


def fetch_xyz_mosaic_rgb(
    url_template: str,
    bounds: TileGridBounds,
    tile_size: int = 256,
    max_workers: int = 8,
    cache_dir: Path | None = DEFAULT_CACHE_DIR,
) -> NDArray[np.uint8]:
    """Fetch and stitch an XYZ / WMTS tile grid into a contiguous (H, W, 3) uint8 array.

    url_template must accept {z}, {x}, {y} format placeholders.
    """
    mosaic_h = bounds.height_tiles * tile_size
    mosaic_w = bounds.width_tiles * tile_size
    mosaic = np.zeros((mosaic_h, mosaic_w, 3), dtype=np.uint8)

    tasks: list[tuple[int, int, str]] = []
    for dy, ty in enumerate(range(bounds.ty_min, bounds.ty_max + 1)):
        for dx, tx in enumerate(range(bounds.tx_min, bounds.tx_max + 1)):
            url = url_template.format(z=bounds.zoom, x=tx, y=ty)
            tasks.append((dy, dx, url))

    expected = (tile_size, tile_size)
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_map = {
            pool.submit(fetch_tile_bytes, url, cache_dir): (dy, dx, url)
            for dy, dx, url in tasks
        }
        for fut in as_completed(future_map):
            dy, dx, url = future_map[fut]
            raw = fut.result()
            tile_rgb = decode_tile_rgb(raw, expected_size=expected)
            y0 = dy * tile_size
            x0 = dx * tile_size
            mosaic[y0 : y0 + tile_size, x0 : x0 + tile_size, :] = tile_rgb

    return mosaic
