import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countedOf, seriesFromCountry, seriesFromCube, yearReadout } from './yearSeries.ts';

// The shape of GET /api/cube/years with three of its years, rows as the route served them.
const cube = {
  years: [{ year: 2000, months: 2, partial: true }, { year: 2011, months: 12, partial: false }, { year: 2012, months: 12, partial: false }],
  layers: {
    modis_2000: { rows: 253816 }, harmonized_2000: { rows: 3712652.98 },
    modis_2011: { rows: 4573073 }, harmonized_2011: { rows: 20590883.5 },
    modis_2012: { rows: 4821497 }, viirs_2012: { rows: 19491829 }, harmonized_2012: { rows: 21483127.4 },
  },
};

test('before VIIRS a year is MODIS as counted, from VIIRS it is VIIRS as counted', () => {
  const s = seriesFromCube(cube);
  assert.equal(s.firstViirsYear, 2012);
  assert.deepEqual(countedOf(s.years[1], 2012), { value: 4573073, by: 'modis' });
  assert.deepEqual(countedOf(s.years[2], 2012), { value: 19491829, by: 'viirs' });
  assert.equal(s.years[0].partial, true);
});

test('the readout says both counts and a partial year says so', () => {
  const s = seriesFromCube(cube);
  assert.equal(yearReadout(s.years[2], 2012), '2012: 19.5 million as VIIRS counted, 21.5 million on one scale');
  assert.equal(yearReadout(s.years[0], 2012), '2000: 253,816 as MODIS counted, 3.7 million on one scale (2 months only)');
});

test('a country reads the same way from the countries route', () => {
  const answer = {
    first_year_partial: { year: 2000, months: 2 },
    by_atlas: { Brazil: { years: { 2000: { modis: 10, viirs: null, harmonized: 40 }, 2012: { modis: 100, viirs: 420, harmonized: 430 } } } },
  };
  const s = seriesFromCountry(answer, 'Brazil');
  assert.equal(s.firstViirsYear, 2012);
  assert.equal(s.years[0].partial, true);
  assert.equal(seriesFromCountry(answer, 'Nowhere'), null);
  assert.equal(seriesFromCube({}), null);
});
