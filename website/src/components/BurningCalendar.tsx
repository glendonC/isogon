import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  MONTH_NAMES,
  classOf,
  classesFor,
  formatValue,
  ordinal,
  rowsCsvUrl,
  statsFor,
  toCsv,
  valueOf,
  type CalendarView,
} from '../content/calendar';
import type { CalendarState } from '../ui/useCalendar';
import { startBeforeSharp, startForMonth } from '../content/realRuns';

/**
 * The burning calendar as the workspace's time control: months down, years across, one cell per month,
 * colour is the month's class in the area's own record (content/calendar.ts `classesFor`). Empty cells mean no
 * sensor in orbit or a month still to come; hollow cells mean the sensor delivered and saw nothing.
 *
 * Ramp: one orange hue, OKLCH L 0.42 to 0.94 in nine steps. Lightness is monotone under normal vision and under
 * Machado 2009 protanopia and deuteranopia, adjacent steps differ by at least 0.06 L, and the darkest step has
 * 2.21:1 contrast against the scrim.
 */
const RAMP = ['#66452b', '#8a4d14', '#a85a02', '#c36a07', '#da7e27', '#e89756', '#efb284', '#f5cdb0', '#ffe6d4'];

/**
 * The record view's name says what made it: Isogon's model on the simulated calendar, the overlap ratio
 * (`overlap_ratio_v1`) on the real one, which is not Isogon's model.
 */
function viewsFor(simulated: boolean): ReadonlyArray<{ id: CalendarView; label: string }> {
  return [
    { id: 'record', label: simulated ? 'Isogon record' : 'Harmonized' },
    { id: 'combined', label: 'Raw combined' },
    { id: 'modis', label: 'Raw MODIS' },
    { id: 'viirs', label: simulated ? 'Raw VIIRS' : 'Raw Suomi NPP' },
  ];
}

