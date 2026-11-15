"""The browser's archives (backend/browser_pack.py): the core and one archive per place, made the same way every time,
checked against their manifest, and never holding a file outside the tree, the key's file, the world store or .git."""

from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

from backend import browser_pack as P

KEY_TEXT = b"FIRMS_MAP_KEY=a-made-up-value-for-the-test"


def _tree(d: Path) -> tuple[Path, Path]:
    """(a tree with two places' files, a folder outside it)."""
    root, outside = d / "tree", d / "outside"
    files = {
        "backend/model/solver.py": b"def solve():\n    return 1\n",
        "backend/model/__init__.py": b"",
        "backend/model/fitted_values/plan.json": b'{"plan": 1}\n',
        "data/cache/firms/raw/modis_2012_X.csv.manifest.json": b'{"rows": 1}\n',
        "data/cache/firms/listing/yearly_summary_files.txt": b"filename,size,updated\n",
        "data/cache/firms/extract/a_place/a_2012.csv": b"latitude,longitude\n1,2\n",
        "data/cache/firms/extract/b_place/b_2017.csv": b"latitude,longitude\n3,4\n",
        "data/cache/hires_regions/a_place_dem_256_f32.bin": bytes(range(256)),
        "data/cache/world/cube/current/records.npy": b"world",
        "store/cube/records.npy": b"another world",
        ".env": KEY_TEXT + b"\n",
        "sub/.env.local": KEY_TEXT + b"\n",
        ".git/config": b"[core]\n",
    }
    for rel, body in files.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_bytes(body)
    outside.mkdir()
    (outside / "secret.txt").write_bytes(b"outside")
    (root / "data/cache/link_out.txt").symlink_to(outside / "secret.txt")
    (root / "data/cache/link_key.txt").symlink_to(root / ".env")
    return root, outside


def _list(d: Path, places: dict[str, list[str]], modules: list[str] | None = None, core: list[str] | None = None) -> Path:
    spec = {"version": 1, "places": {r: {"start": "2012-08-10", "modules": modules or ["backend/model/__init__.py",
                                                                                       "backend/model/solver.py"],
                                         "files": files} for r, files in places.items()}}
    if core is not None:
        spec["core"] = core
    p = d / f"list-{len(list(d.glob('list-*.json')))}.json"
    p.write_text(json.dumps(spec))
    return p


SHARED = ["backend/model/fitted_values/plan.json", "data/cache/firms/raw/modis_2012_X.csv.manifest.json",
          "data/cache/firms/listing/yearly_summary_files.txt"]
A_FILES = SHARED + ["data/cache/firms/extract/a_place/a_2012.csv", "data/cache/hires_regions/a_place_dem_256_f32.bin"]
B_FILES = SHARED + ["data/cache/firms/extract/b_place/b_2017.csv"]


