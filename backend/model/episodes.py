"""Fire episodes for fitting and validating: windows of MODIS overpasses away from the three test fires.

A region's context box is five times its test box on each side, so it splits into 25 tiles the size of the test
box. For every tile and year the episode is the run of `EPISODE_OVERPASSES` consecutive MODIS overpasses with a
detection in the tile that flagged the most pixels there (the rule the test windows use,
`real_blind.pick_window`), kept when they flagged at least `min_modis_pixels` and lie within `max_span_h`.

An episode is chosen from MODIS rows alone. VIIRS, the instrument a blind test hides, is dropped before the choice,
so no episode exists or is placed because of what the hidden instrument saw.

Rows inside a test fire's exclusion are removed before anything is looked at (`training.excluded_mask`), and that
includes the region's test box for the whole of the test year.

Training episodes come from `training.TRAINING_YEARS`, validation episodes from `training.VALIDATION_YEARS`:
different years, so no validation fire is a training fire.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from typing import Any, Callable

from backend.eval.rows import Detections, detections_from_rows
from backend.model.real_blind import EPISODE_OVERPASSES, Window, pick_window
from backend.model.training import REGIONS, excluded_mask

PAD_S: float = 2.0 * 86400.0


@dataclass(frozen=True)
class Episode:
    region_id: str
    year: int
    tile: tuple[int, int]                              # (column, row) of the tile in the 5 by 5 split, from the south-west
    box: tuple[float, float, float, float]             # the tile: west, south, east, north
    window: Window
    det: Detections                                    # rows of the context box from two days before to two days after

    @property
    def key(self) -> str:
        return f"{self.region_id}:{self.year}:{self.tile[0]}{self.tile[1]}"

    def as_dict(self) -> dict[str, Any]:
        return {"region_id": self.region_id, "year": self.year, "tile": list(self.tile),
                "box": [round(v, 4) for v in self.box], **self.window.as_dict()}


def tiles(context_box: tuple[float, float, float, float], n: int = 5) -> list[tuple[tuple[int, int], tuple[float, float, float, float]]]:
    w, s, e, nn = context_box
    dx, dy = (e - w) / n, (nn - s) / n
    return [((i, j), (w + i * dx, s + j * dy, w + (i + 1) * dx, s + (j + 1) * dy)) for j in range(n) for i in range(n)]


def find_episodes(
    years: tuple[int, ...],
    read_firms: Callable[..., list[dict[str, str]]],
    region_box: Callable[[str], tuple[float, float, float, float]],
    preset_by_id: dict[str, Any],
    regions: tuple[str, ...] = REGIONS,
    min_modis_pixels: int = 60,
    max_per_region_year: int = 3,
    max_span_h: float = 120.0,
    overpasses: int = EPISODE_OVERPASSES,
) -> list[Episode]:
    """Episodes in time order per region, at most `max_per_region_year` (the busiest tiles) for each region and year."""
    out: list[Episode] = []
    for region in regions:
        ctx = region_box(region)
        b = preset_by_id[region].bbox
        test_box = (b.west, b.south, b.east, b.north)
        for year in years:
            rows = read_firms(ctx, f"{year}-01-01", f"{year + 1}-01-01")
            if not rows:
                continue
            det = detections_from_rows(rows, "firms rows for fitting (test fires excluded)")
            det = det.select(~excluded_mask(det, region, test_box))
            t0 = float(calendar.timegm((year, 1, 1, 0, 0, 0, 0, 0, 0)))
            t1 = float(calendar.timegm((year + 1, 1, 1, 0, 0, 0, 0, 0, 0)))
            found: list[Episode] = []
            for tile, box in tiles(ctx):
                if int((det.in_box(box) & det.is_modis).sum()) < min_modis_pixels:
                    continue
                try:
                    win = pick_window(det, box, t0, t1, n=overpasses, hidden="VIIRS")
                except ValueError:
                    continue
                if win.modis_pixels_in_box < min_modis_pixels:
                    continue
                if (win.end_s - win.start_s) / 3600.0 > max_span_h:
                    continue   # overpasses spread over weeks are scattered hot spots, not one fire episode
                keep = (det.time_s >= win.start_s - PAD_S) & (det.time_s < win.end_s + PAD_S)
                found.append(Episode(region, year, tile, box, win, det.select(keep)))
            found.sort(key=lambda ep: -ep.window.modis_pixels_in_box)
            out.extend(found[:max_per_region_year])
    return out
