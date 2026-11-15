"""The players of the round on the fresh test's episodes: a place's round, and the order of the steps.

On the synthetic fixture. A place of the fresh test is played with its own pass list and no terrain; the players'
measurement refuses to run before test B's look and the players' fit are on record.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.env import fresh_world_players as P  # noqa: E402
from backend.env import learn as L  # noqa: E402
from backend.eval import synthetic_fixture as fx  # noqa: E402
from backend.eval.rows import detections_from_rows, parse_acq_time_s  # noqa: E402
from backend.model import fresh_test as F  # noqa: E402
from backend.model import fresh_world_run as R  # noqa: E402
from backend.model.fitted import load_params  # noqa: E402

ROWS = fx.extended_rows()
T0 = min(parse_acq_time_s(r["acq_date"], r["acq_time"]) for r in ROWS)
T1 = max(parse_acq_time_s(r["acq_date"], r["acq_time"]) for r in ROWS) + 1.0
PID = F.place_id(F.place_of(-121.2, 40.0))


def _episode() -> P.WorldEpisode:
    det = detections_from_rows(ROWS, "synthetic fixture")
    return P.WorldEpisode(region_id=PID, year=2099, tile=(2, 2), box=fx.TEST_BOX, window=P.WorldWindow(T0, T1, 100),
                          det=det, plan_key=f"{PID}:2099:22",
                          env_kw={"schedule": "cmr", "read_passes": fx.fixture_pass_reader()})


class RoundTests(unittest.TestCase):
    def test_a_place_s_round_is_played_on_its_own_pass_list_with_no_terrain(self) -> None:
        env = L.make_env(_episode(), load_params().as_dict(), {})
        self.assertGreater(env.n_looks, 0)
        self.assertEqual(env.describe()["looks"]["source"], "cmr")

    def test_every_player_plays_a_place_s_round(self) -> None:
        out = P._play_all((_episode(), load_params().as_dict(), ("least_sure",)))
        for name in ("least_sure", "learned", "oracle", "latest_modis"):
            self.assertIn("gain", out[name])
        self.assertEqual(len(out["random"]["gains"]), P.RANDOM_SEEDS)
        self.assertGreaterEqual(out["oracle"]["gain"], min(out["random"]["gains"]) - 1e-12)

    def test_a_place_may_be_played_and_its_folds_are_by_place_and_year(self) -> None:
        from backend.env.episodes import may_be_played

        ep = _episode()
        self.assertTrue(may_be_played(ep))
        self.assertEqual(L.fold_of([ep, ep]), [0, 0])


class OrderTests(unittest.TestCase):
    def test_the_measurement_waits_for_test_b_and_the_fit(self) -> None:
        plan = {"plan_sha256": "p", "episodes": {"test_b": []}}
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "none.json"
            with mock.patch.dict(R.LOOK_FILES, {"test_b": missing}), self.assertRaises(SystemExit):
                P.measure(plan, Path(tmp), workers=1)
            there = Path(tmp) / "test_b.json"
            there.write_text("{}")
            with mock.patch.dict(R.LOOK_FILES, {"test_b": there}), mock.patch.object(P, "FIT_FILE", missing), \
                    self.assertRaises(SystemExit):
                P.measure(plan, Path(tmp), workers=1)

    def test_the_players_wait_for_the_refit_s_decision(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(R, "REFIT_FILE", Path(tmp) / "none.json"):
            with self.assertRaises(SystemExit):
                P.round_values({"plan_sha256": "p"})


if __name__ == "__main__":
    unittest.main()
