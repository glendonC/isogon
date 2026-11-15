#!/usr/bin/env node
// Build the public page: the site with the recorded transport, served under a base path, with a recording inside it
// as `recorded/`. Node built-ins only.
//
//   node scripts/build-public.mjs --recording <folder> [--cube <folder>] [--base /isogon/] [--out dist/public]
//                                 [--pack <folder> [--runtime <folder>]] [--ortho 4096]
//
// The site lands in `<out>/<base>` (for the default base, `dist/public/isogon/`), so `<out>` can be served as it is to
// try the page under the same path it will have online. `<folder>` is a folder written by
// `backend/server_recorder.py`; only `index.json` and the files its entries name are copied. `--cube` names the public
// cube's folder (`backend/firms/cube_public.py` writes it); its three files (`fire-cells.bin.gz`, `manifest.json`,
// `harmonize-fitted.json`) are copied to `recorded/cube/public/`, where the page sums a drawn box's Record from them
// (`website/src/world/publicAnswer.ts`). The yearly layers are recorded answers (`GET /api/cube/years`).

import { spawnSync } from 'node:child_process';
import { copyPack, copyRuntime, leaveOutComputedRuns, packPlaces } from './browser-files.mjs';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function fail(message) {
  console.error(`build-public: ${message}`);
  process.exit(1);
}

function bytesOf(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    n += st.isDirectory() ? bytesOf(p) : st.size;
  }
  return n;
}

const recording = arg('recording', null);
if (!recording) fail('give --recording <folder> (a folder written by backend/server_recorder.py)');
const recordingDir = path.resolve(recording);
const indexFile = path.join(recordingDir, 'index.json');
if (!existsSync(indexFile)) fail(`${indexFile} does not exist`);
const recordedIndexDoc = JSON.parse(readFileSync(indexFile, 'utf8'));
// With a browser pack, what the browser makes itself (the frames, belief and exports of the packed places' held-out
// runs) is left out of the page's recording and marked so in its index (scripts/browser-files.mjs).
const packFolder = arg('pack', null);
// --ortho 4096: the terrain pictures of 8192 pixels left out too (the stage draws each pack's 4096 instead).
const ortho8192 = arg('ortho', '8192') !== '4096';
const answerOf = (key) => {
  const f = recordedIndexDoc.entries?.[key]?.file;
  try {
    return f ? JSON.parse(readFileSync(path.join(recordingDir, f), 'utf8')) : null;
  } catch {
    return null;
  }
};
const leaving = packFolder || !ortho8192
  ? leaveOutComputedRuns(recordedIndexDoc, packFolder ? packPlaces(path.resolve(packFolder)) : {}, answerOf, { ortho8192 })
  : null;
const index = leaving ? leaving.index : recordedIndexDoc;
const leftOut = new Set(leaving?.leftOut ?? []);
const named = [...new Set(Object.values(index.entries ?? {}).map((e) => e.file).filter(Boolean))].filter((f) => !leftOut.has(f));
const missing = named.filter((f) => !existsSync(path.join(recordingDir, f)));
if (missing.length) fail(`the index names ${missing.length} files the folder does not hold, for example ${missing[0]}`);

