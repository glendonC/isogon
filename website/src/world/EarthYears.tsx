import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { tOfValue, valueOfT } from './cells';
import { countryShapeAt, type CountryShape } from './countryAt';
import { Globe, globeWanted } from './Globe';
import { CountTo } from './CountTo';
import { useYearCells } from './yearCells';
import { countryOf, countryRatio, countryTotals, drawnInside, gridLines, heldBy, type CountriesFile } from './countryYears';
import { FIRE_RAMP } from './layers';
import { useWorldKeys } from './keys';
import { useRead } from './read';
import { Ticks } from './Ticks';
import { WorldCanvas, type GridLayer } from './WorldCanvas';
import type { Box, Projector } from './projection';
import { EARTH_WORDS, gridWords, millions, roughly, wholeMillions, YEAR_WORDS as Y } from './words';
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

/** The years named under the strip: the one on show first, then 2012, the ends and every fifth, none closer than 44 px. */
function axisYears(years: number[], shown: number, width: number): number[] {
  if (!years.length) return [];
  const px = (y: number) => ((years.indexOf(y) + 0.5) / years.length) * width;
  const want = [shown, SHARP_FROM, years[0], years[years.length - 1], ...years.filter((y) => y % 5 === 0)];
  const kept: number[] = [];
  for (const y of want) {
    if (!years.includes(y) || kept.includes(y)) continue;
    if (kept.every((k) => Math.abs(px(k) - px(y)) >= 44)) kept.push(y);
  }
  return kept;
}

const isFilm = () => typeof document !== 'undefined' && document.documentElement.classList.contains('iso-film');

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

/** What the square under the pointer holds: its exact count from the year's cells where read, else its band. */
type Square = { kind: 'exact' | 'oneScale' | 'about'; v: number } | { kind: 'none' } | { kind: 'closed' } | null;
function squareOf(ix: Uint8Array | null, cells: Float32Array | null, oneScale: boolean, lon: number, lat: number, vmax: number): Square {
  const col = Math.min(Math.floor((lon + 180) / 0.25), 1439);
  const row = Math.min(Math.floor((90 - lat) / 0.25), 719);
  const k = ix ? ix[row * 1440 + col] : null;
  if (k === 2) return { kind: 'closed' };
  if (cells && cells.length === 1440 * 720) {
    const v = cells[row * 1440 + col];
    if (!Number.isFinite(v) || v <= 0) return { kind: 'none' };
    return { kind: oneScale ? 'oneScale' : 'exact', v };
  }
  if (k === null) return null;
  if (k < 3) return { kind: 'none' };
  return { kind: 'about', v: valueOfT((k - 3 + 0.5) / 253, vmax) };
}

