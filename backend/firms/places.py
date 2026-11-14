"""The places registry: every preset region with where its rows come from, its featured fires, and a default, as data.

- The regions' boxes are the presets of `backend/terrain/live_region.py`; the country each region's rows come from is
  `backend.firms.archive.REGION_COUNTRY`.
- Featured fires are chosen by rule from the region's real run starts (`GET /api/runs/starts`, MODIS rows only):
  the starts the start search marks busiest, grouped into periods where they lie less than `PERIOD_GAP_DAYS` apart.
  Their size is the MODIS pixels in the box at their busiest start. Largest first within a region.
- Named fires (`places.json`): the name, dates, burned area and point a fire agency gives, with the page each comes
  from. A featured fire takes the name of a named fire whose dates overlap it and whose point lies within
  `NAME_MATCH_DEG` of the region's box; one without is shown by place and month.
- What a fire is to each part, the world model and the learned agent (fitted on, validated on, recorded test fire,
  never seen), comes from the model lane's function when it exists (`MODEL_ROLE_FUNCTION`): two fields,
  `to_the_world_model` and `to_the_learned_agent`, null until then.
- The default: the largest featured fire the world model never saw; while the standings are null, the largest that
  is not a blind test fire. The answer says which reading chose it. The learned agent's standing is served beside it
  and is not part of the rule: its episodes cover 2012 to 2023, so a fire the world model never saw may be one the
  agent was fitted on.

Any box inside a cached country is a place too: its calendar is `GET /api/calendar?source=firms&box=`.
"""

from __future__ import annotations

import calendar as _cal
import datetime as _dt
import json
from pathlib import Path
from typing import Any, Callable

PLACES_FILE: Path = Path(__file__).resolve().parent / "places.json"
FIRE_BOX_HALF_DEG: float = 0.5        # a named fire's calendar box: its point, this far each way
NO_END_RUN_START_DAYS: int = 90       # a named fire with no published end is taken to last this long for matching
PERIOD_GAP_DAYS: int = 31             # busiest starts closer than this belong to one featured period
NAME_MATCH_DEG: float = 0.5           # a named fire's point within this of the region's box can name a period
# (module, function) of the model lane's standing of a fire, when it lands: fire_roles(region_id, first_day, last_day)
# -> {"world_model": "<standing>", "learned_agent": "<standing>"}
MODEL_ROLE_FUNCTION: tuple[str, str] = ("backend.model.fire_roles", "fire_roles")
PARTS: dict[str, str] = {"world_model": "to_the_world_model", "learned_agent": "to_the_learned_agent"}
NEVER_SEEN: str = "never seen"
DEFAULT_RULE: str = ("the largest featured fire the world model never saw (MODIS pixels in the box at its busiest "
                     "start); while the standings are not served, the largest featured fire that is not a blind test "
                     "fire")


def load_places(path: Path = PLACES_FILE) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def fire_box(point: list[float]) -> list[float]:
    lon, lat = float(point[0]), float(point[1])
    h = FIRE_BOX_HALF_DEG
    return [round(lon - h, 4), round(lat - h, 4), round(lon + h, 4), round(lat + h, 4)]


def _day(s: str) -> _dt.date:
    return _dt.date.fromisoformat(str(s)[:10])


def _last_day(f: dict[str, Any]) -> _dt.date:
    return _day(f["last_day"]) if f.get("last_day") else _day(f["first_day"]) + _dt.timedelta(days=NO_END_RUN_START_DAYS)


def _month_label(months: list[str]) -> str:
    """'August 2012', 'July and August 2021', 'June to August 2021', 'December 2020 to January 2021'."""
    if len(months) == 1:
        return f"{_cal.month_name[int(months[0][5:7])]} {months[0][:4]}"
    first, last = _cal.month_name[int(months[0][5:7])], _cal.month_name[int(months[-1][5:7])]
    if months[0][:4] != months[-1][:4]:
        return f"{first} {months[0][:4]} to {last} {months[-1][:4]}"
    return f"{first} and {last} {months[0][:4]}" if len(months) == 2 else f"{first} to {last} {months[0][:4]}"


