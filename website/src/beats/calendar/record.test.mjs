// Run with: npm test. The Record shows what the record's answer holds: a month against a usual one by the answer's own
// ratio, the years as counted from the rates each satellite has, and no figure of the correction that was typed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxRoute, gridOf, logClass, parseRecord, rampBounds } from './record.ts';
import { publishRecordView, readRecordView, RECORD_CLOSED } from './recordView.ts';
import { gridLine, methodLine, monthLine, notLoadedLine, percent, rate, RECORD_WORDS, times, unstableLine } from './recordWords.ts';
import { CSV_COLUMNS, recordCsv, recordFileName } from './recordCsv.ts';

const month = (ym, harmonized, modis, viirs, extra = {}) => ({
  year_month: ym,
  year: Number(ym.slice(0, 4)),
  month: Number(ym.slice(5, 7)),
  harmonized_mean: harmonized,
  modis_raw_rate: modis,
  viirs_raw_rate: viirs,
  month_median: 0.5,
  anomaly_ratio: harmonized === null ? null : harmonized / 0.5,
  month_rank: 1,
  month_years: 3,
  raw_counts: { Terra: { total: 10 }, 'Suomi NPP': viirs === null ? null : { total: 40 } },
  ...extra,
});

const body = {
  region_name: 'Somewhere',
  place: { label: 'Somewhere' },
  units: { harmonized_mean: 'suomi_npp_equivalent_hotspots_per_1000km2_day' },
  records: [month('2011-08', 4, 1, null), month('2011-09', 0, 0, null), month('2012-08', 8, 2, 9), month('2013-08', 2, 0.5, 2.2)],
  summary_metrics: { first_month: '2011-08', last_month: '2013-08', viirs_to_modis_overlap_ratio: 4.1223 },
  harmonization_method: {
    validation: { median_abs_relative_error_annual: 0.1086, median_abs_relative_error_without_harmonization: 0.7347 },
    fit_rows: { modis: 10, viirs: 40 },
  },
  month_climatology: [],
  annual_summary: [],
  real_run_starts: { starts: [{ start: '2012-08-10', label: 'a start' }], rule: 'a rule' },
  current_month: { route: '/api/calendar/current?source=firms&region_id=x' },
};
const rec = parseRecord(body, { kind: 'region', regionId: 'x', name: 'Somewhere' });

test('a month as counted is the sharp satellite\'s rate where it flew and the coarse one\'s before', () => {
  assert.equal(rec.months.get('2011-08').asCounted, 1);
  assert.equal(rec.months.get('2012-08').asCounted, 9);
  // The corrected value is kept beside it, untouched.
  assert.equal(rec.months.get('2011-08').value, 4);
  assert.equal(rec.months.get('2012-08').value, 8);
});

test('which satellite was flying comes from the first and last month each has a rate', () => {
  assert.deepEqual(rec.spans.coarse, ['2011-08', '2013-08']);
  assert.deepEqual(rec.spans.sharp, ['2012-08', '2013-08']);
  const coarseOnly = parseRecord({ ...body, records: [month('2011-08', 4, 1, null)] }, { kind: 'region', regionId: 'x', name: 'Somewhere' });
  assert.equal(coarseOnly.spans.sharp, null);
});

test('the correction\'s figures are the answer\'s own', () => {
  assert.equal(rec.sharpRatio, 4.1223);
  assert.deepEqual(rec.heldOut, { harmonized: 0.1086, raw: 0.7347 });
  assert.equal(rec.months.get('2012-08').timesUsual, 16);
});

test('a month is set against a usual one in plain words', () => {
  assert.equal(monthLine('2012-08', 8, 16), '16 times the fire of a usual August here');
  assert.equal(monthLine('2012-08', 8, 4.12), '4.1 times the fire of a usual August here');
  assert.equal(monthLine('2014-07', 1, 1.1), 'About the fire of a usual July here');
  assert.equal(monthLine('2014-07', 0.1, 0.2), 'Less fire than a usual July here');
  assert.equal(monthLine('2011-09', 0, 0), 'No fire detected in this month');
  assert.equal(monthLine('2011-09', null, null), 'No satellite counted fires in this month');
  assert.doesNotMatch(monthLine('2012-08', 8, null, null), /No usual/);
  assert.equal(times(2349.4), '2,349');
});

