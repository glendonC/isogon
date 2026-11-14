import type { NormalizedSatellitePass, SensorFamily } from '../types';

/**
 * Whiskbroom scan geometry for MODIS 1 km and VIIRS 375 m (I-band) ground cells.
 *
 * The constants and formulas mirror `backend/model/sensor_physics.py` (`modis_geometry_from_scan`,
 * `viirs_geometry_from_scan`) and `backend/model/grid.py` (`EARTH_RADIUS_KM`) so the cells drawn on
 * the terrain have the same dimensions the solver uses for its sensor forward model:
 *
 *   scan_km(theta)  = Re * alpha_scan * (cos(theta) / root - 1)
 *   track_km(theta) = (Re + h) * alpha_track * (cos(theta) - root)
 *   root            = sqrt((Re / (Re + h))^2 - sin(theta)^2)
 *
 * MODIS: 1.00 x 1.00 km at nadir, 2.43 x 1.50 km at 45 degrees, 4.83 x 2.01 km at the 55 degree edge.
 * VIIRS I-band: 0.375 x 0.362 km at nadir with 3:1, 2:1 and 1:1 sample aggregation in three zones
 * (boundaries at 31.72 and 44.86 degrees), which resets the scan dimension at each boundary.
 */
export const SCAN_EARTH_RADIUS_KM = 6378.137;

export interface ScanSensorSpec {
  family: SensorFamily;
  altitudeKm: number;
  maxScanDeg: number;
  /** Angular size of one native sample along the scan, radians. */
  alphaScanNative: number;
  /** Angular size of one detector row along the track, radians. */
  alphaTrack: number;
  /** Detector rows swept by one mirror scan. */
  detectors: number;
  /** Aggregation zone limits in degrees (unused for MODIS). */
  zone1Deg: number;
  zone2Deg: number;
}

export const MODIS_SCAN: ScanSensorSpec = {
  family: 'modis',
  altitudeKm: 705.0,
  maxScanDeg: 55.0,
  alphaScanNative: 1.0 / 705.0,
  alphaTrack: 1.0 / 705.0,
  detectors: 10,
  zone1Deg: 90,
  zone2Deg: 90,
};

export const VIIRS_SCAN: ScanSensorSpec = {
  family: 'viirs',
  altitudeKm: 825.2,
  maxScanDeg: 56.28,
  alphaScanNative: 0.125 / 825.2,
  alphaTrack: 0.362 / 825.2,
  detectors: 32,
  zone1Deg: 31.72,
  zone2Deg: 44.86,
};

const DEG = Math.PI / 180;

function orbitRatio(spec: ScanSensorSpec): number {
  return (SCAN_EARTH_RADIUS_KM + spec.altitudeKm) / SCAN_EARTH_RADIUS_KM;
}

/** Sample aggregation factor at a scan angle (3, 2 or 1 for VIIRS, always 1 for MODIS). */
export function scanAggregation(spec: ScanSensorSpec, scanAngleDeg: number): number {
  if (spec.family !== 'viirs') return 1;
  const a = Math.abs(scanAngleDeg);
  return a < spec.zone1Deg ? 3 : a < spec.zone2Deg ? 2 : 1;
}

/** Ground footprint of one cell (km) at a scan angle, from the backend formulas. */
export function scanFootprintKm(
  spec: ScanSensorSpec,
  scanAngleDeg: number,
): { scanKm: number; trackKm: number } {
  const thetaDeg = Math.min(spec.maxScanDeg, Math.abs(scanAngleDeg));
  const theta = thetaDeg * DEG;
  const k = orbitRatio(spec);
  const root = Math.sqrt(Math.max(1 / (k * k) - Math.sin(theta) ** 2, 1e-8));
  const alphaScan = spec.alphaScanNative * scanAggregation(spec, thetaDeg);
  return {
    scanKm: SCAN_EARTH_RADIUS_KM * alphaScan * (Math.cos(theta) / root - 1),
    trackKm: SCAN_EARTH_RADIUS_KM * k * spec.alphaTrack * (Math.cos(theta) - root),
  };
}

