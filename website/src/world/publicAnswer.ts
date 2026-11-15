/**
 * A drawn box's Record on a page of recorded answers: what the cube route would answer, summed in the browser from
 * the public fire cube the recorder copies beside the page (`publicCube.ts`, `boxRecord.ts`). Asked only when the
 * recorded folder holds no answer for the box, so a box the recorder did keep is read as it was recorded.
 *
 * The method is the one the recording's own Records were harmonized with: when they carry the fitted method
 * (`model_version` equal to the fitted tables' `serve.rows`), the box is harmonized by it with its tables; otherwise
 * by the overlap ratio inside the calendar, as the route on main does. Either way the figures are the backend's
 * (checked on 23 boxes, `isogon-notes/world-view/W13.md`).
 */

import { getJson, HttpError, type Query } from '../lib/api.ts';
import { loadPublicCube, type PublicCube } from './publicCube.ts';
import { parseBox, publicRecord, type Fitted } from './boxRecord.ts';

const env = ((import.meta as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;

/** Where the recorder puts the public cube's folder: `VITE_PUBLIC_CUBE_BASE`, else `cube/public/` in the recorded one. */
export const PUBLIC_CUBE_BASE: string =
  env.VITE_PUBLIC_CUBE_BASE || `${(env.VITE_RECORDED_BASE || 'recorded/').replace(/\/?$/, '/')}cube/public/`;

/** The requests this file answers: the cube route's Record of a box, and the calendar's route with a box. */
export function isBoxRecordRequest(path: string, query?: Query): boolean {
  if (path === '/api/cube/record') return true;
  return path === '/api/calendar' && query?.box !== undefined && query.box !== null && (query.source ?? 'firms') === 'firms';
}

// The recorded Records whose method the box follows, the first that answers.
const RECORDED_PLACES = ['plumas_ca', 'lytton_bc', 'evia_greece'];

async function methodOfRecording(fitted: Fitted): Promise<Fitted | null> {
  for (const id of RECORDED_PLACES) {
    try {
      const rec = await getJson<{ model_version?: string }>('/api/calendar', { region_id: id, source: 'firms' });
      return rec?.model_version === fitted.serve.rows ? fitted : null;
    } catch {
      // not recorded: try the next
    }
  }
  return null;
}

let opening: Promise<{ cube: PublicCube; fitted: Fitted | null }> | null = null;

function openCube(): Promise<{ cube: PublicCube; fitted: Fitted | null }> {
  opening ??= (async () => {
    const cube = await loadPublicCube(PUBLIC_CUBE_BASE);
    let fitted: Fitted | null = null;
    const name = cube.manifest.fitted?.name;
    if (name) {
      const resp = await fetch(`${PUBLIC_CUBE_BASE}${name}`);
      if (resp.ok) fitted = await methodOfRecording((await resp.json()) as Fitted);
    }
    return { cube, fitted };
  })().catch((err) => {
    opening = null;
    throw err;
  });
  return opening;
}

/** The answer the cube route gives for the box of `query`, or the error it gives (an `HttpError` of 400 or 404). */
export async function publicBoxAnswer(path: string, query?: Query): Promise<unknown> {
  if (!isBoxRecordRequest(path, query)) throw new HttpError(404, { error: `not a box's Record: ${path}` });
  const snap = String(query?.snap ?? 'outer');
  if (snap !== 'outer') throw new HttpError(400, { error: "a page of recorded answers takes a box on the grid's outer snap" });
  let box: [number, number, number, number];
  try {
    box = parseBox(String(query?.box ?? ''));
  } catch (err) {
    throw new HttpError(400, { error: err instanceof Error ? err.message : 'box must be west,south,east,north in degrees' });
  }
  const { cube, fitted } = await openCube();
  const rec = publicRecord(cube, box, { fitted });
  if (rec) return rec;
  const t = cube.box(...box);
  const src = cube.manifest.source;
  throw new HttpError(404, {
    error: 'not loaded: no loaded country file has a row in this box',
    state: 'not_loaded',
    grid_box: t.box,
    cells: t.cells,
    countries_loaded: src.countries ?? null,
    countries_listed: src.countries ?? null,
    world_complete: src.world_complete ?? null,
    note: 'a box with no loaded row is not loaded, not zero',
  });
}
