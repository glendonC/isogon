import{r as C,W as ht,X as ft,U as tt,j as e,l as ge,Y as ut,R as Ee}from"./index-CdgYaAW7.js";import{u as pt,f as se,a as de,b as at,c as je,L as _e}from"./Loader-u4ymIQhg.js";import{EvidenceSheet as _t}from"./EvidenceSheet-BFBoa2Ru.js";import"./useDialogFocus-EmoyVDhT.js";import"./OverlapBars-XJ3Xp3IY.js";import"./types-CZu1tyoc.js";const vt=`
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`,ye=`
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
`,Re=`
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
`,xt=`${ye}
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
      // Era typical-year reference line: split across 2012 before flattening, one level line after flattening.
      if (uMeta.z > 0.02 && revealProgress > 0.55) {
        float eraRef = isSharpEra ? mix(uMeta.y, uMeta.z, flatten) : mix(uMeta.x, uMeta.z, flatten);
        float dRefPx = abs(fromBottom - eraRef) * inner.y * 0.28;
        if (dRefPx < 0.85 * uDpr) {
          vec3 refInk = mix(isSharpEra ? INK_SHARP : INK_MODIS, INK_EST, flatten * 0.65);
          col = mix(col, refInk, 0.72 * smoothstep(0.55, 0.95, revealProgress));
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
`,bt=`${ye}
${Re}
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
`,gt=`${ye}
${Re}
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
`,yt=`${ye}
${Re}
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
`,re={record:5.8,estimate:6.1,test:5.8,play:7.2},st={record:5.4,estimate:3.2,test:3,play:2.9};function ve(a,t){const p=a.createShader(a.VERTEX_SHADER),l=a.createShader(a.FRAGMENT_SHADER),s=a.createProgram();return!p||!l||!s?null:(a.shaderSource(p,vt),a.compileShader(p),!a.getShaderParameter(p,a.COMPILE_STATUS)||(a.shaderSource(l,t),a.compileShader(l),!a.getShaderParameter(l,a.COMPILE_STATUS))?(a.deleteShader(p),a.deleteShader(l),a.deleteProgram(s),null):(a.bindAttribLocation(s,0,"aPos"),a.attachShader(s,p),a.attachShader(s,l),a.linkProgram(s),a.deleteShader(p),a.deleteShader(l),a.getProgramParameter(s,a.LINK_STATUS)?{program:s,uRes:a.getUniformLocation(s,"uResolution"),uDpr:a.getUniformLocation(s,"uDpr"),uTime:a.getUniformLocation(s,"uTime"),uData:a.getUniformLocation(s,"uData"),uMeta:a.getUniformLocation(s,"uMeta")}:(a.deleteProgram(s),null)))}let Z=null;function it(){var T;if(Z)return Z;if(typeof document>"u"||typeof window>"u")return Z={supported:!1,register:()=>()=>{},uploadTexture:()=>{}},Z;const a=document.createElement("canvas");a.width=640,a.height=400;let t=null;try{t=a.getContext("webgl",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1})||a.getContext("experimental-webgl",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1})}catch{t=null}if(!t)return Z={supported:!1,register:()=>()=>{},uploadTexture:()=>{}},Z;const p={record:ve(t,xt),estimate:ve(t,bt),test:ve(t,gt),play:ve(t,yt)};if(!p.record||!p.estimate||!p.test||!p.play)return Z={supported:!1,register:()=>()=>{},uploadTexture:()=>{}},Z;const l=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,l),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.pixelStorei(t.UNPACK_ALIGNMENT,1);const s={record:t.createTexture(),estimate:t.createTexture(),test:t.createTexture(),play:t.createTexture()},n={record:[0,0,0,0],estimate:[0,0,0,0],test:[0,0,0,0],play:[4,5,5,5]},y=new Uint8Array(512*4),f=new Uint8Array(8192*4);for(let r=0;r<64;r+=1)for(let w=0;w<64;w+=1){const x=((64+r)*64+w)*4;f[x]=64,f[x+1]=84,f[x+2]=0,f[x+3]=255}["record","estimate","test","play"].forEach(r=>{const w=s[r];w&&(t.bindTexture(t.TEXTURE_2D,w),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),r==="record"?t.texImage2D(t.TEXTURE_2D,0,t.RGBA,32,16,0,t.RGBA,t.UNSIGNED_BYTE,y):t.texImage2D(t.TEXTURE_2D,0,t.RGBA,64,128,0,t.RGBA,t.UNSIGNED_BYTE,f))});const h=new Set;let i=0,m=0;const d=typeof window.matchMedia=="function"?window.matchMedia("(prefers-reduced-motion: reduce)"):null;let g=!!(d!=null&&d.matches);function N(r,w){const x=r.canvas.getBoundingClientRect();if(x.width<4||x.height<4)return;const b=Math.min(window.devicePixelRatio||1,2),S=Math.max(8,Math.round(x.width*b)),_=Math.max(8,Math.round(x.height*b));(r.canvas.width!==S||r.canvas.height!==_)&&(r.canvas.width=S,r.canvas.height=_),S>a.width&&(a.width=S),_>a.height&&(a.height=_);const H=p[r.kind],ee=s[r.kind];if(!H||!ee||!t)return;t.viewport(0,0,S,_),t.useProgram(H.program),t.uniform2f(H.uRes,S,_),t.uniform1f(H.uDpr,b),t.uniform1f(H.uTime,w);const v=n[r.kind];t.uniform4f(H.uMeta,v[0],v[1],v[2],v[3]),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,ee),t.uniform1i(H.uData,0),t.drawArrays(t.TRIANGLES,0,3),r.ctx2d.drawImage(a,0,a.height-_,S,_,0,0,S,_)}function P(){for(const r of h)N(r,re[r.kind]),r.stillDrawn=!0}function u(){if(g||typeof document<"u"&&document.visibilityState==="hidden")return!1;for(const r of h)if(r.visible)return!0;return!1}function E(r){if(i=0,!u())return;const w=m>0?(r-m)/1e3:1/60;m=r;const x=Math.min(Math.max(0,w),1/30);for(const b of h)b.visible&&(b.time+=x,N(b,b.time));u()&&(i=window.requestAnimationFrame(E))}function M(){if(g||typeof document<"u"&&document.visibilityState==="hidden"){i&&(window.cancelAnimationFrame(i),i=0),m=0;for(const r of h)r.stillDrawn||(N(r,re[r.kind]),r.stillDrawn=!0);return}u()&&!i?(m=performance.now(),i=window.requestAnimationFrame(E)):!u()&&i&&(window.cancelAnimationFrame(i),i=0,m=0)}return(T=d==null?void 0:d.addEventListener)==null||T.call(d,"change",()=>{g=!!d.matches;for(const r of h)r.stillDrawn=!1;M()}),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&P(),M()}),window.addEventListener("resize",()=>{for(const r of h)r.stillDrawn=!1;u()||P()}),Z={supported:!0,register(r,w){const x=w.getContext("2d",{alpha:!1});if(!x)return()=>{};const b={kind:r,canvas:w,ctx2d:x,visible:!1,time:st[r],stillDrawn:!1};h.add(b),N(b,g?re[r]:st[r]);const S=typeof IntersectionObserver<"u"?new IntersectionObserver(_=>{for(const H of _)b.visible=H.isIntersecting&&H.intersectionRatio>.02;b.visible&&g&&(N(b,re[r]),b.stillDrawn=!0),M()},{threshold:[0,.05]}):null;return S?S.observe(w):(b.visible=!0,M()),()=>{S==null||S.disconnect(),h.delete(b),M()}},uploadTexture(r,w,x,b,S){const _=s[r];if(!(!_||!t)){S&&(n[r]=S),t.bindTexture(t.TEXTURE_2D,_),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,w,x,0,t.RGBA,t.UNSIGNED_BYTE,b);for(const H of h)H.kind===r&&(H.stillDrawn=!1,N(H,g?re[r]:H.time||re[r]));M()}}},Z}function nt(a,t,p,l){const n=new Float32Array(4096);let y=!1;if(l&&typeof atob=="function")try{const h=atob(l);if(h.length>=4096*2){for(let i=0;i<4096;i+=1){const m=h.charCodeAt(i*2)&255,d=h.charCodeAt(i*2+1)&255;n[i]=(m|d<<8)/65535}y=!0}}catch{y=!1}if(!y)for(let h=0;h<64;h+=1)for(let i=0;i<64;i+=1)n[h*64+i]=.25;const f=new Float32Array(4096);for(let h=0;h<64;h+=1)for(let i=0;i<64;i+=1){let m=0,d=0;for(let g=-1;g<=1;g+=1){const N=Math.max(0,Math.min(63,h+g));for(let P=-1;P<=1;P+=1){const u=Math.max(0,Math.min(63,i+P)),E=g===0&&P===0?4:1;m+=n[N*64+u]*E,d+=E}}f[h*64+i]=m/d}for(let h=0;h<64;h+=1){const i=Math.max(0,h-1),m=Math.min(63,h+1);for(let d=0;d<64;d+=1){const g=Math.max(0,d-1),N=Math.min(63,d+1),P=f[h*64+d],u=(f[h*64+N]-f[h*64+g])*5.2,E=(f[m*64+d]-f[i*64+d])*5.2,M=-u,T=-E,r=1,w=1/Math.sqrt(M*M+T*T+r*r),x=Math.max(0,(M*-.62+T*-.54+r*.57)*w),b=P-.25*(f[h*64+g]+f[h*64+N]+f[i*64+d]+f[m*64+d]),S=Math.max(0,Math.min(1,b*16)),_=((p+h)*t+d)*4;a[_]=Math.round(Math.max(0,Math.min(1,P))*255),a[_+1]=Math.round(Math.max(0,Math.min(1,x))*255),a[_+2]=Math.round(S*255),a[_+3]=255}}}function be(a){if(a.length===0)return 0;const t=[...a].sort((l,s)=>l-s),p=Math.floor(t.length/2);return t.length%2===1?t[p]:.5*(t[p-1]+t[p])}function Nt(a,t){const s=new Uint8Array(2048),n=Math.max(1e-6,t.max_one_scale),y=Math.log1p(n*16),f=u=>y>0?Math.min(1,Math.log1p(Math.max(0,u)*16)/y):0,h=[];for(let u=0;u<26;u+=1){let E=0,M=0,T=0;for(let r=0;r<12;r+=1){const w=t.cells[u*12+r];if(!w)continue;const[x,b,S]=w,_=(r*32+u)*4;s[_]=Math.round(f(x)*255),s[_+1]=Math.round(f(b)*255),s[_+2]=S===0?0:S===1?128:255,s[_+3]=255,S>0&&(E+=x,M+=b,T+=1)}T>0&&h.push({y:u,raw:E/T,one:M/T})}const i=Math.max(1e-6,...h.map(u=>u.one)),m=Math.log1p(i*36),d=u=>m>0?Math.min(1,Math.log1p(Math.max(0,u)*36)/m):0,g=[],N=[],P=[];for(const u of h){const E=(384+u.y)*4,M=d(u.raw),T=d(u.one);s[E]=Math.round(M*255),s[E+1]=Math.round(T*255),s[E+2]=255,s[E+3]=255,u.y<12?g.push(M):N.push(M),P.push(T)}a.uploadTexture("record",32,16,s,[be(g),be(N),be(P),0])}function wt(a,t){const s=new Uint8Array(32768),n=Math.min(64,t.grid.cols),y=Math.min(64,t.grid.rows);for(const[i,m,d]of t.coarse)i<0||i>=n||m<0||m>=y||(s[(m*64+i)*4]=d);const f=new Uint8Array(n*y);for(const[i,m]of t.estimate)i<0||i>=n||m<0||m>=y||(f[m*n+i]=1,s[(m*64+i)*4+1]=255);const h=new Uint8Array(n*y);for(let i=0;i<y;i+=1)for(let m=0;m<n;m+=1){let d=0;for(let g=-2;g<=2&&!d;g+=1)for(let N=-2;N<=2;N+=1){const P=i+g,u=m+N;if(P>=0&&P<y&&u>=0&&u<n&&f[P*n+u]){d=1;break}}h[i*n+m]=d}for(let i=0;i<y;i+=1)for(let m=0;m<n;m+=1){if(!h[i*n+m])continue;let d=0;(i===0||i===y-1||m===0||m===n-1||!h[(i-1)*n+m]||!h[(i+1)*n+m]||!h[i*n+(m-1)]||!h[i*n+(m+1)])&&(d=255),s[(i*64+m)*4+2]=d}for(const[i,m,d]of t.sharp)i<0||i>=n||m<0||m>=y||(s[(m*64+i)*4+3]=d);nt(s,64,64,t.dem_u16_b64),a.uploadTexture("estimate",64,128,s),a.uploadTexture("test",64,128,s)}function Mt(a,t){var d,g,N,P;const s=new Uint8Array(32768),n=Math.min(64,t.grid.cols),y=Math.min(64,t.grid.rows);for(let u=0;u<y;u+=1){const E=Math.min(3,Math.floor(u/y*4));for(let M=0;M<n;M+=1){const T=Math.min(3,Math.floor(M/n*4)),r=t.tile_unsure[E*4+T]??0;s[(u*64+M)*4+1]=Math.round(Math.max(0,Math.min(1,r))*255)}}for(const[u,E,M]of t.coarse)u<0||u>=n||E<0||E>=y||(s[(E*64+u)*4]=M);for(const u of t.looks){const E=Math.round(Math.min(4,Math.max(1,u.order))/4*255);for(const[M,T,r]of u.cells){if(M<0||M>=n||T<0||T>=y)continue;const w=(T*64+M)*4;s[w+2]===0&&(s[w+2]=E),r>s[w+3]&&(s[w+3]=r)}}nt(s,64,64,t.dem_u16_b64);const f=((d=t.looks[0])==null?void 0:d.tile)??4,h=((g=t.looks[1])==null?void 0:g.tile)??5,i=((N=t.looks[2])==null?void 0:N.tile)??5,m=((P=t.looks[3])==null?void 0:P.tile)??5;a.uploadTexture("play",64,128,s,[f,h,i,m])}let ot=!1,me=null,he=null,fe=null;function rt(){return me||(typeof fetch>"u"?Promise.resolve(null):(me=fetch(ge("generated/landing/record.json")).then(a=>a.ok?a.json():null).catch(()=>(me=null,null)),me))}function ke(){return he||(typeof fetch>"u"?Promise.resolve(null):(he=fetch(ge("generated/landing/estimate-test.json")).then(a=>a.ok?a.json():null).catch(()=>(he=null,null)),he))}function ct(){return fe||(typeof fetch>"u"?Promise.resolve(null):(fe=fetch(ge("generated/landing/play.json")).then(a=>a.ok?a.json():null).catch(()=>(fe=null,null)),fe))}const Te=new Map;function St(a){const t=Te.get(a);if(t)return t;const p=Ee("/api/calendar",{source:"firms",region_id:a}).catch(()=>(Te.delete(a),null));return Te.set(a,p),p}let ue=null;function It(){return ue||(ue=Ee("/api/regions").catch(()=>(ue=null,null)),ue)}let pe=null;function jt(){return pe||(pe=Ee("/api/evidence").catch(()=>(pe=null,null)),pe)}function Tt(a){return a.length>0?a.charAt(0).toUpperCase()+a.slice(1):a}function lt(a,t,p,l,s,n,y,f){a.strokeStyle=f,a.lineWidth=y,a.beginPath(),a.moveTo(t,p+n),a.lineTo(t,p),a.lineTo(t+n,p),a.moveTo(t+l-n,p),a.lineTo(t+l,p),a.lineTo(t+l,p+n),a.moveTo(t,p+s-n),a.lineTo(t,p+s),a.lineTo(t+n,p+s),a.moveTo(t+l-n,p+s),a.lineTo(t+l,p+s),a.lineTo(t+l,p+s-n),a.stroke()}function Et(a,t,p){const l=t.getContext("2d",{alpha:!1});if(!l)return!1;const s=t.getBoundingClientRect(),n=typeof window<"u"?Math.min(window.devicePixelRatio||1,2):1,y=Math.max(320,Math.round((s.width||640)*n)),f=Math.max(200,Math.round((s.height||400)*n));(t.width!==y||t.height!==f)&&(t.width=y,t.height=f),l.fillStyle="#080b11",l.fillRect(0,0,y,f);const h=Math.round(y*.055),i=Math.round(f*.075),m=Math.max(40,y-h*2),d=Math.max(40,f-i*2);if(a==="record"){const v=p.record;if(!v||!Array.isArray(v.cells))return!0;const F=Math.max(1e-6,v.max_one_scale),K=Math.log1p(F*16),I=U=>K>0?Math.min(1,Math.log1p(Math.max(0,U)*16)/K):0,X=new Array(26).fill(0);for(let U=0;U<26;U+=1){let B=0,z=0;for(let $=0;$<12;$+=1){const ae=v.cells[U*12+$];ae&&ae[2]>0&&(B+=ae[1],z+=1)}X[U]=z>0?B/z:0}const G=Math.max(1e-6,...X),q=Math.log1p(G*36),Q=U=>q>0?Math.min(1,Math.log1p(Math.max(0,U)*36)/q):0,te=X.map(Q),W=be(te.filter(U=>U>0)),o=d*.28,c=i+o,R=m/26,A=Math.max(1.5*n,R*.16);if(l.fillStyle="#2b303a",l.fillRect(h,Math.round(c),m,Math.max(1,Math.round(n))),W>.02){const U=Math.round(c-W*o*.92);l.fillStyle="rgba(243, 244, 246, 0.36)",l.fillRect(h,U,m,Math.max(1,Math.round(n)))}for(let U=0;U<26;U+=1){const B=h+U*R+A*.5,z=Math.max(1,R-A),$=te[U]*o*.92;$>1&&(l.fillStyle=U>=12?"rgba(240, 138, 69, 0.72)":"rgba(180, 195, 214, 0.78)",l.fillRect(B,c-$,z,$),l.fillStyle="#f3f4f6",l.fillRect(B,c-$,z,Math.max(1,Math.round(1.2*n))))}const k=i+d*.34,j=d*.61/12,O=Math.max(1.5*n,j*.18);for(let U=0;U<26;U+=1)for(let B=0;B<12;B+=1){const z=v.cells[U*12+B];if(!z||z[2]===0)continue;const $=I(z[1]),ae=h+U*R+A*.5,oe=k+B*j+O*.5,ie=Math.max(1,R-A),ne=Math.max(1,j-O);if($>.035){const V=Math.pow($,.82);l.fillStyle=V>.52?`rgba(240, 138, 69, ${(.36+V*.62).toFixed(3)})`:`rgba(180, 195, 214, ${(.26+V*.66).toFixed(3)})`,l.fillRect(ae,oe,ie,ne)}else{l.fillStyle="#2b303a";const V=Math.max(1.5,Math.round(1.6*n));l.fillRect(ae+(ie-V)*.5,oe+(ne-V)*.5,V,V)}U===12&&B===7&&lt(l,ae-n,oe-n,ie+2*n,ne+2*n,Math.min(4*n,ie*.42),Math.max(1,n),"#f3f4f6")}const D=Math.round(h+12/26*m);return l.fillStyle="rgba(124, 131, 146, 0.65)",l.fillRect(D,i,Math.max(1,Math.round(n)),Math.round(d*.95)),!0}if(a==="estimate"||a==="test"){const v=p.estimateTest;if(!v||!v.grid)return!0;const F=Math.max(1,v.grid.cols),K=Math.max(1,v.grid.rows),I=Math.min(m/F,d/K),X=I*F,G=I*K,q=Math.round((y-X)*.5),Q=Math.round((f-G)*.5);l.strokeStyle="rgba(43, 48, 58, 0.72)",l.lineWidth=Math.max(1,.8*n),l.beginPath();for(let W=0;W<=F;W+=3){const o=q+W*I;l.moveTo(o,Q),l.lineTo(o,Q+G)}for(let W=0;W<=K;W+=3){const o=Q+W*I;l.moveTo(q,o),l.lineTo(q+X,o)}l.stroke();for(const[W,o,c]of v.coarse){if(W<0||W>=F||o<0||o>=K)continue;const R=c/255*(a==="estimate"?.42:.12);R<=.01||(l.fillStyle=`rgba(180, 195, 214, ${R.toFixed(3)})`,l.fillRect(q+W*I,Q+o*I,I,I))}const te=Math.max(.8*n,I*.1);l.strokeStyle="rgba(243, 244, 246, 0.9)",l.lineWidth=Math.max(1,1.05*n);for(const[W,o]of v.estimate)W<0||W>=F||o<0||o>=K||l.strokeRect(q+W*I+te,Q+o*I+te,Math.max(1,I-te*2),Math.max(1,I-te*2));if(a==="test"){const W=Math.max(1.6*n,I*.24);for(const[o,c,R]of v.sharp){if(o<0||o>=F||c<0||c>=K)continue;const A=Math.min(1,.62+R/255*.38);l.fillStyle=`rgba(240, 138, 69, ${A.toFixed(3)})`,l.fillRect(q+o*I+W,Q+c*I+W,Math.max(1.5,I-W*2),Math.max(1.5,I-W*2))}}return!0}const g=p.play;if(!g||!g.grid)return!0;const N=Math.max(1,g.grid.cols),P=Math.max(1,g.grid.rows),u=Math.min(m/N,(d-16*n)/P),E=u*N,M=u*P,T=Math.round((y-E)*.5),r=Math.round((f-12*n-M)*.5);for(const[v,F,K]of g.coarse){if(v<0||v>=N||F<0||F>=P)continue;const I=K/255*.36;I<=.01||(l.fillStyle=`rgba(180, 195, 214, ${I.toFixed(3)})`,l.fillRect(T+v*u+.5,r+F*u+.5,Math.max(1,u-1),Math.max(1,u-1)))}for(const v of g.looks)for(const[F,K,I]of v.cells){if(F<0||F>=N||K<0||K>=P)continue;const X=Math.min(1,.65+I/255*.35);l.fillStyle=`rgba(240, 138, 69, ${X.toFixed(3)})`,l.fillRect(T+F*u+1,r+K*u+1,Math.max(1.5,u-2),Math.max(1.5,u-2))}const w=E/4,x=M/4;l.strokeStyle="rgba(124, 131, 146, 0.58)",l.lineWidth=Math.max(1,n),l.beginPath();for(let v=0;v<=4;v+=1){const F=T+v*w;l.moveTo(F,r),l.lineTo(F,r+M);const K=r+v*x;l.moveTo(T,K),l.lineTo(T+E,K)}l.stroke();const b=Array.from(new Set(g.looks.map(v=>v.tile)));if(g.looks.length>=2&&g.looks[0].tile!==g.looks[1].tile){const v=g.looks[0].tile,F=g.looks[1].tile,K=T+(v%4+.5)*w,I=r+(Math.floor(v/4)+.5)*x,X=T+(F%4+.5)*w,G=r+(Math.floor(F/4)+.5)*x;l.strokeStyle="rgba(243, 244, 246, 0.52)",l.lineWidth=Math.max(1,1.2*n),l.beginPath(),l.moveTo(K,I),l.lineTo(X,G),l.stroke()}for(const v of b){const F=v%4,K=Math.floor(v/4),I=Math.max(2*n,w*.05);lt(l,T+F*w+I,r+K*x+I,w-I*2,x-I*2,Math.min(12*n,w*.2),Math.max(1.2,1.4*n),"#f3f4f6")}const S=Math.round(6*n),_=Math.round(5*n),H=f-Math.round(18*n),ee=Math.round(20*n);for(let v=0;v<4;v+=1)l.fillStyle=v===3?"#f08a45":"#f3f4f6",l.fillRect(ee+v*(S+_),H,S,S);return!0}function Rt(a){ot||!a.supported||typeof fetch>"u"||(ot=!0,rt().then(t=>{t&&Array.isArray(t.cells)&&Nt(a,t)}).catch(()=>{}),ke().then(t=>{t&&t.grid&&wt(a,t)}).catch(()=>{}),ct().then(t=>{t&&Array.isArray(t.looks)&&Mt(a,t)}).catch(()=>{}))}function xe({kind:a,ariaLabel:t}){const p=C.useRef(null),[l,s]=C.useState(!0),[n,y]=C.useState(!0);return C.useEffect(()=>{const f=it(),h=p.current;if(!f.supported){if(s(!1),!h)return;let i=!1;const m={record:null,estimateTest:null,play:null},d=()=>{if(i||!p.current)return;const N=Et(a,p.current,m);y(N)};d(),a==="record"?rt().then(N=>{m.record=N,d()}):a==="estimate"||a==="test"?ke().then(N=>{m.estimateTest=N,d()}):ct().then(N=>{m.play=N,d()});const g=()=>d();return window.addEventListener("resize",g),()=>{i=!0,window.removeEventListener("resize",g)}}if(Rt(f),!!h)return f.register(a,h)},[a]),e.jsxs("div",{className:"iso-lb-visual","data-webgl":l?"on":"off","data-canvas2d":n?"on":"off",role:"img","aria-label":t,children:[e.jsx("div",{className:"iso-lb-visual__fallback","data-kind":a,"aria-hidden":"true"}),e.jsx("canvas",{ref:p,className:"iso-lb-visual__canvas","aria-hidden":"true"})]})}function le(){return e.jsx("svg",{className:"iso-lb-action__arrow",viewBox:"0 0 12 12",fill:"none","aria-hidden":"true",children:e.jsx("path",{d:"M1.5 6h8.5M6.5 2.5L10 6l-3.5 3.5",stroke:"currentColor",strokeWidth:"1.2"})})}function J(a,t){let p=!1;const l=a.startsWith("{"),s=a.replace(/\{([a-z0-9_]+)\}/g,(n,y)=>{const f=t[y];return f==null||f===""?(p=!0,""):f});return p?null:l&&s.length>0?s.charAt(0).toUpperCase()+s.slice(1):s}function Lt({onOpenPart:a,onOpenMethod:t,onOpenSensor:p,onEnter:l}){var W;const s=pt(),n=C.useRef(null),y=((W=s==null?void 0:s.run.active)==null?void 0:W.region.id)||"plumas_ca",[f,h]=C.useState(null),[i,m]=C.useState(null),[d,g]=C.useState(null),[N,P]=C.useState(null),[u,E]=C.useState("loading"),[M,T]=C.useState(!1),[r,w]=C.useState(!0),x=(s==null?void 0:s.model.evidence)??N;C.useEffect(()=>{w(it().supported)},[]),C.useEffect(()=>{const o=n.current;if(!o||typeof window>"u"||typeof IntersectionObserver>"u"||typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const c=Array.from(o.querySelectorAll("[data-reveal-section]"));for(const A of c)A.dataset.reveal="pending";const R=new IntersectionObserver(A=>{for(const k of A)k.isIntersecting&&(k.target.dataset.reveal="shown",R.unobserve(k.target))},{threshold:.08,rootMargin:"0px 0px -32px 0px"});for(const A of c)R.observe(A);return()=>R.disconnect()},[]),C.useEffect(()=>{let o=!1;return ke().then(c=>{!o&&c&&typeof c.modis_time_utc=="string"&&typeof c.viirs_time_utc=="string"&&g({modis:c.modis_time_utc,viirs:c.viirs_time_utc})}),()=>{o=!0}},[]),C.useEffect(()=>{let o=!1;return St(y).then(c=>{!o&&c&&typeof c=="object"&&h(c)}),()=>{o=!0}},[y]),C.useEffect(()=>{let o=!1;return It().then(c=>{!o&&c&&typeof c=="object"&&m(c)}),()=>{o=!0}},[]),C.useEffect(()=>{if(s!=null&&s.model.evidence)return;let o=!1;return E("loading"),jt().then(c=>{o||(c&&typeof c=="object"&&c.test_fires?(P(c),E("ready")):E("failed"))}),()=>{o=!0}},[s==null?void 0:s.model.evidence]);const{fields:b,conditions:S,telemetry:_}=C.useMemo(()=>{var De,Ae,Ue,Pe,Fe,Le,Ce,We,Ke,He,Ge,Oe,ze,Be,Xe,Ye,$e,qe,Je,Qe,Ve,Ze,et;const o=f==null?void 0:f.summary_metrics,c=(De=f==null?void 0:f.regime_markers)==null?void 0:De.find(L=>typeof L.label=="string"&&L.label.startsWith("VIIRS")),R=i!=null&&i.places&&i.places.length>0?i.places:(s==null?void 0:s.places.places)??null,A=(R==null?void 0:R.filter(L=>L.rows==="firms"&&!L.record_only&&typeof L.name=="string"))??null,k=((Ae=x==null?void 0:x.test_fires)==null?void 0:Ae.fires)??null,Y=k&&k[0]?k[0].new.scores_judged:null,j=x==null?void 0:x.validation,O=(Ue=x==null?void 0:x.next_look)==null?void 0:Ue.on_validation,D=((Pe=x==null?void 0:x.fresh_test)==null?void 0:Pe.test_a)??null,U=typeof(o==null?void 0:o.held_out_median_abs_relative_error)=="number"&&Number.isFinite(o.held_out_median_abs_relative_error)?Math.round(o.held_out_median_abs_relative_error*100):null,B=typeof(o==null?void 0:o.held_out_median_abs_relative_error_without_harmonization)=="number"&&Number.isFinite(o.held_out_median_abs_relative_error_without_harmonization)?Math.round(o.held_out_median_abs_relative_error_without_harmonization*100):null,z={place:((Fe=f==null?void 0:f.place)==null?void 0:Fe.name)??(f==null?void 0:f.region_name)??null,record_first_year:o!=null&&o.first_month?o.first_month.slice(0,4):null,sharp_since:c!=null&&c.year_month?c.year_month.slice(0,4):null,sharp_to_coarse:typeof(o==null?void 0:o.viirs_to_modis_overlap_ratio)=="number"&&Number.isFinite(o.viirs_to_modis_overlap_ratio)?o.viirs_to_modis_overlap_ratio.toFixed(1):null,record_error:U!==null?String(U):null,record_error_raw:B!==null?String(B):null,places_n:A&&A.length>0?de(A.length):null,places_with_fires:A&&A.length>0?je(A.map(L=>L.name??"")):null,test_fires_n:k&&k.length>0?de(k.length):null,test_fire_names:k&&k.length>0?je(k.map(L=>Tt(L.name))):null,test_fire_scores:k&&k.length>0?je(k.map(L=>String(L.new.ahead_of_both_on))):null,test_scores_n:se(Y),other_fires_n:de(j==null?void 0:j.episodes),other_ahead:se((Le=j==null?void 0:j.classes)==null?void 0:Le.ahead),other_level:se((Ce=j==null?void 0:j.classes)==null?void 0:Ce.tied),other_behind:at((We=j==null?void 0:j.classes)==null?void 0:We.behind),test_a_fires_n:se(D==null?void 0:D.episodes_scored),test_a_continents_n:D!=null&&D.by_continent?de(Object.values(D.by_continent).filter(L=>((L==null?void 0:L.episodes_scored)??(L==null?void 0:L.episodes)??0)>0).length):null,test_a_ahead:se((Ke=D==null?void 0:D.all)==null?void 0:Ke.ahead),test_a_level:se((He=D==null?void 0:D.all)==null?void 0:He.tied),test_a_behind:at((Ge=D==null?void 0:D.all)==null?void 0:Ge.behind),round_looks:de(O==null?void 0:O.budget),rounds_n:se(O==null?void 0:O.episodes),rule_ahead_rounds:se((ze=(Oe=O==null?void 0:O.differences)==null?void 0:Oe.least_sure_minus_random)==null?void 0:ze.episodes_a_ahead)},$=k&&k.length>0&&typeof Y=="number"?Math.min(...k.map(L=>L.new.ahead_of_both_on))<Y:null,ae=j!=null&&j.parts&&Array.isArray(j.parts)?!j.parts.some(L=>L.status==="on"):null,oe=(Xe=(Be=O==null?void 0:O.differences)==null?void 0:Be.learned_minus_least_sure)==null?void 0:Xe.p05,ie=typeof oe=="number"&&Number.isFinite(oe)?oe>0:!1,ne=(($e=(Ye=O==null?void 0:O.differences)==null?void 0:Ye.least_sure_minus_random)==null?void 0:$e.episodes_a_ahead)??null,V=(O==null?void 0:O.episodes)??null,Ne=typeof((qe=j==null?void 0:j.classes)==null?void 0:qe.ahead)=="number"?j.classes.ahead:null,we=typeof((Je=j==null?void 0:j.classes)==null?void 0:Je.tied)=="number"?j.classes.tied:null,Me=typeof((Qe=j==null?void 0:j.classes)==null?void 0:Qe.behind)=="number"?j.classes.behind:null,dt=Ne!==null&&we!==null&&Me!==null?Ne+we+Me:null,ce=typeof((Ve=D==null?void 0:D.all)==null?void 0:Ve.ahead)=="number"?D.all.ahead:null,Se=typeof((Ze=D==null?void 0:D.all)==null?void 0:Ze.tied)=="number"?D.all.tied:null,Ie=typeof((et=D==null?void 0:D.all)==null?void 0:et.behind)=="number"?D.all.behind:null,mt=ce!==null&&Se!==null&&Ie!==null?ce+Se+Ie:null;return{fields:z,conditions:{not_always_ahead:$,no_part_switched_on:ae,learned_beats_rule:ie},telemetry:{testFires:k&&typeof Y=="number"?k.map(L=>({id:L.region_id,won:L.new.ahead_of_both_on,of:L.new.scores_judged??Y})):null,scoresJudgedNum:Y,valAhead:ce??Ne,valLevel:Se??we,valBehind:Ie??Me,valScoresTotal:mt??dt,valLevelText:ce!==null?z.test_a_level:z.other_level,valBehindText:ce!==null?z.test_a_behind:z.other_behind,ruleAheadNum:typeof ne=="number"?ne:null,roundsTotalNum:typeof V=="number"?V:null,errPctNum:U,errRawPctNum:B}}},[f,i,x]),H=C.useMemo(()=>{var R,A,k;const o=(A=(R=i==null?void 0:i.places)==null?void 0:R.find(Y=>Y.id==="plumas_ca"))==null?void 0:A.box,c=(k=s==null?void 0:s.places.places.find(Y=>Y.id==="plumas_ca"))==null?void 0:k.box;return ft(o??c)??ht.plumas_ca.centerLon},[i,s==null?void 0:s.places.places]),ee=C.useMemo(()=>tt((d==null?void 0:d.modis)??null,H),[d==null?void 0:d.modis,H]),v=C.useMemo(()=>tt((d==null?void 0:d.viirs)??null,H),[d==null?void 0:d.viirs,H]),F=C.useMemo(()=>[J("Every fire NASA's satellites detected around a place since {record_first_year}, month by month.",b),J("The newer satellite sees smaller fires too and makes about {sharp_to_coarse} times as many detections, so the jump of {sharp_since} is taken out and every year is on one scale.",b)].filter(o=>o!==null),[b]),K=["Two kinds of satellite pass over a fire: a coarse one and a sharp one. The sharp one is hidden.","From the coarse passes alone, a model works out where the fire is in squares as small as the sharp satellite's. The model is experimental."],I=C.useMemo(()=>{const o=["Then the sharp satellite is revealed, and the estimate is compared with what it saw, beside simple methods that use the coarse satellite as it is."];if(S.not_always_ahead===!0){const c=J("On the {test_fires_n} fires kept as its test the estimate beat them on {test_fire_scores} of {test_scores_n} scores. It does not always win.",b);c&&o.push(c)}else if(S.not_always_ahead===!1){const c=J("On the {test_fires_n} fires kept as its test the estimate beat them on {test_fire_scores} of {test_scores_n} scores.",b);c&&o.push(c)}return o},[b,S.not_always_ahead]),X=C.useMemo(()=>{if(!x)return[];const o=[],c=J("The hidden satellite also makes a game. You get {round_looks} looks through it, one square of the fire each, and you choose where.",b);return c&&o.push(c),S.learned_beats_rule?o.push("Simple rules and a player that learned from past fires play the same round, and the learned player gains more than the simple rule."):o.push("Simple rules and a player that learned from past fires play the same round. The learned player does not beat the simple rule."),o},[x,b,S.learned_beats_rule]),G=C.useMemo(()=>{const o=J("{test_fires_n} fires were never used to tune the model and are kept as its test: {test_fire_names}. On them the estimate beat the simple methods on {test_fire_scores} of {test_scores_n} scores.",b),c=J("On {test_a_fires_n} fires across {test_a_continents_n} continents, chosen by a rule before any was looked at, the estimate was ahead of the simple methods on {test_a_ahead} scores, level on {test_a_level} and behind on {test_a_behind}.",b),R=J("On {other_fires_n} fires of other years, counting a score only when the gap is too large to be luck, it was ahead on {other_ahead}, level on {other_level} and behind on {other_behind}.",b),A=S.no_part_switched_on===!0?"That is not enough to switch the model on. It is experimental: shown and tested here, and nothing more is claimed for it.":null,k=J("In the game, across {rounds_n} four-day rounds on those fires, a simple rule gained more than random looks on {rule_ahead_rounds} of {rounds_n}.",b),Y=J("For the record itself: hide one year and predict it from the others, and in a typical year the prediction is off by {record_error} percent around {place}. Without the correction it is off by {record_error_raw} percent.",b);return{closedLine:o,testALine:c,valLine:R,honestLine:A,gameLine:k,recordLine:Y}},[b,S.no_part_switched_on]),q=C.useMemo(()=>{const o=[],c=J("Real data only: NASA's public record of fire detections since {record_first_year}, the satellites' real passes, and real ground.",b);c&&o.push(c);const R=J("Fires can be shown pass by pass in {places_n} places: {places_with_fires}. For any other area you can draw a box and read its fire record.",b);return R&&o.push(R),o},[b]),Q=()=>{l(),s==null||s.calendar.closePlaces()},te=()=>{s!=null&&s.model.openEvidence?s.model.openEvidence():T(!0)};return e.jsxs("div",{ref:n,className:"iso-lb","data-landing-ui":"true",children:[e.jsxs("div",{className:"iso-lb__inner",children:[!r&&e.jsx("p",{className:"iso-lb-webgl-note",role:"status",children:"Three-dimensional terrain needs WebGL, which is off in this browser. The flat diagrams, fire record and test documents below still work."}),e.jsxs("section",{className:"iso-lb-intro","data-reveal-section":!0,"aria-label":"What Isogon does",children:[e.jsx("p",{className:"iso-lb-intro__sentence",children:"Isogon puts NASA's two kinds of fire satellite on one record, then tests an estimate of a real fire by hiding the sharper satellite and checking against it."}),e.jsxs("figure",{className:"iso-lb-figure",children:[e.jsx("img",{className:"iso-lb-figure__img",src:ge("generated/landing/three-ways.jpg"),alt:"Feather River fire in August 2012 shown three ways: what the coarse satellite saw at 1 km, the estimate made from coarse passes alone on a 375 m grid, and what the withheld sharp satellite actually saw at 375 m.",loading:"lazy",decoding:"async"}),e.jsxs("figcaption",{className:"iso-lb-figure__cols",children:[e.jsxs("div",{className:"iso-lb-figure__col",children:[e.jsxs("span",{className:"iso-lb-figure__col-title",children:[e.jsx("span",{className:"iso-lb-swatch iso-lb-swatch--modis","aria-hidden":"true"}),"What the coarse satellite saw"]}),e.jsxs("span",{className:"iso-lb-figure__col-meta",children:["The coarse satellite, 1 km squares",ee?`, ${ee}`:""]})]}),e.jsxs("div",{className:"iso-lb-figure__col",children:[e.jsxs("span",{className:"iso-lb-figure__col-title",children:[e.jsx("span",{className:"iso-lb-swatch iso-lb-swatch--estimate","aria-hidden":"true"}),"The estimate from coarse passes alone"]}),e.jsx("span",{className:"iso-lb-figure__col-meta",children:"375 m grid frames declared before the reveal"})]}),e.jsxs("div",{className:"iso-lb-figure__col",children:[e.jsxs("span",{className:"iso-lb-figure__col-title",children:[e.jsx("span",{className:"iso-lb-swatch iso-lb-swatch--detection","aria-hidden":"true"}),"What the sharp satellite saw"]}),e.jsxs("span",{className:"iso-lb-figure__col-meta",children:["The sharp satellite, 375 m squares",v?`, ${v}`:""]})]})]})]})]}),e.jsxs("section",{className:"iso-lb-blocks","aria-label":"The four steps",children:[e.jsxs("article",{className:"iso-lb-block","data-reveal-section":!0,children:[e.jsxs("figure",{className:"iso-lb-block__media",children:[e.jsx(xe,{kind:"record",ariaLabel:"Grid of Feather River monthly fire rates from 2000 to 2025, with the 2012 jump flattening onto one scale."}),e.jsxs("figcaption",{className:"iso-lb-caption",children:[e.jsxs("span",{className:"iso-lb-legend",children:[e.jsxs("span",{className:"iso-lb-legend__item",children:[e.jsx("span",{className:"iso-lb-swatch iso-lb-swatch--modis","aria-hidden":"true"}),"Coarse era"]}),e.jsxs("span",{className:"iso-lb-legend__item",children:[e.jsx("span",{className:"iso-lb-swatch iso-lb-swatch--detection","aria-hidden":"true"}),"Sharp era from 2012"]})]}),e.jsx("span",{children:"Feather River monthly rates, 2000 to 2011 put on one scale with 2012 to 2025"})]})]}),e.jsxs("div",{className:"iso-lb-block__copy",children:[e.jsx("h2",{className:"iso-lb-block__title",children:"Record"}),e.jsx("div",{className:"iso-lb-block__lines",children:F.length>0?F.map((o,c)=>e.jsx("p",{className:"iso-lb-block__line",children:o},c)):e.jsx(_e,{surface:"inline",line:"Loading the fire record"})}),e.jsxs("button",{type:"button",className:"iso-lb-action",onClick:Q,children:[e.jsx("span",{className:"iso-lb-action__label",children:"See the fire record"}),e.jsx(le,{})]})]})]}),e.jsxs("article",{className:"iso-lb-block iso-lb-block--flip","data-reveal-section":!0,children:[e.jsxs("figure",{className:"iso-lb-block__media",children:[e.jsx(xe,{kind:"estimate",ariaLabel:"Oblique canyon relief of Feather River where coarse 1 km satellite squares resolve into white 375 m estimate frames."}),e.jsxs("figcaption",{className:"iso-lb-caption",children:[e.jsxs("span",{className:"iso-lb-legend",children:[e.jsxs("span",{className:"iso-lb-legend__item",children:[e.jsx("span",{className:"iso-lb-swatch iso-lb-swatch--modis","aria-hidden":"true"}),"1 km coarse passes"]}),e.jsxs("span",{className:"iso-lb-legend__item",children:[e.jsx("span",{className:"iso-lb-swatch iso-lb-swatch--estimate","aria-hidden":"true"}),"375 m estimate frames"]})]}),e.jsxs("span",{children:[r?"Simplified canyon relief and pass slice":"Flat pass grid",ee?`, ${ee}`:""]})]})]}),e.jsxs("div",{className:"iso-lb-block__copy",children:[e.jsx("h2",{className:"iso-lb-block__title",children:"Estimate"}),e.jsx("div",{className:"iso-lb-block__lines",children:K.map((o,c)=>e.jsx("p",{className:"iso-lb-block__line",children:o},c))}),e.jsxs("button",{type:"button",className:"iso-lb-action",onClick:()=>a("model"),children:[e.jsx("span",{className:"iso-lb-action__label",children:"See the estimate"}),e.jsx(le,{})]})]})]}),e.jsxs("article",{className:"iso-lb-block","data-reveal-section":!0,children:[e.jsxs("figure",{className:"iso-lb-block__media",children:[e.jsx(xe,{kind:"test",ariaLabel:"Oblique canyon relief of Feather River as withheld 375 m sharp satellite detections sweep in over the white estimate frames."}),e.jsxs("figcaption",{className:"iso-lb-caption",children:[e.jsxs("span",{className:"iso-lb-legend",children:[e.jsxs("span",{className:"iso-lb-legend__item",children:[e.jsx("span",{className:"iso-lb-swatch iso-lb-swatch--estimate","aria-hidden":"true"}),"Estimate frame"]}),e.jsxs("span",{className:"iso-lb-legend__item",children:[e.jsx("span",{className:"iso-lb-swatch iso-lb-swatch--detection","aria-hidden":"true"}),"Revealed sharp detection"]})]}),e.jsxs("span",{children:["Withheld pass",v?`, ${v},`:""," ",r?"on the same canyon slice":"on the same flat grid"]})]})]}),e.jsxs("div",{className:"iso-lb-block__copy",children:[e.jsx("h2",{className:"iso-lb-block__title",children:"Test"}),e.jsx("div",{className:"iso-lb-block__lines",children:I.map((o,c)=>e.jsx("p",{className:"iso-lb-block__line",children:o},c))}),e.jsxs("button",{type:"button",className:"iso-lb-action",onClick:()=>a("model"),children:[e.jsx("span",{className:"iso-lb-action__label",children:"Run the test"}),e.jsx(le,{})]})]})]}),e.jsxs("article",{className:"iso-lb-block iso-lb-block--flip","data-reveal-section":!0,children:[e.jsxs("figure",{className:"iso-lb-block__media",children:[e.jsx(xe,{kind:"play",ariaLabel:"Four-by-four board draped over Feather River canyon relief as four looks uncover hidden fire detections in order."}),e.jsxs("figcaption",{className:"iso-lb-caption",children:[e.jsxs("span",{className:"iso-lb-legend",children:[e.jsxs("span",{className:"iso-lb-legend__item",children:[e.jsx("span",{className:"iso-lb-swatch iso-lb-swatch--estimate","aria-hidden":"true"}),"Chosen square"]}),e.jsxs("span",{className:"iso-lb-legend__item",children:[e.jsx("span",{className:"iso-lb-swatch iso-lb-swatch--detection","aria-hidden":"true"}),"Detections uncovered"]})]}),e.jsx("span",{children:r?"Four looks of the least-sure rule on simplified relief":"Four looks of the least-sure rule on the flat board"})]})]}),e.jsxs("div",{className:"iso-lb-block__copy",children:[e.jsx("h2",{className:"iso-lb-block__title",children:"Play"}),e.jsx("div",{className:"iso-lb-block__lines",children:X.length>0?X.map((o,c)=>e.jsx("p",{className:"iso-lb-block__line",children:o},c)):e.jsx(_e,{surface:"inline",line:"Loading the round record"})}),e.jsxs("button",{type:"button",className:"iso-lb-action",onClick:()=>a("environment"),children:[e.jsx("span",{className:"iso-lb-action__label",children:"Play a round"}),e.jsx(le,{})]})]})]})]}),e.jsxs("section",{className:"iso-lb-proof","data-reveal-section":!0,"aria-labelledby":"iso-lb-proof-title",children:[e.jsxs("div",{className:"iso-lb-proof__head",children:[e.jsx("h2",{id:"iso-lb-proof-title",className:"iso-lb-section__title",children:"What the Tests Say"}),e.jsxs("button",{type:"button",className:"iso-lb-action",onClick:te,children:[e.jsx("span",{className:"iso-lb-action__label",children:"See every test on record"}),e.jsx(le,{})]})]}),!x&&u==="loading"?e.jsx(_e,{surface:"inline",line:"Loading every test on record"}):e.jsxs("div",{className:"iso-lb-proof-grid",children:[G.closedLine&&e.jsxs("div",{className:"iso-lb-stat",children:[_.testFires&&_.scoresJudgedNum!==null&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"iso-lb-stat__hero",children:[e.jsx("span",{className:"iso-lb-stat__figure",children:_.testFires.map(o=>o.won).join(", ")}),e.jsxs("span",{className:"iso-lb-stat__unit",children:["of ",_.scoresJudgedNum," scores won"]})]}),e.jsx("div",{className:"iso-lb-stat__fires","aria-hidden":"true",children:_.testFires.map(o=>{const c=o.won*2<o.of;return e.jsx("div",{className:"iso-lb-stat__fire-segs",children:Array.from({length:o.of}).map((R,A)=>e.jsx("span",{className:"iso-lb-stat__seg","data-lit":A<o.won?"ink":c?"fail":"none"},A))},o.id)})})]}),e.jsx("div",{className:"iso-lb-stat__copy",children:e.jsx("p",{className:"iso-lb-section__line",children:G.closedLine})})]}),(G.testALine||G.valLine||G.honestLine)&&e.jsxs("div",{className:"iso-lb-stat",children:[_.valAhead!==null&&_.valScoresTotal!==null&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"iso-lb-stat__hero",children:[e.jsxs("span",{className:"iso-lb-stat__figure",children:[_.valAhead," of ",_.valScoresTotal]}),e.jsxs("span",{className:"iso-lb-stat__unit",children:["scores ahead (",_.valLevelText," level, ",_.valBehindText," behind)"]})]}),e.jsx("div",{className:"iso-lb-stat__rounds","aria-hidden":"true",children:Array.from({length:_.valScoresTotal}).map((o,c)=>{const R=_.valAhead??0,A=_.valLevel??0,k=c<R?"ink":c<R+A?"muted":"fail";return e.jsx("span",{className:"iso-lb-stat__seg","data-lit":k},c)})})]}),e.jsxs("div",{className:"iso-lb-stat__copy",children:[G.testALine&&e.jsx("p",{className:"iso-lb-section__line",children:G.testALine}),G.valLine&&e.jsx("p",{className:"iso-lb-section__line",children:G.valLine}),G.honestLine&&e.jsx("p",{className:"iso-lb-section__line iso-lb-section__line--honest",children:G.honestLine})]})]}),G.gameLine&&e.jsxs("div",{className:"iso-lb-stat",children:[_.ruleAheadNum!==null&&_.roundsTotalNum!==null&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"iso-lb-stat__hero",children:[e.jsxs("span",{className:"iso-lb-stat__figure",children:[_.ruleAheadNum," of ",_.roundsTotalNum]}),e.jsx("span",{className:"iso-lb-stat__unit",children:"rounds gained over random looks"})]}),e.jsx("div",{className:"iso-lb-stat__rounds","aria-hidden":"true",children:Array.from({length:_.roundsTotalNum}).map((o,c)=>e.jsx("span",{className:"iso-lb-stat__seg","data-lit":c<(_.ruleAheadNum??0)?"ink":"none"},c))})]}),e.jsx("div",{className:"iso-lb-stat__copy",children:e.jsx("p",{className:"iso-lb-section__line",children:G.gameLine})})]}),G.recordLine&&e.jsxs("div",{className:"iso-lb-stat",children:[_.errPctNum!==null&&_.errRawPctNum!==null&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"iso-lb-stat__hero",children:[e.jsxs("span",{className:"iso-lb-stat__figure",children:[_.errPctNum,"%"]}),e.jsxs("span",{className:"iso-lb-stat__unit",children:["typical year miss, down from ",_.errRawPctNum,"%"]})]}),e.jsxs("div",{className:"iso-lb-stat__compare","aria-hidden":"true",children:[e.jsx("div",{className:"iso-lb-stat__track",children:e.jsx("div",{className:"iso-lb-stat__fill",style:{width:`${Math.min(100,Math.max(4,_.errPctNum))}%`}})}),e.jsx("div",{className:"iso-lb-stat__track",children:e.jsx("div",{className:"iso-lb-stat__fill iso-lb-stat__fill--raw",style:{width:`${Math.min(100,Math.max(4,_.errRawPctNum))}%`}})})]})]}),e.jsx("div",{className:"iso-lb-stat__copy",children:e.jsx("p",{className:"iso-lb-section__line",children:G.recordLine})})]})]})]}),e.jsxs("section",{className:"iso-lb-method","data-reveal-section":!0,"aria-labelledby":"iso-lb-method-title",children:[e.jsxs("div",{className:"iso-lb-method__left",children:[e.jsx("h2",{id:"iso-lb-method-title",className:"iso-lb-section__title",children:"Data and Method"}),e.jsxs("div",{className:"iso-lb-method__links",children:[e.jsxs("button",{type:"button",className:"iso-lb-action",onClick:t,children:[e.jsx("span",{className:"iso-lb-action__label",children:"Method and Data"}),e.jsx(le,{})]}),p&&e.jsx("button",{type:"button",className:"iso-lb-action iso-lb-action--quiet",onClick:p,children:e.jsx("span",{className:"iso-lb-action__label",children:"Sensor Geometry"})})]})]}),e.jsx("div",{className:"iso-lb-method__right",children:q.length>0?q.map((o,c)=>e.jsx("p",{className:"iso-lb-section__line",children:o},c)):e.jsx(_e,{surface:"inline",line:"Loading method and data"})})]}),e.jsxs("footer",{className:"iso-lb-start",children:[e.jsxs("button",{type:"button",className:"iso-lb-start__cta",onClick:Q,children:[e.jsx("span",{className:"iso-lb-start__cta-label",children:"Start with a real fire"}),e.jsx("kbd",{className:"iso-lb-start__key",children:"Enter"}),e.jsx(le,{})]}),e.jsx(ut,{})]})]}),!s&&M&&e.jsx(_t,{open:M,doc:x,state:x?"ready":u,onClose:()=>T(!1)})]})}export{Lt as LandingBelow};
