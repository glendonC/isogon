"""NASA FIRMS archive for the hero regions (CONTRACT amendment 6).

Source today: the FIRMS Country Yearly Summary CSV files, which download without a key
(https://firms.modaps.eosdis.nasa.gov/data/country/<product>/<year>/<product>_<year>_<Country>.csv, listed in
yearly_summary_files.txt). They carry the standard processing archive: MODIS (Terra, Aqua) from November 2000,
VIIRS 375 m Suomi NPP from 2012 and NOAA-20 from 2018. NOAA-21 is not in them; it needs the FIRMS area API and a
FIRMS_MAP_KEY, which is checked (never printed) each time a fetch starts.

Cache layout under data/cache/firms/ (not tracked):
  listing/yearly_summary_files.txt, listing/AttributesReadme.txt   the source's own listing and attribute readme
  raw/<product>/<year>/<file>.csv                                   each country file exactly as downloaded
  extract/<region>/<product>_<year>.csv                             the rows inside the region's context box,
                                                                    every original column and value, duplicates
                                                                    removed
  every file above has <file>.manifest.json next to it: source URL (any key removed), query, retrieval time, bytes,
  sha256, row count, columns, versions, lineage.

The model reads rows through read_firms(); the server reads counts through cache_summary().

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/archive.py fetch --years 2021
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/archive.py status
"""

from __future__ import annotations

import argparse
import collections
import csv
import datetime as _dt
import hashlib
import json
import os
from dataclasses import dataclass
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

FIRMS_CACHE_DIR: Path = _REPO_ROOT / "data" / "cache" / "firms"
COUNTRY_BASE_URL: str = "https://firms.modaps.eosdis.nasa.gov/data/country"
LISTING_NAME: str = "yearly_summary_files.txt"
README_NAME: str = "AttributesReadme.txt"
DISK_CAP_BYTES: int = 5_000_000_000  # the lead asked to be asked before going past 5 GB in total
USER_AGENT: str = "Isogon-Geospatial-Pipeline/1.0 (+https://github.com/isogon)"
PAUSE_BETWEEN_FILES_S: float = 1.0
TERMS: str = (
    "NASA FIRMS (LANCE / ESDIS). Use guidance and disclaimer: https://www.earthdata.nasa.gov/data/tools/firms; the "
    "source's AttributesReadme.txt is kept in listing/."
)


@dataclass(frozen=True)
class Product:
    key: str  # file name prefix used by the country files
    instrument: str
    platform: str | None  # fixed platform, or None when the satellite column names it (MODIS)
    first_year: int


PRODUCTS: dict[str, Product] = {
    "modis": Product("modis", "MODIS", None, 2000),
    "viirs-snpp": Product("viirs-snpp", "VIIRS", "Suomi NPP", 2012),
    "viirs-jpss1": Product("viirs-jpss1", "VIIRS", "NOAA-20", 2018),
}
MODIS_PLATFORMS: dict[str, str] = {"Terra": "Terra", "Aqua": "Aqua", "T": "Terra", "A": "Aqua"}

# The country file that holds each hero region's context box (each box lies inside one country).
REGION_COUNTRY: dict[str, str] = {"plumas_ca": "United_States", "lytton_bc": "Canada", "evia_greece": "Greece"}

# Columns every reader row must carry (CONTRACT amendment 6); the rest of the source's columns come along too.
REQUIRED_COLUMNS: tuple[str, ...] = (
    "latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument", "confidence", "frp", "scan",
    "track", "daynight", "version",
)
DEDUP_FIELDS: tuple[str, ...] = ("satellite", "instrument", "acq_date", "acq_time", "latitude", "longitude")


class FirmsCacheMissing(LookupError):
    """A read needs a file the cache does not hold yet."""


# Key handling. The value is read only to decide the access route and is never logged, stored or returned by any
# public function here.


def _map_key(repo_root: Path = _REPO_ROOT) -> str:
    v = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if v:
        return v
    env = repo_root / ".env"
    if env.is_file():
        for line in env.read_text(encoding="utf-8", errors="replace").splitlines():
            s = line.strip()
            if s.startswith("#") or "=" not in s:
                continue
            k, val = s.split("=", 1)
            if k.strip().removeprefix("export ").strip() == "FIRMS_MAP_KEY":
                return val.strip().strip("'\"")
    return ""


