/**
 * The round of "next look": the shapes the page maps the routes onto.
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
 * `beats/test-world/env.ts`, which asks for the round on the run that is open (its place and start) and maps the
 * backend's answers onto the page's own types below (NextLookStart, NextLookLook, NextLookEnd). No episode is typed in
 * the page.
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
