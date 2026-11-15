// The model in the visitor's browser: a worker that loads the Python runtime once (Pyodide, with its numpy and
// Pillow, from this page's own runtime/pyodide/), unpacks the backend's modules and a place's files from this page's
// run/ (browser-pack.json, core.zip, places/<region>.zip), and calls the backend's browser entry point
// (backend/browser.py): a held-out run, its reveal, its pictures, and a round of the game.
//
// A classic worker (importScripts), served as a file of its own beside the runtime. Messages:
//   in:  {id, op, args}           op: held_out_run | reveal | pictures | round_start | round_look | round_state
//   out: {id, step}               while loading: runtime, packages, core, place, running
//        {id, ok: true, value}    value: the answer as JSON text; for pictures, {name: ArrayBuffer} (transferred)
//        {id, ok: false, error, where}
// Nothing here fetches from another site, and nothing here holds a key.

'use strict';

const ROOT = '/home/pyodide/isogon';
const here = (path) => new URL(path, self.location).href;

let py = null;
let manifest = null;
let loading = null;
const placesIn = new Set();

async function digest(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchChecked(entry) {
  const resp = await fetch(here(`../run/${entry.file}`));
  if (!resp.ok) throw new Error(`run/${entry.file}: HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  if (entry.bytes != null && buf.byteLength !== entry.bytes) throw new Error(`run/${entry.file}: ${buf.byteLength} bytes, not ${entry.bytes}`);
  if (entry.sha256 && (await digest(buf)) !== entry.sha256) throw new Error(`run/${entry.file}: its sha256 is not the manifest's`);
  return buf;
}

function load(say) {
  loading ??= (async () => {
    say('runtime');
    importScripts(here('pyodide/pyodide.js'));
    py = await self.loadPyodide({ indexURL: here('pyodide/') });
    say('packages');
    await py.loadPackage(['numpy', 'pillow'], { messageCallback: () => {} });
    say('core');
    const m = await fetch(here('../run/browser-pack.json'));
    if (!m.ok) throw new Error(`run/browser-pack.json: HTTP ${m.status}`);
    manifest = await m.json();
    py.unpackArchive(await fetchChecked(manifest.core), 'zip', { extractDir: ROOT });
    py.runPython(`
import json, math, os, sys
os.chdir(${JSON.stringify(ROOT)})
sys.path.insert(0, ${JSON.stringify(ROOT)})
os.environ["ISOGON_RUN_ESTIMATE"] = "challenger"

def _finite(x):
    if isinstance(x, float) and not math.isfinite(x):
        return None
    if isinstance(x, dict):
        return {k: _finite(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_finite(v) for v in x]
    return x

def _json(x):
    # as the server writes an answer: a number that is not finite is null, never NaN
    try:
        return json.dumps(x, ensure_ascii=False, allow_nan=False)
    except ValueError:
        return json.dumps(_finite(x), ensure_ascii=False, allow_nan=False)
`);
  })();
  return loading;
}

async function place(region, say) {
  if (!region || placesIn.has(region)) return;
  const entry = manifest.places?.[region];
  if (!entry) throw Object.assign(new Error(`no files of ${region} in this page`), { where: 'place' });
  say('place');
  py.unpackArchive(await fetchChecked(entry), 'zip', { extractDir: ROOT });
  placesIn.add(region);
}

const CALLS = {
  held_out_run: (a) => `B.held_out_run(${py_(a.region_id)}, ${py_(a.start)})`,
  reveal: (a) => `B.reveal(${py_(a.run_id)})`,
  round_start: (a) => `B.round_start(${py_(a.region_id)}, start=${py_(a.start ?? null)}, tiles=${py_(a.tiles ?? null)}, budget=${py_(a.budget ?? null)}, seed=${Number(a.seed ?? 0)})`,
  round_look: (a) => `B.round_look(${py_(a.round_id)}, ${Number(a.decision)}, ${Number(a.action)})`,
  round_state: (a) => `B.round_state(${py_(a.round_id)})`,
};

// A JS value as a Python literal, through JSON (json.loads on the Python side)
function py_(v) {
  return `json.loads(${JSON.stringify(JSON.stringify(v ?? null))})`;
}

self.onmessage = async (ev) => {
  const { id, op, args = {} } = ev.data || {};
  const say = (step) => self.postMessage({ id, step });
  let where = 'runtime';
  try {
    await load(say);
    where = 'place';
    await place(args.region_id, say);
    where = 'running';
    say('running');
    if (op === 'pictures') {
      const got = py.runPython(`import backend.browser as B\nB.pictures(${py_(args.run_id)})`);
      const out = {};
      for (const name of got.keys()) {
        const bytes = got.get(name).toJs();
        out[name] = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      }
      got.destroy();
      self.postMessage({ id, ok: true, value: out }, Object.values(out));
      return;
    }
    const call = CALLS[op];
    if (!call) throw new Error(`no call ${op}`);
    const text = py.runPython(`import backend.browser as B\n_json(${call(args)})`);
    self.postMessage({ id, ok: true, value: text });
  } catch (e) {
    const msg = String((e && e.message) || e);
    self.postMessage({ id, ok: false, error: msg.slice(-4000), where: e?.where || where });
  }
};
