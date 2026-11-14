import * as THREE from 'three';
import { Pass } from 'postprocessing';
import { FIELD_GRID_SIZE } from '../earthCutawayShaders';
import { FIRE_THRESHOLD_NORM } from './fireField';
import { buildSmokeNoiseTexture } from './smokeNoise';

/**
 * Volumetric smoke.
 *
 * Smoke is a rendering treatment of the harmonized fire field, not a retrieved product: it is
 * emitted only above cells whose z_hat is over the fire threshold. From there it follows a bent-over
 * plume: it rises as it drifts downwind, levels off at a height that grows with fire power,
 * thickens and thins out. An advected 3D noise volume shapes its billows.
 *
 * Passes per frame:
 *   1. source   256 x 256   thresholded fire power of the current time, with a mip chain
 *   2. plume    256 x 256   for every ground point, the smoke that drifted over it from upwind:
 *                           column mass, mean height and thickness (a Gaussian layer per column)
 *   3. shadow   256 x 256   transmittance toward the sun at ground level (soft shadow on terrain)
 *   4. march    half res    front-to-back raymarch against scene depth, with a short light march
 *   5. composite full res   depth-aware upsample over the HDR scene (before bloom and tone mapping)
 */

const SMOKE_MAP_SIZE = 256;
export const SMOKE_HEIGHT_TEX_SIZE = 256;

/**
 * Per-region texture the march reads terrain from. Half float, linear.
 *   R     terrain height in world units
 *   G, B  upslope direction in slab uv scaled by slope steepness (0..1), from the smoothed surface
 *   A     smoothed terrain height (about 1.5 km box blur): the elevation a plume rises from, so
 *         smoke keeps the altitude it reached instead of copying the relief underneath it
 */
