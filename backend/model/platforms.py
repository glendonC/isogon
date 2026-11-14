"""Platform facts for real FIRMS rows: names, instrument family, orbit, and the scan axis on the ground.

The simulated engine knows four sensors (`sensor_physics.SENSOR_CODES`). Real rows from 2012 on also carry Suomi NPP,
so real runs use the five names below. Nothing here changes a simulated run: the simulated tables are left as they are
and Suomi NPP borrows NOAA-20's orbit elements (both fly the 824 km sun-synchronous orbit with a 13:30 ascending
crossing, https://space.oscar.wmo.int/satellites/view/snpp).
"""

from __future__ import annotations

from backend.model.sensor_physics import (
    MODIS_ALTITUDE_KM,
    VIIRS_ALTITUDE_KM,
    ground_track_heading_deg,
    orbit_node,
)

# Order is the platform code used in arrays. Codes 0 to 3 equal `sensor_physics.SENSOR_CODES`; 4 is new.
PLATFORMS: tuple[str, ...] = ("MODIS_TERRA", "MODIS_AQUA", "VIIRS_NOAA20", "VIIRS_NOAA21", "VIIRS_SNPP")
PLATFORM_CODES: dict[str, int] = {name: i for i, name in enumerate(PLATFORMS)}

# Which simulated-engine sensor supplies the orbit elements and the day-side node.
_ORBIT_ALIAS: dict[str, str] = {"VIIRS_SNPP": "VIIRS_NOAA20"}

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
