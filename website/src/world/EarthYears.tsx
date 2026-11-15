import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { tOfValue } from './cells';
import { FIRE_RAMP } from './layers';
import { useWorldKeys } from './keys';
import { useRead } from './read';
import { Ticks } from './Ticks';
import { WorldCanvas, type GridLayer } from './WorldCanvas';
import type { Box } from './projection';
import { EARTH_WORDS, millions, YEAR_WORDS as Y } from './words';
import {
  familyOf,
  layerOf,
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

const ramp = (stops: Array<[number, [number, number, number]]>) =>
  `linear-gradient(to right, ${stops.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ')})`;

/**
 * The Earth plays the years 2000 to 2025, one frame a year from the fire cube's yearly layers. As detected, the
 * coarse instrument to 2011 and the sharper one from 2012 on one scale, so the Earth brightens in 2012 with no more
 * fire; the harmonized record holds one scale through every year. Under it, the world's total of each year: as
 * detected as bars, the harmonized record as a line, the year on show marked. Enter and Space play and stop, the
 * arrows step a year, Y switches the view (the script's keys).
 */
export function EarthYears({
  source = '/api/cube/years',
  mode: startMode = 'detected',
  year: startYear,
  autoplay,
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
    let i = 0;
    const next = async (): Promise<void> => {
      while (live && i < order.length) {
        const m = order[i++];
        const k = `${m.family}_${m.year}`;
        if (frames.current.has(k)) continue;
        try {
          frames.current.set(k, await readIndices(m, idx.png.palette_rgb));
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
    if (shown === null) return last.current;
    const k = keyOf(shown);
    if (last.current?.key === k) return last.current;
    const ix = frames.current.get(k);
    if (!ix) return last.current;
    last.current = { key: k, ...paintYear(ix, lut) };
    return last.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, keyOf, ready, lut]);
  const grid = useMemo<GridLayer[]>(
    () => (frame ? [{ key: `loaded-${frame.key}`, image: frame.loaded, onLand: true, crispFromPx: 2 }, { key: frame.key, image: frame.fire, halo: true }] : []),
    [frame],
  );

  // Playing: one year a beat, waiting for a year still being read; it stops at the last year of the pass.
  const lastOfPass = until !== undefined && years.includes(until) ? until : years[years.length - 1];
  const firstOfPass = startYear !== undefined && years.includes(startYear) ? startYear : years[0];
  const short = until !== undefined && years.indexOf(lastOfPass) - years.indexOf(firstOfPass) <= 4;
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

  const play = useCallback(() => {
    if (!years.length) return;
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

  // The strip of totals is measured so the Earth fits above it.
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [stripH, setStripH] = useState(0);
  const [stripW, setStripW] = useState(0);
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const box = el.parentElement!;
    const measure = () => {
      setStripH(Math.round(box.clientHeight - el.offsetTop + 12));
      setStripW(el.clientWidth);
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
  const totals = totalsOf(idx);
  const ratio = sharpRatio(idx);
  const top = Math.max(...totals.flatMap((t) => [t.detected ?? 0, t.harmonized ?? 0])) * 1.08 || 1;
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
    <div className="world-years" data-mode={mode}>
      <WorldCanvas label={Y.label} layers={grid} hatchLand focus={focus} padBottom={stripH} className="world-years__earth" />
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
            <span className="world-years__strip-title">{Y.totals}</span>
            <span className="world-years__key world-years__key--modis">{Y.barsModis}</span>
            <span className="world-years__key world-years__key--sharp">{Y.barsSharp}</span>
            {line && <span className="world-years__key world-years__key--line">{Y.lineHarmonized}</span>}
          </div>
          {/* The label on the 2012 bar: its room is always kept, so the Earth does not move when it is said. */}
          {stepLabel && (
            <div className="world-years__step" data-on={shown >= SHARP_FROM && sharpAt >= 0} aria-hidden={shown < SHARP_FROM}>
              {mode === 'harmonized' ? Y.stepHarmonized : Y.stepDetected(ratio)}
            </div>
          )}
        </div>
        <div className="world-years__plot">
          {[10e6, 20e6].filter((v) => v < top).map((v) => (
            <div key={v} className="world-years__grid" style={{ bottom: `${(v / top) * 100}%` }}>
              <span>{millions(v)}</span>
            </div>
          ))}
          {totals.map((t, i) => (
            <button
              key={t.year}
              type="button"
              className="world-years__bar"
              data-sharp={t.sharp}
              data-partial={t.partial}
              data-current={t.year === shown}
              style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}
              onClick={() => {
                setPlaying(false);
                setYear(t.year);
              }}
              aria-label={`${t.year}: ${t.detected === null ? 'no layer' : millions(t.detected)} as the satellites counted${t.harmonized === null ? '' : `, ${millions(t.harmonized)} on one scale`}`}
            >
              <span className="world-years__fill" style={{ height: `${((t.detected ?? 0) / top) * 100}%` }} />
            </button>
          ))}
          {line && (
            <svg className="world-years__line" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={line} vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {totals.map((t, i) =>
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
