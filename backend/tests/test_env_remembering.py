"""The environment remembers what the model expects at a look, for the looks taken so far. On the SYNTHETIC fixture.

What the model expects at a scheduled look depends on the look and on the looks that handed over rows, and on
nothing else. Every player of a round's reference result asks for the same early looks, and a player whose looks
hand over nothing asks for what a player that never looked asks for. So the environment keeps what it worked out,
under exactly those two things. Remembering must change nothing a player is shown and nothing it is paid.
"""

from __future__ import annotations

from dataclasses import fields
from pathlib import Path
import sys
import unittest
from unittest import mock

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.env import agents as A  # noqa: E402
from backend.env.next_look import NO_LOOK, NextLookEnv, Observation  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.rows import detections_from_rows  # noqa: E402
from backend.model.occupancy import OccupancyReconstruction  # noqa: E402

DET = detections_from_rows(fx.extended_rows(), fx.SOURCE_LABEL)
WINDOW = (float(DET.time_s.min()), float(DET.time_s.max()) + 1.0)


def _env(remember: int | None = None, budget: int = 4, schedule: str = "cmr") -> NextLookEnv:
    kw = {} if remember is None else {"remember": remember}
    reader = fx.fixture_pass_reader() if schedule == "cmr" else None
    return NextLookEnv(DET, fx.TEST_BOX, WINDOW, tiles=(4, 4), budget=budget, schedule=schedule, read_passes=reader, **kw)


def _same(a: Observation, b: Observation) -> list[str]:
    """The names of the fields in which two observations differ."""
    out = []
    for f in fields(Observation):
        x, y = getattr(a, f.name), getattr(b, f.name)
        if isinstance(x, np.ndarray):
            if x.shape != y.shape or not np.array_equal(x, y, equal_nan=True):
                out.append(f.name)
        elif x != y:
            out.append(f.name)
    return out


def _actions(env: NextLookEnv, seed: int) -> list[int]:
    """A made-up round: at each look, a tile at random or no look, so that looks come at any time and many are empty."""
    rng = np.random.default_rng(seed)
    return [int(rng.integers(0, env.n_tiles)) if rng.random() < 0.45 else NO_LOOK for _ in range(env.n_looks)]


def _play(env: NextLookEnv, actions: list[int]) -> tuple[list[Observation], list[float], list[float]]:
    obs = env.reset(seed=0)
    seen, rewards, scores = [obs], [], [float(env.score_start)]
    for a in actions:
        obs, r, done, info = env.step(a)
        rewards.append(float(r))
        scores.append(float(info["score"]))
        if done:
            break
        seen.append(obs)
    return seen, rewards, scores


class RememberingChangesNothingTests(unittest.TestCase):
    def test_every_observation_reward_and_score_is_the_same_with_and_without_it(self) -> None:
        for schedule in ("cmr", "nominal"):
            with_it, without = _env(schedule=schedule), _env(remember=0, schedule=schedule)
            self.assertGreater(with_it.remember, 0)
            self.assertEqual(without.remember, 0)
            for seed in range(6):
                actions = _actions(with_it, seed)
                a, ra, sa = _play(with_it, actions)             # the same environment again and again: it remembers
                b, rb, sb = _play(without, actions)
                self.assertEqual(len(a), len(b))
                for k, (x, y) in enumerate(zip(a, b)):
                    self.assertEqual(_same(x, y), [], (schedule, seed, k))
                self.assertEqual(ra, rb, (schedule, seed))
                self.assertEqual(sa, sb, (schedule, seed))
            self.assertGreater(len(with_it._expected), 0)
            self.assertEqual(len(without._expected), 0)

    def test_a_round_after_another_is_shown_what_a_fresh_environment_shows(self) -> None:
        used, fresh = _env(), _env()
        tile = int(np.argmax(used.hidden_pixels_per_tile()))
        _play(used, [tile] * used.n_looks)                       # a round that looks wherever the fire is
        for actions in ([NO_LOOK] * used.n_looks, _actions(used, 11)):
            a, ra, _ = _play(used, actions)
            b, rb, _ = _play(fresh, actions)
            for k, (x, y) in enumerate(zip(a, b)):
                self.assertEqual(_same(x, y), [], k)
            self.assertEqual(ra, rb)

    def test_what_a_player_does_to_its_observation_reaches_no_other(self) -> None:
        env = _env()
        first = env.reset(seed=0)
        kept = {name: getattr(first, name).copy() for name in ("p_burning", "p_detect", "frp_mw", "sigma_mw")}
        for name in kept:
            getattr(first, name)[...] = -7.0                      # a player scribbles on what it was handed
        again = env.reset(seed=0)
        for name, want in kept.items():
            self.assertTrue(np.array_equal(getattr(again, name), want), name)

    def test_the_reference_players_of_a_round_are_the_same_numbers(self) -> None:
        a = A.play_reference(_env(budget=2), random_seeds=2)
        b = A.play_reference(_env(remember=0, budget=2), random_seeds=2)
        self.assertEqual(a, b)


class RememberingSavesWorkTests(unittest.TestCase):
    def test_a_round_played_again_works_nothing_out_again(self) -> None:
        env = _env()
        actions = _actions(env, 3)
        _play(env, actions)
        real = OccupancyReconstruction.predict_hidden
        calls = {"n": 0}

        def counted(self, *a, **k):
            calls["n"] += 1
            return real(self, *a, **k)

        with mock.patch.object(OccupancyReconstruction, "predict_hidden", counted):
            env.reset(seed=0)
            before = calls["n"]
            self.assertEqual(before, 0)                           # the first observation was remembered
        other = _env(remember=0)
        with mock.patch.object(OccupancyReconstruction, "predict_hidden", counted):
            calls["n"] = 0
            other.reset(seed=0)
            self.assertGreater(calls["n"], 0)                     # without it, it is worked out each time

    def test_a_look_that_hands_over_nothing_asks_for_what_no_look_asks_for(self) -> None:
        env = _env()
        empty = int(np.argmin(env.hidden_pixels_per_tile()))
        self.assertEqual(int(env.hidden_pixels_per_tile()[empty]), 0)
        _play(env, [NO_LOOK] * env.n_looks)
        held = len(env._expected)
        _play(env, [empty] * env.n_looks)                          # every look spent, none hands over a pixel
        self.assertEqual(len(env._expected), held)

    def test_it_keeps_no_more_than_it_was_told_to(self) -> None:
        env = _env(remember=5)
        for seed in range(4):
            _play(env, _actions(env, seed))
        self.assertLessEqual(len(env._expected), 5)
        with self.assertRaises(ValueError):
            _env(remember=-1)

    def test_a_round_says_how_much_it_remembers(self) -> None:
        self.assertEqual(_env(remember=7).describe()["remembers"]["looks"], 7)
        self.assertIn("changes nothing", _env().describe()["remembers"]["what"])


if __name__ == "__main__":
    unittest.main()
