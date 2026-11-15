"""The tracked record of live seals: only added to, committed alone, never while the working tree is busy."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.live import record as R  # noqa: E402


def _seal(n: int) -> dict:
    return {"sha256": f"{n:064x}", "sealed_utc": f"2026-11-20T0{n}:00:00Z", "fire": {"id": f"c0f0{n}"},
            "slot": {"platform": "VIIRS_NOAA20" if n % 2 else "VIIRS_NOAA21", "time_utc": f"2026-11-20T0{n}:30:00Z"}}


def _git(repo: Path, *a: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *a], capture_output=True, text=True, check=True).stdout.strip()


class RecordTests(unittest.TestCase):
    def _repo(self, d: str) -> Path:
        repo = Path(d) / "repo"
        repo.mkdir()
        _git(repo, "init", "-q", "-b", "work")
        _git(repo, "config", "user.name", "t")
        _git(repo, "config", "user.email", "t@example.invalid")
        (repo / "other.txt").write_text("a\n")
        _git(repo, "add", "other.txt")
        _git(repo, "commit", "-q", "-m", "First.")
        return repo

    def test_the_record_is_added_to_and_committed_alone(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            repo, notes = self._repo(d), Path(d) / "notes"
            # an unrelated change is staged and another is not: neither may enter the record's commit
            (repo / "other.txt").write_text("b\n")
            _git(repo, "add", "other.txt")
            (repo / "loose.txt").write_text("c\n")
            sha = R.sync(repo, [_seal(1)], notes, log=lambda m: None)
            self.assertEqual(_git(repo, "show", "--name-only", "--format=", sha), R.RECORD_PATH)
            self.assertEqual(_git(repo, "log", "-1", "--format=%B", sha).strip().count("\n"), 0)
            lines = (repo / R.RECORD_PATH).read_text().splitlines()
            self.assertEqual(lines[0], R.HEADER)
            self.assertEqual(lines[1], f"2026-11-20T01:00:00Z,{1:064x},c0f01,NOAA-20,2026-11-20T01:30:00Z")
            self.assertIsNone(R.sync(repo, [_seal(1)], notes, log=lambda m: None))
            sha2 = R.sync(repo, [_seal(1), _seal(2), _seal(3)], notes, log=lambda m: None)
            self.assertEqual(len((repo / R.RECORD_PATH).read_text().splitlines()), 4)
            self.assertIn("other.txt", _git(repo, "diff", "--cached", "--name-only"))   # still staged, not committed
            index = (notes / "RECORD.md").read_text()
            self.assertIn(sha, index)
            self.assertIn(sha2, index)
            self.assertEqual(len(list((notes / "record").glob("*.patch"))), 2)
            with self.assertRaises(RuntimeError):     # a line already written is never changed or dropped
                R.sync(repo, [_seal(2)], notes, log=lambda m: None)

    def test_nothing_is_committed_while_a_rebase_is_in_progress(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            repo = self._repo(d)
            (Path(_git(repo, "rev-parse", "--absolute-git-dir")) / "rebase-merge").mkdir()
            head = _git(repo, "rev-parse", "HEAD")
            self.assertIsNone(R.sync(repo, [_seal(1)], None, log=lambda m: None))
            self.assertEqual(_git(repo, "rev-parse", "HEAD"), head)


if __name__ == "__main__":
    unittest.main()
