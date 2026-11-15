import { useWorkspace } from '../../app/store';
import { AgentPicture, PLAYERS_WORDS } from './AgentPicture';

/**
 * The players, side by side, opened over the stage: the picture alone, with room kept for the trail above and the
 * guide's strip below. It closes back to the round's end when the visitor has played one, else to the fire.
 */
export function AgentBeat() {
  const ws = useWorkspace();
  return (
    <section className="players" aria-label={PLAYERS_WORDS.name}>
      <AgentPicture onClose={() => (ws.round.end ? ws.goStep('look') : ws.openModel())} />
    </section>
  );
}
