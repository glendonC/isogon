import { useEffect, useState } from 'react';
import { assetUrl } from '../lib/api';
import { readJson } from './read';

/**
 * The world layers of the fire cube: one image per layer on the cube's grid (a quarter degree, 1440 by 720 cells,
 * north up, one pixel per cell), coloured on a log scale whose ramp and maximum `layers.json` gives, transparent
 * where no loaded country file has a row. The page reads the value of a cell back from its colour, so the pointer
 * can say what a square holds, and draws the layer again in the site's own fire colours. Nothing is smoothed or
 * filled in: a cell with no row stays empty, a cell not loaded stays not loaded.
 */

export const GRID = { cols: 1440, rows: 720, step: 0.25 } as const;

export interface LayerMeta {
  what?: string;
  measure?: string;
  first_month?: string | null;
  max: number;
  total?: number;
  cells_with_rows?: number;
  /** The image's address, where the index gives it. */
  png?: string;
}

export interface LayersIndex {
  layers: Record<string, LayerMeta>;
  png?: { scale?: string; ramp_low_to_high?: number[][]; transparent?: string; grey?: string };
  /** The countries loaded, by name, or how many (the cube's route gives the number). */
  countries_loaded?: string[] | number;
  world_complete?: boolean;
}

/** What a cell holds: not loaded, loaded with none of the layer's rows, or a value. */
export const NOT_LOADED = -1;

export interface WorldLayer {
  name: string;
  meta: LayerMeta;
  /** The layer in the site's colours, one pixel per cell, transparent where not loaded. */
  image: HTMLCanvasElement;
  /** Cells loaded and holding none of the layer's rows, as solid land, so they read apart from cells not loaded. */
  loaded: HTMLCanvasElement;
  /** The value of each cell (row major), NOT_LOADED where no loaded file has a row, 0 where none of this layer's. */
  values: Float32Array;
  loadedCells: number;
}

const DEFAULT_RAMP = [
  [90, 10, 10],
  [200, 30, 20],
  [245, 120, 20],
  [255, 210, 60],
  [255, 250, 220],
];

/** The site's ramp for detections, dim ember to white heat; `--sys-detection` sits at its middle. */
export const FIRE_RAMP: Array<[number, [number, number, number]]> = [
  [0, [74, 22, 10]],
  [0.35, [168, 58, 24]],
  [0.62, [240, 138, 69]],
  [0.85, [255, 205, 140]],
  [1, [255, 246, 228]],
];

