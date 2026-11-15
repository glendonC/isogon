"""The README's figure: fire detections each year over the whole Earth, as the satellites counted and on one scale.

Drawn with Pillow alone from the yearly totals of `harmonize_years.py` (`totals.json`, its World rows):
- bars, the detections as counted: MODIS on Terra and Aqua before the first year of Suomi NPP, Suomi NPP's own from
  that year on;
- a line, the harmonized record (MODIS on Suomi NPP's scale, the dataset as served), joining whole years only;
- the step at the first year of Suomi NPP marked, with the Earth's factor: Suomi NPP's detections over Terra's and
  Aqua's, summed over the whole years both flew.

Every number drawn comes from the totals file. The numbers are also written into the picture's PNG text (key
`isogon:figure`) with the totals file's sha256, so a test can check the picture against the file. Colours are the
page's (`website/src/styles/system.css`); the words are the product lane's for the Earth's years.

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.harmonize_figure \
      [--totals <totals.json>] [--out <picture.png>]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo

FIGURE_VERSION = 1
TEXT_KEY = "isogon:figure"
AREA = "World"
DEFAULT_OUT = Path(__file__).resolve().parents[2] / "docs" / "detections-each-year.png"

WIDTH, HEIGHT = 1600, 960
SUPER = 2                       # drawn at twice the size and scaled down, so lines and text are smooth
GRID_STEP = 5e6                 # one grid line every 5 million detections
MILLION = 1e6

# The page's colours (website/src/styles/system.css).
NIGHT = (8, 11, 17)             # --sys-night
INK = (243, 244, 246)           # --sys-ink
INK_2 = (195, 200, 209)         # --sys-ink-2
INK_3 = (154, 161, 173)         # --sys-ink-3
RULE = (43, 48, 58)             # --sys-rule
GRID = (49, 53, 62)             # --sys-edge at 0.35 on the night, as the page's strip draws its grid
SHARP = (240, 138, 69)          # --sys-detection: the sharper instrument (VIIRS)
OLDER = (180, 195, 214)         # --sys-modis: the older instrument (MODIS)
BAR_OPACITY = 0.85              # the page's bars as counted

# The product lane's words for the Earth's years.
WORDS = {
    "title": "Detections each year, the whole Earth",
    "older": "Older satellites (MODIS)",
    "newer": "Newer satellite (VIIRS)",
    "line": "On one scale",
    "axis": "millions",
}


def default_totals() -> Path:
    from backend.model import harmonize_cells as C
    return C.world_dir() / "harmonize" / "years" / "totals.json"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def series(totals: dict[str, Any]) -> dict[str, Any]:
    """What the figure draws, read from the totals' World rows and nothing else."""
    rows = sorted((r for r in totals["rows"] if r["area"] == AREA), key=lambda r: r["year"])
    if not rows:
        raise ValueError(f"no {AREA} rows in the totals")
    sharp_from = min(r["year"] for r in rows if (r.get("months_suomi_npp") or 0) > 0)
    aqua = [r["year"] for r in rows if (r.get("months_aqua") or 0) > 0]
    years = []
    for r in rows:
        sharp = r["year"] >= sharp_from
        years.append({
            "year": int(r["year"]),
            "months": int(r["months"]),
            "partial": bool(r["partial"]),
            "sharp": sharp,
            "counted": r["suomi_npp_rows"] if sharp else r["modis_rows"],
            "harmonized": r["harmonized_rows"],
            "closed_cells_left_out": int(r.get("closed_cells_left_out") or 0),
        })
    both = [r for r in rows if r["year"] >= sharp_from and not r["partial"]
            and r.get("suomi_npp_rows") and r.get("modis_rows")]
    sharp_sum = sum(r["suomi_npp_rows"] for r in both)
    older_sum = sum(r["modis_rows"] for r in both)
    return {
        "area": AREA,
        "sharp_from": sharp_from,
        "aqua_from": min(aqua) if aqua else None,
        "factor": sharp_sum / older_sum if older_sum else None,
        "factor_years": [both[0]["year"], both[-1]["year"]] if both else None,
        "factor_rows": {"suomi_npp": sharp_sum, "modis": older_sum},
        "years": years,
    }


