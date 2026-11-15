// Run with: npm test. The agent's part of Play drives the page only through the guide's own commands, plays the
// learned player's looks in order on the round's board, shows where it looked and never what it found, ends on the
// visitor's turn, and stops dead when asked.
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t),
  addEventListener: () => {},
  removeEventListener: () => {},
};

const walk = await import('./agentWalk.ts');
const { AGENT_BEAT_HOLD, AGENT_WALK_WORDS, agentWalkDone, agentWalkState, startAgentWalk, stopAgentWalk, subscribeAgentWalk } = walk;
for (const k of Object.keys(AGENT_BEAT_HOLD)) AGENT_BEAT_HOLD[k] = 0;
AGENT_BEAT_HOLD.look = 30;

/** A page that answers each command the way the shell does, and records them. */
function fakePage({ revealed }) {
  const commands = [];
  const p = {
    step: 'test',
    test: { revealed },
    place: { regionId: 'plumas_ca' },
    run: { realStart: '2012-08-09' },
    round: { ready: false, canPick: false, start: null },
    guide: { actions: [], also: [] },
    runCommand(c) {
      commands.push(c);
      if (c === 'go:test') p.test = { revealed: true };
      if (c === 'go:play') {
        p.step = 'look';
        p.round = { ready: true, canPick: true, start: { episode: { tiles: [4, 4] } } };
      }
    },
  };
  return { page: () => p, commands };
}

const hidden = [{ latitude: 40, longitude: -121 }];
const play = {
  id: 'learned',
  looks: [
    { tile: 5, timeUtc: '2012-08-10T09:29:00Z', found: hidden },
    { tile: 6, timeUtc: '2012-08-10T21:10:00Z', found: hidden },
    { tile: 9, timeUtc: '2012-08-11T09:11:00Z', found: [] },
    { tile: 6, timeUtc: '2012-08-11T20:52:00Z', found: hidden },
  ],
};

const until = async (ok, ms = 8000) => {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** Every state the walk passes through, as it publishes it. */
function record() {
  const seen = [];
  const off = subscribeAgentWalk(() => seen.push(agentWalkState()));
  return { seen, off };
}

test('from the reveal: the board, the learned player\'s looks in order, then the visitor\'s turn', async () => {
  const { page, commands } = fakePage({ revealed: true });
  const asked = [];
  const { seen, off } = record();
  startAgentWalk(page, { fetchPlay: async (r, s) => (asked.push([r, s]), play) });
  await until(() => agentWalkDone());
  off();
  assert.deepEqual(commands, ['go:play']);
  assert.deepEqual(asked, [['plumas_ca', '2012-08-09']]);
  const tiles = [];
  for (const st of seen) if (st.look && tiles.at(-1) !== `${st.look.index}:${st.look.tile}`) tiles.push(`${st.look.index}:${st.look.tile}`);
  assert.deepEqual(tiles, ['1:5', '2:6', '3:9', '4:6']);
  assert.equal(seen.find((st) => st.look)?.cols, 4);
  assert.equal(page().step, 'look');
  assert.equal(agentWalkState().look, null);
  assert.equal(seen.at(-1).beat, 'yours');
  stopAgentWalk();
});

test('it shows where the agent looked and the pass, never what the looks found', async () => {
  const { page } = fakePage({ revealed: true });
  const { seen, off } = record();
  startAgentWalk(page, { fetchPlay: async () => play });
  await until(() => agentWalkDone());
  off();
  for (const st of seen) {
    if (st.look) assert.deepEqual(Object.keys(st.look).sort(), ['index', 'of', 'tile', 'timeUtc']);
  }
  assert.doesNotMatch(JSON.stringify(seen), /latitude|longitude|found/);
  stopAgentWalk();
});

test('no line on the path carries a figure', () => {
  for (const line of Object.values(AGENT_WALK_WORDS)) assert.doesNotMatch(line, /\d/);
});

test('from the estimate with VIIRS hidden it reveals first; with no recorded play it goes to the visitor\'s turn', async () => {
  const { page, commands } = fakePage({ revealed: false });
  const { seen, off } = record();
  startAgentWalk(page, { fetchPlay: async () => null });
  await until(() => agentWalkDone());
  off();
  assert.deepEqual(commands, ['go:test', 'go:play']);
  assert.equal(seen.some((st) => st.look), false);
  assert.ok(seen.some((st) => st.line === AGENT_WALK_WORDS.noPlay));
  stopAgentWalk();
});

test('stopped mid-walk: no further command or look, the scene left as it is', async () => {
  const { page, commands } = fakePage({ revealed: true });
  AGENT_BEAT_HOLD.look = 400;
  startAgentWalk(page, { fetchPlay: async () => play });
  await until(() => agentWalkState().look !== null);
  stopAgentWalk();
  const at = commands.length;
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(commands.length, at);
  assert.equal(agentWalkState().on, false);
  assert.equal(agentWalkState().look, null);
  assert.equal(agentWalkState().line, null);
  AGENT_BEAT_HOLD.look = 30;
});
