// Run with: npm test. A world layer's cell must say what the cube holds: a cell no loaded file has a row in is never
// read as no fire, a loaded cell with none of the layer's rows reads zero, and a value comes back from its colour
// close to what the cube encoded.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxGround, cellValue, hexStops, inverter, NOT_LOADED, scaledCell, tOfValue } from './cells.ts';

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

// The harmonize maps: the factor on a log scale from 1 to 16, the held-out error on a linear scale from 0 to 1.
const FACTOR = { stops: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'], vmin: 1, vmax: 16, log: true };
const ERROR = { stops: ['#fde4d6', '#f9bd9c', '#f39566', '#eb6834', '#c4501f', '#943b15', '#62270d'], vmin: 0, vmax: 1, log: false };

function paint(v, s) {
  const ramp = hexStops(s.stops);
  const t0 = s.log ? Math.log(v / s.vmin) / Math.log(s.vmax / s.vmin) : (v - s.vmin) / (s.vmax - s.vmin);
  const x = Math.min(Math.max(t0, 0), 1) * (ramp.length - 1);
  const i = Math.min(Math.floor(x), ramp.length - 2);
  const f = x - i;
  return ramp[i].map((c, k) => Math.round(c * (1 - f) + ramp[i + 1][k] * f));
}

test('a place too small to measure reads no value, never zero', () => {
  const c = scaledCell(0, 0, 0, 0, inverter(hexStops(FACTOR.stops)), FACTOR);
  assert.ok(Number.isNaN(c.value));
});

test('a factor and an error come back from their colours', () => {
  const fi = inverter(hexStops(FACTOR.stops));
  for (const v of [1.6, 2.55, 3.97, 6.72, 12]) {
    const [r, g, b] = paint(v, FACTOR);
    const back = scaledCell(r, g, b, 255, fi, FACTOR).value;
    assert.ok(Math.abs(back - v) / v < 0.05, `factor ${v} read back as ${back}`);
  }
  const ei = inverter(hexStops(ERROR.stops));
  for (const v of [0.05, 0.18, 0.42, 0.77]) {
    const [r, g, b] = paint(v, ERROR);
    const back = scaledCell(r, g, b, 255, ei, ERROR).value;
    assert.ok(Math.abs(back - v) < 0.02, `error ${v} read back as ${back}`);
  }
});

test('a value beyond the top of its scale is flagged, so it is said as that much or more', () => {
  const ei = inverter(hexStops(ERROR.stops));
  const [r, g, b] = paint(1.31, ERROR);
  const c = scaledCell(r, g, b, 255, ei, ERROR);
  assert.equal(c.atHigh, true);
  assert.ok(Math.abs(c.value - 1) < 1e-6);
});

// The numbers under the Earth's ramp (the cube's largest cell 12,639 rows, numbers 6.6 px a character): on a ramp of
// 260 px, 1,000 and 10,000 both show with room between them; on 150 px, 1,000 gives way to the ramp's end.
import { layoutTicks } from './tickLayout.ts';

test('legend numbers never touch: the last stays, the one before it gives way', () => {
  const max = 12639;
  const vals = [1, 10, 100, 1000, 10000];
  const labels = ['1', '10', '100', '1,000', '10,000'];
  const ticks = vals.map((v, i) => ({ key: v, t: tOfValue(v, max), label: labels[i] }));
  const widths = labels.map((l) => l.length * 6.6);
  const wide = layoutTicks(ticks, widths, 260);
  assert.deepEqual(wide.map((x) => x.shown), [true, true, true, true, true]);
  assert.ok(wide[4].x - (wide[3].x + widths[3]) >= 10);
  assert.ok(wide[4].x + widths[4] <= 260 + 1e-9);
  const narrow = layoutTicks(ticks, widths, 150);
  assert.deepEqual(narrow.map((x) => x.shown), [true, true, true, false, true]);
});

test('a box says how many of its squares hold a detection, and of the rest how many are sea and how many land', () => {
  // A world of 8 by 4 squares of 45 degrees; land west of the prime meridian, sea east of it.
  const grid = { cols: 8, rows: 4, step: 45 };
  const values = new Float32Array(32).fill(NOT_LOADED);
  values[1 * 8 + 2] = 0; // loaded, none of this layer's rows: still a square with a row
  values[1 * 8 + 5] = 12; // a detection at sea, as an offshore flare
  const isLand = (lon) => lon < 0;
  const g = boxGround(values, grid, [-90, -45, 89.9, 44.9], isLand); // every square it touches, as before
  assert.deepEqual(g, { cells: 8, loaded: 2, sea: 3, land: 3 });
  assert.deepEqual(boxGround(values, grid, [0, -90, 180, 90], () => false), { cells: 16, loaded: 1, sea: 15, land: 0 });
  assert.deepEqual(boxGround(values, grid, [-200, 0, 0, 10], isLand).cells, 0);
});

test('a box larger than about 5,000 squares is read at every n-th square, its shares kept', () => {
  const grid = { cols: 1440, rows: 720, step: 0.25 };
  const values = new Float32Array(1440 * 720).fill(NOT_LOADED);
  for (let r = 0; r < 720; r++) for (let c = 0; c < 720; c++) values[r * 1440 + c] = 1; // the west half loaded
  const g = boxGround(values, grid, [-180, -90, 180, 90], () => true);
  assert.ok(g.cells <= 5000 && g.cells > 2500, `${g.cells} squares read`);
  assert.ok(Math.abs(g.loaded / g.cells - 0.5) < 0.01);
  assert.equal(g.sea, 0);
});
