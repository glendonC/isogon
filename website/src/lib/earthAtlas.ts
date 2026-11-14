import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import land50m from 'world-atlas/land-50m.json';

export interface FireObservationSample {
  lat: number;
  lon: number;
  position: [number, number, number];
  normal: [number, number, number];
  intensity: number;
  modisWeight: number;
  seed: number;
}

export interface EarthAtlasData {
  atlasCanvas: HTMLCanvasElement;
  fireCanvas: HTMLCanvasElement;
  samples: FireObservationSample[];
  isLand: (latDeg: number, lonDeg: number) => boolean;
}

interface GeoPolygonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{ geometry: GeoPolygonGeometry }>;
}

interface FirePlumeSpec {
  lat: number;
  lon: number;
  sigmaLat: number;
  sigmaLon: number;
  tilt: number;
  weight: number;
}

// Climatologically authentic active-fire belts on Earth landmasses
const GLOBAL_FIRE_BELTS: readonly FirePlumeSpec[] = [
  // Amazon Arc of Deforestation, Cerrado & Gran Chaco
  { lat: -9.8, lon: -56.5, sigmaLat: 3.4, sigmaLon: 6.2, tilt: 0.28, weight: 0.96 },
  { lat: -13.5, lon: -49.2, sigmaLat: 4.1, sigmaLon: 5.0, tilt: -0.22, weight: 0.92 },
  { lat: -18.2, lon: -57.8, sigmaLat: 3.6, sigmaLon: 4.2, tilt: 0.15, weight: 0.84 },
  { lat: -22.5, lon: -60.2, sigmaLat: 3.0, sigmaLon: 3.6, tilt: 0.1, weight: 0.72 },
  { lat: 5.2, lon: -68.5, sigmaLat: 2.4, sigmaLon: 3.8, tilt: 0.2, weight: 0.68 },

  // Sub-Saharan Northern Savanna (Guinean-Sudanian-Sahelian belt)
  { lat: 9.6, lon: -8.5, sigmaLat: 2.5, sigmaLon: 5.5, tilt: -0.08, weight: 0.88 },
  { lat: 8.8, lon: 4.5, sigmaLat: 2.6, sigmaLon: 6.8, tilt: -0.06, weight: 0.92 },
  { lat: 8.2, lon: 19.5, sigmaLat: 2.9, sigmaLon: 7.5, tilt: -0.1, weight: 0.98 },
  { lat: 7.4, lon: 30.2, sigmaLat: 3.1, sigmaLon: 4.6, tilt: 0.14, weight: 0.86 },

  // Southern Hemisphere African Miombo / Zambezi Woodlands
  { lat: -8.6, lon: 17.8, sigmaLat: 3.8, sigmaLon: 4.8, tilt: 0.18, weight: 0.95 },
  { lat: -12.4, lon: 25.8, sigmaLat: 4.0, sigmaLon: 5.8, tilt: 0.08, weight: 0.98 },
  { lat: -16.2, lon: 33.8, sigmaLat: 3.4, sigmaLon: 3.8, tilt: -0.2, weight: 0.84 },

  // Western North America & Canadian Boreal Shield
  { lat: 40.4, lon: -121.4, sigmaLat: 3.2, sigmaLon: 2.4, tilt: -0.35, weight: 0.90 },
  { lat: 45.2, lon: -115.2, sigmaLat: 2.8, sigmaLon: 3.0, tilt: -0.2, weight: 0.82 },
  { lat: 57.5, lon: -114.5, sigmaLat: 2.8, sigmaLon: 6.5, tilt: -0.15, weight: 0.86 },
  { lat: 60.8, lon: -102.0, sigmaLat: 2.5, sigmaLon: 6.0, tilt: -0.1, weight: 0.74 },
  { lat: 19.2, lon: -99.5, sigmaLat: 2.4, sigmaLon: 3.5, tilt: -0.25, weight: 0.66 },

  // Mediterranean & Iberian-Balkan Belt
  { lat: 40.2, lon: -7.6, sigmaLat: 1.8, sigmaLon: 2.1, tilt: 0.1, weight: 0.78 },
  { lat: 38.6, lon: 22.4, sigmaLat: 2.0, sigmaLon: 3.4, tilt: -0.18, weight: 0.76 },
  { lat: 37.2, lon: 30.5, sigmaLat: 1.9, sigmaLon: 3.2, tilt: 0.05, weight: 0.70 },

  // Eastern Europe / Central Asian Steppe & Boreal Siberia
  { lat: 50.5, lon: 68.0, sigmaLat: 2.6, sigmaLon: 7.0, tilt: 0.05, weight: 0.72 },
  { lat: 58.5, lon: 102.0, sigmaLat: 3.2, sigmaLon: 8.5, tilt: 0.12, weight: 0.88 },
  { lat: 62.8, lon: 127.5, sigmaLat: 3.4, sigmaLon: 8.0, tilt: -0.1, weight: 0.92 },

  // Mainland Southeast Asia & Maritime Continent
  { lat: 19.2, lon: 99.8, sigmaLat: 3.2, sigmaLon: 3.2, tilt: -0.15, weight: 0.88 },
  { lat: 14.5, lon: 105.0, sigmaLat: 2.6, sigmaLon: 2.8, tilt: 0.1, weight: 0.78 },
  { lat: -2.1, lon: 113.2, sigmaLat: 2.2, sigmaLon: 3.4, tilt: 0.05, weight: 0.76 },

  // Northern & Eastern Australia Savanna
  { lat: -15.4, lon: 127.8, sigmaLat: 2.5, sigmaLon: 4.8, tilt: 0.1, weight: 0.86 },
  { lat: -14.2, lon: 135.2, sigmaLat: 2.4, sigmaLon: 4.4, tilt: -0.08, weight: 0.88 },
  { lat: -16.8, lon: 143.2, sigmaLat: 2.8, sigmaLon: 2.8, tilt: -0.3, weight: 0.78 },
  { lat: -33.2, lon: 150.0, sigmaLat: 2.4, sigmaLon: 2.0, tilt: 0.25, weight: 0.72 },
];

