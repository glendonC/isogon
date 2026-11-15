"""The blind test's methods and both baselines read nothing of the harmonization's tables.

The harmonize lane's fits read the monthly Suomi NPP counts of every loaded place, the fresh test's places included.
That stands only because nothing that scores the estimate reads what those fits make. Three things hold it:

1. No module that builds a method or a baseline (the blind test, the baselines, the estimate, the challengers, the
   fresh test's runner), nor anything they import at any depth, imports a module of the harmonization
   (`backend.model.harmonize*`) or of the cube it is fitted on (`backend.firms.cube*`). The Record's payload
   (`backend.firms.real_calendar`) is the data lane's and is left out of the walk: the second baseline reads it only
   through `calendar_ratio`, which test 2 holds to raw counts.
2. The second baseline's count ratio is the same whatever the Record's harmonized fields hold, or if they are gone.
3. A blind test with both baselines, the estimate and the default challenger, run in a fresh process, leaves no
   module of the harmonization or the cube loaded.
"""

from __future__ import annotations

import ast
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.model.calendar_ratio import calendar_ratio  # noqa: E402

FORBIDDEN = ("backend.model.harmonize", "backend.firms.cube")
LEFT_OUT_OF_THE_WALK = ("backend.firms.real_calendar",)
ROOTS = (
    "backend.eval.blind_test", "backend.eval.baselines", "backend.model.real_blind", "backend.model.occupancy",
    "backend.model.calendar_ratio", "backend.model.fresh_world_run",
)


def _module_file(name: str) -> Path | None:
    base = _REPO_ROOT.joinpath(*name.split("."))
    for p in (base.with_suffix(".py"), base / "__init__.py"):
        if p.is_file():
            return p
    return None


def _imports(path: Path, package: str) -> set[str]:
    """Every backend module a file imports, at module level or inside a function."""
    out: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            out.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                parts = package.split(".")[: len(package.split(".")) - node.level + 1]
                mod = ".".join(parts + ([node.module] if node.module else []))
            else:
                mod = node.module or ""
            out.add(mod)
            out.update(f"{mod}.{a.name}" for a in node.names)
    return {m for m in out if m.startswith("backend.")}


def closure(roots: tuple[str, ...]) -> set[str]:
    seen: set[str] = set()
    todo = list(roots)
    while todo:
        name = todo.pop()
        if name in seen or name.startswith(LEFT_OUT_OF_THE_WALK):
            continue
        path = _module_file(name)
        if path is None:
            continue
        seen.add(name)
        package = name if path.name == "__init__.py" else name.rsplit(".", 1)[0]
        todo.extend(_imports(path, package))
    return seen


def _roots() -> tuple[str, ...]:
    chal = _REPO_ROOT / "backend" / "model" / "challenger"
    extra = tuple(f"backend.model.challenger.{p.stem}" for p in sorted(chal.glob("*.py"))) if chal.is_dir() else ()
    return ROOTS + extra


class NoImportTests(unittest.TestCase):
    def test_no_module_of_a_method_or_a_baseline_imports_the_harmonization_or_its_cube(self) -> None:
        walked = closure(_roots())
        self.assertIn("backend.eval.blind_test", walked)
        self.assertIn("backend.model.occupancy", walked)
        bad = sorted(m for m in walked if m.startswith(FORBIDDEN))
        self.assertEqual(bad, [])

    def test_the_walk_finds_an_import_inside_a_function(self) -> None:
        # the walk is not fooled by a lazy import: the fresh test's runner imports the calendar ratio in a function
        self.assertIn("backend.model.calendar_ratio", closure(("backend.model.fresh_world_run",)))


