"""A rehearsal of the live test on passes already past, in a folder of its own. Nothing it makes is a seal.

The fires of the live test's latest cohort are followed again in the rehearsal folder from a time already past. The
sealer runs with its clock set back, one cycle every five minutes of that stretch, then the scorer runs with the real
clock, twice, as the runner would. Every request is real: the MODIS rows, the CMR lists of passes, and the near real
time VIIRS rows the scorer fetches once a pass is listed.

A rehearsal seal is not a seal: its MODIS reply was fetched after the time it is sealed at (rows acquired before that
time but published after it are seen), and its digest was written after its pass. It shows that the path from a
sealed record to a score runs on real replies, so the first real score does not fail with nobody watching. The live
folder is only read (its latest cohort), never written, and its lock is not taken.

  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.live.rehearse \\
      --env-file <.env holding FIRMS_MAP_KEY> --live-dir <live folder, read only> --dir <rehearsal folder> \\
      --from 2026-11-14T02:30:00Z --to 2026-11-14T06:30:00Z
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
from pathlib import Path
import sys

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.archive import redact_key  # noqa: E402
from backend.firms.area_api import _key  # noqa: E402
from backend.live import answer  # noqa: E402
from backend.live import protocol as PR  # noqa: E402
from backend.live.fetch import AreaFetcher, CmrFetcher, ModisOnly, iso, now_s  # noqa: E402
from backend.live.ledger import Ledger, Lock, Witness, read_chain  # noqa: E402
from backend.live.run import _log_to  # noqa: E402
from backend.live.scorer import Scorer  # noqa: E402
from backend.live.sealer import Sealer  # noqa: E402
from backend.model import fitted  # noqa: E402


def _s(utc: str) -> float:
    return _dt.datetime.strptime(utc, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=_dt.timezone.utc).timestamp()


def follow_again(live_dir: Path, rehearsal: Path, from_s: float) -> dict:
    """The live test's latest cohort, written into the rehearsal folder as followed from `from_s`."""
    cohorts = Ledger(rehearsal / "cohorts.jsonl", "cohort")
    if cohorts.entries:
        return cohorts.entries[-1]
    live = [line["cohort"] for line in read_chain(live_dir / "cohorts.jsonl", "cohort")]
    if not live:
        raise RuntimeError("the live folder holds no cohort")
    c = live[-1]
    rec = {"index": 0, "chosen_s": from_s, "chosen_utc": iso(from_s), "protocol_sha256": PR.digest(PR.document()),
           "reply": c["reply"], "rows_counted": c["rows_counted"], "candidates": c["candidates"], "fires": c["fires"],
           "rehearsal_of": {"live_cohort": c["index"], "chosen_utc": c["chosen_utc"]}}
    cohorts.append(rec)
    return rec


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Rehearse the live test on passes already past, in a folder of its own.")
    ap.add_argument("--env-file", type=Path, required=True, help=".env holding FIRMS_MAP_KEY (read, never printed)")
    ap.add_argument("--live-dir", type=Path, required=True, help="the live folder, read only: its latest cohort")
    ap.add_argument("--dir", type=Path, required=True, help="the rehearsal folder")
    ap.add_argument("--from", dest="t_from", required=True, help="UTC start of the stretch sealed, e.g. 2026-11-14T02:30:00Z")
    ap.add_argument("--to", dest="t_to", required=True, help="UTC end of the stretch sealed")
    args = ap.parse_args(argv)
    live, here = args.live_dir.resolve(), args.dir.resolve()
    if here == live or live in here.parents or here in live.parents:
        raise SystemExit("the rehearsal folder must not be the live folder, inside it or around it")
    t0, t1 = _s(args.t_from), _s(args.t_to)
    if not (0 < t1 - t0 < PR.COHORT_EVERY_S) or t1 > now_s() - PR.CONFIRM_FROM_S:
        raise SystemExit("the stretch must be shorter than a day and end at least two hours ago")
    here.mkdir(parents=True, exist_ok=True)
    plain = _log_to(here / "run.log")
    key = _key(args.env_file)

    def log(msg: str) -> None:
        plain(redact_key(msg, key))

    log("FIRMS_MAP_KEY set")
    with Lock(here / "sealer.lock"):
        area = AreaFetcher(key, here / "cache", log=log)
        cmr = CmrFetcher(here / "cache", log=log)
        cohort = follow_again(live, here, t0)
        log(f"rehearsal: {len(cohort['fires'])} fires of live cohort {cohort['rehearsal_of']['live_cohort']}, "
            f"followed from {cohort['chosen_utc']}")
        clock = [t0]
        sealer = Sealer(here, ModisOnly(area), cmr, Witness(here / "SEALS-rehearsal.md"), fitted.load_params(),
                        fitted.load_ratio_fit(), clock=lambda: clock[0], log=log)
        while clock[0] < t1:
            out = sealer.cycle()
            if out["sealed"] or out["missed"]:
                log(f"rehearsal cycle at {iso(clock[0])}: {out['sealed']} sealed, {out['missed']} missed")
            clock[0] += PR.CYCLE_S
        log(f"rehearsal: {len(sealer.seals.entries)} sealed, {len(sealer.missed.entries)} missed; scoring with the real clock")
        scorer = Scorer(here, area, cmr, clock=now_s, log=log)
        first = scorer.cycle()
        again = scorer.cycle()
        log(f"rehearsal: scorer decided {first} in its first cycle and {again} in its second")
        page = answer.build(here)
        answer.write(here)
    finals = {f["seal_sha256"]: f for f in scorer.scores.entries}
    for s in page["seals"]:
        f = finals.get(s["sha256"], {})
        line = {"key": f"{s['fire_id']}|{s['platform']}|{s['times']['predicted_pass_utc']}", "state": s["state"],
                "reason": s["reason"], "real_pass_utc": s["times"]["real_pass_utc"],
                "minutes_from_predicted": (f.get("real_pass") or {}).get("minutes_from_predicted"),
                "hidden_pixels_in_box": (s["scores"] or {}).get("hidden_pixels_in_box"),
                "ahead_of_both_on": (s["scores"] or {}).get("ahead_of_both_on"), "judged": (s["scores"] or {}).get("judged"),
                "error": (scorer.state.get(s["sha256"]) or {}).get("error")}
        print(json.dumps(line, sort_keys=True))
    print(json.dumps({"counts": page["counts"], "running_count": page["running_count"]}, sort_keys=True, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
