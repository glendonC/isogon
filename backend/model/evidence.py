"""The evidence sheet's data: one JSON-ready dict (contract item 13, surface S2).

  evidence()                                 the dict a route serves at GET /api/evidence
  python3 -m backend.model.evidence          prints it
  python3 -m backend.model.evidence record <notes folder>
                                             rebuilds the tracked record of every time the test fires were scored

Nothing in the dict is typed by hand. Every number is read from a tracked file or computed here from one:

  fitted_values/test_fire_looks.json   every scoring of the three 2021 test fires, copied by `build_record` from the
                                       reports the runs wrote, with each report's sha256
  fitted_values/occupancy_params.json  the validation that decides what is switched on, and the decision before it
  backend/env/fitted/next_look.json    the environment's reference table under both protocols

The sentences are written here; where one states a figure, the figure is filled in from those files, and a test
checks that it is.

Shape. The page lane's demo file (`website/src/content/demo/evidence.ts`, `EvidenceDoc`) is the requested shape and
this follows it key for key. What is added to it is listed in `evidence()["additions"]`.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from typing import Any

from backend.eval.blind_test import verdict

FITTED_DIR: Path = Path(__file__).resolve().parent / "fitted_values"
LOOKS_FILE: str = "test_fire_looks.json"
PARAMS_FILE: str = "occupancy_params.json"
ENV_FILE: Path = Path(__file__).resolve().parents[1] / "env" / "fitted" / "next_look.json"

METHODS: tuple[str, ...] = ("reconstruction", "painted_modis", "overlap_ratio")
BASELINES: tuple[str, ...] = ("painted_modis", "overlap_ratio")
# (id on the sheet, label, which way is better, the verdict's key for the same score)
SCORES: tuple[tuple[str, str, str, str], ...] = (
    ("csi_strict_375m", "CSI strict 375 m", "higher", "csi_strict_375m"),
    ("csi_one_cell_tolerance", "CSI within one cell", "higher", "csi_one_cell_tolerance"),
    ("hit_rate_at_equal_area", "Hit rate at equal area", "higher", "hit_rate_at_equal_area"),
    ("brier", "Brier", "lower", "brier"),
    ("pixel_ratio_of_sums", "Pixel count, predicted / hidden", "nearest_one", "pixel_count_error_of_sums"),
    ("frp_ratio_of_sums", "FRP, predicted / hidden", "nearest_one", "frp_error_of_sums"),
    ("frp_median_abs_relative_error", "FRP median relative error", "lower", "frp_median_abs_relative_error"),
)
SCORE_LABEL: dict[str, str] = {vkey: label for _, label, _, vkey in SCORES}
# A lead over both baselines smaller than this is said to be a tie in effect.
REMARK_MARGIN: float = 0.001

REGIONS: tuple[str, ...] = ("plumas_ca", "lytton_bc", "evia_greece")
FIRE_NAMES: dict[str, str] = {"plumas_ca": "Dixie", "lytton_bc": "Lytton Creek", "evia_greece": "northern Evia"}

# The two looks at the test fires that count as the test, and every other time rows of those fires were scored.
# `files` are paths inside the lane's notes folder, with {region} filled in; `key` picks the report out of a payload.
LOOKS: tuple[dict[str, Any], ...] = (
    {"look": 1, "unit": "M2", "protocol_version": 1,
     "what": "fitted values on windows of 24 overpasses that counted the hidden ones; each prediction made at the hidden overpass's own time and pixel size",
     "files": "M2-evidence/blind_{region}_fitted.json"},
    {"look": 2, "unit": "M8", "protocol_version": 2,
     "what": "the same fitted values, not refitted, on windows of 12 MODIS overpasses chosen with VIIRS dropped; predictions published on a nominal schedule before the hidden rows are opened",
     "files": "M8-evidence/test_fire_{region}.json"},
)
OTHER_SCORINGS: tuple[dict[str, Any], ...] = (
    {"unit": "M1a", "protocol_version": 1, "what": "untuned priors on the windows of look 1, before anything was fitted",
     "files": "M1a-evidence/blind_{region}.json"},
    {"unit": "M1b", "protocol_version": 1, "what": "Dixie with one VIIRS platform hidden and the other left visible (an easier test)",
     "files": {"plumas_ca hiding NOAA-20": "M1a-evidence/blind_plumas_ca_hide_VIIRS_NOAA20.json",
               "plumas_ca hiding Suomi NPP": "M1a-evidence/blind_plumas_ca_hide_VIIRS_SNPP.json"}},
    {"unit": "M4", "protocol_version": 1, "what": "the other direction: MODIS hidden and Terra's morning pass estimated from VIIRS, each fire over its whole period",
     "files": "M4-evidence/terra_test_fires.json", "key": "{region}", "baselines": ("painted_viirs", "viirs_ratio")},
    {"unit": "M6", "protocol_version": 1, "what": "a run with VIIRS hidden from each region's default start date",
     "files": {"plumas_ca": "M6-evidence/blind_plumas_ca_2021-07-22.json", "lytton_bc": "M6-evidence/blind_lytton_bc_2021-06-30.json",
               "evia_greece": "M6-evidence/blind_evia_greece_2021-08-03.json"}},
    {"unit": "M6", "protocol_version": 1, "what": "the same from the start the window rule would have picked instead (reported, not adopted)",
     "files": {"lytton_bc": "M6-evidence/blind_lytton_bc_2021-07-01.json", "evia_greece": "M6-evidence/blind_evia_greece_2021-08-07.json"}},
    {"unit": "M8", "protocol_version": 2, "what": "a run with VIIRS hidden from each default start, 24 MODIS frames",
     "files": {"plumas_ca": "M8-evidence/payload_plumas_ca_2021-07-20_holdout_viirs.json", "lytton_bc": "M8-evidence/payload_lytton_bc_2021-06-30_holdout_viirs.json",
               "evia_greece": "M8-evidence/payload_evia_greece_2021-08-03_holdout_viirs.json"}, "key": "blind_test"},
    {"unit": "M8b", "protocol_version": 2, "what": "the same with scheduled looks of the hidden platforms among the frames (a commit that was not landed)",
     "files": {"plumas_ca": "M8b-evidence/payload_plumas_ca_2021-07-22_holdout_viirs.json", "lytton_bc": "M8b-evidence/payload_lytton_bc_2021-06-30_holdout_viirs.json",
               "evia_greece": "M8b-evidence/payload_evia_greece_2021-08-03_holdout_viirs.json"}, "key": "blind_test"},
)
SCHEDULE_COST_FILE: str = "M8-evidence/schedule_cost_training.json"

AGENTS: tuple[tuple[str, str, str, str, str], ...] = (
    # id on the sheet, label, what it does, key under protocol 2, key under protocol 1
    ("random", "Random", "a tile at random, the mean over the seeds", "random", "random"),
    ("latest_modis", "Latest MODIS", "the tile with the most recent MODIS fire power", "latest_modis", "latest_modis"),
    ("least_sure", "Least sure", "the tile where the model is least sure", "least_sure", "least_sure"),
    ("learned", "Learned (M7)", "a linear policy with the weights of unit M7, not refitted", "linear", "learned"),
    ("oracle", "Oracle", "sees the hidden data and takes the best tile at each look: a greedy ceiling", "oracle", "oracle"),
)

# What the outside audit (JOB-H) found, one line each, the change that answers it and the test that guards it.
# Figures inside the lines are filled in from the tracked record.
AUDIT: tuple[dict[str, str], ...] = (
    {"id": "H-1",
     "found": "A run's window was the next 24 overpasses counting the hidden ones, and each prediction was made at the hidden overpass's own time and pixel size, so the hidden rows moved the window, the estimate, the belief frames and the exports.",
     "answer": "Rows part ways once, before anything is chosen (backend/eval/holdout.py). Predictions are published on a schedule that reads no hidden row, and only then is the sealed box opened.",
     "guarded_by": "backend/tests/test_model_hidden_rows.py::RunIgnoresHiddenRowsTests"},
    {"id": "H-2",
     "found": "The second baseline's pixel ratio in validation came from a calendar that still held the three test fires.",
     "answer": "The ratio leaves out the run's year and every year that holds a test fire (backend/model/calendar_ratio.py).",
     "guarded_by": "backend/tests/test_model_real_run.py::CalendarRatioAndProvenanceTests"},
    {"id": "H-3",
     "found": "Windows, start dates and episodes were chosen counting hidden overpasses, so removing the hidden instrument moved them.",
     "answer": "They are chosen after the hidden instrument's rows are dropped.",
     "guarded_by": "backend/tests/test_model_hidden_rows.py::WindowChoiceIgnoresHiddenRowsTests"},
    {"id": "H-4",
     "found": "In the next-look environment the decisions were the hidden overpasses themselves and a pixel size was taken over the whole hidden pass, so rows an agent had not been shown changed what it saw and how many turns it had.",
     "answer": "The looks are scheduled slots; a look hands over that slot's rows in one tile and only those rows are read.",
     "guarded_by": "backend/tests/test_env_hidden_rows.py::ObservationIgnoresUnrevealedRowsTests"},
    {"id": "H-5",
     "found": "{h5_total} rows of 2021 inside the test boxes ({h5_each}) lay outside the fires' own dates and stayed in the baseline's training rows.",
     "answer": "Each test box is closed for the whole of its test year (backend/model/training.py).",
     "guarded_by": "backend/tests/test_eval_holdout.py::PublishedBeforeScoredTests::test_training_rows_never_hold_a_row_of_a_test_box_in_the_test_year"},
)


def _read(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _commit() -> str | None:
    """The commit of the code answering, when it runs from a git checkout."""
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=Path(__file__).resolve().parent,
                             capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None if out.returncode == 0 else None


# ----------------------------------------------------------------------------------------------------------------
# One blind-test report as the sheet shows it
# ----------------------------------------------------------------------------------------------------------------

def _score_values(m: dict[str, Any]) -> dict[str, float | None]:
    return {
        "csi_strict_375m": m["strict_375m"]["csi"],
        "csi_one_cell_tolerance": m["tolerant_1_cell"]["csi"],
        "hit_rate_at_equal_area": (m.get("equal_area") or {}).get("hit_rate"),
        "brier": m["brier"],
        "pixel_ratio_of_sums": (m.get("pixel_count") or {}).get("ratio_of_sums"),
        "frp_ratio_of_sums": m["frp_total"]["ratio_of_sums"],
        "frp_median_abs_relative_error": m["frp_total"]["median_abs_relative_error"],
    }


def _count(interval: dict[str, Any] | None) -> dict[str, int] | None:
    if not interval or interval.get("coverage") is None:
        return None
    return {"held": int(interval["covered"]), "of": int(interval["n"])}


def _lead(value: float, others: list[float], better: str) -> float:
    """By how much `value` is ahead of the best of `others` (negative when it is not ahead)."""
    if better == "higher":
        return value - max(others)
    if better == "lower":
        return min(others) - value
    return min(abs(o - 1.0) for o in others) - abs(value - 1.0)


def fire_test(report: dict[str, Any], protocol_version: int, baselines: tuple[str, ...] = BASELINES) -> dict[str, Any]:
    """One fire under one protocol, in the sheet's shape, computed from a blind-test report."""
    v = verdict(report, baselines=baselines)
    methods = ("reconstruction",) + tuple(baselines)
    scores = {m: _score_values(report["methods"][m]) for m in methods}
    remarks: dict[str, str] = {}
    for sid, _, better, vkey in SCORES:
        row = v["scores"].get(vkey) or {}
        mine, others = scores["reconstruction"][sid], [scores[b][sid] for b in baselines]
        if row.get("beats_every_baseline") and mine is not None and all(o is not None for o in others):
            lead = _lead(float(mine), [float(o) for o in others], better)
            if lead < REMARK_MARGIN:
                remarks[sid] = f"by {lead:.4f}, in effect a tie"
    win = report.get("window_choice") or {}
    span = report.get("window_utc") or report.get("period_utc") or [None, None]
    out: dict[str, Any] = {
        "protocol_version": protocol_version,
        "first_overpass_utc": win.get("first_overpass_utc") or span[0],
        "last_overpass_utc": win.get("last_overpass_utc") or span[1],
        "scored_overpasses": int(report["scored_overpasses"]),
        "hidden_pixels": int(report["hidden_rows_in_test_box"]),
        "scores": scores,
        "frp_interval": {m: _count(report["methods"][m].get("interval")) for m in methods},
        "pixel_interval": {m: _count((report["methods"][m].get("pixel_count") or {}).get("interval")) for m in methods},
        "ahead_of_both_on": int(v["beats_every_baseline_on"]),
        "scores_judged": int(v["scores_judged"]),
        "ahead_on": [sid for sid, _, _, vkey in SCORES if (v["scores"].get(vkey) or {}).get("beats_every_baseline")],
    }
    if remarks:
        out["remarks"] = remarks
    return out


