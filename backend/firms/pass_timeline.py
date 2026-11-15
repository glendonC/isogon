"""The pass timeline: every satellite pass over a hero region's box in a
window, from NASA CMR granule metadata (`cmr_passes`), fire or no fire, each with what FIRMS detected in the box on
that pass. Served by `GET /api/passes?region_id=<id>&start=<date>&end=<date>[&box=pack|context][&platforms=...]`.

A pass is matched to a FIRMS overpass (FIRMS rows grouped as the blind test groups them,
`backend.eval.overpass.group_overpasses`) of the same platform whose time lies within `MATCH_TOL_S` of the pass's
granule span. On June to September 2021 every FIRMS overpass with a detection in a hero box matches exactly one pass
this way. FIRMS overpasses with a detection in the box that no pass matches are listed apart: in 2012 to 2025
that happens only where a CMR collection is short (`KNOWN_GAPS`).

With `hidden` (an instrument family, "VIIRS") the list is the one a held-out window may show: that family's rows are
dropped before any matching, so its passes carry the pass itself (time, coverage, granules) and no FIRMS field, its
summary counts passes only, and no unmatched overpass of it is listed. The full list, without `hidden`, belongs to
the reveal.

Each pass also carries `box_cloud`: the share of the region's box under cloud on that pass's UTC day and half-orbit,
from that satellite's own daily cloud layer in NASA's Global Imagery Browse Services, as the world store holds it
(`cloud/<region>/<day>/<day|night>.json`, written by `backend.server_gibs sync`), or why it is not measured. It is for
display only: no run, score, round or test reads it. A hidden pass's is withheld with its FIRMS fields.
"""

from __future__ import annotations

import datetime as _dt
from pathlib import Path
from typing import Any, Callable, Iterable

import numpy as np

from backend.firms.archive import REGION_COUNTRY, read_firms as _read_firms, region_box
from backend.firms.cmr_passes import CMR_CACHE_DIR, COLLECTIONS, cmr_passes

MAX_SPAN_DAYS: int = 366
HIDDEN_FAMILIES: tuple[str, ...] = ("VIIRS",)
MATCH_TOL_S: float = 300.0
BOXES: tuple[str, ...] = ("pack", "context")
STATIC_TYPE: int = 2
# Where a CMR collection holds fewer granules than flew (docs/data.md; found by matching passes to FIRMS overpasses).
KNOWN_GAPS: tuple[dict[str, str], ...] = (
    {"platform": "VIIRS_NOAA20", "from": "2018-01-01", "until": "2018-07-01",
     "what": "VJ114IMG 002 holds few granules (0 to 12 a month in April and May 2018); FIRMS has NOAA-20 rows from April"},
    {"platform": "MODIS_TERRA", "from": "2025-05-12", "until": "2025-05-16",
     "what": "MOD14 061 has no granule on 13 to 15 May 2025 (12 to 15 over Evia); FIRMS has Terra rows on 14 and 15 May"},
    {"platform": "MODIS_AQUA", "from": "2022-04-01", "until": "2022-04-16",
     "what": "MYD14 061 has no granule over the hero boxes, and FIRMS has no Aqua row either (an outage)"},
)
BOX_CLOUD_WHAT: str = (
    "box_cloud: the share of the region's box (the pack box) under cloud on the pass's UTC day and half-orbit, from "
    "that satellite's own daily cloud layer in NASA's Global Imagery Browse Services (MODIS Cloud Fraction for Terra "
    "and Aqua, one minus VIIRS Clear Sky Confidence for Suomi NPP and NOAA-20), as the world store holds it; "
    "\"not measured\" with the reason where the store holds none for that day or the layer has no valid pixel over "
    "the box. A daily composite, not the pass's own view. For display only: no run, score, round or test reads it."
)
NOT_MEASURED: str = "not measured"
LIMITS: str = (
    "A pass without a FIRMS detection looked at the box and flagged nothing, or the box was under cloud: MODIS cloud "
    "cover here is the mean over the whole granule (about 2,300 by 2,000 km), not over the box, and the VIIRS fire "
    "granules carry none. box_share is the share of an 11 by 11 grid of box points inside the swath polygons "
    "(edges along great circles)."
)


