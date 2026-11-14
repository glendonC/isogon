"""Requests on closed windows are refused, before anything is built.

The 2021 windows of the regions with a recorded test fire are closed: no held-out run, reveal, round or play is
served there (`backend.server_next_look.closed_for`, asked with the box and the window of what is asked). Every
request below must be refused, with 409 and the evidence address, or with 400 or 404 for a spelling the routes do not
take. The list is the outside audit's (44 requests, one of them moved out: a start of 31 December 2021, 23:00, whose run's
own window begins on 25 January 2022 and is open by the rule; a test below checks that window without building the
run), plus a box of its own over each closed region asked by centre and span. No run, round or play may be built for any of them, and no answer may be 200. Nothing here is served, so no
closed window is scored. Skips without the cached rows of plumas_ca.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.firms import archive as fa  # noqa: E402

RUN = {"source": "firms", "holdout_viirs": True}
RESET, PLAY, RECON = "/api/env/next_look/reset", "/api/env/next_look/play", "/api/reconstruct"

CASES: list[tuple[str, str, dict, tuple[int, ...]]] = [
    # held-out runs and reveals
    ("held-out run, plumas_ca, 22 July 2021", RECON, {"region_id": "plumas_ca", "start": "2021-07-22T20:34:00Z", **RUN}, (409,)),
    ("the same asked as holdout: viirs", RECON, {"region_id": "plumas_ca", "start": "2021-07-22T20:34:00Z", "source": "firms", "holdout": "viirs"}, (409,)),
    ("the same with reveal", RECON, {"region_id": "plumas_ca", "start": "2021-07-22T20:34:00Z", **RUN, "reveal": True}, (409,)),
    ("held-out run, lytton_bc, 30 June 2021", RECON, {"region_id": "lytton_bc", "start": "2021-06-30", **RUN}, (409,)),
    ("held-out run, evia_greece, 5 August 2021", RECON, {"region_id": "evia_greece", "start": "2021-08-05", **RUN}, (409,)),
    ("reveal, evia_greece, 5 August 2021", RECON, {"region_id": "evia_greece", "start": "2021-08-05", **RUN, "reveal": True}, (409,)),
    ("region id written ' Plumas_CA '", RECON, {"region_id": " Plumas_CA ", "start": "2021-07-22", **RUN}, (409,)),
    ("no id, query_text Dixie", RECON, {"query_text": "Dixie", "start": "2021-07-22", **RUN}, (409,)),
    ("no id, query_text plumas_ca", RECON, {"query_text": "plumas_ca", "start": "2021-07-22", **RUN}, (409,)),
    ("id with the preset's own centre", RECON, {"region_id": "plumas_ca", "center_lat": 40.05, "center_lon": -121.18, "start": "2021-07-22", **RUN}, (409,)),
    ("start 15 December 2020", RECON, {"region_id": "plumas_ca", "start": "2020-12-15", **RUN}, (409,)),
    ("start 2 December 2020, one second past midnight", RECON, {"region_id": "plumas_ca", "start": "2020-12-02T00:00:01Z", **RUN}, (409,)),
    ("start 31 December 2020", RECON, {"region_id": "lytton_bc", "start": "2020-12-31", **RUN}, (409,)),
    ("start written 2021", RECON, {"region_id": "plumas_ca", "start": "2021", **RUN}, (409,)),
    ("start with a zone offset", RECON, {"region_id": "plumas_ca", "start": "2021-07-22T20:34:00+00:00", **RUN}, (409,)),
    ("start with a space for the T", RECON, {"region_id": "plumas_ca", "start": "2021-07-22 20:34", **RUN}, (409,)),
    ("holdout written VIIRS", RECON, {"region_id": "plumas_ca", "start": "2021-07-22", "source": "firms", "holdout": "VIIRS"}, (400,)),
    ("holdout_viirs as the string true", RECON, {"region_id": "plumas_ca", "start": "2021-07-22", "source": "firms", "holdout_viirs": "true"}, (400,)),
    # rounds
    ("round by key, plumas_ca test box", RESET, {"region_id": "plumas_ca", "episode": "plumas_ca:22:2021-07-22T05"}, (409,)),
    ("round by key, a tile outside the test box", RESET, {"region_id": "plumas_ca", "episode": "plumas_ca:11:2021-08-01T00"}, (409,)),
    ("round by key, lytton_bc", RESET, {"region_id": "lytton_bc", "episode": "lytton_bc:22:2021-06-30T20"}, (409,)),
    ("round by key, evia_greece", RESET, {"region_id": "evia_greece", "episode": "evia_greece:22:2021-08-05T10"}, (409,)),
    ("round by key, 1 January 2021", RESET, {"region_id": "plumas_ca", "episode": "plumas_ca:22:2021-01-01T00"}, (409,)),
    ("round by key, 31 December 2021", RESET, {"region_id": "plumas_ca", "episode": "plumas_ca:22:2021-12-31T23"}, (409,)),
    ("round by key with a line end after it", RESET, {"region_id": "plumas_ca", "episode": "plumas_ca:22:2021-07-22T05\n"}, (409,)),
    ("round by key, id with spaces", RESET, {"region_id": " plumas_ca ", "episode": "plumas_ca:22:2021-07-22T05"}, (409,)),
    ("round by key, id in capitals", RESET, {"region_id": "PLUMAS_CA", "episode": "plumas_ca:22:2021-07-22T05"}, (404, 400)),
    ("round by key, key in capitals", RESET, {"region_id": "plumas_ca", "episode": "PLUMAS_CA:22:2021-07-22T05"}, (400,)),
    ("round by key of another region", RESET, {"region_id": "lytton_bc", "episode": "plumas_ca:22:2021-07-22T05"}, (400,)),
    ("round by start, plumas_ca, 22 July 2021", RESET, {"region_id": "plumas_ca", "start": "2021-07-22"}, (409,)),
    ("round by start, lytton_bc, 30 June 2021", RESET, {"region_id": "lytton_bc", "start": "2021-06-30"}, (409,)),
    ("round by start, evia_greece, 5 August 2021", RESET, {"region_id": "evia_greece", "start": "2021-08-05"}, (409,)),
    ("round by start, 31 December 2020", RESET, {"region_id": "plumas_ca", "start": "2020-12-31"}, (409, 400)),
    ("round by start, 28 December 2021", RESET, {"region_id": "plumas_ca", "start": "2021-12-28"}, (409, 400)),
    ("round by start, budget 0", RESET, {"region_id": "plumas_ca", "start": "2021-07-22", "budget": 0}, (409,)),
    # plays
    ("play by key, least sure", PLAY, {"region_id": "plumas_ca", "episode": "plumas_ca:22:2021-07-22T05", "player": "least_sure"}, (409,)),
    ("play by key, learned", PLAY, {"region_id": "lytton_bc", "episode": "lytton_bc:22:2021-06-30T20", "player": "learned"}, (409,)),
    ("play by key, the ceiling", PLAY, {"region_id": "plumas_ca", "episode": "plumas_ca:22:2021-07-22T05", "player": "oracle", "ceiling": True}, (409,)),
    ("play by key, with fields", PLAY, {"region_id": "evia_greece", "episode": "evia_greece:22:2021-08-05T10", "player": "random", "fields": True}, (409,)),
    ("play by start, plumas_ca, 22 July 2021", PLAY, {"region_id": "plumas_ca", "start": "2021-07-22", "player": "least_sure"}, (409,)),
    ("play by start, evia_greece, 5 August 2021", PLAY, {"region_id": "evia_greece", "start": "2021-08-05", "player": "latest_modis"}, (409,)),
    ("play by start, lytton_bc, 30 June 2021, the ceiling", PLAY, {"region_id": "lytton_bc", "start": "2021-06-30", "player": "oracle", "ceiling": True}, (409,)),
    ("play by start with a round named", PLAY, {"region_id": "plumas_ca", "start": "2021-07-22", "player": "random", "round_id": "nl-0000000000000000"}, (409,)),
]

# A box of its own over each closed region, asked by centre and span: refused by the box, not by an id.
CUSTOM: list[tuple[str, dict]] = [
    ("box of its own over the Feather River region", {"center_lat": 40.05, "center_lon": -121.18, "span_lon_deg": 0.6, "span_lat_deg": 0.4}),
    ("box of its own over the Lytton region", {"center_lat": 50.23, "center_lon": -121.58, "span_lon_deg": 0.6, "span_lat_deg": 0.4}),
    ("box of its own over the northern Evia region", {"center_lat": 38.86, "center_lon": 23.30, "span_lon_deg": 0.6, "span_lat_deg": 0.4}),
]
PLACES = {"plumas_ca": "Feather River", "lytton_bc": "Lytton", "evia_greece": "Evia"}


@unittest.skipUnless(fa.extract_path("plumas_ca", "modis", 2021).is_file(), "FIRMS rows for plumas_ca 2021 are not cached")
class ClosedWindowsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from backend.tests import test_server_http as http_tests

        http_tests._base()
        cls.req = staticmethod(http_tests._req)
        cls.store = http_tests._SERVER.store

    def _post(self, path: str, body: dict) -> tuple[int, dict]:
        status, _, raw = self.req(path, json.dumps(body).encode())
        try:
            return status, json.loads(raw)
        except ValueError:
            return status, {"error": raw[:200].decode("utf-8", "replace")}

    def test_every_request_on_a_closed_window_is_refused_and_nothing_is_built(self) -> None:
        runs_before = set(self.store._runs)
        plays_before = self.store.next_look.play_computations
        rounds_before = self.store.next_look.held()
        asked = [(label, path, body, want) for label, path, body, want in CASES]
        asked += [(label, RECON, {**box, "start": "2021-07-22", **RUN}, (409,)) for label, box in CUSTOM]
        self.assertEqual(len(asked), 46)
        for label, path, body, want in asked:
            with self.subTest(label=label):
                status, doc = self._post(path, body)
                self.assertNotEqual(status, 200, label)
                self.assertIn(status, want, (label, doc))
                if status == 409:
                    self.assertEqual(doc.get("evidence"), "/api/evidence", label)
                    self.assertTrue(any(name in doc["error"] for name in PLACES.values()), doc["error"])
                    self.assertNotIn("plumas_ca", doc["error"])
        self.assertEqual(set(self.store._runs), runs_before)
        self.assertEqual(self.store.next_look.play_computations, plays_before)
        self.assertEqual(self.store.next_look.held(), rounds_before)

    def test_the_rule_asks_the_runs_own_window(self) -> None:
        """A start late in the closed year whose run begins in the next year is open; one before the year whose window
        cannot be found is closed by the span the run may reach. Neither run is built."""
        import time

        from backend.server_next_look import closed_for
        from backend.server import run_box
        from backend.terrain.live_region import PRESET_BY_ID

        spec = PRESET_BY_ID["plumas_ca"]
        late = self.store.run_window(spec, "2021-12-31T23:00:00Z")
        self.assertEqual(time.strftime("%Y", time.gmtime(late[0])), "2022")
        self.assertIsNone(closed_for(run_box(spec), *late))
        early = self.store.run_window(spec, "2020-12-02T00:00:01Z")
        self.assertIsNotNone(closed_for(run_box(spec), *early))
        self.assertIsNone(closed_for(run_box(spec), *self.store.run_window(spec, "2012-08-10")))

    def test_the_start_lists_mark_the_closed_starts(self) -> None:
        status, _, raw = self.req("/api/runs/starts?region_id=plumas_ca&source=firms")
        starts = json.loads(raw)
        closed = [s["start"] for s in starts["starts"] if s["closed"]]
        self.assertTrue(closed and all(s.startswith("2021") for s in closed))
        self.assertFalse([s["start"] for s in starts["starts"] if s["start"].startswith("2021") and not s["closed"]])
        self.assertIn("Feather River", starts["closed_starts"])
        status, _, raw = self.req("/api/regions")
        regions = json.loads(raw)
        run_starts = [s for p in regions["places"] for f in p["featured_fires"] for s in f["run_starts"]]
        self.assertTrue(all("closed" in s for s in run_starts))
        self.assertTrue(all(s["closed"] for s in run_starts if s["start"].startswith("2021")))


if __name__ == "__main__":
    unittest.main()
