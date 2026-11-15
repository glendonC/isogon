/**
 * The one way the page asks the backend for anything. Two transports, chosen at build time:
 *
 *   - `live` (the default): HTTP to the backend at `VITE_API_BASE`.
 *   - `recorded`: answers read from a folder served beside the page (`VITE_RECORDED_BASE`, default `recorded/`),
 *     written by the backend's recorder. A request is found by its key (`requestKey`) in the folder's `index.json`
 *     (`entries`); a request with no recorded answer, or one the recorder withheld, fails with `NotRecorded`, and the
 *     page says so in one line (`NOT_RECORDED_LINE`).
 *
 * The key, as the recorder writes it: METHOD, a space, the path, then `?` and the query sorted by name and form
 * encoded (as Python's `urlencode` does: a space is `+`), then for a POST a space and the body as canonical JSON
 * (keys sorted at every depth, no spaces, no ASCII escaping).
 */

import { type AnswerSource, BrowserModel, BrowserModelUnavailable, BrowserRefusal, withPageAssets } from './browserModel.ts';

export type Transport = 'live' | 'recorded';

// Outside a Vite build (a test under node) there is no `import.meta.env`: the live defaults apply.
const env = ((import.meta as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;

export const TRANSPORT: Transport = env.VITE_TRANSPORT === 'recorded' ? 'recorded' : 'live';
export const API_BASE: string = env.VITE_API_BASE || 'http://127.0.0.1:8788';
const RECORDED_BASE: string = (env.VITE_RECORDED_BASE || 'recorded/').replace(/\/?$/, '/');

/** What the page says when a recorded page is asked for something it does not hold. */
export const NOT_RECORDED_LINE = 'This page replays recorded answers. The full application answers for any place.';

export type Query = Record<string, string | number | boolean | null | undefined>;

/** A request the recorded folder does not hold, or holds as withheld (with the recorder's reason). */
export class NotRecorded extends Error {
  readonly key: string;
  readonly withheld: string | null;
  constructor(key: string, withheld: string | null = null) {
    super(NOT_RECORDED_LINE);
    this.name = 'NotRecorded';
    this.key = key;
    this.withheld = withheld;
  }
}

/** An answer with a status other than 2xx; `message` is the backend's own `error` when it sends one. */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    const said = body && typeof body === 'object' ? (body as { error?: unknown }).error : null;
    super(typeof said === 'string' ? said : `HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

/** JSON with object keys sorted at every depth and no spaces. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** Form encoding as Python's `quote_plus`: letters, digits and `_.-~` stay; a space is `+`; the rest is `%XX`. */
export function formEncode(text: string): string {
  return encodeURIComponent(text)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}

/** The query string, sorted by name then value, form encoded, without the `?`; empty parameters are left out. */
export function sortedQuery(query?: Query): string {
  if (!query) return '';
  const pairs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1));
  return pairs.map(([k, v]) => `${formEncode(k)}=${formEncode(v)}`).join('&');
}

/** The key a request has in a recorded folder. */
export function requestKey(method: 'GET' | 'POST', path: string, query?: Query, body?: unknown): string {
  const q = sortedQuery(query);
  const head = `${method} ${path}${q ? `?${q}` : ''}`;
  return body === undefined ? head : `${head} ${canonicalJson(body)}`;
}

interface RecordedEntry {
  file?: string;
  status?: number;
  content_type?: string;
  /** Listed but not stored, with the reason (imagery that may be viewed but not exported). */
  withheld?: string;
}

interface RecordedIndex {
  version: number;
  entries: Record<string, RecordedEntry>;
  /** The featured periods the recorder did not record (`periods_left_out.periods`: featured fire ids). */
  periods_left_out?: { why?: string; periods?: unknown };
  /** The recorded rounds: each one's fire, its recorded line and the decision of the visitor's one look. */
  rounds?: unknown;
  /** The backend's commit the answers were recorded from, when the recording names it, and when it was recorded. */
  commit?: string | null;
  recordedUtc?: string | null;
}

/** A recorded round of a fire, as the index lists it. */
export interface RecordedRound {
  /** The recorded line's steps: a page is on it while every step it took equals the line's at that decision. */
  line: { decision: number; action: number }[];
  /** The one look this page scores: its decision and the actions recorded there; null when the round has none. */
  oneLook: { decision: number; actions: number[] } | null;
}

let indexPromise: Promise<RecordedIndex> | null = null;
/** The index once it has arrived, for the one synchronous reader (`assetUrlNow`). */
let indexLoaded: RecordedIndex | null = null;

function recordedIndex(): Promise<RecordedIndex> {
  if (!indexPromise) {
    indexPromise = fetch(`${RECORDED_BASE}index.json`)
      .then((r) => (r.ok ? (r.json() as Promise<RecordedIndex>) : ({ version: 1, entries: {} } as RecordedIndex)))
      .then((idx): RecordedIndex => {
        const raw = idx as RecordedIndex & { recorded_utc?: unknown; backend?: { commit?: unknown } };
        const commit = typeof raw.commit === 'string' ? raw.commit : typeof raw.backend?.commit === 'string' ? raw.backend.commit : null;
        const recordedUtc = typeof raw.recorded_utc === 'string' ? raw.recorded_utc : null;
        return { version: idx.version, entries: idx.entries ?? {}, periods_left_out: idx.periods_left_out, rounds: idx.rounds, commit, recordedUtc };
      })
      .catch((): RecordedIndex => ({ version: 1, entries: {} }))
      .then((idx) => (indexLoaded = idx));
  }
  return indexPromise;
}

async function readBody(resp: Response): Promise<unknown> {
  const text = await resp.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

// ------------------------------------------------------------------------------------------------------------------
// The model in the visitor's browser (`browserModel.ts`): on a page of recorded answers, a held-out run, its reveal and
// a round of the game at a place the page's browser pack holds are computed in the page; everything else, and every
// request when the model cannot run here, is the recording's.
// ------------------------------------------------------------------------------------------------------------------

let model: BrowserModel | null = null;

/** The page's browser model, on a page of recorded answers only. */
export function browserModel(): BrowserModel | null {
  if (TRANSPORT !== 'recorded') return null;
  model ??= new BrowserModel({ workerUrl: publicUrl('runtime/model-worker.js'), packUrl: publicUrl('run/browser-pack.json') });
  return model;
}

let source: AnswerSource | null = null;
const sourceListeners = new Set<(s: AnswerSource) => void>();

function said(s: AnswerSource): void {
  source = s;
  for (const cb of sourceListeners) cb(s);
}

/** What answered the page's last fire (the browser or the recording, and why), now and each time it changes. */
export function onAnswerSource(cb: (s: AnswerSource) => void): () => void {
  sourceListeners.add(cb);
  if (source) cb(source);
  return () => sourceListeners.delete(cb);
}

/** The page's one line on what answered: `provenance` is where the recording comes from ("at commit ..., on ..."). */
export function answerSourceLine(s: AnswerSource | null, provenance: string): string {
  const replays = `This page replays answers recorded from the project's backend${provenance}.`;
  if (!s) return replays;
  if (s.source === 'browser') {
    const took = s.seconds !== null ? ` in ${s.seconds.toFixed(1)} s` : '';
    return `This fire was computed in your browser by the project's own model${took}; the rest of the page replays answers recorded from its backend${provenance}.`;
  }
  return s.why ? `${replays.slice(0, -1)}; ${s.why}.` : replays;
}

/** Whether a whole round of the game can be played at a place: on a backend, or by the browser's model once loaded. */
export async function fullRoundHere(regionId: string): Promise<boolean> {
  if (TRANSPORT === 'live') return true;
  const m = browserModel();
  return Boolean(m && m.state === 'ready' && (await m.holds(regionId)));
}

/** A recorded run answer of a place, for the terrain a run made in the browser is drawn on: the same request's, or any
 * held-out run's of that place (a run's terrain does not depend on its start). */
async function recordedRunOfPlace(regionId: string, body: unknown): Promise<Record<string, unknown> | null> {
  const index = await recordedIndex();
  let key: string | undefined = requestKey('POST', '/api/reconstruct', undefined, body);
  if (!index.entries[key]?.file) {
    key = Object.keys(index.entries).find((k) => k.startsWith('POST /api/reconstruct ') && k.includes(`"region_id":"${regionId}"`)
      && k.includes('"holdout_viirs":true') && index.entries[k]?.file);
  }
  if (!key) return null;
  try {
    return await recorded<Record<string, unknown>>(key);
  } catch {
    return null;
  }
}

const NOT_HERE = Symbol('not computed in the browser');

/** The browser's answer to a request it computes, or NOT_HERE for the recording to answer. */
async function inBrowser(method: 'GET' | 'POST', path: string, query: Query | undefined, body: unknown): Promise<unknown> {
  const m = browserModel();
  if (!m) return NOT_HERE;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const roundStep = (method === 'POST' && path === '/api/env/next_look/step' && typeof b.round_id === 'string' && m.rounds.has(b.round_id))
    || (method === 'GET' && path === '/api/env/next_look/state' && m.rounds.has(String(query?.round_id ?? '')));
  try {
    if (roundStep) {
      // A round the browser started goes on there: its id and its looks are the browser's, not the recording's.
      return method === 'POST'
        ? await m.roundLook({ round_id: String(b.round_id), decision: Number(b.decision), action: Number(b.action) })
        : await m.roundState(String(query?.round_id));
    }
    const region = typeof b.region_id === 'string' ? b.region_id : null;
    if (method === 'POST' && path === '/api/reconstruct' && region && b.source === 'firms' && b.holdout_viirs === true && typeof b.start === 'string') {
      if (!(await m.holds(region))) {
        const why = await m.replayReason(region);
        said({ source: 'recording', why: why ? `this fire is replayed (${why})` : m.why ? `the model did not run in this browser: ${m.why}` : null, seconds: null });
        return NOT_HERE;
      }
      const t0 = Date.now();
      const answer = await m.run(region, b.start, b.reveal === true);
      const files = await m.pictures(String(answer.run_id), region);
      const page = withPageAssets(answer, await recordedRunOfPlace(region, body), files);
      said({ source: 'browser', why: null, seconds: (Date.now() - t0) / 1000 });
      return page;
    }
    if (method === 'POST' && path === '/api/env/next_look/reset' && region && (await fullRoundHere(region))) {
      return await m.roundStart(b);
    }
  } catch (err) {
    if (err instanceof BrowserRefusal) throw new HttpError(409, { error: err.message, kind: err.kind });
    if (roundStep) throw err;
    const why = err instanceof BrowserModelUnavailable ? err.why : err instanceof Error ? err.message : String(err);
    said({ source: 'recording', why: `the model did not answer in this browser (${why})`, seconds: null });
    return NOT_HERE;
  }
  return NOT_HERE;
}

async function recorded<T>(key: string, signal?: AbortSignal): Promise<T> {
  const index = await recordedIndex();
  const hit = index.entries[key];
  if (!hit || !hit.file) throw new NotRecorded(key, hit?.withheld ?? null);
  const resp = await fetch(`${RECORDED_BASE}${hit.file.replace(/^\//, '')}`, { signal });
  const body = await readBody(resp);
  const status = hit.status ?? resp.status;
  if (status < 200 || status >= 300) throw new HttpError(status, body);
  return body as T;
}

/**
 * Where a page of recorded answers comes from: the backend's commit, when the recording's index names it, and the time
 * it was recorded. Null on the live transport.
 */
export async function recordedProvenance(): Promise<{ commit: string | null; recordedUtc: string | null } | null> {
  if (TRANSPORT !== 'recorded') return null;
  const idx = await recordedIndex();
  return { commit: idx.commit ?? null, recordedUtc: idx.recordedUtc ?? null };
}

/** The featured periods a page of recorded answers does not hold, by featured fire id; none on the live transport. */
export async function recordedPeriodsLeftOut(): Promise<string[]> {
  if (TRANSPORT !== 'recorded') return [];
  const periods = (await recordedIndex()).periods_left_out?.periods;
  return Array.isArray(periods) ? periods.filter((p): p is string => typeof p === 'string') : [];
}

/** The recorded round of a fire (its place and start), or null: none recorded, or the live transport. */
export async function recordedRound(regionId: string, start: string): Promise<RecordedRound | null> {
  if (TRANSPORT !== 'recorded') return null;
  const rounds = (await recordedIndex()).rounds;
  if (!Array.isArray(rounds)) return null;
  type Raw = { episode_from?: { region_id?: string; start?: string }; line?: unknown; one_look?: { decision?: unknown; actions?: unknown } | null };
  const r = (rounds as Raw[]).find((x) => x?.episode_from?.region_id === regionId && x.episode_from.start === start);
  if (!r) return null;
  const line = Array.isArray(r.line)
    ? (r.line as { decision?: unknown; action?: unknown }[])
        .filter((x) => typeof x?.decision === 'number' && typeof x.action === 'number')
        .map((x) => ({ decision: x.decision as number, action: x.action as number }))
    : [];
  const ol = r.one_look;
  const oneLook =
    ol && typeof ol.decision === 'number' && Array.isArray(ol.actions)
      ? { decision: ol.decision, actions: (ol.actions as unknown[]).filter((a): a is number => typeof a === 'number') }
      : null;
  return { line, oneLook };
}

interface InflightGet {
  controller: AbortController;
  active: number;
  promise: Promise<unknown>;
}

const inflightGets = new Map<string, InflightGet>();

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

async function performGetJson<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
  // A recorded page answers a drawn box it does not hold from the public fire cube, summed in the browser with the
  // route's figures (world/publicAnswer.ts, fetched only when a box is asked for); every other request it does not
  // hold stays not recorded.
  if (TRANSPORT === 'recorded' && path === '/api/env/next_look/state') {
    const own = await inBrowser('GET', path, query, undefined);
    if (own !== NOT_HERE) return own as T;
  }
  if (TRANSPORT === 'recorded') return recorded<T>(requestKey('GET', path, query), signal).catch(async (err) => {
    const own = err instanceof NotRecorded && (await import('../world/publicAnswer.ts'));
    if (!own || !own.isBoxRecordRequest(path, query)) throw err;
    return own.publicBoxAnswer(path, query) as Promise<T>;
  });
  const q = sortedQuery(query);
  const resp = await fetch(`${API_BASE}${path}${q ? `?${q}` : ''}`, { signal });
  const body = await readBody(resp);
  if (!resp.ok) throw new HttpError(resp.status, body);
  return body as T;
}

/** GET a JSON route, sharing one in-flight request across concurrent callers for the same key. */
export function getJson<T>(path: string, query?: Query, init?: { signal?: AbortSignal }): Promise<T> {
  const callerSignal = init?.signal;
  if (callerSignal?.aborted) {
    return Promise.reject(abortError(callerSignal));
  }

  const key = requestKey('GET', path, query);
  let entry = inflightGets.get(key);
  if (!entry) {
    const controller = new AbortController();
    const shared: InflightGet = {
      controller,
      active: 0,
      promise: Promise.resolve(),
    };
    shared.promise = performGetJson<unknown>(path, query, controller.signal).finally(() => {
      if (inflightGets.get(key) === shared) {
        inflightGets.delete(key);
      }
    });
    inflightGets.set(key, shared);
    entry = shared;
  }

  const target = entry;
  target.active += 1;

  if (!callerSignal) {
    return target.promise as Promise<T>;
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      target.active = Math.max(0, target.active - 1);
      if (target.active === 0) {
        if (inflightGets.get(key) === target) {
          inflightGets.delete(key);
        }
        target.controller.abort();
      }
      reject(abortError(callerSignal));
    };
    callerSignal.addEventListener('abort', onAbort, { once: true });
    (target.promise as Promise<T>).then(
      (value) => {
        if (settled) return;
        settled = true;
        callerSignal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        callerSignal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/** POST a JSON body to a route. */
export async function postJson<T>(path: string, body: unknown, init?: { signal?: AbortSignal }): Promise<T> {
  if (TRANSPORT === 'recorded') {
    const own = await inBrowser('POST', path, undefined, body);
    if (own !== NOT_HERE) return own as T;
    return recorded<T>(requestKey('POST', path, undefined, body), init?.signal);
  }
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: init?.signal,
  });
  const answer = await readBody(resp);
  if (!resp.ok) throw new HttpError(resp.status, answer);
  return answer as T;
}

/**
 * Where a file an answer names (`/api/runs/<id>/...`) is fetched from: the backend when live; when recorded, the
 * content addressed file its `GET` key points at, or null when it was not recorded or was withheld. Absolute
 * addresses are left as they are.
 */
export async function assetUrl(path: string): Promise<string | null> {
  if (/^(https?:\/\/|blob:)/.test(path)) return path;
  if (TRANSPORT === 'live') return `${API_BASE}${path}`;
  const [p, q] = path.split('?');
  const query: Query = {};
  if (q) new URLSearchParams(q).forEach((v, k) => (query[k] = v));
  const hit = (await recordedIndex()).entries[requestKey('GET', p, query)];
  return hit?.file ? `${RECORDED_BASE}${hit.file.replace(/^\//, '')}` : null;
}

/**
 * A file the site ships under `public/`, from the site's base path (`/` live, `/isogon/` on the public page). Never
 * an absolute path at the host's root.
 */
export function publicUrl(path: string): string {
  const base = env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\//, '')}`;
}

/** The body of a real run request (`POST /api/reconstruct`), contract item 20; the keys are in the interface notes. */
export interface RunRequestBody {
  region_id: string;
  source: 'firms';
  start: string;
  holdout_viirs: boolean;
  cloud_override: null;
  holdout?: 'viirs';
  reveal?: true;
}

/**
 * The one builder of a real run request's body, used by the shell for every run and by the compare planes: a place,
 * a start exactly as the registry or the start list gives it, what is hidden, and whether it is the reveal. A key that
 * does not apply is left out, so a recorded page finds the answer by the same canonical body.
 */
export function runRequestBody(regionId: string, start: string, hidden: 'VIIRS' | null, reveal = false): RunRequestBody {
  const body: RunRequestBody = { region_id: regionId, source: 'firms', start, holdout_viirs: hidden === 'VIIRS', cloud_override: null };
  if (hidden === 'VIIRS') body.holdout = 'viirs';
  if (hidden === 'VIIRS' && reveal) body.reveal = true;
  return body;
}

/**
 * `assetUrl` for a caller that cannot wait, the stage's `resolveAsset`: live, the route; recorded, the recorded file.
 * A run's files are only asked for after its run answered, and a recorded run answer loads the index first, so the
 * index is in by then. Before it is, or for an address the recording does not hold, the address under the recorded
 * folder, which answers 404 as a withheld file should.
 */
export function assetUrlNow(address: string): string {
  if (/^(https?:|data:|blob:)/.test(address)) return address;
  if (TRANSPORT === 'live') return `${API_BASE}${address.startsWith('/') ? '' : '/'}${address}`;
  const [p, q] = address.split('?');
  const query: Query = {};
  if (q) new URLSearchParams(q).forEach((v, k) => (query[k] = v));
  const hit = indexLoaded?.entries[requestKey('GET', p.startsWith('/') ? p : `/${p}`, query)];
  return hit?.file ? `${RECORDED_BASE}${hit.file.replace(/^\//, '')}` : `${RECORDED_BASE}${address.replace(/^\//, '')}`;
}
