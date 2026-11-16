import { useSyncExternalStore } from 'react';

/**
 * The descent from the Earth into a place: the place chosen while the Earth's years are on show, which the globe flies
 * into and frames by name before the page lands on the place's own ground. The page sets it (App.tsx) and clears it
 * once the place's fire is drawn; the Earth's years read it (EarthYears.tsx through WorldScreens.tsx).
 */
export interface Descent {
  id: string;
  name: string;
  /** The place's box, west, south, east, north, in degrees. */
  box: readonly [number, number, number, number];
}

let current: Descent | null = null;
const listeners = new Set<() => void>();

export function setDescent(next: Descent | null): void {
  if (next === current) return;
  current = next;
  listeners.forEach((fn) => fn());
}

export function descentOnShow(): Descent | null {
  return current;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useDescent(): Descent | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** A box as one closed ring of [lon, lat], for the globe's flight and outline. */
export function boxRings(box: readonly [number, number, number, number]): number[][][] {
  const [w, s, e, n] = box;
  return [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
}

/** The box's middle, "40.05 N  121.18 W", from the box itself. */
export function boxMiddle(box: readonly [number, number, number, number]): { lat: number; lon: number } {
  return { lat: (box[1] + box[3]) / 2, lon: (box[0] + box[2]) / 2 };
}

/**
 * The ascent: the place the visitor goes back up to the Earth from. The Earth's years open drawn near on it and draw
 * out to the whole globe, its pin marked by name, so the visitor sees which mark they came from. Cleared once the
 * visitor points at something on the globe, or opens a place.
 */
let ascent: Descent | null = null;
const ascentListeners = new Set<() => void>();

export function setAscent(next: Descent | null): void {
  if (next === ascent) return;
  ascent = next;
  ascentListeners.forEach((fn) => fn());
}

export function useAscent(): Descent | null {
  return useSyncExternalStore(
    (fn) => {
      ascentListeners.add(fn);
      return () => {
        ascentListeners.delete(fn);
      };
    },
    () => ascent,
    () => null,
  );
}
