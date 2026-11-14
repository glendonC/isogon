import type { DynamicRegionRun } from '../stage/types';

/**
 * The real path (CONTRACT 8): runs on NASA FIRMS rows, requested with `source: "firms"` and a `start` date, and
 * the blind test score that a holdout run carries. Nothing here invents a value: what the backend does not send
 * stays absent and the UI says so.
 */

/**
 * A run is real only when its payload says `source: "firms"` (top level or in `metrics`). Provenance prose is
 * not read: a reworded simulated note must never turn a simulated run into a real one.
 */
export function isRealRun(run: DynamicRegionRun | null | undefined): boolean {
  if (!run) return false;
  const r = run as unknown as Record<string, unknown>;
  const m = (r.metrics ?? {}) as Record<string, unknown>;
  return r.source === 'firms' || m.source === 'firms';
}

export interface RealRunStart {
  /** UTC date the backend takes as `start`, for example "2021-08-03". */
  start: string;
  label: string;
}

/**
 * The start dates the model lane publishes for real runs. Read from whichever the backend offers:
 * `real_run_starts` on the calendar response, or `GET /api/runs/starts?region_id=&source=firms`
 * (`{ starts: [...] }` or a plain array; each item a date string or `{ start, label }`). Until either exists
 * the list is empty and no real run is requested.
 */
export function parseRunStarts(raw: unknown): RealRunStart[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? ((raw as Record<string, unknown>).starts ?? (raw as Record<string, unknown>).real_run_starts)
      : null;
  if (!Array.isArray(list)) return [];
  const out: RealRunStart[] = [];
  for (const item of list) {
    const start = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as Record<string, unknown>).start : null;
    if (typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(start)) continue;
    const label = item && typeof item === 'object' && typeof (item as Record<string, unknown>).label === 'string'
      ? String((item as Record<string, unknown>).label)
      : start.slice(0, 10);
    out.push({ start: start.slice(0, 10), label });
  }
  return out;
}

export async function fetchRunStarts(apiBase: string, regionId: string, signal: AbortSignal): Promise<RealRunStart[]> {
  try {
    const r = await fetch(`${apiBase}/api/runs/starts?region_id=${encodeURIComponent(regionId)}&source=firms`, { signal });
    if (!r.ok) return [];
    return parseRunStarts(await r.json());
  } catch {
    return [];
  }
}

export interface ScoreRow {
  id: string;
  label: string;
  hitRate: number | null;
  falseAlarmRatio: number | null;
  frpError: number | null;
  coverage: number | null;
  coverageLevel: number | null;
}

export interface BlindScore {
  /** Which run it scores: region and start. */
  key: string;
  hidden: string;
  overpasses: number | null;
  firstUtc: string | null;
  lastUtc: string | null;
  rows: ScoreRow[];
  /** Metric definitions the response carries, keyed by metric id, shown as header titles. */
  definitions: Record<string, string>;
}

const METHOD_LABELS: Record<string, string> = {
  isogon: 'Isogon',
  model: 'Isogon',
  reconstruction: 'Isogon',
  painted_modis: 'MODIS as detected',
  overlap_ratio: 'Overlap ratio',
};

function pickNum(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * The score a holdout run carries (CONTRACT 8): read from `blind_test`, `holdout_score` or `metrics.blind_test`,
 * with methods as an array or an object keyed by method id. Metric names follow `backend/eval/metrics.py`
 * (hit rate, false alarm ratio, FRP error, interval coverage).
 */
export function parseBlindScore(run: DynamicRegionRun | null, key: string): BlindScore | null {
  if (!run) return null;
  const r = run as unknown as Record<string, unknown>;
  const metrics = (r.metrics ?? {}) as Record<string, unknown>;
  const src = (r.blind_test ?? r.holdout_score ?? metrics.blind_test) as Record<string, unknown> | undefined;
  if (!src || typeof src !== 'object') return null;
  const methodsRaw = src.methods;
  const entries: Array<[string, Record<string, unknown>]> = Array.isArray(methodsRaw)
    ? methodsRaw
        .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
        .map((m) => [String(m.id ?? m.method ?? m.name ?? ''), m])
    : methodsRaw && typeof methodsRaw === 'object'
      ? Object.entries(methodsRaw as Record<string, Record<string, unknown>>)
      : [];
  const rows: ScoreRow[] = entries
    .filter(([, m]) => m && typeof m === 'object')
    .map(([id, m]) => ({
      id,
      label: METHOD_LABELS[id] ?? (typeof m.label === 'string' ? m.label : id.replace(/_/g, ' ')),
      hitRate: pickNum(m, ['hit_rate', 'hit']),
      falseAlarmRatio: pickNum(m, ['false_alarm_ratio', 'FAratio', 'far']),
      frpError: pickNum(m, ['frp_median_abs_rel_error', 'frp_abs_median', '|FRP|med', 'frp_error']),
      coverage: pickNum(m, ['interval_coverage', 'coverage', 'cover']),
      coverageLevel: pickNum(m, ['interval_level', 'coverage_level', 'level']),
    }));
  if (rows.length === 0) return null;
  // The model first, then the baselines, in the order the backend gave them.
  rows.sort((a, b) => Number(b.label === 'Isogon') - Number(a.label === 'Isogon'));
  return {
    key,
    hidden: typeof src.hidden === 'string' ? src.hidden : 'VIIRS',
    overpasses: pickNum(src, ['scored_overpasses', 'overpasses', 'n_overpasses']),
    firstUtc: typeof src.first_utc === 'string' ? src.first_utc : null,
    lastUtc: typeof src.last_utc === 'string' ? src.last_utc : null,
    rows,
    definitions: readDefinitions(src.definitions ?? src.metric_definitions),
  };
}

function readDefinitions(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const d of raw) {
      if (d && typeof d === 'object' && typeof d.id === 'string' && typeof d.definition === 'string') out[d.id] = d.definition;
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
      else if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).definition === 'string') {
        out[k] = String((v as Record<string, unknown>).definition);
      }
    }
  }
  return out;
}

/** A fraction as a whole percent. A metric the response leaves out reads "not sent", never a guess. */
export function pct(v: number | null): string {
  if (v === null) return 'not sent';
  return `${Math.round(v * 100)}%`;
}
