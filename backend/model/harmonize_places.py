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


# Continents of the FIRMS country files, for the yearly totals: the United Nations' grouping, with the Americas cut
# at Panama's border with Colombia (Central America and the Caribbean in North America) and the Russian Federation
# cut at 60 E (Europe between 0 and 60 E, Asia elsewhere). Cyprus, Turkey and the Caucasus are in Asia, Egypt in
# Africa, Greenland in North America, the islands of the Southern Ocean where the United Nations puts them.
CONTINENTS: tuple[str, ...] = ("Africa", "Asia", "Europe", "North America", "South America", "Oceania", "Antarctica")
_CONTINENT_COUNTRIES: dict[str, str] = {
    "Africa": "Algeria Angola Benin Botswana Burkina_Faso Burundi Cameroon Cape_Verde Central_African_Republic Chad "
              "Comoros Cote_d_Ivoire Democratic_Republic_of_the_Congo Djibouti Egypt Equatorial_Guinea Eritrea "
              "Ethiopia French_Southern_and_Antarctic_Lands Gabon Ghana Guinea Guinea-Bissau Kenya Lesotho Liberia "
              "Libya Madagascar Malawi Mali Mauritania Mauritius Mayotte Morocco Mozambique Namibia Niger Nigeria "
              "Republic_of_Congo Reunion Rwanda Saint_Helena Sao_Tome_and_Principe Senegal Seychelles Sierra_Leone "
              "Somalia South_Africa South_Sudan Sudan Swaziland Tanzania The_Gambia Togo Tunisia Uganda Zambia "
              "Zimbabwe",
    "Asia": "Afghanistan Armenia Azerbaijan Bahrain Bangladesh Bhutan Brunei_Darussalam Cambodia China Cyprus "
            "Dem_Rep_Korea Georgia Hong_Kong India Indonesia Iran Iraq Israel Japan Jordan Kazakhstan Kuwait "
            "Kyrgyzstan Lao_PDR Lebanon Malaysia Maldives Mongolia Myanmar Nepal Oman Pakistan Palestine Philippines "
            "Qatar Republic_of_Korea Saudi_Arabia Singapore Sri_Lanka Syria Taiwan Tajikistan Thailand Timor-Leste "
            "Turkey Turkmenistan United_Arab_Emirates Uzbekistan Vietnam Yemen",
    "Europe": "Aland_Islands Albania Andorra Austria Belarus Belgium Bosnia_and_Herzegovina Bulgaria Croatia "
              "Czech_Republic Denmark Estonia Faeroe_Islands Finland France Germany Greece Guernsey Hungary Iceland "
              "Ireland Isle_of_Man Italy Jersey Kosovo Latvia Liechtenstein Lithuania Luxembourg "
              "Macedonia_Former_Yugoslav_Republic_of Malta Moldova Monaco Montenegro Netherlands Norway Poland "
              "Portugal Romania San_Marino Serbia Slovakia Slovenia Spain Svalbard_and_Jan_Mayen Sweden Switzerland "
              "Ukraine United_Kingdom",
    "North America": "Anguilla Antigua_and_Barbuda Aruba Bahamas Barbados Belize Bermuda British_Virgin_Islands "
                     "Canada Cayman_Islands Costa_Rica Cuba Curacao Dominica Dominican_Republic El_Salvador "
                     "Greenland Grenada Guadeloupe Guatemala Haiti Honduras Jamaica Martinique Mexico Montserrat "
                     "Nicaragua Panama Puerto_Rico Saint-Barthelemy Saint-Martin Saint_Kitts_and_Nevis Saint_Lucia "
                     "Saint_Pierre_and_Miquelon Saint_Vincent_and_the_Grenadines Sint_Maarten Trinidad_and_Tobago "
                     "Turks_and_Caicos_Islands United_States United_States_Virgin_Islands",
    "South America": "Argentina Bolivia Brazil Chile Colombia Ecuador Falkland_Islands French_Guiana Guyana Paraguay "
                     "Peru South_Georgia_and_South_Sandwich_Islands Suriname Uruguay Venezuela",
    "Oceania": "American_Samoa Australia Cook_Islands Federated_States_of_Micronesia Fiji French_Polynesia Guam "
               "Heard_I_and_McDonald_Islands Kiribati Marshall_Islands Nauru New_Caledonia New_Zealand Niue "
               "Norfolk_Island Northern_Mariana_Islands Palau Papua_New_Guinea Samoa Solomon_Islands Tonga "
               "United_States_Minor_Outlying_Islands Vanuatu Wallis_and_Futuna_Islands",
    "Antarctica": "Antarctica",
}
CONTINENT_OF: dict[str, str] = {c: k for k, v in _CONTINENT_COUNTRIES.items() for c in v.split()}
SPLIT_CONTINENT: dict[str, tuple[float, float, str, str]] = {
    "Russian_Federation": (0.0, 60.0, "Europe", "Asia"),     # (west, east, inside, outside), by the cell's centre
}


def continent_of(country: str, lon: float) -> str | None:
    """The continent of a country file's rows at a longitude; None for a country not in the table."""
    split = SPLIT_CONTINENT.get(country)
    if split is not None:
        w, e, inside, outside = split
        return inside if w <= lon < e else outside
    return CONTINENT_OF.get(country)
