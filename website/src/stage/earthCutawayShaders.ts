import * as THREE from 'three';
import { LUT_LIPARI_256 } from '../lib/colormaps';
import type { TheaterId } from './earthCutawayTypes';

export const SLAB_W = 14.8;
export const SLAB_D = 10.8;
export const SLAB_SEGMENTS = 511; // 512 x 512 vertices = 522,242 triangles
export const MAX_RELIEF_WORLD_Y = 2.35;
export const CLIFF_BASE_Y = -0.44;

export const FIELD_GRID_SIZE = 256;
export const FIELD_FRAME_COUNT = 24;
export const Z_MAX_MW_KM2 = 80.0;
export const SIGMA_MAX_MW_KM2 = 24.0;
export const PLUME_PARTICLE_COUNT = 2400;

export const THEATER_ORDER: readonly TheaterId[] = [
  'plumas_ca',
  'lytton_bc',
  'evia_greece',
  'blue_mountains_au',
];

export interface TheaterFallbackProfile {
  id: TheaterId;
  bbox: [number, number, number, number];
  widthKm: number;
  minElevM: number;
  maxElevM: number;
  modisAzimuthDeg: number;
  modisStretch: number;
  windDirUv: [number, number];
  paletteBase: [number, number, number];
  paletteRidge: [number, number, number];
  hasSeaCoast: boolean;
}

export const THEATER_PROFILES: Record<TheaterId, TheaterFallbackProfile> = {
  plumas_ca: {
    id: 'plumas_ca',
    bbox: [-121.6, 39.75, -120.75, 40.35],
    widthKm: 72.5,
    minElevM: 313.0,
    maxElevM: 2357.0,
    modisAzimuthDeg: -12.4,
    modisStretch: 2.6,
    windDirUv: [0.68, 0.73],
    paletteBase: [0.14, 0.21, 0.14],
    paletteRidge: [0.44, 0.43, 0.40],
    hasSeaCoast: false,
  },
  lytton_bc: {
    id: 'lytton_bc',
    bbox: [-121.95, 49.95, -121.2, 50.52],
    widthKm: 54.0,
    minElevM: 195.0,
    maxElevM: 2860.0,
    modisAzimuthDeg: -14.8,
    modisStretch: 2.75,
    windDirUv: [0.42, 0.91],
    paletteBase: [0.24, 0.22, 0.16],
    paletteRidge: [0.56, 0.54, 0.52],
    hasSeaCoast: false,
  },
  evia_greece: {
    id: 'evia_greece',
    bbox: [23.02, 38.62, 23.62, 39.12],
    widthKm: 52.0,
    minElevM: 0.0,
    maxElevM: 1385.0,
    modisAzimuthDeg: 13.2,
    modisStretch: 2.95,
    windDirUv: [-0.62, -0.78],
    paletteBase: [0.27, 0.30, 0.20],
    paletteRidge: [0.64, 0.60, 0.52],
    hasSeaCoast: true,
  },
  blue_mountains_au: {
    id: 'blue_mountains_au',
    bbox: [150.02, -33.92, 150.74, -33.32],
    widthKm: 66.0,
    minElevM: 68.0,
    maxElevM: 1215.0,
    modisAzimuthDeg: 11.4,
    modisStretch: 2.55,
    windDirUv: [0.79, -0.61],
    paletteBase: [0.15, 0.22, 0.17],
    paletteRidge: [0.54, 0.38, 0.27],
    hasSeaCoast: false,
  },
};

export function getTheaterIndex(id: TheaterId): number {
  const idx = THEATER_ORDER.indexOf(id);
  return idx >= 0 ? idx : 0;
}

export function getNextTheaterId(id: TheaterId): TheaterId {
  return THEATER_ORDER[(getTheaterIndex(id) + 1) % THEATER_ORDER.length];
}

