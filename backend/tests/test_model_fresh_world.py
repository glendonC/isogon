"""The plan of the fresh test is made from MODIS files alone: no file of a sharp satellite is opened.

A made-up store holds one country's MODIS and VIIRS files, from the synthetic fixture moved to a place far from the
three first regions. The plan is built from it and every file the plan opens is recorded.
"""

from __future__ import annotations

import builtins
import functools
import hashlib
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
from backend.model.episodes import find_episodes  # noqa: E402

FIRST = [region_box(r) for r in F.FIRST_REGIONS]
DLON, DLAT = 117.0, -1.0            # the fixture's fire moved to about 4 W, 39 N, far from the three first regions


def _moved(rows):
    return [{**r, "longitude": f"{float(r['longitude']) + DLON:.4f}", "latitude": f"{float(r['latitude']) + DLAT:.4f}"}
            for r in rows]


ROWS = _moved(fx.extended_rows())
MODIS = [r for r in ROWS if r["instrument"] == "MODIS"]
VIIRS = [r for r in ROWS if r["instrument"] != "MODIS"]


def _write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cols = list(rows[0])
    path.write_text(",".join(cols) + "\n" + "\n".join(",".join(r[c] for c in cols) for r in rows) + "\n", encoding="utf-8")


def _store(root: Path, modis: list[dict[str, str]], viirs: list[dict[str, str]] | None) -> Path:
    store = root / "world"
    _write_csv(store / "firms" / "raw" / "modis" / "2099" / "modis_2099_Madeupland.csv", modis)
    if viirs is not None:
        _write_csv(store / "firms" / "raw" / "viirs-snpp" / "2099" / "viirs-snpp_2099_Madeupland.csv", viirs)
    (store / "firms" / "READY.json").write_text(json.dumps({"countries": [{"country": "Madeupland", "digest": "x"}]}))
    listing = store / "firms" / "listing" / "yearly_summary_files.txt"
    listing.parent.mkdir(parents=True, exist_ok=True)
    listing.write_text("filename,size,updated\nmodis_2099_Madeupland.csv,1,x\nmodis_2099_Elsewhere.csv,1,x\n")
    return store


def _plan(modis, viirs, opened: list[str] | None = None) -> dict:
    """The plan of a made-up store, with every place given test A (the made-up place's own block may have none)
    and the episodes' least number of MODIS pixels lowered to 40, as the other tests on these rows do."""
    with tempfile.TemporaryDirectory() as tmp:
        store = _store(Path(tmp), modis, viirs)
        work = Path(tmp) / "work"
        work.mkdir()
        real_open, real_path_open, real_bytes = builtins.open, Path.open, Path.read_bytes

        def note(p):
            if opened is not None:
                opened.append(str(p))

        def b_open(file, *a, **k):
            note(file)
            return real_open(file, *a, **k)

        def p_open(self, *a, **k):
            note(self)
            return real_path_open(self, *a, **k)

        def p_bytes(self):
            note(self)
            return real_bytes(self)

        smaller = functools.partial(find_episodes, min_modis_pixels=40)
        with mock.patch.object(F, "role_of_place", lambda place, first: "test_a"), \
                mock.patch.object(W, "find_episodes", smaller), mock.patch.object(builtins, "open", b_open), \
                mock.patch.object(Path, "open", p_open), mock.patch.object(Path, "read_bytes", p_bytes):
            doc = W.build_plan(store, work, workers=1, first_boxes=FIRST, log=lambda _m: None, years=(2099,))
    return doc


class NoSharpFileTests(unittest.TestCase):
    def test_the_plan_opens_no_file_of_a_sharp_satellite(self) -> None:
        opened: list[str] = []
        doc = _plan(MODIS, VIIRS, opened)
        self.assertTrue(any("modis_2099_Madeupland.csv" in p for p in opened))
        self.assertEqual([p for p in opened if "viirs" in p.lower()], [])
        self.assertGreater(len(doc["episodes"]["test_a"]), 0)

    def test_the_plan_is_the_same_whatever_the_sharp_files_hold_or_whether_they_exist(self) -> None:
        want = _plan(MODIS, VIIRS)
        for viirs in (None, fx.perturb_hidden(VIIRS, drop_every=2), [{**r, "frp": "999"} for r in VIIRS]):
            got = _plan(MODIS, viirs)
            self.assertEqual(F.plan_sha256(got), F.plan_sha256(want))

    def test_a_path_of_another_product_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            W._split_one(("/x/firms/raw/viirs-snpp/2099/viirs-snpp_2099_A.csv", 2099, "A", "/x/work"))


class PlanTests(unittest.TestCase):
    def test_the_plan_finds_what_the_rule_in_use_finds_on_the_same_rows(self) -> None:
        doc = _plan(MODIS, VIIRS)
        place = F.place_of(-4.2, 39.0)
        pid = F.place_id(place)
        box = F.place_box(place)
        inside = [r for r in MODIS if box[0] <= float(r["longitude"]) <= box[2] and box[1] <= float(r["latitude"]) <= box[3]]
        from types import SimpleNamespace
        preset = {pid: SimpleNamespace(bbox=SimpleNamespace(west=box[0], south=box[1], east=box[2], north=box[3]))}
        direct = find_episodes((2099,), lambda *a, **k: inside, lambda _r: box, preset, regions=(pid,), min_modis_pixels=40)
        planned = doc["places"]["with_an_episode"][pid]
        self.assertEqual(planned["episodes_found"], len(direct))
        self.assertEqual(sorted(e["key"] for e in doc["episodes"]["test_a"]),
                         sorted(f"{pid}:2099:{e.tile[0]}{e.tile[1]}" for e in direct)[: F.PER_PLACE][: len(doc["episodes"]["test_a"])])

    def test_each_file_read_is_named_with_the_sha256_of_its_bytes_and_the_left_out_country_is_named(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = _store(Path(tmp), MODIS, VIIRS)
            data = (store / "firms" / "raw" / "modis" / "2099" / "modis_2099_Madeupland.csv").read_bytes()
        doc = _plan(MODIS, VIIRS)
        self.assertEqual([f["sha256"] for f in doc["modis_files"]], [hashlib.sha256(data).hexdigest()])
        self.assertEqual(doc["store"]["countries_left_out"], ["Elsewhere"])
        self.assertEqual(doc["protocol_sha256"], F.protocol_sha256())

    def test_volcanoes_static_sources_and_offshore_rows_are_left_out(self) -> None:
        typed = [dict(r) for r in MODIS]
        for k, r in enumerate(typed[:6]):
            r["type"] = ("1", "2", "3", "0", "0", "0")[k]
        doc = _plan(typed, VIIRS)
        self.assertEqual(doc["modis_files"][0]["rows_left_out_by_type"], {"1": 1, "2": 1, "3": 1})
        self.assertEqual(doc["modis_files"][0]["rows_kept"], len(typed) - 3)

    def test_a_row_on_the_line_between_two_places_is_in_both(self) -> None:
        self.assertEqual(sorted(W._places_of(-2.5, 39.0)), sorted([F.place_of(-2.5, 39.0), F.place_of(-2.6, 39.0)]))
        self.assertEqual(len(W._places_of(-2.5, 40.0)), 4)
        self.assertEqual(W._places_of(-3.1, 39.2), [F.place_of(-3.1, 39.2)])
        self.assertEqual(W._places_of(180.0, 0.1), [F.place_of(180.0, 0.1)])


if __name__ == "__main__":
    unittest.main()
