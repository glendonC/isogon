/**
 * Demo data for a round of "next look".
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
 * NextLookLook, NextLookEnd); while `switches.ts` says demo it answers them in the page from a real blind run instead.
 *
 * Every value below is a real result of the next-look environment under test protocol version 2:
 *   - episode, box, window, MODIS pixels: the test episode `plumas_ca:22:2021-07-22T05` of the Dixie fire;
 *   - start score, each reference agent's gain and final score on that episode;
 *   - the means over the 21 test episodes;
 *   - the looks: `backend/eval/schedule.py::nominal_slots` for Suomi NPP and NOAA-20 over the episode window at the
 *     box centre (40.05 N, 121.18 W); the schedule reads no detection;
 *   - the example look: the real NOAA-20 pass of 2021-07-22 20:34 UTC inside tile C2, from the blind run's
 *     `blind_test.reveal`;
 *   - the known limits.
 * Not in any of those results, so null in the demo: the reward and score after a look the player chooses. The page
 * says "not measured yet" instead of showing a number.
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

/** An example answer to a look: look 4 (index 3, NOAA-20 by day), tile C2 (index 6). Real FIRMS rows. */
export const DEMO_NEXT_LOOK_EXAMPLE: NextLookLook = {
  round_id: 'demo_plumas_ca_22_2021-07-22T05',
  decision: 3,
  tile: 6,
  revealed: [
    {
      platform: 'VIIRS_NOAA20',
      time_utc: '2021-07-22T20:34:00Z',
      footprints: [
        [-121.17744, 40.11072, 0.38, 0.44, 75.6, 26.37, 55, 2],
        [-121.17914, 40.11453, 0.38, 0.44, 75.6, 9.94, 55, 2],
        [-121.17055, 40.11636, 0.38, 0.43, 75.6, 67.53, 55, 2],
        [-121.17403, 40.12395, 0.38, 0.43, 75.6, 10.51, 55, 2],
      ],
    },
  ],
  pixels: 4,
  reward: null,
  score: null,
  looks_left: 3,
  next_decision: 4,
  done: false,
};

/** The parts of a round's end that do not depend on the player: the reference agents and the test-episode means. */
export const DEMO_NEXT_LOOK_REFERENCE = {
  reference: {
    random: {
      gains: [
        0.007998034056856007, 0.0004285315476629803, 0.00581986483763125, 0.004080205805926995,
        4.944934676620605e-5, 0.005475079934007698, 0.0007882086301624902, 0.009040784257874024,
        0.0004963984007654298, 0.0027719950316675845,
      ],
      finals: [
        0.3304745568896512, 0.32056676153941344, 0.32369190770230744, 0.3215938946578256, 0.32008406997589167,
        0.32665610142630747, 0.3209707529558183, 0.332282552753474, 0.3204937352685771, 0.321,
      ],
    },
    latest_modis: { gain: 0.008431215474028197, final: 0.323189926547744 },
    least_sure: { gain: 0.006582908803626608, final: 0.3285629099582588 },
    learned: { gain: 0.006582908803626608, final: 0.3285629099582588 },
    oracle: { gain: 0.016330071325661333, final: 0.33732887928211175 },
  },
  test_episodes: {
    episodes: 21,
    mean_start_score: 0.2435470924248191,
    mean_gain: { random: 0.0028, latest_modis: 0.0163, least_sure: 0.0179, learned: 0.0157, oracle: 0.0269 },
  },
  source: { unit: 'sealed protocol', commit: '6c3857d' },
};