export function createLipariLutTexture(): THREE.DataTexture {
  const rgba = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    rgba[i * 4] = LUT_LIPARI_256[i * 3];
    rgba[i * 4 + 1] = LUT_LIPARI_256[i * 3 + 1];
    rgba[i * 4 + 2] = LUT_LIPARI_256[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(rgba, 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Uploads a row-aligned Float32 heightfield (row 0 = South v=0, row N-1 = North v=1)
 * as a WebGL2 R32F DataTexture. Uses NearestFilter so WebGL2 texture completeness is
 * guaranteed even without OES_texture_float_linear; shaders perform exact Float32 bilinear interpolation.
 */
export function createDemR32FTexture(
  rawFloatBuffer: Float32Array,
  flipNorthToSouth = true,
): {
  texture: THREE.DataTexture;
  aligned: Float32Array<ArrayBuffer>;
  gridRes: number;
  minElev: number;
  maxElev: number;
} {
  const gridRes = Math.max(2, Math.floor(Math.sqrt(rawFloatBuffer.length)));
  const count = gridRes * gridRes;
  const aligned = new Float32Array(count);

  let minElev = Number.POSITIVE_INFINITY;
  let maxElev = Number.NEGATIVE_INFINITY;

  for (let r = 0; r < gridRes; r++) {
    const srcRow = flipNorthToSouth ? gridRes - 1 - r : r;
    const srcOff = srcRow * gridRes;
    const dstOff = r * gridRes;
    for (let c = 0; c < gridRes; c++) {
      const val = Number.isFinite(rawFloatBuffer[srcOff + c]) ? rawFloatBuffer[srcOff + c] : 0.0;
      aligned[dstOff + c] = val;
      if (val < minElev) minElev = val;
      if (val > maxElev) maxElev = val;
    }
  }

  if (!Number.isFinite(minElev)) minElev = 0.0;
  if (!Number.isFinite(maxElev) || maxElev <= minElev + 1.0) maxElev = minElev + 1000.0;

  const tex = new THREE.DataTexture(aligned, gridRes, gridRes, THREE.RedFormat, THREE.FloatType);
  tex.internalFormat = 'R32F';
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  return { texture: tex, aligned, gridRes, minElev, maxElev };
}

/**
 * Synthesizes a realistic 512x512 procedural canyon/escarpment DEM + procedural satellite canvas
 * for instantaneous fallback before `/api/reconstruct` assets finish downloading.
 */
export function buildProceduralTheaterDem(theaterId: TheaterId, res = 256): Float32Array {
  const prof = THEATER_PROFILES[theaterId];
  const out = new Float32Array(res * res);
  const seed = getTheaterIndex(theaterId) * 2.35;

  for (let r = 0; r < res; r++) {
    // Raw buffer convention: row 0 = North (v=1), row res-1 = South (v=0)
    const v = 1.0 - r / (res - 1);
    const ny = (v - 0.5) * 2.0;
    for (let c = 0; c < res; c++) {
      const u = c / (res - 1);
      const nx = (u - 0.5) * 2.0;

      // Multi-octave ridged river canyon + tributary spurs
      const riverMeander = 0.24 * Math.sin(ny * 2.7 + seed) + 0.11 * Math.cos(ny * 5.6 - seed);
      const gorgeDist = Math.abs(nx * 0.88 - riverMeander);
      const canyonWall = Math.pow(Math.min(1.3, gorgeDist * 1.18), 0.78);

      const ridgeA = 1.0 - Math.abs(Math.sin(nx * 4.4 + ny * 3.1 + seed));
      const ridgeB = 1.0 - Math.abs(Math.cos(nx * 8.9 - ny * 7.4 - seed * 0.6));
      const ridgeC = 0.5 + 0.5 * Math.sin(nx * 18.5 + ny * 16.2 + seed * 1.3);

      let hNorm = canyonWall * (0.58 + 0.28 * ridgeA * ridgeA + 0.11 * ridgeB + 0.04 * ridgeC);

      if (prof.id === 'blue_mountains_au') {
        // Stepped plateau sandstone cliffs
        hNorm = Math.pow(hNorm, 0.65);
        const step = Math.floor(hNorm * 4.5) / 4.5;
        hNorm = hNorm * 0.55 + step * 0.45;
      } else if (prof.hasSeaCoast) {
        // Aegean coastal island: sea coves along SW & NE margins
        const islandMask = 1.0 - Math.max(0, Math.hypot(nx * 0.92, ny * 0.84) - 0.62) * 1.9;
        hNorm = Math.max(0.0, hNorm * islandMask - 0.08);
      }

      out[r * res + c] = prof.minElevM + Math.max(0, Math.min(1.05, hNorm)) * (prof.maxElevM - prof.minElevM);
    }
  }
  return out;
}

export function buildProceduralSatelliteTexture(
  theaterId: TheaterId,
  alignedDem: Float32Array,
  gridRes: number,
  minElev: number,
  maxElev: number,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const prof = THEATER_PROFILES[theaterId];
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const span = Math.max(100.0, maxElev - minElev);

    for (let py = 0; py < size; py++) {
      // Canvas row 0 = North (v = 1.0)
      const v = 1.0 - py / (size - 1);
      const gy = Math.min(gridRes - 1, Math.max(0, Math.round(v * (gridRes - 1))));
      const gyN = Math.min(gridRes - 1, gy + 1);
      for (let px = 0; px < size; px++) {
        const u = px / (size - 1);
        const gx = Math.min(gridRes - 1, Math.max(0, Math.round(u * (gridRes - 1))));
        const gxE = Math.min(gridRes - 1, gx + 1);

        const h = alignedDem[gy * gridRes + gx];
        const hE = alignedDem[gy * gridRes + gxE];
        const hN = alignedDem[gyN * gridRes + gx];
        const hNorm = Math.max(0, Math.min(1, (h - minElev) / span));
        const slope = Math.min(1, Math.hypot(hE - h, hN - h) / 48.0);

        const grain =
          0.92 +
          0.08 * Math.sin(px * 0.47 + py * 0.31) * Math.cos(px * 0.19 - py * 0.53);

        let rCol: number;
        let gCol: number;
        let bCol: number;

        if (prof.hasSeaCoast && h <= 2.2) {
          rCol = 0.05;
          gCol = 0.14 + 0.04 * grain;
          bCol = 0.24 + 0.05 * grain;
        } else {
          const rockMix = Math.min(1, Math.max(0, hNorm * 0.72 + slope * 0.55));
          rCol = (prof.paletteBase[0] * (1 - rockMix) + prof.paletteRidge[0] * rockMix) * grain;
          gCol = (prof.paletteBase[1] * (1 - rockMix) + prof.paletteRidge[1] * rockMix) * grain;
          bCol = (prof.paletteBase[2] * (1 - rockMix) + prof.paletteRidge[2] * rockMix) * grain;

          // Subtle snow/granite cap on highest peaks
          if (prof.maxElevM > 2200 && hNorm > 0.84) {
            const cap = (hNorm - 0.84) / 0.16;
            rCol = rCol * (1 - cap * 0.55) + 0.78 * cap * 0.55;
            gCol = gCol * (1 - cap * 0.55) + 0.80 * cap * 0.55;
            bCol = bCol * (1 - cap * 0.55) + 0.84 * cap * 0.55;
          }
        }

        const off = (py * size + px) * 4;
        data[off] = Math.min(255, Math.max(0, Math.round(rCol * 255)));
        data[off + 1] = Math.min(255, Math.max(0, Math.round(gCol * 255)));
        data[off + 2] = Math.min(255, Math.max(0, Math.round(bCol * 255)));
        data[off + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function alignReconstructionTensor(
  rawBytes: Uint8Array,
  flipNorthToSouth = true,
): { buffer: Uint8Array; frames: number } {
  const frameStride = FIELD_GRID_SIZE * FIELD_GRID_SIZE * 4;
  const frames = Math.max(1, Math.floor(rawBytes.byteLength / frameStride));
  if (!flipNorthToSouth) {
    return { buffer: rawBytes.slice(0, frames * frameStride), frames };
  }
  const out = new Uint8Array(frames * frameStride);
  const rowBytes = FIELD_GRID_SIZE * 4;
  for (let f = 0; f < frames; f++) {
    const fBase = f * frameStride;
    for (let r = 0; r < FIELD_GRID_SIZE; r++) {
      const srcOff = fBase + (FIELD_GRID_SIZE - 1 - r) * rowBytes;
      const dstOff = fBase + r * rowBytes;
      out.set(rawBytes.subarray(srcOff, srcOff + rowBytes), dstOff);
    }
  }
  return { buffer: out, frames };
}

export function buildProceduralTheaterTensor(theaterId: TheaterId): Uint8Array {
  const slotIndex = getTheaterIndex(theaterId);
  const frameStride = FIELD_GRID_SIZE * FIELD_GRID_SIZE * 4;
  const out = new Uint8Array(FIELD_FRAME_COUNT * frameStride);

  const seedPhase = slotIndex * 1.58;
  const spreadAngle = 0.44 + slotIndex * 0.64;
  const dirX = Math.cos(spreadAngle);
  const dirY = Math.sin(spreadAngle);
  const perpX = -dirY;
  const perpY = dirX;

  for (let f = 0; f < FIELD_FRAME_COUNT; f++) {
    const fFrac = f / (FIELD_FRAME_COUNT - 1);
    const fBase = f * frameStride;
    const frontAdv = -0.17 + fFrac * 0.34;
    const isSwathGapFrame = f === 3 || f === 9 || f === 15 || f === 20;
    const diurnalBoost = 0.76 + 0.36 * Math.sin(((f - 4) / 24) * Math.PI * 2);

    for (let y = 0; y < FIELD_GRID_SIZE; y++) {
      const v = y / (FIELD_GRID_SIZE - 1) - 0.5;
      for (let x = 0; x < FIELD_GRID_SIZE; x++) {
        const u = x / (FIELD_GRID_SIZE - 1) - 0.5;
        const along = u * dirX + v * dirY;
        const across = u * perpX + v * perpY;

        const canyonCurve =
          0.095 * Math.sin(across * 9.2 + seedPhase) +
          0.038 * Math.cos(across * 18.5 - seedPhase * 0.7);
        const distToFront = along - (frontAdv + canyonCurve);
        const lateralEnv = Math.exp(-(across * across) / (0.095 + 0.032 * fFrac));

        const headProfile =
          distToFront > 0
            ? Math.exp(-(distToFront * distToFront) / 0.0018)
            : Math.exp(-(distToFront * distToFront) / 0.014);

        const spotDist = Math.hypot(
          along - (frontAdv + 0.082),
          across - 0.13 * Math.sin(seedPhase + f * 0.24),
        );
        const spotPulse = Math.exp(-(spotDist * spotDist) / 0.0024) * 0.72;

        const filamentMod =
          0.80 +
          0.26 * Math.sin((u * 32.0 + seedPhase) * 1.6) * Math.cos((v * 28.0 - seedPhase) * 1.5);
        const zHatMw = Math.min(
          Z_MAX_MW_KM2,
          Math.max(0, (headProfile * 64.0 + spotPulse * 48.0) * lateralEnv * diurnalBoost * filamentMod),
        );

        const cloudBand = Math.exp(-Math.pow(along - (0.07 - fFrac * 0.15), 2) / 0.016);
        const gorgeShadow = 0.5 + 0.5 * Math.sin(u * 17.0 - v * 15.0 + seedPhase);
        const swathPen = isSwathGapFrame && u > 0.04 ? 7.8 : 0.0;
        const sigmaMw = Math.min(
          SIGMA_MAX_MW_KM2,
          1.4 + 0.16 * zHatMw + 4.6 * cloudBand * lateralEnv + 3.4 * gorgeShadow * lateralEnv + swathPen,
        );

        const qU = Math.round(u * 36.0) / 36.0;
        const qV = Math.round(v * 50.0) / 50.0;
        const qAlong = qU * dirX + qV * dirY;
        const qAcross = qU * perpX + qV * perpY;
        const qDist = qAlong - (frontAdv + 0.08 * Math.sin(qAcross * 9.0 + seedPhase));
        const qHead = qDist > -0.09 && qDist < 0.055 ? Math.exp(-(qDist * qDist) / 0.0068) : 0.0;
        const modisCand = qHead * Math.exp(-(qAcross * qAcross) / 0.12) * 50.0 * diurnalBoost;
        const modisMw = !(isSwathGapFrame && u > 0.04) && modisCand >= 12.0 ? modisCand * 0.88 : 0.0;

        const viirsMw = f % 4 !== 1 && zHatMw >= 1.5 ? Math.min(Z_MAX_MW_KM2, zHatMw * 0.96) : 0.0;

        const pxOff = fBase + (y * FIELD_GRID_SIZE + x) * 4;
        out[pxOff] = Math.min(255, Math.max(0, Math.round((zHatMw / Z_MAX_MW_KM2) * 255)));
        out[pxOff + 1] = Math.min(255, Math.max(0, Math.round((sigmaMw / SIGMA_MAX_MW_KM2) * 255)));
        out[pxOff + 2] = Math.min(255, Math.max(0, Math.round((modisMw / Z_MAX_MW_KM2) * 255)));
        out[pxOff + 3] = Math.min(255, Math.max(0, Math.round((viirsMw / Z_MAX_MW_KM2) * 255)));
      }
    }
  }
  return out;
}

// =============================================================================
// SHARED GLSL HEIGHTFIELD & MODIS 1 KM BOW-TIE QUANTIZATION FUNCTIONS
// =============================================================================
const COMMON_HEIGHTFIELD_GLSL = /* glsl */ `
uniform sampler2D uDemPrev;
uniform sampler2D uDemNext;
uniform vec2 uDemRes;       // (prevGridRes, nextGridRes)
uniform vec2 uElevPrevRange; // (minElevM, maxElevM)
uniform vec2 uElevNextRange; // (minElevM, maxElevM)
uniform float uMorph;       // [0..1] smooth sub-orbital elevation & ortho morph

float sampleR32FBilinear(sampler2D demTex, vec2 uv, float res) {
  vec2 clamped = clamp(uv, vec2(0.0), vec2(1.0));
  vec2 coord = clamped * (res - 1.0);
  vec2 i0 = floor(coord);
  vec2 f = coord - i0;
  vec2 i1 = min(i0 + vec2(1.0), vec2(res - 1.0));

  float invRes = 1.0 / res;
  float h00 = texture2D(demTex, (i0 + vec2(0.5, 0.5)) * invRes).r;
  float h10 = texture2D(demTex, (vec2(i1.x, i0.y) + vec2(0.5, 0.5)) * invRes).r;
  float h01 = texture2D(demTex, (vec2(i0.x, i1.y) + vec2(0.5, 0.5)) * invRes).r;
  float h11 = texture2D(demTex, (i1 + vec2(0.5, 0.5)) * invRes).r;

  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

float sampleWorldHeightPrev(vec2 uv, out float elevM) {
  elevM = sampleR32FBilinear(uDemPrev, uv, uDemRes.x);
  float span = max(350.0, uElevPrevRange.y - uElevPrevRange.x);
  return clamp((elevM - uElevPrevRange.x) / span, 0.0, 1.15) * ${MAX_RELIEF_WORLD_Y.toFixed(2)};
}

float sampleWorldHeightNext(vec2 uv, out float elevM) {
  elevM = sampleR32FBilinear(uDemNext, uv, uDemRes.y);
  float span = max(350.0, uElevNextRange.y - uElevNextRange.x);
  return clamp((elevM - uElevNextRange.x) / span, 0.0, 1.15) * ${MAX_RELIEF_WORLD_Y.toFixed(2)};
}

float evalTerrainWorldY(vec2 uv, out float blendedElevM) {
  float e0 = 0.0;
  float e1 = 0.0;
  float y0 = sampleWorldHeightPrev(uv, e0);
  float y1 = sampleWorldHeightNext(uv, e1);
  blendedElevM = mix(e0, e1, uMorph);
  return mix(y0, y1, uMorph);
}

float evalTerrainWorldYFast(vec2 uv) {
  float dummy = 0.0;
  return evalTerrainWorldY(uv, dummy);
}

void computeModisBowtieCell(
  vec2 uv,
  vec2 modisBowtie,
  float domainWidthKm,
  out vec2 uvQuant,
  out vec2 cellFracCentered,
  out float minEdgeDist
) {
  float az = modisBowtie.x;
  float stretch = modisBowtie.y;
  float cA = cos(az);
  float sA = sin(az);
  mat2 rot = mat2(cA, -sA, sA, cA);
  mat2 invRot = mat2(cA, sA, -sA, cA);

  // Convert centered UV to metric km so 1.0 km x (1.0 * stretch km) cells are physically scaled
  float depthKm = domainWidthKm * (${SLAB_D.toFixed(2)} / ${SLAB_W.toFixed(2)});
  vec2 metricKm = (uv - vec2(0.5)) * vec2(domainWidthKm, depthKm);
  vec2 cellKm = vec2(max(1.15, 1.0 * stretch), 1.05);

  vec2 rotKm = rot * metricKm;
  vec2 cellCoord = rotKm / cellKm;
  vec2 cellIdx = floor(cellCoord);
  vec2 frac = cellCoord - cellIdx;
  cellFracCentered = frac - vec2(0.5);
  minEdgeDist = min(min(frac.x, 1.0 - frac.x), min(frac.y, 1.0 - frac.y));

  vec2 snappedKm = (cellIdx + vec2(0.5)) * cellKm;
  vec2 worldKm = invRot * snappedKm;
  uvQuant = clamp(worldKm / vec2(domainWidthKm, depthKm) + vec2(0.5), vec2(0.002), vec2(0.998));
}
`;

// =============================================================================
// 1. PHOTOREALISTIC SATELLITE CUTAWAY TERRAIN SHADERS
// =============================================================================
export const TERRAIN_VERTEX_SHADER = /* glsl */ `
${COMMON_HEIGHTFIELD_GLSL}

uniform sampler2D uFieldTex0;
uniform sampler2D uFieldTex1;
uniform float uFrameMix;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;
uniform float uSensitivity;
uniform vec2 uModisBowtie;
uniform float uDomainWidthKm;

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vBaseY;
varying float vElevM;
varying float vModisExtrude;

void main() {
  vUv = uv;
  float elevM = 0.0;
  float baseY = evalTerrainWorldY(uv, elevM);
  float finalY = baseY;
  float extrudeAmt = 0.0;

  // Extrude stepped flat-topped 1 km rectangular MODIS sensor blocks on the Raw MODIS side
  if (uCutawayMix > 0.01) {
    float scanCoord = dot(uv - vec2(0.5), normalize(uCutawayDir)) - uCutawayPlane;
    float rawSide = smoothstep(-0.005, 0.005, scanCoord) * uCutawayMix;
    // Keep slab outer border vertices flush with cliff skirt (2 texel guard)
    float innerGuard = smoothstep(0.0, 0.012, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));

    if (rawSide * innerGuard > 0.01) {
      vec2 uvQuant;
      vec2 cellFrac;
      float minEdge;
      computeModisBowtieCell(uv, uModisBowtie, uDomainWidthKm, uvQuant, cellFrac, minEdge);

      float mC = mix(texture2D(uFieldTex0, uvQuant).b, texture2D(uFieldTex1, uvQuant).b, uFrameMix);
      float mE = mix(texture2D(uFieldTex0, clamp(uvQuant + vec2(0.0055, 0.0), vec2(0.002), vec2(0.998))).b,
                     texture2D(uFieldTex1, clamp(uvQuant + vec2(0.0055, 0.0), vec2(0.002), vec2(0.998))).b, uFrameMix);
      float mW = mix(texture2D(uFieldTex0, clamp(uvQuant - vec2(0.0055, 0.0), vec2(0.002), vec2(0.998))).b,
                     texture2D(uFieldTex1, clamp(uvQuant - vec2(0.0055, 0.0), vec2(0.002), vec2(0.998))).b, uFrameMix);
      float modisVal = max(mC, max(mE, mW));
      float modisScaled = clamp((modisVal - 0.105 * (0.55 + 0.65 * uSensitivity)) / 0.35, 0.0, 1.0);
      float activeBlock = smoothstep(0.06, 0.28, modisScaled);

      if (activeBlock > 0.01) {
        float cellCenterY = evalTerrainWorldYFast(uvQuant);
        float bevel = smoothstep(0.02, 0.14, minEdge);
        float targetBlockTop = max(baseY, cellCenterY) + (0.065 + 0.085 * modisScaled);
        extrudeAmt = activeBlock * bevel * rawSide * innerGuard;
        finalY = mix(baseY, targetBlockTop, extrudeAmt);
      }
    }
  }

  vBaseY = baseY;
  vElevM = elevM;
  vModisExtrude = extrudeAmt;

  vec3 displaced = vec3(position.x, finalY, position.z);
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const TERRAIN_FRAGMENT_SHADER = /* glsl */ `
${COMMON_HEIGHTFIELD_GLSL}

uniform sampler2D uSatPrev;
uniform sampler2D uSatNext;
uniform sampler2D uFieldTex0;
uniform sampler2D uFieldTex1;
uniform sampler2D uLipariTex;

uniform float uFrameMix;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;
uniform float uReconMix;
uniform float uObserverMix;
uniform float uModisWeight;
uniform float uViirsWeight;
uniform float uUncertaintyMix;
uniform float uHoldoutBoost;
uniform float uSensitivity;
uniform vec2 uModisBowtie;
uniform float uDomainWidthKm;
uniform float uHasSeaCoast;

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vBaseY;
varying float vElevM;
varying float vModisExtrude;

vec3 sampleCrispSatellite(vec2 uv) {
  vec2 texStep = vec2(1.0 / 2048.0);
  vec3 cPrev = texture2D(uSatPrev, uv).rgb;
  vec3 cNext = texture2D(uSatNext, uv).rgb;
  vec3 center = mix(cPrev, cNext, uMorph);

  // Subtle high-frequency unsharp luminance detail boost for granite crags & timberlines
  vec3 nE = mix(texture2D(uSatPrev, uv + vec2(texStep.x, 0.0)).rgb, texture2D(uSatNext, uv + vec2(texStep.x, 0.0)).rgb, uMorph);
  vec3 nW = mix(texture2D(uSatPrev, uv - vec2(texStep.x, 0.0)).rgb, texture2D(uSatNext, uv - vec2(texStep.x, 0.0)).rgb, uMorph);
  vec3 nN = mix(texture2D(uSatPrev, uv + vec2(0.0, texStep.y)).rgb, texture2D(uSatNext, uv + vec2(0.0, texStep.y)).rgb, uMorph);
  vec3 nS = mix(texture2D(uSatPrev, uv - vec2(0.0, texStep.y)).rgb, texture2D(uSatNext, uv - vec2(0.0, texStep.y)).rgb, uMorph);

  vec3 blur = 0.25 * (nE + nW + nN + nS);
  float detailLuma = dot(center - blur, vec3(0.299, 0.587, 0.114));
  return clamp(center + vec3(detailLuma * 0.42), 0.0, 1.0);
}

vec3 computeTerrainNormal(vec2 uv, out float slopeMag) {
  float epsU = 1.0 / 512.0;
  float epsV = 1.0 / 512.0;
  float hE = evalTerrainWorldYFast(uv + vec2(epsU, 0.0));
  float hW = evalTerrainWorldYFast(uv - vec2(epsU, 0.0));
  float hN = evalTerrainWorldYFast(uv + vec2(0.0, epsV));
  float hS = evalTerrainWorldYFast(uv - vec2(0.0, epsV));

  float dxWorld = 2.0 * epsU * ${SLAB_W.toFixed(2)};
  float dzWorld = 2.0 * epsV * ${SLAB_D.toFixed(2)};
  // Note: +v is North (-Z world), so dY/dZ = -(hN - hS) / dzWorld
  float dydx = (hE - hW) / dxWorld;
  float dydz = -(hN - hS) / dzWorld;
  slopeMag = length(vec2(dydx, dydz));
  return normalize(vec3(-dydx, 1.0, -dydz));
}

float raymarchSunShadow(vec2 startUv, float startY, vec3 sunDir) {
  // Convert world sun ray direction into (dU, dY, dV) steps across the heightfield
  vec2 stepUvDir = vec2(sunDir.x / ${SLAB_W.toFixed(2)}, -sunDir.z / ${SLAB_D.toFixed(2)});
  float stepLenUv = 0.0115;
  vec2 dUv = normalize(stepUvDir + vec2(1e-6)) * stepLenUv;
  float worldHorizDist = length(vec2(dUv.x * ${SLAB_W.toFixed(2)}, dUv.y * ${SLAB_D.toFixed(2)}));
  float sunSlopeY = sunDir.y / max(0.12, length(sunDir.xz));
  float dY = worldHorizDist * sunSlopeY;

  float occlusion = 0.0;
  vec2 curUv = startUv;
  float rayY = startY + 0.008;

  for (int i = 1; i <= 14; i++) {
    curUv += dUv;
    rayY += dY;
    if (curUv.x < 0.0 || curUv.x > 1.0 || curUv.y < 0.0 || curUv.y > 1.0) {
      break;
    }
    float terrainH = evalTerrainWorldYFast(curUv);
    float diff = terrainH - rayY;
    if (diff > 0.0) {
      float penumbra = clamp(diff * 11.5 / float(i), 0.0, 1.0);
      occlusion = max(occlusion, penumbra);
    }
  }
  return 1.0 - occlusion * 0.76;
}

void main() {
  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 dPosDx = dFdx(vWorldPos);
  vec3 dPosDy = dFdy(vWorldPos);
  float uvFootprint = max(length(dFdx(vUv)), length(dFdy(vUv)));

  float slopeMag = 0.0;
  vec3 N = computeTerrainNormal(vUv, slopeMag);
  float shadow = raymarchSunShadow(vUv, vBaseY, sunDir);

  vec3 satRgb = sampleCrispSatellite(vUv);
  float satLuma = dot(satRgb, vec3(0.2126, 0.7152, 0.0722));

  // Solar diffuse + cool sky hemisphere fill + subtle ridge rim
  float nDotL = max(0.0, dot(N, sunDir));
  float skyFill = 0.5 + 0.5 * N.y;
  vec3 sunIrradiance = vec3(1.06, 0.99, 0.92) * (nDotL * shadow * 0.88);
  vec3 ambientSky = mix(vec3(0.16, 0.20, 0.28), vec3(0.32, 0.37, 0.46), skyFill);
  vec3 litEarth = satRgb * (ambientSky + sunIrradiance);

  // Physical Water Specular Glint (hydrologically flat lakes, rivers, and Aegean sea coves)
  float seaMask = uHasSeaCoast * (1.0 - smoothstep(1.2, 4.5, vElevM));
  float inlandWater = step(satRgb.g * 0.94, satRgb.b)
                    * step(satRgb.r * 1.45, satRgb.b)
                    * (1.0 - smoothstep(0.022, 0.042, satLuma))
                    * (1.0 - smoothstep(0.018, 0.038, slopeMag));
  float waterMask = clamp(max(seaMask, inlandWater), 0.0, 1.0);

  if (waterMask > 0.02) {
    float rippleA = sin(vWorldPos.x * 26.0 + uTime * 1.4 + vWorldPos.z * 19.0);
    float rippleB = cos(vWorldPos.x * 34.0 - uTime * 1.1 + vWorldPos.z * 29.0);
    vec3 waterN = normalize(N + vec3(rippleA * 0.028, 0.0, rippleB * 0.028) * waterMask);
    vec3 halfVec = normalize(sunDir + viewDir);
    float spec = pow(max(0.0, dot(waterN, halfVec)), 96.0) * shadow;
    float fresnel = pow(1.0 - max(0.0, dot(waterN, viewDir)), 4.0);
    vec3 deepWaterTint = mix(litEarth, vec3(0.05, 0.13, 0.21), 0.42);
    litEarth = mix(
      litEarth,
      deepWaterTint + vec3(0.22, 0.28, 0.36) * fresnel * 0.45 + vec3(1.0, 0.93, 0.80) * spec * 0.85,
      waterMask
    );
  }

  // Rayleigh Valley Aerial Perspective (cool-silver depth scattering in deep gorges & far corners)
  float minRange = mix(uElevPrevRange.x, uElevNextRange.x, uMorph);
  float maxRange = mix(uElevPrevRange.y, uElevNextRange.y, uMorph);
  float normElev = clamp((vElevM - minRange) / max(350.0, maxRange - minRange), 0.0, 1.0);
  float camDist = length(cameraPosition - vWorldPos);
  float valleyMist = (1.0 - smoothstep(0.04, 0.48, normElev)) * 0.14
                   + smoothstep(9.5, 22.0, camDist) * 0.16;
  litEarth = mix(litEarth, vec3(0.42, 0.50, 0.62) * (0.45 + 0.45 * shadow), clamp(valleyMist, 0.0, 0.26));

  // Sample 256x256 scientific solver fields
  vec4 f0 = texture2D(uFieldTex0, vUv);
  vec4 f1 = texture2D(uFieldTex1, vUv);
  vec4 field = mix(f0, f1, uFrameMix);

  float sensGate = max(0.015, uSensitivity * 0.42);
  float zHatNorm  = field.r;
  float sigmaNorm = clamp(field.g * (1.0 + 0.28 * uHoldoutBoost), 0.0, 1.0);
  float modisNorm = field.b;
  float viirsNorm = field.a;

  // Orbital Sensor Split Curtain plane signed distance
  vec2 cutDir = normalize(uCutawayDir);
  float scanCoord = dot(vUv - vec2(0.5), cutDir) - uCutawayPlane;
  float posteriorSide = smoothstep(-0.0045, 0.0045, -scanCoord);
  float rawSide = 1.0 - posteriorSide;

  float showPosterior = clamp(uReconMix + uCutawayMix * posteriorSide, 0.0, 1.0);
  float showRawModis  = clamp(uCutawayMix * rawSide, 0.0, 1.0);

  vec3 finalRgb = litEarth;

  // ===========================================================================
  // A. HARMONIZED 375 M POSTERIOR SIDE (OR FULL RECONSTRUCTION MODE)
  // ===========================================================================
  if (showPosterior > 0.005) {
    // Physical dynamic range: Z_hat burn interior [0.03..0.11], active 375 m canyon firelines [0.11..0.62]
    float zFloor = 0.105 * (0.55 + 0.65 * uSensitivity);
    float zScaled = clamp((zHatNorm - zFloor) / 0.44, 0.0, 1.0);

    // 1. Scorched charcoal burn scar + cooling residual embers inside swept perimeter
    float charZone = smoothstep(0.028, 0.108, zHatNorm) * (1.0 - waterMask);
    vec3 burnScarRgb = mix(litEarth, vec3(0.016, 0.014, 0.018) * (0.52 + 0.48 * nDotL), charZone * 0.86);
    float residualSmolder = smoothstep(0.055, 0.125, zHatNorm) * (1.0 - smoothstep(0.14, 0.26, zHatNorm)) * (1.0 - waterMask);
    burnScarRgb += vec3(0.24, 0.028, 0.004) * residualSmolder;

    // 2. Warm orange radiative bounce-light illuminating adjacent canyon rock faces
    float fEps = 2.0 / 256.0;
    float zE = mix(texture2D(uFieldTex0, vUv + vec2(fEps, 0.0)).r, texture2D(uFieldTex1, vUv + vec2(fEps, 0.0)).r, uFrameMix);
    float zW = mix(texture2D(uFieldTex0, vUv - vec2(fEps, 0.0)).r, texture2D(uFieldTex1, vUv - vec2(fEps, 0.0)).r, uFrameMix);
    float zN = mix(texture2D(uFieldTex0, vUv + vec2(0.0, fEps)).r, texture2D(uFieldTex1, vUv + vec2(0.0, fEps)).r, uFrameMix);
    float zS = mix(texture2D(uFieldTex0, vUv - vec2(0.0, fEps)).r, texture2D(uFieldTex1, vUv - vec2(0.0, fEps)).r, uFrameMix);
    vec3 toFireDir = normalize(vec3(zE - zW, 0.14, -(zN - zS)) + vec3(1e-5));
    float nearPeak = clamp((max(max(zE, zW), max(zN, zS)) - 0.09) / 0.42, 0.0, 1.0);
    float fireBounce = (0.32 + 0.68 * max(0.0, dot(N, toFireDir))) * nearPeak * (1.0 - waterMask);
    burnScarRgb += vec3(0.82, 0.13, 0.012) * fireBounce * 0.48;

    // 3. Linear-light blackbody + Lipari 375 m radiative filaments & incandescent ridge cores
    float zCurved = pow(zScaled, 0.78);
    vec3 lipariLinear = texture2D(uLipariTex, vec2(clamp(0.18 + zCurved * 0.78, 0.01, 0.99), 0.5)).rgb;
    vec3 fireCrimson = vec3(0.58, 0.022, 0.004);
    vec3 fireOrange  = vec3(1.38, 0.26, 0.014);
    vec3 fireGold    = vec3(2.05, 1.18, 0.28);
    vec3 blackbody = mix(
      mix(fireCrimson, fireOrange, smoothstep(0.0, 0.55, zCurved)),
      fireGold,
      smoothstep(0.52, 0.96, zCurved)
    );
    vec3 flameLinear = mix(blackbody, lipariLinear * vec3(1.55, 0.72, 0.32), 0.26);
    float shimmer = 0.94 + 0.06 * sin(uTime * 4.2 + vWorldPos.x * 6.5 + vWorldPos.z * 5.8);
    float flameAlpha = smoothstep(0.02, 0.26, zScaled) * (1.0 - waterMask * 0.95);

    vec3 postRgb = mix(burnScarRgb, flameLinear * shimmer, clamp(flameAlpha, 0.0, 1.0));

    // 4. Crisp Topographic 90% Conformal Confidence Contours (+-sigma) in linear ice-cyan (#9be3ff)
    if (uUncertaintyMix > 0.01) {
      float sEps = 1.0 / 256.0;
      float sScale = (1.0 + 0.28 * uHoldoutBoost) / 0.135;
      float sigmaScaled = sigmaNorm * sScale;
      float sE = mix(texture2D(uFieldTex0, vUv + vec2(sEps, 0.0)).g, texture2D(uFieldTex1, vUv + vec2(sEps, 0.0)).g, uFrameMix) * sScale;
      float sW = mix(texture2D(uFieldTex0, vUv - vec2(sEps, 0.0)).g, texture2D(uFieldTex1, vUv - vec2(sEps, 0.0)).g, uFrameMix) * sScale;
      float sN = mix(texture2D(uFieldTex0, vUv + vec2(0.0, sEps)).g, texture2D(uFieldTex1, vUv + vec2(0.0, sEps)).g, uFrameMix) * sScale;
      float sS = mix(texture2D(uFieldTex0, vUv - vec2(0.0, sEps)).g, texture2D(uFieldTex1, vUv - vec2(0.0, sEps)).g, uFrameMix) * sScale;

      float bands = 3.5;
      vec2 grad = vec2(sE - sW, sN - sS) * 0.5 * bands;
      float gradLen = max(length(grad), 0.032);
      float distIso = abs(fract(sigmaScaled * bands - 0.5) - 0.5) / gradLen;
      float contour = (1.0 - smoothstep(0.05, 0.46, distIso))
                    * smoothstep(0.22, 0.48, sigmaScaled)
                    * (1.0 - flameAlpha * 0.88)
                    * uUncertaintyMix * (1.0 - waterMask * 0.85);

      vec3 iceCyanLinear = vec3(0.24, 0.70, 1.0);
      postRgb = mix(postRgb, iceCyanLinear, contour * 0.58);
    }

    finalRgb = mix(finalRgb, postRgb, showPosterior);
  }

  // ===========================================================================
  // B. RAW MODIS 1 KM SIDE (SLATE-IR + ROTATED 1x2.6 KM BOW-TIE PRISMS + BLIND SPOTS)
  // ===========================================================================
  if (showRawModis > 0.005) {
    // 1. High-contrast cool slate-infrared satellite pass (linear RGB)
    float irContrast = clamp((pow(max(satLuma, 0.0005), 0.45) - 0.24) * 1.42 + 0.34, 0.04, 0.96);
    float irShade = irContrast * (0.42 + 0.58 * nDotL * shadow);
    vec3 slateIr = mix(vec3(0.018, 0.028, 0.048), vec3(0.22, 0.30, 0.42), irShade);
    vec3 rawPassRgb = mix(litEarth, slateIr, 0.82);

    // 2. Rotated 1 km x 2.6 km MODIS bow-tie pixel grid & snapped cell radiance
    vec2 uvQuant;
    vec2 cellFrac;
    float minEdge;
    computeModisBowtieCell(vUv, uModisBowtie, uDomainWidthKm, uvQuant, cellFrac, minEdge);

    float mC = mix(texture2D(uFieldTex0, uvQuant).b, texture2D(uFieldTex1, uvQuant).b, uFrameMix);
    float mE = mix(texture2D(uFieldTex0, clamp(uvQuant + vec2(0.0055, 0.0), vec2(0.002), vec2(0.998))).b,
                   texture2D(uFieldTex1, clamp(uvQuant + vec2(0.0055, 0.0), vec2(0.002), vec2(0.998))).b, uFrameMix);
    float mW = mix(texture2D(uFieldTex0, clamp(uvQuant - vec2(0.0055, 0.0), vec2(0.002), vec2(0.998))).b,
                   texture2D(uFieldTex1, clamp(uvQuant - vec2(0.0055, 0.0), vec2(0.002), vec2(0.998))).b, uFrameMix);
    float modisCellVal = max(mC, max(mE, mW));
    float modisScaled = clamp((modisCellVal - 0.105 * (0.55 + 0.65 * uSensitivity)) / 0.35, 0.0, 1.0);

    float cellFreq = uDomainWidthKm / 1.05;
    float gridLineAA = clamp(uvFootprint * cellFreq * 1.45, 0.008, 0.085);
    float rawModisGridLine = 1.0 - smoothstep(0.0, gridLineAA, minEdge);
    rawPassRgb = mix(rawPassRgb, vec3(0.16, 0.24, 0.36), rawModisGridLine * 0.42);

    // 3. Diagnostic amber-slate cross-hatch where steep canyon fires are MISSED by MODIS 1 km
    float missedMask = smoothstep(0.11, 0.24, zHatNorm)
                     * (1.0 - smoothstep(0.02, 0.14, modisScaled))
                     * (1.0 - waterMask);
    if (missedMask > 0.01) {
      float hatchCoord = (vWorldPos.x + vWorldPos.z) * 28.0;
      float hatch = 1.0 - smoothstep(0.18, 0.36, abs(fract(hatchCoord) - 0.5));
      rawPassRgb = mix(rawPassRgb, vec3(0.68, 0.24, 0.045), missedMask * (0.22 + 0.42 * hatch));
    }

    // 4. Extruded flat-topped 1 km rectangular MODIS sensor blocks (linear NASA FIRMS vermilion #ef5b30)
    float activeModisBlock = smoothstep(0.06, 0.28, modisScaled);
    if (activeModisBlock > 0.01) {
      vec3 geomCross = cross(dPosDx, dPosDy);
      vec3 blockNormal = normalize(geomCross + vec3(0.0, 1e-6, 0.0));
      float topFlatness = clamp(abs(blockNormal.y), 0.0, 1.0);
      vec3 vermilionBase = vec3(0.84, 0.095, 0.020);
      vec3 vermilionHot  = vec3(1.24, 0.38, 0.055);
      vec3 blockCol = mix(vermilionBase * 0.52, mix(vermilionBase, vermilionHot, modisScaled), topFlatness);
      float rimHighlight = (1.0 - smoothstep(0.03, 0.12, minEdge)) * activeModisBlock;
      blockCol += vec3(0.95, 0.46, 0.12) * rimHighlight * 0.42;

      float blockBlend = clamp(max(vModisExtrude, activeModisBlock * 0.90), 0.0, 1.0);
      rawPassRgb = mix(rawPassRgb, blockCol, blockBlend);
    }

    finalRgb = mix(finalRgb, rawPassRgb, showRawModis);
  }

  // ===========================================================================
  // C. OBSERVER MODE SURFACE RADIANCE OVERLAY
  // ===========================================================================
  if (uObserverMix > 0.005) {
    float obsModis = smoothstep(sensGate, sensGate + 0.14, modisNorm) * uModisWeight;
    float obsViirs = smoothstep(sensGate * 0.45, sensGate * 0.45 + 0.12, viirsNorm) * uViirsWeight;
    vec3 obsRgb = litEarth * 0.82;
    obsRgb = mix(obsRgb, vec3(0.92, 0.52, 0.30), obsModis * 0.72);
    obsRgb = mix(obsRgb, vec3(0.45, 0.85, 0.96), obsViirs * 0.80);
    finalRgb = mix(finalRgb, obsRgb, uObserverMix);
  }

  // ===========================================================================
  // D. RAZOR-SHARP OPTICAL LASER LINE WHERE THE 3D GLASS CURTAIN SLICES TERRAIN
  // ===========================================================================
  if (uCutawayMix > 0.01) {
    float scanLine = exp(-abs(scanCoord) * 280.0) * uCutawayMix;
    float scanHalo = exp(-abs(scanCoord) * 58.0) * uCutawayMix;
    finalRgb += vec3(0.35, 0.82, 1.0) * scanHalo * 0.28 + vec3(0.92, 0.99, 1.0) * scanLine * 0.95;
  }

  // Subtle top bevel edge highlight around the 4 outer cut boundaries of the slab
  float borderDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float rimBevel = 1.0 - smoothstep(0.0, 0.0028, borderDist);
  finalRgb = mix(finalRgb, finalRgb + vec3(0.14, 0.17, 0.22), rimBevel * 0.65);

  gl_FragColor = vec4(finalRgb, 1.0);
  #include <colorspace_fragment>
}
`;

// =============================================================================
// 2. 3D GEOLOGICAL CUTAWAY CLIFF SKIRT GEOMETRY & STRATIGRAPHIC SHADERS
// =============================================================================
export function buildStratigraphicSkirtGeometry(): THREE.BufferGeometry {
  const segs = SLAB_SEGMENTS; // 511 segments per wall -> 512 vertices per wall
  const vertsPerSide = (segs + 1) * 2;
  const totalVerts = vertsPerSide * 4;
  const totalIndices = segs * 6 * 4;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const skirtParams = new Float32Array(totalVerts * 4); // (u, v, isTop, wallDistU)
  const indices = new Uint32Array(totalIndices);

  const halfW = SLAB_W * 0.5;
  const halfD = SLAB_D * 0.5;

  // 4 perimeter walls ordered so outward normal faces cleanly away from slab center:
  // 0: South (+Z, v = 0, u: 0 -> 1)
  // 1: East  (+X, u = 1, v: 0 -> 1)
  // 2: North (-Z, v = 1, u: 1 -> 0)
  // 3: West  (-X, u = 0, v: 1 -> 0)
  const sides: Array<{
    normal: [number, number, number];
    evalUv: (t: number) => [number, number];
  }> = [
    { normal: [0, 0, 1], evalUv: (t) => [t, 0.0] },
    { normal: [1, 0, 0], evalUv: (t) => [1.0, t] },
    { normal: [0, 0, -1], evalUv: (t) => [1.0 - t, 1.0] },
    { normal: [-1, 0, 0], evalUv: (t) => [0.0, 1.0 - t] },
  ];

  let vCursor = 0;
  let iCursor = 0;

  for (let sIdx = 0; sIdx < 4; sIdx++) {
    const side = sides[sIdx];
    const baseVert = vCursor;

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const [u, v] = side.evalUv(t);
      const wx = (u - 0.5) * SLAB_W;
      const wz = (0.5 - v) * SLAB_D;
      const runParam = sIdx + t;

      // Top vertex (displaced to live terrain height in vertex shader)
      positions[vCursor * 3] = wx;
      positions[vCursor * 3 + 1] = 0.0;
      positions[vCursor * 3 + 2] = wz;
      normals[vCursor * 3] = side.normal[0];
      normals[vCursor * 3 + 1] = side.normal[1];
      normals[vCursor * 3 + 2] = side.normal[2];
      skirtParams[vCursor * 4] = u;
      skirtParams[vCursor * 4 + 1] = v;
      skirtParams[vCursor * 4 + 2] = 1.0;
      skirtParams[vCursor * 4 + 3] = runParam;
      vCursor++;

      // Bottom vertex (locked cleanly at CLIFF_BASE_Y = -0.44)
      positions[vCursor * 3] = wx;
      positions[vCursor * 3 + 1] = CLIFF_BASE_Y;
      positions[vCursor * 3 + 2] = wz;
      normals[vCursor * 3] = side.normal[0];
      normals[vCursor * 3 + 1] = side.normal[1];
      normals[vCursor * 3 + 2] = side.normal[2];
      skirtParams[vCursor * 4] = u;
      skirtParams[vCursor * 4 + 1] = v;
      skirtParams[vCursor * 4 + 2] = 0.0;
      skirtParams[vCursor * 4 + 3] = runParam;
      vCursor++;
    }

    for (let i = 0; i < segs; i++) {
      const tl = baseVert + i * 2;
      const bl = tl + 1;
      const tr = tl + 2;
      const br = tl + 3;
      indices[iCursor++] = tl;
      indices[iCursor++] = bl;
      indices[iCursor++] = tr;
      indices[iCursor++] = tr;
      indices[iCursor++] = bl;
      indices[iCursor++] = br;
    }
  }

  void halfW;
  void halfD;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('aSkirtParam', new THREE.BufferAttribute(skirtParams, 4));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 14.0);
  return geom;
}

export const SKIRT_VERTEX_SHADER = /* glsl */ `
${COMMON_HEIGHTFIELD_GLSL}

attribute vec4 aSkirtParam; // (u, v, isTop, perimeterRun)

varying vec2 vEdgeUv;
varying float vSurfaceY;
varying float vSurfaceElevM;
varying float vWorldY;
varying float vRunParam;
varying vec3 vWallNormal;
varying vec3 vWorldPos;

void main() {
  vec2 edgeUv = aSkirtParam.xy;
  float isTop = aSkirtParam.z;
  float surfElevM = 0.0;
  float surfY = evalTerrainWorldY(edgeUv, surfElevM);

  float wy = mix(${CLIFF_BASE_Y.toFixed(2)}, surfY, isTop);
  vec3 displaced = vec3(position.x, wy, position.z);
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);

  vEdgeUv = edgeUv;
  vSurfaceY = surfY;
  vSurfaceElevM = surfElevM;
  vWorldY = wy;
  vRunParam = aSkirtParam.w;
  vWallNormal = normalize(mat3(modelMatrix) * normal);
  vWorldPos = worldPos.xyz;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const SKIRT_FRAGMENT_SHADER = /* glsl */ `
uniform vec2 uElevPrevRange;
uniform vec2 uElevNextRange;
uniform float uMorph;
uniform vec3 uSunDir;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;

varying vec2 vEdgeUv;
varying float vSurfaceY;
varying float vSurfaceElevM;
varying float vWorldY;
varying float vRunParam;
varying vec3 vWallNormal;
varying vec3 vWorldPos;

void main() {
  float minRange = mix(uElevPrevRange.x, uElevNextRange.x, uMorph);
  float maxRange = mix(uElevPrevRange.y, uElevNextRange.y, uMorph);
  float spanM = max(350.0, maxRange - minRange);

  // Depth fraction from base (-0.44) up to surface (vSurfaceY)
  float wallSpan = max(0.08, vSurfaceY - (${CLIFF_BASE_Y.toFixed(2)}));
  float hFrac = clamp((vWorldY - (${CLIFF_BASE_Y.toFixed(2)})) / wallSpan, 0.0, 1.0);

  // Equivalent geological elevation in meters at this vertical cross-section pixel
  float pixelElevM = minRange + (vWorldY / ${MAX_RELIEF_WORLD_Y.toFixed(2)}) * spanM;

  // Lithospheric basalt-slate gradient (#1d2129 -> #0d1016) with directional facet lighting
  vec3 topSlate = vec3(0.125, 0.145, 0.184);
  vec3 baseBasalt = vec3(0.048, 0.058, 0.082);
  vec3 wallCol = mix(baseBasalt, topSlate, pow(hFrac, 0.85));

  // Subtle folded sedimentary strata bands
  float foldWarp = 38.0 * sin(vRunParam * 5.2) + 16.0 * cos(vRunParam * 13.5);
  float strataA = 0.5 + 0.5 * sin((pixelElevM + foldWarp) * 0.036);
  float strataB = 0.5 + 0.5 * cos((pixelElevM - foldWarp * 0.6) * 0.095);
  wallCol *= 0.88 + 0.14 * strataA + 0.06 * strataB;

  // Architectural facet lighting across N / E / S / W cutaway faces
  float facetLight = 0.62 + 0.38 * max(0.0, dot(normalize(vWallNormal), normalize(vec3(uSunDir.x, 0.25, uSunDir.z))));
  wallCol *= facetLight;

  // Crisp 1px horizontal elevation datum lines every 500 m (500 m, 1,000 m, 1,500 m, 2,000 m, 2,500 m)
  float datumStep = 500.0;
  float datumPhase = pixelElevM / datumStep;
  float datumDist = abs(fract(datumPhase - 0.5) - 0.5) / max(fwidth(datumPhase), 0.002);
  float datumLine = (1.0 - smoothstep(0.45, 1.35, datumDist)) * step(120.0, pixelElevM);
  wallCol = mix(wallCol, vec3(0.44, 0.52, 0.64), datumLine * 0.34);

  // Clean top bevel rim hairline + base ground seam hairline
  float distFromTop = vSurfaceY - vWorldY;
  float topBevel = 1.0 - smoothstep(0.0, 0.018, distFromTop);
  float baseRule = 1.0 - smoothstep(0.0, 0.014, vWorldY - (${CLIFF_BASE_Y.toFixed(2)}));
  wallCol += vec3(0.18, 0.22, 0.29) * topBevel * 0.65;
  wallCol = mix(wallCol, vec3(0.24, 0.30, 0.40), baseRule * 0.42);

  // Continuation of the optical laser line down the vertical cliff face where the scan curtain slices it
  if (uCutawayMix > 0.01) {
    float scanCoord = dot(vEdgeUv - vec2(0.5), normalize(uCutawayDir)) - uCutawayPlane;
    float cliffLaser = exp(-abs(scanCoord) * 260.0) * uCutawayMix;
    wallCol += vec3(0.55, 0.90, 1.0) * cliffLaser * 0.72;
  }

  gl_FragColor = vec4(wallCol, 1.0);
  #include <colorspace_fragment>
}
`;

// =============================================================================
// 3. GROUNDED CONTACT-SHADOW PEDESTAL & RADIAL GEODETIC GRATICULE SHADERS
// =============================================================================
export const PEDESTAL_VERTEX_SHADER = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vWorldPos;

void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const PEDESTAL_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vWorldPos;

float sdBox2D(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}

void main() {
  vec2 xz = vWorldPos.xz;
  vec2 halfSlab = vec2(${(SLAB_W * 0.5).toFixed(3)}, ${(SLAB_D * 0.5).toFixed(3)});
  float boxDist = sdBox2D(xz, halfSlab);
  float radialDist = length(xz);

  // Grounded ambient-occlusion contact shadow directly beneath and around the cutaway monolith
  float contactShadow = 1.0 - smoothstep(-0.2, 2.35, boxDist);

  // Delicate orbital geodetic range rings & lat/lon graticule hairlines outside the slab
  float ringSpacing = 2.4;
  float ringPhase = radialDist / ringSpacing;
  float ringDist = abs(fract(ringPhase - 0.5) - 0.5) / max(fwidth(ringPhase), 0.002);
  float ringLine = (1.0 - smoothstep(0.45, 1.35, ringDist)) * smoothstep(0.05, 0.35, boxDist);

  // Subtle lat/lon Cartesian graticule hairlines
  vec2 gridPhase = xz / 1.85;
  vec2 gridAA = max(fwidth(gridPhase), vec2(0.002));
  vec2 gridDist = abs(fract(gridPhase - 0.5) - 0.5) / gridAA;
  float graticule = (1.0 - smoothstep(0.45, 1.4, min(gridDist.x, gridDist.y)))
                  * smoothstep(0.04, 0.25, boxDist);

  // Cardinal N / E / S / W axis hairlines
  float axisX = (1.0 - smoothstep(0.5, 1.5, abs(xz.x) / max(fwidth(xz.x), 0.002)))
              * smoothstep(0.1, 0.4, boxDist) * (1.0 - smoothstep(4.5, 10.5, abs(xz.y) - halfSlab.y));
  float axisZ = (1.0 - smoothstep(0.5, 1.5, abs(xz.y) / max(fwidth(xz.y), 0.002)))
              * smoothstep(0.1, 0.4, boxDist) * (1.0 - smoothstep(4.5, 10.5, abs(xz.x) - halfSlab.x));
  float cardinalTicks = max(axisX, axisZ);

  float horizonFade = 1.0 - smoothstep(8.2, 14.5, radialDist);

  vec3 lineRgb = vec3(0.32, 0.41, 0.54);
  float lineAlpha = (ringLine * 0.16 + graticule * 0.085 + cardinalTicks * 0.26) * horizonFade;
  float shadowAlpha = contactShadow * 0.68 * horizonFade;

  float outAlpha = clamp(shadowAlpha + lineAlpha, 0.0, 0.85);
  vec3 outRgb = mix(vec3(0.015, 0.020, 0.030), lineRgb, lineAlpha / max(outAlpha, 1e-4));

  gl_FragColor = vec4(outRgb, outAlpha);
  #include <colorspace_fragment>
}
`;

// =============================================================================
// 4. 3D VERTICAL TRANSLUCENT OPTICAL SCAN CURTAIN GEOMETRY & SHADERS
// =============================================================================
export function buildOpticalScanCurtainGeometry(segments = 256): THREE.BufferGeometry {
  const vertCount = (segments + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const curtainParams = new Float32Array(vertCount * 2); // (sOffset in [-0.75, +0.75], isTop in {0, 1})
  const indices = new Uint16Array(segments * 6);

  let vIdx = 0;
  for (let i = 0; i <= segments; i++) {
    const s = (i / segments - 0.5) * 1.52;
    // Bottom vertex (hugs exact 3D mountain profile)
    curtainParams[vIdx * 2] = s;
    curtainParams[vIdx * 2 + 1] = 0.0;
    vIdx++;
    // Top vertex (+1.55 world units above mountain profile)
    curtainParams[vIdx * 2] = s;
    curtainParams[vIdx * 2 + 1] = 1.0;
    vIdx++;
  }

  let iIdx = 0;
  for (let i = 0; i < segments; i++) {
    const b0 = i * 2;
    const t0 = b0 + 1;
    const b1 = b0 + 2;
    const t1 = b0 + 3;
    indices[iIdx++] = b0;
    indices[iIdx++] = b1;
    indices[iIdx++] = t0;
    indices[iIdx++] = t0;
    indices[iIdx++] = b1;
    indices[iIdx++] = t1;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('aCurtainParam', new THREE.BufferAttribute(curtainParams, 2));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 16.0);
  return geom;
}

export const CURTAIN_VERTEX_SHADER = /* glsl */ `
${COMMON_HEIGHTFIELD_GLSL}

attribute vec2 aCurtainParam; // (sOffset, isTop)
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;

varying float vHeightFrac;
varying float vSpanCoord;
varying float vInSlab;
varying vec3 vWorldPos;
varying vec3 vCurtainNormal;

void main() {
  vec2 dir = normalize(uCutawayDir);
  vec2 perp = vec2(-dir.y, dir.x);

  // Analytical segment clipping to [0, 1] x [0, 1] UV slab so curtain ends flush at the cliff walls
  vec2 uvCenter = vec2(0.5) + dir * uCutawayPlane;
  float sMin = -2.0;
  float sMax = 2.0;

  if (abs(perp.x) > 1e-5) {
    float sx0 = (0.0 - uvCenter.x) / perp.x;
    float sx1 = (1.0 - uvCenter.x) / perp.x;
    sMin = max(sMin, min(sx0, sx1));
    sMax = min(sMax, max(sx0, sx1));
  } else if (uvCenter.x < 0.0 || uvCenter.x > 1.0) {
    sMin = 1.0;
    sMax = -1.0;
  }

  if (abs(perp.y) > 1e-5) {
    float sy0 = (0.0 - uvCenter.y) / perp.y;
    float sy1 = (1.0 - uvCenter.y) / perp.y;
    sMin = max(sMin, min(sy0, sy1));
    sMax = min(sMax, max(sy0, sy1));
  } else if (uvCenter.y < 0.0 || uvCenter.y > 1.0) {
    sMin = 1.0;
    sMax = -1.0;
  }

  float validChord = step(sMin, sMax);
  float tFrac = aCurtainParam.x / 1.52 + 0.5;
  float sClamped = mix(sMin, sMax, clamp(tFrac, 0.0, 1.0));
  vec2 uv = clamp(uvCenter + perp * sClamped, vec2(0.0), vec2(1.0));

  float terrainY = evalTerrainWorldYFast(uv);
  float isTop = aCurtainParam.y;
  float curtainRise = 1.55;
  float wy = terrainY + isTop * curtainRise;

  float wx = (uv.x - 0.5) * ${SLAB_W.toFixed(2)};
  float wz = (0.5 - uv.y) * ${SLAB_D.toFixed(2)};

  vec3 worldN = normalize(vec3(dir.x, 0.0, -dir.y));
  vec4 wp = modelMatrix * vec4(wx, wy, wz, 1.0);

  vHeightFrac = isTop;
  vSpanCoord = tFrac;
  vInSlab = validChord;
  vWorldPos = wp.xyz;
  vCurtainNormal = worldN;

  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const CURTAIN_FRAGMENT_SHADER = /* glsl */ `
uniform float uCutawayMix;
uniform float uCurtainHover;
uniform float uTime;

varying float vHeightFrac;
varying float vSpanCoord;
varying float vInSlab;
varying vec3 vWorldPos;
varying vec3 vCurtainNormal;

void main() {
  if (vInSlab < 0.5 || uCutawayMix < 0.005) {
    discard;
  }

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float nDotV = abs(dot(normalize(vCurtainNormal), viewDir));
  float edgeOnFade = smoothstep(0.03, 0.15, nDotV);
  float fresnel = 0.55 + 0.45 * pow(1.0 - nDotV, 2.2);

  // Razor-sharp bottom ridge-hugging laser + crisp top collector rail + smooth edge taper
  float bottomLaser = exp(-vHeightFrac * 44.0);
  float bottomGlow  = exp(-vHeightFrac * 9.5);
  float topRail     = exp(-(1.0 - vHeightFrac) * 65.0);
  float spanTaper   = smoothstep(0.0, 0.045, min(vSpanCoord, 1.0 - vSpanCoord));

  float vertScanlines = 0.5 + 0.5 * sin(vSpanCoord * 210.0 - uTime * 1.6);
  float glassBody = (1.0 - smoothstep(0.0, 0.96, vHeightFrac)) * (0.055 + 0.030 * vertScanlines) * fresnel;

  float hoverBoost = 1.0 + 0.35 * uCurtainHover;
  float alpha = (glassBody + bottomGlow * 0.22 + bottomLaser * 0.68 + topRail * 0.28)
              * spanTaper * edgeOnFade * uCutawayMix * hoverBoost;

  vec3 glassTint = vec3(0.42, 0.84, 1.0);
  vec3 laserCore = vec3(0.94, 0.99, 1.0);
  vec3 col = mix(glassTint, laserCore, clamp(bottomLaser + topRail * 0.5, 0.0, 1.0));

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
  #include <colorspace_fragment>
}
`;

// =============================================================================
// 5. GPU-ANIMATED 3D CONVECTIVE SMOKE & GLOWING EMBER PLUMES (2,400 PARTICLES)
// =============================================================================
export function buildConvectivePlumeGeometry(): {
  geometry: THREE.BufferGeometry;
  uvAttr: THREE.BufferAttribute;
  seedAttr: THREE.BufferAttribute;
} {
  const dummyPos = new Float32Array(PLUME_PARTICLE_COUNT * 3);
  const uvArr = new Float32Array(PLUME_PARTICLE_COUNT * 2);
  const seedArr = new Float32Array(PLUME_PARTICLE_COUNT * 4);

  for (let i = 0; i < PLUME_PARTICLE_COUNT; i++) {
    // Golden-ratio quasi-random initial seeding before active tensor hotspot binding
    const g1 = (i * 0.61803398875) % 1.0;
    const g2 = (i * 0.38196601125 * 1.73205) % 1.0;
    uvArr[i * 2] = 0.16 + g1 * 0.68;
    uvArr[i * 2 + 1] = 0.16 + g2 * 0.68;

    const h1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    const h2 = Math.sin(i * 93.9898 + 17.135) * 24634.6345;
    const h3 = Math.sin(i * 41.2317 + 53.719) * 19283.4719;
    seedArr[i * 4] = h1 - Math.floor(h1); // phase offset [0..1]
    seedArr[i * 4 + 1] = 0.65 + 0.70 * (h2 - Math.floor(h2)); // buoyancy speed
    seedArr[i * 4 + 2] = (h3 - Math.floor(h3)) * Math.PI * 2.0; // swirl angle
    seedArr[i * 4 + 3] = i % 5 === 0 ? 1.0 : 0.0; // 20% crisp ember sparks, 80% convective smoke puffs
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));
  const uvAttr = new THREE.BufferAttribute(uvArr, 2);
  const seedAttr = new THREE.BufferAttribute(seedArr, 4);
  geom.setAttribute('aHotspotUv', uvAttr);
  geom.setAttribute('aSeed', seedAttr);
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 18.0);

  return { geometry: geom, uvAttr, seedAttr };
}

/**
 * Re-seeds the 2,400 plume emitters directly onto active Z_hat fire cells across the 24-epoch tensor
 * via importance-weighted cumulative sampling so every particle anchors to real canyon fire filaments.
 */
export function bindPlumeParticlesToTensor(
  tensor: Uint8Array,
  frameCount: number,
  uvAttr: THREE.BufferAttribute,
): void {
  const cellCount = FIELD_GRID_SIZE * FIELD_GRID_SIZE;
  const maxZPerCell = new Float32Array(cellCount);
  const frameStride = cellCount * 4;

  for (let f = 0; f < frameCount; f += 2) {
    const fBase = f * frameStride;
    for (let idx = 0; idx < cellCount; idx++) {
      const z = tensor[fBase + idx * 4];
      if (z > maxZPerCell[idx]) {
        maxZPerCell[idx] = z;
      }
    }
  }

  const activeIndices: number[] = [];
  const weights: number[] = [];
  let weightSum = 0;

  for (let idx = 0; idx < cellCount; idx++) {
    const z = maxZPerCell[idx];
    if (z >= 36) {
      const w = Math.pow((z - 32) / 223.0, 2.1);
      activeIndices.push(idx);
      weightSum += w;
      weights.push(weightSum);
    }
  }

  if (activeIndices.length < 8 || weightSum <= 0) return;

  const uvArr = uvAttr.array as Float32Array;
  for (let i = 0; i < PLUME_PARTICLE_COUNT; i++) {
    const targetW = ((i + 0.5) / PLUME_PARTICLE_COUNT) * weightSum;
    // Binary search cumulative distribution
    let lo = 0;
    let hi = weights.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (weights[mid] < targetW) lo = mid + 1;
      else hi = mid;
    }
    const chosenIdx = activeIndices[lo];
    const gx = chosenIdx % FIELD_GRID_SIZE;
    const gy = Math.floor(chosenIdx / FIELD_GRID_SIZE);

    // Sub-cell jitter so plumes form organic volumetric columns rather than grid dots
    const jx = ((Math.sin(i * 19.19) * 43758.54) % 1 + 1) % 1 - 0.5;
    const jy = ((Math.cos(i * 37.73) * 29183.17) % 1 + 1) % 1 - 0.5;

    uvArr[i * 2] = Math.min(0.985, Math.max(0.015, (gx + 0.5 + jx * 0.9) / FIELD_GRID_SIZE));
    uvArr[i * 2 + 1] = Math.min(0.985, Math.max(0.015, (gy + 0.5 + jy * 0.9) / FIELD_GRID_SIZE));
  }
  uvAttr.needsUpdate = true;
}

export const PLUME_VERTEX_SHADER = /* glsl */ `
${COMMON_HEIGHTFIELD_GLSL}

attribute vec2 aHotspotUv;
attribute vec4 aSeed; // (phase, speed, swirlAngle, isEmberSpark)

uniform sampler2D uFieldTex0;
uniform sampler2D uFieldTex1;
uniform float uFrameMix;
uniform float uTime;
uniform float uPlumeOpacity;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;
uniform vec2 uWindDirUv;
uniform float uViewportHeightPx;

varying float vAge;
varying float vIntensity;
varying float vIsEmber;
varying float vAlphaGate;
varying float vSwirl;

void main() {
  vec2 baseUv = aHotspotUv;
  float z0 = texture2D(uFieldTex0, baseUv).r;
  float z1 = texture2D(uFieldTex1, baseUv).r;
  float zHatNorm = mix(z0, z1, uFrameMix);

  // Hide particles on Raw MODIS side in cutaway mode or when cell is inactive
  float scanCoord = dot(baseUv - vec2(0.5), normalize(uCutawayDir)) - uCutawayPlane;
  float posteriorGate = mix(1.0, smoothstep(-0.008, 0.012, -scanCoord), uCutawayMix);
  float zScaled = clamp((zHatNorm - 0.115) / 0.42, 0.0, 1.0);
  float fireGate = smoothstep(0.06, 0.42, zScaled) * posteriorGate * uPlumeOpacity;

  if (fireGate <= 0.005) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlphaGate = 0.0;
    return;
  }

  float cycle = fract(aSeed.x + uTime * 0.145 * aSeed.y);
  vAge = cycle;
  vIntensity = zHatNorm;
  vIsEmber = aSeed.w;
  vSwirl = aSeed.z + uTime * (0.55 - 0.35 * cycle);

  // Compute local upslope gradient to advect smoke physically upslope + downwind
  float dEps = 1.0 / 256.0;
  float baseY = evalTerrainWorldYFast(baseUv);
  float yE = evalTerrainWorldYFast(baseUv + vec2(dEps, 0.0));
  float yN = evalTerrainWorldYFast(baseUv + vec2(0.0, dEps));
  vec2 upslopeUv = clamp(vec2(yE - baseY, yN - baseY) * 8.0, vec2(-0.04), vec2(0.04));

  vec2 driftUv = (normalize(uWindDirUv + vec2(1e-5)) * 0.055 + upslopeUv * 0.65) * pow(cycle, 1.15);
  vec2 curUv = clamp(baseUv + driftUv, vec2(0.002), vec2(0.998));

  float wx = (curUv.x - 0.5) * ${SLAB_W.toFixed(2)};
  float wz = (0.5 - curUv.y) * ${SLAB_D.toFixed(2)};

  // Turbulent helical billows aloft
  float billowR = (0.02 + 0.16 * cycle) * (1.0 - 0.55 * aSeed.w);
  wx += cos(vSwirl * 2.2) * billowR;
  wz += sin(vSwirl * 2.2) * billowR;

  float riseHeight = (0.03 + 1.42 * pow(cycle, 0.84)) * (0.65 + 1.85 * zHatNorm);
  float wy = baseY + riseHeight;

  vec4 mvPos = modelViewMatrix * vec4(wx, wy, wz, 1.0);
  gl_Position = projectionMatrix * mvPos;

  float baseRadiusWorld = aSeed.w > 0.5
    ? mix(0.042, 0.018, cycle)
    : mix(0.095, 0.44, pow(cycle, 0.78)) * (0.80 + 0.95 * zHatNorm);

  gl_PointSize = clamp((baseRadiusWorld * uViewportHeightPx) / max(0.25, -mvPos.z), 1.5, 96.0);

  // Smooth fade-in at ground ignition and soft dissipation aloft
  float lifeEnv = smoothstep(0.0, 0.10, cycle) * (1.0 - smoothstep(0.62, 1.0, cycle));
  vAlphaGate = fireGate * lifeEnv;
}
`;

export const PLUME_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uSunDir;

varying float vAge;
varying float vIntensity;
varying float vIsEmber;
varying float vAlphaGate;
varying float vSwirl;

void main() {
  if (vAlphaGate <= 0.004) discard;

  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;

  if (vIsEmber > 0.5) {
    // Crisp incandescent glowing ember spark rising out of the ridge flame
    float sparkCore = exp(-r2 * 5.2);
    float emberLife = 1.0 - smoothstep(0.15, 0.82, vAge);
    vec3 sparkCol = mix(vec3(0.95, 0.12, 0.01), vec3(1.65, 0.92, 0.25), sparkCore);
    float alpha = sparkCore * vAlphaGate * emberLife * 0.92;
    if (alpha < 0.005) discard;
    gl_FragColor = vec4(sparkCol, alpha);
  } else {
    // Soft multi-lobe volumetric smoke puff with sunlit top-rim and warm orange base under-glow (linear RGB)
    float cS = cos(vSwirl);
    float sS = sin(vSwirl);
    vec2 rp = mat2(cS, -sS, sS, cS) * p;
    float lobe = 0.86 + 0.14 * sin(rp.x * 3.8) * cos(rp.y * 3.4);
    float radialSoft = pow(max(0.0, 1.0 - r2), 1.75) * lobe;

    // Pseudo-3D spherical puff normal for solar top-lighting + fire base bounce-lighting
    vec3 puffNormal = normalize(vec3(p.x, -p.y, sqrt(max(0.01, 1.0 - r2))));
    float sunLit = 0.5 + 0.5 * dot(puffNormal, normalize(vec3(uSunDir.x, uSunDir.y, 0.35)));
    float underFireLit = clamp(p.y * 0.5 + 0.5, 0.0, 1.0) * (1.0 - smoothstep(0.0, 0.42, vAge)) * clamp(vIntensity * 1.6, 0.0, 1.0);

    vec3 smokeShadow = vec3(0.042, 0.048, 0.062);
    vec3 smokeSunlit = vec3(0.46, 0.44, 0.42);
    vec3 smokeCol = mix(smokeShadow, smokeSunlit, sunLit);

    // Transition from glowing ember-lit base plume (vAge < 0.22) to sunlit ash smoke aloft
    vec3 fireUnderGlow = vec3(0.88, 0.14, 0.012);
    smokeCol = mix(smokeCol, fireUnderGlow, clamp(underFireLit * 0.72 + (1.0 - smoothstep(0.0, 0.16, vAge)) * 0.42, 0.0, 0.85));

    float smokeAlpha = radialSoft * vAlphaGate * 0.34;
    if (smokeAlpha < 0.004) discard;
    gl_FragColor = vec4(smokeCol, smokeAlpha);
  }
  #include <colorspace_fragment>
}
`;

// =============================================================================
// 6. SUBTLE ORBITAL HORIZON ATMOSPHERE DOME SHADERS
// =============================================================================
export const ATMOSPHERE_DOME_VERTEX_SHADER = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const ATMOSPHERE_DOME_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -0.35, 1.0);
  vec3 zenith = vec3(0.031, 0.043, 0.067);  // #080b11 deep orbital slate
  vec3 horizon = vec3(0.072, 0.098, 0.145); // subtle silver-blue horizon rim
  float band = exp(-pow((h - 0.02) * 5.2, 2.0));
  vec3 col = mix(zenith, horizon, band * 0.85);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