def _calendar(harmonized: object) -> dict:
    records = []
    for year, (snpp, terra, aqua) in {2015: (30, 10, 10), 2016: (20, 5, 15), 2017: (12, 3, 3)}.items():
        rc = {"Suomi NPP": {"total": snpp}, "Terra": {"total": terra}, "Aqua": {"total": aqua}}
        rec = {"year": year, "year_month": f"{year}-07", "raw_counts": rc}
        if harmonized is not None:
            rec.update({"harmonized_mean": harmonized, "harmonized_p10": harmonized, "harmonized_p90": harmonized})
        records.append(rec)
    method = {"id": "overlap_ratio_v1", "overlap_months_excluded_for_outages": []}
    if harmonized is not None:
        method.update({"ratio_terra_aqua": {"ratio": harmonized}, "validation": {"poisoned": harmonized}})
    return {"records": records, "harmonization_method": method}


class CountRatioTests(unittest.TestCase):
    def test_the_second_baseline_s_ratio_reads_raw_counts_only(self) -> None:
        want = calendar_ratio("made_up_place", exclude_year=2017, firms_calendar=lambda _r: _calendar(None))
        for poison in (1e9, -5.0, "not a number"):
            got = calendar_ratio("made_up_place", exclude_year=2017, firms_calendar=lambda _r, p=poison: _calendar(p))
            self.assertEqual(got.as_dict(), want.as_dict(), poison)
        self.assertAlmostEqual(want.ratio, (30 + 20) / (20 + 20))

    def test_the_second_baseline_names_its_own_method_never_the_one_the_record_serves(self) -> None:
        from backend.model.calendar_ratio import METHOD_ID

        for served in ("overlap_ratio_v1", "pooled_month_size_v1", "a method not yet written"):
            cal = _calendar(None)
            cal["harmonization_method"]["id"] = served
            got = calendar_ratio("made_up_place", exclude_year=2017, firms_calendar=lambda _r, c=cal: c)
            self.assertEqual(got.method_id, METHOD_ID, served)
            self.assertEqual(got.as_dict()["method_id"], METHOD_ID, served)


PROBE = r"""
import json, sys
sys.path.insert(0, sys.argv[1])
from backend.eval import synthetic_fixture as fx
from backend.eval.baselines import overlap_ratio_factory, painted_modis_factory
from backend.eval.blind_test import run_blind_test
from backend.eval.rows import detections_from_rows
from backend.model.calendar_ratio import calendar_ratio
from backend.model.fitted import load_params, load_ratio_fit
from backend.model.real_blind import reconstruction_factory
cal = {"records": [{"year": 2015, "year_month": "2015-07", "raw_counts": {"Suomi NPP": {"total": 30}, "Terra": {"total": 10}, "Aqua": {"total": 10}}}],
       "harmonization_method": {"id": "overlap_ratio_v1", "overlap_months_excluded_for_outages": []}}
ratio = calendar_ratio("made_up_place", exclude_year=2099, firms_calendar=lambda _r: cal)
factories = [painted_modis_factory, overlap_ratio_factory(load_ratio_fit(), ratio), reconstruction_factory(load_params())]
try:
    from backend.model.challenger import default_challenger_factory
    factories.append(default_challenger_factory())
except ImportError:
    pass
rows = fx.extended_rows()
det = detections_from_rows(rows, "synthetic fixture")
rep = run_blind_test(det, fx.TEST_BOX, factories, schedule="cmr", read_passes=fx.fixture_pass_reader())
print(json.dumps({"methods": sorted(rep["methods"]), "modules": sorted(m for m in sys.modules if m.startswith("backend."))}))
"""


class FreshProcessTests(unittest.TestCase):
    def test_a_blind_test_with_every_method_loads_nothing_of_the_harmonization(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            probe = Path(tmp) / "probe.py"
            probe.write_text(PROBE, encoding="utf-8")
            out = subprocess.run([sys.executable, str(probe), str(_REPO_ROOT)], capture_output=True, text=True, timeout=600)
        self.assertEqual(out.returncode, 0, out.stderr[-2000:])
        doc = json.loads(out.stdout.strip().splitlines()[-1])
        self.assertIn("reconstruction", doc["methods"])
        self.assertIn("overlap_ratio", doc["methods"])
        self.assertEqual([m for m in doc["modules"] if m.startswith(FORBIDDEN)], [])


if __name__ == "__main__":
    unittest.main()
