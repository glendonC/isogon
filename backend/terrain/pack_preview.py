"""Contact sheets and registration numbers for built terrain packs (evidence, not served).

Usage:
  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/terrain/pack_preview.py \
      plumas_ca lytton_bc evia_greece --out /abs/dir
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np
from numpy.typing import NDArray

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from backend.terrain.live_region import (  # noqa: E402
    DEM_HIRES_SIZE,
    HIRES_REGION_CACHE_DIR,
    PRESET_BY_ID,
    region_cache_stem,
)
from backend.terrain.terrain_pack import load_pack  # noqa: E402

Image.MAX_IMAGE_PIXELS = 8192 * 8192 + 1
PANEL = 768
LABEL_H = 40


def _font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # older Pillow
        return ImageFont.load_default()


def _resample_nodes(dem: NDArray[np.float64], n_out: int) -> NDArray[np.float64]:
    n_in = dem.shape[0]
    t = np.linspace(0.0, n_in - 1.0, n_out)
    i0 = np.clip(np.floor(t).astype(int), 0, n_in - 2)
    f = t - i0
    rows = dem[i0] * (1 - f)[:, None] + dem[i0 + 1] * f[:, None]
    return rows[:, i0] * (1 - f)[None, :] + rows[:, i0 + 1] * f[None, :]


def _phase_shift(a: NDArray[np.float64], b: NDArray[np.float64]) -> tuple[float, float]:
    def prep(x: NDArray[np.float64]) -> NDArray[np.float64]:
        gy, gx = np.gradient(x)
        g = np.hypot(gx, gy)
        g -= g.mean()
        return g * np.outer(np.hanning(x.shape[0]), np.hanning(x.shape[1]))

    fa, fb = np.fft.fft2(prep(a)), np.fft.fft2(prep(b))
    cross = fb * np.conj(fa)
    cross /= np.maximum(np.abs(cross), 1e-12)
    corr = np.fft.ifft2(cross).real
    peak = np.unravel_index(int(np.argmax(corr)), corr.shape)
    out = []
    for axis, p in enumerate(peak):
        n = corr.shape[axis]
        im, ip = list(peak), list(peak)
        im[axis], ip[axis] = (p - 1) % n, (p + 1) % n
        cm, c0, cp = corr[tuple(im)], corr[peak], corr[tuple(ip)]
        den = cm - 2 * c0 + cp
        s = p + (0.5 * (cm - cp) / den if abs(den) > 1e-12 else 0.0)
        out.append(float(s - n if s > n / 2 else s))
    return out[0], out[1]


def registration_numbers(region_id: str) -> dict[str, float]:
    spec = PRESET_BY_ID[region_id]
    loaded = load_pack(spec)
    if loaded is None:
        raise SystemExit(f"no pack for {region_id}")
    _, files = loaded
    old = np.fromfile(HIRES_REGION_CACHE_DIR / f"{region_cache_stem(spec)}_dem_512_f32.bin", dtype="<f4")
    old = old.reshape(DEM_HIRES_SIZE, DEM_HIRES_SIZE).astype(np.float64)
    new = np.fromfile(files["dem_1024_f32.bin"], dtype="<f4").reshape(1024, 1024).astype(np.float64)
    down = _resample_nodes(new, DEM_HIRES_SIZE)
    d = down - old
    sr, sc = _phase_shift(old, down)
    return {
        "rmse_m": round(float(np.sqrt(np.mean(d * d))), 2),
        "bias_m": round(float(d.mean()), 2),
        "p99_abs_m": round(float(np.percentile(np.abs(d), 99)), 1),
        "shift_rows_cells": round(sr, 3),
        "shift_cols_cells": round(sc, 3),
    }


def _labelled(img: Image.Image, text: str) -> Image.Image:
    out = Image.new("RGB", (img.width, img.height + LABEL_H), (12, 12, 12))
    out.paste(img.convert("RGB"), (0, LABEL_H))
    ImageDraw.Draw(out).text((10, 8), text, fill=(235, 235, 235), font=_font(22))
    return out


def _pick_windows(dem: NDArray[np.float64], count: int, frac: float) -> list[tuple[float, float]]:
    """Window centers (fractions) of strongest local relief, kept apart from each other."""
    n = dem.shape[0]
    k = max(4, int(n * frac / 2))
    step = max(1, k // 2)
    cands = []
    for r in range(k, n - k, step):
        for c in range(k, n - k, step):
            win = dem[r - k : r + k, c - k : c + k]
            cands.append((float(win.max() - win.min()), r / n, c / n))
    cands.sort(reverse=True)
    picked: list[tuple[float, float]] = []
    for _, v, u in cands:
        if all(abs(v - pv) > 0.3 or abs(u - pu) > 0.3 for pv, pu in picked):
            picked.append((v, u))
        if len(picked) == count:
            break
    return picked


def contact_sheet(region_id: str, out_dir: Path) -> Path:
    spec = PRESET_BY_ID[region_id]
    loaded = load_pack(spec)
    if loaded is None:
        raise SystemExit(f"no pack for {region_id}")
    meta, files = loaded
    stem = region_cache_stem(spec)
    old = Image.open(HIRES_REGION_CACHE_DIR / f"{stem}_sat_2048.jpg").convert("RGB")
    new = Image.open(files["ortho_8192.jpg"]).convert("RGB")
    aux = np.asarray(Image.open(files["aux_2048.png"]), dtype=np.float32) / 255.0
    dem = np.fromfile(files["dem_1024_f32.bin"], dtype="<f4").reshape(1024, 1024).astype(np.float64)
    n_old, n_new = old.width, new.width

    rows: list[Image.Image] = []
    windows = _pick_windows(dem, 2, 0.125)
    for i, (v, u) in enumerate(windows):
        for size_frac, tag in ((0.125, "5 km"), (0.03125, "1.4 km")):
            half = size_frac / 2
            v0, u0 = min(max(v - half, 0.0), 1.0 - size_frac), min(max(u - half, 0.0), 1.0 - size_frac)
            box_old = tuple(int(round(x * n_old)) for x in (u0, v0, u0 + size_frac, v0 + size_frac))
            box_new = tuple(int(round(x * n_new)) for x in (u0, v0, u0 + size_frac, v0 + size_frac))
            a = old.crop(box_old).resize((PANEL, PANEL), Image.BILINEAR)
            b = new.crop(box_new).resize((PANEL, PANEL), Image.BILINEAR if (box_new[2] - box_new[0]) < PANEL else Image.LANCZOS)
            px_old = box_old[2] - box_old[0]
            px_new = box_new[2] - box_new[0]
            row = Image.new("RGB", (PANEL * 2 + 8, PANEL + LABEL_H), (0, 0, 0))
            row.paste(_labelled(a, f"window {i + 1} {tag}: old 2048 jpg, {px_old} px"), (0, 0))
            row.paste(_labelled(b, f"window {i + 1} {tag}: new 8192 jpg, {px_new} px"), (PANEL + 8, 0))
            rows.append(row)

    nx = aux[..., 0] * 2 - 1
    nz = aux[..., 1] * 2 - 1
    ny = np.sqrt(np.clip(1 - nx * nx - nz * nz, 0, 1))
    az, el = np.radians(meta["sun"]["azimuth_deg"]), np.radians(meta["sun"]["elevation_deg"])
    sun = np.array([np.sin(az) * np.cos(el), np.sin(el), -np.cos(az) * np.cos(el)])
    shade = np.clip(nx * sun[0] + ny * sun[1] + nz * sun[2], 0, 1)
    ao = aux[..., 2]
    canopy = aux[..., 3]
    small = np.asarray(new.resize((2048, 2048), Image.BOX), dtype=np.float32) / 255.0

    def to_img(x: NDArray[np.floating]) -> Image.Image:
        arr = np.clip(np.rint(np.asarray(x) * 255), 0, 255).astype(np.uint8)
        return Image.fromarray(arr).resize((PANEL, PANEL), Image.BOX)

    normal_rgb = np.stack([nx * 0.5 + 0.5, ny, nz * 0.5 + 0.5], axis=-1)
    canopy_rgb = small * (1 - 0.6 * canopy[..., None]) + np.array([0.1, 0.9, 0.2]) * 0.6 * canopy[..., None]
    lit = small * (0.35 + 0.65 * shade[..., None]) * (0.55 + 0.45 * ao[..., None])
    tiles = [
        _labelled(to_img(shade), f"normals, Lambert at sun az {meta['sun']['azimuth_deg']:.0f} el {meta['sun']['elevation_deg']:.0f}"),
        _labelled(to_img(ao), f"sky view AO, min {ao.min():.2f} mean {ao.mean():.2f}"),
        _labelled(to_img(normal_rgb), "normals packed (x, y, z) as RGB"),
        _labelled(to_img(canopy_rgb), f"canopy index overlay, mean {canopy.mean():.2f}"),
        _labelled(to_img(lit), "ortho x shade x AO (preview only)"),
        _labelled(new.resize((PANEL, PANEL), Image.BOX), "new 8192 full frame"),
    ]
    grid = Image.new("RGB", (PANEL * 2 + 8, (PANEL + LABEL_H + 8) * 3), (0, 0, 0))
    for i, t in enumerate(tiles):
        grid.paste(t, ((i % 2) * (PANEL + 8), (i // 2) * (PANEL + LABEL_H + 8)))
    rows.append(grid)

    title_h = 56
    sheet = Image.new("RGB", (PANEL * 2 + 8, title_h + sum(r.height + 8 for r in rows)), (0, 0, 0))
    ImageDraw.Draw(sheet).text(
        (10, 12),
        f"{spec.name}   terrain pack v1 {meta['tier']}   z{meta['ortho']['zoom']} {meta['ortho']['source']}   "
        f"gsd {meta['ortho']['gsd_m']} m   bbox {meta['bbox']}",
        fill=(255, 255, 255),
        font=_font(22),
    )
    y = title_h
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 8
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"T1_{region_id}_contact.png"
    sheet.save(out, optimize=True)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("regions", nargs="+")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    for rid in args.regions:
        reg = registration_numbers(rid)
        path = contact_sheet(rid, Path(args.out))
        print(json.dumps({"region": rid, "registration_vs_dem_512": reg, "sheet": str(path)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
