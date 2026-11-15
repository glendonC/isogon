"""Loader for the fresh world split (fresh_world_plan.json) and shared FIRMS store.

Reads only the fitting and validation fire lists of fresh_world_plan.json on main
(with fallback support for SPLIT.md), enforces a hard block on all test_a and
test_b places across Earth, extracts rows and monthly overlap counts from the
read-only world store, and records sha256 digests of every file read.
"""

from __future__ import annotations

import calendar as _cal
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
import csv
import datetime as _dt
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
from typing import Any, Callable, Iterable

from backend.eval import schedule as S
from backend.eval.rows import Detections, detections_from_rows
from backend.firms import cmr_passes as C
from backend.firms.real_calendar import outage_days, platform_days
from backend.model.calendar_ratio import calendar_ratio
from backend.model.challenger.guard import (
    PLACE_COLS,
    PLACE_ROWS,
    REPO_ROOT,
    clamp_workers,
    global_forbidden_test_places,
    place_id_of_index,
    place_index_of_id,
    place_of_coords,
    places_of_coords,
    refuse_closed_episode,
    refuse_forbidden_place,
    sha256_file,
)
from backend.model.episodes import PAD_S
from backend.model.platforms import archive_platforms

WORLD_STORE_ENV: str = "ISOGON_WORLD_DIR"
PLAN_JSON_ENV: str = "ISOGON_PLAN_JSON"
SPLIT_MD_ENV: str = "ISOGON_SPLIT_MD"
CMR_SEED_ENV: str = "ISOGON_CMR_SEED_DIR"
PLAN_REL_PATH: str = "backend/model/fitted_values/fresh_world_plan.json"
EXPECTED_PROTOCOL_ID: str = "fresh_world_v1"
EXPECTED_PROTOCOL_SHA256: str = "050449de777c7b8a3d5258f554f2184c83028046fe4b7908a9390c5ab683ced3"
EXPECTED_PLAN_SHA256: str = "768e5487f75c906fdbedfb14325a7d277bbf6062b27398f08b104ba60da30449"
DEFAULT_WORK_DIR: Path = REPO_ROOT / "data" / "cache" / "challenger_world"

PRODUCTS: tuple[str, ...] = ("modis", "viirs-snpp", "viirs-jpss1")
PRODUCT_PLATFORM: dict[str, str] = {"viirs-snpp": "Suomi NPP", "viirs-jpss1": "NOAA-20"}
MODIS_SATELLITE: dict[str, str] = {"Terra": "Terra", "Aqua": "Aqua", "T": "Terra", "A": "Aqua"}
COUNT_YEARS: tuple[int, ...] = tuple(range(2012, 2026))
COUNT_PLATFORMS: tuple[str, ...] = ("Terra", "Aqua", "Suomi NPP")
LEFT_OUT_TYPES: frozenset[str] = frozenset(("1", "2", "3"))
ROW_COLUMNS: tuple[str, ...] = (
    "latitude",
    "longitude",
    "acq_date",
    "acq_time",
    "satellite",
    "instrument",
    "confidence",
    "version",
    "frp",
    "scan",
    "track",
    "daynight",
    "type",
    "_platform",
)
CMR_MARGIN_S: float = 3600.0
ROWS_SOURCE: str = "FIRMS country files of the shared store (fitting and validation only)"


def _parse_iso_minute_utc(ts: str) -> float:
    text = ts.strip()
    if text.endswith("Z"):
        text = text[:-1]
    parts = text.split("T")
    y, m, d = (int(v) for v in parts[0].split("-"))
    tparts = parts[1].split(":")
    hh, mm = int(tparts[0]), int(tparts[1])
    ss = int(tparts[2]) if len(tparts) > 2 else 0
    return float(_cal.timegm((y, m, d, hh, mm, ss, 0, 0, 0)))


def _read_plan_bytes(plan_path: str | Path | None = None) -> tuple[bytes, str]:
    """Read raw bytes of fresh_world_plan.json from path, worktree, or git main."""
    if plan_path is not None:
        p = Path(plan_path)
        return p.read_bytes(), PLAN_REL_PATH
    env_p = os.environ.get(PLAN_JSON_ENV)
    if env_p:
        p = Path(env_p)
        return p.read_bytes(), PLAN_REL_PATH
    local_p = REPO_ROOT / PLAN_REL_PATH
    if local_p.is_file():
        return local_p.read_bytes(), PLAN_REL_PATH
    raw = subprocess.check_output(
        ["git", "-C", str(REPO_ROOT), "show", f"main:{PLAN_REL_PATH}"]
    )
    return raw, f"main:{PLAN_REL_PATH}"


