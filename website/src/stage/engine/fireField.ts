import * as THREE from 'three';
import { FIELD_GRID_SIZE } from '../earthCutawayShaders';

/**
 * Fire history derived from the 24-frame harmonized solver field (channel R, z_hat).
 *
 * The solver field says where fire power is above threshold at each epoch. From that this module
 * derives, per 256 x 256 cell:
 *   R  arrival time   first epoch (fractional, linear crossing) at which z_hat reached the threshold
 *   G  extinction     last epoch (fractional) at which z_hat was still at or above the threshold
 *   B  peak           highest z_hat over the whole record, 0..1 of the field range
 *   A  burned         1 where the cell reached the threshold at some epoch, else 0
 *
 * The flaming front at time t is the level set "arrival = t", so it moves continuously between
 * epochs instead of cross-fading two static bands. Char is everything with arrival < t.
 * Cells that never reached the threshold get an extrapolated arrival value (so the bilinear level
 * set stays smooth along the final perimeter) but keep burned = 0, and the shader additionally
 * gates every flame on the solver field itself, so nothing is drawn where the field is below
 * threshold.
 */

/** z_hat threshold as a fraction of the field range (0.085 * 80 MW/km2 = 6.8 MW/km2). */
export const FIRE_THRESHOLD_NORM = 0.085;

const UNBURNED_SENTINEL = 1.0e6;

export interface FireHistory {
  texture: THREE.DataTexture;
  /** Share of cells that reached the threshold at any epoch. */
  burnedFraction: number;
  frameCount: number;
}

export function buildFireHistory(
  tensor: Uint8Array,
  frameCount: number,
  floatLinearSupported: boolean,
): FireHistory {
  const n = FIELD_GRID_SIZE;
  const cells = n * n;
  const stride = cells * 4;
  const thr = FIRE_THRESHOLD_NORM * 255.0;

  const arrival = new Float32Array(cells).fill(UNBURNED_SENTINEL);
  const extinction = new Float32Array(cells).fill(0);
  const peak = new Float32Array(cells);
  const burned = new Uint8Array(cells);

  for (let idx = 0; idx < cells; idx++) {
    let first = -1;
    let last = -1;
    let zMax = 0;
    for (let f = 0; f < frameCount; f++) {
      const z = tensor[f * stride + idx * 4];
      if (z > zMax) zMax = z;
      if (z >= thr) {
        if (first < 0) first = f;
        last = f;
      }
    }
    peak[idx] = zMax / 255.0;
    if (first < 0) continue;
    burned[idx] = 1;

    if (first === 0) {
      arrival[idx] = -0.5;
    } else {
      const zPrev = tensor[(first - 1) * stride + idx * 4];
      const zNow = tensor[first * stride + idx * 4];
      const frac = zNow > zPrev ? (thr - zPrev) / (zNow - zPrev) : 1.0;
      arrival[idx] = first - 1 + Math.min(1, Math.max(0, frac));
    }

    if (last >= frameCount - 1) {
      extinction[idx] = frameCount - 1 + 0.5;
    } else {
      const zLast = tensor[last * stride + idx * 4];
      const zNext = tensor[(last + 1) * stride + idx * 4];
      const frac = zLast > zNext ? (zLast - thr) / (zLast - zNext) : 0.0;
      extinction[idx] = last + Math.min(1, Math.max(0, frac));
    }
  }

  // Typical slowness (epochs per cell) of the real front, used to extrapolate past the perimeter.
  let slowSum = 0;
  let slowCount = 0;
  for (let y = 1; y < n - 1; y += 2) {
    for (let x = 1; x < n - 1; x += 2) {
      const i = y * n + x;
      if (!burned[i] || !burned[i + 1] || !burned[i - 1] || !burned[i + n] || !burned[i - n]) continue;
      const gx = (arrival[i + 1] - arrival[i - 1]) * 0.5;
      const gy = (arrival[i + n] - arrival[i - n]) * 0.5;
      const g = Math.hypot(gx, gy);
      if (g > 1e-3 && g < 4) {
        slowSum += g;
        slowCount++;
      }
    }
  }
  const slowness = slowCount > 16 ? Math.min(1.2, Math.max(0.08, slowSum / slowCount)) : 0.3;

  // Extrapolate arrival outward from the burned set (two-pass chamfer sweep, repeated twice).
  const ext = arrival.slice();
  const d1 = slowness;
  const d2 = slowness * Math.SQRT2;
  const relax = (i: number, j: number, cost: number) => {
    const cand = ext[j] + cost;
    if (cand < ext[i]) ext[i] = cand;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        if (burned[i]) continue;
        if (x > 0) relax(i, i - 1, d1);
        if (y > 0) relax(i, i - n, d1);
        if (x > 0 && y > 0) relax(i, i - n - 1, d2);
        if (x < n - 1 && y > 0) relax(i, i - n + 1, d2);
      }
    }
    for (let y = n - 1; y >= 0; y--) {
      for (let x = n - 1; x >= 0; x--) {
        const i = y * n + x;
        if (burned[i]) continue;
        if (x < n - 1) relax(i, i + 1, d1);
        if (y < n - 1) relax(i, i + n, d1);
        if (x < n - 1 && y < n - 1) relax(i, i + n + 1, d2);
        if (x > 0 && y < n - 1) relax(i, i + n - 1, d2);
      }
    }
  }

  let burnedCount = 0;
  const farValue = frameCount + 64;
  const data = new Float32Array(cells * 4);
  for (let idx = 0; idx < cells; idx++) {
    const a = Math.min(farValue, ext[idx]);
    data[idx * 4] = a;
    data[idx * 4 + 1] = burned[idx] ? extinction[idx] : a;
    data[idx * 4 + 2] = peak[idx];
    data[idx * 4 + 3] = burned[idx];
    burnedCount += burned[idx];
  }

  let texture: THREE.DataTexture;
  if (floatLinearSupported) {
    texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.FloatType);
  } else {
    const half = new Uint16Array(cells * 4);
    for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
    texture = new THREE.DataTexture(half, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  }
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;

  return { texture, burnedFraction: burnedCount / cells, frameCount };
}

