"""Isogon live scientific HTTP API server (Python stdlib + NumPy + Pillow via uv).

Runs on `127.0.0.1:8788` using `http.server.ThreadingHTTPServer`.

Endpoints:
  - GET  /api/health
  - GET  /api/regions
  - POST /api/reconstruct                     (a held-out real run withholds what the scorer wrote until "reveal": true)
  - GET  /api/runs/<run_id>/<asset_name>
  - GET  /api/runs/<run_id>/terrain/<name>   (terrain pack v1 files)
  - GET  /api/observer?frame=<0..23>&sensor=<all|modis|viirs>&min_frp=...&max_zenith=...&run_id=...
  - GET  /api/calendar                        (simulated; ?source=firms&region_id=<id> for the real calendar)
  - GET  /api/calendar/rows.csv?region_id=<id>&start=<date>&end=<date>[&platforms=Terra,Aqua]
  - GET  /api/calendar/checks                 (the Record's held-out check of every place in one answer)
  - GET  /api/cube/record?box=..., /api/cube/tables?box=..., /api/cube/countries, /api/cube/layers[/<name>]
                                               (the fire cube, backend/server_cube.py; docs/cube.md)
  - GET  /api/live                            (the sealed predictions of fires burning now, backend/server_live.py)
  - GET  /api/gibs/day, /api/gibs/cloud, /api/gibs/live
                                               (a day's satellite picture and cloud share from NASA's keyless
                                               tiles, read from the world store, backend/server_gibs.py)
  - GET  /api/sensor-model
  - GET  /api/field-meta
  - POST /api/env/next_look/reset             {region_id, episode | start, tiles, budget, seed}
  - POST /api/env/next_look/step              {round_id, decision, action}
  - GET  /api/env/next_look/state?round_id=<id>
  - GET  /api/passes?region_id=<id>&start=<date>&end=<date>[&box=pack|context][&platforms=MODIS_TERRA,...]
  - GET  /api/evidence                        (backend.model.evidence.evidence(), one JSON for the evidence sheet)
"""

from __future__ import annotations

import argparse
import calendar as _calendar
import hashlib
import importlib
import inspect
from collections import OrderedDict
import datetime as _dt
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from pathlib import Path
import re
import sys
import threading
import time
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import numpy as np
from numpy.typing import NDArray

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.archive import FIRMS_CACHE_DIR, REGION_COUNTRY, FirmsCacheMissing, region_rows_digest  # noqa: E402
from backend.firms.archive import COUNTRY_FETCH as firms_country_fetch  # noqa: E402
from backend.firms.archive import cache_summary as firms_cache_summary  # noqa: E402
from backend.firms.archive import country_files as firms_country_files  # noqa: E402
from backend.firms.cmr_passes import CmrCacheMissing, pass_files_digest  # noqa: E402
from backend.firms.pass_timeline import pass_timeline  # noqa: E402
from backend.firms.box_index import BoxIndex  # noqa: E402
from backend.firms.current_month import CurrentMonth  # noqa: E402
from backend.firms.places import load_places, places_payload  # noqa: E402
from backend.firms.real_calendar import RECORD_CHECK_WHAT, box_calendar, box_text, firms_calendar, parse_box, record_check  # noqa: E402
from backend.firms.real_calendar import rows_csv, rows_csv_box  # noqa: E402
from backend.model import MODEL_VERSION, PROVENANCE_NOTE  # noqa: E402
from backend.model.calibrator import get_pretrained_calibrator  # noqa: E402
from backend.model.gates import build_benchmark_gates  # noqa: E402
from backend.model.grid import (  # noqa: E402
    EAST,
    GRID_H,
    GRID_W,
    NORTH,
    SOUTH,
    WEST,
    build_terrain_grid,
)
from backend.model.reconstruct import (  # noqa: E402
    DEFAULT_FIELDS_REL_DIR,
    EXPECTED_TENSOR_BYTES,
    run_reconstruction,
)
from backend.model.platforms import PLATFORM_CODES  # noqa: E402
from backend.model.platforms import family as platform_family  # noqa: E402
from backend.model import real_run as real_run_module  # noqa: E402
from backend.model.real_run import real_response, real_start_dates, solve_real_reconstruction  # noqa: E402
from backend.model.sensor_physics import (  # noqa: E402
    detection_probability,
    invert_view_zenith_from_footprint,
    observable_flux_fraction,
)
from backend.model.solver import (  # noqa: E402
    SolvedReconstructionRun,
    solve_region_reconstruction,
)
from backend.server_cube import cube_route  # noqa: E402
from backend.server_gibs import gibs_route  # noqa: E402
from backend.server_live import live_route  # noqa: E402
from backend.server_next_look import (  # noqa: E402
    ClosedWindow,
    NextLookRounds,
    RoundConflict,
    RoundNotFound,
    closed_for,
    closed_sentence,
    refuse_if_closed,
)

try:  # where the module is missing, GET /api/evidence answers 404 and says so
    from backend.model.evidence import evidence as model_evidence  # noqa: E402
except ImportError:  # pragma: no cover
    model_evidence = None
from backend.model.world_model import (  # noqa: E402
    NUM_FRAMES,
    SIGMA_MAX_MW_KM2,
    Z_MAX_MW_KM2,
)
from backend.terrain.live_region import (  # noqa: E402
    PRESET_BY_ID,
    PRESET_REGIONS,
    load_region_terrain,
    resolve_region_request,
)
from backend.terrain.terrain_pack import (  # noqa: E402
    DEFAULT_IMAGERY,
    ELSEWHERE_IMAGERY,
    IMAGERY_SOURCES,
    TerrainPackManager,
    choose_imagery,
    pack_descriptor,
)

TERRAIN_PACK_CONTENT_TYPES: dict[str, str] = {
    ".bin": "application/octet-stream",
    ".jpg": "image/jpeg",
    ".png": "image/png",
}

DEFAULT_HOST: str = "127.0.0.1"
DEFAULT_PORT: int = 8788
MAX_CACHED_RUNS: int = 24
# Run whose metrics evaluate the run-based benchmark gates (G1, G5) when /api/sensor-model gets no run_id.
DEFAULT_GATE_RUN_ID: str = "plumas_ca_holdout0_cnone"


def _index_footprint_arrays(observer_data: dict[str, Any]) -> list[NDArray[np.float64]]:
    arrays: list[NDArray[np.float64]] = []
    for frame_obj in observer_data["frames"]:
        fps = frame_obj["footprints"]
        if fps:
            arrays.append(np.asarray(fps, dtype=np.float64))
        else:
            arrays.append(np.empty((0, 8), dtype=np.float64))
    return arrays


# Real run start dates for the calendar: `real_start_dates` over every month from 2012 (VIIRS) whose
# box holds at least as many MODIS rows as a worth-showing window needs MODIS pixels.
START_SEARCH_FIRST_YEAR: int = 2012
START_SEARCH_MIN_MODIS_ROWS: int = 100


HIDDEN_COUNTS_NOTE: str = ("none: the list carries MODIS counts only; what the hidden satellite saw in a window comes "
                           "with that run's reveal")


def without_hidden_counts(value: dict[str, Any]) -> dict[str, Any]:
    """A start list with no count taken from the hidden instrument (also for a list saved before they were left out),
    each start marked `closed` when its window lies where the closed rule refuses a held-out run, round or play."""
    out = {k: v for k, v in value.items() if k != "labels_from_hidden_rows"}
    spec = PRESET_BY_ID.get(str(value.get("region_id")))
    starts, sentence = [], None
    for e in value.get("starts") or []:
        e = {k: v for k, v in e.items() if not k.startswith("viirs_")}
        found = None
        if spec is not None and e.get("first_overpass_utc") and e.get("last_overpass_utc"):
            t0 = _dt.datetime.fromisoformat(e["first_overpass_utc"].replace("Z", "+00:00")).timestamp()
            t1 = _dt.datetime.fromisoformat(e["last_overpass_utc"].replace("Z", "+00:00")).timestamp() + 1.0
            found = closed_for(run_box(spec), t0, t1)
        e["closed"] = bool(found)
        if found and sentence is None:
            sentence = closed_sentence(found)
        starts.append(e)
    out["starts"] = starts
    out["hidden_counts"] = HIDDEN_COUNTS_NOTE
    out["closed_starts"] = sentence or "none of these starts is closed"
    return out


def with_default_start(value: dict[str, Any], model_default: str | None, model_error: str | None = None) -> dict[str, Any]:
    """``value`` (a start list) with ``default_start``, the start a page opens on, and ``default_rule``, which says
    how it is chosen. The model's default for the region wins when it is in the list; otherwise the start
    with the most MODIS pixels in the box (the earliest of equals), and ``default_rule`` says why. No count from a
    hidden instrument chooses it: the VIIRS count is taken after the list is made."""
    out = dict(value)
    starts = out.get("starts") or []
    if model_default and model_default in {s["start"] for s in starts}:
        out["default_start"] = model_default
        out["default_rule"] = "the model's default for this region (backend.model.real_run.real_run_starts)"
        return out
    if not starts:
        out["default_start"] = None
        out["default_rule"] = "no start is worth showing, so there is no default"
        return out
    if model_error:
        why = f"the model's default could not be read ({model_error})"
    elif model_default:
        why = f"the model's default {model_default} is not among these starts"
    else:
        why = "the model gives no default for this region"
    best = max(starts, key=lambda s: s.get("modis_pixels_in_box") or 0)
    out["default_start"] = best["start"]
    out["default_rule"] = f"the start with the most MODIS pixels in the box, because {why}"
    return out


# The modules whose code decides the start list. Their source keys the disk cache of the start search, so any change
# to the rule rebuilds it without this file naming the rule's constants.
START_RULE_MODULES: tuple[str, ...] = (
    "backend.model.real_run", "backend.model.real_blind", "backend.eval.holdout", "backend.eval.blind_test",
    "backend.eval.overpass", "backend.eval.rows",
)


