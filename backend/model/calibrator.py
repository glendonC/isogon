"""Stage 2 Learned Hurdle-Quantile Cross-Sensor Calibrator + Split Conformal Wrapper.

Trains a self-contained statistical/ML calibration model in pure NumPy at startup
(<80 ms) on a deterministic 1,200-sample paired 13:30 LST MODIS Aqua + VIIRS NOAA-20
co-observation corpus generated from `sensor_physics.py` across scan angles 0..55 deg,
terrain slopes, cloud fractions, and biomes (800 train / 400 split-conformal calibration):

  1. Hurdle Omission Classifier (`predict_omission_prob`):
     L2-regularized logistic regression fit via Newton-IRLS on
     `[1, vza_norm, log1p(modis_area), is_day, slope_deg_norm, cloud_frac, modis_obs_density]`
     predicting P(sub-pixel VIIRS thermal activity omitted by coarse MODIS).

  2. Quantile / Ridge Flux Debiasing Head (`predict_calibrated_flux`):
     Asymmetric pinball-loss IRLS quantile regression for (q10, q50, q90) on
     `[1, log1p(modis_density), vza_norm, bow_tie_area_ratio, slope_foreshortening, hurdle_prob]`
     mapping distorted off-nadir MODIS density onto VIIRS 375 m nadir-equivalent density.

  3. Split Conformal Interval Calibration (Romano, Patterson & Candes 2019):
     Evaluates nonconformity scores s_i = max(q10(x_i) - y_i, y_i - q90(x_i)) on the
     400 held-out calibration pairs and sets c90 = Quantile_{ceil(0.90*(n+1))/n}(s),
     guaranteeing >= 90% finite-sample marginal coverage.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
import time
from typing import Any

import numpy as np
from numpy.typing import ArrayLike, NDArray

from backend.model.sensor_physics import (
    MODIS_MAX_SCAN_DEG,
    detection_midpoint_mw,
    detection_probability,
    modis_geometry_from_scan,
    slant_path_transmittance,
    viirs_geometry_from_scan,
)

HURDLE_FEATURE_NAMES: tuple[str, ...] = (
    "intercept",
    "vza_norm",
    "log1p_modis_area",
    "is_day",
    "slope_deg_norm",
    "cloud_frac",
    "modis_obs_density",
)

QUANTILE_FEATURE_NAMES: tuple[str, ...] = (
    "intercept",
    "log1p_modis_density",
    "vza_norm",
    "bow_tie_area_ratio",
    "slope_foreshortening",
    "hurdle_prob",
)


@dataclass(frozen=True)
class CalibratorDiagnostics:
    """Quantitative training & split-conformal diagnostics for Stage 2 calibrator."""

    train_samples: int
    calibration_samples: int
    hurdle_feature_names: list[str]
    hurdle_weights: list[float]
    hurdle_brier_score: float
    quantile_feature_names: list[str]
    q10_weights: list[float]
    q50_weights: list[float]
    q90_weights: list[float]
    pinball_loss_mw_km2: dict[str, float]
    c90_mw_km2: float
    empirical_coverage_pct: float
    raw_modis_rmse_mw_km2: float
    calibrated_q50_rmse_mw_km2: float
    fit_duration_ms: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "train_samples": self.train_samples,
            "calibration_samples": self.calibration_samples,
            "hurdle_feature_names": self.hurdle_feature_names,
            "hurdle_weights": self.hurdle_weights,
            "hurdle_brier_score": self.hurdle_brier_score,
            "quantile_feature_names": self.quantile_feature_names,
            "q10_weights": self.q10_weights,
            "q50_weights": self.q50_weights,
            "q90_weights": self.q90_weights,
            "pinball_loss_mw_km2": self.pinball_loss_mw_km2,
            "c90_mw_km2": self.c90_mw_km2,
            "empirical_coverage_pct": self.empirical_coverage_pct,
            "raw_modis_rmse_mw_km2": self.raw_modis_rmse_mw_km2,
            "calibrated_q50_rmse_mw_km2": self.calibrated_q50_rmse_mw_km2,
            "fit_duration_ms": self.fit_duration_ms,
        }


@dataclass(frozen=True)
class CalibratedFluxPrediction:
    """Vectorized calibrated quantile & split-conformal prediction output."""

    hurdle_prob: NDArray[np.float64]
    q10_mw_km2: NDArray[np.float64]
    q50_mw_km2: NDArray[np.float64]
    q90_mw_km2: NDArray[np.float64]
    ci90_low_mw_km2: NDArray[np.float64]
    ci90_high_mw_km2: NDArray[np.float64]
    conformal_sigma_mw_km2: NDArray[np.float64]


def _sigmoid(z: NDArray[np.float64]) -> NDArray[np.float64]:
    zc = np.clip(z, -36.0, 36.0)
    return 1.0 / (1.0 + np.exp(-zc))


def _pinball_loss(y_true: NDArray[np.float64], y_pred: NDArray[np.float64], tau: float) -> float:
    err = y_true - y_pred
    return float(np.mean(np.where(err >= 0.0, tau * err, (tau - 1.0) * err)))


def _generate_paired_1330_corpus(
    n_samples: int = 1200,
    seed: int = 20261330,
) -> dict[str, NDArray[np.float64]]:
    """Synthesize deterministic 1,200-sample paired MODIS Aqua + VIIRS NOAA-20 corpus."""
    rng = np.random.default_rng(seed)

    # Scan angles across full MODIS [0..55 deg] whiskbroom swath & co-aligned VIIRS [0..42 deg]
    modis_scan_deg = rng.uniform(0.0, MODIS_MAX_SCAN_DEG, size=n_samples)
    viirs_scan_deg = rng.uniform(0.0, 42.0, size=n_samples)

    m_geom = modis_geometry_from_scan(modis_scan_deg)
    v_geom = viirs_geometry_from_scan(viirs_scan_deg)

    m_vza_deg = m_geom["view_zenith_deg"]
    m_area_km2 = m_geom["area_km2"]
    v_vza_deg = v_geom["view_zenith_deg"]
    v_area_km2 = v_geom["area_km2"]

    # 78% 13:30 LST daytime co-observations, 22% 01:30 LST nighttime co-observations
    is_day_bool = rng.random(n_samples) < 0.78
    is_day = is_day_bool.astype(np.float64)

    # Topographic slope [0..42 deg] & biome sub-pixel clustering factor
    slope_deg = rng.beta(1.5, 2.8, size=n_samples) * 42.0
    biome_fill_frac = rng.choice(
        np.array([0.28, 0.42, 0.58, 0.74, 0.86], dtype=np.float64),
        size=n_samples,
    )
    cloud_frac = rng.beta(1.2, 5.2, size=n_samples) * 0.64

    # Slope foreshortening along oblique look sightline
    vza_rad = np.deg2rad(m_vza_deg)
    slope_rad = np.deg2rad(slope_deg)
    az_offset_rad = rng.uniform(-0.85 * math.pi, 0.85 * math.pi, size=n_samples)
    cos_inc = np.clip(
        np.cos(slope_rad) * np.cos(vza_rad)
        + np.sin(slope_rad) * np.sin(vza_rad) * np.cos(az_offset_rad),
        0.08,
        1.0,
    )
    slope_foreshortening = np.clip(1.0 - cos_inc, 0.0, 0.92)

    # Latent 375m-scale fire intensity & physical front fill across coarse MODIS pixels:
    #   - 14% background / cool perimeter (< 0.4 MW/km^2)
    #   - 36% localized sub-pixel flank/spot clusters (2.2..11.5 MW/km^2 -> omitted by off-nadir MODIS!)
    #   - 50% active flaming fronts (12.0..72.0 MW/km^2)
    regime_u = rng.random(n_samples)
    y_latent = np.where(
        regime_u < 0.14,
        rng.uniform(0.0, 0.35, size=n_samples),
        np.where(
            regime_u < 0.50,
            np.exp(rng.uniform(math.log(2.2), math.log(11.5), size=n_samples)),
            np.exp(rng.uniform(math.log(12.0), math.log(72.0), size=n_samples)),
        ),
    )

    # VIIRS 375 m reference target (375 m nadir-equivalent density)
    tau_viirs = slant_path_transmittance(v_vza_deg, tau4_nadir=0.060)
    viirs_fp_mw = y_latent * v_area_km2 * tau_viirs * np.clip(1.0 - 0.45 * cloud_frac, 0.20, 1.0)
    pi_viirs_day = detection_probability(viirs_fp_mw, v_area_km2, "VIIRS", is_day=True)
    pi_viirs_night = detection_probability(viirs_fp_mw, v_area_km2, "VIIRS", is_day=False)
    pi_viirs = np.where(is_day_bool, pi_viirs_day, pi_viirs_night)

    viirs_noise = np.clip(1.0 + rng.normal(0.0, 0.055, size=n_samples), 0.82, 1.20)
    y_viirs_nadir_equiv = np.where(
        pi_viirs >= 0.28,
        y_latent * viirs_noise,
        0.0,
    )

    # Coarse MODIS Aqua observation matching 2D bow-tie PSF smoothing across finite-width fire fronts:
    # peak density is attenuated by slant-path atmosphere, canyon slope foreshortening, cloud opacity,
    # and off-nadir bow-tie PSF broadening (~1 / (1 + 0.075 * (A_modis - 1))).
    tau_modis = slant_path_transmittance(m_vza_deg, tau4_nadir=0.090)
    psf_front_retention = 1.0 / (1.0 + 0.072 * (m_area_km2 - 1.0) * (1.20 - 0.45 * biome_fill_frac))
    foreshorten_trans = 1.0 - 0.36 * slope_foreshortening
    cloud_trans = np.clip(1.0 - cloud_frac, 0.0, 1.0) ** 1.60

    blurred_modis_density = y_latent * tau_modis * psf_front_retention * foreshorten_trans
    # Sub-pixel clusters occupy finite area inside off-nadir MODIS footprints when testing 12 MW threshold
    effective_cluster_area = np.where(regime_u < 0.50, np.minimum(m_area_km2, 0.95), m_area_km2 * 0.82)
    modis_fp_mw = blurred_modis_density * effective_cluster_area * cloud_trans

    pi_modis_day = detection_probability(modis_fp_mw, m_area_km2, "MODIS", is_day=True)
    pi_modis_night = detection_probability(modis_fp_mw, m_area_km2, "MODIS", is_day=False)
    pi_modis = np.where(is_day_bool, pi_modis_day, pi_modis_night)

    d50_day = detection_midpoint_mw(m_area_km2, "MODIS", is_day=True)
    d50_night = detection_midpoint_mw(m_area_km2, "MODIS", is_day=False)
    ctx_thresh = np.maximum(12.0, 0.85 * np.where(is_day_bool, d50_day, d50_night))
    soft_gate = np.where(
        modis_fp_mw < 10.5,
        0.0,
        1.0 / (1.0 + np.exp(-1.15 * (modis_fp_mw - ctx_thresh))),
    )
    modis_noise = np.clip(1.0 + rng.normal(0.0, 0.095, size=n_samples), 0.74, 1.30)
    modis_obs_density = blurred_modis_density * cloud_trans * pi_modis * soft_gate * modis_noise
    modis_obs_density = np.where(modis_obs_density >= 0.30, modis_obs_density, 0.0)

    # Binary hurdle target: sub-pixel VIIRS thermal activity completely missed by coarse MODIS
    omitted_target = ((y_viirs_nadir_equiv >= 1.2) & (modis_obs_density <= 0.30)).astype(np.float64)

    return {
        "vza_deg": m_vza_deg,
        "modis_area_km2": m_area_km2,
        "is_day": is_day,
        "slope_deg": slope_deg,
        "cloud_frac": cloud_frac,
        "slope_foreshortening": slope_foreshortening,
        "modis_obs_density": modis_obs_density,
        "y_viirs": y_viirs_nadir_equiv,
        "omitted_target": omitted_target,
    }


def _fit_logistic_newton_irls(
    x_mat: NDArray[np.float64],
    y_bin: NDArray[np.float64],
    l2_penalty: float = 1.5,
    max_iter: int = 10,
) -> NDArray[np.float64]:
    """Fit L2-regularized binary logistic regression via exact Newton-IRLS."""
    n_features = x_mat.shape[1]
    beta = np.zeros(n_features, dtype=np.float64)
    reg_diag = np.full(n_features, l2_penalty, dtype=np.float64)
    reg_diag[0] = 1e-6  # Do not shrink intercept

    for _ in range(max_iter):
        eta = x_mat @ beta
        prob = _sigmoid(eta)
        w = np.maximum(prob * (1.0 - prob), 1e-5)
        grad = x_mat.T @ (prob - y_bin) + reg_diag * beta
        hess = (x_mat.T * w) @ x_mat + np.diag(reg_diag)
        step = np.linalg.solve(hess, grad)
        beta = beta - step
        if float(np.max(np.abs(step))) < 1e-7:
            break
    return beta


def _fit_pinball_irls(
    x_mat: NDArray[np.float64],
    z_target: NDArray[np.float64],
    tau: float,
    l2_penalty: float = 0.35,
    max_iter: int = 16,
    eps: float = 1.5e-3,
) -> NDArray[np.float64]:
    """Fit linear quantile regression under asymmetric pinball check loss via IRLS."""
    n_features = x_mat.shape[1]
    reg_mat = np.diag(np.array([1e-6] + [l2_penalty] * (n_features - 1), dtype=np.float64))

    # Warm-start from ridge regression shifted to empirical quantile
    beta = np.linalg.solve(x_mat.T @ x_mat + reg_mat, x_mat.T @ z_target)
    init_res = z_target - (x_mat @ beta)
    beta[0] += float(np.quantile(init_res, tau))

    for it in range(max_iter):
        res = z_target - (x_mat @ beta)
        abs_res = np.maximum(np.abs(res), eps)
        weights = np.where(res >= 0.0, tau / abs_res, (1.0 - tau) / abs_res)
        lhs = (x_mat.T * weights) @ x_mat + reg_mat
        rhs = x_mat.T @ (weights * z_target)
        beta_new = np.linalg.solve(lhs, rhs)
        mix = 0.65 if it >= 12 else 1.0
        step_norm = float(np.max(np.abs(beta_new - beta)))
        beta = mix * beta_new + (1.0 - mix) * beta
        if step_norm < 1e-6:
            break
    return beta


class CrossSensorCalibrator:
    """Stage 2 Learned Hurdle-Quantile Cross-Sensor Calibrator + Split Conformal Wrapper."""

    def __init__(
        self,
        beta_hurdle: NDArray[np.float64],
        beta_q10: NDArray[np.float64],
        beta_q50: NDArray[np.float64],
        beta_q90: NDArray[np.float64],
        c90_mw_km2: float,
        diagnostics: CalibratorDiagnostics,
        sub_q50_mw_km2: float = 6.5,
        sub_q90_mw_km2: float = 14.0,
    ) -> None:
        self.beta_hurdle = beta_hurdle
        self.beta_q10 = beta_q10
        self.beta_q50 = beta_q50
        self.beta_q90 = beta_q90
        self.c90_mw_km2 = float(c90_mw_km2)
        self.diagnostics = diagnostics
        self.sub_q50_mw_km2 = float(sub_q50_mw_km2)
        self.sub_q90_mw_km2 = float(sub_q90_mw_km2)

    @classmethod
    def fit_default(cls, n_total: int = 1200, n_train: int = 800) -> CrossSensorCalibrator:
        """Train Stage 2 calibrator & split-conformal wrapper on 800/400 paired corpus."""
        t0 = time.perf_counter()
        corpus = _generate_paired_1330_corpus(n_samples=n_total, seed=20261330)

        vza_norm = corpus["vza_deg"] / 65.0
        log1p_area = np.log1p(corpus["modis_area_km2"])
        slope_norm = corpus["slope_deg"] / 45.0
        bow_tie_ratio = corpus["modis_area_km2"] / 1.0  # Ratio vs 1.0 km^2 nadir MODIS IFOV

        x_hurdle_all = np.column_stack(
            [
                np.ones(n_total, dtype=np.float64),
                vza_norm,
                log1p_area,
                corpus["is_day"],
                slope_norm,
                corpus["cloud_frac"],
                corpus["modis_obs_density"],
            ]
        )
        y_omit_all = corpus["omitted_target"]
        y_viirs_all = corpus["y_viirs"]
        modis_obs_all = corpus["modis_obs_density"]

        # 1. Fit Newton-IRLS Hurdle Omission Classifier on [0:800]
        beta_hurdle = _fit_logistic_newton_irls(
            x_hurdle_all[:n_train],
            y_omit_all[:n_train],
            l2_penalty=1.25,
        )
        hurdle_prob_all = _sigmoid(x_hurdle_all @ beta_hurdle)

        # 2. Fit Pinball IRLS Quantile Heads (q10, q50, q90) on detected/active training pairs,
        # coupled with hurdle-gated sub-pixel intensity on MODIS=0 pairs (Two-Part Hurdle-Quantile)
        x_quant_all = np.column_stack(
            [
                np.ones(n_total, dtype=np.float64),
                np.log1p(modis_obs_all),
                vza_norm,
                bow_tie_ratio,
                corpus["slope_foreshortening"],
                hurdle_prob_all,
            ]
        )
        pos_train = modis_obs_all[:n_train] > 0.30
        x_pos_train = x_quant_all[:n_train][pos_train]
        z_pos_train = np.log1p(y_viirs_all[:n_train][pos_train])

        beta_q10 = _fit_pinball_irls(x_pos_train, z_pos_train, tau=0.10, l2_penalty=0.30)
        beta_q50 = _fit_pinball_irls(x_pos_train, z_pos_train, tau=0.50, l2_penalty=0.30)
        beta_q90 = _fit_pinball_irls(x_pos_train, z_pos_train, tau=0.90, l2_penalty=0.30)

        # Sub-pixel omitted fire reference quantiles (when MODIS=0 and VIIRS>0)
        omit_pos_vals = y_viirs_all[:n_train][y_omit_all[:n_train] > 0.5]
        sub_q50 = float(np.quantile(omit_pos_vals, 0.50)) if omit_pos_vals.size else 6.5
        sub_q90 = float(np.quantile(omit_pos_vals, 0.88)) if omit_pos_vals.size else 14.0

        # 3. Evaluate on 400 held-out calibration pairs [800:1200] for Split Conformal CQR
        x_cal = x_quant_all[n_train:]
        y_cal = y_viirs_all[n_train:]
        modis_cal = modis_obs_all[n_train:]
        omit_cal = y_omit_all[n_train:]
        hurdle_cal = hurdle_prob_all[n_train:]
        det_cal = modis_cal > 0.30

        pos_q10_cal = np.maximum(0.0, np.expm1(np.clip(x_cal @ beta_q10, -2.0, 5.0)))
        pos_q50_cal = np.maximum(0.0, np.expm1(np.clip(x_cal @ beta_q50, -2.0, 5.0)))
        pos_q90_cal = np.maximum(0.0, np.expm1(np.clip(x_cal @ beta_q90, -2.0, 5.0)))

        raw_q10_cal = np.where(det_cal, np.minimum(pos_q10_cal, pos_q50_cal), 0.0)
        raw_q50_cal = np.where(det_cal, pos_q50_cal, hurdle_cal * sub_q50)
        raw_q90_cal = np.where(det_cal, np.maximum(pos_q90_cal, pos_q50_cal), hurdle_cal * sub_q90)

        q10_cal = np.minimum(raw_q10_cal, raw_q50_cal)
        q90_cal = np.maximum(raw_q90_cal, raw_q50_cal)

        # Finite-sample CQR nonconformity score s_i = max(q10(x_i) - y_i, y_i - q90(x_i))
        n_cal = y_cal.size
        scores = np.maximum(q10_cal - y_cal, y_cal - q90_cal)
        sorted_scores = np.sort(scores)
        rank_idx = min(n_cal - 1, max(0, math.ceil(0.90 * (n_cal + 1)) - 1))
        c90_mw_km2 = float(max(0.0, sorted_scores[rank_idx]))

        ci_lo_cal = np.maximum(0.0, q10_cal - c90_mw_km2)
        ci_hi_cal = q90_cal + c90_mw_km2
        covered = (y_cal >= ci_lo_cal - 1e-9) & (y_cal <= ci_hi_cal + 1e-9)
        emp_cov_pct = round(float(np.mean(covered) * 100.0), 2)

        brier = round(float(np.mean((hurdle_cal - omit_cal) ** 2)), 4)
        raw_rmse = round(float(np.sqrt(np.mean((modis_cal - y_cal) ** 2))), 3)
        cal_rmse = round(float(np.sqrt(np.mean((raw_q50_cal - y_cal) ** 2))), 3)

        pinball_dict = {
            "q10": round(_pinball_loss(y_cal, q10_cal, 0.10), 4),
            "q50": round(_pinball_loss(y_cal, raw_q50_cal, 0.50), 4),
            "q90": round(_pinball_loss(y_cal, q90_cal, 0.90), 4),
        }
        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        diag = CalibratorDiagnostics(
            train_samples=n_train,
            calibration_samples=n_cal,
            hurdle_feature_names=list(HURDLE_FEATURE_NAMES),
            hurdle_weights=[round(float(w), 5) for w in beta_hurdle],
            hurdle_brier_score=brier,
            quantile_feature_names=list(QUANTILE_FEATURE_NAMES),
            q10_weights=[round(float(w), 5) for w in beta_q10],
            q50_weights=[round(float(w), 5) for w in beta_q50],
            q90_weights=[round(float(w), 5) for w in beta_q90],
            pinball_loss_mw_km2=pinball_dict,
            c90_mw_km2=round(c90_mw_km2, 3),
            empirical_coverage_pct=emp_cov_pct,
            raw_modis_rmse_mw_km2=raw_rmse,
            calibrated_q50_rmse_mw_km2=cal_rmse,
            fit_duration_ms=elapsed_ms,
        )
        return cls(
            beta_hurdle=beta_hurdle,
            beta_q10=beta_q10,
            beta_q50=beta_q50,
            beta_q90=beta_q90,
            c90_mw_km2=c90_mw_km2,
            diagnostics=diag,
            sub_q50_mw_km2=sub_q50,
            sub_q90_mw_km2=sub_q90,
        )

    def predict_omission_prob(
        self,
        vza_deg: ArrayLike,
        modis_area_km2: ArrayLike,
        is_day: ArrayLike,
        slope_deg: ArrayLike,
        cloud_frac: ArrayLike,
        modis_obs_density: ArrayLike,
    ) -> NDArray[np.float64]:
        """Predict P(sub-pixel VIIRS fire omitted by MODIS) across N-D grids."""
        vza_arr, area_arr, day_arr, slp_arr, cld_arr, obs_arr = np.broadcast_arrays(
            np.asarray(vza_deg, dtype=np.float64),
            np.asarray(modis_area_km2, dtype=np.float64),
            np.asarray(is_day, dtype=np.float64),
            np.asarray(slope_deg, dtype=np.float64),
            np.asarray(cloud_frac, dtype=np.float64),
            np.asarray(modis_obs_density, dtype=np.float64),
        )
        b = self.beta_hurdle
        eta = (
            b[0]
            + b[1] * (vza_arr / 65.0)
            + b[2] * np.log1p(np.maximum(area_arr, 0.0))
            + b[3] * day_arr
            + b[4] * (slp_arr / 45.0)
            + b[5] * np.clip(cld_arr, 0.0, 1.0)
            + b[6] * np.maximum(obs_arr, 0.0)
        )
        return _sigmoid(eta)

    def predict_calibrated_flux(
        self,
        modis_obs_density: ArrayLike,
        vza_deg: ArrayLike,
        modis_area_km2: ArrayLike,
        slope_foreshortening: ArrayLike,
        hurdle_prob: ArrayLike | None = None,
        is_day: ArrayLike = 1.0,
        slope_deg: ArrayLike = 10.0,
        cloud_frac: ArrayLike = 0.0,
    ) -> CalibratedFluxPrediction:
        """Predict debiased (q10, q50, q90) and conformalized 90% interval in MW/km^2."""
        if hurdle_prob is None:
            h_prob = self.predict_omission_prob(
                vza_deg=vza_deg,
                modis_area_km2=modis_area_km2,
                is_day=is_day,
                slope_deg=slope_deg,
                cloud_frac=cloud_frac,
                modis_obs_density=modis_obs_density,
            )
        else:
            h_prob = np.asarray(hurdle_prob, dtype=np.float64)

        obs_arr, vza_arr, area_arr, fore_arr, h_arr = np.broadcast_arrays(
            np.asarray(modis_obs_density, dtype=np.float64),
            np.asarray(vza_deg, dtype=np.float64),
            np.asarray(modis_area_km2, dtype=np.float64),
            np.asarray(slope_foreshortening, dtype=np.float64),
            h_prob,
        )

        f1 = np.log1p(np.maximum(obs_arr, 0.0))
        f2 = vza_arr / 65.0
        f3 = np.maximum(area_arr, 0.1)
        f4 = np.clip(fore_arr, 0.0, 1.0)
        f5 = np.clip(h_arr, 0.0, 1.0)

        def _eval_head(w: NDArray[np.float64]) -> NDArray[np.float64]:
            z = w[0] + w[1] * f1 + w[2] * f2 + w[3] * f3 + w[4] * f4 + w[5] * f5
            return np.maximum(0.0, np.expm1(np.clip(z, -2.0, 4.8)))

        pos_q10 = _eval_head(self.beta_q10)
        pos_q50 = _eval_head(self.beta_q50)
        pos_q90 = _eval_head(self.beta_q90)

        detected = obs_arr > 0.30
        raw_q10 = np.where(detected, np.minimum(pos_q10, pos_q50), 0.0)
        q50 = np.where(detected, pos_q50, f5 * self.sub_q50_mw_km2)
        raw_q90 = np.where(detected, np.maximum(pos_q90, pos_q50), f5 * self.sub_q90_mw_km2)

        q10 = np.minimum(raw_q10, q50)
        q90 = np.maximum(raw_q90, q50)

        ci_low = np.maximum(0.0, q10 - self.c90_mw_km2)
        ci_high = q90 + self.c90_mw_km2
        # Equivalent Gaussian SD matching the conformalized 90% interval width (2 * 1.64485 = 3.2897)
        conf_sigma = np.maximum(0.65, (ci_high - ci_low) / 3.2897)

        return CalibratedFluxPrediction(
            hurdle_prob=f5,
            q10_mw_km2=q10,
            q50_mw_km2=q50,
            q90_mw_km2=q90,
            ci90_low_mw_km2=ci_low,
            ci90_high_mw_km2=ci_high,
            conformal_sigma_mw_km2=conf_sigma,
        )


_PRETRAINED_CALIBRATOR: CrossSensorCalibrator | None = None


def get_pretrained_calibrator() -> CrossSensorCalibrator:
    """Return singleton Stage 2 calibrator trained once at process startup."""
    global _PRETRAINED_CALIBRATOR
    if _PRETRAINED_CALIBRATOR is None:
        _PRETRAINED_CALIBRATOR = CrossSensorCalibrator.fit_default()
    return _PRETRAINED_CALIBRATOR
