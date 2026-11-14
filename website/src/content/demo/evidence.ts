/**
 * Demo data for S2, the evidence sheet (CONTRACT 12).
 *
 * Stands in for `GET /api/evidence`, one JSON that fire-model will publish. Until it does, the sheet
 * (components/EvidenceSheet.tsx) reads `DEMO_EVIDENCE` and says "Demo data" on screen.
 *
 * Shape: `EvidenceDoc` below, snake_case like the backend's other payloads.
 *   - `commit`, `unit`: where the numbers come from.
 *   - `test_fires`: the blind test on the three 2021 test fires. `scores` lists the seven judged scores in order,
 *     each with which way is better; each fire carries `new` (protocol version 2, corrected) and `old` (version 1),
 *     each with its window, scored overpasses, hidden pixels, every method's value per score, every method's
 *     90 percent FRP interval (null when the method states none), how many of the seven Isogon is ahead of both
 *     baselines on, and optional `remarks` per score.
 *   - `audit`: one plain paragraph on what the outside audit found.
 *   - `validation`: the validation run that decides what is switched on: size, classes, the verdict per part with
 *     each score's class, and the FRP interval.
 *   - `next_look`: the next-look environment's reference table, `new` beside `old`.
 *   - `limits`: at most five plain sentences.
 *
 * Every value is a real result of fire-model unit M8, commit 6c3857d (files in the fire-model notes folder):
 *   - test_fires: `M8-evidence/test_fires_old_and_new.json` (windows, scored overpasses, scores, FRP intervals,
 *     `ahead_of_both_on`, the old hidden pixels as `viirs_pixels_in_box`); the new hidden pixels from
 *     `M8-evidence/test_fires_old_and_new.txt` ("hidden pixels old N new N"); the `note` and the Evia remark from
 *     `M8.md`, "The three test fires, a second look"; which way is better from `M8.md`, "Validation and the
 *     gates" ("off from 1" for the two ratios).
 *   - audit: `M8.md`, "For the owner, plainly".
 *   - validation: `M8.md`, "Validation and the gates" (the "now" column) and `M8-evidence/validate_log.txt`
 *     (decision, protocol note, per-part scores and classes, FRP interval 0.8026 over 152).
 *   - next_look: `new` from `M8-evidence/env_reference_table.txt` (21 test episodes); `old` from `M8.md`, "The
 *     environment's reference table, measured again" (the "before" columns, 22 test episodes); `holds_in_both`
 *     from the same section. What each agent does is from `M5.md`, sections 5 and 9.
 *   - limits: `M8.md`, "What is weak", and `M8-evidence/env_reference_table.json`, `known_limits`.
 */

export type EvidenceMethodId = 'reconstruction' | 'painted_modis' | 'overlap_ratio';

export type EvidenceScoreId =
  | 'csi_strict_375m'
  | 'csi_one_cell_tolerance'
  | 'hit_rate_at_equal_area'
  | 'brier'
  | 'pixel_ratio_of_sums'
  | 'frp_ratio_of_sums'
  | 'frp_median_abs_relative_error';

export interface EvidenceScore {
  id: EvidenceScoreId;
  label: string;
  /** Which way is better. `nearest_one` is a ratio of predicted to hidden, judged by how far it is from 1. */
  better: 'higher' | 'lower' | 'nearest_one';
}

export interface EvidenceCount {
  held: number;
  of: number;
}

/** One fire under one protocol. */
export interface EvidenceFireTest {
  protocol_version: number;
  first_overpass_utc: string;
  last_overpass_utc: string;
  scored_overpasses: number;
  hidden_pixels: number;
  scores: Record<EvidenceMethodId, Record<EvidenceScoreId, number>>;
  /** Overpasses whose hidden FRP total lay inside the method's stated interval; null when it states none. */
  frp_interval: Record<EvidenceMethodId, EvidenceCount | null>;
  /** Of the scores in `test_fires.scores`, how many Isogon is ahead of both baselines on. */
  ahead_of_both_on: number;
  /** Words fire-model adds to one score's verdict. */
  remarks?: Partial<Record<EvidenceScoreId, string>>;
}

export interface EvidenceFire {
  region_id: string;
  name: string;
  /** Protocol version 2, the corrected test. */
  new: EvidenceFireTest;
  /** Protocol version 1, the first test. */
  old: EvidenceFireTest;
}

export type EvidenceClass = 'ahead' | 'tied' | 'behind';

export interface EvidencePart {
  name: string;
  status: 'on' | 'experimental' | 'off';
  scores: { label: string; class: EvidenceClass }[];
}

