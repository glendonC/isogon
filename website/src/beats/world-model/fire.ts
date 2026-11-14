import type { DynamicRegionRun } from '../../stage/types';
import type { EvidenceDoc } from '../../content/evidence';
import type { Places } from '../../app/places';

/**
 * Where the fire is on screen, and the facts of the pass on show, read from the run itself. The fire's place is the
 * centroid of a pass's detections weighted by fire power; on a pass whose detections are hidden it is the nearest
 * pass that has some. It is put on screen through the stage's projected grid of the region's box
 * (`telemetry.regionGrid`), so a label follows the terrain as the camera moves.
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const framesOf = (run: DynamicRegionRun | null): Obj[] => {
  const op = obj(obj(run as unknown as Obj | null)?.observer_passes);
  return Array.isArray(op?.frames) ? (op!.frames as unknown[]).map((f) => obj(f) ?? {}) : [];
};

export const runBox = (run: DynamicRegionRun | null): [number, number, number, number] | null => {
  const b = obj(obj(run as unknown as Obj | null)?.observer_passes)?.bbox;
  return Array.isArray(b) && b.length === 4 && b.every((x) => typeof x === 'number') ? (b as [number, number, number, number]) : null;
};

function centroid(footprints: unknown): { lon: number; lat: number } | null {
  if (!Array.isArray(footprints) || footprints.length === 0) return null;
  let w = 0;
  let lon = 0;
  let lat = 0;
  for (const f of footprints) {
    if (!Array.isArray(f)) continue;
    const x = num(f[0]);
    const y = num(f[1]);
    const p = Math.max(1, num(f[5]) ?? 1);
    if (x === null || y === null) continue;
    w += p;
    lon += x * p;
    lat += y * p;
  }
  return w > 0 ? { lon: lon / w, lat: lat / w } : null;
}

/** The fire's place for a pass: its own detections, or the nearest pass with detections. */
export function fireAt(run: DynamicRegionRun | null, frame: number): { lon: number; lat: number; own: boolean } | null {
  const frames = framesOf(run);
  for (let d = 0; d < frames.length; d += 1) {
    for (const i of d === 0 ? [frame] : [frame - d, frame + d]) {
      const c = i >= 0 && i < frames.length ? centroid(frames[i].footprints) : null;
      if (c) return { ...c, own: d === 0 };
    }
  }
  return null;
}

/** A point of the box on screen, interpolated in the stage's projected grid; null when any corner is off screen. */
export function onScreen(
  lon: number,
  lat: number,
  box: [number, number, number, number],
  grid: { divisions: number; points: Array<[number, number] | null> } | undefined,
): { x: number; y: number } | null {
  if (!grid || grid.divisions < 1) return null;
  const n = grid.divisions;
  const u = ((lon - box[0]) / (box[2] - box[0])) * n;
  const v = ((box[3] - lat) / (box[3] - box[1])) * n;
  if (u < 0 || v < 0 || u > n || v > n) return null;
  const c = Math.min(n - 1, Math.floor(u));
  const r = Math.min(n - 1, Math.floor(v));
  const at = (rr: number, cc: number) => grid.points[rr * (n + 1) + cc];
  const p00 = at(r, c);
  const p01 = at(r, c + 1);
  const p10 = at(r + 1, c);
  const p11 = at(r + 1, c + 1);
  if (!p00 || !p01 || !p10 || !p11) return null;
  const fu = u - c;
  const fv = v - r;
  const x = (1 - fv) * ((1 - fu) * p00[0] + fu * p01[0]) + fv * ((1 - fu) * p10[0] + fu * p11[0]);
  const y = (1 - fv) * ((1 - fu) * p00[1] + fu * p01[1]) + fv * ((1 - fu) * p10[1] + fu * p11[1]);
  return { x, y };
}

export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The fire's extent on screen over the window: every detection the run shows, and the hidden ones once revealed, put
 * on screen through the stage's grid. The outer twentieth on each side is left out so one stray detection does not
 * stretch it. Null when fewer than three detections are on screen. The stage's `onFireAnchor` box replaces it.
 */
