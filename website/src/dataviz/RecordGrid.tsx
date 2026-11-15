import type { PointerEvent as ReactPointerEvent } from 'react';
import { CSS, MARK, estimateStep } from './tokens';
import { ReadoutBox } from './Readout';
import { MONTHS_SHORT, cellReadout, heldOutText } from './recordCells';
import type { HeldOut, RecordCells } from './recordCells';

export interface RecordGridProps {
  record: RecordCells;
  /** The picked month, "YYYY-MM". */
  selected?: string | null;
  onPick?: (ym: string) => void;
  /** The line under the grid; by default the place's own held-out error. */
  heldOut?: HeldOut | null;
  line?: string;
  /** Words of the legend and the satellite lines; the product lane's. */
  words?: { noFire: string; fewer: string; more: string; modis: string; viirs: string };
}

const DEFAULT_WORDS = { noFire: 'No fire', fewer: 'Fewer', more: 'More', modis: 'MODIS, 1 km', viirs: 'VIIRS, 375 m' };

/**
 * The fire record of a place: years across, months down, one cell a month on the white ramp of the estimate.
 * No fire is an empty outlined cell. Under the grid, the span of each satellite and a legend in words; the exact
 * month follows the pointer.
 */
export function RecordGrid({ record, selected, onPick, heldOut, line, words = DEFAULT_WORDS }: RecordGridProps) {
  const pitch = MARK.cell + MARK.gap;
  const left = 44;
  const top = 4;
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
  const monthX = (ym: string | null, end = false) => {
    if (!ym) return null;
    const [yy, mm] = ym.split('-').map(Number);
    return x(yy) + (end ? MARK.cell : 0) + ((mm - 1) / 12) * MARK.cell;
  };
  const sel = selected ? record.cells.find((c) => c.ym === selected) : null;
  const viirsX = monthX(record.firstViirsMonth);
  const lastX = left + gridW;
  const legendCell = 16;
  const text = line ?? (heldOut ? heldOutText(heldOut) : null);
  return (
    <ReadoutBox label="The fire record, one cell a month">
      {({ show, hide }) => (
        <>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" style={{ display: 'block', maxWidth: '100%' }}>
            {MONTHS_SHORT.map((m, i) => (
              <text key={m} x={left - 10} y={y(i + 1) + MARK.cell - 4} textAnchor="end" className="dv-label">
                {m}
              </text>
            ))}
            {record.cells.map((cell) => {
              const cx = x(cell.year);
              const cy = y(cell.month);
              const move = (e: ReactPointerEvent) => show(cellReadout(cell), e);
              const pick = onPick ? () => onPick(cell.ym) : undefined;
              if (cell.step === null) {
                return (
                  <rect key={cell.ym} className="dv-cell" x={cx + 0.5} y={cy + 0.5} width={MARK.cell - 1} height={MARK.cell - 1}
                    fill="none" stroke={CSS.line} onPointerMove={move} onPointerLeave={hide} onClick={pick} />
                );
              }
              return (
                <rect key={cell.ym} className="dv-cell" x={cx} y={cy} width={MARK.cell} height={MARK.cell}
                  fill={estimateStep(cell.step, record.steps)} onPointerMove={move} onPointerLeave={hide} onClick={pick} />
              );
            })}
            {sel ? (
              <g stroke={CSS.ink} strokeWidth={2} fill="none">
                {[
                  [-3, -3, 1, 1], [MARK.cell + 3, -3, -1, 1], [-3, MARK.cell + 3, 1, -1], [MARK.cell + 3, MARK.cell + 3, -1, -1],
                ].map(([dx, dy, sx, sy], i) => {
                  const px = x(sel.year) + dx;
                  const py = y(sel.month) + dy;
                  return <path key={i} d={`M ${px} ${py + sy * 7} L ${px} ${py} L ${px + sx * 7} ${py}`} />;
                })}
              </g>
            ) : null}
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
            {(() => {
              const lx = left + 130;
              return (
                <>
                  <text x={lx} y={legendY} className="dv-label">
                    {words.fewer}
                  </text>
                  {Array.from({ length: record.steps }, (_, s) => (
                    <rect key={s} x={lx + 58 + s * (legendCell + 2)} y={legendY - legendCell + 3} width={legendCell} height={legendCell}
                      fill={estimateStep(s, record.steps)} />
                  ))}
                  <text x={lx + 58 + record.steps * (legendCell + 2) + 8} y={legendY} className="dv-label">
                    {words.more}
                  </text>
                </>
              );
            })()}
          </svg>
          {text ? <p className="dv-line">{text}</p> : null}
        </>
      )}
    </ReadoutBox>
  );
}
