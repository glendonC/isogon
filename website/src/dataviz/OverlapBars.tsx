import { useState } from 'react';
import { CSS, MARK } from './tokens';
import { Frame } from './Frame';
import { overlapAxisMax } from './overlapRows';
import type { Overlap } from './overlapRows';
import { useCount } from './useCount';

export interface OverlapBarsProps {
  overlap: Overlap;
  width?: number;
  /** Title, the line under the chart and the two bar names; the product lane's words. */
  words?: { title: string; line: string; exact: string; within: string };
}

const DEFAULT_WORDS = {
  title: 'Overlap with VIIRS fire pixels',
  line: 'Pixels both mark as fire, out of pixels either marks as fire. Higher is better.',
  exact: 'Exact',
  within: 'Within 1 pixel',
};

function Figure({ value, x, y }: { value: number; x: number; y: number }) {
  const shown = useCount(value * 100);
  return (
    <text x={x} y={y} className="dv-num">
      {shown.toFixed(1)}%
    </text>
  );
}

/**
 * One axis, two bars a method: exact (filled) and within one pixel (outlined), the number at each bar's end.
 * MODIS alone is the grey reference, then the model in use and the new model in white.
 */
export function OverlapBars({ overlap, width = 860, words = DEFAULT_WORDS }: OverlapBarsProps) {
  const [hover, setHover] = useState<string | null>(null);
  const labelW = 150;
  const numW = 64;
  const readoutW = Math.round(Math.min(290, width * 0.3));
  const axisW = width - labelW - numW - readoutW;
  const max = overlapAxisMax(overlap.rows) / 100;
  const sx = (v: number) => labelW + (v / max) * axisW;
  const keyY = 18;
  const top = 46;
  const group = MARK.bar * 2 + 6 + 26;
  const axisY = top + overlap.rows.length * group;
  const height = axisY + 26;
  const step = max <= 0.4 ? 0.1 : 0.2;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => Math.round(i * step * 100) / 100);
  return (
    <div className="dv-figure">
      <p className="dv-title">{words.title}</p>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={words.title} className="dv-svg"
        onPointerLeave={() => setHover(null)}>
            <rect x={labelW} y={keyY - 12} width={14} height={12} fill={CSS.ink} />
            <text x={labelW + 22} y={keyY} className="dv-label">
              {words.exact}
            </text>
            <rect x={labelW + 92.75} y={keyY - 11.25} width={12.5} height={10.5} fill="none" stroke={CSS.ink} strokeWidth={MARK.stroke} />
            <text x={labelW + 114} y={keyY} className="dv-label">
              {words.within}
            </text>
            {ticks.map((t) => (
              <line key={t} x1={sx(t)} x2={sx(t)} y1={top - 8} y2={axisY - 6} stroke={CSS.line} />
            ))}
            {overlap.rows.map((row, i) => {
              const y = top + i * group;
              const colour = row.key === 'modis' ? CSS.reference : CSS.ink;
              const tip = `${row.label}: ${(row.exact * 100).toFixed(1)}% exact, ${(row.within * 100).toFixed(1)}% within 1 pixel`;
              return (
                <g key={row.key} onPointerEnter={() => setHover(row.key)} aria-label={tip}>
                  <rect x={0} y={y - 4} width={width} height={group - 10} fill="transparent" />
                  <text x={0} y={y + MARK.bar + 4} className="dv-label" style={{ fill: row.key === 'modis' ? CSS.ink2 : CSS.ink }}>
                    {row.label}
                  </text>
                  <rect x={labelW} y={y} width={Math.max(1, sx(row.exact) - labelW)} height={MARK.bar} fill={colour} />
                  <Figure value={row.exact} x={sx(row.exact) + 8} y={y + MARK.bar - 1} />
                  <rect x={labelW + MARK.stroke / 2} y={y + MARK.bar + 6 + MARK.stroke / 2} width={Math.max(1, sx(row.within) - labelW - MARK.stroke)}
                    height={MARK.bar - MARK.stroke} fill="none" stroke={colour} strokeWidth={MARK.stroke} />
                  <Figure value={row.within} x={sx(row.within) + 8} y={y + 2 * MARK.bar + 5} />
                </g>
              );
            })}
            {ticks.map((t) => (
              <text key={t} x={sx(t)} y={axisY + 14} textAnchor="middle" className="dv-label">
                {Math.round(t * 100)}%
              </text>
            ))}
            {(() => {
              const i = overlap.rows.findIndex((r) => r.key === hover);
              if (i < 0) return null;
              const row = overlap.rows[i];
              const y = top + i * group;
              const right = sx(Math.max(row.exact, row.within)) + numW;
              return (
                <Frame key={row.key} box={{ x: labelW - 10, y: y - 8, w: right - labelW + 10, h: 2 * MARK.bar + 22 }} bounds={{ w: width, h: height }}
                  readout={[row.label, `${(row.exact * 100).toFixed(1)}% exact`, `${(row.within * 100).toFixed(1)}% within 1 pixel`]} maxChars={20} />
              );
            })()}
      </svg>
      <p className="dv-line">{words.line}</p>
    </div>
  );
}