def load_fresh_world_plan(plan_path: str | Path | None = None) -> dict[str, Any]:
    """Load fitting and validation episodes from fresh_world_plan.json, sealing all test places."""
    raw_bytes, logical_source = _read_plan_bytes(plan_path)
    plan_file_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    doc = json.loads(raw_bytes.decode("utf-8"))

    protocol_id = str(doc.get("protocol_id", ""))
    protocol_sha256 = str(doc.get("protocol_sha256", ""))
    plan_sha256 = str(doc.get("plan_sha256", ""))
    if protocol_id != EXPECTED_PROTOCOL_ID:
        raise ValueError(f"unexpected protocol_id {protocol_id!r}")
    if protocol_sha256 != EXPECTED_PROTOCOL_SHA256:
        raise ValueError(f"unexpected protocol_sha256 {protocol_sha256!r}")
    if plan_sha256 != EXPECTED_PLAN_SHA256:
        raise ValueError(f"unexpected plan_sha256 {plan_sha256!r}")

    eps_block = dict(doc.get("episodes", {}))
    # Immediately discard test_a and test_b episode lists untouched
    eps_block.pop("test_a", None)
    eps_block.pop("test_b", None)

    raw_fit = list(eps_block.get("fitting", []))
    raw_val = list(eps_block.get("validation", []))
    if len(raw_fit) != 300 or len(raw_val) != 83:
        raise ValueError(f"expected 300 fitting and 83 validation episodes, got {len(raw_fit)} and {len(raw_val)}")

    global_forb = set(global_forbidden_test_places(protocol_id=protocol_id))
    places_with_ep = (doc.get("places") or {}).get("with_an_episode") or {}
    test_a_ep_places = sorted(
        pid for pid, info in places_with_ep.items() if info.get("role") == "test_a"
    )
    test_b_ep_places = sorted(
        pid for pid, info in places_with_ep.items() if info.get("role") == "test_b"
    )
    forbidden = frozenset(global_forb | set(test_a_ep_places) | set(test_b_ep_places))

    def _norm_ep(e: dict[str, Any], role: str) -> dict[str, Any]:
        box = [float(v) for v in e["box"]]
        start_s = float(e["start_s"])
        end_s = float(e["end_s"])
        pid = str(e["place_id"])
        refuse_forbidden_place(pid, forbidden)
        refuse_closed_episode((box[0], box[1], box[2], box[3]), start_s, end_s)
        return {
            "key": str(e["key"]),
            "place_id": pid,
            "year": int(e["year"]),
            "tile": [int(e["tile"][0]), int(e["tile"][1])],
            "continent": str(e["continent"]),
            "zone": str(e["zone"]),
            "box": box,
            "first_overpass_utc": str(e["first_overpass_utc"]),
            "last_overpass_utc": str(e["last_overpass_utc"]),
            "start_s": start_s,
            "end_s": end_s,
            "role": role,
        }

    fitting = [_norm_ep(e, "fitting") for e in raw_fit]
    validation = [_norm_ep(e, "validation") for e in raw_val]

    allowed_places = {ep["place_id"] for ep in fitting} | {ep["place_id"] for ep in validation}
    if allowed_places & set(forbidden):
        raise ValueError("role overlap detected between fitting/validation and forbidden test places")

    return {
        "protocol_id": protocol_id,
        "protocol_sha256": protocol_sha256,
        "plan_sha256": plan_sha256,
        "plan_file_sha256": plan_file_sha256,
        "plan_file_bytes": len(raw_bytes),
        "plan_logical_path": logical_source,
        "split_md_sha256": plan_file_sha256,
        "fitting": fitting,
        "validation": validation,
        "test_a_places": test_a_ep_places,
        "test_b_places": test_b_ep_places,
        "forbidden_places": sorted(forbidden),
    }


