"""The reference table of the next-look environment, on the validation episodes.

  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.env.report <out.json> [--record]
      [--schedule=nominal|cmr|auto] [--workers=N]
  ... python3 -m backend.env.report --record-from=<out.json>

Builds the catalogue, keeps the episodes that may be played (`backend.env.episodes.may_be_played`: never a test
episode), and plays every reference player on the validation episodes for several tile splits and budgets, with
the looks the environment takes by default (the pass list where it is cached). `--record` also writes the table
into the tracked file (`validation_reference` in backend/env/fitted/next_look.json); `--record-from` writes there
a table this tool measured earlier, and plays nothing. The learned player is the tracked one, played as recorded:
the validation episodes choose nothing about it.

What the table separates. Episodes are framed around a fire, so a player that reads nothing can still gain by
looking near where fires tend to lie in the box. The table therefore lists `random`, every constant tile and the
centre tiles beside the players that read the observation. Two constant tiles are named: the one that gains most on
the training episodes, which is a player anyone could have fielded, and the one that gains most on the validation
episodes themselves, which is hindsight and an upper bound on geometry. A player shows skill by what it gains
beyond them.

Where and when. Most players spend the budget on the same evenly spread looks and differ only in the tile. Some
choose when to look as well: least sure on night passes, least sure when the model is most unsure, least sure at
a sharp pass of each stretch, and the learned player when its look score is in use. So that a gain from choosing
when is not read as a gain from choosing where, the learned player's tile choice is also listed on the evenly
spread looks, and the three simple rules for when stand beside it. The oracle sees the answer and chooses where at
the evenly spread looks. It does not choose when, so a player that does can gain more than it, and no row of the
table is given as a share of it.
"""

from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
import json
import os
import sys
import time
from typing import Any

import numpy as np

from backend.env import KNOWN_LIMITS
from backend.env.agents import ConstantTileAgent, reference_agents, run_episode
from backend.env.episodes import EnvEpisode, catalogue, fit_split, may_be_played
from backend.env.learn import make_env, paired_bootstrap
from backend.env.next_look import REWARD, NextLookEnv
from backend.env.policy import FITTED_FILE, load_fitted, policy_from

SETTINGS: tuple[tuple[int, int], ...] = ((4, 4), (3, 4), (6, 4), (4, 2), (4, 8))     # (tiles per side, budget)
MAIN_SETTING: tuple[int, int] = (4, 4)
RANDOM_SEEDS: int = 10
SCHEDULE: str = "auto"               # the environment's default: the pass list where it is cached
# the players a table row is written for, beside the constant tiles
NAMED: tuple[str, ...] = ("random", "centre", "latest_modis", "least_sure", "expected_new", "least_sure_at_night",
                          "least_sure_when_unsure", "least_sure_when_sharp", "learned_tiles_only", "learned", "oracle")
# the players that choose when to look; every other player spends on the evenly spread looks
CHOOSE_WHEN: tuple[str, ...] = ("least_sure_at_night", "least_sure_when_unsure", "least_sure_when_sharp")


def _env(ep: EnvEpisode, n_side: int, budget: int, pdict: dict[str, Any], score: str, schedule: str) -> NextLookEnv:
    if not may_be_played(ep):
        raise ValueError(f"{ep.key} may not be played: the test of the three 2021 fires is closed")
    return make_env(ep, pdict, {"score": score, "schedule": schedule}, tiles=n_side, budget=budget)


def learned_players(policy: dict[str, Any] | None) -> list[Any]:
    """The learned player a `policy` block describes, as the tables list it. When its look score is in use the
    same tile weights with the evenly spread looks are listed too, as `learned_tiles_only`, so that what the
    player gains by choosing when is not read as a gain from choosing where."""
    if policy is None:
        return []
    player = policy_from(policy)
    if getattr(player, "looks_now", None) is None:
        return [player]
    tiles_only = policy_from(policy, tiles_only=True)
    tiles_only.name = "learned_tiles_only"
    return [tiles_only, player]


