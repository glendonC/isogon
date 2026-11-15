"""Per-pass satellite fire and cloud mask reader (numpy and standard library only).

Each pass mask classifies a box on Isogon's 0.375 km north-up evaluation grid into five disjoint cell classes:
  0  not_seen     outside the swath, in VIIRS bowtie trim, sun glint, missing input, or unclassified background
  1  clear_land   clear non-fire land pixel
  2  cloud        cloud pixel flagged by the active fire product
  3  water        clear non-fire water pixel
  4  fire         active fire pixel (low, nominal, or high confidence)

Separation rule between model inputs and held-out scoring truth:
  - Coarse passes (MODIS_TERRA, MODIS_AQUA) live under masks/coarse/<box>/<platform>/<pass>.npz.
    The model may read a coarse satellite's mask at the coarse passes the model is given, via
    coarse_shares() and coarse_grid() (or shares(..., allow_sharp=False)).
  - Sharp passes (VIIRS_SNPP, VIIRS_NOAA20, VIIRS_NOAA21) live under masks/sharp/<box>/<platform>/<pass>.npz.
    A sharp satellite's mask at a pass the model must predict is NEVER given to the model. It belongs to the
    scoring side (and full-reveal inspection) only. Passing a sharp platform with allow_sharp=False raises
    PermissionError so model code cannot mix coarse and sharp masks by accident.

Missing data rule:
  When a pass has not been fetched onto disk, shares() and grid() return NOT_FETCHED ("not fetched") as its
  own distinct value, never as clear land and never as cloud.

Closed test rule:
  Windows touching UTC year 2021 inside plumas_ca, lytton_bc, or evia_greece are closed test fires and raise
  ClosedPassMaskWindow on any read attempt.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
import datetime as _dt
import json
import math
import os
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

_REPO_ROOT = Path(__file__).resolve().parents[2]

NOT_FETCHED: str = "not fetched"

CELL_KM: float = 0.375
DEG_TO_KM_LAT: float = 111.132
MATCH_TOL_S: float = 420.0  # covers one adjacent 6 min VIIRS or 5 min MODIS context-box granule
BOX_MATCH_TOL_DEG: float = 1.5e-4

COARSE_PLATFORMS: tuple[str, ...] = ("MODIS_TERRA", "MODIS_AQUA")
SHARP_PLATFORMS: tuple[str, ...] = ("VIIRS_SNPP", "VIIRS_NOAA20", "VIIRS_NOAA21")
PLATFORMS: tuple[str, ...] = COARSE_PLATFORMS + SHARP_PLATFORMS

PLATFORM_ALIASES: dict[str, str] = {
    "MODIS_TERRA": "MODIS_TERRA",
    "TERRA": "MODIS_TERRA",
    "T": "MODIS_TERRA",
    "MOD14": "MODIS_TERRA",
    "MODIS_AQUA": "MODIS_AQUA",
    "AQUA": "MODIS_AQUA",
    "A": "MODIS_AQUA",
    "MYD14": "MODIS_AQUA",
    "VIIRS_SNPP": "VIIRS_SNPP",
    "SUOMI NPP": "VIIRS_SNPP",
    "SUOMI-NPP": "VIIRS_SNPP",
    "SNPP": "VIIRS_SNPP",
    "NPP": "VIIRS_SNPP",
    "VNP14IMG": "VIIRS_SNPP",
    "VIIRS_NOAA20": "VIIRS_NOAA20",
    "NOAA-20": "VIIRS_NOAA20",
    "NOAA20": "VIIRS_NOAA20",
    "JPSS-1": "VIIRS_NOAA20",
    "JPSS1": "VIIRS_NOAA20",
    "J1": "VIIRS_NOAA20",
    "VJ114IMG": "VIIRS_NOAA20",
    "VIIRS_NOAA21": "VIIRS_NOAA21",
    "NOAA-21": "VIIRS_NOAA21",
    "NOAA21": "VIIRS_NOAA21",
    "JPSS-2": "VIIRS_NOAA21",
    "JPSS2": "VIIRS_NOAA21",
    "J2": "VIIRS_NOAA21",
    "VJ214IMG": "VIIRS_NOAA21",
}

CLASS_NAMES: tuple[str, ...] = ("not_seen", "clear_land", "cloud", "water", "fire")
CLASS_NOT_SEEN: int = 0
CLASS_CLEAR_LAND: int = 1
CLASS_CLOUD: int = 2
CLASS_WATER: int = 3
CLASS_FIRE: int = 4
CLASS_CODES: dict[str, int] = {name: idx for idx, name in enumerate(CLASS_NAMES)}

CLOSED_YEAR: int = 2021
_CLOSED_YEAR_START_S: float = float(calendar.timegm((2021, 1, 1, 0, 0, 0, 0, 0, 0)))
_CLOSED_YEAR_END_S: float = float(calendar.timegm((2022, 1, 1, 0, 0, 0, 0, 0, 0)))
CLOSED_CONTEXT_BOXES: dict[str, tuple[float, float, float, float]] = {
    "plumas_ca": (-122.48, 39.10, -119.88, 41.00),
    "lytton_bc": (-122.93, 49.28, -120.23, 51.18),
    "evia_greece": (22.05, 37.96, 24.55, 39.76),
}


class ClosedPassMaskWindow(ValueError):
    """Raised when a 2021 window in plumas_ca, lytton_bc, or evia_greece is requested."""


def default_passmask_dir() -> Path:
    """Default on-disk directory holding fetched pass masks."""
    override = os.environ.get("ISOGON_PASSMASK_DIR", "").strip()
    if override:
        return Path(override)
    return _REPO_ROOT.parent / "isogon-world" / "passmask"


PASSMASK_DIR: Path = default_passmask_dir()


def canonical_platform(platform: str) -> str:
    """Normalize a platform identifier to MODIS_TERRA, MODIS_AQUA, VIIRS_SNPP, VIIRS_NOAA20, or VIIRS_NOAA21."""
    key = str(platform).strip().upper()
    if key not in PLATFORM_ALIASES:
        raise ValueError(f"unknown platform '{platform}'; expected one of {PLATFORMS}")
    return PLATFORM_ALIASES[key]


def platform_role(platform: str) -> str:
    """Return 'coarse' for MODIS platforms and 'sharp' for VIIRS platforms."""
    plat = canonical_platform(platform)
    return "coarse" if plat in COARSE_PLATFORMS else "sharp"


def normalize_box(box: tuple[float, float, float, float] | list[float]) -> tuple[float, float, float, float]:
    """Validate and round (west, south, east, north) to six decimal places."""
    if len(box) != 4:
        raise ValueError(f"box must have four coordinates (west, south, east, north), got {box!r}")
    w, s, e, n = (round(float(v), 6) for v in box)
    if not (math.isfinite(w) and math.isfinite(s) and math.isfinite(e) and math.isfinite(n)):
        raise ValueError(f"non-finite box {box!r}")
    if not (e > w and n > s):
        raise ValueError(f"empty or inverted box {(w, s, e, n)!r}")
    return (w, s, e, n)


def box_key(box: tuple[float, float, float, float] | list[float]) -> str:
    """Deterministic directory key for a normalized bounding box."""
    w, s, e, n = normalize_box(box)
    return f"{w:.6f}_{s:.6f}_{e:.6f}_{n:.6f}"


def parse_box_key(key: str) -> tuple[float, float, float, float] | None:
    """Parse a box_key directory name back to (west, south, east, north), or None if malformed."""
    parts = key.split("_")
    if len(parts) != 4:
        return None
    try:
        return normalize_box(tuple(float(x) for x in parts))  # type: ignore[arg-type]
    except ValueError:
        return None


def parse_utc_seconds(value: str | float | int | _dt.date | _dt.datetime) -> float:
    """Convert an ISO-8601 UTC string, date, datetime, or epoch float to UTC seconds."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        val = float(value)
        if not math.isfinite(val):
            raise ValueError(f"non-finite timestamp {value!r}")
        return val
    if isinstance(value, _dt.datetime):
        dt = value if value.tzinfo is not None else value.replace(tzinfo=_dt.timezone.utc)
        return dt.timestamp()
    if isinstance(value, _dt.date):
        return float(calendar.timegm((value.year, value.month, value.day, 0, 0, 0, 0, 0, 0)))
    text = str(value).strip()
    if not text:
        raise ValueError("empty timestamp")
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        y, m, d = (int(p) for p in text.split("-"))
        return float(calendar.timegm((y, m, d, 0, 0, 0, 0, 0, 0)))
    iso = text[:-1] + "+00:00" if text.endswith("Z") else text
    dt = _dt.datetime.fromisoformat(iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_dt.timezone.utc)
    return dt.timestamp()


