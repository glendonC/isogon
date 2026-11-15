import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryPart } from '../identity/story';

/**
 * Play: the page tells its story by itself, shot by shot, and hands it back on the visitor's first key, click or
 * wheel, leaving them on the screen it had reached with its controls. A shot starts its screen, waits until the screen
 * is ready (at most `wait` ms, then it goes on), holds for its reading time, and the next begins; after the last, the
 * page is handed back where it ends.
 */
export interface PlayShot {
  part: StoryPart;
  start: () => void;
  ready: () => boolean;
  /** Reading time once ready, ms. */
  hold: number;
}

const WAIT = 25000;
const TICK = 200;

/**
 * The hand-back's one listener for each of key, click and wheel, on the window in the capture phase, installed when this
 * module is first read: main.tsx reads it before the page, so it hears a key before the pictures of the world, which
 * keep their keys from everything after them (world/keys.ts).
 */
let takeBack: (() => void) | null = null;
if (typeof window !== 'undefined') {
  const opts = { capture: true, passive: true } as const;
  const take = () => takeBack?.();
  window.addEventListener('keydown', take, opts);
  window.addEventListener('pointerdown', take, opts);
  window.addEventListener('wheel', take, opts);
}

export function usePlay(shots: () => PlayShot[], onEnd: () => void) {
  const [playing, setPlaying] = useState(false);
  const [part, setPart] = useState<StoryPart | null>(null);
  const [progress, setProgress] = useState(0);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const run = useRef<{ i: number; began: number; readyAt: number | null; timer: number | null; off: (() => void) | null } | null>(null);

  const stop = useCallback(() => {
    const r = run.current;
    if (!r) return;
    if (r.timer !== null) window.clearInterval(r.timer);
    r.off?.();
    run.current = null;
    setPlaying(false);
    setPart(null);
    setProgress(0);
    endRef.current();
  }, []);

  const begin = useCallback((i: number) => {
    const r = run.current;
    const shot = shotsRef.current()[i];
    if (!r || !shot) return;
    r.i = i;
    r.began = performance.now();
    r.readyAt = null;
    setPart(shot.part);
    setProgress(0);
    shot.start();
  }, []);

  const start = useCallback(() => {
    if (run.current) return;
    run.current = { i: 0, began: performance.now(), readyAt: null, timer: null, off: null };
    setPlaying(true);
    begin(0);
    const r = run.current;
    r.timer = window.setInterval(() => {
      const cur = run.current;
      if (!cur) return;
      const list = shotsRef.current();
      const shot = list[cur.i];
      if (!shot) return stop();
      const now = performance.now();
      if (cur.readyAt === null) {
        if (shot.ready() || now - cur.began > WAIT) cur.readyAt = now;
        return;
      }
      const p = Math.min(1, (now - cur.readyAt) / shot.hold);
      setProgress(p);
      if (p < 1) return;
      if (cur.i + 1 < list.length) begin(cur.i + 1);
      else stop();
    }, TICK);
    // The hand-back: armed a moment after the start, so the key or click that started Play does not stop it.
    const arm = window.setTimeout(() => {
      if (run.current) takeBack = stop;
    }, 400);
    r.off = () => {
      window.clearTimeout(arm);
      takeBack = null;
    };
  }, [begin, stop]);

  useEffect(() => () => {
    const r = run.current;
    if (r?.timer != null) window.clearInterval(r.timer);
    r?.off?.();
  }, []);

  return { playing, part, progress, start, stop };
}
