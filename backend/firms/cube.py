"""The fire cube: monthly counts and fire radiative power of every NASA FIRMS country file, per cell of a global
quarter degree grid, platform, day and night, kind, the pixel's size across the swath and confidence.

The builder is backend/firms/cube_build.py; the shape is in docs/cube.md. This module holds the grid and the code
layout (one place, read by the builder, the reader and the routes) and the reader, which memory-maps a build and
answers any box in milliseconds.

Grid: col = floor((lon + 180) / 0.25), j = floor((lat + 90) / 0.25), row = 719 - j (row 0 is the north), cell =
row * 1440 + col. A cell holds rows with west <= lon < east and south <= lat < north; lon 180 goes to the last column
and lat 90 to the first row.
"""

from __future__ import annotations

import calendar as _cal
import datetime as _dt
import json
import math
import os
from pathlib import Path
import sys
import threading
from typing import Any

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

CUBE_VERSION: int = 1
STEP_DEG: float = 0.25
N_COLS: int = 1440
N_ROWS: int = 720
N_CELLS: int = N_COLS * N_ROWS
FIRST_YEAR, FIRST_MONTH = 2000, 11  # month index 0; Terra's first month
FIRST_DAY: _dt.date = _dt.date(2000, 11, 1)  # day index 0

PLATFORMS: tuple[str, ...] = ("Terra", "Aqua", "Suomi NPP", "NOAA-20")
DAYNIGHT: tuple[str, ...] = ("day", "night")
KINDS: tuple[str, ...] = ("fire", "volcano", "static", "offshore")  # FIRMS type 0 (or none), 1, 2, 3
SCAN_EDGES_KM: dict[str, tuple[float, ...]] = {"MODIS": (1.25, 1.75, 2.5), "VIIRS": (0.47, 0.66, 0.94)}
N_SCAN: int = 4
CONF_CLASSES: tuple[str, ...] = ("low", "nominal", "high")
MODIS_CONF_EDGES: tuple[int, ...] = (30, 80)  # below 30 low, 30 to 79 nominal, 80 and up high
VIIRS_CONF: dict[str, int] = {"l": 0, "n": 1, "h": 2, "low": 0, "nominal": 1, "high": 2}
N_CODES: int = len(PLATFORMS) * 2 * len(KINDS) * N_SCAN * len(CONF_CLASSES)  # 384
FAMILIES: dict[str, tuple[int, ...]] = {"modis": (0, 1), "viirs": (2, 3)}

RECORD_DTYPE = np.dtype([("month", "<u2"), ("code", "<u2"), ("rows", "<u4"), ("frp", "<f4")])
PART_DTYPE = np.dtype([("cell", "<u4"), ("month", "<u2"), ("code", "<u2"), ("rows", "<u4"), ("frp", "<f4")])


def encode(platform: Any, daynight: Any, kind: Any, scan: Any, conf: Any) -> Any:
    return (((platform * 2 + daynight) * len(KINDS) + kind) * N_SCAN + scan) * len(CONF_CLASSES) + conf


def decode(code: Any) -> dict[str, Any]:
    """{platform, daynight, kind, scan, conf} of a code (or an array of codes)."""
    k = len(CONF_CLASSES)
    return {
        "conf": code % k,
        "scan": code // k % N_SCAN,
        "kind": code // (k * N_SCAN) % len(KINDS),
        "daynight": code // (k * N_SCAN * len(KINDS)) % 2,
        "platform": code // (k * N_SCAN * len(KINDS) * 2),
    }


def month_index(year: int, month: int) -> int:
    return (year - FIRST_YEAR) * 12 + (month - FIRST_MONTH)


def month_label(m: int) -> str:
    k = FIRST_MONTH - 1 + int(m)
    return f"{FIRST_YEAR + k // 12:04d}-{k % 12 + 1:02d}"


def day_label(d: int) -> str:
    return (FIRST_DAY + _dt.timedelta(days=int(d))).isoformat()


def col_of(lon: Any) -> Any:
    return np.clip(np.floor((np.asarray(lon, dtype=np.float64) + 180.0) / STEP_DEG), 0, N_COLS - 1).astype(np.int64)