# ----------------------------------------------------------------------------------------------------------------
# The tracked record
# ----------------------------------------------------------------------------------------------------------------

def _h5_rows() -> dict[str, int]:
    """Rows of the test year inside each test box that lie outside the fire's own exclusion dates: the rows the
    first exclusion rule left in the training rows. Recomputed from the cached FIRMS rows."""
    from backend.eval.rows import detections_from_rows
    from backend.firms import read_firms, region_box
    from backend.model.training import EXCLUSIONS, _day_s
    from backend.terrain.live_region import PRESET_BY_ID

    out: dict[str, int] = {}
    for region in REGIONS:
        b = PRESET_BY_ID[region].bbox
        first, after, _ = EXCLUSIONS[region]
        year = int(first[:4])
        det = detections_from_rows(read_firms(region_box(region), f"{year}-01-01", f"{year + 1}-01-01"), "firms")
        in_dates = (det.time_s >= _day_s(first)) & (det.time_s < _day_s(after))
        out[region] = int((det.in_box((b.west, b.south, b.east, b.north)) & ~in_dates).sum())
    return out


def build_record(notes_dir: Path | str) -> dict[str, Any]:
    """Read the reports the runs wrote into the lane's notes folder and write `fitted_values/test_fire_looks.json`.

    The record keeps what the sheet needs of each report and the report's sha256, so the tracked file can be
    checked against the evidence it was copied from. Nothing is run on the test fires here.
    """
    notes = Path(notes_dir)
    sources: dict[str, str] = {}

    def load(rel: str, key: str | None = None) -> dict[str, Any]:
        path = notes / rel
        sources[rel] = _sha256(path)
        doc = _read(path)
        return doc[key] if key else doc

    def files_of(entry: dict[str, Any]) -> dict[str, tuple[str, str | None]]:
        files, key = entry["files"], entry.get("key")
        if isinstance(files, dict):
            return {name: (rel, key) for name, rel in files.items()}
        return {r: (files.format(region=r), key.format(region=r) if key else None) for r in REGIONS}

    looks = []
    for entry in LOOKS:
        fires = {name: {**fire_test(load(rel, key), entry["protocol_version"]), "report": rel}
                 for name, (rel, key) in files_of(entry).items()}
        looks.append({k: entry[k] for k in ("look", "unit", "protocol_version", "what")} | {"fires": fires})
    others = []
    for entry in OTHER_SCORINGS:
        baselines = tuple(entry.get("baselines", BASELINES))
        fires = {}
        for name, (rel, key) in files_of(entry).items():
            t = fire_test(load(rel, key), entry["protocol_version"], baselines)
            fires[name] = {
                "first_overpass_utc": t["first_overpass_utc"], "last_overpass_utc": t["last_overpass_utc"],
                "scored_overpasses": t["scored_overpasses"], "hidden_pixels": t["hidden_pixels"],
                "ahead_of_both_on": t["ahead_of_both_on"], "scores_judged": t["scores_judged"],
                "frp_interval": t["frp_interval"]["reconstruction"], "report": rel,
            }
        others.append({"unit": entry["unit"], "protocol_version": entry["protocol_version"], "what": entry["what"],
                       "baselines": list(baselines), "fires": fires})
    cost = load(SCHEDULE_COST_FILE)
    schedule_cost = {
        name: {
            "scored_overpasses": int(block["scored_overpasses"]),
            "ahead_of_both_on": int(block["verdict"]["beats_every_baseline_on"]),
            "scores": {m: _score_values(block["methods"][m]) for m in METHODS},
        }
        for name, block in cost.items()
    }
    doc = {
        "what": "every time rows of the three 2021 test fires were scored, copied from the reports the runs wrote",
        "built_by": "python3 -m backend.model.evidence record <the lane's notes folder>",
        "built_utc": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "looks": looks,
        "other_scorings": others,
        "schedule_cost_on_training_episodes": {
            "what": "the tracked parameters on the training episodes, scored on the nominal schedule and on a diagnostic schedule that reads each prediction's time and platform from the hidden overpass (not blind); what a list of real pass times is worth",
            "report": SCHEDULE_COST_FILE,
            "by_schedule": schedule_cost,
        },
        "rows_of_the_test_year_in_test_boxes_outside_exclusion_dates": {
            "what": "rows the first exclusion rule left available to training (audit finding H-5), recounted from the cached FIRMS rows",
            "by_region": _h5_rows(),
        },
        "sources_sha256": dict(sorted(sources.items())),
    }
    (FITTED_DIR / LOOKS_FILE).write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    return doc


