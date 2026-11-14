import * as THREE from 'three';
import type { NormalizedFootprint } from '../types';

/**
 * Real detection footprints of one overpass, as a texture the terrain shader can draw on the ground.
 *
 * A real run (FIRMS rows) lists one row per detection with its own pixel size: `scan` km across the
 * track and `track` km along it. Each is drawn as that rectangle, turned to the scan direction, at
 * the row's longitude and latitude. Nothing else is drawn: FIRMS does not say where a sensor looked
 * and saw nothing, so there is no lattice of empty cells on a real run.
 *
 * The texture covers the region (uv 0..1, v north) and holds, per sensor family, a distance field:
 *   r, b   distance to the nearest footprint edge in km, negative inside a footprint (MODIS, VIIRS)
 *   g, a   fire radiative power density (MW per km2 of the footprint) of the nearest footprint
 * A distance field keeps outlines one hairline wide at any zoom, and its cost does not grow with
 * the number of detections (a Dixie Fire overpass has up to 1,307).
 */
export const FOOTPRINT_TEX_SIZE = 1024;

/** Distance written where no footprint is near, km. */
const FAR_KM = 4.0;
/** How far outside a footprint its distance is written, in texels (hairline plus filtering). */
const MARGIN_TEXELS = 3;

const texels = FOOTPRINT_TEX_SIZE * FOOTPRINT_TEX_SIZE;

export class FootprintField {
  public readonly texture: THREE.DataTexture;
  /** Detections drawn in the current texture, per family. */
  public modisCount = 0;
  public viirsCount = 0;

  private readonly data = new Uint16Array(texels * 4);
  private readonly blank = new Uint16Array(texels * 4);
  private readonly edge = [new Float32Array(texels), new Float32Array(texels)];
  private readonly near = [new Float32Array(texels), new Float32Array(texels)];
  private readonly frp = [new Float32Array(texels), new Float32Array(texels)];
  private readonly inside = [new Uint8Array(texels), new Uint8Array(texels)];
  /** Texels written since the last build, so only those are reset and encoded. */
  private touched: Int32Array = new Int32Array(1 << 16);
  private touchedCount = 0;
  private readonly mark = new Uint8Array(texels);

  constructor() {
    const far = THREE.DataUtils.toHalfFloat(FAR_KM);
    for (let i = 0; i < texels; i++) {
      this.blank[i * 4] = far;
      this.blank[i * 4 + 2] = far;
    }
    this.data.set(this.blank);
    for (let f = 0; f < 2; f++) {
      this.edge[f].fill(FAR_KM);
      this.near[f].fill(FAR_KM);
    }
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
  }

  /**
   * Draws the given detections. `bbox` is (lonMin, latMin, lonMax, latMax) of the region and
   * `extentKm` its size on the ground (east-west, north-south).
   */
  public build(
    footprints: readonly NormalizedFootprint[],
    bbox: readonly [number, number, number, number],
    extentKm: readonly [number, number],
  ): void {
    // Back to empty: only what the last build wrote
    for (let k = 0; k < this.touchedCount; k++) {
      const i = this.touched[k];
      this.mark[i] = 0;
      for (let f = 0; f < 2; f++) {
        this.edge[f][i] = FAR_KM;
        this.near[f][i] = FAR_KM;
        this.frp[f][i] = 0;
        this.inside[f][i] = 0;
      }
      this.data[i * 4] = this.blank[i * 4];
      this.data[i * 4 + 1] = 0;
      this.data[i * 4 + 2] = this.blank[i * 4 + 2];
      this.data[i * 4 + 3] = 0;
    }
    this.touchedCount = 0;
    this.modisCount = 0;
    this.viirsCount = 0;

    const n = FOOTPRINT_TEX_SIZE;
    const [lonMin, latMin, lonMax, latMax] = bbox;
    const kmX = extentKm[0] / n;
    const kmY = extentKm[1] / n;
    const margin = MARGIN_TEXELS * Math.max(kmX, kmY);

    for (const fp of footprints) {
      const f = fp.family === 'viirs' ? 1 : 0;
      const u = (fp.lon - lonMin) / Math.max(1e-9, lonMax - lonMin);
      const v = (fp.lat - latMin) / Math.max(1e-9, latMax - latMin);
      // Centre in km east and north of the region's south-west corner
      const cx = u * extentKm[0];
      const cy = v * extentKm[1];
      const hx = fp.acrossTrackKm * 0.5;
      const hy = fp.alongTrackKm * 0.5;
      // Scan axis on the ground (bearing clockwise from north), and the track axis square to it
      const az = (fp.azimuthDeg * Math.PI) / 180;
      const ax = Math.sin(az);
      const ay = Math.cos(az);
      const reach = Math.hypot(hx, hy) + margin;
      const x0 = Math.max(0, Math.floor((cx - reach) / kmX));
      const x1 = Math.min(n - 1, Math.ceil((cx + reach) / kmX));
      const y0 = Math.max(0, Math.floor((cy - reach) / kmY));
      const y1 = Math.min(n - 1, Math.ceil((cy + reach) / kmY));
      if (x1 < x0 || y1 < y0) continue;
      if (f === 1) this.viirsCount++;
      else this.modisCount++;
      const density = fp.frpMw / Math.max(1e-4, fp.acrossTrackKm * fp.alongTrackKm);
      const edge = this.edge[f];
      const near = this.near[f];
      const frp = this.frp[f];
      const inside = this.inside[f];
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
          const a = Math.abs(sd);
          if (a < edge[i]) edge[i] = a;
          if (sd < 0) inside[i] = 1;
          if (sd < near[i]) {
            near[i] = sd;
            frp[i] = density;
          }
        }
      }
    }

    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let k = 0; k < this.touchedCount; k++) {
      const i = this.touched[k];
      for (let f = 0; f < 2; f++) {
        const e = this.edge[f][i];
        if (e >= FAR_KM) continue;
        this.data[i * 4 + f * 2] = toHalf(this.inside[f][i] ? -e : e);
        this.data[i * 4 + f * 2 + 1] = toHalf(Math.min(this.frp[f][i], 60000));
      }
    }
    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
  }
}

