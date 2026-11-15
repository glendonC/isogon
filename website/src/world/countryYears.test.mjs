// Run with: npm test. A country's strip under the Earth's years: its file found by the map's name, its bars as the
// satellites counted (MODIS to 2011, Suomi NPP from 2012), its line on one scale where written, its own step, and
// the files the map draws inside it said.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countryOf, countryRatio, countryTotals, drawnInside, gridLines } from './countryYears.ts';

const YEARS = Array.from({ length: 26 }, (_, i) => 2000 + i);
const idx = { years: YEARS.map((y) => ({ year: y, months: y === 2000 ? 2 : 12, partial: y === 2000, first_month: '', last_month: '', platform_months: {} })) };
const file = {
  years: YEARS,
  countries: {
    France: { name: 'France', atlas: 'France', atlas_id: '250', modis: YEARS.map((y) => y - 1990), viirs: YEARS.map((y) => (y < 2012 ? null : (y - 1990) * 4)), harmonized: null },
    French_Guiana: { name: 'French Guiana', atlas: null, modis: YEARS.map(() => 5), viirs: YEARS.map((y) => (y < 2012 ? null : 20)), harmonized: null },
    United_States: { name: 'United States', atlas: 'United States of America', atlas_id: '840', modis: YEARS.map(() => 100), viirs: YEARS.map((y) => (y < 2012 ? null : 450)), harmonized: YEARS.map(() => 430) },
  },
  by_atlas: { France: 'France', 'United States of America': 'United_States' },
  unmatched: { store: { French_Guiana: 'drawn inside France on the atlas' }, atlas: ['Vatican'] },
};

test("a country's file is found by the map's name, and a shape with no file of its own finds none", () => {
  const us = countryOf(file, 'United States of America', 'United States of America');
  assert.equal(us.key, 'United_States');
  assert.deepEqual(us.years[2011], { modis: 100, viirs: null, harmonized: 430 });
  assert.equal(countryOf(file, 'Vatican', 'Vatican'), null);
});

test("a country's bars are MODIS to 2011 and Suomi NPP from 2012; its line is there only where written", () => {
  const fr = countryTotals(idx, countryOf(file, 'France', 'France'));
  assert.deepEqual(fr.find((t) => t.year === 2011), { year: 2011, detected: 21, sharp: false, harmonized: null, partial: false });
  assert.deepEqual(fr.find((t) => t.year === 2012), { year: 2012, detected: 88, sharp: true, harmonized: null, partial: false });
  assert.equal(fr[0].partial, true);
  const us = countryTotals(idx, countryOf(file, 'United States of America', 'x'));
  assert.equal(us.find((t) => t.year === 2020).harmonized, 430);
});

test("a country's own step: Suomi NPP's rows over MODIS's in the whole years both flew", () => {
  assert.equal(countryRatio(idx, countryOf(file, 'France', 'France')), 4);
  assert.equal(countryRatio(idx, countryOf(file, 'United States of America', 'x')), 4.5);
});

test('the files the map draws inside a country are said; a country with none says none', () => {
  assert.deepEqual(drawnInside(file, 'France'), ['French Guiana']);
  assert.deepEqual(drawnInside(file, 'United_States'), []);
});

test("a country's grid lines are round and under its top", () => {
  assert.deepEqual(gridLines(2.3e6), [1e6, 2e6]);
  assert.deepEqual(gridLines(52_000), [20_000, 40_000]);
  assert.deepEqual(gridLines(950), [500]);
  assert.deepEqual(gridLines(0), []);
});
