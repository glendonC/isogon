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
from backend.env.report import AGENTS, format_table, reference_table  # noqa: E402
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
    def test_windows_are_consecutive_runs_of_24_and_thresholds_decide_what_is_an_episode(self) -> None:
        every = _catalogue(ROWS_2099, 2099, keep_all_windows=True)
        self.assertEqual(len(every), 1)                       # the synthetic fire has exactly 24 overpasses in one tile
        ep = every[0]
        self.assertEqual((ep.tile, ep.split, ep.region_id), ((2, 2), "fit", "plumas_ca"))
        self.assertEqual(len(ep.window.passes), 24)
        self.assertEqual(ep.window.modis_pixels_in_box, 44)
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
        self.assertEqual(stats["windows_of_24_overpasses"], 1)
        self.assertEqual(stats["threshold_chosen"], E.MIN_MODIS_PIXELS)
        by = {row["min_modis_pixels"]: row["episodes"] for row in stats["by_threshold"]}
        self.assertEqual((by[40], by[60]), (1, 0))
        share = E.top_tile_share(every, splits=(1, 2, 8), min_pixels=5)
        self.assertEqual(share["by_split"]["1x1"]["median_share_in_busiest_tile"], 1.0)
        self.assertLessEqual(share["by_split"]["8x8"]["median_share_in_busiest_tile"], share["by_split"]["2x2"]["median_share_in_busiest_tile"])


class ReferenceTableTests(unittest.TestCase):
    def test_table_has_every_agent_with_final_score_gain_and_share_of_the_oracle(self) -> None:
        eps = _catalogue(ROWS_2099, 2099, min_modis_pixels=40)
        ref = reference_table(eps, OccupancyParams(), settings=((2, 2),), seeds=3, workers=1, log=lambda m: None)
        row = ref["settings"][0]
        self.assertEqual((row["tiles"], row["budget"], row["episodes"]), ("2x2", 2, 1))
        self.assertEqual(set(row["agents"]), set(AGENTS))
        for name in AGENTS:
            a = row["agents"][name]
            self.assertIn("mean_final_score", a)
            self.assertIn("share_of_oracle_gain", a)
        self.assertEqual(row["agents"]["oracle"]["share_of_oracle_gain"], 1.0)
        self.assertIsNotNone(row["agents"]["random"]["sd_of_mean_gain_across_seeds"])
        self.assertIsNone(row["agents"]["least_sure"]["sd_of_mean_gain_across_seeds"])     # no seed in it
        self.assertEqual(len(ref["per_episode"][0]["random"]["returns"]), 3)
        self.assertIn("oracle", format_table(ref))
        self.assertIn("cloud is unknown", KNOWN_LIMITS)


if __name__ == "__main__":
    unittest.main()
