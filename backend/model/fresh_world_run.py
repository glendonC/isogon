"""The fresh test after its plan: the rows of the chosen windows, the pass lists, the second baseline's counts, and the
blind test of each episode (the protocol is `fresh_test.py`, the plan is made by `fresh_world.py`).

  ... python3 -m backend.model.fresh_world_run rows    [--store DIR] [--work DIR] [--workers N]
  ... python3 -m backend.model.fresh_world_run passes  [--work DIR] [--threads N]
  ... python3 -m backend.model.fresh_world_run look    --role test_a [--work DIR] [--workers N]

Nothing here runs before the plan is committed: every command reads the committed plan and refuses one whose digest
or protocol is not the one on record. `rows` is the first step that opens files of a sharp satellite. It reads every
country file of the store once, keeps the rows of both instruments inside each chosen place over its window and two
days either side (rows of FIRMS types 1, 2 and 3 left out), and counts, for each chosen place and month, the rows
of Terra, Aqua and Suomi NPP from 2012 to 2025 for the second baseline's ratio. `passes` asks NASA CMR for the
granules of the hidden platforms over each chosen tile and window and keeps every reply with its sha256. `look`
runs the blind test on every episode of one role, once.
"""

from __future__ import annotations

import argparse
import calendar as _cal
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
import csv
import datetime as _dt
import gzip
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
from backend.model.episodes import PAD_S  # noqa: E402

# The products whose rows a run reads, and the reader's platform name of each (MODIS takes it from the satellite).
PRODUCTS: tuple[str, ...] = ("modis", "viirs-snpp", "viirs-jpss1")
PRODUCT_PLATFORM: dict[str, str] = {"viirs-snpp": "Suomi NPP", "viirs-jpss1": "NOAA-20"}
MODIS_SATELLITE: dict[str, str] = {"Terra": "Terra", "Aqua": "Aqua", "T": "Terra", "A": "Aqua"}
# The overlap years of the second baseline's monthly counts, as the Record fits them.
COUNT_YEARS: tuple[int, ...] = tuple(range(2012, 2026))
COUNT_PLATFORMS: tuple[str, ...] = ("Terra", "Aqua", "Suomi NPP")
# The columns a run's rows keep: what `detections_from_rows` reads, and the reader's platform name.
ROW_COLUMNS: tuple[str, ...] = ("latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument", "confidence",
                                "version", "frp", "scan", "track", "daynight", "type", "_platform")
# Granules of a hidden platform are asked for over the window widened by this much on either side (the schedule
# asks for 15 minutes either side; the rest is room).
CMR_MARGIN_S: float = 3600.0
ROWS_SOURCE: str = "FIRMS country files of the shared store (fresh test)"


def load_plan(path: Path = W.PLAN_FILE) -> dict[str, Any]:
    """The committed plan, refused when its digest or its protocol is not the one on record."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    sha = doc.pop("plan_sha256", None)
    if sha != F.plan_sha256(doc):
        raise ValueError("the plan's digest does not match its content")
    if not F.stands_under(doc.get("protocol_sha256")):
        raise ValueError("the plan was made under another protocol")
    doc["plan_sha256"] = sha
    return doc


def chosen(plan: dict[str, Any], roles: Iterable[str] = F.ROLES) -> list[dict[str, Any]]:
    return [ep for role in roles for ep in plan["episodes"][role]]


def place_of_id(pid: str) -> tuple[int, int]:
    """The place an id such as `p-122.5+40.0` names."""
    body = pid[1:]
    k = max(body.rfind("+"), body.rfind("-"))
    w, s = float(body[:k]), float(body[k:])
    return int(round((w + 180.0) / F.PLACE_DEG)), int(round((s + 90.0) / F.PLACE_DEG))


def targets(plan: dict[str, Any]) -> dict[str, list[tuple[str, float, float]]]:
    """Each chosen place's windows, two days either side: (episode key, from, to)."""
    out: dict[str, list[tuple[str, float, float]]] = {}
    for ep in chosen(plan):
        out.setdefault(ep["place_id"], []).append((ep["key"], float(ep["start_s"]) - PAD_S, float(ep["end_s"]) + PAD_S))
    return out


def _years_needed(plan: dict[str, Any]) -> dict[str, set[int]]:
    """The years of each product a run reads: the counts' years for MODIS and Suomi NPP, and the years the windows
    touch, two days either side, for every product."""
    touched: set[int] = set()
    for _, wins in targets(plan).items():
        for _, t0, t1 in wins:
            for t in (t0, t1 - 1.0):
                touched.add(_dt.datetime.fromtimestamp(t, _dt.timezone.utc).year)
    return {"modis": set(COUNT_YEARS) | touched, "viirs-snpp": set(COUNT_YEARS) | touched, "viirs-jpss1": touched}


def _time_s(date: str, hhmm: str) -> float:
    y, m, d = int(date[:4]), int(date[5:7]), int(date[8:10])
    h = hhmm.zfill(4)
    return float(_cal.timegm((y, m, d, int(h[:2]), int(h[2:]), 0, 0, 0, 0)))


