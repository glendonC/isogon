"""The one place where hidden rows are separated from everything else.

The rule. With an instrument hidden, the code that chooses the window, builds the estimate, the declared
cells, the intervals, the belief frames, the exports and an agent's observation never receives a row of that
instrument. Only the scorer does. `seal` is where the rows part ways: it returns the visible rows and a `Sealed`
box. Everything that builds something takes the visible rows. The sealed box has one door, `open_for_scoring`,
and the only callers allowed through it are listed in `SCORERS`; a test reads the source tree and fails when any
other module calls it.

What a hidden overpass may contribute before scoring is nothing. The times at which predictions are published come
from `backend.eval.schedule` (the platform and the calendar, no detection). `Sealed.pass_times` exists for one
diagnostic that measures what knowing the real pass times would be worth; it hands out a time and a platform per
hidden overpass and nothing else, and no default path calls it.
"""

from __future__ import annotations

from typing import Iterable

import numpy as np

from backend.eval.rows import Detections

FAMILIES: tuple[str, ...] = ("VIIRS", "MODIS")

# The modules that may open a sealed box: the blind-test scorer, and the next-look environment, which reveals
# a tile's rows when an agent looks at it and pays the reward.
SCORERS: tuple[str, ...] = ("backend/eval/blind_test.py", "backend/env/next_look.py")
# The functions of the blind test through which a caller outside the scorers may hand the sealed box on. A module
# that builds a run holds the box and cannot read it; it may only pass it to one of these. A test reads the source
# and fails when the box goes anywhere else, or when a function not named here opens it.
SCORER_ENTRY_POINTS: tuple[str, ...] = ("blind_test_sealed", "reveal", "hidden_pixels_in_spans")
# Python cannot lock an attribute: `Sealed._det` can be read by code that means to. The rule is kept by the test
# that scans every Python file under backend/ for `open_for_scoring`, `pass_times` and `._det`.


class Sealed:
    """Rows of the hidden instrument. Not iterable, not sized, nothing readable but what is hidden and how."""

    __slots__ = ("_det", "family", "platforms", "source")

    def __init__(self, det: Detections, family: str | None, platforms: tuple[str, ...] | None) -> None:
        self._det = det
        self.family = family            # "VIIRS" or "MODIS" when a whole instrument is hidden
        self.platforms = platforms      # the named platforms when only some are hidden
        self.source = det.source

    def __repr__(self) -> str:
        what = self.family if self.platforms is None else ", ".join(self.platforms)
        return f"Sealed(hidden: {what})"

    def open_for_scoring(self) -> Detections:
        """The hidden rows. Call this only from a module named in `SCORERS`, after every prediction is fixed."""
        return self._det

    def pass_times(self) -> list[tuple[str, float]]:
        """(platform, UTC seconds) of every hidden overpass, earliest row of each: a diagnostic, never a default.

        This is information taken from the hidden rows, so anything built with it is not blind to them.
        """
        from backend.eval.overpass import group_overpasses

        return [(op.platform, float(self._det.time_s[op.index].min())) for op in group_overpasses(self._det)]


def hidden_mask(det: Detections, hidden: str | None = "VIIRS", hidden_platforms: Iterable[str] | None = None) -> np.ndarray:
    """True for the rows that are hidden: a whole instrument family, or the named platforms only."""
    if hidden_platforms is not None:
        from backend.model.platforms import PLATFORM_CODES

        return np.isin(det.platform_code, [PLATFORM_CODES[name] for name in hidden_platforms])
    if hidden is None:
        return np.zeros(len(det), dtype=bool)
    if hidden not in FAMILIES:
        raise ValueError("hidden must be 'VIIRS', 'MODIS' or None")
    return det.is_viirs if hidden == "VIIRS" else det.is_modis


def seal(
    det: Detections, hidden: str | None = "VIIRS", hidden_platforms: Iterable[str] | None = None
) -> tuple[Detections, Sealed]:
    """(visible rows, sealed hidden rows). `hidden=None` hides nothing: every row is visible and the box is empty."""
    platforms = None if hidden_platforms is None else tuple(hidden_platforms)
    mask = hidden_mask(det, hidden, platforms)
    return det.select(~mask), Sealed(det.select(mask), None if platforms is not None else hidden, platforms)


def visible_rows(det: Detections, hidden: str | None = "VIIRS", hidden_platforms: Iterable[str] | None = None) -> Detections:
    """The rows a builder may read. Use this when the hidden rows are not needed at all (choosing a window)."""
    return det.select(~hidden_mask(det, hidden, hidden_platforms))
