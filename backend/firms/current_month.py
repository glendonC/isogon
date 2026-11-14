"""This month so far against the same month's median, for a region or any box.

The country files end before this month, so its rows come from the FIRMS area API (near real time), fetched for the
box over every full UTC day of the month so far and cached like the region fetches of `area_api.py`:

  area_box/<place>/<SOURCE>/<YYYY-MM-DD>_<n>d.csv   one request's CSV exactly as returned, with a manifest beside it

A chunk is fetched once; the next day adds a chunk for the new days. The key (FIRMS_MAP_KEY) goes into request URLs
only; every stored URL carries <MAP_KEY> instead. The harmonized value is this month's MODIS rate times the
calendar's Terra and Aqua ratio, so it lands on the calendar's scale, and it is read beside that calendar month's
median over the years of the country files.
"""

from __future__ import annotations

import calendar as _cal
import csv
import datetime as _dt
import hashlib
import io
from pathlib import Path
import threading
from typing import Any, Callable

from backend.firms.archive import (
    FIRMS_CACHE_DIR,
    Opener,
    _default_opener,
    _now_utc,
    _write_atomic,
    _write_manifest,
    read_manifest,
    redact_key,
)

# The near real time sources asked for. MODIS carries the harmonization; the VIIRS rows are shown as they are.
SOURCES: tuple[tuple[str, str], ...] = (
    ("MODIS", "MODIS_NRT"), ("VIIRS_NOAA20", "VIIRS_NOAA20_NRT"), ("VIIRS_NOAA21", "VIIRS_NOAA21_NRT"),
    ("VIIRS_SNPP", "VIIRS_SNPP_NRT"),
)
MAX_SPAN_DEG: float = 5.0          # the area API charges by area: a larger box is not fetched
MAX_SHARE_OF_LIMIT: float = 0.6    # no fetch while the key has used more than this share of its window
VIIRS_PLATFORM: dict[str, str] = {"VIIRS_NOAA20": "NOAA-20", "VIIRS_NOAA21": "NOAA-21", "VIIRS_SNPP": "Suomi NPP"}
MODIS_SATELLITE: dict[str, str] = {"T": "Terra", "A": "Aqua", "Terra": "Terra", "Aqua": "Aqua"}
ONE_PLATFORM_MIN_ROWS: int = 20    # a MODIS platform with none while the other has this many reads as not delivering
CAVEATS: tuple[str, ...] = (
    "part of a month: the full UTC days so far, today left out while its rows still arrive; fire changes within a "
    "month, so a rate over the first days can differ from the month's",
    "near real time rows (FIRMS area API), not the standard processing rows of the calendar; NASA replaces them "
    "with standard processing later",
    "near real time rows have no type column, so static land sources, volcanoes and offshore rows are counted; the "
    "calendar leaves them out",
    "Suomi NPP stopped delivering science data on 2 November 2026 (data/datasets.json), so the harmonization rests "
    "on the MODIS rows",
)


def _place_dir(box: tuple[float, float, float, float]) -> str:
    return "box_" + "_".join(f"{v:.4f}" for v in box).replace("-", "m").replace(".", "p")


def chunk_path(place: str, source: str, day: _dt.date, n: int, cache_dir: Path = FIRMS_CACHE_DIR) -> Path:
    return cache_dir / "area_box" / place / source / f"{day.isoformat()}_{n}d.csv"


def month_days(today: _dt.date) -> tuple[_dt.date, _dt.date] | None:
    """(first, last) full UTC day of today's month so far; None on the first of a month."""
    first = today.replace(day=1)
    last = today - _dt.timedelta(days=1)
    return (first, last) if last >= first else None


def plan(first: _dt.date, last: _dt.date, max_days: int = 5) -> list[tuple[_dt.date, int]]:
    """(first day, days) chunks of at most ``max_days`` covering [first, last]."""
    out, day = [], first
    while day <= last:
        n = min(max_days, (last - day).days + 1)
        out.append((day, n))
        day += _dt.timedelta(days=n)
    return out


def _rows_of(body: bytes, box: tuple[float, float, float, float], first: _dt.date, last: _dt.date) -> list[dict[str, str]]:
    w, s, e, n = box
    text = body.decode("utf-8")
    if not text.startswith("latitude"):
        return []
    out = []
    for r in csv.DictReader(io.StringIO(text)):
        try:
            lat, lon, d = float(r["latitude"]), float(r["longitude"]), _dt.date.fromisoformat(r["acq_date"][:10])
        except (KeyError, ValueError):
            continue
        if w <= lon <= e and s <= lat <= n and first <= d <= last:
            out.append(r)
    return out


