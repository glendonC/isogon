import { COMMON_HEIGHTFIELD_GLSL } from '../earthCutawayShaders';
import { ATMOSPHERE_GLSL, NIGHT_GLSL, SKY_VIEW_MAPPING_GLSL } from './atmosphere';
import { FIRE_GLSL } from './fireField';
import { NOISE_GLSL } from './noiseGlsl';
import { SCAN_LATTICE_GLSL } from './scanGeometry';

// =============================================================================
// TERRAIN SURFACE SHADERS
// The surface is never displaced by data: sensor cells and fire are drawn on the ground.
// All output is scene-linear HDR radiance (see ./hdrPipeline.ts).
//
// Two shading paths share one shader:
//   terrain pack   8192 ortho, baked true-scale normals, sky-view AO and canopy index (aux texture)
//   fallback       2048 jpg (or the procedural canvas) with normals derived from the DEM
// Sun shadows come from a texture baked once per region (./shadowBake.ts) in both paths.
// =============================================================================
// Light balance and picture mapping shared by every surface that shows imagery (the pack terrain
// here, the context terrain in ./contextTerrain.ts), so they sit under one light.
export const TERRAIN_LOOK_GLSL = /* glsl */ `
const float TERRAIN_CEILING = 1.5;   // highest radiance of lit ground, under the bloom threshold
const float SUN_KEY = 0.66;          // sunlight on the ground: a slope square to the sun gets about 1.15
const float HAZE_NEAR_KM = 14.0;     // air within about this distance of the camera counts less

// Imagery is a finished picture, not a reflectance map. It goes through the inverse of the display
// tone curve (the ACES fit of three.js at exposure 1, see ./hdrPipeline.ts) so that under reference
// light (1.0) the pipeline returns the picture's own colors, and lighter or darker light moves
// them the way exposure would. The same mapping keeps flat data fills on their legend colors.
const mat3 ACES_OUT_INV = mat3(
  vec3(0.643038, 0.059269, 0.005962),
  vec3(0.311187, 0.931436, 0.063929),
  vec3(0.045775, 0.009295, 0.930118));
const mat3 ACES_IN_INV = mat3(
  vec3(1.764741, -0.147028, -0.036337),
  vec3(-0.675778, 1.160252, -0.162436),
  vec3(-0.088963, -0.013224, 1.198773));

vec3 pictureToScene(vec3 displayLinear) {
  vec3 y = clamp(ACES_OUT_INV * displayLinear, vec3(0.0), vec3(0.90));
  vec3 a = 1.0 - 0.983729 * y;
  vec3 b = 0.0245786 - 0.4329510 * y;
  vec3 c = 0.000090537 + 0.238081 * y;
  vec3 v = (-b + sqrt(b * b + 4.0 * a * c)) / (2.0 * a);
  return max(ACES_IN_INV * v, vec3(0.0)) * 0.6;
}

// Water. Where it is comes from the data: the sea at 0 m, a lake as ground that is exactly level
// in the elevation (see ./shadowBake.ts and ./contextTerrain.ts). Its colour is drawn: on a lake
// mostly one deep tone, so the strips and glints of an aerial mosaic do not cut the lake into
// pieces, with a little of the picture left in it; the sea the same. The pack and the land around it use the
// same terms, so a lake that crosses the pack's edge is one body of water.
const vec3 WATER_DEEP = vec3(0.05, 0.13, 0.21);
const float WATER_PICTURE_LEFT = 0.14;  // share of the picture's own colour kept on a lake
// (none on the sea: imagery at sea is tiles of other dates and brightness, and shows them)
const float WATER_NIGHT_DIM = 0.55;     // by night water gives back a dark sky

// Level ground is a lake only where the picture looks like water: bluer than it is red or green (a
// glint on a lake is pale but blue), or dark, and in either case not green. A swamp or a marsh is as
// level as a lake and covered in plants; a field on a level floodplain is green or brown.
float waterLook(vec3 picture) {
  float luma = dot(picture, vec3(0.2126, 0.7152, 0.0722));
  float greenish = smoothstep(1.04, 1.12, picture.g / max(max(picture.r, picture.b), 1e-3)) * smoothstep(0.02, 0.04, luma);
  float bluish = smoothstep(0.93, 1.0, picture.b / max(max(picture.r, picture.g), 1e-3));
  float dark = 1.0 - smoothstep(0.04, 0.06, luma);
  return max(bluish, dark) * (1.0 - greenish);
}

// The lit surface with water on it. glint: fresnel and sun glint, already scaled; none by night
vec3 waterSurface(vec3 lit, float water, float lake, float sea, float fresnel, float spec, float night) {
  float deepShare = max(mix(0.42, 1.0 - WATER_PICTURE_LEFT, lake), mix(0.42, 1.0, sea));
  vec3 deep = mix(lit, WATER_DEEP, deepShare);
  vec3 glint = (vec3(0.22, 0.28, 0.36) * fresnel * 0.45 + vec3(1.0, 0.93, 0.80) * spec * 0.85) * (1.0 - night);
  return mix(lit, deep + glint, water);
}

// Lit ground never reaches the bloom threshold: a smooth ceiling that keeps the hue
vec3 capSurface(vec3 c) {
  float m = max(c.r, max(c.g, c.b)) / TERRAIN_CEILING;
  return c / pow(1.0 + m * m * m * m, 0.25);
}
`;

export const TERRAIN_VERTEX_SHADER = /* glsl */ `
${COMMON_HEIGHTFIELD_GLSL}

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vBaseY;
varying float vElevM;

void main() {
  vUv = uv;
  float elevM = 0.0;
  float baseY = evalTerrainWorldY(uv, elevM);

  vBaseY = baseY;
  vElevM = elevM;

  // The plane is unit-parameterised by uv, so the slab can take each region's own aspect ratio
  vec4 worldPos = modelMatrix * vec4((uv.x - 0.5) * uSlabSize.x, baseY, (0.5 - uv.y) * uSlabSize.y, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// Depth only, for the pass that lays the terrain depth down before the surface is shaded
export const TERRAIN_DEPTH_FRAGMENT_SHADER = /* glsl */ `
void main() {
  gl_FragColor = vec4(0.0);
}
`;

export const TERRAIN_FRAGMENT_SHADER = /* glsl */ `
${COMMON_HEIGHTFIELD_GLSL}
${SCAN_LATTICE_GLSL}

// How strongly the detections' light falls on the ground near them and farther out (display choice)
// From far (the whole block in view) a detection is a few pixels: its light and its fall on the
// ground are lifted so a small fire still reads as fire (display choice)
const float FAR_LIGHT_LIFT = 2.4;
const float FAR_CAST_LIFT = 1.4;
const float FIRE_CAST_NEAR = 14.0;
const float FIRE_CAST_FAR = 9.0;
const float FIRE_CAST_EASE = 0.8;

// Display choices of the close-range look
const float WALL_STRETCH_FROM = 1.3; // imagery stretched this much down a slope starts to count as a wall
const float WALL_STRETCH_FULL = 2.3; // about 46 degrees of true slope at the stage's vertical factor

uniform sampler2D uSatPrev;
uniform sampler2D uSatNext;
uniform sampler2D uFieldTex0;
uniform sampler2D uFieldTex1;
uniform sampler2D uLipariTex;

uniform float uFrameMix;
uniform vec3 uSunDir;          // stage space, toward the sun
uniform float uTime;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;
uniform float uReconMix;
uniform float uObserverMix;
uniform float uModisWeight;
uniform float uViirsWeight;
uniform float uUncertaintyMix;
uniform float uSensitivity;
uniform vec2 uExtentKm;   // region size on the ground (east-west, north-south)
uniform vec4 uModisPass;  // (scan axis east, scan axis north, nadir distance km, valid)
uniform vec4 uViirsPass;
uniform vec4 uScanStrip;  // (MODIS strip center along track km, strength, VIIRS center km, strength)
uniform float uLatticeMix; // 1 draws the lattice of empty scan cells; 0 on the landing page, which shows no grid
uniform float uHasSeaCoast;
uniform float uLakeMix;       // 1 when the elevation is the place's own: level ground is then a lake
uniform sampler2D uFireHist;  // arrival, extinction, peak, burned (see ./fireField.ts)
uniform float uFireTime;      // fractional epoch
uniform vec2 uWindDirUv;

