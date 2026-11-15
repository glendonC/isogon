import { useSyncExternalStore } from 'react';
import { agentWalkState, subscribeAgentWalk } from './agentWalk';
import './walk.css';

/**
 * The agents' walk's one line, plain text and one class (`walk`), so the identity reskins it in a line. It shows only
 * while the walk has something to say: no box, no panel. When the identity's look for actions is accepted, its line
 * can be read from `agentWalkState()` there instead and this element dropped.
 */
export function AgentWalkLine() {
  const s = useSyncExternalStore(subscribeAgentWalk, agentWalkState, agentWalkState);
  if (!s.line) return null;
  return (
    <div className="walk" role="status" aria-live="polite" data-beat={s.beat ?? 'off'}>
      <p>{s.line}</p>
    </div>
  );
}
