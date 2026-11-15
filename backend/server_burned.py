"""HTTP route for NASA's burned-area map of a fire, MCD64A1 v061, read from the world store.

  GET /api/burned?region_id=<id>&start=<date>&end=<date>[&format=json|png|day]

The cells MCD64A1 marks burned in the box from the first day of the window's first month to the last day of the
month holding the window's end, on the run's 375 m grid (`EvalGrid.from_bbox(box)`, north up), each with its day of
burn and whether it burned before, during or after the window. `box=w,s,e,n` may stand for `region_id`.

- `format=json` (the default): the product, version, credit, grid, counts and both pictures as data URLs;
  `format=png`: the classes picture (8-bit palette, index = class); `format=day`: the day picture (8-bit grey,
  the day of burn counted from the first day of the span, 0 where nothing burned).
- MCD64A1 only: VNP64A1 is seeded by the sharp satellite's fires and is never served. A `product` other than
  MCD64A1 is refused.
- Reads the store only (`backend/firms/burned.py`; `$ISOGON_BURNED_DIR`, else `$ISOGON_WORLD_DIR/burned`) and never
  fetches: a box or month not in the store answers 404 "not fetched".
- A closed 2021 window of `plumas_ca`, `lytton_bc` or `evia_greece` is refused with 409 before any read.

The route does not know whether a run has been revealed; the picture shows where the fire went, so the page asks
for it only after the reveal.
"""

from __future__ import annotations

import base64
import datetime as _dt
from http import HTTPStatus
import io
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from backend.firms import burned as B

PREFIX: str = "/api/burned"
PRODUCT: str = "MCD64A1"
CLASSES: tuple[str, ...] = ("none", "unmapped", "burned_before_window", "burned_in_window", "burned_after_window")
# placeholder colours; the page colours by index
PALETTE: tuple[tuple[int, int, int], ...] = ((0, 0, 0), (120, 120, 120), (122, 74, 48), (196, 64, 32),
                                             (232, 160, 72))
ALPHA: tuple[int, ...] = (0, 80, 255, 255, 255)
CREDIT: str = "NASA LP DAAC, MCD64A1 v061 (Giglio, Justice, Boschetti, Roy), doi:10.5067/MODIS/MCD64A1.061"
LIMITS: str = ("NASA's burned-area map from MODIS reflectance at 500 m: it misses many small burns (its validation "
               "against Landsat gives pixel omission of 72.6 percent and commission of 40.2 percent), and a cell's "
               "day of burn can be off by days under smoke or cloud.")


def burned_root() -> Path:
    """The store: `$ISOGON_BURNED_DIR`, else `$ISOGON_WORLD_DIR/burned`, else the reader's default."""
    import os

    if os.environ.get("ISOGON_BURNED_DIR", "").strip():
        return Path(os.environ["ISOGON_BURNED_DIR"].strip())
    if os.environ.get("ISOGON_WORLD_DIR", "").strip():
        return Path(os.environ["ISOGON_WORLD_DIR"].strip()) / "burned"
    return B.default_burned_dir()


def _one(qs: dict[str, list[str]], key: str) -> str | None:
    v = qs.get(key)
    return v[0].strip() if v and v[0].strip() else None


def _box(qs: dict[str, list[str]]) -> tuple[str | None, tuple[float, float, float, float]]:
    rid = _one(qs, "region_id")
    raw = _one(qs, "box")
    if raw is not None:
        parts = raw.split(",")
        if len(parts) != 4:
            raise ValueError("box must be w,s,e,n")
        return rid, B.normalize_box([float(p) for p in parts])
    if rid is None:
        raise ValueError("give region_id or box=w,s,e,n")
    from backend.terrain.live_region import PRESET_BY_ID

    if rid not in PRESET_BY_ID:
        raise KeyError(f"unknown region '{rid}'")
    b = PRESET_BY_ID[rid].bbox
    return rid, B.normalize_box([round(float(v), 6) for v in (b.west, b.south, b.east, b.north)])


def _month_start(d: _dt.date) -> _dt.datetime:
    return _dt.datetime(d.year, d.month, 1, tzinfo=_dt.timezone.utc)


def span_of(start_s: float, end_s: float) -> tuple[_dt.datetime, _dt.datetime]:
    """The first moment of the window's first month and the first moment after the month holding its end."""
    first = _dt.datetime.fromtimestamp(start_s, tz=_dt.timezone.utc).date()
    last = _dt.datetime.fromtimestamp(end_s - 1.0, tz=_dt.timezone.utc).date()
    y, m = (last.year, last.month + 1) if last.month < 12 else (last.year + 1, 1)
    return _month_start(first), _dt.datetime(y, m, 1, tzinfo=_dt.timezone.utc)


def classify(bw: B.BurnedWindow, start_s: float, end_s: float, span_start: _dt.datetime
             ) -> tuple[np.ndarray, np.ndarray, list[_dt.date]]:
    """(classes, day of burn from the span's first day, the burned cells' dates) on the window's grid. Cells the
    reader marks burned outside the span's months are left as none."""
    cls = np.zeros(bw.mask.shape, dtype=np.uint8)
    cls[bw.mask == B.CLASS_UNMAPPED] = 1
    day = np.zeros(bw.mask.shape, dtype=np.uint8)
    hit = np.argwhere(bw.mask == B.CLASS_BURNED_IN_WINDOW)
    first = _dt.datetime.fromtimestamp(start_s, tz=_dt.timezone.utc).date()
    last = _dt.datetime.fromtimestamp(end_s - 1.0, tz=_dt.timezone.utc).date()
    s0 = span_start.date()
    dates: list[_dt.date] = []
    for r, c in hit:
        d = _dt.date(int(bw.burn_year[r, c]), 1, 1) + _dt.timedelta(days=int(bw.burn_doy[r, c]) - 1)
        dates.append(d)
        cls[r, c] = 2 if d < first else (3 if d <= last else 4)
        day[r, c] = min(255, (d - s0).days + 1)
    return cls, day, dates


