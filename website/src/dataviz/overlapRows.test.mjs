import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overlapAxisMax, overlapFromEvidence } from './overlapRows.ts';

// Test B as GET /api/evidence serves it (fresh_test.test_b), trimmed to what the figure reads.
const score = (value, modis) => ({ value, painted_modis: modis, overlap_ratio: modis, better_is: 'higher' });
const evidence = {
  fresh_test: {
    test_b: {
      episodes_scored: 57,
      all: {
        scored_looks: 932,
        scores: { csi_strict_375m: score(0.1314232553848283, 0.15801453974860175), csi_one_cell_tolerance: score(0.2660447411937225, 0.26381435102365336) },
      },
      beside_the_headline: {
        challenger_blend: { against_the_baselines: { scores: { csi_strict_375m: score(0.20400361333339986, 0.158), csi_one_cell_tolerance: score(0.369, 0.2638) } } },
      },
    },
  },
};

test('test B gives MODIS alone 15.8 and 26.4, the model in use 13.1 and 26.6, the new model 20.4 and 36.9', () => {
  const o = overlapFromEvidence(evidence);
  assert.deepEqual(o.rows.map((r) => r.key), ['modis', 'in_use', 'new']);
  const pct = (v) => (v * 100).toFixed(1);
  assert.deepEqual(o.rows.map((r) => [pct(r.exact), pct(r.within)]), [['15.8', '26.4'], ['13.1', '26.6'], ['20.4', '36.9']]);
  assert.equal(o.fires, 57);
  assert.equal(o.looks, 932);
});

test('the loss is kept: the model in use is drawn below MODIS alone where it is below', () => {
  const o = overlapFromEvidence(evidence);
  assert.ok(o.rows[1].exact < o.rows[0].exact);
});

test('the record file shape (reconstruction) is read as well as the route shape (value)', () => {
  const file = structuredClone(evidence);
  for (const s of Object.values(file.fresh_test.test_b.all.scores)) {
    s.reconstruction = s.value;
    delete s.value;
  }
  assert.equal(overlapFromEvidence(file).rows[1].exact.toFixed(4), '0.1314');
});

test('a missing value gives no figure rather than a wrong one', () => {
  const broken = structuredClone(evidence);
  delete broken.fresh_test.test_b.beside_the_headline;
  assert.equal(overlapFromEvidence(broken), null);
  assert.equal(overlapFromEvidence({}), null);
});

test('the axis runs to 40 percent unless a value goes past it', () => {
  assert.equal(overlapAxisMax([{ exact: 0.2, within: 0.369 }]), 40);
  assert.equal(overlapAxisMax([{ exact: 0.2, within: 0.52 }]), 60);
});
