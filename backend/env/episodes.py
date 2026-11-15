"""The episode catalogue of the next-look environment: every window of MODIS overpasses since 2012 with enough fire.

A region's context box is split into 25 tiles the size of its test box. In each tile and year the MODIS overpasses
with a detection in the tile are cut into consecutive, non-overlapping runs of `EPISODE_OVERPASSES` (no window is
picked by how it scores). A run is an episode when it passes the thresholds below.

An episode is chosen from MODIS rows alone: VIIRS, the instrument the environment hides, is dropped before the
overpasses are counted, so no episode exists, starts or ends because of a hidden row.

Split. `test`: the windows of the three 2021 test fires (the test box of each region inside its exclusion dates,
`backend/model/training.py`). `fit`: every other window, with the rows of the test fires removed first.

What may be played. The test of the three 2021 fires is closed: its looks are on record and no window of a test
fire's region in the year of its fire is scored again. That covers the test episodes, and it is read here to cover
the fit windows of that year as well, although they lie outside each fire's own box and dates (`may_be_played`).
The episodes that may be played are split by year: up to `TRAIN_LAST_YEAR` they train, after it they validate
(`fit_split`). The reference tables and every choice are made on the validation episodes.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from typing import Any, Callable

import numpy as np

from backend.eval.holdout import visible_rows
from backend.eval.rows import Detections, detections_from_rows
from backend.model.episodes import tiles
from backend.model.real_blind import EPISODE_OVERPASSES, Window, _chosen_from, _window_from, in_box_overpasses
from backend.model.training import EXCLUSIONS, REGIONS, closed_for, closed_years, excluded_mask, window_meets_years

YEARS: tuple[int, ...] = tuple(range(2012, 2026))     # Suomi NPP's VIIRS record starts in January 2012
TRAIN_LAST_YEAR: int = 2023                           # episodes up to this year train; later ones validate
PAD_S: float = 2.0 * 86400.0
# Thresholds for "enough detections to matter", both read from MODIS rows only.
MIN_MODIS_PIXELS: int = 60        # MODIS pixels in the tile over the run
MAX_SPAN_H: float = 120.0         # longer than five days is scattered hot spots, not one fire episode
TILING_RULE: str = (
    f"consecutive, non-overlapping runs of {EPISODE_OVERPASSES} MODIS overpasses with a detection in the tile, per tile and year"
)


@dataclass(frozen=True)
class EnvEpisode:
    region_id: str
    year: int
    tile: tuple[int, int]
    box: tuple[float, float, float, float]
    window: Window
    det: Detections
    split: str                      # "fit" or "test"

    @property
    def key(self) -> str:
        t = str(np.datetime64(int(self.window.start_s), "s"))[:13]
        return f"{self.region_id}:{self.tile[0]}{self.tile[1]}:{t}"

    def as_dict(self) -> dict[str, Any]:
        return {"key": self.key, "region_id": self.region_id, "year": self.year, "tile": list(self.tile),
                "split": self.split, "box": [round(v, 4) for v in self.box], **self.window.as_dict()}


def _year_bounds(year: int) -> tuple[float, float]:
    return (float(calendar.timegm((year, 1, 1, 0, 0, 0, 0, 0, 0))), float(calendar.timegm((year + 1, 1, 1, 0, 0, 0, 0, 0, 0))))


def _day_s(d: str) -> float:
    y, m, dd = (int(v) for v in d.split("-"))
    return float(calendar.timegm((y, m, dd, 0, 0, 0, 0, 0, 0)))


def tile_windows(det: Detections, box: tuple[float, float, float, float], t0: float, t1: float, hidden: str = "VIIRS") -> list[Window]:
    """Every consecutive, non-overlapping run of in-box overpasses of the visible rows that starts in [t0, t1).
    Rows of the hidden instrument are dropped first. No filtering."""
    items = [(o, k) for o, k in in_box_overpasses(visible_rows(det, hidden), box) if o.time_s >= t0]
    out: list[Window] = []
    i = 0
    while i + EPISODE_OVERPASSES <= len(items) and items[i][0].time_s < t1:
        out.append(_window_from(items, i, TILING_RULE, EPISODE_OVERPASSES, _chosen_from(hidden)))
        i += EPISODE_OVERPASSES
    return out


def qualifies(w: Window, min_modis_pixels: int = MIN_MODIS_PIXELS) -> bool:
    return w.modis_pixels_in_box >= min_modis_pixels and (w.end_s - w.start_s) / 3600.0 <= MAX_SPAN_H


def catalogue(
    read_firms: Callable[..., list[dict[str, str]]],
    region_box: Callable[[str], tuple[float, float, float, float]],
    preset_by_id: dict[str, Any],
    years: tuple[int, ...] = YEARS,
    regions: tuple[str, ...] = REGIONS,
    min_modis_pixels: int = MIN_MODIS_PIXELS,
    keep_all_windows: bool = False,
) -> list[EnvEpisode]:
    """Every episode of every region and year. `keep_all_windows` skips the thresholds (for `window_stats`)."""
    out: list[EnvEpisode] = []
    for region in regions:
        ctx = region_box(region)
        b = preset_by_id[region].bbox
        test_box = (b.west, b.south, b.east, b.north)
        ex_first, ex_after, _ = EXCLUSIONS[region]
        for year in years:
            rows = read_firms(ctx, f"{year}-01-01", f"{year + 1}-01-01")
            if not rows:
                continue
            full = detections_from_rows(rows, "NASA FIRMS standard processing archive, read through backend.firms")
            y0, y1 = _year_bounds(year)
            fit_rows = full.select(~excluded_mask(full, region, test_box))
            for tile, box in tiles(ctx):
                for w in tile_windows(fit_rows, box, y0, y1):
                    if keep_all_windows or qualifies(w, min_modis_pixels):
                        keep = (fit_rows.time_s >= w.start_s - PAD_S) & (fit_rows.time_s < w.end_s + PAD_S)
                        out.append(EnvEpisode(region, year, tile, box, w, fit_rows.select(keep), "fit"))
            # the test fire: the test box inside the exclusion dates, from the full rows
            e0, e1 = _day_s(ex_first), _day_s(ex_after)
            if e0 < y1 and e1 > y0:
                for w in tile_windows(full, test_box, max(e0, y0), min(e1, y1)):
                    if keep_all_windows or qualifies(w, min_modis_pixels):
                        keep = (full.time_s >= w.start_s - PAD_S) & (full.time_s < w.end_s + PAD_S)
                        out.append(EnvEpisode(region, year, (2, 2), test_box, w, full.select(keep), "test"))
    return out


# The closed rule itself is `closed_for(box, start_s, end_s)`, stated once in backend/model/training.py beside the
# set-aside dates it reads, and found here under the name the round and run routes look for.
__all__ = ["closed_for", "closed_years"]


def closed_year(region_id: str) -> int | None:
    """The year of a region's test fire, or None for a region that has none (the first, should its set-aside
    dates touch more than one: `closed_years` gives them all)."""
    years = closed_years(region_id)
    return years[0] if years else None


def may_be_played(ep: EnvEpisode) -> bool:
    """False for a test episode and for any window of a test fire's region in a year of its fire: an episode of
    such a year, and one of another year whose window runs into it."""
    years = closed_years(ep.region_id)
    if ep.split != "fit" or ep.year in years:
        return False
    return not window_meets_years(years, ep.window.start_s, ep.window.end_s)


def fit_split(episodes: list[EnvEpisode]) -> tuple[list[EnvEpisode], list[EnvEpisode]]:
    """(train, validation): the episodes that may be played, up to `TRAIN_LAST_YEAR` and after it."""
    open_ = [e for e in episodes if may_be_played(e)]
    return [e for e in open_ if e.year <= TRAIN_LAST_YEAR], [e for e in open_ if e.year > TRAIN_LAST_YEAR]


def _hidden_pixels(ep: EnvEpisode) -> int:
    d = ep.det
    return int((d.is_viirs & d.in_box(ep.box) & (d.time_s >= ep.window.start_s) & (d.time_s < ep.window.end_s)).sum())


def window_stats(all_windows: list[EnvEpisode]) -> dict[str, Any]:
    """The data behind the threshold: how many windows exist and how much fire they hold. The VIIRS figures are
    counted on fit windows only and are a description; no window is chosen with them."""
    usable = [e for e in all_windows if (e.window.end_s - e.window.start_s) / 3600.0 <= MAX_SPAN_H]
    m = np.array([e.window.modis_pixels_in_box for e in usable], dtype=np.float64)
    table = []
    for thr in (10, 20, 40, 60, 100, 200):
        sel = [e for e in usable if e.window.modis_pixels_in_box >= thr]
        v = np.array([_hidden_pixels(e) for e in sel if e.split == "fit"], dtype=np.float64)
        table.append({
            "min_modis_pixels": thr,
            "episodes": len(sel),
            "fit": int(sum(1 for e in sel if e.split == "fit")),
            "test": int(sum(1 for e in sel if e.split == "test")),
            "median_viirs_pixels_in_fit_episodes": float(np.median(v)) if v.size else None,
            "smallest_viirs_pixels_in_fit_episodes": float(v.min()) if v.size else None,
        })
    return {
        "tiling": TILING_RULE,
        "windows": len(all_windows),
        "of_those_one_episode_long": len(usable),
        "one_episode_long_means": f"at most {MAX_SPAN_H:.0f} h from first to last MODIS overpass",
        "modis_pixels_quantiles": {q: float(np.percentile(m, q)) for q in (10, 25, 50, 75, 90)} if m.size else {},
        "by_threshold": table,
        "threshold_chosen": MIN_MODIS_PIXELS,
        "why": (
            f"with {MIN_MODIS_PIXELS} MODIS pixels a window holds several hundred hidden VIIRS pixels (see "
            "median_viirs_pixels_in_fit_episodes), enough for a score on 375 m cells to move by more than a few "
            "cells' worth when one tile is revealed; below it most windows are a handful of pixels and the score is "
            "noise."
        ),
    }


def top_tile_share(episodes: list[EnvEpisode], splits: tuple[int, ...] = (2, 3, 4, 6, 8), min_pixels: int = 20) -> dict[str, Any]:
    """How much of a fire one tile holds: for every VIIRS overpass with at least `min_pixels` pixels in the box, the
    share of them in the busiest tile, for several tile splits. Median, and the share of overpasses where one tile
    holds everything. A description of hidden rows: give it fit episodes only."""
    from backend.eval.overpass import group_overpasses

    shares: dict[int, list[float]] = {n: [] for n in splits}
    for ep in episodes:
        w, s, e, nn = ep.box
        vi = ep.det.select(ep.det.is_viirs & ep.det.in_box(ep.box) & (ep.det.time_s >= ep.window.start_s) & (ep.det.time_s < ep.window.end_s))
        for op in group_overpasses(vi):
            if op.n < min_pixels:
                continue
            u = np.clip((vi.lon[op.index] - w) / (e - w), 0.0, 0.999999)
            v = np.clip((vi.lat[op.index] - s) / (nn - s), 0.0, 0.999999)
            for n in splits:
                t = (np.floor(v * n) * n + np.floor(u * n)).astype(np.int64)
                shares[n].append(float(np.bincount(t.astype(np.intp, copy=False), minlength=n * n).max()) / op.n)
    return {
        "overpasses": len(next(iter(shares.values()))) if shares else 0,
        "by_split": {
            f"{n}x{n}": {"median_share_in_busiest_tile": round(float(np.median(a)), 3),
                         "share_of_overpasses_where_one_tile_holds_all": round(float(np.mean(np.array(a) >= 0.999)), 3),
                         "share_of_overpasses_where_busiest_tile_holds_under_a_fifth": round(float(np.mean(np.array(a) < 0.2)), 3)}
            for n, a in shares.items() if a
        },
    }
