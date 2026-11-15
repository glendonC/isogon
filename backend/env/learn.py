"""Fit the learned player of the next-look environment: where to look, and when.

  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.env.learn <out.json> [--workers=N]
      [--limit=N]   (a trial run on N training episodes, marked as such in its result)
  ... python3 -m backend.env.learn --record-from=<out.json>

Everything is fitted and chosen on the training episodes (`backend.env.episodes.fit_split`: the episodes that may
be played, up to 2023). The validation episodes (2024 and 2025) are not played here at all: the fitted player is
measured on them once, by `backend.env.report`. The test episodes are closed and are never played.

Where. The true reward of looking at every tile is collected at every look an evenly spread budget is spent on:
first along a mixed behaviour (the best tile half the time, the least sure tile a quarter, a random tile a
quarter), then along the fitted policy's own choices. Tile weights are fitted by ridge regression to each tile's
reward divided by the largest reward of its decision.

When. With no look taken, the reward the least sure tile would pay is collected at every look of every training
episode. Look weights are fitted by ridge regression to that reward as a share of the episode's best look, on
features centred within their episode, so the score learns which looks of a round are the good ones and not which
rounds are large. The player then takes one look in each of as many equal stretches of the episode as it has
looks, where its look score is in the top share of what the stretch has shown so far
(`backend.env.agents.StretchClock`). Looks taken close together repeat each other, so the stretches keep the looks
spread as the evenly spread looks are.

Choosing without the validation episodes. The training fires are split into folds by region and year. Each ridge
strength is chosen by fitting on four folds and judging on the fifth: for the tile weights by the reward of the
tile picked, for the look weights by the sum of the rewards of the looks picked. The look score uses only the look
features that help on fires it was not fitted on: starting from none, the feature that raises that held-out sum
most is added, until the best addition no longer raises it by one percent of the evenly spread figure
(`select_look_features`). The look score with every feature fitted at once was the first form tried; it is still
fitted and played so that its result stays on record, and it is not in use. Whether the when part is used at all
is decided by playing every training episode with weights fitted without its fold, the features selected again
without that fold, once with the evenly spread looks and once with the look score: it is used when the paired
difference lies above zero at 90 percent.

The result is written to the path given. `--record-from` writes a result into the tracked file as its `policy`,
keeping the policy it replaces as `policy_first` beside the tables that were played with it.
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
from backend.env.agents import (
    ExpectedNewAgent,
    FreeWhenUnsureAgent,
    LatestModisAgent,
    LeastSureAgent,
    NightLeastSureAgent,
    OracleAgent,
    RandomAgent,
    SharpLeastSureAgent,
    WhenUnsureAgent,
    run_episode,
    spend_now,
    stretch_of,
    top_share_rule,
)
from backend.env.episodes import TRAIN_LAST_YEAR, EnvEpisode, catalogue, fit_split, may_be_played
from backend.env.next_look import NO_LOOK, REWARD, NextLookEnv
from backend.env.policy import (
    FEATURE_NAMES,
    FEATURES,
    FITTED_FILE,
    LOOK_FEATURE_NAMES,
    LOOK_FEATURES,
    LearnedPlayer,
    LinearPolicyAgent,
    fit_ridge,
    load_fitted,
    look_features,
    tile_features,
)
from backend.env.terrain import context_elevation
from backend.eval.grid import EvalGrid
from backend.model.occupancy import OccupancyParams

TILES: int = 4
BUDGET: int = 4
FOLDS: int = 5
RIDGE_GRID: tuple[float, ...] = (0.01, 0.1, 1.0, 10.0)
LOOK_RIDGE_GRID: tuple[float, ...] = (1.0, 10.0, 100.0, 1000.0)
SELECT_RIDGE: float = 10.0            # the ridge strength used while look features are being selected
SELECT_MIN_STEP: float = 0.01         # a look feature is kept only if it raises the held-out figure by this share of the evenly spread one

_CONTEXT: dict[str, tuple[float, float, float, float]] = {}


def _context_box(region_id: str) -> tuple[float, float, float, float]:
    if region_id not in _CONTEXT:
        from backend.firms import region_box

        _CONTEXT[region_id] = region_box(region_id)
    return _CONTEXT[region_id]


def make_env(ep: EnvEpisode, params: dict[str, Any], env_kw: dict[str, Any], tiles: int = TILES, budget: int = BUDGET) -> NextLookEnv:
    """The round of an episode. An episode that carries its own settings (`env_kw`, as a place of the fresh test
    does: its own pass list) is played with them and with no terrain, since such a place has no terrain pack."""
    own = getattr(ep, "env_kw", None)
    if own is not None:
        return NextLookEnv(ep.det, ep.box, (ep.window.start_s, ep.window.end_s), tiles=(tiles, tiles), budget=budget,
                           params=OccupancyParams(**params), terrain_m=None, **{**env_kw, **own})
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
    if kind == "expected_new":
        return ExpectedNewAgent()
    if kind == "least_sure_at_night":
        return NightLeastSureAgent()
    if kind == "least_sure_when_unsure":
        return WhenUnsureAgent()
    if kind == "least_sure_when_sharp":
        return SharpLeastSureAgent()
    if kind == "least_sure_looking_freely":
        return FreeWhenUnsureAgent()
    if kind == "oracle":
        return OracleAgent()
    if kind == "linear":
        return LinearPolicyAgent(list(spec[1]))
    if kind == "learned":                                   # (tile weights, look weights or None, look scales or None)
        return LearnedPlayer(list(spec[1]), None if spec[2] is None else list(spec[2]), None if spec[3] is None else list(spec[3]))
    raise ValueError(kind)


def _rollout(job: tuple[EnvEpisode, dict[str, Any], dict[str, Any], tuple[Any, ...]]) -> dict[str, Any]:
    ep, params, env_kw, spec = job
    if not may_be_played(ep):
        raise ValueError(f"{ep.key} may not be played: the test of the three 2021 fires is closed")
    env = make_env(ep, params, env_kw)
    r = run_episode(env, _agent(spec), seed=int(spec[1]) if spec[0] == "random" else 0)
    return {"episode": ep.key, "agent": spec[0], "gain": r["return"], "start": r["score_start"], "final": r["score_end"],
            "looks": [k for k, a in enumerate(r["actions"]) if a != NO_LOOK]}


def _collect(job: tuple[EnvEpisode, dict[str, Any], dict[str, Any], tuple[Any, ...], int]) -> list[tuple[np.ndarray, np.ndarray]]:
    """Features and true rewards of every tile at every look an evenly spread budget is spent on, along a behaviour."""
    ep, params, env_kw, behaviour, seed = job
    if not may_be_played(ep):
        raise ValueError(f"{ep.key} may not be played: the test of the three 2021 fires is closed")
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
            feats = tile_features(obs)
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


def _collect_looks(job: tuple[EnvEpisode, dict[str, Any], dict[str, Any]]) -> tuple[np.ndarray, np.ndarray]:
    """For every look of one episode, with no look ever taken: the look's features, and the reward the least sure
    tile would pay if the round's first look were spent there."""
    ep, params, env_kw = job
    if not may_be_played(ep):
        raise ValueError(f"{ep.key} may not be played: the test of the three 2021 fires is closed")
    env = make_env(ep, params, env_kw)
    obs = env.reset(0)
    least_sure = LeastSureAgent()
    feats, values = [], []
    done = env.n_looks == 0
    while not done:
        assert obs is not None
        feats.append(look_features(obs))
        values.append(float(env.peek(least_sure.choose(obs))))
        obs, _, done, _ = env.step(NO_LOOK)
    return np.array(feats).reshape(-1, len(LOOK_FEATURE_NAMES)), np.array(values)


