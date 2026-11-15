"""World maps of the harmonization on the fire cube's grid, as arrays and PNGs.

Each map is a (720, 1440) float32 array on the cube's grid (a quarter degree, north up, row 0 the northern band),
painted from places of `PLACE_DEG` degrees, the size the decision was made at: every cell of a place carries the
place's value. A cell the cube has not loaded, or a place with too few rows to say, is nan in the array and
transparent in the PNG. The PNGs are one pixel per cell, written with the standard library.

  factor              Suomi NPP rows over MODIS rows over every clean overlap month, the place's own ratio
                      (places with at least MIN_MODIS_ROWS MODIS rows)
  factor_pooled       the same ratio leaning on the 8 neighbouring places and the latitude band (every place)
  error_in_use        held-out monthly error with the method in use: sum of |predicted - observed| over sum of
                      observed, every overlap year left out in turn (places with at least MIN_SNPP_ROWS rows)
  error_none          the same with no correction (MODIS rows as they are)
  interval_coverage   share of held-out months with a prediction of one row or more whose Suomi NPP count lies
                      inside the 80 percent interval, the interval set from other years' errors (places with at
                      least MIN_TESTED_MONTHS such months)

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.model.harmonize_maps --out <folder>
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct
import zlib
from typing import Any

import numpy as np

from backend.model import harmonize as H
from backend.model import harmonize_cells as C
from backend.model import harmonize_eval as E
from backend.model import harmonize_places as PL

PLACE_DEG: float = PL.PLACE_DEG
MIN_MODIS_ROWS: float = 30.0
MIN_SNPP_ROWS: float = 50.0
MIN_TESTED_MONTHS: int = 12

# One hue light to dark for a magnitude; two hues with a gray midpoint for coverage around its level.
BLUE: tuple[str, ...] = ("#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b")
ORANGE: tuple[str, ...] = ("#fde4d6", "#f9bd9c", "#f39566", "#eb6834", "#c4501f", "#943b15", "#62270d")
DIVERGING: tuple[str, ...] = ("#a3262a", "#d5504f", "#ec9b95", "#f0efec", "#9ec5f4", "#3987e5", "#184f95")


def _rgb(h: str) -> tuple[int, int, int]:
    return int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)


def colour(values: np.ndarray, stops: tuple[str, ...], vmin: float, vmax: float, log: bool = False) -> np.ndarray:
    """RGBA uint8 by linear interpolation between evenly spaced stops; nan is transparent."""
    v = np.asarray(values, dtype=np.float64)
    ok = np.isfinite(v)
    x = np.where(ok, v, vmin)
    if log:
        x, lo, hi = np.log(np.maximum(x, 1e-12)), np.log(vmin), np.log(vmax)
    else:
        lo, hi = vmin, vmax
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0) * (len(stops) - 1)
    i = np.minimum(np.floor(t).astype(int), len(stops) - 2)
    f = (t - i)[..., None]
    pal = np.array([_rgb(s) for s in stops], dtype=np.float64)
    rgb = pal[i] * (1 - f) + pal[i + 1] * f
    out = np.zeros(v.shape + (4,), dtype=np.uint8)
    out[..., :3] = np.round(rgb).astype(np.uint8)
    out[..., 3] = np.where(ok, 255, 0)
    return out


def write_png(path: Path, rgba: np.ndarray) -> str:
    """An 8-bit RGBA PNG from an (h, w, 4) uint8 array. Returns its sha256."""
    h, w, _ = rgba.shape
    raw = b"".join(b"\x00" + rgba[r].tobytes() for r in range(h))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    path.write_bytes(data)
    return hashlib.sha256(data).hexdigest()


def paint(tab: dict[str, Any], value: np.ndarray, loaded: np.ndarray | None) -> np.ndarray:
    """(720, 1440) float32 with every cell of each place set to the place's value, nan where not loaded."""
    f = int(round(tab["deg"] / C.CELL_DEG))
    out = np.full((C.N_LAT, C.N_LON), np.nan, dtype=np.float32)
    j0 = np.round((tab["lat0"] + 90.0) / C.CELL_DEG).astype(int)
    c0 = np.round((tab["lon0"] + 180.0) / C.CELL_DEG).astype(int)
    for p in np.flatnonzero(np.isfinite(value)):
        rows = slice(C.N_LAT - (j0[p] + f), C.N_LAT - j0[p])
        out[rows, c0[p]:c0[p] + f] = value[p]
    if loaded is not None:
        out[loaded == 0] = np.nan
    return out


