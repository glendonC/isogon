import type { WorkspaceStore } from '../app/store';
import { postJson } from '../lib/api.ts';
import { readPlay, type PlaySummary } from '../compare/blocks.ts';
import { controlSound } from '../identity/controlState.ts';

/**
 * The agent's part of Play, after the reveal: a round opens on the fire in view, the learned player takes its looks
 * on the board in time, a frame of corner brackets moving to each square it chooses, and then the round is the
 * visitor's. The walk ends there and hands over.
 *
 * It drives the page only through the commands the guide's actions run (`go:test`, `go:play`), and the looks are the
 * learned player's own play of this fire from the play route (`POST /api/env/next_look/play`). Only where it looked
 * and at which pass is shown: not what its looks found, which is the hidden satellite's and stays the visitor's to
 * find. No line carries a figure; while it plays the root has `data-walk="on"` so the guide steps aside.
 *
 * Two calls: `startAgentWalk(page)` on the scene in view, and `stopAgentWalk()`. `agentWalkDone()` says when it has
 * reached the visitor's turn, for a caller that waits on it.
 */

/** What the walk reads and drives: the shell's store, read fresh at every step. */
export type WalkPage = Pick<WorkspaceStore, 'step' | 'guide' | 'runCommand' | 'round' | 'test' | 'place' | 'run'>;

export type AgentBeatId = 'reveal' | 'board' | 'agent' | 'yours';

export const AGENT_WALK_WORDS = {
  reveal: 'VIIRS revealed. Now the agent takes its turn.',
  board: 'The fire as a board. VIIRS is hidden again.',
  agent: 'The agent spends its looks at the hidden satellite.',
  yours: 'Your turn: pick the square where a look would teach the model most.',
  /** Beside the frame while it is on a square the agent chose. */
  beside: 'The agent looks here',
  noPlay: 'The agent has no recorded play on this fire. Your turn.',
} as const;

/** Reading time of each beat once its scene is up, ms. */
export const AGENT_BEAT_HOLD: Record<AgentBeatId, number> & { look: number } = {
  reveal: 1600,
  board: 1800,
  agent: 900,
  /** Each of the agent's looks: the frame moves, locks and holds. */
  look: 1900,
  yours: 4000,
};

/** The frame's move from one square to the next; it locks when the move ends, and the identity's tick sounds then. */
export const AGENT_FRAME = { moveMs: 520 };

/** The player whose looks the walk plays. */
export const AGENT_PLAYER = 'learned';

/** How long the walk waits for a scene before it hands over, ms. */
const WAIT_MS = 25000;
const POLL_MS = 150;

export interface AgentLookOnShow {
  /** The square on the board, by the round's own numbering (row by row from the north-west). */
  tile: number;
  /** 1 based, of `of`. */
  index: number;
  of: number;
  /** The pass the look was spent on, as the route gives it. */
  timeUtc: string | null;
}

export interface WalkState {
  on: boolean;
  beat: AgentBeatId | null;
  line: string | null;
  done: boolean;
  /** The agent's look the frame is on, and the board's width in squares. */
  look: AgentLookOnShow | null;
  cols: number;
}

let state: WalkState = { on: false, beat: null, line: null, done: false, look: null, cols: 0 };
const listeners = new Set<() => void>();
let runId = 0;

/**
 * The walk's words and frame stand only while the walk holds the guide aside (`on`): the frame in which it hands over
 * takes them off, so they never print over the guide's own words as those come back.
 */
function set(next: Partial<WalkState>) {
  state = { ...state, ...next };
  if (!state.on) state = { ...state, line: null, beat: null, look: null };
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
  if (state.on || state.line || state.look) set({ on: false, done: true });
}

/** The learned player's play of the fire in view, from the play route. */
export async function fetchAgentPlay(regionId: string, start: string): Promise<PlaySummary | null> {
  const answer = await postJson<unknown>('/api/env/next_look/play', { region_id: regionId, start, player: AGENT_PLAYER });
  return readPlay(answer);
}

export interface AgentWalkOptions {
  /** Where the agent's play comes from; the play route by default. */
  fetchPlay?: (regionId: string, start: string) => Promise<PlaySummary | null>;
  /** What sounds as the frame locks on a square: the identity's tick by default (silent until sound is on). */
  onLock?: () => void;
}

/**
 * Start the agent's part on the scene in view. On the estimate with VIIRS still hidden it reveals first. Calling it
 * again restarts it.
 */
export function startAgentWalk(page: () => WalkPage, options: AgentWalkOptions = {}): void {
  const id = ++runId;
  const fetchPlay = options.fetchPlay ?? fetchAgentPlay;
  const onLock = options.onLock ?? (() => controlSound('hover'));
  set({ on: true, beat: null, line: null, done: false, look: null, cols: 0 });
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
  const say = async (b: AgentBeatId, line: string = AGENT_WALK_WORDS[b]) => {
    alive();
    set({ beat: b, line });
    await sleep(AGENT_BEAT_HOLD[b]);
  };

  const run = async () => {
    // The reveal, if the scene in view still holds VIIRS back.
    const p0 = page();
    if ((p0.step === 'fire' || p0.step === 'test') && !p0.test.revealed) {
      p0.runCommand('go:test');
      await until(() => page().test.revealed);
    }
    await say('reveal');

    // The round's board on the same fire, VIIRS hidden again; the agent's play asked for while it opens.
    const regionId = page().place.regionId;
    const start = page().run.realStart;
    const asked = start ? fetchPlay(regionId, start).catch(() => null) : Promise.resolve(null);
    page().runCommand('go:play');
    await until(() => page().step === 'look' && page().round.ready && page().round.start !== null);
    const cols = page().round.start?.episode.tiles[1] ?? 0;
    set({ cols });
    await say('board');

    const play = await asked;
    alive();
    const looks = play?.looks ?? [];
    if (looks.length === 0 || cols < 1) {
      await say('yours', AGENT_WALK_WORDS.noPlay);
    } else {
      await say('agent');
      for (let i = 0; i < looks.length; i += 1) {
        alive();
        set({ look: { tile: looks[i].tile, index: i + 1, of: looks.length, timeUtc: looks[i].timeUtc } });
        await sleep(AGENT_FRAME.moveMs);
        alive();
        onLock();
        await sleep(Math.max(0, AGENT_BEAT_HOLD.look - AGENT_FRAME.moveMs));
      }
      set({ look: null });
      await say('yours');
    }

    alive();
    unlisten?.();
    set({ on: false, done: true });
  };

  run().catch((e) => {
    if (e instanceof Stopped) return;
    unlisten?.();
    set({ on: false, done: true });
  });
}
