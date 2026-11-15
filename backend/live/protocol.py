"""The constants of the live test. Written into protocol.json before the first seal and never changed while it runs.

Every value a seal depends on is here: how fires are chosen, which passes are predicted and how, when a seal is made,
when a pass counts as observed and its rows as complete, and the digests of the fitted values in use.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
from typing import Any

from backend.terrain.live_region import DEFAULT_SPAN_LAT_DEG, DEFAULT_SPAN_LON_DEG

VERSION: int = 1
NAME: str = "live 1: VIIRS passes predicted from MODIS near real time rows and sealed before the pass"

# Fitted values in use. The sealer seals nothing while either file's digest differs from the one named here.
FITTED_DIR: Path = Path(__file__).resolve().parents[1] / "model" / "fitted_values"
FITTED_DIGESTS: dict[str, str] = {
    "occupancy_params.json": "b45e689835b4a9e175ed63877757ebe71226628d3466cb983c411fd837570eb9",
    "overlap_ratio.json": "881d5654e1fa8638271f5ff7bc87bd3c26699e538dd1c88a098f3b00c34c1811",
}

# Choosing fires. A cohort is chosen at the first run and every COHORT_EVERY_S after it, from one world MODIS reply.
COHORT_EVERY_S: float = 24 * 3600.0
CHOOSE_SOURCE: str = "MODIS_NRT"
CHOOSE_DAYS: int = 2                     # day range of the world request
CHOOSE_ROWS_WITHIN_S: float = 48 * 3600.0  # rows acquired this long before the choice are counted
BOX_SPAN_LON_DEG: float = DEFAULT_SPAN_LON_DEG
BOX_SPAN_LAT_DEG: float = DEFAULT_SPAN_LAT_DEG
MIN_ROWS: int = 30
MAX_CENTRE_LAT_N: float = 73.0
MAX_CENTRE_LAT_S: float = -63.0
ANTIMERIDIAN_MARGIN_DEG: float = 0.5
FIRES_PER_COHORT: int = 12
# Each candidate belongs to the part whose anchor (longitude, latitude) is nearest on the sphere.
WORLD_PARTS: dict[str, tuple[float, float]] = {
    "north_america": (-100.0, 45.0),
    "south_america": (-60.0, -15.0),
    "europe": (15.0, 50.0),
    "africa": (20.0, 0.0),
    "asia": (95.0, 30.0),
    "oceania": (135.0, -25.0),
}

# Passes. Only the sharp satellites flying (Suomi NPP ceased production on 2026-11-02 at 15:40 UTC).
PLATFORMS: tuple[str, ...] = ("VIIRS_NOAA20", "VIIRS_NOAA21")
# Standard collections whose passes 16 days earlier give the coming passes (the same ids as backend/firms/cmr_passes.py).
TEMPLATE_COLLECTIONS: dict[str, str] = {"VIIRS_NOAA20": "C2734197957-LPCLOUD", "VIIRS_NOAA21": "C2831626262-LPCLOUD"}
# LANCE near real time collections that list a pass once it is processed.
NRT_COLLECTIONS: dict[str, str] = {"VIIRS_NOAA20": "C1907902788-LANCEMODIS", "VIIRS_NOAA21": "C2837613056-LANCEMODIS"}
REPEAT_DAYS: tuple[int, ...] = (16, 32)  # the repeat cycle; 32 days when 16 days earlier lists nothing
PREDICT_AHEAD_S: float = 6 * 3600.0      # passes are predicted this far ahead of now

# Sealing.
CYCLE_S: float = 300.0
SEAL_OPENS_S: float = 30 * 60.0          # a slot is sealed from this long before its predicted span starts
SEAL_DEADLINE_S: float = 10 * 60.0       # and never later than this long before it
MODIS_SOURCE: str = "MODIS_NRT"
MODIS_DAYS: int = 3                      # day range of the per box request (the day of the seal and two before)
VISIBLE_WITHIN_S: float = 2 * 86400.0    # MODIS rows acquired this long before the seal are the visible rows
MODIS_REFETCH_S: float = 15 * 60.0       # a box's MODIS rows are asked for again only after this long

# Scoring.
CONFIRM_FROM_S: float = 2 * 3600.0       # CMR is asked for the real pass from this long after the predicted span ends
CONFIRM_TOLERANCE_S: float = 20 * 60.0   # a real pass is the predicted one when its time at the box is this close
CONFIRM_GIVE_UP_S: float = 12 * 3600.0   # no real pass by this long after the predicted one: not scored
CONFIRM_EVERY_S: float = 30 * 60.0
ROWS_AFTER_S: float = 4 * 3600.0         # rows are complete this long after the real span ends (FIRMS states 3 h)
ROWS_GIVE_UP_S: float = 36 * 3600.0
VIIRS_SOURCES: dict[str, str] = {"VIIRS_NOAA20": "VIIRS_NOAA20_NRT", "VIIRS_NOAA21": "VIIRS_NOAA21_NRT"}

# The key's limit is shared with other users of the same key: requests wait while the count is above this share.
THROTTLE_SHARE: float = 0.3
PAUSE_S: float = 1.0

METHODS: tuple[str, ...] = ("painted_modis", "overlap_ratio", "reconstruction")
NOTE_NRT: str = (
    "near real time rows (FIRMS NRT, with RT and URT rows in the United States and Canada), not the "
    "science-quality archive"
)


def fitted_digests(fitted_dir: Path = FITTED_DIR) -> dict[str, str]:
    return {name: hashlib.sha256((fitted_dir / name).read_bytes()).hexdigest() for name in FITTED_DIGESTS}


def fitted_unchanged(fitted_dir: Path = FITTED_DIR) -> bool:
    return fitted_digests(fitted_dir) == FITTED_DIGESTS


def code_commit() -> dict[str, Any]:
    """The commit of the code that seals, and whether its tracked files differ from it."""
    root = Path(__file__).resolve().parents[2]
    try:
        head = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
        dirty = subprocess.run(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=no"],
                               capture_output=True, text=True, check=True).stdout.strip() != ""
    except (OSError, subprocess.CalledProcessError):
        return {"commit": None, "tracked_files_changed": None}
    return {"commit": head, "tracked_files_changed": dirty}


def document() -> dict[str, Any]:
    """The protocol as written into protocol.json."""
    return {
        "version": VERSION,
        "name": NAME,
        "fitted_values": {"files": dict(FITTED_DIGESTS), "rule": "nothing is sealed while either digest differs"},
        "choose": {
            "every_s": COHORT_EVERY_S, "source": CHOOSE_SOURCE, "area": "world", "days": CHOOSE_DAYS,
            "rows_within_s": CHOOSE_ROWS_WITHIN_S, "box_span_deg": [BOX_SPAN_LON_DEG, BOX_SPAN_LAT_DEG],
            "lattice_anchor": [-180.0, -90.0], "min_rows": MIN_ROWS,
            "centre_lat_range": [MAX_CENTRE_LAT_S, MAX_CENTRE_LAT_N], "antimeridian_margin_deg": ANTIMERIDIAN_MARGIN_DEG,
            "fires_per_cohort": FIRES_PER_COHORT, "world_parts": {k: list(v) for k, v in WORLD_PARTS.items()},
            "rule": (
                "every row acquired in the window is counted in a lattice of boxes of the product's size; each lattice "
                "box with rows gives a candidate of the same size centred on the median longitude and median latitude "
                "of its rows, whose size is the number of rows inside it; candidates under min_rows, past the latitude "
                "range or near the antimeridian are dropped; each belongs to the world part with the nearest anchor; "
                "parts are ordered by their largest candidate and the largest of each part is taken in that order, "
                "then the second of each, skipping a box that meets a box already followed, until fires_per_cohort "
                "boxes are taken; no VIIRS row is read"
            ),
        },
        "passes": {
            "platforms": list(PLATFORMS), "template_collections": dict(TEMPLATE_COLLECTIONS),
            "nrt_collections": dict(NRT_COLLECTIONS), "repeat_days": list(REPEAT_DAYS), "ahead_s": PREDICT_AHEAD_S,
            "rule": (
                "the coming passes over a box are the passes of the standard collection one repeat cycle earlier, "
                "moved forward by the cycle; a pass is a slot only when its swath holds the whole box; the minute the "
                "scan crosses the box and the pixel size there are computed as backend/eval/schedule.py computes them"
            ),
        },
        "seal": {
            "cycle_s": CYCLE_S, "opens_s_before_span": SEAL_OPENS_S, "deadline_s_before_span": SEAL_DEADLINE_S,
            "modis_source": MODIS_SOURCE, "modis_days": MODIS_DAYS, "visible_within_s": VISIBLE_WITHIN_S,
            "modis_refetch_s": MODIS_REFETCH_S, "methods": list(METHODS),
            "record": "canonical JSON (sorted keys, no spaces, ASCII), SHA-256, chained to the line before",
        },
        "score": {
            "confirm_from_s": CONFIRM_FROM_S, "confirm_tolerance_s": CONFIRM_TOLERANCE_S,
            "confirm_give_up_s": CONFIRM_GIVE_UP_S, "rows_after_s": ROWS_AFTER_S, "rows_give_up_s": ROWS_GIVE_UP_S,
            "viirs_sources": dict(VIIRS_SOURCES),
            "scorer": "backend.eval.blind_test.blind_test_sealed, unchanged, with the sealed predictions read back",
            "judged": "verdict per fire (plain comparison); bootstrap_verdict over the fires (judged with an interval)",
        },
        "rows_note": NOTE_NRT,
    }


def canonical(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")


def digest(obj: Any) -> str:
    return hashlib.sha256(canonical(obj)).hexdigest()
