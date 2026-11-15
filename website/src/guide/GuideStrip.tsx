import { useEffect, useState } from 'react';
import { Control } from '../identity/Control';
import { Results, type ResultRow } from './Results';
import type { ScriptAction } from './script';
import '../styles/guide.css';

/** The page's own words for the toggle, until the script has them. */
const MORE = 'Read more';
const LESS = 'Less';

/**
 * The guide in the identity's places: at the bottom left the screen's title and one line (the rest of what the state
 * says one press away, never dropped), at the bottom right at most two controls, the next step first. Every other
 * action keeps its key. At a round's end the results rows stand above the title.
 */
export function GuideStrip({
  title = null,
  lines,
  more = [],
  actions,
  onAction,
  results = null,
}: {
  title?: string | null;
  lines: string[];
  /** What the state says on demand (the script's `more`), opened in place with the rest. */
  more?: string[];
  actions: ScriptAction[];
  onAction: (command: string) => void;
  results?: { line: string; rows: ResultRow[] } | null;
}) {
  const [first, ...standingRest] = lines;
  const rest = [...standingRest, ...more];
  const [open, setOpen] = useState(false);
  const said = lines.join(' ');
  useEffect(() => setOpen(false), [said]);
  // The next step, and the first action after it that is not quiet: no more than two stand.
  const shown = actions.filter((a, n) => n === 0 || !a.quiet).slice(0, 2);
  return (
    <div className="guide-strip" role="region" aria-label="Guide">
      <div className="guide-say">
        {results && <Results line={results.line} rows={results.rows} />}
        {title && <h2 className="guide-say__title">{title}</h2>}
        {first && (
          <p className="guide-say__line" aria-live="polite">
            {first}
          </p>
        )}
        {rest.length > 0 && open && <p className="guide-say__more">{rest.join(' ')}</p>}
        {rest.length > 0 && (
          <button type="button" className="guide-say__toggle" aria-expanded={open} onClick={() => setOpen((m) => !m)}>
            {open ? LESS : MORE}
          </button>
        )}
      </div>
      {shown.length > 0 && (
        <div className="guide-acts">
          {[...shown].reverse().map((a) => (
            <Control
              key={a.command + a.label}
              variant={a === shown[0] ? 'primary' : 'secondary'}
              shortcut={a.key ?? undefined}
              onClick={() => onAction(a.command)}
            >
              {a.label}
            </Control>
          ))}
        </div>
      )}
    </div>
  );
}
