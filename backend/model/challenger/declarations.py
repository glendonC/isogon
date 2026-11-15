"""Cell declaration rules mapping calibrated 375 m probabilities to binary masks."""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.eval.grid import dilate
from backend.model.challenger.features import box_mean_2d


def box_max_3x3(field: NDArray[np.float64]) -> NDArray[np.float64]:
    """Exact 3x3 maximum filter on a 2D array with zero padding."""
    pad = np.pad(field, ((1, 1), (1, 1)), mode="constant", constant_values=0.0)
    m0 = np.maximum(np.maximum(pad[:-2, :-2], pad[:-2, 1:-1]), pad[:-2, 2:])
    m1 = np.maximum(np.maximum(pad[1:-1, :-2], pad[1:-1, 1:-1]), pad[1:-1, 2:])
    m2 = np.maximum(np.maximum(pad[2:, :-2], pad[2:, 1:-1]), pad[2:, 2:])
    return np.maximum(np.maximum(m0, m1), m2)


def declare_look_grid(p_grid: NDArray[np.float64], rule: dict[str, Any]) -> NDArray[np.bool_]:
    """Apply a declaration rule dictionary to a single (ny, nx) probability grid."""
    kind = str(rule["kind"])
    if kind == "fixed_tau":
        return p_grid >= float(rule["tau"])

    if kind == "smooth_tau":
        wb = float(rule.get("w_blur", 0.20))
        tau = float(rule["tau"])
        p_min = float(rule.get("p_min", 0.12))
        b3 = box_mean_2d(p_grid, 1, 1)
        p_eff = (1.0 - wb) * p_grid + wb * b3
        return (p_eff >= tau) & (p_grid >= p_min)

    if kind == "core_plus_spine":
        wb = float(rule.get("w_blur", 0.20))
        tau_hi = float(rule["tau_hi"])
        s_min = float(rule["s_min"])
        p_peak_min = float(rule.get("p_peak_min", 0.135))
        b3 = box_mean_2d(p_grid, 1, 1)
        s3 = 9.0 * b3
        p_eff = (1.0 - wb) * p_grid + wb * b3
        core = (p_eff >= tau_hi) & (p_grid >= 0.12)
        near_core = dilate(core, 1) if np.any(core) else core

        m3 = box_max_3x3(p_grid)
        cand = (~near_core) & (p_grid >= p_peak_min) & (s3 >= s_min) & (p_grid >= m3 - 1e-12)
        if not np.any(cand):
            return core

        out = core.copy()
        covered = near_core.copy()
        cand_rc = np.argwhere(cand)
        scores = p_eff[cand_rc[:, 0], cand_rc[:, 1]]
        order = np.argsort(-scores, kind="stable")
        ny, nx = p_grid.shape
        for idx in order:
            r, c = int(cand_rc[idx, 0]), int(cand_rc[idx, 1])
            if covered[r, c]:
                continue
            out[r, c] = True
            r0, r1 = max(0, r - 1), min(ny, r + 2)
            c0, c1 = max(0, c - 1), min(nx, c + 2)
            covered[r0:r1, c0:c1] = True
        return out

    raise ValueError(f"Unknown declaration rule kind: {kind}")
