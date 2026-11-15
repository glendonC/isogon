"""The page's entry point when the backend runs in the visitor's browser (Python compiled to WebAssembly, with numpy
and Pillow), with no server, no HTTP and no store.

It calls the functions the server's routes call, unchanged. A held-out run is `load_region_terrain` with no
network, then `solve_real_reconstruction` and `real_response`, its first answer withheld by `withhold_scorer_keys`
as the route withholds it. The reveal is the same answer whole, from the run kept here.

What is not computed here is read from files made at build time. Nothing here fetches, starts a thread or reads a
key, and no module of the server is imported. Every import is made inside the function that needs it, so loading
this module costs nothing.

The hidden rows are in the visitor's files. They are kept from the estimate and from the first answer by the same
code path as on the server, the sealed box opened by the scorer alone, not by their absence. The leak check is the
backend's own tests.
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Any

# How the reveal is asked for here
REVEAL_HERE: str = "backend.browser.reveal(run_id), with the run_id of the first answer"
# Solved runs kept for their reveal and their pictures, the least recently asked dropped first
MAX_RUNS: int = 4
_RUNS: "OrderedDict[str, Any]" = OrderedDict()


def _keep(solved: Any) -> None:
    _RUNS[solved.run_id] = solved
    _RUNS.move_to_end(solved.run_id)
    while len(_RUNS) > MAX_RUNS:
        _RUNS.popitem(last=False)


def _solved(run_id: str) -> Any:
    try:
        solved = _RUNS[run_id]
    except KeyError:
        raise LookupError(f"no run {run_id} is kept here: ask held_out_run again") from None
    _RUNS.move_to_end(run_id)
    return solved


def held_out_run(region_id: str, start: str, estimate: str | None = "challenger", **solve: Any) -> dict[str, Any]:
    """The first answer of a held-out run of a place from a date, as `POST /api/reconstruct` gives it with
    `{"source": "firms", "region_id", "start", "holdout_viirs": true}`: the scorer's keys withheld until the reveal.

    - `estimate`: who answers the held-out passes, `"challenger"` (the second model, the default here) or `"in_use"`.
    - `solve`: passed on to `solve_real_reconstruction` (the page passes none).

    A window the closed rule closes is refused by the run itself (`ClosedWindow`), as on the server. The run's assets
    are not routes here: `pictures(run_id)` gives their bytes."""
    from backend.model.calendar_ratio import ratio_inputs_calendar, ratio_inputs_dir
    from backend.model.real_run import real_response, solve_real_reconstruction
    from backend.model.withhold import withhold_scorer_keys
    from backend.terrain.live_region import load_region_terrain, resolve_region_request

    # the calendar's ratio from the place's small file of its inputs, made at build time, where there is one: the
    # same ratio, without the place's yearly extracts
    if "firms_calendar" not in solve and (ratio_inputs_dir() / f"{region_id}.json").is_file():
        solve["firms_calendar"] = ratio_inputs_calendar()
    terrain = load_region_terrain(resolve_region_request(region_id=region_id), allow_network=False)
    solved = solve_real_reconstruction(terrain, str(start), holdout_viirs=True, estimate=estimate, **solve)
    _keep(solved)
    return withhold_scorer_keys(real_response(solved, {}), reveal_with=REVEAL_HERE)


def reveal(run_id: str) -> dict[str, Any]:
    """The whole answer of a held-out run asked for here, with what the scorer wrote: the route's answer with
    `"reveal": true`."""
    from backend.model.real_run import real_response

    return real_response(_solved(run_id), {})


def pictures(run_id: str) -> dict[str, bytes]:
    """The bytes the server serves as a run's assets: the 24 frames of the estimate (`reconstruction_u8.bin`), the
    belief between passes (`belief_u8.bin`), and the GeoJSON and CSV exports. Their layouts are in the answer's
    `encoding` and `belief_frames` blocks."""
    solved = _solved(run_id)
    return {"reconstruction_u8.bin": solved.reconstruction_u8_bytes, "belief_u8.bin": solved.belief_u8_bytes,
            "export.geojson": solved.export_geojson_bytes, "export.csv": solved.export_csv_bytes}
