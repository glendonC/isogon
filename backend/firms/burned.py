"""Monthly reflectance burned-area reader for a box and UTC window (numpy and stdlib only).

Reads plain numpy (.npz) archives written by backend/firms/burned_fetch.py from NASA's global 500 m
sinusoidal burned area products on LP DAAC (LPCLOUD):
  - MCD64A1 v061 (C2565786756-LPCLOUD): MODIS Terra+Aqua 500 m surface reflectance burned area (default)
  - VNP64A1 v002 (C2847928673-LPCLOUD): Suomi NPP VIIRS 750 m surface reflectance burned area on 500 m grid

Every mask is exposed on BurnedGrid (0.375 km north-up local-plane grid matching backend.eval.grid.EvalGrid
cell for cell). Each cell is classified into five disjoint classes for a half-open UTC window [start, end):
  0  unmapped           native Burn Date == -1 (insufficient reflectance observations or missing tile)
  1  unburned_land      native Burn Date == 0 across covered months
  2  water              native Burn Date == -2
  3  burned_other_day   native Burn Date >= 1 in a covered month, outside [start, end)
  4  burned_in_window   native Burn Date falls on a UTC calendar date overlapping [start, end)

Missing data rule:
  When any calendar month overlapping [start, end) has not been fetched for the requested box and product,
  mask() and shares() return NOT_FETCHED ("not fetched") as its own distinct value, never unburned.

Closed test rule:
  Any window touching UTC year 2021 inside plumas_ca, lytton_bc, or evia_greece raises ClosedBurnedWindow.
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
BOX_MATCH_TOL_DEG: float = 1.5e-4

# Exact MODIS/VIIRS sinusoidal grid constants (GCTP_SNSOID in StructMetadata.0; MCD64 User's Guide Appendix B).
R_SINUSOIDAL_M: float = 6371007.181
TILE_DIM: int = 2400
N_TILES_H: int = 36
N_TILES_V: int = 18
X_MIN_SIN_M: float = -math.pi * R_SINUSOIDAL_M
Y_MAX_SIN_M: float = 0.5 * math.pi * R_SINUSOIDAL_M
TILE_SPAN_M: float = (2.0 * math.pi * R_SINUSOIDAL_M) / float(N_TILES_H)
SIN_CELL_M: float = TILE_SPAN_M / float(TILE_DIM)

DEFAULT_PRODUCT: str = "MCD64A1"
PRODUCTS: tuple[str, ...] = ("MCD64A1", "VNP64A1")
PRODUCT_ALIASES: dict[str, str] = {
    "MCD64A1": "MCD64A1",
    "MCD64": "MCD64A1",
    "MODIS": "MCD64A1",
    "VNP64A1": "VNP64A1",
    "VNP64": "VNP64A1",
    "VIIRS": "VNP64A1",
}

PRODUCT_INFO: dict[str, dict[str, str]] = {
    "MCD64A1": {
        "product": "MCD64A1",
        "version": "061",
        "concept_id": "C2565786756-LPCLOUD",
        "data_centre": "LPCLOUD",
        "entry_title": "MODIS/Terra+Aqua Direct Broadcast Burned Area Monthly L3 Global 500m SIN Grid V061",
        "first_month": "2000-11",
    },
    "VNP64A1": {
        "product": "VNP64A1",
        "version": "002",
        "concept_id": "C2847928673-LPCLOUD",
        "data_centre": "LPCLOUD",
        "entry_title": "VIIRS/NPP Burned Area Monthly L4 Global 500m SIN Grid V002",
        "first_month": "2012-03",
    },
}

CLASS_NAMES: tuple[str, ...] = (
    "unmapped",
    "unburned_land",
    "water",
    "burned_other_day",
    "burned_in_window",
)
CLASS_UNMAPPED: int = 0
CLASS_UNBURNED_LAND: int = 1
CLASS_WATER: int = 2
CLASS_BURNED_OTHER_DAY: int = 3
CLASS_BURNED_IN_WINDOW: int = 4
CLASS_CODES: dict[str, int] = {name: idx for idx, name in enumerate(CLASS_NAMES)}

NATIVE_WATER: int = -2
NATIVE_UNMAPPED: int = -1
NATIVE_UNBURNED: int = 0

CLOSED_YEAR: int = 2021
_CLOSED_YEAR_START_S: float = float(calendar.timegm((2021, 1, 1, 0, 0, 0, 0, 0, 0)))
_CLOSED_YEAR_END_S: float = float(calendar.timegm((2022, 1, 1, 0, 0, 0, 0, 0, 0)))
CLOSED_CONTEXT_BOXES: dict[str, tuple[float, float, float, float]] = {
    "plumas_ca": (-122.48, 39.10, -119.88, 41.00),
    "lytton_bc": (-122.93, 49.28, -120.23, 51.18),
    "evia_greece": (22.05, 37.96, 24.55, 39.76),
}


class ClosedBurnedWindow(ValueError):
    """Raised when a 2021 window in plumas_ca, lytton_bc, or evia_greece is requested."""


def default_burned_dir() -> Path:
    """Default on-disk directory holding fetched burned-area masks."""
    override = os.environ.get("ISOGON_BURNED_DIR", "").strip()
    if override:
        return Path(override)
    return _REPO_ROOT.parent / "isogon-world" / "burned"


BURNED_DIR: Path = default_burned_dir()


def canonical_product(product: str = DEFAULT_PRODUCT) -> str:
    """Normalize a burned-area product selector to MCD64A1 or VNP64A1."""
    key = str(product).strip().upper()
    if key not in PRODUCT_ALIASES:
        raise ValueError(f"unknown burned area product '{product}'; expected one of {PRODUCTS}")
    return PRODUCT_ALIASES[key]


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


def time_stem(time_utc: str | float | int | _dt.date | _dt.datetime) -> str:
    """Filename stem YYYYMMDDTHHMMSSZ for a UTC timestamp."""
    s = parse_utc_seconds(time_utc)
    return _dt.datetime.fromtimestamp(round(s), _dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def doy_to_iso_date(year: int, doy: int) -> str:
    """Convert (year, ordinal day 1..366) to YYYY-MM-DD."""
    d = _dt.date(int(year), 1, 1) + _dt.timedelta(days=int(doy) - 1)
    return d.isoformat()


def overlapping_utc_dates(start_s: float, end_s: float) -> list[_dt.date]:
    """Ordered UTC calendar dates whose 24-hour interval [00:00Z, next 00:00Z) overlaps [start_s, end_s)."""
    if end_s <= start_s:
        raise ValueError(f"window end ({format_utc(end_s)}) must be after start ({format_utc(start_s)})")
    first_dt = _dt.datetime.fromtimestamp(start_s, _dt.timezone.utc)
    cur = _dt.date(first_dt.year, first_dt.month, first_dt.day)
    out: list[_dt.date] = []
    while True:
        day_start = float(calendar.timegm((cur.year, cur.month, cur.day, 0, 0, 0, 0, 0, 0)))
        if day_start >= end_s:
            break
        day_end = day_start + 86400.0
        if day_end > start_s:
            out.append(cur)
        cur = cur + _dt.timedelta(days=1)
    return out


def overlapping_year_months(start_s: float, end_s: float) -> list[tuple[int, int]]:
    """Ordered (year, month) pairs overlapped by [start_s, end_s)."""
    seen: list[tuple[int, int]] = []
    seen_set: set[tuple[int, int]] = set()
    for d in overlapping_utc_dates(start_s, end_s):
        ym = (d.year, d.month)
        if ym not in seen_set:
            seen_set.add(ym)
            seen.append(ym)
    return seen


def window_doy_by_year(start_s: float, end_s: float) -> dict[int, tuple[int, int]]:
    """Map each calendar year in [start_s, end_s) to inclusive (min_doy, max_doy) of overlapping UTC days."""
    by_year: dict[int, list[int]] = {}
    for d in overlapping_utc_dates(start_s, end_s):
        doy = d.timetuple().tm_yday
        by_year.setdefault(d.year, []).append(doy)
    return {yr: (min(vals), max(vals)) for yr, vals in by_year.items()}


def _boxes_overlap(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return not (a[2] <= b[0] or a[0] >= b[2] or a[3] <= b[1] or a[1] >= b[3])


def closed_region_for(
    box: tuple[float, float, float, float] | list[float],
    start: str | float | int | _dt.date | _dt.datetime,
    end: str | float | int | _dt.date | _dt.datetime | None = None,
) -> str | None:
    """Return the closed region id if box and [start, end) touch 2021 in plumas_ca, lytton_bc, or evia_greece."""
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
    """Raise ClosedBurnedWindow when a 2021 window in plumas_ca, lytton_bc, or evia_greece is touched."""
    hit = closed_region_for(box, start, end)
    if hit is not None:
        raise ClosedBurnedWindow(
            f"2021 in {hit} is a closed test fire: burned area masks are never fetched, read, or reported there"
        )


# ---------------------------------------------------------------------------
# Sinusoidal projection navigation (Appendix B of MCD64 & VNP64 User's Guides)
# ---------------------------------------------------------------------------


def lonlat_to_sinusoidal_hvij(
    lon_deg: NDArray[np.float64] | float,
    lat_deg: NDArray[np.float64] | float,
) -> tuple[NDArray[np.int64], NDArray[np.int64], NDArray[np.int64], NDArray[np.int64]]:
    """Forward map (lon_deg, lat_deg) to MODIS sinusoidal tile (H, V) and 500 m cell (row i, col j)."""
    lon = np.asarray(lon_deg, dtype=np.float64)
    lat = np.asarray(lat_deg, dtype=np.float64)
    lat_r = np.radians(lat)
    lon_r = np.radians(lon)
    x = R_SINUSOIDAL_M * lon_r * np.cos(lat_r)
    y = R_SINUSOIDAL_M * lat_r
    h = np.clip(np.floor((x - X_MIN_SIN_M) / TILE_SPAN_M).astype(np.int64), 0, N_TILES_H - 1)
    v = np.clip(np.floor((Y_MAX_SIN_M - y) / TILE_SPAN_M).astype(np.int64), 0, N_TILES_V - 1)
    i = np.clip(np.floor(((Y_MAX_SIN_M - y) - v * TILE_SPAN_M) / SIN_CELL_M).astype(np.int64), 0, TILE_DIM - 1)
    j = np.clip(np.floor(((x - X_MIN_SIN_M) - h * TILE_SPAN_M) / SIN_CELL_M).astype(np.int64), 0, TILE_DIM - 1)
    return h, v, i, j


def sinusoidal_hvij_to_lonlat(
    h: NDArray[np.int64] | int,
    v: NDArray[np.int64] | int,
    i: NDArray[np.int64] | int,
    j: NDArray[np.int64] | int,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Inverse map sinusoidal tile (H, V) and cell (row i, col j) to cell-centre (lon_deg, lat_deg)."""
    ha = np.asarray(h, dtype=np.float64)
    va = np.asarray(v, dtype=np.float64)
    ia = np.asarray(i, dtype=np.float64)
    ja = np.asarray(j, dtype=np.float64)
    x = X_MIN_SIN_M + ha * TILE_SPAN_M + (ja + 0.5) * SIN_CELL_M
    y = Y_MAX_SIN_M - va * TILE_SPAN_M - (ia + 0.5) * SIN_CELL_M
    lat_r = y / R_SINUSOIDAL_M
    lon_r = x / (R_SINUSOIDAL_M * np.cos(lat_r))
    return np.degrees(lon_r), np.degrees(lat_r)


