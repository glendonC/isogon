"""The held-out measurement of the harmonization candidates, by the rule written before any table.

Every overlap year is left out in turn, everywhere at once; every candidate predicts the clean months of that year
in every place from a fit on the clean months of the other years. Scores are kept for the world, for each region
and for each 10 degree latitude band. A place touching the context box of a region with a recorded test fire is
not scored in that fire's year (`backend.model.training.closed_for`); its rows stay in the fits of other years.

Usage:
  uv run --no-project --python 3.12 --with numpy python3 -m backend.model.harmonize_eval run --out <folder>
"""

from __future__ import annotations

import argparse
import calendar as _cal
import hashlib
import json
from pathlib import Path
import time
from typing import Any

import numpy as np

from backend.firms.archive import FIRMS_CACHE_DIR
from backend.firms.real_calendar import outage_days, platform_days
from backend.model import harmonize as H
from backend.model import harmonize_cells as C
from backend.model import harmonize_places as PL

FIRST_CLEAN: int = 12 * 12 + 1     # February 2012: Suomi NPP rows begin on 20 January 2012
LAST_MONTH: int = C.N_MONTHS - 1   # December 2025
PRE_DRIFT_LAST_YEAR: int = 2019
MIN_YEAR_ROWS: float = 50.0
MIN_GROUP_PLACE_YEARS: int = 30
INTERVAL_FOR: tuple[str, ...] = ("in_use", "pooled_size", "scan_fit")
RULE_SHA256: str = "b487f2445a6d7c35405f35e1afac522efc14fccae0f54bc54b80cc0196e5b796"


def month_text(i: int) -> str:
    return f"{H.FIRST_YEAR + i // 12:04d}-{i % 12 + 1:02d}"


def cache_platform_months(cache_dir: Path = FIRMS_CACHE_DIR) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    """(months each platform delivers in, months with an outage day), by the calendar's rule over the cache."""
    days = platform_days(cache_dir)
    gaps = outage_days(days)
    return ({p: {d[:7] for d, n in c.items() if n > 0} for p, c in days.items()},
            {p: {d[:7] for d in s} for p, s in gaps.items()})


def clean_months(months: np.ndarray, platform_months: tuple[dict[str, set], dict[str, set]] | None = None
                 ) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """(clean, sharp): clean months have Suomi NPP, Terra and Aqua delivering with no outage day, from February
    2012; sharp months are clean months in which NOAA-20 also delivers with no outage day. Months are given as
    'YYYY-MM' or as month indices from January 2000 in `platform_months`."""
    deliver, gap_m = platform_months or cache_platform_months()
    text = [month_text(int(m)) for m in months]
    if any(isinstance(v, int) for vs in deliver.values() for v in vs):
        deliver = {p: {month_text(v) for v in vs} for p, vs in deliver.items()}
        gap_m = {p: {month_text(v) for v in vs} for p, vs in gap_m.items()}

    def ok(p: str, t: str) -> bool:
        return t in deliver.get(p, set()) and t not in gap_m.get(p, set())

    clean = np.array([m >= FIRST_CLEAN and all(ok(p, t) for p in ("Suomi NPP", "Terra", "Aqua"))
                      for m, t in zip(months, text)])
    sharp = clean & np.array([ok("NOAA-20", t) for t in text])
    info = {"clean_months": int(clean.sum()), "sharp_months": int(sharp.sum()),
            "left_out_overlap_months": [t for m, t, c in zip(months, text, clean) if m >= FIRST_CLEAN and not c]}
    return clean, sharp, info


def places_of(tab: dict[str, Any]) -> H.Places:
    lat_c = tab["lat0"] + tab["deg"] / 2.0
    band = ((PL.band_of(lat_c) + 90.0) / PL.BAND_DEG).astype(np.int64)
    return H.Places(band=band, nb_src=tab["nb_src"], nb_dst=tab["nb_dst"])


