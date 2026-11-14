import type { Box, CompareMark, DetectionsMark, EstimateGrid, TilesMark } from './types';

/**
 * Paints a block's marks on a canvas that the block's top surface carries. Everything here is drawn from the rows
 * and bytes it is given; the choices that are drawing and not data are named where they are made.
 */

/** The data colours of the design system, read from the page. */
export interface MarkPalette {
  /** The coarse instrument. */
  modis: string;
  /** A detection, and the sharp instrument. */
  detection: string;
  /** The model's estimate. */
  estimate: string;
  /** The brightest ink, for the board of a round. */
  ink: string;
}

/** The share of its cell a certain square covers, as on the stage. */
const SQUARE_AREA = 0.34;
/** The probability at which the dotted line runs, as on the stage. */
const MAY_BURN = 0.02;
/** The probability at or above which a hidden pass shows an open frame, the blind test's own threshold. */
const HELD = 0.5;
/** Ink strength by expected intensity: the stage's range. */
const INK_MIN = 0.7;

const DEG = Math.PI / 180;

export interface MarkSurface {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** The box the canvas covers. */
  view: Box;
  /** Canvas pixels per kilometre on the ground. */
  pxPerKm: number;
  /** Canvas pixels per CSS pixel on screen, so that a line keeps a least width however small the block is drawn. */
  perCssPx: number;
}

const xOf = (s: MarkSurface, lon: number) => ((lon - s.view[0]) / (s.view[2] - s.view[0])) * s.width;
const yOf = (s: MarkSurface, lat: number) => ((s.view[3] - lat) / (s.view[3] - s.view[1])) * s.height;

