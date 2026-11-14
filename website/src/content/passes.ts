import type { EpochSummary } from '../stage/types';
import type { CmrPass, PassList } from './demo/passes';

/**
 * S3: every pass that looked at the box during a run, from NASA CMR (terrain-assets D6), set against the run's own
 * frames. A frame is a pass with a detection in the box, so a pass in the window that matches no frame looked and
 * saw nothing (or saw only through cloud). FIRMS alone cannot tell this: it lists detections, not looks.
 */

export interface PassMark {
  /** Place on the pass scrubber, 0 to 1, between the frames on either side. */
  at: number;
  platform: string;
  timeUtc: string;
  sawFire: boolean;
  cloudPct: number | null;
}

export interface PassStripData {
  marks: PassMark[];
  looked: number;
  sawFire: number;
  /** MODIS granule cloud cover of the pass behind each frame, where CMR gives one. */
  frameCloud: Array<number | null>;
}

const TOLERANCE_S = 10 * 60;
const toS = (iso: string) => Date.parse(iso) / 1000;

function matches(p: CmrPass, sensor: string, t: number) {
  return p.platform === sensor && Math.abs(toS(p.time_mid) - t) <= TOLERANCE_S;
}

/**
 * The passes of a run's window, or null when the list does not cover it. With an instrument hidden (a blind run)
 * its passes are left out: they are hidden, not empty.
 */
export function passStrip(
  epochs: readonly EpochSummary[] | undefined,
  lists: readonly PassList[] | null,
  regionId: string,
  hiddenFamily: 'VIIRS' | null,
): PassStripData | null {
  if (!epochs || epochs.length < 2 || !lists) return null;
  const frames = epochs.map((e) => ({ t: toS(e.timestamp_utc), sensor: e.primary_sensor }));
  const t0 = frames[0].t;
  const tN = frames[frames.length - 1].t;
  const list = lists.find((l) => l.region_id === regionId && toS(l.start) <= t0 && toS(l.end) >= tN);
  if (!list) return null;
  const last = frames.length - 1;
  const place = (t: number) => {
    if (t <= t0) return 0;
    if (t >= tN) return 1;
    let i = 0;
    while (i < last - 1 && frames[i + 1].t < t) i += 1;
    const span = Math.max(1, frames[i + 1].t - frames[i].t);
    return (i + (t - frames[i].t) / span) / last;
  };
  const marks: PassMark[] = list.passes
    .filter((p) => toS(p.time_mid) >= t0 - TOLERANCE_S && toS(p.time_mid) <= tN + TOLERANCE_S)
    .filter((p) => !(hiddenFamily && p.platform.startsWith(hiddenFamily)))
    .map((p) => ({
      at: place(toS(p.time_mid)),
      platform: p.platform,
      timeUtc: p.time_mid,
      sawFire: frames.some((f) => matches(p, f.sensor, f.t)),
      cloudPct: p.cloud_cover_pct,
    }));
  const frameCloud = frames.map((f) => list.passes.find((p) => matches(p, f.sensor, f.t))?.cloud_cover_pct ?? null);
  return { marks, looked: marks.length, sawFire: marks.filter((m) => m.sawFire).length, frameCloud };
}