class BrowserPack(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)
        self.root, self.outside = _tree(self.d)
        self.env = mock.patch.dict(os.environ, {"ISOGON_WORLD_DIR": str(self.root / "store")})
        self.env.start()

    def tearDown(self) -> None:
        self.env.stop()
        self.tmp.cleanup()

    def _pack(self, lst: Path, out: Path | None = None) -> dict:
        return P.pack([lst], out or self.d / "out", self.root, log=lambda s: None)

    def test_the_core_and_each_place(self) -> None:
        man = self._pack(_list(self.d, {"a_place": A_FILES, "b_place": B_FILES}))
        out = self.d / "out"
        with zipfile.ZipFile(out / "core.zip") as z:
            core = sorted(z.namelist())
        # every module, every file under backend/, and the files both places name
        self.assertEqual(core, sorted(["backend/model/__init__.py", "backend/model/solver.py", *SHARED]))
        with zipfile.ZipFile(out / "places/a_place.zip") as z:
            self.assertEqual(sorted(z.namelist()), ["data/cache/firms/extract/a_place/a_2012.csv",
                                                    "data/cache/hires_regions/a_place_dem_256_f32.bin"])
            self.assertEqual(z.read("data/cache/firms/extract/a_place/a_2012.csv"), b"latitude,longitude\n1,2\n")
        with zipfile.ZipFile(out / "places/b_place.zip") as z:
            self.assertEqual(z.namelist(), ["data/cache/firms/extract/b_place/b_2017.csv"])
        # each archive's bytes and sha256 in the manifest itself
        on_disk = json.loads((out / "browser-pack.json").read_text())
        self.assertEqual(on_disk, man)
        self.assertEqual((man["core"]["bytes"], man["core"]["sha256"]), ((out / "core.zip").stat().st_size,
                                                                        P._sha(out / "core.zip")))
        self.assertEqual(man["places"]["a_place"]["file"], "places/a_place.zip")
        self.assertEqual(man["places"]["a_place"]["sha256"], P._sha(out / "places/a_place.zip"))
        self.assertEqual((man["core"]["modules"], man["places"]["a_place"]["files"]), (2, 2))
        self.assertEqual(P.check(out), {"ok": True, "archives": 3, "problems": []})

    def test_the_same_files_give_the_same_bytes(self) -> None:
        lst = _list(self.d, {"a_place": A_FILES, "b_place": B_FILES})
        one = self._pack(lst, self.d / "one")
        two = self._pack(lst, self.d / "two")
        self.assertEqual(one["core"]["sha256"], two["core"]["sha256"])
        self.assertEqual(one["places"], two["places"])

    def test_check_finds_an_archive_changed(self) -> None:
        self._pack(_list(self.d, {"a_place": A_FILES, "b_place": B_FILES}))
        out = self.d / "out"
        with zipfile.ZipFile(out / "places/b_place.zip", "a") as z:
            z.writestr("data/extra.txt", b"x")
        res = P.check(out)
        self.assertFalse(res["ok"])
        self.assertEqual(res["problems"], ["places/b_place.zip: its size or sha256 is not the manifest's"])

    def test_one_place_alone_keeps_its_shared_files(self) -> None:
        man = self._pack(_list(self.d, {"a_place": A_FILES}))
        with zipfile.ZipFile(self.d / "out" / "places/a_place.zip") as z:
            self.assertIn("data/cache/firms/listing/yearly_summary_files.txt", z.namelist())
        self.assertEqual(man["core"]["files"], 3)                     # the two modules and the backend/ data file

    def test_the_spike_manifest_is_read_as_a_list(self) -> None:
        spike = self.d / "manifest_a_place.json"
        spike.write_text(json.dumps({"region": "a_place", "start": "2012-08-10",
                                     "module_files": ["backend/model/solver.py"],
                                     "data_files": [{"path": p, "bytes": 1, "inside_the_tree": True} for p in A_FILES]}))
        man = self._pack(spike)
        self.assertEqual(sorted(man["places"]), ["a_place"])
        self.assertEqual(man["places"]["a_place"]["start"], "2012-08-10")

    def test_it_refuses_and_writes_nothing(self) -> None:
        refused = {
            "the key's file": ".env",
            "a name beginning .env": "sub/.env.local",
            "a link to the key's file": "data/cache/link_key.txt",
            "a climb out of the tree": "../outside/secret.txt",
            "an absolute path outside": str(self.outside / "secret.txt"),
            "a link out of the tree": "data/cache/link_out.txt",
            "the default world store": "data/cache/world/cube/current/records.npy",
            "the world store by ISOGON_WORLD_DIR": "store/cube/records.npy",
            ".git": ".git/config",
            "a missing file": "data/cache/firms/extract/a_place/a_1999.csv",
            "a folder": "data/cache/firms",
        }
        for why, bad in refused.items():
            with self.subTest(why):
                out = self.d / f"out-{abs(hash(why))}"
                with self.assertRaises(P.Refused):
                    self._pack(_list(self.d, {"a_place": A_FILES + [bad]}), out)
                self.assertFalse(out.exists())                        # nothing was written
            with self.subTest(why + ", as a module"):
                with self.assertRaises(P.Refused):
                    self._pack(_list(self.d, {"a_place": A_FILES}, modules=[bad]), self.d / "out-m")
            with self.subTest(why + ", in the core"):
                with self.assertRaises(P.Refused):
                    self._pack(_list(self.d, {"a_place": A_FILES}, core=[bad]), self.d / "out-c")
        with self.assertRaises(P.Refused):                           # a region id that would leave places/
            self._pack(_list(self.d, {"../a_place": A_FILES}), self.d / "out-r")
        with self.assertRaises(P.Refused):                           # archives written into the world store
            self._pack(_list(self.d, {"a_place": A_FILES}), self.root / "store" / "run")

    def test_the_key_is_in_no_archive(self) -> None:
        self._pack(_list(self.d, {"a_place": A_FILES, "b_place": B_FILES}))
        for z in (self.d / "out").rglob("*.zip"):
            with zipfile.ZipFile(z) as zz:
                for n in zz.namelist():
                    self.assertNotIn(KEY_TEXT, zz.read(n))
                    self.assertFalse(Path(n).name.startswith(".env"))

    def test_an_absolute_path_inside_the_tree_is_packed_by_its_place_in_the_tree(self) -> None:
        a = [str(self.root / p) if p.endswith(".csv") else p for p in A_FILES]
        self._pack(_list(self.d, {"a_place": a}))
        with zipfile.ZipFile(self.d / "out" / "places/a_place.zip") as z:
            self.assertIn("data/cache/firms/extract/a_place/a_2012.csv", z.namelist())


