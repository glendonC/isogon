import { MONTH_NAMES } from '../content/calendar';
import { pct, type BlindScore } from '../content/realRuns';

/** A UTC span in words: "3 to 8 August 2021", "30 July to 8 August 2021", or one day. */
function utcSpan(a: string, b: string): string {
  const [y1, m1, d1] = a.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = b.slice(0, 10).split('-').map(Number);
  if (y1 === y2 && m1 === m2) return d1 === d2 ? `${d1} ${MONTH_NAMES[m1 - 1]} ${y1}` : `${d1} to ${d2} ${MONTH_NAMES[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${MONTH_NAMES[m1 - 1]} to ${d2} ${MONTH_NAMES[m2 - 1]} ${y1}`;
  return `${d1} ${MONTH_NAMES[m1 - 1]} ${y1} to ${d2} ${MONTH_NAMES[m2 - 1]} ${y2}`;
}

const HEADS: ReadonlyArray<{ key: keyof BlindScore['rows'][number]; ids: string[]; label: string }> = [
  { key: 'hitRate', ids: ['hit_rate'], label: 'Hit rate' },
  { key: 'falseAlarmRatio', ids: ['false_alarm_ratio'], label: 'False alarms' },
  { key: 'frpError', ids: ['frp_median_abs_rel_error', 'frp_error'], label: 'FRP error' },
  { key: 'coverage', ids: ['interval_coverage', 'coverage'], label: 'In interval' },
];

/**
 * The blind test score of a real run, after the reveal (CONTRACT 8): Isogon beside the two baselines, plain
 * numbers, one line on what was hidden. Every value is the backend's; one it leaves out reads "not sent".
 */
export function BlindScoreTable({ score }: { score: BlindScore }) {
  const level = score.rows.find((r) => r.coverageLevel !== null)?.coverageLevel ?? null;
  const hidden = score.hidden.toLowerCase() === 'viirs' ? 'VIIRS' : score.hidden;
  const span = score.firstUtc && score.lastUtc ? `, ${utcSpan(score.firstUtc, score.lastUtc)}` : '';
  const count = score.overpasses !== null ? `, ${score.overpasses} overpasses` : '';

  return (
    <div className="iso-score">
      <table className="iso-table iso-score__table">
        <thead>
          <tr>
            <th scope="col">Blind test</th>
            {HEADS.map((h) => (
              <th key={h.key} scope="col" title={h.ids.map((id) => score.definitions[id]).find(Boolean)}>
                {h.key === 'coverage' && level !== null ? `In ${Math.round(level <= 1 ? level * 100 : level)}% interval` : h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {score.rows.map((r) => (
            <tr key={r.id} data-model={r.label === 'Isogon' ? 'true' : undefined}>
              <th scope="row">{r.label}</th>
              <td>{pct(r.hitRate)}</td>
              <td>{pct(r.falseAlarmRatio)}</td>
              <td>{pct(r.frpError)}</td>
              <td>{pct(r.coverage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="iso-score__line">
        Hidden from all three: NASA FIRMS {hidden}{count}{span}.
      </p>
    </div>
  );
}
