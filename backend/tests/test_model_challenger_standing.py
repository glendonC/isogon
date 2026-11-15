"""What a fire the page follows is to the challenger: by the plan's places and years, from the plan's file and the
bundles alone, beside the estimate in use's standing."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.archive import region_box  # noqa: E402
from backend.model import challenger_standing as CS  # noqa: E402
from backend.model import fire_roles as FR  # noqa: E402


def _standing(region: str, first: str, last: str) -> dict:
    return CS.challenger_standing(region, first, last, tuple(region_box(region)))


class StandingTests(unittest.TestCase):
    def test_every_bundle_names_the_plan_the_standing_reads(self) -> None:
        plan = json.loads(CS.PLAN_FILE.read_text(encoding="utf-8"))
        for variant in ("blend", "gbdt", "mlp", "logistic"):
            for b in CS._bundles(variant):
                self.assertEqual(b["fitted_on"]["plan_sha256"], plan["plan_sha256"], b["name"])
                self.assertEqual(b["fitted_on"]["role"], "fitting")

    def test_a_fire_the_challenger_was_fitted_on_is_said_so_where_the_estimate_in_use_never_saw_it(self) -> None:
        got = _standing("manavgat_tr", "2021-07-01", "2021-07-31")
        self.assertEqual(FR.fire_roles("manavgat_tr", "2021-07-01", "2021-07-31")["world_model"], FR.NEVER_SEEN)
        self.assertEqual(got["standing"], FR.FITTED_ON)
        inside = got["plan_fires_inside_the_window"]
        self.assertEqual([(f["role"], f["first_day"]) for f in inside], [("fitting", "2021-07-28")])
        self.assertIn(inside[0]["key"], got["why"])

    def test_a_place_fitted_on_in_other_years_only_is_never_seen_and_its_fires_are_listed(self) -> None:
        got = _standing("ventura_ca", "2017-12-01", "2017-12-31")
        self.assertEqual(got["standing"], FR.NEVER_SEEN)
        self.assertEqual(len(got["fitting_fires_in_these_places"]), 4)
        self.assertEqual(got["plan_fires_inside_the_window"], [])
        self.assertIn("other years than the window's", got["why"])
        # the same places in a year of the plan: fitted on by year, though no fire of the plan falls in the days
        later = _standing("ventura_ca", "2018-03-01", "2018-03-31")
        self.assertEqual(later["standing"], FR.FITTED_ON)
        self.assertEqual(later["plan_fires_inside_the_window"], [])

    def test_the_values_it_reads_carry_their_own_standing(self) -> None:
        self.assertEqual(_standing("lytton_bc", "2021-06-01", "2021-07-31")["standing"], FR.TEST_FIRE)
        north = _standing("plumas_ca", "2020-09-01", "2020-09-30")
        self.assertEqual((north["standing"], north["fitting_fires_in_these_places"]), (FR.FITTED_ON, []))
        self.assertTrue(north["why"].startswith("The occupancy values the challenger reads"))
        park = _standing("plumas_ca", "2024-08-01", "2024-08-31")
        self.assertEqual(park["standing"], FR.VALIDATED_ON)
        self.assertEqual(_standing("plumas_ca", "2012-08-01", "2012-08-31")["standing"], FR.NEVER_SEEN)

    def test_a_bundle_fitted_on_another_plan_is_refused(self) -> None:
        plan = json.loads(CS.PLAN_FILE.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            other = Path(tmp) / "fresh_world_plan.json"
            other.write_text(json.dumps({**plan, "plan_sha256": "0" * 64}), encoding="utf-8")
            with self.assertRaises(ValueError):
                CS.challenger_standing("ventura_ca", "2017-12-01", "2017-12-31", tuple(region_box("ventura_ca")),
                                       plan_file=other)

    def test_the_words_carry_no_dash_or_middle_dot(self) -> None:
        for region, first, last in (("manavgat_tr", "2021-07-01", "2021-07-31"), ("ventura_ca", "2017-12-01", "2017-12-31"),
                                    ("plumas_ca", "2020-09-01", "2020-09-30"), ("lytton_bc", "2021-06-01", "2021-07-31")):
            text = _standing(region, first, last)["why"] + CS.RULE
            for cp in (0x2014, 0x2013, 0x00B7):
                self.assertNotIn(chr(cp), text)


if __name__ == "__main__":
    unittest.main()
