"""The live sealer on invented rows: it never asks for a VIIRS row, seals once, and its log cannot be rewritten."""

from __future__ import annotations

import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.live import protocol as PR  # noqa: E402
from backend.live.fetch import AreaFetcher, CmrFetcher, ModisOnly, SharpRowsRefused, iso  # noqa: E402
from backend.live.ledger import ChainBroken, Ledger, Witness, read_chain  # noqa: E402
from backend.live.sealer import Sealer  # noqa: E402
from backend.model import fitted  # noqa: E402

# A fixed "now": 2026-11-20 12:00 UTC. The invented NOAA-20 pass crosses the box at 12:22, so its granule starts at
# 12:18 (sealed in this cycle: between 30 and 10 minutes ahead). Its template is the same granule 16 days earlier.
NOW = 1795176000.0
GRANULE_START = NOW + 18 * 60.0
FIRE_LON, FIRE_LAT = 20.1, 0.1
HEADER = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight"


def _modis_csv() -> str:
    lines = [HEADER]
    for k in range(60):
        t = NOW - 3600.0 * (2 + (k % 3) * 11)          # three Aqua and Terra passes before now
        day = iso(t)[:10]
        hhmm = iso(t)[11:16].replace(":", "")
        lat = FIRE_LAT + 0.01 * (k % 8)
        lon = FIRE_LON + 0.01 * (k // 8)
        lines.append(f"{lat:.4f},{lon:.4f},330.0,1.0,1.0,{day},{hhmm},{'A' if k % 2 else 'T'},MODIS,80,6.1NRT,295.0,{20 + k},D")
    return "\n".join(lines) + "\n"


class _Resp(io.BytesIO):
    status = 200

    def __enter__(self) -> "_Resp":
        return self

    def __exit__(self, *a: object) -> None:
        self.close()


def _firms_opener(asked: list[str]):
    def opener(url: str) -> _Resp:
        asked.append(url)
        if "VIIRS" in url.upper():
            raise AssertionError(f"the sealing path asked for a VIIRS row: {url}")
        if "mapkey_status" in url:
            return _Resp(json.dumps({"transaction_limit": 5000, "current_transactions": 3}).encode())
        if "/MODIS_NRT/" in url:
            return _Resp(_modis_csv().encode())
        raise AssertionError(f"unexpected request {url}")
    return opener


def _granule_entry(t_start: float) -> dict:
    # a swath of about 2300 km along track and 3000 km across, drawn as a quadrilateral around the fire
    ring = [(-1.0 * 10.0, 13.5), (-10.0, 26.5), (10.0, 26.5), (10.0, 13.5), (-10.0, 13.5)]   # (lat, lon)
    return {
        "id": f"G{int(t_start)}-TEST", "title": "invented", "time_start": iso(t_start), "time_end": iso(t_start + 360.0),
        "day_night_flag": "DAY", "polygons": [[" ".join(f"{la} {lo}" for la, lo in ring)]],
    }


def _cmr_opener(asked: list[str]):
    def opener(url: str, headers: dict) -> tuple[int, dict, bytes]:
        asked.append(url)
        entries = []
        if PR.TEMPLATE_COLLECTIONS["VIIRS_NOAA20"] in url:
            t0 = url.split("temporal=")[1].split(",")[0]
            t_tmpl = GRANULE_START - 16 * 86400.0
            if t0 <= iso(t_tmpl) <= url.split("temporal=")[1].split(",")[1].split("&")[0]:
                entries = [_granule_entry(t_tmpl)]
        body = json.dumps({"feed": {"entry": entries}}).encode()
        return 200, {"cmr-hits": str(len(entries))}, body
    return opener


class SealTests(unittest.TestCase):
    def _sealer(self, root: Path, firms: list[str], cmr: list[str], clock: float = NOW) -> Sealer:
        area = AreaFetcher("TESTKEY", root / "cache", opener=_firms_opener(firms), log=lambda m: None, pause_s=0.0,
                           clock=lambda: clock)
        cm = CmrFetcher(root / "cache", opener=_cmr_opener(cmr), log=lambda m: None, clock=lambda: clock, pause_s=0.0)
        return Sealer(root / "live", ModisOnly(area), cm, Witness(root / "SEALS.md"), fitted.load_params(),
                      fitted.load_ratio_fit(), clock=lambda: clock, log=lambda m: None, fitted_ok=lambda: True,
                      code={"commit": "test", "tracked_files_changed": False})

    def test_the_sealing_path_never_asks_for_a_viirs_row(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            firms, cmr = [], []
            s = self._sealer(root, firms, cmr)
            out = s.cycle()
            self.assertEqual(out, {"sealed": 1, "missed": 0})
            self.assertTrue(firms and not any("VIIRS" in u.upper() for u in firms))
            self.assertTrue(all("TESTKEY" not in json.dumps(e) for e in s.seals.entries + s.cohorts.entries))
            seal = s.seals.entries[0]
            self.assertEqual(seal["slot"]["platform"], "VIIRS_NOAA20")
            self.assertLess(seal["sealed_s"], seal["slot"]["span_s"][0] - PR.SEAL_DEADLINE_S + 1e-6)
            self.assertEqual(set(seal["methods"]), set(PR.METHODS))
            self.assertGreater(seal["methods"]["reconstruction"]["published"]["predicted_frp_mw"], 0.0)
            self.assertIn(seal["sha256"], (root / "SEALS.md").read_text(encoding="ascii"))
            # started again on the same folder: nothing is sealed twice and the chain still reads
            s2 = self._sealer(root, firms, cmr, clock=NOW + 300.0)
            self.assertEqual(s2.cycle(), {"sealed": 0, "missed": 0})
            self.assertEqual(len(list(read_chain(root / "live" / "seals.jsonl", "seal"))), 1)
            self.assertEqual((root / "SEALS.md").read_text(encoding="ascii").count(seal["sha256"]), 1)

    def test_a_stop_is_recorded_as_a_stop_and_names_the_pass_it_cost(self) -> None:
        from backend.live.answer import build

        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            early = NOW - 3 * 3600.0
            self.assertEqual(self._sealer(root, [], [], clock=early).cycle(), {"sealed": 0, "missed": 0})
            # the runner is down until 3 minutes before the pass begins: past its deadline
            late = GRANULE_START - 180.0
            s2 = self._sealer(root, [], [], clock=late)
            self.assertEqual(s2.cycle(), {"sealed": 0, "missed": 1})
            miss = s2.missed.entries[0]
            self.assertIn("not running in the seal window", miss["reason"])
            run = build(root / "live", now=late + 1.0)["runner"]
            self.assertTrue(run["running_now"])
            self.assertEqual(len(run["stops"]), 1)
            stop = run["stops"][0]
            self.assertEqual((stop["from_utc"], stop["to_utc"]), (iso(early), iso(late)))
            self.assertEqual([p["predicted_time_utc"] for p in stop["passes_not_sealed"]], [miss["predicted_time_utc"]])
            # and with no cycle for longer than two cycles the answer says the sealer is not running now
            later = build(root / "live", now=late + 3 * PR.CYCLE_S)["runner"]
            self.assertFalse(later["running_now"])
            self.assertIsNone(later["stops"][-1]["to_utc"])

    def test_the_modis_only_fetcher_refuses_every_sharp_source(self) -> None:
        asked: list[str] = []
        with tempfile.TemporaryDirectory() as d:
            m = ModisOnly(AreaFetcher("K", Path(d), opener=_firms_opener(asked), log=lambda x: None, pause_s=0.0))
            for src in ("VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT", "VIIRS_NOAA20_SP", "MODIS_SP", "LANDSAT_NRT"):
                with self.assertRaises(SharpRowsRefused):
                    m.fetch(src, (0.0, 0.0, 1.0, 1.0), 1, "2026-11-14")
        self.assertEqual(asked, [])

    def test_a_changed_line_breaks_the_chain(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            led = Ledger(Path(d) / "x.jsonl", "seal")
            led.append({"a": 1})
            led.append({"a": 2})
            p = Path(d) / "x.jsonl"
            p.write_text(p.read_text().replace('"a":1', '"a":3'))
            with self.assertRaises(ChainBroken):
                list(read_chain(p, "seal"))
            lines = (Path(d) / "x.jsonl").read_text().splitlines()
            p.write_text(lines[1] + "\n")
            with self.assertRaises(ChainBroken):
                list(read_chain(p, "seal"))


if __name__ == "__main__":
    unittest.main()
