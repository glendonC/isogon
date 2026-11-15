import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DynamicRegionRun } from '../../stage/types';
import type { StageTileAnchor, StageTileBoard } from '../../stage/earthCutawayTypes';
import type { NextLookEnd, NextLookStart } from '../../content/demo/nextLook';
import { NEW_ROUND, type RoundPick, type RoundState } from './round';
import { frameNearest, tileOf, withLooks } from '../../content/nextLook';
import { fireAt } from '../world-model/fire';
import { isRealRun, withReveal } from '../../content/realRuns';
import { HttpError, NotRecorded, postJson, recordedRound, TRANSPORT } from '../../lib/api';
import { PLAYERS, SEES_THE_ANSWER } from '../../compare/blocks';
import { openRound, runWithEndReveal, type NextLookEnv } from './env';

/**
 * The one look a page of recorded answers scores (the recording's `one_look`): the passes before it go by on their
 * own, the visitor looks or lets the pass go there, and the round ends with that answer beside the best one at that
 * pass and each player's pick there, all from the recording.
 */
export interface OneLook {
  decision: number;
  /** The visitor's answer: the square (null when the pass was let go) and its gain; null until taken. */
  taken: { tile: number | null; reward: number | null } | null;
  /** The answer that gains most at that pass among the recorded ones (null tile: letting it go); null until read. */
  best: { tile: number | null; reward: number } | null;
  /** Each player's pick there (null tile: it let the pass go) and its gain, from the recorded plays; null until read. */
  players: { key: string; name: string; tile: number | null; reward: number | null }[] | null;
}

/** A recorded play's step at a decision: the square it looked at, if it spent a look there, and the step's gain. */
function playStep(play: unknown, decision: number): { tile: number | null; reward: number | null } | null {
  const p = (play && typeof play === 'object' && 'play' in play ? (play as { play: unknown }).play : play) as { steps?: unknown } | null;
  const steps = Array.isArray(p?.steps) ? (p!.steps as Record<string, unknown>[]) : [];
  const st = steps.find((x) => x?.decision === decision);
  if (!st) return null;
  const looked = st.spent === true || st.spending_look === true;
  return { tile: looked && typeof st.chosen_tile === 'number' ? st.chosen_tile : null, reward: typeof st.reward === 'number' ? st.reward : null };
}

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
  /** On a page of recorded answers: the one look it scores, or `noLook` when it holds none on this fire. */
  oneLook: OneLook | null;
  noLook: boolean;
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
  const [oneLook, setOneLook] = useState<OneLook | null>(null);
  const [noLook, setNoLook] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const seqRef = useRef(0);
  const busyRef = useRef(false);

  const openEnv = useCallback((f: RoundFire) => {
    const seq = ++seqRef.current;
    setEnv(null);
    setError(null);
    setOneLook(null);
    setNoLook(false);
    const open = async () => {
      if (TRANSPORT !== 'recorded') {
        const e = await openRound(f.regionId, f.start);
        if (seq === seqRef.current) setEnv(e);
        return;
      }
      // A page of recorded answers scores one look, where the recording holds every answer: none here, it says so.
      const rec = await recordedRound(f.regionId, f.start);
      if (!rec?.oneLook) {
        if (seq === seqRef.current) setNoLook(true);
        return;
      }
      const e = await openRound(f.regionId, f.start);
      // The passes before the look go by on their own, each let go, as the recording took them.
      const letGo: RoundPick[] = [];
      let at = 0;
      while (at < rec.oneLook.decision) {
        const res = await e.look(at, -1);
        letGo.push({ decision: at, tile: null, pixels: res.pixels, revealed: res.revealed, reward: res.reward, score: res.score });
        if (res.done || res.next_decision === null) throw new Error('the recorded round ended before its look');
        at = res.next_decision;
      }
      if (seq !== seqRef.current) return;
      setOneLook({ decision: at, taken: null, best: null, players: null });
      setState((r) => (r ? { ...r, decision: at, next: at, picks: letGo } : r));
      setEnv(e);
      // What every answer at that pass gains, and each player's pick there, for the round's end.
      const gains = await Promise.all(rec.oneLook.actions.map((a) => e.gainOf(at, a).then((g) => ({ a, g }), () => ({ a, g: null }))));
      let best: OneLook['best'] = null;
      for (const { a, g } of gains) if (g !== null && (best === null || g > best.reward)) best = { tile: a >= 0 ? a : null, reward: g };
      const players: NonNullable<OneLook['players']> = [];
      for (const p of PLAYERS) {
        try {
          const body = { region_id: f.regionId, start: f.start, player: p.key, ...(p.key === SEES_THE_ANSWER ? { ceiling: true } : {}) };
          const s = playStep(await postJson<unknown>('/api/env/next_look/play', body), at);
          if (s) players.push({ key: p.key, name: p.name, ...s });
        } catch {
          // A play the recording does not hold leaves that player out
        }
      }
      if (seq === seqRef.current) setOneLook((o) => (o ? { ...o, best, players } : o));
    };
    open().catch((err) => {
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
      setOneLook(null);
      setNoLook(false);
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
          // The one look a recorded page scores: the round ends with it.
          if (oneLook && decision === oneLook.decision) {
            setState((r) =>
              r && r.decision === decision
                ? {
                    ...r,
                    picks: [...r.picks, { decision, tile: res.tile >= 0 ? res.tile : null, pixels: res.pixels, revealed: res.revealed, reward: res.reward, score: res.score }],
                    awaitingNext: false,
                    next: null,
                    done: true,
                  }
                : r,
            );
            setOneLook((o) => (o ? { ...o, taken: { tile: res.tile >= 0 ? res.tile : null, reward: res.reward } } : o));
            return;
          }
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
    [state, env, oneLook],
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
    // After the one look a recorded page scores, the look's detections stay; there is no end's reveal.
    if (state.done && !oneLook) return end ? withReveal(runWithEndReveal(run, end)) : run;
    const looked = state.picks.filter((p) => p.tile !== null);
    const layers = looked.flatMap((p) =>
      p.revealed.map((o) => ({
        frame: frameNearest(run, Date.parse(o.time_utc) / 1000),
        platform: o.platform,
        footprints: o.footprints,
      })),
    );
    return withLooks(run, layers, `looks_${looked.map((p) => `${p.decision}-${p.tile}`).join('_')}`);
  }, [state, run, end, oneLook]);

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
    oneLook,
    noLook,
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
