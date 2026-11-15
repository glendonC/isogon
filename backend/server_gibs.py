"""HTTP routes and batch cache builder for NASA GIBS daily region pictures and cloud shares.

Routes under `/api/gibs` (mounted through `gibs_route(route, qs)` or served standalone):
  GET /api/gibs/day?region_id=<id>&day=<YYYY-MM-DD>&layer=<GIBS layer>
      Returns the region box's cropped daily satellite image as `image/png` (or its manifest as
      JSON when `format=json` is passed). Also accepts `platform` and `kind` (`true_color` or
      `false_color`) in place of `layer`.
  GET /api/gibs/cloud?region_id=<id>&day=<YYYY-MM-DD>&when=<day|night>[&platform=<platform>]
      Returns the daily cloud share over the region box from NASA GIBS colour-mapped science
      tiles, naming the GIBS layer, NASA product, pixel size, pixel counts, source URLs, and
      per-platform shares across Terra, Aqua, Suomi NPP, and NOAA-20.

Store layout under `$ISOGON_GIBS_DIR`, else `$ISOGON_WORLD_DIR/gibs`, else `data/cache/world/gibs`:
  colormaps/                                  GIBS v1.3 XML colour maps + .manifest.json
  tiles/<layer>/<day>/<tms>/<z>/<r>/<c>.<ext> raw GIBS WMTS tiles + .manifest.json
  crops/<region_id>/<day>/<layer>.png         cropped region mosaics + .manifest.json
  cloud/<region_id>/<day>/<when>.json         cached region cloud shares + .manifest.json
  featured_fires_manifest.json                summary of pre-fetched featured fire windows

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
import os
from pathlib import Path
import shutil
import sys
import threading
from typing import Any
from urllib.parse import parse_qs, urlparse
import urllib.request

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.gibs_cloud import (  # noqa: E402
    CLOUD_LAYERS,
    LAYER_BY_NAME as CLOUD_LAYER_BY_NAME,
    PAUSE_S,
    USER_AGENT,
    Opener,
    _TileNotAvailable,
    _check_closed_window,
    _default_opener,
    _load_colormap,
    _now_utc,
    _validate_day,
    cloud_share,
    normalize_platform,
    normalize_when,
)
from backend.model.training import ClosedWindow, EVIDENCE_ADDRESS  # noqa: E402
from backend.terrain.gibs_day import (  # noqa: E402
    DAY_LAYERS,
    DAY_LAYER_BY_NAME,
    DayLayerSpec,
    build_day_image,
    resolve_day_layer,
)
from backend.terrain.live_region import PRESET_BY_ID  # noqa: E402

PREFIX: str = "/api/gibs"
JSON_CT: str = "application/json; charset=utf-8"
PNG_CT: str = "image/png"
MAX_WORKERS: int = 4

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


def world_dir() -> Path:
    v = os.environ.get("ISOGON_WORLD_DIR", "").strip()
    return Path(v).expanduser() if v else _REPO_ROOT / "data" / "cache" / "world"


def gibs_dir() -> Path:
    v = os.environ.get("ISOGON_GIBS_DIR", "").strip()
    return Path(v).expanduser() if v else world_dir() / "gibs"


def region_box_wsen(region_id: str) -> tuple[float, float, float, float]:
    rid = str(region_id).strip()
    if rid not in PRESET_BY_ID:
        raise KeyError(f"unknown region '{rid}'")
    b = PRESET_BY_ID[rid].bbox
    return (round(float(b.west), 5), round(float(b.south), 5), round(float(b.east), 5), round(float(b.north), 5))


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


def crop_file_path(root: Path, region_id: str, day_iso: str, layer_name: str) -> Path:
    return Path(root) / "crops" / region_id / day_iso / f"{layer_name}.png"


def cloud_file_path(root: Path, region_id: str, day_iso: str, when_norm: str) -> Path:
    return Path(root) / "cloud" / region_id / day_iso / f"{when_norm}.json"


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


def build_cloud_day_payload(
    region_id: str,
    day: str,
    when: str,
    *,
    root: Path,
    opener: Opener = _offline_opener,
    pause_s: float = PAUSE_S,
    persist: bool = False,
) -> dict[str, Any]:
    """Compute or read all four cloud-reporting satellites for `(region_id, day, when)`."""
    box = region_box_wsen(region_id)
    day_iso, start_s, end_s = _validate_day(day)
    _check_closed_window(box, start_s, end_s)
    when_norm = normalize_when(when)

    saved_path = cloud_file_path(root, region_id, day_iso, when_norm)
    if saved_path.is_file():
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
        "region_id": region_id,
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
        body = (json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")
        manifest = {
            "kind": "gibs_region_cloud_day",
            "region_id": region_id,
            "box": list(box),
            "day": day_iso,
            "when": when_norm,
            "source_urls": all_urls,
            "retrieved_utc": max(retrieved_times) if retrieved_times else _now_utc(),
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
    platform: str | None,
    layer: str | None,
    root: Path,
    opener: Opener,
    pause_s: float,
) -> dict[str, Any]:
    box = region_box_wsen(region_id)
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

    saved_path = cloud_file_path(root, region_id, day_iso, when_norm)
    if saved_path.is_file() and plat_norm in CLOUD_PLATFORMS:
        saved = json.loads(saved_path.read_text(encoding="utf-8"))
        entry = (saved.get("platforms") or {}).get(plat_norm)
        if entry is not None:
            return {
                "region_id": region_id,
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
        "region_id": region_id,
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
    region_id = (qs.get("region_id", qs.get("region", [""]))[0] or "").strip()
    day_raw = (qs.get("day", [""])[0] or "").strip()
    fmt = (qs.get("format", ["png"])[0] or "png").strip().lower()
    if fmt not in ("png", "json"):
        return _json_resp(HTTPStatus.BAD_REQUEST, {"error": "format must be 'png' or 'json'"})
    if not region_id or not day_raw:
        return _json_resp(HTTPStatus.BAD_REQUEST, {"error": "needs region_id, day and layer"})

    box = region_box_wsen(region_id)
    day_iso, start_s, end_s = _validate_day(day_raw)
    _check_closed_window(box, start_s, end_s)

    layer_given = bool((qs.get("layer", [""])[0] or "").strip() or (qs.get("platform", [""])[0] or "").strip())
    if fmt == "json" and not layer_given:
        day_dir = root / "crops" / region_id / day_iso
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
                        "crop_bounds_wsen": doc.get("crop_bounds_wsen"),
                        "url": f"{PREFIX}/day?region_id={region_id}&day={day_iso}&layer={lyr}",
                    }
                )
        return _json_resp(
            HTTPStatus.OK,
            {"region_id": region_id, "box": list(box), "day": day_iso, "layers": items},
        )

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

    crop_path = crop_file_path(root, region_id, day_iso, spec.layer)
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
        return _json_resp(
            HTTPStatus.OK,
            {
                "region_id": region_id,
                **manifest,
                "png_url": f"{PREFIX}/day?region_id={region_id}&day={day_iso}&layer={spec.layer}",
            },
        )

    return int(HTTPStatus.OK), crop_path.read_bytes(), PNG_CT


def _cloud_route(
    qs: dict[str, list[str]],
    root: Path,
    *,
    allow_network: bool,
    opener: Opener | None,
) -> tuple[int, bytes, str]:
    region_id = (qs.get("region_id", qs.get("region", [""]))[0] or "").strip()
    day_raw = (qs.get("day", [""])[0] or "").strip()
    when_raw = (qs.get("when", qs.get("day_night", [""]))[0] or "").strip()
    platform_raw = (qs.get("platform", [""])[0] or "").strip() or None
    layer_raw = (qs.get("layer", [""])[0] or "").strip() or None

    if not region_id or not day_raw or (not when_raw and not layer_raw):
        return _json_resp(HTTPStatus.BAD_REQUEST, {"error": "needs region_id, day and when (day or night)"})

    active_opener = opener if opener is not None else (_default_opener if allow_network else _offline_opener)
    pause = PAUSE_S if allow_network else 0.0

    if platform_raw is not None or layer_raw is not None:
        payload = _cloud_single_platform_payload(
            region_id,
            day_raw,
            when_raw or "day",
            platform=platform_raw,
            layer=layer_raw,
            root=root,
            opener=active_opener,
            pause_s=pause,
        )
        return _json_resp(HTTPStatus.OK, payload)

    payload = build_cloud_day_payload(
        region_id,
        day_raw,
        when_raw,
        root=root,
        opener=active_opener,
        pause_s=pause,
        persist=False,
    )
    return _json_resp(HTTPStatus.OK, payload)


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
        return _json_resp(
            HTTPStatus.NOT_FOUND,
            {
                "error": f"unknown GIBS route '{route}'",
                "routes": [
                    f"{PREFIX}/day?region_id=<id>&day=<YYYY-MM-DD>&layer=<layer>",
                    f"{PREFIX}/cloud?region_id=<id>&day=<YYYY-MM-DD>&when=<day|night>",
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


def featured_fire_windows(regions_payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract every open featured fire and the UTC calendar days of its `default_start` window."""
    fires: list[dict[str, Any]] = []
    for place in regions_payload.get("places") or []:
        region_id = str(place.get("id") or "")
        if not region_id or region_id not in PRESET_BY_ID:
            continue
        box = region_box_wsen(region_id)
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
            cur = d0
            while cur <= d1:
                day_s = cur.isoformat()
                _, s0, s1 = _validate_day(day_s)
                _check_closed_window(box, s0, s1)
                days.append(day_s)
                cur += _dt.timedelta(days=1)

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


