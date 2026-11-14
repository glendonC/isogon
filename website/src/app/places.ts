import { useEffect, useState } from 'react';
import { getJson } from '../lib/api';

/**
 * The places registry, `GET /api/regions`: the places with FIRMS rows, their featured fires (periods chosen by rule
 * from the real run starts), the named fires an agency list gives, the default fire by rule, and the limits of the
 * box calendar. No place, fire or start is typed in the page; everything here comes from that answer.
 */

export type Box = [number, number, number, number];

export interface FeaturedFire {
  id: string;
  region_id: string;
  /** "August 2012", "July and August 2021". */
  label: string;
  months: string[];
  first_day: string;
  last_day: string;
  size: { modis_pixels_in_box: number | null; at_start?: string; what?: string };
  /** A name only where an agency list names the fire. */
  name: string | null;
  name_source?: string | null;
  /** One of the three recorded test fires. */
  blind_test_fire: boolean;
  /** What the fire is to each part of the model; null until the model lane serves it. */
  to_the_model: Record<string, string> | null;
  default_start: string | null;
  default_start_rule?: string;
}

export interface Place {
  id: string;
  name: string;
  country: string | null;
  box: Box;
  context_box?: Box;
  /** "firms" for a place with real rows, "simulated" otherwise. */
  rows: 'firms' | 'simulated' | string;
  featured_fires: FeaturedFire[];
}

export interface PlacesDefault {
  region_id: string;
  featured_fire: string;
  start: string;
  rule: string;
}

export interface BoxCalendarLimits {
  countries: string[];
  country_extents: Record<string, Box>;
  max_span_deg: number;
  min_span_deg: number;
}

export interface Places {
  places: Place[];
  default: PlacesDefault | null;
  boxCalendar: BoxCalendarLimits | null;
}

type Obj = Record<string, unknown>;

/** The registry's answer, read defensively: a place without its box or fires is left out rather than guessed. */
export function parsePlaces(body: unknown): Places {
  const b = (body && typeof body === 'object' ? body : {}) as Obj;
  const places = Array.isArray(b.places)
    ? (b.places as Obj[]).filter((p) => typeof p.id === 'string' && Array.isArray(p.box) && Array.isArray(p.featured_fires))
    : [];
  const d = b.default as Obj | undefined;
  return {
    places: places as unknown as Place[],
    default:
      d && typeof d.region_id === 'string' && typeof d.start === 'string'
        ? (d as unknown as PlacesDefault)
        : null,
    boxCalendar: (b.box_calendar as BoxCalendarLimits | undefined) ?? null,
  };
}

export type PlacesState = { state: 'loading' | 'ready' | 'failed'; places: Places };

const EMPTY: Places = { places: [], default: null, boxCalendar: null };

/** The registry, fetched once. */
export function usePlaces(): PlacesState {
  const [s, setS] = useState<PlacesState>({ state: 'loading', places: EMPTY });
  useEffect(() => {
    const controller = new AbortController();
    getJson<unknown>('/api/regions', undefined, { signal: controller.signal })
      .then((body) => setS({ state: 'ready', places: parsePlaces(body) }))
      .catch(() => {
        if (!controller.signal.aborted) setS({ state: 'failed', places: EMPTY });
      });
    return () => controller.abort();
  }, []);
  return s;
}

/** The featured fire a run start belongs to, if any. */
export function fireOfStart(places: Places, regionId: string, start: string | null): FeaturedFire | null {
  if (!start) return null;
  const place = places.places.find((p) => p.id === regionId);
  if (!place) return null;
  const ym = start.slice(0, 7);
  return place.featured_fires.find((f) => f.months.includes(ym)) ?? null;
}

/**
 * The start a place opens on: the registry's default for the default place; otherwise the largest featured fire
 * that is not a recorded test fire; otherwise null (the caller falls back to the calendar's own default).
 */
export function openingStart(places: Places, regionId: string): string | null {
  if (places.default && places.default.region_id === regionId) return places.default.start;
  const place = places.places.find((p) => p.id === regionId);
  if (!place) return null;
  const open = place.featured_fires
    .filter((f) => !f.blind_test_fire && f.default_start)
    .sort((a, b) => (b.size.modis_pixels_in_box ?? 0) - (a.size.modis_pixels_in_box ?? 0));
  return open[0]?.default_start ?? null;
}
