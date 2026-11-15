"""HTTP server integration tests on a local loopback port (no network beyond 127.0.0.1).

Covers real runs, belief frames, start-date lists, observer payloads on every real-run frame, and HTTP request
hardening (loopback CORS checks, non-finite JSON rejection, terrain ETag caching, and parameter type validation).
Tests that need the FIRMS cache or a terrain pack skip with a reason when it is absent.
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
import sys
import threading
import unittest
import urllib.error
import urllib.request

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.firms import archive as fa  # noqa: E402

_SERVER = None
# A run outside the closed windows: the default by rule of the places registry (no 2021 window of a region with a
# recorded test fire is held out, revealed or played; the server refuses one with 409).
OPEN_RUN = {"region_id": "plumas_ca", "source": "firms", "start": "2012-08-10"}


def _base() -> str:
    global _SERVER
    if _SERVER is None:
        from backend.model.reconstruct import DEFAULT_FIELDS_REL_DIR
        from backend.server import IsogonDataStore, IsogonHTTPServer

        store = IsogonDataStore(fields_dir=REPO_ROOT / DEFAULT_FIELDS_REL_DIR)
        httpd = IsogonHTTPServer(("127.0.0.1", 0), store=store)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        _SERVER = httpd
    return f"http://127.0.0.1:{_SERVER.server_address[1]}"


def _req(path: str, body: bytes | None = None, headers: dict[str, str] | None = None) -> tuple[int, dict[str, str], bytes]:
    h = {"Content-Type": "application/json"} if body is not None else {}
    h.update(headers or {})
    req = urllib.request.Request(_base() + path, data=body, method="POST" if body is not None else "GET", headers=h)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def _open_run_cached() -> bool:
    return fa.extract_path("plumas_ca", "viirs-snpp", 2012).is_file()


class RequestHardeningTests(unittest.TestCase):
    def test_nan_infinity_and_wrong_types_answer_400(self) -> None:
        for raw in (
            b'{"region_id": "plumas_ca", "cloud_override": NaN}',
            b'{"region_id": "plumas_ca", "center_lat": Infinity, "center_lon": 1}',
            b'{"region_id": "plumas_ca", "cloud_override": -Infinity}',
            b'{"region_id": "plumas_ca", "holdout_viirs": "false"}',
            b'{"region_id": "plumas_ca", "cloud_override": 50}',
            b'{"region_id": "plumas_ca", "center_lat": [], "center_lon": 1}',
            b'{"region_id": ["plumas_ca"]}',
            b'{"region_id": "plumas_ca", "holdout": "modis"}',
            b'[1, 2]',
        ):
            with self.subTest(body=raw):
                status, _, body = _req("/api/reconstruct", raw)
                self.assertEqual(status, 400, body[:200])
                self.assertIn("error", json.loads(body))

    def test_observer_query_numbers_must_be_finite(self) -> None:
        for q in ("min_frp=nan", "max_zenith=inf", "min_frp=abc", "frame=x"):
            with self.subTest(q=q):
                status, _, body = _req(f"/api/observer?{q}")
                self.assertEqual(status, 400, body[:200])
        status, _, body = _req("/api/observer?frame=3&min_frp=0&max_zenith=90")
        self.assertEqual(status, 200)
        json.loads(body)  # valid JSON, no NaN literal

    def test_cors_only_for_local_pages(self) -> None:
        for origin in ("http://localhost:5188", "http://127.0.0.1:5173", "http://[::1]:5188"):
            with self.subTest(origin=origin):
                _, h, _ = _req("/api/health", headers={"Origin": origin})
                self.assertEqual(h.get("Access-Control-Allow-Origin"), origin)
        _, h, _ = _req("/api/health", headers={"Origin": "https://evil.example"})
        self.assertNotIn("Access-Control-Allow-Origin", h)
        _, h, _ = _req("/api/health")
        self.assertNotIn("Access-Control-Allow-Origin", h)
        # A POST from another origin is refused before anything runs (a text/plain POST skips the preflight).
        status, _, _ = _req("/api/reconstruct", b'{"region_id": "plumas_ca"}',
                            {"Origin": "https://evil.example", "Content-Type": "text/plain"})
        self.assertEqual(status, 403)
        status, h, _ = _req("/api/reconstruct", b'{"region_id": "plumas_ca"}', {"Origin": "http://localhost:5188"})
        self.assertEqual(status, 200)
        self.assertEqual(h.get("Access-Control-Allow-Origin"), "http://localhost:5188")

    def test_terrain_pack_files_are_cacheable(self) -> None:
        status, _, body = _req("/api/reconstruct", b'{"region_id": "plumas_ca"}')
        pack = json.loads(body)["assets"].get("terrain_pack")
        if not pack:
            self.skipTest("no terrain pack for plumas_ca in the cache")
        status, h, data = _req(pack["dem"]["url"])
        self.assertEqual(status, 200)
        self.assertEqual(h.get("Cache-Control"), "public, max-age=86400")
        etag = h.get("ETag")
        self.assertTrue(etag)
        status, h2, data2 = _req(pack["dem"]["url"], headers={"If-None-Match": etag})
        self.assertEqual((status, data2), (304, b""))
        self.assertEqual(h2.get("ETag"), etag)
        _, h3, _ = _req("/api/health")
        self.assertEqual(h3.get("Cache-Control"), "no-store")

    def test_no_response_carries_the_key(self) -> None:
        import os

        fake = "synthetic0server0key0for0tests"
        old = os.environ.get("FIRMS_MAP_KEY")
        os.environ["FIRMS_MAP_KEY"] = fake
        try:
            paths = ["/api/health", "/api/regions", "/api/calendar", "/api/observer?frame=0",
                     "/api/calendar?source=firms&region_id=nowhere", "/api/runs/starts?region_id=nowhere&source=firms"]
            bodies = [_req(p)[2] for p in paths]
            bodies.append(_req("/api/reconstruct", b'{"region_id": "plumas_ca", "source": "firms"}')[2])
            if _open_run_cached():
                bodies.append(_req("/api/calendar?source=firms&region_id=plumas_ca")[2])
        finally:
            if old is None:
                os.environ.pop("FIRMS_MAP_KEY", None)
            else:
                os.environ["FIRMS_MAP_KEY"] = old
        for b in bodies:
            self.assertNotIn(fake.encode(), b)

    def test_rows_csv_needs_start_before_end(self) -> None:
        status, _, body = _req("/api/calendar/rows.csv?region_id=plumas_ca&start=2021-09-01&end=2021-08-01")
        self.assertEqual(status, 400)
        self.assertIn("after start", json.loads(body)["error"])


class RealRunServingTests(unittest.TestCase):
    def setUp(self) -> None:
        if not _open_run_cached():
            self.skipTest("FIRMS rows for plumas_ca 2012 are not cached")

    def test_observer_answers_on_every_frame_of_a_real_run(self) -> None:
        # A run with VIIRS held out plays the passes of the CMR pass list: MODIS passes,
        # and held-out passes of the hidden platforms at their real times (`held_out`, the estimate only, no footprint,
        # geometry from the swath polygon). No frame carries a hidden detection. With nothing hidden the frames carry
        # real Suomi NPP footprints and no held-out pass. The observer answers on every frame of both.
        from backend.firms.cmr_passes import cmr_passes

        for hold in (True, False):
            status, _, body = _req("/api/reconstruct", json.dumps({**OPEN_RUN, "holdout_viirs": hold}).encode())
            self.assertEqual(status, 200)
            run = json.loads(body)
            rid = run["run_id"]
            op = run["observer_passes"]
            frames = op["frames"]
            self.assertEqual(len(frames), 24)
            code_col = op["footprint_schema"].index("sensor_code")
            names = op["sensor_codes"]
            sensors = {p["sensor"] for f in frames for p in f["passes"]}
            held = [f for f in frames if f.get("held_out")]
            for f in frames:
                with self.subTest(hold=hold, frame=f["frame"]):
                    self.assertTrue(f["passes"])                                   # every frame has a pass
                    drawn = {names[str(int(fp[code_col]))] for fp in f["footprints"]}
                    if hold:
                        self.assertFalse([d for d in drawn if not d.startswith("MODIS_")], "a hidden detection is drawn")
                        for p in f["passes"]:
                            if not p["sensor"].startswith("MODIS_"):               # a hidden platform's pass is held out
                                self.assertTrue(p.get("held_out"), p)
                                self.assertEqual(p["footprint_count"], 0)
                                self.assertIn("CMR", p.get("geometry_from", ""))
                        if f.get("held_out"):
                            self.assertTrue(f["epistemic_regime"].endswith("held_out"))
                            self.assertEqual(f["footprints"], [])
                            self.assertIsNone(f.get("detections_in_box"))
                    else:
                        self.assertFalse([p for p in f["passes"] if p.get("held_out")])
            if hold:
                self.assertTrue(held, "no held-out pass of a hidden platform")
                # each held-out frame is a pass of the CMR list: its time lies in that pass's granule span
                t0, t1 = frames[0]["timestamp_utc"][:10], frames[-1]["timestamp_utc"]
                end = (dt.datetime.fromisoformat(t1.replace("Z", "+00:00")) + dt.timedelta(days=1)).strftime("%Y-%m-%d")
                listed = cmr_passes(tuple(op["bbox"]), t0, end)
                for f in held:
                    t = dt.datetime.fromisoformat(f["timestamp_utc"].replace("Z", "+00:00"))
                    plat = f["passes"][0]["sensor"]
                    hit = [p for p in listed if p["platform"] == plat
                           and dt.datetime.fromisoformat(p["time_start"].replace("Z", "+00:00")) - dt.timedelta(seconds=60) <= t
                           <= dt.datetime.fromisoformat(p["time_end"].replace("Z", "+00:00")) + dt.timedelta(seconds=60)]
                    self.assertTrue(hit, f"held-out frame {f['frame']} at {f['timestamp_utc']} is no CMR pass of {plat}")
            else:
                self.assertIn("VIIRS_SNPP", sensors)
                self.assertTrue(any(names[str(int(fp[code_col]))] == "VIIRS_SNPP" for f in frames for fp in f["footprints"]))
            for frame in range(24):
                for sensor in ("all", "modis", "viirs", "VIIRS_SNPP"):
                    with self.subTest(hold=hold, frame=frame, sensor=sensor):
                        status, _, ob = _req(f"/api/observer?frame={frame}&sensor={sensor}&run_id={rid}")
                        self.assertEqual(status, 200, ob[:200])
                        d = json.loads(ob)
                        self.assertEqual(d["frame"], frame)

    def test_belief_frames_are_served_for_real_runs_only(self) -> None:
        status, _, body = _req("/api/reconstruct", json.dumps({**OPEN_RUN, "holdout_viirs": True}).encode())
        run = json.loads(body)
        desc = run["belief_frames"]
        self.assertEqual(desc["url"], f"/api/runs/{run['run_id']}/belief_u8.bin")
        status, h, data = _req(desc["url"])
        self.assertEqual(status, 200)
        self.assertEqual(h.get("Content-Type"), "application/octet-stream")
        grid = desc["grid"]
        self.assertEqual(len(data), desc["steps"] * grid["ny"] * grid["nx"] * 2)
        status, _, body = _req("/api/reconstruct", b'{"region_id": "plumas_ca"}')
        sim_id = json.loads(body)["run_id"]
        status, _, _ = _req(f"/api/runs/{sim_id}/belief_u8.bin")
        self.assertEqual(status, 404)

    def test_real_calendar_lists_run_starts(self) -> None:
        status, _, body = _req("/api/calendar?source=firms&region_id=plumas_ca")
        self.assertEqual(status, 200)
        starts = json.loads(body)["real_run_starts"]
        dates = [s["start"] for s in starts["starts"]]
        self.assertIn("2012-08-10", dates)
        self.assertTrue(all(isinstance(s["label"], str) and s["label"] for s in starts["starts"]))
        self.assertIn("rule", starts)
        status, _, body = _req("/api/runs/starts?region_id=plumas_ca&source=firms")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), starts)
        status, _, _ = _req("/api/runs/starts?region_id=blue_mountains_au&source=firms")
        self.assertEqual(status, 404)
        from backend.model.real_run import real_run_starts
        from backend.terrain.live_region import PRESET_BY_ID

        # The page opens on the model's default (the Dixie Fire), not on the list's first entry.
        self.assertEqual(starts["default_start"], real_run_starts(PRESET_BY_ID["plumas_ca"])["default_start"])
        self.assertIn(starts["default_start"], dates)
        self.assertNotEqual(starts["default_start"], dates[0])
        # No start, label or list field carries a count from the hidden instrument, here or in the regions answer.
        self.assertFalse([s["label"] for s in starts["starts"] if "VIIRS" in s["label"]])
        self.assertFalse([k for s in starts["starts"] for k in s if k.startswith("viirs")])
        self.assertNotIn("labels_from_hidden_rows", starts)
        status, _, body = _req("/api/regions")
        self.assertNotIn("viirs_pixels", body.decode("utf-8"))
        self.assertIn("MODIS", starts["chosen_from"])


class DefaultStartTests(unittest.TestCase):
    def test_default_follows_the_model_and_falls_back_to_most_modis_pixels(self) -> None:
        from backend.server import with_default_start

        # The VIIRS counts here would pick another day: they are taken after the list is made, so they must not
        # choose the default.
        value = {"starts": [{"start": "2012-08-01", "modis_pixels_in_box": 900, "viirs_pixels_in_box": 10},
                            {"start": "2021-07-22", "modis_pixels_in_box": 400, "viirs_pixels_in_box": 5000},
                            {"start": "2021-08-05", "modis_pixels_in_box": 900, "viirs_pixels_in_box": 9000}]}
        d = with_default_start(value, "2021-07-22")
        self.assertEqual(d["default_start"], "2021-07-22")
        self.assertIn("the model's default", d["default_rule"])
        self.assertNotIn("default_start", value)  # the cached list is not changed in place
        for model_default, error, why in ((None, None, "gives no default"), ("2019-01-01", None, "not among"),
                                          ("2021-07-22", "boom", None)):
            with self.subTest(model_default=model_default, error=error):
                d = with_default_start(value, model_default, error)
                if why is None:  # a default in the list still wins even if a later read failed
                    self.assertEqual(d["default_start"], "2021-07-22")
                    continue
                self.assertEqual(d["default_start"], "2012-08-01")  # most MODIS pixels; the earliest of equals
                self.assertIn("most MODIS pixels", d["default_rule"])
                self.assertNotIn("VIIRS", d["default_rule"])
                self.assertIn(why, d["default_rule"])
        d = with_default_start(value, None, "the FIRMS cache is missing")
        self.assertIn("could not be read", d["default_rule"])
        self.assertEqual(with_default_start({"starts": []}, "2021-07-22")["default_start"], None)

    def test_a_start_search_window_past_the_cached_rows_is_read_to_their_end(self) -> None:
        """The last month of the country files reads 30 days into a year only the area API holds; that read stops at
        the end of the cached year instead of failing the place's whole start list. A window that starts in a year
        with no rows still fails."""
        from unittest import mock

        import backend.firms as firms
        import backend.server as server

        asked = []

        def read(box, start, end, platforms=None):
            asked.append((str(start)[:10], str(end)[:10]))
            if str(end)[:4] > "2025" and str(end)[:10] != "2026-01-01":
                raise fa.FirmsCacheMissing("no FIRMS rows are cached for a region in [2026]")
            return [{"row": 1}]

        with mock.patch.object(firms, "read_firms", read):
            self.assertEqual(server.read_rows_to_cache_end((0, 0, 1, 1), "2025-12-01T00:00:00", "2026-01-30T00:00:00"), [{"row": 1}])
            self.assertEqual(asked, [("2025-12-01", "2026-01-30"), ("2025-12-01", "2026-01-01")])
            with self.assertRaises(fa.FirmsCacheMissing):
                server.read_rows_to_cache_end((0, 0, 1, 1), "2026-01-05T00:00:00", "2026-02-04T00:00:00")

    def test_the_start_list_reads_no_retired_constant(self) -> None:
        import inspect

        import backend.server as server

        src = inspect.getsource(server)
        self.assertNotIn("START_MIN_PASSES_EACH", src)
        self.assertNotIn("viirs_overpasses", src)
        self.assertEqual(len(server.start_rule_digest()), 64)


if __name__ == "__main__":
    unittest.main()
