// Run with: npm test. The blocks of the compare plane must hold what the answers hold and nothing a person has
// not been shown: no row of the hidden satellite before the reveal, and for a player only what its own looks found.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cutAround, fireBlock, groundOfRun, playerBlocks, threeWays } from './blocks.ts';
import { levelLines } from './marks.ts';

const BOX = [-121, 39, -120, 40];

const run = {
  region: { bbox: BOX, width_km: 85, depth_km: 111, name: 'Somewhere' },
  assets: { dem_hires_f32_url: '/api/runs/x/dem_hires_f32.bin', satellite_url: '/api/runs/x/satellite.jpg' },
  window: { span_hours: 48 },
  observer_passes: {
    frames: [
      {
        frame: 0,
        timestamp_utc: '2020-01-01T10:00:00Z',
        sensor: 'MODIS_AQUA',
        held_out: false,
        is_day: true,
        footprints: [
          [-120.5, 39.5, 1.1, 1.0, 280, 10, 80, 1],
          [-120.51, 39.5, 1.1, 1.0, 280, 10, 80, 1],
        ],
      },
      { frame: 1, timestamp_utc: '2020-01-01T10:20:00Z', sensor: 'VIIRS_SNPP', held_out: true, is_day: true, footprints: [] },
    ],
  },
  belief_frames: {
    url: '/api/runs/x/belief_u8.bin',
    steps: 4,
    step_minutes: 30,
    first_time_utc: '2020-01-01T10:00:00Z',
    grid: { nx: 4, ny: 4, bbox: BOX },
    per_step: [{ expected_burning_cells: 3.4 }, { expected_burning_cells: 5 }, { expected_burning_cells: 6 }, { expected_burning_cells: 7 }],
  },
};

// The same run after the reveal: the hidden pass saw one detection on the fire and one far from it
const FAR = [-120.2, 39.9, 0.4, 0.4, 280, 3, 0, 4];
const revealed = {
  ...run,
  blind_test: {
    verdict: { beats_every_baseline_on: 5, scores_judged: 7 },
    reveal: { overpasses: [{ frame: 1, platform: 'VIIRS_SNPP', time_utc: '2020-01-01T10:20:00Z', footprints: [[-120.5, 39.5, 0.4, 0.4, 280, 3, 0, 4], FAR] }] },
  },
};

test('before the reveal the sharp block is withheld and holds no row', () => {
  const tw = threeWays(run, null);
  assert.ok(tw);
  const sharp = tw.blocks[2];
  assert.equal(sharp.state, 'withheld');
  assert.deepEqual(sharp.marks, []);
  assert.equal(tw.scoreLine, null);
  assert.equal(sharp.label.lines[0], 'hidden');
});

test('after the reveal the sharp block holds the hidden pass and the score line says its kind', () => {
  const tw = threeWays(run, revealed);
  assert.ok(tw);
  const sharp = tw.blocks[2];
  assert.notEqual(sharp.state, 'withheld');
  assert.equal(sharp.marks[0].rows.length, 2);
  assert.equal(tw.scoreLine, 'Ahead of both simple methods on 5 of 7, by plain comparison');
});

test('the estimate shown is the step at or before the hidden pass, never a later one', () => {
  const tw = threeWays(run, null);
  const estimate = tw.blocks[1].marks[0];
  assert.equal(estimate.kind, 'estimate');
  assert.equal(estimate.source.step, 0);
  assert.equal(tw.blocks[1].label.lines[0], '3 cells expected to burn, 375 m grid');
});

test('the cut does not move at the reveal unless a revealed detection lies outside it, and then it grows to keep it', () => {
  const before = threeWays(run, null).blocks[0].ground.cut;
  assert.ok(before, 'the blocks are cut to the fire');
  const after = threeWays(run, revealed).blocks[0].ground.cut;
  assert.ok(FAR[0] > before[2] || FAR[1] > before[3], 'the far detection is outside the first cut');
  assert.ok(FAR[0] >= after[0] && FAR[0] <= after[2] && FAR[1] >= after[1] && FAR[1] <= after[3], 'and inside the cut after the reveal');
  // A reveal with nothing outside leaves the cut where it was
  const near = { ...revealed, blind_test: { ...revealed.blind_test, reveal: { overpasses: [{ ...revealed.blind_test.reveal.overpasses[0], footprints: [[-120.5, 39.5, 0.4, 0.4, 280, 3, 0, 4]] }] } } };
  assert.deepEqual(threeWays(run, near).blocks[0].ground.cut, before);
});

