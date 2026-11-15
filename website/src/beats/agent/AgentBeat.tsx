import { useWorkspace } from '../../app/store';
import { AgentPicture, PLAYERS_WORDS } from './AgentPicture';

/**
 * The players, side by side, opened over the stage: the picture alone, with room kept for the trail above and the
 * guide's strip below. It closes back to the round's end when the visitor has played one, else to the fire. With
 * `guideSpeaks` the picture leaves its caption and its actions to the guide.
 */
export function AgentBeat({ guideSpeaks = false }: { guideSpeaks?: boolean }) {
  const ws = useWorkspace();
  return (
    <section className="players" aria-label={PLAYERS_WORDS.name}>
      <AgentPicture onClose={() => (ws.round.end ? ws.goStep('look') : ws.openModel())} guideSpeaks={guideSpeaks} />
    </section>
  );
}