export function buildSmokeHeightTexture(
  alignedDem: Float32Array,
  gridRes: number,
  toWorldY: (elevM: number) => number,
  slabWidth: number,
  slabDepth: number,
): THREE.DataTexture {
  const n = SMOKE_HEIGHT_TEX_SIZE;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const gy = Math.min(gridRes - 1, Math.round((j / (n - 1)) * (gridRes - 1)));
    for (let i = 0; i < n; i++) {
      const gx = Math.min(gridRes - 1, Math.round((i / (n - 1)) * (gridRes - 1)));
      heights[j * n + i] = toWorldY(alignedDem[gy * gridRes + gx]);
    }
  }
  // Separable box blur of the heights
  const radius = 5;
  const tmp = new Float32Array(n * n);
  const smooth = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += heights[j * n + Math.min(n - 1, Math.max(0, i + k))];
      tmp[j * n + i] = sum / (2 * radius + 1);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(n - 1, Math.max(0, j + k)) * n + i];
      smooth[j * n + i] = sum / (2 * radius + 1);
    }
  }
  const data = new Uint16Array(n * n * 4);
  const dx = slabWidth / (n - 1);
  const dz = slabDepth / (n - 1);
  for (let j = 0; j < n; j++) {
    const jm = Math.max(0, j - 2);
    const jp = Math.min(n - 1, j + 2);
    for (let i = 0; i < n; i++) {
      const im = Math.max(0, i - 2);
      const ip = Math.min(n - 1, i + 2);
      // Gradient in world units per world unit; +u is east, +v is north
      const gu = (smooth[j * n + ip] - smooth[j * n + im]) / ((ip - im) * dx);
      const gv = (smooth[jp * n + i] - smooth[jm * n + i]) / ((jp - jm) * dz);
      const slope = Math.hypot(gu, gv);
      const k = slope > 1e-5 ? Math.min(1, slope * 1.6) / slope : 0;
      const o = (j * n + i) * 4;
      data[o] = THREE.DataUtils.toHalfFloat(heights[j * n + i]);
      data[o + 1] = THREE.DataUtils.toHalfFloat(gu * k);
      data[o + 2] = THREE.DataUtils.toHalfFloat(gv * k);
      data[o + 3] = THREE.DataUtils.toHalfFloat(smooth[j * n + i]);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const SOURCE_FRAGMENT = /* glsl */ `
uniform sampler2D uField0;
uniform sampler2D uField1;
uniform sampler2D uDetection0;
uniform sampler2D uDetection1;
uniform float uRealSource;
uniform float uFrameMix;
varying vec2 vUv;
void main() {
  float z = mix(textureLod(uField0, vUv, 0.0).r, textureLod(uField1, vUv, 0.0).r, uFrameMix);
  // A real run: smoke rises where the satellites detected fire (see buildDetectionSource in
  // ./footprintField.ts), not where the model estimates it
  if (uRealSource > 0.5) {
    z = mix(textureLod(uDetection0, vUv, 0.0).r, textureLod(uDetection1, vUv, 0.0).r, uFrameMix);
  }
  // Emission only where the field is above the fire threshold
  float s = max(0.0, z - ${FIRE_THRESHOLD_NORM.toFixed(4)}) / ${(1 - FIRE_THRESHOLD_NORM).toFixed(4)};
  gl_FragColor = vec4(clamp(s * 1.6, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

// Plume map. A bent-over plume in a steady wind: smoke emitted at a point is found downwind of it,
// higher the further it has drifted (up to a final rise that grows with fire power) and in a layer
// that keeps thickening. This pass turns that around: for every ground point it walks upwind,
// collects what each source along the way contributes, and stores the result as one Gaussian
// layer: r column mass, g mean height above the smoothed ground here, b thickness (one sigma),
// a fire power of the strongest contributor. Shape only; where smoke starts comes from the field.
const PLUME_FRAGMENT = /* glsl */ `
uniform sampler2D uSourceTex;
uniform sampler2D uHeightPrev;
uniform sampler2D uHeightNext;
uniform float uMorph;
uniform vec2 uWindUv;
uniform float uSmokeTop;
uniform vec2 uSlabSize;
uniform vec4 uLid;
uniform float uLidAmount;
varying vec2 vUv;

const int TAPS = 26;
const float REACH = 0.40;        // how far downwind a plume is followed, slab uv
const float RISE_LENGTH = 0.07;  // downwind distance over which a plume reaches its final rise
const float SPREAD_LENGTH = 0.18;
const float FADE_LENGTH = 0.10;  // dilution and fallout
const float PLUME_GAIN = 44.0;

float smoothGround(vec2 uv) {
  float g = texture2D(uHeightNext, uv).a;
  if (uMorph < 0.999) g = mix(texture2D(uHeightPrev, uv).a, g, uMorph);
  return g;
}

void main() {
  float g0 = smoothGround(vUv);
  float m0 = 0.0;
  float m1 = 0.0;
  float m2 = 0.0;
  float strongest = 0.0;
  float sPrev = 0.0;
  for (int j = 0; j < TAPS; j++) {
    // Taps are dense near the point (fresh smoke changes fast) and sparse far upwind
    float s = REACH * pow((float(j) + 0.5) / float(TAPS), 1.7);
    float sNext = REACH * pow((float(j) + 1.0) / float(TAPS), 1.7);
    float ds = sNext - sPrev;
    sPrev = sNext;
    vec2 uvS = vUv - uWindUv * s;
    if (uvS.x < 0.0 || uvS.x > 1.0 || uvS.y < 0.0 || uvS.y > 1.0) continue;
    // A plume widens sideways as it drifts: older smoke comes from a wider stretch of the source
    // The plume is as wide as the stretch of front that burns, plus a modest sideways spread with
    // age (at most about half a slab unit). The lowest level already merges neighbouring fire
    // cells, so single cells do not rise as separate streaks.
    float src = textureLod(uSourceTex, uvS, 1.6 + 1.6 * sqrt(s / REACH)).r;
    if (src < 0.0004) continue;
    float power = textureLod(uSourceTex, uvS, 4.5).r;
    // Bent over from the first rise: the axis climbs at a shallow angle and levels off, and the
    // layer stays thin. Axis plus thickness never exceed the ceiling uSmokeTop.
    float rise = uSmokeTop * mix(0.24, 0.44, smoothstep(0.004, 0.10, power));
    float center = rise * (1.0 - exp(-s / RISE_LENGTH));
    float thick = uSmokeTop * (0.07 + 0.10 * (1.0 - exp(-s / SPREAD_LENGTH)));
    // Smoke climbs with rising ground and comes most of the way down with falling ground: it neither
    // runs into a slope nor stays hanging high over a valley
    float drop = smoothGround(uvS) - g0;
    float h = center + (drop > 0.0 ? 0.22 : 0.15) * drop;
    float c = src * ds * exp(-s / FADE_LENGTH);
    m0 += c;
    m1 += c * h;
    m2 += c * (h * h + thick * thick);
    strongest = max(strongest, power * exp(-s / FADE_LENGTH));
  }
  float mean = m0 > 1e-7 ? m1 / m0 : 0.0;
  float variance = m0 > 1e-7 ? max(m2 / m0 - mean * mean, 1e-4) : 1e-2;
  float sigma = sqrt(variance);
  // What ends up far above the ground under it is let go: a thin sheet alone in the sky reads as
  // a stray streak, not as smoke
  float mass = m0 * PLUME_GAIN * (1.0 - smoothstep(0.24, 0.48, mean));
  // The fire field ends at the edge of the region, and smoke that reached it would end there in a
  // straight cut. It thins out over the last stretch instead.
  mass *= smoothstep(0.0, 0.05, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  if (uLidAmount > 0.0) {
    // Under a lid the layer levels off lower and thinner, and carries less: the rise is capped,
    // the smoke is not cut
    vec2 xz = vec2((vUv.x - 0.5) * uSlabSize.x, (0.5 - vUv.y) * uSlabSize.y);
    float room = -(uLid.w + uLid.x * xz.x + uLid.z * xz.y) / max(uLid.y, 0.05) - g0;
    float k = clamp(0.8 * room / max(mean + 2.0 * sigma, 1e-3), 0.0, 1.0);
    k = mix(1.0, k, uLidAmount);
    mean *= k;
    sigma *= k;
    mass *= k;
  }
  gl_FragColor = vec4(mass, mean, sigma, strongest);
}
`;

// Density model shared by the view march and the ground shadow pass.
const SMOKE_DENSITY_GLSL = /* glsl */ `
precision highp sampler3D;

uniform sampler2D uHeightPrev;
uniform sampler2D uHeightNext;
uniform float uMorph;
uniform sampler2D uSourceTex;
uniform sampler2D uPlumeTex;   // column mass, mean height, thickness, fire power (see the plume pass)
uniform sampler3D uNoiseTex;
uniform vec2 uSlabSize;
uniform float uSmokeTop;     // plume ceiling above the ground, world units
uniform vec2 uWindUv;        // unit downwind direction in slab uv
uniform float uTime;
uniform float uOpacity;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;
uniform vec3 uClearCenter;   // the camera
uniform float uClearRadius;  // smoke within this distance of it is not drawn, 0 = off
uniform float uThinOverFire; // share of the smoke taken away right over its source, 0 = none
uniform vec4 uLid;           // plane the smoke stays under: dot(xyz, p) + w < 0
uniform float uLidAmount;    // 0 = no lid

vec2 smokeUv(vec3 p) {
  return vec2(p.x / uSlabSize.x + 0.5, 0.5 - p.z / uSlabSize.y);
}

vec4 smokeGround(vec2 uv) {
  vec4 g = texture2D(uHeightNext, uv);
  if (uMorph < 0.999) {
    g = mix(texture2D(uHeightPrev, uv), g, uMorph);
  }
  return g;
}

// Smoke belongs to the harmonized record, so the sensor curtain cuts it like the terrain layers
float smokeGate(vec2 uv) {
  float scanCoord = dot(uv - vec2(0.5), normalize(uCutawayDir)) - uCutawayPlane;
  return mix(1.0, smoothstep(-0.004, 0.012, -scanCoord), uCutawayMix);
}

// Returns density. detailAmount: 0 to 1 for the view march (share of the finest noise), below 0
// for light and shadow samples (the cheapest form). info = (height above the ground as a share of the ceiling, position inside the
// layer in sigmas with 0 at its middle, column mass, fire power feeding the column).
float smokeDensity(vec3 p, float detailAmount, out vec4 info) {
  info = vec4(0.0);
  vec2 uv = smokeUv(p);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  // Explicit level: inside the march loop the automatic level of detail is undefined, and the
  // plume map has a mip chain (the march reads level 4 on purpose to find where smoke can be)
  vec4 plume = textureLod(uPlumeTex, uv, 0.0);
  if (plume.r < 0.004) return 0.0;
  vec4 ground = smokeGround(uv);
  float h = p.y - ground.a;
  float sigma = max(plume.b, 0.06 * uSmokeTop);
  // Beyond 3.3 sigma of the layer's middle, plus the most the lumps can move it, there is nothing:
  // leave before any noise is read (most samples of a march end here)
  if (abs(h - plume.g) > 3.3 * sigma + 0.5 * (0.07 + sigma * 1.5)) return 0.0;

  // Billows: a noise volume that drifts with the wind and rises slowly. Two scales: fine lumps a
  // few hundred metres across, small against the ridges, and a slower variation several times
  // larger so the fine pattern does not repeat along a plume.
  vec3 windW = normalize(vec3(uWindUv.x * uSlabSize.x, 0.0, -uWindUv.y * uSlabSize.y));
  vec3 q = p * 2.3 - windW * (uTime * 0.06) - vec3(0.0, uTime * 0.04, 0.0);
  float n = texture(uNoiseTex, q).r;
  // The slow second scale is left out of the light and shadow samples (detailAmount below 0):
  // they only need to know roughly how much smoke lies toward the sun
  if (detailAmount >= 0.0) {
    n = 0.62 * n + 0.38 * texture(uNoiseTex, q * 0.37 + vec3(0.31, 0.17, 0.53)).r;
  }
  // Young smoke (still fed by strong fire close upwind) is lumpy and has holes; aged smoke is a
  // veil that only varies in strength and trails off, so nothing breaks away and hangs alone
  float young = smoothstep(0.004, 0.05, plume.a);
  // The lumps move the whole layer up and down, by more than its own thickness where it is thin
  float z = (h - plume.g - (n - 0.5) * (0.07 + sigma * 1.5)) / sigma;
  // A thin fresh layer is dense, an old thick one is thin: the same smoke in more air
  float base = min(1.4, plume.r * (0.20 * uSmokeTop / sigma)) * exp(-0.5 * z * z);
  if (base < 0.002) return 0.0;
  // Everything below is a share of the local density, so thin smoke is shaped like thick smoke
  // and no fixed threshold cuts it into islands
  float shape = mix(0.45, 1.30, smoothstep(0.28, 0.72, n));
  // The upper side is eaten into more than the underside (rising lumps, a flatter base)
  shape -= (1.0 - n) * mix(0.10, 0.55, young) * smoothstep(-1.0, 1.6, z);
  if (detailAmount > 0.0) {
    // Finer cellular noise eats into the edges of each billow
    float n2 = texture(uNoiseTex, q * 2.9 + vec3(0.37, uTime * 0.05, 0.11)).g;
    shape -= (1.0 - n2) * mix(0.12, 0.45, young) * detailAmount;
  }
  float d = base * shape;
  if (d <= 0.0) return 0.0;
  // Aged smoke is thin. A level sight line runs through it for kilometres, and at full strength
  // that adds up to a brown veil over everything behind it.
  float dens = d / (d + 0.10) * mix(0.38, 1.0, young);
  // No smoke close to the lens: a plume a few hundred metres from the camera is a blob across
  // the frame, not a plume
  // A real run by day: the smoke is thinned over the detections that feed it, so their light
  // reads through it. Illustrative: real smoke is thickest there.
  if (uThinOverFire > 0.0) {
    dens *= 1.0 - uThinOverFire * smoothstep(0.02, 0.22, textureLod(uSourceTex, uv, 2.2).r);
  }
  if (uClearRadius > 0.0) {
    dens *= smoothstep(uClearRadius * 0.6, uClearRadius, distance(p, uClearCenter));
  }
  if (uLidAmount > 0.0) {
    // The lid passes through the eye, so the fade is over an angle (about two degrees under it)
    float under = -(dot(uLid.xyz, p) + uLid.w) / max(distance(p, uClearCenter), 1e-3);
    dens *= mix(1.0, smoothstep(0.0, 0.05, under), uLidAmount);
  }
  // Smoke thins out where it meets the ground, so it does not end in a hard line on a slope
  // and the fire line under it stays readable
  dens *= smoothstep(0.004, 0.05, p.y - ground.x);
  info = vec4(clamp(h / uSmokeTop, 0.0, 1.0), z, plume.r, plume.a);
  return dens * smokeGate(uv) * uOpacity;
}
`;

const SHADOW_FRAGMENT = /* glsl */ `
${SMOKE_DENSITY_GLSL}
uniform vec3 uSunDir;
uniform float uSigma;
varying vec2 vUv;
void main() {
  vec4 ground = smokeGround(vUv);
  vec3 p0 = vec3((vUv.x - 0.5) * uSlabSize.x, ground.x, (0.5 - vUv.y) * uSlabSize.y);
  vec3 sun = normalize(uSunDir);
  // Leave the smoke layer in 24 steps, each texel starting at its own fraction of a step, so the
  // shadow of a thin layer is not a stack of copies of it
  float reach = (uSmokeTop + 0.2) / max(sun.y, 0.12);
  float ds = reach / 24.0;
  float offset = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float tau = 0.0;
  for (int i = 0; i < 24; i++) {
    vec4 info;
    vec3 p = p0 + sun * (ds * (float(i) + offset));
    tau += smokeDensity(p, -1.0, info) * ds;
  }
  gl_FragColor = vec4(exp(-tau * uSigma), 0.0, 0.0, 1.0);
}
`;

const MARCH_FRAGMENT = /* glsl */ `
${SMOKE_DENSITY_GLSL}
uniform sampler2D uDepthTex;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSigma;
uniform float uBoxTop;
uniform float uStepFine;  // march step inside a plume, world units
uniform sampler2D uHistoryTex;   // the march result of the previous frame
uniform mat4 uPrevViewProj;
uniform float uHistoryWeight;    // share of the previous result that is kept, 0 without history
uniform float uFrame;
uniform float uNight;          // 1 on a night overpass: moonlight, and the fire lights its own smoke
uniform float uFireLight;      // by night: 1 when the pass on show has detections of its own to light the smoke
uniform float uProxyY;           // height of the middle of the smoke layer, for reprojection
uniform vec2 uHalfSize;
varying vec2 vUv;

const int MAX_STEPS = 84;
const float SMOKE_PEAK_OPACITY = 0.62;

float hgRel(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1e-3, 1.0 + g2 - 2.0 * g * c), 1.5);
}

float ign(vec2 px) {
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 far4 = uProjInv * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize((uViewInv * vec4(normalize(far4.xyz / far4.w), 0.0)).xyz);
  vec3 ro = uCameraPos;

  float depth = texture2D(uDepthTex, vUv).r;
  float sceneDist = 1.0e6;
  if (depth < 0.99999) {
    vec4 sp = uProjInv * vec4(ndc, depth * 2.0 - 1.0, 1.0);
    sceneDist = length(sp.xyz / sp.w);
  }

  // Slab of air that can hold smoke
  vec3 bmin = vec3(-0.5 * uSlabSize.x, 0.0, -0.5 * uSlabSize.y);
  vec3 bmax = vec3(0.5 * uSlabSize.x, uBoxTop, 0.5 * uSlabSize.y);
  vec3 inv = 1.0 / (abs(rd) + 1e-6) * sign(rd + 1e-9);
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 tsm = min(t0, t1);
  vec3 tbg = max(t0, t1);
  float tNear = max(max(tsm.x, tsm.y), max(tsm.z, 0.0));
  float tFar = min(min(tbg.x, tbg.y), min(tbg.z, sceneDist));

  vec3 scatter = vec3(0.0);
  float trans = 1.0;

  // Nothing is drawn inside the cleared zone around the camera, so the march starts beyond it
  if (uClearRadius > 0.0) tNear = max(tNear, uClearRadius * 0.6);
  // The lid passes through the eye: a ray that leaves above it stays above it and meets no smoke
  bool underLid = uLidAmount < 0.999 || dot(uLid.xyz, rd) < 0.0;

  if (tFar > tNear && uOpacity > 0.003 && underLid) {
    vec3 sun = normalize(uSunDir);
    float cosT = dot(rd, sun);
    // Forward-peaked phase function blended with an isotropic term (multiple scattering)
    float phase = mix(1.0, min(3.0, hgRel(cosT, 0.6)), 0.45);
    // By night the key light is the moon: the same picture as the moonlit ground, far dimmer
    vec3 sunColor = uSunColor * 0.73 * mix(1.0, 0.045, uNight);

    // Adaptive march: long steps through empty air, short steps where a plume can be
    float fine = uStepFine;
    // The stride through empty air does not shrink with the fine step: clear air needs no detail
    float coarse = max(fine * 5.0, 0.375);
    // The start of the march moves by a different fraction of a step every frame; blended over
    // time (below) the slices of the march average out instead of showing as bands
    float jitter = ign(gl_FragCoord.xy + 5.588238 * mod(uFrame, 64.0));
    // The offset spans one whole step at this distance (steps grow with distance). With a shorter
    // offset the slices only blur, and from the overview they still show as ribs.
    float t = tNear + max(fine, tNear * 0.0068) * jitter;
    bool wasCoarse = false;
    int fineLeft = 0;
    // Length of the last stride through clear air inside a plume region, 0 after a normal step
    float strode = 0.0;

    for (int i = 0; i < MAX_STEPS; i++) {
      if (t >= tFar || trans < 0.02) break;
      vec3 p = ro + rd * t;
      // A blurred copy of the plume map tells whether any smoke can be near this column
      float presence = textureLod(uPlumeTex, smokeUv(p), 4.0).r;
      bool empty = presence < 0.0025;
      if (empty && fineLeft <= 0) {
        t += coarse;
        wasCoarse = true;
        continue;
      }
      if (wasCoarse && !empty) {
        // Entered a plume region with a long step: back up so its near edge is not skipped
        t -= coarse - fine;
        wasCoarse = false;
        fineLeft = 6;
        continue;
      }
      wasCoarse = false;
      fineLeft -= 1;

      float stepLen = max(fine, t * 0.0068);
      vec4 info;
      // Fine detail is dropped with distance, where it is finer than a march step and only adds grain
      float d = smokeDensity(p, 1.0 - smoothstep(5.0, 11.0, t), info);
      // Soft meeting with the terrain behind: the last stretch before the surface thins out, so a
      // peak that pokes through a plume does not cut it with a hard line
      d *= smoothstep(0.0, 0.12, sceneDist - t);
      if (d > 0.002 && strode > 0.0) {
        // A long stride landed inside smoke: go back to one normal step after the last clear
        // sample. Entering a layer at stride spacing would draw it in slices that no start
        // offset could hide.
        t -= strode - stepLen;
        strode = 0.0;
        continue;
      }
      if (d > 0.002) {
        float hn = info.x;
        // Short march toward the sun for self-shadowing (coarse density, no detail noise)
        float tau = 0.0;
        vec4 li;
        float lj = 0.75 + 0.5 * fract(jitter * 7.31 + float(i) * 0.618);
        if (d > 0.2) {
          tau += smokeDensity(p + sun * (0.05 * lj), -1.0, li) * 0.09;
          tau += smokeDensity(p + sun * (0.17 * lj), -1.0, li) * 0.17;
          tau += smokeDensity(p + sun * (0.42 * lj), -1.0, li) * 0.28;
        } else if (d > 0.07) {
          // Thin smoke adds little to the pixel and the veil of aged smoke covers a lot of ground:
          // one sample toward the sun stands for the three, and the thinnest smoke takes none
          tau = smokeDensity(p + sun * (0.17 * lj), -1.0, li) * 0.54;
        }
        float sunT = exp(-tau * uSigma * 1.5);
        // Light that has scattered many times still gets through thick smoke
        float sunVis = mix(sunT, pow(sunT, 0.3), 0.26);
        // Sky light comes from above: the share of the layer over this point shades it, so a
        // thick plume has a bright top and a dark underside
        float over = info.z / (1.0 + exp(1.7 * info.y));
        float skyVis = exp(-over * 1.9);

        // Brown and absorbing where it is young and dense, grey once it has aged and risen
        float aged = smoothstep(0.10, 0.75, hn) * (1.0 - 0.35 * smoothstep(0.02, 0.2, info.w) * (1.0 - smoothstep(0.1, 0.45, hn)));
        vec3 albedo = mix(vec3(0.30, 0.25, 0.20), vec3(0.64, 0.60, 0.545), aged);
        vec3 skyLight = vec3(0.152, 0.160, 0.176) * (0.50 + 0.50 * skyVis);
        // Light bounced up from the sunlit ground keeps undersides from going black
        skyLight += vec3(0.070, 0.066, 0.058) * (1.0 - skyVis);
        skyLight *= mix(1.0, 0.05, uNight);
        vec3 light = sunColor * sunVis * phase + skyLight;
        // Warm light from the fire scattered inside the base of the column. By night it is the main
        // light the smoke has: it reaches higher into the column and is read from a wider source.
        vec3 fireGlow = vec3(0.0);
        if (hn < mix(0.28, 0.72, uNight)) {
          float src = textureLod(uSourceTex, smokeUv(p), mix(1.5, 2.6, uNight)).r;
          // Smoke lingers from the pass before (see buildDetectionSource), but by night it is lit
          // only by detections that are on show: a pass that shows none leaves it dark
          fireGlow = vec3(1.0, 0.36, 0.08) * src * exp(-hn * uSmokeTop * mix(14.0, 4.6, uNight)) * mix(0.9, 2.1 * uFireLight, uNight);
        }

        float a = 1.0 - exp(-d * uSigma * stepLen);
        scatter += trans * a * (albedo * light + fireGlow);
        trans *= 1.0 - a;
        t += stepLen;
        strode = 0.0;
      } else {
        // Clear air inside a plume region: stride faster so the step budget reaches far smoke
        strode = stepLen * 2.4;
        t += strode;
      }
    }
  }
  // Even the thickest plume lets the ridge behind it show as a silhouette
  scatter *= SMOKE_PEAK_OPACITY;
  trans = 1.0 - SMOKE_PEAK_OPACITY * (1.0 - trans);
  vec4 result = vec4(scatter, trans);
  if (uHistoryWeight > 0.0) {
    // Where this ray crosses the middle of the smoke layer was on screen last frame at prevUv
    float tp = abs(rd.y) > 1e-4 ? (uProxyY - ro.y) / rd.y : tNear;
    tp = clamp(tp, tNear, max(tNear, tFar));
    vec4 clip = uPrevViewProj * vec4(ro + rd * tp, 1.0);
    vec2 prevUv = clip.xy / max(clip.w, 1e-5) * 0.5 + 0.5;
    if (clip.w > 0.0 && prevUv.x > 0.0 && prevUv.x < 1.0 && prevUv.y > 0.0 && prevUv.y < 1.0) {
      // Less history where the picture moves fast, so a moving camera does not leave trails
      float movedPx = length((prevUv - vUv) * uHalfSize);
      float keep = uHistoryWeight * (1.0 - 0.55 * smoothstep(1.0, 9.0, movedPx));
      result = mix(result, texture2D(uHistoryTex, prevUv), keep);
    }
  }
  gl_FragColor = result;
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D uSceneTex;
uniform sampler2D uSmokeTex;
uniform sampler2D uDepthTex;
uniform vec2 uHalfSize;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;

float viewDist(float depth) {
  return (uNear * uFar) / max(1e-6, uFar - depth * (uFar - uNear));
}

void main() {
  vec4 scene = texture2D(uSceneTex, vUv);
  // Most of the frame has no smoke near it: one filtered fetch settles those pixels
  vec4 quick = texture2D(uSmokeTex, vUv);
  if (quick.a > 0.9985 && quick.r + quick.g + quick.b < 0.0015) {
    gl_FragColor = scene;
    return;
  }
  float dC = viewDist(texture2D(uDepthTex, vUv).r);

  // Depth-aware upsample: a 3 x 3 neighborhood of half-res texels, weighted by distance and by
  // how close the depth their ray was marched against is to the depth of this pixel. The wider
  // footprint also averages out the per-pixel jitter of the march.
  vec2 hp = vUv * uHalfSize - 0.5;
  vec2 base = floor(hp + 0.5);
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 texel = clamp(base + vec2(float(i), float(j)), vec2(0.0), uHalfSize - 1.0);
      vec2 tuv = (texel + 0.5) / uHalfSize;
      float dH = viewDist(texture2D(uDepthTex, tuv).r);
      vec2 dpx = texel - hp;
      float ws = exp(-dot(dpx, dpx) * 0.85);
      float wd = 1.0 / (0.02 + abs(dH - dC) / max(dC, 1e-3) * 24.0);
      float w = max(1e-5, ws * wd);
      acc += texture2D(uSmokeTex, tuv) * w;
      wsum += w;
    }
  }
  vec4 smoke = acc / wsum;
  gl_FragColor = vec4(scene.rgb * smoke.a + smoke.rgb, scene.a);
}
`;

/** Highest a plume rises above the ground it starts from, world units (about 1 km at true scale). */
const SMOKE_CEILING = 0.62;

/** Share of the previous frame kept in the smoke buffer (about eight frames of averaging). */
const SMOKE_HISTORY_WEIGHT = 0.88;

export interface SmokeFrameInputs {
  camera: THREE.PerspectiveCamera;
  slabWidth: number;
  slabDepth: number;
  /** Highest terrain point in world units (the smoke box reaches the plume ceiling above it). */
  reliefTop: number;
  heightPrev: THREE.Texture;
  heightNext: THREE.Texture;
  morph: number;
  /**
   * Real runs only: where the satellites detected fire at the two epochs (red channel, 0..1 of the
   * field scale). When given, the smoke rises from these and not from the estimate in the fields.
   */
  detection0?: THREE.Texture | null;
  detection1?: THREE.Texture | null;
  field0: THREE.Texture;
  field1: THREE.Texture;
  frameMix: number;
  windUv: THREE.Vector2;
  sunDir: THREE.Vector3;
  /** Radiance of a white surface in full sun. */
  sunColor: THREE.Vector3;
  time: number;
  opacity: number;
  cutawayMix: number;
  cutawayPlane: number;
  cutawayDir: THREE.Vector2;
  /** Plane the smoke stays under (dot(xyz, p) + w < 0 is kept) and how much it applies, 0 to 1. */
  lid: THREE.Vector4;
  lidAmount: number;
  /** Smoke within this distance of the camera is not drawn, world units. */
  clearRadius: number;
  /** Share of the smoke taken away right over its source (0 = none). */
  thinOverFire: number;
  /** 1 on a night overpass: the smoke is lit by the moon and, from below, by the fire. */
  night?: number;
  /** By night: 1 when the pass on show has detections of its own to light the smoke, 0 when it has none. */
  fireLight?: number;
}

export class SmokePass extends Pass {
  /** Transmittance toward the sun at ground level (R). Sampled by the terrain shader. */
  public readonly shadowTarget: THREE.WebGLRenderTarget;

  private readonly sourceTarget: THREE.WebGLRenderTarget;
  private smokeTarget: THREE.WebGLRenderTarget;
  private historyTarget: THREE.WebGLRenderTarget;
  private historyValid = false;
  private frame = 0;
  private lastTime = -1;
  private readonly prevViewProj = new THREE.Matrix4();
  private readonly viewProj = new THREE.Matrix4();
  private readonly noiseTexture: THREE.Data3DTexture;
  private readonly plumeTarget: THREE.WebGLRenderTarget;
  private readonly sourceMaterial: THREE.ShaderMaterial;
  private readonly plumeMaterial: THREE.ShaderMaterial;
  private readonly shadowMaterial: THREE.ShaderMaterial;
  private readonly marchMaterial: THREE.ShaderMaterial;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly densityUniforms: Record<string, THREE.IUniform>;

  constructor() {
    super('SmokePass');
    this.needsDepthTexture = true;
    this.needsSwap = true;

    this.noiseTexture = buildSmokeNoiseTexture();

    // Half float: the density takes a root of small source values, and 8 bits there showed as
    // terraced rings inside the plumes
    this.sourceTarget = new THREE.WebGLRenderTarget(SMOKE_MAP_SIZE, SMOKE_MAP_SIZE, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
    });
    this.sourceTarget.texture.colorSpace = THREE.NoColorSpace;

    this.plumeTarget = new THREE.WebGLRenderTarget(SMOKE_MAP_SIZE, SMOKE_MAP_SIZE, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
    });
    this.plumeTarget.texture.colorSpace = THREE.NoColorSpace;

    this.shadowTarget = new THREE.WebGLRenderTarget(SMOKE_MAP_SIZE, SMOKE_MAP_SIZE, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.shadowTarget.texture.colorSpace = THREE.NoColorSpace;

    const marchTarget = () =>
      new THREE.WebGLRenderTarget(2, 2, {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
    // The march result and the result of the frame before it, swapped every frame
    this.smokeTarget = marchTarget();
    this.historyTarget = marchTarget();

    // Uniforms of the density model are shared by the shadow and march materials
    this.densityUniforms = {
      uHeightPrev: { value: null },
      uHeightNext: { value: null },
      uMorph: { value: 1.0 },
      uSourceTex: { value: this.sourceTarget.texture },
      uPlumeTex: { value: this.plumeTarget.texture },
      uNoiseTex: { value: this.noiseTexture },
      uSlabSize: { value: new THREE.Vector2(14.8, 10.8) },
      uSmokeTop: { value: SMOKE_CEILING },
      uWindUv: { value: new THREE.Vector2(0.7, 0.7) },
      uTime: { value: 0.0 },
      uOpacity: { value: 1.0 },
      uCutawayMix: { value: 0.0 },
      uCutawayPlane: { value: 0.0 },
      uCutawayDir: { value: new THREE.Vector2(1, 0) },
      uClearCenter: { value: new THREE.Vector3() },
      uClearRadius: { value: 0.0 },
      uThinOverFire: { value: 0.0 },
      uLid: { value: new THREE.Vector4(0, 1, 0, -1e4) },
      uLidAmount: { value: 0.0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSigma: { value: 4.6 },
    };

    const plain = { depthTest: false, depthWrite: false, toneMapped: false } as const;

    this.sourceMaterial = new THREE.ShaderMaterial({
      ...plain,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: SOURCE_FRAGMENT,
      uniforms: {
        uField0: { value: null },
        uField1: { value: null },
        uDetection0: { value: null },
        uDetection1: { value: null },
        uRealSource: { value: 0.0 },
        uFrameMix: { value: 0.0 },
      },
    });

    this.plumeMaterial = new THREE.ShaderMaterial({
      ...plain,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: PLUME_FRAGMENT,
      uniforms: {
        uSourceTex: this.densityUniforms.uSourceTex,
        uHeightPrev: this.densityUniforms.uHeightPrev,
        uHeightNext: this.densityUniforms.uHeightNext,
        uMorph: this.densityUniforms.uMorph,
        uWindUv: this.densityUniforms.uWindUv,
        uSmokeTop: this.densityUniforms.uSmokeTop,
        uSlabSize: this.densityUniforms.uSlabSize,
        uLid: this.densityUniforms.uLid,
        uLidAmount: this.densityUniforms.uLidAmount,
      },
    });

    this.shadowMaterial = new THREE.ShaderMaterial({
      ...plain,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: SHADOW_FRAGMENT,
      uniforms: this.densityUniforms,
    });

    this.marchMaterial = new THREE.ShaderMaterial({
      ...plain,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: MARCH_FRAGMENT,
      uniforms: {
        ...this.densityUniforms,
        uDepthTex: { value: null },
        uProjInv: { value: new THREE.Matrix4() },
        uViewInv: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uBoxTop: { value: 4.0 },
        uSunColor: { value: new THREE.Vector3(1.4, 1.29, 1.17) },
        uNight: { value: 0.0 },
        uFireLight: { value: 1.0 },
        uStepFine: { value: 0.075 },
        uHistoryTex: { value: null },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uHistoryWeight: { value: 0.0 },
        uFrame: { value: 0.0 },
        uProxyY: { value: 1.0 },
        uHalfSize: { value: new THREE.Vector2(2, 2) },
      },
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      ...plain,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      uniforms: {
        uSceneTex: { value: null },
        uSmokeTex: { value: this.smokeTarget.texture },
        uDepthTex: { value: null },
        uHalfSize: { value: new THREE.Vector2(2, 2) },
        uNear: { value: 0.1 },
        uFar: { value: 100.0 },
      },
    });

    this.fullscreenMaterial = this.compositeMaterial;
  }

  /** Grid size the fire source is resolved at (the solver field grid). */
  public static readonly sourceGrid = FIELD_GRID_SIZE;

  public override setDepthTexture(depthTexture: THREE.Texture | null): void {
    this.marchMaterial.uniforms.uDepthTex.value = depthTexture;
    this.compositeMaterial.uniforms.uDepthTex.value = depthTexture;
  }

  public override setSize(width: number, height: number): void {
    const hw = Math.max(2, Math.ceil(width / 2));
    const hh = Math.max(2, Math.ceil(height / 2));
    this.smokeTarget.setSize(hw, hh);
    this.historyTarget.setSize(hw, hh);
    this.historyValid = false;
    (this.compositeMaterial.uniforms.uHalfSize.value as THREE.Vector2).set(hw, hh);
    (this.marchMaterial.uniforms.uHalfSize.value as THREE.Vector2).set(hw, hh);
  }

  /** Call once per frame before the composer renders. */
  public update(inputs: SmokeFrameInputs): void {
    const u = this.densityUniforms;
    u.uHeightPrev.value = inputs.heightPrev;
    u.uHeightNext.value = inputs.heightNext;
    u.uMorph.value = inputs.morph;
    (u.uSlabSize.value as THREE.Vector2).set(inputs.slabWidth, inputs.slabDepth);
    (u.uWindUv.value as THREE.Vector2).copy(inputs.windUv).normalize();
    u.uTime.value = inputs.time;
    (u.uLid.value as THREE.Vector4).copy(inputs.lid);
    u.uLidAmount.value = inputs.lidAmount;
    (u.uClearCenter.value as THREE.Vector3).setFromMatrixPosition(inputs.camera.matrixWorld);
    u.uClearRadius.value = inputs.clearRadius;
    u.uThinOverFire.value = inputs.thinOverFire;
    u.uOpacity.value = inputs.opacity;
    u.uCutawayMix.value = inputs.cutawayMix;
    u.uCutawayPlane.value = inputs.cutawayPlane;
    (u.uCutawayDir.value as THREE.Vector2).copy(inputs.cutawayDir);
    (u.uSunDir.value as THREE.Vector3).copy(inputs.sunDir);

    const s = this.sourceMaterial.uniforms;
    s.uField0.value = inputs.field0;
    s.uField1.value = inputs.field1;
    s.uDetection0.value = inputs.detection0 ?? inputs.field0;
    s.uDetection1.value = inputs.detection1 ?? inputs.field1;
    s.uRealSource.value = inputs.detection0 && inputs.detection1 ? 1.0 : 0.0;
    s.uFrameMix.value = inputs.frameMix;

    const m = this.marchMaterial.uniforms;
    const cam = inputs.camera;
    (m.uProjInv.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
    (m.uViewInv.value as THREE.Matrix4).copy(cam.matrixWorld);
    (m.uCameraPos.value as THREE.Vector3).setFromMatrixPosition(cam.matrixWorld);
    (m.uSunColor.value as THREE.Vector3).copy(inputs.sunColor);
    m.uNight.value = inputs.night ?? 0.0;
    m.uFireLight.value = inputs.fireLight ?? 1.0;
    m.uBoxTop.value = inputs.reliefTop + (u.uSmokeTop.value as number) + 0.05;
    m.uProxyY.value = 0.5 * (inputs.reliefTop + (u.uSmokeTop.value as number));

    // Blend over time: the previous result is found again through last frame's view. A gap in
    // rendering (the pass was off, or the tab was hidden) starts the history afresh.
    if (this.lastTime < 0 || inputs.time - this.lastTime > 0.25 || inputs.time < this.lastTime) {
      this.historyValid = false;
    }
    this.lastTime = inputs.time;
    (m.uPrevViewProj.value as THREE.Matrix4).copy(this.prevViewProj);
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.prevViewProj.copy(this.viewProj);
    m.uHistoryWeight.value = this.historyValid ? SMOKE_HISTORY_WEIGHT : 0.0;
    m.uFrame.value = this.frame;
    this.frame = (this.frame + 1) % 4096;

    const c = this.compositeMaterial.uniforms;
    c.uNear.value = cam.near;
    c.uFar.value = cam.far;
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget,
  ): void {
    const scene = this.scene;
    const camera = this.camera;

    this.fullscreenMaterial = this.sourceMaterial;
    renderer.setRenderTarget(this.sourceTarget);
    renderer.render(scene, camera);

    this.fullscreenMaterial = this.plumeMaterial;
    renderer.setRenderTarget(this.plumeTarget);
    renderer.render(scene, camera);

    this.fullscreenMaterial = this.shadowMaterial;
    renderer.setRenderTarget(this.shadowTarget);
    renderer.render(scene, camera);

    // March into one target while reading the other as history, then swap their roles
    const previous = this.smokeTarget;
    this.smokeTarget = this.historyTarget;
    this.historyTarget = previous;
    this.marchMaterial.uniforms.uHistoryTex.value = this.historyTarget.texture;
    this.fullscreenMaterial = this.marchMaterial;
    renderer.setRenderTarget(this.smokeTarget);
    renderer.render(scene, camera);
    this.historyValid = true;

    this.compositeMaterial.uniforms.uSmokeTex.value = this.smokeTarget.texture;
    this.compositeMaterial.uniforms.uSceneTex.value = inputBuffer.texture;
    this.fullscreenMaterial = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(scene, camera);
  }

  public override dispose(): void {
    this.sourceTarget.dispose();
    this.plumeTarget.dispose();
    this.shadowTarget.dispose();
    this.smokeTarget.dispose();
    this.historyTarget.dispose();
    this.noiseTexture.dispose();
    this.sourceMaterial.dispose();
    this.plumeMaterial.dispose();
    this.shadowMaterial.dispose();
    this.marchMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
