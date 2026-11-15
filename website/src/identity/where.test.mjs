import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCoord, splitPath } from './where.ts';

test('coordinates read as degrees with their hemisphere, two places, two spaces apart', () => {
  assert.equal(formatCoord(40.0523, -121.1834), '40.05 N  121.18 W');
  assert.equal(formatCoord(-33.5, 150.25), '33.50 S  150.25 E');
  assert.equal(formatCoord(0, 0), '0.00 N  0.00 E');
});

test('no coordinates are shown when either is unknown', () => {
  assert.equal(formatCoord(null, 10), null);
  assert.equal(formatCoord(10, undefined), null);
  assert.equal(formatCoord(Number.NaN, 10), null);
});

test('the last step of the path is the name in view, the rest the trail back', () => {
  assert.deepEqual(splitPath(['World', 'Feather River, California', 'Chips Fire, August 2012']), {
    trail: ['World', 'Feather River, California'],
    here: 'Chips Fire, August 2012',
  });
  assert.deepEqual(splitPath(['World']), { trail: [], here: 'World' });
  assert.deepEqual(splitPath([' ', '']), { trail: [], here: '' });
});
