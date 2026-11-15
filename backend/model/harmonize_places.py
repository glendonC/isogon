"""Places, regions and latitude bands for measuring harmonization methods. Fixed before any method was scored.

A place is a square cell of the grid (2 degrees for the decision, smaller cells reported beside). Its region is the
country file that holds most of its rows, split where a country spans very different fire regimes; where the data
carries no country per cell, the first box of WORLD_REGIONS that holds the place's centre. Its latitude band is the
10 degree band of its centre.
"""

from __future__ import annotations

import numpy as np

PLACE_DEG: float = 2.0
BAND_DEG: float = 10.0

# (country file name, centre west of this longitude or None, centre at or north of this latitude or None, region
# name); the first match wins.
COUNTRY_REGIONS: tuple[tuple[str, float | None, float | None, str], ...] = (
    ("United_States", -129.0, 51.0, "United States, Alaska"),
    ("United_States", -100.0, None, "United States, west of 100 W"),
    ("United_States", None, None, "United States, east of 100 W"),
    ("Canada", -100.0, None, "Canada, west of 100 W"),
    ("Canada", None, None, "Canada, east of 100 W"),
    ("Greece", None, None, "Greece"),
)

# (name, west, south, east, north); the first box holding the place's centre wins.
WORLD_REGIONS: tuple[tuple[str, float, float, float, float], ...] = (
    ("North America, north of 49 N", -170.0, 49.0, -50.0, 75.0),
    ("North America, west of 100 W, 25 to 49 N", -170.0, 25.0, -100.0, 49.0),
    ("North America, east of 100 W, 25 to 49 N", -100.0, 25.0, -50.0, 49.0),
    ("Mexico, Central America and the Caribbean", -120.0, 5.0, -58.0, 25.0),
    ("South America, north of 15 S", -82.0, -15.0, -34.0, 13.0),
    ("South America, south of 15 S", -82.0, -56.0, -34.0, -15.0),
    ("Europe", -25.0, 35.0, 45.0, 72.0),
    ("North Africa and the Middle East", -20.0, 20.0, 63.0, 35.0),
    ("Africa, equator to 20 N", -20.0, 0.0, 52.0, 20.0),
    ("Africa, south of the equator", 8.0, -36.0, 52.0, 0.0),
    ("Russia and Central Asia", 45.0, 45.0, 180.0, 78.0),
    ("South Asia", 60.0, 5.0, 92.0, 37.0),
    ("Southeast Asia", 92.0, -11.0, 142.0, 28.0),
    ("East Asia", 73.0, 28.0, 146.0, 45.0),
    ("Australia and Oceania", 110.0, -50.0, 180.0, -11.0),
)
OTHER_REGION: str = "elsewhere"


def country_region(country: str, lon: float, lat: float) -> str:
    for c, west_of, north_of, name in COUNTRY_REGIONS:
        if c == country and (west_of is None or lon < west_of) and (north_of is None or lat >= north_of):
            return name
    return country.replace("_", " ")


def world_region(lon: float, lat: float) -> str:
    for name, w, s, e, n in WORLD_REGIONS:
        if w <= lon < e and s <= lat < n:
            return name
    return OTHER_REGION


def band_of(lat: np.ndarray | float) -> np.ndarray:
    """The southern edge of the 10 degree band holding each latitude."""
    return np.floor(np.asarray(lat, dtype=np.float64) / BAND_DEG) * BAND_DEG


def band_name(south: float) -> str:
    def lat_text(v: float) -> str:
        return f"{abs(v):.0f} {'N' if v >= 0 else 'S'}" if v != 0 else "0"
    return f"{lat_text(south)} to {lat_text(south + BAND_DEG)}"
