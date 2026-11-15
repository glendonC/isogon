import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useOptionalWorkspace,
  formatCountNone,
  formatCountWord,
  formatListAnd,
  formatSheetCount,
} from '../components/BlindScoreTable';
import { EvidenceSheet } from '../components/EvidenceSheet';
import { SoundControl } from '../audio';
import type { EvidenceDoc, EvidenceState } from '../content/evidence';
import type { PartId, PartStatus } from '../content/partsStatus';
import { getJson, publicUrl } from '../lib/api';
import '../styles/landing-below.css';

type BlockVisualKind = 'record' | 'estimate' | 'test' | 'play';

interface RecordLandingData {
  from: string;
  region_id: string;
  place: string;
  years: [number, number];
  sharp_year: number;
  overlap_ratio: number;
  max_raw: number;
  max_one_scale: number;
  cells: Array<[number, number, number]>;
}

interface EstimateTestLandingData {
  from: string;
  region_id: string;
  place: string;
  start: string;
  modis_time_utc: string;
  viirs_time_utc: string;
  grid: { cols: number; rows: number; cell_km: number };
  elev_m?: [number, number];
  dem_u16_b64?: string;
  coarse: Array<[number, number, number]>;
  estimate: Array<[number, number]>;
  sharp: Array<[number, number, number]>;
}

interface PlayLandingData {
  from: string;
  region_id: string;
  start: string;
  player: string;
  tiles: [number, number];
  budget: number;
  grid: { cols: number; rows: number };
  elev_m?: [number, number];
  dem_u16_b64?: string;
  tile_unsure: number[];
  coarse: Array<[number, number, number]>;
  looks: Array<{
    order: number;
    tile: number;
    time_utc: string;
    pixels: number;
    reward: number;
    cells: Array<[number, number, number]>;
  }>;
}

interface CalendarRouteSlice {
  place?: { name?: string };
  region_name?: string;
  summary_metrics?: {
    first_month?: string;
    viirs_to_modis_overlap_ratio?: number;
    held_out_median_abs_relative_error?: number;
    held_out_median_abs_relative_error_without_harmonization?: number;
  };
  regime_markers?: Array<{
    year_month?: string;
    label?: string;
  }>;
}

interface RegionsRouteSlice {
  places?: Array<{
    id?: string;
    name?: string;
    rows?: string;
  }>;
}

interface NextLookOnValidationSlice {
  episodes?: number;
  budget?: number;
  differences?: {
    least_sure_minus_random?: {
      episodes_a_ahead?: number;
    };
    learned_minus_least_sure?: {
      p05?: number;
    };
  };
}

/* ============================================================================
   Raw WebGL1 Shared Renderer (one context for the page, one triangle, 4 shaders)
   ============================================================================ */

const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG_COMMON = `
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uDpr;
uniform float uTime;
uniform sampler2D uData;
uniform vec4 uMeta;

const vec3 INK_NIGHT = vec3(0.0314, 0.0431, 0.0667);
const vec3 INK_PLATE = vec3(0.0588, 0.0784, 0.1137);
const vec3 INK_RIDGE = vec3(0.1320, 0.1620, 0.2180);
const vec3 INK_RULE  = vec3(0.1686, 0.1882, 0.2275);
const vec3 INK_EDGE  = vec3(0.4863, 0.5137, 0.5725);
const vec3 INK_MODIS = vec3(0.7059, 0.7647, 0.8392);
const vec3 INK_SHARP = vec3(0.9412, 0.5412, 0.2706);
const vec3 INK_EST   = vec3(0.9529, 0.9569, 0.9647);

float staticGrain(vec2 fragPx) {
  vec2 cell = floor(fragPx * 0.5);
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453) - 0.5;
}
`;

const FRAG_TERRAIN_LIB = `
// Bilinear lookup of the 64x64 Feather River DEM stored in rows 64..127 of the 64x128 uData texture.
// .r = normalized elevation, .g = directional canyon hillshade, .b = ridge curvature highlight.
vec3 sampleDem(vec2 domUv) {
  vec2 p = clamp(domUv, 0.0, 1.0) * 63.0;
  vec2 i0 = floor(p);
  vec2 f = fract(p);
  vec2 i1 = min(i0 + 1.0, vec2(63.0));
  vec3 s00 = texture2D(uData, vec2((i0.x + 0.5) / 64.0, (64.0 + i0.y + 0.5) / 128.0)).rgb;
  vec3 s10 = texture2D(uData, vec2((i1.x + 0.5) / 64.0, (64.0 + i0.y + 0.5) / 128.0)).rgb;
  vec3 s01 = texture2D(uData, vec2((i0.x + 0.5) / 64.0, (64.0 + i1.y + 0.5) / 128.0)).rgb;
  vec3 s11 = texture2D(uData, vec2((i1.x + 0.5) / 64.0, (64.0 + i1.y + 0.5) / 128.0)).rgb;
  return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
}

float terrainY(vec2 xz, vec2 span, float elevScale) {
  vec2 uv = xz / span + 0.5;
  vec2 over = abs(uv - 0.5) - 0.5;
  float outside = length(max(over, 0.0));
  float falloff = exp(-outside * 9.0);
  return sampleDem(uv).r * elevScale * falloff;
}

vec3 traceCanyon(vec3 ro, vec3 rd, vec2 span, float elevScale, out float hitMask) {
  float topY = elevScale + 0.02;
  float tMin = max(0.01, (topY - ro.y) / rd.y);
  float tMax = (0.0 - ro.y) / rd.y;
  if (rd.y >= -0.02 || tMax <= 0.0) {
    hitMask = 0.0;
    return vec3(0.0);
  }
  float dt = (tMax - tMin) / 28.0;
  float tPrev = tMin;
  float tCurr = tMin;
  bool crossed = false;
  for (int i = 0; i < 28; i++) {
    tCurr = tMin + float(i + 1) * dt;
    vec3 p = ro + rd * tCurr;
    if (p.y <= terrainY(p.xz, span, elevScale)) {
      crossed = true;
      break;
    }
    tPrev = tCurr;
  }
  if (crossed) {
    float a = tPrev;
    float b = tCurr;
    for (int j = 0; j < 4; j++) {
      float mid = 0.5 * (a + b);
      vec3 pm = ro + rd * mid;
      if (pm.y <= terrainY(pm.xz, span, elevScale)) b = mid;
      else a = mid;
    }
    tCurr = 0.5 * (a + b);
  } else {
    tCurr = tMax;
  }
  hitMask = 1.0;
  return ro + rd * tCurr;
}

vec3 baseCanyonInk(vec3 dem, float fade) {
  float h = dem.r;
  float shade = dem.g;
  float ridge = dem.b;
  vec3 base = mix(INK_NIGHT, INK_RIDGE, clamp(shade * 0.88 + h * 0.18, 0.0, 1.0));
  base += INK_MODIS * (ridge * 0.09);

  // Subtle topographic contour lines every ~1/10th of canyon relief.
  float cPhase = fract(h * 10.0);
  float cLine = 1.0 - smoothstep(0.0, 0.07, min(cPhase, 1.0 - cPhase));
  base = mix(base, INK_EDGE, cLine * 0.22);

  return mix(INK_NIGHT, base, fade);
}
`;

