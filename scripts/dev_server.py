#!/usr/bin/env python3
"""Local development server for the FIVES, ODD'S & EVEN'S (FOE) static site.

The project is a static site (plain HTML/CSS/JS) that is deployed to Wavedash
from ./game. For local development a plain static file server over the
repository root is enough to open and play the game.

Debug logging is enabled by default so that any request/startup issue can be
copy-pasted back for troubleshooting. Disable it with FOE_DEBUG=0.
"""

from __future__ import annotations

import logging
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8000
# Directory served by the dev server: the repository root (parent of scripts/).
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(
    level=logging.DEBUG if os.environ.get("FOE_DEBUG", "1") != "0" else logging.INFO,
    format="[FOE-DEV %(asctime)s %(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("foe.dev_server")


class DebugRequestHandler(SimpleHTTPRequestHandler):
    """Static handler that logs every request for easy troubleshooting."""

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003 - stdlib name
        log.debug("request from %s: %s", self.address_string(), fmt % args)


def main() -> int:
    host = os.environ.get("FOE_HOST", DEFAULT_HOST)
    port = int(os.environ.get("FOE_PORT", DEFAULT_PORT))

    log.debug("starting FOE dev server")
    log.debug("serving directory: %s", REPO_ROOT)
    log.debug("bind host=%s port=%s", host, port)

    handler = partial(DebugRequestHandler, directory=REPO_ROOT)

    try:
        httpd = ThreadingHTTPServer((host, port), handler)
    except OSError as exc:
        log.error("failed to bind %s:%s -> %s", host, port, exc)
        return 1

    log.info("FOE dev server ready")
    log.info("Play FOE: http://localhost:%s/game/", port)
    log.info("Root:     http://localhost:%s/", port)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        log.info("shutting down dev server (keyboard interrupt)")
    finally:
        httpd.server_close()
        log.debug("server socket closed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
