"""When to publish a prediction for a hidden instrument, without asking its rows.

Two schedules, neither read from a detection:

  cmr       NASA's CMR lists every granule of the fire products, fire or no fire, with its time span and swath
            polygon (`backend.firms.cmr_passes`). A pass whose swath holds the whole box is a slot. Where
            the box lies inside the polygon gives the minute the scan crossed it and its distance from the ground
            track, and that distance gives the pixel size (`swath_position`). Checked on training years against
            the rows' own values: the time is within the minute FIRMS reports and the pixel size within a few
            hundredths of a kilometre.
  nominal   the fallback when no pass list is cached for the window: one slot per platform and half day at the
            platform's nominal crossing time, with the instrument's median pixel across its swath. The real pass
            is up to about 100 minutes from such a slot.

Every method is told a slot (`Slot`): platform, time, day or night, pixel size. Nothing else. A pass that covered
the box and left no hidden detection is still a slot; it is scored as a look that flagged nothing.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any, Callable

import numpy as np

from backend.model import platforms as P
from backend.model.platforms import PLATFORMS, archive_platforms, family
from backend.model.real_geometry import (
    nominal_subsat_lst_hr,
    pixel_km_at_ground_distance,
    pixel_km_from_pass_time,
    typical_pixel_km,
)

SOURCE_CMR: str = "cmr"
SOURCE_NOMINAL: str = "nominal"
SOURCE_HIDDEN_TIMES: str = "hidden_pass_times"
SOURCE_AUTO: str = "auto"       # the pass list when it answers for the window, else the nominal schedule

NOTES: dict[str, str] = {
    SOURCE_CMR: (
        "one slot per pass of a hidden platform whose swath holds the whole box, from NASA CMR granule metadata: the "
        "time the scan crossed the box and the pixel size there, both from the swath polygon. Nothing is read from "
        "the hidden rows. A pass with no hidden detection is scored as a look that flagged nothing; VIIRS granules "
        "carry no cloud information and MODIS cloud cover is a granule mean, so such a look may have been cloudy."
    ),
    SOURCE_NOMINAL: (
        "one slot per hidden platform and half day, at the time the platform's nominal ground track crosses the "
        "box's latitude; pixel size is the instrument's median pixel across its swath. Nothing is read from the "
        "hidden rows. The real pass is up to about 100 minutes from the slot and its pixel size is not known."
    ),
    SOURCE_HIDDEN_TIMES: (
        "DIAGNOSTIC, not blind: one slot per hidden overpass, at the time and for the platform read from the "
        "hidden rows; pixel size from that time and the nominal orbit. It measures what a list of real overpass "
        "times would be worth."
    ),
}

# A platform's slots start here when its CMR collection is short before that day (NOAA-20's 375 m fire collection
# holds only a few granules from March to June 2018; no other collection is mixed in).
PASS_LIST_FIRST_DAY: dict[str, str] = {"VIIRS_NOAA20": "2018-07-01"}
# Rows of a pass lie inside its granules' time span; FIRMS reports the minute, so a row can sit this far outside.
ROW_MATCH_TOLERANCE_S: float = 90.0
EARTH_RADIUS_KM: float = 6371.0088

PassReader = Callable[..., list[dict[str, Any]]]


@dataclass(frozen=True)
class Slot:
    """One scheduled look of a platform: everything a method is told about it."""

    index: int
    platform: str
    time_s: float        # UTC seconds: when the scan crossed the box (pass list) or the nominal crossing time
    is_day: bool
    scan_km: float       # pixel size to assume along scan
    track_km: float      # and along track
    # Pass list only. None of it comes from a detection.
    span_s: tuple[float, float] | None = None      # time span of the pass's granules; its rows lie inside it
    cross_track_km: float | None = None            # distance of the box centre from the ground track
    satellite_side: str | None = None              # "east" or "west": where the satellite stood, seen from the box
    swath_width_km: float | None = None            # width of the granule's polygon at the box
    cloud_cover_pct: float | None = None           # MODIS granule mean; VIIRS granules give none
    box_share: float | None = None                 # share of the box inside the swath (1.0 for every slot kept)
    source: str = SOURCE_NOMINAL

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "index": self.index,
            "platform": self.platform,
            "time_utc": str(np.datetime64(int(round(self.time_s)), "s")) + "Z",
            "is_day": self.is_day,
            "scan_km": round(self.scan_km, 4),
            "track_km": round(self.track_km, 4),
        }
        if self.source == SOURCE_CMR:
            out.update(
                cross_track_km=None if self.cross_track_km is None else round(self.cross_track_km, 1),
                cloud_cover_pct=self.cloud_cover_pct,
                box_share=self.box_share,
            )
        return out

    def reindexed(self, index: int) -> Slot:
        from dataclasses import replace

        return replace(self, index=index)


def is_day_at(time_s: float, lon_deg: float) -> bool:
    """Day side or night side from local solar time alone (06:00 to 18:00 is day). The platforms here pass near
    01:30, 10:30 and 13:30 local time, far from either boundary; on real rows this agrees with every row's flag."""
    lst = ((time_s % 86400.0) / 3600.0 + lon_deg / 15.0) % 24.0
    return 6.0 <= lst < 18.0


