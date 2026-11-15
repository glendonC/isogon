import { WORDS } from './words.ts';
import './identity.css';

export interface Move {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Why it cannot be taken now, said to readers and on hover. */
  reason?: string | null;
}

export interface MovesProps {
  /** One level back, named ("Back to the Earth"). Escape does the same; the screen's own key handling runs it. */
  back?: Move | null;
  /** The places one level on or beside, by their names, at most three. */
  onward?: Move[];
}

/**
 * The bottom edge while the visitor goes by themselves (the story line stands there only while Play runs): at the left
 * the way back one level, named, with its key; at the right the places they can go from here, by their names.
 */
export function Moves({ back, onward = [] }: MovesProps) {
  const ahead = onward.slice(0, 3);
  if (!back && ahead.length === 0) return null;
  return (
    <nav className="id-moves" aria-label={WORDS.moves.label}>
      <div className="id-moves__back">
        {back && (
          <button type="button" className="id-moves__move" onClick={back.onClick} aria-keyshortcuts="Escape" disabled={back.disabled} title={back.reason ?? undefined}>
            <span className="id-moves__key" aria-hidden="true">
              {WORDS.moves.key}
            </span>
            {back.label}
          </button>
        )}
      </div>
      <div className="id-moves__on">
        {ahead.map((m) => (
          <button key={m.label} type="button" className="id-moves__move" onClick={m.onClick} disabled={m.disabled} aria-disabled={m.disabled} title={m.reason ?? undefined}>
            {m.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