export function latLonToVec3(
  latDeg: number,
  lonDeg: number,
  radius = 1,
): [number, number, number] {
  const u = (lonDeg + 180) / 360;
  const phi = u * Math.PI * 2;
  const theta = ((90 - latDeg) * Math.PI) / 180;
  const sinTheta = Math.sin(theta);
  return [
    -radius * Math.cos(phi) * sinTheta,
    radius * Math.cos(theta),
    radius * Math.sin(phi) * sinTheta,
  ];
}

function unwrapRing(ring: number[][]): number[][] {
  if (ring.length === 0) return [];
  const out: number[][] = [[ring[0][0], ring[0][1]]];
  for (let i = 1; i < ring.length; i++) {
    let lon = ring[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, ring[i][1]]);
  }
  return out;
}

function tracePolygonPaths(
  ctx: CanvasRenderingContext2D,
  polygons: number[][][][],
  width: number,
  height: number,
  includePolarCapClosure: boolean,
): void {
  const lonToX = (lon: number) => ((lon + 180) / 360) * width;
  const latToY = (lat: number) => ((90 - lat) / 180) * height;

  for (const poly of polygons) {
    const unwrappedRings = poly.map(unwrapRing);
    if (unwrappedRings.length === 0 || unwrappedRings[0].length === 0) continue;

    const outer = unwrappedRings[0];
    const span = outer[outer.length - 1][0] - outer[0][0];
    const isPolarCap = Math.abs(span) > 300;

    if (isPolarCap) {
      if (!includePolarCapClosure) {
        ctx.moveTo(lonToX(outer[0][0]), latToY(outer[0][1]));
        for (let i = 1; i < outer.length; i++) {
          ctx.lineTo(lonToX(outer[i][0]), latToY(outer[i][1]));
        }
      } else {
        const poleLat = outer[0][1] < 0 ? -90 : 90;
        ctx.moveTo(lonToX(outer[0][0]), latToY(outer[0][1]));
        for (let i = 1; i < outer.length; i++) {
          ctx.lineTo(lonToX(outer[i][0]), latToY(outer[i][1]));
        }
        ctx.lineTo(lonToX(outer[outer.length - 1][0]), latToY(poleLat));
        ctx.lineTo(lonToX(outer[0][0]), latToY(poleLat));
        ctx.closePath();
      }
      continue;
    }

    let minLon = Infinity;
    let maxLon = -Infinity;
    for (const pt of outer) {
      if (pt[0] < minLon) minLon = pt[0];
      if (pt[0] > maxLon) maxLon = pt[0];
    }

    const shifts = [0];
    if (minLon < -180) shifts.push(360);
    if (maxLon > 180) shifts.push(-360);

    for (const shiftDeg of shifts) {
      for (const ring of unwrappedRings) {
        if (ring.length < 3) continue;
        ctx.moveTo(lonToX(ring[0][0] + shiftDeg), latToY(ring[0][1]));
        for (let i = 1; i < ring.length; i++) {
          ctx.lineTo(lonToX(ring[i][0] + shiftDeg), latToY(ring[i][1]));
        }
        ctx.closePath();
      }
    }
  }
}

