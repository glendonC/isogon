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


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("write")
    rd = sub.add_parser("read")
    rd.add_argument("--box", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "write":
        m = write()
        print(json.dumps({k: m[k] for k in ("file", "stats", "rows_in_file", "rows_closed", "seconds")}, indent=1))
    else:
        t = PublicCube().box(tuple(float(v) for v in a.box.split(",")))
        print(json.dumps({"box": t["box"], "loaded": t["loaded"], "closed_months": t["closed_months"],
                          "rows": {C.PLATFORMS[p]: int(t["rows"][:, p].sum()) for p in range(t["rows"].shape[1])}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
