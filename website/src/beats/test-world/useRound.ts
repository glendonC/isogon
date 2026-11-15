import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DynamicRegionRun } from '../../stage/types';
import type { StageTileAnchor, StageTileBoard } from '../../stage/earthCutawayTypes';
import type { NextLookEnd, NextLookStart } from '../../content/demo/nextLook';
import { NEW_ROUND, type RoundState } from './round';
import { frameNearest, tileOf, withLooks } from '../../content/nextLook';
import { fireAt } from '../world-model/fire';
import { isRealRun, withReveal } from '../../content/realRuns';
import { HttpError, NotRecorded } from '../../lib/api';
import { openRound, runWithEndReveal, type NextLookEnv } from './env';

/** The fire a round is played on: the place and the start of the run that was open when the round began. */
export interface RoundFire {
  regionId: string;
  start: string;
}

interface Options {
  /** The run on the terrain and its start. */
  activeRun: DynamicRegionRun | null;
  activeStart: string | null;
  /** Ask for the held-out run of this fire: the round's terrain. */
  requestBlindRun: (fire: RoundFire) => void;
  /** Put this fire's run with every satellite back on the terrain. */
  restoreRun: (fire: RoundFire) => void;
  /** Show this frame of the run: the pass nearest the look being decided. */
  showFrame: (frame: number) => void;
}

export interface RoundApi {
  state: RoundState | null;
  /** The round's start as the server answered it; null until it has. */
  start: NextLookStart | null;
  end: NextLookEnd | null;
  /** Why the round could not start, in the server's own words where it gave some. */
  error: string | null;
  fire: RoundFire | null;
  /** The round's held-out run, once it is on the terrain; and what the terrain draws for it. */
  run: DynamicRegionRun | null;
  stageRun: DynamicRegionRun | null;
  /** The tiles on the terrain (the stage's `tileBoard`), and whether one can be picked now. */
  board: StageTileBoard | null;
  canPick: boolean;
  /** The tile under keyboard focus, the tile under the pointer, and the one a look would go to (pointer first). */
  focus: number | null;
  hover: number | null;
  marked: number | null;
  /** The tile of the look just taken, while its result stands. */
  takenTile: number | null;
  begin: (fire: RoundFire) => void;
  /** End the round; `keepRun` leaves the round's held-out run on the terrain (World model opens blind on it). */
  leave: (keepRun?: boolean) => void;
  pick: (tile: number) => void;
  next: () => void;
  moveFocus: (dRow: number, dCol: number) => void;
  pickFocused: () => void;
  /** Look at the marked tile: the one under the pointer, else the one the keys marked. */
  pickMarked: () => void;
  /** The stage's report of the tile under the pointer. */
  onHover: (tile: number | null) => void;
  /** Every look spent: end the round now, the passes left going by without one. */
  finish: () => void;
  /** The stage's tile anchors, passed on to whoever draws the labels, without re-rendering the shell. */
  onAnchors: (anchors: StageTileAnchor[]) => void;
  subscribeAnchors: (fn: (anchors: StageTileAnchor[]) => void) => () => void;
}

function words(err: unknown): string {
  if (err instanceof NotRecorded || err instanceof HttpError) return err.message.replace(/\.$/, '');
  return `the round could not start: ${err instanceof Error ? err.message : 'no answer'}`;
}

/**
 * A round of next look on the fire that is open: its place and start come from the run on the terrain when the round
 * begins, never from a typed episode. The page knows only what the round's routes answered: a look's detections, then
 * everything at the end. The tiles are drawn by the stage on the terrain; the page owns every word.
 */
