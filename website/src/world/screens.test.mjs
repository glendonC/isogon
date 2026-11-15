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

test('back from a board opened from the Earth goes to the Earth; from anywhere else it closes', async () => {
  const s = await import('./screens.ts');
  s.closeWorldScreen();
  s.openWorldScreen('years');
  s.openWorldScreen('test');
  assert.equal(s.backOfWorldScreen()?.name, 'years');
  s.openWorldScreen('sealed');
  assert.equal(s.backOfWorldScreen()?.name, 'years');
  s.backWorldScreen();
  assert.equal(s.worldScreenOnShow()?.name, 'years');
  assert.equal(s.backOfWorldScreen(), null);
  s.backWorldScreen();
  assert.equal(s.worldScreenOnShow(), null);
  s.openWorldScreen('test');
  assert.equal(s.backOfWorldScreen(), null);
  s.openWorldScreen('sealed');
  s.closeWorldScreen();
  s.openWorldScreen('test');
  assert.equal(s.backOfWorldScreen(), null);
  s.closeWorldScreen();
});

test('a place box is one closed ring and its middle is the box centre', async () => {
  const d = await import('./descent.ts');
  const rings = d.boxRings([-121.6, 39.8, -120.8, 40.3]);
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0][0], rings[0][4]);
  const m = d.boxMiddle([-121.6, 39.8, -120.8, 40.3]);
  assert.ok(Math.abs(m.lat - 40.05) < 1e-9 && Math.abs(m.lon + 121.2) < 1e-9);
});

test('the place under a point is found inside its box grown by a margin, the nearest first', async () => {
  const d = await import('./destinations.ts');
  const places = [
    { id: 'a', name: 'A', box: [-121.6, 39.8, -120.8, 40.3] },
    { id: 'b', name: 'B', box: [-120.0, 39.8, -119.4, 40.3] },
  ];
  assert.equal(d.placeAt(places, -121.2, 40.0)?.id, 'a');
  assert.equal(d.placeAt(places, -122.8, 40.0)?.id, 'a');
  assert.equal(d.placeAt(places, -119.0, 40.0)?.id, 'b');
  assert.equal(d.placeAt(places, -100, 40.0), null);
});
