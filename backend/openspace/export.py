"""Write an OpenSpace scene folder from one real Isogon run with VIIRS hidden.

    uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.openspace.export \\
        --backend http://127.0.0.1:8788 --region plumas_ca --out <folder>

What it reads, in this order, and nothing else:
  1. GET  /api/runs/starts?region_id=<id>             the region's default start (unless --start is given)
  2. POST /api/reconstruct (source firms, holdout_viirs) the held-out run; every key the scorer wrote is removed
                                                       before anything is written from it
  3. GET  <belief_frames.url>                          the estimate between passes, 375 m cells
  4. GET  /api/passes                                  pass times; the swath polygons come from the CMR pass
                                                       files through backend.firms.cmr_passes
  -- every pre-reveal file is written here --
  5. POST /api/reconstruct (the same body, "reveal": true)  the hidden VIIRS detections, written last

The scene loads in OpenSpace 0.21.3 and 0.22 (profile format 1.4, no feature that arrived in 0.22).
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any, Callable, Iterable, Protocol
import urllib.parse
import urllib.request

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from backend.firms import cmr_passes as cmr  # noqa: E402  (the reader of the CMR pass files)
from backend.openspace import geo  # noqa: E402

TEMPLATE_ASSET: Path = _REPO_ROOT / "openspace" / "scene" / "scene.asset"
GLOBE: str = "Earth"
PROFILE_VERSION: dict[str, int] = {"major": 1, "minor": 4}   # OpenSpace 0.21.3 writes 1.4, 0.22 writes 1.5

COLOR_MODIS: str = "#ff8c1a"
COLOR_VIIRS: str = "#fff1a8"
COLOR_LOCATOR: str = "#ffffff"
INSTRUMENT_OF: dict[str, str] = {"MODIS_TERRA": "MODIS", "MODIS_AQUA": "MODIS", "VIIRS_SNPP": "VIIRS",
                                 "VIIRS_NOAA20": "VIIRS", "VIIRS_NOAA21": "VIIRS"}
PLATFORM_NAME: dict[str, str] = {"MODIS_TERRA": "Terra", "MODIS_AQUA": "Aqua", "VIIRS_SNPP": "Suomi NPP",
                                 "VIIRS_NOAA20": "NOAA-20", "VIIRS_NOAA21": "NOAA-21"}
SCHEDULER_GROUP: dict[str, int] = {"passes": 7101, "modis": 7102, "estimate": 7103, "reveal": 7104}

# Heights above the ground, in metres, for GeoJSON (it cannot be clamped to the terrain).
FOOTPRINT_HEIGHT_M: float = 30.0
SWATH_HEIGHT_M: float = 500.0
FOOTPRINT_MARGIN_DEG: float = 0.05   # footprint images reach this far past the grid (about 4 to 5 km)

# The show. Real seconds per part, camera altitude in metres, and how long the camera flies.
CAMERA_EARTH_M: float = 20_000_000.0
CAMERA_PASSES_M: float = 4_000_000.0
CAMERA_FIRE_M: float = 120_000.0
PASSES_HOURS: float = 30.0          # sim hours the passes part plays
CAPTION_POSITION: tuple[float, float, float] = (0.0, -0.78, -2.0)
CAPTION_SCALE: float = 0.55


class Backend(Protocol):
    def get_json(self, path: str, query: dict[str, str] | None = None) -> Any: ...
    def post_json(self, path: str, body: dict[str, Any]) -> Any: ...
    def get_bytes(self, path: str) -> bytes: ...


class HttpBackend:
    """The backend's routes over HTTP. It only reads."""

    def __init__(self, base: str, timeout_s: float = 600.0) -> None:
        self.base = base.rstrip("/")
        self.timeout_s = timeout_s
        self.requests: list[dict[str, Any]] = []

    def _open(self, req: urllib.request.Request) -> bytes:
        with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
            return resp.read()

    def get_json(self, path: str, query: dict[str, str] | None = None) -> Any:
        url = self.base + path + ("?" + urllib.parse.urlencode(query) if query else "")
        self.requests.append({"method": "GET", "url": url})
        return json.loads(self._open(urllib.request.Request(url)))

    def post_json(self, path: str, body: dict[str, Any]) -> Any:
        self.requests.append({"method": "POST", "url": self.base + path, "body": body})
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode("utf-8"),
                                     headers={"Content-Type": "application/json"}, method="POST")
        return json.loads(self._open(req))

    def get_bytes(self, path: str) -> bytes:
        self.requests.append({"method": "GET", "url": self.base + path})
        return self._open(urllib.request.Request(self.base + path))


# Time


def parse_utc(text: str) -> dt.datetime:
    t = text.strip().replace("Z", "")
    if len(t) == 10:
        return dt.datetime.fromisoformat(t).replace(tzinfo=dt.timezone.utc)
    return dt.datetime.fromisoformat(t).replace(tzinfo=dt.timezone.utc)


