"""The learned policy's features, the ridge fit, and learning from looks (backend/env), on SYNTHETIC episodes."""

from __future__ import annotations

from dataclasses import fields, replace
from pathlib import Path
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.env import episodes as E  # noqa: E402
from backend.env import learn as L  # noqa: E402
from backend.env.next_look import NO_LOOK, NextLookEnv, Observation  # noqa: E402
from backend.env.policy import FEATURE_NAMES, FEATURES, LinearPolicyAgent, fit_ridge, tile_features  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.rows import detections_from_rows, parse_acq_time_s, read_csv_rows  # noqa: E402
from backend.model.occupancy import OccupancyParams, look_count_factor, rescale_probability  # noqa: E402
from backend.model.real_run import parse_start_s  # noqa: E402
from backend.terrain.live_region import PRESET_BY_ID  # noqa: E402

ROWS = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)


def _env(**kw) -> NextLookEnv:
    det = detections_from_rows(ROWS, fx.SOURCE_LABEL)
    window = (float(det.time_s.min()), float(det.time_s.max()) + 1.0)
    return NextLookEnv(det, fx.TEST_BOX, window, tiles=(4, 4), budget=3, **kw)


def _reader(rows):
    def read(box, start, end, platforms=None):
        t0, t1 = parse_start_s(str(start)), parse_start_s(str(end))
        w, s, e, n = box
        return [dict(r) for r in rows if t0 <= parse_acq_time_s(r["acq_date"], r["acq_time"]) < t1
                and w <= float(r["longitude"]) <= e and s <= float(r["latitude"]) <= n]

    return read


class FeatureAndPolicyTests(unittest.TestCase):
    def test_features_come_from_the_observation_and_have_one_row_per_tile(self) -> None:
        env = _env(terrain_m=np.add.outer(np.arange(113.0), np.arange(118.0)))
        obs = env.reset()
        for _ in range(5):
            obs, _, _, _ = env.step(NO_LOOK)
        f = tile_features(obs, env)
        self.assertEqual(f.shape, (16, len(FEATURE_NAMES)))
        self.assertEqual(len(FEATURES), len(FEATURE_NAMES))
        self.assertTrue(np.all(np.isfinite(f)))
        col = {n: i for i, n in enumerate(FEATURE_NAMES)}
        self.assertAlmostEqual(float(f[:, col["unsure"]].max()), 1.0)             # rescaled: the largest tile is 1
        self.assertGreater(float(f[:, col["relief"]].max()), 0.0)                 # terrain was given
        self.assertEqual(float(f[:, col["seen_before"]].sum()), 0.0)              # nothing looked at yet
        day = 1.0 if obs.is_day else 0.0
        np.testing.assert_allclose(f[:, col["unsure_by_day"]], f[:, col["unsure"]] * day)
        # the same observation gives the same features: nothing else is read
        np.testing.assert_array_equal(f, tile_features(obs, env))

    def test_a_look_marks_its_tile_as_seen(self) -> None:
        env = _env()
        env.reset()
        obs, _, _, _ = env.step(5)
        f = tile_features(obs, env)
        col = FEATURE_NAMES.index("seen_before")
        self.assertGreater(float(f[5, col]), 0.0)
        self.assertEqual(float(np.delete(f[:, col], 5).sum()), 0.0)

    def test_policy_looks_at_the_highest_scoring_tile(self) -> None:
        env = _env()
        obs = env.reset()
        w = np.zeros(len(FEATURE_NAMES))
        w[FEATURE_NAMES.index("modis_recent_frp")] = 1.0
        agent = LinearPolicyAgent(w)
        want = int(np.argmax(tile_features(obs, env)[:, FEATURE_NAMES.index("modis_recent_frp")]))
        self.assertEqual(agent.choose(obs, env), want)
        with self.assertRaises(ValueError):
            LinearPolicyAgent(w[:-1])
        with self.assertRaises(ValueError):
            LinearPolicyAgent(w, feature_names=["other"] * len(FEATURE_NAMES))

    def test_ridge_recovers_weights_and_shrinks_with_strength(self) -> None:
        rng = np.random.default_rng(0)
        x = rng.normal(size=(400, 5))
        true = np.array([1.0, -2.0, 0.0, 0.5, 3.0])
        y = x @ true
        np.testing.assert_allclose(fit_ridge(x, y, 1e-9), true, atol=1e-6)
        self.assertLess(float(np.linalg.norm(fit_ridge(x, y, 1e4))), float(np.linalg.norm(true)))


