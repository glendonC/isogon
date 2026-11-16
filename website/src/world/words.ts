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
  layerFactor: 'How much more VIIRS sees',
  /** The legend of the fire layer, from the layer's own first month. */
  fireLegend: (since: string | null) =>
    `MODIS detections in each quarter degree, about 28 km${since ? `, since ${since}` : ''}.`,
  tick: (v: number) => roughly(v),
  hatch: (complete: boolean, since: string | null, loaded: string[] | number | null | undefined) =>
    complete
      ? `Hatched land: no detection there${since ? ` since ${since}` : ''}.`
      : `Hatched land: no file loaded so far holds a detection there, which is not the same as no fire.${
          typeof loaded === 'number' ? ` The files of ${count(loaded)} countries are loaded.` : Array.isArray(loaded) && loaded.length ? ` Loaded: ${listAnd(loaded)}.` : ''
        }`,
  halo: 'The soft glow round the squares is drawing only.',
  fireLegendShort: (since: string | null) => `MODIS detections per 28 km square${since ? ` since ${since}` : ''}.`,
  hatchShort: (complete: boolean) => (complete ? 'Hatched: no detection there.' : 'Hatched: nothing loaded there yet, not no fire.'),
  factorLegend: (step: number | null) =>
    `VIIRS detections for each MODIS one, over the months both flew without a gap${step ? `, in squares of ${step} degrees` : ''}.`,
  factorSpread: (median: number, p10: number, p90: number) =>
    `The middle place: ${median.toFixed(1)} times. Eight places in ten lie between ${p10.toFixed(1)} and ${p90.toFixed(1)} times.`,
  factorTick: (f: number, low: number, high: number) => (f <= low ? `${f}× or less` : f >= high ? `${f}× or more` : `${f}×`),
  factorUnmeasured: 'Not drawn where too few detections were made to measure the factor.',
  factorLoading: 'Loading the factor between the two satellites.',
  factorFailed: 'The factor between the two satellites did not load. The map of detections is unchanged.',
  /** At the pointer. */
  atCell: (v: number, since: string | null) =>
    `About ${roughly(v)} MODIS detections in this 28 km square${since ? ` since ${since}` : ''}`,
  atEmpty: (since: string | null) => `No MODIS detection in this square${since ? ` since ${since}` : ''}`,
  atNotLoaded: 'Not loaded: no file loaded so far holds a detection in this square',
  atFactor: (f: number, end: -1 | 0 | 1) =>
    `Here VIIRS detects ${end === 1 ? `${Math.round(f)} times as many or more` : end === -1 ? `${f.toFixed(1)} times as many or fewer` : `${f.toFixed(1)} times as many`}`,
  atFactorError: (e: number, end: -1 | 0 | 1) =>
    `With this factor, a month of a year left out was off by ${end === 1 ? `${Math.round(e * 100)} percent or more` : `${Math.round(e * 100)} percent`} of what VIIRS saw`,
  atNoFactor: 'Too few detections here to measure the factor',
  /** The featured fires. */
  fireLabel: (name: string | null, place: string, year: string | null) => (name ? `${name}${year ? ` ${year}` : ''}` : place),
  showFire: (label: string) => `Show the fire of ${label}`,
  readPlace: 'Read the fire record of this place',
  /** A fire kept as the model's test, in the product lane's words (script state recorded_test_fire). */
  keptLabel: (label: string) => `${label}, kept as the test`,
  keptLine: (_n: number) => 'A test fire: you can read its record, but it is not tested again.',
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

/** "20.4": a fraction said as a percentage with one decimal (words version 16's `percent1`). */
export const percent1 = (v: number) => (Math.round(v * 1000) / 10).toFixed(1);

