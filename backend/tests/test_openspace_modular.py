"""The OpenSpace exporter stays apart from the rest of Isogon.

Nothing outside ``backend/openspace/``, the top-level ``openspace/`` folder and these ``test_openspace_*`` files
imports or names it, and every other backend module imports with the package made unimportable. So deleting the
two folders and these tests leaves the project as it was.
"""

from __future__ import annotations

import ast
from pathlib import Path
import subprocess
import sys
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND = REPO_ROOT / "backend"
WEBSITE = REPO_ROOT / "website"


def _own(path: Path) -> bool:
    rel = path.relative_to(REPO_ROOT).as_posix()
    return rel.startswith("backend/openspace/") or rel.startswith("openspace/") or \
        Path(rel).name.startswith("test_openspace_")


def _other_backend_modules() -> list[str]:
    names = []
    for p in sorted(BACKEND.rglob("*.py")):
        rel = p.relative_to(REPO_ROOT)
        if _own(p) or "tests" in rel.parts or "__pycache__" in rel.parts:
            continue
        parts = list(rel.with_suffix("").parts)
        if parts[-1] == "__init__":
            parts = parts[:-1]
        names.append(".".join(parts))
    return names


def _python_files() -> list[Path]:
    """Every Python file the repository tracks, and any new one beside them outside caches and packages."""
    try:
        out = subprocess.run(["git", "-C", str(REPO_ROOT), "ls-files", "--cached", "--others", "--exclude-standard",
                              "*.py"], capture_output=True, text=True, timeout=60, check=True)
        files = [REPO_ROOT / line for line in out.stdout.splitlines() if line]
    except (OSError, subprocess.SubprocessError):
        files = [p for p in BACKEND.rglob("*.py")]
    return sorted(p for p in files if p.is_file() and "__pycache__" not in p.parts)


BLOCKED_IMPORT = r'''
import importlib, importlib.abc, sys, traceback
sys.path.insert(0, sys.argv[1])

class Block(importlib.abc.MetaPathFinder):
    def find_spec(self, name, path=None, target=None):
        if name == "backend.openspace" or name.startswith("backend.openspace."):
            raise ImportError("blocked: " + name)
        return None

sys.meta_path.insert(0, Block())
failed = []
for name in sys.argv[2:]:
    try:
        importlib.import_module(name)
    except Exception:
        failed.append(name + "\n" + traceback.format_exc())
print("\n".join(failed))
sys.exit(1 if failed else 0)
'''


class ModularTests(unittest.TestCase):
    def test_no_other_python_file_imports_or_names_the_package(self):
        hits = []
        for p in _python_files():
            rel = p.relative_to(REPO_ROOT)
            if _own(p):
                continue
            text = p.read_text(encoding="utf-8", errors="replace")
            if "backend.openspace" in text or "backend/openspace" in text:
                hits.append(str(rel))
            for node in ast.walk(ast.parse(text, filename=str(rel))):
                mods = []
                if isinstance(node, ast.Import):
                    mods = [a.name for a in node.names]
                elif isinstance(node, ast.ImportFrom):
                    mods = [node.module or ""] + [f"{node.module}.{a.name}" for a in node.names]
                if any(m == "openspace" or m.startswith("openspace.") or ".openspace" in m for m in mods):
                    hits.append(f"{rel}:{node.lineno}")
        self.assertEqual(hits, [])

    def test_the_page_does_not_refer_to_it(self):
        hits = []
        for p in sorted((WEBSITE / "src").rglob("*")) + [WEBSITE / "package.json", WEBSITE / "index.html"]:
            if p.is_file() and p.suffix in (".ts", ".tsx", ".js", ".json", ".html", ".css"):
                text = p.read_text(encoding="utf-8", errors="replace").lower()
                if "backend/openspace" in text or "openspace/scene" in text or "isogon_openspace" in text:
                    hits.append(str(p.relative_to(REPO_ROOT)))
        self.assertEqual(hits, [])

    def test_every_other_backend_module_imports_without_it(self):
        mods = _other_backend_modules()
        self.assertIn("backend.server", mods)
        out = subprocess.run([sys.executable, "-c", BLOCKED_IMPORT, str(REPO_ROOT), *mods], capture_output=True,
                             text=True, timeout=600, cwd=str(REPO_ROOT))
        self.assertEqual(out.returncode, 0, out.stdout[-4000:] + out.stderr[-4000:])

    def test_the_package_reads_only_routes_and_the_cmr_reader(self):
        allowed = {"backend.firms", "backend.firms.cmr_passes", "backend.openspace", "backend.openspace.geo"}
        for p in sorted((BACKEND / "openspace").rglob("*.py")):
            tree = ast.parse(p.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("backend"):
                    for a in node.names:
                        full = f"{node.module}.{a.name}"
                        self.assertTrue(node.module in allowed and (full in allowed or node.module != "backend.firms"),
                                        f"{p.name} imports {full}")
                if isinstance(node, ast.Import):
                    for a in node.names:
                        self.assertFalse(a.name.startswith("backend") and a.name not in allowed, f"{p.name}: {a.name}")


if __name__ == "__main__":
    unittest.main()