def place_values(source: str = "cube", place_deg: float = PLACE_DEG) -> tuple[dict[str, Any], dict[str, np.ndarray], dict[str, Any]]:
    tab, pm, read = E.load_source(source, place_deg)
    X, months = tab["channels"], tab["months"]
    clean, sharp, info = E.clean_months(months, pm)
    places = E.places_of(tab)
    years = np.arange(2012, 2026)
    closed = E.closed_year_mask(tab, years)
    yr = H._year(months)
    V = X["n_S_D"] + X["n_S_N"]
    M = H._plain_modis(X, "n")
    sV, sM = V[:, clean].sum(axis=1), M[:, clean].sum(axis=1)
    vals: dict[str, np.ndarray] = {}
    with np.errstate(invalid="ignore", divide="ignore"):
        vals["factor"] = np.where(sM >= MIN_MODIS_ROWS, sV / np.where(sM > 0, sM, 1.0), np.nan)
    vals["factor_pooled"] = H.place_ratio(sV, sM, places, True, H.PSEUDO_ROWS)[0]
    any_rows = (sV + sM) > 0
    scored = clean[None, :] & ~closed[:, np.searchsorted(years, yr)]
    pred_use = H.held_out(X, months, clean, H.SPEC_BY_NAME["in_use"], places, "n", 1.0, sharp)
    pred_none = H.predict_none(X, "n")
    obs_sum = np.where(scored, V, 0.0).sum(axis=1)
    for name, pred in (("error_in_use", pred_use), ("error_none", pred_none)):
        e = np.where(scored & np.isfinite(pred), np.abs(pred - V), 0.0).sum(axis=1)
        with np.errstate(invalid="ignore", divide="ignore"):
            vals[name] = np.where(obs_sum >= MIN_SNPP_ROWS, e / np.where(obs_sum > 0, obs_sum, 1.0), np.nan)
    inside_m, m_valid, *_ = E.interval_inside(pred_use, V, months, clean, closed, years, any_rows, 1.0,
                                              by=places.band)
    tested = m_valid & (np.nan_to_num(pred_use) >= 1.0)
    n_t = tested.sum(axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        vals["interval_coverage"] = np.where(n_t >= MIN_TESTED_MONTHS, (inside_m & tested).sum(axis=1) / np.maximum(n_t, 1), np.nan)
    meta = {**read, "place_deg": place_deg, "places": int(tab["lat0"].size), "clean_months": info["clean_months"],
            "closed_place_years": int(closed.sum())}
    return tab, vals, meta


WHAT: dict[str, str] = {
    "factor": "Suomi NPP rows over MODIS rows over every clean overlap month, the place's own ratio, the factor the "
              "method in use applies; places with at least 30 MODIS rows",
    "factor_pooled": "the same ratio leaning on the 8 neighbouring places and the latitude band; every place",
    "error_in_use": "held-out monthly error with the method in use: the sum of |predicted - observed| over the sum "
                    "of observed Suomi NPP rows, every overlap year left out in turn; places with at least 50 rows",
    "error_none": "the same with no correction, MODIS rows as they are",
    "interval_coverage": "share of held-out months with a prediction of one row or more whose Suomi NPP count lies "
                         "inside the 80 percent interval of the place's band, set from other years' errors; places "
                         "with at least 12 such months",
}

SCALES: dict[str, dict[str, Any]] = {
    "factor": {"stops": BLUE, "vmin": 1.0, "vmax": 16.0, "log": True, "unit": "Suomi NPP rows per MODIS row"},
    "factor_pooled": {"stops": BLUE, "vmin": 1.0, "vmax": 16.0, "log": True, "unit": "Suomi NPP rows per MODIS row"},
    "error_in_use": {"stops": ORANGE, "vmin": 0.0, "vmax": 1.0, "log": False, "unit": "share of observed rows"},
    "error_none": {"stops": ORANGE, "vmin": 0.0, "vmax": 1.0, "log": False, "unit": "share of observed rows"},
    "interval_coverage": {"stops": DIVERGING, "vmin": 0.5, "vmax": 1.0, "log": False,
                          "unit": "share of held-out months inside the 80 percent interval; gray at 0.8, red below "
                                  "(the interval is too narrow there), blue above (too wide)"},
}


def build(out: Path, source: str = "cube", place_deg: float = PLACE_DEG) -> dict[str, Any]:
    out.mkdir(parents=True, exist_ok=True)
    tab, vals, meta = place_values(source, place_deg)
    loaded = np.load(C.cube_dir() / "loaded.npy") if source == "cube" else None
    layers = {}
    for name, v in vals.items():
        grid = paint(tab, v, loaded)
        npy = out / f"{name}.npy"
        np.save(npy, grid)
        sc = SCALES[name]
        if name == "interval_coverage":
            # the gray midpoint sits at the level: 0.5 to 0.8 below it, 0.8 to 1.1 above, clipped
            rgba = colour(np.where(np.isfinite(grid), np.clip(grid, 0.5, 1.1), np.nan), DIVERGING, 0.5, 1.1)
            sc = {**sc, "vmax": 1.1, "note": "values above 1.0 do not occur; the scale is symmetric about 0.8"}
        else:
            rgba = colour(grid, sc["stops"], sc["vmin"], sc["vmax"], sc["log"])
        png_sha = write_png(out / f"{name}.png", rgba)
        fin = v[np.isfinite(v)]
        layers[name] = {"what": WHAT[name],
                        "unit": sc["unit"], "scale": {"stops": list(sc["stops"]), "vmin": sc["vmin"], "vmax": sc["vmax"],
                                                      "log": sc["log"]},
                        "places_with_value": int(fin.size),
                        "median": round(float(np.median(fin)), 4) if fin.size else None,
                        "p10": round(float(np.percentile(fin, 10)), 4) if fin.size else None,
                        "p90": round(float(np.percentile(fin, 90)), 4) if fin.size else None,
                        "sha256": hashlib.sha256(npy.read_bytes()).hexdigest(), "png_sha256": png_sha,
                        "dtype": "float32", "shape": [C.N_LAT, C.N_LON]}
    doc = {"grid": "the fire cube's grid, (720, 1440), north up, one pixel per cell; nan and transparent where the "
                   "cube has no loaded country or the place has too few rows to say",
           "painted_from": f"places of {place_deg:g} degrees: every cell of a place carries the place's value",
           "read": meta, "layers": layers}
    (out / "maps.json").write_text(json.dumps(doc, indent=1), encoding="utf-8")
    return doc


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--source", choices=["cache", "cube"], default="cube")
    ap.add_argument("--deg", type=float, default=PLACE_DEG)
    a = ap.parse_args()
    doc = build(Path(a.out), a.source, a.deg)
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk in ("places_with_value", "median", "p10", "p90")}
                      for k, v in doc["layers"].items()}, indent=1))
    print(json.dumps(doc["read"], indent=1))


if __name__ == "__main__":
    main()
