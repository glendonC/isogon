import { beatOf } from '../../app/names';

/**
 * Agent: an agent plays the same round, step by step, with what it ranked the tiles by. Not open yet; the bar says
 * why. The first version replays each reference player's looks from a finished round's end.
 */
export function AgentBeat() {
  const b = beatOf('agent');
  return (
    <>
      <h2 className="iso-step__title">{b.name}</h2>
      <p className="iso-step__line">{b.line}</p>
    </>
  );
}
