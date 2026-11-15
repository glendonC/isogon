"""Monthly counts per quarter degree cell from the cached FIRMS country files, for measuring harmonization methods.

The Record's calendar counts rows per platform, day and night. Measuring other methods needs more per row: the
coarse pixel's size across the swath (`scan`), its area (`scan` times `track`), the confidence class and the fire
radiative power. This module reads every cached country file once and keeps, per quarter degree cell and month:

  key      cell, month, platform, day or night, scan class, confidence class (packed into one integer)
  count    rows
  frp      summed fire radiative power, MW
  area     summed pixel area, km2 (scan times track)

Rows counted: FIRMS `type` 0 only, the box calendar's rule (types 1, 2 and 3 are left out; a box has no elevation
model to tell an inland type 3 row from one at sea). Each source file's sha256 is checked against its manifest and
written in the output's manifest.

Usage:
  uv run --no-project --python 3.12 --with numpy python3 -m backend.model.harmonize_cells build [--workers 6]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import itertools
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any

import numpy as np

from backend.firms.archive import FIRMS_CACHE_DIR, PRODUCTS, _platform, read_manifest

PLATFORMS: tuple[str, ...] = ("Terra", "Aqua", "Suomi NPP", "NOAA-20")
FIRST_YEAR: int = 2000
N_MONTHS: int = 26 * 12                      # January 2000 to December 2025
CELL_DEG: float = 0.25
N_LAT: int = 720
N_LON: int = 1440
# Classes of the pixel's size across the swath, km, the fire cube's edges (a class is the number of edges the scan
# reaches). MODIS grows from 1.0 under the satellite to about 4.8 at the swath edge; the VIIRS edges are the MODIS
# ones times its 375 m nadir pixel.
SCAN_EDGES: dict[str, tuple[float, ...]] = {"MODIS": (1.25, 1.75, 2.5), "VIIRS": (0.47, 0.66, 0.94)}
N_SCAN: int = 4
# Confidence classes 0 low, 1 nominal, 2 high: MODIS by the FIRMS limits 30 and 80; VIIRS by its letter.
N_CONF: int = 3
COUNTED_TYPE: str = "0"
OUT_DIR: Path = FIRMS_CACHE_DIR.parent / "harmonize"
CHUNK_ROWS: int = 400_000


def pack(cell: np.ndarray, month: np.ndarray, plat: np.ndarray, day: np.ndarray, scan: np.ndarray,
         conf: np.ndarray) -> np.ndarray:
    k = cell.astype(np.int64) * N_MONTHS + month
    k = (k * len(PLATFORMS) + plat) * 2 + day
    return (k * N_SCAN + scan) * N_CONF + conf


def unpack(key: np.ndarray) -> dict[str, np.ndarray]:
    k = key.astype(np.int64)
    conf = k % N_CONF
    k //= N_CONF
    scan = k % N_SCAN
    k //= N_SCAN
    day = k % 2
    k //= 2
    plat = k % len(PLATFORMS)
    k //= len(PLATFORMS)
    month = k % N_MONTHS
    cell = k // N_MONTHS
    return {"cell": cell, "iy": cell // N_LON, "ix": cell % N_LON, "month": month, "platform": plat, "day": day,
            "scan": scan, "conf": conf}


def _conf_class(values: tuple[str, ...], instrument: str) -> np.ndarray:
    if instrument == "VIIRS":
        lut = {"l": 0, "n": 1, "h": 2}
        return np.array([lut.get(v, 1) for v in values], dtype=np.int64)
    c = np.array(values, dtype=np.float64)
    return np.where(c < 30, 0, np.where(c < 80, 1, 2)).astype(np.int64)


def aggregate_file(path: str, product: str) -> dict[str, Any]:
    """One country file to unique keys with their sums. Pure in what it reads: the file alone."""
    instrument = PRODUCTS[product].instrument
    edges = np.array(SCAN_EDGES[instrument])
    keys, counts, frps, areas = [], [], [], []
    rows = kept = 0
    h = hashlib.sha256()
    with open(path, "rb") as fb:
        for block in iter(lambda: fb.read(1 << 24), b""):
            h.update(block)
    with open(path, encoding="utf-8", newline="") as fh:
        r = csv.reader(fh)
        col = {c: i for i, c in enumerate(next(r))}
        i_t = col.get("type")
        while True:
            chunk = list(itertools.islice(r, CHUNK_ROWS))
            if not chunk:
                break
            rows += len(chunk)
            cols = list(zip(*chunk))
            keep = (np.array(cols[i_t]) == COUNTED_TYPE) if i_t is not None else np.ones(len(chunk), dtype=bool)
            if not keep.any():
                continue
            idx = np.flatnonzero(keep)
            kept += idx.size

            def take(name: str, dtype: Any = np.float64) -> np.ndarray:
                return np.array(cols[col[name]], dtype=dtype)[idx]

            lat, lon = take("latitude"), take("longitude")
            dates = [cols[col["acq_date"]][i] for i in idx]
            year = np.array([int(d[:4]) for d in dates], dtype=np.int64)
            mon = np.array([int(d[5:7]) for d in dates], dtype=np.int64)
            month = (year - FIRST_YEAR) * 12 + mon - 1
            sats = cols[col["satellite"]]
            lut = {s: PLATFORMS.index(_platform(product, s)) for s in set(sats[i] for i in idx)}
            plat = np.array([lut[sats[i]] for i in idx], dtype=np.int64)
            dn = cols[col["daynight"]]
            day = np.array([1 if dn[i] == "D" else 0 for i in idx], dtype=np.int64)
            scan_km, track_km = take("scan"), take("track")
            scan = np.searchsorted(edges, scan_km, side="right").astype(np.int64)
            conf = _conf_class(tuple(cols[col["confidence"]][i] for i in idx), instrument)
            frp = take("frp")
            iy = np.clip(np.floor((lat + 90.0) / CELL_DEG).astype(np.int64), 0, N_LAT - 1)
            ix = np.clip(np.floor((lon + 180.0) / CELL_DEG).astype(np.int64), 0, N_LON - 1)
            k = pack(iy * N_LON + ix, month, plat, day, scan, conf)
            u, inv = np.unique(k, return_inverse=True)
            keys.append(u)
            counts.append(np.bincount(inv, minlength=u.size).astype(np.int64))
            frps.append(np.bincount(inv, weights=frp, minlength=u.size))
            areas.append(np.bincount(inv, weights=scan_km * track_km, minlength=u.size))
    if keys:
        k = np.concatenate(keys)
        u, inv = np.unique(k, return_inverse=True)
        out = {"key": u,
               "count": np.bincount(inv, weights=np.concatenate(counts), minlength=u.size).astype(np.int64),
               "frp": np.bincount(inv, weights=np.concatenate(frps), minlength=u.size),
               "area": np.bincount(inv, weights=np.concatenate(areas), minlength=u.size)}
    else:
        out = {"key": np.zeros(0, np.int64), "count": np.zeros(0, np.int64), "frp": np.zeros(0), "area": np.zeros(0)}
    out.update(path=path, product=product, rows=rows, kept=kept, sha256=h.hexdigest())
    return out


def source_files(cache_dir: Path = FIRMS_CACHE_DIR) -> list[tuple[Path, str]]:
    out = []
    for product in ("modis", "viirs-snpp", "viirs-jpss1"):
        base = cache_dir / "raw" / product
        for p in sorted(base.rglob("*.csv")) if base.is_dir() else []:
            if read_manifest(p) is not None:
                out.append((p, product))
    return out


def build(cache_dir: Path = FIRMS_CACHE_DIR, out_dir: Path = OUT_DIR, workers: int = 6) -> dict[str, Any]:
    files = source_files(cache_dir)
    # largest first, so the pool ends together
    files.sort(key=lambda f: -f[0].stat().st_size)
    parts = []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for res in ex.map(aggregate_file, [str(p) for p, _ in files], [pr for _, pr in files]):
            parts.append(res)
    lineage = []
    for res in sorted(parts, key=lambda r: r["path"]):
        man = read_manifest(Path(res["path"])) or {}
        if man.get("sha256") and man["sha256"] != res["sha256"]:
            raise ValueError(f"{res['path']}: sha256 differs from its manifest")
        lineage.append({"file": str(Path(res["path"]).relative_to(cache_dir)), "sha256": res["sha256"],
                        "rows": res["rows"], "rows_counted": res["kept"], "source_url": man.get("source_url")})
    countries = sorted({Path(r["path"]).stem.split("_", 2)[2] for r in parts})
    # rows per cell and country file, so a place can be given the country that holds most of its rows
    cc = np.concatenate([unpack(p["key"])["cell"] * len(countries) + countries.index(Path(p["path"]).stem.split("_", 2)[2])
                         for p in parts])
    cu, cinv = np.unique(cc, return_inverse=True)
    crow = np.bincount(cinv, weights=np.concatenate([p["count"] for p in parts]), minlength=cu.size).astype(np.int64)
    k = np.concatenate([p["key"] for p in parts])
    u, inv = np.unique(k, return_inverse=True)
    arrays = {"key": u,
              "count": np.bincount(inv, weights=np.concatenate([p["count"] for p in parts]), minlength=u.size).astype(np.int64),
              "frp": np.bincount(inv, weights=np.concatenate([p["frp"] for p in parts]), minlength=u.size),
              "area": np.bincount(inv, weights=np.concatenate([p["area"] for p in parts]), minlength=u.size),
              "country_cell": cu // len(countries), "country_index": cu % len(countries), "country_rows": crow}
    out_dir.mkdir(parents=True, exist_ok=True)
    npz = out_dir / "cells.npz"
    np.savez(npz, **arrays)
    digest = hashlib.sha256(npz.read_bytes()).hexdigest()
    manifest = {
        "what": "rows per quarter degree cell, month, platform, day or night, scan class and confidence class, with "
                "summed FRP and pixel area, from the cached FIRMS country files",
        "counted_rows": "FIRMS type 0 only (types 1, 2 and 3 left out), the box calendar's rule",
        "grid": {"cell_deg": CELL_DEG, "lat_origin": -90.0, "lon_origin": -180.0, "n_lat": N_LAT, "n_lon": N_LON},
        "months": {"first": f"{FIRST_YEAR}-01", "count": N_MONTHS},
        "platforms": list(PLATFORMS),
        "scan_edges_km": {k: list(v) for k, v in SCAN_EDGES.items()},
        "confidence_classes": {"MODIS": "low below 30, nominal 30 to 79, high 80 and above",
                               "VIIRS": "l, n, h"},
        "countries": countries,
        "keys": int(u.size),
        "rows_read": int(sum(r["rows"] for r in lineage)),
        "rows_counted": int(arrays["count"].sum()),
        "cells_npz_sha256": digest,
        "sources": lineage,
    }
    (out_dir / "cells.manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    return manifest


def load(out_dir: Path = OUT_DIR) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    with np.load(out_dir / "cells.npz") as z:
        arrays = {k: z[k] for k in z.files}
    manifest = json.loads((out_dir / "cells.manifest.json").read_text(encoding="utf-8"))
    return arrays, manifest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["build"])
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    m = build(workers=a.workers)
    print(json.dumps({k: v for k, v in m.items() if k != "sources"}, indent=1))



CODE: tuple[str, ...] = ("T", "A", "S", "J")


def place_table(arrays: dict[str, np.ndarray], countries: list[str], place_deg: float,
                month_first: int = 12 * 12, month_last: int = N_MONTHS - 1) -> dict[str, Any]:
    """Channels of shape (places, months) for square places of `place_deg` degrees aligned to the grid, over the
    months [month_first, month_last] counted from January 2000. Every place with a counted row in those months is
    kept. The channel names are those of `backend.model.harmonize.CHANNELS`."""
    f = int(round(place_deg / CELL_DEG))
    if f < 1 or abs(f * CELL_DEG - place_deg) > 1e-9:
        raise ValueError("a place is a whole number of grid cells")
    d = unpack(arrays["key"])
    sel = (d["month"] >= month_first) & (d["month"] <= month_last)
    d = {k: v[sel] for k, v in d.items()}
    count, frp, area = arrays["count"][sel].astype(np.float64), arrays["frp"][sel], arrays["area"][sel]
    n_lon_p = N_LON // f
    raw = (d["iy"] // f) * n_lon_p + d["ix"] // f
    pu, pinv = np.unique(raw, return_inverse=True)
    T = month_last - month_first + 1
    flat = pinv * T + (d["month"] - month_first)
    size = pu.size * T

    def acc(mask: np.ndarray, w: np.ndarray) -> np.ndarray:
        return np.bincount(flat[mask], weights=w[mask], minlength=size).reshape(pu.size, T)

    ch: dict[str, np.ndarray] = {}
    for pi, p in enumerate(CODE):
        on = d["platform"] == pi
        for dn, dv in (("D", 1), ("N", 0)):
            m = on & (d["day"] == dv)
            ch[f"n_{p}_{dn}"] = acc(m, count)
            ch[f"frp_{p}_{dn}"] = acc(m, frp)
        if p in ("T", "A"):
            for k in range(N_SCAN):
                m = on & (d["scan"] == k)
                ch[f"n_{p}_s{k}"] = acc(m, count)
                ch[f"frp_{p}_s{k}"] = acc(m, frp)
            ch[f"area_{p}"] = acc(on, area)
        if p in ("T", "A", "S"):
            ch[f"low_{p}"] = acc(on & (d["conf"] == 0), count)
    py, px = pu // n_lon_p, pu % n_lon_p
    lat0 = -90.0 + py * place_deg
    lon0 = -180.0 + px * place_deg
    # the country file that holds most of each place's rows
    cc = arrays["country_cell"]
    craw = (cc // N_LON // f) * n_lon_p + (cc % N_LON) // f
    pos = np.searchsorted(pu, craw)
    ok = (pos < pu.size) & (pu[np.minimum(pos, pu.size - 1)] == craw)
    by = np.zeros((pu.size, len(countries)))
    np.add.at(by, (pos[ok], arrays["country_index"][ok]), arrays["country_rows"][ok])
    country = [countries[i] for i in by.argmax(axis=1)]
    src, dst = _neighbours(pu, py, px, n_lon_p)
    return {"deg": place_deg, "lat0": lat0, "lon0": lon0, "months": np.arange(month_first, month_last + 1),
            "channels": ch, "country": country, "nb_src": src, "nb_dst": dst}


def _neighbours(pu: np.ndarray, py: np.ndarray, px: np.ndarray, n_lon_p: int) -> tuple[np.ndarray, np.ndarray]:
    """Pairs (place, neighbour) for the eight places around each, where they exist; longitude wraps."""
    src, dst = [], []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            ny, nx = py + dy, (px + dx) % n_lon_p
            nraw = ny * n_lon_p + nx
            pos = np.searchsorted(pu, nraw)
            hit = (ny >= 0) & (pos < pu.size) & (pu[np.minimum(pos, pu.size - 1)] == nraw)
            src.append(np.flatnonzero(hit))
            dst.append(pos[hit])
    return np.concatenate(src), np.concatenate(dst)


# The fire cube (another part of the project builds it; its shape is fixed by its `grid.json`, `cube_version` 1).
# Its month 0 is November 2000 and its row 0 the northern band; here month 0 is January 2000 and rows count from
# the south. Its records carry rows and FRP per cell, month, platform, day or night, kind, scan class and
# confidence class; pixel area is not kept, so the area-weighted candidate is measured on the country files only.
CUBE_MONTH_OFFSET: int = 10
CUBE_VERSION: int = 1
CUBE_GRID_ROWS_PER_CHUNK: int = 24
# the countries the candidates were designed on, before the cube existed
DESIGN_COUNTRIES: tuple[str, ...] = ("United_States", "Canada", "Greece")


def world_dir() -> Path:
    import os

    return Path(os.environ.get("ISOGON_WORLD_DIR", str(FIRMS_CACHE_DIR.parent / "world")))


def cube_dir() -> Path:
    return world_dir() / "cube" / "current"


def cube_meta(cdir: Path) -> dict[str, Any]:
    grid = json.loads((cdir / "grid.json").read_text(encoding="utf-8"))
    if grid.get("cube_version") != CUBE_VERSION:
        raise ValueError(f"cube_version {grid.get('cube_version')} is not {CUBE_VERSION}")
    man = cdir / "manifest.json"
    countries = json.loads((cdir / "countries.json").read_text(encoding="utf-8"))
    countries = countries.get("countries", countries)
    loaded = sorted(k for k, v in countries.items() if isinstance(v, dict) and v.get("loaded"))
    return {"build": cdir.resolve().name, "manifest_sha256": hashlib.sha256(man.read_bytes()).hexdigest(),
            "countries_loaded": loaded, "grid": grid}


def _decode(code: np.ndarray) -> tuple[np.ndarray, ...]:
    c = code.astype(np.int64)
    return c // 96, c // 48 % 2, c // 12 % 4, c // 3 % 4, c % 3      # platform, night, kind, scan, confidence


def cube_place_table(cdir: Path, place_deg: float, month_first: int = 12 * 12, month_last: int = N_MONTHS - 1
                     ) -> dict[str, Any]:
    """The channels of `place_table`, read from the cube by bands of grid rows. Fire rows only (kind 0, the box
    rule). Places are every place with a fire row of any platform in the months asked for."""
    f = int(round(place_deg / CELL_DEG))
    if f < 1 or abs(f * CELL_DEG - place_deg) > 1e-9:
        raise ValueError("a place is a whole number of grid cells")
    start = np.load(cdir / "cell_start.npy", mmap_mode="r")
    recs = np.load(cdir / "records.npy", mmap_mode="r")
    n_lon_p = N_LON // f
    T = month_last - month_first + 1

    def chunks():
        for r0 in range(0, N_LAT, CUBE_GRID_ROWS_PER_CHUNK):
            r1 = min(N_LAT, r0 + CUBE_GRID_ROWS_PER_CHUNK)
            a, b = int(start[r0 * N_LON]), int(start[r1 * N_LON])
            if a == b:
                continue
            part = np.asarray(recs[a:b])
            lens = np.diff(np.asarray(start[r0 * N_LON:r1 * N_LON + 1]))
            cell = np.repeat(np.arange(r0 * N_LON, r1 * N_LON, dtype=np.int64), lens)
            month = part["month"].astype(np.int64) + CUBE_MONTH_OFFSET
            plat, night, kind, scan, conf = _decode(part["code"])
            keep = (kind == 0) & (month >= month_first) & (month <= month_last)
            if not keep.any():
                continue
            row, col = cell[keep] // N_LON, cell[keep] % N_LON
            iy = (N_LAT - 1) - row
            raw = (iy // f) * n_lon_p + col // f
            yield (raw, month[keep] - month_first, plat[keep], night[keep], scan[keep], conf[keep],
                   part["rows"][keep].astype(np.float64), part["frp"][keep].astype(np.float64))

    pu = np.unique(np.concatenate([c[0] for c in chunks()] or [np.zeros(0, np.int64)]))
    PT = pu.size * T
    acc_pd_n, acc_pd_f = np.zeros(8 * PT), np.zeros(8 * PT)
    acc_sc_n, acc_sc_f = np.zeros(8 * PT), np.zeros(8 * PT)
    acc_low = np.zeros(3 * PT)
    for raw, mo, plat, night, scan, conf, rows, frp in chunks():
        flat = np.searchsorted(pu, raw) * T + mo
        i = (plat * 2 + night) * PT + flat
        acc_pd_n += np.bincount(i, weights=rows, minlength=8 * PT)
        acc_pd_f += np.bincount(i, weights=frp, minlength=8 * PT)
        m = plat < 2
        i = (plat[m] * 4 + scan[m]) * PT + flat[m]
        acc_sc_n += np.bincount(i, weights=rows[m], minlength=8 * PT)
        acc_sc_f += np.bincount(i, weights=frp[m], minlength=8 * PT)
        m = (plat < 3) & (conf == 0)
        acc_low += np.bincount(plat[m] * PT + flat[m], weights=rows[m], minlength=3 * PT)
    ch: dict[str, np.ndarray] = {}
    for pi, p in enumerate(CODE):
        for dn, night in (("D", 0), ("N", 1)):
            k = (pi * 2 + night) * PT
            ch[f"n_{p}_{dn}"] = acc_pd_n[k:k + PT].reshape(pu.size, T)
            ch[f"frp_{p}_{dn}"] = acc_pd_f[k:k + PT].reshape(pu.size, T)
        if p in ("T", "A"):
            for s in range(N_SCAN):
                k = (pi * 4 + s) * PT
                ch[f"n_{p}_s{s}"] = acc_sc_n[k:k + PT].reshape(pu.size, T)
                ch[f"frp_{p}_s{s}"] = acc_sc_f[k:k + PT].reshape(pu.size, T)
            ch[f"area_{p}"] = np.zeros((pu.size, T))
        if p in ("T", "A", "S"):
            ch[f"low_{p}"] = acc_low[pi * PT:(pi + 1) * PT].reshape(pu.size, T)
    py, px = pu // n_lon_p, pu % n_lon_p
    src, dst = _neighbours(pu, py, px, n_lon_p)
    return {"deg": place_deg, "lat0": -90.0 + py * place_deg, "lon0": -180.0 + px * place_deg,
            "months": np.arange(month_first, month_last + 1), "channels": ch, "country": None,
            "nb_src": src, "nb_dst": dst, "with_country": _places_with_countries(cdir, pu, f, n_lon_p)}


def _places_with_countries(cdir: Path, pu: np.ndarray, f: int, n_lon_p: int,
                           names: tuple[str, ...] = DESIGN_COUNTRIES) -> np.ndarray:
    """True for each place holding a cell with a row of one of `names`, by the cube's countries per cell."""
    ids = json.loads((cdir / "countries.json").read_text(encoding="utf-8"))["ids"]
    want = np.array([ids.index(n) for n in names if n in ids])
    cs = np.load(cdir / "cell_countries_start.npy")
    cc = np.load(cdir / "cell_countries.npy")
    hit = np.isin(cc, want)
    cell = np.repeat(np.arange(cs.size - 1), np.diff(cs))[hit]
    row, col = cell // N_LON, cell % N_LON
    raw = np.unique((((N_LAT - 1) - row) // f) * n_lon_p + col // f)
    return np.isin(pu, raw)


def cube_platform_months(cdir: Path, months: np.ndarray) -> tuple[dict[str, set[int]], dict[str, set[int]]]:
    """(months each platform delivers in, months holding an outage day of each platform), by the cube's tables over
    the loaded countries, as month indices from January 2000."""
    import datetime as _dt

    deliver = np.load(cdir / "delivering.npy")
    outage = np.load(cdir / "outage_days.npy")
    d0 = _dt.date(2000, 11, 1)
    day_month = np.array([((d0 + _dt.timedelta(days=int(i))).year - FIRST_YEAR) * 12 + (d0 + _dt.timedelta(days=int(i))).month - 1
                          for i in range(outage.shape[1])])
    out_d, out_o = {}, {}
    for pi, name in enumerate(PLATFORMS):
        out_d[name] = {int(m) + CUBE_MONTH_OFFSET for m in np.flatnonzero(deliver[pi])}
        out_o[name] = {int(m) for m in np.unique(day_month[outage[pi] > 0])}
    return out_d, out_o


if __name__ == "__main__":
    main()
