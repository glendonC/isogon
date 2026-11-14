import type { DynamicRegionRun } from '../stage/types';

/**
 * Real runs: runs on NASA FIRMS rows, requested with `source: "firms"` and a `start`, and the blind test a holdout
 * run carries. Read as the backend sends it; nothing here invents a value: what the response leaves out stays absent
 * and the UI says so.
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A run is real only when its payload says `source: "firms"`. Provenance prose is never read. */
export function isRealRun(run: DynamicRegionRun | null | undefined): boolean {
  if (!run) return false;
  const r = run as unknown as Obj;
  return r.source === 'firms' || obj(r.metrics)?.source === 'firms';
}

export interface RealRunStart {
  /** As the backend gives it and takes it back as `start`: a UTC date or time ("2021-07-22T20:34:00Z"). */
  start: string;
  /** VIIRS pixels in the region box over the run's 24 overpasses, when the list says. */
  viirsPixels: number | null;
  /** The list's own pick for its month (`busiest_in_month`). */
  busiestInMonth: boolean;
}

/**
 * Real run starts from the calendar response's `real_run_starts`. Accepts a plain list
 * (strings or `{ start }`), or the start-date answer of `backend/model/real_run.py::real_start_dates`, whose
 * `worth_showing` list is used, or whose `starts` are kept only when `worth_showing` is not false.
 */
export function parseRunStarts(raw: unknown): RealRunStart[] {
  const o = obj(raw);
  const list: unknown[] | null = Array.isArray(raw)
    ? raw
    : o && Array.isArray(o.worth_showing)
      ? o.worth_showing
      : o && Array.isArray(o.starts)
        ? o.starts
        : null;
  if (!list) return [];
  const out: RealRunStart[] = [];
  for (const item of list) {
    const io = obj(item);
    if (io && io.worth_showing === false) continue;
    const start = str(item) ?? str(io?.start);
    if (!start || !/^\d{4}-\d{2}-\d{2}/.test(start)) continue;
    out.push({ start, viirsPixels: num(io?.viirs_pixels_in_box), busiestInMonth: io?.busiest_in_month === true });
  }
  return out;
}

/** The entry with the most VIIRS pixels in the box; ties keep the earlier entry. */
function busiest(starts: readonly RealRunStart[]): RealRunStart | null {
  let best: RealRunStart | null = null;
  for (const s of starts) if (s.viirsPixels !== null && (best === null || s.viirsPixels > (best.viirsPixels ?? -1))) best = s;
  return best;
}

/**
 * The run a region opens on: `default_start` from the list when it names one of its entries,
 * otherwise the entry with the most VIIRS pixels in the box. Never simply the first entry: the list is in date
 * order, and its first entry for Feather River is a small August 2012 fire, not the Dixie fire the product is about.
 */
export function defaultRunStart(raw: unknown, starts: readonly RealRunStart[]): string | null {
  const named = str(obj(raw)?.default_start);
  if (named) {
    const hit = starts.find((s) => s.start === named) ?? starts.find((s) => s.start.slice(0, 10) === named.slice(0, 10));
    if (hit) return hit.start;
  }
  return busiest(starts)?.start ?? null;
}

/**
 * The run a selected month opens: the default when it falls in that month, else the entry the list marks
 * `busiest_in_month`, else the month's entry with the most VIIRS pixels.
 */
