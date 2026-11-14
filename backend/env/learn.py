"""Let a look teach the model about the tiles it did not look at, then fit one small policy.

  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.env.learn

Everything is decided on fit episodes. Episodes of 2012 to 2023 train, episodes of 2024 and 2025 validate, and the
22 test episodes (the three 2021 fires) are played once at the end with whatever validation chose. The result,
with its evidence and the known limits, is written to backend/env/fitted/next_look.json.

Part A, the model. A revealed tile corrects the estimate inside that tile; by itself it tells the model nothing
about its count of burning cells elsewhere at that overpass. With `learn_from_looks` the ratio between what the look
found and what the MODIS-only model expected in the looked-at tiles (by day and by night, shrunk toward one by
`prior_cells` cells of prior evidence) rescales the probabilities of every cell not looked at. `prior_cells` is
chosen on a training subset by the oracle's gain; validation decides whether the change is used at all.

Part B, the policy. `backend/env/policy.py`: a linear score per tile over features of the observation. Training
data are the true gains of looking at every tile at every spending decision of the training episodes, first along
a mixed behaviour (the oracle's tile half the time, the least sure tile a quarter, a random tile a quarter), then
along the fitted policy's own choices. Weights are fitted by ridge regression to the gain of each tile divided by
the largest gain of its decision. The ridge strength and the round are chosen by mean gain on validation episodes.
"""

from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
import datetime as _dt
import json
import os
import sys
import time
from typing import Any

import numpy as np

from backend.env import KNOWN_LIMITS
from backend.env.agents import LatestModisAgent, LeastSureAgent, OracleAgent, RandomAgent, run_episode, spend_now
from backend.env.episodes import EnvEpisode, catalogue
from backend.env.next_look import NO_LOOK, NextLookEnv
from backend.env.policy import FEATURE_NAMES, FEATURES, FITTED_FILE, LinearPolicyAgent, fit_ridge, tile_features
from backend.env.terrain import context_elevation
from backend.eval.grid import EvalGrid
from backend.model.occupancy import OccupancyParams

TILES: int = 4
BUDGET: int = 4
TRAIN_LAST_YEAR: int = 2023
PRIOR_CELLS_GRID: tuple[float, ...] = (10.0, 40.0, 160.0)
RIDGE_GRID: tuple[float, ...] = (0.01, 0.1, 1.0, 10.0)
TEACH_SUBSET: int = 30
RANDOM_SEEDS: int = 10

_CONTEXT: dict[str, tuple[float, float, float, float]] = {}


def _context_box(region_id: str) -> tuple[float, float, float, float]:
    if region_id not in _CONTEXT:
        from backend.firms import region_box

        _CONTEXT[region_id] = region_box(region_id)
    return _CONTEXT[region_id]


def make_env(ep: EnvEpisode, params: dict[str, Any], env_kw: dict[str, Any], tiles: int = TILES, budget: int = BUDGET) -> NextLookEnv:
    grid = EvalGrid.from_bbox(ep.box)
    terrain = context_elevation(ep.region_id, _context_box(ep.region_id), grid)
    return NextLookEnv(ep.det, ep.box, (ep.window.start_s, ep.window.end_s), tiles=(tiles, tiles), budget=budget,
                       params=OccupancyParams(**params), terrain_m=terrain, **env_kw)


def _agent(spec: tuple[Any, ...]) -> Any:
    kind = spec[0]
    if kind == "random":
        return RandomAgent(seed=int(spec[1]))
    if kind == "least_sure":
        return LeastSureAgent()
    if kind == "latest_modis":
        return LatestModisAgent()
    if kind == "oracle":
        return OracleAgent()
    if kind == "linear":
        return LinearPolicyAgent(list(spec[1]))
    raise ValueError(kind)


def _rollout(job: tuple[EnvEpisode, dict[str, Any], dict[str, Any], tuple[Any, ...]]) -> dict[str, Any]:
    ep, params, env_kw, spec = job
    env = make_env(ep, params, env_kw)
    r = run_episode(env, _agent(spec), seed=int(spec[1]) if spec[0] == "random" else 0)
    return {"episode": ep.key, "agent": spec[0], "gain": r["return"], "start": r["score_start"], "final": r["score_end"]}


