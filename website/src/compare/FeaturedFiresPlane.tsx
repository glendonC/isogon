import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeaturedFire, Place, Places } from '../app/places';
import { useWorkspace } from '../app/store';
import { ComparePlane } from './ComparePlane';
import { fireBlock } from './blocks';
import { fireRun, fireRunBody } from './fireRuns';
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
  /** How many blocks stand in a row. Default: by how many fires there are (`rowOf`). */
  perRow?: number | 'fit';
  /** Only the fires of these places, when given. */
  onlyPlaces?: readonly string[] | null;
  /** The place whose block the pointer or the focus is on, or none. */
  onHoverPlace?: (placeId: string | null) => void;
  /** The fire whose block the pointer or the focus is on, or none. */
  onHoverFire?: (fire: { place: Place; fire: FeaturedFire } | null) => void;
  /** The plane's progress while the fires' runs come in, and whether it is complete. */
  onProgress?: (got: number, of: number) => void;
  /** The credits of the images the blocks are drawn on, for the page's one imagery line. */
  onCredits?: (credits: string[]) => void;
}

const defaultBody = fireRunBody;
const runOf = fireRun;

/**
 * How many blocks stand in a row: up to three fires in one row, up to six in rows of three. With more than six the
 * plane is dense and takes the count of columns that draws its blocks largest in its room; a label then carries the
 * period, the place and what the fire is to the model, and the longer sentence about a fire is the page's to show
 * beside the plane (`onHoverFire`).
 */
export const rowOf = (n: number): number | 'fit' => (n <= 3 ? Math.max(1, n) : n <= 6 ? 3 : 'fit');

/** Room under a block for its label and the action that appears at it, so nothing a label grows into is covered. */
const LABEL_SPACE = 112;
// Two lines for the period, two for the place, one or two for what the fire is to the model, and the action
const LABEL_SPACE_DENSE = 124;

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
  onlyPlaces = null,
  onHoverPlace,
  onHoverFire,
  onProgress,
  onCredits,
}: FeaturedFiresPlaneProps) {
  const every = useMemo(
    () =>
      places.places.flatMap((place) =>
        place.featured_fires
          .filter((fire) => fire.default_start && (include === 'all' || !fire.blind_test_fire))
          .map((fire) => ({ place, fire })),
      ),
    [places, include],
  );
  const onlyKey = onlyPlaces ? onlyPlaces.join('|') : '';
  // The runs are asked for every fire once; a narrowing to some places only draws fewer of them
  const fires = useMemo(() => (onlyKey ? every.filter((f) => onlyKey.split('|').includes(f.place.id)) : every), [every, onlyKey]);
  const progress = useRef(onProgress);
  progress.current = onProgress;
  // The runs arrive one at a time and the plane is drawn once all have answered, so nothing moves as they come in
  const [runs, setRuns] = useState<Map<string, unknown> | null>(null);
  useEffect(() => {
    let live = true;
    setRuns(null);
    void (async () => {
      const got = new Map<string, unknown>();
      // The open fires first, then the recorded test fires
      const order = [...every].sort((a, b) => Number(a.fire.blind_test_fire) - Number(b.fire.blind_test_fire));
      let done = 0;
      progress.current?.(0, order.length);
      for (const { place, fire } of order) {
        const run = await runOf((runBody ?? defaultBody)(place, fire));
        if (!live) return;
        if (run !== null) got.set(fire.id, run);
        progress.current?.(++done, order.length);
      }
      setRuns(got);
    })();
    return () => {
      live = false;
    };
  }, [every, runBody]);

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
  const dense = blocks.length > 6;
  return (
    <div className="cmp-fires" data-dense={dense ? 'true' : 'false'}>
      <ComparePlane
        blocks={blocks}
        perRow={perRow ?? rowOf(blocks.length)}
        labelSpace={dense ? LABEL_SPACE_DENSE : LABEL_SPACE}
        ariaLabel="Featured fires"
        onHover={(id) => {
          const hit = id ? of(id) ?? null : null;
          onHoverPlace?.(hit ? hit.place.id : null);
          onHoverFire?.(hit);
        }}
        onPick={(id) => {
          const hit = of(id);
          if (hit) onFire(hit.place, hit.fire);
        }}
        renderLabel={(block, anchor, hovered) => {
          const hit = of(block.id);
          if (!hit) return null;
          const more = about?.(hit.fire) ?? null;
          const what = standing?.(hit.fire) ?? null;
          // A label is as wide as its block's column and no wider, so labels side by side never meet
          const width = Math.max(130, Math.min(300, Math.round(anchor.rect.width * 1.07 - 8)));
          return (
            <div className="cmp-fire" data-hovered={hovered ? 'true' : 'false'} style={{ width }}>
              <span className="cmp-fire__period">{hit.fire.label}</span>
              {/* While the pointer or the focus is on the block, the sentence about the fire stands where its place
                  is named at rest: the page's map says the place then. On a dense plane the sentence is too long for
                  the room under a block and the page shows it beside the plane instead. */}
              <span className="sys-label cmp-fire__place">{hovered && more && !dense ? more : hit.place.name}</span>
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
