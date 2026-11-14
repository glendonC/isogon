"""The real calendar's overlap ratio, for use as the blind test's second baseline.

The calendar (terrain-assets lane, `backend/firms/real_calendar.py`, method overlap_ratio_v1) harmonizes with one
number per region: Suomi NPP rows over Terra plus Aqua rows across the overlap months. The blind test must not let a
baseline see the fire it is scored on, so the value used here is the calendar's own leave-one-year-out fit with the
test year left out, and its interval is the 10th to 90th percentile of the other years' ratios (the calendar's
nominal 80 percent interval).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import numpy as np


@dataclass(frozen=True)
class CalendarRatio:
    region_id: str
    ratio: float                 # Suomi NPP rows / (Terra + Aqua rows), fitted without `excluded_year`
    p10: float                   # 10th percentile of the other years' ratios
    p90: float
    ratio_all_years: float       # what the calendar itself uses (fitted on every overlap year)
    excluded_year: int | None
    years: tuple[int, ...]       # the years the ratio was fitted on
    method_id: str
    level: float = 0.80

    def as_dict(self) -> dict[str, Any]:
        return {
            "region_id": self.region_id,
            "ratio": round(self.ratio, 4),
            "p10": round(self.p10, 4),
            "p90": round(self.p90, 4),
            "nominal_level": self.level,
            "ratio_all_years": round(self.ratio_all_years, 4),
            "excluded_year": self.excluded_year,
            "years": list(self.years),
            "method_id": self.method_id,
            "definition": (
                "Suomi NPP rows over Terra plus Aqua rows across the overlap months of the region's context box "
                "(backend/firms/real_calendar.py), refitted without the excluded year; p10 and p90 are percentiles "
                "of the remaining years' ratios"
            ),
        }


def calendar_ratio(
    region_id: str, exclude_year: int | None, firms_calendar: Callable[[str], dict[str, Any]] | None = None
) -> CalendarRatio:
    """The calendar's ratio for a region with one year left out (None keeps every year)."""
    if firms_calendar is None:
        from backend.firms.real_calendar import firms_calendar as _fc

        firms_calendar = _fc
    cal = firms_calendar(region_id)
    hm = cal["harmonization_method"]
    fit = hm["ratio_terra_aqua"]
    per_year = {int(y): float(r) for y, r in fit["per_year"].items()}
    ratio_all = float(fit["ratio"])
    if exclude_year is None or exclude_year not in per_year:
        vals = np.array(list(per_year.values()))
        return CalendarRatio(region_id, ratio_all, float(np.percentile(vals, 10)), float(np.percentile(vals, 90)),
                             ratio_all, None, tuple(sorted(per_year)), str(hm["id"]))
    row = next(r for r in hm["validation"]["per_year"] if int(r["year"]) == exclude_year)
    rest = {y: r for y, r in per_year.items() if y != exclude_year}
    vals = np.array(list(rest.values()))
    return CalendarRatio(
        region_id=region_id, ratio=float(row["ratio_fitted_without_this_year"]),
        p10=float(np.percentile(vals, 10)), p90=float(np.percentile(vals, 90)), ratio_all_years=ratio_all,
        excluded_year=exclude_year, years=tuple(sorted(rest)), method_id=str(hm["id"]),
    )