export function rampAt(ramp: Array<[number, [number, number, number]]>, t: number): [number, number, number] {
  const x = Math.min(Math.max(t, 0), 1);
  for (let i = 1; i < ramp.length; i += 1) {
    if (x <= ramp[i][0]) {
      const [t0, a] = ramp[i - 1];
      const [t1, b] = ramp[i];
      const f = (x - t0) / (t1 - t0 || 1);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  return ramp[ramp.length - 1][1];
}

/** Position on the cube's ramp (0 to 1) of a colour the ramp drew, by the nearest point on its segments. */
function inverter(ramp: number[][]) {
  const cache = new Map<number, number>();
  const n = ramp.length - 1;
  return (r: number, g: number, b: number) => {
    const key = (r << 16) | (g << 8) | b;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i += 1) {
      const a = ramp[i];
      const c = ramp[i + 1];
      const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const len = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
      const f = Math.min(Math.max(((r - a[0]) * d[0] + (g - a[1]) * d[1] + (b - a[2]) * d[2]) / len, 0), 1);
      const e0 = r - (a[0] + d[0] * f);
      const e1 = g - (a[1] + d[1] * f);
      const e2 = b - (a[2] + d[2] * f);
      const dist = e0 * e0 + e1 * e1 + e2 * e2;
      if (dist < bestD) {
        bestD = dist;
        best = (i + f) / n;
      }
    }
    cache.set(key, best);
    return best;
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

/** The value a position on the log scale stands for: log10(1 + v) / log10(1 + max) = t. */
export const valueOfT = (t: number, max: number) => Math.pow(1 + max, t) - 1;
export const tOfValue = (v: number, max: number) => (max > 0 ? Math.log10(1 + v) / Math.log10(1 + max) : 0);

export async function readLayer(base: string, name: string, index: LayersIndex): Promise<WorldLayer> {
  const meta = index.layers[name];
  if (!meta) throw new Error(`the world layers have no layer ${name}`);
  const src = await assetUrl(meta.png ?? `${base}/${name}.png`);
  if (!src) throw new Error(`the layer ${name} is not recorded`);
  const img = await loadImage(src);
  const { cols, rows } = GRID;
  const read = document.createElement('canvas');
  read.width = cols;
  read.height = rows;
  const rc = read.getContext('2d', { willReadFrequently: true })!;
  rc.drawImage(img, 0, 0, cols, rows);
  const px = rc.getImageData(0, 0, cols, rows).data;
  const invert = inverter(index.png?.ramp_low_to_high ?? DEFAULT_RAMP);
  const values = new Float32Array(cols * rows);
  const out = new ImageData(cols, rows);
  const land = new ImageData(cols, rows);
  let loadedCells = 0;
  for (let i = 0, p = 0; i < values.length; i += 1, p += 4) {
    const a = px[p + 3];
    if (a === 0) {
      values[i] = NOT_LOADED;
      continue;
    }
    loadedCells += 1;
    land.data[p] = 36;
    land.data[p + 1] = 40;
    land.data[p + 2] = 48;
    land.data[p + 3] = 255;
    if (a < 255) {
      values[i] = 0;
      continue;
    }
    const t = invert(px[p], px[p + 1], px[p + 2]);
    values[i] = valueOfT(t, meta.max);
    const [r, g, b] = rampAt(FIRE_RAMP, t);
    out.data[p] = r;
    out.data[p + 1] = g;
    out.data[p + 2] = b;
    out.data[p + 3] = 255;
  }
  const image = document.createElement('canvas');
  image.width = cols;
  image.height = rows;
  image.getContext('2d')!.putImageData(out, 0, 0);
  const loaded = document.createElement('canvas');
  loaded.width = cols;
  loaded.height = rows;
  loaded.getContext('2d')!.putImageData(land, 0, 0);
  return { name, meta, image, loaded, values, loadedCells };
}

/** The cell under a longitude and latitude, or null off the grid. */
export function cellAt(lon: number, lat: number): { col: number; row: number } | null {
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  const col = Math.min(Math.floor((lon + 180) / GRID.step), GRID.cols - 1);
  const row = GRID.rows - 1 - Math.min(Math.floor((lat + 90) / GRID.step), GRID.rows - 1);
  return { col, row };
}

/** Of the cells a box touches, how many are loaded. */
export function loadedShare(layer: WorldLayer, b: [number, number, number, number]): { loaded: number; cells: number } {
  const a = cellAt(b[0], b[3]);
  const z = cellAt(b[2], b[1]);
  if (!a || !z) return { loaded: 0, cells: 0 };
  let loaded = 0;
  let cells = 0;
  for (let r = a.row; r <= z.row; r += 1) {
    for (let c = a.col; c <= z.col; c += 1) {
      cells += 1;
      if (layer.values[r * GRID.cols + c] !== NOT_LOADED) loaded += 1;
    }
  }
  return { loaded, cells };
}

export type LayerState =
  | { state: 'loading' }
  | { state: 'failed'; why: string }
  | { state: 'ready'; index: LayersIndex; layer: WorldLayer };

/**
 * The cube's layers index and one of its layers. `index` is the index's address (`/api/cube/layers`, or a file
 * `.../layers.json`); each layer's image is beside it (`/api/cube/layers/<name>.png`).
 */
export function useWorldLayer(index: string, name: string): LayerState {
  const [s, setS] = useState<LayerState>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    const base = index.replace(/\/layers\.json$/, '').replace(/\/$/, '');
    setS({ state: 'loading' });
    readJson<LayersIndex>(index)
      .then((idx) => readLayer(base, name, idx).then((layer) => live && setS({ state: 'ready', index: idx, layer })))
      .catch((e: unknown) => live && setS({ state: 'failed', why: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [index, name]);
  return s;
}
