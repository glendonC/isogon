"""Pack what a visitor's browser unpacks to run a fire: the backend's modules the run imports and the shared data as
one archive, and each place's files as one archive per place, from the per-place file list, with a manifest of each
archive's size and sha256.

Every path in a list is relative to the tree (the checkout). A path outside the tree, the key's file (`.env` and any
name beginning `.env`), the world store (`ISOGON_WORLD_DIR`, and the default `data/cache/world`), `.git`, or a missing
file stops the pack before any archive is written. So does a FIRMS row inside a closed window: the closed rule is the
server's own (`backend.model.training.closed_for` over the test fires' regions and years), and no row of a closed
window goes into a public archive, whichever satellite it is from. Counts that summarise a closed window (an extract
manifest's day counts, a place's monthly calendar counts) are packed: they are the observed record the page has
always shown for those months, not rows a run could read and score. A place whose fire on the page is a closed test
fire (`REPLAY_ONLY`), or whose start in the list lies in a closed window, is not packed: the page replays its recorded
look. The manifest says which places are packed and which replay only. The archives are zip, deflated, with sorted
entries and fixed times and modes, so the same files give the same bytes.

The standard library, and the backend's closed rule (so numpy and Pillow). Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/browser_pack.py pack \
      --list <list.json> [--list <list.json> ...] --out <folder> [--root <checkout>]
  ... backend/browser_pack.py check --out <folder>
"""

from __future__ import annotations

import argparse
import calendar
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Any, Callable, Iterable
import zipfile

_REPO_ROOT = Path(__file__).resolve().parents[1]

VERSION: int = 1
MANIFEST: str = "browser-pack.json"
FILES: str = "browser-pack-files.json"
CORE: str = "core.zip"
PLACES: str = "places"
ZIP_TIME: tuple[int, int, int, int, int, int] = (1980, 1, 1, 0, 0, 0)
ZIP_LEVEL: int = 9
WORLD_DEFAULT: Path = Path("data") / "cache" / "world"
REGION_ID = re.compile(r"[a-z0-9_]+")
REFUSED: str = ("a path outside the tree, the key's file (.env and any name beginning .env), the world store and .git "
                "are never packed, nor a missing file, nor a FIRMS row inside a closed window; one in a list stops the "
                "pack before any archive is written")
# The places whose fire on the page is a closed test fire: the page replays their recorded look and never computes
# them in a browser, so nothing of theirs is packed. Each is a test fire's region (backend.model.training.EXCLUSIONS).
REPLAY_ONLY: dict[str, str] = {
    "lytton_bc": "its fire on the page is the closed test fire (Lytton Creek, 2021): the recorded look is replayed",
    "evia_greece": "its fire on the page is the closed test fire (northern Evia, 2021): the recorded look is replayed",
}
ROW_COLUMNS: tuple[str, str, str] = ("latitude", "longitude", "acq_date")
CLOSED_SOURCE: str = ("backend.model.training: closed_for, over EXCLUSIONS and closed_years; the context boxes from "
                      "backend.firms.region_box")


class Refused(ValueError):
    """A list names a file the pack must not take."""


def _sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def world_dirs(root: Path) -> list[Path]:
    """The world store wherever it may be: the default folder in the tree, and ISOGON_WORLD_DIR when set."""
    out = [(root / WORLD_DEFAULT).resolve()]
    v = os.environ.get("ISOGON_WORLD_DIR", "").strip()
    if v:
        out.append(Path(v).expanduser().resolve())
    return out


def _key_name(part: str) -> bool:
    return part.startswith(".env")


def _within(p: Path, folder: Path) -> bool:
    return p == folder or folder in p.parents


def check_path(rel: str, root: Path, worlds: list[Path]) -> tuple[str, Path]:
    """(the name in the archive, the file) of a list's path, or Refused. An absolute path may name the tree as given
    or as resolved; the file itself must resolve inside the resolved tree."""
    if not isinstance(rel, str) or not rel.strip() or "\x00" in rel:
        raise Refused(f"{rel!r}: not a path")
    given = root.absolute()
    root = root.resolve()
    p = Path(rel)
    if any(part == ".." for part in p.parts):
        raise Refused(f"{rel}: climbs with ..")
    full = p if p.is_absolute() else root / p
    base = next((r for r in (root, given) if _within(full, r)), None)
    if base is None:
        raise Refused(f"{rel}: outside the tree")
    name = full.relative_to(base)
    full = root / name
    for parts in (name.parts,):
        if any(_key_name(x) for x in parts):
            raise Refused(f"{rel}: the key's file is never packed")
        if ".git" in parts:
            raise Refused(f"{rel}: .git is never packed")
    real = full.resolve()
    if not _within(real, root):
        raise Refused(f"{rel}: resolves outside the tree")
    rparts = real.relative_to(root).parts
    if any(_key_name(x) for x in rparts):
        raise Refused(f"{rel}: resolves to the key's file")
    if ".git" in rparts:
        raise Refused(f"{rel}: resolves into .git")
    for w in worlds:
        if _within(real, w) or _within(full, w):
            raise Refused(f"{rel}: in the world store")
    if not real.is_file():
        raise Refused(f"{rel}: missing, or not a file")
    return name.as_posix(), real


