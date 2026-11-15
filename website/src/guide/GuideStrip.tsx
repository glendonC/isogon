import { Fragment } from 'react';
import { Results, type ResultRow } from './Results';
import type { ScriptAction } from './script';
import '../styles/guide.css';

/**
 * The guide at the bottom: the state's standing sentences, shown together and left in place (there is no voice, so
 * the reader sets the pace), and at most three directives, the next step first and strong with its cut-out keycap.
 * At a round's end the results rows stand above the sentences, as part of what the guide says.
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
      {/* Each standing sentence in a span of its own (the film presentation keeps the first); read as one line. */}
      <p className="guide-strip__line" aria-live="polite">
        {lines.map((line, n) => (
          <Fragment key={n}>
            {n > 0 && ' '}
            <span className="guide-strip__sentence">{line}</span>
          </Fragment>
        ))}
      </p>
      {actions.length > 0 && (
        <div className="guide-strip__acts">
          {actions.map((a, n) => (
            <button
              key={a.command + a.label}
              type="button"
              className={n === 0 ? 'guide-act guide-act--next' : a.quiet ? 'guide-act guide-act--quiet' : 'guide-act'}
              onClick={() => onAction(a.command)}
            >
              {a.key && <kbd className="guide-key">{a.key}</kbd>}
              <span className="guide-act__label">{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
