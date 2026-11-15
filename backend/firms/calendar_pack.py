"""A place's calendar without its yearly extracts: one small file per place, made at build time.

`firms_calendar(region_id)` reads every year of a place's extracts (up to 211 MB at Jur River), every country file's
manifest and the coast test's tiles. A page that runs the backend in the visitor's browser carries only the run's
own window's extracts, so the calendar answers there from this file instead:

  <FIRMS cache>/calendar/<region_id>.json

It holds the calendar's answer exactly as `firms_calendar` gives it from the full extracts (each month's counts of
each satellite, the values as counted and on one scale with the range, the method's fields and its held-out
check), the extract files it was made from (name and bytes), the pack's version and the served method's id.

`firms_calendar` answers from the file when the file exists and the place's extract folder lacks one of the listed
extracts; otherwise (every listed extract there, even one that has grown since) it computes from the extracts. A file made by another pack
version or for another served method is refused, never served.

Usage (where the full extracts are, before the places are packed for the browser):
  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.firms.calendar_pack build \
      [--cache <FIRMS cache>] [region ...]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from backend.firms.archive import FIRMS_CACHE_DIR

PACK_VERSION: int = 1
FOLDER: str = "calendar"
BUILD_COMMAND: str = "python3 -m backend.firms.calendar_pack build"


class CalendarPackStale(LookupError):
    """The place's calendar file was made by another pack version or for another served method."""


def pack_path(region_id: str, cache_dir: Path = FIRMS_CACHE_DIR) -> Path:
    return Path(cache_dir) / FOLDER / f"{region_id}.json"


def extract_files(region_id: str, cache_dir: Path = FIRMS_CACHE_DIR) -> list[dict[str, Any]]:
    """The place's extract files the calendar reads: name and bytes, sorted by name."""
    base = Path(cache_dir) / "extract" / region_id
    return [{"name": p.name, "bytes": p.stat().st_size} for p in sorted(base.glob("*.csv"))] if base.is_dir() else []


def served_method() -> str:
    from backend.model.harmonize_fitted import FITTED

    return FITTED["serve"]["rows"]


def build(region_id: str, cache_dir: Path = FIRMS_CACHE_DIR, out_dir: Path | None = None) -> dict[str, Any]:
    """Compute the place's calendar from its full extracts and write its file; return a summary."""
    from backend.firms.real_calendar import firms_calendar

    files = extract_files(region_id, cache_dir)
    if not files:
        raise KeyError(f"no extracts cached for '{region_id}'")
    cal = firms_calendar(region_id, cache_dir, use_pack=False)
    doc = {
        "pack_version": PACK_VERSION,
        "what": "the calendar's answer for one place as firms_calendar gives it from the place's full extracts, "
                "for a reader that holds only some of them (backend/firms/calendar_pack.py)",
        "region_id": region_id,
        "served_method": served_method(),
        "extracts": files,
        "calendar": cal,
    }
    path = pack_path(region_id, out_dir if out_dir is not None else cache_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)
    return {"region_id": region_id, "file": str(path), "bytes": path.stat().st_size, "extract_files": len(files),
            "extract_bytes": sum(f["bytes"] for f in files), "months": len(cal.get("records", []))}


def read(region_id: str, cache_dir: Path = FIRMS_CACHE_DIR) -> dict[str, Any] | None:
    """The place's calendar file, or None when there is none. Raises `CalendarPackStale` for a stale one."""
    path = pack_path(region_id, cache_dir)
    if not path.is_file():
        return None
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("pack_version") != PACK_VERSION or doc.get("region_id") != region_id:
        raise CalendarPackStale(f"{path.name} is pack version {doc.get('pack_version')}, not {PACK_VERSION}; "
                                f"run {BUILD_COMMAND}")
    if doc.get("served_method") != served_method():
        raise CalendarPackStale(f"{path.name} was made for method {doc.get('served_method')}, not "
                                f"{served_method()}; run {BUILD_COMMAND}")
    return doc


def extracts_complete(doc: dict[str, Any], region_id: str, cache_dir: Path = FIRMS_CACHE_DIR) -> bool:
    """True when the place's extract folder holds every extract the file lists. One that has grown since (a live
    area extract) still counts as there: the calendar then computes from the extracts, which are newer."""
    base = Path(cache_dir) / "extract" / region_id
    return all((base / f["name"]).is_file() for f in doc.get("extracts", []))


def serve(region_id: str, cache_dir: Path = FIRMS_CACHE_DIR) -> dict[str, Any] | None:
    """The calendar from the place's file when its extracts are not all there; None to compute from the extracts."""
    path = pack_path(region_id, cache_dir)
    if not path.is_file():
        return None
    doc = read(region_id, cache_dir)
    if doc is None or extracts_complete(doc, region_id, cache_dir):
        return None
    return doc["calendar"]


def regions_with_extracts(cache_dir: Path = FIRMS_CACHE_DIR) -> list[str]:
    """The featured regions whose extracts are in the cache."""
    from backend.firms.archive import REGION_COUNTRY
    from backend.terrain.live_region import PRESET_BY_ID

    return sorted(r for r in REGION_COUNTRY if r in PRESET_BY_ID and extract_files(r, cache_dir))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="write each place's calendar file from its full extracts")
    b.add_argument("regions", nargs="*", help="region ids (default: every featured region with extracts)")
    b.add_argument("--cache", type=Path, default=FIRMS_CACHE_DIR, help="the FIRMS cache (data/cache/firms)")
    a = ap.parse_args()
    for r in a.regions or regions_with_extracts(a.cache):
        print(json.dumps(build(r, a.cache)))


if __name__ == "__main__":
    main()
