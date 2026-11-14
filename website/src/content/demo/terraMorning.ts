/**
 * Demo data for S6, after the satellites retire: Terra's morning pass estimated from VIIRS alone (CONTRACT 12).
 *
 * Stands in for a route fire-model will publish from `backend/model/terra_morning.py` (unit M4), for example
 *   GET /api/terra_morning?region_id=<id>
 *     -> TerraMorning: the region's test fire scored the way a blind test is (`blind_test`-shaped block: methods
 *        `reconstruction`, `painted_viirs`, `viirs_ratio`, each with `strict_375m`, `tolerant_1_cell`, `frp_total`
 *        and `interval`; `verdict.scores`), the validation summary, and the protocol it was measured under.
 *
 * Values: fire-model M4 (commit 42b3ffb), `M4-evidence/terra_test_fires.json` (per fire, cut to the keys the page
 * reads) and `M4.md` (validation: 6 episodes, 40 Terra morning overpasses; ahead on 4 scores, tied on 2, behind on
 * 1; the 90 percent interval held for 31 of 40). Every MODIS detection is hidden; the estimate is scored against
 * Terra's real morning overpasses (about 10:30 local solar time).
 * Protocol: measured under version 1 and NOT measured again in M8 (`fitted_values/terra_morning.json` carries that
 * note): its predictions used the hidden Terra pass's own time and pixel size.
 */

export interface TerraMorning {
  status: string;
  status_reason: string;
  terra_end: string;
  validation: { episodes: number; overpasses: number; ahead: number; tied: number; behind: number; interval_held: number; interval_n: number };
  protocol: { version: number; note: string };
  source: { unit: string; commit: string };
  /** Per region: its 2021 test fire, in the shape of a run's `blind_test` block. */
  fires: Record<string, { fire: string; blind_test: Record<string, unknown> }>;
}