def parse_split_markdown(path: str | Path) -> dict[str, Any]:
    """Parse SPLIT.md into fitting episodes, validation episodes, and forbidden test places."""
    p = Path(path)
    raw = p.read_text(encoding="utf-8")
    split_sha = sha256_file(p)

    m_proto = re.search(r"Protocol\s+`([^`]+)`,\s+digest\s+`([0-9a-f]{64})`", raw)
    m_plan = re.search(r"Plan digest\s+`([0-9a-f]{64})`", raw)
    if not m_proto or not m_plan:
        raise ValueError("SPLIT.md is missing protocol or plan digest header")

    protocol_id = m_proto.group(1)
    protocol_sha256 = m_proto.group(2)
    plan_sha256 = m_plan.group(1)

    section: str | None = None
    fitting: list[dict[str, Any]] = []
    validation: list[dict[str, Any]] = []
    test_a_places: list[str] = []
    test_b_places: list[str] = []

    for line in raw.splitlines():
        s = line.strip()
        if s.startswith("## Fitting fires"):
            section = "fitting"
            continue
        if s.startswith("## Validation fires"):
            section = "validation"
            continue
        if s.startswith("## Fresh test a"):
            section = "test_a"
            continue
        if s.startswith("## Fresh test b"):
            section = "test_b"
            continue
        if s.startswith("## "):
            section = None
            continue

        if section in ("fitting", "validation") and s.startswith("| `p"):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if len(cells) != 5:
                continue
            key = cells[0].strip("`")
            continent = cells[1]
            zone = cells[2]
            w, so, e, n = (float(v.strip()) for v in cells[3].split(","))
            w0_str, w1_str = (v.strip() for v in cells[4].split(" to "))
            start_s = _parse_iso_minute_utc(w0_str)
            # Window.end_s is one second after the last MODIS pass minute
            end_s = _parse_iso_minute_utc(w1_str) + 1.0
            pid, year_s, tile_s = key.split(":")
            box = (w, so, e, n)
            refuse_closed_episode(box, start_s, end_s)
            ep = {
                "key": key,
                "place_id": pid,
                "year": int(year_s),
                "tile": [int(tile_s[0]), int(tile_s[1])],
                "continent": continent,
                "zone": zone,
                "box": [w, so, e, n],
                "first_overpass_utc": w0_str if w0_str.count(":") == 2 else w0_str[:-1] + ":00Z",
                "last_overpass_utc": w1_str if w1_str.count(":") == 2 else w1_str[:-1] + ":00Z",
                "start_s": start_s,
                "end_s": end_s,
                "role": section,
            }
            if section == "fitting":
                fitting.append(ep)
            else:
                validation.append(ep)
        elif section in ("test_a", "test_b") and s.startswith("- `p"):
            m_pid = re.match(r"-\s+`(p[+-][0-9.]+[+-][0-9.]+)`", s)
            if m_pid:
                if section == "test_a":
                    test_a_places.append(m_pid.group(1))
                else:
                    test_b_places.append(m_pid.group(1))

    forbidden = frozenset(test_a_places) | frozenset(test_b_places)
    allowed_places = {ep["place_id"] for ep in fitting} | {ep["place_id"] for ep in validation}
    overlap = allowed_places & set(forbidden)
    if overlap:
        raise ValueError(f"SPLIT.md role overlap detected on places: {sorted(overlap)}")
    if not fitting or not validation:
        raise ValueError("SPLIT.md produced empty fitting or validation list")

    return {
        "protocol_id": protocol_id,
        "protocol_sha256": protocol_sha256,
        "plan_sha256": plan_sha256,
        "split_md_sha256": split_sha,
        "fitting": fitting,
        "validation": validation,
        "test_a_places": sorted(test_a_places),
        "test_b_places": sorted(test_b_places),
        "forbidden_places": sorted(forbidden),
    }


def _time_s_csv(date: str, hhmm: str) -> float:
    y, m, d = int(date[:4]), int(date[5:7]), int(date[8:10])
    h = hhmm.zfill(4)
    return float(_cal.timegm((y, m, d, int(h[:2]), int(h[2:]), 0, 0, 0)))


