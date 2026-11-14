"""FIRMS area API fetch for what the country files lack: NOAA-21, and rows after the last country file year.

Follows docs/data.md: at most five days per request, chunked, cached, one request at a time with a pause.
The data availability endpoint is read first to choose standard processing (SP) where it covers a date and near real
time (NRT) after it. The key (FIRMS_MAP_KEY) goes into request URLs only: every stored URL, manifest, log line and
error message carries <MAP_KEY> instead.

Layout under data/cache/firms/:
  area/<region>/<SOURCE>/<YYYY-MM-DD>_<n>d.csv   one request's CSV exactly as returned, with a manifest beside it
  extract/<region>/<product>_<year>.csv          built from the chunks: same layout as the country file extracts,
                                                 so read_firms() serves them; its manifest says the source is the
                                                 area API and how far it is covered

Usage (the key file is read, never printed):
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/area_api.py \
      --env-file /path/to/.env status
  ... fetch --sources VIIRS_NOAA21 --start 2023-01-01        NOAA-21 from its first date to its last available date
  ... fetch --sources MODIS VIIRS_SNPP VIIRS_NOAA20 --start 2026-01-01
"""

from __future__ import annotations

import argparse
import collections
import csv
import datetime as _dt
import hashlib
import io
import json
from pathlib import Path
import sys
import time
from typing import Any, Callable, Iterable
import urllib.error

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.archive import (  # noqa: E402
    DEDUP_FIELDS,
    FIRMS_CACHE_DIR,
    REGION_COUNTRY,
    REQUIRED_COLUMNS,
    Opener,
    _default_opener,
    _map_key,
    _now_utc,
    _platform,
    _write_atomic,
    _write_manifest,
    extract_path,
    read_manifest,
    redact_key,
    region_box,
)

API_BASE: str = "https://firms.modaps.eosdis.nasa.gov"
MAX_DAYS: int = 5  # docs/data.md: NASA documents a maximum of five days per area request
PAUSE_S: float = 1.0
BACKOFF_BASE_S: float = 2.0  # first retry waits this long, doubling after
# A five-day request over a hero box costs 10 transactions and a mapkey_status read costs none (measured). The
# fetch reads the count every THROTTLE_EVERY requests and waits while it is above THROTTLE_SHARE of the limit.
THROTTLE_EVERY: int = 25
THROTTLE_SHARE: float = 0.6
# Area API sources by platform; SP is preferred where the availability endpoint says it covers a date.
PLATFORM_SOURCES: dict[str, tuple[str, ...]] = {
    "MODIS": ("MODIS_SP", "MODIS_NRT"),
    "VIIRS_SNPP": ("VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"),
    "VIIRS_NOAA20": ("VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"),
    "VIIRS_NOAA21": ("VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT"),
}
# The extract product name each platform's rows join (country file names where they exist).
PLATFORM_PRODUCT: dict[str, str] = {
    "MODIS": "modis", "VIIRS_SNPP": "viirs-snpp", "VIIRS_NOAA20": "viirs-jpss1", "VIIRS_NOAA21": "viirs-noaa21",
}


class KeyMissing(RuntimeError):
    pass


def _key(env_file: Path | None) -> str:
    key = _map_key(env_file.parent) if env_file is not None else _map_key()
    if not key:
        raise KeyMissing("FIRMS_MAP_KEY is not set")
    return key


def _get(url: str, key: str, opener: Opener, retries: int = 3) -> bytes:
    """GET ``url`` (which may hold the key); any error text is redacted before it leaves this function."""
    last = ""
    for attempt in range(retries):
        try:
            with opener(url) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            last = redact_key(f"HTTP {exc.code}", key)
            if exc.code not in (408, 429, 500, 502, 503, 504):
                break
        except Exception as exc:  # noqa: BLE001
            last = redact_key(f"{type(exc).__name__}: {exc}", key)
        time.sleep(min(30.0, BACKOFF_BASE_S * 2**attempt))
    raise RuntimeError(f"request failed: {last}")


def key_status(key: str, opener: Opener = _default_opener) -> dict[str, Any]:
    """The key's transaction count and limit (mapkey_status). Contains no key."""
    body = _get(f"{API_BASE}/mapserver/mapkey_status/?MAP_KEY={key}", key, opener)
    d = json.loads(body.decode("utf-8"))
    return {k: v for k, v in d.items() if "key" not in k.lower()}


def availability(key: str, opener: Opener = _default_opener) -> dict[str, tuple[str, str]]:
    """{source: (min_date, max_date)} from the data availability endpoint."""
    body = _get(f"{API_BASE}/api/data_availability/csv/{key}/ALL", key, opener).decode("utf-8")
    out = {}
    for row in csv.DictReader(io.StringIO(body)):
        if row.get("data_id") and row.get("min_date") and row.get("max_date"):
            out[row["data_id"]] = (row["min_date"], row["max_date"])
    return out


