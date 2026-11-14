import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { LIPARI_32 } from '../../lib/colormaps';
import { NOT_RECORDED_LINE, NotRecorded } from '../../lib/api';
import { RouteLink } from '../../lib/RouteLink';
import { beatOf } from '../../app/names';
import {
  fetchCurrent,
  fetchRecord,
  logClass,
  monthWords,
  MONTH_NAMES,
  ordinal,
  rampBounds,
  rateWords,
  type CurrentMonth,
  type FireRecord,
  type RecordPlace,
} from './record';
import '../../styles/calendar-screen.css';

/** Eight steps of an accessible sequential ramp, from a dim blue that recedes into the night to the brightest cream. */
const STEPS = 8;
const RAMP = Array.from({ length: STEPS }, (_, i) => LIPARI_32[Math.round(9 + (i * (31 - 9)) / (STEPS - 1))]);

/** Why this month's rows are not shown, in plain words, by the route's status. */
const STATUS_WORDS: Record<string, string> = {
  'no key': 'the server holds no FIRMS key to fetch this month\'s rows',
  'box too large': 'this month is fetched for boxes up to 5 degrees each way',
  busy: 'the FIRMS key\'s hourly limit is nearly used; it comes back within the hour',
  'no full day yet': 'no full day of this month has passed yet',
  failed: 'the request for this month\'s rows failed',
};

const LABEL_W = 44;
const MEDIAN_W = 120;
const YEARS_H = 76;
const AXIS_H = 20;

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 900, h: 520 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export interface CalendarScreenProps {
  place: RecordPlace;
  /** The month of the run on the terrain, selected first when the record holds it. */
  stageMonth: string | null;
  /** The record's months with a real run that can open; null for a box (runs open on the featured places). */
  canOpen: (ym: string, rec: FireRecord) => boolean;
  onOpenMonth: (ym: string, rec: FireRecord) => void;
  onChoosePlace: () => void;
}

/**
 * The Calendar: a place's fire record as the whole screen. Months down, years across, one cell a month on a log ramp
 * where quiet months recede and the worst are the brightest; an empty month is left empty. Under it the mean of each
 * year, beside it the median of each month; two readouts (how wrong the method is on years left out, and this month
 * against its median); the chosen month's card joined to its cell.
 */
