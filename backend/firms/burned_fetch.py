"""Fetch NASA monthly reflectance burned-area tiles and write compact numpy masks per box and window.

Products fetched from NASA LP DAAC (LPCLOUD) via keyless CMR search and EARTHDATA_TOKEN downloads:
  - MCD64A1 v061 (C2565786756-LPCLOUD): MODIS Terra+Aqua 500 m surface reflectance burned area (HDF4)
  - VNP64A1 v002 (C2847928673-LPCLOUD): Suomi NPP VIIRS 750 m surface reflectance burned area on 500 m grid (HDF4)

pyhdf and h5py are imported in this fetch tool only. What this tool writes to disk under the burned-area store
is plain numpy (.npz) and JSON (.manifest.json) beside every cached granule, monthly box raster, and window mask.
backend/firms/burned.py reads those files with numpy and the Python standard library only.

Token handling:
  EARTHDATA_TOKEN is read from the environment or --env-file and sent in an HTTP Authorization header to
  *.nasa.gov hosts only. It is stripped on redirects to external object storage hosts and redacted from every
  stored URL, manifest, log line, and error message.
"""

from __future__ import annotations

import argparse
import calendar
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
import datetime as _dt
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import threading
import time
from typing import Any
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
from numpy.typing import NDArray

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.burned import (  # noqa: E402
    BurnedGrid,
    BurnedWindow,
    ClosedBurnedWindow,
    DEFAULT_PRODUCT,
    NATIVE_UNMAPPED,
    PRODUCTS,
    PRODUCT_INFO,
    box_key,
    canonical_product,
    closed_region_for,
    compose_window_from_months,
    default_burned_dir,
    format_utc,
    lonlat_to_sinusoidal_hvij,
    month_path,
    normalize_box,
    overlapping_year_months,
    parse_utc_seconds,
    read_manifest,
    refuse_closed_window,
    sinusoidal_hvij_to_lonlat,
    TILE_DIM,
    tiles_for_box,
    window_path,
)

try:
    import h5py as _h5py
except ImportError:  # pragma: no cover
    _h5py = None  # type: ignore[assignment]

try:
    from pyhdf.SD import SD as _SD, SDC as _SDC

    HAS_PYHDF = True
except ImportError:  # pragma: no cover
    _SD = None  # type: ignore[assignment]
    _SDC = None  # type: ignore[assignment]
    HAS_PYHDF = False

USER_AGENT: str = "python-urllib/3.12"
CMR_BASE: str = "https://cmr.earthdata.nasa.gov/search"
CMR_PAGE_SIZE: int = 200
DEFAULT_WORKERS: int = 2
MAX_WORKERS: int = 4
PAUSE_S: float = 0.2
BACKOFF_BASE_S: float = 2.0
RETRIES: int = 5
RETRY_AFTER_MAX_S: float = 120.0
TARGET_NICE: int = 10

_TILE_RE = re.compile(r"\.(h\d{2}v\d{2})\.", re.IGNORECASE)
_SPLIT_ROW_RE = re.compile(
    r"^\|\s*`(?P<key>[^`]+)`\s*\|\s*(?P<continent>[^|]+?)\s*\|\s*(?P<zone>[^|]+?)\s*\|\s*"
    r"(?P<box>[-+0-9.,\s]+?)\s*\|\s*(?P<start>\d{4}-\d{2}-\d{2}[^|\s]*)\s+to\s+(?P<end>\d{4}-\d{2}-\d{2}[^|\s]*)\s*\|"
)


class TokenMissing(RuntimeError):
    """EARTHDATA_TOKEN is not set in the environment or --env-file."""


class AuthApprovalRequired(RuntimeError):
    """Earthdata Login requires interactive EULA or application approval."""


@dataclass(frozen=True)
class TileGranule:
    """Metadata for one monthly sinusoidal burned-area tile returned by CMR."""

    product: str
    version: str
    concept_id: str
    producer_granule_id: str
    filename: str
    tile: str
    tile_h: int
    tile_v: int
    time_start: str
    time_end: str
    https_url: str
    granule_size_mb: float


# ---------------------------------------------------------------------------
# Process priority and token redaction
# ---------------------------------------------------------------------------


def ensure_nice(target_nice: int = TARGET_NICE) -> int:
    """Raise POSIX niceness to at least target_nice so long jobs yield CPU cleanly."""
    if not hasattr(os, "nice"):
        return 0
    try:
        cur = os.nice(0)
        if cur < target_nice:
            return os.nice(target_nice - cur)
        return cur
    except OSError:
        return 0


def read_earthdata_token(env_file: Path | None = None) -> str:
    """Read EARTHDATA_TOKEN from the environment or --env-file without logging its value."""
    val = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if val:
        return val
    candidates = [env_file] if env_file is not None else [_REPO_ROOT / ".env"]
    for cand in candidates:
        if cand is None or not cand.is_file():
            continue
        for raw in cand.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, rest = line.split("=", 1)
            if key.strip() == "EARTHDATA_TOKEN":
                tok = rest.strip().strip('"').strip("'").strip()
                if tok:
                    return tok
    raise TokenMissing(
        "EARTHDATA_TOKEN is not set; pass --env-file pointing to a .env file with EARTHDATA_TOKEN=..."
    )


def strip_url_secrets(url: str) -> str:
    """Strip query parameters, userinfo, and fragments from a URL before storing or logging."""
    try:
        p = urllib.parse.urlsplit(url)
    except ValueError:
        return "<redacted-url>"
    host = p.hostname or ""
    if p.port:
        host = f"{host}:{p.port}"
    return urllib.parse.urlunsplit((p.scheme, host, p.path, "", ""))


def redact_token(text: str, token: str | None = None) -> str:
    """Remove any token value and any URL query parameters from log or error text."""
    out = str(text)
    out = re.sub(
        r"https?://[^\s\"'<>]+",
        lambda m: strip_url_secrets(m.group(0)),
        out,
    )
    out = re.sub(r"(?i)(authorization\s*:\s*bearer\s+)\S+", r"\1<REDACTED>", out)
    if token:
        t = token.strip()
        if t:
            out = out.replace(t, "<REDACTED>")
            enc = urllib.parse.quote(t, safe="")
            if enc:
                out = out.replace(enc, "<REDACTED>")
    return out


