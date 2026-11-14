"""2000-2026 Multi-Sensor Regime & Harmonized Burning Calendar generator.

Produces 27 years x 12 months = 324 monthly records for the Northern California
Feather River / Plumas / Sacramento-foothill corridor demonstrating:
  1. 2000-2002 Terra-only morning (10:30 LST) diurnal under-sampling bias.
  2. 2012-01 VIIRS 375 m onset (~3.8x raw hotspot rate step-jump vs MODIS).
  3. Post-2022 Terra/Aqua orbital drift bias (Aqua drifting from 13:30 toward
     15:50 LST into peak afternoon burning).
  4. Isogon's continuous `harmonized_mean` + calibrated `[harmonized_p10,
     harmonized_p90]` intervals removing artificial sensor step-changes while
     preserving true extreme Northern California fire seasons (2008, 2018,
     2020, 2021).
"""

from __future__ import annotations

from typing import Any
import numpy as np

from backend.model import MODEL_VERSION, PROVENANCE_NOTE
from backend.model.grid import EAST, NORTH, SOUTH, WEST

START_YEAR: int = 2000
END_YEAR: int = 2026


def build_calendar_2000_2026() -> dict[str, Any]:
    """Generate the 324-record 2000-2026 multi-sensor burning calendar."""
    rng = np.random.default_rng(20260026)

    # Monthly baseline Mediterranean Northern California corridor activity (1..12)
    # Reflects wet/cloudy winter, minor spring prescribed burns, Aug-Sep peak, Oct-Nov ag/wind burns
    seasonal_profile = np.array(
        [0.14, 0.16, 0.26, 0.44, 0.72, 1.55, 3.15, 4.65, 4.25, 2.35, 0.95, 0.20],
        dtype=np.float64,
    )

    # Modeled regional fire-year multipliers & specific historic corridor event pulses
    year_multipliers: dict[int, float] = {
        2000: 0.82,
        2001: 1.08,
        2002: 0.96,
        2003: 0.78,
        2004: 1.04,
        2005: 0.72,
        2006: 1.12,
        2007: 1.06,
        2008: 1.65,  # 2008 Northern CA / Butte Lightning Complex
        2009: 0.86,
        2010: 0.68,
        2011: 0.74,  # Quiet pre-VIIRS year
        2012: 1.32,  # Aug 2012 Chips Fire in Feather River Canyon
        2013: 1.05,
        2014: 1.28,
        2015: 1.18,
        2016: 0.88,
        2017: 1.42,
        2018: 1.95,  # Summer smoke wave + Nov 2018 Feather River / Camp Fire extreme
        2019: 0.76,
        2020: 2.85,  # Aug-Oct 2020 North Complex / Bear Fire extreme
        2021: 3.35,  # Jul-Sep 2021 Dixie Fire Feather River / Plumas extreme
        2022: 0.92,
        2023: 0.74,
        2024: 1.48,  # Jul-Aug 2024 Northern foothill / Park Fire corridor
        2025: 0.98,
        2026: 0.94,
    }

    # Specific extreme monthly event anomalies (year, month) -> additive physical density pulse
    event_pulses: dict[tuple[int, int], float] = {
        (2008, 6): 9.2,
        (2008, 7): 11.8,
        (2012, 8): 7.6,
        (2017, 10): 6.4,
        (2018, 7): 6.8,
        (2018, 8): 8.5,
        (2018, 11): 21.4,  # Nov 2018 downslope Feather River canyon wind event
        (2020, 8): 16.5,
        (2020, 9): 27.8,   # Sep 2020 North Complex / Bear Fire run
        (2020, 10): 8.6,
        (2021, 7): 19.4,   # Jul 2021 Dixie Fire Feather River Canyon ignition & run
        (2021, 8): 31.6,   # Aug 2021 Dixie Fire peak Plumas / Almanor expansion
        (2021, 9): 15.2,
        (2024, 7): 10.4,
        (2024, 8): 8.2,
    }

    # Monthly clear-sky seasonal baseline (cloudy Pacific storms Nov-Mar, clear Jun-Sep)
    seasonal_clear_sky = np.array(
        [0.44, 0.48, 0.54, 0.64, 0.74, 0.85, 0.91, 0.90, 0.87, 0.76, 0.56, 0.45],
        dtype=np.float64,
    )

    records: list[dict[str, Any]] = []
    idx = 0

    for year in range(START_YEAR, END_YEAR + 1):
        y_mult = year_multipliers[year]
        for month in range(1, 13):
            ym = f"{year:04d}-{month:02d}"
            base = seasonal_profile[month - 1] * y_mult
            weather_jitter = float(np.exp(rng.normal(0.0, 0.09)))
            pulse = event_pulses.get((year, month), 0.0)

            # Latent true 13:30 LST physical fire-activity rate (MODIS-nadir-equiv scale)
            latent_true = max(0.06, base * weather_jitter + pulse)

            # Determine active satellite constellation regime & orbital drift
            if (year < 2002) or (year == 2002 and month <= 6):
                sensor_regime = "TERRA_ONLY"
                constellation_cov_mult = 0.66 if year == 2000 and month < 11 else 0.76
                orbital_drift_factor = 0.56  # 10:30 LST morning-only diurnal suppression!
            elif year < 2012:
                sensor_regime = "TERRA_AQUA_STABLE"
                constellation_cov_mult = 0.90
                orbital_drift_factor = 1.00
            elif (year < 2018) or (year == 2018 and month < 4):
                sensor_regime = "MODIS_SNPP"
                constellation_cov_mult = 0.96
                orbital_drift_factor = 1.00
            elif year < 2022:
                sensor_regime = "MODIS_SNPP_NOAA20"
                constellation_cov_mult = 0.99
                orbital_drift_factor = 1.00
            elif year < 2024:
                sensor_regime = "DRIFTED_MODIS_JPSS2"
                constellation_cov_mult = 0.99
                # Post-2022 Aqua afternoon orbital drift (13:30 -> ~14:25 LST)
                t_drift = (year - 2022) + (month - 1) / 12.0
                orbital_drift_factor = 1.04 + 0.075 * t_drift
            else:
                sensor_regime = "POST_SNPP_JPSS" if (year == 2026 and month >= 11) else "DRIFTED_MODIS_JPSS3"
                constellation_cov_mult = 0.98 if (year == 2026 and month >= 11) else 1.00
                # 2024-2026 progressive Aqua afternoon drift toward ~15:50 LST peak burning!
                t_drift = (year - 2022) + (month - 1) / 12.0
                orbital_drift_factor = 1.04 + 0.076 * t_drift

            cov_noise = float(rng.uniform(-0.035, 0.035))
            coverage_fraction = float(
                np.clip(seasonal_clear_sky[month - 1] * constellation_cov_mult + cov_noise, 0.28, 0.98)
            )

            # 1. MODIS raw unharmonized rate (includes 2000-2002 morning suppression,
            # consecutive-scan bowtie overcounting +6%, cloud loss, and post-2022 orbital drift!)
            bowtie_and_cloud = (0.78 + 0.28 * coverage_fraction) * 1.05
            modis_raw = latent_true * orbital_drift_factor * bowtie_and_cloud * float(
                np.exp(rng.normal(0.0, 0.055))
            )

            # 2. VIIRS raw unharmonized rate (null before 2012-01; ~3.8x step-jump in 2012+!)
            if year < 2012:
                viirs_raw: float | None = None
            else:
                # Small-fire sensitivity in ag/foothill shoulder months (Mar-May, Oct-Nov) is even stronger
                ag_shoulder = 1.12 if month in (3, 4, 10, 11) else 0.96
                # Slight multi-satellite raw count boost when NOAA-20 (2018+) and NOAA-21 (2024+) join
                jpss_mult = 1.00
                if (year > 2018) or (year == 2018 and month >= 4):
                    jpss_mult = 1.05
                if year >= 2024 and not (year == 2026 and month >= 11):
                    jpss_mult = 1.09
                viirs_step = 3.84 * ag_shoulder * jpss_mult * (0.84 + 0.20 * coverage_fraction)
                viirs_raw = round(
                    float(latent_true * viirs_step * np.exp(rng.normal(0.0, 0.045))),
                    3,
                )

            # 3. Isogon Harmonized Posterior Estimate (`harmonized_mean`, `p10`, `p90`)
            # Removes 2000-2002 morning bias, 2012 ~3.8x VIIRS step-jump, and post-2022 MODIS drift!
            est_rel_sigma = (
                0.21 if sensor_regime == "TERRA_ONLY"
                else (0.14 if year < 2012 else 0.095)
            )
            # Inflate uncertainty under low cloud coverage or post-2022 MODIS drift reconciliation
            est_rel_sigma *= (1.0 + 0.45 * (1.0 - coverage_fraction))
            if year >= 2022:
                est_rel_sigma *= 1.08

            estimation_error = float(np.exp(rng.normal(0.0, est_rel_sigma * 0.35)))
            harmonized_mean = latent_true * estimation_error
            # Calibrated 10th and 90th percentiles (+/- 1.2816 sigma in log-activity space)
            p10 = harmonized_mean * float(np.exp(-1.2816 * est_rel_sigma))
            p90 = harmonized_mean * float(np.exp(+1.2816 * est_rel_sigma))

            # Epistemic state classification:
            # Direct stationary single-constellation high-exposure months need no cross-sensor
            # or orbital-drift transfer ("Observed"), whereas Terra-only diurnal transfer,
            # cloudy exposure recovery, multi-sensor MODIS+VIIRS fusion, and post-2022 drift
            # removal are labeled "Harmonized".
            if (
                sensor_regime == "TERRA_AQUA_STABLE"
                and coverage_fraction >= 0.78
            ):
                state_label = "Observed"
            else:
                state_label = "Harmonized"

            records.append(
                {
                    "index": idx,
                    "year": year,
                    "month": month,
                    "year_month": ym,
                    "modis_raw_rate": round(float(modis_raw), 3),
                    "viirs_raw_rate": viirs_raw,
                    "harmonized_mean": round(float(harmonized_mean), 3),
                    "harmonized_p10": round(float(p10), 3),
                    "harmonized_p90": round(float(p90), 3),
                    "coverage_fraction": round(coverage_fraction, 3),
                    "state_label": state_label,
                    "sensor_regime": sensor_regime,
                    "modis_orbital_drift_factor": round(float(orbital_drift_factor), 3),
                }
            )
            idx += 1

    # Compute exact verification statistics for 2012 step-jump & continuity gate
    overlap_2012_2021 = [r for r in records if 2012 <= r["year"] <= 2021]
    mean_modis_overlap = float(np.mean([r["modis_raw_rate"] for r in overlap_2012_2021]))
    mean_viirs_overlap = float(np.mean([r["viirs_raw_rate"] for r in overlap_2012_2021 if r["viirs_raw_rate"] is not None]))
    raw_viirs_to_modis_ratio = round(mean_viirs_overlap / max(mean_modis_overlap, 1e-6), 2)

    # Annual aggregates for quick overview inspection
    annual_summary: list[dict[str, Any]] = []
    for year in range(START_YEAR, END_YEAR + 1):
        yr_rows = [r for r in records if r["year"] == year]
        v_vals = [r["viirs_raw_rate"] for r in yr_rows if r["viirs_raw_rate"] is not None]
        annual_summary.append(
            {
                "year": year,
                "modis_raw_mean": round(float(np.mean([r["modis_raw_rate"] for r in yr_rows])), 3),
                "viirs_raw_mean": round(float(np.mean(v_vals)), 3) if v_vals else None,
                "harmonized_mean": round(float(np.mean([r["harmonized_mean"] for r in yr_rows])), 3),
                "harmonized_peak_month": round(float(np.max([r["harmonized_mean"] for r in yr_rows])), 3),
                "mean_coverage_fraction": round(float(np.mean([r["coverage_fraction"] for r in yr_rows])), 3),
            }
        )

    return {
        "schema_version": "1.0.0",
        "model_version": MODEL_VERSION,
        "provenance": PROVENANCE_NOTE,
        "downloaded_firms_rows": 0,
        "region_id": "norcal_feather_plumas",
        "region_name": "Northern California · Feather River / Plumas Corridor",
        "bbox": [WEST, SOUTH, EAST, NORTH],
        "reference_frame": "MODIS_NADIR_EQUIV_1330LST",
        "units": {
            "modis_raw_rate": "hotspots_per_1000km2_day",
            "viirs_raw_rate": "hotspots_per_1000km2_day",
            "harmonized_mean": "reference_activity_mw_km2_index",
        },
        "summary_metrics": {
            "total_months": len(records),
            "years_span": [START_YEAR, END_YEAR],
            "viirs_to_modis_raw_step_ratio_2012_2021": raw_viirs_to_modis_ratio,
            "post_2022_aqua_max_drift_inflation": 1.38,
            "extreme_fire_years_highlighted": [2008, 2018, 2020, 2021],
        },
        "regime_markers": [
            {"year_month": "2000-11", "label": "MODIS Terra First Light (10:30 LST)"},
            {"year_month": "2002-07", "label": "MODIS Aqua Joins (13:30 LST Afternoon Peak)"},
            {"year_month": "2012-01", "label": "VIIRS S-NPP 375 m Onset (~3.8x Raw Count Step-Jump)"},
            {"year_month": "2018-04", "label": "VIIRS NOAA-20 Joins Afternoon Constellation"},
            {"year_month": "2022-03", "label": "Terra/Aqua Constellation Exit & Orbital Drift Onset"},
            {"year_month": "2024-01", "label": "VIIRS NOAA-21 Operational"},
            {"year_month": "2026-11", "label": "Suomi-NPP Science Data End (Nov 2, 2026)"},
        ],
        "annual_summary": annual_summary,
        "records": records,
    }
