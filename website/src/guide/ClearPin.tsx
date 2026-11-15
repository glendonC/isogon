import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { placeClear, type Box } from './place';
import '../styles/guide.css';

/** The room the stage keeps for its labels: under the objective and the trail, above the guide's strip, px. */
const ROOM_TOP = 104;
const ROOM_BOTTOM = 220;
const ROOM_SIDE = 16;

/**
 * Words joined to a point on the stage by a leader, standing clear of every box they must not cover (the fire's
 * patches): the plate is measured, then placed by `placeClear`. The words sit on the scene over a soft scrim.
 */
export function ClearPin({
  at,
  avoid,
  className,
  plateClass,
  label,
  focusable = false,
  onFocusChange,
  onPick,
  children,
}: {
  at: { x: number; y: number };
  avoid: Box[];
  className?: string;
  plateClass?: string;
  label: string;
  focusable?: boolean;
  onFocusChange?: (focused: boolean) => void;
  /** The words picked with the pointer (Enter on them stays the guide's, as the prompt beside the fire says). */
  onPick?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The sizes measured for these words, latest last: a size that flips back to the one before (a plate whose size
  // still followed its place) is not taken again, so measuring and placing can never chase each other.
  const seen = useRef<{ label: string; sizes: string[] }>({ label, sizes: [] });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (Math.abs(w - size.w) <= 1 && Math.abs(h - size.h) <= 1) return;
    if (seen.current.label !== label) seen.current = { label, sizes: [] };
    const k = `${w}x${h}`;
    const sizes = seen.current.sizes;
    if (sizes.length >= 2 && sizes[sizes.length - 2] === k) return;
    seen.current.sizes = [...sizes.slice(-3), k];
    setSize({ w, h });
  });
  // The room is under the trail and above the guide's words as they stand on this screen (on a phone the objective
  // takes two lines and the guide's words half the height), never less than the fixed room of a wide screen.
  const trail = document.querySelector('.guide-trail')?.getBoundingClientRect();
  const strip = document.querySelector('.guide-strip')?.getBoundingClientRect();
  const top = Math.max(ROOM_TOP, trail && trail.height > 0 ? trail.bottom + 12 : 0);
  const below = Math.min(window.innerHeight - ROOM_BOTTOM, strip && strip.height > 0 ? strip.top - 12 : Infinity);
  const room: Box = { left: ROOM_SIDE, top, right: window.innerWidth - ROOM_SIDE, bottom: Math.max(below, top + size.h) };
  const p = placeClear(at, size, avoid, room);
  return (
    <div className={`guide-clear${className ? ` ${className}` : ''}`}>
      <svg className="guide-clear__leader" aria-hidden="true">
        <line x1={at.x} y1={at.y} x2={p.end.x} y2={p.end.y} />
      </svg>
      <span className="sys-pin__anchor guide-clear__anchor" style={{ left: at.x - 3, top: at.y - 3 }} aria-hidden="true" />
      <div
        ref={ref}
        className={`guide-clear__plate${plateClass ? ` ${plateClass}` : ''}`}
        style={{ left: p.left, top: p.top, visibility: size.w > 0 ? 'visible' : 'hidden' }}
        tabIndex={focusable ? 0 : undefined}
        aria-label={label}
        onFocus={onFocusChange ? () => onFocusChange(true) : undefined}
        onBlur={onFocusChange ? () => onFocusChange(false) : undefined}
        onClick={onPick}
        data-pick={onPick ? 'true' : undefined}
      >
        {children}
      </div>
    </div>
  );
}

/** The boxes a label must stand clear of: each patch of the fire, or the whole fire where the stage gives no patches. */
export function patchBoxes(anchor: { left: number; top: number; right: number; bottom: number; patches?: Box[] } | null): Box[] {
  if (!anchor) return [];
  if (Array.isArray(anchor.patches) && anchor.patches.length > 0) return anchor.patches.map((b) => ({ left: b.left, top: b.top, right: b.right, bottom: b.bottom }));
  return anchor.right > anchor.left ? [{ left: anchor.left, top: anchor.top, right: anchor.right, bottom: anchor.bottom }] : [];
}