export function startForMonth(ym: string, starts: readonly RealRunStart[], defaultStart: string | null): string | null {
  if (defaultStart?.startsWith(ym)) return defaultStart;
  const inMonth = starts.filter((s) => s.start.startsWith(ym));
  return inMonth.find((s) => s.busiestInMonth)?.start ?? busiest(inMonth)?.start ?? inMonth[0]?.start ?? null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2021-07-22T20:34:00Z" or "2021-07-22" as "22 July 2021". */
export function utcDay(ts: string): string {
  const [y, m, d] = ts.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** A UTC span in words: "22 to 24 July 2021", "30 July to 2 August 2021", or one day. */
export function utcSpan(a: string, b: string): string {
  const [y1, m1, d1] = a.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = b.slice(0, 10).split('-').map(Number);
  if (y1 === y2 && m1 === m2) return d1 === d2 ? utcDay(a) : `${d1} to ${d2} ${MONTHS[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} to ${d2} ${MONTHS[m2 - 1]} ${y1}`;
  return `${utcDay(a)} to ${utcDay(b)}`;
}

/** The first VIIRS 375 m fire granule (Suomi NPP VNP14IMG, NASA CMR). Before it only MODIS flew. */
export const SHARP_SATELLITE_FROM = '2012-01-17T00:00:00Z';

/** A real run wholly before the first VIIRS pass, so nothing sharp exists to hide or reveal. */
export function beforeSharpSatellite(run: DynamicRegionRun | null): boolean {
  const w = runWindow(run);
  return isRealRun(run) && w !== null && Date.parse(w.last) < Date.parse(SHARP_SATELLITE_FROM);
}

/**
 * The run a month before 2012 opens: its first day. The start list begins in 2012, and the backend takes the
 * first 24 MODIS overpasses with a detection at or after a start, so a month with MODIS detections has a run.
 */
export function startBeforeSharp(ym: string, modisRate: number | null): string | null {
  return ym < SHARP_SATELLITE_FROM.slice(0, 7) && modisRate !== null && modisRate > 0 ? `${ym}-01` : null;
}

/** The window a real run covers, from its `window` block. */
export function runWindow(run: DynamicRegionRun | null): { first: string; last: string; overpasses: number | null } | null {
  const w = obj((run as unknown as Obj | null)?.window);
  const first = str(w?.first_overpass_utc);
  const last = str(w?.last_overpass_utc);
  return first && last ? { first, last, overpasses: num(w?.overpasses) } : null;
}

export interface ModelStatus {
  status: string;
  reason: string | null;
  parts: Array<{ name: string; status: string }>;
  /** `model.method`, `model.parameters.fitted_on` and the first part's `validated_on`, verbatim. */
  method: string | null;
  fittedOn: string | null;
  validatedOn: string | null;
}

/** `model.status` and the per-part verdicts of `model.learned_parts`, verbatim. */
export function parseModel(run: DynamicRegionRun | null): ModelStatus | null {
  const m = obj((run as unknown as Obj | null)?.model);
  const status = str(m?.status);
  if (!m || !status) return null;
  const parts = (Array.isArray(m.learned_parts) ? m.learned_parts : [])
    .map(obj)
    .filter((p): p is Obj => Boolean(p && str(p.name) && str(p.status)))
    .map((p) => ({ name: String(p.name), status: String(p.status) }));
  const learned = Array.isArray(m.learned_parts) ? m.learned_parts.map(obj) : [];
  return {
    status,
    reason: str(m.status_reason),
    parts,
    method: str(m.method),
    fittedOn: str(obj(m.parameters)?.fitted_on),
    validatedOn: learned.map((p) => str(p?.validated_on)).find(Boolean) ?? null,
  };
}

export interface BlindMethod {
  id: string;
  label: string;
  hitRate: number | null;
  falseAlarmRatio: number | null;
  csiOneCell: number | null;
  frpError: number | null;
  /** Overpasses whose hidden total fell inside the stated interval, of `intervalN`; null when none is stated. */
  intervalCovered: number | null;
  intervalN: number | null;
  intervalLevel: number | null;
}

export interface BlindVerdict {
  id: string;
  ahead: boolean;
  /** Each method's value on this score, by method id. */
  values: Record<string, number>;
  better: 'higher' | 'lower';
}

export interface BlindTest {
  /** Which run it scores: region and start. */
  key: string;
  hiddenPlatforms: string[];
  scoredOverpasses: number | null;
  firstUtc: string | null;
  lastUtc: string | null;
  methods: BlindMethod[];
  verdict: BlindVerdict[];
  definitions: Record<string, string>;
  /**
   * `blind_test.protocol.version`: 2 or more for a test whose hidden rows stay sealed until scoring. Null: the
   * block names no version.
   */
  protocolVersion: number | null;
  protocolNote: string | null;
  /** The run is one of the three 2021 test fires (`blind_test.protocol.test_fire`); its recorded test is elsewhere. */
  testFire: boolean;
}

const METHOD_ORDER = ['reconstruction', 'painted_modis', 'overlap_ratio', 'painted_viirs', 'viirs_ratio'];
const METHOD_LABELS: Record<string, string> = {
  reconstruction: 'Isogon',
  painted_modis: 'MODIS as detected',
  overlap_ratio: 'Overlap ratio',
  painted_viirs: 'VIIRS as detected',
  viirs_ratio: 'VIIRS ratio',
};

/** The `blind_test` block of a real holdout run. */
export function parseBlindTest(run: DynamicRegionRun | null, key: string): BlindTest | null {
  return parseBlindBlock((run as unknown as Obj | null)?.blind_test, key);
}

/** A `blind_test`-shaped block, from a run or from another result in that shape (Terra's morning pass). */
export function parseBlindBlock(block: unknown, key: string): BlindTest | null {
  const bt = obj(block);
  const methodsRaw = obj(bt?.methods);
  if (!bt || !methodsRaw) return null;
  const ids = [
    ...METHOD_ORDER.filter((id) => id in methodsRaw),
    ...Object.keys(methodsRaw).filter((id) => !METHOD_ORDER.includes(id)),
  ];
  const methods: BlindMethod[] = ids.map((id) => {
    const m = obj(methodsRaw[id]) ?? {};
    const strict = obj(m.strict_375m);
    const tol = obj(m.tolerant_1_cell);
    const frp = obj(m.frp_total);
    const iv = obj(m.interval);
    const stated = num(iv?.stated_level);
    return {
      id,
      label: METHOD_LABELS[id] ?? id.replace(/_/g, ' '),
      hitRate: num(strict?.hit_rate),
      falseAlarmRatio: num(strict?.false_alarm_ratio),
      csiOneCell: num(tol?.csi),
      frpError: num(frp?.median_abs_relative_error),
      intervalCovered: stated === null ? null : num(iv?.covered),
      intervalN: stated === null ? null : num(iv?.n),
      intervalLevel: stated,
    };
  });
  const scores = obj(obj(bt.verdict)?.scores) ?? {};
  const verdict: BlindVerdict[] = Object.entries(scores).map(([id, v]) => {
    const values: Record<string, number> = {};
    for (const [k, x] of Object.entries(obj(v) ?? {})) if (typeof x === 'number' && Number.isFinite(x)) values[k] = x;
    return {
      id,
      ahead: obj(v)?.beats_every_baseline === true,
      values,
      better: obj(v)?.better_is === 'lower' ? 'lower' : 'higher',
    };
  });
  const definitions: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(bt.definitions) ?? {})) if (typeof v === 'string') definitions[k] = v;
  const win = Array.isArray(bt.window_utc) ? bt.window_utc : [];
  return {
    key,
    hiddenPlatforms: (Array.isArray(bt.hidden_platforms) ? bt.hidden_platforms : []).filter(
      (p): p is string => typeof p === 'string',
    ),
    scoredOverpasses: num(bt.scored_overpasses),
    firstUtc: str(win[0]),
    lastUtc: str(win[1]),
    methods,
    verdict,
    definitions,
    protocolVersion: ((v) => (Number.isFinite(v) ? v : null))(Number(obj(bt.protocol)?.version ?? NaN)),
    protocolNote: str(obj(bt.protocol)?.note),
    testFire: obj(bt.protocol)?.test_fire === true,
  };
}

