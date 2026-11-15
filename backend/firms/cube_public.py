"""The public cube: monthly fire rows per cell of the fire cube's grid, in one small file a browser sums any box from.

A static page has no backend, so it cannot ask the cube route for a drawn box. This module writes, from the current
build of the cube (backend/firms/cube.py), the counts a box's Record is computed from: per cell and month, the fire
rows (FIRMS type 0, day and night together, the box rule) of Terra, Aqua, Suomi NPP and NOAA-20, with the cells
that are loaded, the platforms' delivering months and outage days, and the method's fitted tables beside it.

The file is little endian typed arrays, gzipped, read without a library (docs/cube.md, "The public cube"). Cells
and months with no fire row are left out. Cell-months the project's closed rule closes (backend/model/training.py,
`closed_for`: a test fire's region in a year of its fire) are left out too and listed, so a reader answers
"closed" there, never zero.

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/cube_public.py write
  ... check
  ... read --box w,s,e,n
"""

from __future__ import annotations

import argparse
import calendar as _cal
import gzip
import hashlib
import json
from pathlib import Path
import sys
import time
from typing import Any

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms import cube as C  # noqa: E402

FORMAT: str = "isogon-fire-cells"
VERSION: int = 1
MAGIC: bytes = b"IFCELL01"
FILE_NAME: str = "fire-cells.bin.gz"
MANIFEST_NAME: str = "manifest.json"
FITTED_NAME: str = "harmonize-fitted.json"
ESCAPE: int = 255  # a uint8 row count of 255 means: the count is in the platform's escape list
MAX_STEP: int = 255  # a month step above this takes an entry of all zeros between
CHUNK_RECORDS: int = 8_000_000


def public_dir(root: Path | None = None) -> Path:
    return (root or C.cube_dir()) / "public"


def _sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


# What goes in


