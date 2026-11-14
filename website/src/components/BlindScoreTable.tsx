import { plainNote } from './Debrief';
import {
  SCORE_NAMES,
  pct,
  platformName,
  utcSpan,
  type BlindMethod,
  type BlindTest,
  type ModelStatus,
} from '../content/realRuns';

/** What a row compares: the shown value, the value compared at the precision shown, and which way is better. */
interface Row {
  label: string;
  /** Definition ids in `blind_test.definitions`, first found is the row's title. */
  defs: string[];
  cell: (m: BlindMethod) => string;
  /** The value at the precision the cell shows, so "ahead" never names two equal-looking numbers. */
  compare: ((m: BlindMethod) => number | null) | null;
  better: 'higher' | 'lower';
}

const whole = (v: number | null) => (v === null ? null : Math.round(v * 100));

const ROWS: Row[] = [
  { label: 'Hit rate', defs: ['hit_rate'], cell: (m) => pct(m.hitRate), compare: (m) => whole(m.hitRate), better: 'higher' },
  {
    label: 'False alarms',
    defs: ['false_alarm_ratio'],
    cell: (m) => pct(m.falseAlarmRatio),
    compare: (m) => whole(m.falseAlarmRatio),
    better: 'lower',
  },
  {
    label: 'CSI within one cell',
    defs: ['tolerant_scores', 'csi'],
    cell: (m) => (m.csiOneCell === null ? 'not sent' : m.csiOneCell.toFixed(2)),
    compare: (m) => (m.csiOneCell === null ? null : Math.round(m.csiOneCell * 100)),
    better: 'higher',
  },
  { label: 'FRP error', defs: ['frp_total_error'], cell: (m) => pct(m.frpError), compare: (m) => whole(m.frpError), better: 'lower' },
  {
    label: 'In interval',
    defs: ['interval_coverage'],
    cell: (m) => (m.intervalCovered === null || m.intervalN === null ? 'none' : `${m.intervalCovered} of ${m.intervalN}`),
    compare: null,
    better: 'higher',
  },
];

const BASELINE_NAMES: Record<string, string> = {
  painted_modis: 'MODIS as detected',
  overlap_ratio: 'the overlap ratio',
  painted_viirs: 'VIIRS as detected',
  viirs_ratio: 'the VIIRS ratio',
};

const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Who is ahead on one row, in plain words: every row says it, including the rows where a baseline is ahead, so a
 * summary of the run's judged scores can never hide a row Isogon loses.
 */
function rowVerdict(row: Row, methods: BlindMethod[]): { text: string; isogonAhead: boolean } | null {
  const name = (m: BlindMethod) => (m.id === 'reconstruction' ? 'Isogon' : BASELINE_NAMES[m.id] ?? m.label);
  if (!row.compare) {
    // Intervals are not ranked: each method's coverage is read against the level it states.
    const stated = methods.filter((m) => m.intervalCovered !== null && m.intervalN !== null && m.intervalN > 0);
    if (stated.length === 0) return null;
    const held = (m: BlindMethod) =>
      (m.intervalCovered as number) / (m.intervalN as number) >= (m.intervalLevel ?? 0.9) - 1e-9;
    const short = stated.filter((m) => !held(m));
    if (short.length === 0) {
      return { text: stated.length > 1 ? 'Every stated interval held' : `${sentence(name(stated[0]))}'s interval held`, isogonAhead: false };
    }
    const kept = stated.filter(held).map(name).join(' and ');
    const missed = short.map(name).join(' and ');
    return { text: sentence(kept ? `${kept} held; ${missed} fell short` : `${missed} fell short`), isogonAhead: false };
  }
  const vals = methods
    .map((m) => ({ m, v: row.compare?.(m) ?? null }))
    .filter((x): x is { m: BlindMethod; v: number } => x.v !== null);
  if (vals.length < 2) return null;
  const best = row.better === 'higher' ? Math.max(...vals.map((x) => x.v)) : Math.min(...vals.map((x) => x.v));
  const winners = vals.filter((x) => x.v === best).map((x) => x.m);
  const isogon = winners.some((m) => m.id === 'reconstruction');
  if (winners.length === vals.length) return { text: 'All three tie', isogonAhead: false };
  if (isogon && winners.length === 1) return { text: 'Isogon ahead', isogonAhead: true };
  if (isogon) {
    return { text: `Isogon ties ${winners.filter((m) => m.id !== 'reconstruction').map(name).join(' and ')}`, isogonAhead: false };
  }
  const both = winners.length === 2 && winners.every((m) => m.id in BASELINE_NAMES);
  return { text: both ? 'Both baselines ahead' : sentence(`${winners.map(name).join(' and ')} ahead`), isogonAhead: false };
}

