"""Isogon scientific world-modeling and multi-sensor harmonization package.

Two kinds of run live here and are never mixed. A simulated run (solver.py, world_model.py) models a fire and
the satellite passes over it; `PROVENANCE_NOTE` describes such a run. A real run (real_run.py) reconstructs from
NASA FIRMS rows read through backend.firms and writes its own provenance.
"""

from __future__ import annotations

MODEL_VERSION = "0.9.0"
# Describes a simulated run only. It says what the run used, not what the cache holds.
PROVENANCE_NOTE = (
    "Simulated run: a modelled fire seen by modelled satellite passes. "
    "No NASA FIRMS row is used in this run"
)

__all__ = ["MODEL_VERSION", "PROVENANCE_NOTE"]
