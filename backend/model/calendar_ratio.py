"""The real calendar's overlap ratio, for use as the blind test's second baseline.

The monthly calendar (`backend/firms/real_calendar.py`, method `overlap_ratio_v1`) harmonizes counts with one
number per region: Suomi NPP rows over Terra plus Aqua rows across the overlap months. The blind test must not let a
baseline see the fire it is scored on, nor any test fire, so the ratio is refitted here from the calendar's monthly
counts with two things left out: the year of the run, and every year that holds a test fire's exclusion for the
region (`backend/model/training.py`; 2021 for the three hero regions). A whole year is dropped, which is wider than
the exclusion itself, because the calendar's counts are monthly sums and no row can be taken back out of them. The
interval is the 10th to 90th percentile of the remaining years' ratios (the calendar's nominal 80 percent interval).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Iterable

import numpy as np


# The second baseline's own method for its pixel count, whatever method the Record serves: the ratio of Suomi NPP
# rows to Terra and Aqua rows over the clean overlap months of the other years, read from the calendar's raw monthly
# counts. It is the rule the Record's first method used; the label is this file's, never the calendar's.
METHOD_ID: str = "overlap_ratio_v1"


@dataclass(frozen=True)
class CalendarRatio:
    region_id: str
    ratio: float                 # Suomi NPP rows / (Terra + Aqua rows) over the years kept
    p10: float                   # 10th percentile of the kept years' ratios
    p90: float
    excluded_year: int | None    # the year of the run (the first, when a run touches two)
    years: tuple[int, ...]       # the years the ratio was fitted on
    method_id: str
    level: float = 0.80
    dropped_years: tuple[int, ...] = ()     # every year left out: the run's years and the years of test fires
    excluded_years: tuple[int, ...] = ()    # every year the run touches (a run over New Year touches two)
    # An optional field that `calendar_ratio` never sets and `as_dict` never writes: the all-years ratio holds the
    # test fires and has no place in a blind test's payload.
    ratio_all_years: float | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "region_id": self.region_id,
            "ratio": round(self.ratio, 4),
            "p10": round(self.p10, 4),
            "p90": round(self.p90, 4),
            "nominal_level": self.level,
            "excluded_year": self.excluded_year,
            "excluded_years": list(self.excluded_years),
            "dropped_years": list(self.dropped_years),
            "years": list(self.years),
            "method_id": self.method_id,
            "definition": (
                "Suomi NPP rows over Terra plus Aqua rows across the overlap months of the region's context box "
                "(the monthly counts of backend/firms/real_calendar.py, months with an outage day left out as the "
                "calendar does), fitted without the run's year and without any year that holds a test fire; p10 "
                "and p90 are percentiles of the kept years' ratios"
            ),
        }


def years_of_test_fires(region_id: str) -> tuple[int, ...]:
    """Years in which the region holds a test fire's exclusion."""
    from backend.model.training import EXCLUSIONS, _day_s

    if region_id not in EXCLUSIONS:
        return ()
    first, after, _ = EXCLUSIONS[region_id]
    y0 = int(first[:4])
    y1 = int(str(np.datetime64(int(_day_s(after) - 1.0), "s"))[:4])
    return tuple(range(y0, y1 + 1))


def yearly_counts(cal: dict[str, Any]) -> dict[int, tuple[float, float]]:
    """(Suomi NPP rows, Terra plus Aqua rows) per year over the calendar's clean overlap months."""
    outage = set(cal["harmonization_method"]["overlap_months_excluded_for_outages"])
    out: dict[int, list[float]] = {}
    for rec in cal["records"]:
        rc = rec["raw_counts"]
        if rc.get("Terra") is None or rc.get("Aqua") is None or rc.get("Suomi NPP") is None:
            continue
        if rec["year_month"] in outage:
            continue
        acc = out.setdefault(int(rec["year"]), [0.0, 0.0])
        acc[0] += float(rc["Suomi NPP"]["total"])
        acc[1] += float(rc["Terra"]["total"] + rc["Aqua"]["total"])
    return {y: (a, b) for y, (a, b) in out.items()}


