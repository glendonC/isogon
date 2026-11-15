"""The players of the round on the fresh test's split (the protocol's `players`, backend/model/fresh_test.py).

  ... python3 -m backend.env.fresh_world_players fit      [--work DIR] [--workers N]
  ... python3 -m backend.env.fresh_world_players measure  [--work DIR] [--workers N]

`fit` fits the learned player on the fitting episodes (`learn.fit_player`, folds of places and years) and chooses,
on the validation episodes, between that fit with and without its look score and the player in use. `measure`
plays every reference player and the chosen learned player once on the test B episodes; it refuses to run before
test B's look and the players' fit are on record.

Rounds are played with the values test B was looked at with (the refit's decision), under the reward in use, on
4 by 4 tiles with 4 looks, on each episode's own pass list. A place of the fresh test has no terrain pack, so its
rounds have no terrain.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
import json
from pathlib import Path
import sys
import time
from typing import Any, Callable

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.env import learn as L  # noqa: E402
from backend.eval.rows import Detections, detections_from_rows  # noqa: E402
from backend.model import fresh_test as F  # noqa: E402
from backend.model import fresh_world as W  # noqa: E402
from backend.model import fresh_world_run as R  # noqa: E402

FIT_FILE: Path = W.PLAN_FILE.with_name("fresh_world_players_fit.json")
MEASURE_FILE: Path = W.PLAN_FILE.with_name("fresh_world_players_test_b.json")
RANDOM_SEEDS: int = 3


@dataclass(frozen=True)
class WorldWindow:
    start_s: float
    end_s: float
    modis_pixels_in_box: int

    def as_dict(self) -> dict[str, Any]:
        return {"start_s": self.start_s, "end_s": self.end_s, "modis_pixels_in_box": self.modis_pixels_in_box}


@dataclass(frozen=True)
class WorldEpisode:
    """An episode of the fresh test as the learned player's fit reads one: the place stands for the region."""

    region_id: str
    year: int
    tile: tuple[int, int]
    box: tuple[float, float, float, float]
    window: WorldWindow
    det: Detections
    plan_key: str
    env_kw: dict[str, Any] = field(default_factory=dict)
    split: str = "fit"

    @property
    def key(self) -> str:
        return self.plan_key

    def as_dict(self) -> dict[str, Any]:
        return {"key": self.key, "place_id": self.region_id, "year": self.year, "tile": list(self.tile),
                "box": list(self.box), **self.window.as_dict()}


def world_episodes(plan: dict[str, Any], role: str, work: Path) -> tuple[list[WorldEpisode], dict[str, str]]:
    """The episodes of one role that can be played, and the reason for each that cannot."""
    out, left = [], {}
    for ep in plan["episodes"][role]:
        why = R.scorable(ep, work)
        if why is not None:
            left[ep["key"]] = why
            continue
        det = detections_from_rows(R.episode_rows(work, ep["key"]), R.ROWS_SOURCE)
        out.append(WorldEpisode(
            region_id=ep["place_id"], year=int(ep["year"]), tile=tuple(ep["tile"]), box=tuple(ep["box"]),
            window=WorldWindow(float(ep["start_s"]), float(ep["end_s"]), int(ep["modis_pixels_in_box"])), det=det,
            plan_key=ep["key"], env_kw={"schedule": "cmr", "read_passes": R.pass_reader(work, ep["key"])},
        ))
    return out, left


