"""Fit challenger models on SPLIT.md fitting fires and score on validation fires.

Enforces strict separation from sealed test places (test_a and test_b) and
closed 2021 windows, calibrates thresholds, stacking weights, and 90 percent
intervals strictly via place-grouped out-of-fold predictions on the fitting
fires, evaluates once on the validation fires beside reconstruction and both
baselines, and writes fitted bundles plus validation_results.json with sha256
digests of every file read.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor
import hashlib
import json
from pathlib import Path
import time
from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.eval import metrics as M
from backend.eval import schedule as S
from backend.eval.baselines import overlap_ratio_factory, painted_modis_factory
from backend.eval.blind_test import (
    bootstrap_verdict,
    pool_reports,
    run_blind_test,
    split_hidden,
    verdict,
)
from backend.eval.grid import EvalGrid, paint
from backend.model.challenger.declarations import declare_look_grid
from backend.model.challenger.features import EpisodeFeatureExtractor
from backend.model.challenger.gbdt import make_default_single_gbdt
from backend.model.challenger.guard import (
    REPO_ROOT,
    refuse_closed_episode,
    refuse_forbidden_place,
    relative_digest_entry,
    sha256_file,
)
from backend.model.challenger.heads import (
    FRPHead,
    PixelCountHead,
    VisiblePassContext,
    _grouped_kfold_masks,
    slot_to_dict,
    summarize_prob_maps_by_counts,
)
from backend.model.challenger.linear_mlp import (
    InteractionLogistic,
    LogitStacker,
    ResidualMLP,
)
from backend.model.challenger.methods import (
    DEFAULT_POINTER_FILE,
    FITTED_DIR,
    VALID_VARIANTS,
    VARIANT_FILES,
    ChallengerBundle,
    challenger_blend_factory,
    challenger_gbdt_factory,
    challenger_logistic_factory,
    challenger_mlp_factory,
    compact_json_numbers,
)
from backend.model.challenger.world_split import (
    DEFAULT_WORK_DIR,
    WorldEpisodePasses,
    load_world_episode_rows,
    parse_split_markdown,
    prepare_world_cache,
    resolve_paths_from_env,
    world_episode_ratio,
)
from backend.model.fitted import (
    FITTED_DIR as IN_USE_FITTED_DIR,
    PARAMS_FILE,
    RATIO_FILE,
    load_params,
    load_ratio_fit,
)
from backend.model.occupancy import OccupancyParams
from backend.model.real_blind import reconstruction_factory

TAU_CANDIDATES: tuple[float, ...] = (0.23, 0.245, 0.26, 0.275, 0.29, 0.305, 0.32)
CONTINENTS_ORDER: tuple[str, ...] = (
    "Africa",
    "Asia",
    "Europe",
    "North America",
    "Oceania",
    "South America",
)
ZONES_ORDER: tuple[str, ...] = ("boreal", "temperate", "subtropical", "tropical")


def _vis_ctx_to_serializable(ctx: VisiblePassContext) -> dict[str, Any]:
    near_list = []
    for p in ctx.near_passes:
        near_list.append(
            {
                "time_s": float(p["time_s"]),
                "platform": str(p["platform"]),
                "is_day": bool(p["is_day"]),
                "lst_hr": float(p["lst_hr"]),
                "n_ctx": int(p["n_ctx"]),
                "n_in": int(p["n_in"]),
                "pnt_cells": int(p["pnt_cells"]),
                "ovl": np.asarray(p["ovl"], dtype=np.float64).tolist(),
                "frp": np.asarray(p["frp"], dtype=np.float64).tolist(),
                "y_ded": np.asarray(p["y_ded"], dtype=np.float64).tolist(),
                "area": np.asarray(p["area"], dtype=np.float64).tolist(),
                "dens": np.asarray(p["dens"], dtype=np.float64).tolist(),
                "is_in": np.asarray(p["is_in"], dtype=bool).tolist(),
                "in_share": np.asarray(p["in_share"], dtype=np.float64).tolist(),
            }
        )
    return {
        "lon_mid": float(ctx.lon_mid),
        "lat_mid": float(ctx.lat_mid),
        "cell_area_km2": float(ctx.cell_area_km2),
        "w_km": float(ctx.w_km),
        "h_km": float(ctx.h_km),
        "near_passes": near_list,
        "empty_noms": [dict(e) for e in ctx.empty_noms],
    }


def _extract_fitting_episode_job(
    job: tuple[int, dict[str, Any], str, set[str], dict[str, Any]],
) -> dict[str, Any]:
    ep_idx, ep, work_s, forbidden_set, occ_dict = job
    work_dir = Path(work_s)
    forbidden = frozenset(forbidden_set)
    refuse_forbidden_place(ep["place_id"], forbidden)
    box = tuple(float(v) for v in ep["box"])
    start_s = float(ep["start_s"])
    end_s = float(ep["end_s"])
    refuse_closed_episode(box, start_s, end_s)

    try:
        det = load_world_episode_rows(ep, work_dir, forbidden)
        vis, hid = split_hidden(det, "VIIRS")
        grid = EvalGrid.from_bbox(box)
        slots, _, _ = S.schedule_for(
            "VIIRS",
            None,
            start_s,
            end_s,
            box,
            source=S.SOURCE_CMR,
            read_passes=WorldEpisodePasses(work_dir, ep["key"]),
        )
        occ_params = OccupancyParams(**occ_dict)
        extractor = EpisodeFeatureExtractor(vis, grid, occ_params=occ_params, use_terrain=True)
        vis_ctx = VisiblePassContext.from_episode(vis, grid)
        in_box_hid = hid.in_box(box)

        cell_x_parts: list[NDArray[np.float32]] = []
        cell_y_parts: list[NDArray[np.uint8]] = []
        act_idx_parts: list[NDArray[np.int32]] = []
        truth_idx_parts: list[NDArray[np.int32]] = []
        act_counts: list[int] = []
        truth_counts: list[int] = []
        look_xs: list[NDArray[np.float64]] = []
        truth_pix_list: list[float] = []
        truth_frp_list: list[float] = []
        slot_dicts: list[dict[str, Any]] = []

        for slot in slots:
            tf = extractor.extract(slot)
            rows = S.rows_of_slot(hid.time_s, hid.platform_code, slot)
            inside = rows[in_box_hid[rows]]
            truth = paint(grid, hid.select(inside))
            t_flat = np.flatnonzero(truth.mask).astype(np.int32)
            cy = truth.mask.ravel()[tf.active_idx].astype(np.uint8)

            cell_x_parts.append(tf.cell_x)
            cell_y_parts.append(cy)
            act_idx_parts.append(tf.active_idx.astype(np.int32))
            truth_idx_parts.append(t_flat)
            act_counts.append(int(tf.active_idx.size))
            truth_counts.append(int(t_flat.size))
            look_xs.append(tf.look_x)
            truth_pix_list.append(float(inside.size))
            truth_frp_list.append(float(truth.frp_total_mw))
            slot_dicts.append(slot_to_dict(slot, ep_idx=ep_idx))

        return {
            "ok": True,
            "ep_idx": ep_idx,
            "key": ep["key"],
            "place_id": ep["place_id"],
            "grid_ny": int(grid.ny),
            "grid_nx": int(grid.nx),
            "terrain_available": bool(extractor.terrain.available),
            "vis_ctx": _vis_ctx_to_serializable(vis_ctx),
            "cell_x": (
                np.concatenate(cell_x_parts, axis=0)
                if cell_x_parts
                else np.zeros((0, 35), dtype=np.float32)
            ),
            "cell_y": (
                np.concatenate(cell_y_parts, axis=0)
                if cell_y_parts
                else np.zeros(0, dtype=np.uint8)
            ),
            "active_idx": (
                np.concatenate(act_idx_parts, axis=0)
                if act_idx_parts
                else np.zeros(0, dtype=np.int32)
            ),
            "truth_idx": (
                np.concatenate(truth_idx_parts, axis=0)
                if truth_idx_parts
                else np.zeros(0, dtype=np.int32)
            ),
            "act_counts": act_counts,
            "truth_counts": truth_counts,
            "look_x": (
                np.vstack(look_xs)
                if look_xs
                else np.zeros((0, 25), dtype=np.float64)
            ),
            "truth_pix": truth_pix_list,
            "truth_frp": truth_frp_list,
            "slot_dicts": slot_dicts,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "ep_idx": ep_idx,
            "key": ep["key"],
            "error": f"{type(exc).__name__}: {exc}",
        }


def extract_or_load_fitting_dataset(
    fitting_eps: list[dict[str, Any]],
    work_dir: Path,
    forbidden: frozenset[str],
    occ_params: OccupancyParams,
    plan_sha256: str,
    split_md_sha256: str,
    workers: int = 4,
) -> dict[str, Any]:
    npz_path = work_dir / "challenger_fit_features.npz"
    meta_path = work_dir / "challenger_fit_features_meta.json"
    if npz_path.is_file() and meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if (
            meta.get("plan_sha256") == plan_sha256
            and meta.get("split_md_sha256") == split_md_sha256
            and meta.get("n_episodes_input") == len(fitting_eps)
        ):
            print("loading cached fitting feature arrays from work_dir...")
            arrs = np.load(npz_path)
            return {
                "meta": meta,
                "cell_x": arrs["cell_x"],
                "cell_y": arrs["cell_y"],
                "active_idx": arrs["active_idx"],
                "truth_idx": arrs["truth_idx"],
                "look_act_counts": arrs["look_act_counts"],
                "look_truth_counts": arrs["look_truth_counts"],
                "look_grid_ny": arrs["look_grid_ny"],
                "look_grid_nx": arrs["look_grid_nx"],
                "look_x": arrs["look_x"],
                "truth_pix": arrs["truth_pix"],
                "truth_frp": arrs["truth_frp"],
                "look_place_ids": np.asarray(meta["look_place_ids"]),
                "vis_contexts": [VisiblePassContext.from_raw_dict(d) for d in meta["vis_contexts"]],
                "slot_infos": meta["slot_infos"],
            }

    print(f"extracting features across {len(fitting_eps)} fitting episodes ({workers} workers)...")
    t0 = time.time()
    occ_dict = occ_params.as_dict()
    forbidden_set = set(forbidden)
    jobs = [
        (idx, ep, str(work_dir), forbidden_set, occ_dict)
        for idx, ep in enumerate(fitting_eps)
    ]
    if workers <= 1:
        raw_res = [_extract_fitting_episode_job(j) for j in jobs]
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            raw_res = list(pool.map(_extract_fitting_episode_job, jobs, chunksize=2))

    raw_res.sort(key=lambda d: int(d["ep_idx"]))
    cell_x_all: list[NDArray[np.float32]] = []
    cell_y_all: list[NDArray[np.uint8]] = []
    act_idx_all: list[NDArray[np.int32]] = []
    truth_idx_all: list[NDArray[np.int32]] = []
    look_act_counts: list[int] = []
    look_truth_counts: list[int] = []
    look_ny: list[int] = []
    look_nx: list[int] = []
    look_x_all: list[NDArray[np.float64]] = []
    truth_pix_all: list[float] = []
    truth_frp_all: list[float] = []
    look_place_ids: list[str] = []
    vis_ctx_dicts: list[dict[str, Any]] = []
    slot_infos: list[dict[str, Any]] = []
    skipped: dict[str, str] = {}
    terrain_ep_count = 0

    kept_ep_idx = 0
    for r in raw_res:
        if not r["ok"]:
            skipped[r["key"]] = r["error"]
            continue
        n_l = len(r["act_counts"])
        if n_l == 0:
            skipped[r["key"]] = "zero scheduled CMR slots"
            continue
        if r["terrain_available"]:
            terrain_ep_count += 1
        vis_ctx_dicts.append(r["vis_ctx"])
        cell_x_all.append(r["cell_x"])
        cell_y_all.append(r["cell_y"])
        act_idx_all.append(r["active_idx"])
        truth_idx_all.append(r["truth_idx"])
        look_act_counts.extend(r["act_counts"])
        look_truth_counts.extend(r["truth_counts"])
        look_ny.extend([int(r["grid_ny"])] * n_l)
        look_nx.extend([int(r["grid_nx"])] * n_l)
        look_x_all.append(r["look_x"])
        truth_pix_all.extend(r["truth_pix"])
        truth_frp_all.extend(r["truth_frp"])
        look_place_ids.extend([str(r["place_id"])] * n_l)
        for sd in r["slot_dicts"]:
            sd_copy = dict(sd)
            sd_copy["ep_idx"] = kept_ep_idx
            slot_infos.append(sd_copy)
        kept_ep_idx += 1

    cell_x_cat = np.concatenate(cell_x_all, axis=0)
    cell_y_cat = np.concatenate(cell_y_all, axis=0)
    act_idx_cat = np.concatenate(act_idx_all, axis=0)
    truth_idx_cat = np.concatenate(truth_idx_all, axis=0)
    look_act_arr = np.asarray(look_act_counts, dtype=np.int32)
    look_truth_arr = np.asarray(look_truth_counts, dtype=np.int32)
    look_ny_arr = np.asarray(look_ny, dtype=np.int32)
    look_nx_arr = np.asarray(look_nx, dtype=np.int32)
    look_x_cat = np.vstack(look_x_all)
    truth_pix_arr = np.asarray(truth_pix_all, dtype=np.float64)
    truth_frp_arr = np.asarray(truth_frp_all, dtype=np.float64)

    meta = {
        "plan_sha256": plan_sha256,
        "split_md_sha256": split_md_sha256,
        "n_episodes_input": len(fitting_eps),
        "n_episodes_kept": kept_ep_idx,
        "n_episodes_with_cached_terrain": terrain_ep_count,
        "skipped_episodes": skipped,
        "n_looks": int(len(look_act_counts)),
        "n_active_cells": int(len(cell_y_cat)),
        "n_positive_active_cells": int(cell_y_cat.sum()),
        "extraction_seconds": round(time.time() - t0, 1),
        "look_place_ids": look_place_ids,
        "vis_contexts": vis_ctx_dicts,
        "slot_infos": slot_infos,
    }
    np.savez(
        npz_path,
        cell_x=cell_x_cat,
        cell_y=cell_y_cat,
        active_idx=act_idx_cat,
        truth_idx=truth_idx_cat,
        look_act_counts=look_act_arr,
        look_truth_counts=look_truth_arr,
        look_grid_ny=look_ny_arr,
        look_grid_nx=look_nx_arr,
        look_x=look_x_cat,
        truth_pix=truth_pix_arr,
        truth_frp=truth_frp_arr,
    )
    meta_path.write_text(json.dumps(meta) + "\n", encoding="utf-8")
    print(
        f"extracted {kept_ep_idx} fitting episodes ({len(look_act_counts)} looks, "
        f"{len(cell_y_cat)} active cells) in {meta['extraction_seconds']} s"
    )
    return {
        "meta": meta,
        "cell_x": cell_x_cat,
        "cell_y": cell_y_cat,
        "active_idx": act_idx_cat,
        "truth_idx": truth_idx_cat,
        "look_act_counts": look_act_arr,
        "look_truth_counts": look_truth_arr,
        "look_grid_ny": look_ny_arr,
        "look_grid_nx": look_nx_arr,
        "look_x": look_x_cat,
        "truth_pix": truth_pix_arr,
        "truth_frp": truth_frp_arr,
        "look_place_ids": np.asarray(look_place_ids),
        "vis_contexts": [VisiblePassContext.from_raw_dict(d) for d in vis_ctx_dicts],
        "slot_infos": slot_infos,
    }


def select_declaration_rule_oof(
    oof_probs: NDArray[np.float64],
    active_idx: NDArray[np.int32],
    truth_idx: NDArray[np.int32],
    look_act_counts: NDArray[np.int32],
    look_truth_counts: NDArray[np.int32],
    look_ny: NDArray[np.int32],
    look_nx: NDArray[np.int32],
    tau_candidates: tuple[float, ...] = TAU_CANDIDATES,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Choose tau_hi in core_plus_spine strictly on fitting OOF predictions."""
    n_looks = len(look_act_counts)
    act_off = np.zeros(n_looks + 1, dtype=np.int64)
    np.cumsum(look_act_counts, out=act_off[1:])
    tr_off = np.zeros(n_looks + 1, dtype=np.int64)
    np.cumsum(look_truth_counts, out=tr_off[1:])

    totals_strict = {tau: M.Counts(0, 0, 0, 0) for tau in tau_candidates}
    totals_tol = {tau: M.Counts(0, 0, 0, 0) for tau in tau_candidates}

    for i in range(n_looks):
        ny, nx = int(look_ny[i]), int(look_nx[i])
        a0, a1 = int(act_off[i]), int(act_off[i + 1])
        t0, t1 = int(tr_off[i]), int(tr_off[i + 1])

        truth_mask = np.zeros((ny, nx), dtype=bool)
        if t1 > t0:
            truth_mask.ravel()[truth_idx[t0:t1]] = True

        if a1 == a0:
            if t1 > t0:
                fn_c = int(truth_mask.sum())
                tn_c = ny * nx - fn_c
                miss_cnt = M.Counts(0, 0, fn_c, tn_c)
                for tau in tau_candidates:
                    totals_strict[tau] = totals_strict[tau] + miss_cnt
                    totals_tol[tau] = totals_tol[tau] + miss_cnt
            else:
                zero_cnt = M.Counts(0, 0, 0, ny * nx)
                for tau in tau_candidates:
                    totals_strict[tau] = totals_strict[tau] + zero_cnt
                    totals_tol[tau] = totals_tol[tau] + zero_cnt
            continue

        p_grid = np.zeros((ny, nx), dtype=np.float64)
        p_grid.ravel()[active_idx[a0:a1]] = oof_probs[a0:a1]

        for tau in tau_candidates:
            rule = {
                "kind": "core_plus_spine",
                "w_blur": 0.20,
                "tau_hi": float(tau),
                "s_min": 0.78,
                "p_peak_min": 0.135,
            }
            pmask = declare_look_grid(p_grid, rule)
            totals_strict[tau] = totals_strict[tau] + M.contingency(pmask, truth_mask)
            totals_tol[tau] = totals_tol[tau] + M.contingency_tolerant(pmask, truth_mask, 1)

    sweep: list[dict[str, Any]] = []
    best_tau = tau_candidates[0]
    best_obj = -1.0
    for tau in tau_candidates:
        s_sc = M.scores(totals_strict[tau])
        t_sc = M.scores(totals_tol[tau])
        csi_s = float(s_sc["csi"] or 0.0)
        csi_t = float(t_sc["csi"] or 0.0)
        obj = 0.5 * csi_s + 0.5 * csi_t
        sweep.append(
            {
                "tau_hi": float(tau),
                "fitting_oof_csi_strict_375m": round(csi_s, 6),
                "fitting_oof_csi_tolerant_1_cell": round(csi_t, 6),
                "fitting_oof_mean_csi": round(obj, 6),
            }
        )
        if obj > best_obj:
            best_obj = obj
            best_tau = tau

    best_rule = {
        "kind": "core_plus_spine",
        "w_blur": 0.20,
        "tau_hi": float(best_tau),
        "s_min": 0.78,
        "p_peak_min": 0.135,
    }
    return best_rule, sweep


