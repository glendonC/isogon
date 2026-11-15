import { useEffect, useState } from 'react';
import { HttpError, NOT_RECORDED_LINE, NotRecorded, postJson } from '../../lib/api';
import { CHANCE, PLAYERS, readPlay, SEES_THE_ANSWER } from '../../compare/blocks';

/**
 * The players' plays of the round on the open fire, from the play route, one request at a time, for when no round
 * of the visitor's own has ended here. Each play is a round of its own and is what a recorded page holds. A play
 * holds detections of the hidden satellite, so the caller holds it back while a round is under way.
 *
 * Which players: the five the page names (`PLAYERS`), in that order. A player whose play does not answer is left
 * out. The one that reads the hidden detections is asked for as the route requires, with its flag. Chance is then
 * asked for nine more rounds of random looks, so that its gain can be said as a mean with its range; the ones that
 * do not answer are left out of the mean, and the picture says how many it is the mean of.
 */
export type Plays =
  | { state: 'idle' | 'held' | 'loading' }
  | { state: 'plays'; plays: unknown[]; draws: number[] }
  | { state: 'closed' | 'unserved' | 'failed'; line: string };

/** How many rounds of random looks Chance is the mean of, the drawn one included. */
const CHANCE_ROUNDS = 10;

const asked = new Map<string, Promise<Plays>>();

async function ask(regionId: string, start: string): Promise<Plays> {
  const plays: unknown[] = [];
  const draws: number[] = [];
  let missing: string | null = null;
  // One at a time: a play costs a round's worth of work on the server
  for (const p of PLAYERS) {
    try {
      const body = { region_id: regionId, start, player: p.key, ...(p.key === SEES_THE_ANSWER ? { ceiling: true } : {}) };
      const play = await postJson<unknown>('/api/env/next_look/play', body);
      plays.push(play);
      const gain = p.key === CHANCE ? readPlay(play)?.gain ?? null : null;
      if (gain !== null) draws.push(gain);
    } catch (e) {
      // A closed window is closed for every player; a play that is not there leaves that player out
      if (e instanceof HttpError && e.status === 409) return { state: 'closed', line: e.message };
      if (e instanceof NotRecorded) missing = NOT_RECORDED_LINE;
      else if (e instanceof HttpError && (e.status === 404 || e.status === 400)) missing = missing ?? e.message;
      else return { state: 'failed', line: e instanceof Error ? e.message : String(e) };
    }
  }
  if (plays.length === 0) return { state: 'unserved', line: missing ?? 'No play of this round is served.' };
  if (draws.length === 1) {
    for (let seed = 1; seed < CHANCE_ROUNDS; seed++) {
      try {
        const gain = readPlay(await postJson<unknown>('/api/env/next_look/play', { region_id: regionId, start, player: CHANCE, seed }))?.gain ?? null;
        if (gain !== null) draws.push(gain);
      } catch {
        // A round of random looks that is not served, or not in a recording, is left out of the mean
        break;
      }
    }
  }
  return { state: 'plays', plays, draws };
}

/** `hold` is true while a round of the visitor's own on this fire is under way: nothing is asked and nothing is shown. */
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
        if (p.state !== 'plays') asked.delete(key);
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
