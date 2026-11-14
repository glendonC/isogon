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
        if u.path == "/api/env/next_look/players":
            return js({"players": [{"id": "least_sure", "reads": "the observation"}, {"id": "constant", "reads": "nothing"},
                                   {"id": "oracle", "reads": "the hidden rows"}]})
        if u.path == "/api/env/next_look/play":
            return js({"play_id": "play-" + body["player"],
                       "play": {"player": {"id": body["player"]}, "steps": [{"chosen_tile": -1}, {"chosen_tile": 2}]}})
        if u.path == "/api/env/next_look/state":
            return js({"round_id": LIVE_ROUND, "done": self.decision >= 2, "end": {"reference_status": "ready"}})
        return js({"path": u.path})

    def _obs(self) -> dict:
        return {"decision": self.decision, "budget_left": 2 - self.decision,
                "estimate": {"per_tile": {"unsure": [0.1, 0.9, 0.2, 0.0]}}}


class _PackStandIn:
    """A backend whose one run holds a terrain pack of the given imagery and a context of the given imagery."""

    def __init__(self, pack_source: str, context_source: str) -> None:
        self.pack_source, self.context_source = pack_source, context_source

    def __call__(self, req, timeout=None):
        u = urllib.parse.urlsplit(req.full_url)
        if u.path == "/api/reconstruct":
            base = "/api/runs/r/terrain/"
            p = "" if self.pack_source == "esri_world_imagery" else f"{self.pack_source}_"
            c = "" if self.pack_source == "esri_world_imagery" else f"{self.pack_source}_"
            ans = {"run_id": "r", "assets": {
                "satellite_url": "/api/runs/r/satellite.jpg",
                "terrain_pack": {"dem": {"url": f"{base}{p}dem_1024_f32.bin"},
                                 "ortho": {"url": f"{base}{p}ortho_8192.jpg", "source": self.pack_source},
                                 "aux": {"url": f"{base}{p}aux_2048.png"},
                                 "context": {"dem": {"url": f"{base}{c}context_dem_1024_f32.bin"},
                                             "ortho": {"url": f"{base}{c}context_ortho_4096.jpg",
                                                       "source": self.context_source}}}}}
            return _Reply(200, "application/json", json.dumps(ans).encode())
        return _Reply(200, "application/octet-stream", b"\x00\x01")


class PublishableImageryTests(unittest.TestCase):
    def kept(self, pack_source: str, context_source: str) -> dict[str, bool]:
        with tempfile.TemporaryDirectory() as tmp:
            rec = Recorder("http://stand-in", Path(tmp), opener=_PackStandIn(pack_source, context_source))
            rec.run_with_assets({"region_id": "x", "source": "firms", "start": "2012-08-10"})
            return {k.split("/terrain/")[-1].split("/")[-1]: "file" in e for k, e in rec.entries.items() if k.startswith("GET ")}

    def test_the_set_is_the_pack_modules(self) -> None:
        from backend.server_recorder import PUBLISHABLE_IMAGERY
        from backend.terrain.terrain_pack import PUBLISHABLE_IMAGERY as PACK_SET

        self.assertEqual(PUBLISHABLE_IMAGERY, PACK_SET)

    def test_publishable_imagery_is_stored_and_the_rest_withheld(self) -> None:
        for source in ("usgs_naip", "eox_s2cloudless_2016"):
            got = self.kept(source, source)
            self.assertEqual(got, {"satellite.jpg": False, f"{source}_dem_1024_f32.bin": True,
                                   f"{source}_ortho_8192.jpg": True, f"{source}_aux_2048.png": True,
                                   f"{source}_context_dem_1024_f32.bin": True, f"{source}_context_ortho_4096.jpg": True},
                             source)
        got = self.kept("esri_world_imagery", "esri_world_imagery")
        self.assertEqual(got, {"satellite.jpg": False, "dem_1024_f32.bin": True, "ortho_8192.jpg": False, "aux_2048.png": False,
                               "context_dem_1024_f32.bin": True, "context_ortho_4096.jpg": False})
        # a context of another source than its pack is judged by its own source
        got = self.kept("usgs_naip", "esri_world_imagery")
        self.assertEqual((got["usgs_naip_ortho_8192.jpg"], got["usgs_naip_context_ortho_4096.jpg"]), (True, False))


class PagePlayersTests(unittest.TestCase):
    def test_the_players_are_the_pages(self) -> None:
        import re

        from backend.server_recorder import PAGE_PLAYERS, SEES_THE_ANSWER

        src = (REPO_ROOT / "website" / "src" / "compare" / "blocks.ts").read_text(encoding="utf-8")
        block = src.split("export const PLAYERS", 1)[1].split("];", 1)[0]
        self.assertEqual(tuple(re.findall(r"key: '([a-z_]+)'", block)), PAGE_PLAYERS)
        self.assertIn(f"export const SEES_THE_ANSWER = '{SEES_THE_ANSWER}';", src)


