import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  MONTH_NAMES,
  VIEW_UNITS,
  domainFor,
  formatValue,
  ordinal,
  parseCalendar,
  position,
  statsFor,
  toCsv,
  valueOf,
  type Calendar,
  type CalendarView,
} from '../content/calendar';

/**
 * The burning calendar as the workspace's time control: months down, years across, one cell per month,
 * colour is the value on a log scale. Empty cells mean no sensor in orbit or a month still to come.
 *
 * Ramp: one orange hue, OKLCH L 0.42 to 0.94 in nine steps, built and checked in this lane's U13 to C1 work:
 * lightness monotone under normal vision and Machado 2009 protanopia and deuteranopia, adjacent step at least
 * 0.06 L, darkest step 2.21:1 against the scrim. NOTES/front-page-ui/C1.md has the numbers.
 */
const RAMP = ['#66452b', '#8a4d14', '#a85a02', '#c36a07', '#da7e27', '#e89756', '#efb284', '#f5cdb0', '#ffe6d4'];

const VIEWS: ReadonlyArray<{ id: CalendarView; label: string }> = [
  { id: 'record', label: 'Isogon record' },
  { id: 'combined', label: 'Raw combined' },
  { id: 'modis', label: 'Raw MODIS' },
  { id: 'viirs', label: 'Raw VIIRS' },
];

const CELL_W = 16;
const CELL_H = 6;
const GAP = 1.5;

