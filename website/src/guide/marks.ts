import type { WorkspaceBase } from '../app/store';
import { fill, SCRIPT, type Conditions, type Fields } from './script';

/** One row of the key of marks: the mark's id (which swatch to draw), its name and its line. */
export interface MarkRow {
  id: string;
  name: string;
  line: string;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);

/**
 * The rows of the key of marks (`script.json`, "marks") whose mark is on show now, by each row's `on_show`: the white
 * frames on a pass of the sharp satellite, the dotted line on every pass of a run with an estimate, the darker ground
 * inside it by day, the squares sized by chance when asked for, the sharp satellite's detections on its pass after the
 * reveal, the warm lights and their glow on a pass of the coarse satellite (every pass on a fire kept as the test),
 * and the red glow on a hidden pass where the stage reports one.
 */
export function marksOnShow(ws: WorkspaceBase, fields: Fields, conds: Conditions, opts: { chance: boolean; revealed: boolean }): MarkRow[] {
  const rows = SCRIPT.marks?.rows ?? [];
  const run = obj(ws.run.active as unknown);
  const frames = obj(run?.observer_passes)?.frames;
  const frame = Array.isArray(frames) ? obj(frames[Math.min(ws.time.pass, frames.length - 1)]) : null;
  const sharp = conds.pass_is_sharp === true;
  const closed = ws.model.closed;
  const lights = !sharp || closed;
  const shown: Record<string, boolean> = {
    frames: sharp && Boolean(run?.declared_cells ?? run?.belief_frames),
    dotted_line: Boolean(run?.belief_frames),
    darker_inside: frame?.is_day === true && Boolean(run?.belief_frames),
    chance_squares: opts.chance,
    sharp_detections: sharp && opts.revealed,
    lights,
    glow_around: lights,
    afterglow: sharp && !opts.revealed && ws.model.lastSeen !== null,
  };
  const out: MarkRow[] = [];
  for (const r of rows) {
    if (!shown[r.id]) continue;
    const line = fill(r.line, fields);
    if (line) out.push({ id: r.id, name: r.name, line });
  }
  return out;
}
