import { useEffect, useState } from 'react';
import type { FeaturedFire, Place } from '../app/places';
import { canonicalJson, postJson, runRequestBody } from '../lib/api';

/**
 * The run a featured fire is shown from: with the sharp satellite held out, or for a recorded test fire with every
 * satellite, on the fire's own region and its registry start, built by the page's one builder of a run's body.
 */
export const fireRunBody = (place: Place, fire: FeaturedFire): unknown =>
  runRequestBody(fire.region_id || place.id, fire.default_start ?? '', fire.blind_test_fire ? null : 'VIIRS');

/** Runs already asked for, by their request, so that a fire looked at twice costs one request. */
const asked = new Map<string, Promise<unknown | null>>();

/** At most two runs are built for these blocks at once; the rest wait their turn. */
const MOST_AT_ONCE = 2;
let building = 0;
const waiting: Array<() => void> = [];
const turn = () =>
  new Promise<void>((go) => {
    const start = () => {
      building += 1;
      go();
    };
    if (building < MOST_AT_ONCE) start();
    else waiting.push(start);
  });
const done = () => {
  building -= 1;
  waiting.shift()?.();
};

/** A run, asked once; null when it does not answer (and asked again next time). */
export function fireRun(body: unknown): Promise<unknown | null> {
  const key = canonicalJson(body);
  let hit = asked.get(key);
  if (!hit) {
    hit = turn()
      .then(() => postJson<unknown>('/api/reconstruct', body).finally(done))
      .catch(() => null);
    void hit.then((run) => {
      if (run === null) asked.delete(key);
    });
    asked.set(key, hit);
  }
  return hit;
}

/** How long a fire must stay looked at before its run is asked for, so that moving down a list asks for none. */
const DWELL_MS = 350;

export type FireRunState = { state: 'idle' | 'loading' | 'failed'; run: null } | { state: 'ready'; run: unknown };

/** The run of one fire, asked for when the fire is given and kept while it stays the same. */
export function useFireRun(place: Place | null, fire: FeaturedFire | null): FireRunState {
  const [got, setGot] = useState<FireRunState>({ state: 'idle', run: null });
  const key = place && fire ? canonicalJson(fireRunBody(place, fire)) : null;
  useEffect(() => {
    if (!place || !fire) {
      setGot({ state: 'idle', run: null });
      return;
    }
    let live = true;
    setGot({ state: 'loading', run: null });
    const ask = () =>
      void fireRun(fireRunBody(place, fire)).then((run) => {
        if (live) setGot(run === null ? { state: 'failed', run: null } : { state: 'ready', run });
      });
    // A run already asked for is read at once; a new one only once the fire has been looked at a moment
    const wait = asked.has(key ?? '') ? null : window.setTimeout(ask, DWELL_MS);
    if (wait === null) ask();
    return () => {
      live = false;
      if (wait !== null) window.clearTimeout(wait);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return got;
}
