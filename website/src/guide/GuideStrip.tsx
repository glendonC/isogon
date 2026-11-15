import type { ScriptAction } from './script';
import '../styles/guide.css';

/**
 * The guide at the bottom: the state's standing sentences, shown together and left in place (there is no voice, so
 * the reader sets the pace), and at most three actions, the next step first and the only strong one. An action is
 * text; its key is a small quiet mark before the verb.
 */
export function GuideStrip({ lines, actions, onAction }: { lines: string[]; actions: ScriptAction[]; onAction: (command: string) => void }) {
  return (
    <div className="guide-strip" role="region" aria-label="Guide">
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
