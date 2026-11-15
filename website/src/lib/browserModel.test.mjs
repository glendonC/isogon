// The page's bridge to the model in the visitor's browser (browserModel.ts), with a worker that answers as the real
// one does (public/runtime/model-worker.js): what it computes, when the recording answers instead, and the addresses a
// run made there is drawn from.
import assert from 'node:assert/strict';
import test from 'node:test';

import { answerSourceLine, servedPictures } from './api.ts';
import { BrowserModel, BrowserModelUnavailable, BrowserRefusal, splitPythonError, withPageAssets } from './browserModel.ts';

const MANIFEST = {
  core: { file: 'core.zip', bytes: 1, sha256: 'a' },
  places: { plumas_ca: { file: 'places/plumas_ca.zip', start: '2012-08-10', bytes: 1, sha256: 'b' } },
  replay_only: { lytton_bc: 'its page fire is the closed test fire' },
};

/** A worker answering each op with `answer(op, args)`: a value, an Error (the worker's failure, `where` in its
 * `where`), or undefined (no answer at all). */
function fakeWorker(answer) {
  const sent = [];
  const w = {
    sent,
    onmessage: null,
    onerror: null,
    terminated: false,
    terminate() { this.terminated = true; },
    postMessage(msg) {
      sent.push(msg);
      queueMicrotask(() => {
        w.onmessage?.({ data: { id: msg.id, step: 'running' } });
        const v = answer(msg.op, msg.args);
        if (v === undefined) return;
        if (v instanceof Error) w.onmessage?.({ data: { id: msg.id, ok: false, error: v.message, where: v.where ?? 'running' } });
        else w.onmessage?.({ data: { id: msg.id, ok: true, value: typeof v === 'string' ? v : JSON.stringify(v) } });
      });
    },
  };
  return w;
}

function model(answer, extra = {}) {
  const w = fakeWorker(answer);
  const m = new BrowserModel({ workerUrl: 'w.js', packUrl: 'run/browser-pack.json', makeWorker: () => w, fetchJson: async () => MANIFEST,
                               environmentRefusal: () => null, ...extra });
  return { m, w };
}

const RUN = { run_id: 'plumas_ca_firms_20120810T0619_holdoutviirs_challenger_blend', assets: {}, belief_frames: { steps: 2, grid: { nx: 2, ny: 2 } } };

test('a held-out run and its reveal are computed by the worker, the reveal asked by the first answer\'s run id', async () => {
  const { m, w } = model((op, a) => (op === 'held_out_run' ? RUN : op === 'reveal' ? { ...RUN, blind_test: { verdict: { scores_judged: 7 } } } : undefined));
  assert.equal(await m.holds('plumas_ca'), true);
  assert.equal((await m.run('plumas_ca', '2012-08-10', false)).run_id, RUN.run_id);
  const rev = await m.run('plumas_ca', '2012-08-10', true);
  assert.equal(rev.blind_test.verdict.scores_judged, 7);
  assert.deepEqual(w.sent.map((s) => s.op), ['held_out_run', 'reveal']);
  assert.equal(w.sent[1].args.run_id, RUN.run_id);
  assert.equal(m.state, 'ready');
});

test('a reveal after the worker let the run go makes the run again, then reveals it', async () => {
  let reveals = 0;
  const { m, w } = model((op) => {
    if (op === 'held_out_run') return RUN;
    reveals += 1;
    return reveals === 1 ? new Error(`LookupError: no run ${RUN.run_id} is kept here: ask held_out_run again`) : { ...RUN, revealed: true };
  });
  await m.run('plumas_ca', '2012-08-10', false);
  assert.equal((await m.run('plumas_ca', '2012-08-10', true)).revealed, true);
  assert.deepEqual(w.sent.map((s) => s.op), ['held_out_run', 'reveal', 'held_out_run', 'reveal']);
});

test('an answer later than the budget takes the recording, and the model is not failed for it', async () => {
  const { m } = model(() => undefined, { budgetMs: 30 });
  await assert.rejects(m.run('plumas_ca', '2012-08-10', false), (e) => e instanceof BrowserModelUnavailable && /took over/.test(e.why));
  assert.notEqual(m.state, 'failed');
});

test('a runtime that does not load fails the model for the page, and every place then replays', async () => {
  const { m, w } = model(() => Object.assign(new Error('WebAssembly.instantiate(): out of memory'), { where: 'runtime' }));
  await assert.rejects(m.run('plumas_ca', '2012-08-10', false), BrowserModelUnavailable);
  assert.equal(m.state, 'failed');
  assert.match(m.why, /did not load in this browser/);
  assert.equal(w.terminated, true);
  assert.equal(await m.holds('plumas_ca'), false);
});

