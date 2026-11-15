/**
 * The yearly layers' index and what the Earth's years read from it, with no browser and no fetch: which family a year
 * is drawn from in each record, the world's yearly totals, and how many times as many fire rows the sharper
 * instrument flags. The index is the fire cube's `GET /api/cube/years` (`isogon-notes/fire-cube/YEARS-shape.md`).
 */

export interface YearInfo {
  year: number;
  months: number;
  partial: boolean;
  first_month: string;
  last_month: string;
  platform_months: Record<string, number>;
}

export interface YearLayerMeta {
  family: string;
  year: number;
  scale: string;
  rows: number;
  cells_with_rows?: number;
  closed_cells?: number;
  clipped_cells?: number;
  png: string;
  png_route?: string;
}

export interface YearsIndex {
  source?: { cube_build?: string; world_complete?: boolean };
  years: YearInfo[];
  families: Record<string, { scale: string; first_year?: number; platforms?: string[]; what?: string; state?: string }>;
  scales: Record<string, { vmax: number }>;
  png: { palette_rgb: number[][] };
  layers: Record<string, YearLayerMeta>;
}

export type YearsMode = 'detected' | 'harmonized';

/** The year the sharper instrument (VIIRS on Suomi NPP) begins. */
export const SHARP_FROM = 2012;

/** The family drawn for a year in a mode, and whether the index holds it. */
export function familyOf(idx: YearsIndex, mode: YearsMode, year: number): string {
  if (mode === 'harmonized') return 'harmonized';
  if (year >= SHARP_FROM) return 'viirs';
  return idx.layers[`modis_on_snpp_${year}`] ? 'modis_on_snpp' : 'modis';
}

export function layerOf(idx: YearsIndex, mode: YearsMode, year: number): YearLayerMeta | null {
  return idx.layers[`${familyOf(idx, mode, year)}_${year}`] ?? null;
}

/** Whether every year of a mode is in the index. */
export function modeReady(idx: YearsIndex, mode: YearsMode): boolean {
  return idx.years.every((y) => layerOf(idx, mode, y.year) !== null);
}

/** The world's fire rows of a year as detected (MODIS to 2011, Suomi NPP from 2012) and as harmonized. */
export function totalsOf(idx: YearsIndex): Array<{ year: number; detected: number | null; sharp: boolean; harmonized: number | null; partial: boolean }> {
  return idx.years.map((y) => {
    const d = layerOf(idx, 'detected', y.year);
    const h = idx.layers[`harmonized_${y.year}`];
    return { year: y.year, detected: d ? d.rows : null, sharp: y.year >= SHARP_FROM, harmonized: h ? h.rows : null, partial: y.partial };
  });
}

/** How many times as many fire rows Suomi NPP flags as MODIS over the years both flew, from the yearly totals. */
export function sharpRatio(idx: YearsIndex): number | null {
  let v = 0;
  let m = 0;
  for (const y of idx.years) {
    const a = idx.layers[`viirs_${y.year}`];
    const b = idx.layers[`modis_${y.year}`];
    if (a && b && !y.partial) {
      v += a.rows;
      m += b.rows;
    }
  }
  return m > 0 ? v / m : null;
}
