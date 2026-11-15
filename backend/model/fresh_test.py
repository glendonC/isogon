"""The fresh test: the estimate looked at on fires chosen by rule across the world, then refitted and looked at again.

This file is the protocol. It was committed before any row was read for it, and every record the test writes names
its digest (`protocol_sha256`), so a protocol changed after a score would show. A test pins the digest.

The three recorded looks at the 2021 test fires stay closed (`backend.model.training.closed_for`). The fresh test
does not reopen them: no place of it meets the context box of one of the three first regions.

The order, each step on record before the next begins:

1. The plan. Places, roles and episodes are chosen from MODIS rows and the places' coordinates alone; no file of a
   sharp satellite is opened. The plan is committed with its digest.
2. The rows. Only then are the sharp satellite's rows of the chosen windows read, the second baseline's monthly
   counts taken, and the pass lists fetched.
3. Test A, one look with the fitted values in use.
4. The refit on the fitting set, its validation, and the decision by the rule below.
5. Test B, one look with the values the decision chose.
6. The players of the round on the same split.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Iterable

from backend.model.training import REGIONS

PROTOCOL_ID: str = "fresh_world_v1"
# The two looks, each under its own name beside the three recorded looks at the test fires.
LOOK_NAMES: dict[str, str] = {"test_a": "fresh test A, values in use", "test_b": "fresh test B, after the refit"}
# The regions the values in use were fitted, validated and tested in. No place of the fresh test meets them.
FIRST_REGIONS: tuple[str, ...] = REGIONS
# The years: both VIIRS platforms in the country files, and NOAA-21 (whose rows are not in them) not yet flying.
YEARS: tuple[int, ...] = (2018, 2019, 2020, 2021, 2022)
# A place is a square of this many degrees on a grid from 180 W and 90 S; its 25 tiles are a fifth of that a side.
PLACE_DEG: float = 2.5
TILES_PER_SIDE: int = 5
# Roles are given to blocks of places this many degrees a side.
BLOCK_DEG: float = 10.0
ROLES: tuple[str, ...] = ("fitting", "validation", "test_a", "test_b")
# Six equal shares; a block takes the share its digest falls in.
ROLE_SHARES: tuple[str, ...] = ("fitting", "fitting", "fitting", "validation", "test_a", "test_b")
CONTINENTS: tuple[str, ...] = ("Africa", "Asia", "Europe", "North America", "Oceania", "South America")
ZONES: tuple[str, ...] = ("tropical", "subtropical", "temperate", "boreal")
# Episodes taken in each role and continent, at most.
QUOTA: dict[str, int] = {"fitting": 50, "validation": 20, "test_a": 20, "test_b": 20}
# Episodes taken at one place, at most, each of another year.
PER_PLACE: int = 2
# FIRMS types left out of both instruments before anything else: 1 active volcano, 2 other static land source,
# 3 offshore. What is left is taken as vegetation fire, as the Record counts a box.
LEFT_OUT_TYPES: tuple[str, ...] = ("1", "2", "3")
# A look counts as clear in the second table when its hidden pass's own mask put at most this share of the tile
# under cloud.
CLEAR_SHARE: float = 0.25

_FITTED_DIR: Path = Path(__file__).resolve().parent / "fitted_values"
# The fitted values test A uses, frozen: the estimate's values with its stated interval, and the second baseline's
# power ratio. A look refuses to run when a file differs from its digest.
FROZEN_VALUES: dict[str, str] = {
    "occupancy_params.json": "b45e689835b4a9e175ed63877757ebe71226628d3466cb983c411fd837570eb9",
    "overlap_ratio.json": "881d5654e1fa8638271f5ff7bc87bd3c26699e538dd1c88a098f3b00c34c1811",
}

PROTOCOL: dict[str, str] = {
    "what": (
        "A test of the estimate made from MODIS alone, with VIIRS hidden, on fires it has never been fitted, "
        "validated or tested on, chosen by rule across the world. Two looks, each taken once: test A with the "
        "values in use, and test B after a refit on a fitting set and its validation. Each is recorded beside the "
        "three looks at the 2021 test fires under its own name, and reported as it is."
    ),
    "store": (
        "Rows come from FIRMS's yearly country files in the shared store, every country READY.md lists when the "
        "plan is made. The plan waits for the store to hold every country; if the lead calls it earlier, it runs on "
        "the countries listed, and the record names every country left out. Rows of FIRMS types 1, 2 and 3 "
        "(volcano, static land source, offshore) are left out of both instruments, as the Record counts a box."
    ),
    "places": (
        "A place is a square of 2.5 degrees on a grid from 180 W and 90 S, cut into 25 tiles of 0.5 degrees, as a "
        "region's context box is cut into its 25 test boxes. A place that meets the context box of plumas_ca, "
        "lytton_bc or evia_greece, edges touching included, is not in the test, in any year, so no row near a "
        "closed test fire is touched. Each place has a continent and a zone, both from the coordinates of its "
        "centre (continent_of, zone_of). The zone, from latitude, stands in for fuel: no map of fuel is read, and "
        "the record says so."
    ),
    "split": (
        "By place, from coordinates alone. Places are grouped in blocks of 10 degrees; a block's role is the share "
        "its sha256 falls in, of six equal shares: three for fitting, one for validation, one for test A and one "
        "for test B (role_of_block). A place of validation, test A or test B that meets a place of another role, "
        "corners included, is left out, so no place of those three roles is next to a place of any other role. "
        "No row of either instrument is read to split."
    ),
    "offered_regions": (
        "A place of validation, test A or test B that meets the context box of a region the page offers, edges "
        "touching included, is left out of its role in every year, so that the page cannot show a row of a test "
        "before its look; fitting places are not touched. The regions offered are every region the registry of "
        "places holds when the plan is made and every region the data side has named for the page by then, each "
        "by its context box, read from coordinates alone. The plan's record names each region with its box, and "
        "how many places the rule costs each role, continent and zone (offered_cost)."
    ),
    "episodes": (
        "By the rule in use (backend/model/episodes.py, find_episodes, with its defaults), each place standing for "
        "a region's context box: in each tile and year from 2018 to 2022, the run of 12 consecutive MODIS "
        "overpasses that flagged the most MODIS pixels in the tile, kept when it flagged at least 60 and spans at "
        "most 120 hours; at most the three busiest tiles a place and year. VIIRS rows are never opened to choose. "
        "Then, per place, the busiest episode of each year by MODIS pixels in its tile, and of those the two "
        "busiest. Then, per role and continent, up to the quota (50 for fitting, 20 for validation, 20 for test A, "
        "20 for test B), taken round the zones in the order tropical, subtropical, temperate, boreal, the busiest "
        "left in a zone at each turn; a zone with none left is passed over. Ties go to the earlier window, then to "
        "the place further west and south. A continent with fewer episodes than its quota gives what it has, and "
        "no other continent makes up the difference."
    ),
    "after_the_plan": (
        "The plan (every place with its role, continent and zone, every episode chosen, the MODIS files read with "
        "their sha256) is committed before any VIIRS file is opened for the test. Then the rows of both instruments "
        "inside each chosen place over its window and two days either side are read; the pass lists of the hidden "
        "platforms are fetched from NASA CMR for each window; and the monthly counts the second baseline needs are "
        "taken. An episode whose pass list cannot be fetched, or whose rows cannot be read, is listed as not "
        "scored, with the reason; nothing takes its place."
    ),
    "scored": (
        "Protocol version 3 of the blind test, VIIRS hidden: one prediction per pass of a hidden platform in "
        "NASA's pass list whose swath held the whole tile, each scored whether or not it flagged anything; never "
        "the nominal schedule. The estimate and the two baselines as they are: painted_modis, and overlap_ratio "
        "with the frozen power ratio and, for its pixel count, the place's own calendar ratio by the Record's rule "
        "(Suomi NPP rows over Terra and Aqua rows across the clean overlap months of the place, the years of the "
        "run left out; calendar_ratio). The seven scores of verdict, and beside them the share of looks whose "
        "hidden total power lies inside the stated interval."
    ),
    "counted": (
        "Both ways, each saying its kind. Per fire, a plain comparison: the scores on which the estimate is strictly "
        "better than both baselines on that episode. Per continent, per zone and over all, judged with an interval: "
        "the episodes are resampled whole 2,000 times (bootstrap_verdict, seed and level as in use), and a score is "
        "ahead, tied or behind. A set of few episodes has a wide interval, and the record gives each set's size."
    ),
    "test_a": (
        "One look at the test A episodes with the values in use, frozen by their sha256 in FROZEN_VALUES, after "
        "the rows and pass lists are in and before the refit starts. Nothing of the refit or its decision reads a "
        "test A result."
    ),
    "refit": (
        "The search of backend/model/fit_real.py as it is (its grid, objective, matching of counts and interval "
        "rule), started from the priors, on the fitting set: the fitting episodes of the plan and the 17 open "
        "training episodes of the three first regions (2018, 2019, 2020, 2022 and 2023). Then the refit and the "
        "values in use are both run on the validation episodes of the plan."
    ),
    "decision": (
        "The refit is the one test B is looked at with when, on the validation episodes, judged with an interval: "
        "(1) the rule in use for fitted values holds for it, no score behind either baseline and at least one "
        "ahead of both (fit_real.decide); and (2) against the values in use, no score is behind. Otherwise test B "
        "is looked at with the values in use and the refit is kept on record, unused. The decision is committed "
        "before test B is looked at."
    ),
    "test_b": (
        "One look at the test B episodes with the values the decision chose. Nothing has read a test B row of "
        "VIIRS before it, apart from the second baseline's monthly counts of other years."
    ),
    "test_b_methods": (
        "Test B's headline is the values the decision chose. Beside it, in the same look and on the same looks, "
        "test B also scores the other of the two values (the refit or the values in use) and every challenger model "
        "handed over before the look (backend/model/challenger, each a Method of the blind test) whose code was "
        "checked against these rules first: fitted on the fitting episodes and chosen on the validation episodes "
        "only, shown no row of test A or test B before the look. Each is judged against the two baselines by the "
        "same counts, and against the headline with an interval. None of them takes the headline's place, and "
        "nothing is chosen from what they show."
    ),
    "clear_looks": (
        "A second table, beside the main one and never in its place. If the share of each hidden pass's tile under "
        "cloud, by that pass's own cloud mask (the shared store's passmask), is on hand when a look is taken, the "
        "look also scores the same episodes on the looks whose hidden pass put at most a quarter of the tile under "
        "cloud, through the blind test's target filter, counted both ways. The masks are read for scoring only; "
        "no method is given any of them. A look taken without the masks has no second table and says so, and a "
        "look whose masks hold no share for a pass leaves that pass out of the second table."
    ),
    "players": (
        "The players of the round (backend/env) under the reward in use, on the same split: anything a player "
        "learns is fitted on the fitting episodes and chosen on the validation episodes, and the players are "
        "measured once on the test B episodes, after test B's look."
    ),
    "never": (
        "Nothing is fitted, chosen or switched because of a test A or test B result, and neither look is taken "
        "again. A result behind in a continent or a zone stays in the record as it is."
    ),
}


def protocol_sha256() -> str:
    """The digest of the protocol: its constants and its text."""
    doc = {
        "protocol_id": PROTOCOL_ID, "look_names": LOOK_NAMES, "first_regions": list(FIRST_REGIONS),
        "years": list(YEARS), "place_deg": PLACE_DEG, "tiles_per_side": TILES_PER_SIDE, "block_deg": BLOCK_DEG,
        "roles": list(ROLES), "role_shares": list(ROLE_SHARES), "continents": list(CONTINENTS), "zones": list(ZONES),
        "quota": QUOTA, "per_place": PER_PLACE, "left_out_types": list(LEFT_OUT_TYPES),
        "clear_share": CLEAR_SHARE, "frozen_values": FROZEN_VALUES, "protocol": PROTOCOL,
    }
    return hashlib.sha256(json.dumps(doc, sort_keys=True).encode("utf-8")).hexdigest()


# ----------------------------------------------------------------------------------------------------------------
# The values frozen for test A
# ----------------------------------------------------------------------------------------------------------------


def values_now(fitted_dir: Path = _FITTED_DIR) -> dict[str, str | None]:
    """The sha256 of each frozen file as it is now (None when it is missing)."""
    out: dict[str, str | None] = {}
    for name in FROZEN_VALUES:
        path = fitted_dir / name
        out[name] = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
    return out


def refuse_unfrozen(fitted_dir: Path = _FITTED_DIR) -> None:
    """Raise when a fitted file test A uses is not the one frozen in the protocol."""
    moved = sorted(name for name, sha in values_now(fitted_dir).items() if sha != FROZEN_VALUES[name])
    if moved:
        raise ValueError(f"the fitted values are not the ones the protocol froze: {moved}")


# ----------------------------------------------------------------------------------------------------------------
# Places, continents, zones and roles: from coordinates alone
# ----------------------------------------------------------------------------------------------------------------

Box = tuple[float, float, float, float]
_COLUMNS: int = int(round(360.0 / PLACE_DEG))
_ROWS: int = int(round(180.0 / PLACE_DEG))


def place_of(lon: float, lat: float) -> tuple[int, int]:
    """The (column, row) of the place holding a point, counted from 180 W and 90 S."""
    i = min(int(math.floor((float(lon) + 180.0) / PLACE_DEG)), _COLUMNS - 1)
    j = min(int(math.floor((float(lat) + 90.0) / PLACE_DEG)), _ROWS - 1)
    return i, j


def place_box(place: tuple[int, int]) -> Box:
    i, j = place
    w, s = -180.0 + i * PLACE_DEG, -90.0 + j * PLACE_DEG
    return (w, s, w + PLACE_DEG, s + PLACE_DEG)


def place_id(place: tuple[int, int]) -> str:
    w, s, _, _ = place_box(place)
    return f"p{w:+.1f}{s:+.1f}"


def continent_of(lon: float, lat: float) -> str:
    """A coarse continent from a point: a rule of lines of longitude and latitude, not a map of borders."""
    if lon < -30.0:
        return "North America" if (lat >= 13.0 or (lat >= 7.5 and lon < -77.0)) else "South America"
    if (lon >= 110.0 and lat < -10.0) or (lon >= 140.0 and lat < 0.0):
        return "Oceania"
    if lon < 60.0 and lat >= 36.0 and not (lon >= 26.0 and lat < 42.0):
        return "Europe"
    if lon < 52.0 and lat < 36.0 and not (lon >= 35.0 and lat >= 12.0):
        return "Africa"
    return "Asia"


def zone_of(lat: float) -> str:
    """A zone from latitude alone, standing in for fuel."""
    a = abs(float(lat))
    if a < 23.5:
        return "tropical"
    if a < 35.0:
        return "subtropical"
    if a < 50.0:
        return "temperate"
    return "boreal"


def block_of(place: tuple[int, int]) -> tuple[int, int]:
    per = int(round(BLOCK_DEG / PLACE_DEG))
    return place[0] // per, place[1] // per


def role_of_block(block: tuple[int, int]) -> str:
    """A block's role: the share of six its sha256 falls in. Nothing but the block's numbers is read."""
    h = hashlib.sha256(f"{PROTOCOL_ID}:{block[0]}:{block[1]}".encode("utf-8")).hexdigest()
    return ROLE_SHARES[int(h[:12], 16) % len(ROLE_SHARES)]


def _meets(a: Box, b: Box) -> bool:
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def near_first_regions(place: tuple[int, int], first_boxes: Iterable[Box]) -> bool:
    """Does the place meet the context box of one of the three first regions, edges touching included?"""
    box = place_box(place)
    return any(_meets(box, b) for b in first_boxes)


def why_left_out(place: tuple[int, int], first_boxes: Iterable[Box], offered_boxes: Iterable[Box] = ()) -> str | None:
    """Why a place has no role, or None when it keeps the role of its block. The three reasons, in the order they
    are asked: it meets the context box of one of the three first regions (every role); it is a place of
    validation, test A or test B next to a place of another role, corners included; or it is such a place and it
    meets the context box of a region the page offers. Fitting places are left out only for the first reason."""
    if near_first_regions(place, list(first_boxes)):
        return "meets a first region"
    role = role_of_block(block_of(place))
    if role == "fitting":
        return None
    i, j = place
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            if (di, dj) == (0, 0) or not 0 <= j + dj < _ROWS:
                continue
            if role_of_block(block_of(((i + di) % _COLUMNS, j + dj))) != role:
                return "next to a place of another role"
    box = place_box(place)
    if any(_meets(box, b) for b in offered_boxes):
        return "meets a region the page offers"
    return None


def role_of_place(place: tuple[int, int], first_boxes: Iterable[Box], offered_boxes: Iterable[Box] = ()) -> str | None:
    """The place's role, or None when it is left out (`why_left_out`)."""
    if why_left_out(place, first_boxes, offered_boxes) is not None:
        return None
    return role_of_block(block_of(place))


