import * as THREE from 'three';
import type { NormalizedFootprint } from '../types';

/**
 * Real detection footprints of one overpass, as textures the terrain shader can draw on the ground.
 *
 * A real run (FIRMS rows) lists one row per detection with its own pixel size: `scan` km across the
 * track and `track` km along it. Each is drawn in that rectangle, turned to the scan direction, at
 * the row's longitude and latitude. Nothing else is drawn: FIRMS does not say where a sensor looked
 * and saw nothing, so there is no lattice of empty cells on a real run.
 *
 * `texture` covers the region (uv 0..1, v north) and holds, per sensor family:
 *   r, b   inside a footprint: minus its depth, 0 on the edge and 1 on its centre line; outside:
 *          the distance to the nearest footprint in km (MODIS in r, VIIRS in b)
 *   g, a   fire radiative power density (MW per km2 of the footprint) of that footprint
 * It gives the outline of a pixel, for the views where the pixel is the subject (the raw side of
 * the sensor split, Satellite passes) and for detections revealed after scoring.
 *
 * `lightTexture` holds the light the detections give off, which is how a detection is drawn on the
 * terrain. One light per detection, inside the detection's own footprint: a small hot core with a
 * faint halo. FIRMS says a fire is somewhere in the footprint, not that it fills it, so a footprint
 * is never filled. Colour and brightness come from the detection's radiative power per km2 of its
 * footprint. rgb is the emitted light, a its strength without the colour. It has a mip chain:
 * lights that are small on screen average into one glow. It is finer than `texture`, so a core
 * stays small when its footprint is large on screen.
 *
 * Their cost does not grow much with the number of detections (one overpass of these fires has up to 1,554).
 */
export const FOOTPRINT_TEX_SIZE = 1024;
export const LIGHT_TEX_SIZE = 1536;

/** Brightness of the hot core of the dimmest and of the brightest detection (scene-linear). */
const CORE_GAIN_MIN = 1.1;
const CORE_GAIN_MAX = 5.0;
/** Radius of the hot core: this share of the footprint's smaller half side, and never more, km. */
const CORE_RADIUS_SHARE = 0.2;
const CORE_RADIUS_MAX_KM = 0.09;
/**
 * The halo: its strength against the core's peak, its width as a share of the footprint's half
 * sides, and the most that width may be, km (a 1 km MODIS pixel does not get a 1 km blob).
 */
const HALO_STRENGTH = 0.07;
const HALO_WIDTH = 0.36;
const HALO_MAX_KM = 0.16;
/**
 * How far from the footprint's centre the core may sit, as a share of the half sides. FIRMS gives
 * the centre of the pixel and says nothing about where in the pixel the fire is. With every core
 * on its centre an overpass draws as a ruled lattice of dots, which is the sensor's sampling and
 * not the fire. The place is fixed by the detection's own coordinates, so it never moves.
 * Illustrative: 0 puts every core on its centre.
 */
const CORE_WANDER = 0.34;

const LIGHT_RED = [1.0, 0.09, 0.015] as const;
const LIGHT_ORANGE = [1.0, 0.36, 0.05] as const;
const LIGHT_WHITE = [1.0, 0.66, 0.32] as const;

/**
 * Colour and brightness of a detection's light at its core, from how hot it is drawn (0 for the
 * dimmest detection, 1 for the brightest): deep red, through orange, to a hot amber (never white:
 * the tone curve would turn the strongest into white discs). Writes r, g, b
 * and the brightness without the colour.
 */
export function detectionLightOf(heat: number, out: Float32Array): void {
  const h = Math.min(1, Math.max(0, heat));
  const gain = CORE_GAIN_MIN + (CORE_GAIN_MAX - CORE_GAIN_MIN) * h * h * h;
  const from = h < 0.5 ? LIGHT_RED : LIGHT_ORANGE;
  const to = h < 0.5 ? LIGHT_ORANGE : LIGHT_WHITE;
  const t = h < 0.5 ? h * 2 : h * 2 - 1;
  for (let k = 0; k < 3; k++) out[k] = (from[k] + (to[k] - from[k]) * t) * gain;
  out[3] = gain;
}

