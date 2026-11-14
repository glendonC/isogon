"""A player's play of an episode, step by step (backend/env/play.py), on SYNTHETIC rows.

Two things are tested. The shape: one step per scheduled look, with what the player knew, the score it gave each
tile, the tile it chose, what the look revealed, the reward and the score so far. And the rule: no step holds a
hidden row before the look that reveals it. The same play is made again on rows from which hidden detections were
deleted or altered, and every step must be the same outside the figures the environment computes against the
hidden detections by design.
"""

from __future__ import annotations

import copy
from dataclasses import replace
import json
from pathlib import Path
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.env import agents as A  # noqa: E402
from backend.env.next_look import NO_LOOK, NextLookEnv  # noqa: E402
from backend.env.play import COMPUTED_AGAINST_HIDDEN_ROWS, play_steps, player_card, reference_player  # noqa: E402
from backend.env.policy import FEATURE_NAMES, LinearPolicyAgent  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.overpass import group_overpasses  # noqa: E402
from backend.eval.rows import Detections, detections_from_rows, read_csv_rows  # noqa: E402
from backend.model.platforms import PLATFORMS  # noqa: E402


def _det() -> Detections:
    rows = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
    return detections_from_rows(rows, fx.SOURCE_LABEL)


DET = _det()
WINDOW: tuple[float, float] = (float(DET.time_s.min()), float(DET.time_s.max()) + 1.0)


def _env(det: Detections, schedule: str, budget: int = 4) -> NextLookEnv:
    reader = fx.fixture_pass_reader() if schedule == "cmr" else None
    return NextLookEnv(det, fx.TEST_BOX, WINDOW, tiles=(4, 4), budget=budget, schedule=schedule, read_passes=reader)


def _iso(t: float) -> str:
    import time

    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(round(float(t)))))


def _key(det: Detections, i: int) -> tuple:
    return (round(float(det.lon[i]), 5), round(float(det.lat[i]), 5), _iso(det.time_s[i]), PLATFORMS[int(det.platform_code[i])])


def _revealed_at(play: dict) -> dict[tuple, int]:
    """Every row the play shows, with the decision of the look that handed it over."""
    out: dict[tuple, int] = {}
    for step in play["steps"]:
        if step["revealed"]:
            for r in step["revealed"]["rows"]:
                out[(r[0], r[1], r[5], r[6])] = step["decision"]
    return out


def _without_scores(play: dict) -> dict:
    """The play without the figures computed against the hidden detections by design."""
    p = copy.deepcopy(play)
    for k in ("score_start", "score_end", "gain", "taught_elsewhere"):
        p.pop(k)
    for step in p["steps"]:
        step.pop("reward")
        step.pop("score")
    return p


def _needle(det: Detections, i: int) -> str:
    return json.dumps([round(float(det.lon[i]), 5), round(float(det.lat[i]), 5)])[:-1] + ","