const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "2021-08-03" or "2021-07-22T20:34:00Z" as "3 August 2021". */
export function dayLabel(start: string): string {
  const [y, m, d] = start.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

const CELL_W = 16;
const CELL_H = 6;
const GAP = 1.5;

function monthsBetween(a: string, b: string, all: readonly string[]): string[] {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return all.filter((ym) => ym >= lo && ym <= hi);
}

export interface CalendarArea {
  name: string;
  lat: number;
  lon: number;
}

/** The real run on the stage, the one being requested, and the last request that failed. */
export interface CalendarRunState {
  realStart: string | null;
  pendingStart: string | null;
  failed: { start: string; message: string } | null;
}

interface BurningCalendarProps {
  apiBase: string;
  regionId: string;
  area: CalendarArea;
  calendar: CalendarState;
  run: CalendarRunState;
  /** The month the terrain shows ("2026-08"), from the run's passes. */
  stageMonth: string | null;
  selectedMonth: string | null;
  onSelectMonth: (ym: string) => void;
  /** Open the sheet that gets any area's record; absent inside that sheet. */
  onOpenArea?: () => void;
  /**
   * This calendar stands in, as demo data, for a place no route serves. Its tag then reads "Demo data" and there is
   * no CSV, since the rows are another place's.
   */
  standIn?: boolean;
}

export function BurningCalendar({
  apiBase,
  regionId,
  area,
  calendar,
  run,
  stageMonth,
  selectedMonth,
  onSelectMonth,
  onOpenArea,
  standIn = false,
}: BurningCalendarProps) {
  const areaButton = onOpenArea ? (
    <button type="button" className="iso-key iso-cal__area" onClick={onOpenArea}>
      <span>Any area</span>
    </button>
  ) : null;
  const { cal, state, runStarts } = calendar;
  const [view, setView] = useState<CalendarView>('record');
  const [hover, setHover] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const allMonths = useMemo(() => (cal ? cal.months.map((m) => m.yearMonth) : []), [cal]);
  // The selection, else the month on the stage, else the calendar's last month (the real record ends 2025-12).
  const focus =
    selectedMonth && allMonths.includes(selectedMonth)
      ? selectedMonth
      : stageMonth && allMonths.includes(stageMonth)
        ? stageMonth
        : (allMonths.at(-1) ?? null);
  const selection = useMemo(
    () => (focus ? (anchor ? monthsBetween(anchor, focus, allMonths) : [focus]) : []),
    [anchor, focus, allMonths],
  );

  if (state !== 'ready' || !cal) {
    return (
      <div className="iso-cal">
        <p className="iso-cal__empty">
          {state === 'loading'
            ? 'Loading the monthly record.'
            : `No NASA FIRMS record for ${area.name} yet; its fire is simulated.`}
        </p>
        {state !== 'loading' && areaButton}
      </div>
    );
  }

  const covers =
    !cal.bbox ||
    (area.lon >= cal.bbox[0] && area.lon <= cal.bbox[2] && area.lat >= cal.bbox[1] && area.lat <= cal.bbox[3]);
  // Simulated: "Northern California, Feather River / Plumas Corridor". Real: "Feather River & Plumas, CA".
  const calName =
    (cal.simulated
      ? cal.regionName.split(',')[1]?.trim().split('/')[0]?.trim()
      : cal.regionName.split(',')[0]?.trim()) || cal.regionName;
  const views = viewsFor(cal.simulated);
  // The run a month opens is the one App requests for it (realRuns.ts startForMonth), so the note names the same.
  const startIn = (ym: string | null) => {
    if (!ym) return null;
    const month = cal.months.find((m) => m.yearMonth === ym);
    const start = startForMonth(ym, runStarts, cal.defaultStart) ?? (cal.simulated ? null : startBeforeSharp(ym, month?.modis ?? null));
    return start ? { start } : null;
  };
  // Before 2012 a month's run is the estimate from MODIS alone
  const alone = (start: string) => (start < '2012-01' ? ', from MODIS alone' : '');
  const runMonths = new Set(runStarts.map((s) => s.start.slice(0, 7)).filter((ym) => allMonths.includes(ym)));

  const years = cal.lastYear - cal.firstYear + 1;
  const vbW = years * (CELL_W + GAP) - GAP;
  const vbH = 12 * (CELL_H + GAP) - GAP;
  const classes = classesFor(cal, view);
  const baseName = classes?.base === 'combined' ? 'raw combined' : cal.simulated ? "Isogon record's" : 'harmonized';
  const hasZero = cal.months.some((m) => valueOf(m, view) === 0);
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

  const csvUrl = cal.simulated ? null : rowsCsvUrl(apiBase, cal.regionId || regionId, selection);
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

  // Real calendar: the record's interval is shown with how often it held on held-out months, never bare.
  const held = !cal.simulated && view === 'record' ? cal.intervalHeldMonths : null;
  const shownCounts = shown ? (cal.months.find((m) => m.yearMonth === shown)?.counts ?? null) : null;

  // One line under the readout, the most specific that applies.
  const shownStart = startIn(shown);
  const note = !covers
    ? `No monthly record for ${area.name} yet; this is ${calName}.`
    : shownStart && run.failed?.start === shownStart.start
      ? `No FIRMS run from ${dayLabel(shownStart.start)}: ${run.failed.message}.`
      : shownStart && run.pendingStart === shownStart.start
        ? `Loading the FIRMS run from ${dayLabel(shownStart.start)}.`
        : shownStart && run.realStart === shownStart.start
          ? `The terrain shows the FIRMS run from ${dayLabel(shownStart.start)}${alone(shownStart.start)}.`
          : shownStart
            ? shownStart.start < '2012-01'
              ? `Before 2012 only MODIS flew. Select the month to see its estimate from ${dayLabel(shownStart.start)}.`
              : `A FIRMS run starts ${dayLabel(shownStart.start)}. Select the month to load it.`
            : focus && stageMonth && focus !== stageMonth
              ? run.realStart
                ? `The terrain shows the FIRMS run from ${dayLabel(run.realStart)}${alone(run.realStart)}.`
                : `The terrain shows simulated passes from ${monthLabel(stageMonth)}.`
              : null;

  return (
    <div className="iso-cal">
      <div className="iso-cal__bar">
        <div className="iso-choice" role="group" aria-label="Calendar view">
          {views.map((v) => (
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
              // No sensor, or a month still to come: nothing drawn.
              if (v === null) return null;
              // The sensor delivered and saw nothing: a hollow cell, not the lowest colour.
              if (v === 0) {
                return (
                  <rect
                    key={m.yearMonth}
                    className="iso-cal__zero"
                    x={(m.year - cal.firstYear) * (CELL_W + GAP) + 0.5}
                    y={(m.month - 1) * (CELL_H + GAP) + 0.5}
                    width={CELL_W - 1}
                    height={CELL_H - 1}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              }
              return (
                <rect
                  key={m.yearMonth}
                  x={(m.year - cal.firstYear) * (CELL_W + GAP)}
                  y={(m.month - 1) * (CELL_H + GAP)}
                  width={CELL_W}
                  height={CELL_H}
                  fill={RAMP[classOf(v, classes)]}
                />
              );
            })}
            {[...runMonths].map((ym) => {
              const [y, m] = ym.split('-').map(Number);
              const x = (y - cal.firstYear) * (CELL_W + GAP);
              const top = (m - 1) * (CELL_H + GAP);
              // A notch cut from the cell's top left in the background colour: visible on every ramp step.
              return <path key={`run-${ym}`} className="iso-cal__run" d={`M${x} ${top}h5l-5 ${CELL_H * 0.75}z`} />;
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
        <div className="iso-cal__scalerow">
          <svg className="iso-cal__ramp" viewBox="0 0 9 1" preserveAspectRatio="none" aria-hidden="true">
            {RAMP.map((c, i) => (
              <rect key={c} x={i} width={0.84} height={1} fill={c} />
            ))}
          </svg>
          <span className="iso-cal__scale">
            {classes
              ? `Seven equal shares of the ${baseName} months, then the top 10% (above ${formatValue(classes.p90)}) and the top 2% (above ${formatValue(classes.p98)}). ${sentence(cal.units[view])}.`
              : `${sentence(cal.units[view])}.`}
          </span>
        </div>

        {/* One edge: the grid's left edge, shared with the scale above and the readout below. */}
        <div className="iso-cal__source">
          <span className="iso-cal__tag" data-source={standIn ? 'demo' : cal.simulated ? 'simulated' : 'firms'}>
            {standIn ? 'Demo data' : cal.simulated ? 'Simulated' : 'NASA FIRMS'}
          </span>
          {selection.length > 0 && !standIn &&
            (csvUrl ? (
              <a
                className="iso-key iso-cal__csv"
                href={csvUrl}
                download
                title="The NASA FIRMS detections behind the selection, every source column"
              >
                <kbd>CSV</kbd>
                <span>{selection.length === 1 ? monthLabel(selection[0]) : `${selection.length} months`}</span>
              </a>
            ) : (
              <button type="button" className="iso-key iso-cal__csv" onClick={download}>
                <kbd>CSV</kbd>
                <span>{selection.length === 1 ? monthLabel(selection[0]) : `${selection.length} months`}</span>
              </button>
            ))}
          {areaButton}
          {hasZero && (
            <span className="iso-cal__runkey">
              <svg viewBox={`0 0 ${CELL_W} ${CELL_H}`} aria-hidden="true">
                <rect className="iso-cal__zero" x={0.5} y={0.5} width={CELL_W - 1} height={CELL_H - 1} vectorEffect="non-scaling-stroke" />
              </svg>
              None detected
            </span>
          )}
          {runMonths.size > 0 && (
            <span className="iso-cal__runkey">
              <svg viewBox={`0 0 ${CELL_W} ${CELL_H}`} aria-hidden="true">
                <rect width={CELL_W} height={CELL_H} fill={RAMP[6]} />
                <path className="iso-cal__run" d={`M0 0h5l-5 ${CELL_H * 0.75}z`} />
              </svg>
              Real run
            </span>
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
                <th
                  scope="col"
                  title={
                    held !== null
                      ? `The p10 to p90 range of the yearly overlap ratios held the true value in ${Math.round(held * 100)}% of held-out months, against 80% nominal.`
                      : undefined
                  }
                >
                  {held !== null ? `p10 to p90, held ${Math.round(held * 100)}%` : 'p10 to p90'}
                </th>
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
          {shownCounts && (
            <p className="iso-cal__counts">
              {shownCounts.length === 0
                ? 'No platform delivered data this month.'
                : `Detections: ${shownCounts.map((c) => `${c.platform} ${c.total.toLocaleString('en-US')}`).join(', ')}`}
            </p>
          )}
        </div>
      )}

      {note && <p className="iso-cal__note">{note}</p>}
    </div>
  );
}
