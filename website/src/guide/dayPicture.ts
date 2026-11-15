import type { EarthStageTelemetry } from '../stage/earthCutawayTypes';
import type { ScriptAction } from './script';
import { monthName } from './formats';

/**
 * NASA's photograph of the box for the day of the pass on show (the stage's `dayPicture`): true colour, then false
 * colour, then off, by one key, D. On Estimate and Test it is the guide's fourth, quiet action, the one exception to
 * three; while a photograph is on, the guide's standing sentence is about it, and the label at the fire keeps saying
 * the pass. The words are the page's own until the product lane writes them into the script: every one of them is here.
 */
export type DayPictureKind = 'true_color' | 'false_color';

/** The next state of the photograph: off, true colour, false colour, off. */
export const nextDayPicture = (now: DayPictureKind | null): DayPictureKind | null =>
  now === null ? 'true_color' : now === 'true_color' ? 'false_color' : null;

const LABEL: Record<'off' | DayPictureKind, string> = {
  off: "Show that day's satellite photograph",
  true_color: 'Show the burned ground',
  false_color: 'Hide the photograph',
};

/** The guide's quiet fourth action, by what is on show now. */
export const dayPictureAction = (asked: DayPictureKind | null): ScriptAction => ({
  label: LABEL[asked ?? 'off'],
  command: 'day:next',
  key: 'D',
  places: ['guide'],
  quiet: true,
});

const SATELLITE: Record<string, string> = {
  MODIS_TERRA: 'the Terra satellite',
  MODIS_AQUA: 'the Aqua satellite',
  VIIRS_SNPP: 'the Suomi NPP satellite',
  VIIRS_NOAA20: 'the NOAA-20 satellite',
};

/** "11 August 2012", from a UTC day "2012-08-11". */
function dayWords(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const month = m ? monthName(`${m[1]}-${m[2]}`) : null;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : day;
}

/**
 * The guide's standing sentence while a photograph is asked for: what it is, or that it is on its way, or plainly that
 * none is on hand (the route not mounted, or the day not stored). Null when none is asked for or the stage has not said.
 */
export function dayPictureLine(t: EarthStageTelemetry['dayPicture'] | null | undefined): string | null {
  if (!t) return null;
  const day = dayWords(t.day);
  if (t.state === 'loading') return `Loading NASA's photograph of ${day}.`;
  if (t.state === 'missing') return `NASA's photograph of ${day} is not on hand here, so the ground keeps its own picture.`;
  const by = SATELLITE[t.platform] ?? t.platform.replace(/_/g, ' ');
  const what =
    t.kind === 'true_color'
      ? `This is NASA's photograph of ${day} from ${by}: one picture a day at about 250 m, stitched from its passes, so the smoke and cloud in it are real.`
      : `This is NASA's photograph of ${day} from ${by} in false colour: burned ground shows brown and living plants green, one picture a day at about 250 m, stitched from its passes.`;
  return t.insteadOfHidden ? `${what} It is the coarse satellite's photograph, since the sharp satellite is hidden on this pass.` : what;
}

/** The imagery credit while NASA's photograph lies on the box: NASA's own name for the picture shown. */
export function dayPictureCredit(t: EarthStageTelemetry['dayPicture'] | null | undefined): string | null {
  if (!t || t.state !== 'shown') return null;
  const [instrument, craft] = t.platform.startsWith('VIIRS') ? ['VIIRS', t.platform === 'VIIRS_NOAA20' ? 'NOAA-20' : 'Suomi NPP'] : ['MODIS', t.platform === 'MODIS_TERRA' ? 'Terra' : 'Aqua'];
  const bands = t.kind === 'true_color' ? 'True Color' : instrument === 'MODIS' ? 'Bands 7-2-1' : 'Bands M11-I2-I1';
  return `NASA GIBS, Corrected Reflectance (${bands}, ${instrument}, ${craft})`;
}
