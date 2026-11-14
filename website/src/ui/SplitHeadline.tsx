import { useEffect, useRef } from 'react';

/**
 * The landing headline, readable at all times, with the 1 km view on demand.
 *
 * The DOM text is the 375 m side: crisp, selectable, read by assistive technology. A canvas laid over it
 * holds the same letters sampled into square cells on a grid fixed to the viewport, each cell filled with
 * the fraction of its area the letters cover. That is what a coarse pixel records: an area average.
 *
 * The cells show in two places only:
 *  1. Once on load, the headline resolves from cells to crisp type, left to right (skipped under reduced
 *     motion).
 *  2. Under the pointer: a lens about one line tall shows the letters as a 1 km sensor would see them;
 *     everything outside the lens stays crisp. The cells share the MODIS colour of the page legend, so
 *     the lens needs no caption.
 *
 * It is a typographic picture of resolution, not a measurement.
 */

const CELL_RATIO = 0.088;
const MIN_CELL = 8;
const RESOLVE_MS = 1500;

interface SplitHeadlineProps {
  lines: readonly string[];
  className?: string;
  /** Start the load-time resolve once the page is ready to be seen. */
  play: boolean;
}

interface CellLayout {
  /** Canvas offset from the headline box, in CSS px. */
  dx: number;
  dy: number;
}

function renderCells(h1: HTMLElement, canvas: HTMLCanvasElement): CellLayout | null {
  const inks = Array.from(h1.querySelectorAll<HTMLElement>('[data-ink="true"]'));
  if (inks.length === 0) return null;
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

  // 1. Draw the letters at 1 CSS px per pixel into a mask.
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  if (!mctx) return null;
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
  const dx = gx0 - box.left;
  const dy = gy0 - box.top;
  canvas.style.left = `${dx}px`;
  canvas.style.top = `${dy}px`;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
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
  return { dx, dy };
}

export function SplitHeadline({ lines, className, play }: SplitHeadlineProps) {
  const h1Ref = useRef<HTMLHeadingElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<CellLayout>({ dx: 0, dy: 0 });

  // Render the cells whenever the headline's box or fonts change.
  useEffect(() => {
    const h1 = h1Ref.current;
    const canvas = canvasRef.current;
    if (!h1 || !canvas) return;
    let frame = 0;
    let cancelled = false;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (cancelled) return;
        const layout = renderCells(h1, canvas);
        if (layout) layoutRef.current = layout;
      });
    };
    void document.fonts.ready.then(schedule);
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

  // One resolve from cells to crisp type, left to right.
  useEffect(() => {
    const h1 = h1Ref.current;
    if (!h1 || !play) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      h1.style.setProperty('--res', '1');
      h1.dataset.resolving = 'false';
      return;
    }
    let raf = 0;
    const start = performance.now() + 250;
    h1.dataset.resolving = 'true';
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / RESOLVE_MS));
      // Ease out: fast at first, settling at the end of the line.
      const eased = 1 - Math.pow(1 - t, 3);
      h1.style.setProperty('--res', eased.toFixed(4));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        h1.dataset.resolving = 'false';
      }
    };
    h1.style.setProperty('--res', '0');
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [play]);

  // The 1 km lens follows the pointer over the headline.
  useEffect(() => {
    const h1 = h1Ref.current;
    if (!h1) return;
    let rect = h1.getBoundingClientRect();
    const measure = () => {
      rect = h1.getBoundingClientRect();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(h1);
    window.addEventListener('resize', measure);
    let on = false;
    const margin = 40;
    const onMove = (e: PointerEvent) => {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const inside =
        x > -margin && y > -margin && x < rect.width + margin && y < rect.height + margin;
      if (inside) {
        const { dx, dy } = layoutRef.current;
        h1.style.setProperty('--lx', `${x.toFixed(1)}px`);
        h1.style.setProperty('--ly', `${y.toFixed(1)}px`);
        h1.style.setProperty('--clx', `${(x - dx).toFixed(1)}px`);
        h1.style.setProperty('--cly', `${(y - dy).toFixed(1)}px`);
      }
      if (inside !== on) {
        on = inside;
        h1.dataset.lens = inside ? 'on' : 'off';
      }
    };
    const onLeave = () => {
      on = false;
      h1.dataset.lens = 'off';
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <h1
      ref={h1Ref}
      className={`iso-split${className ? ` ${className}` : ''}`}
      data-lens="off"
      data-resolving={play ? 'true' : 'false'}
    >
      <span className="iso-split__fine">
        {lines.map((line) => (
          <span key={line} className="iso-split__line">
            <span data-ink="true">{line}</span>
          </span>
        ))}
      </span>
      <canvas ref={canvasRef} className="iso-split__coarse" width={0} height={0} aria-hidden="true" />
    </h1>
  );
}
