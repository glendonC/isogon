"""The reward of the next-look environment, on SYNTHETIC episodes built from the test fixture.

Two properties, on both schedules:

  the rewards add up     the sum of a round's rewards equals the score at the end minus the score at the start, on
                         one fixed scoring set (every hidden detection of the episode), whoever plays and however
                         the looks are spent
  an empty reveal        a look that hands over no hidden pixel earns nothing, teaches the model nothing and leaves
                         nothing to be paid later

and the reference players that read nothing from the observation (a constant tile, the centre tiles in turn), which
show how much of a gain is geometry.
"""

from __future__ import annotations

from pathlib import Path
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.env import agents as A  # noqa: E402
from backend.env.next_look import NO_LOOK, NextLookEnv  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.rows import Detections, detections_from_rows, read_csv_rows  # noqa: E402

SCHEDULES = ("nominal", "cmr")


def _det() -> Detections:
    rows = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
    return detections_from_rows(rows, fx.SOURCE_LABEL)


DET = _det()
WINDOW: tuple[float, float] = (float(DET.time_s.min()), float(DET.time_s.max()) + 1.0)


def _env(schedule: str, budget: int = 4, **kw) -> NextLookEnv:
    reader = fx.fixture_pass_reader() if schedule == "cmr" else None
    return NextLookEnv(DET, fx.TEST_BOX, WINDOW, tiles=(4, 4), budget=budget, schedule=schedule, read_passes=reader, **kw)


def _play(env: NextLookEnv, choose, seed: int = 0) -> dict:
    """Play a round with `choose(obs, env) -> action` at every look; every reward and every reported score."""
    obs = env.reset(seed)
    start = env.score_start
    rewards, scores, pixels, actions = [], [start], [], []
    done = env.n_looks == 0
    while not done:
        act = int(choose(obs, env))
        obs, reward, done, info = env.step(act)
        actions.append(act)
        rewards.append(reward)
        scores.append(info["score"])
        pixels.append(info["revealed_pixels"] if info["spent"] else None)
    return {"start": start, "rewards": rewards, "scores": scores, "pixels": pixels, "actions": actions}


def _greedy_for_fire(obs, env) -> int:
    """Spends at once, each time on the tile the model expects to burn most."""
    if obs.budget_left <= 0:
        return NO_LOOK
    n = obs.tiles_shape[0] * obs.tiles_shape[1]
    return int(np.argmax(np.bincount(obs.tile_of_cell.ravel(), weights=obs.p_burning.ravel(), minlength=n)))


def _first_and_last(obs, env) -> int:
    """Spends on the first two and the last two looks, on the tile with the most MODIS pixels so far."""
    if obs.budget_left <= 0 or obs.decision not in (0, 1, env.n_looks - 2, env.n_looks - 1):
        return NO_LOOK
    n = obs.tiles_shape[0] * obs.tiles_shape[1]
    tile = obs.modis_tile[obs.modis_tile >= 0]
    return int(np.argmax(np.bincount(tile, minlength=n))) if tile.size else 5


class RewardsAddUpTests(unittest.TestCase):
    def test_the_rewards_of_a_round_add_up_to_the_change_in_score(self) -> None:
        players = {
            "greedy for fire": _greedy_for_fire,
            "first and last looks": _first_and_last,
            "a corner": lambda obs, env: 15 if obs.budget_left > 0 else NO_LOOK,
            "never": lambda obs, env: NO_LOOK,
        }
        for schedule in SCHEDULES:
            for budget in (1, 4, 8):
                for name, choose in players.items():
                    with self.subTest(schedule=schedule, budget=budget, player=name):
                        env = _env(schedule, budget)
                        r = _play(env, choose)
                        self.assertAlmostEqual(sum(r["rewards"]), r["scores"][-1] - r["start"], places=12)
                        # look by look as well: a reward is the score after the look minus the score before it
                        for reward, before, after in zip(r["rewards"], r["scores"], r["scores"][1:]):
                            self.assertAlmostEqual(reward, after - before, places=12)

    def test_the_score_is_taken_on_one_fixed_set_whatever_was_looked_at(self) -> None:
        for schedule in SCHEDULES:
            with self.subTest(schedule=schedule):
                env = _env(schedule, 4)
                r = _play(env, _greedy_for_fire)
                taken = [(k, a) for k, a in enumerate(r["actions"]) if a != NO_LOOK]
                self.assertEqual(len(taken), 4)
                # the score reported at the end is the blind-test score, on every hidden detection of the episode,
                # of the reconstruction given the looks taken: computed again from nothing
                again = _env(schedule, 4)
                again.reset()
                self.assertAlmostEqual(r["scores"][-1], again.score_of(taken)["csi"], places=12)
                self.assertAlmostEqual(r["start"], again.score_of([])["csi"], places=12)
                d = env.describe()
                self.assertEqual(d["reward_target"], "all")
                self.assertIn("add up", d["reward"])

    def test_every_score_that_can_be_the_reward_adds_up(self) -> None:
        for name in ("csi", "csi_one_cell", "brier_skill"):
            for schedule in SCHEDULES:
                with self.subTest(score=name, schedule=schedule):
                    r = _play(_env(schedule, 3, score=name), _greedy_for_fire)
                    self.assertAlmostEqual(sum(r["rewards"]), r["scores"][-1] - r["start"], places=12)

    def test_the_reference_players_report_a_return_equal_to_the_change_in_score(self) -> None:
        for schedule in SCHEDULES:
            env = _env(schedule, 4)
            for agent in (A.RandomAgent(seed=2), A.LeastSureAgent(), A.LatestModisAgent(), A.ExpectedNewAgent(),
                          A.ConstantTileAgent(6), A.CentreTileAgent(), A.OracleAgent()):
                with self.subTest(schedule=schedule, agent=agent.name):
                    out = A.run_episode(env, agent, seed=0)
                    self.assertAlmostEqual(out["return"], out["score_end"] - out["score_start"], places=12)
                    self.assertEqual(len(out["revealed_pixels"]), sum(1 for a in out["actions"] if a != NO_LOOK))

    def test_the_reward_that_did_not_add_up_is_gone(self) -> None:
        with self.assertRaises(ValueError):
            _env("nominal", reward_target="still_hidden")


