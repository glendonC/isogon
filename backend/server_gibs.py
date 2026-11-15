"""HTTP routes and batch cache builder for NASA GIBS daily region pictures and cloud shares.

Routes under `/api/gibs` (mounted through `gibs_route(route, qs)` or served standalone):
  GET /api/gibs/day?region_id=<id>&day=<YYYY-MM-DD>&layer=<GIBS layer>
      Returns the region or live-fire box's cropped daily satellite image as `image/png` (or its
      manifest as JSON when `format=json` is passed). Accepts `fire_id` as an alias for `region_id`,
      optional `box=w,s,e,n`, and `platform` + `kind` (`true_color` or `false_color`) in place of
      `layer`.
  GET /api/gibs/cloud?region_id=<id>&day=<YYYY-MM-DD>&when=<day|night>[&platform=<platform>]
      Returns the daily cloud share over the region or live-fire box from NASA GIBS colour-mapped
      science tiles, naming the GIBS layer, NASA product, pixel size, pixel counts, source URLs,
      and per-platform shares across Terra, Aqua, Suomi NPP, and NOAA-20. Accepts `fire_id` as an
      alias for `region_id` and optional `box=w,s,e,n`.
  GET /api/gibs/live
      Returns the summary manifest of pre-fetched live sealer cohort fires (`today` and `yesterday`
      UTC pictures and cloud shares).

Store layout under `$ISOGON_GIBS_DIR`, else `$ISOGON_WORLD_DIR/gibs`, else `data/cache/world/gibs`:
  boxes.json                                  region_id and live fire_id -> [w, s, e, n] index
  colormaps/                                  GIBS v1.3 XML colour maps + .manifest.json
  tiles/<layer>/<day>/<tms>/<z>/<r>/<c>.<ext> raw GIBS WMTS tiles + .manifest.json
  crops/<target_id>/<day>/<layer>.png         cropped mosaics + .manifest.json
  cloud/<target_id>/<day>/<when>.json         cached box cloud shares + .manifest.json
  featured_fires_manifest.json                summary of pre-fetched featured fire windows
  live_fires_manifest.json                    summary of live sealer fires (refreshed every 3 h)

Closed 2021 test windows in `plumas_ca`, `lytton_bc`, and `evia_greece` are refused with HTTP 409
before any cache read or network request.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
import datetime as _dt
import hashlib
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
import shutil
import sys
import threading
import time
from typing import Any
from urllib.parse import parse_qs, urlparse
import urllib.error
import urllib.request

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.gibs_cloud import (  # noqa: E402
    CLOUD_LAYERS,
    LAYER_BY_NAME as CLOUD_LAYER_BY_NAME,
    PAUSE_S,
    TILE_PX,
    USER_AGENT,
    Opener,
    _TileNotAvailable,
    _box_pixel_window,
    _check_closed_window,
    _default_opener,
    _fetch_bytes,
    _load_colormap,
    _now_utc,
    _validate_box,
    _validate_day,
    cloud_share,
    normalize_platform,
    normalize_when,
    pixel_deg_for_level,
    tile_cache_path,
    tile_url,
)
from backend.model.training import ClosedWindow, EVIDENCE_ADDRESS  # noqa: E402
from backend.terrain.gibs_day import (  # noqa: E402
    DAY_LAYERS,
    DAY_LAYER_BY_NAME,
    DayLayerSpec,
    build_day_image,
    day_tile_cache_path,
    day_tile_url,
    decode_tile_rgb,
    resolve_day_layer,
)
from backend.terrain.live_region import PRESET_BY_ID  # noqa: E402

PREFIX: str = "/api/gibs"
JSON_CT: str = "application/json; charset=utf-8"
PNG_CT: str = "image/png"
MAX_WORKERS: int = 4
LIVE_REFRESH_SECONDS: float = 10200.0  # 2h 50m threshold so 3-hour cron ticks always refresh

CLOUD_PLATFORMS: tuple[str, ...] = (
    "MODIS_TERRA",
    "MODIS_AQUA",
    "VIIRS_SNPP",
    "VIIRS_NOAA20",
)

IMAGERY_PLATFORMS: tuple[str, ...] = (
    "MODIS_TERRA",
    "MODIS_AQUA",
    "VIIRS_SNPP",
    "VIIRS_NOAA20",
    "VIIRS_NOAA21",
)

CHOSEN_CLOUD_RULE: str = (
    "first platform with valid pixels over the box in order MODIS_TERRA, MODIS_AQUA, VIIRS_SNPP, VIIRS_NOAA20; "
    "individual satellite values are under platforms"
)

CLOSED_TEST_REGIONS: frozenset[str] = frozenset({"plumas_ca", "lytton_bc", "evia_greece"})
_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


def world_dir() -> Path:
    v = os.environ.get("ISOGON_WORLD_DIR", "").strip()
    return Path(v).expanduser() if v else _REPO_ROOT / "data" / "cache" / "world"


def gibs_dir() -> Path:
    v = os.environ.get("ISOGON_GIBS_DIR", "").strip()
    return Path(v).expanduser() if v else world_dir() / "gibs"


def live_dir() -> Path:
    v = os.environ.get("ISOGON_LIVE_DIR", "").strip()
    return Path(v).expanduser() if v else world_dir() / "live"


def boxes_index_path(root: Path) -> Path:
    return Path(root) / "boxes.json"


def _validate_target_id(target_id: str) -> str:
    tid = str(target_id).strip()
    if not tid or not _SAFE_ID_RE.match(tid) or tid in (".", "..") or ".." in tid:
        raise ValueError(f"invalid target identifier '{target_id}'")
    return tid


def _round_box(box: list[float] | tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    w, s, e, n = _validate_box(box)
    return (round(w, 6), round(s, 6), round(e, 6), round(n, 6))


def _parse_box_param(raw: str) -> tuple[float, float, float, float]:
    parts = [p.strip() for p in str(raw).split(",") if p.strip()]
    if len(parts) != 4:
        raise ValueError("box must be four comma-separated numbers: west,south,east,north")
    return _round_box([float(v) for v in parts])


def load_live_cohorts(cohorts_path: Path) -> list[dict[str, Any]]:
    """Read live sealer fires from `cohorts.jsonl`, preserving cohort order and deduplicating by fire id."""
    path = Path(cohorts_path)
    if not path.is_file():
        return []
    fires_by_id: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        obj = json.loads(line)
        cohort = obj.get("cohort") if isinstance(obj.get("cohort"), dict) else obj
        chosen_utc = cohort.get("chosen_utc")
        cohort_idx = cohort.get("index")
        for f in cohort.get("fires") or []:
            fid = _validate_target_id(str(f.get("id") or ""))
            box = _round_box(f["box"])
            entry = {
                "id": fid,
                "cohort": f.get("cohort", cohort_idx),
                "rank": f.get("rank"),
                "part": f.get("part"),
                "box": list(box),
                "centre": f.get("centre"),
                "modis_rows_48h": f.get("modis_rows_48h"),
                "chosen_utc": chosen_utc,
            }
            if fid not in fires_by_id:
                order.append(fid)
            fires_by_id[fid] = entry
    return [fires_by_id[fid] for fid in order]


def _read_boxes_index(root: Path | None) -> dict[str, list[float]]:
    if root is None:
        return {}
    idx_path = boxes_index_path(root)
    if not idx_path.is_file():
        return {}
    try:
        doc = json.loads(idx_path.read_text(encoding="utf-8"))
        boxes = doc.get("boxes") if isinstance(doc, dict) else None
        return boxes if isinstance(boxes, dict) else {}
    except (OSError, ValueError):
        return {}


def update_boxes_index(root: Path, updates: dict[str, tuple[float, float, float, float] | list[float]]) -> None:
    if not updates:
        return
    current = _read_boxes_index(root)
    changed = False
    for tid, box in updates.items():
        clean_id = _validate_target_id(tid)
        clean_box = list(_round_box(box))
        if current.get(clean_id) != clean_box:
            current[clean_id] = clean_box
            changed = True
    if changed or not boxes_index_path(root).is_file():
        doc = {"updated_utc": _now_utc(), "boxes": dict(sorted(current.items()))}
        _write_atomic_bytes(
            boxes_index_path(root),
            (json.dumps(doc, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
        )


def resolve_target_box(
    target_id: str,
    *,
    root: Path | None = None,
    cohorts_path: Path | None = None,
) -> tuple[float, float, float, float]:
    """Resolve `target_id` from preset regions, cached `boxes.json`, or live `cohorts.jsonl`."""
    tid = _validate_target_id(target_id)
    if tid in PRESET_BY_ID:
        b = PRESET_BY_ID[tid].bbox
        return (round(float(b.west), 6), round(float(b.south), 6), round(float(b.east), 6), round(float(b.north), 6))

    saved_boxes = _read_boxes_index(root)
    if tid in saved_boxes:
        return _round_box(saved_boxes[tid])

    c_path = Path(cohorts_path) if cohorts_path is not None else live_dir() / "cohorts.jsonl"
    if c_path.is_file():
        for fire in load_live_cohorts(c_path):
            if fire["id"] == tid:
                return _round_box(fire["box"])

    raise KeyError(f"unknown region '{tid}'")


def region_box_wsen(region_id: str) -> tuple[float, float, float, float]:
    return resolve_target_box(region_id)


def _write_atomic_bytes(dest: Path, payload: bytes) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(f".{dest.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_bytes(payload)
    tmp.replace(dest)


def _json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")


def _json_resp(status: HTTPStatus | int, payload: dict[str, Any]) -> tuple[int, bytes, str]:
    return int(status), _json_bytes(payload), JSON_CT


def _offline_opener(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
    raise _TileNotAvailable(f"network disabled and tile not cached for {url}")


def _parse_utc_epoch(utc_str: str | None) -> float | None:
    if not utc_str:
        return None
    s = str(utc_str).strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return _dt.datetime.fromisoformat(s).astimezone(_dt.timezone.utc).timestamp()
    except ValueError:
        return None


def crop_file_path(root: Path, region_id: str, day_iso: str, layer_name: str) -> Path:
    return Path(root) / "crops" / _validate_target_id(region_id) / day_iso / f"{layer_name}.png"


def cloud_file_path(root: Path, region_id: str, day_iso: str, when_norm: str) -> Path:
    return Path(root) / "cloud" / _validate_target_id(region_id) / day_iso / f"{when_norm}.json"


def _png_nonzero_pixel_share(png_bytes: bytes) -> float:
    rgb = decode_tile_rgb(png_bytes)
    if rgb.size == 0:
        return 0.0
    nonzero = (rgb[:, :, 0] > 0) | (rgb[:, :, 1] > 0) | (rgb[:, :, 2] > 0)
    return round(float(nonzero.mean()), 4)


def _resolve_requested_day_layer(qs: dict[str, list[str]]) -> DayLayerSpec:
    layer_raw = (qs.get("layer", [""])[0] or "").strip()
    platform_raw = (qs.get("platform", [""])[0] or "").strip()
    kind_raw = (qs.get("kind", [""])[0] or "").strip()

    if layer_raw:
        if layer_raw in DAY_LAYER_BY_NAME:
            return DAY_LAYER_BY_NAME[layer_raw]
        if ":" in layer_raw:
            plat_part, _, kind_part = layer_raw.partition(":")
            return resolve_day_layer(platform=plat_part, kind=kind_part)
        raise ValueError(f"unsupported GIBS daily imagery layer '{layer_raw}'")

    if platform_raw and kind_raw:
        return resolve_day_layer(platform=platform_raw, kind=kind_raw)

    raise ValueError("needs layer (GIBS layer identifier) or both platform and kind")


def _resolve_route_target(
    qs: dict[str, list[str]],
    root: Path,
) -> tuple[str, tuple[float, float, float, float], bool]:
    fire_id = (qs.get("fire_id", [""])[0] or "").strip()
    region_id = (qs.get("region_id", qs.get("region", [""]))[0] or "").strip()
    box_raw = (qs.get("box", [""])[0] or "").strip()

    target_id = fire_id or region_id
    is_fire = bool(fire_id)
    if not target_id and box_raw:
        box = _parse_box_param(box_raw)
        slug = f"box_{box[0]:.4f}_{box[1]:.4f}_{box[2]:.4f}_{box[3]:.4f}".replace("-", "m").replace(".", "p")
        return slug, box, False
    if not target_id:
        return "", (0.0, 0.0, 0.0, 0.0), False

    tid = _validate_target_id(target_id)
    if box_raw:
        return tid, _parse_box_param(box_raw), is_fire
    return tid, resolve_target_box(tid, root=root), is_fire


def build_cloud_day_payload(
    region_id: str,
    day: str,
    when: str,
    *,
    root: Path,
    box_override: tuple[float, float, float, float] | list[float] | None = None,
    opener: Opener = _offline_opener,
    pause_s: float = PAUSE_S,
    persist: bool = False,
    force_recompute: bool = False,
    synced_utc: str | None = None,
) -> dict[str, Any]:
    """Compute or read all four cloud-reporting satellites for `(region_id, day, when)`."""
    tid = _validate_target_id(region_id)
    box = _round_box(box_override) if box_override is not None else resolve_target_box(tid, root=root)
    day_iso, start_s, end_s = _validate_day(day)
    _check_closed_window(box, start_s, end_s)
    when_norm = normalize_when(when)

    saved_path = cloud_file_path(root, tid, day_iso, when_norm)
    if saved_path.is_file() and not force_recompute:
        return json.loads(saved_path.read_text(encoding="utf-8"))

    by_platform: dict[str, dict[str, Any]] = {}
    all_urls: list[str] = []
    seen_urls: set[str] = set()
    retrieved_times: list[str] = []

    for plat in CLOUD_PLATFORMS:
        res = cloud_share(
            box,
            day_iso,
            when_norm,
            platform=plat,
            cache_dir=root,
            opener=opener,
            pause_s=pause_s,
        )
        by_platform[plat] = res
        for u in res.get("source_urls") or []:
            if u not in seen_urls:
                seen_urls.add(u)
                all_urls.append(u)
        if res.get("retrieved_utc"):
            retrieved_times.append(str(res["retrieved_utc"]))

    chosen_plat = next((p for p in CLOUD_PLATFORMS if by_platform[p]["share"] is not None), CLOUD_PLATFORMS[0])
    chosen = by_platform[chosen_plat]

    payload: dict[str, Any] = {
        "region_id": tid,
        "box": list(box),
        "day": day_iso,
        "when": when_norm,
        "platform": chosen_plat,
        "share": chosen["share"],
        "pixels": chosen["pixels"],
        "no_data_pixels": chosen["no_data_pixels"],
        "layer": chosen["layer"],
        "product": chosen["product"],
        "pixel_km": chosen["pixel_km"],
        "source_urls": chosen["source_urls"],
        "retrieved_utc": chosen["retrieved_utc"],
        "chosen_rule": CHOSEN_CLOUD_RULE,
        "platforms": by_platform,
    }

    if persist:
        stamp = synced_utc or (max(retrieved_times) if retrieved_times else _now_utc())
        body = (json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")
        manifest = {
            "kind": "gibs_region_cloud_day",
            "region_id": tid,
            "box": list(box),
            "day": day_iso,
            "when": when_norm,
            "source_urls": all_urls,
            "retrieved_utc": stamp,
            "bytes": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
        }
        _write_atomic_bytes(saved_path, body)
        _write_atomic_bytes(
            saved_path.with_name(saved_path.name + ".manifest.json"),
            (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
        )
    return payload


def _cloud_single_platform_payload(
    region_id: str,
    day: str,
    when: str,
    *,
    box: tuple[float, float, float, float],
    platform: str | None,
    layer: str | None,
    root: Path,
    opener: Opener,
    pause_s: float,
) -> dict[str, Any]:
    tid = _validate_target_id(region_id)
    day_iso, start_s, end_s = _validate_day(day)
    _check_closed_window(box, start_s, end_s)
    when_norm = normalize_when(when)

    if layer:
        if layer not in CLOUD_LAYER_BY_NAME:
            raise ValueError(f"unsupported GIBS cloud layer '{layer}'")
        spec = CLOUD_LAYER_BY_NAME[layer]
        plat_norm = spec.platform
        when_norm = spec.when
    else:
        plat_norm = normalize_platform(platform or "")

    saved_path = cloud_file_path(root, tid, day_iso, when_norm)
    if saved_path.is_file() and plat_norm in CLOUD_PLATFORMS:
        saved = json.loads(saved_path.read_text(encoding="utf-8"))
        entry = (saved.get("platforms") or {}).get(plat_norm)
        if entry is not None:
            return {
                "region_id": tid,
                "box": list(box),
                "day": day_iso,
                "when": when_norm,
                "platform": plat_norm,
                **entry,
            }

    res = cloud_share(
        box,
        day_iso,
        when_norm,
        platform=plat_norm,
        layer=layer,
        cache_dir=root,
        opener=opener,
        pause_s=pause_s,
    )
    return {
        "region_id": tid,
        "box": list(box),
        "day": day_iso,
        "when": when_norm,
        "platform": plat_norm,
        **res,
    }


def _day_route(
    qs: dict[str, list[str]],
    root: Path,
    *,
    allow_network: bool,
    opener: Opener | None,
) -> tuple[int, bytes, str]:
    day_raw = (qs.get("day", [""])[0] or "").strip()
    fmt = (qs.get("format", ["png"])[0] or "png").strip().lower()
    if fmt not in ("png", "json"):
        return _json_resp(HTTPStatus.BAD_REQUEST, {"error": "format must be 'png' or 'json'"})

    target_id, box, is_fire = _resolve_route_target(qs, root)
    if not target_id or not day_raw:
        return _json_resp(HTTPStatus.BAD_REQUEST, {"error": "needs region_id (or fire_id), day and layer"})

    day_iso, start_s, end_s = _validate_day(day_raw)
    _check_closed_window(box, start_s, end_s)

    id_param = "fire_id" if is_fire else "region_id"
    layer_given = bool((qs.get("layer", [""])[0] or "").strip() or (qs.get("platform", [""])[0] or "").strip())
    if fmt == "json" and not layer_given:
        day_dir = root / "crops" / target_id / day_iso
        items: list[dict[str, Any]] = []
        if day_dir.is_dir():
            for mf in sorted(day_dir.glob("*.png.manifest.json")):
                doc = json.loads(mf.read_text(encoding="utf-8"))
                lyr = str(doc.get("layer") or "")
                items.append(
                    {
                        "layer": lyr,
                        "platform": doc.get("platform"),
                        "kind": doc.get("kind"),
                        "pixel_km": doc.get("pixel_km"),
                        "width": doc.get("width"),
                        "height": doc.get("height"),
                        "nonzero_pixel_share": doc.get("nonzero_pixel_share"),
                        "retrieved_utc": doc.get("retrieved_utc"),
                        "crop_bounds_wsen": doc.get("crop_bounds_wsen"),
                        "url": f"{PREFIX}/day?{id_param}={target_id}&day={day_iso}&layer={lyr}",
                    }
                )
        resp_doc: dict[str, Any] = {"region_id": target_id, "box": list(box), "day": day_iso, "layers": items}
        if is_fire:
            resp_doc["fire_id"] = target_id
        return _json_resp(HTTPStatus.OK, resp_doc)

    spec = _resolve_requested_day_layer(qs)
    if day_iso < spec.first_day:
        return _json_resp(
            HTTPStatus.NOT_FOUND,
            {
                "error": f"layer '{spec.layer}' starts on {spec.first_day}; {day_iso} is earlier",
                "state": "before_coverage",
                "layer": spec.layer,
                "first_day": spec.first_day,
            },
        )

    crop_path = crop_file_path(root, target_id, day_iso, spec.layer)
    manifest_path = crop_path.with_name(crop_path.name + ".manifest.json")

    if not crop_path.is_file():
        active_opener = opener if opener is not None else (_default_opener if allow_network else _offline_opener)
        try:
            manifest = build_day_image(
                box,
                day_iso,
                layer=spec.layer,
                out_path=crop_path,
                cache_dir=root,
                opener=active_opener,
                pause_s=PAUSE_S if allow_network else 0.0,
            )
        except ValueError as exc:
            msg = str(exc)
            if "GIBS returned no tiles" in msg or "starts on " in msg:
                state = "not_cached" if not allow_network and opener is None else "no_tiles"
                return _json_resp(HTTPStatus.NOT_FOUND, {"error": msg, "state": state, "layer": spec.layer, "day": day_iso})
            raise
    else:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {
            "layer": spec.layer,
            "platform": spec.platform,
            "kind": spec.kind,
            "day": day_iso,
            "box_wsen": list(box),
        }

    if fmt == "json":
        out_doc: dict[str, Any] = {
            "region_id": target_id,
            **manifest,
            "png_url": f"{PREFIX}/day?{id_param}={target_id}&day={day_iso}&layer={spec.layer}",
        }
        if is_fire:
            out_doc["fire_id"] = target_id
        return _json_resp(HTTPStatus.OK, out_doc)

    return int(HTTPStatus.OK), crop_path.read_bytes(), PNG_CT


def _cloud_route(
    qs: dict[str, list[str]],
    root: Path,
    *,
    allow_network: bool,
    opener: Opener | None,
) -> tuple[int, bytes, str]:
    day_raw = (qs.get("day", [""])[0] or "").strip()
    when_raw = (qs.get("when", qs.get("day_night", [""]))[0] or "").strip()
    platform_raw = (qs.get("platform", [""])[0] or "").strip() or None
    layer_raw = (qs.get("layer", [""])[0] or "").strip() or None

    target_id, box, is_fire = _resolve_route_target(qs, root)
    if not target_id or not day_raw or (not when_raw and not layer_raw):
        return _json_resp(HTTPStatus.BAD_REQUEST, {"error": "needs region_id (or fire_id), day and when (day or night)"})

    active_opener = opener if opener is not None else (_default_opener if allow_network else _offline_opener)
    pause = PAUSE_S if allow_network else 0.0

    if platform_raw is not None or layer_raw is not None:
        payload = _cloud_single_platform_payload(
            target_id,
            day_raw,
            when_raw or "day",
            box=box,
            platform=platform_raw,
            layer=layer_raw,
            root=root,
            opener=active_opener,
            pause_s=pause,
        )
        if is_fire:
            payload["fire_id"] = target_id
        return _json_resp(HTTPStatus.OK, payload)

    payload = build_cloud_day_payload(
        target_id,
        day_raw,
        when_raw,
        root=root,
        box_override=box,
        opener=active_opener,
        pause_s=pause,
        persist=False,
    )
    if is_fire:
        payload["fire_id"] = target_id
    return _json_resp(HTTPStatus.OK, payload)


def _live_route(root: Path) -> tuple[int, bytes, str]:
    manifest_path = Path(root) / "live_fires_manifest.json"
    if manifest_path.is_file():
        return int(HTTPStatus.OK), manifest_path.read_bytes(), JSON_CT
    c_path = live_dir() / "cohorts.jsonl"
    if c_path.is_file():
        fires = load_live_cohorts(c_path)
        return _json_resp(
            HTTPStatus.OK,
            {"kind": "gibs_live_fires_store", "built_utc": None, "live_fires_count": len(fires), "fires": fires},
        )
    return _json_resp(HTTPStatus.NOT_FOUND, {"error": "live_fires_manifest.json not built yet", "state": "not_cached"})


def gibs_route(
    route: str,
    qs: dict[str, list[str]],
    root: Path | None = None,
    *,
    allow_network: bool = False,
    opener: Opener | None = None,
) -> tuple[int, bytes, str] | None:
    """Return `(status, body, content_type)` for `/api/gibs/*`, or `None` for any other route."""
    if route != PREFIX and not route.startswith(PREFIX + "/"):
        return None
    store_root = Path(root) if root is not None else gibs_dir()
    try:
        if route == f"{PREFIX}/day":
            return _day_route(qs, store_root, allow_network=allow_network, opener=opener)
        if route == f"{PREFIX}/cloud":
            return _cloud_route(qs, store_root, allow_network=allow_network, opener=opener)
        if route == f"{PREFIX}/live":
            return _live_route(store_root)
        return _json_resp(
            HTTPStatus.NOT_FOUND,
            {
                "error": f"unknown GIBS route '{route}'",
                "routes": [
                    f"{PREFIX}/day?region_id=<id>&day=<YYYY-MM-DD>&layer=<layer>",
                    f"{PREFIX}/cloud?region_id=<id>&day=<YYYY-MM-DD>&when=<day|night>",
                    f"{PREFIX}/live",
                ],
            },
        )
    except ClosedWindow as exc:
        return _json_resp(
            HTTPStatus.CONFLICT,
            {"error": str(exc), "evidence": getattr(exc, "evidence", EVIDENCE_ADDRESS)},
        )
    except KeyError as exc:
        return _json_resp(HTTPStatus.NOT_FOUND, {"error": str(exc.args[0])})
    except ValueError as exc:
        return _json_resp(HTTPStatus.BAD_REQUEST, {"error": str(exc)})


def imagery_specs_for_day(day_iso: str) -> list[DayLayerSpec]:
    """True-colour and false-colour layer specs active on `day_iso` across satellites."""
    specs: list[DayLayerSpec] = []
    for plat in IMAGERY_PLATFORMS:
        for kind in ("true_color", "false_color"):
            spec = DAY_LAYERS[(plat, kind)]
            if day_iso >= spec.first_day:
                specs.append(spec)
        if plat == "VIIRS_SNPP" and "2012-01-19" <= day_iso < "2015-11-24":
            for kind in ("surface_i1_i2_i1", "surface_false_color"):
                spec = DAY_LAYERS[(plat, kind)]
                if day_iso >= spec.first_day:
                    specs.append(spec)
    return specs


def is_closed_2021_fire(region_id: str, first_day: str, last_day: str, fire: dict[str, Any] | None = None) -> bool:
    if fire and fire.get("closed"):
        return True
    if region_id in CLOSED_TEST_REGIONS:
        if first_day.startswith("2021") or last_day.startswith("2021"):
            return True
        if first_day <= "2021-12-31" and last_day >= "2021-01-01":
            return True
    return False


def _place_box_wsen(place: dict[str, Any], region_id: str) -> tuple[float, float, float, float] | None:
    raw_box = place.get("box")
    if isinstance(raw_box, (list, tuple)) and len(raw_box) == 4:
        return _round_box(raw_box)
    if region_id in PRESET_BY_ID:
        b = PRESET_BY_ID[region_id].bbox
        return (round(float(b.west), 6), round(float(b.south), 6), round(float(b.east), 6), round(float(b.north), 6))
    return None


def featured_fire_windows(regions_payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract every open featured fire and the UTC calendar days of its `default_start` window."""
    fires: list[dict[str, Any]] = []
    for place in regions_payload.get("places") or []:
        region_id = str(place.get("id") or "").strip()
        if not region_id:
            continue
        box = _place_box_wsen(place, region_id)
        if box is None:
            continue
        for fire in place.get("featured_fires") or []:
            start = str(fire.get("default_start") or "")
            if not start:
                continue
            run_starts = fire.get("run_starts") or []
            matched = next((s for s in run_starts if s.get("start") == start), None)
            if matched is not None:
                first_iso = str(matched["first_overpass_utc"])[:10]
                last_iso = str(matched["last_overpass_utc"])[:10]
                first_utc = str(matched["first_overpass_utc"])
                last_utc = str(matched["last_overpass_utc"])
            else:
                rec = ((fire.get("opens") or {}).get("recorded_window") or {})
                first_utc = str(rec.get("first_overpass_utc") or start)
                last_utc = str(rec.get("last_overpass_utc") or start)
                first_iso = first_utc[:10]
                last_iso = last_utc[:10]

            if is_closed_2021_fire(region_id, first_iso, last_iso, fire):
                continue

            d0 = _dt.date.fromisoformat(first_iso)
            d1 = _dt.date.fromisoformat(last_iso)
            days: list[str] = []
            closed_hit = False
            cur = d0
            while cur <= d1:
                day_s = cur.isoformat()
                _, s0, s1 = _validate_day(day_s)
                try:
                    _check_closed_window(box, s0, s1)
                except ClosedWindow:
                    closed_hit = True
                    break
                days.append(day_s)
                cur += _dt.timedelta(days=1)
            if closed_hit or not days:
                continue

            fires.append(
                {
                    "id": fire.get("id"),
                    "region_id": region_id,
                    "region_name": place.get("name"),
                    "name": fire.get("name"),
                    "label": fire.get("label"),
                    "box": list(box),
                    "default_start": start,
                    "first_overpass_utc": first_utc,
                    "last_overpass_utc": last_utc,
                    "modis_pixels_in_box": (fire.get("size") or {}).get("modis_pixels_in_box"),
                    "days": days,
                }
            )
    return fires