export function CalendarScreen({ place, stageMonth, canOpen, onOpenMonth, onChoosePlace }: CalendarScreenProps) {
  const [rec, setRec] = useState<FireRecord | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'not recorded'>('loading');
  const [failure, setFailure] = useState<string | null>(null);
  const [current, setCurrent] = useState<CurrentMonth | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  // The card follows the pointer only once the pointer has moved over the grid: a screen that opens under a resting
  // pointer keeps the chosen month in the card.
  const pointerMoved = useRef(false);
  const [caveatsOpen, setCaveatsOpen] = useState(false);
  const [plotRef, size] = useSize<HTMLDivElement>();
  const placeKey = place.kind === 'region' ? place.regionId : place.box.join(',');

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setRec(null);
    setCurrent(null);
    fetchRecord(place, controller.signal)
      .then((r) => {
        if (controller.signal.aborted) return;
        setRec(r);
        setState(r ? 'ready' : 'failed');
        if (!r) setFailure('The record came back in a shape the page cannot read.');
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setState(e instanceof NotRecorded ? 'not recorded' : 'failed');
        setFailure(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, [placeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rec?.currentRoute) return;
    const controller = new AbortController();
    fetchCurrent(rec.currentRoute, controller.signal)
      .then((c) => !controller.signal.aborted && setCurrent(c))
      .catch(() => !controller.signal.aborted && setCurrent(null));
    return () => controller.abort();
  }, [rec?.currentRoute]);

  // The first selection: the run's month when the record holds it, else the worst month of the record.
  useEffect(() => {
    if (!rec) return;
    if (stageMonth && rec.months.get(stageMonth)?.value !== undefined) {
      setSelected(stageMonth);
      return;
    }
    let worst: string | null = null;
    rec.months.forEach((m) => {
      if (m.value !== null && (worst === null || m.value > (rec.months.get(worst)?.value ?? -1))) worst = m.ym;
    });
    setSelected(worst);
  }, [rec, stageMonth]);

  const bounds = useMemo(() => (rec ? rampBounds(rec) : { lo: 1, hi: 1 }), [rec]);
  const years = rec ? Array.from({ length: rec.lastYear - rec.firstYear + 1 }, (_, i) => rec.firstYear + i) : [];
  const gridW = Math.max(200, size.w - LABEL_W - MEDIAN_W);
  const gridH = Math.max(120, size.h - YEARS_H - AXIS_H);
  const cw = years.length ? gridW / years.length : 1;
  const ch = gridH / 12;
  const xOf = (y: number) => LABEL_W + (y - (rec?.firstYear ?? 0)) * cw;
  const yOf = (m: number) => (m - 1) * ch;

  const focus = hover ?? selected;
  const fm = focus && rec ? rec.months.get(focus) ?? null : null;
  const yearMax = Math.max(1e-9, ...(rec?.years.map((y) => y.mean ?? 0) ?? [0]));
  const topYears = rec ? [...rec.years].filter((y) => y.mean !== null).sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0)).slice(0, 3).map((y) => y.year) : [];
  const medMax = Math.max(1e-9, ...(rec?.climatology.map((c) => c.median ?? 0) ?? [0]));

  const move = (e: ReactKeyboardEvent) => {
    if (!rec || !selected) return;
    let [y, m] = selected.split('-').map(Number);
    if (e.key === 'ArrowLeft') y -= 1;
    else if (e.key === 'ArrowRight') y += 1;
    else if (e.key === 'ArrowUp') m -= 1;
    else if (e.key === 'ArrowDown') m += 1;
    else if (e.key === 'Enter') {
      if (canOpen(selected, rec)) onOpenMonth(selected, rec);
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
    if (m < 1 || m > 12 || y < rec.firstYear || y > rec.lastYear) return;
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    if (rec.months.has(ym)) setSelected(ym);
  };

  // The month's rows as CSV, through the page's client: the route live, the recorded file on the public page.
  const csvPath =
    rec && focus
      ? (() => {
          const [y, m] = focus.split('-').map(Number);
          const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
          const where = place.kind === 'region' ? `region_id=${encodeURIComponent(place.regionId)}` : `box=${encodeURIComponent(place.box.join(','))}`;
          return `/api/calendar/rows.csv?${where}&start=${focus}-01&end=${end}`;
        })()
      : null;

  const line = rec ? `Fire record, ${monthWords(rec.firstMonth)} to ${monthWords(rec.lastMonth)}, on one scale.` : beatOf('calendar').line;
  const cardTop = fm ? Math.max(0, yOf(fm.month) + ch / 2 - 40) : 0;

  return (
    <section className="cal-screen" aria-label="Calendar">
      <header className="cal-screen__head">
        <h1 className="sys-title">{rec?.label ?? place.name}</h1>
        <p className="sys-body">{line} The jump of 2012, when VIIRS arrived, is taken out.</p>
        <button type="button" className="sys-ctl cal-screen__place" onClick={onChoosePlace}>
          <span className="sys-key">P</span> Another place or a box
        </button>
      </header>

      <div className="cal-screen__readouts">
        {rec?.heldOut && (
          <div className="sys-readout sys-plate">
            <span className="sys-readout__delta">{Math.round(rec.heldOut.raw * 100)}% without harmonization</span>
            <span className="sys-display">{Math.round(rec.heldOut.harmonized * 100)}%</span>
            <span className="sys-readout__label">a year left out of the fit is off by, at the median</span>
          </div>
        )}
        {current && current.status === 'ready' && current.value !== null && (
          <div className="sys-readout sys-plate">
            <span className="sys-readout__delta">
              {current.days ? `${current.days.counted} of ${current.days.inMonth} days so far` : 'so far'}
            </span>
            <span className="sys-display">{rateWords(current.value)}</span>
            <span className="sys-readout__label">
              {monthWords(current.month)}, against a median of {rateWords(current.median)}
              {current.medianYears ? ` (${current.medianYears[0]} to ${current.medianYears[1]})` : ''}
            </span>
            <button type="button" className="sys-ctl cal-screen__caveats" onClick={() => setCaveatsOpen((o) => !o)} aria-expanded={caveatsOpen}>
              How rough this is
            </button>
            {caveatsOpen && (
              <ul className="cal-screen__caveat-list sys-fine">
                {current.caveats.map((c) => (
                  <li key={c}>{c.charAt(0).toUpperCase() + c.slice(1)}.</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {current && current.status !== 'ready' && (
          <p className="sys-label cal-screen__plain">This month is not shown: {STATUS_WORDS[current.status] ?? 'the request did not answer'}.</p>
        )}
      </div>

      <div className="cal-screen__plot" ref={plotRef}>
        {state === 'loading' && <p className="sys-label cal-screen__plain">Reading the record.</p>}
        {state === 'not recorded' && <p className="sys-label cal-screen__plain">{NOT_RECORDED_LINE}</p>}
        {state === 'failed' && <p className="sys-label cal-screen__plain">The record did not load: {failure}</p>}
        {rec && (
          <svg
            width={size.w}
            height={size.h}
            viewBox={`0 0 ${size.w} ${size.h}`}
            className="cal-screen__svg"
            tabIndex={0}
            role="grid"
            aria-label={`Monthly fire record, ${rec.firstYear} to ${rec.lastYear}. Arrow keys move between months, Enter opens one.`}
            onKeyDown={move}
            onPointerLeave={() => setHover(null)}
            onPointerMove={(e) => {
              if (e.movementX !== 0 || e.movementY !== 0) pointerMoved.current = true;
            }}
          >
            {[1, 4, 7, 10].map((m) => (
              <text key={m} x={0} y={yOf(m) + ch / 2 + 4} className="cal-screen__axis">
                {MONTH_NAMES[m - 1].slice(0, 3)}
              </text>
            ))}
            {[...rec.months.values()].map((m) => {
              const k = logClass(m.value, bounds.lo, bounds.hi, STEPS);
              if (m.value === null) return null;
              return (
                <rect
                  key={m.ym}
                  x={xOf(m.year) + 1}
                  y={yOf(m.month) + 1}
                  width={Math.max(1, cw - 2)}
                  height={Math.max(1, ch - 2)}
                  fill={k === 0 ? 'transparent' : RAMP[k - 1]}
                  className="cal-screen__cell"
                  onPointerEnter={() => pointerMoved.current && setHover(m.ym)}
                  onPointerMove={() => pointerMoved.current && hover !== m.ym && setHover(m.ym)}
                  onClick={() => setSelected(m.ym)}
                >
                  <title>
                    {monthWords(m.ym)}: {rateWords(m.value)}
                  </title>
                </rect>
              );
            })}
            {fm && (
              <g className="cal-screen__mark" pointerEvents="none">
                {(() => {
                  const x0 = xOf(fm.year) - 2;
                  const y0 = yOf(fm.month) - 2;
                  const x1 = x0 + cw + 4;
                  const y1 = y0 + ch + 4;
                  const b = Math.min(6, cw / 3, ch / 3);
                  const p = (x: number, y: number, dx: number, dy: number) => `M${x + dx * b},${y} L${x},${y} L${x},${y + dy * b}`;
                  return (
                    <>
                      <path d={`${p(x0, y0, 1, 1)} ${p(x1, y0, -1, 1)} ${p(x0, y1, 1, -1)} ${p(x1, y1, -1, -1)}`} />
                      <line x1={x1 + 2} y1={yOf(fm.month) + ch / 2} x2={size.w} y2={yOf(fm.month) + ch / 2} />
                    </>
                  );
                })()}
              </g>
            )}
            {/* Beside the grid: each month's median over the years (which part of the year burns). */}
            {rec.climatology.map((c) => {
              const w = c.median === null ? 0 : ((MEDIAN_W - 52) * c.median) / medMax;
              return (
                <g key={c.month}>
                  <rect x={LABEL_W + gridW + 10} y={yOf(c.month) + ch * 0.3} width={Math.max(c.median ? 1 : 0, w)} height={ch * 0.4} className="cal-screen__median" />
                  {c.median === medMax && (
                    <text x={LABEL_W + gridW + 14 + w} y={yOf(c.month) + ch / 2 + 4} className="cal-screen__value">
                      {rateWords(c.median)}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Under the grid: each year's mean (which years burned more). */}
            {rec.years.map((y) => {
              const h = y.mean === null ? 0 : ((YEARS_H - 22) * y.mean) / yearMax;
              const partial = y.months < 12;
              return (
                <g key={y.year}>
                  <rect
                    x={xOf(y.year) + cw * 0.2}
                    y={gridH + YEARS_H - h}
                    width={cw * 0.6}
                    height={Math.max(0, h)}
                    className={partial ? 'cal-screen__year cal-screen__year--partial' : 'cal-screen__year'}
                  />
                  {topYears.includes(y.year) && (
                    <text x={xOf(y.year) + cw / 2} y={gridH + YEARS_H - h - 6} textAnchor="middle" className="cal-screen__value">
                      {rateWords(y.mean)}
                    </text>
                  )}
                </g>
              );
            })}
            {years
              .filter((y) => y % 5 === 0 || y === 2012 || y === rec.lastYear || topYears.includes(y))
              .map((y) => (
                <text key={y} x={xOf(y) + cw / 2} y={size.h - 4} textAnchor="middle" className="cal-screen__axis">
                  {y}
                </text>
              ))}
          </svg>
        )}
        {rec && fm && (
          <div className="sys-card sys-plate cal-screen__card" style={{ top: cardTop }}>
            <span className="sys-title">{monthWords(fm.ym)}</span>
            <span className="sys-label">{rec.unit}</span>
            <div className="sys-card__rows">
              <span className="sys-label cal-screen__strong">This {MONTH_NAMES[fm.month - 1]}</span>
              <span className="sys-value">{rateWords(fm.value)}</span>
              <span className="sys-label">Median of {fm.rankOf ?? ''} {MONTH_NAMES[fm.month - 1]}s</span>
              <span className="sys-value">{rateWords(fm.median)}</span>
              {fm.rank !== null && fm.rankOf !== null && (
                <>
                  <span className="sys-label">Rank among them</span>
                  <span className="sys-value">
                    {ordinal(fm.rank)} of {fm.rankOf}
                  </span>
                </>
              )}
              {fm.counts.map((c) => (
                <Fragment key={c.platform}>
                  <span className="sys-label">{c.platform} rows</span>
                  <span className="sys-value">{c.total.toLocaleString('en-US')}</span>
                </Fragment>
              ))}
            </div>
            {canOpen(fm.ym, rec) ? (
              <button type="button" className="sys-ctl cal-screen__act" onClick={() => onOpenMonth(fm.ym, rec)}>
                <span className="sys-key">Enter</span> Open this month in World model
              </button>
            ) : (
              <span className="sys-fine">
                {place.kind === 'box'
                  ? 'Runs open on the featured places; this box has its record.'
                  : 'No run opens here: fewer passes with fire than a run needs.'}
              </span>
            )}
            {csvPath && (
              <RouteLink className="sys-ctl cal-screen__act" path={csvPath}>
                This month's rows as CSV
              </RouteLink>
            )}
          </div>
        )}
      </div>

      <footer className="cal-screen__foot">
        <span className="cal-screen__ramp" aria-hidden="true">
          {RAMP.map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </span>
        <span className="sys-fine">
          {rateWords(bounds.lo)} to {rateWords(bounds.hi)} {rec?.unit ?? ''}, log scale. An empty cell: no detection that
          month.
        </span>
      </footer>
    </section>
  );
}
