import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LIPARI_32 } from '../../lib/colormaps';
import { NOT_RECORDED_LINE, NotRecorded } from '../../lib/api';
import { fetchRecord, logClass, monthWords, MONTH_NAMES, rampBounds, type FireRecord, type RecordMonth, type RecordPlace } from './record';
import { publishRecordView, RECORD_CLOSED, type RecordMonthView } from './recordView';
import { monthLine, RECORD_WORDS as W } from './recordWords';
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
}

/**
 * The Record: every fire detected around a place since 2000, opened over the stage. One square a month, years across
 * and months down, brighter for more fire, every year on the sharp satellite's scale. The months that hold a fire the
 * stage can show stand in brackets; the one the stage holds carries its label and its one action. Under the years,
 * two lines say which satellite was flying; from there the visitor can see the years as counted, before the
 * correction, and how well the correction holds. What the step is, is the guide's to say: this component speaks only
 * as labels on its own things, and tells the guide what it holds through `recordView`.
 */
export function TheRecord({ place, markedMonth, canOpen, onOpenMonth, onClose }: TheRecordProps) {
  const [rec, setRec] = useState<FireRecord | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'not recorded'>('loading');
  const [failure, setFailure] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [asCounted, setAsCounted] = useState(false);
  // Looking over the months: asked for, or the pointer or the arrow keys are on the grid.
  const [browsing, setBrowsing] = useState(false);
  const [plotRef, size] = useSize<HTMLDivElement>();
  const rootRef = useRef<HTMLElement | null>(null);
  const placeKey = place.kind === 'region' ? place.regionId : place.box.join(',');

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setRec(null);
    setPicked(null);
    setHover(null);
    setAsCounted(false);
    setBrowsing(false);
    fetchRecord(place, controller.signal)
      .then((r) => {
        if (controller.signal.aborted) return;
        setRec(r);
        setState(r ? 'ready' : 'failed');
        setFailure(r ? null : 'It came back in a shape the page cannot read.');
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
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

  // The latest of everything the keys and the published commands act on.
  const live = useRef({ rec, shown, picked, marked, asCounted, openable, onOpenMonth, onClose });
  live.current = { rec, shown, picked, marked, asCounted, openable, onOpenMonth, onClose };

  const show = (ym?: string | null) => {
    const l = live.current;
    const target = ym ?? l.picked ?? l.marked;
    if (target && l.rec && l.openable.has(target)) l.onOpenMonth(target, l.rec);
  };
  const pick = (ym: string | null) => {
    const l = live.current;
    setPicked(ym && l.rec?.months.has(ym) && ym !== l.marked ? ym : null);
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
    publishRecordView({
      state,
      failure,
      place: rec?.label ?? place.name,
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
      show,
      pick,
      browse: () => setBrowsing(true),
      showAsCounted: setAsCounted,
    });
  }, [state, failure, rec, marked, picked, asCounted, openable, place.name]); // eslint-disable-line react-hooks/exhaustive-deps
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
        if (t?.closest('button, a')) return;
        show(l.shown);
      } else if (e.key === 'Escape') {
        if (l.asCounted) setAsCounted(false);
        else if (l.onClose) l.onClose();
        else return;
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bounds = useMemo(() => (rec ? rampBounds(rec) : { lo: 1, hi: 1 }), [rec]);
  const years = rec ? Array.from({ length: rec.lastYear - rec.firstYear + 1 }, (_, i) => rec.firstYear + i) : [];
  const cell = years.length
    ? Math.max(8, Math.floor(Math.min((size.w - NAMES_W) / years.length, (size.h - HEAD_H - AXIS_H - SPANS_H - FOOT_H) / 12)))
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

  const fm = focus && rec ? rec.months.get(focus) ?? null : null;
  const fx = fm ? xOf(fm.year) + cell / 2 : 0;
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
        {state !== 'ready' && (
          <p className="rec__status sys-body" role="status">
            {state === 'loading' && W.loading(place.name)}
            {state === 'not recorded' && NOT_RECORDED_LINE}
            {state === 'failed' && `${W.failed(place.name)} ${failure ?? ''}`}
          </p>
        )}

        {rec && cell > 0 && (
          <>
            {/* A soft dark ground under the grid and its labels, with no edge: the land shows around it. */}
            <div className="rec__ground" style={{ left: x0 - NAMES_W, top: y0, width: gridW + NAMES_W, height: footY + 24 - y0 }} />
            <svg
              className="rec__grid"
              width={size.w}
              height={size.h}
              role="img"
              aria-label={W.grid(rec.label)}
              onPointerMove={(e) => setHover(monthAt(e))}
              onPointerLeave={() => setHover(null)}
              onClick={(e) => {
                const ym = monthAt(e);
                if (!ym) return;
                if (openable.has(ym)) show(ym);
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
              {fm && <line className="rec__leader" x1={fx - gap / 2} y1={y0 - HEAD_H + 12} x2={fx - gap / 2} y2={yOf(fm.month) - 7} />}

              {/* Which satellite was flying, from the first and last month each has a rate in the record. */}
              {coarse && (
                <g className="rec__span rec__span--coarse">
                  <line x1={coarse.from} y1={spansY + 24} x2={coarse.to} y2={spansY + 24} />
                  <text x={coarse.from} y={spansY + 17}>
                    {W.coarse}
                  </text>
                </g>
              )}
              {sharp && (
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
                <span className="sys-label">{monthLine(fm.ym, fm.value, fm.timesUsual)}</span>
                {openable.has(fm.ym) && (
                  <button type="button" className="rec__act rec__act--next" onClick={() => show(fm.ym)}>
                    {!hover && <span className="rec__key">Enter</span>}
                    {W.show}
                  </button>
                )}
              </div>
            )}

            {/* The way to the years as counted sits where the sharp satellite's line begins, the thing it is about. */}
            {sharpX !== null && atJunction && (
              <div className="rec__junction" style={{ right: size.w - sharpX + 14, top: spansY + 29 }}>
                {correctionPrompt}
              </div>
            )}

            <div className="rec__foot" style={{ top: footY, left: x0, width: gridW }}>
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
              {onClose && (
                <button type="button" className="rec__act rec__close" onClick={onClose}>
                  <span className="rec__key">Esc</span>
                  {W.close}
                </button>
              )}
              {sharpX !== null && !atJunction && <div className="rec__wide">{correctionPrompt}</div>}
              {asCounted && rec.spans.sharp && (
                <p className="sys-label rec__holds rec__wide">
                  {W.asCounted(rec.sharpRatio, Number(rec.spans.sharp[0].slice(0, 4)))}
                  {rec.heldOut && ` ${W.holds(rec.heldOut.harmonized, rec.heldOut.raw)}`}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
