"""The closed rule, and what a run does on a window it covers. On INVENTED rows only.

The test of the three test fires is closed: no window of a test fire's region in a year of its fire is scored
again. One function says whether a box and a window are closed. A run with every satellite shown on such a window
still gives its estimate, frames and terrain, and computes no score; a run with a satellite held out is refused.
The rows here are the synthetic fixture, as dated (2099, open) and re-dated into July 2021 (closed).
"""

from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
import sys
import unittest
from unittest import mock

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.baselines import fit_overlap_ratio  # noqa: E402
from backend.eval.rows import detections_from_rows, parse_acq_time_s, read_csv_rows  # noqa: E402
from backend.model import training as TR  # noqa: E402
from backend.model.occupancy import OccupancyParams  # noqa: E402
from backend.model.real_run import ClosedWindow, parse_start_s, real_response, solve_real_reconstruction  # noqa: E402
from backend.model.training import closed_for, closed_years  # noqa: E402
from backend.terrain.live_region import PRESET_BY_ID, LoadedRegionTerrain  # noqa: E402

ROWS_2099 = fx.extended_rows()
# the same six made-up days, re-dated to 21 to 26 July 2021: a window of a test fire's region in the year of its fire
ROWS_2021 = [{**r, "acq_date": r["acq_date"].replace("2099-07-0", "2021-07-2")} for r in ROWS_2099]
BASE = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
CONTEXT = {"plumas_ca": fx.CONTEXT_BOX, "lytton_bc": (-122.9, 49.7, -120.3, 51.6), "evia_greece": (22.3, 38.1, 24.9, 39.9)}


def _box_of(region_id: str) -> tuple[float, float, float, float]:
    return CONTEXT[region_id]


def _s(day: str) -> float:
    return parse_start_s(day)


def _terrain() -> LoadedRegionTerrain:
    dem = np.full((256, 256), 900.0, dtype=np.float32)
    return LoadedRegionTerrain(
        spec=PRESET_BY_ID["plumas_ca"], dem_m=dem, dem_f32_bytes=dem.tobytes(), dem_hires_f32_bytes=b"",
        satellite_bytes=b"", satellite_content_type="image/jpeg", terrain_source="flat_test_dem",
        min_elev_m=900.0, max_elev_m=900.0, mean_elev_m=900.0, duration_ms=0.0,
    )


def _reader(rows):
    def read(box, start, end, platforms=None):
        t0, t1 = parse_start_s(str(start)), parse_start_s(str(end))
        w, s, e, n = box
        return [dict(r) for r in rows if t0 <= parse_acq_time_s(r["acq_date"], r["acq_time"]) < t1
                and w <= float(r["longitude"]) <= e and s <= float(r["latitude"]) <= n]

    return read


class _Ratio:
    ratio, p10, p90, level = 4.0, 3.0, 5.0, 0.8

    def as_dict(self) -> dict[str, float]:
        return {"ratio": self.ratio, "p10": self.p10, "p90": self.p90, "nominal_level": self.level}


def _solve(rows, start: str, holdout: bool):
    fit = fit_overlap_ratio(detections_from_rows(BASE, fx.SOURCE_LABEL), trained_on="the synthetic fixture (test only)")
    return solve_real_reconstruction(
        _terrain(), start, holdout_viirs=holdout, read_firms=_reader(rows), context_box=fx.CONTEXT_BOX,
        ratio_fit=fit, row_source=fx.SOURCE_LABEL, params=OccupancyParams(),
        learned_parts=[{"name": "reconstruction parameters", "status": "not learned"}], count_ratio=_Ratio(),
        read_passes=fx.no_pass_list,
    )


