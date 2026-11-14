"""Reference results of the next-look environment on real fire episodes.

  uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.env.report <out.json>

Builds the catalogue, shows the data behind the threshold and the tile size, then plays the four reference agents on
the test episodes for several tile sizes and budgets. Every agent spends the same budget on the same looks. The
result file carries the known limits beside every number.
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
from backend.env.agents import LatestModisAgent, LeastSureAgent, OracleAgent, RandomAgent, run_episode
from backend.env.episodes import EnvEpisode, catalogue, top_tile_share, window_stats
from backend.env.next_look import NextLookEnv
from backend.model.occupancy import OccupancyParams

AGENTS: tuple[str, ...] = ("random", "least_sure", "latest_modis", "oracle")
SETTINGS: tuple[tuple[int, int], ...] = ((3, 4), (4, 4), (6, 4), (4, 2), (4, 8))     # (tiles per side, budget)
RANDOM_SEEDS: int = 10


def _play(job: tuple[EnvEpisode, int, int, dict[str, Any], int, str]) -> dict[str, Any]:
    ep, n_side, budget, pdict, seeds, score = job
    env = NextLookEnv(ep.det, ep.box, (ep.window.start_s, ep.window.end_s), tiles=(n_side, n_side), budget=budget,
                      params=OccupancyParams(**pdict), score=score)
    out: dict[str, Any] = {"episode": ep.key, "tiles": n_side, "budget": budget, "viirs_looks": env.n_looks}
    rand = [run_episode(env, RandomAgent(seed=s), seed=s) for s in range(seeds)]
    out["random"] = {"returns": [r["return"] for r in rand], "finals": [r["score_end"] for r in rand]}
    for agent in (LeastSureAgent(), LatestModisAgent(), OracleAgent()):
        r = run_episode(env, agent, seed=0)
        out[agent.name] = {"returns": [r["return"]], "finals": [r["score_end"]]}
        out["score_start"] = r["score_start"]
    return out


def reference_table(
    episodes: list[EnvEpisode], params: OccupancyParams, settings: tuple[tuple[int, int], ...] = SETTINGS,
    seeds: int = RANDOM_SEEDS, score: str = "csi", workers: int | None = None, log: Any = print,
) -> dict[str, Any]:
    """Play every agent on every episode for every setting; one table row per setting and agent."""
    jobs = [(ep, n, b, params.as_dict(), seeds, score) for (n, b) in settings for ep in episodes]
    with ProcessPoolExecutor(max_workers=workers or max(1, min(8, (os.cpu_count() or 2) - 1))) as pool:
        results = list(pool.map(_play, jobs))
    table: list[dict[str, Any]] = []
    for n, b in settings:
        rs = [r for r in results if r["tiles"] == n and r["budget"] == b]
        start = float(np.mean([r["score_start"] for r in rs]))
        oracle_gain = float(np.mean([r["oracle"]["returns"][0] for r in rs]))
        row: dict[str, Any] = {"tiles": f"{n}x{n}", "budget": b, "episodes": len(rs), "mean_start_score": round(start, 4), "agents": {}}
        for name in AGENTS:
            # mean over episodes, per seed; the spread is across seeds (only the random agent depends on the seed)
            per_seed_gain = np.mean(np.array([r[name]["returns"] for r in rs]), axis=0)
            per_seed_final = np.mean(np.array([r[name]["finals"] for r in rs]), axis=0)
            gain = float(per_seed_gain.mean())
            row["agents"][name] = {
                "mean_final_score": round(float(per_seed_final.mean()), 4),
                "mean_gain": round(gain, 4),
                "sd_of_mean_gain_across_seeds": round(float(per_seed_gain.std(ddof=1)), 4) if per_seed_gain.size > 1 else None,
                "share_of_oracle_gain": round(gain / oracle_gain, 3) if oracle_gain > 0 else None,
                "episodes_ahead_of_random": int(sum(1 for r in rs if np.mean(r[name]["returns"]) > np.mean(r["random"]["returns"]))),
            }
        ranked = sorted((a for a in AGENTS if a != "oracle"), key=lambda a: -row["agents"][a]["mean_gain"])
        row["ranking_without_oracle"] = ranked
        table.append(row)
        log(f"{n}x{n} budget {b}: " + "  ".join(f"{a} {row['agents'][a]['mean_gain']:+.4f} ({row['agents'][a]['share_of_oracle_gain']})" for a in AGENTS))
    return {"score": score, "random_seeds": seeds, "settings": table, "per_episode": results}


def format_table(ref: dict[str, Any]) -> str:
    lines = [f"{'tiles':6s}{'budget':>7s}{'episodes':>9s}{'start':>8s}   " + "".join(f"{a + ' final / gain / of oracle':>36s}" for a in AGENTS)]
    for row in ref["settings"]:
        cells = ""
        for a in AGENTS:
            x = row["agents"][a]
            sd = "" if x["sd_of_mean_gain_across_seeds"] is None else f" (sd {x['sd_of_mean_gain_across_seeds']:.4f})"
            cells += f"{x['mean_final_score']:.4f} / {x['mean_gain']:+.4f}{sd} / {x['share_of_oracle_gain']!s:>5}".rjust(36)
        lines.append(f"{row['tiles']:6s}{row['budget']:7d}{row['episodes']:9d}{row['mean_start_score']:8.4f}   {cells}")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    from backend.firms import read_firms, region_box
    from backend.model.fitted import load_params
    from backend.terrain.live_region import PRESET_BY_ID

    out_path = argv[1] if len(argv) > 1 else None
    t0 = time.time()
    every = catalogue(read_firms, region_box, PRESET_BY_ID, keep_all_windows=True)
    stats = window_stats(every)
    from backend.env.episodes import qualifies

    episodes = [e for e in every if qualifies(e.window)]
    fit = [e for e in episodes if e.split == "fit"]
    test = [e for e in episodes if e.split == "test"]
    print(f"catalogue: {len(every)} windows, {len(episodes)} episodes ({len(fit)} fit, {len(test)} test) in {time.time() - t0:.0f} s", flush=True)
    print(json.dumps(stats["by_threshold"]), flush=True)
    share = top_tile_share(fit)
    print(json.dumps(share), flush=True)
    params = load_params()
    ref = reference_table(test, params, log=lambda m: print(m, flush=True))
    print(format_table(ref))
    doc = {
        "what": "reference agents of the next-look environment on the test episodes (the three 2021 fires)",
        "known_limits": KNOWN_LIMITS,
        "reward": "gain in pooled strict CSI at 375 m of the reconstruction, before and after each look, on the real VIIRS detections still hidden after it",
        "spending": "every agent spends the budget on the same looks, spread evenly over the episode; only the tile differs",
        "oracle": "greedy: at each look it takes the tile with the largest true reward; a ceiling for these looks, not a global optimum",
        "reconstruction_parameters": params.fitted_on,
        "catalogue": {"episodes": len(episodes), "fit": len(fit), "test": len(test), "years": [min(e.year for e in episodes), max(e.year for e in episodes)],
                      "threshold_data": stats, "per_region_and_split": _count(episodes)},
        "tile_size_data": share,
        "test_episodes": [e.as_dict() for e in test],
        "results": ref,
        "seconds": round(time.time() - t0, 1),
    }
    if out_path:
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, indent=1)
            fh.write("\n")
    return 0


def _count(episodes: list[EnvEpisode]) -> dict[str, int]:
    out: dict[str, int] = {}
    for e in episodes:
        k = f"{e.region_id} {e.split}"
        out[k] = out.get(k, 0) + 1
    return out


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