// 1. Record: Feather River 2000-2025 orbital chronograph + annual rate bars flattening onto one scale.
const FRAG_RECORD = `${FRAG_COMMON}
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 px = uv * uResolution;
  float padX = 24.0 * uDpr;
  float padY = 20.0 * uDpr;
  vec2 inner = max(vec2(1.0), uResolution - vec2(padX * 2.0, padY * 2.0));
  vec2 local = (px - vec2(padX, padY)) / inner;

  vec3 col = INK_NIGHT;

  float cycle = mod(uTime, 9.6);
  float revealProgress = clamp(cycle / 3.0, 0.0, 1.0);
  float flatten = smoothstep(3.5, 6.3, cycle) * (1.0 - smoothstep(8.7, 9.5, cycle));
  float shownYears = revealProgress * 26.0;

  if (local.x >= 0.0 && local.x < 1.0 && local.y >= 0.0 && local.y < 1.0) {
    float yearIdx = floor(local.x * 26.0);
    float yearFrac = fract(local.x * 26.0);
    float yearPxW = inner.x / 26.0;
    float gapX = clamp((2.0 * uDpr) / max(4.0, yearPxW), 0.08, 0.24);

    float yearAppear = clamp(shownYears - yearIdx, 0.0, 1.0);
    bool isSharpEra = yearIdx >= 12.0;

    // Top 28%: 26 annual rate columns showing the 2012 jump settling onto one scale.
    if (local.y < 0.28) {
      float barAreaY = local.y / 0.28;
      vec4 ann = texture2D(uData, vec2((yearIdx + 0.5) / 32.0, 12.5 / 16.0));
      float hVal = mix(ann.r, ann.g, flatten) * yearAppear;
      float fromBottom = 1.0 - barAreaY;
      if (yearFrac > gapX && yearFrac < 1.0 - gapX) {
        if (fromBottom <= hVal && hVal > 0.008) {
          vec3 rawBarInk = isSharpEra
            ? mix(INK_MODIS, INK_SHARP, clamp(0.45 + hVal * 0.65, 0.0, 1.0))
            : mix(INK_EDGE, INK_MODIS, 0.85);
          vec3 oneBarInk = mix(INK_MODIS, INK_SHARP, clamp(hVal * 1.15 - 0.12, 0.0, 1.0));
          col = mix(rawBarInk, oneBarInk, flatten);
          // Crisp bright cap on each active year bar.
          if ((hVal - fromBottom) * inner.y * 0.28 < 1.6 * uDpr) {
            col = mix(col, INK_EST, 0.55);
          }
        } else if (fromBottom < 0.04) {
          col = mix(INK_NIGHT, INK_RULE, 0.55 * yearAppear);
        }
      }
      if (abs(barAreaY - 1.0) * inner.y * 0.28 < 1.0 * uDpr) {
        col = mix(INK_NIGHT, INK_RULE, 0.85);
      }
    } else if (local.y >= 0.34 && local.y <= 0.95) {
      // Middle 61%: 26 years x 12 months detection matrix.
      float gridY = (local.y - 0.34) / 0.61;
      float monthIdx = floor(gridY * 12.0);
      float monthFrac = fract(gridY * 12.0);
      float monthPxH = (inner.y * 0.61) / 12.0;
      float gapY = clamp((2.0 * uDpr) / max(4.0, monthPxH), 0.10, 0.26);

      vec4 cell = texture2D(uData, vec2((yearIdx + 0.5) / 32.0, (monthIdx + 0.5) / 16.0));
      bool validMonth = cell.b >= 0.1;

      if (validMonth && yearAppear > 0.01) {
        float v = mix(cell.r, cell.g, flatten) * yearAppear;
        bool insideCell = yearFrac > gapX && yearFrac < 1.0 - gapX && monthFrac > gapY && monthFrac < 1.0 - gapY;

        if (v > 0.035 && insideCell) {
          float lift = pow(clamp(v, 0.0, 1.0), 0.82);
          vec3 rawInk = isSharpEra
            ? mix(INK_PLATE, INK_SHARP, clamp(0.28 + lift * 0.92, 0.0, 1.0))
            : mix(INK_PLATE, INK_MODIS, clamp(0.28 + lift * 0.92, 0.0, 1.0));
          vec3 oneInk = mix(
            INK_PLATE,
            mix(INK_MODIS, INK_SHARP, smoothstep(0.18, 0.72, lift)),
            clamp(0.32 + lift * 0.9, 0.0, 1.0)
          );
          col = mix(rawInk, oneInk, flatten);
          if (lift > 0.78) {
            col = mix(col, INK_EST, (lift - 0.78) * 1.4);
          }
        } else {
          // Quiet months sit as tiny centre micro-ticks rather than a heavy grey spreadsheet block.
          vec2 dCenter = abs(vec2(yearFrac - 0.5, monthFrac - 0.5)) * vec2(yearPxW, monthPxH);
          if (dCenter.x < 1.1 * uDpr && dCenter.y < 1.1 * uDpr) {
            col = mix(INK_NIGHT, INK_RULE, 0.62 * yearAppear);
          }
        }

        // Corner brackets around August 2012 (yearIdx 12, monthIdx 7), the default Feather River fire.
        if (abs(yearIdx - 12.0) < 0.25 && abs(monthIdx - 7.0) < 0.25 && yearAppear > 0.95) {
          float dx = min(yearFrac, 1.0 - yearFrac) * yearPxW;
          float dy = min(monthFrac, 1.0 - monthFrac) * monthPxH;
          float arm = min(4.5 * uDpr, min(yearPxW, monthPxH) * 0.38);
          if ((dx < 1.2 * uDpr && dy < arm) || (dy < 1.2 * uDpr && dx < arm)) {
            col = INK_EST;
          }
        }
      }
    } else if (local.y > 0.975) {
      // Bottom 2.5%: subtle satellite era horizon bar (MODIS 2000-2011, VIIRS 2012-2025).
      if (yearAppear > 0.2 && yearFrac > 0.04 && yearFrac < 0.96) {
        vec3 eraCol = isSharpEra ? mix(INK_SHARP, INK_MODIS, flatten * 0.45) : INK_MODIS;
        col = mix(INK_NIGHT, eraCol, 0.48 * yearAppear);
      }
    }

    // Precision hairline at January 2012 where the sharper satellite enters orbit.
    float joinX = 12.0 / 26.0;
    float distJoinPx = abs(local.x - joinX) * inner.x;
    if (distJoinPx < 0.9 * uDpr && local.y < 0.96) {
      col = mix(col, mix(INK_SHARP, INK_EDGE, flatten * 0.72), 0.78);
    }
  }

  col += staticGrain(gl_FragCoord.xy) * 0.01;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// 2. Estimate: Oblique 3D Feather River Canyon DEM with 1 km coarse passes resolving into 375 m white frames.
const FRAG_ESTIMATE = `${FRAG_COMMON}
${FRAG_TERRAIN_LIB}
void main() {
  vec2 pScreen = (vUv - 0.5) * 2.0;
  float aspect = uResolution.x / max(1.0, uResolution.y);
  pScreen.x *= aspect;

  float yaw = -0.17 + 0.055 * sin(uTime * 0.26);
  vec3 ta = vec3(0.0, 0.055, 0.02);
  vec3 ro = ta + vec3(sin(yaw) * 0.88, 0.76, cos(yaw) * 0.88);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 2.04 + rt * pScreen.x + up * pScreen.y);

  vec2 span = vec2(1.70, 1.14);
  float elevScale = 0.19;
  float hitMask = 0.0;
  vec3 hit = traceCanyon(ro, rd, span, elevScale, hitMask);

  vec3 col = INK_NIGHT;
  if (hitMask > 0.5) {
    vec2 domUv = hit.xz / span + 0.5;
    vec2 boxDist = max(abs(domUv - 0.5) - 0.44, 0.0);
    float edgeFade = smoothstep(0.12, 0.0, length(boxDist)) * smoothstep(1.22, 0.52, length(pScreen * vec2(0.58, 0.86)));

    vec3 dem = sampleDem(domUv);
    col = baseCanyonInk(dem, edgeFade);

    if (domUv.x >= 0.0 && domUv.x < 1.0 && domUv.y >= 0.0 && domUv.y < 1.0 && edgeFade > 0.02) {
      vec2 gridDim = vec2(48.0, 30.0);
      vec2 cellPos = domUv * gridDim;
      vec2 cellIdx = floor(cellPos);
      vec2 cellUv = fract(cellPos);

      // Subtle 1 km (3x3 cell) orbital ground-track survey lines draped across the canyon.
      vec2 coarseUv = fract(cellPos / 3.0);
      float coarseEdge = min(min(coarseUv.x, 1.0 - coarseUv.x), min(coarseUv.y, 1.0 - coarseUv.y));
      if (coarseEdge < 0.032) {
        col = mix(col, INK_RULE, 0.42 * edgeFade);
      }

      vec4 d = texture2D(uData, vec2((cellIdx.x + 0.5) / 64.0, (cellIdx.y + 0.5) / 128.0));
      float coarseWeight = d.r;
      float isDeclared = step(0.5, d.g);
      float isEnvelope = step(0.5, d.b);

      float cycle = mod(uTime, 8.6);
      float coarseIn = smoothstep(0.1, 1.0, cycle);
      float sweepPos = (cycle - 1.9) / 3.3;
      float diag = domUv.x * 0.78 + domUv.y * 0.22;
      float resolved = smoothstep(diag - 0.12, diag + 0.05, sweepPos) * (1.0 - smoothstep(7.8, 8.5, cycle));

      // Coarse 1 km Terra MODIS blocks draped onto the slopes, receding as 375 m frames resolve.
      if (coarseWeight > 0.02) {
        float fillAmt = coarseWeight * coarseIn * mix(0.56, 0.14, resolved) * edgeFade;
        col = mix(col, INK_MODIS, fillAmt);
        if (coarseEdge < 0.048) {
          col = mix(col, INK_MODIS, coarseIn * mix(0.88, 0.28, resolved) * edgeFade);
        }
      }

      // Dotted outer belief envelope around the fire perimeter.
      if (isEnvelope > 0.5 && resolved > 0.04) {
        float checker = mod(cellIdx.x + cellIdx.y, 2.0);
        if (checker > 0.5) {
          col = mix(col, INK_EDGE, 0.48 * resolved * edgeFade);
        }
      }

      // Resolved 375 m hollow white estimate frames hugging the canyon ridges.
      if (isDeclared > 0.5 && resolved > 0.01) {
        float cEdge = min(min(cellUv.x, 1.0 - cellUv.x), min(cellUv.y, 1.0 - cellUv.y));
        if (cEdge >= 0.06 && cEdge <= 0.20) {
          col = mix(col, INK_EST, resolved * 0.96 * edgeFade);
        } else if (cEdge > 0.20) {
          col = mix(col, INK_EST, resolved * 0.09 * edgeFade);
        }
      }

      // Luminous resolution wavefront sweeping across the 3D canyon relief.
      float waveDist = abs(diag - sweepPos);
      if (cycle > 1.9 && cycle < 5.4 && waveDist < 0.014) {
        float glow = (1.0 - waveDist / 0.014) * edgeFade;
        col = mix(col, INK_EST, glow * 0.55);
      }
    }
  }

  col += staticGrain(gl_FragCoord.xy) * 0.01;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// 3. Test: Same 3D Feather River Canyon as the withheld sharp pass sweeps across and lights 375 m detections.