test('a cut stays inside the ground and is square on the ground', () => {
  const ground = groundOfRun(run);
  const cut = cutAround([{ lon: -120.99, lat: 39.01, scanKm: 1, trackKm: 1 }], ground, 3);
  assert.ok(cut[0] >= BOX[0] && cut[1] >= BOX[1] && cut[2] <= BOX[2] && cut[3] <= BOX[3]);
  const sideX = (cut[2] - cut[0]) * 85;
  const sideY = (cut[3] - cut[1]) * 111;
  assert.ok(Math.abs(sideX - sideY) < 1e-6);
});

test('a featured fire says what is drawn: the detections of the run it is given', () => {
  const block = fireBlock({ name: 'Somewhere' }, { id: 'somewhere:2020-01', label: 'January 2020' }, run, { standing: 'never seen' });
  assert.equal(block.id, 'somewhere:2020-01');
  assert.equal(block.marks[0].rows.length, 2);
  assert.deepEqual(block.label, { title: 'January 2020', lines: ['Somewhere', '2 MODIS detections in 48 hours', 'never seen'] });
});

const start = {
  episode: { box: BOX, tiles: [2, 2], budget: 2 },
  observation: { modis: { columns: ['lon', 'lat', 'scan_km', 'track_km', 'frp_mw', 'time_utc', 'platform'], rows: [[-120.5, 39.5, 1, 1, 5, 't', 'MODIS_AQUA']] } },
};
const end = {
  reveal: {
    columns: ['lon', 'lat', 'scan_km', 'track_km', 'frp_mw', 'time_utc', 'platform', 'tile', 'look', 'revealed'],
    rows: [
      [-120.9, 39.9, 0.4, 0.4, 1, 't', 'V', 0, 0, false],
      [-120.1, 39.9, 0.4, 0.4, 1, 't', 'V', 1, 0, false],
      [-120.9, 39.1, 0.4, 0.4, 1, 't', 'V', 2, 1, false],
    ],
  },
  reference: {
    score_start: 0.2,
    random: { seeds: [0, 1], gains: [0.01, 0.03], finals: [0.21, 0.23], actions: [[0, -1], [1, 2]] },
    latest_modis: { gain: 0.05, final: 0.25, actions: [1, 2] },
    least_sure: { gain: -0.004, final: 0.19, actions: [-1, 2] },
    learned: { gain: 0.02, final: 0.22, actions: [0, 0] },
    oracle: { gain: 0.06, final: 0.26, actions: [1, 2] },
  },
};

test('a player block holds only what that player own looks revealed', () => {
  const blocks = playerBlocks(groundOfRun(run), start, end);
  assert.deepEqual(blocks.map((b) => b.label.title), ['Chance', 'Latest MODIS', 'Least sure', 'Learned agent']);
  const found = (i) => blocks[i].marks.find((m) => m.kind === 'detections' && m.instrument === 'viirs').rows;
  assert.equal(found(0).length, 1); // Chance, first draw: tile 0 at look 0
  assert.equal(found(1).length, 2); // tile 1 at look 0, tile 2 at look 1
  assert.deepEqual(found(2).map((r) => [r.lon, r.lat]), [[-120.9, 39.1]]); // only tile 2 at look 1
  assert.equal(found(3).length, 1); // tile 0 twice: the second look found nothing there
  assert.equal(blocks[3].pins[0].text, '1 2');
  assert.equal(blocks[2].label.lines[1], 'score gain -0.004');
  assert.equal(playerBlocks(groundOfRun(run), start, end, { ceiling: true }).length, 5);
});

test('a round on another box than the ground gives no block', () => {
  const elsewhere = { ...start, episode: { ...start.episode, box: [-121, 38, -120, 39] } };
  assert.deepEqual(playerBlocks(groundOfRun(run), elsewhere, end), []);
});

test('the dotted line closes around a single cell that may burn', () => {
  const p = new Float32Array(9);
  p[4] = 1;
  const lines = levelLines(p, 3, 3, 0.5);
  assert.equal(lines.length, 1);
  const chain = lines[0];
  assert.ok(Math.abs(chain[0] - chain[chain.length - 2]) < 1e-9 && Math.abs(chain[1] - chain[chain.length - 1]) < 1e-9, 'it ends where it began');
  // Half way between the middle cell's centre and each neighbour's: on the cell's own edges
  const on = (v) => v >= 1 - 1e-9 && v <= 2 + 1e-9;
  for (let i = 0; i < chain.length; i += 2) assert.ok(on(chain[i]) && on(chain[i + 1]), 'and stays on the middle cell');
});
