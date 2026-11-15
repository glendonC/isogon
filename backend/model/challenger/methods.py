"""Challenger blind-test methods and picklable factories.

Wraps the pure-numpy cell probability models (InteractionLogistic, ResidualMLP,
HistGBDT, and their LogitStacker blend), the spatial declaration rule, the
radiative-transfer FRPHead, and the geometry-aware PixelCountHead behind the
backend.eval.blind_test.Method interface.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.eval.blind_test import Method, MethodFactory, Prediction, Target
from backend.eval.grid import EvalGrid
from backend.eval.rows import Detections
from backend.model.challenger.declarations import declare_look_grid
from backend.model.challenger.features import (
    EpisodeFeatureExtractor,
    TargetFeatures,
    _default_occupancy_params,
)
from backend.model.challenger.gbdt import HistGBDT, HistGBDTEnsemble
from backend.model.challenger.guard import refuse_closed_episode, refuse_hidden_rows
from backend.model.challenger.heads import FRPHead, PixelCountHead, VisiblePassContext
from backend.model.challenger.linear_mlp import InteractionLogistic, LogitStacker, ResidualMLP
from backend.model.occupancy import OccupancyParams

FITTED_DIR: Path = Path(__file__).resolve().parent / "fitted"
DEFAULT_POINTER_FILE: str = "default_challenger.json"
VALID_VARIANTS: tuple[str, ...] = ("logistic", "mlp", "gbdt", "blend")

VARIANT_FILES: dict[str, str] = {
    "logistic": "challenger_logistic.json",
    "mlp": "challenger_mlp.json",
    "gbdt": "challenger_gbdt.json",
    "blend": "challenger_blend.json",
}

_BUNDLE_CACHE: dict[tuple[str, int], ChallengerBundle] = {}
_LAST_EPISODE_CTX: tuple[str, EpisodeFeatureExtractor, VisiblePassContext] | None = None
_LAST_TARGET_FEATURES: tuple[tuple[Any, ...], TargetFeatures] | None = None


def compact_json_numbers(obj: Any, sig: int = 7) -> Any:
    """Round floats to sig significant digits for compact JSON storage."""
    if isinstance(obj, bool) or obj is None or isinstance(obj, str):
        return obj
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        v = float(obj)
        if not np.isfinite(v) or v == 0.0:
            return 0.0
        return float(f"{v:.{sig}g}")
    if isinstance(obj, dict):
        return {str(k): compact_json_numbers(val, sig=sig) for k, val in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [compact_json_numbers(val, sig=sig) for val in obj]
    return obj


def _load_gbdt_any(doc: dict[str, Any]) -> HistGBDT | HistGBDTEnsemble:
    if doc.get("model_type") == "HistGBDTEnsemble":
        return HistGBDTEnsemble.from_dict(doc)
    return HistGBDT.from_dict(doc)


def _occ_params_from_dict(doc: dict[str, Any] | None) -> OccupancyParams:
    if not doc:
        return _default_occupancy_params()
    known = set(OccupancyParams.__dataclass_fields__)
    return OccupancyParams(**{k: v for k, v in doc.items() if k in known})


class ChallengerBundle:
    """Serialized weights and settings for one challenger method."""

    def __init__(
        self,
        variant: str,
        name: str,
        label: str,
        fitted_on: dict[str, Any],
        declaration_rule: dict[str, Any],
        frp_head: FRPHead,
        pixel_head: PixelCountHead,
        occ_params: OccupancyParams | None = None,
        logistic_model: InteractionLogistic | None = None,
        mlp_model: ResidualMLP | None = None,
        gbdt_model: HistGBDT | HistGBDTEnsemble | None = None,
        stacker: LogitStacker | None = None,
    ) -> None:
        if variant not in VALID_VARIANTS:
            raise ValueError(f"Unknown challenger variant: {variant}")
        self.variant = str(variant)
        self.name = str(name)
        self.label = str(label)
        self.fitted_on = dict(fitted_on)
        self.declaration_rule = dict(declaration_rule)
        self.frp_head = frp_head
        self.pixel_head = pixel_head
        self.occ_params = occ_params if occ_params is not None else _default_occupancy_params()
        self.logistic_model = logistic_model
        self.mlp_model = mlp_model
        self.gbdt_model = gbdt_model
        self.stacker = stacker

    def predict_cell_proba(self, cell_x: NDArray[np.float32]) -> NDArray[np.float64]:
        """Predict calibrated per-cell detection probabilities on active support."""
        if len(cell_x) == 0:
            return np.empty(0, dtype=np.float64)
        if self.variant == "logistic":
            if self.logistic_model is None:
                raise RuntimeError("ChallengerBundle(logistic) has no logistic_model")
            return self.logistic_model.predict_proba(cell_x)
        if self.variant == "mlp":
            if self.mlp_model is None:
                raise RuntimeError("ChallengerBundle(mlp) has no mlp_model")
            return self.mlp_model.predict_proba(cell_x)
        if self.variant == "gbdt":
            if self.gbdt_model is None:
                raise RuntimeError("ChallengerBundle(gbdt) has no gbdt_model")
            return self.gbdt_model.predict_proba(cell_x)
        if self.variant == "blend":
            if (
                self.logistic_model is None
                or self.mlp_model is None
                or self.gbdt_model is None
                or self.stacker is None
            ):
                raise RuntimeError("ChallengerBundle(blend) requires all three base models and stacker")
            p_log = self.logistic_model.predict_proba(cell_x)
            p_mlp = self.mlp_model.predict_proba(cell_x)
            p_gbdt = self.gbdt_model.predict_proba(cell_x)
            return self.stacker.predict_proba_from_probs([p_log, p_mlp, p_gbdt])
        raise ValueError(f"Unsupported challenger variant: {self.variant}")

    def to_dict(
        self,
        component_files: dict[str, str] | None = None,
        compact_sig: int | None = 7,
    ) -> dict[str, Any]:
        doc: dict[str, Any] = {
            "format": "isogon_challenger_bundle_v1",
            "variant": self.variant,
            "name": self.name,
            "label": self.label,
            "fitted_on": self.fitted_on,
            "declaration_rule": self.declaration_rule,
            "frp_head": self.frp_head.to_dict(),
            "pixel_head": self.pixel_head.to_dict(),
            "occ_params": self.occ_params.as_dict(),
        }
        if self.variant == "blend" and component_files is not None:
            doc["component_files"] = dict(component_files)
            if self.stacker is None:
                raise RuntimeError("ChallengerBundle(blend) has no stacker")
            doc["stacker"] = self.stacker.to_dict()
        else:
            if self.logistic_model is not None:
                doc["logistic_model"] = self.logistic_model.to_dict()
            if self.mlp_model is not None:
                doc["mlp_model"] = self.mlp_model.to_dict()
            if self.gbdt_model is not None:
                doc["gbdt_model"] = self.gbdt_model.to_dict()
            if self.stacker is not None:
                doc["stacker"] = self.stacker.to_dict()
        if compact_sig is not None:
            return compact_json_numbers(doc, sig=compact_sig)
        return doc

    @classmethod
    def from_dict(cls, doc: dict[str, Any], base_dir: Path | None = None) -> ChallengerBundle:
        variant = str(doc["variant"])
        comp_files = doc.get("component_files")
        log_m: InteractionLogistic | None = None
        mlp_m: ResidualMLP | None = None
        gbdt_m: HistGBDT | HistGBDTEnsemble | None = None

        if comp_files is not None:
            root = base_dir if base_dir is not None else FITTED_DIR
            if "logistic" in comp_files:
                c_doc = json.loads((root / comp_files["logistic"]).read_text(encoding="utf-8"))
                log_m = InteractionLogistic.from_dict(c_doc["logistic_model"])
            if "mlp" in comp_files:
                c_doc = json.loads((root / comp_files["mlp"]).read_text(encoding="utf-8"))
                mlp_m = ResidualMLP.from_dict(c_doc["mlp_model"])
            if "gbdt" in comp_files:
                c_doc = json.loads((root / comp_files["gbdt"]).read_text(encoding="utf-8"))
                gbdt_m = _load_gbdt_any(c_doc["gbdt_model"])

        if "logistic_model" in doc and doc["logistic_model"] is not None:
            log_m = InteractionLogistic.from_dict(doc["logistic_model"])
        if "mlp_model" in doc and doc["mlp_model"] is not None:
            mlp_m = ResidualMLP.from_dict(doc["mlp_model"])
        if "gbdt_model" in doc and doc["gbdt_model"] is not None:
            gbdt_m = _load_gbdt_any(doc["gbdt_model"])

        stacker = LogitStacker.from_dict(doc["stacker"]) if doc.get("stacker") is not None else None
        return cls(
            variant=variant,
            name=str(doc["name"]),
            label=str(doc["label"]),
            fitted_on=dict(doc.get("fitted_on") or {}),
            declaration_rule=dict(doc["declaration_rule"]),
            frp_head=FRPHead.from_dict(doc["frp_head"]),
            pixel_head=PixelCountHead.from_dict(doc["pixel_head"]),
            occ_params=_occ_params_from_dict(doc.get("occ_params")),
            logistic_model=log_m,
            mlp_model=mlp_m,
            gbdt_model=gbdt_m,
            stacker=stacker,
        )

    def save_json(
        self,
        path: str | Path,
        component_files: dict[str, str] | None = None,
        compact_sig: int | None = 7,
    ) -> None:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        payload = self.to_dict(component_files=component_files, compact_sig=compact_sig)
        p.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")

    @classmethod
    def load_json(cls, path: str | Path) -> ChallengerBundle:
        p = Path(path).resolve()
        stat = p.stat()
        cache_key = (str(p), int(stat.st_mtime_ns))
        cached = _BUNDLE_CACHE.get(cache_key)
        if cached is not None:
            return cached
        doc = json.loads(p.read_text(encoding="utf-8"))
        bundle = cls.from_dict(doc, base_dir=p.parent)
        _BUNDLE_CACHE[cache_key] = bundle
        return bundle


def _episode_content_key(visible: Detections, grid: EvalGrid, occ_params: OccupancyParams) -> str:
    h = hashlib.sha256()
    h.update(repr(tuple(float(v) for v in grid.bbox)).encode("utf-8"))
    h.update(repr(float(grid.cell_km)).encode("utf-8"))
    h.update(json.dumps(occ_params.as_dict(), sort_keys=True).encode("utf-8"))
    for arr in (
        visible.lon,
        visible.lat,
        visible.time_s,
        visible.frp_mw,
        visible.scan_km,
        visible.track_km,
        visible.confidence,
        visible.platform_code,
        visible.is_day,
    ):
        h.update(np.ascontiguousarray(arr).tobytes())
    return h.hexdigest()


def _shared_episode_context(
    visible: Detections,
    grid: EvalGrid,
    occ_params: OccupancyParams,
) -> tuple[str, EpisodeFeatureExtractor, VisiblePassContext]:
    global _LAST_EPISODE_CTX
    key = _episode_content_key(visible, grid, occ_params)
    if _LAST_EPISODE_CTX is not None and _LAST_EPISODE_CTX[0] == key:
        return _LAST_EPISODE_CTX
    extractor = EpisodeFeatureExtractor(visible, grid, occ_params=occ_params, use_terrain=True)
    vis_ctx = VisiblePassContext.from_episode(visible, grid)
    _LAST_EPISODE_CTX = (key, extractor, vis_ctx)
    return _LAST_EPISODE_CTX


def _shared_target_features(
    ep_key: str,
    extractor: EpisodeFeatureExtractor,
    target: Target,
) -> TargetFeatures:
    global _LAST_TARGET_FEATURES
    t_key = (
        ep_key,
        str(target.platform),
        float(target.time_s),
        bool(target.is_day),
        float(target.scan_km),
        float(target.track_km),
    )
    if _LAST_TARGET_FEATURES is not None and _LAST_TARGET_FEATURES[0] == t_key:
        return _LAST_TARGET_FEATURES[1]
    tf = extractor.extract(target)
    _LAST_TARGET_FEATURES = (t_key, tf)
    return tf


class ChallengerMethod:
    """Blind-test Method predicting hidden 375 m detections from visible coarse rows alone."""

    def __init__(
        self,
        visible: Detections,
        grid: EvalGrid,
        bundle: ChallengerBundle,
        name: str | None = None,
        label: str | None = None,
    ) -> None:
        refuse_hidden_rows(visible, "VIIRS")
        self.grid = grid
        self.bundle = bundle
        self.name = str(name) if name is not None else bundle.name
        self.label = str(label) if label is not None else bundle.label
        self._ep_key, self._extractor, self._vis_ctx = _shared_episode_context(
            visible, grid, bundle.occ_params
        )

    def predict(self, target: Target) -> Prediction:
        t_s = float(target.time_s)
        refuse_closed_episode(self.grid.bbox, t_s, t_s)
        tf = _shared_target_features(self._ep_key, self._extractor, target)

        p_detect = np.zeros(self.grid.shape, dtype=np.float64)
        idx = tf.active_idx
        if idx.size > 0:
            p_act = np.clip(self.bundle.predict_cell_proba(tf.cell_x), 0.0, 1.0)
            p_detect.ravel()[idx] = p_act
        else:
            p_act = np.empty(0, dtype=np.float64)

        cells = declare_look_grid(p_detect, self.bundle.declaration_rule)

        frp_tot, frp_lo, frp_hi = self.bundle.frp_head.predict_one(
            tf.look_x, vis_context=self._vis_ctx, target_slot=target
        )
        frp_tot = max(0.0, float(frp_tot))
        frp_lo = max(0.0, min(float(frp_lo), frp_tot))
        frp_hi = max(frp_tot, float(frp_hi))

        pix_tot, pix_lo, pix_hi = self.bundle.pixel_head.predict_one(
            p_act, tf.look_x, vis_context=self._vis_ctx, target_slot=target
        )
        pix_tot = max(0.0, float(pix_tot))
        pix_lo = max(0.0, min(float(pix_lo), pix_tot))
        pix_hi = max(pix_tot, float(pix_hi))

        frp_mw = np.zeros(self.grid.shape, dtype=np.float64)
        if idx.size > 0 and frp_tot > 0.0:
            rec_f = np.maximum(tf.rec_frp.ravel()[idx], 0.0)
            near_f = np.maximum(tf.near_frp_dedup.ravel()[idx], 0.0)
            w_cell = p_act * (0.60 * rec_f + 0.40 * near_f + 1e-2)
            w_sum = float(w_cell.sum())
            if w_sum > 0.0:
                frp_mw.ravel()[idx] = w_cell * (frp_tot / w_sum)
            else:
                frp_mw.ravel()[idx] = frp_tot / float(idx.size)

        return Prediction(
            p_detect=p_detect,
            frp_mw=frp_mw,
            frp_total_mw=frp_tot,
            frp_total_lo=frp_lo,
            frp_total_hi=frp_hi,
            level=float(self.bundle.frp_head.level),
            cells=cells,
            pixels=pix_tot,
            pixels_lo=pix_lo,
            pixels_hi=pix_hi,
            pixels_level=float(self.bundle.pixel_head.level),
        )


def default_variant(fitted_dir: Path = FITTED_DIR) -> str:
    """Return the validation-chosen challenger variant recorded in default_challenger.json."""
    ptr = fitted_dir / DEFAULT_POINTER_FILE
    if ptr.is_file():
        doc = json.loads(ptr.read_text(encoding="utf-8"))
        chosen = str(doc.get("default_variant", "blend"))
        if chosen in VALID_VARIANTS:
            return chosen
    return "blend"


def resolve_bundle_path(variant: str | None = None, bundle_path: str | Path | None = None) -> Path:
    if bundle_path is not None:
        return Path(bundle_path)
    chosen = default_variant() if variant is None else str(variant)
    if chosen not in VARIANT_FILES:
        raise ValueError(f"Unknown challenger variant: {chosen}")
    return FITTED_DIR / VARIANT_FILES[chosen]


def load_challenger_bundle(
    variant: str | None = None,
    bundle_path: str | Path | None = None,
) -> ChallengerBundle:
    """Load a fitted ChallengerBundle from backend/model/challenger/fitted."""
    path = resolve_bundle_path(variant=variant, bundle_path=bundle_path)
    if not path.is_file():
        raise FileNotFoundError(f"Fitted challenger bundle not found at {path.name}")
    return ChallengerBundle.load_json(path)


@dataclass(frozen=True)
class ChallengerFactory:
    """Picklable top-level MethodFactory for ProcessPoolExecutor blind-test runs."""

    variant: str | None = None
    name: str | None = None
    label: str | None = None
    bundle_path: str | None = None

    def __call__(self, visible: Detections, grid: EvalGrid) -> Method:
        refuse_hidden_rows(visible, "VIIRS")
        bundle = load_challenger_bundle(variant=self.variant, bundle_path=self.bundle_path)
        return ChallengerMethod(visible, grid, bundle, name=self.name, label=self.label)


def challenger_logistic_factory(
    name: str | None = None,
    label: str | None = None,
    bundle_path: str | Path | None = None,
) -> ChallengerFactory:
    return ChallengerFactory(
        variant="logistic",
        name=name,
        label=label,
        bundle_path=None if bundle_path is None else str(bundle_path),
    )


def challenger_mlp_factory(
    name: str | None = None,
    label: str | None = None,
    bundle_path: str | Path | None = None,
) -> ChallengerFactory:
    return ChallengerFactory(
        variant="mlp",
        name=name,
        label=label,
        bundle_path=None if bundle_path is None else str(bundle_path),
    )


def challenger_gbdt_factory(
    name: str | None = None,
    label: str | None = None,
    bundle_path: str | Path | None = None,
) -> ChallengerFactory:
    return ChallengerFactory(
        variant="gbdt",
        name=name,
        label=label,
        bundle_path=None if bundle_path is None else str(bundle_path),
    )


def challenger_blend_factory(
    name: str | None = None,
    label: str | None = None,
    bundle_path: str | Path | None = None,
) -> ChallengerFactory:
    return ChallengerFactory(
        variant="blend",
        name=name,
        label=label,
        bundle_path=None if bundle_path is None else str(bundle_path),
    )


def default_challenger_factory(
    name: str | None = None,
    label: str | None = None,
    bundle_path: str | Path | None = None,
) -> ChallengerFactory:
    """Return the factory for the validation-selected headline challenger."""
    return ChallengerFactory(
        variant=None,
        name=name,
        label=label,
        bundle_path=None if bundle_path is None else str(bundle_path),
    )


def all_challenger_factories() -> list[MethodFactory]:
    """Return factories for all four challenger models."""
    return [
        challenger_logistic_factory(),
        challenger_mlp_factory(),
        challenger_gbdt_factory(),
        challenger_blend_factory(),
    ]


def make_challenger_method(
    visible: Detections,
    grid: EvalGrid,
    variant: str | None = None,
    name: str | None = None,
    label: str | None = None,
    bundle_path: str | Path | None = None,
) -> ChallengerMethod:
    """Construct a ChallengerMethod directly from visible coarse detections and an EvalGrid."""
    refuse_hidden_rows(visible, "VIIRS")
    bundle = load_challenger_bundle(variant=variant, bundle_path=bundle_path)
    return ChallengerMethod(visible, grid, bundle, name=name, label=label)
