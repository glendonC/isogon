import { useEffect, useState } from 'react';
import { fetchCalendar, type Calendar } from '../content/calendar';
import type { RealRunStart } from '../content/realRuns';

export interface CalendarState {
  /** The region this state was fetched for, so a caller never acts on the previous region's calendar. */
  regionId: string;
  cal: Calendar | null;
  state: 'loading' | 'ready' | 'missing';
  /** Real run starts (`real_run_starts`). Empty without a real calendar, so nothing real is requested there. */
  runStarts: RealRunStart[];
}

/**
 * The burning calendar for a region: the real FIRMS calendar when the backend serves one, otherwise none (state
 * `missing`). Real run starts come from the real calendar's `real_run_starts`.
 */
export function useCalendar(apiBase: string, regionId: string): CalendarState {
  const [result, setResult] = useState<CalendarState>({ regionId, cal: null, state: 'loading', runStarts: [] });

  useEffect(() => {
    // No region asked for (the any-area sheet while closed): nothing to fetch.
    if (!regionId) return;
    const controller = new AbortController();
    setResult({ regionId, cal: null, state: 'loading', runStarts: [] });
    fetchCalendar(regionId, controller.signal)
      .then((cal) => {
        if (controller.signal.aborted) return;
        setResult(
          cal
            ? { regionId, cal, state: 'ready', runStarts: cal.runStarts }
            : { regionId, cal: null, state: 'missing', runStarts: [] },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ regionId, cal: null, state: 'missing', runStarts: [] });
      });
    return () => controller.abort();
  }, [apiBase, regionId]);

  return result;
}
