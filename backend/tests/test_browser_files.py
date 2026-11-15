"""The browser's file lists hold every file a held-out run and a round read there. A tree is made of the listed files
alone and the backend's Python files, with the place's calendar file and the round's reference players made into it
as the build makes them, and the entry point is run in that tree in a child process. The test fails when the run
or the round opens a file outside the tree (beside Python's own), or when its answer is not the full tree's. On the
Chips Fire of 2012 (`plumas_ca`) and the Thomas Fire of 2017 (`ventura_ca`), where their rows are cached; no
window of a test fire is run."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

EXTRACTS = _REPO_ROOT / "data" / "cache" / "firms" / "extract"
FIRES = [(r, s) for r, s in (("plumas_ca", "2012-08-10"), ("ventura_ca", "2017-12-05")) if (EXTRACTS / r).is_dir()]
LOOKS = 2

# A child process in the tree: the entry point's run and reveal, or a round, under an audit hook. It prints every file
# opened, Python's own folders, and the answers.
_IN_THE_TREE = r"""
import json, os, sys
root = os.getcwd()
sys.path.insert(0, root)
region, start, what, looks = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
opened = set()
def hook(event, args):
    if event == "open" and args and isinstance(args[0], (str, bytes, os.PathLike)):
        opened.add(os.path.abspath(os.fsdecode(args[0])))
from backend import browser as B
sys.addaudithook(hook)
out = {}
if what == "run":
    first = B.held_out_run(region, start)
    out["reveal"] = B.reveal(first["run_id"])
else:
    r = B.round_start(region, start=start)
    k = 0
    while True:
        o = B.round_look(r["round_id"], k, 0 if k < looks else -1)
        k += 1
        if o["done"]:
            break
    out["end"] = o["end"]
print(json.dumps({"opened": sorted(p for p in opened if os.path.isfile(p)),
                  "python": sorted({sys.prefix, sys.base_prefix, sys.exec_prefix}), **out}, default=str))
"""


def _tree(tmp: str, names: list[str], region: str, start: str) -> Path:
    """The listed files and the Python files copied into a tree of their own, the calendar file and the round's
    reference players made into it from the full cache, as `backend.browser.prepare` makes them."""
    from backend import browser as B
    from backend.firms.archive import FIRMS_CACHE_DIR
    from backend.firms.calendar_pack import build, pack_path

    tree = Path(tmp) / "tree"
    made = {os.path.relpath(pack_path(region), _REPO_ROOT)}
    for rel in set(B.python_files()) | set(names):
        if rel in made or "next_look_reference" in rel:
            continue
        (tree / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(_REPO_ROOT / rel, tree / rel)
    build(region, FIRMS_CACHE_DIR, out_dir=tree / "data" / "cache" / "firms")
    B.write_round_reference(region, start=start, out_dir=tree / os.path.relpath(B.reference_dir(), _REPO_ROOT))
    return tree


def _child(tree: Path, region: str, start: str, what: str) -> dict:
    out = subprocess.run([sys.executable, "-c", _IN_THE_TREE, region, start, what, str(LOOKS)], cwd=tree,
                         capture_output=True, text=True, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
    if out.returncode != 0:
        raise AssertionError(f"the {what} failed in a tree of the listed files alone:\n{out.stderr[-3000:]}")
    return json.loads(out.stdout.strip().splitlines()[-1])


def _outside(doc: dict, tree: Path) -> list[str]:
    allowed = tuple(os.path.realpath(p) + os.sep for p in doc["python"]) + (os.path.realpath(tree) + os.sep,)
    return [p for p in doc["opened"] if not os.path.realpath(p).startswith(allowed)]


def _comparable(doc: dict) -> str:
    doc = copy.deepcopy(doc)
    for stage in doc.get("pipeline_stages", []):
        stage.pop("duration_ms", None)
    return json.dumps(doc, sort_keys=True, default=str)


@unittest.skipUnless(FIRES, "no cached rows of plumas_ca or ventura_ca here")
class FileListTests(unittest.TestCase):
    def test_a_run_in_a_tree_of_the_listed_files_alone_opens_nothing_else_and_answers_as_the_full_tree(self) -> None:
        from backend import browser as B

        for region, start in FIRES:
            with tempfile.TemporaryDirectory() as tmp:
                tree = _tree(tmp, B.files_for_a_run(region, start), region, start)
                doc = _child(tree, region, start, "run")
                self.assertEqual(_outside(doc, tree), [], (region, start))
                # no row of a year the run does not touch: the calendar answered from its file
                rows = [p for p in doc["opened"] if "/extract/" in p and p.endswith(".csv")]
                self.assertTrue(rows)
                years = (int(start[:4]), int(start[:4]) + 1)
                self.assertFalse([p for p in rows if not any(f"_{y}.csv" in p for y in years)])
            here = B.reveal(B.held_out_run(region, start)["run_id"])
            self.assertEqual(_comparable(doc["reveal"]), _comparable(json.loads(json.dumps(here, default=str))), region)

    def test_a_round_in_a_tree_of_the_round_s_files_alone_opens_nothing_else_and_ends_with_its_reference(self) -> None:
        from backend import browser as B

        region, start = FIRES[0]
        with tempfile.TemporaryDirectory() as tmp:
            tree = _tree(tmp, B.files_for_a_round(region, start), region, start)
            doc = _child(tree, region, start, "round")
        self.assertEqual(_outside(doc, tree), [])
        self.assertEqual(doc["end"]["reference_status"], "ready")
        self.assertEqual(doc["end"]["reference_cache"]["from"], "a file made at build time")

    def test_a_place_s_list_is_small(self) -> None:
        from backend import browser as B

        for region, start in FIRES:
            size = sum((_REPO_ROOT / p).stat().st_size for p in B.files_for_a_round(region, start)
                       if (_REPO_ROOT / p).is_file())
            self.assertLess(size, 30e6, region)
        self.assertFalse([p for p in B.python_files() if "/tests/" in p])


@unittest.skipUnless(FIRES, "no cached rows of plumas_ca or ventura_ca here")
class PackListTests(unittest.TestCase):
    def test_the_pack_list_names_paths_inside_the_tree_and_never_a_key_or_the_world_store(self) -> None:
        from backend import browser as B

        region, start = FIRES[0]
        doc = B.pack_list({region: start})
        self.assertEqual(doc["version"], B.PACK_LIST_VERSION)
        place = doc["places"][region]
        self.assertEqual(place["start"], start)
        self.assertIn("backend/browser.py", place["modules"])
        for p in place["modules"] + place["files"]:
            parts = Path(p).parts
            self.assertFalse(Path(p).is_absolute() or ".." in parts, p)
            self.assertFalse(any(x.startswith(".env") or x == ".git" for x in parts), p)
            self.assertNotIn("isogon-world", p)
        self.assertTrue(set(B.files_for_a_run(region, start)) <= set(place["files"]))


if __name__ == "__main__":
    unittest.main()
