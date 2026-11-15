import { getJson, HttpError, NotRecorded } from '../lib/api';
import { parseRunStarts, type RealRunStart } from './realRuns';

/**
 * The burning calendar: monthly fire activity for an area, 2000 to 2026, from `/api/calendar`. Four views of the
 * same months: the harmonized record, and the raw combined, MODIS and VIIRS detection rates. A month shows only when
 * a sensor was in orbit and the month has happened.
 */

/**
 * 'combined' is the naive merged count: MODIS before 2012, MODIS plus VIIRS from 2012. It is the record a
 * reader gets by adding up raw detections, and the one where the 2012 sensor step shows.
 */
export type CalendarView = 'record' | 'combined' | 'modis' | 'viirs';

export interface CalendarMonth {
  year: number;
  month: number; // 1..12
  yearMonth: string; // "2021-08"
  modis: number | null;
  viirs: number | null;
  record: number | null;
  recordP10: number | null;
  recordP90: number | null;
  coverage: number | null;
  regime: string;
  /**
   * Detections in the box that month, per platform, from `raw_counts` (real calendar only). A platform that
   * delivered no data is left out; one that delivered and saw nothing is listed with 0.
   */
  counts: Array<{ platform: string; total: number }> | null;
}

export interface OverlapEvidence {
  /** Suomi NPP rows over Terra plus Aqua rows across the overlap months of the region's box. */
  ratio: number;
  p10: number | null;
  p90: number | null;
  /** Median absolute error of a held-out year's total, harmonized and without harmonization. */
  heldOutError: number | null;
  withoutError: number | null;
  /** Share of held-out years whose truth fell inside the interval. */
  heldYears: number | null;
}

export interface Calendar {
  regionName: string;
  regionId: string;
  /** [lonMin, latMin, lonMax, latMax] */
  bbox: [number, number, number, number] | null;
  /** True until the response says `source: "firms"`. */
  simulated: boolean;
  /** Unit of each view, in plain words, from the response's `units`. */
  units: Record<CalendarView, string>;
  /** Real calendars put every view in the same unit, so one colour scale serves all four. */
  sharedScale: boolean;
  /** Harmonization the record uses, from `harmonization_method.id` (real: `overlap_ratio_v1`). */
  method: string | null;
  /** Start dates of real runs, when the calendar response lists them (`real_run_starts`). */
  runStarts: RealRunStart[];
  /** Share of held-out months whose true value fell inside the record's p10 to p90 (real: 15 to 41%). */
  intervalHeldMonths: number | null;
  /**
   * The range's check year by year (`harmonization_method.validation.per_year[].inside_interval`, its
   * `held_out_years`, and `harmonization_method.interval.level`): years it held, years hidden, the share it is meant to.
   */
  rangeCheck: { held: number; years: number; meant: number | null } | null;
  /** The real calendar's overlap ratio and its held-out check (`summary_metrics`); null on a simulated one. */
  overlap: OverlapEvidence | null;
  firstYear: number;
  lastYear: number;
  /** The month the sharp satellite's record begins here ("2012-01"), from `regime_markers`; null when not served. */
  sharpSince: string | null;
  months: CalendarMonth[];
}

/** FIRMS MODIS archive starts November 2000; VIIRS S-NPP 375 m starts January 2012. */
const MODIS_FROM = '2000-11';
const VIIRS_FROM = '2012-01';

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const pad = (m: number) => String(m).padStart(2, '0');

const PLATFORM_ORDER = ['Terra', 'Aqua', 'Suomi NPP', 'NOAA-20'];