def closed_year_mask(tab: dict[str, Any], years: np.ndarray) -> np.ndarray:
    """(P, Y) True where a place-year is closed: the place's box meets a test fire region's context box in a year
    the closed rule covers."""
    from backend.model.training import closed_for

    out = np.zeros((tab["lat0"].size, years.size), dtype=bool)
    for yi, y in enumerate(years):
        s = float(_cal.timegm((int(y), 1, 1, 0, 0, 0)))
        e = float(_cal.timegm((int(y) + 1, 1, 1, 0, 0, 0)))
        for p in range(tab["lat0"].size):
            w, so = float(tab["lon0"][p]), float(tab["lat0"][p])
            if closed_for((w, so, w + tab["deg"], so + tab["deg"]), s, e) is not None:
                out[p, yi] = True
    return out


def group_labels(tab: dict[str, Any]) -> dict[str, list[str]]:
    lat_c = tab["lat0"] + tab["deg"] / 2.0
    lon_c = tab["lon0"] + tab["deg"] / 2.0
    if tab["country"] is None:
        region = [PL.world_region(float(lo), float(la)) for lo, la in zip(lon_c, lat_c)]
    else:
        region = [PL.country_region(c, float(lo), float(la)) for c, lo, la in zip(tab["country"], lon_c, lat_c)]
    band = [PL.band_name(float(b)) for b in PL.band_of(lat_c)]
    return {"region": region, "band": band}


def scores(pred: np.ndarray, obs: np.ndarray, months: np.ndarray, clean: np.ndarray, closed: np.ndarray,
           years: np.ndarray, members: np.ndarray, pre_drift: bool = False) -> dict[str, Any]:
    """The rule's scores over the places where `members` is True."""
    yr = H._year(months)
    use_t = clean & (yr <= PRE_DRIFT_LAST_YEAR) if pre_drift else clean
    month_ok = members[:, None] & use_t[None, :] & ~closed[:, np.searchsorted(years, yr)]
    month_ok &= np.isfinite(pred)
    err = np.abs(pred - obs)
    s_month = float(err[month_ok].sum() / obs[month_ok].sum()) if obs[month_ok].sum() > 0 else None
    busy = month_ok & (obs >= 10)
    med_month = float(np.median(err[busy] / obs[busy])) if busy.any() else None
    # place-years over clean months
    ys = years[years <= PRE_DRIFT_LAST_YEAR] if pre_drift else years
    py_obs, py_pred, py_ok = [], [], []
    for y in ys:
        cols = use_t & (yr == y)
        if not cols.any():
            continue
        yi = int(np.searchsorted(years, y))
        ok = members & ~closed[:, yi]
        py_obs.append(obs[:, cols].sum(axis=1))
        py_pred.append(np.where(np.isfinite(pred[:, cols]), pred[:, cols], 0.0).sum(axis=1))
        py_ok.append(ok)
    vo, vp, vk = np.array(py_obs), np.array(py_pred), np.array(py_ok)
    sc = vk & (vo >= MIN_YEAR_ROWS)
    rel = np.abs(vp[sc] - vo[sc]) / vo[sc]
    return {
        "S_month": round(s_month, 4) if s_month is not None else None,
        "S_year": round(float(np.median(rel)), 4) if rel.size else None,
        "annual_fire_weighted": round(float(np.abs(vp[vk] - vo[vk]).sum() / vo[vk].sum()), 4) if vo[vk].sum() > 0 else None,
        "median_month_error_busy": round(med_month, 4) if med_month is not None else None,
        "place_years_scored": int(sc.sum()),
        "place_months": int(month_ok.sum()),
        "suomi_npp_rows": float(obs[month_ok].sum()),
    }


def annual(a: np.ndarray, months: np.ndarray, clean: np.ndarray, years: np.ndarray) -> np.ndarray:
    """(P, Y) sums over each year's clean months (nan in a prediction counts as 0)."""
    yr = H._year(months)
    return np.stack([np.where(np.isfinite(a[:, clean & (yr == y)]), a[:, clean & (yr == y)], 0.0).sum(axis=1)
                     for y in years], axis=1)




