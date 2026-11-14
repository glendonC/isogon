import * as THREE from 'three';
import { NIGHT_GLSL } from './engine/atmosphere';
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
// SHARED GLSL HEIGHTFIELD FUNCTIONS
// =============================================================================
export const COMMON_HEIGHTFIELD_GLSL = /* glsl */ `
uniform sampler2D uDemPrev;
uniform sampler2D uDemNext;
uniform vec2 uDemRes;       // (prevGridRes, nextGridRes)
uniform vec2 uElevPrevRange; // (minElevM, maxElevM)
uniform vec2 uElevNextRange; // (minElevM, maxElevM)
uniform vec2 uReliefScale;   // world units per metre of elevation (prev, next)
uniform vec2 uSlabSize;      // world size of the slab (east-west, north-south)
uniform float uMorph;       // [0..1] smooth sub-orbital elevation & ortho morph
uniform float uEdgeFade;    // 1 in close views: the far edge of the slab is taken away

// Close views: how much of the terrain is taken away at this point (0 none, 1 all). It is a band
// along the slab's edges, and only where the edge is far from the camera: a near edge is a cut
// wall, not a horizon. The surface dissolves into the backdrop by this share AND sinks to the base
// by it, so a ridge that is no longer drawn cannot hide smoke or sky behind it.
// Ground that stands above the eye's horizon is in front of sky and is kept whole (edgeGoneAt): a
// far ridge on the skyline is depth, not a model edge. Only ground seen below the horizon goes.
const float EDGE_BAND = 3.0;   // world units, about 9 km
const float EDGE_SOLID = 0.67; // gone completely inside the last 2 km
float edgeGone(vec2 uv) {
  if (uEdgeFade < 0.003) return 0.0;
  vec2 e = min(uv, 1.0 - uv) * uSlabSize;
  float band = 1.0 - smoothstep(EDGE_SOLID, EDGE_BAND, min(e.x, e.y));
  vec3 at = vec3((uv.x - 0.5) * uSlabSize.x, 0.0, (0.5 - uv.y) * uSlabSize.y);
  float farSide = smoothstep(0.22, 0.42, distance(at, cameraPosition) / max(uSlabSize.x, uSlabSize.y));
  return uEdgeFade * band * farSide;
}

float belowHorizon(vec3 worldPos) {
  vec3 d = worldPos - cameraPosition;
  return smoothstep(0.01, -0.05, d.y / max(length(d), 1e-3));
}

float edgeGoneAt(vec2 uv, float worldY) {
  float gone = edgeGone(uv);
  if (gone <= 0.0) return 0.0;
  return gone * belowHorizon(vec3((uv.x - 0.5) * uSlabSize.x, worldY, (0.5 - uv.y) * uSlabSize.y));
}

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
  return clamp(elevM - uElevPrevRange.x, 0.0, span * 1.15) * uReliefScale.x;
}

float sampleWorldHeightNext(vec2 uv, out float elevM) {
  elevM = sampleR32FBilinear(uDemNext, uv, uDemRes.y);
  float span = max(350.0, uElevNextRange.y - uElevNextRange.x);
  return clamp(elevM - uElevNextRange.x, 0.0, span * 1.15) * uReliefScale.y;
}

// Context terrain (optional): elevation in metres around the pack, uContextScale times
// its side, same centre and axes. Where it is drawn (uContextMix 1) the pack takes the context
// surface over the last stretch before its edge, so the two meet without a step and nothing has
// to dissolve there.
uniform sampler2D uContextDem;
uniform float uContextRes;    // posts per side
uniform float uContextScale;  // context side over pack side
uniform float uContextMix;
const float CONTEXT_JOIN = 0.02; // share of the pack's side over which it joins the context

float contextJoin(vec2 uv) {
  if (uContextMix < 0.003) return 0.0;
  vec2 e = min(uv, 1.0 - uv);
  return (1.0 - smoothstep(0.0, CONTEXT_JOIN, min(e.x, e.y))) * uContextMix;
}

// World height of the context surface at a pack uv (which may lie outside 0..1). Not clamped to
// the pack's elevation range: ground beyond the pack can be lower than its lowest point.
float contextWorldY(vec2 uv) {
  float elevM = sampleR32FBilinear(uContextDem, (uv - 0.5) / uContextScale + 0.5, uContextRes);
  return (elevM - uElevNextRange.x) * uReliefScale.y;
}

float evalTerrainWorldY(vec2 uv, out float blendedElevM) {
  float e1 = 0.0;
  float y = sampleWorldHeightNext(uv, e1);
  blendedElevM = e1;
  // Outside a region morph only the current heightfield is read
  if (uMorph <= 0.999) {
    float e0 = 0.0;
    float y0 = sampleWorldHeightPrev(uv, e0);
    blendedElevM = mix(e0, e1, uMorph);
    y = mix(y0, y, uMorph);
  }
  float join = contextJoin(uv);
  if (join > 0.0) y = mix(y, contextWorldY(uv), join);
  return y * (1.0 - edgeGoneAt(uv, y));
}

float evalTerrainWorldYFast(vec2 uv) {
  float dummy = 0.0;
  return evalTerrainWorldY(uv, dummy);
}
`;

