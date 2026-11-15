"""In the browser nothing can run or score a closed window: the entry point refuses a held-out run and a round whose
reach meets one, by the server's own rule and words, before anything is read, and refuses a place the page replays
only. At the three closed windows (each region's first set-aside day, from `backend.model.training.EXCLUSIONS`),
with every function that would read a row or build a run made to fail if it is called: nothing is run."""

from __future__ import annotations

from pathlib import Path
import sys
import unittest
from unittest import mock

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def _ran(*_a, **_k):
    raise AssertionError("something was run or read for a closed window")


def _nothing_runs():
    """Every function a run or a round would call to read a row or build anything, made to fail if called."""
    from backend.firms import archive
    from backend.model import real_run
    from backend.server_next_look import NextLookRounds
    from backend.terrain import live_region

    return [mock.patch.object(live_region, "load_region_terrain", _ran),
            mock.patch.object(real_run, "solve_real_reconstruction", _ran),
            mock.patch.object(archive, "read_firms", _ran),
            mock.patch.object(NextLookRounds, "reset", _ran),
            mock.patch.object(NextLookRounds, "_episode", _ran)]


class ClosedWindowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.patches = _nothing_runs()
        for p in self.patches:
            p.start()

    def tearDown(self) -> None:
        for p in self.patches:
            p.stop()

    def test_the_three_closed_windows_are_refused_with_the_server_s_words_and_nothing_runs(self) -> None:
        from backend import browser as B
        from backend.model.real_run import SEARCH_S, parse_start_s
        from backend.model.training import EXCLUSIONS
        from backend.server_next_look import ClosedWindow, closed_for, closed_sentence
        from backend.terrain.live_region import PRESET_BY_ID

        self.assertEqual(sorted(EXCLUSIONS), ["evia_greece", "lytton_bc", "plumas_ca"])
        for region, ex in EXCLUSIONS.items():
            start = ex[0]
            t0 = parse_start_s(start)
            b = PRESET_BY_ID[region].bbox
            want = closed_sentence(closed_for((b.west, b.south, b.east, b.north), t0, t0 + SEARCH_S + B.RUN_TAIL_S))
            for call in (lambda: B.held_out_run(region, start), lambda: B.round_start(region, start=start),
                         lambda: B.refuse_if_closed_here(region, start)):
                with self.assertRaises(ClosedWindow) as got:
                    call()
                self.assertEqual(str(got.exception), want, region)
            self.assertIn("closed", want)

    def test_a_place_replayed_only_is_refused_at_an_open_date_too(self) -> None:
        from backend import browser as B
        from backend.browser_pack import REPLAY_ONLY
        from backend.server_next_look import ClosedWindow

        self.assertEqual(sorted(REPLAY_ONLY), ["evia_greece", "lytton_bc"])
        for region in REPLAY_ONLY:
            for call in (lambda: B.held_out_run(region, "2018-07-01"), lambda: B.round_start(region, start="2018-07-01"),
                         lambda: B.round_start(region, episode=f"{region}:22:2018-07-01T05")):
                with self.assertRaises(ClosedWindow) as got:
                    call()
                self.assertIn("replayed only", str(got.exception))

    def test_the_list_says_replay_only_and_names_no_file_for_such_places(self) -> None:
        from backend import browser as B
        from backend.model.training import EXCLUSIONS

        doc = B.pack_list({"lytton_bc": "2018-07-01", "evia_greece": EXCLUSIONS["evia_greece"][0],
                           "plumas_ca": EXCLUSIONS["plumas_ca"][0]})
        for region, place in doc["places"].items():
            self.assertEqual(place["status"], "replay only", region)
            self.assertEqual((place["modules"], place["files"]), ([], []), region)
        self.assertIn("closed", doc["places"]["plumas_ca"]["why"])

    def test_the_open_fires_the_browser_runs_pass_the_check(self) -> None:
        from backend import browser as B

        for region, start in (("plumas_ca", "2012-08-10"), ("ventura_ca", "2017-12-05")):
            self.assertIsNone(B.refuse_if_closed_here(region, start))


if __name__ == "__main__":
    unittest.main()
