"""Satellite pass schedule over the hero context boxes from NASA CMR granule metadata (no login, no token).

A detection list only knows passes that saw fire. NASA's Common Metadata Repository lists every granule of the
active fire products, fire or not, with its time span, day or night flag, swath polygon and (MODIS) cloud cover:
  https://cmr.earthdata.nasa.gov/search/granules.json?collection_concept_id=<id>&bounding_box=<w,s,e,n>&temporal=...
Collections (LP DAAC cloud, by CMR concept id):
  MODIS_TERRA  MOD14     061  C2271754179-LPCLOUD  from 2000-02-24   5 min granules, cloud_cover given
  MODIS_AQUA   MYD14     061  C2278858993-LPCLOUD  from 2002-07-04
  VIIRS_SNPP   VNP14IMG  002  C2734202914-LPCLOUD  from 2012-01-17   6 min granules
  VIIRS_NOAA20 VJ114IMG  002  C2734197957-LPCLOUD  from 2018-01-01
  VIIRS_NOAA21 VJ214IMG  002  C2831626262-LPCLOUD  from 2023-02-10
Querying by concept id avoids the version spelling trap of short name queries (LPCLOUD wants "061", LAADS "6.1").

Cache under data/cache/cmr/ (not tracked):
  raw/<region>/<platform>/<YYYY-MM>_p<n>.json.gz   each CMR reply, gzip, with <file>.manifest.json beside it
                                                    (URL, query, retrieval time, hits, entries, bytes, sha256)
  passes/<region>/<platform>_<year>.json.gz         the granules of that year, compact and deduplicated, with the
                                                    months fetched, gzip; this is what the reader reads (rebuilt
                                                    from raw/ by any fetch over that year, with no request)
This is NASA metadata, not FIRMS rows: it is not counted in downloaded_firms_rows.

Reader: cmr_passes(box, start, end, platforms=None, tiles=None). Consecutive granules of one platform form one pass;
for each pass it says how much of the box (and of each given tile) lies inside the swath polygons, whether the
whole box does, the day or night flag and the cloud cover where the granules give it.

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/cmr_passes.py \
      fetch --first 2021-06 --last 2021-09
"""

from __future__ import annotations

import argparse
import bisect
import calendar as _cal
from collections import OrderedDict
import datetime as _dt
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import threading
import time
from typing import Any, Callable, Iterable
import urllib.error
import urllib.request

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.archive import REGION_COUNTRY, USER_AGENT, region_box  # noqa: E402

CMR_BASE: str = "https://cmr.earthdata.nasa.gov/search"
CMR_CACHE_DIR: Path = _REPO_ROOT / "data" / "cache" / "cmr"
PAGE_SIZE: int = 2000
PAUSE_S: float = 0.5
BACKOFF_BASE_S: float = 2.0
RETRIES: int = 7           # waits of 2, 4, 8, 16, 32 and 60 s: a request is given up after about two minutes
RETRY_AFTER_MAX_S: float = 120.0
PASS_GAP_S: float = 120.0  # consecutive granules of one platform closer than this belong to one pass
EDGE_STEPS: int = 24       # great circle points per polygon edge
BOX_SAMPLES: int = 11      # sample points per side for the share of a box inside a swath
TILE_SAMPLES: int = 5

COLLECTIONS: dict[str, dict[str, str]] = {
    "MODIS_TERRA": {"concept_id": "C2271754179-LPCLOUD", "short_name": "MOD14", "version": "061", "first_day": "2000-02-24"},
    "MODIS_AQUA": {"concept_id": "C2278858993-LPCLOUD", "short_name": "MYD14", "version": "061", "first_day": "2002-07-04"},
    "VIIRS_SNPP": {"concept_id": "C2734202914-LPCLOUD", "short_name": "VNP14IMG", "version": "002", "first_day": "2012-01-17"},
    "VIIRS_NOAA20": {"concept_id": "C2734197957-LPCLOUD", "short_name": "VJ114IMG", "version": "002", "first_day": "2018-01-01"},
    "VIIRS_NOAA21": {"concept_id": "C2831626262-LPCLOUD", "short_name": "VJ214IMG", "version": "002", "first_day": "2023-02-10"},
}