# ----------------------------------------------------------------------------------------------------------------
# The sheet
# ----------------------------------------------------------------------------------------------------------------

_CLASS = {"ahead": "ahead", "tie": "tied", "behind": "behind"}


def _validation(params: dict[str, Any]) -> dict[str, Any]:
    fit = params["evidence"]["validation_fitted"]
    v, methods = fit["verdict"], fit["methods"]
    episodes = params["evidence"]["validation_episodes"]
    protocol = params.get("protocol") or {}
    refitted = protocol.get("parameters_fitted_under") == protocol.get("validated_under")
    iv = methods["reconstruction"]["interval"]
    parts = []
    for name, part in params["parts"].items():
        parts.append({
            "name": name,
            "status": part["status"],
            "scores": [{"label": SCORE_LABEL[k], "class": _CLASS[row["class"]],
                        "improvement_interval": row.get("improvement_interval")} for k, row in part["scores"].items()],
            **({"interval_holds": part["interval_holds"]} if "interval_holds" in part else {}),
        })
    prev = params.get("previous_decision")
    return {
        "protocol_version": protocol.get("validated_under"),
        "episodes": len(episodes),
        "years": sorted({int(e["year"]) for e in episodes}),
        "regions": sorted({e["region_id"] for e in episodes}),
        "scored_overpasses": int(methods["_scored_overpasses"]),
        "classes": {_CLASS[k]: int(n) for k, n in v["classes"].items()},
        "fitted_values": {
            "status": "in use" if params["adopted"] else "not used",
            "note": ("Fitted and validated under the same protocol" if refitted
                     else f"Fitted under protocol version {protocol.get('parameters_fitted_under')}, not refitted"),
        },
        "decision": params["decision"],
        "rule": params["rule"],
        "parts": parts,
        "frp_interval": {"held": int(iv["covered"]), "of": int(iv["n"]), "stated": iv["stated_level"]},
        "before": None if not prev else {
            "what": prev.get("protocol"),
            "classes": None if not prev.get("classes") else {_CLASS[k]: int(n) for k, n in prev["classes"].items()},
            "fitted_values": "in use" if prev.get("adopted") else "not used",
            "parts": prev.get("parts"),
        },
    }


