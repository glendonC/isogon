import { count, localDayTime, monthName } from '../guide/formats';

/**
 * Every sentence the pictures of the world put on screen, in one place. They are labels on things and prompts
 * beside them; what a screen is for is the guide's to say. A figure comes from an answer, never from here.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "November 2000" from "2000-11". */
export const monthYear = (ym: string | null | undefined) => (ym && monthName(ym) ? `${monthName(ym)} ${ym.slice(0, 4)}` : null);

/** Two significant figures, with commas: 1,234 becomes 1,200. */
export function roughly(v: number): string {
  if (v < 10) return v < 1 ? v.toFixed(1) : String(Math.round(v));
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return count(Math.round(v / p) * p) ?? String(v);
}

export function listAnd(xs: string[]): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

const deg = (v: number) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2));

export const EARTH_WORDS = {
  label: 'The Earth, with every fire NASA satellites detected since 2000',
  layerFire: 'Where fire is detected',
  layerFactor: 'How much more the sharp satellite sees',
  /** The legend of the fire layer, from the layer's own first month. */
  fireLegend: (since: string | null) =>
    `Detections of the coarse satellite (MODIS) in each square of a quarter degree, about 28 km${since ? `, since ${since}` : ''}.`,
  tick: (v: number) => roughly(v),
  hatch: (complete: boolean, since: string | null, loaded: string[] | number | null | undefined) =>
    complete
      ? `Hatched land: no detection there${since ? ` since ${since}` : ''}.`
      : `Hatched land: no file loaded so far holds a detection there, which is not the same as no fire.${
          typeof loaded === 'number' ? ` The files of ${count(loaded)} countries are loaded.` : Array.isArray(loaded) && loaded.length ? ` Loaded: ${listAnd(loaded)}.` : ''
        }`,
  halo: 'The soft glow round the squares is drawing only.',
  fireLegendShort: (since: string | null) => `Coarse detections per 28 km square${since ? ` since ${since}` : ''}.`,
  hatchShort: (complete: boolean) => (complete ? 'Hatched: no detection there.' : 'Hatched: nothing loaded there yet, not no fire.'),
  factorLegend: (step: number | null) =>
    `Detections of the sharp satellite (VIIRS) for each one of the coarse satellite (MODIS), over the months of 2012 to 2025 when both flew without a gap${step ? `, in squares of ${step} degrees` : ''}.`,
  factorSpread: (median: number, p10: number, p90: number) =>
    `The middle place: ${median.toFixed(1)} times. Eight places in ten lie between ${p10.toFixed(1)} and ${p90.toFixed(1)} times.`,
  factorTick: (f: number, low: number, high: number) => (f <= low ? `${f}× or less` : f >= high ? `${f}× or more` : `${f}×`),
  factorUnmeasured: 'Not drawn where too few detections were made to measure the factor.',
  factorLoading: 'Loading the factor between the two satellites.',
  factorFailed: 'The factor between the two satellites did not load. The map of detections is unchanged.',
  /** At the pointer. */
  atCell: (v: number, since: string | null) =>
    `About ${roughly(v)} detections of the coarse satellite in this 28 km square${since ? ` since ${since}` : ''}`,
  atEmpty: (since: string | null) => `No detection of the coarse satellite in this square${since ? ` since ${since}` : ''}`,
  atNotLoaded: 'Not loaded: no file loaded so far holds a detection in this square',
  atFactor: (f: number, end: -1 | 0 | 1) =>
    `Here the sharp satellite detects ${end === 1 ? `${Math.round(f)} times as many or more` : end === -1 ? `${f.toFixed(1)} times as many or fewer` : `${f.toFixed(1)} times as many`}`,
  atFactorError: (e: number, end: -1 | 0 | 1) =>
    `With this factor, a month of a year left out was off by ${end === 1 ? `${Math.round(e * 100)} percent or more` : `${Math.round(e * 100)} percent`} of what the sharp satellite saw`,
  atNoFactor: 'Too few detections here to measure the factor',
  /** The featured fires. */
  fireLabel: (name: string | null, place: string, year: string | null) => (name ? `${name}${year ? ` ${year}` : ''}` : place),
  showFire: (label: string) => `Show the fire of ${label}`,
  readPlace: 'Read the fire record of this place',
  /** A fire kept as the model's test, in the product lane's words (script state recorded_test_fire). */
  keptLabel: (label: string) => `${label}, kept as the test`,
  keptLine: (n: number) =>
    `One of the ${count(n)} fires kept as the model's test, so it is not hidden and tested again. Its record can be read.`,
  /** A fire the page may not open yet. */
  heldLabel: (short: string) => `${short}, not open yet`,
  heldLine: 'Not open yet: it lies where the test across the world is still to be scored, and opens after that test.',
  fires: (n: number) => (n === 1 ? 'One fire can be shown pass by pass' : `${count(n)} fires can be shown pass by pass`),
  /** Drawing an area. */
  draw: 'Draw an area',
  drawing: 'Drag across the map to draw an area',
  cancel: 'Stop drawing',
  boxSize: (latDeg: number, lonDeg: number, km2: number) =>
    `${deg(latDeg)} by ${deg(lonDeg)} degrees, ${roughly(km2)} square kilometres`,
  boxLoaded: (loaded: number, cells: number) =>
    loaded === cells
      ? 'Every square of it is in a loaded file'
      : loaded === 0
        ? 'No file loaded so far holds a detection in it: its record would be empty because nothing is loaded'
        : `${Math.round((loaded / cells) * 100)} percent of its squares are in a loaded file; the rest are not counted`,
  readBox: "Read this area's fire record",
  tooLarge: (max: number) => `Too large: the record takes an area up to ${deg(max)} degrees on a side`,
  tooSmall: (min: number) => `Too small: the record takes an area at least ${deg(min)} degrees on a side`,
  again: 'Draw again',
  loading: 'Loading where fire is detected on Earth.',
  failed: 'The map of detections did not load. The featured fires can still be chosen.',
  zoomIn: 'Closer',
  zoomOut: 'Farther',
};

