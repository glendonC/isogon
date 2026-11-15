"""The browser's file list (`backend.browser.files_for_a_run`, `python_files`) holds every file a held-out run
opens: a run through the entry point is audited in a child process, and the test fails on any file it opens that
the list lacks. On the Chips Fire of 2012 (`plumas_ca`) and the Thomas Fire of 2017 (`ventura_ca`), where their rows
are cached; no window of a test fire is run."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

EXTRACTS = _REPO_ROOT / "data" / "cache" / "firms" / "extract"
FIRES = [(r, s) for r, s in (("plumas_ca", "2012-08-10"), ("ventura_ca", "2017-12-05")) if (EXTRACTS / r).is_dir()]

# A child process: write the place's file of the calendar's inputs to a folder of its own, run a held-out run and
# its reveal through the entry point under an audit hook, and print every file it opened.
_AUDITED_RUN = r"""
import json, os, sys
sys.path.insert(0, os.getcwd())
region, start, tmp = sys.argv[1], sys.argv[2], sys.argv[3]
from backend.model.calendar_ratio import ratio_inputs_calendar, write_ratio_inputs
write_ratio_inputs(region, tmp)
opened = set()
def hook(event, args):
    if event == "open" and args and isinstance(args[0], (str, bytes, os.PathLike)):
        opened.add(os.path.abspath(os.fsdecode(args[0])))
from backend import browser as B
sys.addaudithook(hook)
first = B.held_out_run(region, start, firms_calendar=ratio_inputs_calendar(tmp))
B.reveal(first["run_id"])
print(json.dumps(sorted(p for p in opened if os.path.isfile(p))))
"""


@unittest.skipUnless(FIRES, "no cached rows of plumas_ca or ventura_ca here")
class FileListTests(unittest.TestCase):
    def test_a_run_opens_no_file_the_list_lacks(self) -> None:
        from backend import browser as B

        root = str(_REPO_ROOT.resolve())
        py = set(B.python_files())
        for region, start in FIRES:
            listed = set(B.files_for_a_run(region, start))
            with tempfile.TemporaryDirectory() as tmp:
                out = subprocess.run([sys.executable, "-c", _AUDITED_RUN, region, start, tmp], cwd=_REPO_ROOT,
                                     capture_output=True, text=True, check=True, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
                opened = json.loads(out.stdout.strip().splitlines()[-1])
                tmp_real = str(Path(tmp).resolve())
            inside = [str(Path(p).resolve().relative_to(root)) for p in opened
                      if str(Path(p).resolve()).startswith(root + os.sep)]
            outside = [p for p in opened if not str(Path(p).resolve()).startswith((root + os.sep, tmp_real))]
            data = [p for p in inside if not p.endswith(".py")]
            self.assertEqual(sorted(set(data) - listed), [], (region, start))
            self.assertEqual(sorted({p for p in inside if p.endswith(".py")} - py), [], (region, start))
            # nothing outside the repository but the standard library and the packages
            self.assertEqual([p for p in outside if "python" not in p.lower() and "site-packages" not in p], [])
            # and no row of a year the run does not touch: the calendar read its inputs from the file
            self.assertFalse([p for p in data if "/extract/" in p and not any(f"_{y}" in p for y in self._years(start))])

    @staticmethod
    def _years(start: str) -> set[int]:
        y = int(start[:4])
        return {y - 1, y, y + 1}

    def test_a_place_s_list_is_small(self) -> None:
        from backend import browser as B

        for region, start in FIRES:
            size = sum((_REPO_ROOT / p).stat().st_size for p in B.files_for_a_run(region, start))
            self.assertLess(size, 30e6, region)
        self.assertNotIn("backend/server.py", [p for p in B.python_files() if "tests" in p])


# A child process: a round of two looks through the entry point, its reference file made first in a folder of its
# own, under an audit hook.
_AUDITED_ROUND = r"""
import json, os, sys
sys.path.insert(0, os.getcwd())
region, start, tmp = sys.argv[1], sys.argv[2], sys.argv[3]
from backend import browser as B
from backend.server_next_look import NextLookRounds
B.set_rounds(NextLookRounds(reference=False, reference_cache_dir=None, reference_seeds=1))
B.write_round_reference(region, start=start, budget=2, out_dir=tmp, store=B.rounds())
B.set_rounds(NextLookRounds(reference=False, reference_cache_dir=None, reference_seeds=1))
listed = B.files_for_a_round(region, start, budget=2)
opened = set()
def hook(event, args):
    if event == "open" and args and isinstance(args[0], (str, bytes, os.PathLike)):
        opened.add(os.path.abspath(os.fsdecode(args[0])))
sys.addaudithook(hook)
first = B.round_start(region, start=start, budget=2)
k = 0
while True:
    out = B.round_look(first["round_id"], k, 0 if k < 2 else -1, ref_dir=tmp)
    k += 1
    if out["done"]:
        break
print(json.dumps({"listed": listed, "opened": sorted(p for p in opened if os.path.isfile(p)),
                  "status": out["end"]["reference_status"]}))
"""


@unittest.skipUnless(FIRES, "no cached rows of plumas_ca or ventura_ca here")
class RoundFileListTests(unittest.TestCase):
    def test_a_round_opens_no_file_the_round_s_list_lacks(self) -> None:
        root = str(_REPO_ROOT.resolve())
        region, start = FIRES[0]
        with tempfile.TemporaryDirectory() as tmp:
            out = subprocess.run([sys.executable, "-c", _AUDITED_ROUND, region, start, tmp], cwd=_REPO_ROOT,
                                 capture_output=True, text=True, check=True)
            doc = json.loads(out.stdout.strip().splitlines()[-1])
        self.assertEqual(doc["status"], "ready")
        inside = [str(Path(p).resolve().relative_to(root)) for p in doc["opened"]
                  if str(Path(p).resolve()).startswith(root + os.sep) and not p.endswith(".py")]
        self.assertEqual(sorted(set(inside) - set(doc["listed"])), [])
        self.assertTrue(any(p.endswith(".json") and "next_look_reference" in p for p in doc["listed"]))


if __name__ == "__main__":
    unittest.main()
