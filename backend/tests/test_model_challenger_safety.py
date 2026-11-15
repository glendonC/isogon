"""Safety, blindness, closed-window, and house-rule tests for challenger modules."""

from __future__ import annotations

from pathlib import Path
import re
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.grid import EvalGrid  # noqa: E402
from backend.eval.holdout import visible_rows  # noqa: E402
from backend.eval.rows import detections_from_rows, read_csv_rows  # noqa: E402
from backend.eval.schedule import Slot  # noqa: E402
from backend.model.challenger.declarations import declare_look_grid  # noqa: E402
from backend.model.challenger.features import (  # noqa: E402
    CELL_FEATURE_NAMES,
    FEATURE_SCHEMA_VERSION,
    EpisodeFeatureExtractor,
)
from backend.model.challenger.guard import (  # noqa: E402
    MAX_WORKERS,
    clamp_workers,
    global_forbidden_test_places,
    refuse_closed_episode,
    refuse_closed_split_years,
    refuse_forbidden_place,
    refuse_hidden_rows,
)
from backend.model.challenger.world_split import load_fresh_world_plan  # noqa: E402
from backend.model.real_run import parse_start_s  # noqa: E402
from backend.model.training import ClosedWindow  # noqa: E402


def _synthetic_both():
    rows = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
    return detections_from_rows(rows, fx.SOURCE_LABEL)


class ChallengerSafetyTests(unittest.TestCase):
    def test_refuses_when_handed_any_sharp_satellite_row(self) -> None:
        det = _synthetic_both()
        grid = EvalGrid.from_bbox(fx.TEST_BOX)
        with self.assertRaises(ValueError):
            refuse_hidden_rows(det, "VIIRS")
        with self.assertRaises(ValueError):
            EpisodeFeatureExtractor(det, grid, use_terrain=False)

        # Even a single VIIRS row mixed into MODIS rows must fail
        modis_only = visible_rows(det, "VIIRS")
        one_viirs_idx = int(np.flatnonzero(det.is_viirs)[0])
        modis_idx = np.flatnonzero(det.is_modis)
        contaminated = det.select(np.append(modis_idx, one_viirs_idx))
        with self.assertRaises(ValueError):
            EpisodeFeatureExtractor(contaminated, grid, use_terrain=False)

        # Clean visible MODIS rows succeed
        ext = EpisodeFeatureExtractor(modis_only, grid, use_terrain=False)
        slot = Slot(0, "VIIRS_SNPP", float(modis_only.time_s.min()) + 900.0, True, 0.45, 0.42)
        tf = ext.extract(slot)
        self.assertEqual(FEATURE_SCHEMA_VERSION, 2)
        self.assertEqual(len(CELL_FEATURE_NAMES), 48)
        self.assertEqual(tf.cell_x.shape[1], 48)
        self.assertEqual(tf.rec_p.shape, grid.shape)
        self.assertTrue(np.all(np.isfinite(tf.cell_x)))
        self.assertTrue(np.all(np.isfinite(tf.look_x)))

        # Adaptive declaration rule handles both faint and bright grids cleanly
        faint_grid = np.zeros(grid.shape, dtype=np.float64)
        faint_grid[2:4, 2:4] = 0.24
        rule = {
            "kind": "adaptive_core_plus_spine",
            "w_blur": 0.22,
            "tau_hi": 0.255,
            "s_min": 0.72,
            "p_peak_min": 0.125,
            "faint_relief": 0.025,
        }
        declared = declare_look_grid(faint_grid, rule)
        self.assertEqual(declared.shape, grid.shape)
        self.assertTrue(bool(declared[2, 2]))

    def test_worker_ceiling_and_fresh_world_plan_sealing(self) -> None:
        self.assertEqual(MAX_WORKERS, 4)
        self.assertEqual(clamp_workers(18), 4)
        self.assertEqual(clamp_workers(4), 4)
        self.assertEqual(clamp_workers(0), 1)
        self.assertEqual(clamp_workers(-3), 1)

        sealed = global_forbidden_test_places("fresh_world_v1")
        self.assertEqual(len(sealed), 3264)
        sample_forb = next(iter(sealed))
        with self.assertRaises(ValueError):
            refuse_forbidden_place(sample_forb, sealed)

        has_plan = (_REPO_ROOT / "backend/model/fitted_values/fresh_world_plan.json").is_file() or (
            _REPO_ROOT / ".git"
        ).exists()
        if has_plan:
            plan = load_fresh_world_plan()
            self.assertEqual(plan["protocol_id"], "fresh_world_v1")
            self.assertEqual(len(plan["fitting"]), 300)
            self.assertEqual(len(plan["validation"]), 83)
            forb_set = frozenset(plan["forbidden_places"])
            self.assertGreaterEqual(len(forb_set), 3264)
            for pid in plan["test_a_places"] + plan["test_b_places"]:
                with self.assertRaises(ValueError):
                    refuse_forbidden_place(pid, forb_set)
            for ep in plan["fitting"] + plan["validation"]:
                refuse_forbidden_place(ep["place_id"], forb_set)

    def test_closed_windows_and_years_are_refused(self) -> None:
        with self.assertRaises(ValueError):
            refuse_closed_split_years((2018, 2021, 2022))
        refuse_closed_split_years((2018, 2019, 2020, 2022, 2023))

        t0 = parse_start_s("2021-07-20")
        t1 = parse_start_s("2021-07-23")
        with self.assertRaises(ClosedWindow):
            refuse_closed_episode(fx.TEST_BOX, t0, t1)

        open_t0 = parse_start_s("2099-07-01")
        open_t1 = parse_start_s("2099-07-04")
        refuse_closed_episode(fx.TEST_BOX, open_t0, open_t1)

    def test_source_files_obey_house_and_holdout_rules(self) -> None:
        challenger_files = sorted((_REPO_ROOT / "backend" / "model" / "challenger").rglob("*.py"))
        challenger_files += sorted((_REPO_ROOT / "backend" / "model" / "challenger").rglob("*.json"))
        test_files = sorted((_REPO_ROOT / "backend" / "tests").glob("test_model_challenger_*.py"))
        self.assertGreater(len(challenger_files), 0)

        banned_chars = (chr(0x2014), chr(0x2013), chr(0x00B7))
        local_prefix = "/" + "Users" + "/"
        for path in challenger_files + test_files:
            text = path.read_text(encoding="utf-8")
            rel = path.relative_to(_REPO_ROOT).as_posix()
            for ch in banned_chars:
                self.assertNotIn(ch, text, f"banned character in {rel}")
            self.assertNotIn(local_prefix, text, f"local path in {rel}")
            if path in challenger_files and path.suffix == ".py":
                self.assertIsNone(re.search(r"\.open_for_scoring\(", text), rel)
                self.assertIsNone(re.search(r"\.pass_times\(", text), rel)
                self.assertIsNone(re.search(r"(?<!self)\._det\b", text), rel)


if __name__ == "__main__":
    unittest.main()
