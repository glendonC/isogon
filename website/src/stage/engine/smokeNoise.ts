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

/** Periodic value noise: random lattice of power-of-two `period` cells per axis, smooth interpolation. */
function makeValueLattice(period: number, rand: () => number): (x: number, y: number, z: number) => number {
  const lattice = new Float32Array(period * period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const mask = period - 1;
  const p2 = period * period;
  return (x, y, z) => {
    const fx = x * period;
    const fy = y * period;
    const fz = z * period;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const iz = Math.floor(fz);
    const dx = fx - ix;
    const dy = fy - iy;
    const dz = fz - iz;
    const tx = dx * dx * dx * (dx * (dx * 6 - 15) + 10);
    const ty = dy * dy * dy * (dy * (dy * 6 - 15) + 10);
    const tz = dz * dz * dz * (dz * (dz * 6 - 15) + 10);

    const x0 = ix & mask;
    const x1 = (ix + 1) & mask;
    const y0 = (iy & mask) * period;
    const y1 = ((iy + 1) & mask) * period;
    const z0 = (iz & mask) * p2;
    const z1 = ((iz + 1) & mask) * p2;

    const v000 = lattice[z0 + y0 + x0];
    const v100 = lattice[z0 + y0 + x1];
    const v010 = lattice[z0 + y1 + x0];
    const v110 = lattice[z0 + y1 + x1];
    const v001 = lattice[z1 + y0 + x0];
    const v101 = lattice[z1 + y0 + x1];
    const v011 = lattice[z1 + y1 + x0];
    const v111 = lattice[z1 + y1 + x1];

    const c00 = v000 + (v100 - v000) * tx;
    const c10 = v010 + (v110 - v010) * tx;
    const c01 = v001 + (v101 - v001) * tx;
    const c11 = v011 + (v111 - v011) * tx;
    const c0 = c00 + (c10 - c00) * ty;
    const c1 = c01 + (c11 - c01) * ty;
    return c0 + (c1 - c0) * tz;
  };
}

/** Periodic cellular noise: distance to the nearest feature point, one point per cell. */
function makeWorleyLattice(period: number, rand: () => number): (x: number, y: number, z: number) => number {
  const points = new Float32Array(period * period * period * 3);
  for (let i = 0; i < points.length; i++) points[i] = rand();
  const mask = period - 1;
  return (x, y, z) => {
    const fx = x * period;
    const fy = y * period;
    const fz = z * period;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const cz = Math.floor(fz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) {
      const wz = ((cz + dz) & mask) * period;
      const baseZ = cz + dz - fz;
      for (let dy = -1; dy <= 1; dy++) {
        const wy = (wz + ((cy + dy) & mask)) * period;
        const baseY = cy + dy - fy;
        for (let dx = -1; dx <= 1; dx++) {
          const o = (wy + ((cx + dx) & mask)) * 3;
          const px = cx + dx + points[o] - fx;
          const py = baseY + points[o + 1];
          const pz = baseZ + points[o + 2];
          const d = px * px + py * py + pz * pz;
          if (d < best) best = d;
        }
      }
    }
    return Math.min(1, Math.sqrt(best));
  };
}

let cachedSmokeNoiseData: Uint8Array | null = null;

function getSmokeNoiseData(): Uint8Array {
  if (cachedSmokeNoiseData) return cachedSmokeNoiseData;
  const n = SMOKE_NOISE_SIZE;
  const rand = mulberry32(0x150607);
  const value4 = makeValueLattice(4, rand);
  const value8 = makeValueLattice(8, rand);
  const value16 = makeValueLattice(16, rand);
  const worley4 = makeWorleyLattice(4, rand);
  const worley8 = makeWorleyLattice(8, rand);
  const worley16 = makeWorleyLattice(16, rand);

  const data = new Uint8Array(n * n * n * 4);
  const invN = 1 / n;
  let o = 0;
  for (let k = 0; k < n; k++) {
    const z = (k + 0.5) * invN;
    for (let j = 0; j < n; j++) {
      const y = (j + 0.5) * invN;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * invN;
        const fbm = value4(x, y, z) * 0.5 + value8(x, y, z) * 0.3 + value16(x, y, z) * 0.2;
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
  cachedSmokeNoiseData = data;
  return data;
}

export function buildSmokeNoiseTexture(): THREE.Data3DTexture {
  const n = SMOKE_NOISE_SIZE;
  const tex = new THREE.Data3DTexture(getSmokeNoiseData(), n, n, n);
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
