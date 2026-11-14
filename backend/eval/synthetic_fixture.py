"""A small SYNTHETIC fixture in the FIRMS CSV schema, for tests only.

Nothing in it was observed by any satellite. It is a made-up fire line that walks north-east for three days in the
year 2099, sampled by made-up MODIS and VIIRS passes whose pixel sizes follow the engine's scan geometry and whose
detections follow the published detection limit (Sofiev and Kouznetsov, GMD 19, 10123, 2026, Eq. 5). Every row's
`version` column reads SYNTHETIC so no row can be mistaken for a NASA record.

Regenerate the two CSV files with:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.eval.synthetic_fixture
The test suite checks the tracked files equal what this module generates.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from backend.eval.rows import rows_to_csv_text
from backend.model.grid import DEG_TO_KM_LAT
from backend.model.platforms import family, scan_axis_deg
from backend.model.sensor_physics import detection_midpoint_mw, modis_geometry_from_scan, viirs_geometry_from_scan

FIXTURE_DIR: Path = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
MODIS_FILE: str = "synthetic_firms_modis.csv"
VIIRS_FILE: str = "synthetic_firms_viirs.csv"
SOURCE_LABEL: str = "synthetic fixture (not NASA data)"
VERSION: str = "SYNTHETIC"

# The test box (the plumas_ca preset box) and the wider box rows are kept in.
TEST_BOX: tuple[float, float, float, float] = (-121.44, 39.86, -120.92, 40.24)
CONTEXT_BOX: tuple[float, float, float, float] = (-122.48, 39.10, -119.88, 41.00)

MODIS_COLUMNS: tuple[str, ...] = (
    "latitude", "longitude", "brightness", "scan", "track", "acq_date", "acq_time", "satellite", "instrument",
    "confidence", "version", "bright_t31", "frp", "daynight", "type",
)
VIIRS_COLUMNS: tuple[str, ...] = (
    "latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time", "satellite", "instrument",
    "confidence", "version", "bright_ti5", "frp", "daynight", "type",
)

# (platform, FIRMS satellite value, HHMM UTC, day or night, scan angle per day in degrees)
_PASSES: tuple[tuple[str, str, str, str, tuple[float, float, float]], ...] = (
    ("MODIS_TERRA", "Terra", "0635", "N", (12.0, 41.0, 27.0)),
    ("MODIS_AQUA", "Aqua", "0935", "N", (33.0, 8.0, 47.0)),
    ("VIIRS_SNPP", "N", "0948", "N", (18.0, 36.0, 5.0)),
    ("VIIRS_NOAA20", "N20", "1036", "N", (40.0, 12.0, 50.0)),
    ("MODIS_TERRA", "Terra", "1835", "D", (22.0, 50.0, 6.0)),
    ("VIIRS_SNPP", "N", "2054", "D", (9.0, 44.0, 25.0)),
    ("MODIS_AQUA", "Aqua", "2135", "D", (16.0, 38.0, 3.0)),
    ("VIIRS_NOAA20", "N20", "2142", "D", (30.0, 3.0, 48.0)),
)
_DATES: tuple[str, ...] = ("2099-07-01", "2099-07-02", "2099-07-03")
_IGNITION: tuple[float, float] = (-121.25, 40.00)       # lon, lat
_SPREAD_KM_PER_HR: float = 0.11
_SPREAD_AZ_DEG: float = 45.0
# A second, far smaller burn outside the test box but inside the context box (used on day four, see below).
_OUTSIDE_BURN: tuple[float, float] = (-120.30, 40.70)


def _active_points(hours: float, rng: np.random.Generator, is_day: bool) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(lon, lat, FRP in MW) of the 375 m fire elements burning `hours` after ignition."""
    kx = DEG_TO_KM_LAT * math.cos(math.radians(_IGNITION[1]))
    az = math.radians(_SPREAD_AZ_DEG)
    ex, ey = math.sin(az), math.cos(az)          # spread direction
    px, py = math.cos(az), -math.sin(az)         # along the front
    lead = _SPREAD_KM_PER_HR * hours
    half_len = 0.6 + 0.035 * hours
    n_along = int(half_len / 0.375)
    xs: list[float] = []
    ys: list[float] = []
    for depth in (0.0, -0.375):
        for k in range(-n_along, n_along + 1):
            xs.append((lead + depth) * ex + 0.375 * k * px)
            ys.append((lead + depth) * ey + 0.375 * k * py)
    x = np.array(xs)
    y = np.array(ys)
    base = 7.0 if is_day else 3.0
    frp = base * np.exp(rng.normal(0.0, 0.45, size=x.size))
    frp[len(frp) // 2 :] *= 0.45                 # the row behind the front burns weaker
    lon = _IGNITION[0] + x / kx
    lat = _IGNITION[1] + y / DEG_TO_KM_LAT
    return lon, lat, frp


def _fmt(v: float, nd: int) -> str:
    s = f"{v:.{nd}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s


def build_synthetic_rows(seed: int = 20991107) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """(MODIS rows, VIIRS rows), deterministic for a seed."""
    rng = np.random.default_rng(seed)
    modis_rows: list[dict[str, str]] = []
    viirs_rows: list[dict[str, str]] = []
    kx = DEG_TO_KM_LAT * math.cos(math.radians(_IGNITION[1]))
    for d_idx, date in enumerate(_DATES):
        for platform, sat, hhmm, dn, scans in _PASSES:
            is_day = dn == "D"
            hours = 24.0 * d_idx + int(hhmm[:2]) + int(hhmm[2:]) / 60.0
            lon, lat, frp = _active_points(hours, rng, is_day)
            theta = scans[d_idx]
            fam = family(platform)
            geom = modis_geometry_from_scan(theta) if fam == "MODIS" else viirs_geometry_from_scan(theta)
            scan_km, track_km = float(geom["scan_km"]), float(geom["track_km"])
            area = scan_km * track_km
            limit = float(detection_midpoint_mw(area, fam, is_day))
            if fam == "VIIRS":
                # one pixel per fire element; flagged when its FRP reaches the 50 percent detection limit
                for j in range(lon.size):
                    if frp[j] < limit:
                        continue
                    viirs_rows.append(
                        {
                            "latitude": _fmt(float(lat[j]), 5),
                            "longitude": _fmt(float(lon[j]), 5),
                            "bright_ti4": _fmt(330.0 + 4.0 * math.log1p(float(frp[j])), 2),
                            "scan": _fmt(scan_km, 2),
                            "track": _fmt(track_km, 2),
                            "acq_date": date,
                            "acq_time": hhmm,
                            "satellite": sat,
                            "instrument": "VIIRS",
                            "confidence": "h" if frp[j] > 2.0 * limit else "n",
                            "version": VERSION,
                            "bright_ti5": "290",
                            "frp": _fmt(float(frp[j]), 2),
                            "daynight": dn,
                            "type": "0",
                        }
                    )
            else:
                # MODIS pixels on a lattice aligned with the scan axis; a pixel's FRP is the sum of its elements
                axis = math.radians(scan_axis_deg(platform, is_day, _IGNITION[1]))
                x = (lon - _IGNITION[0]) * kx
                y = (lat - _IGNITION[1]) * DEG_TO_KM_LAT
                u = x * math.sin(axis) + y * math.cos(axis)
                v = x * math.cos(axis) - y * math.sin(axis)
                iu = np.floor(u / scan_km).astype(int)
                iv = np.floor(v / track_km).astype(int)
                for key in sorted(set(zip(iu.tolist(), iv.tolist()))):
                    sel = (iu == key[0]) & (iv == key[1])
                    total = float(frp[sel].sum())
                    if total < limit:
                        continue
                    uc, vc = (key[0] + 0.5) * scan_km, (key[1] + 0.5) * track_km
                    xc = uc * math.sin(axis) + vc * math.cos(axis)
                    yc = uc * math.cos(axis) - vc * math.sin(axis)
                    modis_rows.append(
                        {
                            "latitude": _fmt(_IGNITION[1] + yc / DEG_TO_KM_LAT, 4),
                            "longitude": _fmt(_IGNITION[0] + xc / kx, 4),
                            "brightness": _fmt(318.0 + 6.0 * math.log1p(total), 1),
                            "scan": _fmt(scan_km, 1),
                            "track": _fmt(track_km, 1),
                            "acq_date": date,
                            "acq_time": hhmm,
                            "satellite": sat,
                            "instrument": "MODIS",
                            "confidence": str(int(min(100, 40 + 3 * total))),
                            "version": VERSION,
                            "bright_t31": "291",
                            "frp": _fmt(total, 1),
                            "daynight": dn,
                            "type": "0",
                        }
                    )
    # Day four: the fire in the test box is out. One Suomi NPP night pass flags only the small burn outside the test
    # box, so the fixture holds an overpass that is known from the wider box and finds nothing in the test box.
    viirs_rows.append(
        {
            "latitude": _fmt(_OUTSIDE_BURN[1], 5), "longitude": _fmt(_OUTSIDE_BURN[0], 5), "bright_ti4": "305",
            "scan": "0.39", "track": "0.36", "acq_date": "2099-07-04", "acq_time": "0948", "satellite": "N",
            "instrument": "VIIRS", "confidence": "n", "version": VERSION, "bright_ti5": "285", "frp": "1.2",
            "daynight": "N", "type": "0",
        }
    )
    return modis_rows, viirs_rows


def fixture_texts() -> tuple[str, str]:
    m, v = build_synthetic_rows()
    return rows_to_csv_text(m, MODIS_COLUMNS), rows_to_csv_text(v, VIIRS_COLUMNS)


def write_fixture(directory: Path = FIXTURE_DIR) -> tuple[Path, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    m_text, v_text = fixture_texts()
    m_path, v_path = directory / MODIS_FILE, directory / VIIRS_FILE
    m_path.write_text(m_text, encoding="utf-8")
    v_path.write_text(v_text, encoding="utf-8")
    return m_path, v_path


if __name__ == "__main__":
    for p in write_fixture():
        print(p, len(p.read_text(encoding="utf-8").splitlines()) - 1, "rows")
