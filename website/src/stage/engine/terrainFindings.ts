import type { TerrainFindingCallout } from '../types';

// =============================================================================
// TERRAIN CALLOUTS OF A SIMULATED RUN
// Three places are read from one pass of the run's field: where the estimate is strongest, where
// the estimate stands well above what MODIS reported, and where the estimate is least certain.
// A callout shows the value the field holds at its place, under a name that says what the value
// is. A place the field does not hold is not shown.
// =============================================================================

/** How the bytes of a simulated run's field decode (linear scales). */
export interface FindingFieldScale {
  /** Cells along each side of the field. */
  gridSize: number;
  /** Fire radiative power density at byte 255 of the estimate and the two sensor channels, MW/km2. */
  zMaxMwKm2: number;
  /** One standard deviation at byte 255 of the uncertainty channel, MW/km2. */
  sigmaMaxMwKm2: number;
}

export interface TerrainFindings {
  /**
   * Where the camera presets look: always three places, in the order front, subpixel, uncertainty.
   * A place the field does not hold falls back to a fixed spot and carries no text.
   */
  anchors: TerrainFindingCallout[];
  /** What is shown on the terrain: only the places the field holds, with the values it holds there. */
  callouts: TerrainFindingCallout[];
}

/** The pass the callouts are read from: a little past the middle of the run. */
export function findingReferenceFrame(frameCount: number): number {
  return Math.max(0, Math.min(frameCount - 1, Math.floor((frameCount - 1) * 0.52)));
}

/** The estimate has to reach this for a place to count as above MODIS, MW/km2. */
const SUBPIXEL_MIN_MW_KM2 = 11.0;
/** MODIS has to read under this share of the estimate there. */
const SUBPIXEL_MODIS_SHARE = 0.42;
/** The estimate has to reach this for a place to count as uncertain fire and not as empty ground, MW/km2. */
const SIGMA_MIN_Z_MW_KM2 = 8.0;

export function extractTerrainFindings(
  regionId: string,
  bbox: readonly [number, number, number, number],
  tensor: Uint8Array,
  frameCount: number,
  scale: FindingFieldScale,
  /** Terrain elevation in metres at a field position (u east, v north, both 0..1). */
  elevationAt: (u: number, v: number) => number,
): TerrainFindings {
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const n = scale.gridSize;
  const refFrame = findingReferenceFrame(frameCount);
  const fBase = refFrame * n * n * 4;
  const passLabel = `pass ${refFrame + 1}`;

  // 1. Strongest estimate
  let frontFound = false;
  let frontCell = { gx: Math.round(n * 0.5), gy: Math.round(n * 0.5), zMw: 0 };
  for (let gy = 14; gy < n - 14; gy += 2) {
    for (let gx = 14; gx < n - 14; gx += 2) {
      const zMw = (tensor[fBase + (gy * n + gx) * 4] / 255.0) * scale.zMaxMwKm2;
      if (zMw > frontCell.zMw) {
        frontCell = { gx, gy, zMw };
        frontFound = true;
      }
    }
  }

  // 2. Estimate well above what MODIS reported, away from the first place, lower ground first
  let subpixelFound = false;
  let bestSubpixelScore = -Infinity;
  let subpixelCell = { gx: Math.round(n * 0.375), gy: Math.round(n * 0.42), zMw: 0, modisMw: 0 };
  for (let gy = 14; gy < n - 14; gy += 2) {
    for (let gx = 14; gx < n - 14; gx += 2) {
      const off = fBase + (gy * n + gx) * 4;
      const zMw = (tensor[off] / 255.0) * scale.zMaxMwKm2;
      const modisMw = (tensor[off + 2] / 255.0) * scale.zMaxMwKm2;
      const distFromFront = Math.hypot(gx - frontCell.gx, gy - frontCell.gy);
      if (zMw >= SUBPIXEL_MIN_MW_KM2 && modisMw < zMw * SUBPIXEL_MODIS_SHARE && distFromFront > 24) {
        const elev = elevationAt(gx / (n - 1), gy / (n - 1));
        const subScore = zMw - modisMw * 1.25 - elev * 0.0006;
        if (subScore > bestSubpixelScore) {
          bestSubpixelScore = subScore;
          subpixelCell = { gx, gy, zMw, modisMw };
          subpixelFound = true;
        }
      }
    }
  }

  // 3. Largest standard deviation where the estimate holds fire, away from the other two places
  let sigmaFound = false;
  let sigmaCell = { gx: Math.round(n * 0.640625), gy: Math.round(n * 0.40625), sigmaMw: 0 };
  for (let gy = 14; gy < n - 14; gy += 2) {
    for (let gx = 14; gx < n - 14; gx += 2) {
      const off = fBase + (gy * n + gx) * 4;
      const zMw = (tensor[off] / 255.0) * scale.zMaxMwKm2;
      const sigmaMw = (tensor[off + 1] / 255.0) * scale.sigmaMaxMwKm2;
      const distA = Math.hypot(gx - frontCell.gx, gy - frontCell.gy);
      const distB = Math.hypot(gx - subpixelCell.gx, gy - subpixelCell.gy);
      if (zMw >= SIGMA_MIN_Z_MW_KM2 && sigmaMw > sigmaCell.sigmaMw && distA > 28 && distB > 24) {
        sigmaCell = { gx, gy, sigmaMw };
        sigmaFound = true;
      }
    }
  }

  const makeFinding = (
    suffix: string,
    kind: TerrainFindingCallout['kind'],
    gx: number,
    gy: number,
    title: string,
    subtitle: string,
    valueText: string,
  ): TerrainFindingCallout => {
    const u = gx / (n - 1);
    const v = gy / (n - 1);
    return {
      id: `${regionId}-${suffix}`,
      kind,
      title,
      subtitle,
      valueText,
      lat: latMin + v * (latMax - latMin),
      lon: lonMin + u * (lonMax - lonMin),
      elevM: Math.round(elevationAt(u, v)),
    };
  };

  const front = makeFinding(
    'front-core',
    'front',
    frontCell.gx,
    frontCell.gy,
    frontFound ? 'Strongest estimate' : '',
    frontFound ? `Highest value of the simulated 375 m estimate at ${passLabel}` : '',
    frontFound ? `${frontCell.zMw.toFixed(1)} MW/km², ${passLabel}` : '',
  );
  const subpixel = makeFinding(
    'canyon-subpixel',
    'subpixel',
    subpixelCell.gx,
    subpixelCell.gy,
    subpixelFound ? 'Estimate above MODIS' : '',
    subpixelFound ? `Simulated estimate where the simulated MODIS pass reads far less, at ${passLabel}` : '',
    subpixelFound
      ? `${subpixelCell.zMw.toFixed(1)} MW/km², MODIS ${subpixelCell.modisMw.toFixed(1)} MW/km², ${passLabel}`
      : '',
  );
  const uncertainty = makeFinding(
    'sigma-peak',
    'uncertainty',
    sigmaCell.gx,
    sigmaCell.gy,
    sigmaFound ? 'Least certain estimate' : '',
    sigmaFound ? `One standard deviation of the simulated estimate at ${passLabel}` : '',
    sigmaFound ? `±${sigmaCell.sigmaMw.toFixed(1)} MW/km² (1 sigma), ${passLabel}` : '',
  );

  const callouts: TerrainFindingCallout[] = [];
  if (frontFound) callouts.push(front);
  if (subpixelFound) callouts.push(subpixel);
  if (sigmaFound) callouts.push(uncertainty);
  return { anchors: [front, subpixel, uncertainty], callouts };
}
