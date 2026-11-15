"""Fetch NASA Level-2 per-pass fire and cloud masks and write compact numpy grids per pass.

Products fetched (queried via keyless NASA CMR concept IDs, downloaded with EARTHDATA_TOKEN):
  Coarse (1 km MODIS Level-2 swath, HDF4):
    MODIS_TERRA   MOD14  v061 (C2271754179-LPCLOUD) + MOD03  v6.1 (C1379767668-LAADS)
    MODIS_AQUA    MYD14  v061 (C2278858993-LPCLOUD) + MYD03  v6.1 (C1379841358-LAADS)
  Sharp (375 m VIIRS I-band Level-2 swath, NetCDF-4/HDF5):
    VIIRS_SNPP    VNP14IMG v002 (C2734202914-LPCLOUD) + VNP03IMG v2   (C2105092163-LAADS)
    VIIRS_NOAA20  VJ114IMG v002 (C2734197957-LPCLOUD) + VJ103IMG v2.1 (C2105086226-LAADS)
                  (falls back to 750 m VJ114 v002 + VJ103MOD v2.1 only during the Mar-Jun 2018 VJ114IMG gap)
    VIIRS_NOAA21  VJ214IMG v002 (C2831626262-LPCLOUD) + VJ203IMG v2.1 (C3478476050-LAADS)

h5py and pyhdf are imported in this fetch tool only. What this tool writes to disk is plain numpy (.npz)
and JSON (.manifest.json) beside every cached file and every output pass mask, read by backend/firms/passmask.py
using numpy and the Python standard library alone.

Token handling:
  EARTHDATA_TOKEN is read from the environment or --env-file and placed in an HTTP Authorization header on
  *.nasa.gov requests only. It is stripped on redirects to external object storage hosts and redacted from
  every stored URL, manifest, log line, and error message.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
import datetime as _dt
import gzip
import hashlib
import http.client
import io
import json
import math
import os
from pathlib import Path
import re
import ssl
import sys
import threading
import time
from typing import Any, Callable, Iterable
import urllib.error
import urllib.parse
import urllib.request

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms.passmask import (  # noqa: E402
    CLASS_NAMES,
    PLATFORMS,
    PassMaskGrid,
    box_key,
    canonical_platform,
    default_passmask_dir,
    format_utc,
    normalize_box,
    parse_utc_seconds,
    passmask_path,
    platform_role,
    read_manifest,
    refuse_closed_window,
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
CMR_PAGE_SIZE: int = 2000
PASS_GAP_S: float = 120.0
EDGE_STEPS: int = 24
BOX_SAMPLES: int = 11
DEFAULT_WORKERS: int = 2
MAX_WORKERS: int = 3
PAUSE_S: float = 0.25
BACKOFF_BASE_S: float = 2.0
RETRIES: int = 5
RETRY_AFTER_MAX_S: float = 120.0
RANGE_BLOCK_BYTES: int = 65536

# Native 0..9 active fire classes -> canonical 5-class code:
#   0 = not_seen (0 missing, 1 bowtie/obsolete, 2 sun glint/unprocessed, 6 unknown/unclassified)
#   1 = clear_land (5)
#   2 = cloud (4)
#   3 = water (3)
#   4 = fire (7 low, 8 nominal, 9 high confidence)
RAW_TO_CLASS = np.array([0, 0, 0, 3, 2, 1, 0, 4, 4, 4], dtype=np.uint8)
# Priority when two adjacent scans of the same multi-granule pass cover a boundary cell:
# fire (4) > cloud (2) > clear_land (1) > water (3) > not_seen (0).
_MERGE_RANK = np.array([0, 2, 3, 1, 4], dtype=np.int8)


@dataclass(frozen=True)
class SensorSpec:
    platform: str
    fire_short_name: str
    fire_version: str
    fire_concept_id: str
    geo_short_name: str
    geo_version: str
    geo_concept_id: str
    file_format: str  # "hdf4" or "hdf5"
    scan_lines: int
    first_day: str


SENSOR_SPECS: dict[str, SensorSpec] = {
    "MODIS_TERRA": SensorSpec(
        platform="MODIS_TERRA",
        fire_short_name="MOD14",
        fire_version="061",
        fire_concept_id="C2271754179-LPCLOUD",
        geo_short_name="MOD03",
        geo_version="6.1",
        geo_concept_id="C1379767668-LAADS",
        file_format="hdf4",
        scan_lines=10,
        first_day="2000-02-24",
    ),
    "MODIS_AQUA": SensorSpec(
        platform="MODIS_AQUA",
        fire_short_name="MYD14",
        fire_version="061",
        fire_concept_id="C2278858993-LPCLOUD",
        geo_short_name="MYD03",
        geo_version="6.1",
        geo_concept_id="C1379841358-LAADS",
        file_format="hdf4",
        scan_lines=10,
        first_day="2002-07-04",
    ),
    "VIIRS_SNPP": SensorSpec(
        platform="VIIRS_SNPP",
        fire_short_name="VNP14IMG",
        fire_version="002",
        fire_concept_id="C2734202914-LPCLOUD",
        geo_short_name="VNP03IMG",
        geo_version="2",
        geo_concept_id="C2105092163-LAADS",
        file_format="hdf5",
        scan_lines=32,
        first_day="2012-01-17",
    ),
    "VIIRS_NOAA20": SensorSpec(
        platform="VIIRS_NOAA20",
        fire_short_name="VJ114IMG",
        fire_version="002",
        fire_concept_id="C2734197957-LPCLOUD",
        geo_short_name="VJ103IMG",
        geo_version="2.1",
        geo_concept_id="C2105086226-LAADS",
        file_format="hdf5",
        scan_lines=32,
        first_day="2018-01-01",
    ),
    "VIIRS_NOAA21": SensorSpec(
        platform="VIIRS_NOAA21",
        fire_short_name="VJ214IMG",
        fire_version="002",
        fire_concept_id="C2831626262-LPCLOUD",
        geo_short_name="VJ203IMG",
        geo_version="2.1",
        geo_concept_id="C3478476050-LAADS",
        file_format="hdf5",
        scan_lines=32,
        first_day="2023-02-10",
    ),
}

NOAA20_750M_FALLBACK = SensorSpec(
    platform="VIIRS_NOAA20",
    fire_short_name="VJ114",
    fire_version="002",
    fire_concept_id="C2545310869-LPCLOUD",
    geo_short_name="VJ103MOD",
    geo_version="2.1",
    geo_concept_id="C2105084593-LAADS",
    file_format="hdf5",
    scan_lines=16,
    first_day="2018-01-01",
)

_ACQ_TOKEN_RE = re.compile(r"\.(A\d{7}\.\d{4})\.")


class TokenMissing(RuntimeError):
    """EARTHDATA_TOKEN is not set in the environment or --env-file."""


class AuthApprovalRequired(RuntimeError):
    """Earthdata Login requires interactive EULA or application approval."""


# ---------------------------------------------------------------------------
# Token and secret redaction
# ---------------------------------------------------------------------------


def _read_earthdata_token(env_file: Path | None = None) -> str:
    val = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if val:
        return val
    candidates = [env_file] if env_file is not None else [_REPO_ROOT / ".env"]
    for cand in candidates:
        if cand is not None and cand.is_file():
            for line in cand.read_text(encoding="utf-8", errors="replace").splitlines():
                s = line.strip()
                if not s or s.startswith("#") or "=" not in s:
                    continue
                k, v = s.split("=", 1)
                if k.strip().removeprefix("export ").strip() == "EARTHDATA_TOKEN":
                    return v.strip().strip("'\"")
    return ""


def token_state(env_file: Path | None = None) -> str:
    """Return 'set' or 'empty'. Never returns the token value."""
    return "set" if _read_earthdata_token(env_file) else "empty"


def _require_token(env_file: Path | None = None) -> str:
    tok = _read_earthdata_token(env_file)
    if not tok:
        raise TokenMissing("EARTHDATA_TOKEN is not set (pass --env-file or set EARTHDATA_TOKEN)")
    return tok


def sanitize_url(url: str, token: str = "") -> str:
    """Strip query credentials from non-CMR URLs and redact any token substring."""
    out = url.replace(token, "<EARTHDATA_TOKEN>") if token else url
    parts = urllib.parse.urlsplit(out)
    host = (parts.hostname or "").lower()
    if parts.query and host != "cmr.earthdata.nasa.gov":
        out = urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    return out


def redact_token(text: str, token: str = "") -> str:
    """Redact EARTHDATA_TOKEN and presigned query parameters from arbitrary text."""
    out = re.sub(r"(https?://[^\s\"'<>?]+)\?[^\s\"'<>]+", r"\1?<REDACTED_QUERY>", text)
    if token:
        out = out.replace(token, "<EARTHDATA_TOKEN>")
    out = re.sub(r"(Bearer\s+)[A-Za-z0-9._~+/=-]+", r"\1<EARTHDATA_TOKEN>", out)
    return out


def _is_nasa_host(hostname: str | None) -> bool:
    if not hostname:
        return False
    h = hostname.lower()
    return h == "nasa.gov" or h.endswith(".nasa.gov")


# ---------------------------------------------------------------------------
# Atomic writes and manifests
# ---------------------------------------------------------------------------


def _now_utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write_atomic(dest: Path, payload: bytes) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(f".{dest.name}.{threading.get_ident()}.tmp")
    tmp.write_bytes(payload)
    tmp.replace(dest)


def _write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    payload = (json.dumps(manifest, indent=2, sort_keys=False) + "\n").encode("utf-8")
    _write_atomic(path.with_name(path.name + ".manifest.json"), payload)


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(1 << 20)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# HTTP helpers (Earthdata redirect handling, resumable download, Range file)
# ---------------------------------------------------------------------------


class _NoAuthOnExternalRedirect(urllib.request.HTTPRedirectHandler):
    """Drop Authorization header when redirected off *.nasa.gov to object storage."""

    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> Any:
        new_req = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new_req is None:
            return None
        new_host = urllib.parse.urlsplit(newurl).hostname
        if not _is_nasa_host(new_host):
            for key in list(new_req.headers.keys()):
                if key.lower() == "authorization":
                    del new_req.headers[key]
            for key in list(new_req.unredirected_hdrs.keys()):
                if key.lower() == "authorization":
                    del new_req.unredirected_hdrs[key]
        return new_req


def _build_opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(_NoAuthOnExternalRedirect())


def _retry_after(headers: Any) -> float | None:
    if not headers:
        return None
    try:
        val = float(headers.get("Retry-After", ""))
    except (TypeError, ValueError):
        return None
    return min(max(val, 0.0), RETRY_AFTER_MAX_S)


def _check_approval_needed(status: int, location: str, body_preview: str, token: str) -> None:
    loc_clean = sanitize_url(location, token)
    text_clean = redact_token(body_preview, token)
    low = (loc_clean + " " + text_clean).lower()
    if status in (401, 403) or "urs.earthdata.nasa.gov/oauth/authorize" in low or "eula" in low or "approve_app" in low:
        if "eula" in low or "approve" in low or "authorize" in low:
            raise AuthApprovalRequired(
                f"Earthdata account action required (HTTP {status}): open {loc_clean or 'https://urs.earthdata.nasa.gov/profile'} "
                f"and approve the application / EULA. Detail: {text_clean[:240]}"
            )


def cmr_get_json(url: str, headers: dict[str, str] | None = None) -> tuple[dict[str, str], bytes, int]:
    """Keyless GET against NASA CMR with gzip support and polite retry."""
    opener = _build_opener()
    req_headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"}
    if headers:
        req_headers.update(headers)
    last: Exception | None = None
    for attempt in range(RETRIES):
        wait = min(60.0, BACKOFF_BASE_S * (2**attempt))
        try:
            req = urllib.request.Request(url, headers=req_headers)
            with opener.open(req, timeout=90) as resp:
                resp_headers = {k.lower(): v for k, v in resp.headers.items()}
                raw = resp.read()
                sent = len(raw)
                if resp_headers.get("content-encoding", "").lower() == "gzip":
                    raw = gzip.decompress(raw)
                return resp_headers, raw, sent
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (408, 429, 500, 502, 503, 504):
                break
            ra = _retry_after(exc.headers)
            if ra is not None:
                wait = ra
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
        if attempt + 1 < RETRIES:
            time.sleep(wait)
    raise RuntimeError(f"CMR request failed for {sanitize_url(url)}: {last}")


def download_resumable(
    url: str,
    dest: Path,
    token: str,
    expected_bytes: int | None = None,
) -> tuple[int, str, int]:
    """Download url to dest atomically, resuming from dest.part when interrupted.

    Returns (total_file_bytes, sha256_hex, network_bytes_transferred).
    """
    existing_man = read_manifest(dest)
    if dest.is_file() and existing_man is not None:
        sz = dest.stat().st_size
        if sz == existing_man.get("bytes") and existing_man.get("sha256"):
            return sz, str(existing_man["sha256"]), 0

    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(f".{dest.name}.part")
    opener = _build_opener()
    transferred = 0
    last_err = ""

    for attempt in range(RETRIES):
        wait = min(60.0, BACKOFF_BASE_S * (2**attempt))
        offset = part.stat().st_size if part.is_file() else 0
        headers = {"User-Agent": USER_AGENT}
        if _is_nasa_host(urllib.parse.urlsplit(url).hostname):
            headers["Authorization"] = f"Bearer {token}"
        if offset > 0:
            headers["Range"] = f"bytes={offset}-"
        try:
            req = urllib.request.Request(url, headers=headers)
            with opener.open(req, timeout=120) as resp:
                status = getattr(resp, "status", 200)
                final_url = resp.geturl()
                if _is_nasa_host(urllib.parse.urlsplit(final_url).hostname) and "urs.earthdata.nasa.gov" in final_url:
                    preview = resp.read(512).decode("utf-8", errors="replace")
                    _check_approval_needed(status, final_url, preview, token)
                    raise RuntimeError(f"unexpected redirect to {sanitize_url(final_url, token)}")
                mode = "ab" if (offset > 0 and status == 206) else "wb"
                with part.open(mode) as fh:
                    while True:
                        chunk = resp.read(1 << 20)
                        if not chunk:
                            break
                        fh.write(chunk)
                        transferred += len(chunk)
            final_size = part.stat().st_size
            if expected_bytes is not None and final_size != expected_bytes:
                part.unlink(missing_ok=True)
                raise RuntimeError(f"incomplete file: got {final_size} bytes, expected {expected_bytes}")
            sha = _sha256_file(part)
            part.replace(dest)
            return final_size, sha, transferred
        except AuthApprovalRequired:
            raise
        except urllib.error.HTTPError as exc:
            body_preview = ""
            try:
                body_preview = exc.read(512).decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                pass
            _check_approval_needed(exc.code, exc.headers.get("Location", "") if exc.headers else "", body_preview, token)
            last_err = redact_token(f"HTTP {exc.code}: {body_preview[:160]}", token)
            if exc.code == 416:
                part.unlink(missing_ok=True)
                continue
            if exc.code not in (408, 429, 500, 502, 503, 504):
                break
            ra = _retry_after(exc.headers)
            if ra is not None:
                wait = ra
        except Exception as exc:  # noqa: BLE001
            last_err = redact_token(f"{type(exc).__name__}: {exc}", token)
        if attempt + 1 < RETRIES:
            time.sleep(wait)

    raise RuntimeError(f"download failed for {sanitize_url(url, token)}: {last_err}")


class KeepAliveRangeFile(io.RawIOBase):
    """Read-only HTTP Range file wrapper over a single keep-alive TLS socket for HDF5 chunk subsetting."""

    def __init__(self, nasa_url: str, token: str, block_size: int = RANGE_BLOCK_BYTES) -> None:
        super().__init__()
        self.nasa_url = nasa_url
        self._token = token
        self.block_size = block_size
        self.pos = 0
        self.total_bytes = 0
        self.n_requests = 0
        self._blocks: dict[int, bytes] = {}
        self._ctx = ssl.create_default_context()
        self._conn: http.client.HTTPSConnection | None = None
        self._host = ""
        self._path_q = ""
        self._send_auth = False
        self._resolve_target()
        data0, total = self._range_get(0, self.block_size - 1)
        self.size = total
        self._blocks[0] = data0

    def _close_conn(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:  # noqa: BLE001
                pass
            self._conn = None

    def _resolve_target(self) -> None:
        """Follow NASA Earthdata 303 redirect once to obtain the direct object-storage target."""
        self._close_conn()
        cur = self.nasa_url
        for _hop in range(6):
            p = urllib.parse.urlsplit(cur)
            host = p.netloc
            pq = p.path + (f"?{p.query}" if p.query else "")
            headers = {"User-Agent": USER_AGENT, "Range": "bytes=0-0"}
            if _is_nasa_host(p.hostname):
                headers["Authorization"] = f"Bearer {self._token}"
            conn = http.client.HTTPSConnection(host, timeout=60, context=self._ctx)
            conn.request("GET", pq, headers=headers)
            resp = conn.getresponse()
            status = resp.status
            loc = resp.getheader("Location", "")
            body = resp.read(512)
            if status in (301, 302, 303, 307, 308) and loc:
                conn.close()
                cur = urllib.parse.urljoin(cur, loc)
                continue
            if status in (200, 206):
                self._conn = conn
                self._host = host
                self._path_q = pq
                self._send_auth = _is_nasa_host(p.hostname)
                return
            conn.close()
            preview = body.decode("utf-8", errors="replace")
            _check_approval_needed(status, loc, preview, self._token)
            raise RuntimeError(
                f"Range resolve failed ({status}) on {sanitize_url(self.nasa_url, self._token)}: "
                f"{redact_token(preview[:180], self._token)}"
            )
        raise RuntimeError(f"too many redirects resolving {sanitize_url(self.nasa_url, self._token)}")

    def _open_conn(self) -> http.client.HTTPSConnection:
        if self._conn is None:
            self._conn = http.client.HTTPSConnection(self._host, timeout=60, context=self._ctx)
        return self._conn

    def _range_get(self, lo: int, hi: int) -> tuple[bytes, int]:
        last_err = ""
        for attempt in range(RETRIES):
            wait = min(30.0, BACKOFF_BASE_S * (2**attempt))
            headers = {
                "User-Agent": USER_AGENT,
                "Range": f"bytes={lo}-{hi}",
                "Connection": "keep-alive",
            }
            if self._send_auth:
                headers["Authorization"] = f"Bearer {self._token}"
            try:
                conn = self._open_conn()
                conn.request("GET", self._path_q, headers=headers)
                resp = conn.getresponse()
                status = resp.status
                cr = resp.getheader("Content-Range", "")
                cl = resp.getheader("Content-Length", "")
                data = resp.read()
                if status == 206:
                    self.total_bytes += len(data)
                    self.n_requests += 1
                    total = int(cr.split("/")[-1]) if "/" in cr else (hi + 1)
                    return data, total
                if status == 200:
                    self.total_bytes += len(data)
                    self.n_requests += 1
                    total = int(cl) if cl else len(data)
                    return data[lo : hi + 1], total
                self._close_conn()
                if status in (401, 403):
                    self._resolve_target()
                    continue
                last_err = f"HTTP {status}"
                if status not in (408, 429, 500, 502, 503, 504):
                    break
            except (http.client.HTTPException, OSError, ssl.SSLError, TimeoutError) as exc:
                self._close_conn()
                last_err = redact_token(f"{type(exc).__name__}: {exc}", self._token)
            if attempt + 1 < RETRIES:
                time.sleep(wait)
        raise RuntimeError(f"Range GET {lo}-{hi} failed for {sanitize_url(self.nasa_url, self._token)}: {last_err}")

    def prefetch_dataset_chunks(self, datasets: Iterable[Any], scan_lo: int, scan_hi: int, scan_lines: int) -> None:
        """Coalesce and prefetch exact HDF5 chunk byte blocks for scan rows [scan_lo, scan_hi]."""
        needed: set[int] = set()
        for ds in datasets:
            for s in range(scan_lo, scan_hi + 1):
                try:
                    inf = ds.id.get_chunk_info_by_coord((s * scan_lines, 0))
                except Exception:  # noqa: BLE001
                    continue
                if inf.size == 0 or inf.byte_offset is None:
                    continue
                b0 = int(inf.byte_offset) // self.block_size
                b1 = (int(inf.byte_offset) + int(inf.size) - 1) // self.block_size
                for b in range(b0, b1 + 1):
                    if b not in self._blocks:
                        needed.add(b)
        if not needed:
            return
        runs: list[list[int]] = []
        for b in sorted(needed):
            if runs and b <= runs[-1][-1] + 2:
                for k in range(runs[-1][-1] + 1, b + 1):
                    runs[-1].append(k)
            else:
                runs.append([b])
        for run in runs:
            lo_b = run[0] * self.block_size
            hi_b = min(self.size - 1, (run[-1] + 1) * self.block_size - 1)
            raw, _ = self._range_get(lo_b, hi_b)
            for idx, b in enumerate(run):
                if b not in self._blocks:
                    start = idx * self.block_size
                    self._blocks[b] = raw[start : start + self.block_size]

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        elif whence == io.SEEK_END:
            self.pos = self.size + offset
        return self.pos

    def _get_block(self, idx: int) -> bytes:
        if idx not in self._blocks:
            lo = idx * self.block_size
            hi = min(self.size - 1, lo + self.block_size - 1)
            data, _ = self._range_get(lo, hi)
            self._blocks[idx] = data
        return self._blocks[idx]

    def readinto(self, b: Any) -> int:
        if self.pos >= self.size:
            return 0
        n = min(len(b), self.size - self.pos)
        out = memoryview(b)[:n]
        written = 0
        while written < n:
            idx = self.pos // self.block_size
            off = self.pos % self.block_size
            blk = self._get_block(idx)
            avail = len(blk) - off
            if avail <= 0:
                break
            take = min(n - written, avail)
            out[written : written + take] = blk[off : off + take]
            self.pos += take
            written += take
        return written

    def close(self) -> None:
        self._close_conn()
        super().close()


# ---------------------------------------------------------------------------
# CMR search, swath polygon intersection, and granule pairing
# ---------------------------------------------------------------------------


def _to_xyz(lon: float, lat: float) -> tuple[float, float, float]:
    la, lo = math.radians(lat), math.radians(lon)
    return math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)


def _to_lonlat(x: float, y: float, z: float) -> tuple[float, float]:
    return math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.hypot(x, y)))


def _ring(text: str) -> list[list[float]]:
    v = [float(x) for x in text.split()]
    return [[v[i + 1], v[i]] for i in range(0, len(v) - 1, 2)]


def _densify(ring: list[list[float]], steps: int = EDGE_STEPS) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for (lo0, la0), (lo1, la1) in zip(ring[:-1], ring[1:]):
        a, b = _to_xyz(lo0, la0), _to_xyz(lo1, la1)
        dot = max(-1.0, min(1.0, sum(p * q for p, q in zip(a, b))))
        om = math.acos(dot)
        for k in range(steps):
            t = k / steps
            if om < 1e-12:
                out.append((lo0, la0))
                continue
            sa, sb = math.sin((1.0 - t) * om) / math.sin(om), math.sin(t * om) / math.sin(om)
            out.append(_to_lonlat(*(sa * p + sb * q for p, q in zip(a, b))))
    out.append(out[0])
    fixed = [out[0]]
    for lo, la in out[1:]:
        prev = fixed[-1][0]
        while lo - prev > 180.0:
            lo -= 360.0
        while lo - prev < -180.0:
            lo += 360.0
        fixed.append((lo, la))
    return fixed


def _point_in_ring(lon: float, lat: float, ring: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _share_inside(box: tuple[float, float, float, float], rings: list[list[tuple[float, float]]]) -> float:
    w, s, e, n = box
    pts = [
        (w + (e - w) * i / (BOX_SAMPLES - 1), s + (n - s) * j / (BOX_SAMPLES - 1))
        for i in range(BOX_SAMPLES)
        for j in range(BOX_SAMPLES)
    ]
    hit = sum(1 for lo, la in pts if any(_point_in_ring(lo, la, r) for r in rings))
    return hit / len(pts)


def _extract_https_data_url(entry: dict[str, Any]) -> str | None:
    for link in entry.get("links") or []:
        href = str(link.get("href") or "")
        rel = str(link.get("rel") or "")
        if not href.startswith("https://"):
            continue
        if href.endswith((".cmr.xml", ".dmrpp", ".jpg", ".png", ".html")):
            continue
        if "/data#" in rel and href.endswith((".hdf", ".nc", ".h5")):
            return href
    for link in entry.get("links") or []:
        href = str(link.get("href") or "")
        if href.startswith("https://") and href.endswith((".hdf", ".nc", ".h5")):
            return href
    return None


def _acq_token(name: str) -> str | None:
    m = _ACQ_TOKEN_RE.search(name)
    return m.group(1) if m else None


def _parse_cmr_entry(entry: dict[str, Any]) -> dict[str, Any]:
    rings = [_ring(r) for poly in (entry.get("polygons") or []) for r in poly[:1]]
    if not rings and entry.get("boxes"):
        s, w, n, ea = (float(x) for x in entry["boxes"][0].split())
        rings = [[[w, s], [ea, s], [ea, n], [w, n], [w, s]]]
    title = str(entry.get("title") or entry.get("producer_granule_id") or entry["id"])
    url = _extract_https_data_url(entry)
    fname = urllib.parse.urlsplit(url).path.rsplit("/", 1)[-1] if url else title
    size_mb = entry.get("granule_size")
    return {
        "id": str(entry["id"]),
        "title": title,
        "filename": fname,
        "acq_token": _acq_token(fname) or _acq_token(title),
        "time_start": str(entry["time_start"])[:19] + "Z",
        "time_end": str(entry["time_end"])[:19] + "Z",
        "day_night": entry.get("day_night_flag"),
        "cloud_cover_pct": float(entry["cloud_cover"]) if entry.get("cloud_cover") not in (None, "") else None,
        "granule_size_mb": float(size_mb) if size_mb not in (None, "") else None,
        "url": url,
        "rings": rings,
    }


def query_cmr_granules(
    concept_id: str,
    box: tuple[float, float, float, float] | None,
    start_s: float,
    end_s: float,
    cache_dir: Path,
    readable_granule_name: str | None = None,
) -> list[dict[str, Any]]:
    """Query CMR granules.json (cached with manifest) and return parsed granule entries."""
    t0 = format_utc(start_s)
    t1 = format_utc(end_s)
    params: dict[str, str] = {
        "collection_concept_id": concept_id,
        "temporal": f"{t0},{t1}",
        "page_size": str(CMR_PAGE_SIZE),
        "sort_key": "start_date",
    }
    if box is not None:
        w, s, e, n = box
        params["bounding_box"] = f"{w},{s},{e},{n}"
    if readable_granule_name:
        params["readable_granule_name"] = readable_granule_name
        params["options[readable_granule_name][pattern]"] = "true"
    q_str = urllib.parse.urlencode(params)
    url = f"{CMR_BASE}/granules.json?{q_str}"
    q_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]
    cmr_dir = cache_dir / "cmr" / concept_id
    p1 = cmr_dir / f"{q_hash}_p1.json.gz"
    if p1.is_file() and read_manifest(p1) is not None:
        entries_out: list[dict[str, Any]] = []
        page = 1
        while True:
            pf = cmr_dir / f"{q_hash}_p{page}.json.gz"
            if not pf.is_file():
                break
            body = gzip.decompress(pf.read_bytes())
            feed = json.loads(body.decode("utf-8"))["feed"]["entry"]
            entries_out.extend(_parse_cmr_entry(e) for e in feed)
            page += 1
        return entries_out

    entries_out = []
    search_after: str | None = None
    page = 0
    seen = 0
    while True:
        hdrs = {"CMR-Search-After": search_after} if search_after else None
        resp_h, body, sent = cmr_get_json(url, hdrs)
        feed = json.loads(body.decode("utf-8"))["feed"]["entry"]
        hits = int(resp_h.get("cmr-hits", len(feed)))
        page += 1
        pf = cmr_dir / f"{q_hash}_p{page}.json.gz"
        gz = gzip.compress(body, mtime=0)
        _write_atomic(pf, gz)
        _write_manifest(
            pf,
            {
                "source_url": url,
                "query": {
                    "kind": "cmr_granules",
                    "collection_concept_id": concept_id,
                    "box_wsen": list(box) if box is not None else None,
                    "temporal": [t0, t1],
                    "readable_granule_name": readable_granule_name,
                    "page": page,
                },
                "retrieved_utc": _now_utc(),
                "hits": hits,
                "entries": len(feed),
                "bytes": len(gz),
                "json_bytes": len(body),
                "bytes_transferred": sent,
                "sha256": hashlib.sha256(gz).hexdigest(),
            },
        )
        entries_out.extend(_parse_cmr_entry(e) for e in feed)
        seen += len(feed)
        search_after = resp_h.get("cmr-search-after")
        if seen >= hits or not feed or not search_after:
            break
        time.sleep(PAUSE_S)
    return entries_out


def _group_into_passes(granules: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    ordered = sorted(granules, key=lambda g: (g["time_start"], g["id"]))
    groups: list[list[dict[str, Any]]] = []
    for g in ordered:
        if groups:
            gap = parse_utc_seconds(g["time_start"]) - parse_utc_seconds(groups[-1][-1]["time_end"])
            if gap <= PASS_GAP_S:
                groups[-1].append(g)
                continue
        groups.append([g])
    return groups


def _pair_geo_granule(
    fire_gran: dict[str, Any],
    geo_candidates: list[dict[str, Any]],
    spec: SensorSpec,
    cache_dir: Path,
) -> dict[str, Any]:
    tok = fire_gran.get("acq_token")
    if tok:
        for g in geo_candidates:
            if g.get("acq_token") == tok and g.get("url"):
                return g
    f_ts = parse_utc_seconds(fire_gran["time_start"])
    f_te = parse_utc_seconds(fire_gran["time_end"])
    for g in geo_candidates:
        if (
            g.get("url")
            and abs(parse_utc_seconds(g["time_start"]) - f_ts) <= 10.0
            and abs(parse_utc_seconds(g["time_end"]) - f_te) <= 10.0
        ):
            return g
    # Fallback: query CMR without bounding_box in case L1 vs L2 edge polygon differed slightly.
    pattern = f"*{tok}*" if tok else None
    extra = query_cmr_granules(
        spec.geo_concept_id,
        None,
        f_ts - 60.0,
        f_te + 60.0,
        cache_dir=cache_dir,
        readable_granule_name=pattern,
    )
    for g in extra:
        if g.get("url") and (
            (tok and g.get("acq_token") == tok) or abs(parse_utc_seconds(g["time_start"]) - f_ts) <= 10.0
        ):
            return g
    raise RuntimeError(f"no companion {spec.geo_short_name} geolocation granule found in CMR for {fire_gran['title']}")


# ---------------------------------------------------------------------------
# Reading fire masks and geolocation slices
# ---------------------------------------------------------------------------


def _ensure_fire_granule(
    fire_gran: dict[str, Any],
    spec: SensorSpec,
    cache_dir: Path,
    token: str,
) -> tuple[Path, int]:
    url = fire_gran.get("url")
    if not url:
        raise RuntimeError(f"no HTTPS download URL on CMR granule {fire_gran['title']}")
    year = fire_gran["time_start"][:4]
    dest = cache_dir / "fire" / spec.fire_short_name / year / fire_gran["filename"]
    size_bytes, sha, sent = download_resumable(url, dest, token=token)
    if read_manifest(dest) is None:
        _write_manifest(
            dest,
            {
                "source_url": sanitize_url(url, token),
                "query": {
                    "kind": "fire_granule",
                    "platform": spec.platform,
                    "short_name": spec.fire_short_name,
                    "version": spec.fire_version,
                    "concept_id": spec.fire_concept_id,
                    "cmr_granule_id": fire_gran["id"],
                    "time_start": fire_gran["time_start"],
                    "time_end": fire_gran["time_end"],
                },
                "retrieved_utc": _now_utc(),
                "bytes": size_bytes,
                "bytes_transferred": sent,
                "sha256": sha,
            },
        )
    return dest, sent


def _read_fire_mask(path: Path, spec: SensorSpec) -> np.ndarray:
    if spec.file_format == "hdf4":
        if not HAS_PYHDF:
            raise RuntimeError("pyhdf is not installed; cannot read HDF4 MODIS fire granule")
        sd = _SD(str(path), _SDC.READ)
        try:
            sds = sd.select("fire mask")
            arr = np.asarray(sds.get(), dtype=np.uint8)
            sds.endaccess()
            return arr
        finally:
            sd.end()
    if _h5py is None:
        raise RuntimeError("h5py is not installed; cannot read NetCDF4/HDF5 VIIRS fire granule")
    with _h5py.File(path, "r") as f:
        return np.asarray(f["fire mask"][:], dtype=np.uint8)


def _crop_swath_window(
    lat: np.ndarray,
    lon: np.ndarray,
    row_offset: int,
    full_shape: tuple[int, int],
    box: tuple[float, float, float, float],
    scan_lines: int,
) -> tuple[int, int, np.ndarray, np.ndarray]:
    """Crop (lat, lon) around box while keeping row_start aligned to scan_lines."""
    w, s, e, n = box
    mid_lat = 0.5 * (s + n)
    pad_lat = 0.28
    pad_lon = 0.28 / max(0.2, math.cos(math.radians(mid_lat)))
    valid = np.isfinite(lat) & np.isfinite(lon) & (lat >= -90.0) & (lat <= 90.0) & (lon >= -180.0) & (lon <= 180.0)
    near = (
        valid
        & (lon >= w - pad_lon)
        & (lon <= e + pad_lon)
        & (lat >= s - pad_lat)
        & (lat <= n + pad_lat)
    )
    if not np.any(near):
        return row_offset, 0, np.empty((0, 0), dtype=np.float32), np.empty((0, 0), dtype=np.float32)
    rr, cc = np.where(near)
    abs_r0 = ((row_offset + int(rr.min())) // scan_lines) * scan_lines
    abs_r1 = min(full_shape[0], (((row_offset + int(rr.max())) // scan_lines) + 1) * scan_lines)
    loc_r0 = max(0, abs_r0 - row_offset)
    loc_r1 = min(lat.shape[0], abs_r1 - row_offset)
    c0 = max(0, int(cc.min()) - 3)
    c1 = min(lat.shape[1], int(cc.max()) + 4)
    return (
        row_offset + loc_r0,
        c0,
        np.ascontiguousarray(lat[loc_r0:loc_r1, c0:c1], dtype=np.float32),
        np.ascontiguousarray(lon[loc_r0:loc_r1, c0:c1], dtype=np.float32),
    )


def _valid_scan_index(lat_ds: Any, lon_ds: Any, target_scan: int, n_scans: int, scan_lines: int) -> tuple[int, np.ndarray, np.ndarray] | None:
    """Read one scan row near target_scan that contains valid geolocation."""
    for delta in range(0, min(8, n_scans)):
        for cand in (target_scan + delta, target_scan - delta):
            if 0 <= cand < n_scans:
                r = cand * scan_lines + (scan_lines // 2)
                la = np.asarray(lat_ds[r, :], dtype=np.float64)
                lo = np.asarray(lon_ds[r, :], dtype=np.float64)
                ok = np.isfinite(la) & np.isfinite(lo) & (la >= -90.0) & (la <= 90.0) & (lo >= -180.0) & (lo <= 180.0)
                if int(ok.sum()) >= 64:
                    return cand, la, lo
    return None


def _locate_viirs_scans(
    rf: KeepAliveRangeFile,
    lat_ds: Any,
    lon_ds: Any,
    box: tuple[float, float, float, float],
    scan_lines: int,
) -> tuple[int, int] | None:
    """Locate [scan_lo, scan_hi] overlapping box using 3-scan 2D quadratic orbit interpolation."""
    n_rows, n_cols = lat_ds.shape
    n_scans = n_rows // scan_lines
    if n_scans <= 12:
        return (0, max(0, n_scans - 1))

    # Prefetch first, middle, and last scan chunks cleanly.
    for probe_s in {0, n_scans // 2, n_scans - 1}:
        rf.prefetch_dataset_chunks((lat_ds, lon_ds), probe_s, probe_s, scan_lines)

    p0 = _valid_scan_index(lat_ds, lon_ds, 0, n_scans, scan_lines)
    pm = _valid_scan_index(lat_ds, lon_ds, n_scans // 2, n_scans, scan_lines)
    p2 = _valid_scan_index(lat_ds, lon_ds, n_scans - 1, n_scans, scan_lines)
    if p0 is None or pm is None or p2 is None or len({p0[0], pm[0], p2[0]}) < 3:
        return (0, n_scans - 1)

    s0, lat0, lon0 = p0
    sm, latm, lonm = pm
    s2, lat2, lon2 = p2

    step = max(1, n_cols // 800)
    cols = np.arange(0, n_cols, step)
    la0, lam, la2 = lat0[cols], latm[cols], lat2[cols]
    lo0, lom, lo2 = lon0[cols], lonm[cols], lon2[cols]
    ok = (
        np.isfinite(la0) & np.isfinite(lam) & np.isfinite(la2)
        & (la0 >= -90.0) & (lam >= -90.0) & (la2 >= -90.0)
        & (lo0 >= -180.0) & (lom >= -180.0) & (lo2 >= -180.0)
    )
    if not np.any(ok):
        return (0, n_scans - 1)

    la0, lam, la2 = la0[ok], lam[ok], la2[ok]
    w, s, e, n = box
    ref_lon = 0.5 * (w + e)
    # Unwrap longitudes relative to ref_lon so antimeridian crossings interpolate smoothly.
    lo0 = ((lo0[ok] - ref_lon + 180.0) % 360.0) - 180.0 + ref_lon
    lom = ((lom[ok] - ref_lon + 180.0) % 360.0) - 180.0 + ref_lon
    lo2 = ((lo2[ok] - ref_lon + 180.0) % 360.0) - 180.0 + ref_lon

    ss = np.arange(n_scans, dtype=np.float64)[:, None]
    l0 = ((ss - sm) * (ss - s2)) / ((s0 - sm) * (s0 - s2))
    lm = ((ss - s0) * (ss - s2)) / ((sm - s0) * (sm - s2))
    l2 = ((ss - s0) * (ss - sm)) / ((s2 - s0) * (s2 - sm))

    est_lat = l0 * la0[None, :] + lm * lam[None, :] + l2 * la2[None, :]
    est_lon = l0 * lo0[None, :] + lm * lom[None, :] + l2 * lo2[None, :]

    mid_lat = 0.5 * (s + n)
    pad_lat = 0.45
    pad_lon = 0.45 / max(0.2, math.cos(math.radians(mid_lat)))
    hit_scans = np.any(
        (est_lat >= s - pad_lat)
        & (est_lat <= n + pad_lat)
        & (est_lon >= w - pad_lon)
        & (est_lon <= e + pad_lon),
        axis=1,
    )
    if not np.any(hit_scans):
        return None
    idx = np.where(hit_scans)[0]
    return (max(0, int(idx.min()) - 2), min(n_scans - 1, int(idx.max()) + 2))


def _ensure_geo_slice(
    geo_gran: dict[str, Any],
    spec: SensorSpec,
    box: tuple[float, float, float, float],
    cache_dir: Path,
    token: str,
    keep_raw_geo: bool = False,
) -> tuple[int, int, tuple[int, int], np.ndarray, np.ndarray, int]:
    """Return (row_offset, col_offset, full_shape, lat_sub, lon_sub, bytes_transferred) cached per box."""
    url = geo_gran.get("url")
    if not url:
        raise RuntimeError(f"no HTTPS download URL on CMR geolocation granule {geo_gran['title']}")
    slice_path = cache_dir / "geo_sub" / box_key(box) / spec.geo_short_name / f"{geo_gran['filename']}.npz"
    if slice_path.is_file() and read_manifest(slice_path) is not None:
        with np.load(slice_path, allow_pickle=False) as d:
            r0 = int(d["row_offset"])
            c0 = int(d["col_offset"])
            full_shape = (int(d["full_shape"][0]), int(d["full_shape"][1]))
            return r0, c0, full_shape, d["lat"], d["lon"], 0

    if spec.file_format == "hdf4":
        if not HAS_PYHDF:
            raise RuntimeError("pyhdf is not installed; cannot read HDF4 MODIS geolocation granule")
        raw_dir = cache_dir / "geo_raw" / spec.geo_short_name / geo_gran["time_start"][:4]
        raw_path = raw_dir / geo_gran["filename"]
        raw_bytes, raw_sha, sent = download_resumable(url, raw_path, token=token)
        if keep_raw_geo and read_manifest(raw_path) is None:
            _write_manifest(
                raw_path,
                {
                    "source_url": sanitize_url(url, token),
                    "query": {
                        "kind": "geo_granule_raw",
                        "platform": spec.platform,
                        "short_name": spec.geo_short_name,
                        "version": spec.geo_version,
                        "concept_id": spec.geo_concept_id,
                        "cmr_granule_id": geo_gran["id"],
                    },
                    "retrieved_utc": _now_utc(),
                    "bytes": raw_bytes,
                    "bytes_transferred": sent,
                    "sha256": raw_sha,
                },
            )
        sd = _SD(str(raw_path), _SDC.READ)
        try:
            lat_sds = sd.select("Latitude")
            lon_sds = sd.select("Longitude")
            lat_full = np.asarray(lat_sds.get(), dtype=np.float32)
            lon_full = np.asarray(lon_sds.get(), dtype=np.float32)
            lat_sds.endaccess()
            lon_sds.endaccess()
        finally:
            sd.end()
        full_shape = (int(lat_full.shape[0]), int(lat_full.shape[1]))
        r0, c0, lat_sub, lon_sub = _crop_swath_window(lat_full, lon_full, 0, full_shape, box, spec.scan_lines)
        if not keep_raw_geo:
            raw_path.unlink(missing_ok=True)
        extra_meta: dict[str, Any] = {
            "access_mode": "full_hdf4_download_then_box_crop",
            "remote_granule_bytes": raw_bytes,
            "remote_granule_sha256": raw_sha,
        }
    else:
        if _h5py is None:
            raise RuntimeError("h5py is not installed; cannot read NetCDF4/HDF5 VIIRS geolocation granule")
        rf = KeepAliveRangeFile(url, token=token)
        try:
            with _h5py.File(rf, "r", rdcc_nbytes=0) as f:
                lat_ds = f["geolocation_data/latitude"]
                lon_ds = f["geolocation_data/longitude"]
                full_shape = (int(lat_ds.shape[0]), int(lat_ds.shape[1]))
                span = _locate_viirs_scans(rf, lat_ds, lon_ds, box, spec.scan_lines)
                if span is None:
                    r0, c0 = 0, 0
                    lat_sub = np.empty((0, 0), dtype=np.float32)
                    lon_sub = np.empty((0, 0), dtype=np.float32)
                else:
                    s_lo, s_hi = span
                    rf.prefetch_dataset_chunks((lat_ds, lon_ds), s_lo, s_hi, spec.scan_lines)
                    row_lo = s_lo * spec.scan_lines
                    row_hi = min(full_shape[0], (s_hi + 1) * spec.scan_lines)
                    lat_win = np.asarray(lat_ds[row_lo:row_hi, :], dtype=np.float32)
                    lon_win = np.asarray(lon_ds[row_lo:row_hi, :], dtype=np.float32)
                    r0, c0, lat_sub, lon_sub = _crop_swath_window(
                        lat_win, lon_win, row_lo, full_shape, box, spec.scan_lines
                    )
            sent = rf.total_bytes
            remote_size = rf.size
            n_reqs = rf.n_requests
        finally:
            rf.close()
        extra_meta = {
            "access_mode": "http_range_hdf5_scan_chunks",
            "remote_granule_bytes": remote_size,
            "range_requests": n_reqs,
        }

    buf = io.BytesIO()
    np.savez_compressed(
        buf,
        row_offset=np.int64(r0),
        col_offset=np.int64(c0),
        full_shape=np.asarray(full_shape, dtype=np.int64),
        lat=lat_sub,
        lon=lon_sub,
    )
    payload = buf.getvalue()
    _write_atomic(slice_path, payload)
    _write_manifest(
        slice_path,
        {
            "source_url": sanitize_url(url, token),
            "query": {
                "kind": "geo_slice",
                "platform": spec.platform,
                "short_name": spec.geo_short_name,
                "version": spec.geo_version,
                "concept_id": spec.geo_concept_id,
                "cmr_granule_id": geo_gran["id"],
                "box_wsen": list(box),
            },
            "retrieved_utc": _now_utc(),
            "bytes": len(payload),
            "bytes_transferred": sent,
            "sha256": hashlib.sha256(payload).hexdigest(),
            "slice_shape": list(lat_sub.shape),
            "row_offset": r0,
            "col_offset": c0,
            "full_shape": list(full_shape),
            **extra_meta,
        },
    )
    return r0, c0, full_shape, lat_sub, lon_sub, sent


# ---------------------------------------------------------------------------
# Swath-to-PassMaskGrid rasterization
# ---------------------------------------------------------------------------


def rasterize_swath_slice(
    grid_spec: PassMaskGrid,
    lat_sub: np.ndarray,
    lon_sub: np.ndarray,
    raw_mask_sub: np.ndarray,
    scan_lines: int,
) -> tuple[np.ndarray, dict[str, int]]:
    """Project a box-cropped swath slice onto PassMaskGrid using local scan/track pixel footprints.

    row 0 of lat_sub is aligned to a scan_lines boundary so cross-scan bowtie jumps never enter
    along-track pixel spacing.
    """
    if lat_sub.size == 0 or raw_mask_sub.size == 0:
        return np.zeros(grid_spec.shape, dtype=np.uint8), {}

    valid_geo = (
        np.isfinite(lat_sub)
        & np.isfinite(lon_sub)
        & (lat_sub >= -90.0)
        & (lat_sub <= 90.0)
        & (lon_sub >= -180.0)
        & (lon_sub <= 180.0)
    )
    if not np.any(valid_geo):
        return np.zeros(grid_spec.shape, dtype=np.uint8), {}

    lat_f = lat_sub.astype(np.float64)
    lon_f = lon_sub.astype(np.float64)
    x_s, y_s = grid_spec.xy_km(lon_f, lat_f)
    h, w = lat_f.shape

    # Record raw 0..9 counts for swath pixels whose centres fall inside the box.
    in_box_centres = (
        valid_geo
        & (lon_f >= grid_spec.west)
        & (lon_f <= grid_spec.east)
        & (lat_f >= grid_spec.south)
        & (lat_f <= grid_spec.north)
    )
    raw_vals, raw_cnts = np.unique(raw_mask_sub[in_box_centres], return_counts=True)
    raw_hist = {str(int(k)): int(v) for k, v in zip(raw_vals.tolist(), raw_cnts.tolist())}

    ux = np.zeros((h, w), dtype=np.float64)
    uy = np.zeros((h, w), dtype=np.float64)
    if w >= 2:
        ok_c = valid_geo[:, 1:] & valid_geo[:, :-1]
        dx_c = np.diff(x_s, axis=1)
        dy_c = np.diff(y_s, axis=1)
        cnt_c = np.zeros((h, w), dtype=np.float64)
        ux[:, :-1] += np.where(ok_c, dx_c, 0.0)
        uy[:, :-1] += np.where(ok_c, dy_c, 0.0)
        cnt_c[:, :-1] += ok_c
        ux[:, 1:] += np.where(ok_c, dx_c, 0.0)
        uy[:, 1:] += np.where(ok_c, dy_c, 0.0)
        cnt_c[:, 1:] += ok_c
        mc = cnt_c > 0
        ux[mc] /= cnt_c[mc]
        uy[mc] /= cnt_c[mc]

    vx = np.zeros((h, w), dtype=np.float64)
    vy = np.zeros((h, w), dtype=np.float64)
    cnt_t = np.zeros((h, w), dtype=np.float64)
    for s0 in range(0, h, scan_lines):
        s1 = min(h, s0 + scan_lines)
        if s1 - s0 < 2:
            continue
        ok_t = valid_geo[s0 + 1 : s1, :] & valid_geo[s0 : s1 - 1, :]
        dx_t = np.diff(x_s[s0:s1, :], axis=0)
        dy_t = np.diff(y_s[s0:s1, :], axis=0)
        vx[s0 : s1 - 1, :] += np.where(ok_t, dx_t, 0.0)
        vy[s0 : s1 - 1, :] += np.where(ok_t, dy_t, 0.0)
        cnt_t[s0 : s1 - 1, :] += ok_t
        vx[s0 + 1 : s1, :] += np.where(ok_t, dx_t, 0.0)
        vy[s0 + 1 : s1, :] += np.where(ok_t, dy_t, 0.0)
        cnt_t[s0 + 1 : s1, :] += ok_t
    mt = cnt_t > 0
    vx[mt] /= cnt_t[mt]
    vy[mt] /= cnt_t[mt]

    scan_km = np.maximum(np.hypot(ux, uy), 0.25)
    track_km = np.maximum(np.hypot(vx, vy), 0.25)
    su_x = ux / scan_km
    su_y = uy / scan_km
    tv_x = -su_y
    tv_y = su_x

    # Exclude only bowtie-deleted slots (class 1); keep 0/2/6 so unusable in-swath pixels stay not_seen (0).
    use = valid_geo & (raw_mask_sub != 1) & (raw_mask_sub < len(RAW_TO_CLASS))
    pr, pc = np.where(use)

    best_dist = np.full(grid_spec.shape, np.inf, dtype=np.float64)
    out_cls = np.zeros(grid_spec.shape, dtype=np.uint8)
    fire_painted = np.zeros(grid_spec.shape, dtype=bool)
    grid_w_km = grid_spec.nx * grid_spec.cell_km
    grid_h_km = grid_spec.ny * grid_spec.cell_km

    for idx in range(len(pr)):
        i, j = int(pr[idx]), int(pc[idx])
        x0, y0 = float(x_s[i, j]), float(y_s[i, j])
        sk, tk = float(scan_km[i, j]), float(track_km[i, j])
        half_diag = 0.58 * math.hypot(sk, tk)
        if x0 < -half_diag or x0 > grid_w_km + half_diag or y0 < -half_diag or y0 > grid_h_km + half_diag:
            continue
        c0 = int(math.floor(x0 / grid_spec.cell_km))
        r0 = int(grid_spec.ny - 1 - math.floor(y0 / grid_spec.cell_km))
        reach = int(math.ceil(half_diag / grid_spec.cell_km)) + 1
        r_lo, r_hi = max(0, r0 - reach), min(grid_spec.ny - 1, r0 + reach)
        c_lo, c_hi = max(0, c0 - reach), min(grid_spec.nx - 1, c0 + reach)
        if r_lo > r_hi or c_lo > c_hi:
            continue
        rr, cc = np.meshgrid(np.arange(r_lo, r_hi + 1), np.arange(c_lo, c_hi + 1), indexing="ij")
        dx = (cc + 0.5) * grid_spec.cell_km - x0
        dy = (grid_spec.ny - rr - 0.5) * grid_spec.cell_km - y0
        u = dx * float(su_x[i, j]) + dy * float(su_y[i, j])
        v = dx * float(tv_x[i, j]) + dy * float(tv_y[i, j])
        nu = np.abs(u) / sk
        nv = np.abs(v) / tk
        cls = int(RAW_TO_CLASS[int(raw_mask_sub[i, j])])
        inside = (nu <= 0.55) & (nv <= 0.55)
        if 0 <= r0 < grid_spec.ny and 0 <= c0 < grid_spec.nx:
            inside |= (rr == r0) & (cc == c0)
        if not np.any(inside):
            continue
        d2 = nu * nu + nv * nv
        sub_dist = best_dist[r_lo : r_hi + 1, c_lo : c_hi + 1]
        sub_out = out_cls[r_lo : r_hi + 1, c_lo : c_hi + 1]
        better = inside & (d2 < sub_dist)
        sub_dist[better] = d2[better]
        sub_out[better] = cls
        if cls == 4:
            in_fire = (nu <= 0.5 + 1e-9) & (nv <= 0.5 + 1e-9)
            if 0 <= r0 < grid_spec.ny and 0 <= c0 < grid_spec.nx:
                in_fire |= (rr == r0) & (cc == c0)
            fire_painted[r_lo : r_hi + 1, c_lo : c_hi + 1] |= in_fire

    out_cls[fire_painted] = 4
    return out_cls, raw_hist


def merge_granule_masks(masks: list[np.ndarray]) -> np.ndarray:
    """Merge consecutive granules of one pass onto a single grid."""
    if not masks:
        raise ValueError("empty granule mask list")
    if len(masks) == 1:
        return masks[0]
    merged = masks[0].copy()
    for nxt in masks[1:]:
        take = _MERGE_RANK[nxt] > _MERGE_RANK[merged]
        merged[take] = nxt[take]
    return merged


# ---------------------------------------------------------------------------
# End-to-end per-pass fetch
# ---------------------------------------------------------------------------


def _process_one_pass(
    box: tuple[float, float, float, float],
    grid_spec: PassMaskGrid,
    spec: SensorSpec,
    pass_granules: list[dict[str, Any]],
    geo_candidates: list[dict[str, Any]],
    out_dir: Path,
    cache_dir: Path,
    token: str,
    force: bool = False,
    keep_raw_geo: bool = False,
) -> dict[str, Any]:
    ts_str = pass_granules[0]["time_start"]
    te_str = pass_granules[-1]["time_end"]
    ts_s = parse_utc_seconds(ts_str)
    te_s = parse_utc_seconds(te_str)
    tmid_str = format_utc(0.5 * (ts_s + te_s))
    role = platform_role(spec.platform)

    dest = passmask_path(box, ts_str, spec.platform, root=out_dir)
    if not force and dest.is_file() and read_manifest(dest) is not None:
        man = read_manifest(dest) or {}
        return {
            "platform": spec.platform,
            "role": role,
            "time_start": ts_str,
            "time_end": te_str,
            "status": "cached",
            "bytes_transferred": 0,
            "stored_bytes": dest.stat().st_size,
            "shares": man.get("shares"),
        }

    granule_masks: list[np.ndarray] = []
    lineage: list[dict[str, Any]] = []
    raw_totals: dict[str, int] = {}
    sent_total = 0

    for fg in pass_granules:
        gg = _pair_geo_granule(fg, geo_candidates, spec, cache_dir=cache_dir)
        fire_path, sent_fire = _ensure_fire_granule(fg, spec, cache_dir=cache_dir, token=token)
        r0, c0, full_shape, lat_sub, lon_sub, sent_geo = _ensure_geo_slice(
            gg, spec, box, cache_dir=cache_dir, token=token, keep_raw_geo=keep_raw_geo
        )
        sent_total += sent_fire + sent_geo
        full_fire = _read_fire_mask(fire_path, spec)
        if full_fire.shape != full_shape and lat_sub.size > 0:
            raise RuntimeError(
                f"shape mismatch between {fire_path.name} {full_fire.shape} and {gg['filename']} {full_shape}"
            )
        if lat_sub.size == 0:
            gmask = np.zeros(grid_spec.shape, dtype=np.uint8)
            rhist: dict[str, int] = {}
        else:
            rm_sub = full_fire[r0 : r0 + lat_sub.shape[0], c0 : c0 + lat_sub.shape[1]]
            gmask, rhist = rasterize_swath_slice(grid_spec, lat_sub, lon_sub, rm_sub, spec.scan_lines)
        granule_masks.append(gmask)
        for k, v in rhist.items():
            raw_totals[k] = raw_totals.get(k, 0) + v
        fire_man = read_manifest(fire_path) or {}
        lineage.append(
            {
                "fire_granule_id": fg["id"],
                "fire_filename": fg["filename"],
                "fire_source_url": sanitize_url(fg.get("url") or "", token),
                "fire_sha256": fire_man.get("sha256"),
                "geo_granule_id": gg["id"],
                "geo_filename": gg["filename"],
                "geo_source_url": sanitize_url(gg.get("url") or "", token),
                "raw_in_box_pixel_counts": rhist,
            }
        )
        if PAUSE_S:
            time.sleep(PAUSE_S)

    merged = merge_granule_masks(granule_masks)
    counts_arr = np.bincount(merged.ravel(), minlength=len(CLASS_NAMES))[: len(CLASS_NAMES)].astype(np.int64)
    shares_arr = counts_arr.astype(np.float64) / float(merged.size)

    buf = io.BytesIO()
    np.savez_compressed(
        buf,
        platform=np.asarray(spec.platform),
        role=np.asarray(role),
        time_start=np.asarray(ts_str),
        time_end=np.asarray(te_str),
        time_mid=np.asarray(tmid_str),
        time_start_s=np.float64(ts_s),
        time_end_s=np.float64(te_s),
        box_wsen=np.asarray(box, dtype=np.float64),
        cell_km=np.float64(grid_spec.cell_km),
        grid_shape=np.asarray(grid_spec.shape, dtype=np.int64),
        km_per_deg=np.asarray([grid_spec.km_per_deg_lon, grid_spec.km_per_deg_lat], dtype=np.float64),
        classes=np.asarray(CLASS_NAMES),
        mask=merged,
        counts=counts_arr,
        shares=shares_arr,
    )
    payload = buf.getvalue()
    _write_atomic(dest, payload)

    counts_dict = {name: int(counts_arr[i]) for i, name in enumerate(CLASS_NAMES)}
    shares_dict = {name: round(float(shares_arr[i]), 6) for i, name in enumerate(CLASS_NAMES)}
    _write_manifest(
        dest,
        {
            "platform": spec.platform,
            "role": role,
            "fire_product": {"short_name": spec.fire_short_name, "version": spec.fire_version, "concept_id": spec.fire_concept_id},
            "geo_product": {"short_name": spec.geo_short_name, "version": spec.geo_version, "concept_id": spec.geo_concept_id},
            "time_start": ts_str,
            "time_end": te_str,
            "time_mid": tmid_str,
            "box_wsen": list(box),
            "cell_km": grid_spec.cell_km,
            "grid_shape": list(grid_spec.shape),
            "n_cells": grid_spec.n_cells,
            "classes": list(CLASS_NAMES),
            "counts": counts_dict,
            "shares": shares_dict,
            "raw_in_box_pixel_counts": raw_totals,
            "lineage": lineage,
            "retrieved_utc": _now_utc(),
            "bytes": len(payload),
            "bytes_transferred": sent_total,
            "sha256": hashlib.sha256(payload).hexdigest(),
        },
    )
    return {
        "platform": spec.platform,
        "role": role,
        "time_start": ts_str,
        "time_end": te_str,
        "status": "fetched",
        "bytes_transferred": sent_total,
        "stored_bytes": len(payload),
        "shares": shares_dict,
    }


def fetch_box_window(
    box: tuple[float, float, float, float] | list[float],
    start: str | _dt.date | _dt.datetime,
    end: str | _dt.date | _dt.datetime,
    *,
    platforms: Iterable[str] | None = None,
    env_file: Path | None = None,
    out_dir: Path | None = None,
    workers: int = DEFAULT_WORKERS,
    force: bool = False,
    keep_raw_geo: bool = False,
    log: Callable[[str], None] = print,
) -> dict[str, Any]:
    """Fetch and build per-pass masks for every pass over box in [start, end) UTC."""
    norm_box = normalize_box(box)
    refuse_closed_window(norm_box, start, end)
    t0 = parse_utc_seconds(start)
    t1 = parse_utc_seconds(end)
    if t1 <= t0:
        raise ValueError("end must be after start")

    token = _require_token(env_file)
    base_out = default_passmask_dir() if out_dir is None else Path(out_dir)
    cache_dir = base_out / "cache"
    grid_spec = PassMaskGrid.from_bbox(norm_box)

    want = [canonical_platform(p) for p in platforms] if platforms is not None else list(PLATFORMS)
    skipped_platforms: list[str] = []
    if not HAS_PYHDF:
        modis_in_want = [p for p in want if SENSOR_SPECS[p].file_format == "hdf4"]
        if modis_in_want:
            log(f"pyhdf is unavailable on this machine; skipping HDF4 platforms {modis_in_want}")
            skipped_platforms.extend(modis_in_want)
            want = [p for p in want if p not in modis_in_want]

    tasks: list[tuple[SensorSpec, list[dict[str, Any]], list[dict[str, Any]]]] = []
    for plat in want:
        spec = SENSOR_SPECS[plat]
        first_s = parse_utc_seconds(spec.first_day)
        if t1 <= first_s:
            continue
        q_start = max(first_s, t0 - 900.0)
        q_end = t1 + 900.0
        fire_entries = query_cmr_granules(spec.fire_concept_id, norm_box, q_start, q_end, cache_dir=cache_dir)
        active_spec = spec
        if (
            plat == "VIIRS_NOAA20"
            and not fire_entries
            and t0 < parse_utc_seconds("2018-07-01")
            and t1 > parse_utc_seconds("2018-01-01")
        ):
            active_spec = NOAA20_750M_FALLBACK
            fire_entries = query_cmr_granules(
                active_spec.fire_concept_id, norm_box, q_start, q_end, cache_dir=cache_dir
            )

        if not fire_entries:
            continue
        geo_entries = query_cmr_granules(active_spec.geo_concept_id, norm_box, q_start, q_end, cache_dir=cache_dir)
        for grp in _group_into_passes(fire_entries):
            gs = parse_utc_seconds(grp[0]["time_start"])
            ge = parse_utc_seconds(grp[-1]["time_end"])
            if ge <= t0 or gs >= t1:
                continue
            rings = [_densify(r) for g in grp for r in g["rings"]]
            if rings and _share_inside(norm_box, rings) <= 0.0:
                continue
            tasks.append((active_spec, grp, geo_entries))

    tasks.sort(key=lambda item: (item[1][0]["time_start"], item[0].platform))
    n_workers = max(1, min(int(workers), MAX_WORKERS))
    log(
        f"EARTHDATA_TOKEN set; box={norm_box} window=[{format_utc(t0)}, {format_utc(t1)}) "
        f"passes_planned={len(tasks)} workers={n_workers}"
    )

    results: list[dict[str, Any]] = []
    if n_workers == 1 or len(tasks) <= 1:
        for idx, (spec, grp, geos) in enumerate(tasks, 1):
            res = _process_one_pass(
                norm_box,
                grid_spec,
                spec,
                grp,
                geos,
                out_dir=base_out,
                cache_dir=cache_dir,
                token=token,
                force=force,
                keep_raw_geo=keep_raw_geo,
            )
            results.append(res)
            log(
                f"[{idx}/{len(tasks)}] {res['platform']} {res['time_start']} ({res['status']}) "
                f"cloud={res['shares']['cloud'] if res.get('shares') else 'n/a'} "
                f"sent={res['bytes_transferred'] / 1e6:.2f} MB"
            )
    else:
        with ThreadPoolExecutor(max_workers=n_workers) as pool:
            fut_map = {
                pool.submit(
                    _process_one_pass,
                    norm_box,
                    grid_spec,
                    spec,
                    grp,
                    geos,
                    out_dir=base_out,
                    cache_dir=cache_dir,
                    token=token,
                    force=force,
                    keep_raw_geo=keep_raw_geo,
                ): (spec.platform, grp[0]["time_start"])
                for spec, grp, geos in tasks
            }
            done_n = 0
            for fut in as_completed(fut_map):
                done_n += 1
                res = fut.result()
                results.append(res)
                log(
                    f"[{done_n}/{len(tasks)}] {res['platform']} {res['time_start']} ({res['status']}) "
                    f"cloud={res['shares']['cloud'] if res.get('shares') else 'n/a'} "
                    f"sent={res['bytes_transferred'] / 1e6:.2f} MB"
                )

    results.sort(key=lambda r: (r["time_start"], r["platform"]))
    fetched_n = sum(1 for r in results if r["status"] == "fetched")
    cached_n = sum(1 for r in results if r["status"] == "cached")
    sent_bytes = sum(int(r["bytes_transferred"]) for r in results)
    stored_bytes = sum(int(r["stored_bytes"]) for r in results)
    return {
        "box_wsen": list(norm_box),
        "start_utc": format_utc(t0),
        "end_utc": format_utc(t1),
        "passes_total": len(results),
        "passes_fetched": fetched_n,
        "passes_cached": cached_n,
        "skipped_platforms": skipped_platforms,
        "bytes_transferred": sent_bytes,
        "mask_bytes_stored": stored_bytes,
        "passes": results,
    }


def store_summary(out_dir: Path | None = None) -> dict[str, Any]:
    """Summarize stored pass masks and cache usage on disk."""
    base = default_passmask_dir() if out_dir is None else Path(out_dir)
    masks_dir = base / "masks"
    cache_dir = base / "cache"
    mask_files = sorted(masks_dir.rglob("*.npz")) if masks_dir.is_dir() else []
    boxes: set[str] = set()
    by_role: dict[str, int] = {"coarse": 0, "sharp": 0}
    for f in mask_files:
        parts = f.relative_to(masks_dir).parts
        if len(parts) >= 3:
            by_role[parts[0]] = by_role.get(parts[0], 0) + 1
            boxes.add(parts[1])
    total_disk = sum(p.stat().st_size for p in base.rglob("*") if p.is_file()) if base.is_dir() else 0
    mask_disk = sum(p.stat().st_size for p in masks_dir.rglob("*") if p.is_file()) if masks_dir.is_dir() else 0
    cache_disk = sum(p.stat().st_size for p in cache_dir.rglob("*") if p.is_file()) if cache_dir.is_dir() else 0
    return {
        "out_dir_exists": base.is_dir(),
        "boxes_count": len(boxes),
        "pass_masks_total": len(mask_files),
        "pass_masks_by_role": by_role,
        "mask_bytes_on_disk": mask_disk,
        "cache_bytes_on_disk": cache_disk,
        "total_bytes_on_disk": total_disk,
    }


def _resolve_region_box(region_id: str, box_kind: str) -> tuple[float, float, float, float]:
    from backend.terrain.live_region import PRESET_BY_ID
    from backend.terrain.terrain_pack import context_bbox

    if region_id not in PRESET_BY_ID:
        raise KeyError(f"unknown region_id '{region_id}'")
    b = PRESET_BY_ID[region_id].bbox
    if box_kind == "context":
        b = context_bbox(b)
    return (round(b.west, 6), round(b.south, 6), round(b.east, 6), round(b.north, 6))


def _parse_box_arg(text: str) -> tuple[float, float, float, float]:
    parts = [float(x.strip()) for x in text.split(",")]
    return normalize_box(parts)


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Fetch NASA per-pass active fire and cloud masks.")
    ap.add_argument("--env-file", type=Path, default=None, help="path to .env file holding EARTHDATA_TOKEN")
    ap.add_argument("--out-dir", type=Path, default=None, help="output passmask directory")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status", help="report EARTHDATA_TOKEN state (set or empty) and disk summary")

    f = sub.add_parser("fetch", help="fetch per-pass masks for a box or hero region and UTC date span")
    grp = f.add_mutually_exclusive_group(required=True)
    grp.add_argument("--box", type=str, help="west,south,east,north in decimal degrees")
    grp.add_argument("--region-id", type=str, help="hero region id (e.g. plumas_ca)")
    f.add_argument("--box-kind", choices=("pack", "context"), default="pack")
    f.add_argument("--start", required=True, help="UTC start YYYY-MM-DD or ISO-8601")
    f.add_argument("--end", required=True, help="UTC end YYYY-MM-DD or ISO-8601 (exclusive)")
    f.add_argument("--platforms", nargs="*", default=None)
    f.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    f.add_argument("--force", action="store_true")
    f.add_argument("--keep-raw-geo", action="store_true")

    args = ap.parse_args(argv)
    if args.cmd == "status":
        print(
            json.dumps(
                {
                    "earthdata_token": token_state(args.env_file),
                    "pyhdf_available": HAS_PYHDF,
                    "h5py_available": _h5py is not None,
                    **store_summary(args.out_dir),
                },
                indent=2,
            )
        )
        return 0

    target_box = _parse_box_arg(args.box) if args.box else _resolve_region_box(args.region_id, args.box_kind)
    summary = fetch_box_window(
        target_box,
        args.start,
        args.end,
        platforms=args.platforms,
        env_file=args.env_file,
        out_dir=args.out_dir,
        workers=args.workers,
        force=args.force,
        keep_raw_geo=args.keep_raw_geo,
    )
    print(json.dumps({k: v for k, v in summary.items() if k != "passes"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
