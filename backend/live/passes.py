"""Coming passes of the sharp satellites over a box, and the real pass once it is listed.

A coming pass is a pass of the standard collection one repeat cycle (16 days) earlier, moved forward by the cycle:
NOAA-20 and NOAA-21 fly a 16-day repeat orbit, so their granules over a box start at the same minutes 16 days apart.
The minute the scan crosses the box and the pixel size there come from the granule polygon as
`backend/eval/schedule.py` computes them for a listed pass. Only granule metadata is read: no row of any satellite.
"""

from __future__ import annotations

from typing import Any

from backend.eval import schedule as S
from backend.eval.schedule import Slot
from backend.firms import cmr_passes as C
from backend.live import protocol as PR
from backend.live.fetch import CmrFetcher, iso
from backend.model.platforms import family
from backend.model.real_geometry import _HALF_SWATH_KM, pixel_km_at_ground_distance


def _t(text: str) -> float:
    return S._t(text)


def passes_of(granules: list[dict[str, Any]], box: tuple[float, float, float, float], platform: str) -> list[dict[str, Any]]:
    """Granules grouped into passes (as `backend.firms.cmr_passes` groups them), each with the share of the box inside
    its swath and, where a granule's polygon holds the box centre, the minute the scan crossed it."""
    seen, uniq = set(), []
    for g in sorted(granules, key=lambda g: (g["time_start"], g["id"])):
        if g["time_start"] in seen:  # a granule listed twice (reprocessed) is one granule
            continue
        seen.add(g["time_start"])
        uniq.append(g)
    lon, lat = 0.5 * (box[0] + box[2]), 0.5 * (box[1] + box[3])
    out = []
    for grp in C._group(uniq):
        rings = [C.densify(r) for g in grp for r in g["rings"]]
        share = C.share_inside(box, rings, C.BOX_SAMPLES)
        if share <= 0.0:
            continue
        where = None
        for g in grp:
            for ring in g["rings"]:
                if len(ring) >= 4 and S.ring_holds(ring, lon, lat):
                    where = S.swath_position(ring, lon, lat, platform, _t(g["time_start"]), _t(g["time_end"]))
                    break
            if where is not None:
                break
        out.append({
            "platform": platform, "time_start": grp[0]["time_start"], "time_end": grp[-1]["time_end"],
            "granules": [g["id"] for g in grp], "box_share": round(share, 4), "box_inside": share >= 1.0,
            "time_at_box_s": None if where is None else float(where["time_s"]),
            "cross_track_km": None if where is None else float(where["cross_track_km"]),
            "satellite_side": None if where is None else str(where["satellite_side"]),
            "swath_width_km": None if where is None else where.get("swath_width_km"),
        })
    return out


def slot_from_pass(p: dict[str, Any], box: tuple[float, float, float, float], shift_s: float = 0.0) -> Slot:
    """What a method is told about a pass (protocol version 3 of the blind test), moved by `shift_s`."""
    lon = 0.5 * (box[0] + box[2])
    fam = family(p["platform"])
    scan, track = pixel_km_at_ground_distance(fam, min(float(p["cross_track_km"]), _HALF_SWATH_KM[fam]))
    t = float(p["time_at_box_s"]) + shift_s
    return Slot(
        index=0, platform=p["platform"], time_s=t, is_day=S.is_day_at(t, lon), scan_km=scan, track_km=track,
        span_s=(_t(p["time_start"]) + shift_s, _t(p["time_end"]) + shift_s), cross_track_km=float(p["cross_track_km"]),
        satellite_side=p["satellite_side"], swath_width_km=p["swath_width_km"], cloud_cover_pct=None,
        box_share=float(p["box_share"]), source=S.SOURCE_CMR,
    )


def slot_dict(s: Slot) -> dict[str, Any]:
    return {**s.as_dict(), "time_s": s.time_s, "span_s": list(s.span_s) if s.span_s else None, "span_utc":
            [iso(s.span_s[0]), iso(s.span_s[1])] if s.span_s else None, "satellite_side": s.satellite_side,
            "swath_width_km": s.swath_width_km, "scan_km_exact": s.scan_km, "track_km_exact": s.track_km}


