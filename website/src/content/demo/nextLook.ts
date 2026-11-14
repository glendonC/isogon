/**
 * The round of "next look": the shapes the page maps the routes onto, and the episode the page asks for.
 *
 * The backend serves the round (backend/server_next_look.py) as:
 *
 *   POST /api/env/next_look/reset   { region_id, episode | start, tiles, budget, seed }   -> round_id, episode, looks,
 *                                    score_start, observation, test_episodes, known_limits, protocol
 *   POST /api/env/next_look/step    { round_id, decision, action }  action: a tile, or -1  -> reward, done, info,
 *                                    observation; the step that ends the round adds `end` (reveal, reference, gain)
 *   GET  /api/env/next_look/state?round_id=...
 *
 * No response holds a hidden row before the look that reveals it. The page reads them through
 * `content/nextLookEnv.ts`, which maps the backend's answers onto the page's own types below (NextLookStart,
 * NextLookLook, NextLookEnd).
 *
 * `DEMO_NEXT_LOOK_START` names the episode the page resets (its key, tiles and budget) and stands in for the reset's
 * answer until it arrives: the test episode `plumas_ca:22:2021-07-22T05` of the Dixie fire, its window and its looks
 * from `backend/eval/schedule.py::nominal_slots`. Until the reset answers, the readout shows this record's window and
 * counts; no score of it is shown.
 */

/** A footprint as the payload writes it: [lon, lat, scan_km, track_km, angle_deg, frp_mw, confidence, sensor_code]. */
export type Footprint = [number, number, number, number, number, number, number, number];

export const FOOTPRINT_SCHEMA = ['lon', 'lat', 'scan_km', 'track_km', 'angle_deg', 'frp_mw', 'confidence', 'sensor_code'] as const;

/** One scheduled look: a moment a hidden instrument could be pointed at one tile. */
export interface NextLookSlot {
  index: number;
  platform: string;
  time_utc: string;
  is_day: boolean;
  /**
   * Where the time comes from: 'nominal' (half-day slots per platform) or 'cmr' (NASA CMR pass metadata). For 'cmr'
   * the two fields below are filled; for 'nominal' they are null.
   */
  schedule: 'nominal' | 'cmr';
  /** Share of the box inside the swath, 0 to 1. */
  share_of_box: number | null;
  /** Pixel size at the box's place in the swath, along scan and along track, km. */
  pixel_km: [number, number] | null;
}

export interface NextLookEpisode {
  key: string;
  region_id: string;
  /** West, south, east, north. */
  box: [number, number, number, number];
  first_overpass_utc: string;
  last_overpass_utc: string;
  modis_overpasses: number;
  modis_pixels_in_box: number;
  /** Rows, columns. Rows run north to south, columns west to east (the environment's `tile_of_cell` order). */
  tiles: [number, number];
  budget: number;
  /** The score the reward is a gain in. 'csi': the share of cells both the estimate and the hidden detections mark
   * as burning, out of all cells either marks. */
  score: 'csi';
  reward: string;
}

/**
 * The start of a round, from the answer of POST /api/env/next_look/reset. Nothing hidden: the episode, the looks,
 * the start score.
 */
export interface NextLookStart {
  round_id: string;
  /** "firms" when the round runs on the server's environment; absent for the demo. */
  data?: string;
  episode: NextLookEpisode;
  /**
   * The estimate the player sees: the blind run from `start`, with the hidden instrument held out, served by
   * POST /api/reconstruct. Its first response holds nothing the scorer wrote.
   */
  estimate: { region_id: string; start: string; holdout: 'viirs' };
  looks: NextLookSlot[];
  score_start: number;
  known_limits: string;
  protocol: { version: number; note: string };
}

/** The hidden detections one look uncovered: one entry per real pass matched to the look's slot. */
export interface NextLookRevealed {
  platform: string;
  /** The real pass time, which may differ from the slot's by up to about 90 minutes. */
  time_utc: string;
  footprints: Footprint[];
}

/**
 * One look, from the answer of POST /api/env/next_look/step. Only the detections of this look's slot inside the
 * chosen tile.
 */
export interface NextLookLook {
  round_id: string;
  decision: number;
  /** -1: the player passed. */
  tile: number;
  revealed: NextLookRevealed[];
  pixels: number;
  /** Gain in the score from this look; null in the demo, which measures none. */
  reward: number | null;
  score: number | null;
  looks_left: number;
  /** The next look to decide; null when the round is done. */
  next_decision: number | null;
  done: boolean;
}

