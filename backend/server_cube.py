"""Routes of the fire cube (backend/firms/cube.py): the monthly record of any box on Earth, the loaded countries, and
the world layers.

  GET /api/cube/record?box=w,s,e,n[&snap=outer|inner]   the Record of the box, in the shape of
                                                         GET /api/calendar?source=firms&box=, read from the cube
  GET /api/cube/tables?box=w,s,e,n[&snap=outer|inner]   the box's tables: rows and fire radiative power by month,
                                                         platform, day and night and kind; fire rows by scan class
                                                         and by confidence class
  GET /api/cube/countries                               which countries are loaded, and the download's progress
  GET /api/cube/layers                                  the world layers, with their scale
  GET /api/cube/layers/<name>.png | <name>.npy          one layer

`cube_route(route, qs)` answers these and returns (status, body, content type), or None for any other route, so the
main server mounts them in a few lines. Run alone for a look:

  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/server_cube.py --port 9188
"""

from __future__ import annotations

import argparse
import collections
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
import time
from typing import Any
from urllib.parse import parse_qs, urlparse

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms import cube as C  # noqa: E402
from backend.firms import real_calendar as RC  # noqa: E402

PREFIX: str = "/api/cube"
CACHE_ENTRIES: int = 64
_CUBE = C.Cube()
_LOCK = threading.Lock()
_CACHE: "collections.OrderedDict[tuple[Any, ...], bytes]" = collections.OrderedDict()
JSON = "application/json; charset=utf-8"


def _json(status: int, obj: Any) -> tuple[int, bytes, str]:
    return status, json.dumps(obj, allow_nan=False, separators=(",", ":")).encode("utf-8"), JSON


def _cached(key: tuple[Any, ...], make: Any) -> bytes:
    with _LOCK:
        if key in _CACHE:
            _CACHE.move_to_end(key)
            return _CACHE[key]
    body = make()
    with _LOCK:
        _CACHE[key] = body
        while len(_CACHE) > CACHE_ENTRIES:
            _CACHE.popitem(last=False)
    return body


def _box_and_snap(qs: dict[str, list[str]]) -> tuple[tuple[float, float, float, float], str]:
    text = qs.get("box", [""])[0]
    if not text:
        raise ValueError("box is needed: west,south,east,north in degrees")
    how = qs.get("snap", ["outer"])[0]
    if how not in ("outer", "inner"):
        raise ValueError("snap must be 'outer' or 'inner'")
    return RC.parse_box(text), how


def _cube_block(cube: C.Cube, t: dict[str, Any], ms: float) -> dict[str, Any]:
    man = cube.manifest
    return {
        "build_id": man["build_id"], "built_utc": man["built_utc"], "cube_version": man["cube_version"],
        "grid_step_deg": C.STEP_DEG, "snap": t["snap"], "box_asked": t["box_asked"], "grid_box": t["box"],
        "cells": t["cells"], "cells_loaded": t["cells_loaded"], "countries": t["countries"],
        "countries_loaded": len(man["countries_loaded"]), "countries_listed": man["countries_listed"],
        "world_complete": man["world_complete"], "records_read": t["records_read"], "read_ms": round(ms, 2),
        "outage_rule_over": "every country loaded in this build",
        "sources": "manifest.json of the build lists every country file read, with its sha256",
    }


def _not_loaded(cube: C.Cube, t: dict[str, Any]) -> tuple[int, bytes, str]:
    man = cube.manifest
    return _json(HTTPStatus.NOT_FOUND, {
        "error": "not loaded: no loaded country file has a row in this box",
        "state": "not_loaded", "grid_box": t["box"], "cells": t["cells"],
        "countries_loaded": len(man["countries_loaded"]), "countries_listed": man["countries_listed"],
        "world_complete": man["world_complete"],
        "note": "a box with no loaded row is not loaded, not zero; GET /api/cube/countries lists what is loaded",
    })