const FRAG_TEST = `${FRAG_COMMON}
${FRAG_TERRAIN_LIB}
void main() {
  vec2 pScreen = (vUv - 0.5) * 2.0;
  float aspect = uResolution.x / max(1.0, uResolution.y);
  pScreen.x *= aspect;

  float yaw = 0.16 - 0.055 * sin(uTime * 0.24);
  vec3 ta = vec3(0.0, 0.055, 0.02);
  vec3 ro = ta + vec3(sin(yaw) * 0.88, 0.76, cos(yaw) * 0.88);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 2.04 + rt * pScreen.x + up * pScreen.y);

  vec2 span = vec2(1.70, 1.14);
  float elevScale = 0.19;
  float hitMask = 0.0;
  vec3 hit = traceCanyon(ro, rd, span, elevScale, hitMask);

  vec3 col = INK_NIGHT;
  if (hitMask > 0.5) {
    vec2 domUv = hit.xz / span + 0.5;
    vec2 boxDist = max(abs(domUv - 0.5) - 0.44, 0.0);
    float edgeFade = smoothstep(0.12, 0.0, length(boxDist)) * smoothstep(1.22, 0.52, length(pScreen * vec2(0.58, 0.86)));

    vec3 dem = sampleDem(domUv);
    col = baseCanyonInk(dem, edgeFade);

    if (domUv.x >= 0.0 && domUv.x < 1.0 && domUv.y >= 0.0 && domUv.y < 1.0 && edgeFade > 0.02) {
      vec2 gridDim = vec2(48.0, 30.0);
      vec2 cellPos = domUv * gridDim;
      vec2 cellIdx = floor(cellPos);
      vec2 cellUv = fract(cellPos);

      vec4 d = texture2D(uData, vec2((cellIdx.x + 0.5) / 64.0, (cellIdx.y + 0.5) / 128.0));
      float coarseWeight = d.r;
      float isDeclared = step(0.5, d.g);
      float sharpWeight = d.a;

      if (coarseWeight > 0.02) {
        col = mix(col, INK_MODIS, coarseWeight * 0.08 * edgeFade);
      }

      float cycle = mod(uTime, 8.8);
      float scan = (cycle - 1.6) / 3.2;
      float passCoord = domUv.x * 0.84 - domUv.y * 0.16 + 0.16;
      float revealed = smoothstep(passCoord - 0.07, passCoord + 0.02, scan) * (1.0 - smoothstep(8.0, 8.72, cycle));

      float cEdge = min(min(cellUv.x, 1.0 - cellUv.x), min(cellUv.y, 1.0 - cellUv.y));

      // Declared 375 m white estimate frames stand on the canyon ridges before and after the reveal.
      if (isDeclared > 0.5) {
        if (cEdge >= 0.05 && cEdge <= 0.19) {
          col = mix(col, INK_EST, 0.90 * edgeFade);
        } else if (cEdge > 0.19) {
          col = mix(col, INK_EST, 0.06 * edgeFade);
        }
      }

      // Withheld sharp 375 m detections ignite in #f08a45 as the 09:15 UTC pass sweeps across.
      if (sharpWeight > 0.04 && revealed > 0.01) {
        float inset = isDeclared > 0.5 ? 0.21 : 0.10;
        if (cEdge >= inset) {
          float strength = clamp(0.62 + sharpWeight * 0.38, 0.0, 1.0) * revealed * edgeFade;
          col = mix(col, INK_SHARP, strength);
          if (sharpWeight > 0.65 && cEdge > 0.32) {
            col = mix(col, INK_EST, (sharpWeight - 0.65) * 0.65 * revealed * edgeFade);
          }
        }
      }

      // Orbital swath scan line across the canyon slopes.
      float dScan = abs(passCoord - scan);
      if (cycle > 1.6 && cycle < 5.1 && dScan < 0.016) {
        float beam = (1.0 - dScan / 0.016) * edgeFade;
        col = mix(col, INK_SHARP, beam * 0.68);
      }
    }
  }

  col += staticGrain(gl_FragCoord.xy) * 0.01;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// 4. Play: 4x4 territory board draped over 3D Feather River Canyon as 4 looks uncover fire in order.
const FRAG_PLAY = `${FRAG_COMMON}
${FRAG_TERRAIN_LIB}
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(0.0001, dot(ba, ba)), 0.0, 1.0);
  return length(pa - ba * h);
}

vec2 tileCenterUv(float tileId) {
  float r = floor(tileId / 4.0);
  float c = tileId - r * 4.0;
  return (vec2(c, r) + 0.5) / 4.0;
}

void main() {
  vec2 pScreen = (vUv - 0.5) * 2.0;
  float aspect = uResolution.x / max(1.0, uResolution.y);
  pScreen.x *= aspect;

  float yaw = -0.09 + 0.045 * sin(uTime * 0.22);
  vec3 ta = vec3(0.0, 0.045, 0.01);
  vec3 ro = ta + vec3(sin(yaw) * 0.84, 0.84, cos(yaw) * 0.84);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 2.06 + rt * pScreen.x + up * pScreen.y);

  vec2 span = vec2(1.62, 1.18);
  float elevScale = 0.16;
  float hitMask = 0.0;
  vec3 hit = traceCanyon(ro, rd, span, elevScale, hitMask);

  float cycle = mod(uTime, 9.6);
  float stepFloat = (cycle - 0.7) / 1.95;
  float activeStep = floor(clamp(stepFloat, -1.0, 3.999)) + 1.0; // 0..4
  float stepPhase = fract(max(0.0, stepFloat));
  float fadeReset = 1.0 - smoothstep(8.85, 9.52, cycle);

  vec3 col = INK_NIGHT;
  if (hitMask > 0.5) {
    vec2 domUv = hit.xz / span + 0.5;
    vec2 boxDist = max(abs(domUv - 0.5) - 0.48, 0.0);
    float edgeFade = smoothstep(0.08, 0.0, length(boxDist)) * smoothstep(1.25, 0.54, length(pScreen * vec2(0.58, 0.86)));

    vec3 dem = sampleDem(domUv);
    col = baseCanyonInk(dem, edgeFade);

    if (domUv.x >= 0.0 && domUv.x < 1.0 && domUv.y >= 0.0 && domUv.y < 1.0 && edgeFade > 0.02) {
      vec2 boardDim = vec2(4.0, 4.0);
      vec2 tilePos = domUv * boardDim;
      vec2 tileRC = floor(tilePos);
      vec2 tileUv = fract(tilePos);
      float tileId = tileRC.y * 4.0 + tileRC.x;

      vec2 subDim = vec2(48.0, 36.0);
      vec2 subIdx = floor(domUv * subDim);
      vec2 subUv = fract(domUv * subDim);

      vec4 d = texture2D(uData, vec2((subIdx.x + 0.5) / 64.0, (subIdx.y + 0.5) / 128.0));
      float modisHint = d.r;
      float tileUnsure = d.g;
      float lookSlot = floor(d.b * 4.0 + 0.5);
      float sharpWeight = d.a;

      // Subtle model-uncertainty glow inside high-entropy canyon squares.
      col = mix(col, INK_MODIS, tileUnsure * 0.08 * edgeFade);

      // Coarse MODIS cues visible across the 16 territory squares.
      if (modisHint > 0.03) {
        float subEdge = min(min(subUv.x, 1.0 - subUv.x), min(subUv.y, 1.0 - subUv.y));
        if (subEdge > 0.08) {
          col = mix(col, INK_MODIS, modisHint * 0.42 * edgeFade);
        }
      }

      // Uncovered 375 m sharp detections accumulated by the looks taken so far.
      if (lookSlot >= 1.0 && lookSlot <= activeStep && sharpWeight > 0.04) {
        float stepStart = 0.7 + (lookSlot - 1.0) * 1.95;
        float appear = smoothstep(stepStart, stepStart + 0.35, cycle) * fadeReset;
        float subEdge = min(min(subUv.x, 1.0 - subUv.x), min(subUv.y, 1.0 - subUv.y));
        if (subEdge > 0.10) {
          col = mix(col, INK_SHARP, appear * clamp(0.65 + sharpWeight * 0.35, 0.0, 1.0) * edgeFade);
        }
      }

      // 4x4 territory grid lines draped on the 3D canyon.
      float tEdge = min(min(tileUv.x, 1.0 - tileUv.x), min(tileUv.y, 1.0 - tileUv.y));
      if (tEdge < 0.016) {
        col = mix(col, INK_EDGE, 0.58 * edgeFade);
      }

      // Trajectory line linking look 1 (uMeta.x) to look 2 (uMeta.y) when tiles differ.
      if (activeStep >= 2.0 && abs(uMeta.x - uMeta.y) > 0.5) {
        float dLine = segDist(domUv, tileCenterUv(uMeta.x), tileCenterUv(uMeta.y));
        if (dLine < 0.0032) {
          col = mix(col, INK_EST, 0.52 * fadeReset * edgeFade);
        }
      }

      float currentTile = -1.0;
      if (activeStep >= 1.0 && activeStep < 2.0) currentTile = uMeta.x;
      else if (activeStep >= 2.0 && activeStep < 3.0) currentTile = uMeta.y;
      else if (activeStep >= 3.0 && activeStep < 4.0) currentTile = uMeta.z;
      else if (activeStep >= 4.0) currentTile = uMeta.w;

      bool visited =
        (activeStep >= 1.0 && abs(tileId - uMeta.x) < 0.25) ||
        (activeStep >= 2.0 && abs(tileId - uMeta.y) < 0.25) ||
        (activeStep >= 3.0 && abs(tileId - uMeta.z) < 0.25) ||
        (activeStep >= 4.0 && abs(tileId - uMeta.w) < 0.25);

      if (visited && tEdge >= 0.016 && tEdge < 0.030) {
        col = mix(col, INK_MODIS, 0.45 * fadeReset * edgeFade);
      }

      // Active look square: crisp white corner brackets + fresh pass scan pulse on every look.
      if (abs(tileId - currentTile) < 0.25 && fadeReset > 0.05) {
        float pulse = (1.0 - smoothstep(0.0, 0.55, stepPhase)) * fadeReset;
        float scanWave = abs(tileUv.x - clamp(stepPhase * 2.2, 0.0, 1.2));
        if (stepPhase < 0.55 && scanWave < 0.035) {
          col = mix(col, INK_SHARP, (1.0 - scanWave / 0.035) * 0.48 * pulse * edgeFade);
        }

        float dx = min(tileUv.x, 1.0 - tileUv.x);
        float dy = min(tileUv.y, 1.0 - tileUv.y);
        float inset = 0.035;
        float stroke = 0.030;
        float arm = 0.19;
        bool onBracket =
          (dx >= inset && dx <= inset + arm && dy >= inset && dy <= inset + stroke) ||
          (dy >= inset && dy <= inset + arm && dx >= inset && dx <= inset + stroke);
        if (onBracket) {
          col = mix(col, INK_EST, fadeReset * edgeFade);
        }
      }
    }
  }

  // Four geometric pass-budget pips in the bottom-left corner (purely graphic, zero text inside canvas).
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uResolution;
  float pipSize = 6.0 * uDpr;
  float pipGap = 5.0 * uDpr;
  float pipTop = uResolution.y - 20.0 * uDpr;
  float pipLeft = 20.0 * uDpr;
  if (px.y >= pipTop && px.y <= pipTop + pipSize) {
    float relX = px.x - pipLeft;
    if (relX >= 0.0 && relX < 4.0 * (pipSize + pipGap)) {
      float idx = floor(relX / (pipSize + pipGap));
      float inX = relX - idx * (pipSize + pipGap);
      if (inX <= pipSize && idx < 4.0) {
        bool taken = (idx + 1.0) <= activeStep && fadeReset > 0.1;
        bool border = inX < 1.1 * uDpr || inX > pipSize - 1.1 * uDpr || px.y < pipTop + 1.1 * uDpr || px.y > pipTop + pipSize - 1.1 * uDpr;
        if (taken) {
          col = (abs(idx + 1.0 - activeStep) < 0.25) ? INK_SHARP : INK_EST;
        } else if (border) {
          col = INK_EDGE;
        }
      }
    }
  }

  col += staticGrain(gl_FragCoord.xy) * 0.01;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const STILL_TIMES: Record<BlockVisualKind, number> = {
  record: 5.8,
  estimate: 6.1,
  test: 5.8,
  play: 7.2,
};

