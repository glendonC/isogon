/**
 * The in-scene frame: four corner brackets around the thing pointed at, and beside them the action in a few words
 * and one readout in mono capitals. No box. Pure geometry, read by `Frame.tsx` and the tests.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Arm length of a bracket: 30 px on large things, shorter on small ones so the corners never meet. */
export function armFor(w: number, h: number, max = 30): number {
  return Math.max(5, Math.min(max, Math.round(Math.min(w, h) * 0.4)));
}

/** The four L shapes, as SVG path data, top left, top right, bottom left, bottom right. */
export function bracketPaths(b: Box, arm = armFor(b.w, b.h)): string[] {
  const { x, y, w, h } = b;
  const r = x + w;
  const d = y + h;
  return [
    `M ${x} ${y + arm} L ${x} ${y} L ${x + arm} ${y}`,
    `M ${r - arm} ${y} L ${r} ${y} L ${r} ${y + arm}`,
    `M ${x} ${d - arm} L ${x} ${d} L ${x + arm} ${d}`,
    `M ${r - arm} ${d} L ${r} ${d} L ${r} ${d - arm}`,
  ];
}

/** A box grown by `pad` on every side. */
export function grow(b: Box, pad: number): Box {
  return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
}

/** Readout fields packed into lines of at most `maxChars`, three spaces between fields, in capitals. */
export function readoutLines(fields: readonly string[], maxChars = 34): string[] {
  const lines: string[] = [];
  let line = '';
  for (const raw of fields) {
    const f = raw.toUpperCase();
    if (!line) line = f;
    else if (line.length + 3 + f.length <= maxChars) line = `${line}   ${f}`;
    else {
      lines.push(line);
      line = f;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Widths of the two kinds of text, close enough to place them: the action at 22 px, the readout at 11 px mono. */
export const TEXT = { actionChar: 11, actionLine: 28, readoutChar: 8.2, readoutLine: 16 } as const;

/**
 * Where the words go: to the right of the frame, top aligned, unless they would leave the bounds, then to its
 * left; kept inside vertically.
 */
export function besidePlace(
  frame: Box,
  text: { w: number; h: number },
  bounds: { w: number; h: number },
  gap = 16,
): { x: number; y: number; anchor: 'start' | 'end' } {
  const right = frame.x + frame.w + gap;
  const fitsRight = right + text.w <= bounds.w;
  const x = fitsRight ? right : Math.max(text.w, frame.x - gap);
  const y = Math.max(0, Math.min(frame.y, bounds.h - text.h));
  return { x, y, anchor: fitsRight ? 'start' : 'end' };
}

/**
 * Where the words go above a frame: starting at the frame's left edge when they fit, else ending at its right edge,
 * else slid inside the bounds. The leader drops from the edge the words are set on, or from the frame's middle.
 */
export function abovePlace(
  frame: Box,
  textW: number,
  boundsW: number,
): { x: number; anchor: 'start' | 'end'; leaderX: number } {
  if (frame.x + textW <= boundsW) return { x: frame.x, anchor: 'start', leaderX: frame.x + 0.5 };
  if (frame.x + frame.w - textW >= 0) return { x: frame.x + frame.w, anchor: 'end', leaderX: frame.x + frame.w - 0.5 };
  return { x: Math.max(0, boundsW - textW), anchor: 'start', leaderX: frame.x + frame.w / 2 };
}
