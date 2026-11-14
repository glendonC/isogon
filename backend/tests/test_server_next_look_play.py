"""The route that serves one player's play of an episode step by step, on the SYNTHETIC fixture
(`backend/eval/synthetic_fixture.py`), with a stand-in for `backend/env/play.py` so the route's own rules are tested
whether or not that module is in the build: the oracle only as the ceiling, a play cached per episode and options,
409 while a person's round on the same episode is not over, 404 for an unknown player or without the module."""

from __future__ import annotations

from pathlib import Path
import sys
import types
import unittest
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.server_next_look import NextLookRounds, RoundConflict, RoundNotFound  # noqa: E402
from backend.tests.test_server_next_look import _synthetic_det, _synthetic_episode  # noqa: E402

BODY = {"region_id": "plumas_ca", "start": "2099-07-01", "tiles": [4, 4], "budget": 3, "seed": 0}


def _stand_in() -> types.ModuleType:
    m = types.ModuleType("backend.env.play")
    m.PLAYERS = {"least_sure": ("Least sure", "the tile where the model is least sure", "the observation"),
                 "oracle": ("Oracle", "a ceiling", "the hidden rows")}

    def reference_player(name, seed=0, policy=None):
        if name not in ("least_sure", "oracle"):
            raise LookupError(f"no reference player named {name!r}")
        return types.SimpleNamespace(name=name)

    def play_steps(env, agent, seed=0, ceiling=False, fields=False):
        if agent.name == "oracle" and not ceiling:
            raise ValueError("oracle reads the hidden rows")
        return {"player": {"id": agent.name}, "seed": seed, "steps": [], "looks": env.n_looks,
                "computed_against_hidden_rows": ["score_start"]}

    m.reference_player, m.play_steps = reference_player, play_steps
    return m


class PlayRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        det = _synthetic_det()
        self.ep = _synthetic_episode(det, det)
        self.store = NextLookRounds(episode_source=lambda region, key, start: self.ep, terrain=False, reference=False)
        self.module = mock.patch.dict(sys.modules, {"backend.env.play": _stand_in()})
        self.module.start()
        import backend.env as env_pkg

        self.attr = mock.patch.object(env_pkg, "play", sys.modules["backend.env.play"], create=True)
        self.attr.start()

    def tearDown(self) -> None:
        self.attr.stop()
        self.module.stop()

    def test_a_play_is_served_and_then_cached(self) -> None:
        a = self.store.play({**BODY, "player": "least_sure"})
        self.assertEqual(a["play"]["player"]["id"], "least_sure")
        self.assertEqual(a["play_cache"]["from"], "computed for this request")
        self.assertIn("round of its own", a["rule"])
        b = self.store.play({**BODY, "player": "least_sure"})
        self.assertEqual((b["play_cache"]["from"], b["play_id"]), ("cache", a["play_id"]))
        self.assertEqual(self.store.play_computations, 1)
        c = self.store.play({**BODY, "player": "least_sure", "seed": 3})
        self.assertNotEqual(c["play_id"], a["play_id"])
        self.assertEqual(self.store.play_computations, 2)

    def test_the_oracle_only_as_the_ceiling(self) -> None:
        with self.assertRaises(ValueError):
            self.store.play({**BODY, "player": "oracle"})
        self.assertEqual(self.store.play({**BODY, "player": "oracle", "ceiling": True})["play"]["player"]["id"], "oracle")
        with self.assertRaises(ValueError):
            self.store.play({**BODY, "player": "oracle", "ceiling": "true"})

    def test_not_during_a_persons_round_on_the_same_episode(self) -> None:
        rnd = self.store.reset(BODY)
        with self.assertRaises(RoundConflict):
            self.store.play({**BODY, "player": "least_sure", "round_id": rnd["round_id"]})
        obs = rnd["observation"]
        while True:
            st = self.store.step({"round_id": rnd["round_id"], "decision": obs["decision"], "action": -1})
            if st["done"]:
                break
            obs = st["observation"]
        self.assertEqual(self.store.play({**BODY, "player": "least_sure", "round_id": rnd["round_id"]})["play"]["player"]["id"], "least_sure")

    def test_unknown_player_and_requests(self) -> None:
        with self.assertRaises(RoundNotFound):
            self.store.play({**BODY, "player": "nobody"})
        for bad in ({**BODY}, {**BODY, "player": ""}, {**BODY, "player": "least_sure", "fields": 1}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.store.play(bad)
        self.assertEqual([p["id"] for p in self.store.players()["players"]], ["least_sure", "oracle"])


class WithoutTheModuleTests(unittest.TestCase):
    def test_the_route_says_the_play_is_not_in_this_build(self) -> None:
        det = _synthetic_det()
        ep = _synthetic_episode(det, det)
        store = NextLookRounds(episode_source=lambda region, key, start: ep, terrain=False, reference=False)
        import backend.env as env_pkg

        saved = env_pkg.__dict__.pop("play", None)      # hide a module already imported in this process
        try:
            with mock.patch.dict(sys.modules, {"backend.env.play": None}):
                with self.assertRaises(RoundNotFound):
                    store.play({**BODY, "player": "least_sure"})
        finally:
            if saved is not None:
                env_pkg.play = saved


if __name__ == "__main__":
    unittest.main()
