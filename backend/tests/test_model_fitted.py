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
