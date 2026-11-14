/**
 * The data and sources sheet. Every count comes live from two responses: `/api/health` (rows downloaded, rows per
 * region box and platform) and the region's real calendar, `/api/calendar?region_id=<id>&source=firms` (what is left
 * out and why, outage days, regime markers). The product names, routes and the two gaps shorter than a day are fixed
 * facts, typed here; docs/data.md describes the data and docs/sources.md the sources and their credits.
 */

/** Platforms in the order the record grew. Platforms the backend adds later sort after these. */
export const PLATFORM_ORDER: readonly string[] = ['Terra', 'Aqua', 'Suomi NPP', 'NOAA-20', 'NOAA-21'];

export interface PlatformCount {
  platform: string;
  value: number;
}

export interface RegionRows {
  regionId: string;
  rows: PlatformCount[];
  total: number;
}

/** From `/api/health`. */
export interface HealthCounts {
  /** `downloaded_firms_rows`: rows over every downloaded file, country-wide, not only the boxes. */
  downloadedRows: number | null;
  /** `firms_cache.downloaded_files`: country files plus area API replies. */
  downloadedFiles: number | null;
  /** `firms_cache.rows_in_region_boxes`, every cached year (2026 included). */
  regions: RegionRows[];
}

/** A dated change or gap with the page it comes from. */
export interface DatedEvent {
  yearMonth: string;
  label: string;
  /** The page or rule the event comes from, as given. */
  source: string;
  /** Set only when `source` is an http(s) address. */
  url: string | null;
}

export interface PlatformNote {
  platform: string;
  why: string;
}

/** From the real calendar's method block and summary metrics. */
export interface CalendarSources {
  /** `harmonization_method.counted_rows`. */
  countingRule: string | null;
  /** `harmonization_method.outage_rule`. */
  outageRule: string | null;
  /** `harmonization_method.overlap_months_excluded_for_outages`. */
  monthsOutForOutages: string[];
  /** `harmonization_method.platforms_in_fit`. */
  platformsInFit: string[];
  /** `harmonization_method.platforms_counted_not_fitted`. */
  countedNotFitted: PlatformNote[];
  /** `harmonization_method.not_in_calendar`, split into what is left out ("2026") and why. */
  notInCalendar: { what: string; why: string } | null;
  /** `summary_metrics.static_rows_excluded`. */
  staticExcluded: PlatformCount[];
  /** `summary_metrics.outage_days`. */
  outageDays: PlatformCount[];
  /** `regime_markers`. */
  markers: DatedEvent[];
  /** `summary_metrics.first_month` and `last_month`. */
  firstMonth: string | null;
  lastMonth: string | null;
}

/** One line of a facts table: a label, a value and its context. */
export interface SourceRow {
  label: string;
  value: string;
  context: string;
}

/**
 * The products the rows come from (docs/data.md). MODIS is Collection 6.1 and VIIRS Collection 2 on NASA's CMR
 * (versions 061 and 002); the FIRMS rows themselves carry the `version` labels named here.
 */
export const PRODUCT_ROWS: readonly SourceRow[] = [
  {
    label: 'Terra and Aqua',
    value: 'MODIS Collection 6.1, 1 km',
    context: 'FIRMS country files, 2000 to 2025, rows labelled 6.2, 6.03 and 61.03 by year',
  },
  {
    label: 'Suomi NPP',
    value: 'VIIRS Collection 2, 375 m',
    context: 'FIRMS country files, 2012 to 2025',
  },
  {
    label: 'NOAA-20',
    value: 'VIIRS Collection 2, 375 m',
    context: 'FIRMS country files, 2018 to 2025',
  },
  {
    label: 'NOAA-21',
    value: 'VIIRS Collection 2, 375 m',
    context: 'FIRMS area API, from 2023-03',
  },
  {
    label: 'Processing',
    value: 'standard processing',
    context: '2026 rows come from the area API and turn near real time where standard processing ends',
  },
  {
    label: 'One row',
    value: 'one active fire detection',
    context:
      'a pixel one satellite pass flagged as fire, with its time, position, footprint, brightness, fire radiative power, confidence and type',
  },
];

/**
 * Two gaps the whole-day outage rule cannot catch, each under a day, so their months stay in the fit. Both are
 * global, so they hold for every region.
 */
export const SUB_DAY_GAPS: readonly DatedEvent[] = [
  {
    yearMonth: '2021-08',
    label: 'Suomi NPP in safe mode for under a day, so its month stays in the fit',
    source: 'LAADS DAAC alert',
    url: 'https://ladsweb.modaps.eosdis.nasa.gov/alerts-and-issues/200081',
  },
  {
    yearMonth: '2021-09',
    label: 'Aqua out for a calibration maneuver for under a day, so its month stays in the fit',
    source: 'MODIS Aqua outage list',
    url: 'https://modaps.modaps.eosdis.nasa.gov/services/production/outages_aqua.html',
  },
];

/** The FIRMS terms as the project records them (backend/firms/archive.py `TERMS`). */
export const FIRMS_CREDIT = {
  value: 'NASA FIRMS (LANCE / ESDIS)',
  url: 'https://www.earthdata.nasa.gov/data/tools/firms',
} as const;

/** Elevation (docs/sources.md): Terrain Tiles on AWS Open Data, Terrarium encoding. */
export const ELEVATION_CREDIT = {
  value: 'AWS Terrarium',
  url: 'https://registry.opendata.aws/terrain-tiles/',
} as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

function platformRank(p: string): number {
  const i = PLATFORM_ORDER.indexOf(p);
  return i === -1 ? PLATFORM_ORDER.length : i;
}

/** Sorts platform names in record order, unknown names last and alphabetically. */
export function comparePlatforms(a: string, b: string): number {
  return platformRank(a) - platformRank(b) || a.localeCompare(b);
}

