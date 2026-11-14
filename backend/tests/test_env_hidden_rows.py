"""An agent's observation must not move with hidden rows it has not been shown (unit M8), on SYNTHETIC rows.

These are the cases of the outside audit (JOB-H, part 4). One fixed sequence of actions is played twice: on the
rows as they are, and on rows in which hidden detections outside the revealed (look, tile) pairs were altered.
Every observation must be the same, `looks_left` included; the rewards must not be, or nothing was altered.

  4A  delete part of the unrevealed rows, leaving at least three in every overpass
  4B  change only the pixel sizes and the FRP of unrevealed rows
  4C  delete every row of one overpass no tile of which was looked at
  4D  move unrevealed rows about, keeping them out of the revealed tiles
  and every unrevealed row deleted at once

Only calls that existed before the fix are used, so the file can be run against the earlier code, where it fails.
"""

from __future__ import annotations

from dataclasses import fields, replace
from pathlib import Path
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.env.next_look import NO_LOOK, NextLookEnv, Observation  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.overpass import group_overpasses  # noqa: E402
from backend.eval.rows import Detections, detections_from_rows, read_csv_rows  # noqa: E402

# The looks taken, named by what the agent is told about a decision (platform, UTC day, day or night) so that the
# same sequence can be played whatever the decisions are numbered. In the first the tile holds the whole fire; in
# the other two it holds a minority of the pass's pixels (5 of 26 and 8 of 29), so a figure taken over the whole
# hidden pass is dominated by rows the agent was not shown.
LOOKS: dict[tuple[str, str, bool], int] = {
    ("VIIRS_NOAA20", "2099-07-01", False): 9,
    ("VIIRS_SNPP", "2099-07-03", False): 5,
    ("VIIRS_SNPP", "2099-07-03", True): 10,
}


def _action(obs: Observation) -> int:
    day = str(np.datetime64(int(obs.time_s), "s"))[:10]
    return LOOKS.get((obs.sensor, day, bool(obs.is_day)), NO_LOOK)


def _det() -> Detections:
    rows = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
    return detections_from_rows(rows, fx.SOURCE_LABEL)


WINDOW_OF = _det()
WINDOW: tuple[float, float] = (float(WINDOW_OF.time_s.min()), float(WINDOW_OF.time_s.max()) + 1.0)


def _play(det: Detections) -> tuple[NextLookEnv, list[Observation], list[float]]:
    env = NextLookEnv(det, fx.TEST_BOX, WINDOW, tiles=(4, 4), budget=3)
    ob = env.reset(seed=0)
    obs = [ob]
    rewards: list[float] = []
    done = False
    while not done:
        ob, reward, done, _ = env.step(_action(obs[-1]))
        rewards.append(float(reward))
        if ob is not None:
            obs.append(ob)
    return env, obs, rewards


def _differences(a: Observation, b: Observation) -> list[str]:
    out = []
    for f in fields(Observation):
        x, y = getattr(a, f.name), getattr(b, f.name)
        if isinstance(x, np.ndarray):
            if x.shape != y.shape or not np.array_equal(x, y):
                out.append(f.name)
        elif x != y:
            out.append(f.name)
    return out


class ObservationIgnoresUnrevealedRowsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.det = _det()
        cls.env, cls.obs, cls.rewards = _play(cls.det)
        d = cls.det
        # the rows the looks handed over, read back from what the agent was shown (lon, lat, time, platform code)
        shown = {(round(float(r[0]), 6), round(float(r[1]), 6), float(r[5]), int(r[6])) for r in cls.obs[-1].viirs_revealed}
        cls.revealed = np.array([
            (round(float(d.lon[i]), 6), round(float(d.lat[i]), 6), float(d.time_s[i]), int(d.platform_code[i])) in shown
            for i in range(len(d))
        ])
        cls.unrevealed = d.is_viirs & ~cls.revealed
        # every (decision, tile) the agent looked at, and the tile and decision of every hidden row
        g = cls.env.grid
        r, c = g.row_col(d.lon, d.lat)
        inside = (r >= 0) & (r < g.ny) & (c >= 0) & (c < g.nx)
        cls.tile = np.where(inside, cls.env.tile_of_cell[np.clip(r, 0, g.ny - 1), np.clip(c, 0, g.nx - 1)], -1)

    def _check(self, altered: Detections, name: str, rewards_must_differ: bool = True) -> None:
        env, obs, rewards = _play(altered)
        self.assertEqual(env.n_looks, self.env.n_looks, f"{name}: the number of looks changed")
        self.assertEqual(len(obs), len(self.obs), f"{name}: the number of observations changed")
        for i, (a, b) in enumerate(zip(self.obs, obs)):
            self.assertEqual(_differences(a, b), [], f"{name}: observation {i} changed")
        if rewards_must_differ:
            self.assertTrue(rewards != self.rewards or env.score_start != self.env.score_start,
                            f"{name}: neither the rewards nor the starting score moved, so nothing was altered")

    def test_the_looks_revealed_something(self) -> None:
        self.assertGreater(int(self.revealed.sum()), 0)
        self.assertGreater(int(self.unrevealed.sum()), 100)
        self.assertEqual(len(self.obs[-1].revealed_tiles), 3)

    def test_4a_deleting_part_of_the_unrevealed_rows(self) -> None:
        d = self.det
        keep = np.ones(len(d), dtype=bool)
        viirs_pos = np.flatnonzero(d.is_viirs)
        for op in group_overpasses(d.select(d.is_viirs)):
            free = [i for i in viirs_pos[op.index] if self.unrevealed[i]]
            for j, i in enumerate(free[3:]):
                if j % 3 != 0:
                    keep[i] = False
        self.assertGreater(int((~keep).sum()), 50)
        self._check(d.select(keep), "4A")

    def test_4b_changing_only_pixel_sizes_and_frp_of_unrevealed_rows(self) -> None:
        d, u = self.det, self.unrevealed
        altered = replace(d, scan_km=np.where(u, 0.80, d.scan_km), track_km=np.where(u, 1.60, d.track_km),
                          frp_mw=np.where(u, d.frp_mw * 4.0, d.frp_mw))
        self._check(altered, "4B")

    def test_4c_deleting_a_whole_overpass_that_was_never_looked_at(self) -> None:
        d = self.det
        viirs_pos = np.flatnonzero(d.is_viirs)
        passes = group_overpasses(d.select(d.is_viirs))
        untouched = [op for op in passes if not self.revealed[viirs_pos[op.index]].any() and op.n > 5]
        self.assertGreater(len(untouched), 3)
        for op in (untouched[0], untouched[len(untouched) // 2]):
            keep = np.ones(len(d), dtype=bool)
            keep[viirs_pos[op.index]] = False
            env, obs, _ = _play(d.select(keep))
            self.assertEqual(obs[0].looks_left, self.obs[0].looks_left, "4C: looks_left changed at reset")
            self._check(d.select(keep), "4C")

    def test_4d_moving_unrevealed_rows_about_outside_the_revealed_tiles(self) -> None:
        d = self.det
        rng = np.random.default_rng(7)
        lat = np.where(self.unrevealed, d.lat + rng.uniform(-0.02, 0.02, len(d)), d.lat)
        lon = np.where(self.unrevealed, d.lon + rng.uniform(-0.02, 0.02, len(d)), d.lon)
        g = self.env.grid
        r, c = g.row_col(lon, lat)
        inside = (r >= 0) & (r < g.ny) & (c >= 0) & (c < g.nx)
        new_tile = np.where(inside, self.env.tile_of_cell[np.clip(r, 0, g.ny - 1), np.clip(c, 0, g.nx - 1)], -1)
        # the look each hidden row belongs to: the look of its platform nearest in time
        looks = [(k, self.env._looks[k].platform, self.env.look_time(k)) for k in range(self.env.n_looks)]
        names = ("MODIS_TERRA", "MODIS_AQUA", "VIIRS_NOAA20", "VIIRS_NOAA21", "VIIRS_SNPP")
        look_of = np.full(len(d), -1)
        for i in np.flatnonzero(d.is_viirs):
            same = [(abs(t - float(d.time_s[i])), k) for k, p, t in looks if p == names[int(d.platform_code[i])]]
            look_of[i] = min(same)[1]
        # a row that would land in a tile the agent looked at on that row's own look stays where it was: it would
        # otherwise become a row the look hands over, which is a different experiment
        pairs = set(self.obs[-1].revealed_tiles)
        stays = np.array([(int(look_of[i]), int(new_tile[i])) in pairs or (int(look_of[i]), int(self.tile[i])) in pairs for i in range(len(d))])
        move = self.unrevealed & ~stays
        self.assertGreater(int(move.sum()), 100)
        altered = replace(d, lat=np.where(move, lat, d.lat), lon=np.where(move, lon, d.lon),
                          frp_mw=np.where(self.unrevealed, d.frp_mw * 11.0, d.frp_mw))
        self._check(altered, "4D")

    def test_every_unrevealed_row_deleted_at_once(self) -> None:
        d = self.det
        self._check(d.select(~self.unrevealed), "all unrevealed rows deleted")

    def test_looks_do_not_depend_on_the_hidden_rows_at_all(self) -> None:
        d = self.det
        bare = NextLookEnv(d.select(d.is_modis), fx.TEST_BOX, WINDOW, tiles=(4, 4), budget=3)
        self.assertEqual(bare.n_looks, self.env.n_looks)
        first = bare.reset(seed=0)
        self.assertEqual(_differences(first, self.obs[0]), [])
        self.assertEqual([bare.look_time(k) for k in range(bare.n_looks)], [self.env.look_time(k) for k in range(self.env.n_looks)])


if __name__ == "__main__":
    unittest.main()