def interval_check(pred: np.ndarray, obs: np.ndarray, months: np.ndarray, clean: np.ndarray, closed: np.ndarray,
                   years: np.ndarray, groups: dict[str, np.ndarray], unit: float, by: np.ndarray | None = None
                   ) -> dict[str, Any]:
    """The held-out interval, set for each year from the held-out errors of every other year and checked on that
    year, for months and for years. Closed place-years neither set it nor check it. With `by` (a group index per
    place, such as its latitude band) each group gets its own table, a bin with too few errors taking the world's."""
    inside_m, m_valid, inside_y, y_valid, ap, ao, width_m = interval_inside(pred, obs, months, clean, closed, years,
                                                                            groups["world"], unit, by)
    return _coverage(inside_m, m_valid, inside_y, y_valid, pred, obs, ap, ao, groups, unit, width_m)


def interval_inside(pred: np.ndarray, obs: np.ndarray, months: np.ndarray, clean: np.ndarray, closed: np.ndarray,
                    years: np.ndarray, world: np.ndarray, unit: float, by: np.ndarray | None = None) -> tuple:
    """(inside per place-month, months checked, inside per place-year, years checked, annual predictions, annual
    observations, relative width per place-month) of the nested check."""
    yr = H._year(months)
    m_valid = world[:, None] & clean[None, :] & ~closed[:, np.searchsorted(years, yr)] & np.isfinite(pred)
    inside_m = np.zeros(pred.shape, dtype=bool)
    width_m = np.full(pred.shape, np.nan)
    ap, ao = annual(pred, months, clean, years), annual(obs, months, clean, years)
    y_valid = world[:, None] & ~closed
    inside_y = np.zeros(ap.shape, dtype=bool)
    for yi, y in enumerate(years):
        cal = m_valid & (yr != y)[None, :]
        test = m_valid & (yr == y)[None, :]
        if not test.any():
            continue
        cy = y_valid.copy()
        cy[:, yi] = False
        parts = [(np.ones(pred.shape[0], dtype=bool), None)] if by is None else \
            [(by == g, g) for g in np.unique(by)]
        tab_w = H.interval_table(pred[cal], obs[cal], unit)
        taby_w = H.interval_table(ap[cy], ao[cy], unit)
        for rows, g in parts:
            r = rows[:, None]
            tab, taby = tab_w, taby_w
            if g is not None:
                tab = H.interval_table(pred[cal & r], obs[cal & r], unit, fallback=tab_w)
                taby = H.interval_table(ap[cy & r], ao[cy & r], unit, fallback=taby_w)
            t = test & r
            lo, hi = H.apply_interval(pred[t], tab)
            o = obs[t]
            inside_m[t] = (o >= lo - 1e-9) & (o <= hi + 1e-9)
            width_m[t] = (hi - lo) / (np.maximum(pred[t], 0.0) + unit)
            ty = y_valid[:, yi] & rows
            lo, hi = H.apply_interval(ap[ty, yi], taby)
            inside_y[ty, yi] = (ao[ty, yi] >= lo - 1e-9) & (ao[ty, yi] <= hi + 1e-9)
    return inside_m, m_valid, inside_y, y_valid, ap, ao, width_m


def in_use_interval_check(X: dict[str, np.ndarray], obs: np.ndarray, months: np.ndarray, clean: np.ndarray,
                          closed: np.ndarray, years: np.ndarray, groups: dict[str, np.ndarray], q: str, unit: float
                          ) -> dict[str, Any]:
    """The method in use's interval, MODIS times the 10th and 90th percentile of the place's yearly ratios over its
    training years, checked the same way. A place with fewer than two training years with MODIS input has none and
    counts as not covered."""
    yr = H._year(months)
    M = H._plain_modis(X, q)
    am, ao = annual(M, months, clean, years), annual(obs, months, clean, years)
    world = groups["world"]
    m_valid = world[:, None] & clean[None, :] & ~closed[:, np.searchsorted(years, yr)]
    y_valid = world[:, None] & ~closed
    inside_m = np.zeros(M.shape, dtype=bool)
    inside_y = np.zeros(am.shape, dtype=bool)
    width_m = np.full(M.shape, np.nan)
    with np.errstate(invalid="ignore", divide="ignore"):
        ratio_y = np.where(am > 0, ao / np.where(am > 0, am, 1.0), np.nan)
    for yi, y in enumerate(years):
        r = ratio_y.copy()
        r[:, yi] = np.nan
        enough = np.isfinite(r).sum(axis=1) >= 2
        p10 = np.full(r.shape[0], np.nan)
        p90 = np.full(r.shape[0], np.nan)
        if enough.any():
            p10[enough] = np.nanpercentile(r[enough], 10, axis=1)
            p90[enough] = np.nanpercentile(r[enough], 90, axis=1)
        cols = yr == y
        lo, hi = M[:, cols] * p10[:, None], M[:, cols] * p90[:, None]
        o = obs[:, cols]
        inside_m[:, cols] = (o >= lo - 1e-9) & (o <= hi + 1e-9)
        width_m[:, cols] = (hi - lo) / (M[:, cols] * np.where(np.isfinite(p10), (p10 + p90) / 2, np.nan)[:, None] + unit)
        lo, hi = am[:, yi] * p10, am[:, yi] * p90
        inside_y[:, yi] = (ao[:, yi] >= lo - 1e-9) & (ao[:, yi] <= hi + 1e-9)
    pred_proxy = M * 1.0
    return _coverage(inside_m, m_valid, inside_y, y_valid, pred_proxy, obs, am, ao, groups, unit, width_m)


