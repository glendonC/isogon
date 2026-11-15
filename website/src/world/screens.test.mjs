// Run with: npm test. The pictures of the world follow the address: ?world= opens one, the years take their view,
// first year, last year and whether they play; anything else opens nothing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { screenOfAddress } from './screens.ts';

test('the address opens a picture of the world', () => {
  assert.deepEqual(screenOfAddress('?world=test'), { name: 'test' });
  assert.deepEqual(screenOfAddress('?film=auto&world=sealed'), { name: 'sealed' });
  assert.equal(screenOfAddress('?world=elsewhere'), null);
  assert.equal(screenOfAddress('?film=auto'), null);
});

test("the film's address for the years: as counted, from 2010 to 2012, playing", () => {
  assert.deepEqual(screenOfAddress('?film=auto&world=years&view=counted&from=2010&until=2012&play=1'), {
    name: 'years',
    years: { view: 'counted', from: 2010, until: 2012, play: true },
  });
  assert.deepEqual(screenOfAddress('?world=years&view=onescale'), { name: 'years', years: { view: 'onescale', from: undefined, until: undefined, play: undefined } });
  assert.equal(screenOfAddress('?world=years&from=12').years.from, undefined);
});
