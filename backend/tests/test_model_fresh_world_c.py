"""Test C of the fresh test: its places are ones the fresh test gave no role, its plan opens MODIS files alone, and
no tracked record names one of its places.
"""

from __future__ import annotations

import builtins
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.firms import region_box  # noqa: E402
from backend.model import fresh_test as F  # noqa: E402
from backend.model import fresh_world as W  # noqa: E402
from backend.model import fresh_world_c as C  # noqa: E402
from backend.model import fresh_world_run as R  # noqa: E402

FIRST = [region_box(r) for r in F.FIRST_REGIONS]


def _all_places() -> list[tuple[int, int]]:
    return [(i, j) for i in range(F._COLUMNS) for j in range(F._ROWS)]


class PlacesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fresh = R.load_plan()
        cls.left = C.boxes_left_out(cls.fresh, W.offered_regions(), FIRST)
        cls.out_boxes = [tuple(o["context_box"]) for o in cls.left]
        cls.offered = [tuple(o["context_box"]) for o in cls.fresh["offered_regions"]["regions"]]
        cls.test_c = [p for p in _all_places() if C.why_not_test_c(p, FIRST, cls.offered, cls.out_boxes) is None]

    def test_no_place_with_a_role_in_the_fresh_test_is_a_place_of_test_c(self) -> None:
        ids = {F.place_id(p) for p in self.test_c}
        self.assertTrue(ids)
        with_a_role = set(self.fresh["places"]["with_an_episode"])
        self.assertFalse(ids & with_a_role)
        for p in self.test_c:
            self.assertIsNone(F.role_of_place(p, FIRST, self.offered))

    def test_no_place_of_test_c_meets_a_region_of_the_page_or_a_first_region(self) -> None:
        names = {o["region_id"] for o in self.left}
        self.assertTrue(set(F.FIRST_REGIONS) <= names)
        for rid in ("plumas_ca", "lytton_bc", "evia_greece", "fort_mcmurray_ab"):
            self.assertIn(rid, names)
        for p in self.test_c:
            box = F.place_box(p)
            self.assertFalse(any(F._meets(box, b) for b in self.out_boxes), F.place_id(p))

    def test_a_round_of_test_c_is_told_noaa_21_has_no_look(self) -> None:
        kept, without = C.KeptPlatforms()((0, 0, 1, 1), "VIIRS", 1_704_067_200.0, 1_704_153_600.0)   # 2024-01-01
        self.assertEqual(set(kept), {"VIIRS_SNPP", "VIIRS_NOAA20"})
        self.assertEqual(set(without), {"VIIRS_NOAA21"})
        kept, without = C.KeptPlatforms()((0, 0, 1, 1), "VIIRS", 1_546_300_800.0, 1_546_387_200.0)   # 2019-01-01
        self.assertEqual(set(kept), {"VIIRS_SNPP", "VIIRS_NOAA20"})
        self.assertEqual(without, {})


def _write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cols = list(rows[0])
    path.write_text(",".join(cols) + "\n" + "\n".join(",".join(r[c] for c in cols) for r in rows) + "\n", encoding="utf-8")


class PlanReadsModisAloneTests(unittest.TestCase):
    def test_the_plan_opens_no_file_of_a_sharp_satellite(self) -> None:
        rows = fx.extended_rows()
        with tempfile.TemporaryDirectory() as tmp:
            store = Path(tmp) / "world"
            for year in C.YEARS:
                _write_csv(store / "firms" / "raw" / "modis" / str(year) / f"modis_{year}_Madeupland.csv",
                           [r for r in rows if r["instrument"] == "MODIS"])
                _write_csv(store / "firms" / "raw" / "viirs-snpp" / str(year) / f"viirs-snpp_{year}_Madeupland.csv",
                           [r for r in rows if r["instrument"] != "MODIS"])
            (store / "firms" / "READY.json").write_text(json.dumps({"countries": [{"country": "Madeupland", "digest": "x"}]}))
            work = Path(tmp) / "work"
            work.mkdir()
            opened: list[str] = []
            real_open, real_path_open, real_bytes = builtins.open, Path.open, Path.read_bytes

            def b_open(file, *a, **k):
                opened.append(str(file))
                return real_open(file, *a, **k)

            def p_open(self, *a, **k):
                opened.append(str(self))
                return real_path_open(self, *a, **k)

            def p_bytes(self):
                opened.append(str(self))
                return real_bytes(self)

            fresh = {"plan_sha256": "x", "offered_regions": {"regions": []}}
            with mock.patch.object(builtins, "open", b_open), mock.patch.object(Path, "open", p_open), \
                    mock.patch.object(Path, "read_bytes", p_bytes), \
                    mock.patch.object(C, "why_not_test_c", lambda *a, **k: None):
                doc = C.build_plan(store, work, 1, fresh, [], FIRST, log=lambda _m: None)
            self.assertEqual(len(doc["modis_files"]), len(C.YEARS))
            self.assertTrue(any("modis_" in p for p in opened))
            self.assertFalse([p for p in opened if "viirs" in p.lower()])


class PlanOnRecordTests(unittest.TestCase):
    """Test C's plan as committed: its episodes are of test C's places and years, and no other tracked record names
    one of its places."""

    def test_the_plan_on_record_holds_only_places_and_years_of_test_c(self) -> None:
        plan = C.load_plan()
        fresh = R.load_plan()
        self.assertEqual(plan["fresh_plan_sha256"], fresh["plan_sha256"])
        offered = [tuple(o["context_box"]) for o in fresh["offered_regions"]["regions"]]
        out_boxes = [tuple(o["context_box"]) for o in plan["boxes_left_out"]]
        by_id = {F.place_id(p): p for p in _all_places()}
        for ep in plan["episodes"][C.ROLE]:
            self.assertIn(int(ep["year"]), C.YEARS)
            self.assertIsNone(C.why_not_test_c(by_id[ep["place_id"]], FIRST, offered, out_boxes), ep["key"])

    def test_no_tracked_record_names_a_place_of_test_c(self) -> None:
        """Test C's own two records, its plan and its one look, are the only ones that may name its places."""
        from backend.env.tree_fit import TEST_C_FILE

        own = {C.PLAN_FILE.resolve(), TEST_C_FILE.resolve()}
        plan = C.load_plan()
        ids = {ep["place_id"] for ep in plan["episodes"][C.ROLE]}
        folders = [_REPO_ROOT / "backend" / "model" / "fitted_values", _REPO_ROOT / "backend" / "env" / "fitted",
                   _REPO_ROOT / "data"]
        for folder in folders:
            for f in folder.rglob("*"):
                if (not f.is_file() or f.resolve() in own or f.suffix not in (".json", ".csv", ".txt", ".md")
                        or "cache" in f.relative_to(_REPO_ROOT).parts):
                    continue
                text = f.read_text(encoding="utf-8", errors="ignore")
                hits = sorted(pid for pid in ids if f"\"{pid}" in text or f"{pid}:" in text)
                self.assertEqual(hits, [], f"{f.relative_to(_REPO_ROOT)} names a place of test C")


if __name__ == "__main__":
    unittest.main()
