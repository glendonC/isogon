import { useEffect, useState } from 'react';
import { getJson } from '../lib/api';

/**
 * The first year of the world's record (`GET /api/cube/countries`, `cube.first_month`), for the guide on the choice of
 * a place. Null until it answers, and when no cube is built: the sentence that needs it is then left out.
 */
export function useWorldFirstYear(): string | null {
  const [year, setYear] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getJson<{ cube?: { built?: boolean; first_month?: string | null } }>('/api/cube/countries', undefined, { signal: controller.signal })
      .then((d) => {
        const m = d.cube?.built ? d.cube.first_month : null;
        setYear(typeof m === 'string' && m.length >= 4 ? m.slice(0, 4) : null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return year;
}
