import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONTROL_CLASS,
  controlAria,
  controlClass,
  controlSound,
  setControlSound,
} from './controlState.ts';

test('every control carries the one swap class and its variant', () => {
  assert.equal(controlClass({ variant: 'primary' }), `${CONTROL_CLASS} ${CONTROL_CLASS}--primary`);
  assert.equal(controlClass({}), `${CONTROL_CLASS} ${CONTROL_CLASS}--secondary`);
  assert.equal(controlClass({ variant: 'secondary' }, 'guide-act'), `${CONTROL_CLASS} ${CONTROL_CLASS}--secondary guide-act`);
});

test('selected and disabled are states a reader is told', () => {
  assert.match(controlClass({ selected: true }), /--selected/);
  assert.deepEqual(controlAria({ selected: true }), { 'aria-pressed': true });
  assert.deepEqual(controlAria({ selected: false }), { 'aria-pressed': false });
  assert.deepEqual(controlAria({}), {});
  const off = controlAria({ disabled: true, reason: 'VIIRS has not passed yet' });
  assert.equal(off['aria-disabled'], true);
  assert.equal(off.title, 'VIIRS has not passed yet');
  assert.match(controlClass({ disabled: true }), /--disabled/);
});

test('sounds go through one hook, silent until wired, and never from a disabled control', () => {
  const heard = [];
  controlSound('press');
  setControlSound((s) => heard.push(s));
  controlSound('hover');
  controlSound('press');
  controlSound('press', { disabled: true });
  assert.deepEqual(heard, ['hover', 'press']);
  setControlSound(null);
  controlSound('press');
  assert.deepEqual(heard, ['hover', 'press']);
});
