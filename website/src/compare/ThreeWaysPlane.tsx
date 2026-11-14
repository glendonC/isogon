import { useMemo } from 'react';
import { useWorkspace } from '../app/store';
import { platformName } from '../content/realRuns';
import { ComparePlane } from './ComparePlane';
import { threeWays } from './blocks';

/**
 * One fire three ways, for World model: what MODIS saw on its last pass before a hidden pass, the estimate from
 * MODIS alone at that time, and what VIIRS saw, side by side on the same ground, with the window's count of
 * scores and its kind under them. It reads the run on show from the workspace and fills its parent.
 *
 * Nothing of the hidden satellite is read until the test stands revealed, whatever the run object holds: before
 * that the third block is withheld. On a run with nothing hidden it renders nothing.
 */
export function ThreeWaysPlane() {
  const ws = useWorkspace();
  const run = ws.run.active;
  const revealed = ws.test.revealed;
  const pass = ws.time.pass;
  const ways = useMemo(() => threeWays(run, revealed ? run : null, { at: pass, platformName }), [run, revealed, pass]);
  if (!ways) return null;
  return (
    <div className="cmp-ways">
      <ComparePlane blocks={ways.blocks} ariaLabel="One fire three ways" labelPlate />
      {ways.scoreLine && <p className="cmp-ways__score sys-label sys-plate">{ways.scoreLine}</p>}
    </div>
  );
}
