"""The steps of the fresh test on the shared store of FIRMS country files (the protocol is `fresh_test.py`).

  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.fresh_world plan \
      [--store DIR] [--work DIR] [--workers N] [--out FILE]

`plan` reads the MODIS country files of the protocol's years and nothing else. It opens no file of a sharp satellite:
every path it reads is built from the product name `modis`, and a test fails if any other file is opened. Pass one
splits each MODIS file into the places its rows fall in (a row on the line between two places goes to both, as a
box takes its edges); pass two runs the episode rule in use at every place that has a role; then the protocol's
choice gives each role its episodes. The plan names every file read with the sha256 of the bytes read.

The store is `$ISOGON_WORLD_DIR` (as the cube reads it), else `data/cache/world` under the repository; its country
files are in `firms/raw/<product>/<year>/<product>_<year>_<Country>.csv`, and `firms/READY.json` lists the countries
whose files are complete.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time
from types import SimpleNamespace
from typing import Any, Callable, Iterable

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.model import fresh_test as F  # noqa: E402
from backend.model.episodes import find_episodes  # noqa: E402

STORE_ENV: str = "ISOGON_WORLD_DIR"
WORK_DEFAULT: Path = _REPO_ROOT / "data" / "cache" / "fresh_world"
PLAN_FILE: Path = Path(__file__).resolve().parent / "fitted_values" / "fresh_world_plan.json"
VISIBLE_PRODUCT: str = "modis"
# A place-year with fewer MODIS rows than this cannot hold a tile that meets the episode rule's least number of
# pixels (find_episodes, min_modis_pixels), so it is not looked at further. It changes no episode.
LEAST_ROWS: int = 60


def store_dir(given: str | Path | None = None) -> Path:
    if given is not None:
        return Path(given)
    env = os.environ.get(STORE_ENV)
    return Path(env) if env else _REPO_ROOT / "data" / "cache" / "world"


def ready_countries(store: Path) -> list[dict[str, Any]]:
    """The countries READY.json lists, each with its digest."""
    path = store / "firms" / "READY.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    return [{"country": c["country"], "digest": c["digest"]} for c in doc["countries"]]


def listed_countries(store: Path) -> list[str]:
    """Every country FIRMS's listing has a yearly file for."""
    path = store / "firms" / "listing" / "yearly_summary_files.txt"
    out: set[str] = set()
    with path.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            name = row["filename"]
            if not name.endswith(".csv"):
                continue
            parts = name[: -len(".csv")].split("_", 2)
            if len(parts) == 3 and parts[1].isdigit():
                out.add(parts[2])
    return sorted(out)


def modis_file(store: Path, year: int, country: str) -> Path:
    """The path of a MODIS country file. The product is fixed here: no other product's path is built."""
    return store / "firms" / "raw" / VISIBLE_PRODUCT / str(int(year)) / f"{VISIBLE_PRODUCT}_{int(year)}_{country}.csv"


def _places_of(lon: float, lat: float) -> list[tuple[int, int]]:
    """The places a row lies in: the one holding it and, on the line between two places, the other one too."""
    x, y = (lon + 180.0) / F.PLACE_DEG, (lat + 90.0) / F.PLACE_DEG
    i0, j0 = F.place_of(lon, lat)
    cols = [i0] + ([i0 - 1] if x == math.floor(x) and 0 < i0 and x < 360.0 / F.PLACE_DEG else [])
    rows = [j0] + ([j0 - 1] if y == math.floor(y) and 0 < j0 and y < 180.0 / F.PLACE_DEG else [])
    return [(i, j) for i in cols for j in rows]


def _split_one(job: tuple[str, int, str, str]) -> dict[str, Any]:
    """Pass one for one MODIS file: its rows by place, written as shards `<work>/<year>/<place>/<country>.csv`."""
    path_s, year, country, work_s = job
    path, work = Path(path_s), Path(work_s)
    if path.parent.parent.name != VISIBLE_PRODUCT:
        raise ValueError(f"the plan reads MODIS files only, not {path}")
    data = path.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    lines = data.decode("utf-8").splitlines()
    out = {"file": f"{VISIBLE_PRODUCT}/{year}/{path.name}", "sha256": sha, "rows_read": 0, "rows_kept": 0,
           "rows_left_out_by_type": {}, "malformed_rows": 0, "places": 0}
    if not lines:
        return out
    header = lines[0]
    cols = header.split(",")
    ix, iy = cols.index("longitude"), cols.index("latitude")
    it = cols.index("type") if "type" in cols else None
    shards: dict[tuple[int, int], list[str]] = {}
    for line in lines[1:]:
        if not line:
            continue
        out["rows_read"] += 1
        v = line.split(",")
        if len(v) != len(cols):
            out["malformed_rows"] += 1
            continue
        if it is not None and v[it] in F.LEFT_OUT_TYPES:
            out["rows_left_out_by_type"][v[it]] = out["rows_left_out_by_type"].get(v[it], 0) + 1
            continue
        out["rows_kept"] += 1
        for place in _places_of(float(v[ix]), float(v[iy])):
            shards.setdefault(place, []).append(line)
    for place, rows in shards.items():
        dest = work / str(year) / F.place_id(place) / f"{country}.csv"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(header + "\n" + "\n".join(rows) + "\n", encoding="utf-8")
    out["places"] = len(shards)
    return out


