/**
 * The model in the visitor's browser, for a page with no backend: the backend's own held-out run, its reveal and a
 * round of the game, computed by a worker (`public/runtime/model-worker.js`, which loads Python compiled to
 * WebAssembly and the backend's archives from the page itself) instead of read from the recording.
 *
 * A place is computed here when the page's browser pack holds it (`run/browser-pack.json`, its `places`); every other
 * place, and every request when the model cannot run, is answered by the recording: a browser without workers or
 * WebAssembly, a device that says it has under 4 GB of memory, a runtime that fails to load, or a first answer that
 * takes over twenty seconds (the worker goes on loading, and a later request takes it when it is ready). The page says
 * which it is doing in one line (`onAnswerSource`).
 *
 * A run's answer here has no routes for its files (the browser entry point gives `assets: {}`): its frames, belief
 * and exports are the bytes the run made, given to the page as object URLs, and its terrain is the recording's, which
 * a run's terrain does not depend on (`withPageAssets`).
 */

export type ModelState = 'unknown' | 'off' | 'loading' | 'ready' | 'failed';

/** What answered the page's last fire, for its one line. */
export interface AnswerSource {
  source: 'browser' | 'recording';
  /** Why the recording answered a place the browser could compute, when it did. */
  why: string | null;
  /** Seconds the browser took for its last run, when it answered one. */
  seconds: number | null;
}

export interface PackManifest {
  core: { file: string; bytes: number; sha256: string };
  places: Record<string, { file: string; start?: string; bytes: number; sha256: string }>;
  replay_only?: Record<string, string>;
}

export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  terminate(): void;
}

/** How long the page waits for the browser's answer before it takes the recording's. */
export const BROWSER_BUDGET_MS = 20_000;
/** A device that says it has less memory than this (GB, `navigator.deviceMemory`) replays the recording. */
export const MIN_DEVICE_MEMORY_GB = 4;

/** The browser could not answer in time, or at all: the caller takes the recording. */
export class BrowserModelUnavailable extends Error {
  readonly why: string;
  constructor(why: string) {
    super(why);
    this.why = why;
    this.name = 'BrowserModelUnavailable';
  }
}

/** The backend's own refusal, made in the browser (a window the closed rule closes): the route's 409. */
export class BrowserRefusal extends Error {
  readonly kind: string;
  constructor(message: string, kind: string) {
    super(message);
    this.kind = kind;
    this.name = 'BrowserRefusal';
  }
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export interface BrowserModelOptions {
  workerUrl: string;
  packUrl: string;
  makeWorker?: (url: string) => WorkerLike;
  fetchJson?: (url: string) => Promise<unknown>;
  /** What the environment allows: workers, WebAssembly and enough memory; null when it does. */
  environmentRefusal?: () => string | null;
  budgetMs?: number;
}

function defaultRefusal(): string | null {
  const g = globalThis as { Worker?: unknown; WebAssembly?: unknown; navigator?: { deviceMemory?: number } };
  if (typeof g.Worker !== 'function') return 'this browser runs no workers';
  if (typeof g.WebAssembly !== 'object') return 'this browser runs no WebAssembly';
  const mem = g.navigator?.deviceMemory;
  if (typeof mem === 'number' && mem < MIN_DEVICE_MEMORY_GB) return `this device says it has ${mem} GB of memory, under the ${MIN_DEVICE_MEMORY_GB} GB the model needs`;
  return null;
}

/** A Python error's text without the exception's module path: "backend.x.ClosedWindow: words" gives its kind and words. */
export function splitPythonError(text: string): { kind: string; message: string } {
  const lines = String(text).trim().split('\n');
  const last = lines[lines.length - 1] ?? '';
  const m = /^([A-Za-z_][\w.]*?)(?:\.([A-Za-z_]\w*))?: (.*)$/.exec(last);
  if (!m) return { kind: 'Error', message: last || String(text) };
  return { kind: m[2] ?? m[1], message: m[3] };
}

export class BrowserModel {
  state: ModelState = 'unknown';
  why: string | null = null;
  private manifestPromise: Promise<PackManifest | null> | null = null;
  private worker: WorkerLike | null = null;
  private pending = new Map<number, Pending>();
  private seq = 0;
  private readonly runIds = new Map<string, string>();
  private readonly pictureUrls = new Map<string, Promise<Record<string, string>>>();
  readonly rounds = new Set<string>();
  private readonly opts: BrowserModelOptions;

  constructor(opts: BrowserModelOptions) {
    this.opts = opts;
  }

  private budget(): number {
    return this.opts.budgetMs ?? BROWSER_BUDGET_MS;
  }

  manifest(): Promise<PackManifest | null> {
    this.manifestPromise ??= (this.opts.fetchJson ?? ((u) => fetch(u).then((r) => (r.ok ? r.json() : null))))(this.opts.packUrl)
      .then((m) => (m && typeof m === 'object' && (m as PackManifest).places ? (m as PackManifest) : null))
      .catch(() => null)
      .then((m) => {
        if (!m && this.state === 'unknown') this.state = 'off';
        return m;
      });
    return this.manifestPromise;
  }

  /** Whether the browser may compute `regionId`: the pack holds it and the model has not failed here. */
  async holds(regionId: string): Promise<boolean> {
    if (this.state === 'failed') return false;
    const m = await this.manifest();
    if (!m || !m.places[regionId]) return false;
    const refusal = (this.opts.environmentRefusal ?? defaultRefusal)();
    if (refusal) {
      this.fail(refusal);
      return false;
    }
    return true;
  }

  /** The manifest's reason a place is replayed, when it names one. */
  async replayReason(regionId: string): Promise<string | null> {
    return (await this.manifest())?.replay_only?.[regionId] ?? null;
  }

