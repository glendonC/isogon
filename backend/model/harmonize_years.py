"""The harmonized record year by year: one layer per year on the fire cube's grid, and yearly totals.

From the harmonized dataset as served (`harmonize_dataset.py`, its `monthly.npz`):
- `harmonized_<year>.npy`, 2000 to 2025: float32 (720, 1440) on the cube's grid, north up, the harmonized fire rows
  of each cell summed over the months of the year (MODIS on Suomi NPP's scale). NaN where no country file has a row
  (not loaded) and, in a closed year, in the cells that meet a test fire region's context box; 0 in a loaded cell
  with no fire row of any satellite in any month;
- `harmonized.json`: per year its total, its months, each file's digest, the method, the dataset and the cube build;
- `totals.csv` and `totals.json`: per year, for the world and each continent, the fire rows each satellite
  detected and the harmonized rows, and, for 2012 to 2025, each total's held-out error: every overlap year left
  out in turn over every cell at once, the method fitted on the other years, the total of the year left out
  predicted and compared with Suomi NPP's over the same clean months.

No interval is given on a total: fourteen held-out years per total are too few to set an 80 percent interval and
measure its coverage on years that did not set it. The held-out errors are what was measured at the totals.

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.harmonize_years write \
      --dataset <dataset folder> [--out <folder>]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import time
from typing import Any

import numpy as np

from backend.model import harmonize as H
from backend.model import harmonize_cells as C
from backend.model import harmonize_dataset as D
from backend.model import harmonize_eval as E
from backend.model import harmonize_places as PL

YEARS: tuple[int, ...] = tuple(range(2000, 2026))
OVERLAP_YEARS: tuple[int, ...] = tuple(range(2012, 2026))
WORLD: str = "World"
LAYER_VERSION: int = 1
PLATFORM_KEYS: dict[str, str] = {"Terra": "terra", "Aqua": "aqua", "Suomi NPP": "suomi_npp", "NOAA-20": "noaa20"}


def out_dir() -> Path:
    return C.world_dir() / "harmonize" / "years"


def year_of(months: np.ndarray) -> np.ndarray:
    """Calendar year of month indices counted from January 2000."""
    return H.FIRST_YEAR + np.asarray(months) // 12


def yearly_sum(values: np.ndarray, months: np.ndarray, years: tuple[int, ...] = YEARS) -> np.ndarray:
    """(cells, years): the sum over each year's months of the finite values; NaN where a year has none."""
    yr = year_of(months)
    out = np.full((values.shape[0], len(years)), np.nan, dtype=np.float64)
    for j, y in enumerate(years):
        cols = yr == y
        if not cols.any():
            continue
        sub = values[:, cols].astype(np.float64)
        has = np.isfinite(sub).any(axis=1)
        out[:, j] = np.where(has, np.nansum(sub, axis=1), np.nan)
    return out


def grid_of(cube_cell: np.ndarray, values: np.ndarray, loaded: np.ndarray) -> np.ndarray:
    """A (720, 1440) float32 layer: the values at their cells, 0 in loaded cells without one, NaN where not loaded."""
    g = np.where(loaded.astype(bool), 0.0, np.nan).astype(np.float32).ravel()
    g[cube_cell] = values.astype(np.float32)
    return g.reshape(C.N_LAT, C.N_LON)


def cell_continents(cdir: Path, cube_cell: np.ndarray, lon_c: np.ndarray) -> tuple[np.ndarray, int]:
    """The continent (an index into `PL.CONTINENTS`) of each cell by the countries whose files have a row in it,
    the most of them deciding and the first listed breaking a tie; and how many cells hold countries of two
    continents."""
    start = np.load(cdir / "cell_countries_start.npy", mmap_mode="r")
    cc = np.load(cdir / "cell_countries.npy")
    ids = json.loads((cdir / "countries.json").read_text(encoding="utf-8"))["ids"]
    index = {k: i for i, k in enumerate(PL.CONTINENTS)}
    a, b = np.asarray(start[cube_cell]), np.asarray(start[cube_cell + 1])
    out = np.full(cube_cell.size, -1, dtype=np.int64)
    mixed = 0
    for i in range(cube_cell.size):
        names = [PL.continent_of(ids[k], float(lon_c[i])) for k in cc[a[i]:b[i]]]
        conts = [index[n] for n in names if n is not None]
        if not conts:
            continue
        if len(set(conts)) > 1:
            mixed += 1
            counts = {c: conts.count(c) for c in conts}
            out[i] = max(conts, key=lambda c: (counts[c], -conts.index(c)))
        else:
            out[i] = conts[0]
    return out, mixed


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _cells_from_dataset(z: Any) -> dict[str, Any]:
    """The cells of the dataset in the shape `harmonize_dataset` measures them in (south to north, west to east)."""
    cube_cell = z["cell"].astype(np.int64)
    row, col = cube_cell // C.N_LON, cube_cell % C.N_LON
    iy = (C.N_LAT - 1) - row
    raw = iy * C.N_LON + col
    if not (np.diff(raw) > 0).all():
        raise ValueError("the dataset's cells are not in the order it was measured in")
    cells: dict[str, Any] = {"raw": raw, "cube_cell": cube_cell,
                             "lat0": -90.0 + iy * C.CELL_DEG, "lon0": -180.0 + col * C.CELL_DEG,
                             "months": np.arange(D.FIRST_MONTH, D.LAST_MONTH + 1)}
    for p, key in zip(D.PLATS, ("terra_rows", "aqua_rows", "suomi_npp_rows", "noaa20_rows")):
        cells[f"n_{p}"] = z[key]
    cells["nb_src"], cells["nb_dst"] = C._neighbours(raw, iy, col, C.N_LON)
    return cells


