"""Append-only logs of the live test.

Each log is a file of JSON lines `{"<kind>": record, "sha256": digest}`, where the digest is the SHA-256 of the
record's canonical JSON and the record holds `prev_sha256`, the digest of the line before it (null on the first).
A line is only ever appended: the file is opened in append mode, written in one call and synced. Reading checks the
chain, so a line changed or taken out afterwards is found.
"""

from __future__ import annotations

import fcntl
import json
import os
from pathlib import Path
from typing import Any, Iterator

from backend.live.protocol import canonical, digest


class ChainBroken(RuntimeError):
    pass


class Ledger:
    def __init__(self, path: Path, kind: str) -> None:
        self.path = Path(path)
        self.kind = kind
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._last: str | None = None
        self._entries: list[dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        self._entries = list(read_chain(self.path, self.kind))
        self._last = self._entries[-1]["sha256"] if self._entries else None

    @property
    def entries(self) -> list[dict[str, Any]]:
        """Every record in order, each with its digest under `sha256`."""
        return [{**e[self.kind], "sha256": e["sha256"]} for e in self._entries]

    def append(self, record: dict[str, Any]) -> str:
        if "prev_sha256" in record or "sha256" in record:
            raise ValueError("the ledger writes prev_sha256 and sha256 itself")
        rec = {**record, "prev_sha256": self._last}
        d = digest(rec)
        line = canonical({self.kind: rec, "sha256": d}) + b"\n"
        fd = os.open(self.path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
        try:
            os.write(fd, line)
            os.fsync(fd)
        finally:
            os.close(fd)
        self._entries.append({self.kind: rec, "sha256": d})
        self._last = d
        return d


def read_chain(path: Path, kind: str) -> Iterator[dict[str, Any]]:
    if not Path(path).is_file():
        return
    prev: str | None = None
    with open(path, "rb") as fh:
        for n, raw in enumerate(fh, 1):
            if not raw.strip():
                continue
            if not raw.endswith(b"\n"):
                raise ChainBroken(f"{path.name} line {n} is not complete")
            line = json.loads(raw)
            rec = line[kind]
            if digest(rec) != line["sha256"]:
                raise ChainBroken(f"{path.name} line {n}: the digest does not match the record")
            if rec.get("prev_sha256") != prev:
                raise ChainBroken(f"{path.name} line {n}: the chain is broken")
            prev = line["sha256"]
            yield line


class Lock:
    """One sealer at a time: an exclusive lock on a file in the live folder, released when the process ends."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._fh: Any = None

    def __enter__(self) -> "Lock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = open(self.path, "a+")
        try:
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            self._fh.close()
            raise RuntimeError(f"another sealer holds {self.path.name}") from exc
        return self

    def __exit__(self, *exc: Any) -> None:
        fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
        self._fh.close()


class Witness:
    """A second record of every digest, in a Markdown file outside the live folder. Lines are only appended."""

    HEADER = "# Seals\n\nOne line per sealed prediction, written when it is sealed: UTC time, digest, fire, platform, predicted minute.\n\n"

    def __init__(self, path: Path | None) -> None:
        self.path = None if path is None else Path(path)

    def _append(self, text: str) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fresh = not self.path.is_file() or self.path.stat().st_size == 0
        with open(self.path, "a", encoding="ascii") as fh:
            if fresh:
                fh.write(self.HEADER)
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())

    def known(self) -> set[str]:
        if self.path is None or not self.path.is_file():
            return set()
        out = set()
        for line in self.path.read_text(encoding="ascii").splitlines():
            for word in line.replace("`", " ").split():
                if len(word) == 64 and all(c in "0123456789abcdef" for c in word):
                    out.add(word)
        return out

    def protocol(self, sha: str, utc: str) -> None:
        self._append(f"protocol `{sha}` written {utc}\n\n")

    def seal(self, rec: dict[str, Any], sha: str, note: str = "") -> None:
        slot = rec["slot"]
        tail = f" ({note})" if note else ""
        self._append(f"- {rec['sealed_utc']} `{sha}` {rec['fire']['id']} {slot['platform']} {slot['time_utc']}{tail}\n")
