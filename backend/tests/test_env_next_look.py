"""The next-look environment (backend/env), on SYNTHETIC episodes built from the test fixture.

Nothing in the classes on synthetic rows is a real fire. One class at the end reads a real episode of 2024 near
Lytton whose window opens just after a VIIRS pass and counts rows in it; it is skipped where the rows are not
cached. No test here builds an environment on a 2021 window of the three test fires.
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

from backend.env import KNOWN_LIMITS  # noqa: E402
from backend.env.agents import (  # noqa: E402
    LatestModisAgent,
    LeastSureAgent,
    OracleAgent,
    RandomAgent,
    run_episode,
    spend_now,
)
from backend.env.next_look import NO_LOOK, NextLookEnv, Observation  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.baselines import painted_modis_factory  # noqa: E402
from backend.eval.blind_test import run_blind_test  # noqa: E402
from backend.eval.rows import Detections, detections_from_rows, read_csv_rows  # noqa: E402
from backend.model.occupancy import GridState, OccupancyParams, PassPixels, update  # noqa: E402
from backend.model.real_blind import reconstruction_factory  # noqa: E402


def _synthetic_det() -> Detections:
    rows = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
    return detections_from_rows(rows, fx.SOURCE_LABEL)


def _env(det: Detections | None = None, budget: int = 3, **kw) -> NextLookEnv:
    det = det if det is not None else _synthetic_det()
    window = (float(det.time_s.min()), float(det.time_s.max()) + 1.0)
    return NextLookEnv(det, fx.TEST_BOX, window, tiles=(4, 4), budget=budget, **kw)


def _same(a: Observation, b: Observation) -> bool:
    for f in fields(Observation):
        x, y = getattr(a, f.name), getattr(b, f.name)
        if isinstance(x, np.ndarray):
            if x.shape != y.shape or not np.array_equal(x, y):
                return False
        elif x != y:
            return False
    return True


class InterfaceTests(unittest.TestCase):
    def test_reset_and_step_run_one_decision_per_scheduled_look(self) -> None:
        env = _env()
        obs = env.reset(seed=1)
        # Three VIIRS platforms are in the archive in 2099, two nominal looks a day each, over the fixture's three
        # days and a morning: 21 slots. The fixture holds 13 real overpasses of two of the platforms; the other
        # slots (every NOAA-21 slot among them) are looks that find nothing.
        self.assertEqual(env.n_looks, 21)
        self.assertEqual(env.describe()["looks"]["real_overpasses_scored"], 13)
        self.assertEqual((obs.decision, obs.budget_left, obs.looks_left), (0, 3, 21))
        self.assertEqual((obs.sensor, obs.is_day), ("VIIRS_SNPP", False))
        self.assertEqual(obs.p_burning.shape, env.grid.shape)
        self.assertEqual(obs.tile_covered.tolist(), [True] * 16)
        self.assertEqual(obs.viirs_revealed.shape, (0, 7))
        steps = 0
        done = False
        while not done:
            obs2, reward, done, info = env.step(NO_LOOK)
            self.assertEqual(reward, 0.0)
            self.assertFalse(info["spent"])
            steps += 1
        self.assertEqual(steps, 21)
        self.assertIsNone(obs2)
        with self.assertRaises(RuntimeError):
            env.step(NO_LOOK)

    def test_step_before_reset_and_bad_actions_are_errors(self) -> None:
        env = _env()
        with self.assertRaises(RuntimeError):
            env.step(0)
        env.reset()
        for bad in (16, -2, 1.5, "3"):
            with self.assertRaises(ValueError):
                env.step(bad)  # type: ignore[arg-type]

    def test_the_budget_is_enforced(self) -> None:
        env = _env(budget=2)
        env.reset()
        spent = 0
        done = False
        while not done:
            _, _, done, info = env.step(5)
            spent += int(info["spent"])
            if spent == 2 and not done:
                _, reward, done, info = env.step(5)
                self.assertFalse(info["spent"])
                self.assertTrue(info["no_budget_left"])
                self.assertEqual(reward, 0.0)
        self.assertEqual(spent, 2)

    def test_modis_is_shown_only_up_to_the_current_time(self) -> None:
        env = _env()
        obs = env.reset()
        self.assertTrue(np.all(obs.modis[:, 5] <= obs.time_s))
        n0 = obs.modis.shape[0]
        for _ in range(6):
            obs, _, _, _ = env.step(NO_LOOK)
        self.assertGreater(obs.modis.shape[0], n0)
        self.assertTrue(np.all(obs.modis[:, 5] <= obs.time_s))

    def test_description_states_the_known_limits(self) -> None:
        d = _env().describe()
        self.assertEqual(d["known_limits"], KNOWN_LIMITS)
        self.assertIn("looked and saw", KNOWN_LIMITS)
        self.assertIn("no cloud mask", KNOWN_LIMITS)
        self.assertIn("nominal half-day slots", KNOWN_LIMITS)
        self.assertEqual(d["looks"]["source"], "nominal")
        self.assertEqual(d["viirs_platforms"], ["VIIRS_NOAA20", "VIIRS_NOAA21", "VIIRS_SNPP"])


class RewardTests(unittest.TestCase):
    def test_the_starting_score_is_the_blind_test_score(self) -> None:
        det = _synthetic_det()
        env = _env(det)
        env.reset()
        window = (float(det.time_s.min()), float(det.time_s.max()) + 1.0)
        report = run_blind_test(det, fx.TEST_BOX, [painted_modis_factory, reconstruction_factory(OccupancyParams())], window=window)
        self.assertAlmostEqual(env.score_start, report["methods"]["reconstruction"]["strict_375m"]["csi"], places=12)

    def test_rewards_add_up_to_the_gain_in_score(self) -> None:
        env = _env(budget=3)
        out = run_episode(env, LatestModisAgent(), seed=0)
        self.assertAlmostEqual(out["return"], out["score_end"] - out["score_start"], places=12)
        self.assertEqual(sum(1 for a in out["actions"] if a != NO_LOOK), 3)
        self.assertEqual(len(out["actions"]), 21)

    def test_a_reward_is_the_change_of_the_score_on_the_whole_record(self) -> None:
        # The scoring set is every hidden detection of the episode, the looked-at tile included, before and after.
        env = _env(budget=1)
        env.reset()
        tile = int(np.argmax(env.hidden_pixels_per_tile()))
        looked = [(0, tile)]
        before = env.score_of([])["csi"]
        after = env.score_of(looked)["csi"]
        _, reward, _, info = env.step(tile)
        self.assertAlmostEqual(reward, after - before, places=12)
        self.assertAlmostEqual(info["score"], after, places=12)
        self.assertEqual(info["reward_target"], "all")
        # what the look taught about cells it did not show is reported apart and is the smaller part here: most of
        # the reward is the answer the look handed over
        apart = env.taught_elsewhere()
        self.assertAlmostEqual(apart["score_before_any_look"], env.score_of([], exclude=looked)["csi"], places=12)
        self.assertAlmostEqual(apart["score_now"], env.score_of(looked, exclude=looked)["csi"], places=12)
        self.assertAlmostEqual(apart["gain"], apart["score_now"] - apart["score_before_any_look"], places=12)
        self.assertGreater(reward, apart["gain"])
        with self.assertRaises(ValueError):
            _env(reward_target="everything")

    def test_nothing_was_taught_elsewhere_before_a_look_is_taken(self) -> None:
        env = _env(budget=2)
        with self.assertRaises(RuntimeError):
            env.taught_elsewhere()
        env.reset()
        apart = env.taught_elsewhere()
        self.assertEqual(apart["gain"], 0.0)
        self.assertEqual(apart["score_now"], env.score_start)

    def test_looking_where_the_fire_is_helps_and_the_oracle_is_the_ceiling_for_one_look(self) -> None:
        # one look, at the last look of the episode that has a pass behind it
        env = _env(budget=1)
        ob = env.reset(seed=0)
        k = max(i for i in range(env.n_looks) if len(env._look_rows[i]))
        while ob.decision != k:
            ob, _, _, _ = env.step(NO_LOOK)
        gains = [env.peek(t) for t in range(env.n_tiles)]
        self.assertGreater(max(gains), 0.0)
        self.assertAlmostEqual(gains[OracleAgent().choose(ob, env)], max(gains), places=12)
        for agent in (RandomAgent(seed=3), LeastSureAgent(), LatestModisAgent()):
            self.assertLessEqual(gains[agent.choose(ob, env)], max(gains) + 1e-12, agent.name)
        # an evenly spread budget of one is spent on the episode's last look, which here is a slot of the made-up
        # NOAA-21 with no row behind it: an unknown look, so nobody gains and nobody is misled
        results = {}
        for agent in (RandomAgent(seed=3), LeastSureAgent(), LatestModisAgent(), OracleAgent()):
            results[agent.name] = run_episode(_env(budget=1), agent, seed=0)
        self.assertEqual({r["return"] for r in results.values()}, {0.0})
        self.assertEqual(len({r["score_start"] for r in results.values()}), 1)

    def test_peek_does_not_change_the_episode(self) -> None:
        env = _env()
        env.reset()
        before = env.score_of([])
        gain = env.peek(5)
        self.assertEqual(env.score_of([]), before)
        _, reward, _, _ = env.step(5)
        self.assertAlmostEqual(reward, gain, places=12)

    def test_other_scores_can_be_the_reward(self) -> None:
        for name in ("csi_one_cell", "brier_skill"):
            env = _env(score=name)
            env.reset()
            self.assertEqual(env.score_start, env.score_of([])[name])
        with self.assertRaises(ValueError):
            _env(score="accuracy")

    def test_the_spending_schedule_spends_exactly_the_budget(self) -> None:
        for n, b in ((14, 4), (13, 1), (7, 7), (5, 9), (12, 0)):
            self.assertEqual(sum(spend_now(i, n, b) for i in range(n)), min(n, b) if b <= n else n)


class NoLeakTests(unittest.TestCase):
    """The observation must not change when hidden detections outside the revealed tiles are altered. The
    harder cases (pixel sizes, deleted rows, a deleted overpass) are in test_env_hidden_rows.py."""

    def _altered(self, det: Detections, env: NextLookEnv, keep: list[tuple[int, int]]) -> Detections:
        """Change FRP and position of every hidden VIIRS pixel except those in the (look, tile) pairs in `keep`."""
        protected = np.zeros(len(det), dtype=bool)
        viirs_pos = np.flatnonzero(det.is_viirs)
        for k, tile in keep:
            rows = env._look_rows[k][np.isin(env._pixel_tile[k], [tile])]
            protected[viirs_pos[rows]] = True
        change = det.is_viirs & ~protected
        rng = np.random.default_rng(7)
        return replace(
            det,
            frp_mw=np.where(change, det.frp_mw * 11.0, det.frp_mw),
            lat=np.where(change, det.lat + rng.uniform(-0.01, 0.01, len(det)), det.lat),
            lon=np.where(change, det.lon + rng.uniform(-0.01, 0.01, len(det)), det.lon),
        )

    def test_observations_ignore_unrevealed_hidden_detections(self) -> None:
        det = _synthetic_det()
        actions = [NO_LOOK, 5, NO_LOOK, NO_LOOK, 6, NO_LOOK, 9, NO_LOOK, NO_LOOK, NO_LOOK, NO_LOOK, NO_LOOK]
        a = _env(det, budget=3)
        obs_a = [a.reset()]
        for act in actions:
            obs_a.append(a.step(act)[0])
        keep = [(k, t) for k, t in enumerate(actions) if t != NO_LOOK]
        b = _env(self._altered(det, a, keep), budget=3)
        obs_b = [b.reset()]
        rewards_differ = False
        a2 = _env(det, budget=3)
        a2.reset()
        for act in actions:
            ob, rb, _, _ = b.step(act)
            _, ra, _, _ = a2.step(act)
            rewards_differ = rewards_differ or abs(ra - rb) > 1e-9
            obs_b.append(ob)
        for x, y in zip(obs_a, obs_b):
            self.assertTrue(_same(x, y))
        # the alteration is real: the hidden truth, and so the reward, did change
        self.assertTrue(rewards_differ or a2.score_start != b.score_start)

    def test_a_revealed_tile_shows_its_detections_and_nothing_else(self) -> None:
        env = _env()
        env.reset()
        counts = env.hidden_pixels_per_tile()
        tile = int(np.argmax(counts))
        obs, _, _, info = env.step(tile)
        self.assertEqual(info["revealed_pixels"], int(counts[tile]))
        self.assertEqual(obs.viirs_revealed.shape[0], int(counts[tile]))
        self.assertEqual(obs.revealed_tiles, ((0, tile),))
        r, c = env.grid.row_col(obs.viirs_revealed[:, 0], obs.viirs_revealed[:, 1])
        self.assertEqual(set(env.tile_of_cell[r, c].tolist()), {tile})

    def test_a_partial_look_says_nothing_about_cells_it_did_not_look_at(self) -> None:
        a = np.full((20, 20), 0.5)
        F = a * 60.0
        looked = np.zeros((20, 20), dtype=bool)
        looked[:10, :] = True
        obs = PassPixels(time_s=0.0, platform="VIIRS_SNPP", is_day=False, lst_hr=1.5, pixel_area_km2=0.14, cells=(),
                         frp_mw=(), min_side_km=(), n_context=0, looked=looked)
        out = update(GridState(a, F, np.zeros((20, 20))), obs, OccupancyParams())
        np.testing.assert_array_equal(out.a[10:, :], a[10:, :])
        np.testing.assert_array_equal(out.F[10:, :], F[10:, :])
        self.assertTrue(np.all(out.a[:10, :] < 0.2))



class LookOwnsItsPassTests(unittest.TestCase):
    """A look owns the rows of its own pass, and an empty look is not a clear one unless something says the pass
    covered the box."""

    def _late_window(self) -> tuple[Detections, tuple[float, float]]:
        # the window opens twelve minutes after Suomi NPP's first night pass (09:48 UTC on the first day)
        det = _synthetic_det()
        from backend.eval.rows import parse_acq_time_s

        return det, (parse_acq_time_s("2099-07-01", "1000"), float(det.time_s.max()) + 1.0)

    def test_a_look_just_before_the_window_hands_over_the_rows_of_its_pass(self) -> None:
        det, window = self._late_window()
        env = NextLookEnv(det, fx.TEST_BOX, window, tiles=(4, 4), budget=3)
        first = [k for k in range(env.n_looks) if env._looks[k].platform == "VIIRS_SNPP"][0]
        self.assertLess(env.look_time(first), window[0])                     # a slot laid out in the margin
        hidden = env._viirs
        own = env._look_rows[first]
        self.assertGreater(len(own), 0)                                      # not none, which would read as a "clear" look
        self.assertTrue(np.all(hidden.time_s[own] < window[0]))              # its pass lies before the window
        want = int((det.is_viirs & det.in_box(fx.TEST_BOX) & (det.time_s < window[0]) & (det.time_s > window[0] - 3600.0)
                    & (det.platform_code == hidden.platform_code[own[0]])).sum())
        self.assertEqual(len(own), want)
        # the score is taken over the hidden overpasses inside the window all the same
        scored = sum(len(t) for t in env._truth)
        inside = NextLookEnv(det, fx.TEST_BOX, window, tiles=(4, 4), budget=0)
        self.assertEqual(scored, sum(len(t) for t in inside._truth))
        self.assertEqual(len(env._truth[first]), 0)
        # looking there shows the pixels
        tile = int(np.bincount(env._pixel_tile[first], minlength=env.n_tiles).argmax())
        ob = env.reset(seed=0)
        while ob.decision != first:
            ob, _, _, _ = env.step(NO_LOOK)
        ob, _, _, info = env.step(tile)
        self.assertEqual(info["revealed_pixels"], int((env._pixel_tile[first] == tile).sum()))
        self.assertEqual(ob.viirs_revealed.shape[0], info["revealed_pixels"])
        self.assertIn("rows of its own pass", env.describe()["looks"]["a_look_owns"])

    def test_an_empty_look_on_the_nominal_schedule_is_unknown_and_teaches_nothing(self) -> None:
        env = _env()
        # the made-up NOAA-21 has slots (the archive's dates say it flies) and not one row
        empty = [k for k in range(env.n_looks) if env._looks[k].platform == "VIIRS_NOAA21"]
        self.assertGreater(len(empty), 0)
        k = empty[0]
        self.assertEqual(len(env._look_rows[k]), 0)
        self.assertEqual(env._revealed_passes([(k, 5)]), [])
        self.assertIn("unknown", env.describe()["looks"]["an_empty_look_means"])
        # played out: looking at a tile on that look moves neither the observation that follows nor the score
        a, b = _env(), _env()
        oa, ob = a.reset(seed=0), b.reset(seed=0)
        while oa.decision != k:
            oa, _, _, _ = a.step(NO_LOOK)
            ob, _, _, _ = b.step(NO_LOOK)
        oa, ra, _, _ = a.step(5)
        ob, rb, _, _ = b.step(NO_LOOK)
        self.assertEqual((ra, rb), (0.0, 0.0))
        self.assertTrue(np.array_equal(oa.p_burning, ob.p_burning))
        # with learning from looks on, an unknown look is not a count of zero
        c = _env(learn_from_looks=True)
        c.reset(seed=0)
        self.assertEqual(c.look_factors([(k, 5)]), c.look_factors([]))

    def test_an_empty_look_on_the_pass_list_is_unknown_too_and_is_still_scored(self) -> None:
        env = _env(schedule="cmr", read_passes=fx.fixture_pass_reader())
        k = [i for i in range(env.n_looks) if env._looks[i].platform == "VIIRS_NOAA21"][0]
        # the pass covered the tile and flagged nothing; cloud is not known, so the model is told nothing
        self.assertEqual(env._revealed_passes([(k, 5)]), [])
        said = env.describe()["looks"]["an_empty_look_means"]
        self.assertIn("covered the tile", said)
        self.assertIn("cloud is not known", said)
        # the pass is in the scoring set all the same: a look that flagged nothing, every declared cell a false alarm
        self.assertEqual(len(env._truth[k]), 1)
        self.assertEqual(int(env._truth[k][0].mask.sum()), 0)
        c = _env(schedule="cmr", read_passes=fx.fixture_pass_reader(), learn_from_looks=True)
        c.reset(seed=0)
        self.assertEqual(c.look_factors([(k, 5)]), c.look_factors([]))


class MarginSlotOnRealRowsTests(unittest.TestCase):
    """A slot in the margin before the window, on real rows of a 2024 fire near Lytton (an episode of the
    validation years; the 2021 test fires are not touched). The assertions count rows."""

    BOX = (-121.85, 50.42, -121.31, 50.80)

    def setUp(self) -> None:
        try:
            from backend.firms import read_firms, region_box

            rows = read_firms(region_box("lytton_bc"), "2024-07-15T11:36:00", "2024-07-21T22:30:00")
        except Exception as exc:                                   # no cache here
            self.skipTest(f"FIRMS rows for lytton_bc 2024 are not cached here ({type(exc).__name__})")
        if not rows:
            self.skipTest("FIRMS rows for lytton_bc 2024 are not cached here")
        from backend.eval.rows import parse_acq_time_s

        self.window = (parse_acq_time_s("2024-07-17", "1136"), parse_acq_time_s("2024-07-19", "2229") + 1.0)
        self.det = detections_from_rows(rows, "NASA FIRMS standard processing archive, read through backend.firms")

    def test_the_noaa21_look_before_the_window_owns_the_69_pixels_of_its_pass(self) -> None:
        env = NextLookEnv(self.det, self.BOX, self.window, tiles=(4, 4), budget=4, schedule="nominal")
        look = env._looks[2]
        self.assertEqual(look.platform, "VIIRS_NOAA21")
        self.assertLess(look.time_s, self.window[0])                         # the slot is in the margin, 77 minutes early
        self.assertEqual(len(env._look_rows[2]), 69)                         # the 10:17 pass, 79 minutes before the window
        self.assertEqual(int((env._pixel_tile[2] == 15).sum()), 69)
        self.assertTrue(np.all(env._viirs.time_s[env._look_rows[2]] < self.window[0]))
        ob = env.reset(seed=0)
        ob, _, _, _ = env.step(NO_LOOK)
        ob, _, _, _ = env.step(NO_LOOK)
        ob, _, _, info = env.step(15)
        self.assertEqual(info["revealed_pixels"], 69)
        self.assertEqual(ob.viirs_revealed.shape[0], 69)
        self.assertEqual(len(env._revealed_passes([(2, 15)])[0].cells), 69)  # the model is given fire, not a clear look


if __name__ == "__main__":
    unittest.main()
