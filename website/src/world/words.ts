import { count, localDayTime, monthName } from '../guide/formats.ts';

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
  /**
   * What a drawn box holds: the share of its squares where fire was detected, and what the rest is, sea or land where
   * nothing was detected (every country's file is loaded; while some were not, that land is said as not loaded yet).
   */
  boxGround: (g: { cells: number; loaded: number; sea: number; land: number }, complete: boolean) => {
    const dry = complete ? 'land where nothing was detected' : 'land with no detection in the files loaded so far';
    if (g.loaded === g.cells) return "NASA's satellites detected fire in every square of it since November 2000";
    if (g.loaded === 0) {
      if (g.land === 0) return 'It is all sea: no fire was detected in it since November 2000, so its record would be empty';
      return complete
        ? 'No fire was detected in it since November 2000, so its record would be empty'
        : 'No file loaded so far holds a detection in it, so its record would be empty';
    }
    const p = Math.min(99, Math.max(1, Math.round((g.loaded / g.cells) * 100)));
    const rest = g.land === 0 ? 'sea' : g.sea === 0 ? dry : `sea, or ${dry}`;
    return `NASA's satellites detected fire in ${p} percent of its squares since November 2000; the rest is ${rest}`;
  },
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

/**
 * A total in millions to one decimal at every size, as the film and the README's figure say them: "19.5 million" from
 * 19,491,829, "4.6 million" from 4,573,073, "24.0 million" from 24,000,400. "250,000" under a million.
 */
export function millions(v: number): string {
  if (v >= 1e6) return `${(Math.round(v / 1e5) / 10).toFixed(1)} million`;
  return roughly(v);
}

/** A grid line's whole millions: "10 million". */
export const wholeMillions = (v: number) => `${Math.round(v / 1e6)} million`;

/** A country's grid line, a round value: "1.5 million", "40,000". */
export const gridWords = (v: number) => (v >= 1e6 ? `${Math.round(v / 1e5) / 10} million` : v.toLocaleString('en-US'));

/** "4.4": a factor to one decimal, as the product lane writes the Earth's (EARTH-YEARS.md). */
export const oneDecimal = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** The Earth's years, in the product lane's words (isogon-notes/product/EARTH-YEARS.md, script version 15; the 2012 label as version 23). */
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
      ? `2012: the newer, sharper satellite begins and makes about ${oneDecimal(ratio)} times as many detections, smaller fires among them, so the Earth brightens with no more fire.`
      : '2012: the newer, sharper satellite begins and makes more detections, smaller fires among them, so the Earth brightens with no more fire.',
  stepHarmonized: "2012: the newer, sharper satellite begins, and on one scale there is no step, because the older satellites' detections are put on its scale.",
  legend: 'Fire detected in a square of a quarter degree, about 28 km, in the year',
  closed: "Squares kept as the model's test, in 2021",
  hatch: 'Hatched land: no detection there.',
  totals: 'Detections each year, the whole Earth',
  barsModis: 'Older satellites (MODIS)',
  barsSharp: 'Newer satellite (VIIRS)',
  lineHarmonized: 'On one scale',
  partialBar: 'two months',
  /** A country picked on the Earth: its own strip, and the way back to the whole Earth. */
  countryTotals: (name: string) => `Detections each year, ${name}`,
  wholeEarth: 'The whole Earth',
  pickCountry: 'Click a country for its own years',
  noFile: 'no file of its own',
  /** The square under the pointer on the globe, for the year on show. */
  squareNone: (year: number) => `No detection in this square in ${year}`,
  squareClosed: (year: number) => `Kept as the model's test in ${year}`,
  squareAbout: (v: number, year: number) =>
    v < 1.5 ? `About 1 detection in this square in ${year}` : `About ${roughly(v)} detections in this square in ${year}`,
  noFileStrip: (name: string, holder: string | null) =>
    holder
      ? `${name} has no file of its own in NASA's archive: most of the detections inside it are in ${holder}'s file.`
      : `${name} has no file of its own in NASA's archive, so there are no yearly counts for it here.`,
  drawnInside: (n: number) => `Not in its count: ${n === 1 ? 'one part, with a file of its own' : `${n} parts, with files of their own`}`,
  drawnInsideAll: (names: string[]) => `${listAnd(names)} ${names.length === 1 ? 'has a file' : 'have files'} of their own, not in this count.`,
  clipped: (n: number) => `${n} ${n === 1 ? 'square lies' : 'squares lie'} above the scale and ${n === 1 ? 'is' : 'are'} drawn at its top`,
};

