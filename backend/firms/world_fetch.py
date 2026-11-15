"""Every country's NASA FIRMS yearly files in one shared store, fetched in a fixed order, resumable and verified.

The store has the layout of the repository's FIRMS cache (backend/firms/archive.py), with the manifest beside every
file as archive.py writes it:

  <store>/listing/yearly_summary_files.txt     the source's listing, fetched fresh at the start of a run
  <store>/raw/<product>/<year>/<file>.csv      each country file exactly as downloaded, with <file>.manifest.json
  <store>/READY.md, READY.json                 one line per country once every one of its files is complete and
                                               verified (bytes equal the listing, sha256 equal the manifest)
  <store>/PROGRESS.json                        files and bytes done, in flight and failed

Countries already in the repository cache are cloned from it (an APFS copy-on-write clone) instead of fetched, so the
store holds the same bytes the calendar counted. The rest are fetched in the order of ``order()``: the countries of
FIRST_COUNTRIES first, then every other country from the smallest total size up. At most MAX_CONNECTIONS files are
fetched at a time, each worker pauses between files, a failed file is retried by archive.download and then queued
again after a longer pause.

The store is found from ``--store``, else the ISOGON_WORLD_DIR environment variable (its ``firms`` folder), else
``data/cache/world/firms`` under the repository.

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/world_fetch.py fetch --store <dir>
  ... plan --store <dir>
  ... status --store <dir>
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import multiprocessing as mp
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any, Callable, Iterable
import urllib.request

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms import archive  # noqa: E402

# Another part of the work waits for these, so they come first, in this order.
FIRST_COUNTRIES: tuple[str, ...] = ("Portugal", "Chile", "Sweden", "South_Africa", "Kazakhstan", "Ghana")
CAP_BYTES: int = 120_000_000_000
MAX_CONNECTIONS: int = 4
CLIENT_NAME: str = "data-client/1.0"
PAUSE_BETWEEN_FILES_S: float = 1.0
PAUSE_BEFORE_REQUEUE_S: float = 60.0
REQUEUE_ROUNDS: int = 3
PRODUCTS: tuple[str, ...] = ("modis", "viirs-snpp", "viirs-jpss1")  # the products the country files publish

Task = tuple[str, int, str, int]  # product, year, country, listed bytes


def world_dir() -> Path:
    v = os.environ.get("ISOGON_WORLD_DIR", "").strip()
    return Path(v).expanduser() if v else _REPO_ROOT / "data" / "cache" / "world"


def default_store() -> Path:
    return world_dir() / "firms"


def _now_utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _opener(url: str) -> Any:
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": CLIENT_NAME}), timeout=180)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            b = fh.read(1 << 22)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def tasks_by_country(listing: dict[str, dict[str, Any]]) -> dict[str, list[Task]]:
    """{country: [(product, year, country, bytes)]} for every country file the listing publishes."""
    out: dict[str, list[Task]] = {}
    for name, entry in listing.items():
        product, year, country = archive._split_name(name)
        if country is None or product not in PRODUCTS:
            continue
        out.setdefault(country, []).append((product, int(year), country, int(entry["size"])))
    for c in out:
        out[c].sort(key=lambda t: (PRODUCTS.index(t[0]), t[1]))
    return out


def order(by_country: dict[str, list[Task]], first: Iterable[str] = FIRST_COUNTRIES) -> list[str]:
    """FIRST_COUNTRIES in their order, then every other country from the smallest total size up (name breaks ties)."""
    first = [c for c in first if c in by_country]
    rest = sorted((c for c in by_country if c not in first), key=lambda c: (sum(t[3] for t in by_country[c]), c))
    return first + rest


def verified(task: Task, store: Path) -> dict[str, Any] | None:
    """The manifest of a stored file whose bytes equal the listing and whose sha256 equals its manifest, else None."""
    product, year, country, size = task
    path = archive.raw_path(product, year, country, store)
    man = archive.read_manifest(path)
    if man is None or not path.is_file() or path.stat().st_size != size or int(man.get("bytes", -1)) != size:
        return None
    if _sha256(path) != man.get("sha256"):
        return None
    return man


def _worker_init() -> None:
    # The store keeps raw files and their manifests only. archive.ingest also writes an extract for every hero region
    # of the country; with no region named, it writes the raw manifest alone. This changes this worker process only.
    archive.REGION_COUNTRY.clear()


def _work(job: tuple[Task, str]) -> tuple[str, Task, dict[str, Any] | str]:
    task, store_s = job
    store = Path(store_s)
    product, year, country, size = task
    try:
        man = verified(task, store)
        if man is not None:
            return "kept", task, {"rows": man.get("rows"), "sha256": man.get("sha256"), "bytes": size}
        url = archive.country_file_url(product, year, country)
        n, sha = archive.download(url, archive.raw_path(product, year, country, store), _opener, expected_bytes=size)
        listing = archive.load_listing(store)
        m = archive.ingest(product, year, country, url, n, sha, _now_utc(),
                           listing.get(archive.country_file_name(product, year, country)), store)
        time.sleep(PAUSE_BETWEEN_FILES_S)
        return "fetched", task, {"rows": m["rows"], "sha256": sha, "bytes": n, "malformed_rows": m["malformed_rows"]}
    except Exception as exc:  # reported, queued again by the main process
        return "failed", task, f"{type(exc).__name__}: {exc}"


def clone_from_repo_cache(countries: Iterable[str], store: Path, by_country: dict[str, list[Task]],
                          src_cache: Path = archive.FIRMS_CACHE_DIR, log: Callable[[str], None] = print) -> dict[str, Any]:
    """APFS clone (cp -c) of every file of ``countries`` the repository cache holds, with its manifest. Returns
    {country: {"cloned": n, "missing": [..], "listing_size_differs": [..]}}."""
    out: dict[str, Any] = {}
    for c in countries:
        rec = {"cloned": 0, "missing": [], "listing_size_differs": []}
        for product, year, country, size in by_country.get(c, []):
            src = archive.raw_path(product, year, country, src_cache)
            dst = archive.raw_path(product, year, country, store)
            if not (src.is_file() and archive.read_manifest(src) is not None):
                rec["missing"].append(src.name)
                continue
            if src.stat().st_size != size:
                rec["listing_size_differs"].append(src.name)
            dst.parent.mkdir(parents=True, exist_ok=True)
            for a, b in ((src, dst), (src.with_name(src.name + ".manifest.json"), dst.with_name(dst.name + ".manifest.json"))):
                if b.is_file() and b.stat().st_size == a.stat().st_size:
                    continue
                subprocess.run(["cp", "-c", str(a), str(b)], check=True)
            rec["cloned"] += 1
        out[c] = rec
        log(f"cloned {c}: {rec['cloned']} files from the repository cache"
            + (f"; not there: {len(rec['missing'])}" if rec["missing"] else ""))
    return out


def repo_cached_countries(src_cache: Path = archive.FIRMS_CACHE_DIR) -> list[str]:
    base = src_cache / "raw"
    found = set()
    for p in base.rglob("*.csv.manifest.json") if base.is_dir() else []:
        _, _, c = archive._split_name(p.name[: -len(".manifest.json")])
        if c:
            found.add(c)
    return sorted(found)


def _store_bytes(store: Path) -> int:
    total = 0
    for root, _, files in os.walk(store):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _write_json(path: Path, obj: Any) -> None:
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(json.dumps(obj, indent=1) + "\n", encoding="utf-8")
    tmp.replace(path)


def ready_digest(entries: list[dict[str, Any]]) -> str:
    """sha256 over the name and sha256 of every file of a country, in order: it changes when any file does."""
    h = hashlib.sha256()
    for e in sorted(entries, key=lambda e: e["file"]):
        h.update(f"{e['file']}={e['sha256']};".encode("utf-8"))
    return h.hexdigest()


def write_ready(store: Path, ready: list[dict[str, Any]]) -> None:
    lines = [
        "# FIRMS countries ready in this store",
        "",
        "One line per country whose every yearly file is complete and verified: its bytes equal the FIRMS listing",
        "and its sha256 equals the manifest beside it. Clone a ready country into a cache with",
        "`cp -c` of its files under raw/ and their manifests. The digest is sha256 over each file name and sha256.",
        "",
        "```",
        f"{'country':<36}{'files':>6}{'bytes':>14}{'rows':>12}  {'years':<10}  {'how':<7}  digest",
    ]
    for r in ready:
        lines.append(f"{r['country']:<36}{r['files']:>6}{r['bytes']:>14}{r['rows']:>12}  {r['years']:<10}  "
                     f"{r['how']:<7}  {r['digest']}")
    lines += ["```", ""]
    tmp = store / ".READY.md.tmp"
    tmp.write_text("\n".join(lines), encoding="utf-8")
    tmp.replace(store / "READY.md")
    _write_json(store / "READY.json", {"countries": ready})


def fetch(store: Path, countries: Iterable[str] | None = None, cap_bytes: int = CAP_BYTES,
          connections: int = MAX_CONNECTIONS, log: Callable[[str], None] = print) -> dict[str, Any]:
    store.mkdir(parents=True, exist_ok=True)
    log(f"store {store}; client {CLIENT_NAME}; at most {connections} connections")
    listing = archive.fetch_listing(store, _opener)
    by_country = tasks_by_country(listing)
    seq = order(by_country)
    if countries is not None:
        want = list(countries)
        unknown = [c for c in want if c not in by_country]
        if unknown:
            raise ValueError(f"not in the FIRMS listing: {unknown}")
        seq = [c for c in seq if c in want]
    cloned_names = [c for c in repo_cached_countries() if c in seq]
    clones = clone_from_repo_cache(cloned_names, store, by_country, log=log)
    remaining = sum(t[3] for c in seq for t in by_country[c]
                    if not archive.raw_path(t[0], t[1], t[2], store).is_file())
    used = _store_bytes(store)
    if used + remaining > cap_bytes:
        raise RuntimeError(f"the store would reach {used + remaining} bytes, over the cap of {cap_bytes}")
    log(f"{len(seq)} countries, {sum(len(by_country[c]) for c in seq)} files; store {used} bytes, "
        f"up to {remaining} bytes to fetch, cap {cap_bytes}")

    ready: list[dict[str, Any]] = []
    old = store / "READY.json"
    if old.is_file():
        try:
            ready = [r for r in json.loads(old.read_text(encoding="utf-8"))["countries"] if r["country"] in by_country]
        except (OSError, ValueError, KeyError):
            ready = []
    ready_names = {r["country"] for r in ready}
    pending: dict[str, int] = {c: len(by_country[c]) for c in seq}
    done_files: dict[str, list[dict[str, Any]]] = {c: [] for c in seq}
    failed: dict[Task, str] = {}
    stats = {"fetched": 0, "kept": 0, "failed": 0, "fetched_bytes": 0}
    t_start = time.time()

    def progress(final: bool = False) -> None:
        _write_json(store / "PROGRESS.json", {
            "updated_utc": _now_utc(), "finished": final, "countries": len(seq), "countries_ready": len(ready),
            "files": sum(len(by_country[c]) for c in seq), **stats,
            "seconds": round(time.time() - t_start, 1),
            "failed_files": {archive.country_file_name(t[0], t[1], t[2]): e for t, e in failed.items()},
            "cloned_from_repository_cache": clones,
        })

    def settle(status: str, task: Task, info: Any) -> None:
        product, year, country, size = task
        name = archive.country_file_name(product, year, country)
        if status == "failed":
            failed[task] = str(info)
            stats["failed"] += 1
            log(f"FAILED {name}: {info}")
            return
        failed.pop(task, None)
        stats[status] += 1
        if status == "fetched":
            stats["fetched_bytes"] += int(info["bytes"])
            log(f"{name}: {info['bytes']} bytes, {info['rows']} rows")
        done_files[country].append({"file": name, "sha256": info["sha256"], "rows": int(info.get("rows") or 0),
                                    "bytes": int(info["bytes"]), "year": year})
        pending[country] -= 1
        if pending[country] == 0 and country not in ready_names:
            files = done_files[country]
            ready.append({
                "country": country, "files": len(files), "bytes": sum(f["bytes"] for f in files),
                "rows": sum(f["rows"] for f in files),
                "years": f"{min(f['year'] for f in files)}-{max(f['year'] for f in files)}",
                "how": "cloned" if country in clones else "fetched", "digest": ready_digest(files),
                "ready_utc": _now_utc(),
            })
            ready_names.add(country)
            write_ready(store, ready)
            log(f"READY {country}: {len(files)} files")
        elif pending[country] == 0:
            # Already listed by an earlier run; the line is refreshed in case a file changed since.
            for r in ready:
                if r["country"] == country:
                    r["digest"] = ready_digest(done_files[country])
            write_ready(store, ready)

    # A cloned file is kept as the repository cache holds it (the bytes the calendar counted), even where the listing
    # now gives another size; it is verified against its own manifest.
    jobs: list[Task] = []
    for c in seq:
        for t in by_country[c]:
            if c in clones:
                man = archive.read_manifest(archive.raw_path(t[0], t[1], t[2], store)) or {}
                if man.get("bytes") is not None:
                    t = (t[0], t[1], t[2], int(man["bytes"]))
            jobs.append(t)
    ctx = mp.get_context("spawn")
    with ctx.Pool(connections, initializer=_worker_init) as pool:
        for rnd in range(REQUEUE_ROUNDS + 1):
            if rnd:
                jobs = list(failed)
                if not jobs:
                    break
                log(f"round {rnd + 1}: {len(jobs)} failed files again after {PAUSE_BEFORE_REQUEUE_S:.0f} s")
                time.sleep(PAUSE_BEFORE_REQUEUE_S)
            for i, (status, task, info) in enumerate(pool.imap(_work, [(t, str(store)) for t in jobs], chunksize=1)):
                settle(status, task, info)
                if i % 10 == 0:
                    progress()
    write_ready(store, ready)
    progress(final=True)
    log(f"done: {stats}; {len(ready)} of {len(seq)} countries ready; {len(failed)} files failed")
    return {"stats": stats, "ready": len(ready), "countries": len(seq), "failed": len(failed)}


def status(store: Path) -> dict[str, Any]:
    listing = archive.load_listing(store)
    by_country = tasks_by_country(listing)
    have = sum(1 for c in by_country for t in by_country[c]
               if archive.read_manifest(archive.raw_path(t[0], t[1], t[2], store)) is not None)
    ready = []
    if (store / "READY.json").is_file():
        ready = json.loads((store / "READY.json").read_text(encoding="utf-8"))["countries"]
    return {"store": str(store), "countries_listed": len(by_country),
            "files_listed": sum(len(v) for v in by_country.values()),
            "bytes_listed": sum(t[3] for v in by_country.values() for t in v), "files_with_manifest": have,
            "countries_ready": len(ready), "store_bytes": _store_bytes(store)}


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Fetch every country's FIRMS yearly files into one shared store.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("fetch", "plan", "status"):
        p = sub.add_parser(name)
        p.add_argument("--store", type=Path, default=None, help="the store's firms folder")
        if name != "status":
            p.add_argument("--countries", nargs="*", default=None, help="names as in the listing; default: all")
    args = ap.parse_args(argv)
    store = (args.store or default_store()).expanduser().resolve()
    if args.cmd == "status":
        print(json.dumps(status(store), indent=1))
        return 0
    if args.cmd == "plan":
        listing = archive.load_listing(store) or archive.load_listing(archive.FIRMS_CACHE_DIR)
        by_country = tasks_by_country(listing)
        seq = order(by_country)
        if args.countries:
            seq = [c for c in seq if c in args.countries]
        for i, c in enumerate(seq):
            print(f"{i + 1:>4}  {c:<40}{len(by_country[c]):>4} files {sum(t[3] for t in by_country[c]):>14} bytes")
        return 0
    fetch(store, args.countries, log=lambda s: print(f"{_now_utc()} {s}", flush=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
