"""The episode catalogue and the reference table of the next-look environment, on SYNTHETIC rows.

The rows are the synthetic fixture, once as dated (2099) and once re-dated into July 2021 to exercise the test split.
No real NASA row is used.
"""

from __future__ import annotations

from pathlib import Path
import sys
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.env import KNOWN_LIMITS  # noqa: E402
from backend.env import episodes as E  # noqa: E402
from backend.env.policy import FEATURE_NAMES  # noqa: E402
from backend.env.report import NAMED, format_table, plainly, reference_table  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.rows import parse_acq_time_s, read_csv_rows  # noqa: E402
from backend.model.occupancy import OccupancyParams  # noqa: E402
from backend.model.real_run import parse_start_s  # noqa: E402
from backend.terrain.live_region import PRESET_BY_ID  # noqa: E402

ROWS_2099 = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
ROWS_2021 = [{**r, "acq_date": r["acq_date"].replace("2099-07-0", "2021-07-2")} for r in ROWS_2099]


def _reader(rows):
    def read(box, start, end, platforms=None):
        t0, t1 = parse_start_s(str(start)), parse_start_s(str(end))
        w, s, e, n = box
        return [dict(r) for r in rows
                if t0 <= parse_acq_time_s(r["acq_date"], r["acq_time"]) < t1
                and w <= float(r["longitude"]) <= e and s <= float(r["latitude"]) <= n]

    return read


def _box(region_id: str):
    return fx.CONTEXT_BOX


def _catalogue(rows, year, **kw):
    return E.catalogue(_reader(rows), _box, PRESET_BY_ID, years=(year,), regions=("plumas_ca",), **kw)


class CatalogueTests(unittest.TestCase):
    def test_windows_are_consecutive_runs_of_12_modis_overpasses_and_thresholds_decide_what_is_an_episode(self) -> None:
        every = _catalogue(ROWS_2099, 2099, keep_all_windows=True)
        self.assertEqual(len(every), 1)                       # the synthetic fire has exactly 12 MODIS overpasses in one tile
        ep = every[0]
        self.assertEqual((ep.tile, ep.split, ep.region_id), ((2, 2), "fit", "plumas_ca"))
        self.assertEqual((len(ep.window.passes), ep.window.n_modis, ep.window.n_viirs), (12, 12, 0))
        self.assertIn("VIIRS is hidden", ep.window.chosen_from)
        self.assertEqual(ep.window.modis_pixels_in_box, 44)
        # the same windows with every VIIRS row gone: an episode is chosen from MODIS alone
        bare = _catalogue([r for r in ROWS_2099 if r["instrument"] != "VIIRS"], 2099, keep_all_windows=True)
        self.assertEqual([e.window.as_dict() for e in bare], [e.window.as_dict() for e in every])
        self.assertFalse(E.qualifies(ep.window))              # 44 MODIS pixels is under the threshold of 60
        self.assertTrue(E.qualifies(ep.window, min_modis_pixels=40))
        self.assertEqual(_catalogue(ROWS_2099, 2099), [])
        self.assertEqual(len(_catalogue(ROWS_2099, 2099, min_modis_pixels=40)), 1)
        self.assertIn("non-overlapping", ep.window.rule)

    def test_the_2021_fire_in_the_test_box_is_test_only(self) -> None:
        eps = _catalogue(ROWS_2021, 2021, min_modis_pixels=40)
        self.assertEqual([e.split for e in eps], ["test"])     # nothing of it is left on the fit side
        self.assertEqual(eps[0].tile, (2, 2))
        self.assertTrue(eps[0].key.startswith("plumas_ca:22:2021-07-2"))
        self.assertEqual(eps[0].as_dict()["split"], "test")

    def test_threshold_data_and_tile_share_are_reported(self) -> None:
        every = _catalogue(ROWS_2099, 2099, keep_all_windows=True)
        stats = E.window_stats(every)
        self.assertEqual(stats["windows"], 1)
        self.assertIn("12 MODIS overpasses", stats["tiling"])
        # VIIRS pixels between the first and the last MODIS overpass of the window (the pass after the last one is outside)
        self.assertEqual(stats["by_threshold"][2]["median_viirs_pixels_in_fit_episodes"], 196.0)
        self.assertEqual(stats["threshold_chosen"], E.MIN_MODIS_PIXELS)
        by = {row["min_modis_pixels"]: row["episodes"] for row in stats["by_threshold"]}
        self.assertEqual((by[40], by[60]), (1, 0))
        share = E.top_tile_share(every, splits=(1, 2, 8), min_pixels=5)
        self.assertEqual(share["by_split"]["1x1"]["median_share_in_busiest_tile"], 1.0)
        self.assertLessEqual(share["by_split"]["8x8"]["median_share_in_busiest_tile"], share["by_split"]["2x2"]["median_share_in_busiest_tile"])


