"""Real monthly fire calendar from cached FIRMS rows (CONTRACT amendment 7).

Counts per month and platform come from the region extracts (backend/firms/archive.py). Rows with FIRMS type 2
(static land source: plants, refineries) are left out of the rates and counted on their own; every other row
counts. Rates are hotspots per 1000 km2 of the region's context box per day.

Harmonization, method ``overlap_ratio_v1`` (the simple baseline of docs/07): the harmonized value of a month is its
MODIS rate times the ratio of VIIRS Suomi NPP rows to MODIS rows over the overlap years, so every month from 2000 on
is estimated the same way and lands on the Suomi NPP scale. Months before Aqua delivers use a Terra-only ratio
fitted the same way. The interval is the 10th to 90th percentile of the per-year ratios. The method is checked by
leaving each overlap year out in turn, fitting on the rest and predicting that year's Suomi NPP counts from its MODIS
counts; the same check runs for no harmonization (MODIS as it is) so the gain is visible.

Which platforms deliver data in a month is read from the whole country file (the raw manifests), so a platform with
0 rows in the box but data elsewhere counts as delivering and observing nothing, while a platform with no data at
all that month is null.
"""

from __future__ import annotations

import calendar as _cal
import collections
import csv
import io
import json
import math
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from backend.firms.archive import (
    FIRMS_CACHE_DIR,
    PRODUCTS,
    REGION_COUNTRY,
    _platform,
    read_firms,
    region_box,
)

METHOD_ID: str = "overlap_ratio_v1"
PLATFORMS: tuple[str, ...] = ("Terra", "Aqua", "Suomi NPP", "NOAA-20")
STATIC_TYPE: str = "2"
EARTH_RADIUS_KM: float = 6371.0088
CSV_MAX_ROWS: int = 500_000
# Sourced drift markers (the same pages docs/09 quotes for the nominal overpass times).
DRIFT_MARKERS: tuple[dict[str, str], ...] = (
    {"year_month": "2020-02", "label": "Terra begins drifting to earlier overpass times",
     "source": "https://terra.nasa.gov/about"},
    {"year_month": "2021-12", "label": "Aqua's last drag makeup maneuver; free drift to later overpass times",
     "source": "https://science.nasa.gov/mission/aqua/"},
)


def box_area_km2(box: tuple[float, float, float, float]) -> float:
    """Area of a longitude and latitude box on the sphere."""
    w, s, e, n = box
    return EARTH_RADIUS_KM**2 * math.radians(e - w) * (math.sin(math.radians(n)) - math.sin(math.radians(s)))


def _months(first: str, last: str) -> list[str]:
    y, m = int(first[:4]), int(first[5:7])
    out = []
    while f"{y:04d}-{m:02d}" <= last:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


OUTAGE_MIN_OTHER_ROWS: int = 100


def platform_days(cache_dir: Path = FIRMS_CACHE_DIR) -> dict[str, collections.Counter[str]]:
    """{platform: {date: rows}} summed over every cached country file. A platform's delivery is global, so a quiet
    month in one small country does not read as the platform being off."""
    out: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    for p in PRODUCTS:
        base = cache_dir / "raw" / p
        for m in base.rglob("*.csv.manifest.json") if base.is_dir() else []:
            d = json.loads(m.read_text(encoding="utf-8"))
            days = d.get("satellite_day_rows")
            if days is None:
                raise KeyError(f"{m.name} has no satellite_day_rows; run `archive.py reingest`")
            for sat, by_day in days.items():
                out[_platform(p, sat)].update(by_day)
    return out


def outage_days(days: dict[str, collections.Counter[str]], min_other: int = OUTAGE_MIN_OTHER_ROWS) -> dict[str, set[str]]:
    """Days inside a platform's operating span (first to last day with rows) on which it has no row in any cached
    country file while the other platforms together have at least ``min_other``: the platform delivered no data."""
    all_days = sorted(set().union(*[set(c) for c in days.values()])) if days else []
    out: dict[str, set[str]] = {}
    for p, c in days.items():
        active = sorted(d for d, n in c.items() if n > 0)
        if not active:
            out[p] = set()
            continue
        first, last = active[0], active[-1]
        out[p] = {
            d for d in all_days
            if first <= d <= last and c.get(d, 0) == 0 and sum(days[q].get(d, 0) for q in days if q != p) >= min_other
        }
    return out