def warm_region_day(
    root: Path,
    region_id: str,
    day: str,
    *,
    pause_s: float = 0.25,
    opener: Opener = _default_opener,
) -> dict[str, Any]:
    """Fetch and write all satellite day crops and day/night cloud shares for one `(region_id, day)`."""
    store_root = Path(root)
    box = region_box_wsen(region_id)
    day_iso, start_s, end_s = _validate_day(day)
    _check_closed_window(box, start_s, end_s)

    crops_summary: list[dict[str, Any]] = []
    for spec in imagery_specs_for_day(day_iso):
        out_path = crop_file_path(store_root, region_id, day_iso, spec.layer)
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
                }
            )
            continue
        try:
            man = build_day_image(
                box,
                day_iso,
                layer=spec.layer,
                out_path=out_path,
                cache_dir=store_root,
                opener=opener,
                pause_s=pause_s,
            )
            crops_summary.append(
                {
                    "layer": spec.layer,
                    "platform": spec.platform,
                    "kind": spec.kind,
                    "status": "ok",
                    "bytes": man["bytes"],
                    "sha256": man["sha256"],
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
            region_id,
            day_iso,
            when_norm,
            root=store_root,
            opener=opener,
            pause_s=pause_s,
            persist=True,
        )
        cloud_summary[when_norm] = {
            plat: (c_doc["platforms"][plat]["share"]) for plat in CLOUD_PLATFORMS
        }

    return {
        "region_id": region_id,
        "day": day_iso,
        "crops": crops_summary,
        "cloud": cloud_summary,
    }


def _warm_worker_task(args: tuple[str, str, str, float]) -> dict[str, Any]:
    root_str, region_id, day_iso, pause_s = args
    return warm_region_day(Path(root_str), region_id, day_iso, pause_s=pause_s)


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
            # Never copy anything from 2021 even if present.
            if "/2021-" in f.as_posix():
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
) -> dict[str, Any]:
    """Fetch imagery crops and cloud shares for all open featured fires using at most 4 workers."""
    if workers < 1 or workers > MAX_WORKERS:
        raise ValueError(f"workers must be between 1 and {MAX_WORKERS}, got {workers}")

    store_root = Path(root)
    store_root.mkdir(parents=True, exist_ok=True)

    seeded_files = seed_existing_cache(seed_from, store_root) if seed_from is not None else 0

    # Pre-load the two GIBS XML colour maps once before starting worker processes.
    for key in (("MODIS_TERRA", "day"), ("VIIRS_SNPP", "day")):
        _load_colormap(CLOUD_LAYERS[key], cache_dir=store_root, opener=_default_opener, pause_s=pause_s)

    fires = featured_fire_windows(regions_payload)
    unique_pairs: list[tuple[str, str]] = []
    seen_pairs: set[tuple[str, str]] = set()
    for fire in fires:
        rid = str(fire["region_id"])
        for d in fire["days"]:
            pair = (rid, str(d))
            if pair not in seen_pairs:
                seen_pairs.add(pair)
                unique_pairs.append(pair)

    results_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    tasks = [(str(store_root), rid, d, pause_s) for (rid, d) in unique_pairs]

    if workers == 1:
        for t in tasks:
            res = _warm_worker_task(t)
            results_by_pair[(res["region_id"], res["day"])] = res
            print(f"[gibs fetch] {res['region_id']} {res['day']} done", flush=True)
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futs = {pool.submit(_warm_worker_task, t): (t[1], t[2]) for t in tasks}
            done_n = 0
            for fut in as_completed(futs):
                res = fut.result()
                done_n += 1
                results_by_pair[(res["region_id"], res["day"])] = res
                print(f"[gibs fetch {done_n}/{len(tasks)}] {res['region_id']} {res['day']} done", flush=True)

    for fire in fires:
        rid = str(fire["region_id"])
        fire["day_summaries"] = [results_by_pair[(rid, d)] for d in fire["days"]]

    summary_path = store_root / "featured_fires_manifest.json"
    provisional = {
        "kind": "gibs_featured_fires_store",
        "built_utc": _now_utc(),
        "workers_used": workers,
        "seeded_files": seeded_files,
        "featured_fires_count": len(fires),
        "region_days_count": len(unique_pairs),
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
    if raw and raw[0] == "fetch":
        ap = argparse.ArgumentParser(description="Fetch NASA GIBS pictures and cloud shares for open featured fires.")
        ap.add_argument("--regions-url", default="http://127.0.0.1:8788/api/regions")
        ap.add_argument("--regions-file", type=Path, default=None)
        ap.add_argument("--gibs-dir", type=Path, default=None)
        ap.add_argument("--seed-cache", type=Path, default=_REPO_ROOT / "data" / "cache" / "gibs")
        ap.add_argument("--workers", type=int, default=MAX_WORKERS)
        ap.add_argument("--pause-s", type=float, default=0.25)
        args = ap.parse_args(raw[1:])
        if args.regions_file is not None:
            regions_payload = json.loads(args.regions_file.read_text(encoding="utf-8"))
        else:
            req = urllib.request.Request(args.regions_url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as resp:
                regions_payload = json.load(resp)
        target_root = args.gibs_dir.resolve() if args.gibs_dir is not None else gibs_dir()
        summary = fetch_featured_fires(
            regions_payload,
            target_root,
            workers=args.workers,
            pause_s=args.pause_s,
            seed_from=args.seed_cache,
        )
        print(
            json.dumps(
                {
                    "featured_fires_count": summary["featured_fires_count"],
                    "region_days_count": summary["region_days_count"],
                    "total_files": summary["total_files"],
                    "total_bytes": summary["total_bytes"],
                },
                indent=2,
            )
        )
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
