"""FIRMS rows as arrays.

A row is a dict of the source's own column names and string values, as `backend.firms.read_firms` returns them and
as `csv.DictReader` yields them from the synthetic fixture. Every row is kept or the call fails: a value this module
cannot read raises, it is never replaced by a default.
"""

from __future__ import annotations

import calendar
import csv
from dataclasses import dataclass, fields
import io
from pathlib import Path
from typing import Any, Iterable, Mapping

import numpy as np
from numpy.typing import NDArray

from backend.model.platforms import PLATFORM_CODES, PLATFORMS, family, platform_from_firms

# Columns the harness reads. `confidence`, `version` and `type` are optional for scoring but kept when present.
NEEDED_COLUMNS: tuple[str, ...] = (
    "latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument", "frp", "scan", "track", "daynight",
)
_NEEDED_SET: frozenset[str] = frozenset(NEEDED_COLUMNS)
_IS_VIIRS_BY_CODE: NDArray[np.bool_] = np.array(
    [family(PLATFORMS[c]) == "VIIRS" for c in range(len(PLATFORMS))], dtype=bool
)
_DAY_EPOCH_CACHE: dict[str, float] = {}

# Names `backend.firms.read_firms` writes into its derived `_platform` key.
_READER_PLATFORM: dict[str, str] = {
    "Terra": "MODIS_TERRA",
    "Aqua": "MODIS_AQUA",
    "Suomi NPP": "VIIRS_SNPP",
    "NOAA-20": "VIIRS_NOAA20",
    "NOAA-21": "VIIRS_NOAA21",
}


@dataclass(frozen=True)
class Detections:
    """One array entry per FIRMS row. `source` is the caller's label for where the rows came from."""

    lat: NDArray[np.float64]
    lon: NDArray[np.float64]
    time_s: NDArray[np.float64]          # acquisition time, UTC seconds since 1970-01-01
    frp_mw: NDArray[np.float64]          # fire radiative power of the pixel, MW
    scan_km: NDArray[np.float64]         # pixel size along scan, km
    track_km: NDArray[np.float64]        # pixel size along track, km
    platform_code: NDArray[np.int8]      # index into backend.model.platforms.PLATFORMS
    is_day: NDArray[np.bool_]            # the source's daynight flag
    confidence: NDArray[np.float64]      # MODIS 0 to 100; NaN for VIIRS (its classes are in confidence_class)
    confidence_class: NDArray[np.str_]   # VIIRS 'l', 'n', 'h'; '' for MODIS
    type_code: NDArray[np.int8]          # the source's type column (0 vegetation fire), -1 when absent
    row_index: NDArray[np.int64]         # position of the row in the list the caller passed
    source: str

    def __len__(self) -> int:
        return int(self.lat.size)

    def select(self, mask: NDArray[np.bool_] | NDArray[np.int64]) -> Detections:
        """The subset picked by a boolean mask or an index array."""
        kw: dict[str, Any] = {}
        for f in fields(self):
            v = getattr(self, f.name)
            kw[f.name] = v if f.name == "source" else v[mask]
        return Detections(**kw)

    @property
    def is_viirs(self) -> NDArray[np.bool_]:
        return _IS_VIIRS_BY_CODE[self.platform_code]

    @property
    def is_modis(self) -> NDArray[np.bool_]:
        return ~self.is_viirs

    def platform_names(self) -> list[str]:
        return [PLATFORMS[int(c)] for c in self.platform_code]

    def in_box(self, box: tuple[float, float, float, float]) -> NDArray[np.bool_]:
        """Rows whose pixel centre lies in (west, south, east, north), edges included."""
        w, s, e, n = box
        return (self.lon >= w) & (self.lon <= e) & (self.lat >= s) & (self.lat <= n)


def parse_acq_time_s(acq_date: str, acq_time: str | int) -> float:
    """UTC seconds since 1970 for FIRMS `acq_date` (YYYY-MM-DD) and `acq_time` (HHMM, leading zeros optional)."""
    date_s = acq_date.strip() if isinstance(acq_date, str) else str(acq_date).strip()
    day_epoch = _DAY_EPOCH_CACHE.get(date_s)
    if day_epoch is None:
        parts = date_s.split("-")
        if len(parts) != 3:
            y, m, d = (int(p) for p in parts)
        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
    if isinstance(acq_time, str) and len(acq_time) == 4 and acq_time.isdigit():
        hhmm = acq_time
    else:
        hhmm = str(acq_time).strip().zfill(4)
        if len(hhmm) != 4 or not hhmm.isdigit():
            raise ValueError(f"acq_time {acq_time!r} is not HHMM")
    hh, mm = int(hhmm[:2]), int(hhmm[2:])
    if hh > 23 or mm > 59:
        raise ValueError(f"acq_time {acq_time!r} is not a time of day")
    if day_epoch is None:
        day_epoch = float(calendar.timegm((y, m, d, 0, 0, 0, 0, 0, 0)))
        if len(_DAY_EPOCH_CACHE) >= 16384:
            _DAY_EPOCH_CACHE.clear()
        _DAY_EPOCH_CACHE[date_s] = day_epoch
    return day_epoch + hh * 3600.0 + mm * 60.0


