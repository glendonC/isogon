import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { tOfValue } from './cells';
import { countryShapeAt, type CountryShape } from './countryAt';
import { Globe, globeWanted } from './Globe';
import { ScenePrompt } from '../identity/ScenePrompt';
import type { ScreenBox } from '../identity/scene';
import { countryOf, countryRatio, countryTotals, drawnInside, heldBy, type CountriesFile, type CountryYears } from './countryYears';
import { YearBars } from '../dataviz/YearBars';
import { seriesFromCube, type YearSeries } from '../dataviz/yearSeries';
import '../dataviz/dataviz.css';
import { FIRE_RAMP } from './layers';
import { useWorldKeys } from './keys';
import { useRead } from './read';
import { Ticks } from './Ticks';
import { WorldCanvas, type GridLayer } from './WorldCanvas';
import type { Box, Projector } from './projection';
import { EARTH_WORDS, millions, YEAR_WORDS as Y } from './words';
import { boxMiddle } from './descent';
import type { Destination } from './destinations';
import { formatCoord } from '../identity/where';
import {
  familyOf,
  layerOf,
  liteOf,
  modeReady,
  paintYear,
  readIndices,
  SHARP_FROM,
  sharpRatio,
  totalsOf,
  yearLut,
  type YearLayerMeta,
  type YearsIndex,
  type YearsMode,
} from './years';
import '../styles/world.css';

export interface EarthYearsProps {
  /** The yearly layers' index: `/api/cube/years`, or a `years.json` beside its PNGs. */
  source?: string;
  /** The record first on show. */
  mode?: YearsMode;
  /** The year first on show; the first year when left out. */
  year?: number;
  /** Plays once by itself when every year is in, in about six seconds; on by default in the film presentation. */
  autoplay?: boolean;
  /** On the globe, outside the film: the years play by themselves, round and round, until the visitor takes over. */
  loop?: boolean;
  /** The year large in the caption's place, top left; a screen that says the year in its own objective passes false. */
  caption?: boolean;
  onYear?: (year: number, mode: YearsMode) => void;
  /** The box first in view: the land where fire is detected, without the poles, so the Earth takes the width. */
  focus?: Box;
  /** A pass that plays stops at this year (the film's: 2010 to 2012); the last year when left out. */
  until?: number;
  /** In place of the line under the year (the film's caption stands there). */
  captionLine?: string | null;
  /** The label on the 2012 bar; the film leaves it to the caption. */
  stepLabel?: boolean;
  /** The screen's own Play button; a host whose guide offers Play passes false. */
  ownPlay?: boolean;
  /** What a host's guide drives: play or stop, switch the view. */
  control?: MutableRefObject<YearsControl | null>;
  /** The state a host's guide says: the year, the view, whether it plays, and the figures of its sentences. */
  onState?: (s: YearsState) => void;
  /**
   * A place being descended into: the globe flies into its box and frames it with its name and a readout, in place of
   * any country; null or absent, the globe is the visitor's.
   */
  descent?: { rings: number[][][]; name: string; readout: string } | null;
  /** The places with a fire to open, marked on the globe as small squares; pointing at one frames it by name. */
  places?: Destination[];
  /** A place's square clicked (or its frame): the page opens that place. */
  onPlace?: (id: string) => void;
}

export interface YearsControl {
  play: () => void;
  flip: () => void;
}

export interface YearsState {
  year: number;
  mode: YearsMode;
  playing: boolean;
  first: number;
  last: number;
  ratio: number | null;
  ratioLow: number | null;
  ratioHigh: number | null;
  oneScaleReady: boolean;
}

const YEARS_VIEW: Box = [-170, -44, 180, 74];

// A pass through the years lasts about six seconds: the coarse years quickly, 2012 long enough to read its sentence.
const beat = (year: number) => (year < SHARP_FROM ? 170 : year === SHARP_FROM ? 1500 : 190);
// A short pass (the film's 2010 to 2012) gives each year time to be seen, and rests about a second on the year before
// the step (2011), so the Earth before the sharper satellite is seen before it brightens.
const shortBeat = (year: number) => (year === SHARP_FROM - 1 ? 1100 : 600);


const isFilm = () => typeof document !== 'undefined' && document.documentElement.classList.contains('iso-film');

/** A year's layer to read: the year (`m`), what is read for it (its twin or itself), and whether that is the twin. */
type Q = { m: YearLayerMeta; read: YearLayerMeta; lite: boolean };