/** The square's count in words, its figure counting to its value. */
function SquareCount({ sq, year }: { sq: Square; year: number }) {
  if (!sq) return null;
  if (sq.kind === 'none') return <div className="world-pointer__count">{Y.squareNone(year)}</div>;
  if (sq.kind === 'closed') return <div className="world-pointer__count">{Y.squareClosed(year)}</div>;
  const whole = sq.kind === 'exact' ? Math.round(sq.v) : sq.v;
  const fmt = (v: number) => (sq.kind === 'oneScale' && whole < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US'));
  // The figure stands before the year in each sentence: cut at its first place, so a year with the same digits stays.
  const text = sq.kind === 'exact' ? Y.squareExact(whole, year) : sq.kind === 'oneScale' ? Y.squareOneScale(whole, year) : Y.squareAbout(whole, year);
  const fig = sq.kind === 'about' ? roughNumber(whole) : fmt(whole);
  const at = text.indexOf(fig);
  const before = at < 0 ? text : text.slice(0, at);
  const after = at < 0 ? '' : text.slice(at + fig.length);
  return (
    <div className="world-pointer__count">
      {before}
      {at >= 0 && <CountTo value={sq.kind === 'about' ? Number(fig.replace(/,/g, '')) : whole} ms={260} format={fmt} />}
      {after}
    </div>
  );
}

/** The figure the band's words give ("About 1,200 detections"). */
const roughNumber = (v: number) => (v < 1.5 ? '1' : roughly(v));

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
  const globeOutlines = useMemo(
    () => [
      ...(chosen ? [{ rings: chosen.rings, strong: true }] : []),
      ...(pointed && pointed.shape.key !== chosen?.key ? [{ rings: pointed.shape.rings, strong: false }] : []),
    ],
    [chosen, pointed],
  );
  // The globe flies to the chosen country and back out when none is chosen (one object a choice, so it flies once).
  const flyTo = useMemo(() => (chosen ? { rings: chosen.rings } : null), [chosen]);
  // On the globe the pointer says where it is and what the square holds, sea included.
  const [under, setUnder] = useState<{ lon: number; lat: number; x: number; y: number } | null>(null);
  const onGlobePoint = useCallback(
    (p: { lon: number; lat: number; x: number; y: number } | null) => {
      setUnder(p);
      onHover(p);
    },
    [onHover],
  );
  // The year's exact counts, read while the pointer is on the globe and the years are at rest.
  const shownMeta = idx && shown !== null ? layerOf(idx, mode, shown) : null;
  const cells = useYearCells(shownMeta, !flat && under !== null && !playing);
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
    // layers in the same order, each taking its twin's place as it comes in. The film reads the full layers only.
    const twins = isFilm() ? [] : order.flatMap((m) => {
      const t = liteOf(idx, m);
      return t ? [{ m, t }] : [];
    });
    const queue: Array<{ m: (typeof order)[number]; read: (typeof order)[number]; lite: boolean }> = [
      ...twins.map(({ m, t }) => ({ m, read: t, lite: true })),
      ...order.map((m) => ({ m, read: m, lite: false })),
    ];
    let i = 0;
    const next = async (): Promise<void> => {
      while (live && i < queue.length) {
        const q = queue[i++];
        const k = `${q.m.family}_${q.m.year}`;
        if (q.lite ? frames.current.has(k) : frames.current.has(k) && !liteKeys.current.has(k)) continue;
        try {
          const t0 = performance.now();
          const ix = await readIndices(q.read, idx.png.palette_rgb);
          // A full layer read while its twin was on its way stays: the twin never takes its place.
          if (q.lite && frames.current.has(k)) continue;
          frames.current.set(k, ix);
          if (q.lite) liteKeys.current.add(k);
          else liteKeys.current.delete(k);
          // Each year's load, measured where the page can read it (the fire cube's lane times them).
          performance.measure(`iso-year ${q.lite ? 'lite_' : ''}${k}`, { start: t0, end: performance.now() });
        } catch {
          // a year that cannot be read keeps the last frame on show
        }
        if (live) setReady((n) => n + 1);
      }
    };
    void Promise.all([next(), next(), next(), next()]);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, mode]);

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

  // The screen's size, so the pointer's readout stays on it.
  const [rootW, setRootW] = useState(1440);
  const [rootH, setRootH] = useState(900);
  // The strip of totals is measured so the Earth fits above it. A country's strip may wrap its keys another way; the
  // Earth keeps its place for a strip no taller, and is fitted again when the screen itself changes size.
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [stripH, setStripH] = useState(0);
  const [stripW, setStripW] = useState(0);
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
      setRootW(box.clientWidth);
      setRootH(box.clientHeight);
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
  const ratio = chosenYears ? countryRatio(idx, chosenYears) : sharpRatio(idx);
  const top = Math.max(...totals.flatMap((t) => [t.detected ?? 0, t.harmonized ?? 0])) * 1.08 || 1;
  const grids = noFile ? [] : chosenYears ? gridLines(top).map((v) => ({ v, label: gridWords(v) })) : [10e6, 20e6].filter((v) => v < top).map((v) => ({ v, label: wholeMillions(v) }));
  const inside = chosenYears && countries ? drawnInside(countries, chosenYears.key) : [];
  const n = totals.length;
  const slot = (i: number) => ((i + 0.5) / n) * 100;
  const at = years.indexOf(shown);
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
  // The line joins whole years only: a partial year (2000 holds two months) is a hollow mark of its own.
  const line = totals
    .map((t, i) => (t.harmonized === null || t.partial ? null : `${(i + 0.5) / n},${1 - t.harmonized / top}`))
    .filter(Boolean)
    .join(' ');
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
          onPoint={pick ? onGlobePoint : undefined}
          onPick={pick ? onGlobePick : undefined}
          onSlow={() => setFlat(true)}
          className="world-years__earth"
        />
      )}
      {/* The pointed spot (the design language's readout): the cross hairs on the globe (Globe draws them), and beside
          the pointer, in mono, the coordinates, the country and what the square holds in the year on show, its count
          counting to its value. The box draws on by its outline when the pointer comes onto the globe. */}
      {!flat && pick && under && (
        <div
          className="world-pointer world-drawn"
          style={{
            left: under.x > rootW - 380 ? under.x - 22 : under.x + 22,
            top: under.y > rootH - stripH - 150 ? under.y - 22 : under.y + 22,
            transform: `translate(${under.x > rootW - 380 ? '-100%' : '0'}, ${under.y > rootH - stripH - 150 ? '-100%' : '0'})`,
          }}
          aria-hidden="true"
        >
          <div className="world-pointer__coords">{degreeWords(under.lon, under.lat)}</div>
          <div className="world-pointer__place">
            {pointed ? pointed.shape.name : Y.atSea}
            {pointed && !hasFile(pointed.shape) && <span className="world-pointer__more">{`: ${Y.noFile}`}</span>}
          </div>
          <SquareCount sq={squareOf(ix, cells, mode === 'harmonized', under.lon, under.lat, vmax)} year={shown} />
        </div>
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
      <div className="world-years__controls" data-world-ui>
        {ownPlay && (
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
            {!noFile && <span className="world-years__key world-years__key--modis">{Y.barsModis}</span>}
            {!noFile && <span className="world-years__key world-years__key--sharp">{Y.barsSharp}</span>}
            {line && !noFile && <span className="world-years__key world-years__key--line">{Y.lineHarmonized}</span>}
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
        <div className="world-years__plot">
          {noFile && <p className="world-years__nofile">{Y.noFileStrip(noFile.name, noFile.holder)}</p>}
          {grids.map(({ v, label }) => (
            <div key={v} className="world-years__grid" style={{ bottom: `${(v / top) * 100}%` }}>
              <span>{label}</span>
            </div>
          ))}
          {!noFile && totals.map((t, i) => (
            <button
              key={t.year}
              type="button"
              className="world-years__bar"
              data-sharp={t.sharp}
              data-partial={t.partial}
              data-current={t.year === shown}
              style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}
              onClick={() => {
                setLooping(false);
                setPlaying(false);
                setYear(t.year);
              }}
              aria-label={`${t.year}: ${t.detected === null ? 'no layer' : millions(t.detected)} as the satellites counted${t.harmonized === null ? '' : `, ${millions(t.harmonized)} on one scale`}`}
            >
              <span className="world-years__fill" style={{ height: `${((t.detected ?? 0) / top) * 100}%` }} />
            </button>
          ))}
          {line && !noFile && (
            <svg className="world-years__line" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={line} vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {!noFile && totals.map((t, i) =>
            t.harmonized !== null && (t.partial || i === at) ? (
              <span
                key={`dot-${t.year}`}
                className="world-years__dot"
                data-partial={t.partial}
                data-current={i === at}
                style={{ left: `${slot(i)}%`, bottom: `${(t.harmonized / top) * 100}%` }}
              />
            ) : null,
          )}
        </div>
        <div className="world-years__axis">
          {axisYears(years, shown, stripW).map((y) => (
            <span key={y} data-current={y === shown} style={{ left: `${slot(years.indexOf(y))}%` }}>
              {y}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