const INITIAL_TIMES: Record<BlockVisualKind, number> = {
  record: 2.6,
  estimate: 3.2,
  test: 3.0,
  play: 2.9,
};

interface CompiledProgram {
  program: WebGLProgram;
  uRes: WebGLUniformLocation | null;
  uDpr: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uData: WebGLUniformLocation | null;
  uMeta: WebGLUniformLocation | null;
}

interface VisualSlot {
  kind: BlockVisualKind;
  canvas: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  visible: boolean;
  time: number;
  stillDrawn: boolean;
}

interface SharedWebglEngine {
  supported: boolean;
  register: (kind: BlockVisualKind, canvas: HTMLCanvasElement) => () => void;
  uploadTexture: (
    kind: BlockVisualKind,
    width: number,
    height: number,
    bytes: Uint8Array,
    meta?: [number, number, number, number],
  ) => void;
}

function compileProgram(gl: WebGLRenderingContext, fragSrc: string): CompiledProgram | null {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;

  gl.shaderSource(vs, VERT_SRC);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteProgram(program);
    return null;
  }

  gl.shaderSource(fs, fragSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteProgram(program);
    return null;
  }

  // Bind attribute 0 before linking so one vertex buffer setup serves all four programs.
  gl.bindAttribLocation(program, 0, 'aPos');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return {
    program,
    uRes: gl.getUniformLocation(program, 'uResolution'),
    uDpr: gl.getUniformLocation(program, 'uDpr'),
    uTime: gl.getUniformLocation(program, 'uTime'),
    uData: gl.getUniformLocation(program, 'uData'),
    uMeta: gl.getUniformLocation(program, 'uMeta'),
  };
}

let singletonEngine: SharedWebglEngine | null = null;

function getSharedWebglEngine(): SharedWebglEngine {
  if (singletonEngine) return singletonEngine;
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    singletonEngine = {
      supported: false,
      register: () => () => undefined,
      uploadTexture: () => undefined,
    };
    return singletonEngine;
  }

  const glCanvas = document.createElement('canvas');
  glCanvas.width = 640;
  glCanvas.height = 400;
  const gl = (glCanvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  }) ||
    glCanvas.getContext('experimental-webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    })) as WebGLRenderingContext | null;

  if (!gl) {
    singletonEngine = {
      supported: false,
      register: () => () => undefined,
      uploadTexture: () => undefined,
    };
    return singletonEngine;
  }

  const programs: Record<BlockVisualKind, CompiledProgram | null> = {
    record: compileProgram(gl, FRAG_RECORD),
    estimate: compileProgram(gl, FRAG_ESTIMATE),
    test: compileProgram(gl, FRAG_TEST),
    play: compileProgram(gl, FRAG_PLAY),
  };

  if (!programs.record || !programs.estimate || !programs.test || !programs.play) {
    singletonEngine = {
      supported: false,
      register: () => () => undefined,
      uploadTexture: () => undefined,
    };
    return singletonEngine;
  }

  // Single full-screen triangle [-1, -1, 3, -1, -1, 3].
  const triBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  const textures: Record<BlockVisualKind, WebGLTexture | null> = {
    record: gl.createTexture(),
    estimate: gl.createTexture(),
    test: gl.createTexture(),
    play: gl.createTexture(),
  };

  const metas: Record<BlockVisualKind, [number, number, number, number]> = {
    record: [0, 0, 0, 0],
    estimate: [0, 0, 0, 0],
    test: [0, 0, 0, 0],
    play: [4, 5, 5, 5],
  };

  const emptyRecord = new Uint8Array(32 * 16 * 4);
  const emptyTerrain = new Uint8Array(64 * 128 * 4);
  for (let r = 0; r < 64; r += 1) {
    for (let c = 0; c < 64; c += 1) {
      const idx = ((64 + r) * 64 + c) * 4;
      emptyTerrain[idx] = 64;
      emptyTerrain[idx + 1] = 84;
      emptyTerrain[idx + 2] = 0;
      emptyTerrain[idx + 3] = 255;
    }
  }

  (['record', 'estimate', 'test', 'play'] as const).forEach((k) => {
    const tex = textures[k];
    if (!tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (k === 'record') {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, emptyRecord);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 128, 0, gl.RGBA, gl.UNSIGNED_BYTE, emptyTerrain);
    }
  });

  const slots = new Set<VisualSlot>();
  let rafId = 0;
  let lastNow = 0;
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reducedMotion = Boolean(mq?.matches);

  function drawSlot(slot: VisualSlot, drawTime: number): void {
    const rect = slot.canvas.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(8, Math.round(rect.width * dpr));
    const h = Math.max(8, Math.round(rect.height * dpr));

    if (slot.canvas.width !== w || slot.canvas.height !== h) {
      slot.canvas.width = w;
      slot.canvas.height = h;
    }
    if (w > glCanvas.width) glCanvas.width = w;
    if (h > glCanvas.height) glCanvas.height = h;

    const prog = programs[slot.kind];
    const tex = textures[slot.kind];
    if (!prog || !tex || !gl) return;

    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.program);
    // Write resolution uniform on every draw, not only on resize.
    gl.uniform2f(prog.uRes, w, h);
    gl.uniform1f(prog.uDpr, dpr);
    gl.uniform1f(prog.uTime, drawTime);
    const m = metas[slot.kind];
    gl.uniform4f(prog.uMeta, m[0], m[1], m[2], m[3]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(prog.uData, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Copy rendered viewport onto this visual's 2D canvas in the same task.
    slot.ctx2d.drawImage(glCanvas, 0, glCanvas.height - h, w, h, 0, 0, w, h);
  }

  function renderStillAll(): void {
    for (const slot of slots) {
      drawSlot(slot, STILL_TIMES[slot.kind]);
      slot.stillDrawn = true;
    }
  }

  function shouldAnimate(): boolean {
    if (reducedMotion) return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    for (const slot of slots) {
      if (slot.visible) return true;
    }
    return false;
  }

  function tick(now: number): void {
    rafId = 0;
    if (!shouldAnimate()) return;

    const rawDt = lastNow > 0 ? (now - lastNow) / 1000 : 1 / 60;
    lastNow = now;
    // Clamp step to 1/30 s; integrate time in JS rather than multiplying absolute time.
    const dt = Math.min(Math.max(0, rawDt), 1 / 30);

    for (const slot of slots) {
      if (!slot.visible) continue;
      slot.time += dt;
      drawSlot(slot, slot.time);
    }

    if (shouldAnimate()) {
      rafId = window.requestAnimationFrame(tick);
    }
  }

  function syncLoop(): void {
    if (reducedMotion || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      lastNow = 0;
      for (const slot of slots) {
        if (!slot.stillDrawn) {
          drawSlot(slot, STILL_TIMES[slot.kind]);
          slot.stillDrawn = true;
        }
      }
      return;
    }
    if (shouldAnimate() && !rafId) {
      lastNow = performance.now();
      rafId = window.requestAnimationFrame(tick);
    } else if (!shouldAnimate() && rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      lastNow = 0;
    }
  }

  mq?.addEventListener?.('change', () => {
    reducedMotion = Boolean(mq.matches);
    for (const s of slots) s.stillDrawn = false;
    syncLoop();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      renderStillAll();
    }
    syncLoop();
  });

  window.addEventListener('resize', () => {
    for (const s of slots) s.stillDrawn = false;
    if (!shouldAnimate()) renderStillAll();
  });

  singletonEngine = {
    supported: true,
    register(kind, canvas) {
      const ctx2d = canvas.getContext('2d', { alpha: false });
      if (!ctx2d) return () => undefined;

      const slot: VisualSlot = {
        kind,
        canvas,
        ctx2d,
        visible: false,
        time: INITIAL_TIMES[kind],
        stillDrawn: false,
      };
      slots.add(slot);

      drawSlot(slot, reducedMotion ? STILL_TIMES[kind] : INITIAL_TIMES[kind]);

      const io =
        typeof IntersectionObserver !== 'undefined'
          ? new IntersectionObserver(
              (entries) => {
                for (const entry of entries) {
                  slot.visible = entry.isIntersecting && entry.intersectionRatio > 0.02;
                }
                if (slot.visible && reducedMotion) {
                  drawSlot(slot, STILL_TIMES[kind]);
                  slot.stillDrawn = true;
                }
                syncLoop();
              },
              { threshold: [0, 0.05] },
            )
          : null;

      if (io) {
        io.observe(canvas);
      } else {
        slot.visible = true;
        syncLoop();
      }

      return () => {
        io?.disconnect();
        slots.delete(slot);
        syncLoop();
      };
    },
    uploadTexture(kind, width, height, bytes, meta) {
      const tex = textures[kind];
      if (!tex || !gl) return;
      if (meta) metas[kind] = meta;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      for (const s of slots) {
        if (s.kind === kind) {
          s.stillDrawn = false;
          drawSlot(s, reducedMotion ? STILL_TIMES[kind] : s.time || STILL_TIMES[kind]);
        }
      }
      syncLoop();
    },
  };

  return singletonEngine;
}

