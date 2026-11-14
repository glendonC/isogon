"""Fitted values and the episodes they were fitted on (backend/model/fitted.py, episodes.py, training.py)."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.model import fitted  # noqa: E402
from backend.model.episodes import tiles  # noqa: E402
from backend.model.occupancy import OccupancyParams  # noqa: E402
from backend.model.training import EXCLUSIONS, TRAINING_YEARS, VALIDATION_YEARS  # noqa: E402
from backend.terrain.live_region import PRESET_BY_ID  # noqa: E402

TEST_WINDOWS = {"plumas_ca": "2021-07", "lytton_bc": "2021-06", "evia_greece": "2021-08"}


class TrackedFitTests(unittest.TestCase):
    """The tracked files must say what they were fitted on and must not have seen a test fire."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.params = json.loads((fitted.FITTED_DIR / fitted.PARAMS_FILE).read_text(encoding="utf-8"))
        cls.ratio = json.loads((fitted.FITTED_DIR / fitted.RATIO_FILE).read_text(encoding="utf-8"))

    def test_files_state_training_validation_rule_and_decision(self) -> None:
        d = self.params
        for key in ("adopted", "decision", "rule", "parameters", "priors", "trained_on", "validated_on", "parts", "evidence", "first_rule_outcome"):
            self.assertIn(key, d)
        self.assertIsInstance(d["adopted"], bool)
        for part in d["parts"].values():
            self.assertIn(part["status"], ("on", "experimental"))
            for row in part["scores"].values():
                self.assertIn(row["class"], ("ahead", "tie", "behind"))
                self.assertIn("painted_modis", row)
                self.assertIn("overlap_ratio", row)
        self.assertIn("test fires excluded", self.ratio["fit"]["trained_on"])

    def test_a_part_is_on_only_when_every_score_of_it_is_ahead(self) -> None:
        for part in self.params["parts"].values():
            every_ahead = all(row["class"] == "ahead" for row in part["scores"].values())
            holds = part.get("interval_holds", True)
            if part["status"] == "on":
                self.assertTrue(every_ahead and holds)
                self.assertTrue(self.params["adopted"])
            elif self.params["adopted"]:
                self.assertFalse(every_ahead and holds)

    def test_the_values_were_fitted_and_validated_under_the_protocol_the_blind_test_runs(self) -> None:
        from backend.eval.blind_test import PROTOCOL_PASS_LIST as PROTOCOL

        d = self.params
        self.assertEqual(d["protocol"]["validated_under"], PROTOCOL["version"])
        self.assertEqual(d["protocol"]["parameters_fitted_under"], PROTOCOL["version"])
        # every decision before this one is kept, the latest first, each under an earlier protocol
        earlier = [d["previous_decision"]] + d["earlier_decisions"]
        self.assertEqual([e["protocol"][:9] for e in earlier], ["version 2", "version 1"])
        for e in earlier:
            self.assertIn("classes", e)
            self.assertEqual(set(e["parts"].values()) - {"on", "experimental"}, set())
        self.assertIn("parameters", d["previous_decision"])       # the values that were replaced
        # the search starts from the priors and its record is of this fit
        self.assertEqual(d["search"]["history"][0]["step"], "priors")
        self.assertEqual(len(d["evidence"]["training_episodes"]), 22)
        self.assertIn("22 real fire episodes", d["trained_on"])

    def test_intervals_count_the_looks_that_flagged_nothing(self) -> None:
        import numpy as np

        from backend.model.fit_real import _interval, _ratios

        d, prm = self.params, self.params["parameters"]
        iv = d["intervals"]
        self.assertEqual((prm["frp_interval_lo"], prm["frp_interval_hi"]), (iv["frp"]["lo"], iv["frp"]["hi"]))
        self.assertEqual((prm["pixel_interval_lo"], prm["pixel_interval_hi"]), (iv["pixels"]["lo"], iv["pixels"]["hi"]))
        # more than one training look in twenty flagged nothing, so the stated interval starts at zero
        self.assertGreater(iv["frp"]["looks_that_flagged_nothing"] / iv["frp"]["looks"], 0.05)
        self.assertEqual(iv["frp"]["lo"], 0.0)
        self.assertGreater(iv["frp"]["given_a_detection"][0], 0.0)
        # the rule itself, on made-up ratios
        few = _interval(np.array([0.0] + [0.5 + 0.01 * k for k in range(99)]))        # one look in a hundred is empty
        self.assertGreater(few["lo"], 0.0)
        many = _interval(np.array([0.0] * 10 + [0.5 + 0.01 * k for k in range(90)]))  # one in ten
        self.assertEqual((many["lo"], many["looks_that_flagged_nothing"]), (0.0, 10))
        self.assertGreater(many["given_a_detection"][0], 0.5)
        reps = [{"methods": {"reconstruction": {"per_overpass": [{"predicted_frp_mw": 10.0}, {"predicted_frp_mw": 0.0}, {"predicted_frp_mw": 4.0}]}},
                 "targets": [{"hidden_frp_mw": 0.0}, {"hidden_frp_mw": 3.0}, {"hidden_frp_mw": 8.0}]}]
        self.assertEqual(_ratios(reps, "predicted_frp_mw", "hidden_frp_mw").tolist(), [0.0, 2.0])   # no prediction, no ratio

    def test_the_stated_interval_is_one_sided_and_holds_about_what_it_states(self) -> None:
        """An interval that starts at zero cuts nothing off below, so its upper end is the 90th percentile of the
        training ratios, not the 95th. The interval it replaces is kept beside it with what it held."""
        from backend.eval import metrics as M

        d, prm = self.params, self.params["parameters"]
        iv = d["intervals"]
        self.assertEqual(iv["rule"], M.STATED_INTERVAL_RULE)
        for part in ("frp", "pixels"):
            self.assertEqual(iv[part]["one_sided"], iv[part]["lo"] == 0.0)
        self.assertTrue(iv["frp"]["one_sided"])
        # the interval it replaces: the same lower end, a higher upper end, and more held than was stated
        was = iv["before"]
        self.assertEqual(was["frp"]["lo"], 0.0)
        self.assertGreater(was["frp"]["hi"], iv["frp"]["hi"])
        self.assertIn("95th percentile", was["note"])
        now = d["evidence"]["validation_fitted"]["methods"]["reconstruction"]["interval"]
        then = was["held_on_validation"]["frp"]
        self.assertEqual((now["n"], now["stated_level"]), (then["n"], 0.9))
        self.assertLess(now["covered"], then["covered"])
        self.assertLess(abs(now["coverage"] - 0.9), abs(then["coverage"] - 0.9))          # nearer to what is stated
        self.assertEqual(d["evidence"]["validation_fitted"]["verdict"]["interval"]["observed_coverage"], now["coverage"])
        # no window of the year of the test fires was scored for it
        on = iv["fitted_on"]
        self.assertNotIn(2021, on["years"])
        self.assertLess(on["episodes"], len(d["evidence"]["training_episodes"]))
        self.assertIn("2021", on["left_out"])
        # nothing else moved: every score of the validation is the one the decision was made on
        self.assertTrue(iv["scores_unchanged"])
        self.assertEqual(d["parts"]["total fire radiative power and its interval"]["interval_holds"], now["coverage"] >= 0.8)

    def test_no_episode_is_a_test_fire(self) -> None:
        ev = self.params["evidence"]
        years_train = {e["year"] for e in ev["training_episodes"]}
        years_val = {e["year"] for e in ev["validation_episodes"]}
        self.assertTrue(years_train <= set(TRAINING_YEARS) | {2021})
        self.assertTrue(years_val <= set(VALIDATION_YEARS))
        self.assertFalse(years_train & years_val)
        for e in ev["training_episodes"] + ev["validation_episodes"]:
            if e["year"] != 2021:
                continue
            first, after, margin = EXCLUSIONS[e["region_id"]]
            start = e["first_overpass_utc"][:10]
            if margin is None:
                self.assertLess(start, first)                 # Plumas: nothing from July 2021 on
            else:
                # Lytton and Evia: never the test box tile during the exclusion
                self.assertNotEqual(tuple(e["tile"]), (2, 2), e)

    def test_episode_tiles_split_the_context_box_and_the_centre_is_the_test_box(self) -> None:
        b = PRESET_BY_ID["lytton_bc"].bbox
        w, s, e, n = b.west, b.south, b.east, b.north
        dx, dy = e - w, n - s
        ctx = (w - 2 * dx, s - 2 * dy, e + 2 * dx, n + 2 * dy)
        t = dict(tiles(ctx))
        self.assertEqual(len(t), 25)
        for got, want in zip(t[(2, 2)], (w, s, e, n)):
            self.assertAlmostEqual(got, want, places=9)


