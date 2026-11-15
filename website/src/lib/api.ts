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
}

let indexPromise: Promise<RecordedIndex> | null = null;
/** The index once it has arrived, for the one synchronous reader (`assetUrlNow`). */
let indexLoaded: RecordedIndex | null = null;

function recordedIndex(): Promise<RecordedIndex> {
  if (!indexPromise) {
    indexPromise = fetch(`${RECORDED_BASE}index.json`)
      .then((r) => (r.ok ? (r.json() as Promise<RecordedIndex>) : { version: 1, entries: {} }))
      .then((idx) => ({ version: idx.version, entries: idx.entries ?? {} }))
      .catch(() => ({ version: 1, entries: {} }))
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
  if (TRANSPORT === 'recorded') return recorded<T>(requestKey('POST', path, undefined, body), init?.signal);
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
  if (/^https?:\/\//.test(path)) return path;
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
  if (/^(https?:|data:)/.test(address)) return address;
  if (TRANSPORT === 'live') return `${API_BASE}${address.startsWith('/') ? '' : '/'}${address}`;
  const [p, q] = address.split('?');
  const query: Query = {};
  if (q) new URLSearchParams(q).forEach((v, k) => (query[k] = v));
  const hit = indexLoaded?.entries[requestKey('GET', p.startsWith('/') ? p : `/${p}`, query)];
  return hit?.file ? `${RECORDED_BASE}${hit.file.replace(/^\//, '')}` : `${RECORDED_BASE}${address.replace(/^\//, '')}`;
}