/** Ground distance (km) from the sub-satellite track to the point seen at a scan angle. */
export function scanGroundDistanceKm(spec: ScanSensorSpec, scanAngleDeg: number): number {
  const theta = Math.min(spec.maxScanDeg, Math.abs(scanAngleDeg)) * DEG;
  const k = orbitRatio(spec);
  return SCAN_EARTH_RADIUS_KM * (Math.asin(Math.min(1, k * Math.sin(theta))) - theta);
}

/**
 * Pass geometry in the form the shader wants.
 * `axisEast, axisNorth`: unit scan axis pointing from the region toward the sub-satellite track
 * (bearing `azimuth_deg`, clockwise from north, the convention of `backend/model/solver.py`).
 * `nadirKm`: ground distance from the region center to the sub-satellite track.
 */
export interface ScanPassUniform {
  axisEast: number;
  axisNorth: number;
  nadirKm: number;
  valid: boolean;
  scanAngleDeg: number;
}

export const NO_SCAN_PASS: Readonly<ScanPassUniform> = {
  axisEast: 1,
  axisNorth: 0,
  nadirKm: 0,
  valid: false,
  scanAngleDeg: 0,
};

export function resolveScanPass(
  pass: NormalizedSatellitePass | undefined,
  spec: ScanSensorSpec,
  out: ScanPassUniform,
): ScanPassUniform {
  if (!pass || pass.family !== spec.family) {
    out.valid = false;
    return out;
  }
  const az = pass.azimuthDeg * DEG;
  out.axisEast = Math.sin(az);
  out.axisNorth = Math.cos(az);
  out.scanAngleDeg = Math.min(spec.maxScanDeg, Math.abs(pass.scanAngleDeg));
  out.nadirKm = scanGroundDistanceKm(spec, out.scanAngleDeg);
  out.valid = true;
  return out;
}

function glslFloat(n: number): string {
  const s = n.toPrecision(10);
  return /[.e]/.test(s) ? s : `${s}.0`;
}

function sensorVec4(spec: ScanSensorSpec): string {
  return `vec4(${glslFloat(spec.alphaScanNative)}, ${glslFloat(spec.alphaTrack)}, ${glslFloat(spec.detectors)}, ${spec.family === 'viirs' ? '1.0' : '0.0'})`;
}

/**
 * GLSL: maps a ground point to its scan cell. `pass` is (axisEast, axisNorth, nadirKm, valid).
 * Cells follow the true whiskbroom geometry: sample index is linear in scan angle, so the scan
 * dimension grows toward the swath edge, and each mirror scan sweeps `detectors` rows whose
 * along-track footprint also grows (the bow-tie). Where consecutive scans overlap, the overlap is
 * clipped at the midline between the two scans and that seam is reported in `seam`.
 */
