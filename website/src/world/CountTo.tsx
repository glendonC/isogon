import { useEffect, useRef, useState } from 'react';

/**
 * A figure that arrives by counting to its value (the lead's design language: a figure counts to its value once, and
 * nothing fades in). From nought when it first appears, from the figure on show when its value changes. Under reduced
 * motion it shows the value at once.
 */
export function CountTo({ value, ms = 420, format = (v: number) => Math.round(v).toLocaleString('en-US') }: { value: number; ms?: number; format?: (v: number) => string }) {
  const [shown, setShown] = useState(0);
  const at = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    if (reduce || !Number.isFinite(value)) {
      at.current = value;
      setShown(value);
      return;
    }
    const from = at.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min((now - t0) / ms, 1);
      const v = from + (value - from) * (1 - Math.pow(1 - k, 3));
      at.current = v;
      setShown(k >= 1 ? value : v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{format(shown)}</>;
}