def format_utc(seconds: float) -> str:
    """Format UTC epoch seconds as YYYY-MM-DDTHH:MM:SSZ."""
    return _dt.datetime.fromtimestamp(round(float(seconds)), _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def time_stem(time_utc: str | float | int | _dt.datetime) -> str:
    """Filename stem YYYYMMDDTHHMMSSZ for a pass start timestamp."""
    s = parse_utc_seconds(time_utc)
    return _dt.datetime.fromtimestamp(round(s), _dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _boxes_overlap(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return not (a[2] <= b[0] or a[0] >= b[2] or a[3] <= b[1] or a[1] >= b[3])


def closed_region_for(
    box: tuple[float, float, float, float] | list[float],
    start: str | float | int | _dt.date | _dt.datetime,
    end: str | float | int | _dt.date | _dt.datetime | None = None,
) -> str | None:
    """Return the closed region id if box and [start, end] touch 2021 in plumas_ca, lytton_bc, or evia_greece."""
    b = normalize_box(box)
    t0 = parse_utc_seconds(start)
    t1 = t0 if end is None else parse_utc_seconds(end)
    if end is None:
        touches_2021 = _CLOSED_YEAR_START_S <= t0 < _CLOSED_YEAR_END_S
    else:
        if t1 < t0:
            t0, t1 = t1, t0
        touches_2021 = (t0 < _CLOSED_YEAR_END_S) and (t1 > _CLOSED_YEAR_START_S or t0 >= _CLOSED_YEAR_START_S)
    if not touches_2021:
        return None
    for region_id, cbox in CLOSED_CONTEXT_BOXES.items():
        if _boxes_overlap(b, cbox):
            return region_id
    return None


def refuse_closed_window(
    box: tuple[float, float, float, float] | list[float],
    start: str | float | int | _dt.date | _dt.datetime,
    end: str | float | int | _dt.date | _dt.datetime | None = None,
) -> None:
    """Raise ClosedPassMaskWindow when a 2021 window in plumas_ca, lytton_bc, or evia_greece is touched."""
    hit = closed_region_for(box, start, end)
    if hit is not None:
        raise ClosedPassMaskWindow(
            f"2021 in {hit} is a closed test fire: pass masks are never fetched, read, or reported there"
        )


@dataclass(frozen=True)
class PassMaskGrid:
    """375 m north-up local-plane grid matching backend.eval.grid.EvalGrid cell for cell."""

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
    def from_bbox(cls, bbox: tuple[float, float, float, float] | list[float], cell_km: float = CELL_KM) -> PassMaskGrid:
        w, s, e, n = (float(v) for v in bbox)
        if not (e > w and n > s):
            raise ValueError(f"empty box {bbox!r}")
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
    def n_cells(self) -> int:
        return self.ny * self.nx

    def xy_km(
        self, lon: NDArray[np.float64] | float, lat: NDArray[np.float64] | float
    ) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        x = (np.asarray(lon, dtype=np.float64) - self.west) * self.km_per_deg_lon
        y = (np.asarray(lat, dtype=np.float64) - self.south) * self.km_per_deg_lat
        return x, y

    def cell_centres_km(self) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        xc = (np.arange(self.nx) + 0.5) * self.cell_km
        yc = (self.ny - np.arange(self.ny) - 0.5) * self.cell_km
        return xc, yc

    def cell_lonlat(self) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        xc, yc = self.cell_centres_km()
        lon = self.west + xc / self.km_per_deg_lon
        lat = self.south + yc / self.km_per_deg_lat
        return np.meshgrid(lon, lat)

    def row_col(
        self, lon: NDArray[np.float64] | float, lat: NDArray[np.float64] | float
    ) -> tuple[NDArray[np.int64], NDArray[np.int64]]:
        x, y = self.xy_km(lon, lat)
        col = np.floor(x / self.cell_km).astype(np.int64)
        row = (self.ny - 1 - np.floor(y / self.cell_km)).astype(np.int64)
        bad = (col < 0) | (col >= self.nx) | (row < 0) | (row >= self.ny)
        return np.where(bad, -1, row), np.where(bad, -1, col)


@dataclass(frozen=True)
class PassMask:
    """Loaded per-pass mask over a box on PassMaskGrid."""

    platform: str
    role: str
    time_start: str
    time_end: str
    time_mid: str
    grid_spec: PassMaskGrid
    mask: NDArray[np.uint8]
    counts: dict[str, int]
    shares: dict[str, float]
    path: Path | None = None

    def __eq__(self, other: object) -> bool:
        if isinstance(other, str):
            return False
        if not isinstance(other, PassMask):
            return NotImplemented
        return (
            self.platform == other.platform
            and self.role == other.role
            and self.time_start == other.time_start
            and self.time_end == other.time_end
            and self.grid_spec == other.grid_spec
            and np.array_equal(self.mask, other.mask)
        )

    def __array__(self, dtype: Any = None) -> NDArray[Any]:
        return np.asarray(self.mask, dtype=dtype) if dtype is not None else self.mask

    @property
    def shape(self) -> tuple[int, int]:
        return self.mask.shape

    @property
    def dtype(self) -> np.dtype[np.uint8]:
        return self.mask.dtype

    @property
    def not_seen_mask(self) -> NDArray[np.bool_]:
        return self.mask == CLASS_NOT_SEEN

    @property
    def clear_land_mask(self) -> NDArray[np.bool_]:
        return self.mask == CLASS_CLEAR_LAND

    @property
    def cloud_mask(self) -> NDArray[np.bool_]:
        return self.mask == CLASS_CLOUD

    @property
    def water_mask(self) -> NDArray[np.bool_]:
        return self.mask == CLASS_WATER

    @property
    def fire_mask(self) -> NDArray[np.bool_]:
        return self.mask == CLASS_FIRE

    @property
    def seen_mask(self) -> NDArray[np.bool_]:
        return self.mask != CLASS_NOT_SEEN


def passmask_path(
    box: tuple[float, float, float, float] | list[float],
    time_start_utc: str | float | int | _dt.datetime,
    platform: str,
    root: Path | None = None,
) -> Path:
    """Canonical path <root>/masks/<role>/<box_key>/<platform>/<YYYYMMDDTHHMMSSZ>.npz for a pass."""
    plat = canonical_platform(platform)
    role = platform_role(plat)
    base = default_passmask_dir() if root is None else Path(root)
    return base / "masks" / role / box_key(box) / plat / f"{time_stem(time_start_utc)}.npz"


def read_manifest(path: Path) -> dict[str, Any] | None:
    """Read <file>.manifest.json beside a saved pass mask file, or None if absent."""
    m = path.with_name(path.name + ".manifest.json")
    if not m.is_file():
        return None
    try:
        return json.loads(m.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _resolve_platform_dir(
    box: tuple[float, float, float, float] | list[float],
    platform: str,
    root: Path,
) -> Path | None:
    plat = canonical_platform(platform)
    role = platform_role(plat)
    role_dir = root / "masks" / role
    if not role_dir.is_dir():
        return None
    exact = role_dir / box_key(box) / plat
    if exact.is_dir():
        return exact
    target = normalize_box(box)
    best: tuple[float, Path] | None = None
    for child in sorted(role_dir.iterdir()):
        if not child.is_dir():
            continue
        parsed = parse_box_key(child.name)
        if parsed is None:
            continue
        diff = max(abs(a - b) for a, b in zip(target, parsed))
        if diff <= BOX_MATCH_TOL_DEG:
            cand = child / plat
            if cand.is_dir() and (best is None or diff < best[0]):
                best = (diff, cand)
    return best[1] if best is not None else None


def _stem_seconds(stem: str) -> float | None:
    if len(stem) != 16 or stem[8] != "T" or not stem.endswith("Z"):
        return None
    try:
        y = int(stem[0:4])
        m = int(stem[4:6])
        d = int(stem[6:8])
        hh = int(stem[9:11])
        mm = int(stem[11:13])
        ss = int(stem[13:15])
        return float(calendar.timegm((y, m, d, hh, mm, ss, 0, 0, 0)))
    except ValueError:
        return None


def _find_pass_file(
    box: tuple[float, float, float, float] | list[float],
    pass_time: str | float | int | _dt.datetime,
    platform: str,
    root: Path,
    match_tol_s: float = MATCH_TOL_S,
) -> Path | None:
    pdir = _resolve_platform_dir(box, platform, root)
    if pdir is None:
        return None
    query_s = parse_utc_seconds(pass_time)
    exact = pdir / f"{time_stem(query_s)}.npz"
    if exact.is_file():
        return exact
    # Scan nearby stems first without opening distant files.
    candidates: list[tuple[float, Path]] = []
    max_span_s = match_tol_s + 1800.0
    for f in sorted(pdir.glob("*.npz")):
        st_s = _stem_seconds(f.stem)
        if st_s is None or abs(query_s - st_s) > max_span_s:
            continue
        try:
            with np.load(f, allow_pickle=False) as data:
                ts_s = float(data["time_start_s"])
                te_s = float(data["time_end_s"])
        except Exception:  # noqa: BLE001
            continue
        if (ts_s - match_tol_s) <= query_s <= (te_s + match_tol_s):
            mid_s = 0.5 * (ts_s + te_s)
            candidates.append((abs(query_s - mid_s), f))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def load_passmask_file(path: Path) -> PassMask:
    """Load one per-pass .npz file from disk into a PassMask."""
    with np.load(path, allow_pickle=False) as data:
        plat = canonical_platform(str(data["platform"].item()))
        role = str(data["role"].item()) if "role" in data else platform_role(plat)
        expected_role = platform_role(plat)
        if role != expected_role:
            raise ValueError(f"{path}: stored role '{role}' disagrees with platform '{plat}' ({expected_role})")
        time_start = str(data["time_start"].item())
        time_end = str(data["time_end"].item())
        time_mid = str(data["time_mid"].item())
        wsen = tuple(float(v) for v in data["box_wsen"].tolist())
        refuse_closed_window(wsen, time_start, time_end)
        cell_km = float(data["cell_km"].item())
        mask = np.asarray(data["mask"], dtype=np.uint8)
        grid_spec = PassMaskGrid.from_bbox(wsen, cell_km=cell_km)
        if mask.shape != grid_spec.shape:
            raise ValueError(f"{path}: mask shape {mask.shape} disagrees with grid shape {grid_spec.shape}")
        raw_counts = np.bincount(mask.ravel(), minlength=len(CLASS_NAMES))[: len(CLASS_NAMES)]
        total = int(mask.size)
        counts_map = {name: int(raw_counts[idx]) for idx, name in enumerate(CLASS_NAMES)}
        shares_map = {name: float(raw_counts[idx]) / float(total) for idx, name in enumerate(CLASS_NAMES)}
    return PassMask(
        platform=plat,
        role=role,
        time_start=time_start,
        time_end=time_end,
        time_mid=time_mid,
        grid_spec=grid_spec,
        mask=mask,
        counts=counts_map,
        shares=shares_map,
        path=path,
    )


def _check_access(
    box: tuple[float, float, float, float] | list[float],
    pass_time: str | float | int | _dt.datetime,
    platform: str,
    allow_sharp: bool,
) -> str:
    refuse_closed_window(box, pass_time)
    plat = canonical_platform(platform)
    if not allow_sharp and platform_role(plat) == "sharp":
        raise PermissionError(
            f"{plat} is a sharp satellite: its mask belongs to the scoring side only and may not be read with "
            "allow_sharp=False"
        )
    return plat


def grid(
    box: tuple[float, float, float, float] | list[float],
    pass_time: str | float | int | _dt.datetime,
    platform: str,
    *,
    root: Path | None = None,
    allow_sharp: bool = True,
    match_tol_s: float = MATCH_TOL_S,
) -> PassMask | str:
    """Read the per-pass 5-class grid over box for (pass_time, platform), or return 'not fetched'.

    Never substitutes clear or cloud when a pass mask has not been fetched.
    Model code must pass allow_sharp=False (or call coarse_grid) so sharp VIIRS masks cannot be read by accident.
    """
    plat = _check_access(box, pass_time, platform, allow_sharp=allow_sharp)
    base = default_passmask_dir() if root is None else Path(root)
    found = _find_pass_file(box, pass_time, plat, base, match_tol_s=match_tol_s)
    if found is None:
        return NOT_FETCHED
    return load_passmask_file(found)


def shares(
    box: tuple[float, float, float, float] | list[float],
    pass_time: str | float | int | _dt.datetime,
    platform: str,
    *,
    root: Path | None = None,
    allow_sharp: bool = True,
    match_tol_s: float = MATCH_TOL_S,
) -> dict[str, Any] | str:
    """Read the box class shares for (box, pass_time, platform), or return 'not fetched'.

    Returns NOT_FETCHED ('not fetched') when no mask file exists for that pass, never clear and never cloud.
    When present, returns a dict with keys 'fire', 'clear_land', 'cloud', 'water', 'not_seen' (summing to 1.0)
    alongside pass metadata ('platform', 'role', 'time_start', 'time_end', 'time_mid', 'box_wsen', 'cell_km',
    'grid_shape', 'n_cells', 'seen', 'clear_of_seen', and 'counts').
    """
    pm = grid(box, pass_time, platform, root=root, allow_sharp=allow_sharp, match_tol_s=match_tol_s)
    if isinstance(pm, str):
        return NOT_FETCHED
    seen = 1.0 - pm.shares["not_seen"]
    clear_obs = pm.shares["clear_land"] + pm.shares["water"] + pm.shares["fire"]
    return {
        "platform": pm.platform,
        "role": pm.role,
        "time_start": pm.time_start,
        "time_end": pm.time_end,
        "time_mid": pm.time_mid,
        "box_wsen": pm.grid_spec.bbox,
        "cell_km": pm.grid_spec.cell_km,
        "grid_shape": pm.grid_spec.shape,
        "n_cells": pm.grid_spec.n_cells,
        "fire": pm.shares["fire"],
        "clear_land": pm.shares["clear_land"],
        "cloud": pm.shares["cloud"],
        "water": pm.shares["water"],
        "not_seen": pm.shares["not_seen"],
        "seen": seen,
        "clear_of_seen": (clear_obs / seen) if seen > 0.0 else None,
        "counts": dict(pm.counts),
    }


def coarse_grid(
    box: tuple[float, float, float, float] | list[float],
    pass_time: str | float | int | _dt.datetime,
    platform: str,
    *,
    root: Path | None = None,
    match_tol_s: float = MATCH_TOL_S,
) -> PassMask | str:
    """Model-safe reader for coarse (MODIS) pass grids only. Refuses sharp (VIIRS) platforms."""
    return grid(box, pass_time, platform, root=root, allow_sharp=False, match_tol_s=match_tol_s)


def coarse_shares(
    box: tuple[float, float, float, float] | list[float],
    pass_time: str | float | int | _dt.datetime,
    platform: str,
    *,
    root: Path | None = None,
    match_tol_s: float = MATCH_TOL_S,
) -> dict[str, Any] | str:
    """Model-safe reader for coarse (MODIS) pass shares only. Refuses sharp (VIIRS) platforms."""
    return shares(box, pass_time, platform, root=root, allow_sharp=False, match_tol_s=match_tol_s)


def list_passes(
    box: tuple[float, float, float, float] | list[float],
    start: str | float | int | _dt.date | _dt.datetime,
    end: str | float | int | _dt.date | _dt.datetime,
    *,
    platforms: tuple[str, ...] | list[str] | None = None,
    root: Path | None = None,
    allow_sharp: bool = True,
) -> list[dict[str, Any]]:
    """List fetched pass share summaries for box whose [time_start, time_end] meets [start, end) UTC."""
    refuse_closed_window(box, start, end)
    t0, t1 = parse_utc_seconds(start), parse_utc_seconds(end)
    if t1 <= t0:
        raise ValueError("end must be after start")
    base = default_passmask_dir() if root is None else Path(root)
    if platforms is None:
        want = list(PLATFORMS if allow_sharp else COARSE_PLATFORMS)
    else:
        want = [canonical_platform(p) for p in platforms]
        if not allow_sharp and any(platform_role(p) == "sharp" for p in want):
            raise PermissionError("sharp platforms cannot be listed when allow_sharp=False")
    out: list[dict[str, Any]] = []
    for plat in want:
        pdir = _resolve_platform_dir(box, plat, base)
        if pdir is None:
            continue
        for f in sorted(pdir.glob("*.npz")):
            st_s = _stem_seconds(f.stem)
            if st_s is not None and (st_s + 1800.0 < t0 or st_s > t1 + 600.0):
                continue
            pm = load_passmask_file(f)
            ts_s = parse_utc_seconds(pm.time_start)
            te_s = parse_utc_seconds(pm.time_end)
            if te_s <= t0 or ts_s >= t1:
                continue
            seen = 1.0 - pm.shares["not_seen"]
            clear_obs = pm.shares["clear_land"] + pm.shares["water"] + pm.shares["fire"]
            out.append({
                "platform": pm.platform,
                "role": pm.role,
                "time_start": pm.time_start,
                "time_end": pm.time_end,
                "time_mid": pm.time_mid,
                "box_wsen": pm.grid_spec.bbox,
                "cell_km": pm.grid_spec.cell_km,
                "grid_shape": pm.grid_spec.shape,
                "n_cells": pm.grid_spec.n_cells,
                "fire": pm.shares["fire"],
                "clear_land": pm.shares["clear_land"],
                "cloud": pm.shares["cloud"],
                "water": pm.shares["water"],
                "not_seen": pm.shares["not_seen"],
                "seen": seen,
                "clear_of_seen": (clear_obs / seen) if seen > 0.0 else None,
                "counts": dict(pm.counts),
            })
    out.sort(key=lambda d: (d["time_start"], d["platform"]))
    return out
