import type { WorkspaceBase } from '../app/store';

/**
 * Which of the script's Play states the workspace is in (`script.json`, step "play"), from the round's own answers: a
 * recorded test fire or a window before the sharp satellite plays no round; then failed, loading, choosing, a look
 * taken, every look spent, the round's end, and the players open over it.
 */
export function playStateId(ws: WorkspaceBase): string {
  if (ws.model.closed) return 'recorded_test_fire';
  if (ws.run.beforeSharp) return 'no_sharp_satellite';
  const r = ws.round;
  if (r.error || r.runError) return 'failed';
  const st = r.state;
  if (!st || !r.start || !r.ready) return 'loading';
  if (st.done) return ws.step === 'agent' ? 'players_open' : 'round_end';
  if (st.awaitingNext) return 'look_taken';
  const spent = st.picks.filter((p) => p.tile !== null).length;
  if (st.ending || spent >= r.start.episode.budget) return 'looks_spent';
  return 'choose';
}