def _coverage(inside_m: np.ndarray, m_valid: np.ndarray, inside_y: np.ndarray, y_valid: np.ndarray, pred: np.ndarray,
              obs: np.ndarray, ap: np.ndarray, ao: np.ndarray, groups: dict[str, np.ndarray], unit: float,
              width_m: np.ndarray) -> dict[str, Any]:
    # sets chosen by the prediction alone: a set chosen by the observation would bias coverage
    nonempty_m = m_valid & (np.nan_to_num(pred) >= unit)
    nonempty_y = y_valid & (ap >= unit)
    busy_y = y_valid & (ap >= MIN_YEAR_ROWS * unit)

    def share(ins: np.ndarray, ok: np.ndarray) -> float | None:
        return round(float(ins[ok].mean()), 4) if ok.any() else None

    out: dict[str, Any] = {"level": H.LEVEL, "groups": {}}
    for g, mem in groups.items():
        mm, my = mem[:, None], mem[:, None]
        out["groups"][g] = {
            "months": share(inside_m, m_valid & mm), "months_predicted_ge_1": share(inside_m, nonempty_m & mm),
            "years": share(inside_y, y_valid & my), "years_predicted_ge_1": share(inside_y, nonempty_y & my),
            "years_predicted_ge_50": share(inside_y, busy_y & my),
            "place_months": int((m_valid & mm).sum()), "place_years": int((y_valid & my).sum()),
            "median_relative_width_months_predicted_ge_1": (round(float(np.nanmedian(width_m[nonempty_m & mm])), 3)
                                                      if (nonempty_m & mm).any() else None),
        }
    b = H.interval_bin(np.nan_to_num(np.maximum(pred, 0.0)), unit)
    out["months_by_predicted_size"] = {int(k): share(inside_m, m_valid & (b == k)) for k in range(H.INTERVAL_BINS)
                                       if (m_valid & (b == k)).any()}
    return out


def load_source(source: str, place_deg: float) -> tuple[dict[str, Any], Any, dict[str, Any]]:
    if source == "cube":
        cdir = C.cube_dir()
        meta = C.cube_meta(cdir)
        tab = C.cube_place_table(cdir, place_deg, month_first=12 * 12, month_last=LAST_MONTH)
        read = {"source": "fire cube", "cube_build": meta["build"], "cube_manifest_sha256": meta["manifest_sha256"],
                "countries": len(meta["countries_loaded"])}
        return tab, C.cube_platform_months(cdir, tab["months"]), read
    arrays, manifest = C.load()
    tab = C.place_table(arrays, manifest["countries"], place_deg, month_first=12 * 12, month_last=LAST_MONTH)
    return tab, None, {"source": "country files in the cache", "cells_npz_sha256": manifest["cells_npz_sha256"],
                       "countries": len(manifest["countries"])}