test('from a hundred times up a month is said by its rate and the usual rate, with their unit', () => {
  assert.equal(monthLine('2021-08', 25.6006, 94.7, 0.2702), '95 times the fire of a usual August here');
  assert.equal(
    monthLine('2021-08', 4.698, 2349.4, 0.002),
    '4.70 detections per 1,000 square kilometres a day. A usual August here: 0.0020',
  );
  // With no usual rate served, the month is said by its own rate
  assert.equal(monthLine('2021-08', 4.698, 2349.4), '4.70 detections per 1,000 square kilometres a day');
  assert.equal(monthLine('2021-08', 4.698, null), '4.70 detections per 1,000 square kilometres a day');
  assert.equal(rate(25.6006), '25.6');
  assert.equal(rate(0.1952), '0.20');
  assert.equal(rate(0.0028), '0.0028');
  assert.equal(rate(0), '0');
});

test('this month so far is said with its unit, the days it was counted over and a usual month beside it', () => {
  assert.equal(RECORD_WORDS.soFar('2026-11'), 'November 2026 so far');
  assert.equal(
    RECORD_WORDS.soFarRate(0.1952, { counted: 14, inMonth: 30 }),
    '0.20 detections per 1,000 square kilometres a day, over the first 14 of 30 days',
  );
  assert.equal(RECORD_WORDS.usualIs('2026-11', 0.3233), 'A usual November here: 0.32');
  assert.match(RECORD_WORDS.notNow(RECORD_WORDS.whyNot.busy), /^This month so far cannot be counted now: /);
});

test('how well the correction holds is said with the shares passed in and nothing typed', () => {
  assert.equal(percent(0.1086), '11');
  const line = RECORD_WORDS.holds(0.1086, 0.7347);
  assert.match(line, /off by 11 percent/);
  assert.match(line, /off by 73 percent/);
  const other = RECORD_WORDS.holds(0.3, 0.5);
  assert.match(other, /off by 30 percent/);
  assert.match(other, /off by 50 percent/);
  assert.match(RECORD_WORDS.asCounted(4.1223, 2012), /about 4\.1 times as many detections .* before 2012/);
  // With no ratio served, no ratio is said.
  assert.doesNotMatch(RECORD_WORDS.asCounted(null, null), /\d/);
});

test('no sentence of The Record carries a percent sign or a forbidden dash', () => {
  const said = [
    ...Object.values(RECORD_WORDS).flatMap((w) => (typeof w === 'string' ? [w] : typeof w === 'object' ? Object.values(w) : [])),
    RECORD_WORDS.loading('Somewhere'),
    RECORD_WORDS.failed('Somewhere'),
    RECORD_WORDS.grid('Somewhere'),
    RECORD_WORDS.asCounted(4.1, 2012),
    RECORD_WORDS.holds(0.1, 0.7),
    RECORD_WORDS.soFar('2026-11'),
    RECORD_WORDS.soFarRate(0.2, { counted: 14, inMonth: 30 }),
    RECORD_WORDS.usualIs('2026-11', 0.3),
    RECORD_WORDS.notNow('it is busy'),
    monthLine('2012-08', 8, 16),
  ];
  // A percent sign, an em dash, an en dash or a middle dot, named by their codes so that this file holds none.
  const barred = new RegExp(`[%${String.fromCharCode(0x2014, 0x2013, 0xb7)}]`);
  for (const s of said) assert.doesNotMatch(String(s), barred, String(s));
});

test('the ramp keeps quiet months low and the worst month at the top', () => {
  const { lo, hi } = rampBounds(rec);
  assert.equal(logClass(0, lo, hi, 8), 0);
  assert.equal(logClass(null, lo, hi, 8), 0);
  assert.equal(logClass(hi, lo, hi, 8), 8);
  assert.equal(logClass(lo, lo, hi, 8), 1);
});

test('the view the guide reads is closed until The Record says otherwise', () => {
  assert.equal(readRecordView().state, 'closed');
  const marked = { ym: '2012-08', words: 'August 2012', opens: true, rate: 8, usual: 0.5, timesUsual: 16, rank: 1, rankOf: 3, csvPath: '/api/calendar/rows.csv' };
  const open = { ...RECORD_CLOSED, state: 'ready', place: 'Somewhere', marked };
  publishRecordView(open);
  assert.equal(readRecordView().marked.words, 'August 2012');
  publishRecordView(RECORD_CLOSED);
  assert.equal(readRecordView().marked, null);
});

test('a drawn box is read from the fire cube, with a template of the cube the registry names filled in', () => {
  const box = [-121.55, 39.31, -120.55, 40.31];
  const cube = { path: '/api/cube/record', query: { box: '-121.55,39.31,-120.55,40.31' } };
  assert.deepEqual(boxRoute(box, null), cube);
  // The calendar's route for a box counts a dozen countries; the cube answers any box on Earth
  assert.deepEqual(boxRoute(box, '/api/calendar?source=firms&box=<west>,<south>,<east>,<north>'), cube);
  assert.deepEqual(boxRoute(box, '/api/cube/record?snap=inner&box=<west>,<south>,<east>,<north>'), {
    path: '/api/cube/record',
    query: { snap: 'inner', box: '-121.55,39.31,-120.55,40.31' },
  });
});