class EmptyRevealTests(unittest.TestCase):
    """A look that hands over no hidden pixel: on a pass with no row at all, and on a pass whose fire lies in
    other tiles."""

    def _empty_looks(self, env: NextLookEnv) -> list[tuple[int, int, str]]:
        out: list[tuple[int, int, str]] = []
        for k in range(env.n_looks):
            per_tile = np.bincount(env._pixel_tile[k], minlength=env.n_tiles)
            if per_tile.sum() == 0:
                out.append((k, 5, "a pass with no hidden row"))
            elif (per_tile == 0).any():
                out.append((k, int(np.flatnonzero(per_tile == 0)[0]), "fire in other tiles only"))
        return out

    def test_an_empty_reveal_earns_nothing_and_changes_nothing(self) -> None:
        for schedule in SCHEDULES:
            probe = _env(schedule, 2)
            cases = self._empty_looks(probe)
            kinds = {kind for _, _, kind in cases}
            self.assertEqual(kinds, {"a pass with no hidden row", "fire in other tiles only"}, schedule)
            for kind in sorted(kinds):
                k, tile, _ = [c for c in cases if c[2] == kind][len([c for c in cases if c[2] == kind]) // 2]
                with self.subTest(schedule=schedule, kind=kind, look=k, tile=tile):
                    looked, passed = _env(schedule, 2), _env(schedule, 2)
                    oa, ob = looked.reset(seed=0), passed.reset(seed=0)
                    while oa.decision != k:
                        oa, _, _, _ = looked.step(NO_LOOK)
                        ob, _, _, _ = passed.step(NO_LOOK)
                    oa, reward, done, info = looked.step(tile)
                    ob, _, _, info_b = passed.step(NO_LOOK)
                    self.assertTrue(info["spent"])
                    self.assertEqual(info["revealed_pixels"], 0)
                    self.assertEqual(reward, 0.0)                              # exactly nothing
                    self.assertEqual(info["score"], info_b["score"])
                    self.assertEqual(info["score_detail"], info_b["score_detail"])
                    self.assertEqual(looked._revealed_passes([(k, tile)]), [])  # the model is told nothing
                    if not done:
                        # the look is on the record and cost one of the budget; the estimate did not move
                        self.assertEqual(oa.revealed_tiles, ((k, tile),))
                        self.assertEqual(oa.budget_left, ob.budget_left - 1)
                        self.assertTrue(np.array_equal(oa.p_burning, ob.p_burning))
                        self.assertTrue(np.array_equal(oa.frp_mw, ob.frp_mw))
                        self.assertEqual(oa.viirs_revealed.shape[0], 0)
                        # and nothing is owed for it later: the same next look pays the same in both rounds
                        nxt = [(j, t) for j, t, kind2 in cases if j > k and kind2 == "fire in other tiles only"]
                        j = nxt[0][0] if nxt else None
                        if j is not None:
                            busiest = int(np.bincount(looked._pixel_tile[j], minlength=looked.n_tiles).argmax())
                            while oa.decision != j:
                                oa, _, _, _ = looked.step(NO_LOOK)
                                ob, _, _, _ = passed.step(NO_LOOK)
                            _, ra, _, ia = looked.step(busiest)
                            _, rb, _, ib = passed.step(busiest)
                            self.assertGreater(ia["revealed_pixels"], 0)
                            self.assertEqual(ra, rb)
                            self.assertEqual(ia["score"], ib["score"])

    def test_a_round_of_empty_reveals_returns_exactly_nothing(self) -> None:
        for schedule in SCHEDULES:
            env = _env(schedule, 4)
            empty = {k: tile for k, tile, _ in self._empty_looks(env)}
            self.assertGreaterEqual(len(empty), 4)
            r = _play(env, lambda obs, e: empty.get(obs.decision, NO_LOOK) if obs.budget_left > 0 else NO_LOOK)
            spent = [p for p in r["pixels"] if p is not None]
            self.assertEqual(spent, [0, 0, 0, 0], schedule)
            self.assertEqual(r["rewards"], [0.0] * len(r["rewards"]), schedule)
            self.assertEqual(r["scores"][-1], r["start"], schedule)

    def test_learning_from_looks_is_refused_with_the_reason(self) -> None:
        """With that option an empty look was counted as a look that saw the tile, so it changed what a later
        look was paid. It was tried under the first reward and not adopted; it is refused until it is corrected."""
        for schedule in ("nominal", "cmr"):
            with self.assertRaises(ValueError) as caught:
                _env(schedule, learn_from_looks=True)
            self.assertIn("a look that hands over nothing would not be inert", str(caught.exception))
            self.assertIn("first reward", str(caught.exception))
            env = _env(schedule, learn_from_looks=False)
            self.assertIs(env.describe()["learn_from_looks"], False)
            self.assertIsNone(env.describe()["prior_cells"])

    def test_the_description_says_what_an_empty_look_means_on_either_schedule(self) -> None:
        for schedule in SCHEDULES:
            looks = _env(schedule).describe()["looks"]
            self.assertEqual(looks["source"], schedule)
            self.assertIn("unknown", looks["an_empty_look_means"])
            self.assertIn("earns nothing", looks["an_empty_look_means"])

    def test_a_look_that_reveals_fire_still_teaches_the_model(self) -> None:
        for schedule in SCHEDULES:
            env = _env(schedule, 1)
            obs = env.reset()
            k = next(i for i in range(env.n_looks) if len(env._look_rows[i]))
            while obs.decision != k:
                obs, _, _, _ = env.step(NO_LOOK)
            tile = int(np.bincount(env._pixel_tile[k], minlength=env.n_tiles).argmax())
            _, reward, _, info = env.step(tile)
            self.assertGreater(info["revealed_pixels"], 0)
            self.assertNotEqual(reward, 0.0, schedule)
            self.assertEqual(len(env._revealed_passes([(k, tile)])), 1)


class GeometryPlayersTests(unittest.TestCase):
    def test_a_constant_tile_player_always_looks_at_its_tile(self) -> None:
        env = _env("nominal", 4)
        out = A.run_episode(env, A.ConstantTileAgent(6), seed=0)
        self.assertEqual({a for a in out["actions"] if a != NO_LOOK}, {6})
        self.assertEqual(A.ConstantTileAgent(6).name, "constant_6")
        with self.assertRaises(ValueError):
            A.run_episode(env, A.ConstantTileAgent(16), seed=0)

    def test_the_centre_player_takes_the_centre_tiles_in_turn(self) -> None:
        self.assertEqual(A.centre_tiles((4, 4)), [5, 6, 9, 10])
        self.assertEqual(A.centre_tiles((3, 3)), [4])
        self.assertEqual(A.centre_tiles((6, 6)), [14, 15, 20, 21])
        self.assertEqual(A.centre_tiles((3, 4)), [5, 6])
        out = A.run_episode(_env("nominal", 4), A.CentreTileAgent(), seed=0)
        self.assertEqual([a for a in out["actions"] if a != NO_LOOK], [5, 6, 9, 10])

    def test_players_but_the_oracle_decide_from_the_observation_alone(self) -> None:
        env = _env("nominal", 4)
        obs = env.reset()
        for _ in range(6):
            obs, _, _, _ = env.step(NO_LOOK)
        for agent in (A.RandomAgent(seed=1), A.LeastSureAgent(), A.LatestModisAgent(), A.ExpectedNewAgent(),
                      A.ConstantTileAgent(3), A.CentreTileAgent()):
            with self.subTest(agent=agent.name):
                tile = agent.choose(obs, None)                       # no environment to ask
                self.assertTrue(0 <= tile < 16)
        self.assertFalse(A.reads_hidden_rows(A.LeastSureAgent()))
        self.assertTrue(A.reads_hidden_rows(A.OracleAgent()))
        # the observation says in which tile each MODIS detection lies and when every look is scheduled
        self.assertEqual(obs.modis_tile.shape, (obs.modis.shape[0],))
        r, c = env.grid.row_col(obs.modis[:, 0], obs.modis[:, 1])
        inside = r >= 0
        np.testing.assert_array_equal(obs.modis_tile[inside], env.tile_of_cell[r[inside], c[inside]])
        self.assertTrue(np.all(obs.modis_tile[~inside] == -1))
        self.assertEqual(obs.look_times_s.tolist(), [env.look_time(k) for k in range(env.n_looks)])

    def test_tile_scores_are_given_by_the_players_that_rank_tiles(self) -> None:
        env = _env("nominal", 4)
        obs = env.reset()
        for agent in (A.LeastSureAgent(), A.LatestModisAgent(), A.ExpectedNewAgent()):
            s = A.tile_scores(agent, obs, env)
            self.assertEqual(s.shape, (16,))
            self.assertEqual(int(np.argmax(s)), agent.choose(obs, env))
        for agent in (A.RandomAgent(seed=1), A.ConstantTileAgent(3), A.CentreTileAgent()):
            self.assertIsNone(A.tile_scores(agent, obs, env))

    def test_every_reference_player_on_one_round_as_plain_numbers(self) -> None:
        import json

        env = _env("nominal", 4)
        ref = A.play_reference(env, random_seeds=2)
        json.dumps(ref)                                              # plain numbers and lists only
        self.assertEqual(ref["random"]["seeds"], [0, 1])
        self.assertEqual(ref["constant"]["tiles"], list(range(16)))
        self.assertEqual(len(ref["constant"]["gains"]), 16)
        self.assertEqual(ref["centre"]["tiles"], [5, 6, 9, 10])
        self.assertIsNone(ref["learned"])
        for name in ("centre", "latest_modis", "least_sure", "expected_new", "oracle"):
            self.assertAlmostEqual(ref[name]["gain"], ref[name]["final"] - ref["score_start"], places=12, msg=name)
        for gain, final in zip(ref["constant"]["gains"], ref["constant"]["finals"]):
            self.assertAlmostEqual(gain, final - ref["score_start"], places=12)
        self.assertEqual((ref["reads_nothing"], ref["reads_hidden_rows"]), (["random", "constant", "centre"], ["oracle"]))

    def test_the_reference_players_are_named_once(self) -> None:
        names = [a.name for a in A.reference_agents((4, 4), random_seeds=2)]
        self.assertEqual(names[:2], ["random", "random"])
        self.assertEqual(names[2:18], [f"constant_{t}" for t in range(16)])
        self.assertEqual(names[18:], ["centre", "latest_modis", "least_sure", "expected_new", "oracle"])

    def test_the_most_expected_new_detections_is_the_model_s_own_prediction_used_as_a_rule(self) -> None:
        from backend.model.occupancy import expected_count_cells

        env = _env("cmr", 4)
        obs = env.reset()
        for _ in range(7):
            obs, _, _, _ = env.step(NO_LOOK)
        agent = A.ExpectedNewAgent()
        # the observation holds what the model expects the hidden instrument to flag at this look
        self.assertEqual(obs.p_detect.shape, env.grid.shape)
        self.assertTrue(np.all((obs.p_detect >= 0.0) & (obs.p_detect <= 1.0)))
        self.assertGreater(float(obs.p_detect.sum()), 1.0)
        self.assertEqual(obs.pixel_km, (env._looks[obs.decision].scan_km, env._looks[obs.decision].track_km))
        # its map declares the most probable cells; a tile's score is the expected detections outside them
        declared = expected_count_cells(obs.p_detect)
        self.assertEqual(int(declared.sum()), int(round(float(obs.p_detect.sum()))))
        want = [float(obs.p_detect[(env.tile_of_cell == t) & ~declared].sum()) for t in range(16)]
        np.testing.assert_allclose(agent.scores(obs), want, rtol=0, atol=1e-12)
        self.assertEqual(agent.choose(obs, None), int(np.argmax(want)))
        self.assertGreater(max(want), 0.0)
        # after a look that showed fire the model holds that tile's detections for the passes around it, so the
        # tile's score for the next look of the same half day falls
        k = next(i for i in range(obs.decision, env.n_looks) if len(env._look_rows[i]))
        while obs.decision != k:
            obs, _, _, _ = env.step(NO_LOOK)
        tile = int(np.bincount(env._pixel_tile[k], minlength=16).argmax())
        twin = _env("cmr", 4)
        other = twin.reset()
        while other.decision != k:
            other, _, _, _ = twin.step(NO_LOOK)
        obs, _, _, info = env.step(tile)
        other, _, _, _ = twin.step(NO_LOOK)
        self.assertGreater(info["revealed_pixels"], 0)
        self.assertFalse(np.array_equal(obs.p_detect, other.p_detect))      # the look changed what the model expects next


if __name__ == "__main__":
    unittest.main()
