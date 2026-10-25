#!/usr/bin/env python3
"""Loopback-only, read-only maintenance HTTP server."""
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from adapters.qa_cli import AdapterError, QaCliAdapter
from adapters.ros_diagnostics import RosDiagnosticsAdapter

HOST = os.environ.get("TURRET_WEB_HOST", "127.0.0.1")
PORT = int(os.environ.get("TURRET_WEB_PORT", "8080"))
STATIC = Path(os.environ.get("TURRET_WEB_STATIC", Path(__file__).parent / "static"))
if not os.environ.get("TURRET_WEB_STATIC") and not STATIC.is_dir():
    STATIC = Path(__file__).resolve().parents[1] / "frontend" / "dist"
MOCK_MODE = os.environ.get("TURRET_WEB_MODE", "real").lower() == "mock"


def service_action(action):
    commands = {
        "start": "start",
        "stop": "stop",
        "restart": "restart",
    }
    command = commands.get(action)
    if command is None:
        raise ValueError("Unsupported service action")
    try:
        result = subprocess.run(
            ["/usr/bin/sudo", "-n", "/usr/bin/systemctl", command, "turret.service"],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise AdapterError(f"systemctl {command} turret.service timed out") from exc
    except OSError as exc:
        raise AdapterError(f"Could not {command} turret.service: {exc}") from exc
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise AdapterError(f"Could not {command} turret.service: {detail or result.returncode}")


class Handler(BaseHTTPRequestHandler):
    qa = QaCliAdapter(mock=MOCK_MODE)
    ros = RosDiagnosticsAdapter(mock=MOCK_MODE)

    def respond(self, code, payload, headers=None):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def serve_static(self, path):
        if path == "/":
            file = STATIC / "index.html"
            mime = "text/html; charset=utf-8"
        elif path.startswith("/assets/"):
            file = (STATIC / path.lstrip("/")).resolve()
            if not file.is_relative_to(STATIC.resolve()):
                return self.respond(404, {"error": "Asset not found"})
            mime = ("text/javascript" if file.suffix == ".js"
                    else "text/css" if file.suffix == ".css"
                    else "application/octet-stream")
        else:
            return self.respond(404, {"error": "Not found"})

        if not file.is_file():
            return self.respond(503 if path == "/" else 404,
                                {"error": "Frontend not built" if path == "/" else "Asset not found"})
        data = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.headers.get("Host") not in {
            f"localhost:{PORT}",
            f"127.0.0.1:{PORT}",
        }:
            return self.respond(403, {"error": "Invalid host"})
        path = urlparse(self.path).path
        if path in {"/", "/assets/"} or path.startswith("/assets/"):
            return self.serve_static(path)

        try:
            if path == "/api/health":
                return self.respond(200, {"ok": True, "mode": "mock" if MOCK_MODE else "real"})
            if path == "/api/info":
                return self.respond(200, {
                    **self.qa.info(),
                    "mock": MOCK_MODE,
                })
            if path == "/api/status":
                return self.respond(200, {
                    **self.qa.status(),
                    "mock": MOCK_MODE,
                })
            if path == "/api/logs":
                return self.respond(200, {
                    **self.qa.logs(),
                    "mock": MOCK_MODE,
                })
            if path == "/api/diagnostics":
                return self.respond(200, {
                    "ros": self.ros.snapshot(),
                    "sampled_at": datetime.now(timezone.utc).isoformat(),
                    "mock": MOCK_MODE,
                })
            if path == "/api/diagnostics/export":
                report = self.diagnostic_report()
                filename = f"robot-diagnostics-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json"
                return self.respond(200, report, {
                    "Content-Disposition": f'attachment; filename="{filename}"',
                })
        except AdapterError as exc:
            return self.respond(503, {"error": str(exc)})
        return self.respond(404, {"error": "Not found"})

    def diagnostic_report(self):
        result = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mock": MOCK_MODE,
            "notice": "This report contains product identifiers and recent service logs.",
            "sections": {},
        }
        for name, read in (
            ("info", self.qa.info),
            ("service", self.qa.status),
            ("logs", self.qa.logs),
        ):
            try:
                result["sections"][name] = read()
            except AdapterError as exc:
                result["sections"][name] = {"available": False, "error": str(exc)}
        result["sections"]["ros"] = self.ros.snapshot()
        return result

    def do_POST(self):
        action = urlparse(self.path).path.removeprefix("/api/")
        if action not in {"start", "stop", "restart"} or urlparse(self.path).path != f"/api/{action}":
            return self.respond(404, {"error": "Not found"})
        if MOCK_MODE:
            return self.respond(403, {"error": "Service actions are disabled in mock mode"})
        if self.headers.get("Host") not in {
            f"localhost:{PORT}",
            f"127.0.0.1:{PORT}",
        }:
            return self.respond(403, {"error": "Invalid host"})
        if self.headers.get("Origin") not in {
            f"http://localhost:{PORT}",
            f"http://127.0.0.1:{PORT}",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        }:
            return self.respond(403, {"error": "Invalid origin"})
        try:
            service_action(action)
        except AdapterError as exc:
            return self.respond(500, {"error": str(exc)})
        except ValueError as exc:
            return self.respond(400, {"error": str(exc)})
        return self.respond(200, {"ok": True, "action": action})

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")


def main():
    if MOCK_MODE:
        print("[WARN] TURRET_WEB_MODE=mock: displaying synthetic development data")
    Handler.ros.start()
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
        print(f"Robot UI listening on http://{HOST}:{PORT}")
        server.serve_forever()
    finally:
        Handler.ros.stop()


if __name__ == "__main__":
    main()
