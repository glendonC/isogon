"""Isogon live scientific HTTP API server (Python stdlib + NumPy + Pillow via uv).

Runs on `127.0.0.1:8788` using `http.server.ThreadingHTTPServer`.

Endpoints:
  - GET  /api/health
  - GET  /api/regions
  - POST /api/reconstruct
  - GET  /api/runs/<run_id>/<asset_name>
  - GET  /api/observer?frame=<0..23>&sensor=<all|modis|viirs>&min_frp=...&max_zenith=...&run_id=...
  - GET  /api/calendar
  - GET  /api/sensor-model
  - GET  /api/field-meta
"""

from __future__ import annotations

import argparse
from collections import OrderedDict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import numpy as np
from numpy.typing import NDArray

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.model import MODEL_VERSION, PROVENANCE_NOTE  # noqa: E402
from backend.model.calibrator import get_pretrained_calibrator  # noqa: E402
from backend.model.grid import (  # noqa: E402
    EAST,
    GRID_H,
    GRID_W,
    NORTH,
    SOUTH,
    WEST,
    build_terrain_grid,
)
from backend.model.reconstruct import (  # noqa: E402
    DEFAULT_FIELDS_REL_DIR,
    EXPECTED_TENSOR_BYTES,
    run_reconstruction,
)
from backend.model.sensor_physics import (  # noqa: E402
    SENSOR_CODES,
    detection_probability,
    invert_view_zenith_from_footprint,
    observable_flux_fraction,
)
from backend.model.solver import (  # noqa: E402
    SolvedReconstructionRun,
    solve_region_reconstruction,
)
from backend.model.world_model import (  # noqa: E402
    NUM_FRAMES,
    SIGMA_MAX_MW_KM2,
    Z_MAX_MW_KM2,
)
from backend.terrain.live_region import (  # noqa: E402
    PRESET_REGIONS,
    load_region_terrain,
    resolve_region_request,
)

DEFAULT_HOST: str = "127.0.0.1"
DEFAULT_PORT: int = 8788
MAX_CACHED_RUNS: int = 24


def _index_footprint_arrays(observer_data: dict[str, Any]) -> list[NDArray[np.float64]]:
    arrays: list[NDArray[np.float64]] = []
    for frame_obj in observer_data["frames"]:
        fps = frame_obj["footprints"]
        if fps:
            arrays.append(np.asarray(fps, dtype=np.float64))
        else:
            arrays.append(np.empty((0, 8), dtype=np.float64))
    return arrays


