// Run with: npm test. The blocks of the compare plane must hold what the answers hold and nothing a person has
// not been shown: no row of the hidden satellite before the reveal, and for a player only what its own looks found.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chanceOf,
  countWord,
  cutAround,
  fireBlock,
  gainScale,
  groundOfRun,
  playBlocks,
  PLAYERS,
  points,
  readPlay,
  roundBlocks,
  roundPlays,
  roundSeen,
  seenInWindow,
  sameLooks,
  seenRows,
  threeWays,
  twinLine,
} from './blocks.ts';
import { localDayTime, midLon, points as guidePoints } from '../guide/formats.ts';
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
  assert.equal(sharp.label.lines[0], 'Hidden');
});

test('after the reveal the sharp block holds the hidden pass and the score line says its kind', () => {
  const tw = threeWays(run, revealed);
  assert.ok(tw);
  const sharp = tw.blocks[2];
  assert.notEqual(sharp.state, 'withheld');
  assert.equal(sharp.marks[0].rows.length, 2);
  assert.equal(tw.scoreLine, 'Ahead of both simple methods on 5 of 7 scores, by plain comparison');
});

test('the estimate shown is the step at or before the hidden pass, never a later one', () => {
  const tw = threeWays(run, null);
  const estimate = tw.blocks[1].marks[0];
  assert.equal(estimate.kind, 'estimate');
  assert.equal(estimate.source.step, 0);
  assert.equal(tw.blocks[1].label.lines[0], '3 squares expected to burn, 375 m across, from MODIS alone');
});

test('the estimate frames the cells the model declared for the hidden pass, and only on its own grid', () => {
  const declared = { ...run, declared_cells: { grid: { nx: 4, ny: 4 }, looks: [{ frame: 1, cells: [5, 6, 9] }, { frame: 3, cells: [0] }] } };
  const estimate = threeWays(declared, null).blocks[1];
  assert.deepEqual(estimate.marks[0].frames, [5, 6, 9]);
  assert.equal(estimate.label.lines[0], '3 white frames, 375 m across, from MODIS alone');
  // A list on another grid is not drawn on this one
  const other = { ...run, declared_cells: { grid: { nx: 8, ny: 8 }, looks: [{ frame: 1, cells: [5] }] } };
  assert.equal(threeWays(other, null).blocks[1].marks[0].frames, undefined);
  // A run with no list keeps the squares alone
  assert.equal(threeWays(run, null).blocks[1].marks[0].frames, undefined);
});

test('a pass is said as the guide says it: the day and the clock by the sun at the fire, no craft and no UTC', () => {
  const lon = midLon(BOX);
  const tw = threeWays(run, revealed);
  assert.equal(tw.blocks[0].label.lines[1], localDayTime('2020-01-01T10:00:00Z', lon));
  assert.equal(tw.blocks[1].label.lines[1], `For the pass of ${localDayTime('2020-01-01T10:20:00Z', lon)}`);
  assert.equal(tw.blocks[2].label.lines[1], localDayTime('2020-01-01T10:20:00Z', lon));
  const words = JSON.stringify(tw.blocks.map((b) => b.label));
  assert.ok(!/UTC|AQUA|TERRA|SNPP|NOAA|Suomi/i.test(words), words);
});

test('the cut comes from the coarse satellite rows only: the hidden satellite never moves it, before or after the reveal', () => {
  const before = threeWays(run, null).blocks[0].ground.cut;
  assert.ok(before, 'the blocks are cut to the fire');
  // The revealed pass holds a detection far outside the cut: the cut stays where the coarse rows put it
  assert.ok(FAR[0] > before[2] || FAR[1] > before[3], 'the far detection is outside the cut');
  const after = threeWays(run, revealed);
  for (const block of after.blocks) assert.deepEqual(block.ground.cut, before);
  // Whatever the hidden satellite saw, the cut is the same
  const other = { ...revealed, blind_test: { ...revealed.blind_test, reveal: { overpasses: [{ ...revealed.blind_test.reveal.overpasses[0], footprints: [[-120.9, 39.1, 0.4, 0.4, 280, 3, 0, 4]] }] } } };
  assert.deepEqual(threeWays(run, other).blocks[2].ground.cut, before);
  // And what lies outside it is counted on the label, not passed over
  assert.equal(after.blocks[2].label.lines.at(-1), '1 of them outside this cut');
  assert.equal(after.blocks[2].label.lines[0], '2 detections, 375 m across (VIIRS)');
});