def _join(names: list[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def named_fire_entry(f: dict[str, Any]) -> dict[str, Any]:
    from backend.firms.real_calendar import box_text

    box = fire_box(f["point"])
    return {**f, "box": box, "calendar": "/api/calendar?source=firms&box=" + box_text(box)}


def featured_periods(region_id: str, starts: list[dict[str, Any]], named: list[dict[str, Any]],
                     box: list[float]) -> list[dict[str, Any]]:
    """The region's featured fires by rule (see the module docstring), largest first."""
    busiest = sorted((s for s in starts if s.get("busiest_in_month")), key=lambda s: s["start"])
    groups: list[list[dict[str, Any]]] = []
    for s in busiest:
        if groups and (_day(s["start"]) - _day(groups[-1][-1]["start"])).days < PERIOD_GAP_DAYS:
            groups[-1].append(s)
        else:
            groups.append([s])
    w, so, e, n = box
    out = []
    for g in groups:
        months = sorted({s["start"][:7] for s in g})
        first = _day(f"{months[0]}-01")
        y, m = int(months[-1][:4]), int(months[-1][5:7])
        last = _dt.date(y, m, _cal.monthrange(y, m)[1])
        top = max(g, key=lambda s: (int(s.get("modis_pixels_in_box") or 0), -_day(s["start"]).toordinal()))
        names = [f for f in named
                 if _day(f["first_day"]) <= last and _last_day(f) >= first
                 and w - NAME_MATCH_DEG <= f["point"][0] <= e + NAME_MATCH_DEG
                 and so - NAME_MATCH_DEG <= f["point"][1] <= n + NAME_MATCH_DEG]
        name = names[0] if names else None
        out.append({
            "id": f"{region_id}:{months[0]}",
            "region_id": region_id,
            "label": _month_label(months),
            "months": months,
            "first_day": first.isoformat(),
            "last_day": last.isoformat(),
            "size": {"modis_pixels_in_box": int(top.get("modis_pixels_in_box") or 0), "at_start": top["start"],
                     "what": "MODIS pixels inside the region's box at the period's busiest start"},
            "name": _join([f["name"] for f in names]) if names else None,
            "named_fire": name["id"] if name else None,
            "named_fires": [f["id"] for f in names],
            "name_source": name["source"] if name else None,
            "blind_test_fire": bool(name and name.get("blind_test_fire")),
            **{field: None for field in PARTS.values()},
            "default_start": top["start"],
            "default_start_rule": "the period's start with the most MODIS pixels in the box (the earliest on a tie)",
            "calendar": f"/api/calendar?source=firms&region_id={region_id}",
            "run_starts": [s for s in starts if first.isoformat() <= s["start"][:10] <= last.isoformat()],
        })
    out.sort(key=lambda p: -p["size"]["modis_pixels_in_box"])
    return out


def _model_roles() -> Callable[..., Any] | None:
    import importlib

    mod, fn = MODEL_ROLE_FUNCTION
    try:
        return getattr(importlib.import_module(mod), fn)
    except (ImportError, AttributeError):
        return None


def region_years(region_id: str) -> dict[str, Any]:
    """The years a region's cached rows cover: country file years, and how far the area API rows reach."""
    from backend.firms.archive import FIRMS_CACHE_DIR, read_manifest

    base = FIRMS_CACHE_DIR / "extract" / region_id
    country, area_to = set(), None
    for p in sorted(base.glob("*.csv")) if base.is_dir() else []:
        m = read_manifest(p) or {}
        year = p.stem.rpartition("_")[2]
        if (m.get("lineage") or {}).get("source") == "area_api":
            last = (m.get("covered_days") or [None, None])[1]
            area_to = max(area_to or "", last or "") or area_to
        elif year.isdigit():
            country.add(int(year))
    return {"country_files": [min(country), max(country)] if country else None, "area_api_through": area_to,
            "what": "years of the FIRMS country files cached for the region, and the last day its area API rows cover"}


def places_payload(starts_of: Callable[[str], list[dict[str, Any]]], index: Any = None,
                   path: Path = PLACES_FILE, default_start_of: Callable[[str], Any] | None = None) -> dict[str, Any]:
    """{"places": [...], "default": {...}, "box_calendar": {...}} for `GET /api/regions`. ``starts_of(region_id)``
    gives the region's real run starts and ``default_start_of(region_id)`` the start a run opens on; ``index`` is
    the box index, for the countries it covers."""
    from backend.firms.archive import REGION_COUNTRY, region_box
    from backend.firms.real_calendar import BOX_MAX_SPAN_DEG, BOX_MIN_SPAN_DEG
    from backend.terrain.live_region import PRESET_REGIONS

    doc = load_places(path)
    roles = _model_roles()
    out, periods = [], []
    for spec in PRESET_REGIONS:
        b = spec.bbox
        box = [round(b.west, 5), round(b.south, 5), round(b.east, 5), round(b.north, 5)]
        real = spec.id in REGION_COUNTRY
        named = [named_fire_entry(f) for f in doc.get("regions", {}).get(spec.id, {}).get("named_fires", [])] if real else []
        starts = starts_of(spec.id) if real else []
        featured = featured_periods(spec.id, starts, named, box) if real else []
        if roles is not None:
            for p in featured:
                try:
                    got = roles(p["region_id"], p["first_day"], p["last_day"]) or {}
                except Exception:  # noqa: BLE001  (a standing the function cannot give stays null)
                    got = {}
                for part, field in PARTS.items():
                    p[field] = got.get(part)
        for f in named:
            f["featured_fire"] = next((p["id"] for p in featured if f["id"] in p["named_fires"]), None)
        periods += featured
        out.append({
            "id": spec.id,
            "name": spec.name,
            "country": REGION_COUNTRY[spec.id].replace("_", " ") if real else None,
            "box": box,
            "context_box": list(region_box(spec.id)),
            "rows": "firms" if real else "simulated",
            "calendar": f"/api/calendar?source=firms&region_id={spec.id}" if real else None,
            "years": region_years(spec.id) if real else None,
            "starts": ({"route": f"/api/runs/starts?region_id={spec.id}&source=firms", "count": len(starts),
                        "default_start": default_start_of(spec.id) if default_start_of else None} if real else None),
            "featured_fires": featured,
            "named_fires": named,
        })

    known = [p for p in periods if p.get(PARTS["world_model"]) is not None]
    if known:
        pool, reading = [p for p in known if p[PARTS["world_model"]] == NEVER_SEEN], "the world model's standing"
    else:
        pool, reading = [p for p in periods if not p["blind_test_fire"]], "while the standings are not served"
    pick = max(pool, key=lambda p: p["size"]["modis_pixels_in_box"], default=None)
    countries: dict[str, list[float]] = {}
    if index is not None:
        try:
            countries = index.countries()
        except Exception:  # noqa: BLE001  (the registry answers without the box index)
            countries = {}
    return {
        "places": out,
        "default": ({"region_id": pick["region_id"], "featured_fire": pick["id"], "start": pick["default_start"],
                     "rule": DEFAULT_RULE, "chosen_by": reading,
                     **{field: pick[field] for field in PARTS.values()}} if pick else
                    {"region_id": None, "featured_fire": None, "start": None, "rule": DEFAULT_RULE, "chosen_by": reading}),
        "featured_fires_rule": (f"periods of the starts the start search marks busiest, less than {PERIOD_GAP_DAYS} "
                                "days apart, largest first by MODIS pixels in the box at the busiest start; named "
                                f"from places.json when a named fire's dates overlap and its point lies within "
                                f"{NAME_MATCH_DEG:g} degrees of the region's box"),
        "standing": ("to_the_world_model and to_the_learned_agent are null until the model's function is served; each "
                     "will say whether that part was fitted on the fire, validated on it, had it as a recorded test "
                     "fire, or never saw it"),
        "named_fires_from": doc.get("what"),
        "box_calendar": {
            "route": "/api/calendar?source=firms&box=<west>,<south>,<east>,<north>",
            "countries": sorted(countries),
            "country_extents": countries,
            "max_span_deg": BOX_MAX_SPAN_DEG,
            "min_span_deg": BOX_MIN_SPAN_DEG,
            "what": "any box with rows in a cached FIRMS country file; rows outside those countries are not counted",
        },
    }