const cubeBlock = { grid_step_deg: 0.25, box_asked: [-9.6, 38.3, -8.1, 39.1], grid_box: [-9.75, 38.25, -8, 39.25], cells: 28, cells_loaded: 23, world_complete: true };

test("a box's grid is the cube's own: the box on whole squares, how many and how many hold rows", () => {
  const place = { kind: 'box', box: [-9.6, 38.3, -8.1, 39.1], name: 'a box' };
  const boxRec = parseRecord({ ...body, cube: cubeBlock }, place);
  assert.deepEqual(boxRec.grid, { asked: [-9.6, 38.3, -8.1, 39.1], box: [-9.75, 38.25, -8, 39.25], step: 0.25, cells: 28, loaded: 23, complete: true });
  // A region has no grid, and an answer with no cube block gives none
  assert.equal(rec.grid, null);
  assert.equal(parseRecord(body, place).grid, null);
  // The cube's answer for a box with no loaded square gives its squares, none of them loaded
  assert.deepEqual(gridOf({ state: 'not_loaded', grid_box: [-30, -30, -29, -29], cells: 16, world_complete: true }, [-30, -30, -29, -29]), {
    asked: [-30, -30, -29, -29],
    box: [-30, -30, -29, -29],
    step: 0.25,
    cells: 16,
    loaded: 0,
    complete: true,
  });
  // The public cube's block (a page of recorded answers) gives the squares but not how many hold rows
  assert.deepEqual(gridOf({ grid_step_deg: 0.25, box_asked: [-9.6, 38.3, -8.1, 39.1], grid_box: [-9.75, 38.25, -8, 39.25], cells: 28 }, null), {
    asked: [-9.6, 38.3, -8.1, 39.1],
    box: [-9.75, 38.25, -8, 39.25],
    step: 0.25,
    cells: 28,
    loaded: null,
    complete: false,
  });
  const fromPublic = parseRecord({ ...body, public_cube: { grid_step_deg: 0.25, grid_box: [-9.75, 38.25, -8, 39.25], cells: 28 } }, { kind: 'box', box: [-9.6, 38.3, -8.1, 39.1], name: 'a box' });
  assert.equal(fromPublic.grid.cells, 28);
  assert.equal(gridOf({ grid_box: [-30, -30, -29, -29] }, null), null);
});

test("the method is named in plain words, with how often a month's band held, all from the answer", () => {
  const served = {
    ...body,
    harmonization_method: {
      ...body.harmonization_method,
      id: 'pooled_month_size_v1',
      interval: { level: 0.8 },
      validation: { ...body.harmonization_method.validation, monthly_interval_coverage: 0.8125, months_tested: 144 },
    },
  };
  const r = parseRecord(served, { kind: 'region', regionId: 'x', name: 'Somewhere' });
  assert.deepEqual(r.method, { id: 'pooled_month_size_v1', level: 0.8, monthsHeld: { held: 117, of: 144 }, what: null });
  assert.equal(
    methodLine(r.method.id, r.method.level, r.method.monthsHeld),
    "Every year is on the newer satellite's scale by a factor for each month of the year and for how much fire it has, leaning on nearby places. A month's band is its range: with each year hidden in turn, it held the newer satellite's own count in 117 of 144 months, meant for 80 percent.",
  );
  // Without the check, the method alone; a method with no words is not named, rather than shown as an id
  assert.equal(methodLine('overlap_ratio_v1', null, null), "Every year is on the newer satellite's scale by one ratio per place.");
  assert.equal(methodLine('a_new_method_v2', 0.8, { held: 1, of: 2 }), null);
  assert.equal(rec.method.monthsHeld, null);
});

test("a place whose ratio does not hold says its harmonized value is not meaningful, from the check's own counts", () => {
  const flagged = (rs) => ({ ...body, harmonization_method: { ...body.harmonization_method, validation: { ...body.harmonization_method.validation, ratio_stability: rs } } });
  const place = { kind: 'region', regionId: 'x', name: 'Somewhere' };
  const rule = 'each held-out year is tested when rows reach 50, and departs when the two differ by more than 10 times; not stable when 2 tested years or more depart';
  const r = parseRecord(flagged({ verdict: 'not stable', stable: false, years_tested: [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], years_departing: [2012, 2016, 2018, 2019, 2023, 2024], rule }), place);
  assert.deepEqual(r.unstable, { departing: 6, tested: 14, factor: 10 });
  assert.equal(
    unstableLine(6, 14, 10),
    "The harmonized value is not meaningful here: with each year hidden in turn, it missed the newer satellite's own count by more than ten times in 6 of 14 years, which lava or gas flares, counted as fire in NASA's files, can cause.",
  );
  assert.match(unstableLine(2, 9, null), /own count by far in 2 of 9 years/);
  // Stable, not tested, or no check at all: nothing is said
  assert.equal(parseRecord(flagged({ verdict: 'stable', stable: true, years_tested: [2012], years_departing: [], rule }), place).unstable, null);
  assert.equal(parseRecord(flagged({ verdict: 'not tested', stable: null }), place).unstable, null);
  assert.equal(rec.unstable, null);
});

