import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeaturedFire, Place, Places } from '../app/places';
import { useWorkspace } from '../app/store';
import { canonicalJson, postJson, runRequestBody } from '../lib/api';
import { ComparePlane } from './ComparePlane';
import { fireBlock } from './blocks';
import type { CompareBlock } from './types';

/**
 * The registry's featured fires as cut-outs on one plane, for choosing a place: one block per fire, in the registry's
 * order, at one scale. A pick shows the fire; the fire on the land carries the corner marks.
 *
 * Each block is drawn from the run of the fire's start: the run with the sharp satellite held out, and never its
 * reveal. Only the coarse satellite's detections are drawn. A fire whose run does not answer has no block.
 *
 * A block's label is short: the fire's period, its place, and what the page says the fire is to the model. While the
 * pointer or the keyboard's focus is on a block, the page's sentence about the fire takes the place's line and the
 * action that shows the fire appears under it.
 *
 * The recorded test fires are left out unless `include` is `all`. Their block needs their run with every satellite;
 * with `all` they are asked for after the open fires and shown in the registry's order with them.
 */
export interface FeaturedFiresPlaneProps {
  places: Places;
  /** The featured fire on the land, marked with corner marks. */
  currentFire: string | null;
  onFire: (place: Place, fire: FeaturedFire) => void;
  /** `all` shows the recorded test fires too. Default `not-test-fires`. */
  include?: 'all' | 'not-test-fires';
  /** What a fire is to the model, in the page's own words, for the label's last line. */
  standing?: (fire: FeaturedFire) => string | null;
  /** One more sentence about a fire, in the page's own words, shown while the pointer or the focus is on its block. */
  about?: (fire: FeaturedFire) => string | null;
  /** The words of the action that shows a fire. Default "Show this fire". */
  showWords?: string;
  /** The body of a fire's run request, when the page has its own. Default: the page's client builds it. */
  runBody?: (place: Place, fire: FeaturedFire) => unknown;
  /** How many blocks stand in a row. Default: as many as fit. */
  perRow?: number;
  /** The place whose block the pointer or the focus is on, or none. */
  onHoverPlace?: (placeId: string | null) => void;
  /** The credits of the images the blocks are drawn on, for the page's one imagery line. */
  onCredits?: (credits: string[]) => void;
}

/**
 * The body the page shows a fire with, from the client's one builder: a recorded test fire with every satellite, any
 * other fire with the sharp one held out.
 */
const defaultBody = (place: Place, fire: FeaturedFire): unknown =>
  runRequestBody(place.id, fire.default_start ?? '', fire.blind_test_fire ? null : 'VIIRS');

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

/** Room under a block for its label and the action that appears at it, so nothing a label grows into is covered. */
const LABEL_SPACE = 112;

export function FeaturedFiresPlane({
  places,
  currentFire,
  onFire,
  include = 'not-test-fires',
  standing,
  about,
  showWords = 'Show this fire',
  runBody,
  perRow,
  onHoverPlace,
  onCredits,
}: FeaturedFiresPlaneProps) {
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
      // The open fires first, then the recorded test fires
      const order = [...fires].sort((a, b) => Number(a.fire.blind_test_fire) - Number(b.fire.blind_test_fire));
      for (const { place, fire } of order) {
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

  const credits = useMemo(() => [...new Set(blocks.map((b) => b.ground.imageCredit).filter((c): c is string => !!c))], [blocks]);
  const tell = useRef(onCredits);
  tell.current = onCredits;
  const creditKey = credits.join('\n');
  useEffect(() => {
    tell.current?.(creditKey ? creditKey.split('\n') : []);
  }, [creditKey]);

  if (blocks.length === 0) return null;
  const of = (id: string) => fires.find((f) => f.fire.id === id);
  return (
    <div className="cmp-fires">
      <ComparePlane
        blocks={blocks}
        perRow={perRow}
        labelSpace={LABEL_SPACE}
        ariaLabel="Featured fires"
        onHover={(id) => onHoverPlace?.(id ? of(id)?.place.id ?? null : null)}
        onPick={(id) => {
          const hit = of(id);
          if (hit) onFire(hit.place, hit.fire);
        }}
        renderLabel={(block, _anchor, hovered) => {
          const hit = of(block.id);
          if (!hit) return null;
          const more = about?.(hit.fire) ?? null;
          const what = standing?.(hit.fire) ?? null;
          return (
            <div className="cmp-fire" data-hovered={hovered ? 'true' : 'false'}>
              <span className="cmp-fire__period">{hit.fire.label}</span>
              {/* While the pointer or the focus is on the block, the sentence about the fire stands where its place
                  is named at rest: the page's map says the place then. */}
              <span className="sys-label">{hovered && more ? more : hit.place.name}</span>
              {what && <span className="sys-label cmp-fire__standing">{what}</span>}
              <span className="cmp-fire__show">
                <span className="cmp-fire__key">Enter</span>
                {showWords}
              </span>
            </div>
          );
        }}
      />
    </div>
  );
}

/**
 * The featured fires from the workspace's own store: the registry, the fire on the land, and the store's way of
 * showing a fire. The words are the page's.
 */
export function FeaturedFires(props: Omit<FeaturedFiresPlaneProps, 'places' | 'currentFire' | 'onFire'>) {
  const ws = useWorkspace();
  return <FeaturedFiresPlane places={ws.places} currentFire={ws.currentFire} onFire={ws.calendar.chooseFire} {...props} />;
}
