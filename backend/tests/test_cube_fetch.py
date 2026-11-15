"""The world store's fetch order and its check of a stored file, without the network."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from backend.firms import archive, world_fetch


def _listing(sizes: dict[str, int]) -> dict[str, dict[str, object]]:
    return {name: {"size": n, "updated": "2025-01-01 00:00:00"} for name, n in sizes.items()}


class FetchOrder(unittest.TestCase):
    def test_first_countries_lead_then_smallest_up(self) -> None:
        listing = _listing({
            "modis_2020_Brazil.csv": 900, "modis_2020_Monaco.csv": 5, "modis_2020_Portugal.csv": 400,
            "modis_2020_Ghana.csv": 50, "viirs-snpp_2020_Ghana.csv": 60, "modis_2020_Fiji.csv": 30,
            "AttributesReadme.txt": 10,
        })
        by = world_fetch.tasks_by_country(listing)
        self.assertEqual(world_fetch.order(by, first=("Portugal", "Ghana", "Atlantis")),
                         ["Portugal", "Ghana", "Monaco", "Fiji", "Brazil"])
        self.assertEqual([t[0] for t in by["Ghana"]], ["modis", "viirs-snpp"])


class StoredFileCheck(unittest.TestCase):
    def test_a_file_counts_only_when_bytes_and_sha256_match(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            store = Path(d)
            path = archive.raw_path("modis", 2020, "Fiji", store)
            path.parent.mkdir(parents=True)
            body = b"latitude,longitude\n1,2\n"
            path.write_bytes(body)
            man = {"bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "rows": 1}
            path.with_name(path.name + ".manifest.json").write_text(json.dumps(man))
            task = ("modis", 2020, "Fiji", len(body))
            self.assertIsNotNone(world_fetch.verified(task, store))
            self.assertIsNone(world_fetch.verified(("modis", 2020, "Fiji", len(body) + 1), store))
            path.write_bytes(body.replace(b"1,2", b"1,3"))
            self.assertIsNone(world_fetch.verified(task, store))


if __name__ == "__main__":
    unittest.main()
