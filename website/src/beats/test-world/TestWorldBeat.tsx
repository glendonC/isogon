import { RoundReadout } from '../../components/NextLookRound';
import { useWorkspace } from '../../app/store';

/**
 * Test world: one round of the next-look environment on the fire that is open, a person spending the looks on tiles
 * the stage draws on the terrain. The round's state and routes live in this folder (`useRound.ts`, `env.ts`).
 */
export function TestWorldBeat() {
  const ws = useWorkspace();
  const { round, blocked, place } = ws;
  if (!round.state || !round.start) {
    return (
      <>
        <h2 className="iso-step__title">Your look</h2>
        <p className="iso-step__line">
          {round.error ? `The round did not start: ${round.error}.` : blocked.look ?? 'Starting a round on the server.'}
        </p>
      </>
    );
  }
  return (
    <RoundReadout
      place={place.title}
      start={round.start}
      end={round.end}
      round={round.state}
      runError={round.error ?? round.runError}
      onNext={round.next}
      onAgain={round.next}
      onLeave={() => ws.goStep('fire')}
    />
  );
}
