/**
 * Fire detections each year, as counted and on one scale, from `GET /api/cube/years` (the whole Earth) or
 * `GET /api/cube/years/countries` (one country). Before VIIRS a year is MODIS as counted; from VIIRS's first year it
 * is VIIRS as counted; on one scale it is the estimate. Pure.
 */

export interface YearPoint {
  year: number;
  partial: boolean;
  months: number | null;
  modis: number | null;
  viirs: number | null;
  oneScale: number | null;
}

export interface YearSeries {
  years: YearPoint[];
  firstViirsYear: number | null;
}

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | null => (x && typeof x === 'object' ? (x as Obj) : null);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

function finish(years: YearPoint[]): YearSeries {
  years.sort((a, b) => a.year - b.year);
  const first = years.find((y) => y.viirs !== null && y.viirs > 0);
  return { years, firstViirsYear: first ? first.year : null };
}

/** The whole Earth: `years[]` and `layers.<family>_<year>.rows`. */
export function seriesFromCube(answer: unknown): YearSeries | null {
  const a = obj(answer);
  const layers = obj(a?.layers);
  const list = Array.isArray(a?.years) ? (a!.years as unknown[]).map(obj) : [];
  if (!layers || list.length === 0) return null;
  const rows = (family: string, year: number) => num(obj(layers[`${family}_${year}`])?.rows);
  return finish(
    list
      .filter((y): y is Obj => !!y && typeof y.year === 'number')
      .map((y) => {
        const year = y.year as number;
        return {
          year,
          partial: y.partial === true,
          months: num(y.months),
          modis: rows('modis', year),
          viirs: rows('viirs', year),
          oneScale: rows('harmonized', year),
        };
      }),
  );
}

/**
 * One country, from `GET /api/cube/years/countries`: `countries[storeKey]` holds `modis`, `viirs` and `harmonized`
 * as arrays, one value for each of `years` (null before a series' first year, 0 in a year with no row). `key` is
 * the store's file name (`United_States`) or the map's name (`United States of America`), which `by_atlas` turns into
 * the store's. The first year is partial as `first_year_partial` says.
 */
export function seriesFromCountry(answer: unknown, key: string): YearSeries | null {
  const a = obj(answer);
  const countries = obj(a?.countries);
  if (!countries) return null;
  const byAtlas = obj(a?.by_atlas);
  const storeKey = obj(countries[key]) ? key : typeof byAtlas?.[key] === 'string' ? (byAtlas![key] as string) : null;
  const c = storeKey ? obj(countries[storeKey]) : null;
  const years = Array.isArray(a?.years) ? (a!.years as unknown[]).map(num) : [];
  if (!c || years.length === 0) return null;
  const at = (series: unknown, i: number) => (Array.isArray(series) ? num(series[i]) : null);
  const partial = obj(a?.first_year_partial);
  const partialYear = num(partial?.year);
  return finish(
    years.flatMap((year, i) =>
      year === null
        ? []
        : [
            {
              year,
              partial: partialYear === year,
              months: partialYear === year ? num(partial?.months) : 12,
              modis: at(c.modis, i),
              viirs: at(c.viirs, i),
              oneScale: at(c.harmonized, i),
            },
          ],
    ),
  );
}

/** The country's name as the store gives it, for a strip's label. */
export function countryName(answer: unknown, key: string): string | null {
  const a = obj(answer);
  const countries = obj(a?.countries);
  const byAtlas = obj(a?.by_atlas);
  const storeKey = obj(countries?.[key]) ? key : typeof byAtlas?.[key] === 'string' ? (byAtlas![key] as string) : null;
  const n = storeKey ? obj(countries?.[storeKey])?.name : null;
  return typeof n === 'string' ? n : null;
}

/** The value a year's bar shows as counted: MODIS before VIIRS's first year, VIIRS from it. */
export function countedOf(point: YearPoint, firstViirsYear: number | null): { value: number | null; by: 'modis' | 'viirs' } {
  if (firstViirsYear !== null && point.year >= firstViirsYear) return { value: point.viirs, by: 'viirs' };
  return { value: point.modis, by: 'modis' };
}

/** Millions with one decimal; thousands under a million. */
export function countWords(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million`;
  return Math.round(n).toLocaleString('en-US');
}

export function yearReadout(point: YearPoint, firstViirsYear: number | null): string {
  const c = countedOf(point, firstViirsYear);
  const who = c.by === 'viirs' ? 'VIIRS' : 'MODIS';
  const counted = c.value !== null ? `${countWords(c.value)} as ${who} counted` : null;
  const one = point.oneScale !== null ? `${countWords(point.oneScale)} on one scale` : null;
  let text = `${point.year}: ${[counted, one].filter(Boolean).join(', ')}`;
  if (point.partial && point.months !== null) text += ` (${point.months} months only)`;
  return text;
}