def _play(job: tuple[EnvEpisode, int, int, dict[str, Any], int, str, str, dict[str, Any] | None, bool]) -> dict[str, Any]:
    """Every reference player on one episode and setting. `constant_only` plays the constant tiles alone."""
    ep, n_side, budget, pdict, seeds, score, schedule, policy, constant_only = job
    env = _env(ep, n_side, budget, pdict, score, schedule)
    out: dict[str, Any] = {"episode": ep.key, "tiles": n_side, "budget": budget, "looks": env.n_looks, "players": {},
                           "schedule": env.describe()["looks"]["source"]}
    if constant_only:
        agents: list[Any] = [ConstantTileAgent(t) for t in range(n_side * n_side)]
    else:
        agents = reference_agents((n_side, n_side), random_seeds=seeds)
        agents[-1:-1] = learned_players(policy)                       # before the oracle, which is last
    n_random = 0
    for agent in agents:
        seed = 0
        if agent.name == "random":
            seed, n_random = n_random, n_random + 1
        r = run_episode(env, agent, seed=seed)
        out["score_start"] = float(r["score_start"])
        row = out["players"].setdefault(agent.name, {"gains": [], "finals": [], "taught_elsewhere": [], "pixels": [], "empty_looks": []})
        row["gains"].append(float(r["return"]))
        row["finals"].append(float(r["score_end"]))
        row["taught_elsewhere"].append(float(r["taught_elsewhere"]))
        row["pixels"].append(int(sum(r["revealed_pixels"])))
        row["empty_looks"].append(int(sum(1 for p in r["revealed_pixels"] if p == 0)))
    return out


# What a table says of the player that reads the hidden rows.
SEES_THE_ANSWER: str = (
    "it sees the answer: at each of the evenly spread looks it takes the tile with the largest true reward. It is "
    "greedy and it chooses where, not when. A player that also chooses when can gain more than it, so no player is "
    "measured as a share of it"
)


def _row(rs: list[dict[str, Any]], name: str) -> dict[str, Any]:
    """One table row: the mean over episodes (and seeds), and the spread over episodes."""
    per_ep = np.array([np.mean(r["players"][name]["gains"]) for r in rs])
    per_seed = np.mean(np.array([r["players"][name]["gains"] for r in rs]), axis=0)
    gain = float(per_ep.mean())
    return {
        "mean_gain": round(gain, 4),
        "mean_final_score": round(float(np.mean([np.mean(r["players"][name]["finals"]) for r in rs])), 4),
        "sd_across_episodes": round(float(per_ep.std(ddof=1)), 4) if per_ep.size > 1 else None,
        "least_and_most_over_episodes": [round(float(per_ep.min()), 4), round(float(per_ep.max()), 4)],
        "episodes_with_a_gain": int((per_ep > 0).sum()),
        "sd_of_mean_gain_across_seeds": round(float(per_seed.std(ddof=1)), 4) if per_seed.size > 1 else None,
        "mean_gain_on_cells_never_shown": round(float(np.mean([np.mean(r["players"][name]["taught_elsewhere"]) for r in rs])), 4),
        "mean_pixels_revealed": round(float(np.mean([np.mean(r["players"][name]["pixels"]) for r in rs])), 1),
        "share_of_looks_that_revealed_nothing": round(
            float(np.sum([np.sum(r["players"][name]["empty_looks"]) for r in rs]))
            / max(float(sum(len(r["players"][name]["gains"]) * min(r["budget"], r["looks"]) for r in rs)), 1.0), 3),
    }


def _per_episode(rs: list[dict[str, Any]], name: str) -> list[float]:
    return [float(np.mean(r["players"][name]["gains"])) for r in rs]


