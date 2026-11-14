"""Which real rows may be learned from: everything except the three test fires.

The test fires are the 2021 fires the hero presets were chosen for. A row is kept for training only when it lies
outside every exclusion below, each of which is wider than the fire it protects:

  plumas_ca     the whole context box from 2021-07-01 to the end of 2021 (the Dixie Fire left the test box and
                burned across the context box into October)
  lytton_bc     the test box grown by 0.2 degrees, from 2021-06-15 to 2021-09-30 (Lytton Creek fire)
  evia_greece   the test box grown by 0.2 degrees, from 2021-07-25 to 2021-08-31 (northern Evia fire)

and, for all three, the test box grown by 0.2 degrees for the whole of the year of its fire: nothing that happened
in a test box in 2021 is learned from, before or after the fire's own dates.

Training rows are therefore other years in the same three context boxes, and 2021 rows away from the test boxes and
the test fires (for example the Sparks Lake fire north of Lytton and the Attica fires south of Evia; in the Plumas
context box nothing after 30 June 2021 is used). Later years than 2021 are used as freely as earlier ones: the
test is of fires the model has not seen, not of a forecast in time.
"""

from __future__ import annotations

import calendar
from typing import Any, Callable, Iterable

import numpy as np

from backend.eval.rows import Detections, detections_from_rows

REGIONS: tuple[str, ...] = ("plumas_ca", "lytton_bc", "evia_greece")

# Years with both VIIRS platforms in the archive (NOAA-20 from 2018). 2021 is added with the exclusions applied.
TRAINING_YEARS: tuple[int, ...] = (2018, 2019, 2020, 2022, 2023)
VALIDATION_YEARS: tuple[int, ...] = (2024, 2025)

# region -> (first excluded day, day after the last excluded day, margin in degrees or None for the whole context box)
EXCLUSIONS: dict[str, tuple[str, str, float | None]] = {
    "plumas_ca": ("2021-07-01", "2022-01-01", None),
    "lytton_bc": ("2021-06-15", "2021-10-01", 0.2),
    "evia_greece": ("2021-07-25", "2021-09-01", 0.2),
}


def _day_s(d: str) -> float:
    y, m, dd = (int(v) for v in d.split("-"))
    return float(calendar.timegm((y, m, dd, 0, 0, 0, 0, 0, 0)))


TEST_BOX_MARGIN_DEG: float = 0.2

# Where the looks at the test fires are served: what a refusal or a run that is not scored points to.
EVIDENCE_ADDRESS: str = "/api/evidence"


def closed_years(region_id: str) -> tuple[int, ...]:
    """Every year the set-aside dates of a region's test fire touch, from the first to the last; none for a
    region without a test fire."""
    ex = EXCLUSIONS.get(region_id)
    if ex is None:
        return ()
    first = int(ex[0][:4])
    last = int(str(np.datetime64(int(_day_s(ex[1]) - 1.0), "s"))[:4])
    return tuple(range(first, last + 1))


def window_meets_years(years: Iterable[int], start_s: float, end_s: float) -> list[int]:
    """The years among `years` that the window [start_s, end_s) holds a moment of. A window of no length is the
    one moment `start_s`."""
    out = []
    for y in sorted(set(int(v) for v in years)):
        y0, y1 = _day_s(f"{y}-01-01"), _day_s(f"{y + 1}-01-01")
        if start_s < y1 and (end_s > y0 or start_s >= y0):
            out.append(y)
    return out


