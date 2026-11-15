import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { readoutPosition } from './readoutPlace';

export interface ReadoutState {
  text: string;
  x: number;
  y: number;
}

/**
 * A box for a display whose children report what is under the pointer: call `show(text, event)` on pointer move
 * and `hide()` on leave. The exact readout follows the pointer in the mono type.
 */
export function ReadoutBox({ children, label }: { children: (api: { show: (text: string, e: ReactPointerEvent) => void; hide: () => void }) => ReactNode; label?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ReadoutState | null>(null);
  const show = useCallback((text: string, e: ReactPointerEvent) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    setState({ text, x: e.clientX - box.left, y: e.clientY - box.top });
  }, []);
  const hide = useCallback(() => setState(null), []);
  let pos = { left: 0, top: 0 };
  if (state && boxRef.current) {
    const box = boxRef.current.getBoundingClientRect();
    const tip = tipRef.current?.getBoundingClientRect();
    pos = readoutPosition(state.x, state.y, box, { width: tip?.width ?? 280, height: tip?.height ?? 30 });
  }
  return (
    <div ref={boxRef} className="dv-figure" aria-label={label}>
      {children({ show, hide })}
      {state ? (
        <div ref={tipRef} className="dv-readout" role="status" style={{ left: pos.left, top: pos.top }}>
          {state.text}
        </div>
      ) : null}
    </div>
  );
}