def _collect_one(job: tuple[str, str, int, str, str, str]) -> dict[str, Any]:
    """One country file: its rows inside the chosen windows, written as `<work>/rows/<key>/<file>.csv`, and the
    monthly counts of the chosen places."""
    path_s, product, year, country, work_s, targets_json = job
    tg: dict[str, list[tuple[str, float, float]]] = json.loads(targets_json)
    path, work = Path(path_s), Path(work_s)
    out: dict[str, Any] = {"file": f"{product}/{year}/{path.name}", "sha256": None,
                           "rows_read": 0, "malformed_rows": 0, "counts": {}, "rows_kept": {}}
    # read line by line, hashing every byte as it is read, so that a large file never sits whole in memory
    digest = hashlib.sha256()
    fh = path.open("rb")

    def lines_of() -> Any:
        for raw in fh:
            digest.update(raw)
            yield raw.decode("utf-8").rstrip("\r\n")

    lines = lines_of()
    header = next(lines, None)
    if header is None:
        fh.close()
        out["sha256"] = digest.hexdigest()
        return out
    cols = header.split(",")
    ix, iy, idate, itime, isat = (cols.index(c) for c in ("longitude", "latitude", "acq_date", "acq_time", "satellite"))
    it = cols.index("type") if "type" in cols else None
    keep_cols = [c for c in ROW_COLUMNS if c != "_platform"]
    where = {c: cols.index(c) for c in keep_cols if c in cols}
    kept: dict[str, list[str]] = {}
    counts: dict[str, dict[str, dict[str, int]]] = {}
    count_this = int(year) in COUNT_YEARS and product in ("modis", "viirs-snpp")
    for line in lines:
        if not line:
            continue
        out["rows_read"] += 1
        v = line.split(",")
        if len(v) != len(cols):
            out["malformed_rows"] += 1
            continue
        if it is not None and v[it] in F.LEFT_OUT_TYPES:
            continue
        places = [F.place_id(p) for p in W._places_of(float(v[ix]), float(v[iy]))]
        places = [p for p in places if p in tg]
        if not places:
            continue
        plat = PRODUCT_PLATFORM.get(product) or MODIS_SATELLITE.get(v[isat], v[isat])
        if count_this:
            # a row counts at every chosen place it lies in, edges included, as a box read takes its edges
            for p in places:
                mc = counts.setdefault(p, {}).setdefault(v[idate][:7], {})
                mc[plat] = mc.get(plat, 0) + 1
        t = _time_s(v[idate], v[itime])
        for p in places:
            for key, t0, t1 in tg[p]:
                if t0 <= t < t1:
                    kept.setdefault(key, []).append(",".join([v[where[c]] if c in where else "" for c in keep_cols] + [plat]))
    fh.close()
    out["sha256"] = digest.hexdigest()
    for key, rows in kept.items():
        dest = work / "rows" / key / f"{path.stem}.csv"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(",".join(ROW_COLUMNS) + "\n" + "\n".join(rows) + "\n", encoding="utf-8")
        out["rows_kept"][key] = len(rows)
    out["counts"] = counts
    return out


def collect_rows(plan: dict[str, Any], store: Path, work: Path, workers: int, log: Callable[[str], None] = print) -> dict[str, Any]:
    """The `rows` step: every needed country file of the store read once."""
    tg = targets(plan)
    tg_json = json.dumps(tg)
    need = _years_needed(plan)
    countries = [c["country"] for c in plan["store"]["countries_read"]]
    jobs = []
    for product in PRODUCTS:
        for year in sorted(need[product]):
            for c in countries:
                path = store / "firms" / "raw" / product / str(year) / f"{product}_{year}_{c}.csv"
                if path.is_file():
                    jobs.append((str(path), product, year, c, str(work), tg_json))
    log(f"rows: {len(jobs)} country files")
    t0 = time.time()
    if workers <= 1:
        results = [_collect_one(j) for j in jobs]
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(_collect_one, jobs, chunksize=1))
    counts: dict[str, dict[str, dict[str, int]]] = {}
    for r in results:
        for p, months in r.pop("counts").items():
            for mo, by in months.items():
                acc = counts.setdefault(p, {}).setdefault(mo, {})
                for plat, n in by.items():
                    acc[plat] = acc.get(plat, 0) + n
    from backend.firms.real_calendar import outage_days, platform_days

    days = platform_days(store / "firms")
    gaps = outage_days(days)
    deliver = {p: sorted({d[:7] for d, n in c.items() if n > 0}) for p, c in days.items()}
    doc = {
        "what": "the rows step of the fresh test: files read, rows kept per episode, monthly counts per chosen place",
        "plan_sha256": plan["plan_sha256"],
        "files": sorted(results, key=lambda r: r["file"]),
        "counts": counts,
        "deliver_months": deliver,
        "outage_days": {p: sorted(s) for p, s in gaps.items()},
        "seconds": round(time.time() - t0, 1),
    }
    (work / "rows_step.json").write_text(json.dumps(doc) + "\n", encoding="utf-8")
    log(f"rows done in {doc['seconds']} s")
    return doc


# ----------------------------------------------------------------------------------------------------------------
# The second baseline's ratio for a place, by the Record's rule
# ----------------------------------------------------------------------------------------------------------------


def place_calendar(pid: str, rows_step: dict[str, Any]) -> dict[str, Any]:
    """A calendar of one place as `calendar_ratio` reads it: per month of the overlap years the totals of Terra,
    Aqua and Suomi NPP (None when the platform delivered nothing that month), and the months left out for an
    outage day of one of the three, as the Record leaves them out."""
    deliver = {p: set(v) for p, v in rows_step["deliver_months"].items()}
    gap_months = {p: {d[:7] for d in v} for p, v in rows_step["outage_days"].items()}
    counts = rows_step["counts"].get(pid, {})
    records, excluded = [], []
    for year in COUNT_YEARS:
        for m in range(1, 13):
            mo = f"{year:04d}-{m:02d}"
            on = {p: mo in deliver.get(p, set()) for p in COUNT_PLATFORMS}
            raw = {p: ({"total": int(counts.get(mo, {}).get(p, 0))} if on[p] else None) for p in COUNT_PLATFORMS}
            records.append({"year": year, "year_month": mo, "raw_counts": raw})
            if all(on.values()) and any(mo in gap_months.get(p, set()) for p in COUNT_PLATFORMS):
                excluded.append(mo)
    return {"records": records,
            "harmonization_method": {"id": "overlap_ratio_v1", "overlap_months_excluded_for_outages": excluded}}