class CmrCacheMissing(LookupError):
    """A read needs months the CMR cache does not hold."""


# Fetching

# opener(url, headers) -> (status, response headers lowercased, body bytes as sent)
Opener = Callable[[str, dict[str, str]], tuple[int, dict[str, str], bytes]]


def _default_opener(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **headers})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()


def _retry_after(exc: urllib.error.HTTPError) -> float | None:
    try:
        value = float((exc.headers or {}).get("Retry-After", ""))
    except (TypeError, ValueError):
        return None
    return min(max(value, 0.0), RETRY_AFTER_MAX_S)


def _get(url: str, headers: dict[str, str], opener: Opener,
         retries: int | None = None) -> tuple[dict[str, str], bytes, int]:
    """(headers, JSON body bytes, bytes transferred). Asks for gzip and decodes it. A 408, 429 or 5xx reply or a
    network error is retried with a growing wait (or the server's Retry-After); after RETRIES attempts, about two
    minutes, the request fails and the fetch stops, so a refusing or throttling service is never pressed."""
    tries = RETRIES if retries is None else retries
    last: Exception | None = None
    for attempt in range(tries):
        wait = min(60.0, BACKOFF_BASE_S * 2**attempt)
        try:
            status, h, body = opener(url, {"Accept-Encoding": "gzip", **headers})
            sent = len(body)
            if h.get("content-encoding", "").lower() == "gzip":
                body = gzip.decompress(body)
            return h, body, sent
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (408, 429, 500, 502, 503, 504):
                break
            after = _retry_after(exc)
            if after is not None:
                wait = after
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
        if attempt + 1 < tries:
            time.sleep(wait)
    raise RuntimeError(f"CMR request failed after {attempt + 1} attempts: {last}")


def _month_bounds(year: int, month: int) -> tuple[str, str]:
    last = _cal.monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-01T00:00:00Z", f"{year:04d}-{month:02d}-{last:02d}T23:59:59Z"


def month_url(platform: str, box: tuple[float, float, float, float], year: int, month: int) -> str:
    t0, t1 = _month_bounds(year, month)
    w, s, e, n = box
    return (f"{CMR_BASE}/granules.json?collection_concept_id={COLLECTIONS[platform]['concept_id']}"
            f"&bounding_box={w},{s},{e},{n}&temporal={t0},{t1}&page_size={PAGE_SIZE}&sort_key=start_date")