class LoaderTests(unittest.TestCase):
    def _with(self, doc: dict | None):
        tmp = tempfile.TemporaryDirectory()
        if doc is not None:
            (Path(tmp.name) / fitted.PARAMS_FILE).write_text(json.dumps(doc), encoding="utf-8")
        return tmp

    def test_fitted_values_are_used_only_when_adopted(self) -> None:
        base = {"parameters": {**OccupancyParams().as_dict(), "tau_res_h": 7.0, "fitted_on": "a test"}, "parts": {}, "decision": "x"}
        for adopted, want in ((True, 7.0), (False, OccupancyParams().tau_res_h)):
            tmp = self._with({**base, "adopted": adopted})
            with mock.patch.object(fitted, "FITTED_DIR", Path(tmp.name)):
                self.assertEqual(fitted.load_params().tau_res_h, want)
                parts = fitted.learned_parts()
                self.assertIn("in use" if adopted else "not in use", parts[0]["status"])
            tmp.cleanup()
        tmp = self._with(None)
        with mock.patch.object(fitted, "FITTED_DIR", Path(tmp.name)):
            self.assertEqual(fitted.load_params(), OccupancyParams())
            self.assertEqual(fitted.learned_parts()[0]["status"], "not learned")
            self.assertIsNone(fitted.load_ratio_fit())
        tmp.cleanup()

    def test_parts_not_adopted_are_reported_experimental(self) -> None:
        doc = {"adopted": False, "decision": "no", "parameters": OccupancyParams().as_dict(),
               "parts": {"where the fire is": {"status": "on", "scores": {}}}}
        tmp = self._with(doc)
        with mock.patch.object(fitted, "FITTED_DIR", Path(tmp.name)):
            parts = fitted.learned_parts()
        tmp.cleanup()
        self.assertEqual(parts[1]["status"], "experimental")


if __name__ == "__main__":
    unittest.main()
