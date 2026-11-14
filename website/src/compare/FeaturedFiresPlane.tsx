import { useEffect, useMemo, useState } from 'react';
import type { FeaturedFire, Place, Places } from '../app/places';
import { useWorkspace } from '../app/store';
import { canonicalJson, postJson } from '../lib/api';
import { ComparePlane } from './ComparePlane';
import { fireBlock } from './blocks';
import type { CompareBlock } from './types';

/**
 * The registry's featured fires as cut-outs on one plane, for the place screen: one block per fire, in the
 * registry's order, at one scale. A pick opens the fire; the fire on the terrain carries the brackets.
 *
 * Each block is drawn from the run of the fire's start. A fire that is not a recorded test fire: the run with the
 * sharp satellite held out, and never its reveal. A recorded test fire: the run with every satellite, which is the
 * one the product shows for it. Either way only the coarse satellite's detections are drawn. A fire whose run does
 * not answer has no block.
 */
export interface FeaturedFiresPlaneProps {
  places: Places;
  /** The featured fire on the terrain, marked with brackets. */
  currentFire: string | null;
  onFire: (place: Place, fire: FeaturedFire) => void;
  /** `not-test-fires` leaves the recorded test fires out. Default `all`. */
  include?: 'all' | 'not-test-fires';
  /** What a fire is to the model, in the page's own words, for the block's last line. */
  standing?: (fire: FeaturedFire) => string | null;
  /** The body of a fire's run request, when the shell has its own: it must be the body the shell opens the fire with. */
  runBody?: (place: Place, fire: FeaturedFire) => unknown;
}

/**
 * The body the shell opens a fire with (`executeWorldModel` in App.tsx), so that the plane's request is the one
 * the page already makes: a recorded test fire with every satellite, any other fire with the sharp one held out.
 */
const defaultBody = (place: Place, fire: FeaturedFire): unknown => ({
  holdout_viirs: !fire.blind_test_fire,
  cloud_override: null,
  source: 'firms',
  start: fire.default_start,
  ...(fire.blind_test_fire ? {} : { holdout: 'viirs' }),
  region_id: place.id,
});

/** Runs already asked for, by their request, so that opening the place screen again costs nothing. */
const asked = new Map<string, Promise<unknown | null>>();

function runOf(body: unknown): Promise<unknown | null> {
  const key = canonicalJson(body);
  let hit = asked.get(key);
  if (!hit) {
    hit = postJson<unknown>('/api/reconstruct', body).catch(() => null);
    void hit.then((run) => {
      if (run === null) asked.delete(key);
    });
    asked.set(key, hit);
  }
  return hit;
}

export function FeaturedFiresPlane({ places, currentFire, onFire, include = 'all', standing, runBody }: FeaturedFiresPlaneProps) {
  const fires = useMemo(
    () =>
      places.places.flatMap((place) =>
        place.featured_fires
          .filter((fire) => fire.default_start && (include === 'all' || !fire.blind_test_fire))
          .map((fire) => ({ place, fire })),
      ),
    [places, include],
  );
  // The runs arrive one at a time and the plane is drawn once all have answered, so nothing moves as they come in
  const [runs, setRuns] = useState<Map<string, unknown> | null>(null);
  useEffect(() => {
    let live = true;
    setRuns(null);
    void (async () => {
      const got = new Map<string, unknown>();
      for (const { place, fire } of fires) {
        const run = await runOf((runBody ?? defaultBody)(place, fire));
        if (!live) return;
        if (run !== null) got.set(fire.id, run);
      }
      setRuns(got);
    })();
    return () => {
      live = false;
    };
  }, [fires, runBody]);

  const blocks = useMemo(() => {
    if (!runs) return [];
    const made: CompareBlock[] = [];
    for (const { place, fire } of fires) {
      const run = runs.get(fire.id);
      const block = run ? fireBlock(place, fire, run, { standing: standing?.(fire) ?? null }) : null;
      if (block) made.push(fire.id === currentFire ? { ...block, state: 'selected' } : block);
    }
    return made;
  }, [runs, fires, currentFire, standing]);

  if (blocks.length === 0) return null;
  return (
    <div className="cmp-fires">
      <ComparePlane
        blocks={blocks}
        ariaLabel="Featured fires"
        labelPlate
        onPick={(id) => {
          const hit = fires.find((f) => f.fire.id === id);
          if (hit) onFire(hit.place, hit.fire);
        }}
      />
    </div>
  );
}

/**
 * The featured fires from the workspace's own store: the registry, the fire on the terrain, and the store's way of
 * opening a fire. `standing` is the page's own wording of what a fire is to the model, when it has one.
 */
export function FeaturedFires({ standing }: { standing?: (fire: FeaturedFire) => string | null }) {
  const ws = useWorkspace();
  return <FeaturedFiresPlane places={ws.places} currentFire={ws.currentFire} onFire={ws.calendar.chooseFire} standing={standing} />;
}
