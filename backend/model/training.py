"""Which real rows may be learned from: everything except the three test fires.

The test fires are the 2021 fires the hero presets were chosen for. A row is kept for training only when it lies
outside every exclusion below, each of which is wider than the fire it protects:

  plumas_ca     the whole context box from 2021-07-01 to the end of 2021 (the Dixie Fire left the test box and
                burned across the context box into October)
  lytton_bc     the test box grown by 0.2 degrees, from 2021-06-15 to 2021-09-30 (Lytton Creek fire)
  evia_greece   the test box grown by 0.2 degrees, from 2021-07-25 to 2021-08-31 (northern Evia fire)

Training rows are therefore other years in the same three context boxes, and 2021 rows away from the test fires
(for example the Beckwourth Complex east of the Plumas box in early July 2021, the Sparks Lake fire north of Lytton,
and the Attica fires south of Evia).
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


def excluded_mask(det: Detections, region_id: str, test_box: tuple[float, float, float, float]) -> np.ndarray:
    """True for rows of `region_id`'s context box that fall inside that region's exclusion."""
    first, after, margin = EXCLUSIONS[region_id]
    in_time = (det.time_s >= _day_s(first)) & (det.time_s < _day_s(after))
    if margin is None:
        return in_time
    w, s, e, n = test_box
    return in_time & det.in_box((w - margin, s - margin, e + margin, n + margin))


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