class WhatMayBePlayedTests(unittest.TestCase):
    def test_no_window_of_a_test_fire_s_region_in_its_year_may_be_played(self) -> None:
        test_ep = _catalogue(ROWS_2021, 2021, min_modis_pixels=40)[0]
        open_ep = _catalogue(ROWS_2099, 2099, min_modis_pixels=40)[0]
        self.assertFalse(E.may_be_played(test_ep))
        self.assertTrue(E.may_be_played(open_ep))
        # a fit window of the fire's year in the fire's region is closed as well, wherever it lies in the context box
        from dataclasses import replace

        elsewhere = replace(open_ep, year=2021, tile=(0, 1))
        self.assertEqual((elsewhere.split, E.may_be_played(elsewhere)), ("fit", False))
        self.assertEqual({r: E.closed_year(r) for r in ("plumas_ca", "lytton_bc", "evia_greece", "blue_mountains_au")},
                         {"plumas_ca": 2021, "lytton_bc": 2021, "evia_greece": 2021, "blue_mountains_au": None})
        self.assertTrue(E.may_be_played(replace(open_ep, region_id="blue_mountains_au", year=2021)))
        early, late = replace(open_ep, year=E.TRAIN_LAST_YEAR), replace(open_ep, year=E.TRAIN_LAST_YEAR + 1)
        train, val = E.fit_split([test_ep, elsewhere, early, late])
        self.assertEqual((train, val), ([early], [late]))

    def test_the_table_refuses_a_closed_episode(self) -> None:
        test_ep = _catalogue(ROWS_2021, 2021, min_modis_pixels=40)[0]
        with self.assertRaises(ValueError):
            reference_table([test_ep], OccupancyParams(), settings=((2, 4),), seeds=1, workers=0, log=lambda m: None)


class ReferenceTableTests(unittest.TestCase):
    def test_table_lists_every_player_with_gain_spread_and_what_separates_skill_from_geometry(self) -> None:
        eps = _catalogue(ROWS_2099, 2099, min_modis_pixels=40)
        # four looks: with fewer, an evenly spread budget lands only on slots of the made-up NOAA-21, which has no row
        # behind it; such a look is unknown and nobody gains from it
        ref = reference_table(eps, OccupancyParams(), settings=((2, 4),), seeds=3, workers=0, train_episodes=eps,
                              policy_weights=[1.0] + [0.0] * (len(FEATURE_NAMES) - 1), log=lambda m: None)
        self.assertEqual((ref["schedule"], ref["random_seeds"]), ("nominal", 3))
        self.assertIn("add up", ref["reward"])
        row = ref["settings"][0]
        self.assertEqual((row["tiles"], row["budget"], row["episodes"]), ("2x2", 4, 1))
        self.assertEqual(set(row["agents"]), set(NAMED) | {"constant_best_in_hindsight", "constant_best_on_training"})
        for name, a in row["agents"].items():
            # a gain is the final score minus the starting score: the rewards add up
            self.assertAlmostEqual(a["mean_final_score"] - row["mean_start_score"], a["mean_gain"], places=3, msg=name)
            for key in ("share_of_oracle_gain", "least_and_most_over_episodes", "mean_gain_on_cells_never_shown",
                        "share_of_looks_that_revealed_nothing", "mean_pixels_revealed"):
                self.assertIn(key, a)
        self.assertEqual(row["agents"]["oracle"]["share_of_oracle_gain"], 1.0)
        self.assertIsNotNone(row["agents"]["random"]["sd_of_mean_gain_across_seeds"])
        self.assertIsNone(row["agents"]["least_sure"]["sd_of_mean_gain_across_seeds"])     # no seed in it
        self.assertEqual(len(row["random_mean_gain_by_seed"]), 3)
        # every constant tile is listed; the two named ones are the best of them here and on the training episodes
        tiles = row["constant_tiles_mean_gain"]
        self.assertEqual(len(tiles), 4)
        best = row["agents"]["constant_best_in_hindsight"]
        self.assertEqual((best["mean_gain"], tiles[best["tile"]]), (max(tiles), max(tiles)))
        self.assertEqual(row["agents"]["constant_best_on_training"]["tile"], best["tile"])   # the same episode here
        self.assertEqual(row["agents"]["constant_best_on_training"]["training_episodes"], 1)
        # with the first feature alone the linear policy is least sure
        self.assertEqual(row["agents"]["learned"]["mean_gain"], row["agents"]["least_sure"]["mean_gain"])
        for key in ("least_sure_minus_random", "least_sure_minus_centre", "least_sure_minus_constant_best_in_hindsight",
                    "least_sure_minus_constant_best_on_training", "learned_minus_least_sure", "oracle_minus_least_sure"):
            self.assertEqual(set(row["differences"][key]) >= {"mean_difference", "p05", "p95", "episodes"}, True, key)
        self.assertEqual(row["per_episode"]["episode"], [eps[0].key])
        self.assertEqual(len(row["per_episode"]["constant_tiles"]), 4)
        said = plainly(row)
        self.assertTrue(any(s.startswith("least sure") and "random" in s for s in said))
        self.assertTrue(any(s.startswith("the learned policy") for s in said))
        text = format_table(ref)
        self.assertIn("oracle", text)
        self.assertIn("constant_best_on_training (tile", text)
        self.assertIn("no cloud mask", KNOWN_LIMITS)


if __name__ == "__main__":
    unittest.main()
