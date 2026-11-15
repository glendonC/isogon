"""The page's answer: every seal with its state, times, digest and scores, and the running count against the baselines.

Built from the live folder's logs alone (protocol.json, cohorts.jsonl, seals.jsonl, missed.jsonl, scores.jsonl, with
state.json and summary.json written by the runner). `GET /api/live` of `backend/server_live.py` serves it and the
runner writes the same answer to live.json for a page that runs with no backend.
"""

from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Any

from backend.live import protocol as PR
from backend.live.fetch import iso
from backend.live.ledger import read_chain

STATES: dict[str, str] = {
    "sealed": "sealed; the pass has not begun",
    "waiting_for_the_pass": "the pass is due or has happened; NASA has not listed it yet",
    "waiting_for_the_rows": "the pass is listed; its rows are not yet complete",
    "scored": "scored against the rows of the pass",
    "not_scored": "could not be scored; the reason is given",
}


def _entries(path: Path, kind: str) -> list[dict[str, Any]]:
    return [{**e[kind], "sha256": e["sha256"]} for e in read_chain(path, kind)]


def _read(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


# A stretch longer than this between two cycles is a stop of the sealer, not a quiet stretch.
STOP_AFTER_S: float = 2 * PR.CYCLE_S + 60.0
HOW_TO_DRAW_A_STOP: str = (
    "a stop is a stretch when the sealer was not running: draw it as such; no seal in it says nothing about fire"
)


def _s(utc: str) -> float:
    import datetime as _dt

    return _dt.datetime.fromisoformat(utc.replace("Z", "+00:00")).timestamp()


def runner(live: Path, now: float, missed: list[dict[str, Any]]) -> dict[str, Any]:
    """When the sealer ran, from its own line per cycle, and every stop with the passes whose seal window it held."""
    cyc = _entries(live / "cycles.jsonl", "cycle")
    beats = [e for e in cyc if e["kind"] == "cycle"]
    starts = [e for e in cyc if e["kind"] == "start"]
    stops = []
    for a, b in zip(beats, beats[1:]):
        if b["s"] - a["s"] > STOP_AFTER_S:
            back = next((st for st in starts if a["s"] < st["s"] <= b["s"]), b)
            stops.append({"from_utc": a["utc"], "to_utc": back["utc"], "minutes": round((back["s"] - a["s"]) / 60.0, 1)})
    running = bool(beats) and now - beats[-1]["s"] <= STOP_AFTER_S
    if beats and not running:
        stops.append({"from_utc": beats[-1]["utc"], "to_utc": None, "minutes": round((now - beats[-1]["s"]) / 60.0, 1)})
    for st in stops:
        lo, hi = _s(st["from_utc"]), now if st["to_utc"] is None else _s(st["to_utc"])
        st["passes_not_sealed"] = [
            {k: m[k] for k in ("fire_id", "platform", "predicted_time_utc", "reason")} for m in missed
            if m.get("seal_window_utc") and _s(m["seal_window_utc"][0]) < hi and _s(m["seal_window_utc"][1]) > lo
        ]
    first = beats[0]["s"] if beats else None
    earlier = []
    log = live / "run.log"
    if log.is_file():
        for line in log.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.endswith("FIRMS_MAP_KEY set") and (first is None or _s(line[:20]) < first):
                earlier.append(line[:20])
    return {
        "running_now": running,
        "last_cycle_utc": beats[-1]["utc"] if beats else None,
        "cycles_recorded_from_utc": beats[0]["utc"] if beats else None,
        "cycle_s": PR.CYCLE_S,
        "stop_after_s": STOP_AFTER_S,
        "starts_utc": [st["utc"] for st in starts],
        "stops": stops,
        "before_cycles_were_recorded": {
            "starts_utc": earlier,
            "note": (
                "before cycles_recorded_from_utc no cycle was written down: the runner's starts are known from its log, "
                "not when it stopped, so whether it ran between them is not on record; draw that stretch as not recorded"
            ),
        },
        "how_to_draw": HOW_TO_DRAW_A_STOP,
    }


def _pred(seal: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for m in PR.METHODS:
        p = seal["methods"][m]["published"]
        out[m] = {"cells": p["predicted_cells"], "frp_mw": p["predicted_frp_mw"], "frp_interval_mw": p["interval_mw"],
                  "pixels": p["predicted_pixels"], "pixel_interval": p["pixel_interval"], "fields_sha256": p["fields_sha256"]}
    return out


def build(live_dir: Path, now: float | None = None) -> dict[str, Any]:
    live = Path(live_dir)
    now = time.time() if now is None else now
    proto = _read(live / "protocol.json")
    seals = _entries(live / "seals.jsonl", "seal")
    finals = {f["seal_sha256"]: f for f in _entries(live / "scores.jsonl", "score")}
    missed = _entries(live / "missed.jsonl", "missed")
    cohorts = _entries(live / "cohorts.jsonl", "cohort")
    state = (_read(live / "state.json") or {}).get("seals", {})
    summary = _read(live / "summary.json")
    rows = []
    counts = {k: 0 for k in STATES}
    for s in seals:
        f = finals.get(s["sha256"])
        if f is not None:
            st = f["state"]
        else:
            st = (state.get(s["sha256"]) or {}).get("state")
            if st is None:
                st = "sealed" if now < s["slot"]["span_s"][0] else "waiting_for_the_pass"
        counts[st] += 1
        real = (f or {}).get("real_pass") or (state.get(s["sha256"]) or {}).get("real_pass")
        look = (f or {}).get("look")
        rows.append({
            "sha256": s["sha256"],
            "fire_id": s["fire"]["id"],
            "part": s["fire"]["part"],
            "box": s["fire"]["box"],
            "platform": s["slot"]["platform"],
            "state": st,
            "reason": (f or {}).get("reason"),
            "times": {
                "sealed_utc": s["sealed_utc"],
                "predicted_pass_utc": s["slot"]["time_utc"],
                "predicted_span_utc": s["slot"]["span_utc"],
                "real_pass_utc": None if real is None else real.get("time_at_box_utc"),
                "minutes_sealed_before_the_pass": round((s["slot"]["span_s"][0] - s["sealed_s"]) / 60.0, 1),
                "rows_retrieved_utc": ((f or {}).get("rows") or {}).get("retrieved_utc"),
                "decided_utc": (f or {}).get("decided_utc"),
            },
            "modis_rows_seen": s["modis"]["visible"]["rows"],
            "newest_modis_row_utc": s["modis"]["visible"]["latest_row_utc"],
            "predicted": _pred(s),
            "scores": None if look is None else {
                "hidden_pixels_in_box": look["hidden_pixels_in_box"], "hidden_frp_mw": look["hidden_frp_mw"],
                "ahead_of_both_on": look["ahead_of_both_on"], "judged": look["judged"], "counted_by": look["counted_by"],
                "by_score": look["scores"],
            },
        })
    fires = [{**{k: f[k] for k in ("id", "cohort", "rank", "part", "box", "centre", "modis_rows_48h")},
              "chosen_utc": c["chosen_utc"]} for c in cohorts for f in c["fires"]]
    return {
        "what": "predictions of the sharp satellites' passes, sealed before each pass from MODIS rows alone, then scored",
        "rows_note": PR.NOTE_NRT,
        "written_utc": iso(now),
        "protocol": None if proto is None else {"sha256": proto["sha256"], "written_utc": proto["written_utc"],
                                                "version": proto["protocol"]["version"], "name": proto["protocol"]["name"],
                                                "fitted_values": proto["protocol"]["fitted_values"]["files"]},
        "states": STATES,
        "counts": {"seals": len(seals), **counts, "passes_not_sealed": len(missed)},
        "fires": fires,
        "seals": rows,
        "not_sealed": [{**{k: m[k] for k in ("fire_id", "platform", "predicted_time_utc", "reason", "noted_utc")},
                        "seal_window_utc": m.get("seal_window_utc")} for m in missed],
        "runner": runner(live, now, missed),
        "running_count": None if summary is None else {
            "fires_scored": summary["fires_scored"], "looks_scored": summary["looks_scored"],
            "over_fires": summary["over_fires"], "pooled": summary["pooled"], "per_fire": summary["per_fire"],
            "how_judged": (
                "over the fires: fires resampled whole 2000 times, a score ahead when the 90 percent interval of its "
                "improvement over each baseline lies above zero, behind when below zero against either, tied otherwise; "
                "pooled and per fire: strictly better than both baselines, no allowance for noise (docs/method.md)"
            ),
        },
    }


def write(live_dir: Path, out: Path | None = None) -> Path:
    from backend.firms.archive import _write_atomic

    dest = Path(out) if out is not None else Path(live_dir) / "live.json"
    _write_atomic(dest, json.dumps(build(live_dir), sort_keys=True, indent=1).encode("utf-8"))
    return dest
