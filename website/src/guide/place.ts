/**
 * Where a label's words stand on the stage: clear of every box they must not cover (the fire's patches), inside the
 * room the screen keeps for the stage (under the objective and the trail, above the guide), joined to the point they
 * are about by a leader. Pure, so it can be checked on its own.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Placement {
  /** The plate's top left corner. */
  left: number;
  top: number;
  /** Where the leader meets the plate. */
  end: { x: number; y: number };
}

/** Leader lengths tried, shortest first, px. */
const LEADS = [56, 96, 150, 220, 300];
/** Directions tried at each length: up, up and right, up and left, right, left, down, down and right, down and left. */
const DIRS: Array<[number, number]> = [
  [0, -1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
];
/** The clear margin kept round a box, px. */
const GAP = 8;

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right + GAP) - Math.max(a.left, b.left - GAP)) *
  Math.max(0, Math.min(a.bottom, b.bottom + GAP) - Math.max(a.top, b.top - GAP));

/** The plate's box when its leader leaves the point in a direction, for a given length. */
function candidate(at: { x: number; y: number }, size: { w: number; h: number }, dir: [number, number], lead: number): Placement {
  const len = Math.hypot(dir[0], dir[1]);
  const ex = at.x + (dir[0] / len) * lead;
  const ey = at.y + (dir[1] / len) * lead;
  // The plate hangs from the leader's end on the side away from the point; straight up or down it starts at the leader.
  const left = dir[0] > 0 ? ex : dir[0] < 0 ? ex - size.w : ex - 12;
  const top = dir[1] > 0 ? ey : dir[1] < 0 ? ey - size.h : ey - size.h / 2;
  return { left, top, end: { x: ex, y: ey } };
}

/**
 * The first placement, by leader length then direction, that lies inside the room and covers none of the boxes; when
 * none does, the one inside the room that covers the least of them.
 */
export function placeClear(
  at: { x: number; y: number },
  size: { w: number; h: number },
  avoid: Box[],
  room: Box,
): Placement {
  let best: { p: Placement; cost: number } | null = null;
  for (const lead of LEADS) {
    for (const dir of DIRS) {
      const p = candidate(at, size, dir, lead);
      const box = { left: p.left, top: p.top, right: p.left + size.w, bottom: p.top + size.h };
      if (box.left < room.left || box.right > room.right || box.top < room.top || box.bottom > room.bottom) continue;
      const cost = avoid.reduce((a, b) => a + overlap(box, b), 0);
      if (cost === 0) return p;
      if (!best || cost < best.cost) best = { p, cost };
    }
  }
  return best?.p ?? candidate(at, size, [0, -1], LEADS[0]);
}
