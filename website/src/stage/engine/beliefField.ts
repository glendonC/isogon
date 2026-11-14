import * as THREE from 'three';
import type { BeliefFramesInfo } from '../types';

/**
 * What the model believes between the passes of a real run, as a texture the terrain shader reads.
 *
 * The payload's belief frames hold, at fixed time steps on the model's own grid, the probability
 * that each cell burns and its expected fire radiative power density. The texture has one texel
 * per cell and holds the two steps around the time on show, so the shader can move between them:
 *   r, g   probability (byte / 255) and expected intensity (the run's intensity byte / 255) at one step
 *   b, a   the same at the next step
 * Row 0 of the texture is the south edge (v runs north), column 0 the west edge.
 *
 * A run with a satellite hidden also says which cells its model declares burning at each look of
 * that satellite (`declared_cells`): the answer the blind test compares with the hidden detections.
 * When a run gives them, the lowest bit of a cell's first intensity byte says whether the cell is
 * declared at the hidden pass on show, and the intensity keeps its other seven bits.
 */
export interface BeliefFrames {
  info: BeliefFramesInfo;
  /** steps x ny x nx x 2 bytes, row 0 north, column 0 west. */
  bytes: Uint8Array;
  /** The cells the model declares at each hidden pass, when the run gives them on this grid. */
  declared?: DeclaredCells | null;
}

/** The cells a run's model declares burning at the looks of the hidden instrument. */
export interface DeclaredCells {
  nx: number;
  ny: number;
  /** Frame of the run to its declared cells: flat indices, row * nx + column, row 0 north. */
  byFrame: Map<number, Uint32Array>;
}

/**
 * Reads a run's `declared_cells`. Null when the run has none, when its looks are not frames of
 * the run, or when anything in it is not what the shape says: a picture of the model's answer is
 * drawn from an exact list or not at all.
 */
export function parseDeclaredCells(raw: unknown): DeclaredCells | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const block = raw as { grid?: unknown; looks?: unknown };
  if (typeof block.grid !== 'object' || block.grid === null || !Array.isArray(block.looks)) return null;
  const grid = block.grid as { nx?: unknown; ny?: unknown; index?: unknown; rows_run?: unknown };
  const nx = Number(grid.nx);
  const ny = Number(grid.ny);
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 2 || ny < 2) return null;
  // The layout this reader knows; a run that names another one is not drawn from
  if (grid.index !== 'row * nx + column' || grid.rows_run !== 'north to south') return null;
  const byFrame = new Map<number, Uint32Array>();
  for (const look of block.looks as unknown[]) {
    if (typeof look !== 'object' || look === null) return null;
    const { frame, cells } = look as { frame?: unknown; cells?: unknown };
    if (frame === null || frame === undefined) continue;
    if (!Number.isInteger(frame) || (frame as number) < 0 || !Array.isArray(cells)) return null;
    const list = new Uint32Array(cells.length);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!Number.isInteger(cell) || cell < 0 || cell >= nx * ny) return null;
      list[i] = cell;
    }
    byFrame.set(frame as number, list);
  }
  return byFrame.size > 0 ? { nx, ny, byFrame } : null;
}

export class BeliefField {
  texture: THREE.DataTexture;
  /** Cells east-west and north-south; (0, 0) while no belief is loaded. */
  readonly grid = new THREE.Vector2(0, 0);
  /**
   * The part of the region that holds any belief at the two steps on show, with three cells to
   * spare: (u west, v south, u east, v north). Outside it the shader has nothing to draw.
   */
  readonly box = new THREE.Vector4(0, 0, 0, 0);
  private data: Uint8Array;
  private nx = 1;
  private ny = 1;
  private key = '';
  /** The step the texture holds first, for callers that cache what they read from it. */
  stepKey = '';
  private step = 0;
  /** True while the texture carries the run's declared cells as flags (see the header). */
  declaredGiven = false;

  constructor() {
    this.data = new Uint8Array(4);
    this.texture = this.makeTexture(1, 1);
  }

