import type { DynamicRegionRun } from '../../stage/types';
import {
  FOOTPRINT_SCHEMA,
  type Footprint,
  type NextLookEnd,
  type NextLookLook,
  type NextLookRevealed,
  type NextLookStart,
  type NextLookState,
  type NextLookTaken,
} from '../../content/demo/nextLook';
import { frameNearest, tileOf } from '../../content/nextLook';
import { getJson, postJson } from '../../lib/api';

/**
 * A round as the page drives it: its start, a look, its state and its end (shapes in content/demo/nextLook.ts). The
 * page holds what the answers gave it and nothing more: a look returns the detections of one slot inside one tile,
 * and the rest arrive with the end. The round is asked for on the run that is open (its place and its start), with
 * the environment's own tiles and budget; every request goes through the page's client.
 */
export interface NextLookEnv {
  start: NextLookStart;
  look(decision: number, tile: number): Promise<NextLookLook>;
  /**
   * What one action at a decision gains, from its step's answer, without taking it in this round: the recorded answers
   * of a page's one look, each from the same round state.
   */
  gainOf(decision: number, action: number): Promise<number | null>;
  state(): Promise<NextLookState>;
  end(): Promise<NextLookEnd>;
}

/** Live: the round on the backend's routes, mapped onto the page's types. */
type Obj = Record<string, unknown>;
interface Rows {
  columns: string[];
  rows: unknown[][];
}
const SENSOR_CODES: Record<string, number> = { VIIRS_NOAA20: 2, VIIRS_NOAA21: 3, VIIRS_SNPP: 4 };

/** The routes' rows (lon, lat, scan_km, track_km, frp_mw, time_utc, platform, ...) grouped by pass, as footprints. */
function passesOf(rows: Rows, extra?: (row: unknown[], col: (k: string) => number) => number | null) {
  const col = (k: string) => rows.columns.indexOf(k);
  const groups = new Map<string, NextLookRevealed & { look: number | null }>();
  for (const r of rows.rows) {
    const platform = String(r[col('platform')]);
    const time = String(r[col('time_utc')]);
    const key = `${platform} ${time}`;
    if (!groups.has(key)) groups.set(key, { platform, time_utc: time, footprints: [], look: extra ? extra(r, col) : null });
    const fp: Footprint = [
      Number(r[col('lon')]),
      Number(r[col('lat')]),
      Number(r[col('scan_km')]),
      Number(r[col('track_km')]),
      0,
      Number(r[col('frp_mw')]),
      0,
      SENSOR_CODES[platform] ?? 4,
    ];
    groups.get(key)?.footprints.push(fp);
  }
  return [...groups.values()];
}

const ROUTE = '/api/env/next_look';
const roundState = (id: string) => getJson<Obj>(`${ROUTE}/state`, { round_id: id });

