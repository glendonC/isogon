// The public build's copies for the model in the visitor's browser (scripts/browser-files.mjs): the runtime's files and
// the packer's archives are copied only when each is the file pinned or listed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { copyPack, copyRuntime } from '../../scripts/browser-files.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');

function folder() {
  return mkdtempSync(path.join(tmpdir(), 'browser-files-'));
}

function write(dir, rel, text) {
  const p = path.join(dir, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, text);
  return Buffer.from(text);
}

test('the runtime is copied when every file is the one pinned, and stops at one that is not', () => {
  const from = folder();
  const to = folder();
  try {
    const a = write(from, 'pyodide.js', 'loader');
    const b = write(from, 'pyodide.asm.wasm', 'wasm bytes');
    const pins = { files: [{ name: 'pyodide.js', bytes: a.length, sha256: sha(a) }, { name: 'pyodide.asm.wasm', bytes: b.length, sha256: sha(b) }] };
    assert.equal(copyRuntime(pins, from, to), a.length + b.length);
    assert.equal(readFileSync(path.join(to, 'pyodide.asm.wasm'), 'utf8'), 'wasm bytes');

    write(from, 'pyodide.asm.wasm', 'wasm bytez');                       // same size, other bytes
    assert.throws(() => copyRuntime(pins, from, folder()), /sha256/);
    write(from, 'pyodide.asm.wasm', 'short');
    assert.throws(() => copyRuntime(pins, from, folder()), /bytes/);
    assert.throws(() => copyRuntime({ files: [{ name: '../x', bytes: 1, sha256: 'x' }] }, from, folder()), /plain file name/);
  } finally {
    rmSync(from, { recursive: true, force: true });
    rmSync(to, { recursive: true, force: true });
  }
});

test('the browser pack is copied with its manifest when every archive is the one listed', () => {
  const from = folder();
  const to = folder();
  try {
    const core = write(from, 'core.zip', 'core archive');
    const place = write(from, 'places/plumas_ca.zip', 'a place');
    const manifest = {
      version: 1,
      core: { file: 'core.zip', bytes: core.length, sha256: sha(core) },
      places: { plumas_ca: { file: 'places/plumas_ca.zip', start: '2012-08-10', bytes: place.length, sha256: sha(place) } },
      replay_only: { lytton_bc: 'the closed test fire' },
    };
    write(from, 'browser-pack.json', JSON.stringify(manifest));
    const got = copyPack(from, to);
    assert.deepEqual(got.places, ['plumas_ca']);
    assert.deepEqual(got.replayOnly, ['lytton_bc']);
    assert.ok(existsSync(path.join(to, 'places', 'plumas_ca.zip')));
    assert.ok(existsSync(path.join(to, 'browser-pack.json')));

    write(from, 'places/plumas_ca.zip', 'a placf');                    // an archive changed after the pack
    assert.throws(() => copyPack(from, folder()), /sha256/);

    write(from, 'browser-pack.json', JSON.stringify({ ...manifest, places: { x: { file: '../.env.zip', bytes: 1, sha256: 'x' } } }));
    assert.throws(() => copyPack(from, folder()), /not a zip inside the pack/);
    write(from, 'browser-pack.json', JSON.stringify({ ...manifest, core: undefined }));
    assert.throws(() => copyPack(from, folder()), /no core/);
  } finally {
    rmSync(from, { recursive: true, force: true });
    rmSync(to, { recursive: true, force: true });
  }
});