def fit_tables(source: str = "cube", place_deg: float = PL.PLACE_DEG, serve_rows: str = "overlap_ratio_v1"
               ) -> dict[str, Any]:
    """What the Record's call reads, for every method it can serve: interval tables from held-out errors (each
    overlap year left out in turn over every place, per latitude band with a world fallback bin by bin), for the
    method on Terra and Aqua and on Terra alone (the months before Aqua), and, for a method that leans on the world
    fit, the world parts a single place needs (`harmonize.served_params`). FRP is fitted for the method in use.
    Closed place-years and places with no row in the clean months are left out of the tables. `serve_rows` names
    the method served for rows."""
    tab, pm, read = load_source(source, place_deg)
    X, months = tab["channels"], tab["months"]
    clean, sharp, info = clean_months(months, pm)
    places = places_of(tab)
    years = np.arange(2012, 2026)
    any_rows = sum(X[f"n_{p}_{d}"] for p in "TASJ" for d in "DN")[:, clean].sum(axis=1) > 0
    closed = closed_year_mask(tab, years) | ~any_rows[:, None]
    yr = H._year(months)
    band_s = PL.band_of(tab["lat0"] + tab["deg"] / 2.0)
    pairs: dict[str, int] = {}
    n_modis = H._plain_modis(X, "n")[:, clean].sum()
    frp_unit = float(H._plain_modis(X, "frp")[:, clean].sum() / n_modis) if n_modis > 0 else 1.0
    methods: dict[str, Any] = {}
    jobs = []
    for mid, (spec_ta, spec_t) in H.SERVED.items():
        jobs += [(mid, "terra_aqua", spec_ta, "n", 1.0), (mid, "terra_only", spec_t, "n", 1.0)]
    jobs += [("overlap_ratio_v1", "frp_terra_aqua", H.SERVED["overlap_ratio_v1"][0], "frp", frp_unit),
             ("overlap_ratio_v1", "frp_terra_only", H.SERVED["overlap_ratio_v1"][1], "frp", frp_unit)]
    for mid, regime, spec, q, unit in jobs:
        m = methods.setdefault(mid, {"month": {}, "year": {}})
        obs = X[f"{q}_S_D"] + X[f"{q}_S_N"]
        pred = H.held_out(X, months, clean, spec, places, q, unit, sharp)
        ok_m = clean[None, :] & ~closed[:, np.searchsorted(years, yr)] & np.isfinite(pred)
        ap, ao = annual(pred, months, clean, years), annual(obs, months, clean, years)
        ok_y = ~closed
        for scale, P, O, ok in (("month", pred, obs, ok_m), ("year", ap, ao, ok_y)):
            t = {"world": H.interval_table(P[ok], O[ok], unit), "bands": {}}
            for b in np.unique(band_s):
                rows = (band_s == b)[:, None] & ok
                if rows.sum():
                    t["bands"][f"{b:g}"] = H.interval_table(P[rows], O[rows], unit, fallback=t["world"])
            m[scale][regime] = t
            pairs[f"{mid} {scale} {regime}"] = int(ok.sum())
        if spec.pool or spec.size or spec.groups != "none":
            f = H.Fit()
            H.fit_predict(X, months, clean, spec, places, q, unit, sharp, f)
            m.setdefault("params", {})[regime] = H.served_params(f, places, unit)
    if serve_rows not in methods:
        raise ValueError(f"{serve_rows} is not a method the Record can serve")
    return {
        "serve": {"rows": serve_rows, "frp": "overlap_ratio_v1"},
        "level": H.LEVEL,
        "provenance": {**read, "place_deg": place_deg, "places": int(tab["lat0"].size), "pairs": pairs,
                       "frp_unit_mw": round(frp_unit, 3), "clean_months": info["clean_months"],
                       "rule_sha256": RULE_SHA256,
                       "held_out": "each overlap year 2012 to 2025 left out in turn over every place at once",
                       "closed_place_years_left_out": int(closed_year_mask(tab, years).sum()),
                       "places_with_rows_in_clean_months": int(any_rows.sum())},
        "methods": methods,
    }


