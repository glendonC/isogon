"""D7: rounds of the next-look environment over HTTP (CONTRACT 10, 12 S1 and 13).

The rule under test: no response holds a hidden row before the look that reveals it. A round is played twice with the
same choices, the second time with every hidden row the round did not reveal deleted. Every field of every response
before the end must be equal, except the scores the environment computes against the hidden detections by design
(`score_start`, `reward`, `info.score`, `info.score_detail`, and the same in the state's history).

The first tests run on the SYNTHETIC fixture (`backend/eval/synthetic_fixture.py`: no row of it was observed by a
satellite) and always run. The others use the real Dixie fire episode of the demo file and skip without its rows.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import unittest

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.env.episodes import EnvEpisode  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.holdout import visible_rows  # noqa: E402
from backend.eval.rows import Detections, detections_from_rows, read_csv_rows  # noqa: E402
from backend.model.real_blind import in_box_overpasses, window_from_start  # noqa: E402
from backend.server_next_look import NextLookRounds, RoundConflict, RoundNotFound  # noqa: E402

DIXIE_EPISODE = "plumas_ca:22:2021-07-22T05"
# The demo file's figures (front-page-ui, website/src/content/demo/nextLook.ts), taken from fire-model M8.
DEMO_SCORE_START = 0.3200562037998656
DEMO_GAIN = {"latest_modis": 0.008431215474028197, "least_sure": 0.006582908803626608, "oracle": 0.016330071325661333}
DEMO_FIRST_LOOKS = [
    ("VIIRS_SNPP", "2021-07-22T09:59:17Z", False), ("VIIRS_NOAA20", "2021-07-22T10:04:17Z", False),
    ("VIIRS_SNPP", "2021-07-22T21:00:10Z", True), ("VIIRS_NOAA20", "2021-07-22T21:05:10Z", True),
]
LATEST_MODIS_LOOKS = {2: 4, 4: 4, 7: 10, 9: 7}     # the latest MODIS agent's looks on that episode


def _synthetic_det() -> Detections:
    rows = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
    return detections_from_rows(rows, fx.SOURCE_LABEL)


def _synthetic_episode(det: Detections, window_of: Detections) -> EnvEpisode:
    items = in_box_overpasses(visible_rows(window_of, "VIIRS"), fx.TEST_BOX)
    w = window_from_start(window_of, fx.TEST_BOX, items[0][0].time_s, n=len(items))
    return EnvEpisode("plumas_ca", 2099, (2, 2), fx.TEST_BOX, w, det, "synthetic")


def _store(episode: EnvEpisode, terrain: bool = False, **kw: object) -> NextLookRounds:
    return NextLookRounds(episode_source=lambda region, key, start: episode, terrain=terrain, **kw)


def _busiest_tile_early(obs: dict) -> int:
    """A choice made from the observation alone: on even decisions before the last two, the tile the model expects to
    burn most; otherwise no look."""
    if obs["budget_left"] <= 0 or obs["decision"] % 2 or obs["looks_left"] <= 2:
        return -1
    return int(np.argmax(obs["estimate"]["per_tile"]["expected_burning_cells"]))


def play(store: NextLookRounds, body: dict, choose) -> tuple[list[dict], dict]:
    """Every response of one round before the end (reset, then each step and the state after it), and the end."""
    out = [store.reset(body)]
    rid = out[0]["round_id"]
    obs = out[0]["observation"]
    while True:
        st = store.step({"round_id": rid, "decision": obs["decision"], "action": choose(obs)})
        if st["done"]:
            end = st.pop("end")
            out.append(st)
            return out, end
        out.append(st)
        out.append(store.state(rid))
        obs = st["observation"]


SCORES_BY_DESIGN = ("round_id", "score_start", "reward")


def _without_scores(resp: dict) -> dict:
    r = copy.deepcopy(resp)
    for k in SCORES_BY_DESIGN:
        r.pop(k, None)
    if "info" in r:
        r["info"].pop("score", None)
        r["info"].pop("score_detail", None)
    for h in r.get("history", []):
        h.pop("reward", None)
        h.pop("score", None)
    return r


def _revealed_mask(det: Detections, responses: list[dict]) -> np.ndarray:
    """The hidden rows the round showed, read back from the last observation (lon, lat, time, platform)."""
    last = [r["observation"] for r in responses if r.get("observation")][-1]
    shown = {(x[0], x[1], x[5], x[6]) for x in last["viirs_revealed"]["rows"]}
    from backend.model.platforms import PLATFORMS
    from backend.server_next_look import _iso

    return np.array([
        (round(float(det.lon[i]), 5), round(float(det.lat[i]), 5), _iso(det.time_s[i]), PLATFORMS[int(det.platform_code[i])]) in shown
        for i in range(len(det))
    ], dtype=bool)


class HiddenRowsTests(unittest.TestCase):
    """SYNTHETIC rows: deleting every hidden row a round did not reveal changes nothing but the scores."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.det = _synthetic_det()
        cls.ep = _synthetic_episode(cls.det, cls.det)
        body = {"region_id": "plumas_ca", "start": "2099-07-01", "tiles": [4, 4], "budget": 3, "seed": 0}
        cls.body = body
        cls.a, cls.end_a = play(_store(cls.ep, reference_seeds=1, reference_wait_s=300), body, _busiest_tile_early)
        cls.revealed = _revealed_mask(cls.det, cls.a)
        cls.unrevealed = cls.det.is_viirs & ~cls.revealed
        bare = _synthetic_episode(cls.det.select(~cls.unrevealed), cls.det)
        cls.b, cls.end_b = play(_store(bare, reference=False), body, _busiest_tile_early)

    def test_the_round_revealed_something_and_left_much_hidden(self) -> None:
        self.assertGreater(int(self.revealed.sum()), 0)
        self.assertGreater(int(self.unrevealed.sum()), 100)
        self.assertGreater(len(self.end_a["looks_taken"]), 0)

    def test_every_response_but_the_scores_is_unchanged_when_unrevealed_rows_are_deleted(self) -> None:
        self.assertEqual(len(self.a), len(self.b))
        for i, (x, y) in enumerate(zip(self.a, self.b)):
            self.assertEqual(_without_scores(x), _without_scores(y), f"response {i} changed")
        # and the deletion did change what the environment scores against, so something was deleted
        ra = [r.get("reward") for r in self.a] + [self.a[0]["score_start"]]
        rb = [r.get("reward") for r in self.b] + [self.b[0]["score_start"]]
        self.assertNotEqual(ra, rb)

    def test_no_unrevealed_row_appears_in_any_response_before_the_end(self) -> None:
        text = json.dumps(self.a)
        d = self.det
        for i in np.flatnonzero(self.unrevealed & d.in_box(fx.TEST_BOX)):
            needle = json.dumps([round(float(d.lon[i]), 5), round(float(d.lat[i]), 5)])[:-1] + ","
            self.assertNotIn(needle, text)

    def test_the_end_reveals_every_hidden_row_and_scores_the_reference_agents(self) -> None:
        d, w = self.det, self.ep.window
        in_play = d.is_viirs & d.in_box(fx.TEST_BOX) & (d.time_s >= w.start_s) & (d.time_s < w.end_s)
        reveal = self.end_a["reveal"]
        self.assertEqual(reveal["pixels"], int(in_play.sum()))
        self.assertEqual(sum(1 for r in reveal["rows"] if r[-1]), int((self.revealed & in_play).sum()))
        self.assertEqual(self.end_a["reference_status"], "ready")
        ref = self.end_a["reference"]
        for name in ("random", "latest_modis", "least_sure", "learned", "oracle"):
            self.assertIn(name, ref)
        self.assertGreaterEqual(ref["oracle"]["gain"], ref["least_sure"]["gain"] - 1e-12)
        self.assertEqual(self.end_b["reference_status"], "not computed")
        self.assertAlmostEqual(self.end_a["gain"], sum(r.get("reward") or 0.0 for r in self.a if "reward" in r))

    def test_before_the_end_no_response_carries_the_reveal_or_the_reference(self) -> None:
        for r in self.a:
            self.assertNotIn("end", r)
            self.assertIsNone(r.get("reference"))


class RoundRulesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ep = _synthetic_episode(_synthetic_det(), _synthetic_det())
        self.now = [1000.0]
        self.store = _store(self.ep, reference=False, max_rounds=2, clock=lambda: self.now[0])
        self.body = {"region_id": "plumas_ca", "start": "2099-07-01"}

    def test_rounds_are_capped_and_dropped_when_idle(self) -> None:
        r1 = self.store.reset(self.body)["round_id"]
        self.now[0] += 1
        r2 = self.store.reset(self.body)["round_id"]
        self.now[0] += 1
        r3 = self.store.reset(self.body)["round_id"]
        with self.assertRaises(RoundNotFound):
            self.store.state(r1)                         # the least recently used went first
        self.assertEqual(self.store.held(), 2)
        self.store.state(r2)
        self.now[0] += 7 * 3600
        self.store.reset(self.body)
        with self.assertRaises(RoundNotFound):
            self.store.state(r3)                         # idle for longer than six hours

    def test_steps_must_follow_the_round(self) -> None:
        r = self.store.reset(self.body)
        rid, n = r["round_id"], len(r["looks"])
        self.assertEqual(r["episode"]["tiles"], [4, 4])
        with self.assertRaises(RoundConflict):
            self.store.step({"round_id": rid, "decision": 1, "action": -1})
        with self.assertRaises(ValueError):
            self.store.step({"round_id": rid, "decision": 0, "action": 16})
        with self.assertRaises(ValueError):
            self.store.step({"round_id": rid, "decision": 0, "action": True})
        with self.assertRaises(ValueError):
            self.store.step({"round_id": rid, "decision": 0})
        for k in range(n):
            self.store.step({"round_id": rid, "decision": k, "action": -1})
        with self.assertRaises(RoundConflict):
            self.store.step({"round_id": rid, "decision": n, "action": -1})
        st = self.store.state(rid)
        self.assertTrue(st["done"])
        self.assertEqual(st["end"]["looks_taken"], [])
        self.assertEqual(st["end"]["gain"], 0.0)

    def test_requests_are_checked(self) -> None:
        for bad in ({"start": "2099-07-01"}, {"region_id": "plumas_ca"},
                    {"region_id": "plumas_ca", "start": "2099-07-01", "episode": "plumas_ca:22:2099-07-01T06"},
                    {**self.body, "tiles": [0, 4]}, {**self.body, "tiles": [4, 9]}, {**self.body, "budget": -1},
                    {**self.body, "budget": 2.5}, {**self.body, "seed": "1"}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.store.reset(bad)
        with self.assertRaises(RoundNotFound):
            self.store.state("nl-unknown")


def _dixie_cached() -> bool:
    from backend.firms import archive as fa

    return fa.extract_path("plumas_ca", "viirs-snpp", 2021).is_file()


class RealRoundTests(unittest.TestCase):
    """The demo's Dixie fire episode on real rows, over HTTP, and the deletion check on real rows."""

    @classmethod
    def setUpClass(cls) -> None:
        if not _dixie_cached():
            raise unittest.SkipTest("FIRMS rows for plumas_ca 2021 are not cached on this machine")
        from backend.tests import test_server_d5 as d5

        d5._base()
        d5._SERVER.store.next_look.reference_seeds = 1
        cls.req = staticmethod(d5._req)

    def _post(self, path: str, body: dict) -> tuple[int, dict]:
        status, _, raw = self.req(path, json.dumps(body).encode())
        return status, json.loads(raw)

    def test_a_round_over_http_matches_the_demo_and_the_reference_agents(self) -> None:
        status, r = self._post("/api/env/next_look/reset",
                               {"region_id": "plumas_ca", "episode": DIXIE_EPISODE, "tiles": [4, 4], "budget": 4})
        self.assertEqual(status, 200, r)
        self.assertAlmostEqual(r["score_start"], DEMO_SCORE_START, places=12)
        self.assertEqual([(x["platform"], x["time_utc"], x["is_day"]) for x in r["looks"][:4]], DEMO_FIRST_LOOKS)
        self.assertEqual((r["episode"]["key"], r["episode"]["split"], r["episode"]["modis_pixels_in_box"]), (DIXIE_EPISODE, "test", 1095))
        self.assertEqual(r["protocol"]["version"], 2)
        self.assertEqual(r["test_episodes"]["episodes"], 21)
        rid = r["round_id"]
        st = None
        for k in range(len(r["looks"])):
            status, st = self._post("/api/env/next_look/step", {"round_id": rid, "decision": k, "action": LATEST_MODIS_LOOKS.get(k, -1)})
            self.assertEqual(status, 200, st)
        self.assertTrue(st["done"])
        end = st["end"]
        # played with the latest MODIS agent's own looks, the round gains exactly what that agent gains
        self.assertAlmostEqual(end["gain"], DEMO_GAIN["latest_modis"], places=12)
        self.assertEqual(end["reference_status"], "ready")
        for name, gain in DEMO_GAIN.items():
            self.assertAlmostEqual(end["reference"][name]["gain"], gain, places=12, msg=name)
        status, state = self.req(f"/api/env/next_look/state?round_id={rid}")[0], json.loads(self.req(f"/api/env/next_look/state?round_id={rid}")[2])
        self.assertEqual(status, 200)
        self.assertTrue(state["done"])
        self.assertEqual(self._post("/api/env/next_look/step", {"round_id": rid, "decision": 10, "action": -1})[0], 409)
        self.assertEqual(self.req("/api/env/next_look/state?round_id=nl-gone")[0], 404)
        self.assertEqual(self._post("/api/env/next_look/reset", {"region_id": "plumas_ca", "episode": DIXIE_EPISODE, "tiles": [9, 9]})[0], 400)
        self.assertEqual(self._post("/api/env/next_look/reset", {"region_id": "blue_mountains_au", "start": "2021-07-22"})[0], 404)
        self.assertEqual(self._post("/api/env/next_look/reset", {"region_id": "plumas_ca", "episode": "plumas_ca:22:2021-01-01T00"})[0], 404)

    def test_a_start_date_gives_the_same_window_rule_as_a_real_run(self) -> None:
        status, r = self._post("/api/env/next_look/reset", {"region_id": "plumas_ca", "start": "2021-07-22", "budget": 0})
        self.assertEqual(status, 200, r)
        self.assertEqual((r["episode"]["from"], r["episode"]["key"]), ("start", DIXIE_EPISODE))
        self.assertIn("MODIS rows only", r["episode"]["chosen_from"])

    def test_deleting_unrevealed_real_rows_changes_nothing_but_the_scores(self) -> None:
        store = NextLookRounds(reference=False)
        body = {"region_id": "plumas_ca", "episode": DIXIE_EPISODE, "tiles": [4, 4], "budget": 4}
        a, _ = play(store, body, lambda obs: LATEST_MODIS_LOOKS.get(obs["decision"], -1) if obs["decision"] < 9 else -1)
        ep = store._episode("plumas_ca", DIXIE_EPISODE, None)[0]
        revealed = _revealed_mask(ep.det, a)
        unrevealed = ep.det.is_viirs & ~revealed
        self.assertGreater(int(revealed.sum()), 100)
        self.assertGreater(int(unrevealed.sum()), 1000)
        bare = EnvEpisode(ep.region_id, ep.year, ep.tile, ep.box, ep.window, ep.det.select(~unrevealed), ep.split)
        b, _ = play(_store(bare, terrain=True, reference=False, source_label="firms"), body,
                    lambda obs: LATEST_MODIS_LOOKS.get(obs["decision"], -1) if obs["decision"] < 9 else -1)
        self.assertEqual(len(a), len(b))
        for i, (x, y) in enumerate(zip(a, b)):
            self.assertEqual(_without_scores(x), _without_scores(y), f"response {i} changed")
        self.assertNotEqual([r.get("reward") for r in a], [r.get("reward") for r in b])


if __name__ == "__main__":
    unittest.main()