def _build_near_mask(target_pids: Iterable[str]) -> list[bool]:
    """Boolean lookup of size PLACE_COLS * PLACE_ROWS: True if (i0, j0) or its -1 edge neighbor is in target_pids."""
    idx_set = {place_index_of_id(pid) for pid in target_pids}
    near = [False] * (PLACE_COLS * PLACE_ROWS)
    for i0 in range(PLACE_COLS):
        for j0 in range(PLACE_ROWS):
            if (
                (i0, j0) in idx_set
                or (i0 - 1, j0) in idx_set
                or (i0, j0 - 1) in idx_set
                or (i0 - 1, j0 - 1) in idx_set
            ):
                near[i0 * PLACE_ROWS + j0] = True
    return near


def _scan_country_job(
    job: tuple[str, str, int, str, str, dict[str, list[tuple[str, float, float]]], list[bool], set[str]]
) -> dict[str, Any]:
    path_s, product, year, _country, work_s, tg, near_mask, forbidden_set = job
    path, work = Path(path_s), Path(work_s)
    out: dict[str, Any] = {
        "path": f"world_store/firms/raw/{product}/{year}/{path.name}",
        "bytes": int(path.stat().st_size),
        "sha256": None,
        "rows_read": 0,
        "malformed_rows": 0,
        "counts": {},
        "rows_kept": {},
    }
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        raw_header = fh.readline()
        if not raw_header:
            out["sha256"] = digest.hexdigest()
            return out
        digest.update(raw_header)
        header = raw_header.decode("utf-8").rstrip("\r\n")
        cols = header.split(",")
        ix = cols.index("longitude")
        iy = cols.index("latitude")
        idate = cols.index("acq_date")
        itime = cols.index("acq_time")
        isat = cols.index("satellite")
        it = cols.index("type") if "type" in cols else None
        keep_cols = [c for c in ROW_COLUMNS if c != "_platform"]
        where = {c: cols.index(c) for c in keep_cols if c in cols}

        kept: dict[str, list[str]] = {}
        counts: dict[str, dict[str, dict[str, int]]] = {}
        count_this = int(year) in COUNT_YEARS and product in ("modis", "viirs-snpp")
        ncols = len(cols)

        for raw in fh:
            digest.update(raw)
            line = raw.decode("utf-8").rstrip("\r\n")
            if not line:
                continue
            out["rows_read"] += 1
            v = line.split(",")
            if len(v) != ncols:
                out["malformed_rows"] += 1
                continue
            if it is not None and v[it] in LEFT_OUT_TYPES:
                continue
            lon = float(v[ix])
            lat = float(v[iy])
            i0, j0 = place_of_coords(lon, lat)
            if not near_mask[i0 * PLACE_ROWS + j0]:
                continue
            cand_places = [place_id_of_index(p) for p in places_of_coords(lon, lat)]
            if any(p in forbidden_set for p in cand_places):
                continue
            matched = [p for p in cand_places if p in tg]
            if not matched:
                continue
            plat = PRODUCT_PLATFORM.get(product) or MODIS_SATELLITE.get(v[isat], v[isat])
            if count_this:
                mo = v[idate][:7]
                for p in matched:
                    mc = counts.setdefault(p, {}).setdefault(mo, {})
                    mc[plat] = mc.get(plat, 0) + 1
            t = _time_s_csv(v[idate], v[itime])
            for p in matched:
                for key, t0, t1 in tg[p]:
                    if t0 <= t < t1:
                        row_str = ",".join([v[where[c]] if c in where else "" for c in keep_cols] + [plat])
                        kept.setdefault(key, []).append(row_str)

    out["sha256"] = digest.hexdigest()
    for key, rows in kept.items():
        dest = work / "rows" / key / f"{path.stem}.csv"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(",".join(ROW_COLUMNS) + "\n" + "\n".join(rows) + "\n", encoding="utf-8")
        out["rows_kept"][key] = len(rows)
    out["counts"] = counts
    return out


def hidden_platforms_for_ep(ep: dict[str, Any]) -> tuple[str, ...]:
    return archive_platforms("VIIRS", float(ep["start_s"]), float(ep["end_s"]))


