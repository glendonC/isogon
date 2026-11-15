import { CSS } from './tokens';
import { TEXT, abovePlace, besidePlace, bracketPaths, readoutLines } from './frameGeometry';
import type { Box } from './frameGeometry';

export interface FrameProps {
  /** The thing framed, in the SVG's own units. */
  box: Box;
  /** The SVG's size, so the words stay inside it. */
  bounds: { w: number; h: number };
  /** The action in two to four words, when pressing the framed thing does something. */
  action?: string;
  /** The readout's fields, said exactly; packed into lines in capitals. */
  readout?: readonly string[];
  maxChars?: number;
  /**
   * Put the words above, their last line ending at `bottom`, joined to the frame by a leader, where words beside the
   * frame would cover other data (a dense grid, a row of bars).
   */
  above?: { bottom: number };
  /** Draw the leader from the words above down to the frame (default true). */
  leader?: boolean;
}

/**
 * The page's frame, drawn inside an SVG: four pale cyan corner brackets that close in on the thing, and beside them
 * the action in white and one readout in mono capitals. The interface's own colour; data keeps its colours.
 */
export function Frame({ box, bounds, action, readout = [], maxChars = 34, above, leader = true }: FrameProps) {
  const lines = readoutLines(readout, maxChars);
  const textW = Math.max(action ? action.length * TEXT.actionChar : 0, ...lines.map((l) => l.length * TEXT.readoutChar));
  const textH = (action ? TEXT.actionLine : 0) + lines.length * TEXT.readoutLine;
  let at: { x: number; y: number; anchor: 'start' | 'end' };
  let leaderX = box.x + 0.5;
  if (above) {
    const a = abovePlace(box, textW, bounds.w);
    at = { x: a.x, y: above.bottom - textH, anchor: a.anchor };
    leaderX = a.leaderX;
  } else {
    at = besidePlace(box, { w: textW, h: textH }, bounds);
  }
  return (
    <g pointerEvents="none" aria-hidden="true">
      <g className="dv-frame" style={{ transformOrigin: `${box.x + box.w / 2}px ${box.y + box.h / 2}px` }}>
        {bracketPaths(box).map((d) => (
          <path key={d} d={d} fill="none" stroke={CSS.ui} strokeWidth={1.5} />
        ))}
      </g>
      {above && leader ? <line x1={leaderX} x2={leaderX} y1={above.bottom + 8} y2={box.y - 4} stroke={CSS.ui} strokeWidth={1} /> : null}
      {action ? (
        <text x={at.x} y={at.y + 22} textAnchor={at.anchor} className="dv-action">
          {action}
        </text>
      ) : null}
      {lines.map((l, i) => (
        <text key={i} x={at.x} y={at.y + (action ? TEXT.actionLine : 0) + 12 + i * TEXT.readoutLine} textAnchor={at.anchor} className="dv-readout">
          {l}
        </text>
      ))}
    </g>
  );
}
