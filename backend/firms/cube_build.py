"""Build the fire cube (backend/firms/cube.py) from the country files of the shared store (backend/firms/world_fetch.py).

Each country is read once into its part, `<cube>/parts/<Country>/records.npy` with `part.json` (every file it was read
from, with its sha256). A part is rebuilt only when one of its files changes, so adding a country builds that
country's part alone. The parts are then merged into one build, `<cube>/builds/<build id>/`, and the `current` link
moves to it in one step, so a reader never sees half a build. Parts are built in parallel, one process per country.

Every row of a file goes in; none is dropped or deduplicated (no line repeats inside a country's files). A row
whose position or date cannot be read is counted in the manifest as skipped. The file's rows must equal the rows its
raw manifest records, and its sha256 the manifest's, or the country is not built.

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/cube_build.py build [--countries ..]
  ... status
"""

from __future__ import annotations

import argparse
import csv
import datetime as _dt
import hashlib
import io
import itertools
import json
import multiprocessing as mp
import os
from pathlib import Path
import shutil
import sys
import time
from typing import Any, Callable, Iterable

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms import archive, cube as C  # noqa: E402
from backend.firms.real_calendar import OUTAGE_MIN_OTHER_ROWS  # noqa: E402

PARSE_VERSION: int = 1  # a part built by another parse version is rebuilt
CHUNK_ROWS: int = 400_000
WORKERS: int = 10
KEEP_BUILDS: int = 3
PRODUCTS: tuple[str, ...] = ("modis", "viirs-snpp", "viirs-jpss1")
KEY_MONTH_BITS: int = 9
KEY_CODE_BITS: int = 9
CSV_FIELD_LIMIT: int = 1 << 20


def store_dir() -> Path:
    return C.world_dir() / "firms"


def _now_utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            b = fh.read(1 << 22)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def _key(cell: np.ndarray, month: np.ndarray, code: np.ndarray) -> np.ndarray:
    return (cell.astype(np.int64) << (KEY_MONTH_BITS + KEY_CODE_BITS)) | (month.astype(np.int64) << KEY_CODE_BITS) | code


