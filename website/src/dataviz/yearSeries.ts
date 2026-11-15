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

/** One country: `by_atlas[key].years[year].{modis, viirs, harmonized}`, the first year partial as the route says. */
export function seriesFromCountry(answer: unknown, key: string): YearSeries | null {
  const a = obj(answer);
  const c = obj(obj(a?.by_atlas)?.[key]);
  const ys = obj(c?.years);
  if (!ys) return null;
  const partial = obj(a?.first_year_partial);
  return finish(
    Object.entries(ys).map(([k, v]) => {
      const year = Number(k);
      const o = obj(v);
      return {
        year,
        partial: num(partial?.year) === year,
        months: num(partial?.year) === year ? num(partial?.months) : 12,
        modis: num(o?.modis),
        viirs: num(o?.viirs),
        oneScale: num(o?.harmonized),
      };
    }),
  );
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
