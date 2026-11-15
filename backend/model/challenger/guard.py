"""Safety checks for challenger methods and fitting runners.

Every challenger checks on construction that no hidden sharp-satellite row is
present in the visible detections it receives. Every fitting or scoring run
checks the closed-window rule and the split test-place rule before touching
an episode.
"""

from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Any, Iterable

from backend.eval.holdout import hidden_mask
from backend.eval.rows import Detections
from backend.model.training import closed_for, closed_window_error, refuse_closed_years

REPO_ROOT: Path = Path(__file__).resolve().parents[3]
PLACE_DEG: float = 2.5
PLACE_COLS: int = int(round(360.0 / PLACE_DEG))
PLACE_ROWS: int = int(round(180.0 / PLACE_DEG))


def refuse_hidden_rows(visible: Detections, hidden: str = "VIIRS") -> None:
    """Raise ValueError when any row of the hidden instrument is in visible."""
    n_hidden = int(hidden_mask(visible, hidden).sum())
    if n_hidden > 0:
        raise ValueError(
            f"challenger method received {n_hidden} {hidden} rows in visible input; "
            f"{hidden} rows must be sealed before building a method"
        )


def refuse_closed_episode(box: tuple[float, float, float, float], start_s: float, end_s: float) -> None:
    """Raise ClosedWindow when the box and time window touch a closed test fire."""
    closed = closed_for(box, start_s, end_s)
    if closed is not None:
        raise closed_window_error(closed, "no challenger fits on, validates on or scores a closed window")


def refuse_closed_split_years(years: Iterable[int]) -> None:
    """Raise ValueError when any year in years is a closed test-fire year in the initial regions."""
    refuse_closed_years(years)


def place_of_coords(lon: float, lat: float) -> tuple[int, int]:
    """Return (col, row) index of the 2.5 degree place holding (lon, lat)."""
    i = min(int(math.floor((float(lon) + 180.0) / PLACE_DEG)), PLACE_COLS - 1)
    j = min(int(math.floor((float(lat) + 90.0) / PLACE_DEG)), PLACE_ROWS - 1)
    return max(0, i), max(0, j)


def places_of_coords(lon: float, lat: float) -> list[tuple[int, int]]:
    """Return the 2.5 degree place(s) holding (lon, lat), including shared edges."""
    x, y = (float(lon) + 180.0) / PLACE_DEG, (float(lat) + 90.0) / PLACE_DEG
    i0, j0 = place_of_coords(lon, lat)
    cols = [i0] + ([i0 - 1] if x == math.floor(x) and 0 < i0 and x < PLACE_COLS else [])
    rows = [j0] + ([j0 - 1] if y == math.floor(y) and 0 < j0 and y < PLACE_ROWS else [])
    return [(i, j) for i in cols for j in rows]


def place_id_of_index(place: tuple[int, int]) -> str:
    """Format a 2.5 degree place index (col, row) as p+W.W+S.S."""
    w = -180.0 + place[0] * PLACE_DEG
    s = -90.0 + place[1] * PLACE_DEG
    return f"p{w:+.1f}{s:+.1f}"


def place_index_of_id(pid: str) -> tuple[int, int]:
    """Parse a place id such as p-122.5+40.0 into (col, row)."""
    body = pid[1:]
    k = max(body.rfind("+"), body.rfind("-"))
    w, s = float(body[:k]), float(body[k:])
    return int(round((w + 180.0) / PLACE_DEG)), int(round((s + 90.0) / PLACE_DEG))


def refuse_forbidden_place(place_id: str, forbidden_places: set[str] | frozenset[str]) -> None:
    """Raise ValueError if place_id belongs to test_a or test_b."""
    if place_id in forbidden_places:
        raise ValueError(
            f"place {place_id} is a sealed test place in SPLIT.md and must never be read by a challenger"
        )


def sha256_file(path: Path) -> str:
    """Return hex sha256 digest of a file read in chunks."""
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(1 << 20)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def relative_digest_entry(path: Path, root: Path = REPO_ROOT, prefix: str = "") -> dict[str, Any]:
    """Return relative path, byte size, and sha256 without local machine paths."""
    rel = path.resolve().relative_to(root.resolve()).as_posix()
    if prefix:
        rel = f"{prefix.rstrip('/')}/{rel}"
    return {
        "path": rel,
        "bytes": int(path.stat().st_size),
        "sha256": sha256_file(path),
    }