def paired_bootstrap(a: list[float], b: list[float], n_boot: int = 4000, seed: int = 20261114) -> dict[str, float]:
    """Mean of a minus b over episodes, with the 90 percent interval from resampling episodes with replacement."""
    d = np.asarray(a, dtype=np.float64) - np.asarray(b, dtype=np.float64)
    rng = np.random.default_rng(seed)
    means = d[rng.integers(0, d.size, size=(n_boot, d.size))].mean(axis=1)
    return {"mean_difference": float(d.mean()), "p05": float(np.percentile(means, 5)), "p95": float(np.percentile(means, 95)),
            "episodes": int(d.size), "episodes_a_ahead": int((d > 0).sum()), "episodes_b_ahead": int((d < 0).sum())}


def fold_of(episodes: list[EnvEpisode], n_folds: int = FOLDS) -> list[int]:
    """The fold of every episode: fires are grouped by region and year, and the groups are dealt out in turn, so a
    fold never shares a fire season with the folds it is judged against."""
    groups = sorted({(e.region_id, e.year) for e in episodes})
    where = {g: i % n_folds for i, g in enumerate(groups)}
    return [where[(e.region_id, e.year)] for e in episodes]


# ---- where: tile weights --------------------------------------------------------------------------------------------

def tile_training_set(samples: list[list[tuple[np.ndarray, np.ndarray]]], keep: list[bool]) -> tuple[np.ndarray, np.ndarray, int]:
    """Features and targets of the decisions of the episodes kept. A tile's target is its reward over the largest
    reward of its decision; a decision where no tile gains or loses anything teaches nothing and is left out."""
    xs, ys, n = [], [], 0
    for ep_samples, use in zip(samples, keep):
        if not use:
            continue
        for feats, gains in ep_samples:
            top = float(np.max(np.abs(gains)))
            if top <= 0.0:
                continue
            xs.append(feats)
            ys.append(gains / top)
            n += 1
    if not xs:
        return np.zeros((0, len(FEATURE_NAMES))), np.zeros(0), 0
    return np.vstack(xs), np.concatenate(ys), n