def _now_utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write_atomic(dest: Path, payload: bytes) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    # The process id as well as the thread: two processes may fetch the same file, and thread ids repeat across
    # processes.
    tmp = dest.with_name(f".{dest.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_bytes(payload)
    tmp.replace(dest)


def raw_dir(region_id: str, platform: str, cache_dir: Path = CMR_CACHE_DIR) -> Path:
    return cache_dir / "raw" / region_id / platform


def fetch_month(region_id: str, platform: str, year: int, month: int, cache_dir: Path = CMR_CACHE_DIR,
                opener: Opener = _default_opener, pause_s: float = PAUSE_S) -> dict[str, Any]:
    """Every granule of ``platform`` whose footprint meets the region's context box in that month; one cached file
    and manifest per CMR reply (paging with CMR-Search-After when a month holds more than PAGE_SIZE)."""
    box = region_box(region_id)
    url = month_url(platform, box, year, month)
    pages, search_after, entries = [], None, 0
    hits = None
    page = 0
    while True:
        headers = {"CMR-Search-After": search_after} if search_after else {}
        h, body, sent = _get(url, headers, opener)
        feed = json.loads(body.decode("utf-8"))["feed"]["entry"]
        hits = int(h.get("cmr-hits", len(feed)))
        page += 1
        dest = raw_dir(region_id, platform, cache_dir) / f"{year:04d}-{month:02d}_p{page}.json.gz"
        _write_atomic(dest, gzip.compress(body, mtime=0))
        manifest = {
            "url": url,
            "request_headers": headers,
            "query": {"kind": "cmr_granules", "region_id": region_id, "platform": platform,
                      "collection": COLLECTIONS[platform], "box_wsen": list(box), "month": f"{year:04d}-{month:02d}",
                      "page": page},
            "retrieved_utc": _now_utc(),
            "hits": hits,
            "entries": len(feed),
            "json_bytes": len(body),
            "bytes_transferred": sent,
            "stored_bytes": dest.stat().st_size,
            "sha256": hashlib.sha256(body).hexdigest(),
        }
        _write_atomic(dest.with_name(dest.name + ".manifest.json"), (json.dumps(manifest, indent=2) + "\n").encode())
        pages.append(manifest)
        entries += len(feed)
        if pause_s:
            time.sleep(pause_s)
        search_after = h.get("cmr-search-after")
        if entries >= hits or not feed or not search_after:
            break
    return {"region_id": region_id, "platform": platform, "month": f"{year:04d}-{month:02d}", "hits": hits,
            "entries": entries, "pages": len(pages), "json_bytes": sum(p["json_bytes"] for p in pages),
            "bytes_transferred": sum(p["bytes_transferred"] for p in pages)}


def _months(first: str, last: str) -> list[tuple[int, int]]:
    y, m = int(first[:4]), int(first[5:7])
    out = []
    while (y, m) <= (int(last[:4]), int(last[5:7])):
        out.append((y, m))
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def plan(first: str, last: str, regions: Iterable[str] = tuple(REGION_COUNTRY),
         platforms: Iterable[str] = tuple(COLLECTIONS)) -> list[tuple[str, str, int, int]]:
    """(region, platform, year, month) for every month a platform's collection covers."""
    out = []
    for r in regions:
        for p in platforms:
            first_day = COLLECTIONS[p]["first_day"][:7]
            for y, m in _months(first, last):
                if f"{y:04d}-{m:02d}" >= first_day:
                    out.append((r, p, y, m))
    return out


def fetch(first: str, last: str, regions: Iterable[str] = tuple(REGION_COUNTRY), platforms: Iterable[str] = tuple(COLLECTIONS),
          cache_dir: Path = CMR_CACHE_DIR, opener: Opener = _default_opener, log: Callable[[str], None] = print,
          pause_s: float = PAUSE_S, force: bool = False) -> dict[str, Any]:
    todo = plan(first, last, regions, platforms)
    done = []
    for i, (r, p, y, m) in enumerate(todo):
        if not force and (raw_dir(r, p, cache_dir) / f"{y:04d}-{m:02d}_p1.json.gz.manifest.json").is_file():
            continue
        res = fetch_month(r, p, y, m, cache_dir, opener, pause_s)
        done.append(res)
        if len(done) % 20 == 0:
            log(f"{len(done)} months fetched ({i + 1} of {len(todo)} planned)")
    touched = sorted({(r, p, y) for r, p, y, _m in todo})
    for r, p, y in touched:
        build_pass_file(r, p, y, cache_dir)
    return {"months_planned": len(todo), "months_fetched": len(done),
            "requests": sum(d["pages"] for d in done), "granules": sum(d["entries"] for d in done),
            "json_bytes": sum(d["json_bytes"] for d in done),
            "bytes_transferred": sum(d["bytes_transferred"] for d in done)}


# Pass files


def _ring(text: str) -> list[list[float]]:
    """CMR polygon ring 'lat lon lat lon ...' as [[lon, lat], ...]."""
    v = [float(x) for x in text.split()]
    return [[v[i + 1], v[i]] for i in range(0, len(v) - 1, 2)]


def _granule(e: dict[str, Any]) -> dict[str, Any]:
    rings = [_ring(r) for poly in (e.get("polygons") or []) for r in poly[:1]]  # outer rings only
    if not rings and e.get("boxes"):
        s, w, n, ea = (float(x) for x in e["boxes"][0].split())
        rings = [[[w, s], [ea, s], [ea, n], [w, n], [w, s]]]
    cc = e.get("cloud_cover")
    return {
        "id": e["id"],
        "title": e.get("title") or e.get("producer_granule_id"),
        "time_start": e["time_start"][:19] + "Z",
        "time_end": e["time_end"][:19] + "Z",
        "day_night": e.get("day_night_flag"),
        "cloud_cover_pct": float(cc) if cc not in (None, "") else None,
        "rings": rings,
    }


def pass_file(region_id: str, platform: str, year: int, cache_dir: Path = CMR_CACHE_DIR) -> Path:
    return cache_dir / "passes" / region_id / f"{platform}_{year:04d}.json.gz"


def pass_files_digest(region_id: str, cache_dir: Path = CMR_CACHE_DIR) -> str:
    """sha256 over the name, size and modification time of every pass file of the region (they are rewritten only
    by a fetch), for keying caches of what is built from them."""
    h = hashlib.sha256(region_id.encode("utf-8"))
    base = cache_dir / "passes" / region_id
    for f in sorted(base.glob("*.json.gz")) if base.is_dir() else []:
        st = f.stat()
        h.update(f"{f.name}={st.st_size}:{st.st_mtime_ns};".encode("utf-8"))
    return h.hexdigest()


_PASS_FILE_LOCK = threading.Lock()
_PASS_FILE_CACHE_MAX: int = 128
_RAW_PASS_FILE_CACHE: OrderedDict[tuple[str, int, int, int], dict[str, Any]] = OrderedDict()
_PREPARED_PASS_CACHE: OrderedDict[tuple[str, int, int, int], "_PreparedPassYear"] = OrderedDict()


def _stat_key(path: Path) -> tuple[str, int, int, int]:
    st = path.stat()
    return (str(path), st.st_ino, st.st_mtime_ns, st.st_size)


def read_pass_file(path: Path) -> dict[str, Any]:
    key = _stat_key(path)
    with _PASS_FILE_LOCK:
        cached = _RAW_PASS_FILE_CACHE.get(key)
        if cached is not None:
            _RAW_PASS_FILE_CACHE.move_to_end(key)
            return cached
    parsed = json.loads(gzip.decompress(path.read_bytes()).decode("utf-8"))
    with _PASS_FILE_LOCK:
        _RAW_PASS_FILE_CACHE[key] = parsed
        _RAW_PASS_FILE_CACHE.move_to_end(key)
        while len(_RAW_PASS_FILE_CACHE) > _PASS_FILE_CACHE_MAX:
            _RAW_PASS_FILE_CACHE.popitem(last=False)
    return parsed


def build_pass_file(region_id: str, platform: str, year: int, cache_dir: Path = CMR_CACHE_DIR) -> Path | None:
    """Join the cached replies of one region, platform and year into one compact, deduplicated granule list."""
    base = raw_dir(region_id, platform, cache_dir)
    files = sorted(base.glob(f"{year:04d}-*_p*.json.gz")) if base.is_dir() else []
    if not files:
        return None
    seen: dict[str, dict[str, Any]] = {}
    months, lineage = set(), []
    for f in files:
        man = json.loads(f.with_name(f.name + ".manifest.json").read_text(encoding="utf-8"))
        body = gzip.decompress(f.read_bytes())
        if hashlib.sha256(body).hexdigest() != man["sha256"]:
            raise RuntimeError(f"{f.name}: sha256 differs from its manifest")
        months.add(man["query"]["month"])
        lineage.append({"file": str(f.relative_to(cache_dir)), "sha256": man["sha256"], "entries": man["entries"]})
        for e in json.loads(body.decode("utf-8"))["feed"]["entry"]:
            seen[e["id"]] = _granule(e)
    granules = sorted(seen.values(), key=lambda g: (g["time_start"], g["id"]))
    out = {
        "region_id": region_id,
        "platform": platform,
        "year": year,
        "collection": COLLECTIONS[platform],
        "box_wsen": list(region_box(region_id)),
        "months_fetched": sorted(months),
        "granules": granules,
        "lineage": lineage,
        "written_utc": _now_utc(),
    }
    dest = pass_file(region_id, platform, year, cache_dir)
    _write_atomic(dest, gzip.compress((json.dumps(out, separators=(",", ":")) + "\n").encode("utf-8"), mtime=0))
    return dest


# Geometry


def _to_xyz(lon: float, lat: float) -> tuple[float, float, float]:
    la, lo = math.radians(lat), math.radians(lon)
    return math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)


