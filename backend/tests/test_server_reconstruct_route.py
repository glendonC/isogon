"""POST /api/reconstruct routes "source": "firms" to the real-run solver; without it the run is simulated."""

from __future__ import annotations

from pathlib import Path
import sys
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.firms import archive as fa  # noqa: E402

_STORE = None


def _store():
    global _STORE
    if _STORE is None:
        from backend.server import IsogonDataStore
        from backend.model.reconstruct import DEFAULT_FIELDS_REL_DIR

        _STORE = IsogonDataStore(fields_dir=REPO_ROOT / DEFAULT_FIELDS_REL_DIR)
    return _STORE


def _open_run_cached() -> bool:
    return fa.extract_path("plumas_ca", "viirs-snpp", 2012).is_file()


class ReconstructRouteTests(unittest.TestCase):
    def test_bad_requests(self) -> None:
        s = _store()
        for body in (
            {"region_id": "plumas_ca", "source": "bogus"},
            {"region_id": "plumas_ca", "source": "firms"},
            {"region_id": "plumas_ca", "source": "firms", "start": "2012-08-10", "cloud_override": 0.3},
            {"region_id": "plumas_ca", "imagery_source": "eox_s2cloudless_2020"},   # not an imagery source
        ):
            with self.subTest(body=body):
                with self.assertRaises(ValueError):
                    s.execute_reconstruct(body)
        with self.assertRaises(fa.FirmsCacheMissing):  # a region whose box holds no FIRMS rows
            s.execute_reconstruct({"region_id": "blue_mountains_au", "source": "firms", "start": "2021-07-22"})

    def test_simulated_run_is_untouched_by_the_source_switch(self) -> None:
        s = _store()
        a = s.execute_reconstruct({"region_id": "plumas_ca"})
        b = s.execute_reconstruct({"region_id": "plumas_ca", "source": "simulated"})
        self.assertEqual(a, b)
        self.assertNotIn("source", a)
        self.assertEqual(a["downloaded_firms_rows"], 0)
        self.assertEqual(a["run_id"], "plumas_ca_holdout0_cnone")

    def test_the_run_takes_its_imagery_by_coverage_and_says_which(self) -> None:
        s = _store()
        a = s.execute_reconstruct({"region_id": "plumas_ca"})
        self.assertEqual({k: a["imagery"][k] for k in ("chosen", "chosen_by", "asked")},
                         {"chosen": "usgs_naip", "chosen_by": "coverage", "asked": None})
        b = s.execute_reconstruct({"region_id": "plumas_ca", "imagery_source": "esri_world_imagery"})
        self.assertEqual((b["imagery"]["chosen"], b["imagery"]["chosen_by"]), ("esri_world_imagery", "request"))
        for got in (a, b):
            pack = got["assets"].get("terrain_pack")
            if pack is not None:   # a pack on disk is the chosen source's; a missing one is building
                self.assertEqual(pack["ortho"]["source"], got["imagery"]["chosen"])

    def test_real_run_keeps_the_simulated_shape(self) -> None:
        if not _open_run_cached():
            self.skipTest("FIRMS rows for plumas_ca 2012 are not cached")
        s = _store()
        sim = s.execute_reconstruct({"region_id": "plumas_ca"})
        blind = s.execute_reconstruct({"region_id": "plumas_ca", "source": "firms", "start": "2012-08-10",
                                       "holdout_viirs": True})
        self.assertNotIn("blind_test", blind)                     # withheld until the reveal is asked for
        self.assertIn("blind_test", blind["hidden_rows"]["withheld_until_reveal"])
        real = s.execute_reconstruct({"region_id": "plumas_ca", "source": "firms", "start": "2012-08-10",
                                      "holdout_viirs": True, "reveal": True})
        self.assertEqual(real["source"], "firms")
        self.assertTrue(real["holdout_viirs"])
        self.assertEqual(len(real["observer_passes"]["frames"]), 24)
        self.assertTrue(set(sim) <= set(real), set(sim) - set(real))
        self.assertTrue(set(sim["assets"]) <= set(real["assets"]))
        self.assertGreater(real["downloaded_firms_rows"], 0)
        self.assertIn("blind_test", real)
        self.assertEqual(real["assets"]["reconstruction_u8_url"], f"/api/runs/{real['run_id']}/reconstruction_u8.bin")
        self.assertIsNotNone(s.get_run(real["run_id"]))
        again = s.execute_reconstruct({"region_id": "plumas_ca", "source": "firms", "start": "2012-08-10",
                                       "holdout_viirs": True, "reveal": True})
        self.assertEqual(again, real)


if __name__ == "__main__":
    unittest.main()
