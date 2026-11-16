/**
 * The live table: one row for each fire followed that has a sealed prediction, from `GET /api/live`, its latest
 * seal. When the prediction was locked, whether VIIRS's data has arrived and been checked, and the seal's
 * fingerprint. Pure.
 */

export interface LiveRow {
  fireId: string;
  place: string;
  locked: string;
  data: string;
  /** True once the data arrived and the prediction was checked against it. */
  checked: boolean;
  fingerprint: string;
  sealedUtc: string;
}

export interface LiveTable {
  rows: LiveRow[];
  followed: number;
  checked: number;
}

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | null => (x && typeof x === 'object' ? (x as Obj) : null);
const str = (x: unknown): string | null => (typeof x === 'string' ? x : null);

/** The product lane's words: the time a prediction was locked, and the state of VIIRS's data for it. */
export const LIVE_WORDS = {
  lockedBefore: 'Before the pass',
  lockedMinutes: (m: number) => `${m} minutes before the pass`,
  beforePass: 'Pass still to come',
  waiting: 'Waiting for VIIRS data',
  checked: 'Scored',
  notChecked: (reason: string) => (reason ? `Not scored: ${reason}` : 'Not scored'),
};

export interface LiveFire {
  id: string;
  part?: string;
  centre?: [number, number];
}

/** A route's part ("south_america") in plain words ("South America"); the mount passes country names instead. */
export function partWords(fire: LiveFire): string {
  const p = fire.part ?? fire.id;
  return p.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function rowsFromLive(
  live: unknown,
  placeOf: (fire: LiveFire) => string = partWords,
  words = LIVE_WORDS,
): LiveTable | null {
  const l = obj(live);
  const fires = Array.isArray(l?.fires) ? (l!.fires as unknown[]).map(obj).filter((f): f is Obj => !!f && typeof f.id === 'string') : [];
  const seals = Array.isArray(l?.seals) ? (l!.seals as unknown[]).map(obj).filter((s): s is Obj => !!s) : [];
  if (!l || fires.length === 0) return null;
  const latest = new Map<string, Obj>();
  for (const s of seals) {
    const id = str(s.fire_id);
    const when = str(obj(s.times)?.sealed_utc);
    if (!id || !when) continue;
    const prev = latest.get(id);
    if (!prev || (str(obj(prev.times)?.sealed_utc) ?? '') < when) latest.set(id, s);
  }
  const rows: LiveRow[] = [];
  for (const f of fires) {
    const s = latest.get(f.id as string);
    if (!s) continue;
    const t = obj(s.times);
    const minutes = typeof t?.minutes_sealed_before_the_pass === 'number' ? Math.round(t.minutes_sealed_before_the_pass as number) : null;
    const state = str(s.state);
    const checked = state === 'scored';
    const data =
      state === 'scored'
        ? words.checked
        : state === 'not_scored'
          ? words.notChecked(str(s.reason) ?? '')
          : state === 'waiting_for_the_rows'
            ? words.waiting
            : words.beforePass;
    const centre = Array.isArray(f.centre) && f.centre.length === 2 ? (f.centre as [number, number]) : undefined;
    rows.push({
      fireId: f.id as string,
      place: placeOf({ id: f.id as string, part: str(f.part) ?? undefined, centre }),
      locked: minutes !== null && minutes > 0 ? words.lockedMinutes(minutes) : words.lockedBefore,
      data,
      checked,
      fingerprint: (str(s.sha256) ?? '').slice(0, 10),
      sealedUtc: str(t?.sealed_utc) ?? '',
    });
  }
  rows.sort((a, b) => (a.sealedUtc < b.sealedUtc ? 1 : a.sealedUtc > b.sealedUtc ? -1 : 0));
  return { rows, followed: fires.length, checked: rows.filter((r) => r.checked).length };
}