/** A number in 0..1 that depends only on the two given values. */
function hash01(a: number, b: number): number {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Distance written where no footprint is near, km. */
const FAR_KM = 4.0;
/** How far outside a footprint its distance is written, in texels. */
const MARGIN_TEXELS = 3;

const texels = FOOTPRINT_TEX_SIZE * FOOTPRINT_TEX_SIZE;
const lightTexels = LIGHT_TEX_SIZE * LIGHT_TEX_SIZE;

export class FootprintField {
  public readonly texture: THREE.DataTexture;
  /** The detections' emitted light (see the note at the top of this file). */
  public readonly lightTexture: THREE.DataTexture;
  /** Detections drawn in the current textures, per family. */
  public modisCount = 0;
  public viirsCount = 0;

  private readonly data = new Uint16Array(texels * 4);
  private readonly blank = new Uint16Array(texels * 4);
  /** Per family: distance outside the nearest footprint (km), depth inside one (0..1), its FRP density. */
  private readonly outside = [new Float32Array(texels), new Float32Array(texels)];
  private readonly depth = [new Float32Array(texels), new Float32Array(texels)];
  private readonly frp = [new Float32Array(texels), new Float32Array(texels)];
  /** Texels written since the last build, so only those are reset and encoded. */
  private touched: Int32Array = new Int32Array(1 << 16);
  private touchedCount = 0;
  private readonly mark = new Uint8Array(texels);

  private readonly light = new Float32Array(lightTexels * 4);
  private readonly lightData = new Uint16Array(lightTexels * 4);
  private lightTouched: Int32Array = new Int32Array(1 << 16);
  private lightTouchedCount = 0;
  private readonly lightMark = new Uint8Array(lightTexels);
  private readonly lightOfOne = new Float32Array(4);

  constructor() {
    const far = THREE.DataUtils.toHalfFloat(FAR_KM);
    for (let i = 0; i < texels; i++) {
      this.blank[i * 4] = far;
      this.blank[i * 4 + 2] = far;
    }
    this.data.set(this.blank);
    for (let f = 0; f < 2; f++) this.outside[f].fill(FAR_KM);
    const tex = new THREE.DataTexture(
      this.data,
      FOOTPRINT_TEX_SIZE,
      FOOTPRINT_TEX_SIZE,
      THREE.RGBAFormat,
      THREE.HalfFloatType,
    );
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = false;
    tex.needsUpdate = true;
    this.texture = tex;

    const lit = new THREE.DataTexture(
      this.lightData,
      LIGHT_TEX_SIZE,
      LIGHT_TEX_SIZE,
      THREE.RGBAFormat,
      THREE.HalfFloatType,
    );
    lit.colorSpace = THREE.NoColorSpace;
    lit.minFilter = THREE.LinearMipmapLinearFilter;
    lit.magFilter = THREE.LinearFilter;
    lit.generateMipmaps = true;
    lit.wrapS = THREE.ClampToEdgeWrapping;
    lit.wrapT = THREE.ClampToEdgeWrapping;
    lit.flipY = false;
    lit.needsUpdate = true;
    this.lightTexture = lit;
  }

  /**
   * Draws the given detections. `bbox` is (lonMin, latMin, lonMax, latMax) of the region and
   * `extentKm` its size on the ground (east-west, north-south). `heatOf` says how hot a detection
   * is drawn (0..1) from its fire radiative power per km2 of footprint, on the run's own scale.
   * `revealed` are detections shown only after scoring (a blind run's hidden instrument, or what
   * a look uncovered): they get their footprint in `texture`, for an outline, and no light.
   * `lightOnly` are detections that get a light and no footprint (the afterglow of an earlier pass).
   */
  public build(
    footprints: readonly NormalizedFootprint[],
    bbox: readonly [number, number, number, number],
    extentKm: readonly [number, number],
    heatOf: (mwPerKm2: number) => number,
    revealed: readonly NormalizedFootprint[] = [],
    lightOnly: readonly NormalizedFootprint[] = [],
  ): void {
    // Back to empty: only what the last build wrote
    for (let k = 0; k < this.touchedCount; k++) {
      const i = this.touched[k];
      this.mark[i] = 0;
      for (let f = 0; f < 2; f++) {
        this.outside[f][i] = FAR_KM;
        this.depth[f][i] = 0;
        this.frp[f][i] = 0;
      }
      this.data[i * 4] = this.blank[i * 4];
      this.data[i * 4 + 1] = 0;
      this.data[i * 4 + 2] = this.blank[i * 4 + 2];
      this.data[i * 4 + 3] = 0;
    }
    this.touchedCount = 0;
    for (let k = 0; k < this.lightTouchedCount; k++) {
      const i = this.lightTouched[k];
      this.lightMark[i] = 0;
      for (let c = 0; c < 4; c++) {
        this.light[i * 4 + c] = 0;
        this.lightData[i * 4 + c] = 0;
      }
    }
    this.lightTouchedCount = 0;
    this.modisCount = 0;
    this.viirsCount = 0;

    for (const fp of footprints) this.drawFootprint(fp, bbox, extentKm);
    for (const fp of revealed) this.drawFootprint(fp, bbox, extentKm);
    for (const fp of footprints) this.drawLight(fp, bbox, extentKm, heatOf);
    for (const fp of lightOnly) this.drawLight(fp, bbox, extentKm, heatOf);

    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let k = 0; k < this.touchedCount; k++) {
      const i = this.touched[k];
      for (let f = 0; f < 2; f++) {
        const d = this.depth[f][i];
        if (d > 0) {
          this.data[i * 4 + f * 2] = toHalf(-d);
          this.data[i * 4 + f * 2 + 1] = toHalf(Math.min(this.frp[f][i], 60000));
        } else if (this.outside[f][i] < FAR_KM) {
          this.data[i * 4 + f * 2] = toHalf(this.outside[f][i]);
        }
      }
    }
    for (let k = 0; k < this.lightTouchedCount; k++) {
      const i = this.lightTouched[k];
      for (let c = 0; c < 4; c++) this.lightData[i * 4 + c] = toHalf(Math.min(this.light[i * 4 + c], 60000));
    }
    this.texture.needsUpdate = true;
    this.lightTexture.needsUpdate = true;
  }

  /** One footprint into the outline texture. */
  private drawFootprint(
    fp: NormalizedFootprint,
    bbox: readonly [number, number, number, number],
    extentKm: readonly [number, number],
  ): void {
    const n = FOOTPRINT_TEX_SIZE;
    const [lonMin, latMin, lonMax, latMax] = bbox;
    const kmX = extentKm[0] / n;
    const kmY = extentKm[1] / n;
    const margin = MARGIN_TEXELS * Math.max(kmX, kmY);
    const f = fp.family === 'viirs' ? 1 : 0;
    // Centre in km east and north of the region's south-west corner
    const cx = ((fp.lon - lonMin) / Math.max(1e-9, lonMax - lonMin)) * extentKm[0];
    const cy = ((fp.lat - latMin) / Math.max(1e-9, latMax - latMin)) * extentKm[1];
    const hx = fp.acrossTrackKm * 0.5;
    const hy = fp.alongTrackKm * 0.5;
    const half = Math.max(1e-4, Math.min(hx, hy));
    // Scan axis on the ground (bearing clockwise from north), and the track axis square to it
    const az = (fp.azimuthDeg * Math.PI) / 180;
    const ax = Math.sin(az);
    const ay = Math.cos(az);
    const reach = Math.hypot(hx, hy) + margin;
    const x0 = Math.max(0, Math.floor((cx - reach) / kmX));
    const x1 = Math.min(n - 1, Math.ceil((cx + reach) / kmX));
    const y0 = Math.max(0, Math.floor((cy - reach) / kmY));
    const y1 = Math.min(n - 1, Math.ceil((cy + reach) / kmY));
    if (x1 < x0 || y1 < y0) return;
    if (f === 1) this.viirsCount++;
    else this.modisCount++;
    const density = fp.frpMw / Math.max(1e-4, fp.acrossTrackKm * fp.alongTrackKm);
    const outside = this.outside[f];
    const depth = this.depth[f];
    const frp = this.frp[f];
    for (let y = y0; y <= y1; y++) {
      const py = (y + 0.5) * kmY - cy;
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) * kmX - cx;
        // Signed distance to the rectangle, in its own axes
        const qx = Math.abs(px * ax + py * ay) - hx;
        const qy = Math.abs(px * ay - py * ax) - hy;
        const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
        if (sd > margin) continue;
        const i = y * n + x;
        if (!this.mark[i]) {
          this.mark[i] = 1;
          if (this.touchedCount === this.touched.length) {
            const grown = new Int32Array(this.touched.length * 2);
            grown.set(this.touched);
            this.touched = grown;
          }
          this.touched[this.touchedCount++] = i;
        }
        if (sd >= 0) {
          if (sd < outside[i]) outside[i] = sd;
          continue;
        }
        // Where footprints overlap, the one this point lies deepest in is shown
        const d = Math.min(1, -sd / half);
        if (d >= depth[i]) {
          depth[i] = Math.max(d, 1e-3);
          frp[i] = density;
        }
      }
    }
  }

  /** One detection's light into the light texture: a round hot core and a faint halo round it. */
  private drawLight(
    fp: NormalizedFootprint,
    bbox: readonly [number, number, number, number],
    extentKm: readonly [number, number],
    heatOf: (mwPerKm2: number) => number,
  ): void {
    const n = LIGHT_TEX_SIZE;
    const [lonMin, latMin, lonMax, latMax] = bbox;
    const kmX = extentKm[0] / n;
    const kmY = extentKm[1] / n;
    const cx = ((fp.lon - lonMin) / Math.max(1e-9, lonMax - lonMin)) * extentKm[0];
    const cy = ((fp.lat - latMin) / Math.max(1e-9, latMax - latMin)) * extentKm[1];
    const hx = fp.acrossTrackKm * 0.5;
    const hy = fp.alongTrackKm * 0.5;
    const az = (fp.azimuthDeg * Math.PI) / 180;
    const ax = Math.sin(az);
    const ay = Math.cos(az);
    const lightOfOne = this.lightOfOne;
    detectionLightOf(heatOf(fp.frpMw / Math.max(1e-4, fp.acrossTrackKm * fp.alongTrackKm)), lightOfOne);
    // The core is small against the footprint. One the texture cannot hold is widened and dimmed
    // by the same amount of light.
    const coreWant = Math.min(CORE_RADIUS_MAX_KM, CORE_RADIUS_SHARE * Math.min(hx, hy));
    const coreR = Math.max(coreWant, 0.8 * Math.max(kmX, kmY));
    const coreGain = (coreWant * coreWant) / (coreR * coreR);
    const coreReach2 = 9 * coreR * coreR;
    // Where in the footprint the core sits (in the footprint's own axes, then east and north, km)
    const wanderX = (hash01(fp.lon, fp.lat) * 2 - 1) * CORE_WANDER * hx;
    const wanderY = (hash01(fp.lat * 1.7, fp.lon * 0.9) * 2 - 1) * CORE_WANDER * hy;
    const coreX = wanderX * ax + wanderY * ay;
    const coreY = wanderX * ay - wanderY * ax;
    const haloX = Math.min(HALO_WIDTH * hx, HALO_MAX_KM);
    const haloY = Math.min(HALO_WIDTH * hy, HALO_MAX_KM);
    const reach = Math.hypot(hx, hy);
    const x0 = Math.max(0, Math.floor((cx - reach) / kmX));
    const x1 = Math.min(n - 1, Math.ceil((cx + reach) / kmX));
    const y0 = Math.max(0, Math.floor((cy - reach) / kmY));
    const y1 = Math.min(n - 1, Math.ceil((cy + reach) / kmY));
    const light = this.light;
    for (let y = y0; y <= y1; y++) {
      const py = (y + 0.5) * kmY - cy;
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) * kmX - cx;
        // In the footprint's own axes, as a share of its half sides
        const lx = px * ax + py * ay;
        const ly = px * ay - py * ax;
        const rho = Math.hypot(lx / hx, ly / hy);
        // The core at four points of the texel, the halo at its centre
        let lit = 0;
        const cpx = px - coreX;
        const cpy = py - coreY;
        if (cpx * cpx + cpy * cpy < coreReach2) {
          for (let s = 0; s < 4; s++) {
            const sx = cpx + (s & 1 ? 0.25 : -0.25) * kmX;
            const sy = cpy + (s & 2 ? 0.25 : -0.25) * kmY;
            lit += Math.exp(-(sx * sx + sy * sy) / (coreR * coreR));
          }
          lit *= 0.25 * coreGain;
        }
        if (rho < 1) {
          // The halo lies round the core and fades out at the footprint's edge
          const t = rho <= 0.72 ? 0 : (rho - 0.72) / 0.28;
          const hlx = (lx - wanderX) / haloX;
          const hly = (ly - wanderY) / haloY;
          lit += HALO_STRENGTH * Math.exp(-(hlx * hlx + hly * hly)) * (1 - t * t * (3 - 2 * t));
        }
        if (lit <= 1e-4) continue;
        const i = y * n + x;
        if (!this.lightMark[i]) {
          this.lightMark[i] = 1;
          if (this.lightTouchedCount === this.lightTouched.length) {
            const grown = new Int32Array(this.lightTouched.length * 2);
            grown.set(this.lightTouched);
            this.lightTouched = grown;
          }
          this.lightTouched[this.lightTouchedCount++] = i;
        }
        light[i * 4] += lightOfOne[0] * lit;
        light[i * 4 + 1] += lightOfOne[1] * lit;
        light[i * 4 + 2] += lightOfOne[2] * lit;
        light[i * 4 + 3] += lightOfOne[3] * lit;
      }
    }
  }

  public dispose(): void {
    this.texture.dispose();
    this.lightTexture.dispose();
  }
}

