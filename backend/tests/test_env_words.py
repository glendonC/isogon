"""What the players are called. A name and a description say what a player does, no more.

Two words were wrong. The player that reads the hidden rows was called a ceiling: it chooses where at the evenly
spread looks only, and a player that also chooses when can gain more, so nothing served calls it one or measures
another player as a share of it. And the rule on the pixel size was named for the sharpest pass of each stretch: it
takes a pass that is sharp against the passes seen so far in its stretch, which is not always the sharpest.
On the SYNTHETIC fixture and the tracked files.
"""

from __future__ import annotations

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
from backend.env import report as R  # noqa: E402
from backend.env.next_look import NextLookEnv  # noqa: E402
from backend.env.play import PLAYERS, play_steps, player_card  # noqa: E402
from backend.env.policy import load_fitted  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.rows import detections_from_rows  # noqa: E402
from backend.model import evidence as E  # noqa: E402

DET = detections_from_rows(fx.extended_rows(), fx.SOURCE_LABEL)
WINDOW = (float(DET.time_s.min()), float(DET.time_s.max()) + 1.0)
THE_WORD = "ceil" + "ing"          # the word that is not to be served, written in two parts so this file holds it once


def _env(budget: int = 2) -> NextLookEnv:
    return NextLookEnv(DET, fx.TEST_BOX, WINDOW, tiles=(4, 4), budget=budget, read_passes=fx.fixture_pass_reader())


def _rows(block: dict) -> list[dict]:
    """Every player's row of a reference table block, the other settings included."""
    out = list(block["agents"].values())
    for other in block.get("other_settings", []):
        out += list(other["agents"].values())
    return out


class SeesTheAnswerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc = E.evidence()
        cls.tracked = load_fitted()

    def test_nothing_served_calls_it_by_the_wrong_word(self) -> None:
        env = _env()
        served = {
            "the players' list": json.dumps(PLAYERS),
            "the evidence answer": json.dumps(self.doc),
            "the table in use": json.dumps(self.tracked["validation_reference"]),
            "the table on nominal looks": json.dumps(self.tracked["validation_reference_on_nominal_looks"]),
            "its own play": json.dumps(play_steps(env, A.OracleAgent(), sees_the_answer=True)),
            "the reference players of a round": json.dumps(A.play_reference(_env(), random_seeds=1)),
            "what a new table says of it": R.SEES_THE_ANSWER,
            "the limits a round states": json.dumps(env.describe()),
        }
        for what, text in served.items():
            self.assertNotIn(THE_WORD, text.lower(), what)

    def test_it_is_named_for_what_it_does(self) -> None:
        label, does, reads = PLAYERS["oracle"]
        self.assertEqual((label, reads), ("Sees the answer", "the hidden rows"))
        for words in ("evenly spread looks", "where", "not when"):
            self.assertIn(words, does)
        self.assertEqual(player_card(A.OracleAgent())["label"], "Sees the answer")
        on_record = {a["id"]: a for a in self.doc["next_look"]["agents"]}["oracle"]
        in_use = {a["id"]: a for a in self.doc["next_look"]["on_validation"]["agents"]}["oracle"]
        for row in (on_record, in_use):
            self.assertEqual(row["label"], "Sees the answer")
            self.assertIn("evenly spread looks", row["does"])
        self.assertIn("can gain more", R.SEES_THE_ANSWER)
        self.assertEqual(self.tracked["validation_reference"]["oracle"], R.SEES_THE_ANSWER)

    def test_no_player_is_measured_as_a_share_of_it_where_players_choose_when(self) -> None:
        for block in ("validation_reference", "validation_reference_on_nominal_looks"):
            for row in _rows(self.tracked[block]):
                self.assertNotIn("share_of_oracle_gain", row, block)
        for row in self.doc["next_look"]["on_validation"]["agents"]:
            self.assertNotIn("share_of_oracle_gain", row)
        # a table measured now has no such column either
        rs = [{"players": {"x": {"gains": [0.01], "finals": [0.3], "taught_elsewhere": [0.0], "pixels": [3], "empty_looks": [0]}},
               "budget": 2, "looks": 4}]
        self.assertNotIn("share_of_oracle_gain", R._row(rs, "x"))
        self.assertNotIn("of oracle", R.format_table({"settings": []}) + "player gain final")

    def test_a_player_that_chooses_when_can_gain_more_than_it_and_does(self) -> None:
        """The reason the word went: on the validation table the learned player gains more on some episodes."""
        per = self.tracked["validation_reference"]["per_episode"]
        above = sum(1 for a, b in zip(per["learned"], per["oracle"]) if a > b)
        self.assertGreater(above, 0)
        self.assertEqual(above, self.tracked["validation_reference"]["differences"]["oracle_minus_learned"]["episodes_b_ahead"])

    def test_it_is_asked_for_by_what_it_is(self) -> None:
        with self.assertRaises(ValueError) as caught:
            play_steps(_env(), A.OracleAgent())
        self.assertNotIn(THE_WORD, str(caught.exception).lower())
        self.assertIn("sees_the_answer", str(caught.exception))
        new = play_steps(_env(), A.OracleAgent(), sees_the_answer=True)
        old = play_steps(_env(), A.OracleAgent(), **{THE_WORD: True})            # the older name of the same switch
        self.assertEqual(new["gain"], old["gain"])
        self.assertEqual(new["player"]["reads"], "the hidden rows")


class SharpPassTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc = E.evidence()
        cls.tracked = load_fitted()

    def test_the_rule_is_named_for_what_it_does(self) -> None:
        label, does, _ = PLAYERS["least_sure_when_sharp"]
        in_use = {a["id"]: a for a in self.doc["next_look"]["on_validation"]["agents"]}["least_sure_when_sharp"]
        for text in (label, does, in_use["label"], in_use["does"], json.dumps(self.tracked["validation_reference"]["plainly"]),
                     json.dumps(self.doc["next_look"]["on_validation"]), A.SharpLeastSureAgent.__doc__):
            self.assertNotIn("sharpest", text.lower())
        for text in (does, in_use["does"]):
            self.assertIn("seen so far", text)

    def test_the_pass_it_takes_is_not_always_the_sharpest_of_its_stretch(self) -> None:
        """One stretch of four passes with pixel areas 0.5, 0.3, 0.1 and 0.2 km2. The rule cannot look at the first
        (nothing to compare with), finds the second sharp against what it has seen, and looks. The third is sharper."""
        env = _env(budget=1)
        obs = env.reset(seed=0)
        n = 4
        base = replace(obs, look_times_s=obs.look_times_s[:n], budget_left=1, revealed_tiles=())
        clock = A.StretchClock()
        areas = [0.5, 0.3, 0.1, 0.2]
        taken = None
        for k, area in enumerate(areas):
            d = clock.decide(replace(base, decision=k), -area)
            if d["looks"] and taken is None:
                taken = k
        self.assertEqual(taken, 1)
        self.assertEqual(int(np.argmin(areas)), 2)


if __name__ == "__main__":
    unittest.main()