function withAlpha(colour: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  if (!m) return colour;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** A detection at its reported footprint: `scanKm` along the scan bearing, `trackKm` square to it. */
function paintDetections(s: MarkSurface, mark: DetectionsMark, palette: MarkPalette) {
  const { ctx } = s;
  const colour = mark.ink !== 'detection' && mark.instrument === 'modis' ? palette.modis : palette.detection;
  const draw = mark.draw ?? (mark.instrument === 'modis' ? 'outline' : 'filled');
  const quiet = mark.weight === 'quiet';
  // Drawing: the line's width, and a faint pane inside a hollow footprint so that it reads as an area
  const line = Math.max(s.perCssPx * (quiet ? 1 : 1.5), s.pxPerKm * (quiet ? 0.045 : 0.075));
  for (const r of mark.rows) {
    const w = r.scanKm * s.pxPerKm;
    const h = r.trackKm * s.pxPerKm;
    ctx.save();
    ctx.translate(xOf(s, r.lon), yOf(s, r.lat));
    ctx.rotate((r.bearingDeg ?? 90) * DEG - Math.PI / 2);
    if (draw === 'wash') {
      ctx.fillStyle = withAlpha(colour, 0.2);
      ctx.fillRect(-w / 2, -h / 2, w, h);
    } else if (draw === 'outline') {
      if (!quiet) {
        ctx.fillStyle = withAlpha(colour, 0.16);
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.lineWidth = line;
      ctx.strokeStyle = withAlpha(colour, quiet ? 0.5 : 1);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = withAlpha(colour, quiet ? 0.5 : 1);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      // A dark hairline keeps neighbouring footprints apart
      ctx.lineWidth = Math.max(s.perCssPx * 0.5, s.pxPerKm * 0.02);
      ctx.strokeStyle = 'rgba(8,11,17,0.55)';
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }
}

/** One step of the belief: the probability that each cell burns and, when given, its expected intensity. */
export interface BeliefStep {
  probability: Uint8Array;
  intensity?: Uint8Array;
}

/**
 * The line where a surface through the cells' probabilities crosses a level, as chains of points in cell units
 * (x from the west edge, y from the north edge; a cell's centre is at half units). The surface is the cells'
 * values smoothed over their neighbours, which is drawing: it keeps the line from following single cells.
 */
export function levelLines(p: Float32Array, nx: number, ny: number, level: number): number[][] {
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= ny || c >= nx ? 0 : p[r * nx + c]);
  // Corners of the marching grid are cell centres, padded by one ring of zeros so every line closes
  const W = nx + 2;
  const H = ny + 2;
  const v = (r: number, c: number) => at(r - 1, c - 1);
  const pointOn = new Map<string, [number, number]>();
  const links = new Map<string, string[]>();
  const edgePoint = (kind: 'h' | 'v', r: number, c: number): string => {
    const key = `${kind}${r},${c}`;
    if (!pointOn.has(key)) {
      const a = v(r, c);
      const b = kind === 'h' ? v(r, c + 1) : v(r + 1, c);
      const t = Math.abs(b - a) < 1e-9 ? 0.5 : (level - a) / (b - a);
      // Back to cell units: corner (r, c) of the padded grid is the centre of cell (r - 1, c - 1)
      pointOn.set(key, kind === 'h' ? [c - 0.5 + t, r - 0.5] : [c - 0.5, r - 0.5 + t]);
    }
    return key;
  };
  const link = (a: string, b: string) => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  for (let r = 0; r < H - 1; r++) {
    for (let c = 0; c < W - 1; c++) {
      const tl = v(r, c) >= level ? 1 : 0;
      const tr = v(r, c + 1) >= level ? 1 : 0;
      const br = v(r + 1, c + 1) >= level ? 1 : 0;
      const bl = v(r + 1, c) >= level ? 1 : 0;
      const code = tl * 8 + tr * 4 + br * 2 + bl;
      if (code === 0 || code === 15) continue;
      const top = () => edgePoint('h', r, c);
      const bottom = () => edgePoint('h', r + 1, c);
      const left = () => edgePoint('v', r, c);
      const right = () => edgePoint('v', r, c + 1);
      switch (code) {
        case 1:
        case 14:
          link(left(), bottom());
          break;
        case 2:
        case 13:
          link(bottom(), right());
          break;
        case 3:
        case 12:
          link(left(), right());
          break;
        case 4:
        case 11:
          link(top(), right());
          break;
        case 6:
        case 9:
          link(top(), bottom());
          break;
        case 7:
        case 8:
          link(top(), left());
          break;
        case 5:
          link(top(), left());
          link(bottom(), right());
          break;
        case 10:
          link(top(), right());
          link(left(), bottom());
          break;
      }
    }
  }
  const chains: number[][] = [];
  const used = new Set<string>();
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const startKey of links.keys()) {
    for (const first of links.get(startKey) ?? []) {
      if (used.has(edgeKey(startKey, first))) continue;
      const chain: number[] = [...(pointOn.get(startKey) as [number, number])];
      let cur = first;
      used.add(edgeKey(startKey, cur));
      for (;;) {
        chain.push(...(pointOn.get(cur) as [number, number]));
        const here = cur;
        const next = (links.get(here) ?? []).find((n) => !used.has(edgeKey(here, n)));
        if (!next) break;
        used.add(edgeKey(here, next));
        cur = next;
      }
      chains.push(chain);
    }
  }
  return chains;
}

/** The cells' probabilities (0 to 1) smoothed over their eight neighbours. */
export function smoothed(probability: Uint8Array, nx: number, ny: number): Float32Array {
  const out = new Float32Array(nx * ny);
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      let sum = 0;
      let weight = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          const w = dr === 0 && dc === 0 ? 4 : dr === 0 || dc === 0 ? 2 : 1;
          weight += w;
          if (rr >= 0 && cc >= 0 && rr < ny && cc < nx) sum += (w * probability[rr * nx + cc]) / 255;
        }
      }
      out[r * nx + c] = sum / weight;
    }
  }
  return out;
}

