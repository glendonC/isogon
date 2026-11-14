"""Entrypoint for Isogon spatiotemporal world-model & harmonization generation.

Generates all static scientific field assets in `website/public/generated/fields/`:
  1. `reconstruction_u8.bin`         (24 x 256 x 256 x 4 uint8 = 6,291,456 bytes)
  2. `observer_passes.json`          (< 450 KB discrete 3D passes & footprints)
  3. `calendar_2000_2026.json`       (324 monthly multi-sensor regime records)
  4. `sensor_model_diagnostics.json` (scan geometry, logistic D_p, 13:30 residuals)
  5. `field_metadata.json`           (channel scales, SHA-256 digests, provenance)

Can be re-run cleanly at any time (`python3 backend/model/reconstruct.py`) to
couple newly generated `website/public/generated/terrain/ca_dem_f32.bin` real
elevation data with fire-activity spread, canyon scan-shadows, and mountain-wave
cloud masks.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

# Allow direct script invocation: `python3 backend/model/reconstruct.py`
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.model import MODEL_VERSION, PROVENANCE_NOTE  # noqa: E402
from backend.model.calendar_model import build_calendar_2000_2026  # noqa: E402
from backend.model.grid import (  # noqa: E402
    DEFAULT_DEM_REL_PATH,
    EAST,
    GRID_H,
    GRID_W,
    NORTH,
    SOUTH,
    WEST,
    build_terrain_grid,
)
from backend.model.sensor_physics import build_sensor_model_diagnostics  # noqa: E402
from backend.model.world_model import (  # noqa: E402
    NUM_FRAMES,
    SIGMA_MAX_MW_KM2,
    Z_MAX_MW_KM2,
    generate_spatiotemporal_reconstruction,
)

DEFAULT_FIELDS_REL_DIR = Path("website/public/generated/fields")
EXPECTED_TENSOR_BYTES: int = NUM_FRAMES * GRID_H * GRID_W * 4  # 6,291,456
MAX_OBSERVER_JSON_BYTES: int = 450 * 1024


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _write_verified_json(path: Path, payload: dict[str, Any], compact: bool = False) -> int:
    if compact:
        encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    else:
        encoded = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    if chr(0x2014) in encoded:
        raise ValueError(f"Forbidden em dash (U+2014) detected in {path.name}")
    raw = encoded.encode("utf-8")
    path.write_bytes(raw)
    return len(raw)


def run_reconstruction(
    dem_path: Path | None = None,
    output_dir: Path | None = None,
) -> dict[str, Any]:
    """Execute full reconstruction pipeline and write verified field artifacts."""
    t0 = time.perf_counter()
    out_dir = output_dir if output_dir is not None else (_REPO_ROOT / DEFAULT_FIELDS_REL_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)

    resolved_dem = dem_path if dem_path is not None else (_REPO_ROOT / DEFAULT_DEM_REL_PATH)
    grid = build_terrain_grid(repo_root=_REPO_ROOT, dem_path=resolved_dem)

    tensor_u8, observer_payload, sim_stats = generate_spatiotemporal_reconstruction(grid)
    tensor_bytes_raw = tensor_u8.tobytes(order="C")
    if len(tensor_bytes_raw) != EXPECTED_TENSOR_BYTES:
        raise RuntimeError(
            f"Unexpected tensor byte length {len(tensor_bytes_raw)} != {EXPECTED_TENSOR_BYTES}"
        )

    bin_path = out_dir / "reconstruction_u8.bin"
    bin_path.write_bytes(tensor_bytes_raw)

    obs_path = out_dir / "observer_passes.json"
    obs_bytes = _write_verified_json(obs_path, observer_payload, compact=True)
    if obs_bytes >= MAX_OBSERVER_JSON_BYTES:
        raise RuntimeError(
            f"observer_passes.json size {obs_bytes} bytes exceeds 450 KB budget ({MAX_OBSERVER_JSON_BYTES})"
        )

    calendar_payload = build_calendar_2000_2026()
    if len(calendar_payload["records"]) != 324:
        raise RuntimeError(f"Expected 324 monthly calendar records, got {len(calendar_payload['records'])}")
    cal_path = out_dir / "calendar_2000_2026.json"
    cal_bytes = _write_verified_json(cal_path, calendar_payload, compact=False)

    diag_payload = build_sensor_model_diagnostics()
    diag_path = out_dir / "sensor_model_diagnostics.json"
    diag_bytes = _write_verified_json(diag_path, diag_payload, compact=False)

    elapsed_s = round(time.perf_counter() - t0, 3)

    metadata_payload: dict[str, Any] = {
        "schema_version": "1.0.0",
        "model_version": MODEL_VERSION,
        "provenance_note": PROVENANCE_NOTE,
        "data_provenance_distinction": {
            "terrain_elevation": (
                "Real downloaded DEM raster loaded from website/public/generated/terrain/ca_dem_f32.bin"
                if grid.terrain_source == "real_downloaded_dem_ca_dem_f32"
                else "Deterministic analytical Feather River / Plumas fallback topography (re-run reconstruct.py once ca_dem_f32.bin is present)"
            ),
            "fire_activity_and_hotspots": (
                "Modeled physics-informed spatiotemporal fire-activity reconstruction and "
                "MODIS/VIIRS forward-operator simulation. No NASA FIRMS row is used in these static fields."
            ),
            "downloaded_firms_rows": 0,
        },
        "terrain_source": grid.terrain_source,
        "dem_path_used": grid.dem_path_used,
        "grid": {
            "west": WEST,
            "south": SOUTH,
            "east": EAST,
            "north": NORTH,
            "height": GRID_H,
            "width": GRID_W,
            "row_orientation": "north_to_south (row 0 = 40.35 N, row 255 = 39.75 N)",
            "col_orientation": "west_to_east (col 0 = -121.60 E, col 255 = -120.75 E)",
            "dx_km": round(grid.dx_km, 4),
            "dy_km": round(grid.dy_km, 4),
            "elevation_min_m": round(float(grid.elevation_m.min()), 1),
            "elevation_max_m": round(float(grid.elevation_m.max()), 1),
        },
        "tensor": {
            "file": "reconstruction_u8.bin",
            "dtype": "uint8",
            "shape": [NUM_FRAMES, GRID_H, GRID_W, 4],
            "byte_length": len(tensor_bytes_raw),
            "sha256": _sha256_bytes(tensor_bytes_raw),
            "epoch_cadence_hours": 12,
            "channels": [
                {
                    "index": 0,
                    "rgba": "R",
                    "name": "z_hat_posterior_mean",
                    "units": "MW / km^2",
                    "domain": [0.0, Z_MAX_MW_KM2],
                    "epistemic_state": "Harmonized / Predicted",
                },
                {
                    "index": 1,
                    "rgba": "G",
                    "name": "sigma_epistemic_uncertainty",
                    "units": "MW / km^2",
                    "domain": [0.0, SIGMA_MAX_MW_KM2],
                    "epistemic_state": "Calibrated Posterior SD",
                },
                {
                    "index": 2,
                    "rgba": "B",
                    "name": "modis_observed_density",
                    "units": "MW / km^2",
                    "domain": [0.0, Z_MAX_MW_KM2],
                    "epistemic_state": "Observed (1 km to 4.8x2.0 km bow-tie PSF, >=12 MW floor)",
                },
                {
                    "index": 3,
                    "rgba": "A",
                    "name": "viirs_observed_density",
                    "units": "MW / km^2",
                    "domain": [0.0, Z_MAX_MW_KM2],
                    "epistemic_state": "Observed (375 m 3-zone PSF, >=1.5 MW floor)",
                },
            ],
        },
        "artifacts": {
            "reconstruction_u8_bytes": len(tensor_bytes_raw),
            "observer_passes_bytes": obs_bytes,
            "calendar_2000_2026_bytes": cal_bytes,
            "sensor_model_diagnostics_bytes": diag_bytes,
        },
        "verification": {
            **sim_stats,
            "calendar_records": len(calendar_payload["records"]),
            "viirs_to_modis_step_ratio": calendar_payload["summary_metrics"][
                "viirs_to_modis_raw_step_ratio_2012_2021"
            ],
            "compute_seconds": elapsed_s,
        },
    }

    meta_path = out_dir / "field_metadata.json"
    _write_verified_json(meta_path, metadata_payload, compact=False)
    return metadata_payload


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate Isogon 24-frame spatiotemporal fields & harmonization JSON payloads."
    )
    parser.add_argument(
        "--dem-path",
        type=Path,
        default=None,
        help="Optional explicit path to ca_dem_f32.bin (defaults to website/public/generated/terrain/ca_dem_f32.bin).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Optional output directory (defaults to website/public/generated/fields).",
    )
    args = parser.parse_args()

    meta = run_reconstruction(dem_path=args.dem_path, output_dir=args.output_dir)
    print(json.dumps(meta["verification"], indent=2))
    print(
        f"[Isogon] Wrote reconstruction_u8.bin ({meta['artifacts']['reconstruction_u8_bytes']:,} B), "
        f"observer_passes.json ({meta['artifacts']['observer_passes_bytes']:,} B), "
        f"calendar_2000_2026.json ({meta['artifacts']['calendar_2000_2026_bytes']:,} B), "
        f"sensor_model_diagnostics.json ({meta['artifacts']['sensor_model_diagnostics_bytes']:,} B) "
        f"using terrain_source={meta['terrain_source']}."
    )


if __name__ == "__main__":
    main()
