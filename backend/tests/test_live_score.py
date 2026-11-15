"""The live scorer on invented rows: a sealed prediction is scored as sealed, once, or marked with its reason."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.live import protocol as PR  # noqa: E402
from backend.live.fetch import AreaFetcher, CmrFetcher, iso  # noqa: E402
from backend.live.scorer import Scorer  # noqa: E402
from backend.tests import test_live_seal as LS  # noqa: E402

FIRE_LAT, FIRE_LON, GRANULE_START, NOW = LS.FIRE_LAT, LS.FIRE_LON, LS.GRANULE_START, LS.NOW
_Resp, _granule_entry, _modis_csv = LS._Resp, LS._granule_entry, LS._modis_csv

VIIRS_HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight"
AFTER = GRANULE_START + 360.0 + PR.ROWS_AFTER_S + 600.0


def _viirs_csv(t: float) -> str:
    day, hhmm = iso(t)[:10], iso(t)[11:16].replace(":", "")
    lines = [VIIRS_HEADER]
    for k in range(25):
        lines.append(f"{FIRE_LAT + 0.004 * (k % 5):.5f},{FIRE_LON + 0.004 * (k // 5):.5f},340.0,0.4,0.4,{day},{hhmm},N20,VIIRS,n,2.0NRT,290.0,{5 + k},D")
    return "\n".join(lines) + "\n"


def _openers(real_start: float, asked: list[str]):
    def firms(url: str) -> _Resp:
        asked.append(url)
        if "mapkey_status" in url:
            return _Resp(json.dumps({"transaction_limit": 5000, "current_transactions": 3}).encode())
        if "/VIIRS_NOAA20_NRT/" in url:
            return _Resp(_viirs_csv(real_start + 240.0).encode())
        if "/MODIS_NRT/" in url:
            return _Resp(_modis_csv().encode())
        raise AssertionError(url)

    def cmr(url: str, headers: dict) -> tuple[int, dict, bytes]:
        asked.append(url)
        t0, t1 = url.split("temporal=")[1].split("&")[0].split(",")
        entries = []
        if PR.NRT_COLLECTIONS["VIIRS_NOAA20"] in url and t0 <= iso(real_start) <= t1:
            entries = [_granule_entry(real_start)]
        if PR.TEMPLATE_COLLECTIONS["VIIRS_NOAA20"] in url and t0 <= iso(GRANULE_START - 16 * 86400.0) <= t1:
            entries = [_granule_entry(GRANULE_START - 16 * 86400.0)]
        return 200, {"cmr-hits": str(len(entries))}, json.dumps({"feed": {"entry": entries}}).encode()

    return firms, cmr


class ScoreTests(unittest.TestCase):
    def _run(self, root: Path, real_start: float) -> tuple[Scorer, list[str]]:
        asked: list[str] = []
        firms, cmr = _openers(real_start, asked)
        st = LS.SealTests()
        sealer = st._sealer(root, [], [])
        self.assertEqual(sealer.cycle()["sealed"], 1)
        area = AreaFetcher("TESTKEY", root / "cache", opener=firms, log=lambda m: None, pause_s=0.0, clock=lambda: AFTER)
        cm = CmrFetcher(root / "cache", opener=cmr, log=lambda m: None, clock=lambda: AFTER, pause_s=0.0)
        sc = Scorer(root / "live", area, cm, clock=lambda: AFTER, log=lambda m: None)
        return sc, asked

    def test_a_sealed_prediction_is_scored_as_it_was_sealed_and_once(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            sc, asked = self._run(root, GRANULE_START)
            self.assertEqual(sc.cycle(), 1)
            fin = sc.scores.entries[0]
            self.assertEqual(fin["state"], "scored")
            self.assertEqual(fin["look"]["hidden_pixels_in_box"], 25)
            line = json.loads((root / "live" / "seals.jsonl").read_text().splitlines()[0])
            seal, seal_sha = line["seal"], line["sha256"]
            for m in PR.METHODS:
                self.assertEqual(fin["report"]["published"][m][0], seal["methods"][m]["published"])
            self.assertTrue(any("/VIIRS_NOAA20_NRT/" in u for u in asked))
            self.assertNotIn("TESTKEY", (root / "live" / "scores.jsonl").read_text())
            summary = json.loads((root / "live" / "summary.json").read_text())
            self.assertEqual(summary["fires_scored"], 1)
            # the page's answer lists the seal with its state, times, digest and scores
            from backend.live.answer import build

            ans = build(root / "live", now=AFTER)
            self.assertEqual(ans["counts"]["seals"], 1)
            row = ans["seals"][0]
            self.assertEqual((row["state"], row["sha256"]), ("scored", seal_sha))
            self.assertEqual(row["scores"]["hidden_pixels_in_box"], 25)
            self.assertIn("near real time", ans["rows_note"])
            # started again: nothing is scored twice
            sc2 = Scorer(root / "live", sc.area, sc.cmr, clock=lambda: AFTER + 300.0, log=lambda m: None)
            self.assertEqual(sc2.cycle(), 0)
            self.assertEqual(len(sc2.scores.entries), 1)

    def test_a_pass_that_began_before_its_seal_is_not_scored(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            sc, _ = self._run(Path(d), NOW - 60.0)
            sc.cycle()
            fin = sc.scores.entries[0]
            self.assertEqual(fin["state"], "not_scored")
            self.assertIn("before the seal", fin["reason"])


if __name__ == "__main__":
    unittest.main()