def row_of(lat: Any) -> Any:
    j = np.clip(np.floor((np.asarray(lat, dtype=np.float64) + 90.0) / STEP_DEG), 0, N_ROWS - 1).astype(np.int64)
    return (N_ROWS - 1) - j


def cell_of(lon: Any, lat: Any) -> Any:
    return row_of(lat) * N_COLS + col_of(lon)


def cell_box(cell: int) -> tuple[float, float, float, float]:
    r, c = divmod(int(cell), N_COLS)
    w = -180.0 + c * STEP_DEG
    n = 90.0 - r * STEP_DEG
    return (w, n - STEP_DEG, w + STEP_DEG, n)


def grid_json() -> dict[str, Any]:
    return {
        "cube_version": CUBE_VERSION,
        "grid": {"kind": "latitude and longitude, plate carree", "step_deg": STEP_DEG, "cols": N_COLS, "rows": N_ROWS,
                 "col": "floor((lon + 180) / step)", "row": "rows - 1 - floor((lat + 90) / step); row 0 is the north",
                 "cell": "row * cols + col",
                 "edges": "a cell holds west <= lon < east and south <= lat < north; lon 180 is in the last column "
                          "and lat 90 in the first row"},
        "months": {"index_0": f"{FIRST_YEAR:04d}-{FIRST_MONTH:02d}", "index": "(year - 2000) * 12 + (month - 11)"},
        "days": {"index_0": FIRST_DAY.isoformat(), "from": "acq_date, UTC"},
        "platforms": list(PLATFORMS),
        "daynight": list(DAYNIGHT),
        "kinds": {"names": list(KINDS), "from": "FIRMS type 0 (or a file with no type column), 1, 2, 3"},
        "scan_classes": {"edges_km": {k: list(v) for k, v in SCAN_EDGES_KM.items()},
                         "class": "number of edges the row's scan reaches (scan >= edge), 0 to 3; the VIIRS edges are "
                                  "the MODIS ones times its 375 m nadir pixel"},
        "confidence_classes": {"names": list(CONF_CLASSES), "VIIRS": "l, n, h",
                               "MODIS": f"below {MODIS_CONF_EDGES[0]} low, {MODIS_CONF_EDGES[0]} to "
                                        f"{MODIS_CONF_EDGES[1] - 1} nominal, {MODIS_CONF_EDGES[1]} and up high"},
        "code": "(((platform * 2 + daynight) * 4 + kind) * 4 + scan_class) * 3 + confidence_class",
        "n_codes": N_CODES,
        "record_dtype": [list(f) for f in RECORD_DTYPE.descr],
    }


# Where the cube lives


def world_dir() -> Path:
    v = os.environ.get("ISOGON_WORLD_DIR", "").strip()
    return Path(v).expanduser() if v else _REPO_ROOT / "data" / "cache" / "world"


def cube_dir() -> Path:
    return world_dir() / "cube"


def current_build(root: Path | None = None) -> Path | None:
    """The build the `current` link of the cube folder points at, or None before the first build."""
    link = (root or cube_dir()) / "current"
    return link.resolve() if link.exists() else None


# Boxes on the grid


def snap(box: tuple[float, float, float, float], how: str = "outer") -> tuple[int, int, int, int]:
    """(c0, c1, r0, r1): the columns [c0, c1) and rows [r0, r1) of the cells a box takes. ``outer`` takes every cell
    the box touches, ``inner`` only the cells wholly inside it."""
    w, s, e, n = (float(v) for v in box)
    x0, x1 = (w + 180.0) / STEP_DEG, (e + 180.0) / STEP_DEG
    y0, y1 = (s + 90.0) / STEP_DEG, (n + 90.0) / STEP_DEG
    eps = 1e-9
    if how == "outer":
        c0, c1 = math.floor(x0 + eps), math.ceil(x1 - eps)
        j0, j1 = math.floor(y0 + eps), math.ceil(y1 - eps)
    elif how == "inner":
        c0, c1 = math.ceil(x0 - eps), math.floor(x1 + eps)
        j0, j1 = math.ceil(y0 - eps), math.floor(y1 + eps)
    else:
        raise ValueError("snap must be 'outer' or 'inner'")
    c0, c1 = max(0, c0), min(N_COLS, c1)
    j0, j1 = max(0, j0), min(N_ROWS, j1)
    if c1 <= c0 or j1 <= j0:
        raise ValueError(f"the box {list(box)} holds no whole cell of the {STEP_DEG} degree grid; use snap=outer")
    return c0, c1, N_ROWS - j1, N_ROWS - j0


