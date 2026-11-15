"""A round of the game through the browser's entry point is the server's round: the same round store, the same
looks, the same end, with the reference players read from a file made at build time and given only once the round is
over. On an episode of `plumas_ca` from 2012-08-10 (the Chips Fire), with one random seed and a budget of two to be
quick; no window of a test fire is played."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

REGION, START, BUDGET = "plumas_ca", "2012-08-10", 2
HAS_ROWS = (_REPO_ROOT / "data" / "cache" / "firms" / "extract" / REGION).is_dir()


def _play(start_fn, look_fn) -> tuple[dict, list[dict]]:
    first = start_fn()
    rid, outs, k = first["round_id"], [], 0
    while True:
        out = look_fn(rid, k, 0 if k < BUDGET else -1)
        outs.append(out)
        if out["done"]:
            return first, outs
        k += 1


@unittest.skipUnless(HAS_ROWS, f"the cached rows of {REGION} are not here")
class RoundTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from backend import browser as B
        from backend.server_next_look import NextLookRounds

        cls.tmp = tempfile.TemporaryDirectory()
        B.set_rounds(NextLookRounds(reference=False, reference_cache_dir=None, reference_seeds=1))
        cls.file = B.write_round_reference(REGION, start=START, budget=BUDGET, out_dir=cls.tmp.name, store=B.rounds())
        cls.first, cls.outs = _play(lambda: B.round_start(REGION, start=START, budget=BUDGET),
                                    lambda rid, k, a: B.round_look(rid, k, a, ref_dir=cls.tmp.name))
        cls.state = B.round_state(cls.first["round_id"], ref_dir=cls.tmp.name)
        # the server's own round store, which plays the reference players itself
        server = NextLookRounds(reference=True, reference_cache_dir=None, reference_seeds=1, reference_wait_s=600.0)
        cls.s_first, cls.s_outs = _play(lambda: server.reset({"region_id": REGION, "start": START, "budget": BUDGET, "seed": 0}),
                                        lambda rid, k, a: server.step({"round_id": rid, "decision": k, "action": a}))

    @classmethod
    def tearDownClass(cls) -> None:
        from backend import browser as B

        B.set_rounds(None)
        cls.tmp.cleanup()

    def test_nothing_of_the_reference_or_the_reveal_before_the_round_is_over(self) -> None:
        for out in [self.first] + self.outs[:-1]:
            self.assertFalse(out.get("done", False))
            self.assertNotIn("end", out)
            self.assertIsNone(out.get("reference"))
        self.assertIn("build time", self.first["reference_status"])

    def test_the_end_holds_the_build_s_reference_players_and_they_are_the_server_s(self) -> None:
        end, s_end = self.outs[-1]["end"], self.s_outs[-1]["end"]
        self.assertEqual(end["reference_status"], "ready")
        self.assertEqual(end["reference_cache"]["from"], "a file made at build time")
        self.assertEqual(s_end["reference_status"], "ready")
        self.assertEqual(json.dumps(end["reference"], sort_keys=True), json.dumps(s_end["reference"], sort_keys=True))
        # and the rest of the end is the server's: the scores, the looks taken, the reveal
        same = ("score_start", "score_end", "gain", "looks_taken", "taught_elsewhere", "reveal")
        self.assertEqual({k: end[k] for k in same}, {k: s_end[k] for k in same})
        self.assertGreater(end["reveal"]["pixels"], 0)
        self.assertEqual(self.state["end"]["reference"], end["reference"])

    def test_the_looks_are_the_server_s(self) -> None:
        strip = lambda o: {k: v for k, v in o.items() if k != "round_id"}  # noqa: E731
        self.assertEqual([strip({k: v for k, v in o.items() if k != "end"}) for o in self.outs],
                         [strip({k: v for k, v in o.items() if k != "end"}) for o in self.s_outs])
        self.assertEqual(self.first["episode"], self.s_first["episode"])
        self.assertEqual(self.first["score_start"], self.s_first["score_start"])

    def test_without_the_build_s_file_the_end_says_so(self) -> None:
        from backend import browser as B

        with tempfile.TemporaryDirectory() as empty:
            _first, outs = _play(lambda: B.round_start(REGION, start=START, budget=BUDGET),
                                 lambda rid, k, a: B.round_look(rid, k, a, ref_dir=empty))
        self.assertIsNone(outs[-1]["end"]["reference"])
        self.assertIn("no file", outs[-1]["end"]["reference_status"])


if __name__ == "__main__":
    unittest.main()