function readCounts(raw: unknown): CalendarMonth['counts'] {
  if (!raw || typeof raw !== 'object') return null;
  const rc = raw as Record<string, unknown>;
  const names = [...PLATFORM_ORDER.filter((p) => p in rc), ...Object.keys(rc).filter((p) => !PLATFORM_ORDER.includes(p))];
  const out: Array<{ platform: string; total: number }> = [];
  for (const platform of names) {
    const c = rc[platform];
    const total = c && typeof c === 'object' ? num((c as Record<string, unknown>).total) : num(c);
    if (total !== null) out.push({ platform, total });
  }
  return out;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/**
 * Unit tokens from the backend in plain words. The platforms in brackets stay, because the real VIIRS rate is
 * Suomi NPP alone: "hotspots_per_1000km2_day (Suomi NPP)" reads "detections per 1,000 km² per day, Suomi NPP".
 */
function unitWords(u: unknown): string | null {
  if (typeof u !== 'string' || !u.trim()) return null;
  const platform = u.match(/\(([^)]*)\)\s*$/)?.[1]?.replace(/\s*\+\s*/g, ' and ').trim() ?? '';
  const t = u.replace(/\s*\(.*\)\s*$/, '').trim();
  const words =
    t === 'hotspots_per_1000km2_day'
      ? 'detections per 1,000 km² per day'
      : t === 'suomi_npp_equivalent_hotspots_per_1000km2_day'
        ? 'Suomi NPP equivalent detections per 1,000 km² per day'
        : t === 'reference_activity_mw_km2_index'
          ? 'activity index'
          : t.replace(/_/g, ' ');
  return platform ? `${words}, ${platform}` : words;
}

/** The combined view adds the MODIS and VIIRS rates, so its unit names both platforms when both are named. */
function combinedUnit(modis: string | null, viirs: string | null): string | null {
  if (!modis) return null;
  const [mw, mp] = modis.split(', ');
  const vp = viirs?.split(', ')[1];
  return mp && vp && viirs?.startsWith(mw) ? `${mw}, ${mp} plus ${vp}` : modis;
}

/** The first regime marker whose label begins with VIIRS: when the sharp satellite's record begins. */
function sharpSinceOf(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  for (const m of raw) {
    const r = m && typeof m === 'object' ? (m as Record<string, unknown>) : null;
    if (r && typeof r.label === 'string' && r.label.startsWith('VIIRS') && typeof r.year_month === 'string') return r.year_month;
  }
  return null;
}

function readOverlap(raw: unknown): OverlapEvidence | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const ratio = num(m.viirs_to_modis_overlap_ratio);
  if (ratio === null) return null;
  const band = Array.isArray(m.viirs_to_modis_ratio_p10_p90) ? m.viirs_to_modis_ratio_p10_p90 : [];
  return {
    ratio,
    p10: num(band[0]),
    p90: num(band[1]),
    heldOutError: num(m.held_out_median_abs_relative_error),
    withoutError: num(m.held_out_median_abs_relative_error_without_harmonization),
    heldYears: num(m.held_out_annual_interval_coverage),
  };
}