def _collect(job: tuple[EnvEpisode, dict[str, Any], dict[str, Any], tuple[Any, ...], int]) -> list[tuple[np.ndarray, np.ndarray]]:
    """Features and true gains of every tile at every spending decision of one episode, along a behaviour."""
    ep, params, env_kw, behaviour, seed = job
    env = make_env(ep, params, env_kw)
    rng = np.random.default_rng(seed)
    policy = LinearPolicyAgent(list(behaviour[1])) if behaviour[0] == "linear" else None
    obs = env.reset(seed)
    out: list[tuple[np.ndarray, np.ndarray]] = []
    done = env.n_looks == 0
    while not done:
        assert obs is not None
        act = NO_LOOK
        if obs.budget_left > 0 and spend_now(obs.decision, env.n_looks, env.budget):
            feats = tile_features(obs, env)
            gains = np.array([env.peek(t) for t in range(env.n_tiles)])
            out.append((feats, gains))
            if policy is not None:
                act = int(np.argmax(feats @ policy.weights))
            else:
                u = rng.random()
                if u < 0.5:
                    act = int(np.argmax(gains))
                elif u < 0.75:
                    act = int(np.argmax(feats[:, 0]))
                else:
                    act = int(rng.integers(0, env.n_tiles))
        obs, _, done, _ = env.step(act)
    return out


def paired_bootstrap(a: list[float], b: list[float], n_boot: int = 4000, seed: int = 20261114) -> dict[str, float]:
    """Mean of a minus b over episodes, with the 90 percent interval from resampling episodes with replacement."""
    d = np.asarray(a, dtype=np.float64) - np.asarray(b, dtype=np.float64)
    rng = np.random.default_rng(seed)
    means = d[rng.integers(0, d.size, size=(n_boot, d.size))].mean(axis=1)
    return {"mean_difference": float(d.mean()), "p05": float(np.percentile(means, 5)), "p95": float(np.percentile(means, 95)),
            "episodes": int(d.size), "episodes_a_ahead": int((d > 0).sum()), "episodes_b_ahead": int((d < 0).sum())}


def _mean_gain(rows: list[dict[str, Any]]) -> float:
    return float(np.mean([r["gain"] for r in rows])) if rows else 0.0


def _by_episode(rows: list[dict[str, Any]], episodes: list[EnvEpisode]) -> list[float]:
    by = {}
    for r in rows:
        by.setdefault(r["episode"], []).append(r["gain"])
    return [float(np.mean(by[e.key])) for e in episodes]