def _to_lonlat(x: float, y: float, z: float) -> tuple[float, float]:
    return math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.hypot(x, y)))


def densify(ring: list[list[float]], steps: int = EDGE_STEPS) -> list[tuple[float, float]]:
    """A polygon ring with each edge followed along its great circle, as CMR geodetic polygons are drawn."""
    out: list[tuple[float, float]] = []
    for (lo0, la0), (lo1, la1) in zip(ring[:-1], ring[1:]):
        a, b = _to_xyz(lo0, la0), _to_xyz(lo1, la1)
        dot = max(-1.0, min(1.0, sum(p * q for p, q in zip(a, b))))
        om = math.acos(dot)
        for k in range(steps):
            t = k / steps
            if om < 1e-12:
                out.append((lo0, la0))
                continue
            sa, sb = math.sin((1 - t) * om) / math.sin(om), math.sin(t * om) / math.sin(om)
            out.append(_to_lonlat(*(sa * p + sb * q for p, q in zip(a, b))))
    out.append(out[0])
    # Keep longitudes continuous along the ring (no swath of ours crosses the antimeridian, but be safe).
    fixed = [out[0]]
    for lo, la in out[1:]:
        prev = fixed[-1][0]
        while lo - prev > 180.0:
            lo -= 360.0
        while lo - prev < -180.0:
            lo += 360.0
        fixed.append((lo, la))
    return fixed