function evaluateFireBelt(lat: number, lon: number): number {
  let sum = 0;
  for (let i = 0; i < GLOBAL_FIRE_BELTS.length; i++) {
    const b = GLOBAL_FIRE_BELTS[i];
    let dLon = lon - b.lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const dLat = lat - b.lat;
    if (Math.abs(dLat) > b.sigmaLat * 3.6 || Math.abs(dLon) > b.sigmaLon * 3.6) {
      continue;
    }
    const rotLat = dLat + dLon * b.tilt;
    const q =
      (rotLat * rotLat) / (2 * b.sigmaLat * b.sigmaLat) +
      (dLon * dLon) / (2 * b.sigmaLon * b.sigmaLon);
    if (q < 6.5) {
      sum += b.weight * Math.exp(-q);
    }
  }
  // Modulate with subtle multi-frequency spatial structure so fire fronts look organic, not uniform blobs
  const rLat = (lat * Math.PI) / 180;
  const rLon = (lon * Math.PI) / 180;
  const textureMod =
    0.76 +
    0.16 * Math.sin(rLat * 19.0 + rLon * 13.0) * Math.cos(rLon * 23.0 - rLat * 11.0) +
    0.12 * Math.sin(rLat * 37.0 - rLon * 29.0);
  return Math.min(1, Math.max(0, sum * textureMod));
}

let cachedAtlas: EarthAtlasData | null = null;

