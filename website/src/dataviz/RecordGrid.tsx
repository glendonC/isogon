import { useState } from 'react';
import { CSS, MARK, estimateStep } from './tokens';
import { Frame } from './Frame';
import { grow } from './frameGeometry';
import { MONTHS_SHORT, cellLines, cellName, cellReadout, heldOutText } from './recordCells';
import type { HeldOut, RecordCell, RecordCells } from './recordCells';

export interface RecordGridProps {
  record: RecordCells;
  /** The picked month, "YYYY-MM": the frame rests on it. */
  selected?: string | null;
  onPick?: (ym: string) => void;
  /**
   * The prompt for a month where pressing it does something (the product lane's words, for example "Open the August
   * 2012 fire"); null where nothing happens, and the prompt is then the month's name.
   */
  actionFor?: (cell: RecordCell) => string | null;
  /** Draw the frame here; false when the screen mounts the identity's scene prompt on the box `onPoint` gives. */
  frame?: boolean;
  /** The month under the pointer (or the picked month when the pointer leaves) and its box on screen. */
  onPoint?: (cell: RecordCell | null, box: DOMRect | null) => void;
  /** A line under the grid, only when given (the held-out check lives in the Method sheet). */
  heldOut?: HeldOut | null;
  line?: string;
  /** Words of the legend and the satellite lines; the product lane's. */
  words?: { noFire: string; fewer: string; more: string; modis: string; viirs: string };
}

const DEFAULT_WORDS = { noFire: 'No fire', fewer: 'Fewer', more: 'More', modis: 'MODIS, 1 km', viirs: 'VIIRS, 375 m' };

/**
 * The fire record of a place: years across, months down, one cell a month on the white ramp of the estimate. No
 * fire is an empty outlined cell. The frame rests on the picked month and follows the pointer, with the month's
 * exact readout beside it. Under the grid, each satellite's span and a legend in words.
 */
export function RecordGrid({ record, selected, onPick, actionFor, frame = true, onPoint, heldOut, line, words = DEFAULT_WORDS }: RecordGridProps) {
  const [hover, setHover] = useState<string | null>(null);
  const pitch = MARK.cell + MARK.gap;
  const left = 44;
  const head = 82;
  const top = head;
  const years = record.lastYear - record.firstYear + 1;
  const gridW = years * pitch - MARK.gap;
  const gridH = 12 * pitch - MARK.gap;
  const axisY = top + gridH + 22;
  const satY = axisY + 40;
  const legendY = satY + 58;
  const width = left + gridW + 2;
  const height = legendY + 24;
  const x = (year: number) => left + (year - record.firstYear) * pitch;
  const y = (month: number) => top + (month - 1) * pitch;
  const monthX = (ym: string | null) => {
    if (!ym) return null;
    const [yy, mm] = ym.split('-').map(Number);
    return x(yy) + ((mm - 1) / 12) * MARK.cell;
  };
  const framed = record.cells.find((c) => c.ym === (hover ?? selected)) ?? null;
  const viirsX = monthX(record.firstViirsMonth);
  const lastX = left + gridW;
  const legendCell = 16;
  const text = line ?? (heldOut ? heldOutText(heldOut) : null);
  return (
    <div className="dv-figure">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="The fire record, one cell a month" className="dv-svg"
        onPointerLeave={() => {
          setHover(null);
          onPoint?.(record.cells.find((c) => c.ym === selected) ?? null, null);
        }}>
        {MONTHS_SHORT.map((m, i) => (
          <text key={m} x={left - 10} y={y(i + 1) + MARK.cell - 4} textAnchor="end" className="dv-label">
            {m}
          </text>
        ))}
        {record.cells.map((cell) => {
          const common = {
            className: 'dv-cell',
            onPointerEnter: (e: { currentTarget: Element }) => {
              setHover(cell.ym);
              onPoint?.(cell, e.currentTarget.getBoundingClientRect());
            },
            onClick: onPick ? () => onPick(cell.ym) : undefined,
            'aria-label': cellReadout(cell),
          };
          return cell.step === null ? (
            <rect key={cell.ym} {...common} x={x(cell.year) + 0.5} y={y(cell.month) + 0.5} width={MARK.cell - 1} height={MARK.cell - 1} fill="transparent" stroke={CSS.line} />
          ) : (
            <rect key={cell.ym} {...common} x={x(cell.year)} y={y(cell.month)} width={MARK.cell} height={MARK.cell} fill={estimateStep(cell.step, record.steps)} />
          );
        })}
        {Array.from({ length: years }, (_, i) => record.firstYear + i)
          .filter((yr) => (yr - record.firstYear) % 2 === 0)
          .map((yr) => (
            <text key={yr} x={x(yr) + MARK.cell / 2} y={axisY} textAnchor="middle" className="dv-label">
              {yr}
            </text>
          ))}
        <line x1={monthX(record.firstMonth) ?? left} x2={lastX} y1={satY} y2={satY} stroke={CSS.modis} strokeWidth={2} />
        <text x={monthX(record.firstMonth) ?? left} y={satY - 7} className="dv-label">
          {words.modis}
        </text>
        {viirsX !== null ? (
          <>
            <line x1={viirsX} x2={lastX} y1={satY + 26} y2={satY + 26} stroke={CSS.viirs} strokeWidth={2} />
            <text x={viirsX} y={satY + 19} className="dv-label">
              {words.viirs}
            </text>
          </>
        ) : null}
        <rect x={left + 0.5} y={legendY - legendCell + 3.5} width={legendCell - 1} height={legendCell - 1} fill="none" stroke={CSS.line} />
        <text x={left + legendCell + 8} y={legendY} className="dv-label">
          {words.noFire}
        </text>
        <text x={left + 130} y={legendY} className="dv-label">
          {words.fewer}
        </text>
        {Array.from({ length: record.steps }, (_, s) => (
          <rect key={s} x={left + 188 + s * (legendCell + 2)} y={legendY - legendCell + 3} width={legendCell} height={legendCell} fill={estimateStep(s, record.steps)} />
        ))}
        <text x={left + 188 + record.steps * (legendCell + 2) + 8} y={legendY} className="dv-label">
          {words.more}
        </text>
        {frame && framed ? (
          <Frame
            key={framed.ym}
            box={grow({ x: x(framed.year), y: y(framed.month), w: MARK.cell, h: MARK.cell }, 5)}
            bounds={{ w: width, h: height }}
            action={actionFor?.(framed) ?? cellName(framed)}
            readout={cellLines(framed)}
            maxChars={0}
            above={{ bottom: head - 14 }}
            leader={false}
          />
        ) : null}
      </svg>
      {text ? <p className="dv-line">{text}</p> : null}
    </div>
  );
}