def _agent_row(block: dict[str, Any], key: str) -> dict[str, float]:
    a = block["agents"][key]
    return {"mean_final": a.get("mean_final", a.get("mean_final_score")), "mean_gain": a["mean_gain"],
            "share_of_oracle_gain": a["share_of_oracle_gain"]}


def _beats(interval: dict[str, Any] | None) -> bool | None:
    return None if not interval else bool(interval["p05"] > 0)


def _next_look(env: dict[str, Any]) -> dict[str, Any]:
    old, new = env["test"], env["test_protocol_2"]
    tiles = int(str(env["setting"]["tiles"]).split("x")[0])
    agents = [{"id": aid, "label": label, "does": does, "new": _agent_row(new, k_new), "old": _agent_row(old, k_old)}
              for aid, label, does, k_new, k_old in AGENTS]
    gain = {side: {a["id"]: a[side]["mean_gain"] for a in agents} for side in ("new", "old")}
    said = []
    if all(gain[s]["least_sure"] > gain[s]["random"] for s in gain):
        sure = _beats(new.get("least_sure_minus_random"))
        said.append("least sure gains more than random" + (", by more than the noise where the difference was resampled" if sure else ""))
    if not _beats(new["learned_minus_least_sure"]) and not _beats(old["learned_minus_least_sure"]):
        said.append("the learned policy does not beat least sure")
    if all(gain[s]["oracle"] == max(gain[s].values()) for s in gain):
        said.append("the oracle is the ceiling")
    return {
        "tiles_per_side": tiles,
        "looks": int(env["setting"]["budget"]),
        "score": str(env["setting"]["score"]).upper(),
        "reward": "gain in the score on the detections still hidden after the look",
        "test_episodes": {"new": int(new["episodes"]), "old": int(old["episodes"])},
        "mean_start_score": {"new": new["mean_start_score"], "old": old["mean_start_score"]},
        "agents": agents,
        "differences": {
            "new": {k: new[k] for k in ("learned_minus_least_sure", "oracle_minus_learned", "least_sure_minus_random") if k in new},
            "old": {k: old[k] for k in ("learned_minus_least_sure", "oracle_minus_learned") if k in old},
        },
        "holds_in_both": ("In both tests " + ", ".join(said[:-1]) + (" and " if len(said) > 1 else "") + said[-1] + ".") if said else "",
        "not_the_same_game_twice": new["note"],
        "other_settings": new.get("other_settings"),
    }