export function getEarthAtlas(): EarthAtlasData {
  if (cachedAtlas) return cachedAtlas;

  const topo = land50m as unknown as Topology<{ land: GeometryCollection }>;
  const geo = feature(topo, topo.objects.land) as unknown as
    | GeoFeatureCollection
    | { type: 'Feature'; geometry: GeoPolygonGeometry };

  const rawGeoms: GeoPolygonGeometry[] =
    geo.type === 'FeatureCollection'
      ? geo.features.map((f) => f.geometry)
      : [geo.geometry];

  const allPolygons: number[][][][] = [];
  for (const g of rawGeoms) {
    if (g.type === 'Polygon') {
      allPolygons.push(g.coordinates as number[][][]);
    } else if (g.type === 'MultiPolygon') {
      for (const p of g.coordinates as number[][][][]) {
        allPolygons.push(p);
      }
    }
  }

  const W = 2048;
  const H = 1024;

  // 1. Crisp antialiased land mask
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W;
  maskCanvas.height = H;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
  maskCtx.fillStyle = '#000000';
  maskCtx.fillRect(0, 0, W, H);
  maskCtx.fillStyle = '#ffffff';
  maskCtx.beginPath();
  tracePolygonPaths(maskCtx, allPolygons, W, H, true);
  maskCtx.fill('evenodd');

  // 2. Smooth multi-scale continental relief dome
  const reliefSmall = document.createElement('canvas');
  reliefSmall.width = 512;
  reliefSmall.height = 256;
  const rSmallCtx = reliefSmall.getContext('2d')!;
  rSmallCtx.fillStyle = '#000000';
  rSmallCtx.fillRect(0, 0, 512, 256);
  rSmallCtx.filter = 'blur(3.5px)';
  rSmallCtx.drawImage(maskCanvas, 0, 0, 512, 256);
  rSmallCtx.globalAlpha = 0.55;
  rSmallCtx.filter = 'blur(11px)';
  rSmallCtx.drawImage(maskCanvas, 0, 0, 512, 256);
  rSmallCtx.filter = 'none';
  rSmallCtx.globalAlpha = 1;

  const reliefCanvas = document.createElement('canvas');
  reliefCanvas.width = W;
  reliefCanvas.height = H;
  const reliefCtx = reliefCanvas.getContext('2d', { willReadFrequently: true })!;
  reliefCtx.imageSmoothingEnabled = true;
  reliefCtx.imageSmoothingQuality = 'high';
  reliefCtx.drawImage(reliefSmall, 0, 0, W, H);

  // 3. Cartographic coastline stroke
  const coastCanvas = document.createElement('canvas');
  coastCanvas.width = W;
  coastCanvas.height = H;
  const coastCtx = coastCanvas.getContext('2d', { willReadFrequently: true })!;
  coastCtx.fillStyle = '#000000';
  coastCtx.fillRect(0, 0, W, H);
  coastCtx.strokeStyle = '#ffffff';
  coastCtx.lineWidth = 1.4;
  coastCtx.lineJoin = 'round';
  coastCtx.beginPath();
  tracePolygonPaths(coastCtx, allPolygons, W, H, false);
  coastCtx.stroke();

  // Combine R = landMask, G = reliefHeight, B = coastline into atlasCanvas
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = W;
  atlasCanvas.height = H;
  const atlasCtx = atlasCanvas.getContext('2d')!;
  const maskData = maskCtx.getImageData(0, 0, W, H).data;
  const reliefData = reliefCtx.getImageData(0, 0, W, H).data;
  const coastData = coastCtx.getImageData(0, 0, W, H).data;
  const outImg = atlasCtx.createImageData(W, H);
  const out = outImg.data;

  const totalPx = W * H;
  for (let i = 0; i < totalPx; i++) {
    const idx = i * 4;
    out[idx] = maskData[idx];
    out[idx + 1] = reliefData[idx];
    out[idx + 2] = coastData[idx];
    out[idx + 3] = 255;
  }
  atlasCtx.putImageData(outImg, 0, 0);

  // Fast CPU lookup grid (512 x 256)
  const GW = 512;
  const GH = 256;
  const landGrid = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) {
    const sy = Math.min(H - 1, gy * 4 + 2);
    for (let gx = 0; gx < GW; gx++) {
      const sx = Math.min(W - 1, gx * 4 + 2);
      landGrid[gy * GW + gx] = maskData[(sy * W + sx) * 4];
    }
  }

  const isLand = (latDeg: number, lonDeg: number): boolean => {
    let lon = ((lonDeg + 180) % 360 + 360) % 360;
    if (lon >= 360) lon = 0;
    const gx = Math.min(GW - 1, Math.max(0, Math.floor((lon / 360) * GW)));
    const gy = Math.min(GH - 1, Math.max(0, Math.floor(((90 - latDeg) / 180) * GH)));
    return landGrid[gy * GW + gx] > 140;
  };

  // 4. Continuous continental fire radiative potential field (1024 x 512)
  const FW = 1024;
  const FH = 512;
  const fireCanvas = document.createElement('canvas');
  fireCanvas.width = FW;
  fireCanvas.height = FH;
  const fireCtx = fireCanvas.getContext('2d')!;
  const fireImg = fireCtx.createImageData(FW, FH);
  const fOut = fireImg.data;

  for (let fy = 0; fy < FH; fy++) {
    const lat = 90 - ((fy + 0.5) / FH) * 180;
    const sy = fy * 2;
    for (let fx = 0; fx < FW; fx++) {
      const lon = ((fx + 0.5) / FW) * 360 - 180;
      const sx = fx * 2;
      const mIdx = (sy * W + sx) * 4;
      const landFrac = maskData[mIdx] / 255;
      const fIdx = (fy * FW + fx) * 4;

      if (landFrac < 0.25 || lat < -56 || lat > 72) {
        fOut[fIdx] = 0;
        fOut[fIdx + 1] = 0;
        fOut[fIdx + 2] = 0;
        fOut[fIdx + 3] = 255;
        continue;
      }

      const interior = Math.min(1, reliefData[mIdx] / 185);
      const val = evaluateFireBelt(lat, lon) * landFrac * (0.45 + 0.55 * interior);
      const byte = Math.min(255, Math.round(val * 255));
      fOut[fIdx] = byte;
      fOut[fIdx + 1] = Math.min(255, Math.round(Math.pow(val, 0.68) * 255));
      fOut[fIdx + 2] = 0;
      fOut[fIdx + 3] = 255;
    }
  }
  fireCtx.putImageData(fireImg, 0, 0);

  // 5. Golden-spiral Fibonacci continental fire observation points
  const samples: FireObservationSample[] = [];
  const candidateCount = 26000;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  // Deterministic LCG for clean repeatable sub-grid jitter
  let rng = 13379421;
  const nextRand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 4294967296;
  };

  for (let i = 0; i < candidateCount; i++) {
    const y = 1 - (2 * (i + 0.5)) / candidateCount;
    const lat = (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI;
    if (lat < -52 || lat > 70) continue;

    const theta = goldenAngle * i;
    const lon = ((((theta * 180) / Math.PI) % 360) + 540) % 360 - 180;

    // Slight sub-cell natural jitter
    const jLat = lat + (nextRand() - 0.5) * 0.65;
    const jLon = lon + (nextRand() - 0.5) * 0.65;
    if (!isLand(jLat, jLon)) continue;

    const beltVal = evaluateFireBelt(jLat, jLon);
    if (beltVal < 0.14) continue;

    const acceptProb = Math.pow(beltVal, 1.35) * 0.88;
    if (nextRand() > acceptProb) continue;

    const intensity = Math.min(1, Math.max(0.16, beltVal * (0.72 + 0.42 * nextRand())));
    // MODIS 1 km misses low-FRP small agricultural/savanna fires (< ~0.46 normalized intensity)
    const modisWeight =
      intensity > 0.54
        ? 1.0
        : intensity > 0.38
          ? (intensity - 0.38) / 0.16
          : 0.0;

    const normal = latLonToVec3(jLat, jLon, 1.0);
    const r = 1.0035;
    samples.push({
      lat: jLat,
      lon: jLon,
      normal,
      position: [normal[0] * r, normal[1] * r, normal[2] * r],
      intensity,
      modisWeight,
      seed: nextRand(),
    });
  }

  cachedAtlas = {
    atlasCanvas,
    fireCanvas,
    samples,
    isLand,
  };
  return cachedAtlas;
}
