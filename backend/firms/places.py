"""The places registry: every preset region with where its rows come from and its featured fires, as data.

The regions' boxes are the presets of `backend/terrain/live_region.py`; the country each region's rows come from is
`backend.firms.archive.REGION_COUNTRY`; the featured fires (name, the agency's dates, a point and the page they come
from) are in `places.json` beside this file. A featured fire's run starts are the region's real run starts inside the
fire's dates. Any box inside a cached country is a place too: its calendar is `GET /api/calendar?source=firms&box=`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

PLACES_FILE: Path = Path(__file__).resolve().parent / "places.json"
FIRE_BOX_HALF_DEG: float = 0.5        # a featured fire's calendar box: its point, this far each way
NO_END_RUN_START_DAYS: int = 90       # run starts are looked for this long after the first day when no end is published


def fire_box(point: list[float]) -> list[float]:
    lon, lat = float(point[0]), float(point[1])
    h = FIRE_BOX_HALF_DEG
    return [round(lon - h, 4), round(lat - h, 4), round(lon + h, 4), round(lat + h, 4)]


def fire_entry(f: dict[str, Any], starts: list[dict[str, Any]]) -> dict[str, Any]:
    """A featured fire as served: the registry's fields, a calendar box around its point, and the region's run starts
    inside its dates (from the first day to the last, or NO_END_RUN_START_DAYS after the first when no end is
    published)."""
    import datetime as _dt

    from backend.firms.real_calendar import box_text

    last = f.get("last_day")
    until = last or (_dt.date.fromisoformat(f["first_day"]) + _dt.timedelta(days=NO_END_RUN_START_DAYS)).isoformat()
    box = fire_box(f["point"])
    return {
        **f,
        "box": box,
        "calendar": "/api/calendar?source=firms&box=" + box_text(box),
        "run_starts_until": until,
        "run_starts_rule": ("the region's real run starts from first_day to last_day" if last else
                            f"the region's real run starts from first_day to {NO_END_RUN_START_DAYS} days after it "
                            "(no end date is published)"),
        "run_starts": [s for s in starts if f["first_day"] <= str(s.get("start", ""))[:10] <= until],
    }


def load_places(path: Path = PLACES_FILE) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def featured_fires(region_id: str, path: Path = PLACES_FILE) -> list[dict[str, Any]]:
    return [dict(f) for f in load_places(path).get("regions", {}).get(region_id, {}).get("featured_fires", [])]


def places_payload(starts_of: Callable[[str], list[dict[str, Any]]], index: Any = None,
                   path: Path = PLACES_FILE) -> dict[str, Any]:
    """{"places": [...], "box_calendar": {...}} for `GET /api/regions`. ``starts_of(region_id)`` gives the region's
    real run starts (the `real_run_starts` entries); ``index`` is the box index, for the countries it covers."""
    from backend.firms.archive import REGION_COUNTRY, region_box
    from backend.firms.real_calendar import BOX_MAX_SPAN_DEG, BOX_MIN_SPAN_DEG
    from backend.terrain.live_region import PRESET_REGIONS

    doc = load_places(path)
    out = []
    for spec in PRESET_REGIONS:
        b = spec.bbox
        real = spec.id in REGION_COUNTRY
        fires = []
        if real:
            starts = starts_of(spec.id)
            fires = [fire_entry(f, starts) for f in doc.get("regions", {}).get(spec.id, {}).get("featured_fires", [])]
        out.append({
            "id": spec.id,
            "name": spec.name,
            "country": REGION_COUNTRY[spec.id].replace("_", " ") if real else None,
            "box": [round(b.west, 5), round(b.south, 5), round(b.east, 5), round(b.north, 5)],
            "context_box": list(region_box(spec.id)),
            "rows": "firms" if real else "simulated",
            "calendar": f"/api/calendar?source=firms&region_id={spec.id}" if real else None,
            "featured_fires": fires,
        })
    countries: dict[str, list[float]] = {}
    if index is not None:
        try:
            countries = index.countries()
        except Exception:  # noqa: BLE001  (the registry answers without the box index)
            countries = {}
    return {
        "places": out,
        "featured_fires_from": doc.get("what"),
        "box_calendar": {
            "route": "/api/calendar?source=firms&box=<west>,<south>,<east>,<north>",
            "countries": sorted(countries),
            "country_extents": countries,
            "max_span_deg": BOX_MAX_SPAN_DEG,
            "min_span_deg": BOX_MIN_SPAN_DEG,
            "what": "any box with rows in a cached FIRMS country file; rows outside those countries are not counted",
        },
    }
