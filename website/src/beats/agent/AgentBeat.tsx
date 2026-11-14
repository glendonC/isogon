import { beatOf } from '../../app/names';
import { AgentPicture } from './AgentPicture';
import '../../styles/agent-part.css';

/**
 * Agent: the players play the same round on the open fire. The part takes the stage's place: its name and line, then
 * the picture, one block per player with its looks in order and what they found (`AgentPicture`, which reads the
 * place and the run from the workspace and asks for the plays itself).
 */
export function AgentBeat() {
  const b = beatOf('agent');
  return (
    <section className="agent-part" aria-label={b.name.replace(/^\d+\s*/, '')}>
      <header className="agent-part__head">
        <h2 className="sys-title">{b.name.replace(/^\d+\s*/, '')}</h2>
        <p className="sys-label">{b.line}</p>
      </header>
      <div className="agent-part__picture">
        <AgentPicture />
      </div>
    </section>
  );
}