export function useRound({ activeRun, activeStart, requestBlindRun, restoreRun, showFrame }: Options): RoundApi {
  const [state, setState] = useState<RoundState | null>(null);
  const [env, setEnv] = useState<NextLookEnv | null>(null);
  const [end, setEnd] = useState<NextLookEnd | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fire, setFire] = useState<RoundFire | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const seqRef = useRef(0);
  const busyRef = useRef(false);

  const openEnv = useCallback((f: RoundFire) => {
    const seq = ++seqRef.current;
    setEnv(null);
    setError(null);
    openRound(f.regionId, f.start)
      .then((e) => {
        if (seq === seqRef.current) setEnv(e);
      })
      .catch((err) => {
        if (seq === seqRef.current) setError(words(err));
      });
  }, []);

  const begin = useCallback(
    (f: RoundFire) => {
      setFire(f);
      setState(NEW_ROUND);
      setEnd(null);
      setFocus(null);
      requestBlindRun(f);
      openEnv(f);
    },
    [requestBlindRun, openEnv],
  );

  const leave = useCallback(
    (keepRun = false) => {
      seqRef.current += 1;
      const f = fire;
      setState(null);
      setEnv(null);
      setEnd(null);
      setError(null);
      setFire(null);
      setFocus(null);
      if (f && !keepRun) restoreRun(f);
    },
    [fire, restoreRun],
  );

  /** Spend the current look on a tile (or pass with -1); the answer says what it revealed and what comes next. */
  const answer = useCallback(
    (tile: number) => {
      if (!state || state.done || !env || busyRef.current) return;
      const decision = state.decision;
      busyRef.current = true;
      env
        .look(decision, tile)
        .then((res) => {
          setState((r) =>
            r && r.decision === decision
              ? {
                  ...r,
                  picks: [
                    ...r.picks,
                    { decision, tile: res.tile >= 0 ? res.tile : null, pixels: res.pixels, revealed: res.revealed, reward: res.reward, score: res.score },
                  ],
                  awaitingNext: res.tile >= 0,
                  next: res.next_decision,
                  decision: res.tile >= 0 || res.next_decision === null ? decision : res.next_decision,
                  done: res.tile < 0 && res.done,
                }
              : r,
          );
          if (res.tile < 0 && res.done) return env.end().then(setEnd);
        })
        .catch((err) => setError(words(err)))
        .finally(() => {
          busyRef.current = false;
        });
    },
    [state, env],
  );

  const spent = state ? state.picks.filter((p) => p.tile !== null).length : 0;
  const budget = env?.start.episode.budget ?? 0;
  const canPick = Boolean(env) && Boolean(state) && !state!.done && !state!.awaitingNext && spent < budget;

  const pick = useCallback(
    (tile: number) => {
      if (!canPick) return;
      setFocus(tile);
      answer(tile);
    },
    [canPick, answer],
  );

  const next = useCallback(() => {
    if (!state) return;
    if (state.done) {
      // Play again on the same run: a fresh round from the routes.
      setState(NEW_ROUND);
      setEnd(null);
      setFocus(null);
      if (fire) openEnv(fire);
      return;
    }
    if (!state.awaitingNext) {
      answer(-1);
      return;
    }
    if (state.next === null) {
      const spentAll = state.picks.filter((p) => p.tile !== null).length >= (env?.start.episode.budget ?? 0);
      const passesLeft = state.decision < (env?.start.looks.length ?? 0) - 1;
      if (spentAll && passesLeft) {
        setState({ ...state, awaitingNext: false, ending: true });
        return;
      }
      setState({ ...state, awaitingNext: false, done: true });
      void env?.end().then(setEnd).catch(() => {});
    } else {
      setState({ ...state, decision: state.next, awaitingNext: false });
    }
  }, [state, env, fire, openEnv, answer]);

  const [rows, cols] = env?.start.episode.tiles ?? [0, 0];
  const moveFocus = useCallback(
    (dRow: number, dCol: number) => {
      if (rows < 1 || cols < 1) return;
      setFocus((f) => {
        if (f === null) return 0;
        const r = Math.max(0, Math.min(rows - 1, Math.floor(f / cols) + dRow));
        const c = Math.max(0, Math.min(cols - 1, (f % cols) + dCol));
        return r * cols + c;
      });
    },
    [rows, cols],
  );
  const pickFocused = useCallback(() => {
    if (focus !== null) pick(focus);
  }, [focus, pick]);
  const marked = canPick ? hover ?? focus : null;
  const pickMarked = useCallback(() => {
    if (marked !== null) pick(marked);
  }, [marked, pick]);
  const onHover = useCallback((t: number | null) => setHover(t), []);
  const finish = useCallback(() => {
    if (!state || !state.ending || state.done) return;
    setState({ ...state, ending: false, done: true });
    void env?.end().then(setEnd).catch(() => {});
  }, [state, env]);
  const takenTile = state?.awaitingNext ? state.picks.find((p) => p.decision === state.decision)?.tile ?? null : null;

  // The reference players are computed on the server from the round's start; when the end arrived before them, ask
  // once more (the ask waits up to two more minutes on the state route) and show them when they come.
  const referenceTriesRef = useRef(0);
  useEffect(() => {
    if (!env || !end || end.reference) {
      referenceTriesRef.current = 0;
      return;
    }
    if (referenceTriesRef.current >= 3) return;
    referenceTriesRef.current += 1;
    let live = true;
    env
      .end()
      .then((e) => {
        if (live && e.reference) setEnd(e);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [env, end]);

  // The round's terrain: the held-out run of its own fire.
  const run =
    state &&
    fire &&
    activeRun &&
    isRealRun(activeRun) &&
    activeRun.metrics?.holdout_viirs &&
    activeRun.region.id === fire.regionId &&
    activeStart === fire.start
      ? activeRun
      : null;

  // The terrain shows the pass nearest the look being decided.
  const start = env?.start ?? null;
  useEffect(() => {
    if (!state || !run || !start) return;
    const slot = start.looks[Math.min(state.decision, start.looks.length - 1)];
    if (slot) showFrame(frameNearest(run, Date.parse(slot.time_utc) / 1000));
  }, [state?.decision, state !== null, run, start]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a look can be taken, one square is marked from the start, so Enter looks: the square the fire is in at the pass
  // being decided (the nearest pass with detections the round may show), else the board's middle square.
  useEffect(() => {
    if (!canPick || focus !== null || !start || !state) return;
    const [r, c] = start.episode.tiles;
    if (r < 1 || c < 1) return;
    const slot = start.looks[Math.min(state.decision, start.looks.length - 1)];
    const frame = run && slot ? frameNearest(run, Date.parse(slot.time_utc) / 1000) : 0;
    const at = run ? fireAt(run, frame) : null;
    const tile = at ? tileOf(at.lon, at.lat, start.episode.box, r, c) : null;
    setFocus(tile ?? Math.floor(r / 2) * c + Math.floor(c / 2));
  }, [canPick, focus, start, state?.decision, run]); // eslint-disable-line react-hooks/exhaustive-deps

  /** What the terrain draws: the looks' detections laid on as they come, and everything after the end. */
  const stageRun = useMemo(() => {
    if (!state || !run) return null;
    if (state.done) return end ? withReveal(runWithEndReveal(run, end)) : run;
    const looked = state.picks.filter((p) => p.tile !== null);
    const layers = looked.flatMap((p) =>
      p.revealed.map((o) => ({
        frame: frameNearest(run, Date.parse(o.time_utc) / 1000),
        platform: o.platform,
        footprints: o.footprints,
      })),
    );
    return withLooks(run, layers, `looks_${looked.map((p) => `${p.decision}-${p.tile}`).join('_')}`);
  }, [state, run, end]);

  const board = useMemo<StageTileBoard | null>(() => {
    if (!state || !start || !run || rows < 1 || cols < 1) return null;
    const looked = new Set(state.picks.filter((p) => p.tile !== null).map((p) => p.tile as number));
    const taken = state.awaitingNext ? state.picks.find((p) => p.decision === state.decision)?.tile ?? null : null;
    const chosen = taken ?? (canPick ? focus : null);
    return {
      rows,
      cols,
      tiles: Array.from({ length: rows * cols }, (_, t) => ({
        looked: looked.has(t) || undefined,
        chosen: t === chosen || undefined,
      })),
      pickable: canPick,
    };
  }, [state, start, run, rows, cols, focus, canPick]);

  const listeners = useRef(new Set<(a: StageTileAnchor[]) => void>());
  const onAnchors = useCallback((a: StageTileAnchor[]) => {
    listeners.current.forEach((fn) => fn(a));
  }, []);
  const subscribeAnchors = useCallback((fn: (a: StageTileAnchor[]) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  return {
    state,
    start,
    end,
    error,
    fire,
    run,
    stageRun,
    board,
    canPick,
    focus,
    hover,
    marked,
    takenTile,
    begin,
    leave,
    pick,
    next,
    moveFocus,
    pickFocused,
    pickMarked,
    onHover,
    finish,
    onAnchors,
    subscribeAnchors,
  };
}
