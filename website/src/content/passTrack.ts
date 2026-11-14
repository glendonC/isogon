import type { DynamicRegionRun } from '../stage/types';
import type { PassList } from './passes';

/**
 * The pass track, the workspace's time control. Every pass sits at its real time; VIIRS above the axis, MODIS
 * below; a pass that looked and flagged nothing is a hollow mark; in a blind test the hidden VIIRS passes show only
 * their times (from the CMR pass list, which holds no detection) until the reveal.
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const toS = (iso: string) => Date.parse(iso) / 1000;

export type TrackState = 'normal' | 'hidden' | 'revealed' | 'simulated';
export type TrackRow = 'viirs' | 'modis';

export interface TrackFrame {
  index: number;
  /** A pass of the hidden instrument, at its real time, with the estimate only. */
  heldOut: boolean;
  t: number;
  platform: string;
  row: TrackRow;
  pixels: number;
  isDay: boolean | null;
  /** Hours since the look before it (the frame's `information_age_h` when given). */
  gapH: number | null;
  cloudPct: number | null;
}

export interface TrackMark {
  key: string;
  row: TrackRow;
  platform: string;
  t: number;
  /** seen: a pass with detections in the box; nothing: looked, flagged no fire; hidden: held out of this test. */
  kind: 'seen' | 'nothing' | 'hidden';
  pixels: number | null;
  /** The stage frame this mark is, or the nearest one to jump to. */
  frame: number;
  isFrame: boolean;
  cloudPct: number | null;
  dayNight: string | null;
}

export interface TrackData {
  t0: number;
  t1: number;
  lat: number;
  lon: number;
  frames: TrackFrame[];
  marks: TrackMark[];
  maxPixels: number;
  /** Night stretches inside the window, as [start, end] seconds, from the sun's height at the box centre. */
  nights: Array<[number, number]>;
  /** Local solar midnights inside the window, for the day names. */
  midnights: number[];
  /** Whether a separate pass list covers the window and added marks (never for a run whose frames are the CMR list). */
  hasPassList: boolean;
  /** Whether the passes that looked and flagged nothing are on the track: frames from the pass list, or a list added. */
  showsEmptyPasses: boolean;
  hiddenCount: number;
}

export const rowOf = (platform: string): TrackRow => (platform.toUpperCase().startsWith('VIIRS') ? 'viirs' : 'modis');

const SAME_PASS_S = 10 * 60;

/** Sun's height in degrees at a place and time (NOAA's low-precision formulas, good to a fraction of a degree). */
export function sunElevationDeg(tSec: number, lat: number, lon: number): number {
  const rad = Math.PI / 180;
  const d = tSec / 86400 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmstH = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const ha = (gmstH * 15 + lon) * rad - ra;
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
}

/** Local solar time of day in hours. */
export const localSolarHours = (tSec: number, lon: number) => ((((tSec / 3600 + lon / 15) % 24) + 24) % 24);

function framesOf(run: DynamicRegionRun): TrackFrame[] {
  const op = obj((run as unknown as Obj).observer_passes);
  const frames = Array.isArray(op?.frames) ? (op?.frames as unknown[]) : [];
  const epochs = Array.isArray(run.epoch_summaries) ? run.epoch_summaries : [];
  const out: TrackFrame[] = [];
  const n = Math.max(frames.length, epochs.length);
  for (let i = 0; i < n; i += 1) {
    const f = obj(frames[i]);
    const ep = epochs[i] as unknown as Obj | undefined;
    const ts = (typeof f?.timestamp_utc === 'string' ? f.timestamp_utc : null) ?? (typeof ep?.timestamp_utc === 'string' ? ep.timestamp_utc : null);
    if (!ts) continue;
    const platform = String(f?.sensor ?? ep?.primary_sensor ?? 'MODIS');
    const passes = Array.isArray(f?.passes) ? (f?.passes as unknown[]).map(obj) : [];
    const counted = passes.reduce((a, p) => a + (num(p?.footprint_count) ?? 0), 0);
    // The frame's own count in the box when it carries one; otherwise its passes' counts, or its footprints.
    const pixels = num(f?.detections_in_box) ?? (counted || (Array.isArray(f?.footprints) ? (f?.footprints as unknown[]).length : 0));
    const heldOut = f?.held_out === true;
    const cloud = num(f?.cloud_fraction) ?? num(ep?.cloud_fraction);
    out.push({
      index: i,
      heldOut,
      t: toS(ts),
      platform,
      row: rowOf(platform),
      pixels,
      isDay: typeof f?.is_day === 'boolean' ? f.is_day : null,
      gapH: num(f?.information_age_h),
      cloudPct: num(f?.granule_cloud_cover_pct) ?? (cloud === null ? null : Math.round(cloud * 100)),
    });
  }
  return out;
}

