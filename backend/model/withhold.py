"""What a held-out run's first answer leaves out until the reveal. The server's route and the browser's entry point
(`backend/browser.py`) withhold by the same function, so the two first answers hold the same keys."""

from __future__ import annotations

from typing import Any

REVEAL_WITH: str = 'POST /api/reconstruct again with the same body and "reveal": true'


def withhold_scorer_keys(resp: dict[str, Any], reveal_with: str = REVEAL_WITH) -> dict[str, Any]:
    """A held-out run's response without what the scorer wrote from the hidden rows, until the page asks for the
    reveal. The paths are the run's own declaration (`hidden_rows.payload_keys_from_the_scorer`), with
    `blind_test` and every name in `metrics.from_hidden_rows` added in case the declaration misses one. Nested
    objects are copied before a key is removed, so the stored run is never changed. `reveal_with` says how the
    reveal is asked for: the server's route by default."""
    hr = resp.get("hidden_rows") if isinstance(resp.get("hidden_rows"), dict) else {}
    paths = list(hr.get("payload_keys_from_the_scorer") or [])
    paths.append("blind_test")
    paths += [f"metrics.{k}" for k in ((resp.get("metrics") or {}).get("from_hidden_rows") or [])]
    out = dict(resp)
    withheld: list[str] = []
    for path in dict.fromkeys(paths):
        parts = path.split(".")
        parent = out
        for name in parts[:-1]:
            child = parent.get(name)
            if not isinstance(child, dict):
                parent = None
                break
            parent[name] = dict(child)
            parent = parent[name]
        if parent is not None and parts[-1] in parent:
            del parent[parts[-1]]
            withheld.append(path)
    out["hidden_rows"] = {**hr, "withheld_until_reveal": withheld, "reveal_with": reveal_with}
    return out
