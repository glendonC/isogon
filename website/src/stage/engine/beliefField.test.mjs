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
