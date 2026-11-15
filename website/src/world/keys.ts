import { useEffect, useRef } from 'react';

/**
 * The keys of the pictures of the world. One listener, in the capture phase on the window, installed when this module
 * is first read: before any screen of the page mounts its own, so a picture that opens over a screen (the Record, the
 * choice of a place) hears its keys first and the screen under it does not hear them at all.
 *
 * A handler returns true for a key it used; that key is then stopped. Handlers of the `screen` layer are asked first,
 * the latest mounted first; the `host` layer last (the host closes on Escape and keeps every other key from the page
 * under it while a picture shows).
 */

export type KeyLayer = 'screen' | 'host';
type Entry = { layer: KeyLayer; handle: (e: KeyboardEvent) => boolean };

const entries: Entry[] = [];

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return Boolean(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
}

function route(e: KeyboardEvent) {
  if (typing(e)) return;
  for (const layer of ['screen', 'host'] as const) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const x = entries[i];
      if (x.layer !== layer) continue;
      if (x.handle(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }
  }
}

if (typeof window !== 'undefined') window.addEventListener('keydown', route, true);

/** A picture's keys while it is mounted; `handle` sees every key and returns true for the ones it used. */
export function useWorldKeys(handle: (e: KeyboardEvent) => boolean, layer: KeyLayer = 'screen', active = true) {
  const ref = useRef(handle);
  ref.current = handle;
  useEffect(() => {
    if (!active) return;
    const entry: Entry = { layer, handle: (e) => ref.current(e) };
    entries.push(entry);
    return () => {
      const i = entries.indexOf(entry);
      if (i >= 0) entries.splice(i, 1);
    };
  }, [layer, active]);
}