export function parseCalendar(raw: unknown): Calendar | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const list = Array.isArray(rec.records) ? rec.records : null;
  if (!list || list.length === 0) return null;
  const now = currentYearMonth();
  const months: CalendarMonth[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const year = num(r.year);
    const month = num(r.month);
    if (year === null || month === null) continue;
    const yearMonth = `${year}-${pad(month)}`;
    const happened = yearMonth <= now;
    const modisInOrbit = happened && yearMonth >= MODIS_FROM;
    const viirsInOrbit = happened && yearMonth >= VIIRS_FROM;
    months.push({
      year,
      month,
      yearMonth,
      modis: modisInOrbit ? num(r.modis_raw_rate) : null,
      viirs: viirsInOrbit ? num(r.viirs_raw_rate) : null,
      record: modisInOrbit ? num(r.harmonized_mean) : null,
      recordP10: modisInOrbit ? num(r.harmonized_p10) : null,
      recordP90: modisInOrbit ? num(r.harmonized_p90) : null,
      coverage: num(r.coverage_fraction),
      regime: typeof r.sensor_regime === 'string' ? r.sensor_regime : '',
      counts: happened ? readCounts(r.raw_counts) : null,
    });
  }
  if (months.length === 0) return null;
  const years = months.map((m) => m.year);
  const bbox = Array.isArray(rec.bbox) && rec.bbox.length === 4 ? (rec.bbox.map(Number) as Calendar['bbox']) : null;
  const units = (rec.units && typeof rec.units === 'object' ? rec.units : {}) as Record<string, unknown>;
  const modisUnit = unitWords(units.modis_raw_rate);
  const viirsUnit = unitWords(units.viirs_raw_rate);
  const rawUnit = modisUnit ?? 'detections per 1,000 km² per day';
  const real = rec.source === 'firms';
  const hm = rec.harmonization_method;
  const method = hm && typeof hm === 'object' && typeof (hm as Record<string, unknown>).id === 'string'
    ? String((hm as Record<string, unknown>).id)
    : null;
  return {
    regionName: typeof rec.region_name === 'string' ? rec.region_name : '',
    regionId: typeof rec.region_id === 'string' ? rec.region_id : '',
    bbox,
    simulated: !real,
    units: {
      record: unitWords(units.harmonized_mean) ?? 'activity index',
      combined: combinedUnit(modisUnit, viirsUnit) ?? rawUnit,
      modis: rawUnit,
      viirs: viirsUnit ?? rawUnit,
    },
    sharedScale: real,
    method,
    runStarts: real ? parseRunStarts(rec.real_run_starts) : [],
    intervalHeldMonths: num((rec.summary_metrics as Record<string, unknown> | undefined)?.held_out_monthly_interval_coverage),
    rangeCheck: rangeCheckOf(hm),
    overlap: real ? readOverlap(rec.summary_metrics) : null,
    firstYear: Math.min(...years),
    lastYear: Math.max(...years),
    sharpSince: sharpSinceOf(rec.regime_markers),
    months,
  };
}

function rangeCheckOf(hm: unknown): Calendar['rangeCheck'] {
  const o = hm && typeof hm === 'object' ? (hm as Record<string, unknown>) : null;
  const v = o?.validation && typeof o.validation === 'object' ? (o.validation as Record<string, unknown>) : null;
  const per = Array.isArray(v?.per_year) ? (v!.per_year as Array<Record<string, unknown>>) : null;
  if (!per) return null;
  const years = Array.isArray(v?.held_out_years) ? (v!.held_out_years as unknown[]).length : per.length;
  const interval = o?.interval && typeof o.interval === 'object' ? (o.interval as Record<string, unknown>) : null;
  return { held: per.filter((y) => y.inside_interval === true).length, years, meant: num(interval?.level) };
}

export function valueOf(m: CalendarMonth, view: CalendarView): number | null {
  if (view === 'record') return m.record;
  if (view === 'modis') return m.modis;
  if (view === 'viirs') return m.viirs;
  if (m.modis === null && m.viirs === null) return null;
  return (m.modis ?? 0) + (m.viirs ?? 0);
}

function quantile(sorted: readonly number[], p: number): number {
  const k = (sorted.length - 1) * p;
  const f = Math.floor(k);
  const c = Math.min(sorted.length - 1, f + 1);
  return sorted[f] + (sorted[c] - sorted[f]) * (k - f);
}

export interface ColourClasses {
  /** Eight upper bounds for nine classes, ascending. */
  breaks: number[];
  /** The months the classes were cut from. */
  base: 'record' | 'combined';
  p90: number;
  p98: number;
}

/**
 * Colour classes cut from the area's own record. Steps 1 to 7 split the months up to the 90th percentile into seven
 * equal shares; step 8 is the 90th to 98th percentile; step 9 is the top 2%. Real FIRMS months span four orders of
 * magnitude, so a log scale would put most of them on three steps and a quiet year would read as one colour. With
 * these classes a quiet year (Plumas 2016) spans steps 1 to 6, and only six months reach step 9 (the 2021 season
 * among them). Real calendars cut the classes from the harmonized record and use them for all four views (one
 * unit), so raw MODIS reads darker and the 2012 step shows in Raw combined. Zero months are not classed; they are
 * drawn hollow.
 */
