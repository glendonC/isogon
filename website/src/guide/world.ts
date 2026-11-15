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

/** The Earth's years' figures for the guide (`GET /api/cube/years`): the newer satellite over the older ones, summed
 * over the whole years both flew, its lowest and highest year, and the last whole year. Null until it answers. */
export interface WorldYears {
  ratio: number | null;
  low: number | null;
  high: number | null;
  last: number | null;
  /** The first year the Earth plays (a part year: the archive begins in November 2000). */
  first: number | null;
}

type YearsIndex = { years?: Array<{ year?: number; partial?: boolean }>; layers?: Record<string, { rows?: number }> };

export function worldYearsOf(idx: YearsIndex): WorldYears {
  const whole = (idx.years ?? []).filter((y) => typeof y.year === 'number' && y.partial !== true).map((y) => y.year as number);
  const rows = (k: string) => idx.layers?.[k]?.rows;
  let sv = 0;
  let sm = 0;
  const each: number[] = [];
  for (const y of whole) {
    const v = rows(`viirs_${y}`);
    const m = rows(`modis_${y}`);
    if (typeof v !== 'number' || typeof m !== 'number' || m <= 0) continue;
    sv += v;
    sm += m;
    each.push(v / m);
  }
  return {
    ratio: sm > 0 ? sv / sm : null,
    low: each.length ? Math.min(...each) : null,
    high: each.length ? Math.max(...each) : null,
    last: whole.length ? Math.max(...whole) : null,
    first: (idx.years ?? []).reduce<number | null>((m, y) => (typeof y.year === 'number' && (m === null || y.year < m) ? y.year : m), null),
  };
}

export function useWorldYears(): WorldYears | null {
  const [w, setW] = useState<WorldYears | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getJson<YearsIndex>('/api/cube/years', undefined, { signal: controller.signal })
      .then((idx) => setW(worldYearsOf(idx)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return w;
}