def monthly_counts(region_id: str, cache_dir: Path = FIRMS_CACHE_DIR) -> tuple[dict[str, dict[str, dict[str, int]]], dict[str, int], int]:
    """({month: {platform: {"day", "night", "static"}}}, static rows per platform, rows read) from the extracts."""
    counts: dict[str, dict[str, dict[str, int]]] = collections.defaultdict(
        lambda: collections.defaultdict(lambda: {"day": 0, "night": 0, "static": 0}))
    static = collections.Counter()
    n = 0
    base = cache_dir / "extract" / region_id
    for path in sorted(base.glob("*.csv")) if base.is_dir() else []:
        product = path.stem.rsplit("_", 1)[0]
        with path.open(encoding="utf-8", newline="") as fh:
            r = csv.reader(fh)
            col = {c: i for i, c in enumerate(next(r))}
            i_d, i_s, i_dn = col["acq_date"], col["satellite"], col["daynight"]
            i_t = col.get("type")
            for rec in r:
                n += 1
                plat = _platform(product, rec[i_s])
                cell = counts[rec[i_d][:7]][plat]
                if i_t is not None and rec[i_t] == STATIC_TYPE:
                    cell["static"] += 1
                    static[plat] += 1
                elif rec[i_dn] == "D":
                    cell["day"] += 1
                else:
                    cell["night"] += 1
    return counts, dict(static), n


def _fire(counts: dict[str, dict[str, dict[str, int]]], month: str, plat: str) -> int:
    c = counts.get(month, {}).get(plat)
    return 0 if c is None else c["day"] + c["night"]


def fit_ratio(pairs: Iterable[tuple[int, float, float]]) -> dict[str, Any]:
    """Overlap ratio from (year, VIIRS count, MODIS count) per month: the ratio of sums over all months, the per-year
    ratios, and their 10th and 90th percentiles."""
    by_year: dict[int, list[float]] = collections.defaultdict(lambda: [0.0, 0.0])
    for y, v, m in pairs:
        by_year[y][0] += v
        by_year[y][1] += m
    sv = sum(a for a, _ in by_year.values())
    sm = sum(b for _, b in by_year.values())
    per_year = {y: a / b for y, (a, b) in sorted(by_year.items()) if b > 0}
    vals = np.array(list(per_year.values()), dtype=np.float64)
    return {
        "ratio": sv / sm if sm > 0 else None,
        "per_year": {str(y): round(r, 4) for y, r in per_year.items()},
        "p10": float(np.percentile(vals, 10)) if vals.size else None,
        "p90": float(np.percentile(vals, 90)) if vals.size else None,
        "years": sorted(by_year),
        "viirs_rows": int(sv),
        "modis_rows": int(sm),
    }


BUSY_MONTH_MODIS_ROWS: int = 10


def leave_one_year_out(pairs: list[tuple[int, float, float]]) -> dict[str, Any]:
    """Fit on all overlap years but one, predict the held-out year's VIIRS counts from its MODIS counts."""
    years = sorted({y for y, _, _ in pairs})
    rows = []
    covered = total_months = busy_cov = busy = years_cov = 0

    def inside(v: float, m: float, f: dict[str, Any]) -> bool:
        return m * f["p10"] - 1e-9 <= v <= m * f["p90"] + 1e-9

    for y in years:
        train = [p for p in pairs if p[0] != y]
        test = [p for p in pairs if p[0] == y]
        f = fit_ratio(train)
        if f["ratio"] is None:
            continue
        v_obs = sum(v for _, v, _ in test)
        m_obs = sum(m for _, _, m in test)
        v_hat = m_obs * f["ratio"]
        for _, v, m in test:
            ok = inside(v, m, f)
            covered += int(ok)
            total_months += 1
            if m >= BUSY_MONTH_MODIS_ROWS:
                busy_cov += int(ok)
                busy += 1
        years_cov += int(inside(v_obs, m_obs, f))
        rows.append({
            "year": y,
            "months": len(test),
            "viirs_observed": int(v_obs),
            "modis_observed": int(m_obs),
            "ratio_fitted_without_this_year": round(f["ratio"], 4),
            "viirs_predicted": round(v_hat, 1),
            "relative_error": round((v_hat - v_obs) / v_obs, 4) if v_obs > 0 else None,
            "relative_error_without_harmonization": round((m_obs - v_obs) / v_obs, 4) if v_obs > 0 else None,
            "inside_interval": inside(v_obs, m_obs, f),
        })
    errs = [abs(r["relative_error"]) for r in rows if r["relative_error"] is not None]
    naive = [abs(r["relative_error_without_harmonization"]) for r in rows if r["relative_error_without_harmonization"] is not None]
    return {
        "held_out_years": [r["year"] for r in rows],
        "per_year": rows,
        "median_abs_relative_error_annual": round(float(np.median(errs)), 4) if errs else None,
        "mean_abs_relative_error_annual": round(float(np.mean(errs)), 4) if errs else None,
        "median_abs_relative_error_without_harmonization": round(float(np.median(naive)), 4) if naive else None,
        "annual_interval_coverage": round(years_cov / len(rows), 4) if rows else None,
        "monthly_interval_coverage": round(covered / total_months, 4) if total_months else None,
        "months_tested": total_months,
        f"monthly_interval_coverage_modis_rows_ge_{BUSY_MONTH_MODIS_ROWS}": round(busy_cov / busy, 4) if busy else None,
        f"months_tested_modis_rows_ge_{BUSY_MONTH_MODIS_ROWS}": busy,
        "nominal_interval": "10th to 90th percentile of per-year ratios (80 percent if the yearly ratio spread held)",
        "definition": "for each overlap year: fit the ratio of sums and the 10th to 90th percentile of per-year ratios on "
                      "the other overlap years; predicted VIIRS = MODIS x ratio; relative error = (predicted - observed) "
                      "/ observed over the year; coverage = share of held-out years (annual) or months (monthly) whose "
                      "observed VIIRS count lies within MODIS x [p10, p90]",
    }


