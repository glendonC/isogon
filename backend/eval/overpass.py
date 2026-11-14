"""Detections grouped into satellite overpasses.

FIRMS lists detections only. An overpass that found no fire leaves no row, so an overpass here means "this platform
flagged at least one pixel in the rows given, at about this time". Callers that need to know a satellite looked at a
box and saw nothing must pass rows from a wider box (the region's context box): a detection anywhere in the wider box
shows the swath was overhead.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from backend.eval.rows import Detections, local_solar_time_hr
from backend.model.platforms import PLATFORMS, family

# Two detections of one platform further apart than this belong to different overpasses. Successive orbits are
# about 99 to 101 minutes apart; one overpass crosses a 300 km box in under a minute, and the time FIRMS reports is
# rounded to the minute.
OVERPASS_GAP_S: float = 20.0 * 60.0


@dataclass(frozen=True)
class Overpass:
    """One platform's pass over the rows it was grouped from."""

    platform: str
    time_s: float                 # median acquisition time of its detections, UTC seconds since 1970
    is_day: bool                  # majority of the source's daynight flags
    index: NDArray[np.int64]      # positions of its detections in the Detections it was grouped from
    scan_km: float                # median pixel size along scan of its detections
    track_km: float               # median pixel size along track
    lst_hr: float                 # mean local solar time of its detections, hours

    @property
    def family(self) -> str:
        return family(self.platform)

    @property
    def n(self) -> int:
        return int(self.index.size)

    def iso(self) -> str:
        t = np.datetime64(int(round(self.time_s)), "s")
        return str(t) + "Z"


def group_overpasses(det: Detections, gap_s: float = OVERPASS_GAP_S) -> list[Overpass]:
    """Overpasses in time order (ties by platform order). Every detection lands in exactly one overpass."""
    out: list[Overpass] = []
    for code, name in enumerate(PLATFORMS):
        idx = np.flatnonzero(det.platform_code == code)
        if idx.size == 0:
            continue
        idx = idx[np.argsort(det.time_s[idx], kind="stable")]
        t = det.time_s[idx]
        cuts = np.flatnonzero(np.diff(t) > gap_s) + 1
        for part in np.split(idx, cuts):
            day = bool(np.mean(det.is_day[part]) >= 0.5)
            lst = local_solar_time_hr(det.time_s[part], det.lon[part])
            # circular mean so a pass around midnight does not average to noon
            ang = lst / 24.0 * 2.0 * np.pi
            lst_mean = float((np.arctan2(np.mean(np.sin(ang)), np.mean(np.cos(ang))) / (2.0 * np.pi) * 24.0) % 24.0)
            out.append(
                Overpass(
                    platform=name,
                    time_s=float(np.median(det.time_s[part])),
                    is_day=day,
                    index=part.astype(np.int64),
                    scan_km=float(np.median(det.scan_km[part])),
                    track_km=float(np.median(det.track_km[part])),
                    lst_hr=lst_mean,
                )
            )
    out.sort(key=lambda o: (o.time_s, PLATFORMS.index(o.platform)))
    return out