export interface IntensityLegend {
  scale: 'log10' | 'linear';
  unit: string;
  min: number;
  max: number;
  /** Ticks along the bar, `at` from 0 to 1. */
  ticks: Array<{ at: number; mwKm2: number }>;
}

/**
 * The intensity legend of a real run, from its `encoding` block: `scale`, `min_mw_km2`, `max_mw_km2`, and
 * `legend_ticks` (each tick's byte gives its place on the bar). Without ticks, decades are placed on the log scale.
 * Null when the run carries no usable encoding.
 */
export function parseIntensityLegend(run: DynamicRegionRun | null): IntensityLegend | null {
  const e = obj((run as unknown as Obj | null)?.encoding);
  const min = num(e?.min_mw_km2);
  const max = num(e?.max_mw_km2);
  if (!e || min === null || max === null || !(max > min) || !(min > 0)) return null;
  const scale = typeof e.scale === 'string' && e.scale.toLowerCase().startsWith('log') ? 'log10' : 'linear';
  const at = (v: number) =>
    scale === 'log10' ? Math.log10(v / min) / Math.log10(max / min) : (v - min) / (max - min);
  const given = (Array.isArray(e.legend_ticks) ? e.legend_ticks : [])
    .map(obj)
    .map((t) => {
      const v = num(t?.mw_km2);
      const b = num(t?.byte);
      return v === null ? null : { mwKm2: v, at: b !== null ? Math.max(0, b - 1) / 254 : at(v) };
    })
    .filter((t): t is { mwKm2: number; at: number } => t !== null);
  const decades: Array<{ mwKm2: number; at: number }> = [];
  if (scale === 'log10') {
    for (let k = Math.ceil(Math.log10(min)); k <= Math.floor(Math.log10(max)); k += 1) decades.push({ mwKm2: 10 ** k, at: at(10 ** k) });
  }
  const ticks = given.length > 0 ? given : decades;
  return {
    scale,
    unit: str(e.unit)?.replace('km2', 'km²') ?? 'MW/km²',
    min,
    max,
    ticks: ticks.filter((t) => t.at >= -1e-6 && t.at <= 1 + 1e-6),
  };
}

/** Hidden overpasses of a blind run (`blind_test.reveal.overpasses`), shown only after scoring. */
export interface RevealOverpass {
  platform: string;
  timeUtc: string | null;
  nearestFrame: number | null;
  pixelsInBox: number | null;
}

