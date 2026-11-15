import { getJson, HttpError, type Query } from '../../lib/api.ts';
import type { Box } from '../../app/places';

/**
 * The Record's data: the fire record of a place (`GET /api/calendar?source=firms&region_id=`) or of any box drawn on
 * the Earth (`GET /api/cube/record?box=w,s,e,n`, the fire cube's answer in the calendar's shape), and this month so far
 * against its median (`GET /api/calendar/current`). Every figure the screen shows comes from these answers; nothing is
 * computed here but sums and positions. This month so far is asked for only when the visitor asks.
 */

/**
 * A place whose record is read: a region of the registry, or any box. A box may carry the route the registry names for
 * a box (`box_calendar.route`, with `<west>,<south>,<east>,<north>` in it); it is used where it is the cube's.
 */
export type RecordPlace = { kind: 'region'; regionId: string; name: string } | { kind: 'box'; box: Box; name: string; route?: string | null };

/**
 * The route of a box's record: the fire cube's, which answers any box on Earth on whole squares of its grid and says
 * how many of them hold rows. A template the registry names is filled with the box where it is a route of the cube.
 */
export function boxRoute(box: Box, template?: string | null): { path: string; query: Query } {
  const corners = box.map((n) => String(Math.round(n * 10000) / 10000)).join(',');
  if (template && template.startsWith('/api/cube/') && template.includes('<west>')) {
    const [path, q] = template.replace('<west>,<south>,<east>,<north>', corners).split('?');
    const query: Query = {};
    if (q) new URLSearchParams(q).forEach((v, k) => (query[k] = v));
    return { path, query };
  }
  return { path: '/api/cube/record', query: { box: corners } };
}

/**
 * A box as the cube reads it: the box drawn, the box on whole squares of the grid (every square it touches), how many
 * squares that is and how many hold a row of a loaded country's files. A square with none is not loaded; in a whole
 * world (`complete`) that means no detection there in the files.
 */
export interface BoxGrid {
  asked: Box;
  box: Box;
  /** The side of a square, in degrees. */
  step: number;
  cells: number;
  loaded: number;
  complete: boolean;
}

/** A box in which no square holds a row: not a record of zeros, and said so. */
export class NotLoaded extends Error {
  readonly grid: BoxGrid;
  constructor(grid: BoxGrid) {
    super('not loaded');
    this.name = 'NotLoaded';
    this.grid = grid;
  }
}

export interface RecordMonth {
  ym: string;
  year: number;
  month: number;
  /** Harmonized rate, detections per 1,000 km² a day on the Suomi NPP scale; null when no sensor flew. */
  value: number | null;
  p10: number | null;
  p90: number | null;
  /** The median of this calendar month over the years, and this month's rank among them (1 = most burning). */
  median: number | null;
  rank: number | null;
  rankOf: number | null;
  /** This month over the median of its calendar month, as the record serves it (2 is twice a usual one). */
  timesUsual: number | null;
  /**
   * The month as the satellite of its time counted it, with no correction: the sharp satellite's rate where it flew,
   * else the coarse one's. Same unit as `value`.
   */
  asCounted: number | null;
  counts: Array<{ platform: string; total: number }>;
}

export interface RecordYear {
  year: number;
  /** Mean harmonized rate over the year's months with data. */
  mean: number | null;
  months: number;
}

export interface RunStartRef {
  start: string;
  label: string;
}