def heldout_by_group(cells: dict[str, Any], group: np.ndarray, n_groups: int, closed_2021: np.ndarray,
                     cdir: Path, rows_spec: H.Spec) -> dict[str, Any]:
    """Each group's (and the world's) held-out total per overlap year, over the clean months of that year and the
    cells not closed in it: Suomi NPP's rows, the method's held-out prediction, the method used before (one ratio
    per cell) and MODIS as it is."""
    months_all = cells["months"]
    pm = C.cube_platform_months(cdir, months_all)
    clean_all, sharp_all, info = E.clean_months(months_all, pm)
    ov = slice(D.OVERLAP_FIRST - D.FIRST_MONTH, None)
    m_ov, clean_ov, sharp_ov = months_all[ov], clean_all[ov], sharp_all[ov]
    band = ((PL.band_of(cells["lat0"] + C.CELL_DEG / 2) + 90.0) / PL.BAND_DEG).astype(np.int64)
    places = H.Places(band=band, nb_src=cells["nb_src"], nb_dst=cells["nb_dst"])
    zero = np.broadcast_to(np.float32(0.0), cells["n_T"][:, ov].shape)
    X: dict[str, np.ndarray] = {}
    for p in D.PLATS:
        X[f"n_{p}_D"], X[f"n_{p}_N"] = cells[f"n_{p}"][:, ov], zero
    obs = cells["n_S"][:, ov].astype(np.float64)
    yr = year_of(m_ov)
    closed = np.zeros((obs.shape[0], m_ov.size), dtype=bool)
    closed[:, yr == 2021] = closed_2021[:, None]
    scored = clean_ov[None, :] & ~closed
    preds = {"method": H.held_out(X, m_ov, clean_ov, rows_spec, places, "n", 1.0, sharp_ov),
             "in_use": H.held_out(X, m_ov, clean_ov, H.SPEC_BY_NAME["in_use"], places, "n", 1.0, sharp_ov),
             "none": H.predict_none(X, "n").astype(np.float64)}
    ok = scored & np.isfinite(preds["method"])
    world_monthly = float(np.abs(preds["method"][ok] - obs[ok]).sum() / obs[ok].sum())
    out: dict[str, Any] = {"world_monthly_error_method": round(world_monthly, 4), "clean_months": info["clean_months"],
                           "groups": {}}
    gid = np.where(group >= 0, group, n_groups)
    for j, y in enumerate(OVERLAP_YEARS):
        sel = scored & (yr == y)[None, :]
        n_months = int((clean_ov & (yr == y)).sum())
        o = np.bincount(gid, weights=np.where(sel, obs, 0.0).sum(axis=1), minlength=n_groups + 1)[:n_groups]
        row: dict[str, Any] = {"clean_months": n_months, "suomi_npp": np.append(o, o.sum())}
        for name, pr in preds.items():
            v = np.where(sel & np.isfinite(pr), pr, 0.0).sum(axis=1)
            s = np.bincount(gid, weights=v, minlength=n_groups + 1)[:n_groups]
            row[name] = np.append(s, s.sum())
        out["groups"][y] = row
    return out