def reference_table(
    episodes: list[EnvEpisode], params: Any, settings: tuple[tuple[int, int], ...] = SETTINGS,
    seeds: int = RANDOM_SEEDS, score: str = "csi", schedule: str = SCHEDULE, workers: int | None = None,
    policy: dict[str, Any] | None = None, train_episodes: list[EnvEpisode] | None = None, log: Any = print,
) -> dict[str, Any]:
    """Play every reference player on every episode for every setting; one block per setting.

    `policy` is a `policy` block of the tracked file (`backend.env.policy.policy_from`); the learned player it
    describes is listed as `learned`. `train_episodes`, when given, are played with the constant tiles only and in
    the first setting only, to name the constant tile a player could have chosen without the episodes of the table.
    """
    pdict = params.as_dict()
    n_workers = workers or max(1, min(8, (os.cpu_count() or 2) - 1))
    jobs = [(ep, n, b, pdict, seeds, score, schedule, policy, False) for (n, b) in settings for ep in episodes]
    train_jobs = [(ep, n, b, pdict, seeds, score, schedule, None, True) for (n, b) in settings[:1] for ep in (train_episodes or [])]
    if workers == 0:                      # in this process, for tests
        results, train_results = [_play(j) for j in jobs], [_play(j) for j in train_jobs]
    else:
        with ProcessPoolExecutor(max_workers=n_workers) as pool:
            results = list(pool.map(_play, jobs))
            train_results = list(pool.map(_play, train_jobs))
    blocks: list[dict[str, Any]] = []
    for n, b in settings:
        rs = [r for r in results if r["tiles"] == n and r["budget"] == b and r["looks"] > 0]
        ts = [r for r in train_results if r["tiles"] == n and r["budget"] == b and r["looks"] > 0]
        constants = [f"constant_{t}" for t in range(n * n)]
        by_tile = [round(float(np.mean(_per_episode(rs, c))), 4) for c in constants]
        hindsight = int(np.argmax(by_tile))
        agents: dict[str, Any] = {}
        for name in NAMED:
            if name in rs[0]["players"]:
                agents[name] = _row(rs, name)
        agents["constant_best_in_hindsight"] = {"tile": hindsight, **_row(rs, constants[hindsight])}
        chosen: int | None = None
        if ts:
            train_by_tile = [float(np.mean(_per_episode(ts, c))) for c in constants]
            chosen = int(np.argmax(train_by_tile))
            agents["constant_best_on_training"] = {
                "tile": chosen, "training_episodes": len(ts), "mean_gain_on_training": round(train_by_tile[chosen], 4),
                **_row(rs, constants[chosen]),
            }
        pairs = [("least_sure", "random"), ("least_sure", "centre"), ("least_sure", constants[hindsight]),
                 ("least_sure", "latest_modis"), ("latest_modis", "random"), ("oracle", "least_sure"),
                 ("expected_new", "least_sure"), ("expected_new", "random")]
        labels = ["least_sure_minus_random", "least_sure_minus_centre", "least_sure_minus_constant_best_in_hindsight",
                  "least_sure_minus_latest_modis", "latest_modis_minus_random", "oracle_minus_least_sure",
                  "expected_new_minus_least_sure", "expected_new_minus_random"]
        if chosen is not None:
            pairs.append(("least_sure", constants[chosen]))
            labels.append("least_sure_minus_constant_best_on_training")
        for timed in CHOOSE_WHEN:
            if timed in agents:
                pairs.append((timed, "least_sure"))
                labels.append(f"{timed}_minus_least_sure")
        if "learned" in agents:
            pairs += [("learned", "least_sure"), ("learned", "random"), ("oracle", "learned"),
                      ("learned", "latest_modis"), ("learned", constants[hindsight])]
            labels += ["learned_minus_least_sure", "learned_minus_random", "oracle_minus_learned",
                       "learned_minus_latest_modis", "learned_minus_constant_best_in_hindsight"]
            if chosen is not None:
                pairs.append(("learned", constants[chosen]))
                labels.append("learned_minus_constant_best_on_training")
        if "learned_tiles_only" in agents:
            # the learned player chooses when to look: what that adds to its own tile choice, and how it stands
            # against the simple rules for when
            pairs += [("learned", "learned_tiles_only"), ("learned_tiles_only", "least_sure")]
            labels += ["learned_minus_learned_tiles_only", "learned_tiles_only_minus_least_sure"]
            for timed in CHOOSE_WHEN:
                if timed in agents:
                    pairs.append(("learned", timed))
                    labels.append(f"learned_minus_{timed}")
        block = {
            "tiles": f"{n}x{n}", "budget": b, "episodes": len(rs),
            "looks_from": sorted({r["schedule"] for r in rs}),
            "mean_start_score": round(float(np.mean([r["score_start"] for r in rs])), 4),
            "looks_per_episode": [int(min(r["looks"] for r in rs)), int(np.median([r["looks"] for r in rs])), int(max(r["looks"] for r in rs))],
            "agents": agents,
            "constant_tiles_mean_gain": by_tile,
            "differences": {label: paired_bootstrap(_per_episode(rs, a), _per_episode(rs, c)) for label, (a, c) in zip(labels, pairs)},
            "per_episode": {"episode": [r["episode"] for r in rs], "start": [round(r["score_start"], 5) for r in rs],
                            **{name: [round(v, 5) for v in _per_episode(rs, name)] for name in NAMED if name in rs[0]["players"]},
                            "constant_tiles": {c: [round(v, 5) for v in _per_episode(rs, c)] for c in constants}},
            "random_mean_gain_by_seed": [round(float(v), 4) for v in np.mean(np.array([r["players"]["random"]["gains"] for r in rs]), axis=0)],
        }
        blocks.append(block)
        log(f"{n}x{n} budget {b} ({len(rs)} episodes): " + "  ".join(f"{a} {x['mean_gain']:+.4f}" for a, x in agents.items()))
    return {"score": score, "schedule": schedule, "random_seeds": seeds, "reward": REWARD, "settings": blocks}


