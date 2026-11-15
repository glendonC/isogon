import { useLayoutEffect, useRef, useState } from 'react';
import { layoutTicks, type Tick } from './tickLayout.ts';

export type { Tick };

/** The numbers under a ramp, none touching another at any width of the legend. */
export function Ticks({ ticks }: { ticks: Tick[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Array<{ x: number; shown: boolean }> | null>(null);
  const sig = ticks.map((k) => `${k.key}:${k.t}:${k.label}`).join('|');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const spans = [...el.querySelectorAll<HTMLSpanElement>('span[data-tick]')];
      const next = layoutTicks(ticks, spans.map((s) => s.offsetWidth), el.clientWidth);
      setLayout((prev) =>
        prev && prev.length === next.length && prev.every((p, i) => p.shown === next[i].shown && Math.abs(p.x - next[i].x) < 0.5) ? prev : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // The ticks are compared by their signature, not by the array's identity.
  }, [sig]);
  return (
    <div className="world-ticks" ref={ref}>
      {ticks.map((k, i) => {
        const at = layout?.[i];
        return (
          <span
            key={k.key}
            data-tick
            data-placed={at ? 'true' : 'false'}
            style={at ? { left: `${at.x}px`, visibility: at.shown ? undefined : 'hidden' } : { left: `${k.t * 100}%` }}
          >
            {k.label}
          </span>
        );
      })}
    </div>
  );
}
