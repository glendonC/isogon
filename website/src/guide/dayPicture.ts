import type { EarthStageTelemetry } from '../stage/earthCutawayTypes';
import { monthName } from './formats';

/**
 * NASA's photograph of the box for the day of the pass on show (the stage's `dayPicture`), in true colour, then in
 * false colour, then off: one key, D, and one action beside the fire's label. The words are provisional, the page's own
 * until the product lane writes them into the script: every one of them is here.
 */
export type DayPictureKind = 'true_color' | 'false_color';

export const DAY_PICTURE_KEY = 'D';

/** What the next press does, by what is on show now. */
export const DAY_PICTURE_ACTION: Record<'off' | DayPictureKind, string> = {
  off: "Show that day's photograph",
  true_color: 'Show it in false colour',
  false_color: 'Hide the photograph',
};

/** The next state of the photograph: off, true colour, false colour, off. */
export const nextDayPicture = (now: DayPictureKind | null): DayPictureKind | null =>
  now === null ? 'true_color' : now === 'true_color' ? 'false_color' : null;

const SATELLITE: Record<string, string> = {
  MODIS_TERRA: 'Terra',
  MODIS_AQUA: 'Aqua',
  VIIRS_SNPP: 'Suomi NPP',
  VIIRS_NOAA20: 'NOAA-20',
};

/** "11 August 2012", from a UTC day "2012-08-11". */
function dayWords(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const month = m ? monthName(`${m[1]}-${m[2]}`) : null;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : null;
}

/** The sentence under the fire's label while a photograph is asked for; null when none is asked for. */
export function dayPictureLine(t: EarthStageTelemetry['dayPicture'] | null | undefined): string | null {
  if (!t) return null;
  if (t.state === 'loading') return "Loading that day's photograph.";
  const day = dayWords(t.day) ?? t.day;
  if (t.state === 'missing') return `No photograph of ${day} is on hand, so the ground keeps its own picture.`;
  const by = SATELLITE[t.platform] ?? t.platform.replace(/_/g, ' ');
  const what =
    t.kind === 'true_color'
      ? `The ground as ${by} photographed it on ${day}, in true colour: the day's daylight passes in one picture, about 250 m to a pixel.`
      : `The ground as ${by} photographed it on ${day}, in false colour: burned ground shows brown, living plants green.`;
  return t.insteadOfHidden ? `${what} It is the coarse satellite's photograph, since the sharp satellite is hidden on this pass.` : what;
}