def write_fitted(fitted: dict[str, Any], path: Path) -> str:
    """Write the tables as a module that holds them as JSON text, one list to a line."""
    import re

    def clean_floats(o: Any) -> Any:
        if isinstance(o, float):
            return round(o, 6)
        if isinstance(o, dict):
            return {k: clean_floats(v) for k, v in o.items()}
        if isinstance(o, list):
            return [clean_floats(v) for v in o]
        return o

    body = json.dumps(clean_floats(fitted), indent=1)
    body = re.sub(r"\[\s*([^\[\]{}]*?)\s*\]", lambda m: "[" + " ".join(m.group(1).split()) + "]", body)
    text = ('"""The interval tables the Record uses, written by `python3 -m backend.model.harmonize_eval fit-tables`.\n\n'
            'Held-out errors of the method in use over every place of the fit; see `harmonize.interval_table`. Do not\n'
            'edit by hand: run the command again.\n"""\n\nimport json\n\nFITTED = json.loads(r"""\n' + body + '\n""")\n')
    path.write_text(text, encoding="utf-8")
    return hashlib.sha256(text.encode()).hexdigest()

def run(out: Path, place_deg: float = PL.PLACE_DEG, quantities: tuple[str, ...] = ("n", "frp"),
        specs: tuple[H.Spec, ...] = H.SPECS, source: str = "cache") -> dict[str, Any]:
    t0 = time.time()
    if source == "cube":
        cdir = C.cube_dir()
        meta = C.cube_meta(cdir)
        tab = C.cube_place_table(cdir, place_deg, month_first=12 * 12, month_last=LAST_MONTH)
        pm = C.cube_platform_months(cdir, tab["months"])
        read = {"source": "fire cube", "cube_build": meta["build"], "cube_manifest_sha256": meta["manifest_sha256"],
                "countries": meta["countries_loaded"], "sources": len(meta["countries_loaded"])}
        specs = tuple(s for s in specs if s.inputs != "area")
    else:
        arrays, manifest = C.load()
        tab = C.place_table(arrays, manifest["countries"], place_deg, month_first=12 * 12, month_last=LAST_MONTH)
        pm = None
        read = {"source": "country files in the cache", "cells_npz_sha256": manifest["cells_npz_sha256"],
                "sources": len(manifest["sources"]), "countries": manifest["countries"]}
    X = tab["channels"]
    months = tab["months"]
    clean, sharp, clean_info = clean_months(months, pm)
    places = places_of(tab)
    years = np.arange(2012, 2026)
    closed = closed_year_mask(tab, years)
    labels = group_labels(tab)
    any_rows = sum(X[f"n_{p}_{d}"] for p in "TASJ" for d in "DN")[:, clean].sum(axis=1) > 0
    groups: dict[str, np.ndarray] = {"world": any_rows}
    if tab.get("with_country") is not None:
        groups["places outside the three design countries"] = any_rows & ~tab["with_country"]
        groups["places in the three design countries"] = any_rows & tab["with_country"]
    for kind in ("region", "band"):
        for name in sorted(set(labels[kind])):
            groups[f"{kind}: {name}"] = any_rows & np.array([v == name for v in labels[kind]])
    result: dict[str, Any] = {
        "rule_sha256": RULE_SHA256,
        **read,
        "place_deg": place_deg,
        "places": int(any_rows.sum()),
        "clean": clean_info,
        "closed_place_years": int(closed[any_rows].sum()),
        "quantities": {},
    }
    for q in quantities:
        obs = X[f"{q}_S_D"] + X[f"{q}_S_N"]
        modis = H._plain_modis(X, q)
        unit = float(modis[:, clean].sum() / sum(X[f"n_{p}_{d}"] for p in "TA" for d in "DN")[:, clean].sum()) if q == "frp" else 1.0
        rows = {}
        preds = {}
        for spec in specs:
            if q == "frp" and spec.name in H.FRP_SKIP:
                continue
            ts = time.time()
            pred = H.held_out(X, months, clean, spec, places, q, unit, sharp)
            preds[spec.name] = pred
            rows[spec.name] = {
                "label": spec.label,
                "seconds": round(time.time() - ts, 2),
                "groups": {g: scores(pred, obs, months, clean, closed, years, m) for g, m in groups.items()},
                "pre_drift_world": scores(pred, obs, months, clean, closed, years, groups["world"], pre_drift=True),
            }
        no_ratio = _in_use_without_ratio(X, months, clean, q)
        intervals = {"in_use_interval": in_use_interval_check(X, obs, months, clean, closed, years, groups, q, unit)}
        for name in INTERVAL_FOR:
            if name in preds:
                intervals[f"held_out_interval_on_{name}"] = interval_check(preds[name], obs, months, clean, closed,
                                                                           years, groups, unit)
                intervals[f"held_out_interval_by_band_on_{name}"] = interval_check(
                    preds[name], obs, months, clean, closed, years, groups, unit, by=places.band)
        result["quantities"][q] = {"unit": unit, "candidates": rows, "in_use_place_years_without_ratio": no_ratio,
                                   "intervals": intervals}
        np.savez_compressed(out / f"heldout_{q}_{place_deg:g}deg.npz", obs=obs, months=months, clean=clean,
                            lat0=tab["lat0"], lon0=tab["lon0"], **{f"pred_{k}": v for k, v in preds.items()})
    result["seconds"] = round(time.time() - t0, 1)
    return result


