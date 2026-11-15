import { useEffect, useRef, useState } from 'react';
import { countAt } from './scene.ts';

export interface CountProps {
  /** The value it runs to, from the route. Null shows nothing. */
  value: number | null;
  ms?: number;
  /** How the whole number is written, for example with a unit: (n) => `${n} detections`. */
  format?: (n: number) => string;
  className?: string;
}

/**
 * A figure that runs to its value when it arrives or changes, eased out, in whole numbers, ending exact. Under reduced
 * motion it shows the value at once. Readers get the final value only.
 */
export function Count({ value, ms = 1500, format, className }: CountProps) {
  const [shown, setShown] = useState<number | null>(value === null ? null : 0);
  const from = useRef(0);

  useEffect(() => {
    if (value === null) {
      setShown(null);
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const start = from.current;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const n = start + countAt(now - t0, value - start, ms);
      setShown(n);
      if (now - t0 < ms) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, ms]);

  if (shown === null || value === null) return null;
  const text = (n: number) => (format ? format(n) : String(n));
  return (
    <span className={`id-count${className ? ` ${className}` : ''}`} aria-label={text(value)}>
      <span aria-hidden="true">{text(shown)}</span>
    </span>
  );
}
