"""The live test's answer over HTTP, read only.

  uv run --no-project --python 3.12 --with numpy --with pillow python3 backend/server_live.py \\
      --live-dir <live folder> --host 127.0.0.1 --port 9388

GET /api/live answers `backend.live.answer.build` of the live folder: every seal with its state, times, digest and
scores, and the running count against the two baselines. The answer is built from the logs at each request; the
server writes nothing. `live_route(live_dir)` gives the same answer to a caller that mounts it elsewhere.
"""

from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.live.answer import build  # noqa: E402


def live_route(live_dir: Path) -> dict[str, Any]:
    return build(live_dir)


def make_handler(live_dir: Path) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def _send(self, code: int, body: dict[str, Any]) -> None:
            data = json.dumps(body, sort_keys=True).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:  # noqa: N802
            if self.path.split("?")[0] != "/api/live":
                self._send(404, {"error": "not found", "routes": ["/api/live"]})
                return
            try:
                self._send(200, live_route(live_dir))
            except Exception as exc:  # noqa: BLE001
                self._send(500, {"error": f"{type(exc).__name__}: {exc}"})

        def log_message(self, *a: Any) -> None:
            pass

    return Handler


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Serve the live test's answer.")
    ap.add_argument("--live-dir", type=Path, required=True)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=9388)
    args = ap.parse_args(argv)
    ThreadingHTTPServer((args.host, args.port), make_handler(args.live_dir.resolve())).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