/** Local time at a place with the part of the day: "15 November, 1:10 at night". */
export const atPlace = (iso: string | null | undefined, lon: number) => localDayTime(iso ?? null, lon);

/** "1:10 at night" alone, the day left out, for a row whose day is said once. */
export function clockAt(iso: string | null | undefined, lon: number): string | null {
  const s = localDayTime(iso ?? null, lon);
  return s ? s.slice(s.indexOf(',') + 2) : null;
}

/** "7:56" alone, the part of the day left out, for a second time in a sentence that says it once. */
export function clockOnly(iso: string | null | undefined, lon: number): string | null {
  const c = clockAt(iso, lon);
  return c ? c.split(' ')[0] : null;
}

/** "in the morning" alone. */
export function partAt(iso: string | null | undefined, lon: number): string | null {
  const c = clockAt(iso, lon);
  return c ? c.slice(c.indexOf(' ') + 1) : null;
}

/** "15 November" alone. */
export function dayAt(iso: string | null | undefined, lon: number): string | null {
  const s = localDayTime(iso ?? null, lon);
  return s ? s.slice(0, s.indexOf(',')) : null;
}

export { MONTHS };

/** "18 million" from 18,236,000; "250,000" under a million. */
export function millions(v: number): string {
  if (v >= 1e6) {
    const m = v / 1e6;
    return `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10} million`;
  }
  return roughly(v);
}

/** "4.4": a factor to one decimal, as the product lane writes the Earth's (EARTH-YEARS.md). */
export const oneDecimal = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** The Earth's years, in the product lane's words (isogon-notes/product/EARTH-YEARS.md, script version 15). */
export const YEAR_WORDS = {
  label: 'The Earth year by year, 2000 to 2025: detections in each square of a quarter degree',
  loading: 'Loading the years',
  failed: 'The yearly layers could not be read.',
  detected: 'As the satellites counted',
  harmonized: 'On one scale',
  harmonizedMissing: 'On one scale: not written yet',
  play: 'Play the years',
  pause: 'Stop',
  step: 'A year',
  modis: 'Counted by the older satellites (MODIS)',
  sharp: 'Counted by the newer, sharper satellite (VIIRS)',
  onScale: "On the newer satellite's scale",
  partialYear: (months: number) => `${months === 2 ? 'November and December' : `${months} months`} only: the archive begins in November 2000`,
  terraAlone: 'Terra alone: Aqua joins in July 2002',
  aquaJoins: 'Aqua joins in July',
  stepDetected: (ratio: number | null) =>
    ratio
      ? `2012: the newer, sharper satellite begins and makes about ${oneDecimal(ratio)} times as many detections of the same fires as the older ones, so the Earth brightens with no more fire.`
      : '2012: the newer, sharper satellite begins and makes more detections of the same fires than the older ones, so the Earth brightens with no more fire.',
  stepHarmonized: "2012: the newer, sharper satellite begins, and on one scale there is no step, because the older satellites' detections are put on its scale.",
  legend: 'Fire detected in a square of a quarter degree, about 28 km, in the year',
  closed: "Squares kept as the model's test, in 2021",
  hatch: 'Hatched land: no detection there.',
  totals: 'Detections each year, the whole Earth',
  barsModis: 'Older satellites (MODIS)',
  barsSharp: 'Newer satellite (VIIRS)',
  lineHarmonized: 'On one scale',
  partialBar: 'two months',
  clipped: (n: number) => `${n} ${n === 1 ? 'square lies' : 'squares lie'} above the scale and ${n === 1 ? 'is' : 'are'} drawn at its top`,
};
