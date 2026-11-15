"""What a region and window of days is to the challenger, the estimate a held-out run answers with when the switch
is on (`ISOGON_RUN_ESTIMATE=challenger`, backend/model/real_run.py).

  challenger_standing(region_id, first_day, last_day, context_box) -> {"standing": <one of four words>, "why": ..., ...}

The words are those the page says of the estimate in use (backend/model/fire_roles.py): fitted on, validated on,
recorded test fire, never seen. The challenger learned from two things, and the standing takes both:

  its own parts     fitted on the fresh test's fitting fires and chosen on its validation fires, read from the plan
                    (backend/model/fitted_values/fresh_world_plan.json), the plan its bundle names by digest
  the values it reads  the occupancy values in use, which make its features; their standing is the world model's

It is decided by place and year, as the estimate in use's is by region and year: a fire of the plan counts when its
place (a square of 2.5 degrees) meets the region's context box, edges touching included, and a year of its days is
one the window touches. That errs toward the weaker claim: a window in such a year is fitted on even when no fire of
the plan falls inside its days. The plan's fires inside the window's days, and those of the same places in other
years, are listed beside the word. Nothing but the plan's file and the bundles is read; no row of any fire.
"""

from __future__ import annotations

import datetime as _dt
from functools import lru_cache
import json
from pathlib import Path
from typing import Any

from backend.model import fire_roles as FR
from backend.model import fresh_test as F

PLAN_FILE: Path = Path(__file__).resolve().parent / "fitted_values" / "fresh_world_plan.json"

RULE: str = (
    "by place and year: a window that touches a test fire's dates is a recorded test fire; then fitted on when a "
    "fitting fire of the plan lies in a place the region's context box meets in a year the window touches, or the "
    "occupancy values the challenger reads were fitted on the region in such a year; then validated on, by the same "
    "rule for the plan's validation fires and the values' validation years; never seen otherwise"
)


def _day(text: str) -> _dt.date:
    return _dt.date.fromisoformat(str(text)[:10])


def _years(years: set[int] | list[int]) -> str:
    return FR._years(sorted(years))