def is_target_day_complete(root: Path, target_id: str, day_iso: str) -> bool:
    """True when all expected day/night cloud JSONs and satellite crops for `(target_id, day_iso)` exist."""
    store_root = Path(root)
    for when_norm in ("day", "night"):
        c_path = cloud_file_path(store_root, target_id, day_iso, when_norm)
        if not c_path.is_file() or not c_path.with_name(c_path.name + ".manifest.json").is_file():
            return False
    for spec in imagery_specs_for_day(day_iso):
        p = crop_file_path(store_root, target_id, day_iso, spec.layer)
        if not p.is_file() or not p.with_name(p.name + ".manifest.json").is_file():
            return False
    return True


def summarize_cached_target_day(root: Path, target_id: str, day_iso: str) -> dict[str, Any]:
    """Build the day summary dict strictly from existing cached crop manifests and cloud JSONs."""
    store_root = Path(root)
    tid = _validate_target_id(target_id)
    crops_summary: list[dict[str, Any]] = []
    for spec in imagery_specs_for_day(day_iso):
        out_path = crop_file_path(store_root, tid, day_iso, spec.layer)
        manifest_path = out_path.with_name(out_path.name + ".manifest.json")
        if out_path.is_file() and manifest_path.is_file():
            man = json.loads(manifest_path.read_text(encoding="utf-8"))
            crops_summary.append(
                {
                    "layer": spec.layer,
                    "platform": spec.platform,
                    "kind": spec.kind,
                    "status": "cached",
                    "bytes": man.get("bytes"),
                    "sha256": man.get("sha256"),
                    "nonzero_pixel_share": man.get("nonzero_pixel_share"),
                    "retrieved_utc": man.get("retrieved_utc"),
                }
            )
        else:
            crops_summary.append(
                {
                    "layer": spec.layer,
                    "platform": spec.platform,
                    "kind": spec.kind,
                    "status": "no_tiles",
                }
            )
    cloud_summary: dict[str, Any] = {}
    for when_norm in ("day", "night"):
        c_path = cloud_file_path(store_root, tid, day_iso, when_norm)
        if c_path.is_file():
            c_doc = json.loads(c_path.read_text(encoding="utf-8"))
            cloud_summary[when_norm] = {
                plat: ((c_doc.get("platforms") or {}).get(plat) or {}).get("share") for plat in CLOUD_PLATFORMS
            }
        else:
            cloud_summary[when_norm] = {plat: None for plat in CLOUD_PLATFORMS}
    return {
        "region_id": tid,
        "day": day_iso,
        "crops": crops_summary,
        "cloud": cloud_summary,
    }


