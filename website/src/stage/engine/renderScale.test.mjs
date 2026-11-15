// Run with: npm test. The stage's render scale on a slow machine: down while frames run slow, back up once
// they run at the display's pace, never straight back to a scale found too slow, stalls not counted.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RENDER_SCALE, RenderScaleGovernor } from './renderScale.ts';

const run = (g, gapMs, seconds, hidden = false) => {
  const changes = [];
  for (let t = 0; t < seconds * 1000; t += gapMs) {
    const s = g.feed(gapMs, hidden);
    if (s !== null) changes.push(+s.toFixed(2));
  }
  return changes;
};

test('a machine at the display pace keeps the full scale', () => {
  const g = new RenderScaleGovernor();
  assert.deepEqual(run(g, 16.7, 20), []);
  assert.equal(g.scale, 1);
});

test('two slow windows step the scale down, then one step a second, not below the least', () => {
  const g = new RenderScaleGovernor();
  assert.deepEqual(run(g, 40, 1.05), []);
  assert.deepEqual(run(g, 40, 2.05), [0.85, 0.7]);
  run(g, 40, 10);
  assert.equal(g.scale, RENDER_SCALE.LEAST);
});

test('once fast again it climbs, but not back to a scale that was too slow until the hold has passed', () => {
  const g = new RenderScaleGovernor();
  run(g, 40, 2.05); // 1 -> 0.85 after two slow windows, the ceiling now a step under 1
  assert.equal(g.scale, 0.85);
  const early = run(g, 16.7, 20);
  assert.deepEqual(early, [0.9], 'climbs at most to a step under the scale found slow');
  assert.ok(g.scale < 1);
  run(g, 16.7, RENDER_SCALE.HOLD_SEC + 10);
  assert.equal(g.scale, 1);
});

test('a few long frames while files arrive are not a pace', () => {
  const g = new RenderScaleGovernor();
  const changes = [];
  for (let k = 0; k < 600; k++) {
    const s = g.feed(k % 10 === 0 ? 180 : 16.7);
    if (s !== null) changes.push(s);
  }
  assert.deepEqual(changes, []);
  assert.equal(g.scale, 1);
});

test('stalls and a hidden tab are not a pace', () => {
  const g = new RenderScaleGovernor();
  assert.deepEqual(run(g, 400, 10), []);
  assert.deepEqual(run(g, 40, 5, true), []);
  assert.equal(g.scale, 1);
});
