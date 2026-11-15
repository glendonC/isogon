// The files a public page needs to run the model in the visitor's browser, copied into the build and checked on the
// way: the Python runtime (runtime-files.json beside this file) into runtime/pyodide/, and the archives the backend's
// packer wrote (backend/browser_pack.py: browser-pack.json, core.zip, places/<region_id>.zip) into run/. A file whose
// size or sha256 is not the one pinned or listed stops the build. Node built-ins only.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function checkedCopy(src, dest, bytes, digest, what) {
  if (!existsSync(src)) throw new Error(`${what}: ${src} does not exist`);
  const buf = readFileSync(src);
  if (bytes != null && buf.length !== bytes) throw new Error(`${what}: ${buf.length} bytes, not the ${bytes} listed`);
  if (digest && sha256(buf) !== digest) throw new Error(`${what}: its sha256 is not the one listed`);
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return buf.length;
}

/** Copy the runtime's pinned files from `from` into `to`, each checked against its pin. Returns the bytes copied. */
export function copyRuntime(pins, from, to) {
  let n = 0;
  for (const f of pins.files) {
    if (f.name !== path.basename(f.name)) throw new Error(`runtime: ${f.name} is not a plain file name`);
    n += checkedCopy(path.join(from, f.name), path.join(to, f.name), f.bytes, f.sha256, `runtime ${f.name}`);
  }
  return n;
}

/** Why a recorded file of a run the browser computes is not in the page. */
export const COMPUTED_IN_THE_BROWSER = "computed in the visitor's browser from the page's browser pack (run/), so not kept in the recording";

const RUN_FILE = /^GET \/api\/runs\/([^/ ?]+)\/(reconstruction_u8\.bin|belief_u8\.bin|export\.geojson|export\.csv)$/;

/**
 * The recording without what the browser makes itself: for each place the pack holds, the files of every recorded
 * held-out run there that a run in the browser gives (its frames, its belief and its exports) are marked withheld in
 * the index, and their files are left out unless a kept entry also names them. The run answers, the terrain and every
 * run with all the satellites shown stay. Returns {index, leftOut: files to leave out, entries: how many marked}.
 */
export function leaveOutComputedRuns(index, places) {
  const entries = { ...(index.entries ?? {}) };
  const candidates = new Set();
  let marked = 0;
  for (const [key, e] of Object.entries(entries)) {
    const m = RUN_FILE.exec(key);
    const region = m && m[1].includes('_holdoutviirs') ? m[1].split('_firms_')[0] : null;
    if (region && places.includes(region) && e?.file) {
      candidates.add(e.file);
      entries[key] = { withheld: COMPUTED_IN_THE_BROWSER };
      marked += 1;
    }
  }
  const kept = new Set(Object.values(entries).map((e) => e?.file).filter(Boolean));
  const leftOut = [...candidates].filter((f) => !kept.has(f)).sort();
  return {
    index: { ...index, entries, computed_in_the_browser: { why: COMPUTED_IN_THE_BROWSER, places: [...places].sort(), entries: marked } },
    leftOut,
    entries: marked,
  };
}

/** The places a packer's folder holds, from its manifest, without copying anything. */
export function packPlaces(from) {
  const manifest = JSON.parse(readFileSync(path.join(from, 'browser-pack.json'), 'utf8'));
  return Object.keys(manifest.places ?? {});
}

/** An archive's path as the manifest names it: relative, inside the pack, a zip. */
function archivePath(file) {
  const norm = path.posix.normalize(String(file ?? ''));
  if (!norm.endsWith('.zip') || norm.startsWith('..') || path.posix.isAbsolute(norm)) {
    throw new Error(`browser pack: ${file} is not a zip inside the pack`);
  }
  return norm;
}

/**
 * Copy a packer's folder (`from`, holding browser-pack.json) into `to`: the manifest and every archive it lists, each
 * archive checked against its bytes and sha256 there. Returns {bytes, places, replayOnly}.
 */
export function copyPack(from, to) {
  const manifestPath = path.join(from, 'browser-pack.json');
  if (!existsSync(manifestPath)) throw new Error(`browser pack: ${manifestPath} does not exist`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest.core?.file) throw new Error('browser pack: the manifest names no core archive');
  const entries = [['core', manifest.core], ...Object.entries(manifest.places ?? {})];
  let bytes = 0;
  for (const [name, e] of entries) {
    const rel = archivePath(e.file);
    if (e.bytes == null || !e.sha256) throw new Error(`browser pack: ${name} has no bytes or sha256 in the manifest`);
    bytes += checkedCopy(path.join(from, rel), path.join(to, rel), e.bytes, e.sha256, `browser pack ${name}`);
  }
  bytes += checkedCopy(manifestPath, path.join(to, 'browser-pack.json'), null, null, 'browser pack manifest');
  return { bytes, places: Object.keys(manifest.places ?? {}), replayOnly: Object.keys(manifest.replay_only ?? {}) };
}
