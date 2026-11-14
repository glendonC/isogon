"""Spacecraft model manifest integrity (CONTRACT section 2)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
import sys
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

MODEL_DIR = REPO_ROOT / "website" / "public" / "models" / "spacecraft"


def _glb_json(data: bytes) -> dict:
    magic, version, length = struct.unpack("<4sII", data[:12])
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError("not a well formed glTF 2 binary")
    clen, ctype = struct.unpack("<I4s", data[12:20])
    if ctype != b"JSON":
        raise ValueError("first chunk is not JSON")
    return json.loads(data[20 : 20 + clen])


class SpacecraftManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = json.loads((MODEL_DIR / "manifest.json").read_text(encoding="utf-8"))

    def test_entries_match_files(self) -> None:
        self.assertEqual(self.manifest["version"], 1)
        ids = [m["id"] for m in self.manifest["models"]]
        self.assertEqual(ids, ["terra", "aqua", "suomi_npp"])
        for m in self.manifest["models"]:
            with self.subTest(model=m["id"]):
                path = REPO_ROOT / "website" / "public" / m["url"].lstrip("/")
                data = path.read_bytes()
                self.assertEqual(len(data), m["bytes"])
                self.assertEqual(hashlib.sha256(data).hexdigest(), m["sha256"])
                for key in ("source_url", "license", "credit", "up_axis", "notes"):
                    self.assertTrue(m[key])
                self.assertGreater(m["approx_length_m"], 0)

    def test_models_reference_no_external_files(self) -> None:
        for m in self.manifest["models"]:
            with self.subTest(model=m["id"]):
                g = _glb_json((REPO_ROOT / "website" / "public" / m["url"].lstrip("/")).read_bytes())
                for img in g.get("images", []):
                    self.assertNotIn("uri", img, f"{m['id']} image points at an external file")
                n_tex = len(g.get("textures", []))
                for mat in g.get("materials", []):
                    for slot in ("baseColorTexture", "metallicRoughnessTexture"):
                        ref = mat.get("pbrMetallicRoughness", {}).get(slot)
                        if ref is not None:
                            self.assertLess(ref["index"], n_tex)
                    for slot in ("normalTexture", "occlusionTexture", "emissiveTexture"):
                        if slot in mat:
                            self.assertLess(mat[slot]["index"], n_tex)


if __name__ == "__main__":
    unittest.main()
