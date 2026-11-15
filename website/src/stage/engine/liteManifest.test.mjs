// Run with: npm test. The pack's small twin read as a manifest of the pack's own shape.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liteManifestOf } from './liteManifest.ts';

const full = {
  version: 1,
  tier: 'hero',
  extent_km: [44.37, 42.19],
  elev_range_m: [458.1, 2392.2],
  dem: { url: '/t/dem_1024.bin', size: 1024, format: 'f32le' },
  ortho: { url: '/t/ortho_8192.jpg', size: 8192, attribution: 'USDA' },
  ortho_fallback: { url: '/t/ortho_4096.jpg', size: 4096 },
  ortho_detail: [{ url: '/t/detail.jpg', size: 8192, uv_rect: [0, 0, 1, 1] }],
  aux: { url: '/t/aux_2048.png', size: 2048, channels: { r: 'normal_x' } },
  sun: { azimuth_deg: 108, elevation_deg: 34 },
  context: { extent_km: [221, 210], scale: 5, dem: { url: '/t/c_dem.bin', size: 1024, format: 'f32le' }, ortho: { url: '/t/c.jpg', size: 4096 } },
};

test('a pack without a twin has none', () => {
  assert.equal(liteManifestOf(full), null);
  assert.equal(liteManifestOf(null), null);
  assert.equal(liteManifestOf({ ...full, lite: { dem: { url: 'x', size: 256 } } }), null);
});

test('the twin keeps the pack\'s registration, sun and credit, with its own files and land around', () => {
  const lite = {
    dem: { url: '/t/dem_256.bin', size: 256, format: 'f32le' },
    ortho: { url: '/t/ortho_1024.jpg', size: 1024 },
    aux: { url: '/t/aux_512.png', size: 512 },
    context: { extent_km: [221, 210], scale: 5, dem: { url: '/t/c_dem_256.bin', size: 256, format: 'f32le' }, ortho: { url: '/t/c_1024.jpg', size: 1024 } },
  };
  const m = liteManifestOf({ ...full, lite });
  assert.equal(m.dem.size, 256);
  assert.equal(m.ortho.size, 1024);
  assert.equal(m.ortho.attribution, 'USDA');
  assert.equal(m.ortho_fallback, undefined);
  assert.equal(m.ortho_detail, undefined);
  assert.equal(m.aux.size, 512);
  assert.deepEqual(m.aux.channels, { r: 'normal_x' });
  assert.deepEqual(m.extent_km, full.extent_km);
  assert.deepEqual(m.sun, full.sun);
  assert.equal(m.context.dem.size, 256);
  // a twin without a land around has none (the full one comes after)
  assert.equal(liteManifestOf({ ...full, lite: { ...lite, context: undefined } }).context, undefined);
});
