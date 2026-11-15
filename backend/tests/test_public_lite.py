"""The small copies of a recording's terrain packs (`backend/public_lite.py`): the same grid and pictures made small,
entered in the index beside the full files, and the recording's answers untouched."""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image

from backend import public_lite as L


def _store(folder: Path, entries: dict, key: str, data: bytes, ext: str) -> None:
    sha = hashlib.sha256(data).hexdigest()
    (folder / "files" / f"{sha}.{ext}").write_bytes(data)
    entries[key] = {"status": 200, "file": f"files/{sha}.{ext}", "bytes": len(data), "sha256": sha}


def _picture(size: int, mode: str, fmt: str) -> bytes:
    img = Image.new(mode, (size, size), (200, 120, 40, 255)[: len(mode)])
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


class PublicLiteTests(unittest.TestCase):
    def test_small_copies_of_a_pack_and_its_context_on_the_same_grid(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "files").mkdir()
            entries: dict = {}
            base = "/api/runs/r_firms_x_holdoutviirs_challenger_blend/terrain"
            n = 9
            dem = np.arange(n * n, dtype="<f4").reshape(n, n)
            for name, data, ext in [(f"{base}/p_dem_1024_f32.bin", dem.tobytes(), "bin"),
                                    (f"{base}/p_context_dem_1024_f32.bin", (dem * 2).tobytes(), "bin"),
                                    (f"{base}/p_ortho_4096.jpg", _picture(64, "RGB", "JPEG"), "jpg"),
                                    (f"{base}/p_context_ortho_4096.jpg", _picture(64, "RGB", "JPEG"), "jpg"),
                                    (f"{base}/p_aux_2048.png", _picture(32, "RGBA", "PNG"), "png")]:
                _store(folder, entries, f"GET {name}", data, ext)
            pack = {"dem": {"url": f"{base}/p_dem_1024_f32.bin", "size": n, "format": "f32le"},
                    "ortho": {"url": f"{base}/p_ortho_8192.jpg", "size": 8192},
                    "ortho_fallback": {"url": f"{base}/p_ortho_4096.jpg", "size": 4096},
                    "aux": {"url": f"{base}/p_aux_2048.png", "size": 32, "channels": {"r": "normal_x"}},
                    "context": {"extent_km": [200, 200], "scale": 5,
                                "dem": {"url": f"{base}/p_context_dem_1024_f32.bin", "size": n, "format": "f32le"},
                                "ortho": {"url": f"{base}/p_context_ortho_4096.jpg", "size": 4096}}}
            answer = json.dumps({"run_id": "r", "assets": {"terrain_pack": pack}}).encode()
            run_key = 'POST /api/reconstruct {"region_id":"r"}'
            _store(folder, entries, run_key, answer, "json")
            (folder / "index.json").write_text(json.dumps({"version": 1, "entries": entries}))

            made = L.add_lite(folder)
            self.assertEqual(made["copies"], 6)                  # dem, ortho (and its fallback), aux, context dem and ortho
            index = json.loads((folder / "index.json").read_text())
            lite = index["lite"]
            self.assertEqual(lite[f"{base}/p_ortho_8192.jpg"], lite[f"{base}/p_ortho_4096.jpg"])
            small_dem = np.frombuffer((folder / index["entries"][lite[pack["dem"]["url"]]["key"]]["file"]).read_bytes(), "<f4")
            self.assertEqual(small_dem.size, L.DEM_SIZE ** 2)
            grid = small_dem.reshape(L.DEM_SIZE, L.DEM_SIZE)
            # the samples on the box's edges stay where they were: the corners are the full grid's corners
            self.assertEqual((grid[0, 0], grid[0, -1], grid[-1, 0], grid[-1, -1]), (dem[0, 0], dem[0, -1], dem[-1, 0], dem[-1, -1]))
            self.assertEqual(lite[pack["dem"]["url"]]["size"], L.DEM_SIZE)
            ortho = Image.open(folder / index["entries"][lite[pack["ortho"]["url"]]["key"]]["file"])
            self.assertEqual((ortho.format, ortho.size), ("JPEG", (L.ORTHO_SIZE, L.ORTHO_SIZE)))
            aux = Image.open(folder / index["entries"][lite[pack["aux"]["url"]]["key"]]["file"])
            self.assertEqual((aux.format, aux.mode, aux.size), ("PNG", "RGBA", (L.AUX_SIZE, L.AUX_SIZE)))
            self.assertIn(f"GET /lite{base}/p_context_dem_1024_f32.bin", index["entries"])
            # the recorded answer is the same bytes, and a second pass changes nothing
            self.assertEqual((folder / index["entries"][run_key]["file"]).read_bytes(), answer)
            before = (folder / "index.json").read_text()
            L.add_lite(folder)
            self.assertEqual(json.loads((folder / "index.json").read_text())["lite"], json.loads(before)["lite"])


if __name__ == "__main__":
    unittest.main()
