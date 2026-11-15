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
const ROUND_STEP = /^POST \/api\/env\/next_look\/step (\{.*\})$/;
const ROUND_STATE = /^GET \/api\/env\/next_look\/state\?round_id=(\S+)$/;
const ORTHO_8192 = /^GET \/api\/runs\/[^/ ?]+\/terrain\/[^/ ?]*ortho_8192\.jpg$/;

/** Why a terrain picture of 8192 pixels is not in the page: the stage draws the pack's 4096 instead. */
export const SMALLER_PICTURE = 'the 8192 picture is not in this page: the stage draws the pack\'s 4096 picture (ortho_fallback)';

/**
 * The recording without what the browser makes itself. `places` maps each place the pack holds to the start it is
 * packed for (the manifest's `places.<id>.start`), and `answerOf(key)` reads a recorded answer. For each packed place
 * and start:
 * - the files a run in the browser gives (the 24 frames, the belief and the two exports) of its recorded held-out run;
 * - the recorded steps and state of its round (the visitor's one look and the recorded line), since the round is
 *   played in the browser; the index's round then names no look, so a page where the model cannot run says so;
 * are marked withheld in the index. With `ortho8192: false`, every terrain picture of 8192 pixels is too (the stage
 * draws the 4096 the pack names as its fallback). A file a kept entry also names stays. The run answers, the terrain
 * and every run with all the satellites shown stay.
 * Returns {index, leftOut: files to leave out, entries: how many marked}.
 */
export function leaveOutComputedRuns(index, places, answerOf = () => null, { ortho8192 = true } = {}) {
  const packed = new Map(Object.entries(places));
  const entries = { ...(index.entries ?? {}) };
  const candidates = new Set();
  let marked = 0;
  const mark = (key, why) => {
    const e = entries[key];
    if (!e?.file) return;
    candidates.add(e.file);
    entries[key] = { withheld: why };
    marked += 1;
  };
  // The held-out runs of the packed starts, by their recorded answers' run ids
  const runIds = new Set();
  for (const key of Object.keys(entries)) {
    if (!key.startsWith('POST /api/reconstruct ')) continue;
    let body;
    try {
      body = JSON.parse(key.slice('POST /api/reconstruct '.length));
    } catch {
      continue;
    }
    if (body?.holdout_viirs !== true || packed.get(body.region_id) !== body.start) continue;
    const answer = answerOf(key);
    if (answer && typeof answer.run_id === 'string') runIds.add(answer.run_id);
  }
  // The rounds of the packed starts
  const rounds = Array.isArray(index.rounds) ? index.rounds : [];
  const roundIds = new Set(rounds.filter((r) => packed.get(r?.episode_from?.region_id) === r?.episode_from?.start).map((r) => r.round_id));
  for (const key of Object.keys(entries)) {
    const run = RUN_FILE.exec(key);
    if (run && runIds.has(run[1])) mark(key, COMPUTED_IN_THE_BROWSER);
    const step = ROUND_STEP.exec(key);
    if (step) {
      try {
        if (roundIds.has(JSON.parse(step[1]).round_id)) mark(key, COMPUTED_IN_THE_BROWSER);
      } catch {
        // not a step body
      }
    }
    const state = ROUND_STATE.exec(key);
    if (state && roundIds.has(decodeURIComponent(state[1]))) mark(key, COMPUTED_IN_THE_BROWSER);
    if (!ortho8192 && ORTHO_8192.test(key)) mark(key, SMALLER_PICTURE);
  }
  const kept = new Set(Object.values(entries).map((e) => e?.file).filter(Boolean));
  const leftOut = [...candidates].filter((f) => !kept.has(f)).sort();
  const keptRounds = rounds.map((r) => (roundIds.has(r?.round_id) ? { ...r, one_look: null, line: [], played_in_the_browser: true } : r));
  return {
    index: { ...index, entries, rounds: keptRounds,
             computed_in_the_browser: { why: COMPUTED_IN_THE_BROWSER, places: Object.fromEntries([...packed].sort()), entries: marked,
                                        runs: [...runIds].sort(), rounds: [...roundIds].sort(), ortho_8192: ortho8192 } },
    leftOut,
    entries: marked,
  };
}

/** The places a packer's folder holds and the start each is packed for, from its manifest, without copying anything. */
export function packPlaces(from) {
  const manifest = JSON.parse(readFileSync(path.join(from, 'browser-pack.json'), 'utf8'));
  return Object.fromEntries(Object.entries(manifest.places ?? {}).map(([id, p]) => [id, p.start ?? null]));
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
