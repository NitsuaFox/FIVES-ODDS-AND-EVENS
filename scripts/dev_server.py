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
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# Bind to all interfaces. "::" is the IPv6 wildcard; combined with a dual-stack
# socket (IPV6_V6ONLY disabled) it also accepts IPv4 clients. This matters
# because browsers frequently resolve "localhost" to IPv6 ::1 first: an
# IPv4-only server (0.0.0.0) then answers 127.0.0.1 but refuses ::1, which
# surfaces in the browser as ERR_CONNECTION_REFUSED.
DEFAULT_HOST = "::"
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


class DualStackHTTPServer(ThreadingHTTPServer):
    """Threading HTTP server that serves IPv4 and IPv6 clients from one socket.

    When bound to the IPv6 wildcard ("::") we disable IPV6_V6ONLY so the same
    listener also accepts IPv4 connections (via IPv4-mapped addresses). This
    avoids ERR_CONNECTION_REFUSED when a browser reaches the server over ::1.
    """

    address_family = socket.AF_INET6

    def server_bind(self) -> None:
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            log.debug("dual-stack enabled (IPV6_V6ONLY=0)")
        except (AttributeError, OSError) as exc:
            log.debug("could not enable dual-stack, IPv6-only listener: %s", exc)
        super().server_bind()


def build_server(host: str, port: int, handler) -> ThreadingHTTPServer | None:
    """Create the dev server, preferring a dual-stack IPv6 listener.

    Falls back to a plain IPv4 server when IPv6 is unavailable so the dev
    server still comes up on hosts without IPv6 support.
    """
    try:
        server = DualStackHTTPServer((host, port), handler)
        log.debug("bound dual-stack server on [%s]:%s", host, port)
        return server
    except OSError as exc:
        log.warning("dual-stack bind on [%s]:%s failed (%s); trying IPv4", host, port, exc)

    try:
        server = ThreadingHTTPServer(("0.0.0.0", port), handler)
        log.debug("bound IPv4 server on 0.0.0.0:%s", port)
        return server
    except OSError as exc:
        log.error("failed to bind port %s on IPv4 and IPv6 -> %s", port, exc)
        return None


def main() -> int:
    host = os.environ.get("FOE_HOST", DEFAULT_HOST)
    port = int(os.environ.get("FOE_PORT", DEFAULT_PORT))

    log.debug("starting FOE dev server")
    log.debug("serving directory: %s", REPO_ROOT)
    log.debug("bind host=%s port=%s", host, port)

    handler = partial(DebugRequestHandler, directory=REPO_ROOT)

    httpd = build_server(host, port, handler)
    if httpd is None:
        return 1

    log.debug("listening on socket %s", httpd.socket.getsockname())
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
