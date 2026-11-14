"""GET /api/evidence serves `backend/model/evidence.py::evidence()`.

Where that module is missing the route answers 404 and says why; where it is there the route
returns exactly what the function returns.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

HAVE_EVIDENCE = importlib.util.find_spec("backend.model.evidence") is not None
# The top-level keys of the type the page reads the answer as (website/src/content/demo/evidence.ts, EvidenceDoc).
PAGE_KEYS = {"commit", "unit", "test_fires", "audit", "validation", "next_look", "limits"}


def _req(path: str) -> tuple[int, dict]:
    from backend.tests import test_server_http as http_tests

    status, _, raw = http_tests._req(path)
    return status, json.loads(raw, parse_constant=lambda c: (_ for _ in ()).throw(ValueError(c)))


class EvidenceRouteTests(unittest.TestCase):
    @unittest.skipIf(HAVE_EVIDENCE, "the evidence function is in this build")
    def test_without_the_evidence_module_the_route_says_so(self) -> None:
        status, body = _req("/api/evidence")
        self.assertEqual(status, 404)
        self.assertIn("evidence.py", body["error"])

    @unittest.skipUnless(HAVE_EVIDENCE, "the evidence function is not in this build")
    def test_the_route_serves_the_function_as_it_is(self) -> None:
        from backend.model.evidence import evidence

        status, body = _req("/api/evidence")                   # strict JSON: no NaN or Infinity
        self.assertEqual(status, 200)
        self.assertEqual(body, json.loads(json.dumps(evidence())))
        self.assertTrue(PAGE_KEYS <= set(body), PAGE_KEYS - set(body))
        self.assertTrue(body["test_fires"]["fires"])


if __name__ == "__main__":
    unittest.main()
