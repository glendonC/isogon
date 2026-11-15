"""The harmonized fire record as a dataset: every quarter degree cell of the fire cube, every month from November 2000.

For each cell and month: the rows and fire radiative power (FRP) MODIS and the sharp satellites counted, and MODIS
put on Suomi NPP's scale with its 80 percent interval. For each cell: the factor, the held-out error with and without
the correction, and how often the interval held on years that did not set it.

How it is made, in short (the document written beside the files says it in full):
- rows are the fire cube's fire rows (FIRMS type 0), per platform and month;
- the method for rows is the one the Record serves when it pools across places, otherwise the pooled ratio; for FRP
  the pooled ratio. Each cell leans on its eight neighbouring cells and its 10 degree latitude band. Before Aqua
  (to June 2002) Terra alone is used, fitted the same way;
- every overlap year 2012 to 2025 is left out in turn over every cell at once; the held-out errors give the per cell
  error and the interval tables (by size of the prediction and by band), and the interval's coverage is measured on
  years that did not set it;
- cells touching the context box of a region with a recorded test fire are not scored in that fire's year.

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.harmonize_dataset --out <folder>
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
import time
from typing import Any

import numpy as np

from backend.model import harmonize as H
from backend.model import harmonize_cells as C
from backend.model import harmonize_eval as E
from backend.model import harmonize_maps as HM
from backend.model import harmonize_places as PL

FIRST_MONTH: int = 10                 # November 2000, Terra's first month, counted from January 2000
LAST_MONTH: int = C.N_MONTHS - 1      # December 2025
OVERLAP_FIRST: int = 12 * 12          # January 2012
CELL_DEG: float = C.CELL_DEG
PLATS: tuple[str, ...] = ("T", "A", "S", "J")


def cube_cells(cdir: Path, month_first: int = FIRST_MONTH, month_last: int = LAST_MONTH) -> dict[str, Any]:
    """Fire rows and FRP per cell and month for every cell with a fire row, float32 (cells, months), read band of
    grid rows by band of grid rows. Cells are ordered south to north, west to east (row counted from the south)."""
    start = np.load(cdir / "cell_start.npy", mmap_mode="r")
    recs = np.load(cdir / "records.npy", mmap_mode="r")
    T = month_last - month_first + 1
    parts = []
    for r0 in range(0, C.N_LAT, C.CUBE_GRID_ROWS_PER_CHUNK):
        r1 = min(C.N_LAT, r0 + C.CUBE_GRID_ROWS_PER_CHUNK)
        a, b = int(start[r0 * C.N_LON]), int(start[r1 * C.N_LON])
        if a == b:
            continue
        part = np.asarray(recs[a:b])
        lens = np.diff(np.asarray(start[r0 * C.N_LON:r1 * C.N_LON + 1]))
        cell = np.repeat(np.arange(r0 * C.N_LON, r1 * C.N_LON, dtype=np.int64), lens)
        month = part["month"].astype(np.int64) + C.CUBE_MONTH_OFFSET
        plat, night, kind, scan, conf = C._decode(part["code"])
        keep = (kind == 0) & (month >= month_first) & (month <= month_last)
        if not keep.any():
            continue
        cell, month, plat = cell[keep], month[keep] - month_first, plat[keep]
        rows, frp = part["rows"][keep].astype(np.float64), part["frp"][keep].astype(np.float64)
        iy = (C.N_LAT - 1) - cell // C.N_LON
        raw = iy * C.N_LON + cell % C.N_LON
        u, inv = np.unique(raw, return_inverse=True)
        n = u.size * T
        flat = inv * T + month
        out = {"raw": u}
        for pi, p in enumerate(PLATS):
            m = plat == pi
            out[f"n_{p}"] = np.bincount(flat[m], weights=rows[m], minlength=n).reshape(u.size, T).astype(np.float32)
            out[f"frp_{p}"] = np.bincount(flat[m], weights=frp[m], minlength=n).reshape(u.size, T).astype(np.float32)
        parts.append(out)
    raw = np.concatenate([p["raw"] for p in parts])
    order = np.argsort(raw, kind="stable")
    cells: dict[str, Any] = {"raw": raw[order], "months": np.arange(month_first, month_last + 1)}
    for k in [f"{q}_{p}" for q in ("n", "frp") for p in PLATS]:
        cells[k] = np.concatenate([p[k] for p in parts])[order]
    iy, ix = cells["raw"] // C.N_LON, cells["raw"] % C.N_LON
    cells["lat0"] = -90.0 + iy * CELL_DEG
    cells["lon0"] = -180.0 + ix * CELL_DEG
    cells["cube_cell"] = ((C.N_LAT - 1) - iy) * C.N_LON + ix
    cells["nb_src"], cells["nb_dst"] = C._neighbours(cells["raw"], iy, ix, C.N_LON)
    return cells


def lean_channels(cells: dict[str, Any], cols: slice) -> dict[str, np.ndarray]:
    """The channels the candidates read, as views on the cells' arrays: all rows of a platform under its day
    channel and nothing under its night one."""
    shape = cells["n_T"][:, cols].shape
    zero = np.broadcast_to(np.float32(0.0), shape)
    X: dict[str, np.ndarray] = {}
    for q in ("n", "frp"):
        for p in PLATS:
            X[f"{q}_{p}_D"] = cells[f"{q}_{p}"][:, cols]
            X[f"{q}_{p}_N"] = zero
    return X


def closed_cells(lat0: np.ndarray, lon0: np.ndarray, deg: float, years: np.ndarray) -> np.ndarray:
    """(cells, years) True where a cell's box meets a test fire region's context box in a closed year: the closed
    rule of `backend.model.training.closed_for` (touching counts), computed for every cell at once."""
    from backend.firms import region_box
    from backend.model.training import EXCLUSIONS, closed_years

    out = np.zeros((lat0.size, years.size), dtype=bool)
    for region in EXCLUSIONS:
        cw, cs, ce, cn = region_box(region)
        meets = (lon0 <= ce) & (cw <= lon0 + deg) & (lat0 <= cn) & (cs <= lat0 + deg)
        for y in closed_years(region):
            if y in years:
                out[:, int(np.searchsorted(years, y))] |= meets
    return out


def method_for(serve_rows: str) -> tuple[str, H.Spec, H.Spec]:
    """The rows method of the dataset: the Record's served method when it pools across places, else the pooled
    ratio (a cell's own ratio is mostly noise at a quarter degree)."""
    spec_ta, spec_t = H.SERVED[serve_rows]
    if spec_ta.pool:
        return serve_rows, spec_ta, spec_t
    pooled = H.SPEC_BY_NAME["pooled"]
    return "pooled_v1", pooled, H.replace(pooled, name="pooled_terra", inputs="terra")


def held_out_pairs(X: dict[str, np.ndarray], months: np.ndarray, clean: np.ndarray, spec: H.Spec, places: H.Places,
                   q: str, unit: float, sharp: np.ndarray) -> np.ndarray:
    """Held-out predictions (cells, months) as float32, nan outside the clean months."""
    return H.held_out(X, months, clean, spec, places, q, unit, sharp).astype(np.float32)


def build(out: Path, serve_rows: str | None = None) -> dict[str, Any]:
    t0 = time.time()
    out.mkdir(parents=True, exist_ok=True)
    cdir = C.cube_dir()
    meta = C.cube_meta(cdir)
    if serve_rows is None:
        from backend.model.harmonize_fitted import FITTED

        serve_rows = FITTED["serve"]["rows"]
    rows_id, spec_rows, spec_rows_t = method_for(serve_rows)
    pooled = H.SPEC_BY_NAME["pooled"]
    pooled_t = H.replace(pooled, name="pooled_terra", inputs="terra")
    cells = cube_cells(cdir)
    P = cells["raw"].size
    months_all = cells["months"]
    pm = C.cube_platform_months(cdir, months_all)
    clean_all, sharp_all, info = E.clean_months(months_all, pm)
    band = ((PL.band_of(cells["lat0"] + CELL_DEG / 2) + 90.0) / PL.BAND_DEG).astype(np.int64)
    places = H.Places(band=band, nb_src=cells["nb_src"], nb_dst=cells["nb_dst"])
    years = np.arange(2012, 2026)
    closed = closed_cells(cells["lat0"], cells["lon0"], CELL_DEG, years)
    ov = slice(OVERLAP_FIRST - FIRST_MONTH, None)
    m_ov, clean_ov, sharp_ov = months_all[ov], clean_all[ov], sharp_all[ov]
    X_ov = lean_channels(cells, ov)
    X_all = lean_channels(cells, slice(None))
    n_modis = float((cells["n_T"][:, ov] + cells["n_A"][:, ov])[:, clean_ov].sum())
    frp_unit = float((cells["frp_T"][:, ov] + cells["frp_A"][:, ov])[:, clean_ov].sum() / n_modis) if n_modis else 1.0
    world = np.ones(P, dtype=bool)
    yr_ov = H._year(m_ov)
    scored = clean_ov[None, :] & ~closed[:, np.searchsorted(years, yr_ov)]
    timings: dict[str, float] = {"read": round(time.time() - t0, 1)}
    res: dict[str, Any] = {"cells": P, "clean_months": info["clean_months"], "frp_unit_mw": round(frp_unit, 3)}
    per_cell: dict[str, np.ndarray] = {}
    tables: dict[str, Any] = {}
    series: dict[str, np.ndarray] = {}
    for q, label, spec_ta, spec_t, unit in (("n", "rows", spec_rows, spec_rows_t, 1.0),
                                             ("frp", "frp", pooled, pooled_t, frp_unit)):
        obs = (cells[f"{q}_S"][:, ov]).astype(np.float64)
        ts = time.time()
        pred = held_out_pairs(X_ov, m_ov, clean_ov, spec_ta, places, q, unit, sharp_ov)
        p_use = held_out_pairs(X_ov, m_ov, clean_ov, H.SPEC_BY_NAME["in_use"], places, q, unit, sharp_ov)
        p_none = H.predict_none(X_ov, q).astype(np.float32)
        osum = np.where(scored, obs, 0.0).sum(axis=1)
        for name, pr in (("method", pred), ("in_use", p_use), ("none", p_none)):
            e = np.where(scored & np.isfinite(pr), np.abs(pr - obs), 0.0).sum(axis=1)
            with np.errstate(invalid="ignore", divide="ignore"):
                per_cell[f"{label}_heldout_error_{name}"] = np.where(osum > 0, e / np.where(osum > 0, osum, 1.0), np.nan)
            ok = scored & np.isfinite(pr)
            res[f"{label}_world_monthly_error_{name}"] = round(float(np.abs(pr[ok] - obs[ok]).sum() / obs[ok].sum()), 4)
        del p_use, p_none
        per_cell[f"{label}_suomi_npp_overlap"] = osum
        inside_m, m_valid, inside_y, y_valid, ap, ao, _ = E.interval_inside(pred.astype(np.float64), obs, m_ov,
                                                                            clean_ov, closed, years, world, unit,
                                                                            by=places.band)
        tested = m_valid & (np.nan_to_num(pred) >= unit)
        n_t = tested.sum(axis=1)
        with np.errstate(invalid="ignore", divide="ignore"):
            per_cell[f"{label}_interval_coverage_months"] = np.where(n_t > 0, (inside_m & tested).sum(axis=1) / np.maximum(n_t, 1), np.nan)
        per_cell[f"{label}_interval_tested_months"] = n_t
        ty = y_valid & (ap >= unit)
        res[f"{label}_interval_coverage"] = {
            "months_predicted_ge_1": round(float(inside_m[tested].mean()), 4),
            "years_predicted_ge_1": round(float(inside_y[ty].mean()), 4),
            "months_all": round(float(inside_m[m_valid].mean()), 4)}
        # the interval tables of the dataset: every held-out error, by band with a world fallback bin by bin
        band_s = PL.band_of(cells["lat0"] + CELL_DEG / 2)
        tabs = {}
        for regime, spec, pr in (("terra_aqua", spec_ta, pred), ("terra_only", spec_t, None)):
            if pr is None:
                pr = held_out_pairs(X_ov, m_ov, clean_ov, spec, places, q, unit, sharp_ov)
            ok = scored & np.isfinite(pr)
            t = {"world": H.interval_table(pr[ok], obs[ok], unit), "bands": {}}
            for b in np.unique(band_s):
                rows = (band_s == b)[:, None] & ok
                if rows.any():
                    t["bands"][f"{b:g}"] = H.interval_table(pr[rows], obs[rows], unit, fallback=t["world"])
            tabs[regime] = t
        tables[label] = tabs
        del pred
        # the series: fitted on every clean overlap month, applied to every month from November 2000
        fit = H.Fit()
        full_ta = H.fit_predict(X_all, months_all, clean_all, spec_ta, places, q, unit, sharp_all, fit)
        full_t = H.fit_predict(X_all, months_all, clean_all, spec_t, places, q, unit, sharp_all)
        a_on = np.array([m in pm[0]["Aqua"] for m in months_all])
        t_on = np.array([m in pm[0]["Terra"] for m in months_all])
        harm = np.where(a_on[None, :], full_ta, np.where(t_on[None, :], full_t, np.nan)).astype(np.float32)
        lo = np.full(harm.shape, np.nan, dtype=np.float32)
        hi = np.full(harm.shape, np.nan, dtype=np.float32)
        for regime, cols in (("terra_aqua", a_on), ("terra_only", t_on & ~a_on)):
            for b in np.unique(band_s):
                tab = tabs[regime]["bands"].get(f"{b:g}", tabs[regime]["world"])
                rsel = band_s == b
                sub = harm[np.ix_(rsel, cols)]
                l, h_ = H.apply_interval(np.nan_to_num(sub.astype(np.float64)), tab)
                lo[np.ix_(rsel, cols)] = np.where(np.isfinite(sub), l, np.nan)
                hi[np.ix_(rsel, cols)] = np.where(np.isfinite(sub), h_, np.nan)
        series[f"{label}_harmonized"], series[f"{label}_p10"], series[f"{label}_p90"] = harm, lo, hi
        sV = (cells[f"{q}_S"][:, ov])[:, clean_ov].sum(axis=1).astype(np.float64)
        sM = (cells[f"{q}_T"][:, ov] + cells[f"{q}_A"][:, ov])[:, clean_ov].sum(axis=1).astype(np.float64)
        per_cell[f"{label}_factor_own"] = np.where(sM > 0, sV / np.where(sM > 0, sM, 1.0), np.nan)
        per_cell[f"{label}_factor_pooled"] = H.place_ratio(sV, sM, places, True, H.PSEUDO_ROWS * unit)[0]
        per_cell[f"{label}_modis_overlap"] = sM
        timings[label] = round(time.time() - ts, 1)
    return write(out, cells, per_cell, series, tables, res, meta, rows_id, serve_rows, info, closed, timings, t0)


def write(out: Path, cells: dict[str, Any], per_cell: dict[str, np.ndarray], series: dict[str, np.ndarray],
          tables: dict[str, Any], res: dict[str, Any], meta: dict[str, Any], rows_id: str, serve_rows: str,
          info: dict[str, Any], closed: np.ndarray, timings: dict[str, float], t0: float) -> dict[str, Any]:
    months = [E.month_text(int(m)) for m in cells["months"]]
    delivering = {}
    pm = C.cube_platform_months(C.cube_dir(), cells["months"])
    for name in C.PLATFORMS:
        delivering[name] = [m in pm[0][name] for m in cells["months"]]
    np.savez_compressed(out / "monthly.npz",
                        cell=cells["cube_cell"].astype(np.int32),
                        modis_rows=(cells["n_T"] + cells["n_A"]), terra_rows=cells["n_T"], aqua_rows=cells["n_A"],
                        suomi_npp_rows=cells["n_S"], noaa20_rows=cells["n_J"],
                        modis_frp=(cells["frp_T"] + cells["frp_A"]), suomi_npp_frp=cells["frp_S"],
                        noaa20_frp=cells["frp_J"],
                        harmonized_rows=series["rows_harmonized"], harmonized_rows_p10=series["rows_p10"],
                        harmonized_rows_p90=series["rows_p90"], harmonized_frp=series["frp_harmonized"],
                        harmonized_frp_p10=series["frp_p10"], harmonized_frp_p90=series["frp_p90"])
    lat_c = cells["lat0"] + CELL_DEG / 2
    lon_c = cells["lon0"] + CELL_DEG / 2
    region = [PL.world_region(float(lo), float(la)) for lo, la in zip(lon_c, lat_c)]
    band = [PL.band_name(float(b)) for b in PL.band_of(lat_c)]
    cols = ["cell", "row", "col", "lat", "lon", "band", "region", "closed_2021",
            "rows_modis_overlap", "rows_suomi_npp_overlap", "rows_factor_own", "rows_factor_pooled",
            "rows_heldout_error_method", "rows_heldout_error_in_use", "rows_heldout_error_none",
            "rows_interval_coverage_months", "rows_interval_tested_months",
            "frp_modis_overlap_mw", "frp_suomi_npp_overlap_mw", "frp_factor_own", "frp_factor_pooled",
            "frp_heldout_error_method", "frp_heldout_error_in_use", "frp_heldout_error_none",
            "frp_interval_coverage_months", "frp_interval_tested_months"]
    src = {"rows_modis_overlap": "rows_modis_overlap", "rows_suomi_npp_overlap": "rows_suomi_npp_overlap",
           "frp_modis_overlap_mw": "frp_modis_overlap", "frp_suomi_npp_overlap_mw": "frp_suomi_npp_overlap"}

    def fmt(v: Any) -> str:
        if isinstance(v, (float, np.floating)):
            return "" if not np.isfinite(v) else f"{float(v):.6g}"
        return str(v)

    with (out / "cells.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for i in range(cells["raw"].size):
            row = [int(cells["cube_cell"][i]), int(cells["cube_cell"][i] // C.N_LON), int(cells["cube_cell"][i] % C.N_LON),
                   fmt(lat_c[i]), fmt(lon_c[i]), band[i], region[i], int(closed[i].any())]
            for c in cols[8:]:
                key = src.get(c, c)
                row.append(fmt(per_cell[key][i]))
            w.writerow(row)
    # monthly totals per region and for the world: sums of cells (a sum of intervals is not an interval: none given)
    reg_names = sorted(set(region))
    reg_idx = np.array([reg_names.index(r) for r in region])
    with (out / "regions_monthly.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["region", "month", "modis_rows", "suomi_npp_rows", "harmonized_rows", "modis_frp_mw",
                    "suomi_npp_frp_mw", "harmonized_frp_mw"])
        for gi, gname in [(-1, "world")] + list(enumerate(reg_names)):
            sel = np.ones(reg_idx.size, dtype=bool) if gi < 0 else reg_idx == gi
            agg = {k: np.nansum(v[sel], axis=0) for k, v in (
                ("m", cells["n_T"] + cells["n_A"]), ("s", cells["n_S"]), ("h", series["rows_harmonized"]),
                ("mf", cells["frp_T"] + cells["frp_A"]), ("sf", cells["frp_S"]), ("hf", series["frp_harmonized"]))}
            for t, m in enumerate(months):
                s_on = delivering["Suomi NPP"][t]
                w.writerow([gname, m, fmt(agg["m"][t]), fmt(agg["s"][t]) if s_on else "", fmt(agg["h"][t]),
                            fmt(agg["mf"][t]), fmt(agg["sf"][t]) if s_on else "", fmt(agg["hf"][t])])
    # maps, one pixel per cell
    tab = {"deg": CELL_DEG, "lat0": cells["lat0"], "lon0": cells["lon0"]}
    loaded = np.load(C.cube_dir() / "loaded.npy")
    maps = {}
    for name, key, sc in (("rows_factor", "rows_factor_pooled", HM.SCALES["factor"]),
                          ("rows_heldout_error_method", "rows_heldout_error_method", HM.SCALES["error_in_use"]),
                          ("rows_heldout_error_none", "rows_heldout_error_none", HM.SCALES["error_none"]),
                          ("rows_interval_coverage", "rows_interval_coverage_months", HM.SCALES["interval_coverage"])):
        v = per_cell[key].astype(np.float64)
        if name == "rows_interval_coverage":
            v = np.where(per_cell["rows_interval_tested_months"] >= HM.MIN_TESTED_MONTHS, v, np.nan)
        elif name.startswith("rows_heldout"):
            v = np.where(per_cell["rows_suomi_npp_overlap"] >= HM.MIN_SNPP_ROWS, v, np.nan)
        grid = HM.paint(tab, v, loaded)
        np.save(out / f"map_{name}.npy", grid)
        if name == "rows_interval_coverage":
            rgba = HM.colour(np.where(np.isfinite(grid), np.clip(grid, 0.5, 1.1), np.nan), HM.DIVERGING, 0.5, 1.1)
        else:
            rgba = HM.colour(grid, sc["stops"], sc["vmin"], sc["vmax"], sc["log"])
        maps[name] = {"png_sha256": HM.write_png(out / f"map_{name}.png", rgba), "scale": {
            "stops": list(sc["stops"]), "vmin": sc["vmin"], "vmax": 1.1 if name == "rows_interval_coverage" else sc["vmax"],
            "log": sc["log"]}}
    (out / "interval_tables.json").write_text(json.dumps(tables), encoding="utf-8")
    files = sorted(p for p in out.iterdir() if p.is_file() and p.name != "manifest.json")
    manifest = {
        "what": "the harmonized monthly fire record per quarter degree cell, November 2000 to December 2025",
        "cube_build": meta["build"], "cube_manifest_sha256": meta["manifest_sha256"],
        "countries_loaded": len(meta["countries_loaded"]),
        "rows_method": rows_id, "record_serves": serve_rows, "frp_method": "pooled_v1",
        "months": {"first": months[0], "last": months[-1], "count": len(months)},
        "delivering": {k: [m for m, d in zip(months, v) if d][:1] + [m for m, d in zip(months, v) if d][-1:]
                       for k, v in delivering.items()},
        "clean_overlap_months": info["clean_months"],
        "closed_cell_years_not_scored": int(closed.sum()),
        "results": res,
        "maps": maps,
        "seconds": round(time.time() - t0, 1), "timings": timings,
        "files": {p.name: {"bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files},
    }
    manifest["bytes_total"] = sum(v["bytes"] for v in manifest["files"].values())
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    write_readme(out, manifest)
    return manifest


def write_readme(out: Path, m: dict[str, Any]) -> None:
    """The dataset's document, its figures read from the manifest."""
    r = m["results"]
    size = lambda b: f"{b / 1e6:,.1f} MB"  # noqa: E731
    f = m["files"]
    method_words = {
        "pooled_month_size_v1": "the pooled month-of-year method the Record serves: a cell's ratio for each month of "
                                "the year leans on its ratio over the year, which leans on its eight neighbouring "
                                "cells and its latitude band; a factor for the size of the month's MODIS count; a "
                                "month in which MODIS saw nothing gets the cell's mean Suomi NPP count in such months",
        "pooled_v1": "the pooled ratio: a cell's Suomi NPP rows over its MODIS rows, leaning on its eight neighbouring "
                     "cells and its latitude band",
    }
    lines = [
        "# Harmonized fire record per quarter degree cell",
        "",
        f"Every quarter degree cell of the world with a FIRMS fire row, every month from {m['months']['first']} to "
        f"{m['months']['last']} ({m['months']['count']} months): the rows and fire radiative power (FRP) MODIS and VIIRS "
        "counted, and MODIS put on Suomi NPP's scale with an 80 percent interval. Built from NASA FIRMS standard "
        f"processing country files ({m['countries_loaded']} countries loaded; cube build `{m['cube_build']}`, manifest "
        f"sha256 `{m['cube_manifest_sha256']}`). Not simulated.",
        "",
        "## Files",
        "",
        "| File | Size | What |",
        "| --- | --- | --- |",
        f"| `monthly.npz` | {size(f['monthly.npz']['bytes'])} | the monthly arrays, one row per cell (numpy, compressed) |",
        f"| `cells.csv` | {size(f['cells.csv']['bytes'])} | one row per cell: where it is, its factor, its held-out errors, how often its interval held |",
        f"| `regions_monthly.csv` | {size(f['regions_monthly.csv']['bytes'])} | monthly sums for the world and each region |",
        f"| `interval_tables.json` | {size(f['interval_tables.json']['bytes'])} | the interval tables used |",
        "| `map_*.npy`, `map_*.png` | | four world maps on the cube's grid (720 by 1440, north up), one pixel per cell |",
        f"| `manifest.json` | | every file's bytes and sha256, the figures below |",
        "",
        f"All files: {size(m['bytes_total'])}.",
        "",
        "## `monthly.npz`",
        "",
        f"Arrays of shape (cells, {m['months']['count']}), float32, month 0 = {m['months']['first']}; `cell` (int32) is "
        "the cube's cell id, `row * 1440 + col`, row 0 the northern band, `col = floor((lon + 180) / 0.25)`.",
        "",
        "| Array | Unit | What |",
        "| --- | --- | --- |",
        "| `modis_rows`, `terra_rows`, `aqua_rows` | rows | fire rows (FIRMS type 0) of MODIS, Terra plus Aqua, and each |",
        "| `suomi_npp_rows`, `noaa20_rows` | rows | fire rows of VIIRS on Suomi NPP and NOAA-20 |",
        "| `modis_frp`, `suomi_npp_frp`, `noaa20_frp` | MW | summed fire radiative power of those rows |",
        "| `harmonized_rows` | rows | MODIS put on Suomi NPP's scale: what Suomi NPP would have counted |",
        "| `harmonized_rows_p10`, `harmonized_rows_p90` | rows | the 80 percent interval around it |",
        "| `harmonized_frp`, `harmonized_frp_p10`, `harmonized_frp_p90` | MW | the same for FRP |",
        "",
        "A zero is a month a platform delivered and saw nothing in the cell. Platforms deliver from Terra "
        f"{m['delivering']['Terra'][0]}, Aqua {m['delivering']['Aqua'][0]}, Suomi NPP {m['delivering']['Suomi NPP'][0]}, "
        f"NOAA-20 {m['delivering']['NOAA-20'][0]}; before that a platform's zeros mean it was not flying. "
        "Harmonized values exist for every month MODIS delivered (Terra alone before Aqua).",
        "",
        "## `cells.csv`",
        "",
        "| Column | What |",
        "| --- | --- |",
        "| `cell`, `row`, `col`, `lat`, `lon` | the cube's cell id, its grid row and column, its centre in degrees |",
        "| `band`, `region` | its 10 degree latitude band and its region (boxes fixed before any score) |",
        "| `closed_2021` | 1 where the cell touches the context box of a region with a recorded test fire: not scored in that year |",
        "| `rows_modis_overlap`, `rows_suomi_npp_overlap` | rows over the clean overlap months (below) |",
        "| `rows_factor_own` | the cell's own ratio of Suomi NPP rows to MODIS rows over those months |",
        "| `rows_factor_pooled` | the same ratio leaning on the neighbouring cells and the band |",
        "| `rows_heldout_error_method`, `_in_use`, `_none` | held-out monthly error (sum of absolute errors over the sum of Suomi NPP rows) with the dataset's method, with one own ratio per cell, with no correction |",
        "| `rows_interval_coverage_months`, `rows_interval_tested_months` | share of held-out months (prediction of one row or more) inside the interval, and how many |",
        "| `frp_...` | the same for FRP, in MW |",
        "",
        "## How it was made",
        "",
        f"- Rows: the box rule, FIRMS type 0 only. Clean overlap months: from February 2012, months in which Suomi NPP, "
        f"Terra and Aqua each delivered with no outage day ({m['clean_overlap_months']} months).",
        f"- Rows are harmonized by {method_words.get(m['rows_method'], m['rows_method'])}. FRP by {method_words['pooled_v1']}. "
        "Before Aqua, Terra alone, fitted the same way.",
        "- Every overlap year 2012 to 2025 is left out in turn over every cell at once; the method is fitted on the other "
        "years and predicts the year left out. Those held-out errors give each cell's error and the interval: the 10th "
        "and 90th percentile of log((observed + 1) / (predicted + 1)) among predictions of about the same size, per 10 "
        "degree band (a size class with fewer than 100 errors in a band takes the world's).",
        "- The series is the method fitted on every clean overlap month and applied to every month.",
        f"- Cells touching a closed test fire region are not scored in its year ({m['closed_cell_years_not_scored']} cell-years).",
        "",
        "## What it was checked against",
        "",
        "Suomi NPP itself, on years left out of the fit. World figures over every cell:",
        "",
        "| | method | one own ratio per cell | no correction |",
        "| --- | --- | --- | --- |",
        f"| rows, held-out monthly error | {r['rows_world_monthly_error_method']} | {r['rows_world_monthly_error_in_use']} | {r['rows_world_monthly_error_none']} |",
        f"| FRP, held-out monthly error | {r['frp_world_monthly_error_method']} | {r['frp_world_monthly_error_in_use']} | {r['frp_world_monthly_error_none']} |",
        "",
        "The interval, 80 percent stated, on years that did not set it:",
        "",
        "| | months, prediction 1 or more | years, prediction 1 or more | every month |",
        "| --- | --- | --- | --- |",
        f"| rows | {r['rows_interval_coverage']['months_predicted_ge_1']} | {r['rows_interval_coverage']['years_predicted_ge_1']} | {r['rows_interval_coverage']['months_all']} |",
        f"| FRP | {r['frp_interval_coverage']['months_predicted_ge_1']} | {r['frp_interval_coverage']['years_predicted_ge_1']} | {r['frp_interval_coverage']['months_all']} |",
        "",
        "Every month over-covers because counts are whole numbers: near zero any interval holds more than it states.",
        "",
        "## What it must not be used for",
        "",
        "- Counting fires. A row is a pixel flagged as hot; one fire gives many rows, more for VIIRS than for MODIS.",
        "- Placing fire inside a cell, or reading burned area. It rescales counts per cell.",
        "- Correcting either satellite toward the ground. The truth here is Suomi NPP, which also misses fire under cloud.",
        "- Adding intervals. The interval of a sum of cells or months is not the sum of their intervals; none is given "
        "for `regions_monthly.csv`.",
        "- Volcanoes. FIRMS marks some lava as fire (type 0); at Hawaii, Reunion and Fogo no ratio holds.",
        "- Testing a model that predicts Suomi NPP. Every cell's Suomi NPP counts of every year set the factors and the "
        "interval tables, so they hold what such a test would hide.",
        "- A cell's own factor where it has few rows: it leans on its neighbours there, and `rows_factor_own` is noise.",
        "- Months after the last country file (December 2025), and NOAA-21, which are not in it.",
        "",
        "## Source and credit",
        "",
        "NASA FIRMS active fire data (MODIS Collection 6.1; VIIRS 375 m Collection 2), NASA LANCE and EOSDIS, "
        "`https://firms.modaps.eosdis.nasa.gov/`. Open NASA Earth science data, free to use and redistribute with "
        "acknowledgement of the source. Method: `docs/harmonization.md` of the Isogon repository; code: "
        "`backend/model/harmonize_dataset.py`.",
    ]
    (out / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--serve", default=None, help="the rows method the Record serves (default: the fitted file's)")
    a = ap.parse_args()
    m = build(Path(a.out), a.serve)
    print(json.dumps({k: v for k, v in m.items() if k not in ("files", "maps")}, indent=1))
    print("bytes_total", m["bytes_total"])


if __name__ == "__main__":
    main()
