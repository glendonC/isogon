"""The harmonization candidates on invented rows: a held-out year's own rows never reach its prediction, the method
in use is one ratio of sums, and the interval is set from other years' errors."""

from __future__ import annotations

import unittest

import numpy as np

from backend.model import harmonize as H


def invented(seed: int = 3, places: int = 12, years: int = 6) -> tuple[dict[str, np.ndarray], np.ndarray, H.Places]:
    rng = np.random.default_rng(seed)
    T = years * 12
    months = 12 * 12 + np.arange(T)
    X = {c: np.zeros((places, T)) for c in H.CHANNELS}
    fire = rng.gamma(0.6, 40.0, size=(places, T))
    for p in "TA":
        for d, share in (("D", 0.8), ("N", 0.2)):
            X[f"n_{p}_{d}"] = rng.poisson(fire * share * 0.5).astype(float)
            X[f"frp_{p}_{d}"] = X[f"n_{p}_{d}"] * rng.uniform(20, 80, size=(places, T))
        for k in range(H.N_SCAN):
            X[f"n_{p}_s{k}"] = (X[f"n_{p}_D"] + X[f"n_{p}_N"]) / H.N_SCAN
            X[f"frp_{p}_s{k}"] = (X[f"frp_{p}_D"] + X[f"frp_{p}_N"]) / H.N_SCAN
        X[f"area_{p}"] = X[f"n_{p}_D"] + X[f"n_{p}_N"]
    for s in "SJ":
        for d, share in (("D", 0.6), ("N", 0.4)):
            X[f"n_{s}_{d}"] = rng.poisson(fire * share * 4.0).astype(float)
            X[f"frp_{s}_{d}"] = X[f"n_{s}_{d}"] * rng.uniform(5, 20, size=(places, T))
    band = (np.arange(places) // 4).astype(np.int64)
    src = np.array([i for i in range(places) for j in (i - 1, i + 1) if 0 <= j < places])
    dst = np.array([j for i in range(places) for j in (i - 1, i + 1) if 0 <= j < places])
    return X, months, H.Places(band=band, nb_src=src, nb_dst=dst)


class HeldOutTest(unittest.TestCase):
    def test_held_out_year_rows_never_reach_its_prediction(self) -> None:
        X, months, places = invented()
        clean = np.ones(months.size, dtype=bool)
        sharp = clean.copy()
        year = H.FIRST_YEAR + months // 12
        y = int(year[30])
        changed = {k: v.copy() for k, v in X.items()}
        for k in changed:
            if k.startswith(("n_S", "n_J", "frp_S", "frp_J")):
                changed[k][:, year == y] *= 7.0
        for spec in H.SPECS:
            for q in ("n", "frp"):
                if q == "frp" and spec.name in H.FRP_SKIP:
                    continue
                a = H.held_out(X, months, clean, spec, places, q, 1.0, sharp)
                b = H.held_out(changed, months, clean, spec, places, q, 1.0, sharp)
                np.testing.assert_allclose(a[:, year == y], b[:, year == y], err_msg=f"{spec.name} {q}")

    def test_in_use_is_one_ratio_of_sums_per_place(self) -> None:
        X, months, places = invented()
        train = np.ones(months.size, dtype=bool)
        pred = H.candidate(H.SPEC_BY_NAME["in_use"])(X, months, train, places)
        V = X["n_S_D"] + X["n_S_N"]
        M = sum(X[f"n_{p}_{d}"] for p in "TA" for d in "DN")
        np.testing.assert_allclose(pred, (V.sum(axis=1) / M.sum(axis=1))[:, None] * M)

    def test_pooled_predicts_a_place_with_no_rows_of_its_own(self) -> None:
        X, months, places = invented()
        for k in X:
            X[k][0] = 0.0
        X["n_T_D"][0, -1] = 5.0
        train = np.ones(months.size, dtype=bool)
        train[-1] = False
        pred = H.candidate(H.SPEC_BY_NAME["pooled"])(X, months, train, places)
        self.assertTrue(np.isfinite(pred[0]).all())
        self.assertGreater(pred[0, -1], 5.0)

    def test_interval_from_other_errors_covers_its_level_on_like_errors(self) -> None:
        rng = np.random.default_rng(0)
        pred = rng.uniform(5, 500, size=20000)
        obs = pred * np.exp(rng.normal(0, 0.4, size=pred.size))
        tab = H.interval_table(pred[:10000], obs[:10000])
        lo, hi = H.apply_interval(pred[10000:], tab)
        inside = ((obs[10000:] >= lo) & (obs[10000:] <= hi)).mean()
        self.assertAlmostEqual(inside, 0.80, delta=0.02)
        self.assertTrue((lo <= pred[10000:] + 1.0).all() and (hi >= pred[10000:] - 1.0).all())


if __name__ == "__main__":
    unittest.main()
