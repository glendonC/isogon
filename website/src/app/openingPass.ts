/**
 * The pass Estimate opens on: a pass of the sharp satellite hidden from the model, so the white frames of its estimate
 * are on screen from the first moment, whatever pass the landing's tour stood on. A night pass (a fire at night is
 * light on dark ground, as the landing chooses), the first one a full day into the run's window, when the model has
 * had a day of the coarse satellite's passes; else the first hidden night pass; else the first hidden pass. Null when
 * no pass is hidden (a year before the sharp satellite, a recorded test fire, a revealed run). Pure, so it can be
 * checked on its own: the blind run carries no count for a hidden pass, so the rule reads only its time and its kind.
 */

export interface OpeningFrame {
  sensor?: string;
  held_out?: boolean;
  is_day?: boolean;
  timestamp_utc?: string;
}

const DAY_MS = 24 * 3600 * 1000;

export function openingHiddenPass(frames: readonly OpeningFrame[], windowStart?: string | null): number | null {
  const hidden = frames
    .map((f, i) => ({ f, i, t: Date.parse(f.timestamp_utc ?? '') }))
    .filter(({ f }) => f.held_out === true && typeof f.sensor === 'string' && f.sensor.startsWith('VIIRS'));
  if (hidden.length === 0) return null;
  const night = hidden.filter(({ f }) => f.is_day === false);
  const first = Date.parse(windowStart ?? '') || Date.parse(frames[0]?.timestamp_utc ?? '');
  const dayIn = Number.isFinite(first) ? night.find(({ t }) => Number.isFinite(t) && t >= first + DAY_MS) : undefined;
  return (dayIn ?? night[0] ?? hidden[0]).i;
}
