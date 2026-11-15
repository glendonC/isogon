/**
 * The fire cube's yearly layers (`GET /api/cube/years`, the fire-cube lane's `isogon-notes/fire-cube/YEARS-shape.md`):
 * per year and family, fire rows per quarter degree cell as an 8 bit indexed PNG on one scale per family. Index 0 is
 * not loaded, 1 loaded with no fire row, 2 a cell the closed rule closes, 3 to 255 the scale's ramp from low to high.
 *
 * As detected is MODIS (Terra and Aqua, drawn on the Suomi NPP scale) to 2011 and Suomi NPP from 2012: one scale, so
 * the step the sharper instrument makes in 2012 shows. The harmonized record is the harmonize lane's layer on the
 * same scale through every year.
 */

import { assetUrl } from '../lib/api.ts';
import { FIRE_RAMP, GRID, loadImage, rampAt } from './layers.ts';
import type { YearLayerMeta } from './yearsData.ts';

export * from './yearsData.ts';

/**
 * A year's cells as palette indices (1440 by 720, row 0 the north band). A lighter twin (`lite_<layer>`, 720 by 360,
 * the fire cube's F16) is read at its own size, so no colour is smoothed between indices, and each of its pixels is
 * written to the 2 by 2 cells it stands for.
 */
export async function readIndices(meta: YearLayerMeta & { grid?: number[] }, palette: number[][]): Promise<Uint8Array> {
  const src = await assetUrl(meta.png_route ?? meta.png);
  if (!src) throw new Error(`the layer ${meta.png} is not recorded`);
  const img = await loadImage(src);
  const twin = Array.isArray(meta.grid) && meta.grid[1] === GRID.cols / 2;
  const cols = twin ? GRID.cols / 2 : GRID.cols;
  const rows = twin ? GRID.rows / 2 : GRID.rows;
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, cols, rows);
  const px = g.getImageData(0, 0, cols, rows).data;
  const key = new Map<number, number>();
  palette.forEach(([r, gg, b], i) => {
    if (i >= 3 && !key.has((r << 16) | (gg << 8) | b)) key.set((r << 16) | (gg << 8) | b, i);
  });
  const nearest = (r: number, gg: number, b: number) => {
    let best = 3;
    let bd = Infinity;
    for (let i = 3; i < palette.length; i++) {
      const d = (palette[i][0] - r) ** 2 + (palette[i][1] - gg) ** 2 + (palette[i][2] - b) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    key.set((r << 16) | (gg << 8) | b, best);
    return best;
  };
  const out = new Uint8Array(cols * rows);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const a = px[p + 3];
    if (a === 0) continue;
    // The grey (alpha 70) and the slate (alpha 200) are told by their alpha; the ramp is opaque.
    if (a < 135) out[i] = 1;
    else if (a < 250) out[i] = 2;
    else out[i] = key.get((px[p] << 16) | (px[p + 1] << 8) | px[p + 2]) ?? nearest(px[p], px[p + 1], px[p + 2]);
  }
  if (!twin) return out;
  const full = new Uint8Array(GRID.cols * GRID.rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = out[r * cols + c];
      const a = 2 * r * GRID.cols + 2 * c;
      full[a] = k;
      full[a + 1] = k;
      full[a + GRID.cols] = k;
      full[a + GRID.cols + 1] = k;
    }
  }
  return full;
}

/** A layer's lighter twin in the index, where the fire cube lists one. */
export function liteOf(idx: { layers: Record<string, YearLayerMeta> }, meta: YearLayerMeta): YearLayerMeta | null {
  return idx.layers[`lite_${meta.family}_${meta.year}`] ?? null;
}

/** The colour of each index in the site's fire ramp: the ramp's place of index i is its middle, (i - 3 + 0.5) / 253. */
export function yearLut(): { fire: Uint32Array; closed: number } {
  const fire = new Uint32Array(256);
  const pack = (r: number, g: number, b: number, a: number) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  for (let i = 3; i < 256; i++) {
    const [r, g, b] = rampAt(FIRE_RAMP, Math.min((i - 3 + 0.5) / 253, 1));
    fire[i] = pack(Math.round(r), Math.round(g), Math.round(b), 255);
  }
  const closed = pack(96, 116, 146, 255);
  fire[2] = closed;
  return { fire, closed };
}

/** The year's fire cells in the site's colours, and the loaded cells as solid land, each a canvas on the grid. */
export function paintYear(ix: Uint8Array, lut: Uint32Array): { fire: HTMLCanvasElement; loaded: HTMLCanvasElement } {
  const { cols, rows } = GRID;
  const fire = new ImageData(cols, rows);
  const land = new ImageData(cols, rows);
  const f32 = new Uint32Array(fire.data.buffer);
  const l32 = new Uint32Array(land.data.buffer);
  const solid = ((255 << 24) | (48 << 16) | (40 << 8) | 36) >>> 0;
  for (let i = 0; i < ix.length; i++) {
    const k = ix[i];
    if (k === 0) continue;
    l32[i] = solid;
    if (k >= 2) f32[i] = lut[k];
  }
  const a = document.createElement('canvas');
  a.width = cols;
  a.height = rows;
  a.getContext('2d')!.putImageData(fire, 0, 0);
  const b = document.createElement('canvas');
  b.width = cols;
  b.height = rows;
  b.getContext('2d')!.putImageData(land, 0, 0);
  return { fire: a, loaded: b };
}
