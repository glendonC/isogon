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
