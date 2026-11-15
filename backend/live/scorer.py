"""The scoring cycle: once a sealed pass has happened and its rows are published, score the sealed predictions.

The scorer is `backend.eval.blind_test.blind_test_sealed`, unchanged. The three methods it is handed answer with the
predictions read back from the sealed arrays file, each checked against its sealed digests; the slot is the sealed
one with the real pass's span put in to match rows; a score is kept only when the report's `published` entries are
the sealed ones exactly. Every seal ends scored or marked with the reason it could not be; nothing is dropped.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Callable

import numpy as np

from backend.eval import schedule as S
from backend.eval.blind_test import Prediction, blind_test_sealed, bootstrap_verdict, pool_reports, verdict
from backend.eval.holdout import Sealed
from backend.eval.rows import Detections, detections_from_rows
from backend.firms.archive import DEDUP_FIELDS, _write_atomic
from backend.live import passes as PS
from backend.live import protocol as PR
from backend.live import seal as SL
from backend.live.fetch import AreaFetcher, CmrFetcher, csv_rows, iso
from backend.live.ledger import Ledger

HIDDEN_SOURCE: str = "NASA FIRMS near real time rows (VIIRS NOAA-20 and NOAA-21 NRT), read after the seal"


class _Stored:
    """A method that answers with what was sealed for each slot, by the slot's place in the schedule given."""

    def __init__(self, name: str, label: str, preds: dict[int, Prediction]) -> None:
        self.name = name
        self.label = label
        self._preds = preds

    def predict(self, target: S.Slot) -> Prediction:
        return self._preds[target.index]


def _stored_factory(name: str, label: str, preds: dict[int, Prediction]):
    def factory(_visible: Detections, _grid: Any) -> _Stored:
        return _Stored(name, label, preds)
    return factory


class NotReproduced(RuntimeError):
    pass