def slot_from_dict(d: dict[str, Any], span_s: tuple[float, float] | None = None) -> Slot:
    """The sealed slot again, exactly as a method was told it; `span_s` replaces the span rows are matched in."""
    return Slot(
        index=0, platform=d["platform"], time_s=float(d["time_s"]), is_day=bool(d["is_day"]),
        scan_km=float(d["scan_km_exact"]), track_km=float(d["track_km_exact"]),
        span_s=tuple(span_s) if span_s is not None else tuple(d["span_s"]),
        cross_track_km=d.get("cross_track_km"), satellite_side=d.get("satellite_side"),
        swath_width_km=d.get("swath_width_km"), cloud_cover_pct=None, box_share=d.get("box_share"), source=S.SOURCE_CMR,
    )


BLOCK_S: float = 6 * 3600.0  # passes are predicted in fixed blocks of UTC time, so each template is one fixed question


def coming_block(cmr: CmrFetcher, box: tuple[float, float, float, float], block_start_s: float) -> list[dict[str, Any]]:
    """Predicted passes of every platform whose predicted time at the box lies in the block, each with its template.
    Passes whose swath does not hold the whole box are listed with `slot` None."""
    t0, t1 = block_start_s, block_start_s + BLOCK_S
    out = []
    for platform in PR.PLATFORMS:
        coll = PR.TEMPLATE_COLLECTIONS[platform]
        for days in PR.REPEAT_DAYS:
            shift = days * 86400.0
            # the template window is widened by a granule on each side so a pass at the edge is whole
            gran = cmr.granules(coll, box, t0 - shift - 900.0, t1 - shift + 900.0)
            if gran:
                break
        else:
            continue
        for p in passes_of(gran, box, platform):
            if p["time_at_box_s"] is None:
                continue
            t = p["time_at_box_s"] + shift
            if not (t0 <= t < t1):
                continue
            slot = slot_from_pass(p, box, shift) if p["box_inside"] else None
            out.append({"platform": platform, "predicted_time_s": t, "repeat_days": days, "template": {
                "collection": coll, "time_start": p["time_start"], "time_end": p["time_end"],
                "granules": p["granules"], "box_share": p["box_share"]}, "slot": slot})
    out.sort(key=lambda x: (x["predicted_time_s"], x["platform"]))
    return out


def coming(cmr: CmrFetcher, box: tuple[float, float, float, float], t0: float, t1: float) -> list[dict[str, Any]]:
    """Predicted passes whose predicted time at the box lies in [t0, t1), read block by block."""
    out = []
    b = (t0 // BLOCK_S) * BLOCK_S
    while b < t1:
        out += [p for p in coming_block(cmr, box, b) if t0 <= p["predicted_time_s"] < t1]
        b += BLOCK_S
    return out


def real_pass(cmr: CmrFetcher, box: tuple[float, float, float, float], platform: str, predicted_s: float,
              reuse_within_s: float | None) -> dict[str, Any] | None:
    """The listed near real time pass of the platform over the box whose time at the box is nearest the predicted
    time and within the tolerance, or None while there is none."""
    tol = PR.CONFIRM_TOLERANCE_S
    gran = cmr.granules(PR.NRT_COLLECTIONS[platform], box, predicted_s - tol - 900.0, predicted_s + tol + 900.0,
                        reuse_within_s=reuse_within_s)
    best = None
    for p in passes_of(gran, box, platform):
        t = p["time_at_box_s"]
        if t is None:
            mid = 0.5 * (_t(p["time_start"]) + _t(p["time_end"]))
            t = mid
        if abs(t - predicted_s) <= tol and (best is None or abs(t - predicted_s) < abs(best["time_at_box_s_or_mid"] - predicted_s)):
            best = {**p, "time_at_box_s_or_mid": t}
    return best
