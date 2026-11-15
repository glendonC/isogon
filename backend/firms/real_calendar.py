"""Real monthly fire calendar from cached FIRMS rows.

Counts per month and platform come from the region extracts (backend/firms/archive.py). Rows with FIRMS type 2
(static land source: plants, refineries) are left out of the rates and counted on their own; every other row
counts. Rates are hotspots per 1000 km2 of the region's context box per day.

Harmonization: the harmonized value of every month, its 80 percent interval and the held-out check come from
``backend.model.harmonize.record_series``, which serves the method named in ``backend/model/harmonize_fitted.py``
(``serve.rows``, chosen by a rule written before any table and decided on the whole fire cube; docs/harmonization.md),
so every month from 2000 on is estimated the same way and lands on the Suomi NPP scale. Months before Aqua delivers
use Terra alone, fitted the same way. The interval is the 10th to 90th percentile of held-out errors of predictions of
about the same size. The check leaves each overlap year out in turn, except a year in which the box meets a recorded
test fire's region (``closed_years_for_box``), and predicts that year's Suomi NPP counts from its MODIS counts; the
same check runs for no harmonization (MODIS as it is) so the gain is visible. The ratio of Suomi NPP rows to MODIS
rows over the overlap months is still reported (``ratio_terra_aqua``).

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
import sys
import threading
from typing import Any, Callable, Iterable

import numpy as np

from backend.firms.archive import (
    FIRMS_CACHE_DIR,
    PRODUCTS,
    REGION_COUNTRY,
    _platform,
    read_firms,
    region_box,
)

PLATFORMS: tuple[str, ...] = ("Terra", "Aqua", "Suomi NPP", "NOAA-20", "NOAA-21")
_NOTED: set[str] = set()


def _note(msg: str) -> None:
    """One stderr line per distinct note per process."""
    if msg not in _NOTED:
        _NOTED.add(msg)
        sys.stderr.write(f"[firms calendar] {msg}\n")
STATIC_TYPE: str = "2"
OFFSHORE_TYPE: str = "3"
COAST_M: float = 500.0  # a type 3 row this close to the sea (or on it) is left out; farther inland it counts
_SEA: dict[str, Any] = {}


def sea_lookup(region_id: str) -> Callable[[float, float], bool] | None:
    """lon, lat -> True where the region's context DEM is sea (exactly 0 m) or within about
    COAST_M of it, or None when the context terrain is not cached. Lakes keep their surface elevation, so
    they read as land; a fire beside a mountain lake is never near the sea."""
    if region_id in _SEA:
        return _SEA[region_id]
    fn = None
    try:
        from backend.terrain.live_region import PRESET_BY_ID
        from backend.terrain.terrain_pack import load_pack

        loaded = load_pack(PRESET_BY_ID[region_id])
        if loaded is not None and "context" in loaded[0]:
            meta, files = loaded
            c = meta["context"]
            n = int(c["dem"]["size"])
            dem = np.fromfile(files[c["dem"]["name"]], dtype="<f4").reshape(n, n)
            w, s_, e, nn = (float(v) for v in c["bbox"])
            # Sea grown by COAST_M (4-neighbour steps of the smaller post spacing), so coastal pixels count too.
            near = dem == 0.0
            steps = int(math.ceil(COAST_M / float(min(c["dem"]["post_spacing_m"]))))
            for _ in range(steps):
                g = near.copy()
                g[1:, :] |= near[:-1, :]
                g[:-1, :] |= near[1:, :]
                g[:, 1:] |= near[:, :-1]
                g[:, :-1] |= near[:, 1:]
                near = g

            def fn(lon: float, lat: float) -> bool:
                col = int(round((lon - w) / (e - w) * (n - 1)))
                row = int(round((nn - lat) / (nn - s_) * (n - 1)))
                return 0 <= row < n and 0 <= col < n and bool(near[row, col])
    except (KeyError, OSError, ValueError):
        fn = None
    _SEA[region_id] = fn
    return fn
EARTH_RADIUS_KM: float = 6371.0088
CSV_MAX_ROWS: int = 500_000
# Drift markers, each with its source (the mission pages docs/sources.md cites for the overpass times).
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
_CAL_CACHE_LOCK = threading.Lock()
_PLATFORM_DAYS_CACHE: collections.OrderedDict[str, tuple[tuple[Any, ...], dict[str, dict[str, int]]]] = collections.OrderedDict()
_EXTRACT_MONTHLY_CACHE: collections.OrderedDict[tuple[Any, ...], tuple[Any, dict[str, dict[str, dict[str, int]]], dict[str, int], dict[str, int], int]] = collections.OrderedDict()


def platform_days(cache_dir: Path = FIRMS_CACHE_DIR) -> dict[str, collections.Counter[str]]:
    """{platform: {date: rows}} summed over every cached country file. A platform's delivery is global, so a quiet
    month in one small country does not read as the platform being off."""
    manifests: list[tuple[str, Path]] = []
    sig_parts: list[tuple[Any, ...]] = []
    for p in PRODUCTS:
        base = cache_dir / "raw" / p
        for m in sorted(base.rglob("*.csv.manifest.json")) if base.is_dir() else []:
            try:
                st = m.stat()
            except OSError:
                continue
            manifests.append((p, m))
            sig_parts.append((p, str(m), st.st_ino, st.st_mtime_ns, st.st_size))
    sig = tuple(sig_parts)
    root_key = str(cache_dir.resolve())
    with _CAL_CACHE_LOCK:
        hit = _PLATFORM_DAYS_CACHE.get(root_key)
        if hit is not None and hit[0] == sig:
            _PLATFORM_DAYS_CACHE.move_to_end(root_key)
            return collections.defaultdict(
                collections.Counter,
                {k: collections.Counter(v) for k, v in hit[1].items()},
            )

    out: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    for p, m in manifests:
        d = json.loads(m.read_text(encoding="utf-8"))
        days = d.get("satellite_day_rows")
        if days is None:
            raise KeyError(f"{m.name} has no satellite_day_rows; run `archive.py reingest`")
        for sat, by_day in days.items():
            out[_platform(p, sat)].update(by_day)

    stored = {k: dict(v) for k, v in out.items()}
    with _CAL_CACHE_LOCK:
        _PLATFORM_DAYS_CACHE[root_key] = (sig, stored)
        _PLATFORM_DAYS_CACHE.move_to_end(root_key)
        while len(_PLATFORM_DAYS_CACHE) > 8:
            _PLATFORM_DAYS_CACHE.popitem(last=False)
    return out


def outage_days(days: dict[str, collections.Counter[str]], min_other: int = OUTAGE_MIN_OTHER_ROWS) -> dict[str, set[str]]:
    """Days inside a platform's operating span (first to last day with rows) on which it has no row in any cached
    country file while the other platforms together have at least ``min_other``: the platform delivered no data."""
    totals: collections.Counter[str] = collections.Counter()
    for c in days.values():
        totals.update(c)
    all_days = sorted(totals) if days else []
    out: dict[str, set[str]] = {}
    for p, c in days.items():
        active = sorted(d for d, n in c.items() if n > 0)
        if not active:
            out[p] = set()
            continue
        first, last = active[0], active[-1]
        out[p] = {
            d for d in all_days
            if first <= d <= last and c.get(d, 0) == 0 and totals[d] - c.get(d, 0) >= min_other
        }
    return out


def noaa21_months(region_id: str, cache_dir: Path = FIRMS_CACHE_DIR) -> set[str]:
    """Months the NOAA-21 area API extracts of a region cover (empty when none is cached)."""
    out: set[str] = set()
    base = cache_dir / "extract" / region_id
    for m in sorted(base.glob("viirs-noaa21_*.csv.manifest.json")) if base.is_dir() else []:
        try:
            d = json.loads(m.read_text(encoding="utf-8"))
            first, last = d["covered_days"]
        except (OSError, ValueError, KeyError, TypeError):
            continue
        out.update(_months(first[:7], last[:7]))
    return out


def _extract_file_monthly(
    path: Path, product: str, is_sea: Callable[[float, float], bool] | None
) -> tuple[dict[str, dict[str, dict[str, int]]], dict[str, int], dict[str, int], int]:
    st = path.stat()
    key = (str(path), st.st_ino, st.st_mtime_ns, st.st_size, id(is_sea))
    with _CAL_CACHE_LOCK:
        hit = _EXTRACT_MONTHLY_CACHE.get(key)
        if hit is not None and hit[0] is is_sea:
            _EXTRACT_MONTHLY_CACHE.move_to_end(key)
            return hit[1], hit[2], hit[3], hit[4]

    f_counts: dict[str, dict[str, dict[str, int]]] = {}
    f_static: collections.Counter[str] = collections.Counter()
    f_offshore: collections.Counter[str] = collections.Counter()
    f_n = 0
    plat_map: dict[str, str] = {}
    with path.open(encoding="utf-8", newline="") as fh:
        r = csv.reader(fh)
        col = {c: i for i, c in enumerate(next(r))}
        i_d, i_s, i_dn = col["acq_date"], col["satellite"], col["daynight"]
        i_t = col.get("type")
        i_lat, i_lon = col["latitude"], col["longitude"]
        for rec in r:
            f_n += 1
            sat = rec[i_s]
            plat = plat_map.get(sat)
            if plat is None:
                plat = _platform(product, sat)
                plat_map[sat] = plat
            ym = rec[i_d][:7]
            by_plat = f_counts.get(ym)
            if by_plat is None:
                by_plat = {}
                f_counts[ym] = by_plat
            cell = by_plat.get(plat)
            if cell is None:
                cell = {"day": 0, "night": 0, "static": 0, "offshore": 0}
                by_plat[plat] = cell
            if i_t is not None and rec[i_t] == STATIC_TYPE:
                cell["static"] += 1
                f_static[plat] += 1
            elif (i_t is not None and rec[i_t] == OFFSHORE_TYPE and is_sea is not None
                  and is_sea(float(rec[i_lon]), float(rec[i_lat]))):
                cell["offshore"] += 1
                f_offshore[plat] += 1
            elif rec[i_dn] == "D":
                cell["day"] += 1
            else:
                cell["night"] += 1

    res = (is_sea, f_counts, dict(f_static), dict(f_offshore), f_n)
    with _CAL_CACHE_LOCK:
        _EXTRACT_MONTHLY_CACHE[key] = res
        _EXTRACT_MONTHLY_CACHE.move_to_end(key)
        while len(_EXTRACT_MONTHLY_CACHE) > 512:
            _EXTRACT_MONTHLY_CACHE.popitem(last=False)
    return res[1], res[2], res[3], res[4]


def monthly_counts(
    region_id: str, cache_dir: Path = FIRMS_CACHE_DIR, ignored: list[str] | None = None
) -> tuple[dict[str, dict[str, dict[str, int]]], dict[str, int], int]:
    """({month: {platform: {"day", "night", "static", "offshore"}}}, left-out rows per platform and kind, rows read).

    Left out: type 2 (static land source) and type 3 (offshore) rows on sea or within COAST_M of it in the region's
    context DEM. Type 3 rows farther inland count as fire (in Plumas they are fire beside mountain lakes; in Evia
    the coastal ones are fixed industrial points). Without a cached context DEM
    type 3 rows count. An extract whose product or year this code does not know is skipped with a logged note (and
    listed in ``ignored``) instead of failing, so a cache that runs ahead of the code still answers."""
    counts: dict[str, dict[str, dict[str, int]]] = collections.defaultdict(
        lambda: collections.defaultdict(lambda: {"day": 0, "night": 0, "static": 0, "offshore": 0}))
    static = collections.Counter()
    offshore = collections.Counter()
    is_sea = sea_lookup(region_id)
    n = 0
    base = cache_dir / "extract" / region_id
    for path in sorted(base.glob("*.csv")) if base.is_dir() else []:
        product, _, year = path.stem.rpartition("_")
        if product not in PRODUCTS or not year.isdigit():
            _note(f"skipped {region_id}/{path.name}: product or year not known to this code")
            if ignored is not None:
                ignored.append(f"{region_id}/{path.name}")
            continue
        f_counts, f_static, f_offshore, f_n = _extract_file_monthly(path, product, is_sea)
        n += f_n
        static.update(f_static)
        offshore.update(f_offshore)
        for ym, by_plat in f_counts.items():
            dst_plat = counts[ym]
            for plat, cell in by_plat.items():
                dst = dst_plat[plat]
                dst["day"] += cell["day"]
                dst["night"] += cell["night"]
                dst["static"] += cell["static"]
                dst["offshore"] += cell["offshore"]
    return counts, {"static": dict(static), "offshore_on_sea": dict(offshore), "sea_check": is_sea is not None}, n


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
    """The /api/calendar payload for ``source=firms`` and a region."""
    from backend.terrain.live_region import PRESET_BY_ID

    if region_id not in REGION_COUNTRY:
        raise KeyError(f"no FIRMS rows for region '{region_id}'; regions with rows: {sorted(REGION_COUNTRY)}")
    box = region_box(region_id)
    if not (cache_dir / "extract" / region_id).is_dir():
        raise KeyError(f"no FIRMS rows cached for '{region_id}'")
    days = platform_days(cache_dir)
    deliver = {p: {d[:7] for d, n in c.items() if n > 0} for p, c in days.items()}
    if not any(deliver.values()):
        raise KeyError(f"no FIRMS rows cached for '{region_id}'")
    # NOAA-21 is not in the country files: its delivery comes from the days its area API extracts cover. Its rows
    # are box rows only, so no outage day can be found for it (outage_days is null).
    noaa21 = noaa21_months(region_id, cache_dir)
    if noaa21:
        deliver["NOAA-21"] = noaa21
    ignored: list[str] = []
    counts, left_out, rows_read = monthly_counts(region_id, cache_dir, ignored)
    spec = PRESET_BY_ID[region_id]
    counted_rows = ("every FIRMS row except type 2 (static land source, counted as static_excluded) and type 3 "
                    "(offshore) rows on sea or within 500 m of it in the region's context DEM (counted as "
                    "offshore_on_sea_excluded); type 3 rows farther inland, such as fire beside mountain "
                    "lakes, count"
                    if left_out["sea_check"] else
                    "every FIRMS row except type 2 (static land source, counted as static_excluded); no context "
                    "DEM in the cache, so type 3 (offshore) rows count")
    out = _calendar_payload(
        counts, rows_read, box, deliver, outage_days(days),
        head={"region_id": region_id, "region_name": spec.name},
        provenance_where="inside the region's context box",
        counted_rows=counted_rows,
        excluded={"static": "static_excluded", "offshore": "offshore_on_sea_excluded"},
        left_out_metrics={"static_rows_excluded": left_out["static"],
                          "offshore_rows_on_sea_excluded": left_out["offshore_on_sea"]},
        noaa21_note="counted from 2023-03 in raw_counts, from area API rows of the region box (no outage check "
                    "possible); not in the fit, for the same reason",
        not_in_calendar="2026: its rows come from the area API for the region box only (no country-wide count "
                        "to tell an outage from a quiet day), and its near real time rows have no type column, "
                        "so static sources cannot be left out; the calendar ends at the last country file "
                        "month instead",
        ignored=ignored,
    )
    out["place"] = {"kind": "region", "region_id": region_id, "name": spec.name, "box": list(box),
                    "countries": [REGION_COUNTRY[region_id].replace("_", " ")]}
    out["current_month"] = {"route": f"/api/calendar/current?source=firms&region_id={region_id}"}
    return out


BOX_MAX_SPAN_DEG: float = 20.0
BOX_MIN_SPAN_DEG: float = 0.05


def parse_box(text: str) -> tuple[float, float, float, float]:
    """'w,s,e,n' in degrees -> a checked box (ValueError when it is not one)."""
    try:
        parts = [float(v) for v in str(text).split(",")]
    except ValueError as exc:
        raise ValueError("box must be four numbers: west,south,east,north in degrees") from exc
    if len(parts) != 4 or not all(math.isfinite(v) for v in parts):
        raise ValueError("box must be four finite numbers: west,south,east,north in degrees")
    w, s, e, n = parts
    if not (-180.0 <= w < e <= 180.0 and -90.0 <= s < n <= 90.0):
        raise ValueError("box must have west < east inside -180 to 180 and south < north inside -90 to 90")
    if e - w > BOX_MAX_SPAN_DEG or n - s > BOX_MAX_SPAN_DEG:
        raise ValueError(f"box spans at most {BOX_MAX_SPAN_DEG:g} degrees each way")
    if e - w < BOX_MIN_SPAN_DEG or n - s < BOX_MIN_SPAN_DEG:
        raise ValueError(f"box spans at least {BOX_MIN_SPAN_DEG:g} degrees each way")
    return (round(w, 4), round(s, 4), round(e, 4), round(n, 4))


def box_text(box: tuple[float, float, float, float] | list[float]) -> str:
    """'w,s,e,n' with up to four decimals, as `parse_box` reads it back."""
    return ",".join(f"{float(v):.4f}".rstrip("0").rstrip(".") for v in box)


def box_label(box: tuple[float, float, float, float]) -> str:
    w, s, e, n = box

    def lat(v: float) -> str:
        return f"{abs(v):.2f} {'N' if v >= 0 else 'S'}"

    def lon(v: float) -> str:
        return f"{abs(v):.2f} {'E' if v >= 0 else 'W'}"

    return f"{lat(s)} to {lat(n)}, {lon(w)} to {lon(e)}"


def box_calendar(box: tuple[float, float, float, float], index: Any = None, cache_dir: Path = FIRMS_CACHE_DIR) -> dict[str, Any]:
    """The /api/calendar payload for ``source=firms`` and any box, counted from the cached country files
    (`backend/firms/box_index.py`). KeyError when no cached country file has a row in the box."""
    from backend.firms.box_index import BoxIndex

    index = index or BoxIndex(cache_dir)
    counts, left_out, rows_read, countries = index.monthly_counts(box)
    if not rows_read:
        raise KeyError(f"no cached FIRMS country file has a row in the box {list(box)}; cached countries: "
                       f"{', '.join(index.countries()) or 'none'}")
    days = platform_days(cache_dir)
    deliver = {p: {d[:7] for d, n in c.items() if n > 0} for p, c in days.items()}
    label = box_label(box)
    out = _calendar_payload(
        counts, rows_read, box, deliver, outage_days(days),
        head={"region_id": None, "region_name": label},
        provenance_where=f"inside the box, from the country files of {', '.join(countries)}",
        counted_rows=("every FIRMS row except type 1 (active volcano, counted as volcano_excluded), type 2 (static "
                      "land source, counted as static_excluded) and type 3 (offshore, counted as offshore_excluded); "
                      "a box has no elevation model to tell an inland type 3 row from one at sea, so all type 3 "
                      "rows are left out"),
        excluded={"static": "static_excluded", "offshore": "offshore_excluded", "volcano": "volcano_excluded"},
        left_out_metrics={"static_rows_excluded": left_out["static"], "offshore_rows_excluded": left_out["offshore"],
                          "volcano_rows_excluded": left_out["volcano"]},
        noaa21_note="not in the country files; a box calendar has no NOAA-21 rows",
        not_in_calendar="the months after the last country file month: their rows come from the area API (near real "
                        "time, no type column); this month so far is served by GET /api/calendar/current",
        ignored=[],
    )
    out["place"] = {"kind": "box", "box": list(box), "countries": countries, "label": label}
    out["current_month"] = {"route": "/api/calendar/current?source=firms&box=" + box_text(box)}
    return out


def _calendar_payload(
    counts: dict[str, dict[str, dict[str, int]]],
    rows_read: int,
    box: tuple[float, float, float, float],
    deliver: dict[str, set[str]],
    gaps: dict[str, set[str]],
    head: dict[str, Any],
    provenance_where: str,
    counted_rows: str,
    excluded: dict[str, str],
    left_out_metrics: dict[str, Any],
    noaa21_note: str,
    not_in_calendar: str,
    ignored: list[str],
) -> dict[str, Any]:
    """The calendar from monthly counts: records, the harmonization and its held-out check, the annual summary, the
    month medians. ``excluded`` maps each left-out kind of the counts to its raw_counts label."""
    area = box_area_km2(box)
    gap_months: dict[str, collections.Counter[str]] = {p: collections.Counter(d[:7] for d in s) for p, s in gaps.items()}
    # The calendar spans the country file months; NOAA-21 (area API rows) is counted inside that span only.
    all_months = sorted(set().union(*(v for k, v in deliver.items() if k != "NOAA-21")))
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
    excluded_months = [mo for mo in months if on("Suomi NPP", mo) and on("Terra", mo) and on("Aqua", mo)
                       and not clean(mo, "Suomi NPP", "Terra", "Aqua")]
    fit_both, fit_terra = fit_ratio(both), fit_ratio(terra)
    validation = leave_one_year_out(both)
    empty = {"day": 0, "night": 0, **{k: 0 for k in excluded}}

    def rate(n: float, mo: str) -> float:
        days = _cal.monthrange(int(mo[:4]), int(mo[5:7]))[1]
        return n / (area / 1000.0) / days

    records = []
    for i, mo in enumerate(months):
        t_on, a_on, s_on, n_on = on("Terra", mo), on("Aqua", mo), on("Suomi NPP", mo), on("NOAA-20", mo)
        raw_counts = {}
        for plat, ok in (("Terra", t_on), ("Aqua", a_on), ("Suomi NPP", s_on), ("NOAA-20", n_on),
                         ("NOAA-21", on("NOAA-21", mo))):
            c = counts.get(mo, {}).get(plat, empty)
            gap = None if plat == "NOAA-21" else gap_months.get(plat, {}).get(mo, 0)
            raw_counts[plat] = ({"day": c["day"], "night": c["night"], "total": c["day"] + c["night"],
                                 **{label: c.get(kind, 0) for kind, label in excluded.items()},
                                 "outage_days": gap}
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

    # The harmonized value and its 80 percent interval come from backend/model/harmonize.py: the method chosen by the
    # rule written before any table, and an interval from held-out errors (docs/harmonization.md).
    from backend.model.harmonize import closed_years_for_box, record_series, surround_from_cube

    harm = record_series(records, area, center_lat=(box[1] + box[3]) / 2.0, closed_years=closed_years_for_box(box),
                         surround=surround_from_cube(tuple(box)))
    for rec, m in zip(records, harm["months"]):
        rec["harmonized_mean"], rec["harmonized_p10"], rec["harmonized_p90"] = m["harmonized_rate"], m["p10_rate"], m["p90_rate"]
    validation = harm["check"]
    # The one ratio the Record speaks is the served method's over its own fit months (from February 2012); the ratio of
    # sums above (ratio_terra_aqua) also holds January 2012, when Suomi NPP rows begin on the 20th.
    served_ratio = (harm["method"].get("fitted_on") or {}).get("ratio_over_the_overlap")
    overlap_ratio = (round(float(served_ratio), 4) if served_ratio is not None
                     else (round(fit_both["ratio"], 4) if fit_both["ratio"] else None))

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
    climatology = month_climatology(records)
    by_month = {c["month"]: c for c in climatology}
    same_month: dict[int, list[float]] = collections.defaultdict(list)
    for r in records:
        if r["harmonized_mean"] is not None:
            same_month[r["month"]].append(r["harmonized_mean"])
    for r in records:
        med = by_month.get(r["month"], {}).get("median")
        h = r["harmonized_mean"]
        r["month_median"] = med
        r["anomaly"] = round(h - med, 4) if (h is not None and med is not None) else None
        r["anomaly_ratio"] = round(h / med, 4) if (h is not None and med) else None
        # 1 is the most burning of this calendar month over the years; ties share the better rank
        r["month_rank"] = (1 + sum(1 for v in same_month[r["month"]] if v > h)) if h is not None else None
        r["month_years"] = len(same_month[r["month"]])
    return {
        "schema_version": "1.0.0",
        "source": "firms",
        "model_version": harm["method"]["id"],
        "provenance": "Real NASA FIRMS standard processing rows (Country Yearly Summary files; MODIS version labels 6.2 "
                      "for 2000 to 2017, 6.03 for 2018 to 2022 and 61.03 for 2023 to 2025; VIIRS version 2), counted "
                      f"{provenance_where}. Not simulated.",
        "downloaded_firms_rows": rows_read,
        **head,
        "bbox": list(box),
        "box_area_km2": round(area, 1),
        "reference_frame": "VIIRS_SNPP_375M_EQUIV",
        "units": {
            "modis_raw_rate": "hotspots_per_1000km2_day (Terra + Aqua)",
            "viirs_raw_rate": "hotspots_per_1000km2_day (Suomi NPP)",
            "harmonized_mean": "suomi_npp_equivalent_hotspots_per_1000km2_day",
        },
        "harmonization_method": {
            "id": harm["method"]["id"],
            "in_use": True,
            "description": harm["method"]["what"],
            "interval": harm["method"]["interval"],
            "fitted_on": harm["method"]["fitted_on"],
            "counted_rows": counted_rows,
            "outage_rule": f"a day inside a platform's operating span on which it has no row in any cached country file "
                           f"while the other platforms together have at least {OUTAGE_MIN_OTHER_ROWS}",
            "overlap_months_excluded_for_outages": excluded_months,
            "platforms_in_fit": ["Suomi NPP", "Terra", "Aqua"],
            "platforms_counted_not_fitted": {
                "NOAA-20": "counted from 2018-04 in raw_counts; the fit stays Suomi NPP over MODIS, one platform pair "
                           "through the whole 2012 to 2025 overlap",
                "NOAA-21": noaa21_note,
            },
            "not_in_calendar": not_in_calendar,
            "fit_rows": {"modis": fit_both["modis_rows"], "viirs": fit_both["viirs_rows"]},
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
            "viirs_to_modis_overlap_ratio": overlap_ratio,
            "viirs_to_modis_ratio_p10_p90": [round(fit_both["p10"], 4), round(fit_both["p90"], 4)] if fit_both["p10"] is not None else None,
            "held_out_median_abs_relative_error": validation["median_abs_relative_error_annual"],
            "held_out_median_abs_relative_error_without_harmonization": validation["median_abs_relative_error_without_harmonization"],
            "held_out_annual_interval_coverage": validation["annual_interval_coverage"],
            "held_out_monthly_interval_coverage": validation["monthly_interval_coverage"],
            **left_out_metrics,
            "ignored_extracts": ignored,
            "outage_days": {p: len(s) for p, s in sorted(gaps.items())},
            "extreme_fire_years_highlighted": [a["year"] for a in top],
            "coverage_note": "coverage_fraction is null: FIRMS rows are positive-only and no coverage product is fetched yet",
        },
        "month_climatology": climatology,
        "regime_markers": markers,
        "annual_summary": annual,
        "records": records,
    }


RECORD_CHECK_WHAT: str = (
    "the Record's held-out check of every place side by side, each read from that place's own calendar "
    "(harmonization_method.validation): for each overlap year but a closed one, the served method is fitted on the "
    "other years and that year's Suomi NPP count is predicted from its MODIS count"
)


def record_check(cal: dict[str, Any]) -> dict[str, Any]:
    """The figures of a calendar's held-out check, for the answer that lists every place: the method and its
    interval, the ratio over the overlap the Record speaks and the spread of its per-year ratios, the median yearly
    error with and without the correction, how often the stated interval held, and the rows the served method was
    fitted on. Every value is copied from the calendar; nothing is fitted here."""
    h = cal["harmonization_method"]
    fit, v = h["ratio_terra_aqua"], h["validation"]
    busy = f"monthly_interval_coverage_modis_rows_ge_{BUSY_MONTH_MODIS_ROWS}"
    fitted_on = h.get("fitted_on") or {}
    served = fitted_on.get("ratio_over_the_overlap")
    fit_rows = ({"modis": int(fitted_on["modis_rows"]), "viirs": int(fitted_on["suomi_npp_rows"])}
                if served is not None and "modis_rows" in fitted_on and "suomi_npp_rows" in fitted_on else h["fit_rows"])
    return {
        "method": h["id"],
        "interval": (h.get("interval") or {}).get("id"),
        "ratio": round(float(served), 4) if served is not None else fit.get("ratio"),
        "ratio_p10_p90": [fit.get("p10"), fit.get("p90")],
        "overlap_years": fit.get("years"),
        "years_held_out": len(v["held_out_years"]),
        "median_abs_relative_error_annual": v["median_abs_relative_error_annual"],
        "median_abs_relative_error_without_harmonization": v["median_abs_relative_error_without_harmonization"],
        "annual_interval_coverage": v["annual_interval_coverage"],
        "monthly_interval_coverage": v["monthly_interval_coverage"],
        "months_tested": v["months_tested"],
        busy: v.get(busy),
        f"months_tested_modis_rows_ge_{BUSY_MONTH_MODIS_ROWS}": v.get(f"months_tested_modis_rows_ge_{BUSY_MONTH_MODIS_ROWS}"),
        "fit_rows": fit_rows,
        "overlap_months_excluded_for_outages": len(h["overlap_months_excluded_for_outages"]),
        "counted_rows": h["counted_rows"],
    }


def month_climatology(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per calendar month: the median, 10th and 90th percentile of ``harmonized_mean`` over every year in which that
    month is harmonized."""
    out = []
    for m in range(1, 13):
        vals = [(r["year"], r["harmonized_mean"]) for r in records if r["month"] == m and r["harmonized_mean"] is not None]
        if not vals:
            out.append({"month": m, "median": None, "p10": None, "p90": None, "years": 0, "first_year": None, "last_year": None})
            continue
        v = np.array([x for _, x in vals], dtype=np.float64)
        out.append({"month": m, "median": round(float(np.median(v)), 4), "p10": round(float(np.percentile(v, 10)), 4),
                    "p90": round(float(np.percentile(v, 90)), 4), "years": len(vals),
                    "first_year": min(y for y, _ in vals), "last_year": max(y for y, _ in vals)})
    return out


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


