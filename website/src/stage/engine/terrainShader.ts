import { COMMON_HEIGHTFIELD_GLSL, SLAB_D, SLAB_W } from '../earthCutawayShaders';
import { SCAN_LATTICE_GLSL } from './scanGeometry';

// =============================================================================
// TERRAIN SURFACE SHADERS
// The surface is never displaced by data: sensor cells and fire are drawn on the ground.
// All output is scene-linear HDR radiance (see ./hdrPipeline.ts).
// =============================================================================
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

  vec4 worldPos = modelMatrix * vec4(position.x, baseY, position.z, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const TERRAIN_FRAGMENT_SHADER = /* glsl */ `
${COMMON_HEIGHTFIELD_GLSL}
${SCAN_LATTICE_GLSL}

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
uniform vec2 uExtentKm;   // region size on the ground (east-west, north-south)
uniform vec4 uModisPass;  // (scan axis east, scan axis north, nadir distance km, valid)
uniform vec4 uViirsPass;
uniform float uHasSeaCoast;

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vBaseY;
varying float vElevM;

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

// A sensor overpass is one discrete observation, so cell values come from the nearest epoch
// instead of a blend of two.
vec4 sampleFieldNearestEpoch(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.002), vec2(0.998));
  return mix(texture2D(uFieldTex0, c), texture2D(uFieldTex1, c), step(0.5, uFrameMix));
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
  float seam;    // hairline coverage of the scan-to-scan seam, scaled by the bow-tie overlap
  float cellPx;  // smaller cell dimension in device pixels
};

ScanDraw evalScanDraw(vec2 pKm, float kmPerPx, vec4 pass, vec4 sensor, float k, vec4 channelMask) {
  ScanDraw d;
  ScanCell cell = evalScanCell(pKm, pass, sensor, k);
  d.value = scanCellValue(cell, pass.xy, channelMask);
  d.cellPx = min(cell.sizeKm.x, cell.sizeKm.y) / max(kmPerPx, 1e-6);
  d.hair = scanHairline(cell.edgeKm, kmPerPx, 1.15);
  d.seam = scanHairline(cell.seamKm, kmPerPx, 1.9) * smoothstep(0.04, 0.35, cell.overlap);
  return d;
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
  // Relief shading term reused by flat data fills so they sit on the ground instead of floating
  float shadeTerm = clamp(nDotL * shadow * 1.15 + 0.22, 0.0, 1.0);

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

    // Scene-linear HDR radiance: the hottest cores of the solver field rise well above 1.0 so the
    // composer bloom picks them up; the body of the band stays below the bloom threshold.
    float flameHdr = 1.0 + 6.0 * smoothstep(0.35, 1.0, zCurved);
    vec3 postRgb = mix(burnScarRgb, flameLinear * shimmer * flameHdr, clamp(flameAlpha, 0.0, 1.0));

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
  // B. RAW MODIS SIDE: GROUND-PROJECTED SCAN CELLS OF THE ACTUAL OVERPASS
  // Cells are flat. Nothing is extruded. The fill is the per-cell value of the MODIS channel.
  // ===========================================================================
  if (showRawModis > 0.005) {
    // 1. Cool slate rendition of the terrain so the data layer reads as an instrument view
    float irContrast = clamp((pow(max(satLuma, 0.0005), 0.45) - 0.24) * 1.42 + 0.34, 0.04, 0.96);
    float irShade = irContrast * (0.42 + 0.58 * nDotL * shadow);
    vec3 slateIr = mix(vec3(0.018, 0.028, 0.048), vec3(0.22, 0.30, 0.42), irShade);
    vec3 rawPassRgb = mix(litEarth, slateIr, 0.82);

    float modisFloor = 0.105 * (0.55 + 0.65 * uSensitivity);
    float modisLit = 0.0;

    if (uModisPass.w > 0.5) {
      ScanDraw md = evalScanDraw(pKm, kmPerPx, uModisPass, MODIS_SENSOR, MODIS_ORBIT_K, vec4(0.0, 0.0, 1.0, 0.0));
      float mScaled = clamp((md.value - modisFloor) / 0.35, 0.0, 1.0);
      modisLit = step(0.035, mScaled);

      // 2. Flat radiometric fill on the same Lipari scale as the harmonized side
      vec3 fill = texture2D(uLipariTex, vec2(clamp(0.22 + pow(mScaled, 0.78) * 0.74, 0.01, 0.99), 0.5)).rgb;
      fill *= mix(0.72, 1.12, shadeTerm);
      rawPassRgb = mix(rawPassRgb, fill, modisLit * 0.94);

      // 3. Hairline cell borders and scan seams (constant width in device pixels)
      float hairFade = mix(scanEmptyFade(md.cellPx, 26.0), scanLitFade(md.cellPx), modisLit);
      vec3 hairEmpty = vec3(0.36, 0.47, 0.62);
      vec3 hairLit = min(fill * 1.35 + vec3(0.10), vec3(1.0));
      rawPassRgb = mix(rawPassRgb, mix(hairEmpty, hairLit, modisLit), md.hair * hairFade * mix(0.30, 0.85, modisLit));
      rawPassRgb = mix(rawPassRgb, vec3(0.50, 0.62, 0.78), md.seam * hairFade * 0.45 * (1.0 - modisLit));
    }

    // 4. Amber hairline hatch where the harmonized record has fire and this MODIS pass reports none
    float missedMask = smoothstep(0.11, 0.24, zHatNorm) * (1.0 - modisLit) * (1.0 - waterMask);
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

    if (uModisWeight > 0.01 && uModisPass.w > 0.5) {
      ScanDraw md = evalScanDraw(pKm, kmPerPx, uModisPass, MODIS_SENSOR, MODIS_ORBIT_K, vec4(0.0, 0.0, 1.0, 0.0));
      float s = clamp((md.value - sensGate) / 0.35, 0.0, 1.0);
      float lit = step(0.02, s);
      vec3 fill = mix(vec3(0.30, 0.05, 0.015), vec3(1.0, 0.36, 0.10), pow(s, 0.7)) * (0.86 + 0.22 * shadeTerm);
      obsRgb = mix(obsRgb, fill, lit * 0.90 * uModisWeight);
      float hairFade = mix(scanEmptyFade(md.cellPx, 26.0), scanLitFade(md.cellPx), lit);
      vec3 hairCol = mix(vec3(0.62, 0.36, 0.24), min(fill * 1.4 + vec3(0.08), vec3(1.0)), lit);
      obsRgb = mix(obsRgb, hairCol, md.hair * hairFade * mix(0.24, 0.85, lit) * uModisWeight);
      obsRgb = mix(obsRgb, vec3(0.78, 0.50, 0.36), md.seam * hairFade * 0.40 * (1.0 - lit) * uModisWeight);
    }

    if (uViirsWeight > 0.01 && uViirsPass.w > 0.5) {
      ScanDraw vd = evalScanDraw(pKm, kmPerPx, uViirsPass, VIIRS_SENSOR, VIIRS_ORBIT_K, vec4(0.0, 0.0, 0.0, 1.0));
      float s = clamp((vd.value - sensGate * 0.45) / 0.35, 0.0, 1.0);
      float lit = step(0.02, s);
      vec3 fill = mix(vec3(0.02, 0.16, 0.26), vec3(0.16, 0.70, 1.0), pow(s, 0.7)) * (0.86 + 0.22 * shadeTerm);
      obsRgb = mix(obsRgb, fill, lit * 0.92 * uViirsWeight);
      // The 375 m lattice over empty ground appears only once its cells are large on screen
      float hairFade = mix(scanEmptyFade(vd.cellPx, 54.0), scanLitFade(vd.cellPx), lit);
      vec3 hairCol = mix(vec3(0.30, 0.52, 0.66), min(fill * 1.4 + vec3(0.08), vec3(1.0)), lit);
      obsRgb = mix(obsRgb, hairCol, vd.hair * hairFade * mix(0.20, 0.80, lit) * uViirsWeight);
      obsRgb = mix(obsRgb, vec3(0.42, 0.68, 0.84), vd.seam * hairFade * 0.40 * (1.0 - lit) * uViirsWeight);
    }

    finalRgb = mix(finalRgb, obsRgb, uObserverMix);
  }

  // ===========================================================================
  // D. RAZOR-SHARP OPTICAL LASER LINE WHERE THE 3D GLASS CURTAIN SLICES TERRAIN
  // ===========================================================================
  if (uCutawayMix > 0.01) {
    float scanLine = exp(-abs(scanCoord) * 280.0) * uCutawayMix;
    float scanHalo = exp(-abs(scanCoord) * 58.0) * uCutawayMix;
    // Instrument graphics stay under the bloom threshold: only fire is allowed to bloom
    finalRgb += vec3(0.35, 0.82, 1.0) * scanHalo * 0.24 + vec3(0.92, 0.99, 1.0) * scanLine * 0.66;
  }

  // Subtle top bevel edge highlight around the 4 outer cut boundaries of the slab
  float borderDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float rimBevel = 1.0 - smoothstep(0.0, 0.0028, borderDist);
  finalRgb = mix(finalRgb, finalRgb + vec3(0.14, 0.17, 0.22), rimBevel * 0.65);

  gl_FragColor = vec4(finalRgb, 1.0);
}
`;