const base = `/${arg('base', '/isogon/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
const out = path.resolve(site, arg('out', 'dist/public'));
const target = path.join(out, ...base.split('/').filter(Boolean));

// The commit the page is built from and when its answers were recorded, so the page can say both
// (`import.meta.env.VITE_BUILD_COMMIT`, `VITE_RECORDED_UTC`), and `recorded/build.json` for anyone reading the folder.
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: site, encoding: 'utf8' });
const commit = git.status === 0 ? git.stdout.trim() : '';
const recordedUtc = typeof index.recorded_utc === 'string' ? index.recorded_utc : '';
const env = { ...process.env, VITE_TRANSPORT: 'recorded', VITE_BUILD_COMMIT: commit, VITE_RECORDED_UTC: recordedUtc };
for (const [cmd, args] of [
  ['npx', ['tsc', '-b']],
  ['npx', ['vite', 'build', '--base', base, '--outDir', target, '--emptyOutDir']],
]) {
  const run = spawnSync(cmd, args, { cwd: site, env, stdio: 'inherit' });
  if (run.status !== 0) fail(`${cmd} ${args.join(' ')} ended with status ${run.status}`);
}

const recordedDir = path.join(target, 'recorded');
rmSync(recordedDir, { recursive: true, force: true });
mkdirSync(path.join(recordedDir, 'files'), { recursive: true });
if (leaving) writeFileSync(path.join(recordedDir, 'index.json'), JSON.stringify(index, null, 1));
else cpSync(indexFile, path.join(recordedDir, 'index.json'));
for (const f of named) cpSync(path.join(recordingDir, f), path.join(recordedDir, f));
const leftOutBytes = [...leftOut].reduce((n, f) => n + statSync(path.join(recordingDir, f)).size, 0);
writeFileSync(path.join(recordedDir, 'build.json'), `${JSON.stringify({
  site_commit: commit || null,
  recorded_utc: recordedUtc || null,
  base,
  what: 'the commit the page was built from and the time its answers were recorded',
}, null, 1)}\n`);

const cube = arg('cube', null);
let cubeLine = 'no public cube (give --cube <folder>)';
if (cube) {
  const cubeDir = path.resolve(cube);
  const cubeFiles = ['fire-cells.bin.gz', 'manifest.json', 'harmonize-fitted.json'];
  for (const f of cubeFiles) {
    if (!existsSync(path.join(cubeDir, f))) fail(`${cubeDir} holds no ${f}: give the folder the public cube's writer made`);
  }
  const cubeOut = path.join(recordedDir, 'cube', 'public');
  mkdirSync(cubeOut, { recursive: true });
  for (const f of cubeFiles) cpSync(path.join(cubeDir, f), path.join(cubeOut, f));
  cubeLine = `public cube in recorded/cube/public/ ${(bytesOf(cubeOut) / 1e6).toFixed(1)} MB`;
}

// The model in the visitor's browser: with --pack (a folder written by backend/browser_pack.py), its archives go to
// run/ and the Python runtime to runtime/pyodide/ (from --runtime, by default the folder scripts/fetch-runtime.mjs
// fills), every file checked; the page's worker (public/runtime/model-worker.js) loads both from the page itself.
const pack = arg('pack', null);
let browserLine = 'no browser model (give --pack <folder written by backend/browser_pack.py>)';
if (pack) {
  const pins = JSON.parse(readFileSync(path.join(site, 'scripts', 'runtime-files.json'), 'utf8'));
  const runtime = path.resolve(arg('runtime', path.join(site, '..', 'data', 'cache', 'runtime', `pyodide-${pins.version}`)));
  try {
    const rt = copyRuntime(pins, runtime, path.join(target, 'runtime', 'pyodide'));
    const pk = copyPack(path.resolve(pack), path.join(target, 'run'));
    browserLine = `runtime ${pins.runtime} ${pins.version} ${(rt / 1e6).toFixed(1)} MB in runtime/pyodide/; run/ ${(pk.bytes / 1e6).toFixed(1)} MB, `
      + `${pk.places.length} places computed in the browser (${pk.places.join(', ')}), ${pk.replayOnly.length} replayed; `
      + `left out of the recording (what the browser makes${ortho8192 ? '' : ', and the 8192 pictures'}): ${leaving.entries} entries, ${leftOut.size} files, ${(leftOutBytes / 1e6).toFixed(1)} MB`;
  } catch (err) {
    fail(`${err.message} (the runtime comes from node scripts/fetch-runtime.mjs)`);
  }
}

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
console.log(`build-public: the page is in ${target}`);
console.log(`build-public: commit ${commit ? commit.slice(0, 7) : 'unknown'}; answers recorded ${recordedUtc || 'at an unknown time'}`);
console.log(`build-public: base ${base}; ${named.length} recorded files; recorded ${mb(bytesOf(recordedDir))}; ${cubeLine}; page in all ${mb(bytesOf(target))}`);
console.log(`build-public: ${browserLine}`);
console.log(`build-public: try it with  python3 -m http.server 5589 --directory ${out}  and open http://127.0.0.1:5589${base}`);
