// Run with: npm test. The Earth's years draw MODIS on the Suomi NPP scale to 2011 and Suomi NPP from 2012 as
// detected, the harmonized layer through every year, and say the sharper instrument's factor from whole years only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { familyOf, modeReady, sharpRatio, totalsOf } from './yearsData.ts';

const year = (y, partial = false) => ({ year: y, months: partial ? 2 : 12, partial, first_month: '', last_month: '', platform_months: {} });
const layer = (family, y, rows) => [`${family}_${y}`, { family, year: y, scale: family === 'modis' ? 'modis' : 'suomi_npp', rows, png: `${family}_${y}.png` }];
const idx = {
  years: [year(2000, true), year(2011), year(2012), year(2013)],
  families: {},
  scales: { suomi_npp: { vmax: 30546 } },
  png: { palette_rgb: [] },
  layers: Object.fromEntries([
    layer('modis', 2000, 250), layer('modis', 2011, 4500), layer('modis', 2012, 4800), layer('modis', 2013, 4000),
    layer('modis_on_snpp', 2000, 250), layer('modis_on_snpp', 2011, 4500), layer('modis_on_snpp', 2012, 4800), layer('modis_on_snpp', 2013, 4000),
    layer('viirs', 2012, 19200), layer('viirs', 2013, 18000),
    layer('harmonized', 2000, 3700), layer('harmonized', 2011, 20500), layer('harmonized', 2012, 21000),
  ]),
};

test('as detected: MODIS on the Suomi NPP scale to 2011, Suomi NPP from 2012', () => {
  assert.equal(familyOf(idx, 'detected', 2011), 'modis_on_snpp');
  assert.equal(familyOf(idx, 'detected', 2012), 'viirs');
  assert.equal(familyOf(idx, 'harmonized', 2005), 'harmonized');
});

test('the yearly totals step at 2012 as detected; a record missing a year is not ready', () => {
  const t = totalsOf(idx);
  assert.deepEqual(t.map((x) => x.detected), [250, 4500, 19200, 18000]);
  assert.deepEqual(t.map((x) => x.sharp), [false, false, true, true]);
  assert.equal(t[0].partial, true);
  assert.equal(modeReady(idx, 'detected'), true);
  assert.equal(modeReady(idx, 'harmonized'), false);
});

test("the sharper instrument's factor is read from the whole years both flew", () => {
  assert.equal(sharpRatio(idx), (19200 + 18000) / (4800 + 4000));
});
