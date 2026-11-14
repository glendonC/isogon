"""The evidence sheet's dict (backend/model/evidence.py): its shape, and that no figure in it is typed by hand.

Every assertion compares the dict with the tracked files it is read from, or recomputes a figure from them. The
shape is the type the page reads it as (`website/src/content/demo/evidence.ts`, `EvidenceDoc`).
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
            self.assertEqual((fire["old"]["protocol_version"], fire["new"]["protocol_version"]), (1, 3))
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
        self.assertEqual([(e["look"], e["unit"], e["protocol_version"]) for e in tf["looks"]], [(1, "first fit", 1), (2, "sealed protocol", 2), (3, "final look", 3)])
        self.assertIn("final look", tf["note"])
        self.assertIn("not scored again", tf["note"])
        for fire in tf["fires"]:
            self.assertEqual([e["look"] for e in fire["looks"]], [1, 2, 3])
            # the final look scores every pass: it says how many flagged nothing and what was left out
            for key in ("looks_that_flagged_nothing_in_the_box", "passes_that_held_part_of_the_box_not_scored", "hidden_rows_of_those_passes"):
                self.assertIn(key, fire["new"])
                self.assertNotIn(key, fire["old"])
            self.assertEqual(fire["looks"][0]["ahead_of_both_on"], fire["old"]["ahead_of_both_on"])
            self.assertEqual(fire["looks"][-1]["scores"], fire["new"]["scores"])
        units = [(o["unit"], o["protocol_version"]) for o in tf["also_scored"]]
        for unit in (("first reconstruction", 1), ("one platform hidden", 1), ("Terra morning estimate", 1),
                     ("other windows", 1), ("sealed protocol", 2), ("sealed protocol with scheduled frames", 2)):
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
            # the answer is the record, with the kind of each count said beside it and nothing else added
            def recorded(t: dict) -> dict:
                self.assertEqual(t["counted_by"], "plain comparison")
                return {k: v for k, v in t.items() if k != "counted_by"}

            self.assertEqual(recorded(fire["old"]), by_look[1]["fires"][r])
            self.assertEqual(recorded(fire["new"]), by_look[max(by_look)]["fires"][r])       # the final look
            self.assertEqual([recorded({k: v for k, v in e.items() if k not in ("look", "unit")}) for e in fire["looks"]],
                             [by_look[k]["fires"][r] for k in sorted(by_look)])
            for t in [by_look[k]["fires"][r] for k in sorted(by_look)]:
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

    def test_the_sheet_says_which_fitted_values_its_test_fire_figures_were_made_with(self) -> None:
        tf, p = self.doc["test_fires"], self.params
        latest = max(self.record["looks"], key=lambda e: e["look"])
        now = tf["values_in_use"]
        fitted_under = p["protocol"]["parameters_fitted_under"]
        self.assertEqual(now["fitted_under_protocol"], fitted_under)
        self.assertEqual(now["scored_on_the_test_fires"], fitted_under <= latest["protocol_version"])
        self.assertEqual(now["figures_shown"], {"look": latest["look"], "unit": latest["unit"], "protocol_version": latest["protocol_version"]})
        if now["scored_on_the_test_fires"]:
            self.assertIn("made with the fitted values now in use", now["note"])
        else:
            # values fitted after the latest look: the sheet must not pass that look's figures off as theirs
            self.assertIn("have not been scored on the three test fires", now["note"])
            self.assertIn(f"look {latest['look']}", now["note"])
            self.assertIn(now["note"], self.doc["limits"][0])
        if latest["look"] == 2:
            self.assertEqual(tf["note"], "a protocol correction, not a fresh test")

    def test_validation_keeps_every_earlier_decision_and_says_how_empty_looks_are_treated(self) -> None:
        v, p = self.doc["validation"], self.params
        earlier = ([p["previous_decision"]] if p.get("previous_decision") else []) + list(p.get("earlier_decisions") or [])
        self.assertEqual([h["what"] for h in v["history"]], [d["protocol"] for d in earlier])
        self.assertEqual(v["before"], v["history"][0] if earlier else None)
        self.assertEqual(v["trained_on"], p["trained_on"])
        if p.get("intervals"):
            prm = p["parameters"]
            self.assertEqual(v["intervals"]["frp_multiples_of_the_prediction"], [prm["frp_interval_lo"], prm["frp_interval_hi"]])
            self.assertEqual(v["intervals"]["pixel_multiples_of_the_prediction"], [prm["pixel_interval_lo"], prm["pixel_interval_hi"]])
            self.assertEqual(v["intervals"]["rule"], p["intervals"]["rule"])
        else:
            self.assertIsNone(v["intervals"])
        if p.get("empty_looks"):
            e = p["empty_looks"]["validation"]
            self.assertEqual(v["empty_looks"]["validation"], e)
            self.assertEqual(e["scored_looks"], v["scored_overpasses"])
            self.assertIn(f"{e['no_hidden_pixel_in_the_box']} of {e['scored_looks']} validation looks", " ".join(self.doc["limits"]))
        else:
            self.assertIsNone(v["empty_looks"])
        made = self.doc["next_look"]["made_with"]
        self.assertEqual(made["reconstruction_values"], self.env["test_protocol_2"].get("reconstruction_values") or self.env["reconstruction_parameters"])
        self.assertEqual(made["policy_trained_with"], self.env["reconstruction_parameters"])
        # the table the sheet shows was measured with the values the tree uses, so the served round and the table agree
        self.assertEqual(made["reconstruction_values"], p["parameters"]["fitted_on"])
        earlier = self.env.get("test_protocol_2_with_the_earlier_values")
        if earlier:
            shown = self.doc["next_look"]["with_the_earlier_values"]
            self.assertEqual(shown["agents"]["oracle"]["mean_gain"], earlier["agents"]["oracle"]["mean_gain"])
            self.assertEqual(shown["reconstruction_values"], self.env["reconstruction_parameters"])
            self.assertNotEqual(shown["reconstruction_values"], made["reconstruction_values"])
        # the table before the environment's bug fix is shown beside the one after it, both from the tracked file
        was = self.env.get("test_protocol_2_before_the_look_rows_correction")
        if was:
            shown = self.doc["next_look"]["before_the_bug_fix"]
            self.assertEqual(shown["agents"]["least_sure"]["mean_gain"], was["agents"]["least_sure"]["mean_gain"])
            self.assertEqual(shown["agents"]["learned"]["mean_gain"], was["agents"]["linear"]["mean_gain"])
            self.assertEqual(shown["what"], self.env["test_protocol_2"]["bug_fix"])
            self.assertEqual(self.env["test_protocol_2"]["episodes"], was["episodes"])

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

    def test_the_tables_on_record_say_which_reward_they_were_measured_under(self) -> None:
        from backend.env.next_look import REWARD

        n, env = self.doc["next_look"], self.env
        m = n["measured_under"]
        self.assertIn("did not add up", m["reward"])
        for key in env["rewards"]["tables_on_record"]:
            self.assertEqual(env[key]["reward"], m["reward"], key)            # every table on record carries the label
            self.assertIn("revealed nothing", env[key]["empty_look"])
        self.assertEqual(m["empty_look"], {"new": env["test_protocol_2"]["empty_look"], "old": env["test"]["empty_look"]})
        self.assertIn("closed", m["not_measured_again"])
        # the reward in use is the environment's own sentence, not a copy that can drift
        self.assertEqual(n["reward_in_use"], REWARD)
        self.assertEqual(env["rewards"]["in_use"], REWARD)
        self.assertIn("add up", REWARD)

    def test_the_reward_in_use_is_shown_on_the_validation_episodes_and_its_sentences_follow_from_its_numbers(self) -> None:
        from backend.env.next_look import REWARD

        v, ref = self.doc["next_look"]["on_validation"], self.env["validation_reference"]
        self.assertEqual(v["reward"], REWARD)
        self.assertEqual((v["episodes"], v["tiles"], v["budget"]), (ref["episodes"]["validation"], ref["tiles"], ref["budget"]))
        # the validation episodes are fires of 2024 and 2025: no test episode and no other 2021 window is among them
        self.assertEqual(len(ref["episodes"]["validation_keys"]), ref["episodes"]["validation"])
        for key in ref["episodes"]["validation_keys"]:
            self.assertIn(key.split(":")[2][:4], ("2024", "2025"), key)
        self.assertGreater(ref["episodes"]["closed_and_not_played"], 0)
        ids = [a["id"] for a in v["agents"]]
        want = ["random", "constant_best_on_training", "constant_best_in_hindsight", "centre", "latest_modis", "least_sure",
                "expected_new", "least_sure_at_night", "least_sure_when_unsure", "least_sure_when_sharp"]
        # the learned player's tile choice is listed apart only when the player also chooses when to look
        want += ["learned_tiles_only"] if self.env["policy"]["when"]["adopted"] else []
        self.assertEqual(ids, want + ["learned", "oracle"])
        self.assertEqual(v["looks"], "cmr")                               # the pass list: the environment's default schedule
        self.assertEqual(v["learned_player"]["chooses_when_to_look"], self.env["policy"]["when"]["adopted"])
        self.assertIn("training fires only", v["learned_player"]["chosen_on"])
        for a in v["agents"]:
            row = ref["agents"][a["id"]]
            self.assertEqual(a["mean_gain"], row["mean_gain"], a["id"])
            # the rewards add up: a mean gain is the mean final score minus the mean starting score
            self.assertAlmostEqual(a["mean_final_score"] - v["mean_start_score"], a["mean_gain"], places=3, msg=a["id"])
            self.assertIsNotNone(a["sd_across_episodes"])
            self.assertEqual(a["tile"] is not None, a["id"].startswith("constant_"))
        by = {a["id"]: a for a in v["agents"]}
        self.assertEqual(by["oracle"]["share_of_oracle_gain"], 1.0)
        # the tile named in hindsight gains at least as much as the one a player could have fielded
        self.assertGreaterEqual(by["constant_best_in_hindsight"]["mean_gain"], by["constant_best_on_training"]["mean_gain"])
        said = " ".join(v["plainly"])
        for key, a, b in (("least_sure_minus_random", "least sure", "random"),
                          ("learned_minus_least_sure", "the learned player", "least sure")):
            d = ref["differences"][key]
            want = ("gains more than" if d["p05"] > 0 else "gains less than" if d["p95"] < 0 else "does not differ from")
            self.assertIn(f"{a} {want} {b}", said)
        self.assertIn("not fires the project has never seen", v["not_a_test"])

    def test_audit_lines_and_limits_take_their_figures_from_the_record(self) -> None:
        d = self.doc
        self.assertEqual([f["id"] for f in d["audit_findings"]], ["1", "2", "3", "4", "5"])
        for f in d["audit_findings"]:
            self.assertTrue(f["found"] and f["answer"])
            test_file = f["guarded_by"].split("::")[0]
            self.assertTrue((_REPO_ROOT / test_file).is_file(), test_file)
            self.assertIn(f["found"], d["audit"])
        outside = self.record["rows_of_the_test_year_in_test_boxes_outside_exclusion_dates"]["by_region"]
        self.assertTrue(d["audit_findings"][4]["found"].startswith(f"{sum(outside.values())} rows of 2021"))
        for n in outside.values():
            self.assertIn(f"{n} in ", d["audit_findings"][4]["found"])
        cost = self.record["schedule_cost_on_training_episodes"]["by_schedule"]
        d_csi = cost["hidden_pass_times"]["scores"]["reconstruction"]["csi_strict_375m"] - cost["nominal"]["scores"]["reconstruction"]["csi_strict_375m"]
        latest = max(self.record["looks"], key=lambda e: e["look"])
        if latest["protocol_version"] <= 2:
            self.assertIn(f"about {d_csi:.3f} of strict CSI", d["limits"][0])      # figures made on the nominal schedule
        else:
            self.assertNotIn("nominal schedule", d["limits"][0])                   # the final look ran on the pass list
            self.assertTrue(d["test_fires"]["values_in_use"]["scored_on_the_test_fires"])
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


class CountKindsTests(unittest.TestCase):
    """A count of scores ahead is one of two kinds, and the answer says which beside every count: a plain
    comparison on one fire, or a judgement with an interval over resampled fires."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.doc = E.evidence()

    def _walk(self, x, path=""):
        if isinstance(x, dict):
            yield path, x
            for k, v in x.items():
                yield from self._walk(v, f"{path}.{k}")
        elif isinstance(x, list):
            for i, v in enumerate(x):
                yield from self._walk(v, f"{path}[{i}]")

    def test_every_count_says_what_kind_it_is(self) -> None:
        from backend.eval.blind_test import COUNT_KINDS, COUNTED_INTERVAL, COUNTED_PLAIN

        plain = interval = 0
        for path, d in self._walk(self.doc):
            if "ahead_of_both_on" in d:
                self.assertEqual(d.get("counted_by"), COUNTED_PLAIN, path)
                plain += 1
            c = d.get("classes")
            if isinstance(c, dict) and {"ahead", "tied", "behind"} <= set(c):
                self.assertEqual(d.get("classes_counted_by"), COUNTED_INTERVAL, path)
                interval += 1
        self.assertGreater(plain, 20)                      # every fire under every look and every other scoring
        self.assertGreater(interval, 0)                    # the validation's classes
        self.assertEqual(self.doc["count_kinds"], COUNT_KINDS)
        self.assertTrue(any(a.startswith("count_kinds") for a in self.doc["additions"]))

    def test_the_sentences_that_state_a_count_say_its_kind(self) -> None:
        weakest = next(s for s in self.doc["limits"] if "weakest" in s)
        self.assertIn("by plain comparison", weakest)
        for s in self.doc["limits"]:
            if "scores are ahead of both" in s:
                self.assertIn("judged with an interval", s)