class ShapeTests(unittest.TestCase):
    def test_one_step_per_look_with_what_was_known_chosen_revealed_and_paid(self) -> None:
        for schedule in ("nominal", "cmr"):
            with self.subTest(schedule=schedule):
                env = _env(DET, schedule)
                play = play_steps(env, A.LeastSureAgent())
                json.dumps(play)                                           # plain numbers, strings and lists
                steps = play["steps"]
                self.assertEqual([s["decision"] for s in steps], list(range(env.n_looks)))
                self.assertEqual(play["episode"]["looks_source"], schedule)
                self.assertEqual(play["player"], {"id": "least_sure", "label": "Least sure",
                                                  "does": "the tile where the model is least sure", "reads": "the observation"})
                spent = [s for s in steps if s["spent"]]
                self.assertEqual(len(spent), 4)
                self.assertEqual(play["looks_taken"], [[s["decision"], s["chosen_tile"]] for s in spent])
                score = play["score_start"]
                for s in steps:
                    self.assertEqual(set(s), {"decision", "look", "budget_left", "looks_left", "spending_look", "when", "knew",
                                              "tile_scores", "score_parts", "chosen_tile", "why", "spent", "revealed",
                                              "reward", "score"})
                    self.assertIsNone(s["when"])                          # every player spends on the evenly spread looks
                    self.assertEqual(set(s["look"]), {"platform", "time_utc", "is_day", "pixel_km"})
                    tiles = s["knew"]["tiles"]
                    for key in ("expected_burning_cells", "unsure", "frp_mw", "sigma_mw", "covered", "modis_pixels",
                                "modis_recent_frp_mw", "looks_before", "revealed_pixels_before"):
                        self.assertEqual(len(tiles[key]), 16, key)
                    if s["spending_look"]:
                        # the score it gave each tile, and the tile it chose: the highest
                        self.assertEqual(len(s["tile_scores"]), 16)
                        self.assertEqual(s["chosen_tile"], int(np.argmax(s["tile_scores"])))
                        for t in range(16):                               # least sure scores a tile by how unsure the model is there
                            self.assertAlmostEqual(s["tile_scores"][t], tiles["unsure"][t], places=2)
                        self.assertEqual(s["why"], "the tile with the highest score")
                        self.assertEqual(s["revealed"]["pixels"], len(s["revealed"]["rows"]))
                    else:
                        self.assertIsNone(s["tile_scores"])
                        self.assertEqual((s["chosen_tile"], s["revealed"], s["reward"], s["spent"]), (NO_LOOK, None, 0.0, False))
                    # the score so far moves by the reward
                    self.assertAlmostEqual(s["score"], score + s["reward"], places=12)
                    score = s["score"]
                self.assertAlmostEqual(play["gain"], play["score_end"] - play["score_start"], places=12)
                self.assertAlmostEqual(play["gain"], sum(s["reward"] for s in steps), places=12)
                self.assertEqual(play["score_end"], steps[-1]["score"])
                # what was known about a tile grows with the looks taken there
                first = spent[0]
                later = steps[first["decision"] + 1]["knew"]["tiles"]
                self.assertEqual(later["looks_before"][first["chosen_tile"]], 1)
                self.assertEqual(later["revealed_pixels_before"][first["chosen_tile"]], first["revealed"]["pixels"])
                self.assertEqual(sum(first["knew"]["tiles"]["looks_before"]), 0)
                self.assertEqual(play["computed_against_hidden_rows"], list(COMPUTED_AGAINST_HIDDEN_ROWS))

    def test_a_revealed_row_lies_in_the_tile_and_on_the_look_that_revealed_it(self) -> None:
        env = _env(DET, "cmr")
        play = play_steps(env, A.LatestModisAgent())
        seen = 0
        for s in play["steps"]:
            if not s["revealed"]:
                continue
            k, tile = s["decision"], s["chosen_tile"]
            own = env._look_rows[k][env._pixel_tile[k] == tile]
            want = sorted(_key(env._viirs, i) for i in own)
            self.assertEqual(sorted((r[0], r[1], r[5], r[6]) for r in s["revealed"]["rows"]), want)
            seen += len(want)
        self.assertGreater(seen, 0)

    def test_players_that_read_nothing_give_no_tile_scores(self) -> None:
        for agent, why in ((A.RandomAgent(seed=3), "drawn at random"), (A.ConstantTileAgent(6), "its constant tile"),
                           (A.CentreTileAgent(), "the next of the centre tiles")):
            play = play_steps(_env(DET, "nominal"), agent, seed=3)
            self.assertEqual(play["player"]["reads"], "nothing")
            spent = [s for s in play["steps"] if s["spending_look"]]
            self.assertEqual(len(spent), 4)
            self.assertTrue(all(s["tile_scores"] is None and s["why"] == why for s in spent), agent.name)
        self.assertEqual(player_card(A.ConstantTileAgent(6))["tile"], 6)
        self.assertEqual([s["chosen_tile"] for s in play["steps"] if s["spending_look"]], [5, 6, 9, 10])

    def test_the_learned_policy_shows_what_made_each_tile_s_score(self) -> None:
        w = np.zeros(len(FEATURE_NAMES))
        w[0], w[1] = 1.0, -0.5
        play = play_steps(_env(DET, "nominal"), LinearPolicyAgent(w))
        self.assertEqual(play["player"]["id"], "learned")
        step = next(s for s in play["steps"] if s["spending_look"])
        parts = step["score_parts"]
        self.assertEqual(parts["names"], list(FEATURE_NAMES))
        self.assertEqual(len(parts["weights"]), len(FEATURE_NAMES))
        self.assertEqual((len(parts["per_tile"]), len(parts["per_tile"][0])), (16, len(FEATURE_NAMES)))
        # a tile's score is the sum of its parts
        for tile in range(16):
            self.assertAlmostEqual(sum(parts["per_tile"][tile]), step["tile_scores"][tile], places=5)
        self.assertIsNone(next(s for s in play["steps"] if not s["spending_look"])["score_parts"])

    def test_with_fields_each_step_carries_the_estimate_the_player_saw(self) -> None:
        import base64

        env = _env(DET, "cmr")
        play = play_steps(env, A.LeastSureAgent(), fields=True)
        json.dumps(play)
        ny, nx = env.grid.shape
        grids = play["episode"]["fields"]
        tiles = np.frombuffer(base64.b64decode(grids["tile_of_cell_u8"]), dtype=np.uint8).reshape(ny, nx)
        np.testing.assert_array_equal(tiles, env.tile_of_cell)
        twin = _env(DET, "cmr")
        obs = twin.reset(0)
        for s in play["steps"]:
            est = s["knew"]["estimate"]
            p = np.frombuffer(base64.b64decode(est["p_burning_u8"]), dtype=np.uint8).reshape(ny, nx)
            np.testing.assert_array_equal(p, np.rint(np.clip(obs.p_burning, 0.0, 1.0) * 255.0).astype(np.uint8))
            d = np.frombuffer(base64.b64decode(est["p_detect_u8"]), dtype=np.uint8).reshape(ny, nx)
            np.testing.assert_array_equal(d, np.rint(np.clip(obs.p_detect, 0.0, 1.0) * 255.0).astype(np.uint8))
            obs, _, _, _ = twin.step(s["chosen_tile"])
        # the estimate moves after a look that showed fire
        k = next(s["decision"] for s in play["steps"] if s["revealed"] and s["revealed"]["pixels"] > 0)
        self.assertNotEqual(play["steps"][k + 1]["knew"]["estimate"]["p_burning_u8"], play_steps(
            _env(DET, "cmr"), A.ConstantTileAgent(15), fields=True)["steps"][k + 1]["knew"]["estimate"]["p_burning_u8"])
        # without the option a play carries no grid
        plain = play_steps(_env(DET, "cmr"), A.LeastSureAgent())
        self.assertIsNone(plain["episode"]["fields"])
        self.assertNotIn("estimate", plain["steps"][0]["knew"])
        # and the grids do not move when every row no look revealed is deleted
        shown = _revealed_at(play)
        unrevealed = DET.is_viirs & ~np.array([_key(DET, i) in shown for i in range(len(DET))])
        bare = play_steps(_env(DET.select(~unrevealed), "cmr"), A.LeastSureAgent(), fields=True)
        self.assertEqual(_without_scores(bare), _without_scores(play))
        self.assertNotEqual(bare["score_start"], play["score_start"])

    def test_the_oracle_is_refused_unless_asked_for_as_the_ceiling(self) -> None:
        with self.assertRaises(ValueError):
            play_steps(_env(DET, "nominal", budget=2), A.OracleAgent())
        play = play_steps(_env(DET, "nominal", budget=2), A.OracleAgent(), ceiling=True)
        self.assertEqual(play["player"]["reads"], "the hidden rows")
        self.assertIn("steps[].tile_scores", play["computed_against_hidden_rows"])
        self.assertIn("hidden rows", play["tile_scores_are"])
        step = next(s for s in play["steps"] if s["spending_look"])
        self.assertAlmostEqual(step["reward"], max(step["tile_scores"]), places=6)

    def test_a_reference_player_by_its_id(self) -> None:
        for name in ("random", "constant_6", "centre", "latest_modis", "least_sure", "expected_new", "oracle"):
            self.assertEqual(reference_player(name).name, name)
        # every player the reference tables name can be played step by step, the oracle only as the ceiling
        table = A.play_reference(_env(DET, "nominal", budget=2), random_seeds=1)
        played = [name for name, entry in table.items() if isinstance(entry, dict) and name not in ("constant", "learned", "oracle")]
        self.assertIn("expected_new", played)
        self.assertIn("least_sure_when_sharp", played)
        for name in played:
            play = play_steps(_env(DET, "nominal", budget=2), reference_player(name))
            self.assertEqual(play["player"]["id"], name)
            self.assertEqual(len(play["steps"]), play["episode"]["looks"])
            self.assertAlmostEqual(play["gain"], table[name]["gains"][0] if name == "random" else table[name]["gain"], places=12)
        self.assertEqual(reference_player("learned", policy=LinearPolicyAgent(np.zeros(len(FEATURE_NAMES)))).name, "learned")
        with self.assertRaises(LookupError):
            reference_player("nobody")


