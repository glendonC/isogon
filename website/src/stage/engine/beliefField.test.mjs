// Run with: npm test. The belief texture must hold exactly what the payload's belief frames hold, each
// cell in its place: the picture of the estimate is read from it and from nothing else.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BeliefField } from './beliefField.ts';

const NX = 3;
const NY = 2;
const STEPS = 3;
const info = { url: '/x', steps: STEPS, stepMs: 1800000, firstTimeMs: 1000000, nx: NX, ny: NY, cellKm: 0.375 };

/** Bytes as the payload lays them out: steps x ny x nx x 2, row 0 north, column 0 west. */
function payload() {
  const bytes = new Uint8Array(STEPS * NY * NX * 2);
  for (let s = 0; s < STEPS; s++) {
    for (let row = 0; row < NY; row++) {
      for (let col = 0; col < NX; col++) {
        const at = ((s * NY + row) * NX + col) * 2;
        bytes[at] = 100 * s + 10 * row + col; // probability byte: step, row and column can be read back
        bytes[at + 1] = 200 + s; // intensity byte
      }
    }
  }
  return bytes;
}

test('the texture holds the two steps around the time, each cell in its place', () => {
  const field = new BeliefField();
  const mix = field.sync({ info, bytes: payload() }, 'run', info.firstTimeMs + 0.25 * info.stepMs);
  assert.ok(Math.abs(mix - 0.25) < 1e-9);
  assert.deepEqual([field.grid.x, field.grid.y], [NX, NY]);
  const data = field.texture.image.data;
  // Texture row 0 is the south edge: the payload's last row
  for (let texRow = 0; texRow < NY; texRow++) {
    const payloadRow = NY - 1 - texRow;
    for (let col = 0; col < NX; col++) {
      const at = (texRow * NX + col) * 4;
      assert.equal(data[at], 10 * payloadRow + col, 'probability at the first step');
      assert.equal(data[at + 1], 200, 'intensity at the first step');
      assert.equal(data[at + 2], 100 + 10 * payloadRow + col, 'probability at the next step');
      assert.equal(data[at + 3], 201, 'intensity at the next step');
    }
  }
});

test('a time outside the frames shows the nearest step alone, and nothing is drawn without frames', () => {
  const field = new BeliefField();
  assert.equal(field.sync({ info, bytes: payload() }, 'run', info.firstTimeMs - 5 * info.stepMs), 0);
  assert.equal(field.texture.image.data[0], 10 * (NY - 1));
  const mix = field.sync({ info, bytes: payload() }, 'run', info.firstTimeMs + 99 * info.stepMs);
  assert.equal(mix, 0);
  const data = field.texture.image.data;
  assert.equal(data[0], 200 + 10 * (NY - 1));
  assert.equal(data[2], 200 + 10 * (NY - 1), 'the last step stands for both');
  field.clear();
  assert.deepEqual([field.grid.x, field.grid.y], [0, 0]);
});

test('the cells of the estimate are the ones at or above the probability, each at its own place', () => {
  const field = new BeliefField();
  const bytes = payload();
  // Step 1: probability bytes are 100 + 10 * row + col, so 100 to 112. Ask for 110 of 255 and more.
  field.sync({ info, bytes }, 'run', info.firstTimeMs + info.stepMs);
  const cells = field.cellsAbove({ info, bytes }, 110 / 255, (v) => v * 255);
  assert.equal(cells.length, 3 * 3);
  for (let i = 0; i < 3; i++) {
    // Row 1 of the payload is the southern row of two: v is a quarter of the way up
    assert.ok(Math.abs(cells[i * 3] - (i + 0.5) / NX) < 1e-6);
    assert.ok(Math.abs(cells[i * 3 + 1] - 0.25) < 1e-6);
    assert.ok(Math.abs(cells[i * 3 + 2] - 201) < 1e-3);
  }
});

test('the box holds every cell with any belief at the two steps, with three cells to spare', () => {
  const big = { ...info, nx: 40, ny: 30, steps: 2 };
  const bytes = new Uint8Array(2 * 30 * 40 * 2);
  // One cell at step 0 (row 10 from the north, column 12) and one at step 1 (row 14, column 20)
  bytes[(0 * 30 * 40 + 10 * 40 + 12) * 2] = 9;
  bytes[(1 * 30 * 40 + 14 * 40 + 20) * 2] = 200;
  const field = new BeliefField();
  field.sync({ info: big, bytes }, 'run', big.firstTimeMs + 0.5 * big.stepMs);
  const { x, y, z, w } = field.box;
  // Columns 12 to 20, three to spare each way; rows from the north 10 to 14 are texture rows 15 to 19
  assert.ok(Math.abs(x - 9 / 40) < 1e-6 && Math.abs(z - 24 / 40) < 1e-6, `${x} ${z}`);
  assert.ok(Math.abs(y - 12 / 30) < 1e-6 && Math.abs(w - 23 / 30) < 1e-6, `${y} ${w}`);
});

