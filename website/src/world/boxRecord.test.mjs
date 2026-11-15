// Run with: npm test. A drawn box's Record summed in the browser must give the backend's figures: Python's rounding
// and numpy's sums, medians and percentiles to the last digit, a public cube file read as its writer wrote it (steps,
// escapes, months over 255 apart, closed cells, cells not loaded), and a Record that says no data where a platform
// delivers none. The parity with the cube route on the real file is checked by dev/publicParity.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { npMean, npMedian, npPercentile, pairwiseSum, pyRound } from './pyMath.ts';
import { openPublicCube } from './publicCube.ts';
import { boxAreaKm2, closedYearsForBox, publicRecord } from './boxRecord.ts';

test("Python's round: half to even on the exact value", () => {
  // Values Python 3.12 gives: round(0.03125, 4), round(2.675, 2), round(0.125, 2), round(0.375, 2), ...
  assert.equal(pyRound(0.03125, 4), 0.0312);
  assert.equal(pyRound(-0.03125, 4), -0.0312);
  assert.equal(pyRound(2.675, 2), 2.67);
  assert.equal(pyRound(0.125, 2), 0.12);
  assert.equal(pyRound(0.375, 2), 0.38);
  assert.equal(pyRound(1234.56785, 4), 1234.5678);
  assert.equal(pyRound(0.00015, 4), 0.0001);
  assert.equal(pyRound(4.12345678, 4), 4.1235);
});

test("numpy's pairwise sum, mean, median and linear percentile", () => {
  const a = Array.from({ length: 200 }, (_, i) => i * 0.1);
  assert.equal(pairwiseSum(a), 1990.0); // np.sum(np.arange(200) * 0.1); a plain loop gives 1990.0000000000002
  assert.equal(npMean([...Array(10).fill(0.1), 0.2, 0.3, 0.7]), 0.16923076923076924);
  const v = [3.1, 4.7, 2.2, 5.9, 4.4, 3.3, 4.0];
  assert.equal(npPercentile(v, 10), 2.74);
  assert.equal(npPercentile(v, 90), 5.180000000000001);
  assert.equal(npMedian([0.31, 0.12, 0.5, 0.07]), 0.215);
});

// A public cube file as cube_public.py writes it, for a few cells.
const N_COLS = 1440;
const N_ROWS = 720;
const cellOf = (lon, lat) => (N_ROWS - 1 - Math.floor((lat + 90) / 0.25)) * N_COLS + Math.floor((lon + 180) / 0.25);

function writeCube(entries, loadedCells, closed, nMonths) {
  // entries: [{ cell, month, rows: [T, A, S, J] }], sorted by cell then month
  const byCell = new Map();
  for (const e of entries) byCell.set(e.cell, [...(byCell.get(e.cell) ?? []), e]);
  const cells = [...byCell.keys()].sort((a, b) => a - b);
  const flat = [];
  for (const c of cells) {
    let prev = 0;
    for (const e of byCell.get(c)) {
      while (e.month - prev > 255) {
        flat.push({ step: 255, rows: [0, 0, 0, 0] });
        prev += 255;
      }
      flat.push({ step: e.month - prev, rows: e.rows });
      prev = e.month;
    }
  }
  const counts = cells.map((c) => {
    let n = 0;
    let prev = 0;
    for (const e of byCell.get(c)) {
      while (e.month - prev > 255) {
        n += 1;
        prev += 255;
      }
      n += 1;
      prev = e.month;
    }
    return n;
  });
  const sections = [];
  const parts = [];
  let offset = 8;
  const add = (name, dtype, values) => {
    const T = dtype === 'uint8' ? Uint8Array : dtype === 'uint16' ? Uint16Array : Uint32Array;
    const arr = T.from(values);
    const bytes = new Uint8Array(arr.buffer);
    sections.push({ name, dtype, offset, length: arr.length });
    parts.push([offset, bytes]);
    offset += bytes.length;
    offset += (4 - (offset % 4)) % 4;
  };
  add('cell_delta', 'uint32', cells.map((c, i) => c - (i ? cells[i - 1] : 0)));
  add('cell_entries', 'uint16', counts);
  add('month_step', 'uint8', flat.map((f) => f.step));
  for (let p = 0; p < 4; p++) {
    const esc = flat.flatMap((f, i) => (f.rows[p] >= 255 ? [i] : []));
    add(`rows_${p}`, 'uint8', flat.map((f) => Math.min(f.rows[p], 255)));
    add(`big_step_${p}`, 'uint32', esc.map((i, k) => i - (k ? esc[k - 1] : 0)));
    add(`big_rows_${p}`, 'uint32', esc.map((i) => flat[i].rows[p]));
  }
  const loaded = new Uint8Array(N_COLS * N_ROWS / 8);
  for (const c of loadedCells) loaded[c >> 3] |= 1 << (c & 7);
  add('loaded', 'uint8', loaded);
  const raw = new Uint8Array(offset);
  raw.set(new TextEncoder().encode('IFCELL01'), 0);
  for (const [o, b] of parts) raw.set(b, o);
  const manifest = {
    source: { cube_build: 'test', countries: 1, world_complete: false },
    grid: { step_deg: 0.25, n_cols: N_COLS, n_rows: N_ROWS, earth_radius_km: 6371.0088 },
    months: { first: '2000-11', count: nMonths, last: '' },
    platforms: ['Terra', 'Aqua', 'Suomi NPP', 'NOAA-20'],
    file: { name: 'fire-cells.bin', sha256: '', bytes: raw.length },
    sections,
    delivering: {
      Terra: Array(nMonths).fill(1),
      Aqua: Array.from({ length: nMonths }, (_, m) => (m >= 20 ? 1 : 0)),
      'Suomi NPP': Array.from({ length: nMonths }, (_, m) => (m >= 135 ? 1 : 0)),
      'NOAA-20': Array.from({ length: nMonths }, (_, m) => (m >= 209 ? 1 : 0)),
    },
    outage_days: { Terra: Array(nMonths).fill(0), Aqua: Array(nMonths).fill(0), 'Suomi NPP': Array(nMonths).fill(0), 'NOAA-20': Array(nMonths).fill(0) },
    closed,
  };
  return { manifest, raw };
}