const FIRES = {
  "plumas_ca": {
    "window_utc": [
      "2021-07-14T00:00:00Z",
      "2021-08-12T00:00:00Z"
    ],
    "hidden_platforms": [
      "MODIS_TERRA",
      "MODIS_AQUA"
    ],
    "scored_overpasses": 31,
    "hidden_rows_in_test_box": 715,
    "methods": {
      "painted_viirs": {
        "strict_375m": {
          "hit_rate": 0.3172,
          "false_alarm_ratio": 0.4901,
          "csi": 0.2431
        },
        "tolerant_1_cell": {
          "hit_rate": 0.6018,
          "false_alarm_ratio": 0.2697,
          "csi": 0.4924
        },
        "frp_total": {
          "median_abs_relative_error": 0.7327,
          "ratio_of_sums": 1.2715
        },
        "interval": {
          "stated_level": null,
          "covered": 0,
          "n": 0
        }
      },
      "viirs_ratio": {
        "strict_375m": {
          "hit_rate": 0.3172,
          "false_alarm_ratio": 0.4901,
          "csi": 0.2431
        },
        "tolerant_1_cell": {
          "hit_rate": 0.6018,
          "false_alarm_ratio": 0.2697,
          "csi": 0.4924
        },
        "frp_total": {
          "median_abs_relative_error": 0.7514,
          "ratio_of_sums": 1.3039
        },
        "interval": {
          "stated_level": 0.9,
          "covered": 21,
          "n": 31
        }
      },
      "reconstruction": {
        "strict_375m": {
          "hit_rate": 0.5465,
          "false_alarm_ratio": 0.4964,
          "csi": 0.3552
        },
        "tolerant_1_cell": {
          "hit_rate": 0.7334,
          "false_alarm_ratio": 0.3495,
          "csi": 0.5261
        },
        "frp_total": {
          "median_abs_relative_error": 0.7157,
          "ratio_of_sums": 1.068
        },
        "interval": {
          "stated_level": 0.9,
          "covered": 24,
          "n": 31
        }
      }
    },
    "verdict": {
      "scores": {
        "csi_strict_375m": {
          "beats_every_baseline": true
        },
        "csi_one_cell_tolerance": {
          "beats_every_baseline": true
        },
        "hit_rate_at_equal_area": {
          "beats_every_baseline": true
        },
        "brier": {
          "beats_every_baseline": true
        },
        "pixel_count_error_of_sums": {
          "beats_every_baseline": false
        },
        "frp_error_of_sums": {
          "beats_every_baseline": true
        },
        "frp_median_abs_relative_error": {
          "beats_every_baseline": true
        }
      }
    },
    "definitions": {
      "hit_rate": "TP / (TP + FN): the share of truth cells that are predicted cells. Undefined when there is no truth cell.",
      "false_alarm_ratio": "FP / (TP + FP): the share of predicted cells that are not truth cells. Undefined with no predicted cell.",
      "tolerant_scores": "The same four scores with a one cell (375 m) tolerance: a truth cell is hit when a predicted cell lies within one cell of it, and a predicted cell is a false alarm only when no truth cell lies within one cell.",
      "frp_total_error": "Per overpass, predicted total FRP in the box minus the hidden instrument's total, divided by the hidden total (signed, so minus 0.5 means half). Summarised by its median, by the median absolute value, and by the ratio of the two totals summed over the scored overpasses. Overpasses with a hidden total of zero are left out of the relative figures and counted.",
      "interval_coverage": "The share of scored overpasses whose hidden total FRP lies inside the method's stated interval, next to the level the method states (for example 0.90). A method that states no interval is reported as stating none."
    }
  },
  "lytton_bc": {
    "window_utc": [
      "2021-06-30T00:00:00Z",
      "2021-07-12T00:00:00Z"
    ],
    "hidden_platforms": [
      "MODIS_TERRA",
      "MODIS_AQUA"
    ],
    "scored_overpasses": 13,
    "hidden_rows_in_test_box": 50,
    "methods": {
      "painted_viirs": {
        "strict_375m": {
          "hit_rate": 0.2698,
          "false_alarm_ratio": 0.4984,
          "csi": 0.2127
        },
        "tolerant_1_cell": {
          "hit_rate": 0.689,
          "false_alarm_ratio": 0.1964,
          "csi": 0.5897
        },
        "frp_total": {
          "median_abs_relative_error": 0.6709,
          "ratio_of_sums": 0.6628
        },
        "interval": {
          "stated_level": null,
          "covered": 0,
          "n": 0
        }
      },
      "viirs_ratio": {
        "strict_375m": {
          "hit_rate": 0.2698,
          "false_alarm_ratio": 0.4984,
          "csi": 0.2127
        },
        "tolerant_1_cell": {
          "hit_rate": 0.689,
          "false_alarm_ratio": 0.1964,
          "csi": 0.5897
        },
        "frp_total": {
          "median_abs_relative_error": 0.6625,
          "ratio_of_sums": 0.6797
        },
        "interval": {
          "stated_level": 0.9,
          "covered": 7,
          "n": 13
        }
      },
      "reconstruction": {
        "strict_375m": {
          "hit_rate": 0.4107,
          "false_alarm_ratio": 0.448,
          "csi": 0.308
        },
        "tolerant_1_cell": {
          "hit_rate": 0.6082,
          "false_alarm_ratio": 0.2863,
          "csi": 0.489
        },
        "frp_total": {
          "median_abs_relative_error": 0.6542,
          "ratio_of_sums": 0.4848
        },
        "interval": {
          "stated_level": 0.9,
          "covered": 6,
          "n": 13
        }
      }
    },
    "verdict": {
      "scores": {
        "csi_strict_375m": {
          "beats_every_baseline": true
        },
        "csi_one_cell_tolerance": {
          "beats_every_baseline": false
        },
        "hit_rate_at_equal_area": {
          "beats_every_baseline": true
        },
        "brier": {
          "beats_every_baseline": true
        },
        "pixel_count_error_of_sums": {
          "beats_every_baseline": false
        },
        "frp_error_of_sums": {
          "beats_every_baseline": false
        },
        "frp_median_abs_relative_error": {
          "beats_every_baseline": true
        }
      }
    },
    "definitions": {
      "hit_rate": "TP / (TP + FN): the share of truth cells that are predicted cells. Undefined when there is no truth cell.",
      "false_alarm_ratio": "FP / (TP + FP): the share of predicted cells that are not truth cells. Undefined with no predicted cell.",
      "tolerant_scores": "The same four scores with a one cell (375 m) tolerance: a truth cell is hit when a predicted cell lies within one cell of it, and a predicted cell is a false alarm only when no truth cell lies within one cell.",
      "frp_total_error": "Per overpass, predicted total FRP in the box minus the hidden instrument's total, divided by the hidden total (signed, so minus 0.5 means half). Summarised by its median, by the median absolute value, and by the ratio of the two totals summed over the scored overpasses. Overpasses with a hidden total of zero are left out of the relative figures and counted.",
      "interval_coverage": "The share of scored overpasses whose hidden total FRP lies inside the method's stated interval, next to the level the method states (for example 0.90). A method that states no interval is reported as stating none."
    }
  },
  "evia_greece": {
    "window_utc": [
      "2021-08-03T00:00:00Z",
      "2021-08-12T00:00:00Z"
    ],
    "hidden_platforms": [
      "MODIS_TERRA",
      "MODIS_AQUA"
    ],
    "scored_overpasses": 6,
    "hidden_rows_in_test_box": 135,
    "methods": {
      "painted_viirs": {
        "strict_375m": {
          "hit_rate": 0.329,
          "false_alarm_ratio": 0.2136,
          "csi": 0.302
        },
        "tolerant_1_cell": {
          "hit_rate": 0.6937,
          "false_alarm_ratio": 0.0446,
          "csi": 0.6719
        },
        "frp_total": {
          "median_abs_relative_error": 0.3067,
          "ratio_of_sums": 0.8484
        },
        "interval": {
          "stated_level": null,
          "covered": 0,
          "n": 0
        }
      },
      "viirs_ratio": {
        "strict_375m": {
          "hit_rate": 0.329,
          "false_alarm_ratio": 0.2136,
          "csi": 0.302
        },
        "tolerant_1_cell": {
          "hit_rate": 0.6937,
          "false_alarm_ratio": 0.0446,
          "csi": 0.6719
        },
        "frp_total": {
          "median_abs_relative_error": 0.289,
          "ratio_of_sums": 0.87
        },
        "interval": {
          "stated_level": 0.9,
          "covered": 6,
          "n": 6
        }
      },
      "reconstruction": {
        "strict_375m": {
          "hit_rate": 0.5589,
          "false_alarm_ratio": 0.3787,
          "csi": 0.4169
        },
        "tolerant_1_cell": {
          "hit_rate": 0.796,
          "false_alarm_ratio": 0.1999,
          "csi": 0.664
        },
        "frp_total": {
          "median_abs_relative_error": 0.307,
          "ratio_of_sums": 0.8851
        },
        "interval": {
          "stated_level": 0.9,
          "covered": 5,
          "n": 6
        }
      }
    },
    "verdict": {
      "scores": {
        "csi_strict_375m": {
          "beats_every_baseline": true
        },
        "csi_one_cell_tolerance": {
          "beats_every_baseline": false
        },
        "hit_rate_at_equal_area": {
          "beats_every_baseline": true
        },
        "brier": {
          "beats_every_baseline": true
        },
        "pixel_count_error_of_sums": {
          "beats_every_baseline": true
        },
        "frp_error_of_sums": {
          "beats_every_baseline": true
        },
        "frp_median_abs_relative_error": {
          "beats_every_baseline": false
        }
      }
    },
    "definitions": {
      "hit_rate": "TP / (TP + FN): the share of truth cells that are predicted cells. Undefined when there is no truth cell.",
      "false_alarm_ratio": "FP / (TP + FP): the share of predicted cells that are not truth cells. Undefined with no predicted cell.",
      "tolerant_scores": "The same four scores with a one cell (375 m) tolerance: a truth cell is hit when a predicted cell lies within one cell of it, and a predicted cell is a false alarm only when no truth cell lies within one cell.",
      "frp_total_error": "Per overpass, predicted total FRP in the box minus the hidden instrument's total, divided by the hidden total (signed, so minus 0.5 means half). Summarised by its median, by the median absolute value, and by the ratio of the two totals summed over the scored overpasses. Overpasses with a hidden total of zero are left out of the relative figures and counted.",
      "interval_coverage": "The share of scored overpasses whose hidden total FRP lies inside the method's stated interval, next to the level the method states (for example 0.90). A method that states no interval is reported as stating none."
    }
  }
} as const;

export const DEMO_TERRA_MORNING: TerraMorning = {
  status: 'experimental',
  status_reason: 'a score is behind on validation, and the interval falls short',
  terra_end: 'Terra\'s science data are projected to end in February 2027',
  validation: { episodes: 6, overpasses: 40, ahead: 4, tied: 2, behind: 1, interval_held: 31, interval_n: 40 },
  protocol: {
    version: 1,
    note: 'Measured under the first test protocol and not measured again since the audit: its predictions used the hidden Terra pass\'s own time and pixel size.',
  },
  source: { unit: 'fire-model M4', commit: '42b3ffb' },
  fires: {
    plumas_ca: { fire: 'Dixie fire', blind_test: FIRES.plumas_ca },
    lytton_bc: { fire: 'Lytton Creek fire', blind_test: FIRES.lytton_bc },
    evia_greece: { fire: 'northern Evia fires', blind_test: FIRES.evia_greece },
  },
};