// The cells a run says its model declared at a hidden pass: read exactly or not at all, and flagged on
// the texture cell that holds them, so the open frames are the model's own answer.
const declaredBlock = (looks, grid = {}) => ({
  grid: { nx: NX, ny: NY, index: 'row * nx + column', rows_run: 'north to south', ...grid },
  looks,
});

test('declared cells are read per frame, and anything off the stated shape reads as none', async () => {
  const { parseDeclaredCells } = await import('./beliefField.ts');
  const read = parseDeclaredCells(declaredBlock([{ frame: 4, cells: [0, 5] }, { frame: 9, cells: [] }]));
  assert.deepEqual([read.nx, read.ny], [NX, NY]);
  assert.deepEqual([...read.byFrame.get(4)], [0, 5]);
  assert.deepEqual([...read.byFrame.get(9)], []);
  assert.equal(parseDeclaredCells(null), null);
  assert.equal(parseDeclaredCells(declaredBlock([{ frame: null, cells: [1] }])), null, 'looks that are not frames');
  assert.equal(parseDeclaredCells(declaredBlock([{ frame: 4, cells: [NX * NY] }])), null, 'a cell off the grid');
  assert.equal(parseDeclaredCells(declaredBlock([{ frame: 4, cells: [1.5] }])), null, 'a cell that is no index');
  assert.equal(parseDeclaredCells(declaredBlock([{ frame: 4, cells: [1] }], { rows_run: 'south to north' })), null);
  assert.equal(parseDeclaredCells(declaredBlock([{ frame: 4, cells: [1] }], { index: 'column * ny + row' })), null);
});

test('the declared cells of the hidden pass on show are flagged on their own texture cells and no others', async () => {
  const { parseDeclaredCells } = await import('./beliefField.ts');
  // Cell 0 is the north-west cell, cell 5 the south-east one (row 1, column 2)
  const declared = parseDeclaredCells(declaredBlock([{ frame: 4, cells: [0, 5] }, { frame: 9, cells: [1] }]));
  const field = new BeliefField();
  const belief = { info, bytes: payload(), declared };
  const flagsAt = (frame) => {
    field.sync(belief, 'run', info.firstTimeMs + info.stepMs, frame);
    const data = field.texture.image.data;
    const flags = [];
    for (let texRow = 0; texRow < NY; texRow++) {
      for (let col = 0; col < NX; col++) {
        const g = data[(texRow * NX + col) * 4 + 1];
        assert.equal(g & 0xfe, 201 & 0xfe, 'the intensity keeps its other seven bits');
        if (g & 1) flags.push(`${NY - 1 - texRow}:${col}`);
      }
    }
    return flags.sort();
  };
  assert.equal(field.declaredGiven, false);
  assert.deepEqual(flagsAt(4), ['0:0', '1:2']);
  assert.equal(field.declaredGiven, true);
  assert.deepEqual(flagsAt(9), ['0:1'], 'another hidden pass, another list');
  assert.deepEqual(flagsAt(7), [], 'a pass the run lists nothing for');
  assert.deepEqual(flagsAt(null), [], 'no hidden pass shown yet');
});

test('a run without declared cells, or with a list on another grid, leaves the intensity byte whole', async () => {
  const { parseDeclaredCells } = await import('./beliefField.ts');
  const field = new BeliefField();
  field.sync({ info, bytes: payload() }, 'run', info.firstTimeMs + info.stepMs, 4);
  assert.equal(field.declaredGiven, false);
  assert.equal(field.texture.image.data[1], 201);
  const other = parseDeclaredCells(declaredBlock([{ frame: 4, cells: [0] }], { nx: NX + 1 }));
  field.sync({ info, bytes: payload(), declared: other }, 'run2', info.firstTimeMs + info.stepMs, 4);
  assert.equal(field.declaredGiven, false);
  assert.equal(field.texture.image.data[1], 201);
});

test('a declared cell widens the part of the region that is drawn, even where the belief holds nothing', async () => {
  const { parseDeclaredCells } = await import('./beliefField.ts');
  const empty = new Uint8Array(STEPS * NY * NX * 2);
  const declared = parseDeclaredCells(declaredBlock([{ frame: 2, cells: [0] }]));
  const field = new BeliefField();
  field.sync({ info, bytes: empty, declared }, 'run', info.firstTimeMs, null);
  assert.deepEqual([field.box.x, field.box.y, field.box.z, field.box.w], [0, 0, 0, 0]);
  field.sync({ info, bytes: empty, declared }, 'run', info.firstTimeMs, 2);
  assert.ok(field.box.z > field.box.x && field.box.w > field.box.y);
});
