import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LIPARI_32 } from '../../lib/colormaps';
import { NOT_RECORDED_LINE, NotRecorded } from '../../lib/api';
import {
  fetchCurrent,
  fetchRecord,
  logClass,
  monthWords,
  MONTH_NAMES,
  NotLoaded,
  rampBounds,
  type BoxGrid,
  type CurrentMonth,
  type FireRecord,
  type RecordMonth,
  type RecordPlace,
} from './record';
import { boxWords } from './placeWords';
import { publishRecordView, RECORD_CLOSED, type RecordMonthView } from './recordView';
import { gridLine, monthLine, notLoadedLine, RECORD_WORDS as W } from './recordWords';
import '../../styles/calendar-screen.css';

/**
 * Eight steps of an accessible sequential ramp, from a dark blue that recedes into the night to the brightest cream.
 * It starts low in the ramp so that the many quiet months stay dim and the few worst ones are what the eye finds.
 */
const STEPS = 8;
const RAMP = Array.from({ length: STEPS }, (_, i) => LIPARI_32[Math.round(3 + (i * (31 - 3)) / (STEPS - 1))]);

/** The bands around the grid, in pixels: month names, the label over a month, the years, who was flying, the foot. */
const NAMES_W = 40;
const HEAD_H = 84;
const AXIS_H = 24;
const SPANS_H = 56;
/** The least room kept for the foot; it keeps the room it is measured to take, which wraps on a narrow grid. */
const FOOT_H = 66;
const LABEL_W = 320;

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 1100, h: 640 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const ymOf = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

/** Four corner marks round a square: the mark of the thing under examination. */
function brackets(x: number, y: number, s: number, out: number, arm: number): string {
  const l = x - out;
  const t = y - out;
  const r = x + s + out;
  const b = y + s + out;
  return (
    `M${l},${t + arm}V${t}H${l + arm}` +
    `M${r - arm},${t}H${r}V${t + arm}` +
    `M${r},${b - arm}V${b}H${r - arm}` +
    `M${l + arm},${b}H${l}V${b - arm}`
  );
}

export interface TheRecordProps {
  place: RecordPlace;
  /** The month of the fire the stage holds or opens on. It is marked in the grid and one action shows it. */
  markedMonth: string | null;
  /** Whether a month of the record holds a fire the stage can show. */
  canOpen: (ym: string, rec: FireRecord) => boolean;
  onOpenMonth: (ym: string, rec: FireRecord) => void;
  /** Back to the stage as it is; null when there is nothing to go back to. */
  onClose: (() => void) | null;
  /**
   * The guide speaks on this screen. The Record then leaves to the guide what the guide says and offers: the sentence
   * while the record loads or fails, the sentence on how well the correction holds, the action that closes the
   * Record, and Enter with the prompt that shows a fire beside a month (a click on a month with a fire still shows
   * it). Its labels on things and its legend stay. Escape still closes it, and the arrows still move.
   */
  guideSpeaks?: boolean;
}

/**
 * The Record: every fire detected around a place since 2000, opened over the stage. One square a month, years across
 * and months down, brighter for more fire, every year on the sharp satellite's scale. The months that hold a fire the
 * stage can show stand in brackets; the one the stage holds carries its label and its one action. Under the years,
 * two lines say which satellite was flying; from there the visitor can see the years as counted, before the
 * correction, and how well the correction holds. What the step is, is the guide's to say: this component speaks only
 * as labels on its own things, and tells the guide what it holds through `recordView`.
 */