def plainly(block: dict[str, Any]) -> list[str]:
    """What the main setting's intervals allow to be said, one sentence each."""
    d = block["differences"]

    def verdict(key: str, a: str, b: str) -> str | None:
        x = d.get(key)
        if x is None:
            return None
        how = (f"{x['mean_difference']:+.4f}, 90 percent interval {x['p05']:+.4f} to {x['p95']:+.4f}, "
               f"ahead on {x['episodes_a_ahead']} of {x['episodes']} episodes")
        if x["p05"] > 0:
            return f"{a} gains more than {b} by more than the noise ({how})"
        if x["p95"] < 0:
            return f"{a} gains less than {b} by more than the noise ({how})"
        return f"{a} does not differ from {b} by more than the noise ({how})"

    said = [
        verdict("least_sure_minus_random", "least sure", "random"),
        verdict("least_sure_minus_constant_best_on_training", "least sure", "the constant tile chosen on the training episodes"),
        verdict("least_sure_minus_constant_best_in_hindsight", "least sure", "the best constant tile in hindsight"),
        verdict("expected_new_minus_least_sure", "the most expected new detections", "least sure"),
        verdict("learned_minus_least_sure", "the learned player", "least sure"),
        verdict("learned_tiles_only_minus_least_sure", "the learned tile choice on the evenly spread looks", "least sure"),
        verdict("learned_minus_learned_tiles_only", "the learned player choosing when to look", "the same tile choice on the evenly spread looks"),
        verdict("least_sure_when_sharp_minus_least_sure", "least sure at a sharp pass of each stretch", "least sure on the evenly spread looks"),
        verdict("least_sure_when_unsure_minus_least_sure", "least sure where the model is most unsure in each stretch", "least sure on the evenly spread looks"),
        verdict("least_sure_at_night_minus_least_sure", "least sure on night passes", "least sure on the evenly spread looks"),
        verdict("learned_minus_least_sure_when_sharp", "the learned player", "least sure at a sharp pass of each stretch"),
        verdict("oracle_minus_least_sure", "the player that sees the answer, on the evenly spread looks,", "least sure"),
        verdict("learned_minus_latest_modis", "the learned player", "latest MODIS"),
        verdict("learned_minus_random", "the learned player", "random"),
        verdict("learned_minus_constant_best_in_hindsight", "the learned player", "the best constant tile in hindsight"),
    ]
    return [s for s in said if s]


