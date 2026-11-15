import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countedOf, countryName, seriesFromCountry, seriesFromCube, yearReadout } from './yearSeries.ts';

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

// GET /api/cube/years/countries as the route served it, trimmed to Afghanistan and its two names.
const countriesAnswer = {
  years: Array.from({ length: 26 }, (_, i) => 2000 + i),
  first_year_partial: { year: 2000, months: 2 },
  countries: {
    Afghanistan: {
      name: 'Afghanistan', atlas: 'Afghanistan', atlas_id: '004',
      modis: [6, 227, 219, 469, 302, 194, 403, 270, 420, 281, 591, 333, 220, 216, 185, 112, 188, 228, 107, 149, 424, 236, 42, 87, 94, 104],
      viirs: [null, null, null, null, null, null, null, null, null, null, null, null, 1092, 1170, 920, 765, 1172, 1362, 799, 852, 2191, 1521, 467, 464, 505, 759],
      harmonized: [255.6, 3804.3, 2444.0, 3006.4, 2544.4, 1877.6, 2835.0, 2114.2, 2880.2, 2101.6, 3536.9, 2474.9, 1758.3, 1859.8, 1674.4, 1361.6, 1723.9, 1985.7, 1368.4, 1489.5, 2678.6, 1949.0, 1063.8, 1286.2, 1312.7, 1350.0],
    },
    United_States: { name: 'United States', modis: Array(26).fill(1), viirs: Array(26).fill(null), harmonized: null },
  },
  by_atlas: { Afghanistan: 'Afghanistan', 'United States of America': 'United_States' },
};

test('a country reads from the countries route, by the store key or the map name', () => {
  const s = seriesFromCountry(countriesAnswer, 'Afghanistan');
  assert.equal(s.years.length, 26);
  assert.equal(s.firstViirsYear, 2012);
  assert.deepEqual(s.years[0], { year: 2000, partial: true, months: 2, modis: 6, viirs: null, oneScale: 255.6 });
  assert.deepEqual(countedOf(s.years[12], 2012), { value: 1092, by: 'viirs' });
  assert.deepEqual(countedOf(s.years[11], 2012), { value: 333, by: 'modis' });
  const us = seriesFromCountry(countriesAnswer, 'United States of America');
  assert.equal(us.years[5].modis, 1);
  assert.equal(us.years[5].oneScale, null, 'no harmonized series: no value on one scale');
  assert.equal(us.firstViirsYear, null);
  assert.equal(countryName(countriesAnswer, 'United States of America'), 'United States');
  assert.equal(seriesFromCountry(countriesAnswer, 'Nowhere'), null);
  assert.equal(seriesFromCountry({}, 'Afghanistan'), null);
  assert.equal(seriesFromCube({}), null);
});