export function parseReveal(run: DynamicRegionRun | null): RevealOverpass[] | null {
  const rv = obj(obj((run as unknown as Obj | null)?.blind_test)?.reveal);
  if (!rv || !Array.isArray(rv.overpasses)) return null;
  return rv.overpasses
    .map(obj)
    .filter((o): o is Obj => o !== null)
    .map((o) => ({
      platform: str(o.platform) ?? 'VIIRS',
      timeUtc: str(o.time_utc),
      nearestFrame: num(o.nearest_frame),
      pixelsInBox: num(o.pixels_in_box),
    }));
}

/**
 * The blind run as the terrain shows it after the reveal: the same run, its window and estimate unchanged, with
 * each hidden overpass of `blind_test.reveal` laid onto its own held-out frame, or onto the frame it falls nearest
 * when it names none, as a VIIRS pass with its own footprints. A run that carries no reveal keeps its hidden frames
 * marked `..._held_out`; for it the reveal only un-marks them. The run id gets a suffix so the stage builds this
 * view instead of reusing the blind run's cached one.
 */
export function withReveal(run: DynamicRegionRun): DynamicRegionRun {
  const r = run as unknown as Obj;
  const op = obj(r.observer_passes);
  if (!op || !Array.isArray(op.frames)) return run;
  const frames: unknown[] = op.frames.map((f) => (obj(f) ? { ...(f as Obj) } : f));
  const overs = obj(obj(r.blind_test)?.reveal)?.overpasses;
  let epochs = r.epoch_summaries;
  if (Array.isArray(overs)) {
    const codes = obj(op.sensor_codes) ?? {};
    for (const o of overs.map(obj)) {
      // A hidden pass is its own held-out frame (`frame`); one that names none is laid on its nearest frame.
      const nf = num(o?.frame) ?? num(o?.nearest_frame);
      const fps = Array.isArray(o?.footprints) ? (o?.footprints as unknown[]) : [];
      const frame = nf !== null ? obj(frames[nf]) : null;
      if (!o || !frame || fps.length === 0) continue;
      if (frame.held_out === true) {
        // The pass is shown now: its frame draws as the pass it is, with the detections the scorer held.
        frame.held_out = false;
        frame.revealed = true;
        if (typeof frame.epistemic_regime === 'string') frame.epistemic_regime = frame.epistemic_regime.replace(/_held_out$/, '');
        frame.detections_in_box = (num(frame.detections_in_box) ?? 0) + fps.length;
      }
      const platform = str(o.platform) ?? 'VIIRS_SNPP';
      const code = num(o.sensor_code) ?? Number(Object.entries(codes).find(([, v]) => v === platform)?.[0] ?? NaN);
      frame.passes = [
        ...(Array.isArray(frame.passes) ? frame.passes : []),
        { sensor: platform, sensor_code: code, revealed_after_scoring: true, footprint_count: fps.length },
      ];
      frame.footprints = [...(Array.isArray(frame.footprints) ? frame.footprints : []), ...fps];
    }
  } else {
    const unmark = (v: unknown) => (typeof v === 'string' ? v.replace(/_held_out$/, '') : v);
    for (const f of frames) {
      const fo = obj(f);
      if (fo) fo.epistemic_regime = unmark(fo.epistemic_regime);
    }
    if (Array.isArray(epochs)) epochs = epochs.map((e) => (obj(e) ? { ...(e as Obj), regime: unmark((e as Obj).regime) } : e));
  }
  return {
    ...r,
    run_id: `${String(r.run_id)}_revealed`,
    observer_passes: { ...op, frames },
    epoch_summaries: epochs,
  } as unknown as DynamicRegionRun;
}

/** Plain names for the verdict's score ids. */
export const SCORE_NAMES: Record<string, string> = {
  csi_strict_375m: 'agreement at 375 m',
  csi_one_cell_tolerance: 'agreement within one cell',
  hit_rate_at_equal_area: 'hits at equal area',
  brier: 'burn chances (Brier score)',
  pixel_count_error_of_sums: 'pixel count error',
  frp_error_of_sums: 'fire power total error',
  frp_median_abs_relative_error: 'fire power error per pass',
};

/** Platform codes as people say them. */
export function platformName(code: string): string {
  return (
    (
      {
        VIIRS_SNPP: 'Suomi NPP',
        VIIRS_NOAA20: 'NOAA-20',
        VIIRS_NOAA21: 'NOAA-21',
        MODIS_TERRA: 'Terra',
        MODIS_AQUA: 'Aqua',
      } as Record<string, string>
    )[code] ?? code.replace(/_/g, ' ')
  );
}

/** A fraction as a whole percent. A value the response leaves out reads "not sent", never a guess. */
export function pct(v: number | null): string {
  if (v === null) return 'not sent';
  return `${Math.round(v * 100)}%`;
}