/* ============================================================================
   Packing real static Feather River JSON + DEM into power-of-two RGBA textures
   ============================================================================ */

function packDemRows(bytes: Uint8Array, texWidth: number, rowOffset: number, b64: string | undefined): void {
  const N = 64;
  const h = new Float32Array(N * N);
  let decoded = false;
  if (b64 && typeof atob === 'function') {
    try {
      const bin = atob(b64);
      if (bin.length >= N * N * 2) {
        for (let i = 0; i < N * N; i += 1) {
          const lo = bin.charCodeAt(i * 2) & 0xff;
          const hi = bin.charCodeAt(i * 2 + 1) & 0xff;
          h[i] = (lo | (hi << 8)) / 65535;
        }
        decoded = true;
      }
    } catch {
      decoded = false;
    }
  }
  if (!decoded) {
    for (let r = 0; r < N; r += 1) {
      for (let c = 0; c < N; c += 1) {
        h[r * N + c] = 0.25;
      }
    }
  }

  // Light 3x3 box pass to suppress 16-bit quantization micro-ripples while keeping canyon ridges crisp.
  const sm = new Float32Array(N * N);
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      let acc = 0;
      let wt = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        const rr = Math.max(0, Math.min(N - 1, r + dr));
        for (let dc = -1; dc <= 1; dc += 1) {
          const cc = Math.max(0, Math.min(N - 1, c + dc));
          const w = dr === 0 && dc === 0 ? 4 : 1;
          acc += h[rr * N + cc] * w;
          wt += w;
        }
      }
      sm[r * N + c] = acc / wt;
    }
  }

  for (let r = 0; r < N; r += 1) {
    const r0 = Math.max(0, r - 1);
    const r1 = Math.min(N - 1, r + 1);
    for (let c = 0; c < N; c += 1) {
      const c0 = Math.max(0, c - 1);
      const c1 = Math.min(N - 1, c + 1);
      const hc = sm[r * N + c];
      const dzdx = (sm[r * N + c1] - sm[r * N + c0]) * 5.2;
      const dzdy = (sm[r1 * N + c] - sm[r0 * N + c]) * 5.2;

      // Northwest canyon illumination + ridge curvature highlight.
      const nx = -dzdx;
      const ny = -dzdy;
      const nz = 1.0;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      const sun = Math.max(0, (nx * -0.62 + ny * -0.54 + nz * 0.57) * invLen);
      const lap = hc - 0.25 * (sm[r * N + c0] + sm[r * N + c1] + sm[r0 * N + c] + sm[r1 * N + c]);
      const ridge = Math.max(0, Math.min(1, lap * 16.0));

      const idx = ((rowOffset + r) * texWidth + c) * 4;
      bytes[idx] = Math.round(Math.max(0, Math.min(1, hc)) * 255);
      bytes[idx + 1] = Math.round(Math.max(0, Math.min(1, sun)) * 255);
      bytes[idx + 2] = Math.round(ridge * 255);
      bytes[idx + 3] = 255;
    }
  }
}

function uploadRecordTexture(engine: SharedWebglEngine, data: RecordLandingData): void {
  const W = 32;
  const H = 16;
  const bytes = new Uint8Array(W * H * 4);
  const maxRaw = Math.max(1e-6, data.max_raw);
  const maxOne = Math.max(1e-6, data.max_one_scale);

  for (let y = 0; y < 26; y += 1) {
    let sumRaw = 0;
    let sumOne = 0;
    let count = 0;
    for (let m = 0; m < 12; m += 1) {
      const cell = data.cells[y * 12 + m];
      if (!cell) continue;
      const [raw, one, era] = cell;
      const idx = (m * W + y) * 4;
      bytes[idx] = Math.round(Math.min(1, Math.sqrt(raw / maxRaw)) * 255);
      bytes[idx + 1] = Math.round(Math.min(1, Math.sqrt(one / maxOne)) * 255);
      bytes[idx + 2] = era === 0 ? 0 : era === 1 ? 128 : 255;
      bytes[idx + 3] = 255;
      if (era > 0) {
        sumRaw += raw;
        sumOne += one;
        count += 1;
      }
    }
    if (count > 0) {
      const annIdx = (12 * W + y) * 4;
      const meanRaw = sumRaw / count;
      const meanOne = sumOne / count;
      bytes[annIdx] = Math.round(Math.min(1, Math.pow(meanRaw / (maxRaw * 0.42), 0.62)) * 255);
      bytes[annIdx + 1] = Math.round(Math.min(1, Math.pow(meanOne / (maxRaw * 0.42), 0.62)) * 255);
      bytes[annIdx + 2] = 255;
      bytes[annIdx + 3] = 255;
    }
  }
  engine.uploadTexture('record', W, H, bytes);
}

function uploadEstimateAndTestTextures(engine: SharedWebglEngine, data: EstimateTestLandingData): void {
  const W = 64;
  const H = 128;
  const bytes = new Uint8Array(W * H * 4);
  const cols = Math.min(W, data.grid.cols);
  const rows = Math.min(64, data.grid.rows);

  for (const [c, r, w] of data.coarse) {
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    bytes[(r * W + c) * 4] = w;
  }

  const decl = new Uint8Array(cols * rows);
  for (const [c, r] of data.estimate) {
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    decl[r * cols + c] = 1;
    bytes[(r * W + c) * 4 + 1] = 255;
  }

  // Two-cell dilated outer boundary ring for the dotted belief envelope.
  const dil = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      let any = 0;
      for (let dr = -2; dr <= 2 && !any; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && decl[nr * cols + nc]) {
            any = 1;
            break;
          }
        }
      }
      dil[r * cols + c] = any;
    }
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!dil[r * cols + c]) continue;
      let edge = 0;
      if (
        r === 0 ||
        r === rows - 1 ||
        c === 0 ||
        c === cols - 1 ||
        !dil[(r - 1) * cols + c] ||
        !dil[(r + 1) * cols + c] ||
        !dil[r * cols + (c - 1)] ||
        !dil[r * cols + (c + 1)]
      ) {
        edge = 255;
      }
      bytes[(r * W + c) * 4 + 2] = edge;
    }
  }

  for (const [c, r, w] of data.sharp) {
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    bytes[(r * W + c) * 4 + 3] = w;
  }

  packDemRows(bytes, W, 64, data.dem_u16_b64);

  engine.uploadTexture('estimate', W, H, bytes);
  engine.uploadTexture('test', W, H, bytes);
}

function uploadPlayTexture(engine: SharedWebglEngine, data: PlayLandingData): void {
  const W = 64;
  const H = 128;
  const bytes = new Uint8Array(W * H * 4);
  const cols = Math.min(W, data.grid.cols);
  const rows = Math.min(64, data.grid.rows);

  for (let r = 0; r < rows; r += 1) {
    const tr = Math.min(3, Math.floor((r / rows) * 4));
    for (let c = 0; c < cols; c += 1) {
      const tc = Math.min(3, Math.floor((c / cols) * 4));
      const u = data.tile_unsure[tr * 4 + tc] ?? 0;
      bytes[(r * W + c) * 4 + 1] = Math.round(Math.max(0, Math.min(1, u)) * 255);
    }
  }

  for (const [c, r, w] of data.coarse) {
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    bytes[(r * W + c) * 4] = w;
  }

  for (const look of data.looks) {
    const slotByte = Math.round((Math.min(4, Math.max(1, look.order)) / 4) * 255);
    for (const [c, r, w] of look.cells) {
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
      const idx = (r * W + c) * 4;
      if (bytes[idx + 2] === 0) {
        bytes[idx + 2] = slotByte;
      }
      if (w > bytes[idx + 3]) {
        bytes[idx + 3] = w;
      }
    }
  }

  packDemRows(bytes, W, 64, data.dem_u16_b64);

  const t0 = data.looks[0]?.tile ?? 4;
  const t1 = data.looks[1]?.tile ?? 5;
  const t2 = data.looks[2]?.tile ?? 5;
  const t3 = data.looks[3]?.tile ?? 5;
  engine.uploadTexture('play', W, H, bytes, [t0, t1, t2, t3]);
}

