import { useEffect, useState } from 'react';
import type { StageFireAnchor, StageTileAnchor } from '../stage/earthCutawayTypes';
import '../styles/guide.css';

/**
 * What the scenes read from the stage: its latest values, at most once a frame. The action on a thing is the identity's
 * ScenePrompt (identity/ScenePrompt.tsx).
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
