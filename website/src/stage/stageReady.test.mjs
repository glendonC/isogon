// Run with: npm test. The stage's signal that its first picture is whole: the root's attribute, the promise
// and the event, each once.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markStageLoading, markStageReady, stageReady, STAGE_READY_EVENT } from './stageReady.ts';

test('loading, then ready once: the attribute, the promise and the event', async () => {
  const rootEl = { dataset: {} };
  const events = [];
  const target = { dispatchEvent: (e) => events.push(e.type) };
  markStageLoading(rootEl);
  assert.equal(rootEl.dataset.stage, 'loading');
  let resolved = false;
  stageReady().then(() => {
    resolved = true;
  });
  markStageReady(rootEl, target);
  markStageReady(rootEl, target);
  await Promise.resolve();
  assert.equal(rootEl.dataset.stage, 'ready');
  assert.equal(resolved, true);
  assert.deepEqual(events, [STAGE_READY_EVENT]);
  // (a stage mounted again on a page already ready leaves it ready)
  markStageLoading(rootEl);
  assert.equal(rootEl.dataset.stage, 'ready');
});
