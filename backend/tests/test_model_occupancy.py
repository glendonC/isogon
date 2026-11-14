"""The occupancy filter and the derived pass geometry (backend/model/occupancy.py, real_geometry.py)."""

from __future__ import annotations

import math
from pathlib import Path
import sys
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.grid import EvalGrid  # noqa: E402
from backend.eval.overpass import Overpass, group_overpasses  # noqa: E402
from backend.eval.rows import detections_from_rows, read_csv_rows  # noqa: E402
from backend.model import real_geometry as G  # noqa: E402
from backend.model.occupancy import (  # noqa: E402
    GridState,
    OccupancyParams,
    OccupancyReconstruction,
    PassPixels,
    expected_count_cells,
    predict,
    update,
)

BOX = fx.TEST_BOX


def _fixture():
    rows = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE) + read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
    return detections_from_rows(rows, fx.SOURCE_LABEL)


def _pass(cells, frp, side, platform="MODIS_AQUA", is_day=True, area=1.0) -> PassPixels:
    return PassPixels(
        time_s=0.0, platform=platform, is_day=is_day, lst_hr=13.5, pixel_area_km2=area, cells=tuple(cells),
        frp_mw=tuple(frp), min_side_km=tuple(side), n_context=len(frp),
    )


class PredictTests(unittest.TestCase):
    def setUp(self) -> None:
        self.p = OccupancyParams()
        a = np.zeros((40, 40))
        a[20, 18:23] = 0.8
        self.state = GridState(a, a * 10.0, np.zeros((40, 40)))

    def test_expected_burning_cells_are_kept_and_fire_leaves_what_it_burned(self) -> None:
        out = predict(self.state, 6.0, 0.375, self.p, 1.0)
        self.assertAlmostEqual(float(out.a.sum()), float(self.state.a.sum()), delta=0.05 * float(self.state.a.sum()))
        s = 1.0 - math.exp(-6.0 / self.p.tau_res_h)
        np.testing.assert_allclose(out.b[20, 18:23], s * 0.8)
        # some burning probability has moved to cells that were not burning
        self.assertGreater(float(out.a[self.state.a == 0].sum()), 0.1)
        self.assertEqual(float(predict(self.state, 0.0, 0.375, self.p, 1.0).a.sum()), float(self.state.a.sum()))

    def test_burned_cells_do_not_relight(self) -> None:
        b = np.zeros((40, 40))
        b[:20, :] = 1.0                      # everything north of the line has burned
        st = GridState(self.state.a, self.state.F, b)
        out = predict(st, 12.0, 0.375, self.p, 1.0)
        self.assertEqual(float(out.a[:20, :].sum()), 0.0)
        self.assertGreater(float(out.a[21:, :].sum()), 0.1)

    def test_frp_follows_the_diurnal_ratio(self) -> None:
        one = predict(self.state, 6.0, 0.375, self.p, 1.0)
        half = predict(self.state, 6.0, 0.375, self.p, 0.5)
        self.assertAlmostEqual(float(half.F.sum()), 0.5 * float(one.F.sum()), places=6)

    def test_no_faint_film_of_fire_across_the_box(self) -> None:
        out = predict(self.state, 48.0, 0.375, self.p, 1.0)
        self.assertEqual(int(((out.a > 0) & (out.a < 1e-3)).sum()), 0)
        self.assertEqual(float(out.F[out.a == 0].sum()), 0.0)
        self.assertEqual(float(out.a[0, 0]), 0.0)


class UpdateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.p = OccupancyParams()
        self.empty = GridState.empty((30, 30))
        rr, cc = np.meshgrid(np.arange(10, 13), np.arange(10, 13), indexing="ij")
        self.block = (rr.ravel(), cc.ravel())        # a 3 by 3 footprint, about a 1.1 km pixel

    def test_a_flagged_pixel_keeps_its_frp_and_lights_a_line_not_the_whole_pixel(self) -> None:
        out = update(self.empty, _pass([self.block], [90.0], [1.125]), self.p)
        self.assertAlmostEqual(float(out.F.sum()), 90.0, places=9)
        self.assertEqual(float(out.F[self.empty.a.shape[0] - 1, 0]), 0.0)
        # a 1.125 km pixel holds a 0.375 km line: a third of its nine cells
        self.assertAlmostEqual(float(out.a.sum()), 3.0, places=6)
        np.testing.assert_allclose(out.a[10:13, 10:13], 1.0 / 3.0)

    def test_prior_burning_probability_sharpens_the_share_inside_a_pixel(self) -> None:
        a = np.zeros((30, 30))
        a[10, 10:13] = 0.6                           # the prior puts the fire on the pixel's top row
        st = GridState(a, a * 5.0, np.zeros((30, 30)))
        out = update(st, _pass([self.block], [90.0], [1.125]), self.p)
        self.assertAlmostEqual(float(out.F.sum()), 90.0, places=9)
        self.assertGreater(float(out.F[10, 10:13].sum()), 0.8 * 90.0)
        self.assertGreater(float(out.a[10, 11]), 5.0 * float(out.a[12, 11]))

    def test_burned_cells_get_less_of_a_new_pixel(self) -> None:
        b = np.zeros((30, 30))
        b[10, 10:13] = 1.0
        out = update(GridState(np.zeros((30, 30)), np.zeros((30, 30)), b), _pass([self.block], [90.0], [1.125]), self.p)
        self.assertLess(float(out.F[10, 10:13].sum()), 0.1 * 90.0)

    def test_a_look_that_flags_nothing_lowers_bright_cells_more_than_dim_ones(self) -> None:
        a = np.zeros((30, 30))
        a[5, 5] = 0.5
        a[20, 20] = 0.5
        F = np.zeros((30, 30))
        F[5, 5] = 0.5 * 60.0                         # 60 MW when burning: MODIS at nadir would flag it
        F[20, 20] = 0.5 * 1.0                        # 1 MW when burning: below the MODIS limit
        out = update(GridState(a, F, np.zeros((30, 30))), _pass([], [], []), self.p)
        self.assertLess(float(out.a[5, 5]), 0.2)
        self.assertGreater(float(out.a[20, 20]), 0.49)
        # the clear-sky share is a prior: with it at zero a silent look changes nothing
        blind = update(GridState(a, F, np.zeros((30, 30))), _pass([], [], []), OccupancyParams(clear_sky=0.0))
        np.testing.assert_allclose(blind.a, a)


class ReconstructionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.det = _fixture()
        cls.grid = EvalGrid.from_bbox(BOX)
        cls.modis = cls.det.select(cls.det.is_modis)
        cls.recon = OccupancyReconstruction(cls.grid, cls.modis)

    def test_no_rows_means_no_fire(self) -> None:
        empty = OccupancyReconstruction(self.grid, self.det.select(np.zeros(len(self.det), dtype=bool)))
        est = empty.estimate(1.0e9)
        self.assertEqual(float(est.a.sum()), 0.0)
        self.assertEqual(float(est.F.sum()), 0.0)

    def test_at_an_assimilated_pass_the_flagged_pixels_hold_that_pass_frp(self) -> None:
        obs = self.recon.passes[3]
        est = self.recon.estimate(obs.time_s)
        covered = np.zeros(self.grid.shape, dtype=bool)
        for rows, cols in obs.cells:
            covered[rows, cols] = True
        self.assertAlmostEqual(float(est.F[covered].sum()), obs.frp_total_mw, delta=1e-6 * max(obs.frp_total_mw, 1.0))
        # cells the pass did not flag may keep fire the pass could have missed: the total is never below the pass
        self.assertGreaterEqual(float(est.F.sum()), obs.frp_total_mw - 1e-6)
        self.assertEqual(est.age_h, 0.0)

    def test_fire_is_estimated_only_near_detections(self) -> None:
        t_mid = 0.5 * (self.recon.times[2] + self.recon.times[3])
        est = self.recon.estimate(float(t_mid))
        rows, cols = np.nonzero(est.a > 0)
        lon, lat = self.grid.cell_lonlat()
        d_lon = np.abs(lon[rows, cols][:, None] - self.modis.lon[None, :]) * self.grid.km_per_deg_lon
        d_lat = np.abs(lat[rows, cols][:, None] - self.modis.lat[None, :]) * self.grid.km_per_deg_lat
        nearest = np.min(np.hypot(d_lon, d_lat), axis=1)
        self.assertLess(float(nearest.max()), 8.0)      # nothing further than 8 km from any MODIS detection
        self.assertEqual(float(est.a[0, 0]), 0.0)

    def test_uncertainty_grows_with_the_age_of_the_information(self) -> None:
        t0, t1 = float(self.recon.times[2]), float(self.recon.times[3])
        at = self.recon.estimate(t0)
        mid = self.recon.estimate(0.5 * (t0 + t1))
        self.assertGreater(mid.rel_sd_log, at.rel_sd_log)
        self.assertGreater(mid.age_h, 0.0)

    def test_hidden_prediction_is_probabilities_and_a_stated_interval(self) -> None:
        t = float(0.5 * (self.recon.times[4] + self.recon.times[5]))
        out = self.recon.predict_hidden(t, "VIIRS", True, 0.15)
        self.assertTrue(np.all((out["p_detect"] >= 0) & (out["p_detect"] <= 1)))
        self.assertLessEqual(out["lo_mw"], out["total_mw"])
        self.assertLessEqual(out["total_mw"], out["hi_mw"])
        self.assertEqual(out["level"], 0.90)
        self.assertAlmostEqual(out["total_mw"], float(out["frp_mw"].sum()), places=6)

    def test_declared_cells_are_the_expected_number_of_most_probable_cells(self) -> None:
        p = np.zeros((4, 4))
        p[0, 0], p[0, 1], p[1, 1], p[2, 2] = 0.9, 0.7, 0.3, 0.1      # sums to 2.0
        cells = expected_count_cells(p)
        self.assertEqual(int(cells.sum()), 2)
        self.assertTrue(cells[0, 0] and cells[0, 1])
        self.assertEqual(int(expected_count_cells(np.zeros((3, 3))).sum()), 0)


