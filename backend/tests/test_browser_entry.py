"""The browser's entry point (`backend/browser.py`) gives what the server's route gives, by the same functions:
a held-out run's first answer with the scorer's keys withheld, and its reveal. On the Chips Fire of 2012 in the
cached rows of `plumas_ca`, with the second model answering; no window of a test fire is run."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest import mock

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

REGION, START = "plumas_ca", "2012-08-10"
HAS_ROWS = (_REPO_ROOT / "data" / "cache" / "firms" / "extract" / REGION).is_dir()
def _as_the_route_names_it(resp: dict, route: dict) -> dict:
    """The answer given the route's asset routes and named by the route's own imagery naming, with the route's
    choice: the route serves its pictures by routes and names the terrain pack's imagery it chose, which here the
    page's bridge does."""
    from backend import server as SV

    doc = copy.deepcopy(resp)
    doc["assets"] = copy.deepcopy(route["assets"])
    im = route["imagery"]
    return SV.name_imagery(doc, {"source": im["chosen"], "chosen_by": im["chosen_by"], "why": im["why"], "asked": im["asked"]})


def _comparable(resp: dict) -> str:
    """The answer without how its reveal is asked for, its note on digests and the wall clock times, which differ by
    design."""
    doc = copy.deepcopy({k: v for k, v in resp.items() if k != "digests"})
    (doc.get("hidden_rows") or {}).pop("reveal_with", None)
    for stage in doc.get("pipeline_stages", []):
        stage.pop("duration_ms", None)
    return json.dumps(doc, sort_keys=True, default=str)


@unittest.skipUnless(HAS_ROWS, f"the cached rows of {REGION} are not here")
class EntryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from backend import browser as B
        from backend import server as SV

        cls.first = B.held_out_run(REGION, START)
        cls.whole = B.reveal(cls.first["run_id"])
        cls.pics = B.pictures(cls.first["run_id"])
        with mock.patch.dict(os.environ, {"ISOGON_RUN_ESTIMATE": "challenger"}):
            store = SV.IsogonDataStore(fields_dir=SV._REPO_ROOT / SV.DEFAULT_FIELDS_REL_DIR)
            body = {"source": "firms", "region_id": REGION, "start": START, "holdout_viirs": True}
            cls.route_first = store.execute_reconstruct(dict(body))
            cls.route_whole = store.execute_reconstruct({**body, "reveal": True})

    def test_the_first_answer_is_the_route_s_with_the_scorer_s_keys_withheld(self) -> None:
        self.assertEqual(self.first["held_out_passes_answered_by"]["method"], "challenger_blend")
        self.assertNotIn("blind_test", self.first)
        self.assertEqual(self.first["hidden_rows"]["withheld_until_reveal"],
                         self.route_first["hidden_rows"]["withheld_until_reveal"])
        self.assertIn("backend.browser.reveal", self.first["hidden_rows"]["reveal_with"])
        self.assertEqual(_comparable(_as_the_route_names_it(self.first, self.route_first)), _comparable(self.route_first))

    def test_the_reveal_is_the_route_s_reveal(self) -> None:
        self.assertIn("blind_test", self.whole)
        self.assertEqual(_comparable(_as_the_route_names_it(self.whole, self.route_whole)), _comparable(self.route_whole))

    def test_the_pictures_are_the_run_s_bytes(self) -> None:
        self.assertEqual(sorted(self.pics), ["belief_u8.bin", "export.csv", "export.geojson", "reconstruction_u8.bin"])
        self.assertEqual(len(self.pics["reconstruction_u8.bin"]), 24 * 256 * 256 * 4)
        self.assertEqual(len(self.pics["belief_u8.bin"]), self.whole["belief_frames"]["bytes"])

    def test_an_answer_made_here_says_its_digests_are_its_own_and_compares_with_the_route_s(self) -> None:
        from backend import browser as B

        for doc in (self.first, self.whole):
            self.assertIs(doc["digests"]["a_server_seal_checked_here"], False)
            self.assertIn("0.08 percent", doc["digests"]["why"])
        got = B.compare_with(self.route_whole, _as_the_route_names_it(self.whole, self.route_whole))
        self.assertTrue(got["agree"], got["differences"][:3])
        self.assertGreater(got["digests_not_compared"], 0)
        self.assertGreater(got["numbers"], 1000)

    def test_a_run_not_kept_is_said_so(self) -> None:
        from backend import browser as B

        with self.assertRaises(LookupError):
            B.reveal("no such run")


class LoadTests(unittest.TestCase):
    def test_loading_the_entry_point_loads_no_other_module_of_the_backend_and_a_run_never_the_http_server(self) -> None:
        code = ("import sys; import backend.browser; "
                "print(sorted(m for m in sys.modules if m.startswith('backend.') and m != 'backend.browser'))")
        out = subprocess.run([sys.executable, "-c", code], cwd=_REPO_ROOT, capture_output=True, text=True, check=True)
        self.assertEqual(out.stdout.strip(), "[]")
        if HAS_ROWS:
            code = ("import sys; from backend import browser as B; B.held_out_run('plumas_ca', '2012-08-10'); "
                    "print([m for m in sys.modules if m == 'backend.server'])")
            out = subprocess.run([sys.executable, "-c", code], cwd=_REPO_ROOT, capture_output=True, text=True, check=True)
            self.assertEqual(out.stdout.strip().splitlines()[-1], "[]")


if __name__ == "__main__":
    unittest.main()
