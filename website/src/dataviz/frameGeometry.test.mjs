import assert from 'node:assert/strict';
import { test } from 'node:test';
import { abovePlace, armFor, besidePlace, bracketPaths, grow, readoutLines } from './frameGeometry.ts';

test('four corner brackets, never meeting on a small thing', () => {
  const p = bracketPaths({ x: 10, y: 20, w: 100, h: 60 });
  assert.equal(p.length, 4);
  assert.equal(p[0], 'M 10 44 L 10 20 L 34 20');
  assert.equal(armFor(400, 300), 30);
  assert.ok(armFor(31, 31) * 2 < 31, 'arms of a month cell do not meet');
});

test('the readout is in capitals, fields three spaces apart, packed into lines', () => {
  assert.deepEqual(readoutLines(['August 2012', '10.84 a day per 1,000 km²', 'likely 9.38 to 12.5'], 44), [
    'AUGUST 2012   10.84 A DAY PER 1,000 KM²',
    'LIKELY 9.38 TO 12.5',
  ]);
  assert.deepEqual(readoutLines([]), []);
});

test('words go to the right of the frame when they fit, else to its left, and stay inside', () => {
  const frame = { x: 100, y: 40, w: 30, h: 30 };
  assert.deepEqual(besidePlace(frame, { w: 200, h: 40 }, { w: 600, h: 300 }), { x: 146, y: 40, anchor: 'start' });
  assert.deepEqual(besidePlace({ ...frame, x: 500 }, { w: 200, h: 40 }, { w: 600, h: 300 }), { x: 484, y: 40, anchor: 'end' });
  assert.equal(besidePlace({ ...frame, y: 290 }, { w: 50, h: 40 }, { w: 600, h: 300 }).y, 260);
  assert.deepEqual(grow({ x: 10, y: 10, w: 21, h: 21 }, 5), { x: 5, y: 5, w: 31, h: 31 });
});

test('words above a frame start at its left, else end at its right, else slide inside', () => {
  assert.deepEqual(abovePlace({ x: 100, y: 0, w: 20, h: 20 }, 200, 700), { x: 100, anchor: 'start', leaderX: 100.5 });
  assert.deepEqual(abovePlace({ x: 600, y: 0, w: 20, h: 20 }, 200, 700), { x: 620, anchor: 'end', leaderX: 619.5 });
  assert.deepEqual(abovePlace({ x: 150, y: 0, w: 20, h: 20 }, 600, 700), { x: 100, anchor: 'start', leaderX: 160 });
});
