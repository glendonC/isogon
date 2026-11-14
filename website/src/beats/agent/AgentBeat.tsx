import { beatOf } from '../../app/names';

/**
 * Agent: the players play the same round on the open fire. This is the part's panel: its name and its line. The
 * picture, one block per player with its looks in order and what they found, is `AgentPicture` beside this file;
 * the shell mounts it where the stage is.
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
