"""The live test's two outside sources, each reply cached as returned with a manifest.

FIRMS area API (`AreaFetcher`): the key goes into the request URL only; every stored URL, manifest and log line
carries <MAP_KEY> instead, as in `backend/firms/area_api.py`, whose request and redaction functions are used.
`ModisOnly` wraps a fetcher for the sealing path: it serves the MODIS near real time source and raises on any other,
so no code that seals can ask for a VIIRS row.

NASA CMR granule search (`CmrFetcher`): no key. Granule metadata only (time span, day or night flag, swath polygon).
"""

from __future__ import annotations

import csv
import datetime as _dt
import hashlib
import io
import json
from pathlib import Path
import time
from typing import Any, Callable

from backend.firms.archive import Opener, _default_opener, _write_atomic, redact_key
from backend.firms.area_api import API_BASE, _get, key_status
from backend.firms import cmr_passes as C
from backend.live import protocol as PR


class SharpRowsRefused(PermissionError):
    """The sealing path asked for a source that is not the coarse satellites' near real time rows."""


def now_s() -> float:
    return time.time()


def iso(t: float) -> str:
    return _dt.datetime.fromtimestamp(round(t), _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _area_text(area: tuple[float, float, float, float] | str) -> str:
    if area == "world":
        return "world"
    w, s, e, n = area  # type: ignore[misc]
    return f"{w:.6f},{s:.6f},{e:.6f},{n:.6f}"


def _slug(text: str) -> str:
    return text.replace(",", "_").replace("-", "m").replace(".", "p")


class AreaFetcher:
    """FIRMS area API requests, one at a time, each reply kept under cache_dir/firms/<source>/<area>/."""

    def __init__(self, key: str, cache_dir: Path, opener: Opener = _default_opener, log: Callable[[str], None] = print,
                 pause_s: float = PR.PAUSE_S, clock: Callable[[], float] = now_s, status_every_s: float = 300.0) -> None:
        self._key = key
        self.cache_dir = Path(cache_dir)
        self.opener = opener
        self.log = log
        self.pause_s = pause_s
        self.clock = clock
        self.status_every_s = status_every_s
        self._status_at = -1e18
        self.requests = 0

    def _throttle(self) -> None:
        if self.clock() - self._status_at < self.status_every_s:
            return
        while True:
            st = key_status(self._key, self.opener)
            self._status_at = self.clock()
            cur, lim = int(st.get("current_transactions", 0)), int(st.get("transaction_limit", 5000))
            self.log(f"key: {cur} of {lim} transactions in the current window")
            if cur <= PR.THROTTLE_SHARE * lim:
                return
            time.sleep(60.0)

    def _dir(self, source: str, area: tuple[float, float, float, float] | str) -> Path:
        return self.cache_dir / "firms" / source / _slug(_area_text(area))

    def cached(self, source: str, area: tuple[float, float, float, float] | str, days: int, date: str | None) -> list[dict[str, Any]]:
        """Manifests of the replies already held for this question, oldest first."""
        d = self._dir(source, area)
        stem = f"{date or 'latest'}_{days}d_"
        out = []
        for m in sorted(d.glob(stem + "*.manifest.json")) if d.is_dir() else []:
            out.append(json.loads(m.read_text(encoding="utf-8")))
        return sorted(out, key=lambda x: x["retrieved_utc"])

    def fetch(self, source: str, area: tuple[float, float, float, float] | str, days: int, date: str | None = None,
              reuse_within_s: float | None = None) -> dict[str, Any]:
        """The reply's manifest with its text under `text`. A question already answered is not asked again: with
        `reuse_within_s` None any held reply is reused (a fixed question), otherwise one retrieved that recently."""
        held = self.cached(source, area, days, date)
        if held:
            last = held[-1]
            age = self.clock() - _dt.datetime.fromisoformat(last["retrieved_utc"].replace("Z", "+00:00")).timestamp()
            if reuse_within_s is None or age <= reuse_within_s:
                return {**last, "text": (self.cache_dir / last["path"]).read_text(encoding="utf-8")}
        if not 1 <= int(days) <= 5:
            raise ValueError("the area API takes 1 to 5 days")
        self._throttle()
        url = f"{API_BASE}/api/area/csv/{self._key}/{source}/{_area_text(area)}/{int(days)}" + (f"/{date}" if date else "")
        body = _get(url, self._key, self.opener)
        self.requests += 1
        text = body.decode("utf-8")
        if not text.startswith("latitude"):
            raise RuntimeError(f"{source} {_area_text(area)}: unexpected reply: {redact_key(text[:160], self._key)}")
        got = self.clock()
        stamp = _dt.datetime.fromtimestamp(got, _dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        dest = self._dir(source, area) / f"{date or 'latest'}_{int(days)}d_{stamp}.csv"
        _write_atomic(dest, body)
        rows = max(0, text.count("\n") - 1) if text.endswith("\n") else text.count("\n")
        manifest = {
            "path": str(dest.relative_to(self.cache_dir)),
            "source_url": redact_key(url, self._key),
            "query": {"source": source, "area": _area_text(area), "days": int(days), "date": date},
            "retrieved_utc": iso(got),
            "bytes": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
            "rows": rows,
        }
        _write_atomic(dest.with_suffix(".manifest.json"), json.dumps(manifest, indent=1, sort_keys=True).encode("utf-8"))
        self.log(f"fetched {source} {_area_text(area)} {days}d {date or 'latest'}: {rows} rows, {len(body)} bytes")
        if self.pause_s:
            time.sleep(self.pause_s)
        return {**manifest, "text": text}


class ModisOnly:
    """The only fetcher the sealing path holds. It serves the coarse satellites' near real time source alone."""

    ALLOWED: tuple[str, ...] = (PR.MODIS_SOURCE, PR.CHOOSE_SOURCE)

    def __init__(self, inner: AreaFetcher) -> None:
        self._inner = inner

    def fetch(self, source: str, area: tuple[float, float, float, float] | str, days: int, date: str | None = None,
              reuse_within_s: float | None = None) -> dict[str, Any]:
        if source not in self.ALLOWED or "VIIRS" in source.upper():
            raise SharpRowsRefused(f"the sealing path may not ask for {source}")
        return self._inner.fetch(source, area, days, date, reuse_within_s)

    def cached(self, source: str, area: tuple[float, float, float, float] | str, days: int, date: str | None) -> list[dict[str, Any]]:
        if source not in self.ALLOWED:
            raise SharpRowsRefused(f"the sealing path may not read {source}")
        return self._inner.cached(source, area, days, date)

    def read(self, manifest: dict[str, Any]) -> str:
        if manifest["query"]["source"] not in self.ALLOWED:
            raise SharpRowsRefused(f"the sealing path may not read {manifest['query']['source']}")
        return (self._inner.cache_dir / manifest["path"]).read_text(encoding="utf-8")


def csv_rows(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


class CmrFetcher:
    """Granules of one collection over a box in a time window, from NASA CMR (no key), cached by question."""

    def __init__(self, cache_dir: Path, opener: C.Opener = C._default_opener, log: Callable[[str], None] = print,
                 clock: Callable[[], float] = now_s, pause_s: float = C.PAUSE_S) -> None:
        self.cache_dir = Path(cache_dir)
        self.opener = opener
        self.log = log
        self.clock = clock
        self.pause_s = pause_s
        self.requests = 0

    def granules(self, collection: str, box: tuple[float, float, float, float], t0: float, t1: float,
                 reuse_within_s: float | None = None) -> list[dict[str, Any]]:
        """Granules whose footprint meets the box and whose time meets [t0, t1). A window wholly in the past
        relative to its standard collection's latency is a fixed question (`reuse_within_s` None)."""
        w, s, e, n = box
        q = f"{collection}_{_slug(_area_text(box))}_{iso(t0)}_{iso(t1)}".replace(":", "")
        d = self.cache_dir / "cmr" / collection
        held = sorted(d.glob(q + "_*.json")) if d.is_dir() else []
        if held:
            last = json.loads(held[-1].read_text(encoding="utf-8"))
            age = self.clock() - _dt.datetime.fromisoformat(last["retrieved_utc"].replace("Z", "+00:00")).timestamp()
            if reuse_within_s is None or age <= reuse_within_s:
                return last["granules"]
        url = (f"{C.CMR_BASE}/granules.json?collection_concept_id={collection}&bounding_box={w},{s},{e},{n}"
               f"&temporal={iso(t0)},{iso(t1)}&page_size=200&sort_key=start_date")
        headers, body, sent = C._get(url, {}, self.opener)
        self.requests += 1
        feed = json.loads(body.decode("utf-8"))["feed"]["entry"]
        hits = int(headers.get("cmr-hits", len(feed)))
        if hits > len(feed):
            raise RuntimeError(f"CMR {collection}: {hits} granules for one box and window, more than one page")
        gran = [C._granule(x) for x in feed]
        got = self.clock()
        out = {"url": url, "retrieved_utc": iso(got), "hits": hits, "bytes_transferred": sent,
               "sha256": hashlib.sha256(body).hexdigest(), "granules": gran}
        stamp = _dt.datetime.fromtimestamp(got, _dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        _write_atomic(d / f"{q}_{stamp}.json", json.dumps(out, sort_keys=True).encode("utf-8"))
        if self.pause_s:
            time.sleep(self.pause_s)
        return gran