/**
 * The guide's words on the pictures of the world, as the product lane writes them: the Earth's years from the
 * script's state `earth_years` (GUIDE-script.json version 23, EARTH-YEARS.md), the test across the world and the
 * sealed predictions from WORDS-wider.json version 4 (`world_pictures`). Every figure is a field filled from an answer.
 */
export const SCREEN_WORDS = {
  years: {
    objective: (first: number) => `Watch the Earth's fire year by year since ${first}`,
    context: (first: number, last: number) => `${first} to ${last}`,
    counted: (ratio: string) =>
      `Each year as the satellites counted it: the older satellites' detections before 2012, the newer one's from then, about ${ratio} times as many, since it also sees smaller fires.`,
    oneScale: "Each year on one scale: the older satellites' detections are put on the newer one's scale, so the years can be set side by side and 2012 shows no jump.",
    play: 'Play the years',
    stop: 'Stop',
    toOneScale: 'See the years on one scale',
    toCounted: 'See the years as the satellites counted them',
    back: 'Back',
    filmCounted: (ratio: string) => `2012: a sharper satellite begins, seeing smaller fires too: ${ratio} times the detections.`,
    filmOneScale: (first: number) => `On one scale, the years since ${first} show no jump.`,
  },
  test: {
    objective: 'See where the estimate was tested',
    strictBehind: (fires: number, continents: number, ahead: number, of: number, behind: number) =>
      `On ${fires} fires it had never seen, across ${continents} continents, the experimental model was ahead of the simple methods on ${ahead} of ${of} scores and behind on ${behind}: it does not place fire square for square better than painting the coarse satellite's detections.`,
    notStrictBehind: (fires: number, continents: number, ahead: number, of: number, level: number, behind: number) =>
      `On ${fires} fires it had never seen, across ${continents} continents, the experimental model was ahead of the simple methods on ${ahead} of ${of} scores, level on ${level} and behind on ${behind}.`,
    squares: (of: number) =>
      `Each square is one fire, filled by how many of the ${of} scores the estimate won there against both simple methods: full is all, empty is none.`,
    fireScores: "Show a fire's scores",
    back: 'Back to the test',
    filmA: (fires: number, ahead: number, of: number, behind: number) => `On ${fires} unseen fires: ahead on ${ahead} of ${of} scores, behind on ${behind}.`,
    // WORDS-wider.json version 13, world_pictures, the test across the world's film line once test B is taken: the
    // second model (the challenger the runs answer with) and the first; version 12's line where no second is scored.
    filmB: (ahead: number, of: number, behind: number, others: string | null, second: { ahead: number; behind: number } | null) =>
      second
        ? `Untouched fires: second model ${second.ahead} ahead, ${second.behind} behind. First: ${ahead} ahead, ${behind} behind.`
        : `Untouched fires: ${ahead} of ${of} ahead, ${behind} behind.${others ? ` Other models: ${others} ahead.` : ''}`,
    // GUIDE-script.json version 23, step test, `test_b_taken`: said before test A's sentence.
    testB: (fires: number, ahead: number, of: number, level: number, behind: number, others: { n: string; ahead: string } | null) =>
      `On ${fires} fires that nothing had touched, the estimate was ahead of the simple methods on ${ahead} of ${of} scores, level on ${level} and behind on ${behind}${others ? `, while ${others.n} other models were each ahead on ${others.ahead}` : ''}.`,
  },
  sealed: {
    objective: 'See predictions written before the pass',
    marks: 'Each mark is a fire burning now, where a prediction was written down with its fingerprint before NASA published what the sharp satellite saw.',
    soFar: (scored: number, ahead: number, level: number, behind: number) =>
      `So far ${scored} are scored: ahead of both simple methods on ${ahead} scores, level on ${level} and behind on ${behind}.`,
    back: 'Back to the fire',
    film: (ahead: number, level: number, behind: number) => `Sealed before the pass. Scores: ${ahead} ahead, ${level} level, ${behind} behind.`,
  },
};

