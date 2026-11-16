import { LocatorBar } from './LocatorBar';
import './identity.css';

export interface WaitingProps {
  /** The path of the screen being opened, from the widest to the name in view. */
  path: string[];
  /** What is coming, in a line: "Loading every year of fire on Earth". */
  line: string;
  /** Drawn over the page (a screen still to come), or inside a screen already drawn (its frame stands round it). */
  over?: boolean;
  /** The way back to the first screen, so the path starts with it as on every screen. */
  onHome?: () => void;
}

/**
 * A screen on its way: its path at the top left at once, and one line saying what is loading with a thin line running
 * under it, so a slow network never leaves the visitor on a screen with nothing said.
 */
export function Waiting({ path, line, over = true, onHome }: WaitingProps) {
  return (
    <div className={over ? 'id-wait id-wait--over' : 'id-wait'} role="status" aria-live="polite">
      {over && <LocatorBar path={path} onHome={onHome} />}
      <div className="id-wait__say">
        <p className="id-wait__line">{line}</p>
        <span className="id-arrival__way" aria-hidden="true" />
      </div>
    </div>
  );
}
