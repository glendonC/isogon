/**
 * Labels on marks that never stand on each other: each label, in order of importance, takes the first of eight
 * places round its mark (right, left, above, below, then the same farther out on a longer leader) that is free of
 * every label already placed and of every mark, and inside the map. A label with no free place is not drawn; its
 * mark stays, and the label shows when the mark is pointed at or focused.
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
}

let ctx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

const overlaps = (a: { left: number; top: number; width: number; height: number }, b: typeof a, pad = 4) =>
  a.left < b.left + b.width + pad && b.left < a.left + a.width + pad && a.top < b.top + b.height + pad && b.top < a.top + a.height + pad;

export function placeLabels(
  items: LabelIn[],
  w: number,
  h: number,
  opts: { font?: string; subFont?: string; line?: number; mark?: number; avoid?: Array<{ left: number; top: number; width: number; height: number }> } = {},
): LabelOut[] {
  const font = opts.font ?? '400 13px Geist, sans-serif';
  const subFont = opts.subFont ?? '400 12px Geist, sans-serif';
  const line = opts.line ?? 18;
  const mark = opts.mark ?? 7;
  const placed: LabelOut[] = [];
  const marks = items.map((m) => ({ left: m.x - mark, top: m.y - mark, width: mark * 2, height: mark * 2 }));
  const sorted = [...items].sort((a, b) => a.rank - b.rank);
  const out = new Map<string, LabelOut>();
  for (const it of sorted) {
    const width = Math.ceil(Math.max(measure(it.text, font), it.sub ? measure(it.sub, subFont) : 0)) + 2;
    const height = it.sub ? line + 16 : line;
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
        if (placed.some((p) => p.shown && overlaps(p, box))) continue;
        if ((opts.avoid ?? []).some((a) => overlaps(a, box, 6))) continue;
        if (marks.some((m, i) => items[i].id !== it.id && overlaps(m, box, 2))) continue;
        chosen = { id: it.id, ...box, from: s.from, to: s.to, shown: true };
        break;
      }
      if (chosen) break;
    }
    const res = chosen ?? { id: it.id, left: it.x + 14, top: it.y - height / 2, width, height, from: [it.x + 4, it.y] as [number, number], to: [it.x + 10, it.y] as [number, number], shown: false };
    placed.push(res);
    out.set(it.id, res);
  }
  return items.map((it) => out.get(it.id)!);
}