def _window_years(ep: dict[str, Any]) -> tuple[int, ...]:
    y0 = _dt.datetime.fromtimestamp(float(ep["start_s"]), _dt.timezone.utc).year
    y1 = _dt.datetime.fromtimestamp(float(ep["end_s"]) - 1.0, _dt.timezone.utc).year
    return tuple(range(y0, y1 + 1))


# ----------------------------------------------------------------------------------------------------------------
# Pass lists from NASA CMR
# ----------------------------------------------------------------------------------------------------------------


def hidden_platforms(ep: dict[str, Any]) -> tuple[str, ...]:
    from backend.model.platforms import archive_platforms

    return archive_platforms("VIIRS", float(ep["start_s"]), float(ep["end_s"]))


def _iso(t: float) -> str:
    return _dt.datetime.fromtimestamp(t, _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def granule_url(platform: str, box: F.Box, t0: float, t1: float) -> str:
    from backend.firms.cmr_passes import CMR_BASE, COLLECTIONS, PAGE_SIZE

    w, s, e, n = box
    return (f"{CMR_BASE}/granules.json?collection_concept_id={COLLECTIONS[platform]['concept_id']}"
            f"&bounding_box={w},{s},{e},{n}&temporal={_iso(t0)},{_iso(t1)}&page_size={PAGE_SIZE}&sort_key=start_date")


def _pass_file(work: Path, key: str, platform: str) -> Path:
    return work / "cmr" / key / f"{platform}.json.gz"


def fetch_episode_passes(ep: dict[str, Any], work: Path, opener: Any = None, pause_s: float = 0.5) -> dict[str, Any]:
    """The granules of each hidden platform over the episode's tile and window, every reply kept with its sha256.
    A reply already kept is not asked for again."""
    from backend.firms import cmr_passes as C

    opener = opener or C._default_opener
    out: dict[str, Any] = {"key": ep["key"], "platforms": {}}
    t0, t1 = float(ep["start_s"]) - CMR_MARGIN_S, float(ep["end_s"]) + CMR_MARGIN_S
    for plat in hidden_platforms(ep):
        dest = _pass_file(work, ep["key"], plat)
        if dest.is_file():
            out["platforms"][plat] = json.loads(dest.with_name(dest.name + ".manifest.json").read_text())
            continue
        url = granule_url(plat, tuple(ep["box"]), t0, t1)
        entries, search_after, pages, shas = [], None, 0, []
        while True:
            headers = {"CMR-Search-After": search_after} if search_after else {}
            h, body, _ = C._get(url, headers, opener)
            feed = json.loads(body.decode("utf-8"))["feed"]["entry"]
            shas.append(hashlib.sha256(body).hexdigest())
            entries += feed
            pages += 1
            hits = int(h.get("cmr-hits", len(feed)))
            search_after = h.get("cmr-search-after")
            if pause_s:
                time.sleep(pause_s)
            if len(entries) >= hits or not feed or not search_after:
                break
        payload = json.dumps({"url": url, "entries": entries}).encode("utf-8")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(gzip.compress(payload, mtime=0))
        man = {"url": url, "pages": pages, "page_sha256": shas, "entries": len(entries),
               "sha256": hashlib.sha256(payload).hexdigest(), "retrieved_utc": _iso(time.time())}
        dest.with_name(dest.name + ".manifest.json").write_text(json.dumps(man, indent=1) + "\n", encoding="utf-8")
        out["platforms"][plat] = man
    return out


def fetch_passes(plan: dict[str, Any], work: Path, threads: int = 4, log: Callable[[str], None] = print) -> dict[str, Any]:
    """The `passes` step for every chosen episode; an episode whose reply cannot be had is named with the reason."""
    eps = chosen(plan)
    done, failed = [], {}

    def one(ep: dict[str, Any]) -> None:
        try:
            done.append(fetch_episode_passes(ep, work))
        except Exception as exc:  # noqa: BLE001  (a reply that cannot be had is a reason, not a crash)
            failed[ep["key"]] = f"{type(exc).__name__}: {exc}"

    with ThreadPoolExecutor(max_workers=threads) as pool:
        list(pool.map(one, eps))
    doc = {"plan_sha256": plan["plan_sha256"], "fetched": len(done), "failed": failed}
    (work / "passes_step.json").write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    log(f"passes: {len(done)} episodes, {len(failed)} failed")
    return doc


class EpisodePasses:
    """The pass list of one episode in the shape the schedule reads, built from its kept granules as the cached
    region pass lists are (`cmr_passes.cmr_passes`), with the time the scan crossed the box's centre and its
    distance from the ground track worked out from the granule holding the centre (`schedule.swath_position`),
    as the schedule does for a region. Raises CmrCacheMissing for a platform whose granules were not kept. It is
    a plain object, so a worker process can be handed it."""

    def __init__(self, work: Path, key: str) -> None:
        self.work, self.key = Path(work), key

    def __call__(self, box: F.Box, start: Any, end: Any, platforms: Iterable[str] | None = None, tiles: Any = None) -> list[dict[str, Any]]:
        return _read_passes(self.work, self.key, box, start, end, platforms)


def pass_reader(work: Path, key: str) -> EpisodePasses:
    return EpisodePasses(work, key)


def _read_passes(work: Path, key: str, box: F.Box, start: Any, end: Any, platforms: Iterable[str] | None) -> list[dict[str, Any]]:
    from backend.eval import schedule as S
    from backend.firms import cmr_passes as C

    t0, t1 = C._parse_t(start), C._parse_t(end)
    lon, lat = 0.5 * (box[0] + box[2]), 0.5 * (box[1] + box[3])
    out: list[dict[str, Any]] = []
    for plat in (list(platforms) if platforms is not None else []):
        f = _pass_file(work, key, plat)
        if not f.is_file():
            raise C.CmrCacheMissing(f"no granules kept for {plat} in {key}")
        doc = json.loads(gzip.decompress(f.read_bytes()).decode("utf-8"))
        seen = {e["id"]: C._granule(e) for e in doc["entries"]}
        granules = sorted(seen.values(), key=lambda g: (g["time_start"], g["id"]))
        for grp in C._group(granules):
            ts, te = C._parse_t(grp[0]["time_start"]), C._parse_t(grp[-1]["time_end"])
            if te <= t0 or ts >= t1:
                continue
            rings = [C.densify(r) for g in grp for r in g["rings"]]
            share = C.share_inside(box, rings, C.BOX_SAMPLES)
            if share <= 0.0:
                continue
            item: dict[str, Any] = {
                "platform": plat, "time_start": grp[0]["time_start"], "time_end": grp[-1]["time_end"],
                "granules": [g["id"] for g in grp], "box_share": round(share, 4), "box_inside": share >= 1.0,
                "cloud_cover_pct": None,
            }
            for g in grp:
                hit = next((r for r in g["rings"] if len(r) >= 4 and S.ring_holds(r, lon, lat)), None)
                if hit is not None:
                    where = S.swath_position(hit, lon, lat, plat, S._t(g["time_start"]), S._t(g["time_end"]))
                    item["time_at_box"] = _iso(float(where["time_s"]))
                    item["cross_track_km"] = float(where["cross_track_km"])
                    item["satellite_side"] = where["satellite_side"]
                    break
            out.append(item)
    out.sort(key=lambda d: (d["time_start"], d["platform"]))
    return out


# ----------------------------------------------------------------------------------------------------------------
# One blind test of one episode
# ----------------------------------------------------------------------------------------------------------------

_CACHE: dict[str, Any] = {}


def _rows_step(work: Path) -> dict[str, Any]:
    key = f"rows:{work}"
    if key not in _CACHE:
        _CACHE[key] = json.loads((work / "rows_step.json").read_text(encoding="utf-8"))
    return _CACHE[key]


def episode_rows(work: Path, key: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for f in sorted((work / "rows" / key).glob("*.csv")):
        with f.open(encoding="utf-8", newline="") as fh:
            rows.extend(csv.DictReader(fh))
    return rows


def challenger_factories(variants: Iterable[str]) -> list[Any]:
    """The factories of the challengers named (`backend/model/challenger`, a variant such as "gbdt" for
    `challenger_gbdt`), loaded only when one is named, so the runner stands without them."""
    variants = list(variants)
    if not variants:
        return []
    from backend.model.challenger import methods as CM

    return [getattr(CM, f"challenger_{v}_factory")() for v in variants]


def run_episode(ep: dict[str, Any], params: dict[str, Any], work: Path,
                beside: tuple[tuple[str, dict[str, Any]], ...] = (), target_filter: Any = None,
                challengers: tuple[str, ...] = ()) -> dict[str, Any]:
    """The blind test of one episode, under protocol version 3, with the estimate's values given and the two
    baselines as they are. `beside` adds, by name, the estimate with other values in the same run, on the same
    looks (test B's other methods)."""
    from backend.eval import schedule as S
    from backend.eval.baselines import overlap_ratio_factory, painted_modis_factory
    from backend.eval.blind_test import run_blind_test
    from backend.eval.rows import detections_from_rows
    from backend.model.calendar_ratio import calendar_ratio
    from backend.model.fitted import load_ratio_fit
    from backend.model.occupancy import OccupancyParams
    from backend.model.real_blind import reconstruction_factory
    from backend.model.training import closed_for, closed_window_error

    closed = closed_for(tuple(ep["box"]), float(ep["start_s"]), float(ep["end_s"]))
    if closed is not None:
        raise closed_window_error(closed, "no episode there is scored")
    rows = episode_rows(work, ep["key"])
    if not rows:
        raise LookupError(f"no rows kept for {ep['key']}")
    det = detections_from_rows(rows, ROWS_SOURCE)
    cal = place_calendar(ep["place_id"], _rows_step(work))
    ratio = calendar_ratio(ep["place_id"], exclude_year=_window_years(ep), firms_calendar=lambda _r: cal)
    report = run_blind_test(
        det, tuple(ep["box"]),
        [painted_modis_factory, overlap_ratio_factory(load_ratio_fit(), ratio), reconstruction_factory(OccupancyParams(**params))]
        + [reconstruction_factory(OccupancyParams(**p), name=name) for name, p in beside]
        + challenger_factories(challengers),
        window=(float(ep["start_s"]), float(ep["end_s"])), schedule=S.SOURCE_CMR, read_passes=pass_reader(work, ep["key"]),
        target_filter=target_filter,
    )
    report.pop("definitions", None)
    report["episode"] = ep["key"]
    return report


# ----------------------------------------------------------------------------------------------------------------
# The table of clear looks (the protocol's clear_looks): scoring side only
# ----------------------------------------------------------------------------------------------------------------


def cloud_share(box: F.Box, slot: Any, root: Path | None = None) -> float | None:
    """The share of the tile under cloud at a hidden pass, by that pass's own mask (`backend.firms.passmask`), or
    None when no mask of the pass is on hand. Read for scoring only: no method is given it."""
    from backend.firms import passmask as PM

    got = PM.shares(tuple(box), float(slot.time_s), slot.platform, root=root, allow_sharp=True)
    return None if isinstance(got, str) else float(got["cloud"])


class ClearLooks:
    """The blind test's target filter of the second table: a hidden pass whose own mask is on hand and put at
    most `fresh_test.CLEAR_SHARE` of the tile under cloud. A plain object, so a worker process can carry it."""

    def __init__(self, box: F.Box, root: Path | None = None) -> None:
        self.box, self.root = tuple(box), root

    def __call__(self, slot: Any) -> bool:
        share = cloud_share(self.box, slot, self.root)
        return share is not None and share <= F.CLEAR_SHARE


def masks_of(ep: dict[str, Any], work: Path, root: Path | None = None) -> dict[str, int]:
    """How many of an episode's hidden passes have a mask on hand, and how many of those are clear. Reads the pass
    list and the masks, never a row."""
    from backend.eval import schedule as S

    slots, _ = S.pass_slots(hidden_platforms(ep), float(ep["start_s"]), float(ep["end_s"]), tuple(ep["box"]),
                            pass_reader(work, ep["key"]))
    shares = [cloud_share(tuple(ep["box"]), s, root) for s in slots]
    return {"passes": len(slots), "with_a_mask": sum(1 for v in shares if v is not None),
            "clear": sum(1 for v in shares if v is not None and v <= F.CLEAR_SHARE)}


# ----------------------------------------------------------------------------------------------------------------
# A look: every episode of one role, once, and its record
# ----------------------------------------------------------------------------------------------------------------


def _look_job(job: tuple[Any, ...]) -> tuple[str, dict[str, Any] | None, str | None]:
    ep, params, work_s = job[:3]
    beside = job[3] if len(job) > 3 else ()
    target_filter = job[4] if len(job) > 4 else None
    challengers = job[5] if len(job) > 5 else ()
    try:
        return ep["key"], run_episode(ep, params, Path(work_s), beside, target_filter, challengers), None
    except Exception as exc:  # noqa: BLE001  (an episode that cannot be scored is listed with its reason)
        return ep["key"], None, f"{type(exc).__name__}: {exc}"


def _canonical_sha(doc: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(doc, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def source_digests() -> dict[str, str]:
    """The sha256 of every source file of the estimate, the scorer and the baselines at the look."""
    out = {}
    for folder in ("backend/model", "backend/eval"):
        for f in sorted((_REPO_ROOT / folder).glob("*.py")):
            out[f"{folder}/{f.name}"] = hashlib.sha256(f.read_bytes()).hexdigest()
    return out


def judge(reports: list[dict[str, Any]]) -> dict[str, Any]:
    """A set of episodes judged with an interval (the episodes resampled whole), with its size and the stated
    interval's coverage pooled over its looks."""
    from backend.eval.blind_test import COUNTED_INTERVAL, bootstrap_verdict, pool_reports

    if not reports:
        return {"episodes": 0}
    pooled = pool_reports(reports)
    iv = pooled["methods"]["reconstruction"]["interval"]
    out: dict[str, Any] = {"episodes": len(reports), "scored_looks": int(pooled["scored_overpasses"]),
                           "interval": {"stated_level": iv.get("stated_level"), "held": iv.get("coverage"), "looks": iv.get("n")}}
    if len(reports) < 2:
        out["why_no_interval"] = "one episode cannot be resampled"
        return out
    v = bootstrap_verdict(reports)
    out["counted_by"] = COUNTED_INTERVAL
    out["classes"] = {k: row.get("class") for k, row in v["scores"].items()}
    out["ahead"] = sum(1 for c in out["classes"].values() if c == "ahead")
    out["tied"] = sum(1 for c in out["classes"].values() if c == "tie")
    out["behind"] = sum(1 for c in out["classes"].values() if c == "behind")
    out["scores"] = v["scores"]
    return out


def _headline_against(reports: list[dict[str, Any]], other: str) -> dict[str, Any]:
    """The headline judged against another method of the same run with an interval (the other as the one
    baseline)."""
    from backend.eval.blind_test import bootstrap_verdict

    if len(reports) < 2:
        return {"episodes": len(reports), "why_no_interval": "one episode cannot be resampled"}
    two = [{**r, "methods": {"reconstruction": r["methods"]["reconstruction"], other: r["methods"][other]}} for r in reports]
    v = bootstrap_verdict(two, method="reconstruction", baselines=(other,))
    return {"episodes": len(reports), "classes": {k: row.get("class") for k, row in v["scores"].items()},
            "ahead": int(v["classes"]["ahead"]), "tied": int(v["classes"]["tie"]), "behind": int(v["classes"]["behind"])}


def record_look(plan: dict[str, Any], role: str, results: list[tuple[str, dict[str, Any] | None, str | None]],
                values: dict[str, Any], work: Path) -> dict[str, Any]:
    from backend.eval.blind_test import COUNTED_PLAIN, verdict

    by_key = {ep["key"]: ep for ep in plan["episodes"][role]}
    rep_dir = work / "reports" / role
    rep_dir.mkdir(parents=True, exist_ok=True)
    per_episode, unscored, reports = [], {}, {}
    for key, rep, why in results:
        ep = by_key[key]
        if rep is None:
            unscored[key] = why
            continue
        sha = _canonical_sha(rep)
        (rep_dir / f"{key.replace(':', '_')}.json").write_text(json.dumps(rep, default=str) + "\n", encoding="utf-8")
        v = verdict(rep)
        per_episode.append({
            "key": key, "place_id": ep["place_id"], "continent": ep["continent"], "zone": ep["zone"],
            "first_overpass_utc": ep["first_overpass_utc"], "scored_looks": int(rep["scored_overpasses"]),
            "hidden_pixels_in_tile": int(rep["hidden_rows_in_test_box"]),
            "ahead_of_both_on": v.get("beats_every_baseline_on"), "scores_judged": v.get("scores_judged"),
            "counted_by": COUNTED_PLAIN, "interval": v.get("interval"), "report_sha256": sha,
        })
        reports[key] = rep
    groups: dict[str, Any] = {"all": judge(list(reports.values()))}
    groups["by_continent"] = {c: judge([reports[k] for k in reports if by_key[k]["continent"] == c]) for c in F.CONTINENTS}
    groups["by_zone"] = {z: judge([reports[k] for k in reports if by_key[k]["zone"] == z]) for z in F.ZONES}
    others = [m for m in (next(iter(reports.values()))["methods"] if reports else {})
              if m not in ("reconstruction", "painted_modis", "overlap_ratio")]
    beside_doc: dict[str, Any] = {}
    for m in others:
        as_main = [{**r, "methods": {**{k: v for k, v in r["methods"].items() if k in ("painted_modis", "overlap_ratio")},
                                     "reconstruction": r["methods"][m]}} for r in reports.values()]
        beside_doc[m] = {"against_the_baselines": judge(as_main),
                         "the_headline_against_it": _headline_against(list(reports.values()), m)}
    return {
        "what": f"the fresh test's look at its {role} episodes",
        "look_name": F.LOOK_NAMES.get(role, role),
        "protocol_id": F.PROTOCOL_ID,
        "protocol_sha256": F.protocol_sha256(),
        "protocol_the_plan_was_made_under": plan.get("protocol_sha256"),
        "plan_sha256": plan["plan_sha256"],
        "values": values,
        "source_sha256": source_digests(),
        "episodes_in_plan": len(by_key),
        "episodes_scored": len(per_episode),
        "unscored": unscored,
        "per_episode": per_episode,
        "judged": groups,
        "beside_the_headline": beside_doc,
        "fuel": "the zone, from latitude, stands in for fuel; no map of fuel was read",
    }


def clear_table(plan: dict[str, Any], role: str, params: dict[str, Any], work: Path, workers: int,
                beside: tuple[tuple[str, dict[str, Any]], ...] = (), root: Path | None = None,
                challengers: tuple[str, ...] = ()) -> dict[str, Any] | str:
    """The second table: the same episodes scored on their clear looks, where the masks are on hand; or the reason
    there is none."""
    eps = plan["episodes"][role]
    masks = {ep["key"]: masks_of(ep, work, root) for ep in eps}
    with_clear = [ep for ep in eps if masks[ep["key"]]["clear"] > 0]
    if not any(m["with_a_mask"] for m in masks.values()):
        return "no table: no cloud mask of a hidden pass of these episodes was on hand at this look"
    jobs = [(ep, params, str(work), beside, ClearLooks(tuple(ep["box"]), root), challengers) for ep in with_clear]
    if workers <= 1:
        results = [_look_job(j) for j in jobs]
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(_look_job, jobs, chunksize=1))
    sub = {"episodes": {role: with_clear}, "plan_sha256": plan["plan_sha256"]}
    doc = record_look(sub, role, results, {}, work / "clear")
    return {
        "rule": F.PROTOCOL["clear_looks"], "cloud_share_at_most": F.CLEAR_SHARE,
        "passes": sum(m["passes"] for m in masks.values()),
        "passes_with_a_mask": sum(m["with_a_mask"] for m in masks.values()),
        "clear_passes": sum(m["clear"] for m in masks.values()),
        "episodes_with_a_mask": sum(1 for m in masks.values() if m["with_a_mask"]),
        "episodes_with_a_clear_look": len(with_clear),
        "masks_by_episode": masks,
        "judged": doc["judged"], "per_episode": doc["per_episode"], "unscored": doc["unscored"],
        "beside_the_headline": doc["beside_the_headline"],
    }


def look(plan: dict[str, Any], role: str, params: dict[str, Any], values: dict[str, Any], work: Path, workers: int,
         log: Callable[[str], None] = print, beside: tuple[tuple[str, dict[str, Any]], ...] = (),
         clear: bool = False, mask_root: Path | None = None, challengers: tuple[str, ...] = ()) -> dict[str, Any]:
    jobs = [(ep, params, str(work), beside, None, challengers) for ep in plan["episodes"][role]]
    t0 = time.time()
    if workers <= 1:
        results = [_look_job(j) for j in jobs]
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(_look_job, jobs, chunksize=1))
    doc = record_look(plan, role, results, values, work)
    doc["beside_values"] = {name: "the estimate with these values, in the same run" for name, _ in beside}
    doc["challengers"] = {f"challenger_{v}": "a challenger checked against the test's rules before the look, in the same run"
                          for v in challengers}
    doc["clear_looks"] = (clear_table(plan, role, params, work, workers, beside, mask_root, challengers) if clear else
                          "no table: the hidden passes' cloud masks were not on hand at this look")
    doc["seconds"] = round(time.time() - t0, 1)
    log(f"look at {role}: {doc['episodes_scored']} of {doc['episodes_in_plan']} scored in {doc['seconds']} s")
    return doc


# ----------------------------------------------------------------------------------------------------------------
# The refit, its validation and the decision; then test B
# ----------------------------------------------------------------------------------------------------------------

REFIT_FILE: Path = W.PLAN_FILE.with_name("fresh_world_refit.json")
LOOK_FILES: dict[str, Path] = {role: W.PLAN_FILE.with_name(f"fresh_world_{role}.json") for role in ("test_a", "test_b")}
# The open training episodes of the three first regions that join the fitting set (fit_real.TRAIN_OPEN).
OPEN_TRAINING_EPISODES: int = 17


def _world_job(job: tuple[str, Any, dict[str, Any], str]) -> dict[str, Any]:
    kind, item, pdict, work_s = job
    if kind == "world":
        return run_episode(item, pdict, Path(work_s))
    from backend.model import fit_real as FR

    return FR._run_episode((FR.TRAIN_OPEN, int(item), pdict))


def scorable(ep: dict[str, Any], work: Path) -> str | None:
    """None when an episode's rows and pass lists are all kept, else the reason it cannot be scored. Reads no row."""
    if not any((work / "rows" / ep["key"]).glob("*.csv")):
        return "no rows kept"
    missing = [p for p in hidden_platforms(ep) if not _pass_file(work, ep["key"], p).is_file()]
    return f"no pass list for {', '.join(missing)}" if missing else None


class WorldEvaluator:
    """`fit_real.search_params` on the fresh test's sets: `fitting` is the plan's fitting episodes that can be
    scored and the open training episodes of the three first regions; `validation` is the plan's validation
    episodes that can be scored."""

    def __init__(self, plan: dict[str, Any], work: Path, workers: int, open_training: int = OPEN_TRAINING_EPISODES) -> None:
        self.work = work
        self.left_out: dict[str, str] = {}
        self.sets: dict[str, list[tuple[str, Any]]] = {}
        for role in ("fitting", "validation"):
            items: list[tuple[str, Any]] = []
            for ep in plan["episodes"][role]:
                why = scorable(ep, work)
                if why is None:
                    items.append(("world", ep))
                else:
                    self.left_out[ep["key"]] = why
            self.sets[role] = items
        self.sets["fitting"] += [("open", i) for i in range(open_training)]
        self.pool = ProcessPoolExecutor(max_workers=workers) if workers > 1 else None
        self.calls = 0

    def reports(self, params: Any, split: str) -> list[dict[str, Any]]:
        self.calls += 1
        jobs = [(kind, item, params.as_dict(), str(self.work)) for kind, item in self.sets[split]]
        if self.pool is None:
            return [_world_job(j) for j in jobs]
        return list(self.pool.map(_world_job, jobs, chunksize=1))

    def pooled(self, params: Any, split: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        from backend.eval.blind_test import pool_reports

        reps = self.reports(params, split)
        return pool_reports(reps), reps

    def close(self) -> None:
        if self.pool is not None:
            self.pool.shutdown()


def against_values_in_use(refit_reports: list[dict[str, Any]], in_use_reports: list[dict[str, Any]]) -> dict[str, Any]:
    """The refit judged against the values in use on the same episodes, with an interval: the same looks, the same
    truth, the values in use standing as the one baseline."""
    from backend.eval.blind_test import bootstrap_verdict

    merged = []
    for a, b in zip(refit_reports, in_use_reports):
        if a["episode"] != b["episode"]:
            raise ValueError("the two runs are not of the same episodes in the same order")
        merged.append({**a, "methods": {"reconstruction": a["methods"]["reconstruction"],
                                        "values_in_use": b["methods"]["reconstruction"]}})
    return bootstrap_verdict(merged, method="reconstruction", baselines=("values_in_use",))


def decide_test_b(v_refit: dict[str, Any], v_against: dict[str, Any]) -> dict[str, Any]:
    """The protocol's decision: the refit is test B's values when the rule in use holds for it on validation and no
    score is behind the values in use; otherwise the values in use are."""
    from backend.model import fit_real as FR

    rule_in_use, words, _parts, _strict = FR.decide(v_refit)
    none_behind = int(v_against["classes"]["behind"]) == 0
    use = bool(rule_in_use and none_behind)
    return {
        "test_b_values": "refit" if use else "values in use",
        "rule_in_use_holds": bool(rule_in_use), "rule_in_use_words": words,
        "behind_the_values_in_use_on": int(v_against["classes"]["behind"]),
        "ahead_of_the_values_in_use_on": int(v_against["classes"]["ahead"]),
        "rule": F.PROTOCOL["decision"],
    }


def refit(plan: dict[str, Any], work: Path, workers: int, log: Callable[[str], None] = print) -> dict[str, Any]:
    """The refit on the fitting set, both values on the validation set, and the decision, in one record."""
    from backend.eval.blind_test import bootstrap_verdict
    from backend.model import fit_real as FR
    from backend.model.fitted import load_params
    from backend.model.occupancy import OccupancyParams

    t0 = time.time()
    ev = WorldEvaluator(plan, work, workers)
    n_world = sum(1 for kind, _ in ev.sets["fitting"] if kind == "world")
    log(f"refit: {n_world} world fitting episodes and {OPEN_TRAINING_EPISODES} open training episodes; "
        f"{len(ev.sets['validation'])} validation episodes; {len(ev.left_out)} left out")
    found = FR.search_params(ev, "fitting", log)
    label = (f"{n_world} fire episodes of the fresh test's fitting places (plan {plan['plan_sha256'][:12]}) and the "
             f"{OPEN_TRAINING_EPISODES} open training episodes of plumas_ca, lytton_bc and evia_greece; no window of 2021 "
             "in those three regions")
    iv_frp, iv_pix = found["interval_frp"], found["interval_pixels"]
    best = OccupancyParams(**{**found["best"].as_dict(), "frp_interval_lo": iv_frp["lo"], "frp_interval_hi": iv_frp["hi"],
                              "pixel_interval_lo": iv_pix["lo"], "pixel_interval_hi": iv_pix["hi"], "fitted_on": label})
    in_use = load_params()
    reps_refit = ev.reports(best, "validation")
    reps_in_use = ev.reports(in_use, "validation")
    calls = ev.calls
    ev.close()
    v_refit, v_in_use = bootstrap_verdict(reps_refit), bootstrap_verdict(reps_in_use)
    v_against = against_values_in_use(reps_refit, reps_in_use)
    decision = decide_test_b(v_refit, v_against)
    return {
        "what": "the fresh test's refit on its fitting set, both values on its validation set, and the decision for test B",
        "protocol_id": F.PROTOCOL_ID, "protocol_sha256": F.protocol_sha256(), "plan_sha256": plan["plan_sha256"],
        "parameters": best.as_dict(),
        "values_in_use_sha256": F.values_now(),
        "fitting": {"world_episodes": n_world, "open_training_episodes": OPEN_TRAINING_EPISODES,
                    "left_out": {k: v for k, v in ev.left_out.items() if any(k == ep["key"] for ep in plan["episodes"]["fitting"])}},
        "validation": {"episodes": len(reps_refit),
                       "left_out": {k: v for k, v in ev.left_out.items() if any(k == ep["key"] for ep in plan["episodes"]["validation"])},
                       "refit_against_the_baselines": v_refit, "values_in_use_against_the_baselines": v_in_use,
                       "refit_against_the_values_in_use": v_against},
        "intervals": {"rule": FR.INTERVAL_RULE, "level": 0.90, "frp": iv_frp, "pixels": iv_pix},
        "search": {"grid": {k: list(v) for k, v in FR.SEARCH}, "history": found["history"], "blind_test_passes": calls,
                   "seconds": round(time.time() - t0, 1)},
        "decision": decision,
    }


def test_b_values(refit_doc: dict[str, Any], plan: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """The values test B is looked at with, by the decision on record, and how the record names them."""
    from backend.model.fitted import load_params

    if refit_doc.get("plan_sha256") != plan["plan_sha256"] or not F.stands_under(refit_doc.get("protocol_sha256")):
        raise ValueError("the refit on record is not of this plan and protocol")
    F.refuse_unfrozen()
    in_use = load_params().as_dict()
    if refit_doc["decision"]["test_b_values"] == "refit":
        return dict(refit_doc["parameters"]), {"which": "refit", "refit_sha256": _canonical_sha(refit_doc),
                                               "beside": {"values_in_use": in_use}}
    return in_use, {"which": "values in use", "files_sha256": F.values_now(), "refit_sha256": _canonical_sha(refit_doc),
                    "beside": {"refit": dict(refit_doc["parameters"])}}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="the fresh test after its plan")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("rows")
    r.add_argument("--store", default=None)
    r.add_argument("--work", default=str(W.WORK_DEFAULT))
    r.add_argument("--workers", type=int, default=16)
    p = sub.add_parser("passes")
    p.add_argument("--work", default=str(W.WORK_DEFAULT))
    p.add_argument("--threads", type=int, default=4)
    lk = sub.add_parser("look")
    lk.add_argument("--role", required=True, choices=["test_a", "test_b"])
    lk.add_argument("--work", default=str(W.WORK_DEFAULT))
    lk.add_argument("--workers", type=int, default=16)
    lk.add_argument("--out", default=None)
    lk.add_argument("--challengers", default="",
                    help="test B only: the challenger variants checked against the test's rules, comma separated")
    rf = sub.add_parser("refit")
    rf.add_argument("--work", default=str(W.WORK_DEFAULT))
    rf.add_argument("--workers", type=int, default=16)
    rf.add_argument("--out", default=str(REFIT_FILE))
    args = ap.parse_args(argv)
    plan = load_plan()
    work = Path(args.work)
    if args.cmd == "rows":
        collect_rows(plan, W.store_dir(args.store), work, args.workers)
    elif args.cmd == "passes":
        fetch_passes(plan, work, args.threads)
    elif args.cmd == "look":
        from backend.model.fitted import load_params

        out = Path(args.out) if args.out else LOOK_FILES[args.role]
        if out.exists():
            raise SystemExit(f"{out} exists: a look is taken once")
        if args.role == "test_a":
            F.refuse_unfrozen()
            params, values = load_params().as_dict(), {"files_sha256": F.values_now(), "which": "values in use"}
        else:
            if not REFIT_FILE.is_file():
                raise SystemExit("test B waits for the refit and its decision to be on record")
            params, values = test_b_values(json.loads(REFIT_FILE.read_text(encoding="utf-8")), plan)
        beside = tuple(values.pop("beside", {}).items()) if args.role == "test_b" else ()
        challengers = tuple(v for v in args.challengers.split(",") if v) if args.role == "test_b" else ()
        doc = look(plan, args.role, params, values, work, args.workers, beside=beside, clear=args.role == "test_b",
                   challengers=challengers)
        out.write_text(json.dumps(doc, indent=1, default=str) + "\n", encoding="utf-8")
        print(json.dumps({k: doc["judged"]["all"].get(k) for k in ("episodes", "ahead", "tied", "behind", "interval")}, indent=1))
    elif args.cmd == "refit":
        out = Path(args.out)
        if out.exists():
            raise SystemExit(f"{out} exists: the refit is made once")
        doc = refit(plan, work, args.workers)
        out.write_text(json.dumps(doc, indent=1, default=str) + "\n", encoding="utf-8")
        print(json.dumps(doc["decision"], indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
