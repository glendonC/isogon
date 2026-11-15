// Run with: npm test. The patches a fire on show is made of, so that a label can hang on the larger
// one and not on bare ground between two.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firePatches } from './firePatches.ts';

/** Cells at grid squares (column, row) of a 20 by 20 grid, each with weight 1 unless given. */
function cells(list) {
  const out = [];
  for (const [c, r, w] of list) out.push((c + 0.5) / 20, (r + 0.5) / 20, w ?? 1);
  return new Float32Array(out);
}

test('cells that touch by a side or a corner are one patch, cells a square apart are two', () => {
  const p = firePatches(cells([[2, 2], [3, 2], [4, 3], [8, 8], [8, 9]]), 20, 20);
  assert.deepEqual(p.sizes, [3, 2]);
  assert.deepEqual([...p.patchOf], [0, 0, 0, 1, 1]);
});

test('patches are numbered largest first, and of two the same size the heavier first', () => {
  const p = firePatches(cells([[1, 1, 1], [10, 10, 9], [15, 15], [15, 16], [16, 16]]), 20, 20);
  assert.deepEqual(p.sizes, [3, 1, 1]);
  assert.deepEqual([...p.patchOf], [2, 1, 0, 0, 0]);
});

test('a detection covers the squares its footprint lies on, so two wide pixels side by side touch', () => {
  // Two points five squares apart: apart as bare points, touching when each is five squares wide
  const points = cells([[4, 10], [9, 10]]);
  assert.deepEqual(firePatches(points, 20, 20).sizes, [1, 1]);
  const half = new Float32Array([2.5 / 20, 0.5 / 20, 2.5 / 20, 0.5 / 20]);
  assert.deepEqual(firePatches(points, 20, 20, half).sizes, [2]);
});

test('no cells give no patches, and a cell on the box edge is kept', () => {
  assert.deepEqual(firePatches(new Float32Array(0), 20, 20).sizes, []);
  const p = firePatches(new Float32Array([1, 1, 1, 0, 0, 1]), 20, 20);
  assert.deepEqual(p.sizes, [1, 1]);
});