def _limits(record: dict[str, Any], params: dict[str, Any], fires: list[dict[str, Any]]) -> list[str]:
    from backend.env import KNOWN_LIMITS
    from backend.eval import schedule as S

    out: list[str] = []
    cost = record["schedule_cost_on_training_episodes"]["by_schedule"]
    nominal, real = cost[S.SOURCE_NOMINAL], cost[S.SOURCE_HIDDEN_TIMES]
    d_csi = real["scores"]["reconstruction"]["csi_strict_375m"] - nominal["scores"]["reconstruction"]["csi_strict_375m"]
    d_ahead = real["ahead_of_both_on"] - nominal["ahead_of_both_on"]
    out.append(
        "Pass times come from a nominal schedule. A prediction can be about 100 minutes from the pass it is scored "
        f"against and assumes a typical pixel; on training fires this costs about {d_csi:.3f} of strict CSI and "
        f"{d_ahead} of the seven scores."
    )
    protocol = params.get("protocol") or {}
    if protocol.get("parameters_fitted_under") != protocol.get("validated_under"):
        out.append(
            f"The fitted values were chosen under protocol version {protocol.get('parameters_fitted_under')} and have "
            "not been refitted. A clean refit with its own validation is the next step."
        )
    val = _validation(params)
    missing = [FIRE_NAMES[r] + "'s region" for r in REGIONS if r not in val["regions"]]
    pixel = next((p for p in val["parts"] if "pixels" in p["name"]), None)
    narrow = ""
    if pixel is not None:
        lows = [min(lo for lo, _ in s["improvement_interval"].values()) for s in pixel["scores"] if s.get("improvement_interval")]
        if lows:
            narrow = f" The pixel count verdict rests on an improvement whose lower end is {min(lows):.3f}."
    out.append(
        f"Validation rests on {val['episodes']} episodes of {' and '.join(str(y) for y in val['years'])} from "
        f"{len(val['regions'])} of the three regions" + (f" ({', '.join(missing)} has none)" if missing else "") + "." + narrow
    )
    weakest = min(fires, key=lambda f: f["new"]["ahead_of_both_on"])
    remark = (weakest["new"].get("remarks") or {}).get("csi_strict_375m")
    out.append(
        f"{weakest['name']} is the weakest of the three: ahead of both baselines on {weakest['new']['ahead_of_both_on']} "
        f"scores of {weakest['new']['scores_judged']}" + (f", and on strict CSI only {remark}" if remark else "") + "."
    )
    out.append(KNOWN_LIMITS.split(". ")[0] + ".")       # its first sentence; the schedule is the first limit above
    return out