def clean(obj: Any) -> Any:
    """Plain JSON values: numpy numbers as Python numbers, a number that is not finite as null."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        v = float(obj)
        return v if np.isfinite(v) else None
    return obj


def sealed_predictions(live_dir: Path, seal: dict[str, Any]) -> dict[str, Prediction]:
    """The sealed predictions read back, each checked against the digests in the seal."""
    raw = (Path(live_dir) / "arrays" / seal["arrays"]["file"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != seal["arrays"]["sha256"]:
        raise NotReproduced("the arrays file does not match its sealed digest")
    preds = SL.read_predictions(raw, (seal["grid"]["ny"], seal["grid"]["nx"]),
                                {m: seal["methods"][m]["scalars"] for m in PR.METHODS})
    slot = PS.slot_from_dict(seal["slot"])
    again = SL.published(slot, preds)
    for m in PR.METHODS:
        if again[m] != seal["methods"][m]["published"]:
            raise NotReproduced(f"{m}: the prediction read back differs from the sealed one")
    return preds


def _rows_of(text: str, platform: str, span: tuple[float, float]) -> list[dict[str, str]]:
    """The rows of one pass in a reply: its platform, inside its span give or take the minute FIRMS rounds to."""
    out = []
    for r in csv_rows(text):
        if str(r.get("instrument", "")).strip().upper() != "VIIRS":
            raise ValueError("a VIIRS reply held a row of another instrument")
        out.append(r)
    det = detections_from_rows(out, HIDDEN_SOURCE) if out else None
    if det is None:
        return []
    keep = S.rows_of_slot(det.time_s, det.platform_code, S.Slot(0, platform, span[0], True, 0.375, 0.375, span_s=span, source=S.SOURCE_CMR))
    return [out[int(i)] for i in keep]


def _dedup(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    seen, out = set(), []
    for r in rows:
        k = tuple(str(r[f]) for f in DEDUP_FIELDS)
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def _report(seals: list[dict[str, Any]], finals: list[dict[str, Any]], live_dir: Path, cache_dir: Path,
            visible: Detections) -> dict[str, Any]:
    """One blind-test report over the sealed looks given (one fire), from their sealed predictions and their rows."""
    box = tuple(seals[0]["fire"]["box"])
    preds: dict[str, dict[int, Prediction]] = {m: {} for m in PR.METHODS}
    slots, hidden = [], []
    for i, (seal, fin) in enumerate(zip(seals, finals)):
        p = sealed_predictions(live_dir, seal)
        for m in PR.METHODS:
            preds[m][i] = p[m]
        span = (float(fin["real_pass"]["span_s"][0]), float(fin["real_pass"]["span_s"][1]))
        slots.append(PS.slot_from_dict(seal["slot"], span_s=span).reindexed(i))
        text = (Path(cache_dir) / fin["rows"]["path"]).read_text(encoding="utf-8")
        hidden += _rows_of(text, seal["slot"]["platform"], span)
    det = detections_from_rows(_dedup(hidden), HIDDEN_SOURCE)
    labels = {m: seals[0]["methods"][m]["label"] for m in PR.METHODS}
    factories = [_stored_factory(m, labels[m], preds[m]) for m in PR.METHODS]
    lo = min(s.span_s[0] for s in slots) - 3600.0
    hi = max(s.span_s[1] for s in slots) + 3600.0
    platforms = sorted({s.platform for s in slots})
    report = blind_test_sealed(visible, Sealed(det, "VIIRS", None), box, factories, window=(lo, hi),
                               given=(slots, S.SOURCE_CMR, {"platforms": platforms}))
    for i, seal in enumerate(seals):
        for m in PR.METHODS:
            if report["published"][m][i] != {**seal["methods"][m]["published"], "slot": i}:
                raise NotReproduced(f"{m}: the scorer's published entry differs from the sealed one")
    return report


def _look(report: dict[str, Any]) -> dict[str, Any]:
    v = verdict(report)
    t = report["targets"][0] if report["targets"] else {}
    return {
        "hidden_pixels_in_box": t.get("hidden_pixels_in_test_box"), "hidden_frp_mw": t.get("hidden_frp_mw"),
        "hidden_pixels_in_context_box": t.get("hidden_pixels_in_context_box"),
        "scores": v.get("scores"), "ahead_of_both_on": v.get("beats_every_baseline_on"), "judged": v.get("scores_judged"),
        "counted_by": v.get("counted_by"),
    }


class Scorer:
    def __init__(self, live_dir: Path, area: AreaFetcher, cmr: CmrFetcher, clock: Callable[[], float],
                 log: Callable[[str], None] = print) -> None:
        self.dir = Path(live_dir)
        self.area = area
        self.cmr = cmr
        self.clock = clock
        self.log = log
        self.scores = Ledger(self.dir / "scores.jsonl", "score")
        self.state: dict[str, Any] = {}

    def finals(self) -> dict[str, dict[str, Any]]:
        return {e["seal_sha256"]: e for e in self.scores.entries}

    def cycle(self) -> int:
        seals = Ledger(self.dir / "seals.jsonl", "seal").entries
        done = self.finals()
        new = 0
        now = self.clock()
        for seal in seals:
            if seal["sha256"] in done:
                continue
            try:
                out = self._step(seal, now)
            except Exception as exc:  # noqa: BLE001  tried again next cycle
                self.state[seal["sha256"]] = {**self.state.get(seal["sha256"], {}), "error": f"{type(exc).__name__}: {exc}"[:300]}
                self.log(f"{seal['key']}: not scored this cycle: {type(exc).__name__}: {exc}")
                continue
            if out is not None:
                self.scores.append(clean(out))
                self.state.pop(seal["sha256"], None)
                new += 1
                self.log(f"{seal['key']}: {out['state']}" + (f" ({out['reason']})" if out.get("reason") else
                         f", estimate ahead of both on {out['look']['ahead_of_both_on']} of {out['look']['judged']}"))
        if new or not (self.dir / "summary.json").is_file():
            self.write_summary(seals)
        self.write_state(now)
        return new

    def _final(self, seal: dict[str, Any], state: str, now: float, **kw: Any) -> dict[str, Any]:
        return {"seal_sha256": seal["sha256"], "key": seal["key"], "state": state, "decided_utc": iso(now), **kw}

    def _step(self, seal: dict[str, Any], now: float) -> dict[str, Any] | None:
        sh = seal["sha256"]
        slot = seal["slot"]
        span = slot["span_s"]
        box = tuple(seal["fire"]["box"])
        if now < span[0]:
            self.state[sh] = {"state": "sealed"}
            return None
        if now < span[1] + PR.CONFIRM_FROM_S:
            self.state[sh] = {"state": "waiting_for_the_pass"}
            return None
        real = PS.real_pass(self.cmr, box, slot["platform"], float(slot["time_s"]), reuse_within_s=PR.CONFIRM_EVERY_S)
        if real is None:
            if now > float(slot["time_s"]) + PR.CONFIRM_GIVE_UP_S:
                return self._final(seal, "not_scored", now, reason="no pass of the platform over the box was listed within "
                                   f"{int(PR.CONFIRM_TOLERANCE_S // 60)} minutes of the predicted one")
            self.state[sh] = {"state": "waiting_for_the_pass"}
            return None
        rs, re = PS._t(real["time_start"]), PS._t(real["time_end"])
        rp = {"time_start": real["time_start"], "time_end": real["time_end"], "span_s": [rs, re],
              "time_at_box_utc": iso(real["time_at_box_s_or_mid"]), "box_share": real["box_share"],
              "granules": real["granules"], "minutes_from_predicted": round((real["time_at_box_s_or_mid"] - float(slot["time_s"])) / 60.0, 2)}
        if real["box_share"] < 1.0:
            return self._final(seal, "not_scored", now, real_pass=rp,
                               reason=f"the real swath held {real['box_share']:.0%} of the box, not all of it")
        if rs <= float(seal["sealed_s"]):
            return self._final(seal, "not_scored", now, real_pass=rp, reason="the real pass began before the seal")
        if now < re + PR.ROWS_AFTER_S:
            self.state[sh] = {"state": "waiting_for_the_rows", "real_pass": rp}
            return None
        d0, d1 = iso(rs)[:10], iso(re)[:10]
        days = 1 if d0 == d1 else 2
        try:
            reply = self.area.fetch(PR.VIIRS_SOURCES[slot["platform"]], tuple(seal["fire"]["context_box"]), days, d0)
        except Exception as exc:  # noqa: BLE001
            if now > re + PR.ROWS_GIVE_UP_S:
                return self._final(seal, "not_scored", now, real_pass=rp, reason=f"rows not obtained: {type(exc).__name__}")
            raise
        rows_meta = {k: v for k, v in reply.items() if k != "text"}
        modis_text = (self.area.cache_dir / seal["modis"]["reply"]["path"]).read_text(encoding="utf-8")
        visible, info = SL.visible_rows([modis_text], tuple(seal["fire"]["context_box"]), float(seal["sealed_s"]))
        if info["rows_sha256"] != seal["modis"]["visible"]["rows_sha256"]:
            raise NotReproduced("the visible rows read again differ from the sealed ones")
        fin = {"real_pass": rp, "rows": rows_meta}
        try:
            report = _report([seal], [fin], self.dir, self.area.cache_dir, visible)
        except NotReproduced as exc:
            return self._final(seal, "not_scored", now, real_pass=rp, rows=rows_meta, reason=f"not reproduced: {exc}")
        versions: dict[str, int] = {}
        for r in _rows_of(reply["text"], slot["platform"], (rs, re)):
            versions[r.get("version", "")] = versions.get(r.get("version", ""), 0) + 1
        return self._final(seal, "scored", now, real_pass=rp, rows=rows_meta, row_versions_of_the_pass=versions,
                           look=_look(report), report=report)

    # -- what the page reads -----------------------------------------------------------------------------------

    def write_state(self, now: float) -> None:
        body = {"written_utc": iso(now), "seals": self.state}
        _write_atomic(self.dir / "state.json", json.dumps(body, sort_keys=True, indent=1).encode("utf-8"))

    def write_summary(self, seals: list[dict[str, Any]]) -> None:
        by_sha = {s["sha256"]: s for s in seals}
        fires: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = {}
        for f in self.scores.entries:
            if f["state"] == "scored":
                s = by_sha[f["seal_sha256"]]
                fires.setdefault(s["fire"]["id"], []).append((s, f))
        empty = detections_from_rows([], SL.ROW_SOURCE)
        per_fire, reports = [], []
        for fid in sorted(fires):
            pairs = sorted(fires[fid], key=lambda x: x[0]["slot"]["time_s"])
            try:
                rep = _report([p[0] for p in pairs], [p[1] for p in pairs], self.dir, self.area.cache_dir, empty)
            except Exception as exc:  # noqa: BLE001
                self.log(f"{fid}: pooled report failed: {type(exc).__name__}: {exc}")
                continue
            reports.append(rep)
            v = verdict(rep)
            per_fire.append({"fire_id": fid, "looks": rep["scored_overpasses"],
                             "looks_with_hidden_pixels": rep["scored_overpasses_with_hidden_detections_in_test_box"],
                             "hidden_pixels": rep["hidden_rows_in_test_box"], "ahead_of_both_on": v.get("beats_every_baseline_on"),
                             "judged": v.get("scores_judged"), "counted_by": v.get("counted_by"), "scores": v.get("scores")})
        out: dict[str, Any] = {"fires_scored": len(reports), "looks_scored": int(sum(r["scored_overpasses"] for r in reports)),
                               "per_fire": per_fire, "pooled": None, "over_fires": None, "rows_note": PR.NOTE_NRT}
        if reports:
            pv = verdict(pool_reports(reports))
            out["pooled"] = {"ahead_of_both_on": pv.get("beats_every_baseline_on"), "judged": pv.get("scores_judged"),
                             "counted_by": pv.get("counted_by"), "scores": pv.get("scores"), "interval": pv.get("interval")}
        if len(reports) >= 2:
            bv = bootstrap_verdict(reports)
            out["over_fires"] = {"classes": bv.get("classes"), "counted_by": bv.get("classes_counted_by"),
                                 "bootstrap": bv.get("bootstrap"),
                                 "scores": {k: {"class": r.get("class"), "improvement_interval": r.get("improvement_interval")}
                                            for k, r in (bv.get("scores") or {}).items()}}
        _write_atomic(self.dir / "summary.json", json.dumps(clean(out), sort_keys=True, indent=1).encode("utf-8"))