def plan_requests(platform: str, start: _dt.date, avail: dict[str, tuple[str, str]],
                  end: _dt.date | None = None) -> list[tuple[str, _dt.date, int]]:
    """(source, first day, days) chunks of at most MAX_DAYS from ``start`` to the last available day: SP while it
    covers a day, NRT after."""
    spans = []
    for src in PLATFORM_SOURCES[platform]:
        if src in avail:
            a, b = (_dt.date.fromisoformat(x[:10]) for x in avail[src])
            spans.append((src, a, b))
    if not spans:
        return []
    last = max(b for _, _, b in spans)
    if end is not None:
        last = min(last, end)
    out: list[tuple[str, _dt.date, int]] = []
    day = max(start, min(a for _, a, _ in spans))
    while day <= last:
        src = next((s for s, a, b in spans if a <= day <= b), None)
        if src is None:
            day += _dt.timedelta(days=1)
            continue
        b = next(b for s, _, b in spans if s == src)
        n = min(MAX_DAYS, (min(b, last) - day).days + 1)
        out.append((src, day, n))
        day += _dt.timedelta(days=n)
    return out


def chunk_path(region_id: str, source: str, day: _dt.date, n: int, cache_dir: Path = FIRMS_CACHE_DIR) -> Path:
    return cache_dir / "area" / region_id / source / f"{day.isoformat()}_{n}d.csv"


def fetch_area(platform: str, start: _dt.date, regions: Iterable[str] = tuple(REGION_COUNTRY),
               env_file: Path | None = None, cache_dir: Path = FIRMS_CACHE_DIR, opener: Opener = _default_opener,
               log: Callable[[str], None] = print, pause_s: float = PAUSE_S, end: _dt.date | None = None,
               avail: dict[str, tuple[str, str]] | None = None) -> dict[str, Any]:
    """Fetch every missing chunk for ``platform`` over each region box, then rebuild that platform's extracts."""
    key = _key(env_file)
    log("FIRMS_MAP_KEY set; route: area API")
    avail = avail if avail is not None else availability(key, opener)
    reqs = plan_requests(platform, start, avail, end)
    done = skipped = rows = 0
    for r in regions:
        w, s, e, n = region_box(r)
        for src, day, days in reqs:
            dest = chunk_path(r, src, day, days, cache_dir)
            if read_manifest(dest) is not None:
                skipped += 1
                continue
            url = f"{API_BASE}/api/area/csv/{key}/{src}/{w},{s},{e},{n}/{days}/{day.isoformat()}"
            body = _get(url, key, opener)
            text = body.decode("utf-8")
            if not text.startswith("latitude"):
                raise RuntimeError(f"{r} {src} {day}: unexpected reply: {redact_key(text[:120], key)}")
            _write_atomic(dest, body)
            n_rows = max(0, text.count("\n") - 1) if text.endswith("\n") else text.count("\n")
            _write_manifest(dest, {
                "source_url": redact_key(url, key),
                "query": {"kind": "area_api", "source": src, "platform": platform, "region_id": r,
                          "box_wsen": [w, s, e, n], "first_day": day.isoformat(), "days": days},
                "retrieved_utc": _now_utc(),
                "bytes": len(body),
                "sha256": hashlib.sha256(body).hexdigest(),
                "rows": n_rows,
                "columns": text.split("\n", 1)[0].strip().split(","),
                "availability": {src: list(avail[src])},
                "key_used": True,
            })
            done += 1
            rows += n_rows
            if pause_s:
                time.sleep(pause_s)
            if done % THROTTLE_EVERY == 0:
                while True:
                    st = key_status(key, opener)
                    cur, lim = int(st.get("current_transactions", 0)), int(st.get("transaction_limit", 5000))
                    log(f"{r} {platform}: {done} requests so far; {cur} of {lim} transactions in the current window")
                    if cur <= THROTTLE_SHARE * lim:
                        break
                    time.sleep(60.0)
        log(f"{r} {platform}: {len(reqs)} chunks planned")
    built = build_extracts(platform, regions, cache_dir)
    return {"platform": platform, "requests_made": done, "chunks_already_cached": skipped, "rows_fetched": rows,
            "requests_planned_per_region": len(reqs), "extracts": built}