def record_payload(cube: C.Cube, box: tuple[float, float, float, float], how: str = "outer") -> dict[str, Any] | None:
    """The Record of a box from the cube, in the shape of the box calendar; None when the box is not loaded."""
    t0 = time.perf_counter()
    t = cube.box(box, how)
    if not t["loaded"]:
        return None
    counts, left, n = cube.calendar_counts(t)
    ms = (time.perf_counter() - t0) * 1000.0
    g = tuple(t["box"])
    label = RC.box_label(g)
    countries = [c.replace("_", " ") for c in t["countries"]]
    out = RC._calendar_payload(
        counts, n, g, cube.deliver_sets(), cube.outage_sets(),
        head={"region_id": None, "region_name": label},
        provenance_where=(f"inside the box on the cube's {C.STEP_DEG} degree grid, from the country files of "
                          f"{', '.join(countries)}"),
        counted_rows=("every FIRMS row except type 1 (active volcano, counted as volcano_excluded), type 2 (static "
                      "land source, counted as static_excluded) and type 3 (offshore, counted as offshore_excluded), "
                      "as the box calendar counts; the box is answered on whole cells of the grid"),
        excluded={"static": "static_excluded", "offshore": "offshore_excluded", "volcano": "volcano_excluded"},
        left_out_metrics={"static_rows_excluded": left["static"], "offshore_rows_excluded": left["offshore"],
                          "volcano_rows_excluded": left["volcano"]},
        noaa21_note="not in the country files; the cube has no NOAA-21 rows",
        not_in_calendar="the months after the last country file month: their rows come from the area API (near real "
                        "time, no type column); this month so far is served by GET /api/calendar/current",
        ignored=[],
    )
    frp = t["frp"]
    for rec in out["records"]:
        m = C.month_index(rec["year"], rec["month"])
        for p, plat in enumerate(C.PLATFORMS):
            c = rec["raw_counts"].get(plat)
            if c is not None:
                c["frp_mw_day"] = round(float(frp[m, p, 0, 0]), 1)
                c["frp_mw_night"] = round(float(frp[m, p, 1, 0]), 1)
                c["frp_mw"] = round(float(frp[m, p, :, 0].sum()), 1)
    out["units"]["frp_mw"] = "summed fire radiative power of the counted rows, MW"
    out["harmonization_method"]["outage_rule"] += " (here: every country loaded in the cube)"
    out["place"] = {"kind": "box", "box": list(g), "box_asked": list(box), "countries": countries, "label": label}
    out["current_month"] = {"route": "/api/calendar/current?source=firms&box=" + RC.box_text(g)}
    out["cube"] = _cube_block(cube, t, ms)
    return out


def tables_payload(cube: C.Cube, box: tuple[float, float, float, float], how: str = "outer") -> dict[str, Any] | None:
    t0 = time.perf_counter()
    t = cube.box(box, how)
    if not t["loaded"]:
        return None
    ms = (time.perf_counter() - t0) * 1000.0
    nm = cube.n_months
    return {
        "source": "the fire cube (docs/cube.md): NASA FIRMS country yearly files, every row, per cell of the grid",
        "months": [C.month_label(m) for m in range(nm)],
        "axes": {
            "rows": ["month", "platform", "daynight", "kind"], "frp_mw": ["month", "platform", "daynight", "kind"],
            "fire_rows_by_scan": ["month", "platform", "daynight", "scan_class"],
            "fire_frp_mw_by_scan": ["month", "platform", "daynight", "scan_class"],
            "fire_rows_by_confidence": ["month", "platform", "daynight", "confidence_class"],
        },
        "platforms": list(C.PLATFORMS), "daynight": list(C.DAYNIGHT), "kinds": list(C.KINDS),
        "scan_classes": cube.grid["scan_classes"], "confidence_classes": cube.grid["confidence_classes"],
        "delivering": {C.PLATFORMS[p]: cube.delivering[p, :nm].astype(int).tolist() for p in range(len(C.PLATFORMS))},
        "outage_days_per_month": {C.PLATFORMS[p]: _outages_per_month(cube, p) for p in range(len(C.PLATFORMS))},
        "rows": t["rows"].tolist(),
        "frp_mw": np.round(t["frp"], 2).tolist(),
        "fire_rows_by_scan": t["fire_rows_by_scan"].tolist(),
        "fire_frp_mw_by_scan": np.round(t["fire_frp_by_scan"], 2).tolist(),
        "fire_rows_by_confidence": t["fire_rows_by_confidence"].tolist(),
        "cube": _cube_block(cube, t, ms),
    }


def _outages_per_month(cube: C.Cube, p: int) -> list[int]:
    out = [0] * cube.n_months
    for d in np.flatnonzero(cube.outage[p]):
        lab = C.day_label(int(d))
        m = C.month_index(int(lab[:4]), int(lab[5:7]))
        if 0 <= m < cube.n_months:
            out[m] += 1
    return out