def _iso_utc(t: float) -> str:
    return _dt.datetime.fromtimestamp(t, _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _pass_file(work: Path, key: str, platform: str) -> Path:
    return work / "cmr" / key / f"{platform}.json.gz"


def _ensure_episode_passes(
    ep: dict[str, Any],
    work: Path,
    forbidden: frozenset[str],
    cmr_seed_dir: Path | None = None,
    pause_s: float = 0.5,
) -> list[dict[str, Any]]:
    refuse_forbidden_place(ep["place_id"], forbidden)
    refuse_closed_episode(tuple(ep["box"]), float(ep["start_s"]), float(ep["end_s"]))
    digests: list[dict[str, Any]] = []
    t0, t1 = float(ep["start_s"]) - CMR_MARGIN_S, float(ep["end_s"]) + CMR_MARGIN_S

    for plat in hidden_platforms_for_ep(ep):
        dest = _pass_file(work, ep["key"], plat)
        if not dest.is_file() and cmr_seed_dir is not None:
            seed_file = cmr_seed_dir / ep["key"] / f"{plat}.json.gz"
            if seed_file.is_file():
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(seed_file, dest)
                seed_man = seed_file.with_name(seed_file.name + ".manifest.json")
                if seed_man.is_file():
                    shutil.copy2(seed_man, dest.with_name(dest.name + ".manifest.json"))

        if not dest.is_file():
            w, s, e, n = ep["box"]
            url = (
                f"{C.CMR_BASE}/granules.json?collection_concept_id={C.COLLECTIONS[plat]['concept_id']}"
                f"&bounding_box={w},{s},{e},{n}&temporal={_iso_utc(t0)},{_iso_utc(t1)}"
                f"&page_size={C.PAGE_SIZE}&sort_key=start_date"
            )
            entries, search_after, pages, shas = [], None, 0, []
            while True:
                headers = {"CMR-Search-After": search_after} if search_after else {}
                h, body, _ = C._get(url, headers, C._default_opener)
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
            man = {
                "url": url,
                "pages": pages,
                "page_sha256": shas,
                "entries": len(entries),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "retrieved_utc": _iso_utc(time.time()),
            }
            dest.with_name(dest.name + ".manifest.json").write_text(json.dumps(man, indent=1) + "\n", encoding="utf-8")

        digests.append(
            {
                "path": f"data/cache/challenger_world/cmr/{ep['key']}/{plat}.json.gz",
                "bytes": int(dest.stat().st_size),
                "sha256": sha256_file(dest),
            }
        )
    return digests


class WorldEpisodePasses:
    """Picklable pass-list reader for one episode, matching fresh_world_run.EpisodePasses."""

    def __init__(self, work: Path, key: str) -> None:
        self.work = Path(work)
        self.key = str(key)

    def __call__(
        self,
        box: tuple[float, float, float, float],
        start: Any,
        end: Any,
        platforms: Iterable[str] | None = None,
        tiles: Any = None,
    ) -> list[dict[str, Any]]:
        t0, t1 = C._parse_t(start), C._parse_t(end)
        lon, lat = 0.5 * (box[0] + box[2]), 0.5 * (box[1] + box[3])
        out: list[dict[str, Any]] = []
        for plat in (list(platforms) if platforms is not None else []):
            f = _pass_file(self.work, self.key, plat)
            if not f.is_file():
                raise C.CmrCacheMissing(f"no granules kept for {plat} in {self.key}")
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
                    "platform": plat,
                    "time_start": grp[0]["time_start"],
                    "time_end": grp[-1]["time_end"],
                    "granules": [g["id"] for g in grp],
                    "box_share": round(share, 4),
                    "box_inside": share >= 1.0,
                    "cloud_cover_pct": None,
                }
                for g in grp:
                    hit = next((r for r in g["rings"] if len(r) >= 4 and S.ring_holds(r, lon, lat)), None)
                    if hit is not None:
                        where = S.swath_position(hit, lon, lat, plat, S._t(g["time_start"]), S._t(g["time_end"]))
                        item["time_at_box"] = _iso_utc(float(where["time_s"]))
                        item["cross_track_km"] = float(where["cross_track_km"])
                        item["satellite_side"] = where["satellite_side"]
                        break
                out.append(item)
        out.sort(key=lambda d: (d["time_start"], d["platform"]))
        return out


