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

    def test_a_run_answered_by_the_challenger_has_an_id_of_its_own(self) -> None:
        self.assertNotEqual(self.on.run_id, self.off.run_id)
        self.assertTrue(self.on.run_id.endswith(self.name))

    def test_a_run_with_every_satellite_is_never_touched(self) -> None:
        a = _solve(ROWS6, estimate=RR.ESTIMATE_CHALLENGER, holdout=False)
        b = _solve(ROWS6, holdout=False)
        self.assertEqual(json.dumps(a.observer_passes, sort_keys=True), json.dumps(b.observer_passes, sort_keys=True))
        self.assertNotIn("held_out_passes_estimated_by", a.extras["model"])


if __name__ == "__main__":
    unittest.main()