// Terrain pack (all optional, weights are 0 without a pack)
uniform sampler2D uAuxTex;      // r normal x (east), g normal z (south), b sky view, a canopy
uniform float uMicroDetail;   // 1: the drawn fine texture (crowns, rock) where the picture is magnified; 0 on a stand-in
uniform float uAuxMix;
uniform sampler2D uShadowTex;   // baked once: r the sun shadow factor (1 = lit), g level ground
uniform sampler2D uSmokeShadowTex; // transmittance of the smoke toward the sun at ground level
uniform float uSmokeShadowMix;
uniform vec3 uUnitsPerMetre;    // stage units per metre on x, y, z
uniform vec3 uSunTrue;          // unit vector toward the sun at true scale
uniform vec3 uSunColor;         // radiance of a white surface in full sun
uniform vec3 uSunTransmittance; // of the air above the region, toward the sun (feeds only the inscatter the haze discards)
uniform float uHazeStrength;    // share of the physical air path that is drawn
uniform sampler2D uSkyView;     // sky radiance by azimuth from the sun and elevation (./atmosphere.ts)
uniform float uSkyExposure;     // the dome's display exposure, so the far edge meets it exactly
uniform vec3 uFloorColor;       // the dome's floor (shared with ./atmosphere.ts)
uniform float uFloorHaze;
uniform float uOrthoTexelKm;    // ground size of one texel of the current imagery
uniform float uSatSharpen;      // 1 for low-resolution imagery, 0 for the pack ortho
uniform sampler2D uDetailTex;   // optional zoom 16 inset
uniform vec4 uDetailRect;       // (u0, v0, u1, v1) of the inset in slab uv
uniform float uDetailMix;
uniform float uDetailTexelKm;
uniform sampler2D uContextOrtho; // imagery around the pack (see contextJoin in the heightfield code)
// Real runs: the detections of the overpass on show, each in its own footprint (./footprintField.ts).
// r, b: inside a footprint minus its depth (0 edge, 1 centre line), outside km to the nearest one
// (MODIS, VIIRS). g, a: fire radiative power density of that footprint, MW/km2.
uniform sampler2D uFootTex;
uniform vec2 uFootMix;      // (MODIS, VIIRS): 1 on a real run, where footprints replace the scan lattice
uniform float uLightModis;  // 1 when the lights on show are MODIS detections (the raw side shows them too), 0 for VIIRS
uniform float uLightTexels; // side of the light texture, texels
uniform vec2 uRevealed;     // (MODIS, VIIRS): 1 when that family's footprints on show were revealed after scoring
uniform float uPixelOutline; // 1 draws the outline of each detection's pixel around its light, on the estimate's side too
// The run's intensity scale, from its payload: (0 linear or 1 log10, top MW/km2, bottom MW/km2)
uniform vec3 uFieldScale;
// Positions on that scale where emitted light starts and where it is at its brightest
uniform vec2 uHeatRange;
// Real runs: what the model believes at the time on show (./beliefField.ts). The texture rides on
// uLipariTex, whose legend ramp is not drawn on a real run (the shader is at its sampler limit):
// r, g probability that the cell burns and its expected intensity at one time step, b, a the same
// at the next step, one texel per cell of the model's grid.
uniform vec2 uBeliefGrid;    // cells east-west and north-south; (0, 0) when the run has no belief frames
uniform float uBeliefMix;    // position between the two steps
uniform vec4 uBeliefBox;     // the part of the region that holds any belief: (u west, v south, u east, v north)
uniform float uHeldOut;      // 1 on a pass whose detections were kept from the estimate
uniform vec4 uRevealArrive;  // detections laid on after scoring arrive: xy the pass's direction of travel (east, north), z the front along it (km from the box's centre), w the front's soft width (km)
uniform float uDayJoin;       // share of the box's side over which a day's photograph blends into the land around (0: none)
uniform float uChanceSquares; // 1 when the squares sized by chance are asked for (eased)
uniform float uDeclaredGiven; // 1 when the run says which cells its model declares at the hidden pass on show (the low bit of a cell's intensity byte)
// A hidden pass: above 0 the light texture holds the last visible pass, drawn as an afterglow at
// this share of its light. 0: the lights are the detections of the pass on show.
uniform float uAfterglow;
uniform float uFarView;      // 0 in a close view, 1 when the whole block is in view: lights and their fall on the ground are lifted there
uniform float uLightGain;    // share of the lights drawn (below 1 while the landing fades from one pass to the next)
uniform float uBeliefQuiet;  // 1 on a run that kept nothing from the model: its squares are drawn quieter
// A pass as a scan: while a pass arrives, a front crosses the region along its ground track and
// what the pass brought appears behind it. (track east, track north, front along the track km, 1
// while the front is crossing)
uniform vec4 uScan;
// A board of tiles over the region's box (the page's round of looks). Row 0 is the north edge.
uniform vec2 uTileGrid;       // (columns, rows); (0, 0) without a board
uniform vec4 uTileState[64];  // per tile: level 0..1, looked, chosen, closed
uniform float uTileHover;     // the tile under the pointer, -1 for none

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vBaseY;
varying float vElevM;

${NOISE_GLSL}
${ATMOSPHERE_GLSL}
${SKY_VIEW_MAPPING_GLSL}
${NIGHT_GLSL}
${FIRE_GLSL}

${TERRAIN_LOOK_GLSL}

// Imagery for the current region. During a region morph the outgoing image is blended in.
// Returns the picture color and, in insetWeight, how much of it came from the zoom 16 inset.
//
// The imagery is projected straight down, so on a steep face every texel is stretched along the
// fall line by 'stretch' (surface length over map length) and reads as a smear when magnified.
// The filter footprint is therefore widened across the slope by the same amount ('contourUv' is
// the uv step per world unit along the contour): detail becomes as coarse across the slope as the
// projection already made it along the slope, soft instead of streaked.
vec3 sampleOrtho(vec2 uv, float kmPerPx, vec2 contourUv, float stretch, float bare, out float insetWeight) {
  float worldPerKm = uUnitsPerMetre.x * 1000.0;
  float magnified = smoothstep(2.4, 0.9, kmPerPx / max(uOrthoTexelKm, 1e-5));
  vec2 smear = contourUv * (uOrthoTexelKm * worldPerKm * (stretch - 1.0) * magnified);
  // On a wall the picture holds almost no real detail (a few texels cover the whole face), so it
  // is also filtered wider in every direction there and keeps only its color. Rock texture drawn in
  // the shader takes the place of the streaks (see wallFade in main).
  // 'bare' is 1 on open rock and 0 under canopy or without a terrain pack: forest keeps its texture
  float wall = smoothstep(WALL_STRETCH_FROM, WALL_STRETCH_FULL, stretch) * bare;
  float widen = 1.0 + wall * 5.0;
  vec2 baseGx = dFdx(uv) * widen;
  vec2 baseGy = dFdy(uv) * widen;
  vec3 center = textureGrad(uSatNext, uv, baseGx + smear, baseGy).rgb;
  insetWeight = 0.0;

  if (uSatSharpen > 0.01) {
    // Mild unsharp mask, only for the 2048 fallback imagery
    vec2 texStep = vec2(1.0 / 2048.0);
    vec3 blur = 0.25 * (
      texture2D(uSatNext, uv + vec2(texStep.x, 0.0)).rgb + texture2D(uSatNext, uv - vec2(texStep.x, 0.0)).rgb +
      texture2D(uSatNext, uv + vec2(0.0, texStep.y)).rgb + texture2D(uSatNext, uv - vec2(0.0, texStep.y)).rgb);
    float detailLuma = dot(center - blur, vec3(0.299, 0.587, 0.114));
    center = clamp(center + vec3(detailLuma * 0.42 * uSatSharpen), 0.0, 1.0);
  }

  // Zoom 16 inset over the fire window, used only where the base imagery is being magnified.
  // Its low frequencies are replaced by those of the base image so tone or season differences
  // between the two mosaics do not show as a rectangle.
  vec2 rectSize = max(uDetailRect.zw - uDetailRect.xy, vec2(1e-4));
  vec2 duv = (uv - uDetailRect.xy) / rectSize;
  float insetMagnified = smoothstep(2.4, 0.9, kmPerPx / max(uDetailTexelKm, 1e-5));
  vec2 dGx = dFdx(duv) * widen + contourUv * (uDetailTexelKm * worldPerKm * (stretch - 1.0) * insetMagnified) / rectSize;
  vec2 dGy = dFdy(duv) * widen;
  if (uDetailMix > 0.01) {
    vec2 edge = min(duv, 1.0 - duv);
    float inside = smoothstep(0.0, 0.035, min(edge.x, edge.y));
    float need = smoothstep(1.5, 0.75, kmPerPx / max(uOrthoTexelKm, 1e-5));
    float w = inside * need * uDetailMix;
    if (w > 0.003) {
      vec2 cuv = clamp(duv, vec2(0.0), vec2(1.0));
      vec3 fine = textureGrad(uDetailTex, cuv, dGx, dGy).rgb;
      vec3 fineLow = textureLod(uDetailTex, cuv, 6.5).rgb;
      vec3 baseLow = textureLod(uSatNext, uv, 5.0).rgb;
      fine *= clamp((baseLow + 0.01) / (fineLow + 0.01), vec3(0.55), vec3(1.8));
      center = mix(center, fine, w);
      insetWeight = w;
    }
  }

  if (uMorph < 0.999) {
    center = mix(texture2D(uSatPrev, uv).rgb, center, uMorph);
  }
  return center;
}

// Stage-space normal from the heightfield (fallback path and during region morphs)
vec3 computeTerrainNormal(vec2 uv, out float slopeMag) {
  float eps = 1.0 / 512.0;
  float hE = evalTerrainWorldYFast(uv + vec2(eps, 0.0));
  float hW = evalTerrainWorldYFast(uv - vec2(eps, 0.0));
  float hN = evalTerrainWorldYFast(uv + vec2(0.0, eps));
  float hS = evalTerrainWorldYFast(uv - vec2(0.0, eps));

  // Note: +v is North (-Z world), so dY/dZ = -(hN - hS) / dzWorld
  float dydx = (hE - hW) / (2.0 * eps * uSlabSize.x);
  float dydz = -(hN - hS) / (2.0 * eps * uSlabSize.y);
  slopeMag = length(vec2(dydx, dydz));
  return normalize(vec3(-dydx, 1.0, -dydz));
}

// Normal of a surface displaced by a small height h (world units), from screen-space derivatives
// (Mikkelsen, bump mapping unparametrized surfaces).
vec3 perturbNormal(vec3 pos, vec3 n, float h) {
  vec3 dpdx = dFdx(pos);
  vec3 dpdy = dFdy(pos);
  float dhdx = dFdx(h);
  float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n);
  vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - grad);
}

// A sensor overpass is one discrete observation, so cell values come from the nearest epoch
// instead of a blend of two.
vec4 sampleFieldNearestEpoch(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.002), vec2(0.998));
  // Explicit level 0: cell centers jump between fragments, which would pick a blurred mip level
  return mix(textureLod(uFieldTex0, c, 0.0), textureLod(uFieldTex1, c, 0.0), step(0.5, uFrameMix));
}

// Mean of the field channel over the cell footprint (center weighted twice plus four inner taps).
float scanCellValue(ScanCell cell, vec2 axis, vec4 channelMask) {
  vec2 track = vec2(axis.y, -axis.x);
  vec2 inv = 1.0 / uExtentKm;
  vec2 du = axis * cell.sizeKm.x * 0.25 * inv;
  vec2 dv = track * cell.sizeKm.y * 0.25 * inv;
  vec2 c0 = cell.centerKm * inv + vec2(0.5);
  float v = 2.0 * dot(sampleFieldNearestEpoch(c0), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 + du + dv), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 + du - dv), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 - du + dv), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 - du - dv), channelMask);
  return v / 6.0;
}

