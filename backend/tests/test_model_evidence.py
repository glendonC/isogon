"""The evidence sheet's dict (backend/model/evidence.py): its shape, and that no figure in it is typed by hand.

Every assertion compares the dict with the tracked files it is read from, or recomputes a figure from them. The
shape is the page lane's demo file for surface S2 (`website/src/content/demo/evidence.ts`, `EvidenceDoc`).
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.model import evidence as E  # noqa: E402

METHODS = {"reconstruction", "painted_modis", "overlap_ratio"}
SCORE_IDS = ["csi_strict_375m", "csi_one_cell_tolerance", "hit_rate_at_equal_area", "brier", "pixel_ratio_of_sums",
             "frp_ratio_of_sums", "frp_median_abs_relative_error"]
FIRE_TEST_KEYS = {"protocol_version", "first_overpass_utc", "last_overpass_utc", "scored_overpasses", "hidden_pixels",
                  "scores", "frp_interval", "ahead_of_both_on"}


class EvidenceShapeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc = E.evidence()
        cls.record = json.loads((E.FITTED_DIR / E.LOOKS_FILE).read_text(encoding="utf-8"))
        cls.params = json.loads((E.FITTED_DIR / E.PARAMS_FILE).read_text(encoding="utf-8"))
        cls.env = json.loads(E.ENV_FILE.read_text(encoding="utf-8"))

    def test_it_is_json_and_has_the_keys_of_the_requested_shape(self) -> None:
        d = self.doc
        text = json.dumps(d)
        self.assertNotIn("NaN", text)
        self.assertNotIn("Infinity", text)
        for key in ("commit", "unit", "test_fires", "audit", "validation", "next_look", "limits"):
            self.assertIn(key, d)
        tf = d["test_fires"]
        self.assertEqual((tf["hidden"], tf["interval_level"]), ("VIIRS", 0.9))
        self.assertEqual([s["id"] for s in tf["scores"]], SCORE_IDS)
        self.assertEqual({s["better"] for s in tf["scores"]}, {"higher", "lower", "nearest_one"})
        self.assertEqual([f["region_id"] for f in tf["fires"]], ["plumas_ca", "lytton_bc", "evia_greece"])
        for fire in tf["fires"]:
            self.assertTrue(fire["name"])
            self.assertEqual((fire["old"]["protocol_version"], fire["new"]["protocol_version"]), (1, 2))
            for side in ("old", "new"):
                t = fire[side]
                self.assertTrue(FIRE_TEST_KEYS <= set(t))
                self.assertEqual(set(t["scores"]), METHODS)
                for m in METHODS:
                    self.assertEqual(list(t["scores"][m]), SCORE_IDS)
                    for v in t["scores"][m].values():
                        self.assertIsInstance(v, float)
                self.assertIsNone(t["frp_interval"]["painted_modis"])             # it states no interval
                self.assertEqual(set(t["frp_interval"]["reconstruction"]), {"held", "of"})
                self.assertTrue(0 <= t["ahead_of_both_on"] <= 7)
        v = d["validation"]
        for key in ("protocol_version", "episodes", "years", "scored_overpasses", "classes", "fitted_values", "parts", "frp_interval"):
            self.assertIn(key, v)
        self.assertEqual(set(v["classes"]), {"ahead", "tied", "behind"})
        self.assertIn(v["fitted_values"]["status"], ("in use", "not used"))
        for part in v["parts"]:
            self.assertIn(part["status"], ("on", "experimental", "off"))
            for s in part["scores"]:
                self.assertIn(s["class"], ("ahead", "tied", "behind"))
        n = d["next_look"]
        for key in ("tiles_per_side", "looks", "score", "test_episodes", "mean_start_score", "agents", "holds_in_both"):
            self.assertIn(key, n)
        self.assertEqual([a["id"] for a in n["agents"]], ["random", "latest_modis", "least_sure", "learned", "oracle"])
        for a in n["agents"]:
            for side in ("new", "old"):
                self.assertEqual(set(a[side]), {"mean_final", "mean_gain", "share_of_oracle_gain"})
        self.assertTrue(1 <= len(d["limits"]) <= 5)
        self.assertTrue(all(isinstance(s, str) and s.endswith(".") for s in d["limits"]))

    def test_every_look_is_there_and_the_other_scorings_are_listed(self) -> None:
        tf = self.doc["test_fires"]
        self.assertEqual([(e["look"], e["unit"], e["protocol_version"]) for e in tf["looks"]], [(1, "M2", 1), (2, "M8", 2)])
        for fire in tf["fires"]:
            self.assertEqual([e["look"] for e in fire["looks"]], [1, 2])
            self.assertEqual(fire["looks"][0]["ahead_of_both_on"], fire["old"]["ahead_of_both_on"])
            self.assertEqual(fire["looks"][-1]["scores"], fire["new"]["scores"])
        units = [(o["unit"], o["protocol_version"]) for o in tf["also_scored"]]
        for unit in (("M1a", 1), ("M1b", 1), ("M4", 1), ("M6", 1), ("M8", 2), ("M8b", 2)):
            self.assertIn(unit, units)
        for o in tf["also_scored"]:
            for f in o["fires"].values():
                self.assertTrue(0 <= f["ahead_of_both_on"] <= f["scores_judged"] <= 7)
                self.assertTrue(f["report"].endswith(".json"))
        self.assertIn("None of these is the test", tf["also_scored_note"])

    def test_the_test_fire_figures_are_the_record_and_the_counts_follow_from_the_scores(self) -> None:
        by_look = {e["look"]: e for e in self.record["looks"]}
        better = {s["id"]: s["better"] for s in self.doc["test_fires"]["scores"]}
        for fire in self.doc["test_fires"]["fires"]:
            r = fire["region_id"]
            self.assertEqual(fire["old"], by_look[1]["fires"][r])
            self.assertEqual(fire["new"], by_look[2]["fires"][r])
            for t in (fire["old"], fire["new"]):
                # recount, from the scores alone, how many the reconstruction is ahead of both baselines on
                ahead = 0
                for sid in SCORE_IDS:
                    mine = t["scores"]["reconstruction"][sid]
                    others = [t["scores"][b][sid] for b in ("painted_modis", "overlap_ratio")]
                    ahead += int(E._lead(mine, others, better[sid]) > 0)
                self.assertEqual(ahead, t["ahead_of_both_on"])
                self.assertEqual(len(t["ahead_on"]), ahead)
                for sid, words in (t.get("remarks") or {}).items():
                    lead = E._lead(t["scores"]["reconstruction"][sid], [t["scores"][b][sid] for b in ("painted_modis", "overlap_ratio")], better[sid])
                    self.assertLess(lead, E.REMARK_MARGIN)
                    self.assertIn(f"{lead:.4f}", words)
        # every report the record was copied from is named with its digest
        named = set(self.record["sources_sha256"])
        for e in self.record["looks"] + self.record["other_scorings"]:
            for f in e["fires"].values():
                self.assertIn(f["report"], named)
        self.assertTrue(all(re.fullmatch(r"[0-9a-f]{64}", h) for h in self.record["sources_sha256"].values()))

    def test_validation_is_read_from_the_tracked_decision(self) -> None:
        v, p = self.doc["validation"], self.params
        fit = p["evidence"]["validation_fitted"]
        self.assertEqual(v["episodes"], len(p["evidence"]["validation_episodes"]))
        self.assertEqual(v["scored_overpasses"], fit["methods"]["_scored_overpasses"])
        self.assertEqual(v["classes"], {"ahead": fit["verdict"]["classes"]["ahead"], "tied": fit["verdict"]["classes"]["tie"],
                                        "behind": fit["verdict"]["classes"]["behind"]})
        self.assertEqual(v["fitted_values"]["status"] == "in use", p["adopted"])
        self.assertEqual({part["name"]: part["status"] for part in v["parts"]}, {name: part["status"] for name, part in p["parts"].items()})
        iv = fit["methods"]["reconstruction"]["interval"]
        self.assertEqual(v["frp_interval"], {"held": iv["covered"], "of": iv["n"], "stated": iv["stated_level"]})
        self.assertEqual(v["protocol_version"], p["protocol"]["validated_under"])
        refitted = p["protocol"]["parameters_fitted_under"] == p["protocol"]["validated_under"]
        self.assertEqual("not refitted" in v["fitted_values"]["note"], not refitted)
        self.assertEqual("Nothing was refitted." in self.doc["audit"], not refitted)
        if p.get("previous_decision"):
            self.assertEqual(v["before"]["parts"], p["previous_decision"]["parts"])

    def test_the_environment_table_is_read_from_the_tracked_file(self) -> None:
        n, env = self.doc["next_look"], self.env
        self.assertEqual(n["test_episodes"], {"new": env["test_protocol_2"]["episodes"], "old": env["test"]["episodes"]})
        self.assertEqual(n["mean_start_score"], {"new": env["test_protocol_2"]["mean_start_score"], "old": env["test"]["mean_start_score"]})
        by = {a["id"]: a for a in n["agents"]}
        self.assertEqual(by["least_sure"]["new"]["mean_gain"], env["test_protocol_2"]["agents"]["least_sure"]["mean_gain"])
        self.assertEqual(by["learned"]["new"]["mean_gain"], env["test_protocol_2"]["agents"]["linear"]["mean_gain"])
        self.assertEqual(by["learned"]["old"]["mean_gain"], env["test"]["agents"]["learned"]["mean_gain"])
        self.assertEqual(by["oracle"]["new"]["share_of_oracle_gain"], 1.0)
        # the sentence follows from the numbers
        said = n["holds_in_both"]
        beats = env["test_protocol_2"]["learned_minus_least_sure"]["p05"] > 0 or env["test"]["learned_minus_least_sure"]["p05"] > 0
        self.assertEqual("the learned policy does not beat least sure" in said, not beats)
        gains = all(by["least_sure"][s]["mean_gain"] > by["random"][s]["mean_gain"] for s in ("new", "old"))
        self.assertEqual("least sure gains more than random" in said, gains)

    def test_audit_lines_and_limits_take_their_figures_from_the_record(self) -> None:
        d = self.doc
        self.assertEqual([f["id"] for f in d["audit_findings"]], ["H-1", "H-2", "H-3", "H-4", "H-5"])
        for f in d["audit_findings"]:
            self.assertTrue(f["found"] and f["answer"])
            test_file = f["guarded_by"].split("::")[0]
            self.assertTrue((_REPO_ROOT / test_file).is_file(), test_file)
            self.assertIn(f["found"], d["audit"])
        h5 = self.record["rows_of_the_test_year_in_test_boxes_outside_exclusion_dates"]["by_region"]
        self.assertTrue(d["audit_findings"][4]["found"].startswith(f"{sum(h5.values())} rows of 2021"))
        for n in h5.values():
            self.assertIn(f"{n} in ", d["audit_findings"][4]["found"])
        cost = self.record["schedule_cost_on_training_episodes"]["by_schedule"]
        d_csi = cost["hidden_pass_times"]["scores"]["reconstruction"]["csi_strict_375m"] - cost["nominal"]["scores"]["reconstruction"]["csi_strict_375m"]
        self.assertIn(f"about {d_csi:.3f} of strict CSI", d["limits"][0])
        self.assertIn(f"{d['validation']['episodes']} episodes", " ".join(d["limits"]))
        weakest = min(d["test_fires"]["fires"], key=lambda f: f["new"]["ahead_of_both_on"])
        self.assertIn(weakest["name"], " ".join(d["limits"]))
        self.assertIn(f"on {weakest['new']['ahead_of_both_on']} scores of 7", " ".join(d["limits"]))

    def test_no_forbidden_dash_and_sources_are_named(self) -> None:
        text = json.dumps(self.doc, ensure_ascii=False)
        for bad in (chr(0x2014), chr(0x2013), chr(0xB7)):      # em dash, en dash, middle dot
            self.assertNotIn(bad, text)
        for path in self.doc["sources"]["tracked_files"]:
            self.assertTrue((_REPO_ROOT / path).is_file(), path)
        self.assertTrue(self.doc["additions"])


if __name__ == "__main__":
    unittest.main()
