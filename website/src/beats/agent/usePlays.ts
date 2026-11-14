import { useEffect, useState } from 'react';
import { HttpError, NOT_RECORDED_LINE, NotRecorded, postJson } from '../../lib/api';
import { PLAYERS } from '../../compare/blocks';

/**
 * The players' plays of the round on the open fire, from the play route, one player at a time. Each play is a
 * round of its own and is what a recorded page holds. A play holds detections of the hidden satellite, so the
 * caller holds it back while a person's own round is under way. A player whose play does not answer is left out.
 */
export type Plays =
  | { state: 'idle' | 'held' | 'loading' }
  | { state: 'plays'; plays: unknown[] }
  | { state: 'closed' | 'unserved' | 'failed'; line: string };

const asked = new Map<string, Promise<Plays>>();

async function ask(regionId: string, start: string): Promise<Plays> {
  const plays: unknown[] = [];
  let missing: string | null = null;
  // One at a time: a play costs a round's worth of work on the server
  for (const p of PLAYERS) {
    if (p.key === 'oracle') continue;
    try {
      plays.push(await postJson<unknown>('/api/env/next_look/play', { region_id: regionId, start, player: p.key }));
    } catch (e) {
      // A closed window is closed for every player; a play that is not there leaves that player out
      if (e instanceof HttpError && e.status === 409) return { state: 'closed', line: e.message };
      if (e instanceof NotRecorded) missing = NOT_RECORDED_LINE;
      else if (e instanceof HttpError && e.status === 404) missing = missing ?? e.message;
      else return { state: 'failed', line: e instanceof Error ? e.message : String(e) };
    }
  }
  if (plays.length === 0) return { state: 'unserved', line: missing ?? 'No play of this round is served.' };
  return { state: 'plays', plays };
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