export const SCAN_LATTICE_GLSL = /* glsl */ `
const float SCAN_RE = ${glslFloat(SCAN_EARTH_RADIUS_KM)};
const float MODIS_ORBIT_K = ${glslFloat(orbitRatio(MODIS_SCAN))};
const float VIIRS_ORBIT_K = ${glslFloat(orbitRatio(VIIRS_SCAN))};
const vec4 MODIS_SENSOR = ${sensorVec4(MODIS_SCAN)};
const vec4 VIIRS_SENSOR = ${sensorVec4(VIIRS_SCAN)};
const float VIIRS_ZONE1 = ${glslFloat(VIIRS_SCAN.zone1Deg * DEG)};
const float VIIRS_ZONE2 = ${glslFloat(VIIRS_SCAN.zone2Deg * DEG)};

struct ScanCell {
  vec2 centerKm;  // cell center, east and north of the region center
  vec2 sizeKm;    // footprint (along scan, along track)
  float edgeKm;   // distance from this point to the nearest cell border
  float seamKm;   // distance to the nearest scan-to-scan seam
  float overlap;  // 0 at nadir, grows with the bow-tie overlap between consecutive scans
  float zone;     // aggregation zone 1..3 (always 1 for MODIS)
};

float scanGroundKm(float theta, float k) {
  return SCAN_RE * (asin(clamp(k * sin(theta), -1.0, 1.0)) - theta);
}

float scanThetaFromGround(float xKm, float k) {
  float g = xKm / SCAN_RE;
  return atan(sin(g), k - cos(g));
}

float scanSampleFromTheta(float theta, vec4 sensor) {
  float n = abs(theta) / sensor.x;
  if (sensor.w > 0.5) {
    float n1 = VIIRS_ZONE1 / sensor.x;
    float n2 = VIIRS_ZONE2 / sensor.x;
    n = min(n, n1) / 3.0 + clamp(n - n1, 0.0, n2 - n1) / 2.0 + max(n - n2, 0.0);
  }
  return n;
}

float scanThetaFromSample(float p, vec4 sensor) {
  if (sensor.w > 0.5) {
    float n1 = VIIRS_ZONE1 / sensor.x;
    float n2 = VIIRS_ZONE2 / sensor.x;
    float p1 = n1 / 3.0;
    float p2 = p1 + (n2 - n1) / 2.0;
    float n = p < p1 ? p * 3.0 : (p < p2 ? n1 + (p - p1) * 2.0 : n2 + (p - p2));
    return n * sensor.x;
  }
  return p * sensor.x;
}

ScanCell evalScanCell(vec2 pKm, vec4 pass, vec4 sensor, float k) {
  ScanCell cell;
  vec2 axis = pass.xy;
  vec2 track = vec2(axis.y, -axis.x);

  // Ground distance from the sub-satellite track: grows away from the satellite. The lattice is
  // mirrored about the track so a region that straddles nadir still gets well-formed cells.
  float xsSigned = pass.z - dot(pKm, axis);
  float side = xsSigned < 0.0 ? -1.0 : 1.0;
  float xs = abs(xsSigned);
  float yt = dot(pKm, track);

  float theta = scanThetaFromGround(xs, k);
  float sampleIdx = floor(scanSampleFromTheta(theta, sensor));
  float th0 = scanThetaFromSample(sampleIdx, sensor);
  float th1 = scanThetaFromSample(sampleIdx + 1.0, sensor);
  float x0 = scanGroundKm(th0, k);
  float x1 = scanGroundKm(th1, k);
  float thC = 0.5 * (th0 + th1);

  float root = sqrt(max(1.0 / (k * k) - sin(thC) * sin(thC), 1e-8));
  float trackKm = SCAN_RE * k * sensor.y * (cos(thC) - root);
  float nadirTrackKm = SCAN_RE * (k - 1.0) * sensor.y;
  float stripKm = sensor.z * nadirTrackKm;

  float strip = floor(yt / stripKm + 0.5);
  float yLocal = yt - strip * stripKm;
  float rowF = yLocal / trackKm + 0.5 * sensor.z;
  float row = clamp(floor(rowF), 0.0, sensor.z - 1.0);
  float rowFrac = rowF - row;

  float xc = 0.5 * (x0 + x1);
  float yc = strip * stripKm + (row + 0.5 - 0.5 * sensor.z) * trackKm;

  float dScan = min(xs - x0, x1 - xs);
  float dRow = min(rowFrac, 1.0 - rowFrac) * trackKm;
  float dSeam = 0.5 * stripKm - abs(yLocal);

  cell.centerKm = axis * (pass.z - side * xc) + track * yc;
  cell.sizeKm = vec2(x1 - x0, trackKm);
  cell.edgeKm = max(0.0, min(dScan, min(dRow, dSeam)));
  cell.seamKm = max(0.0, dSeam);
  cell.overlap = clamp(trackKm / nadirTrackKm - 1.0, 0.0, 1.0);
  cell.zone = sensor.w > 0.5
    ? (abs(thC) < VIIRS_ZONE1 ? 1.0 : (abs(thC) < VIIRS_ZONE2 ? 2.0 : 3.0))
    : 1.0;
  return cell;
}

// Coverage of a hairline of the given width (device pixels) centered on a border that lies
// edgeKm away, where kmPerPx is the screen-space footprint of one pixel on the ground.
float scanHairline(float edgeKm, float kmPerPx, float widthPx) {
  return clamp(0.5 + 0.5 * widthPx - edgeKm / max(kmPerPx, 1e-6), 0.0, 1.0);
}
`;