  private makeTexture(nx: number, ny: number): THREE.DataTexture {
    const tex = new THREE.DataTexture(this.data, nx, ny, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  }

  /** No belief to show: the shader falls back to what it draws without one. */
  clear(): void {
    this.grid.set(0, 0);
    this.box.set(0, 0, 0, 0);
    this.key = '';
    this.stepKey = '';
    this.declaredGiven = false;
  }

  /**
   * Loads the two steps around a time and returns the position between them (0 at the first).
   * A time before the first step or after the last shows that step alone.
   * `hiddenFrame` is the hidden pass on show, or the last one shown (null before any): where the
   * run gives its declared cells on this grid, that frame's cells are flagged.
   */
  sync(belief: BeliefFrames, runKey: string, timeMs: number, hiddenFrame: number | null = null): number {
    const { steps, stepMs, firstTimeMs, nx, ny } = belief.info;
    const exact = Math.min(steps - 1, Math.max(0, (timeMs - firstTimeMs) / stepMs));
    const s0 = Math.min(steps - 1, Math.floor(exact));
    const s1 = Math.min(steps - 1, s0 + 1);
    if (nx !== this.nx || ny !== this.ny) {
      this.texture.dispose();
      this.nx = nx;
      this.ny = ny;
      this.data = new Uint8Array(nx * ny * 4);
      this.texture = this.makeTexture(nx, ny);
      this.key = '';
    }
    this.grid.set(nx, ny);
    const declared = belief.declared && belief.declared.nx === nx && belief.declared.ny === ny ? belief.declared : null;
    const flagged = declared && hiddenFrame !== null ? (declared.byFrame.get(hiddenFrame) ?? null) : null;
    this.declaredGiven = declared !== null;
    const stepKey = `${runKey}:${s0}`;
    const key = `${stepKey}:${declared ? (hiddenFrame ?? 'none') : 'no list'}`;
    if (key !== this.key) {
      this.key = key;
      this.stepKey = stepKey;
      this.step = s0;
      const src = belief.bytes;
      const cells = nx * ny;
      const out = this.data;
      let col0 = nx;
      let col1 = -1;
      let row0 = ny;
      let row1 = -1;
      for (let row = 0; row < ny; row++) {
        // File rows run north to south; texture rows south to north
        const from0 = (s0 * cells + (ny - 1 - row) * nx) * 2;
        const from1 = (s1 * cells + (ny - 1 - row) * nx) * 2;
        const to = row * nx * 4;
        for (let col = 0; col < nx; col++) {
          const p0 = src[from0 + col * 2];
          const p1 = src[from1 + col * 2];
          out[to + col * 4] = p0;
          out[to + col * 4 + 1] = declared ? src[from0 + col * 2 + 1] & 0xfe : src[from0 + col * 2 + 1];
          out[to + col * 4 + 2] = p1;
          out[to + col * 4 + 3] = src[from1 + col * 2 + 1];
          if (p0 > 0 || p1 > 0) {
            if (col < col0) col0 = col;
            if (col > col1) col1 = col;
            if (row < row0) row0 = row;
            if (row > row1) row1 = row;
          }
        }
      }
      if (flagged) {
        for (let i = 0; i < flagged.length; i++) {
          const fileRow = Math.floor(flagged[i] / nx);
          const col = flagged[i] - fileRow * nx;
          const row = ny - 1 - fileRow;
          out[(row * nx + col) * 4 + 1] |= 1;
          // A declared cell is drawn even where the belief on show holds nothing
          if (col < col0) col0 = col;
          if (col > col1) col1 = col;
          if (row < row0) row0 = row;
          if (row > row1) row1 = row;
        }
      }
      if (col1 < 0) this.box.set(0, 0, 0, 0);
      else this.box.set((col0 - 3) / nx, (row0 - 3) / ny, (col1 + 4) / nx, (row1 + 4) / ny);
      this.texture.needsUpdate = true;
    }
    return exact - s0;
  }

  /**
   * The cells of the step on show whose probability is at least `probability`, as (u east, v
   * north, weight) triples: each cell's centre in the region and its expected intensity, which
   * `intensityOf` reads from the cell's intensity byte / 255 (at least a small weight, so a cell
   * with no intensity still counts).
   */
  cellsAbove(belief: BeliefFrames, probability: number, intensityOf: (v: number) => number): Float32Array {
    const { nx, ny } = belief.info;
    const cells = nx * ny;
    const from = this.step * cells * 2;
    const least = Math.ceil(probability * 255);
    const out: number[] = [];
    for (let row = 0; row < ny; row++) {
      for (let col = 0; col < nx; col++) {
        const at = from + (row * nx + col) * 2;
        if (belief.bytes[at] < least) continue;
        out.push((col + 0.5) / nx, 1 - (row + 0.5) / ny, Math.max(0.01, intensityOf(belief.bytes[at + 1] / 255)));
      }
    }
    return new Float32Array(out);
  }

  dispose(): void {
    this.texture.dispose();
  }
}
