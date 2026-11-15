import type { WorkspaceStore } from '../app/store';

/**
 * The agents' part of Play, after the reveal: the players take their looks at the hidden satellite in time, on the
 * fire in view, and then the visitor's own round begins on the same fire, where the walk ends and hands over.
 *
 * It drives the page only through the commands the guide's actions run (`play:players`, `play:watch`, `go:play`), so
 * every board, look and score is the page's, from the round's routes. Its lines carry no figure; the players' points
 * are hidden while it plays (`data-walk="on"` on the root, `walk.css`) and are one press away once it hands over.
 *
 * Two calls: `startAgentWalk(page)` on the scene in view, and `stopAgentWalk()`. `agentWalkDone()` says when it has
 * reached the visitor's turn, for a caller that waits on it.
 */

/** What the walk reads and drives: the shell's store, read fresh at every step. */
export type WalkPage = Pick<WorkspaceStore, 'step' | 'guide' | 'runCommand' | 'round' | 'test'>;

export type AgentBeatId = 'reveal' | 'players' | 'watch' | 'yours';

export const AGENT_WALK_WORDS: Record<AgentBeatId, string> & { stopped: string } = {
  reveal: 'VIIRS revealed. Now the agents take their turn.',
  players: 'Each agent chooses where to spend its looks at the hidden satellite.',
  watch: 'Watch where each one looks, and what it finds.',
  yours: 'Your turn: pick the square where a look would teach the model most.',
  stopped: 'The walk stopped here. The page is yours.',
};

/** Reading time of each beat once its scene is up, ms. */
export const AGENT_BEAT_HOLD: Record<AgentBeatId, number> = {
  reveal: 1800,
  players: 2400,
  watch: 7000,
  yours: 4500,
};

/** How long the walk waits for a scene before it hands over, ms. */
const WAIT_MS = 25000;
const POLL_MS = 150;

interface WalkState {
  on: boolean;
  beat: AgentBeatId | null;
  line: string | null;
  done: boolean;
}

let state: WalkState = { on: false, beat: null, line: null, done: false };
const listeners = new Set<() => void>();
let runId = 0;
let fade = 0;

function set(next: Partial<WalkState>) {
  state = { ...state, ...next };
  if (typeof document !== 'undefined') {
    if (state.on) document.documentElement.setAttribute('data-walk', 'on');
    else document.documentElement.removeAttribute('data-walk');
  }
  listeners.forEach((fn) => fn());
}

export function subscribeAgentWalk(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function agentWalkState(): WalkState {
  return state;
}

/** The walk has reached the visitor's turn (or stopped). */
export function agentWalkDone(): boolean {
  return state.done;
}

class Stopped extends Error {}

/** The visitor's own key, click, wheel or touch hands over, even where no shell around the walk listens for it. */
const INPUTS = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const;
/** The press that started the walk is not a takeover, ms. */
const ARM_MS = 400;
let unlisten: (() => void) | null = null;

function listenForTakeover() {
  unlisten?.();
  const armedAt = performance.now() + ARM_MS;
  const take = (e: Event) => {
    if (e.isTrusted && performance.now() >= armedAt) stopAgentWalk();
  };
  INPUTS.forEach((t) => window.addEventListener(t, take, { capture: true, passive: true }));
  unlisten = () => {
    INPUTS.forEach((t) => window.removeEventListener(t, take, { capture: true }));
    unlisten = null;
  };
}

/** Stop the walk where it is; the scene stays as it is for the visitor to drive. */
export function stopAgentWalk(): void {
  runId += 1;
  unlisten?.();
  window.clearTimeout(fade);
  if (state.on || state.line) set({ on: false, beat: null, line: null, done: true });
}

/**
 * Start the agents' part on the scene in view. On the estimate with VIIRS still hidden it reveals first; on the
 * reveal it goes straight to the players. Calling it again restarts it.
 */
export function startAgentWalk(page: () => WalkPage): void {
  const id = ++runId;
  window.clearTimeout(fade);
  set({ on: true, beat: null, line: null, done: false });
  listenForTakeover();

  const alive = () => {
    if (id !== runId) throw new Stopped();
  };
  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const t0 = performance.now();
      const tick = () => {
        if (id !== runId) return reject(new Stopped());
        if (performance.now() - t0 >= ms) return resolve();
        window.setTimeout(tick, Math.min(POLL_MS, ms));
      };
      tick();
    });
  const until = async (ready: () => boolean) => {
    const t0 = performance.now();
    while (!ready()) {
      alive();
      if (performance.now() - t0 > WAIT_MS) throw new Error('timeout');
      await sleep(POLL_MS);
    }
  };
  const has = (command: string) => {
    const g = page().guide;
    return [...g.actions, ...g.also].some((a) => a.command === command);
  };
  const beat = async (b: AgentBeatId, scene: () => Promise<void>) => {
    await scene();
    alive();
    set({ beat: b, line: AGENT_WALK_WORDS[b] });
    await sleep(AGENT_BEAT_HOLD[b]);
  };

  const run = async () => {
    await beat('reveal', async () => {
      const p = page();
      if ((p.step === 'fire' || p.step === 'test') && !p.test.revealed) {
        p.runCommand('go:test');
        await until(() => page().test.revealed);
      }
    });
    await beat('players', async () => {
      page().runCommand('play:players');
      await until(() => page().step === 'agent' && has('play:watch'));
    });
    await beat('watch', async () => {
      page().runCommand('play:watch');
    });
    // The visitor's own round on the same fire: a new round starts from the players' picture.
    await beat('yours', async () => {
      page().runCommand('go:play');
      await until(() => page().step === 'look' && page().round.ready && page().round.canPick);
    });
    alive();
    unlisten?.();
    set({ on: false, done: true });
    fade = window.setTimeout(() => set({ line: null, beat: null }), 2500);
  };

  run().catch((e) => {
    if (e instanceof Stopped) return;
    unlisten?.();
    set({ on: false, beat: null, line: AGENT_WALK_WORDS.stopped, done: true });
    fade = window.setTimeout(() => set({ line: null }), 2500);
  });
}
