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
    new = Image.open(files[meta["ortho"]["name"]]).convert("RGB")
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
            row.paste(_labelled(b, f"window {i + 1} {tag}: new {n_new} jpg, {px_new} px"), (PANEL + 8, 0))
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
        _labelled(new.resize((PANEL, PANEL), Image.BOX), f"new {n_new} full frame"),
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


def detail_sheet(region_id: str, out_dir: Path, index: int = 0, tag: str = "pack") -> Path | None:
    """Main 8192 ortho against the zoom 16 inset over the same ground, at 1.4 km and 400 m windows."""
    spec = PRESET_BY_ID[region_id]
    loaded = load_pack(spec)
    if loaded is None or not loaded[0].get("ortho_detail"):
        return None
    meta, files = loaded
    det = next((d for d in meta["ortho_detail"] if d["name"] == f"ortho_detail_{index}.jpg"), None)
    if det is None:
        return None
    main = Image.open(files[meta["ortho"]["name"]]).convert("RGB")
    inset = Image.open(files[det["name"]]).convert("RGB")
    n_main, n_det = main.width, inset.width
    x0, y0, x1, y1 = det["rect_image"]
    dem = np.fromfile(files["dem_1024_f32.bin"], dtype="<f4").reshape(1024, 1024).astype(np.float64)
    # Window centre: strongest local relief inside the inset (the canyon), so the crops show walls.
    r0, r1 = int(y0 * 1023), int(y1 * 1023)
    c0, c1 = int(x0 * 1023), int(x1 * 1023)
    sub = dem[r0:r1, c0:c1]
    k = 6
    best, cv, cu = -1.0, 0.5, 0.5
    for r in range(k, sub.shape[0] - k, 3):
        for c in range(k, sub.shape[1] - k, 3):
            w = sub[r - k : r + k, c - k : c + k]
            rel = float(w.max() - w.min())
            if rel > best:
                best, cv, cu = rel, r / sub.shape[0], c / sub.shape[1]
    rows: list[Image.Image] = []
    overview = main.crop(tuple(int(round(v * n_main)) for v in (x0, y0, x1, y1))).resize((PANEL, PANEL), Image.LANCZOS)
    full_det = inset.resize((PANEL, PANEL), Image.LANCZOS)
    row = Image.new("RGB", (PANEL * 2 + 8, PANEL + LABEL_H), (0, 0, 0))
    row.paste(_labelled(overview, f"inset footprint in main 8192 (uv {det['uv_rect']})"), (0, 0))
    row.paste(_labelled(full_det, f"z{det['zoom']} inset {det['size']} px, gsd {det['gsd_m']} m"), (PANEL + 8, 0))
    rows.append(row)
    span_km = det["main_texels"][0] / n_main * meta["extent_km"][0]
    for km in (1.4, 0.4):
        f = km / span_km  # fraction of the inset
        u0 = min(max(cu - f / 2, 0.0), 1.0 - f)
        v0 = min(max(cv - f / 2, 0.0), 1.0 - f)
        box_det = tuple(int(round(v * n_det)) for v in (u0, v0, u0 + f, v0 + f))
        gx0, gy0 = x0 + u0 * (x1 - x0), y0 + v0 * (y1 - y0)
        gf = f * (x1 - x0)
        box_main = tuple(int(round(v * n_main)) for v in (gx0, gy0, gx0 + gf, gy0 + gf))
        a = main.crop(box_main).resize((PANEL, PANEL), Image.BILINEAR)
        b = inset.crop(box_det).resize((PANEL, PANEL), Image.BILINEAR if box_det[2] - box_det[0] < PANEL else Image.LANCZOS)
        row = Image.new("RGB", (PANEL * 2 + 8, PANEL + LABEL_H), (0, 0, 0))
        row.paste(_labelled(a, f"{km} km: main 8192 z14, {box_main[2] - box_main[0]} px"), (0, 0))
        row.paste(_labelled(b, f"{km} km: inset z16, {box_det[2] - box_det[0]} px"), (PANEL + 8, 0))
        rows.append(row)
    sheet = Image.new("RGB", (PANEL * 2 + 8, 56 + sum(r.height + 8 for r in rows)), (0, 0, 0))
    ImageDraw.Draw(sheet).text((10, 12), f"{spec.name}   ortho_detail_{index}   {det['selection']['rule'][:70]}",
                               fill=(255, 255, 255), font=_font(22))
    y = 56
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 8
    out = out_dir / (f"{tag}_{region_id}_detail.png" if index == 0 else f"{tag}_{region_id}_detail_{index}.png")
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet.save(out, optimize=True)
    return out


