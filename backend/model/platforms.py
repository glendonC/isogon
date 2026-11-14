"""Platform facts for real FIRMS rows: names, instrument family, orbit, and the scan axis on the ground.

The simulated engine flies four sensors. Real rows from 2012 on also carry Suomi NPP, so real runs use the five
names below. Suomi NPP is in `sensor_physics.SENSOR_CODES` and its orbit tables as code 4 (824 km sun-synchronous
orbit, 13:25 ascending crossing, https://space.oscar.wmo.int/satellites/view/snpp); no simulated pass uses it.
"""

from __future__ import annotations

import math

from backend.model.sensor_physics import (
    MODIS_ALTITUDE_KM,
    VIIRS_ALTITUDE_KM,
    ground_track_heading_deg,
    orbit_node,
)

# Order is the platform code used in arrays, equal to `sensor_physics.SENSOR_CODES`.
PLATFORMS: tuple[str, ...] = ("MODIS_TERRA", "MODIS_AQUA", "VIIRS_NOAA20", "VIIRS_NOAA21", "VIIRS_SNPP")
PLATFORM_CODES: dict[str, int] = {name: i for i, name in enumerate(PLATFORMS)}

# First UTC day of each platform's rows in the FIRMS archive this project reads (backend/firms/archive.py: MODIS
# Collection 6.1 from November 2000 for Terra and July 2002 for Aqua, VIIRS 375 m from 20 January 2012 for Suomi
# NPP and 1 April 2018 for NOAA-20). This table is what says which platforms of a hidden instrument were flying in
# a window; the hidden rows are never asked.
# NOAA-21: 2023-03-01 is what FIRMS itself states. Its data_availability answer for the standard-processing product
# VIIRS_NOAA21_SP gives 2023-03-01 as the first day (the answer `backend/firms/area_api.py` reads before it fetches
# rows). It is not taken from the first cached row, which is a hidden row and happens to carry the same day
# because the fetch began there. NASA's CMR lists granules of the same product (VJ214IMG, C2831626262-LPCLOUD)
# from 2023-02-10; FIRMS serves no row for those first weeks, so a schedule must not start before this table's day
# (backend/eval/schedule.py takes the later of the two).
ARCHIVE_FIRST_DAY: dict[str, str] = {
    "MODIS_TERRA": "2000-11-01",
    "MODIS_AQUA": "2002-07-04",
    "VIIRS_SNPP": "2012-01-20",
    "VIIRS_NOAA20": "2018-04-01",
    "VIIRS_NOAA21": "2023-03-01",
}


def _day_s(day: str) -> float:
    import calendar

    y, m, d = (int(v) for v in day.split("-"))
    return float(calendar.timegm((y, m, d, 0, 0, 0, 0, 0, 0)))


def archive_platforms(instrument_family: str, start_s: float, end_s: float) -> tuple[str, ...]:
    """Platforms of one instrument family with rows in the archive at some time in [start_s, end_s), in code order."""
    return tuple(
        name for name in PLATFORMS
        if name in ARCHIVE_FIRST_DAY and family(name) == instrument_family and _day_s(ARCHIVE_FIRST_DAY[name]) < end_s
    )


# Kept for callers that pass a name the orbit tables do not hold; every platform above is in them.
_ORBIT_ALIAS: dict[str, str] = {}

# FIRMS `satellite` column values, by instrument. Sources: FIRMS attribute tables for MODIS (Terra, Aqua; T and A in
# near real time files) and VIIRS (N is Suomi NPP; N20 or 1 is NOAA-20; N21 is NOAA-21).
_SATELLITE_TO_PLATFORM: dict[tuple[str, str], str] = {
    ("MODIS", "TERRA"): "MODIS_TERRA",
    ("MODIS", "T"): "MODIS_TERRA",
    ("MODIS", "AQUA"): "MODIS_AQUA",
    ("MODIS", "A"): "MODIS_AQUA",
    ("VIIRS", "N"): "VIIRS_SNPP",
    ("VIIRS", "NPP"): "VIIRS_SNPP",
    ("VIIRS", "SNPP"): "VIIRS_SNPP",
    ("VIIRS", "SUOMI NPP"): "VIIRS_SNPP",
    ("VIIRS", "N20"): "VIIRS_NOAA20",
    ("VIIRS", "1"): "VIIRS_NOAA20",
    ("VIIRS", "J1"): "VIIRS_NOAA20",
    ("VIIRS", "NOAA-20"): "VIIRS_NOAA20",
    ("VIIRS", "N21"): "VIIRS_NOAA21",
    ("VIIRS", "J2"): "VIIRS_NOAA21",
    ("VIIRS", "NOAA-21"): "VIIRS_NOAA21",
}


def platform_from_firms(satellite: str, instrument: str) -> str:
    """Platform name for one FIRMS row. Raises ValueError on a value this table does not know (never guesses)."""
    key = (str(instrument).strip().upper(), str(satellite).strip().upper())
    try:
        return _SATELLITE_TO_PLATFORM[key]
    except KeyError as exc:
        raise ValueError(f"unknown FIRMS satellite/instrument pair {satellite!r}/{instrument!r}") from exc


def family(platform: str) -> str:
    """'MODIS' or 'VIIRS'."""
    return "MODIS" if platform.startswith("MODIS") else "VIIRS"


def altitude_km(platform: str) -> float:
    return MODIS_ALTITUDE_KM if family(platform) == "MODIS" else VIIRS_ALTITUDE_KM


def node(platform: str, is_day: bool) -> str:
    """'ascending' or 'descending' for a day or night pass of the platform."""
    n = orbit_node(_ORBIT_ALIAS.get(platform, platform), bool(is_day))
    if n is None:
        raise ValueError(f"unknown platform {platform!r}")
    return n


def track_heading_deg(platform: str, is_day: bool, lat_deg: float) -> float:
    """Ground track heading over the rotating Earth, degrees clockwise from north."""
    return ground_track_heading_deg(_ORBIT_ALIAS.get(platform, platform), node(platform, is_day), float(lat_deg))


def scan_axis_deg(platform: str, is_day: bool, lat_deg: float) -> float:
    """Azimuth of the cross-track (scan) direction on the ground, in [0, 180).

    FIRMS gives a pixel's size along scan and along track but not its orientation. A whiskbroom scans across the
    ground track, so the long (scan) side of the pixel lies at the track heading plus 90 degrees. It is an axis, so
    it is reported modulo 180.
    """
    return (track_heading_deg(platform, is_day, lat_deg) + 90.0) % 180.0


def look_azimuth_deg(platform: str, is_day: bool, lat_deg: float, side: str) -> float:
    """Azimuth from a target to the satellite for a cross-track view, the satellite standing east or west of it."""
    if side not in ("east", "west"):
        raise ValueError("side must be 'east' or 'west'")
    h = track_heading_deg(platform, is_day, lat_deg)
    for cand in ((h + 90.0) % 360.0, (h - 90.0) % 360.0):
        if (math.sin(math.radians(cand)) > 0.0) == (side == "east"):
            return cand
    return (h + 90.0) % 360.0