def live_dir() -> Path:
    """The live test's folder (`backend/server_live.py`, `docs/live.md`): `ISOGON_LIVE_DIR`, else `live` in the world
    store the fire cube is found in (`ISOGON_WORLD_DIR`, else `data/cache/world`). The route only reads it."""
    import os

    from backend.firms.cube import world_dir

    v = os.environ.get("ISOGON_LIVE_DIR", "").strip()
    return Path(v).expanduser() if v else world_dir() / "live"


def read_rows_to_cache_end(box: tuple[float, float, float, float], start: Any, end: Any,
                           platforms: Any = None) -> list[dict[str, str]]:
    """`read_firms`, except that a window reaching into a year with no cached rows for its place is read to the end
    of the year before. The start search reads 30 days past each month it searches, so the last month of the
    country files reaches into a year that only the area API holds, and only for the places it was fetched for. A
    start whose 24 overpasses would need those rows then has fewer than 24, which the start rule says of it, instead
    of one missing year failing the place's whole start list."""
    from backend.firms import read_firms
    from backend.firms.archive import _as_utc

    try:
        return read_firms(box, start, end, platforms)
    except FirmsCacheMissing:
        t0, t1 = _as_utc(start), _as_utc(end)
        cut = t1.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        if cut <= t0 or cut >= t1:
            raise
        return read_rows_to_cache_end(box, t0, cut, platforms)


def start_rule_digest() -> str:
    h = hashlib.sha256()
    for name in START_RULE_MODULES:
        h.update(inspect.getsource(importlib.import_module(name)).encode("utf-8"))
    return h.hexdigest()


REVEAL_WITH: str = 'POST /api/reconstruct again with the same body and "reveal": true'
FITTED_VALUES_DIR: Path = _REPO_ROOT / "backend" / "model" / "fitted_values"


def withhold_scorer_keys(resp: dict[str, Any]) -> dict[str, Any]:
    """A held-out run's response without what the scorer wrote from the hidden rows, until the page asks for the
    reveal. The paths are the run's own declaration (`hidden_rows.payload_keys_from_the_scorer`), with
    `blind_test` and every name in `metrics.from_hidden_rows` added in case the declaration misses one. Nested
    objects are copied before a key is removed, so the stored run is never changed."""
    hr = resp.get("hidden_rows") if isinstance(resp.get("hidden_rows"), dict) else {}
    paths = list(hr.get("payload_keys_from_the_scorer") or [])
    paths.append("blind_test")
    paths += [f"metrics.{k}" for k in ((resp.get("metrics") or {}).get("from_hidden_rows") or [])]
    out = dict(resp)
    withheld: list[str] = []
    for path in dict.fromkeys(paths):
        parts = path.split(".")
        parent = out
        for name in parts[:-1]:
            child = parent.get(name)
            if not isinstance(child, dict):
                parent = None
                break
            parent[name] = dict(child)
            parent = parent[name]
        if parent is not None and parts[-1] in parent:
            del parent[parts[-1]]
            withheld.append(path)
    out["hidden_rows"] = {**hr, "withheld_until_reveal": withheld, "reveal_with": REVEAL_WITH}
    return out


def fitted_values_digest() -> str:
    """sha256 of the model's fitted value files: a run built with other fitted values is another run."""
    h = hashlib.sha256()
    for f in sorted(FITTED_VALUES_DIR.glob("*.json")) if FITTED_VALUES_DIR.is_dir() else []:
        h.update(f.name.encode("utf-8"))
        h.update(f.read_bytes())
    return h.hexdigest()


