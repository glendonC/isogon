/**
 * A country's detections each year, for the strip under the Earth's years: as the satellites counted (MODIS to 2011,
 * Suomi NPP from 2012, the world strip's bars) and on one scale (the harmonize lane's total, its line). Read from the
 * fire cube's `GET /api/cube/years/countries` (`isogon-notes/fire-cube/COUNTRIES-shape.md`), with no browser and no
 * fetch, so a test can hold it.
 */

import { SHARP_FROM, type YearsIndex } from './yearsData.ts';

/** One country's yearly fire rows, null where a year is not counted. */
export interface CountryYears {
  /** What the map's country is matched on. */
  key: string;
  name: string;
  years: Record<number, { modis: number | null; viirs: number | null; harmonized: number | null }>;
}

/** The strip's rows for a country, in the shape of the world's (`totalsOf`). */
export function countryTotals(
  idx: YearsIndex,
  c: CountryYears,
): Array<{ year: number; detected: number | null; sharp: boolean; harmonized: number | null; partial: boolean }> {
  return idx.years.map((y) => {
    const v = c.years[y.year];
    const sharp = y.year >= SHARP_FROM;
    return { year: y.year, detected: v ? (sharp ? v.viirs : v.modis) : null, sharp, harmonized: v ? v.harmonized : null, partial: y.partial };
  });
}

/** How many times as many fire rows Suomi NPP counted as MODIS in the country, over the whole years both flew. */
export function countryRatio(idx: YearsIndex, c: CountryYears): number | null {
  let v = 0;
  let m = 0;
  for (const y of idx.years) {
    const r = c.years[y.year];
    if (!y.partial && r && r.viirs !== null && r.modis !== null) {
      v += r.viirs;
      m += r.modis;
    }
  }
  return m > 0 && v > 0 ? v / m : null;
}

/** Grid lines for a strip whose top is `top`: one to three round values under it (1, 2 or 5 times a power of ten). */
export function gridLines(top: number): number[] {
  if (!(top > 0)) return [];
  const raw = top / 3;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? 10 * p;
  const out: number[] = [];
  for (let v = step; v < top * 0.97 && out.length < 3; v += step) out.push(v);
  return out;
}

/** The fire cube's `countries.json` (COUNTRIES-shape.md, version 1), as far as the strip reads it. */
export interface CountriesFile {
  years: number[];
  countries: Record<
    string,
    { name: string; atlas: string | null; atlas_id?: string | null; modis: Array<number | null>; viirs: Array<number | null>; harmonized: Array<number | null> | null }
  >;
  /** The map's country name (world-atlas `properties.name`) to the store's file. */
  by_atlas: Record<string, string>;
  unmatched?: { store?: Record<string, string>; atlas?: unknown };
}

/** The years of the country the map names `atlasName`, said as `name`; null where it has no file of its own. */
export function countryOf(file: CountriesFile, atlasName: string, name: string): CountryYears | null {
  const key = file.by_atlas?.[atlasName];
  const c = key ? file.countries?.[key] : undefined;
  if (!key || !c) return null;
  const years: CountryYears['years'] = {};
  file.years.forEach((y, i) => {
    years[y] = { modis: c.modis?.[i] ?? null, viirs: c.viirs?.[i] ?? null, harmonized: c.harmonized?.[i] ?? null };
  });
  return { key, name, years };
}

/**
 * The store's files the map draws inside a country with no shape of their own (French Guiana and the rest inside
 * France, Svalbard inside Norway): its file does not hold their rows, so the strip says so.
 */
export function drawnInside(file: CountriesFile, key: string): string[] {
  const c = file.countries?.[key];
  if (!c) return [];
  const here = [c.atlas, c.name].filter(Boolean);
  return Object.entries(file.unmatched?.store ?? {})
    .filter(([, why]) => {
      const m = /inside (.+?) on the atlas/.exec(why);
      return m !== null && here.includes(m[1]);
    })
    .map(([k]) => file.countries?.[k]?.name ?? k.replace(/_/g, ' '));
}
