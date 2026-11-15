// Run with: npm test. The agents' part of Play drives the page only through the guide's own commands, in order,
// ends on the visitor's round, and stops dead when asked.
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t),
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { AGENT_BEAT_HOLD, AGENT_WALK_WORDS, agentWalkDone, agentWalkState, startAgentWalk, stopAgentWalk } = await import(
  './agentWalk.ts'
);
for (const k of Object.keys(AGENT_BEAT_HOLD)) AGENT_BEAT_HOLD[k] = 0;

/** A page that answers each command the way the shell does, and records them. */
function fakePage({ revealed }) {
  const commands = [];
  const p = {
    step: 'test',
    test: { revealed },
    round: { ready: false, canPick: false },
    guide: { actions: [], also: [] },
    runCommand(c) {
      commands.push(c);
      if (c === 'go:test') p.test = { revealed: true };
      if (c === 'play:players') {
        p.step = 'agent';
        p.guide = { actions: [{ command: 'play:watch', label: 'Watch them play' }], also: [] };
      }
      if (c === 'go:play') {
        p.step = 'look';
        p.round = { ready: true, canPick: true };
      }
    },
  };
  return { page: () => p, commands };
}

const until = async (ok, ms = 8000) => {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

test('from the reveal: the players, their looks in time, then the visitor\'s round, and no figure in a line', async () => {
  const { page, commands } = fakePage({ revealed: true });
  startAgentWalk(page);
  await until(() => agentWalkDone());
  assert.deepEqual(commands, ['play:players', 'play:watch', 'go:play']);
  assert.equal(page().step, 'look');
  assert.equal(agentWalkState().on, false);
  for (const line of Object.values(AGENT_WALK_WORDS)) assert.doesNotMatch(line, /\d/);
  stopAgentWalk();
});

test('from the estimate with VIIRS hidden: it reveals first', async () => {
  const { page, commands } = fakePage({ revealed: false });
  startAgentWalk(page);
  await until(() => agentWalkDone());
  assert.deepEqual(commands, ['go:test', 'play:players', 'play:watch', 'go:play']);
  stopAgentWalk();
});

test('stopped mid-walk: no further command, the scene left as it is', async () => {
  const { page, commands } = fakePage({ revealed: true });
  startAgentWalk(page);
  await until(() => commands.length >= 1);
  stopAgentWalk();
  const at = commands.length;
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(commands.length, at);
  assert.equal(agentWalkState().on, false);
  assert.equal(agentWalkState().line, null);
});