def calendar_ratio(
    region_id: str, exclude_year: int | Iterable[int] | None, firms_calendar: Callable[[str], dict[str, Any]] | None = None,
    keep_years_of_test_fires: bool = False,
) -> CalendarRatio:
    """The calendar's ratio for a region without `exclude_year` and without the region's test-fire years.

    `exclude_year` is one year or several: a run that crosses New Year touches two, and both are left out, so
    that no row of the run itself, hidden or not, is in the ratio its second baseline uses.

    `keep_years_of_test_fires=True` exists only to reproduce the calendar's own leave-one-year-out figure in a check;
    nothing that is scored or validated may use it.
    """
    if firms_calendar is None:
        from backend.firms.real_calendar import firms_calendar as _fc

        firms_calendar = _fc
    cal = firms_calendar(region_id)
    counts = yearly_counts(cal)
    own = () if exclude_year is None else ((int(exclude_year),) if isinstance(exclude_year, (int, np.integer)) else tuple(sorted({int(y) for y in exclude_year})))
    dropped = set(own)
    if not keep_years_of_test_fires:
        dropped |= set(years_of_test_fires(region_id))
    kept = {y: ab for y, ab in counts.items() if y not in dropped and ab[1] > 0}
    if not kept:
        raise ValueError(f"no overlap year is left for {region_id} after dropping {sorted(dropped)}")
    vals = np.array([a / b for a, b in kept.values()])
    return CalendarRatio(
        region_id=region_id,
        ratio=float(sum(a for a, _ in kept.values()) / sum(b for _, b in kept.values())),
        p10=float(np.percentile(vals, 10)), p90=float(np.percentile(vals, 90)),
        excluded_year=own[0] if own else None, years=tuple(sorted(kept)), method_id=METHOD_ID,
        dropped_years=tuple(sorted(dropped)), excluded_years=own,
    )


# ----------------------------------------------------------------------------------------------------------------
# The calendar's ratio from a small file of its inputs, made at build time, so that a run needs no yearly extract
# ----------------------------------------------------------------------------------------------------------------

RATIO_INPUTS_VERSION: int = 1


def ratio_inputs_dir() -> "Path":
    """Where the build writes each place's file of the ratio's inputs (not tracked: made from the cached rows)."""
    from backend.firms.archive import FIRMS_CACHE_DIR

    return FIRMS_CACHE_DIR / "derived" / "ratio_inputs"


def ratio_inputs(cal: dict[str, Any]) -> dict[str, Any]:
    """What `yearly_counts` reads of a calendar, and nothing else: the outage months, and each month's year and
    totals of Terra, Aqua and Suomi NPP rows. A month without one of the three is kept as such, as the calendar
    holds it."""
    keep = ("Terra", "Aqua", "Suomi NPP")
    records = []
    for rec in cal["records"]:
        rc = rec["raw_counts"]
        records.append({"year": int(rec["year"]), "year_month": rec["year_month"],
                        "raw_counts": {p: (None if rc.get(p) is None else {"total": rc[p]["total"]}) for p in keep}})
    return {"harmonization_method": {"overlap_months_excluded_for_outages":
                                     list(cal["harmonization_method"]["overlap_months_excluded_for_outages"])},
            "records": records}


def write_ratio_inputs(region_id: str, out_dir: "Path | None" = None,
                       firms_calendar: Callable[[str], dict[str, Any]] | None = None) -> "Path":
    """Write the place's file of the ratio's inputs, from its calendar, with the digest of the rows it was made
    from (`backend.firms.archive.region_rows_digest`)."""
    import json
    from pathlib import Path

    from backend.firms.archive import region_rows_digest

    if firms_calendar is None:
        from backend.firms.real_calendar import firms_calendar as _fc

        firms_calendar = _fc
    doc = {"what": "the calendar's monthly counts its overlap ratio reads (backend/model/calendar_ratio.py)",
           "version": RATIO_INPUTS_VERSION, "region_id": region_id, "made_from_rows": region_rows_digest(region_id),
           **ratio_inputs(firms_calendar(region_id))}
    out = Path(out_dir) if out_dir is not None else ratio_inputs_dir()
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{region_id}.json"
    path.write_text(json.dumps(doc, sort_keys=True) + "\n", encoding="utf-8")
    return path


def ratio_inputs_calendar(in_dir: "Path | None" = None) -> Callable[[str], dict[str, Any]]:
    """A `firms_calendar` for `calendar_ratio` that reads each place's file of the ratio's inputs in place of the
    yearly extracts. It refuses a file of another version or of another place."""
    import json
    from pathlib import Path

    base = Path(in_dir) if in_dir is not None else ratio_inputs_dir()

    def read(region_id: str) -> dict[str, Any]:
        doc = json.loads((base / f"{region_id}.json").read_text(encoding="utf-8"))
        if doc.get("version") != RATIO_INPUTS_VERSION or doc.get("region_id") != region_id:
            raise ValueError(f"the file of the ratio's inputs for {region_id} is of another version or place")
        return doc

    return read


if __name__ == "__main__":
    import sys

    for _region in sys.argv[1:]:
        print(write_ratio_inputs(_region))
