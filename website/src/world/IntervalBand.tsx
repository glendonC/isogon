import '../styles/world.css';

/**
 * The band of the Record's interval, small enough to lay on a month or a year: a line of the rate's scale, the band
 * from the low end to the high end of the interval, and a tick at the figure itself, with the two ends in words and,
 * where the answer gives it, how often the band held the figure of a year left out of the fit. It reads nothing
 * itself: the Record's view hands it the figures of the month or year it sits on.
 */

export interface IntervalBandProps {
  value: number;
  low: number;
  high: number;
  /** The rate's unit in plain words, as the Record says it. */
  unit: string;
  /** The interval's level as a share, 0.8 for the middle 80 percent. */
  level?: number | null;
  /** How often the band held the figure of a year left out: held of tested. */
  held?: { held: number; of: number; what?: 'years' | 'months' } | null;
  /** The top of the scale; the high end with room above it when left out. */
  scaleMax?: number | null;
  /** Words only for the ends, for a narrow label. */
  compact?: boolean;
}

const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));

export const BAND_WORDS = {
  ends: (lo: number, hi: number, unit: string) => `${fmt(lo)} to ${fmt(hi)} ${unit}`,
  level: (level: number) => `with the old satellite scaled as in a low or a high year of the overlap, the middle ${Math.round(level * 100)} percent of years`,
  held: (h: number, of: number, what: string, level: number | null) =>
    `Tested by leaving out one ${what === 'months' ? 'month' : 'year'} at a time, the band held its figure in ${h} of ${of} ${what}.${level ? ` It is meant to hold about ${Math.round(level * 10)} in 10.` : ''}`,
};

export function IntervalBand({ value, low, high, unit, level = 0.8, held = null, scaleMax = null, compact = false }: IntervalBandProps) {
  const top = scaleMax ?? Math.max(high, value) * 1.25;
  const at = (v: number) => `${Math.min(Math.max(v / (top || 1), 0), 1) * 100}%`;
  return (
    <div className="world-band" role="img" aria-label={`${fmt(value)} ${unit}, ${BAND_WORDS.ends(low, high, unit)}`}>
      <div className="world-band__scale">
        <span className="world-band__rail" />
        <span className="world-band__range" style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }} />
        <span className="world-band__tick" style={{ left: at(value) }} />
      </div>
      <div className="world-band__words">
        <span>{BAND_WORDS.ends(low, high, unit)}</span>
        {!compact && level !== null && <span className="world-band__fine">{BAND_WORDS.level(level)}</span>}
      </div>
      {!compact && held && <div className="world-band__fine">{BAND_WORDS.held(held.held, held.of, held.what ?? 'years', level)}</div>}
    </div>
  );
}