class _SafeEarthdataRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Preserve Bearer token across *.nasa.gov redirects; strip it on external storage hosts."""

    def __init__(self, token: str) -> None:
        super().__init__()
        self._token = token

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        new_req = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new_req is None:
            return None
        host = (urllib.parse.urlparse(newurl).hostname or "").lower()
        for h in list(new_req.headers.keys()):
            if h.lower() == "authorization":
                del new_req.headers[h]
        for h in list(new_req.unredirected_hdrs.keys()):
            if h.lower() == "authorization":
                del new_req.unredirected_hdrs[h]
        if host == "nasa.gov" or host.endswith(".nasa.gov"):
            new_req.add_unredirected_header("Authorization", f"Bearer {self._token}")
        return new_req


# ---------------------------------------------------------------------------
# Atomic writes and sidecar manifests
# ---------------------------------------------------------------------------


def _utc_now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(262144)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _write_json_atomic(path: Path, payload: dict[str, Any], token: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if token and token in text:
        text = redact_token(text, token)
    tmp = path.with_name(f".{path.name}.tmp.{os.getpid()}.{threading.get_ident()}")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def write_manifest(target: Path, payload: dict[str, Any], token: str | None = None) -> Path:
    """Write <target>.manifest.json atomically with redacted fields."""
    mpath = target.with_name(target.name + ".manifest.json")
    full = dict(payload)
    full.setdefault("file", target.name)
    if target.is_file():
        full.setdefault("bytes", target.stat().st_size)
        full.setdefault("sha256", _sha256_file(target))
    _write_json_atomic(mpath, full, token=token)
    return mpath


# ---------------------------------------------------------------------------
# CMR search and resumable granule downloads
# ---------------------------------------------------------------------------


def _month_bounds_utc(year: int, month: int) -> tuple[float, float]:
    start_s = float(calendar.timegm((year, month, 1, 0, 0, 0, 0, 0, 0)))
    if month == 12:
        end_s = float(calendar.timegm((year + 1, 1, 1, 0, 0, 0, 0, 0, 0)))
    else:
        end_s = float(calendar.timegm((year, month + 1, 1, 0, 0, 0, 0, 0, 0)))
    return start_s, end_s


def search_month_tiles(
    product: str,
    box: tuple[float, float, float, float],
    year: int,
    month: int,
    cache_dir: Path,
) -> list[TileGranule]:
    """Query NASA CMR (keyless) for monthly burned-area tiles overlapping box and (year, month)."""
    prod = canonical_product(product)
    pinfo = PRODUCT_INFO[prod]
    ym_str = f"{year:04d}-{month:02d}"
    if ym_str < pinfo["first_month"]:
        return []

    w, s, e, n = normalize_box(box)
    m_start_s, m_end_s = _month_bounds_utc(year, month)
    # Query interior of the calendar month so CMR inclusive temporal endpoints are clean,
    # and still filter returned entries strictly by overlap below.
    temp_str = f"{format_utc(m_start_s)},{format_utc(m_end_s)}"
    bbox_str = f"{w},{s},{e},{n}"
    params = {
        "collection_concept_id": pinfo["concept_id"],
        "bounding_box": bbox_str,
        "temporal": temp_str,
        "page_size": str(CMR_PAGE_SIZE),
    }
    q_str = urllib.parse.urlencode(params)
    url = f"{CMR_BASE}/granules.json?{q_str}"

    cmr_key = hashlib.sha256(f"{prod}|{bbox_str}|{ym_str}".encode("utf-8")).hexdigest()[:20]
    cached_json = cache_dir / "cmr" / f"{prod}_{ym_str}_{cmr_key}.json"
    if cached_json.is_file() and read_manifest(cached_json) is not None:
        body = json.loads(cached_json.read_text(encoding="utf-8"))
    else:
        last_err: Exception | None = None
        body = None
        for attempt in range(RETRIES):
            try:
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=45) as resp:
                    raw = resp.read().decode("utf-8")
                body = json.loads(raw)
                break
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                time.sleep(min(BACKOFF_BASE_S * (2**attempt), 30.0))
        if body is None:
            raise RuntimeError(f"CMR search failed for {prod} {ym_str}: {last_err}")
        _write_json_atomic(cached_json, body)
        write_manifest(
            cached_json,
            {
                "kind": "cmr_granules_search",
                "product": prod,
                "concept_id": pinfo["concept_id"],
                "year_month": ym_str,
                "bbox": [w, s, e, n],
                "source_url": strip_url_secrets(url),
                "retrieved_utc": _utc_now_iso(),
            },
        )
        time.sleep(PAUSE_S)

    wanted_tiles = set(tiles_for_box((w, s, e, n)))
    entries = body.get("feed", {}).get("entry", [])
    by_tile: dict[str, TileGranule] = {}
    for entry in entries:
        ts_str = entry.get("time_start", "")
        te_str = entry.get("time_end", "")
        if not ts_str or not te_str:
            continue
        ts_s = parse_utc_seconds(ts_str)
        te_s = parse_utc_seconds(te_str)
        # Strict half-open overlap against the target calendar month [m_start_s, m_end_s)
        if te_s <= m_start_s or ts_s >= m_end_s:
            continue
        https_url = ""
        for link in entry.get("links", []):
            href = str(link.get("href", ""))
            rel = str(link.get("rel", ""))
            if (
                href.startswith("https://")
                and "/data#" in rel
                and not href.lower().endswith((".xml", ".jpg", ".png", ".dmrpp", ".met"))
            ):
                https_url = href
                break
        if not https_url:
            continue
        fname = urllib.parse.urlparse(https_url).path.rsplit("/", 1)[-1]
        m = _TILE_RE.search(fname) or _TILE_RE.search(str(entry.get("producer_granule_id", "")))
        if not m:
            continue
        tile_id = m.group(1).lower()
        if wanted_tiles and tile_id not in wanted_tiles:
            continue
        th = int(tile_id[1:3])
        tv = int(tile_id[4:6])
        gran = TileGranule(
            product=prod,
            version=pinfo["version"],
            concept_id=pinfo["concept_id"],
            producer_granule_id=str(entry.get("producer_granule_id") or entry.get("title") or fname),
            filename=fname,
            tile=tile_id,
            tile_h=th,
            tile_v=tv,
            time_start=ts_str,
            time_end=te_str,
            https_url=https_url,
            granule_size_mb=float(entry.get("granule_size") or 0.0),
        )
        prev = by_tile.get(tile_id)
        if prev is None or gran.filename > prev.filename:
            by_tile[tile_id] = gran
    return [by_tile[k] for k in sorted(by_tile.keys())]


def _check_auth_error(code: int, final_url: str, body_preview: str, token: str) -> None:
    clean_url = strip_url_secrets(final_url)
    clean_body = redact_token(body_preview[:400], token)
    if code in (401, 403):
        if "eula" in clean_body.lower() or "approve" in clean_body.lower() or "urs.earthdata.nasa.gov" in clean_url:
            raise AuthApprovalRequired(
                f"Earthdata account approval or EULA required (HTTP {code} at {clean_url}): {clean_body}"
            )
        raise PermissionError(f"Earthdata HTTP {code} at {clean_url}: {clean_body}")


def download_tile_cached(
    gran: TileGranule,
    token: str,
    cache_dir: Path,
) -> tuple[Path, dict[str, Any], int]:
    """Download one monthly tile granule with resume and sidecar manifest; return (path, manifest, bytes_sent)."""
    dest = cache_dir / gran.product / gran.filename
    existing_manifest = read_manifest(dest)
    if dest.is_file() and existing_manifest is not None and dest.stat().st_size > 0:
        return dest, existing_manifest, 0

    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    opener = urllib.request.build_opener(_SafeEarthdataRedirectHandler(token))
    bytes_transferred = 0
    last_err: Exception | None = None

    for attempt in range(RETRIES):
        have = part.stat().st_size if part.is_file() else 0
        headers = {
            "User-Agent": USER_AGENT,
            "Authorization": f"Bearer {token}",
        }
        if have > 0:
            headers["Range"] = f"bytes={have}-"
        req = urllib.request.Request(gran.https_url, headers=headers)
        try:
            with opener.open(req, timeout=90) as resp:
                status = getattr(resp, "status", 200)
                mode = "ab" if (have > 0 and status == 206) else "wb"
                with open(part, mode) as out:
                    while True:
                        chunk = resp.read(262144)
                        if not chunk:
                            break
                        out.write(chunk)
                        bytes_transferred += len(chunk)
            os.replace(part, dest)
            manifest_payload = {
                "kind": "burned_tile_granule",
                "product": gran.product,
                "version": gran.version,
                "concept_id": gran.concept_id,
                "producer_granule_id": gran.producer_granule_id,
                "tile": gran.tile,
                "time_start": gran.time_start,
                "time_end": gran.time_end,
                "source_url": strip_url_secrets(gran.https_url),
                "retrieved_utc": _utc_now_iso(),
            }
            write_manifest(dest, manifest_payload, token=token)
            time.sleep(PAUSE_S)
            return dest, read_manifest(dest) or manifest_payload, bytes_transferred
        except urllib.error.HTTPError as exc:
            body_text = ""
            try:
                body_text = exc.read(512).decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                pass
            if exc.code == 416 and part.is_file():
                part.unlink(missing_ok=True)
                continue
            _check_auth_error(exc.code, exc.geturl() or gran.https_url, body_text, token)
            last_err = RuntimeError(
                f"HTTP {exc.code} downloading {gran.filename}: {redact_token(body_text, token)}"
            )
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            wait_s = min(float(retry_after), RETRY_AFTER_MAX_S) if (retry_after and retry_after.isdigit()) else min(BACKOFF_BASE_S * (2**attempt), 60.0)
            time.sleep(wait_s)
        except (AuthApprovalRequired, PermissionError):
            raise
        except Exception as exc:  # noqa: BLE001
            last_err = RuntimeError(redact_token(str(exc), token))
            time.sleep(min(BACKOFF_BASE_S * (2**attempt), 60.0))

    raise RuntimeError(f"failed downloading {gran.filename} after {RETRIES} attempts: {last_err}")


# ---------------------------------------------------------------------------
# HDF4 / HDF5 tile reader (isolated to this module)
# ---------------------------------------------------------------------------


def read_tile_layers(tile_path: Path) -> dict[str, Any]:
    """Read the 5 sinusoidal 2400 x 2400 layers from an HDF4 or HDF5 burned-area tile."""
    magic = tile_path.read_bytes()[:8]
    if magic[:4] == b"\x0e\x03\x13\x01":
        if not HAS_PYHDF or _SD is None or _SDC is None:
            raise RuntimeError(
                f"{tile_path.name} is an HDF4-EOS2 file, which requires pyhdf to read"
            )
        sd = _SD(str(tile_path), _SDC.READ)
        try:
            gattrs = sd.attributes()
            bd = np.asarray(sd.select("Burn Date").get(), dtype=np.int16)
            unc = np.asarray(sd.select("Burn Date Uncertainty").get(), dtype=np.uint8)
            qa = np.asarray(sd.select("QA").get(), dtype=np.uint8)
            fd = np.asarray(sd.select("First Day").get(), dtype=np.int16)
            ld = np.asarray(sd.select("Last Day").get(), dtype=np.int16)
            meta = {
                k: int(gattrs[k])
                for k in ("BurnedCells", "MissingCells", "LandCells", "ValidLandCells", "ProductStartDay", "ProductEndDay", "year")
                if k in gattrs and isinstance(gattrs[k], (int, float))
            }
            if "tile" in gattrs:
                tval = gattrs["tile"]
                meta["tile"] = tval.decode("latin-1") if isinstance(tval, bytes) else str(tval)
            return {
                "container": "HDF4",
                "burn_doy": bd,
                "uncertainty_days": unc,
                "qa": qa,
                "first_day": fd,
                "last_day": ld,
                "global_attrs": meta,
            }
        finally:
            sd.end()

    if magic == b"\x89HDF\r\n\x1a\n":
        if _h5py is None:
            raise RuntimeError(f"{tile_path.name} is an HDF5 file, which requires h5py to read")
        with _h5py.File(tile_path, "r") as f:
            found: dict[str, Any] = {}

            def _visit(name: str, obj: Any) -> None:
                if isinstance(obj, _h5py.Dataset):
                    leaf = name.rsplit("/", 1)[-1]
                    found[leaf] = obj[...]

            f.visititems(_visit)
            return {
                "container": "HDF5",
                "burn_doy": np.asarray(found["Burn Date"], dtype=np.int16),
                "uncertainty_days": np.asarray(found["Burn Date Uncertainty"], dtype=np.uint8),
                "qa": np.asarray(found["QA"], dtype=np.uint8),
                "first_day": np.asarray(found["First Day"], dtype=np.int16),
                "last_day": np.asarray(found["Last Day"], dtype=np.int16),
                "global_attrs": {},
            }

    raise ValueError(f"unrecognized burned-area tile container in {tile_path.name} (magic={magic.hex()})")


# ---------------------------------------------------------------------------
# Box extraction and saving
# ---------------------------------------------------------------------------


def extract_month_box(
    product: str,
    box: tuple[float, float, float, float],
    year: int,
    month: int,
    token: str,
    out_dir: Path,
    workers: int = DEFAULT_WORKERS,
) -> tuple[dict[str, Any] | None, int, bool]:
    """Ensure months/<product>/<box_key>/<YYYY-MM>.npz exists; return (month_record_or_None, bytes_sent, cached)."""
    prod = canonical_product(product)
    pinfo = PRODUCT_INFO[prod]
    norm_box = normalize_box(box)
    m_start_s, m_end_s = _month_bounds_utc(year, month)
    refuse_closed_window(norm_box, m_start_s, m_end_s)

    mpath = month_path(norm_box, year, month, product=prod, root=out_dir)
    if mpath.is_file() and read_manifest(mpath) is not None:
        with np.load(mpath, allow_pickle=False) as z:
            granules = json.loads(str(z["granules_json"].item())) if "granules_json" in z else []
            return (
                {
                    "year": int(z["year"].item()),
                    "month": int(z["month"].item()),
                    "product": str(z["product"].item()),
                    "version": str(z["version"].item()),
                    "concept_id": str(z["concept_id"].item()),
                    "retrieved_utc": str(z["retrieved_utc"].item()),
                    "bbox": tuple(float(x) for x in z["bbox"].tolist()),
                    "cell_km": float(z["cell_km"].item()),
                    "burn_doy": np.array(z["burn_doy"], dtype=np.int16, copy=True),
                    "uncertainty_days": np.array(z["uncertainty_days"], dtype=np.uint8, copy=True),
                    "qa": np.array(z["qa"], dtype=np.uint8, copy=True),
                    "first_day": np.array(z["first_day"], dtype=np.int16, copy=True),
                    "last_day": np.array(z["last_day"], dtype=np.int16, copy=True),
                    "granules": granules,
                },
                0,
                True,
            )

    cache_dir = out_dir / "cache"
    grans = search_month_tiles(prod, norm_box, year, month, cache_dir=cache_dir)
    if not grans:
        return None, 0, False

    max_w = max(1, min(int(workers), MAX_WORKERS, len(grans)))
    bytes_sent = 0
    downloaded: list[tuple[TileGranule, Path, dict[str, Any]]] = []
    if max_w == 1:
        for g in grans:
            tp, tman, nb = download_tile_cached(g, token=token, cache_dir=cache_dir)
            bytes_sent += nb
            downloaded.append((g, tp, tman))
    else:
        with ThreadPoolExecutor(max_workers=max_w) as pool:
            futs = {pool.submit(download_tile_cached, g, token, cache_dir): g for g in grans}
            for fut in as_completed(futs):
                g = futs[fut]
                tp, tman, nb = fut.result()
                bytes_sent += nb
                downloaded.append((g, tp, tman))
    downloaded.sort(key=lambda item: item[0].tile)

    grid_spec = BurnedGrid.from_bbox(norm_box)
    lon2d, lat2d = grid_spec.cell_lonlat()
    h_grid, v_grid, i_grid, j_grid = lonlat_to_sinusoidal_hvij(lon2d, lat2d)

    burn_doy = np.full(grid_spec.shape, NATIVE_UNMAPPED, dtype=np.int16)
    uncertainty = np.zeros(grid_spec.shape, dtype=np.uint8)
    qa_arr = np.zeros(grid_spec.shape, dtype=np.uint8)
    first_day = np.full(grid_spec.shape, NATIVE_UNMAPPED, dtype=np.int16)
    last_day = np.full(grid_spec.shape, NATIVE_UNMAPPED, dtype=np.int16)

    w, s, e, n = norm_box
    granule_records: list[dict[str, Any]] = []
    retrieved_times: list[str] = []

    for g, tp, tman in downloaded:
        layers = read_tile_layers(tp)
        bd_tile = layers["burn_doy"]
        unc_tile = layers["uncertainty_days"]
        qa_tile = layers["qa"]
        fd_tile = layers["first_day"]
        ld_tile = layers["last_day"]

        sel = (h_grid == g.tile_h) & (v_grid == g.tile_v)
        if np.any(sel):
            rr = i_grid[sel]
            cc = j_grid[sel]
            burn_doy[sel] = bd_tile[rr, cc]
            uncertainty[sel] = unc_tile[rr, cc]
            qa_arr[sel] = qa_tile[rr, cc]
            first_day[sel] = fd_tile[rr, cc]
            last_day[sel] = ld_tile[rr, cc]

            # Count native 500 m cells inside the bounding box on the row/col slice around sel
            r0, r1 = max(0, int(rr.min()) - 2), min(TILE_DIM - 1, int(rr.max()) + 2)
            c0, c1 = max(0, int(cc.min()) - 2), min(TILE_DIM - 1, int(cc.max()) + 2)
            ii_sub, jj_sub = np.meshgrid(np.arange(r0, r1 + 1), np.arange(c0, c1 + 1), indexing="ij")
            lon_c, lat_c = sinusoidal_hvij_to_lonlat(g.tile_h, g.tile_v, ii_sub, jj_sub)
            in_box = (lon_c >= w) & (lon_c <= e) & (lat_c >= s) & (lat_c <= n)
            sub_bd = bd_tile[r0 : r1 + 1, c0 : c1 + 1][in_box]
            native_in_box = int(in_box.sum())
            native_burned = int(np.count_nonzero(sub_bd >= 1))
        else:
            native_in_box = 0
            native_burned = 0

        ret_utc = str(tman.get("retrieved_utc") or _utc_now_iso())
        retrieved_times.append(ret_utc)
        granule_records.append({
            "filename": g.filename,
            "producer_granule_id": g.producer_granule_id,
            "tile": g.tile,
            "container": layers["container"],
            "time_start": g.time_start,
            "time_end": g.time_end,
            "bytes": int(tman.get("bytes") or tp.stat().st_size),
            "sha256": str(tman.get("sha256") or _sha256_file(tp)),
            "source_url": strip_url_secrets(g.https_url),
            "retrieved_utc": ret_utc,
            "native_cells_in_box": native_in_box,
            "native_burned_cells_in_box": native_burned,
            "tile_global_attrs": layers["global_attrs"],
        })

    retrieved_utc = max(retrieved_times) if retrieved_times else _utc_now_iso()
    granules_json = json.dumps(granule_records, sort_keys=True)

    mpath.parent.mkdir(parents=True, exist_ok=True)
    tmp = mpath.with_name(f".{mpath.name}.tmp.{os.getpid()}.{threading.get_ident()}.npz")
    np.savez_compressed(
        tmp,
        year=np.int32(year),
        month=np.int32(month),
        product=np.str_(prod),
        version=np.str_(pinfo["version"]),
        concept_id=np.str_(pinfo["concept_id"]),
        retrieved_utc=np.str_(retrieved_utc),
        bbox=np.asarray(norm_box, dtype=np.float64),
        cell_km=np.float64(grid_spec.cell_km),
        burn_doy=burn_doy,
        uncertainty_days=uncertainty,
        qa=qa_arr,
        first_day=first_day,
        last_day=last_day,
        granules_json=np.str_(granules_json),
    )
    os.replace(tmp, mpath)
    write_manifest(
        mpath,
        {
            "kind": "burned_month_box",
            "product": prod,
            "version": pinfo["version"],
            "concept_id": pinfo["concept_id"],
            "data_centre": pinfo["data_centre"],
            "year": year,
            "month": month,
            "bbox": list(norm_box),
            "grid_shape": list(grid_spec.shape),
            "cell_km": grid_spec.cell_km,
            "burned_month_cells": int(np.count_nonzero(burn_doy >= 1)),
            "unburned_land_cells": int(np.count_nonzero(burn_doy == 0)),
            "water_cells": int(np.count_nonzero(burn_doy == -2)),
            "unmapped_cells": int(np.count_nonzero(burn_doy == -1)),
            "retrieved_utc": retrieved_utc,
            "granules": granule_records,
        },
        token=token,
    )

    return (
        {
            "year": year,
            "month": month,
            "product": prod,
            "version": pinfo["version"],
            "concept_id": pinfo["concept_id"],
            "retrieved_utc": retrieved_utc,
            "bbox": norm_box,
            "cell_km": grid_spec.cell_km,
            "burn_doy": burn_doy,
            "uncertainty_days": uncertainty,
            "qa": qa_arr,
            "first_day": first_day,
            "last_day": last_day,
            "granules": granule_records,
        },
        bytes_sent,
        False,
    )


def save_window_npz(bw: BurnedWindow, out_dir: Path, token: str | None = None) -> Path:
    """Persist an explicit window .npz and .manifest.json under windows/<product>/<box_key>/."""
    wpath = window_path(bw.grid_spec.bbox, bw.start_utc, bw.end_utc, product=bw.product, root=out_dir)
    wpath.parent.mkdir(parents=True, exist_ok=True)
    source_json = json.dumps(bw.source, sort_keys=True)
    tmp = wpath.with_name(f".{wpath.name}.tmp.{os.getpid()}.{threading.get_ident()}.npz")
    np.savez_compressed(
        tmp,
        product=np.str_(bw.product),
        version=np.str_(bw.version),
        concept_id=np.str_(bw.concept_id),
        start_utc=np.str_(bw.start_utc),
        end_utc=np.str_(bw.end_utc),
        retrieved_utc=np.str_(bw.retrieved_utc),
        bbox=np.asarray(bw.grid_spec.bbox, dtype=np.float64),
        cell_km=np.float64(bw.grid_spec.cell_km),
        mask=bw.mask,
        burned=bw.burned,
        burn_year=bw.burn_year,
        burn_doy=bw.burn_doy,
        uncertainty_days=bw.uncertainty_days,
        qa=bw.qa,
        first_day=bw.first_day,
        last_day=bw.last_day,
        source_json=np.str_(source_json),
    )
    os.replace(tmp, wpath)
    write_manifest(
        wpath,
        {
            "kind": "burned_window_mask",
            "product": bw.product,
            "version": bw.version,
            "concept_id": bw.concept_id,
            "start_utc": bw.start_utc,
            "end_utc": bw.end_utc,
            "retrieved_utc": bw.retrieved_utc,
            "bbox": list(bw.grid_spec.bbox),
            "grid_shape": list(bw.shape),
            "cell_km": bw.grid_spec.cell_km,
            "burned_area_km2": round(bw.burned_area_km2, 6),
            "counts": bw.counts,
            "shares": bw.shares,
            "first_burn_date": bw.first_burn_date,
            "last_burn_date": bw.last_burn_date,
            "burn_day_counts": bw.burn_day_counts,
            "source": bw.source,
        },
        token=token,
    )
    return wpath


def fetch_window(
    box: tuple[float, float, float, float] | list[float],
    start: str | float | int | _dt.date | _dt.datetime,
    end: str | float | int | _dt.date | _dt.datetime,
    *,
    token: str,
    out_dir: Path | None = None,
    products: tuple[str, ...] = PRODUCTS,
    workers: int = DEFAULT_WORKERS,
) -> dict[str, Any]:
    """Fetch burned-area tiles and write monthly and window .npz files for (box, start, end)."""
    norm_box = normalize_box(box)
    refuse_closed_window(norm_box, start, end)
    start_s = parse_utc_seconds(start)
    end_s = parse_utc_seconds(end)
    if end_s <= start_s:
        raise ValueError("end must be after start")
    base = default_burned_dir() if out_dir is None else Path(out_dir)
    yms = overlapping_year_months(start_s, end_s)

    results_by_product: dict[str, Any] = {}
    total_bytes_sent = 0
    total_npz_bytes = 0

    for raw_prod in products:
        prod = canonical_product(raw_prod)
        month_records: list[dict[str, Any]] = []
        missing_months: list[str] = []
        prod_bytes_sent = 0
        cached_months = 0

        for yr, mo in yms:
            rec, nb, was_cached = extract_month_box(
                prod,
                norm_box,
                yr,
                mo,
                token=token,
                out_dir=base,
                workers=workers,
            )
            prod_bytes_sent += nb
            if was_cached:
                cached_months += 1
            if rec is None:
                missing_months.append(f"{yr:04d}-{mo:02d}")
            else:
                month_records.append(rec)

        total_bytes_sent += prod_bytes_sent
        if missing_months:
            results_by_product[prod] = {
                "status": "not_available_in_catalogue",
                "missing_months": missing_months,
                "bytes_transferred": prod_bytes_sent,
            }
            continue

        bw = compose_window_from_months(norm_box, start_s, end_s, month_records, product=prod)
        wpath = save_window_npz(bw, base, token=token)
        npz_size = wpath.stat().st_size
        total_npz_bytes += npz_size
        results_by_product[prod] = {
            "status": "ok",
            "window_npz": wpath.name,
            "window_npz_bytes": npz_size,
            "months": [f"{yr:04d}-{mo:02d}" for yr, mo in yms],
            "months_cached": cached_months,
            "bytes_transferred": prod_bytes_sent,
            "burned_in_window_cells": bw.counts["burned_in_window"],
            "burned_in_window_share": round(bw.shares["burned_in_window"], 6),
            "burned_area_km2": round(bw.burned_area_km2, 4),
            "first_burn_date": bw.first_burn_date,
            "last_burn_date": bw.last_burn_date,
            "granules": [g["filename"] for g in bw.source.get("granules", [])],
        }

    return {
        "bbox": list(norm_box),
        "start_utc": format_utc(start_s),
        "end_utc": format_utc(end_s),
        "bytes_transferred": total_bytes_sent,
        "window_npz_bytes": total_npz_bytes,
        "products": results_by_product,
    }


# ---------------------------------------------------------------------------
# Batch target discovery (/api/regions and SPLIT.md)
# ---------------------------------------------------------------------------


def parse_box_arg(text: str) -> tuple[float, float, float, float]:
    parts = [p.strip() for p in text.split(",") if p.strip()]
    if len(parts) != 4:
        raise ValueError(f"--box expects four comma-separated numbers W,S,E,N, got {text!r}")
    return normalize_box(tuple(float(p) for p in parts))  # type: ignore[arg-type]


def parse_products_arg(text: str) -> tuple[str, ...]:
    raw = text.strip().upper()
    if raw in ("BOTH", "ALL"):
        return PRODUCTS
    items = [canonical_product(p) for p in text.split(",") if p.strip()]
    return tuple(dict.fromkeys(items)) if items else (DEFAULT_PRODUCT,)


def discover_featured_targets(api_regions_url: str) -> list[dict[str, Any]]:
    """Read GET /api/regions and return open featured fire windows (never 2021 closed fires)."""
    req = urllib.request.Request(
        api_regions_url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    targets: list[dict[str, Any]] = []
    seen: set[tuple[tuple[float, float, float, float], str, str]] = set()

    def _add(label: str, box: tuple[float, float, float, float], start_s: str, end_s: str, priority: int) -> None:
        if closed_region_for(box, start_s, end_s) is not None:
            return
        t0 = format_utc(parse_utc_seconds(start_s))
        t1 = format_utc(parse_utc_seconds(end_s))
        if parse_utc_seconds(t1) <= parse_utc_seconds(t0):
            return
        key = (box, t0, t1)
        if key in seen:
            return
        seen.add(key)
        targets.append({"label": label, "box": box, "start": t0, "end": t1, "priority": priority})

    entries = payload.get("places") or payload.get("regions") or payload.get("presets") or []
    for reg in entries:
        rid = str(reg.get("id", ""))
        raw_box = reg.get("bbox") or reg.get("pack_bbox") or reg.get("box")
        if not raw_box or len(raw_box) != 4:
            continue
        box = normalize_box(raw_box)

        # Priority 0: opening fire window plumas_ca 2012-08-10..2012-08-13
        if rid == "plumas_ca":
            _add("plumas_ca:opening_3d", box, "2012-08-10", "2012-08-13", priority=0)

        # Explicit featured_fires on each place
        for ff in reg.get("featured_fires", []) or []:
            if ff.get("closed"):
                continue
            fid = str(ff.get("id") or ff.get("period") or rid)
            ds = ff.get("default_start") or ff.get("start")
            de = ff.get("default_end") or ff.get("end")
            run_starts = [r for r in (ff.get("run_starts") or []) if isinstance(r, dict) and not r.get("closed")]

            if ds and de:
                _add(f"{fid}:default", box, str(ds), str(de), priority=1)
            elif ds and run_starts:
                rs = next((r for r in run_starts if r.get("start") == ds), run_starts[0])
                if rs.get("first_overpass_utc") and rs.get("last_overpass_utc"):
                    _add(
                        f"{fid}:default_run",
                        box,
                        str(rs["first_overpass_utc"]),
                        str(rs["last_overpass_utc"]),
                        priority=1,
                    )
                    # Also add UTC date-aligned window [default_start, ceil_date(last_overpass_utc))
                    last_dt = _dt.datetime.fromtimestamp(
                        parse_utc_seconds(str(rs["last_overpass_utc"])), _dt.timezone.utc
                    )
                    end_date = (_dt.date(last_dt.year, last_dt.month, last_dt.day) + _dt.timedelta(days=1)).isoformat()
                    _add(f"{fid}:default_dates", box, str(ds), end_date, priority=1)

            if run_starts:
                all_first = min(str(r["first_overpass_utc"]) for r in run_starts if r.get("first_overpass_utc"))
                all_last = max(str(r["last_overpass_utc"]) for r in run_starts if r.get("last_overpass_utc"))
                if all_first and all_last:
                    last_dt = _dt.datetime.fromtimestamp(parse_utc_seconds(all_last), _dt.timezone.utc)
                    end_date = (_dt.date(last_dt.year, last_dt.month, last_dt.day) + _dt.timedelta(days=1)).isoformat()
                    first_dt = _dt.datetime.fromtimestamp(parse_utc_seconds(all_first), _dt.timezone.utc)
                    start_date = _dt.date(first_dt.year, first_dt.month, first_dt.day).isoformat()
                    _add(f"{fid}:all_runs", box, start_date, end_date, priority=2)

            s_full = ff.get("first_day") or ff.get("start")
            e_full = ff.get("last_day") or ff.get("end")
            if s_full and e_full:
                e_str = str(e_full)
                if len(e_str) == 10 and e_str[4] == "-":
                    e_dt = _dt.date.fromisoformat(e_str) + _dt.timedelta(days=1)
                    e_str = e_dt.isoformat()
                _add(f"{fid}:period", box, str(s_full), e_str, priority=2)

        # Open packs or periods fallback
        for pk in reg.get("packs", []) or reg.get("periods", []) or []:
            if not isinstance(pk, dict) or pk.get("closed"):
                continue
            ps = pk.get("default_start") or pk.get("busiest_start") or pk.get("start")
            pe = pk.get("default_end")
            if ps and not pe:
                ps_sec = parse_utc_seconds(str(ps))
                pe = format_utc(ps_sec + 7 * 86400.0)
            if ps and pe:
                _add(f"{rid}:{pk.get('period', 'pack')}", box, str(ps), str(pe), priority=2)

    targets.sort(key=lambda item: (item["priority"], item["label"]))
    return targets


def parse_split_markdown(split_text: str) -> list[dict[str, Any]]:
    """Parse SPLIT.md markdown tables, ordering fitting and validation sections ahead of other sections."""
    section = "other"
    section_rank = 2
    out: list[dict[str, Any]] = []
    for raw_line in split_text.splitlines():
        line = raw_line.strip()
        if line.startswith("#"):
            low = line.lower()
            if "fitting" in low or "fit " in low:
                section = "fitting"
                section_rank = 0
            elif "validation" in low or "val " in low:
                section = "validation"
                section_rank = 1
            else:
                section = low.lstrip("#").strip() or "other"
                section_rank = 2
            continue
        m = _SPLIT_ROW_RE.match(line)
        if not m:
            continue
        box = parse_box_arg(m.group("box"))
        start_str = m.group("start").strip()
        end_str = m.group("end").strip()
        if closed_region_for(box, start_str, end_str) is not None:
            continue
        out.append({
            "key": m.group("key").strip(),
            "section": section,
            "priority": section_rank,
            "continent": m.group("continent").strip(),
            "zone": m.group("zone").strip(),
            "box": box,
            "start": format_utc(parse_utc_seconds(start_str)),
            "end": format_utc(parse_utc_seconds(end_str)),
        })
    out.sort(key=lambda item: (item["priority"], item["key"]))
    return out


def store_status(out_dir: Path) -> dict[str, Any]:
    """Summarize files and byte counts in the burned-area output store."""
    summary: dict[str, Any] = {"out_dir": out_dir.name, "products": {}}
    total_bytes = 0
    if out_dir.is_dir():
        for p in out_dir.rglob("*"):
            if p.is_file():
                total_bytes += p.stat().st_size
    summary["total_bytes_on_disk"] = total_bytes
    for prod in PRODUCTS:
        w_root = out_dir / "windows" / prod
        m_root = out_dir / "months" / prod
        c_root = out_dir / "cache" / prod
        w_npz = list(w_root.rglob("*.npz")) if w_root.is_dir() else []
        m_npz = list(m_root.rglob("*.npz")) if m_root.is_dir() else []
        c_hdf = [p for p in (c_root.glob("*") if c_root.is_dir() else []) if p.is_file() and not p.name.endswith((".manifest.json", ".part"))]
        summary["products"][prod] = {
            "window_masks": len(w_npz),
            "window_npz_bytes": sum(p.stat().st_size for p in w_npz),
            "month_rasters": len(m_npz),
            "month_npz_bytes": sum(p.stat().st_size for p in m_npz),
            "cached_tiles": len(c_hdf),
            "cached_tile_bytes": sum(p.stat().st_size for p in c_hdf),
        }
    return summary


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="burned_fetch",
        description="Fetch NASA MCD64A1/VNP64A1 reflectance burned-area masks onto Isogon's 0.375 km grid.",
    )
    p.add_argument("--env-file", type=Path, default=None, help="Path to .env containing EARTHDATA_TOKEN.")
    p.add_argument("--out-dir", type=Path, default=None, help="Output burned-area directory.")
    p.add_argument("--no-nice", action="store_true", help="Do not adjust process niceness to 10.")

    sub = p.add_subparsers(dest="cmd", required=True)

    f_one = sub.add_parser("fetch", help="Fetch burned-area masks for one bounding box and UTC window.")
    f_one.add_argument("--box", required=True, help="Bounding box W,S,E,N (use --box=W,S,E,N for negative W).")
    f_one.add_argument("--start", required=True, help="Window start UTC (YYYY-MM-DD or ISO-8601Z).")
    f_one.add_argument("--end", required=True, help="Window end UTC (half-open, YYYY-MM-DD or ISO-8601Z).")
    f_one.add_argument("--product", default="both", help="MCD64A1, VNP64A1, or both (default: both).")
    f_one.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Max worker threads (1..4).")

    f_reg = sub.add_parser("fetch-regions", help="Fetch burned-area masks for all open featured fires in /api/regions.")
    f_reg.add_argument("--api-url", default="http://127.0.0.1:8788/api/regions", help="Regions API URL.")
    f_reg.add_argument("--product", default="both", help="MCD64A1, VNP64A1, or both (default: both).")
    f_reg.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Max worker threads (1..4).")

    f_spl = sub.add_parser("fetch-split", help="Fetch burned-area masks for fires in SPLIT.md (fitting & validation first).")
    f_spl.add_argument("--split-md", type=Path, required=True, help="Path to SPLIT.md.")
    f_spl.add_argument("--product", default="both", help="MCD64A1, VNP64A1, or both (default: both).")
    f_spl.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Max worker threads (1..4).")
    f_spl.add_argument("--only-fit-val", action="store_true", help="Fetch fitting and validation sections only.")

    f_plan = sub.add_parser("plan", help="List CMR monthly tiles overlapping a box and UTC window without downloading.")
    f_plan.add_argument("--box", required=True, help="Bounding box W,S,E,N (use --box=W,S,E,N for negative W).")
    f_plan.add_argument("--start", required=True, help="Window start UTC.")
    f_plan.add_argument("--end", required=True, help="Window end UTC.")
    f_plan.add_argument("--product", default="both", help="MCD64A1, VNP64A1, or both.")

    sub.add_parser("status", help="Summarize local burned-area store counts and bytes.")
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    if not args.no_nice:
        ensure_nice(TARGET_NICE)

    out_dir = default_burned_dir() if args.out_dir is None else Path(args.out_dir)

    if args.cmd == "status":
        print(json.dumps(store_status(out_dir), indent=2))
        return 0

    if args.cmd == "plan":
        box = parse_box_arg(args.box)
        refuse_closed_window(box, args.start, args.end)
        s0 = parse_utc_seconds(args.start)
        s1 = parse_utc_seconds(args.end)
        prods = parse_products_arg(args.product)
        plan_out: dict[str, Any] = {
            "bbox": list(box),
            "tiles_touched": tiles_for_box(box),
            "months": [f"{y:04d}-{m:02d}" for y, m in overlapping_year_months(s0, s1)],
            "products": {},
        }
        for prod in prods:
            items = []
            for yr, mo in overlapping_year_months(s0, s1):
                for g in search_month_tiles(prod, box, yr, mo, cache_dir=out_dir / "cache"):
                    items.append({
                        "year_month": f"{yr:04d}-{mo:02d}",
                        "tile": g.tile,
                        "filename": g.filename,
                        "granule_size_mb": round(g.granule_size_mb, 4),
                    })
            plan_out["products"][prod] = items
        print(json.dumps(plan_out, indent=2))
        return 0

    token = read_earthdata_token(args.env_file)
    workers = max(1, min(int(args.workers), MAX_WORKERS))
    prods = parse_products_arg(args.product)

    if args.cmd == "fetch":
        box = parse_box_arg(args.box)
        res = fetch_window(
            box,
            args.start,
            args.end,
            token=token,
            out_dir=out_dir,
            products=prods,
            workers=workers,
        )
        print(json.dumps(res, indent=2))
        return 0

    if args.cmd == "fetch-regions":
        targets = discover_featured_targets(args.api_url)
        print(f"EARTHDATA_TOKEN set; discovered {len(targets)} open featured windows from regions API", flush=True)
        summaries = []
        for idx, t in enumerate(targets, 1):
            res = fetch_window(
                t["box"],
                t["start"],
                t["end"],
                token=token,
                out_dir=out_dir,
                products=prods,
                workers=workers,
            )
            res["label"] = t["label"]
            summaries.append(res)
            mcd = res["products"].get("MCD64A1", {})
            print(
                f"[{idx}/{len(targets)}] {t['label']} {t['start']}..{t['end']} "
                f"MCD64A1={mcd.get('status')} burned={mcd.get('burned_in_window_cells')} "
                f"sent={res['bytes_transferred'] / 1e6:.2f} MB",
                flush=True,
            )
        print(json.dumps({"fetched_windows": len(summaries), "store": store_status(out_dir)}, indent=2))
        return 0

    if args.cmd == "fetch-split":
        if not args.split_md.is_file():
            raise FileNotFoundError(f"SPLIT.md not found at {args.split_md}")
        rows = parse_split_markdown(args.split_md.read_text(encoding="utf-8"))
        if args.only_fit_val:
            rows = [r for r in rows if r["priority"] in (0, 1)]
        print(f"EARTHDATA_TOKEN set; parsed {len(rows)} open windows from {args.split_md.name}", flush=True)
        total_sent = 0
        for idx, r in enumerate(rows, 1):
            res = fetch_window(
                r["box"],
                r["start"],
                r["end"],
                token=token,
                out_dir=out_dir,
                products=prods,
                workers=workers,
            )
            total_sent += int(res["bytes_transferred"])
            mcd = res["products"].get("MCD64A1", {})
            print(
                f"[{idx}/{len(rows)}] [{r['section']}] {r['key']} {r['start']}..{r['end']} "
                f"MCD64A1={mcd.get('status')} burned={mcd.get('burned_in_window_cells')} "
                f"sent={res['bytes_transferred'] / 1e6:.2f} MB",
                flush=True,
            )
        print(
            json.dumps(
                {
                    "fetched_split_windows": len(rows),
                    "bytes_transferred": total_sent,
                    "store": store_status(out_dir),
                },
                indent=2,
            )
        )
        return 0

    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ClosedBurnedWindow as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        raise SystemExit(2)
    except (TokenMissing, AuthApprovalRequired, PermissionError) as exc:
        print(f"AUTH ERROR: {exc}", file=sys.stderr)
        raise SystemExit(3)
