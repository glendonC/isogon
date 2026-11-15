import type { EarthStageTelemetry } from '../stage/earthCutawayTypes';

/**
 * NASA's photograph of the box for the day of the pass on show (the stage's `dayPicture`): true colour, then false
 * colour, then off, by one key, D. Its words are the script's (each step's `photo`, the action `photo:next` in its
 * `also`); here are its stepping and its credit.
 */
export type DayPictureKind = 'true_color' | 'false_color';

/** The next state of the photograph: off, true colour, false colour, off. */
export const nextDayPicture = (now: DayPictureKind | null): DayPictureKind | null =>
  now === null ? 'true_color' : now === 'true_color' ? 'false_color' : null;

/** The imagery credit while NASA's photograph lies on the box: NASA's own name for the picture shown. */
export function dayPictureCredit(t: EarthStageTelemetry['dayPicture'] | null | undefined): string | null {
  if (!t || t.state !== 'shown') return null;
  const [instrument, craft] = t.platform.startsWith('VIIRS') ? ['VIIRS', t.platform === 'VIIRS_NOAA20' ? 'NOAA-20' : 'Suomi NPP'] : ['MODIS', t.platform === 'MODIS_TERRA' ? 'Terra' : 'Aqua'];
  const bands = t.kind === 'true_color' ? 'True Color' : instrument === 'MODIS' ? 'Bands 7-2-1' : 'Bands M11-I2-I1';
  return `NASA GIBS, Corrected Reflectance (${bands}, ${instrument}, ${craft})`;
}
