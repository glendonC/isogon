"""The tracked record of live seals: one line per seal in data/live_seals.csv, committed as seals are made.

Each line is a seal's UTC time, its digest, its fire, its satellite and its predicted pass. A copy of the repository
published after a commit shows those seals existed then, so each publication witnesses every seal whose pass comes
after it. The record is rebuilt from the chained seal log and is only ever added to: a rebuild that would change or
drop a line already written is refused. Only the record file is committed (`git commit --only`), never anything else
in the working tree, and nothing is done while a rebase, merge or cherry pick is in progress.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
import subprocess
from typing import Any, Callable

RECORD_PATH: str = "data/live_seals.csv"
HEADER: str = "sealed_utc,sha256,fire,satellite,predicted_pass_utc"
SATELLITE: dict[str, str] = {"VIIRS_NOAA20": "NOAA-20", "VIIRS_NOAA21": "NOAA-21"}


def render(seals: list[dict[str, Any]]) -> str:
    rows = [HEADER] + [
        f"{s['sealed_utc']},{s['sha256']},{s['fire']['id']},{SATELLITE.get(s['slot']['platform'], s['slot']['platform'])},"
        f"{s['slot']['time_utc']}"
        for s in seals
    ]
    return "\n".join(rows) + "\n"


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout.strip()


def busy(repo: Path) -> str | None:
    """Why the working tree must not be committed to now, or None."""
    for name in ("rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD", "index.lock"):
        p = Path(_git(repo, "rev-parse", "--git-path", name))
        if not p.is_absolute():
            p = Path(repo) / p
        if p.exists():
            return f"{name} is present"
    try:
        _git(repo, "symbolic-ref", "-q", "HEAD")
    except subprocess.CalledProcessError:
        return "HEAD is not on a branch"
    return None


def sync(repo: Path, seals: list[dict[str, Any]], notes: Path | None, log: Callable[[str], None] = print) -> str | None:
    """Bring the record up to the seal log and commit it alone. Returns the new commit, or None when nothing changed
    or the working tree is busy (the next call tries again)."""
    repo = Path(repo)
    dest = repo / RECORD_PATH
    text = render(seals)
    current = dest.read_text(encoding="ascii") if dest.is_file() else None
    if current == text:
        return None
    if current is not None and not text.startswith(current):
        raise RuntimeError("the record of live seals would change a line already written: nothing is committed")
    why = busy(repo)
    if why is not None:
        log(f"record of live seals not committed this cycle: {why}")
        return None
    before = 0 if current is None else current.count("\n") - 1
    added = seals[before:]
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, encoding="ascii")
    if len(added) == 1:
        s = added[0]
        msg = (f"Add the seal of fire {s['fire']['id']} for the {SATELLITE.get(s['slot']['platform'])} pass of "
               f"{s['slot']['time_utc']} to the record of live seals.")
    else:
        times = sorted(s["slot"]["time_utc"] for s in added)
        msg = f"Add {len(added)} seals, for passes from {times[0]} to {times[-1]}, to the record of live seals."
    _git(repo, "add", "--", RECORD_PATH)
    _git(repo, "commit", "-q", "--only", "-m", msg, "--", RECORD_PATH)
    sha = _git(repo, "rev-parse", "HEAD")
    log(f"record of live seals: commit {sha[:7]} adds {len(added)} line(s)")
    if notes is not None:
        report(repo, sha, added, Path(notes))
    return sha


def report(repo: Path, sha: str, added: list[dict[str, Any]], notes: Path) -> None:
    """The commit's patch and its digest, written under `notes`."""
    folder = notes / "record"
    folder.mkdir(parents=True, exist_ok=True)
    n = len(list(folder.glob("*.patch"))) + 1
    patch = subprocess.run(["git", "-C", str(repo), "format-patch", "-1", sha, "--stdout"], capture_output=True,
                           check=True).stdout
    name = f"{n:03d}-{sha[:7]}.patch"
    (folder / name).write_bytes(patch)
    index = notes / "RECORD.md"
    if not index.is_file():
        index.write_text(
            "# Record of live seals: commits\n\n"
            f"Each commit adds lines to `{RECORD_PATH}` only. Land them in order.\n\n"
            "| n | commit | patch | sha256 | seals added |\n| --- | --- | --- | --- | --- |\n", encoding="ascii")
    with open(index, "a", encoding="ascii") as fh:
        fh.write(f"| {n} | {sha} | record/{name} | {hashlib.sha256(patch).hexdigest()} | "
                 f"{', '.join(s['sha256'][:12] for s in added)} |\n")
