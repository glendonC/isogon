"""The Record's call on invented monthly records: its shape, the interval around the prediction, and a closed year
that is never held out or published."""

from __future__ import annotations

import unittest

import numpy as np

from backend.model import harmonize as H
from backend.model.harmonize_fitted import FITTED


def records(seed: int = 1) -> list[dict]:
    rng = np.random.default_rng(seed)
    out = []
    for y in range(2000, 2026):
        for m in range(1, 13):
            if (y, m) < (2000, 11):
                continue
            fire = float(rng.gamma(0.8, 30.0))

            def c(n: float) -> dict:
                n = int(rng.poisson(n))
                return {"day": n // 2, "night": n - n // 2, "total": n, "outage_days": 0, "frp": 30.0 * n}

            rc = {"Terra": c(fire * 0.5), "Aqua": c(fire * 0.5) if (y, m) >= (2002, 7) else None,
                  "Suomi NPP": c(fire * 4.0) if y >= 2012 else None, "NOAA-20": None, "NOAA-21": None}
            out.append({"year_month": f"{y:04d}-{m:02d}", "raw_counts": rc})
    return out


class RecordTest(unittest.TestCase):
    def test_shape_and_interval_around_the_prediction(self) -> None:
        rec = records()
        out = H.record_series(rec, area_km2=40000.0, center_lat=40.5)
        self.assertEqual(len(out["months"]), len(rec))
        self.assertEqual(out["method"]["id"], FITTED["serve"]["rows"])
        self.assertEqual(out["method"]["interval"]["level"], 0.8)
        for row in out["months"]:
            if row["harmonized_count"] is None:
                continue
            self.assertLessEqual(row["p10_count"], row["harmonized_count"] + 1e-6)
            self.assertGreaterEqual(row["p90_count"], row["harmonized_count"] - 1e-6)
        before_aqua = [r for r in out["months"] if r["year_month"] < "2002-07"]
        self.assertTrue(all(r["ratio_used"] == "terra_only" for r in before_aqua))
        self.assertNotIn("2012-01", out["method"]["fitted_on"]["months"])

    def test_frp_uses_its_own_tables(self) -> None:
        out = H.record_series(records(), center_lat=40.5, quantity="frp")
        self.assertEqual(out["method"]["unit"], "MW of fire radiative power")
        self.assertEqual(out["method"]["interval"]["tables"], "frp_terra_aqua")
        rows = H.record_series(records(), center_lat=40.5)
        a = [m["harmonized_count"] for m in out["months"] if m["harmonized_count"]]
        b = [m["harmonized_count"] for m in rows["months"] if m["harmonized_count"]]
        self.assertGreater(sum(a), 10 * sum(b))

    def test_closed_years_of_a_box_follow_the_closed_rule(self) -> None:
        from backend.firms import region_box

        self.assertEqual(H.closed_years_for_box(region_box("plumas_ca")), (2021,))
        self.assertEqual(H.closed_years_for_box((10.0, -5.0, 12.0, -3.0)), ())

    def test_a_closed_year_is_not_held_out_or_published(self) -> None:
        out = H.record_series(records(), center_lat=40.5, closed_years=(2021,), fitted=FITTED)
        self.assertNotIn(2021, [r["year"] for r in out["check"]["per_year"]])
        self.assertEqual(out["check"]["years_not_held_out"], [2021])
        self.assertEqual(len(out["check"]["per_year"]), 13)


class ServedTest(unittest.TestCase):
    def test_one_place_is_predicted_as_the_world_fit_predicts_it(self) -> None:
        from backend.tests.test_model_harmonize_heldout import invented

        X, months, places = invented(seed=5, places=16, years=8)
        train = np.ones(months.size, dtype=bool)
        train[-14:] = False
        spec = H.SPEC_BY_NAME["pooled_month_size"]
        f = H.Fit()
        world = H.fit_predict(X, months, train, spec, places, "n", 1.0, None, f)
        params = H.served_params(f, places, 1.0)
        V = X["n_S_D"] + X["n_S_N"]
        M = sum(X[f"n_{p}_{d}"] for p in "TA" for d in "DN")
        for p in (0, 5, 9):
            nb = places.nb_dst[places.nb_src == p]
            lat = float(places.band[p]) * 10.0 - 90.0 + 5.0
            one = H.served_predict(V[p], M[p], months % 12, train, params, lat,
                                   float(V[nb][:, train].sum()), float(M[nb][:, train].sum()))
            np.testing.assert_allclose(one, world[p], rtol=1e-9, atol=1e-9)

    def test_the_pooled_method_can_be_served(self) -> None:
        fitted = {**FITTED, "serve": {"rows": "pooled_month_size_v1", "frp": "overlap_ratio_v1"}}
        out = H.record_series(records(), area_km2=40000.0, center_lat=40.5, closed_years=(2021,), fitted=fitted)
        self.assertEqual(out["method"]["id"], "pooled_month_size_v1")
        self.assertIn("latitude band", out["method"]["fitted_on"]["prior"])
        self.assertNotIn(2021, [r["year"] for r in out["check"]["per_year"]])
        done = [r for r in out["months"] if r["harmonized_count"] is not None]
        self.assertGreater(len(done), 300)
        self.assertTrue(all(r["p10_count"] <= r["harmonized_count"] + 1e-6 <= r["p90_count"] + 2e-6 for r in done))


if __name__ == "__main__":
    unittest.main()


def lava_records(seed: int = 2) -> list[dict]:
    """A lava lake that Suomi NPP sees every month and MODIS almost never, gone in 2016 to 2019, and an eruption in
    2018 that MODIS sees well."""
    rng = np.random.default_rng(seed)
    out = []
    for y in range(2000, 2026):
        for m in range(1, 13):
            if (y, m) < (2000, 11):
                continue
            lake = not (2016 <= y <= 2019)
            modis, sharp = (150.0, 450.0) if y == 2018 else ((0.05, 300.0) if lake else (0.0, 0.0))

            def c(n: float) -> dict:
                n = int(rng.poisson(n))
                return {"day": n // 2, "night": n - n // 2, "total": n, "outage_days": 0, "frp": 30.0 * n}

            rc = {"Terra": c(modis / 2), "Aqua": c(modis / 2) if (y, m) >= (2002, 7) else None,
                  "Suomi NPP": c(sharp) if y >= 2012 else None, "NOAA-20": None, "NOAA-21": None}
            out.append({"year_month": f"{y:04d}-{m:02d}", "raw_counts": rc})
    return out


class StabilityTest(unittest.TestCase):
    def year(self, y: int, observed: float, predicted: float) -> dict:
        return {"year": y, "suomi_npp_observed": observed, "predicted": predicted}

    def test_an_ordinary_place_is_stable(self) -> None:
        st = H.record_series(records(), center_lat=40.5)["check"]["ratio_stability"]
        self.assertEqual(st["verdict"], "stable")
        self.assertTrue(st["stable"])
        self.assertNotIn("note", st)

    def test_a_lava_lake_is_not_stable_and_says_so(self) -> None:
        st = H.record_series(lava_records(), center_lat=19.5)["check"]["ratio_stability"]
        self.assertEqual(st["verdict"], "not stable")
        self.assertFalse(st["stable"])
        self.assertGreaterEqual(len(st["years_departing"]), H.STABLE_MIN_DEPARTING)
        self.assertIn("not meaningful", st["note"])

    def test_one_departing_year_does_not_flag(self) -> None:
        rows = [self.year(y, 400.0, 380.0) for y in range(2012, 2025)] + [self.year(2025, 30.0, 900.0)]
        st = H.ratio_stability(rows)
        self.assertEqual(st["verdict"], "stable")
        self.assertEqual(st["years_departing"], [2025])
        self.assertEqual(st["worst_year"]["year"], 2025)
        st = H.ratio_stability(rows + [self.year(2026, 2000.0, 100.0)])
        self.assertEqual(st["verdict"], "not stable")

    def test_years_with_few_rows_are_not_tested(self) -> None:
        st = H.ratio_stability([self.year(y, 3.0, 40.0) for y in range(2012, 2026)])
        self.assertEqual(st["verdict"], "not tested")
        self.assertIsNone(st["stable"])

    def test_a_closed_year_is_not_tested(self) -> None:
        st = H.record_series(lava_records(), center_lat=19.5, closed_years=(2017,))["check"]["ratio_stability"]
        self.assertNotIn(2017, st["years_tested"] + st["years_departing"])

    def test_fire_radiative_power_is_not_flagged(self) -> None:
        st = H.record_series(records(), center_lat=40.5, quantity="frp")["check"]["ratio_stability"]
        self.assertEqual(st["verdict"], "not tested")
