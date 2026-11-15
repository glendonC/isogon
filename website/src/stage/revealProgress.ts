/**
 * The reveal's sweep line, as the page's sweep (identity/RevealSweep) reports it: the share of the screen's width it
 * has crossed, left to right. While a sweep runs, the stage draws the revealed detections only behind the line (left
 * of it) and leaves out its own arrival along the pass's track. This module imports nothing of three.js, so the page
 * can import it eagerly: `<RevealSweep run={...} onProgress={setRevealProgress} />`.
 */

/** A line not moved for this long is over (the sweep was stopped or its component left). */
export const REVEAL_LINE_STALE_MS = 1500;

let progress: number | null = null;
let at = 0;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** The share of the screen the sweep has crossed, 0 to 1 (1: it has crossed, everything shows). */
export function setRevealProgress(p: number): void {
  progress = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : null;
  at = now();
}

/** The line to draw behind, as a share of the width, or null when no sweep runs (finished, stale or never set). */
export function revealLine(time: number = now()): number | null {
  if (progress === null || progress >= 1 || time - at > REVEAL_LINE_STALE_MS) return null;
  return progress;
}