def _day_s(day: str) -> float:
    y, m, d = (int(v) for v in day[:10].split("-"))
    return float(calendar.timegm((y, m, d, 0, 0, 0, 0, 0, 0)))


def closed_rule() -> tuple[Callable[..., Any], Callable[[str], Any], list[dict[str, Any]]]:
    """(closed_for, region_box, the closed windows): the server's closed rule, from where the backend keeps it."""
    if str(_REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(_REPO_ROOT))
    from backend.firms import region_box
    from backend.model.training import EXCLUSIONS, closed_for, closed_years

    stray = sorted(set(REPLAY_ONLY) - set(EXCLUSIONS))
    if stray:
        raise ValueError(f"{', '.join(stray)}: REPLAY_ONLY names a place that holds no test fire")
    windows = [{"region_id": r, "years": list(closed_years(r)), "context_box": list(region_box(r))} for r in EXCLUSIONS]
    return closed_for, region_box, windows


def closed_rows(path: Path, closed_for: Callable[..., Any], years: set[int]) -> tuple[int, dict[str, Any] | None]:
    """(the rows of a FIRMS row file inside a closed window, the first window met); (0, None) for a file that is
    not a row file (no latitude, longitude and acq_date columns). A row of a closed year whose position or date
    cannot be read counts as inside: the rule errs toward closing."""
    with path.open(newline="", encoding="utf-8", errors="replace") as fh:
        rd = csv.reader(fh)
        header = next(rd, None)
        cols = {h.strip().lower(): i for i, h in enumerate(header or [])}
        if not all(c in cols for c in ROW_COLUMNS):
            return 0, None
        ila, ilo, idt = (cols[c] for c in ROW_COLUMNS)
        n, first = 0, None
        for row in rd:
            try:
                day = row[idt].strip()
                year = int(day[:4])
            except (IndexError, ValueError):
                continue
            if year not in years:
                continue
            try:
                lat, lon, t = float(row[ila]), float(row[ilo]), _day_s(day)
                c = closed_for((lon, lat, lon, lat), t, t + 1.0)
            except (IndexError, ValueError):
                c = {"region_id": "a row that cannot be placed", "years": [year]}
            if c:
                n += 1
                first = first or c
    return n, first


