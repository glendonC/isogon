import type { PointerEvent as ReactPointerEvent } from 'react';
import { CSS, MARK } from './tokens';
import { ReadoutBox } from './Readout';
import { countedOf, yearReadout } from './yearSeries';
import type { YearSeries } from './yearSeries';

export interface YearBarsProps {
  series: YearSeries;
  width?: number;
  height?: number;
  /** Draw the years only up to this one (the story playing); the scale stays that of every year. */
  upTo?: number | null;
  /** Show each year on one scale as a white outline, the estimate. */
  oneScale?: boolean;
  /** The year picked or playing, labelled under its bar. */
  current?: number | null;
}

/**
 * Detections each year: orange bars where MODIS counted, light blue from VIIRS's first year, so the jump of 2012 is
 * the change of satellite. On one scale, each year's estimate is a white outline over its bar.
 */
export function YearBars({ series, width = 700, height = 150, upTo = null, oneScale = false, current = null }: YearBarsProps) {
  const { years, firstViirsYear } = series;
  const base = height - 30;
  const n = years.length;
  const pitch = width / n;
  const bar = Math.max(4, pitch - Math.max(3, pitch * 0.18));
  const max = Math.max(
    1,
    ...years.map((p) => countedOf(p, firstViirsYear).value ?? 0),
    ...(oneScale ? years.map((p) => p.oneScale ?? 0) : []),
  );
  const sy = (v: number) => base - (v / max) * (base - 8);
  const shown = years.filter((p) => upTo === null || p.year <= upTo);
  const labelled = new Set([years[0]?.year, firstViirsYear, years[n - 1]?.year, current].filter((y): y is number => typeof y === 'number'));
  return (
    <ReadoutBox label="Fire detections each year">
      {({ show, hide }) => (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" style={{ display: 'block', maxWidth: '100%' }}>
          {shown.map((p) => {
            const i = years.indexOf(p);
            const x = i * pitch + (pitch - bar) / 2;
            const c = countedOf(p, firstViirsYear);
            const colour = c.by === 'viirs' ? CSS.viirs : CSS.modis;
            const move = (e: ReactPointerEvent) => show(yearReadout(p, firstViirsYear), e);
            return (
              <g key={p.year} onPointerMove={move} onPointerLeave={hide}>
                <rect x={i * pitch} y={0} width={pitch} height={base} fill="transparent" />
                {c.value !== null ? (
                  p.partial ? (
                    <rect x={x + 0.75} y={sy(c.value) + 0.75} width={bar - 1.5} height={Math.max(1, base - sy(c.value) - 1.5)}
                      fill="none" stroke={colour} strokeWidth={MARK.stroke} />
                  ) : (
                    <rect x={x} y={sy(c.value)} width={bar} height={Math.max(1, base - sy(c.value))} fill={colour} />
                  )
                ) : null}
                {oneScale && p.oneScale !== null && !p.partial ? (
                  <rect x={x + 0.75} y={sy(p.oneScale) + 0.75} width={bar - 1.5} height={Math.max(1, base - sy(p.oneScale) - 1.5)}
                    fill="none" stroke={CSS.estimate} strokeWidth={MARK.stroke} />
                ) : null}
              </g>
            );
          })}
          <line x1={0} x2={width} y1={base + 0.5} y2={base + 0.5} stroke={CSS.line} />
          {years.map((p, i) =>
            labelled.has(p.year) ? (
              <text key={p.year} x={i * pitch + pitch / 2} y={base + 22} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                className="dv-label" style={p.year === current ? { fill: CSS.ink } : undefined}>
                {p.year}
              </text>
            ) : null,
          )}
        </svg>
      )}
    </ReadoutBox>
  );
}