/** The estimate as the stage draws it: ink squares on the model's own grid inside a dotted line. */
function paintEstimate(s: MarkSurface, grid: EstimateGrid, step: BeliefStep, open: boolean, palette: MarkPalette) {
  const { ctx } = s;
  const { nx, ny, box } = grid;
  const cw = ((box[2] - box[0]) / nx / (s.view[2] - s.view[0])) * s.width;
  const ch = ((box[3] - box[1]) / ny / (s.view[3] - s.view[1])) * s.height;
  const x0 = xOf(s, box[0]);
  const y0 = yOf(s, box[3]);
  const cell = Math.min(cw, ch);

  // The dotted line: where the model holds that fire may be
  const lines = levelLines(smoothed(step.probability, nx, ny), nx, ny, MAY_BURN);
  const dot = Math.max(s.perCssPx * 1.5, cell * 0.14);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([0.01, dot * 2.4]);
  for (const [width, colour] of [
    [dot * 1.7, 'rgba(8,11,17,0.6)'],
    [dot, palette.estimate],
  ] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    for (const chain of lines) {
      ctx.beginPath();
      for (let i = 0; i < chain.length; i += 2) {
        const x = x0 + chain[i] * cw;
        const y = y0 + chain[i + 1] * ch;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();

  // One square per cell, its area by the probability that the cell burns
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const p = step.probability[r * nx + c] / 255;
      if (p <= 0) continue;
      const cx = x0 + (c + 0.5) * cw;
      const cy = y0 + (r + 0.5) * ch;
      const strength = INK_MIN + (1 - INK_MIN) * (step.intensity ? step.intensity[r * nx + c] / 255 : 1);
      if (open && p >= HELD) {
        // An open frame: the answer the model holds and has not been shown
        const side = cell * Math.sqrt(SQUARE_AREA) * 1.25;
        ctx.lineWidth = Math.max(s.perCssPx, cell * 0.09);
        ctx.strokeStyle = withAlpha(palette.estimate, strength);
        ctx.strokeRect(cx - side / 2, cy - side / 2, side, side);
        continue;
      }
      const side = cell * Math.sqrt(SQUARE_AREA * p);
      if (side < s.perCssPx * 0.5) continue;
      ctx.fillStyle = withAlpha(palette.estimate, strength);
      ctx.fillRect(cx - side / 2, cy - side / 2, side, side);
    }
  }
}

/** The board of a round: a hairline along every tile edge, and brackets on the tiles looked at. Never a fill. */
function paintTiles(s: MarkSurface, mark: TilesMark, palette: MarkPalette) {
  const { ctx, width, height } = s;
  const tw = width / mark.cols;
  const th = height / mark.rows;
  ctx.save();
  ctx.strokeStyle = withAlpha(palette.ink, 0.42);
  ctx.lineWidth = Math.max(s.perCssPx, s.pxPerKm * 0.05);
  ctx.beginPath();
  for (let c = 0; c <= mark.cols; c++) {
    const x = Math.min(width - 1, Math.max(1, c * tw));
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let r = 0; r <= mark.rows; r++) {
    const y = Math.min(height - 1, Math.max(1, r * th));
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  const seen = new Set<number>();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(s.perCssPx * 2, s.pxPerKm * 0.16);
  ctx.lineCap = 'square';
  for (const tile of mark.looked ?? []) {
    if (seen.has(tile)) continue;
    seen.add(tile);
    const x = (tile % mark.cols) * tw;
    const y = Math.floor(tile / mark.cols) * th;
    const arm = Math.min(tw, th) * 0.22;
    const inset = ctx.lineWidth * 1.5;
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [
      [x + inset, y + inset, 1, 1],
      [x + tw - inset, y + inset, -1, 1],
      [x + inset, y + th - inset, 1, -1],
      [x + tw - inset, y + th - inset, -1, -1],
    ]) {
      ctx.moveTo(cx + sx * arm, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * arm);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Paints every mark of a block, in order. `belief` gives the step of an estimate that names a file. */
export function paintMarks(
  s: MarkSurface,
  marks: readonly CompareMark[],
  palette: MarkPalette,
  belief: (url: string, step: number, grid: EstimateGrid) => BeliefStep | null,
): void {
  s.ctx.clearRect(0, 0, s.width, s.height);
  for (const mark of marks) {
    if (mark.kind === 'detections') paintDetections(s, mark, palette);
    else if (mark.kind === 'tiles') paintTiles(s, mark, palette);
    else {
      const step = 'url' in mark.source ? belief(mark.source.url, mark.source.step, mark.grid) : mark.source;
      if (step) paintEstimate(s, mark.grid, step, mark.open === true, palette);
    }
  }
}

/** A short text that changes when a block's marks change, so the plane repaints only then. */
export function marksSignature(marks: readonly CompareMark[]): string {
  return marks
    .map((m) => {
      if (m.kind === 'detections') {
        const a = m.rows[0];
        const z = m.rows[m.rows.length - 1];
        return `d:${m.instrument}:${m.ink ?? ''}:${m.draw ?? ''}:${m.weight ?? ''}:${m.rows.length}:${a ? `${a.lon},${a.lat}` : ''}:${z ? `${z.lon},${z.lat}` : ''}`;
      }
      if (m.kind === 'tiles') return `t:${m.rows}x${m.cols}:${(m.looked ?? []).join('.')}`;
      const src = 'url' in m.source ? `${m.source.url}@${m.source.step}` : `bytes${m.source.probability.length}:${m.source.probability[0]}`;
      return `e:${m.grid.nx}x${m.grid.ny}:${src}:${m.open ? 'open' : ''}`;
    })
    .join('|');
}