  private fail(why: string): void {
    this.state = 'failed';
    this.why = why;
    for (const p of this.pending.values()) p.reject(new BrowserModelUnavailable(why));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const w = (this.opts.makeWorker ?? ((u) => new Worker(u) as unknown as WorkerLike))(this.opts.workerUrl);
    w.onmessage = (ev) => {
      const m = ev.data as { id: number; step?: string; ok?: boolean; value?: unknown; error?: string; where?: string };
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.step) {
        if (this.state !== 'ready') this.state = 'loading';
        return;
      }
      this.pending.delete(m.id);
      if (m.ok) {
        this.state = 'ready';
        p.resolve(m.value);
        return;
      }
      // A failure while loading the runtime or the core is the browser's for this page; one while running is the call's.
      if (m.where === 'runtime' || m.where === 'core') {
        this.fail(`the model did not load in this browser (${String(m.error).slice(0, 160)})`);
        p.reject(new BrowserModelUnavailable(this.why ?? 'the model did not load'));
        return;
      }
      if (m.where === 'place') {
        p.reject(new BrowserModelUnavailable(`this place's files did not load (${String(m.error).slice(0, 160)})`));
        return;
      }
      const { kind, message } = splitPythonError(String(m.error));
      p.reject(kind === 'ClosedWindow' ? new BrowserRefusal(message, kind) : new Error(message));
    };
    w.onerror = () => this.fail('the model\'s worker stopped');
    this.worker = w;
    return w;
  }

  /** One call of the browser entry point, within the page's budget. */
  call<T>(op: string, args: Record<string, unknown>, budgetMs = this.budget()): Promise<T> {
    if (this.state === 'failed') return Promise.reject(new BrowserModelUnavailable(this.why ?? 'the model failed here'));
    const w = this.ensureWorker();
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Too slow this time: this request takes the recording; the worker goes on and answers later ones.
        this.pending.delete(id);
        reject(new BrowserModelUnavailable(`the model took over ${Math.round(budgetMs / 1000)} s in this browser`));
      }, budgetMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v as T); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      w.postMessage({ id, op, args });
    });
  }

  private async json<T>(op: string, args: Record<string, unknown>): Promise<T> {
    return JSON.parse(await this.call<string>(op, args)) as T;
  }

  /** A held-out run (`reveal` false) or its reveal, as the route answers it, without its files' addresses. */
  async run(regionId: string, start: string, reveal: boolean): Promise<Record<string, unknown>> {
    const key = `${regionId}|${start}`;
    const first = async () => {
      const a = await this.json<Record<string, unknown>>('held_out_run', { region_id: regionId, start });
      this.runIds.set(key, String(a.run_id));
      return a;
    };
    if (!reveal) return first();
    if (!this.runIds.has(key)) await first();
    try {
      return await this.json('reveal', { run_id: this.runIds.get(key), region_id: regionId });
    } catch (e) {
      if (!(e instanceof Error) || !/no run .* is kept here/.test(e.message)) throw e;
      await first();                                   // the worker let the run go: made again, then revealed
      return this.json('reveal', { run_id: this.runIds.get(key), region_id: regionId });
    }
  }

  /** The run's files the browser made, as object URLs (made once per run). */
  pictures(runId: string, regionId: string): Promise<Record<string, string>> {
    let p = this.pictureUrls.get(runId);
    if (!p) {
      p = this.call<Record<string, ArrayBuffer>>('pictures', { run_id: runId, region_id: regionId }).then((files) => {
        const out: Record<string, string> = {};
        for (const [name, buf] of Object.entries(files)) {
          const type = name.endsWith('.geojson') ? 'application/geo+json' : name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream';
          out[name] = URL.createObjectURL(new Blob([buf], { type }));
        }
        return out;
      });
      p.catch(() => this.pictureUrls.delete(runId));
      this.pictureUrls.set(runId, p);
    }
    return p;
  }

  /** A round of the game started here; its looks and state stay here (its id is the browser's). */
  async roundStart(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = await this.json<Record<string, unknown>>('round_start', body);
    if (typeof a.round_id === 'string') this.rounds.add(a.round_id);
    return a;
  }

  roundLook(body: { round_id: string; decision: number; action: number }, regionId?: string): Promise<Record<string, unknown>> {
    return this.json('round_look', { ...body, region_id: regionId });
  }

  roundState(roundId: string): Promise<Record<string, unknown>> {
    return this.json('round_state', { round_id: roundId });
  }
}

/**
 * A run answer made in the browser, given the addresses the page draws from: the terrain's (the pack, the DEMs, the
 * overview) from a recorded answer of the same place, and the run's own files (`reconstruction_u8.bin`,
 * `belief_u8.bin` and the exports) as the object URLs of the bytes the browser made.
 */
export function withPageAssets(answer: Record<string, unknown>, recorded: Record<string, unknown> | null,
                               files: Record<string, string>): Record<string, unknown> {
  const fromRecording = (recorded?.assets ?? {}) as Record<string, unknown>;
  const assets: Record<string, unknown> = {
    ...fromRecording,
    ...(files['reconstruction_u8.bin'] ? { reconstruction_u8_url: files['reconstruction_u8.bin'] } : {}),
    ...(files['export.geojson'] ? { export_geojson_url: files['export.geojson'] } : {}),
    ...(files['export.csv'] ? { export_csv_url: files['export.csv'] } : {}),
  };
  const out: Record<string, unknown> = { ...answer, assets };
  if (recorded?.imagery && !answer.imagery) out.imagery = recorded.imagery;
  const bf = answer.belief_frames as Record<string, unknown> | undefined;
  if (bf && files['belief_u8.bin']) out.belief_frames = { ...bf, url: files['belief_u8.bin'] };
  return out;
}
