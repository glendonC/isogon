"""NextLookEnv: reset() and step(action) over one real run, in plain Python with numpy.

Hidden rows. The environment is given rows of both instruments and parts them at once
(`backend.eval.holdout.seal`). Everything an agent is shown is built from the visible rows and from the rows of
the tiles it has looked at, and from nothing else:

  decisions     the looks are the scheduled slots of the hidden platforms (`backend.eval.schedule`: platform and
                calendar, no detection), so their number, times and platforms do not depend on a hidden row
  a look        reveals the hidden rows of that slot inside one tile; their own times and pixel sizes come with them
  the model     assimilates the visible passes and the revealed rows; the pixel size it assumes for the rest of a
                looked-at tile is the slot's own, never a figure taken over the whole hidden pass

A look owns the rows of its own pass. Nominal slots are laid out two hours beyond either end of the window, and
every row belongs to the slot of its platform nearest in time, in the window or not. If a look kept only the rows
inside the window, a look at a slot just before the window, whose real pass flagged hundreds of pixels minutes
earlier, would hand over nothing and the model would take that for a clear look. The score is taken over the
hidden overpasses inside the window.

The reward. The score is the blind-test score of the reconstruction on one fixed set: every real hidden detection
of the episode, on every cell of the box, at every scored look. It is the same set before the first look and after
the last, whatever was looked at. The reward of a look is the score after it minus the score before it, so the
rewards of a round add up to the score at the end minus the score at the start, and a round cannot be paid while
its score falls. A look is therefore paid for two things at once: the detections it hands over, which the
reconstruction now holds, and what they teach it about the rest. `taught_elsewhere` separates the second part
for reports; it is not the reward.

What an empty look means. A look that hands over no hidden pixel is unknown, on either schedule: it teaches the
model nothing and earns nothing. On the nominal schedule nothing says that the platform flew that half day or that
its swath held the box. On the pass list the pass did cover the tile, but FIRMS carries no cloud mask, so a tile
with no detection may have been cloudy. The two demands on the reward meet here: rewards that add up must pay
every change of the estimate, so a look that is to earn nothing must not change the estimate. What is given up is
a look spent to confirm that a tile is clear.

Two schedules. The default, `schedule="auto"`, takes the looks from NASA's pass list: one look per pass of a hidden
platform whose swath held the whole box, at its real time and pixel size, and a pass that flagged nothing is scored
like any other (protocol version 3). Where no pass list is cached for the window it falls back to the nominal
half-day slots of each hidden platform (protocol version 2) and says so in `describe()`. `schedule="cmr"` asks
for the pass list and fails without one; `schedule="nominal"` asks for the nominal slots.

The environment opens the sealed rows for two things only: to hand over the rows of a tile an agent looks at, and
to pay the reward. It is one of the two modules allowed to (`backend.eval.holdout.SCORERS`).
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.env import KNOWN_LIMITS_BY_SCHEDULE
from backend.eval import metrics as M
# The protocols a round plays under: version 3 with the looks from the pass list, version 2 on the nominal slots.
# PROTOCOL is the default's, where a pass list is cached; the one a given round plays under is `env.protocol`.
from backend.eval.blind_test import PROTOCOL_PASS_LIST as PROTOCOL  # noqa: F401
from backend.eval.blind_test import PROTOCOLS, SLOT_MARGIN_S
from backend.eval.grid import EvalGrid, Painted, footprint_cells, paint
from backend.eval.holdout import seal
from backend.eval.overpass import OVERPASS_GAP_S, group_overpasses
from backend.eval.rows import Detections, local_solar_time_hr
from backend.eval.schedule import (
    NOTES,
    SOURCE_AUTO,
    SOURCE_CMR,
    SOURCE_NOMINAL,
    PassReader,
    Slot,
    rows_of_slot,
    schedule_for,
)
from backend.model.occupancy import (
    OccupancyParams,
    OccupancyReconstruction,
    PassPixels,
    build_pass_pixels,
    expected_count_cells,
    look_count_factor,
    rescale_probability,
)
from backend.model.platforms import PLATFORM_CODES, PLATFORMS, scan_axis_deg
from backend.model.training import closed_for, closed_window_error

NO_LOOK: int = -1
SCORES: tuple[str, ...] = ("csi", "csi_one_cell", "brier_skill")
# What a reward is measured against: one fixed set, every hidden detection of the episode, looked at or not.
# An earlier target, "still_hidden", scored each look on the detections still hidden after it. Its scoring set
# shrank with every look, so its rewards did not add up to the change in score; it is refused.
REWARD_TARGETS: tuple[str, ...] = ("all",)
REWARD: str = (
    "the score after the look minus the score before it, on one fixed set: every real hidden detection of the "
    "episode. The rewards of a round add up to the score at the end minus the score at the start. A look that "
    "hands over no hidden pixel earns nothing."
)
# Why a round may not be built with learning from looks. `_teach` counts every look as one that saw its tile, an
# empty one included, so with it an empty look changes what a later look is paid: the two properties of the reward
# (rewards that add up, nothing for an empty look) do not both hold.
# How many looks' worth of what the model expects an environment keeps (`NextLookEnv._expected_at`). One is four
# fields on the 375 m grid, under half a megabyte for a region box.
REMEMBER_LOOKS: int = 128
# A set of looks' predictions is one field per scheduled look, so fewer of those are kept: one for every this many looks.
PREDICTED_SETS_PER_LOOKS: int = 8
LEARN_FROM_LOOKS_REFUSED: str = (
    "learning from looks is refused: it was tried under the first reward and not adopted, and under the reward in "
    "use a look that hands over nothing would not be inert with it (it would change what a later look is paid). "
    "It stays off until it is corrected and tried again under the reward in use"
)
AN_EMPTY_LOOK: dict[str, str] = {
    SOURCE_NOMINAL: (
        "unknown: nothing says the platform flew or that its swath held the box, so the model learns nothing from "
        "it and the look earns nothing"
    ),
    SOURCE_CMR: (
        "unknown: the pass covered the tile and flagged nothing there, but cloud is not known, so the model learns "
        "nothing from it and the look earns nothing"
    ),
}


@dataclass(frozen=True)
class Observation:
    """Everything the agent may know, and nothing more."""

    decision: int                           # index of the scheduled look about to be decided
    time_s: float                           # its time, UTC seconds: the pass's own from the pass list, else nominal
    sensor: str                             # its platform
    is_day: bool
    pixel_km: tuple[float, float]           # its pixel size along scan and along track, from the schedule
    budget_left: int
    looks_left: int                         # scheduled looks still to come, this one included
    look_times_s: NDArray[np.float64]       # (looks,) time of every scheduled look of the episode, from the schedule
    look_is_day: NDArray[np.bool_]          # (looks,) whether each of them is a day pass
    tiles_shape: tuple[int, int]            # (rows, columns) of the tile split; tile t is row t // columns, column t % columns
    tile_of_cell: NDArray[np.int64]         # (ny, nx) tile index of every 375 m cell
    tile_covered: NDArray[np.bool_]         # (tiles,) tiles this look covers (assumed from swath width: all)
    modis: NDArray[np.float64]              # (n, 7) visible detections so far: lon, lat, scan_km, track_km, frp_mw, time_s, platform code
    modis_tile: NDArray[np.int64]           # (n,) tile holding each of those detections' centres, -1 outside the box
    viirs_revealed: NDArray[np.float64]     # (m, 7) hidden detections revealed so far, same columns
    revealed_tiles: tuple[tuple[int, int], ...]   # (decision, tile) of every look taken so far
    p_burning: NDArray[np.float64]          # (ny, nx) the model's current probability that each cell burns
    p_detect: NDArray[np.float64]           # (ny, nx) its probability that the hidden instrument flags each cell at this look
    frp_mw: NDArray[np.float64]             # (ny, nx) its expected FRP per cell
    sigma_mw: NDArray[np.float64]           # (ny, nx) its standard deviation
    terrain_m: NDArray[np.float64] | None   # (ny, nx) elevation, when the caller supplied it


@dataclass(frozen=True)
class Look:
    """A scheduled look as the environment holds it. The slot is what an agent is told. `index` is the
    environment's own: positions, in the hidden rows, of every row that belongs to this look inside the window."""

    slot: Slot
    index: NDArray[np.int64]

    @property
    def platform(self) -> str:
        return self.slot.platform

    @property
    def time_s(self) -> float:
        return self.slot.time_s

    @property
    def is_day(self) -> bool:
        return self.slot.is_day

    @property
    def scan_km(self) -> float:
        return self.slot.scan_km

    @property
    def track_km(self) -> float:
        return self.slot.track_km