/** The full layers of a year and of its two neighbours, the year first. */
function fullAround(idx: YearsIndex, mode: YearsMode, year: number): Q[] {
  return [year, year - 1, year + 1].flatMap((y) => {
    const m = layerOf(idx, mode, y);
    return m ? [{ m, read: m, lite: false }] : [];
  });
}

/** A country's outline on the map, as an SVG path in the map's pixels. */
function outlineOf(rings: number[][][], p: Projector): string {
  let d = '';
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const [x, y] = p.at(r[i][0], r[i][1]);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    d += 'Z';
  }
  return d;
}

/** A country's years in the dataviz lane's shape (YearSeries), from the countries route as this screen reads it. */
function seriesOfCountry(idx: YearsIndex, c: CountryYears): YearSeries {
  const years = idx.years.map((y) => {
    const v = c.years[y.year];
    return { year: y.year, partial: y.partial, months: y.months, modis: v?.modis ?? null, viirs: v?.viirs ?? null, oneScale: v?.harmonized ?? null };
  });
  const first = years.find((p) => p.viirs !== null && p.viirs > 0);
  return { years, firstViirsYear: first ? first.year : null };
}

/** The frame's readout: the country, the pointed spot's coordinates, and the country's detections in the year on show. */
function countryReadout(shape: CountryShape, at: { lon: number; lat: number }, year: number, mode: YearsMode, countries: CountriesFile | null): string {
  const where = degreeWords(at.lon, at.lat);
  if (!countries) return `${shape.name}  ${where}`;
  const c = countryOf(countries, shape.key, shape.name);
  if (!c) return `${shape.name}  ${where}  ${Y.noFile}`;
  const v = c.years[year];
  const n = !v ? null : mode === 'harmonized' ? v.harmonized : year >= SHARP_FROM ? v.viirs : v.modis;
  return `${shape.name}  ${where}  ${n === null || n === undefined ? Y.readoutNone(year) : Y.readoutYear(millions(n), year, mode === 'harmonized')}`;
}

/** "40.05° N  121.18° W", as the search's side view writes a place. */
const degreeWords = (lon: number, lat: number) =>
  `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'}  ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? 'W' : 'E'}`;

const ramp = (stops: Array<[number, [number, number, number]]>) =>
  `linear-gradient(to right, ${stops.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ')})`;

/**
 * The Earth plays the years 2000 to 2025, one frame a year from the fire cube's yearly layers. As detected, the
 * coarse instrument to 2011 and the sharper one from 2012 on one scale, so the Earth brightens in 2012 with no more
 * fire; the harmonized record holds one scale through every year. Under it, the world's total of each year: as
 * detected as bars, the harmonized record as a line, the year on show marked. Enter and Space play and stop, the
 * arrows step a year, Y switches the view (the script's keys).
 *
 * Outside the film a visitor points at a country (it is outlined and named) and clicks it: the strip shows that
 * country's detections each year (`GET /api/cube/years/countries`) while the Earth keeps playing the world. Esc or a
 * click on the sea brings back the whole Earth's strip.
 */
