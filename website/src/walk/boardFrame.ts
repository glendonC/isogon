import type { StageTileAnchor } from '../stage/earthCutawayTypes';

/**
 * Where a square of the game's board stands on screen, from the north-west corner the stage reports for each square
 * every frame (`round.subscribeAnchors`). A square's other corners are its neighbours' north-west corners; on the
 * board's east and south edges they are carried on by the step to the neighbour on the other side, so the quad keeps
 * the board's perspective.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Quad {
  nw: Pt;
  ne: Pt;
  se: Pt;
  sw: Pt;
}

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });

export function squareQuad(anchors: readonly StageTileAnchor[], tile: number, cols: number): Quad | null {
  if (cols < 1 || tile < 0) return null;
  const at = (t: number): Pt | null => {
    const a = anchors.find((x) => x.tile === t && x.visible);
    return a ? { x: a.x, y: a.y } : null;
  };
  const nw = at(tile);
  if (!nw) return null;
  const col = tile % cols;
  const eastN = col < cols - 1 ? at(tile + 1) : null;
  const westN = col > 0 ? at(tile - 1) : null;
  const southN = at(tile + cols);
  const northN = tile - cols >= 0 ? at(tile - cols) : null;
  const ne = eastN ?? (westN ? add(nw, sub(nw, westN)) : null);
  const sw = southN ?? (northN ? add(nw, sub(nw, northN)) : null);
  if (!ne || !sw) return null;
  const southEast = col < cols - 1 ? at(tile + cols + 1) : null;
  const se = southEast ?? add(ne, sub(sw, nw));
  return { nw, ne, se, sw };
}

/** Halfway from one quad to another, `t` from 0 to 1. */
export function mixQuad(a: Quad, b: Quad, t: number): Quad {
  const m = (p: Pt, q: Pt): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  return { nw: m(a.nw, b.nw), ne: m(a.ne, b.ne), se: m(a.se, b.se), sw: m(a.sw, b.sw) };
}

/** The quad drawn in toward its centre by a share `k` of the way, so the frame stands inside the square's lines. */
export function insetQuad(q: Quad, k: number): Quad {
  const c = { x: (q.nw.x + q.ne.x + q.se.x + q.sw.x) / 4, y: (q.nw.y + q.ne.y + q.se.y + q.sw.y) / 4 };
  const m = (p: Pt): Pt => ({ x: p.x + (c.x - p.x) * k, y: p.y + (c.y - p.y) * k });
  return { nw: m(q.nw), ne: m(q.ne), se: m(q.se), sw: m(q.sw) };
}

/**
 * The screen box around a quad, drawn in by `pad` on each side (the reticle pads the box it is given by as much), so
 * the reticle's frame lands on the quad itself. A box too small to draw in keeps its centre.
 */
export function quadBox(q: Quad, pad = 0): { left: number; top: number; right: number; bottom: number } {
  const xs = [q.nw.x, q.ne.x, q.se.x, q.sw.x];
  const ys = [q.nw.y, q.ne.y, q.se.y, q.sw.y];
  const box = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const hw = Math.max(0, (box.right - box.left) / 2 - pad);
  const hh = Math.max(0, (box.bottom - box.top) / 2 - pad);
  return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh };
}

/** A square's name on the board: rows A, B, C from the north, columns 1, 2, 3 from the west. */
export function squareName(tile: number, cols: number): string {
  if (cols < 1 || tile < 0) return '';
  return `${String.fromCharCode(65 + Math.floor(tile / cols))}${(tile % cols) + 1}`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** A pass time as the readout says it: "10 AUG 01:29 UTC"; empty when the time is not given. */
export function passTime(utc: string | null): string {
  if (!utc) return '';
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return '';
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
}
