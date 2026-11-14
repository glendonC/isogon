"""The pass timeline (CONTRACT item 12, surface S3, and item 13): every satellite pass over a hero region's box in a
window, from NASA CMR granule metadata (`cmr_passes`), fire or no fire, each with what FIRMS detected in the box on
that pass. Served by `GET /api/passes?region_id=<id>&start=<date>&end=<date>[&box=pack|context][&platforms=...]`.

A pass is matched to a FIRMS overpass (FIRMS rows grouped as the fire-model lane groups them,
`backend.eval.overpass.group_overpasses`) of the same platform whose time lies within `MATCH_TOL_S` of the pass's
granule span. On June to September 2021 every FIRMS overpass with a detection in a hero box matched exactly one pass
this way (D6). FIRMS overpasses with a detection in the box that no pass matches are listed apart: in 2012 to 2025
that happens only where a CMR collection is short (`KNOWN_GAPS`).
"""

from __future__ import annotations

import datetime as _dt
from pathlib import Path
from typing import Any, Callable, Iterable

import numpy as np

from backend.firms.archive import REGION_COUNTRY, read_firms as _read_firms, region_box
from backend.firms.cmr_passes import CMR_CACHE_DIR, COLLECTIONS, cmr_passes

MAX_SPAN_DAYS: int = 366
MATCH_TOL_S: float = 300.0
BOXES: tuple[str, ...] = ("pack", "context")
STATIC_TYPE: int = 2
# Where a CMR collection holds fewer granules than flew (D6 cross-check against FIRMS, docs/03).
KNOWN_GAPS: tuple[dict[str, str], ...] = (
    {"platform": "VIIRS_NOAA20", "from": "2018-01-01", "until": "2018-07-01",
     "what": "VJ114IMG 002 holds few granules (0 to 12 a month in April and May 2018); FIRMS has NOAA-20 rows from April"},
    {"platform": "MODIS_TERRA", "from": "2025-05-12", "until": "2025-05-16",
     "what": "MOD14 061 has no granule on 13 to 15 May 2025 (12 to 15 over Evia); FIRMS has Terra rows on 14 and 15 May"},
    {"platform": "MODIS_AQUA", "from": "2022-04-01", "until": "2022-04-16",
     "what": "MYD14 061 has no granule over the hero boxes, and FIRMS has no Aqua row either (an outage)"},
)
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


def pass_timeline(
    region_id: str,
    start: str,
    end: str,
    box: str = "pack",
    platforms: Iterable[str] | None = None,
    read_firms: Callable[..., list[dict[str, str]]] = _read_firms,
    cache_dir: Path = CMR_CACHE_DIR,
) -> dict[str, Any]:
    """Every pass over the region's `box` ("pack": the region's terrain pack box, the blind test's box; "context")
    in [start, end) UTC. Raises KeyError for an unknown region, ValueError for a bad window, CmrCacheMissing or
    FirmsCacheMissing for what is not cached."""
    from backend.eval.overpass import group_overpasses
    from backend.eval.rows import detections_from_rows
    from backend.model.real_run import ROW_SOURCE
    from backend.terrain.live_region import PRESET_BY_ID

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

    # FIRMS overpasses with a detection in the box, grouped as the fire-model lane groups them
    pad = _dt.timedelta(seconds=MATCH_TOL_S + 3600.0)
    rows = read_firms(region_box(region_id), t0 - pad, t1 + pad)
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

    out_passes = []
    for p in passes:
        a, z = _ts(p["time_start"]) - MATCH_TOL_S, _ts(p["time_end"]) + MATCH_TOL_S
        hits = [f for f in by_plat.get(p["platform"], []) if a <= f["time_s"] <= z]
        matched.update(id(f) for f in hits)
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
            "firms_detection_in_box": bool(hits),
            "firms_pixels_in_box": sum(f["pixels"] for f in hits),
            "firms_static_pixels_in_box": sum(f["static_pixels"] for f in hits),
            "firms_frp_mw_in_box": round(sum(f["frp_mw"] for f in hits), 2),
            "firms_overpass_utc": [_iso(f["time_s"]) for f in hits],
        })
    in_window = [f for f in firms if t0.timestamp() <= f["time_s"] < t1.timestamp()]
    unmatched = [{"platform": f["platform"], "time_utc": _iso(f["time_s"]), "pixels": f["pixels"]}
                 for f in in_window if id(f) not in matched]

    summary: dict[str, dict[str, int]] = {}
    for q in out_passes:
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
    return {
        "region_id": region_id,
        "source": "firms",
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
        "provenance": "NASA CMR granule search (keyless metadata, cached under data/cache/cmr) and NASA FIRMS rows",
    }
