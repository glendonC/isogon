import { useEffect, useRef, useState } from 'react';
import { sweepAt } from './scene.ts';
import './identity.css';

export interface RevealSweepProps {
  /** Each new value runs the sweep once across the screen. 0 or less: nothing runs. */
  run: number;
  ms?: number;
  /** Called every frame with the share of the screen crossed (0 to 1), so the stage can show what lies behind it. */
  onProgress?: (p: number) => void;
  onDone?: () => void;
}

/**
 * The moment the hidden satellite is shown: one line of the signal colour crosses the screen once, left to right, as a
 * pass crosses the ground. The stage reads its progress to uncover the detections behind the line.
 */
export function RevealSweep({ run, ms = 1600, onProgress, onDone }: RevealSweepProps) {
  const [p, setP] = useState<number | null>(null);
  const cbs = useRef({ onProgress, onDone });
  cbs.current = { onProgress, onDone };

  useEffect(() => {
    if (run <= 0) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      cbs.current.onProgress?.(1);
      cbs.current.onDone?.();
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const v = sweepAt(now - t0, ms);
      setP(v);
      cbs.current.onProgress?.(v);
      if (v < 1) raf = requestAnimationFrame(tick);
      else {
        setP(null);
        cbs.current.onDone?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, ms]);

  if (p === null) return null;
  return <div className="id-sweep" aria-hidden="true" style={{ left: `${(p * 100).toFixed(3)}%` }} />;
}