const A = cellOf(-120.1, 38.1);
const B = cellOf(-119.9, 38.1);
const C = cellOf(-121.6, 40.1);
const NM = 302;
const { manifest, raw } = writeCube(
  [
    { cell: A, month: 3, rows: [2, 1, 0, 0] },
    { cell: A, month: 290, rows: [7, 5, 300, 1000] }, // 287 months after the last: one filler entry, two escapes
    { cell: B, month: 150, rows: [10, 8, 40, 0] },
    { cell: C, month: 250, rows: [1, 1, 9, 9] },
  ],
  [A, B, C],
  [{ region_id: 'plumas_ca', years: [2021], context_box: [-122.48, 39.1, -119.88, 41.0], months: [242, 253], cells: [C] }],
  NM,
);
const cube = openPublicCube(manifest, raw);

test('the public file reads back as written: steps, escapes, a gap over 255 months', () => {
  const t = cube.box(-120.25, 38.0, -119.75, 38.25);
  assert.deepEqual(t.box, [-120.25, 38.0, -119.75, 38.25]);
  assert.equal(t.cells, 2);
  assert.equal(t.loaded, true);
  assert.deepEqual([t.rows[0][3], t.rows[1][3]], [2, 1]);
  assert.deepEqual([t.rows[0][290], t.rows[1][290], t.rows[2][290], t.rows[3][290]], [7, 5, 300, 1000]);
  assert.deepEqual([t.rows[0][150], t.rows[2][150]], [10, 40]);
  assert.equal(t.rows[0].reduce((a, b) => a + b, 0), 19);
  assert.equal(cube.monthLabel(0), '2000-11');
  assert.equal(cube.monthLabel(290), '2025-01');
});

test('a box with no loaded cell is not loaded, not a record of zeros', () => {
  assert.equal(cube.box(10, 10, 11, 11).loaded, false);
  assert.equal(publicRecord(cube, [10, 10, 11, 11], { fitted: null }), null);
});

test('a box holding a closed cell answers its closed months as no data, never zero', () => {
  const t = cube.box(-121.75, 40.0, -121.5, 40.25);
  assert.deepEqual(t.closedMonths, Array.from({ length: 12 }, (_, i) => 242 + i));
  const rec = publicRecord(cube, [-121.75, 40.0, -121.5, 40.25], { fitted: null });
  const jan21 = rec.records.find((r) => r.year_month === '2021-01');
  assert.equal(jan21.raw_counts.Terra, null);
  assert.equal(jan21.harmonized_mean, null);
  assert.deepEqual(closedYearsForBox(rec.bbox, manifest), [2021]);
  assert.deepEqual(closedYearsForBox([-119.5, 30, -118, 31], manifest), []);
});

test("the Record: a platform that does not deliver is null, one that saw nothing is 0, the overlap ratio harmonizes MODIS", () => {
  const rec = publicRecord(cube, [-120.25, 38.0, -119.75, 38.25], { fitted: null });
  assert.equal(rec.model_version, 'overlap_ratio_v1');
  assert.equal(rec.records.length, NM);
  const first = rec.records[0];
  assert.equal(first.year_month, '2000-11');
  assert.equal(first.raw_counts.Aqua, null);
  assert.equal(first.raw_counts.Terra.total, 0);
  assert.equal(first.raw_counts['NOAA-21'], null);
  assert.equal(first.sensor_regime, 'TERRA_ONLY');
  // The ratio over the clean overlap months: Suomi NPP 340 rows over MODIS 30 (months 150 and 290).
  assert.equal(rec.harmonization_method.ratio_terra_aqua.ratio, pyRound(340 / 30, 4));
  const m290 = rec.records[290];
  assert.equal(m290.raw_counts['Suomi NPP'].total, 300);
  assert.equal(m290.raw_counts['NOAA-20'].total, 1000);
  assert.equal(m290.sensor_regime, 'MODIS_SNPP_NOAA20');
  assert.equal(m290.harmonized_mean, pyRound((12 / (boxAreaKm2(rec.bbox, 6371.0088) / 1000) / 31) * (340 / 30), 4));
  assert.equal(rec.place.kind, 'box');
});
