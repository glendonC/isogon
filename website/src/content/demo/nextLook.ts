/**
 * Demo data for S1, a round of "next look" (CONTRACT 10 and 12).
 *
 * Stands in for the round routes terrain-assets will wire over fire-model's environment
 * (`backend/env/next_look.py`, `NextLookEnv`):
 *
 *   POST /api/env/next_look/reset   { region_id, episode, tiles: [4, 4], budget: 4 }
 *     -> NextLookReset: the episode (`describe()`), its scheduled looks, the start score, and the reference agents
 *        played on the same episode.
 *   POST /api/env/next_look/step    { episode, decision, action }   action: a tile index 0 to 15, or -1 to pass
 *     -> NextLookStep: `reward`, `done`, `info.score`, `info.revealed_pixels` (the hidden detections of the look's
 *        slot inside the tile are drawn from the run's own rows; see content/nextLook.ts).
 *
 * Shape: `NextLookReset` below. Every value is a real result of fire-model unit M8 (commit 6c3857d):
 *   - episode, box, window, MODIS pixels: `M8-evidence/env_reference_table.json`, `test_episodes`, key
 *     `plumas_ca:22:2021-07-22T05` (a test episode of the Dixie fire);
 *   - start score and each reference agent's gain and final score on that episode: the same file, `per_episode`;
 *   - the means over the 21 test episodes: the same file, `table_4x4_4_looks` and `mean_start_score`;
 *   - the looks: `backend/eval/schedule.py::nominal_slots` at commit 6c3857d for Suomi NPP and NOAA-20 over the
 *     episode window at the box centre (40.05 N, 121.18 W); the schedule reads no detection;
 *   - the known limits: the same file, `known_limits`.
 * Not in any result yet, so not in the demo: the reward and score after a look the player chooses, and the
 * estimate refitted with it. The page says so instead of showing a number.
 */

export interface NextLookSlot {
  index: number;
  platform: string;
  time_utc: string;
  is_day: boolean;
}

export interface NextLookAgentResult {
  /** Sum of the rewards: the gain in CSI against the hidden detections still hidden after each look. */
  gain: number;
  final: number;
}

export interface NextLookReset {
  episode: {
    key: string;
    region_id: string;
    box: [number, number, number, number];
    first_overpass_utc: string;
    last_overpass_utc: string;
    modis_overpasses: number;
    modis_pixels_in_box: number;
    tiles: [number, number];
    budget: number;
    score: string;
    reward: string;
  };
  looks: NextLookSlot[];
  score_start: number;
  reference: {
    random: { gains: number[]; finals: number[] };
    latest_modis: NextLookAgentResult;
    least_sure: NextLookAgentResult;
    learned: NextLookAgentResult;
    oracle: NextLookAgentResult;
  };
  test_episodes: {
    episodes: number;
    mean_start_score: number;
    mean_gain: { random: number; latest_modis: number; least_sure: number; learned: number; oracle: number };
  };
  known_limits: string;
  protocol: { version: number; note: string };
  source: { unit: string; commit: string };
}

export const DEMO_NEXT_LOOK: NextLookReset = {
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
  looks: [
    { index: 0, platform: 'VIIRS_SNPP', time_utc: '2021-07-22T09:59:17Z', is_day: false },
    { index: 1, platform: 'VIIRS_NOAA20', time_utc: '2021-07-22T10:04:17Z', is_day: false },
    { index: 2, platform: 'VIIRS_SNPP', time_utc: '2021-07-22T21:00:10Z', is_day: true },
    { index: 3, platform: 'VIIRS_NOAA20', time_utc: '2021-07-22T21:05:10Z', is_day: true },
    { index: 4, platform: 'VIIRS_SNPP', time_utc: '2021-07-23T09:59:17Z', is_day: false },
    { index: 5, platform: 'VIIRS_NOAA20', time_utc: '2021-07-23T10:04:17Z', is_day: false },
    { index: 6, platform: 'VIIRS_SNPP', time_utc: '2021-07-23T21:00:10Z', is_day: true },
    { index: 7, platform: 'VIIRS_NOAA20', time_utc: '2021-07-23T21:05:10Z', is_day: true },
  ],
  score_start: 0.3200562037998656,
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
  known_limits:
    'FIRMS lists detections, not where a satellite looked and saw nothing, and has no cloud mask: a revealed tile with no detection may have been cloudy rather than free of fire. The looks are the nominal half-day slots of each VIIRS platform, taken from the platform and the calendar and not from the hidden detections; the real pass is up to about 90 minutes from a slot\'s time, sometimes comes twice, and its pixel size is not known in advance. A list of real overpass times would remove that approximation.',
  protocol: {
    version: 2,
    note: 'second look at the three 2021 test fires: a protocol correction. Episodes are chosen from MODIS rows alone; looks are nominal slots.',
  },
  source: { unit: 'fire-model M8', commit: '6c3857d' },
};
