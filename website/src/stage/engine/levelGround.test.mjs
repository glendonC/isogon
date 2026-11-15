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

test('a low strip off a coast may be sea, a low plain joined to the land may not', async () => {
  const { seaPosts, lowPatchesAtSea } = await import('./levelGround.ts');
  const M = 30;
  const dem = new Float32Array(M * M);
  // land in the east half: a low plain (2 m) along its shore, rising inland
  for (let r = 0; r < M; r++) for (let c = 15; c < M; c++) dem[r * M + c] = c < 19 ? 2.0 : 20 + (c - 19) * 10;
  // offshore: a strip two posts thick at 3 m, and a barrier island at 4 m with sea on both sides
  for (let c = 2; c < 10; c++) for (let r = 4; r < 6; r++) dem[r * M + c] = 3.0;
  for (let r = 12; r < 26; r++) dem[r * M + 11] = 4.0;
  const sea = seaPosts(dem, M);
  const maybe = lowPatchesAtSea(dem, M, sea);
  assert.equal(maybe[4 * M + 5], 1, 'the strip');
  assert.equal(maybe[5 * M + 8], 1, 'the strip');
  assert.equal(maybe[18 * M + 11], 1, 'the barrier island: low and ringed by sea, the picture decides');
  for (let r = 1; r < M - 1; r++) assert.equal(maybe[r * M + 16], 0, `the plain at row ${r}`);
  for (let i = 0; i < M * M; i++) if (sea[i]) assert.equal(maybe[i], 0, 'a sea post is not a patch');
});

test('terraces of whole metres are smoothed on flat ground, relief and the sea are kept', async () => {
  const { smoothTerraces } = await import('./levelGround.ts');
  const M = 64;
  const dem = new Float32Array(M * M);
  // a gentle slope in whole metres (a terrace every five posts), a steep hill, and sea in the west
  for (let r = 0; r < M; r++) {
    for (let c = 0; c < M; c++) {
      const hill = Math.max(0, 60 - 12 * Math.hypot(r - 40, c - 40));
      dem[r * M + c] = c < 6 ? 0 : Math.floor(100 + c / 5) + hill;
    }
  }
  const before = dem.slice();
  smoothTerraces(dem, M);
  // the largest step between neighbours along a row of the slope, away from the hill and the sea
  const step = (g) => {
    let worst = 0;
    for (let c = 12; c < 24; c++) worst = Math.max(worst, Math.abs(g[10 * M + c + 1] - g[10 * M + c]));
    return worst;
  };
  assert.equal(step(before), 1);
  assert.ok(step(dem) < 0.5, `steps on the slope after: ${step(dem)}`);
  assert.ok(Math.abs(dem[40 * M + 40] - before[40 * M + 40]) < 1.5, 'the hill keeps its top');
  for (let r = 0; r < M; r++) for (let c = 0; c < 6; c++) assert.equal(dem[r * M + c], 0, 'the sea stays at 0 m');
  assert.ok(dem[10 * M + 6] > 99, 'the coast is not pulled down by the sea');
});