def tiles_for_box(box: tuple[float, float, float, float] | list[float]) -> list[str]:
    """Sorted MODIS/VIIRS sinusoidal tile IDs (e.g. ['h08v04', 'h08v05']) touched by a bounding box."""
    grid_spec = BurnedGrid.from_bbox(box)
    lon2d, lat2d = grid_spec.cell_lonlat()
    h, v, _, _ = lonlat_to_sinusoidal_hvij(lon2d, lat2d)
    pairs = sorted({(int(hh), int(vv)) for hh, vv in zip(h.ravel().tolist(), v.ravel().tolist())})
    return [f"h{hh:02d}v{vv:02d}" for hh, vv in pairs]


# ---------------------------------------------------------------------------
# Stated grid and loaded mask structures
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BurnedGrid:
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
    def from_bbox(
        cls,
        bbox: tuple[float, float, float, float] | list[float],
        cell_km: float = CELL_KM,
    ) -> BurnedGrid:
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

    @property
    def cell_area_km2(self) -> float:
        return self.cell_km * self.cell_km

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
class BurnedWindow:
    """Reflectance burned-area mask over a box and half-open UTC window [start_utc, end_utc)."""

    product: str
    version: str
    concept_id: str
    start_utc: str
    end_utc: str
    retrieved_utc: str
    grid_spec: BurnedGrid
    mask: NDArray[np.uint8]
    burned: NDArray[np.bool_]
    burn_year: NDArray[np.int16]
    burn_doy: NDArray[np.int16]
    uncertainty_days: NDArray[np.uint8]
    qa: NDArray[np.uint8]
    first_day: NDArray[np.int16]
    last_day: NDArray[np.int16]
    counts: dict[str, int]
    shares: dict[str, float]
    burn_day_counts: dict[str, int]
    first_burn_date: str | None
    last_burn_date: str | None
    source: dict[str, Any]
    path: Path | None = None

    def __eq__(self, other: object) -> bool:
        if isinstance(other, str):
            return False
        if not isinstance(other, BurnedWindow):
            return NotImplemented
        return (
            self.product == other.product
            and self.version == other.version
            and self.start_utc == other.start_utc
            and self.end_utc == other.end_utc
            and self.grid_spec == other.grid_spec
            and np.array_equal(self.mask, other.mask)
            and np.array_equal(self.burn_doy, other.burn_doy)
        )

    def __array__(self, dtype: Any = None) -> NDArray[Any]:
        return np.asarray(self.burned, dtype=dtype) if dtype is not None else self.burned

    @property
    def shape(self) -> tuple[int, int]:
        return self.mask.shape

    @property
    def dtype(self) -> np.dtype[np.bool_]:
        return self.burned.dtype

    @property
    def burned_area_km2(self) -> float:
        return float(self.counts["burned_in_window"]) * self.grid_spec.cell_area_km2

    @property
    def unmapped_mask(self) -> NDArray[np.bool_]:
        return self.mask == CLASS_UNMAPPED

    @property
    def unburned_land_mask(self) -> NDArray[np.bool_]:
        return self.mask == CLASS_UNBURNED_LAND

    @property
    def water_mask(self) -> NDArray[np.bool_]:
        return self.mask == CLASS_WATER

    @property
    def burned_other_day_mask(self) -> NDArray[np.bool_]:
        return self.mask == CLASS_BURNED_OTHER_DAY


