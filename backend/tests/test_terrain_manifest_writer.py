"""The terrain manifest writer (`backend/terrain/build_terrain.py`) writes the keys the tracked manifest carries and no
build or download time, so a rebuild does not put back fields the tracked file does not have. Read from the
writer's source: a rebuild downloads tiles."""

from __future__ import annotations

import ast
import json
from pathlib import Path
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
WRITER = REPO_ROOT / "backend" / "terrain" / "build_terrain.py"
TRACKED = REPO_ROOT / "website" / "public" / "generated" / "terrain" / "terrain_manifest.json"


def _dict_keys(path: Path) -> set[str]:
    keys: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Dict):
            keys |= {k.value for k in node.keys if isinstance(k, ast.Constant) and isinstance(k.value, str)}
    return keys


def _json_keys(v: object) -> set[str]:
    if isinstance(v, dict):
        return set(v) | {k for x in v.values() for k in _json_keys(x)}
    if isinstance(v, list):
        return {k for x in v for k in _json_keys(x)}
    return set()


class TerrainManifestWriterTests(unittest.TestCase):
    def test_no_time_field_and_every_tracked_key_is_written(self) -> None:
        written = _dict_keys(WRITER)
        for k in written:
            self.assertFalse(k.endswith("AtUtc") or k.endswith("_utc"), k)
        tracked = _json_keys(json.loads(TRACKED.read_text(encoding="utf-8")))
        self.assertEqual(tracked - written, set())


if __name__ == "__main__":
    unittest.main()