def _rows(det: Detections) -> NDArray[np.float64]:
    if len(det) == 0:
        return np.empty((0, 7))
    return np.column_stack([det.lon, det.lat, det.scan_km, det.track_km, det.frp_mw, det.time_s, det.platform_code.astype(np.float64)])


class NextLookEnv:
    """One real run. `det` holds rows of both instruments from the context box; the hidden one is sealed at once."""

    def __init__(
        self,
        det: Detections,
        box: tuple[float, float, float, float],
        window: tuple[float, float],
        tiles: tuple[int, int] = (4, 4),
        budget: int = 4,
        params: OccupancyParams | None = None,
        score: str = "csi",
        terrain_m: NDArray[np.float64] | None = None,
        reward_target: str = "all",
        learn_from_looks: bool = False,
        prior_cells: float = 40.0,
        hidden: str = "VIIRS",
        schedule: str = SOURCE_AUTO,
        read_passes: PassReader | None = None,
        remember: int = REMEMBER_LOOKS,
    ) -> None:
        if score not in SCORES:
            raise ValueError(f"score must be one of {SCORES}")
        if reward_target not in REWARD_TARGETS:
            raise ValueError(
                f"reward_target must be one of {REWARD_TARGETS}: the score is taken on one fixed set so that the "
                "rewards add up to the change in score"
            )
        self.reward_target = reward_target
        # When on, every look would also correct the model's count level in the tiles it did not look at (see
        # _teach). It is refused for now, so the code below it is not reached from a round.
        if learn_from_looks:
            raise ValueError(LEARN_FROM_LOOKS_REFUSED)
        self.learn_from_looks = False
        # The closed rule, asked before the rows are sealed or anything is scored: the environment opens its sealed
        # rows when it is built and scores from the first reset, so a caller that is not a route is stopped here.
        closed = closed_for(box, float(window[0]), float(window[1]))
        if closed is not None:
            raise closed_window_error(closed, "no round is played there")
        self.prior_cells = float(prior_cells)
        self._preds0: list[NDArray[np.float64]] | None = None
        if int(remember) < 0:
            raise ValueError("remember is the number of looks kept, 0 or more")
        # What the model expects at a look, kept under the look and the looks that handed over rows (`_expected_at`).
        self.remember = int(remember)
        self._expected: OrderedDict[tuple[int, tuple[tuple[int, int], ...]], tuple[NDArray[np.float64], ...]] = OrderedDict()
        # What a set of looks makes the model predict at every scheduled look, kept under the looks that handed
        # over rows (`_predictions`); and the score before any look, which is the same at every reset.
        self._predicted: OrderedDict[tuple[tuple[int, int], ...], list[NDArray[np.float64]]] = OrderedDict()
        self._detail0: dict[str, float] | None = None
        self._hands_over: dict[tuple[int, int], bool] = {}
        if budget < 0 or tiles[0] < 1 or tiles[1] < 1:
            raise ValueError("budget must be 0 or more and the tile split at least 1 by 1")
        self.grid = EvalGrid.from_bbox(box)
        self.box = box
        self.window = window
        self.tiles = (int(tiles[0]), int(tiles[1]))
        self.n_tiles = self.tiles[0] * self.tiles[1]
        self.budget = int(budget)
        self.params = params or OccupancyParams()
        self.score_name = score
        self.terrain_m = terrain_m
        self.hidden = hidden
        g = self.grid
        rr, cc = np.meshgrid(np.arange(g.ny), np.arange(g.nx), indexing="ij")
        self.tile_of_cell = (np.minimum(rr * self.tiles[0] // g.ny, self.tiles[0] - 1) * self.tiles[1]
                             + np.minimum(cc * self.tiles[1] // g.nx, self.tiles[1] - 1)).astype(np.int64)

        # The rows part ways here. `_modis` is every visible row; `_sealed` is opened only where marked below.
        self._modis, self._sealed = seal(det, hidden)
        del det
        self._modis_passes: list[PassPixels] = build_pass_pixels(g, self._modis, group_overpasses(self._modis))
        # nominal slots are laid out a margin beyond the window (a real pass lies up to 100 minutes from its slot);
        # the pass list gives the passes whose scan crossed the box inside the window
        self._slots: list[Slot]
        self._slots, self.schedule_source, self._schedule_info = schedule_for(
            hidden, None, window[0], window[1], box, source=schedule, read_passes=read_passes, nominal_margin_s=SLOT_MARGIN_S
        )
        from_list = self.schedule_source == SOURCE_CMR
        self.protocol: dict[str, Any] = PROTOCOLS[self.schedule_source]
        self.known_limits: str = KNOWN_LIMITS_BY_SCHEDULE[self.schedule_source]

        # ---- the sealed rows, for revealing a tile and for the reward; nothing above has read them --------------
        hid = self._sealed.open_for_scoring()
        self._viirs = hid
        slot_of_row = self._slot_of_rows(hid)
        # A look owns the rows of its own pass, in the window or not: the rows inside its granules' time span on the
        # pass list, the rows nearest its slot on the nominal schedule. The score keeps to the window.
        owned = slot_of_row >= 0
        in_time = owned if from_list else ((hid.time_s >= window[0]) & (hid.time_s < window[1]))
        inb = hid.in_box(box)
        self._looks: list[Look] = [Look(s, np.flatnonzero(owned & (slot_of_row == s.index))) for s in self._slots]
        self._truth: list[list[Painted]] = [[] for _ in self._looks]     # per look: one painting per real overpass
        if from_list:
            # every pass is scored, and one that left no hidden detection is a look that flagged nothing
            for k, look in enumerate(self._looks):
                self._truth[k].append(paint(g, hid.select(look.index[inb[look.index]])))
        else:
            for op in group_overpasses(hid.select(in_time)):
                rows = np.flatnonzero(in_time)[op.index]
                k = int(slot_of_row[rows[0]])
                if k >= 0:
                    self._truth[k].append(paint(g, hid.select(rows[inb[rows]])))
        self._look_rows: list[NDArray[np.int64]] = []   # per look: positions of its rows inside the box
        self._pixel_tile: list[NDArray[np.int64]] = []  # tile of each of those rows (by pixel centre)
        for k in range(len(self._looks)):
            own = np.flatnonzero(owned & inb & (slot_of_row == k))
            r, c = g.row_col(hid.lon[own], hid.lat[own])
            self._look_rows.append(own)
            self._pixel_tile.append(self.tile_of_cell[np.clip(r, 0, g.ny - 1), np.clip(c, 0, g.nx - 1)])
        self._k = 0
        self._budget_left = self.budget
        self._revealed: list[tuple[int, int]] = []
        self._score = 0.0
        self._started = False
        self.rng = np.random.default_rng(0)

    def _slot_of_rows(self, hid: Detections) -> NDArray[np.int64]:
        """For every hidden row the look it belongs to (-1 for none): with the pass list the pass whose granules
        hold its time, otherwise the slot of its platform nearest in time within six and a half hours. A row's
        look depends on its own platform and time only."""
        out = np.full(len(hid), -1, dtype=np.int64)
        if self.schedule_source == SOURCE_CMR:
            for s in self._slots:
                out[rows_of_slot(hid.time_s, hid.platform_code, s)] = s.index
            return out
        for name in sorted({s.platform for s in self._slots}):
            idx = np.array([s.index for s in self._slots if s.platform == name], dtype=np.int64)
            times = np.array([self._slots[i].time_s for i in idx])
            rows = np.flatnonzero(hid.platform_code == PLATFORM_CODES[name])
            if rows.size == 0:
                continue
            gap = np.abs(hid.time_s[rows][:, None] - times[None, :])
            j = np.argmin(gap, axis=1)
            ok = gap[np.arange(rows.size), j] <= 6.5 * 3600.0
            out[rows[ok]] = idx[j[ok]]
        return out

    # ---- the model, given what has been revealed -----------------------------------------------------------------

    def _revealed_rows(self, k: int, tiles: list[int]) -> NDArray[np.int64]:
        """Positions of the hidden rows of look `k` inside the given tiles: the rows that look handed over."""
        return self._look_rows[k][np.isin(self._pixel_tile[k], tiles)]

    def _revealed_passes(self, revealed: list[tuple[int, int]]) -> list[PassPixels]:
        """The looks taken, as passes the model can assimilate, built from the revealed rows alone.

        A slot can hold two real overpasses (consecutive orbits). The revealed rows are split where their times lie
        more than an overpass gap apart, and each part is a pass at the median time of its own rows. A tile that
        handed over no pixel is unknown on either schedule (the platform may not have flown, the swath may have
        missed the box, the tile may have been cloudy): it is not among the cells the pass is taken to have looked
        at, and a look made of such tiles only is not a pass at all. The pixel area used to judge what a pass
        could have missed is the slot's.
        """
        by_look: dict[int, list[int]] = {}
        for k, t in revealed:
            if self._revealed_rows(k, [t]).size:
                by_look.setdefault(k, []).append(t)
        g, hid = self.grid, self._viirs
        out: list[PassPixels] = []
        for k, tiles in by_look.items():
            slot = self._looks[k]
            looked = np.isin(self.tile_of_cell, tiles)
            area = float(slot.scan_km * slot.track_km)
            rows = self._revealed_rows(k, tiles)
            rows = rows[np.argsort(hid.time_s[rows], kind="stable")]
            for part in np.split(rows, np.flatnonzero(np.diff(hid.time_s[rows]) > OVERPASS_GAP_S) + 1):
                cells, frp, side, track = [], [], [], []
                for i in part:
                    axis = scan_axis_deg(PLATFORMS[int(hid.platform_code[i])], bool(hid.is_day[i]), float(hid.lat[i]))
                    rr, cc = footprint_cells(g, float(hid.lon[i]), float(hid.lat[i]), float(hid.scan_km[i]), float(hid.track_km[i]), axis)
                    if rr.size == 0:
                        continue
                    cells.append((rr, cc))
                    frp.append(float(hid.frp_mw[i]))
                    side.append(float(min(hid.scan_km[i], hid.track_km[i])))
                    track.append(float(hid.track_km[i]))
                t = float(np.median(hid.time_s[part]))
                out.append(PassPixels(
                    time_s=t, platform=slot.platform, is_day=slot.is_day,
                    lst_hr=float(local_solar_time_hr(t, float(np.mean(hid.lon[part])))),
                    pixel_area_km2=area, cells=tuple(cells), frp_mw=tuple(frp), min_side_km=tuple(side),
                    n_context=int(part.size), track_km=tuple(track), looked=looked,
                ))
        return out

    def _reconstruction(self, revealed: list[tuple[int, int]], upto_s: float | None = None) -> OccupancyReconstruction:
        """From the visible passes (those at or before `upto_s` when given) and every look taken so far."""
        modis = self._modis_passes if upto_s is None else [p for p in self._modis_passes if p.time_s <= upto_s]
        return OccupancyReconstruction(self.grid, None, self.params, passes=modis + self._revealed_passes(revealed))

    def _taught_by(self, revealed: list[tuple[int, int]]) -> tuple[tuple[int, int], ...]:
        """The looks among `revealed` that handed over at least one row, in order: all that the model is taught by.
        A look that handed over nothing teaches it nothing, so two sets of looks with the same answer here give
        the same reconstruction. Looks are taken in order of time, so this is one-to-one with what was taken."""
        out = []
        for kk, t in revealed:
            key = (int(kk), int(t))
            if key not in self._hands_over:
                self._hands_over[key] = bool(self._revealed_rows(kk, [t]).size > 0)
            if self._hands_over[key]:
                out.append(key)
        return tuple(sorted(out))

    def _predictions(self, revealed: list[tuple[int, int]]) -> list[NDArray[np.float64]]:
        """What the reconstruction built from all visible passes and the looks given expects the hidden instrument
        to flag at every scheduled look. Kept under the looks that taught the model (`_taught_by`), a few sets at
        a time: the same looks give the same predictions, in this round or a later one on this environment.
        Nothing that scores the arrays changes them."""
        key = self._taught_by(revealed)
        hit = self._predicted.get(key) if self.remember > 0 else None
        if hit is not None:
            self._predicted.move_to_end(key)
            preds = list(hit)
        else:
            recon = self._reconstruction(revealed)
            fam = self.hidden
            preds = [
                recon.predict_hidden(s.time_s, fam, s.is_day, float(s.scan_km * s.track_km), track_km=s.track_km,
                                     scan_km=s.scan_km if fam == "MODIS" else None)["p_detect"]
                for s in self._looks
            ]
            if self.remember > 0:
                self._predicted[key] = list(preds)
                while len(self._predicted) > max(self.remember // PREDICTED_SETS_PER_LOOKS, 1):
                    self._predicted.popitem(last=False)
        if not revealed:
            self._preds0 = preds
        return self._teach(preds, revealed) if (self.learn_from_looks and revealed) else preds

    def look_factors(self, revealed: list[tuple[int, int]]) -> dict[str, float]:
        """How far the visible-only model's count was off in the tiles looked at, by day and by night.

        For every look taken: the cells its revealed rows flag in the tile against the cells the visible-only
        model expected there. The pooled ratio (with `prior_cells` cells of prior evidence at a ratio of one) is
        the prior for the day ratio and for the night ratio. Only revealed rows are read.
        """
        if self._preds0 is None:
            self._preds0 = self._predictions([])
        t = {True: 0.0, False: 0.0}
        p = {True: 0.0, False: 0.0}
        for k, tile in revealed:
            inside = self.tile_of_cell == tile
            day = bool(self._looks[k].is_day)
            if self._revealed_rows(k, [tile]).size == 0:
                continue                                   # unknown, not a count of zero
            t[day] += float(paint(self.grid, self._viirs.select(self._revealed_rows(k, [tile]))).mask[inside].sum())
            p[day] += float(self._preds0[k][inside].sum())
        pooled = look_count_factor(t[True] + t[False], p[True] + p[False], self.prior_cells)
        return {
            "all": pooled,
            "day": look_count_factor(t[True], p[True], self.prior_cells, pooled),
            "night": look_count_factor(t[False], p[False], self.prior_cells, pooled),
        }

    def _teach(self, preds: list[NDArray[np.float64]], revealed: list[tuple[int, int]]) -> list[NDArray[np.float64]]:
        """Carry what the looks showed into the cells not looked at: rescale their probabilities by the look factor
        of their slot (day or night). Cells of a revealed tile keep what the look itself put there."""
        f = self.look_factors(revealed)
        seen: dict[int, list[int]] = {}
        for k, tile in revealed:
            seen.setdefault(k, []).append(tile)
        out = []
        for k, p in enumerate(preds):
            scaled = rescale_probability(p, f["day"] if self._looks[k].is_day else f["night"])
            out.append(np.where(np.isin(self.tile_of_cell, seen[k]), p, scaled) if k in seen else scaled)
        return out

    def _score_predictions(self, preds: list[NDArray[np.float64]], exclude: list[tuple[int, int]]) -> dict[str, float]:
        """The blind-test score of `preds`, leaving out the cells of the (look, tile) pairs in `exclude`. Every real
        overpass of the hidden instrument is scored against the prediction of the look it belongs to."""
        gone: dict[int, list[int]] = {}
        for k, t in exclude:
            gone.setdefault(k, []).append(t)
        counts = M.Counts(0, 0, 0, 0)
        tol = M.Counts(0, 0, 0, 0)
        brier = 0.0
        base = 0.0
        n = 0
        for k, (p, truths) in enumerate(zip(preds, self._truth)):
            if not truths:
                continue
            keep = ~np.isin(self.tile_of_cell, gone[k]) if k in gone else np.ones(self.grid.shape, dtype=bool)
            p_k = np.where(keep, p, 0.0)
            cells = expected_count_cells(p_k)
            n_keep = max(int(keep.sum()), 1)
            for truth in truths:
                t_k = truth.mask & keep
                counts = counts + M.contingency(cells, t_k)
                tol = tol + M.contingency_tolerant(cells, t_k, 1)
                brier += float(((np.clip(p_k, 0.0, 1.0) - t_k) ** 2)[keep].sum()) / n_keep
                base += float(t_k.sum()) / n_keep                # Brier score of predicting no fire anywhere
                n += 1
        n = max(n, 1)
        return {
            "csi": M.scores(counts)["csi"] or 0.0,
            "csi_one_cell": M.scores(tol)["csi"] or 0.0,
            "brier_skill": 1.0 - (brier / n) / max(base / n, 1e-12),
            "hit_rate": M.scores(counts)["hit_rate"] or 0.0,
            "false_alarm_ratio": M.scores(counts)["false_alarm_ratio"] or 0.0,
        }

    def score_of(self, revealed: list[tuple[int, int]], exclude: list[tuple[int, int]] | None = None) -> dict[str, float]:
        """The blind-test score of the reconstruction built from all visible passes and the looks in `revealed`,
        against the real hidden detections of the episode. With `exclude` the cells of those (look, tile) pairs
        are left out: a diagnostic, never the reward, which is taken on the whole set."""
        return self._score_predictions(self._predictions(revealed), exclude or [])

    def _gain(self, revealed_after: list[tuple[int, int]]) -> tuple[float, dict[str, float], list[NDArray[np.float64]]]:
        """Reward of moving from the current looks to `revealed_after`: the score after minus the score before,
        both on the fixed scoring set. A new look that hands over no hidden pixel leaves the reconstruction as it
        was, so its reward is exactly zero and nothing is computed for it."""
        k, tile = revealed_after[-1]
        if self._revealed_rows(k, [tile]).size == 0:
            return 0.0, self._detail, self._preds
        preds_after = self._predictions(revealed_after)
        after = self._score_predictions(preds_after, [])
        return after[self.score_name] - self._score, after, preds_after

    def taught_elsewhere(self) -> dict[str, float]:
        """What the looks taken so far taught the model about detections it was never shown: the score on the cells
        outside every (look, tile) looked at, before any look and now. Both figures are taken on that same set,
        which is known only once the looks are; a diagnostic for reports, not the reward."""
        if not self._started:
            raise RuntimeError("call reset() first")
        start = self._score_predictions(self._preds0 or self._predictions([]), self._revealed)[self.score_name]
        now = self._score_predictions(self._preds, self._revealed)[self.score_name]
        return {"score_before_any_look": float(start), "score_now": float(now), "gain": float(now - start),
                "score_name": self.score_name, "on": "the cells outside every tile looked at, at the look it was looked at"}

    # ---- the interface -------------------------------------------------------------------------------------------

    @property
    def n_looks(self) -> int:
        return len(self._looks)

    def look_time(self, k: int) -> float:
        """UTC seconds of look `k` (from the schedule, not from a detection)."""
        return float(self._looks[k].time_s)

    def reset(self, seed: int | None = None) -> Observation:
        self.rng = np.random.default_rng(seed)
        self._k = 0
        self._budget_left = self.budget
        self._revealed = []
        self._preds = self._predictions([])
        if self._detail0 is None or self.remember <= 0:        # the score before any look is the same every round
            self._detail0 = self._score_predictions(self._preds, [])
        self._detail = dict(self._detail0)
        self._score = self._detail[self.score_name]
        self.score_start = self._score
        self._started = True
        return self._observe()

    def _expected_at(self, k: int) -> tuple[NDArray[np.float64], ...]:
        """What the model expects at scheduled look `k` after the looks taken so far: the probability that a cell
        burns, the probability that the hidden instrument flags it at this look, its power and the spread of
        that power. Built from the visible passes up to the look and the rows of the tiles looked at; no
        hidden row outside a revealed tile is in it.

        It depends on the look and on the looks that handed over rows, and on nothing else: a look that handed
        over nothing teaches the model nothing. So it is kept under exactly those two, and a player whose round
        reaches the same look with the same rows in hand is given a copy without the work being done again.
        Every player of a round's reference result shares its early looks this way. `remember` is how many
        are kept, the least recently asked for going first; 0 keeps none."""
        key = (k, self._taught_by(self._revealed))
        hit = self._expected.get(key) if self.remember > 0 else None
        if hit is None:
            from backend.model.real_run import _sigma_mw

            slot = self._looks[k]
            recon = self._reconstruction(self._revealed, upto_s=slot.time_s)
            expects = recon.predict_hidden(slot.time_s, self.hidden, slot.is_day, float(slot.scan_km * slot.track_km),
                                           track_km=slot.track_km, scan_km=slot.scan_km if self.hidden == "MODIS" else None)
            est = expects["estimate"]
            hit = (est.a, np.clip(expects["p_detect"], 0.0, 1.0), est.F, _sigma_mw(est.a, est.F, est.rel_sd_log))
            if self.remember > 0:
                self._expected[key] = hit
                while len(self._expected) > self.remember:
                    self._expected.popitem(last=False)
        else:
            self._expected.move_to_end(key)
        # a copy each time: what a player does to the arrays it was handed reaches no other observation
        return tuple(np.array(x, copy=True) for x in hit)

    def _observe(self) -> Observation:
        k = min(self._k, self.n_looks - 1)
        slot = self._looks[k]
        p_burning, p_detect, frp_mw, sigma_mw = self._expected_at(k)

        seen_modis = self._modis.select(self._modis.time_s <= slot.time_s)
        r, c = self.grid.row_col(seen_modis.lon, seen_modis.lat)
        modis_tile = np.where(r >= 0, self.tile_of_cell[np.clip(r, 0, self.grid.ny - 1), np.clip(c, 0, self.grid.nx - 1)], -1)
        return Observation(
            decision=self._k,
            time_s=slot.time_s,
            sensor=slot.platform,
            is_day=slot.is_day,
            pixel_km=(float(slot.scan_km), float(slot.track_km)),
            budget_left=self._budget_left,
            looks_left=self.n_looks - self._k,
            look_times_s=np.array([lk.time_s for lk in self._looks], dtype=np.float64),
            look_is_day=np.array([lk.is_day for lk in self._looks], dtype=bool),
            tiles_shape=self.tiles,
            tile_of_cell=self.tile_of_cell,
            tile_covered=np.ones(self.n_tiles, dtype=bool),
            modis=_rows(seen_modis),
            modis_tile=np.asarray(modis_tile, dtype=np.int64).reshape(-1),
            viirs_revealed=self.revealed_rows(),
            revealed_tiles=tuple(self._revealed),
            p_burning=p_burning,
            p_detect=p_detect,
            frp_mw=frp_mw,
            sigma_mw=sigma_mw,
            terrain_m=self.terrain_m,
        )

    def revealed_rows(self) -> NDArray[np.float64]:
        """The hidden detections the looks taken so far have handed over, (m, 7), look by look in the order the
        looks were taken: what an observation shows as `viirs_revealed`. It can be asked for after the last look
        too, when there is no next observation to carry it."""
        rows = [self._revealed_rows(kk, [t]) for kk, t in self._revealed]
        shown = self._viirs.select(np.concatenate(rows)) if rows else self._viirs.select(np.zeros(len(self._viirs), dtype=bool))
        return _rows(shown)

    def _apply(self, action: int) -> tuple[list[tuple[int, int]], bool]:
        if not isinstance(action, (int, np.integer)) or not (NO_LOOK <= int(action) < self.n_tiles):
            raise ValueError(f"action must be {NO_LOOK} (no look) or a tile index below {self.n_tiles}")
        if int(action) == NO_LOOK or self._budget_left <= 0:
            return list(self._revealed), False
        return self._revealed + [(self._k, int(action))], True

    def peek(self, action: int) -> float:
        """The reward `action` would give now, without taking it (used only by the oracle)."""
        revealed, spent = self._apply(action)
        return self._gain(revealed)[0] if spent else 0.0

    def step(self, action: int) -> tuple[Observation | None, float, bool, dict[str, Any]]:
        if not self._started:
            raise RuntimeError("call reset() first")
        if self._k >= self.n_looks:
            raise RuntimeError("the episode is over; call reset()")
        revealed, spent = self._apply(action)
        wasted = int(action) != NO_LOOK and not spent
        reward = 0.0
        if spent:
            reward, self._detail, self._preds = self._gain(revealed)
            self._revealed = revealed
            self._budget_left -= 1
            self._score = self._detail[self.score_name]
        look = self._looks[self._k]
        info = {
            "decision": self._k,
            "sensor": look.platform,
            "spent": spent,
            "no_budget_left": wasted,
            "score": self._score,
            "score_name": self.score_name,
            "reward_target": self.reward_target,
            "look_factors": self.look_factors(self._revealed) if (self.learn_from_looks and self._revealed) else None,
            "score_detail": dict(self._detail),
            "revealed_pixels": int(np.isin(self._pixel_tile[self._k], [int(action)]).sum()) if spent else 0,
            "known_limits": self.known_limits,
        }
        self._k += 1
        done = self._k >= self.n_looks
        return (None if done else self._observe()), float(reward), done, info

    # ---- for the oracle and for reports only ---------------------------------------------------------------------

    def hidden_pixels_per_tile(self) -> NDArray[np.int64]:
        """Hidden pixels of the current look in each tile. Not part of the observation."""
        return np.bincount(self._pixel_tile[min(self._k, self.n_looks - 1)], minlength=self.n_tiles)

    def describe(self) -> dict[str, Any]:
        return {
            "box": [round(v, 6) for v in self.box],
            "grid": {"nx": self.grid.nx, "ny": self.grid.ny, "cell_km": self.grid.cell_km},
            "tiles": list(self.tiles),
            "budget": self.budget,
            "viirs_looks": self.n_looks,
            "looks": {"source": self.schedule_source, "note": NOTES[self.schedule_source],
                      "real_overpasses_scored": int(sum(len(t) for t in self._truth)),
                      "a_look_owns": "the rows of its own pass, in the window or not; the score is taken inside the window",
                      "an_empty_look_means": AN_EMPTY_LOOK[self.schedule_source],
                      **{k: v for k, v in self._schedule_info.items() if k != "platforms"}},
            "learn_from_looks": self.learn_from_looks,
            "remembers": {
                "looks": self.remember,
                "what": (
                    "what the model expects at a look is kept under the look and the looks that handed over rows, "
                    "so a round that reaches the same look with the same rows in hand is not worked out twice. It "
                    "changes nothing a player is shown and nothing it is paid"
                ),
            },
            "prior_cells": self.prior_cells if self.learn_from_looks else None,
            "viirs_platforms": sorted({p.platform for p in self._looks}),
            "modis_overpasses": len(self._modis_passes),
            "score": self.score_name,
            "reward": REWARD,
            "reward_target": self.reward_target,
            "protocol": {"version": self.protocol["version"], "name": self.protocol["name"]},
            "known_limits": self.known_limits,
            "platform_codes": {str(i): n for i, n in enumerate(PLATFORMS)},
        }
