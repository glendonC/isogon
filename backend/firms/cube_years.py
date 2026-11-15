"""Yearly layers of the fire cube: per year, fire rows per cell as MODIS and as VIIRS detected them, on one scale per
family through all its years, so the Earth can play the years 2000 to 2025.

Families: `modis` (Terra and Aqua together), `viirs` (Suomi NPP alone, so a brighter year is more fire, not a second
satellite), and `harmonized` (the harmonize lane's layer, read from its own folder when it is there, on the Suomi NPP
scale). Each year is a float32 (720, 1440) array on the cube's grid (NaN where not loaded or closed) and an 8 bit
indexed PNG with one palette per family. The archive ends with its last country file month (2025-12): a year not
whole at the end, and every month after the archive, are left out. The first year, 2000, holds November and December
only and says so. Cells the closed rule closes (backend/model/training.py, `closed_for`) hold no value in their
closed years.

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/firms/cube_years.py write
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time
from typing import Any

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms import cube as C  # noqa: E402
from backend.firms.cube_build import RAMP  # noqa: E402
from backend.firms.cube_public import closed_cells, public_dir  # noqa: E402

VERSION: int = 1
FAMILIES: dict[str, dict[str, Any]] = {
    "modis": {"platforms": (0, 1), "scale": "modis",
              "what": "fire rows (FIRMS type 0, day and night) of Terra and Aqua together"},
    "viirs": {"platforms": (2,), "scale": "suomi_npp",
              "what": "fire rows (FIRMS type 0, day and night) of Suomi NPP alone"},
}
# A family drawn again on another family's scale: same arrays, its own PNGs.
ALSO_DRAWN: dict[str, dict[str, Any]] = {
    "modis_on_snpp": {"from": "modis", "scale": "suomi_npp",
                      "what": ("the modis family's arrays (Terra and Aqua fire rows) drawn on the Suomi NPP scale, so one "
                               "view can go from MODIS to Suomi NPP and show the step between the instruments in 2012")},
}
HARMONIZED: dict[str, Any] = {"scale": "suomi_npp",
                              "what": "the harmonize lane's harmonized fire rows on the Suomi NPP scale"}
INDEX_NOT_LOADED, INDEX_NO_ROWS, INDEX_CLOSED, INDEX_RAMP0 = 0, 1, 2, 3
PALETTE_SPECIAL: tuple[tuple[int, int, int, int], ...] = ((0, 0, 0, 0), (128, 128, 128, 70), (90, 110, 140, 200))


def years_dir(root: Path | None = None) -> Path:
    return (root or C.cube_dir()) / "years"


def harmonized_dir() -> Path:
    return C.world_dir() / "harmonize" / "years"


def _sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def year_of_month(m: np.ndarray | int) -> Any:
    return C.FIRST_YEAR + (np.asarray(m) + C.FIRST_MONTH - 1) // 12


def years_in(n_months: int) -> list[dict[str, Any]]:
    """The years of the archive: the first may be partial (said); a last year not whole is left out."""
    out = []
    for y in range(C.FIRST_YEAR, int(year_of_month(n_months - 1)) + 1):
        months = [m for m in range(n_months) if int(year_of_month(m)) == y]
        whole = len(months) == 12
        if not whole and y != C.FIRST_YEAR:
            continue
        out.append({"year": y, "months": len(months), "partial": not whole,
                    "first_month": C.month_label(months[0]), "last_month": C.month_label(months[-1])})
    return out


def palette() -> tuple[list[int], bytes]:
    """(RGB palette of 256 entries, alpha per entry): the special indices, then the ramp from low to high."""
    n = 256 - INDEX_RAMP0
    ramp = np.array(RAMP, dtype=np.float64)
    x = np.linspace(0, len(RAMP) - 1, n)
    i = np.clip(np.floor(x).astype(int), 0, len(RAMP) - 2)
    rgb = np.round(ramp[i] * (1 - (x - i))[:, None] + ramp[i + 1] * (x - i)[:, None]).astype(int)
    pal, alpha = [], []
    for r, g, b, a in PALETTE_SPECIAL:
        pal += [r, g, b]
        alpha.append(a)
    for r, g, b in rgb.tolist():
        pal += [r, g, b]
        alpha.append(255)
    return pal, bytes(alpha)


def to_index(arr: np.ndarray, closed: np.ndarray, vmax: float) -> tuple[np.ndarray, int]:
    """(index image, cells clipped at the top) of a layer: NaN not loaded, 0 no rows, closed cells, then the ramp."""
    idx = np.full(arr.shape, INDEX_NOT_LOADED, dtype=np.uint8)
    v = np.nan_to_num(arr, nan=-1.0)
    idx[v == 0] = INDEX_NO_ROWS
    has = v > 0
    t = np.log10(1.0 + v[has]) / np.log10(1.0 + vmax) if vmax > 0 else np.zeros(int(has.sum()))
    clipped = int((t > 1).sum())
    n = 256 - INDEX_RAMP0
    idx[has] = (INDEX_RAMP0 + np.clip(np.floor(t * n), 0, n - 1)).astype(np.uint8)
    idx[closed] = INDEX_CLOSED
    return idx, clipped


def _write_png(path: Path, idx: np.ndarray) -> None:
    from PIL import Image

    pal, alpha = palette()
    im = Image.fromarray(idx, mode="P")
    im.putpalette(pal)
    tmp = path.with_name("." + path.name + ".tmp")
    im.save(tmp, format="PNG", optimize=True, transparency=alpha)
    tmp.replace(path)


def _write_npy(path: Path, arr: np.ndarray) -> None:
    tmp = path.with_name("." + path.name + ".tmp")
    with tmp.open("wb") as fh:
        np.save(fh, arr.astype("<f4"))
    tmp.replace(path)


def write(root: Path | None = None, out: Path | None = None, public: bool = True, log: Any = print) -> dict[str, Any]:
    """Write every yearly layer of the current build into `out` (default <cube>/years/), and the PNGs with
    years.json into the public folder; returns years.json."""
    from backend.firms.cube_public import fire_table

    t0 = time.time()
    root = root or C.cube_dir()
    build = C.current_build(root)
    if build is None:
        raise C.CubeMissing(f"no build in {root}")
    out = out or years_dir(root)
    out.mkdir(parents=True, exist_ok=True)
    man_b = json.loads((build / "manifest.json").read_text(encoding="utf-8"))
    cell, month, rows, n_months = fire_table(build)
    years = years_in(n_months)
    loaded = np.load(build / "loaded.npy").reshape(-1) > 0
    delivering = np.load(build / "delivering.npy")
    for y in years:
        ms = [m for m in range(n_months) if int(year_of_month(m)) == y["year"]]
        y["platform_months"] = {C.PLATFORMS[p]: int(delivering[p, ms].sum()) for p in range(len(C.PLATFORMS))}
    closed = closed_cells(n_months)
    closed_by_year: dict[int, np.ndarray] = {}
    for c in closed:
        if not c["months"]:
            continue
        for y in sorted({int(year_of_month(m)) for m in range(c["months"][0], c["months"][1] + 1)}):
            mask = closed_by_year.setdefault(y, np.zeros(C.N_CELLS, dtype=bool))
            mask[np.array(c["cells"], dtype=np.int64)] = True
    yidx = {y["year"]: i for i, y in enumerate(years)}   # the years are consecutive
    yi = year_of_month(month) - years[0]["year"]
    keep = (yi >= 0) & (yi < len(years))
    grids: dict[str, np.ndarray] = {}
    for fam, spec in FAMILIES.items():
        w = rows[:, list(spec["platforms"])].sum(axis=1)
        sel = keep & (w > 0)
        grids[fam] = np.bincount(yi[sel] * C.N_CELLS + cell[sel], weights=w[sel].astype(np.float64),
                                 minlength=len(years) * C.N_CELLS).reshape(len(years), C.N_CELLS)
    log(f"yearly sums: {len(years)} years, {time.time() - t0:.1f} s")

    # Harmonized, from the harmonize lane's folder when it is there.
    hdir = harmonized_dir()
    hman = json.loads((hdir / "harmonized.json").read_text(encoding="utf-8")) if (hdir / "harmonized.json").is_file() else None

    def first_year(fam: str) -> int | None:
        g = grids[fam]
        nz = np.nonzero(g.sum(axis=1) > 0)[0]
        return years[int(nz[0])]["year"] if nz.size else None

    starts = {fam: first_year(fam) for fam in FAMILIES}
    scales: dict[str, dict[str, Any]] = {}
    for fam, spec in FAMILIES.items():
        g = grids[fam].copy()
        for y, mask in closed_by_year.items():
            if y in yidx:
                g[yidx[y], mask] = 0
        sc = scales.setdefault(spec["scale"], {"vmax": 0.0, "from": []})
        sc["vmax"] = max(sc["vmax"], float(g.max()))
        sc["from"].append(fam)
    for sc in scales.values():
        sc["rule"] = "t = log10(1 + v) / log10(1 + vmax), clipped to 0..1; index = 3 + floor(t * 253), at most 255"

    layers: dict[str, dict[str, Any]] = {}
    for fam, spec in FAMILIES.items():
        vmax = scales[spec["scale"]]["vmax"]
        for y in years:
            if starts[fam] is None or y["year"] < starts[fam]:
                continue
            i = yidx[y["year"]]
            arr = grids[fam][i].astype(np.float32)
            arr[~loaded] = np.nan
            cmask = closed_by_year.get(y["year"], np.zeros(C.N_CELLS, dtype=bool))
            arr[cmask] = np.nan
            name = f"{fam}_{y['year']}"
            _write_npy(out / f"{name}.npy", arr.reshape(C.N_ROWS, C.N_COLS))
            idx, clipped = to_index(arr.reshape(C.N_ROWS, C.N_COLS), cmask.reshape(C.N_ROWS, C.N_COLS), vmax)
            _write_png(out / f"{name}.png", idx)
            layers[name] = {"family": fam, "year": y["year"], "scale": spec["scale"],
                            "rows": int(np.nansum(arr)), "cells_with_rows": int(np.nansum(arr > 0)),
                            "max_cell": float(np.nanmax(arr)) if np.isfinite(arr).any() else 0.0,
                            "closed_cells": int(cmask.sum()), "clipped_cells": clipped,
                            "npy": f"{name}.npy", "npy_sha256": _sha(out / f"{name}.npy"),
                            "png": f"{name}.png", "png_sha256": _sha(out / f"{name}.png"),
                            "png_bytes": (out / f"{name}.png").stat().st_size}
            for also, aspec in ALSO_DRAWN.items():
                if aspec["from"] != fam:
                    continue
                aname = f"{also}_{y['year']}"
                aidx, aclipped = to_index(arr.reshape(C.N_ROWS, C.N_COLS), cmask.reshape(C.N_ROWS, C.N_COLS),
                                          scales[aspec["scale"]]["vmax"])
                _write_png(out / f"{aname}.png", aidx)
                layers[aname] = {**layers[name], "family": also, "scale": aspec["scale"], "clipped_cells": aclipped,
                                 "png": f"{aname}.png", "png_sha256": _sha(out / f"{aname}.png"),
                                 "png_bytes": (out / f"{aname}.png").stat().st_size,
                                 "npy_note": f"the same array as {name}"}
    harmonized_state = "not written yet"
    if hman is not None:
        harmonized_state = "drawn from the harmonize lane's folder"
        vmax = scales["suomi_npp"]["vmax"]
        for y in years:
            src = hdir / f"harmonized_{y['year']}.npy"
            if not src.is_file():
                continue
            arr = np.load(src).astype(np.float32).reshape(-1)
            cmask = closed_by_year.get(y["year"], np.zeros(C.N_CELLS, dtype=bool))
            arr[cmask] = np.nan
            name = f"harmonized_{y['year']}"
            _write_npy(out / f"{name}.npy", arr.reshape(C.N_ROWS, C.N_COLS))
            idx, clipped = to_index(arr.reshape(C.N_ROWS, C.N_COLS), cmask.reshape(C.N_ROWS, C.N_COLS), vmax)
            _write_png(out / f"{name}.png", idx)
            layers[name] = {"family": "harmonized", "year": y["year"], "scale": "suomi_npp",
                            "rows": float(np.nansum(arr)), "cells_with_rows": int(np.nansum(arr > 0)),
                            "max_cell": float(np.nanmax(arr)) if np.isfinite(arr).any() else 0.0,
                            "closed_cells": int(cmask.sum()), "clipped_cells": clipped,
                            "source_sha256": _sha(src),
                            "npy": f"{name}.npy", "npy_sha256": _sha(out / f"{name}.npy"),
                            "png": f"{name}.png", "png_sha256": _sha(out / f"{name}.png"),
                            "png_bytes": (out / f"{name}.png").stat().st_size}
    pal, alpha = palette()
    info = {
        "version": VERSION,
        "what": "per year, fire rows per cell of the fire cube's grid, one scale per family through all its years",
        "source": {"cube_build": man_b["build_id"], "countries": len(man_b["countries_loaded"]),
                   "world_complete": man_b["world_complete"]},
        "grid": {"shape": [C.N_ROWS, C.N_COLS], "step_deg": C.STEP_DEG, "north_up": True,
                 "row_0": "the band from 89.75 to 90 N", "col_0": "the band from 180 W to 179.75 W"},
        "years": years,
        "left_out": {"after_the_archive": (f"every month after {C.month_label(n_months - 1)}, the last month of the "
                                           "FIRMS country yearly files: near real time rows from the FIRMS area API, "
                                           "which needs a key, have no type column and are not in the cube"),
                     "not_whole": "a year not whole at the end of the archive (2026 holds no month of the archive)"},
        "families": {**{fam: {"what": spec["what"], "scale": spec["scale"], "platforms": [C.PLATFORMS[p] for p in spec["platforms"]],
                              "first_year": starts[fam]} for fam, spec in FAMILIES.items()},
                     **{also: {"what": a["what"], "scale": a["scale"], "arrays_of": a["from"],
                               "platforms": [C.PLATFORMS[p] for p in FAMILIES[a["from"]]["platforms"]],
                               "first_year": starts[a["from"]]} for also, a in ALSO_DRAWN.items()},
                     "harmonized": {**HARMONIZED, "state": harmonized_state,
                                    "folder": "<world>/harmonize/years/ (harmonized_<year>.npy, harmonized.json)",
                                    "source": hman}},
        "scales": scales,
        "png": {"mode": "8 bit indexed with transparency, one pixel per cell, north up",
                "indices": {"0": "not loaded (transparent)", "1": "loaded, no fire row (grey)",
                            "2": "closed by the closed rule (slate)", "3..255": "the ramp, low to high"},
                "palette_rgb": [pal[i:i + 3] for i in range(0, len(pal), 3)], "alpha": list(alpha)},
        "npy": "float32 (720, 1440), little endian; NaN where not loaded or closed, 0 where loaded with no fire row",
        "closed": [{"region_id": c["region_id"], "years": c["years"], "cells": len(c["cells"])} for c in closed],
        "closed_rule": "cells meeting a test fire's region's context box, in the years of its fire, hold no value",
        "layers": layers,
        "seconds": None,
    }
    info["seconds"] = round(time.time() - t0, 1)
    tmp = out / ".years.json.tmp"
    tmp.write_text(json.dumps(info, indent=1) + "\n", encoding="utf-8")
    tmp.replace(out / "years.json")
    if public:
        pub = public_dir(root) / "years"
        pub.mkdir(parents=True, exist_ok=True)
        for spec in layers.values():
            shutil.copyfile(out / spec["png"], pub / spec["png"])
        shutil.copyfile(out / "years.json", pub / "years.json")
        for p in pub.glob("*.png"):
            if p.stem not in layers:
                os.remove(p)
    log(f"yearly layers: {len(layers)} written, {sum(s['png_bytes'] for s in layers.values())} bytes of PNG, "
        f"{info['seconds']} s")
    return info


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("write")
    ap.parse_args(argv)
    info = write()
    print(json.dumps({"years": [y["year"] for y in info["years"]], "scales": info["scales"],
                      "layers": len(info["layers"]), "seconds": info["seconds"]}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