function hexToRgb(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
const RAMP_RGB = RAMP.map(hexToRgb);

/** Colour at t in [0, 1], interpolated between neighbouring ramp steps. */
function rampAt(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const a = RAMP_RGB[i];
  const b = RAMP_RGB[i + 1];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function monthsBetween(a: string, b: string, all: readonly string[]): string[] {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return all.filter((ym) => ym >= lo && ym <= hi);
}

export interface CalendarArea {
  name: string;
  lat: number;
  lon: number;
}

interface BurningCalendarProps {
  apiBase: string;
  regionId: string;
  area: CalendarArea;
  /** The month the terrain shows ("2026-08"), from the run's passes. */
  stageMonth: string | null;
  selectedMonth: string | null;
  onSelectMonth: (ym: string) => void;
}

export function BurningCalendar({ apiBase, regionId, area, stageMonth, selectedMonth, onSelectMonth }: BurningCalendarProps) {
  const [cal, setCal] = useState<Calendar | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [view, setView] = useState<CalendarView>('record');
  const [hover, setHover] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    fetch(`${apiBase}/api/calendar?region_id=${encodeURIComponent(regionId)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => {
        const parsed = parseCalendar(raw);
        setCal(parsed);
        setState(parsed ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('missing');
      });
    return () => controller.abort();
  }, [apiBase, regionId]);

  const allMonths = useMemo(() => (cal ? cal.months.map((m) => m.yearMonth) : []), [cal]);
  const focus = selectedMonth && allMonths.includes(selectedMonth) ? selectedMonth : (stageMonth ?? allMonths.at(-1) ?? null);
  const selection = useMemo(
    () => (focus ? (anchor ? monthsBetween(anchor, focus, allMonths) : [focus]) : []),
    [anchor, focus, allMonths],
  );

  if (state !== 'ready' || !cal) {
    return (
      <div className="iso-cal">
        <p className="iso-cal__empty">
          {state === 'loading' ? 'Loading the monthly record.' : 'The backend has no monthly record for this area.'}
        </p>
      </div>
    );
  }

  const covers =
    !cal.bbox ||
    (area.lon >= cal.bbox[0] && area.lon <= cal.bbox[2] && area.lat >= cal.bbox[1] && area.lat <= cal.bbox[3]);
  const calName = cal.regionName.split(',')[1]?.trim().split('/')[0]?.trim() || cal.regionName;

  const years = cal.lastYear - cal.firstYear + 1;
  const vbW = years * (CELL_W + GAP) - GAP;
  const vbH = 12 * (CELL_H + GAP) - GAP;
  const domain = domainFor(cal, view);
  const shown = hover ?? focus;
  const stats = shown ? statsFor(cal, shown, view) : null;

  const cellAt = (clientX: number, clientY: number): string | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * vbW;
    const y = ((clientY - r.top) / r.height) * vbH;
    const col = Math.floor(x / (CELL_W + GAP));
    const row = Math.floor(y / (CELL_H + GAP));
    if (col < 0 || col >= years || row < 0 || row > 11) return null;
    return `${cal.firstYear + col}-${String(row + 1).padStart(2, '0')}`;
  };

  const select = (ym: string, extend: boolean) => {
    if (extend) {
      setAnchor((a) => a ?? focus);
    } else {
      setAnchor(null);
    }
    onSelectMonth(ym);
  };

  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    if (!focus) return;
    const [y, m] = focus.split('-').map(Number);
    let ny = y;
    let nm = m;
    if (e.key === 'ArrowLeft') ny -= 1;
    else if (e.key === 'ArrowRight') ny += 1;
    else if (e.key === 'ArrowUp') nm -= 1;
    else if (e.key === 'ArrowDown') nm += 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    if (nm < 1) {
      nm = 12;
      ny -= 1;
    } else if (nm > 12) {
      nm = 1;
      ny += 1;
    }
    const next = `${ny}-${String(nm).padStart(2, '0')}`;
    if (allMonths.includes(next)) select(next, e.shiftKey);
  };

  const download = () => {
    const blob = new Blob([toCsv(cal, selection)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${regionId}_${selection[0]}_${selection.at(-1)}${cal.simulated ? '_simulated' : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  };

  return (
    <div className="iso-cal">
      <div className="iso-cal__bar">
        <div className="iso-choice" role="group" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className="iso-choice__opt"
              data-active={view === v.id ? 'true' : 'false'}
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="iso-cal__body">
        <div className="iso-cal__months" aria-hidden="true">
          <span>Jan</span>
          <span>Dec</span>
        </div>
        <div className="iso-cal__plot">
          <svg
            ref={svgRef}
            className="iso-cal__grid"
            viewBox={`0 0 ${vbW} ${vbH}`}
            preserveAspectRatio="none"
            tabIndex={0}
            role="group"
            aria-label={`Monthly fire activity, ${cal.firstYear} to ${cal.lastYear}. Arrow keys move between months, Shift extends the selection.`}
            onPointerMove={(e) => setHover(cellAt(e.clientX, e.clientY))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              const ym = cellAt(e.clientX, e.clientY);
              if (ym && allMonths.includes(ym)) select(ym, e.shiftKey);
            }}
            onKeyDown={onKeyDown}
          >
            {cal.months.map((m) => {
              const v = valueOf(m, view);
              if (v === null) return null;
              return (
                <rect
                  key={m.yearMonth}
                  x={(m.year - cal.firstYear) * (CELL_W + GAP)}
                  y={(m.month - 1) * (CELL_H + GAP)}
                  width={CELL_W}
                  height={CELL_H}
                  fill={rampAt(position(v, domain))}
                />
              );
            })}
            {selection.map((ym) => {
              const [y, m] = ym.split('-').map(Number);
              return (
                <rect
                  key={`sel-${ym}`}
                  className={ym === focus ? 'iso-cal__focus' : 'iso-cal__range'}
                  x={(y - cal.firstYear) * (CELL_W + GAP) - 0.75}
                  y={(m - 1) * (CELL_H + GAP) - 0.75}
                  width={CELL_W + 1.5}
                  height={CELL_H + 1.5}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {hover && hover !== focus && (
              <rect
                className="iso-cal__hover"
                x={(Number(hover.slice(0, 4)) - cal.firstYear) * (CELL_W + GAP) - 0.75}
                y={(Number(hover.slice(5)) - 1) * (CELL_H + GAP) - 0.75}
                width={CELL_W + 1.5}
                height={CELL_H + 1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          <div className="iso-cal__years" aria-hidden="true">
            {[cal.firstYear, 2012, cal.lastYear].map((y) => (
              <span key={y} style={{ left: `${(((y - cal.firstYear) * (CELL_W + GAP) + CELL_W / 2) / vbW) * 100}%` }}>
                {y}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="iso-cal__legend">
        <span className="iso-cal__ramp" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${RAMP.join(', ')})` }} />
        <span className="iso-cal__scale">
          {formatValue(domain[0])} to {formatValue(domain[1])} {VIEW_UNITS[view]}, log scale
        </span>
        <div className="iso-cal__end">
          {cal.simulated && <span className="iso-cal__tag">Simulated</span>}
          {selection.length > 0 && (
            <button type="button" className="iso-key iso-cal__csv" onClick={download}>
              <kbd>CSV</kbd>
              <span>{selection.length === 1 ? monthLabel(selection[0]) : `${selection.length} months`}</span>
            </button>
          )}
        </div>
      </div>

      {shown && stats && (
        <div className="iso-cal__readout" aria-live="polite">
          <table className="iso-table iso-cal__table">
            <thead>
              <tr>
                <th scope="col">{monthLabel(shown)}</th>
                <th scope="col">Median, all {MONTH_NAMES[Number(shown.slice(5)) - 1]}s</th>
                <th scope="col">Rank</th>
                <th scope="col">p10 to p90</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{formatValue(stats.value)}</td>
                <td>{formatValue(stats.median)}</td>
                <td>{stats.rank === null ? 'none' : `${ordinal(stats.rank)} of ${stats.of}`}</td>
                <td>
                  {stats.p10 === null || stats.p90 === null
                    ? view === 'record'
                      ? 'none'
                      : 'not modelled'
                    : `${formatValue(stats.p10)} to ${formatValue(stats.p90)}`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {(!covers || (focus && stageMonth && focus !== stageMonth)) && (
        <p className="iso-cal__note">
          {!covers
            ? `No monthly record for ${area.name} yet; this is ${calName}.`
            : `The terrain shows ${monthLabel(stageMonth as string)}.`}
        </p>
      )}
    </div>
  );
}