test('the closed rule\'s refusal made in the browser is the route\'s refusal, with its kind and words', async () => {
  const { m } = model(() => new Error('backend.server_next_look.ClosedWindow: this window is closed: a test fire of 2021'));
  await assert.rejects(m.run('plumas_ca', '2021-07-22', false), (e) => e instanceof BrowserRefusal && e.kind === 'ClosedWindow'
    && e.message === 'this window is closed: a test fire of 2021');
  assert.notEqual(m.state, 'failed');
});

test('a place the pack does not hold replays, with the manifest\'s reason; a device short of memory replays every place', async () => {
  const { m } = model(() => RUN);
  assert.equal(await m.holds('lytton_bc'), false);
  assert.equal(await m.replayReason('lytton_bc'), 'its page fire is the closed test fire');
  const { m: small } = model(() => RUN, { environmentRefusal: () => 'this device says it has 2 GB of memory, under the 4 GB the model needs' });
  assert.equal(await small.holds('plumas_ca'), false);
  assert.equal(small.state, 'failed');
  const { m: none } = model(() => RUN, { fetchJson: async () => null });
  assert.equal(await none.holds('plumas_ca'), false);
  assert.equal(none.state, 'off');
});

test('a run made in the browser is drawn from its own bytes and the recording\'s terrain', () => {
  const recorded = { assets: { dem_f32_url: '/api/runs/r/dem_f32.bin', terrain_pack: { ortho: { url: '/api/runs/r/terrain/o.jpg' } },
                               reconstruction_u8_url: '/api/runs/r/reconstruction_u8.bin' }, imagery: { chosen: 'usgs_naip' } };
  const files = { 'reconstruction_u8.bin': 'blob:a', 'belief_u8.bin': 'blob:b', 'export.geojson': 'blob:c', 'export.csv': 'blob:d' };
  const page = withPageAssets(RUN, recorded, files);
  assert.equal(page.assets.reconstruction_u8_url, 'blob:a');
  assert.equal(page.assets.export_csv_url, 'blob:d');
  assert.equal(page.assets.dem_f32_url, '/api/runs/r/dem_f32.bin');
  assert.deepEqual(page.assets.terrain_pack, recorded.assets.terrain_pack);
  assert.equal(page.belief_frames.url, 'blob:b');
  assert.deepEqual(page.imagery, { chosen: 'usgs_naip' });
  assert.equal(RUN.belief_frames.url, undefined);                  // the browser's answer itself is not changed
});

test('a Python error gives its kind without its module path', () => {
  assert.deepEqual(splitPythonError('Traceback ...\nbackend.model.real_run.ClosedWindow: closed'), { kind: 'ClosedWindow', message: 'closed' });
  assert.deepEqual(splitPythonError('LookupError: no run x'), { kind: 'LookupError', message: 'no run x' });
});