def nominal_slots(
    platforms: tuple[str, ...], start_s: float, end_s: float, lon_deg: float, lat_deg: float
) -> list[Slot]:
    """Every nominal look of the given platforms in [start_s, end_s), in time order (ties by platform order)."""
    found: list[tuple[float, int, str, bool]] = []
    for name in platforms:
        for day in (True, False):
            lst = nominal_subsat_lst_hr(name, day, lat_deg)
            # UTC seconds of day at which the box's local solar time equals that crossing time
            sod = ((lst - lon_deg / 15.0) % 24.0) * 3600.0
            k = math.floor((start_s - sod) / 86400.0)
            t = k * 86400.0 + sod
            while t < end_s:
                if t >= start_s:
                    found.append((t, PLATFORMS.index(name), name, day))
                t += 86400.0
    found.sort()
    out: list[Slot] = []
    for i, (t, _, name, day) in enumerate(found):
        scan, track = typical_pixel_km(family(name))
        out.append(Slot(i, name, float(t), day, scan, track))
    return out


def slots_from_pass_times(passes: list[tuple[str, float]], start_s: float, end_s: float, lon_deg: float, lat_deg: float) -> list[Slot]:
    """The diagnostic schedule: one slot per (platform, time) given. See `NOTES[SOURCE_HIDDEN_TIMES]`."""
    inside = sorted((t, PLATFORMS.index(p), p) for p, t in passes if start_s <= t < end_s)
    out: list[Slot] = []
    for i, (t, _, name) in enumerate(inside):
        scan, track = pixel_km_from_pass_time(name, t, lon_deg, lat_deg)
        out.append(Slot(i, name, float(t), is_day_at(t, lon_deg), scan, track))
    return out


def hidden_platforms_in(hidden_family: str | None, named: tuple[str, ...] | None, start_s: float, end_s: float) -> tuple[str, ...]:
    """The hidden platforms that had rows in the archive during the window, from the archive's dates alone."""
    if named is not None:
        names: set[str] = set()
        for fam in sorted({family(n) for n in named}):
            names.update(n for n in archive_platforms(fam, start_s, end_s) if n in named)
        return tuple(n for n in PLATFORMS if n in names)
    if hidden_family is None:
        return ()
    return archive_platforms(hidden_family, start_s, end_s)


def slot_of(slots: list[Slot], platform: str, time_s: float, max_gap_s: float = 6.5 * 3600.0) -> int | None:
    """Index of the slot of `platform` nearest in time, or None when none lies within `max_gap_s`."""
    best: tuple[float, int] | None = None
    for s in slots:
        if s.platform != platform:
            continue
        gap = abs(s.time_s - time_s)
        if best is None or gap < best[0]:
            best = (gap, s.index)
    return None if best is None or best[0] > max_gap_s else best[1]


