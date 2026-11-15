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
  /** Pixels on the left kept for a panel over the map: the box first in view is fitted into the rest. */
  padLeft?: number;
  /** Pixels at the bottom kept for a panel over the map (a phone's legend or list). */
  padBottom?: number;
  /** On a tall, narrow screen the view is fitted by height and opens on this point; the visitor pans sideways. */
  centre?: [number, number] | null;
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
/** Land no loaded file holds a detection in: darker than loaded land, and hatched. */
const LAND_UNLOADED = '#101318';
const HATCH_INK = 'rgba(243, 244, 246, 0.08)';
const BORDER = 'rgba(243, 244, 246, 0.09)';
const COAST = 'rgba(243, 244, 246, 0.2)';

/** The halo of a layer, blurred once at the layer's own size, so a frame only scales it. */
const halos = new WeakMap<object, HTMLCanvasElement>();
function haloOf(img: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const hit = halos.get(img);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.filter = 'blur(1.6px)';
  g.drawImage(img, 0, 0);
  halos.set(img, c);
  return c;
}

function hatchPattern(ctx: CanvasRenderingContext2D, dpr: number): CanvasPattern | null {
  const s = Math.round(7 * dpr);
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = LAND_UNLOADED;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = HATCH_INK;
  g.lineWidth = Math.max(1, dpr * 0.8);
  g.beginPath();
  g.moveTo(0, s);
  g.lineTo(s, 0);
  g.stroke();
  return ctx.createPattern(c, 'repeat');
}

