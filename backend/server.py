#!/usr/bin/env python3
"""Authenticated maintenance HTTP server."""
import json
import os
import re
import signal
import threading
import subprocess
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from auth import AuthManager, session_cookie
from adapters.qa_cli import LOG_RANGES, AdapterError, QaCliAdapter
from adapters.ros_diagnostics import RosDiagnosticsAdapter
from adapters.system_metrics import SystemMetricsAdapter

HOST = os.environ.get("TURRET_WEB_HOST", "127.0.0.1")
PORT = int(os.environ.get("TURRET_WEB_PORT", "8080"))
STATIC = Path(os.environ.get("TURRET_WEB_STATIC", Path(__file__).parent / "static"))
if not os.environ.get("TURRET_WEB_STATIC") and not STATIC.is_dir():
    STATIC = Path(__file__).resolve().parents[1] / "frontend" / "dist"
MOCK_MODE = os.environ.get("TURRET_WEB_MODE", "real").lower() == "mock"
AUTH = AuthManager()


def allowed_hosts():
    configured = os.environ.get("TURRET_WEB_ALLOWED_HOSTS", "")
    hosts = {"localhost", "127.0.0.1"}
    hosts.update(host.strip() for host in configured.split(",") if host.strip())
    return {f"{host}:{PORT}" for host in hosts}


def allowed_origins():
    origins = {
        *(f"http://{host}" for host in allowed_hosts()),
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    }
    origins.update(origin.strip().rstrip("/") for origin in
                   os.environ.get("TURRET_WEB_ALLOWED_ORIGINS", "").split(",")
                   if origin.strip())
    return origins


def allowed_request_hosts():
    hosts = set(allowed_hosts())
    for origin in allowed_origins():
        parsed = urlparse(origin)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            hosts.add(parsed.netloc)
    return hosts


def web_ui_build_info():
    path = Path(__file__).with_name("build-info.json")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"build_date": None}
    except (OSError, json.JSONDecodeError) as exc:
        raise AdapterError(f"Could not read Web UI build metadata {path}: {exc}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("build_date"), str):
        raise AdapterError(f"Invalid Web UI build metadata: {path}")
    return {"build_date": data["build_date"]}


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
    system = SystemMetricsAdapter(mock=MOCK_MODE)
    auth = AUTH

    def is_authenticated(self):
        return self.auth.authenticated(self.headers.get("Cookie"))

    def secure_cookie(self):
        return self.headers.get("X-Forwarded-Proto") == "https" and os.environ.get("TURRET_WEB_TRUST_PROXY") == "1"

    def valid_host(self):
        return self.headers.get("Host") in allowed_request_hosts()

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
        if not self.valid_host():
            return self.respond(403, {"error": "Invalid host"})
        path = urlparse(self.path).path
        if path in {"/", "/assets/"} or path.startswith("/assets/"):
            return self.serve_static(path)

        if path == "/api/auth/session":
            return self.respond(200, {"authenticated": self.is_authenticated()})
        if path.startswith("/api/") and not self.is_authenticated():
            return self.respond(401, {"error": "Authentication required"})

        try:
            if path == "/api/health":
                return self.respond(200, {"ok": True, "mode": "mock" if MOCK_MODE else "real"})
            if path == "/api/info":
                return self.respond(200, {
                    **self.qa.info(),
                    "host": self.system.identity(),
                    "web_ui": web_ui_build_info(),
                    "mock": MOCK_MODE,
                })
            if path == "/api/status":
                return self.respond(200, {
                    **self.qa.status(),
                    "mock": MOCK_MODE,
                })
            if path == "/api/logs":
                log_range = parse_qs(urlparse(self.path).query).get("range", ["1h"])[0]
                if log_range not in LOG_RANGES:
                    return self.respond(400, {"error": "Unsupported log time range"})
                return self.respond(200, {
                    **self.qa.logs(log_range),
                    "mock": MOCK_MODE,
                })
            if path == "/api/diagnostics":
                return self.respond(200, {
                    "ros": self.ros.snapshot(),
                    "system": self.system.snapshot(),
                    "sampled_at": datetime.now(timezone.utc).isoformat(),
                    "mock": MOCK_MODE,
                })
        except AdapterError as exc:
            return self.respond(503, {"error": str(exc)})
        return self.respond(404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        if not self.valid_host():
            return self.respond(403, {"error": "Invalid host"})
        if self.headers.get("Origin") not in allowed_origins():
            return self.respond(403, {"error": "Invalid origin"})
        if path == "/api/auth/login":
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if size < 1 or size > 4096:
                    return self.respond(400, {"error": "Invalid request size"})
                payload = json.loads(self.rfile.read(size))
                password = payload.get("password")
                if not isinstance(password, str) or not password or len(password) > 512:
                    return self.respond(400, {"error": "Invalid password"})
            except (ValueError, TypeError, AttributeError):
                return self.respond(400, {"error": "Invalid JSON"})
            token, error = self.auth.login(password, self.client_address[0])
            if error:
                return self.respond(429 if error.startswith("Too many") else 401, {"error": error})
            return self.respond(200, {"authenticated": True}, {
                "Set-Cookie": session_cookie(token, secure=self.secure_cookie())})
        if path == "/api/auth/activity":
            token = self.auth.touch(self.headers.get("Cookie"))
            if token is None:
                return self.respond(401, {"error": "Authentication required"})
            return self.respond(200, {"authenticated": True}, {
                "Set-Cookie": session_cookie(token, secure=self.secure_cookie())})
        if not self.is_authenticated():
            return self.respond(401, {"error": "Authentication required"})
        if path == "/api/auth/logout":
            self.auth.logout(self.headers.get("Cookie"))
            return self.respond(200, {"authenticated": False}, {
                "Set-Cookie": session_cookie("", secure=self.secure_cookie(), clear=True)})
        action = path.removeprefix("/api/")
        if action not in {"start", "stop", "restart"} or path != f"/api/{action}":
            return self.respond(404, {"error": "Not found"})
        if MOCK_MODE:
            return self.respond(403, {"error": "Service actions are disabled in mock mode"})
        try:
            service_action(action)
        except AdapterError as exc:
            return self.respond(500, {"error": str(exc)})
        except ValueError as exc:
            return self.respond(400, {"error": str(exc)})
        return self.respond(200, {"ok": True, "action": action})

    def log_message(self, fmt, *args):
        # High-frequency successful polling must not flood journald.
        if args and str(args[1] if len(args) > 1 else '') == '200':
            return
        super().log_message(fmt, *args)


def main():
    if MOCK_MODE:
        print("[WARN] TURRET_WEB_MODE=mock: displaying synthetic development data")
    Handler.ros.start()
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
        server.daemon_threads = True
        server.block_on_close = False
        shutdown_requested = threading.Event()

        def request_shutdown(signum, frame):
            # shutdown() must run from a different thread than serve_forever().
            if shutdown_requested.is_set():
                return
            shutdown_requested.set()
            threading.Thread(target=server.shutdown, name="http-shutdown", daemon=True).start()

        previous_term = signal.signal(signal.SIGTERM, request_shutdown)
        previous_int = signal.signal(signal.SIGINT, request_shutdown)
        try:
            print(f"Robot UI listening on http://{HOST}:{PORT}")
            server.serve_forever(poll_interval=0.1)
        finally:
            signal.signal(signal.SIGTERM, previous_term)
            signal.signal(signal.SIGINT, previous_int)
            server.server_close()
    finally:
        Handler.ros.stop()


if __name__ == "__main__":
    main()
