import type { TheaterId } from '../stage/earthCutawayTypes';

/**
 * Display copy for the four regions, keyed by theater id.
 * The stage catalog (stage/earthCutawayTypes.ts) is the stage's own list of regions;
 * every string the UI shows for a region comes from here instead.
 */
export interface TheaterDisplay {
  /** Place name, short enough for one line in the region list. */
  name: string;
  /** Country or state code shown after the name. */
  area: string;
  /** Longer place name for the workspace header. */
  title: string;
  /** Mountain range or coast, shown under the title. */
  setting: string;
  /** Latitude with hemisphere, for tabular columns. */
  lat: string;
  /** Longitude with hemisphere, for tabular columns. */
  lon: string;
  /**
   * What the region's fire record is, in a few words, so the page says what is on screen. Real NASA FIRMS rows
   * exist for the three hero boxes; Blue Mountains has none, so its fire is simulated.
   */
  season: string;
  /** One plain sentence on why this terrain is hard for a 1 km sensor. */
  note: string;
  /** The fire the region's default real run shows, as it is commonly named; the year comes from the run itself. */
  fire?: string;
  /** Elevation span used before a backend run reports its own. */
  elevation: string;
  /** Centre in signed decimal degrees, for the locator. */
  centerLat: number;
  centerLon: number;
}

export const THEATER_DISPLAY: Record<TheaterId, TheaterDisplay> = {
  plumas_ca: {
    name: 'Feather River',
    area: 'CA',
    title: 'Feather River Canyon',
    setting: 'Sierra Nevada, California',
    lat: '40.05° N',
    lon: '121.18° W',
    season: 'NASA FIRMS 2000 to 2025, 2021 Dixie fire',
    fire: 'Dixie Fire',
    note: 'A narrow granite gorge where a single 1 km pixel can span both canyon walls.',
    elevation: '313 to 2,357 m',
    centerLat: 40.05,
    centerLon: -121.18,
  },
  lytton_bc: {
    name: 'Lytton Gorge',
    area: 'BC',
    title: 'Lytton and the Fraser Gorge',
    setting: 'Fraser Canyon, British Columbia',
    lat: '50.23° N',
    lon: '121.58° W',
    season: 'NASA FIRMS 2000 to 2025, 2021 Lytton fire',
    note: 'More than 2,600 m of relief, so slope distorts every footprint.',
    elevation: '195 to 2,860 m',
    centerLat: 50.23,
    centerLon: -121.58,
  },
  evia_greece: {
    name: 'Northern Evia',
    area: 'GR',
    title: 'Northern Evia',
    setting: 'Aegean coast, Greece',
    lat: '38.88° N',
    lon: '23.32° E',
    season: 'NASA FIRMS 2000 to 2025, 2021 Evia fires',
    note: 'Off-nadir 1 km pixels straddle the coast and mix sea with burning land.',
    elevation: '0 to 1,385 m',
    centerLat: 38.88,
    centerLon: 23.32,
  },
  blue_mountains_au: {
    name: 'Blue Mountains',
    area: 'AU',
    title: 'Grose Valley, Blue Mountains',
    setting: 'Sandstone escarpment, New South Wales',
    lat: '33.62° S',
    lon: '150.38° E',
    season: 'Simulated fire; no NASA FIRMS rows fetched here',
    note: 'Sheer sandstone cliffs hide the valley floor from oblique views.',
    elevation: '65 to 1,215 m',
    centerLat: -33.62,
    centerLon: 150.38,
  },
};

export const THEATER_ORDER: readonly TheaterId[] = [
  'plumas_ca',
  'lytton_bc',
  'evia_greece',
  'blue_mountains_au',
];

/** Signed decimal degrees to the tabular "40.05° N" form used across the UI. */
export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
}

export function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

/** Example searches: place names with approximate centres for the locator preview. */
export interface ExamplePlace {
  label: string;
  query: string;
  lat: number;
  lon: number;
}

export const EXAMPLE_PLACES: readonly ExamplePlace[] = [
  { label: 'Yosemite Valley, CA', query: 'Yosemite Valley, CA', lat: 37.74, lon: -119.59 },
  { label: 'Lahaina, Maui', query: 'Lahaina, Maui, HI', lat: 20.88, lon: -156.68 },
  { label: 'Lake Tahoe, CA', query: 'Lake Tahoe, CA', lat: 39.09, lon: -120.03 },
  { label: 'Angeles Crest, CA', query: 'Angeles Crest, CA', lat: 34.32, lon: -118.02 },
];

/** "40.1, -121.2" or "40.1 -121.2" to numbers, or null. */
export function parseLatLon(text: string): { lat: number; lon: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
