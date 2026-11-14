import { useEffect, useState } from 'react';
import { fetchCalendar, type Calendar } from '../content/calendar';
import { fetchRunStarts, type RealRunStart } from '../content/realRuns';

export interface CalendarState {
  cal: Calendar | null;
  state: 'loading' | 'ready' | 'missing';
  /** Real run start dates for this region. Empty on a simulated calendar, so nothing real is ever requested there. */
  runStarts: RealRunStart[];
}

/**
 * The burning calendar for a region: the real FIRMS calendar when the backend serves one, otherwise the simulated
 * one. Run starts come from the calendar response, or from `/api/runs/starts` when the calendar is real.
 */
export function useCalendar(apiBase: string, regionId: string): CalendarState {
  const [result, setResult] = useState<CalendarState>({ cal: null, state: 'loading', runStarts: [] });

  useEffect(() => {
    const controller = new AbortController();
    setResult({ cal: null, state: 'loading', runStarts: [] });
    (async () => {
      const cal = await fetchCalendar(apiBase, regionId, controller.signal);
      if (controller.signal.aborted) return;
      if (!cal) {
        setResult({ cal: null, state: 'missing', runStarts: [] });
        return;
      }
      setResult({ cal, state: 'ready', runStarts: cal.runStarts });
      if (cal.simulated || cal.runStarts.length > 0) return;
      const starts = await fetchRunStarts(apiBase, regionId, controller.signal);
      if (!controller.signal.aborted && starts.length > 0) setResult({ cal, state: 'ready', runStarts: starts });
    })().catch(() => {
      if (!controller.signal.aborted) setResult({ cal: null, state: 'missing', runStarts: [] });
    });
    return () => controller.abort();
  }, [apiBase, regionId]);

  return result;
}