def snapped_box(c0: int, c1: int, r0: int, r1: int) -> tuple[float, float, float, float]:
    return (-180.0 + c0 * STEP_DEG, 90.0 - r1 * STEP_DEG, -180.0 + c1 * STEP_DEG, 90.0 - r0 * STEP_DEG)


def area_km2(box: tuple[float, float, float, float]) -> float:
    from backend.firms.real_calendar import box_area_km2

    return box_area_km2(box)


def days_in_month(m: int) -> int:
    lab = month_label(m)
    return _cal.monthrange(int(lab[:4]), int(lab[5:7]))[1]


# The reader


class CubeMissing(LookupError):
    """No cube build is there to read."""


class Cube:
    """One build of the cube, memory-mapped. Reopens on its own when the `current` link moves to a new build."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or cube_dir()
        self._lock = threading.Lock()
        self._path: Path | None = None
        self._cache: dict[str, Any] = {}

    def _open(self) -> None:
        path = current_build(self.root)
        if path is None:
            raise CubeMissing(f"no cube is built yet under {self.root.name}/ (backend/firms/cube_build.py)")
        if path == self._path:
            return
        with self._lock:
            if path == self._path:
                return
            mm = lambda n: np.load(path / n, mmap_mode="r")  # noqa: E731
            self.grid = json.loads((path / "grid.json").read_text(encoding="utf-8"))
            self.manifest = json.loads((path / "manifest.json").read_text(encoding="utf-8"))
            self.countries = json.loads((path / "countries.json").read_text(encoding="utf-8"))
            self.records = mm("records.npy")
            self.cell_start = mm("cell_start.npy")
            self.loaded = mm("loaded.npy")
            self.cell_countries_start = mm("cell_countries_start.npy")
            self.cell_countries = mm("cell_countries.npy")
            self.outage = np.asarray(mm("outage_days.npy"))
            self.delivering = np.asarray(mm("delivering.npy"))  # (4, n_months) bool
            self.n_months = int(self.manifest["n_months"])
            self._cache = {}
            self._path = path

    @property
    def build_id(self) -> str:
        self._open()
        return self._path.name if self._path else ""

    def countries_in(self, c0: int, c1: int, r0: int, r1: int) -> list[str]:
        ids: set[int] = set()
        for r in range(r0, r1):
            a, b = int(self.cell_countries_start[r * N_COLS + c0]), int(self.cell_countries_start[r * N_COLS + c1])
            if b > a:
                ids.update(np.unique(self.cell_countries[a:b]).tolist())
        names = self.countries["ids"]
        return sorted(names[i] for i in ids)

    def box(self, box: tuple[float, float, float, float], how: str = "outer") -> dict[str, Any]:
        """Every table of a box: rows and frp by month, platform, day and night and kind; fire rows (kind 0) by scan
        class and by confidence class; the cells, how many are loaded, and the countries that gave rows there."""
        self._open()
        c0, c1, r0, r1 = snap(box, how)
        parts = [self.records[int(self.cell_start[r * N_COLS + c0]):int(self.cell_start[r * N_COLS + c1])]
                 for r in range(r0, r1)]
        part = np.concatenate(parts) if parts else np.empty(0, dtype=RECORD_DTYPE)
        nm = self.n_months
        m = part["month"].astype(np.int64)
        code = part["code"].astype(np.int64)
        rows = part["rows"].astype(np.float64)
        frp = part["frp"].astype(np.float64)
        dec = decode(code)
        pdk = (dec["platform"] * 2 + dec["daynight"]) * len(KINDS) + dec["kind"]
        k1 = m * (len(PLATFORMS) * 2 * len(KINDS)) + pdk
        size = nm * len(PLATFORMS) * 2 * len(KINDS)
        shape = (nm, len(PLATFORMS), 2, len(KINDS))
        out_rows = np.bincount(k1, weights=rows, minlength=size).reshape(shape)
        out_frp = np.bincount(k1, weights=frp, minlength=size).reshape(shape)
        fire = dec["kind"] == 0
        pd_ = dec["platform"] * 2 + dec["daynight"]
        ks = (m * (len(PLATFORMS) * 2) + pd_) * N_SCAN + dec["scan"]
        kc = (m * (len(PLATFORMS) * 2) + pd_) * len(CONF_CLASSES) + dec["conf"]
        by_scan = np.bincount(ks[fire], weights=rows[fire], minlength=nm * 8 * N_SCAN).reshape(nm, 4, 2, N_SCAN)
        frp_scan = np.bincount(ks[fire], weights=frp[fire], minlength=nm * 8 * N_SCAN).reshape(nm, 4, 2, N_SCAN)
        by_conf = np.bincount(kc[fire], weights=rows[fire], minlength=nm * 8 * 3).reshape(nm, 4, 2, 3)
        lw = np.asarray(self.loaded[r0:r1, c0:c1])
        sb = snapped_box(c0, c1, r0, r1)
        return {
            "box_asked": [float(v) for v in box],
            "snap": how,
            "box": list(sb),
            "cells": int(lw.size),
            "cells_loaded": int((lw > 0).sum()),
            "loaded": bool((lw > 0).any()),
            "countries": self.countries_in(c0, c1, r0, r1),
            "records_read": int(part.size),
            "rows": out_rows.astype(np.int64),
            "frp": out_frp,
            "fire_rows_by_scan": by_scan.astype(np.int64),
            "fire_frp_by_scan": frp_scan,
            "fire_rows_by_confidence": by_conf.astype(np.int64),
        }

    def outage_sets(self, country_ids: list[int] | None = None) -> dict[str, set[str]]:
        """{platform: {date}} of outage days by the calendar's rule, over every loaded country (the build's table)."""
        self._open()
        key = "outage_sets"
        if key not in self._cache:
            self._cache[key] = {PLATFORMS[p]: {day_label(d) for d in np.flatnonzero(self.outage[p])}
                                for p in range(len(PLATFORMS))}
        return self._cache[key]

    def deliver_sets(self) -> dict[str, set[str]]:
        """{platform: {month}} in which any loaded country file has a row of the platform."""
        self._open()
        key = "deliver_sets"
        if key not in self._cache:
            self._cache[key] = {PLATFORMS[p]: {month_label(m) for m in np.flatnonzero(self.delivering[p])}
                                for p in range(len(PLATFORMS))}
        return self._cache[key]

    def calendar_counts(self, t: dict[str, Any]) -> tuple[dict[str, dict[str, dict[str, int]]], dict[str, Any], int]:
        """The counts of a box table in the shape real_calendar.monthly_counts gives (box rule: kind 0 is fire)."""
        rows = t["rows"]
        counts: dict[str, dict[str, dict[str, int]]] = {}
        left: dict[str, dict[str, int]] = {"static": {}, "offshore": {}, "volcano": {}}
        for m in np.flatnonzero(rows.reshape(rows.shape[0], -1).sum(axis=1)):
            lab = month_label(int(m))
            for p, plat in enumerate(PLATFORMS):
                v = rows[m, p]
                if not v.any():
                    continue
                counts.setdefault(lab, {})[plat] = {
                    "day": int(v[0, 0]), "night": int(v[1, 0]),
                    "volcano": int(v[:, 1].sum()), "static": int(v[:, 2].sum()), "offshore": int(v[:, 3].sum())}
                for k, i in (("volcano", 1), ("static", 2), ("offshore", 3)):
                    if v[:, i].sum():
                        left[k][plat] = left[k].get(plat, 0) + int(v[:, i].sum())
        return counts, left, int(rows.sum())