def _score_validation_episode_job(
    job: tuple[dict[str, Any], str, str, set[str], dict[str, Any], dict[str, Any]],
) -> tuple[str, dict[str, Any] | None, str | None]:
    ep, work_s, out_s, forbidden_set, occ_dict, rows_step_slim = job
    work_dir = Path(work_s)
    out_dir = Path(out_s)
    forbidden = frozenset(forbidden_set)
    try:
        refuse_forbidden_place(ep["place_id"], forbidden)
        box = tuple(float(v) for v in ep["box"])
        start_s = float(ep["start_s"])
        end_s = float(ep["end_s"])
        refuse_closed_episode(box, start_s, end_s)

        det = load_world_episode_rows(ep, work_dir, forbidden)
        cal_ratio = world_episode_ratio(ep, rows_step_slim, forbidden)
        ratio_fit = load_ratio_fit()
        if ratio_fit is None:
            raise RuntimeError("tracked overlap_ratio.json is missing")
        occ_params = OccupancyParams(**occ_dict)

        factories = [
            painted_modis_factory,
            overlap_ratio_factory(ratio_fit, cal_ratio),
            reconstruction_factory(occ_params),
            challenger_logistic_factory(bundle_path=out_dir / VARIANT_FILES["logistic"]),
            challenger_mlp_factory(bundle_path=out_dir / VARIANT_FILES["mlp"]),
            challenger_gbdt_factory(bundle_path=out_dir / VARIANT_FILES["gbdt"]),
            challenger_blend_factory(bundle_path=out_dir / VARIANT_FILES["blend"]),
        ]
        rep = run_blind_test(
            det,
            box,
            factories,
            window=(start_s, end_s),
            schedule=S.SOURCE_CMR,
            read_passes=WorldEpisodePasses(work_dir, ep["key"]),
        )
        rep.pop("definitions", None)
        rep["episode"] = ep["key"]
        return ep["key"], rep, None
    except Exception as exc:  # noqa: BLE001
        return ep["key"], None, f"{type(exc).__name__}: {exc}"