def _is_day(flag: str) -> bool:
    f = str(flag).strip().upper()
    if f in ("D", "DAY"):
        return True
    if f in ("N", "NIGHT"):
        return False
    raise ValueError(f"daynight {flag!r} is neither D nor N")


def detections_from_rows(rows: Iterable[Mapping[str, Any]], source: str) -> Detections:
    """Arrays for every row. `source` must say where the rows came from (for example 'firms' or 'synthetic fixture')."""
    rows = rows if isinstance(rows, list) else list(rows)
    n = len(rows)
    lat = np.empty(n)
    lon = np.empty(n)
    t = np.empty(n)
    frp = np.empty(n)
    scan = np.empty(n)
    track = np.empty(n)
    code = np.empty(n, dtype=np.int8)
    day = np.empty(n, dtype=bool)
    conf = np.full(n, np.nan)
    conf_cls = np.full(n, "", dtype="<U1")
    typ = np.full(n, -1, dtype=np.int8)
    needed_set = _NEEDED_SET
    reader_plat = _READER_PLATFORM
    plat_codes = PLATFORM_CODES
    parse_t = parse_acq_time_s
    for i, row in enumerate(rows):
        if not needed_set.issubset(row):
            missing = [c for c in NEEDED_COLUMNS if c not in row]
            if missing:
                raise ValueError(f"row {i} lacks FIRMS columns {missing}")
        lat[i] = float(row["latitude"])
        lon[i] = float(row["longitude"])
        t[i] = parse_t(row["acq_date"], row["acq_time"])
        frp[i] = float(row["frp"])
        scan[i] = float(row["scan"])
        track[i] = float(row["track"])
        reader_name = row.get("_platform")
        name = reader_plat[reader_name] if reader_name in reader_plat else platform_from_firms(
            row["satellite"], row["instrument"]
        )
        code[i] = plat_codes[name]
        dn = row["daynight"]
        if dn == "D":
            day[i] = True
        elif dn == "N":
            day[i] = False
        else:
            day[i] = _is_day(dn)
        raw_c = row.get("confidence", "")
        c = raw_c.strip() if isinstance(raw_c, str) else str(raw_c).strip()
        if c:
            cl = c.lower()
            if cl in ("l", "n", "h"):
                conf_cls[i] = cl
            elif cl in ("low", "nominal", "high"):
                conf_cls[i] = cl[0]
            else:
                conf[i] = float(c)
        raw_ty = row.get("type", "")
        ty = raw_ty.strip() if isinstance(raw_ty, str) else str(raw_ty).strip()
        if ty:
            typ[i] = int(ty) if ty.isdigit() else int(float(ty))
    return Detections(
        lat=lat, lon=lon, time_s=t, frp_mw=frp, scan_km=scan, track_km=track, platform_code=code, is_day=day,
        confidence=conf, confidence_class=conf_cls, type_code=typ, row_index=np.arange(n, dtype=np.int64),
        source=str(source),
    )


def read_csv_rows(path: Path | str) -> list[dict[str, str]]:
    """Rows of a FIRMS-schema CSV file (used for the synthetic fixture; real rows come from backend.firms)."""
    with Path(path).open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def rows_to_csv_text(rows: list[dict[str, str]], columns: tuple[str, ...]) -> str:
    """CSV text with exactly these columns, Unix newlines."""
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(columns), lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({c: r[c] for c in columns})
    return buf.getvalue()


def local_solar_time_hr(time_s: NDArray[np.float64] | float, lon_deg: NDArray[np.float64] | float) -> NDArray[np.float64]:
    """Mean local solar time in hours [0, 24): UTC hour plus longitude / 15."""
    utc_hr = (np.asarray(time_s, dtype=np.float64) % 86400.0) / 3600.0
    return (utc_hr + np.asarray(lon_deg, dtype=np.float64) / 15.0) % 24.0
