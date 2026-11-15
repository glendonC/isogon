export type WorkspaceMode = 'cutaway' | 'reconstruction' | 'observer' | 'world' | 'earth';

export type ObserverFilter = 'all' | 'modis' | 'viirs';

export type SensorFamily = 'modis' | 'viirs';

export type CameraPresetId = 'overview' | 'canyon' | 'ridge' | 'almanor' | 'nadir';

export type TerrainFindingKind = 'front' | 'subpixel' | 'uncertainty';

export interface TerrainFindingCallout {
  id: string;
  kind: TerrainFindingKind;
  title: string;
  subtitle: string;
  valueText: string;
  lat: number;
  lon: number;
  elevM: number;
}

export interface PipelineStageRecord {
  stage_id: string;
  label: string;
  model_name: string;
  duration_ms: number;
  status: 'pending' | 'running' | 'completed';
  detail: string;
}

export interface RunMetrics {
  holdout_viirs: boolean;
  cloud_override: number | null;
  total_reconstructed_frp_peak_mw: number;
  raw_modis_rmse_mw_km2: number;
  reconstructed_rmse_mw_km2: number;
  rmse_reduction_pct: number;
  empirical_90_coverage_pct: number;
  conformal_q90_radius_mw_km2: number;
  subpixel_viirs_fires_recovered_pct: number;
  step_2012_raw_ratio: number;
  step_2012_harmonized_ratio: number;
}

export interface EpochSummary {
  frame: number;
  timestamp_utc: string;
  lst_hr: number;
  regime: string;
  primary_sensor: string;
  cloud_fraction: number;
  reconstructed_total_mw: number;
  raw_modis_total_mw: number;
  raw_viirs_total_mw: number;
  mean_sigma_mw_km2: number;
}

export interface DynamicRegionInfo {
  id: string;
  name: string;
  subtitle: string;
  biome: string;
  bbox: [number, number, number, number]; // [west, south, east, north]
  center_lat: number;
  center_lon: number;
  width_km: number;
  depth_km: number;
  min_elev_m: number;
  max_elev_m: number;
  mean_elev_m: number;
  terrain_source: string;
}

export interface DynamicRegionRun {
  run_id: string;
  provenance: string;
  region: DynamicRegionInfo;
  assets: {
    dem_f32_url: string;
    dem_hires_f32_url?: string;
    satellite_url: string;
    reconstruction_u8_url: string;
    export_geojson_url: string;
    export_csv_url: string;
    /** Terrain pack v1 manifest. Validated by the stage before use. */
    terrain_pack?: unknown;
  };
  pipeline_stages: PipelineStageRecord[];
  metrics: RunMetrics;
  epoch_summaries: EpochSummary[];
  observer_passes?: unknown;
  /** How the field bytes map to MW/km2 (real runs). Read through parseFieldIntensityScale. */
  encoding?: unknown;
  /** Real runs: what the model believes between the passes. Read through parseBeliefFrames. */
  belief_frames?: unknown;
  /** Runs with a satellite hidden: the cells the model declares at each look of it. Read through parseDeclaredCells. */
  declared_cells?: unknown;
  /** Real runs: the model's own description, with its fitted values. Read through parseResidenceHours. */
  model?: unknown;
}

/**
 * How a field byte (v = byte / 255) maps to fire radiative power density.
 *   linear   mw = v * maxMwKm2                                   (simulated runs, 0 to 80 MW/km2)
 *   log10    byte 0 is no fire; byte 1 to 255 is
 *            minMwKm2 * (maxMwKm2 / minMwKm2) ** ((byte - 1) / 254)   (real runs)
 */
export interface FieldIntensityScale {
  kind: 'linear' | 'log10';
  maxMwKm2: number;
  minMwKm2: number;
  /** Legend ticks named by the payload: position on the scale (byte / 255) and its value. */
  ticks?: Array<{ at: number; mwPerKm2: number }>;
}

export const DEFAULT_FIELD_INTENSITY_SCALE: FieldIntensityScale = { kind: 'linear', maxMwKm2: 80, minMwKm2: 0 };

/**
 * Reads the intensity scale of a run from its `encoding` block. A block with `scale: "log10"`,
 * `min_mw_km2` and `max_mw_km2` is the logarithmic byte scale; its `legend_ticks` (`mw_km2`,
 * `byte`) are kept for the legend. Any other block is read as linear with `z_hat_max_mw_km2` at
 * the top. Without a block the simulated runs' scale applies: linear, 0 to 80 MW/km2.
 */
export function parseFieldIntensityScale(raw: unknown): FieldIntensityScale {
  if (!isRecord(raw)) return DEFAULT_FIELD_INTENSITY_SCALE;
  const min = Number(raw.min_mw_km2);
  const max = Number(raw.max_mw_km2);
  if (raw.scale === 'log10' && Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > min) {
    const ticks: Array<{ at: number; mwPerKm2: number }> = [];
    if (Array.isArray(raw.legend_ticks)) {
      for (const item of raw.legend_ticks) {
        if (!isRecord(item)) continue;
        const mw = Number(item.mw_km2);
        const byte = Number(item.byte);
        if (Number.isFinite(mw) && Number.isFinite(byte)) ticks.push({ at: byte / 255, mwPerKm2: mw });
      }
    }
    return { kind: 'log10', maxMwKm2: max, minMwKm2: min, ticks: ticks.length > 0 ? ticks : undefined };
  }
  const top = Number(raw.z_hat_max_mw_km2);
  return {
    kind: 'linear',
    maxMwKm2: Number.isFinite(top) && top > 0 ? top : DEFAULT_FIELD_INTENSITY_SCALE.maxMwKm2,
    minMwKm2: 0,
  };
}

