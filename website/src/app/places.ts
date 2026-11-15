import { useEffect, useState } from 'react';
import { getJson, recordedPeriodsLeftOut } from '../lib/api';

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
  /** What the fire is to the world model and to the learned agent ("never seen", "fitted on", ...); null until served. */
  to_the_world_model: string | null;
  to_the_learned_agent: string | null;
  /** The start the fire opens on: its busiest start, or for a recorded test fire its recorded window. */
  default_start: string | null;
  default_start_rule?: string;
  /** How the fire opens: held out, or (a recorded test fire) with every satellite on its recorded window. */
  opens?: {
    holdout_viirs: boolean;
    what?: string;
    recorded_window?: { first_overpass_utc: string; last_overpass_utc: string } | null;
  } | null;
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
  /** The registry's default inside the place, by its rule: the start, the fire and whether VIIRS is held out. */
  starts?: {
    default_start?: string | null;
    default_featured_fire?: string | null;
    default_holdout_viirs?: boolean | null;
    default_rule?: string;
  } | null;
}

export interface PlacesDefault {
  region_id: string;
  featured_fire: string;
  start: string;
  rule: string;
  holdout_viirs?: boolean;
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
    // On a page of recorded answers, a period the recording does not hold is left out of every list.
    Promise.all([getJson<unknown>('/api/regions', undefined, { signal: controller.signal }), recordedPeriodsLeftOut()])
      .then(([body, out]) => setS({ state: 'ready', places: leaveOut(parsePlaces(body), out) }))
      .catch(() => {
        if (!controller.signal.aborted) setS({ state: 'failed', places: EMPTY });
      });
    return () => controller.abort();
  }, []);
  return s;
}

/** The registry without the featured periods named (a recording's `periods_left_out`), nor any default that opens one. */
export function leaveOut(places: Places, ids: readonly string[]): Places {
  if (ids.length === 0) return places;
  const out = new Set(ids);
  return {
    ...places,
    default: places.default && out.has(places.default.featured_fire) ? null : places.default,
    places: places.places.map((p) => ({
      ...p,
      featured_fires: p.featured_fires.filter((f) => !out.has(f.id)),
      starts: p.starts?.default_featured_fire && out.has(p.starts.default_featured_fire) ? { ...p.starts, default_featured_fire: null, default_start: null } : p.starts,
    })),
  };
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
 * The start a place opens on, from the registry only: its default for the default place; otherwise the registry's
 * default inside the place (`starts.default_start` with its `default_featured_fire`); otherwise, by the same rule, the
 * largest featured fire that is not a recorded test fire, then the place's recorded test fire, which World model shows
 * as its record with every satellite. Never a start-list default, which named a closed window.
 */
export function openingStart(places: Places, regionId: string): string | null {
  if (places.default && places.default.region_id === regionId) return places.default.start;
  const place = places.places.find((p) => p.id === regionId);
  if (!place) return null;
  if (place.starts?.default_featured_fire && place.starts.default_start) return place.starts.default_start;
  const bySize = (a: FeaturedFire, b: FeaturedFire) => (b.size.modis_pixels_in_box ?? 0) - (a.size.modis_pixels_in_box ?? 0);
  const withStart = place.featured_fires.filter((f) => f.default_start);
  const open = withStart.filter((f) => !f.blind_test_fire).sort(bySize);
  return open[0]?.default_start ?? [...withStart].sort(bySize)[0]?.default_start ?? null;
}

/** The registry's start for a month of a place: the featured fire's own start when it falls in that month. */
export function registryStartOf(places: Places, regionId: string, ym: string): string | null {
  const fire = places.places.find((p) => p.id === regionId)?.featured_fires.find((f) => f.months.includes(ym));
  return fire?.default_start?.startsWith(ym) ? fire.default_start : null;
}

/**
 * A registry fire's name, said as what it is: the detections of a box and period are not all one named fire, so the
 * name is one among the fires there. Null where no agency list names one.
 */
export function fireNameWords(f: { name: string | null }): string | null {
  return f.name ? `Fires in this box in this period, among them the ${f.name}` : null;
}