test('with a pack, what the browser makes at the packed starts leaves the recording, and nothing else', async () => {
  const { leaveOutComputedRuns, COMPUTED_IN_THE_BROWSER, SMALLER_PICTURE } = await import('../../scripts/browser-files.mjs');
  const held = 'plumas_ca_firms_20120810T0619_holdoutviirs_challenger_blend';
  const held2017 = 'okefenokee_ga_firms_20170502T0400_holdoutviirs_challenger_blend';
  const shown = 'plumas_ca_firms_20120810T0619_allsensors';
  const other = 'lytton_bc_firms_20230818T0554_holdoutviirs_challenger_blend';
  const run = (r, s) => `POST /api/reconstruct {"cloud_override":null,"holdout":"viirs","holdout_viirs":true,"region_id":"${r}","source":"firms","start":"${s}"}`;
  const answers = { [run('plumas_ca', '2012-08-10')]: { run_id: held }, [run('okefenokee_ga', '2017-05-02')]: { run_id: held2017 } };
  const index = {
    recorded_utc: '2026-11-15T13:19:37Z',
    rounds: [{ episode_from: { region_id: 'plumas_ca', start: '2012-08-10' }, round_id: 'nl-rec-aaaa', one_look: { decision: 3, actions: [-1, 0] }, line: [{ decision: 0, action: -1 }] },
             { episode_from: { region_id: 'okefenokee_ga', start: '2017-05-02' }, round_id: 'nl-rec-bbbb', one_look: { decision: 1, actions: [-1] }, line: [] }],
    entries: {
      [run('plumas_ca', '2012-08-10')]: { file: 'files/answer.json' },
      [run('okefenokee_ga', '2017-05-02')]: { file: 'files/answer2017.json' },
      [`GET /api/runs/${held}/reconstruction_u8.bin`]: { file: 'files/r.bin' },
      [`GET /api/runs/${held}/belief_u8.bin`]: { file: 'files/b.bin' },
      [`GET /api/runs/${held}/export.csv`]: { file: 'files/shared.csv' },
      [`GET /api/runs/${held}/dem_f32.bin`]: { file: 'files/dem.bin' },
      [`GET /api/runs/${held}/terrain/usgs_naip_ortho_4096.jpg`]: { file: 'files/o4.jpg' },
      [`GET /api/runs/${held}/terrain/usgs_naip_ortho_8192.jpg`]: { file: 'files/o8.jpg' },
      [`GET /api/runs/${held2017}/reconstruction_u8.bin`]: { file: 'files/r2017.bin' },
      [`GET /api/runs/${shown}/reconstruction_u8.bin`]: { file: 'files/shown.bin' },
      [`GET /api/runs/${shown}/export.csv`]: { file: 'files/shared.csv' },
      [`GET /api/runs/${other}/reconstruction_u8.bin`]: { file: 'files/other.bin' },
      'POST /api/env/next_look/step {"action":-1,"decision":0,"round_id":"nl-rec-aaaa"}': { file: 'files/s0.json' },
      'GET /api/env/next_look/state?round_id=nl-rec-aaaa': { file: 'files/st.json' },
      'POST /api/env/next_look/step {"action":-1,"decision":0,"round_id":"nl-rec-bbbb"}': { file: 'files/s2017.json' },
    },
  };
  const got = leaveOutComputedRuns(index, { plumas_ca: '2012-08-10', okefenokee_ga: '2012-04-04' }, (k) => answers[k] ?? null);
  assert.equal(got.entries, 5);
  assert.deepEqual(got.leftOut, ['files/b.bin', 'files/r.bin', 'files/s0.json', 'files/st.json']);   // the shared export stays
  assert.deepEqual(got.index.entries[`GET /api/runs/${held}/reconstruction_u8.bin`], { withheld: COMPUTED_IN_THE_BROWSER });
  for (const kept of [`GET /api/runs/${held}/dem_f32.bin`, `GET /api/runs/${held}/terrain/usgs_naip_ortho_8192.jpg`,
                      `GET /api/runs/${held2017}/reconstruction_u8.bin`, `GET /api/runs/${shown}/reconstruction_u8.bin`,
                      `GET /api/runs/${other}/reconstruction_u8.bin`, 'POST /api/env/next_look/step {"action":-1,"decision":0,"round_id":"nl-rec-bbbb"}']) {
    assert.ok(got.index.entries[kept].file, kept);              // another start, another place, all shown, the terrain
  }
  assert.equal(got.index.rounds[0].one_look, null);              // the packed round names no recorded look
  assert.deepEqual(got.index.rounds[1].one_look, { decision: 1, actions: [-1] });
  assert.equal(got.index.recorded_utc, index.recorded_utc);
  assert.equal(index.entries[`GET /api/runs/${held}/reconstruction_u8.bin`].file, 'files/r.bin');   // the input is not changed

  const small = leaveOutComputedRuns(index, {}, () => null, { ortho8192: false });
  assert.deepEqual(small.leftOut, ['files/o8.jpg']);
  assert.deepEqual(small.index.entries[`GET /api/runs/${held}/terrain/usgs_naip_ortho_8192.jpg`], { withheld: SMALLER_PICTURE });
});