def prepare_world_cache(
    split_doc: dict[str, Any],
    store_dir: Path,
    work_dir: Path = DEFAULT_WORK_DIR,
    cmr_seed_dir: Path | None = None,
    workers: int = 4,
    log: Callable[[str], None] = print,
) -> dict[str, Any]:
    """Extract fitting and validation rows/counts and CMR pass lists, never touching test places."""
    workers = clamp_workers(workers)
    work_dir.mkdir(parents=True, exist_ok=True)
    forbidden = frozenset(split_doc["forbidden_places"])
    all_eps = list(split_doc["fitting"]) + list(split_doc["validation"])
    for ep in all_eps:
        refuse_forbidden_place(ep["place_id"], forbidden)
        refuse_closed_episode(tuple(ep["box"]), float(ep["start_s"]), float(ep["end_s"]))

    rows_step_file = work_dir / "world_rows_step.json"
    ready_file = store_dir / "firms" / "READY.json"
    ready_sha = sha256_file(ready_file)
    ready_doc = json.loads(ready_file.read_text(encoding="utf-8"))
    countries = [c["country"] for c in ready_doc["countries"]]

    need_rows = True
    if rows_step_file.is_file():
        cached = json.loads(rows_step_file.read_text(encoding="utf-8"))
        if (
            cached.get("plan_sha256") == split_doc["plan_sha256"]
            and cached.get("ready_json_sha256") == ready_sha
        ):
            need_rows = False
            rows_step = cached
            log("world rows cache already matches plan_sha256 and READY.json")

    if need_rows:
        tg: dict[str, list[tuple[str, float, float]]] = {}
        touched_years: set[int] = set()
        for ep in all_eps:
            t0 = float(ep["start_s"]) - PAD_S
            t1 = float(ep["end_s"]) + PAD_S
            tg.setdefault(ep["place_id"], []).append((ep["key"], t0, t1))
            for t in (t0, t1 - 1.0):
                touched_years.add(_dt.datetime.fromtimestamp(t, _dt.timezone.utc).year)

        years_by_prod = {
            "modis": set(COUNT_YEARS) | touched_years,
            "viirs-snpp": set(COUNT_YEARS) | touched_years,
            "viirs-jpss1": touched_years,
        }
        near_mask = _build_near_mask(tg.keys())
        forbidden_set = set(forbidden)

        # Clean any stale rows directory before writing fresh extracts
        rows_root = work_dir / "rows"
        if rows_root.exists():
            shutil.rmtree(rows_root)

        jobs = []
        for product in PRODUCTS:
            for y in sorted(years_by_prod[product]):
                for c in countries:
                    fp = store_dir / "firms" / "raw" / product / str(y) / f"{product}_{y}_{c}.csv"
                    if fp.is_file():
                        jobs.append((str(fp), product, int(y), c, str(work_dir), tg, near_mask, forbidden_set))

        log(f"scanning {len(jobs)} country files across {workers} workers (fitting and validation places only)...")
        t_start = time.time()
        if workers <= 1:
            results = [_scan_country_job(j) for j in jobs]
        else:
            with ProcessPoolExecutor(max_workers=workers) as pool:
                results = list(pool.map(_scan_country_job, jobs, chunksize=8))

        counts: dict[str, dict[str, dict[str, int]]] = {}
        file_digests: list[dict[str, Any]] = []
        for r in results:
            for p, months in r.pop("counts").items():
                refuse_forbidden_place(p, forbidden)
                for mo, by in months.items():
                    acc = counts.setdefault(p, {}).setdefault(mo, {})
                    for plat, n in by.items():
                        acc[plat] = acc.get(plat, 0) + n
            file_digests.append({"path": r["path"], "bytes": r["bytes"], "sha256": r["sha256"]})

        days = platform_days(store_dir / "firms")
        gaps = outage_days(days)
        deliver = {p: sorted({d[:7] for d, n in c.items() if n > 0}) for p, c in days.items()}
        rows_step = {
            "what": "fitting and validation rows and monthly overlap counts from shared world store (zero test places)",
            "protocol_id": split_doc["protocol_id"],
            "protocol_sha256": split_doc["protocol_sha256"],
            "plan_sha256": split_doc["plan_sha256"],
            "plan_file_sha256": split_doc.get("plan_file_sha256", split_doc.get("split_md_sha256")),
            "split_md_sha256": split_doc["split_md_sha256"],
            "ready_json_sha256": ready_sha,
            "ready_json_bytes": int(ready_file.stat().st_size),
            "files": sorted(file_digests, key=lambda d: d["path"]),
            "counts": counts,
            "deliver_months": deliver,
            "outage_days": {p: sorted(s) for p, s in gaps.items()},
            "seconds": round(time.time() - t_start, 1),
        }
        rows_step_file.write_text(json.dumps(rows_step) + "\n", encoding="utf-8")
        log(f"world rows scan finished in {rows_step['seconds']} s ({len(file_digests)} files hashed)")

    # Ensure CMR pass files for all 383 fitting + validation episodes
    cmr_digests: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=workers) as tpool:
        batches = list(
            tpool.map(lambda ep: _ensure_episode_passes(ep, work_dir, forbidden, cmr_seed_dir), all_eps)
        )
    for b in batches:
        cmr_digests.extend(b)
    cmr_digests.sort(key=lambda d: d["path"])
    rows_step["cmr_files"] = cmr_digests
    return rows_step


