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
            for f in doc.get("regions", {}).get(spec.id, {}).get("featured_fires", []):
                inside = [s for s in starts if f["first_day"] <= str(s.get("start", ""))[:10] <= f["last_day"]]
                fires.append({**f, "run_starts": inside})
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
