import type { DynamicRegionRun } from '../stage/types';
import type { NextLookSlot } from './demo/nextLook';

/**
 * A round of "next look" on a real blind run. The round's turns and scores come from the environment's routes
 * (demo stand-in: content/demo/nextLook.ts); what a look shows is the real hidden VIIRS detections of that look's
 * slot inside the chosen tile, drawn on the terrain.
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A footprint as the payload writes it: [lon, lat, scan_km, track_km, angle_deg, frp_mw, confidence, sensor_code]. */
export type Footprint = unknown[];

export interface HiddenOverpass {
  platform: string;
  timeS: number;
  footprints: Footprint[];
}

const toS = (iso: string) => Date.parse(iso) / 1000;

/**
 * The hidden VIIRS overpasses of a blind run: those under `blind_test.reveal` when the run carries a reveal,
 * otherwise the frames marked `..._held_out` that hold footprints.
 */
export function hiddenOverpassesOf(run: DynamicRegionRun | null): HiddenOverpass[] {
  const r = run as unknown as Obj | null;
  const overs = obj(obj(r?.blind_test)?.reveal)?.overpasses;
  if (Array.isArray(overs)) {
    return overs
      .map(obj)
      .filter((o): o is Obj => o !== null && typeof o.time_utc === 'string' && Array.isArray(o.footprints))
      .map((o) => ({ platform: String(o.platform), timeS: toS(String(o.time_utc)), footprints: o.footprints as Footprint[] }));
  }
  const frames = obj(r?.observer_passes)?.frames;
  if (!Array.isArray(frames)) return [];
  const out: HiddenOverpass[] = [];
  for (const f of frames.map(obj)) {
    if (!f || typeof f.epistemic_regime !== 'string' || !f.epistemic_regime.endsWith('_held_out')) continue;
    if (typeof f.timestamp_utc !== 'string' || !Array.isArray(f.footprints)) continue;
    const viirs = (f.footprints as Footprint[]).filter((fp) => Array.isArray(fp) && Number(fp[7]) >= 2);
    out.push({ platform: String(f.sensor ?? 'VIIRS'), timeS: toS(f.timestamp_utc), footprints: viirs });
  }
  return out;
}

/** The scheduled look a hidden overpass belongs to: same platform, nearest in time, within two hours. */
export function slotOf(slots: readonly NextLookSlot[], platform: string, timeS: number): number | null {
  let best: { gap: number; index: number } | null = null;
  for (const s of slots) {
    if (s.platform !== platform) continue;
    const gap = Math.abs(toS(s.time_utc) - timeS);
    if (!best || gap < best.gap) best = { gap, index: s.index };
  }
  return best && best.gap <= 2 * 3600 ? best.index : null;
}

/** Tile of a point: row 0 is the north edge, column 0 the west edge (the environment's `tile_of_cell` order). */
export function tileOf(lon: number, lat: number, box: readonly number[], rows: number, cols: number): number | null {
  const [w, s, e, n] = box;
  if (lon < w || lon > e || lat < s || lat > n) return null;
  const c = Math.min(cols - 1, Math.floor(((lon - w) / (e - w)) * cols));
  const r = Math.min(rows - 1, Math.floor(((n - lat) / (n - s)) * rows));
  return r * cols + c;
}

/** "B3": column letter west to east, row number north to south. */
export function tileName(tile: number, cols: number): string {
  return `${String.fromCharCode(65 + (tile % cols))}${Math.floor(tile / cols) + 1}`;
}

/** The hidden footprints of one look's slot, per tile. */
export function lookFootprints(
  hidden: readonly HiddenOverpass[],
  slots: readonly NextLookSlot[],
  slot: number,
  box: readonly number[],
  rows: number,
  cols: number,
): Footprint[][] {
  const perTile: Footprint[][] = Array.from({ length: rows * cols }, () => []);
  for (const o of hidden) {
    if (slotOf(slots, o.platform, o.timeS) !== slot) continue;
    for (const fp of o.footprints) {
      const t = tileOf(Number(fp[0]), Number(fp[1]), box, rows, cols);
      if (t !== null) perTile[t].push(fp);
    }
  }
  return perTile;
}

/**
 * Index of the run's frame for a pass at a time. A hidden pass is its own frame (held out, at the pass's real
 * time): a held-out frame within two minutes is that pass. Otherwise the nearest visible frame; frames whose regime
 * ends in `_held_out` are skipped.
 */
export function frameNearest(run: DynamicRegionRun | null, timeS: number): number {
  const frames = obj((run as unknown as Obj | null)?.observer_passes)?.frames;
  let best = { gap: Infinity, index: 0 };
  if (Array.isArray(frames)) {
    const list = frames.map(obj);
    const own = list.findIndex((f) => f && typeof f.timestamp_utc === 'string' && f.held_out === true && Math.abs(toS(f.timestamp_utc) - timeS) <= 120);
    if (own >= 0) return num(list[own]?.frame) ?? own;
    list.forEach((f, i) => {
      if (!f || typeof f.timestamp_utc !== 'string') return;
      if (typeof f.epistemic_regime === 'string' && f.epistemic_regime.endsWith('_held_out')) return;
      const gap = Math.abs(toS(f.timestamp_utc) - timeS);
      if (gap < best.gap) best = { gap, index: num(f.frame) ?? i };
    });
  }
  return best.index;
}

export interface LookLayer {
  frame: number;
  platform: string;
  footprints: Footprint[];
}

/**
 * The blind run with the detections of the looks taken so far laid onto their frames, each as a VIIRS pass with its
 * own footprints, so the stage draws what a look revealed where and when it was seen. The id says which looks are
 * laid on, so the stage builds this view instead of reusing a cached one.
 */
export function withLooks(run: DynamicRegionRun, layers: readonly LookLayer[], tag: string): DynamicRegionRun {
  const r = run as unknown as Obj;
  const op = obj(r.observer_passes);
  if (!op || !Array.isArray(op.frames) || layers.length === 0) return run;
  const codes = obj(op.sensor_codes) ?? {};
  const frames: unknown[] = op.frames.map((f) => (obj(f) ? { ...(f as Obj) } : f));
  for (const layer of layers) {
    const frame = obj(frames[layer.frame]);
    if (!frame || layer.footprints.length === 0) continue;
    if (frame.held_out === true) {
      // The look's own held-out pass, now looked at: it draws as that pass with what the look revealed.
      frame.held_out = false;
      if (typeof frame.epistemic_regime === 'string') frame.epistemic_regime = frame.epistemic_regime.replace(/_held_out$/, '');
    }
    const code = Number(Object.entries(codes).find(([, v]) => v === layer.platform)?.[0] ?? layer.footprints[0]?.[7] ?? NaN);
    frame.passes = [
      ...(Array.isArray(frame.passes) ? frame.passes : []),
      { sensor: layer.platform, sensor_code: code, revealed_by_a_look: true, footprint_count: layer.footprints.length },
    ];
    frame.footprints = [...(Array.isArray(frame.footprints) ? frame.footprints : []), ...layer.footprints];
  }
  return { ...r, run_id: `${String(r.run_id)}_${tag}`, observer_passes: { ...op, frames } } as unknown as DynamicRegionRun;
}

/** Platform codes as people say them. */
export function platformWords(code: string): string {
  return ({ VIIRS_SNPP: 'Suomi NPP', VIIRS_NOAA20: 'NOAA-20', VIIRS_NOAA21: 'NOAA-21' } as Record<string, string>)[code] ?? code;
}
