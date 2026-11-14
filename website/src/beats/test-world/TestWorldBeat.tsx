import { RoundReadout } from '../../components/NextLookRound';
import { useWorkspace } from '../../app/store';

/**
 * Test world: one round of the next-look environment on the run, a person spending the looks. The round's state
 * and routes are the shell's today; this folder is where the round's own modules move when the beat is rebuilt.
 */
export function TestWorldBeat() {
  const ws = useWorkspace();
  const { round, blocked } = ws;
  if (!round.state) {
    return (
      <>
        <h2 className="iso-step__title">Your look</h2>
        <p className="iso-step__line">{blocked.look ?? 'Starting a round.'}</p>
      </>
    );
  }
  return (
    <RoundReadout
      start={round.start}
      end={round.end}
      round={round.state}
      runError={round.runError}
      onNext={round.next}
      onAgain={round.next}
      onLeave={() => ws.goStep('fire')}
    />
  );
}
