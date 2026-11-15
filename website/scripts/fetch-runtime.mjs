#!/usr/bin/env node
// Fetch the Python runtime the public page serves itself (runtime-files.json beside this script: Pyodide with its numpy
// and Pillow), each file checked against its size and sha256 before it is kept. Node built-ins only.
//
//   node scripts/fetch-runtime.mjs [--out <folder>]     (default: data/cache/runtime/pyodide-<version>/ of the checkout)
//
// A file already there with the right sha256 is not fetched again. The public build copies the folder into the page
// (scripts/build-public.mjs --runtime), so a visitor's browser never fetches it from another site.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pins = JSON.parse(readFileSync(path.join(here, 'runtime-files.json'), 'utf8'));
const i = process.argv.indexOf('--out');
const out = path.resolve(i >= 0 ? process.argv[i + 1] : path.join(here, '..', '..', 'data', 'cache', 'runtime', `pyodide-${pins.version}`));
mkdirSync(out, { recursive: true });

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
let fetched = 0;
for (const f of pins.files) {
  const dest = path.join(out, f.name);
  if (existsSync(dest) && sha(readFileSync(dest)) === f.sha256) continue;
  const resp = await fetch(`${pins.source}${f.name}`);
  if (!resp.ok) throw new Error(`${f.name}: HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length !== f.bytes || sha(buf) !== f.sha256) throw new Error(`${f.name}: ${buf.length} bytes and a sha256 that are not the pinned ones`);
  writeFileSync(`${dest}.part`, buf);
  renameSync(`${dest}.part`, dest);
  fetched += 1;
}
console.log(`fetch-runtime: ${pins.runtime} ${pins.version} in ${out}: ${pins.files.length} files, ${(pins.bytes / 1e6).toFixed(1)} MB, ${fetched} fetched now`);