def describe_place(place: tuple[int, int], first_boxes: Iterable[Box], offered_boxes: Iterable[Box] = ()) -> dict[str, Any]:
    """A place's id, box, continent, zone, block and role (None when left out, with the reason)."""
    w, s, e, n = place_box(place)
    lon, lat = 0.5 * (w + e), 0.5 * (s + n)
    first_boxes, offered_boxes = list(first_boxes), list(offered_boxes)
    why = why_left_out(place, first_boxes, offered_boxes)
    return {"place_id": place_id(place), "box": [w, s, e, n], "continent": continent_of(lon, lat),
            "zone": zone_of(lat), "block": list(block_of(place)),
            "role": None if why is not None else role_of_block(block_of(place)), "left_out": why}


def offered_cost(first_boxes: Iterable[Box], offered_boxes: Iterable[Box]) -> dict[str, dict[str, dict[str, int]]]:
    """What leaving out the places that meet a region the page offers costs, by role, continent and zone: the
    places that keep their role without that rule and lose it with it. From coordinates alone."""
    first_boxes, offered_boxes = list(first_boxes), list(offered_boxes)
    cost: dict[str, dict[str, dict[str, int]]] = {}
    seen: set[tuple[int, int]] = set()
    for b in offered_boxes:
        i0, j0 = place_of(b[0], b[1])
        i1, j1 = place_of(b[2], b[3])
        for i in range(i0 - 1, i1 + 2):
            for j in range(max(j0 - 1, 0), min(j1 + 2, _ROWS)):
                place = (i % _COLUMNS, j)
                if place in seen:
                    continue
                seen.add(place)
                if why_left_out(place, first_boxes, offered_boxes) != "meets a region the page offers":
                    continue
                d = describe_place(place, first_boxes)
                role = role_of_block(block_of(place))
                by = cost.setdefault(role, {}).setdefault(d["continent"], {})
                by[d["zone"]] = by.get(d["zone"], 0) + 1
    return cost


