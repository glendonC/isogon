/**
 * The one way the page asks the backend for anything. Two transports, chosen at build time:
 *
 *   - `live` (the default): HTTP to the backend at `VITE_API_BASE`.
 *   - `recorded`: answers read from a folder served beside the page (`VITE_RECORDED_BASE`, default `recorded/`),
 *     for a public static page. A request is found by its key (`requestKey`) in the folder's `index.json`; a request
 *     with no recorded answer fails with `NotRecorded`, and the page says so in one line (`NOT_RECORDED_LINE`).
 *
 * The key: METHOD, the path with its query sorted by name then value, and for a POST the body as JSON with sorted
 * keys, joined by single spaces. The recorder writes the same keys.
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

/** A request the recorded folder does not hold. */
export class NotRecorded extends Error {
  readonly key: string;
  constructor(key: string) {
    super(NOT_RECORDED_LINE);
    this.name = 'NotRecorded';
    this.key = key;
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

/** The query string, sorted by name then value, without the `?`; empty parameters are left out. */
export function sortedQuery(query?: Query): string {
  if (!query) return '';
  const pairs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1));
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

/** The key a request has in a recorded folder. */
export function requestKey(method: 'GET' | 'POST', path: string, query?: Query, body?: unknown): string {
  const q = sortedQuery(query);
  const head = `${method} ${path}${q ? `?${q}` : ''}`;
  return body === undefined ? head : `${head} ${canonicalJson(body)}`;
}

interface RecordedIndex {
  version: number;
  answers: Record<string, { file: string; status?: number; content_type?: string }>;
}

let indexPromise: Promise<RecordedIndex> | null = null;

function recordedIndex(): Promise<RecordedIndex> {
  if (!indexPromise) {
    indexPromise = fetch(`${RECORDED_BASE}index.json`)
      .then((r) => (r.ok ? (r.json() as Promise<RecordedIndex>) : { version: 1, answers: {} }))
      .catch(() => ({ version: 1, answers: {} }));
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
  const hit = index.answers[key];
  if (!hit) throw new NotRecorded(key);
  const resp = await fetch(`${RECORDED_BASE}${hit.file.replace(/^\//, '')}`, { signal });
  const body = await readBody(resp);
  const status = hit.status ?? resp.status;
  if (status < 200 || status >= 300) throw new HttpError(status, body);
  return body as T;
}

/** GET a JSON route. */
export async function getJson<T>(path: string, query?: Query, init?: { signal?: AbortSignal }): Promise<T> {
  if (TRANSPORT === 'recorded') return recorded<T>(requestKey('GET', path, query), init?.signal);
  const q = sortedQuery(query);
  const resp = await fetch(`${API_BASE}${path}${q ? `?${q}` : ''}`, { signal: init?.signal });
  const body = await readBody(resp);
  if (!resp.ok) throw new HttpError(resp.status, body);
  return body as T;
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
 * Where a file an answer names (`/api/runs/<id>/...`) is fetched from: the backend when live, the recorded folder
 * when recorded. Absolute addresses are left as they are.
 */
export function assetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  if (TRANSPORT === 'recorded') return `${RECORDED_BASE}${path.replace(/^\//, '')}`;
  return `${API_BASE}${path}`;
}