def _format_pooled_table(pooled: dict[str, Any]) -> str:
    lines = [
        f"runs: {pooled['runs']}   scored overpasses: {pooled['scored_overpasses']}   "
        f"hidden rows in test box: {pooled['hidden_rows_in_test_box']}",
        f"{'method':<24}{'CSI':>8}{'CSI+1':>8}{'hit=A':>8}{'Brier':>10}"
        f"{'PIXsum':>8}{'FRPsum':>8}{'|FRP|med':>10}{'FRPcov':>14}",
    ]
    for name, m in pooled["methods"].items():
        s = m["strict_375m"]
        t = m["tolerant_1_cell"]
        ea = m.get("equal_area") or {}
        f = m["frp_total"]
        iv = m["interval"]
        pc = m.get("pixel_count") or {}
        cov = "none" if iv.get("coverage") is None else f"{iv['covered']}/{iv['n']} ({iv['coverage']:.3f})"
        lines.append(
            f"{name:<24}"
            f"{(s['csi'] or 0.0):>8.4f}"
            f"{(t['csi'] or 0.0):>8.4f}"
            f"{(ea.get('hit_rate') or 0.0):>8.4f}"
            f"{(m['brier'] or 0.0):>10.6f}"
            f"{(pc.get('ratio_of_sums') or 0.0):>8.4f}"
            f"{(f['ratio_of_sums'] or 0.0):>8.4f}"
            f"{(f['median_abs_relative_error'] or 0.0):>10.4f}"
            f"{cov:>14}"
        )
    return "\n".join(lines)


