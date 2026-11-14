"""A held-out run's first response carries nothing the scorer wrote until the page asks for the reveal; the
sensor-model route passes the gates of `backend.model.gates` through (not evaluated on real runs), never a simulated
run's; caches are keyed on what decides their content.

The first two classes need no cache. The others use real rows of plumas_ca in August 2012 and skip without them.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.firms import archive as fa  # noqa: E402
from backend.firms import cmr_passes as cp  # noqa: E402

# A run outside the closed windows: the default by rule of the places registry (no 2021 window of a region with a
# recorded test fire is held out, revealed or played; the server refuses one with 409).
OPEN_RUN = {"region_id": "plumas_ca", "source": "firms", "start": "2012-08-10"}


class WithholdTests(unittest.TestCase):
    def test_declared_keys_go_and_the_stored_run_is_untouched(self) -> None:
        from backend.server import REVEAL_WITH, withhold_scorer_keys

        metrics = {"kept": 1.0, "hidden_a": 2.0, "hidden_b": 3.0, "from_hidden_rows": ["hidden_a", "hidden_b"]}
        resp = {"run_id": "r", "blind_test": {"verdict": "x"}, "metrics": metrics, "frames": [1, 2],
                "hidden_rows": {"payload_keys_from_the_scorer": ["blind_test", "metrics.hidden_a"]}}
        before = copy.deepcopy(resp)
        out = withhold_scorer_keys(resp)
        self.assertNotIn("blind_test", out)
        self.assertEqual(out["metrics"], {"kept": 1.0, "from_hidden_rows": ["hidden_a", "hidden_b"]})  # b by its list
        self.assertEqual(out["hidden_rows"]["withheld_until_reveal"], ["blind_test", "metrics.hidden_a", "metrics.hidden_b"])
        self.assertEqual(out["hidden_rows"]["reveal_with"], REVEAL_WITH)
        self.assertEqual(resp, before)                                   # nothing shared was changed in place
        self.assertEqual(out["frames"], [1, 2])

    def test_without_a_declaration_blind_test_and_the_listed_metrics_still_go(self) -> None:
        from backend.server import withhold_scorer_keys

        out = withhold_scorer_keys({"blind_test": {}, "metrics": {"m": 1, "from_hidden_rows": ["m"]}})
        self.assertNotIn("blind_test", out)
        self.assertNotIn("m", out["metrics"])


class CacheKeyTests(unittest.TestCase):
    def test_a_region_key_moves_with_its_own_rows_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            for region in ("plumas_ca", "evia_greece"):
                d = cache / "extract" / region
                d.mkdir(parents=True)
                (d / "modis_2021.csv.manifest.json").write_text(json.dumps({"sha256": "a" * 64, "rows": 10}))
            p0, e0 = fa.region_rows_digest("plumas_ca", cache), fa.region_rows_digest("evia_greece", cache)
            # the same row count with one row changed: a count key would not move, this one does
            (cache / "extract" / "plumas_ca" / "modis_2021.csv.manifest.json").write_text(json.dumps({"sha256": "b" * 64, "rows": 10}))
            self.assertNotEqual(fa.region_rows_digest("plumas_ca", cache), p0)
            self.assertEqual(fa.region_rows_digest("evia_greece", cache), e0)
            (cache / "extract" / "evia_greece" / "viirs-snpp_2021.csv.manifest.json").write_text(json.dumps({"sha256": "c" * 64}))
            self.assertNotEqual(fa.region_rows_digest("evia_greece", cache), e0)

    def test_a_pass_file_key_moves_when_a_fetch_rewrites_a_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            f = cache / "passes" / "plumas_ca" / "MODIS_TERRA_2021.json.gz"
            f.parent.mkdir(parents=True)
            f.write_bytes(b"one")
            k0 = cp.pass_files_digest("plumas_ca", cache)
            f.write_bytes(b"two!")
            self.assertNotEqual(cp.pass_files_digest("plumas_ca", cache), k0)

    def test_no_cache_of_the_server_is_keyed_on_the_total_row_count(self) -> None:
        import inspect

        import backend.server as server

        src = inspect.getsource(server)
        self.assertNotIn('firms_counts()["downloaded_rows"]', src)
        self.assertIn("self.region_rows_key(spec.id), fitted_values_digest()", src)


def _open_run_cached() -> bool:
    return fa.extract_path("plumas_ca", "viirs-snpp", 2012).is_file()


class HeldOutRunTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not _open_run_cached():
            raise unittest.SkipTest("FIRMS rows for plumas_ca 2012 are not cached")
        from backend.tests import test_server_http as http_tests

        cls.http = http_tests
        status, _, raw = http_tests._req("/api/reconstruct", json.dumps({**OPEN_RUN, "holdout_viirs": True}).encode())
        assert status == 200, raw[:300]
        cls.blind = json.loads(raw)
        status, _, raw = http_tests._req("/api/reconstruct", json.dumps({**OPEN_RUN, "holdout_viirs": True, "reveal": True}).encode())
        assert status == 200, raw[:300]
        cls.revealed = json.loads(raw)

    def test_the_first_response_holds_nothing_the_scorer_wrote(self) -> None:
        b = self.blind
        self.assertNotIn("blind_test", b)
        declared = self.revealed["hidden_rows"]["payload_keys_from_the_scorer"]
        for path in declared:
            if path.startswith("metrics."):
                self.assertNotIn(path.split(".", 1)[1], b["metrics"], path)
        self.assertEqual(sorted(b["hidden_rows"]["withheld_until_reveal"]), sorted(set(declared)))
        self.assertIn('"reveal": true', b["hidden_rows"]["reveal_with"])
        text = json.dumps(b)
        self.assertNotIn('"from_the_scorer":', text)                    # the blind test's own list of scorer keys
        self.assertNotIn('"reveal": {', text)

    def test_the_reveal_gives_them_and_nothing_else_differs(self) -> None:
        r, b = self.revealed, self.blind
        self.assertIn("blind_test", r)
        self.assertIn("verdict", r["blind_test"])
        for k in r["metrics"]["from_hidden_rows"]:
            self.assertIn(k, r["metrics"])
        self.assertEqual(r["run_id"], b["run_id"])
        from backend.server import withhold_scorer_keys

        self.assertEqual(withhold_scorer_keys(r), b)

    def test_a_run_with_nothing_hidden_is_unchanged(self) -> None:
        status, _, raw = self.http._req("/api/reconstruct", json.dumps({**OPEN_RUN, "holdout_viirs": False}).encode())
        self.assertEqual(status, 200)
        run = json.loads(raw)
        self.assertNotIn("withheld_until_reveal", run.get("hidden_rows") or {})
        self.assertIn("raw_modis_rmse_mw_km2", run["metrics"])

    def test_real_runs_get_the_models_gates_passed_through(self) -> None:
        # `backend.model.gates` marks G1 and G5 not evaluated on a real run; the route passes that through, and
        # a real run that has left the run cache does not fall back to the default simulated run's gates.
        for rid in (self.blind["run_id"], "plumas_ca_firms_20990101T0000_holdoutviirs"):
            status, _, raw = self.http._req(f"/api/sensor-model?run_id={rid}")
            self.assertEqual(status, 200)
            sm = json.loads(raw)
            self.assertEqual(sm["benchmark_gates_run_id"], rid)
            gates = {g["gate_id"]: g for g in sm["benchmark_gates"]}
            for gid in [g for g in gates if g.startswith(("G1", "G5"))]:
                self.assertEqual(gates[gid]["status"], "NOT_EVALUATED", (rid, gid))
                self.assertIn("real FIRMS run", gates[gid]["metric"])
            self.assertEqual(len([g for g in gates if g.startswith(("G1", "G5"))]), 2)

    def test_deleting_every_hidden_row_leaves_the_withheld_response_unchanged(self) -> None:
        from backend.firms import read_firms
        from backend.model.real_run import real_response, solve_real_reconstruction
        from backend.server import withhold_scorer_keys
        from backend.terrain.live_region import PRESET_BY_ID, load_region_terrain

        terrain = load_region_terrain(spec=PRESET_BY_ID["plumas_ca"], allow_network=False)

        def modis_only(box, t0, t1, platforms=None):
            return [r for r in read_firms(box, t0, t1) if r.get("instrument", "").upper() == "MODIS"]

        def leaf_view(resp: dict) -> dict:
            out = copy.deepcopy(resp)
            for stage in out.get("pipeline_stages", []):
                stage.pop("duration_ms", None)                            # wall clock
            return out

        full = withhold_scorer_keys(real_response(solve_real_reconstruction(terrain, OPEN_RUN["start"], holdout_viirs=True), {}))
        bare = withhold_scorer_keys(real_response(solve_real_reconstruction(terrain, OPEN_RUN["start"], holdout_viirs=True, read_firms=modis_only), {}))
        self.assertEqual(json.dumps(leaf_view(full), sort_keys=True), json.dumps(leaf_view(bare), sort_keys=True))

    def test_the_run_cache_is_rebuilt_when_the_region_rows_change(self) -> None:
        store = self.http._SERVER.store
        first = store.get_run(self.blind["run_id"])[0]
        store.execute_reconstruct({**OPEN_RUN, "holdout_viirs": True})
        self.assertIs(store.get_run(self.blind["run_id"])[0], first)       # same rows: served from the cache
        real_key = store.region_rows_key
        store.region_rows_key = lambda region_id, max_age_s=10.0: "rows changed"
        try:
            store.execute_reconstruct({**OPEN_RUN, "holdout_viirs": True})
        finally:
            store.region_rows_key = real_key
        self.assertIsNot(store.get_run(self.blind["run_id"])[0], first)    # other rows: solved again


if __name__ == "__main__":
    unittest.main()
