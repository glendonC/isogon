"""Which build of the numbers made an answer, and how two answers made by two builds are compared.

The same run gives answers that differ in their last digits from one build of numpy to another. Measured on the
Chips Fire of 2012 and the Thomas Fire of 2017, the run of the server (CPython, numpy 2.5.4) against the same run
in a browser (Pyodide 0.27.7, numpy 2.0.2 compiled to WebAssembly):
- 79 values in some 17,700 and 52,000 differ, by at most 0.08 percent (0.000799 at Chips);
- no class, flag, count or word differs.
Natively, numpy 2.0.2 and 2.5.4 already differ from each other. A digest is of the bytes one build gives, so a
digest made by one build cannot be checked by another. Two answers are compared figure by figure within the
tolerance measured, their words and flags exactly, and their digests not at all.
"""

from __future__ import annotations

import math
from typing import Any

# The largest relative difference measured between two builds, rounded up: 0.08 percent
REL_TOLERANCE: float = 0.0008
# Below this, two numbers are the same whatever their ratio (a difference in the last bits of a zero)
ABS_FLOOR: float = 1e-9


def numbers_build() -> dict[str, Any]:
    """The build of the numbers this process makes: Python, numpy and the platform (`emscripten` in a browser)."""
    import platform
    import sys

    import numpy as np

    return {"python": platform.python_version(), "numpy": np.__version__, "platform": sys.platform,
            "machine": platform.machine(),
            "note": ("figures and digests are this build's; another build of numpy gives the same classes, flags and "
                     "words and figures within 0.08 percent, and other digests (backend/model/numbers_build.py)")}


def _is_digest(path: str) -> bool:
    return path.rsplit(".", 1)[-1].split("[")[0].endswith("sha256")


def agree_within(a: Any, b: Any, rel: float = REL_TOLERANCE) -> dict[str, Any]:
    """Whether two answers of the same run agree as two builds can: every number within `rel` of the other (or
    within `ABS_FLOOR`), every word, flag and empty value equal, every list of the same length, every key in both.
    Digests (keys ending in sha256) are not compared and are counted apart."""
    out: dict[str, Any] = {"numbers": 0, "worst_relative_difference": 0.0, "digests_not_compared": 0, "differences": []}

    def walk(x: Any, y: Any, path: str) -> None:
        if _is_digest(path) and isinstance(x, str) and isinstance(y, str):
            out["digests_not_compared"] += 1
            return
        if isinstance(x, dict) and isinstance(y, dict):
            for k in sorted(set(x) | set(y)):
                if k not in x or k not in y:
                    out["differences"].append([f"{path}.{k}", "a key of one answer only"])
                else:
                    walk(x[k], y[k], f"{path}.{k}")
            return
        if isinstance(x, list) and isinstance(y, list):
            if len(x) != len(y):
                out["differences"].append([path, f"{len(x)} items against {len(y)}"])
                return
            for i, (u, v) in enumerate(zip(x, y)):
                walk(u, v, f"{path}[{i}]")
            return
        numeric = (isinstance(x, (int, float)) and isinstance(y, (int, float))
                   and not isinstance(x, bool) and not isinstance(y, bool))
        if numeric:
            out["numbers"] += 1
            fx, fy = float(x), float(y)
            if math.isnan(fx) or math.isnan(fy):
                if not (math.isnan(fx) and math.isnan(fy)):
                    out["differences"].append([path, f"{x} against {y}"])
                return
            d = abs(fx - fy)
            scale = max(abs(fx), abs(fy))
            if d > ABS_FLOOR:
                r = d / scale
                out["worst_relative_difference"] = max(out["worst_relative_difference"], r)
                if r > rel:
                    out["differences"].append([path, f"{x} against {y}, {r:.2e} apart"])
            return
        if x != y or type(x) is not type(y):
            out["differences"].append([path, f"{str(x)[:60]} against {str(y)[:60]}"])

    walk(a, b, "")
    out["agree"] = not out["differences"]
    out["tolerance"] = {"relative": rel, "absolute_floor": ABS_FLOOR}
    out["differences"] = out["differences"][:50]
    return out
