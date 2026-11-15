import type { StageFireAnchor } from '../stage/earthCutawayTypes';

/** One patch of the fire on screen: cells that touch, with their centre and how many there are. */
export interface FirePatch {
  x: number;
  y: number;
  cells: number;
  visible: boolean;
}

/** The anchor as the stage reports it, with its patches when it serves them (largest first or not). */
type AnchorWithPatches = StageFireAnchor & { patches?: FirePatch[] };

/**
 * Where the fire's label hangs: on the patch with the most cells that is on screen, never on bare ground between two
 * patches. Without patches from the stage, on the anchor's centre; nothing when that is off screen.
 */
export function labelPoint(anchor: StageFireAnchor | null): { x: number; y: number } | null {
  if (!anchor) return null;
  const patches = (anchor as AnchorWithPatches).patches;
  if (Array.isArray(patches) && patches.length > 0) {
    let best: FirePatch | null = null;
    for (const p of patches) if (p.visible && (!best || p.cells > best.cells)) best = p;
    if (best) return { x: best.x, y: best.y };
  }
  return anchor.visible ? { x: anchor.x, y: anchor.y } : null;
}
