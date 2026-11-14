// Run with: npm test (node --test, no package needed; Node reads the TypeScript module directly).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractTerrainFindings, findingReferenceFrame } from './terrainFindings.ts';

const N = 256;
const FRAMES = 24;
const SCALE = { gridSize: N, zMaxMwKm2: 80, sigmaMaxMwKm2: 24 };
const BBOX = [150.0, -34.0, 151.0, -33.0];
const REF = findingReferenceFrame(FRAMES);
const flat = () => 500;

function emptyTensor() {
  return new Uint8Array(FRAMES * N * N * 4);
}

/** Writes one cell of the reference pass. Values in MW/km2 on the simulated run's linear scales. */
function put(tensor, gx, gy, { z = 0, sigma = 0, modis = 0 }) {
  const off = REF * N * N * 4 + (gy * N + gx) * 4;
  tensor[off] = Math.round((z / SCALE.zMaxMwKm2) * 255);
  tensor[off + 1] = Math.round((sigma / SCALE.sigmaMaxMwKm2) * 255);
  tensor[off + 2] = Math.round((modis / SCALE.zMaxMwKm2) * 255);
}

function byKind(list, kind) {
  return list.find((f) => f.kind === kind);
}

/** The first number of a callout's value text. */
function firstNumber(text) {
  return Number(/-?\d+(\.\d+)?/.exec(text)[0]);
}

test('a weak peak is shown at the value the field holds, not raised to a floor', () => {
  const tensor = emptyTensor();
  put(tensor, 100, 100, { z: 5.0 });
  const { callouts } = extractTerrainFindings('r', BBOX, tensor, FRAMES, SCALE, flat);
  const front = byKind(callouts, 'front');
  assert.ok(front, 'the strongest estimate is shown');
  const shown = firstNumber(front.valueText);
  const held = (tensor[REF * N * N * 4 + (100 * N + 100) * 4] / 255) * SCALE.zMaxMwKm2;
  assert.equal(shown, Number(held.toFixed(1)));
  assert.ok(shown < 6, `shown ${shown}`);
});

test('an empty field shows no callout and still gives the camera three places', () => {
  const { callouts, anchors } = extractTerrainFindings('r', BBOX, emptyTensor(), FRAMES, SCALE, flat);
  assert.equal(callouts.length, 0);
  assert.deepEqual(anchors.map((a) => a.kind), ['front', 'subpixel', 'uncertainty']);
  for (const a of anchors) assert.equal(a.valueText, '');
});

test('a place the field does not hold is not shown', () => {
  // One fire that MODIS reports in full: nowhere does the estimate stand above MODIS
  const tensor = emptyTensor();
  put(tensor, 100, 100, { z: 40, modis: 40 });
  const { callouts } = extractTerrainFindings('r', BBOX, tensor, FRAMES, SCALE, flat);
  assert.equal(byKind(callouts, 'subpixel'), undefined);
  assert.equal(byKind(callouts, 'uncertainty'), undefined);
  assert.ok(byKind(callouts, 'front'));
});

test('the estimate above MODIS shows both values as held, each with its unit', () => {
  const tensor = emptyTensor();
  put(tensor, 60, 60, { z: 60, modis: 60 });
  put(tensor, 160, 160, { z: 12, modis: 3.5 });
  const { callouts } = extractTerrainFindings('r', BBOX, tensor, FRAMES, SCALE, flat);
  const sub = byKind(callouts, 'subpixel');
  assert.ok(sub);
  const numbers = sub.valueText.match(/\d+\.\d/g).map(Number);
  assert.ok(Math.abs(numbers[0] - 12) < 0.2, sub.valueText);
  assert.ok(Math.abs(numbers[1] - 3.5) < 0.2, sub.valueText);
  assert.equal(sub.valueText.match(/MW\/km²/g).length, 2, sub.valueText);
});

test('the uncertainty callout is one standard deviation as held, and is named so', () => {
  const tensor = emptyTensor();
  put(tensor, 60, 60, { z: 60, sigma: 2 });
  put(tensor, 180, 180, { z: 9, sigma: 0.9 });
  const { callouts } = extractTerrainFindings('r', BBOX, tensor, FRAMES, SCALE, flat);
  const unc = byKind(callouts, 'uncertainty');
  assert.ok(unc);
  const held = (tensor[REF * N * N * 4 + (180 * N + 180) * 4 + 1] / 255) * SCALE.sigmaMaxMwKm2;
  assert.equal(firstNumber(unc.valueText), Number(held.toFixed(1)));
  assert.ok(firstNumber(unc.valueText) < 1.8, unc.valueText);
  const words = `${unc.id} ${unc.title} ${unc.subtitle} ${unc.valueText}`;
  assert.doesNotMatch(words, /90|CI\b|conformal|confidence|interval/i);
  assert.match(words, /1 sigma|standard deviation/i);
});

test('every callout names the pass its value is read from', () => {
  const tensor = emptyTensor();
  put(tensor, 60, 60, { z: 60, sigma: 2 });
  put(tensor, 160, 160, { z: 12, modis: 3.5 });
  put(tensor, 200, 60, { z: 9, sigma: 3 });
  const { callouts } = extractTerrainFindings('r', BBOX, tensor, FRAMES, SCALE, flat);
  assert.equal(callouts.length, 3);
  for (const c of callouts) assert.match(c.valueText, new RegExp(`pass ${REF + 1}\\b`));
});