test('the pass compared at follows the pass on show', () => {
  const two = {
    ...run,
    observer_passes: {
      frames: [
        ...run.observer_passes.frames,
        { frame: 2, timestamp_utc: '2020-01-01T11:00:00Z', sensor: 'MODIS_TERRA', held_out: false, is_day: true, footprints: [[-120.5, 39.5, 1.1, 1.0, 280, 10, 80, 0]] },
        { frame: 3, timestamp_utc: '2020-01-01T11:30:00Z', sensor: 'VIIRS_NOAA20', held_out: true, is_day: true, footprints: [] },
      ],
    },
  };
  assert.equal(threeWays(two, null).timeUtc, '2020-01-01T11:30:00Z');
  assert.equal(threeWays(two, null, { at: 2 }).timeUtc, '2020-01-01T10:20:00Z');
  assert.equal(threeWays(two, null, { at: 3 }).timeUtc, '2020-01-01T11:30:00Z');
  assert.equal(threeWays(two, null, { at: 0 }).timeUtc, '2020-01-01T11:30:00Z');
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
  // The visitor's own looks, as pairs of the pass and the square, and what they added
  looks_taken: [[0, 1], [1, 3]],
  gain: 0.015,
  score_start: 0.2,
  reference: {
    score_start: 0.2,
    random: { seeds: [0, 1], gains: [0.01, 0.03], finals: [0.21, 0.23], actions: [[0, -1], [1, 2]] },
    latest_modis: { gain: 0.05, final: 0.25, actions: [1, 2] },
    least_sure: { gain: -0.004, final: 0.19, actions: [-1, 2] },
    learned: { gain: 0.02, final: 0.22, actions: [0, 0] },
    oracle: { gain: 0.06, final: 0.26, actions: [1, 2] },
  },
};

test('a round becomes one block per player, the visitor first, each with only what its own looks revealed', () => {
  const blocks = roundBlocks(groundOfRun(run), start, end);
  assert.deepEqual(blocks.map((b) => b.label.title), ['You', 'Chance', 'Follow MODIS', 'Least Sure', 'Learned Player', 'Sees the Answer']);
  const found = (i) => blocks[i].marks.find((m) => m.kind === 'detections' && m.instrument === 'viirs').rows;
  assert.deepEqual(found(0).map((r) => [r.lon, r.lat]), [[-120.1, 39.9]]); // the visitor: square 1 at pass 0; square 3 at pass 1 held nothing
  assert.equal(found(1).length, 1); // Chance, the first of its rounds: square 0 at pass 0
  assert.equal(found(2).length, 2); // square 1 at pass 0, square 2 at pass 1
  assert.deepEqual(found(3).map((r) => [r.lon, r.lat]), [[-120.9, 39.1]]); // only square 2 at pass 1
  assert.equal(found(4).length, 1); // square 0 twice: the second look found nothing there
  assert.equal(blocks[4].pins[0].text, '1 2');
  assert.equal(blocks[3].label.lines[1], 'Overlap down 0.4 points');
  assert.equal(blocks[0].label.lines[1], 'Overlap up 1.5 points');
  // The last is named for what it does and carries the line that says it is no fair player, whatever its looks equal
  assert.match(blocks[5].label.lines[2], /^Not a fair player/);
  assert.ok(!blocks[2].label.lines.some((l) => l.startsWith('The same looks')));
  // Asked without the visitor or without the last player
  assert.deepEqual(roundPlays(start, end, { you: false, seesTheAnswer: false }).map((p) => p.id), ['random', 'latest_modis', 'least_sure', 'learned']);
  assert.deepEqual(roundSeen(start).map((r) => r.lon), [-120.5]);
});

test('Chance is the mean of its rounds with their range, and the looks drawn are said to be one of them', () => {
  const chance = roundPlays(start, end).find((p) => p.id === 'random');
  assert.deepEqual(chance.draws, [0.01, 0.03]);
  assert.equal(chance.gain, 0.01);
  const { mean, least, most, rounds } = chanceOf(chance.draws);
  assert.ok(Math.abs(mean - 0.02) < 1e-12);
  assert.deepEqual([least, most, rounds], [0.01, 0.03, 2]);
  assert.equal(chanceOf([]), null);
  const lines = roundBlocks(groundOfRun(run), start, end)[1].label.lines;
  assert.equal(lines[1], 'Overlap up 2.0 points on average over two rounds of random looks, from +1.0 to +3.0');
  assert.equal(lines[2], 'Drawn here: one of the two, overlap up 1.0 points');
  assert.equal(countWord(10), 'ten');
  assert.equal(countWord(13), '13');
});

test('what the looks found can be withheld: the block then holds no row of the hidden satellite', () => {
  for (const block of roundBlocks(groundOfRun(run), start, end, { found: false })) {
    assert.equal(block.marks.some((m) => m.kind === 'detections' && m.instrument === 'viirs'), false);
    assert.ok(!block.label.lines.some((l) => l.includes('found')));
    // Where it looked and what every player could see stay
    assert.ok(block.marks.some((m) => m.kind === 'tiles'));
    assert.ok(block.marks.some((m) => m.kind === 'detections' && m.instrument === 'modis'));
  }
  const [withheld] = playBlocks(groundOfRun(run), [play], { found: false });
  assert.equal(withheld.marks.some((m) => m.instrument === 'viirs'), false);
  assert.deepEqual(withheld.label.lines, ['2 looks', 'Overlap up 3.0 points']);
});

test('a round on another box than the ground gives no block', () => {
  const elsewhere = { ...start, episode: { ...start.episode, box: [-121, 38, -120, 39] } };
  assert.deepEqual(roundBlocks(groundOfRun(run), elsewhere, end), []);
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

// A play as the play route answers it, cut down to what the page reads: two looks taken, one look passed
const play = {
  play: {
    player: { id: 'least_sure', label: 'Least sure' },
    episode: { box: BOX, tiles: [2, 2], budget: 2 },
    score_start: 0.25,
    steps: [
      { decision: 0, look: { platform: 'VIIRS_SNPP', time_utc: '2020-01-01T10:00:00Z', is_day: true }, chosen_tile: -1, why: 'not one of the looks the budget is spread over', spent: false, revealed: null, reward: 0 },
      {
        decision: 1,
        look: { platform: 'VIIRS_SNPP', time_utc: '2020-01-01T21:00:00Z', is_day: false },
        chosen_tile: 3,
        why: 'the tile with the highest score',
        spent: true,
        revealed: { pixels: 2, columns: ['lon', 'lat', 'scan_km', 'track_km', 'frp_mw', 'time_utc', 'platform'], rows: [[-120.2, 39.2, 0.4, 0.4, 3, 't', 'V'], [-120.21, 39.2, 0.4, 0.4, 3, 't', 'V']] },
        reward: 0.01,
      },
      {
        decision: 2,
        look: { platform: 'VIIRS_NOAA20', time_utc: '2020-01-02T10:00:00Z', is_day: true },
        chosen_tile: 3,
        why: 'the tile with the highest score',
        spent: true,
        revealed: { pixels: 1, columns: ['lon', 'lat', 'scan_km', 'track_km', 'frp_mw', 'time_utc', 'platform'], rows: [[-120.3, 39.3, 0.4, 0.4, 3, 't', 'V']] },
        reward: 0.02,
      },
    ],
    score_end: 0.28,
    gain: 0.03,
  },
};

test('a play becomes a block with only the detections its own looks handed over, in order', () => {
  const read = readPlay(play);
  assert.deepEqual(read.looks.map((l) => [l.decision, l.tile, l.found.length]), [[1, 3, 2], [2, 3, 1]]);
  const [block] = playBlocks(groundOfRun(run), [play]);
  assert.equal(block.id, 'least_sure');
  assert.deepEqual(block.label, { title: 'Least Sure', lines: ['3 detections found in 2 looks', 'Overlap up 3.0 points'] });
  assert.equal(block.pins[0].text, '1 2');
  // Watched look by look: after the first look only its detections, and the gain so far
  const [first] = playBlocks(groundOfRun(run), [play], { looks: 1 });
  assert.equal(first.marks.find((m) => m.kind === 'detections' && m.instrument === 'viirs').rows.length, 2);
  assert.deepEqual(first.label.lines, ['2 detections found in 1 look']);
  const [none] = playBlocks(groundOfRun(run), [play], { looks: 0 });
  assert.equal(none.marks.find((m) => m.kind === 'detections' && m.instrument === 'viirs').rows.length, 0);
});

test('two plays with the same looks: the second says so, and only once every look stands', () => {
  const twin = { play: { ...play.play, player: { id: 'latest_modis', label: 'Latest MODIS' } } };
  const blocks = playBlocks(groundOfRun(run), [play, twin]);
  assert.ok(!blocks[0].label.lines.some((l) => l.startsWith('The same looks')));
  assert.equal(blocks[1].label.lines[2], 'The same looks as Least Sure');
  assert.ok(!playBlocks(groundOfRun(run), [play, twin], { looks: 1 })[1].label.lines.some((l) => l.startsWith('The same looks')));
});

test('a play on other ground than the run gives no block', () => {
  const elsewhere = { play: { ...play.play, episode: { ...play.play.episode, box: [-122, 39, -121, 40] } } };
  assert.deepEqual(playBlocks(groundOfRun(run), [elsewhere]), []);
});

test('what every player could see never holds a row of the sharp satellite, even from a run that shows it', () => {
  const allSensors = {
    ...run,
    observer_passes: {
      sensor_codes: { 1: 'MODIS_AQUA', 4: 'VIIRS_SNPP' },
      frames: [
        { frame: 0, timestamp_utc: '2020-01-01T10:00:00Z', sensor: 'MODIS_AQUA', held_out: false, is_day: true, footprints: [[-120.5, 39.5, 1.1, 1.0, 280, 10, 80, 1]] },
        { frame: 1, timestamp_utc: '2020-01-01T10:20:00Z', sensor: 'VIIRS_SNPP', held_out: false, is_day: true, footprints: [[-120.4, 39.4, 0.4, 0.4, 280, 3, 0, 4]] },
      ],
    },
  };
  assert.deepEqual(seenRows(allSensors).map((r) => r.lon), [-120.5]);
  // The same holds for a featured fire's block
  assert.equal(fireBlock({ name: 'Somewhere' }, { id: 'f', label: 'January 2020' }, allSensors).marks[0].rows.length, 1);
});

test('a gain is said in points of agreement exactly as the guide says it', () => {
  assert.equal(points(0.1182), '+11.8');
  for (const g of [0.1182, -0.0111, -0.0003, 0, 0.0247]) assert.equal(points(g), guidePoints(g));
  assert.equal(countWord(10), 'ten');
});

test('a block takes the run terrain pack image when the run names one, and satellite.jpg only when it does not', () => {
  assert.equal(groundOfRun(run).imageUrl, '/api/runs/x/satellite.jpg');
  assert.equal(groundOfRun(run).imageCredit, null);
  const packed = {
    ...run,
    assets: {
      ...run.assets,
      terrain_pack: {
        ortho: { url: '/api/runs/x/terrain/ortho_8192.jpg', size: 8192, attribution: 'USDA NAIP' },
        ortho_fallback: { url: '/api/runs/x/terrain/ortho_4096.jpg', size: 4096 },
      },
    },
  };
  // The smaller copy of the pack image, and the pack's own credit
  assert.equal(groundOfRun(packed).imageUrl, '/api/runs/x/terrain/ortho_4096.jpg');
  assert.equal(groundOfRun(packed).imageCredit, 'USDA NAIP');
  const noSmall = { ...packed, assets: { ...packed.assets, terrain_pack: { ortho: packed.assets.terrain_pack.ortho } } };
  assert.equal(groundOfRun(noSmall).imageUrl, '/api/runs/x/terrain/ortho_8192.jpg');
});

test('gain bars share one scale, the largest gain among them, and there is none when nothing was gained', () => {
  assert.equal(gainScale([0.0247, 0.1015, 0.1144, 0.1144, 0.1156]), 0.1156);
  assert.equal(gainScale([0.02, null, 0.3]), 0.3);
  assert.equal(gainScale([-0.01, 0, null]), null);
  assert.equal(gainScale([]), null);
});

test('the players carry the page\'s names; none is called a ceiling or given as a share of another', () => {
  assert.deepEqual(PLAYERS.map((p) => p.name), ['Chance', 'Follow MODIS', 'Least Sure', 'Learned Player', 'Sees the Answer']);
  const answer = { play: { ...play.play, player: { id: 'oracle', label: 'Oracle' } } };
  const words = JSON.stringify([
    ...playBlocks(groundOfRun(run), [play, answer]).map((b) => b.label),
    ...roundBlocks(groundOfRun(run), start, end).map((b) => b.label),
  ]);
  assert.ok(!/ceiling/i.test(words));
  assert.ok(!words.includes('%'));
  assert.ok(!/oracle/i.test(words));
});

test('a player whose looks equal an earlier one says so in the same words, the learned player too', () => {
  assert.equal(twinLine('Least Sure'), 'The same looks as Least Sure');
  const learned = { play: { ...play.play, player: { id: 'learned', label: 'Learned' } } };
  assert.equal(playBlocks(groundOfRun(run), [play, learned])[1].label.lines[2], 'The same looks as Least Sure');
});

test('the player whose looks equal an earlier player is named with that player, the first is not', () => {
  const a = readPlay(play);
  const b = readPlay({ play: { ...play.play, player: { id: 'learned', label: 'Learned agent' } } });
  const twins = sameLooks([a, b]);
  assert.equal(twins.get('learned'), 'Least Sure');
  assert.equal(twins.has('least_sure'), false);
});

test('the board of a player dims the ground it did not look at', () => {
  const [block] = playBlocks(groundOfRun(run), [play]);
  const tiles = block.marks.find((m) => m.kind === 'tiles');
  assert.equal(tiles.veil, true);
  assert.deepEqual([...new Set(tiles.looked)], [3]);
});

test('a round as the page keeps it (its looks as player.taken, its reveal grouped by pass) gives the same blocks', () => {
  // The same round as above, in the shape the page's round stores: no table, no square per detection
  const pageStart = { episode: { box: BOX, tiles: [2, 2], budget: 2, first_overpass_utc: '2020-01-01T10:00:00Z', last_overpass_utc: '2020-01-01T10:30:00Z' }, looks: [], score_start: 0.2 };
  const fp = (lon, lat) => [lon, lat, 0.4, 0.4, 0, 1, 0, 4];
  const pageEnd = {
    player: { taken: [{ decision: 0, tile: 1 }, { decision: 1, tile: 3 }], gain: 0.015 },
    reveal: { overpasses: [{ look: 0, footprints: [fp(-120.9, 39.9), fp(-120.1, 39.9)] }, { look: 1, footprints: [fp(-120.9, 39.1)] }] },
    reference: end.reference,
  };
  const blocks = roundBlocks(groundOfRun(run), pageStart, pageEnd);
  assert.deepEqual(blocks.map((b) => b.label.title), ['You', 'Chance', 'Follow MODIS', 'Least Sure', 'Learned Player', 'Sees the Answer']);
  const found = (i) => blocks[i].marks.find((m) => m.kind === 'detections' && m.instrument === 'viirs').rows;
  // Each detection counts for the square it lies in, as the route's table says it
  assert.deepEqual(found(0).map((r) => [r.lon, r.lat]), [[-120.1, 39.9]]);
  assert.equal(found(1).length, 1);
  assert.equal(found(2).length, 2);
  assert.deepEqual(found(3).map((r) => [r.lon, r.lat]), [[-120.9, 39.1]]);
  assert.equal(blocks[0].label.lines[1], 'Overlap up 1.5 points');
  assert.deepEqual(roundPlays(pageStart, pageEnd)[0].window, { from: '2020-01-01T10:00:00Z', to: '2020-01-01T10:30:00Z' });
});

test('what every player could see is the run coarse rows inside the round window, never a sharp row', () => {
  assert.deepEqual(seenInWindow(run, { from: '2020-01-01T09:59:00Z', to: '2020-01-01T10:30:00Z' }).map((r) => r.lon), [-120.5, -120.51]);
  assert.deepEqual(seenInWindow(run, { from: '2020-01-02T00:00:00Z', to: '2020-01-03T00:00:00Z' }), []);
});
