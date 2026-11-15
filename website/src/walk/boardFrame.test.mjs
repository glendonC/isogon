// Run with: npm test. The frame stands on the square the stage reports, keeps the board's perspective at its edges,
// and names the square and the pass the way the readout says them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { insetQuad, mixQuad, passTime, quadBox, squareName, squareQuad } from './boardFrame.ts';

/** A 4 by 4 board seen square on: each square 100 px, north-west corners only, as the stage reports them. */
const board = [];
for (let t = 0; t < 16; t += 1) board.push({ tile: t, x: 100 + (t % 4) * 100, y: 50 + Math.floor(t / 4) * 100, visible: true });

test('an inner square: its corners are its neighbours\' north-west corners', () => {
  assert.deepEqual(squareQuad(board, 5, 4), { nw: { x: 200, y: 150 }, ne: { x: 300, y: 150 }, se: { x: 300, y: 250 }, sw: { x: 200, y: 250 } });
});

test('the south-east square: its far corners carried on from the neighbours behind it', () => {
  assert.deepEqual(squareQuad(board, 15, 4), { nw: { x: 400, y: 350 }, ne: { x: 500, y: 350 }, se: { x: 500, y: 450 }, sw: { x: 400, y: 450 } });
});

test('a square the stage does not see has no frame', () => {
  const hiddenNw = board.map((a) => (a.tile === 6 ? { ...a, visible: false } : a));
  assert.equal(squareQuad(hiddenNw, 6, 4), null);
  assert.equal(squareQuad(board, 3, 0), null);
});

test('the frame stands inside the square\'s lines, drawn toward its centre', () => {
  assert.deepEqual(insetQuad(squareQuad(board, 5, 4), 0.1), { nw: { x: 205, y: 155 }, ne: { x: 295, y: 155 }, se: { x: 295, y: 245 }, sw: { x: 205, y: 245 } });
});

test('the move between two squares passes halfway at t one half', () => {
  const a = squareQuad(board, 0, 4);
  const b = squareQuad(board, 2, 4);
  assert.deepEqual(mixQuad(a, b, 0.5).nw, { x: 200, y: 50 });
});

test('the box handed to the reticle: drawn in by its pad, so its frame lands on the square', () => {
  assert.deepEqual(quadBox(squareQuad(board, 5, 4), 24), { left: 224, top: 174, right: 276, bottom: 226 });
  assert.deepEqual(quadBox(squareQuad(board, 5, 4), 80), { left: 250, top: 200, right: 250, bottom: 200 });
});

test('the readout\'s square and pass', () => {
  assert.equal(squareName(0, 4), 'A1');
  assert.equal(squareName(6, 4), 'B3');
  assert.equal(squareName(15, 4), 'D4');
  assert.equal(passTime('2012-08-10T09:29:00Z'), '10 AUG 09:29 UTC');
  assert.equal(passTime(null), '');
  assert.equal(passTime('not a time'), '');
});