class RecorderTests(unittest.TestCase):
    def test_the_default_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            backend = StandIn()
            rec = Recorder("http://stand.in", Path(tmp), opener=backend, recorded_windows=True)
            rec.record_default()
            rec.write_index()
            index = json.loads((Path(tmp) / "index.json").read_text())
            entries = index["entries"]
            # keys: sorted query, canonical body
            self.assertIn("GET /api/calendar?region_id=plumas_ca&source=firms", entries)
            # run bodies as the page's client builds them (one body for a run request)
            held = 'POST /api/reconstruct {"cloud_override":null,"holdout":"viirs","holdout_viirs":true,"region_id":"plumas_ca","source":"firms","start":"2012-08-10"}'
            self.assertIn(held, entries)
            revealed = held.replace('"region_id":"plumas_ca",', '"region_id":"plumas_ca","reveal":true,')
            self.assertIn(revealed, entries)
            # the blind test fire: its run with every satellite shown, and nothing held out, revealed or played
            closed = [(path, b) for _, path, b in backend.seen if (b or {}).get("start") == "2021-07-20"]
            self.assertEqual([path for path, _ in closed], ["/api/reconstruct"])
            self.assertEqual((closed[0][1]["holdout_viirs"], "holdout" in closed[0][1], "reveal" in closed[0][1]), (False, False, False))
            # imagery for viewing only is withheld, elevation is stored
            self.assertIn("withheld", entries["GET /api/runs/run_2012-08-10/satellite.jpg"])
            self.assertIn("withheld", entries["GET /api/runs/run_2012-08-10/terrain/ortho_8192.jpg"])
            self.assertIn("file", entries["GET /api/runs/run_2012-08-10/terrain/dem_1024_f32.bin"])
            # the round's id is renamed everywhere, in keys and in stored answers, and the round takes the looks of the
            # reference player of its name, from that player's play
            rid = index["rounds"][0]["round_id"]
            self.assertTrue(rid.startswith("nl-rec-"))
            self.assertEqual((index["rounds"][0]["player"], index["rounds"][0]["actions_from"][:30]),
                             ("least_sure", "POST /api/env/next_look/play, "))
            self.assertIn(request_key("POST", "/api/env/next_look/step", body={"action": -1, "decision": 0, "round_id": rid}), entries)
            self.assertIn(request_key("POST", "/api/env/next_look/step", body={"action": 2, "decision": 1, "round_id": rid}), entries)
            # the pass list as a held-out window shows it, and in full for the reveal
            passes = [k for k in entries if k.startswith("GET /api/passes?")]
            self.assertEqual(len(passes), 2)
            self.assertEqual(sum("hidden=VIIRS" in k for k in passes), 1)
            # without --recorded-windows, nothing of the test fire is asked at all
            with tempfile.TemporaryDirectory() as tmp2:
                quiet = StandIn()
                plain = Recorder("http://stand.in", Path(tmp2), opener=quiet)
                plain.record_default()
                self.assertFalse(any((b or {}).get("start") == "2021-07-20" for _, _, b in quiet.seen))
                self.assertIn("recorded_windows_note", json.loads(Path(plain.write_index()).read_text()))
            # every stored file is one the index names
            named = {e["file"] for e in entries.values() if "file" in e}
            self.assertEqual({f"files/{f.name}" for f in (Path(tmp) / "files").iterdir()}, named)
            text = "".join(p.read_text(errors="replace") for p in (Path(tmp) / "files").iterdir()) + json.dumps(index)
            self.assertNotIn(LIVE_ROUND, text)
            # the play of each player the page shows, with the page's body; only the one that reads the hidden rows
            # is asked with ceiling; the round is reset with the page's body too
            plays = [b for m, path, b in backend.seen if path == "/api/env/next_look/play"]
            self.assertEqual([b["player"] for b in plays], ["random", "latest_modis", "least_sure", "learned", "oracle"])
            self.assertEqual([b.get("ceiling") for b in plays if b["player"] == "oracle"], [True])
            self.assertFalse(any(b.get("ceiling") for b in plays if b["player"] != "oracle"))
            self.assertIn('POST /api/env/next_look/play {"player":"least_sure","region_id":"plumas_ca","start":"2012-08-10"}', entries)
            self.assertIn('POST /api/env/next_look/play {"ceiling":true,"player":"oracle","region_id":"plumas_ca","start":"2012-08-10"}', entries)
            self.assertIn('POST /api/env/next_look/reset {"region_id":"plumas_ca","start":"2012-08-10"}', entries)
            self.assertEqual(rec.check("not-in-any-file"), [])
            # a stored file holding the key is flagged
            (Path(tmp) / "files" / "planted.json").write_text('{"u": "x?MAP_KEY=abc"}')
            self.assertEqual(rec.check(""), ["files/planted.json"])


if __name__ == "__main__":
    unittest.main()
