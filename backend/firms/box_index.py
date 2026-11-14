"""A compact index of every row of the cached FIRMS country files, for counting any box quickly.

The country yearly files (`data/cache/firms/raw/<product>/<year>/<product>_<year>_<Country>.csv`) hold every row of a
country. Counting a box by reading them takes minutes, so each file is read once into a small binary table beside the
cache, `data/cache/firms/index/<product>/<year>/<file stem>.npy`, with a JSON sidecar that records the raw file's
sha256. A table is rebuilt when its file's sha256 changes. Each row keeps only what a calendar counts:

  lat, lon   float32 degrees
  day        days since 2000-01-01 (acq_date, UTC)
  platform   index into PLATFORMS
  flags      bit 0: day overpass (daynight "D"); bits 1 to 3: FIRMS type plus 1 (0 when the file has no type column)

Rows are sorted by latitude, so a box reads one slice of each table. Nothing is dropped and nothing is changed: the
table has one entry per row of its file (the country files of the cache have no exact duplicate rows; the region
extracts built from them dropped none).

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/box_index.py build
  ... status
"""

from __future__ import annotations

import argparse
import array
import calendar as _cal
import csv
import datetime as _dt
import hashlib
import json
from pathlib import Path
import sys
import threading
import time
from typing import Any, Iterable

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.archive import FIRMS_CACHE_DIR, PRODUCTS, _platform, read_manifest  # noqa: E402

PLATFORMS: tuple[str, ...] = ("Terra", "Aqua", "Suomi NPP", "NOAA-20", "NOAA-21")
DTYPE = np.dtype([("lat", "<f4"), ("lon", "<f4"), ("day", "<u2"), ("platform", "u1"), ("flags", "u1")])
EPOCH: _dt.date = _dt.date(2000, 1, 1)
INDEX_VERSION: int = 1
VOLCANO_TYPE: int = 1
STATIC_TYPE: int = 2
OFFSHORE_TYPE: int = 3
KINDS: tuple[str, ...] = ("day", "night", "static", "offshore", "volcano")   # how a box counts each row


def index_dir(cache_dir: Path = FIRMS_CACHE_DIR) -> Path:
    return cache_dir / "index"


def raw_files(cache_dir: Path = FIRMS_CACHE_DIR) -> list[Path]:
    """Every cached country file with a manifest, in a fixed order."""
    out = []
    for product in PRODUCTS:
        base = cache_dir / "raw" / product
        for p in sorted(base.rglob("*.csv")) if base.is_dir() else []:
            if read_manifest(p) is not None:
                out.append(p)
    return out


def country_of(raw: Path) -> str:
    """'United_States' from 'modis_2024_United_States.csv'."""
    product, year, country = raw.stem.split("_", 2)
    return country


def _table_paths(raw: Path, cache_dir: Path) -> tuple[Path, Path]:
    rel = raw.relative_to(cache_dir / "raw")
    base = index_dir(cache_dir) / rel.parent / raw.stem
    return base.with_suffix(".npy"), base.with_suffix(".json")