/** Shown for a block whose `blind_test.protocol.version` is absent or below 2. */
const FIRST_PROTOCOL =
  'Scored under the first test protocol, in which the hidden satellite influenced which passes were tested. It has not been scored under the current protocol.';

/**
 * The blind test of a real run, after the reveal: Isogon beside the two baselines, plain numbers, who is ahead on
 * each row, the state of the test protocol, what was hidden, and the model's own status and per-part verdicts as the
 * backend states them.
 */
export function BlindScoreTable({
  score,
  model,
  corner = 'Blind run',
  hiddenText,
}: {
  score: BlindTest;
  model: ModelStatus | null;
  /** The table's corner cell. */
  corner?: string;
  /** Replaces the line saying what was hidden, for a test that hides another instrument (Terra's morning pass). */
  hiddenText?: string;
}) {
  const level = score.methods.find((m) => m.intervalLevel !== null)?.intervalLevel ?? null;
  const ahead = score.verdict.filter((v) => v.ahead).map((v) => SCORE_NAMES[v.id] ?? v.id.replace(/_/g, ' '));
  const behind = score.verdict.filter((v) => !v.ahead).map((v) => SCORE_NAMES[v.id] ?? v.id.replace(/_/g, ' '));
  const hidden = score.hiddenPlatforms.length > 0 ? score.hiddenPlatforms.map(platformName).join(' and ') : 'VIIRS';
  const span = score.firstUtc && score.lastUtc ? `, ${utcSpan(score.firstUtc, score.lastUtc)}` : '';
  const count = score.scoredOverpasses !== null ? `, ${score.scoredOverpasses} overpasses` : '';
  const corrected = score.protocolVersion !== null && score.protocolVersion >= 2;

  return (
    <div className="iso-score">
      <table className="iso-table iso-score__table">
        <thead>
          <tr>
            <th scope="col">{corner}</th>
            {score.methods.map((m) => (
              <th key={m.id} scope="col" data-model={m.id === 'reconstruction' ? 'true' : undefined}>
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const v = rowVerdict(row, score.methods);
            const title = row.defs.map((d) => score.definitions[d]).find(Boolean);
            return (
              <tr key={row.label}>
                <th scope="row" title={title}>
                  {row.label === 'In interval' && level !== null ? `In ${Math.round(level * 100)}% interval` : row.label}
                  {v && (
                    <span className="iso-score__verdict" data-ahead={String(v.isogonAhead)}>
                      {v.text}
                    </span>
                  )}
                </th>
                {score.methods.map((m) => (
                  <td
                    key={m.id}
                    data-model={m.id === 'reconstruction' ? 'true' : undefined}
                    title={row.label === 'In interval' && m.intervalLevel === null ? 'This method states no interval.' : undefined}
                  >
                    {row.cell(m)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="iso-score__line iso-score__protocol" data-corrected={corrected ? 'true' : 'false'}>
        {corrected ? (score.protocolNote ? sentence(plainNote(score.protocolNote)) : `Test protocol version ${score.protocolVersion}.`) : FIRST_PROTOCOL}
      </p>
      <p className="iso-score__line">
        {hiddenText ?? (
          <>
            Hidden in the blind run: NASA FIRMS VIIRS from {hidden}
            {count}
            {span}.
          </>
        )}
      </p>
      {score.verdict.length > 0 && (
        <p className="iso-score__line">
          Of the {score.verdict.length} scores the run judges, Isogon is ahead of both baselines on {ahead.length}
          {ahead.length > 0 ? ` (${ahead.join(', ')})` : ''}
          {behind.length > 0 ? ` and not on ${behind.join(', ')}` : ''}.
        </p>
      )}

      {model && (
        <div className="iso-score__model">
          <p className="iso-score__status">
            Model <strong>{model.status}</strong>
            {model.parts.length > 0 ? '. Its parts, as the backend states them:' : '.'}
          </p>
          {model.parts.length > 0 && (
            <table className="iso-table iso-score__parts">
              <tbody>
                {model.parts.map((p) => (
                  <tr key={p.name} data-status={p.status}>
                    <th scope="row">{p.name.charAt(0).toUpperCase() + p.name.slice(1)}</th>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
