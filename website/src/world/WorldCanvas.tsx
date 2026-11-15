import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { atlas } from './atlas';
import { boxOf, clampView, fitView, K, OPENING, projector, toX, toY, type Box, type Projector, type View } from './projection';

/**
 * The Earth, flat, on one 2D canvas: the sea, the land, the borders, and the layers a picture gives it (images on a
 * grid of the Earth). Everything with words (marks, labels, the legend, actions) is page text over the canvas, placed
 * with the projector the canvas hands its children. It draws only when the view, the size or a layer changes: there
 * is no loop, so nothing runs while it stands still or is off screen.
 */

export interface GridLayer {
  key: string;
  image: CanvasImageSource & { width: number; height: number };
  /** The box the image covers; the whole Earth when left out. */
  extent?: Box;
  /** Cells drawn as squares when large on screen, blended when smaller than a pixel. */
  crispFromPx?: number;
  alpha?: number;
  /** A soft halo under the cells at world scale, so a single detection is seen; said beside the map as drawing. */
  halo?: boolean;
  /** Drawn inside the land only (a mask of loaded cells, which would otherwise square off the coasts). */
  onLand?: boolean;
}

export interface WorldCanvasProps {
  label: string;
  layers?: GridLayer[];
  /** Land with no loaded file's row is drawn hatched; land under a layer's loaded cells is drawn solid. */
  hatchLand?: boolean;
  /** The box first in view. */
  focus?: Box;
  /** True while the visitor draws a box: a drag draws instead of moving the map. */
  drawing?: boolean;
  onBox?: (box: Box) => void;
  onHover?: (at: { lon: number; lat: number; x: number; y: number } | null) => void;
  onClickMap?: (at: { lon: number; lat: number }) => void;
  children?: (p: Projector) => ReactNode;
  className?: string;
}

const SEA = '#080b11';
const LAND = '#161a22';
const HATCH_INK = 'rgba(243, 244, 246, 0.07)';
const BORDER = 'rgba(243, 244, 246, 0.09)';
const COAST = 'rgba(243, 244, 246, 0.2)';

function hatchPattern(ctx: CanvasRenderingContext2D, dpr: number): CanvasPattern | null {
  const s = Math.round(7 * dpr);
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = LAND;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = HATCH_INK;
  g.lineWidth = Math.max(1, dpr * 0.8);
  g.beginPath();
  g.moveTo(0, s);
  g.lineTo(s, 0);
  g.stroke();
  return ctx.createPattern(c, 'repeat');
}

