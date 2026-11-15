"""Test C of the fresh test: places and years no step of the fresh test has read, for one look at the tree player.

  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.fresh_world_c plan \
      [--store DIR] [--work DIR] [--workers N] [--out FILE]
  ... python3 -m backend.model.fresh_world_c rows    [--store DIR] [--work DIR] [--workers N]
  ... python3 -m backend.model.fresh_world_c passes  [--work DIR] [--threads N]

The places. A place of the fresh test's grid (`fresh_test.place_box`) that holds MODIS rows and that the plan gave no
role because it is a place of a validation or test block next to a place of another role (`fresh_test.why_left_out`).
Left out as well: any such place that meets, edges and corners touching included, the context box of a region of
the registry of places when this plan is made, of a region the fresh test's plan names as offered by the page, or
of one of the three first regions. The three first regions hold the three closed 2021 test fires and the
environment's episodes on them, so no place of test C meets them.

The years are 2023, 2024 and 2025. Every episode the fresh test read at its own places is of 2018 to 2022, the other
episodes its refit read lie in the three first regions, and its rows step kept rows of the chosen episodes and
counted months at the chosen places only, so no row of a test C place was kept by it.

The episodes, by the fresh test's rule in use from MODIS rows alone: `find_episodes` with its defaults at each place
and year; per place the busiest episode of each year, of those the two busiest (`fresh_test.per_place`); per
continent up to `QUOTA`, round the zones (`fresh_test.take_round_the_zones`). With fewer than `LEAST_FIRES` episodes
there is no fair test and nothing is looked at.

The hidden platforms are Suomi NPP and NOAA-20, the two whose rows the store's country files hold. NOAA-21 flew from
2023 but its rows are not in those files, so its passes are not asked for and its detections are neither shown nor
scored (`KeptPlatforms`).

`plan` opens MODIS files only (`fresh_world.modis_file`), and it is committed before any file of a sharp satellite of
these years is opened. `rows` and `passes` read the plan on record and refuse one whose digest does not match.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime as _dt
import hashlib
import json
from pathlib import Path
import sys
import time
from typing import Any, Callable, Iterable

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.model import fresh_test as F  # noqa: E402
from backend.model import fresh_world as W  # noqa: E402
from backend.model import fresh_world_run as R  # noqa: E402

PROTOCOL_ID: str = "fresh_world_test_c_v1"
ROLE: str = "test_c"
YEARS: tuple[int, ...] = (2023, 2024, 2025)
QUOTA: int = 40
LEAST_FIRES: int = 30
# The reason a place may be in test C: the fresh test's adjacency rule left it without a role.
LEFT_OUT_REASON: str = "next to a place of another role"
HIDDEN_PLATFORMS: tuple[str, ...] = ("VIIRS_SNPP", "VIIRS_NOAA20")
NOT_IN_STORE: str = "its rows are not in the store's country files, so it is neither shown nor scored"
# The sha256 of the protocol of the tree player and test C as written, before any fit or score.
WRITTEN_PROTOCOL_SHA256: str = "ec027f69ee1d3d47f96866f54c3fa77565ce638187d1fe2a36f36022e56c9726"
PLAN_FILE: Path = W.PLAN_FILE.with_name("fresh_world_test_c_plan.json")
WORK_DEFAULT: Path = _REPO_ROOT / "data" / "cache" / "fresh_world_c"

PROTOCOL: dict[str, str] = {
    "places": (
        "Places of the fresh test's grid holding MODIS rows that its plan left without a role because they are places "
        "of a validation or test block next to a place of another role. Not a place that meets, corners included, a "
        "context box of the registry of places when this plan is made, of a region the fresh test's plan names as "
        "offered, or of the three first regions."
    ),
    "years": "2023, 2024 and 2025: no episode the fresh test read is of these years.",
    "episodes": (
        "The fresh test's rule in use from MODIS rows alone: per place the busiest episode of each year, of those the "
        "two busiest; per continent up to 40, round the zones. Fewer than 30 episodes: no fair test, no look."
    ),
    "hidden": "Suomi NPP and NOAA-20. NOAA-21 is not in the store's country files and is neither asked for nor scored.",
    "player": (
        "The tree player (backend/env/tree_player.py), fitted on the fresh test's fitting episodes and chosen on its "
        "validation episodes, is measured once on these episodes beside least sure, the learned player in use, random "
        "and the player that sees the answer. It beats least sure only when the 90 percent interval of the mean of "
        "its round gain less least sure's, fires resampled whole 2,000 times, lies wholly above zero."
    ),
    "never": "Nothing is fitted or chosen from test C, and it is looked at once.",
}


def protocol_sha256() -> str:
    doc = {"protocol_id": PROTOCOL_ID, "role": ROLE, "years": list(YEARS), "quota": QUOTA, "least_fires": LEAST_FIRES,
           "left_out_reason": LEFT_OUT_REASON, "hidden_platforms": list(HIDDEN_PLATFORMS),
           "written_protocol_sha256": WRITTEN_PROTOCOL_SHA256, "protocol": PROTOCOL,
           "fresh_test_protocol_sha256": F.protocol_sha256()}
    return hashlib.sha256(json.dumps(doc, sort_keys=True).encode("utf-8")).hexdigest()


# ----------------------------------------------------------------------------------------------------------------
# The places: from coordinates alone
# ----------------------------------------------------------------------------------------------------------------


def why_not_test_c(place: tuple[int, int], first_boxes: Iterable[F.Box], plan_offered: Iterable[F.Box],
                   out_boxes: Iterable[F.Box]) -> str | None:
    """None when the place is a place of test C, else the reason it is not."""
    why = F.why_left_out(place, list(first_boxes), list(plan_offered))
    if why is None:
        return "it has a role in the fresh test"
    if why != LEFT_OUT_REASON:
        return why
    box = F.place_box(place)
    if any(F._meets(box, tuple(b)) for b in out_boxes):
        return "meets a region of the page, of the fresh test's plan or a first region"
    return None


def boxes_left_out(fresh_plan: dict[str, Any], registry: Iterable[dict[str, Any]], first_boxes: Iterable[F.Box]) -> list[dict[str, Any]]:
    """Every box a place of test C may not meet: the registry's now, the fresh plan's offered, the first regions'."""
    out: dict[str, dict[str, Any]] = {}
    for r in registry:
        out[r["region_id"]] = {"region_id": r["region_id"], "context_box": [float(v) for v in r["context_box"]],
                               "from": r.get("from") or "the registry of places"}
    for r in fresh_plan["offered_regions"]["regions"]:
        out.setdefault(r["region_id"], {"region_id": r["region_id"], "context_box": [float(v) for v in r["context_box"]],
                                        "from": "the fresh test's plan"})
    for rid, b in zip(F.FIRST_REGIONS, first_boxes):
        out.setdefault(rid, {"region_id": rid, "context_box": [float(v) for v in b], "from": "a first region"})
    return sorted(out.values(), key=lambda o: o["region_id"])


