import { getJson, type Query } from '../../lib/api';
import type { Box } from '../../app/places';

/**
 * The Calendar's data: the fire record of a place (`GET /api/calendar?source=firms&region_id=`) or of any box
 * (`&box=w,s,e,n`), and this month so far against its median (`GET /api/calendar/current`). Every figure the screen
 * shows comes from these answers; nothing is computed here but sums and positions.
 */

export type RecordPlace = { kind: 'region'; regionId: string; name: string } | { kind: 'box'; box: Box; name: string };

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
  /** Rows the overlap fit stood on. */
  fitRows: { modis: number; viirs: number } | null;
  /** Real runs that can open, by start (a region's record only). */
  runStarts: RunStartRef[];
  /** The rule a start must meet to open a run, as the route states it. */
  runRule: string | null;
  /** The current month's route for this place, as the record names it. */
  currentRoute: string | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
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
    fitRows: fit && num(fit.modis) !== null && num(fit.viirs) !== null ? { modis: num(fit.modis)!, viirs: num(fit.viirs)! } : null,
    runStarts: Array.isArray(starts?.starts)
      ? (starts!.starts as unknown[])
          .map(obj)
          .filter((s): s is Obj => s !== null && typeof s.start === 'string')
          .map((s) => ({ start: String(s.start), label: String(s.label ?? s.start) }))
      : [],
    runRule: typeof starts?.rule === 'string' ? starts.rule : null,
    currentRoute: typeof cur?.route === 'string' ? cur.route : null,
  };
}

export async function fetchRecord(place: RecordPlace, signal?: AbortSignal): Promise<FireRecord | null> {
  const query: Query =
    place.kind === 'region' ? { source: 'firms', region_id: place.regionId } : { source: 'firms', box: place.box.join(',') };
  return parseRecord(await getJson<unknown>('/api/calendar', query, { signal }), place);
}

export interface CurrentMonth {
  /** "2026-11". */
  month: string;
  /** "ready", or why not ("no key", "box too large", "busy", "no full day yet", "failed"). */
  status: string;
  error: string | null;
  value: number | null;
  median: number | null;
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

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

export function rateWords(v: number | null): string {
  if (v === null) return 'no data';
  if (v === 0) return '0';
  return v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toPrecision(2);
}