def one_look_reward(weights: np.ndarray, samples: list[list[tuple[np.ndarray, np.ndarray]]], keep: list[bool]) -> tuple[float, float, int]:
    """(mean reward of the tile the weights pick, mean reward of the best tile, decisions) over the episodes kept."""
    got, best = [], []
    for ep_samples, use in zip(samples, keep):
        if not use:
            continue
        for feats, gains in ep_samples:
            got.append(float(gains[int(np.argmax(feats @ weights))]))
            best.append(float(gains.max()))
    return (float(np.mean(got)) if got else 0.0, float(np.mean(best)) if best else 0.0, len(got))


def choose_tile_ridge(samples: list[list[tuple[np.ndarray, np.ndarray]]], folds: list[int], grid: tuple[float, ...] = RIDGE_GRID) -> list[dict[str, Any]]:
    """For every ridge strength: the one-look reward on each fold of weights fitted on the other folds."""
    out = []
    for lam in grid:
        got, best, n = 0.0, 0.0, 0
        for f in sorted(set(folds)):
            x, y, _ = tile_training_set(samples, [k != f for k in folds])
            if x.shape[0] == 0:
                continue
            g, b, m = one_look_reward(fit_ridge(x, y, lam), samples, [k == f for k in folds])
            got, best, n = got + g * m, best + b * m, n + m
        out.append({"ridge": lam, "one_look_reward": got / max(n, 1), "share_of_best_tile": (got / best) if best > 0 else None, "decisions": n})
    return out


# ---- when: look weights ---------------------------------------------------------------------------------------------

def look_training_set(looks: list[tuple[np.ndarray, np.ndarray]], keep: list[bool]) -> tuple[np.ndarray, np.ndarray]:
    """Look features and targets of the episodes kept, both centred within their episode. A look's target is its
    reward over the largest reward of its episode."""
    xs, ys = [], []
    for (feats, values), use in zip(looks, keep):
        if not use or values.size < 2:
            continue
        top = float(values.max())
        y = values / top if top > 0 else np.zeros_like(values)
        xs.append(feats - feats.mean(axis=0))
        ys.append(y - y.mean())
    if not xs:
        return np.zeros((0, len(LOOK_FEATURE_NAMES))), np.zeros(0)
    return np.vstack(xs), np.concatenate(ys)


def fit_look_weights(looks: list[tuple[np.ndarray, np.ndarray]], keep: list[bool], strength: float,
                     cols: list[int] | None = None) -> tuple[np.ndarray, np.ndarray]:
    """(weights, scales): ridge on features divided by their spread within an episode, so one strength suits all.
    With `cols` only those features are fitted and every other weight is zero."""
    x, y = look_training_set(looks, keep)
    scales = x.std(axis=0) if x.shape[0] else np.ones(len(LOOK_FEATURE_NAMES))
    scales = np.where(scales > 0, scales, 1.0)
    weights = np.zeros(len(LOOK_FEATURE_NAMES))
    use = list(range(len(LOOK_FEATURE_NAMES))) if cols is None else list(cols)
    if x.shape[0] and use:
        weights[use] = fit_ridge(x[:, use] / scales[use], y, strength)
    return weights, scales