class LearnFromLooksTests(unittest.TestCase):
    def test_the_count_factor_is_shrunk_toward_one(self) -> None:
        self.assertEqual(look_count_factor(0.0, 0.0, 40.0), 1.0)
        self.assertAlmostEqual(look_count_factor(100.0, 50.0, 0.0), 2.0)
        self.assertAlmostEqual(look_count_factor(100.0, 50.0, 50.0), 1.5)
        self.assertEqual(look_count_factor(1e6, 1.0, 1.0), 5.0)                  # kept within 0.2 to 5
        p = np.array([0.0, 0.1, 0.5, 1.0])
        np.testing.assert_allclose(rescale_probability(p, 1.0), p)
        up = rescale_probability(p, 2.0)
        self.assertTrue(np.all((up >= p) & (up <= 1.0)))
        self.assertAlmostEqual(float(up[1]), 1.0 - 0.9 ** 2)

    def test_a_round_cannot_be_built_with_teaching_on(self) -> None:
        """Teaching counts an empty look as one that saw its tile, which the reward in use does not allow. The
        look factors it would use can still be read; a round with it is refused."""
        with self.assertRaises(ValueError):
            _env(learn_from_looks=True, prior_cells=5.0)
        plain = _env(prior_cells=5.0)
        plain.reset()
        tile = int(np.argmax(plain.hidden_pixels_per_tile()))
        f = plain.look_factors([(0, tile)])
        self.assertNotEqual(f["night"] if not plain._looks[0].is_day else f["day"], 1.0)
        self.assertIsNone(plain.step(tile)[3]["look_factors"])                   # and a round does not use them

    def test_the_look_factors_read_hidden_detections_only_inside_revealed_tiles(self) -> None:
        det = detections_from_rows(ROWS, fx.SOURCE_LABEL)
        base = _env(prior_cells=5.0)
        base.reset()
        tile = int(np.argmax(base.hidden_pixels_per_tile()))
        keep = np.zeros(len(det), dtype=bool)
        viirs_pos = np.flatnonzero(det.is_viirs)
        keep[viirs_pos[base._look_rows[0][np.isin(base._pixel_tile[0], [tile])]]] = True
        change = det.is_viirs & ~keep
        altered = replace(det, frp_mw=np.where(change, det.frp_mw * 9.0, det.frp_mw), lat=np.where(change, det.lat + 0.004, det.lat))
        window = (float(det.time_s.min()), float(det.time_s.max()) + 1.0)
        other = NextLookEnv(altered, fx.TEST_BOX, window, tiles=(4, 4), budget=3, prior_cells=5.0)
        other.reset()
        self.assertEqual(base.look_factors([(0, tile)]), other.look_factors([(0, tile)]))
        o1, _, _, i1 = base.step(tile)
        o2, _, _, i2 = other.step(tile)
        self.assertEqual(i1["look_factors"], i2["look_factors"])
        for f in fields(Observation):
            x, y = getattr(o1, f.name), getattr(o2, f.name)
            self.assertTrue(np.array_equal(x, y) if isinstance(x, np.ndarray) else x == y, f.name)