def _stamp() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main(argv: list[str]) -> int:
    from backend.firms import read_firms, region_box
    from backend.model.fitted import load_params
    from backend.terrain.live_region import PRESET_BY_ID

    def log(msg: str) -> None:
        print(msg, flush=True)

    t0 = time.time()
    episodes = catalogue(read_firms, region_box, PRESET_BY_ID)
    train = [e for e in episodes if e.split == "fit" and e.year <= TRAIN_LAST_YEAR]
    val = [e for e in episodes if e.split == "fit" and e.year > TRAIN_LAST_YEAR]
    test = [e for e in episodes if e.split == "test"]
    params = load_params().as_dict()
    log(f"episodes: {len(train)} train (2012 to {TRAIN_LAST_YEAR}), {len(val)} validation, {len(test)} test; {TILES} by {TILES} tiles, {BUDGET} looks")
    pool = ProcessPoolExecutor(max_workers=max(1, min(8, (os.cpu_count() or 2) - 1)))

    def play(eps: list[EnvEpisode], env_kw: dict[str, Any], specs: list[tuple[Any, ...]]) -> dict[str, list[dict[str, Any]]]:
        jobs = [(e, params, env_kw, s) for s in specs for e in eps]
        rows = list(pool.map(_rollout, jobs))
        out: dict[str, list[dict[str, Any]]] = {}
        for r in rows:
            out.setdefault(r["agent"], []).append(r)
        return out

    # ---- Part A: does letting a look correct the count elsewhere raise the ceiling? ----------------------------
    rng = np.random.default_rng(20261114)
    subset = [train[i] for i in sorted(rng.choice(len(train), size=min(TEACH_SUBSET, len(train)), replace=False))]
    study: list[dict[str, Any]] = []
    off = play(subset, {}, [("oracle",), ("least_sure",)])
    study.append({"prior_cells": None, "oracle_gain": _mean_gain(off["oracle"]), "least_sure_gain": _mean_gain(off["least_sure"])})
    log(f"training subset ({len(subset)} episodes), teaching off: oracle {study[0]['oracle_gain']:+.4f}, least sure {study[0]['least_sure_gain']:+.4f}")
    for k in PRIOR_CELLS_GRID:
        r = play(subset, {"learn_from_looks": True, "prior_cells": k}, [("oracle",), ("least_sure",)])
        study.append({"prior_cells": k, "oracle_gain": _mean_gain(r["oracle"]), "least_sure_gain": _mean_gain(r["least_sure"])})
        log(f"  teaching on, prior_cells {k:g}: oracle {study[-1]['oracle_gain']:+.4f}, least sure {study[-1]['least_sure_gain']:+.4f}")
    best_k = max(study[1:], key=lambda s: s["oracle_gain"])["prior_cells"]
    on_kw = {"learn_from_looks": True, "prior_cells": best_k}
    specs_val = [("oracle",), ("least_sure",), ("latest_modis",)] + [("random", s) for s in range(3)]
    v_off, v_on = play(val, {}, specs_val), play(val, on_kw, specs_val)
    boot_oracle = paired_bootstrap(_by_episode(v_on["oracle"], val), _by_episode(v_off["oracle"], val))
    boot_least = paired_bootstrap(_by_episode(v_on["least_sure"], val), _by_episode(v_off["least_sure"], val))
    adopted = bool(boot_oracle["p05"] > 0.0)
    env_kw = on_kw if adopted else {}
    teach_doc = {
        "what": "a look rescales the probabilities of the cells not looked at by the ratio of cells found to cells expected in the tiles looked at, by day and by night",
        "adopted": adopted,
        "rule": "used when, on validation episodes, the oracle's mean gain is higher with it and the 90 percent interval of the paired difference (episodes resampled) lies above zero",
        "prior_cells": best_k,
        "prior_cells_chosen_on": f"{len(subset)} training episodes, by the oracle's mean gain",
        "training_subset": study,
        "validation": {
            "episodes": len(val),
            "off": {a: _mean_gain(v_off[a]) for a in v_off},
            "on": {a: _mean_gain(v_on[a]) for a in v_on},
            "oracle_on_minus_off": boot_oracle,
            "least_sure_on_minus_off": boot_least,
        },
    }
    log(f"validation ({len(val)} episodes): oracle off {teach_doc['validation']['off']['oracle']:+.4f} on {teach_doc['validation']['on']['oracle']:+.4f} "
        f"difference {boot_oracle['mean_difference']:+.4f} [{boot_oracle['p05']:+.4f}, {boot_oracle['p95']:+.4f}]; "
        f"least sure off {teach_doc['validation']['off']['least_sure']:+.4f} on {teach_doc['validation']['on']['least_sure']:+.4f}; adopted: {adopted}")

    # ---- Part B: the policy ---------------------------------------------------------------------------------
    def collect(behaviour: tuple[Any, ...]) -> tuple[np.ndarray, np.ndarray, int]:
        parts = list(pool.map(_collect, [(e, params, env_kw, behaviour, i) for i, e in enumerate(train)]))
        xs, ys, n_dec = [], [], 0
        for ep_parts in parts:
            for feats, gains in ep_parts:
                top = float(np.max(np.abs(gains)))
                if top <= 0.0:
                    continue          # every tile gains nothing: the decision teaches nothing
                xs.append(feats)
                ys.append(gains / top)
                n_dec += 1
        return np.vstack(xs), np.concatenate(ys), n_dec

    x0, y0, d0 = collect(("mix",))
    log(f"round 0: {d0} decisions, {y0.size} tile samples along the mixed behaviour")
    candidates: list[dict[str, Any]] = []

    def try_weights(w: np.ndarray, round_no: int, strength: float) -> None:
        r = play(val, env_kw, [("linear", [float(v) for v in w])])
        candidates.append({"round": round_no, "ridge": strength, "validation_gain": _mean_gain(r["linear"]), "weights": [float(v) for v in w]})
        log(f"  round {round_no} ridge {strength:g}: validation gain {candidates[-1]['validation_gain']:+.4f}")

    for lam in RIDGE_GRID:
        try_weights(fit_ridge(x0, y0, lam), 0, lam)
    best0 = max(candidates, key=lambda c: c["validation_gain"])
    x1, y1, d1 = collect(("linear", best0["weights"]))
    log(f"round 1: {d1} more decisions along the round 0 policy")
    xa, ya = np.vstack([x0, x1]), np.concatenate([y0, y1])
    for lam in RIDGE_GRID:
        try_weights(fit_ridge(xa, ya, lam), 1, lam)
    best = max(candidates, key=lambda c: c["validation_gain"])
    val_ref = play(val, env_kw, [("oracle",), ("least_sure",), ("latest_modis",)] + [("random", s) for s in range(RANDOM_SEEDS)])
    val_learned = play(val, env_kw, [("linear", best["weights"])])
    val_boot = paired_bootstrap(_by_episode(val_learned["linear"], val), _by_episode(val_ref["least_sure"], val))
    log(f"chosen: round {best['round']} ridge {best['ridge']:g}; validation gain {best['validation_gain']:+.4f} against least sure "
        f"{_mean_gain(val_ref['least_sure']):+.4f} and oracle {_mean_gain(val_ref['oracle']):+.4f}")

    # ---- the test episodes, once -------------------------------------------------------------------------------
    specs_test = [("oracle",), ("least_sure",), ("latest_modis",), ("linear", best["weights"])] + [("random", s) for s in range(RANDOM_SEEDS)]
    t = play(test, env_kw, specs_test)
    pool.shutdown()
    oracle_gain = _mean_gain(t["oracle"])
    rand_by_seed = [float(np.mean([r["gain"] for r in t["random"][i * len(test):(i + 1) * len(test)]])) for i in range(RANDOM_SEEDS)]
    table: dict[str, Any] = {}
    for name, key in (("random", "random"), ("latest_modis", "latest_modis"), ("least_sure", "least_sure"), ("learned", "linear"), ("oracle", "oracle")):
        rows = t[key]
        gain = _mean_gain(rows)
        table[name] = {
            "mean_final_score": round(float(np.mean([r["final"] for r in rows])), 4),
            "mean_gain": round(gain, 4),
            "share_of_oracle_gain": round(gain / oracle_gain, 3) if oracle_gain > 0 else None,
            "sd_of_mean_gain_across_seeds": round(float(np.std(rand_by_seed, ddof=1)), 4) if name == "random" else None,
        }
    learned_vs_least = paired_bootstrap(_by_episode(t["linear"], test), _by_episode(t["least_sure"], test))
    learned_vs_oracle = paired_bootstrap(_by_episode(t["oracle"], test), _by_episode(t["linear"], test))
    beats = learned_vs_least["p05"] > 0.0
    behind = learned_vs_least["p95"] < 0.0
    sentence = (
        "the learned policy beats least sure by more than the noise" if beats else
        "the learned policy is behind least sure by more than the noise" if behind else
        "the learned policy does not differ from least sure by more than the noise"
    )
    log("test episodes, once: " + "  ".join(f"{a} {table[a]['mean_gain']:+.4f} ({table[a]['share_of_oracle_gain']})" for a in table))
    log(f"learned minus least sure: {learned_vs_least['mean_difference']:+.4f} [{learned_vs_least['p05']:+.4f}, {learned_vs_least['p95']:+.4f}]: {sentence}")

    doc = {
        "what": "next-look environment: the model change and the learned policy",
        "known_limits": KNOWN_LIMITS,
        "setting": {"tiles": f"{TILES}x{TILES}", "budget": BUDGET, "score": "csi", "reward_target": "still_hidden",
                    "spending": "every agent spends the budget on the same looks, spread evenly; only the tile differs"},
        "episodes": {"train": len(train), "validation": len(val), "test": len(test),
                     "train_years": f"2012 to {TRAIN_LAST_YEAR}", "validation_years": "2024 and 2025",
                     "test": "the three 2021 fires, played once"},
        "reconstruction_parameters": params["fitted_on"],
        "learn_from_looks": teach_doc,
        "policy": {
            "kind": "linear score per tile; the tile with the highest score is looked at",
            "feature_names": list(FEATURE_NAMES),
            "features": {n: d for n, d in FEATURES},
            "weights": best["weights"],
            "fit": "ridge regression of each tile's true gain divided by the largest gain of its decision",
            "ridge": best["ridge"],
            "round": best["round"],
            "training": {"episodes": len(train), "decisions_round_0": d0, "decisions_round_1": d1,
                         "tile_samples": int(ya.size if best["round"] == 1 else y0.size),
                         "behaviour_round_0": "oracle's tile half the time, least sure a quarter, random a quarter",
                         "behaviour_round_1": "the best round 0 policy's own choices"},
            "candidates_on_validation": [{k: c[k] for k in ("round", "ridge", "validation_gain")} for c in candidates],
            "validation": {
                "episodes": len(val),
                "gains": {"learned": _mean_gain(val_learned["linear"]), "least_sure": _mean_gain(val_ref["least_sure"]),
                          "latest_modis": _mean_gain(val_ref["latest_modis"]), "random": _mean_gain(val_ref["random"]),
                          "oracle": _mean_gain(val_ref["oracle"])},
                "learned_minus_least_sure": val_boot,
            },
        },
        "test": {
            "episodes": len(test),
            "mean_start_score": round(float(np.mean([r["start"] for r in t["oracle"]])), 4),
            "agents": table,
            "random_mean_gain_by_seed": [round(v, 4) for v in rand_by_seed],
            "learned_minus_least_sure": learned_vs_least,
            "oracle_minus_learned": learned_vs_oracle,
            "plainly": sentence,
            "per_episode": {name: [round(v, 5) for v in _by_episode(t[key], test)]
                            for name, key in (("latest_modis", "latest_modis"), ("least_sure", "least_sure"), ("learned", "linear"), ("oracle", "oracle"))},
            "episode_keys": [e.key for e in test],
        },
        "seconds": round(time.time() - t0, 1),
        "generated_utc": _stamp(),
    }
    FITTED_FILE.parent.mkdir(parents=True, exist_ok=True)
    FITTED_FILE.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    log(f"written {FITTED_FILE.name} in {doc['seconds']} s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