def _unkey(key: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    return (key >> (KEY_MONTH_BITS + KEY_CODE_BITS), (key >> KEY_CODE_BITS) & ((1 << KEY_MONTH_BITS) - 1),
            key & ((1 << KEY_CODE_BITS) - 1))


def _group(keys: np.ndarray, rows: np.ndarray, frp: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    u, inv = np.unique(keys, return_inverse=True)
    return u, np.bincount(inv, weights=rows, minlength=u.size), np.bincount(inv, weights=frp, minlength=u.size)


def _floats(values: tuple[str, ...]) -> tuple[np.ndarray, np.ndarray]:
    """(float64 array, ok mask); a value that is not a number is NaN and not ok."""
    try:
        a = np.array(values, dtype=np.float64)
        return a, np.isfinite(a)
    except ValueError:
        out = np.empty(len(values), dtype=np.float64)
        for i, v in enumerate(values):
            try:
                out[i] = float(v)
            except ValueError:
                out[i] = np.nan
        return out, np.isfinite(out)


def _lookup(values: tuple[str, ...], fn: Callable[[str], int]) -> np.ndarray:
    """fn applied to each distinct value, spread back over the rows."""
    u, inv = np.unique(np.array(values), return_inverse=True)
    return np.array([fn(str(v)) for v in u], dtype=np.int64)[inv]


def _platform_code(product: str) -> Callable[[str], int]:
    def f(sat: str) -> int:
        name = archive._platform(product, sat)
        return C.PLATFORMS.index(name) if name in C.PLATFORMS else -1
    return f


def _kind(t: str) -> int:
    t = t.strip()
    return {1: 1, 2: 2, 3: 3}.get(int(t), 0) if t.isdigit() else 0


def _conf_modis(v: str) -> int:
    v = v.strip()
    if not v.lstrip("-").isdigit():
        return -1
    n = int(v)
    return 0 if n < C.MODIS_CONF_EDGES[0] else (1 if n < C.MODIS_CONF_EDGES[1] else 2)


def _conf_viirs(v: str) -> int:
    return C.VIIRS_CONF.get(v.strip().lower(), -1)


def read_file(path: Path, product: str) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, Any]]:
    """(keys, rows, frp, stats) of one country file, grouped by cell, month and code."""
    instrument = archive.PRODUCTS[product].instrument
    edges = np.array(C.SCAN_EDGES_KM[instrument], dtype=np.float64)
    conf_fn = _conf_modis if instrument == "MODIS" else _conf_viirs
    plat_fn = _platform_code(product)
    acc: list[tuple[np.ndarray, np.ndarray, np.ndarray]] = []
    st = {"rows_in_file": 0, "malformed_rows": 0, "skipped_rows": 0, "rows_in_cube": 0, "frp_unread": 0,
          "scan_unread": 0, "confidence_unread": 0, "skipped_reasons": {}}

    def skip(reason: str, n: int) -> None:
        if n:
            st["skipped_rows"] += n
            st["skipped_reasons"][reason] = st["skipped_reasons"].get(reason, 0) + n

    csv.field_size_limit(CSV_FIELD_LIMIT)
    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader)
        col = {c: i for i, c in enumerate(header)}
        st["has_type_column"] = "type" in col
        width = len(header)
        while True:
            chunk = list(itertools.islice(reader, CHUNK_ROWS))
            if not chunk:
                break
            good = [r for r in chunk if len(r) == width]
            st["malformed_rows"] += len(chunk) - len(good)
            st["rows_in_file"] += len(good)
            if not good:
                continue
            cols = list(zip(*good))
            lat, ok_lat = _floats(cols[col["latitude"]])
            lon, ok_lon = _floats(cols[col["longitude"]])
            dates = np.array(cols[col["acq_date"]], dtype="S10")
            b = dates.view(np.uint8).reshape(-1, 10).astype(np.int64) - 48
            ok_date = (b[:, 4] == ord("-") - 48) & (b[:, 7] == ord("-") - 48) & (dates.view(np.uint8).reshape(-1, 10)[:, 9] != 0)
            year = b[:, 0] * 1000 + b[:, 1] * 100 + b[:, 2] * 10 + b[:, 3]
            mon = b[:, 5] * 10 + b[:, 6]
            ok_date &= (mon >= 1) & (mon <= 12)
            month = (year - C.FIRST_YEAR) * 12 + (mon - C.FIRST_MONTH)
            ok_month = ok_date & (month >= 0) & (month < (1 << KEY_MONTH_BITS))
            plat = _lookup(cols[col["satellite"]], plat_fn)
            dn = (np.array(cols[col["daynight"]], dtype="S1") != b"D").astype(np.int64)
            kind = (_lookup(cols[col["type"]], _kind) if "type" in col else np.zeros(len(good), dtype=np.int64))
            scan, ok_scan = _floats(cols[col["scan"]])
            sclass = np.where(ok_scan, np.searchsorted(edges, np.where(ok_scan, scan, 0.0), side="right"), 0)
            st["scan_unread"] += int((~ok_scan).sum())
            conf = _lookup(cols[col["confidence"]], conf_fn)
            st["confidence_unread"] += int((conf < 0).sum())
            conf = np.where(conf < 0, 1, conf)
            frp, ok_frp = _floats(cols[col["frp"]])
            st["frp_unread"] += int((~ok_frp).sum())
            frp = np.where(ok_frp, frp, 0.0)
            ok_pos = ok_lat & ok_lon & (lat >= -90) & (lat <= 90) & (lon >= -180) & (lon <= 180)
            skip("position not read", int((~ok_pos).sum()))
            skip("date not read or before the first month", int((ok_pos & ~ok_month).sum()))
            ok = ok_pos & ok_month
            skip("platform not known", int((ok & (plat < 0)).sum()))
            ok &= plat >= 0
            code = C.encode(plat, dn, kind, sclass, conf)
            cell = C.cell_of(lon[ok], lat[ok])
            keys = _key(cell, month[ok], code[ok])
            acc.append(_group(keys, np.ones(keys.size, dtype=np.float64), frp[ok]))
            st["rows_in_cube"] += int(ok.sum())
    if acc:
        k, r, f = _group(np.concatenate([a[0] for a in acc]), np.concatenate([a[1] for a in acc]),
                         np.concatenate([a[2] for a in acc]))
    else:
        k, r, f = np.empty(0, np.int64), np.empty(0), np.empty(0)
    return k, r, f, st


# Parts


def country_files(store: Path, country: str) -> list[tuple[str, int, Path]]:
    out = []
    for product in PRODUCTS:
        base = store / "raw" / product
        for p in sorted(base.glob(f"*/{product}_*_{country}.csv")) if base.is_dir() else []:
            pr, year, c = archive._split_name(p.name)
            if c == country and pr == product:
                out.append((product, int(year), p))
    return out


def parts_dir(root: Path) -> Path:
    return root / "parts"