def looks_picked(scores: np.ndarray, budget: int) -> list[int]:
    """The looks the stretch rule picks from a round's look scores: one in each stretch, the first whose score is
    in the top share of what its stretch has shown so far, else the stretch's last (`backend.env.agents.StretchClock`)."""
    n = len(scores)
    out: list[int] = []
    for s in sorted({stretch_of(k, n, budget) for k in range(n)}):
        idx = [k for k in range(n) if stretch_of(k, n, budget) == s]
        seen: list[float] = []
        for j, k in enumerate(idx):
            seen.append(float(scores[k]))
            if top_share_rule(float(scores[k]), seen, 1, len(idx) - j)[0]:
                out.append(k)
                break
    return out


def evenly_spread(n_looks: int, budget: int) -> list[int]:
    return [k for k in range(n_looks) if spend_now(k, n_looks, budget)]


def held_out_look_figure(looks: list[tuple[np.ndarray, np.ndarray]], folds: list[int], strength: float,
                         cols: list[int] | None = None, budget: int = BUDGET) -> tuple[list[float], list[float]]:
    """Per episode: the sum of the first-look rewards of the looks picked by a look score fitted without the
    episode's fold, and the same sum for the evenly spread looks. Looks in different stretches are taken not to
    change what the others pay, so this ranks look scores and is not a round's gain."""
    picked, even = [], []
    for f in sorted(set(folds)):
        w, scales = fit_look_weights(looks, [k != f for k in folds], strength, cols)
        for (feats, values), k in zip(looks, folds):
            if k != f or values.size == 0:
                continue
            picked.append(float(values[looks_picked(feats / scales @ w, budget)].sum()))
            even.append(float(values[evenly_spread(values.size, budget)].sum()))
    return picked, even


def choose_look_ridge(looks: list[tuple[np.ndarray, np.ndarray]], folds: list[int], budget: int = BUDGET,
                      grid: tuple[float, ...] = LOOK_RIDGE_GRID, cols: list[int] | None = None) -> list[dict[str, Any]]:
    """For every ridge strength: the held-out figure of `held_out_look_figure` and its difference from the evenly
    spread looks."""
    out = []
    for lam in grid:
        picked, even = held_out_look_figure(looks, folds, lam, cols, budget)
        out.append({"ridge": lam, "sum_of_first_look_rewards": float(np.mean(picked)) if picked else 0.0,
                    "evenly_spread": float(np.mean(even)) if even else 0.0,
                    "difference": paired_bootstrap(picked, even) if picked else None})
    return out


def select_look_features(looks: list[tuple[np.ndarray, np.ndarray]], folds: list[int], budget: int = BUDGET,
                         strength: float = SELECT_RIDGE, min_step: float = SELECT_MIN_STEP) -> tuple[list[int], list[dict[str, Any]]]:
    """Which look features the look score uses: (their columns, the steps taken).

    Forward selection with fires held out. Starting from no feature, the feature is added that raises the
    held-out figure most, and the selection stops when the best addition raises it by less than `min_step` times
    the evenly spread figure. A feature that does not help on fires the score was not fitted on is left out, so
    the score cannot be diluted by quantities that only look related to a look's worth.
    """
    _, even = held_out_look_figure(looks, folds, strength, [], budget)
    base = float(np.mean(even)) if even else 0.0
    chosen: list[int] = []
    best = base
    steps: list[dict[str, Any]] = []
    while len(chosen) < len(LOOK_FEATURE_NAMES):
        trials = []
        for j in range(len(LOOK_FEATURE_NAMES)):
            if j not in chosen:
                picked, _ = held_out_look_figure(looks, folds, strength, chosen + [j], budget)
                trials.append((float(np.mean(picked)) if picked else 0.0, j))
        top, j = max(trials)
        if top - best < min_step * abs(base):
            steps.append({"feature": LOOK_FEATURE_NAMES[j], "sum_of_first_look_rewards": top, "raised_it_by": top - best,
                          "kept": False, "why": f"the best addition left raises the held-out figure by less than {min_step:g} of the evenly spread figure"})
            break
        chosen.append(j)
        steps.append({"feature": LOOK_FEATURE_NAMES[j], "sum_of_first_look_rewards": top, "raised_it_by": top - best, "kept": True})
        best = top
    return chosen, steps


