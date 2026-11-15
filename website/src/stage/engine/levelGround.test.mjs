// Run with: npm test. Where the stage takes a lake to be: ground that is exactly level in the
// elevation data. A slope, however gentle, is not a lake, and the sea (0 m) is marked elsewhere.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { levelGround } from './levelGround.ts';

const N = 12;
/** A grid that rises one metre a post to the east, with a level patch of the given rows and columns. */
function grid(patch) {
  const dem = new Float32Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const inPatch = patch && r >= patch.r0 && r <= patch.r1 && c >= patch.c0 && c <= patch.c1;
      dem[r * N + c] = inPatch ? patch.elevation : 500 + c;
    }
  }
  return dem;
}

test('a level patch is found whole, shore posts included, and the slope around it is not', () => {
  const lake = { r0: 3, r1: 8, c0: 2, c1: 7, elevation: 480 };
  const mask = levelGround(grid(lake), N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const inside = r >= lake.r0 && r <= lake.r1 && c >= lake.c0 && c <= lake.c1;
      assert.equal(mask[r * N + c], inside ? 1 : 0, `row ${r} column ${c}`);
    }
  }
});

test('a slope of a few centimetres a post is not level ground', () => {
  const dem = new Float32Array(N * N);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) dem[r * N + c] = 300 + 0.08 * c;
  assert.equal(levelGround(dem, N).reduce((a, b) => a + b, 0), 0);
});

test('a patch too small to hold one post with level neighbours all round is not a lake', () => {
  const mask = levelGround(grid({ r0: 5, r1: 6, c0: 5, c1: 6, elevation: 480 }), N);
  assert.equal(mask.reduce((a, b) => a + b, 0), 0);
});

test('the sea at 0 m is left to the sea mask', () => {
  const dem = new Float32Array(N * N);
  assert.equal(levelGround(dem, N).reduce((a, b) => a + b, 0), 0);
});
