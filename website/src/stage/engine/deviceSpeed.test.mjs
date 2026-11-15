// Run with: npm test. The stage's one measure of the page thread's speed, and where it calls a machine slow.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSlowMainThread, mainThreadBenchMs, SLOW_MAIN_THREAD_MS } from './deviceSpeed.ts';

test('the measure is the lesser of two timings of the fixed work', () => {
  const times = [0, 12, 100, 107];
  let i = 0;
  assert.equal(mainThreadBenchMs(() => times[i++]), 7);
  const real = mainThreadBenchMs();
  assert.ok(real > 0 && real < 1000, `a real timing in ms: ${real}`);
});

test('a machine is slow only past the threshold, and an unreadable clock is not slow', () => {
  assert.equal(isSlowMainThread(3.1), false);
  assert.equal(isSlowMainThread(SLOW_MAIN_THREAD_MS), false);
  assert.equal(isSlowMainThread(12.9), true);
  assert.equal(isSlowMainThread(Number.NaN), false);
  assert.equal(isSlowMainThread(Infinity), false);
});