class PlainNamesTests(unittest.TestCase):
    """The answer, the record and the environment's tracked file name a report or a table by what it is, never by
    the step of the work that made it, and the answer names no commit: a recording of it outlives the checkout."""

    # a letter M and a number as a word or a folder (the way the work's steps were numbered), in any case
    STEP_NAME = re.compile(r"(?<![A-Za-z0-9])[Mm]\d+[a-z]?(?![A-Za-z0-9.])")

    @classmethod
    def setUpClass(cls) -> None:
        cls.doc = E.evidence()
        cls.record_text = (E.FITTED_DIR / E.LOOKS_FILE).read_text(encoding="utf-8")
        cls.env_text = E.ENV_FILE.read_text(encoding="utf-8")
        cls.record = json.loads(cls.record_text)

    def test_nothing_is_named_by_a_step_of_the_work(self) -> None:
        for what, text in (("the answer", json.dumps(self.doc)), ("the record", self.record_text),
                           ("the environment's file", self.env_text),
                           ("the evidence module", Path(E.__file__).read_text(encoding="utf-8"))):
            found = sorted(set(self.STEP_NAME.findall(text)))
            self.assertEqual(found, [], what)
            self.assertNotIn("-evidence/", text, what)

    def test_the_pattern_would_find_a_step_name(self) -> None:
        for text in ("M7-notes/a.json", "a_table_before_m7c", "a_table_m7_values", "m7/x.json"):
            self.assertTrue(self.STEP_NAME.search(text), text)
        for text in ("0.375 km", "VIIRS_NOAA20", "MODIS", "4m2", "protocol_2", "2021-07-22"):
            self.assertIsNone(self.STEP_NAME.search(text), text)

    def test_every_report_is_named_by_what_it_is_and_keeps_its_digest(self) -> None:
        named = self.record["sources_sha256"]
        self.assertEqual(len(named), 27)
        folders = {name.split("/")[0] for name in named}
        self.assertEqual(folders, set(E.REPORT_FOLDERS))
        for folder, what in E.REPORT_FOLDERS.items():
            self.assertTrue(what)
        self.assertEqual(self.doc["sources"]["reports_sha256"], named)
        self.assertIn("not in the repository", self.doc["sources"]["reports_note"])
        self.assertEqual(self.doc["sources"]["report_folders"], E.REPORT_FOLDERS)

    def test_the_answer_names_no_commit(self) -> None:
        self.assertIn("commit", self.doc)                 # the page's type has the key
        self.assertIsNone(self.doc["commit"])

    def test_the_tables_on_record_are_named_by_what_they_are(self) -> None:
        env = json.loads(self.env_text)
        self.assertEqual(env["rewards"]["tables_on_record"],
                         ["test", "test_protocol_2_before_the_look_rows_correction", "test_protocol_2_with_the_earlier_values", "test_protocol_2"])
        for key in env["rewards"]["tables_on_record"]:
            self.assertIn(key, env)
        shown = self.doc["next_look"]
        self.assertEqual(shown["before_the_bug_fix"]["agents"]["least_sure"]["mean_gain"],
                         env["test_protocol_2_before_the_look_rows_correction"]["agents"]["least_sure"]["mean_gain"])
        self.assertEqual(shown["with_the_earlier_values"]["agents"]["oracle"]["mean_gain"],
                         env["test_protocol_2_with_the_earlier_values"]["agents"]["oracle"]["mean_gain"])


if __name__ == "__main__":
    unittest.main()
