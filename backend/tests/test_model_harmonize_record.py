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
                return {"day": n // 2, "night": n - n // 2, "total": n, "outage_days": 0}

            rc = {"Terra": c(fire * 0.5), "Aqua": c(fire * 0.5) if (y, m) >= (2002, 7) else None,
                  "Suomi NPP": c(fire * 4.0) if y >= 2012 else None, "NOAA-20": None, "NOAA-21": None}
            out.append({"year_month": f"{y:04d}-{m:02d}", "raw_counts": rc})
    return out


class RecordTest(unittest.TestCase):
    def test_shape_and_interval_around_the_prediction(self) -> None:
        rec = records()
        out = H.record_series(rec, area_km2=40000.0, center_lat=40.5)
        self.assertEqual(len(out["months"]), len(rec))
        self.assertEqual(out["method"]["id"], "overlap_ratio_v1")
        self.assertEqual(out["method"]["interval"]["level"], 0.8)
        for row in out["months"]:
            if row["harmonized_count"] is None:
                continue
            self.assertLessEqual(row["p10_count"], row["harmonized_count"] + 1e-6)
            self.assertGreaterEqual(row["p90_count"], row["harmonized_count"] - 1e-6)
        before_aqua = [r for r in out["months"] if r["year_month"] < "2002-07"]
        self.assertTrue(all(r["ratio_used"] == "terra_only" for r in before_aqua))
        self.assertNotIn("2012-01", out["method"]["fitted_on"]["months"])

    def test_a_closed_year_is_not_held_out_or_published(self) -> None:
        out = H.record_series(records(), center_lat=40.5, closed_years=(2021,), fitted=FITTED)
        self.assertNotIn(2021, [r["year"] for r in out["check"]["per_year"]])
        self.assertEqual(out["check"]["years_not_held_out"], [2021])
        self.assertEqual(len(out["check"]["per_year"]), 13)


if __name__ == "__main__":
    unittest.main()