def part_fresh(root: Path, store: Path, country: str) -> dict[str, Any] | None:
    pj = parts_dir(root) / country / "part.json"
    if not pj.is_file() or not (parts_dir(root) / country / "records.npy").is_file():
        return None
    try:
        meta = json.loads(pj.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if meta.get("parse_version") != PARSE_VERSION or meta.get("cube_version") != C.CUBE_VERSION:
        return None
    want = {}
    for product, year, p in country_files(store, country):
        m = archive.read_manifest(p) or {}
        want[str(p.relative_to(store))] = m.get("sha256")
    have = {f["path"]: f["sha256"] for f in meta.get("files", [])}
    return meta if want == have else None


def build_part(job: tuple[str, str, str]) -> dict[str, Any]:
    """Read every file of one country into its part. Runs in a worker process."""
    root_s, store_s, country = job
    root, store = Path(root_s), Path(store_s)
    t0 = time.time()
    files = []
    keys, rows, frp = [], [], []
    try:
        for product, year, p in country_files(store, country):
            man = archive.read_manifest(p)
            if man is None:
                raise RuntimeError(f"{p.name} has no manifest")
            sha = _sha256_file(p)
            if sha != man.get("sha256"):
                raise RuntimeError(f"{p.name}: sha256 differs from its manifest")
            k, r, f, st = read_file(p, product)
            if st["rows_in_file"] != int(man.get("rows", -1)):
                raise RuntimeError(f"{p.name}: {st['rows_in_file']} rows read, its manifest records {man.get('rows')}")
            keys.append(k)
            rows.append(r)
            frp.append(f)
            files.append({"path": str(p.relative_to(store)), "product": product, "year": year, "sha256": sha,
                          "bytes": p.stat().st_size, **st})
        if keys:
            k, r, f = _group(np.concatenate(keys), np.concatenate(rows), np.concatenate(frp))
        else:
            k, r, f = np.empty(0, np.int64), np.empty(0), np.empty(0)
        cell, month, code = _unkey(k)
        rec = np.empty(k.size, dtype=C.PART_DTYPE)
        rec["cell"], rec["month"], rec["code"] = cell, month, code
        rec["rows"], rec["frp"] = r, f
        if int(rec["rows"].sum()) != sum(x["rows_in_cube"] for x in files):
            raise RuntimeError("records do not add up to the rows read")
        out_dir = parts_dir(root) / country
        out_dir.mkdir(parents=True, exist_ok=True)
        tmp = out_dir / ".records.npy.tmp"
        with tmp.open("wb") as fh:
            np.save(fh, rec)
        tmp.replace(out_dir / "records.npy")
        meta = {
            "country": country, "cube_version": C.CUBE_VERSION, "parse_version": PARSE_VERSION,
            "built_utc": _now_utc(), "seconds": round(time.time() - t0, 1), "files": files,
            "records": int(rec.size), "rows_in_cube": int(rec["rows"].sum()),
            "rows_in_files": sum(x["rows_in_file"] for x in files),
            "skipped_rows": sum(x["skipped_rows"] for x in files),
            "records_sha256": _sha256_file(out_dir / "records.npy"),
            "digest": hashlib.sha256("".join(f"{x['path']}={x['sha256']};" for x in files).encode()).hexdigest(),
        }
        (out_dir / ".part.json.tmp").write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
        (out_dir / ".part.json.tmp").replace(out_dir / "part.json")
        return {"country": country, "ok": True, "records": meta["records"], "rows": meta["rows_in_cube"],
                "seconds": meta["seconds"]}
    except Exception as exc:
        return {"country": country, "ok": False, "error": f"{type(exc).__name__}: {exc}"}


# Merge


def ready_countries(store: Path) -> list[str]:
    p = store / "READY.json"
    if not p.is_file():
        return []
    return [r["country"] for r in json.loads(p.read_text(encoding="utf-8")).get("countries", [])]


def complete_countries(store: Path) -> list[str]:
    """Every listed country whose every listed file is in the store with its manifest (the part build then checks
    each file's sha256 against its manifest before reading it)."""
    have: dict[str, list[bool]] = {}
    for name in archive.load_listing(store):
        product, year, c = archive._split_name(name)
        if c is None or product not in PRODUCTS:
            continue
        have.setdefault(c, []).append(archive.read_manifest(archive.raw_path(product, int(year), c, store)) is not None)
    return sorted(c for c, v in have.items() if all(v))


def listed_countries(store: Path) -> list[str]:
    out = set()
    for name in archive.load_listing(store):
        product, _, c = archive._split_name(name)
        if c and product in PRODUCTS:
            out.add(c)
    return sorted(out)


def day_table(store: Path, countries: list[str], ids: dict[str, int], n_days: int) -> np.ndarray:
    """(n_countries, 4, n_days) rows per country, platform and day from each raw manifest's satellite_day_rows."""
    out = np.zeros((len(ids), len(C.PLATFORMS), n_days), dtype=np.uint32)
    for c in countries:
        for product, _, p in country_files(store, c):
            man = archive.read_manifest(p) or {}
            for sat, by_day in (man.get("satellite_day_rows") or {}).items():
                name = archive._platform(product, sat)
                if name not in C.PLATFORMS:
                    continue
                pi = C.PLATFORMS.index(name)
                for d, n in by_day.items():
                    k = (_dt.date.fromisoformat(d) - C.FIRST_DAY).days
                    if 0 <= k < n_days:
                        out[ids[c], pi, k] += int(n)
    return out


def outage_rule(days: np.ndarray, min_other: int = OUTAGE_MIN_OTHER_ROWS) -> np.ndarray:
    """(4, n_days) bool: the calendar's outage rule on a (4, n_days) table of rows (real_calendar.outage_days)."""
    days = days.astype(np.int64)
    total = days.sum(axis=0)
    out = np.zeros(days.shape, dtype=bool)
    for p in range(days.shape[0]):
        active = np.flatnonzero(days[p] > 0)
        if not active.size:
            continue
        span = np.zeros(days.shape[1], dtype=bool)
        span[active[0]:active[-1] + 1] = True
        out[p] = span & (days[p] == 0) & ((total - days[p]) >= min_other)
    return out


def _write_npy(path: Path, arr: np.ndarray) -> dict[str, Any]:
    with path.open("wb") as fh:
        np.save(fh, arr)
    return {"sha256": _sha256_file(path), "bytes": path.stat().st_size, "dtype": str(arr.dtype), "shape": list(arr.shape)}


def merge(root: Path, store: Path, countries: list[str], log: Callable[[str], None] = print) -> Path:
    """One build from the parts of ``countries``; moves the `current` link to it."""
    t0 = time.time()
    listed = listed_countries(store) or sorted(countries)
    ids = {c: i for i, c in enumerate(sorted(set(listed) | set(countries)))}
    metas, keys, rows, frp, cc = {}, [], [], [], []
    for c in countries:
        meta = json.loads((parts_dir(root) / c / "part.json").read_text(encoding="utf-8"))
        rec = np.load(parts_dir(root) / c / "records.npy")
        if _sha256_file(parts_dir(root) / c / "records.npy") != meta["records_sha256"]:
            raise RuntimeError(f"part {c}: records.npy differs from its part.json")
        metas[c] = meta
        keys.append(_key(rec["cell"], rec["month"], rec["code"].astype(np.int64)))
        rows.append(rec["rows"].astype(np.float64))
        frp.append(rec["frp"].astype(np.float64))
        uc = np.unique(rec["cell"]).astype(np.int64)
        cc.append(uc * 65536 + ids[c])
    if keys:
        k, r, f = _group(np.concatenate(keys), np.concatenate(rows), np.concatenate(frp))
    else:
        k, r, f = np.empty(0, np.int64), np.empty(0), np.empty(0)
    del keys, rows, frp
    cell, month, code = _unkey(k)
    records = np.empty(k.size, dtype=C.RECORD_DTYPE)
    records["month"], records["code"], records["rows"], records["frp"] = month, code, r, f
    cell_start = np.zeros(C.N_CELLS + 1, dtype=np.int64)
    np.cumsum(np.bincount(cell, minlength=C.N_CELLS), out=cell_start[1:])
    pairs = np.unique(np.concatenate(cc)) if cc else np.empty(0, np.int64)
    pc, pid = pairs // 65536, (pairs % 65536).astype(np.uint16)
    cc_start = np.zeros(C.N_CELLS + 1, dtype=np.int64)
    np.cumsum(np.bincount(pc, minlength=C.N_CELLS), out=cc_start[1:])
    loaded = (np.diff(cell_start) > 0).astype(np.uint8).reshape(C.N_ROWS, C.N_COLS)

    # Months and days span the loaded files: from 2000-11 to the last month any file has a row in.
    last_day = C.FIRST_DAY
    for meta in metas.values():
        for fl in meta["files"]:
            man = archive.read_manifest(store / fl["path"]) or {}
            rng = man.get("acq_date_range") or [None, None]
            if rng[1]:
                last_day = max(last_day, _dt.date.fromisoformat(rng[1]))
    n_months = max(C.month_index(last_day.year, last_day.month) + 1, int(month.max()) + 1 if month.size else 1)
    lab = C.month_label(n_months - 1)
    import calendar as _cal

    end_day = _dt.date(int(lab[:4]), int(lab[5:7]), _cal.monthrange(int(lab[:4]), int(lab[5:7]))[1])
    n_days = (end_day - C.FIRST_DAY).days + 1
    pdr = day_table(store, countries, ids, n_days)
    world_days = pdr.sum(axis=0)
    outage = outage_rule(world_days).astype(np.uint8)
    month_of_day = np.array([C.month_index((C.FIRST_DAY + _dt.timedelta(days=d)).year,
                                           (C.FIRST_DAY + _dt.timedelta(days=d)).month) for d in range(n_days)])
    delivering = np.zeros((len(C.PLATFORMS), n_months), dtype=np.uint8)
    for p in range(len(C.PLATFORMS)):
        delivering[p, np.unique(month_of_day[world_days[p] > 0])] = 1

    build_id = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + hashlib.sha256(
        "".join(f"{c}={metas[c]['digest']};" for c in countries).encode()).hexdigest()[:8]
    out = root / "builds" / build_id
    out.mkdir(parents=True, exist_ok=True)
    arrays = {
        "records.npy": _write_npy(out / "records.npy", records),
        "cell_start.npy": _write_npy(out / "cell_start.npy", cell_start),
        "loaded.npy": _write_npy(out / "loaded.npy", loaded),
        "cell_countries_start.npy": _write_npy(out / "cell_countries_start.npy", cc_start),
        "cell_countries.npy": _write_npy(out / "cell_countries.npy", pid),
        "platform_day_rows.npy": _write_npy(out / "platform_day_rows.npy", pdr),
        "outage_days.npy": _write_npy(out / "outage_days.npy", outage),
        "delivering.npy": _write_npy(out / "delivering.npy", delivering),
    }
    names = sorted(ids, key=lambda c: ids[c])
    country_rec = {}
    for c in names:
        m = metas.get(c)
        country_rec[c] = {"id": ids[c], "loaded": m is not None}
        if m is not None:
            country_rec[c].update({"files": len(m["files"]), "rows": m["rows_in_cube"], "records": m["records"],
                                   "digest": m["digest"]})
    (out / "countries.json").write_text(json.dumps({"ids": names, "countries": country_rec}, indent=1) + "\n",
                                        encoding="utf-8")
    (out / "grid.json").write_text(json.dumps(C.grid_json(), indent=1) + "\n", encoding="utf-8")
    code_files = {n: _sha256_file(_REPO_ROOT / "backend" / "firms" / n) for n in ("cube.py", "cube_build.py")}
    files = [{"country": c, **fl} for c in countries for fl in metas[c]["files"]]
    manifest = {
        "cube_version": C.CUBE_VERSION, "parse_version": PARSE_VERSION, "build_id": build_id, "built_utc": _now_utc(),
        "seconds": round(time.time() - t0, 1),
        "source": "NASA FIRMS country yearly summary files (standard processing), as downloaded, in firms/raw/ "
                  "of the shared store; each file's sha256 is checked against its manifest before it is read",
        "store_files_relative_to": "firms/",
        "first_month": C.month_label(0), "last_month": lab, "n_months": n_months, "n_days": n_days,
        "records": int(records.size), "rows": int(records["rows"].sum()),
        "countries_loaded": countries, "countries_listed": len(listed),
        "world_complete": set(listed) <= set(countries),
        "outage_rule": f"a day inside a platform's operating span on which it has no row in any loaded country file "
                       f"while the other platforms together have at least {OUTAGE_MIN_OTHER_ROWS} (outage_days.npy, "
                       f"over the countries loaded in this build; platform_day_rows.npy keeps each country apart)",
        "outage_days": {C.PLATFORMS[p]: int(outage[p].sum()) for p in range(len(C.PLATFORMS))},
        "code_sha256": code_files,
        "arrays": arrays,
        "parts": {c: {"digest": metas[c]["digest"], "records_sha256": metas[c]["records_sha256"]} for c in countries},
        "files": files,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    layers(out, records, cell_start, loaded, n_months)
    link = root / "current"
    tmp = root / ".current.tmp"
    if tmp.is_symlink() or tmp.exists():
        tmp.unlink()
    os.symlink(Path("builds") / build_id, tmp)
    os.replace(tmp, link)
    for old in sorted((root / "builds").iterdir())[:-KEEP_BUILDS]:
        if old.name != build_id:
            shutil.rmtree(old)
    log(f"build {build_id}: {len(countries)} countries, {records.size} records, {int(records['rows'].sum())} rows, "
        f"{time.time() - t0:.1f} s")
    return out


# World layers


LAYERS: dict[str, dict[str, Any]] = {
    "rows_modis": {"what": "fire rows (kind 0) per cell over every month, MODIS (Terra and Aqua)", "platforms": (0, 1),
                   "measure": "rows", "first_month": None},
    "rows_viirs": {"what": "fire rows (kind 0) per cell over every month, VIIRS (Suomi NPP and NOAA-20)",
                   "platforms": (2, 3), "measure": "rows", "first_month": None},
    "rows_modis_overlap": {"what": "fire rows (kind 0) per cell from 2012-01, MODIS (Terra and Aqua)",
                           "platforms": (0, 1), "measure": "rows", "first_month": "2012-01"},
    "rows_viirs_snpp_overlap": {"what": "fire rows (kind 0) per cell from 2012-01, VIIRS Suomi NPP alone",
                                "platforms": (2,), "measure": "rows", "first_month": "2012-01"},
    "frp_modis": {"what": "summed fire radiative power of fire rows per cell over every month, MODIS, MW",
                  "platforms": (0, 1), "measure": "frp", "first_month": None},
    "frp_viirs": {"what": "summed fire radiative power of fire rows per cell over every month, VIIRS, MW",
                  "platforms": (2, 3), "measure": "frp", "first_month": None},
}
# Colour ramp of the PNGs (log scale, low to high): dark red, red, orange, amber. Neither end is near white or near
# black, so the layer reads on a light page and on a dark one.
RAMP: tuple[tuple[int, int, int], ...] = ((110, 0, 30), (185, 20, 30), (228, 75, 20), (245, 135, 20), (250, 185, 45))
NO_ROWS_RGBA: tuple[int, int, int, int] = (128, 128, 128, 70)  # loaded, none of this family's rows


def layers(out: Path, records: np.ndarray, cell_start: np.ndarray, loaded: np.ndarray, n_months: int) -> dict[str, Any]:
    from PIL import Image

    d = out / "layers"
    d.mkdir(exist_ok=True)
    cell = np.repeat(np.arange(C.N_CELLS, dtype=np.int64), np.diff(cell_start))
    dec = C.decode(records["code"].astype(np.int64))
    info: dict[str, Any] = {"grid": "the cube's grid, (720, 1440), north up, one pixel per cell", "layers": {}}
    ramp = np.array(RAMP, dtype=np.float64)
    for name, spec in LAYERS.items():
        sel = (dec["kind"] == 0) & np.isin(dec["platform"], spec["platforms"])
        if spec["first_month"]:
            y, m = int(spec["first_month"][:4]), int(spec["first_month"][5:7])
            sel &= records["month"] >= C.month_index(y, m)
        w = (records["rows"] if spec["measure"] == "rows" else records["frp"]).astype(np.float64)
        grid = np.bincount(cell[sel], weights=w[sel], minlength=C.N_CELLS).reshape(C.N_ROWS, C.N_COLS)
        arr = grid.astype(np.float32)
        meta = _write_npy(d / f"{name}.npy", arr)
        vmax = float(arr.max()) if arr.size else 0.0
        t = np.log10(1.0 + arr.astype(np.float64)) / np.log10(1.0 + vmax) if vmax > 0 else np.zeros(arr.shape)
        x = np.clip(t, 0, 1) * (len(RAMP) - 1)
        i = np.clip(np.floor(x).astype(np.int64), 0, len(RAMP) - 2)
        fr = (x - i)[..., None]
        rgb = ramp[i] * (1 - fr) + ramp[i + 1] * fr
        rgba = np.zeros((C.N_ROWS, C.N_COLS, 4), dtype=np.uint8)
        has = arr > 0
        rgba[has, :3] = np.round(rgb[has]).astype(np.uint8)
        rgba[has, 3] = 255
        empty = (loaded > 0) & ~has
        rgba[empty] = NO_ROWS_RGBA
        Image.fromarray(rgba, "RGBA").save(d / f"{name}.png", optimize=True)
        meta["png_sha256"] = _sha256_file(d / f"{name}.png")
        info["layers"][name] = {**{k: v for k, v in spec.items() if k != "platforms"},
                                "platforms": [C.PLATFORMS[p] for p in spec["platforms"]],
                                "max": vmax, "total": float(grid.sum()), "cells_with_rows": int(has.sum()), **meta}
    info["png"] = {"scale": "log10(1 + value) / log10(1 + max of the layer)", "ramp_low_to_high": [list(c) for c in RAMP],
                   "transparent": "cells no loaded country file has a row in (not loaded)",
                   "grey": f"loaded cells with none of the layer's rows, RGBA {list(NO_ROWS_RGBA)}",
                   "drawn_from": "the cube's records, nothing interpolated or smoothed"}
    (d / "layers.json").write_text(json.dumps(info, indent=1) + "\n", encoding="utf-8")
    return info


# The whole build


def build(countries: Iterable[str] | None = None, root: Path | None = None, store: Path | None = None,
          workers: int = WORKERS, log: Callable[[str], None] = print) -> dict[str, Any]:
    root = root or C.cube_dir()
    store = store or store_dir()
    root.mkdir(parents=True, exist_ok=True)
    want = list(countries) if countries is not None else complete_countries(store)
    todo = [c for c in want if part_fresh(root, store, c) is None]
    log(f"{len(want)} countries; {len(todo)} parts to build, {len(want) - len(todo)} current")
    failed = []
    if todo:
        # Largest first, so the long ones start early.
        size = {c: sum(p.stat().st_size for _, _, p in country_files(store, c)) for c in todo}
        todo.sort(key=lambda c: -size[c])
        ctx = mp.get_context("spawn")
        with ctx.Pool(max(1, min(workers, len(todo)))) as pool:
            for res in pool.imap_unordered(build_part, [(str(root), str(store), c) for c in todo]):
                if res["ok"]:
                    log(f"part {res['country']}: {res['rows']} rows, {res['records']} records, {res['seconds']} s")
                else:
                    failed.append(res)
                    log(f"FAILED part {res['country']}: {res['error']}")
    built = [c for c in want if part_fresh(root, store, c) is not None]
    out = merge(root, store, built, log)
    return {"build": out.name, "countries": len(built), "failed": failed}


# The check against the calendar


def _index_counts(index: Any, box: tuple[float, float, float, float], half_open: bool, n_months: int,
                  countries: set[str] | None = None) -> np.ndarray:
    """(n_months, 4, 2, 4) rows by month, platform, day and night and kind, counted from the box index tables of the
    repository cache (backend/firms/box_index.py), a reader separate from the cube's. ``half_open`` takes the cube's
    rule (west <= lon < east, south <= lat < north); otherwise the box route's (edges included)."""
    from backend.firms.box_index import _month_of_day

    w, s, e, n = (np.float32(v) for v in box)
    out = np.zeros((n_months, len(C.PLATFORMS), 2, len(C.KINDS)), dtype=np.int64)
    shift = C.month_index(2000, 1)  # box index months count from 2000-01
    for meta, tab in index.tables():
        if countries is not None and meta["country"] not in countries:
            continue
        lat, lon = tab["lat"], tab["lon"]
        i0 = np.searchsorted(lat, s, "left")
        i1 = np.searchsorted(lat, n, "left" if half_open else "right")
        part = np.asarray(tab[i0:i1])
        sel = (part["lon"] >= w) & ((part["lon"] < e) if half_open else (part["lon"] <= e))
        part = part[sel]
        if not part.size:
            continue
        typ = (part["flags"] >> 1).astype(np.int64) - 1
        kind = np.where(typ == 1, 1, np.where(typ == 2, 2, np.where(typ == 3, 3, 0)))
        dn = 1 - (part["flags"] & 1).astype(np.int64)
        m = _month_of_day(part["day"].astype(np.int64)) + shift
        p = part["platform"].astype(np.int64)
        ok = (m >= 0) & (m < n_months) & (p < len(C.PLATFORMS))
        np.add.at(out, (m[ok], p[ok], dn[ok], kind[ok]), 1)
    return out


def _edge_rows(index: Any, box: tuple[float, float, float, float]) -> int:
    """Rows of the box index inside the box, edges included, lying exactly on its east or north edge."""
    w, s, e, n = (np.float32(v) for v in box)
    k = 0
    for _, tab in index.tables():
        lat = tab["lat"]
        part = np.asarray(tab[np.searchsorted(lat, s, "left"):np.searchsorted(lat, n, "right")])
        part = part[(part["lon"] >= w) & (part["lon"] <= e)]
        k += int(((part["lon"] == e) | (part["lat"] == n)).sum())
    return k


def check_regions(regions: Iterable[str] = ("plumas_ca", "lytton_bc", "evia_greece"), cube: Any = None,
                  cache_dir: Path = archive.FIRMS_CACHE_DIR) -> dict[str, Any]:
    """For each region: the calendar's raw_counts on its context box against the cube, every difference counted.

    1. calendar against the box index on the region's box, edges included (the same rows by another reader);
    2. the cube on the grid-aligned boxes around the region's box (every cell it touches, and the cells wholly
       inside) against the box index on those boxes with the cube's edge rule: exact;
    3. the calendar's figure lies between the cube's inner and outer figures, and the rows between them are the
       rows of the cells the region's box cuts;
    4. the box route's figure (edges included) on the outer grid box against the cube: the difference is the rows
       lying exactly on its east or north edge;
    5. outage days and delivering months by the calendar's rule over the calendar's countries, from the cube's per
       country table, against the calendar's own."""
    from backend.firms import real_calendar as RC
    from backend.firms.box_index import BoxIndex

    cube = cube or C.Cube()
    cube._open()
    nm = cube.n_months
    index = BoxIndex(cache_dir)
    report: dict[str, Any] = {"cube_build": cube.build_id, "regions": {}}
    # The calendar's outage rule runs over every country file in its cache, so its countries are those of the files.
    cal_countries = sorted({archive._split_name(m.name[:-len(".manifest.json")])[2] for p in PRODUCTS
                            for m in ((cache_dir / "raw" / p).rglob("*.csv.manifest.json")
                                      if (cache_dir / "raw" / p).is_dir() else [])})
    for r in regions:
        cal = RC.firms_calendar(r, cache_dir)
        box = tuple(cal["bbox"])
        country = archive.REGION_COUNTRY[r]
        cc = {country}
        cal_tab = np.zeros((nm, len(C.PLATFORMS), 2), dtype=np.int64)  # month, platform, [counted + on-sea, static]
        for rec in cal["records"]:
            m = C.month_index(rec["year"], rec["month"])
            for p, plat in enumerate(C.PLATFORMS):
                c = rec["raw_counts"].get(plat)
                if c is None or not 0 <= m < nm:
                    continue
                cal_tab[m, p, 0] = c["total"] + c.get("offshore_on_sea_excluded", 0)
                cal_tab[m, p, 1] = c.get("static_excluded", 0)

        def not_static(t: np.ndarray) -> np.ndarray:
            return t[..., [0, 1, 3]].sum(axis=(-1, -2))

        idx_closed = _index_counts(index, box, False, nm, cc)
        step1 = {
            "non_static_equal": bool((not_static(idx_closed) == cal_tab[..., 0]).all()),
            "static_equal": bool((idx_closed[..., 2].sum(axis=-1) == cal_tab[..., 1]).all()),
            "rows_calendar": int(cal_tab.sum()), "rows_box_index": int(idx_closed.sum()),
        }
        out: dict[str, Any] = {"country": country, "box": list(box), "calendar_vs_box_index_edges_included": step1}
        for how in ("outer", "inner"):
            t = cube.box(box, how)
            g = tuple(t["box"])
            idx_half = _index_counts(index, g, True, nm)
            diff = t["rows"] - idx_half
            out[f"cube_{how}"] = {
                "grid_box": list(g), "cells": t["cells"],
                "equal_to_box_index_same_edge_rule": bool((diff == 0).all()),
                "months_platforms_differing": int((diff.sum(axis=(2, 3)) != 0).sum()),
                "rows_cube": int(t["rows"].sum()), "rows_box_index": int(idx_half.sum()),
                "rows_by_platform": {C.PLATFORMS[p]: int(t["rows"][:, p].sum()) for p in range(len(C.PLATFORMS))},
                "countries": t["countries"],
            }
            if how == "outer":
                outer_t = t
                route = RC.box_calendar(g, index, cache_dir)
                route_tab = np.zeros((nm, len(C.PLATFORMS), len(C.KINDS)), dtype=np.int64)
                for rec in route["records"]:
                    m = C.month_index(rec["year"], rec["month"])
                    for p, plat in enumerate(C.PLATFORMS):
                        c = rec["raw_counts"].get(plat)
                        if c is not None and 0 <= m < nm:
                            route_tab[m, p] = (c["total"], c["volcano_excluded"], c["static_excluded"],
                                               c["offshore_excluded"])
                on_edge = route_tab - t["rows"].sum(axis=2)
                out["box_route_on_outer_grid_box"] = {
                    "route": "GET /api/calendar?source=firms&box=" + RC.box_text(g),
                    "rows_box_route": int(route_tab.sum()), "rows_cube": int(t["rows"].sum()),
                    "difference": int(on_edge.sum()),
                    "rows_on_east_or_north_edge": _edge_rows(index, g),
                    "months_platforms_differing": int((on_edge.sum(axis=2) != 0).sum()),
                    "explained_by": "rows lying exactly on the box's east or north edge: the box route includes "
                                    "both edges, a cube cell holds its west and south edges only",
                    "difference_never_negative": bool((on_edge >= 0).all()),
                }
            else:
                inner_t = t
        ins, outs = not_static(inner_t["rows"]), not_static(outer_t["rows"])
        between = (ins <= cal_tab[..., 0]) & (cal_tab[..., 0] <= outs)
        si, so = inner_t["rows"][..., 2].sum(axis=-1), outer_t["rows"][..., 2].sum(axis=-1)
        out["calendar_between_inner_and_outer"] = {
            "non_static": bool(between.all()),
            "static": bool(((si <= cal_tab[..., 1]) & (cal_tab[..., 1] <= so)).all()),
            "rows_inner": int(ins.sum()), "rows_calendar": int(cal_tab[..., 0].sum()), "rows_outer": int(outs.sum()),
            "by_platform": {C.PLATFORMS[p]: {"inner": int(ins[:, p].sum()), "calendar": int(cal_tab[:, p, 0].sum()),
                                             "outer": int(outs[:, p].sum())} for p in range(len(C.PLATFORMS))},
        }
        report["regions"][r] = out

    # Outage days and delivering months over the calendar's countries, from the cube's per country table.
    pdr = np.load(C.current_build(cube.root) / "platform_day_rows.npy", mmap_mode="r")
    ids = cube.countries["countries"]
    sel = [ids[c]["id"] for c in cal_countries if c in ids]
    mine = outage_rule(np.asarray(pdr[sel]).sum(axis=0))
    theirs = RC.outage_days(RC.platform_days(cache_dir))
    eq = {}
    for p, plat in enumerate(C.PLATFORMS):
        a = {C.day_label(d) for d in np.flatnonzero(mine[p])}
        b = theirs.get(plat, set())
        eq[plat] = {"cube": len(a), "calendar": len(b), "equal": a == b}
    world = {C.PLATFORMS[p]: int(cube.outage[p].sum()) for p in range(len(C.PLATFORMS))}
    report["outage_days_over_the_calendar_countries"] = {"countries": cal_countries, "by_platform": eq}
    report["outage_days_over_every_loaded_country"] = world
    return report


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build the fire cube from the shared store of FIRMS country files.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--countries", nargs="*", default=None,
                   help="default: every country whose every file is in the store with its manifest")
    b.add_argument("--workers", type=int, default=WORKERS)
    sub.add_parser("status")
    sub.add_parser("check", help="the cube against the calendar for the three first regions")
    args = ap.parse_args(argv)
    log = lambda s: print(f"{_now_utc()} {s}", flush=True)  # noqa: E731
    if args.cmd == "build":
        res = build(args.countries, workers=args.workers, log=log)
        print(json.dumps(res, indent=1))
        return 1 if res["failed"] else 0
    if args.cmd == "check":
        print(json.dumps(check_regions(), indent=1))
        return 0
    cur = C.current_build()
    if cur is None:
        print(json.dumps({"current": None}))
        return 0
    man = json.loads((cur / "manifest.json").read_text(encoding="utf-8"))
    print(json.dumps({k: man[k] for k in ("build_id", "built_utc", "records", "rows", "first_month", "last_month",
                                           "world_complete", "outage_days")}
                     | {"countries_loaded": len(man["countries_loaded"])}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
