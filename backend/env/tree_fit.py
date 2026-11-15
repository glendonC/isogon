"""Fit the tree player on the fresh test's fitting episodes, choose its form on the validation episodes, and measure
it once on test C (the player is `backend/env/tree_player.py`; test C is `backend/model/fresh_world_c.py`).

  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.env.tree_fit fit \
      [--work DIR] [--workers N]
  ... python3 -m backend.env.tree_fit measure [--work DIR] [--work-c DIR] [--workers N]

Rounds are played as the fresh test's players were: the values test B was looked at with, the reward in use, 4 by 4
tiles, 4 looks, each episode's own pass list, no terrain.

The fit. The true reward of every tile is read at every look an evenly spread budget is spent on, first along the
learned player's mixed behaviour (the best tile half the time, the least sure tile a quarter, a random tile a quarter),
then along the player's own first fit; the final fit is on both. A tile's target is its reward over the best tile's
reward at that look, a negative reward counting as none; a look where no tile gains is left out; every tile of a look
counts alike. Log-loss boosted trees (`HistGBDT`: depth 3, learning rate 0.1, l2 10, least child hessian 20, every
input at every tree, seed 42). The number of trees, of 50, 100, 200 and 400, is the one whose picks pay the most on
fitting episodes it was not fitted on (five folds by place and year, `learn.fold_of`); ties to the fewer.

The choice. The player is fitted in two forms, on the learned player's 15 inputs and on all 22. The one played on the
validation episodes is the one with the larger mean round gain there, ties to the 15. Least sure and the learned
player in use are played beside it; their differences are recorded and decide nothing.

The look. `measure` plays the chosen form once on test C's episodes beside least sure, the learned player in use,
random (three seeds) and the player that sees the answer. It refuses to run before the fit is on record and when
its own record exists. The tree player beats least sure when the 90 percent interval of the mean of its round gain
less least sure's, fires resampled whole 2,000 times, lies wholly above zero; level when it holds zero; behind when
it lies wholly below.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor
import datetime as _dt
import json
from pathlib import Path
import sys
import time
from typing import Any, Callable

import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.env import fresh_world_players as P  # noqa: E402
from backend.env import learn as L  # noqa: E402
from backend.env.agents import run_episode, spend_now  # noqa: E402
from backend.env.episodes import may_be_played  # noqa: E402
from backend.env.next_look import NO_LOOK  # noqa: E402
from backend.env.tree_player import FORMS, INPUT_NAMES, TreePlayer, inputs, pick  # noqa: E402
from backend.eval.rows import detections_from_rows  # noqa: E402
from backend.model import fresh_test as F  # noqa: E402
from backend.model import fresh_world as W  # noqa: E402
from backend.model import fresh_world_c as C  # noqa: E402
from backend.model import fresh_world_run as R  # noqa: E402
from backend.model.challenger.gbdt import HistGBDT  # noqa: E402

FIT_FILE: Path = Path(__file__).resolve().parent / "fitted" / "tree_player.json"
TEST_C_FILE: Path = Path(__file__).resolve().parent / "fitted" / "tree_player_test_c.json"
TREE_SETTINGS: dict[str, Any] = {"learning_rate": 0.1, "max_depth": 3, "l2_reg": 10.0, "min_child_hessian": 20.0,
                                 "colsample_bytree": 1.0, "random_state": 42}
N_TREES: tuple[int, ...] = (50, 100, 200, 400)
RANDOM_SEEDS: tuple[int, ...] = (0, 1, 2)
N_BOOT: int = 2000


def _trees(n: int) -> HistGBDT:
    return HistGBDT(n_estimators=int(n), **TREE_SETTINGS)


# ---- gathering the true reward of every tile, on fitting episodes -------------------------------------------------

def _gather(job: tuple[Any, dict[str, Any], dict[str, Any], tuple[Any, ...], int]) -> list[tuple[np.ndarray, np.ndarray]]:
    """Inputs and true rewards of every tile at every look an evenly spread budget is spent on, along a behaviour."""
    ep, params, env_kw, behaviour, seed = job
    if not may_be_played(ep):
        raise ValueError(f"{ep.key} may not be played: the test of the three 2021 fires is closed")
    env = L.make_env(ep, params, env_kw)
    rng = np.random.default_rng(seed)
    player = TreePlayer(behaviour[1], behaviour[2]) if behaviour[0] == "tree" else None
    obs = env.reset(seed)
    out: list[tuple[np.ndarray, np.ndarray]] = []
    done = env.n_looks == 0
    while not done:
        assert obs is not None
        act = NO_LOOK
        if obs.budget_left > 0 and spend_now(obs.decision, env.n_looks, env.budget):
            x = inputs(obs)
            gains = np.array([env.peek(t) for t in range(env.n_tiles)])
            out.append((x.astype(np.float32), gains))
            if player is not None:
                act = player.choose(obs)
            else:
                u = rng.random()
                if u < 0.5:
                    act = int(np.argmax(gains))
                elif u < 0.75:
                    act = int(np.argmax(x[:, 0]))
                else:
                    act = int(rng.integers(0, env.n_tiles))
        obs, _, done, _ = env.step(act)
    return out


def training_set(samples: list[list[tuple[np.ndarray, np.ndarray]]], keep: list[bool], cols: tuple[int, ...]) -> tuple[np.ndarray, np.ndarray]:
    xs, ys = [], []
    for ep_samples, use in zip(samples, keep):
        if not use:
            continue
        for x, gains in ep_samples:
            top = float(gains.max())
            if top <= 0.0:
                continue
            xs.append(x[:, list(cols)])
            ys.append(np.clip(gains, 0.0, None) / top)
    if not xs:
        return np.zeros((0, len(cols)), dtype=np.float32), np.zeros(0)
    return np.vstack(xs), np.concatenate(ys)


def _fold_job(job: tuple[Any, ...]) -> dict[str, Any]:
    """Fit on every fold but one; the reward of the tile each number of trees picks on the fold left out."""
    x, y, held, cols = job
    model = _trees(max(N_TREES)).fit(x, y)
    got = {k: 0.0 for k in N_TREES}
    if not held:
        return {"got": got, "best": 0.0, "decisions": 0}
    xs = np.vstack([xd[:, list(cols)] for xd, _ in held])
    sizes = [xd.shape[0] for xd, _ in held]
    starts = np.cumsum([0] + sizes)
    for k in N_TREES:
        s = model.predict_raw(xs, n_trees=k)
        for i, (xd, gains) in enumerate(held):
            got[k] += float(gains[pick(s[starts[i]:starts[i + 1]], xd[:, 0])])
    return {"got": got, "best": float(sum(g.max() for _, g in held)), "decisions": len(held)}


def _fit_job(job: tuple[np.ndarray, np.ndarray, int]) -> dict[str, Any]:
    x, y, n = job
    return _trees(n).fit(x, y).to_dict()


def fit_form(samples: list[list[tuple[np.ndarray, np.ndarray]]], folds: list[int], cols: tuple[int, ...],
             pool: ProcessPoolExecutor) -> dict[str, Any]:
    """The number of trees chosen on held-out folds, then the fit on every fitting episode with it."""
    jobs = []
    for f in sorted(set(folds)):
        x, y = training_set(samples, [k != f for k in folds], cols)
        held = [d for s, k in zip(samples, folds) if k == f for d in s]
        jobs.append((x, y, held, cols))
    res = list(pool.map(_fold_job, jobs))
    got = {k: sum(r["got"][k] for r in res) for k in N_TREES}
    best = sum(r["best"] for r in res)
    n = sum(r["decisions"] for r in res)
    chosen = max(N_TREES, key=lambda k: (got[k], -k))
    x, y = training_set(samples, [True] * len(samples), cols)
    model = pool.submit(_fit_job, (x, y, chosen)).result()
    return {"n_trees": chosen, "rows": int(x.shape[0]), "looks": int(x.shape[0] // 16),
            "held_out": {str(k): {"one_look_reward": got[k] / max(n, 1), "share_of_best_tile": (got[k] / best) if best > 0 else None}
                         for k in N_TREES},
            "decisions_held_out": n, "model": model}


# ---- playing rounds -------------------------------------------------------------------------------------------------

def _player(spec: tuple[Any, ...]) -> Any:
    if spec[0] == "tree":
        return TreePlayer(spec[1], spec[2])
    return L._agent(spec)


def _play(job: tuple[Any, dict[str, Any], tuple[Any, ...]]) -> dict[str, Any]:
    ep, params, spec = job
    if not may_be_played(ep):
        raise ValueError(f"{ep.key} may not be played: the test of the three 2021 fires is closed")
    env = L.make_env(ep, params, {})
    r = run_episode(env, _player(spec), seed=int(spec[1]) if spec[0] == "random" else 0)
    return {"episode": ep.key, "gain": float(r["return"]), "start": float(r["score_start"]),
            "looks": [k for k, a in enumerate(r["actions"]) if a != NO_LOOK]}


def play_all(eps: list[Any], params: dict[str, Any], specs: dict[str, tuple[Any, ...]], pool: ProcessPoolExecutor) -> dict[str, list[dict[str, Any]]]:
    names = list(specs)
    jobs = [(e, params, specs[n]) for n in names for e in eps]
    rows = list(pool.map(_play, jobs, chunksize=1))
    return {n: rows[i * len(eps):(i + 1) * len(eps)] for i, n in enumerate(names)}


def learned_in_use() -> tuple[Any, ...]:
    """The learned player measured on test B: the one validation chose for the fresh test."""
    doc = json.loads(P.MEASURE_FILE.read_text(encoding="utf-8"))
    return tuple(doc["learned_player"]["spec"])


def _gains(rows: list[dict[str, Any]]) -> list[float]:
    return [float(r["gain"]) for r in rows]


def verdict(d: dict[str, float]) -> str:
    if d["p05"] > 0.0:
        return "ahead"
    if d["p95"] < 0.0:
        return "behind"
    return "level"


# ---- the fit and the choice -----------------------------------------------------------------------------------------

def fit(work: Path, workers: int, log: Callable[[str], None] = print) -> dict[str, Any]:
    t0 = time.time()
    plan = R.load_plan()
    plan_c = C.load_plan()
    params, values = P.round_values(plan)
    train, left_fit = P.world_episodes(plan, "fitting", work)
    val, left_val = P.world_episodes(plan, "validation", work)
    folds = L.fold_of(train)
    log(f"tree player: {len(train)} fitting episodes, {len(val)} validation episodes")
    forms: dict[str, Any] = {}
    with ProcessPoolExecutor(max_workers=workers) as pool:
        samples0 = list(pool.map(_gather, [(e, params, {}, ("mix",), i) for i, e in enumerate(train)], chunksize=1))
        log(f"gathered along the mixed behaviour: {sum(len(s) for s in samples0)} looks, {time.time() - t0:.0f} s")
        for name, cols in FORMS.items():
            first = fit_form(samples0, folds, cols, pool)
            log(f"{name}: first fit, {first['n_trees']} trees, {time.time() - t0:.0f} s")
            samples1 = list(pool.map(_gather, [(e, params, {}, ("tree", first["model"], cols), i) for i, e in enumerate(train)], chunksize=1))
            both = [a + b for a, b in zip(samples0, samples1)]
            final = fit_form(both, folds, cols, pool)
            log(f"{name}: final fit, {final['n_trees']} trees, {time.time() - t0:.0f} s")
            forms[name] = {"columns": list(cols), "inputs": [INPUT_NAMES[c] for c in cols],
                           "first_fit": {k: v for k, v in first.items() if k != "model"}, "final_fit": final}
        specs: dict[str, tuple[Any, ...]] = {name: ("tree", forms[name]["final_fit"]["model"], tuple(FORMS[name])) for name in FORMS}
        specs["least_sure"] = ("least_sure",)
        specs["learned_in_use"] = learned_in_use()
        played = play_all(val, params, specs, pool)
    gains = {n: _gains(r) for n, r in played.items()}
    means = {n: float(np.mean(g)) if g else None for n, g in gains.items()}
    names = list(FORMS)
    chosen = max(names, key=lambda n: (means[n] if means[n] is not None else -1e9, -names.index(n)))
    diffs = {f"{n}_minus_least_sure": L.paired_bootstrap(gains[n], gains["least_sure"], n_boot=N_BOOT) for n in names}
    diffs.update({f"{n}_minus_learned_in_use": L.paired_bootstrap(gains[n], gains["learned_in_use"], n_boot=N_BOOT) for n in names})
    return {
        "what": "the tree player, fitted on the fresh test's fitting episodes and its form chosen on its validation episodes",
        "protocol_sha256": C.protocol_sha256(), "written_protocol_sha256": C.WRITTEN_PROTOCOL_SHA256,
        "plan_sha256": plan["plan_sha256"], "test_c_plan_sha256": plan_c["plan_sha256"], "round_values": values,
        "setting": {"tiles": f"{L.TILES}x{L.TILES}", "budget": L.BUDGET, "score": "csi", "reward": L.REWARD,
                    "looks": "cmr", "terrain": "none", "when": "the evenly spread looks, as least sure"},
        "trees": {**TREE_SETTINGS, "n_trees_from": list(N_TREES), "loss": "log-loss on each tile's reward over the best tile's"},
        "episodes": {"fitting": len(train), "validation": len(val), "folds": "five, by place and year",
                     "left_out": {"fitting": left_fit, "validation": left_val}},
        "forms": forms,
        "validation": {
            "mean_gain": means, "differences": diffs,
            "rule": "the form with the larger mean round gain on the validation episodes, ties to the learned player's inputs; "
                    "the differences to least sure and to the learned player in use decide nothing",
            "chosen": chosen,
            "per_episode": [{"episode": val[i].key, **{n: gains[n][i] for n in gains}} for i in range(len(val))],
        },
        "learned_in_use": list(specs["learned_in_use"]),
        "seconds": round(time.time() - t0, 1),
        "generated_utc": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ---- the look at test C ---------------------------------------------------------------------------------------------

def test_c_episodes(plan_c: dict[str, Any], work_c: Path) -> tuple[list[P.WorldEpisode], dict[str, str]]:
    out, left = [], {}
    for ep in plan_c["episodes"][C.ROLE]:
        why = R.scorable(ep, work_c, platforms=C.hidden_platforms(ep))
        if why is not None:
            left[ep["key"]] = why
            continue
        det = detections_from_rows(R.episode_rows(work_c, ep["key"]), R.ROWS_SOURCE)
        out.append(P.WorldEpisode(
            region_id=ep["place_id"], year=int(ep["year"]), tile=tuple(ep["tile"]), box=tuple(ep["box"]),
            window=P.WorldWindow(float(ep["start_s"]), float(ep["end_s"]), int(ep["modis_pixels_in_box"])), det=det,
            plan_key=ep["key"], env_kw={"schedule": "cmr", "read_passes": R.pass_reader(work_c, ep["key"]),
                                        "platforms_cached": C.KeptPlatforms()},
        ))
    return out, left


def measure(work_c: Path, workers: int, log: Callable[[str], None] = print) -> dict[str, Any]:
    if not FIT_FILE.is_file():
        raise SystemExit("the tree player's fit and choice must be on record first")
    fitted = json.loads(FIT_FILE.read_text(encoding="utf-8"))
    plan = R.load_plan()
    plan_c = C.load_plan()
    if fitted.get("test_c_plan_sha256") != plan_c["plan_sha256"] or fitted.get("plan_sha256") != plan["plan_sha256"]:
        raise ValueError("the tree player's fit on record is not of these plans")
    params, values = P.round_values(plan)
    chosen = fitted["validation"]["chosen"]
    form = fitted["forms"][chosen]
    eps, left = test_c_episodes(plan_c, work_c)
    log(f"test C: {len(eps)} episodes, {len(left)} left out")
    t0 = time.time()
    specs: dict[str, tuple[Any, ...]] = {"tree": ("tree", form["final_fit"]["model"], tuple(form["columns"])),
                                         "least_sure": ("least_sure",), "learned_in_use": tuple(fitted["learned_in_use"]),
                                         "oracle": ("oracle",)}
    for s in RANDOM_SEEDS:
        specs[f"random_{s}"] = ("random", s)
    with ProcessPoolExecutor(max_workers=workers) as pool:
        played = play_all(eps, params, specs, pool)
    gains = {n: _gains(r) for n, r in played.items() if not n.startswith("random_")}
    gains["random"] = [float(np.mean([played[f"random_{s}"][i]["gain"] for s in RANDOM_SEEDS])) for i in range(len(eps))]
    table = {n: {"mean_gain": float(np.mean(g)) if g else None} for n, g in gains.items()}
    bar = L.paired_bootstrap(gains["tree"], gains["least_sure"], n_boot=N_BOOT)
    diffs = {
        "tree_minus_least_sure": bar,
        "tree_minus_learned_in_use": L.paired_bootstrap(gains["tree"], gains["learned_in_use"], n_boot=N_BOOT),
        "learned_in_use_minus_least_sure": L.paired_bootstrap(gains["learned_in_use"], gains["least_sure"], n_boot=N_BOOT),
        "least_sure_minus_random": L.paired_bootstrap(gains["least_sure"], gains["random"], n_boot=N_BOOT),
        "oracle_minus_tree": L.paired_bootstrap(gains["oracle"], gains["tree"], n_boot=N_BOOT),
    }
    by_continent: dict[str, Any] = {}
    cont_of = {ep["key"]: ep["continent"] for ep in plan_c["episodes"][C.ROLE]}
    for cont in F.CONTINENTS:
        idx = [i for i, e in enumerate(eps) if cont_of[e.key] == cont]
        if len(idx) >= 2:
            by_continent[cont] = L.paired_bootstrap([gains["tree"][i] for i in idx], [gains["least_sure"][i] for i in idx], n_boot=N_BOOT)
        else:
            by_continent[cont] = {"episodes": len(idx), "not_judged": "fewer than two fires cannot be resampled"}
    return {
        "what": "the tree player, once on test C's episodes, beside least sure, the learned player in use, random and "
                "the player that sees the answer",
        "protocol_sha256": C.protocol_sha256(), "written_protocol_sha256": C.WRITTEN_PROTOCOL_SHA256,
        "plan_sha256": plan["plan_sha256"], "test_c_plan_sha256": plan_c["plan_sha256"], "round_values": values,
        "tree_player": {"form": chosen, "n_trees": form["final_fit"]["n_trees"], "inputs": form["inputs"]},
        "setting": {"tiles": f"{L.TILES}x{L.TILES}", "budget": L.BUDGET, "reward": L.REWARD, "random_seeds": list(RANDOM_SEEDS),
                    "terrain": "none", "hidden_platforms": list(C.HIDDEN_PLATFORMS), "bootstrap": {"resamples": N_BOOT, "seed": 20261114}},
        "episodes": len(eps), "left_out": left,
        "mean_gain": table, "differences": diffs,
        "bar": {"rule": "the tree player beats least sure only if the whole 90 percent interval of the mean difference lies above zero",
                "verdict": verdict(bar)},
        "tree_minus_least_sure_by_continent": by_continent,
        "per_episode": [{"episode": e.key, "continent": cont_of[e.key], "score_start": played["least_sure"][i]["start"],
                         **{n: gains[n][i] for n in gains}} for i, e in enumerate(eps)],
        "seconds": round(time.time() - t0, 1),
        "generated_utc": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="the tree player: fit and choose, then one look at test C")
    ap.add_argument("cmd", choices=["fit", "measure"])
    ap.add_argument("--work", default=str(W.WORK_DEFAULT))
    ap.add_argument("--work-c", default=str(C.WORK_DEFAULT))
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args(argv)
    out = FIT_FILE if args.cmd == "fit" else TEST_C_FILE
    if out.exists():
        raise SystemExit(f"{out} exists: this step is taken once")
    doc = fit(Path(args.work), args.workers) if args.cmd == "fit" else measure(Path(args.work_c), args.workers)
    out.write_text(json.dumps(doc, indent=1, default=str) + "\n", encoding="utf-8")
    print(f"written {out}")
    if args.cmd == "fit":
        print(json.dumps({"chosen": doc["validation"]["chosen"], "mean_gain": doc["validation"]["mean_gain"]}, indent=1))
    else:
        print(json.dumps({"mean_gain": doc["mean_gain"], "tree_minus_least_sure": doc["differences"]["tree_minus_least_sure"],
                          "verdict": doc["bar"]["verdict"]}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
