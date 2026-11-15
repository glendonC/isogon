"""A picture of the Earth for the README: small Earths from the yearly layers, 2011 and 2012 as the satellites
counted them and on one scale, so the step of 2012 shows in one row and is gone in the other.

As the satellites counted: 2011 from the older satellites (`modis_on_snpp_2011`, Terra and Aqua drawn on the Suomi
NPP scale) and 2012 from the newer one (`viirs_2012`, Suomi NPP alone). On one scale: the harmonized layer for the
same two years, read from `<world>/harmonize/years/`, where the yearly writer reads it, with the closed rule
applied. One scale for all of them, the yearly layers' Suomi NPP scale (`years.json`), the world layers' ramp, on the
page's sea and land colours. A pixel of the picture covers one or two cells of the cube's grid each way and shows
the largest cell-year under it. The picture spans 84 N to 60 S; the fire rows beyond it are counted in what the
script prints.

Usage:
  ISOGON_WORLD_DIR=<world> uv run --no-project --python 3.12 --with numpy --with pillow \
      python3 backend/firms/cube_figure.py write [--out docs/earth-2011-2012.png]
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms import cube as C  # noqa: E402
from backend.firms import cube_years as Y  # noqa: E402
from backend.firms.cube_public import closed_cells  # noqa: E402

OUT_NAME = "earth-2011-2012.png"
SCALE = "suomi_npp"
VIEWS: tuple[str, ...] = ("As the satellites counted", "On one scale")
# The layers drawn, row by row (`view`), each with the line under it.
PANELS: tuple[dict[str, Any], ...] = (
    {"layer": "modis_on_snpp_2011", "view": 0, "line": "Counted by the older satellites (MODIS)"},
    {"layer": "viirs_2012", "view": 0, "line": "Counted by the newer, sharper satellite (VIIRS)"},
    {"layer": "harmonized_2011", "view": 1, "line": "On the newer satellite's scale"},
    {"layer": "harmonized_2012", "view": 1, "line": "On the newer satellite's scale"},
)
LEGEND = "Fire detections in a square of a quarter degree, about 28 km, in the year, on one scale for all four"
TICKS: tuple[int, ...] = (1, 10, 100, 1000, 10000)
NORTH, SOUTH = 84.0, -60.0
PANEL_W, MARGIN, GUTTER = 864, 24, 24

SEA = (8, 11, 17)            # the page's sea (website/src/world/WorldCanvas.tsx)
LAND = (22, 26, 34)          # the page's loaded land
GROUND = (13, 16, 23)
FRAME = (44, 50, 62)
INK_YEAR, INK_VIEW, INK_LINE, INK_LEGEND = (243, 244, 246), (214, 218, 226), (178, 184, 194), (150, 157, 168)


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _font(size: int) -> Any:
    from PIL import ImageFont

    return ImageFont.load_default(size=size)   # Pillow's own scalable font, the same on every machine


def colours() -> np.ndarray:
    """RGB for each index of a yearly layer: not loaded is sea, no fire row is land, closed is slate over land,
    then the ramp."""
    pal, _alpha = Y.palette()
    lut = np.array(pal, dtype=np.float64).reshape(256, 3)
    lut[Y.INDEX_NOT_LOADED] = SEA
    lut[Y.INDEX_NO_ROWS] = LAND
    a = Y.PALETTE_SPECIAL[Y.INDEX_CLOSED][3] / 255
    lut[Y.INDEX_CLOSED] = np.array(Y.PALETTE_SPECIAL[Y.INDEX_CLOSED][:3]) * a + np.array(LAND) * (1 - a)
    return np.round(lut).astype(np.uint8)


def starts(n: int, width: int) -> np.ndarray:
    """The first source cell of each of `width` pixels across `n` cells (one or two cells a pixel)."""
    return np.floor(np.arange(width) * (n / width)).astype(np.int64)


def pixel_of(cell: int, first: np.ndarray) -> int:
    """The pixel a source cell falls in, given each pixel's first cell."""
    return int(np.searchsorted(first, cell, side="right") - 1)


