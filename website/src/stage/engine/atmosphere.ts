import * as THREE from 'three';

/**
 * Rayleigh and Mie atmosphere for the stage: sky, horizon and aerial perspective from one sun.
 *
 * The stage is a miniature with exaggerated relief, so every position and direction is first
 * mapped back to true scale (kilometres, relief not exaggerated) and the physics runs there:
 *
 *   transmittance   precomputed once on the CPU into a small lookup texture
 *                   (altitude x cosine of the zenith angle, to the top of the atmosphere)
 *   sky             single scattering marched along the view ray with the sun transmittance from
 *                   the lookup texture, plus an approximation of multiple scattering,
 *                   rendered each frame into a small sky-view texture (azimuth x elevation)
 *   ground haze     closed-form aerial perspective between the camera and a surface point,
 *                   used by the terrain and by the floor around the slab
 *
 * Coefficients are the usual clear-sky values (Bruneton and Neyret 2008, Hillaire 2020).
 * Radiance is in the stage's HDR unit: a white Lambert surface in full sun reads about 1.3.
 */

const GROUND_RADIUS_KM = 6360.0;
const ATMOSPHERE_HEIGHT_KM = 60.0;
const RAYLEIGH_SCALE_KM = 8.0;
const MIE_SCALE_KM = 1.2;
const RAYLEIGH_BETA = [5.802e-3, 13.558e-3, 33.1e-3] as const; // per km
const MIE_BETA_SCATTER = 3.996e-3;
const MIE_BETA_EXTINCT = 4.44e-3;
const OZONE_BETA = [0.65e-3, 1.881e-3, 0.085e-3] as const;
const MIE_G = 0.8;

const LUT_W = 64; // cosine of the zenith angle, from LUT_MU_MIN to 1
const LUT_H = 32; // altitude, 0 to the top of the atmosphere
const LUT_MU_MIN = -0.2;

const SKY_VIEW_W = 192;
const SKY_VIEW_H = 108;

/** Sun irradiance above the atmosphere in stage units (about 4.1 reaches the ground at noon). */
export const SUN_IRRADIANCE_TOA: readonly [number, number, number] = [5.25, 5.05, 4.8];

/**
 * Display choices, not physics.
 *
 * HAZE_STRENGTH: share of the physical air path that is drawn between the camera and the ground.
 * The true path is 20 to 60 km from the stage cameras, which would wash the terrain out.
 *
 * SKY_EXPOSURE: the sky is rendered physically and then darkened like a graded film sky, so the
 * interface type that sits on the canvas stays readable. Clean feed and cinema show more of it.
 */
export const HAZE_STRENGTH = 0.4;
export const SKY_EXPOSURE_INTERFACE = 0.4;
export const SKY_EXPOSURE_CLEAN = 0.72;

function ozoneDensity(hKm: number): number {
  return Math.max(0, 1 - Math.abs(hKm - 25.0) / 15.0);
}

/** Optical depth (per channel) from altitude h along a ray with zenith cosine mu to space. */
function opticalDepthToSpace(hKm: number, mu: number): [number, number, number] {
  const r = GROUND_RADIUS_KM + hKm;
  const rt = GROUND_RADIUS_KM + ATMOSPHERE_HEIGHT_KM;
  const disc = r * r * (mu * mu - 1) + rt * rt;
  const dist = Math.max(0, -r * mu + Math.sqrt(Math.max(0, disc)));
  const steps = 48;
  const ds = dist / steps;
  let rayleigh = 0;
  let mie = 0;
  let ozone = 0;
  for (let i = 0; i < steps; i++) {
    const s = (i + 0.5) * ds;
    const h = Math.max(0, Math.sqrt(r * r + s * s + 2 * r * s * mu) - GROUND_RADIUS_KM);
    rayleigh += Math.exp(-h / RAYLEIGH_SCALE_KM) * ds;
    mie += Math.exp(-h / MIE_SCALE_KM) * ds;
    ozone += ozoneDensity(h) * ds;
  }
  return [
    RAYLEIGH_BETA[0] * rayleigh + MIE_BETA_EXTINCT * mie + OZONE_BETA[0] * ozone,
    RAYLEIGH_BETA[1] * rayleigh + MIE_BETA_EXTINCT * mie + OZONE_BETA[1] * ozone,
    RAYLEIGH_BETA[2] * rayleigh + MIE_BETA_EXTINCT * mie + OZONE_BETA[2] * ozone,
  ];
}