class ClosedRuleTests(unittest.TestCase):
    """`closed_for(box, start_s, end_s)`: None for an open window, the region and the closed years it meets otherwise."""

    def rule(self, box, a: str, b: str):
        return closed_for(box, _s(a), _s(b), region_box=_box_of)

    def test_a_window_of_a_test_fire_s_region_in_the_year_of_its_fire_is_closed_whether_or_not_it_holds_the_fire(self) -> None:
        for a, b in (("2021-07-20", "2021-07-23"), ("2021-01-05", "2021-01-08"), ("2021-12-01", "2021-12-04")):
            self.assertEqual(self.rule(fx.TEST_BOX, a, b), {"region_id": "plumas_ca", "years": [2021]}, a)
        for a, b in (("2012-08-10", "2012-08-13"), ("2020-09-25", "2020-09-28"), ("2024-07-27", "2024-07-30"), ("2099-07-01", "2099-07-04")):
            self.assertIsNone(self.rule(fx.TEST_BOX, a, b), a)

    def test_a_period_across_new_year_is_closed_on_either_side(self) -> None:
        self.assertEqual(self.rule(fx.TEST_BOX, "2020-12-30", "2021-01-02")["years"], [2021])
        self.assertEqual(self.rule(fx.TEST_BOX, "2021-12-30", "2022-01-03")["years"], [2021])
        self.assertEqual(self.rule(fx.TEST_BOX, "2020-06-01", "2022-06-01")["years"], [2021])
        # the window is [start, end): one that ends as the closed year begins holds no moment of it
        self.assertIsNone(self.rule(fx.TEST_BOX, "2020-12-30", "2021-01-01"))
        self.assertIsNone(self.rule(fx.TEST_BOX, "2022-01-01", "2022-01-04"))
        # a single moment inside the closed year is closed
        self.assertIsNotNone(closed_for(fx.TEST_BOX, _s("2021-01-01"), _s("2021-01-01"), region_box=_box_of))

    def test_a_set_aside_span_over_two_years_closes_both_and_says_which_the_window_meets(self) -> None:
        made_up = {**TR.EXCLUSIONS, "plumas_ca": ("2030-11-01", "2031-03-01", None)}
        with mock.patch.object(TR, "EXCLUSIONS", made_up):
            self.assertEqual(closed_years("plumas_ca"), (2030, 2031))
            self.assertEqual(self.rule(fx.TEST_BOX, "2030-02-01", "2030-02-04")["years"], [2030])
            self.assertEqual(self.rule(fx.TEST_BOX, "2030-12-30", "2031-01-02")["years"], [2030, 2031])
            self.assertIsNone(self.rule(fx.TEST_BOX, "2021-07-20", "2021-07-23"))
            self.assertEqual(self.rule(CONTEXT["lytton_bc"], "2021-07-20", "2021-07-23")["region_id"], "lytton_bc")
        self.assertEqual(closed_years("plumas_ca"), (2021,))
        self.assertEqual(closed_years("blue_mountains_au"), ())

    def test_the_box_is_what_is_asked_not_a_region_id(self) -> None:
        w, s, e, n = fx.CONTEXT_BOX
        inside_context = (w + 0.05, s + 0.05, w + 0.30, s + 0.30)          # a box of its own, in the context box
        touching = (w - 0.5, s - 0.5, w + 0.01, s + 0.01)                  # one that only meets its corner
        far = (10.0, 10.0, 10.5, 10.4)
        self.assertEqual(self.rule(inside_context, "2021-07-20", "2021-07-23")["region_id"], "plumas_ca")
        self.assertEqual(self.rule(touching, "2021-07-20", "2021-07-23")["region_id"], "plumas_ca")
        self.assertIsNone(self.rule(far, "2021-07-20", "2021-07-23"))
        self.assertEqual(self.rule(CONTEXT["evia_greece"], "2021-08-03", "2021-08-06"), {"region_id": "evia_greece", "years": [2021]})

    def test_the_answer_is_json_and_the_routes_find_the_function_under_the_environment_s_name(self) -> None:
        import importlib

        got = self.rule(fx.TEST_BOX, "2021-07-20", "2021-07-23")
        self.assertEqual(json.loads(json.dumps(got)), got)
        self.assertEqual(set(got), {"region_id", "years"})
        rule = getattr(importlib.import_module("backend.env.episodes"), "closed_for")
        self.assertIs(rule, closed_for)
        # with the real context boxes, as the routes call it: three arguments
        self.assertEqual(rule(tuple(PRESET_BY_ID["plumas_ca"].bbox.__dict__[k] for k in ("west", "south", "east", "north")),
                              _s("2021-07-20"), _s("2021-07-23")), {"region_id": "plumas_ca", "years": [2021]})
        self.assertIsNone(rule((10.0, 10.0, 10.5, 10.4), _s("2021-07-20"), _s("2021-07-23")))

    def test_an_episode_whose_window_runs_into_a_closed_year_is_not_played(self) -> None:
        from backend.env import episodes as E
        from backend.env.episodes import EnvEpisode
        from backend.model.real_blind import in_box_overpasses, window_from_start
        from backend.eval.holdout import visible_rows

        det = detections_from_rows(BASE, fx.SOURCE_LABEL)
        items = in_box_overpasses(visible_rows(det, "VIIRS"), fx.TEST_BOX)
        w = window_from_start(det, fx.TEST_BOX, items[0][0].time_s, n=len(items))
        ep = EnvEpisode("plumas_ca", 2099, (2, 2), fx.TEST_BOX, w, det, "fit")
        self.assertTrue(E.may_be_played(ep))
        across = replace(ep, year=2020, window=replace(w, start_s=_s("2020-12-30"), end_s=_s("2021-01-02")))
        self.assertFalse(E.may_be_played(across))                        # its year is open, its window is not
        self.assertFalse(E.may_be_played(replace(ep, year=2021)))        # the year alone closes it too, as before
        self.assertEqual(E.closed_year("plumas_ca"), 2021)


class RunOnAClosedWindowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.open = _solve(ROWS_2099, "2099-07-01", holdout=False)
        cls.closed = _solve(ROWS_2021, "2021-07-21", holdout=False)

    def test_a_run_with_every_satellite_on_a_closed_window_computes_no_score(self) -> None:
        doc = real_response(self.closed, {})
        self.assertNotIn("fit_residuals", doc)
        self.assertNotIn("blind_test", doc)
        said = doc["not_scored"]
        self.assertEqual((said["evidence"], said["region_id"], said["years"]), ("/api/evidence", "plumas_ca", [2021]))
        self.assertIn("recorded test fire", said["why"])
        self.assertFalse(doc["metrics"]["scored"])
        for key in ("raw_modis_rmse_mw_km2", "reconstructed_rmse_mw_km2", "rmse_reduction_pct", "empirical_90_coverage_pct",
                    "cells_gained_over_painted_modis_pct"):
            self.assertIsNone(doc["metrics"][key], key)                  # no figure made from VIIRS rows
        self.assertEqual(doc["metrics"]["not_scored"], said)
        stage = next(s for s in doc["pipeline_stages"] if s["stage_id"] == "conformal_gate")
        self.assertEqual(stage["status"], "skipped")
        self.assertIn("recorded test fire", stage["detail"])

    def test_the_estimate_the_frames_and_the_terrain_stay(self) -> None:
        doc = real_response(self.closed, {})
        self.assertEqual(len(doc["observer_passes"]["frames"]), 24)
        self.assertGreater(int(self.closed.tensor_u8[..., 0].max()), 0)
        self.assertGreater(len(self.closed.belief_u8_bytes), 0)
        self.assertGreater(doc["metrics"]["total_reconstructed_frp_peak_mw"], 0.0)
        self.assertEqual(doc["region"]["id"], "plumas_ca")
        self.assertFalse(doc["holdout_viirs"])
        # it is the same estimate as the same rows give on an open window: only the dates differ
        self.assertEqual(int(np.count_nonzero(self.closed.tensor_u8 != self.open.tensor_u8)), 0)

    def test_the_same_rows_on_an_open_window_are_scored_as_before(self) -> None:
        doc = real_response(self.open, {})
        self.assertIn("fit_residuals", doc)
        self.assertIsNone(doc["not_scored"])
        self.assertTrue(doc["metrics"]["scored"])
        self.assertIsNotNone(doc["metrics"]["reconstructed_rmse_mw_km2"])
        self.assertNotIn("not_scored", doc["metrics"])

    def test_a_run_with_a_satellite_held_out_is_refused_on_a_closed_window(self) -> None:
        with self.assertRaises(ClosedWindow) as caught:
            _solve(ROWS_2021, "2021-07-21", holdout=True)
        self.assertIsInstance(caught.exception, ValueError)
        self.assertIn("/api/evidence", str(caught.exception))
        self.assertIn("2021", str(caught.exception))
        held = _solve(ROWS_2099, "2099-07-01", holdout=True)               # an open window is held out as before
        self.assertIn("blind_test", held.extras)
        self.assertIsNone(held.extras["not_scored"])


if __name__ == "__main__":
    unittest.main()