def os_time(t: dt.datetime) -> str:
    """OpenSpace's time string: ISO without a zone, UTC assumed (openspace.time.setTime)."""
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def utc(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# The scorer's keys


def scorer_paths(resp: dict[str, Any]) -> list[str]:
    """Every payload path the scorer wrote, as the run itself declares them, plus ``blind_test`` always."""
    hidden = resp.get("hidden_rows") or {}
    paths = {"blind_test"}
    for key in ("payload_keys_from_the_scorer", "withheld_until_reveal"):
        for p in hidden.get(key) or []:
            paths.add(str(p))
    for name in (resp.get("metrics") or {}).get("from_hidden_rows") or []:
        paths.add(f"metrics.{name}")
    return sorted(paths)


def without_scorer(resp: dict[str, Any]) -> dict[str, Any]:
    """A copy of a held-out response with every key the scorer wrote removed. Pre-reveal files come from this."""
    out = copy.deepcopy(resp)
    for path in scorer_paths(resp):
        node: Any = out
        parts = path.split(".")
        for p in parts[:-1]:
            node = node.get(p) if isinstance(node, dict) else None
            if node is None:
                break
        if isinstance(node, dict):
            node.pop(parts[-1], None)
    return out


# Lua


class LuaExpr:
    """A Lua expression written as is, such as asset.resource("data/x.geojson")."""

    def __init__(self, text: str) -> None:
        self.text = text


def lua_str(s: str) -> str:
    out = ['"']
    for ch in s:
        if ch == "\\":
            out.append("\\\\")
        elif ch == '"':
            out.append('\\"')
        elif ch == "\n":
            out.append("\\n")
        elif ord(ch) < 32:
            out.append(f"\\{ord(ch):03d}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def lua(value: Any, indent: int = 0) -> str:
    pad, inner = "  " * indent, "  " * (indent + 1)
    if isinstance(value, LuaExpr):
        return value.text
    if value is None:
        return "nil"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("no infinite numbers in Lua output")
        return repr(value)
    if isinstance(value, str):
        return lua_str(value)
    if isinstance(value, (list, tuple)):
        if not value:
            return "{}"
        if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in value):
            return "{ " + ", ".join(lua(v) for v in value) + " }"
        return "{\n" + "".join(f"{inner}{lua(v, indent + 1)},\n" for v in value) + pad + "}"
    if isinstance(value, dict):
        if not value:
            return "{}"
        rows = []
        for k, v in value.items():
            if not k.isidentifier():
                raise ValueError(f"Lua key {k!r} is not a plain name")
            rows.append(f"{inner}{k} = {lua(v, indent + 1)},\n")
        return "{\n" + "".join(rows) + pad + "}"
    raise TypeError(f"cannot write {type(value).__name__} as Lua")


def set_prop(uri: str, on: bool) -> str:
    return f"openspace.setPropertyValueSingle('{uri}', {'true' if on else 'false'})"


def geojson_uri(layer_id: str) -> str:
    return f"Scene.{GLOBE}.Renderable.GeographicOverlays.{layer_id}.Enabled"


def image_uri(layer_id: str) -> str:
    return f"Scene.{GLOBE}.Renderable.Layers.ColorLayers.{layer_id}.Enabled"


def caption_uri(caption_id: str) -> str:
    return f"ScreenSpace.{caption_id}.Enabled"


# Files


def dump_json(obj: Any) -> bytes:
    return (json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("utf-8")


def feature(ring: list[list[float]], props: dict[str, Any], height_m: float | None) -> dict[str, Any]:
    coords = [[x, y, height_m] for x, y in ring] if height_m is not None else ring
    return {"type": "Feature", "properties": props, "geometry": {"type": "Polygon", "coordinates": [coords]}}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}


def wrap(text: str, font: ImageFont.FreeTypeFont, max_px: float) -> list[str]:
    out, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if cur and font.getlength(trial) > max_px:
            out.append(cur)
            cur = word
        else:
            cur = trial
    if cur:
        out.append(cur)
    return out


def caption_png(paragraphs: list[str], width: int = 2400) -> bytes:
    """A caption as an image: light text on a dark band with square corners (Pillow's own font). Every caption
    has the same width, so text is the same size on screen; long lines wrap."""
    size, gap, pad = 64, 22, 34
    font = ImageFont.load_default(size=size)
    lines = [ln for p in paragraphs for ln in wrap(p, font, width - 2 * pad - 16)]
    height = pad * 2 + len(lines) * size + (len(lines) - 1) * gap
    img = Image.new("RGBA", (width, height), (10, 13, 19, 196))
    draw = ImageDraw.Draw(img)
    y = pad
    for line in lines:
        draw.text((pad + 8, y), line, font=font, fill=(243, 244, 246, 255))
        y += size + gap
    return geo.png_bytes(np.asarray(img, dtype=np.uint8))


class SceneWriter:
    """Collects the scene's files in memory with their stage, then writes them and the manifest."""

    def __init__(self) -> None:
        self.files: dict[str, tuple[bytes, str, str]] = {}

    def add(self, rel: str, data: bytes, stage: str, holds: str) -> None:
        if rel in self.files:
            raise ValueError(f"file written twice: {rel}")
        self.files[rel] = (data, stage, holds)

    def digest(self, stage: str) -> str:
        h = hashlib.sha256()
        for rel in sorted(self.files):
            data, st, _ = self.files[rel]
            if st == stage:
                h.update(rel.encode("utf-8") + b"\0" + hashlib.sha256(data).hexdigest().encode("ascii") + b"\n")
        return h.hexdigest()

    def write(self, out: Path) -> list[dict[str, Any]]:
        rows = []
        for rel in sorted(self.files):
            data, stage, holds = self.files[rel]
            dest = out / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            rows.append({"path": rel, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                         "stage": stage, "holds": holds})
        return rows


# The parts


def layers_on_at(layers: list[dict[str, Any]], t: dt.datetime, families: Iterable[str]) -> set[str]:
    fam = set(families)
    return {l["Id"] for l in layers if l["Family"] in fam and l["_on"] <= t < l["_off"]}


def intervals(times: list[dt.datetime], last_off: dt.datetime, hold: dt.timedelta | None = None) -> list[tuple[dt.datetime, dt.datetime]]:
    """Each time is on until the next one (or for ``hold`` when given), the last until ``last_off``."""
    out = []
    for i, t in enumerate(times):
        nxt = times[i + 1] if i + 1 < len(times) else last_off
        out.append((t, t + hold if hold is not None else max(nxt, t + dt.timedelta(minutes=1))))
    return out


def export_scene(backend: Backend, region_id: str, out_dir: Path, *, start: str | None = None,
                 cmr_cache: Path = cmr.CMR_CACHE_DIR, title: str | None = None, estimate_step_hours: float = 3.0,
                 footprints_as: str = "geojson", scene_id: str | None = None,
                 log: Callable[[str], None] = lambda s: None) -> dict[str, Any]:
    """Write the scene folder for one held-out run and return its manifest. See the module docstring."""
    if footprints_as not in ("geojson", "images"):
        raise ValueError("footprints_as must be 'geojson' or 'images'")

    # 1. The start.
    starts = backend.get_json("/api/runs/starts", {"region_id": region_id})
    start = start or starts.get("default_start")
    if not start:
        raise ValueError(f"no start given and no default start for {region_id}")
    body = {"region_id": region_id, "source": "firms", "start": start, "holdout_viirs": True}

    # 2. The held-out run, with the scorer's keys removed before anything reads it.
    first = backend.post_json("/api/reconstruct", body)
    if first.get("source") != "firms" or not first.get("holdout_viirs"):
        raise ValueError("the response is not a real held-out run")
    removed = scorer_paths(first)
    run = without_scorer(first)
    del first
    hidden = set(run.get("hidden_platforms") or [])
    if not hidden:
        raise ValueError("the run hides no platform")
    codes = {int(k): v for k, v in (run["observer_passes"].get("sensor_codes") or {}).items()}
    schema = run["observer_passes"].get("footprint_schema")
    if schema != ["lon", "lat", "scan_km", "track_km", "angle_deg", "frp_mw", "confidence", "sensor_code"]:
        raise ValueError(f"unexpected footprint_schema {schema}")

    region = run["region"]
    window = run["window"]
    t_first, t_last = parse_utc(window["first_overpass_utc"]), parse_utc(window["last_overpass_utc"])
    t0 = t_first - dt.timedelta(minutes=30)
    t_end = t_last + dt.timedelta(minutes=30)
    day0 = t_first.strftime("%Y%m%d")
    scene_id = scene_id or f"isogon_{region_id}_{day0}" + ("_images" if footprints_as == "images" else "")
    if not scene_id.replace("_", "").isalnum():
        raise ValueError(f"scene id {scene_id!r} must be letters, digits and underscores")
    base = f"user/data/assets/{scene_id}"
    w = SceneWriter()
    log(f"run {run['run_id']}, window {window['first_overpass_utc']} to {window['last_overpass_utc']}")

    geojson_layers: list[dict[str, Any]] = []
    image_layers: list[dict[str, Any]] = []

    def add_layer(kind: str, family: str, lid: str, name: str, rel: str, desc: str,
                  on: dt.datetime, off: dt.datetime) -> None:
        item = {"Id": lid, "Name": name, "Description": desc, "File": LuaExpr(f'asset.resource("{rel}")'),
                "Family": family, "_on": on, "_off": off, "_kind": kind}
        (geojson_layers if kind == "geojson" else image_layers).append(item)

    # The locator: the region box, at Earth scale only.
    w_, s_, e_, n_ = (float(v) for v in region["bbox"])
    box_ring = [[w_, s_], [e_, s_], [e_, n_], [w_, n_], [w_, s_]]
    w.add(f"{base}/data/locator.geojson",
          dump_json(collection([feature(box_ring, {"name": region["name"], "stroke": COLOR_LOCATOR,
                                                   "stroke-width": 3, "fill": COLOR_LOCATOR, "fill-opacity": 0.0,
                                                   "altitudeMode": "relativeToGround", "tessellate": True},
                                        SWATH_HEIGHT_M)])),
          "pre_reveal", "the region box (the blind test's box), a locator: no fire")
    add_layer("geojson", "locator", f"{scene_id}_locator", "Isogon region", "data/locator.geojson",
              "The region box of the run.", t0 - dt.timedelta(days=3650), t0 + dt.timedelta(days=3650))

    # MODIS detections, one file per overpass, from the visible frames only. Footprint images (the "images"
    # form) cover the grid plus a margin, since a pixel centred in the box can reach past it.
    gw, gs, ge, gn = geo.Grid375.from_payload(run["belief_frames"]["grid"]).extent
    fp_raster = geo.Raster.covering((gw - FOOTPRINT_MARGIN_DEG, gs - FOOTPRINT_MARGIN_DEG,
                                     ge + FOOTPRINT_MARGIN_DEG, gn + FOOTPRINT_MARGIN_DEG))
    frames = run["observer_passes"]["frames"]
    modis_frames = []
    for f in frames:
        fps = f.get("footprints") or []
        bad = [fp for fp in fps if codes.get(int(fp[7])) in hidden]
        if bad:
            raise ValueError(f"frame {f.get('frame')} carries {len(bad)} footprints of a hidden platform before the reveal")
        if fps and INSTRUMENT_OF.get(str(f.get("sensor"))) == "MODIS":
            modis_frames.append(f)
    modis_times = [parse_utc(f["timestamp_utc"]) for f in modis_frames]
    modis_count = 0
    for i, (f, (on, off)) in enumerate(zip(modis_frames, intervals(modis_times, t_end))):
        rings, feats = [], []
        for fp in f["footprints"]:
            lon, lat, scan, track, ang, frp, conf, code = fp
            ring = geo.footprint_ring(lon, lat, scan, track, ang)
            rings.append(ring)
            plat = codes.get(int(code), str(f["sensor"]))
            feats.append(feature(ring, {
                "name": f"{PLATFORM_NAME.get(plat, plat)} MODIS {f['timestamp_utc']}", "platform": plat,
                "time_utc": f["timestamp_utc"], "frp_mw": frp, "confidence": conf, "scan_km": scan,
                "track_km": track, "stroke": COLOR_MODIS, "stroke-width": 2, "fill": COLOR_MODIS,
                "fill-opacity": 0.15, "altitudeMode": "relativeToGround"}, FOOTPRINT_HEIGHT_M))
        modis_count += len(feats)
        stamp = on.strftime("%Y%m%dT%H%M")
        lid = f"{scene_id}_modis_{i:02d}"
        desc = f"MODIS detections of the overpass at {f['timestamp_utc']} (NASA FIRMS), {len(feats)} pixels."
        if footprints_as == "geojson":
            rel = f"data/modis/modis_{stamp}.geojson"
            w.add(f"{base}/{rel}", dump_json(collection(feats)), "pre_reveal", desc)
            add_layer("geojson", "modis", lid, f"MODIS {f['timestamp_utc']}", rel, desc, on, off)
        else:
            rel = f"data/modis/modis_{stamp}.vrt"
            w.add(f"{base}/data/modis/modis_{stamp}.png",
                  geo.png_bytes(geo.footprints_rgba(rings, fp_raster, COLOR_MODIS, 0.15, COLOR_MODIS)), "pre_reveal", desc)
            w.add(f"{base}/{rel}", geo.global_vrt(f"modis_{stamp}.png", fp_raster).encode("utf-8"), "pre_reveal",
                  "places the PNG beside it on the globe (a GDAL VRT padded to the whole globe)")
            add_layer("image", "modis", lid, f"MODIS {f['timestamp_utc']}", rel, desc, on, off)
    log(f"MODIS: {len(modis_frames)} overpasses, {modis_count} footprints")

    # 3. The estimate: belief steps every few hours, drawn as 375 m cells.
    bf = run["belief_frames"]
    grid = geo.Grid375.from_payload(bf["grid"])
    raster = geo.Raster.covering(grid.extent)
    blob = backend.get_bytes(bf["url"])
    steps = int(bf["steps"])
    if len(blob) != steps * grid.ny * grid.nx * 2:
        raise ValueError(f"belief bytes {len(blob)} do not match {steps} steps of {grid.ny} by {grid.nx} by 2")
    cube = np.frombuffer(blob, dtype=np.uint8).reshape(steps, grid.ny, grid.nx, 2)
    b0 = parse_utc(bf["first_time_utc"])
    step_min = float(bf["step_minutes"])
    stride = max(1, round(estimate_step_hours * 60.0 / step_min))
    chosen = list(range(0, steps, stride))
    est_times = [b0 + dt.timedelta(minutes=step_min * k) for k in chosen]
    for j, (k, (on, off)) in enumerate(zip(chosen, intervals(est_times, t_end))):
        stamp = on.strftime("%Y%m%dT%H%M")
        desc = (f"The model's estimate at {utc(on)} from MODIS alone (belief step {k}): 375 m cells, colour from "
                f"expected FRP density, opacity from the probability of burning, cells under "
                f"{geo.P_BURNING_FLOOR} left out.")
        w.add(f"{base}/data/estimate/estimate_{stamp}.png", geo.png_bytes(geo.estimate_rgba(cube[k], grid, raster)),
              "pre_reveal", desc)
        w.add(f"{base}/data/estimate/estimate_{stamp}.vrt", geo.global_vrt(f"estimate_{stamp}.png", raster).encode("utf-8"),
              "pre_reveal", "places the PNG beside it on the globe (a GDAL VRT padded to the whole globe)")
        add_layer("image", "estimate", f"{scene_id}_estimate_{j:02d}", f"Estimate {utc(on)}",
                  f"data/estimate/estimate_{stamp}.vrt", desc, on, off)
    log(f"estimate: {len(chosen)} steps every {stride * step_min / 60:.1f} h")

    # 4. The passes: times from /api/passes, swaths from the CMR pass files. No FIRMS field is kept.
    pq = {"region_id": region_id, "start": utc(t0), "end": utc(t_end)}
    pt = backend.get_json("/api/passes", pq)
    granule_rings: dict[str, list[list[float]]] = {}
    for plat, year in sorted({(p["platform"], parse_utc(p["time_start"]).year) for p in pt["passes"]}):
        pf = cmr.read_pass_file(cmr.pass_file(region_id, plat, year, cmr_cache))
        for g in pf["granules"]:
            granule_rings[g["id"]] = g["rings"]
    passes_written, granules_written = 0, 0
    for i, p in enumerate(pt["passes"]):
        ts, te = parse_utc(p["time_start"]), parse_utc(p["time_end"])
        plat = p["platform"]
        inst = INSTRUMENT_OF[plat]
        color = COLOR_MODIS if inst == "MODIS" else COLOR_VIIRS
        feats = []
        for gid in p["granules"]:
            if gid not in granule_rings:
                raise ValueError(f"granule {gid} of the pass at {p['time_start']} is not in the CMR pass files")
            for ring in granule_rings[gid]:
                dense = [[round(x, 5), round(y, 5)] for x, y in cmr.densify(ring)]
                feats.append(feature(dense, {
                    "name": f"{PLATFORM_NAME[plat]} {inst} swath {p['time_start']} to {p['time_end']}",
                    "platform": plat, "granule": gid, "time_start": p["time_start"], "time_end": p["time_end"],
                    "day_night": p.get("day_night"), "stroke": color, "stroke-width": 2, "fill": color,
                    "fill-opacity": 0.06, "altitudeMode": "relativeToGround", "tessellate": True}, SWATH_HEIGHT_M))
                granules_written += 1
        stamp = ts.strftime("%Y%m%dT%H%M")
        rel = f"data/passes/{plat.lower()}_{stamp}.geojson"
        desc = f"{PLATFORM_NAME[plat]} {inst} pass {p['time_start']} to {p['time_end']}: its swath from NASA CMR."
        w.add(f"{base}/{rel}", dump_json(collection(feats)), "pre_reveal", desc)
        hold = max(te - ts, dt.timedelta(minutes=90))
        add_layer("geojson", "passes", f"{scene_id}_pass_{i:02d}", f"{PLATFORM_NAME[plat]} {ts:%Y-%m-%d %H:%M}", rel,
                  desc, ts, ts + hold)
        passes_written += 1
    log(f"passes: {passes_written} passes, {granules_written} granule swaths")

    pre_layers = geojson_layers + image_layers
    pass_platforms = sorted({p["platform"] for p in pt["passes"]})

    # Captions, parts and actions are written after the reveal, since the reveal's layers are part of them;
    # their text and times come from the visible run only.
    first_hidden_names = " and ".join(PLATFORM_NAME[p] for p in PLATFORM_NAME if p in hidden)

    # 5. The reveal, fetched last.
    second = backend.post_json("/api/reconstruct", dict(body, reveal=True))
    reveal = (second.get("blind_test") or {}).get("reveal") or {}
    if reveal.get("footprint_schema") != schema:
        raise ValueError("the reveal is missing or has another footprint schema")
    rv = reveal["overpasses"]
    rv_times = [parse_utc(o["time_utc"]) for o in rv]
    reveal_count = 0
    for i, (o, (on, off)) in enumerate(zip(rv, intervals(rv_times, t_end))):
        rings, feats = [], []
        for fp in o["footprints"]:
            lon, lat, scan, track, ang, frp, conf, code = fp
            ring = geo.footprint_ring(lon, lat, scan, track, ang)
            rings.append(ring)
            feats.append(feature(ring, {
                "name": f"{PLATFORM_NAME.get(o['platform'], o['platform'])} VIIRS {o['time_utc']}",
                "platform": o["platform"], "time_utc": o["time_utc"], "frp_mw": frp, "confidence": conf,
                "scan_km": scan, "track_km": track, "stroke": COLOR_VIIRS, "stroke-width": 1, "fill": COLOR_VIIRS,
                "fill-opacity": 0.8, "altitudeMode": "relativeToGround"}, FOOTPRINT_HEIGHT_M))
        reveal_count += len(feats)
        stamp = on.strftime("%Y%m%dT%H%M")
        plat = o["platform"].lower()
        lid = f"{scene_id}_reveal_{i:02d}"
        desc = (f"Hidden VIIRS detections of the {PLATFORM_NAME.get(o['platform'], o['platform'])} overpass at "
                f"{o['time_utc']} (NASA FIRMS), {len(feats)} pixels. Opened only after the estimate was fixed.")
        if footprints_as == "geojson":
            rel = f"data/reveal/{plat}_{stamp}.geojson"
            w.add(f"{base}/{rel}", dump_json(collection(feats)), "reveal", desc)
            add_layer("geojson", "reveal", lid, f"VIIRS {o['time_utc']}", rel, desc, on, off)
        else:
            rel = f"data/reveal/{plat}_{stamp}.vrt"
            w.add(f"{base}/data/reveal/{plat}_{stamp}.png",
                  geo.png_bytes(geo.footprints_rgba(rings, fp_raster, COLOR_VIIRS, 0.8, None)), "reveal", desc)
            w.add(f"{base}/{rel}", geo.global_vrt(f"{plat}_{stamp}.png", fp_raster).encode("utf-8"), "reveal",
                  "places the PNG beside it on the globe (a GDAL VRT padded to the whole globe)")
            add_layer("image", "reveal", lid, f"VIIRS {o['time_utc']}", rel, desc, on, off)
    log(f"reveal: {len(rv)} overpasses, {reveal_count} footprints")
    # Image layers stack in the order they are added: the estimate first, detections over it.
    image_layers.sort(key=lambda l: {"estimate": 0, "modis": 1, "reveal": 2}[l["Family"]])

    # Captions.
    place = title or str(region["name"]).replace("&", "and").replace(", CA", ", California")
    days = f"{t_first.day} to {t_last.day} {t_last:%B %Y}" if t_first.month == t_last.month else \
        f"{t_first.day} {t_first:%B} to {t_last.day} {t_last:%B %Y}"
    modis_plats = [PLATFORM_NAME[p] for p in PLATFORM_NAME if p in pass_platforms and INSTRUMENT_OF[p] == "MODIS"]
    viirs_plats = [PLATFORM_NAME[p] for p in PLATFORM_NAME if p in pass_platforms and INSTRUMENT_OF[p] == "VIIRS"]
    captions = {
        "title": [place, f"{days}, seen by satellites (times in UTC)"],
        "passes": [f"MODIS on {' and '.join(modis_plats)}: 1 km pixels. VIIRS on {' and '.join(viirs_plats)}: 375 m pixels.",
                   "Each outline is one pass, the swath NASA CMR lists for it."],
        "modis": ["Orange: fire MODIS detected, one 1 km pixel each (NASA FIRMS).",
                  "Violet: the model's estimate from MODIS alone, on 375 m cells."],
        "reveal": [f"Yellow: fire VIIRS detected ({first_hidden_names}), 375 m pixels. The model never saw these.",
                   "Violet: the same estimate, fixed before these were opened."],
        "sources": ["Detections: NASA FIRMS, MODIS Collection 6.1 and VIIRS 375 m.",
                    "Swaths: NASA CMR. Estimate: Isogon, an experimental model."],
    }
    caption_items = []
    for key, lines in captions.items():
        rel = f"data/captions/{key}.png"
        w.add(f"{base}/{rel}", caption_png(lines), "pre_reveal", "caption text: " + " | ".join(lines))
        caption_items.append({"Id": f"{scene_id}_caption_{key}", "Name": f"Isogon caption {key}",
                              "File": LuaExpr(f'asset.resource("{rel}")'), "Position": list(CAPTION_POSITION),
                              "Scale": CAPTION_SCALE, "_key": key})

    # The parts of the show.
    lat0, lon0 = float(region["center_lat"]), float(region["center_lon"])
    fire_hours = (t_end - t0).total_seconds()
    parts = [
        {"n": 1, "name": "Earth", "time": t0, "rate": 0.0, "alt": CAMERA_EARTH_M, "fly": 3.0, "run_after": 1.0,
         "families": [], "static": ["locator"], "caption": "title", "seconds": 15.0},
        {"n": 2, "name": "Passes", "time": t0, "rate": PASSES_HOURS * 3600.0 / 31.0, "alt": CAMERA_PASSES_M,
         "fly": 12.0, "run_after": 1.0, "families": ["passes"], "static": ["locator"], "caption": "passes",
         "seconds": 32.0},
        {"n": 3, "name": "What MODIS saw, and the estimate", "time": t0, "rate": fire_hours / 30.0,
         "alt": CAMERA_FIRE_M, "fly": 10.0, "run_after": 10.0, "families": ["modis", "estimate"], "static": [],
         "caption": "modis", "seconds": 40.0},
        {"n": 4, "name": "What VIIRS saw", "time": t0, "rate": fire_hours / 34.0, "alt": CAMERA_FIRE_M,
         "fly": 2.0, "run_after": 1.0, "families": ["estimate", "reveal"], "static": [], "caption": "reveal",
         "seconds": 36.0},
        {"n": 5, "name": "Sources", "time": t_end - dt.timedelta(minutes=1), "rate": 0.0, "alt": CAMERA_FIRE_M,
         "fly": 2.0, "run_after": 1.0, "families": [], "static": ["estimate", "reveal"], "caption": "sources",
         "seconds": 15.0},
    ]
    all_layers = geojson_layers + image_layers

    def uri_of(layer: dict[str, Any]) -> str:
        return geojson_uri(layer["Id"]) if layer["_kind"] == "geojson" else image_uri(layer["Id"])

    for layer in all_layers:
        layer["Enabled"] = layer["Id"] in layers_on_at(all_layers, parts[0]["time"], parts[0]["families"] + parts[0]["static"])
    for c in caption_items:
        c["Enabled"] = c["_key"] == parts[0]["caption"]

    # Scheduled scripts, one file per family: a layer is on from its time until its end, either way in time.
    schedules = {}
    for family, group in SCHEDULER_GROUP.items():
        rows = []
        for layer in all_layers:
            if layer["Family"] != family:
                continue
            u = uri_of(layer)
            rows.append({"Time": os_time(layer["_on"]), "ForwardScript": set_prop(u, True),
                         "BackwardScript": set_prop(u, False), "Group": group})
            rows.append({"Time": os_time(layer["_off"]), "ForwardScript": set_prop(u, False),
                         "BackwardScript": set_prop(u, True), "Group": group})
        rows.sort(key=lambda r: r["Time"])
        rel = f"schedules/{family}.lua"
        stage = "reveal" if family == "reveal" else "pre_reveal"
        schedules[family] = rel
        w.add(f"{base}/{rel}", ("-- Scheduled scripts for the " + family + " layers (openspace.scriptScheduler.loadFile)\n"
                                "return " + lua(rows) + "\n").encode("utf-8"), stage,
              f"scheduled scripts that switch the {family} layers at their times")

    actions = []
    show_steps, at = [], 0.0
    for part in parts:
        pid = f"{scene_id}_part_{part['n']}"
        rid = f"{scene_id}_run_{part['n']}"
        on_now = layers_on_at(all_layers, part["time"], part["families"] + part["static"])
        cmds = ["openspace.time.setPause(true)"]
        cmds += [f"openspace.scriptScheduler.clear({g})" for g in SCHEDULER_GROUP.values()]
        cmds.append(f"openspace.time.setTime('{os_time(part['time'])}')")
        cmds += [set_prop(uri_of(l), l["Id"] in on_now) for l in all_layers]
        cmds += [set_prop(caption_uri(c["Id"]), c["_key"] == part["caption"]) for c in caption_items]
        cmds.append(f"openspace.navigation.flyToGeo('{GLOBE}', {lat0}, {lon0}, {part['alt']}, {part['fly']}, false)")
        cmds.append(f"openspace.scheduleScript(\"openspace.action.triggerAction('{rid}')\", {part['run_after']})")
        actions.append({"Id": pid, "Name": f"Isogon {part['n']}: {part['name']}", "Key": str(part["n"]),
                        "Documentation": f"Part {part['n']} of the show: {part['name']}. Sets the time, the layers "
                                         f"and the camera; time runs after {part['run_after']} s.",
                        "Command": "; ".join(cmds)})
        run_cmds = [f"openspace.scriptScheduler.loadFile(__FILE:{schedules[f]}__)" for f in part["families"]]
        if part["rate"] > 0:
            run_cmds.append(f"openspace.time.setDeltaTime({round(part['rate'], 1)})")
            run_cmds.append("openspace.time.setPause(false)")
        else:
            run_cmds.append("openspace.time.setPause(true)")
        actions.append({"Id": rid, "Name": f"Isogon {part['n']}: run", "Documentation":
                        f"Arms the scheduled layers of part {part['n']} and lets time run.", "Command": "; ".join(run_cmds)})
        show_steps.append((at, pid))
        at += part["seconds"]
    show_cmd = [f"openspace.action.triggerAction('{show_steps[0][1]}')"]
    show_cmd += [f"openspace.scheduleScript(\"openspace.action.triggerAction('{pid}')\", {t})" for t, pid in show_steps[1:]]
    actions.append({"Id": f"{scene_id}_show", "Name": "Isogon: play the whole show", "Key": "0",
                    "Documentation": f"Plays parts 1 to {len(parts)} in order, {round(at)} s in all.",
                    "Command": "; ".join(show_cmd)})

    def lua_layer(l: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in l.items() if not k.startswith("_") and k != "Family"}

    data = {
        "Name": f"Isogon: {place}",
        "Description": (f"One real fire run, {window['first_overpass_utc']} to {window['last_overpass_utc']}, "
                        "VIIRS hidden from the estimate and revealed at the end."),
        "Globe": GLOBE,
        "GuiPath": "/Isogon",
        "SchedulerGroups": list(SCHEDULER_GROUP.values()),
        "GeoJson": [lua_layer(l) for l in geojson_layers],
        "ImageLayers": [lua_layer(l) for l in image_layers],
        "Captions": [{k: v for k, v in c.items() if not k.startswith("_")} for c in caption_items],
        "Actions": actions,
    }
    w.add(f"{base}/scene_data.asset",
          ("-- Written by backend/openspace/export.py from one Isogon run. Do not edit by hand.\n"
           "local Data = " + lua(data) + "\n\nasset.export(\"Data\", Data)\n").encode("utf-8"),
          "reveal", "the scene's data: layers, captions, the parts of the show and their commands")
    w.add(f"{base}/scene.asset", TEMPLATE_ASSET.read_bytes(), "static", "the scene code, the same for every export")

    profile = {
        "version": PROFILE_VERSION,
        "meta": {"name": f"Isogon: {place}", "version": "1.0", "author": "Isogon",
                 "description": data["Description"], "license": "", "url": ""},
        "assets": ["base", "scene/solarsystem/planets/earth/earth", f"${{USER_ASSETS}}/{scene_id}/scene"],
        "camera": {"type": "goToGeo", "anchor": GLOBE, "latitude": lat0, "longitude": lon0,
                   "altitude": CAMERA_EARTH_M},
        "time": {"type": "absolute", "value": os_time(t0), "is_paused": True},
        "delta_times": [1.0, 60.0, 600.0, 3600.0, 14400.0, 43200.0],
        "mark_nodes": [GLOBE],
        "properties": [],
        "keybindings": [],
    }
    w.add(f"user/data/profiles/{scene_id}.profile",
          (json.dumps(profile, indent=2, sort_keys=True) + "\n").encode("utf-8"), "pre_reveal",
          "the profile: which assets load, the start time and camera (format 1.4)")

    readme = readme_text(scene_id, place, parts, at)
    w.add("README.txt", readme.encode("utf-8"), "pre_reveal", "how to load and play the scene")

    # Write.
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    rows = w.write(out_dir)
    manifest = {
        "scene_id": scene_id,
        "written_by": "backend/openspace/export.py",
        "exporter_commit": _git_head(),
        "openspace_versions": ["0.21.3", "0.22.0", "0.22.1"],
        "profile_format": f"{PROFILE_VERSION['major']}.{PROFILE_VERSION['minor']}",
        "footprints_as": footprints_as,
        "requests": getattr(backend, "requests", None),
        "run_id": run["run_id"],
        "region": {k: region.get(k) for k in ("id", "name", "bbox", "center_lat", "center_lon")},
        "start": start,
        "window": window,
        "hidden_platforms": sorted(hidden),
        "removed_before_writing": removed,
        "provenance": run.get("provenance"),
        "counts": {"modis_overpasses": len(modis_frames), "modis_footprints": modis_count,
                   "estimate_steps": len(chosen), "estimate_step_hours": stride * step_min / 60.0,
                   "passes": passes_written, "granule_swaths": granules_written,
                   "reveal_overpasses": len(rv), "reveal_footprints": reveal_count,
                   "geojson_layers": len(geojson_layers), "image_layers": len(image_layers)},
        "show_seconds": at,
        "parts": [{"key": str(p["n"]), "name": p["name"], "time_utc": utc(p["time"]), "seconds": p["seconds"],
                   "time_rate": round(p["rate"], 1), "camera_altitude_m": p["alt"], "caption": captions[p["caption"]]}
                  for p in parts],
        "estimate": {"from": "belief_frames (forward filter, MODIS only)", "p_burning_floor": geo.P_BURNING_FLOOR,
                     "opacity": [geo.ESTIMATE_MIN_ALPHA, geo.ESTIMATE_MAX_ALPHA],
                     "opacity_rule": "linear in the probability of burning, from the floor to 1",
                     "ramp": [list(s) for s in geo.ESTIMATE_RAMP],
                     "pixel_deg": raster.pixel_deg, "raster": {"x0": raster.x0, "y0": raster.y0,
                                                               "width": raster.width, "height": raster.height}},
        "derived": [
            "Footprint shapes: centre, scan_km and track_km from the FIRMS row; the orientation angle_deg is "
            "derived by the model from pixel sizes and times (FIRMS does not publish it).",
            "No spacecraft and no pass marker are drawn: the swaths are NASA CMR granule polygons, edges along "
            "great circles.",
        ],
        "limits": [
            "FIRMS lists detections, not where a satellite looked and saw nothing; cloud is unknown for VIIRS and "
            "a granule mean for MODIS.",
            "The estimate is experimental. No score is shown in the scene.",
            "GeoJSON cannot be clamped to the terrain; footprints sit 30 m and swaths 500 m above the ground at "
            "their corners.",
        ],
        "credits": ["NASA FIRMS (MODIS Collection 6.1, VIIRS 375 m Collection 2)", "NASA CMR (granule swaths)"],
        "pre_reveal_digest": w.digest("pre_reveal"),
        "files": rows,
    }
    (out_dir / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest


def readme_text(scene_id: str, place: str, parts: list[dict[str, Any]], total_s: float) -> str:
    lines = [
        f"Isogon scene for OpenSpace: {place}",
        "",
        "Loads in OpenSpace 0.21.3 and 0.22 (profile format 1.4).",
        "",
        "To load it",
        f"  1. Copy user/data/assets/{scene_id} into <OpenSpace folder>/user/data/assets/",
        f"  2. Copy user/data/profiles/{scene_id}.profile into <OpenSpace folder>/user/data/profiles/",
        "     Make the folders if they are missing.",
        f"  3. Start OpenSpace and choose the profile {scene_id} in the launcher.",
        "",
        "To play it",
        f"  0  the whole show, {round(total_s)} s",
    ]
    lines += [f"  {p['n']}  {p['name']}" for p in parts]
    lines += [
        "",
        "Once started, the whole show runs to its end; press a number again after it ends.",
        "MANIFEST.json lists every file, what it holds and where it came from.",
        "",
    ]
    return "\n".join(lines)


def _git_head() -> str | None:
    try:
        out = subprocess.run(["git", "-C", str(_REPO_ROOT), "rev-parse", "HEAD"], capture_output=True, text=True,
                             timeout=10, check=True)
        return out.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--backend", default="http://127.0.0.1:8788")
    ap.add_argument("--region", default="plumas_ca")
    ap.add_argument("--start", default=None, help="UTC date; the region's default start when left out")
    ap.add_argument("--out", required=True, type=Path, help="the scene folder to write (replaced if it exists)")
    ap.add_argument("--cmr-cache", type=Path, default=cmr.CMR_CACHE_DIR, help="the CMR cache folder (read only)")
    ap.add_argument("--title", default=None)
    ap.add_argument("--estimate-step-hours", type=float, default=3.0)
    ap.add_argument("--footprints-as", choices=("geojson", "images"), default="geojson")
    args = ap.parse_args(argv)
    m = export_scene(HttpBackend(args.backend), args.region, args.out, start=args.start, cmr_cache=args.cmr_cache,
                     title=args.title, estimate_step_hours=args.estimate_step_hours,
                     footprints_as=args.footprints_as, log=lambda s: print(s, flush=True))
    print(json.dumps({"scene_id": m["scene_id"], "counts": m["counts"], "show_seconds": m["show_seconds"],
                      "pre_reveal_digest": m["pre_reveal_digest"], "files": len(m["files"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
