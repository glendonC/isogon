import { useEffect, useState } from 'react';
import { hexStops, inverter, scaledCell, type StatedScale } from './cells';
import { cellAt, GRID, gridPixels } from './layers';
import { readJson } from './read';

/**
 * The factor between the two satellites, place by place, from the harmonize lane's world maps (`maps.json` and its
 * images on the cube's grid): how many detections the sharp satellite (VIIRS on Suomi NPP) makes for each one of the
 * coarse satellite (MODIS on Terra and Aqua) over the clean overlap months, and how far a month left out was off with
 * it. Each value is read back from its map's colour on the scale `maps.json` states. A place with too few rows to say
 * is transparent there and is drawn as not measured, never as a value.
 */

interface MapLayer {
  what?: string;
  unit?: string;
  scale: StatedScale;
  places_with_value?: number;
  median?: number;
  p10?: number;
  p90?: number;
  png?: string;
}

export interface MapsIndex {
  layers: Record<string, MapLayer>;
  read?: { cube_build?: string; countries?: number; place_deg?: number; clean_months?: number };
}

export interface FactorMap {
  what: string | null;
  placeDeg: number | null;
  places: number | null;
  median: number | null;
  p10: number | null;
  p90: number | null;
  scale: StatedScale;
  /** Per cell of the cube's grid: the factor, NaN where not measured. */
  factor: Float32Array;
  /** 1 where the factor sits at the low end of its scale, 2 at the high end, else 0. */
  factorEnd: Uint8Array;
  /** Per cell: the held-out monthly error as a share, NaN where not measured; null when the map is absent. */
  error: Float32Array | null;
  errorEnd: Uint8Array | null;
}

/** The factor's colour on the page: on doublings from twice to eight times, where the places mostly lie. */
export const FACTOR_LOW = 2;
export const FACTOR_HIGH = 8;
export const FACTOR_STEPS = [2, 4, 8];
export const factorT = (f: number) => Math.min(Math.max(Math.log2(f / FACTOR_LOW) / Math.log2(FACTOR_HIGH / FACTOR_LOW), 0), 1);

/** Cool, one hue, so it cannot be taken for fire: slate to ice. */
export const FACTOR_RAMP: Array<[number, [number, number, number]]> = [
  [0, [34, 52, 74]],
  [0.4, [58, 112, 150]],
  [0.7, [126, 190, 222]],
  [1, [226, 246, 255]],
];

async function readMap(address: string, scale: StatedScale): Promise<{ values: Float32Array; ends: Uint8Array }> {
  const px = await gridPixels(address);
  const invert = inverter(hexStops(scale.stops));
  const n = GRID.cols * GRID.rows;
  const values = new Float32Array(n);
  const ends = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    const c = scaledCell(px[p], px[p + 1], px[p + 2], px[p + 3], invert, scale);
    values[i] = c.value;
    ends[i] = c.atLow ? 1 : c.atHigh ? 2 : 0;
  }
  return { values, ends };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function readFactor(index: string): Promise<FactorMap> {
  const idx = await readJson<MapsIndex>(index);
  const base = index.replace(/\/maps\.json$/, '').replace(/\/$/, '');
  const f = idx.layers?.factor;
  if (!f?.scale) throw new Error('the maps have no factor');
  const e = idx.layers?.error_in_use;
  const [fm, em] = await Promise.all([
    readMap(f.png ?? `${base}/factor.png`, f.scale),
    e?.scale ? readMap(e.png ?? `${base}/error_in_use.png`, e.scale).catch(() => null) : Promise.resolve(null),
  ]);
  return {
    what: f.what ?? null,
    placeDeg: num(idx.read?.place_deg),
    places: num(f.places_with_value),
    median: num(f.median),
    p10: num(f.p10),
    p90: num(f.p90),
    scale: f.scale,
    factor: fm.values,
    factorEnd: fm.ends,
    error: em?.values ?? null,
    errorEnd: em?.ends ?? null,
  };
}

export function factorCanvas(map: FactorMap, colour: (t: number) => [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = GRID.cols;
  c.height = GRID.rows;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(GRID.cols, GRID.rows);
  for (let i = 0, p = 0; i < map.factor.length; i += 1, p += 4) {
    const v = map.factor[i];
    if (Number.isNaN(v)) continue;
    const [r, g, b] = colour(factorT(v));
    img.data[p] = r;
    img.data[p + 1] = g;
    img.data[p + 2] = b;
    img.data[p + 3] = 235;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export interface FactorAt {
  factor: number;
  /** -1 at or below the scale's low end, 1 at or above its high end. */
  end: -1 | 0 | 1;
  error: number | null;
  errorEnd: -1 | 0 | 1;
}

export function factorAt(map: FactorMap, lon: number, lat: number): FactorAt | null {
  const cell = cellAt(lon, lat);
  if (!cell) return null;
  const i = cell.row * GRID.cols + cell.col;
  const v = map.factor[i];
  if (Number.isNaN(v)) return null;
  const e = map.error ? map.error[i] : Number.NaN;
  const end = (x: number) => (x === 1 ? -1 : x === 2 ? 1 : 0) as -1 | 0 | 1;
  return { factor: v, end: end(map.factorEnd[i]), error: Number.isNaN(e) ? null : e, errorEnd: map.errorEnd ? end(map.errorEnd[i]) : 0 };
}

export type FactorState = { state: 'idle' } | { state: 'loading' } | { state: 'failed'; why: string } | { state: 'ready'; map: FactorMap };

/** The harmonize maps' index (`.../maps.json`, or its route); read only once the layer is asked for. */
export function useFactor(index: string | null, wanted: boolean): FactorState {
  const [s, setS] = useState<FactorState>({ state: 'idle' });
  useEffect(() => {
    if (!index || !wanted) return;
    let live = true;
    setS({ state: 'loading' });
    readFactor(index)
      .then((map) => live && setS({ state: 'ready', map }))
      .catch((e: unknown) => live && setS({ state: 'failed', why: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [index, wanted]);
  return s;
}
