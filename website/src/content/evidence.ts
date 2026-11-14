/**
 * The shape of `GET /api/evidence` (built by `backend.model.evidence.evidence()`), as far as the page reads it.
 * Snake case like the backend's other payloads. Keys the page does not read are left out of these types.
 *
 *   - `test_fires`: the blind test on the three 2021 test fires. `scores` lists the seven judged scores in order,
 *     each with which way is better. Each fire carries `looks` (every look on record, in order), `new` (the final
 *     look) and `old` (the first).
 *   - `audit`: one plain paragraph on what the first protocol let the hidden instrument decide.
 *   - `validation`: the validation run that decides what is switched on: size, classes, the verdict per part.
 *   - `next_look`: the next-look environment's reference table, `new` (the settings in use) beside `old` (the first).
 *   - `limits`: plain sentences on what the figures do not show.
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

/** One fire under one look. */
export interface EvidenceFireTest {
  protocol_version: number;
  first_overpass_utc: string;
  last_overpass_utc: string;
  scored_overpasses: number;
  hidden_pixels: number;
  scores: Record<EvidenceMethodId, Record<EvidenceScoreId, number>>;
  /** Overpasses whose hidden FRP total lay inside the method's stated interval; null when it states none. */
  frp_interval: Record<EvidenceMethodId, EvidenceCount | null>;
  /** Of the judged scores, how many Isogon is ahead of both baselines on. */
  ahead_of_both_on: number;
  /** How many scores this look judged. */
  scores_judged?: number;
  /** Words the backend adds to one score's verdict. */
  remarks?: Partial<Record<EvidenceScoreId, string>>;
}

/** One look of `looks`, numbered from 1. */
export interface EvidenceFireLook extends EvidenceFireTest {
  look: number;
  unit?: string;
}

export interface EvidenceFire {
  region_id: string;
  name: string;
  /** The final look. */
  new: EvidenceFireTest;
  /** The first look. */
  old: EvidenceFireTest;
  /** Every look on record, in order. */
  looks?: EvidenceFireLook[];
}

/** What each look was, in plain words. */
export interface EvidenceLookNote {
  look: number;
  protocol_version: number;
  what: string;
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
  /** What a look is rewarded with, in words. */
  reward?: string;
  test_episodes: { new: number; old: number };
  mean_start_score: { new: number; old: number };
  agents: EvidenceAgent[];
  holds_in_both: string;
  /** Which look at the test fires this table is, in words. */
  not_the_same_game_twice?: string;
}

export interface EvidenceDoc {
  commit: string | null;
  unit: string;
  test_fires: {
    hidden: string;
    interval_level: number;
    note: string;
    scores: EvidenceScore[];
    fires: EvidenceFire[];
    looks?: EvidenceLookNote[];
  };
  audit: string;
  validation: EvidenceValidation;
  next_look: EvidenceNextLook;
  limits: string[];
}

/** Where the page is with the evidence route. */
export type EvidenceState = 'loading' | 'ready' | 'failed';