def _read_shards(folder: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for f in sorted(folder.glob("*.csv")):
        with f.open(encoding="utf-8", newline="") as fh:
            rows.extend(csv.DictReader(fh))
    return rows


def _episodes_of_place(job: tuple[str, tuple[int, int], tuple[int, ...]]) -> tuple[str, list[dict[str, Any]], dict[str, int]]:
    """Pass two for one place: the episode rule in use, year by year, on the place's MODIS rows."""
    work_s, place, years = job
    pid = F.place_id(place)
    w, s, e, n = F.place_box(place)
    preset = {pid: SimpleNamespace(bbox=SimpleNamespace(west=w, south=s, east=e, north=n))}
    found: list[dict[str, Any]] = []
    rows_by_year: dict[str, int] = {}
    for year in years:
        rows = _read_shards(Path(work_s) / str(year) / pid)
        rows_by_year[str(year)] = len(rows)
        if len(rows) < LEAST_ROWS:
            continue

        def read(box: Any, start: Any, end: Any, platforms: Any = None, _rows: list[dict[str, str]] = rows) -> list[dict[str, str]]:
            return _rows

        for ep in find_episodes((year,), read, lambda _r: (w, s, e, n), preset, regions=(pid,), hidden="VIIRS"):
            d = ep.as_dict()
            d.pop("region_id", None)
            found.append({**d, "place_id": pid, "key": f"{pid}:{year}:{ep.tile[0]}{ep.tile[1]}",
                          "start_s": float(ep.window.start_s), "end_s": float(ep.window.end_s)})
    return pid, found, rows_by_year


def _map(fn: Callable[[Any], Any], jobs: list[Any], workers: int) -> list[Any]:
    if workers <= 1:
        return [fn(j) for j in jobs]
    with ProcessPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(fn, jobs, chunksize=1))