BOX_CSV_MAX_DAYS: int = 400


def rows_csv_box(box: tuple[float, float, float, float], start: str, end: str, platforms: Iterable[str] | None = None,
                 index: Any = None, cache_dir: Path = FIRMS_CACHE_DIR, max_rows: int = CSV_MAX_ROWS) -> tuple[bytes, int]:
    """CSV of every row of the cached country files inside ``box`` in [start, end) UTC, all columns, in the layout of
    ``rows_csv``. The span is at most BOX_CSV_MAX_DAYS: a country file is read in full for each year asked."""
    from backend.firms.archive import _as_utc, _norm_time
    from backend.firms.box_index import BoxIndex, country_of, raw_files

    import datetime as _dt

    t0, t1 = _as_utc(start), _as_utc(end)
    if (t1 - t0).days > BOX_CSV_MAX_DAYS:
        raise ValueError(f"a box export spans at most {BOX_CSV_MAX_DAYS} days")
    index = index or BoxIndex(cache_dir)
    countries = {c.replace(" ", "_") for c, e in index.countries().items()
                 if not (e[0] > box[2] or e[2] < box[0] or e[1] > box[3] or e[3] < box[1])}
    if not countries:
        raise KeyError(f"no cached FIRMS country file has a row in the box {list(box)}")
    want = set(platforms) if platforms is not None else None
    years = set(range(t0.year, (t1 - _dt.timedelta(microseconds=1)).year + 1))
    w, s, e, n = box
    rows: list[dict[str, str]] = []
    for raw in raw_files(cache_dir):
        product, year = raw.parent.parent.name, int(raw.parent.name)
        if year not in years or country_of(raw) not in countries:
            continue
        with raw.open(encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                lat, lon = float(row["latitude"]), float(row["longitude"])
                if not (w <= lon <= e and s <= lat <= n):
                    continue
                hhmm = _norm_time(row["acq_time"])
                ts = _dt.datetime.fromisoformat(f"{row['acq_date']}T{hhmm[:2]}:{hhmm[2:]}:00+00:00")
                if not (t0 <= ts < t1):
                    continue
                plat = _platform(product, row["satellite"])
                if want is not None and plat not in want:
                    continue
                row["_platform"], row["_product"], row["_acq_utc"] = plat, product, ts.strftime("%Y-%m-%dT%H:%M:%SZ")
                rows.append(row)
                if len(rows) > max_rows:
                    raise ValueError(f"over {max_rows} rows in the selection, the export limit; narrow it")
    rows.sort(key=lambda d: (d["_acq_utc"], d["_platform"], d["latitude"], d["longitude"]))
    extra = sorted({k for r in rows for k in r} - set(CSV_COLUMNS))
    buf = io.StringIO()
    wr = csv.DictWriter(buf, fieldnames=list(CSV_COLUMNS) + extra, lineterminator="\n", restval="")
    wr.writeheader()
    wr.writerows(rows)
    return buf.getvalue().encode("utf-8"), len(rows)