def crop_rows() -> tuple[int, int]:
    return int(C.row_of(NORTH - 1e-9)), int(C.row_of(SOUTH + 1e-9)) + 1


def pooled(arr: np.ndarray, width: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(picture of `arr` cropped to the span, each pixel the largest cell under it, NaN only where every cell is
    NaN; first row of each pixel row; first column of each pixel column)."""
    r0, r1 = crop_rows()
    a = arr[r0:r1]
    cs = starts(a.shape[1], width)
    rs = starts(a.shape[0], int(round(a.shape[0] * width / a.shape[1])))
    out = np.fmax.reduceat(np.fmax.reduceat(a, rs, axis=0), cs, axis=1)
    return out, rs + r0, cs


def layer_array(name: str, info: dict[str, Any], years_folder: Path, harmonized_folder: Path,
                masks: dict[int, np.ndarray]) -> tuple[np.ndarray, Path]:
    """(array, file read) of a named layer: the harmonized from its own folder with the closed rule applied, the
    others from the yearly writer's folder by the file name years.json gives."""
    if name not in info["layers"]:
        raise KeyError(f"{name} is not a layer of years.json")
    spec = info["layers"][name]
    if spec["family"] == "harmonized":
        src = harmonized_folder / f"{name}.npy"
        if not src.is_file():
            raise FileNotFoundError(f"{name}.npy is not in {harmonized_folder}")
        arr = np.load(src).astype(np.float32)
        mask = masks.get(int(spec["year"]))
        if mask is not None:
            arr.reshape(-1)[mask] = np.nan
        return arr, src
    src = years_folder / spec["npy"]
    return np.load(src).astype(np.float32), src


def draw(panels: tuple[dict[str, Any], ...] = PANELS, years_folder: Path | None = None,
         harmonized_folder: Path | None = None, panel_w: int = PANEL_W) -> tuple[Any, dict[str, Any]]:
    """(the picture, what it drew): every named layer on the one scale, in rows by view."""
    from PIL import Image, ImageDraw

    years_folder = years_folder or Y.years_dir()
    harmonized_folder = harmonized_folder or Y.harmonized_dir()
    info = json.loads((years_folder / "years.json").read_text(encoding="utf-8"))
    vmax = float(info["scales"][SCALE]["vmax"])
    lut = colours()
    masks = Y.closed_masks(closed_cells(sum(y["months"] for y in info["years"])))
    views = sorted({p["view"] for p in panels})
    cols = max(sum(1 for p in panels if p["view"] == v) for v in views)
    f_year, f_view, f_line, f_tick = _font(72), _font(34), _font(28), _font(22)
    r0, r1 = crop_rows()
    panel_h = int(round((r1 - r0) * panel_w / C.N_COLS))
    head_h, line_h, gap = 52, 50, 20
    row_h = head_h + panel_h + line_h
    legend_h = 72
    width = 2 * MARGIN + cols * panel_w + (cols - 1) * GUTTER
    height = 2 * MARGIN + len(views) * row_h + (len(views) - 1) * gap + legend_h
    im = Image.new("RGB", (width, height), GROUND)
    d = ImageDraw.Draw(im)
    drawn: list[dict[str, Any]] = []
    for vi, v in enumerate(views):
        top = MARGIN + vi * (row_h + gap)
        d.text((MARGIN, top + 4), VIEWS[v], font=f_view, fill=INK_VIEW)
        for ci, p in enumerate(q for q in panels if q["view"] == v):
            spec = info["layers"].get(p["layer"])
            if spec is None:
                raise KeyError(f"{p['layer']} is not a layer of years.json")
            if spec["scale"] != SCALE:
                raise ValueError(f"{p['layer']} is on the {spec['scale']} scale, not {SCALE}")
            arr, src = layer_array(p["layer"], info, years_folder, harmonized_folder, masks)
            pic, rs, cs = pooled(arr, panel_w)
            closed = np.zeros(pic.shape, dtype=bool)
            mask = masks.get(int(spec["year"]))
            if mask is not None:
                m = mask.reshape(C.N_ROWS, C.N_COLS)[r0:r1].astype(np.uint8)
                closed = np.maximum.reduceat(np.maximum.reduceat(m, rs - r0, axis=0), cs, axis=1) > 0
                closed &= ~(np.nan_to_num(pic, nan=-1.0) > 0)
            idx, clipped = Y.to_index(pic, closed, vmax)
            x0, y0 = MARGIN + ci * (panel_w + GUTTER), top + head_h
            im.paste(Image.fromarray(lut[idx], mode="RGB"), (x0, y0))
            d.rectangle((x0 - 1, y0 - 1, x0 + panel_w, y0 + pic.shape[0]), outline=FRAME)
            year = str(spec["year"])
            yb = d.textbbox((0, 0), year, font=f_year)
            d.text((x0 + 18 - yb[0], y0 + pic.shape[0] - 16 - yb[3]), year, font=f_year, fill=INK_YEAR)
            d.text((x0, y0 + pic.shape[0] + 10), p["line"], font=f_line, fill=INK_LINE)
            full = np.nan_to_num(arr)
            drawn.append({"layer": p["layer"], "view": VIEWS[v], "line": p["line"], "year": int(spec["year"]),
                          "family": spec["family"], "file": src.name, "file_sha256": _sha(src),
                          "rows": float(full.sum()),
                          "rows_beyond_picture": float(full.sum() - full[r0:r1].sum()),
                          "max_cell": float(np.nanmax(arr)) if np.isfinite(arr).any() else 0.0,
                          "pixels_with_fire": int((idx >= Y.INDEX_RAMP0).sum()), "clipped_pixels": clipped,
                          "box": [x0, y0, panel_w, int(pic.shape[0])], "row_starts": rs.tolist(),
                          "col_starts": cs.tolist()})
            if spec["family"] == "harmonized":
                drawn[-1]["same_file_as_years_json"] = spec.get("source_sha256") == drawn[-1]["file_sha256"]
    # The one scale: the ramp from 1 detection to the scale's top, ticked at powers of ten.
    bar_w, bar_h = 560, 14
    bx, by = MARGIN, height - MARGIN - legend_h + 22
    t = np.linspace(0, 1, bar_w)
    bar = lut[(Y.INDEX_RAMP0 + np.clip(np.floor(t * (256 - Y.INDEX_RAMP0)), 0, 255 - Y.INDEX_RAMP0)).astype(int)]
    im.paste(Image.fromarray(np.repeat(bar[None], bar_h, axis=0).astype(np.uint8), mode="RGB"), (bx, by))
    for v in TICKS:
        x = bx + int(round(np.log10(1 + v) / np.log10(1 + vmax) * (bar_w - 1)))
        d.line((x, by + bar_h, x, by + bar_h + 5), fill=INK_LEGEND)
        label = f"{v:,}"
        lb = d.textbbox((0, 0), label, font=f_tick)
        d.text((x - (lb[2] - lb[0]) // 2, by + bar_h + 7), label, font=f_tick, fill=INK_LEGEND)
    d.text((bx + bar_w + 28, by - 7), LEGEND, font=f_tick, fill=INK_LEGEND)
    what = {"size": [width, height], "scale": SCALE, "vmax": vmax, "span": [NORTH, SOUTH],
            "cube_build": info["source"]["cube_build"], "panels": drawn}
    return im, what


def write(out: Path | None = None, **kw: Any) -> dict[str, Any]:
    out = out or _REPO_ROOT / "docs" / OUT_NAME
    im, what = draw(**kw)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name("." + out.name + ".tmp")
    im.save(tmp, format="PNG", optimize=True)
    tmp.replace(out)
    what["bytes"] = out.stat().st_size
    what["sha256"] = _sha(out)
    return what


def _main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("write")
    w.add_argument("--out", type=Path, default=None)
    args = ap.parse_args(argv)
    what = write(args.out)
    for p in what["panels"]:
        for k in ("box", "row_starts", "col_starts"):
            p.pop(k)
    print(json.dumps(what, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