def firms_calendar(region_id: str, cache_dir: Path = FIRMS_CACHE_DIR) -> dict[str, Any]:
    """The /api/calendar payload for ``source=firms`` (today's schema plus the amendment 7 additions)."""
    from backend.terrain.live_region import PRESET_BY_ID

    if region_id not in REGION_COUNTRY:
        raise KeyError(f"no FIRMS rows for region '{region_id}'; regions with rows: {sorted(REGION_COUNTRY)}")
    box = region_box(region_id)
    area = box_area_km2(box)
    if not (cache_dir / "extract" / region_id).is_dir():
        raise KeyError(f"no FIRMS rows cached for '{region_id}'")
    days = platform_days(cache_dir)
    deliver = {p: {d[:7] for d, n in c.items() if n > 0} for p, c in days.items()}
    if not any(deliver.values()):
        raise KeyError(f"no FIRMS rows cached for '{region_id}'")
    gaps = outage_days(days)
    gap_months: dict[str, collections.Counter[str]] = {p: collections.Counter(d[:7] for d in s) for p, s in gaps.items()}
    counts, static, rows_read = monthly_counts(region_id, cache_dir)
    all_months = sorted(set().union(*deliver.values()))
    months = _months(all_months[0], all_months[-1])

    def on(plat: str, mo: str) -> bool:
        return mo in deliver.get(plat, set())

    def clean(mo: str, *plats: str) -> bool:
        return all(on(p, mo) and gap_months.get(p, {}).get(mo, 0) == 0 for p in plats)

    # Overlap months: Suomi NPP, Terra and Aqua all delivering, with no outage day for any of them.
    both = [(int(mo[:4]), _fire(counts, mo, "Suomi NPP"), _fire(counts, mo, "Terra") + _fire(counts, mo, "Aqua"))
            for mo in months if clean(mo, "Suomi NPP", "Terra", "Aqua")]
    terra = [(int(mo[:4]), _fire(counts, mo, "Suomi NPP"), _fire(counts, mo, "Terra"))
             for mo in months if clean(mo, "Suomi NPP", "Terra")]
    excluded = [mo for mo in months if on("Suomi NPP", mo) and on("Terra", mo) and on("Aqua", mo)
                and not clean(mo, "Suomi NPP", "Terra", "Aqua")]
    fit_both, fit_terra = fit_ratio(both), fit_ratio(terra)
    validation = leave_one_year_out(both)

    def rate(n: float, mo: str) -> float:
        days = _cal.monthrange(int(mo[:4]), int(mo[5:7]))[1]
        return n / (area / 1000.0) / days

    records = []
    for i, mo in enumerate(months):
        t_on, a_on, s_on, n_on = on("Terra", mo), on("Aqua", mo), on("Suomi NPP", mo), on("NOAA-20", mo)
        raw_counts = {}
        for plat, ok in (("Terra", t_on), ("Aqua", a_on), ("Suomi NPP", s_on), ("NOAA-20", n_on)):
            c = counts.get(mo, {}).get(plat, {"day": 0, "night": 0, "static": 0})
            raw_counts[plat] = ({"day": c["day"], "night": c["night"], "total": c["day"] + c["night"],
                                 "static_excluded": c["static"], "outage_days": gap_months.get(plat, {}).get(mo, 0)}
                                if ok else None)
        modis_n = (_fire(counts, mo, "Terra") if t_on else 0) + (_fire(counts, mo, "Aqua") if a_on else 0)
        if t_on and a_on:
            fit, used = fit_both, "terra_aqua"
        elif t_on:
            fit, used = fit_terra, "terra_only"
            modis_n = _fire(counts, mo, "Terra")
        else:
            fit, used = None, None
        if fit is not None and fit["ratio"] is not None:
            mr = rate(modis_n, mo)
            h, lo, hi = mr * fit["ratio"], mr * fit["p10"], mr * fit["p90"]
            state = "Harmonized"
        else:
            mr = rate(modis_n, mo) if (t_on or a_on) else None
            h = lo = hi = None
            state = "No MODIS data"
        if not (t_on or a_on):
            regime = "NO_MODIS"
        elif not a_on:
            regime = "TERRA_ONLY"
        elif not s_on:
            regime = "TERRA_AQUA_STABLE"
        elif not n_on:
            regime = "MODIS_SNPP"
        else:
            regime = "MODIS_SNPP_NOAA20"
        records.append({
            "index": i,
            "year": int(mo[:4]),
            "month": int(mo[5:7]),
            "year_month": mo,
            "modis_raw_rate": round(mr, 4) if mr is not None else None,
            "viirs_raw_rate": round(rate(_fire(counts, mo, "Suomi NPP"), mo), 4) if s_on else None,
            "harmonized_mean": round(h, 4) if h is not None else None,
            "harmonized_p10": round(lo, 4) if lo is not None else None,
            "harmonized_p90": round(hi, 4) if hi is not None else None,
            "coverage_fraction": None,
            "state_label": state,
            "sensor_regime": regime,
            "modis_orbital_drift_factor": None,
            "ratio_used": used,
            "raw_counts": raw_counts,
        })

    annual = []
    for y in sorted({r["year"] for r in records}):
        rs = [r for r in records if r["year"] == y]
        hm = [r["harmonized_mean"] for r in rs if r["harmonized_mean"] is not None]
        mm = [r["modis_raw_rate"] for r in rs if r["modis_raw_rate"] is not None]
        vm = [r["viirs_raw_rate"] for r in rs if r["viirs_raw_rate"] is not None]
        totals = collections.Counter()
        for r in rs:
            for plat, c in r["raw_counts"].items():
                if c is not None:
                    totals[plat] += c["total"]
        annual.append({
            "year": y,
            "months": len(rs),
            "modis_raw_mean": round(float(np.mean(mm)), 4) if mm else None,
            "viirs_raw_mean": round(float(np.mean(vm)), 4) if vm else None,
            "harmonized_mean": round(float(np.mean(hm)), 4) if hm else None,
            "harmonized_peak_month": round(float(np.max(hm)), 4) if hm else None,
            "mean_coverage_fraction": None,
            "raw_counts": dict(totals),
        })

    markers = []
    for plat, label in (("Terra", "MODIS Terra rows begin"), ("Aqua", "MODIS Aqua joins"),
                        ("Suomi NPP", "VIIRS Suomi NPP 375 m begins"), ("NOAA-20", "VIIRS NOAA-20 joins")):
        if deliver.get(plat):
            markers.append({"year_month": min(deliver[plat]), "label": label, "source": "first month with rows in the FIRMS country file"})
    markers += [dict(m) for m in DRIFT_MARKERS if months[0] <= m["year_month"] <= months[-1]]
    markers.sort(key=lambda m: m["year_month"])

    full = [a for a in annual if a["months"] == 12 and a["harmonized_mean"] is not None]
    top = sorted(full, key=lambda a: a["harmonized_mean"], reverse=True)[:4]
    spec = PRESET_BY_ID[region_id]
    return {
        "schema_version": "1.0.0",
        "source": "firms",
        "model_version": METHOD_ID,
        "provenance": "Real NASA FIRMS standard processing rows (Country Yearly Summary files; MODIS version labels 6.2 "
                      "for 2000 to 2017, 6.03 for 2018 to 2022 and 61.03 for 2023 to 2025; VIIRS version 2), counted "
                      "inside the region's context box. Not simulated.",
        "downloaded_firms_rows": rows_read,
        "region_id": region_id,
        "region_name": spec.name,
        "bbox": list(box),
        "box_area_km2": round(area, 1),
        "reference_frame": "VIIRS_SNPP_375M_EQUIV",
        "units": {
            "modis_raw_rate": "hotspots_per_1000km2_day (Terra + Aqua)",
            "viirs_raw_rate": "hotspots_per_1000km2_day (Suomi NPP)",
            "harmonized_mean": "suomi_npp_equivalent_hotspots_per_1000km2_day",
        },
        "harmonization_method": {
            "id": METHOD_ID,
            "in_use": True,
            "description": "harmonized = MODIS rate x (Suomi NPP rows / MODIS rows over the overlap months); "
                           "p10 and p90 from the 10th and 90th percentile of the per-year ratios; months before Aqua "
                           "use a Terra-only ratio fitted the same way; overlap months in which Suomi NPP, Terra or "
                           "Aqua has an outage day are left out of the fit and the validation",
            "counted_rows": "every FIRMS row except type 2 (static land source), which is counted as static_excluded",
            "outage_rule": f"a day inside a platform's operating span on which it has no row in any cached country file "
                           f"while the other platforms together have at least {OUTAGE_MIN_OTHER_ROWS}",
            "overlap_months_excluded_for_outages": excluded,
            "ratio_terra_aqua": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in fit_both.items()},
            "ratio_terra_only": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in fit_terra.items()},
            "validation": validation,
            "replaced_only_by": "a method that beats it on held-out overlap years",
        },
        "summary_metrics": {
            "total_months": len(records),
            "years_span": [records[0]["year"], records[-1]["year"]],
            "first_month": months[0],
            "last_month": months[-1],
            "viirs_to_modis_overlap_ratio": round(fit_both["ratio"], 4) if fit_both["ratio"] else None,
            "viirs_to_modis_ratio_p10_p90": [round(fit_both["p10"], 4), round(fit_both["p90"], 4)] if fit_both["p10"] is not None else None,
            "held_out_median_abs_relative_error": validation["median_abs_relative_error_annual"],
            "held_out_median_abs_relative_error_without_harmonization": validation["median_abs_relative_error_without_harmonization"],
            "held_out_annual_interval_coverage": validation["annual_interval_coverage"],
            "held_out_monthly_interval_coverage": validation["monthly_interval_coverage"],
            "static_rows_excluded": static,
            "outage_days": {p: len(s) for p, s in sorted(gaps.items())},
            "extreme_fire_years_highlighted": [a["year"] for a in top],
            "coverage_note": "coverage_fraction is null: FIRMS rows are positive-only and no coverage product is fetched yet",
        },
        "regime_markers": markers,
        "annual_summary": annual,
        "records": records,
    }


