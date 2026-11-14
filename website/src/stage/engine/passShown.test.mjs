// Run with: npm test. Which passes the stage draws nothing of. A pass kept from the model must stay
// off the picture, and a pass the page laid on after a look must come on it even while the page keeps
// the sharp satellite switched off: a round does exactly that.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { passIsHidden } from './passShown.ts';

test('a pass the run marks as kept from the model is hidden, whatever the page says', () => {
  assert.equal(passIsHidden({ family: 'viirs', hidden: true }, false), true);
  assert.equal(passIsHidden({ family: 'viirs', hidden: true }, true), true);
  assert.equal(passIsHidden({ family: 'modis', hidden: true }, false), true);
});

test('with VIIRS switched off by the page every VIIRS pass is hidden and no MODIS pass is', () => {
  assert.equal(passIsHidden({ family: 'viirs' }, true), true);
  assert.equal(passIsHidden({ family: 'modis' }, true), false);
  assert.equal(passIsHidden({ family: 'viirs' }, false), false);
});

test('a pass laid on after a look or a reveal is shown, also while VIIRS is switched off', () => {
  assert.equal(passIsHidden({ family: 'viirs', revealed: true }, true), false);
  assert.equal(passIsHidden({ family: 'viirs', revealed: true }, false), false);
  // (the page un-marks the frame when it lays a look on; a mark left on it does not hide the look)
  assert.equal(passIsHidden({ family: 'viirs', revealed: true, hidden: true }, true), false);
});