class IsogonDataStore:
    """In-memory scientific artifact store, dynamic world-model solver, and query engine."""

    def __init__(self, fields_dir: Path) -> None:
        self.fields_dir = fields_dir
        self._ensure_artifacts()

        self.calibrator = get_pretrained_calibrator()
        self.calendar_bytes = (fields_dir / "calendar_2000_2026.json").read_bytes()
        self.sensor_model_bytes = (fields_dir / "sensor_model_diagnostics.json").read_bytes()
        self.field_meta_bytes = (fields_dir / "field_metadata.json").read_bytes()
        self.field_meta: dict[str, Any] = json.loads(self.field_meta_bytes.decode("utf-8"))

        obs_raw = (fields_dir / "observer_passes.json").read_text(encoding="utf-8")
        self.observer_data: dict[str, Any] = json.loads(obs_raw)

        bin_path = fields_dir / "reconstruction_u8.bin"
        self.tensor_u8: NDArray[np.uint8] = np.fromfile(
            bin_path, dtype=np.uint8
        ).reshape(NUM_FRAMES, GRID_H, GRID_W, 4)

        grid = build_terrain_grid(repo_root=_REPO_ROOT)
        self.cell_area_km2: NDArray[np.float64] = grid.cell_area_km2
        self.frame_fp_arrays: list[NDArray[np.float64]] = _index_footprint_arrays(self.observer_data)

        self._lock = threading.Lock()
        self._runs: OrderedDict[str, tuple[SolvedReconstructionRun, list[NDArray[np.float64]]]] = OrderedDict()

        # Pre-warm baseline Plumas CA run so landing hydration responds in <2 ms
        try:
            default_spec = resolve_region_request(region_id="plumas_ca")
            default_terrain = load_region_terrain(default_spec, allow_network=False)
            default_run = solve_region_reconstruction(
                region_terrain=default_terrain,
                holdout_viirs=False,
                cloud_override=None,
                calibrator=self.calibrator,
            )
            self._store_run(default_run)
        except Exception as exc:  # pragma: no cover
            sys.stderr.write(f"[Isogon API] Warning: baseline warm-up skipped: {exc}\n")

    def _ensure_artifacts(self) -> None:
        required = [
            self.fields_dir / "reconstruction_u8.bin",
            self.fields_dir / "observer_passes.json",
            self.fields_dir / "calendar_2000_2026.json",
            self.fields_dir / "sensor_model_diagnostics.json",
            self.fields_dir / "field_metadata.json",
        ]
        if not all(p.is_file() for p in required) or (
            (self.fields_dir / "reconstruction_u8.bin").stat().st_size != EXPECTED_TENSOR_BYTES
        ):
            run_reconstruction(output_dir=self.fields_dir)

    def _store_run(self, run: SolvedReconstructionRun) -> None:
        fp_arrays = _index_footprint_arrays(run.observer_passes)
        with self._lock:
            self._runs[run.run_id] = (run, fp_arrays)
            self._runs.move_to_end(run.run_id)
            while len(self._runs) > MAX_CACHED_RUNS:
                self._runs.popitem(last=False)

    def get_run(self, run_id: str) -> tuple[SolvedReconstructionRun, list[NDArray[np.float64]]] | None:
        with self._lock:
            entry = self._runs.get(run_id)
            if entry is not None:
                self._runs.move_to_end(run_id)
            return entry

    def health_payload(self) -> dict[str, Any]:
        with self._lock:
            cached_ids = list(self._runs.keys())
        return {
            "status": "ok",
            "service": "isogon-scientific-backend",
            "model_version": MODEL_VERSION,
            "provenance_note": PROVENANCE_NOTE,
            "downloaded_firms_rows": 0,
            "terrain_source": self.field_meta.get("terrain_source", "unknown"),
            "calibrator": self.calibrator.diagnostics.to_dict(),
            "cached_runs": len(cached_ids),
            "grid": {
                "frames": NUM_FRAMES,
                "height": GRID_H,
                "width": GRID_W,
                "channels": 4,
                "bbox": [WEST, SOUTH, EAST, NORTH],
                "z_hat_max_mw_km2": Z_MAX_MW_KM2,
                "sigma_max_mw_km2": SIGMA_MAX_MW_KM2,
            },
            "endpoints": [
                "/api/health",
                "/api/regions",
                "/api/reconstruct",
                "/api/runs/<run_id>/<asset>",
                "/api/observer?frame=12&sensor=viirs",
                "/api/calendar",
                "/api/sensor-model",
                "/api/field-meta",
            ],
        }

    def regions_payload(self) -> dict[str, Any]:
        return {
            "schema_version": "1.0.0",
            "presets": [spec.to_summary_dict() for spec in PRESET_REGIONS],
        }

    def execute_reconstruct(self, body: dict[str, Any]) -> dict[str, Any]:
        region_id = body.get("region_id")
        query_text = body.get("query_text")
        center_lat = float(body["center_lat"]) if body.get("center_lat") is not None else None
        center_lon = float(body["center_lon"]) if body.get("center_lon") is not None else None
        span_lon = float(body["span_lon_deg"]) if body.get("span_lon_deg") is not None else None
        span_lat = float(body["span_lat_deg"]) if body.get("span_lat_deg") is not None else None
        holdout_viirs = bool(body.get("holdout_viirs", False))
        raw_cloud = body.get("cloud_override", None)
        cloud_override = float(raw_cloud) if raw_cloud is not None else None

        spec = resolve_region_request(
            region_id=str(region_id) if region_id is not None else None,
            center_lat=center_lat,
            center_lon=center_lon,
            span_lon_deg=span_lon,
            span_lat_deg=span_lat,
            query_text=str(query_text) if query_text is not None else None,
        )

        c_tag = "cnone" if cloud_override is None else f"c{int(round(cloud_override * 100)):02d}"
        h_tag = "holdout1" if holdout_viirs else "holdout0"
        candidate_run_id = f"{spec.id}_{h_tag}_{c_tag}"

        cached = self.get_run(candidate_run_id)
        if cached is not None:
            solved = cached[0]
        else:
            terrain = load_region_terrain(spec=spec, allow_network=True)
            solved = solve_region_reconstruction(
                region_terrain=terrain,
                holdout_viirs=holdout_viirs,
                cloud_override=cloud_override,
                calibrator=self.calibrator,
            )
            self._store_run(solved)

        rid = solved.run_id
        sat_ext = "png" if "png" in solved.region_terrain.satellite_content_type.lower() else "jpg"
        return {
            "run_id": rid,
            "provenance": solved.provenance,
            "downloaded_firms_rows": 0,
            "region": solved.region_terrain.to_region_metadata(),
            "assets": {
                "dem_f32_url": f"/api/runs/{rid}/dem_f32.bin",
                "satellite_url": f"/api/runs/{rid}/satellite.{sat_ext}",
                "reconstruction_u8_url": f"/api/runs/{rid}/reconstruction_u8.bin",
                "export_geojson_url": f"/api/runs/{rid}/export.geojson",
                "export_csv_url": f"/api/runs/{rid}/export.csv",
            },
            "pipeline_stages": solved.pipeline_stages,
            "metrics": solved.metrics,
            "epoch_summaries": solved.epoch_summaries,
            "observer_passes": solved.observer_passes,
        }

    def query_observer(
        self,
        frame_idx: int,
        sensor_filter: str,
        min_frp: float,
        max_zenith: float,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        """Filter passes and footprints and recompute live sensitivity metrics in NumPy."""
        active_obs = self.observer_data
        active_fp_arrays = self.frame_fp_arrays
        active_tensor = self.tensor_u8
        active_area = self.cell_area_km2
        active_prov = PROVENANCE_NOTE

        if run_id:
            entry = self.get_run(run_id)
            if entry is not None:
                run_obj, run_fps = entry
                active_obs = run_obj.observer_passes
                active_fp_arrays = run_fps
                active_tensor = run_obj.tensor_u8
                active_area = run_obj.cell_area_km2
                active_prov = run_obj.provenance

        frame_meta = active_obs["frames"][frame_idx]
        fp_mat = active_fp_arrays[frame_idx]
        is_day = bool(frame_meta["is_day"])

        s_norm = sensor_filter.strip().lower()
        if s_norm == "all":
            allowed_codes = np.array([0, 1, 2, 3], dtype=np.int32)
            family_for_flux = "VIIRS"
        elif s_norm == "modis":
            allowed_codes = np.array([0, 1], dtype=np.int32)
            family_for_flux = "MODIS"
        elif s_norm == "viirs":
            allowed_codes = np.array([2, 3], dtype=np.int32)
            family_for_flux = "VIIRS"
        elif s_norm.upper() in SENSOR_CODES:
            code = SENSOR_CODES[s_norm.upper()]
            allowed_codes = np.array([code], dtype=np.int32)
            family_for_flux = "MODIS" if code < 2 else "VIIRS"
        else:
            raise ValueError(
                f"Unsupported sensor filter '{sensor_filter}'. Expected all, modis, or viirs."
            )

        matching_passes = [
            p for p in frame_meta["passes"] if int(p["sensor_code"]) in allowed_codes
        ]

        if fp_mat.shape[0] > 0:
            codes_col = fp_mat[:, 7].astype(np.int32)
            sensor_mask = np.isin(codes_col, allowed_codes)
            sensor_pool_count = int(np.sum(sensor_mask))

            scan_col = fp_mat[:, 2]
            track_col = fp_mat[:, 3]
            frp_col = fp_mat[:, 5]
            area_col = scan_col * track_col

            local_vza_deg = invert_view_zenith_from_footprint(scan_col, track_col, codes_col)
            pi_modis = detection_probability(frp_col, area_col, "MODIS", is_day=is_day)
            pi_viirs = detection_probability(frp_col, area_col, "VIIRS", is_day=is_day)
            pi_eff = np.where(codes_col >= 2, pi_viirs, pi_modis)

            keep_mask = (
                sensor_mask
                & (frp_col >= min_frp)
                & (local_vza_deg <= max_zenith)
                & (pi_eff >= 0.25)
            )
            kept = fp_mat[keep_mask]
            kept_vza = local_vza_deg[keep_mask]
            kept_area = area_col[keep_mask]
        else:
            sensor_pool_count = 0
            kept = np.empty((0, 8), dtype=np.float64)
            kept_vza = np.empty((0,), dtype=np.float64)
            kept_area = np.empty((0,), dtype=np.float64)

        footprints_out: list[list[float | int]] = [
            [
                round(float(row[0]), 4),
                round(float(row[1]), 4),
                round(float(row[2]), 2),
                round(float(row[3]), 2),
                round(float(row[4]), 1),
                round(float(row[5]), 2),
                int(round(row[6])),
                int(round(row[7])),
            ]
            for row in kept
        ]

        if matching_passes:
            active_pass = matching_passes[0]
            if s_norm == "all":
                active_pass = next(
                    (p for p in matching_passes if p["sensor"] == frame_meta["sensor"]),
                    matching_passes[0],
                )
            pass_present = bool(float(active_pass["view_zenith_deg"]) <= max_zenith)
        else:
            active_pass = {
                "sensor": frame_meta["sensor"],
                "sensor_code": SENSOR_CODES[frame_meta["sensor"]],
                "subsat_lon": frame_meta["subsat_lon"],
                "subsat_lat": frame_meta["subsat_lat"],
                "altitude_km": frame_meta["altitude_km"],
                "scan_angle_deg": frame_meta["scan_angle_deg"],
                "azimuth_deg": frame_meta["azimuth_deg"],
                "view_zenith_deg": frame_meta["view_zenith_deg"],
                "swath_fraction": 0.0,
            }
            pass_present = False

        z_hat_slice = (
            active_tensor[frame_idx, :, :, 0].astype(np.float64) / 255.0 * Z_MAX_MW_KM2
        )
        sigma_slice = (
            active_tensor[frame_idx, :, :, 1].astype(np.float64) / 255.0 * SIGMA_MAX_MW_KM2
        )
        reconstructed_total_frp_mw = float(np.sum(z_hat_slice * active_area))
        high_sigma_frac = float(np.mean(sigma_slice > 8.0))

        eff_vza = min(float(active_pass["view_zenith_deg"]), max_zenith)
        flux_surviving = (
            observable_flux_fraction(
                family=family_for_flux,
                view_zenith_deg=eff_vza,
                is_day=is_day,
                min_frp_filter_mw=max(0.0, min_frp),
            )
            if (matching_passes and float(active_pass["view_zenith_deg"]) <= max_zenith)
            else 0.0
        )

        return {
            "schema_version": "1.0.0",
            "run_id": run_id,
            "provenance": active_prov,
            "frame": frame_idx,
            "timestamp_utc": frame_meta["timestamp_utc"],
            "local_solar_time_hr": frame_meta["local_solar_time_hr"],
            "is_day": is_day,
            "epistemic_regime": frame_meta["epistemic_regime"],
            "sensor_filter": s_norm,
            "overpass_present": pass_present,
            "sensor": active_pass["sensor"],
            "subsat_lon": active_pass["subsat_lon"],
            "subsat_lat": active_pass["subsat_lat"],
            "altitude_km": active_pass["altitude_km"],
            "scan_angle_deg": active_pass["scan_angle_deg"],
            "azimuth_deg": active_pass["azimuth_deg"],
            "view_zenith_deg": active_pass["view_zenith_deg"],
            "cloud_fraction": frame_meta["cloud_fraction"],
            "passes": matching_passes,
            "sensitivity_diagnostics": {
                "applied_min_frp_mw": round(min_frp, 2),
                "applied_max_zenith_deg": round(max_zenith, 2),
                "sensor_pool_footprints": sensor_pool_count,
                "retained_footprints": len(footprints_out),
                "omitted_by_filter_footprints": max(0, sensor_pool_count - len(footprints_out)),
                "retained_total_frp_mw": round(float(np.sum(kept[:, 5])) if kept.size else 0.0, 2),
                "mean_footprint_area_km2": round(float(np.mean(kept_area)) if kept_area.size else 0.0, 3),
                "mean_local_view_zenith_deg": round(float(np.mean(kept_vza)) if kept_vza.size else 0.0, 2),
                "observable_flux_fraction": flux_surviving,
                "reconstructed_field_total_frp_mw": round(reconstructed_total_frp_mw, 2),
                "mean_epistemic_sigma_mw_km2": round(float(np.mean(sigma_slice)), 3),
                "high_uncertainty_area_fraction": round(high_sigma_frac, 3),
            },
            "footprint_schema": active_obs["footprint_schema"],
            "footprints": footprints_out,
        }


class IsogonHTTPServer(ThreadingHTTPServer):
    """ThreadingHTTPServer with fast socket reuse and attached IsogonDataStore."""

    allow_reuse_address = True

    def __init__(self, server_address: tuple[str, int], store: IsogonDataStore) -> None:
        super().__init__(server_address, IsogonRequestHandler)
        self.store = store


class IsogonRequestHandler(BaseHTTPRequestHandler):
    """CORS-enabled JSON and binary tensor handler for Isogon world-model endpoints."""

    server: IsogonHTTPServer

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Cache-Control", "no-store")

    def _send_bytes(
        self,
        status: int,
        body: bytes,
        content_type: str,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _send_json_bytes(self, status: int, body: bytes) -> None:
        self._send_bytes(status, body, "application/json; charset=utf-8")

    def _send_json_obj(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send_json_bytes(status, encoded)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"
        store = self.server.store

        try:
            if route == "/api/reconstruct":
                length = int(self.headers.get("Content-Length", "0"))
                if length > 262_144:
                    self._send_json_obj(
                        HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                        {"error": "Request body too large"},
                    )
                    return
                raw_body = self.rfile.read(length) if length > 0 else b"{}"
                payload = json.loads(raw_body.decode("utf-8") or "{}")
                if not isinstance(payload, dict):
                    raise ValueError("JSON body must be an object")
                result = store.execute_reconstruct(payload)
                self._send_json_obj(HTTPStatus.OK, result)
                return

            self._send_json_obj(
                HTTPStatus.NOT_FOUND,
                {"error": f"Unknown POST endpoint '{route}'"},
            )
        except (ValueError, json.JSONDecodeError) as exc:
            self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover
            self._send_json_obj(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"
        qs = parse_qs(parsed.query)
        store = self.server.store

        try:
            if route == "/api/health":
                self._send_json_obj(HTTPStatus.OK, store.health_payload())
                return

            if route == "/api/regions":
                self._send_json_obj(HTTPStatus.OK, store.regions_payload())
                return

            if route == "/api/calendar":
                self._send_json_bytes(HTTPStatus.OK, store.calendar_bytes)
                return

            if route == "/api/sensor-model":
                self._send_json_bytes(HTTPStatus.OK, store.sensor_model_bytes)
                return

            if route == "/api/field-meta":
                self._send_json_bytes(HTTPStatus.OK, store.field_meta_bytes)
                return

            if route.startswith("/api/runs/"):
                parts = [unquote(p) for p in route.split("/") if p]
                # Expected: ['api', 'runs', '<run_id>', '<asset>']
                if len(parts) == 4:
                    run_id, asset_name = parts[2], parts[3]
                    entry = store.get_run(run_id)
                    if entry is None:
                        self._send_json_obj(
                            HTTPStatus.NOT_FOUND,
                            {"error": f"Run '{run_id}' not found in active store"},
                        )
                        return
                    run_obj = entry[0]
                    if asset_name == "dem_f32.bin":
                        self._send_bytes(
                            HTTPStatus.OK,
                            run_obj.region_terrain.dem_f32_bytes,
                            "application/octet-stream",
                        )
                        return
                    if asset_name in ("satellite.jpg", "satellite.png"):
                        self._send_bytes(
                            HTTPStatus.OK,
                            run_obj.region_terrain.satellite_bytes,
                            run_obj.region_terrain.satellite_content_type,
                        )
                        return
                    if asset_name == "reconstruction_u8.bin":
                        self._send_bytes(
                            HTTPStatus.OK,
                            run_obj.reconstruction_u8_bytes,
                            "application/octet-stream",
                        )
                        return
                    if asset_name == "export.geojson":
                        self._send_bytes(
                            HTTPStatus.OK,
                            run_obj.export_geojson_bytes,
                            "application/geo+json; charset=utf-8",
                            {"Content-Disposition": f'attachment; filename="{run_id}_harmonized.geojson"'},
                        )
                        return
                    if asset_name == "export.csv":
                        self._send_bytes(
                            HTTPStatus.OK,
                            run_obj.export_csv_bytes,
                            "text/csv; charset=utf-8",
                            {"Content-Disposition": f'attachment; filename="{run_id}_harmonized.csv"'},
                        )
                        return
                    if asset_name == "observer_passes.json":
                        self._send_json_obj(HTTPStatus.OK, run_obj.observer_passes)
                        return

            if route == "/api/observer":
                frame_raw = qs.get("frame", ["0"])[0]
                sensor_raw = qs.get("sensor", ["all"])[0]
                min_frp_raw = qs.get("min_frp", ["0.0"])[0]
                max_zen_raw = qs.get("max_zenith", ["90.0"])[0]
                run_id_raw = qs.get("run_id", [None])[0]

                frame_idx = int(frame_raw)
                if not (0 <= frame_idx < NUM_FRAMES):
                    self._send_json_obj(
                        HTTPStatus.BAD_REQUEST,
                        {"error": f"frame must be between 0 and {NUM_FRAMES - 1}, got {frame_idx}"},
                    )
                    return

                result = store.query_observer(
                    frame_idx=frame_idx,
                    sensor_filter=sensor_raw,
                    min_frp=float(min_frp_raw),
                    max_zenith=float(max_zen_raw),
                    run_id=str(run_id_raw) if run_id_raw else None,
                )
                self._send_json_obj(HTTPStatus.OK, result)
                return

            self._send_json_obj(
                HTTPStatus.NOT_FOUND,
                {
                    "error": f"Unknown endpoint '{route}'",
                    "available_endpoints": [
                        "/api/health",
                        "/api/regions",
                        "/api/reconstruct",
                        "/api/runs/<run_id>/<asset>",
                        "/api/observer",
                        "/api/calendar",
                        "/api/sensor-model",
                        "/api/field-meta",
                    ],
                },
            )
        except ValueError as exc:
            self._send_json_obj(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover
            self._send_json_obj(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write(f"[Isogon API] {self.address_string()} - {fmt % args}\n")


def run_server(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> None:
    fields_dir = _REPO_ROOT / DEFAULT_FIELDS_REL_DIR
    store = IsogonDataStore(fields_dir=fields_dir)
    httpd = IsogonHTTPServer((host, port), store=store)
    print(
        f"[Isogon API] Listening on http://{host}:{port} "
        f"(model={MODEL_VERSION}, terrain={store.field_meta.get('terrain_source')})",
        flush=True,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Isogon scientific HTTP API server.")
    parser.add_argument("--host", default=DEFAULT_HOST, help="Bind host (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Bind port (default 8788)")
    args = parser.parse_args()
    run_server(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
