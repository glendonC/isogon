// Run with: npm test. A world layer's cell must say what the cube holds: a cell no loaded file has a row in is never
// read as no fire, a loaded cell with none of the layer's rows reads zero, and a value comes back from its colour
// close to what the cube encoded.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellValue, inverter, NOT_LOADED, tOfValue } from './cells.ts';

// The cube's ramp, as its builder writes it (cube_build.RAMP) and its layers.json repeats.
const RAMP = [
  [90, 10, 10],
  [200, 30, 20],
  [245, 120, 20],
  [255, 210, 60],
  [255, 250, 220],
];

// The cube's own encoding of a value, as cube_build.layers does it.
function encode(v, max) {
  const x = Math.min(Math.max(tOfValue(v, max), 0), 1) * (RAMP.length - 1);
  const i = Math.min(Math.floor(x), RAMP.length - 2);
  const f = x - i;
  return RAMP[i].map((c, k) => Math.round(c * (1 - f) + RAMP[i + 1][k] * f));
}

test('a cell not loaded is never read as zero', () => {
  const c = cellValue(0, 0, 0, 0, inverter(RAMP), 5000);
  assert.equal(c.value, NOT_LOADED);
  assert.notEqual(c.value, 0);
  assert.equal(c.t, null);
});

test('a loaded cell with none of the layer\'s rows reads zero', () => {
  const c = cellValue(128, 128, 128, 70, inverter(RAMP), 5000);
  assert.equal(c.value, 0);
  assert.equal(c.t, null);
});

test('a value comes back from its colour within a few percent', () => {
  const max = 8852;
  const inv = inverter(RAMP);
  for (const v of [1, 3, 12, 85, 640, 2400, 8852]) {
    const [r, g, b] = encode(v, max);
    const back = cellValue(r, g, b, 255, inv, max).value;
    assert.ok(Math.abs(back - v) / v < 0.06, `${v} read back as ${back}`);
  }
});
