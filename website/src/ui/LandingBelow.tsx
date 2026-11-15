import { useEffect, useMemo, useRef, useState } from 'react';
import { useOptionalWorkspace, formatCountNone, formatCountWord, formatListAnd, formatSheetCount } from '../components/BlindScoreTable';
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
const vec3 INK_PLATE = vec3(0.058, 0.075, 0.106);
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

// 1. Record: 26 years x 12 months grid + annual profile, showing the 2012 jump flattening onto one scale.
const FRAG_RECORD = `${FRAG_COMMON}
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 px = uv * uResolution;
  float padX = 20.0 * uDpr;
  float padY = 16.0 * uDpr;
  vec2 inner = max(vec2(1.0), uResolution - vec2(padX * 2.0, padY * 2.0));
  vec2 local = (px - vec2(padX, padY)) / inner;

  vec3 col = INK_NIGHT;

  float cycle = mod(uTime, 9.2);
  float revealProgress = clamp(cycle / 3.2, 0.0, 1.0);
  float flatten = smoothstep(3.6, 6.4, cycle) * (1.0 - smoothstep(8.5, 9.15, cycle));
  float shownYears = revealProgress * 26.0;

  if (local.x >= 0.0 && local.x < 1.0 && local.y >= 0.0 && local.y < 1.0) {
    float yearIdx = floor(local.x * 26.0);
    float yearFrac = fract(local.x * 26.0);
    float yearPxW = inner.x / 26.0;
    float gapX = clamp((1.5 * uDpr) / max(4.0, yearPxW), 0.06, 0.22);

    float yearAppear = clamp(shownYears - yearIdx, 0.0, 1.0);
    bool isSharpEra = yearIdx >= 12.0;

    // Top 28%: annual rate bars showing the 2012 jump flattening onto one scale.
    if (local.y < 0.28) {
      float barAreaY = local.y / 0.28;
      vec4 ann = texture2D(uData, vec2((yearIdx + 0.5) / 32.0, 12.5 / 16.0));
      float hVal = mix(ann.r, ann.g, flatten) * yearAppear;
      float fromBottom = 1.0 - barAreaY;
      if (yearFrac > gapX && yearFrac < 1.0 - gapX) {
        col = mix(col, INK_PLATE, 0.55);
        if (fromBottom <= hVal) {
          vec3 rawBarInk = isSharpEra ? mix(INK_MODIS, INK_SHARP, 0.85) : INK_MODIS;
          vec3 oneBarInk = mix(INK_MODIS, INK_EST, clamp(hVal * 0.85, 0.0, 1.0));
          col = mix(rawBarInk, oneBarInk, flatten);
        }
      }
      if (abs(barAreaY - 1.0) * inner.y * 0.28 < 1.1 * uDpr) {
        col = INK_RULE;
      }
    } else if (local.y > 0.34) {
      // Bottom 66%: 26 years x 12 months matrix.
      float gridY = (local.y - 0.34) / 0.66;
      float monthIdx = floor(gridY * 12.0);
      float monthFrac = fract(gridY * 12.0);
      float monthPxH = (inner.y * 0.66) / 12.0;
      float gapY = clamp((1.5 * uDpr) / max(4.0, monthPxH), 0.08, 0.24);

      if (yearFrac > gapX && yearFrac < 1.0 - gapX && monthFrac > gapY && monthFrac < 1.0 - gapY) {
        vec4 cell = texture2D(uData, vec2((yearIdx + 0.5) / 32.0, (monthIdx + 0.5) / 16.0));
        if (cell.b < 0.1) {
          col = INK_NIGHT;
        } else {
          float v = mix(cell.r, cell.g, flatten) * yearAppear;
          vec3 baseEmpty = mix(INK_NIGHT, INK_RULE, 0.36);
          vec3 rawInk = isSharpEra
            ? mix(baseEmpty, INK_SHARP, clamp(v * 1.15, 0.0, 1.0))
            : mix(baseEmpty, INK_MODIS, clamp(v * 1.15, 0.0, 1.0));
          vec3 calmInk = mix(baseEmpty, mix(INK_MODIS, INK_SHARP, clamp(v * 0.9, 0.0, 1.0)), clamp(v * 1.1, 0.0, 1.0));
          col = mix(rawInk, calmInk, flatten);
        }
      }
    }

    // Vertical rule marking January 2012 where the sharp satellite begins.
    float joinX = 12.0 / 26.0;
    float distJoinPx = abs(local.x - joinX) * inner.x;
    if (distJoinPx < 1.0 * uDpr) {
      col = mix(col, mix(INK_SHARP, INK_EDGE, flatten * 0.7), 0.85);
    }
  }

  col += staticGrain(gl_FragCoord.xy) * 0.012;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// 2. Estimate: Coarse 1 km MODIS squares resolving into 375 m white estimate frames.
const FRAG_ESTIMATE = `${FRAG_COMMON}
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 px = uv * uResolution;
  float pad = 14.0 * uDpr;
  vec2 inner = max(vec2(1.0), uResolution - vec2(pad * 2.0));
  vec2 local = (px - vec2(pad)) / inner;

  vec3 col = INK_NIGHT;

  if (local.x >= 0.0 && local.x < 1.0 && local.y >= 0.0 && local.y < 1.0) {
    vec2 gridDim = vec2(48.0, 30.0);
    vec2 cellPos = local * gridDim;
    vec2 cellIdx = floor(cellPos);
    vec2 cellUv = fract(cellPos);
    vec2 cellPx = inner / gridDim;

    // Subtle 1 km (3x3 cell) background survey grid.
    vec2 coarseUv = fract(cellPos / 3.0);
    vec2 coarsePx = cellPx * 3.0;
    bool onCoarseGrid = coarseUv.x * coarsePx.x < 1.0 * uDpr || coarseUv.y * coarsePx.y < 1.0 * uDpr;
    if (onCoarseGrid) {
      col = mix(col, INK_RULE, 0.42);
    }

    vec4 d = texture2D(uData, vec2((cellIdx.x + 0.5) / 64.0, (cellIdx.y + 0.5) / 64.0));
    float coarseWeight = d.r;
    float isDeclared = step(0.5, d.g);
    float isEnvelope = step(0.5, d.b);

    float cycle = mod(uTime, 8.4);
    float coarseIn = smoothstep(0.15, 1.2, cycle);
    float sweepPos = (cycle - 2.0) / 3.2;
    float diag = local.x * 0.78 + local.y * 0.22;
    float resolved = smoothstep(diag - 0.14, diag + 0.06, sweepPos) * (1.0 - smoothstep(7.7, 8.35, cycle));

    // Coarse 1 km MODIS squares: bright at first, receding softly as 375 m frames resolve.
    if (coarseWeight > 0.02) {
      float blockEdge = min(
        min(coarseUv.x * coarsePx.x, (1.0 - coarseUv.x) * coarsePx.x),
        min(coarseUv.y * coarsePx.y, (1.0 - coarseUv.y) * coarsePx.y)
      );
      float fillStrength = coarseWeight * coarseIn * mix(0.62, 0.16, resolved);
      col = mix(col, INK_MODIS, fillStrength);
      if (blockEdge < 1.25 * uDpr) {
        col = mix(col, INK_MODIS, coarseIn * mix(0.85, 0.28, resolved));
      }
    }

    // Dotted outer perimeter around the model belief region.
    if (isEnvelope > 0.5 && resolved > 0.05) {
      float checker = mod(cellIdx.x + cellIdx.y, 2.0);
      if (checker > 0.5) {
        col = mix(col, INK_EDGE, 0.35 * resolved);
      }
    }

    // Resolved 375 m white frames of declared_cells.
    if (isDeclared > 0.5 && resolved > 0.01) {
      float edgePx = min(
        min(cellUv.x * cellPx.x, (1.0 - cellUv.x) * cellPx.x),
        min(cellUv.y * cellPx.y, (1.0 - cellUv.y) * cellPx.y)
      );
      float gapPx = 0.8 * uDpr;
      float strokePx = 2.05 * uDpr;
      if (edgePx >= gapPx && edgePx <= strokePx) {
        col = mix(col, INK_EST, resolved * 0.96);
      } else if (edgePx > strokePx) {
        col = mix(col, INK_EST, resolved * 0.1);
      }
    }

    // Quiet resolution wavefront line.
    float waveDist = abs(diag - sweepPos);
    if (cycle > 2.0 && cycle < 5.4 && waveDist < 0.008) {
      col = mix(col, INK_EST, 0.38);
    }
  }

  col += staticGrain(gl_FragCoord.xy) * 0.012;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// 3. Test: The sharp satellite's hidden 375 m detections revealed over the white estimate frames.