def registry_places() -> list[str]:
    """Every region of the backend's place registry (backend/firms/places.json)."""
    try:
        doc = json.loads((_REPO_ROOT / "backend" / "firms" / "places.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return sorted(doc.get("regions") or {})


def read_list(path: Path) -> dict[str, Any]:
    """{"places": {region: {"start", "modules", "files"}}, "core": [...]} from either shape of list."""
    d = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(d, dict) and isinstance(d.get("places"), dict):
        places = {r: {"start": spec.get("start"), "modules": list(spec.get("modules") or []),
                      "files": list(spec.get("files") or [])} for r, spec in d["places"].items()}
        return {"places": places, "core": list(d.get("core") or [])}
    if isinstance(d, dict) and "region" in d and "data_files" in d:   # the browser spike's manifest
        files = [x["path"] if isinstance(x, dict) else x for x in d["data_files"]]
        return {"places": {d["region"]: {"start": d.get("start"), "modules": list(d.get("module_files") or []),
                                         "files": files}}, "core": []}
    raise ValueError(f"{path.name}: not a file list (no `places`, and not a spike manifest)")


def merge(lists: Iterable[dict[str, Any]]) -> dict[str, Any]:
    places: dict[str, dict[str, Any]] = {}
    core: list[str] = []
    for lst in lists:
        for r, spec in lst["places"].items():
            if r in places:
                raise ValueError(f"{r} is in two lists")
            if not isinstance(r, str) or not REGION_ID.fullmatch(r):
                raise Refused(f"{r!r}: a region id is lower case letters, digits and underscores")
            places[r] = spec
        core += lst["core"]
    if not places:
        raise ValueError("no place in the lists")
    return {"places": places, "core": core}


def split(merged: dict[str, Any]) -> tuple[list[str], dict[str, list[str]]]:
    """(the core's paths, each place's paths): the core holds every module, the list's `core`, every file under
    backend/, and any file every place names (with two places or more)."""
    places = merged["places"]
    core = set(merged["core"])
    for spec in places.values():
        core |= set(spec["modules"])
    named = {r: set(spec["files"]) for r, spec in places.items()}
    common = set.intersection(*named.values()) if len(named) > 1 else set()
    for files in named.values():
        core |= {f for f in files if f in common or Path(f).parts[:1] == ("backend",)}
    return sorted(core), {r: sorted(f - core) for r, f in sorted(named.items())}


def _write_zip(path: Path, entries: list[tuple[str, Path]]) -> list[dict[str, Any]]:
    """Write one archive the same way every time; returns its files with their bytes and sha256."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name("." + path.name + ".tmp")
    listed = []
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=ZIP_LEVEL) as z:
        for name, real in sorted(entries):
            data = real.read_bytes()
            zi = zipfile.ZipInfo(name, date_time=ZIP_TIME)
            zi.create_system = 3
            zi.external_attr = 0o644 << 16
            z.writestr(zi, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=ZIP_LEVEL)
            listed.append({"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    tmp.replace(path)
    return listed


def _commit(root: Path) -> str | None:
    try:
        r = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout.strip() or None if r.returncode == 0 else None


def pack(lists: list[Path], out: Path, root: Path | None = None, log: Callable[[str], None] = print) -> dict[str, Any]:
    """Pack the files the lists name from `root` into `out`; returns the manifest. Refused before any write."""
    given = (root or _REPO_ROOT).absolute()
    root = given.resolve()
    worlds = world_dirs(root)
    closed_for, region_box, windows = closed_rule()
    closed_years = {y for w in windows for y in w["years"]}
    merged = merge(read_list(p) for p in lists)
    # The places replayed only: their fire on the page is a closed test fire, or their start lies in a closed window.
    replay: dict[str, str] = {}
    for r in list(merged["places"]):
        why = REPLAY_ONLY.get(r)
        start = merged["places"][r].get("start")
        if why is None and start:
            try:
                box = region_box(r)
            except (KeyError, ValueError):
                box = None
            if box is not None:
                t = _day_s(str(start))
                c = closed_for(tuple(box), t, t + 1.0)
                if c:
                    why = (f"its start in the list, {start}, lies in a closed window ({c['region_id']}, "
                           f"{' and '.join(str(y) for y in c['years'])}): the page replays the recorded look")
        if why:
            replay[r] = why
            del merged["places"][r]
    if not merged["places"]:
        raise ValueError("every place in the lists replays only: nothing to pack")
    core, places = split(merged)
    # Every path is checked before anything is written.
    checked: dict[str, tuple[str, Path]] = {}
    problems = []
    for rel in sorted(set(core) | {f for fs in places.values() for f in fs}):
        try:
            checked[rel] = check_path(rel, given, worlds)
        except Refused as exc:
            problems.append(str(exc))
    if problems:
        raise Refused(f"{len(problems)} of the listed paths may not be packed: " + "; ".join(problems[:12]))
    # No row of a closed window, in any archive, before anything is written.
    for archive, paths in [("core", core), *places.items()]:
        for rel in paths:
            name, real = checked[rel]
            if real.suffix.lower() == ".csv":
                n, c = closed_rows(real, closed_for, closed_years)
                if n:
                    problems.append(f"{archive}: {name} holds {n} rows inside the closed window of {c['region_id']} "
                                    f"in {' and '.join(str(y) for y in c['years'])}")
    if problems:
        raise Refused(f"{len(problems)} files hold rows of a closed window: " + "; ".join(problems[:12]))
    out = out.resolve()
    for w in worlds:
        if _within(out, w):
            raise Refused(f"{out}: the archives are not written into the world store")
    out.mkdir(parents=True, exist_ok=True)

    def entries(paths: list[str]) -> list[tuple[str, Path]]:
        seen: dict[str, Path] = {}
        for rel in paths:
            name, real = checked[rel]
            seen[name] = real
        return sorted(seen.items())

    files: dict[str, Any] = {}
    core_files = _write_zip(out / CORE, entries(core))
    files[CORE] = core_files
    manifest: dict[str, Any] = {
        "version": VERSION,
        "what": "the archives a browser unpacks into one folder to run a fire: the core first, then the place's",
        "commit": _commit(root),
        "unpack": {"format": "zip", "paths": "relative to the repository root", "order": ["core", "place"]},
        "core": {"file": CORE, "bytes": (out / CORE).stat().st_size, "sha256": _sha(out / CORE),
                 "files": len(core_files), "content_bytes": sum(f["bytes"] for f in core_files),
                 "modules": sum(1 for f in core_files if f["path"].endswith(".py"))},
        "places": {},
        "replay_only": {},
        "closed": {"rule": ("no FIRMS row inside a closed window is packed: a window of a test fire's region (its "
                            "context box, touching counts) in a year of its fire, whatever the satellite"),
                   "source": CLOSED_SOURCE, "windows": windows},
        "lists": [{"file": p.name, "sha256": _sha(p)} for p in lists],
        "refused": REFUSED,
    }
    keep = set()
    for r, paths in places.items():
        rel = f"{PLACES}/{r}.zip"
        listed = _write_zip(out / rel, entries(paths))
        keep.add(f"{r}.zip")
        files[rel] = listed
        manifest["places"][r] = {"file": rel, "start": merged["places"][r]["start"],
                                 "bytes": (out / rel).stat().st_size, "sha256": _sha(out / rel),
                                 "files": len(listed), "content_bytes": sum(f["bytes"] for f in listed)}
    for old in (out / PLACES).glob("*.zip"):
        if old.name not in keep:
            old.unlink()
    for r in sorted(set(registry_places()) | set(replay) | set(REPLAY_ONLY)):
        if r not in manifest["places"]:
            manifest["replay_only"][r] = replay.get(r) or REPLAY_ONLY.get(r) or "not in the lists: the page replays it"
    (out / FILES).write_text(json.dumps({"version": VERSION, "archives": files}, indent=1) + "\n", encoding="utf-8")
    (out / MANIFEST).write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    log(f"packed: core {manifest['core']['files']} files, {manifest['core']['bytes']} bytes; "
        f"{len(places)} places, {sum(p['bytes'] for p in manifest['places'].values())} bytes; "
        f"{len(manifest['replay_only'])} replay only")
    return manifest


def check(out: Path) -> dict[str, Any]:
    """Each archive's size and sha256 against the manifest, and its files against the files list."""
    man = json.loads((out / MANIFEST).read_text(encoding="utf-8"))
    listed = json.loads((out / FILES).read_text(encoding="utf-8"))["archives"]
    problems = []
    specs = [man["core"], *man["places"].values()]
    for spec in specs:
        p = out / spec["file"]
        if not p.is_file():
            problems.append(f"{spec['file']}: missing")
            continue
        if p.stat().st_size != spec["bytes"] or _sha(p) != spec["sha256"]:
            problems.append(f"{spec['file']}: its size or sha256 is not the manifest's")
            continue
        want = {f["path"]: f for f in listed.get(spec["file"], [])}
        with zipfile.ZipFile(p) as z:
            names = z.namelist()
            if sorted(names) != sorted(want):
                problems.append(f"{spec['file']}: holds other files than its list")
                continue
            for n in names:
                data = z.read(n)
                if len(data) != want[n]["bytes"] or hashlib.sha256(data).hexdigest() != want[n]["sha256"]:
                    problems.append(f"{spec['file']}: {n} is not its listed file")
    for r in man.get("replay_only") or {}:
        if (out / PLACES / f"{r}.zip").exists():
            problems.append(f"{PLACES}/{r}.zip: an archive of a place that replays only")
    return {"ok": not problems, "archives": len(specs), "problems": problems}


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("pack")
    a.add_argument("--list", action="append", required=True, type=Path)
    a.add_argument("--out", required=True, type=Path)
    a.add_argument("--root", type=Path, default=None)
    c = sub.add_parser("check")
    c.add_argument("--out", required=True, type=Path)
    args = ap.parse_args(argv)
    if args.cmd == "pack":
        try:
            man = pack(args.list, args.out, args.root)
        except ValueError as exc:
            print(f"refused: {exc}", file=sys.stderr)
            return 2
        print(json.dumps({"core": man["core"], "places": man["places"], "replay_only": man["replay_only"],
                          "commit": man["commit"]}, indent=1))
        return 0
    res = check(args.out)
    print(json.dumps(res, indent=1))
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(_main())
