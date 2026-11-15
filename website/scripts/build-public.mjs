#!/usr/bin/env node
// Build the public page: the site with the recorded transport, served under a base path, with a recording inside it
// as `recorded/`. Node built-ins only.
//
//   node scripts/build-public.mjs --recording <folder> [--cube <folder>] [--base /isogon/] [--out dist/public]
//
// The site lands in `<out>/<base>` (for the default base, `dist/public/isogon/`), so `<out>` can be served as it is to
// try the page under the same path it will have online. `<folder>` is a folder written by
// `backend/server_recorder.py`; only `index.json` and the files its entries name are copied. `--cube` names the public
// cube's folder (`backend/firms/cube_public.py` writes it); its three files (`fire-cells.bin.gz`, `manifest.json`,
// `harmonize-fitted.json`) are copied to `recorded/cube/public/`, where the page sums a drawn box's Record from them
// (`website/src/world/publicAnswer.ts`). The yearly layers are recorded answers (`GET /api/cube/years`).

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
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
const index = JSON.parse(readFileSync(indexFile, 'utf8'));
const named = [...new Set(Object.values(index.entries ?? {}).map((e) => e.file).filter(Boolean))];
const missing = named.filter((f) => !existsSync(path.join(recordingDir, f)));
if (missing.length) fail(`the index names ${missing.length} files the folder does not hold, for example ${missing[0]}`);

const base = `/${arg('base', '/isogon/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
const out = path.resolve(site, arg('out', 'dist/public'));
const target = path.join(out, ...base.split('/').filter(Boolean));

const env = { ...process.env, VITE_TRANSPORT: 'recorded' };
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
cpSync(indexFile, path.join(recordedDir, 'index.json'));
for (const f of named) cpSync(path.join(recordingDir, f), path.join(recordedDir, f));

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

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
console.log(`build-public: the page is in ${target}`);
console.log(`build-public: base ${base}; ${named.length} recorded files; recorded ${mb(bytesOf(recordedDir))}; ${cubeLine}; page in all ${mb(bytesOf(target))}`);
console.log(`build-public: try it with  python3 -m http.server 5589 --directory ${out}  and open http://127.0.0.1:5589${base}`);