class NoHiddenRowBeforeItsLookTests(unittest.TestCase):
    """The same play on rows with hidden detections deleted or altered."""

    SCHEDULE = "nominal"
    AGENT = staticmethod(lambda: A.LatestModisAgent())

    def agent(self):
        return type(self).AGENT()

    @classmethod
    def setUpClass(cls) -> None:
        cls.play = play_steps(_env(DET, cls.SCHEDULE), cls.AGENT())
        cls.shown = _revealed_at(cls.play)
        d = DET
        cls.revealed = np.array([_key(d, i) in cls.shown for i in range(len(d))]) & d.is_viirs
        cls.unrevealed = d.is_viirs & ~cls.revealed

    def _same_but_for_the_scores(self, det: Detections, name: str, scores_must_move: bool = True) -> dict:
        other = play_steps(_env(det, self.SCHEDULE), self.agent())
        self.assertEqual(_without_scores(other), _without_scores(self.play), name)
        if scores_must_move:
            self.assertNotEqual((other["score_start"], [s["reward"] for s in other["steps"]]),
                                (self.play["score_start"], [s["reward"] for s in self.play["steps"]]),
                                f"{name}: no score moved, so nothing was altered")
        return other

    def test_the_play_revealed_something_and_left_much_hidden(self) -> None:
        self.assertGreater(int(self.revealed.sum()), 20)
        self.assertGreater(int(self.unrevealed.sum()), 100)
        self.assertEqual(int(self.revealed.sum()), sum(s["revealed"]["pixels"] for s in self.play["steps"] if s["revealed"]))

    def test_a_look_hands_over_the_rows_of_its_own_pass_inside_its_own_tile_and_no_other(self) -> None:
        # an environment built here, apart from the one the play ran on, says which rows each look owns in each tile
        reader = fx.fixture_pass_reader() if self.SCHEDULE == "cmr" else None
        ref = NextLookEnv(DET, fx.TEST_BOX, WINDOW, tiles=(4, 4), budget=4, schedule=self.SCHEDULE, read_passes=reader)
        looks = 0
        for s in self.play["steps"]:
            if not s["spent"]:
                self.assertIsNone(s["revealed"])
                continue
            k, tile = s["decision"], s["chosen_tile"]
            own = ref._look_rows[k][ref._pixel_tile[k] == tile]
            want = sorted(_key(ref._viirs, i) for i in own)
            self.assertEqual(sorted((r[0], r[1], r[5], r[6]) for r in s["revealed"]["rows"]), want, f"look {k}, tile {tile}")
            self.assertEqual(s["revealed"]["pixels"], len(want))
            looks += 1
        self.assertEqual(looks, 4)

    def test_deleting_every_row_no_look_revealed(self) -> None:
        self._same_but_for_the_scores(DET.select(~self.unrevealed), "every unrevealed row deleted")

    def test_deleting_part_of_the_unrevealed_rows(self) -> None:
        keep = np.ones(len(DET), dtype=bool)
        free = np.flatnonzero(self.unrevealed)
        keep[free[::3]] = False
        self._same_but_for_the_scores(DET.select(keep), "a third of the unrevealed rows deleted")

    def test_changing_pixel_sizes_and_power_of_unrevealed_rows(self) -> None:
        d, u = DET, self.unrevealed
        altered = replace(d, scan_km=np.where(u, 0.80, d.scan_km), track_km=np.where(u, 1.60, d.track_km),
                          frp_mw=np.where(u, d.frp_mw * 4.0, d.frp_mw))
        self._same_but_for_the_scores(altered, "pixel sizes and power of unrevealed rows changed")

    def test_deleting_a_whole_overpass_no_look_touched(self) -> None:
        d = DET
        viirs_pos = np.flatnonzero(d.is_viirs)
        untouched = [op for op in group_overpasses(d.select(d.is_viirs)) if not self.revealed[viirs_pos[op.index]].any() and op.n > 5]
        self.assertGreater(len(untouched), 2)
        keep = np.ones(len(d), dtype=bool)
        keep[viirs_pos[untouched[len(untouched) // 2].index]] = False
        self._same_but_for_the_scores(d.select(keep), "a whole hidden overpass deleted")

    def test_no_unrevealed_row_is_anywhere_in_the_play(self) -> None:
        text = json.dumps(self.play)
        d = DET
        for i in np.flatnonzero(self.unrevealed & d.in_box(fx.TEST_BOX)):
            self.assertNotIn(_needle(d, i), text)

    def test_a_row_is_in_no_step_before_the_look_that_reveals_it(self) -> None:
        d = DET
        looks = sorted({k for k in self.shown.values()})
        self.assertGreaterEqual(len(looks), 2)
        for k in looks:
            later = np.array([self.shown.get(_key(d, i), -1) >= k for i in range(len(d))]) & d.is_viirs
            # the steps before look k, and what was known and chosen at look k itself, as text: none of the rows
            # that look k or a later look reveals is in it
            before = copy.deepcopy(self.play["steps"][: k + 1])
            before[-1]["revealed"] = None
            text = json.dumps(before)
            for i in np.flatnonzero(later):
                self.assertNotIn(_needle(d, i), text, f"a row revealed at look {self.shown[_key(d, i)]} is in a step up to {k}")
            # and with those rows deleted from the data, the play up to that look is the same
            other = play_steps(_env(d.select(~(later | self.unrevealed)), self.SCHEDULE), self.agent())
            mine, theirs = _without_scores(self.play)["steps"], _without_scores(other)["steps"]
            self.assertEqual(theirs[:k], mine[:k], f"steps before look {k} changed")
            for key in ("knew", "tile_scores", "chosen_tile", "why", "look", "budget_left", "spending_look"):
                self.assertEqual(theirs[k][key], mine[k][key], f"look {k}: {key} changed")
            self.assertEqual(theirs[k]["revealed"]["pixels"], 0)


class NoHiddenRowBeforeItsLookOnThePassListTests(NoHiddenRowBeforeItsLookTests):
    SCHEDULE = "cmr"


class NoHiddenRowBeforeItsLookForAPlayerThatReadsNothingTests(NoHiddenRowBeforeItsLookTests):
    """A player that reads nothing: the tile the fixture's fire starts in, at every look."""

    SCHEDULE = "cmr"
    AGENT = staticmethod(lambda: A.ConstantTileAgent(9))


if __name__ == "__main__":
    unittest.main()