def _utc(v: str) -> _dt.datetime:
    text = str(v).strip()
    try:
        if len(text) == 10:
            return _dt.datetime.fromisoformat(text).replace(tzinfo=_dt.timezone.utc)
        t = _dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"'{v}' is not a UTC date (YYYY-MM-DD) or date-time") from exc
    return t if t.tzinfo else t.replace(tzinfo=_dt.timezone.utc)


def _iso(t: float) -> str:
    return _dt.datetime.fromtimestamp(round(float(t)), _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ts(s: str) -> float:
    return _dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def cloud_store() -> Path:
    """The world store's folder of NASA's daily pictures and cloud shares (`backend.server_gibs.gibs_dir`)."""
    from backend.server_gibs import gibs_dir

    return gibs_dir()


def cloud_store_key(region_id: str, store: Path | None = None) -> tuple[Any, ...]:
    """What a cached pass list's cloud shares depend on: the region's folder of cloud files and each of its days, by
    their modification times, so a cached list is made again once the store's sync adds a day."""
    root = (Path(store) if store is not None else cloud_store()) / "cloud" / region_id
    try:
        return (root.stat().st_mtime_ns, tuple(sorted((d.name, d.stat().st_mtime_ns) for d in root.iterdir() if d.is_dir())))
    except OSError:
        return ()


def box_cloud(region_id: str, passes: list[dict[str, Any]], store: Path | None = None) -> list[dict[str, Any]]:
    """For each pass, the cloud share over the region's pack box on its UTC day and half-orbit from the store's cloud
    files, or why it is not measured. Reads no tile and fetches nothing; a recorded test fire's window is never read."""
    import json

    from backend.firms.gibs_cloud import CLOUD_LAYERS, pass_when
    from backend.model.training import closed_for
    from backend.terrain.live_region import PRESET_BY_ID

    root = Path(store) if store is not None else cloud_store()
    b = PRESET_BY_ID[region_id].bbox
    pack = (round(float(b.west), 6), round(float(b.south), 6), round(float(b.east), 6), round(float(b.north), 6))
    lon_c, lat_c = (pack[0] + pack[2]) / 2.0, (pack[1] + pack[3]) / 2.0
    files: dict[tuple[str, str], Any] = {}

    def none(why: str) -> dict[str, Any]:
        return {"share": None, "state": NOT_MEASURED, "why": why}

    out: list[dict[str, Any]] = []
    for p in passes:
        day = str(p["time_mid"])[:10]
        try:
            when = pass_when(p["day_night"], p["time_mid"], lon_c, lat_c)
        except ValueError:
            out.append(none(f"the pass's day or night is not known ({p['day_night']})"))
            continue
        spec = CLOUD_LAYERS.get((p["platform"], when))
        if spec is None:
            out.append(none(f"NASA's imagery services hold no cloud layer for {p['platform']}"))
            continue
        if (day, when) not in files:
            t0 = _utc(day).timestamp()
            doc: Any = "closed" if closed_for(pack, t0, t0 + 86400.0) is not None else None
            path = root / "cloud" / region_id / day / f"{when}.json"
            if doc is None and path.is_file():
                try:
                    doc = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    doc = None
            if isinstance(doc, dict) and [round(float(v), 6) for v in doc.get("box") or []] != list(pack):
                doc = "other box"
            files[(day, when)] = doc
        doc = files[(day, when)]
        if doc == "closed":
            out.append(none("no cloud is read on a recorded test fire's window"))
            continue
        if not isinstance(doc, dict):
            out.append(none(f"the store holds no cloud share of this box for {day} ({when})"))
            continue
        res = (doc.get("platforms") or {}).get(p["platform"]) or {}
        if res.get("share") is None:
            out.append(none(f"{spec.layer} has no valid pixel over the box on {day}"))
            continue
        out.append({"share": round(float(res["share"]), 4), "layer": spec.layer, "day": day, "when": when,
                    "pixel_km": res.get("pixel_km"), "retrieved_utc": res.get("retrieved_utc") or doc.get("retrieved_utc")})
    return out


def pass_timeline(
    region_id: str,
    start: str,
    end: str,
    box: str = "pack",
    platforms: Iterable[str] | None = None,
    read_firms: Callable[..., list[dict[str, str]]] = _read_firms,
    cache_dir: Path = CMR_CACHE_DIR,
    hidden: str | None = None,
    cloud_dir: Path | None = None,
) -> dict[str, Any]:
    """Every pass over the region's `box` ("pack": the region's terrain pack box, the blind test's box; "context")
    in [start, end) UTC. Raises KeyError for an unknown region, ValueError for a bad window, CmrCacheMissing or
    FirmsCacheMissing for what is not cached."""
    from backend.eval.overpass import group_overpasses
    from backend.eval.rows import detections_from_rows
    from backend.model.platforms import family
    from backend.model.real_run import ROW_SOURCE
    from backend.terrain.live_region import PRESET_BY_ID

    if hidden is not None:
        hidden = str(hidden).upper()
        if hidden not in HIDDEN_FAMILIES:
            raise ValueError(f"hidden must be one of {HIDDEN_FAMILIES}")

    if region_id not in REGION_COUNTRY:
        raise KeyError(f"no pass schedule for region '{region_id}'")
    if box not in BOXES:
        raise ValueError(f"box must be one of {BOXES}")
    t0, t1 = _utc(start), _utc(end)
    if t1 <= t0:
        raise ValueError("end must be after start")
    if (t1 - t0).total_seconds() > MAX_SPAN_DAYS * 86400.0:
        raise ValueError(f"the window may span at most {MAX_SPAN_DAYS} days")
    want = None
    if platforms is not None:
        want = [p for p in platforms]
        unknown = [p for p in want if p not in COLLECTIONS]
        if unknown:
            raise ValueError(f"unknown platforms {unknown}; known: {list(COLLECTIONS)}")
    if box == "pack":
        b = PRESET_BY_ID[region_id].bbox
        wsen = (b.west, b.south, b.east, b.north)
    else:
        wsen = region_box(region_id)

    passes = cmr_passes(wsen, t0, t1, platforms=want, cache_dir=cache_dir)

    # FIRMS overpasses with a detection in the box, grouped as the blind test groups them
    pad = _dt.timedelta(seconds=MATCH_TOL_S + 3600.0)
    rows = read_firms(region_box(region_id), t0 - pad, t1 + pad)
    if hidden is not None:   # the hidden family's rows go before anything is matched or counted
        rows = [r for r in rows if str(r.get("instrument", "")).upper() != hidden]
    det = detections_from_rows(rows, ROW_SOURCE) if rows else None
    firms: list[dict[str, Any]] = []
    if det is not None and len(det):
        inb = det.in_box(wsen)
        for o in group_overpasses(det):
            idx = o.index[inb[o.index]]
            if idx.size == 0 or (want is not None and o.platform not in want):
                continue
            firms.append({
                "platform": o.platform, "time_s": float(o.time_s), "pixels": int(idx.size),
                "static_pixels": int((det.type_code[idx] == STATIC_TYPE).sum()),
                "frp_mw": float(np.nansum(det.frp_mw[idx])),
            })
    by_plat: dict[str, list[dict[str, Any]]] = {}
    for f in firms:
        by_plat.setdefault(f["platform"], []).append(f)
    matched: set[int] = set()

    def is_hidden(platform: str) -> bool:
        return hidden is not None and family(platform) == hidden

    clouds = box_cloud(region_id, passes, cloud_dir)
    out_passes = []
    for p, cloud in zip(passes, clouds):
        a, z = _ts(p["time_start"]) - MATCH_TOL_S, _ts(p["time_end"]) + MATCH_TOL_S
        hits = [f for f in by_plat.get(p["platform"], []) if a <= f["time_s"] <= z]
        matched.update(id(f) for f in hits)
        firms_fields: dict[str, Any] = {
            "firms_detection_in_box": bool(hits),
            "firms_pixels_in_box": sum(f["pixels"] for f in hits),
            "firms_static_pixels_in_box": sum(f["static_pixels"] for f in hits),
            "firms_frp_mw_in_box": round(sum(f["frp_mw"] for f in hits), 2),
            "firms_overpass_utc": [_iso(f["time_s"]) for f in hits],
        }
        if is_hidden(p["platform"]):
            firms_fields = {"firms_withheld": True}
            cloud = {"share": None, "state": "withheld", "why": "a hidden pass's cloud is shown with its detections"}
        out_passes.append({
            "platform": p["platform"],
            "time_start": p["time_start"],
            "time_end": p["time_end"],
            "time_mid": p["time_mid"],
            "day_night": p["day_night"],
            "box_share": p["box_share"],
            "box_inside": p["box_inside"],
            "cloud_cover_pct": p["cloud_cover_pct"],
            "granules": p["granules"],
            "box_cloud": cloud,
            **firms_fields,
        })
    in_window = [f for f in firms if t0.timestamp() <= f["time_s"] < t1.timestamp()]
    unmatched = [{"platform": f["platform"], "time_utc": _iso(f["time_s"]), "pixels": f["pixels"]}
                 for f in in_window if id(f) not in matched]

    summary: dict[str, dict[str, Any]] = {}
    for q in out_passes:
        if q.get("firms_withheld"):
            summary.setdefault(q["platform"], {"passes": 0, "firms_withheld": True})["passes"] += 1
            continue
        s = summary.setdefault(q["platform"], {"passes": 0, "with_detection": 0, "without_detection": 0,
                                               "without_detection_whole_box": 0})
        s["passes"] += 1
        if q["firms_detection_in_box"]:
            s["with_detection"] += 1
        else:
            s["without_detection"] += 1
            s["without_detection_whole_box"] += int(bool(q["box_inside"]))
    gaps = [g for g in KNOWN_GAPS if (want is None or g["platform"] in want)
            and _utc(g["from"]) < t1 and _utc(g["until"]) > t0]
    out_hidden = ({"hidden": hidden,
                   "withheld": (f"what FIRMS detected on the {hidden} passes: their detection, pixel, static pixel and "
                                f"power fields, their summary counts and their unmatched overpasses; the {hidden} rows "
                                "were dropped before matching"),
                   "reveal_with": "the same request without hidden"} if hidden else {"hidden": None})
    return {
        "region_id": region_id,
        "source": "firms",
        **out_hidden,
        "box": box,
        "box_wsen": [round(float(v), 6) for v in wsen],
        "start": t0.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end": t1.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "passes": out_passes,
        "summary": dict(sorted(summary.items())),
        "firms_overpasses_without_a_pass": unmatched,
        "known_gaps": gaps,
        "matching": (f"a pass has a FIRMS detection when a FIRMS overpass of the same platform (rows grouped by "
                     f"backend.eval.overpass.group_overpasses) with a pixel in the box lies within "
                     f"{MATCH_TOL_S / 60:.0f} minutes of the pass's granule span"),
        "collections": {k: {"concept_id": v["concept_id"], "short_name": v["short_name"], "version": v["version"]}
                        for k, v in COLLECTIONS.items() if want is None or k in want},
        "limits": LIMITS,
        "box_cloud_what": BOX_CLOUD_WHAT,
        "provenance": "NASA CMR granule search (keyless metadata, cached under data/cache/cmr) and NASA FIRMS rows",
    }