struct ScanDraw {
  float value;   // per-cell field value, 0..1 of the field range
  float hair;    // hairline coverage of the cell border (constant width in device pixels)
  float hairLit; // wider coverage used for the border of a cell that holds a detection
  float seam;    // hairline coverage of the scan-to-scan seam, scaled by the bow-tie overlap
  float cellPx;  // smaller cell dimension in device pixels
};

// The strip one mirror scan sweeps under the spacecraft: two hairlines one scan apart (the nadir
// width, the spacing of the scan seams in the lattice) and a faint lift between them.
vec3 scanStripMark(vec3 rgb, vec2 pKm, float kmPerPx, vec4 pass, vec4 sensor, float k, vec2 strip, vec3 tint) {
  vec2 track = vec2(pass.y, -pass.x);
  float halfKm = 0.5 * sensor.z * SCAN_RE * (k - 1.0) * sensor.y;
  float d = abs(dot(pKm, track) - strip.x);
  float edge = scanHairline(abs(d - halfKm), kmPerPx, 1.6);
  float inside = 1.0 - smoothstep(halfKm - kmPerPx, halfKm + kmPerPx, d);
  rgb = mix(rgb, rgb * 1.07 + tint * 0.04, inside * strip.y);
  return mix(rgb, tint, edge * strip.y * 0.92);
}

ScanDraw evalScanDraw(vec2 pKm, float kmPerPx, vec4 pass, vec4 sensor, float k, vec4 channelMask) {
  ScanDraw d;
  ScanCell cell = evalScanCell(pKm, pass, sensor, k);
  d.value = scanCellValue(cell, pass.xy, channelMask);
  d.cellPx = min(cell.sizeKm.x, cell.sizeKm.y) / max(kmPerPx, 1e-6);
  // Ground distance one pixel covers across each family of borders. With one isotropic figure a
  // border that runs away from the camera would come out several pixels wide at grazing angles.
  vec2 track = vec2(pass.y, -pass.x);
  float sAxis = dot(pKm, pass.xy);
  float sTrack = dot(pKm, track);
  float pxAxis = max(length(vec2(dFdx(sAxis), dFdy(sAxis))), 1e-6);
  float pxTrack = max(length(vec2(dFdx(sTrack), dFdy(sTrack))), 1e-6);
  d.hair = max(scanHairline(cell.edgeScanKm, pxAxis, 1.15), scanHairline(cell.edgeTrackKm, pxTrack, 1.15));
  d.hairLit = max(scanHairline(cell.edgeScanKm, pxAxis, 2.3), scanHairline(cell.edgeTrackKm, pxTrack, 2.3));
  d.seam = scanHairline(cell.seamKm, pxTrack, 1.9) * smoothstep(0.04, 0.35, cell.overlap);
  return d;
}

// Position (0..1, byte / 255) of a fire radiative power density on the run's intensity scale, as
// the field bytes are encoded: a detection's own value and the field then share one scale.
float fieldNorm(float mwKm2) {
  if (uFieldScale.x < 0.5) return clamp(mwKm2 / max(uFieldScale.y, 1e-3), 0.0, 1.0);
  if (mwKm2 < uFieldScale.z) return 0.0;
  return clamp((1.0 + 254.0 * log(mwKm2 / uFieldScale.z) / log(uFieldScale.y / uFieldScale.z)) / 255.0, 0.0, 1.0);
}

// How hot a position on the scale is drawn: 0 where emitted light starts, 1 at its brightest
float heatOf(float v) {
  return clamp((v - uHeatRange.x) / max(uHeatRange.y - uHeatRange.x, 1e-3), 0.0, 1.0);
}

// A real detection is heat a satellite measured as emitted radiance. It is drawn as light the
// ground gives off: one light per detection, inside the detection's own footprint, as a small hot
// core with a soft halo (FIRMS says the fire is somewhere in the footprint, not that it fills it).
// The lights are drawn into a texture with a mip chain (./footprintField.ts), colour and brightness
// from each detection's radiative power: deep red, through orange, to near white. On a real run it
// is bound to uFireHist, whose fire history is not drawn there. rgb: emitted light. a: its strength
// without the colour.
// Lights that are small on screen run together: the mip chain averages them into one glow, and
// the average is lifted so a light smaller than a pixel still shows, as a far lamp does.
vec4 detectionLight(vec2 uv) {
  vec2 texel = uv * uLightTexels;
  float lod = log2(max(max(length(dFdx(texel)), length(dFdy(texel))), 1.0));
  vec4 light = texture2D(uFireHist, uv) * min(exp2(0.85 * lod), 6.0);
  // By day the same light competes with sunlit ground and with smoke: it is lifted and kept orange
  light.rgb *= mix(vec3(1.5, 1.05, 0.7), vec3(1.0), uNight);
  return light;
}

// A detection laid on after scoring (the hidden instrument once it is revealed, or what a look
// found) is drawn as a filled square in the middle of the instrument's pixel, about six tenths
// of the pixel across, so that it can be told from the estimate's open frames and compared
// with them cell by cell. field: the footprint field of its family (minus depth inside).
// few is 1 where the pixel is only a few screen pixels wide: the square's edge is then soft.
float revealCore(float field, float few) {
  float depth = clamp(-field, 0.0, 1.0);
  return mix(smoothstep(0.36, 0.46, depth), smoothstep(0.30, 0.62, depth), few);
}

// --- The model's belief (real runs) -----------------------------------------------------------
// A detection is a measurement: light at a place and a time. The estimate is a belief, and it is
// drawn as one: marks in ink on the model's own grid, never as light and never as a coat of colour.
//   one square per cell of the model's 375 m grid, its area growing with the probability that
//   the cell burns (a large square is near certain, a small dot is doubt), its strength with the
//   expected intensity
//   a dotted line around the ground where the model holds that fire may be
//   on a pass that was kept from the model, an open frame in place of the square of every cell it
//   declares burning (one half or more, the blind test's own rule): the answer it committed to
// Everything comes from the belief frames. The ink, the dot shape and the line are drawing.
const float BELIEF_DECLARED = 0.5;   // a cell at this probability or more is declared burning
const float BELIEF_MAY_BURN = 0.02;  // the dotted line runs where the smoothed probability crosses this
const float BELIEF_CELL_FILL = 0.58; // side of a certain cell's square, as a share of the cell
// By day the estimate's white ink and a detection's light lie on sunlit ground. Two display
// choices keep them readable there, and neither marks ground the data does not: the ground
// inside the dotted line is drawn this much darker (the same ground the line already encloses),
// and the ground right under a light is drawn darker by up to this share (the light's own
// extent, inside the detection's pixel). Neither says the ground is burned.
const float BELIEF_DAY_SHADE = 0.30;
// Detections laid on after a look or a reveal: how much the ground under their marks is darkened
// by day, and how much their blue is lifted when the whole block is in view
const float REVEAL_DAY_UNDER = 0.55;
const float REVEAL_FILL = 0.9;        // how much of the ground the blue square covers
const float REVEAL_FAR_LIFT = 0.6;
// A declared cell too small on screen for an open frame is drawn as a square of at least this
// probability's size (display choice: the list says declared or not, it gives no size)
const float BELIEF_DECLARED_FAR = 0.4;
const float DAY_LIGHT_UNDER = 0.72;
const float BELIEF_INK_FAR = 1.35;       // how much stronger the ink is drawn on such small cells
const float BELIEF_CELL_FILL_FAR = 0.88; // the same when the cell is only a few pixels wide on screen
const float BELIEF_FRAME_HALF = 0.40; // half side of the open frame of a declared cell on a held-out pass

// Probability and expected intensity of one cell at the time on show
vec2 beliefCell(vec2 cellId) {
  vec4 b = textureLod(uLipariTex, (cellId + 0.5) / uBeliefGrid, 0.0);
  return mix(b.rg, b.ba, uBeliefMix);
}

float beliefTap(vec2 texel) {
  vec4 b = textureLod(uLipariTex, texel / uBeliefGrid, 0.0);
  return mix(b.r, b.b, uBeliefMix);
}

// The probability as a smooth surface over the cells: a cubic B-spline through four bilinear taps
float beliefSmooth(vec2 uv) {
  vec2 st = uv * uBeliefGrid - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = i - 0.5 + w1 / g0 + 0.5;
  vec2 h1 = i + 1.5 + w3 / g1 + 0.5;
  return g0.y * (g0.x * beliefTap(vec2(h0.x, h0.y)) + g1.x * beliefTap(vec2(h1.x, h0.y)))
       + g1.y * (g0.x * beliefTap(vec2(h0.x, h1.y)) + g1.x * beliefTap(vec2(h1.x, h1.y)));
}