function readCounts(v: unknown): PlatformCount[] {
  if (!isRecord(v)) return [];
  const out: PlatformCount[] = [];
  for (const [platform, raw] of Object.entries(v)) {
    const value = num(raw);
    if (value !== null) out.push({ platform, value });
  }
  return out.sort((a, b) => comparePlatforms(a.platform, b.platform));
}

/** An http(s) address, or null. Anything else (a rule in words, a javascript: link) is shown as text. */
export function httpUrl(v: string): string | null {
  return /^https?:\/\/[^\s]+$/i.test(v) ? v : null;
}

/** An address as short readable text: no scheme, no "www.", no trailing slash. */
export function linkText(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

/** Counts with thousands separators. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Backend wording made readable: field names in words, a capital first letter and a closing full stop. The words
 * themselves stay the backend's.
 */
export function plain(t: string): string {
  const out = t
    .trim()
    .replace(/,\s*which is counted as static_excluded/g, '')
    .replace(/\bin raw_counts\b/g, 'in the monthly counts')
    .replace(/\braw_counts\b/g, 'monthly counts')
    .replace(/\bstatic_excluded\b/g, 'static rows left out')
    .replace(/_/g, ' ');
  if (out === '') return out;
  const s = out.charAt(0).toUpperCase() + out.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

export function parseHealthCounts(raw: unknown): HealthCounts | null {
  if (!isRecord(raw)) return null;
  const downloadedRows = num(raw.downloaded_firms_rows);
  const cache = isRecord(raw.firms_cache) ? raw.firms_cache : null;
  const downloadedFiles = cache ? num(cache.downloaded_files) : null;
  const boxes = cache && isRecord(cache.rows_in_region_boxes) ? cache.rows_in_region_boxes : {};
  const regions: RegionRows[] = Object.entries(boxes)
    .map(([regionId, counts]) => {
      const rows = readCounts(counts);
      return { regionId, rows, total: rows.reduce((s, r) => s + r.value, 0) };
    })
    .filter((r) => r.rows.length > 0);
  if (downloadedRows === null && downloadedFiles === null && regions.length === 0) return null;
  return { downloadedRows, downloadedFiles, regions };
}

function readMarkers(v: unknown): DatedEvent[] {
  if (!Array.isArray(v)) return [];
  const out: DatedEvent[] = [];
  for (const m of v) {
    if (!isRecord(m)) continue;
    const yearMonth = str(m.year_month);
    const label = str(m.label);
    if (!yearMonth || !label) continue;
    const source = str(m.source) ?? '';
    out.push({ yearMonth, label, source, url: httpUrl(source) });
  }
  return out;
}

function readNotInCalendar(v: unknown): CalendarSources['notInCalendar'] {
  const text = str(v);
  if (!text) return null;
  const m = /^(\d{4}):\s*([\s\S]+)$/.exec(text);
  return m ? { what: m[1], why: m[2] } : { what: 'Not in the calendar', why: text };
}

/** The real calendar's sources, or null when the response is not a real (`source: "firms"`) calendar. */
export function parseCalendarSources(raw: unknown): CalendarSources | null {
  if (!isRecord(raw) || raw.source !== 'firms') return null;
  const method = isRecord(raw.harmonization_method) ? raw.harmonization_method : {};
  const metrics = isRecord(raw.summary_metrics) ? raw.summary_metrics : {};
  const notFitted = isRecord(method.platforms_counted_not_fitted) ? method.platforms_counted_not_fitted : {};
  return {
    countingRule: str(method.counted_rows),
    outageRule: str(method.outage_rule),
    monthsOutForOutages: strings(method.overlap_months_excluded_for_outages).sort(),
    platformsInFit: strings(method.platforms_in_fit),
    countedNotFitted: Object.entries(notFitted)
      .flatMap(([platform, why]) => {
        const w = str(why);
        return w ? [{ platform, why: w }] : [];
      })
      .sort((a, b) => comparePlatforms(a.platform, b.platform)),
    notInCalendar: readNotInCalendar(method.not_in_calendar),
    staticExcluded: readCounts(metrics.static_rows_excluded),
    outageDays: readCounts(metrics.outage_days),
    markers: readMarkers(raw.regime_markers),
    firstMonth: str(metrics.first_month),
    lastMonth: str(metrics.last_month),
  };
}

export async function fetchHealthCounts(apiBase: string, signal: AbortSignal): Promise<HealthCounts> {
  const r = await fetch(`${apiBase}/api/health`, { signal });
  if (!r.ok) throw new Error(`/api/health answered ${r.status}`);
  const counts = parseHealthCounts(await r.json());
  if (!counts) throw new Error('/api/health sent no FIRMS counts');
  return counts;
}

/** The region's real calendar sources; null when the backend has no real calendar for it (404). */
export async function fetchCalendarSources(
  apiBase: string,
  regionId: string,
  signal: AbortSignal,
): Promise<CalendarSources | null> {
  const r = await fetch(`${apiBase}/api/calendar?region_id=${encodeURIComponent(regionId)}&source=firms`, {
    signal,
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`/api/calendar answered ${r.status}`);
  const sources = parseCalendarSources(await r.json());
  if (!sources) throw new Error('/api/calendar sent no real calendar');
  return sources;
}

/** Regime markers and the gaps under a day, in date order, within the calendar's span when it states one. */
export function datedEvents(cal: CalendarSources): DatedEvent[] {
  const inSpan = (e: DatedEvent) =>
    (!cal.firstMonth || e.yearMonth >= cal.firstMonth) && (!cal.lastMonth || e.yearMonth <= cal.lastMonth);
  return [...cal.markers, ...SUB_DAY_GAPS.filter(inSpan)].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}
