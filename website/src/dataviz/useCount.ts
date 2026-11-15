import { useEffect, useRef, useState } from 'react';
import { MOTION, countTo } from './tokens';

/**
 * A figure that counts to its value once, in `MOTION.countMs`, when it first appears or its value changes.
 * Returns the value to print; with reduced motion it is the value at once.
 */
export function useCount(value: number, durationMs: number = MOTION.countMs): number {
  const reduced =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(reduced ? value : 0);
  const frame = useRef(0);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return undefined;
    }
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      setShown(countTo(value, elapsed, durationMs));
      if (elapsed < durationMs) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value, durationMs, reduced]);
  return shown;
}