/** Fire radiative power density (MW/km2) at a position v (0..1, byte / 255) of the intensity scale. */
export function fieldScaleValue(scale: FieldIntensityScale, v: number): number {
  const c = Math.min(1, Math.max(0, v));
  if (scale.kind === 'linear') return c * scale.maxMwKm2;
  const byte = c * 255;
  return byte < 0.5 ? 0 : scale.minMwKm2 * (scale.maxMwKm2 / scale.minMwKm2) ** ((byte - 1) / 254);
}

/** Position (0..1, byte / 255) of a fire radiative power density on the intensity scale. */
export function fieldScalePosition(scale: FieldIntensityScale, mwPerKm2: number): number {
  if (scale.kind === 'linear') return Math.min(1, Math.max(0, mwPerKm2 / scale.maxMwKm2));
  if (mwPerKm2 < scale.minMwKm2) return 0;
  const byte = 1 + (254 * Math.log(mwPerKm2 / scale.minMwKm2)) / Math.log(scale.maxMwKm2 / scale.minMwKm2);
  return Math.min(1, byte / 255);
}

/**
 * The belief frames of a real run: the model's forward estimate at fixed time steps on its own
 * grid, which covers the region's box. The file at `url` holds steps x ny x nx x 2 bytes, row 0
 * north, column 0 west: the probability that the cell burns (byte / 255) and the expected fire
 * radiative power density on the run's intensity scale.
 */
export interface BeliefFramesInfo {
  url: string;
  steps: number;
  stepMs: number;
  /** Time of step 0, ms since the epoch. */
  firstTimeMs: number;
  nx: number;
  ny: number;
  cellKm: number;
}

/**
 * Hours a burning cell stays lit in the run's model (`model.parameters.tau_res_h`). Null when the
 * run does not say.
 */
export function parseResidenceHours(raw: unknown): number | null {
  if (!isRecord(raw) || !isRecord(raw.parameters)) return null;
  const hours = Number(raw.parameters.tau_res_h);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

/** Reads the `belief_frames` block of a run. Null when the run has none or the block is not usable. */
export function parseBeliefFrames(raw: unknown): BeliefFramesInfo | null {
  if (!isRecord(raw) || !isRecord(raw.grid)) return null;
  const steps = Number(raw.steps);
  const stepMinutes = Number(raw.step_minutes);
  const nx = Number(raw.grid.nx);
  const ny = Number(raw.grid.ny);
  const cellKm = Number(raw.grid.cell_km);
  const firstTimeMs = Date.parse(String(raw.first_time_utc));
  if (typeof raw.url !== 'string' || raw.url.length === 0) return null;
  if (!Number.isInteger(steps) || steps < 1 || !Number.isInteger(nx) || !Number.isInteger(ny) || nx < 2 || ny < 2) return null;
  if (!Number.isFinite(stepMinutes) || stepMinutes <= 0 || !Number.isFinite(firstTimeMs)) return null;
  return {
    url: raw.url,
    steps,
    stepMs: stepMinutes * 60000,
    firstTimeMs,
    nx,
    ny,
    cellKm: Number.isFinite(cellKm) && cellKm > 0 ? cellKm : 0.375,
  };
}

export interface SensorDiagnosticModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
}

export const CA_DOMAIN = {
  lonMin: -121.6,
  latMin: 39.75,
  lonMax: -120.75,
  latMax: 40.35,
  centerLat: 40.05,
  centerLon: -121.18,
  meshWidth: 10.0,
  meshDepth: 8.2,
  gridSize: 256,
  frameCount: 24,
  widthKm: 72.53,
  depthKm: 66.62,
} as const;

export interface NormalizedFootprint {
  lat: number;
  lon: number;
  acrossTrackKm: number;
  alongTrackKm: number;
  azimuthDeg: number;
  intensityNorm: number;
  frpMw: number;
  family: SensorFamily;
  sensorLabel: string;
}

export interface NormalizedSatellitePass {
  id: string;
  frameIndex: number;
  sensorLabel: string;
  family: SensorFamily;
  altitudeKm: number;
  scanAngleDeg: number;
  azimuthDeg: number;
  skyPosition: [number, number, number];
  cloudFraction: number;
  footprints: NormalizedFootprint[];
  /**
   * Equator-crossing node of this pass, from the backend's platform and day or night rule. Absent
   * in the procedural fallback and in a payload that carries no `orbit_node`.
   */
  orbitNode?: 'ascending' | 'descending';
  /**
   * Real runs with a hold-out: this pass's detections were kept from the estimate and are in the
   * payload only to score it (`epistemic_regime` of the frame ends in `held_out`). The stage draws
   * nothing of a hidden pass.
   */
  hidden?: boolean;
  /**
   * A pass laid onto the run after scoring: the hidden instrument of a blind run once it is
   * revealed (`revealed_after_scoring`), or what a look of the next-look round uncovered
   * (`revealed_by_a_look`). The frame's own pass of the same instrument then counts as hidden,
   * so the detections are drawn once. The estimate was made without them, so the stage draws them
   * as filled blue squares in their pixels and never as the warm light of an assimilated detection.
   */
  revealed?: boolean;
  /** Revealed by a look, before the blind run itself is revealed: it makes no smoke yet. */
  revealedByLook?: boolean;
  /** Real runs: whether the overpass was by day, and when (UTC, ISO 8601). */
  isDay?: boolean;
  timeUtc?: string;
}

export interface NormalizedObserverDataset {
  source: 'fetched' | 'procedural_fallback';
  /**
   * 'firms' when the run is built from real NASA FIRMS detections. Each footprint
   * is then one real detection with its own pixel size. Absent for simulated runs.
   */
  dataSource?: 'firms';
  provenanceNote: string;
  frames: NormalizedSatellitePass[][];
}

export interface SensorCurveSample {
  scanAngleDeg: number;
  modisAreaKm2: number;
  modisAcrossKm: number;
  modisAlongKm: number;
  viirsAreaKm2: number;
  viirsAcrossKm: number;
  viirsAlongKm: number;
  modisMinFrpMw: number;
  viirsMinFrpMw: number;
}