def place_calendar_from_step(pid: str, rows_step: dict[str, Any]) -> dict[str, Any]:
    """Build a calendar dict for calendar_ratio matching fresh_world_run.place_calendar."""
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
    return {
        "records": records,
        "harmonization_method": {"id": "overlap_ratio_v1", "overlap_months_excluded_for_outages": excluded},
    }


def window_years_of_ep(ep: dict[str, Any]) -> tuple[int, ...]:
    y0 = _dt.datetime.fromtimestamp(float(ep["start_s"]), _dt.timezone.utc).year
    y1 = _dt.datetime.fromtimestamp(float(ep["end_s"]) - 1.0, _dt.timezone.utc).year
    return tuple(range(y0, y1 + 1))


def load_world_episode_rows(ep: dict[str, Any], work_dir: Path, forbidden: frozenset[str]) -> Detections:
    """Load Detections for a fitting or validation episode from work_dir/rows/<key>."""
    refuse_forbidden_place(ep["place_id"], forbidden)
    t0 = float(ep["start_s"]) - PAD_S
    t1 = float(ep["end_s"]) + PAD_S
    refuse_closed_episode(tuple(ep["box"]), float(ep["start_s"]), float(ep["end_s"]))
    rows: list[dict[str, str]] = []
    for f in sorted((work_dir / "rows" / ep["key"]).glob("*.csv")):
        with f.open(encoding="utf-8", newline="") as fh:
            for r in csv.DictReader(fh):
                t = _time_s_csv(r["acq_date"], r["acq_time"])
                if t0 <= t < t1:
                    rows.append(r)
    if not rows:
        raise LookupError(f"no rows kept for {ep['key']}")
    return detections_from_rows(rows, ROWS_SOURCE)


def world_episode_ratio(ep: dict[str, Any], rows_step: dict[str, Any], forbidden: frozenset[str]) -> Any:
    refuse_forbidden_place(ep["place_id"], forbidden)
    cal = place_calendar_from_step(ep["place_id"], rows_step)
    return calendar_ratio(ep["place_id"], exclude_year=window_years_of_ep(ep), firms_calendar=lambda _r: cal)


def resolve_paths_from_env(
    plan_json: str | Path | None = None,
    world_dir: str | Path | None = None,
    cmr_seed_dir: str | Path | None = None,
    split_md: str | Path | None = None,
) -> tuple[Path | None, Path | None, Path | None, Path | None]:
    pj = Path(plan_json) if plan_json else (Path(os.environ[PLAN_JSON_ENV]) if os.environ.get(PLAN_JSON_ENV) else None)
    sm = Path(split_md) if split_md else (Path(os.environ[SPLIT_MD_ENV]) if os.environ.get(SPLIT_MD_ENV) else None)
    wd = Path(world_dir) if world_dir else (Path(os.environ[WORLD_STORE_ENV]) if os.environ.get(WORLD_STORE_ENV) else None)
    cs = Path(cmr_seed_dir) if cmr_seed_dir else (Path(os.environ[CMR_SEED_ENV]) if os.environ.get(CMR_SEED_ENV) else None)
    return pj, wd, cs, sm
