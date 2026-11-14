"""Small stdlib glTF binary (.glb) helpers for the spacecraft models.

`strip_external_images` removes images stored as external file references (and the textures and material
texture slots that use them), keeping the binary chunk byte for byte. Materials keep their base colour
factors, so a model whose external textures are missing renders exactly as before, minus the loader's
failed requests.

Usage:
  uv run --no-project --python 3.12 python3 backend/terrain/glb_tools.py strip-external-images IN.glb OUT.glb
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import struct
from typing import Any

_TEX_SLOTS_PBR = ("baseColorTexture", "metallicRoughnessTexture")
_TEX_SLOTS_MAT = ("normalTexture", "occlusionTexture", "emissiveTexture")


def read_glb(data: bytes) -> tuple[dict[str, Any], list[tuple[bytes, bytes]]]:
    magic, version, length = struct.unpack("<4sII", data[:12])
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError("not a well formed glTF 2 binary")
    chunks: list[tuple[bytes, bytes]] = []
    off = 12
    while off < len(data):
        clen, ctype = struct.unpack("<I4s", data[off : off + 8])
        chunks.append((ctype, data[off + 8 : off + 8 + clen]))
        off += 8 + clen
    if not chunks or chunks[0][0] != b"JSON":
        raise ValueError("first chunk is not JSON")
    return json.loads(chunks[0][1]), chunks[1:]


def write_glb(gltf: dict[str, Any], rest: list[tuple[bytes, bytes]]) -> bytes:
    js = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    js += b" " * (-len(js) % 4)
    body = struct.pack("<I4s", len(js), b"JSON") + js
    for ctype, payload in rest:
        body += struct.pack("<I4s", len(payload), ctype) + payload
    return struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body


def strip_external_images(gltf: dict[str, Any]) -> dict[str, Any]:
    """Return a copy without images that reference external files, plus everything that used them."""
    g = json.loads(json.dumps(gltf))
    images = g.get("images", [])
    drop_img = {i for i, im in enumerate(images) if "uri" in im and not str(im["uri"]).startswith("data:")}
    textures = g.get("textures", [])
    drop_tex = {i for i, t in enumerate(textures) if t.get("source") in drop_img}
    keep_tex = [i for i in range(len(textures)) if i not in drop_tex]
    tex_map = {old: new for new, old in enumerate(keep_tex)}
    keep_img = [i for i in range(len(images)) if i not in drop_img]
    img_map = {old: new for new, old in enumerate(keep_img)}

    def fix(slot_owner: dict[str, Any], slot: str) -> None:
        ref = slot_owner.get(slot)
        if ref is None:
            return
        if ref["index"] in drop_tex:
            del slot_owner[slot]
        else:
            ref["index"] = tex_map[ref["index"]]

    for mat in g.get("materials", []):
        pbr = mat.get("pbrMetallicRoughness", {})
        for slot in _TEX_SLOTS_PBR:
            fix(pbr, slot)
        for slot in _TEX_SLOTS_MAT:
            fix(mat, slot)

    new_textures = []
    for i in keep_tex:
        t = dict(textures[i])
        if "source" in t:
            t["source"] = img_map[t["source"]]
        new_textures.append(t)
    used_samplers = sorted({t["sampler"] for t in new_textures if "sampler" in t})
    s_map = {old: new for new, old in enumerate(used_samplers)}
    for t in new_textures:
        if "sampler" in t:
            t["sampler"] = s_map[t["sampler"]]
    samplers = [g["samplers"][i] for i in used_samplers] if "samplers" in g else []

    for key, value in (("images", [images[i] for i in keep_img]), ("textures", new_textures), ("samplers", samplers)):
        if value:
            g[key] = value
        else:
            g.pop(key, None)
    return g


def main() -> int:
    ap = argparse.ArgumentParser(description="glTF binary helpers")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("strip-external-images")
    s.add_argument("src", type=Path)
    s.add_argument("dst", type=Path)
    args = ap.parse_args()
    gltf, rest = read_glb(args.src.read_bytes())
    out = write_glb(strip_external_images(gltf), rest)
    args.dst.write_bytes(out)
    print(f"wrote {args.dst} ({len(out)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
