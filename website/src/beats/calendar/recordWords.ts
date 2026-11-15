import { MONTH_NAMES } from './record.ts';

/**
 * Every sentence The Record itself puts on screen, in one place. They are labels on a thing (a month, the change of
 * satellite, the ramp) and the prompt beside the thing it acts on; what the whole step is belongs to the guide. A
 * figure is passed in from the record's answer and never typed here.
 */

const monthName = (ym: string) => MONTH_NAMES[Number(ym.slice(5, 7)) - 1];

/** "2,349", "37", "4.1", "1.6": a ratio to one decimal place, and to none from ten up. */
export const times = (r: number) => (r >= 10 ? Math.round(r).toLocaleString('en-US') : String(Math.round(r * 10) / 10));

/** A share as whole percent: 0.1086 is "11". */
export const percent = (share: number) => String(Math.round(share * 100));

/**
 * One sentence on a month against a usual one: the median of the same calendar month over the record's years.
 * `rate` is the month's rate, null where no satellite flew; `timesUsual` is the record's own ratio.
 */
export function monthLine(ym: string, rate: number | null, timesUsual: number | null): string {
  const name = monthName(ym);
  if (rate === null) return 'No satellite counted fires in this month';
  if (rate === 0) return 'No fire detected in this month';
  if (timesUsual === null) return `No usual ${name} to set it against`;
  if (timesUsual >= 1.5) return `${times(timesUsual)} times the fire of a usual ${name} here`;
  if (timesUsual > 1 / 1.5) return `About the fire of a usual ${name} here`;
  return `Less fire than a usual ${name} here`;
}

export const RECORD_WORDS = {
  name: 'The Record',
  show: 'Show this fire',
  /** In the legend, once the visitor is looking over the months: what the corner marks on some of them mean. */
  brackets: 'A month with a fire you can show',
  coarse: 'The older satellites (MODIS, 1 km)',
  sharp: 'The newer, sharper satellite (VIIRS, 375 m)',
  close: 'Close the Record',
  seeAsCounted: 'See the years as the satellites counted them',
  backToOneScale: 'Back to one scale',
  noFireLegend: 'No fire',
  less: 'Less',
  more: 'More fire',
  loading: (place: string) => `Loading the fire record of ${place}`,
  failed: (place: string) => `The fire record of ${place} did not load.`,
  /** What the grid shows while the years are drawn as counted. */
  asCounted: (ratio: number | null, year: number | null) =>
    ratio !== null && year !== null
      ? `As counted, before the correction. The newer satellite has about ${times(ratio)} times as many detections as the older ones, so the years before ${year} look quieter than they were.`
      : 'As counted, before the two kinds of satellite are put on one scale.',
  /** How well the correction holds, on a year left out. */
  holds: (heldOut: number, without: number) =>
    `Hide one year and predict it from the others: in a typical year the prediction is off by ${percent(heldOut)} percent. Without the correction for the change of satellite it is off by ${percent(without)} percent.`,
  grid: (place: string) =>
    `The fire record of ${place}: one square a month, years across, months down. Arrow keys move over the months; Enter shows the fire of a month in corner marks.`,
};