// Ink over the ground: (coverage of the marks, coverage of the dark edge that holds the lines on
// bright ground by day, strength of the ink)
// (the fourth value: 1 on ground inside the dotted line, 0 outside)
vec4 beliefMarks(vec2 uv, vec2 pKm, float kmPerPx, float heldOut) {
  vec2 g = uv * uBeliefGrid;
  vec2 id = floor(g);
  vec2 fc = g - id - 0.5;
  vec2 aa = max(fwidth(g), vec2(1e-5));   // cells per pixel along each axis
  float px = max(aa.x, aa.y);
  float cellPx = 1.0 / px;
  vec4 cellBytes = textureLod(uLipariTex, (id + 0.5) / uBeliefGrid, 0.0);
  vec2 be = mix(cellBytes.rg, cellBytes.ba, uBeliefMix);
  float p = clamp(be.x, 0.0, 1.0);
  // A pass kept from the model: which cells the model declares burning there. The run says so
  // itself, with the list the blind test scores; a run that gives no list (an older recording)
  // falls back to the cells the belief on show holds at one half or more, which is a reading of
  // the model and not its own answer.
  float listed = mod(floor(cellBytes.g * 255.0 + 0.5), 2.0);
  float declaredCell = mix(step(BELIEF_DECLARED, p), listed, uDeclaredGiven) * heldOut;
  // (an open frame needs about seven pixels to read as open; a smaller declared cell is drawn as
  // a square no smaller than BELIEF_DECLARED_FAR stands for, whatever its probability, so the
  // model's answer is still the shape seen from far, as a field of squares and not a fill)
  float framed = smoothstep(5.5, 8.0, cellPx);
  // (the squares sized by chance only when asked for; a declared cell keeps its mark)
  p = max(p * uChanceSquares, BELIEF_DECLARED_FAR * declaredCell * (1.0 - framed));
  float some = step(0.004, p);

  // The cell's square: its area grows with the probability. Even a certain cell leaves ground
  // showing around it, so a sure area is a field of squares and never a fill. How it is drawn
  // depends on its size on screen, so the marks weigh about the same at any distance: solid when
  // small, an outline over a faint pane when larger, and its four corners alone in a close view,
  // where an outline around every cell would cage the ground and the lights.
  // (a cell that is only a few pixels wide is drawn fuller and, below, brighter: from far the
  // estimate has to read as a shape, and the ground between such squares could not be seen anyway)
  float tiny = 1.0 - smoothstep(5.0, 11.0, inversesqrt(aa.x * aa.y));
  float halfSide = mix(BELIEF_CELL_FILL, BELIEF_CELL_FILL_FAR, tiny) * 0.5 * sqrt(p);
  vec2 d = abs(fc) - halfSide;
  float inside = (1.0 - smoothstep(-0.5 * aa.x, 0.5 * aa.x, d.x)) * (1.0 - smoothstep(-0.5 * aa.y, 0.5 * aa.y, d.y)) * some;
  vec2 dIn = d + 1.3 * aa;
  float inner = (1.0 - smoothstep(-0.5 * aa.x, 0.5 * aa.x, dIn.x)) * (1.0 - smoothstep(-0.5 * aa.y, 0.5 * aa.y, dIn.y)) * some;
  // (its size on screen: the mean of its two sides, since a cell on a slope seen at a low angle
  // is long one way and short the other)
  float sizePx = inversesqrt(aa.x * aa.y);
  float close = smoothstep(13.0, 22.0, sizePx);
  float pane = mix(mix(1.0, 0.20, smoothstep(6.0, 13.0, sizePx)), 0.0, close);
  float corners = step(0.55 * halfSide, min(abs(fc.x), abs(fc.y)));
  float square = max((inside - inner) * mix(1.0, corners, close), inside * pane * (1.0 - 0.75 * uBeliefQuiet));

  // A pass kept from the model: every cell the model declares burning is an open frame in place
  // of its square, the answer it committed to and has not been shown. The other cells stay as
  // they are.
  float declared = declaredCell * framed;
  float box = max(abs(fc.x), abs(fc.y));
  float strokeCells = max(1.5 * px, 0.06);
  float ring = (1.0 - smoothstep(BELIEF_FRAME_HALF - 0.5 * px, BELIEF_FRAME_HALF + 0.5 * px, box))
             * smoothstep(BELIEF_FRAME_HALF - strokeCells - 0.5 * px, BELIEF_FRAME_HALF - strokeCells + 0.5 * px, box);
  float mark = mix(square, ring, declared);

  // Cells too small to draw one by one run together into a tone of the same coverage
  float resolved = smoothstep(2.0, 3.6, cellPx);
  vec4 near = texture2D(uLipariTex, uv);
  float tone = BELIEF_CELL_FILL * BELIEF_CELL_FILL
             * max(mix(near.r, near.b, uBeliefMix) * uChanceSquares, BELIEF_DECLARED_FAR * declaredCell);
  float cells = mix(tone * 0.8, mark, resolved);

  // The dotted line around the ground that may burn
  float ps = beliefSmooth(uv);
  float grad = max(fwidth(ps), 1e-5);
  // (no line where the surface is exactly zero: that is ground beyond every cell's reach, and at
  // the edge of the box above the gradient is not to be trusted)
  float reach = step(1e-6, ps);
  float line = (1.0 - smoothstep(0.55, 1.45, abs(ps - BELIEF_MAY_BURN) / grad)) * reach;
  float lineEdge = (1.0 - smoothstep(1.4, 2.6, abs(ps - BELIEF_MAY_BURN) / grad)) * reach;
  // Dots of a steady size on screen, fixed to the ground (their size steps by octaves with distance)
  float dotKm = exp2(floor(log2(max(kmPerPx, 1e-4) * 5.0)));
  vec2 q = pKm / dotKm;
  float dots = step(0.0, sin(3.14159265 * (q.x + q.y)) * sin(3.14159265 * (q.x - q.y)));
  line *= dots;
  lineEdge *= dots;

  float strength = mix(0.70, 1.0, heatOf(be.y)) * mix(1.0, BELIEF_INK_FAR, tiny);
  float within = smoothstep(-1.0, 1.0, (ps - BELIEF_MAY_BURN) / grad) * reach;
  return vec4(max(cells, line * 0.9), lineEdge * 0.7, mix(strength, mix(1.0, BELIEF_INK_FAR, tiny), line), within);
}

// --- The board of tiles ------------------------------------------------------------------------
// Lines in ink on the ground, never a fill: a hairline along every tile edge; a frame inside the
// tile that grows heavier with its level; a firm outline where a look was spent; corner brackets
// on the tile chosen now; a brighter outline under the pointer.
// Returns (coverage of the ink, coverage of the dark edge under it, strength of the ink).
const float TILE_BRACKET_ARM = 0.25;    // arm length, as a share of the tile's side
const float TILE_BRACKET_DAY = 1.1;     // ink strength of the brackets by day
const float TILE_BRACKET_NIGHT = 1.6;   // and by night, where the board's ink is dimmed
vec3 tileMarks(vec2 uv) {
  vec2 tg = vec2(uv.x, 1.0 - uv.y) * uTileGrid;
  vec2 id = min(floor(tg), uTileGrid - 1.0);
  vec2 tf = tg - id;
  float index = id.y * uTileGrid.x + id.x;
  vec4 state = uTileState[int(clamp(index, 0.0, 63.0))];
  // Tiles per pixel across each family of edges (measured along its own direction, so an edge
  // that runs away from the camera keeps its width)
  vec2 px = max(vec2(length(vec2(dFdx(tg.x), dFdy(tg.x))), length(vec2(dFdx(tg.y), dFdy(tg.y)))), vec2(1e-6));
  vec2 edgePx = min(tf, 1.0 - tf) / px;          // distance to the tile's edges, pixels
  float d = min(edgePx.x, edgePx.y);
  float hover = 1.0 - step(0.5, abs(index - uTileHover));

  float hair = 1.0 - smoothstep(0.35, 1.05, d);
  float ink = hair * mix(0.30, 0.12, state.a);
  float strength = 0.8;
  // Every mark of a tile is a thin line set inside the tile, so where two marked tiles meet there
  // are two fine lines with ground between them and never one heavy band.
  // Level: a frame well inside the edge, one to three pixels thick, brighter as the level rises
  float thick = 1.0 + 2.0 * state.r;
  float frame = smoothstep(5.6, 6.4, d) * (1.0 - smoothstep(6.0 + thick - 0.4, 6.0 + thick + 0.4, d)) * step(0.004, state.r);
  ink = max(ink, frame * (0.14 + 0.62 * state.r));
  // Looked at: a firm fine outline just inside the edge
  float firm = smoothstep(1.6, 2.2, d) * (1.0 - smoothstep(3.2, 3.8, d)) * state.g;
  ink = max(ink, firm * 0.9);
  // Under the pointer
  float under = smoothstep(1.6, 2.2, d) * (1.0 - smoothstep(3.4, 4.0, d)) * hover;
  ink = max(ink, under * 0.7);
  // Chosen: brackets at the four corners, the strongest mark on the board. Each arm runs a
  // quarter of the tile's side along its own edge, so a tile seen at a slant keeps four
  // brackets and not four dots
  vec2 cornerFrac = min(tf, 1.0 - tf);
  float inCorner = step(max(cornerFrac.x, cornerFrac.y), TILE_BRACKET_ARM);
  float bracket = smoothstep(0.6, 1.2, d) * (1.0 - smoothstep(5.4, 6.2, d)) * inCorner * state.b;
  ink = max(ink, bracket);
  strength = mix(strength, 1.0, max(firm, under));
  strength = mix(strength, mix(TILE_BRACKET_DAY, TILE_BRACKET_NIGHT, uNight), bracket);
  float edge = smoothstep(0.6, 1.4, d) * (1.0 - smoothstep(4.6, 6.0, d));
  edge *= max(max(state.g, state.b), hover);
  // (the brackets get a wider dark edge of their own, so they stand on bright ground too)
  edge = max(edge, (1.0 - smoothstep(7.0, 9.0, d)) * inCorner * state.b);
  return vec3(ink, edge, strength);
}

// Border visibility. A lit cell keeps its border until the cell is only a few pixels across. The
// lattice over empty ground fades out much earlier so it never turns into a wireframe texture.
float scanLitFade(float cellPx) { return smoothstep(3.0, 9.0, cellPx); }
float scanEmptyFade(float cellPx, float fullPx) { return smoothstep(fullPx * 0.34, fullPx, cellPx); }

