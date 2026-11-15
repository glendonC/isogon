import { useMemo } from 'react';
import { useWorkspace } from '../app/store';
import { ComparePlane } from './ComparePlane';
import { threeWays } from './blocks';

/**
 * One fire three ways, side by side on the same ground: what the coarse satellite saw on its last pass before a
 * hidden pass, the model's estimate for that pass, and what the sharp satellite saw, with the count of scores and
 * its kind under them. It reads the run on show from the workspace and fills its parent. Its labels stand on the
 * scene with no plate.
 *
 * Nothing of the hidden satellite is read until the test stands revealed, whatever the run object holds: before
 * that the third block is withheld. On a run with nothing hidden it renders nothing.
 */
export function ThreeWaysPlane() {
  const ws = useWorkspace();
  const run = ws.run.active;
  const revealed = ws.test.revealed;
  const pass = ws.time.pass;
  const ways = useMemo(() => threeWays(run, revealed ? run : null, { at: pass }), [run, revealed, pass]);
  if (!ways) return null;
  return (
    <div className="cmp-ways">
      <ComparePlane blocks={ways.blocks} ariaLabel="One fire, side by side" />
      {ways.scoreLine && <p className="cmp-ways__score sys-body">{ways.scoreLine}</p>}
    </div>
  );
}