export function EarthYears({
  source = '/api/cube/years',
  mode: startMode = 'detected',
  year: startYear,
  autoplay,
  loop = true,
  caption = true,
  onYear,
  focus = YEARS_VIEW,
  until,
  captionLine = null,
  stepLabel = true,
  ownPlay = true,
  control,
  onState,
  descent = null,
  places = [],
  onPlace,
}: EarthYearsProps) {
  const read = useRead<YearsIndex>(source);
  const idx = read.state === 'ready' ? read.value : null;
  const years = useMemo(() => (idx ? idx.years.map((y) => y.year) : []), [idx]);
  const harmonizedReady = idx ? modeReady(idx, 'harmonized') : false;
  const [mode, setMode] = useState<YearsMode>(startMode);
  const [year, setYear] = useState<number | null>(startYear ?? null);
  const [playing, setPlaying] = useState(false);
  const shown = year ?? years[0] ?? null;

  // A country picked on the Earth, outside the film: the country under the pointer, the one chosen, and its years.
  const pick = !isFilm();
  // The Earth as a turning globe where it is switched on (`GLOBE_ON`, or ?globe=1) and WebGL 2 holds its frames; the
  // flat map otherwise.
  const [flat, setFlat] = useState(() => typeof window === 'undefined' || !globeWanted(window.location.search));
  const countriesRead = useRead<CountriesFile>(pick ? '/api/cube/years/countries' : null);
  const countries = countriesRead.state === 'ready' ? countriesRead.value : null;
  const [pointed, setPointed] = useState<{ shape: CountryShape; x: number; y: number } | null>(null);
  const [chosen, setChosen] = useState<CountryShape | null>(null);
  const chosenYears = useMemo(() => (countries && chosen ? countryOf(countries, chosen.key, chosen.name) : null), [countries, chosen]);
  // A shape picked that has no file of its own: the strip says so, and which file holds most of it where known.
  const noFile = countries && chosen && !chosenYears ? { name: chosen.name, holder: heldBy(countries, chosen.key) } : null;
  const hasFile = (s: CountryShape) => !countries || Boolean(countries.by_atlas?.[s.key]);
  const onHover = useCallback((at: { lon: number; lat: number; x: number; y: number } | null) => {
    const shape = at ? countryShapeAt(at.lon, at.lat) : null;
    setPointed(shape && at ? { shape, x: at.x, y: at.y } : null);
  }, []);
  const onClickMap = useCallback(
    (at: { lon: number; lat: number }) => {
      const shape = countryShapeAt(at.lon, at.lat);
      // The sea brings back the whole Earth.
      if (!shape) setChosen(null);
      else if (countries) setChosen(shape);
    },
    [countries],
  );
  // The place whose pin is under the pointer, if any, and its pin's box on the screen: it takes the frame in place of
  // the country around it.
  const [pinned, setPinned] = useState<{ id: string; box: ScreenBox } | null>(null);
  const pointedPlace = pinned ? places.find((p) => p.id === pinned.id) ?? null : null;
  const pins = useMemo(() => (pick && !descent ? places.map((p) => ({ id: p.id, ...boxMiddle(p.box) })) : []), [pick, descent, places]);
  // The pointed country's (or place's) outline is the one whose screen box the globe tells, for its frame and readout;
  // every place with a fire stands as a small square, the Earth's destinations.
  const globeOutlines = useMemo(
    () =>
      descent
        ? [{ rings: descent.rings, strong: true, report: true }]
        : [
            ...(chosen ? [{ rings: chosen.rings, strong: true, report: !pointedPlace && pointed?.shape.key === chosen.key }] : []),
            ...(!pointedPlace && pointed && pointed.shape.key !== chosen?.key ? [{ rings: pointed.shape.rings, strong: false, report: true }] : []),
          ],
    [chosen, pointed, descent, pointedPlace],
  );
  const [countryBox, setCountryBox] = useState<ScreenBox | null>(null);
  // The globe flies to the chosen country and back out when none is chosen (one object a choice, so it flies once).
  const flyTo = useMemo(() => (descent ? { rings: descent.rings } : chosen ? { rings: chosen.rings } : null), [chosen, descent]);
  // On the globe the pointer says where it is and what the square holds, sea included.
  const [under, setUnder] = useState<{ lon: number; lat: number; x: number; y: number } | null>(null);
  const onGlobePoint = useCallback(
    (p: { lon: number; lat: number; x: number; y: number } | null) => {
      setUnder(p);
      onHover(p);
    },
    [onHover],
  );
  const onGlobePick = useCallback((p: { lon: number; lat: number } | null) => (p ? onClickMap(p) : setChosen(null)), [onClickMap]);
  // The outlines are kept per country and view, so the pointer's moves do not trace them again.
  const outlines = useRef(new Map<string, string>());
  const outline = (shape: CountryShape, p: Projector) => {
    const [x0, y0] = p.at(0, 0);
    const [x1] = p.at(10, 0);
    const k = `${shape.key}|${x0.toFixed(1)}|${y0.toFixed(1)}|${x1.toFixed(1)}`;
    let d = outlines.current.get(k);
    if (!d) {
      if (outlines.current.size > 40) outlines.current.clear();
      d = outlineOf(shape.rings, p);
      outlines.current.set(k, d);
    }
    return d;
  };

  useEffect(() => {
    if (idx && year === null) setYear(startYear ?? idx.years[0].year);
  }, [idx, year, startYear]);
  useEffect(() => {
    if (mode === 'harmonized' && idx && !harmonizedReady) setMode('detected');
  }, [mode, idx, harmonizedReady]);
  useEffect(() => {
    if (shown !== null) onYear?.(shown, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, mode]);

  // Every year of the record on show, read once and kept as palette indices (about 1 MB a year).
  const frames = useRef(new Map<string, Uint8Array>());
  // The years whose frame is still the lighter twin.
  const liteKeys = useRef(new Set<string>());
  const enqueueRef = useRef<((items: Q[], first?: boolean) => void) | null>(null);
  const [ready, setReady] = useState(0);
  useEffect(() => {
    if (!idx) return;
    let live = true;
    const want = idx.years.map((y) => layerOf(idx, mode, y.year)).filter((m): m is NonNullable<typeof m> => m !== null);
    // The years of a pass that plays come first (the film's 2010 to 2012), then the rest from the year on show outwards.
    const lo = startYear ?? -Infinity;
    const hi = until ?? -Infinity;
    const inPass = (y: number) => y >= lo && y <= hi;
    const near = (y: number) => (shown === null ? 0 : Math.abs(y - shown));
    const order = [...want].sort((a, b) => Number(inPass(b.year)) - Number(inPass(a.year)) || near(a.year) - near(b.year));
    // Outside the film, every year's lighter twin first (the fire cube's F16: a quarter of the bytes), then the full
    // layer of the year on show and of its neighbours, each taking its twin's place as it comes in; a year with no
    // twin, or whose twin cannot be read, is read in full. The film reads the full layers only, every year.
    const film = isFilm();
    const palette = idx.png.palette_rgb;
    const queue: Q[] = [];
    let workers = 0;
    const run = async (): Promise<void> => {
      workers += 1;
      while (live && queue.length) {
        const q = queue.shift()!;
        const k = `${q.m.family}_${q.m.year}`;
        if (q.lite ? frames.current.has(k) : frames.current.has(k) && !liteKeys.current.has(k)) continue;
        try {
          const t0 = performance.now();
          const ix = await readIndices(q.read, palette);
          // A full layer read while its twin was on its way stays: the twin never takes its place.
          if (q.lite && frames.current.has(k)) continue;
          frames.current.set(k, ix);
          if (q.lite) liteKeys.current.add(k);
          else liteKeys.current.delete(k);
          // Each year's load, measured where the page can read it (the fire cube's lane times them).
          performance.measure(`iso-year ${q.lite ? 'lite_' : ''}${k}`, { start: t0, end: performance.now() });
        } catch {
          // A twin that cannot be read gives way to its full layer; a full layer that cannot be read keeps the last
          // frame on show.
          if (q.lite) queue.push({ m: q.m, read: q.m, lite: false });
        }
        if (live) setReady((n) => n + 1);
      }
      workers -= 1;
    };
    const enqueue = (items: Q[], first = false) => {
      if (first) queue.unshift(...items);
      else queue.push(...items);
      while (live && workers < 4 && queue.length) void run();
    };
    enqueueRef.current = enqueue;
    if (film) enqueue(order.map((m) => ({ m, read: m, lite: false })));
    else {
      enqueue(order.map((m) => {
        const t = liteOf(idx, m);
        return t ? { m, read: t, lite: true } : { m, read: m, lite: false };
      }));
      if (shown !== null) enqueue(fullAround(idx, mode, shown));
    }
    return () => {
      live = false;
      enqueueRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, mode]);

  // The full layer of the year on show and of its neighbours, once it rests on show (not every year a pass runs past).
  useEffect(() => {
    if (!idx || shown === null || isFilm()) return;
    const t = window.setTimeout(() => enqueueRef.current?.(fullAround(idx, mode, shown), true), playing ? 450 : 0);
    return () => window.clearTimeout(t);
  }, [idx, mode, shown, playing]);

  const keyOf = useCallback((y: number) => (idx ? `${familyOf(idx, mode, y)}_${y}` : ''), [idx, mode]);
  const have = useCallback((y: number) => frames.current.has(keyOf(y)), [keyOf]);
  const inCount = idx ? years.filter((y) => have(y)).length : 0;

  // The frame on show: the year's cells painted in the site's colours; the last frame stays until the next is read.
  const lut = useMemo(() => yearLut().fire, []);
  const last = useRef<{ key: string; fire: HTMLCanvasElement; loaded: HTMLCanvasElement } | null>(null);
  const frame = useMemo(() => {
    if (!flat) return null;
    if (shown === null) return last.current;
    // A year's frame is painted again when its full layer takes the twin's place.
    const k = keyOf(shown) + (liteKeys.current.has(keyOf(shown)) ? ':lite' : '');
    if (last.current?.key === k) return last.current;
    const ix = frames.current.get(keyOf(shown));
    if (!ix) return last.current;
    last.current = { key: k, ...paintYear(ix, lut) };
    return last.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, keyOf, ready, lut, flat]);
  // The globe takes the year's cells as they are; the last year's stay until the next is read.
  const lastIx = useRef<Uint8Array | null>(null);
  const ix = useMemo(() => {
    const v = shown === null ? null : frames.current.get(keyOf(shown));
    if (v) lastIx.current = v;
    return lastIx.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, keyOf, ready]);
  const grid = useMemo<GridLayer[]>(
    () => (frame ? [{ key: `loaded-${frame.key}`, image: frame.loaded, onLand: true, crispFromPx: 2 }, { key: frame.key, image: frame.fire, halo: true }] : []),
    [frame],
  );

  // Playing: one year a beat, waiting for a year still being read; it stops at the last year of the pass.
  const lastOfPass = until !== undefined && years.includes(until) ? until : years[years.length - 1];
  const firstOfPass = startYear !== undefined && years.includes(startYear) ? startYear : years[0];
  const short = until !== undefined && years.indexOf(lastOfPass) - years.indexOf(firstOfPass) <= 4;
  // How long a pass takes to reach its last year: the film's globe turns over that time and rests there.
  const passMs = years.slice(years.indexOf(firstOfPass), years.indexOf(lastOfPass)).reduce((a, y) => a + (short ? shortBeat(y) : beat(y)), 0);
  useEffect(() => {
    if (!playing || shown === null || !years.length) return;
    const at = years.indexOf(shown);
    if (at >= years.indexOf(lastOfPass) || at >= years.length - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(function tick() {
      if (!have(years[at + 1])) {
        window.setTimeout(tick, 40);
        return;
      }
      setYear(years[at + 1]);
    }, short ? shortBeat(shown) : beat(shown));
    return () => window.clearTimeout(t);
  }, [playing, shown, years, have, ready, lastOfPass, short]);

  // In the film presentation (or when asked) it plays once by itself as soon as every year of the record is in.
  const played = useRef(false);
  // A short pass (the film's 2010 to 2012) starts as soon as its own years are in; a whole pass when every year is.
  const passIn = years.length > 0 && years.slice(years.indexOf(firstOfPass), years.indexOf(lastOfPass) + 1).every((y) => have(y));
  useEffect(() => {
    if (played.current || !idx || !(short ? passIn : inCount >= years.length) || !(autoplay ?? isFilm())) return;
    played.current = true;
    setYear(firstOfPass);
    setPlaying(true);
  }, [idx, inCount, years, autoplay, firstOfPass, short, passIn]);

  // On the globe the years play by themselves, round and round, resting on the last year; the visitor's own step, play
  // or click on a year takes over.
  const [looping, setLooping] = useState(loop);
  const loopOn = looping && !flat && !isFilm();
  useEffect(() => {
    if (!loopOn || playing || !idx || inCount < years.length || shown === null) return;
    const atEnd = shown === years[years.length - 1];
    const t = window.setTimeout(() => {
      setYear(years[0]);
      setPlaying(true);
    }, atEnd ? 2600 : 600);
    return () => window.clearTimeout(t);
  }, [loopOn, playing, idx, inCount, years, shown]);

  const play = useCallback(() => {
    if (!years.length) return;
    setLooping(false);
    setPlaying((p) => {
      if (p) return false;
      if (shown === lastOfPass || shown === years[years.length - 1]) setYear(firstOfPass);
      return true;
    });
  }, [years, shown, lastOfPass, firstOfPass]);
  const step = useCallback(
    (d: number) => {
      if (shown === null) return;
      const at = years.indexOf(shown);
      const to = years[Math.min(Math.max(at + d, 0), years.length - 1)];
      setLooping(false);
      setPlaying(false);
      setYear(to);
    },
    [years, shown],
  );
  const flip = useCallback(() => harmonizedReady && setMode((m) => (m === 'detected' ? 'harmonized' : 'detected')), [harmonizedReady]);

  // The script's keys for the years (EARTH-YEARS.md): Enter and Space play, Y switches the view, the arrows step.
  // Heard before any screen under the years (keys.ts).
  useWorldKeys((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === ' ' || e.key === 'Enter') play();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'y' || e.key === 'Y') flip();
    else if (e.key === 'Escape' && chosen) setChosen(null);
    else return false;
    return true;
  });
  if (control) control.current = { play, flip };
  const ratioRange = useMemo(() => {
    if (!idx) return [null, null] as const;
    const r = idx.years
      .filter((y) => !y.partial && idx.layers[`viirs_${y.year}`] && idx.layers[`modis_${y.year}`])
      .map((y) => idx.layers[`viirs_${y.year}`].rows / idx.layers[`modis_${y.year}`].rows);
    return r.length ? ([Math.min(...r), Math.max(...r)] as const) : ([null, null] as const);
  }, [idx]);
  useEffect(() => {
    if (!idx || shown === null) return;
    onState?.({
      year: shown,
      mode,
      playing,
      first: idx.years[0].year,
      last: idx.years[idx.years.length - 1].year,
      ratio: sharpRatio(idx),
      ratioLow: ratioRange[0],
      ratioHigh: ratioRange[1],
      oneScaleReady: harmonizedReady,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, shown, mode, playing, harmonizedReady, ratioRange]);

  // The strip of totals is measured so the Earth fits above it. A country's strip may wrap its keys another way; the
  // Earth keeps its place for a strip no taller, and is fitted again when the screen itself changes size.
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [stripH, setStripH] = useState(0);
  const [stripW, setStripW] = useState(0);
  const [stripTop, setStripTop] = useState(0);
  const picked = useRef(false);
  picked.current = chosenYears !== null || noFile !== null;
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const box = el.parentElement!;
    let boxH = -1;
    const measure = () => {
      const h = Math.round(box.clientHeight - el.offsetTop + 12);
      // Picked, the Earth makes room for a taller strip but does not move for a shorter one.
      if (picked.current && box.clientHeight === boxH) setStripH((o) => Math.max(o, h));
      else setStripH(h);
      boxH = box.clientHeight;
      setStripW(el.clientWidth);
      setStripTop(Math.round(el.getBoundingClientRect().top));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(box);
    return () => ro.disconnect();
  }, [idx]);

  if (read.state === 'failed') return <div className="world-years"><p className="world-years__state">{Y.failed}</p></div>;
  if (!idx || shown === null) return <div className="world-years"><p className="world-years__state">{Y.loading}</p></div>;

  const info = idx.years.find((y) => y.year === shown)!;
  // The strip is the whole Earth's, or the chosen country's.
  const totals = chosenYears ? countryTotals(idx, chosenYears) : totalsOf(idx);
  const series = chosenYears ? seriesOfCountry(idx, chosenYears) : seriesFromCube(idx);
  // The frame stays on the Earth: a country running under the strip is framed down to the strip's edge (the prompt
  // pads its frame by 24 px, so the box stops 36 px above the strip), and one wholly under the strip is not framed.
  const sceneBox: ScreenBox | null = (() => {
    if (!countryBox) return null;
    const floor = stripTop > 0 ? stripTop - 36 : Infinity;
    const b = { ...countryBox, bottom: Math.min(countryBox.bottom, floor) };
    return b.bottom - b.top < 8 ? null : b;
  })();
  const ratio = chosenYears ? countryRatio(idx, chosenYears) : sharpRatio(idx);
  const inside = chosenYears && countries ? drawnInside(countries, chosenYears.key) : [];
  const n = totals.length;
  const vmax = idx.scales.suomi_npp?.vmax ?? idx.scales[idx.families[familyOf(idx, mode, shown)]?.scale ?? 'suomi_npp']?.vmax ?? 1;
  const meta = layerOf(idx, mode, shown);
  const what = mode === 'harmonized' ? Y.onScale : shown >= SHARP_FROM ? Y.sharp : Y.modis;
  const note = info.partial
    ? Y.partialYear(info.months)
    : (info.platform_months.Aqua ?? 0) === 0 && shown < SHARP_FROM
      ? Y.terraAlone
      : (info.platform_months.Aqua ?? 0) < 12 && shown < SHARP_FROM
        ? Y.aquaJoins
        : null;
  const ticks = [1, 10, 100, 1000, 10000].filter((v) => v <= vmax).map((v) => ({ key: v, t: tOfValue(v, vmax), label: v.toLocaleString('en-US') }));
  const sharpAt = totals.findIndex((t) => t.sharp);

  return (
    <div className="world-years" data-mode={mode} data-pointing={pick && countries !== null && pointed !== null ? 'true' : 'false'} data-country={chosenYears ? chosenYears.key : noFile ? 'none' : undefined}>
      {!flat && (
        <Globe
          label={Y.label}
          ix={ix}
          lut={lut}
          padTop={16}
          padBottom={stripH}
          padLeft={pick ? 0 : Math.round(stripW * 0.4)}
          film={pick ? null : { playing, passMs }}
          fly={flyTo}
          outlines={globeOutlines}
          onBox={setCountryBox}
          onPoint={pick ? onGlobePoint : undefined}
          onPick={pick ? onGlobePick : undefined}
          onSlow={() => setFlat(true)}
          pins={pins}
          onPin={setPinned}
          onPinPick={onPlace}
          className="world-years__earth"
        />
      )}
      {/* The pointed country framed in the scene (the plan's in-scene look): the ux lane's ScenePrompt on its screen
          box, the action beside the frame and one live readout under it, what the frame is on. A click on the globe
          and the frame's Enter do the same. */}
      {/* A place being descended into: its box framed with its name and where it is; no action, the page lands there. */}
      {!flat && descent && countryBox && <ScenePrompt box={countryBox} label={descent.name} readout={descent.readout} invite />}
      {/* A place's square under the pointer: framed, with its name and where it is; a click opens the place. */}
      {!flat && !descent && pick && pointedPlace && pinned && (
        <ScenePrompt
          box={pinned.box}
          label={Y.placeAction}
          readout={`${pointedPlace.name}  ${formatCoord(boxMiddle(pointedPlace.box).lat, boxMiddle(pointedPlace.box).lon) ?? ''}`}
          onSelect={onPlace ? () => onPlace(pointedPlace.id) : undefined}
        />
      )}
      {!flat && !descent && pick && !pointedPlace && pointed && sceneBox && under && (
        <ScenePrompt
          box={sceneBox}
          label={chosen?.key === pointed.shape.key ? Y.wholeEarth : Y.countryAction}
          readout={countryReadout(pointed.shape, under, shown, mode, countries)}
          onSelect={() => (chosen?.key === pointed.shape.key ? setChosen(null) : countries && setChosen(pointed.shape))}
        />
      )}
      {flat && (
      <WorldCanvas
        label={Y.label}
        layers={grid}
        hatchLand
        focus={focus}
        padBottom={stripH}
        className="world-years__earth"
        onHover={pick ? onHover : undefined}
        onClickMap={pick ? onClickMap : undefined}
      >
        {pick
          ? (p) => (
              <>
                <svg className="world-countries" width={p.w} height={p.h} aria-hidden="true">
                  {chosen && <path className="world-country world-country--chosen" d={outline(chosen, p)} />}
                  {pointed && pointed.shape.key !== chosen?.key && <path className="world-country" d={outline(pointed.shape, p)} />}
                </svg>
                {pointed && (
                  <div className="world-country-name" style={{ left: pointed.x + 14, top: pointed.y - 26 }} aria-hidden="true">
                    {pointed.shape.name}
                    {!hasFile(pointed.shape) && <span className="world-country-name__more">{`: ${Y.noFile}`}</span>}
                  </div>
                )}
              </>
            )
          : undefined}
      </WorldCanvas>
      )}
      {/* The ground under the strip and the guide: the Earth's far south stays out of the shot. */}
      <div className="world-years__floor" style={{ height: stripH }} aria-hidden="true" />
      {caption && (
        <div className="world-years__caption" aria-live="polite">
          <div className="world-years__year">{shown}</div>
          <div className="world-years__what" data-caption={captionLine ? 'true' : 'false'}>{captionLine ?? what}</div>
          {note && <div className="world-years__note">{note}</div>}
        </div>
      )}
      {/* The screen's own controls stand alone (the harness); hosted, the guide's actions and the keys do their work. */}
      {ownPlay && (
      <div className="world-years__controls" data-world-ui>
        {(
          <button type="button" className="world-act" onClick={play}>
            <kbd>Space</kbd>
            <span>{playing ? Y.pause : Y.play}</span>
          </button>
        )}
        <button type="button" className="world-act" onClick={() => step(-1)} aria-label="The year before">
          <kbd>&larr;</kbd>
        </button>
        <button type="button" className="world-act" onClick={() => step(1)} aria-label="The year after">
          <kbd>&rarr;</kbd>
          <span>{Y.step}</span>
        </button>
        <div className="world-years__switch iso-choice" role="radiogroup">
          <button type="button" role="radio" aria-checked={mode === 'detected'} className="iso-choice__opt" data-active={mode === 'detected'} onClick={() => setMode('detected')}>
            {Y.detected}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'harmonized'}
            className="iso-choice__opt"
            data-active={mode === 'harmonized'}
            disabled={!harmonizedReady}
            onClick={() => setMode('harmonized')}
          >
            {harmonizedReady ? Y.harmonized : Y.harmonizedMissing}
            <kbd className="world-legend__key">Y</kbd>
          </button>
        </div>
      </div>
      )}
      <div className="world-legend world-years__legend" data-world-ui style={{ bottom: stripH + 4 }}>
        <div className="world-legend__line">{Y.legend}</div>
        <div className="world-ramp" style={{ background: ramp(FIRE_RAMP) }} />
        <Ticks ticks={ticks} />
        {shown === 2021 && (meta?.closed_cells ?? 0) > 0 && (
          <div className="world-legend__fine">
            <span className="world-swatch world-swatch--closed" aria-hidden="true" />
            <span>{Y.closed}</span>
          </div>
        )}
        {(meta?.clipped_cells ?? 0) > 0 && <div className="world-legend__fine">{Y.clipped(meta!.clipped_cells!)}</div>}
        <div className="world-legend__fine">
          <span className="world-swatch world-swatch--hatch" aria-hidden="true" />
          <span>
            {Y.hatch} <span className="world-legend__more">{EARTH_WORDS.halo}</span>
          </span>
        </div>
        {inCount < years.length && <div className="world-legend__fine">{`${Y.loading}: ${inCount} of ${years.length}`}</div>}
      </div>
      <div className="world-years__strip" ref={stripRef} data-world-ui>
        <div className="world-years__strip-head" data-step={stepLabel ? 'on' : 'off'} style={{ ['--at' as string]: String(Math.max(sharpAt, 0) / n) }}>
          <div className="world-years__strip-keys">
            <span className="world-years__strip-title">{chosenYears ? Y.countryTotals(chosenYears.name) : noFile ? noFile.name : Y.totals}</span>
            {(chosenYears || noFile) && (
              <button type="button" className="world-act world-act--quiet world-years__back" onClick={() => setChosen(null)}>
                <kbd>Esc</kbd>
                <span>{Y.wholeEarth}</span>
              </button>
            )}
            {pick && countries && !chosen && <span className="world-years__hint">{Y.pickCountry}</span>}
            {inside.length > 0 && (
              <span className="world-years__hint" title={Y.drawnInsideAll(inside)}>
                {Y.drawnInside(inside.length)}
              </span>
            )}
          </div>
          {/* The label on the 2012 bar: its room is always kept, so the Earth does not move when it is said. */}
          {stepLabel && (
            <div className="world-years__step" data-on={shown >= SHARP_FROM && sharpAt >= 0 && !noFile} aria-hidden={shown < SHARP_FROM || noFile !== null}>
              {mode === 'harmonized' ? Y.stepHarmonized : Y.stepDetected(ratio)}
            </div>
          )}
        </div>
        {/* The dataviz lane's years (its MOUNT.md): orange where MODIS counted, light blue from VIIRS's first year, the
            estimate as a white outline on one scale; while the years play, drawn up to the year on show. A click on a
            year shows it. */}
        <div className="world-years__chart">
          {noFile ? (
            <p className="world-years__nofile">{Y.noFileStrip(noFile.name, noFile.holder)}</p>
          ) : (
            series && (
              <>
                <YearBars
                  series={series}
                  width={Math.max(240, stripW - 48)}
                  // YearBars keeps its top 90 px for its pointed year's readout; its bars stand under that.
                  height={isFilm() ? 200 : 224}
                  upTo={playing ? shown : null}
                  current={shown}
                  oneScale={mode === 'harmonized'}
                />
                <div className="world-years__hits">
                  {totals.map((t) => (
                    <button
                      key={t.year}
                      type="button"
                      className="world-years__hit"
                      data-current={t.year === shown}
                      onClick={() => {
                        setLooping(false);
                        setPlaying(false);
                        setYear(t.year);
                      }}
                      aria-label={`${t.year}: ${t.detected === null ? 'no layer' : millions(t.detected)} as the satellites counted${t.harmonized === null ? '' : `, ${millions(t.harmonized)} on one scale`}`}
                    />
                  ))}
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
