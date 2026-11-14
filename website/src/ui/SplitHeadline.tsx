import { useEffect, useRef } from 'react';

/**
 * The landing headline, resolved twice.
 *
 * The DOM text is the 375 m side: crisp, selectable, read by assistive technology. A canvas laid over it
 * is the 1 km side: the same letters sampled into square cells on a grid fixed to the viewport, each cell
 * filled with the fraction of its area the letters cover. That is what a coarse pixel records: an area
 * average, not a sharp edge. CSS clips the two layers on either side of `--seam-x` (see curtainSeam.ts).
 *
 * The cell size follows the type size (8.8% of the font size, about 12 px at 1440 wide): coarse enough that
 * the strokes break into cells, fine enough that the words stay readable. It is a typographic picture of
 * resolution, not a measurement.
 */

const CELL_RATIO = 0.088;
const MIN_CELL = 8;

interface SplitHeadlineProps {
  lines: readonly string[];
  className?: string;
}

function renderCells(h1: HTMLElement, canvas: HTMLCanvasElement): void {
  const inks = Array.from(h1.querySelectorAll<HTMLElement>('[data-ink="true"]'));
  if (inks.length === 0) return;
  const cs = getComputedStyle(inks[0]);
  const fontSize = parseFloat(cs.fontSize) || 96;
  const cell = Math.max(MIN_CELL, Math.round(fontSize * CELL_RATIO));

  const box = h1.getBoundingClientRect();
  const gx0 = Math.floor(box.left / cell) * cell;
  const gy0 = Math.floor(box.top / cell) * cell;
  const gx1 = Math.ceil(box.right / cell) * cell;
  const gy1 = Math.ceil(box.bottom / cell) * cell;
  const w = Math.max(cell, gx1 - gx0);
  const h = Math.max(cell, gy1 - gy0);
  h1.style.setProperty('--split-left', `${box.left}px`);

  // 1. Draw the letters at 1 CSS px per pixel into a mask.
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  if (!mctx) return;
  mctx.font = `${cs.fontStyle} ${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
  const spacing = parseFloat(cs.letterSpacing);
  if ('letterSpacing' in mctx) {
    (mctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${
      Number.isFinite(spacing) ? spacing : 0
    }px`;
  }
  mctx.fontKerning = 'normal';
  mctx.textBaseline = 'alphabetic';
  mctx.fillStyle = '#fff';
  for (const ink of inks) {
    const r = ink.getBoundingClientRect();
    const m = mctx.measureText(ink.textContent ?? '');
    const ascent = m.fontBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent;
    // An inline box's height is its font's ascent plus descent; centre for any rounding.
    const baseline = r.top + (r.height - (ascent + descent)) / 2 + ascent;
    mctx.fillText(ink.textContent ?? '', r.left - gx0, baseline - gy0);
  }

  // 2. Area-average each cell.
  const cols = Math.round(w / cell);
  const rows = Math.round(h / cell);
  const data = mctx.getImageData(0, 0, w, h).data;
  const cover = new Float32Array(cols * rows);
  for (let y = 0; y < h; y += 1) {
    const row = Math.min(rows - 1, Math.floor(y / cell));
    const base = y * w * 4;
    for (let x = 0; x < w; x += 1) {
      const a = data[base + x * 4 + 3];
      if (a !== 0) cover[row * cols + Math.min(cols - 1, Math.floor(x / cell))] += a;
    }
  }
  const norm = 1 / (cell * cell * 255);

  // 3. Paint the cells at device resolution, with a one-pixel gap so the raster reads as a grid.
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.left = `${gx0 - box.left}px`;
  canvas.style.top = `${gy0 - box.top}px`;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.style.setProperty('--coarse-left', `${gx0}px`);
  canvas.style.setProperty('--coarse-width', `${w}px`);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = getComputedStyle(canvas).color || '#c4d1e1';
  const gap = Math.max(1, Math.round(dpr));
  const size = Math.round(cell * dpr);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const f = cover[r * cols + c] * norm;
      if (f < 0.06) continue;
      ctx.globalAlpha = Math.min(1, Math.pow(f, 0.8));
      ctx.fillRect(Math.round(c * cell * dpr), Math.round(r * cell * dpr), size - gap, size - gap);
    }
  }
  ctx.globalAlpha = 1;
  canvas.dataset.cell = String(cell);
}

export function SplitHeadline({ lines, className }: SplitHeadlineProps) {
  const h1Ref = useRef<HTMLHeadingElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const h1 = h1Ref.current;
    const canvas = canvasRef.current;
    if (!h1 || !canvas) return;
    let frame = 0;
    let cancelled = false;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!cancelled) renderCells(h1, canvas);
      });
    };
    const ink = h1.querySelector<HTMLElement>('[data-ink="true"]');
    const font = ink ? getComputedStyle(ink) : null;
    const fontSpec = font ? `${font.fontWeight} ${font.fontSize} ${font.fontFamily}` : '500 96px Geist';
    document.fonts
      .load(fontSpec)
      .catch(() => undefined)
      .then(() => document.fonts.ready)
      .then(schedule);
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(h1);
    window.addEventListener('resize', schedule);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [lines]);

  return (
    <h1 ref={h1Ref} className={`iso-split${className ? ` ${className}` : ''}`}>
      <span className="iso-split__fine">
        {lines.map((line) => (
          <span key={line} className="iso-split__line">
            <span data-ink="true">{line}</span>
          </span>
        ))}
      </span>
      <canvas ref={canvasRef} className="iso-split__coarse" aria-hidden="true" />
    </h1>
  );
}
