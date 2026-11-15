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

test('with a pack, what the browser makes of the packed places\' held-out runs leaves the recording, and nothing else', async () => {
  const { leaveOutComputedRuns, COMPUTED_IN_THE_BROWSER } = await import('../../scripts/browser-files.mjs');
  const held = 'plumas_ca_firms_20120810T0619_holdoutviirs_challenger_blend';
  const shown = 'plumas_ca_firms_20120810T0619_allsensors';
  const other = 'lytton_bc_firms_20230818T0554_holdoutviirs_challenger_blend';
  const index = {
    recorded_utc: '2026-11-15T13:19:37Z',
    entries: {
      [`GET /api/runs/${held}/reconstruction_u8.bin`]: { file: 'files/r.bin' },
      [`GET /api/runs/${held}/belief_u8.bin`]: { file: 'files/b.bin' },
      [`GET /api/runs/${held}/export.csv`]: { file: 'files/shared.csv' },
      [`GET /api/runs/${held}/dem_f32.bin`]: { file: 'files/dem.bin' },
      [`GET /api/runs/${held}/terrain/usgs_naip_ortho_4096.jpg`]: { file: 'files/o.jpg' },
      [`GET /api/runs/${shown}/reconstruction_u8.bin`]: { file: 'files/shown.bin' },
      [`GET /api/runs/${shown}/export.csv`]: { file: 'files/shared.csv' },
      [`GET /api/runs/${other}/reconstruction_u8.bin`]: { file: 'files/other.bin' },
      'POST /api/reconstruct {"region_id":"plumas_ca"}': { file: 'files/answer.json' },
    },
  };
  const got = leaveOutComputedRuns(index, ['plumas_ca']);
  assert.equal(got.entries, 3);
  assert.deepEqual(got.leftOut, ['files/b.bin', 'files/r.bin']);            // the shared export stays: another entry names it
  assert.deepEqual(got.index.entries[`GET /api/runs/${held}/reconstruction_u8.bin`], { withheld: COMPUTED_IN_THE_BROWSER });
  assert.equal(got.index.entries[`GET /api/runs/${held}/dem_f32.bin`].file, 'files/dem.bin');
  assert.equal(got.index.entries[`GET /api/runs/${shown}/reconstruction_u8.bin`].file, 'files/shown.bin');
  assert.equal(got.index.entries[`GET /api/runs/${other}/reconstruction_u8.bin`].file, 'files/other.bin');
  assert.equal(got.index.recorded_utc, index.recorded_utc);
  assert.deepEqual(got.index.computed_in_the_browser.places, ['plumas_ca']);
  assert.equal(index.entries[`GET /api/runs/${held}/reconstruction_u8.bin`].file, 'files/r.bin');   // the input is not changed
});