let landingStaticLoaded = false;
function ensureStaticVisualTextures(engine: SharedWebglEngine): void {
  if (landingStaticLoaded || !engine.supported || typeof fetch === 'undefined') return;
  landingStaticLoaded = true;

  fetch(publicUrl('generated/landing/record.json'))
    .then((r) => (r.ok ? (r.json() as Promise<RecordLandingData>) : null))
    .then((d) => {
      if (d && Array.isArray(d.cells)) uploadRecordTexture(engine, d);
    })
    .catch(() => undefined);

  fetch(publicUrl('generated/landing/estimate-test.json'))
    .then((r) => (r.ok ? (r.json() as Promise<EstimateTestLandingData>) : null))
    .then((d) => {
      if (d && d.grid) uploadEstimateAndTestTextures(engine, d);
    })
    .catch(() => undefined);

  fetch(publicUrl('generated/landing/play.json'))
    .then((r) => (r.ok ? (r.json() as Promise<PlayLandingData>) : null))
    .then((d) => {
      if (d && Array.isArray(d.looks)) uploadPlayTexture(engine, d);
    })
    .catch(() => undefined);
}

function StepShaderCanvas({ kind, ariaLabel }: { kind: BlockVisualKind; ariaLabel: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [webglReady, setWebglReady] = useState(true);

  useEffect(() => {
    const engine = getSharedWebglEngine();
    if (!engine.supported) {
      setWebglReady(false);
      return;
    }
    ensureStaticVisualTextures(engine);
    const canvas = canvasRef.current;
    if (!canvas) return;
    return engine.register(kind, canvas);
  }, [kind]);

  return (
    <div className="iso-lb-visual" data-webgl={webglReady ? 'on' : 'off'} role="img" aria-label={ariaLabel}>
      <div className="iso-lb-visual__fallback" data-kind={kind} aria-hidden="true" />
      <canvas ref={canvasRef} className="iso-lb-visual__canvas" aria-hidden="true" />
    </div>
  );
}

function ActionArrow() {
  return (
    <svg className="iso-lb-action__arrow" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M1.5 6h8.5M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/* ============================================================================
   LANDING-copy.json live field formatting (GET routes only, never stand-in figures)
   ============================================================================ */

function fillTemplate(template: string, fields: Record<string, string | null>): string | null {
  let missing = false;
  const startsWithToken = template.startsWith('{');
  const filled = template.replace(/\{([a-z0-9_]+)\}/g, (_, key: string) => {
    const v = fields[key];
    if (v === null || v === undefined || v === '') {
      missing = true;
      return '';
    }
    return v;
  });
  if (missing) return null;
  if (startsWithToken && filled.length > 0) {
    return filled.charAt(0).toUpperCase() + filled.slice(1);
  }
  return filled;
}

export interface LandingBelowProps {
  parts?: PartStatus[];
  onOpenPart: (id: PartId) => void;
  onOpenMethod: () => void;
  onOpenSensor?: () => void;
  onEnter: () => void;
}

export function LandingBelow({
  onOpenPart,
  onOpenMethod,
  onOpenSensor,
  onEnter,
}: LandingBelowProps) {
  const store = useOptionalWorkspace();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeRegionId = store?.run.active?.region.id || 'plumas_ca';

  const [calendarSlice, setCalendarSlice] = useState<CalendarRouteSlice | null>(null);
  const [regionsSlice, setRegionsSlice] = useState<RegionsRouteSlice | null>(null);
  const [localEvidence, setLocalEvidence] = useState<EvidenceDoc | null>(null);
  const [localEvidenceState, setLocalEvidenceState] = useState<EvidenceState>('loading');
  const [fallbackEvidenceOpen, setFallbackEvidenceOpen] = useState(false);

  const evidenceDoc = store?.model.evidence ?? localEvidence;

  // Scroll-reveal observer for calm section entrances when motion is allowed.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal-section]'));
    for (const el of targets) {
      el.dataset.reveal = 'pending';
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.reveal = 'shown';
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -32px 0px' },
    );
    for (const el of targets) io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    getJson<CalendarRouteSlice>(
      '/api/calendar',
      { source: 'firms', region_id: activeRegionId },
      { signal: ctrl.signal },
    )
      .then((d) => {
        if (d && typeof d === 'object') setCalendarSlice(d);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [activeRegionId]);

  useEffect(() => {
    const ctrl = new AbortController();
    getJson<RegionsRouteSlice>('/api/regions', undefined, { signal: ctrl.signal })
      .then((d) => {
        if (d && typeof d === 'object') setRegionsSlice(d);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (store?.model.evidence) return;
    const ctrl = new AbortController();
    setLocalEvidenceState('loading');
    getJson<EvidenceDoc>('/api/evidence', undefined, { signal: ctrl.signal })
      .then((d) => {
        if (d && typeof d === 'object' && d.test_fires) {
          setLocalEvidence(d);
          setLocalEvidenceState('ready');
        } else {
          setLocalEvidenceState('failed');
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLocalEvidenceState('failed');
      });
    return () => ctrl.abort();
  }, [store?.model.evidence]);

  const { fields, conditions, telemetry } = useMemo(() => {
    const sm = calendarSlice?.summary_metrics;
    const viirsMarker = calendarSlice?.regime_markers?.find(
      (m) => typeof m.label === 'string' && m.label.startsWith('VIIRS'),
    );

    const firmsPlaces =
      regionsSlice?.places?.filter((p) => p.rows === 'firms' && typeof p.name === 'string') ?? null;

    const testFires = evidenceDoc?.test_fires?.fires ?? null;
    const scoresJudgedNum = testFires && testFires[0] ? testFires[0].new.scores_judged : null;

    const val = evidenceDoc?.validation;
    const onVal = (evidenceDoc?.next_look as { on_validation?: NextLookOnValidationSlice } | undefined)?.on_validation;

    const errPctNum =
      typeof sm?.held_out_median_abs_relative_error === 'number' &&
      Number.isFinite(sm.held_out_median_abs_relative_error)
        ? Math.round(sm.held_out_median_abs_relative_error * 100)
        : null;

    const errRawPctNum =
      typeof sm?.held_out_median_abs_relative_error_without_harmonization === 'number' &&
      Number.isFinite(sm.held_out_median_abs_relative_error_without_harmonization)
        ? Math.round(sm.held_out_median_abs_relative_error_without_harmonization * 100)
        : null;

    const f: Record<string, string | null> = {
      place: calendarSlice?.place?.name ?? calendarSlice?.region_name ?? null,
      record_first_year: sm?.first_month ? sm.first_month.slice(0, 4) : null,
      sharp_since: viirsMarker?.year_month ? viirsMarker.year_month.slice(0, 4) : null,
      sharp_to_coarse:
        typeof sm?.viirs_to_modis_overlap_ratio === 'number' && Number.isFinite(sm.viirs_to_modis_overlap_ratio)
          ? sm.viirs_to_modis_overlap_ratio.toFixed(1)
          : null,
      record_error: errPctNum !== null ? String(errPctNum) : null,
      record_error_raw: errRawPctNum !== null ? String(errRawPctNum) : null,
      places_n: firmsPlaces && firmsPlaces.length > 0 ? formatCountWord(firmsPlaces.length) : null,
      places_with_fires:
        firmsPlaces && firmsPlaces.length > 0
          ? formatListAnd(firmsPlaces.map((p) => p.name ?? ''))
          : null,
      test_fires_n: testFires && testFires.length > 0 ? formatCountWord(testFires.length) : null,
      test_fire_names:
        testFires && testFires.length > 0 ? formatListAnd(testFires.map((tf) => tf.name)) : null,
      test_fire_scores:
        testFires && testFires.length > 0
          ? formatListAnd(testFires.map((tf) => String(tf.new.ahead_of_both_on)))
          : null,
      test_scores_n: formatSheetCount(scoresJudgedNum),
      other_fires_n: formatCountWord(val?.episodes),
      other_ahead: formatSheetCount(val?.classes?.ahead),
      other_level: formatSheetCount(val?.classes?.tied),
      other_behind: formatCountNone(val?.classes?.behind),
      round_looks: formatCountWord(onVal?.budget),
      rounds_n: formatSheetCount(onVal?.episodes),
      rule_ahead_rounds: formatSheetCount(onVal?.differences?.least_sure_minus_random?.episodes_a_ahead),
    };

    const notAlwaysAhead =
      testFires && testFires.length > 0 && typeof scoresJudgedNum === 'number'
        ? Math.min(...testFires.map((tf) => tf.new.ahead_of_both_on)) < scoresJudgedNum
        : null;

    const noPartSwitchedOn =
      val?.parts && Array.isArray(val.parts)
        ? !val.parts.some((p) => p.status === 'on')
        : null;

    const p05 = onVal?.differences?.learned_minus_least_sure?.p05;
    const learnedBeatsRule = typeof p05 === 'number' && Number.isFinite(p05) ? p05 > 0 : false;

    const ruleAheadNum = onVal?.differences?.least_sure_minus_random?.episodes_a_ahead ?? null;
    const roundsTotalNum = onVal?.episodes ?? null;

    return {
      fields: f,
      conditions: {
        not_always_ahead: notAlwaysAhead,
        no_part_switched_on: noPartSwitchedOn,
        learned_beats_rule: learnedBeatsRule,
      },
      telemetry: {
        testFires:
          testFires && typeof scoresJudgedNum === 'number'
            ? testFires.map((tf) => ({
                id: tf.region_id,
                won: tf.new.ahead_of_both_on,
                of: tf.new.scores_judged ?? scoresJudgedNum,
              }))
            : null,
        scoresJudgedNum,
        valAhead: typeof val?.classes?.ahead === 'number' ? val.classes.ahead : null,
        valLevel: typeof val?.classes?.tied === 'number' ? val.classes.tied : null,
        valBehind: typeof val?.classes?.behind === 'number' ? val.classes.behind : null,
        valEpisodes: typeof val?.episodes === 'number' ? val.episodes : null,
        ruleAheadNum: typeof ruleAheadNum === 'number' ? ruleAheadNum : null,
        roundsTotalNum: typeof roundsTotalNum === 'number' ? roundsTotalNum : null,
        errPctNum,
        errRawPctNum,
      },
    };
  }, [calendarSlice, regionsSlice, evidenceDoc]);

  const recordLines = useMemo(
    () =>
      [
        fillTemplate(
          "Every fire NASA's satellites detected around a place since {record_first_year}, month by month.",
          fields,
        ),
        fillTemplate(
          'The newer satellite makes about {sharp_to_coarse} times as many detections of the same fires, so the jump of {sharp_since} is taken out and every year is on one scale.',
          fields,
        ),
      ].filter((s): s is string => s !== null),
    [fields],
  );

  const estimateLines = [
    'Two kinds of satellite pass over a fire: a coarse one and a sharp one. The sharp one is hidden.',
    "From the coarse passes alone, a model works out where the fire is in squares as small as the sharp satellite's. The model is experimental.",
  ];

  const testLines = useMemo(() => {
    const out: string[] = [
      'Then the sharp satellite is revealed, and the estimate is compared with what it saw, beside simple methods that use the coarse satellite as it is.',
    ];
    if (conditions.not_always_ahead === true) {
      const line = fillTemplate(
        'On the {test_fires_n} fires kept as its test the estimate beat them on {test_fire_scores} of {test_scores_n} scores. It does not always win.',
        fields,
      );
      if (line) out.push(line);
    } else if (conditions.not_always_ahead === false) {
      const line = fillTemplate(
        'On the {test_fires_n} fires kept as its test the estimate beat them on {test_fire_scores} of {test_scores_n} scores.',
        fields,
      );
      if (line) out.push(line);
    }
    return out;
  }, [fields, conditions.not_always_ahead]);

  const playLines = useMemo(() => {
    const out: string[] = [];
    const l1 = fillTemplate(
      'The hidden satellite also makes a game. You get {round_looks} looks through it, one square of the fire each, and you choose where.',
      fields,
    );
    if (l1) out.push(l1);
    if (conditions.learned_beats_rule) {
      out.push(
        'Simple rules and a player that learned from past fires play the same round, and the learned player gains more than the simple rule.',
      );
    } else {
      out.push(
        'Simple rules and a player that learned from past fires play the same round. The learned player does not beat the simple rule.',
      );
    }
    return out;
  }, [fields, conditions.learned_beats_rule]);

  const proofItems = useMemo(() => {
    const closedLine = fillTemplate(
      '{test_fires_n} fires were never used to tune the model and are kept as its test: {test_fire_names}. On them the estimate beat the simple methods on {test_fire_scores} of {test_scores_n} scores.',
      fields,
    );
    const valLine = fillTemplate(
      'On {other_fires_n} fires of other years, counting a score only when the gap is too large to be luck, it was ahead on {other_ahead}, level on {other_level} and behind on {other_behind}.',
      fields,
    );
    const honestLine =
      conditions.no_part_switched_on === true
        ? 'That is not enough to switch the model on. It is experimental: shown and tested here, and nothing more is claimed for it.'
        : null;
    const gameLine = fillTemplate(
      'In the game, a simple rule gained more than random looks on {rule_ahead_rounds} of {rounds_n} rounds.',
      fields,
    );
    const recordLine = fillTemplate(
      'For the record itself: hide one year and predict it from the others, and in a typical year the prediction is off by {record_error} percent around {place}. Without the correction it is off by {record_error_raw} percent.',
      fields,
    );
    return { closedLine, valLine, honestLine, gameLine, recordLine };
  }, [fields, conditions.no_part_switched_on]);

  const methodLines = useMemo(() => {
    const out: string[] = [];
    const m1 = fillTemplate(
      "Real data only: NASA's public record of fire detections since {record_first_year}, the satellites' real passes, and real ground.",
      fields,
    );
    if (m1) out.push(m1);
    const m2 = fillTemplate(
      'Fires can be shown pass by pass in {places_n} places: {places_with_fires}. For any other area you can draw a box and read its fire record.',
      fields,
    );
    if (m2) out.push(m2);
    return out;
  }, [fields]);

  const openEvidence = () => {
    if (store?.model.openEvidence) {
      store.model.openEvidence();
    } else {
      setFallbackEvidenceOpen(true);
    }
  };

  return (
    <div ref={rootRef} className="iso-lb" data-landing-ui="true">
      <div className="iso-lb__inner">
        {/* Act 1: What Isogon does in one sentence and one picture */}
        <section className="iso-lb-intro" data-reveal-section aria-label="What Isogon does">
          <p className="iso-lb-intro__sentence">
            Isogon puts NASA&apos;s two kinds of fire satellite on one record, then tests an estimate of a real fire by
            hiding the sharper satellite and checking against it.
          </p>

          <figure className="iso-lb-figure">
            <img
              className="iso-lb-figure__img"
              src={publicUrl('generated/landing/three-ways.jpg')}
              alt="Feather River fire on 11 August 2012 shown three ways: what the coarse satellite saw at 1 km, the estimate made from coarse passes alone on a 375 m grid, and what the withheld sharp satellite actually saw at 375 m."
              loading="lazy"
              decoding="async"
            />
            <figcaption className="iso-lb-figure__cols">
              <div className="iso-lb-figure__col">
                <span className="iso-lb-figure__col-title">
                  <span className="iso-lb-swatch iso-lb-swatch--modis" aria-hidden="true" />
                  What the coarse satellite saw
                </span>
                <span className="iso-lb-figure__col-meta">The coarse satellite, 1 km squares, 10 August, 10:24 at night</span>
              </div>
              <div className="iso-lb-figure__col">
                <span className="iso-lb-figure__col-title">
                  <span className="iso-lb-swatch iso-lb-swatch--estimate" aria-hidden="true" />
                  The estimate from coarse passes alone
                </span>
                <span className="iso-lb-figure__col-meta">375 m grid frames declared before the reveal</span>
              </div>
              <div className="iso-lb-figure__col">
                <span className="iso-lb-figure__col-title">
                  <span className="iso-lb-swatch iso-lb-swatch--detection" aria-hidden="true" />
                  What the sharp satellite saw
                </span>
                <span className="iso-lb-figure__col-meta">The sharp satellite, 375 m squares, 11 August, 2:15 at night</span>
              </div>
            </figcaption>
          </figure>
        </section>

        {/* Act 2: The four steps (Record, Estimate, Test, Play) */}
        <section className="iso-lb-blocks" aria-label="The four steps">
          <article className="iso-lb-block" data-reveal-section>
            <figure className="iso-lb-block__media">
              <StepShaderCanvas
                kind="record"
                ariaLabel="Grid of Feather River monthly fire rates from 2000 to 2025, with the 2012 jump flattening onto one scale."
              />
              <figcaption className="iso-lb-caption">
                <span className="iso-lb-legend">
                  <span className="iso-lb-legend__item">
                    <span className="iso-lb-swatch iso-lb-swatch--modis" aria-hidden="true" />
                    Coarse era
                  </span>
                  <span className="iso-lb-legend__item">
                    <span className="iso-lb-swatch iso-lb-swatch--detection" aria-hidden="true" />
                    Sharp era from 2012
                  </span>
                </span>
                <span>Feather River monthly rates, 2000 to 2025</span>
              </figcaption>
            </figure>
            <div className="iso-lb-block__copy">
              <h2 className="iso-lb-block__title">Record</h2>
              <div className="iso-lb-block__lines">
                {recordLines.map((line, i) => (
                  <p key={i} className="iso-lb-block__line">
                    {line}
                  </p>
                ))}
              </div>
              <button type="button" className="iso-lb-action" onClick={onEnter}>
                <span className="iso-lb-action__label">See the fire record</span>
                <ActionArrow />
              </button>
            </div>
          </article>

          <article className="iso-lb-block iso-lb-block--flip" data-reveal-section>
            <figure className="iso-lb-block__media">
              <StepShaderCanvas
                kind="estimate"
                ariaLabel="Oblique canyon relief of Feather River where coarse 1 km satellite squares resolve into white 375 m estimate frames."
              />
              <figcaption className="iso-lb-caption">
                <span className="iso-lb-legend">
                  <span className="iso-lb-legend__item">
                    <span className="iso-lb-swatch iso-lb-swatch--modis" aria-hidden="true" />
                    1 km coarse passes
                  </span>
                  <span className="iso-lb-legend__item">
                    <span className="iso-lb-swatch iso-lb-swatch--estimate" aria-hidden="true" />
                    375 m estimate frames
                  </span>
                </span>
                <span>Simplified canyon relief and pass slice, 11 August 2012</span>
              </figcaption>
            </figure>
            <div className="iso-lb-block__copy">
              <h2 className="iso-lb-block__title">Estimate</h2>
              <div className="iso-lb-block__lines">
                {estimateLines.map((line, i) => (
                  <p key={i} className="iso-lb-block__line">
                    {line}
                  </p>
                ))}
              </div>
              <button type="button" className="iso-lb-action" onClick={() => onOpenPart('model')}>
                <span className="iso-lb-action__label">See the estimate</span>
                <ActionArrow />
              </button>
            </div>
          </article>

          <article className="iso-lb-block" data-reveal-section>
            <figure className="iso-lb-block__media">
              <StepShaderCanvas
                kind="test"
                ariaLabel="Oblique canyon relief of Feather River as withheld 375 m sharp satellite detections sweep in over the white estimate frames."
              />
              <figcaption className="iso-lb-caption">
                <span className="iso-lb-legend">
                  <span className="iso-lb-legend__item">
                    <span className="iso-lb-swatch iso-lb-swatch--estimate" aria-hidden="true" />
                    Estimate frame
                  </span>
                  <span className="iso-lb-legend__item">
                    <span className="iso-lb-swatch iso-lb-swatch--detection" aria-hidden="true" />
                    Revealed sharp detection
                  </span>
                </span>
                <span>Withheld pass at 2:15 at night on the same canyon slice</span>
              </figcaption>
            </figure>
            <div className="iso-lb-block__copy">
              <h2 className="iso-lb-block__title">Test</h2>
              <div className="iso-lb-block__lines">
                {testLines.map((line, i) => (
                  <p key={i} className="iso-lb-block__line">
                    {line}
                  </p>
                ))}
              </div>
              <button type="button" className="iso-lb-action" onClick={() => onOpenPart('model')}>
                <span className="iso-lb-action__label">Run the test</span>
                <ActionArrow />
              </button>
            </div>
          </article>

          <article className="iso-lb-block iso-lb-block--flip" data-reveal-section>
            <figure className="iso-lb-block__media">
              <StepShaderCanvas
                kind="play"
                ariaLabel="Four-by-four board draped over Feather River canyon relief as four looks uncover hidden fire detections in order."
              />
              <figcaption className="iso-lb-caption">
                <span className="iso-lb-legend">
                  <span className="iso-lb-legend__item">
                    <span className="iso-lb-swatch iso-lb-swatch--estimate" aria-hidden="true" />
                    Chosen square
                  </span>
                  <span className="iso-lb-legend__item">
                    <span className="iso-lb-swatch iso-lb-swatch--detection" aria-hidden="true" />
                    Detections uncovered
                  </span>
                </span>
                <span>Four looks of the least-sure rule on simplified relief</span>
              </figcaption>
            </figure>
            <div className="iso-lb-block__copy">
              <h2 className="iso-lb-block__title">Play</h2>
              <div className="iso-lb-block__lines">
                {playLines.map((line, i) => (
                  <p key={i} className="iso-lb-block__line">
                    {line}
                  </p>
                ))}
              </div>
              <button type="button" className="iso-lb-action" onClick={() => onOpenPart('environment')}>
                <span className="iso-lb-action__label">Play a round</span>
                <ActionArrow />
              </button>
            </div>
          </article>
        </section>

        {/* Act 3: What the Tests Say (2x2 telemetry matrix + verbatim honest sentences) */}
        <section className="iso-lb-proof" data-reveal-section aria-labelledby="iso-lb-proof-title">
          <div className="iso-lb-proof__head">
            <h2 id="iso-lb-proof-title" className="iso-lb-section__title">
              What the Tests Say
            </h2>
            <button type="button" className="iso-lb-action" onClick={openEvidence}>
              <span className="iso-lb-action__label">See every test on record</span>
              <ActionArrow />
            </button>
          </div>

          <div className="iso-lb-proof-grid">
            {proofItems.closedLine && (
              <div className="iso-lb-stat">
                {telemetry.testFires && telemetry.scoresJudgedNum !== null && (
                  <>
                    <div className="iso-lb-stat__hero">
                      <span className="iso-lb-stat__figure">
                        {telemetry.testFires.map((tf) => tf.won).join(', ')}
                      </span>
                      <span className="iso-lb-stat__unit">of {telemetry.scoresJudgedNum} scores won</span>
                    </div>
                    <div className="iso-lb-stat__fires" aria-hidden="true">
                      {telemetry.testFires.map((tf) => {
                        const low = tf.won * 2 < tf.of;
                        return (
                          <div key={tf.id} className="iso-lb-stat__fire-segs">
                            {Array.from({ length: tf.of }).map((_, idx) => (
                              <span
                                key={idx}
                                className="iso-lb-stat__seg"
                                data-lit={idx < tf.won ? 'ink' : low ? 'fail' : 'none'}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                <div className="iso-lb-stat__copy">
                  <p className="iso-lb-section__line">{proofItems.closedLine}</p>
                </div>
              </div>
            )}

            {(proofItems.valLine || proofItems.honestLine) && (
              <div className="iso-lb-stat">
                {telemetry.valAhead !== null && telemetry.valEpisodes !== null && (
                  <>
                    <div className="iso-lb-stat__hero">
                      <span className="iso-lb-stat__figure">
                        {telemetry.valAhead} of {telemetry.valEpisodes}
                      </span>
                      <span className="iso-lb-stat__unit">
                        fires ahead ({fields.other_level} level, {fields.other_behind} behind)
                      </span>
                    </div>
                    <div className="iso-lb-stat__rounds" aria-hidden="true">
                      {Array.from({ length: telemetry.valEpisodes }).map((_, idx) => {
                        const ahead = telemetry.valAhead ?? 0;
                        const level = telemetry.valLevel ?? 0;
                        const lit = idx < ahead ? 'ink' : idx < ahead + level ? 'muted' : 'fail';
                        return <span key={idx} className="iso-lb-stat__seg" data-lit={lit} />;
                      })}
                    </div>
                  </>
                )}
                <div className="iso-lb-stat__copy">
                  {proofItems.valLine && <p className="iso-lb-section__line">{proofItems.valLine}</p>}
                  {proofItems.honestLine && (
                    <p className="iso-lb-section__line iso-lb-section__line--honest">{proofItems.honestLine}</p>
                  )}
                </div>
              </div>
            )}

            {proofItems.gameLine && (
              <div className="iso-lb-stat">
                {telemetry.ruleAheadNum !== null && telemetry.roundsTotalNum !== null && (
                  <>
                    <div className="iso-lb-stat__hero">
                      <span className="iso-lb-stat__figure">
                        {telemetry.ruleAheadNum} of {telemetry.roundsTotalNum}
                      </span>
                      <span className="iso-lb-stat__unit">rounds gained over random looks</span>
                    </div>
                    <div className="iso-lb-stat__rounds" aria-hidden="true">
                      {Array.from({ length: telemetry.roundsTotalNum }).map((_, idx) => (
                        <span
                          key={idx}
                          className="iso-lb-stat__seg"
                          data-lit={idx < (telemetry.ruleAheadNum ?? 0) ? 'ink' : 'none'}
                        />
                      ))}
                    </div>
                  </>
                )}
                <div className="iso-lb-stat__copy">
                  <p className="iso-lb-section__line">{proofItems.gameLine}</p>
                </div>
              </div>
            )}

            {proofItems.recordLine && (
              <div className="iso-lb-stat">
                {telemetry.errPctNum !== null && telemetry.errRawPctNum !== null && (
                  <>
                    <div className="iso-lb-stat__hero">
                      <span className="iso-lb-stat__figure">{telemetry.errPctNum}%</span>
                      <span className="iso-lb-stat__unit">
                        typical year miss, down from {telemetry.errRawPctNum}%
                      </span>
                    </div>
                    <div className="iso-lb-stat__compare" aria-hidden="true">
                      <div className="iso-lb-stat__track">
                        <div
                          className="iso-lb-stat__fill"
                          style={{ width: `${Math.min(100, Math.max(4, telemetry.errPctNum))}%` }}
                        />
                      </div>
                      <div className="iso-lb-stat__track">
                        <div
                          className="iso-lb-stat__fill iso-lb-stat__fill--raw"
                          style={{ width: `${Math.min(100, Math.max(4, telemetry.errRawPctNum))}%` }}
                        />
                      </div>
                    </div>
                  </>
                )}
                <div className="iso-lb-stat__copy">
                  <p className="iso-lb-section__line">{proofItems.recordLine}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Act 4: Data and Method */}
        <section className="iso-lb-method" data-reveal-section aria-labelledby="iso-lb-method-title">
          <div className="iso-lb-method__left">
            <h2 id="iso-lb-method-title" className="iso-lb-section__title">
              Data and Method
            </h2>
            <div className="iso-lb-method__links">
              <button type="button" className="iso-lb-action" onClick={onOpenMethod}>
                <span className="iso-lb-action__label">Method and Data</span>
                <ActionArrow />
              </button>
              {onOpenSensor && (
                <button type="button" className="iso-lb-action iso-lb-action--quiet" onClick={onOpenSensor}>
                  <span className="iso-lb-action__label">Sensor Geometry</span>
                </button>
              )}
            </div>
          </div>

          <div className="iso-lb-method__right">
            {methodLines.map((line, i) => (
              <p key={i} className="iso-lb-section__line">
                {line}
              </p>
            ))}
          </div>
        </section>

        {/* Act 5: Final start horizon + visible sound control */}
        <footer className="iso-lb-start">
          <button type="button" className="iso-lb-start__cta" onClick={onEnter}>
            <kbd className="iso-lb-start__key">Enter</kbd>
            <span className="iso-lb-start__cta-label">Start with a real fire</span>
            <ActionArrow />
          </button>
          <SoundControl />
        </footer>
      </div>

      {!store && fallbackEvidenceOpen && (
        <EvidenceSheet
          open={fallbackEvidenceOpen}
          doc={evidenceDoc}
          state={evidenceDoc ? 'ready' : localEvidenceState}
          onClose={() => setFallbackEvidenceOpen(false)}
        />
      )}
    </div>
  );
}
