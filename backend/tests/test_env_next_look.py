"""The next-look environment (backend/env), on SYNTHETIC episodes built from the test fixture.

Nothing here is a real fire. Real episodes are played by the reporting tools, never by a unit test.
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
    def test_reset_and_step_run_one_decision_per_viirs_overpass(self) -> None:
        env = _env()
        obs = env.reset(seed=1)
        self.assertEqual(env.n_looks, 13)
        self.assertEqual((obs.decision, obs.budget_left, obs.looks_left), (0, 3, 13))
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
        self.assertEqual(steps, 13)
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
        self.assertIn("cloud is unknown", KNOWN_LIMITS)
        self.assertEqual(d["viirs_platforms"], ["VIIRS_NOAA20", "VIIRS_SNPP"])


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
        self.assertEqual(len(out["actions"]), 13)

    def test_looking_where_the_fire_is_helps_and_the_oracle_is_the_ceiling_for_one_look(self) -> None:
        results = {}
        for agent in (RandomAgent(seed=3), LeastSureAgent(), LatestModisAgent(), OracleAgent()):
            results[agent.name] = run_episode(_env(budget=1), agent, seed=0)
        best_other = max(results[n]["return"] for n in ("random", "least_sure", "latest_modis"))
        self.assertGreaterEqual(results["oracle"]["return"], best_other - 1e-12)
        self.assertGreater(results["oracle"]["return"], 0.0)
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
        for n, b in ((13, 4), (13, 1), (7, 7), (5, 9), (12, 0)):
            self.assertEqual(sum(spend_now(i, n, b) for i in range(n)), min(n, b) if b <= n else n)


class NoLeakTests(unittest.TestCase):
    """The observation must not change when hidden detections outside the revealed tiles are altered."""

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


if __name__ == "__main__":
    unittest.main()
