import { Results, type ResultRow } from './Results';
import type { ScriptAction } from './script';
import '../styles/guide.css';

/**
 * The guide at the bottom: the state's standing sentences, shown together and left in place (there is no voice, so
 * the reader sets the pace), and at most three actions, the next step first and the only strong one. An action is
 * text; its key is a small quiet mark before the verb. At a round's end the results rows stand above the sentences,
 * as part of what the guide says.
 */
export function GuideStrip({
  lines,
  actions,
  onAction,
  results = null,
}: {
  lines: string[];
  actions: ScriptAction[];
  onAction: (command: string) => void;
  results?: { line: string; rows: ResultRow[] } | null;
}) {
  return (
    <div className="guide-strip" role="region" aria-label="Guide">
      {results && <Results line={results.line} rows={results.rows} />}
      <p className="guide-strip__line" aria-live="polite">
        {lines.join(' ')}
      </p>
      {actions.length > 0 && (
        <div className="guide-strip__acts">
          {actions.map((a, n) => (
            <button key={a.command + a.label} type="button" className={n === 0 ? 'guide-act guide-act--next' : 'guide-act'} onClick={() => onAction(a.command)}>
              {a.key && <span className="guide-key">{a.key}</span>}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
