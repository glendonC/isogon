import { useEffect, useState } from 'react';
import type { StageFireAnchor, StageTileAnchor } from '../stage/earthCutawayTypes';
import type { ScriptAction } from './script';
import '../styles/guide.css';

/**
 * The guide's words that belong to things on the stage: a label joined to its thing by a leader, and a prompt beside
 * the thing it acts on, shown only while the pointer or the keyboard's focus is on or near that thing. They stand
 * beside a thing's extent, never on its marks.
 */

/** The stage's latest value from a subscription, at most once a frame, without redrawing the shell. */
export function useStageValue<T>(subscribe: (fn: (v: T) => void) => () => void, initial: T, same: (a: T, b: T) => boolean): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let latest = initial;
    let frame = 0;
    const off = subscribe((v) => {
      latest = v;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setValue((was) => (same(was, latest) ? was : latest));
      });
    });
    return () => {
      off();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [subscribe]); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

export const sameFireAnchor = (a: StageFireAnchor | null, b: StageFireAnchor | null) =>
  a === b ||
  Boolean(a && b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && a.right === b.right && a.visible === b.visible);

export const sameTileAnchors = (a: StageTileAnchor[], b: StageTileAnchor[]) =>
  a.length === b.length && a.every((x, i) => x.tile === b[i].tile && x.visible === b[i].visible && Math.abs(x.x - b[i].x) < 0.5 && Math.abs(x.y - b[i].y) < 0.5);

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How near a thing's extent the pointer must come for its prompt to show, px. */
export const NEAR = 48;
/** For a thing that spreads over much of the screen, how near its anchor instead, px. */
export const NEAR_ANCHOR = 150;
/** The room a prompt takes beside its thing, px. */
const PROMPT_W = 320;

/** True while the pointer is within `NEAR` of the box, or for a large box within `NEAR_ANCHOR` of the point. */
export function usePointerNear(box: Box | null, at: { x: number; y: number } | null): boolean {
  const [near, setNear] = useState(false);
  const compact = isCompact(box);
  useEffect(() => {
    if (!box || !at) {
      setNear(false);
      return;
    }
    const onMove = (e: PointerEvent) => {
      const inside = compact
        ? e.clientX >= box.left - NEAR && e.clientX <= box.right + NEAR && e.clientY >= box.top - NEAR && e.clientY <= box.bottom + NEAR
        : Math.hypot(e.clientX - at.x, e.clientY - at.y) <= NEAR_ANCHOR;
      setNear((was) => (was === inside ? was : inside));
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [compact, box?.left, box?.top, box?.right, box?.bottom, at?.x, at?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  return near;
}

/** A thing that fills less than half the screen either way has sides to stand beside. */
export const isCompact = (box: Box | null) =>
  Boolean(box && box.right - box.left < window.innerWidth * 0.5 && box.bottom - box.top < window.innerHeight * 0.5);

/** Where a prompt stands: right of the box, else left of it; for a large box, just off its anchor. */
export function promptPlace(box: Box | null, at: { x: number; y: number } | null): { left: number; top: number } | null {
  if (!box || !at) return null;
  const W = window.innerWidth;
  if (!isCompact(box)) return { left: Math.min(at.x + 18, W - 24 - PROMPT_W), top: at.y + 10 };
  const mid = (box.top + box.bottom) / 2 - 10;
  return box.right + 16 + PROMPT_W <= W - 24 ? { left: box.right + 16, top: mid } : { left: Math.max(24, box.left - 16 - PROMPT_W), top: mid };
}

/** A label at a point on the stage, joined to it by a leader, hanging above or below by where the point is. */
export function StageLabel({
  at,
  text,
  className,
  onFocusChange,
}: {
  at: { x: number; y: number };
  text: string;
  className?: string;
  onFocusChange?: (focused: boolean) => void;
}) {
  const hang = at.y < 300 ? 'below' : 'above';
  const side = at.x > window.innerWidth - 460 ? 'left' : 'right';
  return (
    <div
      className={`sys-pin guide-pin${className ? ` ${className}` : ''}`}
      data-hang={hang}
      data-side={side}
      style={{ ['--x' as string]: `${at.x}px`, ['--y' as string]: `${at.y}px`, ['--lead' as string]: hang === 'below' ? '72px' : '96px' }}
    >
      <span className="sys-pin__leader" />
      <span className="sys-pin__anchor" />
      <div
        className="sys-pin__plate wm-label"
        tabIndex={onFocusChange ? 0 : undefined}
        aria-label={text}
        onFocus={onFocusChange ? () => onFocusChange(true) : undefined}
        onBlur={onFocusChange ? () => onFocusChange(false) : undefined}
      >
        <span className="guide-label">{text}</span>
      </div>
    </div>
  );
}

/** The prompt: the action's key as a small mark, then its label. */
export function StagePrompt({ at, act, onAct }: { at: { left: number; top: number }; act: ScriptAction; onAct: (command: string) => void }) {
  return (
    <button type="button" className="guide-prompt" style={{ left: at.left, top: at.top }} onClick={() => onAct(act.command)}>
      {act.key && <kbd className="guide-key">{act.key}</kbd>}
      <span>{act.label}</span>
    </button>
  );
}