def _mean_gain(rows: list[dict[str, Any]]) -> float:
    return float(np.mean([r["gain"] for r in rows])) if rows else 0.0


def _stamp() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# What the blocks of the tracked file are, written into it as `layout`: the file's first keys describe the first
# fit, and a reader must not take them for the policy in use.
LAYOUT: dict[str, str] = {
    "policy": "the learned player in use",
    "policy_fit": "the fit that made it: its setting, its episodes and the reconstruction values it played with",
    "validation_reference": (
        "every reference player under the reward in use, on the validation episodes, with the looks the environment "
        "takes by default"
    ),
    "validation_reference_on_nominal_looks": (
        "the same on nominal looks, measured before the pass list became the default, with the first policy as the learned player"
    ),
    "policy_first": "the first learned policy, not in use: the weights the tables on record were played with",
    "rewards": "the reward in use, the first reward, and which tables were measured under the first",
    "known_limits, setting, episodes, reconstruction_parameters, protocol, seconds, generated_utc": (
        "the first fit, the one that made policy_first: they say how the tables on record were played, not how the "
        "policy in use was fitted"
    ),
    "learn_from_looks": "a variant tried under the first reward and not adopted",
}


def record(result_path: str) -> None:
    """Write a result of this tool into the tracked file as its `policy`. The policy it replaces is kept as
    `policy_first`, beside the tables on record that were played with it; `layout` says what each block is; nothing
    else in the file is touched."""
    with open(result_path, encoding="utf-8") as fh:
        result = json.load(fh)
    tracked = load_fitted() or {}
    first = tracked.get("policy_first")
    if first is None and "policy" in tracked:
        first = {
            "note": (
                "the first learned policy: fitted under protocol version 1, with the earlier reconstruction values "
                "and with the first reward as its target. The tables on record (test, test_protocol_2 and the two "
                "beside it) were played with these weights. It is not in use."
            ),
            "protocol": tracked.get("protocol"),
            "reconstruction_parameters": tracked.get("reconstruction_parameters"),
            **tracked["policy"],
        }
    new = {"policy": result["policy"], "policy_fit": {k: v for k, v in result.items() if k != "policy"}}
    if first is not None:
        new["policy_first"] = first
    out: dict[str, Any] = {}
    for key, value in tracked.items():
        if key == "policy":
            out.update(new)
        elif key not in new and key != "layout":
            out[key] = value
        if key == "what":
            out["layout"] = dict(LAYOUT)                 # right after the file's first line
    out.update({k: v for k, v in new.items() if k not in out})
    out.setdefault("layout", dict(LAYOUT))
    FITTED_FILE.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(f"recorded {result_path} as the policy in {FITTED_FILE.name}")