export interface FireRecord {
  place: RecordPlace;
  /** "Feather River & Plumas, CA" or "39.31 N to 40.31 N, 121.55 W to 120.55 W". */
  label: string;
  /** Plain words of the rate's unit. */
  unit: string;
  firstMonth: string;
  lastMonth: string;
  firstYear: number;
  lastYear: number;
  months: Map<string, RecordMonth>;
  /** Month 1 to 12: its median over the years. */
  climatology: Array<{ month: number; median: number | null; years: number | null }>;
  years: RecordYear[];
  /** Median error of a year left out of the fit, harmonized and not. */
  heldOut: { harmonized: number; raw: number } | null;
  /** The first and last month each kind of satellite has a rate here: the coarse one (MODIS) and the sharp one (VIIRS). */
  spans: { coarse: [string, string] | null; sharp: [string, string] | null };
  /** How many times more the sharp satellite flags than the coarse one, over the months both flew. */
  sharpRatio: number | null;
  /** Rows the overlap fit stood on. */
  fitRows: { modis: number; viirs: number } | null;
  /** Real runs that can open, by start (a region's record only). */
  runStarts: RunStartRef[];
  /** The rule a start must meet to open a run, as the route states it. */
  runRule: string | null;
  /** The current month's route for this place, as the record names it. */
  currentRoute: string | null;
  /** A box read on the cube's grid; null for a region, or where the answer carries no grid. */
  grid: BoxGrid | null;
  /**
   * The method the months are put on one scale by (`harmonization_method.id`), its interval's level (0.8 for the
   * 10th to 90th percentile), and how often a month's interval held the newer satellite's own count over the months
   * of the years hidden in turn, as the answer's check measured it.
   */
  method: { id: string | null; level: number | null; monthsHeld: { held: number; of: number } | null };
  /**
   * Where the answer's check finds the two satellites' ratio does not hold from year to year
   * (`harmonization_method.validation.ratio_stability`, `stable: false`): how many years hidden in turn were tested,
   * how many missed by more than the rule's factor, and that factor. Null where the place is stable or not tested.
   */
  unstable: { departing: number; tested: number; factor: number | null } | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const box4 = (v: unknown): Box | null => (Array.isArray(v) && v.length === 4 && v.every((x) => num(x) !== null) ? (v as Box) : null);

/**
 * The grid of a box from the cube's answer: its `cube` block, or the body of its answer for a box with no loaded square
 * (`state: "not_loaded"`, which gives the squares but no count of loaded ones, since that is none).
 */
export function gridOf(c: Obj | null, asked: Box | null): BoxGrid | null {
  const box = box4(c?.grid_box);
  const cells = num(c?.cells);
  const loaded = num(c?.cells_loaded) ?? (c?.state === 'not_loaded' ? 0 : null);
  if (!c || !box || cells === null || loaded === null) return null;
  return { asked: box4(c.box_asked) ?? asked ?? box, box, step: num(c.grid_step_deg) ?? 0.25, cells, loaded, complete: c.world_complete === true };
}
const PLATFORMS = ['Terra', 'Aqua', 'Suomi NPP', 'NOAA-20', 'NOAA-21'];

function unitWords(u: unknown): string {
  if (typeof u === 'string' && u.startsWith('suomi_npp_equivalent')) return 'detections per 1,000 km² a day, on the Suomi NPP scale';
  return 'detections per 1,000 km² a day';
}

export function parseRecord(body: unknown, place: RecordPlace): FireRecord | null {
  const b = obj(body);
  if (!b || !Array.isArray(b.records)) return null;
  const months = new Map<string, RecordMonth>();
  for (const r of (b.records as unknown[]).map(obj)) {
    if (!r || typeof r.year_month !== 'string') continue;
    const rc = obj(r.raw_counts) ?? {};
    const counts = PLATFORMS.flatMap((p) => {
      const c = obj(rc[p]);
      const t = num(c?.total);
      return t === null ? [] : [{ platform: p, total: t }];
    });
    months.set(r.year_month, {
      ym: r.year_month,
      year: Number(r.year),
      month: Number(r.month),
      value: num(r.harmonized_mean),
      p10: num(r.harmonized_p10),
      p90: num(r.harmonized_p90),
      median: num(r.month_median),
      rank: num(r.month_rank),
      rankOf: num(r.month_years),
      timesUsual: num(r.anomaly_ratio),
      asCounted: num(r.viirs_raw_rate) ?? num(r.modis_raw_rate),
      counts,
    });
  }
  const yms = [...months.keys()].sort();
  if (yms.length === 0) return null;
  const sm = obj(b.summary_metrics) ?? {};
  const hm = obj(b.harmonization_method) ?? {};
  const val = obj(hm.validation);
  const h = num(val?.median_abs_relative_error_annual);
  const r0 = num(val?.median_abs_relative_error_without_harmonization);
  const fit = obj(hm.fit_rows);
  const clim = Array.isArray(b.month_climatology) ? (b.month_climatology as unknown[]).map(obj) : [];
  const starts = obj(b.real_run_starts);
  const placeObj = obj(b.place);
  const cur = obj(b.current_month);
  const spanOf = (field: string): [string, string] | null => {
    const with_ = (b.records as unknown[])
      .map(obj)
      .filter((r): r is Obj => r !== null && typeof r.year_month === 'string' && num(r[field]) !== null)
      .map((r) => String(r.year_month))
      .sort();
    return with_.length ? [with_[0], with_[with_.length - 1]] : null;
  };
  return {
    place,
    label: typeof placeObj?.label === 'string' ? placeObj.label : typeof b.region_name === 'string' ? b.region_name : place.name,
    unit: unitWords(obj(b.units)?.harmonized_mean),
    firstMonth: typeof sm.first_month === 'string' ? sm.first_month : yms[0],
    lastMonth: typeof sm.last_month === 'string' ? sm.last_month : yms[yms.length - 1],
    firstYear: Number(yms[0].slice(0, 4)),
    lastYear: Number(yms[yms.length - 1].slice(0, 4)),
    months,
    climatology: Array.from({ length: 12 }, (_, i) => {
      const c = clim.find((x) => x && Number(x.month) === i + 1);
      return { month: i + 1, median: num(c?.median), years: num(c?.years) };
    }),
    years: (Array.isArray(b.annual_summary) ? (b.annual_summary as unknown[]).map(obj) : [])
      .filter((y): y is Obj => y !== null)
      .map((y) => ({ year: Number(y.year), mean: num(y.harmonized_mean), months: num(y.months) ?? 12 })),
    heldOut: h !== null && r0 !== null ? { harmonized: h, raw: r0 } : null,
    spans: { coarse: spanOf('modis_raw_rate'), sharp: spanOf('viirs_raw_rate') },
    sharpRatio: num(sm.viirs_to_modis_overlap_ratio),
    fitRows: fit && num(fit.modis) !== null && num(fit.viirs) !== null ? { modis: num(fit.modis)!, viirs: num(fit.viirs)! } : null,
    runStarts: Array.isArray(starts?.starts)
      ? (starts!.starts as unknown[])
          .map(obj)
          .filter((s): s is Obj => s !== null && typeof s.start === 'string')
          .map((s) => ({ start: String(s.start), label: String(s.label ?? s.start) }))
      : [],
    runRule: typeof starts?.rule === 'string' ? starts.rule : null,
    currentRoute: typeof cur?.route === 'string' ? cur.route : null,
    grid: place.kind === 'box' ? gridOf(obj(b.cube), place.box) : null,
    method: {
      id: typeof hm.id === 'string' ? hm.id : typeof b.model_version === 'string' ? b.model_version : null,
      level: num(obj(hm.interval)?.level),
      monthsHeld: heldOf(num(val?.monthly_interval_coverage), num(val?.months_tested)),
    },
    unstable: unstableOf(obj(val?.ratio_stability)),
  };
}

/** The flag of a place whose ratio does not hold, from the check's own counts and the factor its rule states. */
function unstableOf(rs: Obj | null): FireRecord['unstable'] {
  if (!rs || rs.stable !== false) return null;
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const m = typeof rs.rule === 'string' ? rs.rule.match(/more than (\d+(?:\.\d+)?) times/) : null;
  return { departing: len(rs.years_departing), tested: len(rs.years_tested), factor: m ? Number(m[1]) : null };
}

/** A share held of a count tested, as whole months: 0.8125 of 144 is 117 of 144. */
const heldOf = (share: number | null, of: number | null) => (share !== null && of !== null && of > 0 ? { held: Math.round(share * of), of } : null);

export async function fetchRecord(place: RecordPlace, signal?: AbortSignal): Promise<FireRecord | null> {
  if (place.kind === 'region') return parseRecord(await getJson<unknown>('/api/calendar', { source: 'firms', region_id: place.regionId }, { signal }), place);
  const { path, query } = boxRoute(place.box, place.route);
  try {
    return parseRecord(await getJson<unknown>(path, query, { signal }), place);
  } catch (e) {
    // The cube answers a box with no loaded square with 404 and its squares: that box has no record, not a failure
    const body = e instanceof HttpError && e.status === 404 ? obj(e.body) : null;
    const grid = body?.state === 'not_loaded' ? gridOf(body, place.box) : null;
    throw grid ? new NotLoaded(grid) : e;
  }
}

export interface CurrentMonth {
  /** "2026-11". */
  month: string;
  /** "ready", or why not ("no key", "box too large", "busy", "no full day yet", "failed"). */
  status: string;
  error: string | null;
  value: number | null;
  median: number | null;
  /** The month so far over the median of its calendar month, as the route serves it. */
  timesUsual: number | null;
  medianYears: [number, number] | null;
  days: { counted: number; inMonth: number } | null;
  caveats: string[];
}

/** This month so far, from the route the record names. */
export async function fetchCurrent(route: string, signal?: AbortSignal): Promise<CurrentMonth | null> {
  const [path, q] = route.split('?');
  const query: Query = {};
  if (q) new URLSearchParams(q).forEach((v, k) => (query[k] = v));
  const b = obj(await getJson<unknown>(path, query, { signal }));
  if (!b) return null;
  const days = obj(b.days);
  const my = Array.isArray(b.median_years) && b.median_years.length === 2 ? (b.median_years as [number, number]) : null;
  return {
    month: String(b.month ?? ''),
    status: String(b.status ?? 'failed'),
    error: typeof b.error === 'string' ? b.error : null,
    value: num(b.harmonized_mean),
    median: num(b.month_median),
    timesUsual: num(b.anomaly_ratio),
    medianYears: my,
    days: days && num(days.counted) !== null && num(days.in_month) !== null ? { counted: num(days.counted)!, inMonth: num(days.in_month)! } : null,
    caveats: Array.isArray(b.caveats) ? (b.caveats as unknown[]).filter((c): c is string => typeof c === 'string') : [],
  };
}

/**
 * The ramp's class of a month: 0 for an empty month, otherwise 1 to `steps` on a log scale between the record's
 * quietest burning month and its worst, so quiet months recede and the worst are the brightest.
 */
export function logClass(v: number | null, lo: number, hi: number, steps: number): number {
  if (v === null || v <= 0) return 0;
  if (hi <= lo) return steps;
  const t = (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  return Math.max(1, Math.min(steps, 1 + Math.floor(Math.max(0, Math.min(0.9999, t)) * steps)));
}

/** The record's quietest burning month and its worst, for the ramp. */
export function rampBounds(rec: FireRecord): { lo: number; hi: number } {
  const vals = [...rec.months.values()].map((m) => m.value).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
  if (vals.length === 0) return { lo: 1, hi: 1 };
  // The 2nd percentile keeps one stray tiny month from stretching the scale.
  return { lo: vals[Math.floor(vals.length * 0.02)], hi: vals[vals.length - 1] };
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const monthWords = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