/** FRP density (MW per km2 of a footprint) at which the smoke source is at full strength. */
const SMOKE_FULL_MW_KM2 = 1500;
/** Scale of the logarithmic rise of smoke strength with FRP density, MW per km2. */
const SMOKE_KNEE_MW_KM2 = 30;

/** Smoke source strength (0..1) of a detection from its fire radiative power per km2 of footprint. */
export function smokeStrengthFromFrp(mwPerKm2: number): number {
  const s = Math.log1p(Math.max(0, mwPerKm2) / SMOKE_KNEE_MW_KM2) / Math.log1p(SMOKE_FULL_MW_KM2 / SMOKE_KNEE_MW_KM2);
  return Math.min(1, s);
}

/**
 * Smoke source for a real run: where the satellites detected fire, never the model's estimate, and
 * as strong as the detections' fire radiative power.
 *
 * Per frame and field cell: the strongest detection of that overpass whose footprint covers the
 * cell (strength from its FRP per km2, logarithmic: about 0.07 at 10, 0.33 at 80, 0.73 at 500 and
 * full at 1,500 MW/km2; the field's own bytes stop at 80), and what earlier overpasses saw there,
 * fading by `keep` per overpass (a fire seen by the last pass still smokes through a pass that
 * did not see it). A detection under about 12 MW/km2 stays below the smoke threshold and makes
 * none. Row 0 is south, like the field the stage holds.
 */