def choose(found_by_place: dict[str, list[dict[str, Any]]], places: dict[str, dict[str, Any]], quota: int = QUOTA) -> list[dict[str, Any]]:
    """Test C's episodes: per place the two busiest of the yearly busiest, per continent up to `quota` round the zones."""
    pool: dict[str, list[dict[str, Any]]] = {}
    for pid in sorted(found_by_place):
        info = places[pid]
        for ep in F.per_place(found_by_place[pid]):
            pool.setdefault(info["continent"], []).append(
                {**ep, "place_id": pid, "zone": info["zone"], "continent": info["continent"], "role": ROLE})
    out: list[dict[str, Any]] = []
    for cont in F.CONTINENTS:
        out += F.take_round_the_zones(pool.get(cont, []), quota)
    return out


def build_plan(store: Path, work: Path, workers: int, fresh_plan: dict[str, Any], registry: list[dict[str, Any]],
               first_boxes: list[F.Box], log: Callable[[str], None] = print, years: Iterable[int] = YEARS) -> dict[str, Any]:
    """Test C's plan from the store's MODIS files alone."""
    years = tuple(years)
    t0 = time.time()
    ready = W.ready_countries(store)
    have = {c["country"] for c in ready}
    jobs = [(str(W.modis_file(store, y, c)), y, c, str(work)) for y in years for c in sorted(have) if W.modis_file(store, y, c).is_file()]
    log(f"pass one: {len(jobs)} MODIS files of {len(have)} countries")
    files = W._map(W._split_one, jobs, workers)
    t1 = time.time()
    log(f"pass one done in {t1 - t0:.0f} s: {sum(f['rows_read'] for f in files)} rows read")
    pids: set[str] = set()
    for year_dir in (work / str(y) for y in years):
        if year_dir.is_dir():
            pids.update(p.name for p in year_dir.iterdir() if p.is_dir())
    by_id = {F.place_id((i, j)): (i, j) for i in range(F._COLUMNS) for j in range(F._ROWS)}
    left = boxes_left_out(fresh_plan, registry, first_boxes)
    out_boxes = [tuple(o["context_box"]) for o in left]
    plan_offered = [tuple(o["context_box"]) for o in fresh_plan["offered_regions"]["regions"]]
    why = {pid: why_not_test_c(by_id[pid], first_boxes, plan_offered, out_boxes) for pid in sorted(pids)}
    places = {pid: {**F.describe_place(by_id[pid], first_boxes, plan_offered), "role": None} for pid, w in why.items() if w is None}
    jobs2 = [(str(work), by_id[pid], years) for pid in sorted(places)]
    log(f"pass two: {len(jobs2)} places of test C, of {len(pids)} with rows")
    results = W._map(W._episodes_of_place, jobs2, workers)
    found = {pid: f for pid, f, _ in results}
    rows_by_place = {pid: r for pid, _, r in results}
    chosen = choose(found, places)
    log(f"pass two done in {time.time() - t1:.0f} s: {sum(len(v) for v in found.values())} episodes found, {len(chosen)} chosen")
    counts = {cont: sum(1 for ep in chosen if ep["continent"] == cont) for cont in F.CONTINENTS}
    reasons: dict[str, int] = {}
    for w in why.values():
        reasons[w or "a place of test C"] = reasons.get(w or "a place of test C", 0) + 1
    return {
        "what": "test C of the fresh test: places and episodes from MODIS rows alone, for one look at the tree player",
        "protocol_id": PROTOCOL_ID,
        "protocol_sha256": protocol_sha256(),
        "written_protocol_sha256": WRITTEN_PROTOCOL_SHA256,
        "fresh_plan_sha256": fresh_plan["plan_sha256"],
        "years": list(years),
        "hidden_platforms": list(HIDDEN_PLATFORMS),
        "store": {"countries_read": ready},
        "modis_files": sorted(files, key=lambda f: f["file"]),
        "boxes_left_out": left,
        "places": {
            "with_rows": len(pids),
            "by_reason": dict(sorted(reasons.items())),
            "of_test_c": len(places),
            "with_an_episode": {pid: {**places[pid], "modis_rows_by_year": rows_by_place[pid], "episodes_found": len(found[pid])}
                                for pid in sorted(found) if found[pid]},
        },
        "episodes_found": sum(len(v) for v in found.values()),
        "counts": {ROLE: counts},
        "enough_for_a_test": len(chosen) >= LEAST_FIRES,
        "episodes": {ROLE: chosen},
    }


