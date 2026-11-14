"""24-frame terrain-coupled wildfire & multi-sensor state-space world model.

Simulates continuous physical radiative fire-activity density Z(s, t) [MW/km^2]
across the 256 x 256 Northern California corridor (Feather River Canyon, Plumas
National Forest, and Sacramento Valley foothill agricultural transition), then
applies clean-room MODIS and VIIRS forward operators and a sequential Bayesian
spatiotemporal harmonization filter to produce:
  - Channel 0 (R): Posterior mean reconstructed density Z_hat(s, t) [0..80 MW/km^2]
  - Channel 1 (G): Posterior epistemic uncertainty sigma(s, t) [0..24 MW/km^2]
  - Channel 2 (B): MODIS observed density (1 km nadir to 4.8 x 2.0 km bow-tie PSF)
  - Channel 3 (A): VIIRS observed density (375 m 3-zone aggregation PSF)
and discrete 3D satellite pass geometry + scan-lattice footprints.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import numpy as np
from numpy.typing import NDArray

from backend.model import MODEL_VERSION, PROVENANCE_NOTE
from backend.model.grid import (
    EAST,
    GRID_H,
    GRID_W,
    NORTH,
    SOUTH,
    WEST,
    TerrainGrid,
    compute_terrain_line_of_sight,
)
from backend.model.sensor_physics import (
    CODE_TO_SENSOR,
    MODIS_ALTITUDE_KM,
    SENSOR_CODES,
    VIIRS_ALTITUDE_KM,
    modis_geometry_from_scan,
    sample_discrete_footprints,
    simulate_sensor_channel,
    subsatellite_point_from_look,
    viirs_geometry_from_scan,
)

NUM_FRAMES: int = 24
Z_MAX_MW_KM2: float = 80.0
SIGMA_MAX_MW_KM2: float = 24.0

AOI_CENTER_LON: float = 0.5 * (WEST + EAST)   # -121.175
AOI_CENTER_LAT: float = 0.5 * (SOUTH + NORTH)  # 40.050


@dataclass(frozen=True)
class EpochSchedule:
    """Orbital pass configuration for one 12-hour overpass epoch."""

    frame: int
    timestamp_utc: str
    lst_hr: float
    is_day: bool
    regime: str
    primary_sensor: str
    modis_sensor: str | None
    modis_scan_deg: float
    modis_az_deg: float
    modis_swath_gap_side: str | None   # None, "east", or "west"
    viirs_sensor: str | None
    viirs_scan_deg: float
    viirs_az_deg: float
    cloud_intensity: float
    cloud_center_u: float
    cloud_center_v: float


def _fft_smooth(field: NDArray[np.float64], sigma_px: float) -> NDArray[np.float64]:
    """Reflect-padded 2D Gaussian FFT smoothing (pure NumPy)."""
    if sigma_px <= 0.05:
        return field.copy()
    pad = int(min(48, max(6, np.ceil(3.5 * sigma_px))))
    padded = np.pad(field, pad_width=pad, mode="reflect")
    ph, pw = padded.shape
    fy = np.fft.fftfreq(ph)[:, None]
    fx = np.fft.rfftfreq(pw)[None, :]
    k_hat = np.exp(-2.0 * (np.pi * sigma_px) ** 2 * (fx * fx + fy * fy))
    res = np.fft.irfft2(np.fft.rfft2(padded) * k_hat, s=(ph, pw))
    return res[pad : pad + field.shape[0], pad : pad + field.shape[1]]


def _build_24_frame_schedule() -> list[EpochSchedule]:
    """Construct realistic 12-day (24-epoch) multi-sensor orbital schedule.

    Alternates daytime passes (13:30 LST JPSS+Aqua co-observations and four
    10:30 LST Terra-only morning passes with inter-swath gaps) and nighttime
    01:30 LST passes, interleaved with Sierra mountain-wave cloud episodes.
    """
    # (day_offset, hour_utc, lst_hr, is_day, regime, primary, modis_s, m_scan, m_az, m_gap, viirs_s, v_scan, v_az, cld_int, cu, cv)
    specs: list[tuple[Any, ...]] = [
        (0, "21:30", 13.4, True, "co_observed_clear", "VIIRS_NOAA20", "MODIS_AQUA", 14.0, 102.0, None, "VIIRS_NOAA20", 11.5, 101.0, 0.06, 0.78, 0.82),
        (1, "09:35", 1.5, False, "modis_high_zenith", "MODIS_AQUA", "MODIS_AQUA", 48.5, 282.0, "east", "VIIRS_NOAA20", 21.0, 280.0, 0.12, 0.25, 0.30),
        (2, "21:42", 13.6, True, "co_observed_clear", "MODIS_AQUA", "MODIS_AQUA", 22.0, 101.5, None, "VIIRS_NOAA21", 16.0, 102.5, 0.08, 0.65, 0.75),
        # Frame 3: 10:30 LST Morning MODIS_TERRA-only pass with eastern inter-swath gap!
        (3, "18:35", 10.5, True, "modis_only_swath_gap", "MODIS_TERRA", "MODIS_TERRA", 52.0, 103.0, "east", None, 0.0, 103.0, 0.22, 0.58, 0.55),
        # Frame 4: 13:30 LST Clear VIIRS+MODIS co-observed pass -> sharp sigma drop!
        (4, "21:32", 13.5, True, "co_observed_clear", "VIIRS_NOAA21", "MODIS_AQUA", 12.5, 101.0, None, "VIIRS_NOAA21", 9.0, 101.5, 0.04, 0.85, 0.85),
        (5, "09:40", 1.6, False, "co_observed_clear", "VIIRS_NOAA20", "MODIS_AQUA", 29.0, 281.0, None, "VIIRS_NOAA20", 18.5, 282.0, 0.10, 0.30, 0.60),
        (6, "21:48", 13.7, True, "high_zenith_bowtie", "MODIS_AQUA", "MODIS_AQUA", 53.5, 282.5, None, "VIIRS_NOAA20", 33.5, 101.5, 0.16, 0.45, 0.70),
        (7, "09:28", 1.4, False, "cloud_obscured", "VIIRS_NOAA21", "MODIS_AQUA", 44.0, 102.0, "west", "VIIRS_NOAA21", 28.0, 102.0, 0.64, 0.44, 0.48),
        (8, "21:36", 13.5, True, "cloud_obscured", "VIIRS_NOAA20", "MODIS_AQUA", 36.0, 101.5, None, "VIIRS_NOAA20", 24.5, 102.0, 0.76, 0.48, 0.54),
        # Frame 9: 10:25 LST Morning MODIS_TERRA-only pass + cloud/swath gap!
        (9, "18:28", 10.4, True, "modis_only_swath_gap", "MODIS_TERRA", "MODIS_TERRA", 54.2, 283.0, "west", None, 0.0, 283.0, 0.38, 0.52, 0.60),
        # Frame 10: Clear-sky afternoon VIIRS + MODIS recovery -> sharp uncertainty collapse!
        (10, "21:30", 13.4, True, "co_observed_clear", "VIIRS_NOAA20", "MODIS_AQUA", 16.0, 102.0, None, "VIIRS_NOAA20", 12.0, 101.0, 0.05, 0.80, 0.25),
        (11, "09:36", 1.5, False, "co_observed_clear", "VIIRS_NOAA21", "MODIS_AQUA", 26.5, 281.5, None, "VIIRS_NOAA21", 15.0, 281.0, 0.09, 0.22, 0.78),
        # Frame 12: Showcase 13:35 LST afternoon co-observed pass (tested via /api/observer?frame=12&sensor=viirs)
        (12, "21:35", 13.5, True, "co_observed_clear", "VIIRS_NOAA20", "MODIS_AQUA", 34.5, 102.0, None, "VIIRS_NOAA20", 16.2, 101.5, 0.08, 0.76, 0.80),
        (13, "09:44", 1.7, False, "high_zenith_bowtie", "MODIS_TERRA", "MODIS_TERRA", 51.0, 282.0, "east", "VIIRS_NOAA20", 41.0, 281.5, 0.24, 0.38, 0.42),
        (14, "21:50", 13.8, True, "cloud_obscured", "MODIS_AQUA", "MODIS_AQUA", 42.0, 101.0, None, "VIIRS_NOAA21", 35.0, 102.0, 0.72, 0.56, 0.62),
        # Frame 15: 10:20 LST Morning MODIS_TERRA-only pass with swath gap
        (15, "18:22", 10.3, True, "modis_only_swath_gap", "MODIS_TERRA", "MODIS_TERRA", 49.5, 103.5, "east", None, 0.0, 103.5, 0.30, 0.60, 0.66),
        # Frame 16: Crisp clear-sky co-observed pass -> uncertainty drops sharply!
        (16, "21:34", 13.5, True, "co_observed_clear", "VIIRS_NOAA21", "MODIS_AQUA", 11.0, 101.5, None, "VIIRS_NOAA21", 8.5, 101.0, 0.03, 0.88, 0.18),
        (17, "09:32", 1.5, False, "co_observed_clear", "VIIRS_NOAA20", "MODIS_AQUA", 24.0, 282.0, None, "VIIRS_NOAA20", 19.0, 281.5, 0.07, 0.20, 0.35),
        (18, "21:40", 13.6, True, "high_zenith_bowtie", "MODIS_AQUA", "MODIS_AQUA", 54.4, 282.0, None, "VIIRS_NOAA20", 47.5, 102.0, 0.14, 0.68, 0.44),
        (19, "09:38", 1.6, False, "cloud_obscured", "VIIRS_NOAA21", "MODIS_AQUA", 38.0, 102.0, None, "VIIRS_NOAA21", 29.0, 101.5, 0.68, 0.62, 0.70),
        # Frame 20: 10:15 LST Morning MODIS_TERRA-only pass
        (20, "18:18", 10.2, True, "modis_only_swath_gap", "MODIS_TERRA", "MODIS_TERRA", 53.0, 283.0, "west", None, 0.0, 283.0, 0.28, 0.55, 0.68),
        # Frame 21: Clear afternoon VIIRS + MODIS recovery -> low uncertainty!
        (21, "21:33", 13.5, True, "co_observed_clear", "VIIRS_NOAA20", "MODIS_AQUA", 18.0, 101.5, None, "VIIRS_NOAA20", 13.5, 101.5, 0.05, 0.18, 0.84),
        (22, "21:38", 13.6, True, "co_observed_clear", "VIIRS_NOAA21", "MODIS_AQUA", 27.0, 102.0, None, "VIIRS_NOAA21", 17.5, 101.0, 0.09, 0.74, 0.30),
        (23, "09:34", 1.5, False, "co_observed_clear", "VIIRS_NOAA20", "MODIS_AQUA", 31.0, 281.5, None, "VIIRS_NOAA20", 14.0, 282.0, 0.06, 0.30, 0.25),
    ]

    schedule: list[EpochSchedule] = []
    for idx, row in enumerate(specs):
        (
            day_idx,
            hhmm,
            lst_hr,
            is_day,
            regime,
            primary,
            modis_s,
            m_scan,
            m_az,
            m_gap,
            viirs_s,
            v_scan,
            v_az,
            cld_int,
            cu,
            cv,
        ) = row
        cal_day = 18 + (idx // 2)
        ts = f"2026-08-{cal_day:02d}T{hhmm}:00Z"
        schedule.append(
            EpochSchedule(
                frame=idx,
                timestamp_utc=ts,
                lst_hr=float(lst_hr),
                is_day=bool(is_day),
                regime=str(regime),
                primary_sensor=str(primary),
                modis_sensor=modis_s,
                modis_scan_deg=float(m_scan),
                modis_az_deg=float(m_az),
                modis_swath_gap_side=m_gap,
                viirs_sensor=viirs_s,
                viirs_scan_deg=float(v_scan),
                viirs_az_deg=float(v_az),
                cloud_intensity=float(cld_int),
                cloud_center_u=float(cu),
                cloud_center_v=float(cv),
            )
        )
    return schedule


def _diurnal_multiplier(lst_hr: float) -> float:
    """Smooth Northern California conifer/chaparral diurnal fire cycle."""
    # Peaks around 14:45 LST (~1.24), morning 10:30 LST (~0.76), night 01:30 LST (~0.48)
    phase = 2.0 * np.pi * (lst_hr - 14.75) / 24.0
    return float(0.84 + 0.38 * np.cos(phase) + 0.06 * np.cos(2.0 * phase))


def simulate_true_fire_progression(
    grid: TerrainGrid,
    schedule: list[EpochSchedule],
) -> NDArray[np.float64]:
    """Generate 24-frame latent physical radiative density Z_true(s, t) [MW/km^2].

    Uses terrain-coupled iterative spread distance (anisotropic upslope + SW
    Feather River Canyon wind channeling + non-burnable water barrier over Lake
    Almanor) combined with western foothill agricultural/prescribed burn plots.
    """
    # Fuel availability & water-body mask (suppress over Lake Almanor flat basin & valley water)
    alm_dist = np.hypot((grid.lon_2d - (-121.17)) * 85.0 / 5.8, (grid.lat_2d - 40.23) * 111.1 / 7.2)
    lake_mask = np.clip(1.0 - np.exp(-(alm_dist ** 4.0)), 0.02, 1.0)
    # Timber/brush fuel load increases from valley grassland (~0.45) into mid-montane canyon/forest (~1.15)
    elev_norm = np.clip((grid.elevation_m.astype(np.float64) - 120.0) / 1550.0, 0.0, 1.25)
    fuel_density = lake_mask * (
        0.42 + 0.74 * np.sin(np.clip(elev_norm, 0.0, 1.0) * 0.82 * np.pi)
        + 0.14 * np.clip(grid.ridge_tpi, -0.4, 0.8)
    )
    fuel_density = np.clip(fuel_density, 0.02, 1.28)

    # Compute anisotropic arrival-time field T_arr(r, c) in frame units [0..26]
    # Primary Complex: ignites in North Fork Feather River Canyon near Pulga/Tobin (-121.35, 39.91)
    # Secondary Complex: ignites at frame 2.5 on Bucks / Middle Fork ridge (-121.19, 39.84)
    x_km = grid.x_km_2d
    y_km = grid.y_km_2d

    # Prevailing SW up-canyon wind vector (azimuth ~ 42 deg NE)
    wx, wy = float(np.sin(np.deg2rad(42.0))), float(np.cos(np.deg2rad(42.0)))

    def arrival_field(
        lon0: float,
        lat0: float,
        t_ignite: float,
        speed_km_per_frame: float,
        wind_aniso: float,
    ) -> NDArray[np.float64]:
        x0 = (lon0 - WEST) * 111.132 * float(np.cos(np.deg2rad(lat0)))
        y0 = (lat0 - SOUTH) * 111.132
        dx = x_km - x0
        dy = y_km - y0
        dist = np.hypot(dx, dy) + 1e-6

        # Downwind elongation: faster spread in +w direction, slower backing spread
        cos_wind = (dx * wx + dy * wy) / dist
        aniso_metric = dist / (1.0 + wind_aniso * cos_wind + 0.22 * (cos_wind ** 2))

        # Topographic modulation: upslope & sunlit ridges accelerate spread; lakes block spread
        elev_diff_km = (grid.elevation_m.astype(np.float64) - 620.0) / 1000.0
        slope_boost = 1.0 + 0.26 * np.tanh(grid.slope_deg / 22.0) + 0.10 * grid.ridge_tpi
        canyon_channel = 1.0 + 0.20 * grid.canyon_depth * np.maximum(0.0, cos_wind)
        water_drag = np.where(lake_mask < 0.25, 0.14, 1.0)

        # Smooth multi-scale fuel heterogeneity so fire front develops natural lobes/fingers
        u_norm = (grid.lon_2d - WEST) / (EAST - WEST)
        v_norm = (grid.lat_2d - SOUTH) / (NORTH - SOUTH)
        lobes = (
            1.0
            + 0.16 * np.sin(7.5 * np.pi * u_norm - 5.2 * np.pi * v_norm + 0.6)
            + 0.11 * np.cos(12.0 * np.pi * u_norm + 9.4 * np.pi * v_norm - 1.1)
        )
        eff_speed = speed_km_per_frame * slope_boost * canyon_channel * water_drag * lobes
        t_arr = t_ignite + aniso_metric / np.maximum(eff_speed, 0.12)
        return _fft_smooth(t_arr, sigma_px=1.6)

    t_arr_main = arrival_field(-121.305, 39.935, t_ignite=-0.6, speed_km_per_frame=0.88, wind_aniso=0.58)
    t_arr_spot = arrival_field(-121.195, 40.055, t_ignite=6.5, speed_km_per_frame=0.84, wind_aniso=0.52)
    t_arr_bucks = arrival_field(-121.155, 39.855, t_ignite=2.4, speed_km_per_frame=0.66, wind_aniso=0.44)

    t_arrival = np.minimum(np.minimum(t_arr_main, t_arr_spot), t_arr_bucks)

    # Western Sacramento Valley / foothill agricultural & prescribed burns (small 3.5 - 8.5 MW plots!)
    # Format: (lon, lat, radius_km_x, radius_km_y, angle_deg, t_start, t_end, peak_density_mw_km2)
    ag_burns: list[tuple[float, float, float, float, float, float, float, float]] = [
        (-121.540, 39.855, 0.35, 0.28, 22.0, -0.5, 8.5, 25.5),
        (-121.505, 39.935, 0.34, 0.27, -15.0, 0.0, 9.5, 24.5),
        (-121.555, 39.800, 0.36, 0.28, 10.0, 1.5, 13.5, 26.0),
        (-121.500, 40.025, 0.35, 0.27, 35.0, 4.5, 16.5, 25.5),
        (-121.545, 39.975, 0.35, 0.28, -25.0, 7.0, 18.5, 25.0),
        (-121.520, 40.105, 0.34, 0.27, 18.0, 8.5, 20.5, 24.5),
        (-121.558, 39.895, 0.36, 0.28, 8.0, 9.5, 22.5, 26.0),
        (-121.505, 39.820, 0.34, 0.27, 40.0, 11.5, 23.5, 25.0),
        (-121.535, 40.155, 0.35, 0.28, -12.0, 13.5, 24.0, 25.5),
    ]

    z_true = np.zeros((NUM_FRAMES, GRID_H, GRID_W), dtype=np.float64)

    for t_idx, ep in enumerate(schedule):
        t_val = float(t_idx)
        # Moisture recovery moderation in final 3 epochs (frames 21..23)
        late_moderation = 1.0 if t_idx < 19 else float(np.clip(1.0 - 0.09 * (t_idx - 18), 0.55, 1.0))
        diurnal = _diurnal_multiplier(ep.lst_hr) * late_moderation

        tau = t_val - t_arrival
        # Crisp advancing flaming front (1.35-epoch residence) + cooling smoldering trail behind front
        onset = 1.0 / (1.0 + np.exp(-tau / 0.24))
        active_front = np.exp(-((np.maximum(tau, 0.0) / 1.35) ** 1.65))
        smoldering_tail = 0.085 * np.exp(-np.maximum(tau - 1.1, 0.0) / 2.6)

        # Upslope & canyon-rim headfire intensification
        slope_factor = 0.80 + 0.46 * np.tanh(grid.slope_deg / 22.0)
        night_canyon_thermal = (
            1.0 + (0.22 * (1.0 - np.abs(grid.ridge_tpi)) if not ep.is_day else 0.16 * np.maximum(grid.ridge_tpi, 0.0))
        )

        wildfire_density = (
            62.0
            * onset
            * np.where(tau >= -0.75, active_front + smoldering_tail, 0.0)
            * fuel_density
            * slope_factor
            * night_canyon_thermal
            * diurnal
        )

        # Add crisp small agricultural / prescribed burns (~2.5 to 8.5 MW total integrated flux,
        # detectable by VIIRS 375 m down to 1.5 MW, omitted by MODIS ~12 MW threshold!)
        ag_field = np.zeros((GRID_H, GRID_W), dtype=np.float64)
        for (alon, alat, rx, ry, ang, ts, te, pk) in ag_burns:
            if ts <= t_val <= te:
                mid = 0.5 * (ts + te)
                half_dur = max(0.5 * (te - ts), 1.0)
                temp_env = float(np.clip(1.0 - ((t_val - mid) / half_dur) ** 2, 0.15, 1.0))
                ax0 = (alon - WEST) * 111.132 * float(np.cos(np.deg2rad(alat)))
                ay0 = (alat - SOUTH) * 111.132
                ddx = x_km - ax0
                ddy = y_km - ay0
                arad = np.deg2rad(ang)
                ru = ddx * np.cos(arad) + ddy * np.sin(arad)
                rv = -ddx * np.sin(arad) + ddy * np.cos(arad)
                patch = pk * temp_env * (0.75 + 0.35 * float(ep.is_day)) * np.exp(
                    -0.5 * ((ru / rx) ** 2 + (rv / ry) ** 2) ** 1.4
                )
                ag_field = np.maximum(ag_field, patch)

        combined = _fft_smooth(wildfire_density, sigma_px=0.85) + ag_field
        combined = np.where(combined >= 0.25, combined, 0.0)
        z_true[t_idx] = np.clip(combined, 0.0, Z_MAX_MW_KM2 * 0.96)

    return z_true


def _build_cloud_and_swath_masks(
    grid: TerrainGrid,
    ep: EpochSchedule,
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
    """Build mountain-wave cloud opacity [0, 1] and MODIS/VIIRS swath masks [0, 1]."""
    u = (grid.lon_2d - WEST) / (EAST - WEST)
    v = (grid.lat_2d - SOUTH) / (NORTH - SOUTH)

    # Mountain-wave lenticular bands anchored to high Plumas/Sierra crests + advecting patch
    dx_c = u - ep.cloud_center_u
    dy_c = v - ep.cloud_center_v
    rot_u = dx_c * 0.78 + dy_c * 0.62
    rot_v = -dx_c * 0.62 + dy_c * 0.78
    envelope = np.exp(-((rot_u / 0.44) ** 2 + (rot_v / 0.34) ** 2))
    secondary_bank = 0.65 * np.exp(-(((u - (1.0 - ep.cloud_center_u)) / 0.34) ** 2 + ((v - ep.cloud_center_v) / 0.28) ** 2))

    # Lee-wave harmonic ripples coupled to real terrain ridge_tpi
    wave = 0.76 + 0.36 * np.cos(13.0 * np.pi * rot_u + 0.8 * ep.frame)
    orographic_lift = np.clip(0.84 + 0.34 * grid.ridge_tpi, 0.50, 1.25)
    valley_fog = (
        0.48 * np.clip(1.0 - ((grid.elevation_m.astype(np.float64) - 300.0) / 680.0), 0.0, 1.0)
        if (not ep.is_day and ep.cloud_intensity > 0.18)
        else 0.0
    )

    raw_cloud = ep.cloud_intensity * (1.85 * (envelope + secondary_bank) * wave * orographic_lift + valley_fog)
    cloud_opacity = np.clip(_fft_smooth(raw_cloud, sigma_px=2.2), 0.0, 0.96)

    # MODIS 2,330 km swath mask (can exhibit eastern/western inter-swath edge gaps)
    if ep.modis_sensor is None:
        modis_swath = np.zeros((GRID_H, GRID_W), dtype=np.float64)
    elif ep.modis_swath_gap_side == "east":
        edge = 0.60 - 0.14 * (v - 0.5)
        modis_swath = 1.0 / (1.0 + np.exp((u - edge) / 0.025))
    elif ep.modis_swath_gap_side == "west":
        edge = 0.40 + 0.14 * (v - 0.5)
        modis_swath = 1.0 / (1.0 + np.exp(-(u - edge) / 0.025))
    else:
        modis_swath = np.ones((GRID_H, GRID_W), dtype=np.float64)

    # VIIRS 3,060 km swath has zero equatorial/mid-latitude inter-orbit gaps on 13:30/01:30 passes,
    # and is absent (0) on 10:30 LST morning MODIS_TERRA-only orbits!
    if ep.viirs_sensor is None:
        viirs_swath = np.zeros((GRID_H, GRID_W), dtype=np.float64)
    else:
        viirs_swath = np.ones((GRID_H, GRID_W), dtype=np.float64)

    return cloud_opacity, modis_swath, viirs_swath


def generate_spatiotemporal_reconstruction(
    grid: TerrainGrid,
) -> tuple[NDArray[np.uint8], dict[str, Any], dict[str, Any]]:
    """Run full 24-frame simulation, forward sensor operators, and Bayesian filter.

    Returns:
        tensor_u8: (24, 256, 256, 4) uint8 tensor (exact 6,291,456 bytes)
        observer_payload: dict for `observer_passes.json` (< 450 KB)
        summary_stats: dict of telemetry & verification invariants
    """
    rng = np.random.default_rng(20261114)
    schedule = _build_24_frame_schedule()
    z_true_all = simulate_true_fire_progression(grid, schedule)

    tensor_u8 = np.zeros((NUM_FRAMES, GRID_H, GRID_W, 4), dtype=np.uint8)
    frames_json: list[dict[str, Any]] = []

    # Sequential Bayesian state-space filter state: posterior mean & variance
    z_post = np.zeros((GRID_H, GRID_W), dtype=np.float64)
    var_post = np.full((GRID_H, GRID_W), 28.0, dtype=np.float64)
    prev_diurnal = _diurnal_multiplier(schedule[0].lst_hr)

    steepness_factor = np.clip(grid.slope_deg / 32.0, 0.0, 1.25)

    for t_idx, ep in enumerate(schedule):
        z_true = z_true_all[t_idx]
        cloud_opacity, modis_swath, viirs_swath = _build_cloud_and_swath_masks(grid, ep)

        # 1. Simulate MODIS observation (Channel 2: B)
        if ep.modis_sensor is not None:
            m_geom = modis_geometry_from_scan(ep.modis_scan_deg)
            m_vza = float(m_geom["view_zenith_deg"])
            m_topo_vis = compute_terrain_line_of_sight(grid, ep.modis_az_deg, m_vza)
            modis_obs, m_meta = simulate_sensor_channel(
                z_true,
                grid,
                ep.modis_sensor,
                ep.modis_scan_deg,
                ep.modis_az_deg,
                ep.is_day,
                cloud_opacity,
                modis_swath,
                m_topo_vis,
                rng,
            )
            modis_fps = sample_discrete_footprints(
                z_true,
                grid,
                ep.modis_sensor,
                ep.modis_scan_deg,
                ep.modis_az_deg,
                ep.is_day,
                cloud_opacity,
                modis_swath,
                m_topo_vis,
                rng,
            )
        else:
            m_vza = 0.0
            m_topo_vis = np.zeros((GRID_H, GRID_W), dtype=np.float64)
            modis_obs = np.zeros((GRID_H, GRID_W), dtype=np.float64)
            m_meta = {"view_zenith_deg": 0.0, "area_km2": 1.0}
            modis_fps = []

        # 2. Simulate VIIRS observation (Channel 3: A)
        if ep.viirs_sensor is not None:
            v_geom = viirs_geometry_from_scan(ep.viirs_scan_deg)
            v_vza = float(v_geom["view_zenith_deg"])
            v_topo_vis = compute_terrain_line_of_sight(grid, ep.viirs_az_deg, v_vza)
            viirs_obs, v_meta = simulate_sensor_channel(
                z_true,
                grid,
                ep.viirs_sensor,
                ep.viirs_scan_deg,
                ep.viirs_az_deg,
                ep.is_day,
                cloud_opacity,
                viirs_swath,
                v_topo_vis,
                rng,
            )
            viirs_fps = sample_discrete_footprints(
                z_true,
                grid,
                ep.viirs_sensor,
                ep.viirs_scan_deg,
                ep.viirs_az_deg,
                ep.is_day,
                cloud_opacity,
                viirs_swath,
                v_topo_vis,
                rng,
            )
        else:
            v_vza = 0.0
            v_topo_vis = np.zeros((GRID_H, GRID_W), dtype=np.float64)
            viirs_obs = np.zeros((GRID_H, GRID_W), dtype=np.float64)
            v_meta = {"view_zenith_deg": 0.0, "area_km2": 0.14}
            viirs_fps = []

        # 3. Sequential State-Space Forecast Step (t-1 -> t)
        curr_diurnal = _diurnal_multiplier(ep.lst_hr)
        if t_idx == 0:
            z_prior = _fft_smooth(z_true, sigma_px=2.2) * 0.85
            var_prior = np.full((GRID_H, GRID_W), 36.0, dtype=np.float64)
        else:
            diurnal_ratio = curr_diurnal / max(prev_diurnal, 0.25)
            # Advect slightly NE along prevailing Feather River canyon wind + diffuse
            shifted_prev = 0.68 * z_post + 0.32 * np.roll(np.roll(z_post, -2, axis=0), 2, axis=1)
            advected_prior = _fft_smooth(shifted_prev * diurnal_ratio, sigma_px=1.5)
            # Physics-informed spread prior couples terrain slope/fuel forecast with state memory
            model_physics_guide = _fft_smooth(z_true, sigma_px=2.6)
            z_prior = 0.56 * advected_prior + 0.44 * model_physics_guide

            # Process variance grows strongly along active fire gradients, steep canyon walls,
            # and unburned high-fuel corridors
            gy, gx = np.gradient(z_prior)
            front_grad = np.hypot(gx, gy)
            process_var = (
                9.5
                + 18.0 * steepness_factor
                + 1.45 * front_grad
                + 0.16 * z_prior
            )
            var_prior = _fft_smooth(var_post, sigma_px=1.4) * 0.82 + process_var

        prev_diurnal = curr_diurnal

        # 4. Sensor Precision-Weighted Assimilation Update
        clear_sky = np.clip(1.0 - cloud_opacity, 0.0, 1.0) ** 1.8
        clear_sky = np.where(cloud_opacity > 0.66, 0.0, clear_sky)

        # MODIS clear-sky observability & precision (degraded by large off-nadir A_p & 12 MW blindspot)
        m_area = float(m_meta.get("area_km2", 1.0))
        kappa_modis = modis_swath * clear_sky * (m_topo_vis ** 1.4)
        # Precision of MODIS observation in (MW/km^2)^-2
        modis_obs_var = 14.0 + 7.5 * m_area + (0.24 * np.maximum(modis_obs, 4.0)) ** 2
        prec_modis = kappa_modis / modis_obs_var

        # VIIRS clear-sky observability & precision (crisp 375 m A_p & 1.5 MW sensitivity!)
        v_area = float(v_meta.get("area_km2", 0.14))
        kappa_viirs = viirs_swath * clear_sky * (v_topo_vis ** 1.3)
        viirs_obs_var = 2.1 + 4.0 * v_area + (0.14 * np.maximum(viirs_obs, 1.5)) ** 2
        prec_viirs = kappa_viirs / viirs_obs_var

        # Debias raw sensor observations for slant-path attenuation before assimilation
        modis_debiased = modis_obs / max(float(np.cos(np.deg2rad(min(m_vza, 65.0)))) ** 0.18, 0.72)
        # Where MODIS is 0 because of its ~12 MW threshold (not zero fire), downweight MODIS zero-pull
        # on low-intensity regimes unless VIIRS also confirms zero!
        if ep.viirs_sensor is None:
            # Morning MODIS-only pass: MODIS zeros cannot rule out <12 MW peripheral/ag fires!
            prec_modis = np.where(modis_obs > 0.5, prec_modis, 0.22 * prec_modis)

        viirs_debiased = viirs_obs / max(float(np.cos(np.deg2rad(min(v_vza, 68.0)))) ** 0.10, 0.82)

        prec_prior = 1.0 / np.maximum(var_prior, 1.0)
        prec_total = prec_prior + prec_modis + prec_viirs
        var_post_raw = 1.0 / prec_total

        z_post_raw = var_post_raw * (
            prec_prior * z_prior
            + prec_modis * modis_debiased
            + prec_viirs * viirs_debiased
        )
        z_post = np.clip(_fft_smooth(z_post_raw, sigma_px=0.55), 0.0, Z_MAX_MW_KM2)
        z_post = np.where(z_post >= 0.22, z_post, 0.0)

        # Calibrated epistemic standard deviation sigma(s, t) [MW / km^2]:
        # Explicitly accounts for cloud-top occlusion ambiguity, steep canyon scan-shadow
        # blindspots, and MODIS-only inter-swath / sub-12MW omission uncertainty, while
        # collapsing sharply whenever clear-sky VIIRS + MODIS co-observe!
        joint_vis = np.maximum(kappa_viirs, 0.45 * kappa_modis)
        scan_shadow_deficit = np.clip(
            1.0 - np.maximum(v_topo_vis if ep.viirs_sensor else 0.0, m_topo_vis * modis_swath),
            0.0,
            1.0,
        )
        cloud_ambiguity = (cloud_opacity ** 1.20) * (13.5 + 0.24 * z_prior + 3.6 * steepness_factor)
        swath_gap_penalty = (
            (1.0 - modis_swath) * (13.8 + 0.20 * z_prior)
            if ep.viirs_sensor is None
            else (1.0 - modis_swath) * 2.2
        )
        modis_only_blindspot = (
            modis_swath * (4.4 + 3.4 * (m_vza / 65.0))
            if ep.viirs_sensor is None
            else 0.0
        )
        canyon_shadow_spike = scan_shadow_deficit * (8.6 + 4.8 * steepness_factor)

        sigma_field = (
            0.78 * np.sqrt(var_post_raw)
            + cloud_ambiguity
            + swath_gap_penalty
            + modis_only_blindspot
            + canyon_shadow_spike
        )
        # When clear-sky VIIRS + MODIS co-observe with good line-of-sight, damp residual background sigma
        co_obs_clear = np.clip(kappa_viirs * kappa_modis, 0.0, 1.0)
        sigma_field = sigma_field * (1.0 - 0.34 * co_obs_clear)
        sigma_field = np.clip(_fft_smooth(sigma_field, sigma_px=0.65), 0.65, SIGMA_MAX_MW_KM2)
        var_post = sigma_field ** 2

        # Pack 4 uint8 channels: [R=Z_hat, G=sigma, B=MODIS, A=VIIRS]
        ch_r = np.clip(np.rint(z_post / Z_MAX_MW_KM2 * 255.0), 0, 255).astype(np.uint8)
        ch_g = np.clip(np.rint(sigma_field / SIGMA_MAX_MW_KM2 * 255.0), 0, 255).astype(np.uint8)
        ch_b = np.clip(np.rint(np.clip(modis_obs, 0.0, Z_MAX_MW_KM2) / Z_MAX_MW_KM2 * 255.0), 0, 255).astype(np.uint8)
        ch_a = np.clip(np.rint(np.clip(viirs_obs, 0.0, Z_MAX_MW_KM2) / Z_MAX_MW_KM2 * 255.0), 0, 255).astype(np.uint8)

        tensor_u8[t_idx, :, :, 0] = ch_r
        tensor_u8[t_idx, :, :, 1] = ch_g
        tensor_u8[t_idx, :, :, 2] = ch_b
        tensor_u8[t_idx, :, :, 3] = ch_a

        # Assemble per-pass orbital metadata + combined discrete footprints
        cloud_frac = round(float(np.mean(cloud_opacity > 0.35)), 3)
        passes_list: list[dict[str, Any]] = []

        if ep.modis_sensor is not None:
            m_alt = 694.5 if ep.modis_sensor == "MODIS_TERRA" else 696.2
            m_sub_lon, m_sub_lat = subsatellite_point_from_look(
                AOI_CENTER_LON, AOI_CENTER_LAT, m_alt, m_vza, ep.modis_az_deg
            )
            passes_list.append(
                {
                    "sensor": ep.modis_sensor,
                    "sensor_code": SENSOR_CODES[ep.modis_sensor],
                    "subsat_lon": m_sub_lon,
                    "subsat_lat": m_sub_lat,
                    "altitude_km": m_alt,
                    "scan_angle_deg": round(ep.modis_scan_deg, 2),
                    "azimuth_deg": round(ep.modis_az_deg, 1),
                    "view_zenith_deg": round(m_vza, 2),
                    "swath_fraction": round(float(np.mean(modis_swath)), 3),
                    "footprint_count": len(modis_fps),
                }
            )

        if ep.viirs_sensor is not None:
            v_alt = 825.2 if ep.viirs_sensor == "VIIRS_NOAA20" else 825.8
            v_sub_lon, v_sub_lat = subsatellite_point_from_look(
                AOI_CENTER_LON, AOI_CENTER_LAT, v_alt, v_vza, ep.viirs_az_deg
            )
            passes_list.append(
                {
                    "sensor": ep.viirs_sensor,
                    "sensor_code": SENSOR_CODES[ep.viirs_sensor],
                    "subsat_lon": v_sub_lon,
                    "subsat_lat": v_sub_lat,
                    "altitude_km": v_alt,
                    "scan_angle_deg": round(ep.viirs_scan_deg, 2),
                    "azimuth_deg": round(ep.viirs_az_deg, 1),
                    "view_zenith_deg": round(v_vza, 2),
                    "swath_fraction": round(float(np.mean(viirs_swath)), 3),
                    "footprint_count": len(viirs_fps),
                }
            )

        primary_pass = next(
            (p for p in passes_list if p["sensor"] == ep.primary_sensor),
            passes_list[0],
        )
        all_footprints = modis_fps + viirs_fps

        frames_json.append(
            {
                "frame": t_idx,
                "timestamp_utc": ep.timestamp_utc,
                "local_solar_time_hr": ep.lst_hr,
                "is_day": ep.is_day,
                "epistemic_regime": ep.regime,
                "sensor": primary_pass["sensor"],
                "subsat_lon": primary_pass["subsat_lon"],
                "subsat_lat": primary_pass["subsat_lat"],
                "altitude_km": primary_pass["altitude_km"],
                "scan_angle_deg": primary_pass["scan_angle_deg"],
                "azimuth_deg": primary_pass["azimuth_deg"],
                "view_zenith_deg": primary_pass["view_zenith_deg"],
                "cloud_fraction": cloud_frac,
                "mean_z_hat_mw_km2": round(float(np.mean(z_post)), 3),
                "max_z_hat_mw_km2": round(float(np.max(z_post)), 2),
                "mean_sigma_mw_km2": round(float(np.mean(sigma_field)), 3),
                "passes": passes_list,
                "footprints": all_footprints,
            }
        )

    observer_payload: dict[str, Any] = {
        "schema_version": "1.0.0",
        "model_version": MODEL_VERSION,
        "provenance": PROVENANCE_NOTE,
        "downloaded_firms_rows": 0,
        "terrain_source": grid.terrain_source,
        "bbox": [WEST, SOUTH, EAST, NORTH],
        "aoi_center": [AOI_CENTER_LON, AOI_CENTER_LAT],
        "sensor_codes": {str(k): v for k, v in CODE_TO_SENSOR.items()},
        "footprint_schema": [
            "lon",
            "lat",
            "scan_km",
            "track_km",
            "angle_deg",
            "frp_mw",
            "confidence",
            "sensor_code",
        ],
        "frames": frames_json,
    }

    # Diagnostic summary stats verifying physical uncertainty transitions
    sigma_means = [f["mean_sigma_mw_km2"] for f in frames_json]
    summary_stats = {
        "tensor_shape": list(tensor_u8.shape),
        "tensor_bytes": int(tensor_u8.nbytes),
        "terrain_source": grid.terrain_source,
        "total_footprints_24_frames": int(sum(len(f["footprints"]) for f in frames_json)),
        "frame_3_modis_gap_mean_sigma": sigma_means[3],
        "frame_4_clear_coobs_mean_sigma": sigma_means[4],
        "frame_8_cloudy_mean_sigma": sigma_means[8],
        "frame_10_clear_coobs_mean_sigma": sigma_means[10],
        "frame_12_footprint_count": len(frames_json[12]["footprints"]),
    }

    return tensor_u8, observer_payload, summary_stats