VIIRS_HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type"
MODIS_HEADER = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type"
DIXIE = "39.87,-121.39"          # inside the Plumas context box, a closed region in 2021


def _rows(root: Path, rel: str, header: str, rows: list[str]) -> str:
    (root / rel).parent.mkdir(parents=True, exist_ok=True)
    (root / rel).write_text(header + "\n" + "".join(r + "\n" for r in rows))
    return rel


class ClosedWindows(unittest.TestCase):
    """No FIRMS row of a closed window goes into an archive, and the test fires' places replay only."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)
        self.root, _ = _tree(self.d)
        self.env = mock.patch.dict(os.environ, {"ISOGON_WORLD_DIR": str(self.root / "store")})
        self.env.start()

    def tearDown(self) -> None:
        self.env.stop()
        self.tmp.cleanup()

    def _pack(self, places: dict, core: list[str] | None = None, out: str = "out") -> dict:
        spec = {"version": 1, "places": {r: {"start": st, "modules": ["backend/model/solver.py"], "files": files}
                                         for r, (st, files) in places.items()}}
        if core is not None:
            spec["core"] = core
        lst = self.d / f"list-{out}.json"
        lst.write_text(json.dumps(spec))
        return P.pack([lst], self.d / out, self.root, log=lambda s: None)

    def test_a_row_inside_a_closed_window_stops_the_pack(self) -> None:
        cases = {
            "the hidden satellite's": _rows(self.root, "data/cache/firms/extract/plumas_ca/viirs-snpp_2021.csv",
                                            VIIRS_HEADER, [f"{DIXIE},330,0.4,0.4,2021-08-01,1000,N,VIIRS,h,2,290,3.0,D,0"]),
            "the older satellites'": _rows(self.root, "data/cache/firms/extract/plumas_ca/modis_2021.csv", MODIS_HEADER,
                                           ["40.5,-120.0,320,1,1,2021-12-31,1030,Terra,MODIS,85,6.03,290,10.5,D,0"]),
            "a row that cannot be placed": _rows(self.root, "data/cache/firms/extract/plumas_ca/viirs-jpss1_2021.csv",
                                                 VIIRS_HEADER, ["north,-121.39,330,0.4,0.4,2021-08-01,1000,1,VIIRS,h,2,290,3.0,D,0"]),
        }
        for why, rel in cases.items():
            for where in ("in the place's archive", "in the core"):
                with self.subTest(f"{why}, {where}"):
                    out = f"out-{abs(hash((why, where)))}"
                    places = {"plumas_ca": ("2012-08-10", A_FILES + ([rel] if where.endswith("archive") else []))}
                    with self.assertRaises(P.Refused) as cm:
                        self._pack(places, core=[rel] if where.endswith("core") else None, out=out)
                    self.assertIn("closed window", str(cm.exception))
                    self.assertFalse((self.d / out).exists())

    def test_rows_outside_a_closed_window_are_packed(self) -> None:
        a = _rows(self.root, "data/cache/firms/extract/plumas_ca/viirs-snpp_2020.csv", VIIRS_HEADER,
                  [f"{DIXIE},330,0.4,0.4,2020-08-01,1000,N,VIIRS,h,2,290,3.0,D,0"])          # the place, another year
        b = _rows(self.root, "data/cache/firms/extract/plumas_ca/viirs-snpp_2021.csv", VIIRS_HEADER,
                  ["35.0,-110.0,330,0.4,0.4,2021-08-01,1000,N,VIIRS,h,2,290,3.0,D,0"])        # 2021, far from every test fire
        man = self._pack({"plumas_ca": ("2012-08-10", A_FILES + [a, b])})
        self.assertEqual(sorted(man["places"]), ["plumas_ca"])
        self.assertEqual(sorted(w["region_id"] for w in man["closed"]["windows"]), ["evia_greece", "lytton_bc", "plumas_ca"])
        self.assertEqual(man["closed"]["windows"][0]["years"], [2021])

    def test_the_test_fires_places_replay_only(self) -> None:
        lyt = _rows(self.root, "data/cache/firms/extract/lytton_bc/modis_2017.csv", MODIS_HEADER,
                    ["50.6,-121.3,320,1,1,2017-07-08,1030,Terra,MODIS,85,6.03,290,10.5,D,0"])
        man = self._pack({"lytton_bc": ("2017-07-06", A_FILES + [lyt]), "evia_greece": ("2018-07-23", A_FILES),
                          "a_place": ("2012-08-10", A_FILES)})
        self.assertEqual(sorted(man["places"]), ["a_place"])
        self.assertEqual(man["replay_only"]["lytton_bc"], P.REPLAY_ONLY["lytton_bc"])
        self.assertEqual(man["replay_only"]["evia_greece"], P.REPLAY_ONLY["evia_greece"])
        self.assertIn("not in the lists", man["replay_only"]["ventura_ca"])     # every place of the registry is said
        self.assertFalse((self.d / "out" / "places" / "lytton_bc.zip").exists())
        self.assertEqual(P.check(self.d / "out")["problems"], [])
        from backend.model.training import EXCLUSIONS

        self.assertTrue(set(P.REPLAY_ONLY) <= set(EXCLUSIONS))

    def test_a_start_in_a_closed_window_replays_only(self) -> None:
        man = self._pack({"plumas_ca": ("2021-08-01", A_FILES), "a_place": ("2012-08-10", A_FILES)})
        self.assertNotIn("plumas_ca", man["places"])
        self.assertIn("reaches a closed window (plumas_ca, 2021)", man["replay_only"]["plumas_ca"])
        with self.assertRaises(ValueError):
            self._pack({"lytton_bc": ("2017-07-06", A_FILES)}, out="out-none")

    def test_a_start_whose_run_reaches_a_closed_window_replays_only(self) -> None:
        reach_days = P.run_reach_s() / 86400.0
        self.assertEqual(reach_days, 45.0)                                  # the server's search and frames
        man = self._pack({"plumas_ca": ("2020-12-10", A_FILES), "a_place": ("2012-08-10", A_FILES)})
        self.assertIn("reaches a closed window (plumas_ca, 2021)", man["replay_only"]["plumas_ca"])
        man = self._pack({"plumas_ca": ("2020-11-01", A_FILES)}, out="out-open")
        self.assertEqual(sorted(man["places"]), ["plumas_ca"])               # ends mid December 2020: open

    def test_the_list_s_status_is_kept_but_never_opens_a_replay_only_place(self) -> None:
        spec = {"version": 1, "places": {
            "a_place": {"start": "2012-08-10", "status": "replay only", "why": "the list's own reason", "modules": [],
                        "files": []},
            "lytton_bc": {"start": "2017-07-06", "status": "packed", "modules": ["backend/model/solver.py"],
                          "files": A_FILES},
            "b_place": {"start": "2017-12-05", "status": "packed", "modules": ["backend/model/solver.py"],
                        "files": B_FILES}}}
        lst = self.d / "list-status.json"
        lst.write_text(json.dumps(spec))
        man = P.pack([lst], self.d / "out-status", self.root, log=lambda s: None)
        self.assertEqual(sorted(man["places"]), ["b_place"])
        self.assertEqual(man["replay_only"]["a_place"], "the list's own reason")
        self.assertEqual(man["replay_only"]["lytton_bc"], P.REPLAY_ONLY["lytton_bc"])
        self.assertFalse((self.d / "out-status" / "places" / "a_place.zip").exists())


if __name__ == "__main__":
    unittest.main()
