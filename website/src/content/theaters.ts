import type { TheaterId } from '../stage/earthCutawayTypes';

/**
 * Display copy for the four calibrated regions, keyed by theater id.
 * The stage catalog (stage/earthCutawayTypes.ts) belongs to the graphics lane;
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
  /** The fire season the region is calibrated on. */
  season: string;
  /** One plain sentence on why this terrain is hard for a 1 km sensor. */
  note: string;
  /** Elevation span used before a backend run reports its own. */
  elevation: string;
}

export const THEATER_DISPLAY: Record<TheaterId, TheaterDisplay> = {
  plumas_ca: {
    name: 'Feather River',
    area: 'CA',
    title: 'Feather River Canyon',
    setting: 'Sierra Nevada, California',
    lat: '40.05° N',
    lon: '121.18° W',
    season: '2021 Dixie fire',
    note: 'A narrow granite gorge where a single 1 km pixel can span both canyon walls.',
    elevation: '313 to 2,357 m',
  },
  lytton_bc: {
    name: 'Lytton Gorge',
    area: 'BC',
    title: 'Lytton and the Fraser Gorge',
    setting: 'Fraser Canyon, British Columbia',
    lat: '50.23° N',
    lon: '121.58° W',
    season: '2021 Lytton fire',
    note: 'More than 2,600 m of relief, so slope distorts every footprint.',
    elevation: '195 to 2,860 m',
  },
  evia_greece: {
    name: 'Northern Evia',
    area: 'GR',
    title: 'Northern Evia',
    setting: 'Aegean coast, Greece',
    lat: '38.88° N',
    lon: '23.32° E',
    season: '2021 Evia fires',
    note: 'Off-nadir 1 km pixels straddle the coast and mix sea with burning land.',
    elevation: '0 to 1,385 m',
  },
  blue_mountains_au: {
    name: 'Blue Mountains',
    area: 'AU',
    title: 'Grose Valley, Blue Mountains',
    setting: 'Sandstone escarpment, New South Wales',
    lat: '33.62° S',
    lon: '150.38° E',
    season: '2019 to 2020 Gospers Mountain fire',
    note: 'Sheer sandstone cliffs hide the valley floor from oblique views.',
    elevation: '65 to 1,215 m',
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
