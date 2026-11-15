import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellReadout, cellsFromCalendar, heldOutFromCalendar, heldOutText } from './recordCells.ts';
import { estimateStep } from './tokens.ts';

// The shape of GET /api/calendar?region_id=plumas_ca&source=firms, with made-up months and the route's own
// validation figures for that place.
function calendar(n) {
  const records = [];
  for (let i = 0; i < n; i += 1) {
    const year = 2000 + Math.floor((i + 10) / 12);
    const month = ((i + 10) % 12) + 1;
    records.push({
      year, month, harmonized_mean: i === 3 ? 0 : (i + 1) / 10, harmonized_p10: i / 10, harmonized_p90: (i + 2) / 10,
      viirs_raw_rate: year >= 2012 ? 1 : null,
    });
  }
  return {
    units: { harmonized_mean: 'suomi_npp_equivalent_hotspots_per_1000km2_day' },
    records: records.reverse(),
    harmonization_method: { validation: { held_out_years: [2012, 2013, 2014], median_abs_relative_error_annual: 0.1152, median_abs_relative_error_without_harmonization: 0.7311 } },
  };
}

test('every month becomes a cell in order, and the steps hold equal shares of the months with fire', () => {
  const r = cellsFromCalendar(calendar(302));
  assert.equal(r.cells.length, 302);
  assert.equal(r.firstMonth, '2000-11');
  assert.equal(r.cells[0].ym, '2000-11');
  assert.equal(r.firstYear, 2000);
  assert.equal(r.lastYear, 2025);
  assert.equal(r.firstViirsMonth, '2012-01');
  const counts = new Array(8).fill(0);
  for (const c of r.cells) if (c.step !== null) counts[c.step] += 1;
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `even steps: ${counts}`);
});

test('a month with no fire is no fire, never the dimmest step', () => {
  const r = cellsFromCalendar(calendar(24));
  const zero = r.cells.find((c) => c.value === 0);
  assert.equal(zero.step, null);
  assert.match(cellReadout(zero), /no fire detected/);
});

test('the readout says the month, its value and its range', () => {
  const r = cellsFromCalendar(calendar(24));
  assert.equal(cellReadout(r.cells[0]), 'November 2000: 0.10 detections per 1,000 km² a day, likely 0.00 to 0.20');
});

test('the held-out line comes from the route, rounded to whole percent', () => {
  const h = heldOutFromCalendar(calendar(5));
  assert.deepEqual(h, { method: 0.1152, none: 0.7311, years: 3 });
  assert.equal(heldOutText(h), 'Error on a year it did not see: 12 percent. Without correction: 73 percent.');
  assert.equal(heldOutFromCalendar({}), null);
  assert.equal(cellsFromCalendar({ records: [] }), null);
});

test('the ramp is grey only, dim to full white', () => {
  const g = (s) => s.match(/\d+/g).map(Number);
  const [r0, g0, b0] = g(estimateStep(0));
  const [r7] = g(estimateStep(7));
  assert.ok(Math.max(r0, g0, b0) - Math.min(r0, g0, b0) <= 4, 'no hue');
  assert.ok(r7 > 230 && r0 < 70);
});