def countries_payload(cube: C.Cube) -> dict[str, Any]:
    store = C.world_dir() / "firms"
    ready, progress = [], {}
    try:
        ready = json.loads((store / "READY.json").read_text(encoding="utf-8"))["countries"]
    except (OSError, ValueError, KeyError):
        pass
    try:
        p = json.loads((store / "PROGRESS.json").read_text(encoding="utf-8"))
        progress = {k: p.get(k) for k in ("updated_utc", "finished", "countries", "countries_ready", "files",
                                          "fetched", "kept", "failed", "fetched_bytes")}
    except (OSError, ValueError):
        pass
    out: dict[str, Any] = {"store": {"countries_ready": len(ready), "progress": progress,
                                     "ready": [r["country"] for r in ready]}}
    try:
        cube._open()
    except C.CubeMissing as exc:
        out["cube"] = {"built": False, "note": str(exc)}
        return out
    man = cube.manifest
    loaded = [c for c, v in cube.countries["countries"].items() if v["loaded"]]
    out["cube"] = {
        "built": True, "build_id": man["build_id"], "built_utc": man["built_utc"],
        "first_month": man["first_month"], "last_month": man["last_month"], "rows": man["rows"],
        "records": man["records"], "countries_listed": man["countries_listed"], "countries_loaded": len(loaded),
        "world_complete": man["world_complete"], "loaded": sorted(loaded),
        "not_loaded": sorted(c for c, v in cube.countries["countries"].items() if not v["loaded"]),
        "outage_days": man["outage_days"],
    }
    return out


def layers_payload(cube: C.Cube) -> dict[str, Any]:
    cube._open()
    info = json.loads((C.current_build(cube.root) / "layers" / "layers.json").read_text(encoding="utf-8"))
    for name, spec in info["layers"].items():
        spec["png"] = f"{PREFIX}/layers/{name}.png"
        spec["npy"] = f"{PREFIX}/layers/{name}.npy"
    info["build_id"] = cube.manifest["build_id"]
    info["world_complete"] = cube.manifest["world_complete"]
    info["countries_loaded"] = len(cube.manifest["countries_loaded"])
    return info


def cube_route(route: str, qs: dict[str, list[str]], cube: C.Cube | None = None) -> tuple[int, bytes, str] | None:
    """(status, body, content type) for a cube route; None for any other route."""
    if route != PREFIX and not route.startswith(PREFIX + "/"):
        return None
    cube = cube or _CUBE
    try:
        if route == f"{PREFIX}/countries":
            return _json(HTTPStatus.OK, countries_payload(cube))
        if route in (f"{PREFIX}/record", f"{PREFIX}/tables"):
            box, how = _box_and_snap(qs)
            make = record_payload if route.endswith("record") else tables_payload
            key = (route, cube.build_id, box, how)
            miss: list[Any] = []

            def body() -> bytes:
                p = make(cube, box, how)
                if p is None:
                    miss.append(True)
                    return b""
                return json.dumps(p, allow_nan=False, separators=(",", ":")).encode("utf-8")

            out = _cached(key, body)
            if not out:
                with _LOCK:
                    _CACHE.pop(key, None)
                return _not_loaded(cube, cube.box(box, how))
            return HTTPStatus.OK, out, JSON
        if route == f"{PREFIX}/layers":
            return _json(HTTPStatus.OK, layers_payload(cube))
        if route.startswith(f"{PREFIX}/layers/"):
            name = route.rsplit("/", 1)[1]
            stem, _, ext = name.rpartition(".")
            from backend.firms.cube_build import LAYERS

            if stem not in LAYERS or ext not in ("png", "npy"):
                return _json(HTTPStatus.NOT_FOUND, {"error": f"no layer '{name}'", "layers": sorted(LAYERS)})
            cube._open()
            path = C.current_build(cube.root) / "layers" / f"{stem}.{ext}"
            return HTTPStatus.OK, path.read_bytes(), "image/png" if ext == "png" else "application/octet-stream"
        return _json(HTTPStatus.NOT_FOUND, {"error": f"unknown cube route '{route}'",
                                            "routes": [f"{PREFIX}/record?box=", f"{PREFIX}/tables?box=",
                                                       f"{PREFIX}/countries", f"{PREFIX}/layers"]})
    except ValueError as exc:
        return _json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
    except C.CubeMissing as exc:
        return _json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc), "state": "not_built"})


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"
        hit = cube_route(route, parse_qs(parsed.query))
        if hit is None:
            hit = _json(HTTPStatus.NOT_FOUND, {"error": "this server answers /api/cube routes only"})
        status, body, ctype = hit
        self.send_response(status)
        origin = self.headers.get("Origin") or ""
        if origin.startswith(("http://127.0.0.1:", "http://localhost:")):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        return


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Serve the fire cube's routes alone.")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=9188)
    args = ap.parse_args(argv)
    srv = ThreadingHTTPServer((args.host, args.port), _Handler)
    print(f"cube routes on http://{args.host}:{args.port}{PREFIX}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
