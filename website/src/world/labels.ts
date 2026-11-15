/**
 * Labels on marks that never stand on each other: each label, in order of importance, takes the first of eight
 * places round its mark (right, left, above, below, then the same farther out on a longer leader) that is free of
 * every label already placed and of every mark, and inside the map. Where its text finds no free place, its shorter
 * forms are tried in turn (`alts`). Where a label still finds no room, a label placed before it may move or take its
 * own shorter form, if then both are drawn. A label with no free place for any form is not drawn: its mark stays, and
 * the label shows when the mark is pointed at or focused. Widths are measured in the font the labels are drawn in.
 * With `clearLeaders`, a leader also keeps clear of the other marks and names (the names on the Earth).
 */

export interface LabelIn {
  id: string;
  x: number;
  y: number;
  text: string;
  /** Lower first. */
  rank: number;
  /** A second, quieter line under the first. */
  sub?: string | null;
  /** Shorter forms of the text, tried in order where the text finds no room. */
  alts?: string[];
}

export interface LabelOut {
  id: string;
  /** The label's box, top left, in map pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Where the leader leaves the mark and where it meets the label. */
  from: [number, number];
  to: [number, number];
  shown: boolean;
  /** The text placed: the label's own, or the shorter form that found room. */
  text: string;
}

let ctx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

// A leader's box: it runs straight across or up and down, from its mark to its label.
const leaderOf = (l: { from: [number, number]; to: [number, number] }) => ({
  left: Math.min(l.from[0], l.to[0]),
  top: Math.min(l.from[1], l.to[1]),
  width: Math.abs(l.to[0] - l.from[0]),
  height: Math.abs(l.to[1] - l.from[1]),
});

const overlaps = (a: { left: number; top: number; width: number; height: number }, b: typeof a, pad = 4) =>
  a.left < b.left + b.width + pad && b.left < a.left + a.width + pad && a.top < b.top + b.height + pad && b.top < a.top + a.height + pad;

export function placeLabels(
  items: LabelIn[],
  w: number,
  h: number,
  opts: {
    font?: string;
    subFont?: string;
    line?: number;
    mark?: number;
    avoid?: Array<{ left: number; top: number; width: number; height: number }>;
    /** Keep each leader clear of the other marks and names, and each name off the other leaders. */
    clearLeaders?: boolean;
  } = {},
): LabelOut[] {
  const font = opts.font ?? '400 13px Geist, sans-serif';
  const subFont = opts.subFont ?? '400 12px Geist, sans-serif';
  const line = opts.line ?? 18;
  const mark = opts.mark ?? 7;
  const clear = opts.clearLeaders ?? false;
  const placed: LabelOut[] = [];
  const marks = items.map((m) => ({ left: m.x - mark, top: m.y - mark, width: mark * 2, height: mark * 2 }));
  const sorted = [...items].sort((a, b) => a.rank - b.rank);
  const out = new Map<string, LabelOut>();
  for (const it of sorted) {
    const res = fit(it, placed) ?? hidden(it);
    placed.push(res);
    out.set(it.id, res);
  }
  // A label left out: a label placed before it, the least important first, may move or take a shorter form, so that
  // both are drawn.
  for (const it of sorted) {
    const mine = out.get(it.id)!;
    if (mine.shown) continue;
    for (const other of [...sorted].reverse()) {
      const theirs = out.get(other.id)!;
      if (other === it || !theirs.shown) continue;
      const rest = placed.filter((p) => p !== theirs && p !== mine);
      const now = fit(it, rest);
      const moved = now ? fit(other, [...rest, now]) : null;
      if (!now || !moved) continue;
      placed.splice(0, placed.length, ...rest, now, moved);
      out.set(it.id, now);
      out.set(other.id, moved);
      break;
    }
  }
  return items.map((it) => out.get(it.id)!);

  function fit(it: LabelIn, against: LabelOut[]): LabelOut | null {
    const height = it.sub ? line + 16 : line;
    for (const text of [it.text, ...(it.alts ?? [])]) {
      const width = Math.ceil(Math.max(measure(text, font), it.sub ? measure(it.sub, subFont) : 0)) + 2;
      const s = spot(it, text, width, height, against);
      if (s) return s;
    }
    return null;
  }

  function hidden(it: LabelIn): LabelOut {
    const height = it.sub ? line + 16 : line;
    const width = Math.ceil(Math.max(measure(it.text, font), it.sub ? measure(it.sub, subFont) : 0)) + 2;
    return { id: it.id, left: it.x + 14, top: it.y - height / 2, width, height, from: [it.x + 4, it.y], to: [it.x + 10, it.y], shown: false, text: it.text };
  }

  function spot(it: LabelIn, text: string, width: number, height: number, against: LabelOut[]): LabelOut | null {
    let chosen: LabelOut | null = null;
    for (const lead of [14, 34]) {
      const spots: Array<{ left: number; top: number; from: [number, number]; to: [number, number] }> = [
        { left: it.x + lead, top: it.y - height / 2, from: [it.x + 4, it.y], to: [it.x + lead - 4, it.y] },
        { left: it.x - lead - width, top: it.y - height / 2, from: [it.x - 4, it.y], to: [it.x - lead + 4, it.y] },
        { left: it.x - width / 2, top: it.y - lead - height, from: [it.x, it.y - 4], to: [it.x, it.y - lead + 2] },
        { left: it.x - width / 2, top: it.y + lead, from: [it.x, it.y + 4], to: [it.x, it.y + lead - 2] },
      ];
      for (const s of spots) {
        const box = { left: s.left, top: s.top, width, height };
        if (box.left < 4 || box.top < 4 || box.left + width > w - 4 || box.top + height > h - 4) continue;
        if (against.some((p) => p.shown && (overlaps(p, box) || (clear && overlaps(leaderOf(p), box, 1))))) continue;
        if ((opts.avoid ?? []).some((a) => overlaps(a, box, 6))) continue;
        if (marks.some((m, i) => items[i].id !== it.id && overlaps(m, box, 2))) continue;
        // Its leader crosses no other mark and no name; no name stands on another's leader.
        const lead = leaderOf(s);
        if (clear && marks.some((m, i) => items[i].id !== it.id && overlaps(m, lead, 1))) continue;
        if (clear && against.some((p) => p.shown && overlaps(p, lead, 1))) continue;
        chosen = { id: it.id, ...box, from: s.from, to: s.to, shown: true, text };
        break;
      }
      if (chosen) break;
    }
    return chosen;
  }
}
