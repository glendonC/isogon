import { useEffect, useMemo } from 'react';
import type { FeaturedFire, Place } from '../app/places';
import { ComparePlane } from './ComparePlane';
import { fireBlock } from './blocks';
import { useFireRun } from './fireRuns';

export interface FireBlockProps {
  place: Place;
  fire: FeaturedFire;
  /** A click on the block. */
  onPick?: () => void;
  /** The credit of the image the block stands on, for the page's one imagery line; null while there is none. */
  onCredit?: (credit: string | null) => void;
  /** Said while the fire's run is coming, and when it does not answer. */
  loadingWords?: string;
  failedWords?: string;
}

/**
 * One featured fire as one block of its own terrain, with the coarse satellite's detections of its run as a wash in
 * the detection colour: the picture of a fire before it is chosen. It fills its parent. Nothing of a hidden
 * satellite is drawn.
 */
export function FireBlock({ place, fire, onPick, onCredit, loadingWords = 'Loading this fire', failedWords = 'This fire did not load.' }: FireBlockProps) {
  const got = useFireRun(place, fire);
  const block = useMemo(() => (got.state === 'ready' ? fireBlock(place, fire, got.run) : null), [got, place, fire]);
  const credit = block?.ground.imageCredit ?? null;
  useEffect(() => {
    onCredit?.(credit);
  }, [credit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onCredit?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!block) {
    return (
      <p className="cmp-fireblock__status sys-label" role="status">
        {got.state === 'failed' ? failedWords : loadingWords}
      </p>
    );
  }
  return (
    <ComparePlane
      blocks={[block]}
      perRow={1}
      labelSpace={0}
      ariaLabel={`${fire.label}, ${place.name}`}
      renderLabel={() => null}
      onPick={onPick ? () => onPick() : undefined}
    />
  );
}
