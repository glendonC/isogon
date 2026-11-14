"""`GET /api/observer` reads a frame's intensity on the scale the run wrote it: logarithmic bytes for a real run,
linear bytes for a simulated one; and no answer carries NaN or Infinity. The tensors here are made up in the test."""

from __future__ import annotations

from pathlib import Path
import sys
import unittest

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.model.encoding import decode_u8, describe, encode_u8  # noqa: E402
from backend.server import SIGMA_MAX_MW_KM2, Z_MAX_MW_KM2, frame_fields  # noqa: E402


class FrameFieldsTests(unittest.TestCase):
    def test_a_real_run_is_read_on_its_logarithmic_scale(self) -> None:
        z = np.array([[0.0, 0.5, 120.0], [2500.0, 8.0, 0.02]])
        s = np.array([[0.0, 0.1, 30.0], [400.0, 9.0, 0.01]])
        t = np.zeros((2, 2, 3, 4), dtype=np.uint8)
        t[1, :, :, 0], t[1, :, :, 1] = encode_u8(z), encode_u8(s)
        zr, sr, scale = frame_fields(t, 1, describe())
        self.assertEqual(scale, "log10")
        np.testing.assert_allclose(zr, decode_u8(encode_u8(z)))
        np.testing.assert_allclose(zr, z, rtol=0.03)                 # within the scale's rounding
        self.assertAlmostEqual(float(np.mean(sr > 8.0)), 3 / 6)       # 30, 400 and 9 MW/km2
        # read linearly, as before, the same bytes give a field a hundred times too small at its peak
        lin = t[1, :, :, 0].astype(np.float64) / 255.0 * Z_MAX_MW_KM2
        self.assertLess(float(lin.max()), 81.0)
        self.assertGreater(float(zr.max()), 2000.0)

    def test_a_simulated_run_keeps_its_linear_scale(self) -> None:
        t = np.zeros((1, 1, 2, 4), dtype=np.uint8)
        t[0, 0, :, 0], t[0, 0, :, 1] = [255, 51], [255, 0]
        zr, sr, scale = frame_fields(t, 0, None)
        self.assertEqual(scale, "linear")
        np.testing.assert_allclose(zr[0], [Z_MAX_MW_KM2, 51 / 255 * Z_MAX_MW_KM2])
        np.testing.assert_allclose(sr[0], [SIGMA_MAX_MW_KM2, 0.0])



class StrictJsonTests(unittest.TestCase):
    def test_answers_never_carry_nan_or_infinity(self) -> None:
        import json

        from backend.server import strict_json_bytes

        raw = strict_json_bytes({"a": float("nan"), "b": [1.5, float("inf"), {"c": -float("inf")}], "d": "NaN", "e": 2})
        parsed = json.loads(raw, parse_constant=lambda c: (_ for _ in ()).throw(ValueError(c)))
        self.assertEqual(parsed, {"a": None, "b": [1.5, None, {"c": None}], "d": "NaN", "e": 2})
        self.assertEqual(strict_json_bytes({"x": 1.25}), b'{"x": 1.25}')


if __name__ == "__main__":
    unittest.main()