def month_path(
    box: tuple[float, float, float, float] | list[float],
    year: int,
    month: int,
    product: str = DEFAULT_PRODUCT,
    root: Path | None = None,
) -> Path:
    """Canonical path <root>/months/<product>/<box_key>/<YYYY-MM>.npz for a calendar month."""
    prod = canonical_product(product)
    base = default_burned_dir() if root is None else Path(root)
    return base / "months" / prod / box_key(box) / f"{int(year):04d}-{int(month):02d}.npz"


def window_path(
    box: tuple[float, float, float, float] | list[float],
    start: str | float | int | _dt.date | _dt.datetime,
    end: str | float | int | _dt.date | _dt.datetime,
    product: str = DEFAULT_PRODUCT,
    root: Path | None = None,
) -> Path:
    """Canonical path <root>/windows/<product>/<box_key>/<start_stem>_<end_stem>.npz for a window."""
    prod = canonical_product(product)
    base = default_burned_dir() if root is None else Path(root)
    stem = f"{time_stem(start)}_{time_stem(end)}.npz"
    return base / "windows" / prod / box_key(box) / stem


def read_manifest(path: Path) -> dict[str, Any] | None:
    """Read <file>.manifest.json beside a saved file, or None if absent."""
    m = path.with_name(path.name + ".manifest.json")
    if not m.is_file():
        return None
    try:
        return json.loads(m.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _resolve_box_dir(
    parent: Path,
    box: tuple[float, float, float, float] | list[float],
) -> Path | None:
    if not parent.is_dir():
        return None
    target = normalize_box(box)
    exact = parent / box_key(target)
    if exact.is_dir():
        return exact
    best_dir: Path | None = None
    best_dist = BOX_MATCH_TOL_DEG
    for child in parent.iterdir():
        if not child.is_dir():
            continue
        parsed = parse_box_key(child.name)
        if parsed is None:
            continue
        dist = max(abs(a - b) for a, b in zip(target, parsed))
        if dist <= best_dist:
            best_dist = dist
            best_dir = child
    return best_dir


def summarize_counts_and_shares(mask_arr: NDArray[np.uint8]) -> tuple[dict[str, int], dict[str, float]]:
    """Compute exact cell counts and box shares for a 5-class uint8 burned-area grid."""
    arr = np.asarray(mask_arr, dtype=np.uint8)
    total = int(arr.size)
    counts = {name: int(np.count_nonzero(arr == code)) for code, name in enumerate(CLASS_NAMES)}
    if total == 0:
        shares_map = {name: 0.0 for name in CLASS_NAMES}
        shares_map["mapped"] = 0.0
        shares_map["burned_of_mapped_land"] = 0.0
        return counts, shares_map
    shares_map = {name: counts[name] / total for name in CLASS_NAMES}
    mapped_cells = total - counts["unmapped"]
    mapped_land = counts["unburned_land"] + counts["burned_other_day"] + counts["burned_in_window"]
    shares_map["mapped"] = mapped_cells / total
    shares_map["burned_of_mapped_land"] = (
        (counts["burned_in_window"] / mapped_land) if mapped_land > 0 else 0.0
    )
    return counts, shares_map


def compose_window_from_months(
    box: tuple[float, float, float, float] | list[float],
    start: str | float | int | _dt.date | _dt.datetime,
    end: str | float | int | _dt.date | _dt.datetime,
    month_records: list[dict[str, Any]],
    product: str = DEFAULT_PRODUCT,
    saved_path: Path | None = None,
) -> BurnedWindow:
    """Compose a BurnedWindow over [start, end) from one or more monthly box archives."""
    refuse_closed_window(box, start, end)
    prod = canonical_product(product)
    pinfo = PRODUCT_INFO[prod]
    start_s = parse_utc_seconds(start)
    end_s = parse_utc_seconds(end)
    if end_s <= start_s:
        raise ValueError("end must be after start")
    doy_spans = window_doy_by_year(start_s, end_s)

    grid_spec = BurnedGrid.from_bbox(box)
    shape = grid_spec.shape

    mask_out = np.full(shape, CLASS_UNMAPPED, dtype=np.uint8)
    burn_year = np.zeros(shape, dtype=np.int16)
    burn_doy = np.full(shape, NATIVE_UNMAPPED, dtype=np.int16)
    uncertainty = np.zeros(shape, dtype=np.uint8)
    qa_out = np.zeros(shape, dtype=np.uint8)
    first_day_out = np.full(shape, NATIVE_UNMAPPED, dtype=np.int16)
    last_day_out = np.full(shape, NATIVE_UNMAPPED, dtype=np.int16)

    all_granules: list[dict[str, Any]] = []
    seen_granules: set[str] = set()
    retrieved_times: list[str] = []
    version = pinfo["version"]
    concept_id = pinfo["concept_id"]

    for rec in sorted(month_records, key=lambda r: (int(r["year"]), int(r["month"]))):
        yr = int(rec["year"])
        bd = np.asarray(rec["burn_doy"], dtype=np.int16)
        unc = np.asarray(rec["uncertainty_days"], dtype=np.uint8)
        qa = np.asarray(rec["qa"], dtype=np.uint8)
        fd = np.asarray(rec["first_day"], dtype=np.int16)
        ld = np.asarray(rec["last_day"], dtype=np.int16)
        if bd.shape != shape:
            raise ValueError(f"month {yr:04d}-{int(rec['month']):02d} shape {bd.shape} != expected {shape}")

        if rec.get("version"):
            version = str(rec["version"])
        if rec.get("concept_id"):
            concept_id = str(rec["concept_id"])
        if rec.get("retrieved_utc"):
            retrieved_times.append(str(rec["retrieved_utc"]))
        for g in rec.get("granules", []):
            gid = str(g.get("filename") or g.get("producer_granule_id") or "")
            if gid and gid not in seen_granules:
                seen_granules.add(gid)
                all_granules.append(g)

        lo_doy, hi_doy = doy_spans.get(yr, (999, -1))
        in_win = (bd >= lo_doy) & (bd <= hi_doy) & (bd >= 1)
        other_burn = (bd >= 1) & (~in_win)
        is_unburned = bd == NATIVE_UNBURNED
        is_water = bd == NATIVE_WATER

        # Water fills unmapped cells
        take_water = is_water & (mask_out == CLASS_UNMAPPED)
        mask_out[take_water] = CLASS_WATER
        burn_doy[take_water] = NATIVE_WATER
        qa_out[take_water] = qa[take_water]
        first_day_out[take_water] = fd[take_water]
        last_day_out[take_water] = ld[take_water]

        # Unburned land upgrades unmapped or water
        take_unburned = is_unburned & (mask_out < CLASS_UNBURNED_LAND)
        mask_out[take_unburned] = CLASS_UNBURNED_LAND
        burn_doy[take_unburned] = NATIVE_UNBURNED
        qa_out[take_unburned] = qa[take_unburned]
        first_day_out[take_unburned] = fd[take_unburned]
        last_day_out[take_unburned] = ld[take_unburned]
        # Update last_day on continuing unburned land across consecutive months
        cont_unburned = is_unburned & (mask_out == CLASS_UNBURNED_LAND)
        last_day_out[cont_unburned] = ld[cont_unburned]

        # Out-of-window burn upgrades anything below burned_other_day
        take_other = other_burn & (mask_out < CLASS_BURNED_OTHER_DAY)
        mask_out[take_other] = CLASS_BURNED_OTHER_DAY
        burn_year[take_other] = yr
        burn_doy[take_other] = bd[take_other]
        uncertainty[take_other] = unc[take_other]
        qa_out[take_other] = qa[take_other]
        first_day_out[take_other] = fd[take_other]
        last_day_out[take_other] = ld[take_other]

        # In-window burn has highest priority (keep earliest in-window burn if burned twice)
        take_in_win = in_win & (mask_out < CLASS_BURNED_IN_WINDOW)
        mask_out[take_in_win] = CLASS_BURNED_IN_WINDOW
        burn_year[take_in_win] = yr
        burn_doy[take_in_win] = bd[take_in_win]
        uncertainty[take_in_win] = unc[take_in_win]
        qa_out[take_in_win] = qa[take_in_win]
        first_day_out[take_in_win] = fd[take_in_win]
        last_day_out[take_in_win] = ld[take_in_win]

    burned_bool = mask_out == CLASS_BURNED_IN_WINDOW
    counts, shares_map = summarize_counts_and_shares(mask_out)

    burn_day_counts: dict[str, int] = {}
    if np.any(burned_bool):
        yrs = burn_year[burned_bool]
        doys = burn_doy[burned_bool]
        pairs, pcounts = np.unique(np.stack([yrs, doys], axis=1), axis=0, return_counts=True)
        for (y_i, d_i), c_i in zip(pairs.tolist(), pcounts.tolist()):
            burn_day_counts[doy_to_iso_date(int(y_i), int(d_i))] = int(c_i)
    sorted_dates = sorted(burn_day_counts.keys())
    first_burn_date = sorted_dates[0] if sorted_dates else None
    last_burn_date = sorted_dates[-1] if sorted_dates else None
    retrieved_utc = max(retrieved_times) if retrieved_times else ""

    source = {
        "product": prod,
        "version": version,
        "concept_id": concept_id,
        "data_centre": pinfo["data_centre"],
        "entry_title": pinfo["entry_title"],
        "retrieved_utc": retrieved_utc,
        "window_start_utc": format_utc(start_s),
        "window_end_utc": format_utc(end_s),
        "covered_doy_spans": {str(k): list(v) for k, v in sorted(doy_spans.items())},
        "granules": all_granules,
    }

    return BurnedWindow(
        product=prod,
        version=version,
        concept_id=concept_id,
        start_utc=format_utc(start_s),
        end_utc=format_utc(end_s),
        retrieved_utc=retrieved_utc,
        grid_spec=grid_spec,
        mask=mask_out,
        burned=burned_bool,
        burn_year=burn_year,
        burn_doy=burn_doy,
        uncertainty_days=uncertainty,
        qa=qa_out,
        first_day=first_day_out,
        last_day=last_day_out,
        counts=counts,
        shares=shares_map,
        burn_day_counts=burn_day_counts,
        first_burn_date=first_burn_date,
        last_burn_date=last_burn_date,
        source=source,
        path=saved_path,
    )


def _load_month_npz(npz_path: Path) -> dict[str, Any]:
    with np.load(npz_path, allow_pickle=False) as z:
        granules_raw = str(z["granules_json"].item()) if "granules_json" in z else "[]"
        try:
            granules = json.loads(granules_raw)
        except ValueError:
            granules = []
        return {
            "year": int(z["year"].item()),
            "month": int(z["month"].item()),
            "product": str(z["product"].item()),
            "version": str(z["version"].item()),
            "concept_id": str(z["concept_id"].item()),
            "retrieved_utc": str(z["retrieved_utc"].item()) if "retrieved_utc" in z else "",
            "bbox": tuple(float(x) for x in z["bbox"].tolist()),
            "cell_km": float(z["cell_km"].item()),
            "burn_doy": np.array(z["burn_doy"], dtype=np.int16, copy=True),
            "uncertainty_days": np.array(z["uncertainty_days"], dtype=np.uint8, copy=True),
            "qa": np.array(z["qa"], dtype=np.uint8, copy=True),
            "first_day": np.array(z["first_day"], dtype=np.int16, copy=True),
            "last_day": np.array(z["last_day"], dtype=np.int16, copy=True),
            "granules": granules,
        }


def _load_window_npz(npz_path: Path) -> BurnedWindow:
    with np.load(npz_path, allow_pickle=False) as z:
        mask_arr = np.array(z["mask"], dtype=np.uint8, copy=True)
        burned_arr = np.array(z["burned"], dtype=np.bool_, copy=True)
        burn_year = np.array(z["burn_year"], dtype=np.int16, copy=True)
        burn_doy = np.array(z["burn_doy"], dtype=np.int16, copy=True)
        uncertainty = np.array(z["uncertainty_days"], dtype=np.uint8, copy=True)
        qa = np.array(z["qa"], dtype=np.uint8, copy=True)
        first_day = np.array(z["first_day"], dtype=np.int16, copy=True)
        last_day = np.array(z["last_day"], dtype=np.int16, copy=True)
        bbox = tuple(float(x) for x in z["bbox"].tolist())
        cell_km = float(z["cell_km"].item())
        prod = str(z["product"].item())
        version = str(z["version"].item())
        concept_id = str(z["concept_id"].item())
        start_utc = str(z["start_utc"].item())
        end_utc = str(z["end_utc"].item())
        retrieved_utc = str(z["retrieved_utc"].item()) if "retrieved_utc" in z else ""
        source_raw = str(z["source_json"].item()) if "source_json" in z else "{}"

    refuse_closed_window(bbox, start_utc, end_utc)
    grid_spec = BurnedGrid.from_bbox(bbox, cell_km=cell_km)
    if mask_arr.shape != grid_spec.shape:
        raise ValueError(f"corrupt burned mask shape {mask_arr.shape} != expected {grid_spec.shape} in {npz_path}")
    counts, shares_map = summarize_counts_and_shares(mask_arr)
    try:
        source = json.loads(source_raw)
    except ValueError:
        source = {"product": prod, "version": version, "concept_id": concept_id}

    burn_day_counts: dict[str, int] = {}
    if np.any(burned_arr):
        yrs = burn_year[burned_arr]
        doys = burn_doy[burned_arr]
        pairs, pcounts = np.unique(np.stack([yrs, doys], axis=1), axis=0, return_counts=True)
        for (y_i, d_i), c_i in zip(pairs.tolist(), pcounts.tolist()):
            burn_day_counts[doy_to_iso_date(int(y_i), int(d_i))] = int(c_i)
    sorted_dates = sorted(burn_day_counts.keys())

    return BurnedWindow(
        product=prod,
        version=version,
        concept_id=concept_id,
        start_utc=start_utc,
        end_utc=end_utc,
        retrieved_utc=retrieved_utc,
        grid_spec=grid_spec,
        mask=mask_arr,
        burned=burned_arr,
        burn_year=burn_year,
        burn_doy=burn_doy,
        uncertainty_days=uncertainty,
        qa=qa,
        first_day=first_day,
        last_day=last_day,
        counts=counts,
        shares=shares_map,
        burn_day_counts=burn_day_counts,
        first_burn_date=sorted_dates[0] if sorted_dates else None,
        last_burn_date=sorted_dates[-1] if sorted_dates else None,
        source=source,
        path=npz_path,
    )


def mask(
    box: tuple[float, float, float, float] | list[float],
    start: str | float | int | _dt.date | _dt.datetime,
    end: str | float | int | _dt.date | _dt.datetime,
    *,
    product: str = DEFAULT_PRODUCT,
    root: Path | None = None,
) -> BurnedWindow | str:
    """Read the burned-area mask for box and half-open UTC window [start, end).

    Returns a BurnedWindow (with .burned boolean grid, .mask 5-class uint8 grid, .burn_doy,
    .uncertainty_days, .first_burn_date, .last_burn_date, and .source metadata), or NOT_FETCHED
    ("not fetched") when any overlapping month is absent from disk.
    """
    refuse_closed_window(box, start, end)
    prod = canonical_product(product)
    start_s = parse_utc_seconds(start)
    end_s = parse_utc_seconds(end)
    if end_s <= start_s:
        raise ValueError("end must be after start")
    base = default_burned_dir() if root is None else Path(root)

    win_box_dir = _resolve_box_dir(base / "windows" / prod, box)
    if win_box_dir is not None:
        candidate = win_box_dir / f"{time_stem(start_s)}_{time_stem(end_s)}.npz"
        if candidate.is_file():
            return _load_window_npz(candidate)

    month_box_dir = _resolve_box_dir(base / "months" / prod, box)
    if month_box_dir is None:
        return NOT_FETCHED

    needed = overlapping_year_months(start_s, end_s)
    if not needed:
        return NOT_FETCHED
    records: list[dict[str, Any]] = []
    for yr, mo in needed:
        mp = month_box_dir / f"{yr:04d}-{mo:02d}.npz"
        if not mp.is_file():
            return NOT_FETCHED
        records.append(_load_month_npz(mp))

    norm_box = parse_box_key(month_box_dir.name) or normalize_box(box)
    return compose_window_from_months(norm_box, start_s, end_s, records, product=prod)


def grid(
    box: tuple[float, float, float, float] | list[float],
    start: str | float | int | _dt.date | _dt.datetime,
    end: str | float | int | _dt.date | _dt.datetime,
    *,
    product: str = DEFAULT_PRODUCT,
    root: Path | None = None,
) -> BurnedWindow | str:
    """Alias for mask(box, start, end, product=..., root=...)."""
    return mask(box, start, end, product=product, root=root)


def shares(
    box: tuple[float, float, float, float] | list[float],
    start: str | float | int | _dt.date | _dt.datetime,
    end: str | float | int | _dt.date | _dt.datetime,
    *,
    product: str = DEFAULT_PRODUCT,
    root: Path | None = None,
) -> dict[str, Any] | str:
    """Return class shares, counts, dates, and source metadata for (box, start, end), or NOT_FETCHED."""
    bw = mask(box, start, end, product=product, root=root)
    if isinstance(bw, str):
        return bw
    return {
        "product": bw.product,
        "version": bw.version,
        "concept_id": bw.concept_id,
        "start_utc": bw.start_utc,
        "end_utc": bw.end_utc,
        "retrieved_utc": bw.retrieved_utc,
        "bbox": list(bw.grid_spec.bbox),
        "grid_shape": list(bw.shape),
        "cell_km": bw.grid_spec.cell_km,
        "n_cells": bw.grid_spec.n_cells,
        "burned_area_km2": round(bw.burned_area_km2, 6),
        "unmapped": bw.shares["unmapped"],
        "unburned_land": bw.shares["unburned_land"],
        "water": bw.shares["water"],
        "burned_other_day": bw.shares["burned_other_day"],
        "burned_in_window": bw.shares["burned_in_window"],
        "mapped": bw.shares["mapped"],
        "burned_of_mapped_land": bw.shares["burned_of_mapped_land"],
        "counts": dict(bw.counts),
        "first_burn_date": bw.first_burn_date,
        "last_burn_date": bw.last_burn_date,
        "burn_day_counts": dict(bw.burn_day_counts),
        "source": dict(bw.source),
    }


def list_windows(
    box: tuple[float, float, float, float] | list[float],
    *,
    product: str = DEFAULT_PRODUCT,
    root: Path | None = None,
) -> list[dict[str, Any]]:
    """List explicitly saved burned-area windows on disk for a box and product."""
    prod = canonical_product(product)
    base = default_burned_dir() if root is None else Path(root)
    win_box_dir = _resolve_box_dir(base / "windows" / prod, box)
    if win_box_dir is None:
        return []
    out: list[dict[str, Any]] = []
    for p in sorted(win_box_dir.glob("*.npz")):
        try:
            bw = _load_window_npz(p)
        except ClosedBurnedWindow:
            continue
        out.append({
            "product": bw.product,
            "version": bw.version,
            "start_utc": bw.start_utc,
            "end_utc": bw.end_utc,
            "burned_in_window": bw.shares["burned_in_window"],
            "burned_area_km2": round(bw.burned_area_km2, 6),
            "first_burn_date": bw.first_burn_date,
            "last_burn_date": bw.last_burn_date,
            "retrieved_utc": bw.retrieved_utc,
        })
    return out