export interface EvidenceValidation {
  protocol_version: number;
  episodes: number;
  years: number[];
  scored_overpasses: number;
  classes: Record<EvidenceClass, number>;
  fitted_values: { status: 'in use' | 'not used'; note: string };
  parts: EvidencePart[];
  frp_interval: { held: number; of: number; stated: number };
}

export interface EvidenceAgentResult {
  mean_final: number;
  mean_gain: number;
  share_of_oracle_gain: number;
}

export interface EvidenceAgent {
  id: string;
  label: string;
  /** What the agent does, in a few words. */
  does: string;
  new: EvidenceAgentResult;
  old: EvidenceAgentResult;
}

export interface EvidenceNextLook {
  tiles_per_side: number;
  looks: number;
  score: string;
  test_episodes: { new: number; old: number };
  mean_start_score: { new: number; old: number };
  agents: EvidenceAgent[];
  holds_in_both: string;
}

export interface EvidenceDoc {
  commit: string;
  unit: string;
  test_fires: {
    hidden: string;
    interval_level: number;
    note: string;
    scores: EvidenceScore[];
    fires: EvidenceFire[];
  };
  audit: string;
  validation: EvidenceValidation;
  next_look: EvidenceNextLook;
  limits: string[];
}

export const DEMO_EVIDENCE: EvidenceDoc = {
  commit: '6c3857d',
  unit: 'M8',
  test_fires: {
    hidden: 'VIIRS',
    interval_level: 0.9,
    note: 'a protocol correction, not a fresh test',
    scores: [
      { id: 'csi_strict_375m', label: 'CSI strict 375 m', better: 'higher' },
      { id: 'csi_one_cell_tolerance', label: 'CSI within one cell', better: 'higher' },
      { id: 'hit_rate_at_equal_area', label: 'Hit rate at equal area', better: 'higher' },
      { id: 'brier', label: 'Brier', better: 'lower' },
      { id: 'pixel_ratio_of_sums', label: 'Pixel count, predicted / hidden', better: 'nearest_one' },
      { id: 'frp_ratio_of_sums', label: 'FRP, predicted / hidden', better: 'nearest_one' },
      { id: 'frp_median_abs_relative_error', label: 'FRP median relative error', better: 'lower' },
    ],
    fires: [
      {
        region_id: 'plumas_ca',
        name: 'Dixie',
        new: {
          protocol_version: 2,
          first_overpass_utc: '2021-07-22T21:13:00Z',
          last_overpass_utc: '2021-07-25T06:22:00Z',
          scored_overpasses: 13,
          hidden_pixels: 7144,
          scores: {
            reconstruction: {
              csi_strict_375m: 0.3205713616672521,
              csi_one_cell_tolerance: 0.6258643519199647,
              hit_rate_at_equal_area: 0.490626723028855,
              brier: 0.040494296981168174,
              pixel_ratio_of_sums: 0.9827712834757192,
              frp_ratio_of_sums: 0.781863495486339,
              frp_median_abs_relative_error: 0.4242889116576661,
            },
            painted_modis: {
              csi_strict_375m: 0.2583051206093948,
              csi_one_cell_tolerance: 0.40890581899382633,
              hit_rate_at_equal_area: 0.4487226612755008,
              brier: 0.08088634029836969,
              pixel_ratio_of_sums: 0.15355543113101905,
              frp_ratio_of_sums: 0.8877545079115545,
              frp_median_abs_relative_error: 0.5576221257413014,
            },
            overlap_ratio: {
              csi_strict_375m: 0.2583051206093948,
              csi_one_cell_tolerance: 0.40890581899382633,
              hit_rate_at_equal_area: 0.4487226612755008,
              brier: 0.08088634029836969,
              pixel_ratio_of_sums: 1.2859861721138857,
              frp_ratio_of_sums: 0.7222770676368409,
              frp_median_abs_relative_error: 0.6400813615031228,
            },
          },
          frp_interval: {
            reconstruction: { held: 13, of: 13 },
            painted_modis: null,
            overlap_ratio: { held: 12, of: 13 },
          },
          ahead_of_both_on: 6,
        },
        old: {
          protocol_version: 1,
          first_overpass_utc: '2021-07-22T20:34:00Z',
          last_overpass_utc: '2021-07-24T21:01:00Z',
          scored_overpasses: 13,
          hidden_pixels: 7170,
          scores: {
            reconstruction: {
              csi_strict_375m: 0.3230075366447095,
              csi_one_cell_tolerance: 0.6235617251874397,
              hit_rate_at_equal_area: 0.47929269427640764,
              brier: 0.03958939194881053,
              pixel_ratio_of_sums: 0.9831716239082618,
              frp_ratio_of_sums: 0.8398533324250957,
              frp_median_abs_relative_error: 0.34741989949640933,
            },
            painted_modis: {
              csi_strict_375m: 0.25805773174194224,
              csi_one_cell_tolerance: 0.39725216933999474,
              hit_rate_at_equal_area: 0.45677059097254535,
              brier: 0.08140554510736002,
              pixel_ratio_of_sums: 0.1594142259414226,
              frp_ratio_of_sums: 1.2403430089465608,
              frp_median_abs_relative_error: 0.5576221257413014,
            },
            overlap_ratio: {
              csi_strict_375m: 0.25805773174194224,
              csi_one_cell_tolerance: 0.39725216933999474,
              hit_rate_at_equal_area: 0.45677059097254535,
              brier: 0.08140554510736002,
              pixel_ratio_of_sums: 1.335591562064156,
              frp_ratio_of_sums: 1.0082748319726593,
              frp_median_abs_relative_error: 0.6403910260151039,
            },
          },
          frp_interval: {
            reconstruction: { held: 13, of: 13 },
            painted_modis: null,
            overlap_ratio: { held: 12, of: 13 },
          },
          ahead_of_both_on: 6,
        },
      },
      {
        region_id: 'lytton_bc',
        name: 'Lytton Creek',
        new: {
          protocol_version: 2,
          first_overpass_utc: '2021-06-30T21:52:00Z',
          last_overpass_utc: '2021-07-03T05:24:00Z',
          scored_overpasses: 15,
          hidden_pixels: 938,
          scores: {
            reconstruction: {
              csi_strict_375m: 0.20020891364902507,
              csi_one_cell_tolerance: 0.5017497812773404,
              hit_rate_at_equal_area: 0.2667130919220056,
              brier: 0.006411261786781126,
              pixel_ratio_of_sums: 1.2896953828224043,
              frp_ratio_of_sums: 0.9531714751110558,
              frp_median_abs_relative_error: 0.27958418090371573,
            },
            painted_modis: {
              csi_strict_375m: 0.12127236580516898,
              csi_one_cell_tolerance: 0.23058823529411765,
              hit_rate_at_equal_area: 0.25487465181058494,
              brier: 0.01519030844574276,
              pixel_ratio_of_sums: 0.19509594882729211,
              frp_ratio_of_sums: 1.3632530371296805,
              frp_median_abs_relative_error: 0.6653690089587718,
            },
            overlap_ratio: {
              csi_strict_375m: 0.12127236580516898,
              csi_one_cell_tolerance: 0.23058823529411765,
              hit_rate_at_equal_area: 0.25487465181058494,
              brier: 0.01519030844574276,
              pixel_ratio_of_sums: 2.18024249407632,
              frp_ratio_of_sums: 1.109142671008708,
              frp_median_abs_relative_error: 0.7277442256888569,
            },
          },
          frp_interval: {
            reconstruction: { held: 12, of: 15 },
            painted_modis: null,
            overlap_ratio: { held: 11, of: 15 },
          },
          ahead_of_both_on: 7,
        },
        old: {
          protocol_version: 1,
          first_overpass_utc: '2021-06-30T21:52:00Z',
          last_overpass_utc: '2021-07-03T05:24:00Z',
          scored_overpasses: 15,
          hidden_pixels: 938,
          scores: {
            reconstruction: {
              csi_strict_375m: 0.19923769923769924,
              csi_one_cell_tolerance: 0.4958641706573792,
              hit_rate_at_equal_area: 0.282033426183844,
              brier: 0.006385246185220467,
              pixel_ratio_of_sums: 1.3365784603816298,
              frp_ratio_of_sums: 0.9682159124597293,
              frp_median_abs_relative_error: 0.2435136662755248,
            },
            painted_modis: {
              csi_strict_375m: 0.12778702163061564,
              csi_one_cell_tolerance: 0.24192905540055798,
              hit_rate_at_equal_area: 0.26740947075208915,
              brier: 0.015012744508405649,
              pixel_ratio_of_sums: 0.1908315565031983,
              frp_ratio_of_sums: 1.271345219250516,
              frp_median_abs_relative_error: 0.46882306362803194,
            },
            overlap_ratio: {
              csi_strict_375m: 0.12778702163061564,
              csi_one_cell_tolerance: 0.24192905540055798,
              hit_rate_at_equal_area: 0.26740947075208915,
              brier: 0.015012744508405649,
              pixel_ratio_of_sums: 2.1718877398720684,
              frp_ratio_of_sums: 1.0334765287287444,
              frp_median_abs_relative_error: 0.5097876348053115,
            },
          },
          frp_interval: {
            reconstruction: { held: 12, of: 15 },
            painted_modis: null,
            overlap_ratio: { held: 12, of: 15 },
          },
          ahead_of_both_on: 7,
        },
      },
      {
        region_id: 'evia_greece',
        name: 'northern Evia',
        new: {
          protocol_version: 2,
          first_overpass_utc: '2021-08-05T20:53:00Z',
          last_overpass_utc: '2021-08-08T19:46:00Z',
          scored_overpasses: 18,
          hidden_pixels: 6073,
          scores: {
            reconstruction: {
              csi_strict_375m: 0.2831220698037854,
              csi_one_cell_tolerance: 0.5206049533089728,
              hit_rate_at_equal_area: 0.44460948137145684,
              brier: 0.025707044583515946,
              pixel_ratio_of_sums: 0.6636743539830329,
              frp_ratio_of_sums: 0.8858560410544137,
              frp_median_abs_relative_error: 0.5150057820243114,
            },
            painted_modis: {
              csi_strict_375m: 0.2828872545302904,
              csi_one_cell_tolerance: 0.41596677434240886,
              hit_rate_at_equal_area: 0.46181458101250156,
              brier: 0.042333583986822784,
              pixel_ratio_of_sums: 0.12053350897414787,
              frp_ratio_of_sums: 1.1829209683925064,
              frp_median_abs_relative_error: 0.5333759644725323,
            },
            overlap_ratio: {
              csi_strict_375m: 0.2828872545302904,
              csi_one_cell_tolerance: 0.41596677434240886,
              hit_rate_at_equal_area: 0.46181458101250156,
              brier: 0.042333583986822784,
              pixel_ratio_of_sums: 0.9314870286850664,
              frp_ratio_of_sums: 0.9624244998841432,
              frp_median_abs_relative_error: 0.3917922310646124,
            },
          },
          frp_interval: {
            reconstruction: { held: 15, of: 18 },
            painted_modis: null,
            overlap_ratio: { held: 14, of: 18 },
          },
          ahead_of_both_on: 3,
          remarks: { csi_strict_375m: 'by 0.0002, in effect a tie' },
        },
        old: {
          protocol_version: 1,
          first_overpass_utc: '2021-08-06T12:14:00Z',
          last_overpass_utc: '2021-08-09T00:03:00Z',
          scored_overpasses: 14,
          hidden_pixels: 3488,
          scores: {
            reconstruction: {
              csi_strict_375m: 0.3598069900886802,
              csi_one_cell_tolerance: 0.6674200839522119,
              hit_rate_at_equal_area: 0.6965052115266708,
              brier: 0.01759363104181582,
              pixel_ratio_of_sums: 0.978250183515612,
              frp_ratio_of_sums: 1.102534233309853,
              frp_median_abs_relative_error: 0.48966590162374757,
            },
            painted_modis: {
              csi_strict_375m: 0.38933976749287125,
              csi_one_cell_tolerance: 0.6013081188681928,
              hit_rate_at_equal_area: 0.7255262620069487,
              brier: 0.03204272363150868,
              pixel_ratio_of_sums: 0.20212155963302753,
              frp_ratio_of_sums: 1.6568762247999198,
              frp_median_abs_relative_error: 0.3435126357060592,
            },
            overlap_ratio: {
              csi_strict_375m: 0.38933976749287125,
              csi_one_cell_tolerance: 0.6013081188681928,
              hit_rate_at_equal_area: 0.7255262620069487,
              brier: 0.03204272363150868,
              pixel_ratio_of_sums: 1.3799584862385323,
              frp_ratio_of_sums: 1.3468746831398546,
              frp_median_abs_relative_error: 0.30526433453167473,
            },
          },
          frp_interval: {
            reconstruction: { held: 13, of: 14 },
            painted_modis: null,
            overlap_ratio: { held: 13, of: 14 },
          },
          ahead_of_both_on: 4,
        },
      },
    ],
  },
  audit:
    'An outside audit found that the hidden VIIRS rows reached more than the score. They decided where a test ' +
    'window ended, and so how much MODIS the model was given. Each prediction was made at the hidden pass\'s own ' +
    'minute and pixel size. A baseline\'s pixel ratio came from a calendar that still held the three test fires, ' +
    'and 49 rows from inside the 2021 test boxes stayed in its training rows. In the next-look game, the hidden ' +
    'passes set when an agent could look. None of this carried the hidden fire\'s position or power into the ' +
    'estimate, but each path let the hidden instrument shape the test. Fire-model\'s own leak tests missed it: ' +
    'they changed hidden values but never deleted a row. The corrected protocol seals the hidden rows away until ' +
    'scoring. Nothing was refitted.',
  validation: {
    protocol_version: 2,
    episodes: 7,
    years: [2024, 2025],
    scored_overpasses: 152,
    classes: { ahead: 3, tied: 4, behind: 0 },
    fitted_values: { status: 'in use', note: 'fitted under the first protocol, not refitted' },
    parts: [
      {
        name: 'where the fire is',
        status: 'experimental',
        scores: [
          { label: 'CSI strict 375 m', class: 'tied' },
          { label: 'CSI within one cell', class: 'ahead' },
          { label: 'hit rate at equal area', class: 'tied' },
          { label: 'Brier', class: 'ahead' },
        ],
      },
      {
        name: 'how many pixels the hidden instrument flags',
        status: 'on',
        scores: [{ label: 'pixel count', class: 'ahead' }],
      },
      {
        name: 'total FRP and its interval',
        status: 'experimental',
        scores: [
          { label: 'FRP total', class: 'tied' },
          { label: 'FRP median relative error', class: 'tied' },
        ],
      },
    ],
    frp_interval: { held: 122, of: 152, stated: 0.9 },
  },
  next_look: {
    tiles_per_side: 4,
    looks: 4,
    score: 'CSI',
    test_episodes: { new: 21, old: 22 },
    mean_start_score: { new: 0.2435, old: 0.2461 },
    agents: [
      {
        id: 'random',
        label: 'Random',
        does: 'a tile at random, 10 seeds',
        new: { mean_final: 0.2462, mean_gain: 0.0028, share_of_oracle_gain: 0.103 },
        old: { mean_final: 0.2491, mean_gain: 0.0031, share_of_oracle_gain: 0.138 },
      },
      {
        id: 'latest_modis',
        label: 'Latest MODIS',
        does: 'the tile with the most recent MODIS fire power',
        new: { mean_final: 0.2525, mean_gain: 0.0163, share_of_oracle_gain: 0.607 },
        old: { mean_final: 0.2508, mean_gain: 0.0102, share_of_oracle_gain: 0.454 },
      },
      {
        id: 'least_sure',
        label: 'Least sure',
        does: 'the tile where the model is least sure',
        new: { mean_final: 0.2555, mean_gain: 0.0179, share_of_oracle_gain: 0.666 },
        old: { mean_final: 0.2531, mean_gain: 0.0113, share_of_oracle_gain: 0.502 },
      },
      {
        id: 'learned',
        label: 'Learned (M7)',
        does: 'weights from unit M7, not refitted',
        new: { mean_final: 0.2535, mean_gain: 0.0157, share_of_oracle_gain: 0.586 },
        old: { mean_final: 0.2523, mean_gain: 0.0106, share_of_oracle_gain: 0.469 },
      },
      {
        id: 'oracle',
        label: 'Oracle',
        does: 'sees the hidden data, a greedy ceiling',
        new: { mean_final: 0.2665, mean_gain: 0.0269, share_of_oracle_gain: 1 },
        old: { mean_final: 0.2659, mean_gain: 0.0225, share_of_oracle_gain: 1 },
      },
    ],
    holds_in_both:
      'In both tests least sure beats random by more than the noise, the learned policy does not beat least sure, ' +
      'and the oracle is the ceiling.',
  },
  limits: [
    'Pass times come from a nominal schedule. A prediction can be up to 100 minutes from the pass it is scored ' +
      'against and assumes a typical pixel; on training fires this costs about 0.010 of strict CSI and one score ' +
      'of seven.',
    'The fitted values were chosen under the first protocol and have not been refitted. A clean refit with its ' +
      'own validation is the next step.',
    'Validation rests on seven episodes from two regions; Evia has none in 2024 and 2025. The pixel count verdict ' +
      'is a narrow call that flips with one platform\'s rows.',
    'Evia is weak: ahead on 3 scores of 7, a strict CSI lead of 0.0002, and 2 of 7 on a blind run from its ' +
      'default start.',
    'FIRMS lists detections, not where a satellite looked and saw nothing, and has no cloud mask. In the ' +
      'next-look game, a tile uncovered with no detection may have been cloudy rather than free of fire.',
  ],
};
