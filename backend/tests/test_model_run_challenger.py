"""The switch by which a held-out run answers its held-out passes with the default challenger. On the SYNTHETIC fixture.

Off (the default), a run is exactly what it was. On, the held-out passes and their declared cells are the
challenger's, the estimate in use is scored beside it, and everything outside the scorer's keys is still the same
whatever the hidden rows hold. A run with every satellite shown is never touched.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import unittest
from unittest import mock

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.baselines import fit_overlap_ratio  # noqa: E402
from backend.eval.rows import detections_from_rows  # noqa: E402
from backend.model import real_run as RR  # noqa: E402
from backend.model.occupancy import OccupancyParams  # noqa: E402
from backend.tests.test_model_hidden_rows import (  # noqa: E402
    BASE, CASES, ROWS6, SOURCE, _Ratio, _reader, _terrain, _without_the_scorer,
)


def _solve(rows, estimate=None, holdout=True, read_passes=None):
    fit = fit_overlap_ratio(detections_from_rows(BASE, SOURCE), trained_on="the synthetic fixture (test only)")
    return RR.solve_real_reconstruction(
        _terrain(), "2099-07-01", holdout_viirs=holdout, read_firms=_reader(rows), context_box=fx.CONTEXT_BOX,
        ratio_fit=fit, row_source=SOURCE, params=OccupancyParams(),
        learned_parts=[{"name": "reconstruction parameters", "status": "not learned"}], count_ratio=_Ratio(),
        read_passes=read_passes or fx.fixture_pass_reader(), estimate=estimate,
    )


class SwitchOffTests(unittest.TestCase):
    def test_off_by_default_a_run_is_what_it_was(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop(RR.RUN_ESTIMATE_ENV, None)
            self.assertEqual(RR.run_estimate(), RR.ESTIMATE_IN_USE)
            plain = _solve(ROWS6)
        named = _solve(ROWS6, estimate=RR.ESTIMATE_IN_USE)
        self.assertEqual(_without_the_scorer(plain), _without_the_scorer(named))
        self.assertEqual(plain.reconstruction_u8_bytes, named.reconstruction_u8_bytes)
        self.assertNotIn("held_out_passes_estimated_by", plain.extras["model"])
        self.assertEqual(plain.extras["blind_test"]["verdict"]["method"], "reconstruction")
        self.assertEqual(plain.extras["held_out_passes_answered_by"]["words"], "the estimate in use")

    def test_a_value_that_is_neither_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            RR.run_estimate("something else")
        with mock.patch.dict(os.environ, {RR.RUN_ESTIMATE_ENV: "challenger"}):
            self.assertEqual(RR.run_estimate(), RR.ESTIMATE_CHALLENGER)


class SwitchOnTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.on = _solve(ROWS6, estimate=RR.ESTIMATE_CHALLENGER)
        cls.off = _solve(ROWS6)
        cls.name = cls.on.extras["model"]["held_out_passes_estimated_by"]["method"]

    def test_the_held_out_passes_and_their_cells_are_the_challenger_s_and_the_estimate_in_use_is_scored_beside(self) -> None:
        bt = self.on.extras["blind_test"]
        self.assertTrue(self.name.startswith("challenger_"))
        self.assertEqual(bt["verdict"]["method"], self.name)
        self.assertIn("reconstruction", bt["methods"])
        self.assertIn(self.name, bt["methods"])
        declared = self.on.extras["declared_cells"]
        self.assertEqual(declared["method"], self.name)
        published = bt["published"][self.name]
        self.assertGreater(len(declared["looks"]), 0)
        self.assertEqual([look["cells_sha256"] for look in declared["looks"]], [e["cells_sha256"] for e in published])
        # and they are not the estimate in use's cells
        self.assertNotEqual([e["cells_sha256"] for e in published],
                            [e["cells_sha256"] for e in bt["published"]["reconstruction"]])

    def test_only_the_held_out_frames_change_and_each_says_who_answered_it(self) -> None:
        on, off = self.on.observer_passes["frames"], self.off.observer_passes["frames"]
        self.assertEqual(len(on), len(off))
        held = [k for k, f in enumerate(on) if f["held_out"]]
        self.assertGreater(len(held), 0)
        for k, (a, b) in enumerate(zip(on, off)):
            self.assertEqual(a["estimate_from"], self.name if a["held_out"] else "reconstruction")
            if not a["held_out"]:
                self.assertEqual({x: y for x, y in a.items() if x != "estimate_from"}, b)
        self.assertEqual(self.on.belief_u8_bytes, self.off.belief_u8_bytes)
        # the exports are the estimate in use's; only the run's id in them differs
        self.assertEqual(self.on.export_geojson_bytes.replace(self.on.run_id.encode(), self.off.run_id.encode()),
                         self.off.export_geojson_bytes)

    def test_on_the_run_is_still_blind_to_the_hidden_rows(self) -> None:
        want = _without_the_scorer(self.on)
        for case, rows in CASES.items():
            got = _solve(rows, estimate=RR.ESTIMATE_CHALLENGER)
            self.assertEqual(_without_the_scorer(got), want, case)
            self.assertEqual(got.reconstruction_u8_bytes, self.on.reconstruction_u8_bytes, case)

    def test_the_answer_names_in_one_field_which_estimate_answered_the_held_out_passes(self) -> None:
        from backend.model.real_run import real_response

        field = real_response(self.on, {})["held_out_passes_answered_by"]
        self.assertEqual(field["method"], self.name)
        self.assertTrue(field["words"].startswith("a challenger model ("))
        self.assertEqual(real_response(self.off, {})["held_out_passes_answered_by"]["method"], "reconstruction")
        for cp in (0x2014, 0x2013, 0x00B7):
            self.assertNotIn(chr(cp), field["words"] + field["the_rest"])

    def test_a_blend_is_named_by_the_models_it_gives_weight_to(self) -> None:
        from backend.model.challenger import FITTED_DIR, VARIANT_FILES

        weights = json.loads((FITTED_DIR / VARIANT_FILES["blend"]).read_text())["stacker"]["weights"]
        words = RR.challenger_words("blend")
        self.assertTrue(words.startswith("a blend of "))
        for variant, w in zip(RR.BLEND_ORDER, weights):
            self.assertEqual(RR.CHALLENGER_WORDS[variant] in words, float(w) != 0.0, (variant, w, words))
        self.assertEqual(RR.challenger_words("gbdt"), "boosted decision trees")
        self.assertEqual(words.count(" and "), 1)

    def test_the_answer_says_beside_it_what_the_fire_is_to_the_challenger_and_only_when_it_answers(self) -> None:
        from backend.model.challenger_standing import challenger_standing
        from backend.model.real_run import real_response

        got = real_response(self.on, {})["standing_to_the_answering_estimate"]
        self.assertEqual(got["method"], self.name)
        self.assertEqual(got, challenger_standing("plumas_ca", got["first_day"], got["last_day"], fx.CONTEXT_BOX,
                                                  variant=self.name.removeprefix("challenger_")))
        self.assertLessEqual(got["first_day"], "2099-07-01")
        self.assertEqual(got["standing"], "never seen")
        self.assertNotIn("standing_to_the_answering_estimate", self.off.extras)
        self.assertNotIn("standing_to_the_answering_estimate", real_response(self.off, {}))

    def test_the_challenger_answers_each_held_out_pass_once_and_the_run_is_what_it_was_when_asked_twice(self) -> None:
        from backend.model.challenger.methods import ChallengerMethod

        class _AskedEveryTime:
            def __init__(self, method):
                self._method, self.name, self.label = method, method.name, method.label

            def predict(self, target):
                return self._method.predict(target)

        calls: list[float] = []
        real = ChallengerMethod.predict

        def counted(self, target):
            calls.append(float(target.time_s))
            return real(self, target)

        with mock.patch.object(ChallengerMethod, "predict", counted):
            once = _solve(ROWS6, estimate=RR.ESTIMATE_CHALLENGER)
            n_once = len(calls)
            calls.clear()
            with mock.patch.object(RR, "_AnsweredOnce", _AskedEveryTime), \
                    mock.patch.object(RR, "_given", lambda method, v, g, factory: factory):
                twice = _solve(ROWS6, estimate=RR.ESTIMATE_CHALLENGER)
            n_twice = len(calls)
        held = [f for f in once.observer_passes["frames"] if f["held_out"]]
        self.assertEqual(n_once, len(held))
        self.assertEqual(len(set(calls)), len(held))
        self.assertGreater(n_twice, n_once)
        # the same run, byte for byte, whichever way the challenger is asked
        self.assertEqual(json.dumps(once.extras, sort_keys=True, default=str).replace("duration_ms", ""),
                         json.dumps(twice.extras, sort_keys=True, default=str).replace("duration_ms", ""))
        self.assertEqual(json.dumps(once.observer_passes, sort_keys=True), json.dumps(twice.observer_passes, sort_keys=True))
        self.assertEqual(once.reconstruction_u8_bytes, twice.reconstruction_u8_bytes)

    def test_a_run_answered_by_the_challenger_has_an_id_of_its_own(self) -> None:
        self.assertNotEqual(self.on.run_id, self.off.run_id)
        self.assertTrue(self.on.run_id.endswith(self.name))

    def test_a_run_with_every_satellite_is_never_touched(self) -> None:
        a = _solve(ROWS6, estimate=RR.ESTIMATE_CHALLENGER, holdout=False)
        b = _solve(ROWS6, holdout=False)
        self.assertEqual(json.dumps(a.observer_passes, sort_keys=True), json.dumps(b.observer_passes, sort_keys=True))
        self.assertNotIn("held_out_passes_estimated_by", a.extras["model"])
        self.assertIsNone(a.extras["held_out_passes_answered_by"])
        self.assertNotIn("standing_to_the_answering_estimate", a.extras)


if __name__ == "__main__":
    unittest.main()