def fit_player(train: list[Any], params: dict[str, Any], env_kw: dict[str, Any], workers: int, log: Any,
               t0: float, episodes_doc: dict[str, Any], trial: str | None = None) -> dict[str, Any]:
    """The fit of the learned player on the episodes given, as the module's docstring says: where, then when, then
    whether the when part is used, all chosen with folds of the episodes given. `episodes_doc` says what the
    episodes are beside their number."""
    folds = fold_of(train)
    pool = ProcessPoolExecutor(max_workers=workers)
    probe = make_env(train[0], params, env_kw)
    schedule = probe.describe()["looks"]["source"]
    log(f"looks from: {schedule} (first training episode: {probe.n_looks} looks)")

    # ---- where ---------------------------------------------------------------------------------------------------
    samples0 = list(pool.map(_collect, [(e, params, env_kw, ("mix",), i) for i, e in enumerate(train)]))
    cv0 = choose_tile_ridge(samples0, folds)
    lam0 = max(cv0, key=lambda c: c["one_look_reward"])["ridge"]
    x0, y0, d0 = tile_training_set(samples0, [True] * len(train))
    w0 = fit_ridge(x0, y0, lam0)
    log(f"where, round 0: {d0} decisions along the mixed behaviour; ridge {lam0:g} chosen with fires held out")
    samples1 = list(pool.map(_collect, [(e, params, env_kw, ("linear", [float(v) for v in w0]), i) for i, e in enumerate(train)]))
    both = [a + b for a, b in zip(samples0, samples1)]
    cv = choose_tile_ridge(both, folds)
    for c in cv:
        log(f"  tile ridge {c['ridge']:g}: one-look reward on held-out fires {c['one_look_reward']:+.5f}, {c['share_of_best_tile']:.3f} of the best tile")
    lam = max(cv, key=lambda c: c["one_look_reward"])["ridge"]
    x, y, d = tile_training_set(both, [True] * len(train))
    weights = fit_ridge(x, y, lam)
    # the same held-out judgement for the single rules, on the same decisions
    least = np.zeros(len(FEATURE_NAMES))
    least[FEATURE_NAMES.index("unsure")] = 1.0
    ls_reward, best_reward, n_dec = one_look_reward(least, both, [True] * len(train))
    log(f"where: {d} decisions in two rounds; ridge {lam:g}; least sure on the same decisions {ls_reward:+.5f} ({ls_reward / best_reward:.3f} of the best tile)")

    # ---- when ----------------------------------------------------------------------------------------------------
    looks = list(pool.map(_collect_looks, [(e, params, env_kw) for e in train]))
    # the dense form of the look score, every look feature at once: fitted, judged below and kept on record
    cv_dense = choose_look_ridge(looks, folds)
    for c in cv_dense:
        b = c["difference"]
        log(f"  every look feature, ridge {c['ridge']:g}: picked {c['sum_of_first_look_rewards']:+.5f} against evenly spread "
            f"{c['evenly_spread']:+.5f} ({b['mean_difference']:+.5f}, {b['p05']:+.5f} to {b['p95']:+.5f})")
    lam_dense = max(cv_dense, key=lambda c: c["sum_of_first_look_rewards"])["ridge"]
    # the form in use: only the look features that help on fires held out
    cols, steps = select_look_features(looks, folds)
    for s in steps:
        log(f"  look feature {s['feature']}: held-out figure {s['sum_of_first_look_rewards']:+.5f}, raised by {s['raised_it_by']:+.5f}, "
            f"{'kept' if s['kept'] else 'left out'}")
    cv_look = choose_look_ridge(looks, folds, cols=cols) if cols else []
    lam_look = max(cv_look, key=lambda c: c["sum_of_first_look_rewards"])["ridge"] if cv_look else SELECT_RIDGE
    look_w, look_scales = fit_look_weights(looks, [True] * len(train), lam_look, cols)

    # ---- is the when part used? every training episode played with weights fitted without its fold. The look
    # features are selected again without that fold, from the folds that remain, so the held-out episodes choose
    # nothing about the score they are played with ----------------------------------------------------------------
    jobs: list[tuple[EnvEpisode, dict[str, Any], dict[str, Any], tuple[Any, ...]]] = []
    selected_without: dict[str, list[str]] = {}
    for f in sorted(set(folds)):
        keep = [k != f for k in folds]
        rest = [i for i, k in enumerate(folds) if k != f]
        cols_f, _ = select_look_features([looks[i] for i in rest], fold_of([train[i] for i in rest]))
        selected_without[str(f)] = [LOOK_FEATURE_NAMES[j] for j in cols_f]
        xf, yf, _ = tile_training_set(both, keep)
        wf = [float(v) for v in fit_ridge(xf, yf, lam)]
        lw, ls = fit_look_weights(looks, keep, SELECT_RIDGE, cols_f)
        dw, ds = fit_look_weights(looks, keep, lam_dense)
        with_when = ("learned", wf, [float(v) for v in lw], [float(v) for v in ls]) if cols_f else ("learned", wf, None, None)
        for e, k in zip(train, folds):
            if k == f:
                jobs += [(e, params, env_kw, ("learned", wf, None, None)),
                         (e, params, env_kw, with_when),
                         (e, params, env_kw, ("learned", wf, [float(v) for v in dw], [float(v) for v in ds])),
                         (e, params, env_kw, ("least_sure",)), (e, params, env_kw, ("least_sure_at_night",)),
                         (e, params, env_kw, ("least_sure_when_unsure",)), (e, params, env_kw, ("least_sure_when_sharp",)),
                         (e, params, env_kw, ("least_sure_looking_freely",))]
    rows = list(pool.map(_rollout, jobs))
    pool.shutdown()
    names = ("learned_tiles_only", "learned_with_when", "learned_with_every_look_feature", "least_sure", "least_sure_at_night",
             "least_sure_when_unsure", "least_sure_when_sharp", "least_sure_looking_freely")
    by: dict[str, dict[str, float]] = {n: {} for n in names}
    for i, r in enumerate(rows):
        by[names[i % len(names)]][r["episode"]] = r["gain"]
    keys = [e.key for e in train]

    def col(name: str) -> list[float]:
        return [by[name][k] for k in keys]

    held_out = {n: float(np.mean(col(n))) for n in names}
    differences = {
        "learned_with_when_minus_learned_tiles_only": paired_bootstrap(col("learned_with_when"), col("learned_tiles_only")),
        "learned_with_every_look_feature_minus_learned_tiles_only": paired_bootstrap(col("learned_with_every_look_feature"), col("learned_tiles_only")),
        "learned_tiles_only_minus_least_sure": paired_bootstrap(col("learned_tiles_only"), col("least_sure")),
        "learned_with_when_minus_least_sure": paired_bootstrap(col("learned_with_when"), col("least_sure")),
        "learned_with_when_minus_least_sure_at_night": paired_bootstrap(col("learned_with_when"), col("least_sure_at_night")),
        "learned_with_when_minus_least_sure_when_unsure": paired_bootstrap(col("learned_with_when"), col("least_sure_when_unsure")),
        "learned_with_when_minus_least_sure_when_sharp": paired_bootstrap(col("learned_with_when"), col("least_sure_when_sharp")),
        "least_sure_at_night_minus_least_sure": paired_bootstrap(col("least_sure_at_night"), col("least_sure")),
        "least_sure_when_unsure_minus_least_sure": paired_bootstrap(col("least_sure_when_unsure"), col("least_sure")),
        "least_sure_when_sharp_minus_least_sure": paired_bootstrap(col("least_sure_when_sharp"), col("least_sure")),
        # why the looks are kept apart: the same signal followed with no stretches
        "least_sure_looking_freely_minus_least_sure": paired_bootstrap(col("least_sure_looking_freely"), col("least_sure")),
    }
    adopted = bool(cols) and bool(differences["learned_with_when_minus_learned_tiles_only"]["p05"] > 0.0)
    for n in names:
        log(f"  training episodes, weights fitted without their fold: {n} {held_out[n]:+.5f}")
    for k, b in differences.items():
        log(f"  {k}: {b['mean_difference']:+.5f} ({b['p05']:+.5f} to {b['p95']:+.5f}), ahead {b['episodes_a_ahead']} behind {b['episodes_b_ahead']}")
    log(f"the when part is {'used' if adopted else 'not used'}")

    doc = {
        "what": "the learned player of the next-look environment: tile weights, look weights, and how they were chosen",
        **({"trial_run": trial} if trial else {}),
        "known_limits": KNOWN_LIMITS,
        "setting": {"tiles": f"{TILES}x{TILES}", "budget": BUDGET, "score": "csi", "reward": REWARD, "looks": schedule},
        "episodes": {"train": len(train), **episodes_doc, "folds": len(set(folds)),
                     "folds_are": "fires grouped by region and year, dealt out in turn"},
        "reconstruction_parameters": params["fitted_on"],
        "policy": {
            "kind": "a linear score per tile for where to look; a linear score per look, one look per stretch of the episode, for when",
            "feature_names": list(FEATURE_NAMES),
            "features": {n: d_ for n, d_ in FEATURES},
            "weights": [float(v) for v in weights],
            "fit": "ridge regression of each tile's true reward divided by the largest reward of its decision",
            "ridge": lam,
            "fitted_with": {"reward": REWARD, "looks": schedule, "reconstruction_parameters": params["fitted_on"]},
            "training": {"episodes": len(train), "decisions": d, "tile_samples": int(y.size),
                         "behaviour_round_0": "the best tile half the time, least sure a quarter, random a quarter",
                         "behaviour_round_1": "the round 0 policy's own choices"},
            "ridge_chosen_with_fires_held_out": cv,
            "least_sure_on_the_same_decisions": {"one_look_reward": ls_reward, "share_of_best_tile": ls_reward / best_reward if best_reward > 0 else None,
                                                 "decisions": n_dec},
            "when": {
                "adopted": adopted,
                "rule": "used when, on training episodes played with weights fitted without their fold, the gain with the look score "
                        "minus the gain with the evenly spread looks lies above zero at 90 percent (episodes resampled)",
                "how": "one look in each of as many equal stretches of the episode as the budget has looks: as soon as the look score "
                       "is in the top share of what the stretch has shown so far, and at the stretch's last look if not before",
                "feature_names": list(LOOK_FEATURE_NAMES),
                "features": {n: d_ for n, d_ in LOOK_FEATURES},
                "weights": [float(v) for v in look_w],
                "scales": [float(v) for v in look_scales],
                "fit": "ridge regression, on features centred within their episode and divided by their spread, of the reward the "
                       "least sure tile would pay at each look as a share of the episode's best look; only the selected features "
                       "are fitted and every other weight is zero",
                "selected_features": [LOOK_FEATURE_NAMES[j] for j in cols],
                "selection": {
                    "how": "forward selection with fires held out: starting from no feature, the feature that raises the held-out "
                           f"figure most is added, until the best addition raises it by less than {SELECT_MIN_STEP:g} of the evenly spread "
                           "figure. The held-out figure is the sum of the first-look rewards of the looks the score picks, one per stretch",
                    "ridge_while_selecting": SELECT_RIDGE,
                    "steps": steps,
                    "selected_without_each_fold": selected_without,
                },
                "ridge": lam_look,
                "training": {"episodes": len(train), "looks": int(sum(v.size for _, v in looks))},
                "ridge_chosen_with_fires_held_out": cv_look,
                "every_look_feature_at_once": {
                    "what": "the look score with all its features fitted at once: the first form tried. It is not in use",
                    "ridge": lam_dense,
                    "ridge_chosen_with_fires_held_out": cv_dense,
                    "on_training_fires_held_out": differences["learned_with_every_look_feature_minus_learned_tiles_only"],
                },
            },
            "on_training_fires_held_out": {
                "what": "mean gain over the training episodes, each played with weights fitted without its fold",
                "mean_gain": held_out,
                "differences": differences,
            },
        },
        "seconds": round(time.time() - t0, 1),
        "generated_utc": _stamp(),
    }
    return doc


