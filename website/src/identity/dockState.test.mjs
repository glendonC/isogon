import assert from 'node:assert/strict';
import { test } from 'node:test';
import { litRow, moveRow, usableFrom } from './dockState.ts';

const rows = [{}, { disabled: true }, {}, {}];

test('the light rests on the next step and follows the row pointed at', () => {
  assert.equal(litRow(rows, 0, null), 0);
  assert.equal(litRow(rows, 2, null), 2);
  assert.equal(litRow(rows, 0, 3), 3);
});

test('the light never sits on a row that cannot be used', () => {
  assert.equal(litRow(rows, 1, null), 0);
  assert.equal(litRow(rows, 0, 1), 0);
  assert.equal(litRow([{ disabled: true }], 0, null), null);
  assert.equal(litRow([], 0, null), null);
});

test('arrow keys move down and up, wrap, and pass over rows that cannot be used', () => {
  assert.equal(moveRow(rows, 0, 'ArrowDown'), 2);
  assert.equal(moveRow(rows, 3, 'ArrowDown'), 0);
  assert.equal(moveRow(rows, 2, 'ArrowUp'), 0);
  assert.equal(moveRow(rows, 0, 'ArrowUp'), 3);
  assert.equal(moveRow(rows, 2, 'Home'), 0);
  assert.equal(moveRow(rows, 0, 'End'), 3);
  assert.equal(moveRow(rows, 0, 'Enter'), null);
});

test('the first usable row is found in either direction', () => {
  assert.equal(usableFrom(rows, 1), 2);
  assert.equal(usableFrom(rows, 1, -1), 0);
  assert.equal(usableFrom([], 0), null);
});