/** How far outside the detected area its distance is kept, km. */
const SEEN_REACH_KM = 0.5;
/**
 * The outline of the detected area is drawn this far outside it, km. Gaps narrower than twice this
 * (between neighbouring pixels of one overpass, or between overpasses) close, so the line is the
 * outer edge of the fire as detected and not the edge of every footprint.
 */
export const SEEN_OUTLINE_KM = 0.25;

/**
 * Everything detected so far in a real run: the union of the footprints of all overpasses up to
 * the one on show, as the distance outside that union (km, 0 inside, kept out to SEEN_REACH_KM).
 * The terrain shader draws its one outline from it. Footprints are added as the run plays
 * forward; going back resets it.
 */
export class SeenField {
  public readonly texture: THREE.DataTexture;
  private readonly dist = new Float32Array(texels);
  private readonly data = new Uint16Array(texels);
  private readonly far = THREE.DataUtils.toHalfFloat(FAR_KM);

  constructor() {
    this.dist.fill(FAR_KM);
    this.data.fill(this.far);
    const tex = new THREE.DataTexture(
      this.data,
      FOOTPRINT_TEX_SIZE,
      FOOTPRINT_TEX_SIZE,
      THREE.RedFormat,
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
  }

  public reset(): void {
    this.dist.fill(FAR_KM);
    this.data.fill(this.far);
    this.texture.needsUpdate = true;
  }

  public add(
    footprints: readonly NormalizedFootprint[],
    bbox: readonly [number, number, number, number],
    extentKm: readonly [number, number],
  ): void {
    if (footprints.length === 0) return;
    const n = FOOTPRINT_TEX_SIZE;
    const [lonMin, latMin, lonMax, latMax] = bbox;
    const kmX = extentKm[0] / n;
    const kmY = extentKm[1] / n;
    const margin = SEEN_REACH_KM + Math.max(kmX, kmY);
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (const fp of footprints) {
      const cx = ((fp.lon - lonMin) / Math.max(1e-9, lonMax - lonMin)) * extentKm[0];
      const cy = ((fp.lat - latMin) / Math.max(1e-9, latMax - latMin)) * extentKm[1];
      const hx = fp.acrossTrackKm * 0.5;
      const hy = fp.alongTrackKm * 0.5;
      const az = (fp.azimuthDeg * Math.PI) / 180;
      const ax = Math.sin(az);
      const ay = Math.cos(az);
      const reach = Math.hypot(hx, hy) + margin;
      const x0 = Math.max(0, Math.floor((cx - reach) / kmX));
      const x1 = Math.min(n - 1, Math.ceil((cx + reach) / kmX));
      const y0 = Math.max(0, Math.floor((cy - reach) / kmY));
      const y1 = Math.min(n - 1, Math.ceil((cy + reach) / kmY));
      for (let y = y0; y <= y1; y++) {
        const py = (y + 0.5) * kmY - cy;
        for (let x = x0; x <= x1; x++) {
          const px = (x + 0.5) * kmX - cx;
          const qx = Math.abs(px * ax + py * ay) - hx;
          const qy = Math.abs(px * ay - py * ax) - hy;
          const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
          if (outside > margin) continue;
          const i = y * n + x;
          if (outside < this.dist[i]) {
            this.dist[i] = outside;
            this.data[i] = toHalf(outside);
          }
        }
      }
    }
    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
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
  frames: ReadonlyArray<ReadonlyArray<{ hidden?: boolean; footprints: readonly NormalizedFootprint[] }>>,
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
      // A pass held out of the estimate makes no smoke either
      if (pass.hidden) continue;
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
