import { useEffect, useState } from 'react';
import type { ScriptAction } from './script';
import '../styles/guide.css';

/** How long a line stays before the next of the same state, ms. The last line stays. */
const LINE_MS = 7000;

/**
 * The guide at the bottom: the state's lines, said in turn with the last one staying, and at most three actions, the
 * next step first and the only strong one. An action is text; its key is a small quiet mark before the verb.
 */
export function GuideStrip({
  stateKey,
  lines,
  actions,
  onAction,
}: {
  stateKey: string;
  lines: string[];
  actions: ScriptAction[];
  onAction: (command: string) => void;
}) {
  const [shown, setShown] = useState({ key: stateKey, i: 0 });
  const i = shown.key === stateKey ? shown.i : 0;
  useEffect(() => {
    if (shown.key !== stateKey) setShown({ key: stateKey, i: 0 });
  }, [stateKey, shown.key]);
  useEffect(() => {
    if (i >= lines.length - 1) return;
    const t = window.setTimeout(() => setShown({ key: stateKey, i: i + 1 }), LINE_MS);
    return () => window.clearTimeout(t);
  }, [i, lines.length, stateKey]);

  const line = lines[Math.min(i, lines.length - 1)] ?? null;
  return (
    <div className="guide-strip" role="region" aria-label="Guide">
      <p className="guide-strip__line" aria-live="polite">
        {line}
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