export function classesFor(cal: Calendar, view: CalendarView): ColourClasses | null {
  const base = cal.sharedScale || view === 'record' ? 'record' : 'combined';
  const vals = cal.months
    .map((m) => valueOf(m, base))
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  if (vals.length < 9) return null;
  const p90 = quantile(vals, 0.9);
  const p98 = quantile(vals, 0.98);
  const low = vals.filter((v) => v <= p90);
  const breaks = [1, 2, 3, 4, 5, 6].map((i) => quantile(low, i / 7)).concat([p90, p98]);
  return { breaks, base, p90, p98 };
}

/** Class 0 to 8 of a positive value. */
export function classOf(v: number, c: ColourClasses | null): number {
  if (!c) return 4;
  return c.breaks.filter((b) => v > b).length;
}

export interface MonthStats {
  value: number | null;
  median: number | null;
  rank: number | null;
  of: number;
  p10: number | null;
  p90: number | null;
}

/** Value, median of that calendar month over all years, rank among those years (1 = highest), p10 to p90. */
export function statsFor(cal: Calendar, ym: string, view: CalendarView): MonthStats {
  const m = cal.months.find((x) => x.yearMonth === ym);
  const sameMonth = cal.months
    .filter((x) => m && x.month === m.month)
    .map((x) => valueOf(x, view))
    .filter((v): v is number => v !== null);
  const sorted = [...sameMonth].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const value = m ? valueOf(m, view) : null;
  const rank = value === null ? null : 1 + sameMonth.filter((v) => v > value).length;
  return {
    value,
    median,
    rank,
    of: sameMonth.length,
    p10: m && view === 'record' ? m.recordP10 : null,
    p90: m && view === 'record' ? m.recordP90 : null,
  };
}


export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatValue(v: number | null): string {
  if (v === null) return 'none';
  if (v === 0) return '0';
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  if (v >= 0.01) return v.toFixed(2);
  // Below 0.01, two significant figures, so a small real rate never prints as zero.
  return Number(v.toPrecision(2)).toString();
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

/** Real calendar: the server exports the FIRMS rows behind a selection. End is exclusive. */
export function rowsCsvPath(regionId: string, yms: readonly string[]): string | null {
  if (yms.length === 0) return null;
  const sorted = [...yms].sort();
  const [y1, m1] = sorted[sorted.length - 1].split('-').map(Number);
  const end = m1 === 12 ? `${y1 + 1}-01-01` : `${y1}-${pad(m1 + 1)}-01`;
  return `/api/calendar/rows.csv?region_id=${encodeURIComponent(regionId)}&start=${sorted[0]}-01&end=${end}`;
}

/** Simulated calendar: CSV of the selected months' calendar fields, marked simulated on every row. */
export function toCsv(cal: Calendar, yms: readonly string[]): string {
  const head = [
    'year_month', 'modis_raw_rate', 'viirs_raw_rate', 'harmonized_mean', 'harmonized_p10', 'harmonized_p90',
    'coverage_fraction', 'sensor_regime', 'region', 'source',
  ];
  const cell = (v: number | string | null) => (v === null ? '' : typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`);
  const rows = cal.months
    .filter((m) => yms.includes(m.yearMonth))
    .map((m) =>
      [m.yearMonth, m.modis, m.viirs, m.record, m.recordP10, m.recordP90, m.coverage, m.regime, cal.regionName,
        cal.simulated ? 'simulated' : 'firms'].map(cell).join(','),
    );
  return [head.join(','), ...rows].join('\n') + '\n';
}

/**
 * The real calendar when the backend serves one for the region (`source=firms`), otherwise null. The simulated
 * calendar is never shown: it is one invented place, so for any other region it would show simulated numbers for
 * somewhere else.
 */
export async function fetchCalendar(regionId: string, signal: AbortSignal): Promise<Calendar | null> {
  let body: unknown;
  try {
    body = await getJson<unknown>('/api/calendar', { region_id: regionId, source: 'firms' }, { signal });
  } catch (err) {
    if (err instanceof HttpError || err instanceof NotRecorded) return null;
    throw err;
  }
  const cal = parseCalendar(body);
  return cal && !cal.simulated ? cal : null;
}