def _font(size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.load_default(size=round(size * SUPER))


def _wrap(text: str, font: ImageFont.FreeTypeFont, width: float) -> list[str]:
    lines: list[str] = []
    for word in text.split():
        if lines and font.getlength(f"{lines[-1]} {word}") <= width:
            lines[-1] = f"{lines[-1]} {word}"
        else:
            lines.append(word)
    return lines


def _blend(c: tuple[int, int, int], a: float) -> tuple[int, int, int]:
    return tuple(round(v * a + n * (1 - a)) for v, n in zip(c, NIGHT))


def notes(s: dict[str, Any]) -> list[str]:
    """The source and the years that are not like the others, said from the totals."""
    lo, hi = s["factor_years"]
    out = [
        "Source: NASA FIRMS fire detections (type 0) in every country's yearly files, summed over the whole Earth: "
        "MODIS on Terra and Aqua, VIIRS on Suomi NPP. On one scale: the harmonized record, docs/harmonization.md.",
    ]
    said = [f"About {s['factor']:.1f} times: Suomi NPP's detections over Terra's and Aqua's, summed over {lo} to {hi}."]
    for y in s["years"]:
        if y["partial"]:
            said.append(f"{y['year']} holds {y['months']} months.")
    if s["aqua_from"] is not None and s["aqua_from"] > s["years"][0]["year"]:
        said.append(f"Terra flew alone until Aqua joined in {s['aqua_from']}.")
    for y in s["years"]:
        if y["closed_cells_left_out"]:
            said.append(f"{y['year']} leaves out the {y['closed_cells_left_out']} squares around the closed test fires.")
    out.append(" ".join(said))
    return out


def draw(s: dict[str, Any], out: Path, totals_sha256: str | None = None) -> dict[str, Any]:
    """Draw the figure of `series` to `out` (PNG) and return what was written into its text."""
    k = SUPER
    img = Image.new("RGB", (WIDTH * k, HEIGHT * k), NIGHT)
    d = ImageDraw.Draw(img)
    f_title, f_key, f_note, f_tick, f_foot = _font(50), _font(26), _font(26), _font(23), _font(21)

    years = s["years"]
    n = len(years)
    top = max(max(y["counted"] or 0, y["harmonized"] or 0) for y in years)
    vmax = math.ceil(top / GRID_STEP) * GRID_STEP
    x0, x1, y0, y1 = 150, 1390, 236, 736
    band = (x1 - x0) / n

    def X(v: float) -> float:
        return v * k

    def ypx(v: float) -> float:
        return (y1 - (v / vmax) * (y1 - y0)) * k

    # Title and the key.
    d.text((X(96), X(44)), WORDS["title"], font=f_title, fill=INK)
    kx, ky = 96, 120
    for colour, word in ((OLDER, WORDS["older"]), (SHARP, WORDS["newer"])):
        d.rectangle([X(kx), X(ky + 6), X(kx + 18), X(ky + 24)], fill=_blend(colour, BAR_OPACITY))
        d.text((X(kx + 28), X(ky)), word, font=f_key, fill=INK_2)
        kx += 28 + f_key.getlength(word) / k + 48
    d.line([X(kx), X(ky + 15), X(kx + 32), X(ky + 15)], fill=INK, width=3 * k)
    d.rectangle([X(kx + 11), X(ky + 10), X(kx + 21), X(ky + 20)], fill=INK)
    d.text((X(kx + 42), X(ky)), WORDS["line"], font=f_key, fill=INK_2)

    # The grid, the axis in millions, the baseline.
    v = 0.0
    while v <= vmax + 1:
        yy = ypx(v)
        if v > 0:
            for xs in range(int(X(x0)), int(X(x1)), 10 * k):
                d.line([xs, yy, min(xs + 5 * k, X(x1)), yy], fill=GRID, width=k)
        label = f"{v / MILLION:.0f}"
        d.text((X(x0 - 16) - f_tick.getlength(label), yy - X(14)), label, font=f_tick, fill=INK_3)
        v += GRID_STEP
    d.text((X(x0 - 16) - f_tick.getlength(WORDS["axis"]), ypx(vmax) - X(50)), WORDS["axis"], font=f_tick, fill=INK_3)
    d.line([X(x0), ypx(0), X(x1), ypx(0)], fill=RULE, width=2 * k)

    # The bars, as counted.
    inset = 0.15
    for i, y in enumerate(years):
        if y["counted"] is None:
            continue
        bx0, bx1 = X(x0 + band * (i + inset)), X(x0 + band * (i + 1 - inset))
        by1 = ypx(0) - k
        by0 = min(ypx(y["counted"]), by1)
        colour = _blend(SHARP if y["sharp"] else OLDER, BAR_OPACITY)
        if y["partial"]:
            w, h = int(bx1 - bx0), max(int(by1 - by0), 1)
            mask = Image.new("L", (w, h), 0)
            md = ImageDraw.Draw(mask)
            for t in range(-h, w + h, 4 * k):
                md.line([t, h, t + h, 0], fill=255, width=2 * k)
            img.paste(colour, (int(bx0), int(by0), int(bx0) + w, int(by0) + h), mask)
        else:
            d.rectangle([bx0, by0, bx1, by1], fill=colour)

    # The step at the first year of Suomi NPP, with its words beside it.
    i_step = next(i for i, y in enumerate(years) if y["sharp"])
    xs = X(x0 + band * i_step)
    d.line([xs, ypx(0), xs, ypx(vmax) - X(6)], fill=INK, width=2 * k)
    words = [
        f"{s['sharp_from']}: the newer, sharper satellite begins and makes about {s['factor']:.1f} times as many "
        "detections of the same fires as the older ones.",
        "On one scale there is no step, because the older satellites' detections are put on its scale.",
    ]
    block_w = 540 * k
    lh = 34 * k
    paras = [_wrap(para, f_note, block_w) for para in words]
    bx = xs - X(22) - block_w
    by = ypx(vmax) + X(136)
    block_h = sum(len(p) for p in paras) * lh + (len(paras) - 1) * (lh // 2)
    d.rectangle([bx - X(10), by - X(6), bx + block_w + X(10), by + block_h], fill=NIGHT)  # the grid stops behind
    for lines in paras:
        for ln in lines:
            d.text((bx, by), ln, font=f_note, fill=INK)
            by += lh
        by += lh // 2

    # The line, on one scale: whole years joined, a partial year a hollow mark of its own.
    pts = [(X(x0 + band * (i + 0.5)), ypx(y["harmonized"])) for i, y in enumerate(years)
           if y["harmonized"] is not None and not y["partial"]]
    d.line(pts, fill=NIGHT, width=9 * k, joint="curve")
    d.line(pts, fill=INK, width=3 * k, joint="curve")
    for px, py in pts:
        d.rectangle([px - X(7), py - X(7), px + X(7), py + X(7)], fill=NIGHT)
        d.rectangle([px - X(5), py - X(5), px + X(5), py + X(5)], fill=INK)
    for i, y in enumerate(years):
        if y["partial"] and y["harmonized"] is not None:
            px, py = X(x0 + band * (i + 0.5)), ypx(y["harmonized"])
            d.rectangle([px - X(5), py - X(5), px + X(5), py + X(5)], fill=NIGHT, outline=INK, width=2 * k)
            label = f"{y['months']} months"
            lx0, ly0 = px - X(5), py - X(34)
            d.rectangle([lx0 - X(4), ly0, lx0 + f_foot.getlength(label) + X(4), ly0 + X(24)], fill=NIGHT)
            d.text((lx0, ly0), label, font=f_foot, fill=INK_3)
    lx, ly = pts[-1]
    d.text((lx + X(20), ly - X(16)), WORDS["line"], font=f_key, fill=INK)

    # The years.
    ticks = {years[0]["year"], years[-1]["year"], s["sharp_from"]} | {y["year"] for y in years if y["year"] % 5 == 0}
    for i, y in enumerate(years):
        if y["year"] not in ticks:
            continue
        label = str(y["year"])
        cx = X(x0 + band * (i + 0.5))
        d.text((cx - f_tick.getlength(label) / 2, ypx(0) + X(14)), label, font=f_tick,
               fill=INK if y["year"] == s["sharp_from"] else INK_3)

    # The source and the notes.
    fy = 796
    for para in notes(s):
        for ln in _wrap(para, f_foot, X(WIDTH - 2 * 96)):
            d.text((X(96), X(fy)), ln, font=f_foot, fill=INK_3)
            fy += 30
        fy += 6

    payload = {"figure_version": FIGURE_VERSION, "totals_sha256": totals_sha256, "series": s}
    info = PngInfo()
    info.add_text(TEXT_KEY, json.dumps(payload, sort_keys=True, separators=(",", ":")))
    out.parent.mkdir(parents=True, exist_ok=True)
    img.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS).save(out, pnginfo=info, optimize=True)
    return payload


def read_payload(png: Path) -> dict[str, Any]:
    with Image.open(png) as im:
        return json.loads(im.text[TEXT_KEY])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--totals", type=Path, default=None, help="totals.json of harmonize_years (default: the world's)")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    a = ap.parse_args(argv)
    path = a.totals or default_totals()
    s = series(json.loads(path.read_text()))
    draw(s, a.out, sha256_of(path))
    print(json.dumps({"out": a.out.name, "sha256": sha256_of(a.out), "bytes": a.out.stat().st_size,
                      "totals_sha256": sha256_of(path), "factor": round(s["factor"], 4)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
