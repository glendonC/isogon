import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSmokeNoiseTexture, SMOKE_NOISE_SIZE } from './smokeNoise.ts';

function refMulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function refValueLattice(period, rand) {
  const lattice = new Float32Array(period * period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const at = (ix, iy, iz) => lattice[((iz % period) * period + (iy % period)) * period + (ix % period)];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
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

function refWorleyLattice(period, rand) {
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

test('the 3D smoke noise volume matches the reference periodic lattices byte for byte', () => {
  const n = SMOKE_NOISE_SIZE;
  const rand = refMulberry32(0x150607);
  const v4 = refValueLattice(4, rand);
  const v8 = refValueLattice(8, rand);
  const v16 = refValueLattice(16, rand);
  const w4 = refWorleyLattice(4, rand);
  const w8 = refWorleyLattice(8, rand);
  const w16 = refWorleyLattice(16, rand);

  const expected = new Uint8Array(n * n * n * 4);
  let o = 0;
  for (let k = 0; k < n; k++) {
    const z = (k + 0.5) / n;
    for (let j = 0; j < n; j++) {
      const y = (j + 0.5) / n;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) / n;
        const fbm = v4(x, y, z) * 0.5 + v8(x, y, z) * 0.3 + v16(x, y, z) * 0.2;
        const cells = 1.0 - w4(x, y, z);
        const d8 = 1.0 - w8(x, y, z);
        const d16 = 1.0 - w16(x, y, z);
        const billow = Math.min(1, Math.max(0, fbm * 0.62 + cells * 0.46 - 0.06));
        const detail = Math.min(1, Math.max(0, d8 * 0.62 + d16 * 0.38));
        expected[o] = Math.round(billow * 255);
        expected[o + 1] = Math.round(detail * 255);
        expected[o + 2] = Math.round(fbm * 255);
        expected[o + 3] = 255;
        o += 4;
      }
    }
  }

  const tex1 = buildSmokeNoiseTexture();
  const tex2 = buildSmokeNoiseTexture();
  assert.equal(Buffer.compare(Buffer.from(tex1.image.data), Buffer.from(expected)), 0);
  assert.equal(tex1.image.data, tex2.image.data);
});
