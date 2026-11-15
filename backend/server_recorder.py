"""Record the backend's answers for a page that runs with no backend.

  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/server_recorder.py \\
      --base http://127.0.0.1:8988 --out <folder> [--plan <plan.json>] [--current]

The tool calls a running backend, writes every answer and every asset the answers name into one folder, and an index
the page looks answers up in:

  <folder>/index.json                      entries keyed by method, path with its query sorted, and the body
  <folder>/files/<sha256>.<ext>            one file per distinct answer, named by its content

Without `--plan` it builds the demo path's plan from `GET /api/regions`: the regions, the evidence, the live test's
answer, the fire cube's countries, world layers and yearly layers (the picture of each), the Record's check of every place with each
box place's calendar, each region's calendar and start list, each named fire's box calendar, and for every featured
fire that is not a blind test fire (only each region's busiest with `--busiest-period-only`)
its run held out and then revealed and its run with every satellite (the landing and the Agent part ask for it), the
assets of each run and its readings (`GET /api/sensor-model` for the run, `GET /api/observer` at each of its frames
with the page's default filter), its pass list as a held-out window shows it (`hidden=VIIRS`)
and in full for the reveal, the play of each player the page shows, step by step (the one that reads the hidden rows
with `ceiling`), one round of next look played with the looks of the reference player `least_sure`, taken from
its play, with the round's first step for every square and for letting the pass go (the visitor's first look), and
NASA's picture of the box for each day of its window as the stage asks for it. Rounds and plays are asked with the page's own bodies (`{region_id, start}`, the environment's own tiles
and budget), so the page finds them under the same keys. A
recorded test fire gets its run with every satellite shown on its recorded window and its full pass list; nothing of
it is held out, revealed or played. Run bodies are built as the page builds them (`page_run_body`). Only the files
the index names are kept.

Round ids are random on a live server; each round is renamed `nl-rec-<8 hex>` in every stored answer and key, so the
recorded round replays with one id. The run bodies name no imagery, as the page's do; the server chooses the terrain
pack's imagery by coverage and says which in the answer. Only imagery whose licence allows a copy is stored (USGS NAIP,
public domain; EOxCloudless 2016, CC BY-NC-SA 4.0, with its credit); the rest (Esri World Imagery, published for viewing only, and
what is derived from it) is listed as withheld. For imagery outside the United States, record against a server
started with `--imagery-elsewhere eox_s2cloudless_2016`. The tool ends with exit 1 when a stored file holds the FIRMS
key, `MAP_KEY=` or a local path.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
from pathlib import Path
import sys
import time
from typing import Any, Callable
import urllib.error
import urllib.parse
import urllib.request

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

ESRI_WITHHELD: str = "Esri World Imagery is published for viewing, not for export (docs/sources.md); not stored"
OTHER_WITHHELD: str = "imagery under a licence that does not allow this copy (docs/sources.md); not stored"
# The imagery whose licence allows a copy: the same set as backend.terrain.terrain_pack.PUBLISHABLE_IMAGERY.
PUBLISHABLE_IMAGERY: tuple[str, ...] = ("usgs_naip", "eox_s2cloudless_2016")
# The players the page shows, in its order, and the one asked with `ceiling` (website/src/compare/blocks.ts, PLAYERS
# and SEES_THE_ANSWER; a test holds them equal).
PAGE_PLAYERS: tuple[str, ...] = ("random", "latest_modis", "least_sure", "learned", "oracle")
SEES_THE_ANSWER: str = "oracle"
# The observer reading the page asks for by default (website/src/App.tsx: every sensor, the sensitivity slider at rest).
OBSERVER_DEFAULT: dict[str, str] = {"sensor": "all", "min_frp": "8.4"}
ROUND_PLAYER: str = "least_sure"     # the reference player whose looks the recorded round takes
# The day's picture the stage asks for (website/src/stage/EarthCutawayStage.tsx): the UTC day of the pass on show, that
# pass's satellite (Aqua's on a pass whose detections are hidden), true colour, then false colour.
DAY_PICTURE_PLATFORMS: tuple[str, ...] = ("MODIS_TERRA", "MODIS_AQUA", "VIIRS_SNPP", "VIIRS_NOAA20")
DAY_PICTURE_HIDDEN: str = "MODIS_AQUA"
DAY_PICTURE_KINDS: tuple[str, ...] = ("true_color", "false_color")
RECORDED_WINDOWS_NOTE: str = ("the recorded test fires' runs with every satellite shown are not recorded: such a run "
                              "still runs the scorer on its closed window until the model makes it skip the score "
                              "there; record them with --recorded-windows once it does")
EXT: dict[str, str] = {"application/json": "json", "text/csv": "csv", "image/jpeg": "jpg", "image/png": "png"}
KEPT_HEADERS: tuple[str, ...] = ("X-Row-Count", "Content-Disposition")
FORBIDDEN: tuple[bytes, ...] = (b"MAP_KEY=", b"/Users/", b"/home/", b"isogon-notes")


def canonical(body: Any) -> str:
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def request_key(method: str, path: str, query: dict[str, str] | None = None, body: Any = None) -> str:
    """The index key: METHOD path?sorted query [canonical body]. The page builds the same key from its request."""
    q = urllib.parse.urlencode(sorted((query or {}).items()))
    key = f"{method.upper()} {path}" + (f"?{q}" if q else "")
    return key + (" " + canonical(body) if body is not None else "")


def split_url(url: str) -> tuple[str, dict[str, str]]:
    u = urllib.parse.urlsplit(url)
    return u.path, dict(urllib.parse.parse_qsl(u.query))


def _urls(v: Any) -> list[str]:
    if isinstance(v, str):
        return [v] if v.startswith("/api/runs/") else []
    if isinstance(v, dict):
        return [u for x in v.values() for u in _urls(x)]
    if isinstance(v, list):
        return [u for x in v for u in _urls(x)]
    return []


def page_run_body(region_id: str, start: str, holdout: bool, reveal: bool = False) -> dict[str, Any]:
    """The body of `POST /api/reconstruct` exactly as the page's client builds it for a place, a start and what is
    hidden (the contract's one body for a run request), so a recorded page finds the answer under the same key. Kept
    equal to the page's builder: `cloud_override` null on the real path, `holdout: "viirs"` beside `holdout_viirs`
    when VIIRS is hidden, `reveal` only on the reveal, and no `imagery_source` (the page sends none)."""
    body: dict[str, Any] = {"holdout_viirs": bool(holdout), "cloud_override": None, "source": "firms", "start": start,
                            "region_id": region_id}
    if holdout:
        body["holdout"] = "viirs"
    if reveal:
        body["reveal"] = True
    return body


def least_sure(obs: dict[str, Any]) -> int:
    """The tile where the model is least sure, read from the observation; -1 when no budget is left."""
    if int(obs.get("budget_left", 0)) <= 0:
        return -1
    unsure = obs["estimate"]["per_tile"]["unsure"]
    return int(max(range(len(unsure)), key=lambda i: (unsure[i], -i)))


class Recorder:
    def __init__(self, base: str, out: Path, opener: Callable[..., Any] | None = None,
                 recorded_windows: bool = False, busiest_period_only: bool = False) -> None:
        self.base = base.rstrip("/")
        self.out = Path(out)
        (self.out / "files").mkdir(parents=True, exist_ok=True)
        self.opener = opener or urllib.request.urlopen
        self.entries: dict[str, dict[str, Any]] = {}
        self.parsed: dict[str, Any] = {}
        self.withheld: list[dict[str, str]] = []
        self.rounds: list[dict[str, Any]] = []
        self.plan_run: list[dict[str, Any]] = []
        self.round_ids: dict[str, str] = {}          # live id -> recorded id
        self.plays: list[dict[str, Any]] = []
        # The run with every satellite shown on a recorded test fire's window still runs the scorer on that window
        # until the model lane makes it skip the score there; it is recorded only when asked (--recorded-windows).
        self.recorded_windows = bool(recorded_windows)
        self.recorded_windows_note: str | None = None
        self.plays_note: str | None = None
        # Only each region's first open featured period (its busiest) when asked, to keep the page small
        self.busiest_period_only = bool(busiest_period_only)
        self.periods_left_out: list[str] = []

    # ---- HTTP and storage ----------------------------------------------------------------------------------------

    def _http(self, method: str, path: str, query: dict[str, str] | None, body: Any) -> tuple[int, str, bytes, dict[str, str]]:
        url = self.base + path + ("?" + urllib.parse.urlencode(sorted(query.items())) if query else "")
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json"} if data else {})
        try:
            with self.opener(req, timeout=1800) as r:
                return r.status, r.headers.get("Content-Type", ""), r.read(), dict(r.headers)
        except urllib.error.HTTPError as exc:
            return exc.code, exc.headers.get("Content-Type", ""), exc.read(), dict(exc.headers)

    def _to_live(self, text: str) -> str:
        for live, rec in self.round_ids.items():
            text = text.replace(rec, live)
        return text

    def _to_recorded(self, raw: bytes) -> bytes:
        for live, rec in self.round_ids.items():
            raw = raw.replace(live.encode("utf-8"), rec.encode("utf-8"))
        return raw

    def _store(self, key: str, status: int, ctype: str, raw: bytes, headers: dict[str, str]) -> Any:
        raw = self._to_recorded(raw)
        sha = hashlib.sha256(raw).hexdigest()
        ext = EXT.get(ctype.split(";")[0].strip(), "bin")
        f = self.out / "files" / f"{sha}.{ext}"
        if not f.exists():
            f.write_bytes(raw)
        entry: dict[str, Any] = {"status": status, "content_type": ctype, "file": f"files/{sha}.{ext}", "bytes": len(raw), "sha256": sha}
        kept = {k: headers[k] for k in KEPT_HEADERS if k in headers}
        if kept:
            entry["headers"] = kept
        self.entries[key] = entry
        parsed = json.loads(raw) if ext == "json" else None
        self.parsed[key] = parsed
        return parsed

    def withhold(self, method: str, path: str, why: str) -> None:
        key = request_key(method, path)
        if key not in self.entries:
            self.entries[key] = {"withheld": why}
            self.withheld.append({"key": key, "why": why})

    def fetch(self, method: str, path: str, query: dict[str, str] | None = None, body: Any = None) -> Any:
        """Call and store one request (query and body in recorded ids); the parsed answer, or None for a binary."""
        key = request_key(method, path, query, body)
        if key in self.entries:
            return self.parsed.get(key)
        live_q = {k: self._to_live(str(v)) for k, v in (query or {}).items()}
        live_b = json.loads(self._to_live(canonical(body))) if body is not None else None
        status, ctype, raw, headers = self._http(method, path, live_q or None, live_b)
        self.plan_run.append({"method": method, "path": path, **({"query": query} if query else {}),
                              **({"body": body} if body is not None else {}), "status": status})
        return self._store(key, status, ctype, raw, headers)

    # ---- the pieces of a plan ------------------------------------------------------------------------------------

    def run_with_assets(self, body: dict[str, Any]) -> dict[str, Any] | None:
        ans = self.fetch("POST", "/api/reconstruct", body=body)
        if not isinstance(ans, dict) or "run_id" not in ans:
            return ans
        pack = (ans.get("assets") or {}).get("terrain_pack") or {}
        pack_imagery = ((pack.get("ortho") or {}).get("source")) or "esri_world_imagery"
        context_imagery = (((pack.get("context") or {}).get("ortho") or {}).get("source")) or "esri_world_imagery"
        for url in sorted(set(_urls(ans))):
            path, query = split_url(url)
            name = path.rsplit("/", 1)[-1]
            if name.startswith("satellite."):
                source: str | None = "esri_world_imagery"      # the overview image
            elif "/terrain/" in path and "dem" not in name:
                source = context_imagery if "context" in name else pack_imagery
            else:
                source = None                                  # elevation, the run's fields, exports
            if source is not None and source not in PUBLISHABLE_IMAGERY:
                self.withhold("GET", path, ESRI_WITHHELD if source == "esri_world_imagery" else OTHER_WITHHELD)
            else:
                self.fetch("GET", path, query or None)
        self.record_readings(ans)
        return ans

    def record_readings(self, run: dict[str, Any]) -> None:
        """What the page reads beside a run: the sensor model for the run, and the observer at each of its frames with
        the page's default filter."""
        rid = str(run["run_id"])
        self.fetch("GET", "/api/sensor-model", {"run_id": rid})
        frames = ((run.get("observer_passes") or {}).get("frames") or []) if isinstance(run.get("observer_passes"), dict) else []
        for i in range(len(frames)):
            self.fetch("GET", "/api/observer", {"frame": str(i), **OBSERVER_DEFAULT, "run_id": rid})

    def record_passes(self, region_id: str, run: Any, hidden: bool) -> Any:
        """The pass list over a run's window: for a held-out run as it may be shown (`hidden=VIIRS`) and in full for
        its reveal; for a run with every satellite shown, in full only. The full list's answer is returned."""
        window = (run.get("window") or {}) if isinstance(run, dict) else {}
        first, last = window.get("first_overpass_utc"), window.get("last_overpass_utc")
        if not (first and last):
            return None
        end = (_dt.date.fromisoformat(last[:10]) + _dt.timedelta(days=1)).isoformat()
        q = {"region_id": region_id, "start": first[:10], "end": end}
        if hidden:
            self.fetch("GET", "/api/passes", {**q, "hidden": "VIIRS"})
        return self.fetch("GET", "/api/passes", q)

    def record_day_pictures(self, region_id: str, passes: Any) -> None:
        """NASA's picture of the box for each day of a run's window as the stage asks for it: each satellite that
        passed that day, and Aqua's for a pass whose detections are hidden, in true and false colour. A day the
        world store does not hold is recorded as the route's 404."""
        days: dict[str, set[str]] = {}
        for p in ((passes or {}).get("passes") or []) if isinstance(passes, dict) else []:
            for t in (p.get("time_start"), p.get("time_mid")):
                day = str(t or "")[:10]
                if len(day) == 10:
                    days.setdefault(day, {DAY_PICTURE_HIDDEN})
                    if p.get("platform") in DAY_PICTURE_PLATFORMS:
                        days[day].add(str(p["platform"]))
        for day in sorted(days):
            for plat in sorted(days[day]):
                for kind in DAY_PICTURE_KINDS:
                    self.fetch("GET", "/api/gibs/day", {"region_id": region_id, "day": day, "platform": plat, "kind": kind})

    def record_world(self) -> None:
        """What the page reads beyond the places: the live test's answer, the fire cube's countries, its world layers
        and its yearly layers (the picture of each, which is what the page draws), and the Record's check of every
        place with the calendar of each place that is a box."""
        self.fetch("GET", "/api/live")
        self.fetch("GET", "/api/cube/countries")
        layers = self.fetch("GET", "/api/cube/layers")
        named = (layers or {}).get("layers") if isinstance(layers, dict) else None
        for name, meta in sorted(named.items()) if isinstance(named, dict) else []:
            png = meta.get("png") if isinstance(meta, dict) else None
            if png:
                path, query = split_url(str(png))
                self.fetch("GET", path, query or None)
        years = self.fetch("GET", "/api/cube/years")
        yearly = (years or {}).get("layers") if isinstance(years, dict) else None
        for name, meta in sorted(yearly.items()) if isinstance(yearly, dict) else []:
            png = meta.get("png_route") if isinstance(meta, dict) else None
            if png:
                path, query = split_url(str(png))
                self.fetch("GET", path, query or None)
        checks = self.fetch("GET", "/api/calendar/checks")
        for place in ((checks or {}).get("places") or []) if isinstance(checks, dict) else []:
            if place.get("kind") == "box" and place.get("calendar"):
                path, query = split_url(str(place["calendar"]))
                self.fetch("GET", path, query or None)

    def play_actions(self, episode: dict[str, Any], player: str) -> list[int] | None:
        """The looks a reference player takes on an episode, from its recorded play (None without a play route)."""
        play = self.fetch("POST", "/api/env/next_look/play", body={**episode, "player": player})
        steps = ((play or {}).get("play") or {}).get("steps") if isinstance(play, dict) else None
        return [int(st["chosen_tile"]) for st in steps] if steps else None

    def play_round(self, reset_body: dict[str, Any], policy: Callable[[dict[str, Any]], int], policy_name: str,
                   actions_from: str = "") -> None:
        key = request_key("POST", "/api/env/next_look/reset", body=reset_body)
        if key in self.entries:
            return
        status, ctype, raw, headers = self._http("POST", "/api/env/next_look/reset", None, reset_body)
        self.plan_run.append({"method": "POST", "path": "/api/env/next_look/reset", "body": reset_body, "status": status})
        if status != 200:
            self._store(key, status, ctype, raw, headers)
            return
        live_id = json.loads(raw)["round_id"]
        rec_id = "nl-rec-" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:8]
        self.round_ids[live_id] = rec_id
        obs = self._store(key, status, ctype, raw, headers)["observation"]
        first_obs = obs
        first_action: int | None = None
        line: list[dict[str, int]] = []
        steps = 0
        while True:
            action = policy(obs)
            if first_action is None:
                first_action = int(action)
            line.append({"decision": int(obs["decision"]), "action": int(action)})
            step = self.fetch("POST", "/api/env/next_look/step",
                              body={"round_id": rec_id, "decision": obs["decision"], "action": action})
            steps += 1
            if not isinstance(step, dict) or step.get("done") or step.get("observation") is None:
                break
            obs = step["observation"]
        # The state has one key per round, so it is recorded once, at the end; the reference players may still be
        # computing when the last step answers, and the state carries them once they are ready.
        state_key = request_key("GET", "/api/env/next_look/state", {"round_id": rec_id})
        for _ in range(60):
            st = self.fetch("GET", "/api/env/next_look/state", {"round_id": rec_id})
            if not isinstance(st, dict) or (st.get("end") or {}).get("reference_status") == "ready":
                break
            time.sleep(5)
            self.entries.pop(state_key, None)
            self.parsed.pop(state_key, None)
        first_looks = self.record_first_looks(reset_body, rec_id, first_obs, first_action)
        # `line` is the one path of the round recorded past its first step: a page of recorded answers is on it only
        # while every step it took is the line's step at that decision.
        self.rounds.append({"episode_from": reset_body, "round_id": rec_id, "player": policy_name,
                            "actions_from": actions_from, "steps": steps, "first_looks": first_looks, "line": line})

    def record_first_looks(self, reset_body: dict[str, Any], rec_id: str, obs: dict[str, Any],
                           taken: int | None) -> list[int]:
        """The visitor's first look, whatever it is: the round's first step for every square and for letting the
        pass go, each played on a round of its own on the live server and kept under the recorded round's one id,
        so the page's own request (`{round_id, decision, action}`) finds its answer. Only the first step is kept for
        each; the round's later steps are those of the recorded line."""
        squares = len(obs.get("tile_covered") or ((obs.get("estimate") or {}).get("per_tile") or {}).get("unsure") or [])
        decision = int(obs["decision"])
        done = [] if taken is None else [taken]
        for action in [-1, *range(squares)]:
            if action in done:
                continue
            body = {"round_id": rec_id, "decision": decision, "action": action}
            key = request_key("POST", "/api/env/next_look/step", body=body)
            if key in self.entries:
                done.append(action)
                continue
            status, ctype, raw, _ = self._http("POST", "/api/env/next_look/reset", None, reset_body)
            if status != 200:
                break
            live_id = json.loads(raw)["round_id"]
            self.round_ids[live_id] = rec_id
            status, ctype, raw, headers = self._http("POST", "/api/env/next_look/step", None, {**body, "round_id": live_id})
            self.plan_run.append({"method": "POST", "path": "/api/env/next_look/step", "body": body, "status": status,
                                  "first_look": True})
            self._store(key, status, ctype, raw, headers)
            done.append(action)
        return sorted(done)

    def record_plays(self, episode: dict[str, Any]) -> None:
        """The play of each player the page shows on one episode, step by step (`POST /api/env/next_look/play`), with
        the page's body: the episode's own keys and the player, `ceiling` for the one that reads the hidden rows.
        Skipped, and said so, when the backend has no play yet."""
        listing = self.fetch("GET", "/api/env/next_look/players")
        if not isinstance(listing, dict) or "players" not in listing:
            self.plays_note = "the backend serves no step by step play (GET /api/env/next_look/players did not answer)"
            return
        for pid in PAGE_PLAYERS:
            body = {**episode, "player": pid, **({"ceiling": True} if pid == SEES_THE_ANSWER else {})}
            self.fetch("POST", "/api/env/next_look/play", body=body)
            self.plays.append({"episode_from": episode, "player": pid})

    # ---- the default plan ----------------------------------------------------------------------------------------

    def record_default(self, current: bool = False, also_periods: tuple[str, ...] = ()) -> None:
        self.fetch("GET", "/api/health")
        regions = self.fetch("GET", "/api/regions")
        self.fetch("GET", "/api/evidence")
        self.fetch("GET", "/api/sensor-model")          # the page's sensor curves before any run is on screen
        self.record_world()
        for place in (regions or {}).get("places", []):
            if place.get("rows") != "firms":
                continue
            rid = place["id"]
            self.fetch("GET", "/api/calendar", {"source": "firms", "region_id": rid})
            self.fetch("GET", "/api/runs/starts", {"region_id": rid, "source": "firms"})
            if current:
                self.fetch("GET", "/api/calendar/current", {"source": "firms", "region_id": rid})
            for f in place.get("named_fires", []):
                path, query = split_url(f["calendar"])
                self.fetch("GET", path, query)
            open_periods = 0
            for fire in place.get("featured_fires", []):
                start = fire["default_start"]
                if fire.get("blind_test_fire"):
                    # A recorded test fire: its run with every satellite shown on its recorded window, nothing held
                    # out, revealed or played (the record itself is GET /api/evidence). Only when asked for.
                    if not self.recorded_windows:
                        self.recorded_windows_note = RECORDED_WINDOWS_NOTE
                        continue
                    shown = self.run_with_assets(page_run_body(rid, start, holdout=False))
                    self.record_passes(rid, shown, hidden=False)
                    continue
                open_periods += 1
                if self.busiest_period_only and open_periods > 1 and str(fire.get("id")) not in also_periods:
                    self.periods_left_out.append(str(fire.get("id") or f"{rid}:{start}"))
                    continue
                held = self.run_with_assets(page_run_body(rid, start, holdout=True))
                self.run_with_assets(page_run_body(rid, start, holdout=True, reveal=True))
                self.run_with_assets(page_run_body(rid, start, holdout=False))
                full = self.record_passes(rid, held, hidden=True)
                self.record_day_pictures(rid, full)
                episode = {"region_id": rid, "start": start}     # the page's reset body: the environment's tiles and budget
                self.record_plays(episode)
                actions = self.play_actions(episode, ROUND_PLAYER)
                if actions is not None:
                    self.play_round(episode, lambda obs, a=actions: a[obs["decision"]] if obs["decision"] < len(a) else -1,
                                    ROUND_PLAYER, actions_from="POST /api/env/next_look/play, the reference player's own looks")
                else:
                    self.play_round(episode, least_sure, "least_sure_every_look",
                                    actions_from="this tool: the least sure tile at every look while the budget lasts")

    def record_plan(self, plan: dict[str, Any]) -> None:
        for r in plan.get("requests", []):
            if "round" in r:
                self.play_round(r["round"], least_sure, "least_sure")
            elif r.get("method", "GET").upper() == "POST" and r.get("path") == "/api/reconstruct":
                self.run_with_assets(r["body"])
            else:
                self.fetch(r.get("method", "GET").upper(), r["path"], r.get("query"), r.get("body"))

    # ---- the index and the final check ---------------------------------------------------------------------------

    def write_index(self) -> Path:
        health = self.parsed.get(request_key("GET", "/api/health")) or {}
        doc = {
            "version": 1,
            "recorded_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "backend": {k: health.get(k) for k in ("api_version", "schema_version", "downloaded_firms_rows") if k in health},
            "key_rule": "METHOD + ' ' + path + ('?' + query sorted by name, form encoded, if any) + (' ' + body as canonical JSON, if any)",
            "canonical_json": "sort_keys, separators ',' and ':', no ASCII escaping",
            "entries": dict(sorted(self.entries.items())),
            "rounds": self.rounds,
            "plays": self.plays,
            **({"recorded_windows_note": self.recorded_windows_note} if self.recorded_windows_note else {}),
            **({"plays_note": self.plays_note} if self.plays_note else {}),
            **({"periods_left_out": {"why": "only each region's busiest open period was recorded (--busiest-period-only)",
                                     "periods": self.periods_left_out}} if self.periods_left_out else {}),
            "withheld": self.withheld,
            "plan": self.plan_run,
        }
        path = self.out / "index.json"
        path.write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")
        # only what the index names is kept (an answer replaced while waiting, such as a round's state, goes)
        named = {e["file"] for e in self.entries.values() if "file" in e}
        for f in sorted((self.out / "files").iterdir()):
            if f"files/{f.name}" not in named:
                f.unlink()
        return path

    def check(self, key: str) -> list[str]:
        """Files holding the key, MAP_KEY= or a local path (empty when the folder is clean)."""
        bad = []
        needles = FORBIDDEN + ((key.encode("utf-8"),) if key else ())
        for f in sorted(self.out.rglob("*")):
            if f.is_file():
                b = f.read_bytes()
                if any(n in b for n in needles):
                    bad.append(str(f.relative_to(self.out)))
        return bad


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Record the backend's answers for a page with no backend.")
    ap.add_argument("--base", default="http://127.0.0.1:8988")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--plan", type=Path, default=None, help="a plan file; without it the demo path's plan is built")
    ap.add_argument("--current", action="store_true", help="also record this month so far (live area API answers)")
    ap.add_argument("--recorded-windows", action="store_true",
                    help="also record each recorded test fire's run with every satellite shown (only once that run "
                         "no longer scores its closed window)")
    ap.add_argument("--busiest-period-only", action="store_true",
                    help="record only each region's first open featured period, its busiest, and list the others")
    ap.add_argument("--also-period", action="append", default=[],
                    help="a featured period recorded even with --busiest-period-only (its id, such as okefenokee_ga:2017-05)")
    args = ap.parse_args(argv)
    rec = Recorder(args.base, args.out, recorded_windows=args.recorded_windows,
                   busiest_period_only=args.busiest_period_only)
    t0 = time.time()
    if args.plan is not None:
        rec.record_plan(json.loads(args.plan.read_text(encoding="utf-8")))
    else:
        rec.record_default(current=args.current, also_periods=tuple(args.also_period))
    index = rec.write_index()
    from backend.firms.archive import _map_key

    bad = rec.check(_map_key())
    stored = [e for e in rec.entries.values() if "file" in e]
    print(json.dumps({"index": str(index.name), "entries": len(rec.entries), "stored": len(stored),
                      "withheld": len(rec.withheld), "rounds": len(rec.rounds), "plays": len(rec.plays),
                      "periods_left_out": rec.periods_left_out,
                      "bytes": sum(e["bytes"] for e in stored), "seconds": round(time.time() - t0, 1),
                      "not_ok": [k for k, e in rec.entries.items() if e.get("status", 200) != 200],
                      "files_failing_the_check": bad}, indent=1))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(_main())