# ---- the pass list (NASA CMR granule metadata) ------------------------------------------------------------------

def _xyz(lon: float, lat: float) -> np.ndarray:
    lo, la = math.radians(lon), math.radians(lat)
    return np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])


def _lonlat(v: np.ndarray) -> tuple[float, float]:
    v = v / np.linalg.norm(v)
    return math.degrees(math.atan2(float(v[1]), float(v[0]))), math.degrees(math.asin(max(-1.0, min(1.0, float(v[2])))))


def _bearing(a: tuple[float, float], b: tuple[float, float]) -> float:
    lo1, la1, lo2, la2 = (math.radians(v) for v in (a[0], a[1], b[0], b[1]))
    y = math.sin(lo2 - lo1) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(lo2 - lo1)
    return math.degrees(math.atan2(y, x)) % 360.0


def _distance_to_edge_km(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distance on the ground from a point to the great circle through an edge."""
    n = np.cross(_xyz(*a), _xyz(*b))
    n = n / np.linalg.norm(n)
    return abs(math.asin(max(-1.0, min(1.0, float(np.dot(_xyz(*p), n)))))) * EARTH_RADIUS_KM


def ring_holds(ring: list[list[float]], lon: float, lat: float) -> bool:
    """True when the point lies inside a four-cornered swath polygon whose edges are great circles."""
    pts = [_xyz(*c) for c in ring[:4]]
    p = _xyz(lon, lat)
    sides = [float(np.dot(p, np.cross(pts[i], pts[(i + 1) % 4]))) for i in range(4)]
    return all(s > 0 for s in sides) or all(s < 0 for s in sides)


def swath_position(
    ring: list[list[float]], lon: float, lat: float, platform: str, start_s: float, end_s: float
) -> dict[str, Any]:
    """Where a point lies inside one granule's swath polygon.

    A granule polygon has four corners: two of its edges are the first and last scan lines, the other two the
    edges of the swath. The pair that runs along the platform's ground track at this latitude is the swath's
    edges. Half the difference of the distances to them is the distance from the ground track; the share of the
    way from the first scan line to the last, times the granule's length in time, is when the scan crossed the
    point. The satellite stands west of the point when the point is nearer the swath's eastern edge.
    """
    corners = [(float(c[0]), float(c[1])) for c in ring[:4]]
    edges = [(corners[i], corners[(i + 1) % 4]) for i in range(4)]
    is_day = is_day_at(start_s, lon)
    heading = P.track_heading_deg(platform, is_day, lat)

    def off_track(edge: tuple[tuple[float, float], tuple[float, float]]) -> float:
        return abs(((_bearing(*edge) - heading + 90.0) % 180.0) - 90.0)

    along = sorted(range(4), key=lambda i: off_track(edges[i]))[:2]
    across = [i for i in range(4) if i not in along]
    d = [_distance_to_edge_km((lon, lat), *edges[i]) for i in along]
    a = [_distance_to_edge_km((lon, lat), *edges[i]) for i in across]
    centre = _lonlat(sum(_xyz(*c) for c in corners))
    mid_v = [_xyz(*edges[i][0]) + _xyz(*edges[i][1]) for i in across]
    ahead = [abs(((_bearing(centre, _lonlat(m)) - heading + 180.0) % 360.0) - 180.0) for m in mid_v]
    i_start = 1 - int(np.argmin(ahead))
    share = a[i_start] / max(a[0] + a[1], 1e-9)
    # The ground track runs through the middle of the first scan line and the middle of the last. A point left of
    # the flight direction lies east of the track when the satellite flies south, west of it when it flies north.
    left = float(np.dot(_xyz(lon, lat), np.cross(mid_v[i_start], mid_v[1 - i_start]))) > 0.0
    east_of_track = left == (math.cos(math.radians(heading)) < 0.0)
    return {
        "time_s": start_s + share * (end_s - start_s),
        "cross_track_km": abs(d[0] - d[1]) / 2.0,
        "swath_width_km": d[0] + d[1],
        "satellite_side": "west" if east_of_track else "east",
    }


_GRANULES: dict[tuple[str, str, int], dict[str, dict[str, Any]]] = {}


def _granule(region: str, platform: str, granule_id: str, year: int) -> dict[str, Any] | None:
    """One granule of the cached pass files, by id (read once per region, platform and year)."""
    from backend.firms.cmr_passes import pass_file, read_pass_file

    for y in (year, year - 1, year + 1):
        key = (region, platform, y)
        if key not in _GRANULES:
            f = pass_file(region, platform, y)
            _GRANULES[key] = {g["id"]: g for g in read_pass_file(f)["granules"]} if f.is_file() else {}
        if granule_id in _GRANULES[key]:
            return _GRANULES[key][granule_id]
    return None


def _t(text: str) -> float:
    return float(np.datetime64(str(text).replace("Z", ""), "s").astype("int64"))


def _place(p: dict[str, Any], box: tuple[float, float, float, float], lon: float, lat: float) -> dict[str, Any] | None:
    """Time at the box and distance from the track for one pass of the list. A reader may give them itself
    (`time_at_box`, `cross_track_km`: the test fixture does); otherwise they come from the granules' polygons."""
    if "time_at_box" in p and "cross_track_km" in p:
        return {"time_s": _t(p["time_at_box"]), "cross_track_km": float(p["cross_track_km"]),
                "satellite_side": p.get("satellite_side", "west"), "swath_width_km": None}
    from backend.firms.archive import REGION_COUNTRY, region_box

    regions = [r for r in REGION_COUNTRY if region_box(r)[0] <= box[0] and region_box(r)[1] <= box[1]
               and box[2] <= region_box(r)[2] and box[3] <= region_box(r)[3]]
    if not regions:
        return None
    year = int(str(p["time_start"])[:4])
    for gid in p["granules"]:
        g = _granule(regions[0], p["platform"], gid, year)
        if g is None:
            continue
        for ring in g["rings"]:
            if len(ring) >= 4 and ring_holds(ring, lon, lat):
                return swath_position(ring, lon, lat, p["platform"], _t(g["time_start"]), _t(g["time_end"]))
    return None


def pass_slots(
    platforms: tuple[str, ...], start_s: float, end_s: float, box: tuple[float, float, float, float],
    read_passes: PassReader | None = None,
) -> tuple[list[Slot], dict[str, Any]]:
    """Every pass of `platforms` whose swath holds the whole box and whose scan crossed it in [start_s, end_s),
    in time order, and a count of what was left out. Raises whatever the reader raises when it has no list for
    the window (`backend.firms.cmr_passes.cmr_passes` raises `CmrCacheMissing`)."""
    if read_passes is None:
        from backend.firms.cmr_passes import cmr_passes as read_passes
    if not platforms:
        return [], {"passes_listed": 0, "partly_in_swath": 0, "not_placed": 0, "before_the_collection_is_whole": 0}
    lon, lat = 0.5 * (box[0] + box[2]), 0.5 * (box[1] + box[3])
    iso = lambda t: str(np.datetime64(int(math.floor(t)), "s"))  # noqa: E731
    listed = read_passes(box, iso(start_s - 900.0), iso(end_s + 900.0), platforms=list(platforms))
    found: list[tuple[float, int, Slot]] = []
    left = {"passes_listed": 0, "partly_in_swath": 0, "not_placed": 0, "before_the_collection_is_whole": 0}
    for p in listed:
        name = p["platform"]
        if name not in platforms:
            continue
        # the later of the day the archive serves the platform's rows from and the day its pass list is whole:
        # a pass with no row behind it would be scored as a look that flagged nothing
        first = max(d for d in (P.ARCHIVE_FIRST_DAY.get(name), PASS_LIST_FIRST_DAY.get(name)) if d is not None)
        early = _t(p["time_start"]) < _t(first + "T00:00:00")
        if early or not p.get("box_inside"):
            # a pass that is no slot is counted when the middle of its granules lies in the window
            if start_s <= 0.5 * (_t(p["time_start"]) + _t(p["time_end"])) < end_s:
                left["passes_listed"] += 1
                left["before_the_collection_is_whole" if early else "partly_in_swath"] += 1
            continue
        left["passes_listed"] += 1
        where = _place(p, box, lon, lat)
        if where is None:
            left["not_placed"] += 1
            continue
        t = float(where["time_s"])
        if not (start_s <= t < end_s):
            left["passes_listed"] -= 1
            continue
        fam = family(name)
        scan, track = pixel_km_at_ground_distance(fam, min(float(where["cross_track_km"]), _half_swath(fam)))
        cc = p.get("cloud_cover_pct")
        found.append((t, PLATFORMS.index(name), Slot(
            index=0, platform=name, time_s=t, is_day=is_day_at(t, lon), scan_km=scan, track_km=track,
            span_s=(_t(p["time_start"]), _t(p["time_end"])), cross_track_km=float(where["cross_track_km"]),
            satellite_side=str(where["satellite_side"]), swath_width_km=where.get("swath_width_km"),
            cloud_cover_pct=None if cc is None else float(cc),
            box_share=float(p.get("box_share", 1.0)), source=SOURCE_CMR,
        )))
    found.sort(key=lambda x: x[:2])
    return [s.reindexed(i) for i, (_, _, s) in enumerate(found)], left


def _half_swath(instrument_family: str) -> float:
    from backend.model.real_geometry import _HALF_SWATH_KM

    return _HALF_SWATH_KM[instrument_family]


def rows_of_slot(time_s: np.ndarray, platform_code: np.ndarray, slot: Slot) -> np.ndarray:
    """Positions of the rows that belong to a pass-list slot: its platform, inside its granules' time span give or
    take the minute FIRMS rounds to. A row's pass depends on its own platform and time only."""
    if slot.span_s is None:
        raise ValueError("only a pass-list slot has a time span to match rows to")
    lo, hi = slot.span_s[0] - ROW_MATCH_TOLERANCE_S, slot.span_s[1] + ROW_MATCH_TOLERANCE_S
    return np.flatnonzero((platform_code == P.PLATFORM_CODES[slot.platform]) & (time_s >= lo) & (time_s <= hi))


def schedule_for(
    hidden_family: str | None, named: tuple[str, ...] | None, start_s: float, end_s: float,
    box: tuple[float, float, float, float], source: str = SOURCE_AUTO, read_passes: PassReader | None = None,
    nominal_margin_s: float = 0.0,
) -> tuple[list[Slot], str, dict[str, Any]]:
    """The slots of the hidden platforms for a window, the source that gave them, and what was left out.

    `auto` takes the pass list when the reader answers for the window and falls back to the nominal schedule,
    saying why, when it does not (no list cached, or a box outside every cached region). `nominal_margin_s` widens
    the nominal layout only: a real pass can lie that far from its nominal slot.
    """
    platforms = hidden_platforms_in(hidden_family, named, start_s - nominal_margin_s, end_s + nominal_margin_s)
    lon, lat = 0.5 * (box[0] + box[2]), 0.5 * (box[1] + box[3])
    if source in (SOURCE_AUTO, SOURCE_CMR):
        try:
            slots, left = pass_slots(platforms, start_s, end_s, box, read_passes)
            return slots, SOURCE_CMR, {"platforms": list(platforms), **left}
        except LookupError as exc:          # CmrCacheMissing is a LookupError
            if source == SOURCE_CMR:
                raise
            why = f"no pass list for this window ({exc}); the nominal schedule stands in"
    elif source == SOURCE_NOMINAL:
        why = "the nominal schedule was asked for"
    else:
        raise ValueError(f"unknown schedule {source!r}")
    slots = nominal_slots(platforms, start_s - nominal_margin_s, end_s + nominal_margin_s, lon, lat)
    return slots, SOURCE_NOMINAL, {"platforms": list(platforms), "why_nominal": why}