class GeometryTests(unittest.TestCase):
    def test_nominal_crossing_times_at_40_north(self) -> None:
        # Terra descends at 10:30 and is about half an hour later at 40 N; the 13:30 ascenders are about half an hour earlier
        self.assertAlmostEqual(G.nominal_subsat_lst_hr("MODIS_TERRA", True, 40.0), 11.0, delta=0.08)
        self.assertAlmostEqual(G.nominal_subsat_lst_hr("MODIS_AQUA", True, 40.0), 13.0, delta=0.08)
        self.assertAlmostEqual(G.nominal_subsat_lst_hr("VIIRS_SNPP", True, 40.0), 13.0, delta=0.08)
        self.assertAlmostEqual(G.nominal_subsat_lst_hr("MODIS_TERRA", False, 40.0), 22.0, delta=0.08)
        self.assertAlmostEqual(G.nominal_subsat_lst_hr("VIIRS_NOAA20", False, 40.0), 2.0, delta=0.08)
        self.assertAlmostEqual(G.nominal_subsat_lst_hr("MODIS_AQUA", True, 0.0), 13.5, places=6)

    def test_pixel_size_gives_view_zenith(self) -> None:
        self.assertLess(G.view_zenith_deg("MODIS_AQUA", 1.0, 1.0), 3.0)
        self.assertGreater(G.view_zenith_deg("MODIS_AQUA", 4.8, 2.0), 60.0)
        self.assertLess(G.view_zenith_deg("VIIRS_SNPP", 0.39, 0.36), 5.0)
        self.assertGreater(G.view_zenith_deg("VIIRS_SNPP", 0.78, 0.78), 60.0)
        self.assertAlmostEqual(G.cross_track_km("MODIS_AQUA", 0.0), 0.0)
        self.assertTrue(1000.0 < G.cross_track_km("MODIS_AQUA", 65.0) < 1250.0)

    def _op(self, platform: str, is_day: bool, lst: float, scan: float, track: float) -> Overpass:
        return Overpass(platform=platform, time_s=0.0, is_day=is_day, index=np.array([0]), scan_km=scan, track_km=track, lst_hr=lst)

    def test_a_pixel_seen_later_than_the_crossing_has_the_satellite_to_its_west(self) -> None:
        late = G.pass_geometry(self._op("MODIS_AQUA", True, 13.6, 1.9, 1.3), -121.18, 40.05)
        early = G.pass_geometry(self._op("MODIS_AQUA", True, 12.4, 1.9, 1.3), -121.18, 40.05)
        self.assertEqual(late["satellite_side"], "west")
        self.assertEqual(early["satellite_side"], "east")
        self.assertLess(math.sin(math.radians(late["azimuth_deg"])), 0.0)
        self.assertGreater(math.sin(math.radians(early["azimuth_deg"])), 0.0)
        self.assertLess(late["subsat_lon"], -121.18)
        self.assertGreater(early["subsat_lon"], -121.18)
        self.assertEqual(late["orbit_node"], "ascending")
        self.assertEqual(late["sensor_code"], 1)
        for key in ("sensor", "subsat_lat", "altitude_km", "scan_angle_deg", "view_zenith_deg"):
            self.assertIn(key, late)

    def test_crossing_offset_is_recovered_from_passes(self) -> None:
        lat = 40.0
        nominal = G.nominal_subsat_lst_hr("MODIS_AQUA", True, lat)
        drift = 0.25                                   # a quarter of an hour late, as a drifted orbit would be
        passes = []
        for scan, track, sign in ((1.0, 1.0, 0), (1.5, 1.2, 1), (1.5, 1.2, -1), (2.4, 1.5, 1), (2.4, 1.5, -1), (3.6, 1.8, 1)):
            d_hr = G.cross_track_km("MODIS_AQUA", G.view_zenith_deg("MODIS_AQUA", scan, track)) * G._hours_per_km("MODIS_AQUA", True, lat)
            passes.append(self._op("MODIS_AQUA", True, (nominal + drift + sign * d_hr) % 24.0, scan, track))
        off = G.crossing_offsets(passes, lat)[("MODIS_AQUA", True)]
        self.assertAlmostEqual(off["offset_hr"], drift, delta=0.04)
        few = G.crossing_offsets(passes[:2], lat)[("MODIS_AQUA", True)]
        self.assertEqual(few["offset_hr"], 0.0)

    def test_fixture_passes_get_geometry(self) -> None:
        det = _fixture()
        for op in group_overpasses(det)[:6]:
            g = G.pass_geometry(op, -121.18, 40.05)
            self.assertTrue(0.0 <= g["scan_angle_deg"] <= 56.3)
            self.assertTrue(0.0 <= g["azimuth_deg"] < 360.0)


if __name__ == "__main__":
    unittest.main()
