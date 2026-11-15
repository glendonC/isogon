import { useSyncExternalStore } from 'react';

/**
 * The places the Earth offers as destinations: each place with a fire to open, by name and box, and the page's own way
 * to open one (the same as choosing it by name in the search). The page publishes them (App.tsx); the Earth's years
 * mark them on the globe and open one on a click (EarthYears.tsx through WorldScreens.tsx).
 */
export interface Destination {
  id: string;
  name: string;
  /** West, south, east, north, in degrees. */
  box: readonly [number, number, number, number];
}

export interface Destinations {
  places: Destination[];
  open: ((id: string) => void) | null;
}

let current: Destinations = { places: [], open: null };
const listeners = new Set<() => void>();

export function setDestinations(next: Destinations): void {
  current = next;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useDestinations(): Destinations {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/**
 * The place under a point, or null: inside its mark (`markBox`, the square drawn on the globe) grown by `margin` degrees
 * on each side, the nearest centre first where two overlap.
 */
export function placeAt<T extends Destination>(places: readonly T[], lon: number, lat: number, margin = 0.3): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const p of places) {
    const [w, s, e, n] = markBox(p.box);
    if (lon < w - margin || lon > e + margin || lat < s - margin || lat > n + margin) continue;
    const d = Math.hypot(lon - (w + e) / 2, lat - (s + n) / 2);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * A place's mark on the whole globe: a square of `half` degrees of arc about its middle (wider in longitude away from
 * the equator so it stays square), or its own box where that is larger. A place's box is a few pixels across on the
 * whole globe; the mark is what a visitor can see and point at.
 */
export function markBox(box: readonly [number, number, number, number], half = 1.4): [number, number, number, number] {
  const [w, s, e, n] = box;
  const lat = (s + n) / 2;
  const lon = (w + e) / 2;
  const hl = Math.max((e - w) / 2, half / Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  const ht = Math.max((n - s) / 2, half);
  return [lon - hl, lat - ht, lon + hl, lat + ht];
}
