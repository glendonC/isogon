"""The reference players of a next-look round are computed once per episode and served from a cache afterwards.

Every test runs on the SYNTHETIC fixture (`backend/eval/synthetic_fixture.py`: no row of it was observed by a
satellite). The rules under test:

- a second round of the same episode, tiles, budget and random seeds does not play the reference players again, in
  the same server or in a new one reading the disk cache;
- anything that decides their results gives a new key: the tiles, the budget, a hidden row, a file of the
  environment, the reconstruction or the fitted values;
- rounds started together share one computation, and dropping one of them does not cancel it for the other;
- with the cache warm, no response before the end of a round holds a hidden row, the reveal, the reference result or
  anything about the cache; deleting every hidden row the round did not reveal changes nothing but the scores.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.server_next_look import (  # noqa: E402
    REFERENCE_INPUTS,
    NextLookRounds,
    _input_files,
    episode_digest,
)
from backend.tests.test_server_next_look import (  # noqa: E402
    _busiest_tile_early,
    _revealed_mask,
    _synthetic_det,
    _synthetic_episode,
    _without_scores,
    play,
)

BODY = {"region_id": "plumas_ca", "start": "2099-07-01", "tiles": [4, 4], "budget": 3, "seed": 0}


class _FastRounds(NextLookRounds):
    """The cache's rules do not depend on what the players score, so most tests play a stand-in that answers at once
    with what it was asked; `WarmCacheHiddenRowsTests` plays the real reference players."""

    def _reference(self, ep, tiles, budget, terrain=None):
        return {"stand_in": True, "rows": len(ep.det), "tiles": list(tiles), "budget": int(budget),
                "random": {"seeds": list(range(self.reference_seeds))}}


def _store(episode, real: bool = False, **kw) -> NextLookRounds:
    kw.setdefault("reference_seeds", 1)
    kw.setdefault("reference_wait_s", 300)
    cls = NextLookRounds if real else _FastRounds
    return cls(episode_source=lambda region, key, start: episode, terrain=False, **kw)


class _GatedRounds(_FastRounds):
    """Reference players that wait for a gate before they play, so two rounds can be started while one computes."""

    def __init__(self, *a, **kw) -> None:
        super().__init__(*a, **kw)
        self.gate = threading.Event()
        self.computed_keys: list[str] = []

    def _reference(self, *a, **kw):
        self.gate.wait(120)
        return super()._reference(*a, **kw)

    def _compute_reference(self, key, *a, **kw):
        self.computed_keys.append(key)
        return super()._compute_reference(key, *a, **kw)


class ReferenceCacheTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.det = _synthetic_det()
        cls.ep = _synthetic_episode(cls.det, cls.det)

    def test_a_second_round_of_the_same_episode_does_not_recompute(self) -> None:
        store = _store(self.ep)
        _, end1 = play(store, BODY, _busiest_tile_early)
        _, end2 = play(store, BODY, lambda obs: -1)
        self.assertEqual(store.reference_computations, 1)
        self.assertEqual((end1["reference_status"], end2["reference_status"]), ("ready", "ready"))
        self.assertEqual(end2["reference"], end1["reference"])
        self.assertEqual(end1["reference_cache"]["from"], "computed for this round")
        self.assertEqual(end2["reference_cache"]["from"], "cache")
        self.assertEqual(end1["reference_cache"]["key"], end2["reference_cache"]["key"])
        self.assertIsInstance(end1["reference_cache"]["compute_s"], float)

    def test_another_budget_tile_split_or_seed_count_is_computed_apart(self) -> None:
        store = _store(self.ep)
        play(store, BODY, lambda obs: -1)
        play(store, {**BODY, "budget": 2}, lambda obs: -1)
        play(store, {**BODY, "tiles": [2, 2]}, lambda obs: -1)
        self.assertEqual(store.reference_computations, 3)
        play(store, {**BODY, "seed": 5}, lambda obs: -1)   # the round's own seed does not decide the reference players
        self.assertEqual(store.reference_computations, 3)
        other = _store(self.ep, reference_seeds=2)
        self.assertNotEqual(other.reference_key(self.ep, None, (4, 4), 3), store.reference_key(self.ep, None, (4, 4), 3))

    def test_a_new_server_reads_the_result_from_disk(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            first = _store(self.ep, reference_cache_dir=tmp)
            _, end1 = play(first, BODY, lambda obs: -1)
            files = sorted(Path(tmp).glob("*.json"))
            self.assertEqual(len(files), 1)
            doc = json.loads(files[0].read_text(encoding="utf-8"))
            self.assertEqual(doc["key"], end1["reference_cache"]["key"])
            second = _store(self.ep, reference_cache_dir=tmp)
            _, end2 = play(second, BODY, lambda obs: -1)
            self.assertEqual(second.reference_computations, 0)
            self.assertEqual(end2["reference_cache"]["from"], "cache")
            self.assertEqual(end2["reference"], end1["reference"])
            # a damaged file is not served: the players are played again and the file is written anew
            files[0].write_text("{not json", encoding="utf-8")
            third = _store(self.ep, reference_cache_dir=tmp)
            _, end3 = play(third, BODY, lambda obs: -1)
            self.assertEqual(third.reference_computations, 1)
            self.assertEqual(end3["reference"], end1["reference"])
            self.assertEqual(json.loads(files[0].read_text(encoding="utf-8"))["key"], doc["key"])

    def test_a_changed_input_file_gives_a_new_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            reward = Path(tmp) / "reward.py"
            reward.write_text("PAY_FOR_AN_EMPTY_LOOK = True\n", encoding="utf-8")
            store = _store(self.ep, reference_inputs=(Path(tmp),))
            _, end1 = play(store, BODY, lambda obs: -1)
            reward.write_text("PAY_FOR_AN_EMPTY_LOOK = False  # changed\n", encoding="utf-8")
            _, end2 = play(store, BODY, lambda obs: -1)
            self.assertEqual(store.reference_computations, 2)
            self.assertNotEqual(end1["reference_cache"]["key"], end2["reference_cache"]["key"])
            self.assertEqual(end2["reference_cache"]["from"], "computed for this round")

    def test_the_inputs_cover_the_environment_the_reconstruction_and_their_fitted_values(self) -> None:
        names = {n for n, _ in _input_files(REFERENCE_INPUTS)}
        for needed in ("env/next_look.py", "env/agents.py", "env/policy.py", "env/fitted/next_look.json",
                       "eval/blind_test.py", "model/fitted.py", "cmr_passes.py", "server_next_look.py"):
            self.assertIn(needed, names)
        self.assertTrue(any(n.startswith("model/fitted_values/") and n.endswith(".json") for n in names))
        self.assertFalse(any("__pycache__" in n or n.endswith(".pyc") for n in names))

    def test_a_changed_hidden_row_gives_a_new_key(self) -> None:
        d = self.det
        i = int(np.flatnonzero(d.is_viirs)[0])
        frp = d.frp_mw.copy()
        frp[i] += 1.0
        from dataclasses import replace

        changed = _synthetic_episode(replace(d, frp_mw=frp), d)
        self.assertNotEqual(episode_digest(changed, None), episode_digest(self.ep, None))
        self.assertNotEqual(episode_digest(self.ep, np.zeros((2, 2))), episode_digest(self.ep, None))
        store = _store(self.ep)
        self.assertNotEqual(store.reference_key(changed, None, (4, 4), 3), store.reference_key(self.ep, None, (4, 4), 3))

    def test_rounds_started_together_share_one_computation(self) -> None:
        store = _GatedRounds(episode_source=lambda region, key, start: self.ep, terrain=False, reference_seeds=1,
                             reference_wait_s=300, max_rounds=2)
        r1 = store.reset(BODY)
        r2 = store.reset(BODY)
        self.assertEqual(store._rounds[r2["round_id"]].reference_origin, "shared with a round started earlier")
        self.assertIs(store._rounds[r1["round_id"]].reference, store._rounds[r2["round_id"]].reference)
        store.reset({**BODY, "budget": 2})   # the cap of two drops the first round; the second still waits on it
        self.assertNotIn(r1["round_id"], store._rounds)
        self.assertFalse(store._rounds[r2["round_id"]].reference.cancelled())
        store.gate.set()
        end = None
        obs = r2["observation"]
        while True:
            st = store.step({"round_id": r2["round_id"], "decision": obs["decision"], "action": -1})
            if st["done"]:
                end = st["end"]
                break
            obs = st["observation"]
        self.assertEqual(end["reference_status"], "ready")
        self.assertEqual(end["reference_cache"]["from"], "shared with a round started earlier")
        self.assertEqual(store.computed_keys.count(end["reference_cache"]["key"]), 1)


class WarmCacheHiddenRowsTests(unittest.TestCase):
    """With the reference players already cached, a round leaks nothing before its end."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.det = _synthetic_det()
        cls.ep = _synthetic_episode(cls.det, cls.det)
        cls.store = _store(cls.ep, real=True)
        _, cls.warm_end = play(cls.store, BODY, lambda obs: -1)           # fills the cache
        cls.a, cls.end_a = play(cls.store, BODY, _busiest_tile_early)     # served from it
        revealed = _revealed_mask(cls.det, cls.a)
        cls.unrevealed = cls.det.is_viirs & ~revealed
        bare = _synthetic_episode(cls.det.select(~cls.unrevealed), cls.det)
        bare_store = _store(bare, reference=False)
        play(bare_store, BODY, lambda obs: -1)                            # the same rounds held as in the first
        cls.b, _ = play(bare_store, BODY, _busiest_tile_early)

    def test_the_second_round_was_served_from_the_cache(self) -> None:
        self.assertEqual(self.store.reference_computations, 1)
        self.assertEqual(self.warm_end["reference_cache"]["from"], "computed for this round")
        self.assertEqual(self.end_a["reference_cache"]["from"], "cache")
        self.assertEqual(self.end_a["reference"], self.warm_end["reference"])
        for name in ("random", "latest_modis", "least_sure", "learned", "oracle"):
            self.assertIn(name, self.end_a["reference"])
        self.assertGreater(int(self.unrevealed.sum()), 100)

    def test_no_response_before_the_end_carries_the_reference_or_the_cache(self) -> None:
        key = self.end_a["reference_cache"]["key"]
        for r in self.a:
            self.assertNotIn("end", r)
            self.assertIsNone(r.get("reference"))
            self.assertNotIn("reference_cache", r)
            self.assertNotIn(key, json.dumps(r))

    def test_every_response_but_the_scores_is_unchanged_when_unrevealed_rows_are_deleted(self) -> None:
        self.assertEqual(len(self.a), len(self.b))
        for i, (x, y) in enumerate(zip(self.a, self.b)):
            self.assertEqual(_without_scores(x), _without_scores(y), f"response {i} changed")

    def test_no_unrevealed_row_appears_in_any_response_before_the_end(self) -> None:
        text = json.dumps(self.a)
        d = self.det
        for i in np.flatnonzero(self.unrevealed & d.in_box(fx.TEST_BOX)):
            needle = json.dumps([round(float(d.lon[i]), 5), round(float(d.lat[i]), 5)])[:-1] + ","
            self.assertNotIn(needle, text)


if __name__ == "__main__":
    unittest.main()
