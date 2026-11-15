"""Each country file's fire rows year by year: as each satellite detected them, and on one scale.

From the harmonized dataset as served (`harmonize_dataset.py`, its `monthly.npz`) and the fire cube's parts (one
country file's records each, `cube/parts/<country>/records.npy`), FIRMS type 0 rows only, the rows the dataset and
the yearly layers count.

A cell holds the rows of every country file with a row in it (6,792 of the dataset's cells hold two or more). Each
country's part of a cell's harmonized value in a month is its share of the cell's MODIS rows that month, since the
value is MODIS's count put on Suomi NPP's scale; in a month MODIS saw nothing in the cell (the served method then
gives the cell's mean Suomi NPP count of such months) it is the country's share of the cell's Suomi NPP rows over
every month, or of all the cell's rows where Suomi NPP has none. The shares of a cell's countries sum to one, so the
countries' totals sum to the world's. The held-out predictions are shared the same way, and each country's own
Suomi NPP rows are what they are compared with.

A country's rows go to its continent (`harmonize_places.continent_of`), the Russian Federation's by each cell's
centre, west or east of 60 E. The continents' totals in `totals.json` are the sums of their countries' parts.

In 2021 the cells that meet a test fire region's context box are left out of every column, as in the layers.

The flag at a country's size is the rule of `FLAG-RULE.md` with its amendment 1, the country taken as the place:
for each overlap year, S, the country's Suomi NPP rows over the year's clean months, and P, the served method's
held-out prediction of them (fitted on the other years over every cell at once); a year is tested when S or P is at
least 50 rows, and departs when (S + 1) / (P + 1) is above 10 or below 1/10; the ratio is not stable when two tested
years or more depart, stable when at least one year is tested and fewer than two depart, not tested when no year has
50 rows. Where it is not stable, or not tested, the total on one scale means little.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable, Iterator

import numpy as np

from backend.model import harmonize_cells as C
from backend.model import harmonize_places as PL

YEARS: tuple[int, ...] = tuple(range(2000, 2026))
OVERLAP_YEARS: tuple[int, ...] = tuple(range(2012, 2026))
CLOSED_YEAR: int = 2021
DETECTED: tuple[str, ...] = ("terra", "aqua", "suomi_npp", "noaa20")      # platform index order of the cube
HELD: tuple[str, ...] = ("method", "in_use", "none")
FLAG_ROWS: float = 50.0
FLAG_FACTOR: float = 10.0
FLAG_YEARS: int = 2
HALF: float = 0.5
VERSION: int = 1
FILE: str = "countries.json"


def parts_dir() -> Path:
    return C.world_dir() / "cube" / "parts"


def country_names(pdir: Path) -> list[str]:
    return sorted(p.name for p in pdir.iterdir() if (p / "records.npy").exists())


def read_part(pdir: Path, country: str, lut: np.ndarray, first_month: int, n_months: int) -> dict[str, np.ndarray]:
    """A country file's fire rows as (dataset cell index, dataset month column, platform, rows)."""
    r = np.load(pdir / country / "records.npy", mmap_mode="r")
    plat, _night, kind, _scan, _conf = C._decode(np.asarray(r["code"]))
    k = kind == 0
    idx = lut[np.asarray(r["cell"])[k].astype(np.int64)]
    mo = np.asarray(r["month"])[k].astype(np.int64) + C.CUBE_MONTH_OFFSET - first_month
    if (idx < 0).any() or (mo < 0).any() or (mo >= n_months).any():
        raise ValueError(f"{country}: fire rows outside the dataset's cells or months")
    return {"idx": idx, "mo": mo, "plat": plat[k].astype(np.int64),
            "rows": np.asarray(r["rows"])[k].astype(np.float64)}


def iter_parts(pdir: Path, cube_cell: np.ndarray, first_month: int, n_months: int
               ) -> Iterator[tuple[str, dict[str, np.ndarray]]]:
    lut = np.full(C.N_LAT * C.N_LON, -1, dtype=np.int64)
    lut[cube_cell] = np.arange(cube_cell.size)
    for name in country_names(pdir):
        yield name, read_part(pdir, name, lut, first_month, n_months)


def _bincount(i: np.ndarray, weights: np.ndarray, minlength: int = 0) -> np.ndarray:
    """`np.bincount` as float64 also when nothing is counted."""
    return np.bincount(i, weights=weights, minlength=minlength).astype(np.float64)


def _continents_of(country: str, lon_c: np.ndarray) -> list[str | None]:
    split = PL.SPLIT_CONTINENT.get(country)
    if split is None:
        return [PL.CONTINENT_OF.get(country)] * lon_c.size
    w, e, inside, outside = split
    return np.where((lon_c >= w) & (lon_c < e), inside, outside).tolist()