class LearnPipelineTests(unittest.TestCase):
    def test_collecting_and_rolling_out_on_a_synthetic_episode(self) -> None:
        eps = E.catalogue(_reader(ROWS), lambda r: fx.CONTEXT_BOX, PRESET_BY_ID, years=(2099,), regions=("plumas_ca",), min_modis_pixels=40)
        self.assertEqual(len(eps), 1)
        L._CONTEXT["plumas_ca"] = fx.CONTEXT_BOX
        params = OccupancyParams().as_dict()
        samples = L._collect((eps[0], params, {}, ("mix",), 0))
        self.assertEqual(len(samples), L.BUDGET)
        for feats, gains in samples:
            self.assertEqual(feats.shape, (L.TILES * L.TILES, len(FEATURE_NAMES)))
            self.assertEqual(gains.shape, (L.TILES * L.TILES,))
        w = fit_ridge(np.vstack([f for f, _ in samples]), np.concatenate([g for _, g in samples]), 1.0)
        out = L._rollout((eps[0], params, {}, ("linear", [float(v) for v in w])))
        self.assertEqual(out["agent"], "linear")
        self.assertTrue(np.isfinite(out["gain"]))
        oracle = L._rollout((eps[0], params, {}, ("oracle",)))
        rand = L._rollout((eps[0], params, {}, ("random", 3)))
        self.assertEqual(oracle["start"], rand["start"])
        b = L.paired_bootstrap([0.3, 0.2, 0.4, 0.5], [0.1, 0.1, 0.1, 0.1], n_boot=500)
        self.assertGreater(b["p05"], 0.0)
        self.assertEqual((b["episodes"], b["episodes_a_ahead"]), (4, 4))


class TrackedResultTests(unittest.TestCase):
    """backend/env/fitted/next_look.json must say what it is and its sentences must follow from its own numbers."""

    @classmethod
    def setUpClass(cls) -> None:
        from backend.env.policy import load_fitted

        cls.doc = load_fitted()

    def test_file_states_setting_splits_limits_and_both_decisions(self) -> None:
        d = self.doc
        self.assertIsNotNone(d)
        for key in ("known_limits", "setting", "episodes", "learn_from_looks", "policy", "test"):
            self.assertIn(key, d)
        self.assertIn("cloud is unknown", d["known_limits"])
        self.assertEqual(d["episodes"]["test"], "the three 2021 fires, played once")
        self.assertEqual(d["policy"]["feature_names"], list(FEATURE_NAMES))
        self.assertEqual(len(d["policy"]["weights"]), len(FEATURE_NAMES))
        self.assertEqual(set(d["test"]["agents"]), {"random", "latest_modis", "least_sure", "learned", "oracle"})

    def test_the_plain_sentence_follows_from_the_interval(self) -> None:
        b = self.doc["test"]["learned_minus_least_sure"]
        said = self.doc["test"]["plainly"]
        if b["p05"] > 0:
            self.assertIn("beats least sure", said)
        elif b["p95"] < 0:
            self.assertIn("behind least sure", said)
        else:
            self.assertIn("does not differ", said)

    def test_the_table_measured_again_under_the_fixed_protocol_is_kept_beside_the_first(self) -> None:
        d = self.doc
        self.assertEqual(d["protocol"]["fitted_under"], 1)                  # the weights were not refitted
        t = d["test_protocol_2"]
        self.assertIn("protocol correction", t["note"])
        self.assertIn("nominal half-day slots", t["known_limits"])
        self.assertEqual(set(t["agents"]), {"random", "latest_modis", "least_sure", "linear", "oracle"})
        self.assertEqual(t["catalogue"]["fit"] + t["catalogue"]["test"], t["catalogue"]["episodes"])
        b, said = t["learned_minus_least_sure"], t["plainly"]
        if b["p05"] > 0:
            self.assertIn("beats least sure", said)
        elif b["p95"] < 0:
            self.assertIn("behind least sure", said)
        else:
            self.assertIn("does not differ", said)

    def test_the_model_change_is_used_only_if_validation_adopted_it(self) -> None:
        from backend.env.policy import env_settings, load_policy

        teach = self.doc["learn_from_looks"]
        self.assertEqual(teach["adopted"], teach["validation"]["oracle_on_minus_off"]["p05"] > 0)
        self.assertEqual(env_settings().get("learn_from_looks", False), teach["adopted"])
        agent = load_policy()
        self.assertEqual(agent.name, "learned")
        env = _env(**env_settings())
        obs = env.reset()
        self.assertTrue(0 <= agent.choose(obs, env) < 16)


if __name__ == "__main__":
    unittest.main()
