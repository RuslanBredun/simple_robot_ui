#!/usr/bin/env python3
"""Minimal loopback-only maintenance HTTP server (no pip dependencies)."""
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = os.environ.get("TURRET_WEB_HOST", "127.0.0.1")
PORT = int(os.environ.get("TURRET_WEB_PORT", "8080"))
UNIT = "turret.service"
STATIC = Path(__file__).parent / "static"


def systemctl(command):
    # Fixed allowlist: no shell, no arbitrary service names or parameters.
    if command not in {"is-active", "stop", "restart"}:
        raise ValueError("unsupported action")
    prefix = ["/usr/bin/sudo", "-n"] if command in {"stop", "restart"} else []
    return subprocess.run(prefix + ["/usr/bin/systemctl", command, UNIT],
                          capture_output=True, text=True, timeout=20)


def logs():
    return subprocess.run(["/usr/bin/journalctl", "-u", UNIT, "-n", "200",
                           "--no-pager", "-o", "short-iso"],
                          capture_output=True, text=True, timeout=20)


class Handler(BaseHTTPRequestHandler):
    def respond(self, code, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            file = STATIC / "index.html"
            if not file.is_file():
                return self.respond(503, {"error": "Frontend not built"})
            data = file.read_bytes()
            mime = "text/html; charset=utf-8"
        elif path.startswith("/assets/"):
            file = (STATIC / path.lstrip("/")).resolve()
            if not file.is_relative_to(STATIC.resolve()) or not file.is_file():
                return self.respond(404, {"error": "Asset not found"})
            data = file.read_bytes()
            mime = "text/javascript" if file.suffix == ".js" else "text/css" if file.suffix == ".css" else "application/octet-stream"
        elif path == "/api/status":
            r = systemctl("is-active")
            return self.respond(200, {"state": r.stdout.strip() or "unknown"})
        elif path == "/api/logs":
            r = logs()
            return self.respond(200 if r.returncode == 0 else 500,
                                {"logs": r.stdout[-100000:], "error": r.stderr.strip()})
        else:
            return self.respond(404, {"error": "Not found"})
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in {"/api/stop", "/api/restart"}:
            return self.respond(404, {"error": "Not found"})
        origin = self.headers.get("Origin")
        if origin not in {f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"}:
            return self.respond(403, {"error": "Invalid origin"})
        if self.headers.get("Host") not in {f"localhost:{PORT}", f"127.0.0.1:{PORT}"}:
            return self.respond(403, {"error": "Invalid host"})
        r = systemctl(path.rsplit("/", 1)[1])
        return self.respond(200 if r.returncode == 0 else 500,
                            {"ok": r.returncode == 0, "error": r.stderr.strip()})


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
