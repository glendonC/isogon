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

/** A rate with the digits it deserves: "25.6", "0.32", "0.0028". Its unit is said beside it. */
export const rate = (v: number): string => (v === 0 ? '0' : v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toPrecision(2));

/** The unit of every rate on the Record, in words. */
export const RATE_UNIT = 'detections per 1,000 square kilometres a day';

/** From this ratio up a month is said by its rate and the usual rate: "2,349 times" reads oddly. */
const TOO_MANY_TIMES = 100;

/**
 * One sentence on a month against a usual one: the median of the same calendar month over the record's years.
 * `value` is the month's rate, null where no satellite flew; `timesUsual` is the record's own ratio and `usual` the
 * median it is a ratio to.
 */
export function monthLine(ym: string, value: number | null, timesUsual: number | null, usual: number | null = null): string {
  const name = monthName(ym);
  if (value === null) return 'No satellite counted fires in this month';
  if (value === 0) return 'No fire detected in this month';
  // With no usual month to set it against, the month is said by its own rate
  if (timesUsual === null || (timesUsual >= TOO_MANY_TIMES && usual === null)) return `${rate(value)} ${RATE_UNIT}`;
  if (timesUsual >= TOO_MANY_TIMES && usual !== null) return `${rate(value)} ${RATE_UNIT}. A usual ${name} here: ${rate(usual)}`;
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
  /** This month so far: the action that asks for it, its label, and why it cannot be counted. */
  thisMonth: 'This month so far',
  counting: 'Counting this month so far',
  soFar: (ym: string) => `${monthName(ym)} ${ym.slice(0, 4)} so far`,
  soFarRate: (value: number, days: { counted: number; inMonth: number } | null) =>
    `${rate(value)} ${RATE_UNIT}${days ? `, over the first ${days.counted} of ${days.inMonth} days` : ''}`,
  usualIs: (ym: string, usual: number) => `A usual ${monthName(ym)} here: ${rate(usual)}`,
  rough: 'How rough this is',
  roughBack: 'Back to the legend',
  notNow: (why: string) => `This month so far cannot be counted now: ${why}.`,
  whyNot: {
    'no key': "this page holds no key to NASA's fire service for the newest detections",
    'box too large': 'the newest detections are fetched for areas up to 5 degrees each way',
    busy: "NASA's fire service has been asked too often this hour; it answers again within the hour",
    'no full day yet': 'no full day of this month has passed yet',
    failed: 'the request for the newest detections failed',
  } as Record<string, string>,
  grid: (place: string) =>
    `The fire record of ${place}: one square a month, years across, months down. Arrow keys move over the months; Enter shows the fire of a month in corner marks.`,
};