def imagery_compare_sheet(region_id: str, imagery: str, out_dir: Path) -> Path:
    """Default (Esri) pack against another imagery variant over the same windows."""
    spec = PRESET_BY_ID[region_id]
    a_meta, a_files = load_pack(spec)  # type: ignore[misc]
    loaded_b = load_pack(spec, imagery=imagery)
    if loaded_b is None:
        raise SystemExit(f"no {imagery} pack for {region_id}")
    b_meta, b_files = loaded_b
    a_img = Image.open(a_files[a_meta["ortho"]["name"]]).convert("RGB")
    b_img = Image.open(b_files[b_meta["ortho"]["name"]]).convert("RGB")
    n = a_img.width
    dem = np.fromfile(a_files[a_meta["dem"]["name"]], dtype="<f4").reshape(1024, 1024).astype(np.float64)
    a_name, b_name = a_meta["ortho"]["source"], b_meta["ortho"]["source"]

    def pair(left: Image.Image, right: Image.Image, l_text: str, r_text: str) -> Image.Image:
        row = Image.new("RGB", (PANEL * 2 + 8, PANEL + LABEL_H), (0, 0, 0))
        row.paste(_labelled(left, l_text), (0, 0))
        row.paste(_labelled(right, r_text), (PANEL + 8, 0))
        return row

    rows = [pair(a_img.resize((PANEL, PANEL), Image.BOX), b_img.resize((PANEL, PANEL), Image.BOX),
                 f"{a_name} full frame", f"{b_name} full frame")]
    for i, (v, u) in enumerate(_pick_windows(dem, 2, 0.125)):
        for size_frac, tag in ((0.125, "5 km"), (0.03125, "1.4 km")):
            u0 = min(max(u - size_frac / 2, 0.0), 1.0 - size_frac)
            v0 = min(max(v - size_frac / 2, 0.0), 1.0 - size_frac)
            box = tuple(int(round(x * n)) for x in (u0, v0, u0 + size_frac, v0 + size_frac))
            res = Image.BILINEAR if box[2] - box[0] < PANEL else Image.LANCZOS
            rows.append(pair(a_img.crop(box).resize((PANEL, PANEL), res), b_img.crop(box).resize((PANEL, PANEL), res),
                             f"window {i + 1} {tag}: {a_name} z{a_meta['ortho']['zoom']}",
                             f"window {i + 1} {tag}: {b_name} z{b_meta['ortho']['zoom']}"))
    a_det = (a_meta.get("ortho_detail") or [None])[0]
    b_det = (b_meta.get("ortho_detail") or [None])[0]
    if a_det and b_det and a_det["rect_image"] == b_det["rect_image"]:
        ai = Image.open(a_files[a_det["name"]]).convert("RGB")
        bi = Image.open(b_files[b_det["name"]]).convert("RGB")
        nd = ai.width
        x0, y0, x1, y1 = a_det["rect_image"]
        span_km = a_det["main_texels"][0] / n * a_meta["extent_km"][0]
        # 400 m window at the strongest relief inside the inset.
        r0, r1, c0, c1 = int(y0 * 1023), int(y1 * 1023), int(x0 * 1023), int(x1 * 1023)
        sub = dem[r0:r1, c0:c1]
        best, cv, cu = -1.0, 0.5, 0.5
        for r in range(6, sub.shape[0] - 6, 3):
            for c in range(6, sub.shape[1] - 6, 3):
                w = sub[r - 6 : r + 6, c - 6 : c + 6]
                if float(w.max() - w.min()) > best:
                    best, cv, cu = float(w.max() - w.min()), r / sub.shape[0], c / sub.shape[1]
        for km in (1.4, 0.4):
            f = km / span_km
            uu = min(max(cu - f / 2, 0.0), 1.0 - f)
            vv = min(max(cv - f / 2, 0.0), 1.0 - f)
            box = tuple(int(round(x * nd)) for x in (uu, vv, uu + f, vv + f))
            res = Image.BILINEAR if box[2] - box[0] < PANEL else Image.LANCZOS
            rows.append(pair(ai.crop(box).resize((PANEL, PANEL), res), bi.crop(box).resize((PANEL, PANEL), res),
                             f"inset {km} km: {a_name} z{a_det['zoom']}", f"inset {km} km: {b_name} z{b_det['zoom']}"))
    a_aux = np.asarray(Image.open(a_files[a_meta["aux"]["name"]]), dtype=np.float32)[..., 3] / 255.0
    b_aux = np.asarray(Image.open(b_files[b_meta["aux"]["name"]]), dtype=np.float32)[..., 3] / 255.0
    def canopy_img(c: NDArray[np.floating]) -> Image.Image:
        return Image.fromarray(np.clip(c * 255, 0, 255).astype(np.uint8)).resize((PANEL, PANEL), Image.BOX)
    rows.append(pair(canopy_img(a_aux), canopy_img(b_aux), f"canopy index from {a_name}, mean {a_aux.mean():.2f}",
                     f"canopy index from {b_name}, mean {b_aux.mean():.2f}"))

    title = (f"{spec.name}   left: {a_meta['ortho']['source']}   right: {b_meta['ortho']['source']}   "
             f"sun fit left az {a_meta['sun']['azimuth_deg']:.0f} el {a_meta['sun']['elevation_deg']:.0f}, "
             f"right az {b_meta['sun']['azimuth_deg']:.0f} el {b_meta['sun']['elevation_deg']:.0f}")
    sheet = Image.new("RGB", (PANEL * 2 + 8, 56 + sum(r.height + 8 for r in rows)), (0, 0, 0))
    ImageDraw.Draw(sheet).text((10, 12), title, fill=(255, 255, 255), font=_font(20))
    y = 56
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 8
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"T5_{region_id}_esri_vs_{imagery}.png"
    sheet.save(out, optimize=True)
    return out