export function fireExtent(
  run: DynamicRegionRun | null,
  box: [number, number, number, number] | null,
  grid: { divisions: number; points: Array<[number, number] | null> } | undefined,
): ScreenBox | null {
  if (!run || !box || !grid) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (footprints: unknown) => {
    if (!Array.isArray(footprints)) return;
    for (const f of footprints) {
      if (!Array.isArray(f)) continue;
      const lon = num(f[0]);
      const lat = num(f[1]);
      if (lon === null || lat === null) continue;
      const p = onScreen(lon, lat, box, grid);
      if (p) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
  };
  for (const f of framesOf(run)) add(f.footprints);
  const overs = obj(obj(obj(run as unknown as Obj)?.blind_test)?.reveal)?.overpasses;
  if (Array.isArray(overs)) for (const o of overs) add(obj(o)?.footprints);
  if (xs.length < 3) return null;
  const cut = (v: number[]) => {
    const a = [...v].sort((p, q) => p - q);
    const k = Math.floor(a.length * 0.05);
    return [a[k], a[a.length - 1 - k]];
  };
  const [left, right] = cut(xs);
  const [top, bottom] = cut(ys);
  // A detection is drawn as light around its point: the box clears that glow.
  const m = 14;
  return { left: left - m, top: top - m, right: right + m, bottom: bottom + m };
}

const PLATFORMS: Record<string, string> = {
  VIIRS_SNPP: 'Suomi NPP VIIRS',
  VIIRS_NOAA20: 'NOAA-20 VIIRS',
  VIIRS_NOAA21: 'NOAA-21 VIIRS',
  MODIS_TERRA: 'Terra MODIS',
  MODIS_AQUA: 'Aqua MODIS',
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

export interface PassFacts {
  index: number;
  count: number;
  satellite: string;
  /** "2 Aug 21:47 UTC". */
  utc: string;
  /** "13:42 local, day". */
  local: string;
  held: boolean;
  /** Detections of this pass in the box; null on a hidden pass. */
  detections: number | null;
  /** "59 min" or "3.9 h" since the pass before; null for the first. */
  gap: string | null;
}

export function passFacts(run: DynamicRegionRun | null, frame: number): PassFacts | null {
  const frames = framesOf(run);
  const f = frames[frame];
  if (!f || typeof f.timestamp_utc !== 'string') return null;
  const t = Date.parse(f.timestamp_utc);
  const d = new Date(t);
  const lst = num(f.local_solar_time_hr);
  const prev = frame > 0 && typeof frames[frame - 1].timestamp_utc === 'string' ? Date.parse(String(frames[frame - 1].timestamp_utc)) : null;
  const gapH = prev === null ? null : (t - prev) / 3.6e6;
  return {
    index: frame,
    count: frames.length,
    satellite: PLATFORMS[String(f.sensor)] ?? String(f.sensor ?? '').replace(/_/g, ' '),
    utc: `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`,
    local: `${lst === null ? '' : `${two(Math.floor(lst))}:${two(Math.floor((lst % 1) * 60))} local, `}${f.is_day === false ? 'night' : 'day'}`,
    held: f.held_out === true,
    detections: f.held_out === true ? null : num(f.detections_in_box),
    gap: gapH === null ? null : gapH < 1 ? `${Math.round(gapH * 60)} min` : `${gapH < 10 ? gapH.toFixed(1) : Math.round(gapH)} h`,
  };
}

/** What the estimate was given and what was hidden, from the run's window. */
export function windowCounts(run: DynamicRegionRun | null): { modisPasses: number; modisDetections: number; hiddenPasses: number } | null {
  const w = obj(obj(run as unknown as Obj | null)?.window);
  const mp = num(w?.modis_overpasses);
  const md = num(w?.modis_pixels_in_box);
  const frames = framesOf(run);
  if (mp === null || md === null) return null;
  return { modisPasses: mp, modisDetections: md, hiddenPasses: frames.filter((f) => f.held_out === true).length };
}

/** The record beside a window's own count: the test fires' looks and the validation, each said with its kind. */
export function recordLine(doc: EvidenceDoc | null): string | null {
  if (!doc) return null;
  const fires = doc.test_fires.fires.map((f) => f.new.ahead_of_both_on);
  const judged = doc.test_fires.scores.length;
  const c = doc.validation.classes;
  if (fires.length === 0) return null;
  const list = fires.length > 1 ? `${fires.slice(0, -1).join(', ')} and ${fires[fires.length - 1]}` : String(fires[0]);
  return `Recorded test fires: ahead on ${list} of ${judged} by plain comparison. Validation: ahead on ${c.ahead}, tied on ${c.tied}, behind on ${c.behind === 0 ? 'none' : c.behind}, allowing for noise.`;
}

/**
 * A window of one of the recorded test fires: a year of a place that holds a blind test fire. The product shows the
 * record there and never hides, reveals or plays again.
 */
export function isClosedWindow(places: Places, regionId: string, start: string | null): boolean {
  if (!start) return false;
  const place = places.places.find((p) => p.id === regionId);
  return Boolean(place?.featured_fires.some((f) => f.blind_test_fire && f.months.some((m) => m.slice(0, 4) === start.slice(0, 4))));
}

/** The looks on record for a test fire of this place, from the evidence route. */
export function looksOf(
  doc: EvidenceDoc | null,
  regionId: string,
): { name: string; ahead: number[]; judged: number; firstUtc: string } | null {
  const fire = doc?.test_fires.fires.find((f) => f.region_id === regionId);
  if (!fire || !doc) return null;
  const looks = fire.looks && fire.looks.length > 0 ? fire.looks : [fire.old, fire.new];
  return {
    name: fire.name,
    ahead: looks.map((l) => l.ahead_of_both_on),
    judged: doc.test_fires.scores.length,
    /** The recorded window's first pass (the final look's). */
    firstUtc: fire.new.first_overpass_utc,
  };
}
