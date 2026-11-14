"""What a region and window is to the world model and to the learned agent: fitted on, validated on, a recorded
test fire, or never seen. The answer is read from the same constants the fits read, so these tests pin the rule
and the link, not a list of years written twice."""

from __future__ import annotations

import json
import unittest

from backend.model import fire_roles as R
from backend.model.fire_roles import FITTED_ON, NEVER_SEEN, TEST_FIRE, VALIDATED_ON, fire_roles


class StandingTests(unittest.TestCase):
    def test_the_answer_is_two_standings_with_their_reasons_and_is_json_ready(self) -> None:
        got = fire_roles("plumas_ca", "2012-08-01", "2012-08-31")
        self.assertEqual(json.loads(json.dumps(got)), got)
        self.assertEqual(set(got), {"region_id", "first_day", "last_day", "world_model", "learned_agent", "why",
                                    "closed", "closed_why", "standings", "rule"})
        self.assertEqual(set(got["why"]), {"world_model", "learned_agent"})
        for part in ("world_model", "learned_agent"):
            self.assertIn(got[part], (FITTED_ON, VALIDATED_ON, TEST_FIRE, NEVER_SEEN))
            self.assertTrue(got["why"][part].endswith("."))
        self.assertEqual(got["standings"], [FITTED_ON, VALIDATED_ON, TEST_FIRE, NEVER_SEEN])

    def test_a_fire_before_the_world_model_s_training_years_is_new_to_it_and_known_to_the_agent(self) -> None:
        """The reconstruction's values were fitted on fires from 2018 on; the agent's episodes start in 2012."""
        got = fire_roles("plumas_ca", "2012-08-01", "2012-08-31")
        self.assertEqual((got["world_model"], got["learned_agent"], got["closed"]), (NEVER_SEEN, FITTED_ON, False))
        self.assertIsNone(got["closed_why"])

    def test_the_years_follow_the_constants_the_fits_read(self) -> None:
        from backend.env.episodes import TRAIN_LAST_YEAR, YEARS
        from backend.model.training import TRAINING_YEARS, VALIDATION_YEARS

        for region in ("plumas_ca", "lytton_bc", "evia_greece"):
            for year in range(2008, 2027):
                got = fire_roles(region, f"{year}-08-01", f"{year}-08-31")
                if year == 2021:
                    continue
                want_model = FITTED_ON if year in TRAINING_YEARS else VALIDATED_ON if year in VALIDATION_YEARS else NEVER_SEEN
                want_agent = NEVER_SEEN if year not in YEARS else FITTED_ON if year <= TRAIN_LAST_YEAR else VALIDATED_ON
                self.assertEqual((got["world_model"], got["learned_agent"]), (want_model, want_agent), (region, year))
                self.assertFalse(got["closed"], (region, year))

    def test_the_three_recorded_test_fires_are_test_fires_to_both_and_closed(self) -> None:
        for region, first, last in (("plumas_ca", "2021-07-01", "2021-08-31"), ("lytton_bc", "2021-06-30", "2021-07-15"),
                                    ("evia_greece", "2021-08-01", "2021-08-31")):
            got = fire_roles(region, first, last)
            self.assertEqual((got["world_model"], got["learned_agent"]), (TEST_FIRE, TEST_FIRE), region)
            self.assertTrue(got["closed"], region)
            self.assertIn("2021", got["closed_why"])
            self.assertIn(R.TEST_FIRE_NAMES[region], got["why"]["world_model"])

    def test_another_window_of_a_test_fire_s_region_and_year_is_closed_without_being_called_the_test_fire(self) -> None:
        """Nothing in a test box in the year of its fire was learned from, before or after the fire's own dates,
        and no window of that region and year is scored again. Such a window is not the test fire, and a page
        must not offer a blind run on it: `closed` says so."""
        for region, first, last in (("plumas_ca", "2021-05-01", "2021-05-31"), ("lytton_bc", "2021-04-01", "2021-04-30"),
                                    ("evia_greece", "2021-10-01", "2021-10-31")):
            got = fire_roles(region, first, last)
            self.assertEqual((got["world_model"], got["learned_agent"]), (NEVER_SEEN, NEVER_SEEN), region)
            self.assertTrue(got["closed"], region)
            self.assertIn("is scored again", got["closed_why"])
            self.assertTrue(got["closed_why"].startswith("No window of"))
            self.assertIn("year of the", got["why"]["world_model"])

    def test_a_window_over_several_standings_takes_the_strongest_claim_on_it(self) -> None:
        """A test fire before anything else; fitted on before validated on; never seen only when every day is."""
        self.assertEqual(fire_roles("lytton_bc", "2021-06-01", "2021-06-20")["world_model"], TEST_FIRE)   # ends in the fire
        self.assertEqual(fire_roles("plumas_ca", "2023-12-20", "2024-01-10")["world_model"], FITTED_ON)
        self.assertEqual(fire_roles("plumas_ca", "2017-12-20", "2018-01-10")["world_model"], FITTED_ON)
        self.assertEqual(fire_roles("plumas_ca", "2023-12-20", "2024-01-10")["learned_agent"], FITTED_ON)
        self.assertEqual(fire_roles("plumas_ca", "2025-12-20", "2026-01-10")["world_model"], VALIDATED_ON)
        self.assertEqual(fire_roles("evia_greece", "2020-12-20", "2021-01-10")["closed"], True)

    def test_a_region_without_real_rows_was_never_seen_by_either(self) -> None:
        got = fire_roles("somewhere_else", "2020-08-01", "2020-08-31")
        self.assertEqual((got["world_model"], got["learned_agent"], got["closed"]), (NEVER_SEEN, NEVER_SEEN, False))
        self.assertIn("somewhere_else", got["why"]["world_model"])

    def test_days_are_read_strictly(self) -> None:
        with self.assertRaises(ValueError):
            fire_roles("plumas_ca", "2012-08-31", "2012-08-01")
        with self.assertRaises(ValueError):
            fire_roles("plumas_ca", "August 2012", "2012-08-31")
        got = fire_roles("plumas_ca", "2012-08-01T00:00:00Z", "2012-08-31")          # a time of day is cut off
        self.assertEqual(got["first_day"], "2012-08-01")

    def test_the_registry_s_name_for_the_function_resolves(self) -> None:
        """The places registry looks the function up by module and name and reads two keys of its answer."""
        import importlib

        fn = getattr(importlib.import_module("backend.model.fire_roles"), "fire_roles")
        got = fn("plumas_ca", "2020-09-01", "2020-09-30")
        self.assertEqual((got.get("world_model"), got.get("learned_agent")), (FITTED_ON, FITTED_ON))

    def test_the_text_holds_no_long_dash_or_dot(self) -> None:
        text = json.dumps([fire_roles(r, a, b) for r, a, b in (
            ("plumas_ca", "2012-08-01", "2012-08-31"), ("plumas_ca", "2021-07-01", "2021-08-31"),
            ("lytton_bc", "2021-04-01", "2021-04-30"), ("evia_greece", "2024-08-01", "2024-08-31"),
            ("somewhere_else", "2020-08-01", "2020-08-31"))], ensure_ascii=False)
        for code in (0x2014, 0x2013, 0x00B7):
            self.assertNotIn(chr(code), text)


if __name__ == "__main__":
    unittest.main()
