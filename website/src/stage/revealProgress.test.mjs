// Run with: npm test. The reveal's sweep line as the page reports it, read by the stage each frame.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REVEAL_LINE_STALE_MS, revealLine, setRevealProgress } from './revealProgress.ts';

test('a running sweep gives its line; a finished, stale or bad one gives none', () => {
  setRevealProgress(0.25);
  assert.equal(revealLine(performance.now()), 0.25);
  setRevealProgress(-3);
  assert.equal(revealLine(performance.now()), 0);
  setRevealProgress(1);
  assert.equal(revealLine(performance.now()), null);
  setRevealProgress(0.5);
  assert.equal(revealLine(performance.now() + REVEAL_LINE_STALE_MS + 10), null);
  setRevealProgress(Number.NaN);
  assert.equal(revealLine(performance.now()), null);
});