export function WorldCanvas({ label, layers = [], hatchLand = false, focus = OPENING, padLeft = 0, padBottom = 0, centre = null, drawing = false, onBox, onHover, onClickMap, children, className }: WorldCanvasProps) {
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
  // The view is fitted again whenever the map's size or room changes, until the visitor moves it.
  const moved = useRef(false);
  const centreKey = centre ? centre.join(',') : '';
  useEffect(() => {
    moved.current = false;
  }, [focusKey]);
  useEffect(() => {
    if (!(size.w > 0 && size.h > 0) || moved.current) return;
    const left = Math.min(padLeft, size.w * 0.6);
    const bottom = Math.min(padBottom, size.h * 0.7);
    const w = size.w - left;
    const h = size.h - bottom;
    let v = fitView(focus, w, h);
    if (h > w * 1.15) {
      // Tall and narrow (a phone): fit the box's height into four fifths of the room, open on the point asked for.
      const scale = (toY(focus[1]) - toY(focus[3])) / (h * 0.8);
      const c = centre ?? [(focus[0] + focus[2]) / 2, (focus[1] + focus[3]) / 2];
      v = { scale, cx: toX(c[0]), cy: toY((focus[1] + focus[3]) / 2) };
    }
    setView(clampView({ ...v, cx: v.cx - (left / 2) * v.scale, cy: v.cy + (bottom / 2) * v.scale }, size.w, size.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, focusKey, padLeft, padBottom, centreKey]);

  const proj = useMemo(() => (view && size.w ? projector(view, size.w, size.h) : null), [view, size.w, size.h]);

  // The land and its layers are painted once into an image a quarter larger than the map on each side; panning only
  // moves that image, and it is painted again when the view leaves it or a zoom comes to rest. A zoom in progress
  // scales the last image. So a drag beside the running stage asks the GPU for one image copy a frame.
  const cache = useRef<{ canvas: HTMLCanvasElement; scale: number; ux: number; uy: number; cw: number; ch: number; key: unknown; dpr: number } | null>(null);
  const settle = useRef(0);

  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, dpr: number, s: number, tx: number, ty: number) => {
      const { land, borders, coast } = atlas();
      ctx.setTransform(s, 0, 0, s, tx, ty);
      // One world: nothing is drawn past the date line, so a shape copied across it shows only its own part there.
      ctx.save();
      ctx.beginPath();
      ctx.rect(toX(-180), toY(90), toX(180) - toX(-180), toY(-90) - toY(90));
      ctx.clip();
      if (hatchLand) {
        const pat = hatchPattern(ctx, dpr);
        if (pat) {
          // The pattern stays on the image's pixels, not the map's, so its lines keep one width at every zoom.
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
          ctx.globalAlpha = 0.6;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(haloOf(l.image), x0, y0, w, h);
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
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    [layers, hatchLand],
  );

  const build = useCallback(
    (v: View, dpr: number) => {
      const M = 0.25;
      const cw = Math.ceil(size.w * (1 + 2 * M));
      const ch = Math.ceil(size.h * (1 + 2 * M));
      const c = cache.current?.canvas ?? document.createElement('canvas');
      if (c.width !== cw * dpr || c.height !== ch * dpr) {
        c.width = cw * dpr;
        c.height = ch * dpr;
      }
      const g = c.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      const ux = v.cx - (cw / 2) * v.scale;
      const uy = v.cy - (ch / 2) * v.scale;
      const s = dpr / v.scale;
      paint(g, dpr, s, -ux * s, -uy * s);
      cache.current = { canvas: c, scale: v.scale, ux, uy, cw, ch, key: paint, dpr };
    },
    [paint, size.w, size.h],
  );

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c || !view || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== size.w * dpr || c.height !== size.h * dpr) {
      c.width = size.w * dpr;
      c.height = size.h * dpr;
    }
    const k = cache.current;
    const vux = view.cx - (size.w / 2) * view.scale;
    const vuy = view.cy - (size.h / 2) * view.scale;
    const same = k && k.key === paint && k.dpr === dpr && Math.abs(k.scale - view.scale) < view.scale * 1e-9;
    const inside =
      same && vux >= k!.ux && vuy >= k!.uy && vux + size.w * view.scale <= k!.ux + k!.cw * k!.scale && vuy + size.h * view.scale <= k!.uy + k!.ch * k!.scale;
    window.clearTimeout(settle.current);
    if (!k || k.key !== paint || k.dpr !== dpr || (same && !inside)) build(view, dpr);
    else if (same) {
      // At rest after a pan, painted again on the view's own pixels so hairlines stay sharp.
      const v = view;
      settle.current = window.setTimeout(() => {
        build(v, dpr);
        blit(c, v, dpr);
      }, 220);
    } else {
      // A zoom in progress: the last image is scaled now and painted again once the zoom rests.
      const v = view;
      settle.current = window.setTimeout(() => {
        build(v, dpr);
        blit(c, v, dpr);
      }, 140);
    }
    blit(c, view, dpr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, size.w, size.h, paint, build]);

  function blit(c: HTMLCanvasElement, v: View, dpr: number) {
    const k = cache.current;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = SEA;
    ctx.fillRect(0, 0, c.width, c.height);
    if (!k) return;
    const vux = v.cx - (size.w / 2) * v.scale;
    const vuy = v.cy - (size.h / 2) * v.scale;
    const r = k.scale / v.scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(k.canvas, ((k.ux - vux) / v.scale) * dpr, ((k.uy - vuy) / v.scale) * dpr, k.cw * r * dpr, k.ch * r * dpr);
  }

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
        moved.current = true;
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

  // Two fingers on a touch screen zoom about their middle.
  const touches = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ dist: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!view || !proj || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-world-ui]')) return;
    const [x, y] = local(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    touches.current.set(e.pointerId, [x, y]);
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      pinch.current = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 };
      drag.current = null;
      return;
    }
    drag.current = { x, y, view, mode: drawing ? 'box' : 'pan', a: proj.geo(x, y), moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const [x, y] = local(e);
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, [x, y]);
    if (pinch.current && touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pinch.current.dist / dist);
      pinch.current = { dist };
      return;
    }
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
      if (d.moved) moved.current = true;
      setView(clampView({ ...d.view, cx: d.view.cx - (x - d.x) * d.view.scale, cy: d.view.cy - (y - d.y) * d.view.scale }, size.w, size.h));
    } else if (proj && d.a) {
      setDraft(boxOf(d.a, proj.geo(x, y)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (pinch.current) {
      if (touches.current.size < 2) pinch.current = null;
      drag.current = null;
      return;
    }
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
    moved.current = true;
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
      onPointerCancel={onPointerUp}
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