def map_key_state(repo_root: Path = _REPO_ROOT) -> str:
    """'set' or 'empty'. Never the value."""
    return "set" if _map_key(repo_root) else "empty"


def redact_key(text: str, key: str) -> str:
    """``text`` with every occurrence of ``key`` replaced, for URLs that will be stored or logged."""
    return text.replace(key, "<MAP_KEY>") if key else text


# Geometry


def region_box(region_id: str) -> tuple[float, float, float, float]:
    """(west, south, east, north) of the region's context box, the same box as its context terrain."""
    from backend.terrain.live_region import PRESET_BY_ID
    from backend.terrain.terrain_pack import context_bbox

    b = context_bbox(PRESET_BY_ID[region_id].bbox)
    return (round(b.west, 6), round(b.south, 6), round(b.east, 6), round(b.north, 6))


def _inside(lon: float, lat: float, box: tuple[float, float, float, float]) -> bool:
    w, s, e, n = box
    return w <= lon <= e and s <= lat <= n


# Files and manifests


def _now_utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write_atomic(dest: Path, payload: bytes) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(f".{dest.name}.{threading.get_ident()}.tmp")
    tmp.write_bytes(payload)
    tmp.replace(dest)


def _write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    _write_atomic(path.with_name(path.name + ".manifest.json"), (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))


def read_manifest(path: Path) -> dict[str, Any] | None:
    m = path.with_name(path.name + ".manifest.json")
    if not m.is_file():
        return None
    try:
        return json.loads(m.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def country_file_name(product: str, year: int, country: str) -> str:
    return f"{product}_{year}_{country}.csv"


def country_file_url(product: str, year: int, country: str) -> str:
    return f"{COUNTRY_BASE_URL}/{product}/{year}/{country_file_name(product, year, country)}"


def raw_path(product: str, year: int, country: str, cache_dir: Path = FIRMS_CACHE_DIR) -> Path:
    return cache_dir / "raw" / product / str(year) / country_file_name(product, year, country)


def extract_path(region_id: str, product: str, year: int, cache_dir: Path = FIRMS_CACHE_DIR) -> Path:
    return cache_dir / "extract" / region_id / f"{product}_{year}.csv"


def disk_usage(cache_dir: Path = FIRMS_CACHE_DIR) -> int:
    if not cache_dir.is_dir():
        return 0
    return sum(p.stat().st_size for p in cache_dir.rglob("*") if p.is_file())


# Network

Opener = Callable[[str], Any]  # url -> response with .read(n), .status, .headers; a context manager


def _default_opener(url: str) -> Any:
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=120)


def download(url: str, dest: Path, opener: Opener = _default_opener, expected_bytes: int | None = None,
             retries: int = 4) -> tuple[int, str]:
    """Stream ``url`` to ``dest`` (atomic). Returns (bytes, sha256). Fails on a size other than ``expected_bytes``."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(f".{dest.name}.{threading.get_ident()}.part")
    last: Exception | None = None
    for attempt in range(retries):
        try:
            h = hashlib.sha256()
            n = 0
            with opener(url) as resp, tmp.open("wb") as fh:
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    h.update(chunk)
                    fh.write(chunk)
                    n += len(chunk)
            if expected_bytes is not None and n != expected_bytes:
                raise RuntimeError(f"got {n} bytes, the listing says {expected_bytes}")
            tmp.replace(dest)
            return n, h.hexdigest()
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (408, 429, 500, 502, 503, 504):
                break
            time.sleep(min(30.0, 2.0 * 2**attempt))
        except (urllib.error.URLError, TimeoutError, OSError, RuntimeError) as exc:
            last = exc
            time.sleep(min(30.0, 2.0 * 2**attempt))
    if tmp.exists():
        tmp.unlink()
    raise RuntimeError(f"download failed: {last}")


def fetch_listing(cache_dir: Path = FIRMS_CACHE_DIR, opener: Opener = _default_opener) -> dict[str, dict[str, Any]]:
    """Download the source's file listing and attribute readme; return {filename: {size, updated}}."""
    out_dir = cache_dir / "listing"
    for name in (LISTING_NAME, README_NAME):
        url = f"{COUNTRY_BASE_URL}/{name}"
        dest = out_dir / name
        n, sha = download(url, dest, opener)
        _write_manifest(dest, {"source_url": url, "retrieved_utc": _now_utc(), "bytes": n, "sha256": sha,
                               "query": {"kind": "country_files_listing"}, "terms": TERMS})
    return load_listing(cache_dir)