def main(argv: list[str]) -> int:
    from backend.firms import read_firms, region_box
    from backend.model.fitted import load_params
    from backend.terrain.live_region import PRESET_BY_ID

    def log(msg: str) -> None:
        print(msg, flush=True)

    measured = next((a.split("=", 1)[1] for a in argv[1:] if a.startswith("--record-from=")), None)
    if measured:
        record(measured)
        return 0
    args = [a for a in argv[1:] if not a.startswith("--")]
    if not args:
        log("give the path to write the result to")
        return 2
    out_path = args[0]
    workers = next((int(a.split("=", 1)[1]) for a in argv[1:] if a.startswith("--workers=")), max(1, min(8, (os.cpu_count() or 2) - 1)))
    limit = next((int(a.split("=", 1)[1]) for a in argv[1:] if a.startswith("--limit=")), None)
    t0 = time.time()
    episodes = catalogue(read_firms, region_box, PRESET_BY_ID)
    train, val = fit_split(episodes)
    if limit is not None:                 # a trial run on every k-th training episode; its result is not a fit
        train = train[:: max(1, len(train) // limit)][:limit]
    params = load_params().as_dict()
    env_kw: dict[str, Any] = {}
    folds = fold_of(train)
    log(f"episodes: {len(train)} train (2012 to {TRAIN_LAST_YEAR}) in {len(set(folds))} folds of fires; {len(val)} validation, not played "
        f"here; {len(episodes) - len(train) - len(val)} closed; {TILES} by {TILES} tiles, {BUDGET} looks")
    doc = fit_player(train, params, env_kw, workers, log, t0,
                     {"validation_not_played_here": len(val), "train_years": f"2012 to {TRAIN_LAST_YEAR}",
                      "test": "closed and not played"},
                     trial=f"on {len(train)} training episodes only (--limit); not a fit" if limit is not None else None)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(doc, indent=1) + "\n")
    log(f"written {out_path} in {doc['seconds']} s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