def format_table(ref: dict[str, Any]) -> str:
    lines = []
    for block in ref["settings"]:
        lines.append(f"{block['tiles']} tiles, {block['budget']} looks, {block['episodes']} episodes, mean start score "
                     f"{block['mean_start_score']:.4f}, looks per episode {block['looks_per_episode']}")
        lines.append(f"  {'player':30s}{'gain':>9s}{'final':>9s}{'sd over ep':>11s}{'least':>9s}{'most':>9s}{'ep > 0':>7s}{'elsewhere':>10s}{'empty':>7s}")
        for name, x in block["agents"].items():
            label = name + (f" (tile {x['tile']})" if "tile" in x else "")
            sd = "" if x["sd_across_episodes"] is None else f"{x['sd_across_episodes']:.4f}"
            lines.append(f"  {label:30s}{x['mean_gain']:+9.4f}{x['mean_final_score']:9.4f}{sd:>11s}"
                         f"{x['least_and_most_over_episodes'][0]:+9.4f}{x['least_and_most_over_episodes'][1]:+9.4f}{x['episodes_with_a_gain']:7d}"
                         f"{x['mean_gain_on_cells_never_shown']:+10.4f}{x['share_of_looks_that_revealed_nothing']:7.2f}")
        lines.append("  constant tiles, mean gain: " + " ".join(f"{v:+.4f}" for v in block["constant_tiles_mean_gain"]))
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    from backend.firms import read_firms, region_box
    from backend.model.fitted import load_params
    from backend.terrain.live_region import PRESET_BY_ID

    args = [a for a in argv[1:] if not a.startswith("--")]
    out_path = args[0] if args else None
    schedule = next((a.split("=", 1)[1] for a in argv[1:] if a.startswith("--schedule=")), SCHEDULE)
    workers = next((int(a.split("=", 1)[1]) for a in argv[1:] if a.startswith("--workers=")), None)
    measured = next((a.split("=", 1)[1] for a in argv[1:] if a.startswith("--record-from=")), None)
    if measured:                          # record a table this tool measured earlier; nothing is played
        with open(measured, encoding="utf-8") as fh:
            doc = json.load(fh)
        tracked = load_fitted() or {}
        record_table(tracked, doc)
        FITTED_FILE.write_text(json.dumps(tracked, indent=1) + "\n", encoding="utf-8")
        print(f"recorded {measured} as validation_reference in {FITTED_FILE.name}")
        return 0
    t0 = time.time()
    episodes = catalogue(read_firms, region_box, PRESET_BY_ID)
    train, val = fit_split(episodes)
    closed = [e for e in episodes if not may_be_played(e)]
    print(f"catalogue: {len(episodes)} episodes; {len(train)} train and {len(val)} validation may be played, "
          f"{len(closed)} are closed ({sum(1 for e in closed if e.split == 'test')} test episodes and "
          f"{sum(1 for e in closed if e.split == 'fit')} other windows of the test fires' regions and year)", flush=True)
    params = load_params()
    tracked = load_fitted() or {}
    policy = tracked.get("policy")
    ref = reference_table(val, params, schedule=schedule, policy=policy, train_episodes=train, workers=workers,
                          log=lambda m: print(m, flush=True))
    print(format_table(ref))
    main_block = next(b for b in ref["settings"] if (b["tiles"], b["budget"]) == (f"{MAIN_SETTING[0]}x{MAIN_SETTING[0]}", MAIN_SETTING[1]))
    when = bool(((policy or {}).get("when") or {}).get("adopted"))
    doc = {
        "what": "reference players of the next-look environment on the validation episodes",
        "known_limits": KNOWN_LIMITS,
        "reward": REWARD,
        "schedule": "+".join(main_block["looks_from"]),
        "schedule_asked_for": ref["schedule"],
        "spending": (
            "a player that does not choose when to look spends the budget on the same looks as every other such player, "
            "spread evenly over the episode, and only the tile differs. least_sure_at_night, least_sure_when_unsure and "
            "least_sure_when_sharp choose when" + (", and so does learned; learned_tiles_only is its tile choice on the evenly spread looks" if when else "")
        ),
        "oracle": SEES_THE_ANSWER,
        "learned": None if policy is None else {
            "fitted_with": policy.get("fitted_with") or "the first policy: " + str((tracked.get("protocol") or {}).get("note", "")),
            "chooses_when_to_look": when,
            "played_here": "once, with the policy as recorded before this table was measured",
        },
        "reconstruction_parameters": params.fitted_on,
        "episodes": {
            "played": "validation: the episodes of 2024 and 2025 that may be played",
            "validation": len(val), "training": len(train), "closed_and_not_played": len(closed),
            "validation_keys": [e.key for e in val],
            "training_use": "the constant tiles only, to name the constant tile that gains most there",
        },
        "random_seeds": ref["random_seeds"],
        "score": ref["score"],
        **{k: main_block[k] for k in ("tiles", "budget", "mean_start_score", "looks_per_episode", "agents",
                                      "constant_tiles_mean_gain", "differences", "per_episode", "random_mean_gain_by_seed")},
        "plainly": plainly(main_block),
        "other_settings": [{k: b[k] for k in ("tiles", "budget", "episodes", "mean_start_score", "looks_per_episode", "agents",
                                              "constant_tiles_mean_gain", "differences")}
                           for b in ref["settings"] if b is not main_block],
        "seconds": round(time.time() - t0, 1),
    }
    for s in doc["plainly"]:
        print(s)
    if out_path:
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, indent=1)
            fh.write("\n")
    if "--record" in argv:
        record_table(tracked, doc)
        FITTED_FILE.write_text(json.dumps(tracked, indent=1) + "\n", encoding="utf-8")
        print(f"recorded as validation_reference in {FITTED_FILE.name}")
    return 0


def record_table(tracked: dict[str, Any], doc: dict[str, Any]) -> None:
    """Put a measured table into the tracked document as `validation_reference`. A table measured on the nominal
    slots is not thrown away when one measured on the pass list replaces it: it stays beside it, named for its
    looks, so that the two can be read against each other."""
    old = tracked.get("validation_reference")
    if old and old.get("schedule") == "nominal" and doc.get("schedule") != "nominal":
        tracked["validation_reference_on_nominal_looks"] = {
            "note": (
                "measured before the pass list became the default schedule: nominal half-day slots, and the first "
                "policy's weights as the learned player"
            ),
            **old,
        }
    tracked["validation_reference"] = doc


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
