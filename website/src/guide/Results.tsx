import type { ScriptResults } from './script';
import { fill, holds, type Conditions, type Fields } from './script';

export interface ResultRow {
  name: string;
  /** The gain as written ("+4.1"), and as a number for its bar. */
  value: string;
  gain: number;
  strong: boolean;
  note: string | null;
}

/** The rows of a round's end, read from the script: a row whose field has no value is left out. */
export function resultRows(results: ScriptResults | undefined, fields: Fields, gains: Record<string, number | null>, conds: Conditions): ResultRow[] {
  if (!results) return [];
  const rows: ResultRow[] = [];
  for (const r of results.rows) {
    const value = fields[r.field];
    const gain = gains[r.field];
    if (!value || gain === null || gain === undefined) continue;
    const noteShown = r.note && (r.note_if === undefined || holds({ if: r.note_if }, conds));
    rows.push({ name: r.name, value, gain, strong: Boolean(r.strong), note: noteShown ? fill(r.note!, fields) : null });
  }
  return rows;
}

/**
 * A round's end in the guide: one line, then a row per player on one scale, centred above the guide's sentence, the
 * visitor's row the strong one. A bar starts at zero; when a gain is below zero, zero stands in the middle.
 */
export function Results({ line, rows }: { line: string; rows: ResultRow[] }) {
  if (rows.length === 0) return null;
  const most = Math.max(...rows.map((r) => Math.abs(r.gain)), 1e-9);
  const below = rows.some((r) => r.gain < 0);
  const span = below ? 50 : 100;
  return (
    <div className="guide-results" role="table" aria-label={line}>
      {line && <p className="guide-results__line">{line}</p>}
      {rows.map((r) => {
        const w = (Math.abs(r.gain) / most) * span;
        const left = below ? (r.gain < 0 ? 50 - w : 50) : 0;
        return (
          <div key={r.name} className="guide-results__row" role="row" data-strong={r.strong ? 'true' : undefined}>
            <span className="guide-results__name" role="rowheader">
              {r.name}
            </span>
            <span className="guide-results__track" role="presentation">
              {below && <i className="guide-results__zero" />}
              <i className="guide-results__bar" style={{ left: `${left}%`, width: `${w}%` }} />
            </span>
            <span className="guide-results__value" role="cell">
              {r.value}
            </span>
            {r.note && (
              <span className="guide-results__note" role="cell">
                {r.note}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