def _in_use_without_ratio(X: dict[str, np.ndarray], months: np.ndarray, clean: np.ndarray, q: str) -> int:
    """Place-years in which the method in use has no ratio: the place has no MODIS input in its training months."""
    yr = H._year(months)
    M = H._plain_modis(X, q)
    n = 0
    for y in sorted(set(yr[clean].tolist())):
        tr = clean & (yr != y)
        te = clean & (yr == y)
        n += int(((M[:, tr].sum(axis=1) == 0) & ((M[:, te].sum(axis=1) + (X[f"{q}_S_D"] + X[f"{q}_S_N"])[:, te].sum(axis=1)) > 0)).sum())
    return n


def decide(res: dict[str, Any], q: str) -> dict[str, Any]:
    """The rule's four tests for each candidate against the method in use."""
    cand = res["quantities"][q]["candidates"]
    base = cand["in_use"]
    bw = base["groups"]["world"]
    out = {}
    for name, c in cand.items():
        if name in ("in_use", "none"):
            continue
        w = c["groups"]["world"]
        gm = (bw["S_month"] - w["S_month"]) / bw["S_month"]
        gy = (bw["S_year"] - w["S_year"]) / bw["S_year"]
        t1 = (gm >= 0.10 or gy >= 0.10) and gm >= -0.02 and gy >= -0.02
        sub = [g for g in c["groups"] if g.startswith(("region", "band"))
               and base["groups"][g]["place_years_scored"] >= MIN_GROUP_PLACE_YEARS]
        better = [g for g in sub if c["groups"][g]["S_month"] < base["groups"][g]["S_month"]]
        worst = max(((c["groups"][g]["S_month"] - base["groups"][g]["S_month"]) / base["groups"][g]["S_month"] for g in sub),
                    default=0.0)
        regions = [g for g in sub if g.startswith("region")]
        bands = [g for g in sub if g.startswith("band")]
        t2 = (sum(g in better for g in regions) >= 2 / 3 * len(regions) and sum(g in better for g in bands) >= 2 / 3 * len(bands)
              and worst <= 0.10)
        t3 = c["pre_drift_world"]["S_month"] <= base["pre_drift_world"]["S_month"]
        t4 = H.SPEC_BY_NAME[name].pool or H.SPEC_BY_NAME[name].fallback == "band"
        out[name] = {"gain_S_month": round(gm, 4), "gain_S_year": round(gy, 4), "test1_world": t1,
                     "test2_everywhere": t2, "regions_better": f"{sum(g in better for g in regions)} of {len(regions)}",
                     "bands_better": f"{sum(g in better for g in bands)} of {len(bands)}",
                     "worst_group_loss": round(worst, 4), "test3_pre_drift": t3, "test4_anywhere": t4,
                     "passes": bool(t1 and t2 and t3 and t4)}
        o = "places outside the three design countries"
        if o in c["groups"] and base["groups"][o]["S_month"]:
            bo, co = base["groups"][o], c["groups"][o]
            out[name]["outside_design_gain_S_month"] = round((bo["S_month"] - co["S_month"]) / bo["S_month"], 4)
            out[name]["outside_design_gain_S_year"] = (round((bo["S_year"] - co["S_year"]) / bo["S_year"], 4)
                                                       if bo["S_year"] else None)
    return out


