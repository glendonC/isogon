// Run with: npm test. The burned-area map read for the terrain: classes by the backend's day rule, and where
// the picture lies on the slab.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BURNED_AFTER, BURNED_BEFORE, BURNED_IN, BURNED_NONE, burnedBounds, burnedClasses, slabToPicture } from './burnedArea.ts';

test('a burn day is in the window when its UTC day overlaps it, before or after otherwise', () => {
  const span = Date.parse('2012-08-01T00:00:00Z');
  const start = Date.parse('2012-08-10T06:19:00Z');
  const end = Date.parse('2012-08-16T05:43:00Z');
  // days: 0 none, 9 = 9 August (before), 10 = 10 August (overlaps the start), 16 = 16 August (overlaps the
  // end), 17 = 17 August (after)
  assert.deepEqual(Array.from(burnedClasses([0, 9, 10, 16, 17], span, start, end)), [BURNED_NONE, BURNED_BEFORE, BURNED_IN, BURNED_IN, BURNED_AFTER]);
  // a window ending at midnight leaves the day after it out
  assert.deepEqual(Array.from(burnedClasses([16], span, start, Date.parse('2012-08-16T00:00:00Z'))), [BURNED_AFTER]);
});

test('the picture lies on whole cells from the south-west corner, or on the bounds given', () => {
  const box = [-121.44, 39.86, -120.92, 40.24];
  const b = burnedBounds(box, 118, 113);
  assert.equal(b[0], -121.44);
  assert.equal(b[1], 39.86);
  // the worked example's own bounds (BURNED-shape.md): east -120.919838, north 40.241303
  assert.ok(Math.abs(b[2] - -120.919838) < 2e-5, `east ${b[2]}`);
  assert.ok(Math.abs(b[3] - 40.241303) < 2e-5, `north ${b[3]}`);
  assert.deepEqual(burnedBounds(box, 118, 113, 0.375, [1, 2, 3, 4]), [1, 2, 3, 4]);
});

test('the slab maps onto the picture: the corners land where the ground does', () => {
  const slab = [-121.44, 39.86, -120.92, 40.24];
  const pic = [-121.44, 39.86, -120.919838, 40.241303];
  const [su, sv, ou, ov] = slabToPicture(slab, pic);
  assert.ok(Math.abs(ou) < 1e-12 && Math.abs(ov) < 1e-12);
  // the slab's east edge is a little short of the picture's
  assert.ok(su < 1 && su > 0.999);
  assert.ok(sv < 1 && sv > 0.99);
});
