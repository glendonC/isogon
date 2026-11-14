"""The pass list as the environment's default schedule, and players that choose when to look, on SYNTHETIC rows.

  the default      the looks come from the pass list where one answers for the window, and from the nominal slots
                   where none does; a round says which, with its protocol and its limits
  when to look     the top-share rule; the two simple players that use a rule for when; the learned player's look
                   score; that such a player spends exactly its budget and reads nothing hidden
  the fitting      the pieces of `backend/env/learn.py` on one synthetic episode
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.env import KNOWN_LIMITS, KNOWN_LIMITS_BY_SCHEDULE  # noqa: E402
from backend.env import agents as A  # noqa: E402
from backend.env import episodes as E  # noqa: E402
from backend.env import learn as L  # noqa: E402
from backend.env import report as R  # noqa: E402
from backend.env.next_look import NO_LOOK, PROTOCOL, NextLookEnv  # noqa: E402
from backend.env.play import play_steps, reference_player  # noqa: E402
from backend.env.policy import (  # noqa: E402
    FEATURE_NAMES,
    LOOK_FEATURE_NAMES,
    LOOK_FEATURES,
    LearnedPlayer,
    look_features,
    policy_from,
)
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.rows import Detections, detections_from_rows, parse_acq_time_s, read_csv_rows  # noqa: E402
from backend.model.occupancy import OccupancyParams  # noqa: E402
from backend.model.real_run import parse_start_s  # noqa: E402
from backend.terrain.live_region import PRESET_BY_ID  # noqa: E402

ROWS = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
DET: Detections = detections_from_rows(ROWS, fx.SOURCE_LABEL)
WINDOW: tuple[float, float] = (float(DET.time_s.min()), float(DET.time_s.max()) + 1.0)


def _env(budget: int = 4, **kw) -> NextLookEnv:
    kw.setdefault("read_passes", fx.fixture_pass_reader())
    return NextLookEnv(DET, fx.TEST_BOX, WINDOW, tiles=(4, 4), budget=budget, **kw)


def _look_weights() -> tuple[list[float], list[float]]:
    w = np.zeros(len(LOOK_FEATURE_NAMES))
    w[LOOK_FEATURE_NAMES.index("largest_unsure")] = 1.0
    w[LOOK_FEATURE_NAMES.index("day")] = -0.5
    return [float(v) for v in w], [1.0] * len(LOOK_FEATURE_NAMES)


def _tile_weights() -> list[float]:
    w = np.zeros(len(FEATURE_NAMES))
    w[0] = 1.0
    return [float(v) for v in w]


class DefaultScheduleTests(unittest.TestCase):
    def test_the_default_takes_the_pass_list_where_one_answers(self) -> None:
        env = _env()
        d = env.describe()
        self.assertEqual(d["looks"]["source"], "cmr")
        self.assertEqual(d["protocol"]["version"], 3)
        self.assertEqual(env.protocol, PROTOCOL)                  # the module's protocol is the default's
        self.assertEqual(d["known_limits"], KNOWN_LIMITS_BY_SCHEDULE["cmr"])
        self.assertIn("NASA's pass list", d["known_limits"])
        self.assertNotIn("No pass list is cached", d["known_limits"])
        obs = env.reset()
        _, _, _, info = env.step(NO_LOOK)
        self.assertEqual(info["known_limits"], d["known_limits"])
        # a look is a real pass: its own time and pixel size, and which looks are day passes is in the observation
        self.assertEqual(obs.look_is_day.tolist(), [bool(env._looks[k].is_day) for k in range(env.n_looks)])
        self.assertEqual(obs.look_is_day.dtype, np.dtype(bool))

    def test_where_no_pass_list_answers_it_falls_back_to_the_nominal_slots_and_says_so(self) -> None:
        env = _env(read_passes=fx.no_pass_list)
        d = env.describe()
        self.assertEqual(d["looks"]["source"], "nominal")
        self.assertIn("no pass list", d["looks"]["why_nominal"])
        self.assertEqual(d["protocol"]["version"], 2)
        self.assertEqual(d["known_limits"], KNOWN_LIMITS_BY_SCHEDULE["nominal"])
        self.assertIn("No pass list is cached for this window", d["known_limits"])
        # the fallback is also what a synthetic year gets from the real reader: no list is cached for 2099
        plain = NextLookEnv(DET, fx.TEST_BOX, WINDOW, tiles=(4, 4), budget=4)
        self.assertEqual(plain.describe()["looks"]["source"], "nominal")

    def test_asking_for_the_pass_list_where_there_is_none_is_an_error(self) -> None:
        with self.assertRaises(LookupError):
            _env(schedule="cmr", read_passes=fx.no_pass_list)
        self.assertEqual(_env(schedule="nominal").describe()["looks"]["source"], "nominal")

    def test_the_limits_say_the_same_first_thing_on_either_schedule(self) -> None:
        for text in (KNOWN_LIMITS, *KNOWN_LIMITS_BY_SCHEDULE.values()):
            self.assertTrue(text.startswith("FIRMS lists detections, not where a satellite looked and saw nothing"))
            self.assertIn("no cloud mask", text)
            self.assertIn("teaches the model nothing and earns nothing", text)
        self.assertIn("nominal half-day slots", KNOWN_LIMITS)
        self.assertEqual(set(KNOWN_LIMITS_BY_SCHEDULE), {"cmr", "nominal"})


class TopShareRuleTests(unittest.TestCase):
    def test_the_rule(self) -> None:
        rule = A.top_share_rule
        self.assertEqual(rule(9.0, [9.0], 0, 10), (False, None))                  # nothing left to spend
        self.assertEqual(rule(0.0, [5.0, 0.0], 3, 3), (True, None))               # the looks left are the budget left
        self.assertEqual(rule(9.0, [9.0], 2, 10), (False, None))                  # the first look: nothing to compare with
        look, bar = rule(4.0, [1.0, 2.0, 3.0, 4.0], 1, 4)                         # the top quarter of what was seen
        self.assertTrue(look)
        self.assertAlmostEqual(bar, 3.25)
        self.assertEqual(rule(3.0, [1.0, 2.0, 4.0, 3.0], 1, 4)[0], False)
        # with as much budget as looks left every look is in the top share
        self.assertTrue(rule(1.0, [5.0, 4.0, 1.0], 2, 2)[0])

    def test_one_look_is_picked_in_each_stretch_of_the_round(self) -> None:
        rng = np.random.default_rng(3)
        for n in (4, 9, 17, 40):
            for b in (1, 2, 4, 8):
                picked = L.looks_picked(rng.normal(size=n), b)
                self.assertEqual(len(picked), min(b, n), (n, b))
                self.assertEqual(picked, sorted(set(picked)))
                # one in each stretch, so the looks stay spread as the evenly spread ones are
                self.assertEqual([A.stretch_of(k, n, b) for k in picked], sorted({A.stretch_of(k, n, b) for k in range(n)}))
        self.assertEqual(L.looks_picked(np.arange(10.0), 2), [1, 6])              # ever rising scores: the second look of each stretch
        self.assertEqual(L.looks_picked(-np.arange(10.0), 2), [4, 9])             # ever falling: it waits for each stretch's last look
        # a player that always waits for the last look of a stretch is on the evenly spread looks
        for n, b in ((10, 2), (8, 4), (17, 4), (5, 9), (12, 1)):
            self.assertEqual(L.looks_picked(-np.arange(float(n)), b), L.evenly_spread(n, b), (n, b))
        self.assertEqual(L.evenly_spread(8, 4), [1, 3, 5, 7])

    def test_the_stretch_clock_looks_once_in_a_stretch_and_says_why(self) -> None:
        env = _env(4)
        obs = env.reset()
        clock = A.StretchClock()
        looked: dict[int, int] = {}
        reasons = set()
        scores = np.random.default_rng(5).normal(size=env.n_looks)
        while True:
            d = clock.decide(obs, float(scores[obs.decision]))
            self.assertEqual(d["stretch"], A.stretch_of(obs.decision, env.n_looks, 4))
            reasons.add(d["reason"])
            if d["looks"]:
                looked[d["stretch"]] = looked.get(d["stretch"], 0) + 1
            if d["bar"] is not None:
                self.assertEqual(d["looks"], d["score"] >= d["bar"])
            obs, _, done, _ = env.step(0 if d["looks"] else NO_LOOK)
            if done:
                break
        self.assertEqual(looked, {0: 1, 1: 1, 2: 1, 3: 1})
        self.assertIn("it has looked in this stretch already", reasons)
        self.assertIn("the first look of the stretch: nothing to compare its score with", reasons)


class PlayersThatChooseWhenTests(unittest.TestCase):
    def _players(self):
        lw, ls = _look_weights()
        return (A.NightLeastSureAgent(), A.WhenUnsureAgent(), A.SharpLeastSureAgent(), LearnedPlayer(_tile_weights(), lw, ls))

    def test_they_spend_exactly_the_budget_on_either_schedule(self) -> None:
        for kw in ({}, {"schedule": "nominal"}):
            for budget in (1, 4, 8):
                for agent in self._players():
                    with self.subTest(agent=agent.name, budget=budget, **kw):
                        env = _env(budget, **kw)
                        out = A.run_episode(env, agent, seed=0)
                        self.assertEqual(sum(1 for a in out["actions"] if a != NO_LOOK), min(budget, env.n_looks))
                        self.assertAlmostEqual(out["return"], out["score_end"] - out["score_start"], places=12)

    def test_the_night_player_looks_at_night_and_spreads_its_looks_over_the_night_passes(self) -> None:
        env = _env(4)
        out = A.run_episode(env, A.NightLeastSureAgent(), seed=0)
        looked = [k for k, a in enumerate(out["actions"]) if a != NO_LOOK]
        night = [k for k in range(env.n_looks) if not env._looks[k].is_day]
        self.assertGreaterEqual(len(night), 4)
        self.assertTrue(set(looked) <= set(night))
        self.assertEqual(looked, [night[i] for i in L.evenly_spread(len(night), 4)])
        # with more budget than night passes it spreads over every look instead
        many = A.run_episode(_env(len(night) + 2), A.NightLeastSureAgent(), seed=0)
        self.assertEqual([k for k, a in enumerate(many["actions"]) if a != NO_LOOK], L.evenly_spread(env.n_looks, len(night) + 2))

    def test_players_that_do_not_say_when_spend_on_the_evenly_spread_looks(self) -> None:
        env = _env(4)
        want = L.evenly_spread(env.n_looks, 4)
        for agent in (A.LeastSureAgent(), A.ExpectedNewAgent(), A.ConstantTileAgent(3), LearnedPlayer(_tile_weights())):
            self.assertIsNone(getattr(agent, "looks_now", None), agent.name)
            out = A.run_episode(env, agent, seed=0)
            self.assertEqual([k for k, a in enumerate(out["actions"]) if a != NO_LOOK], want, agent.name)

    def test_the_look_score_is_read_from_the_observation_and_its_parts_add_up(self) -> None:
        env = _env(4)
        obs = env.reset()
        first = look_features(obs)
        self.assertEqual(first.shape, (len(LOOK_FEATURE_NAMES),))
        self.assertEqual(len(LOOK_FEATURES), len(LOOK_FEATURE_NAMES))
        col = {n: i for i, n in enumerate(LOOK_FEATURE_NAMES)}
        self.assertEqual(first[col["episode_share_done"]], 0.0)
        self.assertEqual(first[col["hours_from_previous_look"]], 1.0)             # no look before the first
        for _ in range(env.n_looks - 1):
            f = look_features(obs)
            self.assertTrue(np.all(np.isfinite(f)))
            self.assertEqual(f[col["day"]], 1.0 if obs.is_day else 0.0)
            self.assertAlmostEqual(f[col["pixel_area_km2"]], obs.pixel_km[0] * obs.pixel_km[1])
            np.testing.assert_array_equal(f, look_features(obs))                  # nothing else is read
            obs, _, _, _ = env.step(NO_LOOK)
        last = look_features(obs)
        self.assertEqual(last[col["episode_share_done"]], 1.0)
        self.assertEqual(last[col["hours_to_next_look"]], 1.0)
        lw, ls = _look_weights()
        player = LearnedPlayer(_tile_weights(), lw, [2.0] * len(lw))
        self.assertAlmostEqual(float(player.look_parts(obs).sum()), player.look_score(obs))
        self.assertAlmostEqual(player.look_score(obs), float(look_features(obs) / 2.0 @ np.asarray(lw)))
        with self.assertRaises(ValueError):
            LearnedPlayer(_tile_weights(), lw[:-1], ls[:-1])
        with self.assertRaises(ValueError):
            LearnedPlayer(_tile_weights(), lw, ls, look_feature_names=["other"] * len(lw))

    def test_a_policy_block_decides_whether_the_when_part_is_used(self) -> None:
        lw, ls = _look_weights()
        block = {"weights": _tile_weights(), "feature_names": list(FEATURE_NAMES),
                 "when": {"adopted": True, "weights": lw, "scales": ls, "feature_names": list(LOOK_FEATURE_NAMES)}}
        self.assertIsNotNone(getattr(policy_from(block), "looks_now", None))
        self.assertIsNone(getattr(policy_from(block, tiles_only=True), "looks_now", None))
        off = {**block, "when": {**block["when"], "adopted": False}}
        self.assertIsNone(getattr(policy_from(off), "looks_now", None))
        self.assertIsNone(getattr(policy_from({"weights": _tile_weights(), "feature_names": list(FEATURE_NAMES)}), "looks_now", None))
        # the tables list the tile choice apart when the look score is in use, and only then
        self.assertEqual([p.name for p in R.learned_players(block)], ["learned_tiles_only", "learned"])
        self.assertEqual([p.name for p in R.learned_players(off)], ["learned"])
        self.assertEqual(R.learned_players(None), [])

    def test_a_play_says_how_the_player_decided_when(self) -> None:
        lw, ls = _look_weights()
        for agent in (A.WhenUnsureAgent(), A.SharpLeastSureAgent(), LearnedPlayer(_tile_weights(), lw, ls)):
            play = play_steps(_env(4), agent)
            json.dumps(play)
            self.assertIn("chooses when to look", play["spending"])
            spent = [s for s in play["steps"] if s["spent"]]
            self.assertEqual(len(spent), 4)
            for s in play["steps"]:
                if s["budget_left"] <= 0:
                    self.assertIsNone(s["when"])
                    continue
                w = s["when"]
                self.assertEqual(w["looks"], s["spending_look"])
                self.assertEqual(w["stretch"], A.stretch_of(s["decision"], len(play["steps"]), 4))
                if w["bar"] is not None:
                    self.assertEqual(w["looks"], w["score"] >= w["bar"])
                if not s["spending_look"]:
                    self.assertEqual(s["why"], w["reason"])
                    self.assertIn(w["reason"], ("its score did not reach the bar", "it has looked in this stretch already",
                                                "the first look of the stretch: nothing to compare its score with"))
            # one look in each stretch
            self.assertEqual([s["when"]["stretch"] for s in spent], [0, 1, 2, 3])
            if agent.name == "learned":
                parts = spent[0]["when"]["score_parts"]
                self.assertEqual(parts["names"], list(LOOK_FEATURE_NAMES))
                self.assertAlmostEqual(sum(parts["parts"]), spent[0]["when"]["score"], places=5)
        night = play_steps(_env(4), A.NightLeastSureAgent())
        self.assertTrue(all(s["when"]["score"] is None for s in night["steps"] if s["when"]))
        self.assertTrue(all(not s["look"]["is_day"] for s in night["steps"] if s["spent"]))
        even = play_steps(_env(4), A.LeastSureAgent())
        self.assertTrue(all(s["when"] is None for s in even["steps"]))
        self.assertIn("spread evenly", even["spending"])
        for name in ("expected_new", "least_sure_at_night", "least_sure_when_unsure", "least_sure_when_sharp"):
            self.assertEqual(reference_player(name).name, name)

    def test_the_sharp_player_looks_at_the_smallest_pixel_it_can_tell_in_each_stretch(self) -> None:
        env = _env(4)
        play = play_steps(env, A.SharpLeastSureAgent())
        n = len(play["steps"])
        area = [s["look"]["pixel_km"][0] * s["look"]["pixel_km"][1] for s in play["steps"]]
        self.assertGreater(max(area) / min(area), 1.5)                           # the pass list gives real pixel sizes
        for s in play["steps"]:
            if not s["spent"]:
                continue
            k, w = s["decision"], s["when"]
            earlier = [area[j] for j in range(k) if A.stretch_of(j, n, 4) == w["stretch"]]
            if w["bar"] is not None:
                # it looked because this pass is in the sharper half of what its stretch had shown so far
                self.assertLessEqual(area[k], float(np.median(earlier + [area[k]])) + 1e-9)
            self.assertAlmostEqual(w["score"], -area[k], places=3)        # the play prints pixel sizes to three decimals

    def test_when_a_player_looks_does_not_depend_on_rows_it_was_not_shown(self) -> None:
        lw, ls = _look_weights()
        for make in (A.WhenUnsureAgent, A.SharpLeastSureAgent, lambda: LearnedPlayer(_tile_weights(), lw, ls)):
            play = play_steps(_env(4), make())
            shown = {(r[0], r[1], r[5], r[6]) for s in play["steps"] if s["revealed"] for r in s["revealed"]["rows"]}
            from backend.tests.test_env_play import _key, _without_scores

            unrevealed = DET.is_viirs & ~np.array([_key(DET, i) in shown for i in range(len(DET))])
            self.assertGreater(int(unrevealed.sum()), 100)
            bare = NextLookEnv(DET.select(~unrevealed), fx.TEST_BOX, WINDOW, tiles=(4, 4), budget=4, read_passes=fx.fixture_pass_reader())
            other = play_steps(bare, make())
            self.assertEqual(_without_scores(other), _without_scores(play))
            self.assertNotEqual(other["score_start"], play["score_start"])


def _reader(rows):
    def read(box, start, end, platforms=None):
        t0, t1 = parse_start_s(str(start)), parse_start_s(str(end))
        w, s, e, n = box
        return [dict(r) for r in rows if t0 <= parse_acq_time_s(r["acq_date"], r["acq_time"]) < t1
                and w <= float(r["longitude"]) <= e and s <= float(r["latitude"]) <= n]

    return read


class FittingPiecesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.eps = E.catalogue(_reader(ROWS), lambda r: fx.CONTEXT_BOX, PRESET_BY_ID, years=(2099,), regions=("plumas_ca",), min_modis_pixels=40)
        L._CONTEXT["plumas_ca"] = fx.CONTEXT_BOX
        cls.params = OccupancyParams().as_dict()
        cls.samples = L._collect((cls.eps[0], cls.params, {}, ("mix",), 0))
        cls.looks = L._collect_looks((cls.eps[0], cls.params, {}))

    def test_folds_keep_a_fire_season_together(self) -> None:
        from dataclasses import replace

        ep = self.eps[0]
        many = [replace(ep, year=y, region_id=r) for r in ("plumas_ca", "lytton_bc") for y in (2012, 2012, 2017, 2018, 2019, 2020)]
        folds = L.fold_of(many)
        self.assertEqual(len(folds), len(many))
        by = {}
        for e, f in zip(many, folds):
            by.setdefault((e.region_id, e.year), set()).add(f)
        self.assertTrue(all(len(v) == 1 for v in by.values()))
        self.assertEqual(len(set(folds)), L.FOLDS)

    def test_tile_samples_and_the_held_out_choice_of_the_ridge(self) -> None:
        self.assertEqual(len(self.samples), L.BUDGET)
        x, y, n = L.tile_training_set([self.samples, self.samples], [True, False])
        self.assertEqual((x.shape[1], y.size), (len(FEATURE_NAMES), x.shape[0]))
        self.assertLessEqual(n, L.BUDGET)
        self.assertLessEqual(float(np.abs(y).max()), 1.0 + 1e-12)                 # a tile's reward over the decision's largest
        self.assertEqual(L.tile_training_set([self.samples], [False])[2], 0)
        cv = L.choose_tile_ridge([self.samples, self.samples, self.samples], [0, 1, 2], grid=(0.1, 10.0))
        self.assertEqual([c["ridge"] for c in cv], [0.1, 10.0])
        for c in cv:
            self.assertEqual(c["decisions"], 3 * len(self.samples))
            self.assertLessEqual(c["one_look_reward"], max(float(g.max()) for _, g in self.samples) + 1e-12)
        w = np.zeros(len(FEATURE_NAMES))
        w[0] = 1.0
        got, best, m = L.one_look_reward(w, [self.samples], [True])
        self.assertEqual(m, len(self.samples))
        self.assertLessEqual(got, best + 1e-12)

    def test_look_values_and_the_look_weights(self) -> None:
        feats, values = self.looks
        self.assertEqual(feats.shape, (values.size, len(LOOK_FEATURE_NAMES)))
        self.assertGreater(values.size, L.BUDGET)
        self.assertGreater(float(values.max()), 0.0)
        x, y = L.look_training_set([self.looks], [True])
        np.testing.assert_allclose(x.mean(axis=0), 0.0, atol=1e-9)                # centred within the episode
        self.assertAlmostEqual(float(y.mean()), 0.0, places=12)
        w, scales = L.fit_look_weights([self.looks, self.looks], [True, True], 10.0)
        self.assertEqual((w.shape, scales.shape), ((len(LOOK_FEATURE_NAMES),), (len(LOOK_FEATURE_NAMES),)))
        self.assertTrue(np.all(scales > 0))
        cv = L.choose_look_ridge([self.looks, self.looks, self.looks], [0, 1, 2], grid=(10.0,))
        self.assertEqual(cv[0]["difference"]["episodes"], 3)
        self.assertLessEqual(cv[0]["sum_of_first_look_rewards"], float(np.sort(values)[::-1][: L.BUDGET].sum()) + 1e-12)
        # with a set of columns only those are fitted; every other weight is zero
        w2, _ = L.fit_look_weights([self.looks, self.looks], [True, True], 10.0, cols=[2, 8])
        self.assertEqual(sorted(np.flatnonzero(w2).tolist()), [2, 8])
        self.assertEqual(float(np.abs(L.fit_look_weights([self.looks], [True], 10.0, cols=[])[0]).sum()), 0.0)

    def test_a_look_feature_is_kept_only_if_it_helps_on_episodes_the_score_was_not_fitted_on(self) -> None:
        # three made-up rounds in which one feature alone says which looks pay: the selection keeps it and stops
        rng = np.random.default_rng(11)
        rounds = []
        for _ in range(6):
            feats = rng.normal(size=(16, len(LOOK_FEATURE_NAMES)))
            values = np.maximum(feats[:, 8], 0.0) * 0.01 + 0.0001           # column 8, the pixel area, decides
            rounds.append((feats, values))
        cols, steps = L.select_look_features(rounds, [0, 1, 2, 0, 1, 2])
        self.assertEqual(cols[0], 8)
        self.assertTrue(steps[0]["kept"])
        self.assertEqual(steps[0]["feature"], LOOK_FEATURE_NAMES[8])
        self.assertGreater(steps[0]["raised_it_by"], 0.0)
        self.assertFalse(steps[-1]["kept"])                                  # the step that ended it says why
        self.assertIn("raises the held-out figure by less than", steps[-1]["why"])
        self.assertLessEqual(len(cols), 3)
        # rounds in which nothing a player can read says anything: nothing is kept
        noise = [(rng.normal(size=(16, len(LOOK_FEATURE_NAMES))), np.full(16, 0.01)) for _ in range(6)]
        none, why = L.select_look_features(noise, [0, 1, 2, 0, 1, 2])
        self.assertEqual(none, [])
        self.assertFalse(why[0]["kept"])

    def test_a_closed_episode_is_refused_by_every_part_of_the_fitting(self) -> None:
        from dataclasses import replace

        closed = replace(self.eps[0], year=2021)
        for call, job in ((L._collect, (closed, self.params, {}, ("mix",), 0)), (L._collect_looks, (closed, self.params, {})),
                          (L._rollout, (closed, self.params, {}, ("least_sure",)))):
            with self.assertRaises(ValueError):
                call(job)

    def test_recording_a_fit_keeps_the_policy_it_replaces(self) -> None:
        lw, ls = _look_weights()
        result = {"what": "a fit", "policy": {"weights": _tile_weights(), "feature_names": list(FEATURE_NAMES),
                                               "when": {"adopted": True, "weights": lw, "scales": ls, "feature_names": list(LOOK_FEATURE_NAMES)}}}
        tracked = {"what": "x", "setting": {}, "protocol": {"fitted_under": 1}, "reconstruction_parameters": "earlier",
                   "policy": {"weights": [0.5] * len(FEATURE_NAMES), "feature_names": list(FEATURE_NAMES)}, "test": {"episodes": 22}}
        with tempfile.TemporaryDirectory() as tmp:
            target, source = Path(tmp) / "next_look.json", Path(tmp) / "fit.json"
            source.write_text(json.dumps(result), encoding="utf-8")
            with mock.patch.object(L, "FITTED_FILE", target), mock.patch.object(L, "load_fitted", lambda: json.loads(json.dumps(tracked))):
                L.record(str(source))
            out = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(out["policy"], result["policy"])
            self.assertEqual(out["policy_first"]["weights"], [0.5] * len(FEATURE_NAMES))
            self.assertEqual((out["policy_first"]["protocol"], out["policy_first"]["reconstruction_parameters"]), ({"fitted_under": 1}, "earlier"))
            self.assertIn("not in use", out["policy_first"]["note"])
            self.assertEqual(out["policy_fit"], {"what": "a fit"})
            self.assertEqual(out["test"], {"episodes": 22})                        # the tables on record are not touched
            self.assertEqual(list(out)[:6], ["what", "layout", "setting", "protocol", "reconstruction_parameters", "policy"])
            self.assertEqual(out["layout"], L.LAYOUT)
            # recording again replaces the policy and keeps the first one
            with mock.patch.object(L, "FITTED_FILE", target), mock.patch.object(L, "load_fitted", lambda: json.loads(target.read_text(encoding="utf-8"))):
                L.record(str(source))
            again = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(again["policy_first"], out["policy_first"])
            self.assertEqual(list(again), list(out))

    def test_a_table_on_nominal_looks_is_kept_when_one_on_the_pass_list_replaces_it(self) -> None:
        tracked = {"validation_reference": {"schedule": "nominal", "tiles": "4x4"}}
        R.record_table(tracked, {"schedule": "cmr", "tiles": "4x4"})
        self.assertEqual(tracked["validation_reference"]["schedule"], "cmr")
        self.assertEqual(tracked["validation_reference_on_nominal_looks"]["schedule"], "nominal")
        self.assertIn("before the pass list became the default", tracked["validation_reference_on_nominal_looks"]["note"])
        R.record_table(tracked, {"schedule": "cmr", "tiles": "4x4", "again": True})
        self.assertEqual(tracked["validation_reference_on_nominal_looks"]["schedule"], "nominal")


class TrackedPolicyTests(unittest.TestCase):
    """The learned player in backend/env/fitted/next_look.json: what it says of itself must follow from its own
    numbers, and the tables that were played with the policy it replaced must still have that policy beside them."""

    @classmethod
    def setUpClass(cls) -> None:
        from backend.env.policy import load_fitted

        cls.doc = load_fitted()
        cls.policy = cls.doc["policy"]

    def test_the_policy_was_fitted_with_the_reward_and_the_looks_in_use(self) -> None:
        from backend.env.next_look import REWARD

        fitted = self.policy["fitted_with"]
        self.assertEqual(fitted["reward"], REWARD)
        self.assertEqual(fitted["looks"], "cmr")
        self.assertEqual(self.policy["feature_names"], list(FEATURE_NAMES))
        self.assertEqual(len(self.policy["weights"]), len(FEATURE_NAMES))
        when = self.policy["when"]
        self.assertEqual(when["feature_names"], list(LOOK_FEATURE_NAMES))
        self.assertEqual((len(when["weights"]), len(when["scales"])), (len(LOOK_FEATURE_NAMES), len(LOOK_FEATURE_NAMES)))
        fit = self.doc["policy_fit"]
        self.assertNotIn("trial_run", fit)
        self.assertEqual(fit["episodes"]["test"], "closed and not played")
        self.assertGreater(fit["episodes"]["train"], 50)
        self.assertGreater(fit["episodes"]["validation_not_played_here"], 0)

    def test_each_ridge_strength_is_the_one_that_did_best_with_fires_held_out(self) -> None:
        tried = self.policy["ridge_chosen_with_fires_held_out"]
        self.assertEqual(self.policy["ridge"], max(tried, key=lambda c: c["one_look_reward"])["ridge"])
        tried = self.policy["when"]["ridge_chosen_with_fires_held_out"]
        self.assertEqual(self.policy["when"]["ridge"], max(tried, key=lambda c: c["sum_of_first_look_rewards"])["ridge"])

    def test_the_when_part_is_used_only_if_it_gained_on_training_fires_it_was_not_fitted_on(self) -> None:
        from backend.env.policy import load_policy

        d = self.policy["on_training_fires_held_out"]["differences"]["learned_with_when_minus_learned_tiles_only"]
        self.assertEqual(self.policy["when"]["adopted"], d["p05"] > 0)
        player = load_policy()
        self.assertEqual(player.name, "learned")
        self.assertEqual(getattr(player, "looks_now", None) is not None, self.policy["when"]["adopted"])
        env = _env(4)
        out = A.run_episode(env, player, seed=0)
        self.assertEqual(sum(1 for a in out["actions"] if a != NO_LOOK), 4)

    def test_the_first_policy_is_kept_beside_the_tables_that_were_played_with_it(self) -> None:
        first = self.doc["policy_first"]
        self.assertIn("not in use", first["note"])
        self.assertEqual(first["protocol"]["fitted_under"], 1)
        self.assertEqual(len(first["weights"]), len(FEATURE_NAMES))
        self.assertNotEqual(first["weights"], self.policy["weights"])
        for key in self.doc["rewards"]["tables_on_record"]:
            self.assertIn(key, self.doc)                                  # the tables on record are still there
        # the file says what each of its blocks is, and names no block it does not hold
        for names in self.doc["layout"]:
            for key in names.split(", "):
                self.assertIn(key, self.doc, key)

    def test_the_validation_table_was_measured_on_the_pass_list_with_this_policy(self) -> None:
        ref = self.doc["validation_reference"]
        self.assertEqual(ref["schedule"], "cmr")
        self.assertEqual(ref["learned"]["chooses_when_to_look"], self.policy["when"]["adopted"])
        self.assertEqual(ref["learned"]["fitted_with"], self.policy["fitted_with"])
        self.assertIn("once", ref["learned"]["played_here"])
        self.assertIn("learned", ref["agents"])
        self.assertEqual("learned_tiles_only" in ref["agents"], self.policy["when"]["adopted"])
        for name in ("least_sure_at_night", "least_sure_when_unsure", "least_sure_when_sharp"):
            self.assertIn(name, ref["agents"])
        # the table measured before, on nominal looks with the first policy, is kept beside it
        self.assertEqual(self.doc["validation_reference_on_nominal_looks"]["schedule"], "nominal")
        # what the table says of the learned player follows from its interval
        d = ref["differences"]["learned_minus_least_sure"]
        want = "gains more than" if d["p05"] > 0 else "gains less than" if d["p95"] < 0 else "does not differ from"
        self.assertTrue(any(s.startswith(f"the learned player {want} least sure by more than the noise") for s in ref["plainly"]))


if __name__ == "__main__":
    unittest.main()