// The terrain surface shaders live in ./engine/terrainShader.ts.

// =============================================================================
// 2. 3D GEOLOGICAL CUTAWAY CLIFF SKIRT GEOMETRY & STRATIGRAPHIC SHADERS
// =============================================================================
export function buildStratigraphicSkirtGeometry(segs: number = SLAB_SEGMENTS): THREE.BufferGeometry {
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
  vec3 displaced = vec3((edgeUv.x - 0.5) * uSlabSize.x, wy, (0.5 - edgeUv.y) * uSlabSize.y);
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
${NIGHT_GLSL}
uniform vec2 uElevPrevRange;
uniform vec2 uElevNextRange;
uniform vec2 uReliefScale;
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
  float pixelElevM = minRange + vWorldY / max(mix(uReliefScale.x, uReliefScale.y, uMorph), 1e-7);

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

  // By night the block's sides are lit a little more than its top, so the block and its edge
  // read against the dark page (the sides are only seen in the block views)
  gl_FragColor = vec4(mix(wallCol, wallCol * vec3(0.26, 0.34, 0.52), uNight), 1.0);
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
uniform vec2 uSlabSize;
uniform float uShadowMix; // 1 = contact shadow drawn; 0 in close views, where it is a dark band past the far edge
varying vec3 vLocalPos;
varying vec3 vWorldPos;

float sdBox2D(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}

void main() {
  // The floor under the block is quiet: one soft contact shadow, no grid, no rings, no axes
  float boxDist = sdBox2D(vWorldPos.xz, uSlabSize * 0.5);
  float contactShadow = 1.0 - smoothstep(-0.2, 2.6, boxDist);
  float reach = 1.0 - smoothstep(8.2, 14.5, length(vWorldPos.xz));
  gl_FragColor = vec4(vec3(0.015, 0.020, 0.030), contactShadow * contactShadow * 0.62 * reach * uShadowMix);
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
uniform float uCurtainTopY;
uniform vec2 uCutawayDir;
uniform float uHasSeaCoast;

varying float vWater;
varying float vHeightFrac;
varying float vSpanCoord;
varying float vInSlab;
varying vec3 vWorldPos;
varying vec3 vCurtainNormal;
varying float vEdgeKeep;

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
  // Level top edge just above the highest relief. A top that follows the terrain draws a second
  // mountain silhouette in the sky on high relief.
  float wy = mix(terrainY, uCurtainTopY, isTop);

  float wx = (uv.x - 0.5) * uSlabSize.x;
  float wz = (0.5 - uv.y) * uSlabSize.y;

  vec3 worldN = normalize(vec3(dir.x, 0.0, -dir.y));
  vec4 wp = modelMatrix * vec4(wx, wy, wz, 1.0);

  vHeightFrac = isTop;
  vSpanCoord = tFrac;
  vInSlab = validChord;
  vEdgeKeep = 1.0 - edgeGoneAt(uv, terrainY);
  // Sea level on a coast: the foot of the curtain runs flat across open water there
  vWater = uHasSeaCoast * (1.0 - smoothstep(0.002, 0.012, terrainY));
  vWorldPos = wp.xyz;
  vCurtainNormal = worldN;

  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const CURTAIN_FRAGMENT_SHADER = /* glsl */ `
uniform float uCutawayMix;
uniform float uCurtainHover;
uniform float uCurtainRail;   // 1 in whole-slab views; 0 in close views, where the rail is a line across the sky
uniform float uTime;
uniform vec4 uLid;            // landing world view: plane the curtain stays under, dot(xyz, p) + w < 0
uniform float uLidAmount;
uniform float uNight;         // 1 on a night overpass of a real run: the curtain is kept quiet

varying float vHeightFrac;
varying float vSpanCoord;
varying float vInSlab;
varying vec3 vWorldPos;
varying vec3 vCurtainNormal;
varying float vEdgeKeep;
varying float vWater;

void main() {
  if (vInSlab < 0.5 || uCutawayMix < 0.005) {
    discard;
  }

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float nDotV = abs(dot(normalize(vCurtainNormal), viewDir));
  // Seen along its own plane the curtain is a glare across the frame; from inside the landscape
  // (landing world view) that happens at much wider angles than from above
  float edgeOnFade = smoothstep(mix(0.03, 0.10, uLidAmount), mix(0.15, 0.55, uLidAmount), nDotV);
  float fresnel = 0.55 + 0.45 * pow(1.0 - nDotV, 2.2);

  // Razor-sharp bottom ridge-hugging laser + crisp top collector rail + smooth edge taper
  // Over open water the foot is a straight bright line to the horizon, so it is drawn fainter there
  float onLand = mix(1.0, 0.22, vWater);
  float bottomLaser = exp(-vHeightFrac * 44.0) * onLand;
  float bottomGlow  = exp(-vHeightFrac * 9.5) * onLand;
  float topRail     = exp(-(1.0 - vHeightFrac) * 65.0) * uCurtainRail;
  float spanTaper   = smoothstep(0.0, 0.045, min(vSpanCoord, 1.0 - vSpanCoord));

  float vertScanlines = 0.5 + 0.5 * sin(vSpanCoord * 210.0 - uTime * 1.6);
  float glassBody = (1.0 - smoothstep(0.0, 0.96, vHeightFrac)) * (0.055 + 0.030 * vertScanlines) * fresnel;

  float hoverBoost = 1.0 + 0.35 * uCurtainHover;
  float alpha = (glassBody + bottomGlow * 0.22 + bottomLaser * 0.68 + topRail * 0.28)
              * spanTaper * edgeOnFade * uCutawayMix * hoverBoost;

  vec3 glassTint = vec3(0.42, 0.84, 1.0);
  vec3 laserCore = vec3(0.94, 0.99, 1.0);
  vec3 col = mix(glassTint, laserCore, clamp(bottomLaser + topRail * 0.5, 0.0, 1.0));

  // Landing world view: the curtain ends under the calm part of the frame
  float under = -(dot(uLid.xyz, vWorldPos) + uLid.w) / max(distance(vWorldPos, cameraPosition), 1e-3);
  float lidKeep = mix(1.0, smoothstep(0.0, 0.035, under), uLidAmount);

  // Where the far edge of the slab is taken away in close views, the curtain goes with it
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92) * vEdgeKeep * lidKeep * mix(1.0, 0.25, uNight));
}
`;

// The sky dome and atmosphere shaders live in ./engine/atmosphere.ts.