def _inside(lon: float, lat: float, ring: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _ring_bounds(ring: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return (min(xs), min(ys), max(xs), max(ys))


def share_inside(box: tuple[float, float, float, float], rings: list[list[tuple[float, float]]], samples: int) -> float:
    """Share of a box's sample points (samples x samples, edges included) inside any of the rings."""
    total = samples * samples
    if not rings:
        return 0.0
    w, s, e, n = box
    active: list[tuple[list[tuple[float, float]], float, float]] = []
    for r in rings:
        if not r:
            continue
        rx0, ry0, rx1, ry1 = _ring_bounds(r)
        if ry1 <= s - 1e-9 or ry0 > n + 1e-9 or rx1 < w - 1e-9 or rx0 > e + 1e-9:
            continue
        active.append((r, ry0, ry1))
    if not active:
        return 0.0
    xs = [w + (e - w) * i / (samples - 1) for i in range(samples)]
    ys = [s + (n - s) * j / (samples - 1) for j in range(samples)]
    hit = 0
    for la in ys:
        ring_crosses: list[list[float]] = []
        for r, ry0, ry1 in active:
            if la < ry0 or la >= ry1:
                continue
            crosses: list[float] = []
            k = len(r) - 1
            for m in range(len(r)):
                xi, yi = r[m]
                xj, yj = r[k]
                if (yi > la) != (yj > la):
                    crosses.append((xj - xi) * (la - yi) / (yj - yi) + xi)
                k = m
            if crosses:
                ring_crosses.append(crosses)
        if not ring_crosses:
            continue
        for lo in xs:
            for crosses in ring_crosses:
                inside = 0
                for xc in crosses:
                    if lo < xc:
                        inside ^= 1
                if inside:
                    hit += 1
                    break
    return hit / total


# Reader


def _parse_t(v: str | _dt.date | _dt.datetime) -> _dt.datetime:
    if isinstance(v, _dt.datetime):
        return v if v.tzinfo else v.replace(tzinfo=_dt.timezone.utc)
    if isinstance(v, _dt.date):
        return _dt.datetime(v.year, v.month, v.day, tzinfo=_dt.timezone.utc)
    dt = _dt.datetime.fromisoformat(str(v))
    return dt if dt.tzinfo else dt.replace(tzinfo=_dt.timezone.utc)


class _PreparedGranule:
    __slots__ = ("g", "ts", "te", "dense_rings")

    def __init__(self, g: dict[str, Any]) -> None:
        self.g = g
        self.ts = _parse_t(g["time_start"])
        self.te = _parse_t(g["time_end"])
        self.dense_rings: list[list[tuple[float, float]]] | None = None

    def get_dense_rings(self) -> list[list[tuple[float, float]]]:
        if self.dense_rings is None:
            self.dense_rings = [densify(r) for r in self.g["rings"]]
        return self.dense_rings


def _group_prepared(granules: list[_PreparedGranule]) -> list[tuple[_dt.datetime, _dt.datetime, list[_PreparedGranule]]]:
    groups: list[list[_PreparedGranule]] = []
    for pg in granules:
        if groups and (pg.ts - groups[-1][-1].te).total_seconds() <= PASS_GAP_S:
            groups[-1].append(pg)
        else:
            groups.append([pg])
    return [(grp[0].ts, grp[-1].te, grp) for grp in groups]


class _PreparedPassYear:
    __slots__ = ("months_fetched", "granules", "groups", "group_ts", "prefix_max_te")

    def __init__(self, pf: dict[str, Any]) -> None:
        self.months_fetched: frozenset[str] = frozenset(pf["months_fetched"])
        raw_granules = sorted(pf["granules"], key=lambda g: g["time_start"])
        self.granules: list[_PreparedGranule] = [_PreparedGranule(g) for g in raw_granules]
        self.groups = _group_prepared(self.granules)
        self.group_ts: list[_dt.datetime] = [ts for ts, _te, _grp in self.groups]
        self.prefix_max_te: list[_dt.datetime] = []
        cur_max: _dt.datetime | None = None
        for _ts, te, _grp in self.groups:
            cur_max = te if cur_max is None or te > cur_max else cur_max
            self.prefix_max_te.append(cur_max)


def _prepared_pass_year(path: Path) -> _PreparedPassYear:
    key = _stat_key(path)
    with _PASS_FILE_LOCK:
        cached = _PREPARED_PASS_CACHE.get(key)
        if cached is not None:
            _PREPARED_PASS_CACHE.move_to_end(key)
            return cached
    pf = read_pass_file(path)
    prepared = _PreparedPassYear(pf)
    with _PASS_FILE_LOCK:
        _PREPARED_PASS_CACHE[key] = prepared
        _PREPARED_PASS_CACHE.move_to_end(key)
        while len(_PREPARED_PASS_CACHE) > _PASS_FILE_CACHE_MAX:
            _PREPARED_PASS_CACHE.popitem(last=False)
    return prepared


def cmr_passes(
    box: tuple[float, float, float, float],
    start: str | _dt.date | _dt.datetime,
    end: str | _dt.date | _dt.datetime,
    platforms: Iterable[str] | None = None,
    tiles: list[tuple[float, float, float, float]] | None = None,
    cache_dir: Path = CMR_CACHE_DIR,
) -> list[dict[str, Any]]:
    """Every satellite pass whose swath meets ``box`` (west, south, east, north) in [start, end) UTC, fire or no fire.

    Each pass: ``platform`` (MODIS_TERRA, MODIS_AQUA, VIIRS_SNPP, VIIRS_NOAA20, VIIRS_NOAA21), ``time_start`` and
    ``time_end`` (first and last granule), ``time_mid``, ``day_night`` (CMR flag; DAY, NIGHT or BOTH),
    ``cloud_cover_pct`` (mean over its granules where given: MODIS only), ``granules`` (CMR ids),
    ``box_share`` (share of the box inside the swath polygons), ``box_inside`` (the whole box), and
    ``tile_shares`` when ``tiles`` are given. Raises CmrCacheMissing when the box leaves every cached context box or
    a month the window needs is not cached for a platform that was flying then.
    """
    t0, t1 = _parse_t(start), _parse_t(end)
    regions = [r for r in REGION_COUNTRY if _within(box, region_box(r))]
    if not regions:
        raise CmrCacheMissing(f"box {box} is not inside any cached context box")
    region = regions[0]
    want = list(platforms) if platforms is not None else list(COLLECTIONS)
    months = [f"{y:04d}-{m:02d}" for y, m in _months(t0.strftime("%Y-%m"), (t1 - _dt.timedelta(seconds=1)).strftime("%Y-%m"))]
    years_sorted = sorted({int(mo[:4]) for mo in months})
    out: list[dict[str, Any]] = []
    for p in want:
        first = COLLECTIONS[p]["first_day"][:7]
        year_entries: list[_PreparedPassYear] = []
        for y in years_sorted:
            need = [mo for mo in months if mo[:4] == f"{y:04d}" and mo >= first]
            if not need:
                continue
            f = pass_file(region, p, y, cache_dir)
            if not f.is_file():
                raise CmrCacheMissing(f"CMR {p} months {need} for {region} are not cached; fetch them first")
            entry = _prepared_pass_year(f)
            missing = [mo for mo in need if mo not in entry.months_fetched]
            if missing:
                raise CmrCacheMissing(f"CMR {p} months {missing} for {region} are not cached; fetch them first")
            year_entries.append(entry)
        if not year_entries:
            continue
        if len(year_entries) == 1:
            ye = year_entries[0]
            lo = bisect.bisect_right(ye.prefix_max_te, t0)
            hi = bisect.bisect_left(ye.group_ts, t1)
            candidate_groups = ye.groups[lo:hi]
        else:
            merged = [pg for ye in year_entries for pg in ye.granules]
            merged.sort(key=lambda pg: pg.g["time_start"])
            candidate_groups = _group_prepared(merged)
        for ts, te, grp in candidate_groups:
            if te <= t0 or ts >= t1:
                continue
            rings = [dr for pg in grp for dr in pg.get_dense_rings()]
            share = share_inside(box, rings, BOX_SAMPLES)
            if share <= 0.0:
                continue
            cc = [pg.g["cloud_cover_pct"] for pg in grp if pg.g["cloud_cover_pct"] is not None]
            flags = {pg.g["day_night"] for pg in grp if pg.g["day_night"]}
            item = {
                "platform": p,
                "time_start": grp[0].g["time_start"],
                "time_end": grp[-1].g["time_end"],
                "time_mid": (ts + (te - ts) / 2).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "day_night": flags.pop() if len(flags) == 1 else ("BOTH" if flags else None),
                "cloud_cover_pct": round(sum(cc) / len(cc), 1) if cc else None,
                "granules": [pg.g["id"] for pg in grp],
                "box_share": round(share, 4),
                "box_inside": share >= 1.0,
            }
            if tiles is not None:
                item["tile_shares"] = [round(share_inside(t, rings, TILE_SAMPLES), 4) for t in tiles]
            out.append(item)
    out.sort(key=lambda d: (d["time_start"], d["platform"]))
    return out


def _within(inner: tuple[float, float, float, float], outer: tuple[float, float, float, float]) -> bool:
    return outer[0] <= inner[0] and outer[1] <= inner[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


def _group(granules: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    out: list[list[dict[str, Any]]] = []
    for g in granules:
        if out and (_parse_t(g["time_start"]) - _parse_t(out[-1][-1]["time_end"])).total_seconds() <= PASS_GAP_S:
            out[-1].append(g)
        else:
            out.append([g])
    return out


def cache_summary(cache_dir: Path = CMR_CACHE_DIR) -> dict[str, Any]:
    requests = json_bytes = sent = stored = entries = 0
    for m in (cache_dir / "raw").rglob("*.manifest.json") if (cache_dir / "raw").is_dir() else []:
        d = json.loads(m.read_text(encoding="utf-8"))
        requests += 1
        json_bytes += d["json_bytes"]
        sent += d["bytes_transferred"]
        stored += d["stored_bytes"]
        entries += d["entries"]
    return {"requests": requests, "granule_entries": entries, "json_bytes": json_bytes, "bytes_transferred": sent,
            "stored_bytes": stored}


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="NASA CMR pass schedule over the hero context boxes (no login).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--first", required=True, help="first month, YYYY-MM")
    f.add_argument("--last", required=True, help="last month, YYYY-MM")
    f.add_argument("--regions", nargs="*", default=list(REGION_COUNTRY))
    f.add_argument("--platforms", nargs="*", default=list(COLLECTIONS))
    p = sub.add_parser("plan", help="how many monthly requests a span needs (no request made)")
    p.add_argument("--first", required=True)
    p.add_argument("--last", required=True)
    sub.add_parser("status")
    args = ap.parse_args(argv)
    if args.cmd == "fetch":
        print(json.dumps(fetch(args.first, args.last, args.regions, args.platforms), indent=2))
    elif args.cmd == "plan":
        print(len(plan(args.first, args.last)))
    print(json.dumps(cache_summary(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