LOCAL_ORIGIN = re.compile(r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?$")


def origin_allowed(origin: str | None) -> bool:
    """CORS is limited to pages served from localhost, 127.0.0.1 or [::1]."""
    return bool(origin) and bool(LOCAL_ORIGIN.match(str(origin)))


def _reject_constant(name: str) -> float:
    raise ValueError(f"{name} is not allowed in a request body")


def parse_request_json(raw: bytes) -> dict[str, Any]:
    """A request body as a JSON object; NaN, Infinity and -Infinity are refused."""
    payload = json.loads(raw.decode("utf-8") or "{}", parse_constant=_reject_constant)
    if not isinstance(payload, dict):
        raise ValueError("JSON body must be an object")
    return payload


def body_number(body: dict[str, Any], key: str, lo: float | None = None, hi: float | None = None) -> float | None:
    """A finite JSON number (not a string, not a boolean), optionally within [lo, hi]; None when absent."""
    v = body.get(key)
    if v is None:
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError(f"{key} must be a number")
    f = float(v)
    if not math.isfinite(f):
        raise ValueError(f"{key} must be a finite number")
    if (lo is not None and f < lo) or (hi is not None and f > hi):
        raise ValueError(f"{key} must be between {lo} and {hi}")
    return f


def body_bool(body: dict[str, Any], key: str) -> bool:
    v = body.get(key, False)
    if v is None:
        return False
    if not isinstance(v, bool):
        raise ValueError(f"{key} must be true or false")
    return v


def body_text(body: dict[str, Any], key: str) -> str | None:
    v = body.get(key)
    if v is None:
        return None
    if not isinstance(v, str):
        raise ValueError(f"{key} must be a string")
    return v


def query_number(raw: str, name: str) -> float:
    """A finite number from a query string parameter."""
    try:
        f = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a number") from exc
    if not math.isfinite(f):
        raise ValueError(f"{name} must be a finite number")
    return f


def _finite_or_null(v: Any) -> Any:
    if isinstance(v, float):
        return v if math.isfinite(v) else None
    if isinstance(v, dict):
        return {k: _finite_or_null(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_finite_or_null(x) for x in v]
    return v


def strict_json_bytes(payload: Any) -> bytes:
    """JSON (RFC 8259) for an answer: a number that is not finite is written as null, never as NaN or Infinity,
    which a browser's JSON parser refuses."""
    try:
        return json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
    except ValueError:
        return json.dumps(_finite_or_null(payload), ensure_ascii=False, allow_nan=False).encode("utf-8")


IMAGERY_NAMES: dict[str, str] = {
    "esri_world_imagery": "Esri World Imagery (Maxar)",
    "usgs_naip": "USGS NAIP (public domain)",
    "eox_s2cloudless_2016": "EOxCloudless 2016 by EOX IT Services GmbH (CC BY-NC-SA 4.0)",
}
OVERVIEW_IMAGERY: dict[str, str] = {"aws_terrarium_esri_world_imagery": "esri_world_imagery"}


RUN_TAIL_S: float = 15.0 * 86400.0    # the days a run's frames may take after its first overpass, when not known


def run_box(spec: Any) -> tuple[float, float, float, float]:
    b = spec.bbox
    return (float(b.west), float(b.south), float(b.east), float(b.north))


def iso_utc(t: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(int(t)))


def name_imagery(resp: dict[str, Any], choice: dict[str, Any] | None = None) -> dict[str, Any]:
    """The run answer with the imagery it holds named: `imagery` lists the overview image (`assets.satellite_url`)
    and the terrain pack's imagery, and says which source the pack takes and how it was chosen (`chosen`,
    `chosen_by`: "request" or "coverage", `why`, `asked`); when the pack's imagery is not the overview's,
    `region.terrain_source` and the provenance name the pack's, which is what the stage draws, and say that the
    overview is the fallback."""
    region = resp.get("region") or {}
    base = str(region.get("terrain_source", ""))
    overview = OVERVIEW_IMAGERY.get(base)
    pack = ((resp.get("assets") or {}).get("terrain_pack") or {}).get("ortho") or {}
    pack_source = pack.get("source")
    resp["imagery"] = {
        "overview": {"asset": "assets.satellite_url", "source": overview,
                     "credit": IMAGERY_NAMES.get(overview or "", None),
                     "use": "the image drawn when no terrain pack is given"},
        "terrain_pack": ({"source": pack_source, "credit": IMAGERY_NAMES.get(pack_source, pack_source),
                          "attribution": pack.get("attribution")} if pack_source else None),
    }
    if choice is not None:
        resp["imagery"].update({"chosen": choice["source"], "chosen_by": choice["chosen_by"], "why": choice["why"],
                                "asked": choice["asked"]})
    if pack_source and overview and pack_source != overview and base.startswith("aws_terrarium"):
        region = dict(region)
        region["terrain_source"] = f"aws_terrarium_{pack_source}"
        region["overview_source"] = base
        resp["region"] = region
        old_label = "AWS Terrarium 30m DEM + Maxar 2K Ortho"
        new_label = (f"AWS Terrarium 30m DEM + {IMAGERY_NAMES.get(pack_source, pack_source)} imagery in the terrain "
                     f"pack (an {IMAGERY_NAMES[overview]} overview is the fallback image)")
        if isinstance(resp.get("provenance"), str):
            resp["provenance"] = resp["provenance"].replace(old_label, new_label)
    return resp


def frame_fields(tensor_u8: NDArray[np.uint8], frame_idx: int, encoding: dict[str, Any] | None) -> tuple[NDArray[np.float64], NDArray[np.float64], str]:
    """(FRP density, its standard deviation, the scale read) of one frame, both in MW/km2. A real run writes its
    channels on the logarithmic byte scale its payload's ``encoding`` names (`backend/model/encoding.py`); a
    simulated run writes them linearly over 0 to Z_MAX_MW_KM2 and 0 to SIGMA_MAX_MW_KM2."""
    if encoding and encoding.get("scale") == "log10":
        from backend.model.encoding import decode_u8

        return decode_u8(tensor_u8[frame_idx, :, :, 0]), decode_u8(tensor_u8[frame_idx, :, :, 1]), "log10"
    z = tensor_u8[frame_idx, :, :, 0].astype(np.float64) / 255.0 * Z_MAX_MW_KM2
    sigma = tensor_u8[frame_idx, :, :, 1].astype(np.float64) / 255.0 * SIGMA_MAX_MW_KM2
    return z, sigma, "linear"


class IsogonDataStore:
    """In-memory scientific artifact store, dynamic world-model solver, and query engine."""

    def __init__(self, fields_dir: Path, imagery_elsewhere: str = DEFAULT_IMAGERY) -> None:
        self.fields_dir = fields_dir
        if imagery_elsewhere not in ELSEWHERE_IMAGERY:
            raise ValueError(f"imagery_elsewhere must be one of: {', '.join(ELSEWHERE_IMAGERY)}")
        # The terrain pack imagery a run takes where the public-domain source does not cover its box and the request
        # names none (`choose_imagery`): the default, or a publishable source on a server started for a recording.
        self.imagery_elsewhere = imagery_elsewhere
        self._ensure_artifacts()

        self.calibrator = get_pretrained_calibrator()
        self.calendar_bytes = (fields_dir / "calendar_2000_2026.json").read_bytes()
        self.sensor_model_bytes = (fields_dir / "sensor_model_diagnostics.json").read_bytes()
        self.sensor_model: dict[str, Any] = json.loads(self.sensor_model_bytes.decode("utf-8"))
        self.field_meta_bytes = (fields_dir / "field_metadata.json").read_bytes()
        self.field_meta: dict[str, Any] = json.loads(self.field_meta_bytes.decode("utf-8"))

        obs_raw = (fields_dir / "observer_passes.json").read_text(encoding="utf-8")
        self.observer_data: dict[str, Any] = json.loads(obs_raw)

        bin_path = fields_dir / "reconstruction_u8.bin"
        self.tensor_u8: NDArray[np.uint8] = np.fromfile(
            bin_path, dtype=np.uint8
        ).reshape(NUM_FRAMES, GRID_H, GRID_W, 4)

        grid = build_terrain_grid(repo_root=_REPO_ROOT)
        self.cell_area_km2: NDArray[np.float64] = grid.cell_area_km2
        self.frame_fp_arrays: list[NDArray[np.float64]] = _index_footprint_arrays(self.observer_data)

        self._lock = threading.Lock()
        self._runs: OrderedDict[str, tuple[SolvedReconstructionRun, list[NDArray[np.float64]]]] = OrderedDict()
        self.terrain_packs = TerrainPackManager()
        self.next_look = NextLookRounds()
        self._pass_timelines: OrderedDict[tuple[Any, ...], bytes] = OrderedDict()
        self.box_index = BoxIndex()
        # Open (and, the first time, build) the box index now, so the first drawn box does not wait for it.
        threading.Thread(target=self._warm_box_index, name="box-index-warm", daemon=True).start()
        self._box_calendars: OrderedDict[tuple[Any, ...], tuple[dict[str, Any], bytes]] = OrderedDict()
        self.current_month = CurrentMonth()
        self._current_months: dict[tuple[Any, ...], dict[str, Any]] = {}

        # Pre-warm the registry's warm region's simulated baseline from the hires_regions cache, so the landing's first
        # request answers at once
        try:
            default_spec = resolve_region_request(region_id=load_places().get("warm_region", PRESET_REGIONS[0].id))
            default_terrain = load_region_terrain(default_spec, allow_network=True)
            default_run = solve_region_reconstruction(
                region_terrain=default_terrain,
                holdout_viirs=False,
                cloud_override=None,
                calibrator=self.calibrator,
            )
            self._store_run(default_run)
        except Exception as exc:  # pragma: no cover
            sys.stderr.write(f"[Isogon API] Warning: baseline warm-up skipped: {exc}\n")

    def _ensure_artifacts(self) -> None:
        required = [
            self.fields_dir / "reconstruction_u8.bin",
            self.fields_dir / "observer_passes.json",
            self.fields_dir / "calendar_2000_2026.json",
            self.fields_dir / "sensor_model_diagnostics.json",
            self.fields_dir / "field_metadata.json",
        ]
        if not all(p.is_file() for p in required) or (
            (self.fields_dir / "reconstruction_u8.bin").stat().st_size != EXPECTED_TENSOR_BYTES
        ):
            run_reconstruction(output_dir=self.fields_dir)

    def _store_run(self, run: SolvedReconstructionRun) -> None:
        fp_arrays = _index_footprint_arrays(run.observer_passes)
        with self._lock:
            self._runs[run.run_id] = (run, fp_arrays)
            self._runs.move_to_end(run.run_id)
            while len(self._runs) > MAX_CACHED_RUNS:
                self._runs.popitem(last=False)

    def get_run(self, run_id: str) -> tuple[SolvedReconstructionRun, list[NDArray[np.float64]]] | None:
        with self._lock:
            entry = self._runs.get(run_id)
            if entry is not None:
                self._runs.move_to_end(run_id)
            return entry

    def pass_timeline_bytes(self, region_id: str, start: str, end: str, box: str, platforms: list[str] | None,
                            hidden: str | None = None) -> bytes:
        """`pass_timeline` as JSON bytes, kept for the 32 latest queries while the FIRMS row count is unchanged."""
        if region_id not in REGION_COUNTRY:
            raise KeyError(f"no pass schedule for region '{region_id}'")
        key = (region_id, start, end, box, tuple(platforms) if platforms else None, hidden, self.region_rows_key(region_id),
               pass_files_digest(region_id))
        with self._lock:
            hit = self._pass_timelines.get(key)
            if hit is not None:
                self._pass_timelines.move_to_end(key)
                return hit
        body = json.dumps(pass_timeline(region_id, start, end, box, platforms, hidden=hidden), ensure_ascii=False).encode("utf-8")
        with self._lock:
            self._pass_timelines[key] = body
            while len(self._pass_timelines) > 32:
                self._pass_timelines.popitem(last=False)
        return body

    def region_rows_key(self, region_id: str, max_age_s: float = 10.0) -> str:
        """`region_rows_digest` of the region, re-read at most every ``max_age_s``."""
        now = time.monotonic()
        with self._lock:
            memo = self.__dict__.setdefault("_region_rows_keys", {})
            hit = memo.get(region_id)
        if hit is not None and now - hit[0] < max_age_s:
            return hit[1]
        key = region_rows_digest(region_id)
        with self._lock:
            memo[region_id] = (now, key)
        return key

    def firms_counts(self, max_age_s: float = 10.0) -> dict[str, Any]:
        """Row counts from the FIRMS cache manifests, re-read at most every ``max_age_s``."""
        now = time.monotonic()
        cached = getattr(self, "_firms_counts", None)
        if cached is None or now - cached[0] > max_age_s:
            cached = (now, firms_cache_summary())
            self._firms_counts = cached
        return cached[1]

    def firms_calendar_payload(self, region_id: str) -> tuple[bytes, dict[str, Any]]:
        """The real calendar of ``region_id`` as bytes, with its ``real_run_starts``;
        rebuilt when any row of the region changes (its rows digest), not when another region's rows do."""
        if region_id not in REGION_COUNTRY:
            raise KeyError(region_id)
        key = self.region_rows_key(region_id)
        with self._lock:
            calendars = self.__dict__.setdefault("_firms_calendars", {})
            hit = calendars.get(region_id)
        if hit is not None and hit[0] == key:
            return hit[1], hit[2]
        cal = firms_calendar(region_id)
        try:
            starts = self.real_run_starts(region_id, cal, key)
        except Exception as exc:  # noqa: BLE001  (the calendar answers even when the start search cannot)
            sys.stderr.write(f"[Isogon API] real_run_starts for {region_id} failed: {exc}\n")
            starts = {"starts": [], "error": f"start dates unavailable: {exc}", "default_start": None,
                      "default_rule": "no start list, so there is no default"}
        cal["real_run_starts"] = starts
        body = json.dumps(cal, ensure_ascii=False).encode("utf-8")
        with self._lock:
            calendars[region_id] = (key, body, starts)
        return body, starts

    def firms_calendar_bytes(self, region_id: str) -> bytes:
        return self.firms_calendar_payload(region_id)[0]

    def record_checks_payload(self) -> dict[str, Any]:
        """The held-out check of the Record for every region with rows and every place of the Record only
        (`record_only_places` in the places registry), each read from that place's own calendar. A region's check is
        kept while its rows are unchanged; it is taken from the served calendar when that is built, and otherwise
        from the calendar alone, without the start search."""
        places: list[dict[str, Any]] = []
        definition: dict[str, Any] = {}
        for rid in REGION_COUNTRY:
            spec = PRESET_BY_ID[rid]
            entry: dict[str, Any] = {"kind": "region", "id": rid, "name": spec.name,
                                     "countries": [REGION_COUNTRY[rid].replace("_", " ")],
                                     "calendar": f"/api/calendar?source=firms&region_id={rid}"}
            try:
                key = self.region_rows_key(rid)
                with self._lock:
                    checks = self.__dict__.setdefault("_record_checks", {})
                    hit = checks.get(rid)
                    served = self.__dict__.get("_firms_calendars", {}).get(rid)
                if hit is not None and hit[0] == key:
                    check, defs = hit[1], hit[2]
                else:
                    cal = json.loads(served[1]) if served is not None and served[0] == key else firms_calendar(rid)
                    v = cal["harmonization_method"]["validation"]
                    check, defs = {"box": cal["bbox"], **record_check(cal)}, {k: v[k] for k in ("definition", "nominal_interval")}
                    with self._lock:
                        checks[rid] = (key, check, defs)
                entry.update(check)
                definition = definition or defs
            except Exception as exc:  # noqa: BLE001  (one place that cannot answer does not stop the others)
                entry["error"] = str(exc)
            places.append(entry)
        for place in load_places().get("record_only_places", []):
            entry = {"kind": "box", "id": place["id"], "name": place["name"], "countries": [place["country"].replace("_", " ")],
                     "calendar": "/api/calendar?source=firms&box=" + box_text(place["box"]), "record_only": place["why"]}
            try:
                cal = self.box_calendar_payload(tuple(float(v) for v in place["box"]))[0]
                v = cal["harmonization_method"]["validation"]
                entry.update({"box": cal["bbox"], **record_check(cal)})
                definition = definition or {k: v[k] for k in ("definition", "nominal_interval")}
            except Exception as exc:  # noqa: BLE001
                entry["error"] = str(exc)
            places.append(entry)
        return {"what": RECORD_CHECK_WHAT, **definition, "places": places}

    def _warm_box_index(self) -> None:
        try:
            self.box_index.tables()
        except Exception as exc:  # noqa: BLE001  (a box request builds or reports it again)
            sys.stderr.write(f"[Isogon API] box index not ready: {exc}\n")

    def box_index_key(self, max_age_s: float = 10.0) -> str:
        """The digest of the country files the box index reads, re-read at most every ``max_age_s``."""
        now = time.monotonic()
        with self._lock:
            hit = self.__dict__.get("_box_index_key")
        if hit is not None and now - hit[0] < max_age_s:
            return hit[1]
        key = self.box_index.digest()
        with self._lock:
            self._box_index_key = (now, key)
        return key

    def box_calendar_payload(self, box: tuple[float, float, float, float]) -> tuple[dict[str, Any], bytes]:
        """The calendar of any box (``box_calendar``), kept for the 32 latest boxes while the country files are
        unchanged."""
        key = (box, self.box_index_key())
        with self._lock:
            hit = self._box_calendars.get(key)
            if hit is not None:
                self._box_calendars.move_to_end(key)
                return hit
        cal = box_calendar(box, self.box_index)
        entry = (cal, json.dumps(cal, ensure_ascii=False).encode("utf-8"))
        with self._lock:
            self._box_calendars[key] = entry
            while len(self._box_calendars) > 32:
                self._box_calendars.popitem(last=False)
        return entry

    def current_month_payload(self, region_id: str | None, box: tuple[float, float, float, float] | None) -> dict[str, Any]:
        """This month so far against its median for a region or a box. A ready answer is kept for the UTC day."""
        if region_id is not None:
            cal = json.loads(self.firms_calendar_bytes(region_id).decode("utf-8"))
            cal_key = self.region_rows_key(region_id)
        else:
            assert box is not None
            cal = self.box_calendar_payload(box)[0]
            cal_key = self.box_index_key()
        key = (region_id, box, cal_key, self.current_month.clock().isoformat())
        with self._lock:
            hit = self._current_months.get(key)
        if hit is not None:
            return hit
        out = self.current_month.read(cal["place"], cal)
        if out.get("status") == "ready":
            with self._lock:
                if len(self._current_months) >= 64:
                    self._current_months.pop(next(iter(self._current_months)))
                self._current_months[key] = out
        return out

    def regions_full_payload(self) -> dict[str, Any]:
        """`regions_payload` and the places registry (`backend/firms/places.py`)."""
        out = self.regions_payload()
        out["schema_version"] = "1.1.0"

        def starts(region_id: str) -> list[dict[str, Any]]:
            try:
                return list(self.firms_calendar_payload(region_id)[1].get("starts", []))
            except Exception:  # noqa: BLE001  (the registry answers without a start list)
                return []

        out.update(places_payload(starts, self.box_index))
        return out

    def real_run_starts(self, region_id: str, cal: dict[str, Any], rows_key: int) -> dict[str, Any]:
        """Every worth-showing start date of a real run in the region (``real_start_dates``), with
        the ``default_start`` to open on (``with_default_start``). The default is asked of
        ``backend.model.real_run.real_run_starts`` each time, so it follows that function when its rule changes."""
        value = self._searched_run_starts(region_id, cal, rows_key)
        model_default, model_error = None, None
        try:
            model_default = real_run_module.real_run_starts(PRESET_BY_ID[region_id]).get("default_start")
        except Exception as exc:  # noqa: BLE001  (the list still answers, with the fallback default)
            model_error = str(exc)
        return with_default_start(value, model_default, model_error)

    def _searched_run_starts(self, region_id: str, cal: dict[str, Any], rows_key: int) -> dict[str, Any]:
        """The start search over the calendar months that can hold a start. Cached on disk under the FIRMS cache,
        keyed by the row count, the months searched and the source of the model's rule."""
        months = [
            r["year_month"] for r in cal["records"]
            if r["year"] >= START_SEARCH_FIRST_YEAR
            and sum((r["raw_counts"].get(p) or {}).get("total", 0) for p in ("Terra", "Aqua")) >= START_SEARCH_MIN_MODIS_ROWS
        ]
        cache_key = {"rows_sha256": rows_key, "months": months, "rule": start_rule_digest()}
        disk = FIRMS_CACHE_DIR / "derived" / f"real_run_starts_{region_id}.json"
        try:
            saved = json.loads(disk.read_text(encoding="utf-8"))
            if saved.get("key") == cache_key:
                return without_hidden_counts(saved["value"])
        except (OSError, ValueError, AttributeError):
            pass
        spec = PRESET_BY_ID[region_id]
        starts: list[dict[str, Any]] = []
        d: dict[str, Any] = {}
        for ym in months:
            y, mo = int(ym[:4]), int(ym[5:7])
            last = _calendar.monthrange(y, mo)[1]
            d = real_start_dates(spec, f"{ym}-01", f"{ym}-{last:02d}", read_firms=read_rows_to_cache_end)
            busiest = set(d.get("busiest") or [])
            for e in d["starts"]:
                if not e.get("worth_showing"):
                    continue
                # Only MODIS counts: a count from the hidden instrument would tell each window's hidden total before
                # any reveal, so none is kept.
                starts.append({
                    "start": e["start"],
                    "label": (f"{e['start']}: {e['modis_pixels_in_box']:,} MODIS pixels in "
                              f"{e.get('modis_overpasses', 24)} MODIS overpasses over {e['span_hours']:.0f} h"),
                    "first_overpass_utc": e["first_overpass_utc"],
                    "last_overpass_utc": e["last_overpass_utc"],
                    "span_hours": e["span_hours"],
                    "modis_overpasses": e.get("modis_overpasses"),
                    "modis_pixels_in_box": e["modis_pixels_in_box"],
                    "busiest_in_month": e["start"] in busiest,
                })
        value = {
            "region_id": region_id,
            "source": "firms",
            "starts": sorted(starts, key=lambda x: x["start"]),
            "rule": d.get("rule"),
            "chosen_from": d.get("chosen_from"),
            "hidden_counts": HIDDEN_COUNTS_NOTE,
            "search": (f"months from {START_SEARCH_FIRST_YEAR} whose region box holds at least "
                       f"{START_SEARCH_MIN_MODIS_ROWS} MODIS rows; {len(months)} months searched"),
            "from": "backend.model.real_run.real_start_dates",
        }
        disk.parent.mkdir(parents=True, exist_ok=True)
        tmp = disk.with_name(f".{disk.name}.{threading.get_ident()}.tmp")
        tmp.write_text(json.dumps({"key": cache_key, "value": value}, ensure_ascii=False), encoding="utf-8")
        tmp.replace(disk)
        return without_hidden_counts(value)

    def warm_firms(self) -> None:
        """Build the real calendars and their start lists in the background, so the first page request is fast."""

        def _run() -> None:
            for rid in REGION_COUNTRY:
                try:
                    self.firms_calendar_payload(rid)
                except Exception as exc:  # noqa: BLE001
                    sys.stderr.write(f"[Isogon API] real calendar warm-up for {rid} skipped: {exc}\n")

        threading.Thread(target=_run, name="firms-warm", daemon=True).start()

    def health_payload(self) -> dict[str, Any]:
        with self._lock:
            cached_ids = list(self._runs.keys())
        firms = self.firms_counts()
        return {
            "status": "ok",
            "service": "isogon-scientific-backend",
            "model_version": MODEL_VERSION,
            "provenance_note": PROVENANCE_NOTE,
            "downloaded_firms_rows": firms["downloaded_rows"],
            "firms_cache": {
                "downloaded_files": firms["downloaded_files"],
                "rows_in_region_boxes": firms["rows_in_region_boxes"],
                "note": "real NASA FIRMS rows in the local cache; simulated runs use none of them",
            },
            "terrain_source": self.field_meta.get("terrain_source", "unknown"),
            "calibrator": self.calibrator.diagnostics.to_dict(),
            "cached_runs": len(cached_ids),
            "grid": {
                "frames": NUM_FRAMES,
                "height": GRID_H,
                "width": GRID_W,
                "channels": 4,
                "bbox": [WEST, SOUTH, EAST, NORTH],
                "z_hat_max_mw_km2": Z_MAX_MW_KM2,
                "sigma_max_mw_km2": SIGMA_MAX_MW_KM2,
            },
            "endpoints": [
                "/api/health",
                "/api/regions",
                "/api/reconstruct",
                "/api/runs/<run_id>/<asset>",
                "/api/runs/<run_id>/terrain/<name>",
                "/api/observer?frame=12&sensor=viirs",
                "/api/calendar",
                "/api/calendar?source=firms&region_id=plumas_ca",
                "/api/calendar/rows.csv?region_id=plumas_ca&start=2021-08-01&end=2021-09-01",
                "/api/calendar/checks",
                "/api/cube/record?box=-9.5,37,-6,42",
                "/api/cube/layers",
                "/api/live",
                "/api/gibs/day?region_id=plumas_ca&day=2012-08-10&platform=MODIS_TERRA&kind=true_color",
                "/api/gibs/cloud?region_id=plumas_ca&day=2012-08-10&when=day",
                "/api/sensor-model",
                "/api/field-meta",
            ],
        }

    def sensor_model_payload(self, run_id: str | None) -> bytes:
        """Sensor model diagnostics with the benchmark gates evaluated for one reconstruct run.

        G1 and G5 read the metrics of that run; G3 reads the paired calibration in the same payload.
        Without a stored run the static file is served as is (G1 and G5 NOT_EVALUATED)."""
        entry = self.get_run(run_id) if run_id else None
        if entry is None and run_id and "_firms_" in str(run_id):
            # A real run that has left the run cache: never answer with the default simulated run's gates.
            # `backend.model.gates` marks G1 and G5 not evaluated on any real run; pass that through.
            metrics: dict[str, Any] | None = {"source": "firms"}
            gate_run_id = str(run_id)
        else:
            if entry is None:
                entry = self.get_run(DEFAULT_GATE_RUN_ID)
            if entry is None:
                return self.sensor_model_bytes
            metrics, gate_run_id = entry[0].metrics, entry[0].run_id
        payload = dict(self.sensor_model)
        payload["benchmark_gates"] = build_benchmark_gates(
            self.sensor_model["paired_1330_calibration"], metrics, gate_run_id
        )
        payload["benchmark_gates_run_id"] = gate_run_id
        return json.dumps(payload, ensure_ascii=False).encode("utf-8")

    def regions_payload(self) -> dict[str, Any]:
        return {
            "schema_version": "1.0.0",
            "presets": [spec.to_summary_dict() for spec in PRESET_REGIONS if spec.id in REGION_COUNTRY],
        }

    def execute_reconstruct(self, body: dict[str, Any]) -> dict[str, Any]:
        # Every field is type checked: a string "false" is not false, and NaN or Infinity never reach the solver.
        region_id = body_text(body, "region_id")
        query_text = body_text(body, "query_text")
        center_lat = body_number(body, "center_lat", -90.0, 90.0)
        center_lon = body_number(body, "center_lon", -180.0, 180.0)
        span_lon = body_number(body, "span_lon_deg", 0.0, 360.0)
        span_lat = body_number(body, "span_lat_deg", 0.0, 180.0)
        holdout_viirs = body_bool(body, "holdout_viirs")
        holdout = body_text(body, "holdout")  # a second spelling: "viirs" equals holdout_viirs true
        if holdout not in (None, "viirs"):
            raise ValueError("holdout must be 'viirs' or absent")
        holdout_viirs = holdout_viirs or holdout == "viirs"
        cloud_override = body_number(body, "cloud_override", 0.0, 1.0)
        body_bool(body, "reveal")
        body_text(body, "start")
        body_text(body, "source")
        # Optional terrain pack imagery: "esri_world_imagery", "usgs_naip" (public domain, conterminous United States)
        # or "eox_s2cloudless_2016" (CC BY-NC-SA 4.0, global). Where the body names none, the server chooses by coverage
        # (`choose_imagery`); the answer's `imagery` says which and how.
        imagery = body_text(body, "imagery_source")
        if imagery is not None and imagery not in IMAGERY_SOURCES:
            raise ValueError(f"Unknown imagery_source '{imagery}'. Expected one of: {', '.join(sorted(IMAGERY_SOURCES))}")
        # "source": "firms" reconstructs real FIRMS overpasses; without it the run is simulated.
        source = str(body.get("source") or "simulated")
        if source not in ("simulated", "firms"):
            raise ValueError("source must be 'firms', or omitted for a simulated run")

        spec = resolve_region_request(
            region_id=str(region_id) if region_id is not None else None,
            center_lat=center_lat,
            center_lon=center_lon,
            span_lon_deg=span_lon,
            span_lat_deg=span_lat,
            query_text=str(query_text) if query_text is not None else None,
        )
        if source == "firms":
            return self.execute_real_reconstruct(body, spec, holdout_viirs, cloud_override, imagery)

        c_tag = "cnone" if cloud_override is None else f"c{int(round(cloud_override * 100)):02d}"
        h_tag = "holdout1" if holdout_viirs else "holdout0"
        candidate_run_id = f"{spec.id}_{h_tag}_{c_tag}"

        cached = self.get_run(candidate_run_id)
        if cached is not None:
            solved = cached[0]
        else:
            terrain = load_region_terrain(spec=spec, allow_network=True)
            solved = solve_region_reconstruction(
                region_terrain=terrain,
                holdout_viirs=holdout_viirs,
                cloud_override=cloud_override,
                calibrator=self.calibrator,
            )
            self._store_run(solved)

        rid = solved.run_id
        choice = self.choose_imagery(solved, imagery)
        return name_imagery({
            "run_id": rid,
            "provenance": solved.provenance,
            "downloaded_firms_rows": 0,
            "region": solved.region_terrain.to_region_metadata(),
            "assets": self.run_assets(solved, choice["source"]),
            "pipeline_stages": solved.pipeline_stages,
            "metrics": solved.metrics,
            "epoch_summaries": solved.epoch_summaries,
            "observer_passes": solved.observer_passes,
        }, choice)

    def execute_real_reconstruct(
        self,
        body: dict[str, Any],
        spec: Any,
        holdout_viirs: bool,
        cloud_override: float | None,
        imagery: str | None,
    ) -> dict[str, Any]:
        """A run on real FIRMS overpasses (`backend.model.real_run`), served in the simulated run's shape plus
        its additive keys. ``start`` is a UTC date or date-time; ``holdout_viirs`` hides every VIIRS detection."""
        if cloud_override is not None:
            raise ValueError("cloud_override applies to simulated runs only; a real run uses the real rows")
        start = body.get("start")
        if not start:
            raise ValueError("source 'firms' needs 'start', a UTC date or date-time such as 2021-07-22T20:34:00Z")
        if holdout_viirs:
            # A held-out run is scored against the hidden satellite, so none is built on a closed window. The rule is
            # asked with the run's box and its own window, found from MODIS rows and the pass list as the run finds
            # it, before terrain is loaded or anything is solved.
            refuse_if_closed(run_box(spec), *self.run_window(spec, str(start)))
        if spec.id not in REGION_COUNTRY:
            raise FirmsCacheMissing(
                "a real run reads the cached FIRMS rows of a region; a box of its own has its calendar "
                "(GET /api/calendar?source=firms&box=) and no run yet")
        # Keyed on what decides the run: region, start, what is hidden, the region's rows and the fitted values.
        key = (spec.id, str(start), bool(holdout_viirs), self.region_rows_key(spec.id), fitted_values_digest())
        with self._lock:
            real_ids = self.__dict__.setdefault("_real_run_ids", {})
            rid = real_ids.get(key)
        cached = self.get_run(rid) if rid else None
        if cached is not None:
            solved = cached[0]
        else:
            terrain = load_region_terrain(spec=spec, allow_network=True)
            solved = solve_real_reconstruction(terrain, str(start), holdout_viirs=bool(holdout_viirs))
            self._store_run(solved)
            with self._lock:
                real_ids[key] = solved.run_id
        choice = self.choose_imagery(solved, imagery)
        resp = name_imagery(real_response(solved, self.run_assets(solved, choice["source"])), choice)
        if holdout_viirs and not body_bool(body, "reveal"):
            return withhold_scorer_keys(resp)
        return resp

    def run_window(self, spec: Any, start: str) -> tuple[float, float]:
        """(start, end) in UTC seconds of the window a real run from ``start`` plays, found as the run finds it: the
        first MODIS overpass with a detection in the box at or after the start, then the frames of the pass list,
        from MODIS rows only (`backend.model.real_blind.run_frames`; the window does not depend on what is hidden).
        Where it cannot be found (a box with no cached rows, too few passes), the whole span the run may reach: the
        30 days it searches for its first overpass and the days its frames may take after it."""
        from backend.eval.holdout import visible_rows
        from backend.eval.rows import detections_from_rows
        from backend.firms import read_firms, region_box
        from backend.model.real_blind import FRAMES, run_frames
        from backend.model.real_run import PAD_S, ROW_SOURCE, SEARCH_S, parse_start_s

        try:
            t0 = parse_start_s(start)
        except (TypeError, ValueError) as exc:
            raise ValueError("start must be a UTC date (YYYY-MM-DD) or date-time") from exc
        key = (spec.id, start, self.region_rows_key(spec.id) if spec.id in REGION_COUNTRY else None)
        with self._lock:
            memo = self.__dict__.setdefault("_run_windows", {})
            if key in memo:
                return memo[key]
        window = (t0, t0 + SEARCH_S + RUN_TAIL_S)
        if spec.id in REGION_COUNTRY:
            try:
                rows = read_firms(region_box(spec.id), iso_utc(t0 - PAD_S), iso_utc(t0 + SEARCH_S))
                seen = visible_rows(detections_from_rows(rows, ROW_SOURCE), "VIIRS")
                _frames, win = run_frames(seen, run_box(spec), t0, n=FRAMES, hidden="VIIRS")
                window = (float(win.start_s), float(win.end_s))
            except Exception:  # noqa: BLE001  (no window found: the whole span it may reach is asked instead)
                pass
        with self._lock:
            if len(memo) > 256:
                memo.clear()
            memo[key] = window
        return window

    def choose_imagery(self, solved: SolvedReconstructionRun, asked: str | None) -> dict[str, Any]:
        """The terrain pack imagery of a run on its own box: the named source where it covers the box, else by
        coverage (`backend.terrain.terrain_pack.choose_imagery`), with this server's imagery elsewhere."""
        return choose_imagery(solved.region_terrain.spec.bbox, asked, getattr(self, "imagery_elsewhere", DEFAULT_IMAGERY))

    def run_assets(self, solved: SolvedReconstructionRun, imagery: str) -> dict[str, Any]:
        """The ``assets`` object of a run response, the same for simulated and real runs. ``imagery`` is the source
        `choose_imagery` gave, which covers the run's box."""
        rid = solved.run_id
        sat_ext = "png" if "png" in solved.region_terrain.satellite_content_type.lower() else "jpg"
        assets: dict[str, Any] = {
            "dem_f32_url": f"/api/runs/{rid}/dem_f32.bin",
            "dem_hires_f32_url": f"/api/runs/{rid}/dem_hires_f32.bin",
            "satellite_url": f"/api/runs/{rid}/satellite.{sat_ext}",
            "reconstruction_u8_url": f"/api/runs/{rid}/reconstruction_u8.bin",
            "export_geojson_url": f"/api/runs/{rid}/export.geojson",
            "export_csv_url": f"/api/runs/{rid}/export.csv",
        }
        pack_meta = self.terrain_pack_meta(solved, imagery)
        if pack_meta is not None:
            assets["terrain_pack"] = pack_descriptor(pack_meta, rid)
            assets["terrain_pack_status"] = "ready"
        elif solved.region_terrain.terrain_source.startswith("aws_terrarium"):
            # "building": POST the same request again later to receive assets.terrain_pack.
            assets["terrain_pack_status"] = self.terrain_packs.status(solved.region_terrain.spec, imagery)
        else:
            # Procedural fallback terrain: a pack cannot register to it, so none is built.
            assets["terrain_pack_status"] = "absent"
        return assets

    def terrain_pack_meta(
        self, solved: SolvedReconstructionRun, imagery: str = DEFAULT_IMAGERY
    ) -> dict[str, Any] | None:
        """Pack meta for a run, or None. Packs only pair with real (Terrarium) base terrain, since a
        pack registers to dem_hires_f32.bin and a procedural fallback DEM would not match it. A
        missing pack is queued for a background build and the run is served without it."""
        if not solved.region_terrain.terrain_source.startswith("aws_terrarium"):
            return None
        return self.terrain_packs.get(solved.region_terrain.spec, build_if_missing=True, wait_s=0.0, imagery=imagery)

    def query_observer(
        self,
        frame_idx: int,
        sensor_filter: str,
        min_frp: float,
        max_zenith: float,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        """Filter passes and footprints and recompute live sensitivity metrics in NumPy."""
        active_obs = self.observer_data
        active_fp_arrays = self.frame_fp_arrays
        active_tensor = self.tensor_u8
        active_area = self.cell_area_km2
        active_prov = PROVENANCE_NOTE
        active_encoding: dict[str, Any] | None = None

        if run_id:
            entry = self.get_run(run_id)
            if entry is not None:
                run_obj, run_fps = entry
                active_obs = run_obj.observer_passes
                active_fp_arrays = run_fps
                active_tensor = run_obj.tensor_u8
                active_area = run_obj.cell_area_km2
                active_prov = run_obj.provenance
                active_encoding = (getattr(run_obj, "extras", None) or {}).get("encoding")

        frame_meta = active_obs["frames"][frame_idx]
        fp_mat = active_fp_arrays[frame_idx]
        is_day = bool(frame_meta["is_day"])

        # Platform codes from the model's table: 0 to 3 as in the simulated engine, 4 Suomi NPP (real runs).
        s_norm = sensor_filter.strip().lower()
        modis_codes = [c for n, c in PLATFORM_CODES.items() if platform_family(n) == "MODIS"]
        viirs_codes = [c for n, c in PLATFORM_CODES.items() if platform_family(n) == "VIIRS"]
        if s_norm == "all":
            allowed_codes = np.array(modis_codes + viirs_codes, dtype=np.int32)
            family_for_flux = "VIIRS"
        elif s_norm == "modis":
            allowed_codes = np.array(modis_codes, dtype=np.int32)
            family_for_flux = "MODIS"
        elif s_norm == "viirs":
            allowed_codes = np.array(viirs_codes, dtype=np.int32)
            family_for_flux = "VIIRS"
        elif s_norm.upper() in PLATFORM_CODES:
            code = PLATFORM_CODES[s_norm.upper()]
            allowed_codes = np.array([code], dtype=np.int32)
            family_for_flux = platform_family(s_norm.upper())
        else:
            raise ValueError(
                f"Unsupported sensor filter '{sensor_filter}'. Expected all, modis, or viirs."
            )

        matching_passes = [
            p for p in frame_meta["passes"] if int(p["sensor_code"]) in allowed_codes
        ]

        if fp_mat.shape[0] > 0:
            codes_col = fp_mat[:, 7].astype(np.int32)
            sensor_mask = np.isin(codes_col, allowed_codes)
            sensor_pool_count = int(np.sum(sensor_mask))

            scan_col = fp_mat[:, 2]
            track_col = fp_mat[:, 3]
            frp_col = fp_mat[:, 5]
            area_col = scan_col * track_col

            local_vza_deg = invert_view_zenith_from_footprint(scan_col, track_col, codes_col)
            pi_modis = detection_probability(frp_col, area_col, "MODIS", is_day=is_day)
            pi_viirs = detection_probability(frp_col, area_col, "VIIRS", is_day=is_day)
            pi_eff = np.where(codes_col >= 2, pi_viirs, pi_modis)

            keep_mask = (
                sensor_mask
                & (frp_col >= min_frp)
                & (local_vza_deg <= max_zenith)
                & (pi_eff >= 0.25)
            )
            kept = fp_mat[keep_mask]
            kept_vza = local_vza_deg[keep_mask]
            kept_area = area_col[keep_mask]
        else:
            sensor_pool_count = 0
            kept = np.empty((0, 8), dtype=np.float64)
            kept_vza = np.empty((0,), dtype=np.float64)
            kept_area = np.empty((0,), dtype=np.float64)

        footprints_out: list[list[float | int]] = [
            [
                round(float(row[0]), 4),
                round(float(row[1]), 4),
                round(float(row[2]), 2),
                round(float(row[3]), 2),
                round(float(row[4]), 1),
                round(float(row[5]), 2),
                int(round(row[6])),
                int(round(row[7])),
            ]
            for row in kept
        ]

        if matching_passes:
            active_pass = matching_passes[0]
            if s_norm == "all":
                active_pass = next(
                    (p for p in matching_passes if p["sensor"] == frame_meta["sensor"]),
                    matching_passes[0],
                )
            pass_present = bool(float(active_pass["view_zenith_deg"]) <= max_zenith)
        else:
            active_pass = {
                "sensor": frame_meta["sensor"],
                "sensor_code": PLATFORM_CODES.get(frame_meta["sensor"], -1),
                "subsat_lon": frame_meta["subsat_lon"],
                "subsat_lat": frame_meta["subsat_lat"],
                "altitude_km": frame_meta["altitude_km"],
                "scan_angle_deg": frame_meta["scan_angle_deg"],
                "azimuth_deg": frame_meta["azimuth_deg"],
                "view_zenith_deg": frame_meta["view_zenith_deg"],
                "swath_fraction": 0.0,
            }
            pass_present = False

        z_hat_slice, sigma_slice, scale_read = frame_fields(active_tensor, frame_idx, active_encoding)
        reconstructed_total_frp_mw = float(np.sum(z_hat_slice * active_area))
        high_sigma_frac = float(np.mean(sigma_slice > 8.0))

        eff_vza = min(float(active_pass["view_zenith_deg"]), max_zenith)
        flux_surviving = (
            observable_flux_fraction(
                family=family_for_flux,
                view_zenith_deg=eff_vza,
                is_day=is_day,
                min_frp_filter_mw=max(0.0, min_frp),
            )
            if (matching_passes and float(active_pass["view_zenith_deg"]) <= max_zenith)
            else 0.0
        )

        return {
            "schema_version": "1.0.0",
            "run_id": run_id,
            "provenance": active_prov,
            "frame": frame_idx,
            "timestamp_utc": frame_meta["timestamp_utc"],
            "local_solar_time_hr": frame_meta["local_solar_time_hr"],
            "is_day": is_day,
            "epistemic_regime": frame_meta["epistemic_regime"],
            "sensor_filter": s_norm,
            "overpass_present": pass_present,
            "sensor": active_pass["sensor"],
            "subsat_lon": active_pass["subsat_lon"],
            "subsat_lat": active_pass["subsat_lat"],
            "altitude_km": active_pass["altitude_km"],
            "scan_angle_deg": active_pass["scan_angle_deg"],
            "azimuth_deg": active_pass["azimuth_deg"],
            "view_zenith_deg": active_pass["view_zenith_deg"],
            "cloud_fraction": frame_meta["cloud_fraction"],
            "passes": matching_passes,
            "sensitivity_diagnostics": {
                "applied_min_frp_mw": round(min_frp, 2),
                "applied_max_zenith_deg": round(max_zenith, 2),
                "sensor_pool_footprints": sensor_pool_count,
                "retained_footprints": len(footprints_out),
                "omitted_by_filter_footprints": max(0, sensor_pool_count - len(footprints_out)),
                "retained_total_frp_mw": round(float(np.sum(kept[:, 5])) if kept.size else 0.0, 2),
                "mean_footprint_area_km2": round(float(np.mean(kept_area)) if kept_area.size else 0.0, 3),
                "mean_local_view_zenith_deg": round(float(np.mean(kept_vza)) if kept_vza.size else 0.0, 2),
                "observable_flux_fraction": flux_surviving,
                "reconstructed_field_total_frp_mw": round(reconstructed_total_frp_mw, 2),
                "mean_epistemic_sigma_mw_km2": round(float(np.mean(sigma_slice)), 3),
                "high_uncertainty_area_fraction": round(high_sigma_frac, 3),
                "intensity_scale": scale_read,
            },
            "footprint_schema": active_obs["footprint_schema"],
            "footprints": footprints_out,
        }


class IsogonHTTPServer(ThreadingHTTPServer):
    """ThreadingHTTPServer with fast socket reuse and attached IsogonDataStore."""

    allow_reuse_address = True

    def __init__(self, server_address: tuple[str, int], store: IsogonDataStore) -> None:
        super().__init__(server_address, IsogonRequestHandler)
        self.store = store


class IsogonRequestHandler(BaseHTTPRequestHandler):
    """CORS-enabled JSON and binary tensor handler for Isogon world-model endpoints."""

    server: IsogonHTTPServer
    timeout = 60  # seconds a client may hold a socket idle

    def _send_cors_headers(self, cache: str = "no-store") -> None:
        origin = self.headers.get("Origin") if self.headers else None
        if origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", str(origin))
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept, If-None-Match")
        self.send_header("Access-Control-Expose-Headers", "ETag, X-Row-Count, Content-Disposition")
        self.send_header("Cache-Control", cache)

    def _send_bytes(
        self,
        status: int,
        body: bytes,
        content_type: str,
        extra_headers: dict[str, str] | None = None,
        cache: str = "no-store",
    ) -> None:
        self.send_response(status)
        self._send_cors_headers(cache)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        if getattr(self, "_suppress_body", False):
            return
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_json_bytes(self, status: int, body: bytes) -> None:
        self._send_bytes(status, body, "application/json; charset=utf-8")

    def _send_json_obj(self, status: int, payload: dict[str, Any]) -> None:
        self._send_json_bytes(status, strict_json_bytes(payload))

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self) -> None:  # noqa: N802
        self._suppress_body = True
        try:
            self.do_GET()
        finally:
            self._suppress_body = False

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"
        store = self.server.store

        try:
            origin = self.headers.get("Origin")
            if origin and not origin_allowed(origin):
                self._send_json_obj(HTTPStatus.FORBIDDEN, {"error": "requests are accepted from local pages only"})
                return
            if route in ("/api/env/next_look/reset", "/api/env/next_look/step", "/api/env/next_look/play"):
                length = int(self.headers.get("Content-Length", "0"))
                if length > 65_536:
                    self._send_json_obj(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "Request body too large"})
                    return
                body = parse_request_json(self.rfile.read(length) if length > 0 else b"{}")
                rounds = store.next_look
                action = {"reset": rounds.reset, "step": rounds.step, "play": rounds.play}[route.rsplit("/", 1)[1]]
                result = action(body)
                self._send_json_obj(HTTPStatus.OK, result)
                return

            if route == "/api/reconstruct":
                length = int(self.headers.get("Content-Length", "0"))
                if length > 262_144:
                    self._send_json_obj(
                        HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                        {"error": "Request body too large"},
                    )
                    return
                raw_body = self.rfile.read(length) if length > 0 else b"{}"
                result = store.execute_reconstruct(parse_request_json(raw_body))
                self._send_json_obj(HTTPStatus.OK, result)
                return

            self._send_json_obj(
                HTTPStatus.NOT_FOUND,
                {"error": f"Unknown POST endpoint '{route}'"},
            )
        except (ValueError, json.JSONDecodeError) as exc:
            self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except (FirmsCacheMissing, RoundNotFound) as exc:
            self._send_json_obj(HTTPStatus.NOT_FOUND, {"error": str(exc)})
        except ClosedWindow as exc:
            self._send_json_obj(HTTPStatus.CONFLICT, {"error": str(exc), "evidence": ClosedWindow.evidence})
        except RoundConflict as exc:
            self._send_json_obj(HTTPStatus.CONFLICT, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover
            self._send_json_obj(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"
        qs = parse_qs(parsed.query)
        store = self.server.store

        try:
            hit = cube_route(route, qs)
            if hit is not None:
                self._send_bytes(hit[0], hit[1], hit[2])
                return
            hit = gibs_route(route, qs)
            if hit is not None:
                self._send_bytes(hit[0], hit[1], hit[2])
                return

            if route == "/api/live":
                live = live_dir()
                if not (live / "protocol.json").is_file():
                    self._send_json_obj(HTTPStatus.SERVICE_UNAVAILABLE, {
                        "state": "not_running", "error": f"no live folder with a protocol at {live.name}/",
                        "live_dir": "ISOGON_LIVE_DIR, else the live folder of the world store (ISOGON_WORLD_DIR or data/cache/world)"})
                    return
                self._send_json_obj(HTTPStatus.OK, live_route(live))
                return

            if route == "/api/health":
                self._send_json_obj(HTTPStatus.OK, store.health_payload())
                return

            if route == "/api/regions":
                self._send_json_obj(HTTPStatus.OK, store.regions_full_payload())
                return

            if route == "/api/calendar":
                source = qs.get("source", [""])[0]
                if source in ("", "simulated"):
                    self._send_json_bytes(HTTPStatus.OK, store.calendar_bytes)  # the simulated calendar
                    return
                if source != "firms":
                    self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": "source must be 'firms', or omitted for the simulated calendar"})
                    return
                region_id, box_text = qs.get("region_id", [""])[0], qs.get("box", [""])[0]
                if bool(region_id) == bool(box_text):
                    self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": "source=firms needs region_id or box (west,south,east,north), not both"})
                    return
                try:
                    body = store.firms_calendar_bytes(region_id) if region_id else store.box_calendar_payload(parse_box(box_text))[1]
                except KeyError as exc:
                    out = {"error": str(exc.args[0])}
                    if box_text:
                        # A box outside the cached countries: no country boundaries are held here, so the answer
                        # names what is cached and where every country file NASA publishes is listed with its size.
                        out.update({
                            "cached_countries": store.box_index.countries(),
                            "country_files": "/api/firms/countries (every country file the FIRMS listing publishes, its bytes and whether it is cached)",
                            "fetch": firms_country_fetch.format(country="<Country, as in that list>"),
                            "after_fetch": "the next box request indexes the new files (47 s for the 2.1 GB of country files cached when this was written)",
                        })
                    self._send_json_obj(HTTPStatus.NOT_FOUND, out)
                    return
                self._send_json_bytes(HTTPStatus.OK, body)
                return

            if route == "/api/calendar/checks":
                self._send_json_obj(HTTPStatus.OK, store.record_checks_payload())
                return

            if route == "/api/firms/countries":
                country = qs.get("country", [""])[0] or None
                rows = firms_country_files(country=country)
                if country is not None and not rows:
                    self._send_json_obj(HTTPStatus.NOT_FOUND, {"error": f"no FIRMS country file is listed for '{country}'"})
                    return
                self._send_json_obj(HTTPStatus.OK, {
                    "source": "the FIRMS country yearly summary files listing (data/cache/firms/listing), as downloaded",
                    "countries": rows,
                    "fetch": "country files need no key; a fetch refuses to start when the cache would pass 5 GB",
                })
                return

            if route == "/api/calendar/current":
                if qs.get("source", [""])[0] != "firms":
                    self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": "source must be 'firms'"})
                    return
                region_id, box_text = qs.get("region_id", [""])[0], qs.get("box", [""])[0]
                if bool(region_id) == bool(box_text):
                    self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": "needs region_id or box (west,south,east,north), not both"})
                    return
                try:
                    out = store.current_month_payload(region_id or None, parse_box(box_text) if box_text else None)
                except KeyError as exc:
                    self._send_json_obj(HTTPStatus.NOT_FOUND, {"error": str(exc.args[0])})
                    return
                self._send_json_obj(HTTPStatus.OK, out)
                return

            if route == "/api/calendar/rows.csv":
                region_id, box_text = qs.get("region_id", [""])[0], qs.get("box", [""])[0]
                start, end = qs.get("start", [""])[0], qs.get("end", [""])[0]
                plats = [p for p in qs.get("platforms", [""])[0].split(",") if p] or None
                if box_text and region_id:
                    self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": "give region_id or box, not both"})
                    return
                try:
                    box = parse_box(box_text) if box_text else None
                    d0, d1 = _dt.date.fromisoformat(start[:10]), _dt.date.fromisoformat(end[:10])
                    if start >= end:
                        raise ValueError("end must be after start")
                    if box is not None:
                        body, n = rows_csv_box(box, start, end, plats, store.box_index)
                        region_id = "box_" + box_text(box).replace(",", "_")
                    else:
                        body, n = rows_csv(region_id, start, end, plats)
                except KeyError as exc:
                    self._send_json_obj(HTTPStatus.NOT_FOUND, {"error": str(exc.args[0])})
                    return
                except FirmsCacheMissing as exc:
                    self._send_json_obj(HTTPStatus.NOT_FOUND, {"error": str(exc)})
                    return
                except ValueError as exc:
                    self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": f"start and end must be ISO dates; {exc}"})
                    return
                self._send_bytes(
                    HTTPStatus.OK,
                    body,
                    "text/csv; charset=utf-8",
                    {
                        "Content-Disposition": f'attachment; filename="isogon_firms_{region_id}_{d0}_{d1}.csv"',
                        "X-Row-Count": str(n),
                    },
                )
                return

            if route == "/api/sensor-model":
                run_id_raw = qs.get("run_id", [None])[0]
                self._send_json_bytes(HTTPStatus.OK, store.sensor_model_payload(str(run_id_raw) if run_id_raw else None))
                return

            if route == "/api/field-meta":
                self._send_json_bytes(HTTPStatus.OK, store.field_meta_bytes)
                return

            if route == "/api/evidence":
                if model_evidence is None:
                    self._send_json_obj(HTTPStatus.NOT_FOUND, {
                        "error": "the evidence function (backend/model/evidence.py) is not in this build"})
                    return
                # Built on each request from the tracked files it reads (no FIRMS row, no solve), so it is never stale.
                self._send_json_bytes(HTTPStatus.OK, json.dumps(model_evidence(), ensure_ascii=False).encode("utf-8"))
                return

            if route == "/api/passes":
                region_id = qs.get("region_id", [""])[0]
                start, end = qs.get("start", [""])[0], qs.get("end", [""])[0]
                if not region_id or not start or not end:
                    self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": "needs region_id, start and end"})
                    return
                plats = [p for p in qs.get("platforms", [""])[0].split(",") if p] or None
                try:
                    body = store.pass_timeline_bytes(region_id, start, end, qs.get("box", ["pack"])[0], plats,
                                                     qs.get("hidden", [""])[0] or None)
                except KeyError as exc:
                    self._send_json_obj(HTTPStatus.NOT_FOUND, {"error": str(exc.args[0])})
                    return
                except (CmrCacheMissing, FirmsCacheMissing) as exc:
                    self._send_json_obj(HTTPStatus.NOT_FOUND, {"error": str(exc)})
                    return
                self._send_json_bytes(HTTPStatus.OK, body)
                return

            if route == "/api/env/next_look/players":
                try:
                    self._send_json_obj(HTTPStatus.OK, store.next_look.players())
                except RoundNotFound as exc:
                    self._send_json_obj(HTTPStatus.NOT_FOUND, {"error": str(exc)})
                return

            if route == "/api/env/next_look/state":
                try:
                    self._send_json_obj(HTTPStatus.OK, store.next_look.state(qs.get("round_id", [""])[0]))
                except RoundNotFound as exc:
                    self._send_json_obj(HTTPStatus.NOT_FOUND, {"error": str(exc)})
                return

            if route == "/api/runs/starts":
                region_id = qs.get("region_id", [""])[0]
                source = qs.get("source", ["firms"])[0]
                if source != "firms" or not region_id:
                    self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": "needs region_id and source=firms"})
                    return
                try:
                    _body, starts = store.firms_calendar_payload(region_id)
                except KeyError as exc:
                    self._send_json_obj(HTTPStatus.NOT_FOUND, {"error": str(exc.args[0])})
                    return
                self._send_json_obj(HTTPStatus.OK, starts)
                return

            if route.startswith("/api/runs/"):
                parts = [unquote(p) for p in route.split("/") if p]
                # Terrain pack files: ['api', 'runs', '<run_id>', 'terrain', '<name>']
                if len(parts) == 5 and parts[3] == "terrain":
                    run_id, file_name = parts[2], parts[4]
                    entry = store.get_run(run_id)
                    if entry is None:
                        self._send_json_obj(
                            HTTPStatus.NOT_FOUND,
                            {"error": f"Run '{run_id}' not found in active store"},
                        )
                        return
                    pack_path = store.terrain_packs.resolve_file(entry[0].region_terrain.spec, file_name)
                    if pack_path is None:
                        self._send_json_obj(
                            HTTPStatus.NOT_FOUND,
                            {"error": f"Terrain pack file '{file_name}' not available for run '{run_id}'"},
                        )
                        return
                    # Pack files are rebuilt only by hand, so the browser may keep them; the ETag (size and write
                    # time) changes with any rebuild and a matching If-None-Match gets 304.
                    st = pack_path.stat()
                    etag = f'"{st.st_size:x}-{st.st_mtime_ns:x}"'
                    cache = "public, max-age=86400"
                    if self.headers.get("If-None-Match") == etag:
                        self.send_response(HTTPStatus.NOT_MODIFIED)
                        self._send_cors_headers(cache)
                        self.send_header("ETag", etag)
                        self.end_headers()
                        return
                    self._send_bytes(
                        HTTPStatus.OK,
                        pack_path.read_bytes(),
                        TERRAIN_PACK_CONTENT_TYPES.get(pack_path.suffix, "application/octet-stream"),
                        {"ETag": etag},
                        cache=cache,
                    )
                    return
                # Expected: ['api', 'runs', '<run_id>', '<asset>']
                if len(parts) == 4:
                    run_id, asset_name = parts[2], parts[3]
                    entry = store.get_run(run_id)
                    if entry is None:
                        self._send_json_obj(
                            HTTPStatus.NOT_FOUND,
                            {"error": f"Run '{run_id}' not found in active store"},
                        )
                        return
                    run_obj = entry[0]
                    if asset_name == "dem_f32.bin":
                        self._send_bytes(
                            HTTPStatus.OK,
                            run_obj.region_terrain.dem_f32_bytes,
                            "application/octet-stream",
                        )
                        return
                    if asset_name == "dem_hires_f32.bin":
                        self._send_bytes(
                            HTTPStatus.OK,
                            run_obj.region_terrain.dem_hires_f32_bytes,
                            "application/octet-stream",
                        )
                        return
                    if asset_name in ("satellite.jpg", "satellite.png"):
                        self._send_bytes(
                            HTTPStatus.OK,
                            run_obj.region_terrain.satellite_bytes,
                            run_obj.region_terrain.satellite_content_type,
                        )
                        return
                    if asset_name == "reconstruction_u8.bin":
                        self._send_bytes(
                            HTTPStatus.OK,
                            run_obj.reconstruction_u8_bytes,
                            "application/octet-stream",
                        )
                        return
                    if asset_name == "export.geojson":
                        self._send_bytes(
                            HTTPStatus.OK,
                            run_obj.export_geojson_bytes,
                            "application/geo+json; charset=utf-8",
                            {"Content-Disposition": f'attachment; filename="{run_id}_harmonized.geojson"'},
                        )
                        return
                    if asset_name == "export.csv":
                        self._send_bytes(
                            HTTPStatus.OK,
                            run_obj.export_csv_bytes,
                            "text/csv; charset=utf-8",
                            {"Content-Disposition": f'attachment; filename="{run_id}_harmonized.csv"'},
                        )
                        return
                    if asset_name == "observer_passes.json":
                        self._send_json_obj(HTTPStatus.OK, run_obj.observer_passes)
                        return
                    if asset_name == "belief_u8.bin":
                        belief = getattr(run_obj, "belief_u8_bytes", b"")
                        if not belief:
                            self._send_json_obj(
                                HTTPStatus.NOT_FOUND, {"error": f"Run '{run_id}' has no belief frames (real runs only)"}
                            )
                            return
                        self._send_bytes(HTTPStatus.OK, belief, "application/octet-stream")
                        return

            if route == "/api/observer":
                frame_raw = qs.get("frame", ["0"])[0]
                sensor_raw = qs.get("sensor", ["all"])[0]
                min_frp_raw = qs.get("min_frp", ["0.0"])[0]
                max_zen_raw = qs.get("max_zenith", ["90.0"])[0]
                run_id_raw = qs.get("run_id", [None])[0]

                frame_idx = int(frame_raw)
                if not (0 <= frame_idx < NUM_FRAMES):
                    self._send_json_obj(
                        HTTPStatus.BAD_REQUEST,
                        {"error": f"frame must be between 0 and {NUM_FRAMES - 1}, got {frame_idx}"},
                    )
                    return

                result = store.query_observer(
                    frame_idx=frame_idx,
                    sensor_filter=sensor_raw,
                    min_frp=query_number(min_frp_raw, "min_frp"),
                    max_zenith=query_number(max_zen_raw, "max_zenith"),
                    run_id=str(run_id_raw) if run_id_raw else None,
                )
                self._send_json_obj(HTTPStatus.OK, result)
                return

            self._send_json_obj(
                HTTPStatus.NOT_FOUND,
                {
                    "error": f"Unknown endpoint '{route}'",
                    "available_endpoints": [
                        "/api/health",
                        "/api/regions",
                        "/api/reconstruct",
                        "/api/runs/<run_id>/<asset>",
                        "/api/runs/<run_id>/terrain/<name>",
                        "/api/observer",
                        "/api/calendar",
                        "/api/calendar/checks",
                        "/api/cube/record",
                        "/api/cube/tables",
                        "/api/cube/countries",
                        "/api/cube/layers",
                        "/api/live",
                        "/api/gibs/day",
                        "/api/gibs/cloud",
                        "/api/gibs/live",
                        "/api/sensor-model",
                        "/api/field-meta",
                        "/api/env/next_look/reset (POST)",
                        "/api/env/next_look/step (POST)",
                        "/api/env/next_look/state",
                        "/api/passes",
                        "/api/evidence",
                    ],
                },
            )
        except ValueError as exc:
            self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover
            self._send_json_obj(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write(f"[Isogon API] {self.address_string()} - {fmt % args}\n")


def run_server(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, imagery_elsewhere: str = DEFAULT_IMAGERY) -> None:
    fields_dir = _REPO_ROOT / DEFAULT_FIELDS_REL_DIR
    store = IsogonDataStore(fields_dir=fields_dir, imagery_elsewhere=imagery_elsewhere)
    store.warm_firms()
    httpd = IsogonHTTPServer((host, port), store=store)
    print(
        f"[Isogon API] Listening on http://{host}:{port} "
        f"(model={MODEL_VERSION}, terrain={store.field_meta.get('terrain_source')})",
        flush=True,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Isogon scientific HTTP API server.")
    parser.add_argument("--host", default=DEFAULT_HOST, help="Bind host (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Bind port (default 8788)")
    parser.add_argument("--imagery-elsewhere", default=DEFAULT_IMAGERY, choices=ELSEWHERE_IMAGERY,
                        help="terrain pack imagery where the public-domain source does not cover a run's box and the "
                             f"request names none (default {DEFAULT_IMAGERY}; eox_s2cloudless_2016 for a recording "
                             "that may be published)")
    args = parser.parse_args()
    run_server(host=args.host, port=args.port, imagery_elsewhere=args.imagery_elsewhere)


if __name__ == "__main__":
    main()