def round_values(plan: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """The values test B was looked at with, by the refit's decision on record."""
    if not R.REFIT_FILE.is_file():
        raise SystemExit("the players wait for the refit's decision")
    params, values = R.test_b_values(json.loads(R.REFIT_FILE.read_text(encoding="utf-8")), plan)
    values.pop("beside", None)
    return params, values


def _mean_gain(job: tuple[Any, ...]) -> dict[str, Any]:
    return L._rollout(job)


def choose_on_validation(doc: dict[str, Any], val: list[WorldEpisode], params: dict[str, Any], workers: int) -> dict[str, Any]:
    """The learned player to measure: of the new fit with its look score, the new fit's tiles alone and the player
    in use, the one with the largest mean gain on the validation episodes."""
    from backend.env.policy import load_fitted

    pol = doc["policy"]
    when = pol["when"]
    candidates: dict[str, tuple[Any, ...]] = {
        "new_fit_tiles_only": ("learned", pol["weights"], None, None),
    }
    if when["selected_features"]:
        candidates["new_fit_with_its_look_score"] = ("learned", pol["weights"], when["weights"], when["scales"])
    tracked = (load_fitted() or {}).get("policy")
    if tracked is not None:
        tw = tracked.get("when") or {}
        candidates["player_in_use"] = ("learned", tracked["weights"],
                                       tw.get("weights") if tw.get("adopted") else None, tw.get("scales") if tw.get("adopted") else None)
    jobs = [(e, params, {}, spec) for spec in candidates.values() for e in val]
    with ProcessPoolExecutor(max_workers=workers) as pool:
        rows = list(pool.map(_mean_gain, jobs, chunksize=1))
    names = list(candidates)
    gains = {n: [r["gain"] for r in rows[i * len(val):(i + 1) * len(val)]] for i, n in enumerate(names)}
    means = {n: float(np.mean(g)) if g else None for n, g in gains.items()}
    chosen = max(names, key=lambda n: (means[n] if means[n] is not None else -1e9, -names.index(n)))
    return {"candidates": {n: {"spec": list(candidates[n]), "mean_gain_on_validation": means[n]} for n in names},
            "chosen": chosen, "rule": "the largest mean gain on the validation episodes; ties go to the first listed",
            "validation_episodes": len(val)}


def fit(plan: dict[str, Any], work: Path, workers: int, log: Callable[[str], None] = print) -> dict[str, Any]:
    t0 = time.time()
    params, values = round_values(plan)
    train, left_fit = world_episodes(plan, "fitting", work)
    val, left_val = world_episodes(plan, "validation", work)
    log(f"players: {len(train)} fitting episodes, {len(val)} validation episodes")
    doc = L.fit_player(train, params, {}, workers, log, t0,
                       {"what": "the fresh test's fitting episodes", "validation": "used below to choose, not to fit",
                        "test": "test B, measured once after its look", "left_out": left_fit})
    doc["choice_on_validation"] = choose_on_validation(doc, val, params, workers)
    doc["choice_on_validation"]["left_out"] = left_val
    doc.update({"protocol_sha256": F.protocol_sha256(), "plan_sha256": plan["plan_sha256"], "round_values": values,
                "terrain": "none: a place of the fresh test has no terrain pack"})
    log(f"chosen on validation: {doc['choice_on_validation']['chosen']}")
    return doc


def _play_all(job: tuple[WorldEpisode, dict[str, Any], tuple[Any, ...]]) -> dict[str, Any]:
    from backend.env.agents import play_reference

    ep, params, spec = job
    env = L.make_env(ep, params, {})
    out = play_reference(env, random_seeds=RANDOM_SEEDS, policy=L._agent(spec))
    out["episode"] = ep.key
    return out


def measure(plan: dict[str, Any], work: Path, workers: int, log: Callable[[str], None] = print) -> dict[str, Any]:
    """Every reference player and the chosen learned player, once on the test B episodes."""
    if not R.LOOK_FILES["test_b"].is_file():
        raise SystemExit("the players are measured on test B after test B's look")
    if not FIT_FILE.is_file():
        raise SystemExit("the players' fit and choice must be on record first")
    fitted = json.loads(FIT_FILE.read_text(encoding="utf-8"))
    if fitted.get("plan_sha256") != plan["plan_sha256"]:
        raise ValueError("the players' fit on record is not of this plan")
    params, values = round_values(plan)
    choice = fitted["choice_on_validation"]
    spec = tuple(choice["candidates"][choice["chosen"]]["spec"])
    eps, left = world_episodes(plan, "test_b", work)
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=workers) as pool:
        rows = list(pool.map(_play_all, [(e, params, spec) for e in eps], chunksize=1))
    names = ["latest_modis", "least_sure", "expected_new", "least_sure_at_night", "least_sure_when_unsure",
             "least_sure_when_sharp", "learned", "oracle", "centre"]
    gains = {n: [float(r[n]["gain"]) for r in rows] for n in names}
    gains["random"] = [float(np.mean(r["random"]["gains"])) for r in rows]
    gains["constant"] = [float(np.mean(r["constant"]["gains"])) for r in rows]
    table = {n: {"mean_gain": float(np.mean(g)) if g else None} for n, g in gains.items()}
    diffs = {
        "learned_minus_least_sure": L.paired_bootstrap(gains["learned"], gains["least_sure"]),
        "learned_minus_random": L.paired_bootstrap(gains["learned"], gains["random"]),
        "least_sure_minus_random": L.paired_bootstrap(gains["least_sure"], gains["random"]),
        "oracle_minus_learned": L.paired_bootstrap(gains["oracle"], gains["learned"]),
    } if len(rows) >= 2 else {}
    return {
        "what": "the players of the round, once on the fresh test's test B episodes",
        "protocol_sha256": F.protocol_sha256(), "plan_sha256": plan["plan_sha256"], "round_values": values,
        "learned_player": {"chosen_on_validation": choice["chosen"], "spec": list(spec)},
        "episodes": len(rows), "left_out": left,
        "setting": {"tiles": f"{L.TILES}x{L.TILES}", "budget": L.BUDGET, "reward": L.REWARD, "random_seeds": RANDOM_SEEDS,
                    "terrain": "none"},
        "mean_gain": table, "differences": diffs,
        "per_episode": [{"episode": r["episode"], "score_start": r["score_start"],
                         **{n: gains[n][i] for n in gains}} for i, r in enumerate(rows)],
        "seconds": round(time.time() - t0, 1),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="the players of the round on the fresh test's split")
    ap.add_argument("cmd", choices=["fit", "measure"])
    ap.add_argument("--work", default=str(W.WORK_DEFAULT))
    ap.add_argument("--workers", type=int, default=16)
    args = ap.parse_args(argv)
    plan = R.load_plan()
    work = Path(args.work)
    out = FIT_FILE if args.cmd == "fit" else MEASURE_FILE
    if out.exists():
        raise SystemExit(f"{out} exists: this step is taken once")
    doc = fit(plan, work, args.workers) if args.cmd == "fit" else measure(plan, work, args.workers)
    out.write_text(json.dumps(doc, indent=1, default=str) + "\n", encoding="utf-8")
    print(f"written {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