/** Transmittance from altitude h toward the sun (zenith cosine mu) to space. */
export function sunTransmittance(hKm: number, mu: number): [number, number, number] {
  const tau = opticalDepthToSpace(Math.max(0, hKm), Math.max(LUT_MU_MIN, mu));
  return [Math.exp(-tau[0]), Math.exp(-tau[1]), Math.exp(-tau[2])];
}

/**
 * Radiance of a white Lambert surface in full sun at altitude h, in stage units. Half of the
 * physical tint is kept: the imagery already carries the color of its own sunlight.
 */
export function sunLightColor(hKm: number, sunElevationSin: number, out: THREE.Vector3): THREE.Vector3 {
  const t = sunTransmittance(hKm, sunElevationSin);
  const legacy = [1.404, 1.287, 1.17];
  return out.set(
    0.5 * legacy[0] + (0.5 * SUN_IRRADIANCE_TOA[0] * t[0]) / Math.PI,
    0.5 * legacy[1] + (0.5 * SUN_IRRADIANCE_TOA[1] * t[1]) / Math.PI,
    0.5 * legacy[2] + (0.5 * SUN_IRRADIANCE_TOA[2] * t[2]) / Math.PI,
  );
}

function buildTransmittanceTexture(): THREE.DataTexture {
  const data = new Uint16Array(LUT_W * LUT_H * 4);
  for (let j = 0; j < LUT_H; j++) {
    // Altitude is spaced quadratically: more rows near the ground
    const hn = j / (LUT_H - 1);
    const hKm = hn * hn * ATMOSPHERE_HEIGHT_KM;
    for (let i = 0; i < LUT_W; i++) {
      const mu = LUT_MU_MIN + (i / (LUT_W - 1)) * (1 - LUT_MU_MIN);
      const tau = opticalDepthToSpace(hKm, mu);
      const o = (j * LUT_W + i) * 4;
      data[o] = THREE.DataUtils.toHalfFloat(Math.exp(-tau[0]));
      data[o + 1] = THREE.DataUtils.toHalfFloat(Math.exp(-tau[1]));
      data[o + 2] = THREE.DataUtils.toHalfFloat(Math.exp(-tau[2]));
      data[o + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const tex = new THREE.DataTexture(data, LUT_W, LUT_H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function f(n: number): string {
  const s = n.toPrecision(8);
  return /[.e]/.test(s) ? s : `${s}.0`;
}

/** GLSL shared by the sky and the terrain: constants, phase functions, aerial perspective. */
export const ATMOSPHERE_GLSL = /* glsl */ `
const float ATM_RG = ${f(GROUND_RADIUS_KM)};
const float ATM_TOP = ${f(ATMOSPHERE_HEIGHT_KM)};
const float ATM_HR = ${f(RAYLEIGH_SCALE_KM)};
const float ATM_HM = ${f(MIE_SCALE_KM)};
const vec3 ATM_BETA_R = vec3(${f(RAYLEIGH_BETA[0])}, ${f(RAYLEIGH_BETA[1])}, ${f(RAYLEIGH_BETA[2])});
const float ATM_BETA_MS = ${f(MIE_BETA_SCATTER)};
const float ATM_BETA_ME = ${f(MIE_BETA_EXTINCT)};
const vec3 ATM_BETA_O = vec3(${f(OZONE_BETA[0])}, ${f(OZONE_BETA[1])}, ${f(OZONE_BETA[2])});
const vec3 ATM_SUN = vec3(${f(SUN_IRRADIANCE_TOA[0])}, ${f(SUN_IRRADIANCE_TOA[1])}, ${f(SUN_IRRADIANCE_TOA[2])});
const float ATM_PI = 3.14159265;
// Multiple scattering, approximated: an isotropic share on top of the phase function, larger
// where the air scatters more (blue), and part of the light scattered out of a path counted as
// returning to it. Without this a single-scattering horizon turns yellow-green.
const vec3 ATM_MS = vec3(0.020, 0.030, 0.055);
const vec3 ATM_RETURN = vec3(0.92, 0.82, 0.62);

float atmRayleighPhase(float c) {
  return 3.0 / (16.0 * ATM_PI) * (1.0 + c * c);
}

float atmMiePhase(float c) {
  const float g = ${f(MIE_G)};
  float g2 = g * g;
  return 3.0 / (8.0 * ATM_PI) * ((1.0 - g2) * (1.0 + c * c))
       / ((2.0 + g2) * pow(max(1e-4, 1.0 + g2 - 2.0 * g * c), 1.5));
}

// Optical depth of a straight segment of length distKm between altitudes h0 and h1 (km), for an
// exponential layer of scale height H. Exact when altitude changes linearly along the segment.
float atmLayerDepth(float h0, float h1, float distKm, float H) {
  float dh = h1 - h0;
  float e0 = exp(-max(h0, 0.0) / H);
  float e1 = exp(-max(h1, 0.0) / H);
  return distKm * (abs(dh) < 0.02 ? e0 : H * (e0 - e1) / dh);
}

// Aerial perspective between the camera and a surface point (true scale, km).
// Returns the transmittance of the segment; inscatter receives the light scattered into it.
vec3 atmAerialPerspective(
  float camAltKm, float pointAltKm, float distKm, float cosSun, vec3 sunTrans, out vec3 inscatter
) {
  float dR = atmLayerDepth(camAltKm, pointAltKm, distKm, ATM_HR);
  float dM = atmLayerDepth(camAltKm, pointAltKm, distKm, ATM_HM);
  vec3 tauR = ATM_BETA_R * dR;
  float tauM = ATM_BETA_ME * dM;
  vec3 trans = exp(-(tauR + vec3(tauM)));
  // Single scattering with the sun transmittance held at its value for the segment, plus the
  // multiple scattering approximation
  vec3 source = ATM_BETA_R * dR * (vec3(atmRayleighPhase(cosSun)) + ATM_MS)
              + vec3(ATM_BETA_MS * dM) * (atmMiePhase(cosSun) + 0.02);
  vec3 tauEff = max((tauR + vec3(tauM)) * ATM_RETURN, vec3(1e-6));
  inscatter = ATM_SUN * sunTrans * source * (1.0 - exp(-tauEff)) / tauEff;
  return trans;
}
`;

/**
 * Night. A real run plays real overpasses, and about two thirds of the VIIRS detections of these
 * fires were made at night. On a night overpass everything that is not emitted light is drawn as
 * under moonlight: the daylight picture mostly drained of colour, about a sixth as bright, and
 * blue. It is a grade of the day picture (the moon is not modelled, and its phase on the night of
 * the overpass is not used), so relief, haze and horizon stay exactly where they are by day.
 */
export const NIGHT_GLSL = /* glsl */ `
uniform float uNight; // 0 by day, 1 on a night overpass of a real run
vec3 nightGrade(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Relief keeps its contrast up to the brightness of ordinary ground. Anything brighter (bare
  // rock, snow, a quarry, glint on water) is held just above that, so no ground the moon lights
  // is brighter than the dimmest fire light.
  float held = l < 0.22 ? l : 0.22 + 0.06 * (1.0 - exp(-(l - 0.22) / 0.06));
  held *= mix(1.0, 0.7, smoothstep(0.45, 0.9, l));
  vec3 moon = mix(vec3(l), c, 0.3) * (held / max(l, 1e-4)) * vec3(0.150, 0.215, 0.352);
  return mix(c, moon, uNight);
}
`;

const TRANSMITTANCE_LOOKUP_GLSL = /* glsl */ `
uniform sampler2D uTransmittanceLut;

vec3 atmTransmittanceToSpace(float hKm, float mu) {
  float u = (clamp(mu, ${f(LUT_MU_MIN)}, 1.0) - (${f(LUT_MU_MIN)})) / ${f(1 - LUT_MU_MIN)};
  float v = sqrt(clamp(hKm / ATM_TOP, 0.0, 1.0));
  vec2 uv = vec2(u * ${f((LUT_W - 1) / LUT_W)} + ${f(0.5 / LUT_W)}, v * ${f((LUT_H - 1) / LUT_H)} + ${f(0.5 / LUT_H)});
  return texture2D(uTransmittanceLut, uv).rgb;
}
`;

// Sky-view texture: u = azimuth from the sun (0..1 around), v = sqrt of the angle above the
// horizon over its full range, which puts most rows near the horizon where the sky changes fastest.
export const SKY_VIEW_MAPPING_GLSL = /* glsl */ `
float atmHorizonAngle(float camAltKm) {
  float r = ATM_RG + camAltKm;
  return acos(-sqrt(max(0.0, 1.0 - (ATM_RG * ATM_RG) / (r * r))));
}

// What the backdrop shows in a true-scale direction (without the sun disc): sky above the horizon
// and the floor below it. The dome draws this, and the terrain dissolves its far edge into it.
//
// The floor is a backdrop, not data. With the interface on it stays dark when seen from above
// (floorHaze is a fraction of the physical air path); in clean feed it reads as distant ground
// under the air path. It always fades out completely within the last two degrees, so it meets the
// sky at the horizon without a step.
vec3 atmBackdrop(
  sampler2D skyView, vec3 dir, vec3 sun, float camAlt, float exposure, vec3 floorColor, float floorHaze
) {
  float thetaH = atmHorizonAngle(camAlt);
  float theta = acos(clamp(dir.y, -1.0, 1.0));
  float above = max(thetaH - theta, 0.0);
  float phi = atan(dir.z, dir.x) - atan(sun.z, sun.x);
  // Below the horizon this reads the horizon row, which is the color the floor fades into
  vec3 sky = texture2D(skyView, vec2(phi / (2.0 * ATM_PI), sqrt(above / thetaH))).rgb * exposure;
  if (theta < thetaH) {
    return sky;
  }
  float r = ATM_RG + camAlt;
  float mu = dir.y;
  float distKm = -r * mu - sqrt(max(0.0, r * r * (mu * mu - 1.0) + ATM_RG * ATM_RG));
  vec3 unused;
  vec3 trans = atmAerialPerspective(camAlt, 0.0, distKm * floorHaze, dot(dir, sun), vec3(1.0), unused);
  float clear = trans.g * smoothstep(0.0, 0.035, theta - thetaH);
  return mix(sky, floorColor, clear);
}
`;

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const SKY_VIEW_FRAGMENT = /* glsl */ `
${ATMOSPHERE_GLSL}
${TRANSMITTANCE_LOOKUP_GLSL}
${SKY_VIEW_MAPPING_GLSL}

uniform float uSunSin;   // sine of the sun elevation
uniform float uCamAltKm;
varying vec2 vUv;

void main() {
  float camAlt = clamp(uCamAltKm, 0.02, ATM_TOP - 1.0);
  float thetaH = atmHorizonAngle(camAlt);
  float theta = thetaH - vUv.y * vUv.y * thetaH;
  float phi = vUv.x * 2.0 * ATM_PI;
  vec3 dir = vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
  vec3 sun = vec3(sqrt(max(0.0, 1.0 - uSunSin * uSunSin)), uSunSin, 0.0);

  float r = ATM_RG + camAlt;
  float mu = dir.y;
  float rt = ATM_RG + ATM_TOP;
  float dist = -r * mu + sqrt(max(0.0, r * r * (mu * mu - 1.0) + rt * rt));
  float cosSun = dot(dir, sun);
  float phaseR = atmRayleighPhase(cosSun);
  float phaseM = atmMiePhase(cosSun);

  const int STEPS = 24;
  vec3 radiance = vec3(0.0);
  vec3 tau = vec3(0.0);
  float prev = 0.0;
  for (int i = 0; i < STEPS; i++) {
    // Samples are denser near the camera, where the air is thickest
    float s1 = float(i + 1) / float(STEPS);
    float t1 = dist * s1 * s1;
    float ds = t1 - prev;
    float t = prev + 0.5 * ds;
    prev = t1;
    vec3 p = vec3(0.0, r, 0.0) + dir * t;
    float pr = length(p);
    float h = max(0.0, pr - ATM_RG);
    float rhoR = exp(-h / ATM_HR);
    float rhoM = exp(-h / ATM_HM);
    float rhoO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
    vec3 dTau = (ATM_BETA_R * rhoR + vec3(ATM_BETA_ME * rhoM) + ATM_BETA_O * rhoO) * ds;
    vec3 transCam = exp(-(tau + 0.5 * dTau) * ATM_RETURN);
    vec3 transSun = atmTransmittanceToSpace(h, dot(p, sun) / pr);
    vec3 scatter = ATM_BETA_R * rhoR * (vec3(phaseR) + ATM_MS) + vec3(ATM_BETA_MS * rhoM) * (phaseM + 0.02);
    radiance += transCam * transSun * scatter * ds;
    tau += dTau;
  }
  gl_FragColor = vec4(radiance * ATM_SUN, 1.0);
}
`;

export const SKY_DOME_VERTEX_SHADER = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/**
 * Sky dome. Above the horizon: the sky-view texture and the sun disc. Below it: the dark studio
 * floor the slab stands on, fading into the horizon color with distance so close views get a real
 * horizon while the overview keeps its calm backdrop.
 */
export const SKY_DOME_FRAGMENT_SHADER = /* glsl */ `
${ATMOSPHERE_GLSL}
${TRANSMITTANCE_LOOKUP_GLSL}
${SKY_VIEW_MAPPING_GLSL}

uniform sampler2D uSkyView;
uniform vec3 uSunTrue;             // unit vector toward the sun, true scale
uniform float uCamAltKm;
uniform float uVerticalExaggeration;
uniform vec3 uFloorColor;
uniform float uFloorHaze;
uniform float uSkyExposure;
${NIGHT_GLSL}
varying vec3 vDir;

void main() {
  // Stage direction to true direction: relief is exaggerated, so elevation angles are too
  vec3 d = normalize(vDir);
  vec3 dir = normalize(vec3(d.x, d.y / uVerticalExaggeration, d.z));
  vec3 sun = normalize(uSunTrue);
  float camAlt = clamp(uCamAltKm, 0.02, ATM_TOP - 1.0);

  vec3 color = atmBackdrop(uSkyView, dir, sun, camAlt, uSkyExposure, uFloorColor, uFloorHaze);
  if (acos(clamp(dir.y, -1.0, 1.0)) < atmHorizonAngle(camAlt)) {
    // Sun disc (angular radius about 0.27 degrees), bright enough to bloom
    float disc = smoothstep(0.999978, 0.999989, dot(dir, sun));
    if (disc > 0.0) {
      color += atmTransmittanceToSpace(camAlt, sun.y) * ATM_SUN * disc * 12.0 * (1.0 - uNight);
    }
  }
  // A little grain in the sky on top of the output dither: a slow gradient is the first thing a
  // video encoder turns into bands, and half a code of dither does not survive it
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  color *= 1.0 + (grain - 0.5) * 0.02;
  gl_FragColor = vec4(nightGrade(color), 1.0);
}
`;

/** Owns the transmittance lookup and the per-frame sky-view texture. */
export class SkyAtmosphere {
  public readonly transmittance: THREE.DataTexture;
  public readonly skyView: THREE.WebGLRenderTarget;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private lastSunSin = 9;
  private lastAltKm = -9;

  constructor() {
    this.transmittance = buildTransmittanceTexture();
    this.skyView = new THREE.WebGLRenderTarget(SKY_VIEW_W, SKY_VIEW_H, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: SKY_VIEW_FRAGMENT,
      uniforms: {
        uTransmittanceLut: { value: this.transmittance },
        uSunSin: { value: 0.5 },
        uCamAltKm: { value: 5.0 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Renders the sky-view texture when the sun elevation or the camera altitude changed. */
  public update(renderer: THREE.WebGLRenderer, sunTrue: THREE.Vector3, camAltKm: number): void {
    const sunSin = THREE.MathUtils.clamp(sunTrue.y, -0.15, 1);
    if (Math.abs(sunSin - this.lastSunSin) < 1e-4 && Math.abs(camAltKm - this.lastAltKm) < 0.02) {
      return;
    }
    this.lastSunSin = sunSin;
    this.lastAltKm = camAltKm;
    this.material.uniforms.uSunSin.value = sunSin;
    this.material.uniforms.uCamAltKm.value = camAltKm;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.skyView);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prevTarget);
  }

  public dispose(): void {
    this.transmittance.dispose();
    this.skyView.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
