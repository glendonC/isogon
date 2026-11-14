"""How real runs write intensity into bytes: a logarithmic scale that holds the real range.

The simulated engine writes FRP density linearly over 0 to 80 MW/km2 and its standard deviation over 0 to 24. Real
detections do not fit: across nine real windows (three per hero region) 28 percent of the cells MODIS or VIIRS
flagged lie above 80 MW/km2, the largest is 7,132 MW/km2, and the reconstruction runs from 0.003 to 4,175. A
linear byte over that range would put half of all cells in its first step. A logarithmic byte keeps the same
relative precision everywhere, and its legend reads in decades.

  byte 0          no fire: the value is exactly zero
  byte 1 to 255   LOG_MIN * (LOG_MAX / LOG_MIN) ** ((byte - 1) / 254) MW/km2

so byte 1 is 0.01 MW/km2, byte 255 is 10,000 MW/km2 and one step is a factor of 1.056 (rounding error at most
2.8 percent). A value above zero and below LOG_MIN is written as byte 1; a value above LOG_MAX as byte 255; both
are counted in the payload. All four channels of a real run use this one scale. Simulated runs keep theirs.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray

LOG_MIN_MW_KM2: float = 0.01
LOG_MAX_MW_KM2: float = 10000.0
_STEPS: int = 254
_DECADES: float = float(np.log10(LOG_MAX_MW_KM2 / LOG_MIN_MW_KM2))


def encode_u8(field: NDArray[np.float64]) -> NDArray[np.uint8]:
    """Bytes for a non-negative field in MW/km2 (see the module text)."""
    v = np.asarray(field, dtype=np.float64)
    out = np.zeros(v.shape, dtype=np.uint8)
    pos = v > 0.0
    if pos.any():
        x = np.log10(np.clip(v[pos], LOG_MIN_MW_KM2, LOG_MAX_MW_KM2) / LOG_MIN_MW_KM2) / _DECADES
        out[pos] = (1 + np.rint(_STEPS * x)).astype(np.uint8)
    return out


def decode_u8(code: NDArray[np.uint8]) -> NDArray[np.float64]:
    """MW/km2 for bytes written by `encode_u8`."""
    c = np.asarray(code, dtype=np.float64)
    return np.where(c == 0, 0.0, LOG_MIN_MW_KM2 * (LOG_MAX_MW_KM2 / LOG_MIN_MW_KM2) ** ((c - 1.0) / _STEPS))


def lookup_table() -> list[float]:
    """The value of every byte from 0 to 255, for a consumer that wants a table instead of the formula."""
    return [float(f"{v:.6g}") for v in decode_u8(np.arange(256, dtype=np.uint8))]


def describe() -> dict[str, Any]:
    """The `encoding` block of a real run's payload: everything a consumer needs to read the bytes and draw a legend."""
    ticks = [0.01, 0.1, 1.0, 10.0, 100.0, 1000.0, 10000.0]
    return {
        "version": 2,
        "scale": "log10",
        "unit": "MW/km2",
        "min_mw_km2": LOG_MIN_MW_KM2,
        "max_mw_km2": LOG_MAX_MW_KM2,
        "byte_zero": "no fire: the value is exactly zero",
        "encode": "byte = 0 when v is 0; otherwise 1 + round(254 * log10(v / min) / log10(max / min)), kept within 1 to 255",
        "decode": "v = 0 when byte is 0; otherwise min * (max / min) ** ((byte - 1) / 254)",
        "step_factor": round(float(10 ** (_DECADES / _STEPS)), 5),
        "lookup_mw_km2": lookup_table(),
        "legend_ticks": [{"mw_km2": t, "byte": int(encode_u8(np.array([t]))[0])} for t in ticks],
        "channels": {
            "r": "reconstructed FRP density (the estimate)",
            "g": "standard deviation of the estimate",
            "b": "MODIS FRP density as observed (only on MODIS frames)",
            "a": "VIIRS FRP density as observed (only on VIIRS frames)",
        },
        "applies_to": "all four channels of reconstruction_u8.bin and the density byte of belief_u8.bin, real runs only",
        "simulated_runs": "unchanged: linear, 0 to 80 MW/km2 for r, b and a, 0 to 24 for g",
        "why": (
            "real FRP densities on 375 m cells span about six decades (0.003 to 7,132 MW/km2 in the nine windows "
            "measured); on the linear 0 to 80 scale 28 percent of observed cells and 4 percent of reconstructed cells "
            "were clipped"
        ),
    }


def decode_tensor_channel(tensor_u8: NDArray[np.uint8], channel: int, real_run: bool) -> NDArray[np.float64]:
    """MW/km2 for one channel of a run's tensor, whichever kind of run wrote it.

    A route that reads a stored run's bytes (for example /api/observer) should call this instead of scaling by 80:
    `real_run` is true for a `SolvedRealRun` (it has `extras`).
    """
    code = np.asarray(tensor_u8)[..., channel]
    if real_run:
        return decode_u8(code)
    from backend.model.world_model import SIGMA_MAX_MW_KM2, Z_MAX_MW_KM2

    return code.astype(np.float64) / 255.0 * (SIGMA_MAX_MW_KM2 if channel == 1 else Z_MAX_MW_KM2)