def fire_table(build: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    """(cell, month, rows) of every (cell, month) with a fire row of any platform, sorted by cell and month;
    rows is (n, 4): Terra, Aqua, Suomi NPP, NOAA-20."""
    rec = np.load(build / "records.npy", mmap_mode="r")
    cs = np.load(build / "cell_start.npy")
    n_months = int(json.loads((build / "manifest.json").read_text(encoding="utf-8"))["n_months"])
    n_p = len(C.PLATFORMS)
    keys, vals = [], []
    for a in range(0, rec.size, CHUNK_RECORDS):
        seg = rec[a:a + CHUNK_RECORDS]
        b = a + seg.size
        # the cell of each record, from the cell index
        c_lo, c_hi = np.searchsorted(cs, a, side="right") - 1, np.searchsorted(cs, b, side="left")
        cell = np.repeat(np.arange(c_lo, c_hi, dtype=np.int64), np.diff(np.clip(cs[c_lo:c_hi + 1], a, b)))
        dec = C.decode(seg["code"].astype(np.int64))
        fire = dec["kind"] == 0
        k = (cell[fire] * n_months + seg["month"][fire].astype(np.int64)) * n_p + dec["platform"][fire]
        u, inv = np.unique(k, return_inverse=True)
        keys.append(u)
        vals.append(np.bincount(inv, weights=seg["rows"][fire].astype(np.float64)))
    k = np.concatenate(keys) if keys else np.empty(0, np.int64)
    u, inv = np.unique(k, return_inverse=True)
    v = np.bincount(inv, weights=np.concatenate(vals) if vals else np.empty(0)).astype(np.int64)
    cm, plat = u // n_p, u % n_p
    cmu, cinv = np.unique(cm, return_inverse=True)
    rows = np.zeros((cmu.size, n_p), dtype=np.int64)
    rows[cinv, plat] = v
    return cmu // n_months, cmu % n_months, rows, int(n_months)


def closed_cells(n_months: int) -> list[dict[str, Any]]:
    """The cells the closed rule closes and their months: every cell whose box meets a test fire's region's context
    box (touching counts), in the years of its fire, by `backend.model.training.closed_for` itself."""
    from backend.firms import region_box
    from backend.model.training import EXCLUSIONS, closed_for, closed_years

    out = []
    for region in EXCLUSIONS:
        years = closed_years(region)
        if not years:
            continue
        w, s, e, n = region_box(region)
        c0, c1, r0, r1 = C.snap((max(-180.0, w - C.STEP_DEG), max(-90.0, s - C.STEP_DEG),
                                 min(180.0, e + C.STEP_DEG), min(90.0, n + C.STEP_DEG)))
        cells = []
        for r in range(r0, r1):
            for c in range(c0, c1):
                cell = r * C.N_COLS + c
                box = C.cell_box(cell)
                if any((closed_for(box, float(_cal.timegm((y, 1, 1, 0, 0, 0))),
                                   float(_cal.timegm((y + 1, 1, 1, 0, 0, 0)))) or {}).get("region_id") == region
                       for y in years):
                    cells.append(cell)
        months = [m for m in range(n_months) if int(C.month_label(m)[:4]) in years]
        out.append({"region_id": region, "years": list(years), "context_box": [w, s, e, n],
                    "months": [months[0], months[-1]] if months else None, "cells": cells})
    return out


# The file


def _with_fillers(cell: np.ndarray, month: np.ndarray, rows: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    """Insert entries of all zeros so that no month step (from 0 at a cell's first entry) exceeds MAX_STEP."""
    first = np.ones(cell.size, dtype=bool)
    first[1:] = cell[1:] != cell[:-1]
    prev = np.where(first, 0, np.concatenate([[0], month[:-1]]))
    need = np.nonzero(month - prev > MAX_STEP)[0]
    pos, fm, fc = [], [], []
    for i in need:
        m = int(prev[i]) + MAX_STEP
        while int(month[i]) - (m - MAX_STEP) > MAX_STEP:
            pos.append(i)
            fm.append(m)
            fc.append(int(cell[i]))
            m += MAX_STEP
    if not pos:
        return cell, month, rows, 0
    p = np.array(pos)
    return (np.insert(cell, p, fc), np.insert(month, p, fm), np.insert(rows, p, np.zeros((len(pos), rows.shape[1]),
                                                                                         dtype=rows.dtype), axis=0),
            len(pos))


def encode(cell: np.ndarray, month: np.ndarray, rows: np.ndarray, loaded: np.ndarray) -> tuple[bytes, list[dict[str, Any]], dict[str, Any]]:
    """(raw bytes, sections, stats). Every section starts on a multiple of 4 bytes."""
    cell, month, rows, fillers = _with_fillers(cell, month, rows)
    cells_u, starts, counts = np.unique(cell, return_index=True, return_counts=True)
    first = np.zeros(cell.size, dtype=bool)
    first[starts] = True
    step = month - np.where(first, 0, np.concatenate([[0], month[:-1]]))
    if step.size and (step.min() < 0 or step.max() > MAX_STEP):
        raise ValueError("a month step out of range")
    if rows.size and rows.max() >= 2**32:
        raise ValueError("a row count does not fit uint32")
    parts: list[tuple[str, np.ndarray]] = [
        ("cell_delta", np.diff(np.concatenate([[0], cells_u])).astype("<u4")),
        ("cell_entries", counts.astype("<u2")),
        ("month_step", step.astype("u1")),
    ]
    escapes = {}
    for p, plat in enumerate(C.PLATFORMS):
        v = rows[:, p]
        big = np.nonzero(v >= ESCAPE)[0]
        parts.append((f"rows_{p}", np.where(v >= ESCAPE, ESCAPE, v).astype("u1")))
        parts.append((f"big_step_{p}", np.diff(np.concatenate([[0], big])).astype("<u4")))
        parts.append((f"big_rows_{p}", v[big].astype("<u4")))
        escapes[plat] = int(big.size)
    parts.append(("loaded", np.packbits(loaded.reshape(-1).astype(bool), bitorder="little")))
    buf = bytearray(MAGIC)
    sections = []
    for name, arr in parts:
        while len(buf) % 4:
            buf.append(0)
        sections.append({"name": name, "dtype": {"u1": "uint8", "<u2": "uint16", "<u4": "uint32"}[arr.dtype.str
                                                                                                  .replace("|", "")],
                         "offset": len(buf), "length": int(arr.size)})
        buf += arr.tobytes()
    stats = {"cells": int(cells_u.size), "entries": int(cell.size), "filler_entries": fillers, "escapes": escapes,
             "max_entries_in_a_cell": int(counts.max()) if counts.size else 0}
    return bytes(buf), sections, stats


def write(root: Path | None = None, out: Path | None = None, log: Any = print) -> dict[str, Any]:
    """Write the public cube of the current build into `out` (default <cube>/public/); returns the manifest."""
    t0 = time.time()
    root = root or C.cube_dir()
    build = C.current_build(root)
    if build is None:
        raise C.CubeMissing(f"no build in {root}")
    out = out or public_dir(root)
    man_b = json.loads((build / "manifest.json").read_text(encoding="utf-8"))
    cell, month, rows, n_months = fire_table(build)
    log(f"fire table: {cell.size} cell-months in {np.unique(cell).size} cells, {time.time() - t0:.1f} s")
    closed = closed_cells(n_months)
    drop = np.zeros(cell.size, dtype=bool)
    dropped = {}
    for c in closed:
        if c["months"] is None:
            continue
        hit = np.isin(cell, np.array(c["cells"], dtype=np.int64)) & (month >= c["months"][0]) & (month <= c["months"][1])
        dropped[c["region_id"]] = {C.PLATFORMS[p]: int(rows[hit, p].sum()) for p in range(len(C.PLATFORMS))}
        drop |= hit
    totals_cube = {C.PLATFORMS[p]: int(rows[:, p].sum()) for p in range(len(C.PLATFORMS))}
    cell, month, rows = cell[~drop], month[~drop], rows[~drop]
    loaded = np.load(build / "loaded.npy")
    raw, sections, stats = encode(cell, month, rows, loaded)
    gz = gzip.compress(raw, compresslevel=9, mtime=0)
    out.mkdir(parents=True, exist_ok=True)
    delivering = np.load(build / "delivering.npy")
    outage = np.load(build / "outage_days.npy")
    month_of_day = np.array([C.month_index((C.FIRST_DAY + _dt_days(d)).year, (C.FIRST_DAY + _dt_days(d)).month)
                             for d in range(outage.shape[1])])
    outage_pm = {C.PLATFORMS[p]: np.bincount(month_of_day[outage[p] > 0], minlength=n_months)[:n_months].astype(int)
                 .tolist() for p in range(len(C.PLATFORMS))}
    from backend.firms.real_calendar import EARTH_RADIUS_KM
    from backend.model.harmonize_fitted import FITTED

    fitted = json.dumps(FITTED, separators=(",", ":"), sort_keys=True).encode()
    manifest = {
        "format": FORMAT, "version": VERSION, "magic": MAGIC.decode(),
        "what": ("fire rows (FIRMS type 0, day and night together, the box rule of the box calendar) per cell of the "
                 "fire cube's grid, month and platform, for a box's Record summed in the browser"),
        "source": {"cube_build": man_b["build_id"], "cube_manifest_sha256": _sha256((build / "manifest.json").read_bytes()),
                   "countries": len(man_b["countries_loaded"]), "world_complete": man_b["world_complete"],
                   "records_sha256": man_b["arrays"]["records.npy"]["sha256"]},
        "grid": {"step_deg": C.STEP_DEG, "n_cols": C.N_COLS, "n_rows": C.N_ROWS,
                 "cell": "row * n_cols + col", "col": "floor((lon + 180) / step_deg)",
                 "row": "n_rows - 1 - floor((lat + 90) / step_deg)",
                 "edges": "a cell holds its west and south edges", "earth_radius_km": EARTH_RADIUS_KM},
        "months": {"first": C.month_label(0), "count": n_months, "last": C.month_label(n_months - 1)},
        "platforms": list(C.PLATFORMS),
        "file": {"name": FILE_NAME, "bytes": len(gz), "sha256": _sha256(gz), "raw_bytes": len(raw), "raw_sha256": _sha256(raw),
                 "endian": "little", "gzip": True},
        "sections": sections,
        "reading": {"cell_delta": "the cells with entries, each as a step from the previous (the first from 0)",
                    "cell_entries": "entries of each such cell, in the order of cell_delta",
                    "month_step": "month index of each entry as a step from the cell's previous entry (the first from 0)",
                    "rows_p": f"fire rows of platform p in the entry; {ESCAPE} means: in big_rows_p, at the place of "
                              "the entry's index among the escaped entries",
                    "big_step_p": "the indices of platform p's escaped entries, each as a step from the previous (the "
                                  "first from 0)",
                    "big_rows_p": "the fire rows of those entries, in the same order",
                    "loaded": "one bit per cell of the grid (byte cell >> 3, bit cell & 7): 1 where some country file "
                              "has a row of any kind; a box with no loaded cell is not loaded, not zero"},
        "delivering": {C.PLATFORMS[p]: delivering[p, :n_months].astype(int).tolist() for p in range(len(C.PLATFORMS))},
        "outage_days": outage_pm,
        "outage_rule": man_b.get("outage_rule"),
        "closed": closed,
        "closed_rule": ("cells whose box meets a test fire's region's context box (touching counts), in the years of "
                        "its fire, by backend/model/training.py closed_for: left out of the file for every platform; "
                        "a box holding one of them answers those months as closed, not zero"),
        "rows_in_cube": totals_cube,
        "rows_in_file": {C.PLATFORMS[p]: int(rows[:, p].sum()) for p in range(len(C.PLATFORMS))},
        "rows_closed": dropped,
        "stats": stats,
        "not_in_it": ("static land source, offshore and active volcano rows; fire radiative power; the day and night "
                      "split; pixel width and confidence classes; the countries of a cell; NOAA-21 and the months "
                      "after the last country file"),
        "fitted": {"name": FITTED_NAME, "sha256": _sha256(fitted), "bytes": len(fitted), "serve": FITTED.get("serve"),
                   "provenance": FITTED.get("provenance", {}).get("cube_build"),
                   "from": "backend/model/harmonize_fitted.py FITTED, as JSON"},
        "seconds": round(time.time() - t0, 1),
    }
    for name, data in ((FILE_NAME, gz), (FITTED_NAME, fitted)):
        tmp = out / f".{name}.tmp"
        tmp.write_bytes(data)
        tmp.replace(out / name)
    tmp = out / f".{MANIFEST_NAME}.tmp"
    tmp.write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    tmp.replace(out / MANIFEST_NAME)
    log(f"public cube: {len(gz)} bytes gzipped ({len(raw)} raw), {stats['entries']} entries, {time.time() - t0:.1f} s")
    return manifest


def _dt_days(d: int) -> Any:
    import datetime as _dt

    return _dt.timedelta(days=int(d))


# The reference reader: what a browser does, in numpy


class PublicCube:
    """Reads the public cube's files as a browser does (gzip, typed arrays) and sums boxes."""

    def __init__(self, folder: Path | None = None, manifest: dict[str, Any] | None = None, data: bytes | None = None) -> None:
        """From a folder written by `write`, or from a manifest and the file's bytes (gzipped or not)."""
        if manifest is None or data is None:
            folder = folder or public_dir()
            manifest = json.loads((folder / MANIFEST_NAME).read_text(encoding="utf-8"))
            data = (folder / manifest["file"]["name"]).read_bytes()
            if _sha256(data) != manifest["file"]["sha256"]:
                raise ValueError("the file's sha256 differs from its manifest")
        self.manifest = manifest
        raw = gzip.decompress(data) if data[:2] == b"\x1f\x8b" else data
        if raw[:len(MAGIC)] != MAGIC:
            raise ValueError("not a public cube file")
        dt = {"uint8": "u1", "uint16": "<u2", "uint32": "<u4"}
        self.s = {x["name"]: np.frombuffer(raw, dtype=dt[x["dtype"]], count=x["length"], offset=x["offset"])
                  for x in self.manifest["sections"]}
        self.n_months = int(self.manifest["months"]["count"])
        self.n_p = len(self.manifest["platforms"])
        self.big_index = [np.cumsum(self.s[f"big_step_{p}"].astype(np.int64)) for p in range(self.n_p)]
        cells = np.cumsum(self.s["cell_delta"].astype(np.int64))
        self.cell_start = np.zeros(C.N_CELLS + 1, dtype=np.int64)
        self.cell_start[cells + 1] = self.s["cell_entries"]
        np.cumsum(self.cell_start, out=self.cell_start)
        step = self.s["month_step"].astype(np.int64)
        run = np.cumsum(step)
        starts = self.cell_start[cells]
        base = np.repeat(np.where(starts > 0, run[np.maximum(starts - 1, 0)], 0), self.s["cell_entries"].astype(np.int64))
        self.month = run - base
        self.loaded = np.unpackbits(self.s["loaded"], bitorder="little")[:C.N_CELLS]
        self.closed = [(set(c["cells"]), c["months"]) for c in self.manifest["closed"] if c["months"]]

    def _rows(self, p: int, a: int, b: int) -> np.ndarray:
        v = self.s[f"rows_{p}"][a:b].astype(np.int64)
        esc = np.nonzero(v == ESCAPE)[0]
        if esc.size:
            j = np.searchsorted(self.big_index[p], esc + a)
            v[esc] = self.s[f"big_rows_{p}"][j]
        return v

    def box(self, box: tuple[float, float, float, float], how: str = "outer") -> dict[str, Any]:
        c0, c1, r0, r1 = C.snap(box, how)
        out = np.zeros((self.n_months, self.n_p), dtype=np.int64)
        closed: set[int] = set()
        loaded = False
        for r in range(r0, r1):
            a, b = int(self.cell_start[r * C.N_COLS + c0]), int(self.cell_start[r * C.N_COLS + c1])
            loaded = loaded or bool(self.loaded[r * C.N_COLS + c0:r * C.N_COLS + c1].any())
            for cells, (m0, m1) in self.closed:
                if any(r * C.N_COLS + c in cells for c in range(c0, c1)):
                    closed.update(range(m0, m1 + 1))
            if a == b:
                continue
            m = self.month[a:b]
            for p in range(self.n_p):
                out[:, p] += np.bincount(m, weights=self._rows(p, a, b), minlength=self.n_months).astype(np.int64)
        return {"box": list(C.snapped_box(c0, c1, r0, r1)), "rows": out, "loaded": loaded,
                "closed_months": sorted(closed), "cells": (c1 - c0) * (r1 - r0)}


# A box's Record from the public file, and the check against the cube route


CHECK_BOXES: dict[str, tuple[float, float, float, float]] = {
    "California, Sierra Nevada": (-121.0, 36.0, -118.0, 38.5),
    "Alberta, Fort McMurray": (-113.0, 55.5, -110.0, 57.5),
    "Yucatan": (-92.0, 17.0, -87.0, 21.5),
    "Alaska interior": (-152.0, 63.0, -142.0, 67.0),
    "Rondonia, Amazon": (-66.0, -13.0, -60.0, -8.0),
    "Tocantins, Cerrado": (-50.0, -13.0, -45.0, -8.0),
    "Central Chile": (-73.5, -38.5, -71.0, -35.0),
    "Patagonia": (-72.0, -46.0, -66.0, -42.0),
    "Portugal": (-9.5, 37.0, -6.2, 42.2),
    "Central Sweden": (14.5, 61.0, 17.0, 62.5),
    "Pontic steppe": (35.0, 45.0, 45.0, 52.0),
    "Sahel, 20 by 10 degrees": (-10.0, 5.0, 10.0, 15.0),
    "Congo basin, 20 by 17 degrees": (15.0, -12.0, 35.0, 5.0),
    "Kruger": (30.5, -25.5, 32.5, -22.0),
    "Ghana": (-3.0, 6.0, 1.0, 11.0),
    "Semey, Kazakhstan": (78.0, 49.0, 83.0, 52.0),
    "Punjab": (73.5, 29.0, 77.5, 32.5),
    "Yakutia, 20 by 12 degrees": (115.0, 58.0, 135.0, 70.0),
    "Kalimantan": (110.0, -4.0, 116.0, 1.0),
    "Northern Australia": (125.0, -18.0, 135.0, -12.0),
}
EDGE_BOXES: dict[str, tuple[float, float, float, float]] = {
    "Fiji, at the antimeridian": (177.0, -19.0, 180.0, -16.0),
    "Plumas grid box, meets a closed region": (-122.5, 39.0, -120.0, 41.0),
    "Southern Ocean, nothing loaded": (-130.0, -50.0, -125.0, -45.0),
}


def _gaps(manifest: dict[str, Any]) -> dict[str, set[str]]:
    """Outage days per platform as the calendar takes them: only their months and number count."""
    out = {}
    for plat, per_month in manifest["outage_days"].items():
        out[plat] = {f"{C.month_label(m)}-{i + 1:02d}" for m, n in enumerate(per_month) for i in range(int(n))}
    return out


def public_record(pub: PublicCube, box: tuple[float, float, float, float], how: str = "outer") -> dict[str, Any] | None:
    """The Record of a box from the public file alone, through the box calendar's own payload; None when not loaded.
    A month the closed rule closes for the box is a month no platform delivers. Only `total` of each platform's
    counts is in the file, so the day and night fields hold the total and zero and are not to be read."""
    from backend.firms import real_calendar as RC

    t = pub.box(box, how)
    if not t["loaded"]:
        return None
    rows = t["rows"]
    plats = pub.manifest["platforms"]
    counts: dict[str, dict[str, dict[str, int]]] = {}
    for m in np.flatnonzero(rows.sum(axis=1)):
        counts[C.month_label(int(m))] = {plats[p]: {"day": int(rows[m, p]), "night": 0} for p in range(len(plats))
                                         if rows[m, p]}
    closed = {C.month_label(m) for m in t["closed_months"]}
    deliver = {plat: {C.month_label(m) for m, on in enumerate(v) if on} - closed
               for plat, v in pub.manifest["delivering"].items()}
    out = RC._calendar_payload(
        counts, int(rows.sum()), tuple(t["box"]), deliver, _gaps(pub.manifest),
        head={"region_id": None, "region_name": RC.box_label(tuple(t["box"]))},
        provenance_where="inside the box on the fire cube's grid, from the public cube file",
        counted_rows="fire rows (FIRMS type 0), day and night together, as the box calendar counts",
        excluded={}, left_out_metrics={}, noaa21_note="not in the file", not_in_calendar="", ignored=[])
    out["closed_months"] = sorted(closed)
    return out


def public_surround(pub: PublicCube, box: tuple[float, float, float, float], grow_deg: float = 2.0) -> dict[str, Any]:
    """`backend.model.harmonize.surround_from_cube` from the public file; a closed month is unknown (NaN)."""
    w, s, e, n = box
    t = pub.box((max(-180.0, w - grow_deg), max(-90.0, s - grow_deg), min(180.0, e + grow_deg), min(90.0, n + grow_deg)))
    r = t["rows"].astype(np.float64)
    r[t["closed_months"], :] = np.nan
    return {"year_month": [C.month_label(m) for m in range(r.shape[0])], "Terra": r[:, 0], "Aqua": r[:, 1],
            "Suomi NPP": r[:, 2], "box": t["box"], "build": pub.manifest["source"]["cube_build"]}


def _same(a: Any, b: Any) -> bool:
    if isinstance(a, float) or isinstance(b, float):
        return a == b or (a is not None and b is not None and abs(float(a) - float(b)) <= 1e-9 * max(1.0, abs(float(a))))
    return a == b


def check(boxes: dict[str, tuple[float, float, float, float]] | None = None, folder: Path | None = None) -> dict[str, Any]:
    """For each box: the Record from the public file against the cube route's answer, month by month (every
    platform's total, null and outage days, every derived figure), the yearly summary, the month medians and the
    summary; the surroundings the served method reads; and the served method's months from either source."""
    from backend.server_cube import cube_route
    from backend.model.harmonize import closed_years_for_box, record_series, surround_from_cube

    pub = PublicCube(folder)
    boxes = boxes or {**CHECK_BOXES, **EDGE_BOXES}
    report: dict[str, Any] = {"public_file": pub.manifest["file"]["sha256"], "cube_build": pub.manifest["source"]["cube_build"],
                              "boxes": {}}
    for name, box in boxes.items():
        t0 = time.perf_counter()
        st, body, _ = cube_route("/api/cube/record", {"box": [",".join(f"{v:g}" for v in box)]})
        route = json.loads(body)
        t1 = time.perf_counter()
        mine = public_record(pub, box)
        t2 = time.perf_counter()
        r: dict[str, Any] = {"box": list(box), "route_status": st, "route_ms": round(1000 * (t1 - t0), 1),
                             "public_ms": round(1000 * (t2 - t1), 1)}
        if st != 200 or mine is None:
            r.update({"route_state": route.get("state"), "public_loaded": mine is not None,
                      "equal": (st == 404) == (mine is None)})
            report["boxes"][name] = r
            continue
        closed = set(mine["closed_months"])
        months = differ = 0
        fields_differ: dict[str, int] = {}
        for a, b in zip(route["records"], mine["records"]):
            if a["year_month"] != b["year_month"]:
                raise ValueError("months out of step")
            if a["year_month"] in closed:
                continue
            months += 1
            bad = False
            for plat, ca in a["raw_counts"].items():
                cb = b["raw_counts"].get(plat)
                if (ca is None) != (cb is None) or (ca is not None and (ca["total"] != cb["total"]
                                                                        or ca["outage_days"] != cb["outage_days"])):
                    fields_differ[f"raw_counts {plat}"] = fields_differ.get(f"raw_counts {plat}", 0) + 1
                    bad = True
            for k, v in a.items():
                if k != "raw_counts" and not _same(v, b.get(k)):
                    fields_differ[k] = fields_differ.get(k, 0) + 1
                    bad = True
            differ += bad
        whole = {}
        for key in ("summary_metrics", "annual_summary", "month_climatology", "regime_markers"):
            ra, rb = route.get(key), mine.get(key)
            if key == "annual_summary":
                strip = lambda ys: [{k: v for k, v in y.items() if k != "raw_counts"} | {  # noqa: E731
                    "totals": {p: (c if not isinstance(c, dict) else c.get("total")) for p, c in (y.get("raw_counts") or {}).items()}}
                    for y in ys if not closed or str(y.get("year")) not in {m[:4] for m in closed}]
                ra, rb = strip(ra), strip(rb)
            if key == "summary_metrics":
                drop = {"downloaded_firms_rows", "ignored_extracts", "static_rows_excluded", "offshore_rows_excluded",
                        "volcano_rows_excluded"}
                ra = {k: v for k, v in ra.items() if k not in drop}
                rb = {k: v for k, v in rb.items() if k not in drop}
            whole[key] = json.dumps(ra, sort_keys=True, default=str) == json.dumps(rb, sort_keys=True, default=str)
        ha, hb = route["harmonization_method"], mine["harmonization_method"]
        whole["ratio_and_validation"] = all(json.dumps(ha.get(k), sort_keys=True) == json.dumps(hb.get(k), sort_keys=True)
                                            for k in ("ratio_terra_aqua", "ratio_terra_only", "validation", "fit_rows"))
        g = tuple(route["bbox"])
        sa, sb = surround_from_cube(g), public_surround(pub, g)
        sur_closed = {C.month_label(x) for x in pub.box(sb["box"])["closed_months"]}
        ok_m = np.array([m not in closed and m not in sur_closed for m in sa["year_month"]])
        sur_equal = all(np.array_equal(np.asarray(sa[p], dtype=np.float64)[ok_m], sb[p][ok_m]) for p in ("Terra", "Aqua", "Suomi NPP"))
        area, lat, cy = RC_area(g), (g[1] + g[3]) / 2.0, closed_years_for_box(g)
        served_a = record_series(route["records"], area, center_lat=lat, closed_years=cy, surround=sa)
        served_b = record_series(mine["records"], area, center_lat=lat, closed_years=cy, surround=sb)
        served_diff = [(x, y) for x, y in zip(served_a["months"], served_b["months"])
                       if x["year_month"] not in closed
                       and any(not _same(x[k], y[k]) for k in ("harmonized_count", "p10_count", "p90_count"))]
        sd = len(served_diff)
        rel = [abs(y["harmonized_count"] - x["harmonized_count"]) / max(abs(x["harmonized_count"]), 1e-9)
               for x, y in served_diff if x["harmonized_count"] is not None and y["harmonized_count"] is not None]
        r.update({"months_compared": months, "months_closed": len(closed), "months_differing": differ,
                  "fields_differing": fields_differ, **{f"{k}_equal": v for k, v in whole.items()},
                  "surroundings_equal": sur_equal, "surroundings_meet_closed_cells": bool(sur_closed),
                  "served_method": served_a["method"]["id"],
                  "served_largest_relative_difference": round(max(rel), 4) if rel else 0.0,
                  "served_months_differing_list": [x["year_month"] for x, _ in served_diff][:24],
                  "served_months_differing": sd,
                  "rows": {p: int(sum((rec["raw_counts"].get(p) or {}).get("total", 0) for rec in mine["records"]))
                           for p in pub.manifest["platforms"]},
                  "equal": differ == 0 and not fields_differ and all(whole.values()) and sur_equal and sd == 0})
        if closed:
            r["closed_effect"] = {
                "route_overlap_ratio": route["summary_metrics"].get("viirs_to_modis_overlap_ratio"),
                "public_overlap_ratio": mine["summary_metrics"].get("viirs_to_modis_overlap_ratio"),
                "why": "the closed months are null in the public Record, so they leave its fit; the cube route keeps them"}
        report["boxes"][name] = r
    for b in report["boxes"].values():
        b["difference_explained_by_closed_months"] = (not b["equal"] and (b.get("months_closed", 0) > 0
                                                                          or b.get("surroundings_meet_closed_cells", False)))
    report["all_equal_or_explained"] = all(b["equal"] or b["difference_explained_by_closed_months"]
                                           for b in report["boxes"].values())
    return report


def RC_area(box: tuple[float, float, float, float]) -> float:
    from backend.firms.real_calendar import box_area_km2

    return box_area_km2(box)


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("write")
    sub.add_parser("check")
    rd = sub.add_parser("read")
    rd.add_argument("--box", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "write":
        m = write()
        print(json.dumps({k: m[k] for k in ("file", "stats", "rows_in_file", "rows_closed", "seconds")}, indent=1))
    elif a.cmd == "check":
        print(json.dumps(check(), indent=1))
    else:
        t = PublicCube().box(tuple(float(v) for v in a.box.split(",")))
        print(json.dumps({"box": t["box"], "loaded": t["loaded"], "closed_months": t["closed_months"],
                          "rows": {C.PLATFORMS[p]: int(t["rows"][:, p].sum()) for p in range(t["rows"].shape[1])}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
