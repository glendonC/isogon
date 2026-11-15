import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * A picture's own caption, top left where the page's objective stands: the objective on the page, the film's caption
 * in the film presentation (FILM-v3.md: one caption a shot, where the objective stands). Its height is reported, so the
 * picture lays out under it.
 */
export function WorldCaption({ line, children, onHeight }: { line: string | null; children?: ReactNode; onHeight?: (bottom: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !onHeight) return;
    const measure = () => onHeight(Math.round(el.offsetTop + el.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight, line]);
  if (!line) return null;
  return (
    <div className="world-caption" ref={ref} aria-live="polite">
      <p className="world-caption__line">{line}</p>
      {children}
    </div>
  );
}

/** Whether the page shows its film presentation (`iso-film` on the root element). */
export const inFilm = () => typeof document !== 'undefined' && document.documentElement.classList.contains('iso-film');

/**
 * The room kept at the bottom of a picture for the guide (`--world-guide-room`, else the film's or 150 px), in px: a
 * callback ref for an empty element of that height, measured whenever it is attached or resized.
 */
export function useGuideRoom(onRoom: (px: number) => void) {
  const ro = useRef<ResizeObserver | null>(null);
  return useCallback(
    (el: HTMLDivElement | null) => {
      ro.current?.disconnect();
      ro.current = null;
      if (!el) return;
      onRoom(el.offsetHeight);
      ro.current = new ResizeObserver(() => onRoom(el.offsetHeight));
      ro.current.observe(el);
    },
    [onRoom],
  );
}
