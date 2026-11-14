/**
 * The burning calendar: monthly fire activity for an area, 2000 to 2026, from `/api/calendar`
 * (CONTRACT 7). Three views of the same months: Isogon's calibrated record, and the raw MODIS and raw VIIRS
 * detection rates. A month shows only when a sensor was in orbit and the month has happened.
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
}

export interface Calendar {
  regionName: string;
  /** [lonMin, latMin, lonMax, latMax] */
  bbox: [number, number, number, number] | null;
  /** True until the response says `source: "firms"`. */
  simulated: boolean;
  firstYear: number;
  lastYear: number;
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

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
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
    });
  }
  if (months.length === 0) return null;
  const years = months.map((m) => m.year);
  const bbox = Array.isArray(rec.bbox) && rec.bbox.length === 4 ? (rec.bbox.map(Number) as Calendar['bbox']) : null;
  return {
    regionName: typeof rec.region_name === 'string' ? rec.region_name : '',
    bbox,
    simulated: rec.source !== 'firms',
    firstYear: Math.min(...years),
    lastYear: Math.max(...years),
    months,
  };
}

export function valueOf(m: CalendarMonth, view: CalendarView): number | null {
  if (view === 'record') return m.record;
  if (view === 'modis') return m.modis;
  if (view === 'viirs') return m.viirs;
  if (m.modis === null && m.viirs === null) return null;
  return (m.modis ?? 0) + (m.viirs ?? 0);
}

/** Log colour domain for a view. The raw views share one domain, so their levels compare directly. */
export function domainFor(cal: Calendar, view: CalendarView): [number, number] {
  const views: CalendarView[] = view === 'record' ? ['record'] : ['combined', 'modis', 'viirs'];
  const vals = cal.months.flatMap((m) => views.map((v) => valueOf(m, v))).filter((v): v is number => v !== null && v > 0);
  if (vals.length === 0) return [0.01, 1];
  return [Math.min(...vals), Math.max(...vals)];
}

export function position(v: number, [lo, hi]: [number, number]): number {
  if (v <= lo) return 0;
  if (v >= hi) return 1;
  return (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
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

export const VIEW_UNITS: Record<CalendarView, string> = {
  record: 'activity index',
  combined: 'detections per 1,000 km² per day',
  modis: 'detections per 1,000 km² per day',
  viirs: 'detections per 1,000 km² per day',
};

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatValue(v: number | null): string {
  if (v === null) return 'none';
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

/** CSV of the selected months: every field the calendar gives, with the source stated on each row. */
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
