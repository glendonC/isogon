import { getJson, HttpError, NotRecorded } from '../lib/api';

/**
 * Every satellite pass over a region's box in a window, fire or no fire: `GET /api/passes` (NASA CMR granule
 * metadata, matched with the FIRMS rows of each pass). The pass track adds these to a real run whose frames are
 * only the passes with a detection, so a pass that looked and flagged nothing shows. A run whose frames are the
 * pass list already holds them and needs no second request.
 */

export interface CmrPass {
  platform: string;
  time_mid: string;
  day_night: 'DAY' | 'NIGHT' | 'BOTH' | string;
  /** Mean over a whole MODIS granule, not over the box; null for VIIRS. */
  cloud_cover_pct: number | null;
  box_share: number;
}

export interface PassList {
  region_id: string;
  box: [number, number, number, number];
  start: string;
  end: string;
  source: string;
  passes: CmrPass[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The route's answer as a pass list, or null when it is not one. */
export function parsePassList(body: unknown): PassList | null {
  const b = obj(body);
  if (!b || typeof b.region_id !== 'string' || typeof b.start !== 'string' || typeof b.end !== 'string') return null;
  if (!Array.isArray(b.passes)) return null;
  const box = Array.isArray(b.box_wsen) && b.box_wsen.length === 4 ? (b.box_wsen as [number, number, number, number]) : [0, 0, 0, 0];
  const passes: CmrPass[] = b.passes
    .map(obj)
    .filter((p): p is Obj => p !== null && typeof p.platform === 'string' && typeof p.time_mid === 'string')
    .map((p) => ({
      platform: String(p.platform),
      time_mid: String(p.time_mid),
      day_night: typeof p.day_night === 'string' ? p.day_night : '',
      cloud_cover_pct: num(p.cloud_cover_pct),
      box_share: num(p.box_share) ?? 1,
    }));
  return {
    region_id: b.region_id,
    box: box as [number, number, number, number],
    start: b.start,
    end: b.end,
    source: typeof b.provenance === 'string' ? b.provenance : 'NASA CMR granule metadata',
    passes,
  };
}

/** The pass list of a window, or null when the route has none for it (not cached, or a region with no schedule). */
export async function fetchPassList(
  regionId: string,
  startIso: string,
  endIso: string,
  signal?: AbortSignal,
): Promise<PassList | null> {
  try {
    return parsePassList(await getJson<unknown>('/api/passes', { region_id: regionId, start: startIso, end: endIso }, { signal }));
  } catch (err) {
    if (err instanceof HttpError || err instanceof NotRecorded) return null;
    throw err;
  }
}
