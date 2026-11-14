import { useEffect, useState } from 'react';
import { getJson, HttpError, NOT_RECORDED_LINE, NotRecorded, postJson } from '../../lib/api';
import { PLAYERS } from '../../compare/blocks';

/**
 * The players' plays of the round on the open fire.
 *
 * First the play route, one player at a time: each play is a round of its own and is what a recorded page holds.
 * Where the step by step play is not in the build, a round of its own with no look taken: it ends at once, and its
 * end brings every reference player's choices and what the hidden satellite saw. Either way the answer holds
 * detections of the hidden satellite, so the caller holds it back while a person's own round is under way.
 */
export type Plays =
  | { state: 'idle' | 'held' | 'loading' }
  | { state: 'plays'; plays: unknown[] }
  | { state: 'round'; start: unknown; end: unknown }
  | { state: 'closed' | 'unserved' | 'failed'; line: string };

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (x && typeof x === 'object' ? (x as Obj) : {});

const asked = new Map<string, Promise<Plays>>();

async function ask(regionId: string, start: string): Promise<Plays> {
  try {
    const plays: unknown[] = [];
    // One at a time: a play costs a round's worth of work on the server
    for (const p of PLAYERS) {
      if (p.key === 'oracle') continue;
      plays.push(await postJson<unknown>('/api/env/next_look/play', { region_id: regionId, start, player: p.key }));
    }
    return { state: 'plays', plays };
  } catch (e) {
    if (e instanceof NotRecorded) return { state: 'unserved', line: NOT_RECORDED_LINE };
    if (e instanceof HttpError && e.status === 409) return { state: 'closed', line: e.message };
    if (!(e instanceof HttpError && e.status === 404)) return { state: 'failed', line: e instanceof Error ? e.message : String(e) };
  }
  try {
    const first = await postJson<unknown>('/api/env/next_look/reset', { region_id: regionId, start });
    const roundId = obj(first).round_id;
    const looks = Array.isArray(obj(first).looks) ? (obj(first).looks as unknown[]).length : 0;
    let end: unknown = null;
    for (let decision = 0; decision < looks && !end; decision++) {
      const step = obj(await postJson<unknown>('/api/env/next_look/step', { round_id: roundId, decision, action: -1 }));
      if (step.done) end = step.end;
    }
    // The reference players are played in the background; the round's state serves them when they are ready
    for (let tries = 0; tries < 40 && !obj(end).reference; tries++) {
      await new Promise((r) => setTimeout(r, 3000));
      end = obj(await getJson<unknown>('/api/env/next_look/state', { round_id: String(roundId) })).end ?? end;
    }
    if (!obj(end).reference) return { state: 'failed', line: 'The players of this round are still being played. Open this part again in a minute.' };
    return { state: 'round', start: first, end };
  } catch (e) {
    if (e instanceof NotRecorded) return { state: 'unserved', line: NOT_RECORDED_LINE };
    if (e instanceof HttpError && e.status === 409) return { state: 'closed', line: e.message };
    return { state: 'failed', line: e instanceof Error ? e.message : String(e) };
  }
}

/** `hold` is true while a person's own round on this fire is under way: nothing is asked and nothing is shown. */
export function usePlays(regionId: string | null, start: string | null, hold: boolean): Plays {
  const [plays, setPlays] = useState<Plays>({ state: 'idle' });
  useEffect(() => {
    if (!regionId || !start) {
      setPlays({ state: 'idle' });
      return;
    }
    if (hold) {
      setPlays({ state: 'held' });
      return;
    }
    let live = true;
    const key = `${regionId}|${start}`;
    let pending = asked.get(key);
    if (!pending) {
      pending = ask(regionId, start);
      asked.set(key, pending);
      // An answer that is not a play is asked again next time
      void pending.then((p) => {
        if (p.state !== 'plays' && p.state !== 'round') asked.delete(key);
      });
    }
    setPlays({ state: 'loading' });
    void pending.then((p) => live && setPlays(p));
    return () => {
      live = false;
    };
  }, [regionId, start, hold]);
  return plays;
}