def evidence() -> dict[str, Any]:
    """The evidence sheet as one JSON-ready dict. Reads three tracked files; runs nothing."""
    record = _read(FITTED_DIR / LOOKS_FILE)
    params = _read(FITTED_DIR / PARAMS_FILE)
    env = _read(ENV_FILE)
    from backend.model.real_run import _test_fire_note
    from backend.model.training import EXCLUSIONS, _day_s

    by_look = {entry["look"]: entry for entry in record["looks"]}
    old_look, new_look = by_look[min(by_look)], by_look[max(by_look)]
    fires = []
    for region in REGIONS:
        fires.append({
            "region_id": region,
            "name": FIRE_NAMES[region],
            "new": new_look["fires"][region],
            "old": old_look["fires"][region],
            "looks": [{"look": e["look"], "unit": e["unit"], **e["fires"][region]} for e in record["looks"]],
        })
    first, after, _ = EXCLUSIONS["plumas_ca"]
    note = _test_fire_note("plumas_ca", _day_s(first), _day_s(after))
    h5 = record["rows_of_the_test_year_in_test_boxes_outside_exclusion_dates"]["by_region"]
    fill = {"h5_total": sum(h5.values()), "h5_each": ", ".join(f"{h5[r]} in {FIRE_NAMES[r]}'s" for r in REGIONS)}
    findings = [{**f, "found": f["found"].format(**fill)} for f in AUDIT]
    protocol = params.get("protocol") or {}
    refitted = protocol.get("parameters_fitted_under") == protocol.get("validated_under")
    return {
        "commit": _commit(),
        "unit": new_look["unit"],
        "test_fires": {
            "hidden": "VIIRS",
            "interval_level": params["evidence"]["validation_fitted"]["methods"]["reconstruction"]["interval"]["stated_level"],
            "note": "a protocol correction, not a fresh test" if note and "a protocol correction, not a fresh test" in note["note"] else "",
            "scores": [{"id": sid, "label": label, "better": better} for sid, label, better, _ in SCORES],
            "fires": fires,
            "looks": [{k: e[k] for k in ("look", "unit", "protocol_version", "what")} for e in record["looks"]],
            "also_scored": record["other_scorings"],
            "also_scored_note": (
                "every other time rows of the three test fires were scored. None of these is the test; they are "
                "listed so that the count of looks hides nothing. The environment's test episodes are windows of "
                "the same fires and are under next_look."
            ),
        },
        "audit": " ".join(f["found"] for f in findings) + " None of this carried the hidden fire's position or power "
                 "into the estimate, but each path let the hidden instrument shape the test. The lane's own leak tests "
                 "missed it: they changed hidden values and never deleted a row. The corrected protocol seals the "
                 "hidden rows away until scoring." + ("" if refitted else " Nothing was refitted."),
        "audit_findings": findings,
        "validation": _validation(params),
        "next_look": _next_look(env),
        "limits": _limits(record, params, fires),
        "additions": [
            "test_fires.fires[].looks, test_fires.looks, test_fires.also_scored: every look and every other scoring",
            "each fire test: pixel_interval, scores_judged, ahead_on",
            "audit_findings: the audit's findings one line each, with the answer and the guarding test",
            "validation: regions, decision, rule, before, and improvement_interval and interval_holds inside parts",
            "next_look: reward, differences, not_the_same_game_twice, other_settings",
            "sources",
        ],
        "sources": {
            "tracked_files": ["backend/model/fitted_values/" + LOOKS_FILE, "backend/model/fitted_values/" + PARAMS_FILE,
                              "backend/env/fitted/next_look.json"],
            "reports_sha256": record["sources_sha256"],
            "record_built_utc": record["built_utc"],
        },
    }


def main(argv: list[str]) -> int:
    if len(argv) > 2 and argv[1] == "record":
        doc = build_record(argv[2])
        print(f"wrote {FITTED_DIR / LOOKS_FILE}: {len(doc['looks'])} looks, {len(doc['other_scorings'])} other scorings, "
              f"{len(doc['sources_sha256'])} reports")
        return 0
    print(json.dumps(evidence(), indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