test('the page\'s one line says what answered the fire', () => {
  const at = ' at commit 1a6698e, on 15 November 2026';
  assert.equal(answerSourceLine(null, at), "This page replays answers recorded from the project's backend at commit 1a6698e, on 15 November 2026.");
  assert.match(answerSourceLine({ source: 'browser', why: null, seconds: 3.26 }, at), /^This fire was computed in your browser by the project's own model in 3\.3 s; the rest/);
  assert.match(answerSourceLine({ source: 'recording', why: 'this fire is replayed (its page fire is the closed test fire)', seconds: null }, at),
    /15 November 2026; this fire is replayed \(its page fire is the closed test fire\)\.$/);
});

test('a run answer whose 8192 picture the page does not hold is drawn on its 4096, with its source and credit', () => {
  const pack = { ortho: { url: '/api/runs/r/terrain/x_ortho_8192.jpg', size: 8192, source: 'usgs_naip', attribution: 'USDA' },
                 ortho_fallback: { url: '/api/runs/r/terrain/x_ortho_4096.jpg', size: 4096 } };
  const answer = { assets: { terrain_pack: pack } };
  const without = { entries: { 'GET /api/runs/r/terrain/x_ortho_8192.jpg': { withheld: 'smaller' } } };
  const served = servedPictures(answer, without);
  assert.deepEqual(served.assets.terrain_pack.ortho, { url: '/api/runs/r/terrain/x_ortho_4096.jpg', size: 4096, source: 'usgs_naip', attribution: 'USDA' });
  assert.equal(answer.assets.terrain_pack.ortho.size, 8192);                            // the answer itself is not changed
  const withIt = { entries: { 'GET /api/runs/r/terrain/x_ortho_8192.jpg': { file: 'files/o8.jpg' } } };
  assert.equal(servedPictures(answer, withIt), answer);
});

test('a fire the recording answered at once, then computed by the model in the background, says both', () => {
  const at = ' at commit d4c73bd, on 15 November 2026';
  assert.equal(answerSourceLine({ source: 'both', why: null, seconds: 24.06 }, at),
    "This page replays answers recorded from the project's backend at commit d4c73bd, on 15 November 2026; the project's own model also computed this fire in your browser, in 24.1 s.");
});

test('a place counts as in once the model has computed a run there, and not before', async () => {
  const { m } = model((op) => (op === 'held_out_run' ? RUN : undefined));
  assert.equal(m.placesIn.has('plumas_ca'), false);
  await m.run('plumas_ca', '2012-08-10', false);
  assert.equal(m.placesIn.has('plumas_ca'), true);
  assert.equal(m.placesIn.has('ventura_ca'), false);
});

test('a run answer names the small copies the recording holds as its pack\'s lite, for the first screen', () => {
  const base = '/api/runs/r/terrain';
  const pack = { dem: { url: `${base}/d_dem_1024_f32.bin`, size: 1024, format: 'f32le' },
                 ortho: { url: `${base}/o_8192.jpg`, size: 8192, source: 'usgs_naip', attribution: 'USDA' },
                 ortho_fallback: { url: `${base}/o_4096.jpg`, size: 4096 },
                 aux: { url: `${base}/a_2048.png`, size: 2048, channels: { r: 'normal_x' } },
                 context: { extent_km: [200, 200], scale: 5, dem: { url: `${base}/c_dem.bin`, size: 1024, format: 'f32le' }, ortho: { url: `${base}/c_o.jpg`, size: 4096 } },
                 tier: 'hero' };
  const lite = (p, size) => ({ key: `GET /lite${p}`, size });
  const index = {
    entries: { [`GET ${base}/o_4096.jpg`]: { file: 'files/o4.jpg' } },
    lite: { [pack.dem.url]: lite(pack.dem.url, 256), [pack.ortho.url]: lite(pack.ortho.url, 1024), [pack.ortho_fallback.url]: lite(pack.ortho.url, 1024),
            [pack.aux.url]: lite(pack.aux.url, 512), [pack.context.dem.url]: lite(pack.context.dem.url, 256), [pack.context.ortho.url]: lite(pack.context.ortho.url, 1024) },
  };
  const got = servedPictures({ assets: { terrain_pack: pack } }, index).assets.terrain_pack;
  assert.deepEqual(got.lite.dem, { url: `/lite${base}/d_dem_1024_f32.bin`, size: 256, format: 'f32le' });
  assert.deepEqual(got.lite.ortho, { url: `/lite${base}/o_8192.jpg`, size: 1024, source: 'usgs_naip', attribution: 'USDA' });
  assert.equal(got.lite.aux.size, 512);
  assert.deepEqual(got.lite.aux.channels, { r: 'normal_x' });
  assert.equal(got.lite.context.dem.size, 256);
  assert.deepEqual(got.lite.context.extent_km, [200, 200]);
  assert.equal(got.lite.tier, 'hero');
  assert.equal(got.ortho.size, 4096);                               // the full pack, its 8192 not held, takes the 4096
  assert.equal(got.dem.size, 1024);
  const none = servedPictures({ assets: { terrain_pack: pack } }, { entries: index.entries });
  assert.equal(none.assets.terrain_pack.lite, undefined);         // no copies, no lite
});

test('a detail inset the recording does not hold is not named in the answer', () => {
  const pack = { ortho: { url: '/api/runs/r/terrain/o_4096.jpg', size: 4096 }, ortho_detail: [{ url: '/api/runs/r/terrain/x_ortho_detail_0.jpg', size: 8192 }] };
  const got = servedPictures({ assets: { terrain_pack: pack } }, { entries: { 'GET /api/runs/r/terrain/x_ortho_detail_0.jpg': { withheld: 'smaller' } } });
  assert.deepEqual(got.assets.terrain_pack.ortho_detail, []);
  const kept = servedPictures({ assets: { terrain_pack: pack } }, { entries: { 'GET /api/runs/r/terrain/x_ortho_detail_0.jpg': { file: 'f.jpg' } } });
  assert.equal(kept.assets.terrain_pack.ortho_detail.length, 1);
});
