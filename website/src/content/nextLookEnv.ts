import type { DynamicRegionRun } from '../stage/types';
import {
  DEMO_NEXT_LOOK_REFERENCE,
  DEMO_NEXT_LOOK_START,
  FOOTPRINT_SCHEMA,
  type Footprint,
  type NextLookEnd,
  type NextLookLook,
  type NextLookRevealed,
  type NextLookStart,
  type NextLookState,
  type NextLookTaken,
} from './demo/nextLook';
import { frameNearest, hiddenOverpassesOf, slotOf, tileOf } from './nextLook';

/**
 * The round's four routes (CONTRACT 13, shapes in content/demo/nextLook.ts). The page holds what the answers gave it
 * and nothing more: a look returns the detections of one slot inside one tile, and the rest arrive with /end.
 */
export interface NextLookEnv {
  start: NextLookStart;
  look(decision: number, tile: number): Promise<NextLookLook>;
  state(): Promise<NextLookState>;
  end(): Promise<NextLookEnd>;
}

/**
 * Demo: the routes answered in the page from a real blind run. The run's hidden rows stay inside this closure; each
 * answer carries only what the route would.
 */
export function demoNextLookEnv(run: DynamicRegionRun): NextLookEnv {
  const start = DEMO_NEXT_LOOK_START;
  const { box, tiles, budget } = start.episode;
  const [rows, cols] = tiles;
  const hidden = hiddenOverpassesOf(run);
  const taken: NextLookTaken[] = [];
  let next: number | null = 0;

  const lookedAt = (decision: number, tile: number): NextLookRevealed[] => {
    const out: NextLookRevealed[] = [];
    for (const o of hidden) {
      if (slotOf(start.looks, o.platform, o.timeS) !== decision) continue;
      const fps = o.footprints.filter((fp) => tileOf(Number(fp[0]), Number(fp[1]), box, rows, cols) === tile) as Footprint[];
      if (fps.length) out.push({ platform: o.platform, time_utc: new Date(o.timeS * 1000).toISOString().replace('.000', ''), footprints: fps });
    }
    return out;
  };
  const spent = () => taken.filter((t) => t.tile >= 0).length;
  const done = () => next === null;

  return {
    start,
    async look(decision, tile) {
      if (done() || decision !== next) throw new Error(`look ${decision} is not the one to decide`);
      const canSpend = spent() < budget;
      const t = tile >= 0 && canSpend ? tile : -1;
      const revealed = t >= 0 ? lookedAt(decision, t) : [];
      const pixels = revealed.reduce((a, r) => a + r.footprints.length, 0);
      taken.push({ decision, tile: t, pixels, reward: null });
      const following = decision + 1;
      next = following >= start.looks.length || spent() >= budget ? null : following;
      return {
        round_id: start.round_id,
        decision,
        tile: t,
        revealed,
        pixels,
        reward: null,
        score: null,
        looks_left: budget - spent(),
        next_decision: next,
        done: done(),
      };
    },
    async state() {
      return { round_id: start.round_id, next_decision: next, looks_left: budget - spent(), taken: [...taken], score: null, done: done() };
    },
    async end() {
      if (!done()) throw new Error('the round is not done');
      return {
        round_id: start.round_id,
        player: { taken: [...taken], gain: null, final: null },
        reveal: {
          footprint_schema: FOOTPRINT_SCHEMA,
          overpasses: hidden.map((o) => ({
            platform: o.platform,
            time_utc: new Date(o.timeS * 1000).toISOString().replace('.000', ''),
            look: slotOf(start.looks, o.platform, o.timeS),
            footprints: o.footprints as Footprint[],
          })),
        },
        ...DEMO_NEXT_LOOK_REFERENCE,
      };
    },
  };
}

/** Live: the routes on terrain-assets. Used once `switches.ts` marks the round live. */
export async function liveNextLookEnv(apiBase: string, regionId: string, signal?: AbortSignal): Promise<NextLookEnv> {
  const call = async <T,>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
    const r = await fetch(`${apiBase}/api/env/next_look/${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return (await r.json()) as T;
  };
  const start = await call<NextLookStart>('POST', 'start', { region_id: regionId, tiles: [4, 4], budget: 4 });
  const id = start.round_id;
  return {
    start,
    look: (decision, tile) => call<NextLookLook>('POST', 'look', { round_id: id, decision, tile }),
    state: () => call<NextLookState>('GET', `state?round_id=${encodeURIComponent(id)}`),
    end: () => call<NextLookEnd>('POST', 'end', { round_id: id }),
  };
}

/** Pixels per look and tile from the reveal of /end: the busiest tile of each look the player spent. */
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

/** The round's run with the reveal of /end in the place `withReveal` reads it, each pass on its nearest frame. */
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
