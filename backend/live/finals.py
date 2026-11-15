"""Which line of scores.jsonl stands for each seal, and which lines were withdrawn.

A seal's final line is the last line written for it, unless a later line withdraws it. A withdrawal is a line of its
own: the digest of the line it withdraws and the reason. The withdrawn line stays in the log and in the answer, and
the seal is scored again. The one reason a score is withdrawn is that it was decided on a reply retrieved before the
pass's rows were due: such a reply was held from an earlier pass of the same fire and day, and need not hold the
later pass at all.
"""

from __future__ import annotations

import datetime as _dt
from typing import Any

WITHDRAWN: str = "withdrawn"


def _s(utc: str) -> float:
    return _dt.datetime.strptime(utc, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=_dt.timezone.utc).timestamp()


def _utc(s: float) -> str:
    return _dt.datetime.fromtimestamp(s, _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def current(entries: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Each seal's standing final line, by the seal's digest. Lines are given in log order, each with its `sha256`."""
    out: dict[str, dict[str, Any]] = {}
    for e in entries:
        sh = e["seal_sha256"]
        if e["state"] == WITHDRAWN:
            if sh in out and out[sh]["sha256"] == e.get("withdraws_sha256"):
                del out[sh]
            continue
        out[sh] = e
    return out


def withdrawals(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every withdrawal with the line it withdrew, in log order."""
    by = {e["sha256"]: e for e in entries}
    return [{"withdrawal": e, "withdrawn": by.get(e.get("withdraws_sha256"))} for e in entries if e["state"] == WITHDRAWN]


def early_rows(entry: dict[str, Any], rows_after_s: float) -> str | None:
    """Why a final line was decided on a reply retrieved before its pass's rows were due, or None when it was not."""
    rows, rp = entry.get("rows"), entry.get("real_pass")
    if not rows or not rp or not rows.get("retrieved_utc"):
        return None
    due = float(rp["span_s"][1]) + rows_after_s
    if _s(rows["retrieved_utc"]) >= due:
        return None
    return (f"decided on a reply retrieved at {rows['retrieved_utc']}, before this pass's rows were due at {_utc(due)}: "
            "the reply was held from an earlier pass of the same day and need not hold this pass; scored again on a "
            "reply retrieved after")
