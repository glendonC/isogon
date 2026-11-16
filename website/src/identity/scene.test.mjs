import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countAt, isNear, promptSpot, reticleBox, sweepAt } from './scene.ts';

const view = { width: 1440, height: 900 };

test('the reticle frames the thing with room around it and stays inside the screen', () => {
  assert.deepEqual(reticleBox({ left: 800, top: 320, right: 1240, bottom: 590 }, view), { left: 776, top: 296, right: 1264, bottom: 614 });
  assert.deepEqual(reticleBox({ left: 0, top: 0, right: 1440, bottom: 900 }, view), { left: 16, top: 16, right: 1424, bottom: 884 });
});

test('the prompt stands above the frame, or below it when the frame is near the top', () => {
  assert.deepEqual(promptSpot({ left: 776, top: 296, right: 1264, bottom: 614 }, view), { x: 776, y: 296, hang: 'above' });
  assert.deepEqual(promptSpot({ left: 776, top: 40, right: 1264, bottom: 300 }, view), { x: 776, y: 300, hang: 'below' });
  assert.equal(promptSpot({ left: 1300, top: 400, right: 1420, bottom: 500 }, view).x, 1440 - 16 - 340);
});

test('the pointer is near within the margin around the frame', () => {
  const f = { left: 100, top: 100, right: 200, bottom: 200 };
  assert.equal(isNear(f, 150, 150), true);
  assert.equal(isNear(f, 240, 150), true);
  assert.equal(isNear(f, 260, 150), false);
});

test('the readout counts to its value in whole numbers and ends exact', () => {
  assert.equal(countAt(0, 180), 0);
  assert.equal(countAt(1500, 180), 180);
  assert.equal(countAt(5000, 180), 180);
  const mid = countAt(750, 180);
  assert.ok(mid > 90 && mid < 180, `eased out: ${mid}`);
  assert.equal(Number.isInteger(mid), true);
  assert.equal(countAt(500, Number.NaN), 0);
});

test('the sweep runs from 0 to 1 and never backwards', () => {
  assert.equal(sweepAt(0), 0);
  assert.equal(sweepAt(1600), 1);
  let last = 0;
  for (let t = 0; t <= 1600; t += 100) {
    const v = sweepAt(t);
    assert.ok(v >= last);
    last = v;
  }
});

test('a count from one value to another runs by the difference and ends on the new value', () => {
  const from = 120;
  const to = 180;
  assert.equal(from + countAt(0, to - from), 120);
  assert.equal(from + countAt(1500, to - from), 180);
  const down = 180 + countAt(1500, 90 - 180);
  assert.equal(down, 90);
});

test('the prompt hangs below its frame when the top bar leaves no room above', () => {
  const phone = { width: 390, height: 844 };
  const frame = { left: 148, top: 218, right: 284, bottom: 343 };
  assert.equal(promptSpot(frame, phone).hang, 'above');
  assert.equal(promptSpot(frame, phone, 92, 340, 170).hang, 'below');
});

test('a wide prompt (a long readout) is moved left to stay on the screen', () => {
  const view = { width: 1440, height: 900 };
  assert.equal(promptSpot({ left: 1000, top: 400, right: 1100, bottom: 500 }, view, 92, 700).x, 1440 - 16 - 700);
});

test('a prompt that would cover a thing to avoid hangs on the other side, or not at all', async () => {
  const { promptAvoiding } = await import('./scene.ts');
  const view = { width: 1440, height: 900 };
  const frame = { left: 760, top: 270, right: 920, bottom: 450 };
  const size = { w: 300, h: 110 };
  // Nothing to avoid: above, as before.
  assert.equal(promptAvoiding(frame, view, size, []).hang, 'above');
  // A pin above the frame, under where the prompt would stand: below instead.
  assert.equal(promptAvoiding(frame, view, size, [{ left: 800, top: 200, right: 816, bottom: 216 }]).hang, 'below');
  // Pins on both sides: no prompt.
  assert.equal(promptAvoiding(frame, view, size, [{ left: 800, top: 200, right: 816, bottom: 216 }, { left: 800, top: 500, right: 816, bottom: 516 }]), null);
});
