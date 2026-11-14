"""What a region and window of days is to the world model and to the learned agent.

  fire_roles(region_id, first_day, last_day) -> {"world_model": <standing>, "learned_agent": <standing>, ...}

A score means something different on a fire the model was fitted on, on one it was validated on, on one of the
three recorded test fires, and on one it never saw. A page prints the standing beside the score. The standing is
one of four words, for each part separately, because the two parts learned from different years:

  fitted on            the part's values were fitted on fires of this region in a year the window touches
  validated on         its values were checked on fires of this region in a year the window touches, and fitted on none
  recorded test fire   the window holds one of the three 2021 fires the blind test was run on once
  never seen           none of the above

The answer is read from the constants the fits read (`backend/model/training.py`, `backend/env/episodes.py`), so it
cannot drift from them. It is decided by region and year, not by matching the window against a list of episodes:
a window in a training year counts as fitted on even if no training episode fell inside it. That errs toward the
weaker claim. "never seen" is the claim a reader leans on, and it is made only when no day of the window lies in a
year the part learned from or was checked on.

A window that covers more than one standing takes the first that applies, in the order above.

`closed` is separate from the standing. No window of a test fire's region in the year of its fire is scored again,
whether or not it holds the fire: nothing inside the region's box in that year was learned from, so such a window
can be "never seen" and closed at once. A page offers no blind run and no round on a closed window.
"""

from __future__ import annotations

import datetime as _dt
from typing import Any

from backend.model.training import EXCLUSIONS, REGIONS, TRAINING_YEARS, VALIDATION_YEARS

FITTED_ON: str = "fitted on"
VALIDATED_ON: str = "validated on"
TEST_FIRE: str = "recorded test fire"
NEVER_SEEN: str = "never seen"
STANDINGS: tuple[str, ...] = (FITTED_ON, VALIDATED_ON, TEST_FIRE, NEVER_SEEN)

TEST_FIRE_NAMES: dict[str, str] = {"plumas_ca": "Dixie", "lytton_bc": "Lytton Creek", "evia_greece": "northern Evia"}

RULE: str = (
    "by region and year, from the years each part was fitted and validated on; a window that touches a test fire's "
    "dates is a recorded test fire, then fitted on before validated on, and never seen only when no day of the "
    "window lies in a year the part learned from or was checked on; the year of a region's test fire counts for "
    "nothing else, because nothing inside the region's box in that year was learned from"
)


def _day(text: str) -> _dt.date:
    return _dt.date.fromisoformat(str(text)[:10])


def _years(years: tuple[int, ...] | list[int]) -> str:
    ys = sorted(years)
    if not ys:
        return "no year"
    if len(ys) > 2 and ys == list(range(ys[0], ys[-1] + 1)):
        return f"{ys[0]} to {ys[-1]}"
    return str(ys[0]) if len(ys) == 1 else ", ".join(str(y) for y in ys[:-1]) + f" and {ys[-1]}"


def _test_fire_days(region_id: str) -> tuple[_dt.date, _dt.date] | None:
    """(first day, last day) of the dates set aside around a region's test fire, or None."""
    ex = EXCLUSIONS.get(region_id)
    if ex is None:
        return None
    return _day(ex[0]), _day(ex[1]) - _dt.timedelta(days=1)


def _closed_years(region_id: str) -> tuple[int, ...]:
    days = _test_fire_days(region_id)
    return () if days is None else tuple(range(days[0].year, days[1].year + 1))


def _agent_years() -> tuple[tuple[int, ...], tuple[int, ...]]:
    """(training years, validation years) of the learned agent's episodes."""
    from backend.env.episodes import TRAIN_LAST_YEAR, YEARS

    return tuple(y for y in YEARS if y <= TRAIN_LAST_YEAR), tuple(y for y in YEARS if y > TRAIN_LAST_YEAR)