export function TheRecord({ place, markedMonth, canOpen, onOpenMonth, onClose, guideSpeaks = false }: TheRecordProps) {
  const [rec, setRec] = useState<FireRecord | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'not recorded' | 'not loaded'>('loading');
  const [failure, setFailure] = useState<string | null>(null);
  // A drawn area none of whose squares has a detection: its squares, which the Record says instead of a grid
  const [empty, setEmpty] = useState<BoxGrid | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [asCounted, setAsCounted] = useState(false);
  // Looking over the months: asked for, or the pointer or the arrow keys are on the grid.
  const [browsing, setBrowsing] = useState(false);
  // This month so far: asked for by the visitor, never on opening; and whether its label and its caveats are on show.
  const [now, setNow] = useState<{ state: 'idle' | 'loading' | 'failed' } | { state: 'answered'; month: CurrentMonth }>({ state: 'idle' });
  const [nowOn, setNowOn] = useState(false);
  const [rough, setRough] = useState(false);
  const [plotRef, size] = useSize<HTMLDivElement>();
  const rootRef = useRef<HTMLElement | null>(null);
  const placeKey = place.kind === 'region' ? place.regionId : `${place.box.join(',')}|${place.route ?? ''}`;

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setRec(null);
    setEmpty(null);
    setPicked(null);
    setHover(null);
    setAsCounted(false);
    setBrowsing(false);
    setNow({ state: 'idle' });
    setNowOn(false);
    setRough(false);
    fetchRecord(place, controller.signal)
      .then((r) => {
        if (controller.signal.aborted) return;
        setRec(r);
        setState(r ? 'ready' : 'failed');
        setFailure(r ? null : 'It came back in a shape the page cannot read.');
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (e instanceof NotLoaded) {
          setState('not loaded');
          setEmpty(e.grid);
          setFailure(null);
          return;
        }
        setState(e instanceof NotRecorded ? 'not recorded' : 'failed');
        setFailure(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, [placeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const marked = rec && markedMonth && rec.months.has(markedMonth) ? markedMonth : null;
  /** With no fire to mark (a drawn box), the label starts on the record's worst month, so a square says what it is. */
  const worst = useMemo(() => {
    let best: RecordMonth | null = null;
    rec?.months.forEach((m) => {
      if (m.value !== null && (best === null || m.value > (best.value ?? -1))) best = m;
    });
    return (best as RecordMonth | null)?.ym ?? null;
  }, [rec]);
  // Which months hold a fire to show is a fact of the record; the page's test for it may be a new function each render.
  const canOpenNow = useRef(canOpen);
  canOpenNow.current = canOpen;
  const openable = useMemo(() => new Set(rec ? [...rec.months.keys()].filter((ym) => canOpenNow.current(ym, rec)) : []), [rec]);
  const shown = picked ?? marked ?? worst;
  const focus = hover ?? shown;
  const looking = browsing || hover !== null || picked !== null;
  // This month so far, when the route counted it; else why it could not, in words
  const thisMonth = now.state === 'answered' && now.month.status === 'ready' && now.month.value !== null && /^\d{4}-\d{2}$/.test(now.month.month) ? now.month : null;
  const notNow =
    now.state === 'failed' ? W.notNow(W.whyNot.failed) : now.state === 'answered' && !thisMonth ? W.notNow(W.whyNot[now.month.status] ?? now.month.error ?? W.whyNot.failed) : null;

  // The latest of everything the keys and the published commands act on.
  const live = useRef({ rec, shown, picked, marked, asCounted, rough, openable, onOpenMonth, onClose, guideSpeaks });
  live.current = { rec, shown, picked, marked, asCounted, rough, openable, onOpenMonth, onClose, guideSpeaks };

  const show = (ym?: string | null) => {
    const l = live.current;
    const target = ym ?? l.picked ?? l.marked;
    if (target && l.rec && l.openable.has(target)) l.onOpenMonth(target, l.rec);
  };
  const pick = (ym: string | null) => {
    const l = live.current;
    setNowOn(false);
    setRough(false);
    setPicked(ym && l.rec?.months.has(ym) && ym !== l.marked ? ym : null);
  };
  const askNow = () => {
    const route = live.current.rec?.currentRoute;
    setNowOn(true);
    if (!route || now.state === 'loading' || now.state === 'answered') return;
    setNow({ state: 'loading' });
    fetchCurrent(route)
      .then((month) => setNow(month ? { state: 'answered', month } : { state: 'failed' }))
      .catch(() => setNow({ state: 'failed' }));
  };

  // What the guide reads: the marked month, the picked month, the correction's facts, and the three commands.
  useEffect(() => {
    const monthView = (ym: string | null): RecordMonthView | null => {
      const m = ym && rec ? rec.months.get(ym) : null;
      if (!m) return null;
      const end = m.month === 12 ? `${m.year + 1}-01-01` : `${ymOf(m.year, m.month + 1)}-01`;
      const where = place.kind === 'region' ? `region_id=${encodeURIComponent(place.regionId)}` : `box=${encodeURIComponent(place.box.join(','))}`;
      return {
        ym: m.ym,
        words: monthWords(m.ym),
        opens: openable.has(m.ym),
        rate: m.value,
        usual: m.median,
        timesUsual: m.timesUsual,
        rank: m.rank,
        rankOf: m.rankOf,
        csvPath: `/api/calendar/rows.csv?${where}&start=${m.ym}-01&end=${end}`,
      };
    };
    const grid = rec?.grid ?? empty;
    publishRecordView({
      state,
      failure,
      place: rec?.label ?? place.name,
      grid: grid ? { box: boxWords(grid.box), cells: grid.cells, loaded: grid.loaded, complete: grid.complete } : null,
      firstYear: rec?.firstYear ?? null,
      lastYear: rec?.lastYear ?? null,
      unit: rec?.unit ?? null,
      marked: monthView(marked),
      picked: monthView(picked),
      correction: {
        sharpFromYear: rec?.spans.sharp ? Number(rec.spans.sharp[0].slice(0, 4)) : null,
        ratio: rec?.sharpRatio ?? null,
        heldOut: rec?.heldOut?.harmonized ?? null,
        heldOutWithout: rec?.heldOut?.raw ?? null,
        asCounted,
      },
      now: {
        state: now.state === 'idle' || now.state === 'loading' ? now.state : thisMonth ? 'ready' : 'unavailable',
        ym: thisMonth?.month ?? null,
        words: thisMonth ? monthWords(thisMonth.month) : null,
        rate: thisMonth?.value ?? null,
        usual: thisMonth?.median ?? null,
        timesUsual: thisMonth?.timesUsual ?? null,
        daysCounted: thisMonth?.days?.counted ?? null,
        daysInMonth: thisMonth?.days?.inMonth ?? null,
        caveats: thisMonth?.caveats ?? [],
        why: notNow,
      },
      askNow,
      show,
      pick,
      browse: () => setBrowsing(true),
      showAsCounted: setAsCounted,
    });
  }, [state, failure, rec, empty, marked, picked, asCounted, openable, place.name, now]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => publishRecordView(RECORD_CLOSED), []);

  // The Record's keys, while the focus is on it or on nothing: arrows move over the months, Enter shows the fire of a
  // month in corner marks, Escape leaves the years as counted or closes back to the stage.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      const here = !t || t === document.body || Boolean(rootRef.current?.contains(t));
      if (!here || t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const l = live.current;
      const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (step[e.key]) {
        if (!l.rec || !l.shown) return;
        const year = Number(l.shown.slice(0, 4)) + step[e.key][0];
        const month = Number(l.shown.slice(5, 7)) + step[e.key][1];
        if (month >= 1 && month <= 12 && l.rec.months.has(ymOf(year, month))) {
          setHover(null);
          setBrowsing(true);
          pick(ymOf(year, month));
        }
      } else if (e.key === 'Enter') {
        // Where the guide speaks, Enter is its first action's key and the Record lets it through
        if (l.guideSpeaks || t?.closest('button, a')) return;
        // The fire of the month on show, or of the marked month when that one has none, as the guide's action does
        show(l.shown && l.openable.has(l.shown) ? l.shown : l.marked);
      } else if (e.key === 'Escape') {
        if (l.rough) setRough(false);
        else if (l.asCounted) setAsCounted(false);
        else if (l.onClose) l.onClose();
        else return;
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The foot as it stands once drawn: the grid gives up height to it. A smaller grid only makes the foot narrower and
  // taller, never shorter, so the two settle in a step or two.
  const footRef = useRef<HTMLDivElement | null>(null);
  const [footSeen, setFootSeen] = useState(FOOT_H);
  useLayoutEffect(() => {
    const el = footRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // What the foot always holds; a sentence that comes and goes with an action (the years as counted, why this
      // month cannot be counted) runs below it rather than moving the grid
      const passing = [...el.querySelectorAll<HTMLElement>(':scope > .rec__holds')].reduce((s, p) => s + p.offsetHeight + 8, 0);
      const h = Math.ceil(el.offsetHeight - passing) + 12;
      setFootSeen((was) => (Math.abs(was - h) > 1 ? h : was));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [rec, rough]);
  const bounds = useMemo(() => (rec ? rampBounds(rec) : { lo: 1, hi: 1 }), [rec]);
  const years = rec ? Array.from({ length: rec.lastYear - rec.firstYear + 1 }, (_, i) => rec.firstYear + i) : [];
  const footH = Math.max(FOOT_H, footSeen);
  const cell = years.length
    ? // One column more than the record's years is kept free on the right: this month's square stands there
      Math.max(8, Math.floor(Math.min((size.w - NAMES_W) / (years.length + 1), (size.h - HEAD_H - AXIS_H - SPANS_H - footH) / 12)))
    : 0;
  const gap = cell >= 24 ? 3 : 1;
  const gridW = cell * years.length;
  const gridH = cell * 12;
  const x0 = Math.max(NAMES_W, Math.round((size.w - gridW + NAMES_W) / 2));
  const y0 = HEAD_H;
  const xOf = (year: number) => x0 + (year - (rec?.firstYear ?? 0)) * cell;
  const yOf = (month: number) => y0 + (month - 1) * cell;
  const yearEvery = cell >= 34 ? 1 : cell >= 18 ? 2 : 5;

  const monthAt = (e: { clientX: number; clientY: number; currentTarget: Element }): string | null => {
    if (!rec || !cell) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left - x0) / cell);
    const row = Math.floor((e.clientY - r.top - y0) / cell);
    if (col < 0 || col >= years.length || row < 0 || row > 11) return null;
    const ym = ymOf(years[col], row + 1);
    return rec.months.has(ym) ? ym : null;
  };

  // This month's square stands in its own year's column, past the record's last one, in its month's row
  const nowAt = thisMonth ? { x: xOf(Number(thisMonth.month.slice(0, 4))), y: yOf(Number(thisMonth.month.slice(5, 7))) } : null;
  const nowLabel = nowOn && hover === null && thisMonth && nowAt ? thisMonth : null;
  const fm = nowLabel ? null : focus && rec ? rec.months.get(focus) ?? null : null;
  const fx = nowLabel && nowAt ? nowAt.x + cell / 2 : fm ? xOf(fm.year) + cell / 2 : 0;
  const fy = nowLabel && nowAt ? nowAt.y : fm ? yOf(fm.month) : 0;
  // Where the way to this month stands: after the last year, on the years' line
  // The way to this month so far stands at the right end of the years, above the older satellites' line, where no
  // year label is written
  const afterYears = rec ? xOf(rec.lastYear + 1) + cell : 0;
  // On a grid too narrow for it to stand beside the older satellites' label, the way goes to the foot
  const afterFits = afterYears <= size.w + 24 && gridW >= 360;
  // The label hangs on the side of its leader with room for it, and is never wider than that room.
  const labelRight = fx + 12 + LABEL_W <= size.w || size.w - fx >= fx;
  const labelRoom = Math.max(120, Math.min(LABEL_W, (labelRight ? size.w - fx : fx) - 12));
  const sharpX = rec?.spans.sharp ? xOf(Number(rec.spans.sharp[0].slice(0, 4))) : null;
  const spanLine = (span: [string, string] | null) =>
    span && rec ? { from: xOf(Number(span[0].slice(0, 4))), to: xOf(Number(span[1].slice(0, 4))) + cell - gap } : null;
  const coarse = spanLine(rec?.spans.coarse ?? null);
  const sharp = spanLine(rec?.spans.sharp ?? null);
  const spansY = y0 + gridH + AXIS_H;
  const footY = spansY + SPANS_H;
  // Under a narrow grid the foot takes the plot's width from the month names, so its words wrap less
  const narrowFoot = gridW < 480;
  const footX = narrowFoot ? Math.max(0, x0 - NAMES_W) : x0;
  const footW = narrowFoot ? Math.max(gridW, size.w - footX) : gridW;
  /** Room for the prompt before the sharp satellite's line begins; on a narrow screen it goes to the foot. */
  const atJunction = sharpX !== null && sharpX - x0 >= 372;
  const correctionPrompt = (
    <button type="button" className="rec__act" aria-pressed={asCounted} onClick={() => setAsCounted((on) => !on)}>
      {asCounted ? W.backToOneScale : W.seeAsCounted}
    </button>
  );

  return (
    <section className="rec" aria-label={W.name} ref={rootRef} data-as-counted={asCounted ? 'true' : 'false'}>
      <div className="rec__plot" ref={plotRef}>
        {state !== 'ready' && state !== 'not loaded' && !guideSpeaks && (
          <p className="rec__status sys-body" role="status">
            {state === 'loading' && W.loading(place.name)}
            {state === 'not recorded' && NOT_RECORDED_LINE}
            {state === 'failed' && `${W.failed(place.name)} ${failure ?? ''}`}
          </p>
        )}
        {/* An area with no detection in any of its squares has no record: the Record says so in place of a grid,
            where the guide speaks too, since it is a fact of the area and not the guide's step */}
        {state === 'not loaded' && empty && (
          <p className="rec__status sys-body" role="status">
            {notLoadedLine(empty.cells, empty.step, empty.complete)}
            <span className="rec__status-box sys-label">{boxWords(empty.box)}</span>
          </p>
        )}

        {rec && cell > 0 && (
          <>
            {/* A soft dark ground under the grid and its labels, with no edge: the land shows around it. */}
            <div className="rec__ground" style={{ left: Math.min(x0 - NAMES_W, footX), top: y0, width: Math.max(gridW + NAMES_W, footW), height: footY + footH - 12 - y0 }} />
            <svg
              className="rec__grid"
              width={size.w}
              height={size.h}
              role="img"
              aria-label={W.grid(rec.label)}
              onPointerMove={(e) => setHover(monthAt(e))}
              onPointerLeave={() => setHover(null)}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                // This month's own square brings its label back
                if (nowAt && Math.abs(e.clientX - r.left - nowAt.x - cell / 2) <= cell / 2 && Math.abs(e.clientY - r.top - nowAt.y - cell / 2) <= cell / 2) return setNowOn(true);
                const ym = monthAt(e);
                if (!ym) return;
                // A click picks a month, so its label, its prompt and the guide's actions for it (its detections as a
                // file among them) can be read; a click on the month already picked shows its fire
                if (ym === shown && openable.has(ym) && (picked !== null || ym === marked)) show(ym);
                else pick(ym);
              }}
            >
              {MONTH_NAMES.map((name, i) => (
                <text key={name} className="rec__axis" x={x0 - 10} y={yOf(i + 1) + cell / 2} textAnchor="end" dominantBaseline="central">
                  {cell >= 16 ? name.slice(0, 3) : name.slice(0, 1)}
                </text>
              ))}
              {years.map((year) =>
                year % yearEvery === 0 ? (
                  <text key={year} className="rec__axis" x={xOf(year) + (cell - gap) / 2} y={y0 + gridH + 15} textAnchor="middle">
                    {year}
                  </text>
                ) : null,
              )}

              {[...rec.months.values()].map((m) => {
                const v = asCounted ? m.asCounted : m.value;
                if (v === null) return null;
                const k = logClass(v, bounds.lo, bounds.hi, STEPS);
                return (
                  <rect
                    key={m.ym}
                    className={k === 0 ? 'rec__cell rec__cell--none' : 'rec__cell'}
                    data-opens={openable.has(m.ym) ? 'true' : undefined}
                    x={xOf(m.year)}
                    y={yOf(m.month)}
                    width={cell - gap}
                    height={cell - gap}
                    style={k === 0 ? undefined : { fill: RAMP[k - 1] }}
                  />
                );
              })}

              {/* Corner marks are the one selected month: the picked one, else the marked one. The other months that
                  hold a fire the stage can show get a thin frame once the visitor is looking over the months, and the
                  legend then says what the frame means. */}
              {looking &&
                [...openable]
                  .filter((ym) => ym !== shown)
                  .map((ym) => {
                    const m = rec.months.get(ym)!;
                    return <rect key={ym} className="rec__fire" x={xOf(m.year) - 1.5} y={yOf(m.month) - 1.5} width={cell - gap + 3} height={cell - gap + 3} />;
                  })}
              {shown && rec.months.get(shown) && (
                <path
                  className="rec__bracket"
                  d={brackets(xOf(rec.months.get(shown)!.year), yOf(rec.months.get(shown)!.month), cell - gap, gap, Math.max(4, Math.round(cell * 0.26)))}
                />
              )}
              {(fm || nowLabel) && <line className="rec__leader" x1={fx - gap / 2} y1={y0 - HEAD_H + 12} x2={fx - gap / 2} y2={fy - 7} />}

              {/* This month so far, once asked for: a square on the same ramp, its edge dashed because the month is not over. */}
              {thisMonth && nowAt && (
                <g>
                  <rect
                    className={logClass(thisMonth.value, bounds.lo, bounds.hi, STEPS) === 0 ? 'rec__cell rec__cell--none' : 'rec__cell'}
                    x={nowAt.x}
                    y={nowAt.y}
                    width={cell - gap}
                    height={cell - gap}
                    style={logClass(thisMonth.value, bounds.lo, bounds.hi, STEPS) === 0 ? undefined : { fill: RAMP[logClass(thisMonth.value, bounds.lo, bounds.hi, STEPS) - 1] }}
                  />
                  <rect className="rec__now" x={nowAt.x - 1.5} y={nowAt.y - 1.5} width={cell - gap + 3} height={cell - gap + 3} />
                  {/* Its year is written where every year is; on a small grid it would stand on the last label */}
                  {yearEvery === 1 && (
                    <text className="rec__axis" x={nowAt.x + (cell - gap) / 2} y={y0 + gridH + 15} textAnchor="middle">
                      {thisMonth.month.slice(0, 4)}
                    </text>
                  )}
                </g>
              )}

              {/* Which satellite was flying, from the first and last month each has a rate in the record. */}
              {!rough && coarse && (
                <g className="rec__span rec__span--coarse">
                  <line x1={coarse.from} y1={spansY + 24} x2={coarse.to} y2={spansY + 24} />
                  <text x={coarse.from} y={spansY + 17}>
                    {W.coarse}
                  </text>
                </g>
              )}
              {!rough && sharp && (
                <g className="rec__span rec__span--sharp">
                  <line x1={sharp.from} y1={spansY + 48} x2={sharp.to} y2={spansY + 48} />
                  {sharp.to - sharp.from >= 280 ? (
                    <text x={sharp.from} y={spansY + 41}>
                      {W.sharp}
                    </text>
                  ) : (
                    <text x={sharp.to} y={spansY + 41} textAnchor="end">
                      {W.sharp}
                    </text>
                  )}
                </g>
              )}
            </svg>

            {fm && (
              <div
                className="rec__label"
                data-side={labelRight ? 'right' : 'left'}
                style={
                  labelRight
                    ? { left: fx + 12, bottom: size.h - y0 + 14, maxWidth: labelRoom }
                    : { right: size.w - fx + 12, bottom: size.h - y0 + 14, maxWidth: labelRoom }
                }
                aria-live="polite"
              >
                <span className="sys-title">{monthWords(fm.ym)}</span>
                <span className="sys-label">{monthLine(fm.ym, fm.value, fm.timesUsual, fm.median)}</span>
                {/* The prompt beside the month. Where the guide speaks it offers the same action in its strip, and a
                    click on the month's square still shows its fire, so the Record draws no prompt of its own. */}
                {openable.has(fm.ym) && !guideSpeaks && (
                  <button type="button" className="rec__act rec__act--next" onClick={() => show(fm.ym)}>
                    {!hover && <span className="rec__key">Enter</span>}
                    {W.show}
                  </button>
                )}
              </div>
            )}

            {nowLabel && (
              <div
                className="rec__label"
                data-side={labelRight ? 'right' : 'left'}
                style={
                  labelRight
                    ? { left: fx + 12, bottom: size.h - y0 + 8, maxWidth: labelRoom }
                    : { right: size.w - fx + 12, bottom: size.h - y0 + 8, maxWidth: labelRoom }
                }
                aria-live="polite"
              >
                <span className="sys-title">{W.soFar(nowLabel.month)}</span>
                <span className="sys-label">{W.soFarRate(nowLabel.value ?? 0, nowLabel.days)}</span>
                {nowLabel.median !== null && <span className="sys-label">{W.usualIs(nowLabel.month, nowLabel.median)}</span>}
                {nowLabel.caveats.length > 0 && !guideSpeaks && (
                  <button type="button" className="rec__act" aria-pressed={rough} onClick={() => setRough((on) => !on)}>
                    {W.rough}
                  </button>
                )}
              </div>
            )}

            {/* The way to this month so far stands after the last year: the month is the record's next square. Where
                the guide speaks it offers the way, and the Record says only that the month is being counted. */}
            {rec.currentRoute && !thisMonth && afterFits && (now.state === 'loading' || !guideSpeaks) && (
              <div className="rec__after" style={{ right: size.w - afterYears, top: spansY + 2 }}>
                {now.state === 'loading' ? (
                  <span className="sys-fine">{W.counting}</span>
                ) : (
                  <button type="button" className="rec__act rec__act--small" onClick={askNow}>
                    {W.thisMonth}
                  </button>
                )}
              </div>
            )}

            {/* The way to the years as counted sits where the sharp satellite's line begins, the thing it is about. */}
            {!rough && sharpX !== null && atJunction && !guideSpeaks && (
              <div className="rec__junction" style={{ right: size.w - sharpX + 14, top: spansY + 29 }}>
                {correctionPrompt}
              </div>
            )}

            {rough && thisMonth ? (
              // How rough this month's figure is, as the route says it, where the satellites' lines and the legend stand
              <div className="rec__foot rec__foot--rough" style={{ top: spansY + 10, left: footX, width: footW }}>
                <ul className="sys-fine rec__caveats rec__wide">
                  {thisMonth.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <button type="button" className="rec__act" onClick={() => setRough(false)}>
                  {W.roughBack}
                </button>
              </div>
            ) : (
            <div className="rec__foot" ref={footRef} style={{ top: footY, left: footX, width: footW }}>
              {/* A drawn area: the box its rates are over, on whole squares of the cube, and how many hold detections */}
              {rec.grid && (
                <p className="sys-fine rec__wide rec__gridline">
                  {gridLine(boxWords(rec.grid.box), rec.grid.step, rec.grid.cells, rec.grid.loaded, rec.grid.complete)}
                </p>
              )}
              <span className="rec__legend sys-fine">
                {W.noFireLegend}
                <i className="rec__swatch rec__swatch--none" />
                <span className="rec__legend-gap" />
                {W.less}
                <span className="rec__ramp">
                  {RAMP.map((c) => (
                    <i key={c} className="rec__swatch" style={{ background: c }} />
                  ))}
                </span>
                {W.more}
                {looking && openable.size > 0 && (
                  <>
                    <span className="rec__legend-gap" />
                    <i className="rec__swatch rec__swatch--fire" />
                    {W.brackets}
                  </>
                )}
              </span>
              {onClose && !guideSpeaks && (
                <button type="button" className="rec__act rec__close" onClick={onClose}>
                  <span className="rec__key">Esc</span>
                  {W.close}
                </button>
              )}
              {sharpX !== null && !atJunction && !guideSpeaks && <div className="rec__wide">{correctionPrompt}</div>}
              {rec.currentRoute && !thisMonth && !afterFits && (now.state === 'loading' || !guideSpeaks) &&
                (now.state === 'loading' ? (
                  <span className="sys-fine rec__wide">{W.counting}</span>
                ) : (
                  <button type="button" className="rec__act rec__wide" onClick={askNow}>
                    {W.thisMonth}
                  </button>
                ))}
              {notNow && nowOn && <p className="sys-label rec__wide rec__holds">{notNow}</p>}
              {asCounted && rec.spans.sharp && (
                <p className="sys-label rec__holds rec__wide">
                  {W.asCounted(rec.sharpRatio, Number(rec.spans.sharp[0].slice(0, 4)))}
                  {rec.heldOut && !guideSpeaks && ` ${W.holds(rec.heldOut.harmonized, rec.heldOut.raw)}`}
                </p>
              )}
            </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
