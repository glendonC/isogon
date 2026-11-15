"""Small copies of every terrain pack a recording holds, so a public page draws its first screen from a few MB and
takes the full pack after.

    python3 -m backend.public_lite <recording folder>

For each recorded run answer whose `assets.terrain_pack` names its files (and its `context`): the elevation resampled
to 256 by 256 on the same grid (its samples on the box's edges, so linear interpolation between them), the picture
(the 4096 fallback, else the full one) to 1024 by 1024 JPEG, the aux picture to 512 by 512 PNG. Each copy is written
content addressed into the recording's `files/`, entered in its index under the key `GET /lite<the full file's
path>`, and listed in the index's `lite` map, `{full path: {"key": ..., "size": ...}}`. The recording's answers are
not changed; the page reads the map (`website/src/lib/api.ts`). numpy and Pillow only.
"""
from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

DEM_SIZE: int = 256
ORTHO_SIZE: int = 1024
AUX_SIZE: int = 512
WHAT: str = ("small copies of each recorded terrain pack's files, for a public page's first screen: the elevation "
             f"at {DEM_SIZE} on the same grid, the picture at {ORTHO_SIZE} (JPEG), the aux picture at {AUX_SIZE} (PNG); "
             "the page takes the full files after")


def resample_dem(raw: bytes, size: int, to: int = DEM_SIZE) -> bytes:
    """A square little-endian f32 elevation grid whose samples sit on the box's edges, resampled to `to` by `to` by
    linear interpolation between the same edges."""
    grid = np.frombuffer(raw, dtype="<f4").reshape(size, size).astype(np.float64)
    at = np.linspace(0.0, size - 1.0, to)
    lo = np.floor(at).astype(int)
    hi = np.minimum(lo + 1, size - 1)
    w = at - lo
    rows = grid[lo] * (1.0 - w)[:, None] + grid[hi] * w[:, None]
    out = rows[:, lo] * (1.0 - w)[None, :] + rows[:, hi] * w[None, :]
    return out.astype("<f4").tobytes()


def shrink_picture(raw: bytes, to: int, fmt: str) -> bytes:
    """A picture made `to` by `to` (Lanczos), as JPEG (quality 85) or PNG; the aux picture keeps its four channels."""
    img = Image.open(io.BytesIO(raw))
    img.load()
    if fmt == "JPEG" and img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    small = img.resize((to, to), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    small.save(buf, format=fmt, **({"quality": 85, "optimize": True} if fmt == "JPEG" else {"optimize": True}))
    return buf.getvalue()


def _key(path: str) -> str:
    return f"GET {path}"


def add_lite(folder: Path) -> dict[str, Any]:
    """Write the small copies into a recording folder and enter them in its index; returns what was made."""
    folder = Path(folder)
    index_path = folder / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    entries: dict[str, Any] = index["entries"]
    lite: dict[str, Any] = dict(index.get("lite") or {})

    def stored(path: str) -> bytes | None:
        e = entries.get(_key(path))
        return (folder / e["file"]).read_bytes() if e and e.get("file") else None

    def put(full: str, data: bytes, ext: str, ctype: str, size: int) -> None:
        sha = hashlib.sha256(data).hexdigest()
        f = folder / "files" / f"{sha}.{ext}"
        if not f.exists():
            f.write_bytes(data)
        key = _key(f"/lite{full}")
        entries[key] = {"status": 200, "content_type": ctype, "file": f"files/{sha}.{ext}", "bytes": len(data), "sha256": sha}
        lite[full] = {"key": key, "size": size}

    def dem(entry: Any) -> None:
        if isinstance(entry, dict) and entry.get("url") and entry["url"] not in lite and entry.get("format") == "f32le":
            raw = stored(entry["url"])
            if raw is not None and len(raw) == int(entry["size"]) ** 2 * 4:
                put(entry["url"], resample_dem(raw, int(entry["size"])), "bin", "application/octet-stream", DEM_SIZE)

    def picture(entry: Any, source: Any, to: int, fmt: str) -> None:
        if not (isinstance(entry, dict) and entry.get("url")) or entry["url"] in lite:
            return
        raw = stored(source["url"]) if isinstance(source, dict) and source.get("url") else None
        raw = raw if raw is not None else stored(entry["url"])
        if raw is not None:
            ext, ctype = ("jpg", "image/jpeg") if fmt == "JPEG" else ("png", "image/png")
            put(entry["url"], shrink_picture(raw, to, fmt), ext, ctype, to)
            if isinstance(source, dict) and source.get("url"):
                lite[source["url"]] = lite[entry["url"]]       # the fallback's address takes the same small copy

    for key, e in list(entries.items()):
        if not key.startswith("POST /api/reconstruct ") or not e.get("file"):
            continue
        try:
            answer = json.loads((folder / e["file"]).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        pack = ((answer.get("assets") or {}).get("terrain_pack")) if isinstance(answer, dict) else None
        if not isinstance(pack, dict):
            continue
        dem(pack.get("dem"))
        picture(pack.get("ortho"), pack.get("ortho_fallback"), ORTHO_SIZE, "JPEG")
        picture(pack.get("aux"), None, AUX_SIZE, "PNG")
        ctx = pack.get("context")
        if isinstance(ctx, dict):
            dem(ctx.get("dem"))
            picture(ctx.get("ortho"), None, ORTHO_SIZE, "JPEG")

    index["entries"] = dict(sorted(entries.items()))
    index["lite"] = dict(sorted(lite.items()))
    index["lite_what"] = WHAT
    index_path.write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8")
    made = [entries[v["key"]] for v in lite.values()]
    return {"copies": len(lite), "bytes": sum(m["bytes"] for m in made), "files": len({m["file"] for m in made})}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 -m backend.public_lite <recording folder>")
    print(json.dumps(add_lite(Path(sys.argv[1]))))