CSV_COLUMNS: tuple[str, ...] = (
    "_acq_utc", "_platform", "_product", "latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument",
    "confidence", "version", "frp", "scan", "track", "daynight", "type", "brightness", "bright_t31", "bright_ti4",
    "bright_ti5",
)


def rows_csv(region_id: str, start: str, end: str, platforms: Iterable[str] | None = None,
             cache_dir: Path = FIRMS_CACHE_DIR, max_rows: int = CSV_MAX_ROWS) -> tuple[bytes, int]:
    """CSV of every FIRMS row behind a calendar selection (region, [start, end) UTC, platforms), all columns, with
    MODIS-only and VIIRS-only columns left empty where a platform has none. Returns (bytes, rows)."""
    if region_id not in REGION_COUNTRY:
        raise KeyError(f"no FIRMS rows for region '{region_id}'")
    rows = read_firms(region_box(region_id), start, end, platforms, cache_dir)
    if len(rows) > max_rows:
        raise ValueError(f"{len(rows)} rows in the selection, over the export limit of {max_rows}; narrow it")
    extra = sorted({k for r in rows for k in r} - set(CSV_COLUMNS))
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(CSV_COLUMNS) + extra, lineterminator="\n", restval="")
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue().encode("utf-8"), len(rows)