export function WorldCanvas({ label, layers = [], hatchLand = false, focus = OPENING, drawing = false, onBox, onHover, onClickMap, children, className }: WorldCanvasProps) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  const drag = useRef<{ x: number; y: number; view: View; mode: 'pan' | 'box'; a?: [number, number]; moved: boolean } | null>(null);
  const frame = useRef(0);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const focusKey = focus.join(',');
  useEffect(() => {
    if (size.w > 0 && size.h > 0) setView(clampView(fitView(focus, size.w, size.h), size.w, size.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w > 0 && size.h > 0, focusKey]);

  const proj = useMemo(() => (view && size.w ? projector(view, size.w, size.h) : null), [view, size.w, size.h]);

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c || !view || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== size.w * dpr || c.height !== size.h * dpr) {
      c.width = size.w * dpr;
      c.height = size.h * dpr;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = SEA;
    ctx.fillRect(0, 0, c.width, c.height);
    const s = dpr / view.scale;
    const tx = (size.w / 2) * dpr - view.cx * s;
    const ty = (size.h / 2) * dpr - view.cy * s;
    const { land, borders, coast } = atlas();
    ctx.setTransform(s, 0, 0, s, tx, ty);
    if (hatchLand) {
      const pat = hatchPattern(ctx, dpr);
      if (pat) {
        // The pattern stays on the screen's pixels, not the map's, so its lines keep one width at every zoom.
        pat.setTransform(new DOMMatrix([1 / s, 0, 0, 1 / s, -tx / s, -ty / s]));
        ctx.fillStyle = pat;
      }
    } else ctx.fillStyle = LAND;
    ctx.fill(land);
    for (const l of layers) {
      const e = l.extent ?? ([-180, -90, 180, 90] as Box);
      const x0 = toX(e[0]);
      const y0 = toY(e[3]);
      const w = toX(e[2]) - x0;
      const h = toY(e[1]) - y0;
      const cellPx = (w / l.image.width) * s;
      ctx.globalAlpha = l.alpha ?? 1;
      if (l.halo && cellPx < 3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.filter = `blur(${Math.max(1.5, 4 - cellPx).toFixed(1)}px)`;
        ctx.globalAlpha = 0.55;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(l.image, x0, y0, w, h);
        ctx.restore();
        ctx.globalAlpha = l.alpha ?? 1;
      }
      ctx.imageSmoothingEnabled = cellPx < (l.crispFromPx ?? 2.5);
      if (l.onLand) {
        ctx.save();
        ctx.clip(land);
        ctx.drawImage(l.image, x0, y0, w, h);
        ctx.restore();
      } else ctx.drawImage(l.image, x0, y0, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 1 / s;
    ctx.strokeStyle = BORDER;
    ctx.stroke(borders);
    ctx.strokeStyle = COAST;
    ctx.stroke(coast);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [view, size.w, size.h, layers, hatchLand]);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame.current);
  }, [draw]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };

  const zoomAt = useCallback(
    (x: number, y: number, factor: number) => {
      setView((v) => {
        if (!v || !size.w) return v;
        const p = projector(v, size.w, size.h);
        const [lon, lat] = p.geo(x, y);
        const scale = v.scale * factor;
        const next = { scale, cx: toX(lon) - (x - size.w / 2) * scale, cy: toY(lat) - (y - size.h / 2) * scale };
        return clampView(next, size.w, size.h);
      });
    },
    [size.w, size.h],
  );

  // Wheel zoom needs a listener that may prevent the page from scrolling.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = local(e);
      zoomAt(x, y, Math.exp(e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!view || !proj || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-world-ui]')) return;
    const [x, y] = local(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x, y, view, mode: drawing ? 'box' : 'pan', a: proj.geo(x, y), moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const [x, y] = local(e);
    const d = drag.current;
    if (!d) {
      if (proj && onHover) {
        const [lon, lat] = proj.geo(x, y);
        onHover({ lon, lat, x, y });
      }
      return;
    }
    if (Math.abs(x - d.x) + Math.abs(y - d.y) > 3) d.moved = true;
    if (d.mode === 'pan') {
      setView(clampView({ ...d.view, cx: d.view.cx - (x - d.x) * d.view.scale, cy: d.view.cy - (y - d.y) * d.view.scale }, size.w, size.h));
    } else if (proj && d.a) {
      setDraft(boxOf(d.a, proj.geo(x, y)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !proj) return;
    const [x, y] = local(e);
    if (d.mode === 'box' && d.a && d.moved) {
      const b = boxOf(d.a, proj.geo(x, y));
      setDraft(null);
      onBox?.(b);
    } else if (!d.moved && onClickMap) {
      const [lon, lat] = proj.geo(x, y);
      onClickMap({ lon, lat });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!view) return;
    const step = 80 * view.scale;
    const pan = (dx: number, dy: number) => setView(clampView({ ...view, cx: view.cx + dx, cy: view.cy + dy }, size.w, size.h));
    if (e.key === 'ArrowLeft') pan(-step, 0);
    else if (e.key === 'ArrowRight') pan(step, 0);
    else if (e.key === 'ArrowUp') pan(0, -step);
    else if (e.key === 'ArrowDown') pan(0, step);
    else if (e.key === '+' || e.key === '=') zoomAt(size.w / 2, size.h / 2, 1 / 1.4);
    else if (e.key === '-' || e.key === '_') zoomAt(size.w / 2, size.h / 2, 1.4);
    else return;
    e.preventDefault();
  };

  const draftRect = draft && proj ? rectOf(proj, draft) : null;

  return (
    <div
      ref={wrap}
      className={`world-canvas${drawing ? ' world-canvas--drawing' : ''}${className ? ` ${className}` : ''}`}
      tabIndex={0}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => onHover?.(null)}
      onKeyDown={onKeyDown}
    >
      <canvas ref={canvas} className="world-canvas__gl" role="img" aria-label={label} />
      {draftRect && <div className="world-box world-box--draft" style={draftRect} />}
      {proj && children?.(proj)}
    </div>
  );
}

/** The screen rectangle of a box, as CSS. */
export function rectOf(p: Projector, b: Box): { left: number; top: number; width: number; height: number } {
  const [x0, y0] = p.at(b[0], b[3]);
  const [x1, y1] = p.at(b[2], b[1]);
  return { left: x0, top: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

/** Degrees of longitude in a box at its middle latitude, for its size in words. */
export const lonSpan = (b: Box) => b[2] - b[0];
export const latSpan = (b: Box) => b[3] - b[1];
export { K };
