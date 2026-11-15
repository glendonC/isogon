import { useEffect, useState } from 'react';
import { readJson } from './read';

/**
 * The factor between the two satellites, place by place: how many detections the sharp satellite (VIIRS on Suomi
 * NPP) makes for each detection of the coarse one (MODIS on Terra and Aqua) over the years both flew, with the
 * error of that factor on a year left out where the answer gives it. Drawn as one square per place on its own grid;
 * a place with too few detections to measure is not drawn and says so.
 */

export interface FactorCell {
  col: number;
  row: number;
  factor: number;
  /** The factor's error on a year left out, as a share (0.12 is 12 percent), where measured. */
  heldOutError?: number | null;
  modisRows?: number | null;
  viirsRows?: number | null;
}

export interface FactorMap {
  what: string | null;
  unit: string | null;
  years: string | null;
  source: string | null;
  /** Said beside the map when the answer says the map is a stand-in or partial. */
  madeFor: string | null;
  minRows: number | null;
  grid: { west: number; north: number; step: number; cols: number; rows: number };
  cells: FactorCell[];
  countriesLoaded: string[];
}

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Read the answer; the keys of a newer answer are taken where they mean the same thing. */
export function parseFactor(body: unknown): FactorMap {
  const o = (body ?? {}) as Obj;
  const g = (o.grid ?? {}) as Obj;
  const cells = (Array.isArray(o.cells) ? o.cells : []).flatMap((c): FactorCell[] => {
    const x = c as Obj;
    const col = num(x.col);
    const row = num(x.row);
    const factor = num(x.factor ?? x.ratio);
    if (col === null || row === null || factor === null || factor <= 0) return [];
    return [
      {
        col,
        row,
        factor,
        heldOutError: num(x.held_out_error ?? x.heldOutError),
        modisRows: num(x.modis_rows),
        viirsRows: num(x.viirs_rows),
      },
    ];
  });
  return {
    what: str(o.what),
    unit: str(o.unit),
    years: str(o.years),
    source: str(o.source),
    madeFor: str(o.made_for),
    minRows: num(o.min_modis_rows),
    grid: {
      west: num(g.west) ?? -180,
      north: num(g.north) ?? 90,
      step: num(g.step) ?? 2,
      cols: num(g.cols) ?? 180,
      rows: num(g.rows) ?? 90,
    },
    cells,
    countriesLoaded: (Array.isArray(o.countries_loaded) ? o.countries_loaded : []).filter((x): x is string => typeof x === 'string'),
  };
}

/**
 * The legend's scale, on doublings, from twice to eight times as many: where the factor is measured it mostly lies
 * there, so the colour spreads over the range that holds the places. Below and above are drawn at the ends and said.
 */
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

export function factorCanvas(map: FactorMap, colour: (t: number) => [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = map.grid.cols;
  c.height = map.grid.rows;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(map.grid.cols, map.grid.rows);
  for (const cell of map.cells) {
    const p = (cell.row * map.grid.cols + cell.col) * 4;
    const [r, g, b] = colour(factorT(cell.factor));
    img.data[p] = r;
    img.data[p + 1] = g;
    img.data[p + 2] = b;
    img.data[p + 3] = 235;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function factorCellAt(map: FactorMap, lon: number, lat: number): FactorCell | null {
  const col = Math.floor((lon - map.grid.west) / map.grid.step);
  const row = Math.floor((map.grid.north - lat) / map.grid.step);
  return map.cells.find((c) => c.col === col && c.row === row) ?? null;
}

export type FactorState = { state: 'idle' } | { state: 'loading' } | { state: 'failed'; why: string } | { state: 'ready'; map: FactorMap };

export function useFactor(address: string | null, wanted: boolean): FactorState {
  const [s, setS] = useState<FactorState>({ state: 'idle' });
  useEffect(() => {
    if (!address || !wanted) return;
    let live = true;
    setS({ state: 'loading' });
    readJson<unknown>(address)
      .then((b) => live && setS({ state: 'ready', map: parseFactor(b) }))
      .catch((e: unknown) => live && setS({ state: 'failed', why: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [address, wanted]);
  return s;
}
