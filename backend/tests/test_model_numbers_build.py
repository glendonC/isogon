"""Which build of the numbers made an answer, and the comparison of two answers made by two builds: figures within
the 0.08 percent measured between builds of numpy, words, flags and counts exactly, digests never."""

from __future__ import annotations

import copy
from pathlib import Path
import sys
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.model.numbers_build import REL_TOLERANCE, agree_within, numbers_build  # noqa: E402

ANSWER = {
    "verdict": {"scores": {"brier": {"value": 0.0081918, "painted_modis": 0.0173, "beats_every_baseline": True,
                                     "class": "ahead"}},
                "beats_every_baseline_on": 6},
    "published": [{"cells_sha256": "a" * 64, "fields_sha256": "b" * 64, "total": 30685649.558292057}],
    "words": "scored against hidden detections beside two baselines",
    "zero": 0.0,
}


def _with(path: list, value) -> dict:
    doc = copy.deepcopy(ANSWER)
    node = doc
    for k in path[:-1]:
        node = node[k]
    node[path[-1]] = value
    return doc


class AgreeWithinTests(unittest.TestCase):
    def test_an_answer_agrees_with_itself_and_within_the_tolerance(self) -> None:
        self.assertTrue(agree_within(ANSWER, ANSWER)["agree"])
        near = _with(["published", 0, "total"], 30685649.558292057 * (1 + 0.5 * REL_TOLERANCE))
        got = agree_within(ANSWER, near)
        self.assertTrue(got["agree"])
        self.assertGreater(got["worst_relative_difference"], 0.0)
        self.assertTrue(agree_within(ANSWER, _with(["zero"], 1e-12))["agree"])

    def test_a_figure_beyond_the_tolerance_or_another_flag_word_or_key_does_not_agree(self) -> None:
        far = agree_within(ANSWER, _with(["verdict", "scores", "brier", "value"], 0.0081918 * (1 + 3 * REL_TOLERANCE)))
        self.assertFalse(far["agree"])
        self.assertEqual(far["differences"][0][0], ".verdict.scores.brier.value")
        for path, value in ((["verdict", "scores", "brier", "beats_every_baseline"], False),
                            (["verdict", "scores", "brier", "class"], "tie"),
                            (["verdict", "beats_every_baseline_on"], 5),
                            (["words"], "something else")):
            self.assertFalse(agree_within(ANSWER, _with(path, value))["agree"], path)
        less = copy.deepcopy(ANSWER)
        del less["zero"]
        self.assertFalse(agree_within(ANSWER, less)["agree"])

    def test_digests_are_never_compared_and_are_counted(self) -> None:
        other = _with(["published", 0, "cells_sha256"], "c" * 64)
        other["published"][0]["fields_sha256"] = "d" * 64
        got = agree_within(ANSWER, other)
        self.assertTrue(got["agree"])
        self.assertEqual(got["digests_not_compared"], 2)


class BuildInTheAnswerTests(unittest.TestCase):
    def test_a_run_s_answer_says_which_build_of_the_numbers_made_it(self) -> None:
        import numpy as np

        from backend.model.real_run import real_response
        from backend.tests.test_model_run_challenger import ROWS6, _solve

        got = real_response(_solve(ROWS6), {})["numbers_built_by"]
        self.assertEqual(got, numbers_build())
        self.assertEqual((got["numpy"], got["platform"]), (np.__version__, sys.platform))
        self.assertIn("0.08 percent", got["note"])
        for cp in (0x2014, 0x2013, 0x00B7):
            self.assertNotIn(chr(cp), got["note"])


if __name__ == "__main__":
    unittest.main()
