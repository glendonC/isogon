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

from functools import lru_cache
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

# Nominal local solar time of the equator crossing on the day side, hours. Terra descends at 10:30; Aqua, NOAA-20
# and NOAA-21 ascend at 13:30 and Suomi NPP at 13:25 (sources in sensor_physics.ORBIT_NODE_SOURCES).
_DAY_CROSSING_HR: dict[str, float] = {
    "MODIS_TERRA": 10.5, "MODIS_AQUA": 13.5, "VIIRS_SNPP": 13.0 + 25.0 / 60.0, "VIIRS_NOAA20": 13.5, "VIIRS_NOAA21": 13.5,
}
_ELEMENT_ALIAS: dict[str, str] = {}


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


# Half the swath on the ground, km (MODIS 2,330 km and VIIRS 3,060 km wide).
_HALF_SWATH_KM: dict[str, float] = {"MODIS": 1165.0, "VIIRS": 1530.0}


def _scan_angle_deg(ground_km: float, altitude_km: float) -> float:
    """Scan angle at the satellite for a pixel `ground_km` from the sub-satellite track, on a spherical Earth."""
    gamma = ground_km / EARTH_RADIUS_KM
    return math.degrees(math.atan2(math.sin(gamma), (EARTH_RADIUS_KM + altitude_km) / EARTH_RADIUS_KM - math.cos(gamma)))


def pixel_km_at_ground_distance(instrument_family: str, ground_km: float) -> tuple[float, float]:
    """(scan, track) size in km of the instrument's pixel at this distance from the sub-satellite track."""
    from backend.model.sensor_physics import (
        MODIS_ALTITUDE_KM, MODIS_MAX_SCAN_DEG, VIIRS_ALTITUDE_KM, VIIRS_MAX_SCAN_DEG, modis_geometry_from_scan,
        viirs_geometry_from_scan,
    )

    if instrument_family == "MODIS":
        g = modis_geometry_from_scan(min(_scan_angle_deg(ground_km, MODIS_ALTITUDE_KM), MODIS_MAX_SCAN_DEG))
    else:
        g = viirs_geometry_from_scan(min(_scan_angle_deg(ground_km, VIIRS_ALTITUDE_KM), VIIRS_MAX_SCAN_DEG))
    return float(g["scan_km"]), float(g["track_km"])


@lru_cache(maxsize=None)
def typical_pixel_km(instrument_family: str) -> tuple[float, float]:
    """(scan, track) of the instrument's median pixel across its swath: the size to assume for a pass whose place
    in the swath is not known. A ground point is equally likely to lie anywhere across the swath, so the median is
    taken over ground distance from the track, from nadir to the swath edge."""
    d = np.linspace(0.0, _HALF_SWATH_KM[instrument_family], 1001)
    sizes = np.array([pixel_km_at_ground_distance(instrument_family, float(x)) for x in d])
    return float(np.median(sizes[:, 0])), float(np.median(sizes[:, 1]))


def pixel_km_from_pass_time(platform: str, time_s: float, lon_deg: float, lat_deg: float) -> tuple[float, float]:
    """(scan, track) of the platform's pixel at a point, from the time it passed and its nominal crossing time.

    The local solar time of the point at the pass, against the local time at which the nominal track crosses that
    latitude, gives the distance from the track; the pixel size follows from the scan geometry. No detection is
    read. The crossing time is the nominal one, so a drifted orbit (Terra and Aqua after 2021) is off.
    """
    lst = ((time_s % 86400.0) / 3600.0 + lon_deg / 15.0) % 24.0
    is_day = 6.0 <= lst < 18.0
    dev_hr = abs(_wrap_hr(lst - nominal_subsat_lst_hr(platform, is_day, lat_deg)))
    fam = P.family(platform)
    ground = min(dev_hr / _hours_per_km(platform, is_day, lat_deg), _HALF_SWATH_KM[fam])
    return pixel_km_at_ground_distance(fam, ground)


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


def slot_geometry(slot: Any, center_lon: float, center_lat: float) -> dict[str, Any]:
    """Geometry of one pass of the pass list (`backend.eval.schedule.Slot`) for the payload's `passes` entry.

    Nothing here comes from a detection: the distance of the box from the ground track and the side the satellite
    stood on are read from the granule's swath polygon, and the scan angle, the view zenith and the sub-satellite
    point follow from them on a spherical Earth. The same keys as `pass_geometry`.
    """
    alt = P.altitude_km(slot.platform)
    ground = float(slot.cross_track_km or 0.0)
    scan = _scan_angle_deg(ground, alt)
    vza = scan + math.degrees(ground / EARTH_RADIUS_KM)
    side = slot.satellite_side or "west"
    az = P.look_azimuth_deg(slot.platform, slot.is_day, center_lat, side)
    sub_lon, sub_lat = subsatellite_point_from_look(center_lon, center_lat, alt, vza, az)
    return {
        "sensor": slot.platform,
        "sensor_code": P.PLATFORM_CODES[slot.platform],
        "orbit_node": P.node(slot.platform, slot.is_day),
        "subsat_lon": sub_lon,
        "subsat_lat": sub_lat,
        "altitude_km": alt,
        "scan_angle_deg": round(scan, 2),
        "azimuth_deg": round(az, 1),
        "view_zenith_deg": round(vza, 2),
        "satellite_side": side,
        "crossing_lst_hr": round(((slot.time_s % 86400.0) / 3600.0 + float(sub_lon) / 15.0) % 24.0, 3),
        "cross_track_km": round(ground, 1),
    }