def load_listing(cache_dir: Path = FIRMS_CACHE_DIR) -> dict[str, dict[str, Any]]:
    path = cache_dir / "listing" / LISTING_NAME
    if not path.is_file():
        return {}
    out: dict[str, dict[str, Any]] = {}
    with path.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            try:
                out[row["filename"]] = {"size": int(row["size"]), "updated": row["updated"]}
            except (KeyError, ValueError):
                continue
    return out


# Extraction and the raw manifest, in one pass over a downloaded country file


def _platform(product: str, satellite: str) -> str:
    p = PRODUCTS[product]
    return p.platform if p.platform else MODIS_PLATFORMS.get(satellite, satellite)


def ingest(product: str, year: int, country: str, url: str, n_bytes: int, sha: str, retrieved_utc: str,
           listing_entry: dict[str, Any] | None, cache_dir: Path = FIRMS_CACHE_DIR) -> dict[str, Any]:
    """Write the raw manifest and the extract (with its manifest) of every hero region in ``country``."""
    src = raw_path(product, year, country, cache_dir)
    regions = [r for r, c in REGION_COUNTRY.items() if c == country]
    boxes = {r: region_box(r) for r in regions}
    kept: dict[str, list[list[str]]] = {r: [] for r in regions}
    seen: dict[str, set[tuple[str, ...]]] = {r: set() for r in regions}
    dups: dict[str, int] = {r: 0 for r in regions}
    versions: collections.Counter[str] = collections.Counter()
    sats: collections.Counter[str] = collections.Counter()
    first = last = ""
    rows = 0
    bad = 0
    with src.open(encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader)
        col = {name: i for i, name in enumerate(header)}
        missing = [c for c in REQUIRED_COLUMNS if c not in col]
        if missing:
            raise ValueError(f"{src.name}: columns missing {missing}")
        i_lat, i_lon, i_date = col["latitude"], col["longitude"], col["acq_date"]
        i_ver, i_sat = col["version"], col["satellite"]
        dkey = [col[f] for f in DEDUP_FIELDS]
        for rec in reader:
            if len(rec) != len(header):
                bad += 1
                continue
            rows += 1
            versions[rec[i_ver]] += 1
            sats[rec[i_sat]] += 1
            d = rec[i_date]
            if not first or d < first:
                first = d
            if d > last:
                last = d
            try:
                lat, lon = float(rec[i_lat]), float(rec[i_lon])
            except ValueError:
                bad += 1
                continue
            for r in regions:
                if _inside(lon, lat, boxes[r]):
                    k = tuple(rec[j] for j in dkey)
                    if k in seen[r]:
                        dups[r] += 1
                        continue
                    seen[r].add(k)
                    kept[r].append(rec)

    raw_manifest = {
        "source_url": url,
        "query": {"kind": "country_yearly_summary", "product": product, "year": year, "country": country},
        "retrieved_utc": retrieved_utc,
        "bytes": n_bytes,
        "sha256": sha,
        "rows": rows,
        "malformed_rows": bad,
        "columns": header,
        "versions": dict(versions),
        "satellites": dict(sats),
        "acq_date_range": [first, last],
        "listing": listing_entry,
        "terms": TERMS,
        "key_used": False,
    }
    _write_manifest(src, raw_manifest)

    for r in regions:
        dest = extract_path(r, product, year, cache_dir)
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(f".{dest.name}.{threading.get_ident()}.tmp")
        with tmp.open("w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh, lineterminator="\n")
            w.writerow(header)
            w.writerows(kept[r])
        tmp.replace(dest)
        h = hashlib.sha256(dest.read_bytes()).hexdigest()
        dates = [rec[i_date] for rec in kept[r]]
        _write_manifest(dest, {
            "region_id": r,
            "box_wsen": list(boxes[r]),
            "product": product,
            "year": year,
            "rows": len(kept[r]),
            "duplicates_dropped": dups[r],
            "dedup_key": list(DEDUP_FIELDS),
            "columns": header,
            "acq_date_range": [min(dates), max(dates)] if dates else [None, None],
            "platform_rows": dict(collections.Counter(_platform(product, rec[i_sat]) for rec in kept[r])),
            "lineage": {"from": str(src.relative_to(cache_dir)), "from_sha256": sha, "from_url": url,
                        "filter": "longitude and latitude inside box_wsen (edges included); exact duplicates on "
                                  "dedup_key dropped, first kept; every column and value kept as in the source"},
            "sha256": h,
            "bytes": dest.stat().st_size,
            "written_utc": _now_utc(),
        })
    return raw_manifest


# Fetch plan


def plan(years: Iterable[int], regions: Iterable[str], products: Iterable[str],
         listing: dict[str, dict[str, Any]]) -> list[tuple[str, int, str, int]]:
    """(product, year, country, listed bytes) for every listed country file the regions need."""
    countries = sorted({REGION_COUNTRY[r] for r in regions})
    out = []
    for p in products:
        for y in sorted(set(years)):
            for c in countries:
                entry = listing.get(country_file_name(p, y, c))
                if entry is not None:
                    out.append((p, y, c, int(entry["size"])))
    return out


def fetch(years: Iterable[int], regions: Iterable[str] = tuple(REGION_COUNTRY), products: Iterable[str] = tuple(PRODUCTS),
          cache_dir: Path = FIRMS_CACHE_DIR, opener: Opener = _default_opener, cap_bytes: int = DISK_CAP_BYTES,
          force: bool = False, log: Callable[[str], None] = print, pause_s: float = PAUSE_BETWEEN_FILES_S) -> list[dict[str, Any]]:
    """Download and ingest the country files for ``years``. Refuses to start when the cache would pass ``cap_bytes``."""
    regions, products = list(regions), list(products)
    log(f"FIRMS_MAP_KEY {map_key_state()}; route: country yearly summary files (no key needed)")
    listing = fetch_listing(cache_dir, opener)
    todo = []
    for p, y, c, size in plan(years, regions, products, listing):
        if not force and (read_manifest(raw_path(p, y, c, cache_dir)) or {}).get("bytes") == size:
            continue
        todo.append((p, y, c, size))
    projected = disk_usage(cache_dir) + sum(s for *_, s in todo)
    if projected > cap_bytes:
        raise RuntimeError(f"the cache would reach {projected} bytes, over the cap of {cap_bytes}; ask before raising it")
    log(f"{len(todo)} files to fetch, {sum(s for *_, s in todo)} bytes; cache after: {projected} bytes")
    done = []
    for i, (p, y, c, size) in enumerate(todo):
        url = country_file_url(p, y, c)
        t0 = time.perf_counter()
        n, sha = download(url, raw_path(p, y, c, cache_dir), opener, expected_bytes=size)
        m = ingest(p, y, c, url, n, sha, _now_utc(), listing.get(country_file_name(p, y, c)), cache_dir)
        log(f"[{i + 1}/{len(todo)}] {country_file_name(p, y, c)}: {n} bytes, {m['rows']} rows, "
            f"{time.perf_counter() - t0:.1f} s")
        done.append(m)
        if pause_s and i + 1 < len(todo):
            time.sleep(pause_s)
    return done


# The reader


def _norm_time(t: str) -> str:
    return t.strip().zfill(4)


def _as_utc(v: str | _dt.date | _dt.datetime) -> _dt.datetime:
    if isinstance(v, _dt.datetime):
        return v if v.tzinfo else v.replace(tzinfo=_dt.timezone.utc)
    if isinstance(v, _dt.date):
        return _dt.datetime(v.year, v.month, v.day, tzinfo=_dt.timezone.utc)
    return _as_utc(_dt.datetime.fromisoformat(str(v).replace("Z", "+00:00")))


def read_firms(
    box: tuple[float, float, float, float],
    start: str | _dt.date | _dt.datetime,
    end: str | _dt.date | _dt.datetime,
    platforms: Iterable[str] | None = None,
    cache_dir: Path = FIRMS_CACHE_DIR,
) -> list[dict[str, str]]:
    """Every cached FIRMS row inside ``box`` (west, south, east, north; edges included) acquired in [start, end) UTC.

    Each row is a dict of every original column and its value, exactly as the source wrote it, plus three
    derived keys: ``_platform`` (Terra, Aqua, Suomi NPP, NOAA-20), ``_product`` (the source file family) and
    ``_acq_utc`` (ISO 8601). ``platforms`` limits the rows to those platform names. Rows are sorted by acquisition
    time. Raises FirmsCacheMissing when the box leaves every cached region box or a needed file is not cached yet;
    a product the source does not publish for a year is not an error.
    """
    t0, t1 = _as_utc(start), _as_utc(end)
    w, s, e, n = box
    want = set(platforms) if platforms is not None else None
    regions = [r for r in REGION_COUNTRY if _box_within(box, region_box(r))]
    if not regions:
        raise FirmsCacheMissing(f"box {box} is not inside any cached region box {[region_box(r) for r in REGION_COUNTRY]}")
    listing = load_listing(cache_dir)
    if not listing:
        raise FirmsCacheMissing("no FIRMS listing cached; run the fetch first")
    out: list[dict[str, str]] = []
    seen: set[tuple[str, ...]] = set()
    for r in regions:
        for p in PRODUCTS:
            for y in range(t0.year, (t1 - _dt.timedelta(microseconds=1)).year + 1):
                if country_file_name(p, y, REGION_COUNTRY[r]) not in listing:
                    continue  # the source publishes no such file
                path = extract_path(r, p, y, cache_dir)
                if not path.is_file():
                    raise FirmsCacheMissing(f"{path.relative_to(cache_dir)} not cached; fetch {y} first")
                with path.open(encoding="utf-8", newline="") as fh:
                    for row in csv.DictReader(fh):
                        lat, lon = float(row["latitude"]), float(row["longitude"])
                        if not (w <= lon <= e and s <= lat <= n):
                            continue
                        hhmm = _norm_time(row["acq_time"])
                        ts = _dt.datetime.fromisoformat(f"{row['acq_date']}T{hhmm[:2]}:{hhmm[2:]}:00+00:00")
                        if not (t0 <= ts < t1):
                            continue
                        plat = _platform(p, row["satellite"])
                        if want is not None and plat not in want:
                            continue
                        k = tuple(row[f] for f in DEDUP_FIELDS)
                        if k in seen:
                            continue
                        seen.add(k)
                        row["_platform"] = plat
                        row["_product"] = p
                        row["_acq_utc"] = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
                        out.append(row)
    out.sort(key=lambda d: (d["_acq_utc"], d["_platform"], d["latitude"], d["longitude"]))
    return out


def _box_within(inner: tuple[float, float, float, float], outer: tuple[float, float, float, float]) -> bool:
    return outer[0] <= inner[0] and outer[1] <= inner[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


# Counts for the server


def cache_summary(cache_dir: Path = FIRMS_CACHE_DIR) -> dict[str, Any]:
    """Row counts from the manifests: rows as downloaded and rows inside each region box (after dedup)."""
    downloaded = 0
    files = 0
    for m in (cache_dir / "raw").rglob("*.csv.manifest.json") if (cache_dir / "raw").is_dir() else []:
        try:
            downloaded += int(json.loads(m.read_text(encoding="utf-8"))["rows"])
            files += 1
        except (OSError, ValueError, KeyError):
            continue
    in_boxes: dict[str, dict[str, int]] = {}
    for m in (cache_dir / "extract").rglob("*.csv.manifest.json") if (cache_dir / "extract").is_dir() else []:
        try:
            d = json.loads(m.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        reg = in_boxes.setdefault(d["region_id"], {})
        for plat, k in (d.get("platform_rows") or {}).items():
            reg[plat] = reg.get(plat, 0) + int(k)
    return {"downloaded_rows": downloaded, "downloaded_files": files, "rows_in_region_boxes": in_boxes}


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Fetch and inspect the NASA FIRMS cache for the hero regions.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="download and ingest country yearly files")
    f.add_argument("--years", required=True, help="e.g. 2021 or 2000-2025")
    f.add_argument("--regions", nargs="*", default=list(REGION_COUNTRY))
    f.add_argument("--products", nargs="*", default=list(PRODUCTS))
    f.add_argument("--force", action="store_true")
    sub.add_parser("status", help="print cache counts")
    args = ap.parse_args(argv)
    if args.cmd == "fetch":
        a, _, b = args.years.partition("-")
        years = range(int(a), int(b or a) + 1)
        fetch(years, args.regions, args.products, force=args.force)
    print(json.dumps({**cache_summary(), "disk_bytes": disk_usage()}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