function glslFloat(v: number): string {
  const s = String(v);
  return /[.e]/.test(s) ? s : `${s}.0`;
}

/**
 * GLSL: fire as a surface treatment of the solver field. Requires NOISE_GLSL, and these uniforms
 * declared by the host shader: uFieldTex0, uFieldTex1 (mipmapped), uFrameMix, uFireHist, uFireTime,
 * uWindDirUv, uExtentKm, uTime.
 *
 * What is data and what is rendering:
 *   data       where and when the field is above threshold (front position along the arrival
 *              level set, burned area, extinction), and how strong (z_hat drives radiance).
 *   rendering  the ragged sub-cell shape of the front (noise warp of at most a few hundred meters),
 *              flicker, ember speckle, ash mottling and the warm bounce light.
 */
export const FIRE_GLSL = /* glsl */ `
const float FIRE_THR = ${glslFloat(FIRE_THRESHOLD_NORM)};
const float FIRE_FIELD_TEXEL = ${glslFloat(1 / FIELD_GRID_SIZE)};

struct FireSurface {
  vec3 emission;   // HDR radiance emitted by flames and embers
  float burned;    // 0..1 char coverage of the ground
  float ash;       // 0..1 pale ash share inside the char
  float front;     // 0..1 flaming front coverage
  float glow;      // 0..1 smoldering bed activity
};

// Radiance of the flame body, t = 0 dull ember red, t = 1 bright amber. The display tone curve
// turns any strong radiance white, so the body is held at levels where it stays orange on screen
// (about sRGB 190 30 10, 250 115 35, 255 150 55 and 255 190 85 for the four stops).
vec3 fireRamp(float t) {
  vec3 c0 = vec3(0.45, 0.030, 0.003);
  vec3 c1 = vec3(1.05, 0.110, 0.008);
  vec3 c2 = vec3(1.40, 0.190, 0.013);
  vec3 c3 = vec3(2.00, 0.360, 0.024);
  return t < 0.33
    ? mix(c0, c1, t / 0.33)
    : (t < 0.66 ? mix(c1, c2, (t - 0.33) / 0.33) : mix(c2, c3, (t - 0.66) / 0.34));
}

// White-hot core of a flaming front: the only part of the scene above the bloom threshold
const vec3 FIRE_CORE = vec3(18.0, 6.5, 0.9);

float fireFieldNow(vec2 uv, out float zBracket) {
  float z0 = textureLod(uFieldTex0, uv, 0.0).r;
  float z1 = textureLod(uFieldTex1, uv, 0.0).r;
  zBracket = max(z0, z1);
  return mix(z0, z1, uFrameMix);
}

// Blurred fire power around a point, from the mip chain of the solver field.
float fireFieldBlur(vec2 uv, float lod) {
  return mix(textureLod(uFieldTex0, uv, lod).r, textureLod(uFieldTex1, uv, lod).r, uFrameMix);
}

FireSurface evalFireSurface(
  vec2 uv,
  vec2 pKm,
  float kmPerPx,
  vec3 normalW,
  float slopeMag,
  float fuel,
  float waterMask
) {
  FireSurface fs;
  fs.emission = vec3(0.0);
  fs.burned = 0.0;
  fs.ash = 0.0;
  fs.front = 0.0;
  fs.glow = 0.0;

  vec4 hist = texture2D(uFireHist, uv);
  float zBracket = 0.0;
  float zNow = fireFieldNow(uv, zBracket);

  // Nothing burned here yet and nothing is burning: leave the ground untouched.
  if (hist.a < 0.004 && zBracket < FIRE_THR * 0.5) {
    return fs;
  }

  // Arrival gradient gives the local spread direction and slowness (epochs per km).
  vec2 tx = vec2(FIRE_FIELD_TEXEL, 0.0);
  vec2 ty = vec2(0.0, FIRE_FIELD_TEXEL);
  float aE = texture2D(uFireHist, uv + tx).r;
  float aW = texture2D(uFireHist, uv - tx).r;
  float aN = texture2D(uFireHist, uv + ty).r;
  float aS = texture2D(uFireHist, uv - ty).r;
  vec2 gradKm = vec2(aE - aW, aN - aS) / (2.0 * FIRE_FIELD_TEXEL * uExtentKm);
  float gradLen = length(gradKm);
  float slowness = clamp(gradLen, 0.35, 5.0);
  vec2 spreadDir = gradLen > 1e-4 ? gradKm / gradLen : vec2(1.0, 0.0);

  // Noise domain aligned with the wind so tongues run downwind.
  vec2 windEN = normalize(uWindDirUv * uExtentKm + vec2(1e-5));
  vec2 q = vec2(dot(pKm, windEN) * 0.55, dot(pKm, vec2(-windEN.y, windEN.x)));
  vec2 drift = windEN * uTime * 0.006;

  // Uphill direction in (east, north). Fire runs upslope, so fingers lengthen there.
  vec2 uphillEN = vec2(-normalW.x, normalW.z);
  float upslope = clamp(dot(spreadDir, uphillEN) * 2.2, -1.0, 1.0) * clamp(slopeMag * 1.4, 0.0, 1.0);

  float lobes = fbm2(q * 1.35 + drift);
  float tongues = fbm2(q * 5.8 - drift * 3.0 + vec2(41.0, 13.0));
  vec3 cellA = worley2(q * 8.5 + vec2(3.1, 7.7));

  // Sub-cell raggedness in km: more with fuel and upslope runs, never more than about one cell.
  float ragKm = (0.16 + 0.26 * fuel) * (1.0 + 0.9 * max(upslope, 0.0)) * (1.0 - 0.35 * max(-upslope, 0.0));
  float warpKm = ((lobes - 0.5) * 1.1 + (tongues - 0.5) * 0.55 + (0.42 - cellA.x) * 0.38) * ragKm;
  // Fine crinkle that only resolves up close (about 40 m features, a few meters of displacement)
  warpKm += (valueNoise2(q * 26.0 + drift * 9.0) - 0.5) * 0.030;

  // Signed distance behind the front, km (positive on burned ground).
  float dKm = (uFireTime - hist.r) / slowness + warpKm;

  // Truthfulness gate: flame only where the solver field is above threshold in a bracketing epoch.
  float gate = smoothstep(FIRE_THR * 0.75, FIRE_THR * 1.20, zBracket) * (1.0 - waterMask);
  float power = clamp((zBracket - FIRE_THR) / 0.45, 0.0, 1.0);

  // --- Flaming front: a thin band right behind the level set -------------------------------
  float depthKm = 0.030 + 0.045 * power;
  float bandKm = max(depthKm, 1.25 * kmPerPx);
  float lead = smoothstep(-0.55 * bandKm, 0.0, dKm);
  float tail = exp(-max(dKm, 0.0) / (bandKm * 1.25));
  float breakup = smoothstep(0.18, 0.46, tongues + 0.35 * (cellA.z - 0.5) + 0.25 * fuel);
  float flicker = 0.70 + 0.60 * valueNoise2(q * 31.0 + vec2(uTime * 2.6, -uTime * 1.9));
  float front = lead * tail * gate * breakup;
  // Keep far fronts from gaining energy when the band is widened to stay visible.
  float energy = mix(1.0, sqrt(depthKm / bandKm), 0.55);
  float heat = clamp(0.38 + 0.62 * pow(power, 0.6), 0.0, 1.0) * flicker;
  // Orange body across the band, and a thin core along its leading edge. The core thins out
  // when the band has been widened to stay visible from far away.
  float core = smoothstep(0.58, 0.96, lead * tail) * (depthKm / bandKm);
  vec3 frontRgb = fireRamp(clamp(0.30 + 0.70 * heat, 0.0, 1.0)) * mix(1.0, energy, 0.5)
                + FIRE_CORE * core * (0.30 + 0.85 * heat * heat) * energy;

  // Flame body and ground glow hugging the front, a few flame depths wide, well below the core
  float fringe = exp(-abs(dKm) / (bandKm * 2.4 + 0.015)) * gate * (0.45 + 0.55 * breakup);
  vec3 fringeRgb = fireRamp(clamp(0.12 + 0.38 * heat, 0.0, 1.0)) * (0.60 + 0.45 * power) * fringe;

  // --- Ember bed: cooling, speckled, only while the solver field is still active here ------
  float stillActive = smoothstep(FIRE_THR * 0.45, FIRE_THR * 1.05, zNow) * (1.0 - waterMask);
  float bedKm = 0.16 + 0.50 * power;
  float bed = step(0.0, dKm) * exp(-max(dKm, 0.0) / bedKm) * stillActive;
  vec3 cellB = worley2(pKm * 21.0 + vec2(11.0, 5.0));
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.3 + 2.2 * cellB.z) + cellB.z * 40.0);
  float spots = smoothstep(0.46, 0.06, cellB.x) * smoothstep(0.30, 0.75, cellB.z + 0.45 * tongues);
  // Individual embers resolve only up close; from far away the bed is a faint dull glow
  float emberFade = smoothstep(2.5, 9.0, 0.045 / max(kmPerPx, 1e-6));
  float embers = bed * mix(0.10, spots * twinkle * 1.8, emberFade);
  vec3 emberRgb = fireRamp(clamp(0.04 + 0.50 * embers, 0.0, 1.0)) * (0.55 + 0.60 * power) * embers;

  fs.emission = frontRgb * front + (fringeRgb + emberRgb) * (1.0 - front);
  fs.front = front;
  fs.glow = bed;

  // --- Char and ash: everything the level set has already crossed --------------------------
  float crossed = smoothstep(-0.015, 0.05, dKm) * smoothstep(0.08, 0.55, hist.a);
  float severity = smoothstep(FIRE_THR, FIRE_THR + 0.34, hist.b);
  float mottle = fbm2(pKm * 7.5 + vec2(5.0, 19.0));
  float patchy = smoothstep(0.20, 0.62, mottle + 0.55 * severity);
  fs.burned = crossed * mix(0.50, 0.97, severity) * mix(0.72, 1.0, patchy) * (1.0 - waterMask);
  float ageEpochs = max(0.0, uFireTime - hist.r);
  float settled = smoothstep(0.4, 4.0, ageEpochs);
  // Ash settles in soft patches where fuel was heavy and the burn severe
  fs.ash = crossed * severity * fuel * settled
         * smoothstep(0.46, 0.86, fbm2(pKm * 4.6 + vec2(29.0, 3.0)) + 0.12 * (mottle - 0.5));

  return fs;
}

// Warm light from nearby flames on the surrounding ground and canyon walls.
// Returns irradiance in the HDR scene unit (multiply by albedo).
vec3 fireBounceLight(vec2 uv, vec3 normalW, float front) {
  // Cheap reject: nothing burning within a few kilometres
  if (fireFieldBlur(uv, 5.0) < 0.003) {
    return vec3(0.0);
  }
  // Two rings of taps on low mip levels. Rotated offsets hide the texel grid of the mip chain,
  // and the east-west and north-south differences of the same taps give the direction to the fire.
  const vec2 k1 = vec2(0.92388, 0.38268);
  const vec2 k2 = vec2(-0.38268, 0.92388);
  const vec2 k3 = vec2(0.70711, 0.70711);
  const vec2 k4 = vec2(-0.70711, 0.70711);
  float r1 = 2.6 * FIRE_FIELD_TEXEL;
  float r2 = 7.0 * FIRE_FIELD_TEXEL;
  float a1 = fireFieldBlur(uv + k1 * r1, 1.5);
  float a2 = fireFieldBlur(uv - k1 * r1, 1.5);
  float a3 = fireFieldBlur(uv + k2 * r1, 1.5);
  float a4 = fireFieldBlur(uv - k2 * r1, 1.5);
  float b1 = fireFieldBlur(uv + k3 * r2, 2.8);
  float b2 = fireFieldBlur(uv - k3 * r2, 2.8);
  float b3 = fireFieldBlur(uv + k4 * r2, 2.8);
  float b4 = fireFieldBlur(uv - k4 * r2, 2.8);
  float near = 0.25 * (a1 + a2 + a3 + a4);
  float wide = 0.25 * (b1 + b2 + b3 + b4);
  vec2 grad = (a1 - a2) * k1 + (a3 - a4) * k2 + 0.7 * ((b1 - b2) * k3 + (b3 - b4) * k4);
  // Toward the fire: east is +x, north is -z in world space
  vec3 toFire = normalize(vec3(grad.x, 0.30 * length(grad) + 0.01, -grad.y));
  float facing = 0.30 + 0.70 * max(0.0, dot(normalW, toFire));
  float amount = clamp(near * 1.05 + wide * 0.75, 0.0, 1.0);
  return vec3(1.0, 0.33, 0.06) * amount * amount * facing * 1.9 * (1.0 - front);
}
`;