const FRAG_TEST = `${FRAG_COMMON}
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 px = uv * uResolution;
  float pad = 14.0 * uDpr;
  vec2 inner = max(vec2(1.0), uResolution - vec2(pad * 2.0));
  vec2 local = (px - vec2(pad)) / inner;

  vec3 col = INK_NIGHT;

  if (local.x >= 0.0 && local.x < 1.0 && local.y >= 0.0 && local.y < 1.0) {
    vec2 gridDim = vec2(48.0, 30.0);
    vec2 cellPos = local * gridDim;
    vec2 cellIdx = floor(cellPos);
    vec2 cellUv = fract(cellPos);
    vec2 cellPx = inner / gridDim;

    vec2 coarseUv = fract(cellPos / 3.0);
    vec2 coarsePx = cellPx * 3.0;
    if (coarseUv.x * coarsePx.x < 1.0 * uDpr || coarseUv.y * coarsePx.y < 1.0 * uDpr) {
      col = mix(col, INK_RULE, 0.36);
    }

    vec4 d = texture2D(uData, vec2((cellIdx.x + 0.5) / 64.0, (cellIdx.y + 0.5) / 64.0));
    float coarseWeight = d.r;
    float isDeclared = step(0.5, d.g);
    float sharpWeight = d.a;

    if (coarseWeight > 0.02) {
      col = mix(col, INK_MODIS, coarseWeight * 0.09);
    }

    float cycle = mod(uTime, 8.8);
    float scan = (cycle - 1.8) / 3.2;
    float passCoord = local.x * 0.85 - local.y * 0.15 + 0.15;
    float revealed = smoothstep(passCoord - 0.08, passCoord + 0.03, scan) * (1.0 - smoothstep(8.1, 8.75, cycle));

    float edgePx = min(
      min(cellUv.x * cellPx.x, (1.0 - cellUv.x) * cellPx.x),
      min(cellUv.y * cellPx.y, (1.0 - cellUv.y) * cellPx.y)
    );

    // Estimate 375 m white hollow frame stands throughout.
    if (isDeclared > 0.5) {
      if (edgePx >= 0.7 * uDpr && edgePx <= 1.95 * uDpr) {
        col = mix(col, INK_EST, 0.9);
      } else if (edgePx > 1.95 * uDpr) {
        col = mix(col, INK_EST, 0.06);
      }
    }

    // Hidden sharp 375 m detections appear in #f08a45 over and beside the frames.
    if (sharpWeight > 0.04 && revealed > 0.01) {
      float inset = isDeclared > 0.5 ? 2.1 * uDpr : 1.0 * uDpr;
      if (edgePx >= inset) {
        float strength = clamp(0.55 + sharpWeight * 0.45, 0.0, 1.0) * revealed;
        col = mix(col, INK_SHARP, strength);
      }
    }

    // Satellite scan line during the reveal pass.
    if (cycle > 1.8 && cycle < 5.2 && abs(passCoord - scan) < 0.007) {
      col = mix(col, INK_SHARP, 0.55);
    }
  }

  col += staticGrain(gl_FragCoord.xy) * 0.012;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// 4. Play: 4x4 board laid over the land with 4 looks landing in order.
const FRAG_PLAY = `${FRAG_COMMON}
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 px = uv * uResolution;
  float pad = 16.0 * uDpr;
  vec2 inner = max(vec2(1.0), uResolution - vec2(pad * 2.0));
  vec2 local = (px - vec2(pad)) / inner;

  vec3 col = INK_NIGHT;

  if (local.x >= 0.0 && local.x < 1.0 && local.y >= 0.0 && local.y < 1.0) {
    vec2 boardDim = vec2(4.0, 4.0);
    vec2 tilePos = local * boardDim;
    vec2 tileRC = floor(tilePos);
    vec2 tileUv = fract(tilePos);
    vec2 tilePx = inner / boardDim;
    float tileId = tileRC.y * 4.0 + tileRC.x;

    vec2 subDim = vec2(48.0, 32.0);
    vec2 subIdx = floor(local * subDim);
    vec2 subUv = fract(local * subDim);
    vec2 subPx = inner / subDim;

    vec4 d = texture2D(uData, vec2((subIdx.x + 0.5) / 64.0, (subIdx.y + 0.5) / 32.0));
    float modisHint = d.r;
    float tileUnsure = d.g;
    float lookSlot = floor(d.b * 4.0 + 0.5); // 0, 1, 2, 3, 4
    float sharpWeight = d.a;

    float cycle = mod(uTime, 9.6);
    float activeStep = floor(clamp((cycle - 0.8) / 1.9, -1.0, 3.999)) + 1.0; // 0..4
    float fadeReset = 1.0 - smoothstep(8.9, 9.55, cycle);

    // Subtle uncertainty wash before looks complete.
    col = mix(col, INK_PLATE, 0.35 + tileUnsure * 0.45);

    // Coarse MODIS pixels visible across all 16 squares.
    if (modisHint > 0.03) {
      float subEdge = min(
        min(subUv.x * subPx.x, (1.0 - subUv.x) * subPx.x),
        min(subUv.y * subPx.y, (1.0 - subUv.y) * subPx.y)
      );
      if (subEdge > 0.6 * uDpr) {
        col = mix(col, INK_MODIS, modisHint * 0.42);
      }
    }

    // Revealed sharp detections from looks taken so far.
    if (lookSlot >= 1.0 && lookSlot <= activeStep && sharpWeight > 0.04) {
      float stepTime = 0.8 + (lookSlot - 1.0) * 1.9;
      float appear = smoothstep(stepTime, stepTime + 0.35, cycle) * fadeReset;
      float subEdge = min(
        min(subUv.x * subPx.x, (1.0 - subUv.x) * subPx.x),
        min(subUv.y * subPx.y, (1.0 - subUv.y) * subPx.y)
      );
      if (subEdge > 0.75 * uDpr) {
        col = mix(col, INK_SHARP, appear * clamp(0.6 + sharpWeight * 0.4, 0.0, 1.0));
      }
    }

    // 4x4 board rules.
    float tEdgeX = min(tileUv.x * tilePx.x, (1.0 - tileUv.x) * tilePx.x);
    float tEdgeY = min(tileUv.y * tilePx.y, (1.0 - tileUv.y) * tilePx.y);
    float tEdge = min(tEdgeX, tEdgeY);
    if (tEdge < 1.0 * uDpr) {
      col = mix(col, INK_RULE, 0.95);
    }

    // Determine which tile currently holds the look reticle (uMeta holds the 4 chosen tiles).
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

    if (visited && tEdge >= 1.0 * uDpr && tEdge < 2.0 * uDpr) {
      col = mix(col, INK_EDGE, 0.65 * fadeReset);
    }

    // Corner brackets on the active look tile, matching system.css .sys-selected.
    if (abs(tileId - currentTile) < 0.25 && fadeReset > 0.05) {
      float arm = 10.0 * uDpr;
      float stroke = 2.2 * uDpr;
      float inset = 3.0 * uDpr;
      float dx = min(tileUv.x * tilePx.x, (1.0 - tileUv.x) * tilePx.x);
      float dy = min(tileUv.y * tilePx.y, (1.0 - tileUv.y) * tilePx.y);
      bool onBracket =
        (dx >= inset && dx <= inset + arm && dy >= inset && dy <= inset + stroke) ||
        (dy >= inset && dy <= inset + arm && dx >= inset && dx <= inset + stroke);
      if (onBracket) {
        col = mix(col, INK_EST, fadeReset);
      }
    }
  }

  col += staticGrain(gl_FragCoord.xy) * 0.012;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const STILL_TIMES: Record<BlockVisualKind, number> = {
  record: 5.8,
  estimate: 6.2,
  test: 6.0,
  play: 7.4,
};