def _judge_method(
    reports: list[dict[str, Any]],
    method: str,
    baselines: tuple[str, ...] = ("painted_modis", "overlap_ratio"),
) -> dict[str, Any]:
    if not reports:
        return {"episodes": 0}
    keep = (method, *baselines)
    slim = [{**r, "methods": {k: r["methods"][k] for k in keep}} for r in reports]
    pooled = pool_reports(slim)
    iv = pooled["methods"][method]["interval"]
    pix_iv = (pooled["methods"][method].get("pixel_count") or {}).get("interval") or {}
    out: dict[str, Any] = {
        "episodes": len(reports),
        "scored_looks": int(pooled["scored_overpasses"]),
        "frp_interval": {
            "stated_level": iv.get("stated_level"),
            "observed_coverage": iv.get("coverage"),
            "covered": iv.get("covered"),
            "looks": iv.get("n"),
        },
        "pixel_interval": {
            "stated_level": pix_iv.get("stated_level"),
            "observed_coverage": pix_iv.get("coverage"),
            "covered": pix_iv.get("covered"),
            "looks": pix_iv.get("n"),
        },
    }
    if len(reports) < 2:
        out["why_no_interval"] = "fewer than two episodes"
        return out
    bv = bootstrap_verdict(slim, method=method, baselines=baselines)
    out["ahead"] = int(bv["classes"]["ahead"])
    out["tie"] = int(bv["classes"]["tie"])
    out["behind"] = int(bv["classes"]["behind"])
    out["classes"] = {k: row.get("class") for k, row in bv["scores"].items()}
    out["scores"] = bv["scores"]
    return out