@lru_cache(maxsize=4)
def _plan(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _bundles(variant: str) -> list[dict[str, Any]]:
    """The variant's bundle and, for a blend, the bundles of its parts."""
    from backend.model.challenger import FITTED_DIR, VARIANT_FILES

    doc = json.loads((FITTED_DIR / VARIANT_FILES[variant]).read_text(encoding="utf-8"))
    parts = [json.loads((FITTED_DIR / name).read_text(encoding="utf-8")) for name in (doc.get("component_files") or {}).values()]
    return [doc, *parts]


def places_met(box: tuple[float, float, float, float]) -> list[str]:
    """The ids of the plan's places a box meets, edges touching included."""
    i0, j0 = F.place_of(box[0], box[1])
    i1, j1 = F.place_of(box[2], box[3])
    return sorted(F.place_id((i, j)) for i in range(i0 - 1, i1 + 2) for j in range(j0 - 1, j1 + 2)
                  if 0 <= j < 180 / F.PLACE_DEG and F._meets(F.place_box((i, j)), tuple(box)))


def _fire(e: dict[str, Any]) -> dict[str, Any]:
    return {"key": e["key"], "first_day": e["first_overpass_utc"][:10], "last_day": e["last_overpass_utc"][:10],
            "tile_box": list(e["box"])}


def challenger_standing(region_id: str, first_day: str, last_day: str, context_box: tuple[float, float, float, float],
                        variant: str | None = None, plan_file: Path = PLAN_FILE) -> dict[str, Any]:
    """The standing of the window [first_day, last_day] of a region, whose rows are read in `context_box`, to the
    challenger of `variant` (the default challenger when None). JSON-ready."""
    from backend.model.challenger import default_variant

    variant = variant or default_variant()
    plan = _plan(str(plan_file))
    for b in _bundles(variant):
        fo = b.get("fitted_on") or {}
        if fo.get("plan_sha256") != plan["plan_sha256"] or fo.get("role") != "fitting":
            raise ValueError(f"the challenger's bundle {b.get('name')} names another plan or role than {plan_file.name}")
    first, last = _day(first_day), _day(last_day)
    if last < first:
        raise ValueError(f"the window ends before it starts: {first_day} to {last_day}")
    roles = FR.fire_roles(region_id, first_day, last_day)
    touched = set(range(first.year, last.year + 1)) - set(FR._closed_years(str(region_id)))
    places = places_met(tuple(context_box))

    def fires(role: str) -> list[dict[str, Any]]:
        return [e for e in plan["episodes"][role] if e["place_id"] in places]

    def years_of(e: dict[str, Any]) -> set[int]:
        return set(range(_day(e["first_overpass_utc"]).year, _day(e["last_overpass_utc"]).year + 1))

    fit, val = fires("fitting"), fires("validation")
    fit_years = set().union(*(years_of(e) for e in fit)) if fit else set()
    val_years = set().union(*(years_of(e) for e in val)) if val else set()
    inside = [e for e in fit + val
              if _day(e["first_overpass_utc"]) <= last and _day(e["last_overpass_utc"]) >= first]
    values = roles["world_model"]
    n_fit = len(fit)

    def count(n: int, what: str) -> str:
        return f"{n} {what}" + ("" if n == 1 else "s")

    if values == FR.TEST_FIRE:
        standing, why = FR.TEST_FIRE, roles["why"]["world_model"]
    elif touched & fit_years:
        standing = FR.FITTED_ON
        why = (f"The challenger was fitted on {count(n_fit, 'fire')} of the fresh test's fitting set in the places this "
               f"region's box meets, in {_years(fit_years)}, and the window touches {_years(touched & fit_years)}.")
    elif values == FR.FITTED_ON:
        standing = FR.FITTED_ON
        why = ("The occupancy values the challenger reads to make its features are the estimate in use's: "
               + roles["why"]["world_model"])
    elif touched & val_years:
        standing = FR.VALIDATED_ON
        why = (f"The challenger was chosen on {count(len(val), 'fire')} of the fresh test's validation set in the places "
               f"this region's box meets, in {_years(val_years)}, and fitted on none in a year the window touches.")
    elif values == FR.VALIDATED_ON:
        standing = FR.VALIDATED_ON
        why = ("The occupancy values the challenger reads to make its features are the estimate in use's: "
               + roles["why"]["world_model"])
    else:
        standing = FR.NEVER_SEEN
        why = (f"The challenger was fitted on fires of the fresh test's fitting set of {_years(list(F.YEARS))}; none "
               "lies in the places this region's box meets in a year the window touches, and the occupancy values it "
               "reads never saw this region in those years.")
        if fit:
            why += (f" Those places hold {count(n_fit, 'fitting fire')} of {_years(fit_years)}, other years than the "
                    "window's.")
    fitted_inside = [e for e in inside if e["role"] == "fitting"]
    if standing == FR.FITTED_ON and fitted_inside:
        e = fitted_inside[0]
        why += (f" The fitting fire {e['key']} lies inside the window's days, {e['first_overpass_utc'][:10]} to "
                f"{e['last_overpass_utc'][:10]}" + (f", with {count(len(fitted_inside) - 1, 'other')}." if len(fitted_inside) > 1 else "."))
    return {
        "method": f"challenger_{variant}",
        "region_id": str(region_id),
        "first_day": first.isoformat(),
        "last_day": last.isoformat(),
        "standing": standing,
        "why": why,
        "places": places,
        "fitting_fires_in_these_places": [_fire(e) for e in fit],
        "validation_fires_in_these_places": [_fire(e) for e in val],
        "plan_fires_inside_the_window": [{**_fire(e), "role": e["role"]} for e in inside],
        "the_occupancy_values_it_reads": values,
        "plan": {"file": f"backend/model/fitted_values/{plan_file.name}", "plan_sha256": plan["plan_sha256"]},
        "standings": list(FR.STANDINGS),
        "rule": RULE,
    }
