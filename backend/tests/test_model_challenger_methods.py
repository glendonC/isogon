"""Unit tests for challenger methods, blind-test invariance, pickling, and fitted bundles."""

from __future__ import annotations

import json
from pathlib import Path
import pickle
import sys
import tempfile
import unittest

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.eval import schedule as S  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.baselines import painted_modis_factory  # noqa: E402
from backend.eval.blind_test import run_blind_test, split_hidden  # noqa: E402
from backend.eval.grid import EvalGrid, paint  # noqa: E402
from backend.eval.holdout import visible_rows  # noqa: E402
from backend.eval.rows import detections_from_rows, read_csv_rows  # noqa: E402
from backend.eval.schedule import Slot  # noqa: E402
from backend.model.challenger import (  # noqa: E402
    FITTED_DIR,
    VALID_VARIANTS,
    VARIANT_FILES,
    ChallengerBundle,
    ChallengerFactory,
    ChallengerMethod,
    all_challenger_factories,
    challenger_blend_factory,
    challenger_gbdt_factory,
    challenger_logistic_factory,
    challenger_mlp_factory,
    default_challenger_factory,
    load_challenger_bundle,
    make_challenger_method,
)
from backend.model.challenger.features import EpisodeFeatureExtractor  # noqa: E402
from backend.model.challenger.gbdt import HistGBDT  # noqa: E402
from backend.model.challenger.guard import refuse_forbidden_place  # noqa: E402
from backend.model.challenger.heads import (  # noqa: E402
    FRPHead,
    PixelCountHead,
    VisiblePassContext,
    slot_to_dict,
    summarize_prob_maps_by_counts,
)
from backend.model.challenger.linear_mlp import (  # noqa: E402
    InteractionLogistic,
    LogitStacker,
    ResidualMLP,
)
from backend.model.challenger.world_split import WorldEpisodePasses  # noqa: E402
from backend.model.occupancy import OccupancyParams  # noqa: E402
from backend.model.real_run import parse_start_s  # noqa: E402
from backend.model.training import ClosedWindow  # noqa: E402


def _synthetic_rows() -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    modis = read_csv_rows(fx.FIXTURE_DIR / fx.MODIS_FILE)
    viirs = read_csv_rows(fx.FIXTURE_DIR / fx.VIIRS_FILE)
    return modis, viirs


def _build_tiny_bundles(tmp_dir: Path) -> dict[str, Path]:
    """Fit tiny fast challenger models on the synthetic 2099 fixture for standalone tests."""
    modis_rows, viirs_rows = _synthetic_rows()
    det = detections_from_rows(modis_rows + viirs_rows, fx.SOURCE_LABEL)
    vis, hid = split_hidden(det, "VIIRS")
    grid = EvalGrid.from_bbox(fx.TEST_BOX)
    occ = OccupancyParams()

    ext = EpisodeFeatureExtractor(vis, grid, occ_params=occ, use_terrain=False)
    vis_ctx = VisiblePassContext.from_episode(vis, grid)
    t0 = float(vis.time_s.min())
    t1 = float(vis.time_s.max()) + 1.0
    slots, _, _ = S.schedule_for(
        "VIIRS", None, t0, t1, fx.TEST_BOX, source=S.SOURCE_CMR, read_passes=fx.fixture_pass_reader()
    )
    in_box_hid = hid.in_box(fx.TEST_BOX)

    cell_xs = []
    cell_ys = []
    act_counts = []
    look_xs = []
    truth_pix = []
    truth_frp = []
    slot_dicts = []
    groups = []

    for idx_s, slot in enumerate(slots):
        tf = ext.extract(slot)
        rows = S.rows_of_slot(hid.time_s, hid.platform_code, slot)
        inside = rows[in_box_hid[rows]]
        tr = paint(grid, hid.select(inside))
        cy = tr.mask.ravel()[tf.active_idx].astype(np.uint8)
        cell_xs.append(tf.cell_x)
        cell_ys.append(cy)
        act_counts.append(int(tf.active_idx.size))
        look_xs.append(tf.look_x)
        truth_pix.append(float(inside.size))
        truth_frp.append(float(tr.frp_total_mw))
        slot_dicts.append(slot_to_dict(slot, ep_idx=0))
        groups.append(f"g{idx_s % 3}")

    X = np.concatenate(cell_xs, axis=0)
    y = np.concatenate(cell_ys, axis=0)
    lx = np.vstack(look_xs)

    m_log = InteractionLogistic(max_iter=8, seed=7).fit(X, y)
    m_mlp = ResidualMLP(hidden_dims=(12, 8), epochs=4, batch_size=256, seed=7).fit(X, y)
    m_gbdt = HistGBDT(n_estimators=12, learning_rate=0.1, max_depth=3, n_bins=32, random_state=7).fit(X, y)

    p_log = m_log.predict_proba(X)
    p_mlp = m_mlp.predict_proba(X)
    p_gbdt = m_gbdt.predict_proba(X)
    stacker = LogitStacker().fit_from_probs([p_log, p_mlp, p_gbdt], y)
    p_blend = stacker.predict_proba_from_probs([p_log, p_mlp, p_gbdt])

    frp_head = FRPHead().fit(lx, truth_frp, groups, vis_contexts=[vis_ctx], slot_infos=slot_dicts)
    rule = {"kind": "core_plus_spine", "w_blur": 0.20, "tau_hi": 0.27, "s_min": 0.78, "p_peak_min": 0.135}
    meta = {"trained_on": "synthetic fixture (unit test only)"}

    probs_map = {"logistic": p_log, "mlp": p_mlp, "gbdt": p_gbdt, "blend": p_blend}
    paths: dict[str, Path] = {}
    for var in VALID_VARIANTS:
        p_sum = summarize_prob_maps_by_counts(probs_map[var], act_counts)
        pix_h = PixelCountHead().fit(p_sum, lx, truth_pix, groups, vis_contexts=[vis_ctx], slot_infos=slot_dicts)
        bundle = ChallengerBundle(
            variant=var,
            name=f"challenger_{var}",
            label=f"synthetic {var} challenger",
            fitted_on=meta,
            declaration_rule=rule,
            frp_head=frp_head,
            pixel_head=pix_h,
            occ_params=occ,
            logistic_model=m_log if var in ("logistic", "blend") else None,
            mlp_model=m_mlp if var in ("mlp", "blend") else None,
            gbdt_model=m_gbdt if var in ("gbdt", "blend") else None,
            stacker=stacker if var == "blend" else None,
        )
        out_p = tmp_dir / VARIANT_FILES[var]
        if var == "blend":
            bundle.save_json(
                out_p,
                component_files={
                    "logistic": VARIANT_FILES["logistic"],
                    "mlp": VARIANT_FILES["mlp"],
                    "gbdt": VARIANT_FILES["gbdt"],
                },
            )
        else:
            bundle.save_json(out_p)
        paths[var] = out_p
    return paths