def png_bytes(arr: np.ndarray, palette: bool) -> bytes:
    buf = io.BytesIO()
    if palette:
        img = Image.fromarray(arr, mode="P")
        img.putpalette([v for rgb in PALETTE for v in rgb])
        img.save(buf, format="PNG", transparency=bytes(ALPHA), optimize=True)
    else:
        Image.fromarray(arr, mode="L").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def answer(qs: dict[str, list[str]], root: Path | None = None) -> dict[str, Any]:
    """The route's answer as a dict; `state` "not fetched" when the store lacks the box or a month."""
    prod = _one(qs, "product")
    if prod is not None and B.canonical_product(prod) != PRODUCT:
        raise ValueError(f"only {PRODUCT} is served")
    rid, box = _box(qs)
    start, end = _one(qs, "start"), _one(qs, "end")
    if start is None or end is None:
        raise ValueError("give start and end")
    start_s, end_s = B.parse_utc_seconds(start), B.parse_utc_seconds(end)
    if end_s <= start_s:
        raise ValueError("end must be after start")
    B.refuse_closed_window(box, start_s, end_s)
    span_start, span_end = span_of(start_s, end_s)
    months = [f"{y:04d}-{m:02d}" for y, m in B.overlapping_year_months(span_start.timestamp(), span_end.timestamp())]
    head: dict[str, Any] = {
        "product": PRODUCT, "version": B.PRODUCT_INFO[PRODUCT]["version"],
        "concept_id": B.PRODUCT_INFO[PRODUCT]["concept_id"], "name": B.PRODUCT_INFO[PRODUCT]["entry_title"],
        "credit": CREDIT, "region_id": rid, "box": list(box),
        "window": {"start": B.format_utc(start_s), "end": B.format_utc(end_s)},
        "span": {"start": span_start.date().isoformat(),
                 "through": (span_end - _dt.timedelta(days=1)).date().isoformat(), "months": months},
    }
    bw = B.mask(box, span_start.timestamp(), span_end.timestamp(), product=PRODUCT,
                root=root if root is not None else burned_root())
    if isinstance(bw, str):
        return {**head, "state": B.NOT_FETCHED}
    cls, day, dates = classify(bw, start_s, end_s, span_start)
    g = bw.grid_spec
    counts = {name: int((cls == i).sum()) for i, name in enumerate(CLASSES)}
    burn_days: dict[str, int] = {}
    for d in sorted(dates):
        burn_days[d.isoformat()] = burn_days.get(d.isoformat(), 0) + 1
    return {
        **head, "state": "ok",
        "grid": {"cell_km": g.cell_km, "nx": g.nx, "ny": g.ny, "rows": "north to south", "cols": "west to east",
                 "same_as": "EvalGrid.from_bbox(box), cell for cell"},
        "classes": list(CLASSES), "counts": counts,
        "burned_km2": round((counts["burned_before_window"] + counts["burned_in_window"]
                             + counts["burned_after_window"]) * g.cell_area_km2, 3),
        "first_burn_date": min(dates).isoformat() if dates else None,
        "last_burn_date": max(dates).isoformat() if dates else None,
        "burn_days": burn_days,
        "day_png_values": "day of burn counted from span.start (1 is that day); 0 not burned",
        "limits": LIMITS,
        "retrieved_utc": bw.retrieved_utc,
        "_classes": cls, "_day": day,
    }


def _json(status: int, obj: dict[str, Any]) -> tuple[int, bytes, str]:
    return status, json.dumps(obj, separators=(",", ":")).encode("utf-8"), "application/json"


def burned_route(route: str, qs: dict[str, list[str]], root: Path | None = None) -> tuple[int, bytes, str] | None:
    """(status, body, content type) for `/api/burned`; None for any other route."""
    if route.rstrip("/") != PREFIX:
        return None
    try:
        fmt = (_one(qs, "format") or "json").lower()
        if fmt not in ("json", "png", "day"):
            raise ValueError("format is json, png or day")
        a = answer(qs, root)
    except B.ClosedBurnedWindow as exc:
        return _json(HTTPStatus.CONFLICT, {"error": str(exc)})
    except KeyError as exc:
        return _json(HTTPStatus.NOT_FOUND, {"error": str(exc.args[0])})
    except ValueError as exc:
        return _json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
    if a["state"] == B.NOT_FETCHED:
        return _json(HTTPStatus.NOT_FOUND, a)
    cls, day = a.pop("_classes"), a.pop("_day")
    if fmt == "png":
        return HTTPStatus.OK, png_bytes(cls, True), "image/png"
    if fmt == "day":
        return HTTPStatus.OK, png_bytes(day, False), "image/png"
    a["png"] = "data:image/png;base64," + base64.b64encode(png_bytes(cls, True)).decode("ascii")
    a["day_png"] = "data:image/png;base64," + base64.b64encode(png_bytes(day, False)).decode("ascii")
    return _json(HTTPStatus.OK, a)