def _context_hillshade(dem: NDArray[np.float64], extent_km: list[float], az_deg: float = 315.0, el_deg: float = 45.0) -> NDArray[np.float64]:
    """Lambert shade 0..1 of a node registered DEM at true scale (no exaggeration), sun from ``az_deg``."""
    n = dem.shape[0]
    dx = extent_km[0] * 1000.0 / (n - 1)
    dy = extent_km[1] * 1000.0 / (n - 1)
    dz_row, dz_col = np.gradient(dem, dy, dx)
    nx, ny_north, nz = -dz_col, dz_row, np.ones_like(dem)  # rows run south, so north slope is +dz_row
    norm = np.sqrt(nx**2 + ny_north**2 + nz**2)
    az, el = np.radians(az_deg), np.radians(el_deg)
    sun = (np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el))
    return np.clip((nx * sun[0] + ny_north * sun[1] + nz * sun[2]) / norm, 0.0, 1.0)


def context_pictures(region_id: str, out_dir: Path, tag: str = "pack", width: int = 1440) -> list[Path]:
    """Top down context ortho and context hillshade, true aspect, pack rectangle outlined; and a seam view
    with the pack ortho set into the context ortho, no outline, to judge the colour and detail step."""
    spec = PRESET_BY_ID[region_id]
    loaded = load_pack(spec, HIRES_REGION_CACHE_DIR)
    if loaded is None or "context" not in loaded[0]:
        raise SystemExit(f"{region_id}: no context built")
    meta, files = loaded
    c = meta["context"]
    w_km, h_km = c["extent_km"]
    height = int(round(width * h_km / w_km))
    out_dir.mkdir(parents=True, exist_ok=True)
    rect = (int(round(0.4 * width)), int(round(0.4 * height)), int(round(0.6 * width)) - 1, int(round(0.6 * height)) - 1)
    outline = (255, 140, 0)
    paths = []

    with Image.open(files[c["ortho"]["name"]]) as img:
        ortho = img.convert("RGB").resize((width, height), Image.LANCZOS)
    o = ortho.copy()
    ImageDraw.Draw(o).rectangle(rect, outline=outline, width=2)
    p = out_dir / f"{tag}-{region_id}-context-ortho.jpg"
    o.save(p, quality=90)
    paths.append(p)

    n = c["dem"]["size"]
    dem = np.fromfile(files[c["dem"]["name"]], dtype="<f4").reshape(n, n).astype(np.float64)
    shade = _context_hillshade(dem, c["extent_km"])
    g = (40.0 + 200.0 * shade)[..., None] * np.ones(3)
    sea = dem == 0.0
    g[sea] = 0.45 * g[sea] + 0.55 * np.array([60.0, 110.0, 175.0])  # sea tint (0 m), lakes stay grey
    hs = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8)).resize((width, height), Image.BICUBIC)
    ImageDraw.Draw(hs).rectangle(rect, outline=outline, width=2)
    p = out_dir / f"{tag}-{region_id}-context-hillshade.jpg"
    hs.save(p, quality=90)
    paths.append(p)

    # Seam: the central 0.3 to 0.7 of the context (twice the pack), context ortho upsampled, pack inside.
    with Image.open(files[c["ortho"]["name"]]) as img:
        k = img.size[0]
        win = img.convert("RGB").crop((int(0.3 * k), int(0.3 * k), int(0.7 * k), int(0.7 * k)))
    sh = int(round(width * meta["extent_km"][1] / meta["extent_km"][0]))
    seam = win.resize((width, sh), Image.BICUBIC)
    pw, ph = width // 2, sh // 2
    with Image.open(files[meta["ortho"]["name"]]) as img:
        seam.paste(img.convert("RGB").resize((pw, ph), Image.LANCZOS), (width // 4, sh // 4))
    p = out_dir / f"{tag}-{region_id}-context-seam.jpg"
    seam.save(p, quality=90)
    paths.append(p)
    return paths


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("regions", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--detail-only", action="store_true", help="only the zoom 16 inset sheet")
    ap.add_argument("--compare-imagery", default=None, help="imagery variant to compare against the default pack")
    ap.add_argument("--detail-index", type=int, default=0, help="inset number for --detail-only")
    ap.add_argument("--tag", default="pack", help="file name prefix for --detail-only")
    ap.add_argument("--context", action="store_true", help="context ortho, hillshade and seam pictures")
    args = ap.parse_args()
    for rid in args.regions:
        if args.context:
            print(json.dumps({"region": rid, "pictures": [str(p) for p in context_pictures(rid, Path(args.out))]}))
            continue
        if args.compare_imagery:
            print(json.dumps({"region": rid, "compare_sheet": str(imagery_compare_sheet(rid, args.compare_imagery, Path(args.out)))}))
            continue
        if args.detail_only:
            print(json.dumps({"region": rid, "detail_sheet": str(detail_sheet(rid, Path(args.out), args.detail_index, args.tag))}))
            continue
        reg = registration_numbers(rid)
        path = contact_sheet(rid, Path(args.out))
        print(json.dumps({"region": rid, "registration_vs_dem_512": reg, "sheet": str(path)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