def closed_for(
    box: tuple[float, float, float, float], start_s: float, end_s: float,
    region_box: Callable[[str], tuple[float, float, float, float]] | None = None,
) -> dict[str, Any] | None:
    """The closed rule. The test of the three test fires is closed: no window of a test fire's region in a year
    of its fire is held out, revealed, played, fitted on or scored again, whether or not it holds the fire.

    `box` is (west, south, east, north) in degrees and the window is [start_s, end_s) in UTC seconds. The answer
    is None for an open window. Otherwise it is `{"region_id", "years"}`: the region whose context box the box
    meets, and the years of its fire's set-aside dates that the window holds a moment of. Every year from the
    first to the last of those dates counts, so a period that crosses New Year is closed on either side.
    `region_box(region_id)` gives a region's context box; it is `backend.firms.region_box` when not given.
    """
    if region_box is None:
        from backend.firms import region_box as _region_box

        region_box = _region_box
    w, s, e, n = (float(v) for v in box)
    for region in EXCLUSIONS:
        met = window_meets_years(closed_years(region), float(start_s), float(end_s))
        if not met:
            continue
        cw, cs, ce, cn = region_box(region)
        if w <= ce and cw <= e and s <= cn and cs <= n:
            return {"region_id": region, "years": met}
    return None


def excluded_mask(det: Detections, region_id: str, test_box: tuple[float, float, float, float]) -> np.ndarray:
    """True for rows of `region_id`'s context box that may not be learned from: the region's exclusion, and its
    test box (grown by the margin) for the whole of every year the exclusion touches."""
    first, after, margin = EXCLUSIONS[region_id]
    in_time = (det.time_s >= _day_s(first)) & (det.time_s < _day_s(after))
    w, s, e, n = test_box
    m = TEST_BOX_MARGIN_DEG
    near_test_box = det.in_box((w - m, s - m, e + m, n + m))
    y0 = int(first[:4])
    y1 = int(str(np.datetime64(int(_day_s(after) - 1.0), "s"))[:4])
    in_year = (det.time_s >= _day_s(f"{y0}-01-01")) & (det.time_s < _day_s(f"{y1 + 1}-01-01"))
    whole_year = near_test_box & in_year
    if margin is None:
        return in_time | whole_year
    return (in_time & det.in_box((w - margin, s - margin, e + margin, n + margin))) | whole_year


def region_training_detections(
    region_id: str,
    years: Iterable[int],
    read_firms: Callable[..., list[dict[str, str]]],
    context_box: tuple[float, float, float, float],
    test_box: tuple[float, float, float, float],
    source: str,
) -> Detections:
    """Rows of one region's context box for the given years, with that region's exclusion removed."""
    rows: list[dict[str, str]] = []
    for y in years:
        rows.extend(read_firms(context_box, f"{y}-01-01", f"{y + 1}-01-01"))
    det = detections_from_rows(rows, source)
    return det.select(~excluded_mask(det, region_id, test_box))


def training_detections(
    read_firms: Callable[..., list[dict[str, str]]],
    region_box: Callable[[str], tuple[float, float, float, float]],
    preset_by_id: dict[str, Any],
    years: Iterable[int] = TRAINING_YEARS + (2021,),
    regions: Iterable[str] = REGIONS,
) -> tuple[Detections, str]:
    """(training rows from all regions, a one line description). Regions are far apart, so rows never collide."""
    years = tuple(years)
    parts: list[Detections] = []
    for r in regions:
        b = preset_by_id[r].bbox
        parts.append(
            region_training_detections(r, years, read_firms, region_box(r), (b.west, b.south, b.east, b.north), "firms training rows")
        )
    label = (
        f"real FIRMS rows of {', '.join(regions)} context boxes, years {', '.join(str(y) for y in years)}, "
        "with the three 2021 test fires excluded (backend/model/training.py)"
    )
    return concat(parts, "firms training rows"), label


def concat(parts: list[Detections], source: str) -> Detections:
    """Join detections; `row_index` restarts from zero."""
    from dataclasses import fields

    kw: dict[str, Any] = {}
    for f in fields(Detections):
        if f.name == "source":
            kw[f.name] = source
        elif f.name == "row_index":
            kw[f.name] = np.arange(sum(len(p) for p in parts), dtype=np.int64)
        else:
            kw[f.name] = np.concatenate([getattr(p, f.name) for p in parts])
    return Detections(**kw)
