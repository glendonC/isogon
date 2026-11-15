"""The sealing cycle: choose fires, predict the coming passes, seal each one before it happens.

`Sealer` holds a `ModisOnly` fetcher and nothing else that reaches FIRMS, so no code here can ask for a VIIRS row.
It reads CMR granule metadata of passes one repeat cycle earlier (times and swath polygons, no detection).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from backend.eval.baselines import OverlapRatioFit
from backend.live import choose as CH
from backend.live import passes as PS
from backend.live import protocol as PR
from backend.live import seal as SL
from backend.live.fetch import CmrFetcher, ModisOnly, SharpRowsRefused, csv_rows, iso
from backend.live.ledger import Ledger, Witness
from backend.model.occupancy import OccupancyParams


def pass_key(fire_id: str, platform: str, predicted_s: float) -> str:
    return f"{fire_id}|{platform}|{iso(predicted_s)}"


class Sealer:
    def __init__(self, live_dir: Path, modis: ModisOnly, cmr: CmrFetcher, witness: Witness, params: OccupancyParams,
                 ratio_fit: OverlapRatioFit, clock: Callable[[], float], log: Callable[[str], None] = print,
                 fitted_ok: Callable[[], bool] = PR.fitted_unchanged, code: dict[str, Any] | None = None) -> None:
        self.dir = Path(live_dir)
        self.modis = modis
        self.cmr = cmr
        self.witness = witness
        self.params = params
        self.ratio_fit = ratio_fit
        self.clock = clock
        self.log = log
        self.fitted_ok = fitted_ok
        self.code = code if code is not None else PR.code_commit()
        self.seals = Ledger(self.dir / "seals.jsonl", "seal")
        self.cohorts = Ledger(self.dir / "cohorts.jsonl", "cohort")
        self.missed = Ledger(self.dir / "missed.jsonl", "missed")
        self.protocol_sha = self._protocol()
        self._reconcile()

    # -- once ---------------------------------------------------------------------------------------------------

    def _protocol(self) -> str:
        path = self.dir / "protocol.json"
        doc = PR.document()
        sha = PR.digest(doc)
        if path.is_file():
            held = json.loads(path.read_text(encoding="ascii"))
            if PR.digest(held["protocol"]) != held["sha256"] or held["sha256"] != sha:
                raise RuntimeError("protocol.json differs from the protocol of this code: the test does not change while it runs")
            return sha
        if self.seals.entries:
            raise RuntimeError("seals exist but protocol.json does not")
        text = json.dumps({"protocol": doc, "sha256": sha, "written_utc": iso(self.clock()), "code": self.code},
                          indent=1, sort_keys=True, ensure_ascii=True)
        path.write_text(text + "\n", encoding="ascii")
        self.witness.protocol(sha, iso(self.clock()))
        return sha

    def _reconcile(self) -> None:
        known = self.witness.known()
        for e in self.seals.entries:
            if e["sha256"] not in known:
                self.witness.seal(e, e["sha256"], note="written here when the sealer started again")

    # -- state --------------------------------------------------------------------------------------------------

    def fires(self) -> list[dict[str, Any]]:
        return [{**f, "cohort_chosen_s": c["chosen_s"]} for c in self.cohorts.entries for f in c["fires"]]

    def done_keys(self) -> set[str]:
        return {e["key"] for e in self.seals.entries} | {e["key"] for e in self.missed.entries}

    # -- one cycle ----------------------------------------------------------------------------------------------

    def cycle(self) -> dict[str, int]:
        now = self.clock()
        if not self.fitted_ok():
            self.log("the fitted values differ from the frozen digests: nothing is sealed")
            return {"sealed": 0, "missed": 0}
        self._maybe_choose(now)
        sealed = missed = 0
        done = self.done_keys()
        for fire in self.fires():
            box = tuple(fire["box"])
            t0 = fire["cohort_chosen_s"] + PR.SEAL_DEADLINE_S
            try:
                coming = PS.coming(self.cmr, box, t0 - 3600.0, now + PR.SEAL_OPENS_S + 3600.0)
            except SharpRowsRefused:
                raise
            except Exception as exc:  # noqa: BLE001  the pass list could not be read: tried again next cycle
                self.log(f"{fire['id']}: passes not read: {type(exc).__name__}: {exc}")
                continue
            for p in coming:
                key = pass_key(fire["id"], p["platform"], p["predicted_time_s"])
                if key in done:
                    continue
                slot = p["slot"]
                start = p["predicted_time_s"] if slot is None else slot.span_s[0]
                if start < t0:
                    continue  # before this fire was followed
                if slot is None:
                    if start <= now + PR.SEAL_OPENS_S:
                        self._miss(key, fire, p, "the predicted swath holds only part of the box: not a slot", now)
                        missed += 1
                    continue
                if start - now > PR.SEAL_OPENS_S:
                    continue
                if start - now < PR.SEAL_DEADLINE_S:
                    self._miss(key, fire, p, "the deadline passed before a cycle could seal it", now)
                    missed += 1
                    continue
                try:
                    ok = self._seal(key, fire, p)
                except SharpRowsRefused:
                    raise
                except Exception as exc:  # noqa: BLE001  nothing was appended; tried again next cycle until the deadline
                    self.log(f"{key}: not sealed this cycle: {type(exc).__name__}: {exc}")
                    continue
                sealed += int(ok)
                missed += int(not ok)
                done.add(key)
        return {"sealed": sealed, "missed": missed}

    def _maybe_choose(self, now: float) -> None:
        last = self.cohorts.entries[-1] if self.cohorts.entries else None
        if last is not None and now < last["chosen_s"] + PR.COHORT_EVERY_S:
            return
        k = 0 if last is None else last["index"] + 1
        reply = self.modis.fetch(PR.CHOOSE_SOURCE, "world", PR.CHOOSE_DAYS, None, reuse_within_s=600.0)
        rows = csv_rows(reply["text"])
        cands, counted = CH.candidates(rows, now)
        followed = [f["box"] for f in self.fires()]
        taken = CH.choose(cands, followed)
        fires = []
        for rank, c in enumerate(taken, 1):
            fires.append({"id": f"c{k}f{rank:02d}", "cohort": k, "rank": rank, "part": c["part"], "box": c["box"],
                          "context_box": list(SL.context_box(c["box"])), "centre": c["centre"],
                          "modis_rows_48h": c["modis_rows"], "lattice_cell": c["lattice_cell"]})
        reply_meta = {k2: v for k2, v in reply.items() if k2 != "text"}
        self.cohorts.append({"index": k, "chosen_s": now, "chosen_utc": iso(now), "protocol_sha256": self.protocol_sha,
                             "reply": reply_meta, "rows_counted": counted, "candidates": len(cands), "fires": fires})
        self.log(f"cohort {k}: {len(fires)} fires from {len(cands)} candidates ({counted} MODIS rows counted)")

    def _miss(self, key: str, fire: dict[str, Any], p: dict[str, Any], reason: str, now: float) -> None:
        self.missed.append({"key": key, "fire_id": fire["id"], "platform": p["platform"],
                            "predicted_time_utc": iso(p["predicted_time_s"]), "reason": reason, "noted_utc": iso(now),
                            "template": p["template"]})

    def _seal(self, key: str, fire: dict[str, Any], p: dict[str, Any]) -> bool:
        slot = p["slot"]
        box = tuple(fire["box"])
        ctx = tuple(fire["context_box"])
        t = self.clock()
        day0 = iso(t - 2 * 86400.0)[:10]
        reply = self.modis.fetch(PR.MODIS_SOURCE, ctx, PR.MODIS_DAYS, day0, reuse_within_s=PR.MODIS_REFETCH_S)
        visible, vis_info = SL.visible_rows([reply["text"]], ctx, t)
        grid, preds, labels = SL.predict(visible, box, slot, self.params, self.ratio_fit)
        arrays = SL.write_arrays(self.dir / "arrays", SL.arrays_bytes(preds))
        pub = SL.published(slot, preds)
        sealed_s = self.clock()
        if sealed_s > slot.span_s[0] - PR.SEAL_DEADLINE_S:
            self._miss(key, fire, p, "the prediction was ready after the deadline", sealed_s)
            return False
        rec = {
            "key": key,
            "protocol_sha256": self.protocol_sha,
            "code": self.code,
            "fitted_values": dict(PR.FITTED_DIGESTS),
            "fire": {k: fire[k] for k in ("id", "cohort", "rank", "part", "box", "context_box", "centre")},
            "slot": PS.slot_dict(slot),
            "predicted_from": {"repeat_days": p["repeat_days"], **p["template"]},
            "modis": {"reply": {k: v for k, v in reply.items() if k != "text"}, "visible": vis_info},
            "grid": {"nx": grid.nx, "ny": grid.ny, "cell_km": grid.cell_km, "box": list(box)},
            "methods": {name: {"label": labels[name], "published": pub[name], "scalars": SL.scalars(preds[name])}
                        for name in PR.METHODS},
            "arrays": arrays,
            "rows_note": PR.NOTE_NRT,
            "sealed_s": sealed_s,
            "sealed_utc": iso(sealed_s),
        }
        sha = self.seals.append(rec)
        self.witness.seal(rec, sha)
        r = pub["reconstruction"]
        self.log(f"sealed {key} {sha[:12]}: estimate {r['predicted_cells']} cells, {r['predicted_frp_mw']} MW; "
                 f"{vis_info['rows']} MODIS rows, newest {vis_info['latest_row_utc']}")
        return True