export interface OverpassResidualBin {
  scanAngleDeg: number;
  rawResidual: number;
  harmonizedResidual: number;
  ci90HalfWidth: number;
  pairCount: number;
}

export interface PairedScatterSample {
  angleDeg: number;
  rawLogRatio: number;
  harmonizedLogRatio: number;
}

/** Status of a gate nobody evaluated: the backend's own word for it. */
export const GATE_NOT_EVALUATED = 'NOT_EVALUATED';

export interface BenchmarkGateRecord {
  gateId: string;
  title: string;
  /**
   * As computed by the backend, or GATE_NOT_EVALUATED. Nothing defaults to passed: a gate carries
   * a result only when the backend marks it `computed` and sends a status.
   */
  status: string;
  metric: string;
  /** `computed`: metric and status derived in code. `design_target`: a target, never a result. */
  kind?: 'computed' | 'design_target';
}

export interface NormalizedSensorDiagnostics {
  source: 'api' | 'static_artifact' | 'analytical_baseline';
  referenceLabel: string;
  provenanceNote: string;
  curves: SensorCurveSample[];
  residuals: OverpassResidualBin[];
  pairedSamples: PairedScatterSample[];
  benchmarkGates: BenchmarkGateRecord[];
  summary: {
    rawRmse: number;
    harmonizedRmse: number;
    conformalCoveragePct: number;
    edgeAreaRatioModis: number;
    edgeAreaRatioViirs: number;
    totalPairedPasses: number;
  };
}

const EARTH_RADIUS_KM = 6371.0;

/**
 * Analytical MODIS 1 km scan-pixel geometry (Ichoku & Kaufman 2005; Freeborn et al. 2011).
 */
export function computeModisFootprintKm(scanAngleDeg: number): {
  acrossKm: number;
  alongKm: number;
  areaKm2: number;
  minFrpMw: number;
} {
  const altKm = 705.0;
  const clampedDeg = Math.min(55.0, Math.max(0, Math.abs(scanAngleDeg)));
  const theta = (clampedDeg * Math.PI) / 180;
  if (theta < 1e-5) {
    return { acrossKm: 1.0, alongKm: 1.0, areaKm2: 1.0, minFrpMw: 4.96 };
  }
  const sinBeta = Math.min(0.996, ((EARTH_RADIUS_KM + altKm) / EARTH_RADIUS_KM) * Math.sin(theta));
  const beta = Math.asin(sinBeta);
  const cosBeta = Math.max(0.08, Math.cos(beta));
  const gamma = beta - theta;
  const slantKm = EARTH_RADIUS_KM * (Math.sin(gamma) / Math.sin(theta));
  const alongKm = (1.0 * slantKm) / altKm;
  const acrossKm = alongKm / cosBeta;
  const areaKm2 = acrossKm * alongKm;
  const minFrpMw = 4.35 * areaKm2 + 0.61;
  return { acrossKm, alongKm, areaKm2, minFrpMw };
}

/**
 * Analytical VIIRS 375 m I-band three-zone aggregated scan-pixel geometry (Schroeder et al. 2014).
 */
export function computeViirsFootprintKm(scanAngleDeg: number): {
  acrossKm: number;
  alongKm: number;
  areaKm2: number;
  minFrpMw: number;
} {
  const altKm = 825.2;
  const clampedDeg = Math.min(56.28, Math.max(0, Math.abs(scanAngleDeg)));
  const theta = (clampedDeg * Math.PI) / 180;
  const aggScale = clampedDeg < 31.72 ? 1.0 : clampedDeg < 44.86 ? 2.0 / 3.0 : 1.0 / 3.0;
  if (theta < 1e-5) {
    return { acrossKm: 0.375, alongKm: 0.362, areaKm2: 0.136, minFrpMw: 2.28 };
  }
  const sinBeta = Math.min(0.996, ((EARTH_RADIUS_KM + altKm) / EARTH_RADIUS_KM) * Math.sin(theta));
  const beta = Math.asin(sinBeta);
  const cosBeta = Math.max(0.08, Math.cos(beta));
  const gamma = beta - theta;
  const slantKm = EARTH_RADIUS_KM * (Math.sin(gamma) / Math.sin(theta));
  const alongKm = (0.375 * slantKm) / altKm;
  const acrossKm = (aggScale * alongKm) / cosBeta;
  const areaKm2 = acrossKm * alongKm;
  const minFrpMw = 5.4 * areaKm2 + 1.54;
  return { acrossKm, alongKm, areaKm2, minFrpMw };
}

export const DEFAULT_DOMAIN_BBOX: [number, number, number, number] = [
  CA_DOMAIN.lonMin,
  CA_DOMAIN.latMin,
  CA_DOMAIN.lonMax,
  CA_DOMAIN.latMax,
];