export async function openRound(regionId: string, startDate: string, signal?: AbortSignal): Promise<NextLookEnv> {
  // The signal guards the reset only: the round outlives the effect that started it.
  const reset = await postJson<Obj>(`${ROUTE}/reset`, { region_id: regionId, start: startDate }, { signal });
  const ep = reset.episode as NextLookStart['episode'];
  const looks = (reset.looks as Array<Obj>).map((l) => ({
    index: Number(l.index),
    platform: String(l.platform),
    time_utc: String(l.time_utc),
    is_day: Boolean(l.is_day),
    schedule: 'nominal' as const,
    share_of_box: null,
    pixel_km: typeof l.scan_km === 'number' && typeof l.track_km === 'number' ? ([l.scan_km, l.track_km] as [number, number]) : null,
  }));
  const protocol = (reset.protocol as { version: number; note: string } | undefined) ?? { version: 0, note: '' };
  const start: NextLookStart = {
    round_id: String(reset.round_id),
    data: String(reset.data ?? 'firms'),
    episode: ep,
    estimate: { region_id: ep.region_id, start: ep.first_overpass_utc, holdout: 'viirs' },
    looks,
    score_start: Number(reset.score_start),
    known_limits: typeof reset.known_limits === 'string' ? reset.known_limits : '',
    protocol: { version: protocol.version, note: protocol.note.charAt(0).toUpperCase() + protocol.note.slice(1) },
  };
  const testEpisodes = reset.test_episodes as NextLookEnd['test_episodes'];
  const id = start.round_id;
  let revealedRows = 0;
  let endBlock: Obj | null = null;
  const taken: NextLookTaken[] = [];

  const step = (decision: number, action: number) => postJson<Obj>(`${ROUTE}/step`, { round_id: id, decision, action });

  return {
    start,
    async look(decision, tile) {
      let res = await step(decision, tile);
      const obs = (res.observation ?? null) as Obj | null;
      const info = (res.info ?? {}) as Obj;
      const rows = (obs?.viirs_revealed ?? null) as Rows | null;
      const fresh: Rows | null = rows ? { columns: rows.columns, rows: rows.rows.slice(revealedRows) } : null;
      if (rows) revealedRows = rows.rows.length;
      const pixels = Number(info.revealed_pixels ?? 0);
      const reward = typeof res.reward === 'number' ? res.reward : null;
      const score = typeof info.score === 'number' ? info.score : null;
      taken.push({ decision, tile, pixels, reward });
      let budgetLeft = obs ? Number(obs.budget_left) : 0;
      let next = res.done ? null : obs ? Number(obs.decision) : null;
      // With the budget spent the round is over for the player: pass the remaining looks so the end arrives.
      while (!res.done && budgetLeft === 0 && next !== null) {
        res = await step(next, -1);
        const o = (res.observation ?? null) as Obj | null;
        budgetLeft = o ? Number(o.budget_left) : 0;
        next = res.done ? null : o ? Number(o.decision) : null;
      }
      if (res.done) endBlock = (res.end ?? null) as Obj | null;
      return {
        round_id: id,
        decision,
        tile,
        revealed: fresh ? passesOf(fresh) : [],
        pixels,
        reward,
        score,
        looks_left: budgetLeft,
        next_decision: res.done ? null : next,
        done: Boolean(res.done),
      };
    },
    async gainOf(decision, action) {
      const res = await step(decision, action);
      return typeof res.reward === 'number' ? res.reward : null;
    },
    async state() {
      const st = await roundState(id);
      return {
        round_id: id,
        next_decision: typeof st.decision === 'number' ? st.decision : null,
        looks_left: Number((st.observation as Obj | undefined)?.budget_left ?? 0),
        taken: [...taken],
        score: null,
        done: Boolean(st.end),
      };
    },
    async end() {
      if (!endBlock) {
        const st = await roundState(id);
        endBlock = (st.end ?? null) as Obj | null;
      }
      if (!endBlock) throw new Error('the round is not done');
      // The reference agents are computed in the background from the reset; the state route serves them when ready.
      for (let i = 0; i < 40 && !endBlock.reference; i += 1) {
        await new Promise((r) => window.setTimeout(r, 3000));
        const st = await roundState(id);
        if (st.end) endBlock = st.end as Obj;
      }
      const reveal = endBlock.reveal as Rows;
      return {
        round_id: id,
        player: {
          taken: [...taken],
          gain: typeof endBlock.gain === 'number' ? endBlock.gain : null,
          final: typeof endBlock.score_end === 'number' ? endBlock.score_end : null,
        },
        reveal: {
          footprint_schema: FOOTPRINT_SCHEMA,
          overpasses: passesOf(reveal, (r, col) => {
            const look = Number(r[col('look')]);
            return Number.isFinite(look) && look >= 0 ? look : null;
          }),
        },
        reference: (endBlock.reference ?? null) as NextLookEnd['reference'],
        test_episodes: testEpisodes,
      };
    },
  };
}

/** Pixels per look and tile from the end's reveal: the busiest tile of each look the player spent. */
export function pixelsPerLookAndTile(end: NextLookEnd, start: NextLookStart): number[][] {
  const [rows, cols] = start.episode.tiles;
  const out = start.looks.map(() => new Array(rows * cols).fill(0) as number[]);
  for (const o of end.reveal.overpasses) {
    if (o.look === null || !out[o.look]) continue;
    for (const fp of o.footprints) {
      const t = tileOf(Number(fp[0]), Number(fp[1]), start.episode.box, rows, cols);
      if (t !== null) out[o.look][t] += 1;
    }
  }
  return out;
}

/** The round's run with the end's reveal in the place `withReveal` reads it, each pass on its nearest frame. */
export function runWithEndReveal(run: DynamicRegionRun, end: NextLookEnd): DynamicRegionRun {
  const r = run as unknown as Record<string, unknown>;
  const bt = (r.blind_test && typeof r.blind_test === 'object' ? r.blind_test : {}) as Record<string, unknown>;
  const overpasses = end.reveal.overpasses.map((o) => ({
    ...o,
    pixels_in_box: o.footprints.length,
    nearest_frame: frameNearest(run, Date.parse(o.time_utc) / 1000),
  }));
  return {
    ...r,
    blind_test: { ...bt, reveal: { footprint_schema: end.reveal.footprint_schema, overpasses } },
  } as unknown as DynamicRegionRun;
}