class ChallengerMethodsTests(unittest.TestCase):
    def test_every_challenger_fails_when_handed_any_sharp_satellite_row(self) -> None:
        modis_rows, viirs_rows = _synthetic_rows()
        both = detections_from_rows(modis_rows + viirs_rows, fx.SOURCE_LABEL)
        one_viirs = detections_from_rows(modis_rows + viirs_rows[:1], fx.SOURCE_LABEL)
        grid = EvalGrid.from_bbox(fx.TEST_BOX)

        with tempfile.TemporaryDirectory() as tmp:
            paths = _build_tiny_bundles(Path(tmp))
            for var, bp in paths.items():
                fac = ChallengerFactory(variant=var, bundle_path=str(bp))
                bundle = ChallengerBundle.load_json(bp)
                for bad_det in (both, one_viirs):
                    with self.assertRaises(ValueError):
                        fac(bad_det, grid)
                    with self.assertRaises(ValueError):
                        ChallengerMethod(bad_det, grid, bundle)
                    with self.assertRaises(ValueError):
                        make_challenger_method(bad_det, grid, variant=var, bundle_path=bp)
                    with self.assertRaises(ValueError):
                        VisiblePassContext.from_episode(bad_det, grid)

    def test_closed_windows_and_forbidden_places_are_refused(self) -> None:
        modis_rows, _ = _synthetic_rows()
        vis = visible_rows(detections_from_rows(modis_rows, fx.SOURCE_LABEL), "VIIRS")
        grid = EvalGrid.from_bbox(fx.TEST_BOX)

        with tempfile.TemporaryDirectory() as tmp:
            paths = _build_tiny_bundles(Path(tmp))
            method = make_challenger_method(vis, grid, variant="blend", bundle_path=paths["blend"])
            closed_slot = Slot(0, "VIIRS_SNPP", parse_start_s("2021-08-05"), True, 0.43, 0.40)
            with self.assertRaises(ClosedWindow):
                method.predict(closed_slot)

        forbidden = frozenset({"p-120.0+37.5", "p+22.5+37.5"})
        with self.assertRaises(ValueError):
            refuse_forbidden_place("p-120.0+37.5", forbidden)
        refuse_forbidden_place("p-122.5+40.0", forbidden)

    def test_published_predictions_are_byte_identical_when_hidden_rows_change(self) -> None:
        modis_rows, viirs_rows = _synthetic_rows()
        det_orig = detections_from_rows(modis_rows + viirs_rows, fx.SOURCE_LABEL)

        altered_viirs = []
        for r in viirs_rows[::2]:
            r2 = dict(r)
            r2["frp"] = str(round(float(r["frp"]) * 50.0 + 123.0, 2))
            altered_viirs.append(r2)
        det_mutated = detections_from_rows(modis_rows + altered_viirs, fx.SOURCE_LABEL)
        det_empty_hid = detections_from_rows(modis_rows, fx.SOURCE_LABEL)

        win = (parse_start_s("2099-07-01"), parse_start_s("2099-07-04"))
        with tempfile.TemporaryDirectory() as tmp:
            paths = _build_tiny_bundles(Path(tmp))
            factories = [
                painted_modis_factory,
                challenger_logistic_factory(bundle_path=paths["logistic"]),
                challenger_mlp_factory(bundle_path=paths["mlp"]),
                challenger_gbdt_factory(bundle_path=paths["gbdt"]),
                challenger_blend_factory(bundle_path=paths["blend"]),
            ]
            rep_a = run_blind_test(
                det_orig, fx.TEST_BOX, factories, window=win,
                schedule=S.SOURCE_CMR, read_passes=fx.fixture_pass_reader(),
            )
            rep_b = run_blind_test(
                det_mutated, fx.TEST_BOX, factories, window=win,
                schedule=S.SOURCE_CMR, read_passes=fx.fixture_pass_reader(),
            )
            rep_c = run_blind_test(
                det_empty_hid, fx.TEST_BOX, factories, window=win,
                schedule=S.SOURCE_CMR, read_passes=fx.fixture_pass_reader(),
            )

        self.assertEqual(rep_a["published"], rep_b["published"])
        self.assertEqual(rep_a["published"], rep_c["published"])
        self.assertNotEqual(rep_a["hidden_rows_in_test_box"], rep_b["hidden_rows_in_test_box"])
        self.assertEqual(rep_c["hidden_rows_in_test_box"], 0)

    def test_factories_and_pass_reader_pickle_cleanly(self) -> None:
        from backend.model.challenger import methods as CM

        for var in VALID_VARIANTS:
            fn = getattr(CM, f"challenger_{var}_factory")
            fac = fn()
            restored = pickle.loads(pickle.dumps(fac))
            self.assertEqual(restored, fac)

        for fac in [
            *all_challenger_factories(),
            default_challenger_factory(),
        ]:
            restored = pickle.loads(pickle.dumps(fac))
            self.assertEqual(restored, fac)

        reader = WorldEpisodePasses(Path("data/cache/challenger_world"), "p+10.0+10.0:2020:11")
        restored_r = pickle.loads(pickle.dumps(reader))
        self.assertEqual((str(restored_r.work), restored_r.key), (str(reader.work), reader.key))

    def test_tracked_fitted_bundles_and_validation_results_when_present(self) -> None:
        if not (FITTED_DIR / VARIANT_FILES["blend"]).is_file():
            self.skipTest("fitted challenger bundles not yet generated")

        modis_rows, _ = _synthetic_rows()
        vis = visible_rows(detections_from_rows(modis_rows, fx.SOURCE_LABEL), "VIIRS")
        grid = EvalGrid.from_bbox(fx.TEST_BOX)
        slot = Slot(0, "VIIRS_SNPP", float(vis.time_s.min()) + 1800.0, True, 0.44, 0.41)

        for var in VALID_VARIANTS:
            bundle = load_challenger_bundle(variant=var)
            self.assertEqual(bundle.variant, var)
            method = ChallengerMethod(vis, grid, bundle)
            pred = method.predict(slot)
            self.assertEqual(pred.p_detect.shape, grid.shape)
            self.assertEqual(pred.frp_mw.shape, grid.shape)
            self.assertIsNotNone(pred.cells)
            assert pred.cells is not None
            self.assertEqual(pred.cells.shape, grid.shape)
            self.assertTrue(np.all((pred.p_detect >= 0.0) & (pred.p_detect <= 1.0)))
            self.assertTrue(np.all(pred.frp_mw >= 0.0))
            assert pred.frp_total_lo is not None and pred.frp_total_hi is not None
            self.assertLessEqual(pred.frp_total_lo, pred.frp_total_mw + 1e-9)
            self.assertLessEqual(pred.frp_total_mw, pred.frp_total_hi + 1e-9)
            assert pred.pixels is not None and pred.pixels_lo is not None and pred.pixels_hi is not None
            self.assertLessEqual(pred.pixels_lo, pred.pixels + 1e-9)
            self.assertLessEqual(pred.pixels, pred.pixels_hi + 1e-9)

        def_method = default_challenger_factory()(vis, grid)
        def_pred = def_method.predict(slot)
        self.assertEqual(def_pred.p_detect.shape, grid.shape)

        val_file = FITTED_DIR / "validation_results.json"
        self.assertTrue(val_file.is_file())
        val_doc = json.loads(val_file.read_text(encoding="utf-8"))
        self.assertEqual(val_doc["fitting_summary"]["test_places_read"], 0)
        self.assertEqual(val_doc["fitting_summary"]["validation_rows_used_in_fit"], 0)
        self.assertGreater(val_doc["validation_summary"]["episodes_scored"], 0)


if __name__ == "__main__":
    unittest.main()
