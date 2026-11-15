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

test('level ground at whole metres (terraces) is told from a lake at any height', async () => {
  const { levelIsWholeMetres } = await import('./levelGround.ts');
  const M = 40;
  // Terraces: a gentle slope given in whole metres, so each step is a level band at a whole metre
  const terraces = new Float32Array(M * M);
  // A lake at 1371.4 m in a valley of finer grain
  const lake = new Float32Array(M * M);
  for (let r = 0; r < M; r++) {
    for (let c = 0; c < M; c++) {
      terraces[r * M + c] = 260 + Math.floor(c / 6);
      const inLake = r > 10 && r < 30 && c > 10 && c < 30;
      lake[r * M + c] = inLake ? 1371.4 : 1380 + 0.73 * Math.hypot(r - 20, c - 20);
    }
  }
  assert.equal(levelIsWholeMetres(terraces, M), true);
  assert.equal(levelIsWholeMetres(lake, M), false);
  assert.equal(levelIsWholeMetres(new Float32Array(M * M), M), false);
});

test('specks of noise just off a coast are sea, a straight low beach stays land', async () => {
  const { seaPosts } = await import('./levelGround.ts');
  const M = 20;
  const dem = new Float32Array(M * M);
  for (let r = 0; r < M; r++) for (let c = 0; c < M; c++) dem[r * M + c] = c < 10 ? 0 : 0.6 + (c - 10) * 3;
  dem[5 * M + 4] = 0.8; // a speck at sea
  dem[6 * M + 4] = 0.9; // and its neighbour
  dem[12 * M + 3] = 4.0; // a rock: too high to be noise
  const sea = seaPosts(dem, M);
  assert.equal(sea[5 * M + 4], 1);
  assert.equal(sea[6 * M + 4], 1);
  assert.equal(sea[12 * M + 3], 0);
  for (let r = 1; r < M - 1; r++) assert.equal(sea[r * M + 10], 0, `the beach at row ${r}`);
});