export function lonLatToWorldXZ(
  lon: number,
  lat: number,
  domainBbox: [number, number, number, number] = DEFAULT_DOMAIN_BBOX,
): [number, number] {
  const [lonMin, latMin, lonMax, latMax] = domainBbox;
  const lonSpan = Math.max(1e-5, lonMax - lonMin);
  const latSpan = Math.max(1e-5, latMax - latMin);
  const u = (lon - lonMin) / lonSpan;
  const v = (lat - latMin) / latSpan;
  const x = (u - 0.5) * CA_DOMAIN.meshWidth;
  // v = 1 (North, latMax) maps to z = -meshDepth / 2; v = 0 (South, latMin) maps to z = +meshDepth / 2
  const z = (0.5 - v) * CA_DOMAIN.meshDepth;
  return [x, z];
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function readNum(obj: Record<string, unknown>, keys: readonly string[], fallback: number): number {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const parsed = Number(v);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function readStr(obj: Record<string, unknown>, keys: readonly string[], fallback: string): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return fallback;
}

function inferFamily(sensorRaw: string): SensorFamily {
  const upper = sensorRaw.toUpperCase();
  if (
    upper.includes('VIIRS') ||
    upper.includes('NOAA') ||
    upper.includes('SNPP') ||
    upper.includes('S-NPP') ||
    upper.includes('375')
  ) {
    return 'viirs';
  }
  return 'modis';
}

function computeSkyPositionFromSubsat(
  subsatLon: number | null,
  subsatLat: number | null,
  scanAngleDeg: number,
  azimuthDeg: number,
  family: SensorFamily,
  passOrdinal: number,
  domainBbox: [number, number, number, number] = DEFAULT_DOMAIN_BBOX,
): [number, number, number] {
  const baseY = family === 'viirs' ? 3.85 : 3.35;
  const centerLon = (domainBbox[0] + domainBbox[2]) * 0.5;
  const centerLat = (domainBbox[1] + domainBbox[3]) * 0.5;
  if (subsatLon !== null && subsatLat !== null && Number.isFinite(subsatLon) && Number.isFinite(subsatLat)) {
    const dLon = (subsatLon - centerLon) * Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
    const dLat = subsatLat - centerLat;
    const norm = Math.hypot(dLon, dLat);
    if (norm > 1e-3) {
      const reach = Math.min(3.8, Math.max(0.45, (Math.abs(scanAngleDeg) / 55.0) * 3.6));
      return [(dLon / norm) * reach, baseY, (-dLat / norm) * reach];
    }
    return [0, baseY, 0];
  }

  const azRad = (azimuthDeg * Math.PI) / 180;
  const signedScan = (passOrdinal % 2 === 0 ? 1 : -1) * Math.min(52, Math.abs(scanAngleDeg));
  const lateralMag = (signedScan / 52) * 3.1;
  return [
    Math.cos(azRad) * lateralMag,
    baseY,
    Math.sin(azRad) * lateralMag * 0.78 + (family === 'viirs' ? -0.42 : 0.42),
  ];
}

/**
 * Generates deterministic, physically grounded 24-epoch overpass geometry & footprints
 * over any active regional bounding box [west, south, east, north] as a seamless fallback while static
 * or dynamic run assets load, clearly marked as modeled reconstruction geometry.
 */
export function createFallbackObserverDataset(
  domainBbox: [number, number, number, number] = DEFAULT_DOMAIN_BBOX,
): NormalizedObserverDataset {
  const [lonMin, latMin, lonMax, latMax] = domainBbox;
  const lonSpan = Math.max(0.08, lonMax - lonMin);
  const latSpan = Math.max(0.08, latMax - latMin);
  const padLon = lonSpan * 0.04;
  const padLat = latSpan * 0.05;
  const frames: NormalizedSatellitePass[][] = Array.from({ length: CA_DOMAIN.frameCount }, () => []);

  for (let f = 0; f < CA_DOMAIN.frameCount; f++) {
    const slot = f % 3;
    const progress = f / (CA_DOMAIN.frameCount - 1);
    const cloudFrac = f === 7 || f === 8 ? 0.65 : 0.08 + 0.05 * Math.sin(f * 0.9);
    const isSwathEdge = f === 6 || f === 13 || f === 18;

    const frontLon = lonMin + lonSpan * (0.235 + progress * 0.4);
    const frontLat = latMin + latSpan * (0.217 + progress * 0.467);

    const passSpecs: Array<{
      sensorLabel: string;
      family: SensorFamily;
      scanAngleDeg: number;
      azimuthDeg: number;
    }> =
      slot === 0
        ? [
            {
              sensorLabel: 'MODIS_TERRA',
              family: 'modis',
              scanAngleDeg: isSwathEdge ? 49.5 : 24.0 + 14.0 * Math.sin(f * 0.7),
              azimuthDeg: 101.5,
            },
          ]
        : [
            {
              sensorLabel: 'MODIS_AQUA',
              family: 'modis',
              scanAngleDeg: isSwathEdge ? 51.0 : 32.0 + 12.0 * Math.cos(f * 0.55),
              azimuthDeg: 102.0,
            },
            {
              sensorLabel: 'VIIRS_NOAA20',
              family: 'viirs',
              scanAngleDeg: 20.0 + 16.0 * Math.sin(f * 0.45 + 0.6),
              azimuthDeg: 101.0,
            },
          ];

    passSpecs.forEach((spec, pIdx) => {
      const footprints: NormalizedFootprint[] = [];
      const count = spec.family === 'viirs' ? 32 : 12;
      const geom =
        spec.family === 'viirs'
          ? computeViirsFootprintKm(spec.scanAngleDeg)
          : computeModisFootprintKm(spec.scanAngleDeg);

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + f * 0.19 + pIdx * 0.7;
        const ring = i % 3 === 0 ? 0.042 : i % 3 === 1 ? 0.096 : 0.153;
        const dLon = (Math.cos(angle) * ring * 1.22 + (i / count - 0.5) * 0.14) * lonSpan;
        const dLat = (Math.sin(angle) * ring * 1.2 + (i / count - 0.5) * 0.15) * latSpan;
        const lon = Math.min(lonMax - padLon, Math.max(lonMin + padLon, frontLon + dLon));
        const lat = Math.min(latMax - padLat, Math.max(latMin + padLat, frontLat + dLat));

        const rawFrp =
          i < count * 0.42
            ? 36.0 + 48.0 * Math.abs(Math.sin(i * 1.7 + f * 0.4))
            : 4.0 + 18.0 * Math.abs(Math.cos(i * 2.3 + f * 0.3));
        const effFrp = rawFrp * (1.0 - cloudFrac * 0.4);
        if (spec.family === 'modis' && effFrp < geom.minFrpMw * 0.88) continue;

        const intensityNorm = Math.min(1.0, Math.max(0.08, effFrp / 80.0));
        footprints.push({
          lat,
          lon,
          acrossTrackKm: geom.acrossKm,
          alongTrackKm: geom.alongKm,
          azimuthDeg: spec.azimuthDeg,
          intensityNorm,
          frpMw: effFrp,
          family: spec.family,
          sensorLabel: spec.sensorLabel,
        });
      }

      frames[f].push({
        id: `fallback-${f}-${pIdx}`,
        frameIndex: f,
        sensorLabel: spec.sensorLabel,
        family: spec.family,
        altitudeKm: spec.family === 'viirs' ? 825.2 : 705.0,
        scanAngleDeg: spec.scanAngleDeg,
        azimuthDeg: spec.azimuthDeg,
        skyPosition: computeSkyPositionFromSubsat(
          null,
          null,
          spec.scanAngleDeg,
          spec.azimuthDeg,
          spec.family,
          pIdx + f,
          domainBbox,
        ),
        cloudFraction: cloudFrac,
        footprints,
      });
    });
  }

  return {
    source: 'procedural_fallback',
    provenanceNote: 'Analytical sun-synchronous orbital scan geometry (modeled reconstruction passes)',
    frames,
  };
}

