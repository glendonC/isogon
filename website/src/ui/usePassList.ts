import { useEffect, useState } from 'react';
import { fetchPassList, type PassList } from '../content/passes';
import { isRealRun } from '../content/realRuns';
import type { DynamicRegionRun } from '../stage/types';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);

/** An hour each side of the run, so a pass just outside its first or last frame still shows. */
const PAD_S = 3600;

/**
 * The pass list of a real run's window from `GET /api/passes`, for a run whose frames are only the passes with a
 * detection. A run whose frames are the pass list itself (`observer_passes.frames_from` "cmr"), a simulated run, or
 * a window the route has no list for gives null, and the track shows the run's own frames only.
 */
export function usePassList(run: DynamicRegionRun | null): PassList[] | null {
  const real = isRealRun(run) && run !== null;
  const framesFrom = real ? obj(obj(run as unknown as Obj)?.observer_passes)?.frames_from : null;
  const times = real
    ? (run.epoch_summaries ?? []).map((e) => Date.parse(e.timestamp_utc)).filter((t) => Number.isFinite(t))
    : [];
  const wanted = real && framesFrom !== 'cmr' && times.length >= 2;
  const regionId = real ? run.region.id : '';
  const start = wanted ? new Date(Math.min(...times) - PAD_S * 1000).toISOString() : '';
  const end = wanted ? new Date(Math.max(...times) + PAD_S * 1000).toISOString() : '';
  const key = wanted ? `${regionId}|${start}|${end}` : '';

  const [lists, setLists] = useState<{ key: string; lists: PassList[] | null }>({ key: '', lists: null });

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetchPassList(regionId, start, end, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setLists({ key, lists: list ? [list] : null });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLists({ key, lists: null });
      });
    return () => controller.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return key && lists.key === key ? lists.lists : null;
}