def table_md(res: dict[str, Any], q: str) -> str:
    cand = res["quantities"][q]["candidates"]
    groups = list(next(iter(cand.values()))["groups"])
    lines = [f"## {'Rows' if q == 'n' else 'FRP'}: world", "",
             "| Candidate | S_month | S_year | annual, fire weighted | month, median, V >= 10 | S_month 2012 to 2019 | place-years |",
             "| --- | --- | --- | --- | --- | --- | --- |"]
    for name, c in cand.items():
        w = c["groups"]["world"]
        lines.append(f"| {name} | {w['S_month']} | {w['S_year']} | {w['annual_fire_weighted']} | {w['median_month_error_busy']} | "
                     f"{c['pre_drift_world']['S_month']} | {w['place_years_scored']} |")
    lines += ["", f"## {'Rows' if q == 'n' else 'FRP'}: S_month by region and band", "",
              "| Group | place-years | " + " | ".join(cand) + " |", "| --- | --- | " + " | ".join("---" for _ in cand) + " |"]
    for g in groups:
        if g == "world":
            continue
        base = cand["in_use"]["groups"][g]
        lines.append(f"| {g} | {base['place_years_scored']} | " + " | ".join(str(c["groups"][g]["S_month"]) for c in cand.values()) + " |")
    lines += ["", f"## {'Rows' if q == 'n' else 'FRP'}: S_year by region and band", "",
              "| Group | place-years | " + " | ".join(cand) + " |", "| --- | --- | " + " | ".join("---" for _ in cand) + " |"]
    for g in groups:
        if g == "world":
            continue
        base = cand["in_use"]["groups"][g]
        lines.append(f"| {g} | {base['place_years_scored']} | " + " | ".join(str(c["groups"][g]["S_year"]) for c in cand.values()) + " |")
    return "\n".join(lines) + "\n"


def interval_md(res: dict[str, Any], q: str) -> str:
    iv = res["quantities"][q]["intervals"]
    lines = [f"## {'Rows' if q == 'n' else 'FRP'}: coverage of the 80 percent interval on held-out years", "",
             "| Interval | Group | months | months, predicted 1 or more | years | years, predicted 1 or more | years, predicted 50 or more | width, months predicted 1 or more |",
             "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for name, c in iv.items():
        for g, v in c["groups"].items():
            lines.append(f"| {name} | {g} | {v['months']} | {v['months_predicted_ge_1']} | {v['years']} | {v['years_predicted_ge_1']} | "
                         f"{v['years_predicted_ge_50']} | {v['median_relative_width_months_predicted_ge_1']} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run", "fit-tables"])
    ap.add_argument("--out", required=True)
    ap.add_argument("--deg", type=float, default=PL.PLACE_DEG)
    ap.add_argument("--only", default="")
    ap.add_argument("--source", choices=["cache", "cube"], default="cache")
    ap.add_argument("--serve", default="overlap_ratio_v1", help="fit-tables: the method served for rows")
    a = ap.parse_args()
    if a.cmd == "fit-tables":
        fitted = fit_tables(a.source, a.deg, a.serve)
        digest = write_fitted(fitted, Path(__file__).with_name("harmonize_fitted.py"))
        Path(a.out).mkdir(parents=True, exist_ok=True)
        (Path(a.out) / "fitted_provenance.json").write_text(json.dumps(fitted["provenance"], indent=1), encoding="utf-8")
        print("harmonize_fitted.py sha256", digest)
        print(json.dumps(fitted["provenance"], indent=1))
        return
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    specs = tuple(s for s in H.SPECS if not a.only or s.name in a.only.split(",") or s.name in ("none", "in_use"))
    res = run(out, a.deg, specs=specs, source=a.source)
    res["decision"] = {q: decide(res, q) for q in res["quantities"]}
    (out / f"results_{a.deg:g}deg.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    md = "".join(table_md(res, q) + "\n" + interval_md(res, q) + "\n" for q in res["quantities"])
    (out / f"tables_{a.deg:g}deg.md").write_text(md, encoding="utf-8")
    digest = hashlib.sha256((out / f"results_{a.deg:g}deg.json").read_bytes()).hexdigest()
    print(md)
    print(json.dumps(res["decision"], indent=1))
    print("results sha256", digest, "seconds", res["seconds"])


if __name__ == "__main__":
    main()