def build_plan(store: Path, work: Path, workers: int, first_boxes: Iterable[F.Box], log: Callable[[str], None] = print,
               years: Iterable[int] | None = None, offered: Iterable[dict[str, Any]] = ()) -> dict[str, Any]:
    """The plan of the fresh test from the store's MODIS files alone. `offered` holds the regions the page offers,
    each `{"region_id", "context_box"}`: a place of validation, test A or test B that meets one is left out."""
    years = tuple(F.YEARS if years is None else years)
    first_boxes = list(first_boxes)
    offered = sorted(({"region_id": str(o["region_id"]), "context_box": [float(v) for v in o["context_box"]],
                       "from": o.get("from")} for o in offered), key=lambda o: o["region_id"])
    offered_boxes = [tuple(o["context_box"]) for o in offered]
    t0 = time.time()
    ready = ready_countries(store)
    listed = listed_countries(store)
    have = {c["country"] for c in ready}
    jobs = []
    for year in years:
        for c in sorted(have):
            path = modis_file(store, year, c)
            if path.is_file():
                jobs.append((str(path), year, c, str(work)))
    log(f"pass one: {len(jobs)} MODIS files of {len(have)} countries")
    files = _map(_split_one, jobs, workers)
    t1 = time.time()
    log(f"pass one done in {t1 - t0:.0f} s: {sum(f['rows_read'] for f in files)} rows read")
    places: dict[str, dict[str, Any]] = {}
    jobs2 = []
    for year_dir in sorted(p for p in work.iterdir() if p.is_dir() and p.name.isdigit() and int(p.name) in years):
        for pdir in year_dir.iterdir():
            places.setdefault(pdir.name, {})
    by_id = {F.place_id((i, j)): (i, j) for i in range(int(round(360.0 / F.PLACE_DEG))) for j in range(int(round(180.0 / F.PLACE_DEG)))}
    described = {pid: F.describe_place(by_id[pid], first_boxes, offered_boxes) for pid in sorted(places)}
    for pid, info in described.items():
        if info["role"] is not None:
            jobs2.append((str(work), by_id[pid], years))
    log(f"pass two: {len(jobs2)} places with a role, of {len(described)} with rows")
    results = _map(_episodes_of_place, jobs2, workers)
    found_by_place = {pid: found for pid, found, _ in results}
    rows_by_place = {pid: rows for pid, _, rows in results}
    chosen = F.choose(found_by_place, described)
    log(f"pass two done in {time.time() - t1:.0f} s: {sum(len(v) for v in found_by_place.values())} episodes found")
    counts = {role: {cont: sum(1 for ep in chosen[role] if ep["continent"] == cont) for cont in F.CONTINENTS}
              for role in F.ROLES}
    with_episodes = sorted(pid for pid, found in found_by_place.items() if found)
    doc = {
        "what": "the plan of the fresh test across the world: places, roles and episodes, from MODIS rows alone",
        "protocol_id": F.PROTOCOL_ID,
        "protocol_sha256": F.protocol_sha256(),
        "years": list(years),
        "store": {
            "countries_read": ready,
            "countries_listed_by_firms": len(listed),
            "countries_left_out": sorted(set(listed) - have),
        },
        "modis_files": sorted(files, key=lambda f: f["file"]),
        "offered_regions": {
            "regions": offered,
            "rule": F.PROTOCOL["offered_regions"],
            "places_it_costs": F.offered_cost(first_boxes, offered_boxes),
            "places_with_rows_it_costs": {
                r: sum(1 for d in described.values() if d["left_out"] == "meets a region the page offers"
                       and F.role_of_block(tuple(d["block"])) == r) for r in F.ROLES},
        },
        "places": {
            "with_rows": len(described),
            "with_a_role": sum(1 for d in described.values() if d["role"] is not None),
            "by_role": {r: sum(1 for d in described.values() if d["role"] == r) for r in F.ROLES},
            "with_an_episode": {pid: {**described[pid], "modis_rows_by_year": rows_by_place[pid],
                                      "episodes_found": len(found_by_place[pid])} for pid in with_episodes},
        },
        "episodes_found": sum(len(v) for v in found_by_place.values()),
        "counts": counts,
        "episodes": chosen,
    }
    return doc


def offered_regions(named: str | Path | None = None) -> list[dict[str, Any]]:
    """The regions the page offers: every region of the registry of places, by its context box, and every region
    in the file the data side's list was copied into (`named`), when given."""
    from backend.firms import region_box
    from backend.firms.places import PLACES_FILE

    out = {}
    for r in json.loads(Path(PLACES_FILE).read_text(encoding="utf-8"))["regions"]:
        out[r] = {"region_id": r, "context_box": list(region_box(r)), "from": "the registry of places"}
    if named is not None:
        for o in json.loads(Path(named).read_text(encoding="utf-8")):
            out.setdefault(o["region_id"], {"region_id": o["region_id"], "context_box": [float(v) for v in o["context_box"]],
                                            "from": "the data side's list of regions for the page"})
    return list(out.values())


def write_plan(doc: dict[str, Any], out: Path = PLAN_FILE) -> str:
    """Write the plan with its digest; the digest covers everything in it but itself."""
    sha = F.plan_sha256(doc)
    out.write_text(json.dumps({**doc, "plan_sha256": sha}, indent=1, sort_keys=False) + "\n", encoding="utf-8")
    return sha


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="the fresh test across the world")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan", help="choose the places, roles and episodes from MODIS rows alone")
    p.add_argument("--store", default=None)
    p.add_argument("--work", default=str(WORK_DEFAULT))
    p.add_argument("--workers", type=int, default=16)
    p.add_argument("--out", default=str(PLAN_FILE))
    p.add_argument("--offered", default=None,
                   help="a JSON list of the regions the data side has named for the page, each {region_id, context_box}")
    args = ap.parse_args(argv)
    if args.cmd == "plan":
        from backend.firms import region_box

        work = Path(args.work)
        if work.exists() and any(work.iterdir()):
            raise SystemExit(f"{work} is not empty: the plan's shards are written into an empty folder")
        work.mkdir(parents=True, exist_ok=True)
        doc = build_plan(store_dir(args.store), work, args.workers, [region_box(r) for r in F.FIRST_REGIONS],
                         offered=offered_regions(args.offered))
        sha = write_plan(doc, Path(args.out))
        print(json.dumps({"plan_sha256": sha, "counts": doc["counts"], "episodes_found": doc["episodes_found"],
                          "countries_left_out": len(doc["store"]["countries_left_out"])}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