test('a drawn area says the box it is read on, the share of its squares with detections and the ones without', () => {
  const where = '38.25 N to 39.25 N, 9.75 W to 8.00 W';
  assert.equal(
    gridLine(where, 0.25, 28, 23, true),
    `Read on whole squares of a quarter degree (about 28 km): ${where}. 23 of its 28 squares (82 percent) have detections; the other 5 have none and count as no fire.`,
  );
  assert.match(gridLine(where, 0.25, 9, 9, true), /All 9 squares have detections\.$/);
  assert.equal(gridLine(where, 0.25, 28, null, false), `Read on 28 whole squares of a quarter degree (about 28 km): ${where}.`);
  assert.match(gridLine(where, 0.25, 6400, 6399, false), /6,399 of its 6,400 squares \(over 99 percent\).*the other 1 has none in the countries loaded so far/);
  assert.equal(notLoadedLine(16, 0.25, true), "No fire record here: none of its 16 squares of a quarter degree (about 28 km) has a detection in NASA's files.");
  assert.match(notLoadedLine(1, 0.25, false), /^No fire record here yet: its one square .* has no detection in the countries loaded so far\.$/);
});

test("the record as a file: one row a month with the answer's own figures, and what they are at the top", () => {
  const served = {
    ...body,
    provenance: 'Real NASA FIRMS standard processing rows. Not simulated.',
    bbox: [-121.44, 39.86, -120.92, 40.24],
    harmonization_method: {
      ...body.harmonization_method,
      id: 'pooled_month_size_v1',
      interval: { level: 0.8, what: 'the 10th to 90th percentile of held-out errors' },
    },
    records: [
      month('2011-08', 4, 1, null, { harmonized_p10: 3.1, harmonized_p90: 5.2, raw_counts: { Terra: { total: 7 }, Aqua: { total: 5 } } }),
      month('2012-08', 8, 2, 9, { harmonized_p10: 6.5, harmonized_p90: 9.9, raw_counts: { Terra: { total: 10 }, 'Suomi NPP': { total: 40 }, 'NOAA-20': { total: 38 } } }),
    ],
  };
  const r = parseRecord(served, { kind: 'region', regionId: 'x', name: 'Somewhere' });
  const csv = recordCsv(r, 'https://example.org/isogon/');
  const lines = csv.trim().split('\n');
  const comments = lines.filter((l) => l.startsWith('#'));
  const table = lines.filter((l) => !l.startsWith('#'));
  assert.equal(table[0], CSV_COLUMNS.join(','));
  // One row a month, in order, every figure the answer's
  assert.equal(table.length - 1, r.months.size);
  assert.equal(table[1], '2011-08,7,5,,,,1,,4,3.1,5.2');
  assert.equal(table[2], '2012-08,10,,40,38,,2,9,8,6.5,9.9');
  // What the figures are, at the top
  assert.ok(comments.some((l) => l.includes('Somewhere') && l.includes('-121.44, 39.86, -120.92, 40.24')));
  assert.ok(comments.some((l) => l.startsWith('# Source: Real NASA FIRMS')));
  assert.ok(comments.some((l) => l.includes('pooled_month_size_v1') && l.includes('a factor for each month of the year')));
  assert.ok(comments.some((l) => l.includes('the middle 80 percent, the 10th to 90th percentile of held-out errors')));
  assert.ok(comments.some((l) => l === '# Page: https://example.org/isogon/'));
  assert.equal(recordFileName(r), 'fire-record-somewhere.csv');
  // A drawn area says the box drawn and the squares it is read on
  const area = parseRecord({ ...served, cube: { grid_step_deg: 0.25, box_asked: [-9.6, 38.3, -8.1, 39.1], grid_box: [-9.75, 38.25, -8, 39.25], cells: 28, cells_loaded: 23 } }, { kind: 'box', box: [-9.6, 38.3, -8.1, 39.1], name: 'a box' });
  const areaCsv = recordCsv(area, 'https://example.org/');
  assert.ok(areaCsv.includes('# Area drawn: west, south, east, north = -9.6, 38.3, -8.1, 39.1'));
  assert.ok(areaCsv.includes('# Read on whole squares of 0.25 degree: -9.75, 38.25, -8, 39.25 (28 squares)'));
});