def unit_sums(parts: Iterable[tuple[str, dict[str, np.ndarray]]], cells: dict[str, Any], harm: np.ndarray,
              closed: np.ndarray, held: dict[str, Any] | None = None) -> dict[str, Any]:
    """Per unit (a country file's rows in one continent; the Russian Federation has two), per year: the rows each
    satellite detected and the harmonized rows; per overlap year, when `held` is given, the unit's own Suomi NPP
    rows over the scored months and its share of each held-out prediction.

    `cells` holds the dataset's `months` (from January 2000), `lon0` and `n_T`, `n_A`, `n_S`, `n_J` (cells, months);
    `harm` the harmonized rows (cells, months); `closed` the cells left out in 2021. `held`, from
    `harmonize_years.heldout_preds`: `preds` (name to (cells, overlap months)), `sel` (cells, overlap months), the
    months scored, and `ov0`, the column of the first overlap month."""
    months = np.asarray(cells["months"])
    n, NM = harm.shape
    NY = len(YEARS)
    yidx = (months // 12).astype(np.int64) - (YEARS[0] - C.FIRST_YEAR)
    jc = YEARS.index(CLOSED_YEAR)
    lon_c = cells["lon0"] + C.CELL_DEG / 2
    M = cells["n_T"].astype(np.float32) + cells["n_A"].astype(np.float32)
    zero = M == 0
    Z = np.zeros((n, NY))                       # harmonized rows of the months MODIS saw nothing, per cell and year
    for j in range(NY):
        cols = yidx == j
        if cols.any():
            Z[:, j] = np.where(zero[:, cols], harm[:, cols], 0.0).sum(axis=1, dtype=np.float64)
    Z[closed, jc] = 0.0
    S_tot = cells["n_S"].sum(axis=1, dtype=np.float64)
    all_tot = sum(cells[f"n_{p}"].sum(axis=1, dtype=np.float64) for p in ("T", "A", "S", "J"))
    NO = len(OVERLAP_YEARS)
    if held is not None:
        ov0, sel = int(held["ov0"]), held["sel"]
        oidx = yidx[ov0:] - YEARS.index(OVERLAP_YEARS[0])
        Zp = {}
        for name in HELD:
            pr = held["preds"][name]
            v = np.where(sel & np.isfinite(pr) & zero[:, ov0:], pr, 0.0)
            Zp[name] = np.stack([v[:, oidx == k].sum(axis=1) for k in range(NO)], axis=1)

    units: list[tuple[str, str | None]] = []
    det = {k: [] for k in DETECTED}
    hsum: list[np.ndarray] = []
    obs: list[np.ndarray] = []
    pred: dict[str, list[np.ndarray]] = {name: [] for name in HELD}
    closed_cells: dict[str | None, set[int]] = {}
    for country, p in parts:
        idx, mo, plat, rows = p["idx"], p["mo"], p["plat"], p["rows"]
        uc, invc = np.unique(idx, return_inverse=True)
        conts = _continents_of(country, lon_c[uc])
        names = sorted(set(conts), key=lambda c: (c is None, c or "")) or [PL.CONTINENT_OF.get(country)]
        ucell = np.array([names.index(c) for c in conts], dtype=np.int64)       # unit of each of the part's cells
        U = len(names)
        units += [(country, c) for c in names]
        ue = ucell[invc]                                                          # unit of each record
        for u, c in enumerate(names):
            hit = uc[(ucell == u) & closed[uc]]
            if hit.size:
                closed_cells.setdefault(c, set()).update(hit.tolist())
        j = yidx[mo]
        keep = ~(closed[idx] & (j == jc))
        for q, k in enumerate(DETECTED):
            m = keep & (plat == q)
            det[k].append(_bincount(ue[m] * NY + j[m], weights=rows[m], minlength=U * NY).reshape(U, NY))
        # MODIS months: the country's share of the cell's MODIS rows
        m = plat < 2
        key = idx[m] * NM + mo[m]
        uk, inv = np.unique(key, return_inverse=True)
        Mc = _bincount(inv, weights=rows[m])
        ci, cm = uk // NM, uk % NM
        share = Mc / M[ci, cm].astype(np.float64)
        um = ucell[np.searchsorted(uc, ci)]
        jm = yidx[cm]
        hv = np.where(closed[ci] & (jm == jc), 0.0, harm[ci, cm].astype(np.float64) * share)
        h = _bincount(um * NY + jm, weights=hv, minlength=U * NY).reshape(U, NY)
        # months MODIS saw nothing: the country's share of the cell's Suomi NPP rows, or of all its rows
        S_c = _bincount(invc, weights=np.where(plat == 2, rows, 0.0), minlength=uc.size)
        all_c = _bincount(invc, weights=rows, minlength=uc.size)
        with np.errstate(invalid="ignore", divide="ignore"):
            s = np.where(S_tot[uc] > 0, S_c / S_tot[uc], all_c / all_tot[uc])
        for u in range(U):
            h[u] += (s[ucell == u, None] * Z[uc[ucell == u]]).sum(axis=0)
        hsum.append(h)
        if held is not None:
            mS = (plat == 2) & (mo >= ov0)
            ok = sel[idx[mS], mo[mS] - ov0]
            jo = yidx[mo[mS]] - YEARS.index(OVERLAP_YEARS[0])
            obs.append(_bincount(ue[mS] * NO + jo, weights=np.where(ok, rows[mS], 0.0),
                                   minlength=U * NO).reshape(U, NO))
            mo_ov = cm >= ov0
            ci_o, cm_o, sh_o, um_o = ci[mo_ov], cm[mo_ov] - ov0, share[mo_ov], um[mo_ov]
            jo = yidx[cm[mo_ov]] - YEARS.index(OVERLAP_YEARS[0])
            for name in HELD:
                pr = held["preds"][name][ci_o, cm_o]
                ok = sel[ci_o, cm_o] & np.isfinite(pr)
                v = _bincount(um_o * NO + jo, weights=np.where(ok, pr * sh_o, 0.0),
                                minlength=U * NO).reshape(U, NO)
                for u in range(U):
                    v[u] += (s[ucell == u, None] * Zp[name][uc[ucell == u]]).sum(axis=0)
                pred[name].append(v)
    out: dict[str, Any] = {"units": units, "harmonized": np.concatenate(hsum), "closed_cells": closed_cells,
                           "detected": {k: np.concatenate(v) for k, v in det.items()}}
    if held is not None:
        out["heldout_suomi_npp"] = np.concatenate(obs)
        out["heldout"] = {name: np.concatenate(v) for name, v in pred.items()}
    return out


def group(sums: dict[str, Any], key: int) -> tuple[list[Any], dict[str, Any]]:
    """The unit sums added up by country (`key` 0) or by continent (`key` 1): (names, sums with one row each)."""
    names = sorted({u[key] for u in sums["units"]}, key=lambda c: (c is None, c or ""))
    gid = np.array([names.index(u[key]) for u in sums["units"]], dtype=np.int64)

    def add(a: np.ndarray) -> np.ndarray:
        out = np.zeros((len(names), a.shape[1]))
        np.add.at(out, gid, a)
        return out

    g: dict[str, Any] = {"harmonized": add(sums["harmonized"]),
                         "detected": {k: add(v) for k, v in sums["detected"].items()}}
    if "heldout" in sums:
        g["heldout_suomi_npp"] = add(sums["heldout_suomi_npp"])
        g["heldout"] = {k: add(v) for k, v in sums["heldout"].items()}
    return names, g


def flag(S: np.ndarray, P: np.ndarray, years: tuple[int, ...] = OVERLAP_YEARS) -> dict[str, Any]:
    """The rule of `FLAG-RULE.md`, amendment 1, on one area's yearly Suomi NPP rows S and held-out predictions P."""
    S, P = np.asarray(S, dtype=np.float64), np.asarray(P, dtype=np.float64)
    tested = (S >= FLAG_ROWS) | (P >= FLAG_ROWS)
    factor = (S + 1.0) / (P + 1.0)
    departs = tested & ((factor > FLAG_FACTOR) | (factor < 1.0 / FLAG_FACTOR))
    if not tested.any():
        verdict = "not tested"
    elif departs.sum() >= FLAG_YEARS:
        verdict = "not stable"
    else:
        verdict = "stable"
    out: dict[str, Any] = {"verdict": verdict, "tested_years": int(tested.sum()),
                           "departing_years": [int(years[i]) for i in np.flatnonzero(departs)]}
    if tested.any():
        i = int(np.flatnonzero(tested)[np.argmax(np.abs(np.log(factor[tested])))])
        out["most"] = {"year": int(years[i]), "suomi_npp": round(float(S[i]), 1), "heldout": round(float(P[i]), 1),
                       "factor": round(float(factor[i]), 3)}
        e = np.abs(P[tested] / np.where(S[tested] > 0, S[tested], np.nan) - 1.0)
        e = e[np.isfinite(e)]
        out["heldout_median_abs_error"] = round(float(np.median(e)), 4) if e.size else None
    return out


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_countries(out: Path, sums: dict[str, Any], delivered: dict[str, list[int]], source: dict[str, Any]
                    ) -> dict[str, Any]:
    """`countries.json`: per country file, per year, the harmonized rows (MODIS on Suomi NPP's scale), the MODIS and
    Suomi NPP rows as detected, its continents, and the flag at its size."""
    names, g = group(sums, 0)
    conts: dict[str, list[str]] = {}
    for c, k in sums["units"]:
        conts.setdefault(c, []).append(k)
    countries, detected, flags = {}, {}, {}
    for i, c in enumerate(names):
        countries[c] = [round(float(v), 1) for v in g["harmonized"][i]]
        modis = g["detected"]["terra"][i] + g["detected"]["aqua"][i]
        detected[c] = {"modis": [int(round(v)) for v in modis],
                       "suomi_npp": [int(round(v)) if delivered["suomi_npp"][j] else None
                                     for j, v in enumerate(g["detected"]["suomi_npp"][i])]}
        if "heldout" in g:
            f = flag(g["heldout_suomi_npp"][i], g["heldout"]["method"][i])
            f["heldout_suomi_npp"] = [round(float(v), 1) for v in g["heldout_suomi_npp"][i]]
            f["heldout_harmonized"] = [round(float(v), 1) for v in g["heldout"]["method"][i]]
            flags[c] = f
    means_little = {c: f["verdict"] for c, f in flags.items() if f["verdict"] != "stable"}
    above_half = sorted(c for c, f in flags.items() if f["verdict"] == "stable"
                        and (f.get("heldout_median_abs_error") or 0.0) > HALF)
    by_continent: dict[str, dict[str, dict[str, list[Any]]]] = {}
    for ui, (c, k) in enumerate(sums["units"]):
        if len(conts[c]) > 1:
            modis = sums["detected"]["terra"][ui] + sums["detected"]["aqua"][ui]
            by_continent.setdefault(c, {})[k] = {
                "harmonized": [round(float(v), 1) for v in sums["harmonized"][ui]],
                "modis": [int(round(v)) for v in modis],
                "suomi_npp": [int(round(v)) if delivered["suomi_npp"][j] else None
                              for j, v in enumerate(sums["detected"]["suomi_npp"][ui])]}
    doc = {
        "version": VERSION,
        "what": "per country file of the store, per year, its fire rows (FIRMS type 0) on one scale: MODIS put on "
                "Suomi NPP's scale by the Record's served method, from the harmonized dataset as served",
        "scale": "suomi_npp", "unit": "rows per year", "years": list(YEARS),
        "countries": countries,
        "detected": detected,
        "continents": {c: v for c, v in conts.items()},
        "by_continent": by_continent,
        "shared_cells": "a cell holding rows of two country files or more gives each its share of the cell's MODIS "
                        "rows in a month MODIS saw rows, and its share of the cell's Suomi NPP rows over every "
                        "month (or of all its rows where Suomi NPP has none) in a month MODIS saw nothing; the "
                        "shares of a cell sum to one, so the countries sum to the world and, by their continents "
                        "(the Russian Federation cut at 60 E by each cell's centre), to the continents of "
                        "totals.json",
        "closed": "in 2021 the cells that meet a test fire region's context box are left out of every series",
        "years_note": "2000 holds November and December only; Suomi NPP's rows begin on 20 January 2012",
        "flag_rule": "the rule of FLAG-RULE.md with its amendment 1, the country taken as the place: per overlap "
                     "year, S the country's Suomi NPP rows over the year's clean months (2021 without the closed "
                     "cells), P the served method's held-out prediction of them; a year is tested when S or P is at "
                     f"least {FLAG_ROWS:.0f} rows and departs when (S + 1) / (P + 1) is above {FLAG_FACTOR:.0f} or "
                     f"below 1/{FLAG_FACTOR:.0f}; not stable when {FLAG_YEARS} tested years or more depart, not "
                     f"tested when no year has {FLAG_ROWS:.0f} rows. heldout_median_abs_error is |P / S - 1| over "
                     "the tested years",
        "means_little": means_little,
        "heldout_error_above_half": above_half,
        "heldout_error_above_half_note": "stable countries whose held-out yearly total misses their own Suomi NPP "
                                         "rows by more than half in the median tested year; the threshold was set "
                                         "after the errors were seen, so it is a description and not a flag",
        "flag": flags,
        "source": source,
    }
    path = out / FILE
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"file": FILE, "sha256": _sha(path), "bytes": path.stat().st_size, "countries": len(names),
            "not_stable": sorted(c for c, v in means_little.items() if v == "not stable"),
            "not_tested": sorted(c for c, v in means_little.items() if v == "not tested"),
            "heldout_error_above_half": len(above_half)}