def write(dataset: Path, out: Path) -> dict[str, Any]:
    t0 = time.time()
    out.mkdir(parents=True, exist_ok=True)
    cdir = C.cube_dir()
    meta = C.cube_meta(cdir)
    ds_manifest = json.loads((dataset / "manifest.json").read_text(encoding="utf-8"))
    built_from = ds_manifest.get("cube_build") or ds_manifest.get("source", {}).get("cube_build")
    z = np.load(dataset / "monthly.npz")
    cells = _cells_from_dataset(z)
    months = cells["months"]
    loaded = np.load(cdir / "loaded.npy")
    harm = z["harmonized_rows"]
    lat_c, lon_c = cells["lat0"] + C.CELL_DEG / 2, cells["lon0"] + C.CELL_DEG / 2
    closed_2021 = D.closed_cells(cells["lat0"], cells["lon0"], C.CELL_DEG, np.array([2021]))[:, 0]
    pm = C.cube_platform_months(cdir, months)[0]

    # the layers
    yh = yearly_sum(harm, months)
    layers: dict[str, Any] = {}
    for j, y in enumerate(YEARS):
        v = yh[:, j].copy()
        if y == 2021:
            v[closed_2021] = np.nan
        g = grid_of(cells["cube_cell"], v, loaded)
        path = out / f"harmonized_{y}.npy"
        np.save(path, g)
        yr_months = [int(m) for m in months if H.FIRST_YEAR + m // 12 == y]
        layers[str(y)] = {
            "file": path.name, "sha256": _sha(path), "bytes": path.stat().st_size,
            "total_rows": round(float(np.nansum(g)), 1), "cells_with_value": int(np.isfinite(g).sum()),
            "cells_above_zero": int((np.nan_to_num(g) > 0).sum()), "max": round(float(np.nanmax(g)), 2),
            "months": len(yr_months), "partial": len(yr_months) < 12,
            "regime": ("Terra alone" if all(m not in pm["Aqua"] for m in yr_months) else
                       "Terra alone to June, Terra and Aqua from July" if any(m not in pm["Aqua"] for m in yr_months)
                       else "Terra and Aqua"),
            "closed_cells": int(closed_2021.sum()) if y == 2021 else 0}

    # the totals: detected per satellite and harmonized, for the world and each continent
    cont, mixed = cell_continents(cdir, cells["cube_cell"], lon_c)
    nG = len(PL.CONTINENTS)
    gid = np.where(cont >= 0, cont, nG)
    keys = {"terra": "n_T", "aqua": "n_A", "suomi_npp": "n_S", "noaa20": "n_J"}
    yearly = {k: yearly_sum(cells[v], months) for k, v in keys.items()}
    yearly["harmonized"] = yh
    for k in yearly:
        yearly[k][closed_2021, YEARS.index(2021)] = np.nan
    rows_spec = D.method_for(FITTED_SERVE())[1]
    held = heldout_by_group(cells, cont, nG, closed_2021, cdir, rows_spec)
    names = list(PL.CONTINENTS) + [WORLD]
    closed_by_area = np.bincount(gid, weights=closed_2021, minlength=nG + 1)[:nG]
    closed_by_area = np.append(closed_by_area, closed_2021.sum())
    table: list[dict[str, Any]] = []
    for j, y in enumerate(YEARS):
        yr_months = [int(m) for m in months if H.FIRST_YEAR + m // 12 == y]
        delivered = {PLATFORM_KEYS[p]: sum(m in pm[p] for m in yr_months) for p in C.PLATFORMS}
        sums = {}
        for k, a in yearly.items():
            s = np.bincount(gid, weights=np.nan_to_num(a[:, j]), minlength=nG + 1)[:nG]
            sums[k] = np.append(s, s.sum())
        h = held["groups"].get(y)
        for gi, name in enumerate(names):
            r: dict[str, Any] = {"area": name, "year": y, "months": len(yr_months), "partial": len(yr_months) < 12}
            for p, n in delivered.items():
                r[f"months_{p}"] = n
            for k in ("terra", "aqua"):
                r[f"{k}_rows"] = round(float(sums[k][gi]), 1) if delivered[k] else None
            r["modis_rows"] = round(float(sums["terra"][gi] + sums["aqua"][gi]), 1)
            for k in ("suomi_npp", "noaa20"):
                r[f"{k}_rows"] = round(float(sums[k][gi]), 1) if delivered[k] else None
            r["harmonized_rows"] = round(float(sums["harmonized"][gi]), 1)
            r["closed_cells_left_out"] = int(closed_by_area[gi]) if y == 2021 else 0
            if h is not None:
                o = float(h["suomi_npp"][gi])
                r["heldout_clean_months"] = h["clean_months"]
                r["heldout_suomi_npp_rows"] = round(o, 1)
                for name_p, col in (("method", "heldout_harmonized_rows"), ("in_use", "heldout_in_use_rows"),
                                    ("none", "heldout_modis_rows")):
                    r[col] = round(float(h[name_p][gi]), 1)
                for name_p, col in (("method", "heldout_error"), ("in_use", "heldout_error_in_use"),
                                    ("none", "heldout_error_none")):
                    r[col] = round(float(h[name_p][gi]) / o - 1.0, 4) if o > 0 else None
            table.append(r)
    cols = list(table[0].keys())
    for r in table:
        for c in r:
            if c not in cols:
                cols.append(c)
    with (out / "totals.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in table:
            w.writerow({c: ("" if r.get(c) is None else (int(r[c]) if isinstance(r[c], bool) else r[c])) for c in cols})
    summary = {}
    for name in names:
        rows = [r for r in table if r["area"] == name and r.get("heldout_error") is not None]
        summary[name] = {}
        for col in ("heldout_error", "heldout_error_in_use", "heldout_error_none"):
            e = np.array([abs(r[col]) for r in rows])
            summary[name][col] = {"median_abs": round(float(np.median(e)), 4), "max_abs": round(float(e.max()), 4),
                                  "years": len(e)}
    totals = {
        "what": "yearly fire rows (FIRMS type 0) of the world and each continent: as each satellite detected them, "
                "and the harmonized record (MODIS on Suomi NPP's scale), with each total's held-out error",
        "years": list(YEARS), "areas": names,
        "continents": "by the countries whose files have a row in a cell (the United Nations' grouping, the Americas "
                      "cut at Panama's border with Colombia, the Russian Federation cut at 60 E; "
                      f"{mixed} cells hold countries of two continents and go to the one most of them are in)",
        "interval": "none. Fourteen held-out years per total are too few to set an 80 percent interval and measure "
                    "its coverage on years that did not set it; what was measured at the totals is the held-out "
                    "error of each total, given beside it",
        "heldout": "every overlap year 2012 to 2025 left out in turn over every cell at once; the method fitted on "
                   "the clean months of the other years predicts the year left out; a total's held-out error is "
                   "that prediction summed over the area's cells and the year's clean months, over Suomi NPP's rows "
                   "in the same cells and months, less one. heldout_error_in_use is the method used before (one "
                   "ratio per cell), heldout_error_none MODIS as it is",
        "heldout_world_monthly_error": held["world_monthly_error_method"],
        "heldout_summary": summary,
        "closed": "in 2021 the cells that meet a test fire region's context box are left out of every column "
                  f"({int(closed_2021.sum())} cells)",
        "rows": table,
    }
    (out / "totals.json").write_text(json.dumps(totals, indent=1) + "\n", encoding="utf-8")
    manifest = {
        "layer_version": LAYER_VERSION,
        "what": "harmonized fire rows per cell and year on the fire cube's grid (720 by 1440, north up, row 0 the "
                "north band, column 0 at 180 W): MODIS on Suomi NPP's scale, the sum over the year's months of the "
                "harmonized dataset's monthly values. NaN where no country file has a row, and in 2021 in the cells "
                "that meet a test fire region's context box; 0 in a loaded cell with no fire row of any satellite",
        "scale": "suomi_npp", "unit": "rows per year",
        "method": {"rows": D.method_for(FITTED_SERVE())[0],
                   "what": "the Record's served method at a quarter degree: a cell's ratio for each month of the "
                           "year, leaning on its ratio over the year, its eight neighbouring cells and its latitude "
                           "band, times a factor for the size of the month's MODIS count; before Aqua, Terra alone, "
                           "fitted the same way",
                   "document": "docs/harmonization.md"},
        "dataset": {"monthly_npz_sha256": _sha(dataset / "monthly.npz"),
                    "manifest_sha256": _sha(dataset / "manifest.json"), "cube_build": built_from},
        "cube_build": meta["build"], "cube_manifest_sha256": meta["manifest_sha256"],
        "years": layers,
        "totals": {"csv": "totals.csv", "csv_sha256": _sha(out / "totals.csv"),
                   "json": "totals.json", "json_sha256": _sha(out / "totals.json")},
        "seconds": round(time.time() - t0, 1),
    }
    (out / "harmonized.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    return manifest


def FITTED_SERVE() -> str:
    from backend.model.harmonize_fitted import FITTED

    return FITTED["serve"]["rows"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("write")
    w.add_argument("--dataset", type=Path, required=True, help="the harmonized dataset's folder (monthly.npz)")
    w.add_argument("--out", type=Path, default=None)
    a = ap.parse_args()
    m = write(a.dataset, a.out or out_dir())
    print(json.dumps({k: m[k] for k in ("cube_build", "seconds")}, indent=1))


if __name__ == "__main__":
    main()