def load_plan(path: Path = PLAN_FILE) -> dict[str, Any]:
    """Test C's plan on record, refused when its digest or its protocol is not the one in force."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    sha = doc.pop("plan_sha256", None)
    if sha != F.plan_sha256(doc):
        raise ValueError("test C's plan does not match its digest")
    if doc.get("protocol_sha256") != protocol_sha256():
        raise ValueError("test C's plan was made under another protocol")
    doc["plan_sha256"] = sha
    return doc


# ----------------------------------------------------------------------------------------------------------------
# Rows and pass lists of the chosen episodes
# ----------------------------------------------------------------------------------------------------------------


def targets(plan: dict[str, Any]) -> dict[str, list[tuple[str, float, float]]]:
    out: dict[str, list[tuple[str, float, float]]] = {}
    for ep in plan["episodes"][ROLE]:
        out.setdefault(ep["place_id"], []).append((ep["key"], float(ep["start_s"]) - R.PAD_S, float(ep["end_s"]) + R.PAD_S))
    return out


def years_touched(plan: dict[str, Any]) -> list[int]:
    out: set[int] = set()
    for wins in targets(plan).values():
        for _, t0, t1 in wins:
            for t in (t0, t1 - 1.0):
                out.add(_dt.datetime.fromtimestamp(t, _dt.timezone.utc).year)
    return sorted(out)


def collect_rows(plan: dict[str, Any], store: Path, work: Path, workers: int, log: Callable[[str], None] = print) -> dict[str, Any]:
    """Every country file of the years the windows touch, of both instruments, read once; the rows inside each
    episode's window and two days either side kept (`fresh_world_run._collect_one`)."""
    tg_json = json.dumps(targets(plan))
    countries = [c["country"] for c in plan["store"]["countries_read"]]
    jobs = []
    for product in R.PRODUCTS:
        for year in years_touched(plan):
            for c in countries:
                path = store / "firms" / "raw" / product / str(year) / f"{product}_{year}_{c}.csv"
                if path.is_file():
                    jobs.append((str(path), product, year, c, str(work), tg_json))
    log(f"rows: {len(jobs)} country files")
    t0 = time.time()
    results = W._map(R._collect_one, jobs, workers)
    for r in results:
        r.pop("counts", None)
    doc = {"what": "the rows step of test C: files read and rows kept per episode", "plan_sha256": plan["plan_sha256"],
           "files": sorted(results, key=lambda r: r["file"]), "seconds": round(time.time() - t0, 1)}
    (work / "rows_step.json").write_text(json.dumps(doc) + "\n", encoding="utf-8")
    log(f"rows done in {doc['seconds']} s")
    return doc


