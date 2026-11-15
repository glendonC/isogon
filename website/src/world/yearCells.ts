import { useEffect, useState } from 'react';
import { assetUrl } from '../lib/api.ts';
import type { YearLayerMeta } from './yearsData.ts';

/**
 * A year's exact counts, cell by cell: the fire cube's `<family>_<year>.npy` (float32, 720 by 1440, north up; NaN
 * where no file has a row and in closed cells), read when the globe's pointer asks what a square holds. The layer's
 * PNG gives a square's band only; this gives its count. A page of recorded answers holds no `.npy`, and the pointer
 * says the band there.
 */

/** The float32 cells of a `.npy` file (version 1 to 3, little-endian `<f4`, C order), or null if it is not that. */
export function parseNpy(buf: ArrayBuffer): Float32Array | null {
  const b = new Uint8Array(buf);
  if (b.length < 12 || b[0] !== 0x93 || String.fromCharCode(...b.slice(1, 6)) !== 'NUMPY') return null;
  const major = b[6];
  const dv = new DataView(buf);
  const headLen = major === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true);
  const start = (major === 1 ? 10 : 12) + headLen;
  const head = new TextDecoder().decode(b.slice(major === 1 ? 10 : 12, start));
  if (!/'descr':\s*'<f4'/.test(head) || /'fortran_order':\s*True/.test(head)) return null;
  const n = (buf.byteLength - start) / 4;
  if (!Number.isInteger(n)) return null;
  // The data may not start on a four-byte boundary: copied out when it does not.
  return start % 4 === 0 ? new Float32Array(buf, start, n) : new Float32Array(buf.slice(start));
}

const cache = new Map<string, Float32Array | null>();
const asked = new Map<string, Promise<Float32Array | null>>();
const KEEP = 6;

function load(meta: YearLayerMeta & { npy?: string; npy_route?: string }): Promise<Float32Array | null> {
  const key = meta.npy ?? `${meta.family}_${meta.year}.npy`;
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const going = asked.get(key);
  if (going) return going;
  const p = (async () => {
    const src = await assetUrl(meta.npy_route ?? `/api/cube/years/${key}`);
    if (!src) return null;
    const r = await fetch(src);
    if (!r.ok) return null;
    return parseNpy(await r.arrayBuffer());
  })()
    .catch(() => null)
    .then((v) => {
      if (cache.size >= KEEP) cache.delete(cache.keys().next().value as string);
      cache.set(key, v);
      asked.delete(key);
      return v;
    });
  asked.set(key, p);
  return p;
}

/** The year's exact cells while `want` is true (the pointer on the globe, the years at rest), else what is held. */
export function useYearCells(meta: (YearLayerMeta & { npy?: string; npy_route?: string }) | null, want: boolean): Float32Array | null {
  const key = meta ? (meta.npy ?? `${meta.family}_${meta.year}.npy`) : null;
  const [, bump] = useState(0);
  useEffect(() => {
    if (!meta || !want || !key || cache.has(key)) return;
    let live = true;
    void load(meta).then(() => live && bump((n) => n + 1));
    return () => {
      live = false;
    };
  }, [meta, key, want]);
  return key ? (cache.get(key) ?? null) : null;
}