def build_table(raw: Path, cache_dir: Path = FIRMS_CACHE_DIR) -> dict[str, Any]:
    """Read one country file into its sorted table. Returns the sidecar."""
    man = read_manifest(raw) or {}
    product = raw.parent.parent.name
    lat, lon = array.array("f"), array.array("f")
    day, plat, flags = array.array("H"), array.array("B"), array.array("B")
    days: dict[str, int] = {}
    pcode: dict[str, int] = {}
    with raw.open(encoding="utf-8", newline="") as fh:
        r = csv.reader(fh)
        col = {c: i for i, c in enumerate(next(r))}
        i_lat, i_lon, i_d, i_s, i_dn = col["latitude"], col["longitude"], col["acq_date"], col["satellite"], col["daynight"]
        i_t = col.get("type")
        for rec in r:
            d = rec[i_d]
            k = days.get(d)
            if k is None:
                k = days[d] = (_dt.date.fromisoformat(d) - EPOCH).days
            s = rec[i_s]
            c = pcode.get(s)
            if c is None:
                c = pcode[s] = PLATFORMS.index(_platform(product, s))
            t = rec[i_t] if i_t is not None else ""
            lat.append(float(rec[i_lat]))
            lon.append(float(rec[i_lon]))
            day.append(k)
            plat.append(c)
            flags.append((1 if rec[i_dn] == "D" else 0) | ((int(t) + 1 if t.isdigit() else 0) << 1))
    tab = np.empty(len(lat), dtype=DTYPE)
    tab["lat"] = np.frombuffer(lat, dtype="<f4")
    tab["lon"] = np.frombuffer(lon, dtype="<f4")
    tab["day"] = np.frombuffer(day, dtype="<u2")
    tab["platform"] = np.frombuffer(plat, dtype="u1")
    tab["flags"] = np.frombuffer(flags, dtype="u1")
    tab = tab[np.argsort(tab["lat"], kind="stable")]
    npy, side = _table_paths(raw, cache_dir)
    npy.parent.mkdir(parents=True, exist_ok=True)
    tmp = npy.with_name(npy.name + ".tmp")
    with tmp.open("wb") as fh:
        np.save(fh, tab)
    tmp.replace(npy)
    meta = {
        "index_version": INDEX_VERSION,
        "raw_file": str(raw.relative_to(cache_dir)),
        "raw_sha256": man.get("sha256"),
        "product": product,
        "country": country_of(raw),
        "rows": int(tab.size),
        "extent_wsen": ([float(tab["lon"].min()), float(tab["lat"].min()), float(tab["lon"].max()), float(tab["lat"].max())]
                        if tab.size else None),
        "days": [str(EPOCH + _dt.timedelta(days=int(tab["day"].min()))), str(EPOCH + _dt.timedelta(days=int(tab["day"].max())))]
                if tab.size else None,
        "has_type_column": "type" in col,
        "built_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    side.write_text(json.dumps(meta, indent=1), encoding="utf-8")
    return meta


def _fresh(raw: Path, cache_dir: Path) -> dict[str, Any] | None:
    npy, side = _table_paths(raw, cache_dir)
    if not (npy.is_file() and side.is_file()):
        return None
    try:
        meta = json.loads(side.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    man = read_manifest(raw) or {}
    if meta.get("index_version") != INDEX_VERSION or meta.get("raw_sha256") != man.get("sha256"):
        return None
    return meta


def build(cache_dir: Path = FIRMS_CACHE_DIR, log: Any = print) -> dict[str, Any]:
    """Build every table that is missing or older than its file."""
    built = kept = 0
    t0 = time.time()
    for raw in raw_files(cache_dir):
        if _fresh(raw, cache_dir) is not None:
            kept += 1
            continue
        meta = build_table(raw, cache_dir)
        built += 1
        log(f"indexed {meta['raw_file']}: {meta['rows']} rows")
    return {"built": built, "already_current": kept, "seconds": round(time.time() - t0, 1)}


class BoxIndex:
    """The tables of the cache, memory mapped, with the counts a calendar needs for any box."""

    def __init__(self, cache_dir: Path = FIRMS_CACHE_DIR) -> None:
        self.cache_dir = cache_dir
        self._lock = threading.Lock()
        self._tables: dict[str, tuple[dict[str, Any], np.ndarray]] = {}
        self._signature: tuple[Any, ...] | None = None

    def signature(self) -> tuple[Any, ...]:
        """Name and sha256 of every country file: the counts change only when this does."""
        out = []
        for raw in raw_files(self.cache_dir):
            man = read_manifest(raw) or {}
            out.append((str(raw.relative_to(self.cache_dir)), man.get("sha256")))
        return tuple(out)

    def digest(self) -> str:
        return hashlib.sha256(json.dumps(self.signature()).encode("utf-8")).hexdigest()

    def tables(self) -> list[tuple[dict[str, Any], np.ndarray]]:
        """Every table, built first where missing or stale (a build takes minutes the first time)."""
        sig = self.signature()
        with self._lock:
            if sig == self._signature:
                return list(self._tables.values())
            out: dict[str, tuple[dict[str, Any], np.ndarray]] = {}
            for raw in raw_files(self.cache_dir):
                meta = _fresh(raw, self.cache_dir) or build_table(raw, self.cache_dir)
                npy, _ = _table_paths(raw, self.cache_dir)
                out[meta["raw_file"]] = (meta, np.load(npy, mmap_mode="r"))
            self._tables, self._signature = out, sig
            return list(out.values())

    def countries(self) -> dict[str, list[float]]:
        """{country: [w, s, e, n]} over the rows of its files."""
        ext: dict[str, list[float]] = {}
        for meta, _ in self.tables():
            e = meta.get("extent_wsen")
            if not e:
                continue
            c = meta["country"].replace("_", " ")
            cur = ext.get(c)
            ext[c] = list(e) if cur is None else [min(cur[0], e[0]), min(cur[1], e[1]), max(cur[2], e[2]), max(cur[3], e[3])]
        return {c: [round(v, 4) for v in e] for c, e in sorted(ext.items())}

    def rows_in_box(self, box: tuple[float, float, float, float]) -> Iterable[tuple[dict[str, Any], np.ndarray]]:
        """(sidecar, the rows of that table inside the box) for every table with a row inside it."""
        w, s, e, n = box
        for meta, tab in self.tables():
            ext = meta.get("extent_wsen")
            if not ext or ext[0] > e or ext[2] < w or ext[1] > n or ext[3] < s:
                continue
            lat = tab["lat"]
            i0, i1 = np.searchsorted(lat, np.float32(s), "left"), np.searchsorted(lat, np.float32(n), "right")
            part = np.asarray(tab[i0:i1])
            part = part[(part["lon"] >= np.float32(w)) & (part["lon"] <= np.float32(e))]
            if part.size:
                yield meta, part

    def monthly_counts(self, box: tuple[float, float, float, float]) -> tuple[dict[str, dict[str, dict[str, int]]], dict[str, Any], int, list[str]]:
        """({month: {platform: {"day", "night", "static", "offshore", "volcano"}}}, left-out rows by kind and
        platform, rows read, countries with rows in the box), the shape `real_calendar.monthly_counts` gives for a
        region. Type 1 (active volcano), type 2 (static land source) and type 3 (offshore) rows are left out of the
        fire counts and counted apart."""
        acc: dict[tuple[int, int], np.ndarray] = {}
        countries: set[str] = set()
        n = 0
        for meta, part in self.rows_in_box(box):
            countries.add(meta["country"].replace("_", " "))
            n += int(part.size)
            typ = (part["flags"] >> 1).astype(np.int16) - 1
            kind = np.where(typ == STATIC_TYPE, 2, np.where(typ == OFFSHORE_TYPE, 3, np.where(
                typ == VOLCANO_TYPE, 4, np.where(part["flags"] & 1, 0, 1))))
            d = part["day"].astype(np.int64)
            month = _month_of_day(d)
            nk = len(KINDS)
            key = (month * len(PLATFORMS) + part["platform"].astype(np.int64)) * nk + kind
            u, c = np.unique(key, return_counts=True)
            for k, v in zip(u.tolist(), c.tolist()):
                mp, kd = divmod(k, nk)
                mo, p = divmod(mp, len(PLATFORMS))
                cell = acc.setdefault((mo, p), np.zeros(nk, dtype=np.int64))
                cell[kd] += v
        counts: dict[str, dict[str, dict[str, int]]] = {}
        left_out: dict[str, dict[str, int]] = {k: {} for k in KINDS[2:]}
        for (mo, p), v in sorted(acc.items()):
            label = f"{2000 + mo // 12:04d}-{mo % 12 + 1:02d}"
            plat = PLATFORMS[p]
            counts.setdefault(label, {})[plat] = {k: int(v[i]) for i, k in enumerate(KINDS)}
            for i, k in enumerate(KINDS[2:], start=2):
                if v[i]:
                    left_out[k][plat] = left_out[k].get(plat, 0) + int(v[i])
        return counts, left_out, n, sorted(countries)


_MONTH_OF_DAY: np.ndarray | None = None


def _month_of_day(d: np.ndarray) -> np.ndarray:
    """Months since 2000-01 for days since 2000-01-01."""
    global _MONTH_OF_DAY
    if _MONTH_OF_DAY is None:
        out = np.empty(65536, dtype=np.int64)
        k = 0
        y, m = 2000, 1
        while k < out.size:
            nd = _cal.monthrange(y, m)[1]
            out[k:k + nd] = (y - 2000) * 12 + (m - 1)
            k += nd
            m += 1
            if m == 13:
                y, m = y + 1, 1
        _MONTH_OF_DAY = out
    return _MONTH_OF_DAY[d]


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Index the cached FIRMS country files for counting any box.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build", help="build every table that is missing or older than its file")
    sub.add_parser("status", help="tables, rows and countries")
    args = ap.parse_args(argv)
    if args.cmd == "build":
        print(json.dumps(build(), indent=1))
        return 0
    idx = BoxIndex()
    tabs = idx.tables()
    print(json.dumps({"tables": len(tabs), "rows": sum(m["rows"] for m, _ in tabs), "countries": idx.countries()}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
