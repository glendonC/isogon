"""The calendar's ratio from a place's small file of its inputs is the ratio from the cached yearly extracts, and a
run given the file is the run without it, byte for byte. On the cached rows of `plumas_ca` and `ventura_ca`; no
window of a test fire is run."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.model import calendar_ratio as CR  # noqa: E402

EXTRACTS = _REPO_ROOT / "data" / "cache" / "firms" / "extract"
PLACES = [(r, years) for r, years in (("plumas_ca", (2012,)), ("ventura_ca", (2017, 2018))) if (EXTRACTS / r).is_dir()]


@unittest.skipUnless(PLACES, "no cached rows of plumas_ca or ventura_ca here")
class RatioInputsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.files = {r: CR.write_ratio_inputs(r, cls.tmp.name) for r, _ in PLACES}

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def test_the_ratio_from_the_file_is_the_ratio_from_the_extracts(self) -> None:
        read = CR.ratio_inputs_calendar(self.tmp.name)
        for region, years in PLACES:
            self.assertEqual(CR.calendar_ratio(region, years, firms_calendar=read),
                             CR.calendar_ratio(region, years), region)
            self.assertEqual(CR.calendar_ratio(region, None, firms_calendar=read), CR.calendar_ratio(region, None))

    def test_the_file_is_small_and_says_what_it_was_made_from(self) -> None:
        from backend.firms.archive import region_rows_digest

        for region, _ in PLACES:
            doc = json.loads(self.files[region].read_text(encoding="utf-8"))
            self.assertEqual((doc["version"], doc["region_id"]), (CR.RATIO_INPUTS_VERSION, region))
            self.assertEqual(doc["made_from_rows"], region_rows_digest(region))
            self.assertLess(self.files[region].stat().st_size, 200_000)
            extracts = sum(f.stat().st_size for f in (EXTRACTS / region).glob("*.csv"))
            self.assertLess(self.files[region].stat().st_size * 50, extracts)

    def test_a_file_of_another_place_is_refused(self) -> None:
        region = PLACES[0][0]
        other = Path(self.tmp.name) / "elsewhere"
        other.mkdir(exist_ok=True)
        doc = json.loads(self.files[region].read_text(encoding="utf-8"))
        (other / "somewhere_xx.json").write_text(json.dumps({**doc, "region_id": region}), encoding="utf-8")
        with self.assertRaises(ValueError):
            CR.ratio_inputs_calendar(other)("somewhere_xx")

    def test_a_run_given_the_file_is_the_run_without_it(self) -> None:
        from backend.model.real_run import real_response, solve_real_reconstruction
        from backend.terrain.live_region import load_region_terrain, resolve_region_request

        region = PLACES[0][0]
        terrain = load_region_terrain(resolve_region_request(region_id=region), allow_network=False)
        runs = [solve_real_reconstruction(terrain, "2012-08-10", holdout_viirs=True, **kw)
                for kw in ({}, {"firms_calendar": CR.ratio_inputs_calendar(self.tmp.name)})]
        texts = []
        for run in runs:
            doc = real_response(run, {})
            for stage in doc["pipeline_stages"]:
                stage.pop("duration_ms", None)
            texts.append(json.dumps(doc, sort_keys=True, default=str))
        self.assertEqual(texts[0], texts[1])
        self.assertEqual(runs[0].reconstruction_u8_bytes, runs[1].reconstruction_u8_bytes)


if __name__ == "__main__":
    unittest.main()
