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
 */
export interface BeliefFrames {
  info: BeliefFramesInfo;
  /** steps x ny x nx x 2 bytes, row 0 north, column 0 west. */
  bytes: Uint8Array;
}

export class BeliefField {
  texture: THREE.DataTexture;
  /** Cells east-west and north-south; (0, 0) while no belief is loaded. */
  readonly grid = new THREE.Vector2(0, 0);
  private data: Uint8Array;
  private nx = 1;
  private ny = 1;
  private key = '';

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
    this.key = '';
  }

  /**
   * Loads the two steps around a time and returns the position between them (0 at the first).
   * A time before the first step or after the last shows that step alone.
   */
  sync(belief: BeliefFrames, runKey: string, timeMs: number): number {
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
    const key = `${runKey}:${s0}`;
    if (key !== this.key) {
      this.key = key;
      const src = belief.bytes;
      const cells = nx * ny;
      const out = this.data;
      for (let row = 0; row < ny; row++) {
        // File rows run north to south; texture rows south to north
        const from0 = (s0 * cells + (ny - 1 - row) * nx) * 2;
        const from1 = (s1 * cells + (ny - 1 - row) * nx) * 2;
        const to = row * nx * 4;
        for (let col = 0; col < nx; col++) {
          out[to + col * 4] = src[from0 + col * 2];
          out[to + col * 4 + 1] = src[from0 + col * 2 + 1];
          out[to + col * 4 + 2] = src[from1 + col * 2];
          out[to + col * 4 + 3] = src[from1 + col * 2 + 1];
        }
      }
      this.texture.needsUpdate = true;
    }
    return exact - s0;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