/** "4.4": a factor to one decimal, as the product lane writes the Earth's (EARTH-YEARS.md). */
export const oneDecimal = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** The Earth's years, in the product lane's words (isogon-notes/product/EARTH-YEARS.md, script version 27). */
export const YEAR_WORDS = {
  label: 'The Earth year by year, 2000 to 2025: detections in each square of a quarter degree',
  loading: 'Loading the years',
  failed: 'The yearly layers could not be read.',
  detected: 'As counted',
  harmonized: 'On one scale',
  harmonizedMissing: 'On one scale: not written yet',
  play: 'Play the years',
  pause: 'Stop',
  step: 'A year',
  modis: 'Counted by MODIS',
  sharp: 'Counted by VIIRS',
  onScale: 'On the VIIRS scale',
  partialYear: (months: number) => `${months === 2 ? 'November and December' : `${months} months`} only: the archive begins in November 2000`,
  terraAlone: 'Terra alone: Aqua joins in July 2002',
  aquaJoins: 'Aqua joins in July',
  stepDetected: (ratio: number | null) =>
    ratio
      ? `2012: VIIRS begins and makes ${oneDecimal(ratio)} times as many detections, so the Earth looks brighter though there is no more fire.`
      : '2012: VIIRS begins and makes more detections, so the Earth looks brighter though there is no more fire.',
  stepHarmonized: '2012: VIIRS begins, and on one scale there is no step.',
  legend: 'Fire detected in a square of a quarter degree, about 28 km, in the year',
  closed: 'Test fires of 2021, not tested again',
  hatch: 'Hatched land: no detection there.',
  totals: 'Detections each year, the whole Earth',
  barsModis: 'MODIS',
  barsSharp: 'VIIRS',
  lineHarmonized: 'On one scale',
  partialBar: 'two months',
  /** A country picked on the Earth: its own strip, and the way back to the whole Earth. */
  countryTotals: (name: string) => `Detections each year, ${name}`,
  wholeEarth: 'The whole Earth',
  pickCountry: 'Click a country for its own years, a square to go to its place',
  noFile: 'no file of its own',
  /** The pointed country's frame in the scene: its action, and its readout's count for the year on show. */
  countryAction: 'Show its years',
  /** Under a pointed country's figures: the places it holds, each a square on the globe to go to. */
  placesIn: (names: string[]) => (names.length === 1 ? `Its place to go: ${names[0]}` : `Its places to go: ${names.join(', ')}`),
  /** Under the name of the place the visitor came back up from, ringed on the globe. */
  cameFrom: 'You came from here',
  /** A place's square on the globe, pointed at: what a click does. */
  placeAction: 'Go to this place',
  readoutYear: (n: string, year: number, oneScale: boolean) => `${n} detections${oneScale ? ' on one scale' : ''} in ${year}`,
  readoutNone: (year: number) => `none counted in ${year}`,
  /** The square under the pointer on the globe, for the year on show. */
  squareNone: (year: number) => `No detection in this square in ${year}`,
  squareClosed: (year: number) => `A test fire of ${year}, not tested again`,
  squareExact: (v: number, year: number) =>
    `${Math.round(v).toLocaleString('en-US')} ${Math.round(v) === 1 ? 'detection' : 'detections'} in this square in ${year}`,
  squareOneScale: (v: number, year: number) => `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US')} on one scale in this square in ${year}`,
  atSea: 'At sea',
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

/** A method's match with VIIRS as written: within one pixel and exact to the pixel. */
export interface Pair {
  w: string;
  e: string;
}

/** Better than, worse than or as well as, from two shares as written. */
/** Two shares, as written in percent, closer than one percentage point: level, never better or worse. */
const level = (a: string, b: string) => Math.abs(Number(a) - Number(b)) < 1;
const cmp = (a: string, b: string) => (level(a, b) ? 'level with' : Number(a) > Number(b) ? 'better than' : 'worse than');

/** How a first share compares with a second: "29 percent better than"; null when the second is not above zero. */
const rel = (a: string, b: string) => {
  const x = Number(a);
  const y = Number(b);
  if (!(y > 0)) return null;
  if (level(a, b)) return 'level with';
  const p = Math.round((x / y - 1) * 100);
  return p > 0 ? `${p} percent better than` : p < 0 ? `${-p} percent worse than` : 'level with';
};

/**
 * The guide's words on the pictures of the world, as the product lane writes them: the Earth's years from the
 * script's state `earth_years` (GUIDE-script.json version 27, EARTH-YEARS.md), the test across the world and the
 * sealed predictions from WORDS-wider.json version 4 (`world_pictures`). Every figure is a field filled from an answer.
 */
export const SCREEN_WORDS = {
  years: {
    objective: (first: number) => `Watch the Earth's fire since ${first}`,
    /** The name in view in the top bar. */
    where: 'Fire detections per year',
    context: (first: number, last: number) => `${first} to ${last}`,
    counted: (ratio: string) =>
      `These are the years as counted. From 2012 the counts come from VIIRS, a sharper satellite that makes ${ratio} times as many detections as MODIS.`,
    oneScale: 'On one scale the MODIS years are raised to what VIIRS would count, so 2012 shows no jump.',
    play: 'Play the years',
    stop: 'Stop the years',
    toOneScale: "Put every year on VIIRS's scale",
    toCounted: 'Show the counts before scaling',
    back: 'Back',
    filmCounted: (ratio: string) => `2012: VIIRS begins, seeing smaller fires too: ${ratio} times the detections.`,
    filmOneScale: (_first: number) => 'On one scale, no jump.',
  },
  test: {
    objective: 'See how the estimate did on new fires',
    /** The name in view in the top bar. */
    where: (fires: number | null) => (fires ? `How the model did on ${fires} new fires` : 'The test across the world'),
    strictBehind: (fires: number, _continents: number, ahead: number, _of: number, behind: number) =>
      `On ${fires} fires it never saw, it won ${ahead} scores and lost ${behind}, and pixel for pixel MODIS alone does better.`,
    notStrictBehind: (fires: number, _continents: number, ahead: number, of: number, level: number, behind: number) =>
      `On ${fires} fires it never saw, it won ${ahead}, tied ${level} and lost ${behind} of ${of} scores.`,
    squares: (of: number) =>
      `Each square is one fire, filled by how many of the ${of} scores the estimate won there: full is all, empty is none.`,
    fireScores: "Show a fire's scores",
    back: 'Back to the test',
    filmA: (fires: number, ahead: number, of: number, behind: number) => `On ${fires} unseen fires: won ${ahead} of ${of} scores, lost ${behind}.`,
    // WORDS-wider.json version 15, world_pictures, the test across the world's film line once test B is taken: the
    // second model (the challenger the runs answer with) and the first; version 12's line where no second is scored.
    filmB: (ahead: number, of: number, behind: number, others: string | null, second: { ahead: number; behind: number } | null) =>
      second
        ? `Untouched fires: second model won ${second.ahead}, lost ${second.behind}. First: won ${ahead}, lost ${behind}.`
        : `Untouched fires: won ${ahead} of ${of}, lost ${behind}.${others ? ` Other models: won ${others}.` : ''}`,
    // WORDS-wider.json version 16, world_pictures, test_across_world: the overlap with VIIRS fire pixels, exact, as plain
    // percentages (one decimal), test B's first and then test A's.
    // Each method's match with VIIRS as written, within one pixel (w) and exact to the pixel (e). The line leads with
    // within one pixel and its relative difference; the exact figures follow, smaller, and a loss is said as one.
    overlapB: (fires: number, second: Pair, modis: Pair, first: Pair) =>
      `On the latest test's ${fires} fires, none of which it had seen, the new model, a later version chosen on other fires, was ${rel(second.w, modis.w) ?? 'beside'} MODIS alone at matching VIIRS within one pixel, ${second.w} against ${modis.w} percent, and exact to the pixel ${second.e} against ${modis.e}. The first model, the earlier version, was ${cmp(first.w, modis.w)} MODIS alone within one pixel, ${first.w} against ${modis.w}, and ${cmp(first.e, modis.e)} it exact, ${first.e} against ${modis.e}.`,
    overlapA: (fires: number, first: Pair, modis: Pair) =>
      `On the earlier test's ${fires} fires, none of which it had seen, the first model was ${rel(first.w, modis.w) ?? 'beside'} MODIS alone at matching VIIRS within one pixel, ${first.w} against ${modis.w} percent, and ${cmp(first.e, modis.e)} it exact to the pixel, ${first.e} against ${modis.e}.`,
    filmOverlapB: (second: string, modis: string, first: string) => `New fires, within one pixel: new model ${second}%, MODIS ${modis}%, first model ${first}%.`,
    filmOverlapA: (first: string, modis: string) => `Unseen fires, within one pixel: model ${first}%, MODIS ${modis}%.`,
  },
  sealed: {
    objective: 'See estimates made before VIIRS passed',
    /** The name in view in the top bar. */
    where: 'Fires burning now',
    // WORDS-wider.json version 16, world_pictures, sealed_open.
    marks: 'For fires burning now, the model wrote down where VIIRS would see fire before VIIRS flew over. Each estimate is scored once NASA publishes that pass.',
    soFar: (fires: number, ahead?: number | null, tied?: number | null, behind?: number | null) =>
      ahead != null && tied != null && behind != null
        ? `Over the ${fires} fires scored so far, the model is ${ahead > behind ? 'ahead of' : ahead < behind ? 'behind' : 'no better than'} MODIS alone.`
        : `So far ${fires} fires are scored. Each row shows how well the model and MODIS alone matched VIIRS there.`,
    back: 'Back to the fire',
    /** How the estimates did on every measure, said on demand. */
    measures: (ahead: number | null, tied: number | null, behind: number | null) =>
      ahead != null && tied != null && behind != null
        ? `The table shows one measure. Over all ${ahead + tied + behind} measures it was clearly better on ${ahead}, clearly worse on ${behind}, and too close to call on ${tied}.`
        : null,
    /** What the table's match is, said on demand. */
    match: 'Match counts the pixels where an estimate and VIIRS both show fire, out of all pixels where either does. The two simple methods take what MODIS saw as it is, one as counted and one scaled up to what VIIRS would count; MODIS alone in the table is the first. Each measure compares an estimate with VIIRS on where the fire is, how much of it there is, or how much heat it gives off.',
    film: 'Live: estimates written down before NASA publishes the pass.',
  },
};

