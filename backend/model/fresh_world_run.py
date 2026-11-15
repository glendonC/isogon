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
    if doc.get("protocol_sha256") != F.protocol_sha256():
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
    data = path.read_bytes()
    out: dict[str, Any] = {"file": f"{product}/{year}/{path.name}", "sha256": hashlib.sha256(data).hexdigest(),
                           "rows_read": 0, "malformed_rows": 0, "counts": {}, "rows_kept": {}}
    lines = data.decode("utf-8").splitlines()
    if not lines:
        return out
    cols = lines[0].split(",")
    ix, iy, idate, itime, isat = (cols.index(c) for c in ("longitude", "latitude", "acq_date", "acq_time", "satellite"))
    it = cols.index("type") if "type" in cols else None
    keep_cols = [c for c in ROW_COLUMNS if c != "_platform"]
    where = {c: cols.index(c) for c in keep_cols if c in cols}
    kept: dict[str, list[str]] = {}
    counts: dict[str, dict[str, dict[str, int]]] = {}
    count_this = int(year) in COUNT_YEARS and product in ("modis", "viirs-snpp")
    for line in lines[1:]:
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


def pass_reader(work: Path, key: str) -> Callable[..., list[dict[str, Any]]]:
    """The pass list of one episode in the shape the schedule reads, built from its kept granules as the cached
    region pass lists are (`cmr_passes.cmr_passes`), with the time the scan crossed the box's centre and its
    distance from the ground track worked out from the granule holding the centre (`schedule.swath_position`),
    as the schedule does for a region. Raises CmrCacheMissing for a platform whose granules were not kept."""
    from backend.eval import schedule as S
    from backend.firms import cmr_passes as C

    def read(box: F.Box, start: Any, end: Any, platforms: Iterable[str] | None = None) -> list[dict[str, Any]]:
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

    return read


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


def run_episode(ep: dict[str, Any], params: dict[str, Any], work: Path) -> dict[str, Any]:
    """The blind test of one episode, under protocol version 3, with the estimate's values given and the two
    baselines as they are."""
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
        [painted_modis_factory, overlap_ratio_factory(load_ratio_fit(), ratio), reconstruction_factory(OccupancyParams(**params))],
        window=(float(ep["start_s"]), float(ep["end_s"])), schedule=S.SOURCE_CMR, read_passes=pass_reader(work, ep["key"]),
    )
    report.pop("definitions", None)
    report["episode"] = ep["key"]
    return report


# ----------------------------------------------------------------------------------------------------------------
# A look: every episode of one role, once, and its record
# ----------------------------------------------------------------------------------------------------------------


def _look_job(job: tuple[dict[str, Any], dict[str, Any], str]) -> tuple[str, dict[str, Any] | None, str | None]:
    ep, params, work_s = job
    try:
        return ep["key"], run_episode(ep, params, Path(work_s)), None
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
    return {
        "what": f"the fresh test's look at its {role} episodes",
        "look_name": F.LOOK_NAMES.get(role, role),
        "protocol_id": F.PROTOCOL_ID,
        "protocol_sha256": F.protocol_sha256(),
        "plan_sha256": plan["plan_sha256"],
        "values": values,
        "source_sha256": source_digests(),
        "episodes_in_plan": len(by_key),
        "episodes_scored": len(per_episode),
        "unscored": unscored,
        "per_episode": per_episode,
        "judged": groups,
        "fuel": "the zone, from latitude, stands in for fuel; no map of fuel was read",
    }


def look(plan: dict[str, Any], role: str, params: dict[str, Any], values: dict[str, Any], work: Path, workers: int,
         log: Callable[[str], None] = print) -> dict[str, Any]:
    jobs = [(ep, params, str(work)) for ep in plan["episodes"][role]]
    t0 = time.time()
    if workers <= 1:
        results = [_look_job(j) for j in jobs]
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(_look_job, jobs, chunksize=1))
    doc = record_look(plan, role, results, values, work)
    doc["seconds"] = round(time.time() - t0, 1)
    log(f"look at {role}: {doc['episodes_scored']} of {doc['episodes_in_plan']} scored in {doc['seconds']} s")
    return doc


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
    lk.add_argument("--role", required=True, choices=["test_a"])
    lk.add_argument("--work", default=str(W.WORK_DEFAULT))
    lk.add_argument("--workers", type=int, default=16)
    lk.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    plan = load_plan()
    work = Path(args.work)
    if args.cmd == "rows":
        collect_rows(plan, W.store_dir(args.store), work, args.workers)
    elif args.cmd == "passes":
        fetch_passes(plan, work, args.threads)
    elif args.cmd == "look":
        from backend.model.fitted import load_params

        F.refuse_unfrozen()
        out = Path(args.out)
        if out.exists():
            raise SystemExit(f"{out} exists: a look is taken once")
        doc = look(plan, args.role, load_params().as_dict(), {"files_sha256": F.values_now(), "which": "values in use"},
                   work, args.workers)
        out.write_text(json.dumps(doc, indent=1, default=str) + "\n", encoding="utf-8")
        print(json.dumps({k: doc["judged"]["all"].get(k) for k in ("episodes", "ahead", "tied", "behind", "interval")}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
