"""Run the live test for hours: every cycle seals the passes due, then scores the passes whose rows are published.

  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.live.run \\
      --env-file <folder with the .env holding FIRMS_MAP_KEY>/.env --live-dir <live folder> --witness <SEALS.md>

The key is read the way backend/firms/area_api.py reads it and is never printed. A lock in the live folder keeps one
runner at a time; stopping and starting again seals nothing twice and loses nothing (docs/live.md).
"""

from __future__ import annotations

import argparse
import datetime as _dt
from pathlib import Path
import sys
import time
import traceback

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.archive import redact_key  # noqa: E402
from backend.firms.area_api import _key  # noqa: E402
from backend.live import answer  # noqa: E402
from backend.live import protocol as PR  # noqa: E402
from backend.live.fetch import AreaFetcher, CmrFetcher, ModisOnly, now_s  # noqa: E402
from backend.live.ledger import Lock, Witness  # noqa: E402
from backend.live.sealer import Sealer  # noqa: E402
from backend.model import fitted  # noqa: E402


def _log_to(path: Path):
    def log(msg: str) -> None:
        line = f"{_dt.datetime.now(_dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {msg}"
        print(line, flush=True)
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    return log


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Seal predictions of the sharp satellites before their passes, then score them.")
    ap.add_argument("--env-file", type=Path, required=True, help=".env holding FIRMS_MAP_KEY (read, never printed)")
    ap.add_argument("--live-dir", type=Path, required=True, help="folder of the logs, written only by this program")
    ap.add_argument("--witness", type=Path, default=None, help="Markdown file every digest is also appended to")
    ap.add_argument("--once", action="store_true", help="run one cycle and stop")
    ap.add_argument("--no-score", action="store_true", help="seal only")
    ap.add_argument("--page-json", type=Path, default=None, help="also write the page's answer here each cycle")
    args = ap.parse_args(argv)
    live = args.live_dir.resolve()
    live.mkdir(parents=True, exist_ok=True)
    plain = _log_to(live / "run.log")
    key = _key(args.env_file)

    def log(msg: str) -> None:  # every line passes through the redaction, whatever it holds
        plain(redact_key(msg, key))

    log("FIRMS_MAP_KEY set")
    with Lock(live / "sealer.lock"):
        area = AreaFetcher(key, live / "cache", log=log)
        cmr = CmrFetcher(live / "cache", log=log)
        witness = Witness(args.witness)
        params, ratio = fitted.load_params(), fitted.load_ratio_fit()
        if ratio is None:
            raise RuntimeError("no overlap ratio is fitted")
        sealer = Sealer(live, ModisOnly(area), cmr, witness, params, ratio, clock=now_s, log=log)
        scorer = None
        if not args.no_score:
            from backend.live.scorer import Scorer

            scorer = Scorer(live, area, cmr, clock=now_s, log=log)
        log(f"protocol {sealer.protocol_sha}; {len(sealer.seals.entries)} seals held; code {sealer.code}")
        while True:
            t = now_s()
            try:
                out = sealer.cycle()
                if out["sealed"] or out["missed"]:
                    log(f"cycle: {out['sealed']} sealed, {out['missed']} missed")
            except Exception:  # noqa: BLE001  a cycle that fails is logged and the next one runs
                log("sealing cycle failed: " + traceback.format_exc().replace("\n", " | ")[-1500:])
            if scorer is not None:
                try:
                    scorer.cycle()
                except Exception:  # noqa: BLE001
                    log("scoring cycle failed: " + traceback.format_exc().replace("\n", " | ")[-1500:])
            try:
                answer.write(live)
                if args.page_json is not None:
                    answer.write(live, args.page_json)
            except Exception:  # noqa: BLE001
                log("answer not written: " + traceback.format_exc().replace("\n", " | ")[-800:])
            if args.once:
                return 0
            time.sleep(max(5.0, PR.CYCLE_S - (now_s() - t)))


if __name__ == "__main__":
    raise SystemExit(main())
