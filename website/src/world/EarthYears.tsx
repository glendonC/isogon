import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { tOfValue } from './cells';
import { FIRE_RAMP } from './layers';
import { useRead } from './read';
import { Ticks } from './Ticks';
import { WorldCanvas, type GridLayer } from './WorldCanvas';
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
}

// A pass through the years lasts about six seconds: the coarse years quickly, 2012 long enough to read its sentence.
const beat = (year: number) => (year < SHARP_FROM ? 170 : year === SHARP_FROM ? 1500 : 190);

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
export function EarthYears({ source = '/api/cube/years', mode: startMode = 'detected', year: startYear, autoplay, caption = true, onYear }: EarthYearsProps) {
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
    const order = shown === null ? want : [...want].sort((a, b) => Math.abs(a.year - shown) - Math.abs(b.year - shown));
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

  // Playing: one year a beat, waiting for a year still being read; it stops at the last year.
  useEffect(() => {
    if (!playing || shown === null || !years.length) return;
    const at = years.indexOf(shown);
    if (at >= years.length - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(function tick() {
      if (!have(years[at + 1])) {
        window.setTimeout(tick, 40);
        return;
      }
      setYear(years[at + 1]);
    }, beat(shown));
    return () => window.clearTimeout(t);
  }, [playing, shown, years, have, ready]);

  // In the film presentation (or when asked) it plays once by itself as soon as every year of the record is in.
  const played = useRef(false);
  useEffect(() => {
    if (played.current || !idx || inCount < years.length || !(autoplay ?? isFilm())) return;
    played.current = true;
    setYear(years[0]);
    setPlaying(true);
  }, [idx, inCount, years, autoplay]);

  const play = useCallback(() => {
    if (!years.length) return;
    setPlaying((p) => {
      if (p) return false;
      if (shown === years[years.length - 1]) setYear(years[0]);
      return true;
    });
  }, [years, shown]);
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

  // Taken in the capture phase, so these keys reach the years before a screen that mounts them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // The script's keys for the years (EARTH-YEARS.md): Enter and Space play, Y switches the view, the arrows step.
      if (e.key === ' ' || e.key === 'Enter') play();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'y' || e.key === 'Y') flip();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [play, step, flip]);

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
      <WorldCanvas label={Y.label} layers={grid} hatchLand padBottom={stripH} className="world-years__earth" />
      {caption && (
        <div className="world-years__caption" aria-live="polite">
          <div className="world-years__year">{shown}</div>
          <div className="world-years__what">{what}</div>
          {note && <div className="world-years__note">{note}</div>}
        </div>
      )}
      <div className="world-years__controls" data-world-ui>
        <button type="button" className="world-act" onClick={play}>
          <kbd>Space</kbd>
          <span>{playing ? Y.pause : Y.play}</span>
        </button>
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
        {shown >= SHARP_FROM && sharpAt >= 0 && (
          <div className="world-years__step" style={{ ['--at' as string]: String(sharpAt / n) }}>
            <span>{mode === 'harmonized' ? Y.stepHarmonized : Y.stepDetected(ratio)}</span>
          </div>
        )}
        <div className="world-years__strip-head">
          <span className="world-years__strip-title">{Y.totals}</span>
          <span className="world-years__key world-years__key--modis">{Y.barsModis}</span>
          <span className="world-years__key world-years__key--sharp">{Y.barsSharp}</span>
          {line && <span className="world-years__key world-years__key--line">{Y.lineHarmonized}</span>}
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