const INITIAL_TIMES: Record<BlockVisualKind, number> = {
  record: 2.6,
  estimate: 3.1,
  test: 2.9,
  play: 2.8,
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
  uploadTexture: (kind: BlockVisualKind, width: number, height: number, bytes: Uint8Array, meta?: [number, number, number, number]) => void;
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

  const emptyBytes = new Uint8Array(4 * 4 * 4);
  (['record', 'estimate', 'test', 'play'] as const).forEach((k) => {
    const tex = textures[k];
    if (!tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, emptyBytes);
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

      // Paint one immediate frame so the canvas is never blank before scroll.
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
   Packing real static Feather River JSON files into power-of-two RGBA textures
   ============================================================================ */

function uploadRecordTexture(engine: SharedWebglEngine, data: RecordLandingData): void {
  const W = 32;
  const H = 16;
  const bytes = new Uint8Array(W * H * 4);
  const maxRaw = Math.max(1e-6, data.max_raw);
  const maxOne = Math.max(1e-6, data.max_one_scale);

  // Use one shared denominator (maxRaw) for annual bar heights so the 2012 raw jump and its flattening are true to scale.
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
  const H = 64;
  const bytes = new Uint8Array(W * H * 4);
  const cols = Math.min(W, data.grid.cols);
  const rows = Math.min(H, data.grid.rows);

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

  // Compute a 2-cell dilated outer boundary ring for the dotted belief envelope.
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

  engine.uploadTexture('estimate', W, H, bytes);
  engine.uploadTexture('test', W, H, bytes);
}

function uploadPlayTexture(engine: SharedWebglEngine, data: PlayLandingData): void {
  const W = 64;
  const H = 32;
  const bytes = new Uint8Array(W * H * 4);
  const cols = Math.min(W, data.grid.cols);
  const rows = Math.min(H, data.grid.rows);

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
      // Preserve the earliest look that uncovered this cell so looks accumulate cleanly in order.
      if (bytes[idx + 2] === 0) {
        bytes[idx + 2] = slotByte;
      }
      if (w > bytes[idx + 3]) {
        bytes[idx + 3] = w;
      }
    }
  }

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
  const activeRegionId = store?.run.active?.region.id || 'plumas_ca';

  const [calendarSlice, setCalendarSlice] = useState<CalendarRouteSlice | null>(null);
  const [regionsSlice, setRegionsSlice] = useState<RegionsRouteSlice | null>(null);
  const [localEvidence, setLocalEvidence] = useState<EvidenceDoc | null>(null);
  const [localEvidenceState, setLocalEvidenceState] = useState<EvidenceState>('loading');
  const [fallbackEvidenceOpen, setFallbackEvidenceOpen] = useState(false);

  const evidenceDoc = store?.model.evidence ?? localEvidence;

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

  const { fields, conditions } = useMemo(() => {
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

    const f: Record<string, string | null> = {
      place: calendarSlice?.place?.name ?? calendarSlice?.region_name ?? null,
      record_first_year: sm?.first_month ? sm.first_month.slice(0, 4) : null,
      sharp_since: viirsMarker?.year_month ? viirsMarker.year_month.slice(0, 4) : null,
      sharp_to_coarse:
        typeof sm?.viirs_to_modis_overlap_ratio === 'number' && Number.isFinite(sm.viirs_to_modis_overlap_ratio)
          ? sm.viirs_to_modis_overlap_ratio.toFixed(1)
          : null,
      record_error:
        typeof sm?.held_out_median_abs_relative_error === 'number' &&
        Number.isFinite(sm.held_out_median_abs_relative_error)
          ? String(Math.round(sm.held_out_median_abs_relative_error * 100))
          : null,
      record_error_raw:
        typeof sm?.held_out_median_abs_relative_error_without_harmonization === 'number' &&
        Number.isFinite(sm.held_out_median_abs_relative_error_without_harmonization)
          ? String(Math.round(sm.held_out_median_abs_relative_error_without_harmonization * 100))
          : null,
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

    return {
      fields: f,
      conditions: {
        not_always_ahead: notAlwaysAhead,
        no_part_switched_on: noPartSwitchedOn,
        learned_beats_rule: learnedBeatsRule,
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
          'The newer satellite sees about {sharp_to_coarse} times as many fires, so the jump of {sharp_since} is taken out and every year is on one scale.',
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

  const proofLines = useMemo(() => {
    const out: string[] = [];
    const p1 = fillTemplate(
      '{test_fires_n} fires were never used to tune the model and are kept as its test: {test_fire_names}. On them the estimate beat the simple methods on {test_fire_scores} of {test_scores_n} scores.',
      fields,
    );
    if (p1) out.push(p1);
    const p2 = fillTemplate(
      'On {other_fires_n} fires of other years, counting a score only when the gap is too large to be luck, it was ahead on {other_ahead}, level on {other_level} and behind on {other_behind}.',
      fields,
    );
    if (p2) out.push(p2);
    if (conditions.no_part_switched_on === true) {
      out.push(
        'That is not enough to switch the model on. It is experimental: shown and tested here, and nothing more is claimed for it.',
      );
    }
    const p4 = fillTemplate(
      'In the game, a simple rule gained more than random looks on {rule_ahead_rounds} of {rounds_n} rounds.',
      fields,
    );
    if (p4) out.push(p4);
    const p5 = fillTemplate(
      'For the record itself: hide one year and predict it from the others, and in a typical year the prediction is off by {record_error} percent around {place}. Without the correction it is off by {record_error_raw} percent.',
      fields,
    );
    if (p5) out.push(p5);
    return out;
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
    <div className="iso-lb" data-landing-ui="true">
      <div className="iso-lb__inner">
        {/* 1. What it does: one sentence and one picture */}
        <section className="iso-lb-intro" aria-label="What Isogon does">
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
                <span className="iso-lb-figure__col-meta">Terra MODIS, 1 km squares, 11 Aug 2012 05:24 UTC</span>
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
                <span className="iso-lb-figure__col-meta">Suomi NPP VIIRS, 375 m squares, 11 Aug 2012 09:15 UTC</span>
              </div>
            </figcaption>
          </figure>
        </section>

        {/* 2. The four steps: Record, Estimate, Test, Play */}
        <section className="iso-lb-blocks" aria-label="The four steps">
          <article className="iso-lb-block">
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
              {recordLines.map((line, i) => (
                <p key={i} className="iso-lb-block__line">
                  {line}
                </p>
              ))}
              <button type="button" className="iso-lb-action" onClick={onEnter}>
                <span className="iso-lb-action__label">See the fire record</span>
              </button>
            </div>
          </article>

          <article className="iso-lb-block">
            <figure className="iso-lb-block__media">
              <StepShaderCanvas
                kind="estimate"
                ariaLabel="Coarse 1 km satellite squares resolving into white 375 m estimate frames on the August 2012 Feather River fire."
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
                <span>Flat grid slice of Feather River, 11 August 2012</span>
              </figcaption>
            </figure>
            <div className="iso-lb-block__copy">
              <h2 className="iso-lb-block__title">Estimate</h2>
              {estimateLines.map((line, i) => (
                <p key={i} className="iso-lb-block__line">
                  {line}
                </p>
              ))}
              <button type="button" className="iso-lb-action" onClick={() => onOpenPart('model')}>
                <span className="iso-lb-action__label">See the estimate</span>
              </button>
            </div>
          </article>

          <article className="iso-lb-block">
            <figure className="iso-lb-block__media">
              <StepShaderCanvas
                kind="test"
                ariaLabel="Withheld 375 m sharp satellite detections appearing over the white estimate frames on the August 2012 Feather River fire."
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
                <span>Withheld pass at 09:15 UTC, 11 August 2012</span>
              </figcaption>
            </figure>
            <div className="iso-lb-block__copy">
              <h2 className="iso-lb-block__title">Test</h2>
              {testLines.map((line, i) => (
                <p key={i} className="iso-lb-block__line">
                  {line}
                </p>
              ))}
              <button type="button" className="iso-lb-action" onClick={() => onOpenPart('model')}>
                <span className="iso-lb-action__label">Run the test</span>
              </button>
            </div>
          </article>

          <article className="iso-lb-block">
            <figure className="iso-lb-block__media">
              <StepShaderCanvas
                kind="play"
                ariaLabel="Four-by-four board of squares over Feather River as four looks reveal hidden fire detections in order."
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
                <span>Four looks of the least-sure rule, August 2012</span>
              </figcaption>
            </figure>
            <div className="iso-lb-block__copy">
              <h2 className="iso-lb-block__title">Play</h2>
              {playLines.map((line, i) => (
                <p key={i} className="iso-lb-block__line">
                  {line}
                </p>
              ))}
              <button type="button" className="iso-lb-action" onClick={() => onOpenPart('environment')}>
                <span className="iso-lb-action__label">Play a round</span>
              </button>
            </div>
          </article>
        </section>

        {/* 3 & 4. What the Tests Say + Data and Method */}
        <div className="iso-lb-reading-grid">
          <section className="iso-lb-section" aria-labelledby="iso-lb-proof-title">
            <h2 id="iso-lb-proof-title" className="iso-lb-section__title">
              What the Tests Say
            </h2>
            <div className="iso-lb-section__lines">
              {proofLines.map((line, i) => (
                <p key={i} className="iso-lb-section__line">
                  {line}
                </p>
              ))}
            </div>
            <div className="iso-lb-section__links">
              <button type="button" className="iso-lb-action" onClick={openEvidence}>
                <span className="iso-lb-action__label">See every test on record</span>
              </button>
            </div>
          </section>

          <section className="iso-lb-section" aria-labelledby="iso-lb-method-title">
            <h2 id="iso-lb-method-title" className="iso-lb-section__title">
              Data and Method
            </h2>
            <div className="iso-lb-section__lines">
              {methodLines.map((line, i) => (
                <p key={i} className="iso-lb-section__line">
                  {line}
                </p>
              ))}
            </div>
            <div className="iso-lb-section__links">
              <button type="button" className="iso-lb-action" onClick={onOpenMethod}>
                <span className="iso-lb-action__label">Method and Data</span>
              </button>
              {onOpenSensor && (
                <button type="button" className="iso-lb-action iso-lb-action--quiet" onClick={onOpenSensor}>
                  <span className="iso-lb-action__label">Sensor Geometry</span>
                </button>
              )}
            </div>
          </section>
        </div>

        {/* 5. One action to start + visible sound control */}
        <footer className="iso-lb-start">
          <button type="button" className="iso-lb-start__cta" onClick={onEnter}>
            <span className="iso-lb-start__cta-label">Start with a real fire</span>
            <span className="iso-lb-start__key">Enter</span>
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