# ----------------------------------------------------------------------------------------------------------------
# Choosing the episodes: from MODIS pixel counts, windows and places alone
# ----------------------------------------------------------------------------------------------------------------


def _key(ep: dict[str, Any]) -> tuple[Any, ...]:
    """The order of choice: the busiest first, then the earlier window, then the place further west and south."""
    return (-int(ep["modis_pixels_in_box"]), float(ep["start_s"]), float(ep["box"][0]), float(ep["box"][1]))


def per_place(found: list[dict[str, Any]], n: int = PER_PLACE) -> list[dict[str, Any]]:
    """Of a place's episodes, the busiest of each year, then the `n` busiest of those."""
    best: dict[int, dict[str, Any]] = {}
    for ep in sorted(found, key=_key):
        best.setdefault(int(ep["year"]), ep)
    return sorted(best.values(), key=_key)[:n]


def take_round_the_zones(candidates: list[dict[str, Any]], quota: int) -> list[dict[str, Any]]:
    """Up to `quota` episodes of one role and continent, round the zones in their order, the busiest left in a zone
    at each turn."""
    queues = {z: sorted((ep for ep in candidates if ep["zone"] == z), key=_key) for z in ZONES}
    out: list[dict[str, Any]] = []
    while len(out) < quota and any(queues.values()):
        for z in ZONES:
            if queues[z] and len(out) < quota:
                out.append(queues[z].pop(0))
    return out


def choose(found_by_place: dict[str, list[dict[str, Any]]], places: dict[str, dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """The episodes of each role. `found_by_place` holds every episode the rule found at a place, each a dict with
    `year`, `start_s`, `box` and `modis_pixels_in_box`; `places` holds each place as `describe_place` gives it."""
    pool: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for pid in sorted(found_by_place):
        info = places[pid]
        role = info.get("role")
        if role is None:
            continue
        for ep in per_place(found_by_place[pid]):
            pool.setdefault((role, info["continent"]), []).append(
                {**ep, "place_id": pid, "zone": info["zone"], "continent": info["continent"], "role": role})
    out: dict[str, list[dict[str, Any]]] = {r: [] for r in ROLES}
    for role in ROLES:
        for cont in CONTINENTS:
            out[role] += take_round_the_zones(pool.get((role, cont), []), QUOTA[role])
    return out


def plan_sha256(doc: dict[str, Any]) -> str:
    """The digest of a plan, as every later record names it."""
    return hashlib.sha256(json.dumps(doc, sort_keys=True).encode("utf-8")).hexdigest()