class CurrentMonth:
    """Fetches and caches the area API rows of a place's month so far, and reads them against its calendar."""

    def __init__(self, cache_dir: Path = FIRMS_CACHE_DIR, opener: Opener = _default_opener,
                 key_reader: Callable[[], str] | None = None, clock: Callable[[], _dt.date] | None = None) -> None:
        from backend.firms.archive import _map_key

        self.cache_dir = cache_dir
        self.opener = opener
        self.key_reader = key_reader or _map_key
        self.clock = clock or (lambda: _dt.datetime.now(_dt.timezone.utc).date())
        self._lock = threading.Lock()

    def _fetch(self, key: str, place: str, source: str, box: tuple[float, float, float, float], day: _dt.date,
               n: int) -> tuple[bytes, dict[str, Any]]:
        from backend.firms.area_api import API_BASE, _get

        dest = chunk_path(place, source, day, n, self.cache_dir)
        man = read_manifest(dest)
        if man is not None and dest.is_file():
            return dest.read_bytes(), man
        w, s, e, nn = box
        url = f"{API_BASE}/api/area/csv/{key}/{source}/{w},{s},{e},{nn}/{n}/{day.isoformat()}"
        body = _get(url, key, self.opener)
        text = body.decode("utf-8")
        if not text.startswith("latitude"):
            raise RuntimeError(f"{source} {day}: unexpected reply: {redact_key(text[:120], key)}")
        _write_atomic(dest, body)
        man = {
            "source_url": redact_key(url, key),
            "query": {"kind": "area_api", "source": source, "box_wsen": [w, s, e, nn], "first_day": day.isoformat(), "days": n},
            "retrieved_utc": _now_utc(),
            "bytes": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
            "rows": max(0, text.count("\n") - 1),
            "columns": text.split("\n", 1)[0].strip().split(","),
            "key_used": True,
        }
        _write_manifest(dest, man)
        return body, man

    def read(self, place: dict[str, Any], calendar: dict[str, Any]) -> dict[str, Any]:
        """The current month block for a place (``place`` as the calendar gives it) and its calendar payload."""
        box = tuple(float(v) for v in calendar["bbox"])
        today = self.clock()
        out: dict[str, Any] = {"place": place, "month": today.strftime("%Y-%m"), "caveats": list(CAVEATS)}
        days = month_days(today)
        if days is None:
            return {**out, "status": "no full day yet", "error": "today is the first day of the month (UTC)"}
        first, last = days
        out["days"] = {"first": first.isoformat(), "last": last.isoformat(), "counted": (last - first).days + 1,
                       "in_month": _cal.monthrange(first.year, first.month)[1]}
        if box[2] - box[0] > MAX_SPAN_DEG or box[3] - box[1] > MAX_SPAN_DEG:
            return {**out, "status": "box too large",
                    "error": f"the area API charges by area; this month is fetched for boxes up to {MAX_SPAN_DEG:g} degrees each way"}
        key = self.key_reader()
        if not key:
            return {**out, "status": "no key", "error": "FIRMS_MAP_KEY is not set, so this month's rows cannot be fetched"}
        place_dir = _place_dir(box)
        rows: dict[str, list[dict[str, str]]] = {}
        requests: list[str] = []
        retrieved: list[str] = []
        with self._lock:
            try:
                from backend.firms.area_api import key_status

                st = key_status(key, self.opener)
                cur, lim = int(st.get("current_transactions", 0)), int(st.get("transaction_limit", 5000))
                if cur > MAX_SHARE_OF_LIMIT * lim:
                    return {**out, "status": "busy", "error": "the key has used most of its transactions in the current "
                                                              "window; read this again in ten minutes"}
                for platform, source in SOURCES:
                    got: list[dict[str, str]] = []
                    for day, n in plan(first, last):
                        body, man = self._fetch(key, place_dir, source, box, day, n)
                        requests.append(man["source_url"])
                        retrieved.append(man["retrieved_utc"])
                        got += _rows_of(body, box, first, last)
                    rows[platform] = got
            except Exception as exc:  # noqa: BLE001  (the calendar stands without this block)
                return {**out, "status": "failed", "error": redact_key(str(exc), key)}
        area = float(calendar["box_area_km2"])
        n_days = out["days"]["counted"]
        modis = rows.get("MODIS", [])
        by_sat: dict[str, int] = {"Terra": 0, "Aqua": 0}
        for r in modis:
            sat = MODIS_SATELLITE.get(r.get("satellite", ""), r.get("satellite", ""))
            by_sat[sat] = by_sat.get(sat, 0) + 1
        rate = len(modis) / (area / 1000.0) / n_days
        hm = calendar.get("harmonization_method", {})
        ratio = (hm.get("ratio_terra_aqua") or {})
        clim = {c["month"]: c for c in calendar.get("month_climatology", [])}.get(first.month, {})
        one_missing = [p for p in ("Terra", "Aqua") if by_sat.get(p, 0) == 0 and max(by_sat.values()) >= ONE_PLATFORM_MIN_ROWS]
        out["status"] = "ready"
        out["modis"] = {"rows": len(modis), "by_platform": by_sat, "rate": round(rate, 4)}
        out["viirs_rows"] = {VIIRS_PLATFORM[p]: len(rows.get(p, [])) for p in VIIRS_PLATFORM}
        if one_missing or ratio.get("ratio") is None:
            out.update({"harmonized_mean": None, "harmonized_p10": None, "harmonized_p90": None})
            if one_missing:
                out["caveats"].append(f"no {' or '.join(one_missing)} row in the box while the other MODIS platform has "
                                      f"{max(by_sat.values())}; the Terra and Aqua ratio would not apply, so nothing is harmonized")
        else:
            out.update({"harmonized_mean": round(rate * ratio["ratio"], 4),
                        "harmonized_p10": round(rate * ratio["p10"], 4), "harmonized_p90": round(rate * ratio["p90"], 4)})
        med = clim.get("median")
        out.update({"month_median": med, "month_p10": clim.get("p10"), "month_p90": clim.get("p90"),
                    "median_years": [clim.get("first_year"), clim.get("last_year")] if clim else None})
        h = out.get("harmonized_mean")
        out["anomaly"] = round(h - med, 4) if (h is not None and med is not None) else None
        out["anomaly_ratio"] = round(h / med, 4) if (h is not None and med) else None
        out["units"] = calendar.get("units", {}).get("harmonized_mean")
        out["provenance"] = {
            "source": "NASA FIRMS area API, near real time: " + ", ".join(s for _, s in SOURCES),
            "requests": requests,
            "retrieved_utc": [min(retrieved), max(retrieved)] if retrieved else None,
            "cache": str((self.cache_dir / "area_box" / place_dir).relative_to(self.cache_dir.parents[2])),
            "ratio": "the calendar's ratio_terra_aqua (harmonization_method)",
            "median": "the calendar's month_climatology for this month",
        }
        return out

