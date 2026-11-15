"""Which hidden platforms have their rows in the cache for a window: a pass of a platform whose rows were never
fetched is no hidden pass.

The platforms a hidden instrument flies come from the archive's start dates (`backend/model/platforms.py`). That is
right for the archive and wrong for a cache that holds only some of it: a region filled from the country files has
no NOAA-21 rows (they come from the area API alone), so from 2023-03-01 every NOAA-21 pass would be scored as a pass
that flagged nothing. This module says, for a box and a window, which platforms of an instrument have rows in the
cache over the whole window, read from the extracts' manifests (the days each extract covers) and never from a row.
A held-out run and a round hide, frame and score only those; each one left out is named with the reason.

Only a box inside a cached region, in a window the cache holds the region's other instrument for, can be checked.
For any other box or window (a place of the fresh test, made-up rows in a test) nothing is left out.
"""

from __future__ import annotations

import datetime as _dt
from typing import Any, Callable

from backend.model.platforms import archive_platforms

# The FIRMS product whose extract holds a platform's rows.
PRODUCT_OF: dict[str, str] = {
    "MODIS_TERRA": "modis", "MODIS_AQUA": "modis",
    "VIIRS_SNPP": "viirs-snpp", "VIIRS_NOAA20": "viirs-jpss1", "VIIRS_NOAA21": "viirs-noaa21",
}
ManifestReader = Callable[[str, str, int], "dict[str, Any] | None"]


def _default_manifest(region_id: str, product: str, year: int) -> dict[str, Any] | None:
    from backend.firms.archive import extract_path, read_manifest

    return read_manifest(extract_path(region_id, product, year))


def covered_days(manifest: dict[str, Any] | None, year: int) -> tuple[str, str] | None:
    """The first and last day an extract's manifest says its rows cover. An extract of a country file covers its
    whole year; one of the area API says its days, and covers none when it does not say them."""
    if manifest is None:
        return None
    days = manifest.get("covered_days")
    if isinstance(days, (list, tuple)) and len(days) == 2:
        return (str(days[0]), str(days[1]))
    lineage = manifest.get("lineage")
    source = lineage.get("source") if isinstance(lineage, dict) else None
    if source == "area_api" or "area_api" in str(lineage):
        return None
    return (f"{year}-01-01", f"{year}-12-31")


def _days(start_s: float, end_s: float) -> tuple[str, str]:
    first = _dt.datetime.fromtimestamp(float(start_s), _dt.timezone.utc).date().isoformat()
    last = _dt.datetime.fromtimestamp(float(end_s) - 1.0, _dt.timezone.utc).date().isoformat()
    return first, last


def rows_cached(region_id: str, platform: str, start_s: float, end_s: float,
                read_manifest: ManifestReader | None = None) -> bool:
    """Are a platform's rows in the cache for the region over every day of [start_s, end_s)?"""
    read_manifest = read_manifest or _default_manifest
    product = PRODUCT_OF[platform]
    first, last = _days(start_s, end_s)
    for year in range(int(first[:4]), int(last[:4]) + 1):
        covered = covered_days(read_manifest(region_id, product, year), year)
        lo, hi = max(first, f"{year}-01-01"), min(last, f"{year}-12-31")
        if covered is None or not (covered[0] <= lo and hi <= covered[1]):
            return False
    return True


def region_of(box: tuple[float, float, float, float]) -> str | None:
    """The cached region whose context box holds the box, as the row reader finds it; None for any other box."""
    from backend.firms.archive import REGION_COUNTRY, region_box

    w, s, e, n = box
    for region in REGION_COUNTRY:
        rw, rs, re_, rn = region_box(region)
        if rw <= w and rs <= s and e <= re_ and n <= rn:
            return region
    return None


def platforms_with_rows(box: tuple[float, float, float, float], family: str, start_s: float, end_s: float,
                        read_manifest: ManifestReader | None = None, region_id: str | None = None,
                        ) -> tuple[tuple[str, ...], dict[str, str]]:
    """(the platforms of `family` flying in the window whose rows the cache holds over it, the ones left out with
    the reason). A platform is left out only where the cache holds the region's rows of the other instrument over
    the window, so the window is one the cache was filled for; a box in no cached region, or a window the cache holds
    nothing of (rows a caller made up), leaves nothing out."""
    flying = archive_platforms(family, float(start_s), float(end_s))
    region = region_id or region_of(box)
    if region is None:
        return flying, {}
    other = "MODIS" if family == "VIIRS" else "VIIRS"
    if not any(rows_cached(region, p, start_s, end_s, read_manifest) for p in archive_platforms(other, float(start_s), float(end_s))):
        return flying, {}
    kept, left = [], {}
    for p in flying:
        if rows_cached(region, p, start_s, end_s, read_manifest):
            kept.append(p)
        else:
            left[p] = (f"its rows for {region} over these days are not in the cache (no extract covers them), so its "
                       "passes are not hidden passes: none is framed or scored")
    return tuple(kept), left
