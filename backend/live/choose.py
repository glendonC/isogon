"""Fires chosen by rule from the coarse satellites' near real time rows alone (protocol.py, `document()["choose"]`)."""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from backend.eval.rows import parse_acq_time_s
from backend.live import protocol as PR


def _unit(lon: float, lat: float) -> np.ndarray:
    lo, la = math.radians(lon), math.radians(lat)
    return np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])


def world_part(lon: float, lat: float) -> str:
    """The part of the world whose anchor is nearest on the sphere; ties go to the first part listed."""
    p = _unit(lon, lat)
    best, best_dot = "", -2.0
    for name, (alon, alat) in PR.WORLD_PARTS.items():
        d = float(np.dot(p, _unit(alon, alat)))
        if d > best_dot + 1e-12:
            best, best_dot = name, d
    return best


def meets(a: tuple[float, float, float, float] | list[float], b: tuple[float, float, float, float] | list[float]) -> bool:
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def candidates(rows: list[dict[str, str]], at_s: float) -> tuple[list[dict[str, Any]], int]:
    """(candidate boxes, rows counted). Only latitude, longitude and the acquisition time of each row are read."""
    lon, lat = [], []
    for r in rows:
        t = parse_acq_time_s(r["acq_date"], r["acq_time"])
        if at_s - PR.CHOOSE_ROWS_WITHIN_S <= t <= at_s:
            lon.append(float(r["longitude"]))
            lat.append(float(r["latitude"]))
    x, y = np.array(lon, dtype=np.float64), np.array(lat, dtype=np.float64)
    if x.size == 0:
        return [], 0
    dx, dy = PR.BOX_SPAN_LON_DEG, PR.BOX_SPAN_LAT_DEG
    ci = np.floor((x + 180.0) / dx).astype(np.int64)
    cj = np.floor((y + 90.0) / dy).astype(np.int64)
    order = np.argsort(y, kind="stable")
    ys, xs = y[order], x[order]
    cells: dict[tuple[int, int], list[int]] = {}
    for k in range(x.size):
        cells.setdefault((int(ci[k]), int(cj[k])), []).append(k)
    out = []
    for (i, j), idx in cells.items():
        c_lon, c_lat = float(np.median(x[idx])), float(np.median(y[idx]))
        box = (round(c_lon - dx / 2, 6), round(c_lat - dy / 2, 6), round(c_lon + dx / 2, 6), round(c_lat + dy / 2, 6))
        a, b = np.searchsorted(ys, box[1], "left"), np.searchsorted(ys, box[3], "right")
        band = xs[a:b]
        n = int(((band >= box[0]) & (band <= box[2])).sum())
        if n < PR.MIN_ROWS:
            continue
        if not (PR.MAX_CENTRE_LAT_S <= c_lat <= PR.MAX_CENTRE_LAT_N):
            continue
        if box[0] < -180.0 + PR.ANTIMERIDIAN_MARGIN_DEG or box[2] > 180.0 - PR.ANTIMERIDIAN_MARGIN_DEG:
            continue
        out.append({"lattice_cell": [i, j], "centre": [round(c_lon, 6), round(c_lat, 6)], "box": list(box),
                    "modis_rows": n, "part": world_part(c_lon, c_lat)})
    out.sort(key=lambda c: (-c["modis_rows"], c["lattice_cell"][1], c["lattice_cell"][0]))
    return out, int(x.size)


def choose(cands: list[dict[str, Any]], followed: list[list[float]], n: int = PR.FIRES_PER_COHORT) -> list[dict[str, Any]]:
    """Round robin over the world parts, ordered by their largest candidate, skipping boxes that meet one followed."""
    queues: dict[str, list[dict[str, Any]]] = {}
    for c in cands:  # already in order of size
        queues.setdefault(c["part"], []).append(c)
    parts = sorted(queues, key=lambda p: (-queues[p][0]["modis_rows"], p))
    taken: list[dict[str, Any]] = []
    boxes = [list(b) for b in followed]
    while len(taken) < n and any(queues[p] for p in parts):
        for p in parts:
            if len(taken) >= n:
                break
            q = queues[p]
            while q:
                c = q.pop(0)
                if not any(meets(c["box"], b) for b in boxes):
                    taken.append(c)
                    boxes.append(c["box"])
                    break
    return taken
