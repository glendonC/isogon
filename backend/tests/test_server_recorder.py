"""The recorder for a page with no backend, against a stand-in backend written in the test (no real answer is used).

What it must do: key every answer by method, path with its query sorted and the body's canonical JSON; never run,
hold out or play a blind test fire; withhold imagery published for viewing only; rename a round's random id the same
way in every stored answer and key; and flag a stored file that holds the key or a local path.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.parse

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.server_recorder import Recorder, request_key  # noqa: E402

LIVE_ROUND = "nl-0123456789abcdef"


class _Reply(io.BytesIO):
    def __init__(self, status: int, ctype: str, body: bytes) -> None:
        super().__init__(body)
        self.status = status
        self.headers = {"Content-Type": ctype}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class StandIn:
    """A tiny backend: one place, a featured fire and a blind test fire, a run with three assets, a two-look round."""

    def __init__(self) -> None:
        self.seen: list[tuple[str, str, dict | None]] = []
        self.decision = 0

    def __call__(self, req, timeout=None):
        u = urllib.parse.urlsplit(req.full_url)
        body = json.loads(req.data) if req.data else None
        self.seen.append((req.get_method(), u.path + ("?" + u.query if u.query else ""), body))
        js = lambda d: _Reply(200, "application/json", json.dumps(d).encode())  # noqa: E731
        if u.path == "/api/regions":
            return js({"places": [{"id": "plumas_ca", "rows": "firms", "country": "United States", "named_fires": [],
                                   "featured_fires": [
                                       {"id": "plumas_ca:2012-08", "default_start": "2012-08-10", "blind_test_fire": False},
                                       {"id": "plumas_ca:2021-07", "default_start": "2021-07-20", "blind_test_fire": True}]}]})
        if u.path == "/api/reconstruct":
            rid = "run_" + body["start"]
            return js({"run_id": rid, "window": {"first_overpass_utc": "2012-08-10T05:00:00Z", "last_overpass_utc": "2012-08-14T20:00:00Z"},
                       "assets": {"satellite_url": f"/api/runs/{rid}/satellite.jpg",
                                  "terrain_pack": {"ortho": {"url": f"/api/runs/{rid}/terrain/ortho_8192.jpg", "source": "esri_world_imagery"},
                                                   "dem": {"url": f"/api/runs/{rid}/terrain/dem_1024_f32.bin"}}}})
        if u.path.startswith("/api/runs/"):
            return _Reply(200, "application/octet-stream", b"\x00\x01")
        if u.path == "/api/env/next_look/reset":
            self.decision = 0
            return js({"round_id": LIVE_ROUND, "observation": self._obs()})
        if u.path == "/api/env/next_look/step":
            assert body["round_id"] == LIVE_ROUND
            self.decision += 1
            done = self.decision >= 2
            return js({"round_id": LIVE_ROUND, "done": done, "observation": None if done else self._obs(),
                       **({"end": {"reference_status": "ready"}} if done else {})})
        if u.path == "/api/env/next_look/state":
            return js({"round_id": LIVE_ROUND, "done": self.decision >= 2, "end": {"reference_status": "ready"}})
        return js({"path": u.path})

    def _obs(self) -> dict:
        return {"decision": self.decision, "budget_left": 2 - self.decision,
                "estimate": {"per_tile": {"unsure": [0.1, 0.9, 0.2, 0.0]}}}


class RecorderTests(unittest.TestCase):
    def test_the_default_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            backend = StandIn()
            rec = Recorder("http://stand.in", Path(tmp), opener=backend)
            rec.record_default()
            rec.write_index()
            index = json.loads((Path(tmp) / "index.json").read_text())
            entries = index["entries"]
            # keys: sorted query, canonical body
            self.assertIn("GET /api/calendar?region_id=plumas_ca&source=firms", entries)
            held = request_key("POST", "/api/reconstruct", body={"holdout_viirs": True, "imagery_source": "usgs_naip",
                                                                 "region_id": "plumas_ca", "source": "firms", "start": "2012-08-10"})
            self.assertIn(held, entries)
            revealed = request_key("POST", "/api/reconstruct", body={"holdout_viirs": True, "imagery_source": "usgs_naip",
                                                                     "region_id": "plumas_ca", "reveal": True, "source": "firms",
                                                                     "start": "2012-08-10"})
            self.assertIn(revealed, entries)
            # the blind test fire is never run or played
            self.assertFalse(any((b or {}).get("start") == "2021-07-20" for _, _, b in backend.seen))
            # imagery for viewing only is withheld, elevation is stored
            self.assertIn("withheld", entries["GET /api/runs/run_2012-08-10/satellite.jpg"])
            self.assertIn("withheld", entries["GET /api/runs/run_2012-08-10/terrain/ortho_8192.jpg"])
            self.assertIn("file", entries["GET /api/runs/run_2012-08-10/terrain/dem_1024_f32.bin"])
            # the round's id is renamed everywhere, in keys and in stored answers, and the least sure tile is looked at
            rid = index["rounds"][0]["round_id"]
            self.assertTrue(rid.startswith("nl-rec-"))
            self.assertIn(request_key("POST", "/api/env/next_look/step", body={"action": 1, "decision": 0, "round_id": rid}), entries)
            text = "".join(p.read_text(errors="replace") for p in (Path(tmp) / "files").iterdir()) + json.dumps(index)
            self.assertNotIn(LIVE_ROUND, text)
            self.assertEqual(rec.check("not-in-any-file"), [])
            # a stored file holding the key is flagged
            (Path(tmp) / "files" / "planted.json").write_text('{"u": "x?MAP_KEY=abc"}')
            self.assertEqual(rec.check(""), ["files/planted.json"])


if __name__ == "__main__":
    unittest.main()
