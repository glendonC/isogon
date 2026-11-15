"""Each country's fire detections each year, from the fire cube's parts: per country file of the store, per year, the
fire rows of MODIS (Terra and Aqua) and of Suomi NPP as counted, and the harmonized total on the Suomi NPP
scale when its file is there. So a click on a country of the Earth can show that country's years in the strip.

The counted series sum the same rows the yearly layers draw (backend/firms/cube_years.py): FIRMS type 0, day and
night, the whole years of the archive, with the cells the closed rule closes left out in their closed years. Summed
over the countries, each year equals the yearly layer's total. Each country is matched to a shape of the page's map
(world-atlas countries-50m, by `properties.name`, listed in `atlas_countries_50m.json`).

Writes `<cube>/years/countries.json` and its copy in the public folder (`<cube>/public/years/countries.json`).

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/cube_countries.py write
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil
import sys
import time
from typing import Any

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms import cube as C  # noqa: E402
from backend.firms.cube_build import parts_dir  # noqa: E402
from backend.firms.cube_public import closed_cells, public_dir  # noqa: E402
from backend.firms.cube_years import _sha, closed_masks, harmonized_dir, year_of_month, years_dir, years_in  # noqa: E402

VERSION: int = 1
NAME: str = "countries.json"
SERIES: dict[str, dict[str, Any]] = {
    "modis": {"platforms": (0, 1), "what": "fire rows (FIRMS type 0, day and night) of Terra and Aqua, as counted"},
    "viirs": {"platforms": (2,), "what": "fire rows (FIRMS type 0, day and night) of Suomi NPP, as counted"},
}
# The harmonized file's own fields carried over: its words, not its per-country tables.
HARMONIZED_KEEP: tuple[str, ...] = ("version", "what", "scale", "unit", "closed", "years_note", "shared_cells", "source")
# Its own counts as detected, by its names, checked against the counted series.
HARMONIZED_DETECTED: dict[str, str] = {"modis": "modis", "suomi_npp": "viirs"}
HARMONIZED_WHAT: str = "the country's harmonized total on the Suomi NPP scale, from <world>/harmonize/years/"
ATLAS_FILE: Path = Path(__file__).with_name("atlas_countries_50m.json")

# The store's names the atlas spells another way.
ATLAS_NAME: dict[str, str] = {
    "Aland_Islands": "Åland", "Antigua_and_Barbuda": "Antigua and Barb.", "Brunei_Darussalam": "Brunei",
    "Cape_Verde": "Cabo Verde", "Cote_d_Ivoire": "Côte d'Ivoire", "Curacao": "Curaçao", "Czech_Republic": "Czechia",
    "Dem_Rep_Korea": "North Korea", "Federated_States_of_Micronesia": "Micronesia",
    "French_Southern_and_Antarctic_Lands": "Fr. S. Antarctic Lands", "Lao_PDR": "Laos",
    "Macedonia_Former_Yugoslav_Republic_of": "Macedonia", "Northern_Mariana_Islands": "N. Mariana Is.",
    "Republic_of_Congo": "Congo", "Republic_of_Korea": "South Korea", "Russian_Federation": "Russia",
    "Saint-Barthelemy": "St-Barthélemy", "Saint-Martin": "St-Martin",
    "Saint_Vincent_and_the_Grenadines": "St. Vin. and Gren.", "Sao_Tome_and_Principe": "São Tomé and Principe",
    "South_Georgia_and_South_Sandwich_Islands": "S. Geo. and the Is.", "Swaziland": "eSwatini",
    "The_Gambia": "Gambia", "United_States": "United States of America",
    "United_States_Virgin_Islands": "U.S. Virgin Is.",
}
# The store's files the atlas draws no shape of their own for.
NO_SHAPE: dict[str, str] = {
    "French_Guiana": "drawn inside France on the atlas; France's file does not hold its rows",
    "Guadeloupe": "drawn inside France on the atlas; France's file does not hold its rows",
    "Martinique": "drawn inside France on the atlas; France's file does not hold its rows",
    "Mayotte": "drawn inside France on the atlas; France's file does not hold its rows",
    "Reunion": "drawn inside France on the atlas; France's file does not hold its rows",
    "Svalbard_and_Jan_Mayen": "drawn inside Norway on the atlas; Norway's file does not hold its rows",
    "United_States_Minor_Outlying_Islands": "not drawn on the atlas at 1:50 million",
}
# The atlas's shapes with no store file of their own, and the store file that holds the rows inside each (by the
# build's cell_countries over the cells whose centre lies in the shape); the rest hold no row of the store.
ATLAS_HELD_BY: dict[str, str] = {"Somaliland": "Somalia", "W. Sahara": "Morocco", "N. Cyprus": "Cyprus"}
# Natural Earth's short forms on its small maps, written out (as website/src/world/countryAt.ts does).
WHOLE: tuple[tuple[str, str], ...] = (
    (r"^Dem\. Rep\. ", "Democratic Republic of the "), (r"^Central African Rep\.$", "Central African Republic"),
    (r"^Eq\. ", "Equatorial "), (r"^S\. ", "South "), (r"^N\. ", "North "), (r"^W\. ", "Western "),
    (r"^Fr\. ", "French "), (r" Is\.$", " Islands"), (r" Herz\.$", " Herzegovina"), (r"^St\. ", "Saint "),
    (r" Rep\.$", " Republic"),
)


def countries_path(root: Path | None = None) -> Path:
    return years_dir(root) / NAME


def harmonized_countries_path() -> Path:
    return harmonized_dir() / NAME


def _fold(name: str) -> str:
    return re.sub(r"[^a-z]", "", name.lower())


def atlas() -> list[dict[str, Any]]:
    return json.loads(ATLAS_FILE.read_text(encoding="utf-8"))["countries"]


def match_atlas(countries: list[str], shapes: list[dict[str, Any]]) -> dict[str, dict[str, Any] | None]:
    """The atlas shape of each store country ({name, id}), or None where the atlas draws none of its own."""
    by_fold: dict[str, dict[str, Any]] = {}
    for s in shapes:
        whole = s["name"]
        for pat, rep in WHOLE:
            whole = re.sub(pat, rep, whole)
        by_fold.setdefault(_fold(whole), s)
        by_fold.setdefault(_fold(s["name"]), s)
    by_name = {s["name"]: s for s in shapes}
    out: dict[str, dict[str, Any] | None] = {}
    for c in countries:
        if c in NO_SHAPE:
            out[c] = None
        elif c in ATLAS_NAME:
            out[c] = by_name[ATLAS_NAME[c]]
        else:
            out[c] = by_fold.get(_fold(c.replace("_", " ")))
    return out


def _part_sums(rec: np.ndarray, years: list[dict[str, Any]], masks: dict[int, np.ndarray]) -> np.ndarray:
    """(n years, n series) fire rows of one part, closed cells left out in their closed years."""
    dec = C.decode(rec["code"].astype(np.int64))
    yi = year_of_month(rec["month"].astype(np.int64)) - years[0]["year"]
    keep = (dec["kind"] == 0) & (yi >= 0) & (yi < len(years))
    for y, mask in masks.items():
        i = y - years[0]["year"]
        if 0 <= i < len(years):
            keep &= ~((yi == i) & mask[rec["cell"].astype(np.int64)])
    out = np.zeros((len(years), len(SERIES)), dtype=np.int64)
    for j, spec in enumerate(SERIES.values()):
        sel = keep & np.isin(dec["platform"], spec["platforms"])
        out[:, j] = np.bincount(yi[sel], weights=rec["rows"][sel].astype(np.float64), minlength=len(years)).astype(np.int64)
    return out


def _harmonized(years: list[int], countries: list[str]) -> tuple[dict[str, list[float | None]], dict[str, Any],
                                                                 dict[str, Any]]:
    """The harmonized series per country, the state of the file, and its own counts as detected (if it has them)."""
    path = harmonized_countries_path()
    state: dict[str, Any] = {"what": HARMONIZED_WHAT, "scale": "suomi_npp", "state": "not written yet",
                             "file": "<world>/harmonize/years/countries.json", "sha256": None}
    if not path.is_file():
        return {}, state, {}
    src = json.loads(path.read_text(encoding="utf-8"))
    if [int(y) for y in src.get("years", [])] != years:
        raise ValueError(f"{path.name}: its years {src.get('years')} are not {years[0]} to {years[-1]}")
    out: dict[str, list[float | None]] = {}
    unknown = []
    for key, vals in src.get("countries", {}).items():
        if key not in countries:
            unknown.append(key)
            continue
        if len(vals) != len(years):
            raise ValueError(f"{path.name}: {key} has {len(vals)} values, not {len(years)}")
        out[key] = [None if v is None else float(v) for v in vals]
    state.update({"state": "drawn from the harmonize folder", "sha256": _sha(path),
                  "countries": len(out), "unknown_keys": sorted(unknown),
                  "source": {k: src[k] for k in HARMONIZED_KEEP if k in src}})
    return out, state, src.get("detected") or {}


def write(root: Path | None = None, public: bool = True, closed: list[dict[str, Any]] | None = None,
          log: Any = print) -> dict[str, Any]:
    """Write countries.json for the current build into <cube>/years/ (and its public copy); returns it."""
    t0 = time.time()
    root = root or C.cube_dir()
    build = C.current_build(root)
    if build is None:
        raise C.CubeMissing(f"no build in {root}")
    man = json.loads((build / "manifest.json").read_text(encoding="utf-8"))
    n_months = int(man["n_months"])
    years = years_in(n_months)
    year_list = [y["year"] for y in years]
    closed = closed_cells(n_months) if closed is None else closed
    masks = closed_masks(closed)
    countries = sorted(man["countries_loaded"])

    # The counted series, one part at a time: each part must be the one the build was merged from.
    sums: dict[str, np.ndarray] = {}
    for c in countries:
        rec_path = parts_dir(root) / c / "records.npy"
        want = man["parts"][c]["records_sha256"]
        if _sha(rec_path) != want:
            raise RuntimeError(f"part {c}: records.npy is not the part build {man['build_id']} was merged from")
        sums[c] = _part_sums(np.load(rec_path), years, masks)
    delivering = np.load(build / "delivering.npy")
    first_year: dict[str, int | None] = {}
    for name, spec in SERIES.items():
        ms = np.nonzero(delivering[list(spec["platforms"])].any(axis=0))[0]
        first_year[name] = int(year_of_month(int(ms[0]))) if ms.size else None
    harm, harm_state, harm_detected = _harmonized(year_list, countries)

    shapes = atlas()
    matched = match_atlas(countries, shapes)
    out_countries: dict[str, Any] = {}
    for c in countries:
        shape = matched[c]
        entry: dict[str, Any] = {"name": c.replace("_", " "), "atlas": shape["name"] if shape else None,
                                 "atlas_id": shape.get("id") if shape else None}
        for j, name in enumerate(SERIES):
            fy = first_year[name]
            entry[name] = [None if fy is None or y < fy else int(sums[c][i, j]) for i, y in enumerate(year_list)]
        entry["harmonized"] = harm.get(c)
        out_countries[c] = entry
    by_atlas = {e["atlas"]: c for c, e in out_countries.items() if e["atlas"]}
    unmatched_store = {c: NO_SHAPE.get(c, "no atlas shape of this name") for c, e in out_countries.items()
                       if e["atlas"] is None}
    unmatched_atlas = {s["name"]: ATLAS_HELD_BY.get(s["name"]) for s in sorted(shapes, key=lambda s: s["name"])
                       if s["name"] not in by_atlas}

    # Summed over the countries, each year is the yearly layer's total (when years.json is of the same build).
    world = np.sum([sums[c] for c in countries], axis=0) if countries else np.zeros((len(years), len(SERIES)), np.int64)
    check: dict[str, Any] = {"world": {name: [None if first_year[name] is None or y < first_year[name]
                                              else int(world[i, j]) for i, y in enumerate(year_list)]
                                       for j, name in enumerate(SERIES)}}
    yj_path = years_dir(root) / "years.json"
    if yj_path.is_file():
        yj = json.loads(yj_path.read_text(encoding="utf-8"))
        if yj["source"]["cube_build"] == man["build_id"]:
            diffs = [f"{name}_{y}" for j, name in enumerate(SERIES) for i, y in enumerate(year_list)
                     if f"{name}_{y}" in yj["layers"] and int(yj["layers"][f"{name}_{y}"]["rows"]) != int(world[i, j])]
            check["equals_yearly_layers"] = not diffs
            check["differs"] = diffs
    if harm_detected:
        diffs = sorted(f"{c} {theirs}" for c in countries for theirs, ours in HARMONIZED_DETECTED.items()
                       if (harm_detected.get(c) or {}).get(theirs) != out_countries[c][ours])
        check["harmonized_detected_equal"] = not diffs
        check["harmonized_detected_differs"] = diffs
    info = {
        "version": VERSION,
        "what": "per country file of the store, per year, the fire detections its files hold",
        "source": {"cube_build": man["build_id"], "countries": len(countries),
                   "world_complete": man["world_complete"],
                   "atlas": "world-atlas 2.0.2, countries-50m.json, objects.countries, matched on properties.name"},
        "years": year_list,
        "first_year_partial": {"year": years[0]["year"], "months": years[0]["months"]} if years[0]["partial"] else None,
        "series": {**{name: {"what": spec["what"], "platforms": [C.PLATFORMS[p] for p in spec["platforms"]],
                             "first_year": first_year[name]} for name, spec in SERIES.items()},
                   "harmonized": harm_state},
        "values": ("one per year of `years`; null before the series' first year (or where the harmonized file gives "
                   "none), 0 in a year with no row"),
        "closed": {"rule": ("the cells the closed rule closes (cells meeting a test fire's region's context box, in "
                            "the years of its fire) are left out of every country's total, as the yearly layers "
                            "leave them out"),
                   "regions": [{"region_id": c["region_id"], "years": c["years"], "cells": len(c["cells"])}
                               for c in closed]},
        "countries": out_countries,
        "by_atlas": dict(sorted(by_atlas.items())),
        "unmatched": {"store": unmatched_store, "atlas": unmatched_atlas,
                      "atlas_note": ("an atlas shape with no store file of its own: the store file that holds "
                                     "the rows inside it, or null where no row of the store falls inside it")},
        "check": check,
        "seconds": None,
    }
    info["seconds"] = round(time.time() - t0, 1)
    out = countries_path(root)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name("." + NAME + ".tmp")
    tmp.write_text(json.dumps(info, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    tmp.replace(out)
    if public:
        pub = public_dir(root) / "years"
        pub.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(out, pub / NAME)
    log(f"countries: {len(countries)} written, {out.stat().st_size} bytes, {info['seconds']} s")
    return info


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("write")
    ap.parse_args(argv)
    info = write()
    print(json.dumps({"countries": info["source"]["countries"], "years": [info["years"][0], info["years"][-1]],
                      "harmonized": info["series"]["harmonized"]["state"], "check": info["check"],
                      "unmatched": info["unmatched"], "seconds": info["seconds"]}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