export interface NextLookTaken {
  decision: number;
  tile: number;
  pixels: number;
  reward: number | null;
}

/** GET /api/env/next_look/state. Where the round stands; what was revealed is what the looks returned. */
export interface NextLookState {
  round_id: string;
  next_decision: number | null;
  looks_left: number;
  taken: NextLookTaken[];
  score: number | null;
  done: boolean;
}

export interface NextLookAgentResult {
  /** Sum of the rewards: the gain in the score against the hidden detections still hidden after each look. */
  gain: number;
  final: number;
}

/**
 * The end of a round, from the `end` block of the last step. The reveal, the player's result and the reference
 * agents on the same episode.
 */
export interface NextLookEnd {
  round_id: string;
  player: { taken: NextLookTaken[]; gain: number | null; final: number | null };
  reveal: {
    footprint_schema: readonly string[];
    /** Every hidden pass of the episode's looks, with the look it was matched to (null: outside every slot). */
    overpasses: (NextLookRevealed & { look: number | null })[];
  };
  /** Null while the server is still computing them. */
  reference: {
    random: { gains: number[]; finals: number[] };
    latest_modis: NextLookAgentResult;
    least_sure: NextLookAgentResult;
    learned: NextLookAgentResult | null;
    oracle: NextLookAgentResult;
  } | null;
  test_episodes: {
    episodes: number;
    mean_start_score: number;
    mean_gain: { random: number; latest_modis: number; least_sure: number; learned: number; oracle: number };
  };
  source?: { unit?: string; commit?: string };
}

const slot = (index: number, platform: string, time_utc: string, is_day: boolean): NextLookSlot => ({
  index,
  platform,
  time_utc,
  is_day,
  schedule: 'nominal',
  share_of_box: null,
  pixel_km: null,
});

export const DEMO_NEXT_LOOK_START: NextLookStart = {
  round_id: 'demo_plumas_ca_22_2021-07-22T05',
  episode: {
    key: 'plumas_ca:22:2021-07-22T05',
    region_id: 'plumas_ca',
    box: [-121.44, 39.86, -120.92, 40.24],
    first_overpass_utc: '2021-07-22T05:52:00Z',
    last_overpass_utc: '2021-07-24T09:56:00Z',
    modis_overpasses: 12,
    modis_pixels_in_box: 1095,
    tiles: [4, 4],
    budget: 4,
    score: 'csi',
    reward:
      'gain in the blind-test score of the reconstruction, measured before and after the look on the same target: the real hidden detections still hidden after the look',
  },
  estimate: { region_id: 'plumas_ca', start: '2021-07-22T05:52:00Z', holdout: 'viirs' },
  looks: [
    slot(0, 'VIIRS_SNPP', '2021-07-22T09:59:17Z', false),
    slot(1, 'VIIRS_NOAA20', '2021-07-22T10:04:17Z', false),
    slot(2, 'VIIRS_SNPP', '2021-07-22T21:00:10Z', true),
    slot(3, 'VIIRS_NOAA20', '2021-07-22T21:05:10Z', true),
    slot(4, 'VIIRS_SNPP', '2021-07-23T09:59:17Z', false),
    slot(5, 'VIIRS_NOAA20', '2021-07-23T10:04:17Z', false),
    slot(6, 'VIIRS_SNPP', '2021-07-23T21:00:10Z', true),
    slot(7, 'VIIRS_NOAA20', '2021-07-23T21:05:10Z', true),
  ],
  score_start: 0.3200562037998656,
  known_limits:
    'FIRMS lists detections, not where a satellite looked and saw nothing, and has no cloud mask: a revealed tile with no detection may have been cloudy rather than free of fire. The looks are the nominal half-day slots of each VIIRS platform, taken from the platform and the calendar and not from the hidden detections; the real pass is up to about 90 minutes from a slot\'s time, sometimes comes twice, and its pixel size is not known in advance. A list of real overpass times would remove that approximation.',
  protocol: {
    version: 2,
    note: 'Second look at the three 2021 test fires: a protocol correction. Episodes are chosen from MODIS rows alone; looks are nominal slots.',
  },
};
