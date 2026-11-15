// Run with: npm test. A picture's median brightness, which sets how much its ground is lifted by night.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { medianLumaOf } from './pictureStats.ts';

const pixels = (...grey) => new Uint8ClampedArray(grey.flatMap((g) => [g, g, g, 255]));

test('the median brightness is linear luminance, and the middle value, not the mean', () => {
  assert.equal(medianLumaOf(pixels()), 0);
  assert.ok(Math.abs(medianLumaOf(pixels(255)) - 1) < 1e-6);
  assert.ok(Math.abs(medianLumaOf(pixels(128)) - 0.2158) < 1e-3, 'mid grey in sRGB is about a fifth in linear');
  // mostly dark ground with a few bright fields: the median stays dark while the mean would not
  const dark = medianLumaOf(pixels(20, 20, 20, 250, 250));
  assert.ok(dark < 0.01, `median ${dark}`);
});
