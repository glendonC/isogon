"""Values fitted on real rows, loaded from tracked JSON files that say what they were fitted on.

  fitted_values/overlap_ratio.json      the single VIIRS over MODIS FRP ratio of the overlap-ratio baseline
  fitted_values/occupancy_params.json   reconstruction parameters fitted on training fires from the priors, under
                                        protocol version 3, with the validation evidence that decides whether
                                        they are switched on, and every earlier decision

Each file is written by `backend/model/fit_real.py` from rows read through `backend.firms`. A learned value is used
only when its file says `"adopted": true`; otherwise the priors in `OccupancyParams` stand and the payload labels
the learned part experimental.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.eval.baselines import OverlapRatioFit
from backend.model.occupancy import OccupancyParams

FITTED_DIR: Path = Path(__file__).resolve().parent / "fitted_values"
RATIO_FILE: str = "overlap_ratio.json"
PARAMS_FILE: str = "occupancy_params.json"


def _read(name: str) -> dict[str, Any] | None:
    path = FITTED_DIR / name
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_ratio_fit() -> OverlapRatioFit | None:
    """The tracked overlap ratio, or None when it has not been fitted yet."""
    doc = _read(RATIO_FILE)
    if doc is None:
        return None
    f = doc["fit"]
    return OverlapRatioFit(
        ratio=float(f["ratio"]), ratio_p05=float(f["ratio_p05"]), ratio_p50=float(f["ratio_p50"]),
        ratio_p95=float(f["ratio_p95"]), n_pairs=int(f["n_pairs"]), sum_viirs_mw=float(f["sum_viirs_mw"]),
        sum_modis_mw=float(f["sum_modis_mw"]), trained_on=str(f["trained_on"]),
    )


def load_params() -> OccupancyParams:
    """Fitted reconstruction parameters when their file says they are adopted, else the priors."""
    doc = _read(PARAMS_FILE)
    if doc is None or not doc.get("adopted", False):
        return OccupancyParams()
    known = set(OccupancyParams.__dataclass_fields__)
    return OccupancyParams(**{k: v for k, v in doc["parameters"].items() if k in known})


def learned_parts() -> list[dict[str, Any]]:
    """What is learned from real rows and whether it is switched on, for the payload's `model.learned_parts`."""
    parts: list[dict[str, Any]] = []
    doc = _read(PARAMS_FILE)
    if doc is None:
        parts.append({
            "name": "reconstruction parameters",
            "status": "not learned",
            "detail": "every value is a prior (backend/model/occupancy.py); nothing has been fitted on real rows yet",
        })
    else:
        used = bool(doc.get("adopted", False))
        parts.append({
            "name": "reconstruction parameters",
            "status": "fitted values in use" if used else "fitted values not in use (priors stand)",
            "detail": doc.get("decision", ""),
            "rule": doc.get("rule"),
            "trained_on": doc.get("trained_on"),
            "validated_on": doc.get("validated_on"),
        })
        # one entry per part of the estimate, each with its own status and the validation scores behind it
        for name, part in (doc.get("parts") or {}).items():
            parts.append({
                "name": name,
                "status": part["status"] if used else "experimental",
                "validation_scores": {
                    k: {"reconstruction": row["reconstruction"], "painted_modis": row["painted_modis"],
                        "overlap_ratio": row["overlap_ratio"], "better_is": row["better_is"], "class": row.get("class"),
                        "improvement_interval": row.get("improvement_interval")}
                    for k, row in part["scores"].items()
                },
                **({"interval_holds_on_validation": part["interval_holds"]} if "interval_holds" in part else {}),
            })
    ratio = _read(RATIO_FILE)
    if ratio is not None:
        parts.append({
            "name": "overlap ratio",
            "status": "baseline only",
            "detail": "a single fitted number used by the overlap-ratio baseline, never by the reconstruction",
            "trained_on": ratio["fit"]["trained_on"],
        })
    return parts