export function buildDetectionSource(
  frames: ReadonlyArray<
    ReadonlyArray<{ hidden?: boolean; revealedByLook?: boolean; footprints: readonly NormalizedFootprint[] }>
  >,
  frameCount: number,
  bbox: readonly [number, number, number, number],
  extentKm: readonly [number, number],
  gridSize: number,
  keep = 0.6,
): Uint8Array {
  const cells = gridSize * gridSize;
  const out = new Uint8Array(frameCount * cells);
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const kmX = extentKm[0] / gridSize;
  const kmY = extentKm[1] / gridSize;
  for (let f = 0; f < frameCount; f++) {
    const dst = f * cells;
    if (f > 0) {
      const prev = (f - 1) * cells;
      for (let i = 0; i < cells; i++) out[dst + i] = Math.floor(out[prev + i] * keep);
    }
    for (const pass of frames[f] ?? []) {
      // A pass held out of the estimate makes no smoke either, and neither does one a look
      // uncovered: until the reveal a blind run's smoke comes from its visible instrument only
      if (pass.hidden || pass.revealedByLook) continue;
      for (const fp of pass.footprints) {
        const cx = ((fp.lon - lonMin) / Math.max(1e-9, lonMax - lonMin)) * extentKm[0];
        const cy = ((fp.lat - latMin) / Math.max(1e-9, latMax - latMin)) * extentKm[1];
        const hx = fp.acrossTrackKm * 0.5;
        const hy = fp.alongTrackKm * 0.5;
        const az = (fp.azimuthDeg * Math.PI) / 180;
        const ax = Math.sin(az);
        const ay = Math.cos(az);
        const value = Math.round(
          255 * smokeStrengthFromFrp(fp.frpMw / Math.max(1e-4, fp.acrossTrackKm * fp.alongTrackKm)),
        );
        const reach = Math.hypot(hx, hy);
        const x0 = Math.max(0, Math.floor((cx - reach) / kmX));
        const x1 = Math.min(gridSize - 1, Math.ceil((cx + reach) / kmX));
        const y0 = Math.max(0, Math.floor((cy - reach) / kmY));
        const y1 = Math.min(gridSize - 1, Math.ceil((cy + reach) / kmY));
        for (let y = y0; y <= y1; y++) {
          const py = (y + 0.5) * kmY - cy;
          for (let x = x0; x <= x1; x++) {
            const px = (x + 0.5) * kmX - cx;
            // Half a cell of slack, so a footprint smaller than a cell still marks the cell it is in
            if (Math.abs(px * ax + py * ay) > hx + 0.5 * kmX || Math.abs(px * ay - py * ax) > hy + 0.5 * kmY) continue;
            const i = dst + y * gridSize + x;
            if (value > out[i]) out[i] = value;
          }
        }
      }
    }
  }
  return out;
}