def _tree_sha256(items: list[Any]) -> str:
    payload = json.dumps(items, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _collect_digests(
    split_doc: dict[str, Any],
    rows_step: dict[str, Any],
) -> dict[str, Any]:
    tracked_cfg = []
    for p in (IN_USE_FITTED_DIR / PARAMS_FILE, IN_USE_FITTED_DIR / RATIO_FILE):
        if p.is_file():
            tracked_cfg.append(relative_digest_entry(p, REPO_ROOT))

    challenger_src = [
        relative_digest_entry(p, REPO_ROOT)
        for p in sorted((REPO_ROOT / "backend" / "model" / "challenger").glob("*.py"))
    ]

    tiles_dir = REPO_ROOT / "data" / "cache" / "tiles"
    dem_tiles = []
    if tiles_dir.is_dir():
        for p in sorted(tiles_dir.glob("dem_11_*.png")):
            dem_tiles.append([f"data/cache/tiles/{p.name}", int(p.stat().st_size), sha256_file(p)])

    cmr_compact = [
        [str(d["path"]), int(d["bytes"]), str(d["sha256"])]
        for d in rows_step.get("cmr_files", [])
    ]
    world_compact = [
        [str(d["path"]), int(d["bytes"]), str(d["sha256"])]
        for d in rows_step.get("files", [])
    ]

    return {
        "split_md": {
            "logical_path": "fire-model/SPLIT.md",
            "protocol_id": split_doc["protocol_id"],
            "protocol_sha256": split_doc["protocol_sha256"],
            "plan_sha256": split_doc["plan_sha256"],
            "sha256": split_doc["split_md_sha256"],
        },
        "world_store_ready_json": {
            "logical_path": "world_store/firms/READY.json",
            "bytes": int(rows_step["ready_json_bytes"]),
            "sha256": str(rows_step["ready_json_sha256"]),
        },
        "tracked_config_files": tracked_cfg,
        "challenger_source_files": challenger_src,
        "cached_dem_tiles_count": len(dem_tiles),
        "cached_dem_tiles_tree_sha256": _tree_sha256(dem_tiles),
        "cached_dem_tiles": dem_tiles,
        "cmr_pass_files_count": len(cmr_compact),
        "cmr_pass_files_tree_sha256": _tree_sha256(cmr_compact),
        "cmr_pass_files": cmr_compact,
        "world_store_files_count": len(world_compact),
        "world_store_files_tree_sha256": _tree_sha256(world_compact),
        "world_store_files": world_compact,
    }


def run_pipeline(
    split_md: Path,
    world_dir: Path,
    cmr_seed_dir: Path | None,
    work_dir: Path,
    out_dir: Path,
    workers: int = 4,
    inner_folds: int = 5,
) -> dict[str, Any]:
    t_pipeline = time.time()
    split_doc = parse_split_markdown(split_md)
    forbidden = frozenset(split_doc["forbidden_places"])
    print(
        f"parsed SPLIT.md: protocol={split_doc['protocol_id']}, "
        f"fitting={len(split_doc['fitting'])}, validation={len(split_doc['validation'])}, "
        f"forbidden_test_places={len(forbidden)}"
    )

    rows_step = prepare_world_cache(
        split_doc=split_doc,
        store_dir=world_dir,
        work_dir=work_dir,
        cmr_seed_dir=cmr_seed_dir,
        workers=workers,
    )

    occ_params = load_params()
    fit_data = extract_or_load_fitting_dataset(
        fitting_eps=split_doc["fitting"],
        work_dir=work_dir,
        forbidden=forbidden,
        occ_params=occ_params,
        plan_sha256=split_doc["plan_sha256"],
        split_md_sha256=split_doc["split_md_sha256"],
        workers=workers,
    )

    cell_x = fit_data["cell_x"]
    cell_y = fit_data["cell_y"]
    active_idx = fit_data["active_idx"]
    truth_idx = fit_data["truth_idx"]
    look_act_counts = fit_data["look_act_counts"]
    look_truth_counts = fit_data["look_truth_counts"]
    look_ny = fit_data["look_grid_ny"]
    look_nx = fit_data["look_grid_nx"]
    look_x = fit_data["look_x"]
    truth_pix = fit_data["truth_pix"]
    truth_frp = fit_data["truth_frp"]
    look_place_ids = fit_data["look_place_ids"]
    vis_contexts = fit_data["vis_contexts"]
    slot_infos = fit_data["slot_infos"]

    n_looks = len(look_act_counts)
    n_cells = len(cell_y)
    cell_look_idx = np.repeat(np.arange(n_looks, dtype=np.int32), look_act_counts)

    folds = _grouped_kfold_masks(look_place_ids, max_folds=inner_folds)
    if not folds:
        raise RuntimeError("Insufficient distinct fitting places for inner cross-validation")

    oof_cache_path = work_dir / f"challenger_inner_oof_{inner_folds}f.npz"
    if oof_cache_path.is_file():
        cached_oof = np.load(oof_cache_path)
        if (
            cached_oof["oof_log"].shape[0] == n_cells
            and str(cached_oof["plan_sha256"]) == split_doc["plan_sha256"]
        ):
            print("loading cached inner-fold OOF predictions...")
            oof_log = cached_oof["oof_log"]
            oof_mlp = cached_oof["oof_mlp"]
            oof_gbdt = cached_oof["oof_gbdt"]
        else:
            oof_log = np.empty(0, dtype=np.float64)
            oof_mlp = np.empty(0, dtype=np.float64)
            oof_gbdt = np.empty(0, dtype=np.float64)
    else:
        oof_log = np.empty(0, dtype=np.float64)
        oof_mlp = np.empty(0, dtype=np.float64)
        oof_gbdt = np.empty(0, dtype=np.float64)

    if oof_log.shape[0] != n_cells:
        oof_log = np.zeros(n_cells, dtype=np.float64)
        oof_mlp = np.zeros(n_cells, dtype=np.float64)
        oof_gbdt = np.zeros(n_cells, dtype=np.float64)
        for f_i, (tr_lk, va_lk) in enumerate(folds):
            t_f = time.time()
            tr_c = tr_lk[cell_look_idx]
            va_c = va_lk[cell_look_idx]
            X_tr, y_tr = cell_x[tr_c], cell_y[tr_c]
            X_va = cell_x[va_c]

            m_log = InteractionLogistic(max_train_rows=2_000_000, seed=20261114 + f_i).fit(X_tr, y_tr)
            oof_log[va_c] = m_log.predict_proba(X_va)

            m_mlp = ResidualMLP(max_train_rows=2_200_000, seed=20261114 + f_i).fit(X_tr, y_tr)
            oof_mlp[va_c] = m_mlp.predict_proba(X_va)

            m_gbdt = make_default_single_gbdt(random_state=42 + f_i, max_train_rows=2_200_000).fit(X_tr, y_tr)
            oof_gbdt[va_c] = m_gbdt.predict_proba(X_va)
            print(
                f"  inner fold {f_i + 1}/{len(folds)} complete in {time.time() - t_f:.1f} s "
                f"(val_cells={int(va_c.sum())})"
            )

        np.savez(
            oof_cache_path,
            plan_sha256=np.array(split_doc["plan_sha256"]),
            oof_log=oof_log,
            oof_mlp=oof_mlp,
            oof_gbdt=oof_gbdt,
        )

    # Strictly out-of-fold LogitStacker probabilities for blend calibration
    oof_blend = np.zeros(n_cells, dtype=np.float64)
    for tr_lk, va_lk in folds:
        tr_c = tr_lk[cell_look_idx]
        va_c = va_lk[cell_look_idx]
        st_f = LogitStacker().fit_from_probs(
            [oof_log[tr_c], oof_mlp[tr_c], oof_gbdt[tr_c]], cell_y[tr_c]
        )
        oof_blend[va_c] = st_f.predict_proba_from_probs(
            [oof_log[va_c], oof_mlp[va_c], oof_gbdt[va_c]]
        )

    stacker_full = LogitStacker().fit_from_probs([oof_log, oof_mlp, oof_gbdt], cell_y)
    print(
        "fitted LogitStacker on fitting OOF: "
        f"weights={[round(float(w), 4) for w in stacker_full.weights_]}, "
        f"bias={stacker_full.bias_:.4f}"
    )

    oof_by_variant: dict[str, NDArray[np.float64]] = {
        "logistic": oof_log,
        "mlp": oof_mlp,
        "gbdt": oof_gbdt,
        "blend": oof_blend,
    }

    print("selecting declaration thresholds on fitting OOF...")
    decl_rules: dict[str, dict[str, Any]] = {}
    tau_sweeps: dict[str, list[dict[str, Any]]] = {}
    for var in VALID_VARIANTS:
        rule, sweep = select_declaration_rule_oof(
            oof_by_variant[var],
            active_idx,
            truth_idx,
            look_act_counts,
            look_truth_counts,
            look_ny,
            look_nx,
        )
        decl_rules[var] = rule
        tau_sweeps[var] = sweep
        print(f"  {var}: chosen tau_hi={rule['tau_hi']}")

    print("fitting shared FRPHead and variant-specific PixelCountHeads on fitting OOF...")
    frp_head = FRPHead().fit(
        look_x,
        truth_frp,
        look_place_ids,
        vis_contexts=vis_contexts,
        slot_infos=slot_infos,
    )
    pixel_heads: dict[str, PixelCountHead] = {}
    for var in VALID_VARIANTS:
        p_sum_mat = summarize_prob_maps_by_counts(oof_by_variant[var], look_act_counts)
        pixel_heads[var] = PixelCountHead().fit(
            p_sum_mat,
            look_x,
            truth_pix,
            look_place_ids,
            vis_contexts=vis_contexts,
            slot_infos=slot_infos,
        )

    existing_ok = all((out_dir / VARIANT_FILES[v]).is_file() for v in ("logistic", "mlp", "gbdt"))
    reused_full = False
    if existing_ok:
        b_log = ChallengerBundle.load_json(out_dir / VARIANT_FILES["logistic"])
        b_mlp = ChallengerBundle.load_json(out_dir / VARIANT_FILES["mlp"])
        b_gbdt = ChallengerBundle.load_json(out_dir / VARIANT_FILES["gbdt"])
        if (
            b_log.fitted_on.get("plan_sha256") == split_doc["plan_sha256"]
            and b_log.fitted_on.get("split_md_sha256") == split_doc["split_md_sha256"]
            and b_log.logistic_model is not None
            and b_mlp.mlp_model is not None
            and b_gbdt.gbdt_model is not None
        ):
            print("reusing full-fitting-set cell models matching SPLIT.md plan_sha256...")
            full_log = b_log.logistic_model
            full_mlp = b_mlp.mlp_model
            full_gbdt = b_gbdt.gbdt_model
            reused_full = True

    if not reused_full:
        print("fitting final full-fitting-set cell models...")
        t_fit_full = time.time()
        full_log = InteractionLogistic(max_train_rows=2_500_000, seed=20261114).fit(cell_x, cell_y)
        full_mlp = ResidualMLP(max_train_rows=3_000_000, seed=20261114).fit(cell_x, cell_y)
        full_gbdt = make_default_single_gbdt(random_state=42, max_train_rows=3_000_000).fit(cell_x, cell_y)
        print(f"full cell models fitted in {time.time() - t_fit_full:.1f} s")

    fitted_on_meta = {
        "protocol_id": split_doc["protocol_id"],
        "protocol_sha256": split_doc["protocol_sha256"],
        "plan_sha256": split_doc["plan_sha256"],
        "split_md_sha256": split_doc["split_md_sha256"],
        "role": "fitting",
        "fitting_episodes_in_plan": len(split_doc["fitting"]),
        "fitting_episodes_used": int(fit_data["meta"]["n_episodes_kept"]),
        "fitting_looks": int(n_looks),
        "fitting_active_cells": int(n_cells),
        "inner_place_grouped_folds": int(len(folds)),
        "test_places_read": 0,
        "validation_rows_used_in_fit": 0,
        "description": (
            f"SPLIT.md {split_doc['protocol_id']} fitting set only "
            f"({fit_data['meta']['n_episodes_kept']} fires, {n_looks} VIIRS CMR looks)"
        ),
    }

    labels_by_variant = {
        "logistic": (
            "regularized logistic regression with monotone transforms and physics interactions "
            "from visible MODIS only; fitted on SPLIT.md fitting fires"
        ),
        "mlp": (
            "two-layer SiLU residual neural network with linear skip from visible MODIS only; "
            "fitted on SPLIT.md fitting fires"
        ),
        "gbdt": (
            "histogram gradient boosted decision trees with GOSS sampling from visible MODIS only; "
            "fitted on SPLIT.md fitting fires"
        ),
        "blend": (
            "out-of-fold log-odds stack of logistic regression, residual MLP, and histogram GBDT "
            "from visible MODIS only; fitted on SPLIT.md fitting fires"
        ),
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    bundles: dict[str, ChallengerBundle] = {
        "logistic": ChallengerBundle(
            variant="logistic",
            name="challenger_logistic",
            label=labels_by_variant["logistic"],
            fitted_on=fitted_on_meta,
            declaration_rule=decl_rules["logistic"],
            frp_head=frp_head,
            pixel_head=pixel_heads["logistic"],
            occ_params=occ_params,
            logistic_model=full_log,
        ),
        "mlp": ChallengerBundle(
            variant="mlp",
            name="challenger_mlp",
            label=labels_by_variant["mlp"],
            fitted_on=fitted_on_meta,
            declaration_rule=decl_rules["mlp"],
            frp_head=frp_head,
            pixel_head=pixel_heads["mlp"],
            occ_params=occ_params,
            mlp_model=full_mlp,
        ),
        "gbdt": ChallengerBundle(
            variant="gbdt",
            name="challenger_gbdt",
            label=labels_by_variant["gbdt"],
            fitted_on=fitted_on_meta,
            declaration_rule=decl_rules["gbdt"],
            frp_head=frp_head,
            pixel_head=pixel_heads["gbdt"],
            occ_params=occ_params,
            gbdt_model=full_gbdt,
        ),
        "blend": ChallengerBundle(
            variant="blend",
            name="challenger_blend",
            label=labels_by_variant["blend"],
            fitted_on=fitted_on_meta,
            declaration_rule=decl_rules["blend"],
            frp_head=frp_head,
            pixel_head=pixel_heads["blend"],
            occ_params=occ_params,
            logistic_model=full_log,
            mlp_model=full_mlp,
            gbdt_model=full_gbdt,
            stacker=stacker_full,
        ),
    }

    for var in ("logistic", "mlp", "gbdt"):
        bundles[var].save_json(out_dir / VARIANT_FILES[var])
    bundles["blend"].save_json(
        out_dir / VARIANT_FILES["blend"],
        component_files={
            "logistic": VARIANT_FILES["logistic"],
            "mlp": VARIANT_FILES["mlp"],
            "gbdt": VARIANT_FILES["gbdt"],
        },
    )

    # Evaluate on the 83 validation episodes
    val_eps = split_doc["validation"]
    print(f"scoring all models on {len(val_eps)} validation episodes ({workers} workers)...")
    t_val = time.time()
    rows_step_slim = {
        "counts": rows_step["counts"],
        "deliver_months": rows_step["deliver_months"],
        "outage_days": rows_step["outage_days"],
    }
    occ_dict = occ_params.as_dict()
    forbidden_set = set(forbidden)
    val_jobs = [
        (ep, str(work_dir), str(out_dir), forbidden_set, occ_dict, rows_step_slim)
        for ep in val_eps
    ]
    if workers <= 1:
        val_raw = [_score_validation_episode_job(j) for j in val_jobs]
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            val_raw = list(pool.map(_score_validation_episode_job, val_jobs, chunksize=2))

    val_by_key = {ep["key"]: ep for ep in val_eps}
    val_reports: dict[str, dict[str, Any]] = {}
    val_unscored: dict[str, str] = {}
    val_per_ep: list[dict[str, Any]] = []

    for key, rep, err in val_raw:
        ep = val_by_key[key]
        if rep is None:
            val_unscored[key] = str(err)
            continue
        rep_sha = hashlib.sha256(
            json.dumps(rep, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()
        val_reports[key] = rep
        v_rec = verdict(rep, method="reconstruction")
        v_bld = verdict(rep, method="challenger_blend")
        val_per_ep.append(
            {
                "key": key,
                "place_id": ep["place_id"],
                "continent": ep["continent"],
                "zone": ep["zone"],
                "box": ep["box"],
                "first_overpass_utc": ep["first_overpass_utc"],
                "last_overpass_utc": ep["last_overpass_utc"],
                "scored_looks": int(rep["scored_overpasses"]),
                "hidden_pixels_in_tile": int(rep["hidden_rows_in_test_box"]),
                "reconstruction_ahead_of_both_on": v_rec.get("beats_every_baseline_on"),
                "challenger_blend_ahead_of_both_on": v_bld.get("beats_every_baseline_on"),
                "report_sha256": rep_sha,
            }
        )

    rep_list = list(val_reports.values())
    pooled_val = pool_reports(rep_list)
    print(f"validation scoring complete in {time.time() - t_val:.1f} s ({len(rep_list)}/{len(val_eps)} scored)")
    print(_format_pooled_table(pooled_val))

    evaluated_methods = (
        "reconstruction",
        "challenger_logistic",
        "challenger_mlp",
        "challenger_gbdt",
        "challenger_blend",
    )
    against_baselines: dict[str, Any] = {}
    for m_name in evaluated_methods:
        against_baselines[m_name] = _judge_method(
            rep_list, method=m_name, baselines=("painted_modis", "overlap_ratio")
        )

    against_reconstruction: dict[str, Any] = {}
    headline_against_challenger: dict[str, Any] = {}
    for var in VALID_VARIANTS:
        m_name = f"challenger_{var}"
        against_reconstruction[m_name] = _judge_method(
            rep_list, method=m_name, baselines=("reconstruction",)
        )
        headline_against_challenger[m_name] = _judge_method(
            rep_list, method="reconstruction", baselines=(m_name,)
        )

    # Choose default challenger variant strictly from validation scores
    def _rank_key(var: str) -> tuple[int, int, int, float]:
        m_name = f"challenger_{var}"
        ab = against_baselines[m_name]
        ar = against_reconstruction[m_name]
        pm = pooled_val["methods"][m_name]
        mean_csi = 0.5 * float(pm["strict_375m"]["csi"] or 0.0) + 0.5 * float(
            pm["tolerant_1_cell"]["csi"] or 0.0
        )
        return (
            int(ab.get("ahead", 0)),
            -int(ab.get("behind", 0)),
            int(ar.get("ahead", 0)),
            mean_csi,
        )

    chosen_variant = max(VALID_VARIANTS, key=_rank_key)
    chosen_method = f"challenger_{chosen_variant}"
    print(f"validation-chosen headline challenger: {chosen_method}")

    default_ptr = {
        "default_variant": chosen_variant,
        "default_method": chosen_method,
        "bundle_file": VARIANT_FILES[chosen_variant],
        "selection_rule": (
            "chosen on SPLIT.md validation fires by lexicographic order: "
            "(1) most scores ahead of both baselines under 2000-fire bootstrap at 0.90, "
            "(2) fewest scores behind either baseline, "
            "(3) most scores ahead of reconstruction directly, "
            "(4) highest mean of strict 375 m CSI and 1-cell tolerant CSI"
        ),
        "validation_summary": {
            "ahead_of_both_baselines": against_baselines[chosen_method].get("ahead"),
            "tied_with_baselines": against_baselines[chosen_method].get("tie"),
            "behind_baselines": against_baselines[chosen_method].get("behind"),
            "ahead_of_reconstruction": against_reconstruction[chosen_method].get("ahead"),
            "tied_with_reconstruction": against_reconstruction[chosen_method].get("tie"),
            "behind_reconstruction": against_reconstruction[chosen_method].get("behind"),
        },
    }
    (out_dir / DEFAULT_POINTER_FILE).write_text(
        json.dumps(default_ptr, indent=2) + "\n", encoding="utf-8"
    )

    # Subgroup breakdowns by continent and zone for reconstruction and chosen challenger
    by_continent: dict[str, Any] = {}
    for cont in CONTINENTS_ORDER:
        sub = [val_reports[k] for k in val_reports if val_by_key[k]["continent"] == cont]
        by_continent[cont] = {
            "reconstruction": _judge_method(sub, "reconstruction"),
            chosen_method: _judge_method(sub, chosen_method),
        }

    by_zone: dict[str, Any] = {}
    for zn in ZONES_ORDER:
        sub = [val_reports[k] for k in val_reports if val_by_key[k]["zone"] == zn]
        by_zone[zn] = {
            "reconstruction": _judge_method(sub, "reconstruction"),
            chosen_method: _judge_method(sub, chosen_method),
        }

    # Strip per_overpass arrays from pooled_val methods before saving summary JSON
    pooled_methods_clean = {}
    for m_name, m_doc in pooled_val["methods"].items():
        d_clean = {k: v for k, v in m_doc.items() if k != "per_overpass"}
        pooled_methods_clean[m_name] = compact_json_numbers(d_clean, sig=6)

    fitting_manifest = [
        {
            "key": ep["key"],
            "place_id": ep["place_id"],
            "continent": ep["continent"],
            "zone": ep["zone"],
            "box": ep["box"],
            "first_overpass_utc": ep["first_overpass_utc"],
            "last_overpass_utc": ep["last_overpass_utc"],
        }
        for ep in split_doc["fitting"]
    ]

    fitted_bundle_digests = [
        relative_digest_entry(out_dir / VARIANT_FILES[v], REPO_ROOT) for v in VALID_VARIANTS
    ] + [relative_digest_entry(out_dir / DEFAULT_POINTER_FILE, REPO_ROOT)]

    results_doc = {
        "what": (
            "validation evaluation of Isogon challenger models fitted on SPLIT.md fitting fires "
            "and scored once on SPLIT.md validation fires under protocol version 3"
        ),
        "protocol_id": split_doc["protocol_id"],
        "protocol_sha256": split_doc["protocol_sha256"],
        "plan_sha256": split_doc["plan_sha256"],
        "blind_test_protocol": rep_list[0]["protocol"] if rep_list else None,
        "chosen_default_challenger": default_ptr,
        "fitting_summary": {
            **fitted_on_meta,
            "skipped_episodes": fit_data["meta"]["skipped_episodes"],
            "cached_terrain_episodes": fit_data["meta"]["n_episodes_with_cached_terrain"],
            "stacker_weights": [round(float(w), 6) for w in stacker_full.weights_],
            "stacker_bias": round(float(stacker_full.bias_), 6),
            "declaration_rules": decl_rules,
            "declaration_tau_sweeps": tau_sweeps,
            "frp_head_scale": round(float(frp_head.scale_), 6),
            "frp_head_interval": compact_json_numbers(frp_head.interval_stats_, sig=6),
            "pixel_head_scales": {
                v: {
                    "scale_day": round(float(pixel_heads[v].scale_day_), 6),
                    "scale_night": round(float(pixel_heads[v].scale_night_), 6),
                    "interval": compact_json_numbers(pixel_heads[v].interval_stats_, sig=6),
                }
                for v in VALID_VARIANTS
            },
        },
        "validation_summary": {
            "episodes_in_plan": len(val_eps),
            "episodes_scored": len(rep_list),
            "unscored": val_unscored,
            "scored_overpasses": int(pooled_val["scored_overpasses"]),
            "scored_overpasses_with_hidden_detections_in_test_box": int(
                sum(int(r["scored_overpasses_with_hidden_detections_in_test_box"]) for r in rep_list)
            ),
            "visible_rows_in_test_box": int(
                sum(int(r["visible_rows_in_test_box"]) for r in rep_list)
            ),
            "hidden_rows_in_test_box": int(pooled_val["hidden_rows_in_test_box"]),
            "pooled_methods": pooled_methods_clean,
            "judged_against_both_baselines": compact_json_numbers(against_baselines, sig=6),
            "challengers_judged_against_reconstruction": compact_json_numbers(
                against_reconstruction, sig=6
            ),
            "reconstruction_judged_against_challengers": compact_json_numbers(
                headline_against_challenger, sig=6
            ),
            "by_continent": compact_json_numbers(by_continent, sig=6),
            "by_zone": compact_json_numbers(by_zone, sig=6),
        },
        "fitting_fires": fitting_manifest,
        "validation_fires": val_per_ep,
        "fitted_bundles": fitted_bundle_digests,
        "digests_read": _collect_digests(split_doc, rows_step),
        "pipeline_seconds": round(time.time() - t_pipeline, 1),
    }

    val_out_path = out_dir / "validation_results.json"
    val_out_path.write_text(
        json.dumps(results_doc, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    print(f"wrote {val_out_path.relative_to(REPO_ROOT)} in {results_doc['pipeline_seconds']} s")
    return results_doc


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Fit challenger models on SPLIT.md fitting fires and score on validation fires."
    )
    ap.add_argument("--split-md", default=None, help="Path to SPLIT.md (or set ISOGON_SPLIT_MD)")
    ap.add_argument("--world-dir", default=None, help="Path to isogon-world (or set ISOGON_WORLD_DIR)")
    ap.add_argument(
        "--cmr-seed-dir",
        default=None,
        help="Optional directory of cached CMR pass folders (or set ISOGON_CMR_SEED_DIR)",
    )
    ap.add_argument("--work-dir", default=str(DEFAULT_WORK_DIR), help="Cache working directory")
    ap.add_argument("--out-dir", default=str(FITTED_DIR), help="Directory for fitted bundles")
    ap.add_argument("--workers", type=int, default=4, help="Worker process count")
    ap.add_argument("--inner-folds", type=int, default=5, help="Place-grouped inner CV folds")
    args = ap.parse_args(argv)

    split_md, world_dir, cmr_seed = resolve_paths_from_env(
        args.split_md, args.world_dir, args.cmr_seed_dir
    )
    if split_md is None or world_dir is None:
        raise SystemExit(
            "Provide --split-md and --world-dir (or set ISOGON_SPLIT_MD and ISOGON_WORLD_DIR)"
        )
    run_pipeline(
        split_md=split_md,
        world_dir=world_dir,
        cmr_seed_dir=cmr_seed,
        work_dir=Path(args.work_dir),
        out_dir=Path(args.out_dir),
        workers=max(1, int(args.workers)),
        inner_folds=max(2, int(args.inner_folds)),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