def fetch_passes(plan: dict[str, Any], work: Path, threads: int = 4, log: Callable[[str], None] = print) -> dict[str, Any]:
    """NASA CMR granules of Suomi NPP and NOAA-20 over each episode's tile and window, every reply kept."""
    done, failed = [], {}

    def one(ep: dict[str, Any]) -> None:
        try:
            done.append(R.fetch_episode_passes(ep, work, platforms=hidden_platforms(ep)))
        except Exception as exc:  # noqa: BLE001  (a reply that cannot be had is a reason, not a crash)
            failed[ep["key"]] = f"{type(exc).__name__}: {exc}"

    with ThreadPoolExecutor(max_workers=threads) as pool:
        list(pool.map(one, plan["episodes"][ROLE]))
    doc = {"plan_sha256": plan["plan_sha256"], "fetched": len(done), "failed": failed}
    (work / "passes_step.json").write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    log(f"passes: {len(done)} episodes, {len(failed)} failed")
    return doc


def hidden_platforms(ep: dict[str, Any]) -> tuple[str, ...]:
    """The hidden platforms of an episode of test C: those of the archive in its window that the store holds."""
    return tuple(p for p in R.hidden_platforms(ep) if p in HIDDEN_PLATFORMS)


class KeptPlatforms:
    """What a round of test C is told of the hidden platforms (`NextLookEnv(platforms_cached=...)`): the archive's
    platforms in the window that the store holds, and the others named with the reason they have no look. A plain
    object, so a worker process can be handed it."""

    def __call__(self, box: Any, hidden: str, start_s: float, end_s: float) -> tuple[tuple[str, ...], dict[str, str]]:
        from backend.model.platforms import archive_platforms

        archive = archive_platforms(hidden, float(start_s), float(end_s))
        kept = tuple(p for p in archive if p in HIDDEN_PLATFORMS)
        return kept, {p: NOT_IN_STORE for p in archive if p not in HIDDEN_PLATFORMS}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="test C of the fresh test")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan", help="choose test C's places and episodes from MODIS rows alone")
    p.add_argument("--store", default=None)
    p.add_argument("--work", default=str(WORK_DEFAULT))
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--out", default=str(PLAN_FILE))
    r = sub.add_parser("rows", help="the rows of test C's episodes, after its plan is committed")
    r.add_argument("--store", default=None)
    r.add_argument("--work", default=str(WORK_DEFAULT))
    r.add_argument("--workers", type=int, default=4)
    q = sub.add_parser("passes", help="the pass lists of test C's episodes, after its plan is committed")
    q.add_argument("--work", default=str(WORK_DEFAULT))
    q.add_argument("--threads", type=int, default=4)
    args = ap.parse_args(argv)
    from backend.firms import region_box

    if args.cmd == "plan":
        out = Path(args.out)
        if out.exists():
            raise SystemExit(f"{out} exists: test C's plan is made once")
        work = Path(args.work)
        if work.exists() and any(work.iterdir()):
            raise SystemExit(f"{work} is not empty: the plan's shards are written into an empty folder")
        work.mkdir(parents=True, exist_ok=True)
        fresh = R.load_plan()
        doc = build_plan(W.store_dir(args.store), work, args.workers, fresh, W.offered_regions(),
                         [region_box(r) for r in F.FIRST_REGIONS])
        sha = F.plan_sha256(doc)
        out.write_text(json.dumps({**doc, "plan_sha256": sha}, indent=1) + "\n", encoding="utf-8")
        print(json.dumps({"plan_sha256": sha, "counts": doc["counts"], "episodes_found": doc["episodes_found"],
                          "enough_for_a_test": doc["enough_for_a_test"], "places": {k: v for k, v in doc["places"].items()
                                                                                     if k != "with_an_episode"}}, indent=1))
        return 0
    plan = load_plan()
    if args.cmd == "rows":
        collect_rows(plan, W.store_dir(args.store), Path(args.work), args.workers)
    else:
        fetch_passes(plan, Path(args.work), args.threads)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