const nearestFrame = (frames: readonly TrackFrame[], t: number) =>
  frames.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(frames[best].t - t) ? f.index : best), frames[0]?.index ?? 0);

/** The hidden passes a reveal returned: platform, time, pixels in the box. */
export interface RevealedPass {
  platform: string;
  t: number;
  pixels: number;
  /** The held-out frame this pass is (null: no frame). */
  frame: number | null;
}

export function revealedPassesOf(run: DynamicRegionRun | null): RevealedPass[] {
  const overs = obj(obj(obj(run as unknown as Obj | null)?.blind_test)?.reveal)?.overpasses;
  if (!Array.isArray(overs)) return [];
  return overs
    .map(obj)
    .filter((o): o is Obj => o !== null && typeof o.time_utc === 'string')
    .map((o) => ({
      platform: String(o.platform),
      t: toS(String(o.time_utc)),
      pixels: num(o.pixels_in_box) ?? (Array.isArray(o.footprints) ? o.footprints.length : 0),
      frame: num(o.frame),
    }));
}

export function passTrack(
  run: DynamicRegionRun | null,
  lists: readonly PassList[] | null,
  state: TrackState,
  revealed: readonly RevealedPass[],
): TrackData | null {
  if (!run) return null;
  const frames = framesOf(run);
  if (frames.length === 0) return null;
  const lat = run.region.center_lat;
  const lon = run.region.center_lon;
  const first = frames[0].t;
  const last = frames[frames.length - 1].t;
  const pad = Math.max(3600, (last - first) * 0.03);
  const t0 = first - pad;
  const t1 = last + pad;

  // Every pass that held the box is a frame, and a hidden pass is a held-out frame. It shows as hidden until the
  // reveal, then with the pixels the reveal gives that very frame; a visible pass with nothing in the box is empty.
  const revealedAt = new Map<number, number>();
  for (const r of revealed) if (r.frame !== null) revealedAt.set(r.frame, (revealedAt.get(r.frame) ?? 0) + r.pixels);
  let hiddenCount = 0;
  const marks: TrackMark[] = frames.map((f) => {
    let kind: TrackMark['kind'] = f.pixels > 0 ? 'seen' : 'nothing';
    let pixels: number | null = f.pixels;
    if (f.heldOut) {
      if (state === 'revealed') {
        pixels = revealedAt.get(f.index) ?? 0;
        kind = pixels > 0 ? 'seen' : 'nothing';
      } else {
        kind = 'hidden';
        pixels = null;
        hiddenCount += 1;
      }
    }
    return {
      key: `f${f.index}`,
      row: f.row,
      platform: f.platform,
      t: f.t,
      kind,
      pixels,
      frame: f.index,
      isFrame: true,
      cloudPct: f.cloudPct,
      dayNight: f.isDay === null ? null : f.isDay ? 'DAY' : 'NIGHT',
    };
  });

  // A run whose frames are the CMR pass list (`frames_from` "cmr") gets nothing added: a pass that held only part
  // of the box is no look. Any other real run's frames are the passes with detections only, so a pass list that
  // covers the window adds the rest.
  const framesFrom = obj(obj(run as unknown as Obj)?.observer_passes)?.frames_from;
  const list =
    state === 'simulated' || framesFrom === 'cmr'
      ? null
      : lists?.find((l) => l.region_id === run.region.id && toS(l.start) <= first && toS(l.end) >= last) ?? null;
  const usedReveal = new Set<number>();
  if (list) {
    for (const p of list.passes) {
      const t = toS(p.time_mid);
      if (t < t0 || t > t1) continue;
      const row = rowOf(p.platform);
      if (frames.some((f) => f.platform === p.platform && Math.abs(f.t - t) <= SAME_PASS_S)) continue;
      let kind: TrackMark['kind'] = 'nothing';
      let pixels: number | null = null;
      if (row === 'viirs' && state === 'hidden') {
        kind = 'hidden';
        hiddenCount += 1;
      } else if (row === 'viirs' && state === 'revealed') {
        const i = revealed.findIndex((r, k) => !usedReveal.has(k) && r.platform === p.platform && Math.abs(r.t - t) <= SAME_PASS_S);
        if (i >= 0) {
          usedReveal.add(i);
          kind = 'seen';
          pixels = revealed[i].pixels;
        }
      }
      marks.push({
        key: `c${p.platform}${p.time_mid}`,
        row,
        platform: p.platform,
        t,
        kind,
        pixels,
        frame: nearestFrame(frames, t),
        isFrame: false,
        cloudPct: p.cloud_cover_pct,
        dayNight: p.day_night ?? null,
      });
    }
  }
  if (state === 'revealed' && framesFrom !== 'cmr') {
    revealed.forEach((r, k) => {
      if (usedReveal.has(k) || r.t < t0 || r.t > t1) return;
      marks.push({
        key: `r${r.platform}${r.t}`,
        row: rowOf(r.platform),
        platform: r.platform,
        t: r.t,
        kind: 'seen',
        pixels: r.pixels,
        frame: nearestFrame(frames, r.t),
        isFrame: false,
        cloudPct: null,
        dayNight: null,
      });
    });
  }
  marks.sort((a, b) => a.t - b.t);

  // Night bands and local midnights, sampled every 10 minutes
  const nights: Array<[number, number]> = [];
  let nightStart: number | null = null;
  for (let t = t0; t <= t1; t += 600) {
    const night = sunElevationDeg(t, lat, lon) < -0.833;
    if (night && nightStart === null) nightStart = t;
    if (!night && nightStart !== null) {
      nights.push([nightStart, t]);
      nightStart = null;
    }
  }
  if (nightStart !== null) nights.push([nightStart, t1]);
  const midnights: number[] = [];
  const offset = (lon / 15) * 3600;
  for (let m = Math.ceil((t0 + offset) / 86400) * 86400 - offset; m <= t1; m += 86400) midnights.push(m);

  const maxPixels = Math.max(1, ...marks.map((m) => m.pixels ?? 0));
  return {
    t0,
    t1,
    lat,
    lon,
    frames,
    marks,
    maxPixels,
    nights,
    midnights,
    hasPassList: Boolean(list),
    showsEmptyPasses: framesFrom === 'cmr' || Boolean(list),
    hiddenCount,
  };
}

/** The playhead's time for a fractional frame index: between the two frames' real times. */
export function timeAtProgress(frames: readonly TrackFrame[], progress: number): number {
  if (frames.length === 0) return 0;
  const i = Math.max(0, Math.min(frames.length - 1, Math.floor(progress)));
  const j = Math.min(frames.length - 1, i + 1);
  const u = Math.max(0, Math.min(1, progress - i));
  return frames[i].t + (frames[j].t - frames[i].t) * u;
}

export const PLATFORM_WORDS: Record<string, string> = {
  VIIRS_SNPP: 'Suomi NPP',
  VIIRS_NOAA20: 'NOAA-20',
  VIIRS_NOAA21: 'NOAA-21',
  MODIS_TERRA: 'Terra',
  MODIS_AQUA: 'Aqua',
};

export const platformLabel = (p: string) => `${PLATFORM_WORDS[p] ?? p.replace(/_/g, ' ')} ${rowOf(p) === 'viirs' ? 'VIIRS' : 'MODIS'}`;