def warm_target_day(
    root: Path,
    target_id: str,
    day: str,
    *,
    box: tuple[float, float, float, float] | list[float] | None = None,
    pause_s: float = 0.25,
    opener: Opener = _default_opener,
    force_rebuild: bool = False,
    synced_utc: str | None = None,
) -> dict[str, Any]:
    """Fetch and write all satellite day crops and day/night cloud shares for `(target_id, day)`."""
    store_root = Path(root)
    tid = _validate_target_id(target_id)
    box_wsen = _round_box(box) if box is not None else resolve_target_box(tid, root=store_root)
    day_iso, start_s, end_s = _validate_day(day)
    _check_closed_window(box_wsen, start_s, end_s)

    crops_summary: list[dict[str, Any]] = []
    for spec in imagery_specs_for_day(day_iso):
        out_path = crop_file_path(store_root, tid, day_iso, spec.layer)
        manifest_path = out_path.with_name(out_path.name + ".manifest.json")
        if not force_rebuild and out_path.is_file() and manifest_path.is_file():
            man = json.loads(manifest_path.read_text(encoding="utf-8"))
            if "nonzero_pixel_share" not in man:
                man["nonzero_pixel_share"] = _png_nonzero_pixel_share(out_path.read_bytes())
                _write_atomic_bytes(manifest_path, (json.dumps(man, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
            crops_summary.append(
                {
                    "layer": spec.layer,
                    "platform": spec.platform,
                    "kind": spec.kind,
                    "status": "cached",
                    "bytes": man.get("bytes"),
                    "sha256": man.get("sha256"),
                    "nonzero_pixel_share": man.get("nonzero_pixel_share"),
                    "retrieved_utc": man.get("retrieved_utc"),
                }
            )
            continue
        try:
            man = build_day_image(
                box_wsen,
                day_iso,
                layer=spec.layer,
                out_path=out_path,
                cache_dir=store_root,
                opener=opener,
                pause_s=pause_s,
            )
            nz_share = _png_nonzero_pixel_share(out_path.read_bytes())
            man["nonzero_pixel_share"] = nz_share
            if synced_utc:
                man["synced_utc"] = synced_utc
            _write_atomic_bytes(manifest_path, (json.dumps(man, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
            crops_summary.append(
                {
                    "layer": spec.layer,
                    "platform": spec.platform,
                    "kind": spec.kind,
                    "status": "ok",
                    "bytes": man["bytes"],
                    "sha256": man["sha256"],
                    "nonzero_pixel_share": nz_share,
                    "retrieved_utc": man.get("retrieved_utc"),
                }
            )
        except ValueError as exc:
            if "GIBS returned no tiles" in str(exc):
                crops_summary.append(
                    {
                        "layer": spec.layer,
                        "platform": spec.platform,
                        "kind": spec.kind,
                        "status": "no_tiles",
                        "note": str(exc),
                    }
                )
            else:
                raise

    cloud_summary: dict[str, Any] = {}
    for when_norm in ("day", "night"):
        c_doc = build_cloud_day_payload(
            tid,
            day_iso,
            when_norm,
            root=store_root,
            box_override=box_wsen,
            opener=opener,
            pause_s=pause_s,
            persist=True,
            force_recompute=force_rebuild,
            synced_utc=synced_utc,
        )
        cloud_summary[when_norm] = {
            plat: (c_doc["platforms"][plat]["share"]) for plat in CLOUD_PLATFORMS
        }

    return {
        "region_id": tid,
        "day": day_iso,
        "crops": crops_summary,
        "cloud": cloud_summary,
    }


def warm_region_day(
    root: Path,
    region_id: str,
    day: str,
    *,
    pause_s: float = 0.25,
    opener: Opener = _default_opener,
) -> dict[str, Any]:
    """Fetch and write all satellite day crops and day/night cloud shares for one `(region_id, day)`."""
    return warm_target_day(root, region_id, day, pause_s=pause_s, opener=opener)


def _warm_worker_task(args: tuple[str, str, list[float], str, float, bool, str | None]) -> dict[str, Any]:
    root_str, target_id, box_list, day_iso, pause_s, force_rebuild, synced_utc = args
    return warm_target_day(
        Path(root_str),
        target_id,
        day_iso,
        box=box_list,
        pause_s=pause_s,
        opener=_offline_opener if force_rebuild else _default_opener,
        force_rebuild=force_rebuild,
        synced_utc=synced_utc,
    )


def _day_tile_coords_for_box(box_wsen: tuple[float, float, float, float], level: int) -> list[tuple[int, int]]:
    w, s, e, n = box_wsen
    px_deg = pixel_deg_for_level(level)
    total_cols = int(round(360.0 / px_deg))
    total_rows = int(round(180.0 / px_deg))
    eps = 1e-12
    gx0 = max(0, min(total_cols - 1, int(math.floor((w + 180.0) / px_deg))))
    gx1 = max(gx0, min(total_cols - 1, int(math.ceil((e + 180.0 - eps) / px_deg)) - 1))
    gy0 = max(0, min(total_rows - 1, int(math.floor((90.0 - n) / px_deg))))
    gy1 = max(gy0, min(total_rows - 1, int(math.ceil((90.0 - s - eps) / px_deg)) - 1))
    tcol0, tcol1 = gx0 // TILE_PX, gx1 // TILE_PX
    trow0, trow1 = gy0 // TILE_PX, gy1 // TILE_PX
    return [(r, c) for r in range(trow0, trow1 + 1) for c in range(tcol0, tcol1 + 1)]


def _cloud_tile_coords_for_box(box_wsen: tuple[float, float, float, float], level: int) -> list[tuple[int, int]]:
    gx0, gx1, gy0, gy1, _ = _box_pixel_window(box_wsen, level)
    tcol0, tcol1 = gx0 // TILE_PX, gx1 // TILE_PX
    trow0, trow1 = gy0 // TILE_PX, gy1 // TILE_PX
    return [(r, c) for r in range(trow0, trow1 + 1) for c in range(tcol0, tcol1 + 1)]


def _collect_tiles_for_box_day(
    root: Path,
    box: tuple[float, float, float, float],
    day_iso: str,
) -> dict[str, tuple[Path, str, dict[str, Any]]]:
    """Return unique `url -> (dest_path, url, query_dict)` tiles covering `(box, day_iso)`."""
    out: dict[str, tuple[Path, str, dict[str, Any]]] = {}
    for dspec in imagery_specs_for_day(day_iso):
        for trow, tcol in _day_tile_coords_for_box(box, dspec.level):
            url = day_tile_url(dspec, day_iso, trow, tcol)
            dest = day_tile_cache_path(root, dspec, day_iso, trow, tcol)
            query = {
                "kind": "gibs_wmts_tile",
                "epsg": "4326",
                "layer": dspec.layer,
                "time": day_iso,
                "tile_matrix_set": dspec.tile_matrix_set,
                "tile_matrix": dspec.level,
                "tile_row": trow,
                "tile_col": tcol,
            }
            out[url] = (dest, url, query)
    for plat in CLOUD_PLATFORMS:
        for when_norm in ("day", "night"):
            cspec = CLOUD_LAYERS[(plat, when_norm)]
            if day_iso < cspec.first_day:
                continue
            for trow, tcol in _cloud_tile_coords_for_box(box, cspec.level):
                url = tile_url(cspec, day_iso, trow, tcol)
                dest = tile_cache_path(root, cspec, day_iso, trow, tcol)
                query = {
                    "kind": "gibs_wmts_tile",
                    "epsg": "4326",
                    "layer": cspec.layer,
                    "time": day_iso,
                    "tile_matrix_set": cspec.tile_matrix_set,
                    "tile_matrix": cspec.level,
                    "tile_row": trow,
                    "tile_col": tcol,
                }
                out[url] = (dest, url, query)
    return out


def _is_tile_fresh(dest: Path, now_s: float, max_age_s: float) -> bool:
    manifest_path = dest.with_name(dest.name + ".manifest.json")
    if not dest.is_file() or not manifest_path.is_file():
        return False
    try:
        man = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    ts = _parse_utc_epoch(man.get("retrieved_utc"))
    if ts is None:
        return False
    return (now_s - ts) < max_age_s


def _refresh_one_tile(
    dest: Path,
    url: str,
    query: dict[str, Any],
    *,
    opener: Opener,
    pause_s: float,
    retrieved_utc: str | None = None,
) -> str:
    manifest_path = dest.with_name(dest.name + ".manifest.json")
    had_existing = dest.is_file()
    try:
        body = _fetch_bytes(url, opener=opener, pause_s=pause_s)
    except _TileNotAvailable:
        return "kept_existing" if had_existing else "missing_404"
    except RuntimeError:
        if had_existing:
            return "kept_existing_on_error"
        raise

    manifest = {
        "source_url": url,
        "query": query,
        "retrieved_utc": retrieved_utc or _now_utc(),
        "bytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
    }
    _write_atomic_bytes(dest, body)
    _write_atomic_bytes(manifest_path, (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
    return "fetched"


def _refresh_tile_worker(args: tuple[str, str, dict[str, Any], float, str]) -> tuple[str, str]:
    dest_str, url, query, pause_s, stamp = args
    status = _refresh_one_tile(
        Path(dest_str), url, query, opener=_default_opener, pause_s=pause_s, retrieved_utc=stamp
    )
    return url, status


def seed_existing_cache(src_cache: Path, dst_root: Path) -> int:
    """Copy already-cached raw colormaps and tiles (with manifests) so no tile is fetched twice."""
    copied = 0
    if not src_cache.is_dir():
        return 0
    for sub in ("colormaps", "tiles"):
        sdir = src_cache / sub
        if not sdir.is_dir():
            continue
        for f in sdir.rglob("*"):
            if not f.is_file():
                continue
            rel = f.relative_to(src_cache)
            target = dst_root / rel
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, target)
                copied += 1
    return copied


def directory_bytes(root: Path) -> tuple[int, int]:
    """Return `(total_files, total_bytes)` under `root`."""
    files = 0
    total = 0
    if not root.is_dir():
        return 0, 0
    for f in root.rglob("*"):
        if f.is_file():
            files += 1
            total += f.stat().st_size
    return files, total


def fetch_featured_fires(
    regions_payload: dict[str, Any],
    root: Path,
    *,
    workers: int = MAX_WORKERS,
    pause_s: float = 0.25,
    seed_from: Path | None = None,
    only_missing: bool = False,
) -> dict[str, Any]:
    """Fetch imagery crops and cloud shares for all open featured fires using at most 4 workers."""
    if workers < 1 or workers > MAX_WORKERS:
        raise ValueError(f"workers must be between 1 and {MAX_WORKERS}, got {workers}")

    store_root = Path(root)
    store_root.mkdir(parents=True, exist_ok=True)

    seeded_files = seed_existing_cache(seed_from, store_root) if seed_from is not None else 0

    # Record every place's box so HTTP routes know newly added regions offline.
    place_boxes: dict[str, list[float]] = {}
    for place in regions_payload.get("places") or []:
        rid = str(place.get("id") or "").strip()
        if rid:
            b = _place_box_wsen(place, rid)
            if b is not None:
                place_boxes[rid] = list(b)
    update_boxes_index(store_root, place_boxes)

    fires = featured_fire_windows(regions_payload)
    unique_pairs: list[tuple[str, list[float], str]] = []
    seen_pairs: set[tuple[str, str]] = set()
    for fire in fires:
        rid = str(fire["region_id"])
        box_list = list(fire["box"])
        for d in fire["days"]:
            pair = (rid, str(d))
            if pair not in seen_pairs:
                seen_pairs.add(pair)
                unique_pairs.append((rid, box_list, str(d)))

    summary_path = store_root / "featured_fires_manifest.json"
    previously_completed: set[tuple[str, str]] = set()
    if only_missing and summary_path.is_file():
        try:
            old_doc = json.loads(summary_path.read_text(encoding="utf-8"))
            for old_f in old_doc.get("fires") or []:
                old_rid = str(old_f.get("region_id") or "")
                for ds in old_f.get("day_summaries") or []:
                    old_d = str(ds.get("day") or "")
                    if old_rid and old_d and all(
                        cloud_file_path(store_root, old_rid, old_d, w).is_file() for w in ("day", "night")
                    ):
                        previously_completed.add((old_rid, old_d))
        except (OSError, ValueError):
            previously_completed = set()

    results_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    pending_tasks: list[tuple[str, str, list[float], str, float, bool, str | None]] = []
    newly_fetched_pairs: list[tuple[str, str]] = []

    for rid, box_list, d in unique_pairs:
        if only_missing and ((rid, d) in previously_completed or is_target_day_complete(store_root, rid, d)):
            results_by_pair[(rid, d)] = summarize_cached_target_day(store_root, rid, d)
        else:
            pending_tasks.append((str(store_root), rid, box_list, d, pause_s, False, None))
            newly_fetched_pairs.append((rid, d))

    if pending_tasks:
        for key in (("MODIS_TERRA", "day"), ("VIIRS_SNPP", "day")):
            _load_colormap(CLOUD_LAYERS[key], cache_dir=store_root, opener=_default_opener, pause_s=pause_s)

        if workers == 1:
            for t in pending_tasks:
                res = _warm_worker_task(t)
                results_by_pair[(res["region_id"], res["day"])] = res
                print(f"[gibs featured] {res['region_id']} {res['day']} done", flush=True)
        else:
            with ProcessPoolExecutor(max_workers=workers) as pool:
                futs = {pool.submit(_warm_worker_task, t): (t[1], t[3]) for t in pending_tasks}
                done_n = 0
                for fut in as_completed(futs):
                    res = fut.result()
                    done_n += 1
                    results_by_pair[(res["region_id"], res["day"])] = res
                    print(f"[gibs featured {done_n}/{len(pending_tasks)}] {res['region_id']} {res['day']} done", flush=True)

    new_pair_set = set(newly_fetched_pairs)
    newly_fetched_fires: list[str] = []
    for fire in fires:
        rid = str(fire["region_id"])
        fire["day_summaries"] = [results_by_pair[(rid, d)] for d in fire["days"]]
        if any((rid, d) in new_pair_set for d in fire["days"]):
            newly_fetched_fires.append(str(fire["id"]))

    summary_path = store_root / "featured_fires_manifest.json"
    provisional = {
        "kind": "gibs_featured_fires_store",
        "built_utc": _now_utc(),
        "workers_used": workers,
        "seeded_files": seeded_files,
        "featured_fires_count": len(fires),
        "region_days_count": len(unique_pairs),
        "newly_fetched_fires": newly_fetched_fires,
        "newly_fetched_region_days": len(newly_fetched_pairs),
        "closed_2021_regions_skipped": sorted(CLOSED_TEST_REGIONS),
        "fires": fires,
    }
    _write_atomic_bytes(summary_path, (json.dumps(provisional, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
    n_files, n_bytes = directory_bytes(store_root)
    provisional["total_files"] = n_files
    provisional["total_bytes"] = n_bytes
    _write_atomic_bytes(summary_path, (json.dumps(provisional, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
    n_files, n_bytes = directory_bytes(store_root)
    provisional["total_files"] = n_files
    provisional["total_bytes"] = n_bytes
    _write_atomic_bytes(summary_path, (json.dumps(provisional, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
    return provisional


def fetch_live_cohorts(
    cohorts_path: Path,
    root: Path,
    *,
    workers: int = MAX_WORKERS,
    pause_s: float = 0.25,
    max_age_s: float = LIVE_REFRESH_SECONDS,
    days: list[str] | None = None,
    now_utc: _dt.datetime | None = None,
    opener: Opener | None = None,
) -> dict[str, Any]:
    """Fetch and refresh (every 3 hours) today's and yesterday's GIBS pictures and cloud shares for live sealer fires."""
    if workers < 1 or workers > MAX_WORKERS:
        raise ValueError(f"workers must be between 1 and {MAX_WORKERS}, got {workers}")

    store_root = Path(root)
    store_root.mkdir(parents=True, exist_ok=True)
    current_dt = now_utc.astimezone(_dt.timezone.utc) if now_utc is not None else _dt.datetime.now(_dt.timezone.utc)
    now_s = current_dt.timestamp()
    sync_stamp = current_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    if days is not None:
        target_days = [_validate_day(d)[0] for d in days]
    else:
        today_d = current_dt.date()
        target_days = [(today_d - _dt.timedelta(days=1)).isoformat(), today_d.isoformat()]

    fires = load_live_cohorts(cohorts_path)
    update_boxes_index(store_root, {f["id"]: f["box"] for f in fires})

    manifest_path = store_root / "live_fires_manifest.json"
    prev_refreshed: dict[str, str] = {}
    if manifest_path.is_file():
        try:
            prev_doc = json.loads(manifest_path.read_text(encoding="utf-8"))
            if isinstance(prev_doc.get("fire_day_refreshed_utc"), dict):
                prev_refreshed = {str(k): str(v) for k, v in prev_doc["fire_day_refreshed_utc"].items()}
        except (OSError, ValueError):
            prev_refreshed = {}

    due_pairs: list[tuple[dict[str, Any], str]] = []
    cached_pairs: list[tuple[dict[str, Any], str]] = []
    for fire in fires:
        fid = str(fire["id"])
        box_wsen = _round_box(fire["box"])
        for day_iso in target_days:
            _, s0, s1 = _validate_day(day_iso)
            try:
                _check_closed_window(box_wsen, s0, s1)
            except ClosedWindow:
                continue
            key = f"{fid}|{day_iso}"
            last_ts = _parse_utc_epoch(prev_refreshed.get(key))
            has_cloud = all(
                cloud_file_path(store_root, fid, day_iso, w).is_file() for w in ("day", "night")
            )
            if last_ts is not None and (now_s - last_ts) < max_age_s and has_cloud:
                cached_pairs.append((fire, day_iso))
            else:
                due_pairs.append((fire, day_iso))

    active_opener = opener if opener is not None else _default_opener
    tiles_fetched = 0
    tiles_404 = 0

    if due_pairs:
        for key in (("MODIS_TERRA", "day"), ("VIIRS_SNPP", "day")):
            _load_colormap(CLOUD_LAYERS[key], cache_dir=store_root, opener=active_opener, pause_s=pause_s)

        unique_tiles: dict[str, tuple[Path, str, dict[str, Any]]] = {}
        for fire, day_iso in due_pairs:
            box_wsen = _round_box(fire["box"])
            for url, entry in _collect_tiles_for_box_day(store_root, box_wsen, day_iso).items():
                unique_tiles[url] = entry

        stale_tiles = [
            entry for entry in unique_tiles.values() if not _is_tile_fresh(entry[0], now_s, max_age_s)
        ]

        if opener is not None or workers == 1:
            for dest, url, query in stale_tiles:
                st = _refresh_one_tile(
                    dest, url, query, opener=active_opener, pause_s=pause_s, retrieved_utc=sync_stamp
                )
                if st == "fetched":
                    tiles_fetched += 1
                elif st == "missing_404":
                    tiles_404 += 1
        elif stale_tiles:
            tile_tasks = [(str(dest), url, query, pause_s, sync_stamp) for (dest, url, query) in stale_tiles]
            with ProcessPoolExecutor(max_workers=workers) as pool:
                for fut in as_completed([pool.submit(_refresh_tile_worker, t) for t in tile_tasks]):
                    _, st = fut.result()
                    if st == "fetched":
                        tiles_fetched += 1
                    elif st == "missing_404":
                        tiles_404 += 1

    results_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    for fire, day_iso in cached_pairs:
        fid = str(fire["id"])
        results_by_pair[(fid, day_iso)] = summarize_cached_target_day(store_root, fid, day_iso)

    if due_pairs:
        if opener is not None or workers == 1:
            for fire, day_iso in due_pairs:
                fid = str(fire["id"])
                res = warm_target_day(
                    store_root,
                    fid,
                    day_iso,
                    box=fire["box"],
                    pause_s=0.0,
                    opener=_offline_opener,
                    force_rebuild=True,
                    synced_utc=sync_stamp,
                )
                results_by_pair[(fid, day_iso)] = res
                prev_refreshed[f"{fid}|{day_iso}"] = sync_stamp
        else:
            warm_tasks = [
                (str(store_root), str(fire["id"]), list(fire["box"]), day_iso, 0.0, True, sync_stamp)
                for (fire, day_iso) in due_pairs
            ]
            with ProcessPoolExecutor(max_workers=workers) as pool:
                futs = {pool.submit(_warm_worker_task, t): (t[1], t[3]) for t in warm_tasks}
                done_n = 0
                for fut in as_completed(futs):
                    res = fut.result()
                    done_n += 1
                    fid_done, day_done = res["region_id"], res["day"]
                    results_by_pair[(fid_done, day_done)] = res
                    prev_refreshed[f"{fid_done}|{day_done}"] = sync_stamp
                    print(f"[gibs live {done_n}/{len(warm_tasks)}] {fid_done} {day_done} refreshed", flush=True)

    fires_out: list[dict[str, Any]] = []
    for fire in fires:
        fid = str(fire["id"])
        fires_out.append(
            {
                **fire,
                "days": target_days,
                "day_summaries": [results_by_pair[(fid, d)] for d in target_days if (fid, d) in results_by_pair],
            }
        )

    keep_keys = {f"{f['id']}|{d}" for f in fires for d in target_days}
    trimmed_refreshed = {k: v for k, v in sorted(prev_refreshed.items()) if k in keep_keys}

    live_manifest = {
        "kind": "gibs_live_fires_store",
        "built_utc": sync_stamp,
        "cohorts_file": Path(cohorts_path).name,
        "workers_used": workers,
        "refresh_max_age_s": max_age_s,
        "days": target_days,
        "live_fires_count": len(fires_out),
        "refreshed_fire_days": len(due_pairs),
        "cached_fire_days": len(cached_pairs),
        "tiles_fetched": tiles_fetched,
        "tiles_404": tiles_404,
        "fire_day_refreshed_utc": trimmed_refreshed,
        "fires": fires_out,
    }
    _write_atomic_bytes(
        manifest_path,
        (json.dumps(live_manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
    )
    n_files, n_bytes = directory_bytes(store_root)
    live_manifest["total_store_files"] = n_files
    live_manifest["total_store_bytes"] = n_bytes
    _write_atomic_bytes(
        manifest_path,
        (json.dumps(live_manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
    )
    return live_manifest


def _fetch_json_with_retry(url: str, *, retries: int = 6, wait_s: float = 5.0) -> dict[str, Any]:
    last_exc: Exception | None = None
    for attempt in range(max(1, retries)):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            last_exc = exc
            if attempt + 1 < retries:
                time.sleep(wait_s)
    raise RuntimeError(f"failed to read JSON from {url}: {last_exc}")


def make_handler(root: Path | None = None, *, allow_network: bool = False) -> type[BaseHTTPRequestHandler]:
    store_root = Path(root) if root is not None else gibs_dir()

    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            route = parsed.path.rstrip("/") or "/"
            hit = gibs_route(route, parse_qs(parsed.query), root=store_root, allow_network=allow_network)
            if hit is None:
                hit = _json_resp(HTTPStatus.NOT_FOUND, {"error": f"this server answers {PREFIX} routes only"})
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

    return _Handler


def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    if raw and raw[0] in ("fetch", "sync"):
        mode = raw[0]
        ap = argparse.ArgumentParser(
            description="Fetch NASA GIBS pictures and cloud shares for featured fires and live sealer cohorts."
        )
        ap.add_argument("--regions-url", default="http://127.0.0.1:8788/api/regions")
        ap.add_argument("--regions-file", type=Path, default=None)
        ap.add_argument("--cohorts-file", type=Path, default=None)
        ap.add_argument("--gibs-dir", type=Path, default=None)
        ap.add_argument("--seed-cache", type=Path, default=_REPO_ROOT / "data" / "cache" / "gibs")
        ap.add_argument("--workers", type=int, default=MAX_WORKERS)
        ap.add_argument("--pause-s", type=float, default=0.25)
        ap.add_argument("--live-max-age-s", type=float, default=LIVE_REFRESH_SECONDS)
        ap.add_argument("--force-featured", action="store_true")
        args = ap.parse_args(raw[1:])

        if args.regions_file is not None:
            regions_payload = json.loads(args.regions_file.read_text(encoding="utf-8"))
        else:
            regions_payload = _fetch_json_with_retry(args.regions_url)

        target_root = args.gibs_dir.resolve() if args.gibs_dir is not None else gibs_dir()
        featured_summary = fetch_featured_fires(
            regions_payload,
            target_root,
            workers=args.workers,
            pause_s=args.pause_s,
            seed_from=args.seed_cache,
            only_missing=(mode == "sync" and not args.force_featured),
        )

        cohorts_file = args.cohorts_file
        if cohorts_file is None and mode == "sync":
            default_cohorts = live_dir() / "cohorts.jsonl"
            if default_cohorts.is_file():
                cohorts_file = default_cohorts

        live_summary: dict[str, Any] | None = None
        if cohorts_file is not None and cohorts_file.is_file():
            live_summary = fetch_live_cohorts(
                cohorts_file.resolve(),
                target_root,
                workers=args.workers,
                pause_s=args.pause_s,
                max_age_s=args.live_max_age_s,
            )

        n_files, n_bytes = directory_bytes(target_root)
        out_report: dict[str, Any] = {
            "synced_utc": _now_utc(),
            "featured_fires_count": featured_summary["featured_fires_count"],
            "region_days_count": featured_summary["region_days_count"],
            "newly_fetched_fires": featured_summary["newly_fetched_fires"],
            "newly_fetched_region_days": featured_summary["newly_fetched_region_days"],
            "total_files": n_files,
            "total_bytes": n_bytes,
        }
        if live_summary is not None:
            out_report["live"] = {
                "days": live_summary["days"],
                "live_fires_count": live_summary["live_fires_count"],
                "refreshed_fire_days": live_summary["refreshed_fire_days"],
                "cached_fire_days": live_summary["cached_fire_days"],
                "tiles_fetched": live_summary["tiles_fetched"],
                "tiles_404": live_summary["tiles_404"],
            }
        print(json.dumps(out_report, indent=2))
        return 0

    serve_argv = raw[1:] if (raw and raw[0] == "serve") else raw
    ap = argparse.ArgumentParser(description="Serve NASA GIBS day-picture and cloud-share routes.")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8688)
    ap.add_argument("--gibs-dir", type=Path, default=None)
    ap.add_argument("--allow-network", action="store_true")
    args = ap.parse_args(serve_argv)
    target_root = args.gibs_dir.resolve() if args.gibs_dir is not None else gibs_dir()
    srv = ThreadingHTTPServer((args.host, args.port), make_handler(target_root, allow_network=args.allow_network))
    print(f"gibs routes on http://{args.host}:{args.port}{PREFIX}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
