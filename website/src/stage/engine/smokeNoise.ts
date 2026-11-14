import * as THREE from 'three';

/**
 * Tileable 3D noise volume for the smoke march (one trilinear fetch per sample instead of
 * procedural noise in the inner loop).
 *
 *   R  billow shape: smooth value-noise FBM blended with inverted cellular noise
 *   G  erosion detail: inverted cellular FBM at higher frequency
 *
 * Every octave is periodic over the volume, so the texture repeats without seams.
 */
export const SMOKE_NOISE_SIZE = 64;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic value noise: random lattice of `period` cells per axis, smooth interpolation. */
function makeValueLattice(period: number, rand: () => number): (x: number, y: number, z: number) => number {
  const lattice = new Float32Array(period * period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const at = (ix: number, iy: number, iz: number): number =>
    lattice[((iz % period) * period + (iy % period)) * period + (ix % period)];
  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y, z) => {
    const fx = x * period;
    const fy = y * period;
    const fz = z * period;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const iz = Math.floor(fz);
    const tx = fade(fx - ix);
    const ty = fade(fy - iy);
    const tz = fade(fz - iz);
    const c00 = at(ix, iy, iz) + (at(ix + 1, iy, iz) - at(ix, iy, iz)) * tx;
    const c10 = at(ix, iy + 1, iz) + (at(ix + 1, iy + 1, iz) - at(ix, iy + 1, iz)) * tx;
    const c01 = at(ix, iy, iz + 1) + (at(ix + 1, iy, iz + 1) - at(ix, iy, iz + 1)) * tx;
    const c11 = at(ix, iy + 1, iz + 1) + (at(ix + 1, iy + 1, iz + 1) - at(ix, iy + 1, iz + 1)) * tx;
    const c0 = c00 + (c10 - c00) * ty;
    const c1 = c01 + (c11 - c01) * ty;
    return c0 + (c1 - c0) * tz;
  };
}

/** Periodic cellular noise: distance to the nearest feature point, one point per cell. */
function makeWorleyLattice(period: number, rand: () => number): (x: number, y: number, z: number) => number {
  const points = new Float32Array(period * period * period * 3);
  for (let i = 0; i < points.length; i++) points[i] = rand();
  return (x, y, z) => {
    const fx = x * period;
    const fy = y * period;
    const fz = z * period;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const cz = Math.floor(fz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) {
      const wz = (((cz + dz) % period) + period) % period;
      for (let dy = -1; dy <= 1; dy++) {
        const wy = (((cy + dy) % period) + period) % period;
        for (let dx = -1; dx <= 1; dx++) {
          const wx = (((cx + dx) % period) + period) % period;
          const o = ((wz * period + wy) * period + wx) * 3;
          const px = cx + dx + points[o] - fx;
          const py = cy + dy + points[o + 1] - fy;
          const pz = cz + dz + points[o + 2] - fz;
          const d = px * px + py * py + pz * pz;
          if (d < best) best = d;
        }
      }
    }
    return Math.min(1, Math.sqrt(best));
  };
}

export function buildSmokeNoiseTexture(): THREE.Data3DTexture {
  const n = SMOKE_NOISE_SIZE;
  const rand = mulberry32(0x150607);
  const value4 = makeValueLattice(4, rand);
  const value8 = makeValueLattice(8, rand);
  const value16 = makeValueLattice(16, rand);
  const worley4 = makeWorleyLattice(4, rand);
  const worley8 = makeWorleyLattice(8, rand);
  const worley16 = makeWorleyLattice(16, rand);

  const data = new Uint8Array(n * n * n * 4);
  let o = 0;
  for (let k = 0; k < n; k++) {
    const z = (k + 0.5) / n;
    for (let j = 0; j < n; j++) {
      const y = (j + 0.5) / n;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) / n;
        const fbm = (value4(x, y, z) * 0.5 + value8(x, y, z) * 0.3 + value16(x, y, z) * 0.2);
        const cells = 1.0 - worley4(x, y, z);
        const w8 = 1.0 - worley8(x, y, z);
        const w16 = 1.0 - worley16(x, y, z);
        const billow = Math.min(1, Math.max(0, fbm * 0.62 + cells * 0.46 - 0.06));
        const detail = Math.min(1, Math.max(0, w8 * 0.62 + w16 * 0.38));
        data[o] = Math.round(billow * 255);
        data[o + 1] = Math.round(detail * 255);
        data[o + 2] = Math.round(fbm * 255);
        data[o + 3] = 255;
        o += 4;
      }
    }
  }

  const tex = new THREE.Data3DTexture(data, n, n, n);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
