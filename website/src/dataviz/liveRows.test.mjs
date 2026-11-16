import assert from 'node:assert/strict';
import { test } from 'node:test';
import { partWords, rowsFromLive } from './liveRows.ts';

// The shape of GET /api/live, two fires followed, one with two seals.
const live = {
  fires: [{ id: 'c0f02', part: 'oceania', centre: [125, -16] }, { id: 'c0f12', part: 'africa', centre: [30, 8] }, { id: 'c0f08', part: 'africa' }],
  seals: [
    { sha256: 'aaaaaaaaaaaaaaaa', fire_id: 'c0f02', state: 'scored', times: { sealed_utc: '2026-11-15T03:22:11Z', minutes_sealed_before_the_pass: 25.8 } },
    { sha256: 'bbbbbbbbbbbbbbbb', fire_id: 'c0f02', state: 'scored', times: { sealed_utc: '2026-11-15T05:40:00Z', minutes_sealed_before_the_pass: 28.2 } },
    { sha256: 'cccccccccccccccc', fire_id: 'c0f12', state: 'waiting_for_the_pass', times: { sealed_utc: '2026-11-15T11:20:00Z', minutes_sealed_before_the_pass: 27.7 } },
  ],
};

test('one row a fire with a seal, its latest seal, newest first', () => {
  const t = rowsFromLive(live, (f) => (f.id === 'c0f02' ? 'Australia' : 'South Sudan'));
  assert.equal(t.followed, 3);
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.rows.map((r) => [r.place, r.locked, r.data, r.fingerprint]), [
    ['South Sudan', '28 minutes before the pass', 'Pass still to come', 'cccccccccc'],
    ['Australia', '28 minutes before the pass', 'Scored', 'bbbbbbbbbb'],
  ]);
  assert.equal(t.checked, 1);
});

test('no route answer gives no table', () => {
  assert.equal(rowsFromLive(null), null);
  assert.equal(rowsFromLive({ fires: [], seals: [] }), null);
});

test('without a country name, the part is said in plain words', () => {
  assert.equal(partWords({ id: 'x', part: 'south_america' }), 'South America');
  assert.equal(rowsFromLive(live).rows[0].place, 'Africa');
});

test('a pass that came but could not be scored says so, with its reason', () => {
  const t = rowsFromLive({ fires: [{ id: 'a', part: 'africa' }], seals: [{ sha256: 'dddddddddddd', fire_id: 'a', state: 'not_scored', reason: 'no rows for the box', times: { sealed_utc: '2026-11-15T09:00:00Z' } }] });
  assert.equal(t.rows[0].data, 'Not scored: no rows for the box');
  const w = rowsFromLive({ fires: [{ id: 'a' }], seals: [{ sha256: 'e', fire_id: 'a', state: 'waiting_for_the_rows', times: { sealed_utc: '2026-11-15T09:00:00Z' } }] });
  assert.equal(w.rows[0].data, 'Waiting for VIIRS data');
});