void main() {
  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  // Ground position in km (east, north of the region center) and its screen-space footprint
  vec2 pKm = (vUv - vec2(0.5)) * uExtentKm;
  float kmPerPx = max(length(dFdx(pKm)), length(dFdy(pKm)));

  // Real detection footprints, and the screen-space gradient of each family's field (for the
  // one-pixel edge of a footprint, whatever the field's units on either side of that edge)
  vec4 foot = texture2D(uFootTex, vUv);
  float footGradM = max(length(vec2(dFdx(foot.r), dFdy(foot.r))), 1e-6);
  float footGradV = max(length(vec2(dFdx(foot.b), dFdy(foot.b))), 1e-6);
  // What the overpass on show detected, as emitted light (nothing on a simulated run)
  // The pass being scanned: 1 on ground the front has crossed (everywhere once it is through)
  float scanAlong = dot(pKm, uScan.xy);
  float scanned = mix(1.0, 1.0 - smoothstep(uScan.z - 0.25, uScan.z, scanAlong), uScan.w);
  vec4 lit = detectionLight(vUv) * uFootMix.x * scanned * uLightGain * (1.0 + FAR_LIGHT_LIFT * uFarView);
  // How much of the light's fall on the ground is drawn (all of it for the pass on show)
  float castShare = uLightGain * (1.0 + FAR_CAST_LIFT * uFarView);
  if (uAfterglow > 0.001) {
    // The pass on show is hidden. What the last visible pass detected is kept as an afterglow:
    // blurred, dull and red, with no point of light, so it cannot be taken for a detection of this pass.
    // It fades with the hours since that pass (see the stage). It says where the visible
    // instrument last saw fire, not what burns now. By night only: by day a glow would be a red
    // tint on sunlit ground, and the trace of the fire is the smoke that pass left.
    vec4 soft = textureLod(uFireHist, vUv, 3.4);
    // (lifted when it is small on screen, as the lights are: from far a dull glow would vanish)
    float glowLift = mix(1.0, 2.6, smoothstep(0.02, 0.06, kmPerPx));
    lit = vec4(vec3(0.62, 0.10, 0.03) * dot(soft.rgb, vec3(0.5, 0.4, 0.1)) * 1.3 * glowLift, 0.0) * uAfterglow * uNight * uFootMix.x * uLightGain;
    castShare = 0.30 * uAfterglow * uLightGain;
  }
  // The model's belief as ink marks (worked out here, outside any branch, for its derivatives)
  vec4 marks = vec4(0.0);
  // (only inside the box that holds any belief: most of the ground has none and skips the work)
  if (uBeliefGrid.x > 0.5 && vUv.x > uBeliefBox.x && vUv.x < uBeliefBox.z && vUv.y > uBeliefBox.y && vUv.y < uBeliefBox.w) {
    marks = beliefMarks(vUv, pKm, kmPerPx, uHeldOut * scanned);
  }
  vec3 tiles = vec3(0.0);
  if (uTileGrid.x > 0.5) tiles = tileMarks(vUv);

  // --- Surface normal and sky visibility ------------------------------------------------------
  float slopeMag = 0.0;   // stage-space gradient magnitude
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec4 aux = texture2D(uAuxTex, vUv);
  if (uAuxMix < 0.999) {
    N = computeTerrainNormal(vUv, slopeMag);
  }
  if (uAuxMix > 0.001) {
    // True-scale unit normal, y rebuilt, then mapped into the scaled stage space
    vec2 nxz = aux.rg * 2.0 - 1.0;
    vec3 nTrue = vec3(nxz.x, sqrt(max(1e-4, 1.0 - dot(nxz, nxz))), nxz.y);
    vec3 nAux = normalize(nTrue / uUnitsPerMetre);
    float slopeAux = length(nAux.xz) / max(nAux.y, 1e-3);
    N = normalize(mix(N, nAux, uAuxMix));
    slopeMag = mix(slopeMag, slopeAux, uAuxMix);
  }
  // Tangent of the true slope angle (the stage exaggerates relief)
  float trueSlope = slopeMag * uUnitsPerMetre.x / max(uUnitsPerMetre.y, 1e-9);
  float skyView = mix(1.0, aux.b, uAuxMix);

  // --- Imagery ---------------------------------------------------------------------------------
  // Contour direction on the ground (uv step per world unit) and the stretch of the projection
  vec2 fall = N.xz / max(length(N.xz), 1e-4);
  vec2 contourUv = vec2(-fall.y / uSlabSize.x, -fall.x / uSlabSize.y);
  float stretch = min(sqrt(1.0 + slopeMag * slopeMag), 6.0);
  float insetWeight = 0.0;
  float bare = uAuxMix * (1.0 - smoothstep(0.15, 0.6, aux.a));
  vec3 photoRgb = sampleOrtho(vUv, kmPerPx, contourUv, stretch, bare, insetWeight);
  // Over its last stretch the pack shows the context imagery, like its surface takes the context
  // elevation there: the step in detail between the two is spread over the join
  float joinK = contextJoin(vUv);
  // A day's photograph laid on the box (dayPicture) meets the land around's own picture over a wider
  // band, so its colours (a false-colour one above all) go into the land and do not stop at a line.
  // Drawing: the photograph covers the box, the blend is only where they meet.
  if (uDayJoin > 0.0) {
    vec2 toEdge = min(vUv, 1.0 - vUv);
    joinK = max(joinK, (1.0 - smoothstep(0.0, uDayJoin, min(toEdge.x, toEdge.y))) * uContextMix);
  }
  // (derivatives are taken outside the branch; inside it they are undefined)
  vec2 contextUv = (vUv - 0.5) / uContextScale + 0.5;
  vec2 contextDx = dFdx(contextUv);
  vec2 contextDy = dFdy(contextUv);
  if (joinK > 0.0) {
    photoRgb = mix(photoRgb, textureGrad(uContextOrtho, contextUv, contextDx, contextDy).rgb, joinK);
  }
  float satLuma = dot(photoRgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 satRgb = pictureToScene(photoRgb);

  // Canopy cover: the pack's canopy index, or an imagery heuristic without a pack
  float vegHeuristic = clamp((photoRgb.g - max(photoRgb.r, photoRgb.b)) * 7.0 + 0.5, 0.0, 1.0);
  float canopyK = mix(vegHeuristic, aux.a, uAuxMix);

  // Water (hydrologically flat lakes, rivers, sea coves)
  float seaMask = uHasSeaCoast * (1.0 - smoothstep(1.2, 4.5, vElevM));
  float inlandWater = step(photoRgb.g * 0.94, photoRgb.b)
                    * step(photoRgb.r * 1.45, photoRgb.b)
                    * (1.0 - smoothstep(0.022, 0.042, satLuma))
                    * (1.0 - smoothstep(0.012, 0.028, slopeMag));
  // A lake: level ground in the elevation where the picture looks like water
  vec4 baked = texture2D(uShadowTex, vUv);
  float lake = baked.g * uLakeMix * waterLook(photoRgb);
  float waterMask = clamp(max(max(seaMask, inlandWater), lake), 0.0, 1.0);

  // --- Close-range micro detail: rock on steep walls, crown texture where canopy is high ----
  // Rendering treatment only. It appears when the imagery is magnified past its own resolution.
  float texelKm = mix(uOrthoTexelKm, uDetailTexelKm, insetWeight);
  // (none on a stand-in: its picture is coarse, and close to it the drawn texture aliases into waves)
  // and only where a pixel is under about half a crown (crowns are 14 to 22 m): on a coarse picture
  // the imagery is magnified at distances where the drawn crowns would be a pixel's stipple
  float detailResolves = 1.0 - smoothstep(0.006, 0.014, kmPerPx);
  float detailFade = smoothstep(1.6, 0.45, kmPerPx / max(texelKm, 1e-5)) * detailResolves * (1.0 - waterMask) * uMicroDetail;
  float rockMask = smoothstep(0.50, 1.05, trueSlope) * (1.0 - 0.75 * canopyK);
  float canopyMask = smoothstep(0.30, 0.75, canopyK) * (1.0 - smoothstep(0.9, 1.6, trueSlope));
  // On walls the imagery keeps only its color (see sampleOrtho), so the rock texture is drawn there
  // at any distance where it still resolves, not only when the imagery is magnified
  float wallFade = smoothstep(WALL_STRETCH_FROM, WALL_STRETCH_FULL, stretch) * bare
                 * (1.0 - smoothstep(0.010, 0.030, kmPerPx)) * (1.0 - waterMask) * uMicroDetail;
  float roughness = 0.9;
  if (detailFade > 0.01 || wallFade > 0.01) {
    // Isotropic km-like coordinates in stage space, so detail is not stretched by the exaggeration
    vec3 p = vWorldPos / (uUnitsPerMetre.x * 1000.0);
    vec3 wgt = pow(abs(N), vec3(4.0));
    wgt /= (wgt.x + wgt.y + wgt.z);

    // Rock: fractured faces, slightly banded on the side projections
    float rockTop = fbm2Lite(p.xz * 34.0);
    float rockX = fbm2Lite(vec2(p.z * 22.0, p.y * 58.0) + vec2(7.0, 3.0));
    float rockZ = fbm2Lite(vec2(p.x * 22.0, p.y * 58.0) + vec2(1.0, 9.0));
    float rockH = wgt.y * rockTop + wgt.x * rockX + wgt.z * rockZ;
    if (wallFade > 0.01) {
      // Beds across the face (they follow elevation, gently bent) break up the fall-line streaks
      float bend = (valueNoise2(p.xz * 2.3) - 0.5) * 0.14;
      float beds = fbm2Lite(vec2((vElevM * 0.001 + bend) * 38.0, dot(p.xz, vec2(0.71, 0.71)) * 3.0));
      rockH = mix(rockH, smoothstep(0.25, 0.75, 0.5 * (rockH + beds)), wallFade);
    }

    // Canopy: crown clusters about 16 m across, seen from above
    // (cluster size varies with a low-frequency term so it does not read as a regular stipple)
    float crownScale = 46.0 + 26.0 * valueNoise2(p.xz * 3.1);
    vec3 crown = worley2(p.xz * crownScale + vec2(13.0, 5.0));
    float crownH = 1.0 - smoothstep(0.0, 0.70, crown.x);

    float rockW = rockMask * max(detailFade, wallFade);
    float canopyW = canopyMask * detailFade;
    satRgb *= 1.0 + (rockH - 0.5) * mix(0.34, 0.85, wallFade) * rockW;
    satRgb *= mix(1.0, 0.84 + 0.24 * crownH + 0.08 * (crown.z - 0.5), canopyW);

    // Relief of the detail in world units (metres times the vertical scale)
    float hWorld = (rockH * 9.0 * rockMask * detailFade + crownH * 6.0 * canopyW) * uUnitsPerMetre.y;
    N = normalize(mix(N, perturbNormal(vWorldPos, N, hWorld), detailFade));
    roughness = mix(roughness, 0.55 + 0.35 * rockH, rockW);
  }

  // --- Lighting ------------------------------------------------------------------------------
  // Reference light is 1.0: there the imagery shows its own colors (it already carries the sun
  // of the day it was taken). A slope square to the sun gets about 1.15, level ground about 0.95,
  // a slope turned away or in cast shadow about 0.25, so relief reads by contrast.
  // Sun shadow is baked once per region with a soft edge (./shadowBake.ts).
  float shadow = mix(0.10, 1.0, baked.r);
  // The context terrain around the pack has no baked shadows and no sky view map. Toward the pack
  // edge both ease out to what the context uses, so the light does not step along the boundary.
  vec2 toPackEdge = min(vUv, 1.0 - vUv);
  float edgeEase = (1.0 - smoothstep(0.0, 0.07, min(toPackEdge.x, toPackEdge.y))) * uContextMix;
  shadow = mix(shadow, 1.0, edgeEase);
  // Soft shadow of the smoke column (see ./smokeVolume.ts). It dims sunlight, not emission.
  // Five taps soften it into a penumbra, and part of the light always gets through: thick smoke
  // dims the ground, it does not blot it out.
  float smokeT = 0.36 * texture2D(uSmokeShadowTex, vUv).r
               + 0.16 * (texture2D(uSmokeShadowTex, vUv + vec2(0.012, 0.007)).r
                       + texture2D(uSmokeShadowTex, vUv + vec2(-0.007, 0.012)).r
                       + texture2D(uSmokeShadowTex, vUv + vec2(-0.012, -0.007)).r
                       + texture2D(uSmokeShadowTex, vUv + vec2(0.007, -0.012)).r);
  float smokeShade = mix(1.0, mix(0.42, 1.0, smokeT), uSmokeShadowMix);
  float nDotL = max(0.0, dot(N, sunDir));
  float skyFill = 0.5 + 0.5 * N.y;
  float ao = mix(mix(0.34, 1.0, smoothstep(0.42, 0.98, skyView)), 0.92, edgeEase);
  vec3 sunIrradiance = uSunColor * (SUN_KEY * nDotL * shadow * smokeShade);
  vec3 ambientSky = mix(vec3(0.16, 0.19, 0.25), vec3(0.24, 0.27, 0.33), skyFill) * ao;
  vec3 lighting = ambientSky + sunIrradiance;
  vec3 litEarth = satRgb * lighting;

  // Broad sun sheen on bare rock, scaled by the detail roughness
  vec3 halfVec = normalize(sunDir + viewDir);
  float rockSpec = pow(max(0.0, dot(N, halfVec)), mix(64.0, 10.0, roughness))
                 * (1.0 - roughness) * 0.22 * rockMask * shadow * nDotL;
  litEarth += vec3(1.0, 0.96, 0.90) * rockSpec;

  // Relief shading term reused by flat data fills so they sit on the ground instead of floating
  float shadeTerm = clamp(nDotL * shadow * 1.15 + 0.22, 0.0, 1.0);

  if (waterMask > 0.02) {
    // Wind ruffles from two drifting noise fields. Regular wave trains read as stripes across
    // the whole sea from the distances the stage looks from.
    vec2 wq = vWorldPos.xz * 7.0;
    float rippleA = valueNoise2(wq + vec2(uTime * 0.21, uTime * 0.13)) - 0.5;
    float rippleB = valueNoise2(wq * 2.3 + vec2(7.0 - uTime * 0.17, 3.0 + uTime * 0.19)) - 0.5;
    float rippleFade = 1.0 - smoothstep(0.015, 0.09, kmPerPx);
    vec3 waterN = normalize(N + vec3(rippleA, 0.0, rippleB) * (0.05 * rippleFade * waterMask));
    float spec = pow(max(0.0, dot(waterN, halfVec)), 96.0) * shadow;
    float fresnel = pow(1.0 - max(0.0, dot(waterN, viewDir)), 4.0);
    // (the sea, from the elevation's 0 m, takes one deep tone as a lake does: imagery at sea is
    // often tiles of other dates and brightness)
    litEarth = waterSurface(litEarth, waterMask, lake, seaMask, fresnel, spec, uNight);
  }

  // Aerial perspective: Rayleigh and Mie scattering along the true-scale path from the camera
  // (see ./atmosphere.ts). Valleys and far slopes sit behind more air than ridges and near ones.
  vec3 toPointKm = (vWorldPos - cameraPosition) / (uUnitsPerMetre * 1000.0);
  float pathKm = length(toPointKm);
  float baseElevM = mix(uElevPrevRange.x, uElevNextRange.x, uMorph);
  float camAltKm = (baseElevM + cameraPosition.y / uUnitsPerMetre.y) * 0.001;
  // The stage is a miniature: a close view is in truth tens of kilometres away, and the full air
  // path would veil the foreground. Air near the camera therefore counts less (display choice).
  float hazeKm = pathKm * uHazeStrength * pathKm / (pathKm + HAZE_NEAR_KM);
  vec3 viewTrue = toPointKm / max(pathKm, 1e-4);
  vec3 hazeUnused;
  vec3 hazeTrans = atmAerialPerspective(
    camAltKm, vElevM * 0.001, hazeKm, dot(viewTrue, uSunTrue), uSunTransmittance, hazeUnused
  );
  // The light scattered into the path is whatever the dome draws behind this direction: sky near
  // and above the horizon, the floor when the view looks down. Distance therefore takes the ground
  // into exactly its backdrop, in every view and mode, and the far part of the slab never stands
  // out lighter or darker than what surrounds it.
  vec3 backdrop = atmBackdrop(
    uSkyView, viewTrue, normalize(uSunTrue), clamp(camAltKm, 0.02, ATM_TOP - 1.0),
    uSkyExposure, uFloorColor, uFloorHaze
  );
  vec3 hazeIn = backdrop * (1.0 - hazeTrans);
  // Surface radiance before the air in between (burned ground is composed from it below)
  vec3 litEarthClear = litEarth;
  litEarth = nightGrade(capSurface(litEarth * hazeTrans + hazeIn));
  // By night water gives back a dark sky: never brighter than the land beside it
  litEarth *= 1.0 - WATER_NIGHT_DIM * waterMask * uNight;

  // Sample 256x256 scientific solver fields
  vec4 f0 = textureLod(uFieldTex0, vUv, 0.0);
  vec4 f1 = textureLod(uFieldTex1, vUv, 0.0);
  vec4 field = mix(f0, f1, uFrameMix);

  float sensGate = max(0.015, uSensitivity * 0.42);
  float zHatNorm  = field.r;
  float sigmaNorm = field.g;

  // Orbital Sensor Split Curtain plane signed distance
  vec2 cutDir = normalize(uCutawayDir);
  float scanCoord = dot(vUv - vec2(0.5), cutDir) - uCutawayPlane;
  float posteriorSide = smoothstep(-0.0045, 0.0045, -scanCoord);
  float rawSide = 1.0 - posteriorSide;

  float showPosterior = clamp(uReconMix + uCutawayMix * posteriorSide, 0.0, 1.0);
  float showRawModis  = clamp(uCutawayMix * rawSide, 0.0, 1.0);

  vec3 finalRgb = litEarth;

  // ===========================================================================
  // A. HARMONIZED 375 M SIDE (OR FULL FIRE FIELD MODE): FIRE AS A SURFACE TREATMENT
  // Position, timing and strength come from the solver field. Shape below one cell is rendering.
  // ===========================================================================
  if (showPosterior > 0.005) {
    vec3 postRgb;
    if (uFootMix.x > 0.5) {
      // A real run. Two things are drawn and nothing is invented: no flames, no embers, no
      // burned ground.
      // 1. The model's estimate.
      if (uBeliefGrid.x > 0.5) {
        // The belief, in ink (see beliefMarks). By day a dark edge holds the ink on bright ground.
        vec3 ink = mix(vec3(1.30, 1.32, 1.36), vec3(0.40, 0.46, 0.56), uNight) * marks.z;
        postRgb = litEarth * (1.0 - 0.55 * marks.y * (1.0 - uNight) * hazeTrans.g);
        postRgb *= 1.0 - BELIEF_DAY_SHADE * marks.w * (1.0 - uNight) * hazeTrans.g;
        // (while the landing fades from one pass to the next the ink dips with the lights, so the
        // belief's change of time does not pop)
        postRgb = mix(postRgb, ink, marks.x * mix(0.84, 0.48, uBeliefQuiet) * mix(0.4, 1.0, uLightGain) * hazeTrans.g);
      } else {
        // No belief frames on show (the file has not come yet, or did not load): no estimate is
        // drawn. A tint read off the run's field used to stand in here; on a real field it washed
        // the whole block red, since that field is above its floor almost everywhere.
        postRgb = litEarth;
      }
      // 2. What the overpass on show detected, as emitted light, each detection in its own
      // footprint. A paired MODIS overpass (landing) belongs to the raw side only.
      // The light falls on the ground around it: the same light texture read at two coarse levels
      // (about half a kilometre and two kilometres wide), taken up by the ground's own colour. Where the
      // light is and how strong comes from the detections; how far it reaches is drawing.
      vec3 castLight = textureLod(uFireHist, vUv, 4.4).rgb * FIRE_CAST_NEAR + textureLod(uFireHist, vUv, 6.2).rgb * FIRE_CAST_FAR;
      // Eased toward a ceiling: a few very strong detections light their ridge, they do not flood it
      castLight /= 1.0 + FIRE_CAST_EASE * dot(castLight, vec3(0.3, 0.5, 0.2));
      postRgb += (satRgb + vec3(0.012)) * castLight * mix(0.3, 1.0, uNight) * (1.0 - 0.6 * waterMask) * hazeTrans * uFootMix.x * scanned * castShare;
      postRgb *= 1.0 - DAY_LIGHT_UNDER * clamp(lit.a, 0.0, 1.0) * (1.0 - uNight) * hazeTrans.g;
      postRgb += lit.rgb * hazeTrans.g;
      // The instrument's pixel around each light, when asked for: a faint warm hairline, so a
      // coarse pixel reads as coarse beside the model's finer cells
      if (uPixelOutline > 0.01) {
        float pixelHair = scanHairline(abs(foot.r), footGradM, 1.2) * (1.0 - uRevealed.x)
                        + scanHairline(abs(foot.b), footGradV, 1.2) * (1.0 - uRevealed.y);
        postRgb = mix(postRgb, vec3(1.05, 0.66, 0.42) * mix(1.0, 0.8, uNight), clamp(pixelHair, 0.0, 1.0) * 0.55 * uPixelOutline * scanned * hazeTrans.g);
      }
      // 3. Detections laid on after scoring (the hidden instrument of a blind run once it is
      // revealed, or what a look found): a filled blue square in each detection's own pixel. One
      // mark, the same for a look and for a reveal, never the warm light of a detection the
      // estimate was made from, and filled where the estimate's frames are open.
      if (uRevealed.x + uRevealed.y > 0.5) {
        // (a pixel's half width on screen is one over its field's gradient)
        float smallM = 1.0 - smoothstep(3.0, 9.0, 1.0 / footGradM);
        float smallV = 1.0 - smoothstep(3.0, 9.0, 1.0 / footGradV);
        float coreM = revealCore(foot.r, smallM) * uRevealed.x;
        float coreV = revealCore(foot.b, smallV) * uRevealed.y;
        // (they arrive behind a front that crosses the fire along the pass's own ground track: the
        // order the satellite acquired them in; the timing is drawing)
        float arrived = smoothstep(-uRevealArrive.w, 0.0, uRevealArrive.z - dot(pKm, uRevealArrive.xy));
        coreM *= arrived;
        coreV *= arrived;
        float core = clamp(coreM + coreV, 0.0, 1.0);
        float fewPx = max(smallM * uRevealed.x, smallV * uRevealed.y);
        // By day the ground under the square is drawn darker first, so the blue stands on sunlit
        // ground (display choice)
        postRgb *= 1.0 - REVEAL_DAY_UNDER * core * (1.0 - uNight) * hazeTrans.g;
        // Its strength follows the detection's fire power. Small squares run together: they are
        // drawn in a deeper blue there, so the patch they make stays apart from the estimate's ink
        float power = (coreM * mix(0.6, 1.2, heatOf(fieldNorm(foot.g))) + coreV * mix(0.6, 1.2, heatOf(fieldNorm(foot.a)))) / max(coreM + coreV, 1e-4);
        vec3 blue = mix(vec3(0.20, 0.62, 1.0), vec3(0.05, 0.42, 1.0), fewPx) * power * (1.0 + REVEAL_FAR_LIFT * uFarView);
        postRgb = mix(postRgb, blue, core * REVEAL_FILL * hazeTrans.g);
        // The estimate's ink stays on top, so a frame the hidden satellite filled reads as a white
        // frame with blue inside it: the two things the test compares, one over the other
        if (uBeliefGrid.x > 0.5) {
          vec3 inkOver = mix(vec3(1.30, 1.32, 1.36), vec3(0.62, 0.68, 0.78), uNight) * marks.z;
          postRgb = mix(postRgb, inkOver, marks.x * 0.84 * core * hazeTrans.g);
        }
      }
    } else {
      // Fuel from canopy cover (pack canopy index, or the imagery heuristic without a pack)
      float fuel = mix(0.30, 1.0, canopyK) * (1.0 - waterMask);

      FireSurface fire = evalFireSurface(vUv, pKm, kmPerPx, N, slopeMag, fuel, waterMask);

      // 1. Burned ground: char with pale ash where severity and fuel were high
      float grit = 0.80 + 0.40 * valueNoise2(pKm * 46.0);
      // Char keeps a share of the picture under it, so rock faces, gullies and roads still read
      // through the burn instead of the ground turning into flat dark paint with pale blotches.
      vec3 charAlbedo = (vec3(0.012, 0.011, 0.012) + satRgb * 0.22) * grit;
      vec3 ashAlbedo = (vec3(0.085, 0.082, 0.076) + satRgb * 0.30) * grit;
      vec3 burnAlbedo = mix(charAlbedo, ashAlbedo, fire.ash * 0.6);
      postRgb = mix(litEarthClear, burnAlbedo * lighting, fire.burned);

      // 2. Warm bounce light from nearby flames on the ground and canyon walls around them
      vec3 groundAlbedo = mix(satRgb, burnAlbedo, fire.burned);
      postRgb += groundAlbedo * fireBounceLight(vUv, N, fire.front) * (1.0 - 0.7 * waterMask);

      // The air in between tints the ground, not the flames
      postRgb = capSurface(postRgb * hazeTrans + hazeIn);

      // 3. Flaming front and ember bed (HDR, above the bloom threshold only at the front)
      postRgb = mix(postRgb, vec3(0.0), clamp(fire.front, 0.0, 1.0) * 0.85);
      postRgb += fire.emission;

      // 4. One standard deviation around the active fire line: where the estimate plus its sigma
      // and the estimate minus its sigma cross the fire threshold. This is the run's own sigma, not
      // an interval of a stated coverage. Hairlines from screen-space derivatives. Nothing is drawn
      // where a bound does not cross the threshold (for example an epoch in a swath gap, where
      // sigma is saturated).
      if (uUncertaintyMix > 0.01) {
        float zMw = zHatNorm * 80.0;
        float sMw = sigmaNorm * 24.0;
        float thrMw = FIRE_THR * 80.0;
        float upper = zMw + sMw - thrMw;
        float lower = zMw - sMw - thrMw;
        float gU = max(fwidth(upper), 1e-4);
        float gL = max(fwidth(lower), 1e-4);
        // Require a real gradient (MW/km2 per km) so flat plateaus near the threshold stay clean
        float steepU = smoothstep(0.6, 2.4, gU / max(kmPerPx, 1e-6));
        float steepL = smoothstep(0.6, 2.4, gL / max(kmPerPx, 1e-6));
        float lineU = (1.0 - smoothstep(0.55, 1.45, abs(upper) / gU)) * steepU;
        float lineL = (1.0 - smoothstep(0.40, 1.10, abs(lower) / gL)) * steepL;
        float boundsMask = uUncertaintyMix * (1.0 - waterMask * 0.85) * (1.0 - fire.front);
        postRgb = mix(postRgb, vec3(0.20, 0.66, 1.0), lineU * 0.62 * boundsMask);
        postRgb = mix(postRgb, vec3(0.72, 0.90, 1.0), lineL * 0.38 * boundsMask);
      }
    }

    finalRgb = mix(finalRgb, postRgb, showPosterior);
  }

  // ===========================================================================
  // B. RAW MODIS SIDE: GROUND-PROJECTED SCAN CELLS OF THE ACTUAL OVERPASS
  // Cells are flat. Nothing is extruded. The fill is the per-cell value of the MODIS channel.
  // ===========================================================================
  if (showRawModis > 0.005) {
    // 1. Cool slate rendition of the terrain so the data layer reads as an instrument view
    float irContrast = clamp((pow(max(satLuma, 0.0005), 0.45) - 0.24) * 1.42 + 0.34, 0.04, 0.96);
    float irShade = irContrast * (0.42 + 0.58 * nDotL * shadow);
    vec3 slateIr = nightGrade(mix(vec3(0.018, 0.028, 0.048), vec3(0.22, 0.30, 0.42), irShade));
    // With context terrain around the pack the rendition fades out before the edge of the data,
    // so the instrument view ends in the landscape and not along a straight line across it
    float slateShare = 0.82 * mix(1.0, smoothstep(0.0, 0.10, min(toPackEdge.x, toPackEdge.y)), uContextMix);
    vec3 rawPassRgb = mix(litEarth, slateIr, slateShare);

    float modisFloor = 0.105 * (0.55 + 0.65 * uSensitivity);
    float modisLit = 0.0;

    if (uFootMix.x > 0.5) {
      // Real run: every MODIS detection as emitted light in its own footprint (scan by track
      // km), with a faint hairline around the pixel: this side is the instrument's view. No empty
      // cells: the source lists detections, not where the sensor looked and saw nothing.
      modisLit = step(0.001, -foot.r);
      rawPassRgb += lit.rgb * uLightModis * hazeTrans.g * (1.0 - step(0.001, uAfterglow));
      float hair = scanHairline(abs(foot.r), footGradM, 1.6) * scanLitFade(1.0 / footGradM);
      rawPassRgb = mix(rawPassRgb, vec3(0.80, 0.87, 0.96), hair * 0.34);
    } else if (uModisPass.w > 0.5) {
      ScanDraw md = evalScanDraw(pKm, kmPerPx, uModisPass, MODIS_SENSOR, MODIS_ORBIT_K, vec4(0.0, 0.0, 1.0, 0.0));
      float mScaled = clamp((md.value - modisFloor) / 0.35, 0.0, 1.0);
      modisLit = step(0.035, mScaled);

      // 2. Flat radiometric fill: the cell value read straight off the intensity scale of the
      // legend (Lipari, 0 to 80 MW/km2 across the ramp), with no remapping.
      // The fill is translucent and takes the relief shading, so the ground reads through it.
      vec3 fill = pictureToScene(texture2D(uLipariTex, vec2(clamp(md.value, 0.005, 0.995), 0.5)).rgb);
      fill *= mix(0.62, 1.30, shadeTerm);
      rawPassRgb = mix(rawPassRgb, fill + rawPassRgb * 0.30, modisLit * 0.66);

      // 3. Hairline borders (constant width in device pixels). A cell that holds a detection gets
      // a crisp light border so it reads as one discrete sensor cell; the lattice over empty
      // ground stays faint.
      float hairFade = mix(scanEmptyFade(md.cellPx, 26.0), scanLitFade(md.cellPx), modisLit);
      vec3 hairEmpty = vec3(0.36, 0.47, 0.62);
      vec3 hairLit = vec3(0.93, 0.91, 0.86);
      rawPassRgb = mix(rawPassRgb, hairEmpty, md.hair * hairFade * 0.30 * (1.0 - modisLit) * uLatticeMix);
      rawPassRgb = mix(rawPassRgb, hairLit, md.hairLit * hairFade * 0.92 * modisLit);
      rawPassRgb = mix(rawPassRgb, vec3(0.50, 0.62, 0.78), md.seam * hairFade * 0.45 * (1.0 - modisLit) * uLatticeMix);
    }

    // 4. Amber hairline hatch where the harmonized record has fire and this MODIS pass reports none
    // Only on a frame that has a MODIS overpass: without one, MODIS missed nothing, it did not look
    float missedMask = smoothstep(0.11, 0.24, zHatNorm) * (1.0 - modisLit) * (1.0 - waterMask)
                     * step(0.5, uModisPass.w) * (1.0 - step(0.5, uFootMix.x));
    if (missedMask > 0.01) {
      float spacingKm = 0.30;
      float hatchDistKm = abs(fract((pKm.x + pKm.y) / spacingKm) - 0.5) * spacingKm * 0.7071;
      float hatch = scanHairline(hatchDistKm, kmPerPx, 1.1)
                  * smoothstep(3.0, 7.0, spacingKm * 0.7071 / max(kmPerPx, 1e-6));
      rawPassRgb = mix(rawPassRgb, vec3(0.86, 0.46, 0.10), missedMask * (0.10 + 0.62 * hatch));
    }

    finalRgb = mix(finalRgb, rawPassRgb, showRawModis);
  }

  // ===========================================================================
  // C. SATELLITE PASSES MODE: SCAN CELLS OF BOTH SENSORS, COLORED BY SENSOR IDENTITY
  // ===========================================================================
  if (uObserverMix > 0.005) {
    float earthLuma = dot(litEarth, vec3(0.2126, 0.7152, 0.0722));
    vec3 obsRgb = mix(litEarth, vec3(earthLuma), 0.35) * 0.80;

    if (uModisWeight > 0.01 && uFootMix.x > 0.5) {
      // Real run: the detections themselves, as light in the sensor's colour, each in its own footprint
      obsRgb += vec3(1.0, 0.36, 0.10) * (0.55 * lit.a * uLightModis) * uModisWeight * (1.0 - step(0.001, uAfterglow));
      float hair = scanHairline(abs(foot.r), footGradM, 1.6);
      obsRgb = mix(obsRgb, vec3(1.0, 0.87, 0.78), hair * 0.60 * uModisWeight);
    } else if (uModisWeight > 0.01 && uModisPass.w > 0.5) {
      ScanDraw md = evalScanDraw(pKm, kmPerPx, uModisPass, MODIS_SENSOR, MODIS_ORBIT_K, vec4(0.0, 0.0, 1.0, 0.0));
      float s = clamp((md.value - sensGate) / 0.35, 0.0, 1.0);
      float lit = step(0.02, s);
      vec3 fill = mix(vec3(0.30, 0.05, 0.015), vec3(1.0, 0.36, 0.10), pow(s, 0.7)) * (0.86 + 0.22 * shadeTerm);
      obsRgb = mix(obsRgb, fill, lit * 0.90 * uModisWeight);
      float hairFade = mix(scanEmptyFade(md.cellPx, 26.0), scanLitFade(md.cellPx), lit);
      obsRgb = mix(obsRgb, vec3(0.62, 0.36, 0.24), md.hair * hairFade * 0.24 * (1.0 - lit) * uModisWeight);
      obsRgb = mix(obsRgb, vec3(1.0, 0.87, 0.78), md.hairLit * hairFade * 0.90 * lit * uModisWeight);
      obsRgb = mix(obsRgb, vec3(0.78, 0.50, 0.36), md.seam * hairFade * 0.40 * (1.0 - lit) * uModisWeight);
    }

    if (uViirsWeight > 0.01 && uFootMix.y > 0.5) {
      obsRgb += vec3(0.16, 0.70, 1.0) * (0.55 * lit.a * (1.0 - uLightModis)) * uViirsWeight;
      float hair = scanHairline(abs(foot.b), footGradV, 1.3);
      obsRgb = mix(obsRgb, vec3(0.84, 0.96, 1.0), hair * 0.50 * uViirsWeight);
    } else if (uViirsWeight > 0.01 && uViirsPass.w > 0.5) {
      ScanDraw vd = evalScanDraw(pKm, kmPerPx, uViirsPass, VIIRS_SENSOR, VIIRS_ORBIT_K, vec4(0.0, 0.0, 0.0, 1.0));
      float s = clamp((vd.value - sensGate * 0.45) / 0.35, 0.0, 1.0);
      float lit = step(0.02, s);
      vec3 fill = mix(vec3(0.02, 0.16, 0.26), vec3(0.16, 0.70, 1.0), pow(s, 0.7)) * (0.86 + 0.22 * shadeTerm);
      obsRgb = mix(obsRgb, fill, lit * 0.92 * uViirsWeight);
      // The 375 m lattice over empty ground appears only once its cells are large on screen
      float hairFade = mix(scanEmptyFade(vd.cellPx, 54.0), scanLitFade(vd.cellPx), lit);
      obsRgb = mix(obsRgb, vec3(0.30, 0.52, 0.66), vd.hair * hairFade * 0.20 * (1.0 - lit) * uViirsWeight);
      obsRgb = mix(obsRgb, vec3(0.84, 0.96, 1.0), vd.hairLit * hairFade * 0.85 * lit * uViirsWeight);
      obsRgb = mix(obsRgb, vec3(0.42, 0.68, 0.84), vd.seam * hairFade * 0.40 * (1.0 - lit) * uViirsWeight);
    }

    if (uModisWeight > 0.01 && uModisPass.w > 0.5 && uScanStrip.y > 0.004) {
      obsRgb = scanStripMark(obsRgb, pKm, kmPerPx, uModisPass, MODIS_SENSOR, MODIS_ORBIT_K,
                             vec2(uScanStrip.x, uScanStrip.y * uModisWeight), vec3(1.0, 0.74, 0.52));
    }
    if (uViirsWeight > 0.01 && uViirsPass.w > 0.5 && uScanStrip.w > 0.004) {
      obsRgb = scanStripMark(obsRgb, pKm, kmPerPx, uViirsPass, VIIRS_SENSOR, VIIRS_ORBIT_K,
                             vec2(uScanStrip.z, uScanStrip.w * uViirsWeight), vec3(0.72, 0.93, 1.0));
    }

    finalRgb = mix(finalRgb, obsRgb, uObserverMix);
  }

  // ===========================================================================
  // D. RAZOR-SHARP OPTICAL LASER LINE WHERE THE 3D GLASS CURTAIN SLICES TERRAIN
  // ===========================================================================
  if (uCutawayMix > 0.01) {
    // Hairline of constant screen width where the curtain meets the ground, with a tight halo.
    // Instrument graphics stay under the bloom threshold: only fire is allowed to bloom.
    float cutKm = abs(scanCoord) * length(cutDir * uExtentKm);
    float scanLine = scanHairline(cutKm, kmPerPx, 1.6) * uCutawayMix;
    // Over open water the seam is a straight bright bar to the horizon, so it is drawn fainter there
    float scanHalo = exp(-cutKm / max(0.10, 7.0 * kmPerPx)) * uCutawayMix * (1.0 - 0.8 * waterMask);
    scanLine *= 1.0 - 0.6 * waterMask;
    // By night the seam is kept quiet: the fire is the brightest thing in the frame
    finalRgb += (vec3(0.35, 0.82, 1.0) * scanHalo * 0.15 + vec3(0.92, 0.99, 1.0) * scanLine * 0.70)
              * mix(1.0, 0.22, uNight);
  }

  // The scan front of a pass that is arriving: one hairline across the ground. Warm for a
  // pass the estimate takes in, in ink and broken for a pass kept from it.
  if (uScan.w > 0.001) {
    float behindKm = uScan.z - scanAlong;
    float frontLine = scanHairline(abs(behindKm), max(length(vec2(dFdx(scanAlong), dFdy(scanAlong))), 1e-6), 1.4);
    float acrossKm = dot(pKm, vec2(-uScan.y, uScan.x));
    float dashKm = 7.0 * max(length(vec2(dFdx(acrossKm), dFdy(acrossKm))), 1e-6);
    float broken = mix(1.0, step(0.5, fract(acrossKm / exp2(floor(log2(dashKm))))), uHeldOut);
    vec3 scanRgb = mix(vec3(1.25, 1.02, 0.74), mix(vec3(1.16, 1.18, 1.22), vec3(0.62, 0.68, 0.78), uNight), uHeldOut);
    finalRgb = mix(finalRgb, scanRgb, frontLine * broken * 0.9 * uScan.w * hazeTrans.g);
  }

  // The board of tiles, over every view of the ground
  if (uTileGrid.x > 0.5) {
    vec3 tileInk = mix(vec3(1.16, 1.18, 1.22), vec3(0.62, 0.68, 0.78), uNight) * tiles.z;
    finalRgb *= 1.0 - 0.5 * tiles.y * (1.0 - uNight) * hazeTrans.g;
    finalRgb = mix(finalRgb, tileInk, tiles.x * hazeTrans.g);
  }

  // Close views: the far edge of the slab dissolves into what the dome draws behind it (sky, or
  // the hazy floor under the horizon), so the view ends in air and not at the cut edge of a model.
  // Overview and nadir keep the edge.
  // The same share of the surface also sinks to the base, and ground that stands above the
  // horizon is left alone (see edgeGone and edgeGoneAt in the heightfield code).
  float gone = edgeGone(vUv) * belowHorizon(vWorldPos);
  finalRgb = mix(finalRgb, nightGrade(backdrop), gone);

  // Subtle top bevel edge highlight around the 4 outer cut boundaries of the slab. Where the land
  // around the box is drawn there is no cut boundary, and no line
  float borderDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float rimBevel = 1.0 - smoothstep(0.0, 0.0028, borderDist);
  finalRgb = mix(finalRgb, finalRgb + vec3(0.14, 0.17, 0.22), rimBevel * 0.65 * (1.0 - gone) * (1.0 - uContextMix));

  gl_FragColor = vec4(finalRgb, 1.0);
}
`;
