"""When to publish a prediction for a hidden instrument, without asking its rows.

A sun-synchronous platform crosses a latitude at one local solar time by day and twelve hours later by night, and
MODIS and VIIRS swaths are wide enough to see any point above about 30 degrees of latitude on every such half day
(VIIRS everywhere). So each platform has two looks a day at a box, and their nominal times follow from the platform
and the calendar alone. Those are the `Slot`s: the times at which every method publishes what it expects the hidden
instrument to report.

What a slot does not know is where in the swath the box lay on that orbit. The real pass comes up to about an hour
and a half before or after the nominal time, sometimes twice (two consecutive orbits both see the box), and its
pixel size depends on that place. A slot therefore carries the instrument's typical pixel across its swath. A list
of real overpass times and swath outlines (NASA's CMR granule search has them, with no login) would replace both
approximations; until one is read, this schedule is what can be known without the hidden rows.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any

import numpy as np

from backend.model.platforms import PLATFORMS, archive_platforms, family
from backend.model.real_geometry import nominal_subsat_lst_hr, pixel_km_from_pass_time, typical_pixel_km

SOURCE_NOMINAL: str = "nominal"
SOURCE_HIDDEN_TIMES: str = "hidden_pass_times"

NOTES: dict[str, str] = {
    SOURCE_NOMINAL: (
        "one slot per hidden platform and half day, at the time the platform's nominal ground track crosses the "
        "box's latitude; pixel size is the instrument's median pixel across its swath. Nothing is read from the "
        "hidden rows. The real pass is up to about 90 minutes from the slot and its pixel size is not known."
    ),
    SOURCE_HIDDEN_TIMES: (
        "DIAGNOSTIC, not blind: one slot per hidden overpass, at the time and for the platform read from the "
        "hidden rows; pixel size from that time and the nominal orbit. It measures what a list of real overpass "
        "times would be worth."
    ),
}


@dataclass(frozen=True)
class Slot:
    """One scheduled look of a hidden platform: everything a method is told about it."""

    index: int
    platform: str
    time_s: float        # UTC seconds
    is_day: bool
    scan_km: float       # pixel size to assume along scan
    track_km: float      # and along track

    def as_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "platform": self.platform,
            "time_utc": str(np.datetime64(int(round(self.time_s)), "s")) + "Z",
            "is_day": self.is_day,
            "scan_km": round(self.scan_km, 4),
            "track_km": round(self.track_km, 4),
        }


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
