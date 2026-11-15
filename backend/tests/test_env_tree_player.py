"""The tree player reads the observation alone: a round with it never asks what a tile would pay, its module names no
sealed row, and it imports nothing of the harmonization, the cube or the calendar (SYNTHETIC episodes)."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import unittest
from unittest import mock

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.env import tree_fit as T  # noqa: E402
from backend.env import tree_player as TP  # noqa: E402
from backend.env.agents import LeastSureAgent, run_episode  # noqa: E402
from backend.env.next_look import NextLookEnv  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.rows import detections_from_rows, read_csv_rows  # noqa: E402
from backend.model.challenger.gbdt import HistGBDT  # noqa: E402

ROWS = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)


def _env() -> NextLookEnv:
    det = detections_from_rows(ROWS, fx.SOURCE_LABEL)
    window = (float(det.time_s.min()), float(det.time_s.max()) + 1.0)
    return NextLookEnv(det, fx.TEST_BOX, window, tiles=(4, 4), budget=3)


def _model(cols: int) -> dict:
    rng = np.random.default_rng(0)
    x = rng.random((256, cols)).astype(np.float32)
    return HistGBDT(n_estimators=5, max_depth=3, random_state=42).fit(x, (x[:, 0] > 0.5).astype(float)).to_dict()


class TreePlayerReadsTheObservationAloneTests(unittest.TestCase):
    def test_a_round_completes_when_asking_what_a_tile_would_pay_fails(self) -> None:
        for form, cols in TP.FORMS.items():
            player = TP.TreePlayer(_model(len(cols)), cols)
            plain = run_episode(_env(), player, seed=0)
            env = _env()
            with mock.patch.object(env, "peek", side_effect=AssertionError("the tree player asked what a tile pays")):
                guarded = run_episode(env, player, seed=0)
            self.assertEqual(plain["actions"], guarded["actions"], form)
            self.assertAlmostEqual(plain["return"], guarded["return"], places=12)
            self.assertTrue(any(a >= 0 for a in guarded["actions"]))

    def test_the_player_is_handed_no_environment(self) -> None:
        player = TP.TreePlayer(_model(len(TP.INPUT_NAMES)), TP.FORMS["all_inputs"])
        seen = []
        real = player.choose

        def choose(obs, env=None):
            seen.append(env)
            return real(obs, env)

        player.choose = choose
        run_episode(_env(), player, seed=0)
        self.assertTrue(seen)
        self.assertTrue(all(e is None for e in seen))

    def test_the_module_names_no_sealed_row(self) -> None:
        text = Path(TP.__file__).read_text(encoding="utf-8")
        for name in ("peek", "open_for_scoring", "_sealed", "_viirs", "_truth", "._det", "_looks", "taught_elsewhere"):
            self.assertNotIn(name, text)

    def test_the_module_imports_nothing_of_the_harmonization_the_cube_or_the_calendar(self) -> None:
        code = ("import sys; sys.path.insert(0, sys.argv[1]); import backend.env.tree_player; "
                "print(','.join(sorted(m for m in sys.modules if m.startswith('backend') and "
                "any(w in m for w in ('harmoniz', 'cube', 'calendar', 'world_split', 'real_run')))))")
        out = subprocess.run([sys.executable, "-c", code, str(_REPO_ROOT)], capture_output=True, text=True, check=True)
        self.assertEqual(out.stdout.strip(), "")


class TreePlayerInputsTests(unittest.TestCase):
    def test_the_inputs_have_one_row_a_tile_and_the_first_are_the_learned_players(self) -> None:
        from backend.env.policy import tile_features

        env = _env()
        obs = env.reset(0)
        x = TP.inputs(obs)
        self.assertEqual(x.shape, (16, len(TP.INPUT_NAMES)))
        self.assertTrue(np.all(np.isfinite(x)))
        self.assertTrue(np.array_equal(x[:, :15], tile_features(obs)))
        self.assertEqual(int(np.argmax(x[:, 0])), LeastSureAgent().choose(obs))

    def test_ties_go_to_the_least_sure_tile_then_the_lower_index(self) -> None:
        self.assertEqual(TP.pick(np.array([1.0, 2.0, 2.0, 0.0]), np.array([0.0, 0.1, 0.5, 0.9])), 2)
        self.assertEqual(TP.pick(np.array([2.0, 2.0, 2.0]), np.array([0.5, 0.5, 0.1])), 0)


class TreeFitTargetTests(unittest.TestCase):
    def test_a_tiles_target_is_its_share_of_the_best_and_a_look_where_nothing_gains_is_left_out(self) -> None:
        x = np.ones((4, len(TP.INPUT_NAMES)), dtype=np.float32)
        samples = [[(x, np.array([0.2, -0.1, 0.4, 0.0])), (x, np.array([0.0, -0.3, 0.0, 0.0]))]]
        xs, ys = T.training_set(samples, [True], TP.FORMS["record_inputs"])
        self.assertEqual(xs.shape, (4, 15))
        self.assertTrue(np.allclose(ys, [0.5, 0.0, 1.0, 0.0]))


if __name__ == "__main__":
    unittest.main()