def build_extracts(platform: str, regions: Iterable[str], cache_dir: Path = FIRMS_CACHE_DIR) -> list[str]:
    """Rebuild extract/<region>/<product>_<year>.csv from the cached chunks of ``platform`` (years the country files
    do not hold). Rows outside the box are dropped and exact duplicates removed, as for the country files. SP and NRT
    replies differ in columns (NRT has no ``type``), so the extract carries the union of columns in first seen order
    and leaves a value empty where a reply had no such column; every value is kept as the source wrote it."""
    product = PLATFORM_PRODUCT[platform]
    written = []
    for r in regions:
        box = region_box(r)
        chunks: list[tuple[Path, dict[str, Any]]] = []
        for src in PLATFORM_SOURCES[platform]:
            base = cache_dir / "area" / r / src
            for p in sorted(base.glob("*.csv")) if base.is_dir() else []:
                m = read_manifest(p)
                if m is not None:
                    chunks.append((p, m))
        by_year: dict[int, list[dict[str, str]]] = collections.defaultdict(list)
        header: list[str] | None = None
        covered: dict[int, list[str]] = {}
        available_to = ""
        lineage: dict[int, list[dict[str, Any]]] = collections.defaultdict(list)
        seen: set[tuple[str, ...]] = set()
        dups = collections.Counter()
        for p, m in sorted(chunks, key=lambda x: x[1]["query"]["first_day"]):
            q = m["query"]
            for _src, span in (m.get("availability") or {}).items():
                available_to = max(available_to, str(span[1])[:10])
            first = _dt.date.fromisoformat(q["first_day"])
            last = first + _dt.timedelta(days=int(q["days"]) - 1)
            for y in range(first.year, last.year + 1):
                lo, hi = max(first, _dt.date(y, 1, 1)), min(last, _dt.date(y, 12, 31))
                c = covered.setdefault(y, [lo.isoformat(), hi.isoformat()])
                c[0], c[1] = min(c[0], lo.isoformat()), max(c[1], hi.isoformat())
                lineage[y].append({"chunk": str(p.relative_to(cache_dir)), "sha256": m["sha256"], "rows": m["rows"]})
            with p.open(encoding="utf-8", newline="") as fh:
                rd = csv.reader(fh)
                h = next(rd, None)
                if h is None:
                    continue
                missing = [x for x in REQUIRED_COLUMNS if x not in h]
                if missing:
                    raise ValueError(f"{p.name}: columns missing {missing}")
                if header is None:
                    header = list(h)
                header += [x for x in h if x not in header]
                col = {x: i for i, x in enumerate(h)}
                dk = [col[f] for f in DEDUP_FIELDS]
                for rec in rd:
                    if len(rec) != len(h):
                        continue
                    lat, lon = float(rec[col["latitude"]]), float(rec[col["longitude"]])
                    if not (box[0] <= lon <= box[2] and box[1] <= lat <= box[3]):
                        continue
                    k = tuple(rec[j] for j in dk)
                    y = int(rec[col["acq_date"]][:4])
                    if k in seen:
                        dups[y] += 1
                        continue
                    seen.add(k)
                    by_year[y].append(dict(zip(h, rec)))
        if header is None:
            continue
        for y, span in sorted(covered.items()):
            recs = by_year.get(y, [])
            dest = extract_path(r, product, y, cache_dir)
            existing = read_manifest(dest)
            if existing is not None and existing.get("lineage", {}).get("source") != "area_api":
                continue  # a country file extract already holds this year; never overwrite it
            buf = io.StringIO()
            wr = csv.DictWriter(buf, fieldnames=header, lineterminator="\n", restval="")
            wr.writeheader()
            wr.writerows(recs)
            payload = buf.getvalue().encode("utf-8")
            _write_atomic(dest, payload)
            _write_manifest(dest, {
                "region_id": r,
                "box_wsen": list(box),
                "product": product,
                "year": y,
                "rows": len(recs),
                "duplicates_dropped": dups[y],
                "dedup_key": list(DEDUP_FIELDS),
                "columns": header,
                "acq_date_range": [min(x["acq_date"] for x in recs), max(x["acq_date"] for x in recs)] if recs else [None, None],
                "covered_days": span,
                # The last day the source itself had for this platform when fetched: past it the platform delivered
                # nothing (Suomi NPP ends 2026-11-02), which is not a gap in this cache.
                "source_available_to": available_to or None,
                "platform_rows": dict(collections.Counter(_platform(product, x["satellite"]) for x in recs)),
                "versions": dict(collections.Counter(x["version"] for x in recs)),
                "columns_missing_in_some_rows": sorted({c for x in recs for c in header if c not in x}),
                "lineage": {"source": "area_api", "chunks": lineage[y],
                            "filter": "longitude and latitude inside box_wsen; exact duplicates on dedup_key dropped"},
                "sha256": hashlib.sha256(payload).hexdigest(),
                "bytes": len(payload),
                "written_utc": _now_utc(),
            })
            written.append(str(dest.relative_to(cache_dir)))
    return written


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="FIRMS area API fetch (NOAA-21, and years after the country files).")
    ap.add_argument("--env-file", type=Path, default=None, help=".env holding FIRMS_MAP_KEY (read, never printed)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status", help="the key's transaction count and the availability of every source")
    f = sub.add_parser("fetch")
    f.add_argument("--sources", nargs="+", required=True, choices=sorted(PLATFORM_SOURCES))
    f.add_argument("--start", required=True)
    f.add_argument("--end", default=None)
    f.add_argument("--regions", nargs="*", default=list(REGION_COUNTRY))
    f.add_argument("--pause", type=float, default=PAUSE_S, help="seconds between requests")
    args = ap.parse_args(argv)
    key = _key(args.env_file)
    if args.cmd == "status":
        print(json.dumps({"key_status": key_status(key), "availability": availability(key)}, indent=2))
        return 0
    before = key_status(key)
    avail = availability(key)
    out = [fetch_area(p, _dt.date.fromisoformat(args.start), args.regions, args.env_file, pause_s=args.pause,
                      end=_dt.date.fromisoformat(args.end) if args.end else None, avail=avail) for p in args.sources]
    after = key_status(key)
    print(json.dumps({"key_status_before": before, "key_status_after": after, "results": out}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