def fire_roles(region_id: str, first_day: str, last_day: str) -> dict[str, Any]:
    """The standing of the window [first_day, last_day] of a region to the world model and to the learned agent,
    with a sentence of reason for each and whether the window is closed. Days are ISO dates; a time of day is
    ignored. JSON-ready."""
    first, last = _day(first_day), _day(last_day)
    if last < first:
        raise ValueError(f"the window ends before it starts: {first_day} to {last_day}")
    region = str(region_id)
    touched = set(range(first.year, last.year + 1))
    closed_years = set(_closed_years(region)) & touched
    open_years = touched - closed_years
    fire_days = _test_fire_days(region)
    holds_test_fire = fire_days is not None and first <= fire_days[1] and last >= fire_days[0]
    agent_train, agent_val = _agent_years()

    def standing(train: tuple[int, ...], val: tuple[int, ...]) -> str:
        if region not in REGIONS:
            return NEVER_SEEN
        if holds_test_fire:
            return TEST_FIRE
        if open_years & set(train):
            return FITTED_ON
        if open_years & set(val):
            return VALIDATED_ON
        return NEVER_SEEN

    model, agent = standing(TRAINING_YEARS, VALIDATION_YEARS), standing(agent_train, agent_val)
    name = TEST_FIRE_NAMES.get(region, "test")
    year = _years(sorted(closed_years)) if closed_years else ""
    nowhere = (f"No real rows of {region} have been read: fires of {', '.join(REGIONS[:-1])} and {REGIONS[-1]} are "
               "the only ones this part was fitted or checked on.")
    in_closed_year = (f"Nothing inside this region's box in {year} was learned from, because it is the year of the "
                      f"{name} fire, and the window touches no other year this part learned from or was checked on.")
    why_model = {
        FITTED_ON: f"The reconstruction's values were fitted on fires of this region in {_years(TRAINING_YEARS)}, and "
                   "the window touches one of those years.",
        VALIDATED_ON: f"The reconstruction's values were checked on fires of this region in {_years(VALIDATION_YEARS)} "
                      "and fitted on none of them; the window lies in those years.",
        TEST_FIRE: f"The window holds the {name} fire of {year}, one of the three fires the blind test was run on "
                   "once. Its looks are on record and it is not scored again.",
        NEVER_SEEN: f"The reconstruction's values were fitted on fires of {_years(TRAINING_YEARS)} and checked on fires "
                    f"of {_years(VALIDATION_YEARS)}; the window touches none of those years.",
    }[model]
    why_agent = {
        FITTED_ON: f"The agent was trained on episodes of {_years(agent_train)} in and around this region, and the "
                   "window touches one of those years. That is said by year: the window need not hold a training episode.",
        VALIDATED_ON: f"The agent's table was measured on episodes of {_years(agent_val)} in and around this region, "
                      "after its policy was fixed; the window lies in those years and in none it was trained on.",
        TEST_FIRE: f"Windows of the {name} fire of {year} are among the agent's recorded test episodes. Their tables "
                   "are on record and they are not played again.",
        NEVER_SEEN: f"The agent's episodes are of {_years(agent_train + agent_val)}; the window touches none of those years.",
    }[agent]
    if region not in REGIONS:
        why_model = why_agent = nowhere
    elif closed_years and not holds_test_fire:
        if model == NEVER_SEEN:
            why_model = in_closed_year
        if agent == NEVER_SEEN:
            why_agent = in_closed_year
    closed = bool(closed_years)
    return {
        "region_id": region,
        "first_day": first.isoformat(),
        "last_day": last.isoformat(),
        "world_model": model,
        "learned_agent": agent,
        "why": {"world_model": why_model, "learned_agent": why_agent},
        "closed": closed,
        "closed_why": (f"No window of {region} in {year}, the year of the {name} fire, is scored again: it is not held "
                       "out, revealed or played, whether or not it holds the fire.") if closed else None,
        "standings": list(STANDINGS),
        "rule": RULE,
    }