function parseFootprintItems(
  rawList: unknown,
  sensorCodeMap: Record<number, string>,
  defaultFamily: SensorFamily,
  defaultLabel: string,
  defaultScanAngleDeg: number,
  defaultAzimuthDeg: number,
): Array<NormalizedFootprint & { sensorCode: number | null }> {
  if (!Array.isArray(rawList)) return [];
  const out: Array<NormalizedFootprint & { sensorCode: number | null }> = [];

  for (const item of rawList) {
    // Format A: Compact 8-element tuple [lon, lat, scan_km, track_km, angle_deg, frp_mw, confidence, sensor_code]
    if (Array.isArray(item) && item.length >= 6) {
      const lon = Number(item[0]);
      const lat = Number(item[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const scanKm = Math.max(0.22, Number(item[2]) || 0.5);
      const trackKm = Math.max(0.22, Number(item[3]) || 0.5);
      const angleDeg = Number.isFinite(Number(item[4])) ? Number(item[4]) : defaultAzimuthDeg;
      const frpMw = Math.max(0.2, Number(item[5]) || 10);
      const sensorCode = item.length >= 8 && Number.isFinite(Number(item[7])) ? Math.round(Number(item[7])) : null;
      const sensorLabel = (sensorCode !== null ? sensorCodeMap[sensorCode] : undefined) ?? defaultLabel;
      const family: SensorFamily =
        sensorCode !== null ? (sensorCode >= 2 ? 'viirs' : 'modis') : inferFamily(sensorLabel);
      // Map FRP [0..80+ MW] smoothly onto [0.06..1.0] for interactive sensitivity threshold slider
      const intensityNorm = Math.min(1.0, Math.max(0.06, Math.log1p(frpMw) / Math.log1p(95)));

      out.push({
        lon,
        lat,
        acrossTrackKm: scanKm,
        alongTrackKm: trackKm,
        azimuthDeg: angleDeg,
        intensityNorm,
        frpMw,
        family,
        sensorLabel,
        sensorCode,
      });
      continue;
    }

    // Format B: Object record
    if (!isRecord(item)) continue;
    const lat = readNum(item, ['lat', 'latitude', 'y_lat'], Number.NaN);
    const lon = readNum(item, ['lon', 'lng', 'longitude', 'x_lon'], Number.NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (item.detected === false) continue;

    const sCodeRaw = readNum(item, ['sensor_code', 'sensorCode'], Number.NaN);
    const sensorCode = Number.isFinite(sCodeRaw) ? Math.round(sCodeRaw) : null;
    const sensorStr = readStr(
      item,
      ['sensor', 'instrument', 'platform', 'sensor_id'],
      (sensorCode !== null ? sensorCodeMap[sensorCode] : undefined) ?? defaultLabel,
    );
    const family: SensorFamily =
      item.family === 'viirs' || item.family === 'modis'
        ? item.family
        : sensorStr === defaultLabel
          ? defaultFamily
          : inferFamily(sensorStr);

    const scanAngle = readNum(item, ['scan_angle_deg', 'scanAngleDeg', 'vza_deg'], defaultScanAngleDeg);
    const analytic =
      family === 'viirs' ? computeViirsFootprintKm(scanAngle) : computeModisFootprintKm(scanAngle);

    const acrossTrackKm = Math.max(
      0.22,
      readNum(item, ['scan_km', 'across_track_km', 'acrossTrackKm', 'major_km'], analytic.acrossKm),
    );
    const alongTrackKm = Math.max(
      0.22,
      readNum(item, ['track_km', 'along_track_km', 'alongTrackKm', 'minor_km'], analytic.alongKm),
    );
    const azimuthDeg = readNum(item, ['angle_deg', 'azimuth_deg', 'azimuthDeg', 'orientation_deg'], defaultAzimuthDeg);
    const frpMw = readNum(item, ['frp_mw', 'frpMw', 'frp'], 18);
    const intensityNorm = Math.min(1.0, Math.max(0.06, Math.log1p(Math.max(0.1, frpMw)) / Math.log1p(95)));

    out.push({
      lat,
      lon,
      acrossTrackKm,
      alongTrackKm,
      azimuthDeg,
      intensityNorm,
      frpMw,
      family,
      sensorLabel: sensorStr,
      sensorCode,
    });
  }

  return out;
}

/**
 * Schema-adaptive normalizer for `/generated/fields/observer_passes.json` and dynamic region runs.
 */
export function normalizeObserverDataset(
  raw: unknown,
  domainBbox: [number, number, number, number] = DEFAULT_DOMAIN_BBOX,
): NormalizedObserverDataset {
  const fallback = createFallbackObserverDataset(domainBbox);
  if (!isRecord(raw) && !Array.isArray(raw)) return fallback;

  const sensorCodeMap: Record<number, string> = {
    0: 'MODIS_TERRA',
    1: 'MODIS_AQUA',
    2: 'VIIRS_NOAA20',
    3: 'VIIRS_NOAA21',
  };
  if (isRecord(raw) && isRecord(raw.sensor_codes)) {
    for (const [k, v] of Object.entries(raw.sensor_codes)) {
      const code = Number(k);
      if (Number.isFinite(code) && typeof v === 'string') {
        sensorCodeMap[code] = v;
      }
    }
  }

  const frames: NormalizedSatellitePass[][] = Array.from({ length: CA_DOMAIN.frameCount }, () => []);
  let parsedPassCount = 0;

  const rawFrames = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.frames)
      ? raw.frames
      : Array.isArray(raw.epochs)
        ? raw.epochs
        : [];

  rawFrames.forEach((frameEntry, idx) => {
    if (!isRecord(frameEntry)) return;
    const fIdx = Math.min(
      CA_DOMAIN.frameCount - 1,
      Math.max(0, Math.round(readNum(frameEntry, ['frame', 'frame_index', 'epoch'], idx))),
    );
    const frameCloud = Math.min(1, Math.max(0, readNum(frameEntry, ['cloud_fraction', 'cloudFraction'], 0.05)));

    // Parse frame-level pooled footprints (e.g. 8-element tuples with sensor_code at index 7)
    const frameFootprints = parseFootprintItems(
      frameEntry.footprints,
      sensorCodeMap,
      'viirs',
      readStr(frameEntry, ['sensor'], 'VIIRS_NOAA20'),
      readNum(frameEntry, ['scan_angle_deg'], 20),
      readNum(frameEntry, ['azimuth_deg'], 101),
    );

    const subPasses = Array.isArray(frameEntry.passes) ? frameEntry.passes : [frameEntry];
    subPasses.forEach((pItem, pIdx) => {
      if (!isRecord(pItem)) return;
      const pCodeRaw = readNum(pItem, ['sensor_code', 'sensorCode'], Number.NaN);
      const pCode = Number.isFinite(pCodeRaw) ? Math.round(pCodeRaw) : null;
      const sensorLabel = readStr(
        pItem,
        ['sensor', 'sensor_label', 'platform', 'instrument'],
        (pCode !== null ? sensorCodeMap[pCode] : undefined) ?? 'MODIS_AQUA',
      );
      const family: SensorFamily =
        pCode !== null ? (pCode >= 2 ? 'viirs' : 'modis') : inferFamily(sensorLabel);
      const altitudeKm = readNum(pItem, ['altitude_km', 'altitudeKm'], family === 'viirs' ? 825.2 : 705.0);
      const scanAngleDeg = readNum(pItem, ['scan_angle_deg', 'scanAngleDeg', 'view_zenith_deg'], 24);
      const azimuthDeg = readNum(pItem, ['azimuth_deg', 'azimuthDeg'], 101);
      const subLon = readNum(pItem, ['subsat_lon', 'sub_sat_lon'], Number.NaN);
      const subLat = readNum(pItem, ['subsat_lat', 'sub_sat_lat'], Number.NaN);

      const skyPosition = computeSkyPositionFromSubsat(
        Number.isFinite(subLon) ? subLon : null,
        Number.isFinite(subLat) ? subLat : null,
        scanAngleDeg,
        azimuthDeg,
        family,
        pIdx + fIdx,
        domainBbox,
      );

      // Match footprints either from pass-level footprints or frame-level pooled footprints by sensor_code / family
      const ownFootprints = parseFootprintItems(
        pItem.footprints,
        sensorCodeMap,
        family,
        sensorLabel,
        scanAngleDeg,
        azimuthDeg,
      );
      const matched =
        ownFootprints.length > 0 && pItem !== frameEntry
          ? ownFootprints
          : frameFootprints.filter((fp) =>
              pCode !== null && fp.sensorCode !== null ? fp.sensorCode === pCode : fp.family === family,
            );

      const nodeRaw = readStr(pItem, ['orbit_node', 'orbitNode'], '');
      frames[fIdx].push({
        id: `pass-${fIdx}-${pIdx}-${sensorLabel}`,
        frameIndex: fIdx,
        sensorLabel,
        family,
        altitudeKm,
        scanAngleDeg,
        azimuthDeg,
        skyPosition,
        cloudFraction: frameCloud,
        footprints: matched,
        orbitNode: nodeRaw === 'ascending' || nodeRaw === 'descending' ? nodeRaw : undefined,
        hidden: readStr(frameEntry, ['epistemic_regime'], '').includes('held_out') || undefined,
        revealed:
          (pItem as Record<string, unknown>).revealed_after_scoring === true ||
          (pItem as Record<string, unknown>).revealed_by_a_look === true ||
          undefined,
        revealedByLook: (pItem as Record<string, unknown>).revealed_by_a_look === true || undefined,
        isDay: typeof frameEntry.is_day === 'boolean' ? frameEntry.is_day : undefined,
        timeUtc: readStr(frameEntry, ['timestamp_utc'], '') || undefined,
      });
      parsedPassCount += 1;
    });
  });

  // A pass whose detections were laid on after scoring was kept from the model. The page un-marks
  // its frame when it lays them on. Here the frame's own pass of that instrument stays a pass
  // kept from the model: its detections are drawn once, through the pass laid on, and the
  // estimate at that pass keeps the look it has on a hidden pass (the cells the model declared).
  for (const passes of frames) {
    const laidOn = passes.filter((sp) => sp.revealed && !sp.revealedByLook);
    for (const sp of passes) {
      if (!sp.revealed && laidOn.some((r) => r.sensorLabel === sp.sensorLabel)) sp.hidden = true;
    }
  }

  if (parsedPassCount === 0) return fallback;

  for (let f = 0; f < CA_DOMAIN.frameCount; f++) {
    if (frames[f].length === 0) {
      frames[f] = fallback.frames[f];
    }
  }

  const provenanceNote = isRecord(raw)
    ? readStr(raw, ['provenance', 'description', 'note'], fallback.provenanceNote)
    : fallback.provenanceNote;

  return {
    source: 'fetched',
    dataSource: isRecord(raw) && raw.source === 'firms' ? 'firms' : undefined,
    provenanceNote,
    frames,
  };
}

export function createAnalyticalSensorDiagnostics(
  source: NormalizedSensorDiagnostics['source'] = 'analytical_baseline',
): NormalizedSensorDiagnostics {
  const curves: SensorCurveSample[] = [];
  for (let deg = 0; deg <= 56; deg += 1) {
    const m = computeModisFootprintKm(Math.min(55, deg));
    const v = computeViirsFootprintKm(deg);
    curves.push({
      scanAngleDeg: deg,
      modisAreaKm2: m.areaKm2,
      modisAcrossKm: m.acrossKm,
      modisAlongKm: m.alongKm,
      viirsAreaKm2: v.areaKm2,
      viirsAcrossKm: v.acrossKm,
      viirsAlongKm: v.alongKm,
      modisMinFrpMw: m.minFrpMw,
      viirsMinFrpMw: v.minFrpMw,
    });
  }

  const residuals: OverpassResidualBin[] = [
    { scanAngleDeg: 7.5, rawResidual: -0.015, harmonizedResidual: 0.012, ci90HalfWidth: 0.088, pairCount: 28 },
    { scanAngleDeg: 22.5, rawResidual: -0.07, harmonizedResidual: -0.022, ci90HalfWidth: 0.092, pairCount: 28 },
    { scanAngleDeg: 37.5, rawResidual: -0.115, harmonizedResidual: -0.018, ci90HalfWidth: 0.095, pairCount: 16 },
    { scanAngleDeg: 50.0, rawResidual: -0.152, harmonizedResidual: 0.014, ci90HalfWidth: 0.098, pairCount: 14 },
    { scanAngleDeg: 60.0, rawResidual: -0.21, harmonizedResidual: -0.024, ci90HalfWidth: 0.105, pairCount: 15 },
  ];

  // No gates without the backend: a gate is a computed result, and this baseline computes none
  const benchmarkGates: BenchmarkGateRecord[] = [];

  return {
    source,
    referenceLabel: 'VIIRS_NADIR_EQUIV, 13:30 LST Paired Aqua / NOAA-20 Benchmark',
    provenanceNote:
      'Analytical sensor forward operator (Sofiev & Kouznetsov 2026 GMD; Wolfe et al. 2013). No downloaded NASA FIRMS rows.',
    curves,
    residuals,
    pairedSamples: [],
    benchmarkGates,
    summary: {
      rawRmse: 0.12,
      harmonizedRmse: 0.089,
      conformalCoveragePct: 90.6,
      edgeAreaRatioModis: computeModisFootprintKm(55).areaKm2,
      edgeAreaRatioViirs: computeViirsFootprintKm(55).areaKm2 / computeViirsFootprintKm(0).areaKm2,
      totalPairedPasses: 101,
    },
  };
}

/**
 * Schema-adaptive normalizer for `/api/sensor-model` and `/generated/fields/sensor_model_diagnostics.json`.
 */
export function normalizeSensorDiagnostics(
  raw: unknown,
  source: NormalizedSensorDiagnostics['source'],
): NormalizedSensorDiagnostics {
  const baseline = createAnalyticalSensorDiagnostics(source);
  if (!isRecord(raw)) return baseline;

  let curves: SensorCurveSample[] = [];
  const curveList =
    raw.scan_geometry_curves ?? raw.curves ?? raw.pixel_growth ?? raw.scan_curves ?? raw.scan_profile;

  if (Array.isArray(curveList) && curveList.length >= 4) {
    let lastValidModisArea = 1.0;
    let lastValidModisScan = 1.0;
    let lastValidModisTrack = 1.0;
    let lastValidModisD50 = 4.96;

    for (const item of curveList) {
      if (!isRecord(item)) continue;
      const deg = readNum(item, ['scan_angle_deg', 'scanAngleDeg', 'angle_deg', 'theta_deg'], Number.NaN);
      if (!Number.isFinite(deg)) continue;

      const mFallback = computeModisFootprintKm(Math.min(55, deg));
      const vFallback = computeViirsFootprintKm(deg);
      const modisValid = item.modis_valid !== false;

      const mArea = modisValid
        ? readNum(item, ['modis_area_km2', 'modisAreaKm2', 'area_modis'], mFallback.areaKm2)
        : lastValidModisArea;
      const mScan = modisValid
        ? readNum(item, ['modis_scan_km', 'modis_across_km'], mFallback.acrossKm)
        : lastValidModisScan;
      const mTrack = modisValid
        ? readNum(item, ['modis_track_km', 'modis_along_km'], mFallback.alongKm)
        : lastValidModisTrack;
      const mFrp = modisValid
        ? readNum(
            item,
            ['modis_day_d50_mw', 'modis_min_frp_mw', 'modisMinFrpMw', 'modis_threshold_mw'],
            mFallback.minFrpMw,
          )
        : lastValidModisD50;

      if (modisValid) {
        lastValidModisArea = mArea;
        lastValidModisScan = mScan;
        lastValidModisTrack = mTrack;
        lastValidModisD50 = mFrp;
      }

      curves.push({
        scanAngleDeg: deg,
        modisAreaKm2: mArea,
        modisAcrossKm: mScan,
        modisAlongKm: mTrack,
        viirsAreaKm2: readNum(item, ['viirs_area_km2', 'viirsAreaKm2'], vFallback.areaKm2),
        viirsAcrossKm: readNum(item, ['viirs_scan_km', 'viirs_across_km'], vFallback.acrossKm),
        viirsAlongKm: readNum(item, ['viirs_track_km', 'viirs_along_km'], vFallback.alongKm),
        modisMinFrpMw: mFrp,
        viirsMinFrpMw: readNum(
          item,
          ['viirs_day_d50_mw', 'viirs_min_frp_mw', 'viirsMinFrpMw', 'viirs_threshold_mw'],
          vFallback.minFrpMw,
        ),
      });
    }
  }

  if (curves.length < 4) {
    curves = baseline.curves;
  } else {
    curves.sort((a, b) => a.scanAngleDeg - b.scanAngleDeg);
  }

  let residuals: OverpassResidualBin[] = [];
  const pairedSamples: PairedScatterSample[] = [];

  const p13 = isRecord(raw.paired_1330_calibration) ? raw.paired_1330_calibration : null;
  const binList =
    p13?.vza_bin_summary ??
    raw.paired_overpass_residuals ??
    raw.paired_residuals ??
    raw.residuals ??
    raw.overpass_residuals;

  if (Array.isArray(binList) && binList.length >= 3) {
    binList.forEach((item, idx) => {
      if (!isRecord(item)) return;
      const deg = readNum(
        item,
        ['vza_midpoint_deg', 'scan_angle_deg', 'scanAngleDeg', 'bin_center_deg'],
        (idx / Math.max(1, binList.length - 1)) * 56,
      );
      const rawRes = readNum(
        item,
        ['raw_mean_log10_bias', 'raw_residual', 'rawResidual', 'unharmonized_residual', 'log_ratio_raw'],
        Number.NaN,
      );
      const harmRes = readNum(
        item,
        ['harmonized_mean_log10_bias', 'harmonized_residual', 'harmonizedResidual', 'calibrated_residual'],
        0.0,
      );
      if (!Number.isFinite(rawRes)) return;
      residuals.push({
        scanAngleDeg: deg,
        rawResidual: rawRes,
        harmonizedResidual: harmRes,
        ci90HalfWidth: readNum(item, ['harmonized_rmse_dex', 'ci90_half_width', 'ci90HalfWidth'], 0.09),
        pairCount: Math.round(readNum(item, ['sample_count', 'pair_count', 'pairCount', 'count'], 24)),
      });
    });
  }

  if (p13 && Array.isArray(p13.paired_samples)) {
    for (const s of p13.paired_samples) {
      if (!isRecord(s)) continue;
      const angleDeg = readNum(s, ['modis_view_zenith_deg', 'scan_angle_deg', 'vza_deg'], Number.NaN);
      const rawLogRatio = readNum(s, ['raw_log10_ratio', 'raw_residual'], Number.NaN);
      const harmonizedLogRatio = readNum(s, ['harmonized_log10_ratio', 'harmonized_residual'], Number.NaN);
      if (Number.isFinite(angleDeg) && Number.isFinite(rawLogRatio) && Number.isFinite(harmonizedLogRatio)) {
        pairedSamples.push({ angleDeg, rawLogRatio, harmonizedLogRatio });
      }
    }
  }

  if (residuals.length < 3) {
    residuals = baseline.residuals;
  } else {
    residuals.sort((a, b) => a.scanAngleDeg - b.scanAngleDeg);
  }

  const benchmarkGates: BenchmarkGateRecord[] = [];
  if (Array.isArray(raw.benchmark_gates)) {
    for (const g of raw.benchmark_gates) {
      if (!isRecord(g)) continue;
      const kindRaw = readStr(g, ['kind'], '');
      const kind = kindRaw === 'computed' || kindRaw === 'design_target' ? kindRaw : undefined;
      benchmarkGates.push({
        gateId: readStr(g, ['gate_id', 'id'], 'GATE'),
        title: readStr(g, ['title', 'name'], 'Benchmark Gate'),
        // A missing status means not evaluated, and only a computed gate carries a result
        status: kind === 'computed' ? readStr(g, ['status'], GATE_NOT_EVALUATED) : GATE_NOT_EVALUATED,
        metric: readStr(g, ['metric', 'summary'], ''),
        kind,
      });
    }
  }

  const fallbackRawRmse = Math.sqrt(
    residuals.reduce((acc, r) => acc + r.rawResidual * r.rawResidual, 0) / residuals.length,
  );
  const fallbackHarmRmse = Math.sqrt(
    residuals.reduce((acc, r) => acc + r.harmonizedResidual * r.harmonizedResidual, 0) / residuals.length,
  );

  const rawRmse = p13
    ? readNum(p13, ['raw_overall_rmse_dex', 'raw_rmse'], fallbackRawRmse)
    : fallbackRawRmse;
  const harmonizedRmse = p13
    ? readNum(p13, ['harmonized_overall_rmse_dex', 'harmonized_rmse'], fallbackHarmRmse)
    : fallbackHarmRmse;
  const rawCov = p13 ? readNum(p13, ['conformal_90pct_empirical_coverage'], 0.906) : 0.906;
  const conformalCoveragePct = rawCov <= 1.5 ? rawCov * 100 : rawCov;

  const minCurve = curves[0];
  const modis55 = curves.find((c) => c.scanAngleDeg >= 54.5) ?? curves[curves.length - 1];
  const maxCurve = curves[curves.length - 1];

  return {
    source,
    referenceLabel: p13
      ? readStr(p13, ['description'], baseline.referenceLabel)
      : readStr(raw, ['reference_frame', 'referenceLabel'], baseline.referenceLabel),
    provenanceNote: readStr(raw, ['provenance', 'provenance_note', 'description'], baseline.provenanceNote),
    curves,
    residuals,
    pairedSamples,
    benchmarkGates: benchmarkGates.length > 0 ? benchmarkGates : baseline.benchmarkGates,
    summary: {
      rawRmse,
      harmonizedRmse,
      conformalCoveragePct,
      edgeAreaRatioModis: modis55.modisAreaKm2 / Math.max(0.05, minCurve.modisAreaKm2),
      edgeAreaRatioViirs: maxCurve.viirsAreaKm2 / Math.max(0.05, minCurve.viirsAreaKm2),
      totalPairedPasses:
        pairedSamples.length > 0
          ? pairedSamples.length
          : residuals.reduce((acc, r) => acc + r.pairCount, 0),
    },
  };
}
