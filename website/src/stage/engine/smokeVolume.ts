import * as THREE from 'three';
import { Pass } from 'postprocessing';
import { FIELD_GRID_SIZE } from '../earthCutawayShaders';
import { FIRE_THRESHOLD_NORM } from './fireField';
import { buildSmokeNoiseTexture } from './smokeNoise';

/**
 * Volumetric smoke.
 *
 * Smoke is a rendering treatment of the harmonized fire field, not a retrieved product: it is
 * emitted only above cells whose z_hat is over the fire threshold, leans downwind with height,
 * creeps upslope near the ground, and is shaped by an advected 3D noise volume.
 *
 * Passes per frame:
 *   1. source   256 x 256   thresholded fire power of the current time, with a mip chain
 *   2. shadow   256 x 256   transmittance toward the sun at ground level (soft shadow on terrain)
 *   3. march    half res    front-to-back raymarch against scene depth, with a short light march
 *   4. composite full res   depth-aware upsample over the HDR scene (before bloom and tone mapping)
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
uniform float uFrameMix;
varying vec2 vUv;
void main() {
  float z = mix(textureLod(uField0, vUv, 0.0).r, textureLod(uField1, vUv, 0.0).r, uFrameMix);
  // Emission only where the solver field is above the fire threshold
  float s = max(0.0, z - ${FIRE_THRESHOLD_NORM.toFixed(4)}) / ${(1 - FIRE_THRESHOLD_NORM).toFixed(4)};
  gl_FragColor = vec4(clamp(s * 1.6, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

// Density model shared by the view march and the ground shadow pass.
const SMOKE_DENSITY_GLSL = /* glsl */ `
precision highp sampler3D;

uniform sampler2D uHeightPrev;
uniform sampler2D uHeightNext;
uniform float uMorph;
uniform sampler2D uSourceTex;
uniform sampler3D uNoiseTex;
uniform vec2 uSlabSize;
uniform float uSmokeTop;     // plume ceiling above the ground, world units
uniform vec2 uWindUv;        // unit downwind direction in slab uv
uniform float uShear;        // downwind lean, uv per world unit of height
uniform float uUpslope;      // upslope creep near the ground, uv per world unit of height
uniform float uTime;
uniform float uOpacity;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;

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

// Returns density. hn = height in the plume (0 ground, 1 ceiling), src = fire source feeding it.
float smokeDensity(vec3 p, float detailAmount, out float hn, out float src) {
  hn = 0.0;
  src = 0.0;
  vec2 uv = smokeUv(p);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  vec4 ground = smokeGround(uv);
  // First guess of the height in the plume from the smoothed surface under this point
  float h0 = p.y - ground.a;
  if (h0 < -0.6 || h0 > uSmokeTop + 1.0) return 0.0;
  float hc = clamp(h0, 0.0, uSmokeTop);
  vec2 uvSrc0 = uv - uWindUv * (uShear * hc * (1.0 + 1.3 * hc / uSmokeTop))
              - ground.yz * (uUpslope * min(hc, 0.45));
  // A plume rises from the elevation of its source and keeps the altitude it reached: it does
  // not follow the relief underneath it
  float h = p.y - smokeGround(uvSrc0).a;
  if (h < 0.0 || h > uSmokeTop) return 0.0;
  hn = h / uSmokeTop;

  // The plume axis leans downwind and bends over with height. Near the ground the smoke also
  // runs upslope, so what is seen at this point was emitted downslope and upwind of it.
  float lean = uShear * h * (1.0 + 1.3 * hn);
  vec2 uvSrc = uv - uWindUv * lean - ground.yz * (uUpslope * min(h, 0.45));
  src = textureLod(uSourceTex, uvSrc, 1.0 + 3.0 * hn).r;
  if (src < 0.002) return 0.0;
  // Fire power over a wider area sets how high this part of the plume rises (the cheaper
  // light march skips this fetch and assumes a tall column)
  float top = 0.85;
  if (detailAmount > 0.0) {
    float power = textureLod(uSourceTex, uvSrc, 4.0).r;
    top = mix(0.30, 1.0, smoothstep(0.004, 0.09, power));
  }
  // Thin near the ground so the fire line stays readable, fullest in the middle of the column
  float column = smoothstep(0.015, 0.26, hn) * (1.0 - smoothstep(top * 0.5, top, hn));
  float base = pow(src, 0.42) * column;

  // Billows: noise advected with the wind and rising with the plume. The noise domain is sheared
  // with the plume, so billows follow the bent column instead of standing upright.
  vec3 windW = vec3(uWindUv.x * uSlabSize.x, 0.0, -uWindUv.y * uSlabSize.y);
  vec3 q = (p - windW * lean) * 0.52
         - normalize(windW) * (uTime * 0.035) - vec3(0.0, uTime * 0.05, 0.0);
  float n = texture(uNoiseTex, q).r;
  float d = base - (1.0 - n) * (0.30 + 0.42 * hn);
  if (d <= 0.0) return 0.0;
  if (detailAmount > 0.0) {
    // Finer cellular noise eats into the edges of each billow
    float n2 = texture(uNoiseTex, q * 3.3 + vec3(0.37, uTime * 0.05, 0.11)).g;
    d -= (1.0 - n2) * 0.30 * detailAmount * (1.0 - smoothstep(0.0, 0.34, d));
    if (d <= 0.0) return 0.0;
  }
  // A firm edge: billows have a defined surface instead of fading out like haze
  float dens = smoothstep(0.0, 0.26, d) * (0.45 + 0.55 * column);
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
  // Leave the smoke layer in ten steps
  float reach = (uSmokeTop + 0.2) / max(sun.y, 0.12);
  float ds = reach / 10.0;
  float tau = 0.0;
  for (int i = 0; i < 10; i++) {
    float hn;
    float src;
    vec3 p = p0 + sun * (ds * (float(i) + 0.5));
    tau += smokeDensity(p, 0.0, hn, src) * ds;
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
uniform float uSigma;
uniform float uBoxTop;
uniform float uStepFine;  // march step inside a plume, world units
varying vec2 vUv;

const int MAX_STEPS = 72;

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

  if (tFar > tNear && uOpacity > 0.003) {
    vec3 sun = normalize(uSunDir);
    float cosT = dot(rd, sun);
    // Forward-peaked phase function blended with an isotropic term (multiple scattering)
    float phase = mix(1.0, min(3.0, hgRel(cosT, 0.6)), 0.45);
    vec3 sunColor = vec3(1.08, 0.99, 0.90) * 0.95;
    vec2 presenceShift = uWindUv * (uShear * uSmokeTop * 1.1);

    // Adaptive march: long steps through empty air, short steps where a plume can be
    float fine = uStepFine;
    float coarse = fine * 5.0;
    float t = tNear + fine * ign(gl_FragCoord.xy);
    bool wasCoarse = false;
    int fineLeft = 0;

    for (int i = 0; i < MAX_STEPS; i++) {
      if (t >= tFar || trans < 0.02) break;
      vec3 p = ro + rd * t;
      // A heavily blurred copy of the fire source tells whether any plume can be near this column
      float presence = textureLod(uSourceTex, smokeUv(p) - presenceShift, 5.5).r;
      bool empty = presence < 0.0012;
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
      float hn;
      float src;
      float d = smokeDensity(p, 1.0, hn, src);
      if (d > 0.002) {
        // Short march toward the sun for self-shadowing (coarse density, no detail noise)
        float tau = 0.0;
        float lh;
        float ls;
        float lj = 0.75 + 0.5 * fract(ign(gl_FragCoord.xy) * 7.31 + float(i) * 0.618);
        tau += smokeDensity(p + sun * (0.09 * lj), 0.0, lh, ls) * 0.18;
        tau += smokeDensity(p + sun * (0.36 * lj), 0.0, lh, ls) * 0.40;
        float sunT = exp(-tau * uSigma * 1.7);
        // Light that has scattered many times still gets through thick smoke
        float sunVis = mix(sunT, pow(sunT, 0.3), 0.30);

        // Brown and absorbing near the source, grey higher up
        vec3 albedo = mix(vec3(0.33, 0.29, 0.25), vec3(0.71, 0.70, 0.68), smoothstep(0.05, 0.65, hn));
        vec3 skyLight = mix(vec3(0.080, 0.086, 0.098), vec3(0.205, 0.220, 0.250), hn);
        vec3 light = sunColor * sunVis * phase + skyLight;
        // Warm light from the flames scattered inside the base of the column
        vec3 fireGlow = vec3(1.0, 0.36, 0.08) * src * exp(-hn * uSmokeTop * 10.0) * 1.9;

        float a = 1.0 - exp(-d * uSigma * stepLen);
        scatter += trans * a * (albedo * light + fireGlow);
        trans *= 1.0 - a;
        t += stepLen;
      } else {
        // Clear air inside a plume region: stride faster so the step budget reaches far smoke
        t += stepLen * 2.4;
      }
    }
  }
  gl_FragColor = vec4(scatter, trans);
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

export interface SmokeFrameInputs {
  camera: THREE.PerspectiveCamera;
  slabWidth: number;
  slabDepth: number;
  /** Highest terrain point in world units (the smoke box reaches the plume ceiling above it). */
  reliefTop: number;
  heightPrev: THREE.Texture;
  heightNext: THREE.Texture;
  morph: number;
  field0: THREE.Texture;
  field1: THREE.Texture;
  frameMix: number;
  windUv: THREE.Vector2;
  sunDir: THREE.Vector3;
  time: number;
  opacity: number;
  cutawayMix: number;
  cutawayPlane: number;
  cutawayDir: THREE.Vector2;
}

export class SmokePass extends Pass {
  /** Transmittance toward the sun at ground level (R). Sampled by the terrain shader. */
  public readonly shadowTarget: THREE.WebGLRenderTarget;

  private readonly sourceTarget: THREE.WebGLRenderTarget;
  private readonly smokeTarget: THREE.WebGLRenderTarget;
  private readonly noiseTexture: THREE.Data3DTexture;
  private readonly sourceMaterial: THREE.ShaderMaterial;
  private readonly shadowMaterial: THREE.ShaderMaterial;
  private readonly marchMaterial: THREE.ShaderMaterial;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly densityUniforms: Record<string, THREE.IUniform>;

  constructor() {
    super('SmokePass');
    this.needsDepthTexture = true;
    this.needsSwap = true;

    this.noiseTexture = buildSmokeNoiseTexture();

    this.sourceTarget = new THREE.WebGLRenderTarget(SMOKE_MAP_SIZE, SMOKE_MAP_SIZE, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
    });
    this.sourceTarget.texture.colorSpace = THREE.NoColorSpace;

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

    this.smokeTarget = new THREE.WebGLRenderTarget(2, 2, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });

    // Uniforms of the density model are shared by the shadow and march materials
    this.densityUniforms = {
      uHeightPrev: { value: null },
      uHeightNext: { value: null },
      uMorph: { value: 1.0 },
      uSourceTex: { value: this.sourceTarget.texture },
      uNoiseTex: { value: this.noiseTexture },
      uSlabSize: { value: new THREE.Vector2(14.8, 10.8) },
      uSmokeTop: { value: 1.7 },
      uWindUv: { value: new THREE.Vector2(0.7, 0.7) },
      uShear: { value: 0.07 },
      uUpslope: { value: 0.05 },
      uTime: { value: 0.0 },
      uOpacity: { value: 1.0 },
      uCutawayMix: { value: 0.0 },
      uCutawayPlane: { value: 0.0 },
      uCutawayDir: { value: new THREE.Vector2(1, 0) },
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
        uFrameMix: { value: 0.0 },
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
        uStepFine: { value: 0.075 },
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
    (this.compositeMaterial.uniforms.uHalfSize.value as THREE.Vector2).set(hw, hh);
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
    u.uOpacity.value = inputs.opacity;
    u.uCutawayMix.value = inputs.cutawayMix;
    u.uCutawayPlane.value = inputs.cutawayPlane;
    (u.uCutawayDir.value as THREE.Vector2).copy(inputs.cutawayDir);
    (u.uSunDir.value as THREE.Vector3).copy(inputs.sunDir);

    const s = this.sourceMaterial.uniforms;
    s.uField0.value = inputs.field0;
    s.uField1.value = inputs.field1;
    s.uFrameMix.value = inputs.frameMix;

    const m = this.marchMaterial.uniforms;
    const cam = inputs.camera;
    (m.uProjInv.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
    (m.uViewInv.value as THREE.Matrix4).copy(cam.matrixWorld);
    (m.uCameraPos.value as THREE.Vector3).setFromMatrixPosition(cam.matrixWorld);
    m.uBoxTop.value = inputs.reliefTop + (u.uSmokeTop.value as number) + 0.05;

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

    this.fullscreenMaterial = this.shadowMaterial;
    renderer.setRenderTarget(this.shadowTarget);
    renderer.render(scene, camera);

    this.fullscreenMaterial = this.marchMaterial;
    renderer.setRenderTarget(this.smokeTarget);
    renderer.render(scene, camera);

    this.compositeMaterial.uniforms.uSceneTex.value = inputBuffer.texture;
    this.fullscreenMaterial = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(scene, camera);
  }

  public override dispose(): void {
    this.sourceTarget.dispose();
    this.shadowTarget.dispose();
    this.smokeTarget.dispose();
    this.noiseTexture.dispose();
    this.sourceMaterial.dispose();
    this.shadowMaterial.dispose();
    this.marchMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
