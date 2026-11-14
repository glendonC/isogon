"""Pass geometry for a real overpass, derived from the rows.

FIRMS gives each pixel's size along scan and along track and the minute it was taken; it does not give the scan
angle, the side the satellite was on, or the sub-satellite point. They are derived here and every derived value is
labelled as such in the payload:

  view zenith and scan angle   from the pixel size (track size grows monotonically from nadir to the swath edge)
  cross-track distance         from the view zenith on a spherical Earth
  side (east or west)          from local solar time: a sun-synchronous satellite crosses a latitude at one local
                               solar time, so a pixel seen later than that lies east of the track and the satellite
                               stands to its west. The crossing time is the platform's nominal one, shifted by the
                               offset that best explains all passes given (Terra and Aqua have drifted).
  look azimuth                 across the ground track, on that side
  sub-satellite point          from the target, the view zenith and the look azimuth
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from backend.eval.overpass import Overpass
from backend.model import platforms as P
from backend.model.grid import EARTH_RADIUS_KM
from backend.model.sensor_physics import (
    ORBIT_ELEMENTS,
    invert_view_zenith_from_footprint,
    scan_angle_from_view_zenith,
    subsatellite_point_from_look,
)

# Nominal local solar time of the equator crossing on the day side, hours. Terra descends at 10:30; Aqua, Suomi NPP,
# NOAA-20 and NOAA-21 ascend at 13:30 (sources in sensor_physics.ORBIT_NODE_SOURCES).
_DAY_CROSSING_HR: dict[str, float] = {
    "MODIS_TERRA": 10.5, "MODIS_AQUA": 13.5, "VIIRS_SNPP": 13.5, "VIIRS_NOAA20": 13.5, "VIIRS_NOAA21": 13.5,
}
_ELEMENT_ALIAS: dict[str, str] = {"VIIRS_SNPP": "VIIRS_NOAA20"}


def nominal_subsat_lst_hr(platform: str, is_day: bool, lat_deg: float) -> float:
    """Local solar time at which the platform's ground track crosses `lat_deg` on a day or night pass.

    For an orbit of inclination i the track at latitude phi lies delta = atan(cos(i) tan(u)) of longitude from its
    equator crossing, with sin(u) = sin(phi) / sin(i), in the frame that turns with the Sun. An ascending pass
    reaches phi after the crossing, a descending pass before it.
    """
    inc = math.radians(float(ORBIT_ELEMENTS[_ELEMENT_ALIAS.get(platform, platform)]["inclination_deg"]))
    s = max(-1.0, min(1.0, math.sin(math.radians(lat_deg)) / math.sin(inc)))
    u = math.asin(s)
    delta_hr = math.degrees(math.atan(math.cos(inc) * math.tan(u))) / 15.0
    node = P.node(platform, is_day)
    crossing = _DAY_CROSSING_HR[platform] if is_day else (_DAY_CROSSING_HR[platform] + 12.0) % 24.0
    return (crossing + delta_hr if node == "ascending" else crossing - delta_hr) % 24.0


def _wrap_hr(d: float) -> float:
    """Difference of two local times folded into [-12, 12)."""
    return (d + 12.0) % 24.0 - 12.0


def view_zenith_deg(platform: str, scan_km: float, track_km: float) -> float:
    code = np.array([P.PLATFORM_CODES[platform]], dtype=np.int32)
    return float(invert_view_zenith_from_footprint(np.array([scan_km]), np.array([track_km]), code)[0])


def cross_track_km(platform: str, vza_deg: float) -> float:
    """Ground distance from the sub-satellite track to a pixel seen at this view zenith."""
    scan = scan_angle_from_view_zenith(vza_deg, P.altitude_km(platform))
    return EARTH_RADIUS_KM * math.radians(max(0.0, vza_deg - scan))


def _hours_per_km(platform: str, is_day: bool, lat_deg: float) -> float:
    """Local solar time gained per km moved along the scan axis toward the east."""
    axis = math.radians(P.scan_axis_deg(platform, is_day, lat_deg))
    return abs(math.sin(axis)) / (15.0 * 111.19 * math.cos(math.radians(lat_deg)))


def crossing_offsets(passes: list[Overpass], lat_deg: float) -> dict[tuple[str, bool], dict[str, Any]]:
    """For each platform and day or night: the shift of the true crossing time from the nominal one, in hours.

    Each pass says the crossing time is its own local time plus or minus its cross-track distance; the shift chosen
    is the one, within an hour of nominal, that leaves the smallest total mismatch over all passes. With fewer than
    four passes the shift is zero and the nominal time is used.
    """
    out: dict[tuple[str, bool], dict[str, Any]] = {}
    keys = sorted({(p.platform, p.is_day) for p in passes})
    grid = np.arange(-60, 61) / 60.0
    for key in keys:
        plat, day = key
        group = [p for p in passes if (p.platform, p.is_day) == key]
        nominal = nominal_subsat_lst_hr(plat, day, lat_deg)
        if len(group) < 4:
            out[key] = {"offset_hr": 0.0, "n_passes": len(group), "source": "nominal crossing time (too few passes to estimate the drift)"}
            continue
        c = _hours_per_km(plat, day, lat_deg)
        dev = np.array([_wrap_hr(p.lst_hr - nominal) for p in group])
        dist = np.array([cross_track_km(plat, view_zenith_deg(plat, p.scan_km, p.track_km)) * c for p in group])
        cost = [float(np.minimum(np.abs(dev - dist - g), np.abs(dev + dist - g)).sum()) for g in grid]
        best = float(grid[int(np.argmin(cost))])
        out[key] = {"offset_hr": best, "n_passes": len(group), "source": "nominal crossing time shifted to fit the passes' pixel sizes"}
    return out


def pass_geometry(
    op: Overpass, center_lon: float, center_lat: float, offsets: dict[tuple[str, bool], dict[str, Any]] | None = None
) -> dict[str, Any]:
    """Derived geometry of one overpass for the payload's `passes` entry."""
    vza = view_zenith_deg(op.platform, op.scan_km, op.track_km)
    scan = scan_angle_from_view_zenith(vza, P.altitude_km(op.platform))
    off = (offsets or {}).get((op.platform, op.is_day), {"offset_hr": 0.0})
    crossing = (nominal_subsat_lst_hr(op.platform, op.is_day, center_lat) + float(off["offset_hr"])) % 24.0
    # seen later than the track's local time: the pixel is east of the track, the satellite stands to the west
    side = "west" if _wrap_hr(op.lst_hr - crossing) > 0.0 else "east"
    az = P.look_azimuth_deg(op.platform, op.is_day, center_lat, side)
    sub_lon, sub_lat = subsatellite_point_from_look(center_lon, center_lat, P.altitude_km(op.platform), vza, az)
    return {
        "sensor": op.platform,
        "sensor_code": P.PLATFORM_CODES[op.platform],
        "orbit_node": P.node(op.platform, op.is_day),
        "subsat_lon": sub_lon,
        "subsat_lat": sub_lat,
        "altitude_km": P.altitude_km(op.platform),
        "scan_angle_deg": round(scan, 2),
        "azimuth_deg": round(az, 1),
        "view_zenith_deg": round(vza, 2),
        "satellite_side": side,
        "crossing_lst_hr": round(crossing, 3),
    }
